import {
  BYE, DEFAULT_RATING, FREE_PRO_TEAM, PLAYER_STATUS, STARTING_SLOT_ORDER,
  STAT_SOURCE, STAT_SPLIT, STREAK_PREFIX, UNDECIDED, positionName, slotName,
} from "./constants.ts";
import type {
  FreeAgent, PlayerContext, PlayerSummary, ProGame, ProTeamIndex, RawLeague,
  RawMatchupSide, RawPlayer, RawProTeam, RawTeam, RosterEntry,
} from "./types.ts";

export type { FreeAgent, PlayerSummary, ProTeamIndex, RosterEntry } from "./types.ts";
export type LeagueInfo = ReturnType<typeof parseLeagueInfo>;
export type TeamSummary = ReturnType<typeof parseTeams>[number];
export type Matchup = ReturnType<typeof parseMatchups>[number];
export type TransactionSummary = ReturnType<typeof parseTransactions>[number];

const slotOrder = new Map<string, number>(STARTING_SLOT_ORDER.map((slot, index) => [slot, index]));

export function buildProTeamIndex(proTeams: RawProTeam[] | null | undefined): ProTeamIndex {
  const index: ProTeamIndex = new Map();
  for (const team of proTeams ?? []) {
    if (team.id == null) continue;
    const gamesByWeek = new Map<number, ProGame>();
    for (const [week, games] of Object.entries(team.proGamesByScoringPeriod ?? {})) {
      const game = games?.find((candidate) => (
        candidate.homeProTeamId === team.id || candidate.awayProTeamId === team.id
      ));
      if (game?.homeProTeamId == null || game.awayProTeamId == null || game.date == null) continue;
      gamesByWeek.set(Number(week), {
        homeProTeamId: game.homeProTeamId, awayProTeamId: game.awayProTeamId, date: game.date,
      });
    }
    index.set(team.id, {
      id: team.id,
      abbrev: team.abbrev ?? (team.id === 0 ? FREE_PRO_TEAM : String(team.id)),
      byeWeek: team.byeWeek && team.byeWeek > 0 ? team.byeWeek : null,
      gamesByWeek,
    });
  }
  return index;
}

export function summarizePlayer(player: RawPlayer, { week, proTeams }: PlayerContext): PlayerSummary {
  const playerId = requiredId(player.id, "player");
  const proTeam = player.proTeamId == null ? undefined : proTeams.get(player.proTeamId);
  const byeWeek = proTeam?.byeWeek ?? null;
  const game = proTeam?.gamesByWeek.get(week);
  let opponent: string | null = proTeam ? BYE : null;
  if (game) {
    const home = game.homeProTeamId === player.proTeamId;
    const other = proTeams.get(home ? game.awayProTeamId : game.homeProTeamId);
    opponent = other ? `${home ? "vs" : "@"} ${other.abbrev}` : null;
  }
  const total = (source: number, split: number, period: number): number | null => (
    player.stats?.find((stat) => stat.statSourceId === source
      && stat.statSplitTypeId === split && stat.scoringPeriodId === period)?.appliedTotal ?? null
  );
  return {
    playerId,
    name: player.fullName ?? ([player.firstName, player.lastName].filter(Boolean).join(" ") || `Player ${playerId}`),
    position: positionName(player.defaultPositionId ?? 0),
    proTeam: player.proTeamId === 0 ? FREE_PRO_TEAM : proTeam?.abbrev ?? null,
    byeWeek,
    onBye: byeWeek === week,
    injuryStatus: player.injuryStatus ?? null,
    injured: player.injured ?? false,
    eligibleSlots: (player.eligibleSlots ?? []).map(slotName),
    percentOwned: player.ownership?.percentOwned ?? null,
    percentChange: player.ownership?.percentChange ?? null,
    percentStarted: player.ownership?.percentStarted ?? null,
    projectedPoints: total(STAT_SOURCE.projected, STAT_SPLIT.week, week),
    actualPoints: total(STAT_SOURCE.actual, STAT_SPLIT.week, week),
    seasonProjectedPoints: total(STAT_SOURCE.projected, STAT_SPLIT.season, 0),
    seasonPoints: total(STAT_SOURCE.actual, STAT_SPLIT.season, 0),
    opponent,
    gameTime: isoDate(game?.date),
  };
}

export function parseLeagueInfo(league: RawLeague) {
  const settings = league.settings;
  const waivers = settings?.acquisitionSettings;
  return {
    leagueId: league.id ?? null,
    season: league.seasonId ?? null,
    name: settings?.name ?? "Unknown league",
    currentWeek: league.scoringPeriodId ?? null,
    currentMatchupPeriod: league.status?.currentMatchupPeriod ?? null,
    isActive: league.status?.isActive ?? false,
    regularSeasonWeeks: settings?.scheduleSettings?.matchupPeriodCount ?? null,
    playoffTeams: settings?.scheduleSettings?.playoffTeamCount ?? null,
    lineupSlots: Object.fromEntries(
      Object.entries(settings?.rosterSettings?.lineupSlotCounts ?? {})
        .filter(([, count]) => count > 0)
        .map(([id, count]) => [slotName(Number(id)), count]),
    ),
    waivers: {
      type: waivers?.acquisitionType ?? null,
      usesBudget: waivers?.isUsingAcquisitionBudget ?? false,
      budget: waivers?.acquisitionBudget ?? null,
      waiverHours: waivers?.waiverHours ?? null,
    },
    trades: {
      vetoVotesRequired: settings?.tradeSettings?.vetoVotesRequired ?? null,
      deadline: isoDate(settings?.tradeSettings?.deadlineDate),
    },
  };
}

