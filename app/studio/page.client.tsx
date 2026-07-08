import { render } from "tradjs/client";
import type {
  EntrainLayerV1,
  EntrainSessionV1,
  LayerType,
} from "@/format/entrain-format";
import {
  bandForHz,
  hasBeat,
  hasCarrier,
  defaultSession,
  sanitizeSession,
  sessionNeedsLocalFiles,
} from "@/format/entrain-format";
import {
  patternTextToSession,
  sessionToSbagenText,
  sbagenTextToSession,
  looksLikeSbagen,
} from "@/format/pattern-text";
import { createAudioEngine } from "@/client/audio-engine";
import { drawBeatScope, type BeatScopeParams } from "@/client/beat-scope";
import {
  decodeSessionHash,
  decodeSessionFromString,
  encodeSourceUrl,
  type SharePayloadInfo,
} from "@/client/session-codec";
import { sbagenExportWarnings } from "@/format/sbagen";

// ─── module state ────────────────────────────────────────────────────────────
// Model: every layer has EXACTLY TWO keyframes — Start (tMin 0) and End
// (tMin durationMin). All values glide linearly between them.
// Hierarchy: Play/Stop outermost, then Import and Export (modals), then the
// layer stack, then the selected layer's editor. Nothing else.
//
// CONTROL BINDING NOTE (framework-proof forms):
// tradjs sets JSX props as DOM attributes. Attributes are only DEFAULTS for
// form controls — <select value> does not exist in HTML at all, <textarea>
// takes its text as children, and a user-dirtied <input> ignores attribute
// updates. Two rules keep every control truthful:
//   1. every stateful control carries data-val; syncControlValues() writes
//      the value PROPERTY after each render (and marks <option selected>).
//   2. editor handlers never trust closures — they resolve selectedLayer()
//      at event time, so a stale listener on a reused DOM node can never
//      write into a different layer.

let session: EntrainSessionV1 = defaultSession();
let engine = createAudioEngine(() => session);
let status = "idle";
let notice = "";
let exportBusy = false;
let autosaveTimer: any = null;
let rebuildTimer: any = null;
let pendingRebuildOffset: number | null = null;
let booting = true;
let playAnchor = 0; // performance.now()/1000 at playback position zero

let selectedLayerId: string | null = null;
let modal: null | "import" | "export" = null;
let importText = "";
let exportInfo: SharePayloadInfo | null = null;
let widgetInfo: SharePayloadInfo | null = null;
// UI-only tie state per layer×param: when tied, moving Start or End moves
// both. Lazily initialized to "tied" when the two values are already equal.
const tiedMap: Record<string, boolean> = {};

const ALL_TYPES: LayerType[] = [
  "carrier",
  "iso-trap",
  "iso-smooth",
  "iso-hard",
  "monaural",
  "binaural",
  "noise",
  "procedural-ambience",
  "sample",
  "additive",
  "karplus",
];
const isNoBeat = (l: EntrainLayerV1) => !hasBeat(l.type);
const isNoCarrier = (l: EntrainLayerV1) => !hasCarrier(l.type);
const uid = () =>
  crypto.randomUUID?.() || Math.random().toString(36).slice(2, 9);
const nowSec = () => performance.now() / 1000;
const visualElapsed = () =>
  engine.running ? Math.max(0, nowSec() - playAnchor) : 0;
const selectedLayer = () =>
  session.layers.find((l) => l.id === selectedLayerId) ||
  session.layers[0] ||
  null;

// ─── root ────────────────────────────────────────────────────────────────────

function App() {
  const sel = selectedLayer();
  const headphones = session.layers.some(
    (l) => l.type === "binaural" && !l.mute,
  );
  return (
    <div className="studio-shell">
      <div className="studio-stage">
        <canvas id="scope-canvas" />
        <span className="readout l mono" id="studio-timer">
          {fmtClock(0)} / {fmtClock(session.durationMin * 60)}
        </span>
        <span className="readout r mono" id="studio-live">
          {sel ? liveLabel(sel, 0) : ""}
        </span>
        <span className="readout b mono">
          {session.layers.length} layers ·{" "}
          {headphones ? "headphones" : "speakers ok"}
        </span>
        <span className="readout br mono" id="studio-state">
          {status}
        </span>
      </div>

      <div className="studio-head">
        <div className="studio-title">
          <input
            className="name-input"
            value={session.name}
            data-val={session.name}
            onInput={(e: any) => {
              session.name = e.currentTarget.value;
              scheduleLocalAutosave();
            }}
          />
          <div className="small">
            {session.durationMin} min · {session.layers.length} layers
          </div>
        </div>
        <span className="shortcut-help mono">
          Space start · T layer · I import · E export
        </span>
      </div>

      <div className="transport">
        <button className="act primary play" onClick={toggle}>
          {engine.running ? "■ Stop" : "▶ Start"}
        </button>
        <span className="transport-spacer" />
        <button className="act" onClick={openImport}>
          Import
        </button>
        <button className="act" onClick={openExport}>
          Export
        </button>
      </div>
      {notice ? <div className="notice-inline mono">{notice}</div> : null}

      {session.layers.length ? (
        <>
          <Stack />
          {sel ? <LayerEditor l={sel} key={`${sel.id}:${sel.type}`} /> : null}
        </>
      ) : (
        <EmptyGuide />
      )}

      {modal === "import" ? <ImportModal /> : null}
      {modal === "export" ? <ExportModal /> : null}
    </div>
  );
}

// The stage visualizes THE SELECTED LAYER — the same one being edited.
// Layers with neither beat nor carrier (ambience, noise, samples) fall back
// to the engine's real waveform scope.
function stageLayer() {
  const l = selectedLayer();
  if (!l) return null;
  return l;
}
function liveLabel(l: EntrainLayerV1, tMin: number) {
  if (isNoBeat(l) && isNoCarrier(l))
    return `${layerShortLabel(l)} · gain ${Math.round(sampleTimelineSafe(l, "gainPct", tMin))}%`;
  if (isNoBeat(l))
    return `carrier ${Math.round(sampleTimelineSafe(l, "carrierHz", tMin))} Hz`;
  const b = sampleTimelineSafe(l, "beatHz", tMin);
  const c = sampleTimelineSafe(l, "carrierHz", tMin);
  return `${bandForHz(b)} · beat ${b.toFixed(2)} Hz · carrier ${Math.round(c)} Hz`;
}

