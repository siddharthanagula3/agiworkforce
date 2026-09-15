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
import { PANEL_SLIDE_MS } from '../src/features/content/in-page-panel/panelStyles';

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

function trackInnerText(): { reads: number; restore: () => void } {
  const state = {
    reads: 0,
    restore: () => {
      Reflect.deleteProperty(HTMLElement.prototype, 'innerText');
    },
  };
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      state.reads += 1;
      return this.textContent ?? '';
    },
  });
  return state;
}

describe('in-page panel page capture', () => {
  it('reads nothing until the panel is opened', () => {
    document.body.innerHTML = '<main>Main content here</main>';
    const innerText = trackInnerText();
    try {
      const { controller, shadow } = createInspectablePanel();

      expect(innerText.reads).toBe(0);
      expect(shadow.querySelectorAll('.agi-action-chip').length).toBeGreaterThan(0);
      expect(shadow.querySelector('.agi-disclosure')?.textContent).toContain(
        'up to 30,000 characters',
      );

      controller.open();
      expect(innerText.reads).toBeGreaterThan(0);
      expect(shadow.querySelector('.agi-disclosure')?.textContent).toContain(
        '17 characters of visible text',
      );
    } finally {
      innerText.restore();
    }
  });

  it('sends the main region rather than the whole body', async () => {
    const mainContent = `Main content here. ${'The article body continues at length. '.repeat(8)}`;
    document.body.innerHTML = `<main>${mainContent}</main><footer>Footer noise</footer>`;
    const innerText = trackInnerText();
    try {
      const { controller, shadow } = createInspectablePanel();
      controller.open();
      const textarea = shadow.querySelector<HTMLTextAreaElement>('.agi-textarea')!;
      textarea.value = 'What is here?';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      shadow.querySelector<HTMLButtonElement>('.agi-submit-btn')!.click();

      await vi.waitFor(() => {
        expect(
          chromeHarness.sendMessage.mock.calls.some(
            ([message]) => message.type === 'IN_PAGE_PROMPT',
          ),
        ).toBe(true);
      });
      const sent = chromeHarness.sendMessage.mock.calls.find(
        ([message]) => message.type === 'IN_PAGE_PROMPT',
      )?.[0] as { pageContext?: string };
      expect(sent.pageContext).toContain('Main content here');
      expect(sent.pageContext).not.toContain('Footer noise');
    } finally {
      innerText.restore();
    }
  });

  it('falls back to the body when the main region is nearly empty', async () => {
    document.body.innerHTML =
      '<main></main><div>Body content that lives outside any main landmark.</div>';
    const innerText = trackInnerText();
    try {
      const { controller, shadow } = createInspectablePanel();
      controller.open();
      const textarea = shadow.querySelector<HTMLTextAreaElement>('.agi-textarea')!;
      textarea.value = 'What is here?';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      shadow.querySelector<HTMLButtonElement>('.agi-submit-btn')!.click();

      await vi.waitFor(() => {
        expect(
          chromeHarness.sendMessage.mock.calls.some(
            ([message]) => message.type === 'IN_PAGE_PROMPT',
          ),
        ).toBe(true);
      });
      const sent = chromeHarness.sendMessage.mock.calls.find(
        ([message]) => message.type === 'IN_PAGE_PROMPT',
      )?.[0] as { pageContext?: string };
      expect(sent.pageContext).toContain('Body content that lives outside any main landmark.');
    } finally {
      innerText.restore();
    }
  });

  it('truncates to the cap before redaction runs', () => {
    document.body.innerHTML = '<main></main>';
    document.querySelector('main')!.textContent = 'x'.repeat(40_000);
    const innerText = trackInnerText();
    try {
      const { controller, shadow } = createInspectablePanel();
      controller.open();
      expect(shadow.querySelector('.agi-disclosure')?.textContent).toContain(
        '30,000 characters of visible text',
      );
    } finally {
      innerText.restore();
    }
  });

  it('never replaces a host global to learn about navigation', () => {
    const originalPushState = history.pushState;
    const navigation = new EventTarget();
    (window as Window & { navigation?: EventTarget }).navigation = navigation;
    try {
      const { shadow } = createInspectablePanel();
      const firstChip = shadow.querySelector('.agi-action-chip');

      expect(history.pushState).toBe(originalPushState);

      navigation.dispatchEvent(new Event('currententrychange'));
      const rebuiltChip = shadow.querySelector('.agi-action-chip');
      expect(rebuiltChip).not.toBe(firstChip);
    } finally {
      Reflect.deleteProperty(window as Window & { navigation?: EventTarget }, 'navigation');
    }
  });
});

describe('in-page panel host and closed state', () => {
  it('never joins the host page layout', () => {
    const { controller } = createInspectablePanel();
    const style = controller.host.style;
    expect(style.position).toBe('fixed');
    expect(style.top).toBe('0px');
    expect(style.left).toBe('0px');
    expect(style.width).toBe('0px');
    expect(style.height).toBe('0px');
    expect(style.overflow).toBe('visible');
    expect(style.zIndex).not.toBe('');
  });

  it('keeps every control out of the tab order until it is opened', () => {
    vi.useFakeTimers();
    try {
      const { controller, shadow } = createInspectablePanel();
      const panel = shadow.querySelector('.agi-panel')!;
      const controls = shadow.querySelectorAll('button, textarea');

      expect(controls).toHaveLength(8);
      expect(panel.hasAttribute('inert')).toBe(true);
      expect(panel.getAttribute('aria-hidden')).toBe('true');
      expect(panel.classList.contains('agi-panel--hidden')).toBe(true);
      for (const control of controls) {
        expect(control.closest('[inert]')).toBe(panel);
      }

      controller.open();
      expect(panel.hasAttribute('inert')).toBe(false);
      expect(panel.getAttribute('aria-hidden')).toBeNull();
      expect(panel.classList.contains('agi-panel--hidden')).toBe(false);

      controller.close();
      expect(panel.hasAttribute('inert')).toBe(true);
      expect(panel.getAttribute('aria-hidden')).toBe('true');
      expect(panel.classList.contains('agi-panel--hidden')).toBe(false);

      vi.advanceTimersByTime(PANEL_SLIDE_MS);
      expect(panel.classList.contains('agi-panel--hidden')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

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
