import { render } from "tradjs/client";
import {
  connectAndVerify,
  getWalletState,
  signOut,
  type WalletState,
} from "@/client/wallet";

let user: WalletState = { authenticated: false, publicKey: null, balance: 0 };
let stats: any = null;
let msg = "";

function App() {
  return (
    <div className="panel account-panel">
      <div className="toolbar sticky-actions">
        <div>
          <strong>
            {user.authenticated
              ? user.email || user.name || "Google account"
              : "Not signed in"}
          </strong>
          <div className="small">
            {msg ||
              (user.authenticated
                ? "Google account connected."
                : "Sign in to save tracks and optionally publish to the catalogue.")}
          </div>
        </div>
        <div className="tagrow">
          {user.authenticated ? (
            <button className="btn" onClick={logout}>
              Sign out
            </button>
          ) : null}
          <button className="btn primary" onClick={login}>
            {user.authenticated ? "Refresh" : "Sign in with Google"}
          </button>
          <a className="btn" href="/library">
            Library
          </a>
          <a className="btn" href="/studio">
            Studio
          </a>
        </div>
      </div>

      {user.authenticated ? (
        <div className="account-grid">
          <article className="card balance-card">
            <h3>Private saved tracks</h3>
            <div className="big-number">
              {stats?.savedCount ?? 0}
              <span>
                {stats?.unlimited ? " saved" : ` / ${stats?.limit ?? ""}`}
              </span>
            </div>
            <p className="small">
              Private library saves are unlimited by default. Anonymous{" "}
              <span className="mono">#</span> source URLs still work without
              login; Google only gives you persistent cloud saves.
            </p>
          </article>
          <article className="card">
            <h3>Publishing model</h3>
            <p className="notice">
              <strong>No payments. No Phantom. No token gates.</strong> Your own
              tracks save privately by default. You may also publish selected
              tracks into the public community section of the catalogue. Public
              publish limit: {stats?.publishLimit ?? 50}; currently published:{" "}
              {stats?.publishedCount ?? 0}.
            </p>
          </article>
        </div>
      ) : (
        <div className="notice">
          <strong>Local-first by default.</strong> Studio can create, play,
          export, and generate private <span className="mono">#</span> URLs
          without an account. Google adds an unlimited private library and the
          option to publish selected tracks publicly.
        </div>
      )}
    </div>
  );
}
async function login() {
  try {
    await connectAndVerify();
  } catch (e: any) {
    msg = e.message || "sign-in started";
    paint();
  }
}
async function logout() {
  await signOut();
}
async function load() {
  const r = await fetch("/api/account")
    .then((r) => r.json())
    .catch(() => ({ ok: false }));
  if (r.ok) stats = r;
}
function paint() {
  render(<App />, document.getElementById("account-root")!);
}
export default async function mount() {
  user = await getWalletState();
  if (user.authenticated) await load();
  paint();
  return () => render(null, document.getElementById("account-root")!);
}
