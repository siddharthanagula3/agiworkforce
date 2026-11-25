---
id: "DOC-70-qa-defects-root-causes-slow-first-words"
type: "root-cause"
title: "SLOW-FIRST-WORDS: first words arrive late"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# SLOW-FIRST-WORDS: first words arrive late

Paths are relative to ~/.cache/agi-audit/worktrees/gap-read-main (origin/main 22649ece43) unless stated. "log N" is line N of ~/.cache/agi-audit/web-lane/logs/server.log.

## 1. What the person sees today / what they should see

Today (testers W-2, W-4, W-8):
- One-line question on Premium (Auto): only "Generating response..." for 4 to 8 s, then "Thought for 8s" and the answer together.
- PDF plus image on Premium: 13 to 25 s before any word.
- First artifact request on Free: about 23 s of "Generating response...", then the answer.

Should see: a correct reply, a first visible sign of work within a few seconds, the reasoning summary streaming as it is produced (like Claude and ChatGPT), nothing that looks frozen, and the same after a reload. A plan limit would be an Upgrade message, never an error. None of the three symptoms involves a plan limit.

## 2. Causes

### 2a. Reasoning summary held back until the first answer word. PRODUCT DEFECT (confirmed in code)
- The web client sends effort medium by default (apps/web/shared/stores/thinking-store.ts:7). The OpenAI request that served Auto/Luna carried `"reasoningEffort":"medium"` and 74 to 95 `reasoning_summary_text.delta` events (log 1721, log 392). The provider layer turns each into a `thinking-delta` chunk (packages/ai/providers/openai/src/stream-responses.ts:527-531); the wire layer wraps it in `<thinking>` text (packages/ai/provider-protocol/src/openai-wire-compat.ts:709-717).
- tool-loop holds the first step's leading lines whenever failover exists (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4248-4251). The release test at 4310-4318 lets lines go only for non-empty public answer text, tool calls, server tools or search activity. A reasoning-only line (`entry.reasoningDelta`, set at 2017-2023) is not in that list, so it stays held. `releaseLine` already counts a reasoning delta as visible output (4256-4265), so leaving it out of the release test looks like an oversight. Both skeptics confirmed this.
- Result: the person sees the spinner until answer text starts, then the reasoning block and the answer flush together.
- Not proven: the tester's own Premium turn has no log line (W-2 notes say so), so the link to medium effort on that turn is taken from other Luna turns. Unknown: how many seconds after the first provider line the first summary delta arrives; the log has no per-event time. The person-style check measures it.
- The Free lane is not affected: applyFreeModelPromotion forces thinking off and the cheapest effort (request-processor.ts:3288-3311); that is why the Free 17x19 answer arrived whole (log 896).
- The "Thought for Ns" timer starts at stream open (apps/web/lib/hooks/useChatStream.ts:2435-2441), so it includes server prep. That is a label effect that follows from the hold; no separate change.

### 2b. Server prep before the provider is called. TEST-MACHINE LIMIT in the main, product cost in part
- chat.turn phase.turn_slot_ms median 894 ms, p90 4493 ms over 85 turns (earlier diagnosis; one 7367 ms turn is log 21173). Premium adds usage_reservation 392 ms and durable_start 444 ms (log 21173). Six testers shared one laptop process; /api/usage took 1.3 s in the same seconds. No code change.

### 2c. Free first artifact request, 22.7 s of silence. PROVIDER OR TEST-NETWORK LIMIT (not reproduced)
- gen_ai.stream.start span 22761 ms (log 19440) for a step that returned only a 22-token skill tool call with thoughtTokens 0 (log 19447). So it was not reasoning. The span ended at 1795550933972 and the title call and the step finished at 934197 to 934271 (logs 19441-19447), within 0.3 s of each other, which fits one stall. The title call in log 19441 carries a different user id than the neighbouring lines, so the pairing is weaker than the first diagnosis said. It is consistent with, not proof of, a provider or network stall.
- Shared with production: the first-token deadline is 25 s (apps/web/lib/deadline-policy.ts:14), so a 22.7 s stall is never rotated to another provider. Shortening it would also cut legitimate slow first lines ((model name) s, log 21321; (model name) s, log 13577). See Owner.
- The implicit skill offer (request-processor.ts:5437-5455) adds one round trip of about 0.8 s (log 19455). Small; no change.

