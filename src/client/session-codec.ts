import type { EntrainSessionV1 } from '@/format/entrain-format';
import { cleanForShare, sanitizeSession } from '@/format/entrain-format';

export async function encodeSessionHash(session: EntrainSessionV1) {
  const json = JSON.stringify(cleanForShare(session));
  const data = new TextEncoder().encode(json);
  const compressed = await gzip(data).catch(() => data);
  return `#s=${base64url(compressed)}`;
}

export async function decodeSessionHash(hash = location.hash) {
  const m = hash.match(/(?:^#|&)s=([^&]+)/);
  if (!m) return null;
  const bytes = fromBase64url(m[1]);
  const maybe = await gunzip(bytes).catch(() => bytes);
  return sanitizeSession(JSON.parse(new TextDecoder().decode(maybe)));
}

async function gzip(bytes: Uint8Array) {
  if (!('CompressionStream' in window)) return bytes;
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes); writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

async function gunzip(bytes: Uint8Array) {
  if (!('DecompressionStream' in window)) return bytes;
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes); writer.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

function base64url(bytes: Uint8Array) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromBase64url(s: string) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - s.length % 4) % 4);
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
