import rules from './scan-rules.json';

export type PluginScanSeverity = 'block' | 'review';
export type PluginScanVerdict = 'pass' | 'review' | 'block';

export interface PluginScanRule {
  id: string;
  severity: PluginScanSeverity;
  flags: string;
  pattern: string;
  message: string;
}

export interface PluginScanFinding {
  ruleId: string;
  severity: PluginScanSeverity;
  message: string;
  path: string;
  line: number;
  excerpt: string;
}

export interface PluginScanResult {
  verdict: PluginScanVerdict;
  findings: PluginScanFinding[];
  rulesVersion: number;
  scannedFiles: number;
  scannedBytes: number;
}

export interface PluginScanFile {
  path: string;
  content: string;
}

export const PLUGIN_SCAN_RULES: readonly PluginScanRule[] = (rules as { rules: PluginScanRule[] })
  .rules;
export const PLUGIN_SCAN_RULES_VERSION: number = (rules as { version: number }).version;

const MAX_EXCERPT_CHARS = 160;
const MAX_FINDINGS = 200;

// Every file is read as text: a payload hidden in a .md instruction file is
// the risk a code-only scanner misses.
function compile(rule: PluginScanRule): RegExp {
  const flags = rule.flags.includes('g') ? rule.flags : `${rule.flags}g`;
  return new RegExp(rule.pattern, flags);
}

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function excerptAt(content: string, index: number): string {
  const start = content.lastIndexOf('\n', index) + 1;
  const end = content.indexOf('\n', index);
  const raw = content.slice(start, end === -1 ? content.length : end).trim();
  return raw.length > MAX_EXCERPT_CHARS ? `${raw.slice(0, MAX_EXCERPT_CHARS)}…` : raw;
}

export function scanPluginPackage(files: readonly PluginScanFile[]): PluginScanResult {
  const findings: PluginScanFinding[] = [];
  let scannedBytes = 0;

  for (const file of files) {
    scannedBytes += file.content.length;
    for (const rule of PLUGIN_SCAN_RULES) {
      const expression = compile(rule);
      let match = expression.exec(file.content);
      while (match !== null) {
        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.message,
          path: file.path,
          line: lineOf(file.content, match.index),
          excerpt: excerptAt(file.content, match.index),
        });
        if (findings.length >= MAX_FINDINGS) break;
        if (match[0].length === 0) expression.lastIndex += 1;
        match = expression.exec(file.content);
      }
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }

  const verdict: PluginScanVerdict = findings.some((finding) => finding.severity === 'block')
    ? 'block'
    : findings.length > 0
      ? 'review'
      : 'pass';

  return {
    verdict,
    findings,
    rulesVersion: PLUGIN_SCAN_RULES_VERSION,
    scannedFiles: files.length,
    scannedBytes,
  };
}

export function describePluginScan(result: PluginScanResult): string {
  if (result.verdict === 'pass') return 'No unsafe patterns were found in this package.';
  const worst = result.findings.filter((finding) => finding.severity === 'block');
  const shown = (worst.length > 0 ? worst : result.findings).slice(0, 3);
  const detail = shown
    .map((finding) => `${finding.path}:${finding.line} ${finding.message}`)
    .join('; ');
  return result.verdict === 'block'
    ? `This package was refused by the content scanner: ${detail}.`
    : `This package needs review before it can be installed: ${detail}.`;
}
