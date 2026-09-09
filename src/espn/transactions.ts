import { EXECUTION_TYPE, ITEM_TYPE, TRANSACTION_TYPE } from "./constants.ts";

export interface TransactionOptions {
  teamId: number;
  swid: string;
  scoringPeriodId: number;
}

export interface LineupMove {
  playerId: number;
  fromSlotId: number;
  toSlotId: number;
}

export interface FreeAgentOptions extends TransactionOptions {
  addPlayerId?: number | undefined;
  dropPlayerId?: number | undefined;
}

export type TransactionItem =
  | { playerId: number; type: typeof ITEM_TYPE.add; toTeamId: number }
  | { playerId: number; type: typeof ITEM_TYPE.drop; fromTeamId: number }
  | { playerId: number; type: typeof ITEM_TYPE.lineup; fromLineupSlotId: number; toLineupSlotId: number };

export function lineupPayload(options: TransactionOptions & { moves: LineupMove[] }) {
  return {
    ...basePayload(options),
    type: TRANSACTION_TYPE.roster,
    items: options.moves.map((move) => ({
      playerId: move.playerId,
      type: ITEM_TYPE.lineup,
      fromLineupSlotId: move.fromSlotId,
      toLineupSlotId: move.toSlotId,
    })),
  };
}

export function freeAgentPayload(options: FreeAgentOptions) {
  const items: TransactionItem[] = [];
  if (options.addPlayerId !== undefined) {
    items.push({ playerId: options.addPlayerId, type: ITEM_TYPE.add, toTeamId: options.teamId });
  }
  if (options.dropPlayerId !== undefined) {
    items.push({ playerId: options.dropPlayerId, type: ITEM_TYPE.drop, fromTeamId: options.teamId });
  }
  return { ...basePayload(options), type: TRANSACTION_TYPE.freeAgent, items };
}

export function waiverPayload(options: FreeAgentOptions & { addPlayerId: number; bid?: number | undefined }) {
  return { ...freeAgentPayload(options), type: TRANSACTION_TYPE.waiver, bidAmount: options.bid ?? 0 };
}

export function cancelWaiverPayload(options: TransactionOptions & { transactionId: string }) {
  return {
    ...basePayload(options),
    type: TRANSACTION_TYPE.waiver,
    executionType: EXECUTION_TYPE.cancel,
    relatedTransactionId: options.transactionId,
  };
}

export type TransactionPayload = ReturnType<
  typeof lineupPayload | typeof freeAgentPayload | typeof waiverPayload | typeof cancelWaiverPayload
>;

function basePayload({ teamId, swid, scoringPeriodId }: TransactionOptions) {
  return {
    isLeagueManager: false,
    teamId,
    memberId: swid,
    scoringPeriodId,
    executionType: EXECUTION_TYPE.execute,
  };
}
