import { json, readJson } from "@/lib/http";
import { controlSyncRoom } from "@/lib/sync-rooms";

type Props = { params: { roomId: string } };
type Body = {
  action?: "start" | "pause" | "stop" | "ping";
  hostKey?: string;
  delaySec?: number;
};

export async function POST(req: Request, { params }: Props) {
  const body = await readJson<Body>(req);
  const action = body.action || "ping";
  if (!["start", "pause", "stop", "ping"].includes(action))
    return json({ ok: false, error: "invalid action" }, { status: 400 });
  try {
    const room = controlSyncRoom(
      params.roomId,
      String(body.hostKey || ""),
      action,
      { delaySec: Number(body.delaySec || 0) },
    );
    return json({ ok: true, room });
  } catch (e: any) {
    return json(
      { ok: false, error: e.message || "room control failed" },
      { status: 400 },
    );
  }
}
