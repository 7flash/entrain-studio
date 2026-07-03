import type { EntrainTemplateV1, EntrainSessionV1, TemplateTier } from '@/format/entrain-format';
import { sanitizeSession, summarizeSession } from '@/format/entrain-format';
import { analyzeSession } from '@/format/protocol-analyzer';
import { compareToReference, type ProtocolLineageV1 } from '@/format/protocol-reference';
import { db } from './db';
import { dbMeasure } from './measure';

function s(name: string, durationMin: number, layers: EntrainSessionV1['layers'], description?: string, loopMode: any = 'hold-last'): EntrainSessionV1 {
  return sanitizeSession({ format: 'entrain.session.v1', name, durationMin, description, layers, loop: { mode: loopMode, crossfadeSec: loopMode === 'crossfade-repeat' ? 8 : 0 }, export: { fadeSec: 4, sampleRate: 44100 } });
}
function t(input: Omit<EntrainTemplateV1, 'format'>): EntrainTemplateV1 {
  return { format: 'entrain.template.v1', ...input, session: sanitizeSession(input.session) };
}

function lineage(referenceId: string, accuracy: ProtocolLineageV1['accuracy'], disclosure: string, intentionalDifferences: string[] = []): ProtocolLineageV1 {
  return { referenceId, accuracy, sourceLabel: 'Report-derived comparison table / synthesis notes', disclosure, intentionalDifferences };
}

export const BUILTIN_SOUNDTRACK_REVISION = 'builtin-v17-creator-marketplace';

