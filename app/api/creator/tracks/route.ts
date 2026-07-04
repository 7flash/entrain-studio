import { authFromRequest } from "@/lib/access-policy";
import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { summarizeSession } from "@/format/entrain-format";
import { MAX_PUBLIC_TRACKS_PER_USER } from "@/lib/config";

export function GET(req: Request) {
  const auth = authFromRequest(req);
  if (!auth)
    return json(
      {
        ok: false,
        error: "Sign in with Google to see your published catalogue tracks.",
      },
      { status: 401 },
    );
  const rows = (
    db.templates
      .select()
      .where({ createdBy: auth.userId, publishedByUser: true })
      .orderBy("createdAt", "DESC")
      .all() as any[]
  ).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    description: r.description,
    category: r.category,
    tags: r.tags || [],
    status: r.status,
    isPublished: !!r.isPublished,
    publishedByUser: !!r.publishedByUser,
    scriptFormat: r.scriptFormat || "entrain-script.v1",
    scriptText: r.scriptText || "",
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    stats: r.session ? summarizeSession(r.session as any) : null,
  }));
  const active = rows.filter(
    (r) => r.isPublished && r.status !== "archived",
  ).length;
  return json({
    ok: true,
    tracks: rows,
    activeCount: active,
    limit: MAX_PUBLIC_TRACKS_PER_USER,
    remaining: Math.max(0, MAX_PUBLIC_TRACKS_PER_USER - active),
  });
}
