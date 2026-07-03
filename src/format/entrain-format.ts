export type LayerType =
  | "binaural"
  | "monaural"
  | "iso-smooth"
  | "iso-hard"
  | "carrier"
  | "noise"
  | "sample"
  | "procedural-ambience"
  | "additive"
  | "karplus";
export type Wave = "sine" | "triangle" | "sawtooth";
export type NoiseColor = "white" | "pink" | "brown";
export type ProceduralAmbienceRecipe =
  "rain" | "pink-rain" | "brown-room" | "bowl-drone" | "heavy-rain-bowls";
export type AdditivePartial = {
  ratio: number;
  gain: number;
  decaySec?: number;
  detuneCents?: number;
};
export type InstrumentEnvelope = {
  attackMs: number;
  decayMs: number;
  sustain: number;
  releaseMs: number;
};
export type KarplusConfig = {
  rateHz: number;
  decay: number;
  brightness: number;
  durationSec: number;
};
export type TemplateTier = "free" | "holder" | "pro" | "collector";
export type SessionLoopMode = "repeat" | "hold-last" | "crossfade-repeat";

export const BEAT_LAYER_TYPES: LayerType[] = [
  "binaural",
  "monaural",
  "iso-smooth",
  "iso-hard",
];
export const CARRIER_LAYER_TYPES: LayerType[] = [
  "binaural",
  "monaural",
  "iso-smooth",
  "iso-hard",
  "carrier",
  "additive",
  "karplus",
];
export const TIMBRE_BED_TYPES: LayerType[] = [
  "noise",
  "sample",
  "procedural-ambience",
  "additive",
  "karplus",
];

export const MIX = {
  layerNorm: 0.55,
  masterPeak: 0.75,
  limiterThresholdDb: -1.5,
  limiterRatio: 20,
  limiterAttackSec: 0.003,
  limiterReleaseSec: 0.05,
} as const;

export const BANDS = [
  {
    id: "delta",
    label: "Delta",
    minHz: 0.5,
    maxHz: 4,
    cssVar: "--delta",
    fallback: "#6b7cf0",
  },
  {
    id: "theta",
    label: "Theta",
    minHz: 4,
    maxHz: 8,
    cssVar: "--theta",
    fallback: "#5aa9e6",
  },
  {
    id: "alpha",
    label: "Alpha",
    minHz: 8,
    maxHz: 13,
    cssVar: "--alpha",
    fallback: "#54dccf",
  },
  {
    id: "beta",
    label: "Beta",
    minHz: 13,
    maxHz: 30,
    cssVar: "--beta",
    fallback: "#e6a94a",
  },
  {
    id: "gamma",
    label: "Gamma",
    minHz: 30,
    maxHz: 45,
    cssVar: "--gamma",
    fallback: "#e2726a",
  },
] as const;

export function hasBeat(type: LayerType) {
  return BEAT_LAYER_TYPES.includes(type);
}
export function hasCarrier(type: LayerType) {
  return CARRIER_LAYER_TYPES.includes(type);
}
export function isTimbreBed(type: LayerType) {
  return TIMBRE_BED_TYPES.includes(type);
}

export function sortedKeyframes(pts: Keyframe[] | undefined) {
  return [...(pts || [])].sort((a, b) => a.tMin - b.tMin);
}
export function sampleTimeline(
  pts: Keyframe[] | undefined,
  key: "beatHz" | "gainPct",
  tMin: number,
) {
  const p = sortedKeyframes(pts);
  if (!p.length) return 0;
  if (tMin <= p[0].tMin) return Number(p[0][key] || 0);
  for (let i = 1; i < p.length; i++) {
    if (tMin <= p[i].tMin) {
      const a = p[i - 1],
        b = p[i];
      const f = (tMin - a.tMin) / Math.max(1e-9, b.tMin - a.tMin);
      return (
        Number(a[key] || 0) + (Number(b[key] || 0) - Number(a[key] || 0)) * f
      );
    }
  }
  return Number(p[p.length - 1][key] || 0);
}

export function createLinearGlideKeyframes(
  startBeat: number,
  endBeat: number,
  durationMin: number,
  gainPct = 20,
  steps = 2,
): Keyframe[] {
  const n = Math.max(2, Math.floor(steps));
  if (n === 2)
    return [
      { tMin: 0, beatHz: startBeat, gainPct },
      { tMin: Math.max(0, durationMin), beatHz: endBeat, gainPct },
    ];
  const dt = Math.max(0, durationMin) / (n - 1);
  return Array.from({ length: n }, (_, i) => ({
    tMin: i * dt,
    beatHz: startBeat + (endBeat - startBeat) * (i / (n - 1)),
    gainPct,
  }));
}

export type Keyframe = {
  tMin: number;
  beatHz?: number;
  gainPct: number;
};

