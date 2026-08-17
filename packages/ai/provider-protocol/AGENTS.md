# Provider Protocol Agent Rules

Status: Current
Owner: Provider/platform owner
Last updated: 2026-07-16

Read root `AGENTS.md`, then this file, then this file.

## Scope

`packages/ai/provider-protocol` owns cross-provider LLM payload normalization: pure
functions for OpenAI Responses API policy, reasoning-effort resolution,
system-prompt cache-boundary splitting, and OpenAI-wire-format conversion
(`openai-wire-compat.ts`). No IO, no provider SDKs, no runtime context — drop
into any `ProviderAdapter` at the request-build boundary. Renamed from
`llm-normalize` to `provider-protocol` in the W4 T-wave (DM #10 rename
confirmed by the founder, executed 2026-07-16).

## Surface Topology

Request-shaping is centralized, not duplicated. Three cases, verified
2026-08-16 by `src/__tests__/surface-shaping-parity.test.ts`:

- **TS provider adapters** — `packages/ai/providers/*` (anthropic, openai,
  google, deepseek, lmstudio, minimax, moonshot, ollama, openrouter,
  perplexity, qwen, xai, zhipu) and `apps/web/app/api/llm/**` import this
  package directly.
- **Rust surfaces** — `apps/desktop` and `apps/cli` shape through
  `crates/agiworkforce-llm`, held to byte-parity with the desktop adapters by
  `apps/desktop/src-tauri/src/core/llm/tests/c2c_request_oracle.rs`.
- **Thin clients** — `apps/mobile`, `apps/extension`, `apps/extension-vscode`
  build **no** provider wire payloads. They POST a canonical body (`model`,
  `messages`, `effort`, `thinking_mode`) to the managed gateway at
  `/api/llm/v1/chat/completions`; shaping happens server-side. The parity test
  fails if any of them starts emitting `reasoning_effort`, `cache_control`,
  `max_completion_tokens`, `anthropic-version`, `thinkingConfig`,
  `generationConfig`, or `input_schema`, and fails if the canonical `Effort`
  vocabulary drifts from `OpenAIReasoningEffort`.

## Lane Contract

- Primary lane: `provider-routing`.
- Owned write path: `packages/ai/provider-protocol/**`, plus sibling
  `provider-routing` packages when a task assigns them together.
- Several files are ported from OpenClaw (MIT) — read
  `THIRD_PARTY_LICENSES.md` at repo root before editing them; preserve
  attribution and the license-porting policy (`pnpm check:licenses`).

## High-Risk Areas

- One of the few packages explicitly authorized to touch provider SDK/wire
  types internally (target-structure-finalization-2026-07-15.md §6 names
  this package's internals as an allowed vendor-type zone) — do not let
  those types leak into this package's own public exports beyond the
  normalized shapes callers expect.
- `openai-wire-compat.ts` converts to/from the exact OpenAI wire format;
  changes risk silent wire-compatibility breaks for anything expecting
  byte-identical OpenAI request/response/SSE shapes — see
  `src/__tests__/openai-wire-compat.test.ts` before changing it.
- Per-vendor/per-endpoint quirks (hostname classification, model `compat`
  flags) are production-tested knowledge covering ~15 OpenAI-compatible
  endpoints; changing classification logic without a matching test is a
  cross-endpoint regression risk.

## Verification

- `pnpm --filter @agiworkforce/provider-protocol typecheck`
- `pnpm --filter @agiworkforce/provider-protocol test`
- `pnpm --filter @agiworkforce/provider-protocol build`
- License-porting changes: `pnpm check:licenses`
