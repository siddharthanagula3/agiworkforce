---
id: "COMP-streaming-and-response-states"
type: "competitor-trace"
title: "Streaming and response states"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Streaming and response states: competitors to requirements

Streaming states are largely built across the six apps. The project ledger rates 25 of its 29 items done on most apps, and web testers saw streaming and Stop work. Failures a person saw: slow first words (4 to 22 s), the stream lost after a reload mid-answer, a false failure notice after Stop, and silent failure at a credit limit. Gaps: reasoning display in CLI and VS Code, reconnect in CLI and VS Code, and Local-mode checks. Leader evidence for Claude chat controls is thin.

**How the products divide this topic.** Claude (chat on web, desktop and phone) documents thinking display, effort, usage-limit and length-limit errors, blocked output and voice interrupts. Its stop, resume and steer controls in the catalogue come from Claude Code (separate coding tool: Esc, Ctrl+C, /btw, --continue) and Cowork. ChatGPT documents stop generating, Regenerate, error messages, thinking levels and early streaming. Steer and queue, interrupt hooks and stream timeouts belong to Codex (separate coding tool). Thinking levels and early streaming depend on plan and model. Review date 2026-11-22. Local-mode behaviour has no leader equivalent.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-streaming-and-response-states-01](#cap-streaming-and-response-states-01) | Request accepted and first-words wait state | unknown | yes | built | seen working by a person |
| [CAP-streaming-and-response-states-02](#cap-streaming-and-response-states-02) | First-words speed | unknown | unknown | partly built | seen failing by a person |
| [CAP-streaming-and-response-states-03](#cap-streaming-and-response-states-03) | Streaming text display | unknown | yes | partly built | seen working by a person |
| [CAP-streaming-and-response-states-04](#cap-streaming-and-response-states-04) | Smooth text fade-in while streaming | unknown | unknown | not built | not verified |
| [CAP-streaming-and-response-states-05](#cap-streaming-and-response-states-05) | Early streaming while the model is still thinking | unknown | yes | unknown | not verified |
| [CAP-streaming-and-response-states-06](#cap-streaming-and-response-states-06) | Thinking display (expandable reasoning with time) | yes | partly | partly built | seen working by a person |
| [CAP-streaming-and-response-states-07](#cap-streaming-and-response-states-07) | Thinking switch and effort level | yes | yes | partly built | code inspected only |
| [CAP-streaming-and-response-states-08](#cap-streaming-and-response-states-08) | Notice when thinking is cut for safety | yes | unknown | not built | not verified |
| [CAP-streaming-and-response-states-09](#cap-streaming-and-response-states-09) | Stop a running answer | partly | yes | built | seen working by a person |
| [CAP-streaming-and-response-states-10](#cap-streaming-and-response-states-10) | Stop shortcut key | yes | yes | partly built | not verified |
| [CAP-streaming-and-response-states-11](#cap-streaming-and-response-states-11) | Stopped answer keeps what arrived | partly | unknown | built | seen working by a person |
| [CAP-streaming-and-response-states-12](#cap-streaming-and-response-states-12) | Continue a cut-off answer | unknown | unknown | built | seen working by a person |
| [CAP-streaming-and-response-states-13](#cap-streaming-and-response-states-13) | Retry or regenerate a reply | unknown | yes | built | seen failing by a person |
| [CAP-streaming-and-response-states-14](#cap-streaming-and-response-states-14) | Steer or queue a message while a run is active | partly | yes | partly built | not verified |
| [CAP-streaming-and-response-states-15](#cap-streaming-and-response-states-15) | Interrupt by voice | yes | yes | partly built | not verified |
| [CAP-streaming-and-response-states-16](#cap-streaming-and-response-states-16) | Tool and search progress during an answer | yes | yes | partly built | seen working by a person |
| [CAP-streaming-and-response-states-17](#cap-streaming-and-response-states-17) | Waiting for approval or input | unknown | yes | partly built | code inspected only |
| [CAP-streaming-and-response-states-18](#cap-streaming-and-response-states-18) | Plain error during an answer | yes | yes | built | seen failing by a person |
| [CAP-streaming-and-response-states-19](#cap-streaming-and-response-states-19) | Usage limit reached during an answer | yes | partly | partly built | seen failing by a person |
| [CAP-streaming-and-response-states-20](#cap-streaming-and-response-states-20) | Length limit and long-chat summarising | yes | unknown | partly built | not verified |
| [CAP-streaming-and-response-states-21](#cap-streaming-and-response-states-21) | Blocked output notice | yes | unknown | partly built | not verified |
| [CAP-streaming-and-response-states-22](#cap-streaming-and-response-states-22) | Stuck answer recovery and stall detection | unknown | yes | partly built | seen failing by a person |
| [CAP-streaming-and-response-states-23](#cap-streaming-and-response-states-23) | Reconnect and resume an interrupted answer | partly | partly | partly built | seen failing by a person |
| [CAP-streaming-and-response-states-24](#cap-streaming-and-response-states-24) | Draft kept through errors and offline | unknown | yes | built | seen working by a person |
| [CAP-streaming-and-response-states-25](#cap-streaming-and-response-states-25) | Partial completion and cancelled-run states | unknown | yes | built | code inspected only |
| [CAP-streaming-and-response-states-26](#cap-streaming-and-response-states-26) | Streaming and stop on local models | unknown | unknown | unknown | not verified |

## CAP-streaming-and-response-states-01 Request accepted and first-words wait state

Right after send, the screen shows work has started (Thinking, Generating, Working) until the first words arrive.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages): Names the states 'Thinking...', 'Generating...' and 'Working...' and says to wait 30-60 seconds before treating a long one as stuck. Plans: all. Apps: web, desktop.

**AGI requirement** (inferred; source: competitor parity; docs/product/competitive-guidance.md section 5.4 items 27 and 31). Every app shows an accepted/working state within one frame of send, replaced by the answer when the first output arrives. The label must come from the app's own state, not from a model.

**With different models, providers and the one subscription.** Works the same for any model or provider. The state is shown before the subscription check finishes and turns into a plan or limit message if the check fails. In Local mode it is the model-loading and generating state, with no cloud wording.

**Current implementation, as this trace read it on 2026-11-24: built.** Ledger S19.01, S19.03, S19.09 done on all six apps. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.01, S19.03, S19.09
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/messages/TypingIndicator.tsx:9`; `apps/web/features/chat/components/messages/ChatMessageList.tsx:1758`; `apps/mobile/src/features/chat/components/StreamingIndicator.tsx:4`; `apps/cli/src/tui/tui_app.rs:1561`

**Gap.** Web testers saw nothing but 'Generating response...' for 4 to 22 seconds on some first requests (see First-words speed).

**Acceptance criteria**

1. Send a message on each app: a working state shows before any text.
2. When the first word arrives the working state is replaced, not shown beside the answer.
3. Screen readers announce the working state once.

**Verification: seen working by a person.** Web scorecard W-2 and W-3 (free and subscribed) saw the working state and the answer replace it. Other five apps: code inspected only.

## CAP-streaming-and-response-states-02 First-words speed

How long it takes from send to the first visible words.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI has a 2500 ms first-token target in its server log (llm_ttft_slo_breach); no product document states it). First words should appear within the project time target on every app, measured from the user's send. A slow first token must be visible as a measured breach, not hidden.

**With different models, providers and the one subscription.** The target is per route, so a slower model or provider is shown honestly and can trigger a fallback. Subscription checks must not add to the wait. Local mode has its own load-time target that is not set.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web logs the first-token time and flags breaches. No ledger item covers it. Other apps unknown. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/web/lib/hooks/useChatStream.ts:1678`

**Gap.** A tester measured about 22.8 s to first words on one Free request (log shows a breach) and 4 to 8 s on Premium with the wait label only. No client-side timer exists to prove the figure on mobile, CLI or extensions.

**Acceptance criteria**

1. On web, a short prompt on the default model shows words within the target on at least 9 of 10 sends.
2. A breach is logged with the route used.
3. If words take longer than the target the screen says what is happening.

**Verification: seen failing by a person.** Web scorecard W-8 free (22770 ms), W-2 and W-3 subscribed (4 to 11 s by stopwatch); defect W-8 free 'First words took about 22.8 s'.

## CAP-streaming-and-response-states-03 Streaming text display

Answer text appears in steps while the model writes, including lists, tables, code and maths that stay correct mid-stream.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Aug 21, 2026: interactive content renders while still generating; long chats load in smaller sections. Plans: all. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md section 5.4 item 27 and item 34). Text, lists, tables, code and maths render in order while streaming with no duplicated or vanishing content and no raw markup flash.

**With different models, providers and the one subscription.** The renderer reads one normalized event stream, so any provider works. Usage is counted from the same stream. Local models feed the same stream.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Ledger S19.10 and S19.11 done on all six apps (S19.11 not rated for API). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.10, S19.11
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:2075`; `apps/web/lib/hooks/useChatStream.ts:2573`; `apps/mobile/stores/chat/chatExecutionStore.ts:2534`; `apps/cli/src/tui/tui_app.rs:1588`

**Gap.** A tester saw raw maths source flash mid-stream before it rendered (web). Smooth fade-in is missing (see next row).

**Acceptance criteria**

1. Stream a long answer with a table, code block and equation: no raw markup is visible at any frame.
2. Text is never duplicated or lost at the end.
3. Reload mid-answer does not leave a half-rendered block.

**Verification: seen working by a person.** Web scorecard W-2 free: five-method answer streamed in steps; flash of raw maths noted. W-3 free: smooth and fast.

## CAP-streaming-and-response-states-04 Smooth text fade-in while streaming

New streamed words ease in rather than pop in.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: comparison-desktop.csv row D14 lists it; the catalogue lines read for this page do not show it). Not required until the owner decides.

**With different models, providers and the one subscription.** Display only; no effect on models, providers or the subscription. It must be off under reduced motion.

**Current implementation, as this trace read it on 2026-11-24: not built.** Desktop and web comparison D14: missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D14
- Code: `searched: fade, streamingFade in packages/ui/unified-chat (comparison note)` (not found)

**Gap.** Not built; leader behaviour not confirmed in this review.

**Acceptance criteria**

1. If built: with reduced motion on, text appears without animation.

**Verification: not verified.** Comparison row only.

## CAP-streaming-and-response-states-05 Early streaming while the model is still thinking

On some newer models the answer can start before thinking ends, mixing text, visuals and interactive parts.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001354](https://help.openai.com/en/articles/20001354): Answers can start before thinking finishes; not available at the Pro effort level. Plans: Eligible paid plans. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). If a provider streams answer text while reasoning continues, show both in order without hiding either.

**With different models, providers and the one subscription.** Depends on the provider sending both; the UI must work when it does not. Not a promise for every model. Local models may not support it.

**Current implementation, as this trace read it on 2026-11-24: unknown.** No ledger or comparison item. Web shows reasoning in an expandable block above the answer. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/ThinkingBlock.tsx:49`

**Gap.** Not checked whether answer text and thinking can arrive at once.

**Acceptance criteria**

1. With a provider that sends both, answer text appears while the Thinking block is still open and neither is lost.

**Verification: not verified.** None.

## CAP-streaming-and-response-states-06 Thinking display (expandable reasoning with time)

A collapsible section shows the model's reasoning, with a timer or 'Thought for N s' label.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings): Thinking shows in an expandable section before the answer, with a timer; on some models it cannot be turned off. Plans: all. Apps: web, desktop, ios, android.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001354](https://help.openai.com/en/articles/20001354): A Thinking slider sets how much thought a model uses; the page does not describe a reasoning panel. Plans: Plus, Pro, Business, Enterprise. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md (Thinking/reasoning disclosure)). Reasoning shown by a model is available in an expandable block with a duration label on every app; collapsed by default once the answer starts.

**With different models, providers and the one subscription.** Only providers that return reasoning show it; others show no block, never a fake one. Effort is a plan-gated setting. Local models show it only if they emit it.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done (comparison rows 'Reasoning shown while answering', 'Thinking shown with a reply'). CLI missing (C55). VS Code missing (V21). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C55, V21
- Code: `apps/web/features/chat/components/ThinkingBlock.tsx:112`; `apps/mobile/src/features/chat/components/ThinkingChip.tsx`

**Gap.** CLI and VS Code do not show model reasoning.

**Acceptance criteria**

1. Reasoning model on web: block shows live text, then 'Thought for N s'.
2. A model without reasoning shows no block.
3. CLI and VS Code can show a reasoning summary on request.

**Verification: seen working by a person.** Web scorecard W-3 subscribed: long reasoning panel streamed first (delayed first answer words about 11 s).

## CAP-streaming-and-response-states-07 Thinking switch and effort level

A menu beside send sets thinking on or off and an effort level; changes apply from the next reply.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings): Model menu has Effort and a Thinking toggle; change any time, applies from the next response; toggle absent on always-thinking models. Plans: all (Enterprise admins may hide). Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001354](https://help.openai.com/en/articles/20001354): Thinking slider with levels; Plus gets fewer levels than Pro, Business and Enterprise; Free and Go get a Think option. Plans: Free, Go, Plus, Pro, Business, Enterprise. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md section 5.6 item 43). One effort/thinking control per chat that maps to what the selected model really supports and says when a level is not available.

**With different models, providers and the one subscription.** Levels come from the model catalogue per model. Higher levels cost more under the one subscription system and are plan-gated. In Local mode only levels the local model supports show.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile, extension done; VS Code partial (VP13); CLI partial (CP266) and toggle missing (C62). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C62, CP16, CP266, VP13
- Code: `apps/web/features/chat/components/Composer/ComposerFooter.tsx:286`; `apps/web/shared/stores/thinking-store.ts:10`; `apps/cli/src/tui/tui_app.rs:8180`

**Gap.** CLI toggle key and VS Code toggle are partial.

**Acceptance criteria**

1. Change effort mid-chat: next reply uses it, current one does not change.
2. Pick a model that lacks a level: that level is not offered.
3. Free account sees only allowed levels.

**Verification: code inspected only.** No scorecard row checks the effort menu.

## CAP-streaming-and-response-states-08 Notice when thinking is cut for safety

If thinking touches flagged content, the summary is cut and a message says the rest is unavailable.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings): If thinking touches content flagged as elevated risk, the summary is cut off with a message that the rest is unavailable. Plans: all. Apps: web, desktop, ios, android.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity). When a provider hides or truncates reasoning, say so in the thinking block instead of showing a silent gap.

**With different models, providers and the one subscription.** Provider-specific signal mapped to one app notice. Not needed in Local mode unless the local runtime reports it.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web missing (W79). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W79
- Code: `searched: thinking unavailable in packages/ui/unified-chat/src/components/ThinkingBlock.tsx (comparison note)` (not found)

**Gap.** No notice exists.

**Acceptance criteria**

1. Feed a stream with a cut reasoning flag: block shows an 'unavailable' line.
2. Answer text is unaffected.

**Verification: not verified.** Comparison row only.

## CAP-streaming-and-response-states-09 Stop a running answer

A visible control ends generation at once.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://support.claude.com/en/articles/14553413-claude-code-cheatsheet](https://support.claude.com/en/articles/14553413-claude-code-cheatsheet): Esc interrupts Claude mid-response so you can type again. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli, desktop.
  - [https://code.claude.com/docs/en/best-practices.md](https://code.claude.com/docs/en/best-practices.md): Esc stops the current action while keeping the work done so far. Apps: cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Early releases added a stop-generating button. Plans: all. Apps: web.
  - [https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages): For a stuck answer, click 'Stop generating', then 'Regenerate'. Plans: all. Apps: web, desktop.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md section 5.4 item 28). Every chat surface has a stop control that is visible during work, takes effect within a second, shows a stopping state until it does, and also stops the server run and spending.

**With different models, providers and the one subscription.** Must cancel the upstream request for any provider so cost stops; usage accounting records only what streamed. In Local mode it stops the on-device model; no server is involved.

**Current implementation, as this trace read it on 2026-11-24: built.** Ledger S19.17 done on all six apps. One web defect: a stopped answer later raised an 'Agent run failed' bell notice. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.17
- Comparison list ids: none matched
- Code: `apps/web/lib/hooks/useChatStream.ts:4679`; `apps/web/features/chat/components/messages/StreamPhaseNotice.tsx:14`; `apps/web/features/chat/lib/cancel-cloud-run.ts:7`; `apps/mobile/src/features/chat/components/MessageBubble.tsx:1021`; `apps/cli/src/tui/tui_app.rs:5240`

**Gap.** Stop should not create a failure notice. Claude chat stop control is not in the catalogue.

**Acceptance criteria**

1. Press stop mid-answer: text freezes within one second and a stopped state shows.
2. After stopping, the notification list has no failure entry.
3. Server log shows the run cancelled and no further tokens counted.

**Verification: seen working by a person.** Web scorecard W-2, W-3, W-8 (free and subscribed): Stop halted the answer. Defect W-1 free (major): stop later raised 'Agent run failed' notification.

## CAP-streaming-and-response-states-10 Stop shortcut key

A keyboard shortcut stops the answer.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://support.claude.com/en/articles/14554922-claude-code-user-faq](https://support.claude.com/en/articles/14554922-claude-code-user-faq): Press Ctrl+C to cancel the current generation, then tell it what to do instead; no need to restart. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes](https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes): Added a shortcut to stop streaming responses: Command + period. Apps: desktop (macOS).

**AGI requirement** (inferred; source: competitor parity). Each app with a keyboard has a documented stop key that works while the composer or answer has focus.

**With different models, providers and the one subscription.** Same as the stop control; no model or plan dependence.

**Current implementation, as this trace read it on 2026-11-24: partly built.** A composer-stop shortcut exists in the shared registry; desktop row DP19 rated partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: DP19
- Code: `packages/ui/unified-chat/src/lib/shortcutRegistry.ts:199`

**Gap.** Desktop key not complete per comparison.

**Acceptance criteria**

1. On desktop press the stop key while streaming: answer stops.
2. Key is listed in the shortcut help.

**Verification: not verified.** Comparison row only.

## CAP-streaming-and-response-states-11 Stopped answer keeps what arrived

After a stop, the text so far stays, is marked as stopped, and survives a reload.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/best-practices.md](https://code.claude.com/docs/en/best-practices.md): Esc stops the current action while keeping work done so far. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md section 5.4 item 31 ('without inventing success')). A stopped turn is saved as stopped with its partial text, and billed only for what was produced.

**With different models, providers and the one subscription.** Partial text is stored the same for any provider. Usage accounting counts the partial output. Local mode keeps it on the device.

**Current implementation, as this trace read it on 2026-11-24: built.** Ledger S19.18 done on all six apps; S19.28 restore after restart done. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.18, S19.28
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/messages/ChatMessageList.tsx:1957`; `apps/web/lib/hooks/useChatStream.ts:4683`; `apps/mobile/src/features/chat/components/MessageBubble.tsx:1528`

**Gap.** After stop, a follow-up artifact edit showed raw source instead of an artifact card (web).

**Acceptance criteria**

1. Stop, reload: partial text and 'Response stopped.' are still there.
2. Stopped turn offers Try again.
3. Stopped artifact edit still shows the artifact card.

**Verification: seen working by a person.** Web scorecard W-2, W-3, W-8: partial text and notice survived reload. Defect W-8 subscribed (major): raw HTML block after Stop.

## CAP-streaming-and-response-states-12 Continue a cut-off answer

A button resumes an answer that stopped early or hit a length limit.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI has it; the catalogue lines read do not show a leader doing it). Not required; AGI already has it. Keep it.

**With different models, providers and the one subscription.** Continuing is a new request, so it is billed and checked against limits like any send. Must carry the provider's output-limit reason into the message.

**Current implementation, as this trace read it on 2026-11-24: built.** Web has 'Continue generating'; comparison says AGI better. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/messages/ChatMessageList.tsx:1944`; `apps/web/features/chat/pages/WebChatPage.tsx:6433`

**Gap.** Other apps not checked.

**Acceptance criteria**

1. Hit an output limit: 'Continue generating' appears and the new text joins the old.
2. Continue counts toward usage once.

**Verification: seen working by a person.** Web scorecard W-8 subscribed: reload during a retry left a raw block with Continue generating, which did finish.

## CAP-streaming-and-response-states-13 Retry or regenerate a reply

Ask again for a fresh answer, optionally with another model or thinking level, after a stop or failure.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages): After 'There was an error generating a response', click Regenerate; may be a one-time error. Plans: all. Apps: web, desktop.
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Retry menu offers regenerate with Thinking or Pro. Plans: Plus, Pro, Business, Enterprise, Edu. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md section 5.4 item 26). Failed, stopped and finished replies can be retried in place, with the old version kept and a choice of model.

**With different models, providers and the one subscription.** A retry is a new billed request; the model menu lists only models the plan and provider allow. A Local reply retries on the local model unless the user chooses to move it (an explicit fork with consent).

**Current implementation, as this trace read it on 2026-11-24: built.** Web and mobile same as leaders; a retry bug on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP61
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:3878`; `apps/mobile/src/features/chat/components/MessageBubble.tsx:3181`

**Gap.** One tester saw Retry regenerate the first message of the chat after a reload mid-answer. Retry with web search is partial (WP61).

**Acceptance criteria**

1. Retry a failed turn in a three-turn chat: the same turn is redone.
2. Old version stays as 1/2.
3. Retry on a different model shows that model's name.

**Verification: seen failing by a person.** Web scorecard W-3 shows Try again working; defect W-9 subscribed (major): Retry regenerates the first message after a mid-answer reload.

## CAP-streaming-and-response-states-14 Steer or queue a message while a run is active

Send input during a run either to redirect it now or to wait for the next turn.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://support.claude.com/en/articles/14554000-claude-code-power-user-tips](https://support.claude.com/en/articles/14554000-claude-code-power-user-tips): /btw asks a quick question without interrupting the running work. Apps: cli.
  - [https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude): Desktop-started tasks show on mobile where you can see progress, answer questions and redirect. Apps: ios, android.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/prompting.md](https://learn.chatgpt.com/docs/prompting.md): Steer injects the message into the current run; Queue holds it for the next run; queued messages can be edited, reordered, sent or deleted. In the CLI Enter steers and Tab queues. Apps: web, desktop, cli, ide.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Nov 5, 2025: for deep research or Pro runs, send new information from the sidebar without restarting. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md section 5.4 item 28). Distinguish stop, steer now, queue and side question; queued items can be edited or taken back.

**With different models, providers and the one subscription.** Steering costs another model call and counts against limits. Provider must support mid-run input or the app falls back to queue. Local mode queues on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, VS Code, extension done; desktop DP18, CLI CP27/CP21 partial; mobile can take back a queued message. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.02
- Comparison list ids: CP180, CP21, CP27, DP18, DP72
- Code: `apps/web/features/chat/components/Composer/SendButton.tsx:113`; `apps/web/features/settings/sections/GeneralSection.tsx:651`; `apps/cli/src/tui/tui_app.rs:8423`; `apps/mobile/src/features/chat/components/ChatInput.tsx:1141`

**Gap.** Desktop, CLI and mobile research steering partial or missing (M43); queue state missing in CLI (S19.02).

**Acceptance criteria**

1. Send during a run with queue default: message waits and shows as queued.
2. With steer chosen: run changes direction.
3. A queued message can be removed before it sends.

**Verification: not verified.** No person-seen result.

## CAP-streaming-and-response-states-15 Interrupt by voice

Speaking cuts off the assistant's spoken answer.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): If Claude is going the wrong way, start talking and Claude will stop and listen. Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: ios, android, desktop, web.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/features/voice.md](https://learn.chatgpt.com/docs/features/voice.md): Natural turn-taking lets users interrupt, follow up or change direction while work runs. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md section 6 item 122). Voice answers stop the moment the user speaks, and the stopped part is kept in the transcript.

**With different models, providers and the one subscription.** Voice has its own provider route and limits; the interrupt must cancel that route. Local voice is on-device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile same as leaders; web and desktop same. Voice itself could not be tested with a person on web (blocked). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:363`

**Gap.** Spoken path not verified by a person.

**Acceptance criteria**

1. Speak while the assistant talks: audio stops within a second.
2. Transcript shows the cut answer as stopped.

**Verification: not verified.** Web scorecard W-10: spoken question blocked by test-machine microphone limit.

## CAP-streaming-and-response-states-16 Tool and search progress during an answer

While the assistant searches, runs code or calls a connector, the screen names the step and shows it running.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork): Cowork shows what it does (apps used, steps) and you can stop it at any point. Plans: paid plans. Apps: desktop.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/dots/tasks-and-memory.md](https://learn.chatgpt.com/docs/dots/tasks-and-memory.md): A dot's Activity tab shows task progress, files, results or input requests and lets you give instructions. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md section 5.4 item 27 and section 7 item 85). Search, code, connector and artifact-building steps appear as named, ordered steps with a running, done or failed state.

**With different models, providers and the one subscription.** Steps come from the app's tool harness, not the model, so they work for any provider. Local mode shows only local steps and marks anything that leaves the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** S19.04-S19.06, S19.13 done on most apps; S19.12 artifact building missing on mobile and Chrome; CLI timeline for queued missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.04, S19.05, S19.06, S19.12, S19.13
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:151`; `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:70`; `apps/mobile/src/features/chat/components/WebSearchToolCard.tsx:78`

**Gap.** Artifact-building state missing on mobile and Chrome; media state missing in VS Code and Chrome.

**Acceptance criteria**

1. A search shows 'Searching' with the query, then the source count.
2. A connector call names the service.
3. Artifact build shows a building state on every app that can build artifacts.

**Verification: seen working by a person.** Web scorecard W-5: 'Searching the web' then 'Searched the web · 5 sources'.

## CAP-streaming-and-response-states-17 Waiting for approval or input

A run pauses visibly when it needs the user to approve or answer.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/app-server.md](https://learn.chatgpt.com/docs/app-server.md): Command and file approvals offer accept, accept for session, decline and cancel. Apps: cli, desktop, ide.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md section 5.4 item 28). A paused turn shows what it waits for and the controls to continue or cancel.

**With different models, providers and the one subscription.** Approval is an app rule, independent of model. The wait does not use tokens.

**Current implementation, as this trace read it on 2026-11-24: partly built.** S19.07 done on all; S19.08 input wait missing in VS Code. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.07, S19.08
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:329`; `apps/cli/src/tui/approval_broker.rs:200`

**Gap.** VS Code lacks waiting-for-input.

**Acceptance criteria**

1. A step needing approval shows Approve and Deny and the run does not move on.
2. VS Code shows an input-needed state.

**Verification: code inspected only.** None seen by a person.

## CAP-streaming-and-response-states-18 Plain error during an answer

A failed turn says in plain words what happened and what to do, and names the cause.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages](https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages): Documents specific messages for usage limits, length limits and sign-in errors with their next step. Plans: all. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages): Documents 'Something went wrong', network and websocket errors, 'There was an error generating a response' and stuck spinners with steps. Plans: all. Apps: web, desktop.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md section 5.4 item 31). Each failure cause (rate limit, provider down, timeout, context too long, attachment, tool call, filtered, plan, session expired, empty reply) has its own plain message and next step; no raw payloads.

**With different models, providers and the one subscription.** Provider errors are mapped to one cause list so the same text appears for any model. Plan and limit causes come from the subscription system. In Local mode an error never suggests a cloud fix without consent.

**Current implementation, as this trace read it on 2026-11-24: built.** S19.21-S19.27 done on all apps (S19.24 CLI not rated). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.21, S19.22, S19.23, S19.24, S19.25, S19.26, S19.27
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/messages/ChatMessageList.tsx:100`; `apps/web/features/chat/lib/turn-error-notice.ts:102`; `apps/mobile/src/features/chat/utils/messageStreamError.ts:170`; `apps/cli/src/errors.rs:322`; `apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:308`

**Gap.** Testers saw a wrong message: 'No response was received' after a reload mid-answer, and a silent empty reply at a credit limit on image sends.

**Acceptance criteria**

1. Trigger each cause with a test provider: the matching text shows.
2. No raw JSON or stack text is ever shown.
3. Credit-limit failure always shows a limit message.

**Verification: seen failing by a person.** Defects W-3 (misleading banner after reload), W-7 subscribed (image send fails silently at credit limit). Web scorecard W-12 subscribed: chat answers failed with a billing period message.

## CAP-streaming-and-response-states-19 Usage limit reached during an answer

A limit stops the answer and the screen says when it resets or switches to credits.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages](https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages): Shows '5-hour limit reached - resets [time]' or, with usage credits, 'continuing with usage credits'. Plans: paid plans for credits. Apps: web, desktop.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): A smaller thinking model is the fallback when a rate limit is hit on the larger one. Plans: paid plans. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (credits and limits); S19.22). A turn stopped by a plan or budget limit says so and points to the fix; limit-then-credits shows a clear switch message.

**With different models, providers and the one subscription.** Limits come from the one subscription system on every app. A Free account sees only the Upgrade prompt, not meters.

**Current implementation, as this trace read it on 2026-11-24: partly built.** S19.21 and S19.22 done on all apps; web chat auto-resume after reset is partial (WP25). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.21, S19.22
- Comparison list ids: WP25
- Code: `apps/web/features/chat/lib/turn-error-notice.ts:125`; `apps/web/features/chat/pages/WebChatPage.tsx:1816`

**Gap.** Silent failure on image send at the limit; a Free limit banner showed while chat still worked.

**Acceptance criteria**

1. At the limit, a send shows the limit message, never an empty reply.
2. Free account sees Upgrade only.
3. Message shows the reset time when known.

**Verification: seen failing by a person.** Defect W-7 subscribed (major) and web scorecard W-2 free note a limit banner while chat worked.

## CAP-streaming-and-response-states-20 Length limit and long-chat summarising

Oversized input gets a clear error; long chats are summarised so work continues.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages](https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages): A length-limit message for oversized input; paid plans with code execution summarise earlier messages automatically and keep full history. Plans: paid plans. Apps: web, desktop.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity; S19.26). Too-long input shows what to change; long chats compact without losing the visible history.

**With different models, providers and the one subscription.** Context size is per model, so the limit and the message change with the model. Summaries use model calls and count in usage. Local models have small contexts and need their own limit.

**Current implementation, as this trace read it on 2026-11-24: partly built.** S19.26 done; compaction partial on web (WP27). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.26
- Comparison list ids: WP27
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:38`

**Gap.** Compaction and error text partial.

**Acceptance criteria**

1. Send an over-length message: error says to shorten and nothing is sent.
2. A long chat continues after compaction with history visible.

**Verification: not verified.** None.

## CAP-streaming-and-response-states-21 Blocked output notice

A reply stopped by a content filter says so.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9205721-why-am-i-receiving-an-output-blocked-by-content-filtering-policy-error](https://support.claude.com/en/articles/9205721-why-am-i-receiving-an-output-blocked-by-content-filtering-policy-error): Output blocked error shown when a reply would reproduce existing copyrighted material; repeated attempts can lead to warning or suspension. Apps: web.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity). A filtered reply keeps the safe part, says it was stopped by a safety rule, and does not offer a pointless retry.

**With different models, providers and the one subscription.** Providers filter differently; map each to one notice. Local models may have no filter.

**Current implementation, as this trace read it on 2026-11-24: partly built.** A 'safety system stopped this response' cause exists in the shared error list. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/messages/ChatMessageList.tsx:110`

**Gap.** Not tested; retry behaviour unknown.

**Acceptance criteria**

1. Feed a filtered stream: notice names the cause and keeps text that arrived.

**Verification: not verified.** None.

## CAP-streaming-and-response-states-22 Stuck answer recovery and stall detection

A hung answer is detected and the user gets a way out.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT, Codex: yes**
  - [https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages): For an endless spinner: wait 30-60 seconds, stop and regenerate, start a new chat, or reload. Plans: all. Apps: web, desktop.
  - [https://learn.chatgpt.com/docs/config-file/config-advanced.md](https://learn.chatgpt.com/docs/config-file/config-advanced.md): Codex has per-provider stream retries and a stream idle timeout setting. Apps: cli, ide, desktop.

**AGI requirement** (stated requirement; source: AGENTS.md section 8 (rate limits are configuration; graceful degradation)). The app detects a stalled stream by a time limit and offers retry; the limit is a setting, not a constant.

**With different models, providers and the one subscription.** Timeouts differ by provider, so they come from route configuration. Retried streams must not double-count usage.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI stall timers partial (CP366); web has an 'interrupted' cause; CLI retry watchdog missing (C76). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C76, CP366
- Code: `apps/web/features/chat/components/messages/ChatMessageList.tsx:117`

**Gap.** No confirmed stall timer on mobile or extensions.

**Acceptance criteria**

1. Block provider output mid-stream: after the limit the app shows an interrupted notice with Retry.
2. The retry does not bill the same tokens twice.

**Verification: seen failing by a person.** Defect W-3 subscribed (major): reload mid-answer leaves the user message with no answer or indicator.

## CAP-streaming-and-response-states-23 Reconnect and resume an interrupted answer

After a connection drop or reload, the run is picked up again instead of restarting or vanishing.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://support.claude.com/en/articles/14554922-claude-code-user-faq](https://support.claude.com/en/articles/14554922-claude-code-user-faq): --continue resumes the most recent session and --resume opens a picker; sessions are stored locally per project. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages): Names 'A network error occurred' and 'An error occurred while connecting to the websocket' with connection fixes; does not describe resuming the answer. Plans: all. Apps: web, desktop.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-24 (connector case); docs/product/competitive-guidance.md section 5.4 item 31). A dropped turn shows a reconnecting state and resumes when the server still holds the run. A reconnected connector does not auto-resume; the person retries.

**With different models, providers and the one subscription.** Resume applies to Cloud runs only. A Local chat stops with the app and shows an interrupted state; it never moves to cloud silently.

**Current implementation, as this trace read it on 2026-11-24: partly built.** S19.19 reconnecting: CLI and VS Code missing. S19.20 resuming done on all. S19.29 background continue: mobile and VS Code unverified. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.19, S19.20, S19.29
- Comparison list ids: C42
- Code: `apps/web/features/chat/stores/stream-phase-store.ts:3`; `apps/web/lib/hooks/useChatStream.ts:2335`; `apps/cli/src/background.rs:153`

**Gap.** Reload mid-answer lost the live stream on web; CLI auto-continue missing (C42).

**Acceptance criteria**

1. Reload during a long answer: the chat shows progress and finishes without a second reload.
2. Disconnect the network: reconnecting state shows, then resumes.
3. After app restart each turn shows done, failed or stopped as before.

**Verification: seen failing by a person.** Defect W-3 subscribed (major) and web scorecard W-3: reload mid-answer lost the stream until a second reload; W-3 free: misleading 'No response was received' banner.

## CAP-streaming-and-response-states-24 Draft kept through errors and offline

Unsent text survives failure, offline state and reload and sends after reconnect.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Mar 18, 2025: failed messages can be retried in place and unsent prompt text is saved. Plans: all. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md section 5.3 item 23). Unsent text and attachments survive navigation, sign-in refresh, model change and app interruption.

**With different models, providers and the one subscription.** Stored locally on the device first; sending after reconnect is a normal send that is checked against the subscription.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/web/features/chat/pages/WebChatPage.tsx`

**Gap.** A stale offline banner stays after reconnect.

**Acceptance criteria**

1. Go offline, type, reconnect: draft is intact and sends.
2. Offline banner clears when the connection returns.

**Verification: seen working by a person.** Web scorecard W-2 and W-3: offline draft kept and sent; banner stuck after reconnect (defect).

## CAP-streaming-and-response-states-25 Partial completion and cancelled-run states

A run that finished some steps shows as partly done, distinct from success and failure.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/security/plugin/deep-scans.md](https://learn.chatgpt.com/docs/security/plugin/deep-scans.md): Failed or cancelled scans keep saved findings separate from unconfirmed candidates, and the scan can be continued. Apps: desktop, cli.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md section 5.4 item 31 and section 8 item 112). Success, partial, failed, stopped and cancelled are five distinct labelled states.

**With different models, providers and the one subscription.** States come from the app's run record, not from the model. Partial work is billed as used.

**Current implementation, as this trace read it on 2026-11-24: built.** S19.15, S19.16, S19.27 done on all apps. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.15, S19.16, S19.27
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:335`; `apps/web/features/chat/components/messages/ChatMessageList.tsx:1048`

**Gap.** S19.14 'saving results' is missing in CLI and VS Code.

**Acceptance criteria**

1. Fail one step of three: run shows partly completed.
2. Stop a run: shows stopped, not failed.

**Verification: code inspected only.** No person-seen result.

## CAP-streaming-and-response-states-26 Streaming and stop on local models

Streaming display, stop and error states for models that run on the device.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: AGENTS.md section 6; docs/product/experience-contract.md (Local Chat row)). Local chats on desktop and mobile use the same streaming, stop and error states, with a visible Local label. A failure never moves the chat to a cloud route silently.

**With different models, providers and the one subscription.** Local runs are free; sign-in is a separate matter from payment. Usage accounting records Local use without charging.

**Current implementation, as this trace read it on 2026-11-24: unknown.** No ledger or comparison item covers local streaming, stop or errors. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: none cited

**Gap.** Not checked in this review.

**Acceptance criteria**

1. Local reply streams and stops on mobile and desktop.
2. A local failure shows a local error with no cloud retry offered unless the user forks it.

**Verification: not verified.** Web scorecards cover Cloud only.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to add smooth text fade-in while streaming (only ChatGPT is claimed to have it in the comparison; not confirmed here).
- Whether to match ChatGPT's early streaming (answer starts before thinking ends) where a provider allows it.
- Whether to keep Continue generating, which neither leader is shown to document.
- Whether a stopped Cloud run keeps its server-side spend, or the spend is cut at stop (owner rule on billing the partial).
- Target first-word time per route and per app, including a Local load-time target.
- Whether the CLI and VS Code should show reasoning by default or only on request.
- Whether steer or queue is the default while a run is active on each app (web setting exists; CLI uses Enter and Tab in the leader).

## Could not establish

- Whether Claude chat has a stop button, regenerate or continue control: the catalogue shows only the Claude Code interrupt keys.
- Whether ChatGPT chat shows a visible reasoning panel: catalogue shows only the Thinking slider and Think option.
- Whether either leader resumes an answer after a reload or connection drop: not in the catalogue.
- The number of seconds ChatGPT or Claude take to first words: not documented in the pages read.
- Real behaviour on mobile, desktop, CLI, VS Code and Chrome: only the web scorecards and web defects were read; the other five apps are code-inspected only.
- Local-mode streaming, stop and error behaviour on mobile and desktop.
- The comparison files mark many competitor cells '?'; this page used only the catalogue and saved pages, so some rows show has: unknown where the comparison says Yes.
- Exact keys for stop in each app were not confirmed in code beyond the shared composer-stop registry entry.