export type SampleLoopV1 = {
  mode: "native" | "crossfade";
  startSec?: number;
  endSec?: number;
  crossfadeSec?: number;
};

export type EntrainLayerV1 = {
  id: string;
  type: LayerType;
  carrierHz?: number;
  wave?: Wave;
  noiseColor?: NoiseColor;
  ambienceRecipe?: ProceduralAmbienceRecipe;
  seed?: number; // deterministic seed for procedural ambience, noise beds, and Karplus plucks.
  pan?: number; // -1..1. Binaural layers ignore pan by design.
  panMotion?: { rateHz: number; depth: number }; // rate 0..0.25, depth 0..1.
  sampleName?: string; // Runtime audio buffer is never serialized.
  sampleLoop?: SampleLoopV1; // Crossfaded/manual loop metadata for ambience files.
  partials?: AdditivePartial[]; // Additive synthesis partials; frequency = carrierHz * ratio * detune.
  envelope?: InstrumentEnvelope; // Fast instrument envelope for algorithmic instruments.
  karplus?: KarplusConfig; // Seeded Karplus-Strong pluck bed.
  mute?: boolean;
  solo?: boolean;
  keyframes: Keyframe[];
};

export type EntrainSessionV1 = {
  format: "entrain.session.v1";
  name: string;
  description?: string;
  durationMin: number;
  layers: EntrainLayerV1[];
  loop?: { mode: SessionLoopMode; crossfadeSec?: number };
  export?: { fadeSec?: number; sampleRate?: number };
  notes?: string;
};

export type ProtocolLineageV1 =
  import("./protocol-reference").ProtocolLineageV1;

export type EntrainTemplateV1 = {
  format: "entrain.template.v1";
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  tier: TemplateTier;
  tags: string[];
  minTokens: number;
  unlockNote?: string;
  session: EntrainSessionV1;
  evidenceLevel?: "experimental" | "relaxation" | "focus" | "sleep-support";
  lineage?: ProtocolLineageV1;
  ownerPublicKey?: string;
  creatorName?: string;
  creatorWallet?: string;
  publishedByUser?: boolean;
  market?: {
    kind: "free" | "token" | "paid" | "token_plus_paid";
    priceLamports?: number;
    priceCurrency?: "SOL";
    payoutWallet?: string;
    purchaseCount?: number;
  };
};

