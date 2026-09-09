import { z } from "zod";
import { EXECUTION_TYPE, ITEM_TYPE, PLAYER_STATUS, TRANSACTION_TYPE } from "./espn/constants.ts";

const numberOrNull = z.number().nullable();
const stringOrNull = z.string().nullable();
const playerStatus = z.enum(PLAYER_STATUS);

export const playerSchema = z.object({
  playerId: z.number().int(),
  name: z.string(),
  position: z.string(),
  proTeam: stringOrNull,
  byeWeek: numberOrNull,
  onBye: z.boolean(),
  injuryStatus: stringOrNull,
  injured: z.boolean(),
  eligibleSlots: z.array(z.string()),
  percentOwned: numberOrNull,
  percentChange: numberOrNull,
  percentStarted: numberOrNull,
  projectedPoints: numberOrNull,
  actualPoints: numberOrNull,
  seasonProjectedPoints: numberOrNull,
  seasonPoints: numberOrNull,
  opponent: stringOrNull,
  gameTime: stringOrNull,
});

export const rosterSchema = playerSchema.extend({
  slot: z.string(), slotId: z.number().int(), acquisitionType: stringOrNull,
});

export const freeAgentSchema = playerSchema.extend({
  status: playerStatus, onTeamId: numberOrNull, positionRank: numberOrNull, overallRank: numberOrNull,
});

export const searchPlayerSchema = playerSchema.extend({
  status: playerStatus, teamId: numberOrNull, teamName: stringOrNull,
});

export const leagueSchema = z.object({
  leagueId: numberOrNull,
  season: numberOrNull,
  name: z.string(),
  currentWeek: numberOrNull,
  currentMatchupPeriod: numberOrNull,
  isActive: z.boolean(),
  regularSeasonWeeks: numberOrNull,
  playoffTeams: numberOrNull,
  lineupSlots: z.record(z.string(), z.number()),
  waivers: z.object({
    type: stringOrNull, usesBudget: z.boolean(), budget: numberOrNull, waiverHours: numberOrNull,
  }),
  trades: z.object({ vetoVotesRequired: numberOrNull, deadline: stringOrNull }),
});

export const teamSchema = z.object({
  teamId: z.number().int(),
  name: z.string(),
  abbrev: z.string(),
  owners: z.array(z.string()),
  record: z.object({ wins: z.number(), losses: z.number(), ties: z.number() }),
  pointsFor: numberOrNull,
  pointsAgainst: numberOrNull,
  waiverRank: numberOrNull,
  playoffSeed: numberOrNull,
  streak: z.string(),
});

const matchupSide = z.object({
  teamId: numberOrNull, name: z.string(), points: numberOrNull, projectedPoints: numberOrNull,
});

export const matchupSchema = z.object({
  week: z.number().int(), matchupId: numberOrNull, home: matchupSide, away: matchupSide,
  winner: z.string(), mine: z.boolean(),
});

export const transactionSchema = z.object({
  id: z.union([z.string(), z.number()]).nullable(),
  type: stringOrNull,
  status: stringOrNull,
  teamId: numberOrNull,
  teamName: stringOrNull,
  scoringPeriodId: numberOrNull,
  bidAmount: numberOrNull,
  processDate: stringOrNull,
  items: z.array(z.object({
    type: stringOrNull, playerId: numberOrNull, fromTeamId: numberOrNull, toTeamId: numberOrNull,
  })),
});

const addItem = z.object({
  playerId: z.number().int(), type: z.literal(ITEM_TYPE.add), toTeamId: z.number().int(),
});
const dropItem = z.object({
  playerId: z.number().int(), type: z.literal(ITEM_TYPE.drop), fromTeamId: z.number().int(),
});
const lineupItem = z.object({
  playerId: z.number().int(), type: z.literal(ITEM_TYPE.lineup),
  fromLineupSlotId: z.number().int(), toLineupSlotId: z.number().int(),
});
const basePayload = {
  isLeagueManager: z.literal(false), teamId: z.number().int(), memberId: z.string(),
  scoringPeriodId: z.number().int(), executionType: z.literal(EXECUTION_TYPE.execute),
};
const acquisitionItems = z.array(z.union([addItem, dropItem]));
export const writeOutput = {
  dryRun: z.boolean(),
  payload: z.union([
    z.object({ ...basePayload, type: z.literal(TRANSACTION_TYPE.roster), items: z.array(lineupItem) }),
    z.object({ ...basePayload, type: z.literal(TRANSACTION_TYPE.freeAgent), items: acquisitionItems }),
    z.object({
      ...basePayload, type: z.literal(TRANSACTION_TYPE.waiver), items: acquisitionItems, bidAmount: z.number(),
    }),
    z.object({
      ...basePayload, type: z.literal(TRANSACTION_TYPE.waiver),
      executionType: z.literal(EXECUTION_TYPE.cancel), relatedTransactionId: z.string(),
    }),
  ]),
  result: z.unknown().optional(),
};
