# Volume 24 — Streaming

Status: Canonical depth for Master Spec Vol 24
Authority: `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 24, `docs/strategy/04-scaling-to-1M-architecture.md`, `docs/strategy/10-oss-corpus-port-plan.md` (codex `turn.rs`, gemini-cli compaction, CopilotKit AG-UI taxonomy).

## Philosophy & Cloud/Local stance

Streaming is the product's perceived speed and its hardest correctness surface. A stream is a _persisted lifecycle_, not a fire-and-forget pipe: every stream has a state, every chunk is recoverable, and an interruption is a first-class outcome — not an error. The gateway already does real SSE (`services/api-gateway/src/routes/providerStream.ts`); the work is making it exact, resumable, and UTF-8-safe under scale (thousands of concurrent streams — `docs/strategy/04` §3).

Cloud and Local stream the _same_ lifecycle through the _same_ shell, but over different transports: Cloud streams SSE through the gateway (with metering attached to the stream); Local streams tokens straight from the on-device runtime (`packages/platform/local-llm`) with no network and no account. The discriminated event taxonomy and the lifecycle state machine are identical so the UI never branches on trust mode — only the transport does. A Local stream must never tunnel through the cloud gateway.

## Binding rules

1. Persist the stream lifecycle: `queued → running → tool_wait → completed | interrupted | failed`. The state is durable, not just in-memory, so a reconnect can resume.
2. SSE parsing is UTF-8-safe: never split a multi-byte sequence across chunk boundaries; buffer partial bytes until a full codepoint is available (port the RLLM-style safe parser, `10` §1).
3. Honor each provider's SSE delimiter from `packages/contracts/types/src/models.json` (`sseDelimiter`, e.g. `\n\n` for cloud providers, `\n` for Ollama). Never hardcode one delimiter.
4. Stop/cancel cancels both the upstream stream **and** any in-flight tool execution, and records the `interrupted` state with whatever was produced.
5. On context-window overflow, **withhold-and-recover**: drain the partial output, compact history (summary-replaces-history, not truncation), and escalate/retry — never surface a raw overflow error.
6. Stream typed events, not raw text only: token/markdown/code deltas, tool-call lifecycle (`InProgress → Executing → Complete`), artifact fill, and image/audio frames each carry their own event type.
7. Every streamed message carries its provider + privacy label so the UI can render the trust badge (Vol 23, source-of-truth UX Lock).
8. Streams are resumable and retryable: a reconnect replays from the last durable checkpoint; a retry reuses the idempotency key so metering does not double-count (Vol 28).

## Repository map

- **Cloud SSE gateway:** `services/api-gateway/src/routes/providerStream.ts` (+ `__tests__/providerStream.live.test.ts`).
- **Runtime stream control:** `packages/ai/provider-runtime/src/` — `gateway.ts`, `watchdog.ts` (stall detection), `retry.ts`/`retry-after-internal.ts`, `fallback.ts`, `errors.ts`, `history.ts` (compaction/recovery seam).
- **Provider SSE config:** `packages/contracts/types/src/models.json` per-provider `sseDelimiter` + `tokenMultiplier`.
- **Local token stream:** `packages/platform/local-llm/src/{tier1,tier2,tier3}.ts`; mobile native streaming via `apps/mobile/services/llmGate.ts`.
- **Desktop SSE:** the battle-tested ~70KB parser in `apps/desktop/src-tauri` (Vol 6 / `docs/strategy/14` §1) and Rust loop in `crates/agiworkforce-task-runtime`.
- **UI render seam:** `packages/ui/unified-chat`, `packages/ui/ui` (stream → message/artifact rendering).

## Competitor notes

CopilotKit's AG-UI SSE taxonomy (`TEXT_DELTA` / `TOOL_CALL_*` / `STATE_SNAPSHOT`) with replay-able per-thread streams gives reconnect/resume "for free" and is the cleanest model to adapt (MIT `packages/*`, `docs/strategy/10` §6). codex-rs `core/src/session/turn.rs` fills a `FuturesOrdered` during the stream to dispatch read-only tools mid-flight, and recovers on `ContextWindowExceeded` by trimming oldest-and-retry (`10` §2) — the donor for streaming exec + recovery. gemini-cli's compaction prompt produces a resume-grade `<state_snapshot>` summary (`10` §2). AGI's divergence is that the _same_ lifecycle and taxonomy serve a fully local transport with no gateway — neither incumbent streams an on-device, no-egress path.

## Checklists

### Stream lifecycle & persistence

- [ ] Lifecycle states persisted durably: `queued/running/tool_wait/completed/interrupted/failed`.
- [ ] Reconnect resumes from the last durable checkpoint; no lost or duplicated tokens.
- [ ] A stalled stream is detected by the watchdog and transitioned to `failed`/retried, never hung.
- [ ] `interrupted` records partial output + the reason (user stop, network, overflow).

### Wire correctness

- [ ] UTF-8 parser buffers partial multi-byte sequences across chunk boundaries (test with emoji/CJK mid-chunk).
- [ ] Per-provider `sseDelimiter` read from `models.json`; no hardcoded delimiter.
- [ ] Malformed/keepalive SSE frames are tolerated without breaking the parse loop.
- [ ] Token multipliers (`tokenMultiplier`) applied per provider for accurate accounting.

### Content-type streaming

- [ ] Token + markdown deltas render incrementally without reflow flicker.
- [ ] Code blocks stream with language detection and don't break highlighting mid-token.
- [ ] Tool-call events stream a status union (`InProgress → Executing → Complete`).
- [ ] Artifact panels fill as args stream (artifact = named tool whose render fills — Vol 14).
- [ ] Image/audio frames stream as typed events; partial media renders a progress state.

### Interrupt / resume / retry / cancel

- [ ] Stop cancels upstream stream **and** in-flight tool execution.
- [ ] Retry reuses the idempotency key so metering doesn't double-count (Vol 28).
- [ ] Resume after reconnect replays per-thread events idempotently.
- [ ] Cancel during `tool_wait` aborts the pending tool and records `interrupted`.

### Overflow recovery

- [ ] Context overflow triggers drain → compact (summary-replaces-history) → escalate, never a raw error.
- [ ] Compaction summary is resume-grade (adapt gemini-cli `<state_snapshot>`), with an inflation guard.
- [ ] Tokenizer drift (e.g. Claude Opus 4.8) is budgeted so cached prompts don't overshoot the window mid-stream.

### Trust & labels

- [ ] Every streamed message carries provider + privacy label; the trust badge renders live.
- [ ] Local streams use the on-device transport only and never traverse the cloud gateway.

## Definition of Done

Streaming is production-ready when: the lifecycle state machine is persisted and resumable across reconnects; the SSE parser is UTF-8-safe and provider-delimiter-correct under concurrent load; stop cancels both stream and tools and records `interrupted`; overflow recovers via compaction instead of erroring; retries are idempotent against metering; token/code/tool-call/artifact/media all stream with correct typed events; and stream-stall + completion-success SLOs from `04` §7 hold under load test on both cloud and local transports.

## Anti-patterns

- Treating a stream as fire-and-forget — no persisted state, so a reconnect loses everything.
- Splitting multi-byte UTF-8 across chunks and rendering mojibake.
- Hardcoding `\n\n` as the SSE delimiter instead of reading `models.json` per provider.
- Stop that cancels the visible stream but leaves a tool (or a billing reservation) running.
- Erroring on context overflow instead of compacting and continuing.
- Retrying a failed stream without an idempotency key, double-charging the user.
- Tunneling a Local stream through the cloud gateway, breaking the trust boundary.
