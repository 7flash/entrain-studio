import { sanitizeSession } from "@/format/entrain-format";
import {
  analyzeSession,
  claimRisk,
  type ProtocolAnalysis,
} from "@/format/protocol-analyzer";
import {
  compareToReference,
  type ReferenceMatch,
} from "@/format/protocol-reference";
import { signalMapForSession, signalMapText } from "@/format/channel-map";
import { patternHash } from "./templates";

export type AuditInputRow = {
  slug: string;
  title: string;
  summary?: string;
  description?: string;
  unlockNote?: string;
  category?: string;
  tier?: string;
  minTokens?: number;
  status?: string;
  isPublished?: boolean;
  session: any;
  patternHash?: string;
  analysisJson?: any;
  referenceMatchJson?: any;
  lineageJson?: any;
  seedRevision?: string;
  copyReviewed?: boolean;
};

export type AuditRow = {
  slug: string;
  title: string;
  status: string;
  category: string;
  tier: string;
  minTokens: number;
  published: boolean;
  patternHash: string;
  storedPatternHash?: string;
  hashDrift: boolean;
  seedRevision?: string;
  analysis: ProtocolAnalysis;
  referenceMatch: ReferenceMatch | null;
  claimRisk: ReturnType<typeof claimRisk>;
  staleAnalysis: boolean;
  staleReferenceMatch: boolean;
  signalMapSummary: {
    durationMin: number;
    layerCount: number;
    headphonesRequired: boolean;
    portable: boolean;
  };
  signalMapText?: string;
  blockers: string[];
  warnings: string[];
  verdict: "ok" | "warn" | "fail";
};

export type AuditReport = {
  generatedAt: number;
  totals: {
    rows: number;
    published: number;
    ok: number;
    warn: number;
    fail: number;
    gated: number;
    free: number;
  };
  rows: AuditRow[];
};

export function buildAuditReport(
  rows: AuditInputRow[],
  opts: { includeSignals?: boolean } = {},
): AuditReport {
  const out = rows.map((row) => auditRow(row, opts));
  return {
    generatedAt: Date.now(),
    totals: {
      rows: out.length,
      published: out.filter((r) => r.published).length,
      ok: out.filter((r) => r.verdict === "ok").length,
      warn: out.filter((r) => r.verdict === "warn").length,
      fail: out.filter((r) => r.verdict === "fail").length,
      gated: out.filter((r) => r.minTokens > 0).length,
      free: out.filter((r) => r.minTokens <= 0).length,
    },
    rows: out,
  };
}

export function auditRow(
  row: AuditInputRow,
  opts: { includeSignals?: boolean } = {},
): AuditRow {
  const session = sanitizeSession(row.session);
  const analysis = analyzeSession(session);
  const referenceId =
    row.lineageJson?.referenceId || row.lineageJson?.reference || "";
  const referenceMatch = compareToReference(session, referenceId);
  const claims = claimRisk(
    `${row.title || ""} ${row.summary || ""} ${row.description || ""} ${row.unlockNote || ""}`,
    { reviewed: !!row.copyReviewed },
  );
  const computedHash = patternHash(session);
  const signalMap = signalMapForSession(session);
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const issue of analysis.issues) {
    if (issue.level === "error") blockers.push(`analyzer:${issue.code}`);
    else if (issue.level === "warn") warnings.push(`analyzer:${issue.code}`);
  }
  if (claims.risky)
    blockers.push(`claims:${claims.hits.join(",") || "risky-copy"}`);
  if (referenceMatch && !referenceMatch.matches)
    blockers.push("reference:mismatch");
  if (row.patternHash && row.patternHash !== computedHash)
    warnings.push("stored-hash:stale");
  if (row.analysisJson && !roughEqual(row.analysisJson, analysis))
    warnings.push("stored-analysis:stale");
  if (
    row.referenceMatchJson &&
    !roughEqual(row.referenceMatchJson, referenceMatch)
  )
    warnings.push("stored-reference-match:stale");

  const verdict: AuditRow["verdict"] = blockers.length
    ? "fail"
    : warnings.length
      ? "warn"
      : "ok";
  return {
    slug: row.slug,
    title: row.title,
    status: row.status || (row.isPublished ? "published" : "draft"),
    category: row.category || "uncategorized",
    tier:
      row.tier ||
      (Number(row.minTokens || 0) >= 100
        ? "collector"
        : Number(row.minTokens || 0) >= 10
          ? "pro"
          : Number(row.minTokens || 0) >= 1
            ? "holder"
            : "free"),
    minTokens: Number(row.minTokens || 0),
    published:
      row.isPublished !== false && (row.status || "published") === "published",
    patternHash: computedHash,
    storedPatternHash: row.patternHash,
    hashDrift: !!row.patternHash && row.patternHash !== computedHash,
    seedRevision: row.seedRevision,
    analysis,
    referenceMatch,
    claimRisk: claims,
    staleAnalysis:
      !!row.analysisJson && !roughEqual(row.analysisJson, analysis),
    staleReferenceMatch:
      !!row.referenceMatchJson &&
      !roughEqual(row.referenceMatchJson, referenceMatch),
    signalMapSummary: {
      durationMin: signalMap.durationMin,
      layerCount: signalMap.layers.length,
      headphonesRequired: signalMap.headphonesRequired,
      portable: signalMap.portable,
    },
    signalMapText: opts.includeSignals ? signalMapText(session) : undefined,
    blockers,
    warnings,
    verdict,
  };
}

function roughEqual(a: any, b: any) {
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  } catch {
    return false;
  }
}
