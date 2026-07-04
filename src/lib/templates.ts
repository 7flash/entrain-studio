import type {
  EntrainTemplateV1,
  EntrainSessionV1,
  TemplateTier,
} from "@/format/entrain-format";
import {
  createLinearGlideKeyframes,
  sanitizeSession,
  summarizeSession,
} from "@/format/entrain-format";
import { analyzeSession } from "@/format/protocol-analyzer";
import { sessionToSbagenText, sbagenTextToSession } from "@/format/sbagen";
import {
  compareToReference,
  type ProtocolLineageV1,
} from "@/format/protocol-reference";
import { db } from "./db";
import { dbMeasure } from "./measure";

function s(
  name: string,
  durationMin: number,
  layers: EntrainSessionV1["layers"],
  description?: string,
  loopMode: any = "hold-last",
): EntrainSessionV1 {
  return sanitizeSession({
    format: "entrain.session.v1",
    name,
    durationMin,
    description,
    layers,
    loop: {
      mode: loopMode,
      crossfadeSec: loopMode === "crossfade-repeat" ? 8 : 0,
    },
    export: { fadeSec: 4, sampleRate: 44100 },
  });
}
function t(input: Omit<EntrainTemplateV1, "format">): EntrainTemplateV1 {
  return {
    format: "entrain.template.v1",
    ...input,
    session: sanitizeSession(input.session),
  };
}

function lineage(
  referenceId: string,
  accuracy: ProtocolLineageV1["accuracy"],
  disclosure: string,
  intentionalDifferences: string[] = [],
): ProtocolLineageV1 {
  return {
    referenceId,
    accuracy,
    sourceLabel: "Report-derived comparison table / synthesis notes",
    disclosure,
    intentionalDifferences,
  };
}

export const BUILTIN_SOUNDTRACK_REVISION =
  "builtin-v39-explore-categories-community";

