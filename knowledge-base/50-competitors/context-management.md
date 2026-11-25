---
id: "COMP-context-management"
type: "competitor-trace"
title: "Context management"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Context management: competitors to requirements

Context management splits in two. Claude and ChatGPT chat document context windows, summarising older messages, a context-full notice, upload limits, project retrieval and branching. Claude Code and Codex add manual and tuned compaction and context meters. AGI has server compaction on web and Desktop, with automatic compaction on CLI and VS Code. Gaps: no web context meter, no mobile summary, no manual compact outside CLI and VS Code. No person has seen long-chat behaviour work.

**How the products divide this topic.** Claude chat (support.claude.com) documents: per-model windows on paid plans, automatic summarising of earlier messages when code execution is on, a length-limit error that differs from the usage limit, project retrieval, and upload limits. Claude Code (code.claude.com plus the Claude Code cheatsheet on support.claude.com) is a separate coding tool. It documents /compact, /context, /clear, /rewind summarise, an autocompact threshold, compaction hooks and a thrash guard. It connects to Claude chat only through shared plans and usage; one page says the ring also shows plan usage shared across Claude Code surfaces. ChatGPT (help.openai.com, chatgpt.com/pricing) documents window size by plan, a Free-plan context-window-full notice that can start a new chat with a summary, long pastes over 10,000 characters becoming attachments, upload limits, project file limits, and branch in new chat. Codex (learn.chatgpt.com, some help.openai.com pages) is a separate coding tool with manual compaction, tunable auto-compaction, compaction hooks and 272k to 1M windows. Work and Codex share a plan with ChatGPT and have their own larger window. Plan limits matter: Claude's windows and project retrieval are paid-plan items; ChatGPT's window grows from Free to Pro; the full-chat notice is documented for Free. ChatGPT whole-chat compaction is not documented in the catalogue for the chat product, only for Codex; ChatGPT chat has has: unknown there. Memory and cross-chat recall belong to the memory topic and are touched here only where they decide what is sent each turn. Public Desktop is Electron showing the hosted web app, so Desktop chat behaviour is web behaviour; the Tauri code is internal. Competitor review date for all evidence: 2026-11-22. No model names are written here; window sizes are quoted as sizes only.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-context-management-01](#cap-context-management-01) | Context window size by model and plan | yes | yes | partly built | not verified |
| [CAP-context-management-02](#cap-context-management-02) | Automatic summarising of older turns | yes | unknown | partly built | code inspected only |
| [CAP-context-management-03](#cap-context-management-03) | Context-full notice and continue in a new chat | yes | yes | partly built | not verified |
| [CAP-context-management-04](#cap-context-management-04) | Manual compact with a focus instruction | yes | yes | partly built | code inspected only |
| [CAP-context-management-05](#cap-context-management-05) | Auto-compaction threshold and idle compaction settings | yes | yes | partly built | code inspected only |
| [CAP-context-management-06](#cap-context-management-06) | Compaction loop guard | yes | unknown | not built | not verified |
| [CAP-context-management-07](#cap-context-management-07) | What survives compaction | yes | yes | partly built | code inspected only |
| [CAP-context-management-08](#cap-context-management-08) | Summarise from or up to a chosen message | yes | unknown | not built | not verified |
| [CAP-context-management-09](#cap-context-management-09) | Context usage meter and breakdown | yes | unknown | partly built | code inspected only |
| [CAP-context-management-10](#cap-context-management-10) | Choose a larger window variant | yes | yes | not built | not verified |
| [CAP-context-management-11](#cap-context-management-11) | Long paste becomes an attachment | unknown | yes | built | code inspected only |
| [CAP-context-management-12](#cap-context-management-12) | Chat attachment limits and plan caps | yes | yes | partly built | seen working by a person |
| [CAP-context-management-13](#cap-context-management-13) | What an attachment puts into the window | yes | yes | partly built | not verified |
| [CAP-context-management-14](#cap-context-management-14) | Project knowledge retrieval when it exceeds the window | yes | partly | built | seen failing by a person |
| [CAP-context-management-15](#cap-context-management-15) | Per-turn context selection and manifest | partly | yes | partly built | not verified |
| [CAP-context-management-16](#cap-context-management-16) | Summary versioning and untrusted-content fencing | no | no | built | code inspected only |
| [CAP-context-management-17](#cap-context-management-17) | Branch a chat from an earlier message | partly | yes | built | seen working by a person |
| [CAP-context-management-18](#cap-context-management-18) | Edit an earlier message and re-run | yes | yes | partly built | seen working by a person |
| [CAP-context-management-19](#cap-context-management-19) | Clear and rewind | yes | partly | built | code inspected only |
| [CAP-context-management-20](#cap-context-management-20) | Subagents with their own context | yes | yes | unknown | not verified |
| [CAP-context-management-21](#cap-context-management-21) | Compaction lifecycle hooks | yes | yes | built | code inspected only |
| [CAP-context-management-22](#cap-context-management-22) | Long chat browsing: contents list and lazy loading | unknown | yes | partly built | not verified |
| [CAP-context-management-23](#cap-context-management-23) | Conversation length and attachment size drive usage | yes | unknown | partly built | seen working by a person |
| [CAP-context-management-24](#cap-context-management-24) | Past chats as context | yes | yes | built | seen working by a person |

## CAP-context-management-01 Context window size by model and plan

The product states how much text a chat can hold, and the size depends on the model and the plan.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat); Claude Code is the same page, separate tool: yes**
  - [https://support.claude.com/en/articles/8606394-how-large-is-the-context-window-on-paid-claude-plans](https://support.claude.com/en/articles/8606394-how-large-is-the-context-window-on-paid-claude-plans): Chat on paid plans: 1M, 500K or 200K tokens depending on model; Claude Code mostly 1M; Cowork sizes listed separately. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android; cli for Claude Code.
- **ChatGPT: yes**
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Instant window 27K on Free, 54K on Go and Plus, 128K on Pro. Reasoning window varies on Free, 256K on Go and Plus, 400K on Pro. Usable input is smaller because instructions, memory and reasoning share the window. Plans: Free, Go, Plus, Pro. Apps: web.
  - [https://learn.chatgpt.com/docs/models.md](https://learn.chatgpt.com/docs/models.md): Codex defaults of 272k and 500k tokens, raisable to 1 million in config (Codex, separate tool). Apps: cli, desktop.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md:291 (maintain context limits in the current catalog)). Each model's context size comes from the model catalog, is shown where a person picks a model, and is the number every limit check and compaction uses.

**With different models, providers and the one subscription.** The size is a property of the chosen model and route, not of the plan. Plan limits (quotas) stay separate from window size. Local models report their own loaded window; if unknown, show unknown, not a guess.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI and VS Code use each catalog model's window. Mobile shows plan context only on the plans page. Web: the picker and meter named in the comparison are not mounted in web chat. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: CP35, D15, MP27
- Code: `apps/mobile/src/features/settings/plans/index.tsx:71-74`; `apps/cli/src/tui/tui_app.rs:11879`; `packages/ui/unified-chat/src/components/ContextUsageMeter.tsx (mounted only by shared ChatInput, ChatInput.tsx:1390)`

**Gap.** No per-model size in the mobile or web picker; the web comparison row 'Context window size shown per model' says nothing in apps/web mounts the picker or meter.

**Acceptance criteria**

1. Open the model picker on each app: each model shows its window size from the catalog.
2. Switch model mid-chat: the shown size and the compaction point change.
3. Pick a local model: the size shown is the loaded window, or 'unknown'.
4. The same model shows the same size on all six apps.

**Verification: not verified.** No scorecard or defect row covers window size. Code read only.

## CAP-context-management-02 Automatic summarising of older turns

When a chat outgrows the window, older turns are replaced by a summary and the chat continues.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat); Claude Code does the same as a separate tool: yes**
  - [https://support.claude.com/en/articles/8606394-how-large-is-the-context-window-on-paid-claude-plans](https://support.claude.com/en/articles/8606394-how-large-is-the-context-window-on-paid-claude-plans): With code execution on, Claude summarises earlier messages as the window fills so chats continue; full history stays referenceable; long chats use more of the limit. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/12138966-release-notes](https://support.claude.com/en/articles/12138966-release-notes): Nov 2025 release note: earlier messages are summarised near the limit, giving effectively endless chats and fewer length errors. Apps: web, desktop.
  - [https://code.claude.com/docs/en/how-claude-code-works.md](https://code.claude.com/docs/en/how-claude-code-works.md): Claude Code summarises automatically near the limit; early instructions can be lost. Apps: cli.
- **ChatGPT (chat); Codex is separate: unknown**
  - [https://help.openai.com/en/articles/9275245-chatgpt-free-tier-faq](https://help.openai.com/en/articles/9275245-chatgpt-free-tier-faq): When a chat is full the person is told and can start a new chat; the catalogue shows no automatic summarising for the chat product. Plans: Free and paid. Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/glossary.md](https://learn.chatgpt.com/docs/glossary.md): Codex: older context is summarised so long-running work continues (Codex only). Apps: cli, desktop, ide.

**AGI requirement** (inferred; source: competitor parity). A long chat keeps going: older turns are summarised, the latest turns stay verbatim, the person sees a marker where this happened, and the full history stays readable.

**With different models, providers and the one subscription.** Must work for any model and provider using that model's window. The summary call is billed through the one subscription system like any other call and must not use a model the person did not choose or a route outside the trust boundary. In Local mode the summary is made on device with the local model, never sent to our servers. Summaries of external or tool content are fenced as untrusted.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and Desktop: server compaction with a visible marker (on unless an environment switch turns it off). CLI and VS Code: automatic at 80 percent with untrusted-summary marker. Mobile: warning only, helper never called. Chrome: not found. Local-mode chat on public Desktop: unknown. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S93.05
- Comparison list ids: CP37, DP63, M28, VP10, WP27, WP57
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:38,59,437`; `packages/ui/unified-chat/src/components/CompactionMarker.tsx`; `crates/agiworkforce-agent-core/src/context.rs:70`; `apps/mobile/src/features/memory/services/contextBudgeter.ts:114`

**Gap.** Mobile never summarises. Web chat shows no context-full notice or summary-and-continue prompt (WP57). Behaviour for Local chats on Desktop and mobile is not established. Chrome not checked.

**Acceptance criteria**

1. Send enough text to pass the window on web: the chat continues, a marker shows where older turns were summarised, and the old messages stay readable.
2. Repeat on mobile: the chat continues instead of only warning.
3. Repeat in Local mode: no network request carries the chat text.
4. The summary call appears in usage on the same meter as ordinary turns.

**Verification: code inspected only.** Not in the web scorecard or defect file. No ledger live result found in the files read.

## CAP-context-management-03 Context-full notice and continue in a new chat

When a chat cannot hold more, the product says so and offers a way on, such as a new chat that can carry a summary.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat): yes**
  - [https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages](https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages): An oversized message gives a length limit error; paid plans with code execution auto-summarise earlier messages while keeping full history. Plans: Paid plans. Apps: not stated.
  - [https://support.claude.com/en/articles/11139144-use-claude-for-education-at-your-university](https://support.claude.com/en/articles/11139144-use-claude-for-education-at-your-university): A length error means the prompt exceeds the window: shorten it or start a new chat. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001639-why-does-chatgpt-say-context-window-full-or-chat-memory-full](https://help.openai.com/en/articles/20001639-why-does-chatgpt-say-context-window-full-or-chat-memory-full): On Free, long chats can fill; the notice offers a new chat, optionally with a summary that may omit details, or an upgrade to continue the original. Deleting saved memories does not free space. Plans: Free. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/9275245-chatgpt-free-tier-faq](https://help.openai.com/en/articles/9275245-chatgpt-free-tier-faq): Earlier messages stay readable; the limit is per conversation and unrelated to Memory. Plans: Free and paid. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity; docs/product/experience-contract.md W04 on explicit failure states). If a send cannot fit even after summarising, say why in plain words and offer: shorten the message, or start a new chat that carries a summary the person can read first. Never fail silently.

**With different models, providers and the one subscription.** Message is about the model's window, so it differs per model. It is not a usage-limit message and must not point to upgrade unless the plan really sets the window. Local mode: the carried summary stays on device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile: warning chip and details sheet with Start a fresh chat, no summary carried. Web: no notice found. CLI and VS Code: context-limit notice in the VS Code panel. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: MP19, WP57
- Code: `apps/mobile/src/features/chat/components/ContextWarningChip.tsx`; `apps/mobile/app/(app)/chat/[id].tsx:2700,2781`; `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3128`

**Gap.** Web has no notice or summary-and-continue. Mobile fresh chat carries no summary. Oversized single message handling not checked on any app.

**Acceptance criteria**

1. Paste a message larger than the window: a clear message appears, not a generic error, and the draft is kept.
2. On mobile tap the chip's fresh-chat button: the new chat offers the summary, which the person can read before sending.
3. The message never says 'upgrade' for a window set by the model.

**Verification: not verified.** No human run recorded.

## CAP-context-management-04 Manual compact with a focus instruction

A command that summarises the chat now, optionally told what to keep.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/commands.md](https://code.claude.com/docs/en/commands.md): /compact summarises the conversation to free context, optionally with focus instructions. Apps: cli.
  - [https://support.claude.com/en/articles/14553413-claude-code-cheatsheet](https://support.claude.com/en/articles/14553413-claude-code-cheatsheet): /compact summarises and takes optional focus text; /clear wipes history but keeps project memory. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/app-server.md](https://learn.chatgpt.com/docs/app-server.md): Manual conversation compaction on demand; progress appears as a compaction item. Apps: cli, desktop, ide.
  - [https://learn.chatgpt.com/guides/best-practices.md](https://learn.chatgpt.com/guides/best-practices.md): Session commands include /compact. Apps: not stated.

**AGI requirement** (inferred; source: competitor parity; docs/product/requirements.md:193 lists context compaction among Claude Code features AGI tracks). Coding sessions offer a compact command with an optional focus, and the result reports how much was freed.

**With different models, providers and the one subscription.** Uses the session's chosen model unless the person picks another; billed as normal usage; local sessions summarise with the local model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI and VS Code: built. Web cloud code composer: only /review and /security-review. Desktop and web chat: no on-demand control. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D13, W205, W266
- Code: `apps/cli/src/tui/tui_app.rs:5936`; `apps/extension-vscode/src/core/commandSetup.ts:1367,1384`; `apps/cli/src/compaction.rs:112`

**Gap.** No compact on demand in web chat, web cloud code, Desktop chat or mobile.

**Acceptance criteria**

1. Run /compact with a focus in CLI: the receipt shows tokens before and after and the focus topic survives.
2. Run it with too little history: it says nothing to compact.
3. Run it on web cloud code: the command exists, or the page says it is unavailable and why.

**Verification: code inspected only.** Code read only.

## CAP-context-management-05 Auto-compaction threshold and idle compaction settings

The person or admin can set how full the window gets before compaction, and some tools also compact an idle session.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/commands.md](https://code.claude.com/docs/en/commands.md): /autocompact sets how full the window gets before compaction; saved to user settings. Apps: cli.
  - [https://code.claude.com/docs/en/costs.md](https://code.claude.com/docs/en/costs.md): Idle compaction, session recap and prompt suggestions use tokens in the background. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/config-file/config-reference.md](https://learn.chatgpt.com/docs/config-file/config-reference.md): Auto-compaction can be set by token threshold (total or new growth) or by percentage after a final response, and the compaction prompt can be overridden. Apps: cli, ide, desktop.

**AGI requirement** (proposed; source: AGENTS.md section 8 (limits are configuration, not constants) read with competitor parity). Where a power surface compacts automatically, the threshold is a setting, not a constant, and background compaction cost is visible.

**With different models, providers and the one subscription.** Threshold is a fraction of the chosen model's window; idle compaction spends usage under the one subscription meter and is off for Local sessions unless on-device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI and VS Code compact at a fixed 80 percent with no setting. No idle compaction. Web has no user setting. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C260, C402, C502, CP262, CP37, V15, VP10
- Code: `crates/agiworkforce-agent-core/src/context.rs:70-71`; `apps/cli/src/agent/chat.rs:1188,1193,1222`

**Gap.** No threshold setting, no off switch, no idle compaction, no editable summary prompt.

**Acceptance criteria**

1. Change the threshold in settings: compaction fires at the new point in CLI and VS Code.
2. Turn auto-compaction off: the session warns and stops instead of compacting.
3. Idle compaction, if built, is visible in usage.

**Verification: code inspected only.** Code read only.

## CAP-context-management-06 Compaction loop guard

If one huge output refills the window after each summary, compaction stops and shows an error instead of looping.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/how-claude-code-works.md](https://code.claude.com/docs/en/how-claude-code-works.md): Auto-compaction stops after a few tries when a huge output keeps refilling context and shows an error. Apps: cli.
- **Codex: unknown**
  - [https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan): Troubleshooting only: if context repeatedly auto-compacts, start a new chat with a summary. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity; AGENTS.md section 9 (no silent failures)). Compaction never loops. After a few tries it stops, says what filled the window, and suggests a way out.

**With different models, providers and the one subscription.** Each retry costs usage, so the guard also caps spend on any provider.

**Current implementation, as this trace read it on 2026-11-24: not built.** CLI: fixed trigger with no repeat guard. Others not checked. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C168
- Code: `crates/agiworkforce-agent-core/src/context.rs:70`

**Gap.** No repeat guard.

**Acceptance criteria**

1. Feed a tool that returns an output larger than the window repeatedly: compaction stops after a bounded number of tries with a visible error.
2. The session stays usable after the stop.

**Verification: not verified.** Not tested.

## CAP-context-management-07 What survives compaction

Durable instructions and the plan are put back after a summary, so a rule given only in chat is the part that can be lost.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/context-window.md](https://code.claude.com/docs/en/context-window.md): After compaction, project instructions, auto memory, plan, skill descriptions and up to five recent files are re-injected; invoked skills are capped at 5,000 tokens each, 25,000 total. Apps: cli.
  - [https://code.claude.com/docs/en/large-codebases.md](https://code.claude.com/docs/en/large-codebases.md): Plan-mode plan file is re-injected after each compaction. Apps: cli.
  - [https://code.claude.com/docs/en/costs.md](https://code.claude.com/docs/en/costs.md): A Compact instructions section in the instructions file tells compaction what to preserve. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/hooks.md](https://learn.chatgpt.com/docs/hooks.md): SessionStart hooks add developer context also after compaction. Apps: cli, desktop.

**AGI requirement** (inferred; source: competitor parity; docs/product/competitive-guidance.md:371 (load instructions within context budgets, separate durable guidance from task data)). After compaction the instruction files, active plan and pinned context are re-applied, and the person is told that chat-only instructions may be dropped.

**With different models, providers and the one subscription.** Instruction precedence is the same for every model and provider; re-applied text counts toward the window and usage.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Platform instruction resolver is built. CLI: plan files are not re-injected; no compaction-instructions section. VS Code: instruction files cut at a fixed 10,000 tokens. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S93.03
- Comparison list ids: C195, CP271, VP68
- Code: `packages/contracts/context/src/instruction-precedence.ts:125`; `apps/cli/src/features/plan/plan_mode.rs:318`; `apps/cli/src/compaction.rs:10`

**Gap.** Plan not re-injected; no steering section; fixed instruction size cap.

**Acceptance criteria**

1. Set a rule in the instruction file, compact, then ask: the rule still applies.
2. Make a plan, compact, ask for status: the plan is still followed.
3. State a rule only in chat, compact: the product warns that chat-only rules may be lost.

**Verification: code inspected only.** Code read only.

## CAP-context-management-08 Summarise from or up to a chosen message

The person picks a point in the chat and only the part before or after it is compressed.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/checkpointing.md](https://code.claude.com/docs/en/checkpointing.md): Summarize from here / up to here compresses the part after or before a chosen point into a summary; files unchanged; originals stay in the transcript. Apps: cli, ide.
- **Codex: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity (one competitor only)). Coding sessions can compress part of a session at a chosen message and keep the original text recoverable.

**With different models, providers and the one subscription.** Same summariser rules as automatic compaction.

**Current implementation, as this trace read it on 2026-11-24: not built.** CLI rewind offers restore code or conversation only. VS Code summarises the whole session only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C48, VP46
- Code: `apps/cli/src/tui/widgets/checkpoint_picker.rs:46-58`; `apps/extension-vscode/package.json (compactConversation)`

**Gap.** No partial summarise.

**Acceptance criteria**

1. Pick a message and choose summarise-up-to-here: earlier text collapses, later text stays, the original is still viewable.

**Verification: not verified.** Not tested.

## CAP-context-management-09 Context usage meter and breakdown

A readout of how full the window is, and in coding tools a breakdown by what fills it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (Claude chat shows warnings only): yes**
  - [https://code.claude.com/docs/en/context-window.md](https://code.claude.com/docs/en/context-window.md): /context shows usage by category with suggestions and which memory files loaded. Apps: cli.
  - [https://code.claude.com/docs/en/desktop.md](https://code.claude.com/docs/en/desktop.md): Context card or ring shows fullness by category; the ring also shows plan usage shared across Claude Code surfaces. Apps: desktop.
- **ChatGPT; Codex: unknown**
  - [https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan): No context meter found for the chat product in the catalogue; per-chat credit use is shown in Usage and billing for credit-billed plans. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md:357 (Code surface carries context usage) and :268 (model, effort and context usage)). Code sessions show context fullness on every surface and can break it down by category. Chat warns before the window fills.

**With different models, providers and the one subscription.** Counts use the active model's own window and tokenizer estimate; the meter is separate from plan quota. Local mode shows device-side counts.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI /context lists system prompt, instructions, rules, files, messages, not tools or MCP. VS Code shows the readout always. Desktop code: one bar, no breakdown. Mobile: setting and per-session meter in cloud code. Web chat: no meter found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S19.03
- Comparison list ids: CP11, CP119, DP65, VP81
- Code: `apps/cli/src/agent/history.rs:17-57`; `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4087-4101`; `apps/web/features/code/components/CodeComposer.tsx:1532-1620`; `apps/mobile/src/features/settings/code/index.tsx:367`

**Gap.** Breakdown missing for tools, MCP and subagents; no /context on Desktop; no meter in web chat.

**Acceptance criteria**

1. Open a long code session on each surface: a meter shows percent used.
2. Run /context: categories sum to the meter.
3. Add an MCP server: its tool tokens appear as a category.

**Verification: code inspected only.** Code read only.

## CAP-context-management-10 Choose a larger window variant

A person can opt in or out of a 1M-token window on models that offer it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (and Claude chat, which sets windows by model): yes**
  - [https://code.claude.com/docs/en/context-window.md](https://code.claude.com/docs/en/context-window.md): A 1M window is selectable on supported models through a [1m] variant; availability varies by plan. Apps: cli.
  - [https://support.claude.com/en/articles/8606394-how-large-is-the-context-window-on-paid-claude-plans](https://support.claude.com/en/articles/8606394-how-large-is-the-context-window-on-paid-claude-plans): Some 1M access in Claude Code needs the [1m] suffix and usage credits enabled on Pro. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/models.md](https://learn.chatgpt.com/docs/models.md): Default windows can be raised to 1 million via model_context_window in config. Apps: cli, desktop.

**AGI requirement** (proposed; source: competitor parity). Where a model offers more than one window, the person can choose, with the cost effect stated.

**With different models, providers and the one subscription.** Larger windows change billed cost, so the choice must show the effect under the one subscription system. Not available for local models whose window is fixed by memory.

**Current implementation, as this trace read it on 2026-11-24: not built.** CLI labels a 1M window but has no switch. Desktop and web picker: none. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: CP115, CP35, D15
- Code: `apps/cli/src/tui/tui_app.rs:11879`

**Gap.** No window-variant choice.

**Acceptance criteria**

1. Pick the larger variant: meter and compaction point change and a cost note shows.
2. On a model with one window: no choice is offered.

**Verification: not verified.** Not tested.

## CAP-context-management-11 Long paste becomes an attachment

A very long pasted text turns into an attachment so it does not flood the composer or the window; it can be put back.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/whats-new.md](https://learn.chatgpt.com/docs/whats-new.md): On every plan, pastes over 10,000 characters become an attachment; Show in text field moves it back. Plans: all plans. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Long pastes convert to an attachment to protect the context window. Plans: All plans. Apps: web, desktop, ios, android.

**AGI requirement** (inferred; source: competitor parity). A paste over a set size becomes an attachment that can be put back into the message.

**With different models, providers and the one subscription.** Same on every model. The attachment is then treated like any attachment under the model's window.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and mobile built with a 10,000 character threshold from one shared helper. Other apps not checked. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `packages/platform/utils/src/composerPaste.ts:12`; `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4941-4956`; `apps/mobile/src/features/chat/components/ChatInput.tsx:1250`

**Gap.** Not checked on Desktop, CLI, VS Code and Chrome. Comparison rows for web and mobile have no ids because status is Same.

**Acceptance criteria**

1. Paste 10,001 characters: an attachment chip appears.
2. Choose put back: text returns to the field.
3. Paste 9,999 characters: stays text.

**Verification: code inspected only.** Not in scorecards.

## CAP-context-management-12 Chat attachment limits and plan caps

Published limits on file size, file count, image size and upload rate for chat.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): Chat: 500 MB per file, up to 20 files per chat, images up to 8000x8000 pixels, PDFs up to 1000 pages; larger PDFs error as too large. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt](https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt): 512 MB per document, 2M tokens per text file, about 50 MB per spreadsheet, 20 MB per image; 80 uploads per 3 hours (Free 3 per day); 25 GB storage per user. Plans: Free and paid. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Feb 13, 2026: up to 20 files per message. Apps: web.
  - [https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq](https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq): Images up to 20 MB; how many fit in a conversation depends on image size and text. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W04). Each attachable format either gives usable model input or an explicit unsupported or extraction-failed state. Type, size and count limits come from one canonical source, and a failed upload keeps the draft.

**With different models, providers and the one subscription.** Limits are per plan in the one subscription system, and a model that cannot read a format gets a stated alternative, not a silent drop. In Local mode files stay on device and limits come from the local model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web enforces plan caps: Free 5 files a day, paid plans capped by daily bytes. Mobile shows no per-plan project file limits. Chrome applies the shared attachment policy with no credential-filename block. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M182, XP14
- Code: `apps/web/lib/server/attachment-allowance.ts:45,78-88`; `packages/contracts/types/src/billing-catalog.ts:556-560,631,645-649`

**Gap.** Per-plan limits are not shown on mobile. Chrome has no sensitive-file refusal.

**Acceptance criteria**

1. Attach a file over the limit: a message names the limit and the draft stays.
2. Attach 21 files in one message: refused with the count named.
3. A Free account hitting its daily count sees the Upgrade path only, no meters.

**Verification: seen working by a person.** 5-results/basics/scorecards/web.csv W-4 (Free and subscribed, status partial): PDF and image attached, answered correctly, removed attachment stayed out, reload kept attachments. Defects seen: clipped filename, slow first words, intermittent wrong shape count. Limits themselves not tried.

## CAP-context-management-13 What an attachment puts into the window

How an uploaded file reaches the model: whole text in the window, or part in a search index.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8241126-upload-files-to-claude](https://support.claude.com/en/articles/8241126-upload-files-to-claude): Project files: text extraction only except multimodal PDFs; total content must fit the window. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/10166901-use-google-workspace-connectors](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors): Several Drive files can be added if they fit in context; only text is extracted, not images. Apps: web, desktop.
- **ChatGPT (Enterprise help page): yes**
  - [https://help.openai.com/en/articles/10029836-optimizing-file-uploads-in-chatgpt-enterprise](https://help.openai.com/en/articles/10029836-optimizing-file-uploads-in-chatgpt-enterprise): On a 128k window, up to 110k document tokens go in context (55k split among several documents) and the rest goes to a private vector index; about 350 mixed pages fill it. Plans: Enterprise. Apps: web.

**AGI requirement** (inferred; source: competitor parity; docs/product/experience-contract.md W04 (explicit extraction-failed state)). The product states how attachments are used: whole in the window, or searched when too large, and says when a file was only partly read.

**With different models, providers and the one subscription.** The split depends on the chosen model's window. If a model cannot take images, say so and offer extraction. Indexing and embedding spend is metered under the one subscription. Local files in Local mode are indexed on device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Platform: chunking, embeddings, hybrid retrieval, reranking and permission filters are built. How a chat attachment is split between window and index is not stated in the ledger. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S93.18, S93.19, S93.20, S93.21, S93.22, S93.23, S93.24
- Comparison list ids: none matched
- Code: `apps/web/lib/services/retrieval-index-service.ts:248,319`; `apps/web/lib/services/retrieval-search-service.ts:231,269,295`; `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.large-file.test.ts`

**Gap.** No page or code line found that tells the person a large file was only partly read.

**Acceptance criteria**

1. Attach a file larger than the window: the answer or notice says it was searched or truncated.
2. A model without image input gets a clear notice for an image.
3. Ask about a fact late in a large file: the answer is right or says it could not read that part.

**Verification: not verified.** W-4 used small files; no large-file run by a person.

## CAP-context-management-14 Project knowledge retrieval when it exceeds the window

Project files that fit are in context; when they do not, the product searches them instead.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects](https://support.claude.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects): When project knowledge nears the limit Claude switches to retrieval, expanding capacity up to 10x, with a visible indicator and a project knowledge search tool call. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/9517075-what-are-projects](https://support.claude.com/en/articles/9517075-what-are-projects): Context is not shared across chats unless added to knowledge. Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt](https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt): Project file counts per plan: Free 5, Go and Plus 25, Edu, Pro, Business, Enterprise 40. The catalogue does not describe a window-to-search switch for projects. Plans: Free, Go, Plus, Pro, Business, Enterprise. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). Project knowledge stays usable beyond the window by retrieval, with a visible sign that retrieval is on and a citation to the file part used.

**With different models, providers and the one subscription.** Retrieval runs the same for every model, so a window change does not change which files are searchable. Embedding use is metered. In Local mode retrieval must run on device or be off.

**Current implementation, as this trace read it on 2026-11-24: built.** Platform retrieval built; project context service selects blocks within budget. A person tried project file upload on web and it failed (blocker). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S93.02, S93.08
- Comparison list ids: none matched
- Code: `apps/web/lib/services/project-knowledge-retrieval.ts:38`; `apps/web/lib/services/project-context-service.ts:352,516`; `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2550`

**Gap.** Project upload failed in the browser run (server error on a missing database column in that local setup). No visible sign of retrieval mode found.

**Acceptance criteria**

1. Add more knowledge than fits: chat still answers from it and shows that search is on.
2. A citation names the file.
3. A file the person cannot see is never returned.

**Verification: seen failing by a person.** 5-results/basics/scorecards/web.csv W-11 and 6-defects/web-problems-seen-in-browser.csv W-11 (blocker): knowledge upload gave 'Something went wrong on our side'; the log pointed to a database that looked behind (setup limit).

## CAP-context-management-15 Per-turn context selection and manifest

Before each turn the product chooses what to send (instructions, project blocks, past chats, memories) within the budget, and can show what shaped a reply.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/context-window.md](https://code.claude.com/docs/en/context-window.md): Instructions, auto memory, tool names and skill descriptions load before the first prompt; path-scoped rules load when matching files are read. Apps: cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): May 5, 2026: a Sources icon shows the memories, past chats, custom instructions, and for Plus and Pro library files and Gmail that shaped a reply, with correct, delete or not-relevant actions. Plans: Free, Go, Plus, Pro. Apps: web.
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Shared window also holds system instructions, memories and reasoning. Plans: Free, Go, Plus, Pro. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md:371 (instructions loaded within context budgets, separate from untrusted text); AGENTS.md section 6 (no silent cross-boundary routing)). Each turn sends only what fits and is allowed, and the person can see which sources were included or left out.

**With different models, providers and the one subscription.** The selection is the same for every model; only the budget differs. Nothing from a Local chat is added to a cloud turn, and nothing crosses to BYOK or managed cloud without an explicit fork with a visible provider label.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Platform manifest, selection and source registry built on the server. A visible Sources view for the person was not found in the files read. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S93.01, S93.02, S93.03, S93.04
- Comparison list ids: none matched
- Code: `apps/web/lib/services/turn-context-service.ts:126,144,171`; `packages/platform/context-engine/src/manifest-store.ts:56`; `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3156`

**Gap.** Manifest exists server side; no person-facing view found.

**Acceptance criteria**

1. After a reply, open what was sent: instructions, project blocks, past chats and attachments are listed with why each was in or out.
2. A Local chat shows no cloud sources.
3. Delete a source: the next turn omits it.

**Verification: not verified.** No human run found.

## CAP-context-management-16 Summary versioning and untrusted-content fencing

Stored summaries stay valid only for the messages they cover, and summaries of outside content are fenced so they are not treated as instructions. Neither competitor documents this.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - no page found in the saved documentation
- **ChatGPT: no**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI-only; AGENTS.md section 6 (fail closed)). An edited or deleted message invalidates the summary that covered it, and a summary of tool or web content is marked untrusted.

**With different models, providers and the one subscription.** Applies to every model. In Local mode the same rules apply to the on-device summary.

**Current implementation, as this trace read it on 2026-11-24: built.** Web server: coverage digest, branch-aware, untrusted tag. CLI: untrusted-summary marker. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S93.06
- Comparison list ids: none matched
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:92-140`; `apps/web/db/neon/0282_compaction_summary_coverage.sql:29`

**Gap.** none known

**Acceptance criteria**

1. Edit an early message in a summarised chat: the next turn does not use the old summary.
2. Summarise a span with web content: the summary carries the untrusted tag.

**Verification: code inspected only.** Code read only.

## CAP-context-management-17 Branch a chat from an earlier message

Fork a conversation at a chosen message into a new chat or branch, keeping the original.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat); Claude Code: partly**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Editing an earlier message makes a separate chat version with its own artifacts. Apps: web, desktop.
  - [https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude): The unified experience has no conversation branching from earlier points. Apps: web, desktop, ios, android.
- **ChatGPT; Codex: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Sep 4, 2025: the message menu lets you fork a conversation from that point (Branch in new chat). Plans: Free, Go, Plus, Pro. Apps: web.
  - [https://learn.chatgpt.com/docs/whats-new.md](https://learn.chatgpt.com/docs/whats-new.md): Desktop: fork a chat from an earlier message to try another approach. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). A person can branch from any message, and the branch starts with only the context up to that point.

**With different models, providers and the one subscription.** A Local chat branches as Local. A Local to BYOK change is an explicit new branch with consent and a visible provider label, per the product definition.

**Current implementation, as this trace read it on 2026-11-24: built.** Web: branch in new chat and Duplicate as branch. Desktop: via web. Mobile: branches in shared projects partly. CLI: /fork, /branch, fork at turn. VS Code: branch-from-message. Chrome: not found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: MP99
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:4014`; `apps/web/features/chat/hooks/use-conversation-branches.ts`; `apps/cli/src/tui/tui_app.rs:5955`; `apps/extension-vscode/src/core/commandSetup.ts:1427`

**Gap.** Mobile and Chrome not confirmed. A console 404 on the branches request was seen on a first turn.

**Acceptance criteria**

1. Branch from message 3: the new chat holds messages 1 to 3 only.
2. The original is unchanged.
3. A Local chat's branch is Local.

**Verification: seen working by a person.** web.csv W-3: edit of the first message gave a 2/2 pager, later turns dropped from view on the active branch, answer followed the edit (status partial). Defects file W-8: console 404 on the branches request.

## CAP-context-management-18 Edit an earlier message and re-run

Change a sent message, including one with attachments, and the chat re-runs from there.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Editing an earlier message makes a separate chat version. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Feb 27, 2026 and Jun 8, 2026: web and iOS edit prompts that include image attachments. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity). An edit re-runs from that point with the original attachments kept, and the later turns are kept as a viewable earlier version.

**With different models, providers and the one subscription.** Re-run uses the model chosen at edit time and counts as new usage.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and mobile built, with attachments. Chrome: sent messages cannot be edited. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/web/features/chat/pages/WebChatPage.tsx:5584-5598`; `apps/mobile/src/features/chat/components/MessageEditModal.tsx:17-28`

**Gap.** Chrome cannot edit a sent message. Web run showed one edit follow-up in an SVG chat that sent nothing.

**Acceptance criteria**

1. Edit message 1 on a chat with a file: the file is kept and the answer reflects the edit.
2. The earlier version stays viewable.

**Verification: seen working by a person.** web.csv W-3 (partial): edit with Save and Retry changed the later answer; pager showed 2/2 and 1/2. Defects in the same run: slow answer, long reasoning text.

## CAP-context-management-19 Clear and rewind

Start from empty context, or go back to an earlier turn with code and conversation restored.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/checkpointing.md](https://code.claude.com/docs/en/checkpointing.md): Every prompt snapshots file edits; the 100 most recent checkpoints keep snapshots and are saved with the conversation, so rewind works after resuming. Apps: cli, ide.
  - [https://support.claude.com/en/articles/14553413-claude-code-cheatsheet](https://support.claude.com/en/articles/14553413-claude-code-cheatsheet): /clear wipes chat history but keeps project memory. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
- **Codex: partly**
  - [https://learn.chatgpt.com/docs/app-server.md](https://learn.chatgpt.com/docs/app-server.md): Fork, resume, archive, unarchive, delete and rename threads. Apps: cli, desktop, ide.

**AGI requirement** (inferred; source: competitor parity; AGENTS.md section 9 (code gets a checkpoint)). Coding sessions can clear context and rewind code, conversation or both to an earlier prompt.

**With different models, providers and the one subscription.** Local and cloud sessions use the same checkpoints; nothing is uploaded to rewind.

**Current implementation, as this trace read it on 2026-11-24: built.** CLI and VS Code built (picker with code, conversation or both). No /reset alias, no naming of old conversation, no /undo. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C49, CP149, CP164, CP31
- Code: `apps/cli/src/tui/tui_app.rs:5489,5986,3927`; `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3139-3190`

**Gap.** Aliases and naming only.

**Acceptance criteria**

1. Rewind to prompt 2 with both code and conversation: files and chat match that point.
2. Clear: next turn has no earlier messages but instruction files still apply.

**Verification: code inspected only.** Code read only.

## CAP-context-management-20 Subagents with their own context

Delegated work runs in a separate window and returns only a summary, keeping the main chat small.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/tools-reference.md](https://code.claude.com/docs/en/tools-reference.md): The Agent tool spawns a subagent with a separate context window; only the final result returns to the parent. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/long-running-work.md](https://learn.chatgpt.com/docs/long-running-work.md): Each chat keeps its own context and goal; worktrees give parallel chats separate checkouts. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). Delegated agents work in a separate window and return a summary, with their token use counted.

**With different models, providers and the one subscription.** Each subagent may use a different model within the plan and trust boundary; usage counts under the one subscription.

**Current implementation, as this trace read it on 2026-11-24: unknown.** Not examined in this page; agent subtopic. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: none cited

**Gap.** Not established here.

**Acceptance criteria**

1. Run a delegated task: the main window grows only by the returned summary.
2. Subagent tokens show in usage.

**Verification: not verified.** Not examined.

## CAP-context-management-21 Compaction lifecycle hooks

Scripts can run before or after compaction, and may block it or add summary instructions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/hooks.md](https://code.claude.com/docs/en/hooks.md): PreCompact can block compaction or add summary instructions; PostCompact receives the summary. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/hooks.md](https://learn.chatgpt.com/docs/hooks.md): Pre and PostCompact hooks run before and after, with manual or auto trigger. Apps: cli, desktop.

**AGI requirement** (inferred; source: competitor parity). Developer surfaces expose compaction hook events.

**With different models, providers and the one subscription.** Hooks run on the host; a hook must not send chat text off device in Local mode.

**Current implementation, as this trace read it on 2026-11-24: built.** CLI has about 35 hook events including PreCompact. A PostCompact event is not named in the comparison row. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/cli/src/features/hooks/hooks.rs:149`

**Gap.** PostCompact not confirmed.

**Acceptance criteria**

1. A PreCompact hook that exits with a block stops compaction.
2. A hook sees whether the trigger was manual or auto.

**Verification: code inspected only.** Code read only.

## CAP-context-management-22 Long chat browsing: contents list and lazy loading

Long chats stay fast and navigable.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jun 8, 2026: chats over five responses get a table of contents. Aug 21, 2026: long conversations load in smaller sections (rolling out). Apps: web.

**AGI requirement** (inferred; source: competitor parity). A long chat renders only what is visible and offers a way to jump through it.

**With different models, providers and the one subscription.** Display only; same on every model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: virtualised list built; no contents list. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W81
- Code: `apps/web/features/chat/components/messages/ChatMessageList.tsx:2105-2110`

**Gap.** No contents list.

**Acceptance criteria**

1. Open a chat of 500 turns: scrolling stays smooth.
2. A contents list lets a person jump to a turn.

**Verification: not verified.** Not tested.

## CAP-context-management-23 Conversation length and attachment size drive usage

Longer chats, big attachments and tool use spend the plan's allowance faster, and the product says so.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9797557-usage-limit-best-practices](https://support.claude.com/en/articles/9797557-usage-limit-best-practices): Message length, attachment size, conversation length, tool use, model and effort all affect how fast limits are used. Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/10684626-enable-and-use-web-search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search): On Free, a fetched article enters context and can use much of the limit. Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: owner decision recorded in project memory: Free usage screens show only Upgrade; docs/product/commercial.md not read in detail). The product explains that long chats cost more and uses compaction to bound the cost. Free accounts see only Upgrade, never meters.

**With different models, providers and the one subscription.** Cost is the model's billed tokens under the one subscription. Local models cost no credits.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Free usage screen shows only Upgrade (seen). Explanatory tips for long chats not found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `web.csv W-19` (not found)

**Gap.** No guidance text found.

**Acceptance criteria**

1. Free usage screen shows Upgrade only.
2. Paid usage view or help states that long chats use more.

**Verification: seen working by a person.** web.csv W-19 (Free, partial): usage screen shows only Upgrade, no meters.

## CAP-context-management-24 Past chats as context

The product retrieves earlier chats to ground a new turn. This overlaps the memory topic.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9797557-usage-limit-best-practices](https://support.claude.com/en/articles/9797557-usage-limit-best-practices): Paid plans can search earlier conversations and use memory and project summaries to avoid repeating context. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jan 15, 2026: with reference chat history on, Plus and Pro retrieve specifics from past chats and show the chats used as sources. Plans: Plus, Pro. Apps: web.

**AGI requirement** (stated requirement; source: AGENTS.md section 6 (Local, BYOK and managed cloud are separate trust boundaries)). Past chats can ground a turn only when the person allows it, never from temporary or deleted chats, and never from Local into cloud.

**With different models, providers and the one subscription.** Retrieval is model-independent. Local chats are never retrieved into cloud turns.

**Current implementation, as this trace read it on 2026-11-24: built.** Platform retrieval excludes temporary, deleted and archived chats. See the memory topic for the person-facing controls. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S93.07
- Comparison list ids: none matched
- Code: `apps/web/lib/services/past-chat-context-service.ts:315`; `apps/web/db/neon/0244_archived_resources_leave_ai_retrieval.sql:38`

**Gap.** Person-facing view not checked here.

**Acceptance criteria**

1. Turn the setting off: no past chat is used.
2. A deleted chat is not used.
3. The reply lists the chats used.

**Verification: seen working by a person.** web.csv W-12 covers saved memory only (Free pass, subscribed partial); past-chat retrieval itself not tried.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to match the Claude-only features: summarise from or up to a chosen message, a user-set compaction threshold, idle compaction, and the window-variant choice.
- Whether web and mobile chat should show a context meter, or only a warning near the limit, as both leaders do for chat.
- Whether a context-full notice may mention an upgrade, since ChatGPT does on Free and window size is set by the model in AGI.
- Whether Local-mode chats on Desktop and mobile compact with the local model, trim without a summary, or stop and offer a fresh chat.
- Whether the per-turn manifest should be shown to people, and in what form, as ChatGPT does with its Sources icon.
- Whether compaction calls count against quota like ordinary turns or are absorbed by the plan.

## Could not establish

- No catalogue line shows ChatGPT chat (not Codex) summarising older turns automatically, so has: unknown was used. A saved page was not opened to confirm.
- Claude long-paste-to-attachment behaviour is not in the catalogue.
- I did not open saved pages beyond the catalogue lines; plan limits are as the lines state.
- Whether Local-mode chats on public Desktop or mobile compact, and how, was not established. The internal Tauri build has compaction code (apps/desktop/src-tauri/src/sys/commands/chat/compaction.rs) which I did not read.
- Whether the server compaction switch is on in production was not checked; code defaults it to on unless an environment variable turns it off.
- I did not read docs/product/commercial.md or the full docs/decisions files for context rules; none of the search hits stated a compaction rule.
- Subagent context, Chrome and Desktop-specific behaviour were not examined in code.
- No human-run scorecard covers long chats, compaction, context meters or large attachments. Only the web scorecard and defect file were read; other apps' scorecards were searched by keyword only and gave nothing relevant.
- Comparison rows with status Same carry no list id, so those capabilities cite the feature name instead of an id.
