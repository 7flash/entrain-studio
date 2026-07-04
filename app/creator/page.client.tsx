import { render, navigate } from "tradjs/client";
import {
  connectAndVerify,
  getWalletState,
  signOut,
  type WalletState,
} from "@/client/wallet";

let user: WalletState = { authenticated: false, publicKey: null, balance: 0 };
let tracks: any[] = [];
let msg = "";
let busySlug = "";
let limit = 50;
let remaining = 50;

function App() {
  return (
    <div className="panel creator-panel">
      <div className="toolbar sticky-actions">
        <div>
          <strong>
            {user.authenticated
              ? user.email || user.name || "Google account"
              : "Creator workspace"}
          </strong>
          <div className="small">
            {msg ||
              (user.authenticated
                ? `${tracks.length} catalogue rows · ${remaining}/${limit} publishing slots available`
                : "Sign in with Google to manage tracks you publish into the public catalogue.")}
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
          <a className="btn" href="/studio">
            Create in Studio
          </a>
          <a className="btn" href="/explore#user-published">
            User published
          </a>
        </div>
      </div>

      {!user.authenticated ? (
        <div className="notice">
          <strong>Publishing is optional.</strong> Studio sharing by encoded{" "}
          <span className="mono">#</span> source URL still works without login.
          Google is only for cloud library saves and public catalogue
          publishing.
        </div>
      ) : null}

      {user.authenticated ? (
        <div className="account-grid">
          <article className="card balance-card">
            <h3>Public catalogue slots</h3>
            <div className="big-number">
              {Math.max(0, limit - remaining)}
              <span> / {limit}</span>
            </div>
            <p className="small">
              These are public community rows under Explore → User published.
              Private library saves are separate and unlimited.
            </p>
          </article>
          <article className="card">
            <h3>Creator rules</h3>
            <p className="muted">
              Published tracks must be original, safe for public playback, and
              described as experimental soundtracks. No medical, guaranteed, or
              supernatural outcome claims.
            </p>
          </article>
        </div>
      ) : null}

      {user.authenticated ? (
        <div className="list">
          {tracks.map((t) => (
            <article className="card" key={t.slug}>
              <div className="toolbar">
                <div>
                  <div className="tagrow">
                    <span
                      className={
                        t.isPublished ? "pill unlocked" : "pill locked"
                      }
                    >
                      {t.isPublished ? "published" : "archived"}
                    </span>
                    <span className="pill">
                      {t.scriptFormat || "entrain-script.v1"}
                    </span>
                    {t.stats ? (
                      <span className="pill">
                        {t.stats.durationMin}m · {t.stats.layerCount} layers
                      </span>
                    ) : null}
                  </div>
                  <h3>{t.title}</h3>
                  <p className="muted">{t.summary}</p>
                  <div className="small mono">/{t.slug}</div>
                </div>
                <div className="tagrow">
                  {t.isPublished ? (
                    <a className="btn" href={`/soundtracks/${t.slug}`}>
                      Open
                    </a>
                  ) : null}
                  <button className="btn" onClick={() => openInStudio(t)}>
                    Edit clone
                  </button>
                  <button className="btn" onClick={() => copySource(t)}>
                    Copy source
                  </button>
                  <button
                    className="btn danger"
                    disabled={busySlug === t.slug}
                    onClick={() => archive(t)}
                  >
                    {t.isPublished ? "Unpublish" : "Archived"}
                  </button>
                </div>
              </div>
              {t.scriptText ? (
                <details className="debug-details">
                  <summary>Source script</summary>
                  <pre className="source-pre">{t.scriptText}</pre>
                </details>
              ) : null}
            </article>
          ))}
          {!tracks.length ? (
            <div className="notice">
              No public tracks yet. Open Studio, design a track, then use{" "}
              <strong>Publish to catalogue</strong>.
            </div>
          ) : null}
        </div>
      ) : null}
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
  const r = await fetch("/api/creator/tracks")
    .then((r) => r.json())
    .catch(() => ({ ok: false, error: "failed to load creator tracks" }));
  if (r.ok) {
    tracks = r.tracks || [];
    limit = r.limit || 50;
    remaining = r.remaining ?? 50;
    msg = "";
  } else {
    tracks = [];
    msg = r.error || "failed to load";
  }
  paint();
}
function openInStudio(t: any) {
  if (t.scriptText)
    sessionStorage.setItem("entrain:loaded-script", t.scriptText);
  navigate("/studio?published=clone");
}
async function copySource(t: any) {
  await navigator.clipboard.writeText(t.scriptText || "").catch(() => {});
  msg = "source copied";
  paint();
}
async function archive(t: any) {
  if (!t.isPublished) return;
  if (!confirm(`Unpublish “${t.title}” from the public catalogue?`)) return;
  busySlug = t.slug;
  paint();
  const r = await fetch(`/api/soundtracks/${t.slug}/owner`, {
    method: "DELETE",
  })
    .then((r) => r.json())
    .catch(() => ({ ok: false, error: "unpublish failed" }));
  msg = r.ok ? "unpublished from catalogue" : r.error || "unpublish failed";
  busySlug = "";
  await load();
}
function paint() {
  render(<App />, document.getElementById("creator-root")!);
}
export default async function mount() {
  user = await getWalletState();
  if (user.authenticated) await load();
  else paint();
  return () => render(null, document.getElementById("creator-root")!);
}
