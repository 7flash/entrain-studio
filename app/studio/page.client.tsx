import { render } from "tradjs/client";
import type {
  EntrainLayerV1,
  EntrainSessionV1,
  LayerType,
} from "@/format/entrain-format";
import {
  BANDS,
  bandForHz,
  createLinearGlideKeyframes,
  hasBeat,
  hasCarrier,
  defaultSession,
  sanitizeSession,
  sessionNeedsLocalFiles,
} from "@/format/entrain-format";
import { analyzeSession } from "@/format/protocol-analyzer";
import {
  sessionToPatternText,
  patternTextToSession,
  sessionToSbagenText,
  sbagenTextToSession,
  looksLikeSbagen,
} from "@/format/pattern-text";
import { createAudioEngine } from "@/client/audio-engine";
import {
  decodeSessionHash,
  decodeSessionFromString,
  encodeSessionUrl,
  type SharePayloadInfo,
} from "@/client/session-codec";
import { connectAndVerify } from "@/client/wallet";

let session: EntrainSessionV1 = defaultSession();
let engine = createAudioEngine(() => session);
let status = "idle";
let notice = "";
let exportBusy = false;
let autosaveTimer: any = null;
let rebuildTimer: any = null;
let pendingRebuildOffset: number | null = null;
let booting = true;
let lastShare: SharePayloadInfo | null = null;
let activePointMin = 0;

const layerTypes: LayerType[] = [
  "binaural",
  "monaural",
  "iso-smooth",
  "iso-trap",
  "iso-hard",
  "carrier",
  "noise",
  "sample",
  "procedural-ambience",
  "additive",
  "karplus",
];
const isNoBeat = (l: EntrainLayerV1) => !hasBeat(l.type);
const isNoCarrier = (l: EntrainLayerV1) => !hasCarrier(l.type);
const uid = () =>
  crypto.randomUUID?.() || Math.random().toString(36).slice(2, 9);

