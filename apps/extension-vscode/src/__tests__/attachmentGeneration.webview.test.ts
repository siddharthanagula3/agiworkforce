/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

const originalFileReader = globalThis.FileReader;

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
  return postMessage;
}

class DeferredFileReader {
  static pending: DeferredFileReader[] = [];

  result: string | null = null;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  readAsDataURL(): void {
    DeferredFileReader.pending.push(this);
  }

  resolve(): void {
    this.result = 'data:image/png;base64,AQID';
    this.onload?.(new Event('load'));
  }
}

function pasteDeferredImage(): void {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: [
        {
          kind: 'file',
          getAsFile: () =>
            new File([new Uint8Array([1, 2, 3])], 'capture.png', {
              type: 'image/png',
            }),
        },
      ],
    },
  });
  document.getElementById('userInput')?.dispatchEvent(event);
}

async function flushFileRead(): Promise<void> {
  DeferredFileReader.pending[0]?.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('VS Code sidebar attachment generations', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    DeferredFileReader.pending = [];
    Object.defineProperty(globalThis, 'FileReader', {
      configurable: true,
      value: DeferredFileReader,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    Object.defineProperty(globalThis, 'FileReader', {
      configurable: true,
      value: originalFileReader,
    });
    vi.restoreAllMocks();
  });

  it.each(['newChat', 'conversationLoaded', 'conversationCleared'] as const)(
    'discards a late FileReader batch after %s resets the composer generation',
    async (reset) => {
      const postMessage = boot();
      pasteDeferredImage();
      expect(DeferredFileReader.pending).toHaveLength(1);
      expect(document.querySelectorAll('.attachment-chip.uploading')).toHaveLength(1);

      if (reset === 'newChat') {
        (document.getElementById('newChatBtn') as HTMLButtonElement).click();
      } else {
        window.dispatchEvent(
          new MessageEvent('message', {
            data:
              reset === 'conversationLoaded'
                ? {
                    type: reset,
                    payload: {
                      threadId: 'history-1',
                      title: 'History',
                      model: 'auto',
                      trustMode: 'byok',
                      provider: 'anthropic',
                      messages: [],
                      transcriptTruncated: false,
                    },
                  }
                : { type: reset },
          }),
        );
      }

      expect(document.querySelectorAll('.attachment-chip.uploading')).toHaveLength(0);

      await flushFileRead();

      expect(postMessage.mock.calls.map(([message]) => message.type)).not.toContain('attachFiles');
      expect(document.querySelectorAll('.attachment-chip.uploading')).toHaveLength(0);
      expect(document.getElementById('attachmentStrip')?.textContent).not.toContain('capture.png');
    },
  );

  it('renders the bounded-history warning as a visible session notice', () => {
    boot();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'sessionNotice',
          payload: {
            message:
              'This resumed transcript shows only the bounded newest-message window. Earlier persisted messages are not displayed here.',
          },
        },
      }),
    );

    expect(document.querySelector('.message.system')?.textContent).toContain(
      'bounded newest-message window',
    );
  });
});
