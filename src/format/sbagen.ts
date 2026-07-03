import { sanitizeSession, type EntrainLayerV1, type EntrainSessionV1, type Keyframe } from './entrain-format';

export type SbagenImportWarning = { level: 'info' | 'warn'; message: string };
export type SbagenImportResult = { session: EntrainSessionV1; warnings: SbagenImportWarning[] };

type StateComponent =
  | { kind: 'noise'; color: 'white' | 'pink' | 'brown'; gainPct: number }
  | { kind: 'binaural'; carrierHz: number; beatHz: number; gainPct: number }
  | { kind: 'sample'; sampleName: string; gainPct: number };

type State = { label: string; components: StateComponent[] };
type Transition = { from: string; to: string; durMin: number };
type ScheduledComponent = StateComponent & { tMin: number };

const uid = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
const round = (n: number, d = 3) => Number(n.toFixed(d));

export function looksLikeSbagen(text: string) {
  const cleaned = stripComments(String(text || '')).trim();
  return /^\w[\w.-]*\s*:/m.test(cleaned) || /^\w[\w.-]*\s*->\s*\+?\d{1,2}:\d{2}(?::\d{2})?\s+\w[\w.-]*/m.test(cleaned);
}

export function sbagenTextToSession(text: string, options: { name?: string; defaultDurationMin?: number } = {}): SbagenImportResult {
  const warnings: SbagenImportWarning[] = [];
  const states = new Map<string, State>();
  const transitions: Transition[] = [];
  const rawLines = String(text || '').split(/\r?\n/);

  for (const raw of rawLines) {
    const line = stripComments(raw).trim();
    if (!line) continue;

    const transition = line.match(/^(\w[\w.-]*)\s*->\s*\+?(\d{1,2}:\d{2}(?::\d{2})?)\s+(\w[\w.-]*)\s*$/);
    if (transition) {
      transitions.push({ from: transition[1], durMin: parseClockToMinutes(transition[2]), to: transition[3] });
      continue;
    }

    const state = line.match(/^(\w[\w.-]*)\s*:\s*(.+)$/);
    if (state) {
      states.set(state[1], { label: state[1], components: parseComponents(state[2], warnings) });
      continue;
    }

    warnings.push({ level: 'warn', message: `Ignored unsupported SBaGen line: ${line}` });
  }

  if (!states.size) {
    const session = sanitizeSession({ name: options.name || 'Imported SBaGen script', durationMin: options.defaultDurationMin || 20, notes: 'No valid SBaGen states were found.' });
    return { session, warnings: [{ level: 'warn', message: 'No valid SBaGen state definitions were found.' }, ...warnings] };
  }

  const durationMin = transitions.length ? round(transitions.reduce((a, t) => a + t.durMin, 0), 4) : clamp(options.defaultDurationMin || 20, 1, 180);
  const timeline = new Map<string, ScheduledComponent[]>();
  const firstState = transitions[0]?.from || [...states.keys()][0];

  if (transitions.length) {
    let cursor = 0;
    for (const tr of transitions) {
      const from = states.get(tr.from);
      const to = states.get(tr.to);
      if (!from || !to) {
        warnings.push({ level: 'warn', message: `Transition ${tr.from} -> ${tr.to} references an undefined state.` });
        continue;
      }
      addTransitionSnapshot(timeline, from, to, cursor, round(cursor + tr.durMin, 4));
      cursor = round(cursor + tr.durMin, 4);
    }
  } else {
    const s = states.get(firstState)!;
    addStateSnapshot(timeline, s, 0);
    addStateSnapshot(timeline, s, durationMin);
  }

  const layers: EntrainLayerV1[] = [];
  for (const [key, points] of timeline) {
    const sorted = mergePoints(points, durationMin);
    const first = sorted[0];
    if (!first) continue;

    if (first.kind === 'noise') {
      layers.push({ id: uid(), type: 'noise', noiseColor: first.color, keyframes: sorted.map((p) => ({ tMin: p.tMin, gainPct: p.gainPct })) });
      continue;
    }
    if (first.kind === 'sample') {
      layers.push({
        id: uid(),
        type: 'sample',
        sampleName: first.sampleName,
        sampleLoop: { mode: 'native', startSec: 0, crossfadeSec: 0 },
        pan: 0,
        keyframes: sorted.map((p) => ({ tMin: p.tMin, gainPct: p.gainPct })),
      });
      warnings.push({ level: 'info', message: `Imported ambience reference "${first.sampleName}" as a local-file layer. The audio file must be loaded in the browser.` });
      continue;
    }
    if (first.kind === 'binaural') {
      const carrierHz = first.carrierHz;
      layers.push({
        id: uid(),
        type: 'binaural',
        carrierHz,
        wave: 'sine',
        keyframes: sorted.map((p) => ({ tMin: p.tMin, beatHz: p.kind === 'binaural' ? p.beatHz : 0.1, gainPct: p.gainPct })),
      });
      if (carrierHz > 1000) warnings.push({ level: 'warn', message: `Carrier ${carrierHz} Hz is above the usual binaural range; the analyzer will flag it.` });
      if (sorted.some((p) => p.kind === 'binaural' && p.beatHz > 30)) warnings.push({ level: 'warn', message: `A binaural beat above 30 Hz may not fuse cleanly.` });
    } else {
      warnings.push({ level: 'warn', message: `Ignored unsupported component group ${key}.` });
    }
  }

  const session = sanitizeSession({
    format: 'entrain.session.v1',
    name: options.name || `SBaGen import · ${firstState}`,
    durationMin,
    loop: { mode: transitions.length ? 'hold-last' : 'repeat' },
    notes: sbagenNotes(text, warnings),
    layers: layers.length ? layers : undefined,
    export: { fadeSec: 4, sampleRate: 44100 },
  });
  return { session, warnings };
}

