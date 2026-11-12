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
  const ports: Array<{ name: string; disconnect: ReturnType<typeof vi.fn> }> = [];
  const connect = vi.fn((info: { name: string }) => {
    const port = { name: info.name, disconnect: vi.fn() };
    ports.push(port);
    return port;
  });
  (globalThis as Record<string, unknown>).chrome = {
    runtime: { sendMessage, connect, lastError: undefined },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
      },
    },
  };
  return { responses, sendMessage, ports };
});

import { createPanel } from '../src/features/content/in-page-panel/panel';
import { PANEL_SLIDE_MS } from '../src/features/content/in-page-panel/panelStyles';
import {
  MAX_PAGE_TEXT_CHARACTERS,
  PAGE_TEXT_EXCERPT_NOTICE,
} from '../src/features/content/in-page-panel/pageActions';

afterEach(() => {
  document.body.replaceChildren();
  chromeHarness.responses.length = 0;
  chromeHarness.ports.length = 0;
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

  it('bounds the sanitized excerpt to the capture cap', () => {
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

  it('sends later article text and discloses an excerpt inside the shared capture budget', async () => {
    document.body.innerHTML = '<main></main>';
    document.querySelector('main')!.textContent =
      `${'x'.repeat(6_000)} LATER_ARTICLE_CONCLUSION sk-ant-${'A'.repeat(60)} ${'x'.repeat(MAX_PAGE_TEXT_CHARACTERS)}`;
    const innerText = trackInnerText();
    try {
      const { controller, shadow } = createInspectablePanel();
      controller.open();
      const textarea = shadow.querySelector<HTMLTextAreaElement>('.agi-textarea')!;
      textarea.value = 'Summarize the article';
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
      )?.[0] as { pageContext: string };
      const pageText = sent.pageContext.split('Visible page text:\n')[1]!;
      expect(pageText).toContain('LATER_ARTICLE_CONCLUSION');
      expect(pageText).toContain(PAGE_TEXT_EXCERPT_NOTICE);
      expect(pageText).toContain('[REDACTED_ANTHROPIC_KEY]');
      expect(pageText).not.toContain('sk-ant-');
      expect(pageText.length).toBeLessThanOrEqual(MAX_PAGE_TEXT_CHARACTERS);
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

      expect(controls).toHaveLength(10);
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

describe('in-page panel header and context chip', () => {
  it('names the current document in a chip above the composer', () => {
    document.title = 'Quarterly report';
    const { controller, shadow } = createInspectablePanel();
    controller.open();
    expect(shadow.querySelector('.agi-context-chip')?.textContent).toBe('Quarterly report');
  });

  it('clears the answer and draft when New is pressed', async () => {
    const { controller, shadow } = createInspectablePanel();
    controller.open();
    const textarea = shadow.querySelector<HTMLTextAreaElement>('.agi-textarea')!;
    textarea.value = 'Question';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    shadow.querySelector<HTMLButtonElement>('.agi-submit-btn')!.click();
    await vi.waitFor(() => {
      expect(shadow.querySelector('.agi-response-area')?.textContent).toBe('Done');
    });
    textarea.value = 'Draft';
    shadow.querySelector<HTMLButtonElement>('[aria-label="New question"]')!.click();
    expect(shadow.querySelector('.agi-response-area')?.textContent).toBe('');
    expect(textarea.value).toBe('');
  });

  it('opens the extension settings through the background and closes the panel', async () => {
    const { controller, shadow } = createInspectablePanel();
    controller.open();
    const header = shadow.querySelector('.agi-header')!;
    const labels = [...header.querySelectorAll('button')].map((button) =>
      button.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['New question', 'Settings', 'Close panel']);
    header.querySelector<HTMLButtonElement>('[aria-label="Settings"]')!.click();
    expect(chromeHarness.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_EXTENSION_SETTINGS' });
    await vi.waitFor(() => {
      expect(shadow.querySelector('.agi-panel')?.classList.contains('open')).toBe(false);
    });
  });

  it('says so when settings could not be opened', async () => {
    chromeHarness.sendMessage.mockImplementationOnce(() =>
      Promise.resolve({ success: false, error: 'Options page unavailable' }),
    );
    const { controller, shadow } = createInspectablePanel();
    controller.open();
    shadow.querySelector<HTMLButtonElement>('[aria-label="Settings"]')!.click();
    await vi.waitFor(() => {
      expect(shadow.querySelector('.agi-response-area')?.textContent).toBe(
        'Options page unavailable',
      );
    });
    expect(shadow.querySelector('.agi-panel')?.classList.contains('open')).toBe(true);
  });
});

function askQuestion(shadow: ShadowRoot, question: string): void {
  const textarea = shadow.querySelector<HTMLTextAreaElement>('.agi-textarea')!;
  textarea.value = question;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  shadow.querySelector<HTMLButtonElement>('.agi-submit-btn')!.click();
}

describe('in-page panel answers', () => {
  it('shows list items, paragraphs and emphasis instead of one run of raw Markdown', async () => {
    chromeHarness.responses.push({
      success: true,
      text: 'Key points:\n\n- **First** point\n- Second `code` point\n\n1. Step one\n2. Step two',
      provider: 'managed_cloud',
      modelSelection: 'auto',
    });
    const { controller, shadow } = createInspectablePanel();
    controller.open();
    askQuestion(shadow, 'Summarize');

    await vi.waitFor(() =>
      expect(shadow.querySelectorAll('.agi-response-area li')).toHaveLength(4),
    );
    const area = shadow.querySelector('.agi-response-area')!;
    expect(area.querySelectorAll('ul > li')).toHaveLength(2);
    expect(area.querySelectorAll('ol > li')).toHaveLength(2);
    expect(area.querySelector('li strong')?.textContent).toBe('First');
    expect(area.querySelector('li code')?.textContent).toBe('code');
    expect(area.textContent).not.toContain('**');
  });

  it('never treats what the model wrote as HTML', async () => {
    chromeHarness.responses.push({
      success: true,
      text: '<img src=x onerror="alert(1)"> and <script>alert(2)</script>',
      provider: 'managed_cloud',
      modelSelection: 'auto',
    });
    const { controller, shadow } = createInspectablePanel();
    controller.open();
    askQuestion(shadow, 'Summarize');

    await vi.waitFor(() =>
      expect(shadow.querySelector('.agi-response-area')?.textContent).toContain('<img'),
    );
    expect(shadow.querySelector('.agi-response-area img')).toBeNull();
    expect(shadow.querySelector('.agi-response-area script')).toBeNull();
  });

  it('cancels the request in the worker when the panel is closed while it is running', () => {
    chromeHarness.sendMessage.mockImplementation(
      (message: { type?: string }, callback?: (result: unknown) => void) => {
        if (message.type === 'IN_PAGE_PROMPT' && callback) return undefined;
        return Promise.resolve({ success: true });
      },
    );
    const { controller, shadow } = createInspectablePanel();
    controller.open();
    askQuestion(shadow, 'Summarize');

    controller.close();

    expect(chromeHarness.sendMessage).toHaveBeenCalledWith({ type: 'CANCEL_IN_PAGE_PROMPT' });
  });

  it('does not send a cancellation for a panel that is not waiting on an answer', () => {
    const { controller } = createInspectablePanel();
    controller.open();
    controller.close();
    expect(chromeHarness.sendMessage).not.toHaveBeenCalledWith({ type: 'CANCEL_IN_PAGE_PROMPT' });
  });
});

describe('in-page panel Open in side panel', () => {
  it('closes only after the worker confirms the side panel opened', async () => {
    const { controller, shadow } = createInspectablePanel();
    controller.open();
    const panel = shadow.querySelector('.agi-panel')!;

    shadow.querySelector<HTMLButtonElement>('.agi-open-side-panel')!.click();

    await vi.waitFor(() => expect(panel.classList.contains('open')).toBe(false));
  });

  it('stays open and says so when the side panel did not open', async () => {
    chromeHarness.sendMessage.mockImplementation(() =>
      Promise.resolve({ success: false, error: 'No side panel for this tab.' }),
    );
    const { controller, shadow } = createInspectablePanel();
    controller.open();
    const panel = shadow.querySelector('.agi-panel')!;

    shadow.querySelector<HTMLButtonElement>('.agi-open-side-panel')!.click();

    await vi.waitFor(() =>
      expect(shadow.querySelector('.agi-response-area')?.textContent).toContain(
        'No side panel for this tab.',
      ),
    );
    expect(panel.classList.contains('open')).toBe(true);
  });

  it('stays open with a visible message when the worker never answers', async () => {
    chromeHarness.sendMessage.mockImplementation(() => Promise.reject(new Error('port closed')));
    const { controller, shadow } = createInspectablePanel();
    controller.open();

    shadow.querySelector<HTMLButtonElement>('.agi-open-side-panel')!.click();

    await vi.waitFor(() =>
      expect(shadow.querySelector('.agi-response-area')?.textContent).toContain(
        'The side panel could not be opened',
      ),
    );
    expect(shadow.querySelector('.agi-panel')!.classList.contains('open')).toBe(true);
  });
});

describe('in-page panel and the page that asked', () => {
  function holdAnswer(): (answer: unknown) => void {
    let release: (answer: unknown) => void = () => undefined;
    chromeHarness.sendMessage.mockImplementation(
      (message: { type?: string }, callback?: (result: unknown) => void) => {
        if (message.type === 'IN_PAGE_PROMPT' && callback) {
          release = callback;
          return undefined;
        }
        return Promise.resolve({ success: true });
      },
    );
    return (answer) => release(answer);
  }

  it('ties each request to a port named after it, so the worker can tell when the page is gone', () => {
    holdAnswer();
    const { controller, shadow } = createInspectablePanel();
    controller.open();
    askQuestion(shadow, 'Summarize');

    const sent = chromeHarness.sendMessage.mock.calls.find(
      ([message]) => message.type === 'IN_PAGE_PROMPT',
    )?.[0] as { requestId?: string };
    expect(sent.requestId).toBeTruthy();
    expect(chromeHarness.ports).toHaveLength(1);
    expect(chromeHarness.ports[0]!.name).toBe(`agi-in-page-prompt:${sent.requestId}`);
    expect(chromeHarness.ports[0]!.disconnect).not.toHaveBeenCalled();
  });

  it('lets go of the port once the answer has arrived', async () => {
    const answer = holdAnswer();
    const { controller, shadow } = createInspectablePanel();
    controller.open();
    askQuestion(shadow, 'Summarize');

    answer({ success: true, text: 'Done', provider: 'managed_cloud', modelSelection: 'auto' });

    await vi.waitFor(() => expect(chromeHarness.ports[0]!.disconnect).toHaveBeenCalledTimes(1));
  });

  it('drops the request when the panel is removed from the page while it waits', () => {
    holdAnswer();
    const { controller, shadow } = createInspectablePanel();
    controller.open();
    askQuestion(shadow, 'Summarize');

    controller.destroy();

    expect(chromeHarness.ports[0]!.disconnect).toHaveBeenCalledTimes(1);
  });
});
