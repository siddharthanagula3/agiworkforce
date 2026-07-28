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
 * `@agiworkforce/provider-protocol` (`MODELSTUDIO_NATIVE_BASE_URLS`) and is
 * exactly the mode the web adapter itself falls back to for streaming via
 * `QWEN_BASE_URL`. If a real DashScope-native, non-streaming, tool-free
 * integration is needed later, it belongs in a separate adapter/path — not
 * silently bolted onto this one.
 *
 * MuleRouter was removed as a gateway on 2026-07-27, and with it the
 * `/vendors/openai/v1` path quirk this module used to apply. Qwen now reaches
 * DashScope directly or arrives through OpenRouter, both of which are rooted
 * at their OpenAI-compatible path already.
 */

export const QWEN_DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
