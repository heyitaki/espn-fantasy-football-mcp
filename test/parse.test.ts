import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProTeamIndex,
  parseLeagueInfo,
  parseTeams,
  parseRoster,
  parseMatchups,
  parseFreeAgents,
  summarizePlayer,
} from "../src/espn/parse.ts";
import { SLOT_ID_BY_NAME, SLOT_BY_ID, POSITION_BY_ID } from "../src/espn/constants.ts";
import { fixture } from "./helpers.ts";

const league = fixture<any>("league.json");
const proTeams = buildProTeamIndex(fixture<any>("pro-teams.json").settings.proTeams);
const freeAgents = fixture<any>("free-agents.json");
const ctx = { week: 5, proTeams };

test("constants map ESPN ids to the names players use", () => {
  assert.equal(SLOT_BY_ID[23], "FLEX");
  assert.equal(SLOT_BY_ID[20], "BE");
  assert.equal(SLOT_BY_ID[21], "IR");
  assert.equal(SLOT_ID_BY_NAME["D/ST"], 16);
  assert.equal(SLOT_ID_BY_NAME.K, 17);
  assert.equal(POSITION_BY_ID[16], "D/ST");
});

test("buildProTeamIndex exposes abbreviation, bye week and the week's game", () => {
  const buf = proTeams.get(2)!;
  assert.equal(buf.abbrev, "BUF");
  assert.equal(buf.byeWeek, 7);
  assert.equal(proTeams.get(29)!.byeWeek, 5);
});

test("parseLeagueInfo reads week, roster shape and waiver rules", () => {
  const info = parseLeagueInfo(league);
  assert.equal(info.leagueId, 3243);
  assert.equal(info.season, 2026);
  assert.equal(info.name, "Balls");
  assert.equal(info.currentWeek, 5);
  assert.equal(info.currentMatchupPeriod, 5);
  assert.equal(info.isActive, true);
  assert.equal(info.regularSeasonWeeks, 14);
  assert.equal(info.playoffTeams, 6);
  // Zero-count slots are omitted so the lineup shape reads at a glance.
  assert.deepEqual(info.lineupSlots, { QB: 1, RB: 2, WR: 2, TE: 1, "D/ST": 1, K: 1, BE: 7, IR: 1, FLEX: 1 });
  assert.equal(info.waivers.type, "WAIVERS_TRADITIONAL");
  assert.equal(info.waivers.usesBudget, false);
  assert.equal(info.waivers.waiverHours, 24);
  assert.equal(info.trades.vetoVotesRequired, 4);
  assert.equal(info.trades.deadline, new Date(1797145200000).toISOString());
});

test("parseTeams resolves owners to member names and carries waiver rank", () => {
  const teams = parseTeams(league);
  assert.equal(teams.length, 2);
  const mine = teams.find((t) => t.teamId === 7)!;
  assert.equal(mine.name, "gibb me win");
  assert.equal(mine.abbrev, "GMW");
  assert.deepEqual(mine.owners, ["manager_a"]);
  assert.deepEqual(mine.record, { wins: 3, losses: 1, ties: 0 });
  assert.equal(mine.pointsFor, 512.4);
  assert.equal(mine.pointsAgainst, 440.1);
  assert.equal(mine.waiverRank, 9);
  assert.equal(mine.playoffSeed, 2);
  assert.equal(mine.streak, "W2");
});

