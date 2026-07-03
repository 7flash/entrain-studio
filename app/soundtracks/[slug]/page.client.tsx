import { render, navigate } from "tradjs/client";
import {
  sanitizeSession,
  type EntrainSessionV1,
} from "@/format/entrain-format";
import { signalMapForSession, formatSignalPoint } from "@/format/channel-map";
import { createAudioEngine } from "@/client/audio-engine";
import {
  connectAndVerify,
  getWalletState,
  refreshWalletBalance,
  tokenLabel,
  paySol,
  type WalletState,
} from "@/client/wallet";

let slug = "";
let session: EntrainSessionV1 | null = null;
let engine = createAudioEngine(() => session!);
let wallet: WalletState = { authenticated: false, publicKey: null, balance: 0 };
let message = "Load this soundtrack to check access.";
let busy = false;
let exportMinutes = 30;
let repetitions = 1;
let loadedTitle = "";

let roomId = "";
let roomHostKey = "";
let room: any = null;
let syncMessage =
  "Create or join a room so everyone hears the same soundtrack position.";
let syncBusy = false;
let syncFollowing = false;
let syncSignature = "";
let pollTimer: any = null;
let heartbeatTimer: any = null;
let clockOffsetMs = 0;
let clockRttMs = 0;
let lastDriftSec = 0;
const clientId = getClientId();

function App() {
  const locked = !session;
  return (
    <div>
      <div className="toolbar">
        <div>
          <strong>{loadedTitle || "Soundtrack player"}</strong>
          <div className="small">{message}</div>
          {wallet.authenticated ? (
            <div className="small">
              Wallet {wallet.publicKey?.slice(0, 4)}…
              {wallet.publicKey?.slice(-4)} · {tokenLabel(wallet.balance)}
            </div>
          ) : null}
        </div>
        <div className="tagrow">
          <button className="btn primary" disabled={busy} onClick={unlock}>
            {session ? "Reload access" : "Unlock / load"}
          </button>
          <button
            className="btn"
            disabled={busy || !!session}
            onClick={buyThenUnlock}
          >
            Buy access
          </button>
          <button
            className="btn"
            disabled={busy || locked}
            onClick={toggleForever}
          >
            {engine.running ? "Stop" : "Play forever"}
          </button>
          <button
            className="btn"
            disabled={busy || locked}
            onClick={cloneToEditor}
          >
            Clone to editor
          </button>
          <button
            className="btn"
            disabled={busy || locked}
            onClick={saveToLibrary}
          >
            Clone to private library
          </button>
        </div>
      </div>

      <div className="scope" style={{ margin: "12px 0" }}>
        <canvas id="soundtrack-scope" />
      </div>

      <GroupListenCard locked={locked} />

      <div className="two">
        <div className="field">
          <label>Export exact length, minutes</label>
          <input
            type="number"
            min="1"
            max="180"
            step="1"
            value={String(exportMinutes)}
            onInput={(e: any) => {
              exportMinutes = Number(e.currentTarget.value || 1);
              paint();
            }}
          />
          <button
            className="btn"
            disabled={busy || locked}
            onClick={exportLength}
          >
            {busy ? "Rendering…" : "Render exact length"}
          </button>
        </div>
        <div className="field">
          <label>Export repetitions of pattern</label>
          <input
            type="number"
            min="1"
            max="24"
            step="1"
            value={String(repetitions)}
            onInput={(e: any) => {
              repetitions = Number(e.currentTarget.value || 1);
              paint();
            }}
          />
          <button
            className="btn"
            disabled={busy || locked}
            onClick={exportRepeats}
          >
            {busy ? "Rendering…" : "Render repetitions"}
          </button>
        </div>
      </div>

      {session ? <UnlockedSignalMap session={session} /> : null}

      <p className="small">
        Exact-length export follows the soundtrack loop rule: hold-last for
        descents, repeat/crossfade-repeat for loops. Repetition export renders
        pattern length × repetitions. Ambience/sample rows keep filename and
        loop metadata, but the local audio file must be loaded in the editor
        before it can appear in exports.
      </p>
    </div>
  );
}

