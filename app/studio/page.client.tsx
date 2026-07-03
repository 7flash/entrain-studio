import { render } from "tradjs/client";
import type {
  EntrainLayerV1,
  EntrainSessionV1,
  LayerType,
} from "@/format/entrain-format";
import { defaultSession, sanitizeSession } from "@/format/entrain-format";
import { analyzeSession } from "@/format/protocol-analyzer";
import {
  sessionToPatternText,
  patternTextToSession,
  sessionToSbagenText,
  sbagenTextToSession,
  looksLikeSbagen,
} from "@/format/pattern-text";
import { createAudioEngine } from "@/client/audio-engine";
import { decodeSessionHash, encodeSessionHash } from "@/client/session-codec";
import { connectAndVerify } from "@/client/wallet";

let session: EntrainSessionV1 = defaultSession();
let engine = createAudioEngine(() => session);
let status = "idle";
let notice = "";
let exportBusy = false;

const layerTypes: LayerType[] = [
  "binaural",
  "monaural",
  "iso-smooth",
  "iso-hard",
  "carrier",
  "noise",
  "sample",
  "procedural-ambience",
];
const isNoBeat = (l: EntrainLayerV1) =>
  l.type === "noise" ||
  l.type === "carrier" ||
  l.type === "sample" ||
  l.type === "procedural-ambience";
const isNoCarrier = (l: EntrainLayerV1) =>
  l.type === "noise" || l.type === "sample" || l.type === "procedural-ambience";
const uid = () =>
  crypto.randomUUID?.() || Math.random().toString(36).slice(2, 9);

const bandTiles = [
  { id: "delta", name: "Delta", range: "0.5–4 Hz", hz: 2.5 },
  { id: "theta", name: "Theta", range: "4–8 Hz", hz: 6 },
  { id: "alpha", name: "Alpha", range: "8–12 Hz", hz: 10 },
  { id: "beta", name: "Beta", range: "13–30 Hz", hz: 18 },
  { id: "gamma", name: "Gamma", range: "30–45 Hz", hz: 40 },
];

