# espn-fantasy-football-mcp

A TypeScript MCP server for ESPN fantasy football over stdio. Read league settings, rosters, available players, matchups and transactions. Update lineups, add or drop players, and manage waiver claims.

Tools return readable text and structured results. Player tables include ESPN ids, slots, opponents, injuries and projected points. Missing statistics are `null`, distinct from a recorded or projected zero. Text displays missing values as `-` and points to one decimal.

## Install

Requires Node.js 22.12 or newer and npm. From a checkout of this repository:

```sh
npm install && npm run build
```

Run the built server with your league id:

```sh
ESPN_LEAGUE_ID=123456 ESPN_READ_ONLY=1 node dist/index.js
```

The server waits for an MCP client on stdin. It does not provide an interactive command prompt. Stdout carries only MCP messages. Startup errors go to stderr.

## Configuration

Supply environment variables to the server process:

| Variable | Required | Meaning and default |
| --- | --- | --- |
| `ESPN_LEAGUE_ID` | Yes | Integer league id from the league URL's `leagueId` parameter. |
| `ESPN_SEASON` | No | Integer NFL season year. Defaults to the current calendar year. Set it explicitly when viewing a season after New Year's Day. |
| `ESPN_TEAM_ID` | No | Integer fantasy team id from your team's URL. Used when a tool omits `teamId`. |
| `ESPN_S2` | Private reads and all writes | The `espn_s2` cookie value, kept URL-encoded. |
| `ESPN_SWID` | Private reads and all writes | The `SWID` cookie value, including braces. Also identifies the member making a transaction. |
| `ESPN_READ_ONLY` | No | `1` or `true` disables every write tool, including dry runs. Defaults to false. |

Credentials are trimmed at the edges but are never URL-decoded. Cookies are sent only when both values are present. Public leagues can be read without credentials. A private league usually returns a 401 error when cookies are missing or expired.

### Claude Code

Register a public league in read-only mode. Replace the path and ids with your own:

```sh
claude mcp add --transport stdio --scope user \
  -e ESPN_LEAGUE_ID=123456 -e ESPN_SEASON=2026 \
  -e ESPN_TEAM_ID=1 -e ESPN_READ_ONLY=1 \
  espn-fantasy-football -- node /absolute/path/espn-fantasy-football-mcp/dist/index.js
```

For a private league, supply `ESPN_S2` and `ESPN_SWID` through the server's environment using your client's local secret configuration or a launcher that reads your secret manager. Keep credentials out of shared project configuration.

### Generic MCP client

Most stdio clients accept a configuration shaped like this:

```json
{
  "mcpServers": {
    "espn-fantasy-football": {
      "command": "node",
      "args": ["/absolute/path/espn-fantasy-football-mcp/dist/index.js"],
      "env": {
        "ESPN_LEAGUE_ID": "123456",
        "ESPN_SEASON": "2026",
        "ESPN_TEAM_ID": "1",
        "ESPN_READ_ONLY": "1"
      }
    }
  }
}
```

Clients launched from a desktop may need an absolute path to `node`. Restart the MCP server after changing its environment.

## Tools

`?` marks an optional argument. `teamId` means an ESPN fantasy team id, not an NFL team id. Player ids are ESPN ids. D/ST ids are negative: Chargers D/ST is `-16024`, following `-16000 - proTeamId`.

`week` defaults to the league's current NFL `scoringPeriodId`. Tools that need a team use the argument or `ESPN_TEAM_ID` and return an error if neither is set. Limits must be positive integers.

