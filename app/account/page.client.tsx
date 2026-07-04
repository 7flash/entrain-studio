import { render } from "tradjs/client";
import {
  connectAndVerify,
  getWalletState,
  type WalletState,
} from "@/client/wallet";

let wallet: WalletState = { authenticated: false, publicKey: null, balance: 0 };
let rewards: any = null;
let msg = "Connect Phantom to view your private account.";
let amount = "10";
let destination = "";
let busy = false;

function App() {
  const b = rewards?.balance;
  const cfg = rewards?.config || {
    tokenLabel: "$WAVES",
    minWithdraw: 10,
    tokensPerMinute: 1,
  };
  return (
    <div className="panel account-panel">
      <div className="toolbar sticky-actions">
        <div>
          <strong>
            {wallet.authenticated
              ? short(wallet.publicKey)
              : "Wallet not connected"}
          </strong>
          <div className="small">{msg}</div>
        </div>
        <div className="tagrow">
          <button className="btn primary" onClick={connect} disabled={busy}>
            {wallet.authenticated ? "Reconnect Phantom" : "Connect Phantom"}
          </button>
          <a className="btn" href="/library">
            Private library
          </a>
          <a className="btn" href="/rooms">
            Meditation rooms
          </a>
        </div>
      </div>

      {wallet.authenticated ? (
        <div className="account-grid">
          <article className="card balance-card">
            <h3>Internal room balance</h3>
            <div className="big-number">
              {b
                ? b.available.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
                : "0"}{" "}
              <span>{cfg.tokenLabel}</span>
            </div>
            <p className="small">
              Lifetime earned: {b?.lifetimeEarned || 0} {cfg.tokenLabel} ·
              withdrawn/requested: {b?.lifetimeWithdrawn || 0} {cfg.tokenLabel}
            </p>
            <p className="notice">
              <strong>How to earn:</strong> join a synced meditation room with
              Phantom connected. You earn around {cfg.tokensPerMinute}{" "}
              {cfg.tokenLabel}/min while the room is playing. Anonymous
              listeners stay synced but do not earn.
            </p>
          </article>
          <article className="card withdraw-card">
            <h3>Withdraw</h3>
            <p className="small">
              Withdrawals are request-based for now. The server does not hold a
              hot wallet or auto-send tokens.
            </p>
            <div className="field">
              <label>Amount, {cfg.tokenLabel}</label>
              <input
                value={amount}
                onInput={(e: any) => {
                  amount = e.currentTarget.value;
                  paint();
                }}
              />
            </div>
            <div className="field">
              <label>Destination wallet</label>
              <input
                value={destination || wallet.publicKey || ""}
                onInput={(e: any) => {
                  destination = e.currentTarget.value;
                  paint();
                }}
              />
            </div>
            <button className="btn primary" onClick={withdraw} disabled={busy}>
              Request withdrawal
            </button>
            <p className="small">
              Minimum: {cfg.minWithdraw} {cfg.tokenLabel}
            </p>
          </article>
        </div>
      ) : (
        <div className="notice">
          Studio, public soundtracks, and private # links work without login.
          Phantom is only needed for private cloud library and room rewards.
        </div>
      )}

      {wallet.authenticated ? <History /> : null}
    </div>
  );
}
function History() {
  return (
    <div className="two account-history">
      <article className="card">
        <h3>Recent earnings</h3>
        {rewards?.events?.length ? (
          <table className="matrix">
            <thead>
              <tr>
                <th>When</th>
                <th>Room</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rewards.events.slice(0, 20).map((e: any) => (
                <tr key={e.eventId}>
                  <td>{new Date(e.createdAt).toLocaleString()}</td>
                  <td>
                    {e.soundtrackSlug}
                    <br />
                    <span className="small">{e.secondsCredited}s credited</span>
                  </td>
                  <td>{e.amountLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No earnings yet.</p>
        )}
      </article>
      <article className="card">
        <h3>Withdrawals</h3>
        {rewards?.withdrawals?.length ? (
          <table className="matrix">
            <thead>
              <tr>
                <th>When</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rewards.withdrawals.slice(0, 20).map((w: any) => (
                <tr key={w.requestId}>
                  <td>{new Date(w.createdAt).toLocaleString()}</td>
                  <td>
                    {w.status}
                    <br />
                    <span className="small">
                      {w.destinationWallet?.slice(0, 4)}…
                      {w.destinationWallet?.slice(-4)}
                    </span>
                  </td>
                  <td>{w.amountLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No withdrawal requests.</p>
        )}
      </article>
    </div>
  );
}
async function connect() {
  try {
    busy = true;
    paint();
    wallet = await connectAndVerify();
    await loadRewards();
    msg = "Connected.";
  } catch (e: any) {
    msg = e.message || "connect failed";
  }
  busy = false;
  paint();
}
async function loadRewards() {
  const r = await fetch("/api/account/rewards")
    .then((r) => r.json())
    .catch(() => ({ ok: false, error: "load failed" }));
  if (!r.ok) {
    msg = r.error || "account load failed";
    rewards = null;
  } else rewards = r;
}
async function withdraw() {
  busy = true;
  msg = "Creating withdrawal request…";
  paint();
  try {
    const r = await fetch("/api/account/withdraw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amount: Number(amount),
        destinationWallet: destination || wallet.publicKey,
      }),
    }).then((r) => r.json());
    if (!r.ok) throw new Error(r.error || "withdraw failed");
    rewards = { ...rewards, balance: r.balance };
    await loadRewards();
    msg = "Withdrawal request created.";
  } catch (e: any) {
    msg = e.message || "withdraw failed";
  }
  busy = false;
  paint();
}
function short(pk: string | null) {
  return pk ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : "connected";
}
function paint() {
  render(<App />, document.getElementById("account-root")!);
}
export default async function mount() {
  wallet = await getWalletState();
  if (wallet.authenticated) await loadRewards();
  paint();
  return () => render(null, document.getElementById("account-root")!);
}