function GroupListenCard({ locked }: { locked: boolean }) {
  const isHost = !!room && !!roomHostKey;
  const share = room
    ? `${location.origin}/soundtracks/${encodeURIComponent(room.slug || slug)}?room=${encodeURIComponent(room.roomId)}`
    : "";
  const signedOffset = room ? roomOffsetSigned(room) : 0;
  const cueing = room?.state === "playing" && signedOffset < -0.05;
  return (
    <div className="notice good sync-card">
      <strong>Group listening</strong>
      <p className="small">
        Synced rooms calibrate browser clock offset, show listener presence, and
        let the host cue a shared countdown. Audio is still generated locally in
        each browser, so everyone must click Join once.
      </p>
      <div className="tagrow" style={{ marginBottom: "8px" }}>
        {room ? (
          <span className="pill mono">room {room.roomId}</span>
        ) : (
          <span className="pill">no room</span>
        )}
        {room ? (
          <span className="pill">{cueing ? "countdown" : room.state}</span>
        ) : null}
        {room ? (
          <span className="pill mono">
            {cueing
              ? `starts in ${Math.ceil(-signedOffset)}s`
              : `position ${fmtTime(roomPosition(room))}`}
          </span>
        ) : null}
        {room ? (
          <span className="pill mono">
            listeners {room.participantCount || 0}
          </span>
        ) : null}
        {isHost ? <span className="pill unlocked">host controls</span> : null}
        {syncFollowing ? (
          <span className="pill unlocked">following</span>
        ) : null}
        {clockRttMs ? (
          <span className="pill mono">
            clock ±{Math.round(clockRttMs / 2)}ms
          </span>
        ) : null}
        {syncFollowing ? (
          <span className="pill mono">drift {lastDriftSec.toFixed(2)}s</span>
        ) : null}
      </div>
      {room?.participants?.length ? (
        <div className="tagrow" style={{ marginBottom: "8px" }}>
          {room.participants.slice(0, 12).map((p: any) => (
            <span className="pill" key={p.clientId}>
              {p.isHost ? "★ " : ""}
              {p.label || "listener"}
            </span>
          ))}
          {room.participants.length > 12 ? (
            <span className="pill">+{room.participants.length - 12} more</span>
          ) : null}
        </div>
      ) : null}
      <div className="tagrow">
        <button
          className="btn"
          disabled={syncBusy || locked}
          onClick={createRoom}
        >
          {room ? "New room" : "Create room"}
        </button>
        <button
          className="btn primary"
          disabled={syncBusy || locked || !room}
          onClick={joinSynced}
        >
          {syncFollowing ? "Re-sync now" : "Join synced listening"}
        </button>
        {room ? (
          <button className="btn" onClick={copyRoomLink}>
            Copy room link
          </button>
        ) : null}
        {isHost ? (
          <button
            className="btn primary"
            disabled={syncBusy}
            onClick={() => controlRoom("start", 10)}
          >
            Cue 10s start
          </button>
        ) : null}
        {isHost ? (
          <button
            className="btn"
            disabled={syncBusy}
            onClick={() => controlRoom("start", 0)}
          >
            Start now
          </button>
        ) : null}
        {isHost ? (
          <button
            className="btn"
            disabled={syncBusy}
            onClick={() => controlRoom("pause")}
          >
            Pause room
          </button>
        ) : null}
        {isHost ? (
          <button
            className="btn"
            disabled={syncBusy}
            onClick={() => controlRoom("stop")}
          >
            Stop room
          </button>
        ) : null}
      </div>
      {share ? (
        <p className="small mono" style={{ wordBreak: "break-all" }}>
          {share}
        </p>
      ) : null}
      <p className="small">{syncMessage}</p>
    </div>
  );
}

