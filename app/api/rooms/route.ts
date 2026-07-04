import { json, readJson } from "@/lib/http";
import { authFromRequest } from "@/lib/access-policy";
import { createSyncRoom, listSyncRooms } from "@/lib/sync-rooms";
import { allSoundtracks } from "@/lib/soundtracks";

export function GET() {
  return json({
    ok: true,
    rooms: listSyncRooms(),
    soundtracks: allSoundtracks().map((s) => ({
      slug: s.slug,
      title: s.title,
      summary: s.summary,
      category: s.category,
      durationMin: s.session.durationMin,
    })),
  });
}

export async function POST(req: Request) {
  const body = await readJson<{ slug?: string }>(req);
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
