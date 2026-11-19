/**
 * The kinds of AI output a person can report, shared by every surface that
 * files a report and the server that triages it.
 *
 * @module content-reports
 */

export const CONTENT_REPORT_SUBJECT_KINDS = [
  'chat-message',
  'research-report',
  'artifact',
  'image',
  'video',
  'shared-item',
  'voice-turn',
  'task-run',
  'schedule-run',
  'compare-answer',
  'translation',
  'code-reply',
] as const;

export type ContentReportSubjectKind = (typeof CONTENT_REPORT_SUBJECT_KINDS)[number];

export const MAX_CONTENT_REPORT_SUBJECT_ID_LENGTH = 200;

export interface ContentReportSubject {
  kind: ContentReportSubjectKind;
  id: string;
}

export function isContentReportSubjectKind(value: unknown): value is ContentReportSubjectKind {
  return (
    typeof value === 'string' && (CONTENT_REPORT_SUBJECT_KINDS as readonly string[]).includes(value)
  );
}
