/**
 * The link a browser selection travels along when the user hands it to a local
 * developer surface instead of the paired desktop shell.
 *
 * The Chrome extension mints it, the VS Code extension reads it from its
 * `vscode://` URI handler, and `apps/cli` reads the same grammar from Rust.
 * Every field is carried in the URI itself, so a handoff never touches the
 * network and never leaves the machine that made it.
 */

export const CONTEXT_HANDOFF_URI_VERSION = '1';
export const VSCODE_CONTEXT_HANDOFF_AUTHORITY = 'agiworkforce.agi-workforce';
export const VSCODE_CONTEXT_HANDOFF_PATH = '/handoff';
export const CLI_CONTEXT_HANDOFF_SCHEME = 'agi-context';
export const CLI_CONTEXT_HANDOFF_FLAG = '--context-url';

export const MAX_CONTEXT_HANDOFF_SELECTION_CHARS = 2_000;
export const MAX_CONTEXT_HANDOFF_URL_CHARS = 2_048;

const CONTEXT_HANDOFF_ID_RE = /^ctx_[A-Za-z0-9_-]{8,80}$/;

export interface LocalContextHandoff {
  id: string;
  sourceUrl: string;
  selectedText: string;
}

export function isLocalContextHandoffSourceUrl(value: string): boolean {
  if (value.length === 0 || value.length > MAX_CONTEXT_HANDOFF_URL_CHARS) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  return `${parsed.origin}${parsed.pathname}` === value;
}

export function encodeLocalContextHandoffQuery(handoff: LocalContextHandoff): string {
  if (!CONTEXT_HANDOFF_ID_RE.test(handoff.id)) {
    throw new Error('A context handoff link needs a valid handoff identifier.');
  }
  if (!isLocalContextHandoffSourceUrl(handoff.sourceUrl)) {
    throw new Error('A context handoff link needs an http or https source page.');
  }
  const selectedText = handoff.selectedText.trim();
  if (selectedText === '' || selectedText.length > MAX_CONTEXT_HANDOFF_SELECTION_CHARS) {
    throw new Error('A context handoff link needs selected text within the size limit.');
  }
  const params = new URLSearchParams();
  params.set('v', CONTEXT_HANDOFF_URI_VERSION);
  params.set('id', handoff.id);
  params.set('url', handoff.sourceUrl);
  params.set('text', selectedText);
  return params.toString();
}

export function parseLocalContextHandoffQuery(query: string): LocalContextHandoff | null {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  if (params.get('v') !== CONTEXT_HANDOFF_URI_VERSION) return null;
  const id = params.get('id') ?? '';
  const sourceUrl = params.get('url') ?? '';
  const selectedText = (params.get('text') ?? '').trim();
  if (!CONTEXT_HANDOFF_ID_RE.test(id)) return null;
  if (!isLocalContextHandoffSourceUrl(sourceUrl)) return null;
  if (selectedText === '' || selectedText.length > MAX_CONTEXT_HANDOFF_SELECTION_CHARS) return null;
  return { id, sourceUrl, selectedText };
}

export function buildVsCodeContextHandoffUri(handoff: LocalContextHandoff): string {
  return `vscode://${VSCODE_CONTEXT_HANDOFF_AUTHORITY}${VSCODE_CONTEXT_HANDOFF_PATH}?${encodeLocalContextHandoffQuery(handoff)}`;
}

export function buildCliContextHandoffUri(handoff: LocalContextHandoff): string {
  return `${CLI_CONTEXT_HANDOFF_SCHEME}://v${CONTEXT_HANDOFF_URI_VERSION}?${encodeLocalContextHandoffQuery(handoff)}`;
}

export function buildCliContextHandoffCommand(handoff: LocalContextHandoff): string {
  return `agi ${CLI_CONTEXT_HANDOFF_FLAG} '${buildCliContextHandoffUri(handoff)}'`;
}
