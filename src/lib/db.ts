import { Database, z } from "sqlite-zod-orm";
import type { EntrainSessionV1, TemplateTier } from "@/format/entrain-format";

const nowDefault = () => Date.now();

const timestamps = {
  createdAt: z.number().default(nowDefault),
  updatedAt: z.number().default(nowDefault),
};

export const db = new Database(
  process.env.DB_PATH || "entrain.db",
  {
    templates: z.object({
      slug: z.string(),
      title: z.string(),
      summary: z.string(),
      description: z.string(),
      category: z.string().default("focus"),
      tier: z.string().default("free"),
      tags: z.array(z.string()).default([]),
      minTokens: z.number().default(0),
      unlockNote: z.string().optional(),
      session: z.any(), // compiled runtime cache used by the player
      scriptFormat: z.string().default("sbagen.v1"),
      scriptText: z.string().default(""),
      sortOrder: z.number().default(0),
      isPublished: z.boolean().default(true),
      status: z.string().default("published"),
      formatVersion: z.string().default("entrain.session.v1"),
      patternHash: z.string().optional(),
      createdBy: z.string().optional(),
      updatedBy: z.string().optional(),
      analysisJson: z.any().optional(),
      safetyJson: z.any().optional(),
      evidenceLevel: z.string().default("experimental"),
      headphonesRequired: z.boolean().default(false),
      defaultLoopMode: z.string().default("hold-last"),
      defaultExportSec: z.number().optional(),
      lineageJson: z.any().optional(),
      referenceMatchJson: z.any().optional(),
      seedRevision: z.string().default("builtin-v10"),
      copyReviewed: z.boolean().default(false),
      ownerPublicKey: z.string().optional(),
      creatorName: z.string().optional(),
      ownerEmail: z.string().optional(),
      creatorWallet: z.string().optional(),
      publishedByUser: z.boolean().default(false),
      marketKind: z.string().default("token"), // free | token | paid | token_plus_paid
      priceLamports: z.number().default(0),
      priceCurrency: z.string().default("SOL"),
      payoutWallet: z.string().optional(),
      purchaseCount: z.number().default(0),
      ...timestamps,
    }),
    users: z.object({
      userId: z.string(),
      googleSub: z.string(),
      email: z.string(),
      name: z.string().optional(),
      picture: z.string().optional(),
      lastLoginAt: z.number().optional(),
      ...timestamps,
    }),
    userSessions: z.object({
      sessionId: z.string(),
      userId: z.string(),
      email: z.string(),
      expiresAt: z.number(),
      ...timestamps,
    }),

    // Legacy wallet/payment tables are retained only so older local DBs keep migrating.
    walletChallenges: z.object({
      publicKey: z.string(),
      nonce: z.string(),
      message: z.string(),
      expiresAt: z.number(),
      used: z.boolean().default(false),
      consumeToken: z.string().optional(),
      ...timestamps,
    }),
    walletSessions: z.object({
      sessionId: z.string(),
      publicKey: z.string(),
      balance: z.number().default(0),
      expiresAt: z.number(),
      lastRefreshedAt: z.number().default(0),
      ...timestamps,
    }),
    creatorProfiles: z.object({
      publicKey: z.string(),
      displayName: z.string(),
      bio: z.string().optional(),
      payoutWallet: z.string(),
      ...timestamps,
    }),
    purchaseIntents: z.object({
      intentId: z.string(),
      publicKey: z.string(),
      slug: z.string(),
      payoutWallet: z.string(),
      baseLamports: z.number(),
      expectedLamports: z.number(),
      memo: z.string(),
      expiresAt: z.number(),
      consumed: z.boolean().default(false),
      txSignature: z.string().optional(),
      ...timestamps,
    }),
    soundtrackPurchases: z.object({
      publicKey: z.string(),
      slug: z.string(),
      sellerPublicKey: z.string().optional(),
      payoutWallet: z.string(),
      priceLamports: z.number(),
      currency: z.string().default("SOL"),
      txSignature: z.string(),
      status: z.string().default("confirmed"),
      ...timestamps,
    }),
    savedSessions: z.object({
      publicKey: z.string(), // legacy name; now stores userId for Google accounts
      userId: z.string().optional(),
      ownerEmail: z.string().optional(),
      slug: z.string(),
      sourceSlug: z.string().optional(),
      name: z.string(),
      description: z.string().optional(),
      tags: z.array(z.string()).default([]),
      session: z.any(),
      scriptFormat: z.string().default("entrain-script.v1"),
      scriptText: z.string().default(""),
      shareId: z.string().optional(),
      isShared: z.boolean().default(true),
      shareCreatedAt: z.number().optional(),
      isFavorite: z.boolean().default(false),
      lastPlayedAt: z.number().optional(),
      ...timestamps,
    }),
    playEvents: z.object({
      publicKey: z.string().optional(),
      soundtrackSlug: z.string().optional(),
      savedSessionId: z.number().optional(),
      action: z.string(),
      ...timestamps,
    }),
    syncRooms: z.object({
      roomId: z.string(),
      hostKey: z.string(),
      slug: z.string(),
      title: z.string().optional(),
      state: z.string().default("idle"), // idle | playing | paused
      startedAt: z.number().default(0), // Unix ms; elapsed = serverNow - startedAt while playing
      pausedOffsetSec: z.number().default(0),
      createdBy: z.string().optional(),
      expiresAt: z.number(),
      ...timestamps,
    }),
    syncRoomPresence: z.object({
      roomId: z.string(),
      clientId: z.string(),
      label: z.string().default("listener"),
      publicKey: z.string().optional(),
      isHost: z.boolean().default(false),
      clientOffsetMs: z.number().optional(),
      rttMs: z.number().optional(),
      joinedAt: z.number(),
      lastSeenAt: z.number(),
      rewardCursorAt: z.number().optional(),
      rewardTotalMicro: z.number().default(0),
      ...timestamps,
    }),
    internalBalances: z.object({
      publicKey: z.string(),
      availableMicro: z.number().default(0),
      lifetimeEarnedMicro: z.number().default(0),
      lifetimeWithdrawnMicro: z.number().default(0),
      lastEarnedAt: z.number().optional(),
      ...timestamps,
    }),
    rewardEvents: z.object({
      eventId: z.string(),
      publicKey: z.string(),
      roomId: z.string(),
      soundtrackSlug: z.string(),
      amountMicro: z.number(),
      secondsCredited: z.number(),
      roomElapsedSec: z.number().default(0),
      reason: z.string().default("synced-room-listen"),
      ...timestamps,
    }),
    withdrawalRequests: z.object({
      requestId: z.string(),
      publicKey: z.string(),
      destinationWallet: z.string(),
      amountMicro: z.number(),
      status: z.string().default("pending"), // pending | paid | rejected
      note: z.string().optional(),
      ...timestamps,
    }),
  },
  {
    // We define timestamp columns explicitly in each table schema above.
    // sqlite-zod-orm's global timestamps option also injects createdAt/updatedAt.
    // Leaving it enabled after adding creator/purchase/sync tables caused:
    // SQLiteError: duplicate column name: createdAt
    timestamps: false,
    relations: {},
  },
);

