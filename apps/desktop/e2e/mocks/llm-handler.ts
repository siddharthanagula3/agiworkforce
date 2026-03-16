/**
 * LLM mock handler for E2E tests.
 *
 * When E2E_MOCK_LLM=1 (the default set by global-setup.ts) this module
 * provides two things:
 *
 *  1. `installLLMMock(context)` — a Playwright `BrowserContext`-level route
 *     interceptor that catches outbound HTTP calls to every known LLM provider
 *     endpoint and returns deterministic, streaming-SSE or JSON responses
 *     without touching a real API.
 *
 *  2. `installTauriInvokeMock(page)` — an `addInitScript` that patches
 *     `window.__TAURI__.invoke` before the app code runs so that Tauri IPC
 *     commands (`send_chat_message`, `send_message`, etc.) return a canned
 *     assistant reply instead of routing to the Rust backend (which would in
 *     turn call a real LLM endpoint).
 *
 * Usage — add to the base fixture in `fixtures/index.ts`:
 *
 *   context: async ({ context }, use) => {
 *     if (process.env['E2E_MOCK_LLM'] !== '0') {
 *       await installLLMMock(context);
 *     }
 *     await use(context);
 *   },
 *
 *   page: async ({ page }, use) => {
 *     if (process.env['E2E_MOCK_LLM'] !== '0') {
 *       await installTauriInvokeMock(page);
 *     }
 *     await use(page);
 *   },
 *
 * The mock always returns:
 *   "Mock response for E2E testing."
 *
 * for streaming endpoints the response is wrapped in Anthropic-style SSE
 * events so the frontend SSE parser produces a complete, displayable message.
 */

