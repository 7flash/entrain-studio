import { render, navigate } from "tradjs/client";
import { sessionToPatternText } from "@/format/pattern-text";
import {
  connectAndVerify,
  getWalletState,
  signOut,
  type WalletState,
} from "@/client/wallet";

let state: WalletState = { authenticated: false, publicKey: null, balance: 0 };
let sessions: any[] = [];
let message = "";
let limit: number | null = null;
let remaining: number | null = null;
let unlimited = true;
let busyId: number | null = null;

function App() {
  return (
    <div className="panel">
      <div className="toolbar">
        <div>
          <strong>
            {state.authenticated
              ? state.email || state.name || "Google account"
              : "Sign in to save tracks"}
          </strong>
          <div className="small">
            {message ||
              (state.authenticated
                ? unlimited
                  ? `${sessions.length} saved tracks · unlimited private library`
                  : `${sessions.length}/${limit} saved tracks · ${remaining} remaining`
                : "Studio works without login. Google sign-in gives you an unlimited private library and optional public publishing.")}
          </div>
        </div>
        <div className="tagrow">
          {state.authenticated ? (
            <button className="btn" onClick={logout}>
              Sign out
            </button>
          ) : null}
          <button className="btn primary" onClick={connect}>
            {state.authenticated ? "Refresh account" : "Sign in with Google"}
          </button>
        </div>
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
                <div className="small">
                  Share link: <span className="mono">/shared/{s.shareId}</span>{" "}
                  · {s.isShared ? "enabled" : "disabled"}
                </div>
                {s.description ? (
                  <p className="muted">{s.description}</p>
                ) : null}
              </div>
              <div className="tagrow">
                <button className="btn" onClick={() => openSession(s)}>
                  Open in editor
                </button>
                <button className="btn" onClick={() => copyShare(s)}>
                  Copy share link
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
                  className="btn"
                  disabled={busyId === s.id}
                  onClick={() => toggleShared(s)}
                >
                  {s.isShared ? "Disable link" : "Enable link"}
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
            No saved tracks yet. Save from Studio or open a shared link and
            clone it.
          </p>
        ) : null}
        {!state.authenticated ? (
          <div className="notice">
            <strong>No login needed for creation.</strong> Use Studio and
            private <span className="mono">#</span> links without an account.
            Google is only for persistent private saves and optional public
            catalogue publishing.
          </div>
        ) : null}
      </div>
    </div>
  );
}
async function connect() {
  try {
    await connectAndVerify();
  } catch (e: any) {
    message = e.message || "sign-in started";
    paint();
  }
}
async function logout() {
  await signOut();
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
    limit = r.limit ?? null;
    unlimited = !!r.unlimited;
    remaining =
      r.remaining ?? (limit ? Math.max(0, limit - sessions.length) : null);
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
async function copyShare(s: any) {
  const url = new URL(`/shared/${s.shareId}`, location.origin).toString();
  await navigator.clipboard.writeText(url).catch(() => {});
  message = "share link copied";
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
async function toggleShared(s: any) {
  busyId = s.id;
  paint();
  const r = await fetch(`/api/sessions/${s.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ isShared: !s.isShared }),
  })
    .then((x) => x.json())
    .catch(() => ({ ok: false, error: "update failed" }));
  message = r.ok ? "updated share link" : r.error || "update failed";
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