function App() {
  const analysis = analyzeSession(session);
  const primary = primaryBeatLayer();
  const beat = primary?.keyframes?.[0]?.beatHz || 0;
  const band = beat ? bandName(beat) : "ambient";
  const current = engine.running ? engine.positionSec() : 0;
  return (
    <div className="studio-shell">
      <div className="studio-stage">
        <canvas id="scope-canvas" />
        <span className="readout l mono" id="studio-timer">
          {fmtClock(current)} / {fmtClock(session.durationMin * 60)}
        </span>
        <span className="readout r mono">
          <span className="bandtag">{band}</span> ·{" "}
          {primary ? describeLayer(primary) : "ambience only"}
        </span>
        <div className="studio-focus" id="studio-focus">
          <span />
        </div>
        <span className="readout b mono">
          {session.layers.length} layers ·{" "}
          {analysis.headphonesRequired ? "headphones" : "speakers ok"} ·{" "}
          {session.loop?.mode || "hold-last"}
        </span>
        <span className="readout br mono" id="studio-state">
          {status}
        </span>
      </div>

      <div className="bands studio-bands" aria-label="Brainwave bands">
        {bandTiles.map((b) => (
          <button
            className={"band " + (band === b.id ? "on" : "")}
            data-band={b.id}
            onClick={() => addBandLayer(b.hz)}
            key={b.id}
          >
            <div className="nm">{b.name}</div>
            <div className="rg">{b.range}</div>
          </button>
        ))}
      </div>

      <div className="studio-command-panel">
        <div>
          <div className="eyebrow">Live console</div>
          <h2>{session.name}</h2>
          <div className="small">
            {session.durationMin} min · {session.layers.length} layers ·
            estimated peak {analysis.estimatedPeakDb.toFixed(1)} dBFS
          </div>
          {notice ? <div className="notice-inline mono">{notice}</div> : null}
        </div>
        <div className="btnrow studio-actions">
          <button className="act primary" onClick={toggle}>
            {engine.running ? "■ Stop" : "▶ Start"}
          </button>
          <button className="act" onClick={addLayer}>
            + Tone
          </button>
          <button className="act" onClick={addNoise}>
            + Noise
          </button>
          <button className="act" onClick={addAmbience}>
            + Ambience
          </button>
          <button className="act" onClick={addProceduralAmbience}>
            + Procedural
          </button>
          <button className="act" disabled={exportBusy} onClick={exportWav}>
            {exportBusy ? "Rendering…" : "↓ Render WAV"}
          </button>
        </div>
      </div>

      <div className="studio-workbench">
        <aside className="studio-side">
          <div className="eyebrow">Session</div>
          <div className="field">
            <label>Session name</label>
            <input
              value={session.name}
              onInput={(e: any) => {
                session.name = e.currentTarget.value;
                repaint();
              }}
            />
          </div>
          <div className="field">
            <label>Description / notes</label>
            <textarea
              rows="4"
              value={session.notes || ""}
              onInput={(e: any) => {
                session.notes = e.currentTarget.value;
                repaint();
              }}
            />
          </div>
          <div className="two compact-two">
            <div className="field">
              <label>Duration minutes</label>
              <input
                type="number"
                min="1"
                max="180"
                value={String(session.durationMin)}
                onInput={(e: any) => {
                  session.durationMin = Number(e.currentTarget.value || 1);
                  normalizeTimelines();
                  repaint(true);
                }}
              />
            </div>
            <div className="field">
              <label>Export fade seconds</label>
              <input
                type="number"
                min="0"
                max="30"
                step="1"
                value={String(session.export?.fadeSec ?? 4)}
                onInput={(e: any) => {
                  session.export = {
                    ...(session.export || {}),
                    fadeSec: Number(e.currentTarget.value || 0),
                  };
                  repaint();
                }}
              />
            </div>
          </div>
          <div className="field">
            <label>Sample rate</label>
            <select
              value={String(session.export?.sampleRate || 44100)}
              onChange={(e: any) => {
                session.export = {
                  ...(session.export || {}),
                  sampleRate: Number(e.currentTarget.value),
                };
                repaint();
              }}
            >
              <option value="32000">32 kHz</option>
              <option value="44100">44.1 kHz</option>
              <option value="48000">48 kHz</option>
            </select>
          </div>
          <div className="field">
            <label>Play/export beyond pattern</label>
            <select
              value={session.loop?.mode || "hold-last"}
              onChange={(e: any) => {
                session.loop = {
                  ...(session.loop || {}),
                  mode: e.currentTarget.value,
                };
                repaint(true);
              }}
            >
              <option value="hold-last">hold final values</option>
              <option value="repeat">repeat pattern</option>
              <option value="crossfade-repeat">crossfade repeat</option>
            </select>
          </div>
          <AnalysisCard analysis={analysis} />
          <div className="studio-file-actions">
            <button className="act" onClick={copyShareUrl}>
              Copy share URL
            </button>
            <button className="act" onClick={saveServer}>
              Save private
            </button>
            <button className="act" onClick={sendAdminDraft}>
              Admin draft
            </button>
            <button className="act" onClick={exportJson}>
              Export JSON
            </button>
            <button className="act" onClick={copyPatternText}>
              Copy pattern
            </button>
            <button className="act" onClick={copySbagenText}>
              Copy SBaGen
            </button>
            <label className="act file-act">
              Import JSON
              <input
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={importJson}
              />
            </label>
            <label className="act file-act">
              Import pattern/SBaGen
              <input
                type="file"
                accept=".txt,.sbagen,text/plain"
                style={{ display: "none" }}
                onChange={importPatternText}
              />
            </label>
          </div>
          <p className="small">
            Ambience files stay local. Saved/share formats preserve the filename
            and loop settings, not the audio buffer.
          </p>
        </aside>

        <section className="studio-layers">
          <div className="layers-title">
            <div>
              <div className="eyebrow">Layers</div>
              <h2>Signal stack</h2>
            </div>
            <div className="small">
              mute / solo / duplicate / edit each layer
            </div>
          </div>
          {session.layers.map((l, index) => (
            <LayerCard l={l} index={index} key={l.id} />
          ))}
        </section>
      </div>
    </div>
  );
}

