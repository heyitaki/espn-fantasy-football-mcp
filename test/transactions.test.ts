import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lineupPayload,
  freeAgentPayload,
  waiverPayload,
  cancelWaiverPayload,
} from "../src/espn/transactions.ts";
import { SWID } from "./helpers.ts";

const base = { teamId: 7, swid: SWID, scoringPeriodId: 5 };

test("lineupPayload builds a ROSTER transaction with one LINEUP item per move", () => {
  const payload = lineupPayload({
    ...base,
    moves: [
      { playerId: 4429795, fromSlotId: 20, toSlotId: 2 },
      { playerId: 4890973, fromSlotId: 2, toSlotId: 20 },
    ],
  });
  assert.deepEqual(payload, {
    isLeagueManager: false,
    teamId: 7,
    type: "ROSTER",
    memberId: SWID,
    scoringPeriodId: 5,
    executionType: "EXECUTE",
    items: [
      { playerId: 4429795, type: "LINEUP", fromLineupSlotId: 20, toLineupSlotId: 2 },
      { playerId: 4890973, type: "LINEUP", fromLineupSlotId: 2, toLineupSlotId: 20 },
    ],
  });
});

test("freeAgentPayload adds, and drops only when a drop is given", () => {
  assert.deepEqual(freeAgentPayload({ ...base, addPlayerId: 4697815 }), {
    isLeagueManager: false,
    teamId: 7,
    type: "FREEAGENT",
    memberId: SWID,
    scoringPeriodId: 5,
    executionType: "EXECUTE",
    items: [{ playerId: 4697815, type: "ADD", toTeamId: 7 }],
  });
  const withDrop = freeAgentPayload({ ...base, addPlayerId: 4697815, dropPlayerId: 4429795 });
  assert.deepEqual(withDrop.items, [
    { playerId: 4697815, type: "ADD", toTeamId: 7 },
    { playerId: 4429795, type: "DROP", fromTeamId: 7 },
  ]);
});

test("freeAgentPayload supports a drop-only transaction", () => {
  const payload = freeAgentPayload({ ...base, dropPlayerId: 4429795 });
  assert.equal(payload.type, "FREEAGENT");
  assert.deepEqual(payload.items, [{ playerId: 4429795, type: "DROP", fromTeamId: 7 }]);
});

test("waiverPayload is a WAIVER transaction with a bidAmount that defaults to 0", () => {
  const payload = waiverPayload({ ...base, addPlayerId: 4569618, dropPlayerId: 4429795 });
  assert.deepEqual(payload, {
    isLeagueManager: false,
    teamId: 7,
    type: "WAIVER",
    memberId: SWID,
    scoringPeriodId: 5,
    executionType: "EXECUTE",
    bidAmount: 0,
    items: [
      { playerId: 4569618, type: "ADD", toTeamId: 7 },
      { playerId: 4429795, type: "DROP", fromTeamId: 7 },
    ],
  });
  assert.equal(waiverPayload({ ...base, addPlayerId: 4569618, bid: 12 }).bidAmount, 12);
});

test("cancelWaiverPayload references the pending transaction", () => {
  assert.deepEqual(cancelWaiverPayload({ ...base, transactionId: "abc-123" }), {
    isLeagueManager: false,
    teamId: 7,
    type: "WAIVER",
    memberId: SWID,
    scoringPeriodId: 5,
    executionType: "CANCEL",
    relatedTransactionId: "abc-123",
  });
});
