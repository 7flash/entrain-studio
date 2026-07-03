import { db } from './db';
import { buildAuditReport } from './audit-report';
import { TOKEN_DISPLAY_NAME } from './config';

const includeSignals = process.argv.includes('--signals');
const jsonOut = process.argv.includes('--json');
const rows = db.templates.select().orderBy('sortOrder','ASC').all() as any[];
const report = buildAuditReport(rows, { includeSignals });

if (jsonOut) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`ENTRAIN database soundtrack audit · ${new Date(report.generatedAt).toISOString()}`);
  console.log(`Rows ${report.totals.rows} · OK ${report.totals.ok} · WARN ${report.totals.warn} · FAIL ${report.totals.fail} · gated ${report.totals.gated}`);
  for (const row of report.rows) {
    console.log(`\n${row.verdict.toUpperCase()} /${row.slug} · ${row.title}`);
    console.log(`  status: ${row.status} · gate: ${row.minTokens ? row.minTokens + ' ' + TOKEN_DISPLAY_NAME : 'free'} · hash ${row.patternHash}${row.hashDrift ? ' (stored hash stale)' : ''}`);
    console.log(`  analyzer: ${row.analysis.mixStatus} · peak ${row.analysis.estimatedPeakDb.toFixed(1)} dBFS · issues ${row.analysis.issues.length}`);
    if (row.referenceMatch) console.log(`  reference: ${row.referenceMatch.referenceId} · ${row.referenceMatch.matches ? 'matches' : 'differs'} · score ${row.referenceMatch.score}/100`);
    for (const blocker of row.blockers) console.log(`  BLOCK ${blocker}`);
    for (const warning of row.warnings) console.log(`  WARN  ${warning}`);
    if (includeSignals && row.signalMapText) console.log(row.signalMapText.split('\n').map((line) => `  ${line}`).join('\n'));
  }
}

if (report.totals.fail) {
  console.error(`\nAudit failed: ${report.totals.fail} row(s) have publish blockers.`);
  process.exit(1);
}
console.log('\nAudit passed: no database rows have hard publish blockers.');