export const seedTemplates: EntrainTemplateV1[] = [
  t({
    slug: "alpha-wind-down",
    title: "Alpha → Theta Wind-down",
    category: "basic",
    tier: "free",
    minTokens: 0,
    summary: "A gentle alpha-to-theta descent with a pink noise bed.",
    description:
      "Designed as a transparent version of the common wind-down descent: start in relaxed alpha, glide toward upper theta, and keep a low masking bed underneath. Good as a safe default template for validating the studio and export path.",
    tags: ["binaural", "alpha", "theta", "free"],
    session: s("Alpha → Theta Wind-down", 20, [
      {
        id: "alpha-theta",
        type: "binaural",
        carrierHz: 220,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 10, gainPct: 45 },
          { tMin: 15, beatHz: 6, gainPct: 42 },
          { tMin: 20, beatHz: 6, gainPct: 36 },
        ],
      },
      {
        id: "pink-bed",
        type: "noise",
        noiseColor: "pink",
        pan: 0,
        panMotion: { rateHz: 0.015, depth: 0.12 },
        keyframes: [
          { tMin: 0, gainPct: 20 },
          { tMin: 20, gainPct: 24 },
        ],
      },
    ]),
  }),
  t({
    slug: "focus-drill",
    title: "Beta Focus Drill",
    category: "basic",
    tier: "free",
    minTokens: 0,
    summary: "A crisp 18 Hz isochronic drill with a quiet alpha stabilizer.",
    description:
      "A practical focus-training setup based on a fast external anchor: beta-rate isochronic pulses, a fixed point, and a softer alpha bed. It keeps the claims grounded: this is an attention drill, not a medical protocol.",
    tags: ["isochronic", "beta", "focus", "free"],
    session: s("Beta Focus Drill", 20, [
      {
        id: "beta-iso",
        type: "iso-trap",
        carrierHz: 260,
        wave: "sine",
        isoPulse: { edgeMs: 8, duty: 0.45 },
        pan: 0,
        panMotion: { rateHz: 0.02, depth: 0.2 },
        keyframes: [
          { tMin: 0, beatHz: 18, gainPct: 50 },
          { tMin: 20, beatHz: 18, gainPct: 50 },
        ],
      },
      {
        id: "alpha-bed",
        type: "binaural",
        carrierHz: 220,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 10, gainPct: 22 },
          { tMin: 20, beatHz: 10, gainPct: 22 },
        ],
      },
      {
        id: "pink-bed",
        type: "noise",
        noiseColor: "pink",
        keyframes: [
          { tMin: 0, gainPct: 15 },
          { tMin: 20, gainPct: 15 },
        ],
      },
    ]),
  }),
  t({
    slug: "ambience-drift-bed",
    title: "Ambience Drift Bed",
    category: "basic",
    tier: "holder",
    minTokens: 1,
    unlockNote:
      "Holder tier: demonstrates local ambience file handling and crossfaded loop metadata.",
    summary:
      "A sample/ambience layer template with slow stereo drift and crossfaded loop points.",
    description:
      "This template is built to test the runtime-only ambience model. Load your own rain, bowls, field recording, or room tone into the sample layer. The JSON stores loop points and filename hints, but not the audio buffer itself. The audio source is decoded locally and rendered locally.",
    tags: ["ambience", "sample", "pan-motion", "holder"],
    session: s("Ambience Drift Bed", 30, [
      {
        id: "ambience-main",
        type: "sample",
        sampleName: "load local ambience.wav",
        pan: 0,
        panMotion: { rateHz: 0.03, depth: 0.45 },
        sampleLoop: {
          mode: "crossfade",
          startSec: 0,
          endSec: 0,
          crossfadeSec: 3,
        },
        keyframes: [
          { tMin: 0, gainPct: 0 },
          { tMin: 2, gainPct: 24 },
          { tMin: 30, gainPct: 24 },
        ],
      },
      {
        id: "brown-bed",
        type: "noise",
        noiseColor: "brown",
        pan: 0,
        panMotion: { rateHz: 0.01, depth: 0.12 },
        keyframes: [
          { tMin: 0, gainPct: 14 },
          { tMin: 30, gainPct: 16 },
        ],
      },
    ]),
  }),
  t({
    slug: "mind-awake-body-rest",
    title: "Mind Awake Body Rest",
    category: "hemisync",
    tier: "holder",
    minTokens: 1,
    unlockNote: "Holder tier: basic multiplexed binaural stack.",
    summary:
      "Core two-layer Focus-10-style stack plus continuous pink noise bed.",
    description:
      "Core report-aligned reconstruction: 100 Hz / 1.5 Hz plus 200 Hz / 4.0 Hz, both continuous for 35 minutes over a procedural pink-noise mask. Disclosure: this is the simplified two-layer reconstruction, not an exact official tape clone; the report notes SBaGen-style measurements that include extra 250[4.0] and 300[4.0] carriers for a denser historical variant. Descriptive and experimental; not a medical or consciousness claim.",
    tags: ["binaural", "delta", "theta", "holder"],
    lineage: lineage(
      "core-focus-10",
      "curated-reconstruction",
      "Simplified/core Focus-10-style pattern: two static binaural layers over pink noise. Not an exact official tape clone.",
      [
        "Does not include denser 250[4.0] and 300[4.0] carriers noted elsewhere.",
        "Does not include voice guidance, exact original amplitude balance, or analog tape drift.",
      ],
    ),
    session: s("Mind Awake Body Rest", 35, [
      {
        id: "delta-anchor",
        type: "binaural",
        carrierHz: 100,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 1.5, gainPct: 20 },
          { tMin: 35, beatHz: 1.5, gainPct: 20 },
        ],
      },
      {
        id: "theta-support",
        type: "binaural",
        carrierHz: 200,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 4, gainPct: 20 },
          { tMin: 35, beatHz: 4, gainPct: 20 },
        ],
      },
      {
        id: "pink-mask",
        type: "noise",
        noiseColor: "pink",
        keyframes: [
          { tMin: 0, gainPct: 50 },
          { tMin: 35, gainPct: 50 },
        ],
      },
    ]),
  }),
  t({
    slug: "dense-mind-awake-body-rest",
    title: "Dense Mind Awake Body Rest",
    category: "hemisync",
    tier: "holder",
    minTokens: 1,
    unlockNote: "Holder tier: denser Focus-10-style carrier variant.",
    summary:
      "Four-layer Focus-10-style stack: 100[1.5], 200[4.0], 250[4.0], 300[4.0] over pink noise.",
    description:
      "Historical-carrier disclosure variant for the Focus-10-style pattern. It keeps the 100 Hz / 1.5 Hz delta anchor and adds 200 Hz, 250 Hz, and 300 Hz theta-rate carriers at 4.0 Hz over continuous pink noise. This is closer to the denser SBaGen-style carrier note than the simplified two-layer row, but still not an exact official tape clone because original amplitude balance, voice guidance, analog oscillator drift, and supporting material are not captured.",
    tags: ["binaural", "delta", "theta", "historical-carriers", "holder"],
    lineage: lineage(
      "dense-focus-10",
      "historical-variant",
      "Dense carrier variant representing the 100[1.5], 200[4.0], 250[4.0], 300[4.0] map.",
      [
        "Amplitude balance is normalized for safe browser rendering.",
        "No original voice guidance, tape drift, or supporting material.",
      ],
    ),
    session: s("Dense Mind Awake Body Rest", 35, [
      {
        id: "delta-anchor",
        type: "binaural",
        carrierHz: 100,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 1.5, gainPct: 14 },
          { tMin: 35, beatHz: 1.5, gainPct: 14 },
        ],
      },
      {
        id: "theta-200",
        type: "binaural",
        carrierHz: 200,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 4, gainPct: 14 },
          { tMin: 35, beatHz: 4, gainPct: 14 },
        ],
      },
      {
        id: "theta-250",
        type: "binaural",
        carrierHz: 250,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 4, gainPct: 14 },
          { tMin: 35, beatHz: 4, gainPct: 14 },
        ],
      },
      {
        id: "theta-300",
        type: "binaural",
        carrierHz: 300,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 4, gainPct: 14 },
          { tMin: 35, beatHz: 4, gainPct: 14 },
        ],
      },
      {
        id: "pink-mask",
        type: "noise",
        noiseColor: "pink",
        keyframes: [
          { tMin: 0, gainPct: 50 },
          { tMin: 35, gainPct: 50 },
        ],
      },
    ]),
  }),
  t({
    slug: "expanded-awareness-stack",
    title: "Expanded Awareness Stack",
    category: "hemisync",
    tier: "pro",
    minTokens: 10,
    unlockNote: "Pro tier: larger stack with staged fade-ins.",
    summary:
      "Curated lower-carrier Focus-12-style stack: F10 base plus alpha/high-theta bridges.",
    description:
      "Curated report-aligned reconstruction: base 100 Hz / 1.5 Hz and 200 Hz / 4.0 Hz layers remain stable, while 250 Hz / 10.0→10.1 Hz and 300 Hz / 4.8 Hz layers fade in over the first minute. Disclosure: this is the report's modern lower-carrier aggregation, not a strict historical tape/SBaGen carrier map; the report notes higher historical carriers such as 400[10.0], 500[10.1], and 600[4.8], represented separately in the Dense Expanded Awareness Stack.",
    tags: ["binaural", "multi-layer", "pro"],
    lineage: lineage(
      "curated-focus-12",
      "curated-reconstruction",
      "Curated/lower-carrier Focus-12-style pattern: F10 base plus 250 Hz alpha and 300 Hz high-theta bridges.",
      [
        "Uses lower bridge carriers than the higher-carrier historical note.",
        "Does not include voice guidance, exact original amplitude balance, or analog tape drift.",
      ],
    ),
    session: s("Expanded Awareness Stack", 35, [
      {
        id: "delta-anchor",
        type: "binaural",
        carrierHz: 100,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 1.5, gainPct: 15 },
          { tMin: 35, beatHz: 1.5, gainPct: 15 },
        ],
      },
      {
        id: "theta-base",
        type: "binaural",
        carrierHz: 200,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 4, gainPct: 15 },
          { tMin: 35, beatHz: 4, gainPct: 15 },
        ],
      },
      {
        id: "alpha-fade",
        type: "binaural",
        carrierHz: 250,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 10, gainPct: 0 },
          { tMin: 1, beatHz: 10, gainPct: 15 },
          { tMin: 35, beatHz: 10.1, gainPct: 15 },
        ],
      },
      {
        id: "theta-high",
        type: "binaural",
        carrierHz: 300,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 4.8, gainPct: 0 },
          { tMin: 1, beatHz: 4.8, gainPct: 15 },
          { tMin: 35, beatHz: 4.8, gainPct: 15 },
        ],
      },
      {
        id: "pink-mask",
        type: "noise",
        noiseColor: "pink",
        keyframes: [
          { tMin: 0, gainPct: 50 },
          { tMin: 35, gainPct: 50 },
        ],
      },
    ]),
  }),
  t({
    slug: "dense-expanded-awareness-stack",
    title: "Dense Expanded Awareness Stack",
    category: "hemisync",
    tier: "pro",
    minTokens: 10,
    unlockNote: "Pro tier: SBaGen-noted higher-carrier Focus-12-style variant.",
    summary:
      "Higher-carrier Focus-12-style variant using the 400/500/600 Hz bridge carriers noted in the report.",
    description:
      "Historical-carrier disclosure variant: keeps the 100 Hz / 1.5 Hz and 200 Hz / 4.0 Hz base, then adds the higher bridge carriers noted in the report comparison: 400[10.0], 500[10.1], and 600[4.8]. These bridge layers fade in over the first minute over a continuous pink-noise mask. This is closer to the report's SBaGen/tape-carrier note than the curated lower-carrier stack, but still not a guaranteed exact official tape clone because original amplitude balance, voice guidance, analog oscillator drift, and supporting material are not captured.",
    tags: ["binaural", "multi-layer", "historical-carriers", "pro"],
    lineage: lineage(
      "dense-focus-12",
      "historical-variant",
      "Higher-carrier Focus-12-style variant using the report-noted 400/500/600 Hz bridge carriers.",
      [
        "Amplitude balance is normalized for headroom.",
        "No original voice guidance, exact tape drift, or supporting material.",
      ],
    ),
    session: s("Dense Expanded Awareness Stack", 35, [
      {
        id: "delta-anchor",
        type: "binaural",
        carrierHz: 100,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 1.5, gainPct: 12 },
          { tMin: 35, beatHz: 1.5, gainPct: 12 },
        ],
      },
      {
        id: "theta-base",
        type: "binaural",
        carrierHz: 200,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 4, gainPct: 12 },
          { tMin: 35, beatHz: 4, gainPct: 12 },
        ],
      },
      {
        id: "alpha-400",
        type: "binaural",
        carrierHz: 400,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 10, gainPct: 0 },
          { tMin: 1, beatHz: 10, gainPct: 12 },
          { tMin: 35, beatHz: 10, gainPct: 12 },
        ],
      },
      {
        id: "alpha-500",
        type: "binaural",
        carrierHz: 500,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 10.1, gainPct: 0 },
          { tMin: 1, beatHz: 10.1, gainPct: 12 },
          { tMin: 35, beatHz: 10.1, gainPct: 12 },
        ],
      },
      {
        id: "theta-600",
        type: "binaural",
        carrierHz: 600,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 4.8, gainPct: 0 },
          { tMin: 1, beatHz: 4.8, gainPct: 12 },
          { tMin: 35, beatHz: 4.8, gainPct: 12 },
        ],
      },
      {
        id: "pink-mask",
        type: "noise",
        noiseColor: "pink",
        keyframes: [
          { tMin: 0, gainPct: 50 },
          { tMin: 35, gainPct: 50 },
        ],
      },
    ]),
  }),
  t({
    slug: "deep-descent-60",
    title: "Deep Descent 60",
    category: "holosync",
    tier: "pro",
    minTokens: 10,
    unlockNote:
      "Pro tier: long-form descent plus optional local ambience track.",
    summary: "A 60-minute 140 Hz binaural descent from alpha toward low delta.",
    description:
      "A report-aligned long-form descent: one 140 Hz binaural carrier. Phase 1 uses f_b(t)=10−0.004167t seconds for 0–30 min (10 → 2.5 Hz). Phase 2 uses f_b(t)=2.5−0.000556(t−1800) seconds for 30–60 min (2.5 → 1.5 Hz). The oscillator integrates instantaneous frequency internally; the stored keyframes are the auditable linear glide definition. Masking uses a portable heavy-rain + bowl-drone procedural recipe rather than bundled recordings.",
    tags: ["binaural", "longform", "delta", "premium"],
    lineage: lineage(
      "deep-descent-60",
      "curated-reconstruction",
      "Report-aligned long-form descent with portable procedural ambience instead of bundled rain/bowl recordings.",
      [
        "Uses a portable procedural heavy-rain-bowls recipe rather than local/copyrighted ambience recordings.",
      ],
    ),
    session: s(
      "Deep Descent 60",
      60,
      [
        {
          id: "descent",
          type: "binaural",
          carrierHz: 140,
          wave: "sine",
          keyframes: [
            ...createLinearGlideKeyframes(10, 2.5, 30, 20),
            { tMin: 60, beatHz: 1.5, gainPct: 18 },
          ],
        },
        {
          id: "heavy-rain-bowls",
          type: "procedural-ambience",
          ambienceRecipe: "heavy-rain-bowls",
          seed: 6060,
          pan: 0,
          panMotion: { rateHz: 0.03, depth: 0.18 },
          keyframes: [
            { tMin: 0, gainPct: 0 },
            { tMin: 2, gainPct: 50 },
            { tMin: 60, gainPct: 50 },
          ],
        },
      ],
      undefined,
      "hold-last",
    ),
  }),
  t({
    slug: "focus-15-no-time",
    title: "Focus 15 · No-Time Drift",
    category: "hemisync",
    tier: "free",
    minTokens: 0,
    summary:
      "An inspired no-time style drift: deep delta base, theta bridge, and slow bowl/rain ambience.",
    description:
      "An ENTRAIN-original Focus-15-inspired soundtrack, not an official tape clone. It extends the gateway stack into a quieter no-time style arc: stable low delta, soft theta, and a portable heavy-rain-bowls bed with slow spatial drift. Use as a prepared meditative soundtrack and as a reference for long quiet interpolation.",
    tags: ["gateway", "focus-15", "delta", "theta", "ambience", "prepared"],
    lineage: lineage(
      "",
      "inspired",
      "Inspired by the Focus-level trajectory notes. No exact public carrier map is claimed.",
      [
        "No voice guidance or official tape material.",
        "Carrier/beat choices are ENTRAIN-designed for comfortable browser playback.",
      ],
    ),
    session: s("Focus 15 · No-Time Drift", 45, [
      {
        id: "delta-floor",
        type: "binaural",
        carrierHz: 100,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 2.5, gainPct: 0 },
          { tMin: 4, beatHz: 1.5, gainPct: 16 },
          { tMin: 45, beatHz: 1.5, gainPct: 16 },
        ],
      },
      {
        id: "theta-thread",
        type: "binaural",
        carrierHz: 200,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 6, gainPct: 10 },
          { tMin: 12, beatHz: 4, gainPct: 14 },
          { tMin: 45, beatHz: 4, gainPct: 12 },
        ],
      },
      {
        id: "soft-alpha-gate",
        type: "binaural",
        carrierHz: 250,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 10, gainPct: 10 },
          { tMin: 10, beatHz: 8, gainPct: 6 },
          { tMin: 20, beatHz: 8, gainPct: 0 },
          { tMin: 45, beatHz: 8, gainPct: 0 },
        ],
      },
      {
        id: "no-time-bed",
        type: "procedural-ambience",
        ambienceRecipe: "heavy-rain-bowls",
        seed: 1515,
        pan: 0,
        panMotion: { rateHz: 0.018, depth: 0.18 },
        keyframes: [
          { tMin: 0, gainPct: 0 },
          { tMin: 3, gainPct: 42 },
          { tMin: 45, gainPct: 42 },
        ],
      },
    ]),
  }),
  t({
    slug: "focus-21-bridge",
    title: "Focus 21 · Bridge Field",
    category: "hemisync",
    tier: "free",
    minTokens: 0,
    summary:
      "A spacious bridge-state style stack with low delta, theta, and a gentle 7.8 Hz layer.",
    description:
      "An ENTRAIN-original Focus-21-inspired soundtrack. It is designed as a sparse bridge field rather than an exact replication: low delta floor, theta continuity, a faint 7.8 Hz spatial layer, and slow procedural ambience. It remains experimental and descriptive.",
    tags: ["gateway", "focus-21", "bridge", "theta", "delta", "prepared"],
    lineage: lineage(
      "",
      "inspired",
      "Inspired by Focus-level descriptions only; no exact official carrier map is claimed.",
      [
        "No voice guidance or original supporting material.",
        "Uses a portable procedural ambience bed.",
      ],
    ),
    session: s("Focus 21 · Bridge Field", 45, [
      {
        id: "delta-floor",
        type: "binaural",
        carrierHz: 100,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 1.5, gainPct: 14 },
          { tMin: 45, beatHz: 1.5, gainPct: 14 },
        ],
      },
      {
        id: "theta-bridge",
        type: "binaural",
        carrierHz: 200,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 4, gainPct: 12 },
          { tMin: 45, beatHz: 4.2, gainPct: 12 },
        ],
      },
      {
        id: "spatial-78",
        type: "binaural",
        carrierHz: 320,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 7.8, gainPct: 0 },
          { tMin: 6, beatHz: 7.8, gainPct: 8 },
          { tMin: 45, beatHz: 7.8, gainPct: 8 },
        ],
      },
      {
        id: "bridge-bowl",
        type: "additive",
        carrierHz: 136.1,
        partials: [
          { ratio: 1, gain: 1, decaySec: 1 },
          { ratio: 1.5, gain: 0.45, decaySec: 0.75 },
          { ratio: 2.01, gain: 0.28, decaySec: 0.55 },
          { ratio: 2.77, gain: 0.18, decaySec: 0.35 },
        ],
        pan: 0,
        panMotion: { rateHz: 0.012, depth: 0.16 },
        keyframes: [
          { tMin: 0, gainPct: 0 },
          { tMin: 5, gainPct: 18 },
          { tMin: 45, gainPct: 18 },
        ],
      },
      {
        id: "pink-bed",
        type: "noise",
        noiseColor: "pink",
        keyframes: [
          { tMin: 0, gainPct: 28 },
          { tMin: 45, gainPct: 28 },
        ],
      },
    ]),
  }),
  t({
    slug: "focus-22-transition-zone",
    title: "Focus 22 · Transition Zone",
    category: "hemisync",
    tier: "free",
    minTokens: 0,
    summary:
      "A slow transition-zone style soundscape: low delta, high theta, brown-room ambience.",
    description:
      "An ENTRAIN-original Focus-22-inspired soundscape. It is not a claim of exact historical replication; it uses a very slow delta anchor, high-theta support, and a brown-room procedural ambience to create a quiet, liminal prepared track.",
    tags: ["gateway", "focus-22", "liminal", "delta", "theta", "prepared"],
    lineage: lineage(
      "",
      "inspired",
      "Inspired by Focus-level descriptions only; no exact official carrier map is claimed.",
      [
        "No original guidance audio.",
        "Amplitude balance normalized for safe playback.",
      ],
    ),
    session: s("Focus 22 · Transition Zone", 35, [
      {
        id: "slow-delta",
        type: "binaural",
        carrierHz: 90,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 1.2, gainPct: 14 },
          { tMin: 35, beatHz: 1.2, gainPct: 14 },
        ],
      },
      {
        id: "high-theta",
        type: "binaural",
        carrierHz: 210,
        wave: "sine",
        keyframes: [
          { tMin: 0, beatHz: 4.8, gainPct: 12 },
          { tMin: 35, beatHz: 4.8, gainPct: 12 },
        ],
      },
      {
        id: "brown-room",
        type: "procedural-ambience",
        ambienceRecipe: "brown-room",
        seed: 2222,
        pan: 0,
        panMotion: { rateHz: 0.01, depth: 0.1 },
        keyframes: [
          { tMin: 0, gainPct: 0 },
          { tMin: 2, gainPct: 36 },
          { tMin: 35, gainPct: 36 },
        ],
      },
    ]),
  }),
  t({
    slug: "awakening-descent-110",
    title: "Deep Descent 60 · 110 Carrier",
    category: "holosync",
    tier: "free",
    minTokens: 0,
    summary: "A lower-carrier variant of the 60-minute 10→2.5→1.5 Hz descent.",
    description:
      "A Holosync-style lower-carrier descent variant: 110 Hz carrier with the same auditable 10→2.5→1.5 Hz beat glide across 60 minutes. This is an ENTRAIN-designed variant for users who want to compare carrier comfort and speaker/headphone behavior.",
    tags: ["binaural", "longform", "delta", "descent", "prepared"],
    lineage: lineage(
      "",
      "inspired",
      "Inspired by long-form descent practice, not an exact commercial-stage clone.",
      [
        "Uses 110 Hz carrier for comparison against the 140 Hz row.",
        "Uses portable heavy-rain-bowls ambience.",
      ],
    ),
    session: s("Deep Descent 60 · 110 Carrier", 60, [
      {
        id: "descent-110",
        type: "binaural",
        carrierHz: 110,
        wave: "sine",
        keyframes: [
          ...createLinearGlideKeyframes(10, 2.5, 30, 20),
          { tMin: 60, beatHz: 1.5, gainPct: 18 },
        ],
      },
      {
        id: "heavy-rain-bowls",
        type: "procedural-ambience",
        ambienceRecipe: "heavy-rain-bowls",
        seed: 6110,
        pan: 0,
        panMotion: { rateHz: 0.025, depth: 0.16 },
        keyframes: [
          { tMin: 0, gainPct: 0 },
          { tMin: 2, gainPct: 48 },
          { tMin: 60, gainPct: 48 },
        ],
      },
    ]),
  }),

  t({
    slug: "awakening-descent-135",
    title: "Deep Descent 60 · 135 Carrier",
    category: "holosync",
    tier: "free",
    minTokens: 0,
    summary: "A 135 Hz carrier variant of the 60-minute 10→2.5→1.5 Hz descent.",
    description:
      "A Holosync-style carrier-step variant. Same auditable 60-minute beat glide as Deep Descent 60, using a 135 Hz carrier for comparison and comfort testing.",
    tags: ["holosync-style", "binaural", "delta", "descent", "carrier-step"],
    lineage: lineage(
      "",
      "inspired",
      "Carrier-step variant inspired by staged long-form descent practice; not an exact commercial level.",
      ["Uses portable heavy-rain-bowls ambience."],
    ),
    session: s("Deep Descent 60 · 135 Carrier", 60, [
      {
        id: "descent-135",
        type: "binaural",
        carrierHz: 135,
        wave: "sine",
        keyframes: [
          ...createLinearGlideKeyframes(10, 2.5, 30, 20),
          { tMin: 60, beatHz: 1.5, gainPct: 18 },
        ],
      },
      {
        id: "heavy-rain-bowls",
        type: "procedural-ambience",
        ambienceRecipe: "heavy-rain-bowls",
        seed: 6135,
        pan: 0,
        panMotion: { rateHz: 0.025, depth: 0.16 },
        keyframes: [
          { tMin: 0, gainPct: 0 },
          { tMin: 2, gainPct: 48 },
          { tMin: 60, gainPct: 48 },
        ],
      },
    ]),
  }),
  t({
    slug: "awakening-descent-130",
    title: "Deep Descent 60 · 130 Carrier",
    category: "holosync",
    tier: "free",
    minTokens: 0,
    summary: "A 130 Hz carrier variant of the 60-minute 10→2.5→1.5 Hz descent.",
    description:
      "A Holosync-style carrier-step variant. Same auditable 60-minute beat glide as Deep Descent 60, using a 130 Hz carrier for comparison and comfort testing.",
    tags: ["holosync-style", "binaural", "delta", "descent", "carrier-step"],
    lineage: lineage(
      "",
      "inspired",
      "Carrier-step variant inspired by staged long-form descent practice; not an exact commercial level.",
      ["Uses portable heavy-rain-bowls ambience."],
    ),
    session: s("Deep Descent 60 · 130 Carrier", 60, [
      {
        id: "descent-130",
        type: "binaural",
        carrierHz: 130,
        wave: "sine",
        keyframes: [
          ...createLinearGlideKeyframes(10, 2.5, 30, 20),
          { tMin: 60, beatHz: 1.5, gainPct: 18 },
        ],
      },
      {
        id: "heavy-rain-bowls",
        type: "procedural-ambience",
        ambienceRecipe: "heavy-rain-bowls",
        seed: 6130,
        pan: 0,
        panMotion: { rateHz: 0.025, depth: 0.16 },
        keyframes: [
          { tMin: 0, gainPct: 0 },
          { tMin: 2, gainPct: 48 },
          { tMin: 60, gainPct: 48 },
        ],
      },
    ]),
  }),
  t({
    slug: "awakening-descent-125",
    title: "Deep Descent 60 · 125 Carrier",
    category: "holosync",
    tier: "free",
    minTokens: 0,
    summary: "A 125 Hz carrier variant of the 60-minute 10→2.5→1.5 Hz descent.",
    description:
      "A Holosync-style carrier-step variant. Same auditable 60-minute beat glide as Deep Descent 60, using a 125 Hz carrier for comparison and comfort testing.",
    tags: ["holosync-style", "binaural", "delta", "descent", "carrier-step"],
    lineage: lineage(
      "",
      "inspired",
      "Carrier-step variant inspired by staged long-form descent practice; not an exact commercial level.",
      ["Uses portable heavy-rain-bowls ambience."],
    ),
    session: s("Deep Descent 60 · 125 Carrier", 60, [
      {
        id: "descent-125",
        type: "binaural",
        carrierHz: 125,
        wave: "sine",
        keyframes: [
          ...createLinearGlideKeyframes(10, 2.5, 30, 20),
          { tMin: 60, beatHz: 1.5, gainPct: 18 },
        ],
      },
      {
        id: "heavy-rain-bowls",
        type: "procedural-ambience",
        ambienceRecipe: "heavy-rain-bowls",
        seed: 6125,
        pan: 0,
        panMotion: { rateHz: 0.025, depth: 0.16 },
        keyframes: [
          { tMin: 0, gainPct: 0 },
          { tMin: 2, gainPct: 48 },
          { tMin: 60, gainPct: 48 },
        ],
      },
    ]),
  }),
  t({
    slug: "awakening-descent-120",
    title: "Deep Descent 60 · 120 Carrier",
    category: "holosync",
    tier: "free",
    minTokens: 0,
    summary: "A 120 Hz carrier variant of the 60-minute 10→2.5→1.5 Hz descent.",
    description:
      "A Holosync-style carrier-step variant. Same auditable 60-minute beat glide as Deep Descent 60, using a 120 Hz carrier for comparison and comfort testing.",
    tags: ["holosync-style", "binaural", "delta", "descent", "carrier-step"],
    lineage: lineage(
      "",
      "inspired",
      "Carrier-step variant inspired by staged long-form descent practice; not an exact commercial level.",
      ["Uses portable heavy-rain-bowls ambience."],
    ),
    session: s("Deep Descent 60 · 120 Carrier", 60, [
      {
        id: "descent-120",
        type: "binaural",
        carrierHz: 120,
        wave: "sine",
        keyframes: [
          ...createLinearGlideKeyframes(10, 2.5, 30, 20),
          { tMin: 60, beatHz: 1.5, gainPct: 18 },
        ],
      },
      {
        id: "heavy-rain-bowls",
        type: "procedural-ambience",
        ambienceRecipe: "heavy-rain-bowls",
        seed: 6120,
        pan: 0,
        panMotion: { rateHz: 0.025, depth: 0.16 },
        keyframes: [
          { tMin: 0, gainPct: 0 },
          { tMin: 2, gainPct: 48 },
          { tMin: 60, gainPct: 48 },
        ],
      },
    ]),
  }),
  t({
    slug: "awakening-descent-115",
    title: "Deep Descent 60 · 115 Carrier",
    category: "holosync",
    tier: "free",
    minTokens: 0,
    summary: "A 115 Hz carrier variant of the 60-minute 10→2.5→1.5 Hz descent.",
    description:
      "A Holosync-style carrier-step variant. Same auditable 60-minute beat glide as Deep Descent 60, using a 115 Hz carrier for comparison and comfort testing.",
    tags: ["holosync-style", "binaural", "delta", "descent", "carrier-step"],
    lineage: lineage(
      "",
      "inspired",
      "Carrier-step variant inspired by staged long-form descent practice; not an exact commercial level.",
      ["Uses portable heavy-rain-bowls ambience."],
    ),
    session: s("Deep Descent 60 · 115 Carrier", 60, [
      {
        id: "descent-115",
        type: "binaural",
        carrierHz: 115,
        wave: "sine",
        keyframes: [
          ...createLinearGlideKeyframes(10, 2.5, 30, 20),
          { tMin: 60, beatHz: 1.5, gainPct: 18 },
        ],
      },
      {
        id: "heavy-rain-bowls",
        type: "procedural-ambience",
        ambienceRecipe: "heavy-rain-bowls",
        seed: 6115,
        pan: 0,
        panMotion: { rateHz: 0.025, depth: 0.16 },
        keyframes: [
          { tMin: 0, gainPct: 0 },
          { tMin: 2, gainPct: 48 },
          { tMin: 60, gainPct: 48 },
        ],
      },
    ]),
  }),
  t({
    slug: "collector-40hz-suite",
    title: "40 Hz Collector Suite",
    category: "basic",
    tier: "collector",
    minTokens: 100,
    unlockNote: "Collector tier: high-threshold experimental template.",
    summary:
      "A 40 Hz monaural/isochronic comparison with optional ambience masking.",
    description:
      "A deliberately high-threshold template for collectors: monaural 40 Hz, optional isochronic 40 Hz, and a quiet pink bed. It is framed as an audio-engine stress test and research-reading companion, not a treatment.",
    tags: ["gamma", "collector", "monaural", "isochronic"],
    session: s("40 Hz Collector Suite", 25, [
      {
        id: "monaural-40",
        type: "monaural",
        carrierHz: 300,
        wave: "sine",
        pan: 0,
        panMotion: { rateHz: 0.018, depth: 0.18 },
        keyframes: [
          { tMin: 0, beatHz: 40, gainPct: 34 },
          { tMin: 25, beatHz: 40, gainPct: 34 },
        ],
      },
      {
        id: "iso-40",
        type: "iso-trap",
        carrierHz: 220,
        wave: "sine",
        isoPulse: { edgeMs: 4, duty: 0.45 },
        pan: 0,
        panMotion: { rateHz: 0.011, depth: 0.14 },
        keyframes: [
          { tMin: 0, beatHz: 40, gainPct: 0 },
          { tMin: 5, beatHz: 40, gainPct: 16 },
          { tMin: 25, beatHz: 40, gainPct: 14 },
        ],
      },
      {
        id: "pink-bed",
        type: "noise",
        noiseColor: "pink",
        keyframes: [
          { tMin: 0, gainPct: 12 },
          { tMin: 25, gainPct: 14 },
        ],
      },
    ]),
  }),
];

