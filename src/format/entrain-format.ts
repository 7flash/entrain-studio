export type LayerType = 'binaural' | 'monaural' | 'iso-smooth' | 'iso-hard' | 'carrier' | 'noise' | 'sample' | 'procedural-ambience';
export type Wave = 'sine' | 'triangle' | 'sawtooth';
export type NoiseColor = 'white' | 'pink' | 'brown';
export type ProceduralAmbienceRecipe = 'rain' | 'pink-rain' | 'brown-room' | 'bowl-drone';
export type TemplateTier = 'free' | 'holder' | 'pro' | 'collector';
export type SessionLoopMode = 'repeat' | 'hold-last' | 'crossfade-repeat';

export type Keyframe = {
  tMin: number;
  beatHz?: number;
  gainPct: number;
};

export type SampleLoopV1 = {
  mode: 'native' | 'crossfade';
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
  seed?: number;
  pan?: number; // -1..1. Binaural layers ignore pan by design.
  panMotion?: { rateHz: number; depth: number }; // rate 0..0.25, depth 0..1.
  sampleName?: string; // Runtime audio buffer is never serialized.
  sampleLoop?: SampleLoopV1; // Crossfaded/manual loop metadata for ambience files.
  mute?: boolean;
  solo?: boolean;
  keyframes: Keyframe[];
};

export type EntrainSessionV1 = {
  format: 'entrain.session.v1';
  name: string;
  description?: string;
  durationMin: number;
  layers: EntrainLayerV1[];
  loop?: { mode: SessionLoopMode; crossfadeSec?: number };
  export?: { fadeSec?: number; sampleRate?: number };
  notes?: string;
};

export type ProtocolLineageV1 = import('./protocol-reference').ProtocolLineageV1;

export type EntrainTemplateV1 = {
  format: 'entrain.template.v1';
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
  evidenceLevel?: 'experimental' | 'relaxation' | 'focus' | 'sleep-support';
  lineage?: ProtocolLineageV1;
  ownerPublicKey?: string;
  creatorName?: string;
  creatorWallet?: string;
  publishedByUser?: boolean;
  market?: {
    kind: 'free' | 'token' | 'paid' | 'token_plus_paid';
    priceLamports?: number;
    priceCurrency?: 'SOL';
    payoutWallet?: string;
    purchaseCount?: number;
  };
};

