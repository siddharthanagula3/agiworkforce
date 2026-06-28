/**
 * cloudAgentClient.ts — Streaming client for the AGI Cloud gateway.
 *
 * Posts to POST https://api.agiworkforce.com/v1/chat/completions in
 * OpenAI-compatible format with stream:true and browser tool definitions.
 *
 * AUTH SEAM:
 *   The service worker cannot run Clerk's browser SDK directly. Two paths:
 *     A. RECOMMENDED: the popup/side-panel obtains a Clerk session token and
 *        posts it to the service worker via chrome.runtime.sendMessage before
 *        starting the agent loop. The token is stored in chrome.storage.session
 *        under key `agi_clerk_session_token` with a short TTL.
 *     B. DEV/DEMO: set `agi_dev_bearer_token` in chrome.storage.local for a
 *        static token (useful for screencasts where re-auth is inconvenient).
 *   getAuthToken() checks session storage first (path A), then local storage
 *   (path B). A null return means no token is available; the caller should
 *   surface an auth prompt.
 *
 * MODEL:
 *   Read from packages/types/src/models.json managed_cloud.taskRouting.computer_use.
 *   Value at time of writing: "gpt-5.4-mini" (vision + function-calling capable).
 *   Not hardcoded here — the catalog value is embedded at build time via the
 *   COMPUTER_USE_MODEL constant exported below so callers can log or override it.
 *
 * EGRESS:
 *   All network calls go to GATEWAY_URL_ALLOWLIST_EXACT members only (validated
 *   by validateGatewayUrl from policy.ts). No provider host (openai.com,
 *   anthropic.com, etc.) is ever contacted — the key lives on the server.
 *
 * STREAMING:
 *   The gateway sends OpenAI-style SSE: `data: {...}\n\n` lines.
 *   callCloud() accumulates tool_calls deltas and returns a fully assembled
 *   CloudAgentResponse when the stream ends.
 */

import { validateGatewayUrl } from '../../background/policy';

// ─── Model selection ─────────────────────────────────────────────────────────
// Read from models.json managed_cloud.taskRouting.computer_use at build time.
// This import uses resolveJsonModule (enabled in tsconfig).
import modelsJson from '../../../../../packages/types/src/models.json';

/**
 * The model ID to use for computer-use tasks, sourced from the canonical
 * models.json catalog (managed_cloud › taskRouting › computer_use).
 * Never hardcode a model ID — always reference this constant.
 */
export const COMPUTER_USE_MODEL: string =
  (modelsJson.providers.managed_cloud.taskRouting as Record<string, string>)['computer_use'] ??
  'gpt-5.4-mini';

// ─── Gateway base URL ─────────────────────────────────────────────────────────

export const DEFAULT_GATEWAY_BASE = 'https://api.agiworkforce.com';

/** Storage keys */
const SESSION_TOKEN_KEY = 'agi_clerk_session_token';
const DEV_TOKEN_KEY = 'agi_dev_bearer_token';
const GATEWAY_URL_OVERRIDE_KEY = 'agi_gateway_url';

// ─── Auth seam ───────────────────────────────────────────────────────────────

/**
 * Retrieve the Bearer token for the cloud gateway.
 *
 * Priority:
 *   1. chrome.storage.session["agi_clerk_session_token"] — set by popup/side-panel
 *      after obtaining a fresh Clerk JWT (short-lived, cleared on browser close).
 *   2. chrome.storage.local["agi_dev_bearer_token"] — static dev/demo token.
 *   3. null — caller must surface an auth prompt.
 *
 * TODO (Day-2): integrate createClerkClient for service workers once the
 * Clerk Chrome Extension patterns are wired (see clerk-chrome-extension-patterns
 * skill). The popup should call `clerk.session.getToken()` and post the result
 * to the service worker via the SESSION_TOKEN_KEY path above.
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    // Path A: session token from popup/side-panel
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      'session' in chrome.storage &&
      chrome.storage.session
    ) {
      const sess = await (
        chrome.storage.session as unknown as {
          get: (keys: string[]) => Promise<Record<string, unknown>>;
        }
      ).get([SESSION_TOKEN_KEY]);
      const token = sess[SESSION_TOKEN_KEY];
      if (typeof token === 'string' && token.length > 0) return token;
    }
  } catch {
    // chrome.storage.session unavailable in test environments — fall through
  }

  try {
    // Path B: dev/demo static token
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const local = await chrome.storage.local.get([DEV_TOKEN_KEY]);
      const token = local[DEV_TOKEN_KEY];
      if (typeof token === 'string' && token.length > 0) return token;
    }
  } catch {
    // unavailable in test environments — fall through
  }

  return null;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

/** OpenAI function-calling tool definition shape (minimal). */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required?: string[];
    };
  };
}

/**
 * Browser tool definitions sent to the model.
 * These mirror the cdpDriver action surface and give the model a typed API
 * for controlling the browser.
 */
