import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function fixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(join(here, "fixtures", name), "utf8")) as T;
}

export interface RecordedRequest {
  url: URL;
  method: string;
  headers: Headers;
  body: unknown;
}

export interface FakeFetch {
  fetch: typeof fetch;
  requests: RecordedRequest[];
}

/**
 * A fetch stand-in that routes by URL substring. Each route is either a JSON
 * body (200) or a { status, body } pair. Every call is recorded so tests can
 * assert on headers, query strings, and POST bodies.
 */
export function fakeFetch(
  routes: Record<string, unknown | { status: number; body: unknown }>,
): FakeFetch {
  const requests: RecordedRequest[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    requests.push({ url, method, headers, body });
    for (const [needle, route] of Object.entries(routes)) {
      if (url.href.includes(needle)) {
        const isStatus =
          route !== null &&
          typeof route === "object" &&
          "body" in (route as object) &&
          typeof (route as { status?: unknown }).status === "number";
        const status = isStatus ? (route as { status: number }).status : 200;
        const payload = isStatus ? (route as { body: unknown }).body : route;
        return new Response(JSON.stringify(payload), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify({ messages: ["no route for " + url.href] }), { status: 404 });
  };
  return { fetch: impl as typeof fetch, requests };
}

export const SWID = "{11111111-AAAA-BBBB-CCCC-DDDDDDDDDDDD}";
export const ESPN_S2 = "AEB%2Ftest%2Fcookie%3D%3D";

export const READS_HOST = "lm-api-reads.fantasy.espn.com";
export const WRITES_HOST = "lm-api-writes.fantasy.espn.com";
export const LEAGUE_PATH = "/apis/v3/games/ffl/seasons/2026/segments/0/leagues/123456";