| Tool | Arguments | Result and use |
| --- | --- | --- |
| `get_league` | None | League settings, lineup slot counts, waiver and trade rules, and teams with owners, records and waiver ranks. |
| `get_roster` | `teamId?`, `week?` | Team name and roster, ordered by starting slot, then bench and IR. Includes eligibility, bye weeks, opponents, kickoff times, injuries, ownership and weekly/season points. |
| `get_free_agents` | `positions?`, `limit?` (50, max 200), `sortBy?` (`percentOwned`, `percentChange`, `projected`), `week?` | Free agents and waiver players with availability and ranks. Positions: `QB`, `RB`, `WR`, `TE`, `K`, `D/ST`. Default sort is percent owned, descending. |
| `search_players` | `query`, `limit?` (10) | Name substring search across rosters and ESPN's player pool. Returns status and fantasy team ownership, deduplicated by player id with rostered matches first. |
| `get_matchups` | `week?` | Scores and live projections with team names. `mine` identifies the configured team's matchup. |
| `get_transactions` | `limit?` (25) | Recent transactions, newest first, including ids, status, bids, dates and item player ids. ESPN does not include player names in this view. |
| `set_lineup` | `moves: [{playerId, slot}]`, `teamId?`, `week?`, `dryRun?` | One roster transaction for all listed moves. Checks each player's current slot and eligibility. |
| `add_player` | `playerId`, `dropPlayerId?`, `teamId?`, `week?`, `dryRun?` | Add a free agent, optionally dropping another player in the same transaction. |
| `drop_player` | `playerId`, `teamId?`, `week?`, `dryRun?` | Drop one rostered player. |
| `submit_waiver_claim` | `playerId`, `dropPlayerId?`, `bid?` (0), `teamId?`, `week?`, `dryRun?` | Submit a waiver claim with an optional drop. Bid must be a nonnegative integer. |
| `cancel_waiver_claim` | `transactionId`, `teamId?`, `week?`, `dryRun?` | Cancel a pending claim using its transaction id from `get_transactions`. |

Every write returns `{ dryRun, payload, result? }`. `dryRun: true` previews the exact payload without posting, but still requires credentials and may fetch current league data. The default is false, which submits immediately. ESPN enforces ownership, locks, roster capacity, budgets and waiver rules. A preview does not guarantee ESPN will accept the transaction later.

Lineup slot names are case-sensitive. Use `eligibleSlots` from `get_roster`, such as `QB`, `RB`, `WR`, `TE`, `FLEX`, `OP`, `D/ST`, `K`, `BE` or `IR`. To swap players, list both moves. The server never adds counter-moves. Unknown position and slot ids display as `POS<id>` and `SLOT<id>`.

Validation and ESPN errors return `isError: true` with a text message. Check transaction status before repeating a write after a connection failure, since ESPN may already have processed it.

## Credentials and security

**`espn_s2` is a full account session. Never commit it or paste it into chats. Treat it like a password, and protect `SWID` too.**

To find the cookies:

1. Sign in to ESPN and open your league on `fantasy.espn.com`.
2. Open browser DevTools, then **Application**, **Storage**, **Cookies**.
3. Select the ESPN cookie store for the page and locate `espn_s2` and `SWID`.
4. Copy their values into a secret manager or private local configuration. Preserve URL encoding and braces. Refresh them there if the session expires.

`ESPN_READ_ONLY=1` disables every write tool before any fetch, even with `dryRun: true`. Enable writes only for a trusted MCP client and review the requested moves. The server does not ask for confirmation before submitting. The configured team is a default, not an access restriction, and the cookies may authorize actions beyond that team.

The server sends credentials only to the configured ESPN hosts and refuses redirects. It does not save credentials or league data to disk. Your MCP client can retain tool results, including team/member ids and transaction payloads, so protect its history and logs as well.

## API and development

ESPN's fantasy API is unofficial and can change without notice. Reads use `lm-api-reads.fantasy.espn.com`. Writes use `lm-api-writes.fantasy.espn.com`. This project is not affiliated with ESPN.

Payload builders live in `src/espn/transactions.ts`. ESPN ids, views, filter sort keys, endpoints and protocol constants live in `src/espn/constants.ts`. Only the NFL team schedule index is cached, per server instance. Other data is fetched for each tool call. There are no automatic retries.

```sh
npm run typecheck
npm test
npm run build
```

The tests inject fetch and use local fixtures. They do not contact ESPN. CI runs these checks on Node 24. On Node 22.12 through 22.17, direct TypeScript test execution requires `NODE_OPTIONS=--experimental-strip-types`; compiled server execution does not.

## License

MIT. See [LICENSE](LICENSE).