function UnlockedSignalMap({ session }: { session: EntrainSessionV1 }) {
  const map = signalMapForSession(session);
  return (
    <div className="notice" style={{ marginTop: "12px" }}>
      <strong>Unlocked signal map</strong>
      <p className="small">
        {map.headphonesRequired
          ? "Stereo headphones required."
          : "No binaural headphone requirement."}{" "}
        {map.portable
          ? "Portable JSON pattern."
          : "Contains runtime local audio files."}
      </p>
      <table className="matrix">
        <thead>
          <tr>
            <th>Layer</th>
            <th>Formula</th>
            <th>Keyframes</th>
          </tr>
        </thead>
        <tbody>
          {map.layers.map((layer) => (
            <tr key={layer.id}>
              <td>
                {layer.label}
                <br />
                <span className="small">
                  {layer.panNote ||
                    (layer.requiresHeadphones ? "headphones required" : "")}
                </span>
              </td>
              <td>{layer.formula}</td>
              <td>
                {layer.points.map((p) => formatSignalPoint(p)).join(" → ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function buyThenUnlock() {
  busy = true;
  message = "checking purchase requirements…";
  paint();
  try {
    if (!wallet.authenticated) wallet = await connectAndVerify();
    const res = await fetch(
      `/api/access?slug=${encodeURIComponent(slug)}&action=play`,
    ).then((r) => r.json());
    if (res.ok) {
      session = sanitizeSession(res.template.session);
      loadedTitle = res.template.title || session.name;
      engine.stop();
      engine = createAudioEngine(() => session!);
      message = "already unlocked";
      return;
    }
    if (res.code !== "payment_required")
      throw new Error(res.error || "not purchasable");
    await buyAccess(res);
    await unlock();
  } catch (e: any) {
    message = e.message || "purchase failed";
  } finally {
    busy = false;
    paint();
  }
}

async function buyAccess(access: any) {
  if (!wallet.authenticated) wallet = await connectAndVerify();
  const purchase = await fetch(
    `/api/market/purchase?slug=${encodeURIComponent(slug)}`,
  ).then((r) => r.json());
  if (!purchase.ok)
    throw new Error(purchase.error || "could not create purchase intent");
  const intent = purchase.purchase?.intent;
  const price = Number(
    intent?.expectedLamports ||
      purchase.purchase?.priceLamports ||
      access.priceLamports ||
      0,
  );
  const basePrice = Number(
    intent?.priceLamports ||
      purchase.purchase?.priceLamports ||
      access.priceLamports ||
      0,
  );
  const recipient = String(
    intent?.payoutWallet ||
      purchase.purchase?.payoutWallet ||
      access.payoutWallet ||
      "",
  );
  if (!price || !recipient || !intent?.intentId)
    throw new Error("Missing purchase intent. Start again.");
  const sol = price / 1_000_000_000;
  const baseSol = basePrice / 1_000_000_000;
  if (
    !confirm(
      `Buy access for ${baseSol} SOL? Phantom will send ${sol} SOL including a tiny unique verification dust amount.`,
    )
  )
    throw new Error("Purchase cancelled");
  message = "open Phantom to send payment…";
  paint();
  const sent = await paySol(recipient, price, intent.memo);
  message = "confirming on-chain payment…";
  paint();
  const confirmed = await fetch("/api/market/purchase", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      slug,
      txSignature: sent.signature,
      intentId: intent.intentId,
    }),
  }).then((r) => r.json());
  if (!confirmed.ok)
    throw new Error(confirmed.error || "payment confirmation failed");
  message = "purchase confirmed; loading soundtrack…";
  paint();
}

async function unlock() {
  busy = true;
  message = "checking access…";
  paint();
  try {
    let res = await fetch(
      `/api/access?slug=${encodeURIComponent(slug)}&action=play`,
    ).then((r) => r.json());
    if (!res.ok && res.requiresWallet) {
      message = "connect Phantom and sign to unlock…";
      paint();
      wallet = await connectAndVerify();
      res = await fetch(
        `/api/access?slug=${encodeURIComponent(slug)}&action=play`,
      ).then((r) => r.json());
    }
    if (!res.ok && res.staleBalance) {
      message = "refreshing token balance…";
      paint();
      wallet = await refreshWalletBalance();
      res = await fetch(
        `/api/access?slug=${encodeURIComponent(slug)}&action=play`,
      ).then((r) => r.json());
    }
    if (!res.ok && res.code === "payment_required") {
      await buyAccess(res);
      res = await fetch(
        `/api/access?slug=${encodeURIComponent(slug)}&action=play`,
      ).then((r) => r.json());
    }
    if (!res.ok) throw new Error(res.error || "locked");
    session = sanitizeSession(res.template.session);
    loadedTitle = res.template.title || session.name;
    engine.stop();
    engine = createAudioEngine(() => session!);
    message = `loaded. Loop mode: ${session.loop?.mode || "hold-last"}. You can play forever, export WAV, clone it, or join a group room.`;
  } catch (e: any) {
    message = e.message || "unlock failed";
  } finally {
    busy = false;
    paint();
  }
}

async function toggleForever() {
  if (!session) return;
  syncFollowing = false;
  if (engine.running) {
    engine.stop();
    message = "stopped";
    paint();
    return;
  }
  await engine.start({ loopPattern: true });
  message = `playing continuously with ${session.loop?.mode || "hold-last"} loop semantics.`;
  paint();
  draw();
}

async function exportLength() {
  if (!session) return;
  busy = true;
  message = "rendering exact-length WAV locally…";
  paint();
  try {
    const seconds =
      Math.max(1, Math.min(180, exportMinutes || session.durationMin)) * 60;
    const r = await engine.renderWav(
      seconds,
      session.export?.sampleRate,
      session.export?.fadeSec,
      { loopPattern: true },
    );
    downloadBlob(r.blob, r.filename);
    message = `saved ${r.filename} · ${(r.blob.size / 1048576).toFixed(1)} MB`;
  } catch (e: any) {
    message = e.message || "render failed";
  }
  busy = false;
  paint();
}

async function exportRepeats() {
  if (!session) return;
  busy = true;
  message = "rendering repeated-pattern WAV locally…";
  paint();
  try {
    const reps = Math.max(1, Math.min(24, repetitions || 1));
    const seconds = session.durationMin * 60 * reps;
    const r = await engine.renderWav(
      seconds,
      session.export?.sampleRate,
      session.export?.fadeSec,
      { loopPattern: true, repetitions: reps },
    );
    downloadBlob(r.blob, r.filename);
    message = `saved ${r.filename} · ${(r.blob.size / 1048576).toFixed(1)} MB`;
  } catch (e: any) {
    message = e.message || "render failed";
  }
  busy = false;
  paint();
}

async function createRoom() {
  if (!session) await unlock();
  if (!session) return;
  syncBusy = true;
  syncMessage = "creating room…";
  paint();
  try {
    await calibrateClock();
    const res = await fetch("/api/sync/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    }).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || "room create failed");
    room = res.room;
    roomId = room.roomId;
    roomHostKey = res.hostKey;
    localStorage.setItem(`entrain:room-host:${roomId}`, roomHostKey);
    const url = new URL(location.href);
    url.searchParams.set("room", roomId);
    history.replaceState(null, "", url.toString());
    syncMessage =
      "room created. Copy the room link, have listeners click Join, then use Cue 10s start.";
    startRoomPoll();
    await heartbeatRoom();
  } catch (e: any) {
    syncMessage = e.message || "room create failed";
  }
  syncBusy = false;
  paint();
}

async function loadRoom(id: string) {
  if (!id) return;
  syncBusy = true;
  syncMessage = "loading room…";
  paint();
  try {
    await calibrateClock();
    const res = await fetch(
      `/api/sync/rooms/${encodeURIComponent(id.toUpperCase())}`,
    ).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || "room not found");
    room = res.room;
    roomId = room.roomId;
    roomHostKey = localStorage.getItem(`entrain:room-host:${roomId}`) || "";
    if (room.slug && room.slug !== slug) {
      navigate(
        `/soundtracks/${encodeURIComponent(room.slug)}?room=${encodeURIComponent(roomId)}`,
      );
      return;
    }
    syncMessage = `joined room ${roomId}. Unlock the soundtrack, then click Join synced listening.`;
    startRoomPoll();
    await heartbeatRoom();
  } catch (e: any) {
    syncMessage = e.message || "room load failed";
  }
  syncBusy = false;
  paint();
}

async function pollRoom() {
  if (!roomId) return;
  try {
    const res = await fetch(
      `/api/sync/rooms/${encodeURIComponent(roomId)}`,
    ).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || "room expired");
    room = res.room;
    const sig = `${room.state}:${room.startedAt}:${Math.round(room.pausedOffsetSec * 10)}`;
    if (syncFollowing && sig !== syncSignature) await applyRoomState();
    else if (syncFollowing && room.state === "playing")
      await correctDriftIfNeeded();
    else paint();
  } catch (e: any) {
    syncMessage = e.message || "room polling failed";
    room = null;
    roomId = "";
    syncFollowing = false;
    syncSignature = "";
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    paint();
  }
}

function startRoomPoll() {
  if (pollTimer) clearInterval(pollTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  pollTimer = setInterval(pollRoom, 2000);
  heartbeatTimer = setInterval(heartbeatRoom, 10_000);
}

async function joinSynced() {
  if (!roomId && room) roomId = room.roomId;
  if (!roomId) return;
  if (!session) await unlock();
  if (!session) return;
  syncFollowing = true;
  await calibrateClock();
  await heartbeatRoom();
  await pollRoom();
  await applyRoomState(true);
}

async function applyRoomState(force = false) {
  if (!room || !session || !syncFollowing) return;
  const sig = `${room.state}:${room.startedAt}:${Math.round(room.pausedOffsetSec * 10)}`;
  if (!force && sig === syncSignature) return;
  syncSignature = sig;
  if (room.state === "playing") {
    const offset = roomOffsetSigned(room);
    engine.stop();
    if (offset < -0.08) {
      await engine.start({
        loopPattern: true,
        offsetSec: 0,
        delaySec: -offset,
      });
      syncMessage = `armed for room ${room.roomId}. Shared start in ${Math.ceil(-offset)}s.`;
    } else {
      await engine.start({ loopPattern: true, offsetSec: Math.max(0, offset) });
      syncMessage = `synced to room ${room.roomId} at ${fmtTime(Math.max(0, offset))}. Keep this tab awake for best alignment.`;
    }
    lastDriftSec = 0;
    draw();
  } else {
    if (engine.running) engine.stop();
    syncMessage =
      room.state === "paused"
        ? `room paused at ${fmtTime(roomPosition(room))}`
        : "room idle. Waiting for host to start.";
  }
  paint();
}

async function correctDriftIfNeeded() {
  if (
    !room ||
    !session ||
    room.state !== "playing" ||
    !syncFollowing ||
    !engine.running
  )
    return;
  const desired = roomOffsetSigned(room);
  if (desired < 0) {
    paint();
    return;
  }
  const actual = (engine as any).positionSec
    ? (engine as any).positionSec()
    : desired;
  lastDriftSec = actual - desired;
  if (Math.abs(lastDriftSec) > 0.45) {
    engine.stop();
    await engine.start({ loopPattern: true, offsetSec: desired });
    syncMessage = `corrected ${lastDriftSec.toFixed(2)}s room drift; now at ${fmtTime(desired)}.`;
    lastDriftSec = 0;
    draw();
  }
  paint();
}

async function controlRoom(action: "start" | "pause" | "stop", delaySec = 0) {
  if (!roomId || !roomHostKey) return;
  syncBusy = true;
  syncMessage =
    action === "start" && delaySec
      ? `cueing room start in ${delaySec}s…`
      : `${action} room…`;
  paint();
  try {
    await calibrateClock();
    const res = await fetch(
      `/api/sync/rooms/${encodeURIComponent(roomId)}/control`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, hostKey: roomHostKey, delaySec }),
      },
    ).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || "room control failed");
    room = res.room;
    syncFollowing = true;
    await heartbeatRoom();
    await applyRoomState(true);
  } catch (e: any) {
    syncMessage = e.message || "room control failed";
  }
  syncBusy = false;
  paint();
}

