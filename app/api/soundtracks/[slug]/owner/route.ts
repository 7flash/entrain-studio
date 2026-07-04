import { authFromRequest } from "@/lib/access-policy";
import { db } from "@/lib/db";
import { json, readJson } from "@/lib/http";

type Props = { params: { slug: string } };
type Body = {
  title?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  isPublished?: boolean;
};

function owned(slug: string, userId: string) {
  return db.templates
    .select()
    .where({ slug, createdBy: userId, publishedByUser: true })
    .first() as any;
}

export async function PATCH(req: Request, { params }: Props) {
  const auth = authFromRequest(req);
  if (!auth)
    return json(
      {
        ok: false,
        error: "Sign in with Google to manage your published tracks.",
      },
      { status: 401 },
    );
  const row = owned(params.slug, auth.userId);
  if (!row)
    return json(
      { ok: false, error: "Published track not found for this account." },
      { status: 404 },
    );
  const body = (await readJson<Body>(req)) || {};
  const patch: any = { updatedAt: Date.now(), updatedBy: auth.userId };
  if (body.title != null) patch.title = String(body.title).slice(0, 120);
  if (body.summary != null) patch.summary = String(body.summary).slice(0, 260);
  if (body.description != null)
    patch.description = String(body.description).slice(0, 4000);
  if (Array.isArray(body.tags)) patch.tags = body.tags.slice(0, 16).map(String);
  if (typeof body.isPublished === "boolean") {
    patch.isPublished = body.isPublished;
    patch.status = body.isPublished ? "published" : "archived";
  }
  db.templates
    .update(patch)
    .where({ slug: params.slug, createdBy: auth.userId, publishedByUser: true })
    .run();
  return json({ ok: true, soundtrack: owned(params.slug, auth.userId) });
}

export async function DELETE(req: Request, { params }: Props) {
  const auth = authFromRequest(req);
  if (!auth)
    return json(
      {
        ok: false,
        error: "Sign in with Google to manage your published tracks.",
      },
      { status: 401 },
    );
  const row = owned(params.slug, auth.userId);
  if (!row)
    return json(
      { ok: false, error: "Published track not found for this account." },
      { status: 404 },
    );
  db.templates
    .update({
      isPublished: false,
      status: "archived",
      updatedAt: Date.now(),
      updatedBy: auth.userId,
    })
    .where({ slug: params.slug, createdBy: auth.userId, publishedByUser: true })
    .run();
  return json({ ok: true });
}