function rid(prefix = 'layer') {
  const c: any = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultSession(): EntrainSessionV1 {
  return {
    format: 'entrain.session.v1',
    name: 'Untitled session',
    durationMin: 20,
    loop: { mode: 'hold-last', crossfadeSec: 0 },
    layers: [
      { id: rid('alpha'), type: 'binaural', carrierHz: 220, wave: 'sine', keyframes: [{ tMin: 0, beatHz: 10, gainPct: 36 }, { tMin: 20, beatHz: 10, gainPct: 36 }] },
      { id: rid('pink'), type: 'noise', noiseColor: 'pink', keyframes: [{ tMin: 0, gainPct: 18 }, { tMin: 20, gainPct: 18 }] }
    ],
    export: { fadeSec: 4, sampleRate: 44100 }
  };
}

export function sanitizeSession(input: any): EntrainSessionV1 {
  const fallback = defaultSession();
  const s = input && typeof input === 'object' ? input : fallback;
  const durationMin = clampNum(s.durationMin ?? s.dur ?? fallback.durationMin, 1, 180);
  const layers = Array.isArray(s.layers) ? s.layers.map((l: any, i: number) => sanitizeLayer(l, durationMin, i)) : fallback.layers;
  return {
    format: 'entrain.session.v1',
    name: String(s.name || fallback.name).slice(0, 120),
    description: s.description ? String(s.description).slice(0, 4000) : undefined,
    durationMin,
    layers,
    loop: sanitizeLoop(s.loop),
    export: {
      fadeSec: clampNum(s.export?.fadeSec ?? 4, 0, 30),
      sampleRate: [32000, 44100, 48000].includes(Number(s.export?.sampleRate)) ? Number(s.export.sampleRate) : 44100,
    },
    notes: s.notes ? String(s.notes).slice(0, 8000) : undefined,
  };
}

function sanitizeLayer(l: any, durationMin: number, index: number): EntrainLayerV1 {
  const types: LayerType[] = ['binaural','monaural','iso-smooth','iso-hard','carrier','noise','sample','procedural-ambience'];
  const waves: Wave[] = ['sine','triangle','sawtooth'];
  const noise: NoiseColor[] = ['white','pink','brown'];
  const recipes: ProceduralAmbienceRecipe[] = ['rain','pink-rain','brown-room','bowl-drone'];
  const type: LayerType = types.includes(l?.type) ? l.type : 'binaural';
  const noBeat = type === 'noise' || type === 'carrier' || type === 'sample' || type === 'procedural-ambience';
  const noCarrier = type === 'noise' || type === 'sample' || type === 'procedural-ambience';
  const keyframesRaw = Array.isArray(l?.keyframes) ? l.keyframes : Array.isArray(l?.tl) ? l.tl.map((k: any) => ({ tMin: k.t, beatHz: k.beat, gainPct: k.gain })) : [];
  const keyframes = (keyframesRaw.length ? keyframesRaw : [{ tMin: 0, beatHz: 10, gainPct: 35 }, { tMin: durationMin, beatHz: 10, gainPct: 35 }])
    .map((k: any) => ({
      tMin: clampNum(k.tMin ?? k.t ?? 0, 0, durationMin),
      beatHz: noBeat ? undefined : clampNum(k.beatHz ?? k.beat ?? 10, 0.1, 45),
      gainPct: clampNum(k.gainPct ?? k.gain ?? 35, 0, 100),
    }))
    .sort((a: Keyframe, b: Keyframe) => a.tMin - b.tMin);
  const staticPan = type === 'binaural' ? undefined : clampNum(l?.pan ?? 0, -1, 1);
  const rateHz = clampNum(l?.panMotion?.rateHz ?? l?.panRate ?? 0, 0, 0.25);
  const depth = clampNum(l?.panMotion?.depth ?? (l?.panDepth != null ? Number(l.panDepth) / 100 : 0), 0, 1);
  const loop = sanitizeSampleLoop(l?.sampleLoop);
  return {
    id: String(l?.id || rid(`layer-${index}`)).slice(0, 80),
    type,
    carrierHz: noCarrier ? undefined : clampNum(l?.carrierHz ?? l?.carrier ?? 220, 20, 2000),
    wave: waves.includes(l?.wave) ? l.wave : 'sine',
    noiseColor: noise.includes(l?.noiseColor) ? l.noiseColor : 'pink',
    ambienceRecipe: type === 'procedural-ambience' && recipes.includes(l?.ambienceRecipe) ? l.ambienceRecipe : (type === 'procedural-ambience' ? 'pink-rain' : undefined),
    seed: type === 'procedural-ambience' ? Math.floor(clampNum(l?.seed ?? 1337, 1, 2147483646)) : undefined,
    pan: staticPan,
    panMotion: type === 'binaural' || rateHz <= 0 ? undefined : { rateHz, depth },
    sampleName: type === 'sample' ? String(l?.sampleName || '').slice(0, 240) : undefined,
    sampleLoop: type === 'sample' ? loop : undefined,
    mute: !!l?.mute,
    solo: !!l?.solo,
    keyframes,
  };
}

function sanitizeSampleLoop(loop: any): SampleLoopV1 {
  const mode = loop?.mode === 'crossfade' ? 'crossfade' : 'native';
  return {
    mode,
    startSec: clampNum(loop?.startSec ?? 0, 0, 24 * 60 * 60),
    endSec: loop?.endSec == null ? undefined : clampNum(loop.endSec, 0, 24 * 60 * 60),
    crossfadeSec: clampNum(loop?.crossfadeSec ?? (mode === 'crossfade' ? 2 : 0), 0, 30),
  };
}

function sanitizeLoop(loop: any) {
  const modes: SessionLoopMode[] = ['repeat','hold-last','crossfade-repeat'];
  const mode: SessionLoopMode = modes.includes(loop?.mode) ? loop.mode : 'hold-last';
  return { mode, crossfadeSec: clampNum(loop?.crossfadeSec ?? (mode === 'crossfade-repeat' ? 8 : 0), 0, 60) };
}

function clampNum(v: any, a: number, b: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : a;
}

export function cleanForShare(session: EntrainSessionV1) {
  const s = sanitizeSession(session);
  s.layers = s.layers.map((l) => ({ ...l, sampleName: l.sampleName || undefined }));
  return s;
}

export type SoundtrackAccessTier = TemplateTier;

export type EntrainSoundtrackV1 = {
  format: 'entrain.soundtrack.v1';
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
  status?: 'draft' | 'published' | 'archived';
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
    if (layer.type === 'binaural') headphonesRequired = true;
    if (layer.type !== 'noise' && layer.type !== 'carrier' && layer.type !== 'sample' && layer.type !== 'procedural-ambience') {
      beatLayerCount++;
      for (const k of layer.keyframes) if (typeof k.beatHz === 'number') bands.add(bandForHz(k.beatHz));
    }
    if (layer.type === 'sample') {
      sampleLayerCount++;
      if (layer.sampleLoop?.mode === 'crossfade') hasCrossfadedSamples = true;
    }
    if (layer.type === 'procedural-ambience') proceduralAmbienceLayerCount++;
    if ((layer.panMotion?.rateHz || 0) > 0) hasPanMotion = true;
  }
  return { durationMin: s.durationMin, layerCount: s.layers.length, beatLayerCount, sampleLayerCount, proceduralAmbienceLayerCount, bands: [...bands], hasPanMotion, hasCrossfadedSamples, headphonesRequired, loopMode: s.loop?.mode || 'hold-last' };
}

export function bandForHz(hz: number) {
  if (hz < 4) return 'delta';
  if (hz < 8) return 'theta';
  if (hz < 13) return 'alpha';
  if (hz < 30) return 'beta';
  return 'gamma';
}

export function sessionNeedsLocalFiles(input: any) {
  return sanitizeSession(input).layers.some((layer) => layer.type === 'sample');
}

export function publicSessionCopy(input: any) {
  const s = sanitizeSession(input);
  s.layers = s.layers.map((layer) => layer.type === 'sample' ? { ...layer, sampleName: layer.sampleName || 'reload local audio file' } : layer);
  return s;
}