export const seedTemplates: EntrainTemplateV1[] = [
  t({
    slug: 'alpha-wind-down', title: 'Alpha → Theta Wind-down', category: 'relax', tier: 'free', minTokens: 0,
    summary: 'A gentle alpha-to-theta descent with a pink noise bed.',
    description: 'Designed as a transparent version of the common wind-down descent: start in relaxed alpha, glide toward upper theta, and keep a low masking bed underneath. Good as a safe default template for validating the studio and export path.',
    tags: ['binaural', 'alpha', 'theta', 'free'],
    session: s('Alpha → Theta Wind-down',20,[
      { id:'alpha-theta', type:'binaural', carrierHz:220, wave:'sine', keyframes:[{tMin:0,beatHz:10,gainPct:45},{tMin:15,beatHz:6,gainPct:42},{tMin:20,beatHz:6,gainPct:36}] },
      { id:'pink-bed', type:'noise', noiseColor:'pink', pan:0, panMotion:{rateHz:0.015,depth:0.12}, keyframes:[{tMin:0,gainPct:20},{tMin:20,gainPct:24}] }
    ])
  }),
  t({
    slug: 'focus-drill', title: 'Beta Focus Drill', category: 'focus', tier: 'free', minTokens: 0,
    summary: 'A crisp 18 Hz isochronic drill with a quiet alpha stabilizer.',
    description: 'A practical focus-training setup based on a fast external anchor: beta-rate isochronic pulses, a fixed point, and a softer alpha bed. It keeps the claims grounded: this is an attention drill, not a medical protocol.',
    tags: ['isochronic', 'beta', 'focus', 'free'],
    session: s('Beta Focus Drill',20,[
      { id:'beta-iso', type:'iso-smooth', carrierHz:260, wave:'sine', pan:0, panMotion:{rateHz:0.02,depth:0.2}, keyframes:[{tMin:0,beatHz:18,gainPct:50},{tMin:20,beatHz:18,gainPct:50}] },
      { id:'alpha-bed', type:'binaural', carrierHz:220, wave:'sine', keyframes:[{tMin:0,beatHz:10,gainPct:22},{tMin:20,beatHz:10,gainPct:22}] },
      { id:'pink-bed', type:'noise', noiseColor:'pink', keyframes:[{tMin:0,gainPct:15},{tMin:20,gainPct:15}] }
    ])
  }),
  t({
    slug: 'ambience-drift-bed', title: 'Ambience Drift Bed', category: 'soundscape', tier: 'holder', minTokens: 1,
    unlockNote: 'Holder tier: demonstrates local ambience file handling and crossfaded loop metadata.',
    summary: 'A sample/ambience layer template with slow stereo drift and crossfaded loop points.',
    description: 'This template is built to test the runtime-only ambience model. Load your own rain, bowls, field recording, or room tone into the sample layer. The JSON stores loop points and filename hints, but not the audio buffer itself. The audio source is decoded locally and rendered locally.',
    tags: ['ambience', 'sample', 'pan-motion', 'holder'],
    session: s('Ambience Drift Bed',30,[
      { id:'ambience-main', type:'sample', sampleName:'load local ambience.wav', pan:0, panMotion:{rateHz:0.03,depth:0.45}, sampleLoop:{mode:'crossfade',startSec:0,endSec:0,crossfadeSec:3}, keyframes:[{tMin:0,gainPct:0},{tMin:2,gainPct:24},{tMin:30,gainPct:24}] },
      { id:'brown-bed', type:'noise', noiseColor:'brown', pan:0, panMotion:{rateHz:0.01,depth:0.12}, keyframes:[{tMin:0,gainPct:14},{tMin:30,gainPct:16}] }
    ])
  }),
  t({
    slug: 'mind-awake-body-rest', title: 'Mind Awake Body Rest', category: 'gateway', tier: 'holder', minTokens: 1,
    unlockNote: 'Holder tier: basic multiplexed binaural stack.',
    summary: 'Core two-layer Focus-10-style stack plus continuous pink noise bed.',
    description: 'Core report-aligned reconstruction: 100 Hz / 1.5 Hz plus 200 Hz / 4.0 Hz, both continuous for 35 minutes over a procedural pink-noise mask. Disclosure: this is the simplified two-layer reconstruction, not an exact official tape clone; the report notes SBaGen-style measurements that include extra 250[4.0] and 300[4.0] carriers for a denser historical variant. Descriptive and experimental; not a medical or consciousness claim.',
    tags: ['binaural', 'delta', 'theta', 'holder'],
    lineage: lineage('core-focus-10', 'curated-reconstruction', 'Simplified/core Focus-10-style pattern: two static binaural layers over pink noise. Not an exact official tape clone.', ['Does not include denser 250[4.0] and 300[4.0] carriers noted elsewhere.', 'Does not include voice guidance, exact original amplitude balance, or analog tape drift.']),
    session: s('Mind Awake Body Rest',35,[
      { id:'delta-anchor', type:'binaural', carrierHz:100, wave:'sine', keyframes:[{tMin:0,beatHz:1.5,gainPct:20},{tMin:35,beatHz:1.5,gainPct:20}] },
      { id:'theta-support', type:'binaural', carrierHz:200, wave:'sine', keyframes:[{tMin:0,beatHz:4,gainPct:20},{tMin:35,beatHz:4,gainPct:20}] },
      { id:'pink-mask', type:'noise', noiseColor:'pink', keyframes:[{tMin:0,gainPct:50},{tMin:35,gainPct:50}] }
    ])
  }),
  t({
    slug: 'dense-mind-awake-body-rest', title: 'Dense Mind Awake Body Rest', category: 'gateway', tier: 'holder', minTokens: 1,
    unlockNote: 'Holder tier: denser Focus-10-style carrier variant.',
    summary: 'Four-layer Focus-10-style stack: 100[1.5], 200[4.0], 250[4.0], 300[4.0] over pink noise.',
    description: 'Historical-carrier disclosure variant for the Focus-10-style pattern. It keeps the 100 Hz / 1.5 Hz delta anchor and adds 200 Hz, 250 Hz, and 300 Hz theta-rate carriers at 4.0 Hz over continuous pink noise. This is closer to the denser SBaGen-style carrier note than the simplified two-layer row, but still not an exact official tape clone because original amplitude balance, voice guidance, analog oscillator drift, and supporting material are not captured.',
    tags: ['binaural', 'delta', 'theta', 'historical-carriers', 'holder'],
    lineage: lineage('dense-focus-10', 'historical-variant', 'Dense carrier variant representing the 100[1.5], 200[4.0], 250[4.0], 300[4.0] map.', ['Amplitude balance is normalized for safe browser rendering.', 'No original voice guidance, tape drift, or supporting material.']),
    session: s('Dense Mind Awake Body Rest',35,[
      { id:'delta-anchor', type:'binaural', carrierHz:100, wave:'sine', keyframes:[{tMin:0,beatHz:1.5,gainPct:14},{tMin:35,beatHz:1.5,gainPct:14}] },
      { id:'theta-200', type:'binaural', carrierHz:200, wave:'sine', keyframes:[{tMin:0,beatHz:4,gainPct:14},{tMin:35,beatHz:4,gainPct:14}] },
      { id:'theta-250', type:'binaural', carrierHz:250, wave:'sine', keyframes:[{tMin:0,beatHz:4,gainPct:14},{tMin:35,beatHz:4,gainPct:14}] },
      { id:'theta-300', type:'binaural', carrierHz:300, wave:'sine', keyframes:[{tMin:0,beatHz:4,gainPct:14},{tMin:35,beatHz:4,gainPct:14}] },
      { id:'pink-mask', type:'noise', noiseColor:'pink', keyframes:[{tMin:0,gainPct:50},{tMin:35,gainPct:50}] }
    ])
  }),
  t({
    slug: 'expanded-awareness-stack', title: 'Expanded Awareness Stack', category: 'gateway', tier: 'pro', minTokens: 10,
    unlockNote: 'Pro tier: larger stack with staged fade-ins.',
    summary: 'Curated lower-carrier Focus-12-style stack: F10 base plus alpha/high-theta bridges.',
    description: 'Curated report-aligned reconstruction: base 100 Hz / 1.5 Hz and 200 Hz / 4.0 Hz layers remain stable, while 250 Hz / 10.0→10.1 Hz and 300 Hz / 4.8 Hz layers fade in over the first minute. Disclosure: this is the report\'s modern lower-carrier aggregation, not a strict historical tape/SBaGen carrier map; the report notes higher historical carriers such as 400[10.0], 500[10.1], and 600[4.8], represented separately in the Dense Expanded Awareness Stack.',
    tags: ['binaural', 'multi-layer', 'pro'],
    lineage: lineage('curated-focus-12', 'curated-reconstruction', 'Curated/lower-carrier Focus-12-style pattern: F10 base plus 250 Hz alpha and 300 Hz high-theta bridges.', ['Uses lower bridge carriers than the higher-carrier historical note.', 'Does not include voice guidance, exact original amplitude balance, or analog tape drift.']),
    session: s('Expanded Awareness Stack',35,[
      { id:'delta-anchor', type:'binaural', carrierHz:100, wave:'sine', keyframes:[{tMin:0,beatHz:1.5,gainPct:15},{tMin:35,beatHz:1.5,gainPct:15}] },
      { id:'theta-base', type:'binaural', carrierHz:200, wave:'sine', keyframes:[{tMin:0,beatHz:4,gainPct:15},{tMin:35,beatHz:4,gainPct:15}] },
      { id:'alpha-fade', type:'binaural', carrierHz:250, wave:'sine', keyframes:[{tMin:0,beatHz:10,gainPct:0},{tMin:1,beatHz:10,gainPct:15},{tMin:35,beatHz:10.1,gainPct:15}] },
      { id:'theta-high', type:'binaural', carrierHz:300, wave:'sine', keyframes:[{tMin:0,beatHz:4.8,gainPct:0},{tMin:1,beatHz:4.8,gainPct:15},{tMin:35,beatHz:4.8,gainPct:15}] },
      { id:'pink-mask', type:'noise', noiseColor:'pink', keyframes:[{tMin:0,gainPct:50},{tMin:35,gainPct:50}] }
    ])
  }),
  t({
    slug: 'dense-expanded-awareness-stack', title: 'Dense Expanded Awareness Stack', category: 'gateway', tier: 'pro', minTokens: 10,
    unlockNote: 'Pro tier: SBaGen-noted higher-carrier Focus-12-style variant.',
    summary: 'Higher-carrier Focus-12-style variant using the 400/500/600 Hz bridge carriers noted in the report.',
    description: 'Historical-carrier disclosure variant: keeps the 100 Hz / 1.5 Hz and 200 Hz / 4.0 Hz base, then adds the higher bridge carriers noted in the report comparison: 400[10.0], 500[10.1], and 600[4.8]. These bridge layers fade in over the first minute over a continuous pink-noise mask. This is closer to the report\'s SBaGen/tape-carrier note than the curated lower-carrier stack, but still not a guaranteed exact official tape clone because original amplitude balance, voice guidance, analog oscillator drift, and supporting material are not captured.',
    tags: ['binaural', 'multi-layer', 'historical-carriers', 'pro'],
    lineage: lineage('dense-focus-12', 'historical-variant', 'Higher-carrier Focus-12-style variant using the report-noted 400/500/600 Hz bridge carriers.', ['Amplitude balance is normalized for headroom.', 'No original voice guidance, exact tape drift, or supporting material.']),
    session: s('Dense Expanded Awareness Stack',35,[
      { id:'delta-anchor', type:'binaural', carrierHz:100, wave:'sine', keyframes:[{tMin:0,beatHz:1.5,gainPct:12},{tMin:35,beatHz:1.5,gainPct:12}] },
      { id:'theta-base', type:'binaural', carrierHz:200, wave:'sine', keyframes:[{tMin:0,beatHz:4,gainPct:12},{tMin:35,beatHz:4,gainPct:12}] },
      { id:'alpha-400', type:'binaural', carrierHz:400, wave:'sine', keyframes:[{tMin:0,beatHz:10,gainPct:0},{tMin:1,beatHz:10,gainPct:12},{tMin:35,beatHz:10,gainPct:12}] },
      { id:'alpha-500', type:'binaural', carrierHz:500, wave:'sine', keyframes:[{tMin:0,beatHz:10.1,gainPct:0},{tMin:1,beatHz:10.1,gainPct:12},{tMin:35,beatHz:10.1,gainPct:12}] },
      { id:'theta-600', type:'binaural', carrierHz:600, wave:'sine', keyframes:[{tMin:0,beatHz:4.8,gainPct:0},{tMin:1,beatHz:4.8,gainPct:12},{tMin:35,beatHz:4.8,gainPct:12}] },
      { id:'pink-mask', type:'noise', noiseColor:'pink', keyframes:[{tMin:0,gainPct:50},{tMin:35,gainPct:50}] }
    ])
  }),
  t({
    slug: 'deep-descent-60', title: 'Deep Descent 60', category: 'premium', tier: 'pro', minTokens: 10,
    unlockNote: 'Pro tier: long-form descent plus optional local ambience track.',
    summary: 'A 60-minute 140 Hz binaural descent from alpha toward low delta.',
    description: 'A report-aligned long-form descent: one 140 Hz binaural carrier gliding 10 → 2.5 Hz during the first 30 minutes, then 2.5 → 1.5 Hz during the second 30 minutes, with procedural rain/bowl masking and safe fade envelopes.',
    tags: ['binaural', 'longform', 'delta', 'premium'],
    lineage: lineage('deep-descent-60', 'curated-reconstruction', 'Report-aligned long-form descent with portable procedural ambience instead of bundled rain/bowl recordings.', ['Uses procedural rain and bowl-drone recipes rather than local/copyrighted ambience recordings.']),
    session: s('Deep Descent 60',60,[
      { id:'descent', type:'binaural', carrierHz:140, wave:'sine', keyframes:[{tMin:0,beatHz:10,gainPct:20},{tMin:30,beatHz:2.5,gainPct:20},{tMin:60,beatHz:1.5,gainPct:18}] },
      { id:'rain-mask', type:'procedural-ambience', ambienceRecipe:'rain', seed:6060, pan:0, panMotion:{rateHz:0.03,depth:0.18}, keyframes:[{tMin:0,gainPct:50},{tMin:60,gainPct:50}] },
      { id:'bowl-drone', type:'procedural-ambience', ambienceRecipe:'bowl-drone', seed:6061, pan:0, panMotion:{rateHz:0.01,depth:0.12}, keyframes:[{tMin:0,gainPct:0},{tMin:5,gainPct:12},{tMin:60,gainPct:12}] }
    ], undefined, 'hold-last')
  }),
  t({
    slug: 'collector-40hz-suite', title: '40 Hz Collector Suite', category: 'research', tier: 'collector', minTokens: 100,
    unlockNote: 'Collector tier: high-threshold experimental template.',
    summary: 'A 40 Hz monaural/isochronic comparison with optional ambience masking.',
    description: 'A deliberately high-threshold template for collectors: monaural 40 Hz, optional isochronic 40 Hz, and a quiet pink bed. It is framed as an audio-engine stress test and research-reading companion, not a treatment.',
    tags: ['gamma', 'collector', 'monaural', 'isochronic'],
    session: s('40 Hz Collector Suite',25,[
      { id:'monaural-40', type:'monaural', carrierHz:300, wave:'sine', pan:0, panMotion:{rateHz:0.018,depth:0.18}, keyframes:[{tMin:0,beatHz:40,gainPct:34},{tMin:25,beatHz:40,gainPct:34}] },
      { id:'iso-40', type:'iso-smooth', carrierHz:220, wave:'sine', pan:0, panMotion:{rateHz:0.011,depth:0.14}, keyframes:[{tMin:0,beatHz:40,gainPct:0},{tMin:5,beatHz:40,gainPct:16},{tMin:25,beatHz:40,gainPct:14}] },
      { id:'pink-bed', type:'noise', noiseColor:'pink', keyframes:[{tMin:0,gainPct:12},{tMin:25,gainPct:14}] }
    ])
  })
];

