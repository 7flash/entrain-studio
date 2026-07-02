import { verifyWallet } from '@/lib/auth';
import { json, readJson, sessionCookie } from '@/lib/http';

type Body = { publicKey?: string; signature?: string; nonce?: string };
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body?.publicKey || !body.signature || !body.nonce) return json({ ok: false, error: 'publicKey, nonce, signature required' }, { status: 400 });
  try {
    const result = await verifyWallet(body.publicKey, body.signature, body.nonce);
    return json({ ok: true, publicKey: result.publicKey, balance: result.balance, expiresAt: result.expiresAt }, { headers: { 'set-cookie': sessionCookie(result.sessionId, result.maxAgeSec) } });
  } catch (e: any) {
    return json({ ok: false, error: e.message || 'verification failed' }, { status: 401 });
  }
}
