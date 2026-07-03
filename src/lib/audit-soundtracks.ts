import { seedTemplates, BUILTIN_SOUNDTRACK_REVISION, rowFromTemplate } from './templates';
import { buildAuditReport } from './audit-report';

const includeSignals = process.argv.includes('--signals');
const jsonOut = process.argv.includes('--json');
const rows = seedTemplates.map((template, i) => rowFromTemplate(template, i));
const report = buildAuditReport(rows, { includeSignals });

if (jsonOut) {
  console.log(JSON.stringify({ revision: BUILTIN_SOUNDTRACK_REVISION, ...report }, null, 2));
} else {
  console.log(`ENTRAIN built-in soundtrack audit · ${BUILTIN_SOUNDTRACK_REVISION}`);
  console.log(`Built-ins ${report.totals.rows} · OK ${report.totals.ok} · WARN ${report.totals.warn} · FAIL ${report.totals.fail}`);
  for (const row of report.rows) {
    console.log(`\n${row.verdict.toUpperCase()} /${row.slug} · ${row.title}`);
    console.log(`  pattern: ${row.signalMapSummary.durationMin}m · ${row.signalMapSummary.layerCount} layers · hash ${row.patternHash}`);
    console.log(`  analyzer: ${row.analysis.mixStatus} · peak ${row.analysis.estimatedPeakDb.toFixed(1)} dBFS · issues ${row.analysis.issues.length}`);
    if (row.referenceMatch) console.log(`  reference: ${row.referenceMatch.referenceId} · ${row.referenceMatch.matches ? 'matches' : 'differs'} · score ${row.referenceMatch.score}/100 · deviations ${row.referenceMatch.deviations.length}`);
    for (const blocker of row.blockers) console.log(`  BLOCK ${blocker}`);
    for (const warning of row.warnings) console.log(`  WARN  ${warning}`);
    if (includeSignals && row.signalMapText) console.log(row.signalMapText.split('\n').map((line) => `  ${line}`).join('\n'));
  }
}

if (report.totals.fail) {
  console.error(`\nAudit failed: ${report.totals.fail} built-in soundtrack(s) have hard publish blockers.`);
  process.exit(1);
}
console.log('\nAudit passed: all built-in soundtracks are publishable under current analyzer/reference rules.');
