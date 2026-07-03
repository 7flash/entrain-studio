import { TOKEN_CHAIN, TOKEN_DISPLAY_NAME, TOKEN_MINT, TOKEN_TICKER } from './config';
import { rpcMeasure } from './measure';

export type TokenMarketSnapshot = {
  ok: boolean;
  ticker: string;
  displayName: string;
  chainId: string;
  tokenAddress: string;
  source: 'dexscreener';
  marketCap: number | null;
  fdv: number | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  priceChange24h: number | null;
  dexId: string | null;
  pairAddress: string | null;
  pairUrl: string | null;
  symbol: string | null;
  name: string | null;
  updatedAt: number;
  cached: boolean;
  error?: string;
};

type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string | null;
  volume?: { h24?: number };
  priceChange?: { h24?: number } | null;
  liquidity?: { usd?: number } | null;
  fdv?: number | null;
  marketCap?: number | null;
};

let cache: TokenMarketSnapshot | null = null;
let cacheUntil = 0;
const CACHE_MS = 4_500;

export function tokenConfig() {
  return {
    ticker: TOKEN_TICKER,
    displayName: TOKEN_DISPLAY_NAME,
    chainId: TOKEN_CHAIN,
    tokenAddress: TOKEN_MINT,
  };
}

export async function getTokenMarketSnapshot(force = false): Promise<TokenMarketSnapshot> {
  const now = Date.now();
  if (!force && cache && cacheUntil > now) return { ...cache, cached: true };
  return await rpcMeasure.measure.assert({ label: 'DexScreener market snapshot', budget: 1200, timeout: 8000 }, async () => {
    try {
      const url = `https://api.dexscreener.com/tokens/v1/${encodeURIComponent(TOKEN_CHAIN)}/${encodeURIComponent(TOKEN_MINT)}`;
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`DexScreener ${res.status}`);
      const pairs = await res.json() as DexPair[];
      const pair = chooseBestPair(Array.isArray(pairs) ? pairs : []);
      if (!pair) throw new Error('No DexScreener pair found');
      const snapshot: TokenMarketSnapshot = {
        ok: true,
        ticker: TOKEN_TICKER,
        displayName: TOKEN_DISPLAY_NAME,
        chainId: pair.chainId || TOKEN_CHAIN,
        tokenAddress: TOKEN_MINT,
        source: 'dexscreener',
        marketCap: num(pair.marketCap),
        fdv: num(pair.fdv),
        priceUsd: num(pair.priceUsd),
        liquidityUsd: num(pair.liquidity?.usd),
        volume24h: num(pair.volume?.h24),
        priceChange24h: num(pair.priceChange?.h24),
        dexId: pair.dexId || null,
        pairAddress: pair.pairAddress || null,
        pairUrl: pair.url || null,
        symbol: pair.baseToken?.symbol || TOKEN_TICKER,
        name: pair.baseToken?.name || null,
        updatedAt: Date.now(),
        cached: false,
      };
      cache = snapshot;
      cacheUntil = Date.now() + CACHE_MS;
      return snapshot;
    } catch (e: any) {
      const fallback: TokenMarketSnapshot = {
        ok: false,
        ticker: TOKEN_TICKER,
        displayName: TOKEN_DISPLAY_NAME,
        chainId: TOKEN_CHAIN,
        tokenAddress: TOKEN_MINT,
        source: 'dexscreener',
        marketCap: null,
        fdv: null,
        priceUsd: null,
        liquidityUsd: null,
        volume24h: null,
        priceChange24h: null,
        dexId: null,
        pairAddress: null,
        pairUrl: null,
        symbol: TOKEN_TICKER,
        name: null,
        updatedAt: Date.now(),
        cached: false,
        error: e.message || 'market unavailable',
      };
      cache = fallback;
      cacheUntil = Date.now() + CACHE_MS;
      return fallback;
    }
  });
}

function chooseBestPair(pairs: DexPair[]) {
  return pairs
    .filter((p) => (p.baseToken?.address || '').toLowerCase() === TOKEN_MINT.toLowerCase() || pairs.length === 1)
    .sort((a, b) => (num(b.liquidity?.usd) || 0) - (num(a.liquidity?.usd) || 0))[0]
    || pairs.sort((a, b) => (num(b.liquidity?.usd) || 0) - (num(a.liquidity?.usd) || 0))[0];
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
