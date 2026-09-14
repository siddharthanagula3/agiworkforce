/**
 * The chat webview must never make a user read a provider's own error text as
 * the headline. The lead's dev-host run surfaced
 * "[deepseek] API error (HTTP 400): Invalid 'tools[12].function.name': ..."
 * in a red box under "Activity 1 action · 1 error"; that string is now the
 * Details disclosure and the headline is a sentence.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { presentChatError } from '../features/sidebar-webview/errorPresentation';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

const DEEPSEEK_400 =
  "[deepseek] API error (HTTP 400): Invalid 'tools[12].function.name': string does not match pattern. Expected a string that matches the pattern '^[a-zA-Z0-9_-]+$'.";

describe('presentChatError', () => {
  it.each([
    ['[deepseek] API error (HTTP 401): bad key', 'sign-in', false],
    ['[deepseek] API error (HTTP 402): quota', 'subscription', false],
    ['[deepseek] API error (HTTP 429): slow down', 'rate-limit', true],
    ['[deepseek] API error (HTTP 503): upstream', 'provider', true],
    [DEEPSEEK_400, 'provider', false],
    ['[anthropic] Authentication failed: token expired', 'sign-in', false],
    ['[openai] Rate limited, retry after 30s', 'rate-limit', true],
    ['[openai] Stream error: connection reset', 'provider', true],
    ["Tool 'bash' failed: exit status 2", 'tool', false],
    ['Network error (https://api.deepseek.com): dns failure', 'network', true],
    [
      "Context overflow for model 'deepseek-v4-flash': 200000 tokens exceeds limit of 128000",
      'provider',
      false,
    ],
    ['Cloud chat requires pro plan. Reason: monthly quota', 'subscription', false],
    ['Configuration error: agi.toml is not valid', 'runtime', false],
  ])(
    'rewords the CLI failure %s and files the raw text under Details',
    (raw, category, retryable) => {
      const presented = presentChatError(raw);

      expect(presented.category).toBe(category);
      expect(presented.retryable).toBe(retryable);
      expect(presented.detail).toBe(raw);
      expect(presented.headline).not.toBe(raw);
      expect(presented.headline.length).toBeLessThan(110);
    },
  );

  it.each([
    ['Writing the patch failed: EACCES: permission denied', 'permission', false],
    ['The request failed, reason: ECONNREFUSED', 'network', true],
    ['The AGI local runtime is unavailable.', 'runtime', false],
  ])('classifies the loose failure %s and keeps its text', (raw, category, retryable) => {
    const presented = presentChatError(raw);

    expect(presented.category).toBe(category);
    expect(presented.retryable).toBe(retryable);
    expect(presented.headline).not.toBe(raw);
    expect(presented.detail).toBe(raw);
  });

  it.each([
    ['[deepseek] API error (HTTP 401): bad key', 'Your DeepSeek key was rejected.'],
    [
      '[deepseek] API error (HTTP 429): slow down',
      'DeepSeek is rate limiting requests. Try again in a moment.',
    ],
    [DEEPSEEK_400, 'DeepSeek rejected the request.'],
    ['[deepseek] Authentication failed: token expired', 'Your DeepSeek key was rejected.'],
    [
      'Network error (https://api.deepseek.com): dns failure',
      "Couldn't reach the model provider. Check your connection and try again.",
    ],
    ['The AGI local runtime is unavailable.', "AGI's local runtime isn't running."],
    [
      'Configuration error: agi.toml is not valid',
      "AGI's local runtime could not read its settings.",
    ],
  ])('writes the approved sentence for %s', (raw, headline) => {
    expect(presentChatError(raw).headline).toBe(headline);
  });

  it('names the provider the user chose when the failure text does not', () => {
    const presented = presentChatError(
      'Network error (https://api.deepseek.com): dns failure',
      'DeepSeek',
    );

    expect(presented.headline).toBe(
      "Couldn't reach DeepSeek. Check your connection and try again.",
    );
  });

  it('never uses an internal name in a headline', () => {
    const internals = /developer runtime|trust boundary|app-server|webview|BYOK/i;
    const samples = [
      '[deepseek] API error (HTTP 500): upstream',
      '[deepseek] Authentication failed: token expired',
      'Network error (https://api.deepseek.com): dns failure',
      'Configuration error: agi.toml is not valid',
      'The AGI local runtime is unavailable.',
      "Tool 'bash' failed: exit status 2",
      '',
    ];

    for (const sample of samples) {
      expect(presentChatError(sample).headline).not.toMatch(internals);
    }
  });

  it('names the provider from the catalog, not the id the CLI printed', () => {
    const presented = presentChatError(DEEPSEEK_400);

    expect(presented.headline).toBe('DeepSeek rejected the request.');
    expect(presented.headline).not.toContain('deepseek]');
    expect(presented.headline).not.toContain('tools[12]');
    expect(presented.headline).not.toContain('HTTP');
  });

  it('keeps an unmatched extension sentence as its own headline, with no Details', () => {
    const presented = presentChatError('No active editor for diagnostics.');

    expect(presented.category).toBe('unknown');
    expect(presented.headline).toBe('No active editor for diagnostics.');
    expect(presented.detail).toBeUndefined();
    expect(presented.retryable).toBe(false);
  });

  it('hides anything machine-shaped behind Details even when it matches no rule', () => {
    const raw = '{"error":{"code":"unknown","message":"something went wrong upstream"}}';
    const presented = presentChatError(raw);

    expect(presented.headline).toBe("AGI couldn't finish the reply.");
    expect(presented.detail).toBe(raw);
  });

  it('never returns an empty headline', () => {
    expect(presentChatError('   ').headline).toBe("AGI couldn't finish the reply.");
  });

  it('keeps a long boundary refusal readable instead of burying it', () => {
    const refusal =
      'AGI will not continue a Local developer session into BYOK, Managed Cloud, or Auto routing without a reviewed handoff. Use New Chat for a fresh provider session, or create a reviewed continuation in the AGI CLI.';

    const presented = presentChatError(refusal);

    expect(presented.headline).toBe(refusal);
    expect(presented.detail).toBeUndefined();
  });
});

function boot(): ReturnType<typeof vi.fn> {
  const html = getWebviewContent(
    {
      cspSource: 'vscode-webview://mock',
      asWebviewUri: (uri: { toString(): string }) => ({ toString: () => uri.toString() }),
    } as never,
    { toString: () => 'file:///mock/extension', fsPath: '/mock/extension' } as never,
    'test-nonce-base64url-32-chars-abcdef',
    'auto',
    'medium',
    true,
    false,
    'pro',
    false,
    'queue',
  );
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  const postMessage = vi.fn();
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => ({ postMessage }),
  });
  const inline = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );
  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inline?.textContent ?? '')();
  postMessage.mockClear();
  return postMessage;
}

function deliver(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

function sendTurn(text: string): void {
  const input = document.getElementById('userInput') as HTMLTextAreaElement;
  input.value = text;
  (document.getElementById('sendBtn') as HTMLButtonElement).click();
}

function errorBlock(): HTMLElement | null {
  return document.querySelector('.message.error');
}

describe('the chat webview error block', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('leads with the sentence and keeps the provider text collapsed', () => {
    boot();
    deliver({ type: 'error', payload: presentChatError(DEEPSEEK_400) });

    const block = errorBlock();
    expect(block?.querySelector('.error-headline')?.textContent).toBe(
      'DeepSeek rejected the request.',
    );
    expect(block?.dataset.category).toBeUndefined();
    expect(block?.getAttribute('data-error-category')).toBe('provider');

    const details = block?.querySelector('details.error-details') as HTMLDetailsElement | null;
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toBe('Details');
    expect(details?.querySelector('.error-detail-text')?.textContent).toBe(DEEPSEEK_400);
  });

  it('does not offer Retry before any turn has been sent', () => {
    boot();

    deliver({ type: 'error', payload: presentChatError('[openai] Rate limited, retry after 30s') });

    expect(errorBlock()?.querySelector('.error-retry')).toBeNull();
  });

  it('offers Retry for a transient failure and withholds it for a rejected request', () => {
    boot();
    sendTurn('count to three');

    deliver({ type: 'error', payload: presentChatError(DEEPSEEK_400) });
    expect(errorBlock()?.querySelector('.error-retry')).toBeNull();

    deliver({ type: 'error', payload: presentChatError('[openai] Rate limited, retry after 30s') });
    const blocks = document.querySelectorAll('.message.error');
    expect(blocks[blocks.length - 1]?.querySelector('.error-retry')).not.toBeNull();
  });

  it('resends the same turn under a fresh id and clears the error block', () => {
    const postMessage = boot();
    sendTurn('count to three');
    const first = postMessage.mock.calls.find(([msg]) => msg.type === 'sendMessage')?.[0] as {
      payload: { text: string; clientMessageId: string };
    };
    postMessage.mockClear();

    deliver({
      type: 'error',
      payload: presentChatError('Network error (https://x): dns failure', 'DeepSeek'),
    });
    (errorBlock()?.querySelector('.error-retry') as HTMLButtonElement).click();

    const resend = postMessage.mock.calls.find(([msg]) => msg.type === 'sendMessage')?.[0] as {
      payload: { text: string; clientMessageId: string; followUpBehavior?: string };
    };
    expect(resend.payload.text).toBe('count to three');
    expect(resend.payload.clientMessageId).not.toBe(first.payload.clientMessageId);
    expect(resend.payload.followUpBehavior).toBeUndefined();
    expect(errorBlock()).toBeNull();
  });

  it('forgets the turn when the conversation changes, so Retry cannot revive it', () => {
    boot();
    sendTurn('count to three');

    deliver({ type: 'conversationCleared' });
    deliver({
      type: 'error',
      payload: presentChatError('Network error (https://x): dns failure', 'DeepSeek'),
    });

    expect(errorBlock()?.querySelector('.error-retry')).toBeNull();
  });
});
