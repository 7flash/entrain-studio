import { db } from "./db";
import { TOKEN_DISPLAY_NAME } from "./config";

export const REWARD_TICK_SEC = Number(process.env.ROOM_REWARD_TICK_SEC || 10);
export const REWARD_TOKENS_PER_MINUTE = Number(
  process.env.ROOM_REWARD_TOKENS_PER_MINUTE || 1,
);
export const TOKEN_MICRO = 1_000_000;
const MIN_WITHDRAW_MICRO =
  Number(process.env.MIN_WITHDRAW_TOKENS || 10) * TOKEN_MICRO;

export type RewardBalance = {
  publicKey: string;
  availableMicro: number;
  lifetimeEarnedMicro: number;
  lifetimeWithdrawnMicro: number;
  available: number;
  lifetimeEarned: number;
  lifetimeWithdrawn: number;
};

export function formatRewardAmount(micro: number) {
  const n = micro / TOKEN_MICRO;
  return `${trimNumber(n)} ${TOKEN_DISPLAY_NAME}`;
}

export function rewardConfig() {
  return {
    tickSec: REWARD_TICK_SEC,
    tokensPerMinute: REWARD_TOKENS_PER_MINUTE,
    tokenLabel: TOKEN_DISPLAY_NAME,
    minWithdrawMicro: MIN_WITHDRAW_MICRO,
    minWithdraw: MIN_WITHDRAW_MICRO / TOKEN_MICRO,
  };
}

export function getRewardBalance(publicKey: string): RewardBalance {
  const pk = String(publicKey);
  let row = db.internalBalances
    .select()
    .where({ publicKey: pk })
    .first() as any;
  const now = Date.now();
  if (!row) {
    row = db.internalBalances.insert({
      publicKey: pk,
      availableMicro: 0,
      lifetimeEarnedMicro: 0,
      lifetimeWithdrawnMicro: 0,
      createdAt: now,
      updatedAt: now,
    }) as any;
  }
  const availableMicro = Number(row.availableMicro || 0);
  const lifetimeEarnedMicro = Number(row.lifetimeEarnedMicro || 0);
  const lifetimeWithdrawnMicro = Number(row.lifetimeWithdrawnMicro || 0);
  return {
    publicKey: pk,
    availableMicro,
    lifetimeEarnedMicro,
    lifetimeWithdrawnMicro,
    available: availableMicro / TOKEN_MICRO,
    lifetimeEarned: lifetimeEarnedMicro / TOKEN_MICRO,
    lifetimeWithdrawn: lifetimeWithdrawnMicro / TOKEN_MICRO,
  };
}

export function awardRoomListening(
  publicKey: string,
  room: any,
  presence: any,
  now = Date.now(),
) {
  const pk = String(publicKey || "").trim();
  if (!pk || !room || room.state !== "playing")
    return { amountMicro: 0, secondsCredited: 0, cursorAt: now };
  const tickMs = Math.max(1, REWARD_TICK_SEC) * 1000;
  const joinedAt = Number(presence?.joinedAt || now);
  const last = Number(presence?.rewardCursorAt || joinedAt || now);
  const start = Math.max(last, joinedAt, Number(room.startedAt || now));
  const elapsedMs = Math.max(0, now - start);
  const ticks = Math.floor(elapsedMs / tickMs);
  if (ticks <= 0)
    return { amountMicro: 0, secondsCredited: 0, cursorAt: start };
  const secondsCredited = ticks * Math.max(1, REWARD_TICK_SEC);
  const amountMicro = Math.floor(
    (REWARD_TOKENS_PER_MINUTE * TOKEN_MICRO * secondsCredited) / 60,
  );
  if (amountMicro <= 0)
    return {
      amountMicro: 0,
      secondsCredited,
      cursorAt: start + ticks * tickMs,
    };
  addReward(pk, {
    roomId: String(room.roomId),
    soundtrackSlug: String(room.slug || ""),
    amountMicro,
    secondsCredited,
    roomElapsedSec: roomElapsedSec(room, now),
  });
  return { amountMicro, secondsCredited, cursorAt: start + ticks * tickMs };
}