export function seedIfNeeded() {
  return dbMeasure.measure('Seed templates', () => {
    if (db.templates.count() > 0) return false;
    syncBuiltInTemplates('missing');
    return true;
  });
}

export function syncBuiltInTemplates(mode: 'missing' | 'upsert' = 'missing') {
  return dbMeasure.measure('Sync built-in soundtracks', () => {
    let inserted = 0;
    let updated = 0;
    seedTemplates.forEach((template, i) => {
      const row = rowFromTemplate(template, i);
      const existing = db.templates.select().where({ slug: row.slug }).first() as any;
      if (!existing) { db.templates.insert(row); inserted++; }
      else if (mode === 'upsert') { db.templates.update(row).where({ slug: row.slug }).run(); updated++; }
    });
    return { inserted, updated, total: seedTemplates.length, revision: BUILTIN_SOUNDTRACK_REVISION };
  });
}

export function rowFromTemplate(template: EntrainTemplateV1, sortOrder: number) {
  const analysis = analyzeSession(template.session);
  const referenceMatch = compareToReference(template.session, template.lineage?.referenceId);
  return {
    slug: template.slug,
    title: template.title,
    summary: template.summary,
    description: template.description,
    category: template.category,
    tier: template.tier,
    tags: template.tags,
    minTokens: template.minTokens,
    unlockNote: template.unlockNote || '',
    session: template.session,
    sortOrder,
    isPublished: true,
    status: 'published',
    formatVersion: 'entrain.session.v1',
    patternHash: patternHash(template.session),
    analysisJson: analysis,
    safetyJson: { referenceMatch },
    evidenceLevel: template.evidenceLevel || 'experimental',
    headphonesRequired: analysis.headphonesRequired,
    defaultLoopMode: template.session.loop?.mode || 'hold-last',
    defaultExportSec: template.session.durationMin * 60,
    lineageJson: template.lineage || null,
    referenceMatchJson: referenceMatch,
    seedRevision: BUILTIN_SOUNDTRACK_REVISION,
    marketKind: template.market?.kind || (template.minTokens > 0 ? 'token' : 'free'),
    priceLamports: Number(template.market?.priceLamports || 0),
    priceCurrency: template.market?.priceCurrency || 'SOL',
    payoutWallet: template.market?.payoutWallet || '',
    ownerPublicKey: template.ownerPublicKey || '',
    creatorName: template.creatorName || '',
    creatorWallet: template.creatorWallet || '',
    publishedByUser: !!template.publishedByUser,
    purchaseCount: Number(template.market?.purchaseCount || 0),
  };
}

