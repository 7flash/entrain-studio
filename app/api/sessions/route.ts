import { db } from "@/lib/db";
import { sanitizeSession } from "@/format/entrain-format";
import { sessionToPatternText } from "@/format/pattern-text";
import { authFromRequest, decideLibraryAccess } from "@/lib/access-policy";
import { json, readJson } from "@/lib/http";

type Body = {
  slug?: string;
  sourceSlug?: string;
  name?: string;
  description?: string;
  tags?: string[];
  session?: any;
  scriptFormat?: string;
  scriptText?: string;
};

export async function POST(req: Request) {
  const auth = authFromRequest(req);
  const access = decideLibraryAccess(auth, "save");
  if (!access.ok || !auth)
    return json(
      { ok: false, error: access.message, requiresWallet: true },
      { status: 401 },
    );
  const body = await readJson<Body>(req);
  if (!body?.session || !body?.name)
    return json(
      { ok: false, error: "name and session required" },
      { status: 400 },
    );
  const session = sanitizeSession(body.session);
  const row = db.savedSessions.insert({
    publicKey: auth.publicKey,
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
  return json({ ok: true, saved: row });
}

export function GET(req: Request) {
  const auth = authFromRequest(req);
  const access = decideLibraryAccess(auth, "list");
  if (!access.ok || !auth)
    return json(
      { ok: false, error: access.message, requiresWallet: true },
      { status: 401 },
    );
  const rows = db.savedSessions
    .select()
    .where({ publicKey: auth.publicKey })
    .orderBy("createdAt", "DESC")
    .limit(100)
    .all();
  return json({ ok: true, sessions: rows });
}
