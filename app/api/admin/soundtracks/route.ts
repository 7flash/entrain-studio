import { db } from "@/lib/db";
import { isAdminRequest } from "@/lib/admin-auth";
import { sanitizeSession } from "@/format/entrain-format";
import { analyzeSession, claimRisk } from "@/format/protocol-analyzer";
import { compareToReference } from "@/format/protocol-reference";
import { json, readJson } from "@/lib/http";
import { tierForMinTokens, patternHash } from "@/lib/templates";

type Body = {
  adminToken?: string;
  action?: "upsert" | "delete";
  slug?: string;
  title?: string;
  summary?: string;
  description?: string;
  category?: string;
  tags?: string[] | string;
  minTokens?: number;
  unlockNote?: string;
  session?: any;
  sortOrder?: number;
  isPublished?: boolean;
  status?: "draft" | "published" | "archived";
  analysisJson?: any;
  safetyJson?: any;
  evidenceLevel?: string;
  defaultLoopMode?: string;
  defaultExportSec?: number;
  lineageJson?: any;
  seedRevision?: string;
  copyReviewed?: boolean;
};

export async function GET(req: Request) {
  if (!isAdminRequest(req))
    return json({ ok: false, error: "admin token required" }, { status: 401 });
  const rows = db.templates.select().orderBy("sortOrder", "ASC").all();
  return json({ ok: true, soundtracks: rows });
}

export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!isAdminRequest(req, body))
    return json({ ok: false, error: "admin token required" }, { status: 401 });
  const action = body?.action || "upsert";
  const slug = String(body?.slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  if (!slug)
    return json({ ok: false, error: "slug required" }, { status: 400 });

  if (action === "delete") {
    const row = db.templates.select().where({ slug }).first() as any;
    if (!row) return json({ ok: false, error: "not found" }, { status: 404 });
    try {
      db.templates.delete().where({ slug }).run();
    } catch {
      db.templates.update({ isPublished: false }).where({ slug }).run();
    }
    return json({ ok: true, deleted: slug });
  }

  const minTokens = Number(body?.minTokens || 0);
  const tags = Array.isArray(body?.tags)
    ? body!.tags
    : String(body?.tags || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
  const session = sanitizeSession(
    body?.session || { name: body?.title || slug, durationMin: 20, layers: [] },
  );
  const analysis = analyzeSession(session);
  const lineageJson =
    body?.lineageJson && typeof body.lineageJson === "object"
      ? body.lineageJson
      : null;
  const referenceMatch = compareToReference(session, lineageJson?.referenceId);
  const claims = claimRisk(
    `${body?.title || ""} ${body?.summary || ""} ${body?.description || ""} ${body?.unlockNote || ""}`,
    { reviewed: !!body?.copyReviewed },
  );
  const wantsPublished =
    body?.isPublished !== false &&
    body?.status !== "draft" &&
    body?.status !== "archived";
  if (wantsPublished && (!analysis.publishable || claims.risky))
    return json(
      { ok: false, error: "publish blocked by analyzer", analysis, claims },
      { status: 422 },
    );
  if (wantsPublished && referenceMatch && !referenceMatch.matches)
    return json(
      {
        ok: false,
        error: "publish blocked by declared reference mismatch",
        referenceMatch,
      },
      { status: 422 },
    );
  const row = {
    slug,
    title: String(body?.title || session.name || slug).slice(0, 160),
    summary: String(body?.summary || "").slice(0, 500),
    description: String(body?.description || "").slice(0, 5000),
    category: String(body?.category || "custom").slice(0, 80),
    tier: tierForMinTokens(minTokens),
    tags,
    minTokens,
    unlockNote: String(body?.unlockNote || "").slice(0, 1000),
    session,
    sortOrder: Number(body?.sortOrder || 0),
    isPublished: wantsPublished,
    status:
      body?.status || (body?.isPublished === false ? "draft" : "published"),
    formatVersion: "entrain.session.v1",
    patternHash: patternHash(session),
    analysisJson: analysis,
    safetyJson: { claims, referenceMatch },
    evidenceLevel: String(body?.evidenceLevel || "experimental"),
    headphonesRequired: analysis.headphonesRequired,
    defaultLoopMode: session.loop?.mode || "hold-last",
    defaultExportSec: Number(
      body?.defaultExportSec || session.durationMin * 60,
    ),
    lineageJson,
    referenceMatchJson: referenceMatch,
    seedRevision: String(body?.seedRevision || "admin"),
    copyReviewed: !!body?.copyReviewed,
  };
  const existing = db.templates.select().where({ slug }).first() as any;
  if (existing) db.templates.update(row).where({ slug }).run();
  else db.templates.insert(row);
  return json({ ok: true, soundtrack: row });
}
