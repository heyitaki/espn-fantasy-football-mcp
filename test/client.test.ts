import { test } from "node:test";
import assert from "node:assert/strict";
import { EspnClient, EspnError } from "../src/espn/client.ts";
import { fakeFetch, fixture, ESPN_S2, SWID, READS_HOST, WRITES_HOST, LEAGUE_PATH } from "./helpers.ts";

function client(fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof EspnClient>[0]> = {}) {
  return new EspnClient({
    leagueId: 123456,
    season: 2026,
    credentials: { espnS2: ESPN_S2, swid: SWID },
    fetch: fetchImpl,
    ...extra,
  });
}

test("getLeague hits the reads host with every view and the cookie header", async () => {
  const fake = fakeFetch({ [LEAGUE_PATH]: fixture("league.json") });
  const data = await client(fake.fetch).getLeague(["mTeam", "mRoster"], { scoringPeriodId: 5 });
  assert.equal((data as { id: number }).id, 123456);

  const req = fake.requests[0]!;
  assert.equal(req.method, "GET");
  assert.equal(req.url.host, READS_HOST);
  assert.equal(req.url.pathname, LEAGUE_PATH);
  assert.deepEqual(req.url.searchParams.getAll("view"), ["mTeam", "mRoster"]);
  assert.equal(req.url.searchParams.get("scoringPeriodId"), "5");
  // Cookie values go over verbatim: espn_s2 is stored URL-encoded and ESPN expects it that way.
  assert.equal(req.headers.get("cookie"), `espn_s2=${ESPN_S2}; SWID=${SWID}`);
  assert.equal(req.headers.get("accept"), "application/json");
});

test("getLeague sends a filter as the X-Fantasy-Filter header", async () => {
  const fake = fakeFetch({ [LEAGUE_PATH]: fixture("free-agents.json") });
  const filter = { players: { filterStatus: { value: ["FREEAGENT", "WAIVERS"] }, limit: 25 } };
  await client(fake.fetch).getLeague(["kona_player_info"], { filter });
  assert.equal(fake.requests[0]!.headers.get("x-fantasy-filter"), JSON.stringify(filter));
});

test("requests without credentials send no cookie header", async () => {
  const fake = fakeFetch({ [LEAGUE_PATH]: fixture("league.json") });
  await client(fake.fetch, { credentials: {} }).getLeague(["mTeam"]);
  assert.equal(fake.requests[0]!.headers.get("cookie"), null);
});

test("getProTeams fetches the season schedule once and caches it", async () => {
  const fake = fakeFetch({ "/seasons/2026?": fixture("pro-teams.json") });
  const c = client(fake.fetch);
  const first = await c.getProTeams();
  const second = await c.getProTeams();
  assert.equal(first.get(2)!.abbrev, "BUF");
  assert.equal(second, first);
  assert.equal(fake.requests.length, 1);
  assert.equal(fake.requests[0]!.url.searchParams.get("view"), "proTeamSchedules_wl");
});

test("HTTP errors surface as EspnError with status and ESPN's messages", async () => {
  const fake = fakeFetch({
    [LEAGUE_PATH]: { status: 401, body: { messages: ["You are not authorized to view this League."], details: [] } },
  });
  await assert.rejects(
    () => client(fake.fetch).getLeague(["mTeam"]),
    (err: unknown) => {
      assert.ok(err instanceof EspnError);
      assert.equal(err.status, 401);
      assert.deepEqual(err.messages, ["You are not authorized to view this League."]);
      assert.match(err.message, /401/);
      assert.match(err.message, /not authorized/);
      return true;
    },
  );
});

test("postTransaction posts JSON to the writes host with ESPN's client headers", async () => {
  const fake = fakeFetch({ "/transactions/": { id: "tx-1", status: "EXECUTED" } });
  const payload = { type: "ROSTER", items: [] };
  const result = await client(fake.fetch).postTransaction(payload);
  assert.deepEqual(result, { id: "tx-1", status: "EXECUTED" });

  const req = fake.requests[0]!;
  assert.equal(req.method, "POST");
  assert.equal(req.url.host, WRITES_HOST);
  assert.equal(req.url.pathname, `${LEAGUE_PATH}/transactions/`);
  assert.deepEqual(req.body, payload);
  assert.equal(req.headers.get("content-type"), "application/json");
  assert.equal(req.headers.get("x-fantasy-platform"), "espn-fantasy-web");
  assert.equal(req.headers.get("x-fantasy-source"), "kona");
  assert.equal(req.headers.get("cookie"), `espn_s2=${ESPN_S2}; SWID=${SWID}`);
});

test("postTransaction refuses in read-only mode before touching the network", async () => {
  const fake = fakeFetch({ "/transactions/": { id: "tx-1" } });
  await assert.rejects(() => client(fake.fetch, { readOnly: true }).postTransaction({}), /read-only/i);
  assert.equal(fake.requests.length, 0);
});

test("postTransaction refuses without credentials", async () => {
  const fake = fakeFetch({ "/transactions/": { id: "tx-1" } });
  await assert.rejects(() => client(fake.fetch, { credentials: {} }).postTransaction({}), /ESPN_S2|credentials/i);
  assert.equal(fake.requests.length, 0);
});
