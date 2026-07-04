import type { EntrainTemplateV1 } from "@/format/entrain-format";
import { sanitizeSession } from "@/format/entrain-format";
import {
  looksLikeSbagen,
  patternTextToSession,
  sbagenTextToSession,
  sessionToPatternText,
} from "@/format/pattern-text";
import { authFromRequest } from "@/lib/access-policy";
import { MAX_PUBLIC_TRACKS_PER_USER } from "@/lib/config";
import { db } from "@/lib/db";
import { json, readJson } from "@/lib/http";
import { rowFromTemplate } from "@/lib/templates";

type Body = {
  title?: string;
  name?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  session?: any;
  scriptFormat?: "sbagen.v1" | "entrain-script.v1";
  scriptText?: string;
};

function slugify(s: string) {
  return (
    String(s || "track")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "track"
  );
}
function uniqueSlug(base: string) {
  for (let i = 0; i < 40; i++) {
    const suffix = Math.random()
      .toString(36)
      .slice(2, i ? 8 : 6);
    const slug = `${base}-${suffix}`;
    if (!db.templates.select().where({ slug }).first()) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
function summaryFrom(title: string, desc: string) {
  return (desc || `Community-published ENTRAIN soundtrack: ${title}`)
    .replace(/\s+/g, " ")
    .slice(0, 220);
}

function compileBody(body: Body) {
  if (body.session) return sanitizeSession(body.session);
  const text = String(body.scriptText || "").trim();
  if (!text) throw new Error("session or scriptText required");
  return looksLikeSbagen(text)
    ? sbagenTextToSession(text).session
    : patternTextToSession(text);
}

export async function POST(req: Request) {
  const auth = authFromRequest(req);
  if (!auth)
    return json(
      {
        ok: false,
        error: "Sign in with Google to publish a public catalogue track.",
      },
      { status: 401 },
    );
  const count = (
    db.templates
      .select()
      .where({
        createdBy: auth.userId,
        publishedByUser: true,
        isPublished: true,
      })
      .all() as any[]
  ).length;
  if (count >= MAX_PUBLIC_TRACKS_PER_USER)
    return json(
      {
        ok: false,
        error: `Public publish limit reached (${MAX_PUBLIC_TRACKS_PER_USER} tracks per account).`,
      },
      { status: 403 },
    );

  const body = await readJson<Body>(req);
  const title = String(
    body?.title || body?.name || "Untitled community track",
  ).slice(0, 120);
  const description = String(body?.description || "").slice(0, 4000);
  let session;
  try {
    session = compileBody(body || {});
  } catch (e: any) {
    return json(
      { ok: false, error: e.message || "Could not compile track source." },
      { status: 400 },
    );
  }
  session.name = session.name || title;
  if (description) session.description = description;
  const scriptText = String(body?.scriptText || sessionToPatternText(session));
  const scriptFormat =
    body?.scriptFormat ||
    (looksLikeSbagen(scriptText) ? "sbagen.v1" : "entrain-script.v1");
  const slug = uniqueSlug(slugify(title));
  const template: EntrainTemplateV1 = {
    format: "entrain.template.v1",
    slug,
    title,
    summary: String(body?.summary || summaryFrom(title, description)).slice(
      0,
      260,
    ),
    description: description || summaryFrom(title, ""),
    category: "user-published",
    tier: "free",
    minTokens: 0,
    tags: Array.isArray(body?.tags)
      ? body!.tags!.slice(0, 16).map(String)
      : ["community"],
    session,
    scriptFormat,
    scriptText,
    evidenceLevel: "experimental",
    publishedByUser: true,
    ownerPublicKey: auth.userId,
    creatorName: auth.name || auth.email.split("@")[0],
    ownerEmail: auth.email,
    market: { kind: "free", priceLamports: 0, priceCurrency: "SOL" },
  } as any;
  const row = {
    ...rowFromTemplate(template, 100000 + count),
    createdBy: auth.userId,
    updatedBy: auth.userId,
    ownerPublicKey: auth.userId,
    ownerEmail: auth.email,
    creatorName: auth.name || auth.email.split("@")[0],
    publishedByUser: true,
    category: "user-published",
    tier: "free",
    minTokens: 0,
    marketKind: "free",
    status: "published",
    isPublished: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  db.templates.insert(row as any);
  try {
    db.playEvents.insert({
      publicKey: auth.userId,
      soundtrackSlug: slug,
      action: "publish",
      createdAt: Date.now(),
    });
  } catch {}
  return json({
    ok: true,
    slug,
    url: `/soundtracks/${slug}`,
    remaining: Math.max(0, MAX_PUBLIC_TRACKS_PER_USER - count - 1),
  });
}
