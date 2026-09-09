import type { PLAYER_STATUS } from "./constants.ts";

export type PlayerStatus = (typeof PLAYER_STATUS)[keyof typeof PLAYER_STATUS];

export interface RawStat {
  scoringPeriodId?: number | null | undefined;
  statSourceId?: number | null | undefined;
  statSplitTypeId?: number | null | undefined;
  appliedTotal?: number | null | undefined;
}

export interface RawPlayer {
  id?: number | null | undefined;
  fullName?: string | null | undefined;
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  defaultPositionId?: number | null | undefined;
  proTeamId?: number | null | undefined;
  eligibleSlots?: number[] | null | undefined;
  injuryStatus?: string | null | undefined;
  injured?: boolean | null | undefined;
  ownership?: {
    percentOwned?: number | null | undefined;
    percentChange?: number | null | undefined;
    percentStarted?: number | null | undefined;
  } | null | undefined;
  stats?: RawStat[] | null | undefined;
}

export interface RawPoolEntry {
  id?: number | null | undefined;
  onTeamId?: number | null | undefined;
  status?: PlayerStatus | null | undefined;
  player?: RawPlayer | null | undefined;
  ratings?: Record<string, {
    positionalRanking?: number | null | undefined;
    totalRanking?: number | null | undefined;
  }> | null | undefined;
}

export interface RawRosterEntry {
  playerId?: number | null | undefined;
  lineupSlotId?: number | null | undefined;
  acquisitionType?: string | null | undefined;
  playerPoolEntry?: RawPoolEntry | null | undefined;
}

export interface RawTeam {
  id?: number | null | undefined;
  name?: string | null | undefined;
  location?: string | null | undefined;
  nickname?: string | null | undefined;
  abbrev?: string | null | undefined;
  owners?: string[] | null | undefined;
  waiverRank?: number | null | undefined;
  playoffSeed?: number | null | undefined;
  points?: number | null | undefined;
  record?: {
    overall?: {
      wins?: number | null | undefined;
      losses?: number | null | undefined;
      ties?: number | null | undefined;
      pointsFor?: number | null | undefined;
      pointsAgainst?: number | null | undefined;
      streakType?: string | null | undefined;
      streakLength?: number | null | undefined;
    } | null | undefined;
  } | null | undefined;
  roster?: { entries?: RawRosterEntry[] | null | undefined } | null | undefined;
}

export interface RawMatchupSide {
  teamId?: number | null | undefined;
  totalPoints?: number | null | undefined;
  totalProjectedPointsLive?: number | null | undefined;
}

export interface RawMatchup {
  id?: number | null | undefined;
  matchupPeriodId?: number | null | undefined;
  home?: RawMatchupSide | null | undefined;
  away?: RawMatchupSide | null | undefined;
  winner?: string | null | undefined;
}

export interface RawProGame {
  homeProTeamId?: number | null | undefined;
  awayProTeamId?: number | null | undefined;
  date?: number | null | undefined;
}

export interface RawProTeam {
  id?: number | null | undefined;
  abbrev?: string | null | undefined;
  byeWeek?: number | null | undefined;
  proGamesByScoringPeriod?: Record<string, RawProGame[] | null> | null | undefined;
}

export interface RawTransactionItem {
  type?: string | null | undefined;
  playerId?: number | null | undefined;
  fromTeamId?: number | null | undefined;
  toTeamId?: number | null | undefined;
}

export interface RawTransaction {
  id?: string | number | null | undefined;
  type?: string | null | undefined;
  status?: string | null | undefined;
  teamId?: number | null | undefined;
  scoringPeriodId?: number | null | undefined;
  bidAmount?: number | null | undefined;
  processDate?: number | null | undefined;
  items?: RawTransactionItem[] | null | undefined;
}

export interface RawLeague {
  id?: number | null | undefined;
  seasonId?: number | null | undefined;
  scoringPeriodId?: number | null | undefined;
  status?: {
    currentMatchupPeriod?: number | null | undefined;
    isActive?: boolean | null | undefined;
  } | null | undefined;
  settings?: {
    name?: string | null | undefined;
    rosterSettings?: { lineupSlotCounts?: Record<string, number> | null | undefined } | null | undefined;
    acquisitionSettings?: {
      acquisitionType?: string | null | undefined;
      acquisitionBudget?: number | null | undefined;
      isUsingAcquisitionBudget?: boolean | null | undefined;
      waiverHours?: number | null | undefined;
    } | null | undefined;
    scheduleSettings?: {
      matchupPeriodCount?: number | null | undefined;
      playoffTeamCount?: number | null | undefined;
    } | null | undefined;
    tradeSettings?: {
      deadlineDate?: number | null | undefined;
      vetoVotesRequired?: number | null | undefined;
    } | null | undefined;
    proTeams?: RawProTeam[] | null | undefined;
  } | null | undefined;
  members?: Array<{ id?: string | null | undefined; displayName?: string | null | undefined }> | null | undefined;
  teams?: RawTeam[] | null | undefined;
  schedule?: RawMatchup[] | null | undefined;
  players?: RawPoolEntry[] | null | undefined;
  transactions?: RawTransaction[] | null | undefined;
}

export interface ProGame {
  homeProTeamId: number;
  awayProTeamId: number;
  date: number;
}

export type ProTeamIndex = Map<number, {
  id: number;
  abbrev: string;
  byeWeek: number | null;
  gamesByWeek: Map<number, ProGame>;
}>;

export interface PlayerContext {
  week: number;
  proTeams: ProTeamIndex;
}

export interface PlayerSummary {
  playerId: number;
  name: string;
  position: string;
  proTeam: string | null;
  byeWeek: number | null;
  onBye: boolean;
  injuryStatus: string | null;
  injured: boolean;
  eligibleSlots: string[];
  percentOwned: number | null;
  percentChange: number | null;
  percentStarted: number | null;
  projectedPoints: number | null;
  actualPoints: number | null;
  seasonProjectedPoints: number | null;
  seasonPoints: number | null;
  opponent: string | null;
  gameTime: string | null;
}

export interface RosterEntry extends PlayerSummary {
  slot: string;
  slotId: number;
  acquisitionType: string | null;
}

export interface FreeAgent extends PlayerSummary {
  status: PlayerStatus;
  onTeamId: number | null;
  positionRank: number | null;
  overallRank: number | null;
}

export interface SearchPlayer extends PlayerSummary {
  status: PlayerStatus;
  teamId: number | null;
  teamName: string | null;
}
