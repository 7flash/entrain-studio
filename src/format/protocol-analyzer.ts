import {
  sanitizeSession,
  bandForHz,
  type EntrainSessionV1,
  type EntrainLayerV1,
} from "./entrain-format";

export type ProtocolIssue = {
  level: "info" | "warn" | "error";
  code: string;
  message: string;
  layerId?: string;
};
export type ProtocolAnalysis = {
  headphonesRequired: boolean;
  binauralLayerCount: number;
  beatLayerCount: number;
  maxBeatHz: number;
  carrierRangeHz: [number, number] | null;
  bands: string[];
  estimatedPeak: number;
  estimatedPeakDb: number;
  estimatedRmsDb: number;
  mixStatus: "ok" | "hot" | "clip-risk";
  localFilesRequired: boolean;
  nativeSampleLoops: number;
  proceduralAmbienceLayers: number;
  publishable: boolean;
  issues: ProtocolIssue[];
};

const NO_BEAT = new Set(["noise", "carrier", "sample", "procedural-ambience"]);
const db = (x: number) => (x <= 0 ? -Infinity : 20 * Math.log10(x));
const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);

export function analyzeSession(input: any): ProtocolAnalysis {
  const s = sanitizeSession(input);
  const issues: ProtocolIssue[] = [];
  const audible = audibleLayers(s);
  const norm = 0.55 / Math.sqrt(Math.max(1, audible.length));
  let headphonesRequired = false;
  let binauralLayerCount = 0;
  let beatLayerCount = 0;
  let maxBeatHz = 0;
  let minCarrier = Infinity;
  let maxCarrier = 0;
  let peakSum = 0;
  let rmsSumSq = 0;
  let localFilesRequired = false;
  let nativeSampleLoops = 0;
  let proceduralAmbienceLayers = 0;
  const bands = new Set<string>();

  for (const layer of audible) {
    const layerMaxGain = max(layer.keyframes.map((k) => k.gainPct)) / 100;
    const layerPeak = layerMaxGain * norm;
    peakSum += layerPeak;
    rmsSumSq += Math.pow(
      layerPeak *
        (layer.type === "noise" || layer.type === "procedural-ambience"
          ? 0.55
          : 0.707),
      2,
    );

    if (layer.type === "binaural") {
      headphonesRequired = true;
      binauralLayerCount++;
      if (layer.pan != null || layer.panMotion)
        push(
          issues,
          "warn",
          "binaural-pan-ignored",
          "Binaural layers must remain hard-separated left/right; pan settings are ignored.",
          layer,
        );
    }
    if (layer.type === "sample") {
      localFilesRequired = true;
      if (!layer.sampleLoop || layer.sampleLoop.mode === "native")
        nativeSampleLoops++;
    }
    if (layer.type === "procedural-ambience") proceduralAmbienceLayers++;

    if (!NO_BEAT.has(layer.type)) {
      beatLayerCount++;
      const layerMaxBeat = max(
        layer.keyframes.map((k) => Number(k.beatHz || 0)),
      );
      maxBeatHz = Math.max(maxBeatHz, layerMaxBeat);
      layer.keyframes.forEach((k) => {
        if (typeof k.beatHz === "number") bands.add(bandForHz(k.beatHz));
      });
      if (layer.type === "binaural" && layerMaxBeat > 30)
        push(
          issues,
          "error",
          "binaural-fusion-ceiling",
          `Binaural beat ${layerMaxBeat.toFixed(1)} Hz exceeds the practical fusion ceiling; use monaural or isochronic for this rate.`,
          layer,
        );
      if ((layer.carrierHz || 0) > 1000 && layer.type === "binaural")
        push(
          issues,
          "warn",
          "binaural-carrier-high",
          `Carrier ${layer.carrierHz} Hz is above the conservative binaural phase-locking range.`,
          layer,
        );
      if ((layer.carrierHz || 0) < 80 && layer.type === "binaural")
        push(
          issues,
          "warn",
          "binaural-carrier-low",
          `Carrier ${layer.carrierHz} Hz is very low; many headphones and playback chains roll off here.`,
          layer,
        );
      if (layer.carrierHz) {
        minCarrier = Math.min(minCarrier, layer.carrierHz);
        maxCarrier = Math.max(maxCarrier, layer.carrierHz);
      }
    }
  }

  const estimatedPeak = peakSum * 0.75;
  const estimatedRms = Math.sqrt(rmsSumSq) * 0.75;
  const estimatedPeakDb = db(estimatedPeak);
  const estimatedRmsDb = db(estimatedRms);
  if (estimatedPeak > 1)
    push(
      issues,
      "error",
      "clip-risk",
      `Estimated peak is ${estimatedPeakDb.toFixed(1)} dBFS before limiting; lower layer gains or mask level.`,
    );
  else if (estimatedPeak > 0.89)
    push(
      issues,
      "warn",
      "hot-mix",
      `Estimated peak is ${estimatedPeakDb.toFixed(1)} dBFS; leave more headroom before export.`,
    );
  if (nativeSampleLoops)
    push(
      issues,
      "warn",
      "native-sample-loop",
      `${nativeSampleLoops} ambience sample layer(s) use native loops; add crossfade points for non-seamless recordings.`,
    );
  if (headphonesRequired)
    push(
      issues,
      "info",
      "headphones-required",
      "Binaural layers require stereo headphones. Speakers, mono summing, or subwoofer bass management can destroy the interaural offset.",
    );
  if (localFilesRequired)
    push(
      issues,
      "info",
      "local-files-required",
      "This pattern references local ambience files. Presets store filenames/loop points, not the audio data.",
    );

  const errors = issues.some((i) => i.level === "error");
  return {
    headphonesRequired,
    binauralLayerCount,
    beatLayerCount,
    maxBeatHz,
    carrierRangeHz: Number.isFinite(minCarrier)
      ? [minCarrier, maxCarrier]
      : null,
    bands: [...bands],
    estimatedPeak,
    estimatedPeakDb,
    estimatedRmsDb,
    mixStatus:
      estimatedPeak > 1 ? "clip-risk" : estimatedPeak > 0.89 ? "hot" : "ok",
    localFilesRequired,
    nativeSampleLoops,
    proceduralAmbienceLayers,
    publishable: !errors,
    issues,
  };
}