export const BROWSER_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'screenshot',
      description:
        'Capture a screenshot of the current browser tab. Returns a base64 PNG image. Use this to see the current state of the page before and after actions.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'click',
      description:
        'Click on a DOM element. PREFER using index from read_dom (e.g. index:3). ' +
        'Fall back to CSS selector or screen coordinates only when index is unavailable.',
      parameters: {
        type: 'object',
        properties: {
          index: {
            type: 'number',
            description:
              'PREFERRED: the integer index of the element as shown in read_dom output ' +
              '(e.g. [3] button "Submit" → index 3). Re-call read_dom if the index is stale.',
          },
          selector: {
            type: 'string',
            description:
              'CSS selector for the element to click. Fallback when index is unavailable.',
          },
          x: {
            type: 'number',
            description:
              'X coordinate to click (pixels from left). Use with y when only coords are known.',
          },
          y: {
            type: 'number',
            description:
              'Y coordinate to click (pixels from top). Use with x when only coords are known.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scroll',
      description: 'Scroll the page by dy pixels (positive = down) or scroll a selector into view.',
      parameters: {
        type: 'object',
        properties: {
          dy: {
            type: 'number',
            description:
              'Pixels to scroll vertically. Positive = scroll down. Provide either dy or toSelector.',
          },
          toSelector: {
            type: 'string',
            description: 'CSS selector to scroll into view. Provide either toSelector or dy.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'type',
      description:
        'Type text into an input element. PREFER supplying index to target the element directly ' +
        '(avoids a separate click). The driver will click-focus the indexed element before typing.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text to type.',
          },
          index: {
            type: 'number',
            description:
              'PREFERRED: integer index of the input element from read_dom. ' +
              'The driver focuses the element for you. Omit only when focus is already set.',
          },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_dom',
      description:
        'Get a compact text summary of all interactable elements (buttons, links, inputs) and visible page text. Use this to orient yourself before deciding which action to take.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: 'Navigate the browser tab to a URL (http or https only).',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to navigate to. Must be http:// or https://.',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find',
      description:
        'Find an element on the page by describing what it looks like or does. Returns a CSS selector or coordinate pair. Use read_dom first if possible.',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Natural language description of the element to find.',
          },
        },
        required: ['description'],
      },
    },
  },
];

// ─── Message shapes ───────────────────────────────────────────────────────────

export interface TextMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
      >;
  tool_call_id?: string;
  name?: string;
}

export interface AssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type AgentMessage = TextMessage | AssistantMessage;

export interface CloudAgentResponse {
  /** The assembled assistant message (may have tool_calls). */
  message: AssistantMessage;
  /** Whether the stream ended because the model is "done" (stop reason = stop). */
  isDone: boolean;
  /**
   * P2-7: Total tokens used in this call (prompt + completion).
   * 0 when the gateway does not emit a usage field in the SSE stream.
   */
  tokensUsed: number;
}

// ─── SSE parser ───────────────────────────────────────────────────────────────

/** Minimal SSE data line parser — extracts `data: ...` payload strings. */
function* parseSseChunk(chunk: string): Generator<string> {
  for (const line of chunk.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data: ')) {
      yield trimmed.slice(6);
    }
  }
}

