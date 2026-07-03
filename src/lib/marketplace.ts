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

function randomId(prefix = "pi") {
  const c: any = globalThis.crypto;
  if (c?.randomUUID)
    return `${prefix}_${c.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function purchaseMemo(intentId: string, slug: string) {
  return `ENTRAIN purchase ${intentId} ${slug}`.slice(0, 180);
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
    const needsReview =
      priceLamports > 0 || risk.risky || analysis.mixStatus === "hot";
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

export function createPurchaseIntent(publicKey: string, slug: string) {
  if (!publicKey) throw new Error("Wallet required");
  const row = db.templates
    .select()
    .where({ slug, isPublished: true })
    .first() as any;
  if (!row) throw new Error("Soundtrack not found");
  const baseLamports = Number(row.priceLamports || 0);
  const payoutWallet = String(
    row.payoutWallet || row.creatorWallet || row.ownerPublicKey || "",
  );
  if (baseLamports <= 0 || !payoutWallet)
    throw new Error("This soundtrack is not sold by payment.");
  if (hasPurchase(publicKey, slug))
    return {
      alreadyPurchased: true,
      slug,
      priceLamports: 0,
      expectedLamports: 0,
      payoutWallet,
      intentId: "",
      memo: "",
    };
  const intentId = randomId("pi");
  let tag = 0;
  for (let i = 0; i < intentId.length; i++)
    tag = (tag * 33 + intentId.charCodeAt(i)) % 9991;
  const dustLamports = tag + 1;
  const expectedLamports = baseLamports + dustLamports;
  const memo = purchaseMemo(intentId, slug);
  db.purchaseIntents.insert({
    intentId,
    publicKey,
    slug,
    payoutWallet,
    baseLamports,
    expectedLamports,
    memo,
    expiresAt: Date.now() + 15 * 60_000,
    consumed: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as any);
  return {
    slug,
    priceLamports: baseLamports,
    expectedLamports,
    payoutWallet,
    intentId,
    memo,
  };
}

export async function verifySolPayment(
  signature: string,
  expected: {
    buyer: string;
    recipient: string;
    lamports: number;
    memo?: string;
  },
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
          Number(ix.parsed.info?.lamports || 0) === expected.lamports,
      );
      if (!ok)
        throw new Error(
          "Payment transaction does not match required buyer, recipient, and exact intent amount.",
        );
      if (expected.memo) {
        const memo = expected.memo;
        const memoOk = instructions.some(
          (ix: any) =>
            String(ix?.programId || ix?.program || "").includes("Memo") ||
            String(ix?.parsed || ix?.data || "").includes(memo),
        );
        const raw = JSON.stringify(instructions);
        if (!memoOk && !raw.includes(memo))
          throw new Error(
            "Payment transaction is missing the purchase intent memo.",
          );
      }
      return tx;
    },
  );
}

export async function confirmPurchase(
  publicKey: string,
  slug: string,
  txSignature: string,
  intentId?: string,
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
  const reused = db.soundtrackPurchases
    .select()
    .where({ txSignature, status: "confirmed" })
    .first() as any;
  if (reused)
    throw new Error(
      "This transaction signature has already been used for a purchase.",
    );
  if (!intentId)
    throw new Error("Purchase intent required. Start the purchase again.");
  const intent = db.purchaseIntents
    .select()
    .where({ intentId, publicKey, slug, consumed: false })
    .first() as any;
  if (!intent)
    throw new Error(
      "Purchase intent not found or already consumed. Start the purchase again.",
    );
  if (Date.now() > Number(intent.expiresAt || 0))
    throw new Error("Purchase intent expired. Start the purchase again.");
  if (
    String(intent.payoutWallet) !== payoutWallet ||
    Number(intent.baseLamports) !== priceLamports
  )
    throw new Error("Purchase intent no longer matches this soundtrack.");
  await verifySolPayment(txSignature, {
    buyer: publicKey,
    recipient: payoutWallet,
    lamports: Number(intent.expectedLamports),
    memo: String(intent.memo || ""),
  });
  db.purchaseIntents
    .update({ consumed: true, txSignature, updatedAt: Date.now() })
    .where({ intentId })
    .run();
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
    updatedAt: Date.now(),
  });
  try {
    db.templates
      .update({
        purchaseCount: Number(row.purchaseCount || 0) + 1,
        updatedAt: Date.now(),
      })
      .where({ slug })
      .run();
  } catch {}
  return { purchased: true };
}
