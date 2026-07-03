import { createChallenge } from "@/lib/auth";
import { json, readJson } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";

type Body = { publicKey?: string };
export async function POST(req: Request) {
  const limited = rateLimit(clientKey(req, "auth-challenge"), 20, 60_000);
  if (!limited.ok)
    return json(
      {
        ok: false,
        error: "too many challenge requests",
        retryAfterSec: limited.retryAfterSec,
      },
      { status: 429 },
    );
  const body = await readJson<Body>(req);
  const publicKey = body?.publicKey?.trim();
  if (!publicKey)
    return json({ ok: false, error: "publicKey required" }, { status: 400 });
  const c = await createChallenge(publicKey);
  return json({ ok: true, ...c });
}