/** Merge a streaming tool_calls delta into the accumulator. */
function mergeToolCallDelta(
  acc: ToolCall[],
  delta: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>,
): void {
  for (const part of delta) {
    const idx = part.index;
    if (!acc[idx]) {
      acc[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
    }
    const entry = acc[idx];
    if (!entry) continue;
    if (part.id) entry.id += part.id;
    if (part.function?.name) entry.function.name += part.function.name;
    if (part.function?.arguments) entry.function.arguments += part.function.arguments;
  }
}

// ─── Core call ───────────────────────────────────────────────────────────────

/**
 * Call the AGI Cloud gateway with a message history and tool definitions.
 * Streams the response and returns the fully-assembled CloudAgentResponse.
 *
 * @param messages  Full conversation history including the new user turn.
 * @param token     Bearer token (from getAuthToken()).
 * @param gatewayBase  Gateway origin (default https://api.agiworkforce.com).
 */
export async function callCloud(
  messages: AgentMessage[],
  token: string,
  gatewayBase: string = DEFAULT_GATEWAY_BASE,
): Promise<CloudAgentResponse> {
  // Validate gateway origin before sending JWT
  const validatedBase = validateGatewayUrl(gatewayBase);
  if (!validatedBase) {
    throw new Error(`callCloud: gateway URL not in allowlist: ${gatewayBase}`);
  }

  // The gateway mounts the LLM proxy under /api/llm/v1 (services/api-gateway), so the
  // chat-completions route is /api/llm/v1/chat/completions — a bare /v1/... 404s.
  const endpoint = `${validatedBase}/api/llm/v1/chat/completions`;

  const body = JSON.stringify({
    model: COMPUTER_USE_MODEL,
    messages,
    tools: BROWSER_TOOL_DEFINITIONS,
    tool_choice: 'auto',
    stream: true,
    max_tokens: 2048,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      // Gateway validateCsrf requires this header on every POST (rejects 403 CSRF_ERROR otherwise).
      'X-Requested-With': 'XMLHttpRequest',
      // Legacy no-op: managed cloud is public alpha (open by default). The server gate
      // (apps/web/lib/managed-compute-gate.ts) is now purely env-based — it ignores this
      // header and only 403s when the AGI_MANAGED_COMPUTE_PRIVATE_BETA kill-switch is
      // explicitly set to 0/false/off. We keep sending it for backward-compat with any
      // older gateway deployment that still inspects it; it is harmless when ignored.
      'x-agi-managed-compute-beta': '1',
    },
    body,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    // Managed cloud is public alpha (open by default). A 403 here means one of two things,
    // NOT that an operator must turn an env var on:
    //   1. The AGI_MANAGED_COMPUTE_PRIVATE_BETA kill-switch is explicitly set to 0/false/off
    //      on the server, temporarily re-gating managed cloud (incident rollback), OR
    //   2. The signed-in account lacks the paid tier required for this model
    //      (computer-use needs a paid plan).
    if (
      response.status === 403 &&
      (errText.includes('public_launch_blocked') ||
        errText.includes('managed_compute_private_beta') ||
        errText.includes('not_private_beta'))
    ) {
      throw new Error(
        'callCloud: AGI Cloud is unavailable (403). Managed cloud is public alpha and open ' +
          'by default, so this is either a temporary incident gate (the ' +
          'AGI_MANAGED_COMPUTE_PRIVATE_BETA kill-switch is set off on the server) or your ' +
          'account is not on a paid plan, which computer-use requires. Sign in with a paid ' +
          'account, or try again later if the service is temporarily gated.',
      );
    }
    if (response.status === 401) {
      throw new Error(
        'callCloud: authentication failed (401). ' +
          'Paste a fresh Clerk session token via AGI Cloud sign-in in the drawer.',
      );
    }
    throw new Error(`callCloud: gateway returned ${response.status}: ${errText.slice(0, 300)}`);
  }

  // Consume SSE stream
  const reader = response.body?.getReader();
  if (!reader) throw new Error('callCloud: response body is not readable');

  const decoder = new TextDecoder();
  let textContent = '';
  const toolCallsAcc: ToolCall[] = [];
  let isDone = false;
  let buffer = '';
  let tokensUsed = 0; // P2-7: accumulate token usage from SSE usage fields

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Accumulate chunks into buffer; parse only complete lines.
    buffer += decoder.decode(value, { stream: true });

    // Extract all complete SSE lines from the buffer in one pass.
    // parseSseChunk yields data payloads from every `data: ...` line present.
    // We do NOT reset buffer inside the loop — all lines are already in buffer
    // and the generator reads them all before we clear.
    for (const data of parseSseChunk(buffer)) {
      if (data === '[DONE]') {
        isDone = true;
        break;
      }

      let parsed: {
        choices?: Array<{
          finish_reason?: string | null;
          delta?: {
            content?: string | null;
            tool_calls?: Array<{
              index: number;
              id?: string;
              type?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
        // P2-7: OpenAI-style usage field (may appear in final chunk)
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      try {
        parsed = JSON.parse(data) as typeof parsed;
      } catch {
        continue; // malformed chunk — skip
      }

      // P2-7: Accumulate token usage when the gateway emits it
      if (parsed.usage?.total_tokens) {
        tokensUsed = parsed.usage.total_tokens;
      } else if (
        parsed.usage?.prompt_tokens !== undefined &&
        parsed.usage?.completion_tokens !== undefined
      ) {
        tokensUsed = (parsed.usage.prompt_tokens ?? 0) + (parsed.usage.completion_tokens ?? 0);
      }

      const choice = parsed.choices?.[0];
      if (!choice) continue;

      if (choice.finish_reason === 'stop') isDone = true;

      const delta = choice.delta;
      if (!delta) continue;

      if (typeof delta.content === 'string') {
        textContent += delta.content;
      }
      if (Array.isArray(delta.tool_calls)) {
        mergeToolCallDelta(toolCallsAcc, delta.tool_calls);
      }
    }

    // Clear the buffer after fully parsing; incomplete trailing lines would need
    // a line-boundary tracker but SSE lines are always newline-terminated.
    buffer = '';

    if (isDone) break;
  }

  const message: AssistantMessage = {
    role: 'assistant',
    content: textContent || null,
  };
  if (toolCallsAcc.length > 0) {
    message.tool_calls = toolCallsAcc;
  }

  return { message, isDone, tokensUsed };
}

/**
 * Resolve the gateway base URL: check storage for override, fall back to default.
 * Validates the override against GATEWAY_URL_ALLOWLIST_EXACT.
 */
export async function resolveGatewayBase(): Promise<string> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get([GATEWAY_URL_OVERRIDE_KEY]);
      const override = result[GATEWAY_URL_OVERRIDE_KEY];
      if (typeof override === 'string') {
        const validated = validateGatewayUrl(override);
        if (validated) return validated;
      }
    }
  } catch {
    // storage unavailable — use default
  }
  return DEFAULT_GATEWAY_BASE;
}
