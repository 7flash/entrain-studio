
// beat-scope.ts — beat-sweep gaze target for ENTRAIN.
//
// The stage is NOT an oscilloscope. It is an entrainment fixation target:
// the horizontal area represents a fixed time window (1 s for beats >= 4 Hz,
// auto-extended for slow beats), divided into M slots where M = beats per
// window. A full-height vertical line JUMPS discretely to the next slot on
// every beat — beatHz distinct positions per second for the eye to lock onto.
// Discrete jumps are renderable at 30 Hz on a 60 fps display (each position
// holds >= 2 frames); smooth 30 Hz motion is not.
//
// Beat phase is computed as the exact integral of the linear start→end glide,
//   cycles(t) = b0·t + (b1−b0)·t²/(2·D)   for t <= D,  then hold b1.
// This makes the sweep ground truth for the audio engine: if audible pulses
// drift off the sweep line during a glide, the engine is computing
// sin(2π·b(t)·t) instead of accumulating phase — the classic chirp bug.

export type BeatScopeParams = {
  type: string; // carrier | iso-hard | iso-trap | iso-smooth | monaural | binaural | ...
  beatStartHz: number; // 0 for no-beat layers
  beatEndHz: number;
  durationSec: number; // full soundtrack length (glide span)
  carrierHz: number; // current interpolated carrier, for the corner tag
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

// Pulse envelope over one beat cycle, phase ∈ [0,1).
function envelopeAt(p: BeatScopeParams, phase: number): number {
  const x = ((phase % 1) + 1) % 1;
  switch (p.type) {
    case "iso-hard":
      return x < (p.duty ?? 0.5) ? 1 : 0;
    case "iso-trap": {
      const duty = Math.min(0.9, Math.max(0.1, p.duty ?? 0.45));
      // edge expressed as a fraction of the cycle at the CURRENT beat rate
      const beat = Math.max(0.1, beatAt(p, p.elapsedSec) || 1);
      const edge = Math.min(duty / 2.5, ((p.edgeMs ?? 8) / 1000) * beat);
      if (x >= duty) return 0;
      if (edge <= 0) return 1;
      if (x < edge) return x / edge;
      if (x > duty - edge) return (duty - x) / edge;
      return 1;
    }
    case "iso-smooth":
      return 0.5 * (1 - Math.cos(2 * Math.PI * x));
    case "monaural":
    case "binaural":
      // |cos(π·x)| — for binaural this is the PERCEIVED beat (per-ear
      // amplitude is constant), flagged in the corner tag.
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
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const t = Math.max(0, p.elapsedSec);
  const beatNow = Math.max(0, beatAt(p, t));
  const hasBeat = p.beatStartHz > 0 || p.beatEndHz > 0;
  const top = 34;
  const baseline = h - 30;
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

  // baseline
  ctx.strokeStyle = "rgba(84,220,207,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, baseline);
  ctx.lineTo(w, baseline);
  ctx.stroke();

  if (hasBeat && M > 0) {
    // dim envelope humps — context only, not the gaze target
    const N = Math.min(Math.max(240, w), 900);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * w;
      const phase = ((i / N) * M) % 1;
      const e = envelopeAt(p, phase);
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
      const phase = ((i / N) * M) % 1;
      const y = baseline - envelopeAt(p, phase) * envH * 0.85;
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

    // THE GAZE TARGET: full-height line jumping one slot per beat cycle.
    // Slot index from the exact phase integral, not floor(t·beat).
    const tick = Math.floor(beatCycles(p, t));
    const slot = ((tick % M) + M) % M;
    const x = ((slot + 0.5) / M) * w;
    const alpha = p.running ? 0.95 : 0.4;
    ctx.strokeStyle = hexA(p.color, alpha);
    ctx.lineWidth = 2;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.running ? 16 : 6;
    ctx.beginPath();
    ctx.moveTo(x, top - 14);
    ctx.lineTo(x, baseline);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // head ball for easier tracking
    ctx.fillStyle = hexA(p.color, alpha);
    ctx.beginPath();
    ctx.arc(x, top - 14, 5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // steady carrier / no beat: quiet level line, nothing to track
    const y = baseline - envH * 0.6;
    ctx.strokeStyle = hexA(p.color, p.running ? 0.6 : 0.3);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // corner tag: exact live numbers (compare these against your ears)
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillStyle = "rgba(135,152,180,0.9)";
  const tag = hasBeat
    ? `beat ${beatNow.toFixed(2)} Hz · ${M} marks / ${windowSec}s window${p.type === "binaural" ? " · perceived" : ""}`
    : `${Math.round(p.carrierHz)} Hz steady`;
  ctx.fillText(tag, 10, h - 10);
}
