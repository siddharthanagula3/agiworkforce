import type { ResearchReport } from '@agiworkforce/types';

export type ResearchReportDocument = Pick<
  ResearchReport,
  'title' | 'summary' | 'content' | 'citations' | 'keyFindings'
>;

/**
 * The report as one self-contained markdown document: title, summary, key
 * findings, body, and a numbered Sources list whose numbers match the report's
 * inline `[n]` citations.
 */
export function researchReportToMarkdown(report: ResearchReportDocument): string {
  const parts: string[] = [];
  if (report.title.trim()) parts.push(`# ${report.title.trim()}`);
  if (report.summary.trim()) parts.push(report.summary.trim());
  if (report.keyFindings && report.keyFindings.length > 0) {
    parts.push(
      ['## Key findings', ...report.keyFindings.map((finding) => `- ${finding}`)].join('\n'),
    );
  }
  if (report.content.trim()) parts.push(report.content.trim());
  if (report.citations.length > 0) {
    parts.push(
      [
        '## Sources',
        ...report.citations.map(
          (citation, index) => `${index + 1}. [${citation.title}](${citation.url})`,
        ),
      ].join('\n'),
    );
  }
  return parts.join('\n\n');
}

/** How much of the report rides along as grounding for a follow-up question. */
export const FOLLOW_UP_GROUNDING_CHARS = 8_000;

/**
 * The question the follow-up composer really sends: the user's words plus the
 * report they are asking about, so the answer is grounded in the stored run
 * rather than in a fresh guess at the same topic. A report too long to carry
 * whole is cut with the cut declared, never silently.
 */
export function researchReportFollowUpPrompt(
  report: ResearchReportDocument,
  question: string,
): string {
  const markdown = researchReportToMarkdown(report);
  const grounding =
    markdown.length > FOLLOW_UP_GROUNDING_CHARS
      ? `${markdown.slice(0, FOLLOW_UP_GROUNDING_CHARS)}\n\n[report truncated after ${FOLLOW_UP_GROUNDING_CHARS} characters]`
      : markdown;
  return [
    'Follow-up on a saved research report. Answer from the report below, citing its sources where they apply, and say plainly when the report does not cover the question.',
    '<research_report>',
    grounding,
    '</research_report>',
    question.trim(),
  ].join('\n\n');
}

export interface ReportArtifactInput {
  title: string;
  language: string;
  content: string;
}

/** The report as a markdown artifact the artifacts surface can own and edit. */
export function researchReportToArtifact(report: ResearchReportDocument): ReportArtifactInput {
  return {
    title: report.title || 'Research report',
    language: 'md',
    content: researchReportToMarkdown(report),
  };
}

/** A filesystem-safe base name derived from the report's own title. */
export function researchReportFilename(report: Pick<ResearchReport, 'title'>): string {
  const base = (report.title || 'research-report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'research-report';
}