export function seedIfNeeded() {
  return dbMeasure.measure("Seed templates", () => {
    if (db.templates.count() > 0) return false;
    syncBuiltInTemplates("missing");
    return true;
  });
}

export function syncBuiltInTemplates(mode: "missing" | "upsert" = "missing") {
  return dbMeasure.measure("Sync built-in soundtracks", () => {
    let inserted = 0;
    let updated = 0;
    seedTemplates.forEach((template, i) => {
      const row = rowFromTemplate(template, i);
      const existing = db.templates
        .select()
        .where({ slug: row.slug })
        .first() as any;
      if (!existing) {
        db.templates.insert(row);
        inserted++;
      } else if (mode === "upsert") {
        db.templates.update(row).where({ slug: row.slug }).run();
        updated++;
      }
    });
    return {
      inserted,
      updated,
      total: seedTemplates.length,
      revision: BUILTIN_SOUNDTRACK_REVISION,
    };
  });
}

export function rowFromTemplate(
  template: EntrainTemplateV1,
  sortOrder: number,
) {
  const analysis = analyzeSession(template.session);
  const referenceMatch = compareToReference(
    template.session,
    template.lineage?.referenceId,
  );
  return {
    slug: template.slug,
    title: template.title,
    summary: template.summary,
    description: template.description,
    category: template.category,
    tier: template.tier,
    tags: template.tags,
    minTokens: template.minTokens,
    unlockNote: template.unlockNote || "",
    session: template.session, // compiled player cache
    scriptFormat: template.scriptFormat || "sbagen.v1",
    scriptText: template.scriptText || sessionToSbagenText(template.session),
    sortOrder,
    isPublished: true,
    status: "published",
    formatVersion: "entrain.session.v1",
    patternHash: patternHash(template.session),
    analysisJson: analysis,
    safetyJson: { referenceMatch },
    evidenceLevel: template.evidenceLevel || "experimental",
    headphonesRequired: analysis.headphonesRequired,
    defaultLoopMode: template.session.loop?.mode || "hold-last",
    defaultExportSec: template.session.durationMin * 60,
    lineageJson: template.lineage || null,
    referenceMatchJson: referenceMatch,
    seedRevision: BUILTIN_SOUNDTRACK_REVISION,
    marketKind:
      template.market?.kind || (template.minTokens > 0 ? "token" : "free"),
    priceLamports: Number(template.market?.priceLamports || 0),
    priceCurrency: template.market?.priceCurrency || "SOL",
    payoutWallet: template.market?.payoutWallet || "",
    ownerPublicKey: template.ownerPublicKey || "",
    creatorName: template.creatorName || "",
    ownerEmail: (template as any).ownerEmail || "",
    creatorWallet: template.creatorWallet || "",
    publishedByUser: !!template.publishedByUser,
    purchaseCount: Number(template.market?.purchaseCount || 0),
  };
}