import type { BrowserContext, Page, Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The deterministic text emitted by every mock response. */
export const MOCK_LLM_RESPONSE = 'Mock response for E2E testing.';

/**
 * Anthropic-style streaming SSE body.
 *
 * The desktop app's `sse_parser.rs` expects:
 *   message_start → content_block_start → content_block_delta* → content_block_stop → message_stop
 *
 * We emit the minimal set that makes the frontend display the message and
 * clear the streaming indicator.
 */
function buildAnthropicSSEBody(text: string): string {
  const lines: string[] = [
    `data: ${JSON.stringify({ type: 'message_start', message: { id: 'mock-msg-e2e', type: 'message', role: 'assistant', content: [], model: 'claude-mock', usage: { input_tokens: 5, output_tokens: 10 } } })}`,
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

/**
 * OpenAI-style streaming SSE body (used by OpenAI, Mistral, Groq, DeepSeek,
 * xAI, and any other OpenAI-compat provider the app targets).
 */
function buildOpenAISSEBody(text: string): string {
  const chunk = JSON.stringify({
    id: 'mock-chatcmpl-e2e',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-mock',
    choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }],
  });
  const done = JSON.stringify({
    id: 'mock-chatcmpl-e2e',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-mock',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  });
  return `data: ${chunk}\n\ndata: ${done}\n\ndata: [DONE]\n\n`;
}

/**
 * OpenAI-style non-streaming JSON response (for completions endpoint without
 * stream:true).
 */
function buildOpenAIJSONBody(text: string): string {
  return JSON.stringify({
    id: 'mock-chatcmpl-e2e',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-mock',
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

// ---------------------------------------------------------------------------
// Route patterns for all provider endpoints the app may call
// ---------------------------------------------------------------------------

/**
 * Each entry is a `{ pattern, handler }` pair.
 * Patterns are passed directly to `context.route()` / `page.route()`.
 */
const LLM_ROUTE_ENTRIES: Array<{
  pattern: string;
  contentType: string;
  body: (text: string) => string;
}> = [
  // Anthropic
  {
    pattern: '**/v1/messages',
    contentType: 'text/event-stream',
    body: buildAnthropicSSEBody,
  },
  // OpenAI + OpenAI-compat providers (Groq, Mistral, DeepSeek, xAI, etc.)
  {
    pattern: '**/v1/chat/completions',
    contentType: 'text/event-stream',
    body: buildOpenAISSEBody,
  },
  // Some self-hosted providers expose /api/chat/completions
  {
    pattern: '**/api/chat/completions',
    contentType: 'application/json',
    body: buildOpenAIJSONBody,
  },
  // Ollama native chat endpoint
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
  // Gemini generateContent
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
  // Gemini streamGenerateContent
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
  // App-internal relay endpoint (if the frontend proxies through its own API)
  {
    pattern: '**/api/chat/stream',
    contentType: 'text/event-stream',
    body: buildOpenAISSEBody,
  },
];

// ---------------------------------------------------------------------------
// Context-level interceptor (catches fetch/XHR from the page)
// ---------------------------------------------------------------------------

/**
 * Install network-level LLM mocks on a `BrowserContext`.
 *
 * This intercepts outbound HTTP calls made by the frontend (e.g. direct fetch
 * to api.anthropic.com) and returns mock SSE/JSON payloads.
 *
 * Call this once per context, before any pages are created.
 */
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

// ---------------------------------------------------------------------------
// Page-level Tauri IPC patch
// ---------------------------------------------------------------------------

/**
 * Patch `window.__TAURI__.invoke` before the page's own JS runs.
 *
 * In Tauri desktop mode the frontend calls `invoke(cmd, args)` which is
 * handled by the Rust backend. In web/playwright mode `__TAURI__` is absent
 * or has a no-op stub; this init-script ensures every chat-related command
 * returns a deterministic mock response so E2E tests are self-contained.
 *
 * Must be called before `page.goto()`.
 */
export async function installTauriInvokeMock(page: Page): Promise<void> {
  await page.addInitScript((mockText: string) => {
    // Ensure __TAURI__ namespace exists
    if (!(window as Record<string, unknown>)['__TAURI__']) {
      (window as Record<string, unknown>)['__TAURI__'] = {};
    }

    const tauri = (window as Record<string, unknown>)['__TAURI__'] as Record<string, unknown>;

    // Preserve any existing invoke (e.g. from a real Tauri webview) unless
    // already mocked.
    const _originalInvoke = tauri['invoke'] as ((...args: unknown[]) => Promise<unknown>) | undefined;

    tauri['invoke'] = async (cmd: unknown, args?: unknown): Promise<unknown> => {
      const command = String(cmd);
      console.debug(`[E2E mock] invoke: ${command}`, args);

      // ---- Chat / LLM commands ----
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

      // ---- Provider / model status ----
      if (command === 'get_provider_status' || command === 'check_provider') {
        return { provider: 'mock', available: true, latency_ms: 5 };
      }

      if (command === 'get_available_models' || command === 'list_models') {
        return [{ id: 'mock-model', name: 'Mock Model', provider: 'mock' }];
      }

      // ---- Session / conversation ----
      if (command === 'get_conversations' || command === 'list_conversations') {
        return [];
      }

      if (command === 'get_messages' || command === 'list_messages') {
        return [];
      }

      if (command === 'create_conversation') {
        return { id: 'e2e-conv-' + Date.now(), title: 'E2E Test', created_at: new Date().toISOString() };
      }

      // ---- Settings ----
      if (command === 'get_settings' || command === 'load_settings') {
        return {};
      }

      if (command === 'save_settings') {
        return { success: true };
      }

      // ---- Auth / billing (no-ops in E2E) ----
      if (command === 'get_auth_status') {
        return { authenticated: false };
      }

      // Default: forward to original invoke if available, else succeed silently
      if (_originalInvoke) {
        return _originalInvoke(cmd, args);
      }

      return { success: true };
    };

    // Mark mock as active so app code can detect E2E mode if needed
    (window as Record<string, unknown>)['__E2E_MOCK_LLM__'] = true;
  }, MOCK_LLM_RESPONSE);
}
