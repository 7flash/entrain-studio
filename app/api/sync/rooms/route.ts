import { authFromRequest } from "@/lib/access-policy";
import { json, readJson } from "@/lib/http";
import { createSyncRoom } from "@/lib/sync-rooms";

type Body = { slug?: string };

export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  const slug = String(body?.slug || "").trim();
  if (!slug)
    return json({ ok: false, error: "slug required" }, { status: 400 });
  try {
    const auth = authFromRequest(req);
    const created = createSyncRoom(slug, auth?.publicKey);
    return json({ ok: true, ...created });
  } catch (e: any) {
    return json(
      { ok: false, error: e.message || "room create failed" },
      { status: 400 },
    );
  }
}
