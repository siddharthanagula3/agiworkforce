#!/usr/bin/env node
// Gate for the scanners that do not run inside the JS test suite: Trivy image,
// filesystem and IaC scans, and the ZAP baseline. It mirrors
// check-semgrep-findings.mjs deliberately, one acceptance grammar for every
// scanner: a finding with no entry fails, an entry past its expiry fails even
// though the finding still matches, and an entry that matches nothing fails as
// stale. A missing report is a failure, not a clean scan.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const SEVERITY_ORDER = ['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ZAP_RISK_SEVERITY = new Map([
  ['0', 'UNKNOWN'],
  ['1', 'LOW'],
  ['2', 'MEDIUM'],
  ['3', 'HIGH'],
]);

function severityRank(severity) {
  const index = SEVERITY_ORDER.indexOf(String(severity ?? '').toUpperCase());
  return index === -1 ? 0 : index;
}

export function normalizeTrivyReport(report) {
  const findings = [];
  for (const result of report?.Results ?? []) {
    const target = result?.Target ?? '<unknown target>';
    for (const vulnerability of result?.Vulnerabilities ?? []) {
      findings.push({
        id: vulnerability?.VulnerabilityID ?? '<unknown>',
        location: vulnerability?.PkgName
          ? `${target}:${vulnerability.PkgName}@${vulnerability.InstalledVersion ?? '?'}`
          : target,
        severity: String(vulnerability?.Severity ?? 'UNKNOWN').toUpperCase(),
        title: vulnerability?.Title ?? vulnerability?.PkgName ?? '',
        scanner: 'trivy',
      });
    }
    for (const misconfiguration of result?.Misconfigurations ?? []) {
      findings.push({
        id: misconfiguration?.ID ?? misconfiguration?.AVDID ?? '<unknown>',
        location: target,
        severity: String(misconfiguration?.Severity ?? 'UNKNOWN').toUpperCase(),
        title: misconfiguration?.Title ?? '',
        scanner: 'trivy',
      });
    }
    for (const secret of result?.Secrets ?? []) {
      findings.push({
        id: secret?.RuleID ?? '<unknown>',
        location: secret?.StartLine ? `${target}:${secret.StartLine}` : target,
        severity: String(secret?.Severity ?? 'CRITICAL').toUpperCase(),
        title: secret?.Title ?? '',
        scanner: 'trivy',
      });
    }
  }
  return findings;
}

export function normalizeZapReport(report) {
  const findings = [];
  for (const site of report?.site ?? []) {
    for (const alert of site?.alerts ?? []) {
      const instances = alert?.instances ?? [];
      const location =
        instances.length > 0
          ? (instances[0]?.uri ?? site?.['@name'] ?? '<unknown url>')
          : (site?.['@name'] ?? '<unknown url>');
      findings.push({
        id: alert?.pluginid ?? alert?.alertRef ?? '<unknown>',
        location,
        severity: ZAP_RISK_SEVERITY.get(String(alert?.riskcode ?? '0')) ?? 'UNKNOWN',
        title: alert?.alert ?? alert?.name ?? '',
        scanner: 'zap',
      });
    }
  }
  return findings;
}

export function parseAllowlist(document, { allowlistPath, today, fail }) {
  if (!document || !Array.isArray(document.entries)) {
    fail(`${allowlistPath} must be an object with an "entries" array.`);
    return [];
  }

  const parsed = [];
  document.entries.forEach((entry, index) => {
    const label = `${allowlistPath} entries[${index}]`;
    if (typeof entry?.id !== 'string' || entry.id.length === 0) {
      fail(`${label} must set "id" to the scanner finding id it accepts.`);
      return;
    }
    if (typeof entry.scanner !== 'string' || !['trivy', 'zap'].includes(entry.scanner)) {
      fail(`${label} (${entry.id}) must set "scanner" to "trivy" or "zap".`);
      return;
    }
    if (typeof entry.owner !== 'string' || !entry.owner.startsWith('@')) {
      fail(`${label} (${entry.id}) must set "owner" to a GitHub handle or team.`);
      return;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      fail(`${label} (${entry.id}) must set "reason" to why the finding is accepted.`);
      return;
    }
    if (typeof entry.expires !== 'string' || !DATE_PATTERN.test(entry.expires)) {
      fail(`${label} (${entry.id}) must set "expires" to a YYYY-MM-DD date.`);
      return;
    }
    if (entry.expires < today) {
      fail(
        `${label} (${entry.id}) expired on ${entry.expires}. ${entry.owner} must fix the finding or re-triage the acceptance.`,
      );
      return;
    }
    if (entry.locations !== undefined) {
      if (
        !Array.isArray(entry.locations) ||
        entry.locations.length === 0 ||
        entry.locations.some((value) => typeof value !== 'string')
      ) {
        fail(
          `${label} (${entry.id}) "locations" must be a non-empty array of substrings; omit it to accept everywhere.`,
        );
        return;
      }
    }
    parsed.push({ ...entry, matched: 0 });
  });

  return parsed;
}

