import { render } from "tradjs/client";
import type {
  EntrainLayerV1,
  EntrainSessionV1,
  LayerType,
} from "@/format/entrain-format";
import {
  bandForHz,
  defaultSession,
  hasBeat,
  hasCarrier,
  sanitizeSession,
  sessionNeedsLocalFiles,
} from "@/format/entrain-format";
import { createAudioEngine } from "@/client/audio-engine";
import { drawBeatScope, type BeatScopeParams } from "@/client/beat-scope";
import {
  decodeSessionFromString,
  decodeSessionHash,
  encodeSourceUrl,
} from "@/client/session-codec";

let session: EntrainSessionV1 = { ...defaultSession(), layers: [] };
let engine = createAudioEngine(() => session);
let status = "loading";
let message = "";
let startedAt = 0;
let pausedAt = 0;
let lastProgressPost = 0;
let volume = 1;

const nowSec = () => performance.now() / 1000;
const elapsedSec = () =>
  engine.running ? Math.max(0, nowSec() - startedAt) : pausedAt;
const stageLayer = () =>
  session.layers.find((l) => hasBeat(l.type) || hasCarrier(l.type)) ||
  session.layers[0] ||
  null;
const noBeat = (l: EntrainLayerV1) => !hasBeat(l.type);
const noCarrier = (l: EntrainLayerV1) => !hasCarrier(l.type);

