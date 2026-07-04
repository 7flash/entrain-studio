import { render, navigate } from "tradjs/client";
import {
  connectAndVerify,
  getWalletState,
  type WalletState,
} from "@/client/wallet";

let data: any = { rooms: [], soundtracks: [] };
let wallet: WalletState = { authenticated: false, publicKey: null, balance: 0 };
let selectedSlug = "";
let msg =
  "Rooms are public. Phantom is optional, but required to earn internal room rewards.";
let busy = false;

function App() {
  const reward = data.rooms?.[0]?.reward || {
    tokensPerMinute: 1,
    tokenLabel: "$WAVES",
    tickSec: 10,
  };
  return (
    <div className="panel rooms-panel">
      <div className="toolbar sticky-actions">
        <div>
          <strong>Meditation rooms</strong>
          <div className="small">{msg}</div>
        </div>
        <div className="tagrow">
          <button className="btn" onClick={load} disabled={busy}>
            Refresh
          </button>
          <button className="btn primary" onClick={connect} disabled={busy}>
            {wallet.authenticated
              ? short(wallet.publicKey)
              : "Connect Phantom for rewards"}
          </button>
          <a className="btn" href="/account">
            Account
          </a>
        </div>
      </div>
      <div className="notice good">
        <strong>Room rewards</strong>
        <br />
        <span className="small">
          Connected listeners earn about {reward.tokensPerMinute}{" "}
          {reward.tokenLabel}/min while present in a playing room. Anonymous
          listeners can still sync, but do not earn. Rewards are internal
          accounting until manually withdrawn from Account.
        </span>
      </div>

      <div className="card room-create-card">
        <h3>Create a room</h3>
        <div className="two compact-two">
          <div className="field">
            <label>Soundtrack</label>
            <select
              value={selectedSlug}
              onChange={(e: any) => {
                selectedSlug = e.currentTarget.value;
                paint();
              }}
            >
              {data.soundtracks.map((s: any) => (
                <option value={s.slug} key={s.slug}>
                  {s.title} · {s.durationMin}m
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button
              className="btn primary"
              onClick={createRoom}
              disabled={busy || !selectedSlug}
            >
              Create synced room
            </button>
          </div>
        </div>
      </div>

      <div className="list room-list">
        {data.rooms?.map((r: any) => (
          <article className="card room-card" key={r.roomId}>
            <div className="toolbar room-card-top">
              <div>
                <h3>{r.title || r.slug}</h3>
                <div className="tagrow">
                  <span className="pill mono">{r.roomId}</span>
                  <span className="pill">{r.state}</span>
                  <span className="pill">{r.participantCount} listener(s)</span>
                  <span className="pill mono">{formatTime(r.elapsedSec)}</span>
                </div>
              </div>
              <div className="tagrow">
                <button className="btn primary" onClick={() => openRoom(r)}>
                  Open room
                </button>
                <button className="btn" onClick={() => copyRoom(r)}>
                  Copy link
                </button>
              </div>
            </div>
            {r.participants?.length ? (
              <div className="tagrow">
                {r.participants.slice(0, 12).map((p: any) => (
                  <span className="pill" key={p.clientId}>
                    {p.isHost ? "★ " : ""}
                    {p.publicKey ? "✓ " : ""}
                    {p.label || "listener"}
                    {p.rewardTotalMicro
                      ? ` · ${(p.rewardTotalMicro / 1_000_000).toFixed(2)}`
                      : ""}
                  </span>
                ))}
              </div>
            ) : (
              <p className="small muted">No active listeners yet.</p>
            )}
          </article>
        ))}
        {!data.rooms?.length ? (
          <p className="muted">
            No active rooms yet. Create one from a prepared soundtrack above.
          </p>
        ) : null}
      </div>
    </div>
  );
}
async function load() {
  busy = true;
  paint();
  try {
    data = await fetch("/api/rooms").then((r) => r.json());
    if (!data.ok) throw new Error(data.error || "rooms failed");
    if (!selectedSlug) selectedSlug = data.soundtracks?.[0]?.slug || "";
    msg = "Loaded rooms.";
  } catch (e: any) {
    msg = e.message || "Could not load rooms.";
  }
  busy = false;
  paint();
}
async function connect() {
  try {
    wallet = await connectAndVerify();
    msg = "Connected. Join a playing room to earn rewards.";
  } catch (e: any) {
    msg = e.message || "Wallet connect failed.";
  }
  paint();
}
async function createRoom() {
  busy = true;
  msg = "Creating room…";
  paint();
  try {
    const r = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: selectedSlug }),
    }).then((r) => r.json());
    if (!r.ok) throw new Error(r.error || "create failed");
    const url = `/rooms/${r.room.roomId}?host=${encodeURIComponent(r.hostKey)}`;
    navigate(url);
  } catch (e: any) {
    msg = e.message || "Could not create room.";
  }
  busy = false;
  paint();
}
function openRoom(r: any) {
  navigate(`/rooms/${r.roomId}`);
}
async function copyRoom(r: any) {
  const url = new URL(`/rooms/${r.roomId}`, location.origin).toString();
  await navigator.clipboard.writeText(url).catch(() => {});
  msg = "Room link copied.";
  paint();
}
function short(pk: string | null) {
  return pk ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : "connected";
}
function formatTime(sec: number) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function paint() {
  render(<App />, document.getElementById("rooms-root")!);
}
export default async function mount() {
  wallet = await getWalletState();
  await load();
  const t = setInterval(load, 10000);
  return () => {
    clearInterval(t);
    render(null, document.getElementById("rooms-root")!);
  };
}