function matches(entry, finding) {
  if (entry.scanner !== finding.scanner) return false;
  if (entry.id !== finding.id) return false;
  if (entry.locations === undefined) return true;
  return entry.locations.some((candidate) => finding.location.includes(candidate));
}

export function gateFindings({ findings, allowlist, minSeverity, scanner, fail }) {
  const floor = severityRank(minSeverity);
  const inScope = findings.filter(
    (finding) => finding.scanner === scanner && severityRank(finding.severity) >= floor,
  );

  for (const finding of inScope) {
    const entry = allowlist.find((candidate) => matches(candidate, finding));
    if (entry) {
      entry.matched += 1;
      continue;
    }
    fail(
      `unaccepted: ${finding.location} [${finding.severity}] ${finding.id}, ${finding.title}`.trim(),
    );
  }

  for (const entry of allowlist) {
    if (entry.scanner !== scanner) continue;
    if (entry.matched === 0) {
      fail(
        `stale: the allowlist entry for ${entry.id} matched nothing in this ${scanner} report. Delete it, an acceptance nobody can point at reads as reviewed when it is not.`,
      );
    }
  }

  return inScope;
}

function readJson(filePath, label, fail) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} not found at ${filePath}. A missing report is not a clean scan.`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`${label} at ${filePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const allowlistOnly = args.includes('--allowlist-only');
  const readFlag = (name, fallback) => {
    const index = args.indexOf(name);
    return index === -1 ? fallback : args[index + 1];
  };
  const scanner = readFlag('--format', 'trivy');
  const minSeverity = (readFlag('--min-severity', 'HIGH') ?? 'HIGH').toUpperCase();
  const positional = args.filter((value, index) => {
    if (value.startsWith('--')) return false;
    return !args[index - 1]?.startsWith('--');
  });

  const errors = [];
  const fail = (message) => errors.push(message);

  if (!['trivy', 'zap'].includes(scanner)) {
    fail(`--format must be "trivy" or "zap", got "${scanner}".`);
  }
  if (!SEVERITY_ORDER.includes(minSeverity)) {
    fail(`--min-severity must be one of ${SEVERITY_ORDER.join(', ')}, got "${minSeverity}".`);
  }

  const allowlistPath = path.resolve(
    process.cwd(),
    readFlag('--allowlist', 'scripts/scan-allowlist.json'),
  );
  const allowlist = parseAllowlist(readJson(allowlistPath, 'Scan allowlist', fail), {
    allowlistPath,
    today: new Date().toISOString().slice(0, 10),
    fail,
  });

  if (!allowlistOnly && errors.length === 0) {
    const reportPath = path.resolve(process.cwd(), positional[0] ?? 'scan-results.json');
    const report = readJson(reportPath, `${scanner} report`, fail);
    if (report) {
      const findings =
        scanner === 'trivy' ? normalizeTrivyReport(report) : normalizeZapReport(report);
      const inScope = gateFindings({ findings, allowlist, minSeverity, scanner, fail });
      if (errors.length === 0) {
        console.log(
          `${scanner} gate passed: ${inScope.length} finding(s) at or above ${minSeverity}, every one accounted for.`,
        );
      }
    }
  } else if (errors.length === 0) {
    console.log(`Scan allowlist valid: ${allowlist.length} unexpired entry(ies).`);
  }

  if (errors.length > 0) {
    console.error(`${scanner} scan gate FAILED:`);
    for (const error of errors) console.error(`- ${error}`);
    console.error(
      `Fix the finding, or add an entry with id, scanner, owner, expires and reason to ${allowlistPath}.`,
    );
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