test("parseRoster summarizes each entry with slot, bye, opponent and projections", () => {
  const roster = parseRoster(league, 7, ctx);
  assert.equal(roster.length, 11);

  const allen = roster.find((p) => p.playerId === 3918298)!;
  assert.equal(allen.name, "Josh Allen");
  assert.equal(allen.position, "QB");
  assert.equal(allen.proTeam, "BUF");
  assert.equal(allen.slot, "QB");
  assert.equal(allen.slotId, 0);
  assert.equal(allen.byeWeek, 7);
  assert.equal(allen.opponent, "@ LAR");
  assert.equal(allen.gameTime, new Date(1791850500000).toISOString());
  assert.equal(allen.injuryStatus, "ACTIVE");
  assert.equal(allen.projectedPoints, 24.1);
  assert.equal(allen.seasonProjectedPoints, 398.2);
  assert.equal(allen.seasonPoints, 104.6);
  assert.equal(allen.percentOwned, 99.8);
  assert.equal(allen.percentChange, 0.02);
  assert.deepEqual(allen.eligibleSlots, ["QB", "OP", "BE", "IR"]);
  assert.equal(allen.acquisitionType, "DRAFT");

  // Bye week: no opponent, and the flag is what a lineup tool keys on.
  const worthy = roster.find((p) => p.playerId === 4683062)!;
  assert.equal(worthy.slot, "FLEX");
  assert.equal(worthy.opponent, "BYE");
  assert.equal(worthy.onBye, true);
  assert.equal(worthy.gameTime, null);

  const jeanty = roster.find((p) => p.playerId === 4890973)!;
  assert.equal(jeanty.injuryStatus, "QUESTIONABLE");
  assert.equal(jeanty.opponent, "@ NE");

  const dst = roster.find((p) => p.playerId === -16024)!;
  assert.equal(dst.position, "D/ST");
  assert.equal(dst.slot, "D/ST");
  assert.equal(dst.proTeam, "LAC");
  assert.equal(dst.injuryStatus, null);

  const warren = roster.find((p) => p.playerId === 4432708)!;
  assert.equal(warren.slot, "IR");
  assert.equal(warren.injuryStatus, "INJURY_RESERVE");

  // Missing stat rows become null, never 0, so callers can tell "no projection" from "projected 0".
  const nabers = roster.find((p) => p.playerId === 4595348)!;
  assert.equal(nabers.seasonPoints, null);
  assert.equal(nabers.actualPoints, null);
});

test("parseRoster orders starters by lineup slot, then bench, then IR", () => {
  const slots = parseRoster(league, 7, ctx).map((p) => p.slot);
  assert.deepEqual(slots, ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "D/ST", "K", "BE", "IR"]);
});

test("parseRoster throws a clear error for an unknown team", () => {
  assert.throws(() => parseRoster(league, 99, ctx), /team 99/i);
});

test("summarizePlayer picks the requested week's projection", () => {
  const raw = league.teams[0].roster.entries[0].playerPoolEntry.player;
  assert.equal(summarizePlayer(raw, { week: 5, proTeams }).projectedPoints, 24.1);
  assert.equal(summarizePlayer(raw, { week: 4, proTeams }).actualPoints, 27.3);
  assert.equal(summarizePlayer(raw, { week: 9, proTeams }).projectedPoints, null);
});

test("parseMatchups reports both sides with names, points and live projections", () => {
  const week5 = parseMatchups(league, 5);
  assert.equal(week5.length, 1);
  const m = week5[0]!;
  assert.equal(m.week, 5);
  assert.deepEqual(m.home, { teamId: 3, name: "Deimon Devilbats", points: 0, projectedPoints: 101.4 });
  assert.deepEqual(m.away, { teamId: 7, name: "gibb me win", points: 0, projectedPoints: 113.5 });
  assert.equal(m.winner, "UNDECIDED");

  const week1 = parseMatchups(league, 1);
  assert.equal(week1[0]!.winner, "HOME");
  assert.equal(week1[0]!.home.projectedPoints, null);
});

test("parseFreeAgents keeps availability status and drops nothing", () => {
  const list = parseFreeAgents(freeAgents, ctx);
  assert.equal(list.length, 3);
  const kaleb = list.find((p) => p.playerId === 4697815)!;
  assert.equal(kaleb.status, "FREEAGENT");
  assert.equal(kaleb.position, "RB");
  assert.equal(kaleb.proTeam, "PIT");
  assert.equal(kaleb.projectedPoints, 9.6);
  assert.equal(kaleb.seasonProjectedPoints, 120.5);
  assert.equal(kaleb.percentChange, 22.7);
  assert.equal(kaleb.positionRank, 38);
  const wilson = list.find((p) => p.playerId === 4569618)!;
  assert.equal(wilson.status, "WAIVERS");
  assert.equal(wilson.injuryStatus, "OUT");
  const dst = list.find((p) => p.playerId === -16034)!;
  assert.equal(dst.position, "D/ST");
  assert.equal(dst.proTeam, "HOU");
  assert.equal(dst.opponent, "@ TEN");
});
