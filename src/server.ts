import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ServerConfig } from "./config.ts";
import { EspnClient } from "./espn/client.ts";
import {
  ALL_PLAYER_STATUSES, AVAILABLE_STATUSES, FILTER_POSITIONS, FILTER_SLOT_BY_POSITION,
  FREE_AGENT_SORT_KEYS, LEAGUE_VIEWS, PLAYER_STATUS, SLOT_ID_BY_NAME, TRANSACTION_TYPES,
  VIEW, projectedStatId,
} from "./espn/constants.ts";
import {
  parseFreeAgents, parseLeagueInfo, parseMatchups, parseRoster, parseTeams,
  parseTransactions, summarizePlayer, teamName,
} from "./espn/parse.ts";
import {
  cancelWaiverPayload, freeAgentPayload, lineupPayload, waiverPayload,
} from "./espn/transactions.ts";
import type { TransactionPayload } from "./espn/transactions.ts";
import type { RawLeague, SearchPlayer } from "./espn/types.ts";
import { formatLeague, formatMatchups, formatPlayers, formatTransactions, formatWrite } from "./format.ts";
import {
  freeAgentSchema, leagueSchema, matchupSchema, rosterSchema, searchPlayerSchema,
  teamSchema, transactionSchema, writeOutput,
} from "./schemas.ts";

export interface ServerOptions {
  config: ServerConfig;
  fetch?: typeof fetch | undefined;
}

interface TeamWeek {
  teamId?: number | undefined;
  week?: number | undefined;
}

const weekInput = z.number().int().positive().optional().describe("NFL scoring week, defaults to the league's current scoringPeriodId.");
const teamInput = z.number().int().positive().optional().describe("ESPN fantasy team id, defaults to ESPN_TEAM_ID.");
const playerIdInput = z.number().int().refine((id) => id !== 0, "Use an ESPN player id, not 0.")
  .describe("ESPN player id. D/ST ids are negative, such as -16024 for the Chargers.");
const dryRunInput = z.boolean().default(false).describe("Preview the payload without posting it to ESPN.");
const writeInputs = { teamId: teamInput, week: weekInput, dryRun: dryRunInput };
const readAnnotations = { readOnlyHint: true, openWorldHint: true };
const writeAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };
const playerIdDescription = "Player ids are ESPN ids, including negative D/ST ids.";
const writeDescription = "teamId is an ESPN fantasy team id and defaults to ESPN_TEAM_ID. week defaults to the current NFL week. dryRun previews the payload without posting. Requires ESPN_S2 and ESPN_SWID.";