const bandTiles = BANDS.map((b) => ({
  id: b.id,
  name: b.label,
  range: `${b.minHz}–${b.maxHz} Hz`,
  hz:
    b.id === "delta"
      ? 2.5
      : b.id === "theta"
        ? 6
        : b.id === "alpha"
          ? 10
          : b.id === "beta"
            ? 18
            : 40,
}));

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
          <button className="act" onClick={addAdditive}>
            + Additive
          </button>
          <button className="act" onClick={addKarplus}>
            + Pluck
          </button>
          <button className="act" disabled={exportBusy} onClick={exportWav}>
            {exportBusy ? "Rendering…" : "↓ Render WAV"}
          </button>
          <span className="shortcut-help mono">
            Space start · T tone · P point · S share · E export
          </span>
        </div>
      </div>

      <QuickWorkflow analysis={analysis} />
      <DeviceCheckStrip />

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
          <QuickBuilder />
          <OperatorGuide />
          <StudioChecklist analysis={analysis} />
          <GlobalPointTabs />
          <div className="studio-share-box">
            <div className="eyebrow">Protocol replicator</div>
            <p className="small">
              Create an auditable linear-glide binaural layer from carrier,
              start/end beat, duration, and gain.
            </p>
            <button className="act" onClick={addProtocolGlide}>
              + Linear glide layer
            </button>
          </div>
          <AnalysisCard analysis={analysis} />
          <div className="studio-share-box">
            <div className="eyebrow">No-login studio</div>
            <p className="small">
              Play, edit, render WAV, import/export, and share anonymously
              without connecting a wallet. The URL payload lives after{" "}
              <span className="mono">#</span>, so it is not sent to the server.
            </p>
            <div className="studio-file-actions local-first-actions">
              <button className="act primary" onClick={copyShareUrl}>
                Copy exact private URL
              </button>
              <button className="act" onClick={copyShareCapsule}>
                Copy capsule
              </button>
              <button className="act" onClick={importShareString}>
                Import URL/code
              </button>
              <button className="act" onClick={makePortableCopy}>
                Make portable copy
              </button>
              <button className="act" onClick={newLocalSession}>
                New local
              </button>
              <button className="act" onClick={clearAutosave}>
                Clear autosave
              </button>
              <button className="act" onClick={exportJson}>
                Export JSON
              </button>
              <button className="act" onClick={copyAlgorithmJson}>
                Copy algorithm JSON
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
            {lastShare ? (
              <div className="share-meta mono">
                <span>checksum {lastShare.digest}</span>
                <span>{lastShare.encoding}</span>
                <span>{Math.ceil(lastShare.bytes / 1024)} KB payload</span>
                <span>
                  {lastShare.urlSafe ? "URL-safe size" : "use capsule fallback"}
                </span>
              </div>
            ) : null}
            {sessionNeedsLocalFiles(session) ? (
              <p className="small warntext">
                Local ambience files cannot be embedded in a private URL. Use
                procedural ambience or click “Make portable copy” when the exact
                same soundtrack must reproduce for a friend with no extra files.
              </p>
            ) : (
              <p className="small">
                This session is portable: all stochastic layers use stored
                seeds, and the v2 share checksum verifies the copied algorithm
                before loading.
              </p>
            )}
          </div>
          <details className="studio-account-box">
            <summary>Wallet/cloud actions</summary>
            <div className="studio-file-actions">
              <button className="act" onClick={saveServer}>
                Save to private cloud library
              </button>
              <button className="act" onClick={publishCurrent}>
                Publish / sell
              </button>
              <button className="act" onClick={sendAdminDraft}>
                Admin draft
              </button>
            </div>
            <p className="small">
              These actions connect Phantom only when clicked. The editor itself
              remains local-first.
            </p>
          </details>
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
          {session.layers.length ? (
            session.layers.map((l, index) => (
              <LayerCard l={l} index={index} key={l.id} />
            ))
          ) : (
            <EmptyStudioState />
          )}
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
  const point = ensureLayerPoint(l, activePointMin);
  const firstBeat = point.beatHz || l.keyframes[0]?.beatHz || 0;
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
            point {activePointMin}m · {describeLayerAtPoint(l, point)}
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
          <button className="act tiny" onClick={() => auditionLayer(l.id)}>
            Audition
          </button>
          <button className="act tiny" onClick={() => duplicateLayer(l.id)}>
            Dup
          </button>
          <button className="act tiny warn" onClick={() => removeLayer(l.id)}>
            ✕
          </button>
        </div>
      </div>
      <div className="layer-controls-grid primary-layer-controls">
        {!isNoCarrier(l) ? (
          <div className="field">
            <label>
              Carrier frequency{" "}
              <b>{point.carrierHz || l.carrierHz || 220} Hz</b>
            </label>
            <input
              type="range"
              min="40"
              max="1200"
              step="1"
              value={String(point.carrierHz || l.carrierHz || 220)}
              onInput={(e: any) => {
                setPointCarrier(l, Number(e.currentTarget.value));
              }}
            />
          </div>
        ) : null}
        <div className="field">
          <label>Method</label>
          <select
            value={l.type}
            onChange={(e: any) => {
              changeType(l, e.currentTarget.value as LayerType);
              ensureLayerPoint(l, activePointMin);
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
            Gain at point <b>{point.gainPct || 0}%</b>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={String(point.gainPct || 0)}
            onInput={(e: any) => {
              point.gainPct = Number(e.currentTarget.value);
              repaint(true);
            }}
          />
        </div>
        {!isNoBeat(l) ? (
          <div className="field">
            <label>
              Beat Hz <b>{point.beatHz ?? 10} Hz</b>
            </label>
            <input
              type="range"
              step="0.1"
              min="0"
              max="45"
              value={String(point.beatHz ?? 10)}
              onInput={(e: any) => {
                point.beatHz = Number(e.currentTarget.value);
                repaint(true);
              }}
            />
          </div>
        ) : null}
      </div>
      <LayerHealth l={l} point={point} />
      {!isNoBeat(l) ? (
        <div className="operator-hint small">
          Beat Hz is the amplitude-modulation cycle rate. Start low and increase
          until separate pulses are still distinguishable; if the pulses smear
          into one buzz, back down.
        </div>
      ) : null}
      <details className="advanced-layer">
        <summary>Advanced layer details</summary>
        <div className="layer-controls-grid">
          {!isNoBeat(l) ? (
            <div className="field">
              <label>
                Beat at final point{" "}
                <b>{l.keyframes[l.keyframes.length - 1]?.beatHz || 10} Hz</b>
              </label>
              <input
                type="range"
                step="0.1"
                min="0"
                max="45"
                value={String(
                  l.keyframes[l.keyframes.length - 1]?.beatHz || 10,
                )}
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
          {!isNoBeat(l) ? (
            <div className="field">
              <label>Wave</label>
              <select
                value={l.wave || "sine"}
                onChange={(e: any) => {
                  l.wave = e.currentTarget.value;
                  repaint(true);
                }}
              >
                <option value="sine">sine</option>
                <option value="triangle">triangle</option>
                <option value="sawtooth">sawtooth</option>
              </select>
            </div>
          ) : null}
          {l.type === "iso-trap" ? <IsoTrapControls l={l} /> : null}
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
          {l.type === "procedural-ambience" ? (
            <ProceduralControls l={l} />
          ) : null}
          {l.type === "additive" ? <AdditiveControls l={l} /> : null}
          {l.type === "karplus" ? <KarplusControls l={l} /> : null}
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
          <label className="small">
            Raw per-layer keyframes generated from global points
          </label>
          <TimelineEditor l={l} />
        </div>
      </details>
    </div>
  );
}

function QuickWorkflow({
  analysis,
}: {
  analysis: ReturnType<typeof analyzeSession>;
}) {
  const phase = workflowPhase();
  return (
    <div className="ux-workflow">
      <div
        className={
          "ux-step " +
          (phase === "carrier" ? "on" : phase === "blank" ? "next" : "done")
        }
      >
        <span className="ux-step-num">1</span>
        <div>
          <b>Carrier check</b>
          <span>choose a steady tone on the real speakers/headphones</span>
        </div>
      </div>
      <div
        className={
          "ux-step " +
          (phase === "pulse"
            ? "on"
            : phase === "blank" || phase === "carrier"
              ? "next"
              : "done")
        }
      >
        <span className="ux-step-num">2</span>
        <div>
          <b>Pulse threshold</b>
          <span>switch to iso trap/smooth and tune beat Hz</span>
        </div>
      </div>
      <div
        className={
          "ux-step " +
          (phase === "timeline" ? "on" : phase === "ready" ? "done" : "next")
        }
      >
        <span className="ux-step-num">3</span>
        <div>
          <b>Arc & export</b>
          <span>clone point tabs, analyze, share or render</span>
        </div>
      </div>
      <div
        className={
          "ux-meter " +
          (analysis.issues.some((i) => i.level === "error")
            ? "bad"
            : analysis.mixStatus === "hot"
              ? "warn"
              : "ok")
        }
      >
        <b>{analysis.mixStatus}</b>
        <span>{analysis.estimatedPeakDb.toFixed(1)} dBFS</span>
      </div>
    </div>
  );
}

function QuickBuilder() {
  return (
    <div className="quick-builder">
      <div className="eyebrow">Start here</div>
      <div className="quick-grid">
        <button className="quick-card" onClick={() => applyStarter("carrier")}>
          <b>Carrier check</b>
          <span>One plain tone at 220 Hz. Verify no speaker beating.</span>
        </button>
        <button
          className="quick-card"
          onClick={() => applyStarter("countable")}
        >
          <b>Countable pulses</b>
          <span>Iso trap at 6 Hz. Best for separate-pulse focus.</span>
        </button>
        <button className="quick-card" onClick={() => applyStarter("buzz")}>
          <b>Focus buzz</b>
          <span>Iso trap at 14 Hz. Fused SMR/beta style.</span>
        </button>
        <button className="quick-card" onClick={() => applyStarter("descent")}>
          <b>Descent arc</b>
          <span>10 → 6 → 3 Hz with a portable ambience bed.</span>
        </button>
      </div>
    </div>
  );
}

function EmptyStudioState() {
  return (
    <div className="empty-studio">
      <div className="empty-orb" />
      <h2>Build from a steady carrier.</h2>
      <p className="small">
        The fastest reliable workflow is carrier first, modulation second,
        timeline third. Add a plain carrier, listen for unwanted speaker
        beating, then switch to isochronic trap or smooth.
      </p>
      <div className="btnrow">
        <button className="act primary" onClick={() => applyStarter("carrier")}>
          Start carrier check
        </button>
        <button className="act" onClick={() => applyStarter("countable")}>
          Start countable pulses
        </button>
        <button className="act" onClick={() => applyStarter("descent")}>
          Start descent arc
        </button>
      </div>
    </div>
  );
}

function LayerHealth({ l, point }: { l: EntrainLayerV1; point: any }) {
  const beat = Number(point.beatHz || 0);
  const carrier = Number(point.carrierHz || l.carrierHz || 0);
  const tags: string[] = [];
  if (l.type === "carrier" && carrier && carrier < 210)
    tags.push("check speaker beating");
  if (!isNoBeat(l)) {
    if (beat > 0 && beat < 4) tags.push("slow / meditative");
    else if (beat <= 8) tags.push("countable pulses");
    else if (beat < 13) tags.push("near fusion");
    else tags.push("fused buzz");
  }
  if (l.type === "binaural") tags.push("headphones only");
  if (l.type === "sample" && !engine.hasSample(l.id))
    tags.push("reload local file");
  if (!tags.length) return null;
  return (
    <div className="layer-health mono">
      {tags.map((t) => (
        <span key={t}>{t}</span>
      ))}
    </div>
  );
}

function DeviceCheckStrip() {
  const options = [180, 220, 280, 340];
  return (
    <div className="device-check-strip">
      <div>
        <b>Device sound check</b>
        <span>
          Before modulation, verify a plain carrier is steady on the exact
          speaker/headphone path you will use.
        </span>
      </div>
      <div className="device-check-buttons">
        {options.map((hz) => (
          <button
            className="act tiny"
            key={hz}
            onClick={() => loadCarrierCheck(hz)}
          >
            {hz} Hz carrier
          </button>
        ))}
      </div>
    </div>
  );
}

function StudioChecklist({
  analysis,
}: {
  analysis: ReturnType<typeof analyzeSession>;
}) {
  const hasCarrierLayer = session.layers.some((l) => l.type === "carrier");
  const hasPulseLayer = session.layers.some((l) => !isNoBeat(l));
  const hasPointArc = stageTimes().length > 2;
  const portable = !sessionNeedsLocalFiles(session);
  const ok = !analysis.issues.some((i) => i.level === "error");
  const rows = [
    {
      label: "Carrier verified first",
      done: hasCarrierLayer || hasPulseLayer,
      hint: "Start from a plain carrier before adding pulse modulation.",
    },
    {
      label: "Pulse intention chosen",
      done: hasPulseLayer,
      hint: "Countable theta pulses, focus buzz, or descent arc.",
    },
    {
      label: "Timeline arc exists",
      done: hasPointArc || session.layers.length > 0,
      hint: "Use point tabs when the track should evolve.",
    },
    {
      label: "Portable share ready",
      done: portable,
      hint: "Sample files must be converted or reloaded by friends.",
    },
    {
      label: "Analyzer clean",
      done: ok,
      hint: "Fix blocking warnings before publishing or sharing widely.",
    },
  ];
  return (
    <div className="studio-checklist">
      <div className="eyebrow">Build checklist</div>
      {rows.map((r) => (
        <div className={"check-row " + (r.done ? "done" : "")} key={r.label}>
          <span>{r.done ? "✓" : "·"}</span>
          <div>
            <b>{r.label}</b>
            <em>{r.hint}</em>
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineMap() {
  const times = stageTimes();
  const dur = Math.max(0.001, session.durationMin);
  const visible = session.layers.slice(0, 8);
  return (
    <div className="timeline-map">
      <div className="timeline-ruler">
        {times.map((t) => (
          <span
            key={t}
            className={Math.abs(t - activePointMin) < 1e-6 ? "on" : ""}
            style={{ left: `${Math.min(100, Math.max(0, (t / dur) * 100))}%` }}
          >
            {fmtPoint(t)}
          </span>
        ))}
      </div>
      <div className="timeline-canvas">
        <span
          className="timeline-playhead"
          style={{
            left: `${Math.min(100, Math.max(0, (activePointMin / dur) * 100))}%`,
          }}
        />
        {visible.map((l) => (
          <div className="timeline-row" key={l.id}>
            <label>{layerShortLabel(l)}</label>
            <div className="timeline-track">
              {times.slice(0, -1).map((t, i) => {
                const n = times[i + 1];
                const left = (t / dur) * 100;
                const width = Math.max(0.6, ((n - t) / dur) * 100);
                return (
                  <span
                    className="timeline-seg"
                    title={segmentLabel(l, t, n)}
                    key={t + "-" + n}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      background: layerColor(
                        sampleTimelineSafe(l, "beatHz", t),
                        l.type,
                      ),
                    }}
                  >
                    {segmentLabel(l, t, n)}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
        {session.layers.length > visible.length ? (
          <div className="timeline-more small">
            + {session.layers.length - visible.length} more layer(s)
          </div>
        ) : null}
      </div>
    </div>
  );
}

function OperatorGuide() {
  return (
    <details className="operator-guide" open>
      <summary>Operator workflow</summary>
      <ol className="small">
        <li>
          Start blank. Add one tone layer. Pick a carrier frequency first with
          method set to <b>Plain carrier</b>.
        </li>
        <li>
          Listen on the actual device you will use. Laptop speakers often create
          mechanical beating below ~210 Hz. Choose a carrier that sounds steady
          before adding modulation.
        </li>
        <li>
          Switch method to <b>Isochronic trap</b> for crisp clickless pulses, or{" "}
          <b>Isochronic smooth</b> for a gentler Hann-shaped pulse. Beat Hz is
          volume pulses per second, not pitch.
        </li>
        <li>
          Start near 0 Hz, then increase slowly until you can still distinguish
          separate pulses. Countable pulses usually live around 4–8 Hz; by
          ~10–18 Hz they fuse into a rough focus buzz, which can still be useful
          but is no longer a beat-counting drill.
        </li>
        <li>
          Create a new point tab to clone the whole stack at a later timestamp.
          Change carrier/beat/gain there; ENTRAIN interpolates continuously
          between point tabs when it converts this view into the session
          algorithm.
        </li>
        <li>
          Do not confuse protocols: a conscious pulse-counting focus drill, an
          SMR/beta focus buzz, and a Holosync-style descent are different arcs.
          The UI can build all three, but the operator should choose one
          intention per track.
        </li>
      </ol>
    </details>
  );
}

function GlobalPointTabs() {
  const times = stageTimes();
  return (
    <div className="global-points">
      <div className="eyebrow">Global timeline points</div>
      <div className="point-tabs">
        {times.map((t) => (
          <button
            key={t}
            className={
              "point-tab " + (Math.abs(t - activePointMin) < 1e-6 ? "on" : "")
            }
            onClick={() => selectPoint(t)}
          >
            {fmtPoint(t)}
          </button>
        ))}
        <button className="point-tab add" onClick={cloneCurrentPoint}>
          + clone point
        </button>
      </div>
      <div className="two compact-two">
        <div className="field">
          <label>Active point start minute</label>
          <input
            type="number"
            min="0"
            max={String(session.durationMin)}
            step="0.25"
            value={String(activePointMin)}
            onChange={(e: any) =>
              moveActivePoint(Number(e.currentTarget.value || 0))
            }
          />
        </div>
        <div className="field">
          <label>Segment ends at</label>
          <input readOnly value={fmtPoint(nextPointAfter(activePointMin))} />
        </div>
      </div>
      <TimelineMap />
      <p className="small">
        Each point is a full snapshot of the layer stack. Between adjacent
        points, carrier frequency, beat Hz, and gain interpolate linearly in the
        playable ENTRAIN format.
      </p>
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

function IsoTrapControls({ l }: { l: EntrainLayerV1 }) {
  const cfg = l.isoPulse || { edgeMs: 8, duty: 0.45 };
  return (
    <>
      <div className="field">
        <label>
          Pulse edge <b>{cfg.edgeMs} ms</b>
        </label>
        <input
          type="range"
          min="1"
          max="40"
          step="1"
          value={String(cfg.edgeMs)}
          onInput={(e: any) => {
            l.isoPulse = { ...cfg, edgeMs: Number(e.currentTarget.value) };
            repaint(true);
          }}
        />
      </div>
      <div className="field">
        <label>
          Pulse duty <b>{Math.round(cfg.duty * 100)}%</b>
        </label>
        <input
          type="range"
          min="0.1"
          max="0.9"
          step="0.01"
          value={String(cfg.duty)}
          onInput={(e: any) => {
            l.isoPulse = { ...cfg, duty: Number(e.currentTarget.value) };
            repaint(true);
          }}
        />
      </div>
      <div className="field wide">
        <p className="small">
          Trap mode uses a raised-edge pulse train: steep enough to read as
          separate isochronic pulses, with millisecond ramps to avoid raw-square
          clicks. Lower edge = sharper; lower duty = more silence between
          pulses.
        </p>
      </div>
    </>
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
          <option value="heavy-rain-bowls">heavy rain + bowls</option>
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

function AdditiveControls({ l }: { l: EntrainLayerV1 }) {
  const partialText = JSON.stringify(
    l.partials?.length ? l.partials : bowlPartialsUi(),
  );
  const env = l.envelope || {
    attackMs: 1200,
    decayMs: 2500,
    sustain: 0.9,
    releaseMs: 4000,
  };
  return (
    <>
      <div className="field">
        <label>Partial preset</label>
        <select
          value="custom"
          onChange={(e: any) => {
            const v = e.currentTarget.value;
            if (v === "bowl") l.partials = bowlPartialsUi();
            if (v === "organ")
              l.partials = [
                { ratio: 1, gain: 1 },
                { ratio: 2, gain: 0.45 },
                { ratio: 3, gain: 0.25 },
                { ratio: 4, gain: 0.14 },
              ];
            if (v === "glass")
              l.partials = [
                { ratio: 1, gain: 1 },
                { ratio: 2.76, gain: 0.46, decaySec: 22 },
                { ratio: 5.4, gain: 0.24, decaySec: 18 },
                { ratio: 8.9, gain: 0.13, decaySec: 14 },
              ];
            repaint(true);
          }}
        >
          <option value="custom">custom/current</option>
          <option value="bowl">singing bowl</option>
          <option value="organ">organ pad</option>
          <option value="glass">glass bell</option>
        </select>
      </div>
      <div className="field wide">
        <label>Partials JSON</label>
        <textarea
          rows="3"
          value={partialText}
          onChange={(e: any) => {
            try {
              l.partials = JSON.parse(e.currentTarget.value);
              notice = "partials updated";
            } catch {
              notice = "partials JSON is invalid";
            }
            repaint(true);
          }}
        />
      </div>
      <div className="field">
        <label>
          Attack <b>{env.attackMs} ms</b>
        </label>
        <input
          type="number"
          min="0"
          max="30000"
          step="50"
          value={String(env.attackMs)}
          onChange={(e: any) => {
            l.envelope = {
              ...env,
              attackMs: Number(e.currentTarget.value || 0),
            };
            repaint(true);
          }}
        />
      </div>
      <div className="field">
        <label>
          Release <b>{env.releaseMs} ms</b>
        </label>
        <input
          type="number"
          min="0"
          max="120000"
          step="100"
          value={String(env.releaseMs)}
          onChange={(e: any) => {
            l.envelope = {
              ...env,
              releaseMs: Number(e.currentTarget.value || 0),
            };
            repaint(true);
          }}
        />
      </div>
    </>
  );
}

function KarplusControls({ l }: { l: EntrainLayerV1 }) {
  const cfg = l.karplus || {
    rateHz: 0.08,
    decay: 0.996,
    brightness: 0.55,
    durationSec: 6,
  };
  return (
    <>
      <div className="field">
        <label>Seed</label>
        <input
          type="number"
          min="1"
          value={String(l.seed || 4242)}
          onInput={(e: any) => {
            l.seed = Number(e.currentTarget.value || 1);
            repaint(true);
          }}
        />
      </div>
      <div className="field">
        <label>
          Pluck rate <b>{cfg.rateHz.toFixed(3)} Hz</b>
        </label>
        <input
          type="range"
          min="0.005"
          max="2"
          step="0.005"
          value={String(cfg.rateHz)}
          onInput={(e: any) => {
            l.karplus = { ...cfg, rateHz: Number(e.currentTarget.value) };
            repaint(true);
          }}
        />
      </div>
      <div className="field">
        <label>
          Decay <b>{cfg.decay.toFixed(4)}</b>
        </label>
        <input
          type="range"
          min="0.9"
          max="0.9999"
          step="0.0001"
          value={String(cfg.decay)}
          onInput={(e: any) => {
            l.karplus = { ...cfg, decay: Number(e.currentTarget.value) };
            repaint(true);
          }}
        />
      </div>
      <div className="field">
        <label>
          Brightness <b>{Math.round(cfg.brightness * 100)}%</b>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={String(cfg.brightness)}
          onInput={(e: any) => {
            l.karplus = { ...cfg, brightness: Number(e.currentTarget.value) };
            repaint(true);
          }}
        />
      </div>
      <div className="field">
        <label>
          Voice length <b>{cfg.durationSec}s</b>
        </label>
        <input
          type="number"
          min="1"
          max="30"
          step="0.5"
          value={String(cfg.durationSec)}
          onChange={(e: any) => {
            l.karplus = {
              ...cfg,
              durationSec: Number(e.currentTarget.value || 6),
            };
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
          {!isNoCarrier(l) ? <th>carrier</th> : null}
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
            {!isNoCarrier(l) ? (
              <td>
                <input
                  type="number"
                  min="20"
                  max="2000"
                  step="1"
                  value={String(k.carrierHz || l.carrierHz || 220)}
                  onChange={(e: any) => {
                    k.carrierHz = Number(e.currentTarget.value);
                    if (i === 0) l.carrierHz = k.carrierHz;
                    repaint(true);
                  }}
                />
              </td>
            ) : null}
            {!isNoBeat(l) ? (
              <td>
                <input
                  type="number"
                  min="0"
                  max="45"
                  step="0.1"
                  value={String(k.beatHz || 0)}
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
          <td colSpan="5">
            <button
              className="btn"
              onClick={() => {
                const t = nextSuggestedPoint();
                addLayerPointAt(l, t, activePointMin);
                activePointMin = t;
                repaint(true);
              }}
            >
              + point from active
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
  return bandForHz(hz);
}
function layerColor(hz: number, type: LayerType) {
  if (type === "noise" || type === "sample" || type === "procedural-ambience")
    return "#5d6d87";
  if (type === "additive") return "#9be7d8";
  if (type === "karplus") return "#d7b16a";
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
        "iso-trap": "Isochronic trap",
        "iso-hard": "Isochronic hard",
        carrier: "Plain carrier",
        noise: "Noise bed",
        sample: "Ambience file",
        "procedural-ambience": "Procedural ambience",
        additive: "Additive drone",
        karplus: "Karplus pluck",
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
  const carrier = hz >= 30 ? 300 : 220;
  session.layers.push({
    id: uid(),
    type: "iso-trap",
    carrierHz: carrier,
    wave: "sine",
    isoPulse: { edgeMs: 8, duty: 0.45 },
    keyframes: [
      { tMin: 0, carrierHz: carrier, beatHz: hz, gainPct: 32 },
      {
        tMin: session.durationMin,
        carrierHz: carrier,
        beatHz: hz,
        gainPct: 32,
      },
    ],
  });
  repaint(true);
}

function addProtocolGlide() {
  const carrier = Number(prompt("Carrier Hz", "140") || 140);
  const startBeat = Number(prompt("Start beat Hz", "10") || 10);
  const endBeat = Number(prompt("End beat Hz", "2.5") || 2.5);
  const durationMin = Math.max(
    1,
    Number(
      prompt("Glide duration minutes", String(session.durationMin)) ||
        session.durationMin,
    ),
  );
  const gainPct = Math.max(
    0,
    Math.min(100, Number(prompt("Gain %", "20") || 20)),
  );
  session.durationMin = Math.max(session.durationMin, durationMin);
  session.layers.push({
    id: uid(),
    type: "binaural",
    carrierHz: carrier,
    wave: "sine",
    keyframes: createLinearGlideKeyframes(
      startBeat,
      endBeat,
      durationMin,
      gainPct,
    ),
  });
  notice = `added ${carrier} Hz glide ${startBeat}→${endBeat} Hz over ${durationMin} min`;
  repaint(true);
}

function fmtPoint(t: number) {
  return `${Math.round(t * 100) / 100}m`;
}
function stageTimes() {
  const vals = new Set<number>([
    0,
    Math.round(session.durationMin * 1000) / 1000,
  ]);
  for (const l of session.layers)
    for (const k of l.keyframes)
      vals.add(Math.round((k.tMin || 0) * 1000) / 1000);
  return [...vals]
    .filter((t) => t >= 0 && t <= session.durationMin)
    .sort((a, b) => a - b);
}
function nextPointAfter(t: number) {
  return stageTimes().find((x) => x > t + 1e-6) ?? session.durationMin;
}
function selectPoint(t: number) {
  activePointMin = t;
  ensureStagePoint(t);
  repaint();
}
function nextSuggestedPoint() {
  return Math.min(
    session.durationMin,
    Math.max(
      0,
      activePointMin + Math.min(5, Math.max(1, session.durationMin / 4)),
    ),
  );
}
function cloneCurrentPoint() {
  const t = Math.max(
    0,
    Math.min(
      session.durationMin,
      Number(
        prompt("New point start minute", String(nextSuggestedPoint())) ||
          nextSuggestedPoint(),
      ),
    ),
  );
  for (const l of session.layers) addLayerPointAt(l, t, activePointMin);
  activePointMin = t;
  notice = `created point at ${fmtPoint(t)} from current stack`;
  repaint(true);
}
function moveActivePoint(next: number) {
  next = Math.max(0, Math.min(session.durationMin, next));
  const old = activePointMin;
  for (const l of session.layers) {
    const k = l.keyframes.find((p) => Math.abs(p.tMin - old) < 1e-6);
    if (k) k.tMin = next;
    l.keyframes.sort((a, b) => a.tMin - b.tMin);
  }
  activePointMin = next;
  repaint(true);
}
function ensureStagePoint(t: number) {
  session.layers.forEach((l) => ensureLayerPoint(l, t));
}
function addLayerPointAt(l: EntrainLayerV1, t: number, sourceT: number) {
  const k = {
    tMin: t,
    beatHz: isNoBeat(l) ? undefined : sampleTimelineSafe(l, "beatHz", sourceT),
    carrierHz: isNoCarrier(l)
      ? undefined
      : sampleTimelineSafe(l, "carrierHz", sourceT),
    gainPct: sampleTimelineSafe(l, "gainPct", sourceT),
  };
  const existing = l.keyframes.find((p) => Math.abs(p.tMin - t) < 1e-6);
  if (existing) Object.assign(existing, k);
  else l.keyframes.push(k);
  l.keyframes.sort((a, b) => a.tMin - b.tMin);
  if (t === 0 && k.carrierHz) l.carrierHz = k.carrierHz;
}
function ensureLayerPoint(l: EntrainLayerV1, t: number) {
  let k = l.keyframes.find((p) => Math.abs(p.tMin - t) < 1e-6);
  if (!k) {
    addLayerPointAt(l, t, t);
    k = l.keyframes.find((p) => Math.abs(p.tMin - t) < 1e-6)!;
  }
  if (!isNoCarrier(l) && !k.carrierHz)
    k.carrierHz = l.carrierHz || (l.type === "additive" ? 136.1 : 220);
  if (!isNoBeat(l) && k.beatHz == null) k.beatHz = 10;
  return k;
}
function sampleTimelineSafe(
  l: EntrainLayerV1,
  key: "beatHz" | "gainPct" | "carrierHz",
  t: number,
) {
  if (key === "carrierHz") {
    const sorted = [...l.keyframes].sort((a, b) => a.tMin - b.tMin);
    if (sorted.every((k) => k.carrierHz == null))
      return l.carrierHz || (l.type === "additive" ? 136.1 : 220);
  }
  // Local copy to avoid importing sampleTimeline into this client twice in older bundles.
  const pts = [...l.keyframes].sort((a, b) => a.tMin - b.tMin);
  if (!pts.length)
    return key === "gainPct"
      ? 35
      : key === "carrierHz"
        ? l.carrierHz || 220
        : 10;
  const val = (p: any) =>
    Number(
      p[key] ??
        (key === "carrierHz" ? l.carrierHz : key === "beatHz" ? 10 : 35),
    );
  if (t <= pts[0].tMin) return val(pts[0]);
  for (let i = 1; i < pts.length; i++)
    if (t <= pts[i].tMin) {
      const a = pts[i - 1],
        b = pts[i],
        f = (t - a.tMin) / Math.max(1e-9, b.tMin - a.tMin);
      return val(a) + (val(b) - val(a)) * f;
    }
  return val(pts[pts.length - 1]);
}
function setPointCarrier(l: EntrainLayerV1, value: number) {
  const p = ensureLayerPoint(l, activePointMin);
  p.carrierHz = value;
  if (activePointMin === 0 || !l.carrierHz) l.carrierHz = value;
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

function describeLayerAtPoint(l: EntrainLayerV1, p: any) {
  if (l.type === "binaural") {
    const c = p.carrierHz || l.carrierHz || 220,
      b = p.beatHz || 0;
    return `${b} Hz · L/R ${fmtHz(c - b / 2)} / ${fmtHz(c + b / 2)} Hz`;
  }
  if (!isNoBeat(l))
    return `${p.beatHz || 0} Hz beat · carrier ${p.carrierHz || l.carrierHz || 220} Hz`;
  if (!isNoCarrier(l))
    return `${p.carrierHz || l.carrierHz || 220} Hz carrier · gain ${p.gainPct || 0}%`;
  return describeLayer(l);
}
function describeLayer(l: EntrainLayerV1) {
  if (l.type === "sample")
    return `${l.sampleName || "load a file"} · ${l.sampleLoop?.mode || "native"} loop`;
  if (l.type === "procedural-ambience")
    return `${l.ambienceRecipe || "pink-rain"} · seed ${l.seed || 1337}`;
  if (l.type === "additive")
    return `${l.carrierHz || 136.1} Hz base · ${(l.partials || []).length || 3} partials`;
  if (l.type === "karplus")
    return `${l.carrierHz || 220} Hz pluck · ${(l.karplus?.rateHz || 0.08).toFixed(3)} Hz rate`;
  if (l.type === "noise") return `${l.noiseColor || "pink"} noise`;
  if (l.type === "carrier") return `${l.carrierHz || 220} Hz carrier`;
  const first = l.keyframes[0]?.beatHz || 10;
  const last = l.keyframes[l.keyframes.length - 1]?.beatHz || first;
  const carrier = l.carrierHz || 220;
  if (l.type === "binaural")
    return `${first}${first !== last ? `→${last}` : ""} Hz · L/R ${fmtHz(carrier - first / 2)} / ${fmtHz(carrier + first / 2)} Hz`;
  return `${first}${first !== last ? `→${last}` : ""} Hz · carrier ${carrier} Hz`;
}
function fmtHz(v: number) {
  return Math.round(v * 100) / 100;
}
function fmtPan(p: number) {
  return p === 0
    ? "C"
    : p < 0
      ? `${Math.round(Math.abs(p) * 100)}L`
      : `${Math.round(p * 100)}R`;
}

function scaleLayerGain(l: EntrainLayerV1, next: number) {
  const current = l.keyframes[0]?.gainPct ?? 0;
  if (current <= 0) {
    l.keyframes.forEach((k) => {
      k.gainPct = next;
    });
    return;
  }
  const ratio = next / current;
  l.keyframes.forEach((k) => {
    k.gainPct = Math.max(
      0,
      Math.min(100, Math.round((k.gainPct || 0) * ratio * 100) / 100),
    );
  });
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
  else l.carrierHz = l.carrierHz || (type === "additive" ? 136.1 : 220);
  if (type === "binaural") {
    l.pan = undefined;
    l.panMotion = undefined;
  }
  if (type === "iso-trap") {
    l.isoPulse = l.isoPulse || { edgeMs: 8, duty: 0.45 };
  } else {
    l.isoPulse = undefined;
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
  if (type === "additive") {
    l.partials = l.partials?.length ? l.partials : bowlPartialsUi();
    l.envelope = l.envelope || {
      attackMs: 1200,
      decayMs: 2500,
      sustain: 0.9,
      releaseMs: 4000,
    };
    l.pan = l.pan || 0;
  }
  if (type === "karplus") {
    l.karplus = l.karplus || {
      rateHz: 0.08,
      decay: 0.996,
      brightness: 0.55,
      durationSec: 6,
    };
    l.envelope = l.envelope || {
      attackMs: 2,
      decayMs: 800,
      sustain: 0,
      releaseMs: 1200,
    };
    l.seed = l.seed || 4242;
    l.pan = l.pan || 0;
  }
}

function addLayer() {
  session.layers.push({
    id: uid(),
    type: "carrier",
    carrierHz: 220,
    wave: "sine",
    keyframes: [
      { tMin: 0, carrierHz: 220, gainPct: 35 },
      { tMin: session.durationMin, carrierHz: 220, gainPct: 35 },
    ],
  });
  notice =
    "added plain carrier; verify it sounds steady, then switch method to isochronic trap for crisp pulses";
  repaint(true);
}
function addNoise() {
  session.layers.push({
    id: uid(),
    type: "noise",
    noiseColor: "pink",
    seed: Math.floor(Math.random() * 999999) + 1,
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
function addAdditive() {
  session.layers.push({
    id: uid(),
    type: "additive",
    carrierHz: 136.1,
    wave: "sine",
    partials: bowlPartialsUi(),
    envelope: { attackMs: 1200, decayMs: 2500, sustain: 0.9, releaseMs: 4000 },
    pan: 0,
    panMotion: { rateHz: 0.018, depth: 0.18 },
    keyframes: [
      { tMin: 0, gainPct: 20 },
      { tMin: session.durationMin, gainPct: 20 },
    ],
  });
  repaint(true);
}
function addKarplus() {
  session.layers.push({
    id: uid(),
    type: "karplus",
    carrierHz: 220,
    seed: Math.floor(Math.random() * 999999) + 1,
    karplus: { rateHz: 0.08, decay: 0.996, brightness: 0.55, durationSec: 6 },
    envelope: { attackMs: 2, decayMs: 800, sustain: 0, releaseMs: 1200 },
    pan: 0,
    panMotion: { rateHz: 0.012, depth: 0.22 },
    keyframes: [
      { tMin: 0, gainPct: 18 },
      { tMin: session.durationMin, gainPct: 18 },
    ],
  });
  repaint(true);
}
function bowlPartialsUi() {
  return [
    { ratio: 1, gain: 1, detuneCents: 0 },
    { ratio: 1.5, gain: 0.5, detuneCents: 2 },
    { ratio: 2.001, gain: 0.32, detuneCents: -3 },
  ];
}

function workflowPhase() {
  if (!session.layers.length) return "blank";
  const hasTone = session.layers.some((l) => l.type === "carrier");
  const hasPulse = session.layers.some(
    (l) =>
      l.type.startsWith("iso") ||
      l.type === "monaural" ||
      l.type === "binaural",
  );
  const hasMultiplePoints = stageTimes().length > 1;
  if (hasTone && !hasPulse) return "carrier";
  if (hasPulse && !hasMultiplePoints) return "pulse";
  if (hasMultiplePoints) return "timeline";
  return "ready";
}

function loadCarrierCheck(hz: number) {
  engine.stop();
  status = "idle";
  activePointMin = 0;
  session = sanitizeSession({
    ...defaultSession(),
    name: `Carrier check ${hz} Hz`,
    durationMin: 8,
    layers: [
      {
        id: uid(),
        type: "carrier",
        carrierHz: hz,
        wave: "sine",
        keyframes: [
          { tMin: 0, carrierHz: hz, gainPct: 34 },
          { tMin: 8, carrierHz: hz, gainPct: 34 },
        ],
      },
    ],
  });
  notice = `${hz} Hz plain carrier loaded — listen for mechanical beating before adding modulation`;
  repaint(true);
}
function layerShortLabel(l: EntrainLayerV1) {
  if (l.type === "procedural-ambience") return "ambience";
  if (l.type === "additive") return "additive";
  if (l.type === "karplus") return "pluck";
  return l.type.replace("iso-", "iso ");
}
function segmentLabel(l: EntrainLayerV1, a: number, b: number) {
  const c0 = sampleTimelineSafe(l, "carrierHz", a),
    c1 = sampleTimelineSafe(l, "carrierHz", b);
  const g0 = sampleTimelineSafe(l, "gainPct", a),
    g1 = sampleTimelineSafe(l, "gainPct", b);
  if (!isNoBeat(l)) {
    const beat0 = sampleTimelineSafe(l, "beatHz", a),
      beat1 = sampleTimelineSafe(l, "beatHz", b);
    const beat =
      Math.abs(beat0 - beat1) > 0.05
        ? `${fmtNum(beat0)}→${fmtNum(beat1)}Hz`
        : `${fmtNum(beat0)}Hz`;
    const carrier =
      Math.abs(c0 - c1) > 0.5
        ? ` · ${fmtNum(c0)}→${fmtNum(c1)}c`
        : ` · ${fmtNum(c0)}c`;
    return beat + carrier;
  }
  if (!isNoCarrier(l))
    return Math.abs(c0 - c1) > 0.5
      ? `${fmtNum(c0)}→${fmtNum(c1)}Hz`
      : `${fmtNum(c0)}Hz`;
  return Math.abs(g0 - g1) > 0.5
    ? `${fmtNum(g0)}→${fmtNum(g1)}%`
    : `${fmtNum(g0)}%`;
}
function fmtNum(v: number) {
  return Number.isFinite(v) ? String(Math.round(v * 10) / 10) : "0";
}
function onStudioKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  if (
    target &&
    ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)
  )
    return;
  const k = e.key.toLowerCase();
  if (e.code === "Space") {
    e.preventDefault();
    void toggle();
  } else if (k === "t") {
    addLayer();
  } else if (k === "p") {
    cloneCurrentPoint();
  } else if (k === "s") {
    copyShareUrl();
  } else if (k === "e") {
    void exportWav();
  }
}

function applyStarter(kind: "carrier" | "countable" | "buzz" | "descent") {
  engine.stop();
  status = "idle";
  activePointMin = 0;
  if (kind === "carrier") {
    session = sanitizeSession({
      ...defaultSession(),
      name: "Carrier check",
      durationMin: 10,
      layers: [
        {
          id: uid(),
          type: "carrier",
          carrierHz: 220,
          wave: "sine",
          keyframes: [
            { tMin: 0, carrierHz: 220, gainPct: 35 },
            { tMin: 10, carrierHz: 220, gainPct: 35 },
          ],
        },
      ],
    });
    notice =
      "carrier check loaded — listen for unwanted beating before adding modulation";
  } else if (kind === "countable") {
    session = sanitizeSession({
      ...defaultSession(),
      name: "Countable pulse drill",
      durationMin: 12,
      loop: { mode: "hold-last" },
      layers: [
        {
          id: uid(),
          type: "iso-trap",
          carrierHz: 340,
          wave: "sine",
          isoPulse: { edgeMs: 8, duty: 0.45 },
          keyframes: [
            { tMin: 0, carrierHz: 340, beatHz: 6, gainPct: 38 },
            { tMin: 12, carrierHz: 340, beatHz: 6, gainPct: 38 },
          ],
        },
      ],
    });
    notice =
      "countable-pulse starter loaded — tune beat Hz until pulses are distinct but comfortable";
  } else if (kind === "buzz") {
    session = sanitizeSession({
      ...defaultSession(),
      name: "Focus buzz starter",
      durationMin: 18,
      loop: { mode: "hold-last" },
      layers: [
        {
          id: uid(),
          type: "iso-trap",
          carrierHz: 340,
          wave: "sine",
          isoPulse: { edgeMs: 5, duty: 0.5 },
          keyframes: [
            { tMin: 0, carrierHz: 340, beatHz: 12, gainPct: 30 },
            { tMin: 18, carrierHz: 360, beatHz: 16, gainPct: 28 },
          ],
        },
        {
          id: uid(),
          type: "procedural-ambience",
          ambienceRecipe: "brown-room",
          seed: 4242,
          pan: 0,
          keyframes: [
            { tMin: 0, gainPct: 12 },
            { tMin: 18, gainPct: 12 },
          ],
        },
      ],
    });
    notice =
      "focus-buzz starter loaded — this is fused modulation, not a count-the-pulses drill";
  } else {
    session = sanitizeSession({
      ...defaultSession(),
      name: "Gentle descent arc",
      durationMin: 24,
      loop: { mode: "hold-last" },
      layers: [
        {
          id: uid(),
          type: "iso-smooth",
          carrierHz: 300,
          wave: "sine",
          keyframes: [
            { tMin: 0, carrierHz: 300, beatHz: 10, gainPct: 24 },
            { tMin: 12, carrierHz: 280, beatHz: 6, gainPct: 22 },
            { tMin: 24, carrierHz: 260, beatHz: 3, gainPct: 18 },
          ],
        },
        {
          id: uid(),
          type: "procedural-ambience",
          ambienceRecipe: "heavy-rain-bowls",
          seed: 9001,
          pan: 0,
          panMotion: { rateHz: 0.018, depth: 0.18 },
          keyframes: [
            { tMin: 0, gainPct: 20 },
            { tMin: 24, gainPct: 24 },
          ],
        },
      ],
    });
    notice = "descent starter loaded — point tabs show the glide arc";
  }
  engine = createAudioEngine(() => session);
  repaint(true);
}

function auditionLayer(id: string) {
  const target = session.layers.find((l) => l.id === id);
  if (!target) return;
  session.layers.forEach((l) => {
    l.solo = l.id === id;
    l.mute = false;
  });
  notice = `auditioning ${layerTypeLabel(target.type)} only — clear Solo to restore full stack`;
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
    await engine.start({
      loopPattern: (session.loop?.mode || "hold-last") !== "hold-last",
    });
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
async function copyAlgorithmJson() {
  await navigator.clipboard
    .writeText(JSON.stringify(sanitizeSession(session), null, 2))
    .catch(() => {});
  notice = "playable ENTRAIN algorithm JSON copied";
  repaint();
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
  const info = await encodeSessionUrl(session);
  lastShare = info;
  await navigator.clipboard.writeText(info.url).catch(() => {});
  history.replaceState(null, "", info.hash);
  notice = info.portable
    ? `exact private URL copied · checksum ${info.digest} · ${Math.ceil(info.bytes / 1024)} KB`
    : `private URL copied, but local audio files must be reloaded · ${Math.ceil(info.bytes / 1024)} KB`;
  if (info.warnings.length) notice += " · " + info.warnings[0];
  repaint();
}
async function copyShareCapsule() {
  const info = await encodeSessionUrl(session);
  lastShare = info;
  await navigator.clipboard.writeText(info.capsule).catch(() => {});
  notice = `share capsule copied · checksum ${info.digest} · paste with Import URL/code`;
  if (info.warnings.length) notice += " · " + info.warnings[0];
  repaint();
}
async function importShareString() {
  const text = prompt(
    "Paste an ENTRAIN private URL, #es hash, ENTRAIN capsule, or raw session JSON",
  );
  if (!text) return;
  try {
    const next = await decodeSessionFromString(text);
    if (!next) throw new Error("No ENTRAIN session found in pasted text.");
    engine.stop();
    session = next;
    engine = createAudioEngine(() => session);
    lastShare = null;
    notice = sessionNeedsLocalFiles(session)
      ? "imported share; reload local ambience files to match sender"
      : "imported exact shared soundtrack";
  } catch (e: any) {
    notice = e.message || "import failed";
  }
  repaint(true);
}
function makePortableCopy() {
  let converted = 0;
  session = sanitizeSession({
    ...session,
    name: session.name + " · portable",
    layers: session.layers.map((l, i) => {
      if (l.type !== "sample") return l;
      converted++;
      return {
        id: uid(),
        type: "procedural-ambience",
        ambienceRecipe: "pink-rain",
        seed: Math.floor((Date.now() + i * 9973) % 2147483646) || 1337,
        pan: l.pan || 0,
        panMotion: l.panMotion,
        keyframes: JSON.parse(JSON.stringify(l.keyframes || [])),
      };
    }),
  });
  engine.stop();
  engine = createAudioEngine(() => session);
  lastShare = null;
  notice = converted
    ? `converted ${converted} local file layer(s) into seeded procedural ambience for exact sharing`
    : "session is already portable";
  repaint(true);
}
function newLocalSession() {
  if (
    !confirm(
      "Start a new local session? Your current session remains available only if you exported/copied it or autosave has it.",
    )
  )
    return;
  engine.stop();
  session = defaultSession();
  engine = createAudioEngine(() => session);
  lastShare = null;
  notice = "new local session started";
  repaint(true);
}
function clearAutosave() {
  localStorage.removeItem("entrain:studio-autosave");
  notice = "local autosave cleared";
  repaint();
}

async function publishCurrent() {
  try {
    const title =
      prompt("Public soundtrack title", session.name) || session.name;
    const summary =
      prompt(
        "Short catalogue summary",
        session.description ||
          session.notes ||
          "Community-created ENTRAIN soundtrack.",
      ) || "Community-created ENTRAIN soundtrack.";
    const priceSolRaw =
      prompt("Price in SOL for paid access. Use 0 for free.", "0.05") || "0";
    const priceLamports = Math.max(
      0,
      Math.floor(Number(priceSolRaw) * 1_000_000_000),
    );
    const creatorName = prompt("Creator display name", "") || "";
    notice = "connect Phantom to publish…";
    repaint();
    await connectAndVerify();
    const res = await fetch("/api/soundtracks/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        summary,
        description: session.description || session.notes || summary,
        category: "community",
        tags: ["community", "creator"],
        session: sanitizeSession(session),
        priceLamports,
        creatorName,
        payoutWallet: undefined,
        publishNow: true,
      }),
    }).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || "publish failed");
    notice = res.published
      ? `published to catalogue: /soundtracks/${res.slug}`
      : `submitted for review: ${res.slug}`;
    if (res.published && confirm("Open public soundtrack page now?"))
      location.href = `/soundtracks/${res.slug}`;
  } catch (e: any) {
    notice = e.message || "publish failed";
  }
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
  if (activePointMin > session.durationMin)
    activePointMin = session.durationMin;
  if (rebuild && engine.running) scheduleEngineRebuild();
  scheduleLocalAutosave();
  render(<App />, document.getElementById("studio-root")!);
}
function scheduleEngineRebuild() {
  if (pendingRebuildOffset == null) pendingRebuildOffset = engine.positionSec();
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    const offset = pendingRebuildOffset ?? engine.positionSec();
    pendingRebuildOffset = null;
    if (engine.running) {
      engine.stop();
      setTimeout(
        () =>
          engine
            .start({
              loopPattern: (session.loop?.mode || "hold-last") !== "hold-last",
              offsetSec: offset,
            })
            .catch(() => {}),
        80,
      );
    }
  }, 160);
}

function scheduleLocalAutosave() {
  if (booting) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        "entrain:studio-autosave",
        JSON.stringify(sanitizeSession(session)),
      );
    } catch {}
  }, 250);
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
  booting = true;
  const shared = await decodeSessionHash().catch((e: any) => {
    notice = e.message || "could not load shared URL";
    return null;
  });
  const handoff = sessionStorage.getItem("entrain:loaded-session");
  const autosaved = localStorage.getItem("entrain:studio-autosave");
  if (shared) {
    session = shared;
    notice = sessionNeedsLocalFiles(session)
      ? "loaded shared URL; reload local ambience files to match sender"
      : "loaded exact private URL";
  } else if (handoff) {
    session = sanitizeSession(JSON.parse(handoff));
    notice = "loaded soundtrack into studio";
  } else if (autosaved) {
    session = sanitizeSession(JSON.parse(autosaved));
    notice = "restored local browser draft";
  }
  booting = false;
  addEventListener("keydown", onStudioKey);
  render(<App />, document.getElementById("studio-root")!);
  scheduleLocalAutosave();
  return () => {
    removeEventListener("keydown", onStudioKey);
    engine.stop();
    render(null, document.getElementById("studio-root")!);
  };
}
