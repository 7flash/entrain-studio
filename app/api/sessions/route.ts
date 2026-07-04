import { db } from "@/lib/db";
import { sanitizeSession } from "@/format/entrain-format";
import { sessionToPatternText } from "@/format/pattern-text";
import { authFromRequest, decideLibraryAccess } from "@/lib/access-policy";
import { json, readJson } from "@/lib/http";
import { MAX_SAVED_TRACKS_PER_USER } from "@/lib/config";

type Body = {
  slug?: string;
  sourceSlug?: string;
  name?: string;
  description?: string;
  tags?: string[];
  session?: any;
  scriptFormat?: string;
  scriptText?: string;
  isShared?: boolean;
};

function shareId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
function uniqueShareId() {
  for (let i = 0; i < 20; i++) {
    const id = shareId();
    if (!db.savedSessions.select().where({ shareId: id }).first()) return id;
  }
  return crypto.randomUUID().replace(/-/g, "");
}

export async function POST(req: Request) {
  const auth = authFromRequest(req);
  const access = decideLibraryAccess(auth, "save");
  if (!access.ok || !auth)
    return json(
      { ok: false, error: access.message, requiresLogin: true },
      { status: 401 },
    );
  const count = (
    db.savedSessions
      .select()
      .where({ publicKey: auth.publicKey })
      .all() as any[]
  ).length;
  if (MAX_SAVED_TRACKS_PER_USER > 0 && count >= MAX_SAVED_TRACKS_PER_USER)
    return json(
      {
        ok: false,
        error: `Track limit reached. Each Google account can save up to ${MAX_SAVED_TRACKS_PER_USER} tracks.`,
      },
      { status: 403 },
    );
  const body = await readJson<Body>(req);
  if (!body?.session || !body?.name)
    return json(
      { ok: false, error: "name and session required" },
      { status: 400 },
    );
  const session = sanitizeSession(body.session);
  const id = uniqueShareId();
  const row = db.savedSessions.insert({
    publicKey: auth.publicKey,
    userId: auth.userId,
    ownerEmail: auth.email,
    slug: body.slug || "custom",
    sourceSlug: body.sourceSlug,
    name: String(body.name).slice(0, 120),
    description: body.description
      ? String(body.description).slice(0, 1000)
      : session.description || session.notes?.slice(0, 1000),
    tags: Array.isArray(body.tags) ? body.tags.slice(0, 16).map(String) : [],
    session,
    scriptFormat: body.scriptFormat || "entrain-script.v1",
    scriptText: body.scriptText || sessionToPatternText(session),
    shareId: id,
    isShared: body.isShared !== false,
    shareCreatedAt: Date.now(),
    isFavorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  try {
    db.playEvents.insert({
      publicKey: auth.publicKey,
      savedSessionId: Number((row as any).id || 0),
      action: "save",
      createdAt: Date.now(),
    });
  } catch {}
  return json({
    ok: true,
    saved: row,
    shareUrl: `/shared/${id}`,
    remaining:
      MAX_SAVED_TRACKS_PER_USER > 0
        ? Math.max(0, MAX_SAVED_TRACKS_PER_USER - count - 1)
        : null,
    unlimited: MAX_SAVED_TRACKS_PER_USER === 0,
  });
}

export function GET(req: Request) {
  const auth = authFromRequest(req);
  const access = decideLibraryAccess(auth, "list");
  if (!access.ok || !auth)
    return json(
      { ok: false, error: access.message, requiresLogin: true },
      { status: 401 },
    );
  const q = db.savedSessions
    .select()
    .where({ publicKey: auth.publicKey })
    .orderBy("createdAt", "DESC");
  const rows = (
    MAX_SAVED_TRACKS_PER_USER > 0 ? q.limit(MAX_SAVED_TRACKS_PER_USER) : q
  ).all();
  return json({
    ok: true,
    sessions: rows,
    limit: MAX_SAVED_TRACKS_PER_USER || null,
    unlimited: MAX_SAVED_TRACKS_PER_USER === 0,
    remaining:
      MAX_SAVED_TRACKS_PER_USER > 0
        ? Math.max(0, MAX_SAVED_TRACKS_PER_USER - rows.length)
        : null,
  });
}