### 2d. Premium PDF plus image, 13 to 25 s. MIXED: product defect (unmeasured per-turn work, full-effort reasoning) plus TEST-MACHINE LIMIT
This corrects the earlier diagnosis, which blamed storage re-reads for the 4154 ms phase.
- Two storage reads ran in parallel, 675 and 878 ms, the second ending at 1795551065946 (logs 21160-21163). The phase `attachments_and_memory_policy_ms` is 4154 ms (log 21173) and began near 065065 (asset lookups, logs 21157-21158), so it ended near 069219. About 3.2 s sits after the reads with no span.
- The code after the reads extracts PDF text and page images one file at a time on every turn (apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:681-683; extractPdfAttachmentContent at apps/web/lib/server/pdf-attachment-content.ts:220). The same phase also waits for the memory-policy read (request-processor.ts:4172-4190). Which of the two holds the 3.2 s is UNKNOWN; neither has a span.
- Auto then chose (model name) (log 21165, taskType multimodal). Its stream opened after 8414 ms with 227 reasoning tokens for a 17-token answer (logs 21319-21321). Client medium effort applies there too, and the hold in 2a hides any reasoning summary during that time.
- W-4 turn 1 also includes the client "Uploading" step, which the log does not time. Tester stopwatch figures are upper bounds (Free W-2: stopwatch 7 s, log 1334 ms).

## 3. Change

### 3.1 apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts (2a, and the reasoning part of 2d)
Why here: it is the only owner of the hold. Every provider's thinking arrives as `<thinking>` text on this path, so the fix is vendor-neutral and no model id appears. No refactor needed.

1. Release held lines when reasoning text arrives (the test at 4310-4318):
```ts
if (
  entry.publicTextDelta?.trim() ||
  entry.reasoningDelta?.trim() ||
  entry.toolCallDelta || ...
) releaseHeldLines();
```
2. Keep recovery alive. Releasing reasoning must not turn a recoverable failure into a visible one. Three recoveries test `!visibleProviderOutputReachedClient` (4432, 4456, 4468) and the catch block rethrows when `releasedLinesToClient` (4525). The one at 4456 (retry a pre-answer output-limit stop with a bigger budget) exists for reasoning-heavy turns, exactly the turns this releases early. Add a flag set only by answer-bearing lines and use it in those four places:
```ts
let answerReachedClient = false;
const releaseLine = (entry) => {
  if (entry.publicTextDelta?.trim() || entry.toolCallDelta || entry.serverToolStart ||
      (entry.serverToolResults?.length ?? 0) > 0 || entry.searchActivity) answerReachedClient = true;
  onLine?.(entry);
};
```
   Replace `!visibleProviderOutputReachedClient` with `!answerReachedClient` in the three retry conditions and `if (releasedLinesToClient) throw err` with `if (answerReachedClient) throw err`. Delete `visibleProviderOutputReachedClient` and `releasedLinesToClient` if nothing else reads them (AGENTS.md section 9).
3. A rotation after shown reasoning would append the second attempt's reasoning to the same open thinking segment in the client (useChatStream.ts:2455-2462). Cosmetic and rare. Only if the person-style check shows it ugly, add one reset event at rotation; do not add it speculatively.

Fail closed: answer text is still held until it is safe, and the 64 KiB cap (tool-loop.ts:536) is unchanged.

### 3.2 chat-attachment-hydration.ts and request-processor.ts (2d, measurement first)
We do not know where the 3.2 s goes, so the smallest honest change is to make it visible, then fix what shows:
```ts
content = await withSpan('chat_attachment.pdf_extract',
  { domain: 'retrieval', attributes: { 'chat_attachment.asset_id': asset.id } },
  () => extractPdfAttachmentContent(object.data, filename));
```
`withSpan` is already imported there (line 27). Add the same around the memory-policy leg (request-processor.ts:4126-4160). If extraction is the cost, extract the files of one message concurrently with `mapWithConcurrency` (already used for the reads, same file). Do not add an extraction cache or stored extracted text here: it needs a migration and a stored-data decision, and turn 1, the tested case, would not gain.

