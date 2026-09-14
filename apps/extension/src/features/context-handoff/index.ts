import { sanitizePageText } from '../../background/policy';
import {
  buildCliContextHandoffCommand,
  buildVsCodeContextHandoffUri,
  MAX_CONTEXT_HANDOFF_SELECTION_CHARS,
  MAX_CONTEXT_HANDOFF_URL_CHARS,
} from '@agiworkforce/types';

export {
  MAX_CONTEXT_HANDOFF_SELECTION_CHARS,
  MAX_CONTEXT_HANDOFF_URL_CHARS,
} from '@agiworkforce/types';

export const CONTEXT_HANDOFF_STORAGE_KEY = 'agi_pending_context_handoff_v1';
export const CONTEXT_HANDOFF_TTL_MS = 5 * 60 * 1000;

export const CONTEXT_HANDOFF_DESTINATION = Object.freeze({
  id: 'agi-desktop-native' as const,
  label: 'AGI Desktop',
  detail: 'Local native messaging bridge',
});

export const CONTEXT_HANDOFF_VSCODE_DESTINATION = Object.freeze({
  id: 'vscode-extension' as const,
  label: 'VS Code',
  detail: 'Local vscode:// link, opens the AGI composer',
});

export const CONTEXT_HANDOFF_CLI_DESTINATION = Object.freeze({
  id: 'agi-cli' as const,
  label: 'AGI CLI',
  detail: 'Copied command, nothing leaves this machine',
});

export type ContextHandoffDestinationId =
  | typeof CONTEXT_HANDOFF_DESTINATION.id
  | typeof CONTEXT_HANDOFF_VSCODE_DESTINATION.id
  | typeof CONTEXT_HANDOFF_CLI_DESTINATION.id;

export function contextHandoffVsCodeUri(pending: PendingContextHandoff): string {
  return buildVsCodeContextHandoffUri({
    id: pending.id,
    sourceUrl: pending.pageUrl,
    selectedText: pending.selectedText,
  });
}

export function contextHandoffCliCommand(pending: PendingContextHandoff): string {
  return buildCliContextHandoffCommand({
    id: pending.id,
    sourceUrl: pending.pageUrl,
    selectedText: pending.selectedText,
  });
}

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
  onOpenInVsCode: () => Promise<ContextHandoffActionResult> | ContextHandoffActionResult;
  onCopyCliCommand: () => Promise<ContextHandoffActionResult> | ContextHandoffActionResult;
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
  destination.textContent = `Destinations: ${CONTEXT_HANDOFF_DESTINATION.label}, ${CONTEXT_HANDOFF_VSCODE_DESTINATION.label}, or ${CONTEXT_HANDOFF_CLI_DESTINATION.label}. All three stay on this machine.`;

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

  const destinations = document.createElement('div');
  destinations.className = 'sp-context-handoff-actions sp-context-handoff-destinations';
  const openInVsCode = document.createElement('a');
  openInVsCode.className = 'sp-context-handoff-secondary';
  openInVsCode.dataset['contextHandoffVscode'] = '';
  openInVsCode.textContent = `Open in ${CONTEXT_HANDOFF_VSCODE_DESTINATION.label}`;
  openInVsCode.title = CONTEXT_HANDOFF_VSCODE_DESTINATION.detail;
  openInVsCode.setAttribute('role', 'button');
  openInVsCode.href = contextHandoffVsCodeUri(pending);
  const copyCliCommand = document.createElement('button');
  copyCliCommand.type = 'button';
  copyCliCommand.className = 'sp-context-handoff-secondary';
  copyCliCommand.dataset['contextHandoffCli'] = '';
  copyCliCommand.textContent = 'Copy CLI command';
  copyCliCommand.title = CONTEXT_HANDOFF_CLI_DESTINATION.detail;
  destinations.append(openInVsCode, copyCliCommand);

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
    destinations,
    actions,
  );
  overlay.appendChild(dialog);
  root.appendChild(overlay);

  let settled = false;
  let busy = false;
  const destinationControls: HTMLElement[] = [openInVsCode, copyCliCommand, approve];
  const setDestinationsDisabled = (disabled: boolean) => {
    for (const control of destinationControls) {
      if (control instanceof HTMLButtonElement) control.disabled = disabled;
      else control.setAttribute('aria-disabled', String(disabled));
    }
  };
  const destroy = () => {
    document.removeEventListener('keydown', handleKeydown);
    overlay.remove();
  };
  const settle = (message: string) => {
    settled = true;
    status.textContent = message;
    setDestinationsDisabled(true);
    openInVsCode.removeAttribute('href');
    cancel.textContent = 'Close';
    cancel.disabled = false;
  };
  const cancelHandoff = async () => {
    if (busy) return;
    if (settled) {
      destroy();
      return;
    }
    busy = true;
    setDestinationsDisabled(true);
    cancel.disabled = true;
    try {
      await options.onCancel();
      settle('Cancelled. Nothing was sent.');
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Unable to cancel the handoff.';
      setDestinationsDisabled(false);
      cancel.disabled = false;
    } finally {
      busy = false;
    }
  };
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') void cancelHandoff();
  };
  const sendTo = (
    send: () => Promise<ContextHandoffActionResult> | ContextHandoffActionResult,
    sendingMessage: string,
    sentMessage: string,
    failureMessage: string,
  ) => {
    if (busy || settled) return;
    busy = true;
    setDestinationsDisabled(true);
    cancel.disabled = true;
    status.textContent = sendingMessage;
    void Promise.resolve(send())
      .then((result) => {
        if (result.success) {
          settle(sentMessage);
          return;
        }
        cancel.disabled = false;
        if (result.consumed) {
          settle(result.error ?? failureMessage);
          return;
        }
        status.textContent = result.error ?? failureMessage;
        setDestinationsDisabled(false);
      })
      .catch((error) => {
        settle(
          `${error instanceof Error ? error.message : failureMessage} Select the context again before retrying.`,
        );
      })
      .finally(() => {
        busy = false;
      });
  };

  cancel.addEventListener('click', () => void cancelHandoff());
  approve.addEventListener('click', () => {
    sendTo(
      options.onApprove,
      `Sending the approved preview to ${CONTEXT_HANDOFF_DESTINATION.label}…`,
      `Sent to ${CONTEXT_HANDOFF_DESTINATION.label}.`,
      'The selected context was not sent.',
    );
  });
  openInVsCode.addEventListener('click', (event) => {
    if (busy || settled) {
      event.preventDefault();
      return;
    }
    sendTo(
      options.onOpenInVsCode,
      `Handing the approved preview to ${CONTEXT_HANDOFF_VSCODE_DESTINATION.label}…`,
      `Handed to ${CONTEXT_HANDOFF_VSCODE_DESTINATION.label}. If no window opened, VS Code is not installed on this machine.`,
      `${CONTEXT_HANDOFF_VSCODE_DESTINATION.label} did not receive the selected context.`,
    );
  });
  copyCliCommand.addEventListener('click', () => {
    sendTo(
      options.onCopyCliCommand,
      'Copying the command…',
      'Command copied. Paste it in a terminal to open the selection in the AGI CLI.',
      'The command could not be copied.',
    );
  });
  document.addEventListener('keydown', handleKeydown);
  approve.focus();

  return { destroy };
}
