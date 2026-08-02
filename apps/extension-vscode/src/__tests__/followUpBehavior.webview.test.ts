/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

function boot(behavior: 'queue' | 'steer' = 'queue'): ReturnType<typeof vi.fn> {
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
    behavior,
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

function sendWithEnter(input: HTMLTextAreaElement, text: string, ctrlKey = false): void {
  input.value = text;
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey,
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe('VS Code active-turn Queue and Steer composer', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('keeps input enabled, queues with Enter, inverts to Steer, and keeps Stop separate', () => {
    const postMessage = boot('queue');
    const input = document.getElementById('userInput') as HTMLTextAreaElement;
    const sendButton = document.getElementById('sendBtn') as HTMLButtonElement;
    const stopButton = document.getElementById('stopBtn') as HTMLButtonElement;

    sendWithEnter(input, 'Initial request');
    expect(input.disabled).toBe(false);
    expect(sendButton.getAttribute('aria-label')).toBe('Queue follow-up');
    expect(stopButton.classList.contains('visible')).toBe(true);

    sendWithEnter(input, 'Queued follow-up');
    const queuedCall = postMessage.mock.calls.find(
      ([message]) => message.type === 'sendMessage' && message.payload.text === 'Queued follow-up',
    )?.[0];
    expect(queuedCall).toEqual({
      type: 'sendMessage',
      payload: {
        text: 'Queued follow-up',
        browseWeb: false,
        clientMessageId: expect.stringMatching(/^msg-/),
        followUpBehavior: 'queue',
      },
    });
    const queuedId = queuedCall.payload.clientMessageId as string;
    expect(
      document
        .querySelector(`[data-client-message-id="${queuedId}"]`)
        ?.getAttribute('data-delivery-state'),
    ).toBe('queued');

    sendWithEnter(input, 'One-turn steer', true);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'sendMessage',
      payload: {
        text: 'One-turn steer',
        browseWeb: false,
        clientMessageId: expect.stringMatching(/^msg-/),
        followUpBehavior: 'steer',
      },
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'turnStarted',
          payload: {
            queued: true,
            queueRemaining: 0,
            clientMessageId: queuedId,
            text: 'Queued follow-up',
          },
        },
      }),
    );
    expect(
      document
        .querySelector(`[data-client-message-id="${queuedId}"]`)
        ?.getAttribute('data-delivery-state'),
    ).toBe('running');

    stopButton.click();
    expect(postMessage).toHaveBeenCalledWith({ type: 'cancel' });
  });

  it('separates a new provider thread while retaining only its submitted prompt', () => {
    const postMessage = boot();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'conversationLoaded',
          payload: {
            threadId: 'local-1',
            title: 'Local work',
            model: 'local-model',
            trustMode: 'local',
            provider: 'ollama',
            messages: [
              { role: 'user', text: 'PRIVATE_OLD_CONTEXT' },
              { role: 'assistant', text: 'Old local response' },
            ],
            transcriptTruncated: false,
          },
        },
      }),
    );
    const input = document.getElementById('userInput') as HTMLTextAreaElement;
    sendWithEnter(input, 'Use the new provider without old context');
    const send = postMessage.mock.calls.find(([message]) => message.type === 'sendMessage')?.[0];

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'conversationBoundaryChanged',
          payload: {
            message:
              'Provider boundary changed. AGI started a new developer session; earlier transcript context was not forwarded.',
            clientMessageId: send.payload.clientMessageId,
            text: 'Use the new provider without old context',
          },
        },
      }),
    );

    const messages = document.getElementById('messages')?.textContent ?? '';
    expect(messages).not.toContain('PRIVATE_OLD_CONTEXT');
    expect(messages).not.toContain('Old local response');
    expect(messages).toContain('earlier transcript context was not forwarded');
    expect(messages).toContain('Use the new provider without old context');
    expect(
      document.querySelector(`[data-client-message-id="${send.payload.clientMessageId}"]`),
    ).not.toBeNull();
  });
});
