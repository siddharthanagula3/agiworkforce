import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  contextHandoffCliCommand,
  contextHandoffVsCodeUri,
  CONTEXT_HANDOFF_DESTINATION,
  CONTEXT_HANDOFF_STORAGE_KEY,
  CONTEXT_HANDOFF_TTL_MS,
  createSelectionContextHandoff,
  isPendingContextHandoff,
  mountContextHandoffPreview,
  toApprovedNativeSelectionMessage,
} from '../src/features/context-handoff';

const NOW = 1_750_000_000_000;

function makePending() {
  return createSelectionContextHandoff({
    id: 'ctx_12345678',
    selectedText: 'Use sk-ant-abcdefghijklmnopqrstuv for the demo',
    pageUrl: 'https://example.com/private?q=secret#fragment',
    tabId: 17,
    now: NOW,
  });
}

describe('selected-context handoff contract', () => {
  it('stores only sanitized selection and a query-free source URL', () => {
    const pending = makePending();

    expect(CONTEXT_HANDOFF_STORAGE_KEY).toBe('agi_pending_context_handoff_v1');
    expect(pending.selectedText).toContain('[REDACTED_ANTHROPIC_KEY]');
    expect(pending.selectedText).not.toContain('sk-ant-');
    expect(pending.pageUrl).toBe('https://example.com/private');
    expect(pending.destination).toBe(CONTEXT_HANDOFF_DESTINATION.id);
    expect(pending.redactionsApplied).toBe(true);
    expect(JSON.stringify(pending)).not.toContain('q=secret');
  });

  it('rejects malformed, expired, re-secreted, and unknown-destination records', () => {
    const pending = makePending();

    expect(isPendingContextHandoff(pending, NOW + CONTEXT_HANDOFF_TTL_MS - 1)).toBe(true);
    expect(isPendingContextHandoff(pending, NOW + CONTEXT_HANDOFF_TTL_MS + 1)).toBe(false);
    expect(
      isPendingContextHandoff({ ...pending, selectedText: 'sk-ant-abcdefghijklmnopqrstuv' }, NOW),
    ).toBe(false);
    expect(isPendingContextHandoff({ ...pending, destination: 'managed-cloud' }, NOW)).toBe(false);
    expect(isPendingContextHandoff({ ...pending, unexpected: true }, NOW)).toBe(false);
  });

  it('builds the existing native message from the approved redacted record only', () => {
    const pending = makePending();

    expect(toApprovedNativeSelectionMessage(pending, true)).toEqual({
      type: 'selected_text_query',
      tabId: 17,
      url: 'https://example.com/private',
      selectedText: pending.selectedText,
      timestamp: NOW,
    });
  });

  it('refuses to build a privileged native handoff without an authenticated session', () => {
    expect(() => toApprovedNativeSelectionMessage(makePending(), false)).toThrow(
      'secure AGI Desktop connection',
    );
  });
});

