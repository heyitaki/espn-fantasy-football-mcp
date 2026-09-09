import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.ts";
import { loadConfig } from "../src/config.ts";
import { fakeFetch, fixture, ESPN_S2, SWID, LEAGUE_PATH } from "./helpers.ts";

interface ToolResult {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
}

function routes(extra: Record<string, unknown> = {}) {
  return {
    "/transactions/": { id: "tx-9", status: "EXECUTED", memberId: SWID },
    "kona_player_info": fixture("free-agents.json"),
    [LEAGUE_PATH]: fixture("league.json"),
    "/seasons/2026?": fixture("pro-teams.json"),
    ...extra,
  };
}

async function connect(opts: { readOnly?: boolean; teamId?: number; routes?: Record<string, unknown> } = {}) {
  const fake = fakeFetch(routes(opts.routes));
  const server = createServer({
    config: {
      leagueId: 123456,
      season: 2026,
      teamId: "teamId" in opts ? opts.teamId : 7,
      credentials: { espnS2: ESPN_S2, swid: SWID },
      readOnly: opts.readOnly ?? false,
    },
    fetch: fake.fetch,
  });
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as ToolResult;
  return { client, call, fake, close: () => Promise.all([client.close(), server.close()]) };
}

test("loadConfig reads the environment and defaults the season to the current year", () => {
  const cfg = loadConfig({ ESPN_LEAGUE_ID: "123456", ESPN_S2: ESPN_S2, ESPN_SWID: SWID, ESPN_TEAM_ID: "7" });
  assert.equal(cfg.leagueId, 123456);
  assert.equal(cfg.teamId, 7);
  assert.equal(cfg.season, new Date().getFullYear());
  assert.equal(cfg.readOnly, false);
  assert.deepEqual(cfg.credentials, { espnS2: ESPN_S2, swid: SWID });

  const ro = loadConfig({ ESPN_LEAGUE_ID: "123456", ESPN_SEASON: "2025", ESPN_READ_ONLY: "1" });
  assert.equal(ro.season, 2025);
  assert.equal(ro.readOnly, true);
  assert.equal(ro.teamId, undefined);
  assert.deepEqual(ro.credentials, {});

  assert.throws(() => loadConfig({}), /ESPN_LEAGUE_ID/);
});

test("lists the full tool set", async () => {
  const { client, close } = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    [
      "add_player",
      "cancel_waiver_claim",
      "drop_player",
      "get_free_agents",
      "get_league",
      "get_matchups",
      "get_roster",
      "get_transactions",
      "search_players",
      "set_lineup",
      "submit_waiver_claim",
    ],
  );
  for (const tool of tools) {
    assert.ok(tool.description && tool.description.length > 20, `${tool.name} needs a description`);
  }
  await close();
});

test("get_league returns league info and teams", async () => {
  const { call, close } = await connect();
  const res = await call("get_league");
  assert.equal(res.isError, undefined);
  const sc = res.structuredContent as { league: { name: string; currentWeek: number }; teams: Array<{ teamId: number; waiverRank: number }> };
  assert.equal(sc.league.name, "Test League");
  assert.equal(sc.league.currentWeek, 5);
  assert.equal(sc.teams.find((t) => t.teamId === 7)!.waiverRank, 9);
  await close();
});

test("get_roster defaults to the configured team and the current week", async () => {
  const { call, fake, close } = await connect();
  const res = await call("get_roster");
  const sc = res.structuredContent as { teamId: number; week: number; players: Array<{ name: string; slot: string; opponent: string | null }> };
  assert.equal(sc.teamId, 7);
  assert.equal(sc.week, 5);
  assert.equal(sc.players.length, 11);
  assert.equal(sc.players[0]!.name, "Josh Allen");
  assert.equal(sc.players.find((p) => p.name === "Xavier Worthy")!.opponent, "BYE");
  // The text content is a readable summary, not a JSON dump.
  assert.match(res.content[0]!.text!, /Josh Allen/);
  // Without a week, one league fetch with ESPN's default period is enough; an explicit week is passed through.
  const rosterRequests = () => fake.requests.filter((r) => r.url.searchParams.getAll("view").includes("mRoster"));
  assert.equal(rosterRequests().length, 1);
  assert.equal(rosterRequests()[0]!.url.searchParams.get("scoringPeriodId"), null);
  await call("get_roster", { week: 4 });
  assert.equal(rosterRequests()[1]!.url.searchParams.get("scoringPeriodId"), "4");
  await close();
});

