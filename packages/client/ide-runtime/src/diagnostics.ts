import { lineRange, type CodeRange, type CodeSelection } from './session';

export const CODE_DIAGNOSTIC_SEVERITIES = ['error', 'warning', 'info', 'hint'] as const;
export type CodeDiagnosticSeverity = (typeof CODE_DIAGNOSTIC_SEVERITIES)[number];

export const CODE_REVIEW_DIAGNOSTIC_SOURCE = 'AGI Workforce';

export interface CodeDiagnostic {
  path: string;
  range: CodeRange;
  severity: CodeDiagnosticSeverity;
  message: string;
  source: string;
}

export interface CodeReviewPrompt {
  system: string;
  user: string;
}

export interface CodeReviewResult {
  diagnostics: CodeDiagnostic[];
  summary: string;
}

const ISSUE_PREFIX = 'ISSUE|';

export function parseDiagnosticSeverity(value: string): CodeDiagnosticSeverity {
  const normalized = value.trim().toLowerCase();
  return (CODE_DIAGNOSTIC_SEVERITIES as readonly string[]).includes(normalized)
    ? (normalized as CodeDiagnosticSeverity)
    : 'info';
}

export function buildCodeReviewPrompt(selection: CodeSelection): CodeReviewPrompt {
  const language = selection.document.languageId;
  return {
    system:
      'You are a senior code reviewer. Analyze the given code and report issues.\n' +
      'For each issue, output EXACTLY this format on its own line:\n' +
      `${ISSUE_PREFIX}<line_offset>|<severity>|<message>\n\n` +
      'Where:\n' +
      '- line_offset is the 0-based line number relative to the start of the code snippet\n' +
      `- severity is one of: ${CODE_DIAGNOSTIC_SEVERITIES.join(', ')}\n` +
      '- message is a concise description of the issue\n\n' +
      'After all ISSUE lines, write a brief summary paragraph.\n' +
      'If the code looks good, output no ISSUE lines and just the summary.',
    user:
      `Review this ${language} code for bugs, security issues, performance problems, and style issues:\n\n` +
      `\`\`\`${language}\n${selection.text}\n\`\`\``,
  };
}

/**
 * Offsets are relative to the reviewed snippet, so an empty selection anchors
 * at the top of the file and a real one at its start.
 */
export function parseCodeReview(response: string, selection: CodeSelection): CodeReviewResult {
  const baseLine = selection.isEmpty ? 0 : selection.range.start.line;
  const diagnostics: CodeDiagnostic[] = [];
  const summaryLines: string[] = [];

  for (const raw of response.split('\n')) {
    const trimmed = raw.trim();

    if (!trimmed.startsWith(ISSUE_PREFIX)) {
      if (trimmed !== '') summaryLines.push(trimmed);
      continue;
    }

    const parts = trimmed.split('|');
    if (parts.length < 4) continue;

    const lineOffset = Number.parseInt(parts[1] ?? '0', 10);
    const message = parts.slice(3).join('|').trim();
    if (!Number.isFinite(lineOffset) || message === '') continue;

    diagnostics.push({
      path: selection.document.path,
      range: lineRange(Math.max(0, baseLine + lineOffset)),
      severity: parseDiagnosticSeverity(parts[2] ?? 'warning'),
      message,
      source: CODE_REVIEW_DIAGNOSTIC_SOURCE,
    });
  }

  return { diagnostics, summary: summaryLines.join('\n') };
}
