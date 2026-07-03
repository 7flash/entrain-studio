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
      session: z.any(),
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
      creatorWallet: z.string().optional(),
      publishedByUser: z.boolean().default(false),
      marketKind: z.string().default("token"), // free | token | paid | token_plus_paid
      priceLamports: z.number().default(0),
      priceCurrency: z.string().default("SOL"),
      payoutWallet: z.string().optional(),
      purchaseCount: z.number().default(0),
      ...timestamps,
    }),
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
      publicKey: z.string(),
      slug: z.string(),
      sourceSlug: z.string().optional(),
      name: z.string(),
      description: z.string().optional(),
      tags: z.array(z.string()).default([]),
      session: z.any(),
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
