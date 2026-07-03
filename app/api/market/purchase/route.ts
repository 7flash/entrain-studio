import { authFromRequest, decideSoundtrackAccess } from "@/lib/access-policy";
import { findSoundtrack } from "@/lib/soundtracks";
import { json, readJson } from "@/lib/http";
import {
  confirmPurchase,
  createPurchaseIntent,
  formatSol,
} from "@/lib/marketplace";
import { clientKey, rateLimit } from "@/lib/rate-limit";

type Body = { slug?: string; txSignature?: string; intentId?: string };

export function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") || "";
  const auth = authFromRequest(req);
  const soundtrack = findSoundtrack(slug);
  const access = decideSoundtrackAccess(soundtrack, auth, "buy");
  if (!soundtrack)
    return json({ ok: false, error: "Soundtrack not found" }, { status: 404 });
  let intent: any = null;
  if (
    auth?.publicKey &&
    Number(soundtrack.market?.priceLamports || 0) > 0 &&
    !access.purchased
  ) {
    try {
      intent = createPurchaseIntent(auth.publicKey, slug);
    } catch (e: any) {
      return json(
        { ok: false, error: e.message || "could not create purchase intent" },
        { status: 400 },
      );
    }
  }
  return json({
    ok: true,
    access,
    purchase: {
      slug,
      title: soundtrack.title,
      priceLamports: soundtrack.market?.priceLamports || 0,
      priceLabel: formatSol(Number(soundtrack.market?.priceLamports || 0)),
      payoutWallet:
        soundtrack.market?.payoutWallet ||
        soundtrack.creatorWallet ||
        soundtrack.ownerPublicKey ||
        "",
      intent,
    },
  });
}

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "confirm-purchase"), 30, 60_000);
  if (!rl.ok)
    return json(
      { ok: false, error: "Too many purchase checks. Slow down." },
      { status: 429 },
    );
  const auth = authFromRequest(req);
  if (!auth)
    return json(
      {
        ok: false,
        error: "Connect Phantom before confirming purchase.",
        requiresWallet: true,
      },
      { status: 401 },
    );
  const body = await readJson<Body>(req);
  if (!body?.slug || !body.txSignature)
    return json(
      { ok: false, error: "slug and txSignature required" },
      { status: 400 },
    );
  try {
    const result = await confirmPurchase(
      auth.publicKey,
      body.slug,
      body.txSignature,
      body.intentId,
    );
    return json({ ok: true, ...result });
  } catch (e: any) {
    return json(
      { ok: false, error: e.message || "purchase confirmation failed" },
      { status: 400 },
    );
  }
}
