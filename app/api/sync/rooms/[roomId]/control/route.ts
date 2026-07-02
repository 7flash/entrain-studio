import { json, readJson } from "@/lib/http";
import { controlSyncRoom } from "@/lib/sync-rooms";

type Props = { params: { roomId: string } };
type Body = { action?: "start" | "pause" | "stop" | "ping"; hostKey?: string };

export async function POST(req: Request, { params }: Props) {
  const body = await readJson<Body>(req);
  const action = body?.action || "ping";
  try {
    const room = controlSyncRoom(
      String(params.roomId || "").toUpperCase(),
      String(body?.hostKey || ""),
      action,
    );
    return json({ ok: true, room });
  } catch (e: any) {
    return json(
      { ok: false, error: e.message || "room control failed" },
      { status: /host key/i.test(e.message || "") ? 403 : 400 },
    );
  }
}
