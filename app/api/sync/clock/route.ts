import { json } from "@/lib/http";

export function GET() {
  const serverNow = Date.now();
  return json({ ok: true, serverNow, iso: new Date(serverNow).toISOString() });
}
