import { db } from '@/lib/db';
import { ADMIN_TOKEN } from '@/lib/config';
import { sanitizeSession } from '@/format/entrain-format';
import { json, readJson } from '@/lib/http';
import { tierForMinTokens } from '@/lib/templates';

type Body = {
  adminToken?: string;
  action?: 'upsert' | 'delete';
  slug?: string;
  title?: string;
  summary?: string;
  description?: string;
  category?: string;
  tags?: string[] | string;
  minTokens?: number;
  unlockNote?: string;
  session?: any;
  sortOrder?: number;
  isPublished?: boolean;
};

function isAdmin(req: Request, body?: Body | null) {
  if (!ADMIN_TOKEN) return process.env.NODE_ENV !== 'production';
  return req.headers.get('x-admin-token') === ADMIN_TOKEN || body?.adminToken === ADMIN_TOKEN;
}

export async function GET(req: Request) {
  if (!isAdmin(req)) return json({ ok:false, error:'admin token required' }, { status: 401 });
  const rows = db.templates.select().orderBy('sortOrder','ASC').all();
  return json({ ok:true, soundtracks: rows });
}

export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!isAdmin(req, body)) return json({ ok:false, error:'admin token required' }, { status: 401 });
  const action = body?.action || 'upsert';
  const slug = String(body?.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120);
  if (!slug) return json({ ok:false, error:'slug required' }, { status: 400 });

  if (action === 'delete') {
    const row = db.templates.select().where({ slug }).first() as any;
    if (!row) return json({ ok:false, error:'not found' }, { status: 404 });
    try { db.templates.delete().where({ slug }).run(); }
    catch { db.templates.update({ isPublished:false }).where({ slug }).run(); }
    return json({ ok:true, deleted: slug });
  }

  const minTokens = Number(body?.minTokens || 0);
  const tags = Array.isArray(body?.tags) ? body!.tags : String(body?.tags || '').split(',').map((x)=>x.trim()).filter(Boolean);
  const session = sanitizeSession(body?.session || { name: body?.title || slug, durationMin: 20, layers: [] });
  const row = {
    slug,
    title: String(body?.title || session.name || slug).slice(0,160),
    summary: String(body?.summary || '').slice(0,500),
    description: String(body?.description || '').slice(0,5000),
    category: String(body?.category || 'custom').slice(0,80),
    tier: tierForMinTokens(minTokens),
    tags,
    minTokens,
    unlockNote: String(body?.unlockNote || '').slice(0,1000),
    session,
    sortOrder: Number(body?.sortOrder || 0),
    isPublished: body?.isPublished !== false,
  };
  const existing = db.templates.select().where({ slug }).first() as any;
  if (existing) db.templates.update(row).where({ slug }).run();
  else db.templates.insert(row);
  return json({ ok:true, soundtrack: row });
}
