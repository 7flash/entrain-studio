import {
  sanitizeSession,
  type EntrainSessionV1,
  type EntrainLayerV1,
} from "./entrain-format";

export type ReferenceAccuracy =
  | "exact-to-report"
  | "curated-reconstruction"
  | "historical-variant"
  | "inspired";

export type ProtocolLineageV1 = {
  referenceId?: string;
  accuracy?: ReferenceAccuracy;
  sourceLabel?: string;
  disclosure?: string;
  intentionalDifferences?: string[];
};

export type ReferenceBeatLayer = {
  label: string;
  type: "binaural" | "monaural" | "iso-smooth" | "iso-hard";
  carrierHz: number;
  beats: Array<{ tMin: number; beatHz: number; gainPct?: number }>;
};

export type ReferenceBedLayer = {
  label: string;
  type: "noise" | "procedural-ambience" | "sample";
  noiseColor?: "white" | "pink" | "brown";
  ambienceRecipe?: "rain" | "pink-rain" | "brown-room" | "bowl-drone";
  gainPct?: number;
};

export type ProtocolReference = {
  id: string;
  title: string;
  durationMin: number;
  accuracy: ReferenceAccuracy;
  notes: string[];
  beatLayers: ReferenceBeatLayer[];
  beds: ReferenceBedLayer[];
};

export type ReferenceDeviation = {
  level: "info" | "warn" | "error";
  code: string;
  message: string;
  expected?: string;
  actual?: string;
  layerLabel?: string;
};

export type ReferenceMatch = {
  referenceId: string;
  referenceTitle: string;
  accuracy: ReferenceAccuracy;
  matches: boolean;
  score: number;
  deviations: ReferenceDeviation[];
};

const EPS_HZ = 0.151;
const EPS_MIN = 0.06;