### 3.3 Not changed
- thinking-store.ts default effort (Owner item 1).
- The "Generating response..." placeholder (apps/web/features/chat/components/messages/MessageBubble.tsx:2872): it is web-only and correct as a pending indicator; with 3.1 the reasoning stream replaces it.
- deadline-policy.ts:14 (Owner item 2).

## 4. Regression check
Add three cases to the tool-loop failover tests (route.managed-failover.test.ts and the tool-loop unit tests beside it) with a fake provider stream. They touch failover, which carries cost and reliability.
1. First attempt emits only `<thinking>` text then answer text: the reasoning lines reach `onLine` before the first answer line.
2. First attempt emits reasoning, then a provider error, failover configured: the request rotates and the answer arrives.
3. Reasoning then an empty output-limit stop: the larger-budget retry still runs.
3.2 is spans only: none.

## 5. Person-style check
Rebuild the local compiled app (not next dev), seeded accounts, as in the test run.
1. Sign in as the Premium account. New chat, model Auto, effort at default. Type `What is 17 x 19? Explain briefly.` and press Enter. Must see: a reasoning label with summary text streaming within a few seconds (record seconds from Enter to first text; before: 4 to 8), then the answer 323. Reload: thinking block and answer still there.
2. Same account: attach a 2 to 5 page PDF and a PNG with the paperclip, type `Summarize the PDF and describe the image.`, Enter. Must see an upload state, then streaming text. Record seconds to first text; read `chat_attachment.pdf_extract` and the memory-policy span in the server log to see which one holds the 3 s.
3. Free account: New chat, type `Make me a one-page artifact with a pricing table.` Must see the answer and the artifact. A wait over 20 s with thoughtTokens 0 in the log is the provider or network, not this change.
4. Failure case: on a throwaway run set the first-routed provider's key to an invalid value in apps/web/.env.local, send the 17 x 19 question. Must see an answer from another provider, no error banner, at most one reasoning block. A visible error means 3.1 step 2 is wrong.
5. Denied case: on Free, open the effort or model picker for a Premium-only option. Must show Upgrade, never an error (unchanged; confirm no regression).

## 6. Compatibility and rollback
- Server route code only. No client, desktop, Chrome or VS Code code changes, no schema, no migration, no stored data; packages/ui is untouched. Any surface reading the same stream simply gets reasoning earlier.
- Rollback: revert the commit.

## 7. Owner
1. Default reasoning effort for Auto (decision, cost and quality). Facts: the web store sends medium for every new chat (thinking-store.ts:7); the server passes it through (request-processor.ts:5827-5833, translate-responses.ts:219-250); a one-line sum used 74 to 95 summary deltas (logs 392, 1721). Recommendation: after the 3.1 timings are in, let Auto send no effort unless the person picks one, so the catalog default applies. It changes cost and answer depth on every app sharing the store, so not done here.
2. First-token deadline 25 s (deadline-policy.ts:14): recommend leaving it until production `llm_ttft_slo_breach` events (log 19445 shows the event) show how often first lines exceed 10 s.
Nothing needs a credential or production setting.

## 8. Overlap
- web-lane edits apps/web/lib/deadline-policy.ts (+17 lines, schedule constants) and request-processor.ts (+1 line). This design adds nothing to deadline-policy.ts and touches request-processor.ts only for a span near 4126-4160; re-check `git diff` on that file before applying.
- tool-loop.ts, chat-attachment-hydration.ts and the failover tests: no edit in web-lane (git diff --stat) and none in ~/Desktop/agiworkforce (git diff HEAD --stat empty; no unpushed commit on those files).
- The desktop checkout also has no change on thinking-store.ts, useChatStream.ts or MessageBubble.tsx at the time of checking.
