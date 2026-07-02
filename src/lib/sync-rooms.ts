import { db } from "./db";
import { findSoundtrack } from "./soundtracks";
import { dbMeasure } from "./measure";

const ROOM_TTL_MS = 24 * 60 * 60_000;

export type SyncRoomState = "idle" | "playing" | "paused";

export type SyncRoomPublic = {
  roomId: string;
  slug: string;
  title?: string;
  state: SyncRoomState;
  serverNow: number;
  startedAt: number;
  pausedOffsetSec: number;
  elapsedSec: number;
  expiresAt: number;
  updatedAt: number;
};

export function createSyncRoom(slug: string, createdBy?: string) {
  return dbMeasure.measure.assert("Create sync room", () => {
    const soundtrack = findSoundtrack(slug);
    if (!soundtrack) throw new Error("Soundtrack not found");
    const roomId = makeRoomId();
    const hostKey = crypto.randomUUID();
    const now = Date.now();
    const row = db.syncRooms.insert({
      roomId,
      hostKey,
      slug: soundtrack.slug,
      title: soundtrack.title,
      state: "idle",
      startedAt: 0,
      pausedOffsetSec: 0,
      createdBy,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + ROOM_TTL_MS,
    }) as any;
    return { room: toPublic(row), hostKey };
  });
}

export function getSyncRoom(roomId: string) {
  const row = db.syncRooms.select().where({ roomId }).first() as any;
  if (!row || Number(row.expiresAt || 0) < Date.now()) return null;
  return row;
}

export function publicSyncRoom(roomId: string) {
  return dbMeasure.measure.assert("Read sync room", () => {
    const row = getSyncRoom(roomId);
    return row ? toPublic(row) : null;
  });
}

export function controlSyncRoom(
  roomId: string,
  hostKey: string,
  action: "start" | "pause" | "stop" | "ping",
) {
  return dbMeasure.measure.assert("Control sync room", () => {
    const row = getSyncRoom(roomId) as any;
    if (!row) throw new Error("Room not found or expired");
    if (!hostKey || hostKey !== row.hostKey)
      throw new Error("Host key required");
    const now = Date.now();
    const patch: any = { updatedAt: now, expiresAt: now + ROOM_TTL_MS };
    if (action === "start") {
      const offset =
        row.state === "paused"
          ? Number(row.pausedOffsetSec || 0)
          : elapsedSec(row, now);
      patch.state = "playing";
      patch.startedAt = now - Math.max(0, offset) * 1000;
      patch.pausedOffsetSec = Math.max(0, offset);
    } else if (action === "pause") {
      patch.state = "paused";
      patch.pausedOffsetSec = elapsedSec(row, now);
    } else if (action === "stop") {
      patch.state = "idle";
      patch.startedAt = 0;
      patch.pausedOffsetSec = 0;
    }
    db.syncRooms.update(patch).where({ roomId }).run();
    return toPublic(getSyncRoom(roomId) as any);
  });
}

export function toPublic(row: any): SyncRoomPublic {
  const now = Date.now();
  return {
    roomId: String(row.roomId),
    slug: String(row.slug),
    title: row.title ? String(row.title) : undefined,
    state:
      row.state === "playing" || row.state === "paused" ? row.state : "idle",
    serverNow: now,
    startedAt: Number(row.startedAt || 0),
    pausedOffsetSec: Number(row.pausedOffsetSec || 0),
    elapsedSec: elapsedSec(row, now),
    expiresAt: Number(row.expiresAt || 0),
    updatedAt: Number(row.updatedAt || 0),
  };
}

function elapsedSec(row: any, now = Date.now()) {
  if (row?.state === "playing" && Number(row.startedAt || 0) > 0)
    return Math.max(0, (now - Number(row.startedAt)) / 1000);
  return Math.max(0, Number(row?.pausedOffsetSec || 0));
}

function makeRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let tries = 0; tries < 20; tries++) {
    let out = "";
    const bytes = new Uint8Array(7);
    crypto.getRandomValues(bytes);
    for (const b of bytes) out += alphabet[b % alphabet.length];
    if (!db.syncRooms.select().where({ roomId: out }).first()) return out;
  }
  return crypto.randomUUID().slice(0, 8).toUpperCase();
}
