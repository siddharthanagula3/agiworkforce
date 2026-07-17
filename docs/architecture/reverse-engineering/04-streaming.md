# 4. Streaming Behavior

Status: Current
Owner: Platform lead
Last updated: 2026-07-15

Streaming is the hot path of the product. This file documents the canonical stream vocabulary, the SSE framing, how different content types stream (text/thinking/tool/artifact/citation), the message lifecycle, and the tool audit-trail collapse. The provider decode → canonical chunk step lives in area 3; this file is about the chunks and how the UI consumes them.

## 4.1 The canonical `StreamChunk` vocabulary

Every provider dialect (Anthropic / OpenAI-compat / Google) decodes into one canonical union, defined in `packages/contracts/types/src/provider-adapter.ts`:

```ts
export type StreamChunk =
  | StreamChunkText // assistant visible text delta
  | StreamChunkThinking // reasoning / thinking-block delta
  | StreamChunkToolUseStart // model is calling a client tool
  | StreamChunkToolUseDelta // streaming tool-call arguments
  | StreamChunkToolUseEnd // tool call complete
  | StreamChunkServerToolUse // provider-native/server-side tool invocation
  | StreamChunkServerToolResult // provider-native tool result
  | StreamChunkCitation // source/citation annotation
  | StreamChunkVendorRaw // opaque vendor passthrough (wire fidelity)
  | StreamChunkResponseMeta // response-level metadata
  | StreamChunkUsage // token usage (incl. cache tokens)
  | StreamChunkError // typed error
  | StreamChunkStop; // terminal stop (with finish reason)
```

Design notes:

- The `ServerToolUse` / `ServerToolResult` / `Citation` / `ResponseMeta` variants are **additive** — they were introduced during the provider-migration so provider-native built-in tools (web search, code exec) and citations survive decode without losing wire fidelity. `VendorRaw` carries anything not yet modeled.
- `StreamChunkUsage` carries token counts including cached input tokens, feeding the cost settlement in area 3.
- This single vocabulary is why the tool-loop (area 3) can drive multi-step turns provider-agnostically and why the same UI renderers work across providers.

## 4.2 SSE framing and `wireMode`

The public v1 route emits **Server-Sent Events**. The framing is shaped by `wireMode` (area 3):

- **`legacy-web`** (anthropic, google): the `OpenAIWireAssembler` re-emits the exact byte sequence the hand-written legacy code produced. Byte-for-byte parity is proven by per-provider golden tests — this is the byte-stable contract (area 10). Assemblers live under the v1 route `lib/` (`stream-transform.ts`, `adapter-response.ts`, `response-builder.ts`).
- **`openai-passthrough`** (openai + 9 compat): the provider's OpenAI-shaped SSE is passed through.

Streaming vs non-streaming split at the route:

- Streaming → `buildAdapterStreamResponse(...)` produces the SSE `ReadableStream`.
- Non-streaming → `drainToLlmResponse(...)` collects chunks into a single response.

`provider-runtime` wraps the provider `stream()` with a retry generator (sticky `RetryContext`), a stream idle watchdog (detects a hung stream), session-stable headers, and an error classifier — so transient failures and idle stalls are handled inside the shared runtime, not per-surface.

## 4.3 Content-type streaming in the UI

`packages/ui/unified-chat` renders the decoded chunks. Rendering is incremental per content type:

| Content              | Chunk source                                      | Rendering                                                                                                                   |
| -------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Token / word text    | `StreamChunkText`                                 | appended into the assistant markdown buffer as it arrives                                                                   |
| Markdown / code      | `StreamChunkText`                                 | `react-markdown` + remark/rehype + `katex`; code blocks get syntax-highlight chrome; partial markdown renders progressively |
| Thinking / reasoning | `StreamChunkThinking`                             | separate collapsible thinking block, shown only when the model/provider supports reasoning                                  |
| Tool calls           | `ToolUseStart/Delta/End` + `ServerToolUse/Result` | compact tool timeline (see 4.5)                                                                                             |
| Citations            | `StreamChunkCitation`                             | mapped to message spans/results; must survive reload/export                                                                 |
| Artifacts            | detected from text/tool output                    | live-streamed into the artifact workbench (see 4.4)                                                                         |

