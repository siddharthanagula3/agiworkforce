import type { Page } from '@playwright/test';

export const CHAT_COMPLETIONS_PATH = '/api/llm/v1/chat/completions';

const MOCK_BRIDGE_KEY = '__agiSseChatMock';
const SSE_DONE_PAYLOAD = '[DONE]';
const SSE_CONTENT_TYPE = 'text/event-stream';
const SSE_STATUS = 200;
const REQUEST_WAIT_TIMEOUT_MS = 30_000;

interface SseChatMockConfig {
  bridgeKey: string;
  path: string;
  donePayload: string;
  contentType: string;
  status: number;
}

interface SseChatMockBridge {
  requestCount: () => number;
  push: (text: string) => boolean;
  pushDelta: (delta: Record<string, unknown>) => boolean;
  finish: () => boolean;
}

export interface SseChatMock {
  requestCount(): Promise<number>;
  waitForRequest(afterCount?: number): Promise<number>;
  push(text: string): Promise<void>;
  /** Any delta the client reads, not only assistant content. */
  pushDelta(delta: Record<string, unknown>): Promise<void>;
  finish(): Promise<void>;
}

type BridgeScope = Record<string, SseChatMockBridge | undefined>;

export async function installSseChatMock(page: Page): Promise<SseChatMock> {
  const config: SseChatMockConfig = {
    bridgeKey: MOCK_BRIDGE_KEY,
    path: CHAT_COMPLETIONS_PATH,
    donePayload: SSE_DONE_PAYLOAD,
    contentType: SSE_CONTENT_TYPE,
    status: SSE_STATUS,
  };

  await page.addInitScript((options: SseChatMockConfig) => {
    const scope = window as unknown as Record<string, unknown>;
    if (scope[options.bridgeKey]) return;

    const encoder = new TextEncoder();
    const openControllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    let requestsSeen = 0;

    const frame = (payload: string) => encoder.encode(`data: ${payload}\n\n`);

    const closeQuietly = (controller: ReadableStreamDefaultController<Uint8Array>) => {
      try {
        controller.close();
      } catch (error) {
        void error;
      }
    };

    const resolveUrl = (input: RequestInfo | URL): string => {
      if (typeof input === 'string') return input;
      if (input instanceof URL) return input.href;
      return input.url;
    };

    const nativeFetch = window.fetch.bind(window);

    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (!resolveUrl(input).includes(options.path)) return nativeFetch(input, init);
      requestsSeen += 1;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          openControllers.push(controller);
          init?.signal?.addEventListener('abort', () => {
            const at = openControllers.indexOf(controller);
            if (at !== -1) openControllers.splice(at, 1);
            closeQuietly(controller);
          });
        },
      });
      return Promise.resolve(
        new Response(body, {
          status: options.status,
          headers: { 'content-type': options.contentType },
        }),
      );
    }) as typeof window.fetch;

    const bridge: SseChatMockBridge = {
      requestCount: () => requestsSeen,
      push: (text) => {
        const controller = openControllers[openControllers.length - 1];
        if (!controller) return false;
        controller.enqueue(frame(JSON.stringify({ choices: [{ delta: { content: text } }] })));
        return true;
      },
      pushDelta: (delta) => {
        const controller = openControllers[openControllers.length - 1];
        if (!controller) return false;
        controller.enqueue(frame(JSON.stringify({ choices: [{ delta, index: 0 }] })));
        return true;
      },
      finish: () => {
        const controller = openControllers.pop();
        if (!controller) return false;
        controller.enqueue(frame(options.donePayload));
        closeQuietly(controller);
        return true;
      },
    };

    scope[options.bridgeKey] = bridge;
  }, config);

  const readRequestCount = () =>
    page.evaluate((key: string) => {
      const bridge = (window as unknown as BridgeScope)[key];
      return bridge ? bridge.requestCount() : 0;
    }, MOCK_BRIDGE_KEY);

  const waitForRequest = async (afterCount = 0) => {
    await page.waitForFunction(
      (input: { key: string; afterCount: number }) => {
        const bridge = (window as unknown as BridgeScope)[input.key];
        return Boolean(bridge && bridge.requestCount() > input.afterCount);
      },
      { key: MOCK_BRIDGE_KEY, afterCount },
      { timeout: REQUEST_WAIT_TIMEOUT_MS },
    );
    return readRequestCount();
  };

  const push = async (text: string) => {
    const delivered = await page.evaluate(
      (input: { key: string; text: string }) => {
        const bridge = (window as unknown as BridgeScope)[input.key];
        return Boolean(bridge && bridge.push(input.text));
      },
      { key: MOCK_BRIDGE_KEY, text },
    );
    if (!delivered) {
      throw new Error('installSseChatMock: no open completion stream to push into');
    }
  };

  const pushDelta = async (delta: Record<string, unknown>) => {
    const delivered = await page.evaluate(
      (input: { key: string; delta: Record<string, unknown> }) => {
        const bridge = (window as unknown as BridgeScope)[input.key];
        return Boolean(bridge && bridge.pushDelta(input.delta));
      },
      { key: MOCK_BRIDGE_KEY, delta },
    );
    if (!delivered) {
      throw new Error('installSseChatMock: no open completion stream to push into');
    }
  };

  const finish = async () => {
    const delivered = await page.evaluate((key: string) => {
      const bridge = (window as unknown as BridgeScope)[key];
      return Boolean(bridge && bridge.finish());
    }, MOCK_BRIDGE_KEY);
    if (!delivered) {
      throw new Error('installSseChatMock: no open completion stream to finish');
    }
  };

  return { requestCount: readRequestCount, waitForRequest, push, pushDelta, finish };
}
