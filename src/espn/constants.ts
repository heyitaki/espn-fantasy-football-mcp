export const POSITION_BY_ID: Readonly<Record<number, string>> = {
  1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 7: "P", 9: "DT", 10: "DE",
  11: "LB", 12: "CB", 13: "S", 14: "HC", 16: "D/ST",
};

export const SLOT_BY_ID: Readonly<Record<number, string>> = {
  0: "QB", 1: "TQB", 2: "RB", 3: "RB/WR", 4: "WR", 5: "WR/TE", 6: "TE", 7: "OP",
  8: "DT", 9: "DE", 10: "LB", 11: "DL", 12: "CB", 13: "S", 14: "DB", 15: "DP",
  16: "D/ST", 17: "K", 18: "P", 19: "HC", 20: "BE", 21: "IR", 22: "SLOT22",
  23: "FLEX", 24: "ER", 25: "Rookie",
};

export const SLOT_ID_BY_NAME: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(SLOT_BY_ID).map(([id, name]) => [name, Number(id)]),
);

export const STARTING_SLOT_ORDER = [
  "QB", "TQB", "RB", "RB/WR", "WR", "WR/TE", "TE", "FLEX", "OP", "D/ST", "K", "P", "HC",
  "DT", "DE", "LB", "DL", "CB", "S", "DB", "DP", "SLOT22", "ER", "Rookie", "BE", "IR",
] as const;

export const READS_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";
export const WRITES_BASE = "https://lm-api-writes.fantasy.espn.com/apis/v3/games/ffl";
export const VIEW = {
  teams: "mTeam", roster: "mRoster", settings: "mSettings", matchups: "mMatchup",
  standings: "mStandings", players: "kona_player_info", transactions: "mTransactions2",
  proTeams: "proTeamSchedules_wl",
} as const;
export const LEAGUE_VIEWS = [VIEW.teams, VIEW.roster, VIEW.settings, VIEW.matchups, VIEW.standings];
export const QUERY = { view: "view", week: "scoringPeriodId" } as const;
export const HEADER = {
  filter: "x-fantasy-filter", platform: "x-fantasy-platform", source: "x-fantasy-source",
} as const;
export const WRITE_HEADERS = { [HEADER.platform]: "espn-fantasy-web", [HEADER.source]: "kona" };
export const COOKIE_NAME = { s2: "espn_s2", swid: "SWID" } as const;
export const FREE_AGENT_SORT_KEYS = {
  percentOwned: "sortPercOwned", percentChange: "sortPercChanged", projected: "sortAppliedStatTotal",
} as const;
export const FILTER_SLOT_BY_POSITION = { QB: 0, RB: 2, WR: 4, TE: 6, K: 17, "D/ST": 16 } as const;
export const FILTER_POSITIONS = ["QB", "RB", "WR", "TE", "K", "D/ST"] as const;
export const PLAYER_STATUS = { freeAgent: "FREEAGENT", waivers: "WAIVERS", onTeam: "ONTEAM" } as const;
export const AVAILABLE_STATUSES = [PLAYER_STATUS.freeAgent, PLAYER_STATUS.waivers];
export const ALL_PLAYER_STATUSES = [...AVAILABLE_STATUSES, PLAYER_STATUS.onTeam];
export const TRANSACTION_TYPE = {
  waiver: "WAIVER", freeAgent: "FREEAGENT", tradeProposal: "TRADE_PROPOSAL",
  tradeAccept: "TRADE_ACCEPT", roster: "ROSTER", draft: "DRAFT",
} as const;
export const TRANSACTION_TYPES = Object.values(TRANSACTION_TYPE);
export const EXECUTION_TYPE = { execute: "EXECUTE", cancel: "CANCEL" } as const;
export const ITEM_TYPE = { add: "ADD", drop: "DROP", lineup: "LINEUP" } as const;
export const STREAK_PREFIX: Readonly<Record<string, string>> = { WIN: "W", LOSS: "L" };
export const UNDECIDED = "UNDECIDED";
export const FREE_PRO_TEAM = "FA";
export const BYE = "BYE";
export const ACTIVE_INJURY_STATUS = "ACTIVE";
export const DEFAULT_RATING = "0";
export const STAT_SOURCE = { actual: 0, projected: 1 } as const;
export const STAT_SPLIT = { season: 0, week: 1 } as const;

export function positionName(id: number): string {
  return POSITION_BY_ID[id] ?? `POS${id}`;
}

export function slotName(id: number): string {
  return SLOT_BY_ID[id] ?? `SLOT${id}`;
}

export function projectedStatId(season: number, week: number): string {
  // ESPN keys weekly projections as "11<season><week>" (projected source, weekly split).
  return `${STAT_SOURCE.projected}${STAT_SPLIT.week}${season}${week}`;
}

export function seasonUrl(base: string, season: number): string {
  return `${base}/seasons/${season}`;
}

export function leagueUrl(base: string, season: number, leagueId: number): string {
  return `${seasonUrl(base, season)}/segments/0/leagues/${leagueId}`;
}

export function transactionUrl(season: number, leagueId: number): string {
  return `${leagueUrl(WRITES_BASE, season, leagueId)}/transactions/`;
}
