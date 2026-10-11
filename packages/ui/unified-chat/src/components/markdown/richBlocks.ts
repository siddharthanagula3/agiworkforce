export const EMAIL_BLOCK_LANGUAGE = 'email';
export const WRITING_BLOCK_LANGUAGE = 'writing';

const RICH_BLOCK_LANGUAGES: ReadonlySet<string> = new Set([
  EMAIL_BLOCK_LANGUAGE,
  WRITING_BLOCK_LANGUAGE,
]);

export function isRichBlockLanguage(language: string): boolean {
  return RICH_BLOCK_LANGUAGES.has(language);
}

export type EmailField = 'to' | 'cc' | 'bcc' | 'subject';

export interface EmailDraft {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
}

export interface ParsedEmailBlock {
  draft: EmailDraft;
  headerFields: readonly EmailField[];
}

const HEADER_FIELDS: Readonly<Record<string, EmailField>> = {
  to: 'to',
  cc: 'cc',
  bcc: 'bcc',
  subject: 'subject',
};

const HEADER_LINE_PATTERN = /^\s*\**([A-Za-z]+)\**\s*:\s*\**\s*(.*?)\s*$/;
const BLANK_LINE_PATTERN = /^\s*$/;
const LINE_BREAK_PATTERN = /\r?\n/;
const HEADER_NAME_PREFIX_PATTERN = /^\s*\**[A-Za-z]*$/;
const RECIPIENT_SEPARATOR_PATTERN = /[,;]/;

function headerField(line: string): { field: EmailField; value: string } | null {
  const match = HEADER_LINE_PATTERN.exec(line);
  const field = match?.[1] ? HEADER_FIELDS[match[1].toLowerCase()] : undefined;
  return field ? { field, value: match?.[2] ?? '' } : null;
}

function isPartialHeaderName(line: string): boolean {
  if (!HEADER_NAME_PREFIX_PATTERN.test(line)) return false;
  const name = line.replace(/[\s*]/g, '').toLowerCase();
  return Object.keys(HEADER_FIELDS).some((field) => field.startsWith(name));
}

function trimBlankEdges(lines: readonly string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && BLANK_LINE_PATTERN.test(lines[start] ?? '')) start += 1;
  while (end > start && BLANK_LINE_PATTERN.test(lines[end - 1] ?? '')) end -= 1;
  return lines.slice(start, end).join('\n');
}

/**
 * Reads an ```email fence: `To:`, `Cc:`, `Bcc:` and `Subject:` lines, a blank
 * line, then the body. A finished block needs a recipient or a subject and a
 * body; anything else is returned as null so the caller renders the text as
 * ordinary markdown. While the fence is still streaming, a block that has only
 * begun its headers is accepted so the card does not flicker into prose.
 */
export function parseEmailBlock(source: string, streaming = false): ParsedEmailBlock | null {
  const lines = source.split(LINE_BREAK_PATTERN);
  const draft: EmailDraft = { to: '', cc: '', bcc: '', subject: '', body: '' };
  const headerFields: EmailField[] = [];
  let index = 0;
  while (index < lines.length && BLANK_LINE_PATTERN.test(lines[index] ?? '')) index += 1;

  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (BLANK_LINE_PATTERN.test(line)) {
      index += 1;
      break;
    }
    const header = headerField(line);
    if (!header) {
      const isTail = index === lines.length - 1;
      if (streaming && isTail && isPartialHeaderName(line)) return { draft, headerFields };
      break;
    }
    if (!headerFields.includes(header.field)) headerFields.push(header.field);
    draft[header.field] = draft[header.field]
      ? `${draft[header.field]}, ${header.value}`
      : header.value;
  }

  draft.body = trimBlankEdges(lines.slice(index));
  if (headerFields.length === 0) return null;
  if (streaming) return { draft, headerFields };
  const addressed = draft.to.trim() !== '' || draft.subject.trim() !== '';
  return addressed && draft.body !== '' ? { draft, headerFields } : null;
}