export function parseTeams(league: RawLeague) {
  const members = new Map((league.members ?? []).map((member) => [member.id, member.displayName]));
  return (league.teams ?? []).map((team) => {
    const overall = team.record?.overall;
    const streakPrefix = STREAK_PREFIX[overall?.streakType ?? ""];
    return {
      teamId: requiredId(team.id, "team"),
      name: teamName(team),
      abbrev: team.abbrev ?? "",
      owners: (team.owners ?? []).map((id) => members.get(id) ?? id),
      record: { wins: overall?.wins ?? 0, losses: overall?.losses ?? 0, ties: overall?.ties ?? 0 },
      pointsFor: overall?.pointsFor ?? team.points ?? null,
      pointsAgainst: overall?.pointsAgainst ?? null,
      waiverRank: team.waiverRank ?? null,
      playoffSeed: team.playoffSeed ?? null,
      streak: streakPrefix && overall?.streakLength ? `${streakPrefix}${overall.streakLength}` : "",
    };
  });
}

export function parseRoster(league: RawLeague, teamId: number, ctx: PlayerContext): RosterEntry[] {
  const team = league.teams?.find((candidate) => candidate.id === teamId);
  if (!team) throw new Error(`Unknown team ${teamId}.`);
  return (team.roster?.entries ?? []).map((entry) => {
    const player = entry.playerPoolEntry?.player;
    const slotId = requiredId(entry.lineupSlotId, `lineup slot for player ${entry.playerId}`);
    return {
      ...summarizePlayer({ ...player, id: player?.id ?? entry.playerId ?? entry.playerPoolEntry?.id }, ctx),
      slot: slotName(slotId),
      slotId,
      acquisitionType: entry.acquisitionType ?? null,
    };
  }).sort((a, b) => (slotOrder.get(a.slot) ?? STARTING_SLOT_ORDER.length)
    - (slotOrder.get(b.slot) ?? STARTING_SLOT_ORDER.length));
}

export function parseMatchups(league: RawLeague, week: number) {
  const side = (raw: RawMatchupSide | null | undefined) => ({
    teamId: raw?.teamId ?? null,
    name: raw?.teamId == null ? BYE : teamName(league.teams?.find((team) => team.id === raw.teamId), raw.teamId),
    points: raw?.totalPoints ?? null,
    projectedPoints: raw?.totalProjectedPointsLive ?? null,
  });
  return (league.schedule ?? []).filter((matchup) => matchup.matchupPeriodId === week).map((matchup) => ({
    week,
    matchupId: matchup.id ?? null,
    home: side(matchup.home),
    away: side(matchup.away),
    winner: matchup.winner ?? UNDECIDED,
  }));
}

export function parseFreeAgents(response: RawLeague, ctx: PlayerContext): FreeAgent[] {
  return (response.players ?? []).map((entry) => ({
    ...summarizePlayer({ ...entry.player, id: entry.player?.id ?? entry.id }, ctx),
    status: entry.status ?? (entry.onTeamId ? PLAYER_STATUS.onTeam : PLAYER_STATUS.freeAgent),
    onTeamId: entry.onTeamId || null,
    positionRank: entry.ratings?.[DEFAULT_RATING]?.positionalRanking ?? null,
    overallRank: entry.ratings?.[DEFAULT_RATING]?.totalRanking ?? null,
  }));
}

export function parseTransactions(league: RawLeague) {
  return [...(league.transactions ?? [])]
    .sort((a, b) => (b.processDate ?? 0) - (a.processDate ?? 0))
    .map((transaction) => ({
      id: transaction.id ?? null,
      type: transaction.type ?? null,
      status: transaction.status ?? null,
      teamId: transaction.teamId ?? null,
      teamName: transaction.teamId == null ? null
        : teamName(league.teams?.find((team) => team.id === transaction.teamId), transaction.teamId),
      scoringPeriodId: transaction.scoringPeriodId ?? null,
      bidAmount: transaction.bidAmount ?? null,
      processDate: isoDate(transaction.processDate),
      items: (transaction.items ?? []).map((item) => ({
        type: item.type ?? null,
        playerId: item.playerId ?? null,
        fromTeamId: item.fromTeamId ?? null,
        toTeamId: item.toTeamId ?? null,
      })),
    }));
}

export function teamName(team: RawTeam | undefined, id?: number | undefined): string {
  return team?.name ?? ([team?.location, team?.nickname].filter(Boolean).join(" ") || `Team ${team?.id ?? id ?? "?"}`);
}

function isoDate(value: number | null | undefined): string | null {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function requiredId(id: number | null | undefined, label: string): number {
  if (id == null || !Number.isSafeInteger(id)) throw new Error(`ESPN response is missing a valid ${label} id.`);
  return id;
}
