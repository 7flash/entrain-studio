// beat-scope.ts — beat-sweep gaze target for ENTRAIN.
//
// The stage is NOT an oscilloscope. It is an entrainment fixation target:
// the horizontal area represents a fixed time window (1 s for beats >= 4 Hz,
// auto-extended for slow beats), divided into M slots where M = beats per
// window. A full-height vertical line JUMPS discretely to the next slot on
// every beat — beatHz distinct positions per second for the eye to lock onto.
// Discrete jumps are renderable at 30 Hz on a 60 fps display (each position
// holds >= 2 frames); smooth 30 Hz motion is not. Above ~30 Hz the display
// itself becomes the bottleneck — the math stays exact, frames just alias.
//
// Beat phase is computed as the exact integral of the linear start→end glide,
//   cycles(t) = b0·t + (b1−b0)·t²/(2·D)   for t <= D,  then hold b1.
// This makes the sweep ground truth for the audio engine: if audible pulses
// drift off the sweep line during a glide, the engine is computing
// sin(2π·b(t)·t) instead of accumulating phase — the classic chirp bug.
//
// PERFORMANCE: the static scenery (envelope humps, slot dots, baseline) is
// rendered once into an offscreen canvas and re-blitted each frame; only the
// jumping line is drawn live, with a two-stroke fake glow instead of
// shadowBlur. Frames where the slot index did not change are skipped
// entirely. This keeps 40+ Hz beats at full frame rate.

export type BeatScopeParams = {
  type: string; // carrier | iso-hard | iso-trap | iso-smooth | monaural | binaural | ...
  beatStartHz: number; // 0 for no-beat layers
  beatEndHz: number;
  durationSec: number; // full soundtrack length (glide span)
  carrierHz: number; // current interpolated carrier
  gainPct: number; // current interpolated gain
  duty?: number; // iso-trap
  edgeMs?: number; // iso-trap
  elapsedSec: number;
  running: boolean;
  color: string; // band color hex
};

// Instantaneous beat rate at time t (linear glide, hold-last after D).
export function beatAt(p: BeatScopeParams, t: number): number {
  const D = Math.max(0.001, p.durationSec);
  if (t >= D) return p.beatEndHz;
  return p.beatStartHz + ((p.beatEndHz - p.beatStartHz) * t) / D;
}

// Exact accumulated beat cycles up to time t (phase integral).
export function beatCycles(p: BeatScopeParams, t: number): number {
  const D = Math.max(0.001, p.durationSec);
  const b0 = p.beatStartHz;
  const b1 = p.beatEndHz;
  if (t <= D) return b0 * t + ((b1 - b0) * t * t) / (2 * D);
  const atD = b0 * D + ((b1 - b0) * D) / 2;
  return atD + b1 * (t - D);
}

// Pulse envelope over one beat cycle — pure, phase x ∈ [0,1),
// edgeFrac = attack/release expressed as a fraction of the cycle.
function envAt(type: string, x: number, duty: number, edgeFrac: number) {
  switch (type) {
    case "iso-hard":
      return x < duty ? 1 : 0;
    case "iso-trap": {
      if (x >= duty) return 0;
      if (edgeFrac <= 0) return 1;
      if (x < edgeFrac) return x / edgeFrac;
      if (x > duty - edgeFrac) return (duty - x) / edgeFrac;
      return 1;
    }
    case "iso-smooth":
      return 0.5 * (1 - Math.cos(2 * Math.PI * x));
    case "monaural":
    case "binaural":
      // |cos(π·x)| — for binaural this is the PERCEIVED beat (per-ear
      // amplitude is constant); drawn dashed to flag that.
      return Math.abs(Math.cos(Math.PI * x));
    default:
      return 1;
  }
}

