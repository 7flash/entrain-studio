import { db } from '@/lib/db';
import { sanitizeSession } from '@/format/entrain-format';
import { getAuthSession } from '@/lib/auth';
import { cookieValue, json, readJson } from '@/lib/http';

type Body = { slug?: string; name?: string; session?: any };

export async function POST(req: Request) {
  const auth = getAuthSession(cookieValue(req));
  if (!auth) return json({ ok: false, error: 'wallet session required' }, { status: 401 });
  const body = await readJson<Body>(req);
  if (!body?.session || !body?.name) return json({ ok: false, error: 'name and session required' }, { status: 400 });
  const session = sanitizeSession(body.session);
  const row = db.savedSessions.insert({ publicKey: auth.publicKey, slug: body.slug || 'custom', name: String(body.name).slice(0, 120), session, createdAt: Date.now(), updatedAt: Date.now() });
  return json({ ok: true, saved: row });
}

export function GET(req: Request) {
  const auth = getAuthSession(cookieValue(req));
  if (!auth) return json({ ok: false, error: 'wallet session required' }, { status: 401 });
  const rows = db.savedSessions.select().where({ publicKey: auth.publicKey }).orderBy('createdAt','DESC').limit(50).all();
  return json({ ok: true, sessions: rows });
}
