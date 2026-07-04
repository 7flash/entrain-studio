import { render, navigate } from "tradjs/client";
import {
  sanitizeSession,
  type EntrainSessionV1,
} from "@/format/entrain-format";
import { createAudioEngine } from "@/client/audio-engine";
import {
  connectAndVerify,
  getWalletState,
  type WalletState,
} from "@/client/wallet";

let roomId = "";
let slug = "";
let hostKey = "";
let room: any = null;
let session: EntrainSessionV1 | null = null;
let engine = createAudioEngine(() => session!);
let wallet: WalletState = { authenticated: false, publicKey: null, balance: 0 };
let message = "Loading synced meditation room…";
let syncMessage = "Join the room to sync playback.";
let busy = false;
let following = false;
let signature = "";
let pollTimer: any = null;
let heartbeatTimer: any = null;
let clockOffsetMs = 0;
let clockRttMs = 0;
let lastDriftSec = 0;
const clientId = getClientId();

function App() {
  const reward = room?.reward || {
    tokenLabel: "$WAVES",
    tokensPerMinute: 1,
    tickSec: 10,
  };
  const me = room?.participants?.find((p: any) => p.clientId === clientId);
  const isHost = !!hostKey;
  const cueing = room?.state === "playing" && roomOffsetSigned(room) < -0.05;
  return (
    <div className="room-player">
      <div className="room-status-card">
        <div>
          <strong>{room?.title || session?.name || "Meditation room"}</strong>
          <div className="small">{message}</div>
        </div>
        <div className="tagrow">
          <span className="pill mono">{room?.roomId || roomId}</span>
          <span className="pill">
            {cueing ? "countdown" : room?.state || "loading"}
          </span>
          {following ? <span className="pill unlocked">following</span> : null}
          {wallet.authenticated ? (
            <span className="pill unlocked">earning-ready</span>
          ) : (
            <span className="pill">anonymous</span>
          )}
        </div>
      </div>

      <div className="room-clock-panel">
        <div className="room-clock-main">
          <div className="room-clock-label">Room position</div>
          <div className="room-clock-time mono">
            {cueing
              ? `-${fmtTime(Math.abs(roomOffsetSigned(room)))}`
              : fmtTime(roomPosition(room))}
          </div>
          <div className="small">
            {cueing ? "shared start is armed" : syncMessage}
          </div>
        </div>
        <div className="room-metrics">
          <span>
            <b>{room?.participantCount || 0}</b>
            <em>listeners</em>
          </span>
          <span>
            <b>{clockRttMs ? `±${Math.round(clockRttMs / 2)}ms` : "—"}</b>
            <em>clock</em>
          </span>
          <span>
            <b>{following ? `${lastDriftSec.toFixed(2)}s` : "—"}</b>
            <em>drift</em>
          </span>
          <span>
            <b>
              {me?.rewardTotalMicro
                ? (me.rewardTotalMicro / 1_000_000).toFixed(3)
                : "0"}
            </b>
            <em>{reward.tokenLabel}</em>
          </span>
        </div>
      </div>

      <div className="scope room-scope">
        <canvas id="room-scope" />
      </div>

      <div className="room-actions tagrow">
        <button
          className="btn primary"
          onClick={joinRoom}
          disabled={busy || !session}
        >
          {following ? "Re-sync" : "Join synced listening"}
        </button>
        <button
          className="btn"
          onClick={toggleLocal}
          disabled={busy || !session}
        >
          {engine.running ? "Stop local audio" : "Preview unsynced"}
        </button>
        <button className="btn" onClick={connectWallet} disabled={busy}>
          {wallet.authenticated
            ? "Reconnect Phantom"
            : "Connect Phantom for rewards"}
        </button>
        <button className="btn" onClick={copyLink} disabled={!room}>
          Copy room link
        </button>
        <button
          className="btn"
          onClick={() => navigate(`/soundtracks/${encodeURIComponent(slug)}`)}
        >
          Soundtrack page
        </button>
        <button className="btn" onClick={() => navigate("/account")}>
          Account
        </button>
      </div>

      {isHost ? (
        <div className="notice good room-host-panel">
          <strong>Host controls</strong>
          <div className="tagrow" style={{ marginTop: "8px" }}>
            <button
              className="btn primary"
              onClick={() => control("start", 10)}
              disabled={busy}
            >
              Cue 10s start
            </button>
            <button
              className="btn"
              onClick={() => control("start", 0)}
              disabled={busy}
            >
              Start now
            </button>
            <button
              className="btn"
              onClick={() => control("pause")}
              disabled={busy}
            >
              Pause
            </button>
            <button
              className="btn"
              onClick={() => control("stop")}
              disabled={busy}
            >
              Stop
            </button>
          </div>
        </div>
      ) : (
        <p className="small muted">
          Host controls appear only in the browser that created the room or
          opened the host link.
        </p>
      )}

      <Participants />
    </div>
  );
}

