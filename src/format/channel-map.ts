import {
  sanitizeSession,
  type EntrainSessionV1,
  type EntrainLayerV1,
  type Keyframe,
} from "./entrain-format";

export type SignalMapPoint = {
  tMin: number;
  gainPct: number;
  gainDb: number;
  beatHz?: number;
  carrierHz?: number;
  leftHz?: number;
  rightHz?: number;
  lfoHz?: number;
};

export type LayerSignalMap = {
  id: string;
  type: string;
  label: string;
  formula: string;
  requiresHeadphones: boolean;
  panNote?: string;
  bed?: string;
  points: SignalMapPoint[];
};

export type SessionSignalMap = {
  name: string;
  durationMin: number;
  loopMode: string;
  layers: LayerSignalMap[];
  headphonesRequired: boolean;
  portable: boolean;
};

export function signalMapForSession(input: any): SessionSignalMap {
  const session = sanitizeSession(input);
  const layers = session.layers.map(signalMapForLayer);
  return {
    name: session.name,
    durationMin: session.durationMin,
    loopMode: session.loop?.mode || "hold-last",
    layers,
    headphonesRequired: layers.some((l) => l.requiresHeadphones),
    portable: !session.layers.some((l) => l.type === "sample"),
  };
}

export function signalMapForLayer(layer: EntrainLayerV1): LayerSignalMap {
  const keyframes = [...(layer.keyframes || [])].sort(
    (a, b) => a.tMin - b.tMin,
  );
  if (layer.type === "binaural") {
    const carrier = Number(layer.carrierHz || 220);
    return {
      id: layer.id,
      type: layer.type,
      label: `Binaural · ${fmtHz(carrier)} carrier`,
      formula: "left = carrier − beat/2 · right = carrier + beat/2",
      requiresHeadphones: true,
      panNote:
        "Pan intentionally disabled; binaural separation must remain hard L/R.",
      points: keyframes.map((k) => binauralPoint(k, carrier)),
    };
  }
  if (layer.type === "monaural") {
    const carrier = Number(layer.carrierHz || 220);
    return {
      id: layer.id,
      type: layer.type,
      label: `Monaural · ${fmtHz(carrier)} carrier`,
      formula: "two tones are summed before stereo output: carrier ± beat/2",
      requiresHeadphones: false,
      panNote: panNote(layer),
      points: keyframes.map((k) => binauralPoint(k, carrier)),
    };
  }
  if (layer.type === "iso-smooth" || layer.type === "iso-hard") {
    const carrier = Number(layer.carrierHz || 220);
    return {
      id: layer.id,
      type: layer.type,
      label: `${layer.type === "iso-hard" ? "Hard" : "Smooth"} isochronic · ${fmtHz(carrier)} carrier`,
      formula: "carrier tone amplitude is modulated by beat-rate LFO",
      requiresHeadphones: false,
      panNote: panNote(layer),
      points: keyframes.map((k) => ({
        tMin: round(k.tMin),
        gainPct: round(k.gainPct),
        gainDb: gainPctToDb(k.gainPct),
        carrierHz: carrier,
        beatHz: k.beatHz,
        lfoHz: k.beatHz,
      })),
    };
  }
  if (layer.type === "carrier") {
    const carrier = Number(layer.carrierHz || 220);
    return {
      id: layer.id,
      type: layer.type,
      label: `Plain carrier · ${fmtHz(carrier)}`,
      formula: "single oscillator, no beat modulation",
      requiresHeadphones: false,
      panNote: panNote(layer),
      points: keyframes.map((k) => ({
        tMin: round(k.tMin),
        gainPct: round(k.gainPct),
        gainDb: gainPctToDb(k.gainPct),
        carrierHz: carrier,
      })),
    };
  }

  if (layer.type === "additive") {
    const base = Number(layer.carrierHz || 136.1);
    return {
      id: layer.id,
      type: layer.type,
      label: `Additive drone · ${fmtHz(base)} base`,
      formula:
        "sum of deterministic sine partials: Σ sin(2π · base · ratio · detune · t) · gain",
      requiresHeadphones: false,
      panNote: panNote(layer),
      bed: `${(layer.partials || []).length || 3} partials`,
      points: keyframes.map((k) => ({
        tMin: round(k.tMin),
        gainPct: round(k.gainPct),
        gainDb: gainPctToDb(k.gainPct),
        carrierHz: base,
      })),
    };
  }
  if (layer.type === "karplus") {
    const base = Number(layer.carrierHz || 220);
    return {
      id: layer.id,
      type: layer.type,
      label: `Karplus pluck bed · ${fmtHz(base)}`,
      formula:
        "seeded noise burst in a tuned delay line with filtered feedback",
      requiresHeadphones: false,
      panNote: panNote(layer),
      bed: `rate ${layer.karplus?.rateHz || 0.08} Hz · seed ${layer.seed || 4242}`,
      points: keyframes.map((k) => ({
        tMin: round(k.tMin),
        gainPct: round(k.gainPct),
        gainDb: gainPctToDb(k.gainPct),
        carrierHz: base,
      })),
    };
  }
  if (layer.type === "noise") {
    return {
      id: layer.id,
      type: layer.type,
      label: `${layer.noiseColor || "pink"} noise mask`,
      formula:
        "procedural noise bed, identical left/right before optional pan path",
      requiresHeadphones: false,
      panNote: panNote(layer),
      bed: layer.noiseColor || "pink",
      points: keyframes.map(bedPoint),
    };
  }
  if (layer.type === "procedural-ambience") {
    return {
      id: layer.id,
      type: layer.type,
      label: `${layer.ambienceRecipe || "pink-rain"} ambience · seed ${layer.seed || 1337}`,
      formula: "deterministic procedural ambience bed; portable in JSON",
      requiresHeadphones: false,
      panNote: panNote(layer),
      bed: layer.ambienceRecipe || "pink-rain",
      points: keyframes.map(bedPoint),
    };
  }
  return {
    id: layer.id,
    type: layer.type,
    label: `Local ambience file · ${layer.sampleName || "reload file"}`,
    formula: `runtime AudioBuffer loop (${layer.sampleLoop?.mode || "native"}), not serialized in JSON`,
    requiresHeadphones: false,
    panNote: panNote(layer),
    bed: layer.sampleName || "local file",
    points: keyframes.map(bedPoint),
  };
}