async function heartbeatRoom() {
  if (!roomId) return;
  try {
    const label = wallet.publicKey
      ? `${wallet.publicKey.slice(0, 4)}…${wallet.publicKey.slice(-4)}`
      : clientId.slice(0, 6);
    const res = await fetch(
      `/api/sync/rooms/${encodeURIComponent(roomId)}/presence`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          label,
          hostKey: roomHostKey,
          clientOffsetMs: Math.round(clockOffsetMs),
          rttMs: Math.round(clockRttMs),
        }),
      },
    ).then((r) => r.json());
    if (res.ok) {
      room = res.room;
      paint();
    }
  } catch {}
}

async function calibrateClock() {
  let best: { offset: number; rtt: number } | null = null;
  for (let i = 0; i < 4; i++) {
    const t0 = Date.now();
    const res = await fetch("/api/sync/clock", { cache: "no-store" }).then(
      (r) => r.json(),
    );
    const t1 = Date.now();
    if (!res.ok) continue;
    const rtt = t1 - t0;
    const offset = Number(res.serverNow) + rtt / 2 - t1;
    if (!best || rtt < best.rtt) best = { offset, rtt };
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  if (best) {
    clockOffsetMs = best.offset;
    clockRttMs = best.rtt;
  }
}

async function copyRoomLink() {
  if (!room) return;
  const link = `${location.origin}/soundtracks/${encodeURIComponent(room.slug || slug)}?room=${encodeURIComponent(room.roomId)}`;
  await navigator.clipboard.writeText(link).catch(() => {});
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
  const key = "entrain:sync-client-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function cloneToEditor() {
  if (!session) return;
  const copy = sanitizeSession({ ...session, name: `${session.name} — clone` });
  sessionStorage.setItem("entrain:loaded-session", JSON.stringify(copy));
  navigate(`/studio?clone=${encodeURIComponent(slug)}`);
}

async function saveToLibrary() {
  if (!session) return;
  busy = true;
  message = "saving private clone…";
  paint();
  try {
    let res = await fetch(
      `/api/soundtracks/${encodeURIComponent(slug)}/clone`,
      { method: "POST" },
    ).then((r) => r.json());
    if (!res.ok && /wallet/i.test(res.error || "")) {
      wallet = await connectAndVerify();
      res = await fetch(`/api/soundtracks/${encodeURIComponent(slug)}/clone`, {
        method: "POST",
      }).then((r) => r.json());
    }
    if (!res.ok) throw new Error(res.error || "save failed");
    message = "saved private clone. Open it from your library.";
  } catch (e: any) {
    message = e.message || "save failed";
  }
  busy = false;
  paint();
}
function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function paint() {
  render(<App />, document.getElementById("soundtrack-player-root")!);
}
function draw() {
  if (!engine.running) return;
  const c = document.getElementById(
    "soundtrack-scope",
  ) as HTMLCanvasElement | null;
  if (c) engine.drawScope(c);
  requestAnimationFrame(draw);
}

export default async function mount() {
  const root = document.getElementById("soundtrack-player-root")!;
  slug = root.dataset.slug || "";
  wallet = await getWalletState().catch(() => wallet);
  const params = new URLSearchParams(location.search);
  const initialRoom = (params.get("room") || "").toUpperCase();
  paint();
  if (Number(root.dataset.minTokens || "0") <= 0) await unlock();
  if (initialRoom) await loadRoom(initialRoom);
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
