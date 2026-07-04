import { authFromRequest } from "@/lib/access-policy";
import { json, readJson } from "@/lib/http";
import { heartbeatSyncRoom, leaveSyncRoom } from "@/lib/sync-rooms";

type Props = { params: { roomId: string } };
type Body = {
  clientId?: string;
  label?: string;
  hostKey?: string;
  clientOffsetMs?: number;
  rttMs?: number;
  earningActive?: boolean;
};

export async function POST(req: Request, { params }: Props) {
  const body = await readJson<Body>(req);
  try {
    const auth = authFromRequest(req);
    const out = heartbeatSyncRoom(params.roomId, {
      ...body,
      publicKey: auth?.publicKey,
    });
    return json({ ok: true, ...out });
  } catch (e: any) {
    return json(
      { ok: false, error: e.message || "presence failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request, { params }: Props) {
  const url = new URL(req.url);
  const clientId = String(url.searchParams.get("clientId") || "").trim();
  if (!clientId)
    return json({ ok: false, error: "clientId required" }, { status: 400 });
  try {
    const room = leaveSyncRoom(params.roomId, clientId);
    return json({ ok: true, room });
  } catch (e: any) {
    return json(
      { ok: false, error: e.message || "leave failed" },
      { status: 400 },
    );
  }
}