function binauralPoint(k: Keyframe, carrier: number): SignalMapPoint {
  const beat = Number(k.beatHz || 0);
  return {
    tMin: round(k.tMin),
    gainPct: round(k.gainPct),
    gainDb: gainPctToDb(k.gainPct),
    beatHz: round(beat),
    carrierHz: round(carrier),
    leftHz: round(carrier - beat / 2),
    rightHz: round(carrier + beat / 2),
  };
}

function bedPoint(k: Keyframe): SignalMapPoint {
  return {
    tMin: round(k.tMin),
    gainPct: round(k.gainPct),
    gainDb: gainPctToDb(k.gainPct),
  };
}

export function gainPctToDb(gainPct: number) {
  const amp = Math.max(0, Math.min(1, Number(gainPct) / 100));
  return amp <= 0 ? -Infinity : round(20 * Math.log10(amp));
}

export function fmtDb(db: number) {
  return db === -Infinity
    ? "-∞ dB"
    : `${db.toFixed(Math.abs(db) < 10 ? 1 : 0)} dB`;
}

export function fmtHz(hz?: number) {
  if (hz == null || !Number.isFinite(hz)) return "—";
  return `${round(hz).toString()} Hz`;
}

export function formatSignalPoint(p: SignalMapPoint) {
  const core =
    p.leftHz != null && p.rightHz != null
      ? `L ${fmtHz(p.leftHz)} · R ${fmtHz(p.rightHz)}`
      : p.carrierHz != null && p.lfoHz != null
        ? `${fmtHz(p.carrierHz)} carrier · ${fmtHz(p.lfoHz)} LFO`
        : p.carrierHz != null
          ? `${fmtHz(p.carrierHz)}`
          : "bed";
  return `${p.tMin}m: ${core} · ${p.gainPct}% (${fmtDb(p.gainDb)})`;
}

export function signalMapText(input: any) {
  const map = signalMapForSession(input);
  return [
    `${map.name} · ${map.durationMin}m · loop ${map.loopMode}`,
    ...map.layers.flatMap((layer) => [
      `${layer.label}`,
      `  ${layer.formula}`,
      ...layer.points.map((p) => `  - ${formatSignalPoint(p)}`),
    ]),
  ].join("\n");
}

function panNote(layer: EntrainLayerV1) {
  const pan = Number(layer.pan || 0);
  const motion = layer.panMotion?.rateHz
    ? ` · pan motion ${layer.panMotion.rateHz} Hz × ${layer.panMotion.depth}`
    : "";
  if (!pan && !motion) return undefined;
  const staticLabel =
    pan < 0
      ? `${Math.abs(pan).toFixed(2)}L`
      : pan > 0
        ? `${pan.toFixed(2)}R`
        : "center";
  return `Static pan ${staticLabel}${motion}`;
}

function round(n: number) {
  return Math.round(Number(n) * 1000) / 1000;
}
