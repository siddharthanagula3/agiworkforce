/**
 * MiniMax base-URL resolution.
 *
 * MiniMax ships an OpenAI-compatible Chat Completions endpoint at
 * `https://api.minimax.io/v1`. Unlike Qwen (DashScope compatible-mode +
 * MuleRouter path rewrite) there is no host-specific path quirk to apply, so
 * this module exposes only the default base URL. A caller-supplied `baseUrl`
 * override is SSRF-validated against the allowlist in `./index.ts`.
 */

export const MINIMAX_DEFAULT_BASE_URL = 'https://api.minimax.io/v1';
