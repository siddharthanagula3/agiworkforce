/**
 * Re-export `parseRetryAfter` / `parseRetryAfterFromError` from
 * `@agiworkforce/llm-runtime`. The implementation lives in the shared
 * runtime package so every adapter benefits from the same RFC 7231
 * §7.1.3 compliant parser; this file is kept as a thin shim for
 * backwards compatibility with existing call sites that import from
 * `./retry-after`.
 *
 * NEW callers should import directly from `@agiworkforce/llm-runtime`.
 */

export { parseRetryAfter, parseRetryAfterFromError } from '@agiworkforce/llm-runtime';