// ─── stack: layer rows + add, duration on the scale ──────────────────────────

function Stack() {
  return (
    <div className="stack">
      <div className="stack-scale mono">
        <span>0m · start</span>
        <span>{fmtNum(session.durationMin / 2)}m</span>
        <span className="stack-duration">
          <input
            type="number"
            min="1"
            max="180"
            value={String(session.durationMin)}
            data-val={String(session.durationMin)}
            onInput={(e: any) => {
              session.durationMin = clampNum(
                Number(e.currentTarget.value),
                1,
                180,
                session.durationMin,
              );
              retimeEnds();
              refreshExportUrl();
              repaint(true);
            }}
          />{" "}
          min · end
        </span>
      </div>
      <div className="stack-body">
        <span className="stack-playhead" id="tl-playhead" />
        {session.layers.map((l, index) => (
          <StackRow l={l} index={index} key={l.id} />
        ))}
      </div>
      <button className="add-layer mono" onClick={addLayer}>
        + layer
      </button>
    </div>
  );
}

function StackRow({
  l,
  index,
}: {
  l: EntrainLayerV1;
  index: number;
  key?: string;
}) {
  const on = l.id === selectedLayer()?.id;
  const c0 = layerColor(seVal(l, "beatHz", "start"), l.type);
  const c1 = layerColor(seVal(l, "beatHz", "end"), l.type);
  return (
    <div className={"stack-row " + (on ? "on" : "")}>
      <div className="row-controls">
        <span
          className="layer-mark"
          style={{ background: c0, boxShadow: `0 0 12px ${c0}` }}
        />
        <button className="row-label" onClick={() => selectLayer(l.id)}>
          {String(index + 1).padStart(2, "0")} {layerShortLabel(l)}
        </button>
        <button
          className={"act tiny " + (l.mute ? "warn" : "")}
          title="Mute"
          onClick={() => {
            const x = byId(l.id);
            if (!x) return;
            x.mute = !x.mute;
            repaint(true);
          }}
        >
          M
        </button>
        <button
          className={"act tiny " + (l.solo ? "primary" : "")}
          title="Solo (exclusive)"
          onClick={() => toggleSolo(l.id)}
        >
          S
        </button>
      </div>
      <button
        className="stack-track"
        style={{ background: `linear-gradient(90deg, ${c0}, ${c1})` }}
        onClick={() => selectLayer(l.id)}
        title={arcLabel(l)}
      >
        <span className="arc-text mono">{arcLabel(l)}</span>
      </button>
      <button
        className="act tiny warn row-x"
        title="Remove layer"
        onClick={() => removeLayer(l.id)}
      >
        ✕
      </button>
    </div>
  );
}

function byId(id: string) {
  return session.layers.find((x) => x.id === id) || null;
}
function toggleSolo(id: string) {
  const l = byId(id);
  if (!l) return;
  const next = !l.solo;
  session.layers.forEach((x) => {
    x.solo = false;
  });
  l.solo = next;
  repaint(true);
}

// ─── layer editor: one type select, Start | End grid, advanced ───────────────
// All handlers resolve the CURRENT selected layer at event time (never the
// render-time closure) — see the control binding note at the top.

function cur(): EntrainLayerV1 | null {
  return selectedLayer();
}