function rid(prefix = "layer") {
  const c: any = globalThis.crypto;
  return c?.randomUUID
    ? c.randomUUID()
    : `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultSession(): EntrainSessionV1 {
  return {
    format: "entrain.session.v1",
    name: "Untitled session",
    durationMin: 20,
    loop: { mode: "hold-last", crossfadeSec: 0 },
    layers: [
      {
        id: rid("alpha"),
        type: "binaural",
        carrierHz: 220,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 10, gainPct: 36 },
          { tMin: 20, beatHz: 10, gainPct: 36 },
        ],
      },
      {
        id: rid("pink"),
        type: "noise",
        noiseColor: "pink",
        seed: 1001,
        keyframes: [
          { tMin: 0, gainPct: 18 },
          { tMin: 20, gainPct: 18 },
        ],
      },
    ],
    export: { fadeSec: 4, sampleRate: 44100 },
  };
}

export function sanitizeSession(input: any): EntrainSessionV1 {
  const fallback = defaultSession();
  const s = input && typeof input === "object" ? input : fallback;
  const durationMin = clampNum(
    s.durationMin ?? s.dur ?? fallback.durationMin,
    1,
    180,
  );
  const layers = Array.isArray(s.layers)
    ? s.layers.map((l: any, i: number) => sanitizeLayer(l, durationMin, i))
    : fallback.layers;
  return {
    format: "entrain.session.v1",
    name: String(s.name || fallback.name).slice(0, 120),
    description: s.description
      ? String(s.description).slice(0, 4000)
      : undefined,
    durationMin,
    layers,
    loop: sanitizeLoop(s.loop),
    export: {
      fadeSec: clampNum(s.export?.fadeSec ?? 4, 0, 30),
      sampleRate: [32000, 44100, 48000].includes(Number(s.export?.sampleRate))
        ? Number(s.export.sampleRate)
        : 44100,
    },
    notes: s.notes ? String(s.notes).slice(0, 8000) : undefined,
  };
}

function sanitizeLayer(
  l: any,
  durationMin: number,
  index: number,
): EntrainLayerV1 {
  const types: LayerType[] = [
    "binaural",
    "monaural",
    "iso-smooth",
    "iso-hard",
    "carrier",
    "noise",
    "sample",
    "procedural-ambience",
    "additive",
    "karplus",
  ];
  const waves: Wave[] = ["sine", "triangle", "sawtooth"];
  const noise: NoiseColor[] = ["white", "pink", "brown"];
  const recipes: ProceduralAmbienceRecipe[] = [
    "rain",
    "pink-rain",
    "brown-room",
    "bowl-drone",
    "heavy-rain-bowls",
  ];
  const type: LayerType = types.includes(l?.type) ? l.type : "binaural";
  const noBeat = !hasBeat(type);
  const noCarrier = !hasCarrier(type);
  const keyframesRaw = Array.isArray(l?.keyframes)
    ? l.keyframes
    : Array.isArray(l?.tl)
      ? l.tl.map((k: any) => ({ tMin: k.t, beatHz: k.beat, gainPct: k.gain }))
      : [];
  const keyframes = (
    keyframesRaw.length
      ? keyframesRaw
      : [
          { tMin: 0, beatHz: 10, gainPct: 35 },
          { tMin: durationMin, beatHz: 10, gainPct: 35 },
        ]
  )
    .map((k: any) => ({
      tMin: clampNum(k.tMin ?? k.t ?? 0, 0, durationMin),
      beatHz: noBeat ? undefined : clampNum(k.beatHz ?? k.beat ?? 10, 0.1, 45),
      gainPct: clampNum(k.gainPct ?? k.gain ?? 35, 0, 100),
    }))
    .sort((a: Keyframe, b: Keyframe) => a.tMin - b.tMin);
  const staticPan =
    type === "binaural" ? undefined : clampNum(l?.pan ?? 0, -1, 1);
  const rateHz = clampNum(l?.panMotion?.rateHz ?? l?.panRate ?? 0, 0, 0.25);
  const depth = clampNum(
    l?.panMotion?.depth ?? (l?.panDepth != null ? Number(l.panDepth) / 100 : 0),
    0,
    1,
  );
  const loop = sanitizeSampleLoop(l?.sampleLoop);
  const partials = sanitizePartials(l?.partials, type);
  const envelope = sanitizeEnvelope(l?.envelope);
  const karplus = sanitizeKarplus(l?.karplus);
  return {
    id: String(l?.id || rid(`layer-${index}`)).slice(0, 80),
    type,
    carrierHz: noCarrier
      ? undefined
      : clampNum(
          l?.carrierHz ?? l?.carrier ?? (type === "additive" ? 136.1 : 220),
          20,
          2000,
        ),
    wave: waves.includes(l?.wave) ? l.wave : "sine",
    noiseColor: noise.includes(l?.noiseColor) ? l.noiseColor : "pink",
    ambienceRecipe:
      type === "procedural-ambience" && recipes.includes(l?.ambienceRecipe)
        ? l.ambienceRecipe
        : type === "procedural-ambience"
          ? "pink-rain"
          : undefined,
    seed:
      type === "procedural-ambience" || type === "noise" || type === "karplus"
        ? Math.floor(
            clampNum(l?.seed ?? stableLayerSeed(l, index), 1, 2147483646),
          )
        : undefined,
    pan: staticPan,
    panMotion:
      type === "binaural" || rateHz <= 0 ? undefined : { rateHz, depth },
    sampleName:
      type === "sample" ? String(l?.sampleName || "").slice(0, 240) : undefined,
    sampleLoop: type === "sample" ? loop : undefined,
    partials: type === "additive" ? partials : undefined,
    envelope: type === "additive" || type === "karplus" ? envelope : undefined,
    karplus: type === "karplus" ? karplus : undefined,
    mute: !!l?.mute,
    solo: !!l?.solo,
    keyframes,
  };
}

function sanitizePartials(
  value: any,
  type: LayerType,
): AdditivePartial[] | undefined {
  if (type !== "additive") return undefined;
  const raw =
    Array.isArray(value) && value.length
      ? value
      : [
          { ratio: 1, gain: 1 },
          { ratio: 1.5, gain: 0.5 },
          { ratio: 2.001, gain: 0.32 },
        ];
  return raw
    .slice(0, 16)
    .map((p: any) => ({
      ratio: clampNum(p?.ratio ?? 1, 0.05, 24),
      gain: clampNum(p?.gain ?? 0.25, 0, 1),
      decaySec:
        p?.decaySec == null ? undefined : clampNum(p.decaySec, 0.05, 600),
      detuneCents:
        p?.detuneCents == null
          ? undefined
          : clampNum(p.detuneCents, -1200, 1200),
    }))
    .filter((p: AdditivePartial) => p.gain > 0 && p.ratio > 0);
}

function sanitizeEnvelope(env: any): InstrumentEnvelope {
  return {
    attackMs: clampNum(env?.attackMs ?? 800, 0, 30000),
    decayMs: clampNum(env?.decayMs ?? 2000, 0, 120000),
    sustain: clampNum(env?.sustain ?? 0.85, 0, 1),
    releaseMs: clampNum(env?.releaseMs ?? 3000, 0, 120000),
  };
}

function sanitizeKarplus(cfg: any): KarplusConfig {
  return {
    rateHz: clampNum(cfg?.rateHz ?? 0.08, 0.005, 2),
    decay: clampNum(cfg?.decay ?? 0.996, 0.9, 0.9999),
    brightness: clampNum(cfg?.brightness ?? 0.5, 0, 1),
    durationSec: clampNum(cfg?.durationSec ?? 6, 1, 30),
  };
}

function sanitizeSampleLoop(loop: any): SampleLoopV1 {
  const mode = loop?.mode === "crossfade" ? "crossfade" : "native";
  return {
    mode,
    startSec: clampNum(loop?.startSec ?? 0, 0, 24 * 60 * 60),
    endSec:
      loop?.endSec == null ? undefined : clampNum(loop.endSec, 0, 24 * 60 * 60),
    crossfadeSec: clampNum(
      loop?.crossfadeSec ?? (mode === "crossfade" ? 2 : 0),
      0,
      30,
    ),
  };
}

function sanitizeLoop(loop: any) {
  const modes: SessionLoopMode[] = ["repeat", "hold-last", "crossfade-repeat"];
  const mode: SessionLoopMode = modes.includes(loop?.mode)
    ? loop.mode
    : "hold-last";
  return {
    mode,
    crossfadeSec: clampNum(
      loop?.crossfadeSec ?? (mode === "crossfade-repeat" ? 8 : 0),
      0,
      60,
    ),
  };
}

function stableLayerSeed(l: any, index: number) {
  const raw =
    String(l?.id || l?.sampleName || l?.noiseColor || l?.type || "") +
    ":" +
    index;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 2147483645) + 1;
}

function clampNum(v: any, a: number, b: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : a;
}

export function cleanForShare(session: EntrainSessionV1) {
  const s = sanitizeSession(session);
  s.layers = s.layers.map((l) => ({
    ...l,
    sampleName: l.sampleName || undefined,
  }));
  return s;
}

export type SoundtrackAccessTier = TemplateTier;

export type EntrainSoundtrackV1 = {
  format: "entrain.soundtrack.v1";
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  tier: SoundtrackAccessTier;
  tags: string[];
  minTokens: number;
  unlockNote?: string;
  session: EntrainSessionV1;
  status?: "draft" | "published" | "archived";
};

export type SessionSummary = {
  durationMin: number;
  layerCount: number;
  beatLayerCount: number;
  sampleLayerCount: number;
  proceduralAmbienceLayerCount: number;
  bands: string[];
  hasPanMotion: boolean;
  hasCrossfadedSamples: boolean;
  headphonesRequired: boolean;
  loopMode: SessionLoopMode;
};

export function summarizeSession(input: any): SessionSummary {
  const s = sanitizeSession(input);
  const bands = new Set<string>();
  let beatLayerCount = 0;
  let sampleLayerCount = 0;
  let proceduralAmbienceLayerCount = 0;
  let hasPanMotion = false;
  let hasCrossfadedSamples = false;
  let headphonesRequired = false;
  for (const layer of s.layers) {
    if (layer.type === "binaural") headphonesRequired = true;
    if (hasBeat(layer.type)) {
      beatLayerCount++;
      for (const k of layer.keyframes)
        if (typeof k.beatHz === "number") bands.add(bandForHz(k.beatHz));
    }
    if (layer.type === "sample") {
      sampleLayerCount++;
      if (layer.sampleLoop?.mode === "crossfade") hasCrossfadedSamples = true;
    }
    if (layer.type === "procedural-ambience") proceduralAmbienceLayerCount++;
    if ((layer.panMotion?.rateHz || 0) > 0) hasPanMotion = true;
  }
  return {
    durationMin: s.durationMin,
    layerCount: s.layers.length,
    beatLayerCount,
    sampleLayerCount,
    proceduralAmbienceLayerCount,
    bands: [...bands],
    hasPanMotion,
    hasCrossfadedSamples,
    headphonesRequired,
    loopMode: s.loop?.mode || "hold-last",
  };
}

export function bandForHz(hz: number) {
  const band =
    BANDS.find((b) => hz >= b.minHz && hz < b.maxHz) || BANDS[BANDS.length - 1];
  return band.id;
}

export function sessionNeedsLocalFiles(input: any) {
  return sanitizeSession(input).layers.some((layer) => layer.type === "sample");
}

export function publicSessionCopy(input: any) {
  const s = sanitizeSession(input);
  s.layers = s.layers.map((layer) =>
    layer.type === "sample"
      ? { ...layer, sampleName: layer.sampleName || "reload local audio file" }
      : layer,
  );
  return s;
}
