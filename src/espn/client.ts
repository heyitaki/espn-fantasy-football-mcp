import type { Credentials } from "../config.ts";
import {
  COOKIE_NAME, HEADER, QUERY, READS_BASE, VIEW, WRITE_HEADERS, leagueUrl, seasonUrl, transactionUrl,
} from "./constants.ts";
import { buildProTeamIndex } from "./parse.ts";
import type { ProTeamIndex, RawLeague } from "./types.ts";

export interface ClientOptions {
  leagueId: number;
  season: number;
  credentials: Credentials;
  fetch?: typeof fetch | undefined;
  readOnly?: boolean | undefined;
}

export interface LeagueOptions {
  scoringPeriodId?: number | undefined;
  filter?: unknown | undefined;
}

export class EspnError extends Error {
  readonly status: number;
  readonly messages: string[];

  constructor(status: number, messages: string[]) {
    super(`ESPN ${status}: ${messages.join("; ")}`);
    this.name = "EspnError";
    this.status = status;
    this.messages = messages;
  }
}

export class EspnClient {
  private readonly options: ClientOptions;
  private readonly fetchImpl: typeof fetch;
  private proTeams: Promise<ProTeamIndex> | undefined;

  constructor(options: ClientOptions) {
    this.options = options;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async getLeague(views: string[], opts: LeagueOptions = {}): Promise<RawLeague> {
    const url = new URL(leagueUrl(READS_BASE, this.options.season, this.options.leagueId));
    for (const view of views) url.searchParams.append(QUERY.view, view);
    if (opts.scoringPeriodId !== undefined) url.searchParams.set(QUERY.week, String(opts.scoringPeriodId));
    const headers = this.headers();
    if (opts.filter !== undefined) headers.set(HEADER.filter, JSON.stringify(opts.filter));
    return this.leagueResponse(await this.request(url, { headers }));
  }

  async getProTeams(): Promise<ProTeamIndex> {
    if (!this.proTeams) {
      const url = new URL(seasonUrl(READS_BASE, this.options.season));
      url.searchParams.set(QUERY.view, VIEW.proTeams);
      this.proTeams = this.request(url, { headers: this.headers() }).then((data) => (
        buildProTeamIndex(this.leagueResponse(data).settings?.proTeams)
      )).catch((error: unknown) => {
        this.proTeams = undefined;
        throw error;
      });
    }
    return this.proTeams;
  }

  async postTransaction(payload: unknown): Promise<unknown> {
    if (this.options.readOnly) throw new Error("Writes are disabled in read-only mode.");
    if (!this.options.credentials.espnS2 || !this.options.credentials.swid) {
      throw new Error("Writes require both ESPN_S2 and ESPN_SWID credentials.");
    }
    const headers = this.headers();
    headers.set("content-type", "application/json");
    for (const [name, value] of Object.entries(WRITE_HEADERS)) headers.set(name, value);
    return this.request(new URL(transactionUrl(this.options.season, this.options.leagueId)), {
      method: "POST", headers, body: JSON.stringify(payload),
    });
  }

  private headers(): Headers {
    const headers = new Headers({ accept: "application/json" });
    const { espnS2, swid } = this.options.credentials;
    if (espnS2 && swid) {
      headers.set("cookie", `${COOKIE_NAME.s2}=${espnS2}; ${COOKIE_NAME.swid}=${swid}`);
    }
    return headers;
  }

  private leagueResponse(data: unknown): RawLeague {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("ESPN returned an invalid league response.");
    }
    return data as RawLeague;
  }

  private async request(url: URL, init: RequestInit): Promise<unknown> {
    // Following a redirect could leak the session cookie to another host.
    const response = await this.fetchImpl(url, { ...init, redirect: "error" });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const messages = body && typeof body === "object" && "messages" in body && Array.isArray(body.messages)
        ? body.messages.filter((message: unknown): message is string => typeof message === "string") : [];
      throw new EspnError(response.status, messages.length ? messages : [response.statusText || "Request failed"]);
    }
    if (response.status === 204) return null;
    return response.json();
  }
}
