import { COOKIE_SECURE, SESSION_COOKIE } from './config';

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, init);
}

export async function readJson<T = unknown>(req: Request): Promise<T | null> {
  return await req.json().catch(() => null) as T | null;
}

export function cookieValue(req: Request, name = SESSION_COOKIE) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function sessionCookie(sessionId: string, maxAgeSec: number) {
  const secure = COOKIE_SECURE ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
