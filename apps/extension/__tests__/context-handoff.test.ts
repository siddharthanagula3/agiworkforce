import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
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
    });

    expect(onApprove).not.toHaveBeenCalled();
    (document.querySelector('[data-context-handoff-approve]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(onApprove).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(document.body.textContent).toContain('Sent to AGI Desktop'));
  });

  it('cancels without approval and reports that nothing was sent', async () => {
    const onApprove = vi.fn();
    const onCancel = vi.fn().mockResolvedValue(undefined);
    mountContextHandoffPreview(document.body, makePending(), { onApprove, onCancel });

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
    });

    const approve = document.querySelector('[data-context-handoff-approve]') as HTMLButtonElement;
    approve.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('not connected'));
    expect(document.body.textContent).not.toContain('Sent to AGI Desktop');
    expect(approve.disabled).toBe(false);
  });
});
