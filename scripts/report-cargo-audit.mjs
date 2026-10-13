import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function summarizeCargoAudit(report) {
  const vulnerabilities = report?.vulnerabilities;
  const hasVulnerabilities = vulnerabilities?.count > 0;
  if (
    !Number.isSafeInteger(vulnerabilities?.count) ||
    vulnerabilities.count < 0 ||
    !Array.isArray(vulnerabilities.list) ||
    vulnerabilities.list.length !== vulnerabilities.count ||
    vulnerabilities.found !== hasVulnerabilities ||
    !report.warnings ||
    typeof report.warnings !== 'object' ||
    Array.isArray(report.warnings)
  ) {
    throw new Error('cargo audit did not return a complete advisory report');
  }

  const warningGroups = Object.values(report.warnings);
  if (!warningGroups.every(Array.isArray)) {
    throw new Error('cargo audit returned invalid warnings');
  }
  const warnings = warningGroups.flat();
  const entries = [
    ...vulnerabilities.list.map((item) => ({ ...item, kind: 'vulnerability' })),
    ...warnings,
  ];
  const lines = entries.map((entry) => {
    const fields = [entry.advisory?.id, entry.package?.name, entry.package?.version, entry.kind];
    if (!fields.every((field) => typeof field === 'string' && /^[A-Za-z0-9_.+-]+$/.test(field))) {
      throw new Error('cargo audit returned an invalid advisory entry');
    }
    return `- ${fields[0]}: ${fields[1]} ${fields[2]} (${fields[3]})`;
  });

  return {
    failed: vulnerabilities.found,
    summary: [
      '## Rust dependency audit',
      '',
      `${vulnerabilities.count} vulnerabilities; ${warnings.length} warnings.`,
      '',
      ...lines,
      '',
    ].join('\n'),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = summarizeCargoAudit(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.summary);
  }
  process.stdout.write(result.summary);
  process.exitCode = result.failed ? 1 : 0;
}