function Participants() {
  const ps = room?.participants || [];
  return (
    <div className="card room-participants-card">
      <h3>Listeners</h3>
      {ps.length ? (
        <div className="room-participant-grid">
          {ps.map((p: any) => (
            <div className="room-person" key={p.clientId}>
              <strong>
                {p.isHost ? "★ " : ""}
                {p.label || "listener"}
              </strong>
              <span>
                {p.publicKey ? "Phantom connected" : "anonymous synced"}
              </span>
              <em>
                {p.rewardTotalMicro
                  ? `${(p.rewardTotalMicro / 1_000_000).toFixed(4)} earned in this room`
                  : "no room rewards yet"}
              </em>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No active listeners yet.</p>
      )}
    </div>
  );
}

async function boot() {
  wallet = await getWalletState().catch(() => wallet);
  hostKey =
    new URLSearchParams(location.search).get("host") ||
    localStorage.getItem(`entrain:room-host:${roomId}`) ||
    "";
  if (hostKey) localStorage.setItem(`entrain:room-host:${roomId}`, hostKey);
  await calibrateClock();
  await loadRoom();
  await loadSession();
  startPoll();
  await heartbeat();
  paint();
}
async function loadRoom() {
  const res = await fetch(`/api/sync/rooms/${encodeURIComponent(roomId)}`).then(
    (r) => r.json(),
  );
  if (!res.ok) throw new Error(res.error || "room not found");
  room = res.room;
  slug = room.slug || slug;
  message = `Room loaded. ${room.state === "playing" ? "Join to sync to the live position." : "Waiting for host start."}`;
}
async function loadSession() {
  if (!slug) return;
  const res = await fetch(
    `/api/access?slug=${encodeURIComponent(slug)}&action=play`,
  ).then((r) => r.json());
  if (!res.ok) throw new Error(res.error || "soundtrack unavailable");
  session = sanitizeSession(res.template.session);
  engine.stop();
  engine = createAudioEngine(() => session!);
}
async function connectWallet() {
  busy = true;
  syncMessage = "connecting Phantom…";
  paint();
  try {
    wallet = await connectAndVerify();
    syncMessage =
      "Phantom connected. Join synced listening and keep this tab active to earn.";
    await heartbeat();
  } catch (e: any) {
    syncMessage = e.message || "wallet connect failed";
  }
  busy = false;
  paint();
}
async function joinRoom() {
  if (!session) return;
  busy = true;
  following = true;
  syncMessage = "syncing to room…";
  paint();
  try {
    await calibrateClock();
    await heartbeat();
    await loadRoom();
    await applyRoom(true);
  } catch (e: any) {
    syncMessage = e.message || "join failed";
  }
  busy = false;
  paint();
}
async function toggleLocal() {
  if (!session) return;
  following = false;
  if (engine.running) {
    engine.stop();
    syncMessage = "local preview stopped";
    paint();
    return;
  }
  await engine.start({ loopPattern: true });
  syncMessage =
    "previewing locally; click Join synced listening to follow room timing.";
  paint();
  draw();
}
async function control(action: "start" | "pause" | "stop", delaySec = 0) {
  if (!roomId || !hostKey) return;
  busy = true;
  syncMessage =
    action === "start" && delaySec
      ? `cueing ${delaySec}s start…`
      : `${action} room…`;
  paint();
  try {
    await calibrateClock();
    const res = await fetch(
      `/api/sync/rooms/${encodeURIComponent(roomId)}/control`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, hostKey, delaySec }),
      },
    ).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || "room control failed");
    room = res.room;
    following = true;
    await heartbeat();
    await applyRoom(true);
  } catch (e: any) {
    syncMessage = e.message || "room control failed";
  }
  busy = false;
  paint();
}
async function poll() {
  try {
    await loadRoom();
    const sig = `${room.state}:${room.startedAt}:${Math.round(room.pausedOffsetSec * 10)}`;
    if (following && sig !== signature) await applyRoom();
    else if (following && room.state === "playing") await correctDrift();
    else paint();
  } catch (e: any) {
    syncMessage = e.message || "room poll failed";
    paint();
  }
}
function startPoll() {
  if (pollTimer) clearInterval(pollTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  pollTimer = setInterval(poll, 2000);
  heartbeatTimer = setInterval(heartbeat, 10_000);
}
async function heartbeat() {
  if (!roomId) return;
  try {
    const label = wallet.publicKey
      ? `${wallet.publicKey.slice(0, 4)}…${wallet.publicKey.slice(-4)}`
      : `anon-${clientId.slice(0, 4)}`;
    const res = await fetch(
      `/api/sync/rooms/${encodeURIComponent(roomId)}/presence`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          label,
          hostKey,
          clientOffsetMs: Math.round(clockOffsetMs),
          rttMs: Math.round(clockRttMs),
          earningActive: Boolean(following && engine.running),
        }),
      },
    ).then((r) => r.json());
    if (res.ok) room = res.room;
  } catch {}
}
async function applyRoom(force = false) {
  if (!session || !room || !following) return;
  const sig = `${room.state}:${room.startedAt}:${Math.round(room.pausedOffsetSec * 10)}`;
  if (!force && sig === signature) return;
  signature = sig;
  if (room.state === "playing") {
    const offset = roomOffsetSigned(room);
    engine.stop();
    if (offset < -0.08) {
      await engine.start({
        loopPattern: true,
        offsetSec: 0,
        delaySec: -offset,
      });
      syncMessage = `armed. Shared start in ${Math.ceil(-offset)}s.`;
    } else {
      await engine.start({ loopPattern: true, offsetSec: Math.max(0, offset) });
      syncMessage = `synced at ${fmtTime(Math.max(0, offset))}.`;
    }
    lastDriftSec = 0;
    draw();
  } else {
    if (engine.running) engine.stop();
    syncMessage =
      room.state === "paused"
        ? `room paused at ${fmtTime(roomPosition(room))}`
        : "room idle. Waiting for host.";
  }
  await heartbeat();
  paint();
}
async function correctDrift() {
  if (!session || !room || room.state !== "playing" || !engine.running) return;
  const desired = Math.max(0, roomOffsetSigned(room));
  const actual = (engine as any).positionSec
    ? (engine as any).positionSec()
    : desired;
  lastDriftSec = actual - desired;
  if (Math.abs(lastDriftSec) > 0.45) {
    engine.stop();
    await engine.start({ loopPattern: true, offsetSec: desired });
    syncMessage = `corrected ${lastDriftSec.toFixed(2)}s drift.`;
    lastDriftSec = 0;
    draw();
  }
  await heartbeat();
  paint();
}
async function calibrateClock() {
  let best: any = null;
  for (let i = 0; i < 4; i++) {
    const t0 = Date.now();
    const res = await fetch("/api/sync/clock", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);
    const t1 = Date.now();
    if (!res?.ok) continue;
    const rtt = t1 - t0;
    const offset = Number(res.serverNow) + rtt / 2 - t1;
    if (!best || rtt < best.rtt) best = { rtt, offset };
    await new Promise((r) => setTimeout(r, 40));
  }
  if (best) {
    clockOffsetMs = best.offset;
    clockRttMs = best.rtt;
  }
}
function copyLink() {
  const u = new URL(`/rooms/${encodeURIComponent(roomId)}`, location.origin);
  navigator.clipboard.writeText(u.toString()).catch(() => {});
  syncMessage = "room link copied";
  paint();
}
function roomOffsetSigned(r: any) {
  if (!r) return 0;
  const nowServer = Date.now() + clockOffsetMs;
  if (r.state === "playing" && Number(r.startedAt || 0) > 0)
    return (nowServer - Number(r.startedAt)) / 1000;
  return Math.max(0, Number(r.pausedOffsetSec || 0));
}
function roomPosition(r: any) {
  return Math.max(0, roomOffsetSigned(r));
}
function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    r = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
function getClientId() {
  const k = "entrain:sync-client-id";
  let id = localStorage.getItem(k);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(k, id);
  }
  return id;
}
function paint() {
  render(<App />, document.getElementById("room-player-root")!);
}
function draw() {
  if (!engine.running) return;
  const c = document.getElementById("room-scope") as HTMLCanvasElement | null;
  if (c) engine.drawScope(c);
  requestAnimationFrame(draw);
}

export default async function mount() {
  const root = document.getElementById("room-player-root")!;
  roomId = String(root.dataset.roomId || "").toUpperCase();
  slug = String(root.dataset.slug || "");
  try {
    await boot();
  } catch (e: any) {
    message = e.message || "room failed";
    paint();
  }
  return () => {
    if (pollTimer) clearInterval(pollTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (roomId)
      fetch(
        `/api/sync/rooms/${encodeURIComponent(roomId)}/presence?clientId=${encodeURIComponent(clientId)}`,
        { method: "DELETE" },
      ).catch(() => {});
    engine.stop();
    render(null, root);
  };
}