function App() {
  if (status === "error") {
    return (
      <div className="widget-card">
        <div className="widget-error">
          <h2>Widget unavailable</h2>
          <p className="muted">
            {message || "No ENTRAIN session was found in this URL."}
          </p>
          <a
            className="widget-open"
            href="/studio"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Studio
          </a>
        </div>
      </div>
    );
  }
  const layer = stageLayer();
  const headphones = session.layers.some(
    (l) => l.type === "binaural" && !l.mute,
  );
  return (
    <div className="widget-card">
      <div className="widget-stage">
        <canvas id="widget-canvas" />
        <span className="widget-readout l mono" id="widget-time">
          {fmtClock(0)} / {fmtClock(session.durationMin * 60)}
        </span>
        <span className="widget-readout r mono">
          {layer ? liveLabel(layer, 0) : "no layers"}
        </span>
        <span className="widget-readout b mono">
          {session.layers.length} layers ·{" "}
          {headphones ? "headphones" : "speakers ok"}
        </span>
        <span className="widget-readout br mono" id="widget-state">
          {engine.running ? "playing" : "ready"}
        </span>
      </div>
      <div className="widget-body">
        <div className="widget-head">
          <div>
            <h1>{session.name || "ENTRAIN session"}</h1>
            <div className="widget-meta small mono">
              <span>{session.durationMin} min</span>
              <span>·</span>
              <span>{session.loop?.mode || "hold-last"}</span>
              {sessionNeedsLocalFiles(session) ? (
                <>
                  <span>·</span>
                  <span className="warn">local files needed</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="widget-controls">
            <button className="widget-btn primary" onClick={toggle}>
              {engine.running ? "Pause" : "Play"}
            </button>
            <button className="widget-btn" onClick={restart}>
              Restart
            </button>
            <button className="widget-btn" onClick={openStudio}>
              Open Studio
            </button>
          </div>
        </div>
        {message ? <p className="small">{message}</p> : null}
      </div>
    </div>
  );
}

async function play(offsetSec = 0) {
  if (engine.running) engine.stop();
  await engine.start({
    loopPattern: (session.loop?.mode || "hold-last") !== "hold-last",
    offsetSec,
  });
  if (volume !== 1) engine.setVolume?.(volume);
  pausedAt = Math.max(0, offsetSec);
  startedAt = nowSec() - pausedAt;
  status = "playing";
  post("entrain.widget.play");
  paint();
  draw();
}
function pause() {
  if (!engine.running) return;
  pausedAt = elapsedSec();
  engine.stop();
  status = "ready";
  post("entrain.widget.pause", { positionSec: pausedAt });
  paint();
}
async function restart() {
  pausedAt = 0;
  engine.stop();
  await play(0);
}
async function toggle() {
  if (engine.running) pause();
  else await play(elapsedSec());
}

async function openStudio() {
  const info = await encodeSourceUrl(session, `${location.origin}/studio`);
  location.href = info.url;
}

function stageParams(elapsed: number): BeatScopeParams | null {
  const l = stageLayer();
  if (!l || (noBeat(l) && noCarrier(l))) return null;
  const tMin = elapsed / 60;
  return {
    type: l.type,
    beatStartHz: noBeat(l) ? 0 : sampleTimeline(l, "beatHz", 0),
    beatEndHz: noBeat(l) ? 0 : sampleTimeline(l, "beatHz", session.durationMin),
    durationSec: session.durationMin * 60,
    carrierHz: noCarrier(l) ? 0 : sampleTimeline(l, "carrierHz", tMin),
    gainPct: sampleTimeline(l, "gainPct", tMin),
    duty: l.isoPulse?.duty,
    edgeMs: l.isoPulse?.edgeMs,
    elapsedSec: elapsed,
    running: engine.running,
    color: layerColor(sampleTimeline(l, "beatHz", tMin), l.type),
  };
}
function draw() {
  paintCanvas(elapsedSec());
  updateReadouts();
  if (!engine.running) return;
  const t = nowSec();
  if (t - lastProgressPost > 0.5) {
    lastProgressPost = t;
    post("entrain.widget.progress", {
      positionSec: elapsedSec(),
      durationSec: session.durationMin * 60,
    });
  }
  requestAnimationFrame(draw);
}
function paintCanvas(elapsed: number) {
  const canvas = document.getElementById(
    "widget-canvas",
  ) as HTMLCanvasElement | null;
  if (!canvas) return;
  const p = stageParams(elapsed);
  if (p) drawBeatScope(canvas, p);
  else if (session.layers.length && engine.running) engine.drawScope(canvas);
}
function updateReadouts() {
  const elapsed = elapsedSec();
  const t = document.getElementById("widget-time");
  if (t)
    t.textContent = `${fmtClock(elapsed)} / ${fmtClock(session.durationMin * 60)}`;
  const state = document.getElementById("widget-state");
  if (state) state.textContent = engine.running ? "playing" : "ready";
  if (
    elapsed >= session.durationMin * 60 &&
    (session.loop?.mode || "hold-last") === "hold-last" &&
    engine.running
  ) {
    pausedAt = session.durationMin * 60;
    engine.stop();
    status = "ready";
    post("entrain.widget.ended");
    paint();
  }
}
function paint() {
  render(<App />, document.getElementById("widget-root")!);
  requestAnimationFrame(() => paintCanvas(elapsedSec()));
}

async function loadFromInput(input?: string) {
  const next = input
    ? await decodeSessionFromString(input)
    : await decodeSessionHash();
  if (!next) throw new Error("No ENTRAIN session was found in the widget URL.");
  session = sanitizeSession(next);
  engine.stop();
  engine = createAudioEngine(() => session);
  engine.setVolume?.(volume);
  pausedAt = 0;
  status = "ready";
  message = sessionNeedsLocalFiles(session)
    ? "This widget references local audio files that cannot travel in a URL. Replace them with procedural ambience for exact embeds."
    : "";
}

function onMessage(event: MessageEvent) {
  const data = event.data || {};
  const action = data.action || data.type;
  if (!action) return;
  if (action === "play" || action === "entrain.widget.play")
    void play(Number(data.offsetSec || 0));
  else if (action === "pause" || action === "entrain.widget.pause") pause();
  else if (action === "restart" || action === "entrain.widget.restart")
    void restart();
  else if (action === "setVolume" || action === "entrain.widget.setVolume") {
    volume = Math.max(0, Math.min(1, Number(data.volume ?? data.value ?? 1)));
    engine.setVolume?.(volume);
  } else if (
    action === "setSession" ||
    action === "entrain.widget.setSession"
  ) {
    const src =
      data.source ||
      data.url ||
      (data.session ? JSON.stringify(data.session) : "");
    void loadFromInput(src)
      .then(() => {
        post("entrain.widget.ready");
        paint();
      })
      .catch((e) => {
        status = "error";
        message = e?.message || "Could not load session.";
        paint();
      });
  }
}
function post(type: string, extra: Record<string, any> = {}) {
  parent?.postMessage?.(
    {
      type,
      name: session.name,
      durationSec: session.durationMin * 60,
      layerCount: session.layers.length,
      ...extra,
    },
    "*",
  );
}

function liveLabel(l: EntrainLayerV1, tMin: number) {
  if (noBeat(l) && noCarrier(l))
    return `${l.type} · gain ${Math.round(sampleTimeline(l, "gainPct", tMin))}%`;
  if (noBeat(l))
    return `carrier ${Math.round(sampleTimeline(l, "carrierHz", tMin))} Hz`;
  const b = sampleTimeline(l, "beatHz", tMin);
  const c = sampleTimeline(l, "carrierHz", tMin);
  return `${bandForHz(b)} · beat ${b.toFixed(2)} Hz · carrier ${Math.round(c)} Hz`;
}
function sampleTimeline(
  l: EntrainLayerV1,
  key: "beatHz" | "gainPct" | "carrierHz",
  t: number,
) {
  const pts = [...(l.keyframes || [])].sort((a, b) => a.tMin - b.tMin);
  const fallback =
    key === "gainPct" ? 35 : key === "carrierHz" ? l.carrierHz || 220 : 10;
  const val = (p: any) => Number(p[key] ?? fallback);
  if (!pts.length) return fallback;
  if (t <= pts[0].tMin) return val(pts[0]);
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].tMin) {
      const a = pts[i - 1],
        b = pts[i];
      const f = (t - a.tMin) / Math.max(1e-9, b.tMin - a.tMin);
      return val(a) + (val(b) - val(a)) * f;
    }
  }
  return val(pts[pts.length - 1]);
}
function layerColor(hz: number, type: LayerType) {
  if (type === "noise" || type === "sample" || type === "procedural-ambience")
    return "#5d6d87";
  if (type === "additive") return "#9be7d8";
  if (type === "karplus") return "#d7b16a";
  const b = bandForHz(hz || 10);
  return b === "delta"
    ? "#6b7cf0"
    : b === "theta"
      ? "#5aa9e6"
      : b === "alpha"
        ? "#54dccf"
        : b === "beta"
          ? "#e6a94a"
          : "#e2726a";
}
function fmtClock(sec: number) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600),
    m = Math.floor((sec % 3600) / 60),
    s = sec % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default async function mount() {
  addEventListener("message", onMessage);
  try {
    await loadFromInput();
    post("entrain.widget.ready");
  } catch (e: any) {
    status = "error";
    message = e?.message || "Could not load session.";
  }
  paint();
  return () => {
    removeEventListener("message", onMessage);
    engine.stop();
    render(null, document.getElementById("widget-root")!);
  };
}