function LayerCard({
  l,
  index,
}: {
  l: EntrainLayerV1;
  index: number;
  key?: string;
}) {
  const missingSample = l.type === "sample" && !engine.hasSample(l.id);
  const firstBeat = l.keyframes[0]?.beatHz || 0;
  const color = layerColor(firstBeat, l.type);
  return (
    <div className={"studio-layer layer-" + l.type}>
      <div className="studio-layer-head">
        <div
          className="layer-mark"
          style={{ background: color, boxShadow: `0 0 18px ${color}` }}
        />
        <div>
          <div className="layer-title">
            {String(index + 1).padStart(2, "0")} · {layerTypeLabel(l.type)}
          </div>
          <div className="layer-sub mono">
            {describeLayer(l)}
            {missingSample ? " · file not loaded" : ""}
          </div>
        </div>
        <div className="layer-tools">
          <button
            className={"act tiny " + (l.mute ? "warn" : "")}
            onClick={() => {
              l.mute = !l.mute;
              repaint(true);
            }}
          >
            {l.mute ? "Muted" : "Mute"}
          </button>
          <button
            className={"act tiny " + (l.solo ? "primary" : "")}
            onClick={() => {
              l.solo = !l.solo;
              repaint(true);
            }}
          >
            Solo
          </button>
          <button className="act tiny" onClick={() => duplicateLayer(l.id)}>
            Dup
          </button>
          <button className="act tiny warn" onClick={() => removeLayer(l.id)}>
            ✕
          </button>
        </div>
      </div>
      <div className="layer-controls-grid">
        <div className="field">
          <label>Method</label>
          <select
            value={l.type}
            onChange={(e: any) => {
              changeType(l, e.currentTarget.value as LayerType);
              repaint(true);
            }}
          >
            {layerTypes.map((x) => (
              <option value={x} key={x}>
                {layerTypeLabel(x)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>
            Gain <b>{l.keyframes[0]?.gainPct || 0}%</b>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={String(l.keyframes[0]?.gainPct || 0)}
            onInput={(e: any) => {
              l.keyframes.forEach(
                (k) => (k.gainPct = Number(e.currentTarget.value)),
              );
              repaint(true);
            }}
          />
        </div>
        {!isNoCarrier(l) ? (
          <div className="field">
            <label>
              Carrier <b>{l.carrierHz || 220} Hz</b>
            </label>
            <input
              type="range"
              min="40"
              max="1200"
              step="5"
              value={String(l.carrierHz || 220)}
              onInput={(e: any) => {
                l.carrierHz = Number(e.currentTarget.value);
                repaint(true);
              }}
            />
          </div>
        ) : null}
        {!isNoBeat(l) ? (
          <div className="field">
            <label>
              Beat start <b>{l.keyframes[0]?.beatHz || 10} Hz</b>
            </label>
            <input
              type="range"
              step="0.1"
              min="0.5"
              max="45"
              value={String(l.keyframes[0]?.beatHz || 10)}
              onInput={(e: any) => {
                l.keyframes.forEach(
                  (k) => (k.beatHz = Number(e.currentTarget.value)),
                );
                repaint(true);
              }}
            />
          </div>
        ) : null}
        {!isNoBeat(l) ? (
          <div className="field">
            <label>
              Beat end{" "}
              <b>{l.keyframes[l.keyframes.length - 1]?.beatHz || 10} Hz</b>
            </label>
            <input
              type="range"
              step="0.1"
              min="0.5"
              max="45"
              value={String(l.keyframes[l.keyframes.length - 1]?.beatHz || 10)}
              onInput={(e: any) => {
                ensureTwoKeyframes(l);
                l.keyframes[l.keyframes.length - 1].beatHz = Number(
                  e.currentTarget.value,
                );
                repaint(true);
              }}
            />
          </div>
        ) : null}
        {l.type === "noise" ? (
          <div className="field">
            <label>Noise color</label>
            <select
              value={l.noiseColor || "pink"}
              onChange={(e: any) => {
                l.noiseColor = e.currentTarget.value;
                repaint(true);
              }}
            >
              <option value="white">white</option>
              <option value="pink">pink</option>
              <option value="brown">brown</option>
            </select>
          </div>
        ) : null}
        {l.type === "procedural-ambience" ? <ProceduralControls l={l} /> : null}
        {l.type !== "binaural" ? (
          <div className="field">
            <label>
              Pan <b>{fmtPan(l.pan || 0)}</b>
            </label>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={String(l.pan || 0)}
              onInput={(e: any) => {
                l.pan = Number(e.currentTarget.value);
                repaint(true);
              }}
            />
          </div>
        ) : null}
        {l.type !== "binaural" ? (
          <div className="field">
            <label>
              Pan motion{" "}
              <b>
                {l.panMotion?.rateHz
                  ? l.panMotion.rateHz.toFixed(3) + " Hz"
                  : "off"}
              </b>
            </label>
            <input
              type="range"
              min="0"
              max="0.25"
              step="0.005"
              value={String(l.panMotion?.rateHz || 0)}
              onInput={(e: any) => {
                const rateHz = Number(e.currentTarget.value);
                l.panMotion =
                  rateHz > 0
                    ? { rateHz, depth: l.panMotion?.depth ?? 0.35 }
                    : undefined;
                repaint(true);
              }}
            />
          </div>
        ) : null}
        {l.type !== "binaural" && (l.panMotion?.rateHz || 0) > 0 ? (
          <div className="field">
            <label>
              Motion depth{" "}
              <b>{Math.round((l.panMotion?.depth || 0.35) * 100)}%</b>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={String(l.panMotion?.depth || 0.35)}
              onInput={(e: any) => {
                l.panMotion = {
                  rateHz: l.panMotion?.rateHz || 0.03,
                  depth: Number(e.currentTarget.value),
                };
                repaint(true);
              }}
            />
          </div>
        ) : null}
        {l.type === "sample" ? <SampleControls l={l} /> : null}
      </div>
      <div className="timeline-wrap">
        <label className="small">Timeline points</label>
        <TimelineEditor l={l} />
      </div>
    </div>
  );
}

function AnalysisCard({
  analysis,
}: {
  analysis: ReturnType<typeof analyzeSession>;
}) {
  return (
    <div className="note analyzer-note">
      <b>Protocol analyzer</b>
      <div className="small">
        {analysis.headphonesRequired
          ? "headphones required"
          : "speaker-safe modes only"}{" "}
        · {analysis.mixStatus} · estimated peak{" "}
        {analysis.estimatedPeakDb.toFixed(1)} dBFS · loop{" "}
        {session.loop?.mode || "hold-last"}
      </div>
      {analysis.issues.length ? (
        <ul className="small">
          {analysis.issues.slice(0, 5).map((i) => (
            <li key={i.code + i.message}>
              <b>{i.level}</b>: {i.message}
            </li>
          ))}
        </ul>
      ) : (
        <div className="small">No blocking issues found.</div>
      )}
    </div>
  );
}

function ProceduralControls({ l }: { l: EntrainLayerV1 }) {
  return (
    <>
      <div className="field">
        <label>Ambience recipe</label>
        <select
          value={l.ambienceRecipe || "pink-rain"}
          onChange={(e: any) => {
            l.ambienceRecipe = e.currentTarget.value;
            repaint(true);
          }}
        >
          <option value="rain">rain</option>
          <option value="pink-rain">pink rain</option>
          <option value="brown-room">brown room</option>
          <option value="bowl-drone">bowl drone</option>
        </select>
      </div>
      <div className="field">
        <label>Seed</label>
        <input
          type="number"
          min="1"
          value={String(l.seed || 1337)}
          onInput={(e: any) => {
            l.seed = Number(e.currentTarget.value || 1);
            repaint(true);
          }}
        />
      </div>
    </>
  );
}

function SampleControls({ l }: { l: EntrainLayerV1 }) {
  const loop =
    l.sampleLoop ||
    ({ mode: "native", startSec: 0, endSec: 0, crossfadeSec: 3 } as any);
  return (
    <>
      <div className="field">
        <label>Ambience file</label>
        <input
          type="file"
          accept="audio/*"
          onChange={(e: any) => loadSample(l.id, e.currentTarget.files?.[0])}
        />
      </div>
      <div className="field">
        <label>Loop mode</label>
        <select
          value={loop.mode || "native"}
          onChange={(e: any) => {
            l.sampleLoop = { ...loop, mode: e.currentTarget.value };
            repaint(true);
          }}
        >
          <option value="native">native</option>
          <option value="crossfade">crossfade</option>
        </select>
      </div>
      <div className="field">
        <label>Loop start sec</label>
        <input
          type="number"
          min="0"
          step="0.1"
          value={String(loop.startSec || 0)}
          onInput={(e: any) => {
            l.sampleLoop = {
              ...loop,
              startSec: Number(e.currentTarget.value || 0),
            };
            repaint(true);
          }}
        />
      </div>
      <div className="field">
        <label>Loop end sec</label>
        <input
          type="number"
          min="0"
          step="0.1"
          value={String(loop.endSec || 0)}
          onInput={(e: any) => {
            l.sampleLoop = {
              ...loop,
              endSec: Number(e.currentTarget.value || 0),
            };
            repaint(true);
          }}
        />
      </div>
      {loop.mode === "crossfade" ? (
        <div className="field">
          <label>Crossfade sec</label>
          <input
            type="number"
            min="0"
            max="30"
            step="0.1"
            value={String(loop.crossfadeSec || 3)}
            onInput={(e: any) => {
              l.sampleLoop = {
                ...loop,
                crossfadeSec: Number(e.currentTarget.value || 0),
              };
              repaint(true);
            }}
          />
        </div>
      ) : null}
    </>
  );
}

function TimelineEditor({ l }: { l: EntrainLayerV1 }) {
  return (
    <table className="matrix">
      <thead>
        <tr>
          <th>min</th>
          {!isNoBeat(l) ? <th>beat</th> : null}
          <th>gain</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {l.keyframes.map((k, i) => (
          <tr key={i}>
            <td>
              <input
                type="number"
                min="0"
                max="180"
                step="0.5"
                value={String(k.tMin)}
                onChange={(e: any) => {
                  k.tMin = Number(e.currentTarget.value);
                  l.keyframes.sort((a, b) => a.tMin - b.tMin);
                  repaint(true);
                }}
              />
            </td>
            {!isNoBeat(l) ? (
              <td>
                <input
                  type="number"
                  min="0.1"
                  max="45"
                  step="0.1"
                  value={String(k.beatHz || 10)}
                  onChange={(e: any) => {
                    k.beatHz = Number(e.currentTarget.value);
                    repaint(true);
                  }}
                />
              </td>
            ) : null}
            <td>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={String(k.gainPct)}
                onChange={(e: any) => {
                  k.gainPct = Number(e.currentTarget.value);
                  repaint(true);
                }}
              />
            </td>
            <td>
              <button
                className="btn"
                onClick={() => {
                  if (l.keyframes.length > 1) l.keyframes.splice(i, 1);
                  repaint(true);
                }}
              >
                x
              </button>
            </td>
          </tr>
        ))}
        <tr>
          <td colSpan="4">
            <button
              className="btn"
              onClick={() => {
                const last = l.keyframes[l.keyframes.length - 1];
                l.keyframes.push({
                  tMin: Math.min(session.durationMin, (last?.tMin || 0) + 5),
                  beatHz: last?.beatHz,
                  gainPct: last?.gainPct ?? 35,
                });
                repaint(true);
              }}
            >
              + point
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function primaryBeatLayer() {
  return (
    session.layers.find((l) => !l.mute && !isNoBeat(l)) ||
    session.layers.find((l) => !isNoBeat(l))
  );
}
function bandName(hz: number) {
  if (hz < 4) return "delta";
  if (hz < 8) return "theta";
  if (hz < 13) return "alpha";
  if (hz < 30) return "beta";
  return "gamma";
}
function layerColor(hz: number, type: LayerType) {
  if (type === "noise" || type === "sample" || type === "procedural-ambience")
    return "#5d6d87";
  const b = bandName(hz || 10);
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
function layerTypeLabel(t: LayerType) {
  return (
    (
      {
        binaural: "Binaural",
        monaural: "Monaural",
        "iso-smooth": "Isochronic smooth",
        "iso-hard": "Isochronic hard",
        carrier: "Plain carrier",
        noise: "Noise bed",
        sample: "Ambience file",
        "procedural-ambience": "Procedural ambience",
      } as Record<LayerType, string>
    )[t] || t
  );
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
function addBandLayer(hz: number) {
  session.layers.push({
    id: uid(),
    type: "binaural",
    carrierHz: hz >= 30 ? 300 : 220,
    wave: "sine",
    keyframes: [
      { tMin: 0, beatHz: hz, gainPct: 32 },
      { tMin: session.durationMin, beatHz: hz, gainPct: 32 },
    ],
  });
  repaint(true);
}
function syncLiveReadouts() {
  const elapsed = engine.positionSec();
  const t = document.getElementById("studio-timer");
  if (t)
    t.textContent = `${fmtClock(elapsed)} / ${fmtClock(session.durationMin * 60)}`;
  const state = document.getElementById("studio-state");
  if (state) state.textContent = status;
  const focus = document.getElementById("studio-focus") as HTMLElement | null;
  const primary = primaryBeatLayer();
  if (focus && primary) {
    const beat = Math.max(0.5, primary.keyframes[0]?.beatHz || 10);
    const ph = (elapsed * beat) % 1;
    focus.style.transform =
      ph < 0.5
        ? "translate(-50%,-50%) scale(1.28)"
        : "translate(-50%,-50%) scale(1)";
    focus.style.boxShadow =
      ph < 0.5
        ? "0 0 38px 6px rgba(84,220,207,.58)"
        : "0 0 0 rgba(84,220,207,0)";
  }
}

function describeLayer(l: EntrainLayerV1) {
  if (l.type === "sample")
    return `${l.sampleName || "load a file"} · ${l.sampleLoop?.mode || "native"} loop`;
  if (l.type === "procedural-ambience")
    return `${l.ambienceRecipe || "pink-rain"} · seed ${l.seed || 1337}`;
  if (l.type === "noise") return `${l.noiseColor || "pink"} noise`;
  if (l.type === "carrier") return `${l.carrierHz || 220} Hz carrier`;
  const first = l.keyframes[0]?.beatHz || 10;
  const last = l.keyframes[l.keyframes.length - 1]?.beatHz || first;
  return `${first}${first !== last ? `→${last}` : ""} Hz · carrier ${l.carrierHz || 220} Hz`;
}
function fmtPan(p: number) {
  return p === 0
    ? "C"
    : p < 0
      ? `${Math.round(Math.abs(p) * 100)}L`
      : `${Math.round(p * 100)}R`;
}
function normalizeTimelines() {
  session.layers.forEach((l) => {
    l.keyframes.forEach((k) => {
      if (k.tMin > session.durationMin) k.tMin = session.durationMin;
    });
  });
}
function ensureTwoKeyframes(l: EntrainLayerV1) {
  if (l.keyframes.length < 2)
    l.keyframes.push({ ...l.keyframes[0], tMin: session.durationMin });
}
function changeType(l: EntrainLayerV1, type: LayerType) {
  l.type = type;
  if (isNoCarrier(l)) l.carrierHz = undefined;
  else l.carrierHz = l.carrierHz || 220;
  if (type === "binaural") {
    l.pan = undefined;
    l.panMotion = undefined;
  }
  if (type === "noise") l.noiseColor = l.noiseColor || "pink";
  if (type === "procedural-ambience") {
    l.ambienceRecipe = l.ambienceRecipe || "pink-rain";
    l.seed = l.seed || 1337;
    l.pan = l.pan || 0;
  }
  if (type === "sample") {
    l.sampleName = l.sampleName || "";
    l.sampleLoop = l.sampleLoop || {
      mode: "native",
      startSec: 0,
      endSec: 0,
      crossfadeSec: 3,
    };
  }
}

function addLayer() {
  session.layers.push({
    id: uid(),
    type: "binaural",
    carrierHz: 220,
    wave: "sine",
    keyframes: [
      { tMin: 0, beatHz: 10, gainPct: 35 },
      { tMin: session.durationMin, beatHz: 10, gainPct: 35 },
    ],
  });
  repaint(true);
}
function addNoise() {
  session.layers.push({
    id: uid(),
    type: "noise",
    noiseColor: "pink",
    pan: 0,
    panMotion: { rateHz: 0.02, depth: 0.16 },
    keyframes: [
      { tMin: 0, gainPct: 16 },
      { tMin: session.durationMin, gainPct: 16 },
    ],
  });
  repaint(true);
}
function addAmbience() {
  session.layers.push({
    id: uid(),
    type: "sample",
    sampleName: "load a file",
    pan: 0,
    panMotion: { rateHz: 0.03, depth: 0.35 },
    sampleLoop: { mode: "crossfade", startSec: 0, endSec: 0, crossfadeSec: 3 },
    keyframes: [
      { tMin: 0, gainPct: 22 },
      { tMin: session.durationMin, gainPct: 22 },
    ],
  });
  repaint(true);
}
function addProceduralAmbience() {
  session.layers.push({
    id: uid(),
    type: "procedural-ambience",
    ambienceRecipe: "pink-rain",
    seed: Math.floor(Math.random() * 999999) + 1,
    pan: 0,
    panMotion: { rateHz: 0.025, depth: 0.25 },
    keyframes: [
      { tMin: 0, gainPct: 18 },
      { tMin: session.durationMin, gainPct: 18 },
    ],
  });
  repaint(true);
}
function duplicateLayer(id: string) {
  const l = session.layers.find((x) => x.id === id);
  if (!l) return;
  session.layers.push({
    ...JSON.parse(JSON.stringify(l)),
    id: uid(),
    sampleName:
      l.type === "sample"
        ? `${l.sampleName || "sample"} (reload file)`
        : l.sampleName,
  });
  repaint(true);
}
function removeLayer(id: string) {
  session.layers = session.layers.filter((l) => l.id !== id);
  repaint(true);
}
async function loadSample(id: string, file?: File) {
  if (!file) return;
  await engine.loadSample(id, file);
  const l = session.layers.find((x) => x.id === id);
  if (l) l.sampleName = file.name;
  notice = `loaded ${file.name}`;
  repaint(true);
}
async function toggle() {
  if (engine.running) {
    engine.stop();
    status = "idle";
  } else {
    await engine.start();
    status = "running";
    draw();
  }
  repaint();
}
function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function exportJson() {
  session = sanitizeSession(session);
  downloadBlob(
    new Blob([JSON.stringify(session, null, 2)], { type: "application/json" }),
    session.name.replace(/\W+/g, "_") + ".entrain.json",
  );
}
async function copyPatternText() {
  await navigator.clipboard
    .writeText(sessionToPatternText(session))
    .catch(() => {});
  notice = "compact pattern text copied";
  repaint();
}
async function copySbagenText() {
  await navigator.clipboard
    .writeText(sessionToSbagenText(session))
    .catch(() => {});
  notice = "SBaGen-compatible script copied";
  repaint();
}
async function exportWav() {
  exportBusy = true;
  notice = "rendering WAV locally…";
  repaint();
  try {
    const r = await engine.renderWav(
      undefined,
      session.export?.sampleRate,
      session.export?.fadeSec,
    );
    downloadBlob(r.blob, r.filename);
    notice = `saved ${r.filename} · ${(r.blob.size / 1048576).toFixed(1)} MB`;
  } catch (e: any) {
    notice = e.message || "render failed";
  }
  exportBusy = false;
  repaint();
}
async function importJson(e: any) {
  const f = e.currentTarget.files?.[0];
  if (!f) return;
  session = sanitizeSession(JSON.parse(await f.text()));
  engine.stop();
  engine = createAudioEngine(() => session);
  notice = "imported session";
  repaint();
}
async function importPatternText(e: any) {
  const f = e.currentTarget.files?.[0];
  if (!f) return;
  const text = await f.text();
  if (looksLikeSbagen(text)) {
    const r = sbagenTextToSession(text);
    session = r.session;
    notice = `imported SBaGen script${r.warnings.length ? ` · ${r.warnings.length} note(s)` : ""}`;
  } else {
    session = patternTextToSession(text);
    notice = "imported compact pattern text";
  }
  engine.stop();
  engine = createAudioEngine(() => session);
  repaint();
}
async function copyShareUrl() {
  const h = await encodeSessionHash(session);
  const url = location.origin + location.pathname + h;
  await navigator.clipboard.writeText(url).catch(() => {});
  history.replaceState(null, "", h);
  notice =
    "share URL copied; ambience files still need to be reloaded by the recipient";
  repaint();
}
function sendAdminDraft() {
  sessionStorage.setItem(
    "entrain:admin-draft",
    JSON.stringify(sanitizeSession(session)),
  );
  notice = "copied current track to admin draft";
  repaint();
}
async function saveServer() {
  try {
    let res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: session.name,
        slug: "custom",
        session: sanitizeSession(session),
      }),
    }).then((r) => r.json());
    if (!res.ok && /wallet/i.test(res.error || "")) {
      notice = "connect Phantom to save to your private library…";
      repaint();
      await connectAndVerify();
      res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: session.name,
          slug: "custom",
          session: sanitizeSession(session),
        }),
      }).then((r) => r.json());
    }
    notice = res.ok
      ? "saved to private wallet library"
      : res.error || "save failed";
  } catch (e: any) {
    notice = e.message || "save failed";
  }
  repaint();
}
function repaint(rebuild = false) {
  if (rebuild && engine.running) engine.rebuild();
  render(<App />, document.getElementById("studio-root")!);
}
function draw() {
  if (!engine.running) return;
  const canvas = document.getElementById(
    "scope-canvas",
  ) as HTMLCanvasElement | null;
  if (canvas) engine.drawScope(canvas);
  syncLiveReadouts();
  requestAnimationFrame(draw);
}

export default async function mount() {
  const shared = await decodeSessionHash().catch(() => null);
  const raw = sessionStorage.getItem("entrain:loaded-session");
  if (shared) {
    session = shared;
    notice = "loaded shared URL";
  } else if (raw) {
    session = sanitizeSession(JSON.parse(raw));
  }
  render(<App />, document.getElementById("studio-root")!);
  return () => {
    engine.stop();
    render(null, document.getElementById("studio-root")!);
  };
}
