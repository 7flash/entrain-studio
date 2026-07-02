import { json } from "@/lib/http";
import { publicSyncRoom } from "@/lib/sync-rooms";

type Props = { params: { roomId: string } };

export function GET(_req: Request, { params }: Props) {
  const room = publicSyncRoom(String(params.roomId || "").toUpperCase());
  if (!room)
    return json(
      { ok: false, error: "Room not found or expired" },
      { status: 404 },
    );
  return json({ ok: true, room });
}