function LayerEditor({ l }: { l: EntrainLayerV1; key?: string }) {
  const index = session.layers.findIndex((x) => x.id === l.id);
  const missingSample = l.type === "sample" && !engine.hasSample(l.id);
  return (
    <div className={"editor layer-" + l.type}>
      <div className="editor-head">
        <span className="editor-index mono">
          {String(index + 1).padStart(2, "0")}
        </span>
        <select
          className="type-select"
          data-val={l.type}
          onChange={(e: any) => {
            const c = cur();
            if (!c) return;
            changeType(c, e.currentTarget.value as LayerType);
            repaint(true);
          }}
        >
          {ALL_TYPES.map((t) => (
            <option value={t} selected={t === l.type} key={t}>
              {layerTypeLabel(t)}
            </option>
          ))}
        </select>
        <span className="layer-sub mono">
          {describeLayer(l)}
          {missingSample ? " · file not loaded" : ""}
        </span>
        <button
          className="act tiny editor-dup"
          title="Duplicate layer"
          onClick={() => {
            const c = cur();
            if (c) duplicateLayer(c.id);
          }}
        >
          Dup
        </button>
      </div>

      <div className="se-grid">
        <div className="se-h" />
        <div className="se-h mono">start · 0m</div>
        <div className="se-h mono">end · {session.durationMin}m</div>
        <div className="se-h" />
        {!isNoCarrier(l) ? (
          <SERow
            l={l}
            label="Carrier"
            keyName="carrierHz"
            min={40}
            max={1200}
            step={1}
            unit=" Hz"
          />
        ) : null}
        {!isNoBeat(l) ? (
          <SERow
            l={l}
            label="Beat"
            keyName="beatHz"
            min={0}
            max={45}
            step={0.1}
            unit=" Hz"
          />
        ) : null}
        <SERow
          l={l}
          label="Gain"
          keyName="gainPct"
          min={0}
          max={100}
          step={1}
          unit="%"
        />
      </div>
      <div className="se-now mono small" id="se-now">
        idle · press Start to see live interpolated values
      </div>

      <details className="advanced-layer">
        <summary>Advanced</summary>
        <div className="layer-controls-grid">
          {!isNoBeat(l) ? (
            <div className="field">
              <label>Wave</label>
              <select
                data-val={l.wave || "sine"}
                onChange={(e: any) => {
                  const c = cur();
                  if (!c) return;
                  c.wave = e.currentTarget.value;
                  repaint(true);
                }}
              >
                {["sine", "triangle", "sawtooth"].map((wv) => (
                  <option
                    value={wv}
                    selected={wv === (l.wave || "sine")}
                    key={wv}
                  >
                    {wv}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {l.type === "iso-trap" ? <IsoTrapControls l={l} /> : null}
          {l.type === "noise" ? (
            <div className="field">
              <label>Noise color</label>
              <select
                data-val={l.noiseColor || "pink"}
                onChange={(e: any) => {
                  const c = cur();
                  if (!c) return;
                  c.noiseColor = e.currentTarget.value;
                  repaint(true);
                }}
              >
                {["white", "pink", "brown"].map((nc) => (
                  <option
                    value={nc}
                    selected={nc === (l.noiseColor || "pink")}
                    key={nc}
                  >
                    {nc}
                  </option>
                ))}
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
                data-val={String(l.pan || 0)}
                onInput={(e: any) => {
                  const c = cur();
                  if (!c) return;
                  c.pan = Number(e.currentTarget.value);
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
                data-val={String(l.panMotion?.rateHz || 0)}
                onInput={(e: any) => {
                  const c = cur();
                  if (!c) return;
                  const rateHz = Number(e.currentTarget.value);
                  c.panMotion =
                    rateHz > 0
                      ? { rateHz, depth: c.panMotion?.depth ?? 0.35 }
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
                data-val={String(l.panMotion?.depth || 0.35)}
                onInput={(e: any) => {
                  const c = cur();
                  if (!c) return;
                  c.panMotion = {
                    rateHz: c.panMotion?.rateHz || 0.03,
                    depth: Number(e.currentTarget.value),
                  };
                  repaint(true);
                }}
              />
            </div>
          ) : null}
          {l.type === "sample" ? <SampleControls l={l} /> : null}
        </div>
      </details>
    </div>
  );
}

function SERow({
  l,
  label,
  keyName,
  min,
  max,
  step,
  unit,
}: {
  l: EntrainLayerV1;
  label: string;
  keyName: "carrierHz" | "beatHz" | "gainPct";
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  const s = seVal(l, keyName, "start");
  const e = seVal(l, keyName, "end");
  const tied = tieOf(l, keyName);
  return (
    <>
      <div className="se-rowlabel">{label}</div>
      <div className="se-cell">
        <input
          type="range"
          min={String(min)}
          max={String(max)}
          step={String(step)}
          value={String(s)}
          data-val={String(s)}
          onInput={(ev: any) => {
            const c = cur();
            if (c) setSE(c, keyName, "start", Number(ev.currentTarget.value));
          }}
        />
        <b className="mono">
          {fmtNum(s)}
          {unit}
        </b>
      </div>
      <div className="se-cell">
        <input
          type="range"
          min={String(min)}
          max={String(max)}
          step={String(step)}
          value={String(e)}
          data-val={String(e)}
          onInput={(ev: any) => {
            const c = cur();
            if (c) setSE(c, keyName, "end", Number(ev.currentTarget.value));
          }}
        />
        <b className="mono">
          {fmtNum(e)}
          {unit}
        </b>
      </div>
      <button
        className={"act tiny se-tie " + (tied ? "primary" : "")}
        title={
          tied
            ? "Tied: moving one slider moves both. Click to untie."
            : "Untied: start and end move independently. Click to tie."
        }
        onClick={() => {
          const c = cur();
          if (c) toggleTie(c, keyName);
        }}
      >
        =
      </button>
    </>
  );
}

// ─── modals: the only two top-level actions ──────────────────────────────────

function ImportModal() {
  return (
    <div className="modal-backdrop" onClick={backdropClose}>
      <div className="modal">
        <div className="modal-head">
          <b>Import session</b>
          <button className="act tiny" onClick={closeModal}>
            ✕
          </button>
        </div>
        <p className="small">
          Paste an SBaGen script, ENTRAIN private URL, share capsule, or session
          JSON. Importing replaces the current session.
        </p>
        <textarea
          className="modal-textarea mono"
          rows="8"
          placeholder="-- SBaGen script, https://…#es…, capsule, or { … } JSON"
          data-val={importText}
          onInput={(e: any) => {
            importText = e.currentTarget.value;
          }}
        >
          {importText}
        </textarea>
        <div className="modal-actions">
          <button className="act primary" onClick={doImport}>
            Replace current session
          </button>
          <button className="act" onClick={startBlank}>
            Start blank
          </button>
          <button className="act" onClick={closeModal}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportModal() {
  let sbagen = "";
  let sbagenWarnings: string[] = [];
  try {
    sbagen = sessionToSbagenText(session);
    sbagenWarnings = sbagenExportWarnings(session);
  } catch (e: any) {
    sbagen = `-- could not generate SBaGen: ${e?.message || e}`;
  }
  const embed = widgetInfo ? iframeEmbedCode(widgetInfo.url) : "encoding…";
  return (
    <div className="modal-backdrop" onClick={backdropClose}>
      <div className="modal modal-wide">
        <div className="modal-head">
          <b>Export session</b>
          <button className="act tiny" onClick={closeModal}>
            ✕
          </button>
        </div>
        <div className="field">
          <label>
            SBaGen-compatible script
            <button
              className="act tiny ghostlink"
              onClick={() =>
                copyText(sbagen, "SBaGen-compatible script copied")
              }
            >
              copy
            </button>
          </label>
          <textarea
            className="modal-textarea mono"
            rows="7"
            readOnly
            data-val={sbagen}
          >
            {sbagen}
          </textarea>
          {sbagenWarnings.length ? (
            <p className="small warntext">
              SBaGen compatibility notes: {sbagenWarnings.join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="field">
          <label>
            Studio URL — editable source, payload after # never reaches the
            server
            <button
              className="act tiny ghostlink"
              disabled={!exportInfo}
              onClick={() =>
                exportInfo && copyText(exportInfo.url, "Studio URL copied")
              }
            >
              copy
            </button>
          </label>
          <input
            className="mono"
            readOnly
            value={exportInfo ? exportInfo.url : "encoding…"}
            data-val={exportInfo ? exportInfo.url : "encoding…"}
          />
          {exportInfo ? (
            <span className="small mono">
              checksum {exportInfo.digest} ·{" "}
              {Math.ceil(exportInfo.bytes / 1024)} KB ·{" "}
              {exportInfo.urlSafe ? "URL-safe" : "large — prefer file export"}
            </span>
          ) : null}
        </div>
        <div className="field">
          <label>
            Widget URL — player-only page for iframe embeds
            <button
              className="act tiny ghostlink"
              disabled={!widgetInfo}
              onClick={() =>
                widgetInfo && copyText(widgetInfo.url, "Widget URL copied")
              }
            >
              copy
            </button>
          </label>
          <input
            className="mono"
            readOnly
            value={widgetInfo ? widgetInfo.url : "encoding…"}
            data-val={widgetInfo ? widgetInfo.url : "encoding…"}
          />
        </div>
        <div className="field">
          <label>
            Embed code
            <button
              className="act tiny ghostlink"
              disabled={!widgetInfo}
              onClick={() => widgetInfo && copyText(embed, "embed code copied")}
            >
              copy
            </button>
          </label>
          <textarea
            className="modal-textarea mono"
            rows="4"
            readOnly
            data-val={embed}
          >
            {embed}
          </textarea>
        </div>
        {sessionNeedsLocalFiles(session) ? (
          <p className="small warntext">
            Local ambience files cannot travel inside a URL.{" "}
            <button className="act tiny ghostlink" onClick={makePortableCopy}>
              Make portable copy
            </button>{" "}
            converts them to seeded procedural ambience for exact sharing.
          </p>
        ) : null}
        <div className="modal-settings">
          <div className="field">
            <label>Fade sec</label>
            <input
              type="number"
              min="0"
              max="30"
              step="1"
              value={String(session.export?.fadeSec ?? 4)}
              data-val={String(session.export?.fadeSec ?? 4)}
              onInput={(e: any) => {
                session.export = {
                  ...(session.export || {}),
                  fadeSec: Number(e.currentTarget.value || 0),
                };
                refreshExportUrl();
              }}
            />
          </div>
          <div className="field">
            <label>Sample rate</label>
            <select
              data-val={String(session.export?.sampleRate || 44100)}
              onChange={(e: any) => {
                session.export = {
                  ...(session.export || {}),
                  sampleRate: Number(e.currentTarget.value),
                };
                refreshExportUrl();
              }}
            >
              {[
                ["32000", "32 kHz"],
                ["44100", "44.1 kHz"],
                ["48000", "48 kHz"],
              ].map(([v, label]) => (
                <option
                  value={v}
                  selected={v === String(session.export?.sampleRate || 44100)}
                  key={v}
                >
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Beyond pattern</label>
            <select
              data-val={session.loop?.mode || "hold-last"}
              onChange={(e: any) => {
                session.loop = {
                  ...(session.loop || {}),
                  mode: e.currentTarget.value,
                };
                refreshExportUrl();
                repaint(true);
              }}
            >
              {[
                ["hold-last", "hold final values"],
                ["repeat", "repeat pattern"],
                ["crossfade-repeat", "crossfade repeat"],
              ].map(([v, label]) => (
                <option
                  value={v}
                  selected={v === (session.loop?.mode || "hold-last")}
                  key={v}
                >
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <button
            className="act primary"
            disabled={exportBusy}
            onClick={exportWav}
          >
            {exportBusy ? "Rendering…" : "↓ Download WAV"}
          </button>
          <button className="act" onClick={exportJson}>
            ↓ Download JSON
          </button>
        </div>
      </div>
    </div>
  );
}

function openImport() {
  modal = "import";
  repaint();
}
function openExport() {
  modal = "export";
  exportInfo = null;
  widgetInfo = null;
  repaint();
  refreshExportUrl();
}
function refreshExportUrl() {
  if (modal !== "export") return;
  const origin = location.origin;
  Promise.all([
    encodeSourceUrl(session, `${origin}/studio`),
    encodeSourceUrl(session, `${origin}/widget`),
  ])
    .then(([studio, widget]) => {
      exportInfo = studio;
      widgetInfo = widget;
      if (modal === "export") repaint();
    })
    .catch(() => {});
}
function iframeEmbedCode(url: string) {
  const safe = String(url).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<iframe src="${safe}" width="100%" height="420" style="border:0;border-radius:16px;overflow:hidden" allow="autoplay"></iframe>`;
}
function closeModal() {
  modal = null;
  repaint();
}
function backdropClose(e: any) {
  if (e.target === e.currentTarget) closeModal();
}
async function copyText(text: string, msg: string) {
  await navigator.clipboard.writeText(text).catch(() => {});
  notice = msg;
  repaint();
}

async function doImport() {
  const text = importText.trim();
  if (!text) {
    notice = "paste something to import first";
    repaint();
    return;
  }
  try {
    let next: EntrainSessionV1 | null = null;
    let base = "";
    if (looksLikeSbagen(text)) {
      const r = sbagenTextToSession(text);
      next = r.session;
      base = `imported SBaGen script${r.warnings.length ? ` · ${r.warnings.length} note(s)` : ""}`;
    } else {
      next = await decodeSessionFromString(text).catch(() => null);
      base = "imported session";
      if (!next) {
        next = patternTextToSession(text);
        base = "imported pattern text";
      }
    }
    if (!next) throw new Error("No ENTRAIN session found in pasted text.");
    engine.stop();
    status = "idle";
    session = next;
    engine = createAudioEngine(() => session);
    importText = "";
    modal = null;
    afterSessionLoad(
      sessionNeedsLocalFiles(session)
        ? `${base} · reload local ambience files to match sender`
        : base,
    );
  } catch (e: any) {
    notice = e.message || "import failed";
  }
  repaint(true);
}
function startBlank() {
  engine.stop();
  session = { ...defaultSession(), layers: [] };
  engine = createAudioEngine(() => session);
  selectedLayerId = null;
  status = "idle";
  modal = null;
  importText = "";
  notice = "new blank session";
  repaint();
}

// ─── empty state: the only guidance surface, and the default view ────────────

function EmptyGuide() {
  return (
    <div className="empty-studio">
      <div className="empty-orb" />
      <h2>Build from a steady carrier.</h2>
      <p className="small">
        Carrier first, modulation second, arc third. Add a plain carrier, listen
        for unwanted speaker beating on the exact playback device you will use,
        then switch its type to isochronic trap and tune the beat. Every layer
        glides linearly from its Start values to its End values across the whole
        soundtrack.
      </p>
      <div className="quick-grid starters">
        <button className="quick-card" onClick={() => applyStarter("carrier")}>
          <b>Carrier check</b>
          <span>One plain tone at 220 Hz. Verify no speaker beating.</span>
        </button>
        <button
          className="quick-card"
          onClick={() => applyStarter("countable")}
        >
          <b>Countable pulses</b>
          <span>Iso trap at 6 Hz. Separate-pulse focus drill.</span>
        </button>
        <button className="quick-card" onClick={() => applyStarter("buzz")}>
          <b>Focus buzz</b>
          <span>Iso trap 12 → 16 Hz. Fused SMR/beta texture.</span>
        </button>
        <button className="quick-card" onClick={() => applyStarter("descent")}>
          <b>Descent arc</b>
          <span>10 → 3 Hz glide with a portable ambience bed.</span>
        </button>
      </div>
      <details className="operator-guide">
        <summary>How to use</summary>
        <ol className="small">
          <li>
            <b>+ layer</b> adds a plain carrier. Pick a carrier frequency that
            sounds steady on your device — laptop speakers often create
            mechanical beating below ~210 Hz.
          </li>
          <li>
            Change the layer type to <b>Isochronic trap</b>. Beat Hz is volume
            pulses per second, not pitch. Countable pulses live around 4–8 Hz;
            above ~12 Hz they fuse into a focus buzz.
          </li>
          <li>
            Set Start and End values. The <b>=</b> button ties them so one
            slider moves both; untie it to make a glide.
          </li>
          <li>
            During playback, lock your gaze on the jumping line in the stage —
            it steps to a new position on every beat, computed from the exact
            same glide the audio follows. The stage always shows the layer you
            are editing.
          </li>
          <li>
            <b>Export</b> gives you SBaGen-compatible source, Studio and Widget
            URLs, embeddable iframe code, and a WAV render — all generated
            locally.
          </li>
        </ol>
      </details>
      <p className="small mono">
        local-first · no wallet · autosaves to this browser · Space start · T
        layer · I import · E export
      </p>
    </div>
  );
}

// ─── advanced per-type controls ──────────────────────────────────────────────

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
          data-val={String(cfg.edgeMs)}
          onInput={(e: any) => {
            const c = cur();
            if (!c) return;
            const cc = c.isoPulse || { edgeMs: 8, duty: 0.45 };
            c.isoPulse = { ...cc, edgeMs: Number(e.currentTarget.value) };
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
          data-val={String(cfg.duty)}
          onInput={(e: any) => {
            const c = cur();
            if (!c) return;
            const cc = c.isoPulse || { edgeMs: 8, duty: 0.45 };
            c.isoPulse = { ...cc, duty: Number(e.currentTarget.value) };
            repaint(true);
          }}
        />
      </div>
    </>
  );
}

function ProceduralControls({ l }: { l: EntrainLayerV1 }) {
  const recipes = [
    "rain",
    "pink-rain",
    "brown-room",
    "bowl-drone",
    "heavy-rain-bowls",
  ];
  return (
    <>
      <div className="field">
        <label>Ambience recipe</label>
        <select
          data-val={l.ambienceRecipe || "pink-rain"}
          onChange={(e: any) => {
            const c = cur();
            if (!c) return;
            c.ambienceRecipe = e.currentTarget.value;
            repaint(true);
          }}
        >
          {recipes.map((r) => (
            <option
              value={r}
              selected={r === (l.ambienceRecipe || "pink-rain")}
              key={r}
            >
              {r.replace(/-/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Seed</label>
        <input
          type="number"
          min="1"
          value={String(l.seed || 1337)}
          data-val={String(l.seed || 1337)}
          onInput={(e: any) => {
            const c = cur();
            if (!c) return;
            c.seed = Number(e.currentTarget.value || 1);
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
          data-val="custom"
          onChange={(e: any) => {
            const c = cur();
            if (!c) return;
            const v = e.currentTarget.value;
            if (v === "bowl") c.partials = bowlPartialsUi();
            if (v === "organ")
              c.partials = [
                { ratio: 1, gain: 1 },
                { ratio: 2, gain: 0.45 },
                { ratio: 3, gain: 0.25 },
                { ratio: 4, gain: 0.14 },
              ];
            if (v === "glass")
              c.partials = [
                { ratio: 1, gain: 1 },
                { ratio: 2.76, gain: 0.46, decaySec: 22 },
                { ratio: 5.4, gain: 0.24, decaySec: 18 },
                { ratio: 8.9, gain: 0.13, decaySec: 14 },
              ];
            repaint(true);
          }}
        >
          <option value="custom" selected>
            custom/current
          </option>
          <option value="bowl">singing bowl</option>
          <option value="organ">organ pad</option>
          <option value="glass">glass bell</option>
        </select>
      </div>
      <div className="field wide">
        <label>Partials JSON</label>
        <textarea
          rows="3"
          data-val={partialText}
          onChange={(e: any) => {
            const c = cur();
            if (!c) return;
            try {
              c.partials = JSON.parse(e.currentTarget.value);
              notice = "partials updated";
            } catch {
              notice = "partials JSON is invalid";
            }
            repaint(true);
          }}
        >
          {partialText}
        </textarea>
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
          data-val={String(env.attackMs)}
          onChange={(e: any) => {
            const c = cur();
            if (!c) return;
            const ce = c.envelope || env;
            c.envelope = {
              ...ce,
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
          data-val={String(env.releaseMs)}
          onChange={(e: any) => {
            const c = cur();
            if (!c) return;
            const ce = c.envelope || env;
            c.envelope = {
              ...ce,
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
  const upd = (patch: any) => {
    const c = cur();
    if (!c) return;
    const cc = c.karplus || cfg;
    c.karplus = { ...cc, ...patch };
    repaint(true);
  };
  return (
    <>
      <div className="field">
        <label>Seed</label>
        <input
          type="number"
          min="1"
          value={String(l.seed || 4242)}
          data-val={String(l.seed || 4242)}
          onInput={(e: any) => {
            const c = cur();
            if (!c) return;
            c.seed = Number(e.currentTarget.value || 1);
            repaint(true);
          }}
        />
      </div>
      <div className="field">
        <label>
          Pluck rate{" "}
          <b>
            {cfg.rateHz < 1 ? cfg.rateHz.toFixed(3) : cfg.rateHz.toFixed(2)} Hz
          </b>
        </label>
        <input
          type="range"
          min="0.005"
          max="20"
          step="0.01"
          value={String(cfg.rateHz)}
          data-val={String(cfg.rateHz)}
          onInput={(e: any) => upd({ rateHz: Number(e.currentTarget.value) })}
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
          data-val={String(cfg.decay)}
          onInput={(e: any) => upd({ decay: Number(e.currentTarget.value) })}
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
          data-val={String(cfg.brightness)}
          onInput={(e: any) =>
            upd({ brightness: Number(e.currentTarget.value) })
          }
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
          data-val={String(cfg.durationSec)}
          onChange={(e: any) =>
            upd({ durationSec: Number(e.currentTarget.value || 6) })
          }
        />
      </div>
    </>
  );
}

function SampleControls({ l }: { l: EntrainLayerV1 }) {
  const loop =
    l.sampleLoop ||
    ({ mode: "native", startSec: 0, endSec: 0, crossfadeSec: 3 } as any);
  const updLoop = (patch: any) => {
    const c = cur();
    if (!c) return;
    const cl =
      c.sampleLoop ||
      ({ mode: "native", startSec: 0, endSec: 0, crossfadeSec: 3 } as any);
    c.sampleLoop = { ...cl, ...patch };
    repaint(true);
  };
  return (
    <>
      <div className="field">
        <label>Ambience file</label>
        <input
          type="file"
          accept="audio/*"
          onChange={(e: any) => {
            const c = cur();
            if (c) loadSample(c.id, e.currentTarget.files?.[0]);
          }}
        />
      </div>
      <div className="field">
        <label>Loop mode</label>
        <select
          data-val={loop.mode || "native"}
          onChange={(e: any) => updLoop({ mode: e.currentTarget.value })}
        >
          {["native", "crossfade"].map((m) => (
            <option value={m} selected={m === (loop.mode || "native")} key={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Loop start sec</label>
        <input
          type="number"
          min="0"
          step="0.1"
          value={String(loop.startSec || 0)}
          data-val={String(loop.startSec || 0)}
          onInput={(e: any) =>
            updLoop({ startSec: Number(e.currentTarget.value || 0) })
          }
        />
      </div>
      <div className="field">
        <label>Loop end sec</label>
        <input
          type="number"
          min="0"
          step="0.1"
          value={String(loop.endSec || 0)}
          data-val={String(loop.endSec || 0)}
          onInput={(e: any) =>
            updLoop({ endSec: Number(e.currentTarget.value || 0) })
          }
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
            data-val={String(loop.crossfadeSec || 3)}
            onInput={(e: any) =>
              updLoop({ crossfadeSec: Number(e.currentTarget.value || 0) })
            }
          />
        </div>
      ) : null}
    </>
  );
}

// ─── two-point model: accessors & normalization ─────────────────────────────

// Render-safe value getter — samples the timeline at 0 or durationMin
// without mutating anything.
function seVal(
  l: EntrainLayerV1,
  key: "beatHz" | "carrierHz" | "gainPct",
  which: "start" | "end",
) {
  return sampleTimelineSafe(
    l,
    key,
    which === "start" ? 0 : session.durationMin,
  );
}

// Guarantees exactly two keyframes (Start at 0, End at durationMin) and
// returns them. Mutating — call ONLY from edit handlers or load paths.
function ensureStartEnd(l: EntrainLayerV1) {
  if (!l.keyframes?.length) l.keyframes = [{ tMin: 0, gainPct: 35 }] as any;
  l.keyframes.sort((a, b) => a.tMin - b.tMin);
  if (l.keyframes.length === 1) l.keyframes.push({ ...l.keyframes[0] });
  if (l.keyframes.length > 2)
    l.keyframes = [l.keyframes[0], l.keyframes[l.keyframes.length - 1]];
  const start = l.keyframes[0];
  const end = l.keyframes[1];
  start.tMin = 0;
  end.tMin = session.durationMin;
  if (!isNoCarrier(l)) {
    if (start.carrierHz == null)
      start.carrierHz = l.carrierHz || (l.type === "additive" ? 136.1 : 220);
    if (end.carrierHz == null) end.carrierHz = start.carrierHz;
  } else {
    start.carrierHz = undefined;
    end.carrierHz = undefined;
  }
  if (!isNoBeat(l)) {
    if (start.beatHz == null) start.beatHz = 10;
    if (end.beatHz == null) end.beatHz = start.beatHz;
  } else {
    start.beatHz = undefined;
    end.beatHz = undefined;
  }
  if (start.gainPct == null) start.gainPct = 35;
  if (end.gainPct == null) end.gainPct = start.gainPct;
  return { start, end };
}

function tieKey(l: EntrainLayerV1, key: string) {
  return `${l.id}:${key}`;
}
function tieOf(l: EntrainLayerV1, key: "beatHz" | "carrierHz" | "gainPct") {
  const k = tieKey(l, key);
  if (!(k in tiedMap))
    tiedMap[k] = Math.abs(seVal(l, key, "start") - seVal(l, key, "end")) < 1e-6;
  return tiedMap[k];
}
function toggleTie(l: EntrainLayerV1, key: "beatHz" | "carrierHz" | "gainPct") {
  const k = tieKey(l, key);
  tiedMap[k] = !tieOf(l, key);
  if (tiedMap[k]) {
    // snapping End to Start on tie makes the coupling predictable
    const { start, end } = ensureStartEnd(l);
    (end as any)[key] = (start as any)[key];
    repaint(true);
  } else {
    repaint();
  }
}
function setSE(
  l: EntrainLayerV1,
  key: "beatHz" | "carrierHz" | "gainPct",
  which: "start" | "end",
  v: number,
) {
  const { start, end } = ensureStartEnd(l);
  if (tieOf(l, key)) {
    (start as any)[key] = v;
    (end as any)[key] = v;
  } else {
    ((which === "start" ? start : end) as any)[key] = v;
  }
  if (key === "carrierHz" && (which === "start" || tieOf(l, key)))
    l.carrierHz = (start as any)[key];
  repaint(true);
}

// Flatten every layer to exactly Start/End, preserving the values a listener
// would hear at t=0 and t=durationMin. Intermediate keyframes (older drafts,
// SBaGen imports) are dropped — the arc becomes one linear glide.
function flattenSession(): number {
  let dropped = 0;
  const dur = session.durationMin;
  for (const l of session.layers) {
    const count = l.keyframes?.length || 0;
    if (count > 2) dropped += count - 2;
    const startVals = {
      carrierHz: isNoCarrier(l)
        ? undefined
        : sampleTimelineSafe(l, "carrierHz", 0),
      beatHz: isNoBeat(l) ? undefined : sampleTimelineSafe(l, "beatHz", 0),
      gainPct: sampleTimelineSafe(l, "gainPct", 0),
    };
    const endVals = {
      carrierHz: isNoCarrier(l)
        ? undefined
        : sampleTimelineSafe(l, "carrierHz", dur),
      beatHz: isNoBeat(l) ? undefined : sampleTimelineSafe(l, "beatHz", dur),
      gainPct: sampleTimelineSafe(l, "gainPct", dur),
    };
    l.keyframes = [
      { tMin: 0, ...startVals },
      { tMin: dur, ...endVals },
    ] as any;
    if (!isNoCarrier(l)) l.carrierHz = startVals.carrierHz;
  }
  return dropped;
}

function retimeEnds() {
  for (const l of session.layers) {
    if (!l.keyframes?.length) continue;
    l.keyframes.sort((a, b) => a.tMin - b.tMin);
    l.keyframes[0].tMin = 0;
    l.keyframes[l.keyframes.length - 1].tMin = session.durationMin;
  }
}

function afterSessionLoad(baseNotice: string) {
  const dropped = flattenSession();
  selectedLayerId = session.layers[0]?.id || null;
  notice = dropped
    ? `${baseNotice} · flattened ${dropped} intermediate point(s) to one start→end glide`
    : baseNotice;
}

// ─── derived / pure helpers ──────────────────────────────────────────────────

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
function layerShortLabel(l: EntrainLayerV1) {
  if (l.type === "procedural-ambience") return "ambience";
  if (l.type === "additive") return "additive";
  if (l.type === "karplus") return "pluck";
  return l.type.replace("iso-", "iso ");
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
function fmtNum(v: number) {
  return Number.isFinite(v) ? String(Math.round(v * 10) / 10) : "0";
}
function clampNum(v: number, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function arrow(a: number, b: number, unit: string, eps = 0.05) {
  return Math.abs(a - b) > eps
    ? `${fmtNum(a)}→${fmtNum(b)}${unit}`
    : `${fmtNum(a)}${unit}`;
}
function arcLabel(l: EntrainLayerV1) {
  const cs = seVal(l, "carrierHz", "start"),
    ce = seVal(l, "carrierHz", "end");
  const bs = seVal(l, "beatHz", "start"),
    be = seVal(l, "beatHz", "end");
  const gs = seVal(l, "gainPct", "start"),
    ge = seVal(l, "gainPct", "end");
  if (!isNoBeat(l))
    return `${arrow(bs, be, " Hz")} beat · ${arrow(cs, ce, " Hz", 0.5)} carrier`;
  if (!isNoCarrier(l)) return `${arrow(cs, ce, " Hz", 0.5)} carrier`;
  return `${arrow(gs, ge, "%", 0.5)} gain`;
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
  if (l.type === "carrier")
    return `${arrow(seVal(l, "carrierHz", "start"), seVal(l, "carrierHz", "end"), " Hz", 0.5)} carrier`;
  const first = seVal(l, "beatHz", "start");
  const last = seVal(l, "beatHz", "end");
  const carrier = l.carrierHz || 220;
  if (l.type === "binaural")
    return `${arrow(first, last, "")} Hz · L/R ${fmtHz(carrier - first / 2)} / ${fmtHz(carrier + first / 2)} Hz`;
  return `${arrow(first, last, "")} Hz · carrier ${carrier} Hz`;
}

// ─── selection / layer ops ───────────────────────────────────────────────────

function selectLayer(id: string) {
  selectedLayerId = id;
  repaint();
}
function addLayer() {
  const l: EntrainLayerV1 = {
    id: uid(),
    type: "carrier",
    carrierHz: 220,
    wave: "sine",
    keyframes: [
      { tMin: 0, carrierHz: 220, gainPct: 35 },
      { tMin: session.durationMin, carrierHz: 220, gainPct: 35 },
    ],
  } as EntrainLayerV1;
  session.layers.push(l);
  selectedLayerId = l.id;
  notice =
    "added plain carrier — verify it sounds steady, then change its type";
  repaint(true);
}
function duplicateLayer(id: string) {
  const l = byId(id);
  if (!l) return;
  const copy: EntrainLayerV1 = {
    ...JSON.parse(JSON.stringify(l)),
    id: uid(),
    solo: false,
    sampleName:
      l.type === "sample"
        ? `${l.sampleName || "sample"} (reload file)`
        : l.sampleName,
  };
  session.layers.push(copy);
  selectedLayerId = copy.id;
  notice = `duplicated ${layerTypeLabel(l.type)}`;
  repaint(true);
}
function removeLayer(id: string) {
  session.layers = session.layers.filter((l) => l.id !== id);
  if (selectedLayerId === id) selectedLayerId = session.layers[0]?.id || null;
  repaint(true);
}
async function loadSample(id: string, file?: File) {
  if (!file) return;
  await engine.loadSample(id, file);
  const l = byId(id);
  if (l) l.sampleName = file.name;
  notice = `loaded ${file.name}`;
  repaint(true);
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
  ensureStartEnd(l);
}
function bowlPartialsUi() {
  return [
    { ratio: 1, gain: 1, detuneCents: 0 },
    { ratio: 1.5, gain: 0.5, detuneCents: 2 },
    { ratio: 2.001, gain: 0.32, detuneCents: -3 },
  ];
}

// ─── starters ────────────────────────────────────────────────────────────────

function applyStarter(kind: "carrier" | "countable" | "buzz" | "descent") {
  engine.stop();
  status = "idle";
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
    notice =
      "descent starter loaded — one linear glide from 10 Hz down to 3 Hz";
  }
  engine = createAudioEngine(() => session);
  afterSessionLoad(notice);
  repaint(true);
}

// ─── transport / engine / stage ──────────────────────────────────────────────

async function toggle() {
  if (engine.running) {
    engine.stop();
    status = "idle";
  } else {
    await engine.start({
      loopPattern: (session.loop?.mode || "hold-last") !== "hold-last",
    });
    playAnchor = nowSec();
    status = "running";
    draw();
  }
  repaint();
}
function scheduleEngineRebuild() {
  if (pendingRebuildOffset == null) pendingRebuildOffset = engine.positionSec();
  status = "applying…";
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
            .then(() => {
              playAnchor = nowSec() - offset;
              status = "running";
              draw();
            })
            .catch(() => {
              status = "idle";
            }),
        80,
      );
    } else {
      status = "idle";
    }
  }, 160);
}

// Stage params: THE SELECTED LAYER's exact linear glide — the stage always
// visualizes the layer being edited. The sweep is driven by wall-clock time
// anchored at playback start, so N jumps per second is true by construction;
// if audible pulses drift off the line, the audio engine has a phase bug,
// not the renderer.
function stageParams(elapsedSec: number): BeatScopeParams | null {
  const l = stageLayer();
  if (!l) return null;
  if (isNoBeat(l) && isNoCarrier(l)) return null; // ambience → engine scope
  const tMin = elapsedSec / 60;
  return {
    type: l.type,
    beatStartHz: isNoBeat(l) ? 0 : seVal(l, "beatHz", "start"),
    beatEndHz: isNoBeat(l) ? 0 : seVal(l, "beatHz", "end"),
    durationSec: session.durationMin * 60,
    carrierHz: isNoCarrier(l) ? 0 : sampleTimelineSafe(l, "carrierHz", tMin),
    gainPct: sampleTimelineSafe(l, "gainPct", tMin),
    duty: l.isoPulse?.duty,
    edgeMs: l.isoPulse?.edgeMs,
    elapsedSec,
    running: engine.running,
    color: layerColor(sampleTimelineSafe(l, "beatHz", tMin), l.type),
  };
}
function paintStage(elapsedSec: number) {
  const canvas = document.getElementById(
    "scope-canvas",
  ) as HTMLCanvasElement | null;
  if (!canvas) return;
  const p = stageParams(elapsedSec);
  if (p) drawBeatScope(canvas, p);
  else if (session.layers.length) engine.drawScope(canvas);
}
function draw() {
  if (!engine.running) return;
  paintStage(visualElapsed());
  syncLiveReadouts();
  requestAnimationFrame(draw);
}
function syncLiveReadouts() {
  const elapsed = visualElapsed();
  const tMin = elapsed / 60;
  const t = document.getElementById("studio-timer");
  if (t)
    t.textContent = `${fmtClock(elapsed)} / ${fmtClock(session.durationMin * 60)}`;
  const state = document.getElementById("studio-state");
  if (state) state.textContent = status;
  const ph = document.getElementById("tl-playhead") as HTMLElement | null;
  if (ph && engine.running && session.durationMin > 0)
    ph.style.left = `${Math.min(100, Math.max(0, (elapsed / (session.durationMin * 60)) * 100))}%`;
  const sel = selectedLayer();
  const live = document.getElementById("studio-live");
  if (live && sel) live.textContent = liveLabel(sel, tMin);
  const now = document.getElementById("se-now");
  if (now && sel) {
    const parts: string[] = [];
    if (!isNoBeat(sel))
      parts.push(
        `beat ${sampleTimelineSafe(sel, "beatHz", tMin).toFixed(2)} Hz`,
      );
    if (!isNoCarrier(sel))
      parts.push(
        `carrier ${Math.round(sampleTimelineSafe(sel, "carrierHz", tMin))} Hz`,
      );
    parts.push(`gain ${Math.round(sampleTimelineSafe(sel, "gainPct", tMin))}%`);
    now.textContent = `now ${fmtClock(elapsed)} · ${parts.join(" · ")}`;
  }
}

// ─── export helpers ──────────────────────────────────────────────────────────

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
  afterSessionLoad(
    converted
      ? `converted ${converted} local file layer(s) into seeded procedural ambience`
      : "session is already portable",
  );
  refreshExportUrl();
  repaint(true);
}

// ─── render loop & lifecycle ─────────────────────────────────────────────────

// Force form-control PROPERTIES to match state after every render. Attributes
// only set defaults; a dirtied input or a reused select keeps its old value
// otherwise. Cheap: one query + string compare per control.
function syncControlValues() {
  document.querySelectorAll<HTMLElement>("[data-val]").forEach((el: any) => {
    const v = el.getAttribute("data-val") ?? "";
    if (el.value !== v) el.value = v;
  });
}

function repaint(rebuild = false) {
  if (rebuild && engine.running) scheduleEngineRebuild();
  scheduleLocalAutosave();
  render(<App />, document.getElementById("studio-root")!);
  syncControlValues();
  if (!engine.running)
    requestAnimationFrame(() => {
      if (!engine.running) paintStage(0); // idle preview: Start values
    });
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
function onStudioKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  if (
    target &&
    ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)
  )
    return;
  if (e.key === "Escape" && modal) {
    closeModal();
    return;
  }
  const k = e.key.toLowerCase();
  if (e.code === "Space") {
    e.preventDefault();
    void toggle();
  } else if (k === "t") {
    addLayer();
  } else if (k === "i") {
    openImport();
  } else if (k === "e") {
    openExport();
  }
}

export default async function mount() {
  booting = true;
  const shared = await decodeSessionHash().catch((e: any) => {
    notice = e.message || "could not load shared URL";
    return null;
  });
  const handoff = sessionStorage.getItem("entrain:loaded-session");
  const loadedScript = sessionStorage.getItem("entrain:loaded-script");
  const autosaved = localStorage.getItem("entrain:studio-autosave");
  if (shared) {
    session = shared;
    afterSessionLoad(
      sessionNeedsLocalFiles(session)
        ? "loaded shared URL; reload local ambience files to match sender"
        : "loaded exact private URL",
    );
  } else if (handoff) {
    session = sanitizeSession(JSON.parse(handoff));
    sessionStorage.removeItem("entrain:loaded-session");
    afterSessionLoad("loaded soundtrack into studio");
  } else if (loadedScript) {
    const decoded = await decodeSessionFromString(loadedScript).catch(() =>
      patternTextToSession(loadedScript),
    );
    session = sanitizeSession(decoded);
    sessionStorage.removeItem("entrain:loaded-script");
    afterSessionLoad("loaded source into studio");
  } else if (autosaved) {
    session = sanitizeSession(JSON.parse(autosaved));
    afterSessionLoad("restored local browser draft");
  } else {
    // Fresh studio: no layers, guidance placeholder visible by default.
    session = { ...defaultSession(), layers: [] };
    selectedLayerId = null;
  }
  booting = false;
  addEventListener("keydown", onStudioKey);
  render(<App />, document.getElementById("studio-root")!);
  syncControlValues();
  requestAnimationFrame(() => paintStage(0));
  scheduleLocalAutosave();
  return () => {
    removeEventListener("keydown", onStudioKey);
    engine.stop();
    render(null, document.getElementById("studio-root")!);
  };
}