function fallbackRows() {
  return seedTemplates.map((template, i) => ({ ...template, sortOrder: i, isPublished: true }));
}

export function allTemplates() {
  const rows = db.templates.select().where({ isPublished: true }).orderBy('sortOrder', 'ASC').all() as any[];
  return (rows.length ? rows : fallbackRows()).map(normalizeTemplate);
}

export function templatesByCategory() {
  const groups = new Map<string, EntrainTemplateV1[]>();
  for (const template of allTemplates()) {
    const key = template.category || 'uncategorized';
    groups.set(key, [...(groups.get(key) || []), template]);
  }
  return [...groups.entries()].map(([category, templates]) => ({ category, templates }));
}

export function featuredTemplates(n = 3) {
  return allTemplates().slice(0, n);
}

export function findTemplate(slug: string) {
  const row = db.templates.select().where({ slug, isPublished: true }).first() as any;
  return row ? normalizeTemplate(row) : seedTemplates.find((template) => template.slug === slug) || null;
}

export function tierForMinTokens(minTokens: number): TemplateTier {
  if (minTokens >= 100) return 'collector';
  if (minTokens >= 10) return 'pro';
  if (minTokens >= 1) return 'holder';
  return 'free';
}

function normalizeTemplate(row: any): EntrainTemplateV1 {
  const minTokens = Number(row.minTokens || 0);
  let tags: string[] = [];
  try { tags = Array.isArray(row.tags) ? row.tags : JSON.parse(row.tags || '[]'); } catch { tags = []; }
  return {
    format: 'entrain.template.v1',
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    category: row.category,
    tier: (row.tier || tierForMinTokens(minTokens)) as TemplateTier,
    tags,
    minTokens,
    unlockNote: row.unlockNote || undefined,
    session: sanitizeSession(row.session),
    lineage: row.lineageJson || row.lineage || undefined,
    ownerPublicKey: row.ownerPublicKey || undefined,
    creatorName: row.creatorName || undefined,
    creatorWallet: row.creatorWallet || undefined,
    publishedByUser: !!row.publishedByUser,
    market: {
      kind: row.marketKind || (minTokens > 0 ? 'token' : 'free'),
      priceLamports: Number(row.priceLamports || 0),
      priceCurrency: 'SOL',
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
  return (h >>> 0).toString(16).padStart(8, '0');
}

function signalProjection(session: EntrainSessionV1) {
  return {
    format: session.format,
    durationMin: session.durationMin,
    loop: session.loop || { mode: 'hold-last', crossfadeSec: 0 },
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
      mute: l.mute,
      solo: l.solo,
      keyframes: l.keyframes.map((k) => ({ tMin: k.tMin, beatHz: k.beatHz, gainPct: k.gainPct })),
    })),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return '{' + Object.keys(obj).filter((k) => obj[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}