describe('context-handoff preview', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('shows the exact redacted payload and named local destination before approval', () => {
    const pending = makePending();
    mountContextHandoffPreview(document.body, pending, {
      onApprove: vi.fn(),
      onCancel: vi.fn(),
      onOpenInVsCode: vi.fn(),
      onCopyCliCommand: vi.fn(),
    });

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('AGI Desktop');
    expect(document.querySelector('[data-context-handoff-preview]')?.textContent).toBe(
      pending.selectedText,
    );
    expect(document.body.textContent).not.toContain('sk-ant-');
    expect(document.body.textContent).toContain('Sensitive, hidden, oversized, or URL query');
    expect(document.body.textContent).toContain('Browser tab: 17');
  });

  it('crosses the boundary only after the user presses the explicit send control', async () => {
    const onApprove = vi.fn().mockResolvedValue({ success: true });
    mountContextHandoffPreview(document.body, makePending(), {
      onApprove,
      onCancel: vi.fn(),
      onOpenInVsCode: vi.fn(),
      onCopyCliCommand: vi.fn(),
    });

    expect(onApprove).not.toHaveBeenCalled();
    (document.querySelector('[data-context-handoff-approve]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(onApprove).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(document.body.textContent).toContain('Sent to AGI Desktop'));
  });

  it('cancels without approval and reports that nothing was sent', async () => {
    const onApprove = vi.fn();
    const onCancel = vi.fn().mockResolvedValue(undefined);
    mountContextHandoffPreview(document.body, makePending(), {
      onApprove,
      onCancel,
      onOpenInVsCode: vi.fn(),
      onCopyCliCommand: vi.fn(),
    });

    (document.querySelector('[data-context-handoff-cancel]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
    expect(onApprove).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Cancelled. Nothing was sent.');
  });

  it('shows a retryable native-host error without claiming the payload was sent', async () => {
    mountContextHandoffPreview(document.body, makePending(), {
      onApprove: vi.fn().mockResolvedValue({
        success: false,
        error: 'AGI Desktop is not connected.',
        consumed: false,
      }),
      onCancel: vi.fn(),
      onOpenInVsCode: vi.fn(),
      onCopyCliCommand: vi.fn(),
    });

    const approve = document.querySelector('[data-context-handoff-approve]') as HTMLButtonElement;
    approve.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('not connected'));
    expect(document.body.textContent).not.toContain('Sent to AGI Desktop');
    expect(approve.disabled).toBe(false);
  });
});

describe('selected-context handoff to the local developer surfaces', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function mountWith(overrides: Record<string, unknown> = {}) {
    const options = {
      onApprove: vi.fn(),
      onCancel: vi.fn(),
      onOpenInVsCode: vi.fn().mockResolvedValue({ success: true, consumed: true }),
      onCopyCliCommand: vi.fn().mockResolvedValue({ success: true, consumed: true }),
      ...overrides,
    };
    mountContextHandoffPreview(
      document.body,
      makePending(),
      options as unknown as Parameters<typeof mountContextHandoffPreview>[2],
    );
    return options;
  }

  it('builds a vscode link and a CLI command that carry the redacted selection', () => {
    const pending = makePending();

    expect(contextHandoffVsCodeUri(pending)).toBe(
      'vscode://agiworkforce.agi-workforce/handoff?v=1&id=ctx_12345678&url=https%3A%2F%2Fexample.com%2Fprivate&text=Use+%5BREDACTED_ANTHROPIC_KEY%5D+for+the+demo',
    );
    expect(contextHandoffCliCommand(pending)).toBe(
      "agi --context-url 'agi-context://v1?v=1&id=ctx_12345678&url=https%3A%2F%2Fexample.com%2Fprivate&text=Use+%5BREDACTED_ANTHROPIC_KEY%5D+for+the+demo'",
    );
    expect(contextHandoffCliCommand(pending)).not.toContain('sk-ant-');
  });

  it('offers both local destinations, and the VS Code one is a real protocol link', () => {
    mountWith();

    const link = document.querySelector('[data-context-handoff-vscode]') as HTMLAnchorElement;
    expect(link.textContent).toBe('Open in VS Code');
    expect(link.getAttribute('href')).toBe(contextHandoffVsCodeUri(makePending()));
    expect(
      (document.querySelector('[data-context-handoff-cli]') as HTMLButtonElement).textContent,
    ).toBe('Copy CLI command');
  });

  it('hands the selection to VS Code once, then stops offering it again', async () => {
    const options = mountWith();
    const link = document.querySelector('[data-context-handoff-vscode]') as HTMLAnchorElement;

    link.click();
    await vi.waitFor(() => expect(options.onOpenInVsCode).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(document.body.textContent).toContain('Handed to VS Code'));
    expect(link.hasAttribute('href')).toBe(false);
    expect(
      (document.querySelector('[data-context-handoff-approve]') as HTMLButtonElement).disabled,
    ).toBe(true);

    link.click();
    expect(options.onOpenInVsCode).toHaveBeenCalledOnce();
  });

  it('confirms the copied command and does not claim anything was sent', async () => {
    const options = mountWith();

    (document.querySelector('[data-context-handoff-cli]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(options.onCopyCliCommand).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(document.body.textContent).toContain('Command copied'));
    expect(document.body.textContent).not.toContain('Sent to AGI Desktop');
    expect(options.onApprove).not.toHaveBeenCalled();
  });

  it('keeps every destination open when the copy fails', async () => {
    const options = mountWith({
      onCopyCliCommand: vi
        .fn()
        .mockResolvedValue({ success: false, consumed: false, error: 'Clipboard refused.' }),
    });
    const copy = document.querySelector('[data-context-handoff-cli]') as HTMLButtonElement;

    copy.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Clipboard refused.'));
    expect(copy.disabled).toBe(false);
    expect(
      (document.querySelector('[data-context-handoff-vscode]') as HTMLAnchorElement).getAttribute(
        'aria-disabled',
      ),
    ).toBe('false');
    expect(options.onApprove).not.toHaveBeenCalled();
  });
});
