export interface Credentials {
  espnS2?: string | undefined;
  swid?: string | undefined;
}

export interface ServerConfig {
  leagueId: number;
  season: number;
  teamId?: number | undefined;
  credentials: Credentials;
  readOnly: boolean;
}

export function loadConfig(env: Record<string, string | undefined>): ServerConfig {
  const credentials: Credentials = {};
  const espnS2 = env.ESPN_S2?.trim();
  const swid = env.ESPN_SWID?.trim();
  if (espnS2) credentials.espnS2 = espnS2;
  if (swid) credentials.swid = swid;

  return {
    leagueId: integerEnv(env.ESPN_LEAGUE_ID, "ESPN_LEAGUE_ID"),
    season: env.ESPN_SEASON === undefined
      ? new Date().getFullYear()
      : integerEnv(env.ESPN_SEASON, "ESPN_SEASON"),
    ...(env.ESPN_TEAM_ID === undefined ? {} : { teamId: integerEnv(env.ESPN_TEAM_ID, "ESPN_TEAM_ID") }),
    credentials,
    readOnly: ["1", "true"].includes(env.ESPN_READ_ONLY?.trim().toLowerCase() ?? ""),
  };
}

function integerEnv(value: string | undefined, name: string): number {
  if (!value?.trim() || !/^[+-]?\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${name} must be an integer.`);
  }
  return Number(value);
}
