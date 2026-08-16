
import type { BrowserContext, Page, Route } from '@playwright/test';

export const MOCK_LLM_RESPONSE = 'Mock response for E2E testing.';

function buildAnthropicSSEBody(text: string): string {
  const lines: string[] = [
    `data: ${JSON.stringify({ type: 'message_start', message: { id: 'mock-msg-e2e', type: 'message', role: 'assistant', content: [], model: 'fixture-stream-model', usage: { input_tokens: 5, output_tokens: 10 } } })}`,
    '',
    `data: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}`,
    '',
    `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}`,
    '',
    `data: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}`,
    '',
    `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } })}`,
    '',
    `data: ${JSON.stringify({ type: 'message_stop' })}`,
    '',
  ];
  return lines.join('\n');
}

function buildOpenAISSEBody(text: string): string {
  const chunk = JSON.stringify({
    id: 'mock-chatcmpl-e2e',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'fixture-stream-model',
    choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }],
  });
  const done = JSON.stringify({
    id: 'mock-chatcmpl-e2e',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'fixture-stream-model',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  });
  return `data: ${chunk}\n\ndata: ${done}\n\ndata: [DONE]\n\n`;
}

function buildOpenAIJSONBody(text: string): string {
  return JSON.stringify({
    id: 'mock-chatcmpl-e2e',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'fixture-stream-model',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
  });
}

const LLM_ROUTE_ENTRIES: Array<{
  pattern: string;
  contentType: string;
  body: (text: string) => string;
}> = [
  {
    pattern: '**/v1/messages',
    contentType: 'text/event-stream',
    body: buildAnthropicSSEBody,
  },
  {
    pattern: '**/v1/chat/completions',
    contentType: 'text/event-stream',
    body: buildOpenAISSEBody,
  },
  {
    pattern: '**/api/chat/completions',
    contentType: 'application/json',
    body: buildOpenAIJSONBody,
  },
  {
    pattern: '**/api/chat',
    contentType: 'application/json',
    body: (text) =>
      JSON.stringify({
        model: 'mock',
        created_at: new Date().toISOString(),
        message: { role: 'assistant', content: text },
        done: true,
      }),
  },
  {
    pattern: '**/generateContent*',
    contentType: 'application/json',
    body: (text) =>
      JSON.stringify({
        candidates: [
          {
            content: { parts: [{ text }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10, totalTokenCount: 15 },
      }),
  },
  {
    pattern: '**/streamGenerateContent*',
    contentType: 'text/event-stream',
    body: (text) => {
      const event = JSON.stringify({
        candidates: [
          {
            content: { parts: [{ text }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10, totalTokenCount: 15 },
      });
      return `data: ${event}\n\n`;
    },
  },
  {
    pattern: '**/api/chat/stream',
    contentType: 'text/event-stream',
    body: buildOpenAISSEBody,
  },
];

export async function installLLMMock(context: BrowserContext): Promise<void> {
  for (const entry of LLM_ROUTE_ENTRIES) {
    await context.route(entry.pattern, (route: Route) => {
      route.fulfill({
        status: 200,
        contentType: entry.contentType,
        headers: {
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-E2E-Mock': '1',
        },
        body: entry.body(MOCK_LLM_RESPONSE),
      });
    });
  }
}

export async function installTauriInvokeMock(page: Page): Promise<void> {
  await page.addInitScript((mockText: string) => {
    if (!(window as Record<string, unknown>)['__TAURI__']) {
      (window as Record<string, unknown>)['__TAURI__'] = {};
    }

    const tauri = (window as Record<string, unknown>)['__TAURI__'] as Record<string, unknown>;

    const _originalInvoke = tauri['invoke'] as
      | ((...args: unknown[]) => Promise<unknown>)
      | undefined;

    tauri['invoke'] = async (cmd: unknown, args?: unknown): Promise<unknown> => {
      const command = String(cmd);
      console.debug(`[E2E mock] invoke: ${command}`, args);

      if (
        command === 'send_chat_message' ||
        command === 'send_message' ||
        command === 'chat_completion' ||
        command === 'agentic_chat'
      ) {
        return {
          success: true,
          message: mockText,
          content: mockText,
          role: 'assistant',
        };
      }

      if (command === 'get_provider_status' || command === 'check_provider') {
        return { provider: 'mock', available: true, latency_ms: 5 };
      }

      if (command === 'get_available_models' || command === 'list_models') {
        return [{ id: 'mock-model', name: 'Mock Model', provider: 'mock' }];
      }

      if (command === 'get_conversations' || command === 'list_conversations') {
        return [];
      }

      if (command === 'get_messages' || command === 'list_messages') {
        return [];
      }

      if (command === 'create_conversation') {
        return {
          id: 'e2e-conv-' + Date.now(),
          title: 'E2E Test',
          created_at: new Date().toISOString(),
        };
      }

      if (command === 'get_settings' || command === 'load_settings') {
        return {};
      }

      if (command === 'save_settings') {
        return { success: true };
      }

      if (command === 'get_auth_status') {
        return { authenticated: false };
      }

      if (_originalInvoke) {
        return _originalInvoke(cmd, args);
      }

      return { success: true };
    };

    (window as Record<string, unknown>)['__E2E_MOCK_LLM__'] = true;
  }, MOCK_LLM_RESPONSE);
}