export function createServer({ config, fetch: fetchImpl }: ServerOptions): McpServer {
  const server = new McpServer({ name: "espn-fantasy-football-mcp", version: "0.1.0" });
  const client = new EspnClient({ ...config, fetch: fetchImpl });

  function resolveTeamId(teamId: number | undefined): number {
    const resolved = teamId ?? config.teamId;
    if (resolved === undefined) throw new Error("Provide teamId or configure ESPN_TEAM_ID.");
    return resolved;
  }

  async function resolveWeek(week?: number, league?: RawLeague): Promise<number> {
    const resolved = week ?? (league ?? await client.getLeague([VIEW.settings])).scoringPeriodId;
    if (resolved == null || !Number.isSafeInteger(resolved) || resolved < 1) {
      throw new Error("ESPN did not provide a valid current week. Provide week explicitly.");
    }
    return resolved;
  }

  async function loadLeague(week?: number) {
    const [league, proTeams] = await Promise.all([
      client.getLeague(LEAGUE_VIEWS, week === undefined ? undefined : { scoringPeriodId: week }),
      client.getProTeams(),
    ]);
    return { league, ctx: { week: await resolveWeek(week, league), proTeams } };
  }

  async function writeContext(args: TeamWeek) {
    if (config.readOnly) throw new Error("Writes are disabled in read-only mode.");
    const teamId = resolveTeamId(args.teamId);
    const { swid, espnS2 } = config.credentials;
    if (!swid || !espnS2) throw new Error("Writes require both ESPN_S2 and ESPN_SWID credentials.");
    return { teamId, swid, scoringPeriodId: await resolveWeek(args.week) };
  }

  async function submit(payload: TransactionPayload, dryRun: boolean): Promise<CallToolResult> {
    if (dryRun) return response({ dryRun, payload }, formatWrite(dryRun, payload));
    const result = await client.postTransaction(payload);
    return response({ dryRun, payload, result }, formatWrite(dryRun, payload, result));
  }

  server.registerTool("get_league", {
    title: "League and standings",
    description: "Inspect league settings, lineup slots, waiver rules and team standings before managing a team. Team ids identify ESPN fantasy teams.",
    inputSchema: {},
    outputSchema: { league: leagueSchema, teams: z.array(teamSchema) },
    annotations: readAnnotations,
  }, () => toolCall(async () => {
    const { league } = await loadLeague();
    const info = parseLeagueInfo(league);
    const teams = parseTeams(league);
    return response({ league: info, teams }, formatLeague(info, teams));
  }));

  server.registerTool("get_roster", {
    title: "Team roster",
    description: `Inspect a team's lineup, eligible slots, injuries, opponents and projections before making moves. teamId is an ESPN fantasy team id and defaults to ESPN_TEAM_ID. ${playerIdDescription}`,
    inputSchema: { teamId: teamInput, week: weekInput },
    outputSchema: { teamId: z.number().int(), teamName: z.string(), week: z.number().int(), players: z.array(rosterSchema) },
    annotations: readAnnotations,
  }, (args) => toolCall(async () => {
    const teamId = resolveTeamId(args.teamId);
    const { league, ctx } = await loadLeague(args.week);
    const players = parseRoster(league, teamId, ctx);
    const name = teamName(league.teams?.find((team) => team.id === teamId), teamId);
    return response({ teamId, teamName: name, week: ctx.week, players }, formatPlayers(`${name} | Week ${ctx.week}`, players));
  }));

  server.registerTool("get_free_agents", {
    title: "Free agents and waivers",
    description: `Find available players to add or claim, with optional position filters and ownership or projection sorting. ${playerIdDescription}`,
    inputSchema: {
      positions: z.array(z.enum(FILTER_POSITIONS)).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      sortBy: z.enum(["percentOwned", "percentChange", "projected"]).default("percentOwned"),
      week: weekInput,
    },
    outputSchema: { week: z.number().int(), players: z.array(freeAgentSchema) },
    annotations: readAnnotations,
  }, (args) => toolCall(async () => {
    const [week, proTeams] = await Promise.all([resolveWeek(args.week), client.getProTeams()]);
    const ctx = { week, proTeams };
    const filter = {
      players: {
        filterStatus: { value: AVAILABLE_STATUSES },
        ...(args.positions === undefined ? {} : {
          filterSlotIds: { value: args.positions.map((position) => FILTER_SLOT_BY_POSITION[position]) },
        }),
        limit: args.limit,
        offset: 0,
        [FREE_AGENT_SORT_KEYS[args.sortBy]]: {
          sortPriority: 1,
          sortAsc: false,
          ...(args.sortBy === "projected" ? { value: projectedStatId(config.season, ctx.week) } : {}),
        },
        filterRanksForScoringPeriodIds: { value: [ctx.week] },
      },
    };
    const data = await client.getLeague([VIEW.players], { scoringPeriodId: ctx.week, filter });
    const players = parseFreeAgents(data, ctx).slice(0, args.limit);
    return response({ week: ctx.week, players }, formatPlayers(`Available players | Week ${ctx.week}`, players));
  }));

  server.registerTool("search_players", {
    title: "Search players",
    description: `Look up ESPN player ids and fantasy team ownership by a case-insensitive name substring, across rosters, free agents and waivers. ${playerIdDescription}`,
    inputSchema: { query: z.string().trim().min(1), limit: z.number().int().positive().default(10) },
    outputSchema: { players: z.array(searchPlayerSchema) },
    annotations: readAnnotations,
  }, (args) => toolCall(async () => {
    const { league, ctx } = await loadLeague();
    const data = await client.getLeague([VIEW.players], {
      scoringPeriodId: ctx.week,
      filter: { players: {
        filterName: { value: args.query }, filterStatus: { value: ALL_PLAYER_STATUSES },
        // ESPN rejects a limit without a sort ("Limit request must be accompanied by a sort").
        limit: args.limit, offset: 0, [FREE_AGENT_SORT_KEYS.percentOwned]: { sortPriority: 1, sortAsc: false },
        filterRanksForScoringPeriodIds: { value: [ctx.week] },
      } },
    });
    const matches = new Map<number, SearchPlayer>();
    const query = args.query.toLowerCase();
    for (const team of league.teams ?? []) {
      for (const entry of team.roster?.entries ?? []) {
        const player = summarizePlayer({ ...entry.playerPoolEntry?.player,
          id: entry.playerPoolEntry?.player?.id ?? entry.playerId ?? entry.playerPoolEntry?.id }, ctx);
        if (player.name.toLowerCase().includes(query) && !matches.has(player.playerId)) {
          matches.set(player.playerId, {
            ...player, status: PLAYER_STATUS.onTeam, teamId: team.id ?? null, teamName: teamName(team),
          });
        }
      }
    }
    for (const { onTeamId: teamId, positionRank, overallRank, ...player } of parseFreeAgents(data, ctx)) {
      if (!player.name.toLowerCase().includes(query) || matches.has(player.playerId)) continue;
      matches.set(player.playerId, {
        ...player, teamId,
        teamName: teamId === null ? null : teamName(league.teams?.find((team) => team.id === teamId), teamId),
      });
    }
    const players = [...matches.values()].slice(0, args.limit);
    return response({ players }, formatPlayers(`Search: ${args.query}`, players));
  }));

  server.registerTool("get_matchups", {
    title: "Weekly matchups",
    description: "Check scores and live projections for a week, with the configured team's matchup marked mine. Team ids are ESPN fantasy team ids.",
    inputSchema: { week: weekInput },
    outputSchema: { week: z.number().int(), matchups: z.array(matchupSchema) },
    annotations: readAnnotations,
  }, (args) => toolCall(async () => {
    const { league, ctx } = await loadLeague(args.week);
    const matchups = parseMatchups(league, ctx.week).map((matchup) => ({
      ...matchup,
      mine: config.teamId !== undefined && (matchup.home.teamId === config.teamId || matchup.away.teamId === config.teamId),
    }));
    return response({ week: ctx.week, matchups }, formatMatchups(ctx.week, matchups));
  }));

  server.registerTool("get_transactions", {
    title: "Recent transactions",
    description: `Inspect recent league activity, newest first, and find transaction ids for cancelling pending claims. Items contain ESPN player ids only, without names. ${playerIdDescription}`,
    inputSchema: { limit: z.number().int().positive().default(25) },
    outputSchema: { transactions: z.array(transactionSchema) },
    annotations: readAnnotations,
  }, (args) => toolCall(async () => {
    const [league, data] = await Promise.all([
      client.getLeague([VIEW.teams]),
      client.getLeague([VIEW.transactions], {
        filter: { transactions: { filterType: { value: TRANSACTION_TYPES } } },
      }),
    ]);
    const transactions = parseTransactions({ ...data, teams: league.teams }).slice(0, args.limit);
    return response({ transactions }, formatTransactions(transactions));
  }));

  server.registerTool("set_lineup", {
    title: "Move lineup players",
    description: `Move rostered players to eligible slots such as QB, FLEX, BE or IR. List every move, including the player leaving an occupied slot. No counter-moves are added. ${playerIdDescription} ${writeDescription}`,
    inputSchema: { ...writeInputs, moves: z.array(z.object({ playerId: playerIdInput, slot: z.string().min(1) })).min(1) },
    outputSchema: writeOutput,
    annotations: writeAnnotations,
  }, (args) => toolCall(async () => {
    const base = await writeContext(args);
    const { league, ctx } = await loadLeague(base.scoringPeriodId);
    const roster = parseRoster(league, base.teamId, ctx);
    const moves = args.moves.map((move) => {
      const player = roster.find((entry) => entry.playerId === move.playerId);
      if (!player) throw new Error(`Player ${move.playerId} is not on team ${base.teamId}'s roster.`);
      const toSlotId = SLOT_ID_BY_NAME[move.slot];
      if (toSlotId === undefined || !player.eligibleSlots.includes(move.slot)) {
        throw new Error(`${player.name} is not eligible for slot ${move.slot}. Eligible slots: ${player.eligibleSlots.join(", ")}.`);
      }
      return { playerId: move.playerId, fromSlotId: player.slotId, toSlotId };
    });
    return submit(lineupPayload({ ...base, moves }), args.dryRun);
  }));

  server.registerTool("add_player", {
    title: "Add a free agent",
    description: `Add an available free agent, optionally dropping a rostered player in the same transaction. Use submit_waiver_claim for players on waivers. ${playerIdDescription} ${writeDescription}`,
    inputSchema: { ...writeInputs, playerId: playerIdInput, dropPlayerId: playerIdInput.optional() },
    outputSchema: writeOutput,
    annotations: writeAnnotations,
  }, (args) => toolCall(async () => submit(freeAgentPayload({
    ...await writeContext(args), addPlayerId: args.playerId, dropPlayerId: args.dropPlayerId,
  }), args.dryRun)));

  server.registerTool("drop_player", {
    title: "Drop a rostered player",
    description: `Release one player from your fantasy team. ESPN enforces roster locks and league rules. ${playerIdDescription} ${writeDescription}`,
    inputSchema: { ...writeInputs, playerId: playerIdInput },
    outputSchema: writeOutput,
    annotations: writeAnnotations,
  }, (args) => toolCall(async () => submit(freeAgentPayload({
    ...await writeContext(args), dropPlayerId: args.playerId,
  }), args.dryRun)));

  server.registerTool("submit_waiver_claim", {
    title: "Submit a waiver claim",
    description: `Claim a player on waivers with an optional drop and a nonnegative bid, defaulting to 0. ESPN processes the claim under league rules. ${playerIdDescription} ${writeDescription}`,
    inputSchema: {
      ...writeInputs, playerId: playerIdInput, dropPlayerId: playerIdInput.optional(),
      bid: z.number().int().nonnegative().default(0),
    },
    outputSchema: writeOutput,
    annotations: writeAnnotations,
  }, (args) => toolCall(async () => submit(waiverPayload({
    ...await writeContext(args), addPlayerId: args.playerId, dropPlayerId: args.dropPlayerId, bid: args.bid,
  }), args.dryRun)));

  server.registerTool("cancel_waiver_claim", {
    title: "Cancel a waiver claim",
    description: `Cancel a pending waiver claim using its ESPN transactionId from get_transactions. ${writeDescription}`,
    inputSchema: { ...writeInputs, transactionId: z.string().min(1) },
    outputSchema: writeOutput,
    annotations: writeAnnotations,
  }, (args) => toolCall(async () => submit(cancelWaiverPayload({
    ...await writeContext(args), transactionId: args.transactionId,
  }), args.dryRun)));

  return server;
}

function response(structuredContent: Record<string, unknown>, text: string): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent };
}

async function toolCall(run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] };
  }
}
