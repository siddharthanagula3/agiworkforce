---
id: "F091-04"
type: "feature"
title: "Streaming, cancellation and time limits"
aliases: ["Streaming normalization", "Cancellation propagation", "Request deadline management", "Stream idle watchdog", "First-token deadline", "Stop generating", "S91.14, S91.24, S91.25"]
area: "91 Model and inference components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S91.14", "S91.24", "S91.25"]
depends_on: ["F091-03", "F091-05", "SYS-chat-turn-pipeline", "SYS-observability-and-operations", "SYS-inference-providers", "mode:cloud", "surface:web", "surface:mobile", "provider:anthropic", "provider:ollama"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F091-04 Streaming, cancellation and time limits

Turns each provider's stream into one chunk format, peeks at the first chunk so a start error can still be handled, stops a silent stream after 90 seconds, bounds the time to first token and the whole stream by the turn's budget, and carries the person's stop to the provider call.

Area: [91. Model and inference components](README.md). Requirement items: [S91.14](../../10-requirements/capabilities/091-model-and-inference-components.md#s9114), [S91.24](../../10-requirements/capabilities/091-model-and-inference-components.md#s9124), [S91.25](../../10-requirements/capabilities/091-model-and-inference-components.md#s9125).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Each provider adapter translates its stream into StreamChunk values wrapped in an idle watchdog; the server peeks the first chunk, arms first-token and stream deadlines, forwards the client's abort signal, and settles billing for a stopped turn (packages/ai/providers/anthropic/src/index.ts:130; apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts:132-185; apps/web/app/api/llm/v1/chat/completions/lib/provider-deadlines.ts:86-139).

**Why it exists.** Apps read one stream format; a hung provider must not hold a server function open; Stop must really stop.

**Who uses it.** Everyone who chats; operators watch timeouts.

**Problems it solves**

- Different vendor stream shapes.
- Hung upstream holding a request.
- Provider continuing to run after the person stopped.
- Errors surfacing after the person already saw text.

**Use cases**

- Person watches text appear and presses stop.
- Provider never answers; the turn ends with a time-out error and may move to another route.
- Provider goes quiet mid-answer; the stream ends after 90 seconds of silence.
- Person closes the tab; the provider call aborts.

## 2. User experience

**Where to find it**

- Web: send button turns into a stop control with accessible name 'Stop the current response' (apps/web/features/chat/components/Composer/SendButton.tsx:50).
- Mobile: send button shows 'Stop generating' while streaming (apps/mobile/src/features/chat/components/SendButton.tsx:53); caption 'Stopped before it finished' (apps/mobile/src/features/chat/components/AssistantSurface.tsx:572).
- Other apps: unknown.

**Before you start**

- Cloud mode streaming request.

**Screens and controls**

- Stop control in the composer.
- Streaming text area.

**Journey**

1. Person sends a message.
2. Server connects to the provider and peeks the first chunk.
3. Text streams in chunks.
4. Person presses Stop, or the stream ends, or a deadline fires.
5. The partial answer is kept; the turn is marked stopped; usage settles.

**What the person sees and gets**

- Streamed text; stopped caption on Mobile.
- Time-out error text: 'The model sent no first token within its Ns first-token timeout.' or the stream-deadline message (provider-deadlines.ts:29-55).

**Settings**

- None for the person. Deadline constants are in apps/web/lib/deadline-policy.ts.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Stream normalisation: StreamChunk union of text, thinking, tool use, citation, usage, error, stop (packages/contracts/types/src/provider-adapter.ts:445-460); each provider adapter translates (packages/ai/providers/anthropic/src/index.ts:130).
- Idle watchdog default 90 seconds, error name StreamIdleTimeoutError (packages/ai/provider-runtime/src/watchdog.ts:1-12); used by the adapters for anthropic, deepseek, google, groq, lmstudio, minimax, moonshot, ollama, openai, openrouter, perplexity, qwen, vercel-gateway, zhipu and the OpenAI-compatible adapter that xai and nvidia use (grep of withStreamIdleWatchdog under packages/ai/providers; xai/src/index.ts:27).
- First chunk peek: an error first chunk is mapped to an Error with status and thrown before streaming starts (apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts:161-182).
- First-token deadline 25s per call inside a 40s turn budget; stream deadline equals the tool-loop budget (apps/web/lib/deadline-policy.ts:5, :10-14; provider-deadlines.ts:58-64, :241-290).
- Client abort forwards to the provider call through the armed signal (provider-deadlines.ts:86-101); route passes request.signal (route.ts:1270-1276).
- Cancelled streams: partial answer persisted; tokens already produced are billed as completed (stream-transform.ts:131-139, :715-750, :939-953).
- Heartbeat wrapper around the SSE body (stream-transform.ts:~957 withSseHeartbeat).

**Incomplete**

- Half-time warning exists in the watchdog (onHalfTimeWarning, default warning at idle/2) but no call site passes hooks, so the warning is never raised (packages/ai/provider-runtime/src/watchdog.ts:13-20; grep of onHalfTimeWarning found only the definition).
- Workers-ai adapter: no watchdog use found; unknown.
- Brief cites route.ts:521 for cancellation; that line is secret handling, and cancellation is in stream-transform.ts and provider-deadlines.ts.

**Present but disconnected or switched off**

- Watchdog half-time warning hook: defined, unused.

**Not available**

- Resuming a stopped turn from the provider: not found in this feature.
- Local-mode streaming: unknown.

## 4. Required behaviour

**Established requirements**

- Provider streams are normalised into one stream-chunk format. (source: S91.14 Should)
- Client cancellation is propagated to the provider call. (source: S91.24 Should)
- Requests carry first-token and stream deadlines. (source: S91.25 Should)
- The first chunk is checked before streaming starts; an error in it is mapped to a normal error and sent back. (source: feature use text; code at adapter-factory.ts:161-182)
- A stream that goes quiet for 90 seconds is stopped; a warning is raised at half that time. (source: feature use text; warning not implemented (see gaps))

**Acceptance criteria**

1. After pressing Stop, the provider request is aborted and the partial text stays.
2. With a provider that never answers, the turn fails with a first-token error within the 25 second per-call limit.
3. A stream that stalls for 90 seconds ends with a StreamIdleTimeoutError-class error.
4. A first chunk that is an error is returned as an error response, not as a half-open stream.
5. A stream longer than the stream deadline is stopped with the stream-deadline message.
6. Stopped turns bill only tokens produced; a stop before any token is refunded.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The half-time warning should be logged or traced so operators can see slow providers.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass onHalfTimeWarning from each adapter to a log line with provider and model.
- [proposed] Add a test that every adapter wraps its stream in the watchdog.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | withStreamIdleWatchdog | `packages/ai/provider-runtime/src/watchdog.ts` | 90 second idle watchdog (:1, :24). |
| service | adapter streams | `packages/ai/providers/anthropic/src/index.ts` | Wraps translated stream in the watchdog (:130); other adapters do the same in their index.ts. |
| service | startProviderStream | `apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts` | First chunk peek and error mapping (:132-185). |
| service | provider deadlines | `apps/web/app/api/llm/v1/chat/completions/lib/provider-deadlines.ts` | armProviderDeadlines (:86), startProviderStreamWithinTurnDeadlines (:241), errors (:29, :45). |
| config | deadline policy | `apps/web/lib/deadline-policy.ts` | First-token 25s, turn 40s, stream budget constants (:5-14); nestedDeadlineMs (:90). |
| endpoint | chat route | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Streaming dispatch passes request.signal and deadlines (:1254-1313). |
| service | stream transform | `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts` | Builds the response stream; cancel handler and billed outcome (:131, :939). |
| service | adapter errors | `apps/web/app/api/llm/v1/chat/completions/lib/adapter-errors.ts` | Maps error chunks to classified errors (:36-97). |
| service | SSE heartbeat | `apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts` | Keeps the stream open. |
| schema | StreamChunk | `packages/contracts/types/src/provider-adapter.ts` | Chunk union (:445) and error classification (:353). |
| component | web SendButton | `apps/web/features/chat/components/Composer/SendButton.tsx` | Stop control (:50). |
| component | mobile SendButton | `apps/mobile/src/features/chat/components/SendButton.tsx` | Stop generating label (:53). |
| test | deadline tests | `apps/web/app/api/llm/v1/chat/completions/lib/provider-deadlines.test.ts` | First-token and stream deadlines. |
| test | watchdog test | `packages/ai/provider-runtime/src/__tests__/watchdog.test.ts` | Idle watchdog. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server builds the adapter and starts the provider stream with a first-token and stream deadline. | our servers | route.ts:1270-1285 |
| Adapter opens the vendor stream with the abort signal; vendor sends events. | outside service | packages/ai/providers/anthropic/src/index.ts:113-130 |
| Watchdog turns 90 seconds of silence into an error; server peeks the first chunk. | our servers | watchdog.ts:24-70; adapter-factory.ts:161 |
| Chunks are re-encoded into the SSE response for the app; heartbeat keeps it alive. | our servers | stream-transform.ts:957-973 |
| When the person stops, the app closes the request; the abort reaches the provider and billing settles. | device and our servers | provider-deadlines.ts:86-101; stream-transform.ts:939-953 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Partial assistant message after a stop | Conversation message rows via persistAssistantTurnSnapshot (table not opened) | Part of the saved conversation | Follows conversation retention (another feature) |

**Models and providers.** All providers go through the same watchdog and deadline code; deadlines do not depend on the model (apps/web/lib/deadline-policy.ts:5-14).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in cloud account. |
| Permissions | none found in the code for stopping a turn beyond owning the request. |
| Subscription | none found in the code for deadlines; they are the same for every plan. |
| Limits and metering | Cancelled turn with tokens is billed as completed; with none, refunded (stream-transform.ts:131-139). |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Local-mode streaming is not handled by this server code. ollama and lmstudio adapters also use the watchdog (packages/ai/providers/ollama/src/index.ts:153; packages/ai/providers/lmstudio/src/index.ts:100) but their callers were not found; unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | First-token timer runs until the first chunk arrives. | provider-deadlines.ts:269-285 |
| Timeout before first token | ProviderFirstTokenDeadlineError; classified as upstream timeout; may rotate if budget remains. | provider-deadlines.ts:29-43; route.ts:1296-1310 |
| Timeout mid-stream | Stream deadline or idle error after text is out: turn settles as failed with partial text kept. | stream-transform.ts:715-750 |
| Cancel | Abort propagates; partial answer saved; tokens billed. | stream-transform.ts:939-953 |
| Error as first chunk | Thrown before streaming; failover or error response. | adapter-factory.ts:170-182 |
| Retry waiting | Backoff sleep aborts when the signal aborts and no new attempt starts. | provider-deadlines.ts:277-284 |
| Offline / reconnect | not handled in this feature; durable-stream resume is another system (SYS-sync-and-continuity). | none found here |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/provider-deadlines.test.ts`: first-token deadline bounds a hanging route; abort reaches upstream; budget shrink; stream deadline (read describes at :78-291)
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/provider-deadlines.retry.test.ts`: same-route retry at stream start (read)
- `apps/web/app/api/llm/v1/chat/completions/__tests__/route.first-token-deadline.test.ts`: route-level first-token deadline [inferred from file name]
- `packages/ai/provider-runtime/src/__tests__/watchdog.test.ts`: idle watchdog [inferred from file name]
- `apps/web/app/api/llm/v1/chat/completions/__tests__/stream-transform.upstream-error.test.ts`: upstream errors in stream transform [inferred from file name]
- `apps/web/app/api/llm/v1/chat/completions/lib/stream-billing-outcome.test.ts`: cancelled billing outcome [inferred from file name]
- `packages/ai/providers/anthropic/src/__tests__/stream-interruption.test.ts`: interrupted streams [inferred from file name]

**Test scenarios**

- **Stop mid-answer**
  1. Send a long request.
  2. Press Stop after some text.
  3. Check the saved message and usage.
  - Expected: Partial text kept; provider call ended; usage billed for tokens produced.
- **Silent provider**
  1. Use a test double that never sends the first chunk.
  - Expected: First-token error within 25 seconds.
- **Idle stream**
  1. Test double sends text, then stays quiet for over 90 seconds (fake timers).
  - Expected: StreamIdleTimeoutError; stream ends.
- **Close tab**
  1. Start a stream and close the client connection.
  - Expected: Provider signal aborts; no leaked timers.
- **Error first chunk**
  1. Provider double returns an error as its first chunk.
  - Expected: Mapped error with status; failover considered; no partial stream.

**Where to look when it fails**

- Log 'First-token budget for this turn is spent; refusing to try another route' (route.ts:1288-1296).
- Log event llm_stream_threw_mid_stream and llm_stream_ended_incomplete (stream-transform.ts:716-750).
- Error names StreamIdleTimeoutError, ProviderFirstTokenDeadlineError, ProviderStreamDeadlineError.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The half-time warning promised by the first draft is never raised.** Affects: Operators; all apps.. Evidence: packages/ai/provider-runtime/src/watchdog.ts:13-20; no caller passes hooks. Work needed: Pass hooks from adapters or remove the option.
- **No evidence the workers-ai adapter has an idle watchdog.** Affects: Routes on that provider if used.. Evidence: grep found no withStreamIdleWatchdog in packages/ai/providers/workers-ai/src. Work needed: Check the adapter and add the watchdog.
- **Brief's cancellation citation (route.ts:521) is wrong.** Affects: Readers.. Evidence: route.ts:521-560 is secret handling. Work needed: Update brief to stream-transform.ts:939 and provider-deadlines.ts:86.

**Depends on**

- F091-03
- F091-05
- SYS-chat-turn-pipeline
- SYS-observability-and-operations
- SYS-inference-providers
- mode:cloud
- surface:web
- surface:mobile
- provider:anthropic
- provider:ollama

## Unknown

- Whether workers-ai has an idle watchdog.
- Stop labels on Desktop, CLI, VS Code, Chrome.
- How Local mode streams and cancels.
- Which table stores the partial turn.
- Whether any operator dashboard shows idle timeouts.