function fallbackRows() {
  return seedTemplates.map((template, i) => ({
    ...template,
    sortOrder: i,
    isPublished: true,
  }));
}

export function allTemplates() {
  const rows = db.templates
    .select()
    .where({ isPublished: true })
    .orderBy("sortOrder", "ASC")
    .all() as any[];
  return (rows.length ? rows : fallbackRows()).map(normalizeTemplate);
}

export function templatesByCategory() {
  const groups = new Map<string, EntrainTemplateV1[]>();
  for (const template of allTemplates()) {
    const key = template.category || "uncategorized";
    groups.set(key, [...(groups.get(key) || []), template]);
  }
  return [...groups.entries()].map(([category, templates]) => ({
    category,
    templates,
  }));
}

export function featuredTemplates(n = 3) {
  return allTemplates().slice(0, n);
}

export function findTemplate(slug: string) {
  const row = db.templates
    .select()
    .where({ slug, isPublished: true })
    .first() as any;
  return row
    ? normalizeTemplate(row)
    : seedTemplates.find((template) => template.slug === slug) || null;
}

export function tierForMinTokens(minTokens: number): TemplateTier {
  if (minTokens >= 100) return "collector";
  if (minTokens >= 10) return "pro";
  if (minTokens >= 1) return "holder";
  return "free";
}

