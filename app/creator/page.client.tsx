import { render } from "tradjs/client";
import { connectAndVerify } from "@/client/wallet";

let data: any = null;
let msg =
  "Connect Phantom to manage your creator profile and published tracks.";
let busy = false;

function App() {
  return (
    <div>
      <div className="toolbar">
        <div>
          <strong>Creator dashboard</strong>
          <div className="small">{msg}</div>
        </div>
        <div className="tagrow">
          <button className="btn primary" disabled={busy} onClick={load}>
            {data ? "Refresh" : "Connect Phantom"}
          </button>
          <a className="btn" href="/studio">
            Publish from Studio
          </a>
        </div>
      </div>
      {data ? <Profile /> : null}
      {data?.soundtracks?.length ? (
        <table className="matrix">
          <thead>
            <tr>
              <th>Track</th>
              <th>Status</th>
              <th>Gate</th>
              <th>Sales</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.soundtracks.map((s: any) => (
              <tr key={s.slug}>
                <td>
                  {s.title}
                  <br />
                  <span className="small">/{s.slug}</span>
                </td>
                <td>{s.status}</td>
                <td>
                  {Number(s.priceLamports || 0) > 0
                    ? `${(Number(s.priceLamports) / 1e9).toFixed(4)} SOL`
                    : Number(s.minTokens || 0) > 0
                      ? `${s.minTokens} token gate`
                      : "free"}
                </td>
                <td>{s.purchaseCount || 0}</td>
                <td>
                  <a className="btn" href={`/soundtracks/${s.slug}`}>
                    Open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : data ? (
        <p className="muted">
          No published community tracks yet. Create one in Studio and click
          Publish / sell.
        </p>
      ) : null}
    </div>
  );
}
function Profile() {
  const p = data.profile || {};
  return (
    <div className="two" style={{ margin: "12px 0" }}>
      <div className="field">
        <label>Display name</label>
        <input id="creator-name" defaultValue={p.displayName || ""} />
      </div>
      <div className="field">
        <label>Payout wallet</label>
        <input id="creator-wallet" defaultValue={p.payoutWallet || ""} />
      </div>
      <div className="field" style={{ gridColumn: "1/-1" }}>
        <label>Bio</label>
        <textarea id="creator-bio" rows="3" defaultValue={p.bio || ""} />
      </div>
      <div>
        <button className="btn" onClick={saveProfile}>
          Save profile
        </button>
      </div>
    </div>
  );
}
async function load() {
  busy = true;
  msg = "checking wallet…";
  paint();
  try {
    await connectAndVerify();
    data = await fetch("/api/creator/profile").then((r) => r.json());
    if (!data.ok) throw new Error(data.error || "load failed");
    msg = `Connected. ${data.soundtracks?.length || 0} creator track(s).`;
  } catch (e: any) {
    msg = e.message || "connect failed";
  }
  busy = false;
  paint();
}
async function saveProfile() {
  busy = true;
  msg = "saving profile…";
  paint();
  try {
    const displayName = (
      document.getElementById("creator-name") as HTMLInputElement
    )?.value;
    const payoutWallet = (
      document.getElementById("creator-wallet") as HTMLInputElement
    )?.value;
    const bio = (document.getElementById("creator-bio") as HTMLTextAreaElement)
      ?.value;
    const res = await fetch("/api/creator/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, payoutWallet, bio }),
    }).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || "save failed");
    await load();
    msg = "profile saved";
  } catch (e: any) {
    msg = e.message || "save failed";
  }
  busy = false;
  paint();
}
function paint() {
  render(<App />, document.getElementById("creator-root")!);
}
export default function mount() {
  paint();
  return () => render(null, document.getElementById("creator-root")!);
}
