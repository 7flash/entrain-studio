import { db } from "./db";
import { findSoundtrack } from "./soundtracks";
import { dbMeasure } from "./measure";

const ROOM_TTL_MS = 24 * 60 * 60_000;
const PRESENCE_TTL_MS = 35_000;

export type SyncRoomState = "idle" | "playing" | "paused";

export type SyncRoomParticipant = {
  clientId: string;
  label: string;
  publicKey?: string;
  isHost: boolean;
  joinedAt: number;
  lastSeenAt: number;
  clientOffsetMs?: number;
  rttMs?: number;
};

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
  hostPresent: boolean;
  participantCount: number;
  participants: SyncRoomParticipant[];
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
  const row = db.syncRooms
    .select()
    .where({ roomId: normalizeRoomId(roomId) })
    .first() as any;
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
  opts: { delaySec?: number } = {},
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
      const delay = Math.max(0, Math.min(120, Number(opts.delaySec || 0)));
      patch.state = "playing";
      patch.startedAt = now + delay * 1000 - Math.max(0, offset) * 1000;
      patch.pausedOffsetSec = Math.max(0, offset);
    } else if (action === "pause") {
      patch.state = "paused";
      patch.pausedOffsetSec = elapsedSec(row, now);
    } else if (action === "stop") {
      patch.state = "idle";
      patch.startedAt = 0;
      patch.pausedOffsetSec = 0;
    }
    db.syncRooms
      .update(patch)
      .where({ roomId: normalizeRoomId(roomId) })
      .run();
    return toPublic(getSyncRoom(roomId) as any);
  });
}

export function heartbeatSyncRoom(
  roomId: string,
  body: {
    clientId?: string;
    label?: string;
    publicKey?: string;
    hostKey?: string;
    clientOffsetMs?: number;
    rttMs?: number;
  },
) {
  return dbMeasure.measure.assert("Heartbeat sync room presence", () => {
    const row = getSyncRoom(roomId) as any;
    if (!row) throw new Error("Room not found or expired");
    const now = Date.now();
    const clientId = String(body.clientId || "").trim() || crypto.randomUUID();
    const existing = db.syncRoomPresence
      .select()
      .where({ roomId: row.roomId, clientId })
      .first() as any;
    const patch = {
      roomId: row.roomId,
      clientId,
      label: String(body.label || body.publicKey || "listener").slice(0, 80),
      publicKey: body.publicKey ? String(body.publicKey) : undefined,
      isHost: Boolean(body.hostKey && body.hostKey === row.hostKey),
      clientOffsetMs: Number.isFinite(Number(body.clientOffsetMs))
        ? Number(body.clientOffsetMs)
        : undefined,
      rttMs: Number.isFinite(Number(body.rttMs))
        ? Number(body.rttMs)
        : undefined,
      joinedAt: existing?.joinedAt || now,
      lastSeenAt: now,
    };
    if (existing)
      db.syncRoomPresence
        .update(patch)
        .where({ roomId: row.roomId, clientId })
        .run();
    else db.syncRoomPresence.insert(patch);
    prunePresence(row.roomId, now);
    return { clientId, room: toPublic(getSyncRoom(row.roomId) as any) };
  });
}

export function leaveSyncRoom(roomId: string, clientId: string) {
  return dbMeasure.measure.assert("Leave sync room", () => {
    db.syncRoomPresence
      .delete()
      .where({ roomId: normalizeRoomId(roomId), clientId })
      .run();
    const row = getSyncRoom(roomId) as any;
    return row ? toPublic(row) : null;
  });
}

export function toPublic(row: any): SyncRoomPublic {
  const now = Date.now();
  const roomId = String(row.roomId);
  prunePresence(roomId, now);
  const participants = participantsForRoom(roomId, now);
  return {
    roomId,
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
    hostPresent: participants.some((p) => p.isHost),
    participantCount: participants.length,
    participants,
  };
}

function participantsForRoom(
  roomId: string,
  now = Date.now(),
): SyncRoomParticipant[] {
  const rows = db.syncRoomPresence.select().where({ roomId }).all() as any[];
  return rows
    .filter((r) => Number(r.lastSeenAt || 0) >= now - PRESENCE_TTL_MS)
    .sort((a, b) => Number(a.joinedAt || 0) - Number(b.joinedAt || 0))
    .slice(0, 80)
    .map((r) => ({
      clientId: String(r.clientId),
      label: String(r.label || "listener"),
      publicKey: r.publicKey ? String(r.publicKey) : undefined,
      isHost: Boolean(r.isHost),
      joinedAt: Number(r.joinedAt || 0),
      lastSeenAt: Number(r.lastSeenAt || 0),
      clientOffsetMs:
        r.clientOffsetMs === undefined ? undefined : Number(r.clientOffsetMs),
      rttMs: r.rttMs === undefined ? undefined : Number(r.rttMs),
    }));
}

function prunePresence(roomId: string, now = Date.now()) {
  try {
    const rows = db.syncRoomPresence.select().where({ roomId }).all() as any[];
    for (const r of rows)
      if (Number(r.lastSeenAt || 0) < now - PRESENCE_TTL_MS)
        db.syncRoomPresence
          .delete()
          .where({ roomId, clientId: r.clientId })
          .run();
  } catch {
    // Presence is best-effort; room timing remains authoritative.
  }
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

function normalizeRoomId(roomId: string) {
  return String(roomId || "")
    .trim()
    .toUpperCase();
}
