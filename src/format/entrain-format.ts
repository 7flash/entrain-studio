export type LayerType = 'binaural' | 'monaural' | 'iso-smooth' | 'iso-hard' | 'carrier' | 'noise' | 'sample';
export type Wave = 'sine' | 'triangle' | 'sawtooth';
export type NoiseColor = 'white' | 'pink' | 'brown';
export type TemplateTier = 'free' | 'holder' | 'pro' | 'collector';

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
  export?: { fadeSec?: number; sampleRate?: number };
  notes?: string;
};

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
    export: {
      fadeSec: clampNum(s.export?.fadeSec ?? 4, 0, 30),
      sampleRate: [32000, 44100, 48000].includes(Number(s.export?.sampleRate)) ? Number(s.export.sampleRate) : 44100,
    },
    notes: s.notes ? String(s.notes).slice(0, 8000) : undefined,
  };
}

function sanitizeLayer(l: any, durationMin: number, index: number): EntrainLayerV1 {
  const types: LayerType[] = ['binaural','monaural','iso-smooth','iso-hard','carrier','noise','sample'];
  const waves: Wave[] = ['sine','triangle','sawtooth'];
  const noise: NoiseColor[] = ['white','pink','brown'];
  const type: LayerType = types.includes(l?.type) ? l.type : 'binaural';
  const keyframesRaw = Array.isArray(l?.keyframes) ? l.keyframes : Array.isArray(l?.tl) ? l.tl.map((k: any) => ({ tMin: k.t, beatHz: k.beat, gainPct: k.gain })) : [];
  const keyframes = (keyframesRaw.length ? keyframesRaw : [{ tMin: 0, beatHz: 10, gainPct: 35 }, { tMin: durationMin, beatHz: 10, gainPct: 35 }])
    .map((k: any) => ({
      tMin: clampNum(k.tMin ?? k.t ?? 0, 0, durationMin),
      beatHz: type === 'noise' || type === 'carrier' || type === 'sample' ? undefined : clampNum(k.beatHz ?? k.beat ?? 10, 0.1, 45),
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
    carrierHz: type === 'noise' || type === 'sample' ? undefined : clampNum(l?.carrierHz ?? l?.carrier ?? 220, 20, 2000),
    wave: waves.includes(l?.wave) ? l.wave : 'sine',
    noiseColor: noise.includes(l?.noiseColor) ? l.noiseColor : 'pink',
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

function clampNum(v: any, a: number, b: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : a;
}

export function cleanForShare(session: EntrainSessionV1) {
  const s = sanitizeSession(session);
  s.layers = s.layers.map((l) => ({ ...l, sampleName: l.sampleName || undefined }));
  return s;
}
