import { render } from "tradjs/client";

type Market = {
  ok: boolean;
  displayName: string;
  ticker: string;
  marketCap: number | null;
  fdv: number | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  priceChange24h: number | null;
  pairUrl: string | null;
  dexId: string | null;
  cached?: boolean;
  error?: string;
};

let market: Market | null = null;
let loading = true;
let timer: any = null;

function TokenMarketCard() {
  const name = market?.displayName || "$WAVES";
  const mc = market?.marketCap ?? market?.fdv ?? null;
  const change = market?.priceChange24h;
  return (
    <article className="token-card">
      <div>
        <span className="pill live-pill">live token gate</span>
        <h3>{name} access token</h3>
        <p className="muted">
          Prepared soundtracks unlock from the verified wallet balance. Market
          data refreshes while this tab is visible.
        </p>
      </div>
      <div className="token-stats">
        <div>
          <span>Market cap</span>
          <b>{loading ? "loading…" : money(mc)}</b>
        </div>
        <div>
          <span>Price</span>
          <b>{money(market?.priceUsd, 8)}</b>
        </div>
        <div>
          <span>24h</span>
          <b className={Number(change || 0) >= 0 ? "up" : "down"}>
            {pct(change)}
          </b>
        </div>
        <div>
          <span>Liquidity</span>
          <b>{money(market?.liquidityUsd)}</b>
        </div>
      </div>
      <div className="tagrow">
        <a
          className="btn"
          href="https://x.com/entrainlabs"
          target="_blank"
          rel="noreferrer"
        >
          x.com/entrainlabs
        </a>
        <a
          className="btn"
          href="https://entrainstudio.xyz"
          target="_blank"
          rel="noreferrer"
        >
          entrainstudio.xyz
        </a>
        {market?.pairUrl ? (
          <a
            className="btn"
            href={market.pairUrl}
            target="_blank"
            rel="noreferrer"
          >
            DexScreener
          </a>
        ) : null}
      </div>
      {market?.error ? (
        <p className="small warntext">
          Market feed unavailable: {market.error}
        </p>
      ) : null}
    </article>
  );
}

async function loadMarket() {
  try {
    market = await fetch("/api/token/market").then((r) => r.json());
  } catch (e: any) {
    market = {
      ok: false,
      displayName: "$WAVES",
      ticker: "WAVES",
      marketCap: null,
      fdv: null,
      priceUsd: null,
      liquidityUsd: null,
      volume24h: null,
      priceChange24h: null,
      pairUrl: null,
      dexId: null,
      error: e.message || "request failed",
    };
  }
  loading = false;
  paint();
}

function paint() {
  const root = document.getElementById("token-market-root");
  if (root) render(<TokenMarketCard />, root);
}

function money(v: number | null | undefined, decimals = 2) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(2) + "K";
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}
function pct(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  return `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`;
}

export default function mount() {
  paint();
  loadMarket();
  timer = setInterval(() => {
    if (document.visibilityState === "visible") loadMarket();
  }, 15000);
  const onVisibility = () => {
    if (document.visibilityState === "visible") loadMarket();
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    if (timer) clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    const root = document.getElementById("token-market-root");
    if (root) render(null, root);
  };
}
