import type { EntrainTemplateV1, EntrainSessionV1, TemplateTier } from '@/format/entrain-format';
import { sanitizeSession } from '@/format/entrain-format';
import { db } from './db';
import { dbMeasure } from './measure';

function s(name: string, durationMin: number, layers: EntrainSessionV1['layers'], description?: string): EntrainSessionV1 {
  return sanitizeSession({ format: 'entrain.session.v1', name, durationMin, description, layers, export: { fadeSec: 4, sampleRate: 44100 } });
}
function t(input: Omit<EntrainTemplateV1, 'format'>): EntrainTemplateV1 {
  return { format: 'entrain.template.v1', ...input, session: sanitizeSession(input.session) };
}

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
    slug: 'focus-10', title: 'Focus 10-style Stack', category: 'gateway', tier: 'holder', minTokens: 1,
    unlockNote: 'Holder tier: basic multiplexed binaural stack.',
    summary: 'Multiplexed low-frequency binaural stack plus pink noise bed.',
    description: 'A template for the classic mind-awake/body-asleep idea: slow delta anchor, theta support, and a non-musical bed. This is descriptive and experimental, not a medical or consciousness claim.',
    tags: ['binaural', 'delta', 'theta', 'holder'],
    session: s('Focus 10-style Stack',35,[
      { id:'delta-anchor', type:'binaural', carrierHz:100, wave:'sine', keyframes:[{tMin:0,beatHz:1.5,gainPct:52},{tMin:35,beatHz:1.5,gainPct:52}] },
      { id:'theta-support', type:'binaural', carrierHz:200, wave:'sine', keyframes:[{tMin:0,beatHz:4,gainPct:44},{tMin:35,beatHz:4,gainPct:44}] },
      { id:'pink-bed', type:'noise', noiseColor:'pink', pan:0, panMotion:{rateHz:0.03,depth:0.18}, keyframes:[{tMin:0,gainPct:20},{tMin:35,gainPct:20}] }
    ])
  }),
  t({
    slug: 'focus-12-expanded', title: 'Focus 12-style Expansion', category: 'gateway', tier: 'pro', minTokens: 10,
    unlockNote: 'Pro tier: larger stack with staged fade-ins.',
    summary: 'F10 base plus alpha and high-theta layers fading into a wider stack.',
    description: 'A larger staged stack: base delta/theta remains stable while alpha and high-theta layers fade in. This is a useful test of multi-layer templates, timeline ramps, and token-tier gating.',
    tags: ['binaural', 'multi-layer', 'pro'],
    session: s('Focus 12-style Expansion',35,[
      { id:'delta-anchor', type:'binaural', carrierHz:100, wave:'sine', keyframes:[{tMin:0,beatHz:1.5,gainPct:50},{tMin:35,beatHz:1.5,gainPct:50}] },
      { id:'theta-base', type:'binaural', carrierHz:200, wave:'sine', keyframes:[{tMin:0,beatHz:4,gainPct:42},{tMin:35,beatHz:4,gainPct:42}] },
      { id:'alpha-fade', type:'binaural', carrierHz:250, wave:'sine', keyframes:[{tMin:0,beatHz:10,gainPct:0},{tMin:3,beatHz:10,gainPct:38},{tMin:35,beatHz:10.1,gainPct:38}] },
      { id:'theta-high', type:'binaural', carrierHz:300, wave:'sine', keyframes:[{tMin:0,beatHz:4.8,gainPct:0},{tMin:4,beatHz:4.8,gainPct:33},{tMin:35,beatHz:4.8,gainPct:33}] },
      { id:'pink-bed', type:'noise', noiseColor:'pink', pan:0, panMotion:{rateHz:0.02,depth:0.16}, keyframes:[{tMin:0,gainPct:18},{tMin:35,gainPct:18}] }
    ])
  }),
  t({
    slug: 'deep-carrier-descent', title: 'Deep Carrier Descent', category: 'premium', tier: 'pro', minTokens: 10,
    unlockNote: 'Pro tier: long-form descent plus optional local ambience track.',
    summary: 'A 60-minute binaural descent from alpha toward low delta.',
    description: 'A long-form template for export: low carrier, slow descent, brown noise bed, and explicit fade envelopes. It also includes an optional sample layer with crossfade-loop metadata so a non-seamless rain bed can be rendered cleanly.',
    tags: ['binaural', 'longform', 'delta', 'premium'],
    session: s('Deep Carrier Descent',60,[
      { id:'descent', type:'binaural', carrierHz:110, wave:'sine', keyframes:[{tMin:0,beatHz:10,gainPct:55},{tMin:30,beatHz:2.5,gainPct:55},{tMin:60,beatHz:1.5,gainPct:48}] },
      { id:'brown-bed', type:'noise', noiseColor:'brown', pan:0, panMotion:{rateHz:0.015,depth:0.12}, keyframes:[{tMin:0,gainPct:26},{tMin:60,gainPct:30}] },
      { id:'ambience-placeholder', type:'sample', sampleName:'optional local rain.wav', pan:0, panMotion:{rateHz:0.03,depth:0.35}, sampleLoop:{mode:'crossfade',startSec:0,endSec:0,crossfadeSec:4}, keyframes:[{tMin:0,gainPct:0},{tMin:5,gainPct:18},{tMin:60,gainPct:18}] }
    ])
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
    db.templates.insertMany(seedTemplates.map((template, i) => rowFromTemplate(template, i)));
    return true;
  });
}

function rowFromTemplate(template: EntrainTemplateV1, sortOrder: number) {
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
  };
}
