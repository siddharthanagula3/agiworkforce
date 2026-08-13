/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';

const chromeHarness = vi.hoisted(() => {
  const responses: unknown[] = [];
  const sendMessage = vi.fn((message: { type?: string }, callback?: (result: unknown) => void) => {
    if (callback) {
      callback(
        responses.shift() ?? {
          success: true,
          text: 'Done',
          provider: 'managed_cloud',
          modelSelection: 'auto',
        },
      );
      return undefined;
    }
    return Promise.resolve({ success: true });
  });
  (globalThis as Record<string, unknown>).chrome = {
    runtime: { sendMessage, lastError: undefined },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
      },
    },
  };
  return { responses, sendMessage };
});

import { createPanel } from '../src/features/content/in-page-panel/panel';

afterEach(() => {
  document.body.replaceChildren();
  chromeHarness.responses.length = 0;
  chromeHarness.sendMessage.mockClear();
  vi.restoreAllMocks();
});

function createInspectablePanel() {
  const nativeAttachShadow = HTMLElement.prototype.attachShadow;
  vi.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function (init) {
    return nativeAttachShadow.call(this, { ...init, mode: 'open' });
  });
  const controller = createPanel();
  document.body.appendChild(controller.host);
  const shadow = controller.host.shadowRoot;
  if (!shadow) throw new Error('panel shadow root was not created');
  return { controller, shadow };
}

describe('in-page panel UI', () => {
  it('disables empty sends, labels the cloud boundary, retries errors, and restores focus', async () => {
    const returnButton = document.createElement('button');
    document.body.appendChild(returnButton);
    const { controller, shadow } = createInspectablePanel();
    controller.setReturnFocus(returnButton);
    controller.open();

    expect(shadow.querySelector('.agi-provider-pill')?.textContent).toBe('Managed Cloud · Auto');
    expect(shadow.querySelector('.agi-disclosure')?.textContent).toContain('AGI Managed Cloud');
    expect(shadow.querySelector('.agi-disclosure')?.textContent).toContain(
      'Each response replaces the previous one',
    );
    const textarea = shadow.querySelector<HTMLTextAreaElement>('.agi-textarea')!;
    const submit = shadow.querySelector<HTMLButtonElement>('.agi-submit-btn')!;
    expect(textarea.placeholder).toBe('Ask one question about this page…');
    expect(textarea.getAttribute('aria-label')).toBe('Page assistant prompt');
    expect(shadow.querySelector('.agi-response-area')?.getAttribute('role')).toBe('status');
    expect(submit.disabled).toBe(true);

    textarea.value = '   ';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(submit.disabled).toBe(true);
    textarea.value = 'What is on this page?';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(submit.disabled).toBe(false);

    chromeHarness.responses.push(
      {
        success: false,
        outcome: 'retryable_error',
        message: 'Temporary failure',
        retryable: true,
      },
      {
        success: true,
        text: 'Recovered response',
        provider: 'managed_cloud',
        modelSelection: 'auto',
      },
    );
    submit.click();
    await vi.waitFor(() => {
      expect(shadow.querySelector('.agi-access-state')?.textContent).toContain('Temporary failure');
    });
    shadow.querySelector<HTMLButtonElement>('.agi-state-action')!.click();
    await vi.waitFor(() => {
      expect(shadow.querySelector('.agi-response-area')?.textContent).toBe('Recovered response');
    });
    expect(
      chromeHarness.sendMessage.mock.calls.filter(([message]) => message.type === 'IN_PAGE_PROMPT'),
    ).toHaveLength(2);
    const firstPrompt = chromeHarness.sendMessage.mock.calls.find(
      ([message]) => message.type === 'IN_PAGE_PROMPT',
    )?.[0] as { prompt?: string; pageContext?: string };
    expect(firstPrompt.prompt).toBe('What is on this page?');
    expect(firstPrompt.pageContext).toContain('Visible page text:');

    shadow.querySelector<HTMLButtonElement>('.agi-close-btn')!.click();
    expect(document.activeElement).toBe(returnButton);
  });

  it.each([
    ['signed_out', 'Sign in to continue', 'Open side panel to sign in'],
    ['plan_required', 'Managed Cloud is unavailable', 'Open side panel'],
    ['quota_exceeded', 'Usage limit reached', 'Open side panel'],
  ] as const)(
    'renders %s as an account state rather than an assistant answer',
    async (outcome, title, action) => {
      chromeHarness.responses.push({
        success: false,
        outcome,
        message: `State: ${outcome}`,
        retryable: false,
      });
      const { shadow } = createInspectablePanel();
      const textarea = shadow.querySelector<HTMLTextAreaElement>('.agi-textarea')!;
      textarea.value = 'Question';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      shadow.querySelector<HTMLButtonElement>('.agi-submit-btn')!.click();

      await vi.waitFor(() => {
        expect(shadow.querySelector('.agi-access-state-title')?.textContent).toBe(title);
      });
      expect(shadow.querySelector<HTMLButtonElement>('.agi-state-action')?.textContent).toBe(
        action,
      );
      expect(shadow.querySelector('.agi-response-area')?.textContent).not.toBe(`State: ${outcome}`);
    },
  );

  it('normalizes a stale generic worker failure into a retryable state', async () => {
    chromeHarness.responses.push({ success: false, error: 'Stale worker failure' });
    const { shadow } = createInspectablePanel();
    const textarea = shadow.querySelector<HTMLTextAreaElement>('.agi-textarea')!;
    textarea.value = 'Question';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    shadow.querySelector<HTMLButtonElement>('.agi-submit-btn')!.click();

    await vi.waitFor(() => {
      expect(shadow.querySelector('.agi-access-state')?.textContent).toContain(
        'Stale worker failure',
      );
    });
    expect(shadow.querySelector<HTMLButtonElement>('.agi-state-action')?.textContent).toBe('Retry');
  });
});
