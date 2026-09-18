/**
 * The validation report every surface renders. The shape is the CLI's
 * `DoctorReport` as it serialises it, so VS Code, the desktop shell and the
 * terminal show one payload instead of three reimplementations of the same
 * checks.
 */

export const CODE_DOCTOR_STATUSES = ['pass', 'warn', 'fail', 'unknown'] as const;
export type CodeDoctorStatus = (typeof CODE_DOCTOR_STATUSES)[number];

export interface CodeDoctorCheck {
  id: string;
  title: string;
  status: CodeDoctorStatus;
  message: string;
  details: string[];
}

export interface CodeDoctorSummary {
  overall: CodeDoctorStatus;
  pass: number;
  warn: number;
  fail: number;
  unknown: number;
}

export interface CodeDoctorReport {
  version: string;
  generatedAt: string;
  cwd: string;
  summary: CodeDoctorSummary;
  checks: CodeDoctorCheck[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value : '';
}

export function parseDoctorStatus(value: unknown): CodeDoctorStatus {
  return typeof value === 'string' && (CODE_DOCTOR_STATUSES as readonly string[]).includes(value)
    ? (value as CodeDoctorStatus)
    : 'unknown';
}

/**
 * The worst status present wins, so a report is never reported healthier than
 * its worst check.
 */
export function summarizeDoctorChecks(checks: readonly CodeDoctorCheck[]): CodeDoctorSummary {
  const summary: CodeDoctorSummary = { overall: 'pass', pass: 0, warn: 0, fail: 0, unknown: 0 };
  for (const check of checks) {
    summary[check.status] += 1;
  }
  if (summary.fail > 0) summary.overall = 'fail';
  else if (summary.warn > 0) summary.overall = 'warn';
  else if (summary.unknown > 0) summary.overall = 'unknown';
  return summary;
}

function parseCheck(value: unknown): CodeDoctorCheck | null {
  if (!isRecord(value)) return null;
  const id = readString(value, 'id');
  if (!id) return null;
  const details = value['details'];
  return {
    id,
    title: readString(value, 'title') || id,
    status: parseDoctorStatus(value['status']),
    message: readString(value, 'message'),
    details: Array.isArray(details)
      ? details.filter((detail): detail is string => typeof detail === 'string')
      : [],
  };
}

/**
 * Read the CLI's report. A missing summary is recomputed from the checks rather
 * than defaulted to healthy, because a report with no summary and a failing
 * check is still a failing report.
 */
export function parseDoctorReport(value: unknown): CodeDoctorReport | null {
  if (!isRecord(value)) return null;
  const rawChecks = value['checks'];
  if (!Array.isArray(rawChecks)) return null;
  const checks = rawChecks
    .map(parseCheck)
    .filter((check): check is CodeDoctorCheck => check !== null);

  const rawSummary = value['summary'];
  const computed = summarizeDoctorChecks(checks);
  const summary: CodeDoctorSummary = isRecord(rawSummary)
    ? {
        overall: parseDoctorStatus(rawSummary['overall']),
        pass: typeof rawSummary['pass'] === 'number' ? rawSummary['pass'] : computed.pass,
        warn: typeof rawSummary['warn'] === 'number' ? rawSummary['warn'] : computed.warn,
        fail: typeof rawSummary['fail'] === 'number' ? rawSummary['fail'] : computed.fail,
        unknown:
          typeof rawSummary['unknown'] === 'number' ? rawSummary['unknown'] : computed.unknown,
      }
    : computed;

  return {
    version: readString(value, 'version'),
    generatedAt: readString(value, 'generated_at') || readString(value, 'generatedAt'),
    cwd: readString(value, 'cwd'),
    summary,
    checks,
  };
}

const STATUS_LABELS: Record<CodeDoctorStatus, string> = {
  pass: 'Pass',
  warn: 'Warn',
  fail: 'Fail',
  unknown: 'Unknown',
};

/** The same text the CLI prints, so a terminal and a panel read identically. */
export function formatDoctorReport(report: CodeDoctorReport): string {
  const lines = [
    'AGI doctor',
    `  version: ${report.version}`,
    `  generated: ${report.generatedAt}`,
    `  cwd: ${report.cwd}`,
    `  overall: ${STATUS_LABELS[report.summary.overall]}`,
    '',
  ];
  for (const check of report.checks) {
    lines.push(`[${STATUS_LABELS[check.status]}] ${check.title} - ${check.message}`);
    for (const detail of check.details) {
      lines.push(`  - ${detail}`);
    }
  }
  return lines.join('\n');
}

export function doctorReportIsHealthy(report: CodeDoctorReport): boolean {
  return report.summary.overall === 'pass';
}