export function addReward(
  publicKey: string,
  event: {
    roomId: string;
    soundtrackSlug: string;
    amountMicro: number;
    secondsCredited: number;
    roomElapsedSec?: number;
  },
) {
  const pk = String(publicKey);
  const now = Date.now();
  const bal = getRewardBalance(pk);
  db.internalBalances
    .update({
      availableMicro: bal.availableMicro + event.amountMicro,
      lifetimeEarnedMicro: bal.lifetimeEarnedMicro + event.amountMicro,
      lastEarnedAt: now,
      updatedAt: now,
    })
    .where({ publicKey: pk })
    .run();
  const row = db.rewardEvents.insert({
    eventId: crypto.randomUUID(),
    publicKey: pk,
    roomId: event.roomId,
    soundtrackSlug: event.soundtrackSlug,
    amountMicro: event.amountMicro,
    secondsCredited: event.secondsCredited,
    roomElapsedSec: event.roomElapsedSec || 0,
    reason: "synced-room-listen",
    createdAt: now,
    updatedAt: now,
  }) as any;
  return row;
}

export function createWithdrawal(
  publicKey: string,
  amountTokens: number,
  destinationWallet?: string,
) {
  const pk = String(publicKey);
  const amountMicro = Math.floor(Number(amountTokens || 0) * TOKEN_MICRO);
  if (!Number.isFinite(amountMicro) || amountMicro <= 0)
    throw new Error("Withdrawal amount must be positive.");
  if (amountMicro < MIN_WITHDRAW_MICRO)
    throw new Error(
      `Minimum withdrawal is ${formatRewardAmount(MIN_WITHDRAW_MICRO)}.`,
    );
  const dest = String(destinationWallet || pk).trim();
  if (!dest) throw new Error("Destination wallet required.");
  const bal = getRewardBalance(pk);
  if (bal.availableMicro < amountMicro)
    throw new Error(
      `Insufficient internal balance. Available: ${formatRewardAmount(bal.availableMicro)}.`,
    );
  const now = Date.now();
  db.internalBalances
    .update({
      availableMicro: bal.availableMicro - amountMicro,
      lifetimeWithdrawnMicro: bal.lifetimeWithdrawnMicro + amountMicro,
      updatedAt: now,
    })
    .where({ publicKey: pk })
    .run();
  return db.withdrawalRequests.insert({
    requestId: crypto.randomUUID(),
    publicKey: pk,
    destinationWallet: dest,
    amountMicro,
    status: "pending",
    note: "Manual payout queue. No hot wallet is used by the app server.",
    createdAt: now,
    updatedAt: now,
  }) as any;
}

export function rewardHistory(publicKey: string, limit = 50) {
  const pk = String(publicKey);
  const events = (
    db.rewardEvents
      .select()
      .where({ publicKey: pk })
      .orderBy("createdAt", "DESC")
      .limit(limit)
      .all() as any[]
  ).map(formatRewardEvent);
  const withdrawals = (
    db.withdrawalRequests
      .select()
      .where({ publicKey: pk })
      .orderBy("createdAt", "DESC")
      .limit(limit)
      .all() as any[]
  ).map((w) => ({
    ...w,
    amount: Number(w.amountMicro || 0) / TOKEN_MICRO,
    amountLabel: formatRewardAmount(Number(w.amountMicro || 0)),
  }));
  return { events, withdrawals };
}

export function formatRewardEvent(e: any) {
  return {
    ...e,
    amount: Number(e.amountMicro || 0) / TOKEN_MICRO,
    amountLabel: formatRewardAmount(Number(e.amountMicro || 0)),
  };
}

function roomElapsedSec(room: any, now = Date.now()) {
  if (room?.state === "playing" && Number(room.startedAt || 0) > 0)
    return Math.max(0, (now - Number(room.startedAt || 0)) / 1000);
  return Math.max(0, Number(room?.pausedOffsetSec || 0));
}

function trimNumber(n: number) {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString();
  return n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}