function normalizeTemplate(row: any): EntrainTemplateV1 {
  const minTokens = Number(row.minTokens || 0);
  let tags: string[] = [];
  try {
    tags = Array.isArray(row.tags) ? row.tags : JSON.parse(row.tags || "[]");
  } catch {
    tags = [];
  }
  return {
    format: "entrain.template.v1",
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    category: row.category,
    tier: (row.tier || tierForMinTokens(minTokens)) as TemplateTier,
    tags,
    minTokens,
    unlockNote: row.unlockNote || undefined,
    session: sanitizeSession(
      row.session ||
        (row.scriptText
          ? sbagenTextToSession(row.scriptText, {
              name: row.title,
              defaultDurationMin: 20,
            }).session
          : undefined),
    ),
    scriptFormat: row.scriptFormat || "sbagen.v1",
    scriptText:
      row.scriptText || sessionToSbagenText(sanitizeSession(row.session)),
    lineage: row.lineageJson || row.lineage || undefined,
    ownerPublicKey: row.ownerPublicKey || undefined,
    creatorName: row.creatorName || undefined,
    ownerEmail: row.ownerEmail || undefined,
    creatorWallet: row.creatorWallet || undefined,
    publishedByUser: !!row.publishedByUser,
    market: {
      kind: row.marketKind || (minTokens > 0 ? "token" : "free"),
      priceLamports: Number(row.priceLamports || 0),
      priceCurrency: "SOL",
      payoutWallet: row.payoutWallet || row.creatorWallet || undefined,
      purchaseCount: Number(row.purchaseCount || 0),
    },
  };
}

