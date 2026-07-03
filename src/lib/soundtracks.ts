import type { EntrainTemplateV1 } from '@/format/entrain-format';
import { summarizeSession, type SessionSummary } from '@/format/entrain-format';
import { analyzeSession, type ProtocolAnalysis } from '@/format/protocol-analyzer';
import { compareToReference, type ReferenceMatch } from '@/format/protocol-reference';
import { allTemplates, findTemplate, templatesByCategory, featuredTemplates, tierForMinTokens } from './templates';

export type SoundtrackRow = EntrainTemplateV1 & { summaryStats: SessionSummary; analysis: ProtocolAnalysis; referenceMatch: ReferenceMatch | null }; 

export function toSoundtrack(template: EntrainTemplateV1): SoundtrackRow {
  return { ...template, summaryStats: summarizeSession(template.session), analysis: analyzeSession(template.session), referenceMatch: compareToReference(template.session, template.lineage?.referenceId) }; 
}

export function allSoundtracks() {
  return allTemplates().map(toSoundtrack);
}

export function featuredSoundtracks(n = 3) {
  return featuredTemplates(n).map(toSoundtrack);
}

export function soundtracksByCategory() {
  return templatesByCategory().map((group) => ({ ...group, templates: group.templates.map(toSoundtrack) }));
}

export function findSoundtrack(slug: string) {
  const t = findTemplate(slug);
  return t ? toSoundtrack(t) : null;
}

export { tierForMinTokens };
