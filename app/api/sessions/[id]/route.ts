import { db } from "@/lib/db";
import { sanitizeSession } from "@/format/entrain-format";
import { sessionToPatternText } from "@/format/pattern-text";
import { authFromRequest, decideLibraryAccess } from "@/lib/access-policy";
import { json, readJson } from "@/lib/http";

type Props = { params: { id: string } };

type Body = {
  name?: string;
  description?: string;
  tags?: string[];
  session?: any;
  scriptFormat?: string;
  scriptText?: string;
  isFavorite?: boolean;
  lastPlayedAt?: number;
};

function owned(id: string, publicKey: string) {
  return db.savedSessions
    .select()
    .where({ id: Number(id), publicKey })
    .first() as any;
}

export async function PATCH(req: Request, { params }: Props) {
  const auth = authFromRequest(req);
  const access = decideLibraryAccess(auth, "update");
  if (!access.ok || !auth)
    return json({ ok: false, error: access.message }, { status: 401 });
  const row = owned(params.id, auth.publicKey);
  if (!row)
    return json({ ok: false, error: "saved track not found" }, { status: 404 });
  const body = (await readJson<Body>(req)) || {};
  const patch: any = { updatedAt: Date.now() };
  if (body.name != null) patch.name = String(body.name).slice(0, 120);
  if (body.description != null)
    patch.description = String(body.description).slice(0, 1000);
  if (Array.isArray(body.tags)) patch.tags = body.tags.slice(0, 16).map(String);
  if (body.session) {
    patch.session = sanitizeSession(body.session);
    patch.scriptText = body.scriptText || sessionToPatternText(patch.session);
    patch.scriptFormat = body.scriptFormat || "entrain-script.v1";
  } else {
    if (body.scriptText != null) patch.scriptText = String(body.scriptText);
    if (body.scriptFormat != null)
      patch.scriptFormat = String(body.scriptFormat);
  }
  if (typeof body.isFavorite === "boolean") patch.isFavorite = body.isFavorite;
  if (body.lastPlayedAt) patch.lastPlayedAt = Number(body.lastPlayedAt);
  db.savedSessions
    .update(patch)
    .where({ id: Number(params.id), publicKey: auth.publicKey })
    .run();
  const updated = owned(params.id, auth.publicKey);
  return json({ ok: true, saved: updated });
}

export async function DELETE(req: Request, { params }: Props) {
  const auth = authFromRequest(req);
  const access = decideLibraryAccess(auth, "delete");
  if (!access.ok || !auth)
    return json({ ok: false, error: access.message }, { status: 401 });
  const row = owned(params.id, auth.publicKey);
  if (!row)
    return json({ ok: false, error: "saved track not found" }, { status: 404 });
  db.savedSessions
    .delete()
    .where({ id: Number(params.id), publicKey: auth.publicKey })
    .run();
  return json({ ok: true });
}
