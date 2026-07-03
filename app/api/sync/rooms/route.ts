import { authFromRequest, decideSoundtrackAccess } from "@/lib/access-policy";
import { json, readJson } from "@/lib/http";
import { findSoundtrack } from "@/lib/soundtracks";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createSyncRoom } from "@/lib/sync-rooms";

type Body = { slug?: string };

export async function POST(req: Request) {
  const limited = rateLimit(clientKey(req, "sync-room-create"), 12, 60_000);
  if (!limited.ok)
    return json(
      {
        ok: false,
        error: "too many room creations",
        retryAfterSec: limited.retryAfterSec,
      },
      { status: 429 },
    );
  const body = await readJson<Body>(req);
  const slug = String(body?.slug || "").trim();
  if (!slug)
    return json({ ok: false, error: "slug required" }, { status: 400 });
  try {
    const auth = authFromRequest(req);
    const soundtrack = findSoundtrack(slug);
    const decision = decideSoundtrackAccess(soundtrack, auth, "play");
    if (!decision.ok)
      return json(
        { ok: false, error: decision.message, access: decision },
        { status: decision.code === "not_found" ? 404 : 403 },
      );
    const created = createSyncRoom(slug, auth?.publicKey);
    return json({ ok: true, ...created });
  } catch (e: any) {
    return json(
      { ok: false, error: e.message || "room create failed" },
      { status: 400 },
    );
  }
}
