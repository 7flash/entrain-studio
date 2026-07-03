import { ADMIN_TOKEN } from "./config";

const encoder = new TextEncoder();
let warnedMissingAdminToken = false;

export function isAdminRequest(
  req: Request,
  body?: { adminToken?: string } | null,
) {
  if (!ADMIN_TOKEN) {
    if (!warnedMissingAdminToken) {
      warnedMissingAdminToken = true;
      console.warn(
        "[ENTRAIN] ADMIN_TOKEN is not configured; admin APIs are fail-closed.",
      );
    }
    return false;
  }
  const supplied =
    req.headers.get("x-admin-token") ||
    new URL(req.url).searchParams.get("adminToken") ||
    body?.adminToken ||
    "";
  return constantTimeEqual(String(supplied), String(ADMIN_TOKEN));
}

export function constantTimeEqual(a: string, b: string) {
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  const len = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= (aa[i] || 0) ^ (bb[i] || 0);
  return diff === 0;
}