## 4.4 Artifact live-streaming

Artifacts (code, documents, HTML, generated files) do not wait for stream completion:

- As artifact content streams, it is **live-streamed into the artifact workbench sidecar** rather than re-rendered inline. Assistant messages show a **compact artifact card**; clicking promotes the artifact into the persistent artifact store (`packages/platform/artifacts` injected store, desktop Tauri-backed) and opens the panel.
- The web chat route mounts the artifact workbench sidecar next to the conversation; detected code artifacts and generated-file manifests sync into the sidecar store. The sandboxed HTML render goes through `infrastructure/sandbox` (cross-origin isolation) — see area 7/8.
- Multi-artifact responses expose a `Download all` action at the card stack. Generated-file cards derive status/action availability/trust label from the shared `ComputeSession`/`GeneratedFile`/`ArtifactManifest` presentation helpers (`packages/platform/artifacts`), not surface-local copy.

Status: artifact content live-streaming + the tool audit trail have **landed**; the artifact _viewer_ parity build (type-specific headers, inline-vs-panel for small artifacts, version chip) is spec'd and queued (master plan wave 2).

## 4.5 Tool audit-trail collapse

Tool activity renders through a shared **compact tool timeline** (`unified-chat`; desktop `ToolTimeline`, `InlineSearchResults`):

- Streaming tool status events update the assistant-message metadata live.
- **Completed** runs collapse into short action summaries (e.g. a favicon/title/domain row + result count for search) instead of large cards.
- **Expanded** runs show icon-specific steps with result/error pills.
- Completed timelines are **persisted with the assistant message**, so a reloaded conversation preserves tool provenance.

This is the audit-trail-collapse pattern: full detail is available on expand, but the default view is a compact trace — matching the verified Claude artifact/tool-call reference direction (`docs/research/claudeai-component-spec-2026-07-10.md`).

## 4.6 The message lifecycle (and the in-progress unification)

There are two related status vocabularies today, and unifying them is a tracked in-progress item:

1. **`MessageStatus`** (`packages/contracts/types/src/conversation.ts`) — the shipped per-message vocabulary: `pending → sending → streaming → delivered | error`.
2. **The parity-target lifecycle** referenced by the matrix and used in `suite-contracts.ts` action/agent status: `queued → running → tool_wait → completed | interrupted | failed`. Agent/action status also uses `queued/running/completed/failed/cancelled`; Rust turn abort reasons are `interrupted | replaced | review_ended | budget_limited` (`agiworkforce-protocol` → `@agiworkforce/types/protocol`).

**Status (from the matrix and master plan):** "artifact content live-streaming + tool audit-trail landed; **message-lifecycle status (queued/running/tool_wait/completed/interrupted/failed) unification still to do**" (master plan §"Streaming"; matrix "Streaming states = Partial"). Master-plan wave 5 is the shared status enum + persisted interrupted/cancel/continue. Until then, treat the two vocabularies as coexisting; do not assume a single enum.

## 4.7 Cancellation & continue

- **Send / stop:** send creates a typed request with mode/provider labels; stop cancels the stream _and_ tool execution and should record an interrupted state. Cross-surface stop semantics are flagged Partial in the matrix ("cross-surface stop semantics need audit").
- **Continue generation / retry:** retry is handled inside `provider-runtime`'s retry generator for transient failures; user-visible continue/regenerate lives in message actions (matrix "Message actions = Partial").

## 4.8 What's fully documented vs flagged

- StreamChunk vocabulary, SSE framing, wireMode, content-type rendering, artifact live-streaming, tool audit-trail collapse: **fully documented**, code-verified.
- Message-lifecycle enum unification, persisted interrupted/cancel/continue, cross-surface stop: **in progress** (matrix "Streaming states / Message actions = Partial"; master-plan wave 5).