test("get_roster for another team works and rejects unknown teams", async () => {
  const { call, close } = await connect();
  const other = await call("get_roster", { teamId: 3 });
  assert.equal((other.structuredContent as { players: unknown[] }).players.length, 1);
  const bad = await call("get_roster", { teamId: 99 });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0]!.text!, /99/);
  await close();
});

test("get_free_agents sends the ESPN filter for the requested positions", async () => {
  const { call, fake, close } = await connect();
  const res = await call("get_free_agents", { positions: ["RB", "D/ST"], limit: 25, sortBy: "percentChange" });
  const sc = res.structuredContent as { players: Array<{ name: string; status: string }> };
  assert.equal(sc.players.length, 3);
  const req = fake.requests.find((r) => r.url.searchParams.get("view") === "kona_player_info")!;
  const filter = JSON.parse(req.headers.get("x-fantasy-filter")!);
  assert.deepEqual(filter.players.filterStatus.value, ["FREEAGENT", "WAIVERS"]);
  assert.deepEqual(filter.players.filterSlotIds.value, [2, 16]);
  assert.equal(filter.players.limit, 25);
  assert.deepEqual(filter.players.sortPercChanged, { sortPriority: 1, sortAsc: false });
  await close();
});

test("get_free_agents defaults to sorting by percent owned with a sane limit", async () => {
  const { call, fake, close } = await connect();
  await call("get_free_agents");
  const req = fake.requests.find((r) => r.url.searchParams.get("view") === "kona_player_info")!;
  const filter = JSON.parse(req.headers.get("x-fantasy-filter")!);
  assert.deepEqual(filter.players.sortPercOwned, { sortPriority: 1, sortAsc: false });
  assert.equal(filter.players.limit, 50);
  assert.equal(filter.players.filterSlotIds, undefined);
  await close();
});

test("search_players finds rostered and unrostered players by name", async () => {
  const { call, fake, close } = await connect();
  const res = await call("search_players", { query: "allen" });
  const sc = res.structuredContent as { players: Array<{ name: string; teamId: number | null; teamName: string | null; status: string }> };
  const names = sc.players.map((p) => p.name).sort();
  assert.deepEqual(names, ["Braelon Allen", "Josh Allen"]);
  assert.equal(sc.players.find((p) => p.name === "Josh Allen")!.teamName, "Home Team");
  // ESPN returns 400 for a limited player query that carries no sort.
  const req = fake.requests.find((r) => r.url.searchParams.get("view") === "kona_player_info")!;
  const filter = JSON.parse(req.headers.get("x-fantasy-filter")!);
  assert.equal(filter.players.filterName.value, "allen");
  assert.deepEqual(filter.players.sortPercOwned, { sortPriority: 1, sortAsc: false });
  await close();
});

test("get_matchups returns the week's games with my matchup flagged", async () => {
  const { call, close } = await connect();
  const res = await call("get_matchups", { week: 5 });
  const sc = res.structuredContent as { week: number; matchups: Array<{ home: { teamId: number }; away: { teamId: number }; mine: boolean }> };
  assert.equal(sc.week, 5);
  assert.equal(sc.matchups.length, 1);
  assert.equal(sc.matchups[0]!.mine, true);
  await close();
});

test("set_lineup resolves slot names, computes from-slots, and posts once", async () => {
  const { call, fake, close } = await connect();
  const res = await call("set_lineup", {
    moves: [
      { playerId: 4429795, slot: "FLEX" },
      { playerId: 4683062, slot: "BE" },
    ],
  });
  assert.equal(res.isError, undefined, res.content[0]?.text);
  const post = fake.requests.find((r) => r.method === "POST")!;
  assert.deepEqual(post.body, {
    isLeagueManager: false,
    teamId: 7,
    type: "ROSTER",
    memberId: SWID,
    scoringPeriodId: 5,
    executionType: "EXECUTE",
    items: [
      { playerId: 4429795, type: "LINEUP", fromLineupSlotId: 20, toLineupSlotId: 23 },
      { playerId: 4683062, type: "LINEUP", fromLineupSlotId: 23, toLineupSlotId: 20 },
    ],
  });
  await close();
});

