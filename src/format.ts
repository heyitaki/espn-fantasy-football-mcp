import { ACTIVE_INJURY_STATUS, ITEM_TYPE } from "./espn/constants.ts";
import type { LeagueInfo, Matchup, TeamSummary, TransactionSummary } from "./espn/parse.ts";
import type { TransactionPayload } from "./espn/transactions.ts";
import type { PlayerSummary } from "./espn/types.ts";

type DisplayPlayer = PlayerSummary & {
  slot?: string | undefined;
  status?: string | undefined;
  teamName?: string | null | undefined;
};

export function formatPlayers(title: string, players: DisplayPlayer[]): string {
  if (!players.length) return `${title}\nNo players found.`;
  const showStatus = players.some((player) => player.status !== undefined);
  const showOwner = players.some((player) => player.teamName !== undefined);
  return `${title}\n${table([
    ["ID", "SLOT", "NAME", "POS", "TEAM", "OPP", "INJURY", "PROJ", ...(showStatus ? ["STATUS"] : []), ...(showOwner ? ["FANTASY TEAM"] : [])],
    ...players.map((player) => [
      String(player.playerId), player.slot ?? "-", player.name, player.position, player.proTeam ?? "-",
      player.opponent ?? "-", player.injuryStatus === ACTIVE_INJURY_STATUS ? "-" : player.injuryStatus ?? "-",
      decimal(player.projectedPoints), ...(showStatus ? [player.status ?? "-"] : []),
      ...(showOwner ? [player.teamName ?? "-"] : []),
    ]),
  ])}`;
}

export function formatLeague(league: LeagueInfo, teams: TeamSummary[]): string {
  const slots = Object.entries(league.lineupSlots).map(([slot, count]) => `${slot}: ${count}`).join(", ");
  return [
    `${league.name} | League ${league.leagueId ?? "?"} | ${league.season ?? "?"} | Week ${league.currentWeek ?? "?"}`,
    `Lineup: ${slots || "Unknown"}`,
    `Waivers: ${league.waivers.type ?? "Unknown"} | Budget: ${league.waivers.usesBudget ? decimal(league.waivers.budget) : "Off"} | Wait: ${league.waivers.waiverHours ?? "?"} hours`,
    `Regular season: ${league.regularSeasonWeeks ?? "?"} weeks | Playoff teams: ${league.playoffTeams ?? "?"}`,
    `Trade deadline: ${league.trades.deadline ?? "Unknown"} | Veto votes: ${league.trades.vetoVotesRequired ?? "?"}`,
    table([
      ["ID", "TEAM", "OWNERS", "W-L-T", "PF", "PA", "WAIVER", "SEED", "STREAK"],
      ...teams.map((team) => [
        String(team.teamId), team.name, team.owners.join(", "),
        `${team.record.wins}-${team.record.losses}-${team.record.ties}`,
        decimal(team.pointsFor), decimal(team.pointsAgainst), String(team.waiverRank ?? "-"),
        String(team.playoffSeed ?? "-"), team.streak,
      ]),
    ]),
  ].join("\n");
}

export function formatMatchups(week: number, matchups: Array<Matchup & { mine: boolean }>): string {
  if (!matchups.length) return `Week ${week}: no matchups found.`;
  return `Week ${week}\n${table([
    ["MINE", "ID", "HOME", "PTS", "PROJ", "AWAY", "PTS", "PROJ", "WINNER"],
    ...matchups.map((matchup) => [
      matchup.mine ? "*" : "", String(matchup.matchupId ?? "-"),
      `${matchup.home.name} (${matchup.home.teamId ?? "-"})`, decimal(matchup.home.points), decimal(matchup.home.projectedPoints),
      `${matchup.away.name} (${matchup.away.teamId ?? "-"})`, decimal(matchup.away.points), decimal(matchup.away.projectedPoints),
      matchup.winner,
    ]),
  ])}`;
}

export function formatTransactions(transactions: TransactionSummary[]): string {
  if (!transactions.length) return "No transactions found.";
  return table([
    ["ID", "TYPE", "STATUS", "TEAM", "WEEK", "BID", "PROCESSED", "ITEMS"],
    ...transactions.map((transaction) => [
      String(transaction.id ?? "-"), transaction.type ?? "-", transaction.status ?? "-",
      transaction.teamName ?? "-", String(transaction.scoringPeriodId ?? "-"), decimal(transaction.bidAmount),
      transaction.processDate ?? "-", transaction.items.map((item) => (
        `${item.type ?? "?"} ${item.playerId ?? "?"} (${item.fromTeamId ?? "-"} -> ${item.toTeamId ?? "-"})`
      )).join(", "),
    ]),
  ]);
}

export function formatWrite(dryRun: boolean, payload: TransactionPayload, result?: unknown): string {
  const lines = [
    `${dryRun ? "Dry run" : "Submitted"}: ${payload.type} ${payload.executionType} | Team ${payload.teamId} | Week ${payload.scoringPeriodId}`,
  ];
  if ("items" in payload) {
    for (const item of payload.items) {
      if (item.type === ITEM_TYPE.lineup) {
        lines.push(`Player ${item.playerId}: slot ${item.fromLineupSlotId} -> ${item.toLineupSlotId}`);
      } else {
        lines.push(`${item.type} player ${item.playerId}`);
      }
    }
  }
  if ("bidAmount" in payload) lines.push(`Bid: ${decimal(payload.bidAmount)}`);
  if ("relatedTransactionId" in payload) lines.push(`Transaction: ${payload.relatedTransactionId}`);
  if (result !== undefined) lines.push(`ESPN result: ${JSON.stringify(result)}`);
  return lines.join("\n");
}

function decimal(value: number | null): string {
  return value === null ? "-" : value.toFixed(1);
}

function table(rows: string[][]): string {
  const clean = rows.map((row) => row.map((cell) => cell.replace(/[\u0000-\u001f\u007f]/g, " ")));
  const widths = (clean[0] ?? []).map((_, index) => Math.max(...clean.map((row) => row[index]?.length ?? 0)));
  return clean.map((row) => row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ").trimEnd()).join("\n");
}
