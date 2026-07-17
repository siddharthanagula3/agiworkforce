import { sanitizePageText } from '../../background/policy';

export const CONTEXT_HANDOFF_STORAGE_KEY = 'agi_pending_context_handoff_v1';
export const CONTEXT_HANDOFF_TTL_MS = 5 * 60 * 1000;
export const MAX_CONTEXT_HANDOFF_SELECTION_CHARS = 2_000;
export const MAX_CONTEXT_HANDOFF_URL_CHARS = 2_048;

export const CONTEXT_HANDOFF_DESTINATION = Object.freeze({
  id: 'agi-desktop-native' as const,
  label: 'AGI Desktop',
  detail: 'Local native messaging bridge',
});

export interface PendingContextHandoff {
  version: 1;
  id: string;
  kind: 'selection';
  destination: typeof CONTEXT_HANDOFF_DESTINATION.id;
  destinationLabel: typeof CONTEXT_HANDOFF_DESTINATION.label;
  selectedText: string;
  pageUrl: string;
  tabId: number;
  createdAt: number;
  expiresAt: number;
  redactionsApplied: boolean;
}

export interface CreateSelectionContextHandoffInput {
  id?: string;
  selectedText: string;
  pageUrl: string;
  tabId: number;
  now?: number;
}

export interface ApprovedNativeSelectionMessage {
  type: 'selected_text_query';
  tabId: number;
  url: string;
  selectedText: string;
  timestamp: number;
}

export interface ContextHandoffActionResult {
  success: boolean;
  error?: string;
  consumed?: boolean;
}

const EXPECTED_PENDING_KEYS = [
  'createdAt',
  'destination',
  'destinationLabel',
  'expiresAt',
  'id',
  'kind',
  'pageUrl',
  'redactionsApplied',
  'selectedText',
  'tabId',
  'version',
] as const;

function createHandoffId(): string {
  return `ctx_${crypto.randomUUID().replace(/-/g, '')}`;
}

function sanitizeSourceUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Selected context has an invalid source URL.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only context selected from HTTP or HTTPS pages can be handed off.');
  }

  const safeUrl = `${parsed.origin}${parsed.pathname}`;
  if (safeUrl.length > MAX_CONTEXT_HANDOFF_URL_CHARS) {
    throw new Error('Selected context source URL is too long.');
  }
  return safeUrl;
}

export function createSelectionContextHandoff(
  input: CreateSelectionContextHandoffInput,
): PendingContextHandoff {
  if (!Number.isSafeInteger(input.tabId) || input.tabId <= 0) {
    throw new Error('Selected context is missing a valid browser tab.');
  }
  const createdAt = input.now ?? Date.now();
  if (!Number.isSafeInteger(createdAt) || createdAt <= 0) {
    throw new Error('Selected context has an invalid creation time.');
  }

  const originalSelection = input.selectedText.trim();
  const sanitizedSelection = sanitizePageText(originalSelection)
    .slice(0, MAX_CONTEXT_HANDOFF_SELECTION_CHARS)
    .trim();
  if (!sanitizedSelection) {
    throw new Error('Select visible text before handing context to AGI Desktop.');
  }

  const pageUrl = sanitizeSourceUrl(input.pageUrl);
  const id = input.id ?? createHandoffId();
  if (!/^ctx_[A-Za-z0-9_-]{8,80}$/.test(id)) {
    throw new Error('Selected context has an invalid handoff identifier.');
  }

  return {
    version: 1,
    id,
    kind: 'selection',
    destination: CONTEXT_HANDOFF_DESTINATION.id,
    destinationLabel: CONTEXT_HANDOFF_DESTINATION.label,
    selectedText: sanitizedSelection,
    pageUrl,
    tabId: input.tabId,
    createdAt,
    expiresAt: createdAt + CONTEXT_HANDOFF_TTL_MS,
    redactionsApplied: sanitizedSelection !== originalSelection || pageUrl !== input.pageUrl.trim(),
  };
}

export function isPendingContextHandoff(
  value: unknown,
  now: number = Date.now(),
): value is PendingContextHandoff {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== EXPECTED_PENDING_KEYS.length ||
    !EXPECTED_PENDING_KEYS.every((key, index) => key === keys[index])
  ) {
    return false;
  }
  if (
    record['version'] !== 1 ||
    record['kind'] !== 'selection' ||
    record['destination'] !== CONTEXT_HANDOFF_DESTINATION.id ||
    record['destinationLabel'] !== CONTEXT_HANDOFF_DESTINATION.label ||
    typeof record['id'] !== 'string' ||
    !/^ctx_[A-Za-z0-9_-]{8,80}$/.test(record['id']) ||
    typeof record['selectedText'] !== 'string' ||
    record['selectedText'].length === 0 ||
    record['selectedText'].length > MAX_CONTEXT_HANDOFF_SELECTION_CHARS ||
    sanitizePageText(record['selectedText']).trim() !== record['selectedText'] ||
    typeof record['pageUrl'] !== 'string' ||
    record['pageUrl'].length === 0 ||
    record['pageUrl'].length > MAX_CONTEXT_HANDOFF_URL_CHARS ||
    !Number.isSafeInteger(record['tabId']) ||
    (record['tabId'] as number) <= 0 ||
    !Number.isSafeInteger(record['createdAt']) ||
    !Number.isSafeInteger(record['expiresAt']) ||
    typeof record['redactionsApplied'] !== 'boolean'
  ) {
    return false;
  }

  const createdAt = record['createdAt'] as number;
  const expiresAt = record['expiresAt'] as number;
  if (
    createdAt <= 0 ||
    expiresAt !== createdAt + CONTEXT_HANDOFF_TTL_MS ||
    now < createdAt - 60_000 ||
    now > expiresAt
  ) {
    return false;
  }
  try {
    if (sanitizeSourceUrl(record['pageUrl']) !== record['pageUrl']) return false;
  } catch {
    return false;
  }
  return true;
}