export function soundtrackSummary(slug: string) {
  const template = findTemplate(slug);
  return template ? summarizeSession(template.session) : null;
}

export function patternHash(session: EntrainSessionV1) {
  const json = stableStringify(signalProjection(sanitizeSession(session)));
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function signalProjection(session: EntrainSessionV1) {
  return {
    format: session.format,
    durationMin: session.durationMin,
    loop: session.loop || { mode: "hold-last", crossfadeSec: 0 },
    export: session.export || {},
    layers: session.layers.map((l) => ({
      type: l.type,
      carrierHz: l.carrierHz,
      wave: l.wave,
      noiseColor: l.noiseColor,
      ambienceRecipe: l.ambienceRecipe,
      seed: l.seed,
      pan: l.pan,
      panMotion: l.panMotion,
      sampleName: l.sampleName,
      sampleLoop: l.sampleLoop,
      partials: l.partials,
      envelope: l.envelope,
      karplus: l.karplus,
      mute: l.mute,
      solo: l.solo,
      keyframes: l.keyframes.map((k) => ({
        tMin: k.tMin,
        beatHz: k.beatHz,
        carrierHz: k.carrierHz,
        gainPct: k.gainPct,
      })),
    })),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value))
    return "[" + value.map(stableStringify).join(",") + "]";
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return (
      "{" +
      Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}
