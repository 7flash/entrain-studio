import { render, navigate } from "tradjs/client";
import { sessionToPatternText } from "@/format/pattern-text";
import {
  connectAndVerify,
  getWalletState,
  tokenLabel,
  type WalletState,
} from "@/client/wallet";

let state: WalletState = { authenticated: false, publicKey: null, balance: 0 };
let sessions: any[] = [];
let message = "";
let busyId: number | null = null;

function App() {
  return (
    <div className="panel">
      <div className="toolbar">
        <div>
          <strong>
            {state.authenticated
              ? `Wallet ${state.publicKey?.slice(0, 4)}…${state.publicKey?.slice(-4)}`
              : "Connect wallet"}
          </strong>
          <div className="small">
            {message ||
              (state.authenticated
                ? `${sessions.length} saved tracks · ${tokenLabel(state.balance)}`
                : "Wallet session required to list saved tracks.")}
          </div>
        </div>
        <button className="btn primary" onClick={connect}>
          {state.authenticated ? "Reconnect" : "Connect Phantom"}
        </button>
      </div>
      <div className="list">
        {sessions.map((s) => (
          <article className="card" key={s.id || s.createdAt}>
            <div className="toolbar">
              <div>
                <h3>
                  {s.isFavorite ? "★ " : ""}
                  {s.name}
                </h3>
                <div className="small">
                  {s.sourceSlug ? `clone of ${s.sourceSlug}` : s.slug} ·{" "}
                  {s.scriptFormat || "entrain-script.v1"} ·{" "}
                  {new Date(s.createdAt).toLocaleString()}
                </div>
                {s.description ? (
                  <p className="muted">{s.description}</p>
                ) : null}
              </div>
              <div className="tagrow">
                <button className="btn" onClick={() => openSession(s)}>
                  Open in editor
                </button>
                <button className="btn" onClick={() => copySource(s)}>
                  Copy source
                </button>
                <button
                  className="btn"
                  disabled={busyId === s.id}
                  onClick={() => toggleFavorite(s)}
                >
                  {s.isFavorite ? "Unfavorite" : "Favorite"}
                </button>
                <button
                  className="btn danger"
                  disabled={busyId === s.id}
                  onClick={() => remove(s)}
                >
                  Delete
                </button>
              </div>
            </div>
            {s.scriptText ? (
              <details className="debug-details">
                <summary>Source script</summary>
                <pre className="source-pre">{s.scriptText}</pre>
              </details>
            ) : null}
          </article>
        ))}
        {state.authenticated && !sessions.length ? (
          <p className="muted">
            No saved tracks yet. Save from the studio or clone an unlocked
            soundtrack.
          </p>
        ) : null}
      </div>
    </div>
  );
}
async function connect() {
  try {
    state = await connectAndVerify();
    await load();
  } catch (e: any) {
    message = e.message || "connect failed";
    paint();
  }
}
async function load() {
  const r = await fetch("/api/sessions")
    .then((x) => x.json())
    .catch(() => ({ ok: false, error: "failed" }));
  if (!r.ok) {
    message = r.error || "load failed";
    sessions = [];
  } else {
    sessions = r.sessions || [];
    message = "";
  }
  paint();
}
function sourceFor(s: any) {
  return s.scriptText || (s.session ? sessionToPatternText(s.session) : "");
}
function openSession(s: any) {
  const source = sourceFor(s);
  if (source) sessionStorage.setItem("entrain:loaded-script", source);
  else
    sessionStorage.setItem("entrain:loaded-session", JSON.stringify(s.session));
  navigate("/studio?saved=1");
}
async function copySource(s: any) {
  await navigator.clipboard.writeText(sourceFor(s)).catch(() => {});
  message = "source script copied";
  paint();
}
async function toggleFavorite(s: any) {
  busyId = s.id;
  paint();
  const r = await fetch(`/api/sessions/${s.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ isFavorite: !s.isFavorite }),
  })
    .then((x) => x.json())
    .catch(() => ({ ok: false, error: "update failed" }));
  message = r.ok ? "updated favorite" : r.error || "update failed";
  busyId = null;
  await load();
}
async function remove(s: any) {
  if (!confirm(`Delete ${s.name}?`)) return;
  busyId = s.id;
  paint();
  const r = await fetch(`/api/sessions/${s.id}`, { method: "DELETE" })
    .then((x) => x.json())
    .catch(() => ({ ok: false, error: "delete failed" }));
  message = r.ok ? "deleted" : r.error || "delete failed";
  busyId = null;
  await load();
}
function paint() {
  render(<App />, document.getElementById("library-root")!);
}
export default async function mount() {
  state = await getWalletState();
  if (state.authenticated) await load();
  else paint();
  return () => render(null, document.getElementById("library-root")!);
}