export const protocolReferences: Record<string, ProtocolReference> = {
  "core-focus-10": {
    id: "core-focus-10",
    title: "Core Focus-10-style dual stack",
    durationMin: 35,
    accuracy: "curated-reconstruction",
    notes: [
      "Reference used for the simplified/core Focus-10-style row.",
      "Uses two static binaural layers over continuous pink noise.",
      "Not a claim of exact official tape replication.",
    ],
    beatLayers: [
      {
        label: "Delta anchor",
        type: "binaural",
        carrierHz: 100,
        beats: [
          { tMin: 0, beatHz: 1.5 },
          { tMin: 35, beatHz: 1.5 },
        ],
      },
      {
        label: "Theta bridge",
        type: "binaural",
        carrierHz: 200,
        beats: [
          { tMin: 0, beatHz: 4.0 },
          { tMin: 35, beatHz: 4.0 },
        ],
      },
    ],
    beds: [
      {
        label: "Continuous pink noise mask",
        type: "noise",
        noiseColor: "pink",
      },
    ],
  },
  "dense-focus-10": {
    id: "dense-focus-10",
    title: "Dense Focus-10-style carrier stack",
    durationMin: 35,
    accuracy: "historical-variant",
    notes: [
      "SBaGen-style denser variant: 100[1.5], 200[4.0], 250[4.0], 300[4.0].",
      "Amplitude balance, voice guidance, and analog tape artifacts are not represented.",
    ],
    beatLayers: [
      {
        label: "Delta anchor",
        type: "binaural",
        carrierHz: 100,
        beats: [
          { tMin: 0, beatHz: 1.5 },
          { tMin: 35, beatHz: 1.5 },
        ],
      },
      {
        label: "Theta base 200",
        type: "binaural",
        carrierHz: 200,
        beats: [
          { tMin: 0, beatHz: 4.0 },
          { tMin: 35, beatHz: 4.0 },
        ],
      },
      {
        label: "Theta carrier 250",
        type: "binaural",
        carrierHz: 250,
        beats: [
          { tMin: 0, beatHz: 4.0 },
          { tMin: 35, beatHz: 4.0 },
        ],
      },
      {
        label: "Theta carrier 300",
        type: "binaural",
        carrierHz: 300,
        beats: [
          { tMin: 0, beatHz: 4.0 },
          { tMin: 35, beatHz: 4.0 },
        ],
      },
    ],
    beds: [
      {
        label: "Continuous pink noise mask",
        type: "noise",
        noiseColor: "pink",
      },
    ],
  },
  "curated-focus-12": {
    id: "curated-focus-12",
    title: "Curated lower-carrier Focus-12-style stack",
    durationMin: 35,
    accuracy: "curated-reconstruction",
    notes: [
      "Lower-carrier reconstruction: F10 base plus 250 Hz alpha bridge and 300 Hz high-theta bridge.",
      "Bridge layers fade in during the first minute.",
      "The dense historical-carrier variant is represented separately.",
    ],
    beatLayers: [
      {
        label: "Delta base",
        type: "binaural",
        carrierHz: 100,
        beats: [
          { tMin: 0, beatHz: 1.5 },
          { tMin: 35, beatHz: 1.5 },
        ],
      },
      {
        label: "Theta base",
        type: "binaural",
        carrierHz: 200,
        beats: [
          { tMin: 0, beatHz: 4.0 },
          { tMin: 35, beatHz: 4.0 },
        ],
      },
      {
        label: "Alpha expansion",
        type: "binaural",
        carrierHz: 250,
        beats: [
          { tMin: 0, beatHz: 10.0, gainPct: 0 },
          { tMin: 1, beatHz: 10.0 },
          { tMin: 35, beatHz: 10.1 },
        ],
      },
      {
        label: "High-theta bridge",
        type: "binaural",
        carrierHz: 300,
        beats: [
          { tMin: 0, beatHz: 4.8, gainPct: 0 },
          { tMin: 1, beatHz: 4.8 },
          { tMin: 35, beatHz: 4.8 },
        ],
      },
    ],
    beds: [
      {
        label: "Continuous pink noise mask",
        type: "noise",
        noiseColor: "pink",
      },
    ],
  },
  "dense-focus-12": {
    id: "dense-focus-12",
    title: "Dense Focus-12-style historical-carrier stack",
    durationMin: 35,
    accuracy: "historical-variant",
    notes: [
      "Higher-carrier variant with bridge carriers 400[10.0], 500[10.1], and 600[4.8].",
      "This captures the carrier map note, not original amplitude balance, voice guidance, or tape artifacts.",
    ],
    beatLayers: [
      {
        label: "Delta base",
        type: "binaural",
        carrierHz: 100,
        beats: [
          { tMin: 0, beatHz: 1.5 },
          { tMin: 35, beatHz: 1.5 },
        ],
      },
      {
        label: "Theta base",
        type: "binaural",
        carrierHz: 200,
        beats: [
          { tMin: 0, beatHz: 4.0 },
          { tMin: 35, beatHz: 4.0 },
        ],
      },
      {
        label: "Alpha 400",
        type: "binaural",
        carrierHz: 400,
        beats: [
          { tMin: 0, beatHz: 10.0, gainPct: 0 },
          { tMin: 1, beatHz: 10.0 },
          { tMin: 35, beatHz: 10.0 },
        ],
      },
      {
        label: "Alpha 500",
        type: "binaural",
        carrierHz: 500,
        beats: [
          { tMin: 0, beatHz: 10.1, gainPct: 0 },
          { tMin: 1, beatHz: 10.1 },
          { tMin: 35, beatHz: 10.1 },
        ],
      },
      {
        label: "High-theta 600",
        type: "binaural",
        carrierHz: 600,
        beats: [
          { tMin: 0, beatHz: 4.8, gainPct: 0 },
          { tMin: 1, beatHz: 4.8 },
          { tMin: 35, beatHz: 4.8 },
        ],
      },
    ],
    beds: [
      {
        label: "Continuous pink noise mask",
        type: "noise",
        noiseColor: "pink",
      },
    ],
  },
  "deep-descent-60": {
    id: "deep-descent-60",
    title: "Deep Descent 60 report-aligned glide",
    durationMin: 60,
    accuracy: "curated-reconstruction",
    notes: [
      "One 140 Hz carrier glides 10→2.5 Hz over minutes 0–30 and 2.5→1.5 Hz over minutes 30–60.",
      "Portable procedural rain/bowl ambience substitutes for local or copyrighted ambience recordings.",
    ],
    beatLayers: [
      {
        label: "140 Hz descent",
        type: "binaural",
        carrierHz: 140,
        beats: [
          { tMin: 0, beatHz: 10.0 },
          { tMin: 30, beatHz: 2.5 },
          { tMin: 60, beatHz: 1.5 },
        ],
      },
    ],
    beds: [
      {
        label: "Rain mask",
        type: "procedural-ambience",
        ambienceRecipe: "rain",
      },
      {
        label: "Bowl drone",
        type: "procedural-ambience",
        ambienceRecipe: "bowl-drone",
      },
    ],
  },
};

export function compareToReference(
  input: any,
  referenceId?: string,
): ReferenceMatch | null {
  if (!referenceId) return null;
  const ref = protocolReferences[referenceId];
  if (!ref) return null;
  const session = sanitizeSession(input);
  const deviations: ReferenceDeviation[] = [];

  if (Math.abs(session.durationMin - ref.durationMin) > EPS_MIN) {
    deviations.push({
      level: "error",
      code: "duration-mismatch",
      message: `Duration does not match ${ref.durationMin} minutes.`,
      expected: `${ref.durationMin}m`,
      actual: `${session.durationMin}m`,
    });
  }

  const used = new Set<string>();
  for (const expected of ref.beatLayers) {
    const actual = findBeatLayer(session.layers, expected, used);
    if (!actual) {
      deviations.push({
        level: "error",
        code: "missing-beat-layer",
        layerLabel: expected.label,
        message: `Missing ${expected.label}.`,
        expected: describeExpected(expected),
      });
      continue;
    }
    used.add(actual.id);
    checkKeyframes(actual, expected, deviations);
  }

  for (const bed of ref.beds) {
    if (!findBedLayer(session.layers, bed)) {
      deviations.push({
        level: bed.type === "procedural-ambience" ? "warn" : "error",
        code: "missing-bed-layer",
        layerLabel: bed.label,
        message: `Missing ${bed.label}.`,
        expected: describeBed(bed),
      });
    }
  }

  const expectedCarriers = new Set(
    ref.beatLayers.map((l) => `${l.type}:${l.carrierHz}`),
  );
  const extraBeatLayers = session.layers.filter(
    (l) =>
      isBeatLayer(l) &&
      !used.has(l.id) &&
      !expectedCarriers.has(`${l.type}:${Math.round(l.carrierHz || 0)}`),
  );
  for (const extra of extraBeatLayers) {
    deviations.push({
      level: "info",
      code: "extra-beat-layer",
      layerLabel: extra.id,
      message: "Extra beat layer not in the declared reference.",
      actual: describeLayer(extra),
    });
  }

  const errors = deviations.filter((d) => d.level === "error").length;
  const warns = deviations.filter((d) => d.level === "warn").length;
  const score = Math.max(
    0,
    100 -
      errors * 30 -
      warns * 10 -
      Math.max(0, deviations.length - errors - warns) * 2,
  );
  return {
    referenceId: ref.id,
    referenceTitle: ref.title,
    accuracy: ref.accuracy,
    matches: errors === 0,
    score,
    deviations,
  };
}

