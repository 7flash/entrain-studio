import { sanitizeSession, type EntrainSessionV1, type EntrainLayerV1 } from './entrain-format';
import { looksLikeSbagen, sbagenTextToSession, sessionToSbagenText } from './sbagen';

const isBed = (l: EntrainLayerV1) => l.type === 'noise' || l.type === 'sample' || l.type === 'procedural-ambience' || l.type === 'carrier';
const gainDb = (pct: number) => pct <= 0 ? -Infinity : 20 * Math.log10(pct / 100);
const pctFromDb = (db: number) => Math.max(0, Math.min(100, Math.pow(10, db / 20) * 100));

export function sessionToPatternText(input: any) {
  const s = sanitizeSession(input);
  const lines = [
    `name ${JSON.stringify(s.name)}`,
    `duration ${s.durationMin}m`,
    `loop ${s.loop?.mode || 'hold-last'}${s.loop?.crossfadeSec ? ` ${s.loop.crossfadeSec}s` : ''}`,
  ];
  for (const l of s.layers) {
    const first = l.keyframes[0];
    const last = l.keyframes[l.keyframes.length - 1] || first;
    const g = Number.isFinite(gainDb(first?.gainPct || 0)) ? `${gainDb(first.gainPct).toFixed(1)}dB` : '-inf';
    if (l.type === 'noise') lines.push(`noise color=${l.noiseColor || 'pink'} gain=${g}`);
    else if (l.type === 'procedural-ambience') lines.push(`ambience recipe=${l.ambienceRecipe || 'pink-rain'} gain=${g} seed=${l.seed || 1337}`);
    else if (l.type === 'sample') lines.push(`sample name=${JSON.stringify(l.sampleName || 'local file')} gain=${g} loop=${l.sampleLoop?.mode || 'native'}`);
    else if (l.type === 'carrier') lines.push(`carrier freq=${l.carrierHz || 220} gain=${g}`);
    else {
      const beat = first?.beatHz === last?.beatHz ? `${first?.beatHz || 10}` : `${first?.beatHz || 10}->${last?.beatHz || first?.beatHz || 10}`;
      lines.push(`${l.type} carrier=${l.carrierHz || 220} beat=${beat} gain=${g}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function patternTextToSession(text: string): EntrainSessionV1 {
  if (looksLikeSbagen(text)) return sbagenTextToSession(text).session;
  const lines = String(text || '').split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#'));
  let name = 'Imported pattern';
  let durationMin = 20;
  let loop: any = { mode: 'hold-last' };
  const layers: any[] = [];
  for (const line of lines) {
    const [cmdRaw, ...rest] = line.split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    const args = parseArgs(rest.join(' '));
    if (cmd === 'name') { name = unquote(rest.join(' ')) || name; continue; }
    if (cmd === 'duration') { durationMin = parseDuration(rest[0] || args.value || '20m'); continue; }
    if (cmd === 'loop') { loop = { mode: rest[0] || 'hold-last', crossfadeSec: parseSeconds(rest[1] || '') || 0 }; continue; }
    if (cmd === 'noise') layers.push({ id: uid(), type: 'noise', noiseColor: args.color || 'pink', keyframes: kfs(durationMin, undefined, pct(args.gain, 18)) });
    else if (cmd === 'ambience') layers.push({ id: uid(), type: 'procedural-ambience', ambienceRecipe: args.recipe || 'pink-rain', seed: Number(args.seed || 1337), pan: 0, panMotion: { rateHz: 0.03, depth: 0.25 }, keyframes: kfs(durationMin, undefined, pct(args.gain, 18)) });
    else if (cmd === 'sample') layers.push({ id: uid(), type: 'sample', sampleName: unquote(args.name || 'local file'), sampleLoop: { mode: args.loop === 'crossfade' ? 'crossfade' : 'native', startSec: 0, crossfadeSec: 3 }, keyframes: kfs(durationMin, undefined, pct(args.gain, 18)) });
    else if (cmd === 'carrier') layers.push({ id: uid(), type: 'carrier', carrierHz: Number(args.freq || args.carrier || 220), keyframes: kfs(durationMin, undefined, pct(args.gain, 20)) });
    else if (['binaural','monaural','iso-smooth','iso-hard'].includes(cmd)) {
      const beat = String(args.beat || '10').split('->').map(Number);
      layers.push({ id: uid(), type: cmd, carrierHz: Number(args.carrier || 220), wave: 'sine', keyframes: kfs(durationMin, [beat[0] || 10, beat[1] || beat[0] || 10], pct(args.gain, 35)) });
    }
  }
  return sanitizeSession({ format: 'entrain.session.v1', name, durationMin, loop, layers: layers.length ? layers : undefined, export: { fadeSec: 4, sampleRate: 44100 } });
}

function kfs(durationMin: number, beats: [number, number] | undefined, gainPct: number) {
  return [{ tMin: 0, beatHz: beats?.[0], gainPct }, { tMin: durationMin, beatHz: beats?.[1], gainPct }];
}
function pct(v: string | undefined, fallback: number) {
  if (!v) return fallback;
  if (String(v).endsWith('dB')) return pctFromDb(Number(String(v).replace('dB','')));
  return Math.max(0, Math.min(100, Number(v) || fallback));
}
function parseDuration(s: string) { const n = parseFloat(s); return /h$/i.test(s) ? n * 60 : n; }
function parseSeconds(s: string) { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; }
function parseArgs(text: string) {
  const out: Record<string,string> = {};
  text.replace(/(\w+)=((?:"[^"]+")|(?:'[^']+')|[^\s]+)/g, (_m, k, v) => { out[k] = unquote(v); return ''; });
  return out;
}
function unquote(s: string) { return String(s || '').trim().replace(/^['"]|['"]$/g, ''); }
function uid() { return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10); }

export { looksLikeSbagen, sbagenTextToSession, sessionToSbagenText };