test("set_lineup rejects an ineligible slot and a player not on the roster without posting", async () => {
  const { call, fake, close } = await connect();
  const bad = await call("set_lineup", { moves: [{ playerId: 4360234, slot: "RB" }] });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0]!.text!, /Brandon Aubrey/);
  assert.match(bad.content[0]!.text!, /RB/);
  const missing = await call("set_lineup", { moves: [{ playerId: 1, slot: "RB" }] });
  assert.equal(missing.isError, true);
  assert.equal(fake.requests.filter((r) => r.method === "POST").length, 0);
  await close();
});

test("dryRun returns the payload and never posts", async () => {
  const { call, fake, close } = await connect();
  const res = await call("add_player", { playerId: 4697815, dropPlayerId: 4429795, dryRun: true });
  assert.equal(res.isError, undefined);
  const sc = res.structuredContent as { dryRun: boolean; payload: { type: string; items: unknown[] } };
  assert.equal(sc.dryRun, true);
  assert.equal(sc.payload.type, "FREEAGENT");
  assert.equal(sc.payload.items.length, 2);
  assert.equal(fake.requests.filter((r) => r.method === "POST").length, 0);
  await close();
});

test("add_player, drop_player and submit_waiver_claim post the expected transactions", async () => {
  const { call, fake, close } = await connect();
  const added = await call("add_player", { playerId: 4697815 });
  // The SWID that ESPN echoes back never reaches tool output.
  assert.deepEqual((added.structuredContent as { result: unknown }).result, { id: "tx-9", status: "EXECUTED" });
  assert.doesNotMatch(added.content[0]!.text!, /memberId|AAAA-BBBB/);
  await call("drop_player", { playerId: 4429795 });
  await call("submit_waiver_claim", { playerId: 4569618, dropPlayerId: 4429795, bid: 3 });
  const posts = fake.requests.filter((r) => r.method === "POST").map((r) => r.body as { type: string; bidAmount?: number; items: unknown[] });
  assert.equal(posts.length, 3);
  assert.equal(posts[0]!.type, "FREEAGENT");
  assert.deepEqual(posts[0]!.items, [{ playerId: 4697815, type: "ADD", toTeamId: 7 }]);
  assert.deepEqual(posts[1]!.items, [{ playerId: 4429795, type: "DROP", fromTeamId: 7 }]);
  assert.equal(posts[2]!.type, "WAIVER");
  assert.equal(posts[2]!.bidAmount, 3);
  await close();
});

test("cancel_waiver_claim posts a CANCEL referencing the transaction", async () => {
  const { call, fake, close } = await connect();
  await call("cancel_waiver_claim", { transactionId: "tx-9" });
  const post = fake.requests.find((r) => r.method === "POST")!.body as { executionType: string; relatedTransactionId: string };
  assert.equal(post.executionType, "CANCEL");
  assert.equal(post.relatedTransactionId, "tx-9");
  await close();
});

test("write tools are refused in read-only mode with a clear message", async () => {
  const { call, fake, close } = await connect({ readOnly: true });
  for (const [name, args] of [
    ["set_lineup", { moves: [{ playerId: 4429795, slot: "FLEX" }] }],
    ["add_player", { playerId: 4697815 }],
    ["drop_player", { playerId: 4429795 }],
    ["submit_waiver_claim", { playerId: 4569618 }],
    ["cancel_waiver_claim", { transactionId: "tx-9" }],
  ] as const) {
    const res = await call(name, args as Record<string, unknown>);
    assert.equal(res.isError, true, name);
    assert.match(res.content[0]!.text!, /read-only/i);
  }
  assert.equal(fake.requests.filter((r) => r.method === "POST").length, 0);
  await close();
});

test("write tools need a team id from config or arguments", async () => {
  const { call, close } = await connect({ teamId: undefined as unknown as number });
  const res = await call("add_player", { playerId: 4697815 });
  assert.equal(res.isError, true);
  assert.match(res.content[0]!.text!, /teamId/);
  await close();
});

test("ESPN rejections come back as tool errors carrying ESPN's message", async () => {
  const { call, close } = await connect({
    routes: { "/transactions/": { status: 400, body: { messages: ["The player is not available."] } } },
  });
  const res = await call("add_player", { playerId: 4697815 });
  assert.equal(res.isError, true);
  assert.match(res.content[0]!.text!, /not available/);
  await close();
});