function parseComponents(body: string, warnings: SbagenImportWarning[]) {
  const tokens = body.match(/(?:"[^"]+"|'[^']+'|\S+)/g) || [];
  const components: StateComponent[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = unquote(tokens[i]);
    const noise = token.match(/^(pink|white|brown)\/(\d+(?:\.\d+)?)$/i);
    if (noise) {
      components.push({ kind: 'noise', color: noise[1].toLowerCase() as any, gainPct: clamp(Number(noise[2]), 0, 100) });
      continue;
    }

    const beatPlus = token.match(/^(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/);
    const beatBracket = token.match(/^(\d+(?:\.\d+)?)\[(\d+(?:\.\d+)?)\](?:\/(\d+(?:\.\d+)?))?$/);
    const beat = beatPlus || beatBracket;
    if (beat) {
      components.push({ kind: 'binaural', carrierHz: Number(beat[1]), beatHz: Number(beat[2]), gainPct: clamp(Number(beat[3] ?? 50), 0, 100) });
      continue;
    }

    const samplePair = tokens[i + 1] ? unquote(tokens[i + 1]).match(/^mix\/(\d+(?:\.\d+)?)$/i) : null;
    if (/\.(wav|mp3|ogg|flac|aac|m4a)$/i.test(token) && samplePair) {
      components.push({ kind: 'sample', sampleName: token, gainPct: clamp(Number(samplePair[1]), 0, 100) });
      i++;
      continue;
    }

    const sampleDirect = token.match(/^(.+\.(?:wav|mp3|ogg|flac|aac|m4a))\/(\d+(?:\.\d+)?)$/i);
    if (sampleDirect) {
      components.push({ kind: 'sample', sampleName: sampleDirect[1], gainPct: clamp(Number(sampleDirect[2]), 0, 100) });
      continue;
    }

    warnings.push({ level: 'warn', message: `Ignored unsupported SBaGen token: ${token}` });
  }
  return components;
}


function addTransitionSnapshot(timeline: Map<string, ScheduledComponent[]>, from: State, to: State, startMin: number, endMin: number) {
  const a = new Map(from.components.map((c) => [componentKey(c), c]));
  const b = new Map(to.components.map((c) => [componentKey(c), c]));
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    const start = a.get(key) || silentLike(b.get(key)!);
    const end = b.get(key) || silentLike(a.get(key)!);
    pushScheduled(timeline, key, { ...start, tMin: startMin } as ScheduledComponent);
    pushScheduled(timeline, key, { ...end, tMin: endMin } as ScheduledComponent);
  }
}

function silentLike(c: StateComponent): StateComponent {
  return { ...c, gainPct: 0 } as StateComponent;
}

function pushScheduled(timeline: Map<string, ScheduledComponent[]>, key: string, point: ScheduledComponent) {
  const list = timeline.get(key) || [];
  list.push(point);
  timeline.set(key, list);
}

function componentKey(c: StateComponent) {
  if (c.kind === 'noise') return `noise:${c.color}`;
  if (c.kind === 'sample') return `sample:${c.sampleName}`;
  return `binaural:${round(c.carrierHz, 4)}`;
}

function addStateSnapshot(timeline: Map<string, ScheduledComponent[]>, state: State, tMin: number) {
  for (const c of state.components) {
    const key = componentKey(c);
    const list = timeline.get(key) || [];
    list.push({ ...c, tMin });
    timeline.set(key, list as ScheduledComponent[]);
  }
}

function mergePoints(points: ScheduledComponent[], durationMin: number) {
  const byTime = new Map<number, ScheduledComponent>();
  for (const p of points) byTime.set(round(clamp(p.tMin, 0, durationMin), 4), { ...p, tMin: round(clamp(p.tMin, 0, durationMin), 4) });
  return [...byTime.values()].sort((a, b) => a.tMin - b.tMin);
}

function stripComments(s: string) {
  return String(s || '').replace(/\s*(#|;).*$/, '');
}
function unquote(s: string) { return String(s || '').trim().replace(/^['"]|['"]$/g, ''); }
function parseClockToMinutes(clock: string) {
  const parts = clock.split(':').map(Number);
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) / 60;
  return (parts[0] * 3600 + parts[1] * 60 + parts[2]) / 60;
}
function sbagenNotes(source: string, warnings: SbagenImportWarning[]) {
  const warningText = warnings.length ? `\n\nImport notes:\n${warnings.map((w) => `- ${w.level}: ${w.message}`).join('\n')}` : '';
  return `Imported from SBaGen-style script. SBaGen labels become ENTRAIN timeline keyframes; carrier+beat tokens become binaural layers using left = carrier - beat/2 and right = carrier + beat/2.${warningText}\n\nOriginal script:\n${source.slice(0, 4000)}`;
}

export function sessionToSbagenText(input: any) {
  const s = sanitizeSession(input);
  const times = collectTimes(s).sort((a, b) => a - b);
  if (times.length < 2) times.push(s.durationMin);
  const lines = [
    `# ENTRAIN SBaGen-compatible export`,
    `# ${s.name}`,
    `# Duration: ${s.durationMin} min`,
    `# Supported tokens: pink/50 white/20 brown/30 and 100+4/50 binaural layers.`,
  ];
  const unsupported = s.layers.filter((l) => !['binaural','noise','sample'].includes(l.type));
  if (unsupported.length) lines.push(`# Omitted unsupported ENTRAIN layer types: ${[...new Set(unsupported.map((l) => l.type))].join(', ')}`);

  times.forEach((t, i) => {
    const label = `s${i}`;
    const components = s.layers.flatMap((l) => layerToSbagenAt(l, t));
    lines.push(`${label}: ${components.length ? components.join(' ') : 'pink/0'}`);
  });
  for (let i = 0; i < times.length - 1; i++) {
    const durMin = Math.max(0, times[i + 1] - times[i]);
    if (durMin > 0) lines.push(`s${i} -> +${formatClock(durMin)} s${i + 1}`);
  }
  return `${lines.join('\n')}\n`;
}

function collectTimes(s: EntrainSessionV1) {
  const set = new Set<number>([0, s.durationMin]);
  for (const l of s.layers) for (const k of l.keyframes) set.add(round(clamp(k.tMin, 0, s.durationMin), 4));
  return [...set];
}
function layerToSbagenAt(l: EntrainLayerV1, tMin: number) {
  const gain = Math.round(valueAt(l.keyframes, 'gainPct', tMin));
  if (gain <= 0) return [];
  if (l.type === 'noise') return [`${l.noiseColor || 'pink'}/${gain}`];
  if (l.type === 'sample' && l.sampleName) return [`${quoteIfNeeded(l.sampleName)} mix/${gain}`];
  if (l.type !== 'binaural') return [];
  const carrier = round(l.carrierHz || 220, 3);
  const beat = round(valueAt(l.keyframes, 'beatHz', tMin) || 10, 3);
  return [`${carrier}+${beat}/${gain}`];
}
function valueAt(kfs: Keyframe[], key: 'gainPct' | 'beatHz', tMin: number) {
  const pts = [...kfs].sort((a, b) => a.tMin - b.tMin);
  if (!pts.length) return 0;
  if (tMin <= pts[0].tMin) return Number(pts[0][key] || 0);
  for (let i = 1; i < pts.length; i++) {
    if (tMin <= pts[i].tMin) {
      const a = pts[i - 1], b = pts[i];
      const f = (tMin - a.tMin) / Math.max(1e-9, b.tMin - a.tMin);
      return Number(a[key] || 0) + (Number(b[key] || 0) - Number(a[key] || 0)) * f;
    }
  }
  return Number(pts[pts.length - 1][key] || 0);
}
function formatClock(min: number) {
  const total = Math.round(min * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function quoteIfNeeded(s: string) { return /\s/.test(s) ? JSON.stringify(s) : s; }
