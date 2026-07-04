import { findSoundtrack } from "@/lib/soundtracks";
import {
  authFromRequest,
  decideLibraryAccess,
  decideSoundtrackAccess,
} from "@/lib/access-policy";
import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { publicSessionCopy } from "@/format/entrain-format";
import { sessionToPatternText } from "@/format/pattern-text";

type Props = { params: { slug: string } };

export async function POST(req: Request, { params }: Props) {
  const auth = authFromRequest(req);
  const lib = decideLibraryAccess(auth, "save");
  if (!lib.ok || !auth)
    return json(
      { ok: false, error: lib.message, requiresWallet: true },
      { status: 401 },
    );
  const soundtrack = findSoundtrack(params.slug);
  const access = decideSoundtrackAccess(soundtrack, auth, "clone");
  if (!access.ok || !soundtrack)
    return json(
      {
        ok: false,
        error: access.message,
        minTokens: access.minTokens,
        balance: access.balance,
      },
      { status: 403 },
    );
  const session = publicSessionCopy({
    ...soundtrack.session,
    name: `${soundtrack.session.name} — clone`,
  });
  const row = db.savedSessions.insert({
    publicKey: auth.publicKey,
    slug: `${soundtrack.slug}-clone`,
    sourceSlug: soundtrack.slug,
    name: session.name,
    description: `Private clone of ${soundtrack.title}`,
    tags: soundtrack.tags,
    session,
    scriptFormat: "entrain-script.v1",
    scriptText: soundtrack.scriptText || sessionToPatternText(session),
    isFavorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  try {
    db.playEvents.insert({
      publicKey: auth.publicKey,
      soundtrackSlug: soundtrack.slug,
      action: "clone",
      createdAt: Date.now(),
    });
  } catch {}
  return json({ ok: true, saved: row });
}
