import { VSCODE_CONTEXT_HANDOFF_AUTHORITY } from './context-handoff-uri';
import { REMOTE_CODE_LIMITS } from './remote-code';

export const VSCODE_DEVELOPER_SESSION_HANDOFF_PATH = '/developer-session';

const MAX_DEVELOPER_SESSION_CWD_LENGTH = 4_096;
const DEVELOPER_SESSION_THREAD_ID_RE = /^[A-Za-z0-9._:-]+$/;

export interface DeveloperSessionHandoffLink {
  threadId: string;
  cwd: string;
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

function validLink(threadId: string, cwd: string): boolean {
  return (
    threadId.length > 0 &&
    threadId.length <= REMOTE_CODE_LIMITS.idLength &&
    DEVELOPER_SESSION_THREAD_ID_RE.test(threadId) &&
    cwd.length > 0 &&
    cwd.length <= MAX_DEVELOPER_SESSION_CWD_LENGTH &&
    !cwd.includes('\0') &&
    isAbsolutePath(cwd)
  );
}

export function parseDeveloperSessionHandoffQuery(
  query: string,
): DeveloperSessionHandoffLink | null {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const threadId = (params.get('threadId') ?? '').trim();
  const cwd = params.get('cwd') ?? '';
  return validLink(threadId, cwd) ? { threadId, cwd } : null;
}

export function buildVsCodeDeveloperSessionHandoffUri(link: DeveloperSessionHandoffLink): string {
  if (!validLink(link.threadId, link.cwd)) {
    throw new Error('A session hand-off link needs the session id and its absolute folder.');
  }
  const params = new URLSearchParams({ threadId: link.threadId, cwd: link.cwd });
  return `vscode://${VSCODE_CONTEXT_HANDOFF_AUTHORITY}${VSCODE_DEVELOPER_SESSION_HANDOFF_PATH}?${params.toString()}`;
}