function hexA(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  const n = m ? parseInt(m[1], 16) : 0x54dccf;
  const clamped = Math.max(0, Math.min(1, a));
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamped})`;
}

// Offscreen scenery cache + last-frame signature, per visible canvas.
const bgCache = new WeakMap<
  HTMLCanvasElement,
  { off: HTMLCanvasElement; key: string }
>();
const lastFrame = new WeakMap<HTMLCanvasElement, string>();

function drawScenery(
  off: HTMLCanvasElement,
  dpr: number,
  w: number,
  h: number,
  p: BeatScopeParams,
  M: number,
  duty: number,
  edgeFrac: number,
  baseline: number,
  envH: number,
) {
  off.width = Math.round(w * dpr);
  off.height = Math.round(h * dpr);
  const ctx = off.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // baseline
  ctx.strokeStyle = "rgba(84,220,207,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, baseline);
  ctx.lineTo(w, baseline);
  ctx.stroke();

  if (M <= 0) return;

  // dim envelope humps — context only, not the gaze target.
  // Path cost lives here in the cache render, not per frame.
  const N = Math.min(Math.max(240, w), 900);
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * w;
    const e = envAt(p.type, ((i / N) * M) % 1, duty, edgeFrac);
    const y = baseline - e * envH * 0.85;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.lineTo(w, baseline);
  ctx.lineTo(0, baseline);
  ctx.closePath();
  ctx.fillStyle = hexA(p.color, 0.055);
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * w;
    const y =
      baseline - envAt(p.type, ((i / N) * M) % 1, duty, edgeFrac) * envH * 0.85;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.strokeStyle = hexA(p.color, 0.24);
  if (p.type === "binaural") ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  // slot dots on the baseline — the "ruler" of upcoming positions
  ctx.fillStyle = "rgba(135,152,180,0.4)";
  for (let k = 0; k < M; k++) {
    const x = ((k + 0.5) / M) * w;
    ctx.beginPath();
    ctx.arc(x, baseline, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawBeatScope(canvas: HTMLCanvasElement, p: BeatScopeParams) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    lastFrame.delete(canvas); // resize invalidates skipped-frame state
  }

  const t = Math.max(0, p.elapsedSec);
  const beatNow = Math.max(0, beatAt(p, t));
  const hasBeat = p.beatStartHz > 0 || p.beatEndHz > 0;
  const top = 34;
  const baseline = h - 18;
  const envH = Math.max(20, baseline - top);

  // window length: 1 s when the beat is fast enough, extended for slow beats
  // so at least ~4 marks fit; capped at 16 s.
  const windowSec = !hasBeat
    ? 1
    : beatNow >= 4
      ? 1
      : Math.min(16, Math.max(1, Math.ceil(4 / Math.max(0.25, beatNow))));
  // slots per window — re-quantized as the beat glides, so a descent is
  // visible as the mark grid thinning out.
  const M = hasBeat ? Math.max(1, Math.round(beatNow * windowSec)) : 0;

  const duty = Math.min(0.9, Math.max(0.1, p.duty ?? 0.45));
  // edge as a fraction of the cycle at the current rate, quantized so the
  // cache key stays stable during glides.
  const edgeFrac =
    p.type === "iso-trap"
      ? Math.round(
          Math.min(
            duty / 2.5,
            ((p.edgeMs ?? 8) / 1000) * Math.max(0.1, beatNow || 1),
          ) * 200,
        ) / 200
      : 0;

  const tick = hasBeat && M > 0 ? Math.floor(beatCycles(p, t)) : 0;
  const slot = M > 0 ? ((tick % M) + M) % M : 0;

  const sceneKey = `${w}x${h}@${dpr}|${M}|${windowSec}|${p.type}|${duty}|${edgeFrac}|${p.color}|${p.running ? 1 : 0}|${hasBeat ? 1 : 0}`;
  const frameKey = `${sceneKey}#${slot}`;
  if (lastFrame.get(canvas) === frameKey) return; // nothing moved — skip
  lastFrame.set(canvas, frameKey);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (hasBeat && M > 0) {
    // blit cached scenery, rebuilding only when the scene key changes
    let cache = bgCache.get(canvas);
    if (!cache || cache.key !== sceneKey) {
      const off = cache?.off || document.createElement("canvas");
      drawScenery(off, dpr, w, h, p, M, duty, edgeFrac, baseline, envH);
      cache = { off, key: sceneKey };
      bgCache.set(canvas, cache);
    }
    ctx.drawImage(cache.off, 0, 0, w, h);

    // THE GAZE TARGET: full-height line jumping one slot per beat cycle.
    // Slot index comes from the exact phase integral, not floor(t·beat).
    // Fake glow: wide translucent stroke under a bright core — cheap,
    // unlike shadowBlur which forces a per-frame gaussian pass.
    const x = ((slot + 0.5) / M) * w;
    const alpha = p.running ? 0.95 : 0.4;
    ctx.strokeStyle = hexA(p.color, alpha * 0.18);
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x, top - 4);
    ctx.lineTo(x, baseline);
    ctx.stroke();
    ctx.strokeStyle = hexA(p.color, alpha);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, top - 4);
    ctx.lineTo(x, baseline);
    ctx.stroke();
    // head ball for easier tracking
    ctx.fillStyle = hexA(p.color, alpha * 0.2);
    ctx.beginPath();
    ctx.arc(x, top - 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hexA(p.color, alpha);
    ctx.beginPath();
    ctx.arc(x, top - 4, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // steady carrier / no beat: quiet level line, nothing to track
    const y = baseline - envH * 0.6;
    ctx.strokeStyle = "rgba(84,220,207,0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, baseline);
    ctx.lineTo(w, baseline);
    ctx.stroke();
    ctx.strokeStyle = hexA(p.color, p.running ? 0.6 : 0.3);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}