function audibleLayers(session: EntrainSessionV1): EntrainLayerV1[] {
  const solo = session.layers.some((l) => l.solo);
  return session.layers.filter((l) => !l.mute && (!solo || l.solo));
}
function push(
  issues: ProtocolIssue[],
  level: ProtocolIssue["level"],
  code: string,
  message: string,
  layer?: EntrainLayerV1,
) {
  issues.push({ level, code, message, layerId: layer?.id });
}

const RISKY_CLAIMS = [
  /\b(?:treats?|cures?|heals?|diagnos(?:e|es|is|tic)|prevents?|reverses?)\b.{0,60}\b(?:depression|anxiety|ptsd|alzheimer|seizure|epilepsy|medical|disorder|disease|illness)\b/i,
  /\b(?:boosts?|increases?|raises?|lowers?|reduces?|regulates?|balances?|releases?|stimulates?)\b.{0,50}\b(?:dopamine|acetylcholine|cortisol|hormone|human\s+growth\s+hormone|hgh)\b/i,
  /\bguarantee[sd]?\b.{0,60}\b(?:focus|sleep|meditation|relaxation|entrainment|results?)\b/i,
  /\b(?:enlightenment|psychic|telepathy|telepathic|remote\s+viewing)\b/i,
  /\bmedical\s+treatment\b/i,
];
const DISCLAIMER_WINDOW =
  /(?:not|isn['’]?t|doesn['’]?t|won['’]?t|no|never|without|avoid|skip|consult|disclaimer|not\s+a\s+medical)/i;

export function claimRisk(text: string, opts: { reviewed?: boolean } = {}) {
  if (opts.reviewed)
    return { risky: false, reviewed: true, hits: [] as string[] };
  const source = String(text || "");
  const hits: string[] = [];
  for (const rx of RISKY_CLAIMS) {
    const matches =
      source.match(
        new RegExp(
          rx.source,
          rx.flags.includes("g") ? rx.flags : rx.flags + "g",
        ),
      ) || [];
    for (const match of matches) {
      const idx = source.toLowerCase().indexOf(match.toLowerCase());
      const context = source.slice(
        Math.max(0, idx - 80),
        Math.min(source.length, idx + match.length + 80),
      );
      if (DISCLAIMER_WINDOW.test(context) && !/\bguarantee[sd]?\b/i.test(match))
        continue;
      hits.push(rx.source.replace(/\\b|\\s\+/g, " "));
      break;
    }
  }
  return { risky: hits.length > 0, reviewed: false, hits };
}

export function analysisBadge(a: ProtocolAnalysis) {
  if (a.mixStatus === "clip-risk" || !a.publishable) return "needs fixes";
  if (a.mixStatus === "hot") return "hot mix";
  return "safe to render";
}
