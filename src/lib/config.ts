export const SESSION_COOKIE = process.env.SESSION_COOKIE || "entrain_session";
export const COOKIE_SECURE = process.env.NODE_ENV === "production";
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
export const PUBLIC_ORIGIN =
  process.env.PUBLIC_ORIGIN || "http://localhost:3000";

// Google OAuth replaces the old Phantom/token-gate flow.
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
export const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  `${PUBLIC_ORIGIN.replace(/\/$/, "")}/api/auth/google/callback`;
export const GOOGLE_OAUTH_STATE_COOKIE =
  process.env.GOOGLE_OAUTH_STATE_COOKIE || "entrain_google_state";
// Anonymous # source URLs need no login. Google accounts are only for persistent cloud saves
// and optional public catalogue publishing. Private saved tracks are unlimited by default.
export const MAX_SAVED_TRACKS_PER_USER = Number(
  process.env.MAX_SAVED_TRACKS_PER_USER || 0,
); // 0 = unlimited
export const MAX_PUBLIC_TRACKS_PER_USER = Number(
  process.env.MAX_PUBLIC_TRACKS_PER_USER || 50,
);

// Kept as an explicit mode flag so old token/payment routes can fail closed with a clear message.
export const PUBLIC_FREE_MODE = true;

export function tokenAmountLabel(amount: number | string) {
  return String(amount);
}

// Legacy compatibility exports for old audit/token modules. They are not product features now.
export const TOKEN_TICKER = "";
export const TOKEN_DISPLAY_NAME = "";
export const TOKEN_CHAIN = "none";
export const TOKEN_MINT = "";
export const ENTRAIN_MINT = "";
export const SOLANA_RPC = "";
