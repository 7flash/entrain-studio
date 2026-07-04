import type { EntrainTemplateV1 } from "@/format/entrain-format";
import { summarizeSession, type SessionSummary } from "@/format/entrain-format";
import {
  analyzeSession,
  type ProtocolAnalysis,
} from "@/format/protocol-analyzer";
import {
  compareToReference,
  type ReferenceMatch,
} from "@/format/protocol-reference";
import {
  allTemplates,
  findTemplate,
  templatesByCategory,
  featuredTemplates,
  tierForMinTokens,
} from "./templates";
import { PUBLIC_FREE_MODE } from "./config";

export type SoundtrackRow = EntrainTemplateV1 & {
  summaryStats: SessionSummary;
  analysis: ProtocolAnalysis;
  referenceMatch: ReferenceMatch | null;
};

export function toSoundtrack(template: EntrainTemplateV1): SoundtrackRow {
  const publicTemplate = PUBLIC_FREE_MODE
    ? publicFreeTemplate(template)
    : template;
  return {
    ...publicTemplate,
    summaryStats: summarizeSession(publicTemplate.session),
    analysis: analyzeSession(publicTemplate.session),
    referenceMatch: compareToReference(
      publicTemplate.session,
      publicTemplate.lineage?.referenceId,
    ),
  };
}

export function publicFreeTemplate(
  template: EntrainTemplateV1,
): EntrainTemplateV1 {
  if (!PUBLIC_FREE_MODE) return template;
  return {
    ...template,
    tier: "free",
    minTokens: 0,
    unlockNote:
      "Public/free mode is enabled: this soundtrack can be played, exported, cloned, and inspected without wallet authorization.",
    market: { ...(template.market || {}), kind: "free", priceLamports: 0 },
  };
}

export function allSoundtracks() {
  return allTemplates().map(toSoundtrack);
}

export function featuredSoundtracks(n = 3) {
  return featuredTemplates(n).map(toSoundtrack);
}

const CATEGORY_ORDER = [
  "basic",
  "holosync",
  "hemisync",
  "research",
  "soundscape",
  "user-published",
];
export const CATEGORY_LABELS: Record<string, string> = {
  basic: "Basic",
  holosync: "Holosync-style descents",
  hemisync: "Hemi-Sync-style focus stages",
  research: "Research / experiments",
  soundscape: "Soundscapes",
  "user-published": "User published",
};

export function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] || category;
}

export function soundtracksByCategory() {
  const groups = templatesByCategory().map((group) => ({
    ...group,
    label: categoryLabel(group.category),
    templates: group.templates.map(toSoundtrack),
  }));
  return groups.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    const ar = ai === -1 ? 50 : ai;
    const br = bi === -1 ? 50 : bi;
    if (ar !== br) return ar - br;
    return a.category.localeCompare(b.category);
  });
}

export function findSoundtrack(slug: string) {
  const t = findTemplate(slug);
  return t ? toSoundtrack(t) : null;
}

export { tierForMinTokens };
