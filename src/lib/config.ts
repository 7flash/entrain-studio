export const TOKEN_TICKER = (process.env.TOKEN_TICKER || 'WAVES').replace(/^\$/,'').toUpperCase();
export const TOKEN_DISPLAY_NAME = process.env.TOKEN_DISPLAY_NAME || `$${TOKEN_TICKER}`;
export const TOKEN_CHAIN = process.env.TOKEN_CHAIN || 'solana';
export const TOKEN_MINT = process.env.TOKEN_MINT || process.env.ENTRAIN_MINT || '3Ae5SuwRUsQPuJD8LJAPgpDtATCnpSndt3ikwKHQpump';
export const ENTRAIN_MINT = TOKEN_MINT; // backward-compatible alias for older code/imports
export const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
export const SESSION_COOKIE = process.env.SESSION_COOKIE || 'entrain_session';
export const ALLOW_DEV_UNLOCK = process.env.ALLOW_DEV_UNLOCK === '1';
export const COOKIE_SECURE = process.env.NODE_ENV === 'production';

export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

export function tokenAmountLabel(amount: number | string) {
  return `${amount} ${TOKEN_DISPLAY_NAME}`;
}