export function toApprovedNativeSelectionMessage(
  pending: PendingContextHandoff,
  authenticatedNativeSession: boolean = false,
): ApprovedNativeSelectionMessage {
  if (!authenticatedNativeSession) {
    throw new Error(
      'A secure AGI Desktop connection is required before selected context can leave Chrome.',
    );
  }
  return {
    type: 'selected_text_query',
    tabId: pending.tabId,
    url: pending.pageUrl,
    selectedText: pending.selectedText,
    timestamp: pending.createdAt,
  };
}

export interface ContextHandoffPreviewOptions {
  onApprove: () => Promise<ContextHandoffActionResult> | ContextHandoffActionResult;
  onCancel: () => Promise<void> | void;
}

export interface ContextHandoffPreviewController {
  destroy: () => void;
}

export function mountContextHandoffPreview(
  root: HTMLElement,
  pending: PendingContextHandoff,
  options: ContextHandoffPreviewOptions,
): ContextHandoffPreviewController {
  const overlay = document.createElement('div');
  overlay.className = 'sp-context-handoff-overlay';

  const dialog = document.createElement('section');
  dialog.className = 'sp-context-handoff-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'sp-context-handoff-title');

  const title = document.createElement('h2');
  title.id = 'sp-context-handoff-title';
  title.textContent = 'Send selected context?';

  const destination = document.createElement('p');
  destination.className = 'sp-context-handoff-destination';
  destination.textContent = `Destination: ${CONTEXT_HANDOFF_DESTINATION.label} (${CONTEXT_HANDOFF_DESTINATION.detail.toLowerCase()})`;

  const explanation = document.createElement('p');
  explanation.textContent = 'Only the preview below will leave Chrome after you approve.';

  const preview = document.createElement('pre');
  preview.className = 'sp-context-handoff-preview';
  preview.dataset['contextHandoffPreview'] = '';
  preview.textContent = pending.selectedText;

  const source = document.createElement('p');
  source.className = 'sp-context-handoff-source';
  source.textContent = `Source: ${pending.pageUrl}`;

  const metadata = document.createElement('p');
  metadata.className = 'sp-context-handoff-source';
  metadata.textContent = `Browser tab: ${pending.tabId} · Selected: ${new Date(pending.createdAt).toLocaleString()}`;

  const redaction = document.createElement('p');
  redaction.className = 'sp-context-handoff-redaction';
  redaction.textContent = pending.redactionsApplied
    ? 'Sensitive, hidden, oversized, or URL query content was removed before this preview was stored.'
    : 'Secret scanning completed. No sensitive pattern was detected.';

  const status = document.createElement('p');
  status.className = 'sp-context-handoff-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const actions = document.createElement('div');
  actions.className = 'sp-context-handoff-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'sp-context-handoff-cancel';
  cancel.dataset['contextHandoffCancel'] = '';
  cancel.textContent = 'Cancel';
  const approve = document.createElement('button');
  approve.type = 'button';
  approve.className = 'sp-context-handoff-approve';
  approve.dataset['contextHandoffApprove'] = '';
  approve.textContent = 'Send redacted context';
  actions.append(cancel, approve);

  dialog.append(
    title,
    destination,
    explanation,
    preview,
    source,
    metadata,
    redaction,
    status,
    actions,
  );
  overlay.appendChild(dialog);
  root.appendChild(overlay);

  let settled = false;
  let busy = false;
  const destroy = () => {
    document.removeEventListener('keydown', handleKeydown);
    overlay.remove();
  };
  const cancelHandoff = async () => {
    if (busy) return;
    if (settled) {
      destroy();
      return;
    }
    busy = true;
    approve.disabled = true;
    cancel.disabled = true;
    try {
      await options.onCancel();
      settled = true;
      status.textContent = 'Cancelled. Nothing was sent.';
      cancel.textContent = 'Close';
      cancel.disabled = false;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Unable to cancel the handoff.';
      approve.disabled = false;
      cancel.disabled = false;
    } finally {
      busy = false;
    }
  };
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') void cancelHandoff();
  };

  cancel.addEventListener('click', () => void cancelHandoff());
  approve.addEventListener('click', () => {
    if (busy || settled) return;
    busy = true;
    approve.disabled = true;
    cancel.disabled = true;
    status.textContent = `Sending the approved preview to ${CONTEXT_HANDOFF_DESTINATION.label}…`;
    void Promise.resolve(options.onApprove())
      .then((result) => {
        if (result.success) {
          settled = true;
          status.textContent = `Sent to ${CONTEXT_HANDOFF_DESTINATION.label}.`;
          cancel.textContent = 'Close';
          cancel.disabled = false;
          return;
        }
        status.textContent = result.error ?? 'The selected context was not sent.';
        cancel.disabled = false;
        if (result.consumed) {
          settled = true;
          cancel.textContent = 'Close';
        } else {
          approve.disabled = false;
        }
      })
      .catch((error) => {
        settled = true;
        status.textContent = `${error instanceof Error ? error.message : 'Native handoff failed.'} Select the context again before retrying.`;
        cancel.textContent = 'Close';
        cancel.disabled = false;
      })
      .finally(() => {
        busy = false;
      });
  });
  document.addEventListener('keydown', handleKeydown);
  approve.focus();

  return { destroy };
}
