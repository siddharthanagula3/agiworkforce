---
id: "F091-06"
type: "feature"
title: "Context fitting and token counting"
aliases: ["Token estimation", "Context-budget resolver", "Context compaction", "Context window trim", "Dense script floor", "message_too_long", "S91.17, S91.18"]
area: "91 Model and inference components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S91.17", "S91.18"]
depends_on: ["F091-01", "F091-03", "F091-05", "SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "table:web_conversations", "mode:cloud", "surface:web", "surface:mobile"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F091-06 Context fitting and token counting

Before sending, the server estimates tokens and fits the conversation into the model's window. It drops old turns, summarises them when allowed, and shortens only what may be shortened. Policy messages and the latest user message are never cut; a latest message that cannot fit is refused. Dense scripts count as about one token per character.

Area: [91. Model and inference components](README.md). Requirement items: [S91.17](../../10-requirements/capabilities/091-model-and-inference-components.md#s9117), [S91.18](../../10-requirements/capabilities/091-model-and-inference-components.md#s9118).

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

**What it does.** Estimates tokens per message (planContextTrim, estimateTokens), plans which old messages to drop, replaces them with a summary or a marker, shrinks unprotected text, and refuses a turn whose latest user message cannot fit (apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts:135; apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:411; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6703-6752).

**Why it exists.** Long chats must keep working and a request must not overflow a model window and fail at the provider.

**Who uses it.** Every cloud chat user in long conversations; operators.

**Problems it solves**

- Overflow errors from the provider.
- Losing the user's current question.
- Cutting policy rules off the end of a system prompt.
- Under-counting CJK text.

**Use cases**

- A long chat on a small-window model: oldest turns are summarised.
- A temporary chat: oldest turns are dropped with a marker (no summary stored).
- A pasted document too big for the model: the person gets 'This message is too long for the selected model'.
- Failover to a model with a smaller window is skipped if the fitted conversation does not fit.

## 2. User experience

**Where to find it**

- Automatic on every app that uses the cloud chat endpoint.
- Web composer model switch check uses the same estimator before switching models (apps/web/features/chat/components/Composer/model-compatibility.ts:47 comment: composer pre-switch check and server trim read the same budget).
- Error display: message_too_long maps to a message-length notice in web turn-error-notice (apps/web/features/chat/lib/turn-error-notice.ts:98).

**Before you start**

- Cloud mode, model with a known context window.

**Screens and controls**

- No control. The composer shows model compatibility findings including context overflow (model-compatibility.ts: ModelCompatibilityCode).

**Journey**

1. Person sends in a long chat.
2. Server estimates tokens and plans a trim.
3. Old turns are summarised or dropped; the latest message stays whole.
4. Model answers; the person may see nothing change.
5. If the newest message alone is too big, the person gets a 400 'too long' error and no usage is charged.

**What the person sees and gets**

- Text: 'This message is too long for the selected model. Shorten it or send it in parts, or choose a model with a larger context window.' code message_too_long (request-processor.ts:3311-3330).
- In-model markers: '[Earlier messages in this conversation were omitted to fit the model context window.]' or a fenced summary (context-window.ts:16; context-compaction.ts:70-80).

**Settings**

- AGI_CONTEXT_COMPACTION_ENABLED: summarising is on unless set to 0, false or off (context-compaction.ts:38, :60-62). No person-facing setting found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Estimator: characters times a per-provider ratio and a tokenizer drift factor from the catalog; default 1 token per 3.5 characters (packages/ai/routing/src/classify.ts:106-125).
- Message estimate adds 800 tokens per multimodal part and 4 per message (apps/web/features/chat/components/Composer/model-compatibility.ts:12-13, :22-32).
- Budget: window minus reply allowance minus 2,048 reserve, at least 1,024 (model-compatibility.ts:10-11, :47-53).
- Plan: drop oldest whole groups, tool results stay with their assistant turn, last user turn protected (apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts:135-196).
- Protected: the latest user message and policy or format system messages are never shrunk; the dynamic reference block behind the cache boundary may be cut (context-window.ts:45-60).
- Dense script floor (CJK, kana, Hangul ranges) counted at about one token per character, applied to the latest user message (context-window.ts:71-100, :102-120).
- Compaction: model-written summary of dropped turns, stored per conversation and reused when the coverage digest still matches; falls back to the mechanical trim on any failure; not used for temporary chats or when disabled (context-compaction.ts:411-476; apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:369-372).
- Latest user message that cannot fit: turn is refused 400 message_too_long and the reservation is released at zero cost (request-processor.ts:6728-6752).
- Failover candidates are skipped when the fitted conversation exceeds their window (managed-failover.ts:567; context-window.ts:374-381).

**Incomplete**

- Protected overflow (policy messages too large): logged as a warning and the payload is sent whole, not refused (context-window.ts:237-245; context-window.test.ts: 'sends the policy whole and reports the overflow'). The first draft said overflow is always reported to the person; only the latest-user-message case is.
- Dense-script floor applies to the latest user message only; older messages use the normal estimate (context-window.ts:102-120).
- The estimator is a character ratio, not a tokenizer; accuracy per model: unknown.
- Estimator lives under apps/web/features/chat/components/Composer/model-compatibility.ts yet is imported by the server; a boundary concern [inferred].

**Present but disconnected or switched off**

- Summarising can be switched off by AGI_CONTEXT_COMPACTION_ENABLED.

**Not available**

- Local-mode context fitting on device: unknown; Mobile on-device models declare their own contextWindow (packages/contracts/types/src/on-device-models.ts:22).

## 4. Required behaviour

**Established requirements**

- Tokens are estimated per model before a request is sent. (source: S91.17 Should)
- A context-budget resolver decides what fits in the model window and what is trimmed or compacted. (source: S91.18 Should)
- Policy and format system messages are never cut; the latest user message is never cut. (source: feature use text; code at context-window.ts:45-60)
- If the content still does not fit, the overflow is reported instead of silently sent. (source: feature use text; implemented for the latest user message only)
- Never weaken validation or guards to make a change pass. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. A long chat is trimmed oldest-first, the latest user message is intact, and the provider call does not overflow.
2. A latest user message larger than the window gets 400 message_too_long and no charge.
3. A temporary chat is trimmed with the marker and no summary is stored.
4. A 10,000 character CJK message is counted near 10,000 tokens, not 2,900.
5. With compaction switched off, trimming still works.
6. A failover target with a smaller window is skipped when the fitted payload does not fit.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Oversized policy text should be refused or reported to operators, as the brief's wording says overflow is reported.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the person a one-line notice when history was summarised.
- [proposed] Move the estimator to a shared package so the server does not import a composer file.
- [proposed] Apply the dense script floor to every message, not only the latest.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | context window planner | `apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts` | planContextTrim (:135), applyDroppedSpanReplacement (:199), trimMessagesToContextWindow (:330), fitsModelContextWindow (:374). |
| service | context compaction | `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts` | compactContextWindow (:411), summary cache and fallback. |
| service | token estimator | `packages/ai/routing/src/classify.ts` | estimateTokens (:113) with provider ratios (:106). |
| service | drift factor | `packages/ai/routing/src/pricing.ts` | tokenizerDriftFactor (:46). |
| service | budget helpers | `apps/web/features/chat/components/Composer/model-compatibility.ts` | estimateMessageTokens (:22), contextBudgetTokens (:47). |
| service | request processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Calls compaction (:6703) and refuses overflow (:6728, :3311). |
| table | web_conversations | `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts` | Columns compaction_summary, compaction_summary_through_message_id, compaction_summary_digest read and written (:301, :369-372). |
| service | summarized history tags | `apps/web/app/api/llm/v1/chat/completions/lib/summarized-history.ts` | Marks summaries, including from untrusted tool content. |
| service | managed failover fit check | `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts` | Skips candidates whose window is too small (:567). |
| service | routing prompt fit | `packages/ai/routing/src/auto.ts` | fitsPrompt for Auto candidates (:1677). |
| config | context window in catalog | `packages/contracts/types/src/model-catalog.ts` | contextWindow field read through getModelMetadataById (:1454). |
| component | web error notice | `apps/web/features/chat/lib/turn-error-notice.ts` | Maps message_too_long to a length notice (:98). |
| config | compaction switch | `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts` | AGI_CONTEXT_COMPACTION_ENABLED (:38). |
| test | context window tests | `apps/web/app/api/llm/v1/chat/completions/lib/context-window.test.ts` | Plan, replacement, protected overflow, fit check. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server builds the messages and estimates tokens with the model's provider ratio. | our servers | context-window.ts:102-120; packages/ai/routing/src/classify.ts:113 |
| planContextTrim chooses oldest groups to drop until the budget is met. | our servers | context-window.ts:135-196 |
| If summarising is on and the chat is saved, a cached or fresh summary of the dropped span replaces it; a summarising call uses an economy route and a background usage lease. | our servers | context-compaction.ts:411-476, :1-30 imports; request-processor.ts:6703-6725 |
| Remaining overflow is cut from unprotected text; a latest user message that cannot fit ends the turn with 400. | our servers | context-window.ts:199-300; request-processor.ts:6728-6752 |
| The fitted payload goes on to the provider. | our servers | request-processor.ts:6755-6780 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation summary, boundary message id and coverage digest | web_conversations columns compaction_summary, compaction_summary_through_message_id, compaction_summary_digest | Part of the conversation row | Updated in place; follows conversation deletion [inferred]; not written for temporary chats (context-compaction.ts:433-441) |

**Models and providers.** The summarising call goes through an economy route chosen by the managed routing admission (request-processor.ts:6713-6717); the main model and its window decide the budget.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud account. |
| Permissions | Summaries of untrusted tool content are fenced so they cannot act as instructions (context-compaction.ts:70-84). |
| Subscription | Plan tier is passed to compaction for the summarising route (context-compaction.ts: planTier input; request-processor.ts:6708). |
| Limits and metering | The summary call reserves background usage (context-compaction.ts imports reserveBackgroundUsage); an overflow refusal releases the main reservation at zero cost (request-processor.ts:6735-6745). |
| Feature flags | AGI_CONTEXT_COMPACTION_ENABLED, on unless 0, false or off. |
| Model compatibility | A model with no recorded window gets no plan (planContextTrim returns null) so nothing is trimmed (context-window.ts:141-143). |
| Provider restrictions | none found in the code. |
| Local mode | This code runs on our servers for cloud turns. On-device context handling: unknown, not read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Fits | No trim; nothing changes. | context-window.ts:150-154 |
| Temporary chat or no conversation id | Mechanical trim only. | context-compaction.ts:433-441 |
| Summary fails | Falls back to mechanical trim and logs. | context-compaction.ts:469-475 |
| Latest user message too long | 400 message_too_long, reservation released. | request-processor.ts:6728-6752 |
| Policy messages too large | Sent whole with a warning. | context-window.ts:237-245 |
| Unknown model window | No trim planned. | context-window.ts:141-143 |
| Message edited or branch changed after a summary | Cached summary rejected by the coverage digest and rebuilt. | context-compaction.ts:120-150 comment and digest |
| Accessibility / offline | not handled in the code for this feature. | none found in context-window.ts or context-compaction.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/context-window.test.ts`: plan drops oldest, keeps last user turn, replacement, protected instructions overflow, fitsModelContextWindow (read describes)
- `apps/web/app/api/llm/v1/chat/completions/lib/context-window.registry.test.ts`: window from registry [inferred from file name]
- `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.test.ts`: compaction [inferred from file name]
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.long-chat.test.ts`: long chat in request processor [inferred from file name]
- `packages/ai/model-registry/tests/context-window-unpublished.test.mjs`: unpublished context windows [inferred from file name]
- `packages/ai/routing/src/__tests__/classify.test.ts`: estimateTokens among classifier tests [inferred]
- `apps/web/features/chat/components/Composer/ComposerFooter.modelSwitch.test.tsx`: composer model switch checks [inferred from file name]

**Test scenarios**

- **Long chat**
  1. Build a chat larger than the model window.
  2. Send a short new message.
  - Expected: Reply arrives; request body lacks the oldest turns; marker or summary present; latest message whole.
- **Oversized message**
  1. Paste text larger than the window and send.
  - Expected: 400 message_too_long, no usage charged, notice in the app.
- **CJK message**
  1. Send a long CJK text near the window limit.
  - Expected: Counted at about one token per character; refused or trimmed rather than overflowing at the provider.
- **Summary failure**
  1. Make the summarising call fail in a test.
  - Expected: Mechanical trim; turn continues.
- **Temporary chat**
  1. Use a temporary chat that overflows.
  - Expected: Marker only; no compaction columns written.

**Where to look when it fails**

- Logs '[context-window] trimmed conversation history ...' and warnings about protected overflow (context-window.ts:150-170, :330-355).
- Log 'Turn refused before the provider: the latest user message does not fit the selected model' (request-processor.ts:6729-6738).
- Log '[context-compaction] summarization failed; falling back to the mechanical trim' (context-compaction.ts:470).
- Columns on web_conversations.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Oversized protected instructions are sent whole with a warning, not reported to the person or refused.** Affects: Cloud chats on all apps.. Evidence: context-window.ts:237-245. Work needed: Decide refuse or alert operators; add a test for the user-visible result.
- **Dense-script floor is only applied to the latest user message.** Affects: CJK users with long history.. Evidence: context-window.ts:102-120. Work needed: Apply to all messages or document why not.
- **Token counts are an estimate from a character ratio.** Affects: Accuracy near the window limit, all apps.. Evidence: packages/ai/routing/src/classify.ts:113-125. Work needed: Measure estimator error per provider against real usage numbers.
- **Estimator and budget helper live in a web composer file but are used by the server.** Affects: Maintainers.. Evidence: apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts:7-11. Work needed: Move to a shared package.

**Depends on**

- F091-01
- F091-03
- F091-05
- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- table:web_conversations
- mode:cloud
- surface:web
- surface:mobile

## Unknown

- Whether the CLI, VS Code and Chrome extensions fit context themselves before sending.
- Accuracy of the estimator per provider.
- Local-mode (on-device) context fitting.
- Whether the conversation summary is deleted with the conversation.
- Exact message shown on Mobile for message_too_long (web mapping read only).