export type TemplateRow = {
  id?: number;
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  tier: TemplateTier;
  tags: string[];
  minTokens: number;
  unlockNote?: string;
  session: EntrainSessionV1;
  scriptFormat?: string;
  scriptText?: string;
  sortOrder: number;
  isPublished: boolean;
  status?: string;
  formatVersion?: string;
  patternHash?: string;
  analysisJson?: any;
  safetyJson?: any;
  evidenceLevel?: string;
  headphonesRequired?: boolean;
  defaultLoopMode?: string;
  defaultExportSec?: number;
  lineageJson?: any;
  referenceMatchJson?: any;
  seedRevision?: string;
  copyReviewed?: boolean;
  ownerPublicKey?: string;
  creatorName?: string;
  ownerEmail?: string;
  creatorWallet?: string;
  publishedByUser?: boolean;
  marketKind?: string;
  priceLamports?: number;
  priceCurrency?: string;
  payoutWallet?: string;
  purchaseCount?: number;
  createdAt?: number;
  updatedAt?: number;
};

let lastMaintenanceSweep = 0;
export function sweepExpiredRows(now = Date.now()) {
  if (now - lastMaintenanceSweep < 10 * 60_000) return;
  lastMaintenanceSweep = now;
  try {
    for (const row of db.walletChallenges.select().all() as any[])
      if (Number(row.expiresAt || 0) < now - 60_000)
        db.walletChallenges.delete().where({ nonce: row.nonce }).run();
    for (const row of db.userSessions.select().all() as any[])
      if (Number(row.expiresAt || 0) < now)
        db.userSessions.delete().where({ sessionId: row.sessionId }).run();
    for (const row of db.walletSessions.select().all() as any[])
      if (Number(row.expiresAt || 0) < now)
        db.walletSessions.delete().where({ sessionId: row.sessionId }).run();
    for (const row of db.purchaseIntents.select().all() as any[])
      if (Number(row.expiresAt || 0) < now || row.consumed)
        db.purchaseIntents.delete().where({ intentId: row.intentId }).run();
    for (const row of db.syncRooms.select().all() as any[])
      if (Number(row.expiresAt || 0) < now) {
        db.syncRooms.delete().where({ roomId: row.roomId }).run();
        for (const p of db.syncRoomPresence
          .select()
          .where({ roomId: row.roomId })
          .all() as any[])
          db.syncRoomPresence
            .delete()
            .where({ roomId: row.roomId, clientId: p.clientId })
            .run();
      }
    for (const row of db.playEvents.select().all() as any[])
      if (Number(row.createdAt || 0) < now - 30 * 24 * 60 * 60_000)
        db.playEvents.delete().where({ id: row.id }).run();
    for (const row of db.rewardEvents.select().all() as any[])
      if (Number(row.createdAt || 0) < now - 180 * 24 * 60 * 60_000)
        db.rewardEvents.delete().where({ eventId: row.eventId }).run();
  } catch (e) {
    console.warn("[ENTRAIN] maintenance sweep failed", e);
  }
}

sweepExpiredRows();
