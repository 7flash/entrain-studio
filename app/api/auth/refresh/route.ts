import { refreshWalletSession } from '@/lib/auth';
import { cookieValue, json, sessionCookie } from '@/lib/http';

export async function POST(req: Request) {
  try {
    const result = await refreshWalletSession(cookieValue(req));
    return json({ ok: true, publicKey: result.publicKey, balance: result.balance, expiresAt: result.expiresAt }, { headers: { 'set-cookie': sessionCookie(result.sessionId, result.maxAgeSec) } });
  } catch (e: any) {
    return json({ ok: false, error: e.message || 'refresh failed' }, { status: 401 });
  }
}
