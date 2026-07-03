import { db } from "./db";
import { SOLANA_RPC } from "./config";
import { dbMeasure, rpcMeasure } from "./measure";
import { sanitizeSession } from "@/format/entrain-format";
import { analyzeSession, claimRisk } from "@/format/protocol-analyzer";
import { patternHash, tierForMinTokens } from "./templates";

export type CreatorPublishBody = {
  title?: string;
  summary?: string;
  description?: string;
  category?: string;
  tags?: string[];
  session?: unknown;
  priceLamports?: number;
  minTokens?: number;
  creatorName?: string;
  payoutWallet?: string;
  publishNow?: boolean;
};

export function lamportsToSol(lamports: number) {
  return Number(lamports || 0) / 1_000_000_000;
}

export function formatSol(lamports: number) {
  const sol = lamportsToSol(lamports);
  return `${sol.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`;
}

export function slugify(input: string) {
  const base =
    String(input || "soundtrack")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "soundtrack";
  let slug = base;
  let i = 2;
  while (db.templates.select().where({ slug }).first()) slug = `${base}-${i++}`;
  return slug;
}

export function hasPurchase(
  publicKey: string | undefined | null,
  slug: string,
) {
  if (!publicKey) return false;
  return !!db.soundtrackPurchases
    .select()
    .where({ publicKey, slug, status: "confirmed" })
    .first();
}

export function publishCommunitySoundtrack(
  publicKey: string,
  body: CreatorPublishBody,
) {
  return dbMeasure.measure.assert("Publish community soundtrack", () => {
    if (!publicKey) throw new Error("Wallet required");
    const session = sanitizeSession(body.session);
    const title = String(
      body.title || session.name || "Untitled soundtrack",
    ).slice(0, 120);
    const summary = String(
      body.summary ||
        session.description ||
        "Community-created ENTRAIN soundtrack.",
    ).slice(0, 240);
    const description = String(
      body.description || session.description || summary,
    ).slice(0, 4000);
    const priceLamports = Math.max(
      0,
      Math.floor(Number(body.priceLamports || 0)),
    );
    const minTokens = Math.max(0, Math.floor(Number(body.minTokens || 0)));
    const existingProfile = db.creatorProfiles
      .select()
      .where({ publicKey })
      .first() as any;
    const payoutWallet = String(
      body.payoutWallet || existingProfile?.payoutWallet || publicKey,
    ).trim();
    const analysis = analyzeSession(session);
    const risk = claimRisk(`${title}\n${summary}\n${description}`);
    if (!analysis.publishable)
      throw new Error("Fix protocol analyzer errors before publishing.");
    const needsReview = risk.risky || analysis.mixStatus === "hot";
    const published = !!body.publishNow && !needsReview;
    const slug = slugify(title);
    const kind =
      priceLamports > 0 && minTokens > 0
        ? "token_plus_paid"
        : priceLamports > 0
          ? "paid"
          : minTokens > 0
            ? "token"
            : "free";
    const row = db.templates.insert({
      slug,
      title,
      summary,
      description,
      category: String(body.category || "community").slice(0, 80),
      tier: tierForMinTokens(minTokens),
      tags: Array.isArray(body.tags)
        ? body.tags.slice(0, 16).map(String)
        : ["community"],
      minTokens,
      unlockNote:
        priceLamports > 0
          ? `Creator-priced access: ${formatSol(priceLamports)}.`
          : "",
      session,
      sortOrder: 10_000 + Math.floor(Date.now() / 1000),
      isPublished: published,
      status: published ? "published" : "pending",
      formatVersion: "entrain.session.v1",
      patternHash: patternHash(session),
      analysisJson: analysis,
      safetyJson: { claimRisk: risk },
      evidenceLevel: "experimental",
      headphonesRequired: analysis.headphonesRequired,
      defaultLoopMode: session.loop?.mode || "hold-last",
      defaultExportSec: session.durationMin * 60,
      lineageJson: {
        accuracy: "community-original",
        disclosure:
          "Published by a community creator. Not a verified commercial tape reconstruction.",
      },
      referenceMatchJson: null,
      seedRevision: "community",
      copyReviewed: false,
      ownerPublicKey: publicKey,
      creatorName: String(
        body.creatorName || publicKey.slice(0, 4) + "…" + publicKey.slice(-4),
      ).slice(0, 80),
      creatorWallet: publicKey,
      publishedByUser: true,
      marketKind: kind,
      priceLamports,
      priceCurrency: "SOL",
      payoutWallet,
      purchaseCount: 0,
    } as any);
    upsertCreatorProfile(
      publicKey,
      String(body.creatorName || "").trim() || undefined,
      payoutWallet,
    );
    return { row, published, needsReview, analysis, claimRisk: risk };
  });
}