export function emailRecipients(field: string): string[] {
  return field
    .split(RECIPIENT_SEPARATOR_PATTERN)
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

export function emailPlainText(draft: EmailDraft): string {
  const headers = [
    draft.to.trim() ? `To: ${draft.to.trim()}` : null,
    draft.cc.trim() ? `Cc: ${draft.cc.trim()}` : null,
    draft.bcc.trim() ? `Bcc: ${draft.bcc.trim()}` : null,
    draft.subject.trim() ? `Subject: ${draft.subject.trim()}` : null,
  ].filter((line): line is string => line !== null);
  return headers.length > 0 ? `${headers.join('\n')}\n\n${draft.body}` : draft.body;
}

/**
 * Windows hands a mailto link to the mail client through a command line that
 * stops near 2,048 characters, and several clients cut there too, so a longer
 * link loses the end of the body without saying so.
 */
export const MAILTO_MAX_LENGTH = 2000;

export interface MailtoLink {
  href: string;
  bodyIncluded: boolean;
}

function mailtoHref(draft: EmailDraft, includeBody: boolean): string {
  const recipients = emailRecipients(draft.to).map(encodeURIComponent).join(',');
  const params: string[] = [];
  const cc = emailRecipients(draft.cc);
  const bcc = emailRecipients(draft.bcc);
  if (cc.length > 0) params.push(`cc=${cc.map(encodeURIComponent).join(',')}`);
  if (bcc.length > 0) params.push(`bcc=${bcc.map(encodeURIComponent).join(',')}`);
  if (draft.subject.trim()) params.push(`subject=${encodeURIComponent(draft.subject.trim())}`);
  if (includeBody && draft.body) {
    params.push(`body=${encodeURIComponent(draft.body.replace(/\r?\n/g, '\r\n'))}`);
  }
  return `mailto:${recipients}${params.length > 0 ? `?${params.join('&')}` : ''}`;
}

export function emailMailtoLink(draft: EmailDraft): MailtoLink {
  const full = mailtoHref(draft, true);
  if (full.length <= MAILTO_MAX_LENGTH || !draft.body) return { href: full, bodyIncluded: true };
  return { href: mailtoHref(draft, false), bodyIncluded: false };
}

const FENCE_OPEN_PATTERN = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/;

interface OpenFence {
  marker: string;
  length: number;
  language: string;
  start: number;
}

function closesFence(line: string, fence: OpenFence): boolean {
  const trimmed = line.trim();
  return (
    trimmed.length >= fence.length &&
    trimmed[0] === fence.marker &&
    [...trimmed].every((character) => character === fence.marker)
  );
}

function richBlockText(language: string, source: string): string {
  if (language === EMAIL_BLOCK_LANGUAGE) {
    const parsed = parseEmailBlock(source);
    return parsed ? emailPlainText(parsed.draft) : source;
  }
  return source;
}

/**
 * The message as a reader sees it: each email and writing fence becomes the
 * text its card copies, and every other fence is left exactly as written.
 */
export function richBlocksAsPlainText(markdown: string): string {
  const lines = markdown.split('\n');
  const output: string[] = [];
  let fence: OpenFence | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (fence === null) {
      const match = FENCE_OPEN_PATTERN.exec(line);
      const run = match?.[1];
      if (run) {
        fence = {
          marker: run[0] ?? '`',
          length: run.length,
          language: (match[2] ?? '').toLowerCase(),
          start: index,
        };
      }
      if (!fence || !isRichBlockLanguage(fence.language)) output.push(line);
      continue;
    }
    const rich = isRichBlockLanguage(fence.language);
    if (closesFence(line, fence)) {
      output.push(
        rich ? richBlockText(fence.language, lines.slice(fence.start + 1, index).join('\n')) : line,
      );
      fence = null;
      continue;
    }
    if (!rich) output.push(line);
  }

  if (fence !== null && isRichBlockLanguage(fence.language)) {
    output.push(richBlockText(fence.language, lines.slice(fence.start + 1).join('\n')));
  }
  return output.join('\n');
}
