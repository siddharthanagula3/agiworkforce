/**
 * Qwen base-URL resolution.
 *
 * JUDGMENT CALL (documented for review): `apps/web/lib/llm-providers/qwen.ts`
 * defaults to Alibaba DashScope's NATIVE generation API
 * (`https://dashscope.aliyuncs.com/api/v1`, non-OpenAI-shape: `input.messages`
 * / `parameters` instead of Chat Completions). That native endpoint does not
 * support streaming or tool calling at all — the web adapter's own
 * `streamRequest()` throws unconditionally when the base URL is still the
 * native default, and `sendDashScopeRequest()` throws if the request
 * includes tools. Since `ProviderAdapter.stream()` is this package's only
 * entry point (streaming-first, OpenAI Chat Completions shape via
 * `@agiworkforce/providers-openai`), the native endpoint cannot be
 * implemented here without a second, fundamentally different request/response
 * translator.
 *
 * This adapter instead defaults to DashScope's OpenAI-COMPATIBLE mode
 * (`https://dashscope.aliyuncs.com/compatible-mode/v1`), which is already a
 * bundled `modelstudio-native` endpoint in
 * `@agiworkforce/llm-normalize` (`MODELSTUDIO_NATIVE_BASE_URLS`) and is
 * exactly the mode the web adapter itself falls back to for streaming via
 * `QWEN_BASE_URL`. If a real DashScope-native, non-streaming, tool-free
 * integration is needed later, it belongs in a separate adapter/path — not
 * silently bolted onto this one.
 *
 * Also ports the MuleRouter path quirk from the web adapter's
 * `getOpenAICompatibleChatCompletionsUrl()`: MuleRouter's OpenAI-compatible
 * routes live under `/vendors/openai/v1`, not at the configured host root.
 */

export const QWEN_DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

const MULEROUTER_HOSTNAME = 'api.mulerouter.ai';
const MULEROUTER_VENDOR_PATH = '/vendors/openai/v1';

/**
 * Apply the MuleRouter path quirk to an already-allowlisted base URL. A
 * no-op for every other host (DashScope compatible-mode, localhost, or any
 * caller-supplied proxy already rooted at its OpenAI-compatible path).
 */
export function applyQwenBaseUrlQuirks(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.hostname !== MULEROUTER_HOSTNAME) {
    return url;
  }
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith(MULEROUTER_VENDOR_PATH) ? trimmed : `${trimmed}${MULEROUTER_VENDOR_PATH}`;
}
