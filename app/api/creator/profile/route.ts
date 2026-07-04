import { authFromRequest } from "@/lib/access-policy";
import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { MAX_PUBLIC_TRACKS_PER_USER } from "@/lib/config";
export function GET(req: Request) {
  const auth = authFromRequest(req);
  if (!auth)
    return json({ ok: false, error: "Sign in with Google." }, { status: 401 });
  const tracks = db.savedSessions
    .select()
    .where({ publicKey: auth.publicKey })
    .orderBy("createdAt", "DESC")
    .all();
  const published = db.templates
    .select()
    .where({ createdBy: auth.userId, publishedByUser: true, isPublished: true })
    .orderBy("createdAt", "DESC")
    .all();
  return json({
    ok: true,
    profile: { email: auth.email, name: auth.name, picture: auth.picture },
    tracks,
    published,
    publishingEnabled: true,
    publishLimit: MAX_PUBLIC_TRACKS_PER_USER,
    message:
      "Save privately without limits; publish selected tracks into the user-published catalogue.",
  });
}
export function POST() {
  return json({
    ok: true,
    message:
      "Google profile is derived from OAuth; no separate creator profile is required yet.",
  });
}