export function upsertCreatorProfile(
  publicKey: string,
  displayName?: string,
  payoutWallet?: string,
  bio?: string,
) {
  const current = db.creatorProfiles
    .select()
    .where({ publicKey })
    .first() as any;
  const row = {
    publicKey,
    displayName: String(
      displayName ||
        current?.displayName ||
        `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`,
    ).slice(0, 80),
    bio: bio != null ? String(bio).slice(0, 1000) : current?.bio,
    payoutWallet: String(payoutWallet || current?.payoutWallet || publicKey),
    updatedAt: Date.now(),
  };
  if (current) db.creatorProfiles.update(row).where({ publicKey }).run();
  else db.creatorProfiles.insert({ ...row, createdAt: Date.now() });
  return db.creatorProfiles.select().where({ publicKey }).first();
}

export async function verifySolPayment(
  signature: string,
  expected: { buyer: string; recipient: string; lamports: number },
) {
  return await rpcMeasure.measure.assert(
    { label: "Verify SOL payment", budget: 1500, timeout: 9000 },
    async () => {
      const res = await fetch(SOLANA_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [
            signature,
            {
              encoding: "jsonParsed",
              maxSupportedTransactionVersion: 0,
              commitment: "confirmed",
            },
          ],
        }),
      });
      const payload = await res.json();
      if (payload.error)
        throw new Error(payload.error.message || "Solana RPC error");
      const tx = payload.result;
      if (!tx)
        throw new Error("Transaction not found yet. Wait a moment and retry.");
      if (tx.meta?.err) throw new Error("Transaction failed on-chain.");
      const instructions = tx.transaction?.message?.instructions || [];
      const ok = instructions.some(
        (ix: any) =>
          ix?.program === "system" &&
          ix?.parsed?.type === "transfer" &&
          ix.parsed.info?.source === expected.buyer &&
          ix.parsed.info?.destination === expected.recipient &&
          Number(ix.parsed.info?.lamports || 0) >= expected.lamports,
      );
      if (!ok)
        throw new Error(
          "Payment transaction does not match required buyer, recipient, and amount.",
        );
      return tx;
    },
  );
}

export async function confirmPurchase(
  publicKey: string,
  slug: string,
  txSignature: string,
) {
  const row = db.templates
    .select()
    .where({ slug, isPublished: true })
    .first() as any;
  if (!row) throw new Error("Soundtrack not found");
  const priceLamports = Number(row.priceLamports || 0);
  const payoutWallet = String(
    row.payoutWallet || row.creatorWallet || row.ownerPublicKey || "",
  );
  if (priceLamports <= 0 || !payoutWallet)
    throw new Error("This soundtrack is not sold by payment.");
  if (hasPurchase(publicKey, slug)) return { alreadyPurchased: true };
  await verifySolPayment(txSignature, {
    buyer: publicKey,
    recipient: payoutWallet,
    lamports: priceLamports,
  });
  db.soundtrackPurchases.insert({
    publicKey,
    slug,
    sellerPublicKey: row.ownerPublicKey || row.creatorWallet || undefined,
    payoutWallet,
    priceLamports,
    currency: "SOL",
    txSignature,
    status: "confirmed",
    createdAt: Date.now(),
  });
  try {
    db.templates
      .update({ purchaseCount: Number(row.purchaseCount || 0) + 1 })
      .where({ slug })
      .run();
  } catch {}
  return { purchased: true };
}
