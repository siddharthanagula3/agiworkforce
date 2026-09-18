export const NEW_CHAT_PATH = '/chat';
export const NEW_CHAT_DRAFT_PARAM = 'q';
export const NEW_CHAT_SOURCE_PARAM = 'from';
export const NEW_CHAT_MODE_PARAM = 'mode';

export const NEW_CHAT_SOURCE_KINDS = [
  'conversation',
  'message',
  'project',
  'file',
  'document',
  'search',
] as const;

export type NewChatSourceKind = (typeof NEW_CHAT_SOURCE_KINDS)[number];

export type NewChatWorkMode = 'chat' | 'agiwork';

export interface NewChatSource {
  kind: NewChatSourceKind;
  id: string;
}

export interface NewChatEntry {
  draft: string;
  workMode: NewChatWorkMode;
  source: NewChatSource | null;
}

// A draft travels in the address bar, where proxies and browsers start dropping
// requests past a few kilobytes; anything longer is pasted, not linked.
const MAX_DRAFT_LENGTH = 2000;
const SOURCE_SEPARATOR = ':';

function isSourceKind(value: string): value is NewChatSourceKind {
  return (NEW_CHAT_SOURCE_KINDS as readonly string[]).includes(value);
}

export function formatNewChatSource(source: NewChatSource): string {
  return `${source.kind}${SOURCE_SEPARATOR}${source.id}`;
}

export function parseNewChatSource(value: string | null | undefined): NewChatSource | null {
  if (!value) return null;
  const separator = value.indexOf(SOURCE_SEPARATOR);
  if (separator <= 0) return null;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1).trim();
  if (!id || !isSourceKind(kind)) return null;
  return { kind, id };
}

export function buildNewChatHref(entry: Partial<NewChatEntry> = {}): string {
  const params = new URLSearchParams();
  const draft = entry.draft?.trim().slice(0, MAX_DRAFT_LENGTH) ?? '';
  if (draft) params.set(NEW_CHAT_DRAFT_PARAM, draft);
  if (entry.source) params.set(NEW_CHAT_SOURCE_PARAM, formatNewChatSource(entry.source));
  if (entry.workMode === 'agiwork') params.set(NEW_CHAT_MODE_PARAM, entry.workMode);
  const query = params.toString();
  return query ? `${NEW_CHAT_PATH}?${query}` : NEW_CHAT_PATH;
}

export function parseNewChatEntry(params: URLSearchParams | null | undefined): NewChatEntry | null {
  if (!params) return null;
  const draft = (params.get(NEW_CHAT_DRAFT_PARAM) ?? '').trim().slice(0, MAX_DRAFT_LENGTH);
  const source = parseNewChatSource(params.get(NEW_CHAT_SOURCE_PARAM));
  const workMode: NewChatWorkMode =
    params.get(NEW_CHAT_MODE_PARAM) === 'agiwork' ? 'agiwork' : 'chat';
  if (!draft && !source) return null;
  return { draft, workMode, source };
}

const MAX_QUOTE_LENGTH = 500;

export function quoteForNewChatDraft(text: string): string {
  const collapsed = text.trim().replace(/\s+/g, ' ');
  if (!collapsed) return '';
  return `> ${collapsed.slice(0, MAX_QUOTE_LENGTH)}\n\n`;
}

export function stripNewChatParams(params: URLSearchParams): string {
  const next = new URLSearchParams(params);
  next.delete(NEW_CHAT_DRAFT_PARAM);
  next.delete(NEW_CHAT_SOURCE_PARAM);
  next.delete(NEW_CHAT_MODE_PARAM);
  const query = next.toString();
  return query ? `${NEW_CHAT_PATH}?${query}` : NEW_CHAT_PATH;
}