function isBeatLayer(layer: EntrainLayerV1) {
  return ["binaural", "monaural", "iso-smooth", "iso-hard"].includes(
    layer.type,
  );
}

function findBeatLayer(
  layers: EntrainLayerV1[],
  expected: ReferenceBeatLayer,
  used: Set<string>,
) {
  return layers.find(
    (l) =>
      !used.has(l.id) &&
      l.type === expected.type &&
      Math.abs((l.carrierHz || 0) - expected.carrierHz) <= EPS_HZ,
  );
}

function findBedLayer(layers: EntrainLayerV1[], expected: ReferenceBedLayer) {
  return layers.find((l) => {
    if (l.type !== expected.type) return false;
    if (expected.noiseColor && l.noiseColor !== expected.noiseColor)
      return false;
    if (expected.ambienceRecipe && l.ambienceRecipe !== expected.ambienceRecipe)
      return false;
    return true;
  });
}

function checkKeyframes(
  layer: EntrainLayerV1,
  expected: ReferenceBeatLayer,
  out: ReferenceDeviation[],
) {
  for (const point of expected.beats) {
    const nearest = nearestKeyframe(layer, point.tMin);
    if (!nearest) {
      out.push({
        level: "error",
        code: "missing-keyframe",
        layerLabel: expected.label,
        message: `Missing keyframe near ${point.tMin}m.`,
        expected: `${point.tMin}m ${point.beatHz}Hz`,
      });
      continue;
    }
    if (Math.abs(nearest.tMin - point.tMin) > EPS_MIN) {
      out.push({
        level: "warn",
        code: "keyframe-time-drift",
        layerLabel: expected.label,
        message: `Nearest keyframe time differs from ${point.tMin}m.`,
        expected: `${point.tMin}m`,
        actual: `${nearest.tMin}m`,
      });
    }
    if (
      typeof nearest.beatHz !== "number" ||
      Math.abs(nearest.beatHz - point.beatHz) > EPS_HZ
    ) {
      out.push({
        level: "error",
        code: "beat-mismatch",
        layerLabel: expected.label,
        message: `Beat does not match at ${point.tMin}m.`,
        expected: `${point.beatHz}Hz`,
        actual: nearest.beatHz == null ? "none" : `${nearest.beatHz}Hz`,
      });
    }
    if (
      point.gainPct != null &&
      Math.abs(nearest.gainPct - point.gainPct) > 0.75
    ) {
      out.push({
        level: "info",
        code: "gain-advisory",
        layerLabel: expected.label,
        message: `Gain/fade point differs from the reference at ${point.tMin}m; signal shape still matches, but amplitude balance is normalized/advisory.`,
        expected: `${point.gainPct}%`,
        actual: `${nearest.gainPct}%`,
      });
    }
  }
}

function nearestKeyframe(layer: EntrainLayerV1, tMin: number) {
  return [...layer.keyframes].sort(
    (a, b) => Math.abs(a.tMin - tMin) - Math.abs(b.tMin - tMin),
  )[0];
}

function describeExpected(layer: ReferenceBeatLayer) {
  return `${layer.type} carrier ${layer.carrierHz} Hz · ${layer.beats.map((b) => `${b.tMin}m:${b.beatHz}Hz`).join(" → ")}`;
}
function describeLayer(layer: EntrainLayerV1) {
  return `${layer.type} carrier ${layer.carrierHz || "-"} Hz · ${layer.keyframes.map((b) => `${b.tMin}m:${b.beatHz ?? "-"}Hz/${b.gainPct}%`).join(" → ")}`;
}
function describeBed(layer: ReferenceBedLayer) {
  if (layer.type === "noise") return `${layer.noiseColor || "pink"} noise`;
  if (layer.type === "procedural-ambience")
    return `${layer.ambienceRecipe || "ambience"} procedural ambience`;
  return "local sample ambience";
}
