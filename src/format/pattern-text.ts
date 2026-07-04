import {
  sanitizeSession,
  type EntrainSessionV1,
  type EntrainLayerV1,
} from "./entrain-format";
import {
  looksLikeSbagen,
  sbagenTextToSession,
  sessionToSbagenText,
} from "./sbagen";

const isBed = (l: EntrainLayerV1) =>
  l.type === "noise" ||
  l.type === "sample" ||
  l.type === "procedural-ambience" ||
  l.type === "carrier" ||
  l.type === "additive" ||
  l.type === "karplus";
const gainDb = (pct: number) =>
  pct <= 0 ? -Infinity : 20 * Math.log10(pct / 100);
const pctFromDb = (db: number) =>
  Math.max(0, Math.min(100, Math.pow(10, db / 20) * 100));

export function sessionToPatternText(input: any) {
  const s = sanitizeSession(input);
  const lines = [
    `name ${JSON.stringify(s.name)}`,
    `duration ${s.durationMin}m`,
    `loop ${s.loop?.mode || "hold-last"}${s.loop?.crossfadeSec ? ` ${s.loop.crossfadeSec}s` : ""}`,
  ];
  for (const l of s.layers) {
    const first = l.keyframes[0];
    const g = Number.isFinite(gainDb(first?.gainPct || 0))
      ? `${gainDb(first.gainPct).toFixed(1)}dB`
      : "-inf";
    const pts = encodePoints(l);
    if (l.type === "noise")
      lines.push(
        `noise color=${l.noiseColor || "pink"} gain=${g} points=${pts}`,
      );
    else if (l.type === "procedural-ambience")
      lines.push(
        `ambience recipe=${l.ambienceRecipe || "pink-rain"} gain=${g} seed=${l.seed || 1337}${l.panMotion ? ` panRate=${l.panMotion.rateHz || 0} panDepth=${l.panMotion.depth || 0}` : ""} points=${pts}`,
      );
    else if (l.type === "sample")
      lines.push(
        `sample name=${JSON.stringify(l.sampleName || "local file")} gain=${g} loop=${l.sampleLoop?.mode || "native"} points=${pts}`,
      );
    else if (l.type === "carrier")
      lines.push(`carrier freq=${l.carrierHz || 220} gain=${g} points=${pts}`);
    else if (l.type === "additive")
      lines.push(
        `additive base=${l.carrierHz || 136.1} gain=${g} partials=${JSON.stringify(l.partials || [])} points=${pts}`,
      );
    else if (l.type === "karplus")
      lines.push(
        `karplus freq=${l.carrierHz || 220} gain=${g} rate=${l.karplus?.rateHz || 0.08} decay=${l.karplus?.decay || 0.996} brightness=${l.karplus?.brightness ?? 0.55} seed=${l.seed || 4242} points=${pts}`,
      );
    else {
      const firstBeat = first?.beatHz || 10;
      const last = l.keyframes[l.keyframes.length - 1] || first;
      const beat =
        first?.beatHz === last?.beatHz
          ? `${firstBeat}`
          : `${firstBeat}->${last?.beatHz || firstBeat}`;
      const pulse =
        l.type === "iso-trap"
          ? ` edge=${l.isoPulse?.edgeMs || 8}ms duty=${l.isoPulse?.duty || 0.45}`
          : "";
      lines.push(
        `${l.type} carrier=${l.carrierHz || 220} beat=${beat} gain=${g}${pulse} points=${pts}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function encodePoints(l: EntrainLayerV1) {
  return JSON.stringify(
    (l.keyframes || []).map((k) => {
      const row: any = { t: k.tMin, g: k.gainPct };
      if (k.carrierHz !== undefined) row.c = k.carrierHz;
      if (k.beatHz !== undefined) row.b = k.beatHz;
      return row;
    }),
  );
}

export function patternTextToSession(text: string): EntrainSessionV1 {
  if (looksLikeSbagen(text)) return sbagenTextToSession(text).session;
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith("#"));
  let name = "Imported pattern";
  let durationMin = 20;
  let loop: any = { mode: "hold-last" };
  const layers: any[] = [];
  for (const line of lines) {
    const [cmdRaw, ...rest] = line.split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    const args = parseArgs(rest.join(" "));
    if (cmd === "name") {
      name = unquote(rest.join(" ")) || name;
      continue;
    }
    if (cmd === "duration") {
      durationMin = parseDuration(rest[0] || args.value || "20m");
      continue;
    }
    if (cmd === "loop") {
      loop = {
        mode: rest[0] || "hold-last",
        crossfadeSec: parseSeconds(rest[1] || "") || 0,
      };
      continue;
    }
    if (cmd === "noise")
      layers.push({
        id: uid(),
        type: "noise",
        noiseColor: args.color || "pink",
        keyframes: exactKfs(
          args.points,
          durationMin,
          undefined,
          pct(args.gain, 18),
        ),
      });
    else if (cmd === "ambience")
      layers.push({
        id: uid(),
        type: "procedural-ambience",
        ambienceRecipe: args.recipe || "pink-rain",
        seed: Number(args.seed || 1337),
        pan: 0,
        panMotion: {
          rateHz: Number(args.panRate || 0.03),
          depth: Number(args.panDepth || 0.25),
        },
        keyframes: exactKfs(
          args.points,
          durationMin,
          undefined,
          pct(args.gain, 18),
        ),
      });
    else if (cmd === "sample")
      layers.push({
        id: uid(),
        type: "sample",
        sampleName: unquote(args.name || "local file"),
        sampleLoop: {
          mode: args.loop === "crossfade" ? "crossfade" : "native",
          startSec: 0,
          crossfadeSec: 3,
        },
        keyframes: exactKfs(
          args.points,
          durationMin,
          undefined,
          pct(args.gain, 18),
        ),
      });
    else if (cmd === "carrier") {
      const c = Number(args.freq || args.carrier || 220);
      layers.push({
        id: uid(),
        type: "carrier",
        carrierHz: c,
        keyframes: exactKfs(
          args.points,
          durationMin,
          undefined,
          pct(args.gain, 20),
          c,
        ),
      });
    } else if (cmd === "additive") {
      const c = Number(args.base || args.freq || 136.1);
      layers.push({
        id: uid(),
        type: "additive",
        carrierHz: c,
        partials: parseJson(args.partials) || [
          { ratio: 1, gain: 1 },
          { ratio: 1.5, gain: 0.5 },
          { ratio: 2.001, gain: 0.32 },
        ],
        envelope: {
          attackMs: 1200,
          decayMs: 2500,
          sustain: 0.9,
          releaseMs: 4000,
        },
        pan: 0,
        keyframes: exactKfs(
          args.points,
          durationMin,
          undefined,
          pct(args.gain, 20),
          c,
        ),
      });
    } else if (cmd === "karplus") {
      const c = Number(args.freq || args.base || 220);
      layers.push({
        id: uid(),
        type: "karplus",
        carrierHz: c,
        seed: Number(args.seed || 4242),
        karplus: {
          rateHz: Number(args.rate || 0.08),
          decay: Number(args.decay || 0.996),
          brightness: Number(args.brightness || 0.55),
          durationSec: Number(args.duration || 6),
        },
        pan: 0,
        keyframes: exactKfs(
          args.points,
          durationMin,
          undefined,
          pct(args.gain, 18),
          c,
        ),
      });
    } else if (
      ["binaural", "monaural", "iso-smooth", "iso-trap", "iso-hard"].includes(
        cmd,
      )
    ) {
      const beat = String(args.beat || "10")
        .split("->")
        .map(Number);
      {
        const c = Number(args.carrier || 220);
        layers.push({
          id: uid(),
          type: cmd,
          carrierHz: c,
          wave: "sine",
          isoPulse:
            cmd === "iso-trap"
              ? {
                  edgeMs: Number(String(args.edge || "8").replace("ms", "")),
                  duty: Number(args.duty || 0.45),
                }
              : undefined,
          keyframes: exactKfs(
            args.points,
            durationMin,
            [beat[0] || 10, beat[1] || beat[0] || 10],
            pct(args.gain, 35),
            c,
          ),
        });
      }
    }
  }
  return sanitizeSession({
    format: "entrain.session.v1",
    name,
    durationMin,
    loop,
    layers: layers.length ? layers : undefined,
    export: { fadeSec: 4, sampleRate: 44100 },
  });
}

function exactKfs(
  points: string | undefined,
  durationMin: number,
  beats: [number, number] | undefined,
  gainPct: number,
  carrierHz?: number,
) {
  const parsed = parseJson(points);
  if (Array.isArray(parsed) && parsed.length) {
    return parsed
      .map((p: any) => {
        const k: any = {
          tMin: Number(p.t ?? p.tMin ?? 0),
          gainPct: Number(p.g ?? p.gainPct ?? gainPct),
        };
        if (p.c !== undefined || p.carrierHz !== undefined)
          k.carrierHz = Number(p.c ?? p.carrierHz);
        else if (carrierHz !== undefined) k.carrierHz = carrierHz;
        if (p.b !== undefined || p.beatHz !== undefined)
          k.beatHz = Number(p.b ?? p.beatHz);
        return k;
      })
      .sort((a: any, b: any) => a.tMin - b.tMin);
  }
  const a: any = { tMin: 0, beatHz: beats?.[0], gainPct };
  const b: any = { tMin: durationMin, beatHz: beats?.[1], gainPct };
  if (carrierHz !== undefined) {
    a.carrierHz = carrierHz;
    b.carrierHz = carrierHz;
  }
  return [a, b];
}
function pct(v: string | undefined, fallback: number) {
  if (!v) return fallback;
  if (String(v).endsWith("dB"))
    return pctFromDb(Number(String(v).replace("dB", "")));
  return Math.max(0, Math.min(100, Number(v) || fallback));
}
function parseDuration(s: string) {
  const n = parseFloat(s);
  return /h$/i.test(s) ? n * 60 : n;
}
function parseSeconds(s: string) {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
function parseArgs(text: string) {
  const out: Record<string, string> = {};
  text.replace(/(\w+)=((?:"[^"]+")|(?:'[^']+')|[^\s]+)/g, (_m, k, v) => {
    out[k] = unquote(v);
    return "";
  });
  return out;
}
function unquote(s: string) {
  return String(s || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}
function parseJson(s: string | undefined) {
  try {
    return s ? JSON.parse(s) : undefined;
  } catch {
    return undefined;
  }
}
function uid() {
  return (
    globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10)
  );
}

export { looksLikeSbagen, sbagenTextToSession, sessionToSbagenText };
