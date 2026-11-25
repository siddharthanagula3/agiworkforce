---
id: "COMP-editing-regeneration-and-branching"
type: "competitor-trace"
title: "Editing, regeneration and branching"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Editing, regeneration and branching: competitors to requirements

Edit, retry, regenerate, response versions, branching and stop are built on Web and Desktop (hosted web app), mostly on Mobile, partly on VS Code, CLI and Chrome. A web tester saw edit with a version pager, stop and regenerate work on 2026-11-24, with defects. Catalogue evidence for the Claude chat product is thin, so most competitor detail is ChatGPT plus the Claude Code and Codex coding tools. Mobile branching conflicts with an owner decision.

**How the products divide this topic.** Review date for all competitor evidence: 2026-11-22. ChatGPT (help.openai.com): edit of sent messages incl. image attachments (web Feb 2026; iOS and Android Jun 2026; iOS long-press menu), Branch in new chat (web, Free/Go/Plus/Pro, note dated 2025-09-04), Try again and regenerate with search, retry menu to regenerate with Thinking or Pro (Plus, Pro, Business, Enterprise, Edu), inline retry of failed messages, stop generating (web; macOS shortcut). Claude chat (support.claude.com): only three relevant lines: editing an earlier message makes a separate chat version with its own artifacts (web, desktop); edit and retry when a flagged message pauses the chat (web, desktop, iOS, Android, CLI); and "branching a conversation from an earlier point isn't available" in the unified Cowork and Chat experience. The catalogue has no Claude chat page on retry, regenerate, stop or response versions, so those are has: unknown, not no. Claude Code (code.claude.com plus the support cheatsheet) is a separate coding tool: Esc interrupt, Enter queues a steering message, /rewind and Esc Esc, /branch and --fork-session, fork from an earlier message in the browser (Pro, Max, Ultra, Team, Enterprise), checkpoints in VS Code. Codex (learn.chatgpt.com) is a separate coding tool: fork a thread from any turn, revert thread history, steer or interrupt a turn, edit or reorder queued messages, fork a chat from an earlier message on desktop. The coding tools connect to the chat products only through shared accounts and Remote Control; their pages are not evidence for chat behaviour. Plan limits: Branch in new chat lists Free, Go, Plus, Pro; the retry menu with Thinking or Pro lists paid plans; Claude Code browser fork lists paid plans.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-editing-regeneration-and-branching-01](#cap-editing-regeneration-and-branching-01) | Edit a sent message and resubmit | partly | yes | partly built | seen working by a person |
| [CAP-editing-regeneration-and-branching-02](#cap-editing-regeneration-and-branching-02) | Edit a sent message that has attachments | unknown | yes | partly built | code inspected only |
| [CAP-editing-regeneration-and-branching-03](#cap-editing-regeneration-and-branching-03) | Versions of an edited message, with a pager | partly | unknown | partly built | seen working by a person |
| [CAP-editing-regeneration-and-branching-04](#cap-editing-regeneration-and-branching-04) | Retry or regenerate a response | unknown | yes | partly built | seen working by a person |
| [CAP-editing-regeneration-and-branching-05](#cap-editing-regeneration-and-branching-05) | Regenerate with a different model | unknown | yes | partly built | seen working by a person |
| [CAP-editing-regeneration-and-branching-06](#cap-editing-regeneration-and-branching-06) | Regenerate with web search | unknown | yes | not built | not verified |
| [CAP-editing-regeneration-and-branching-07](#cap-editing-regeneration-and-branching-07) | Retry a failed send or failed answer in place | unknown | yes | partly built | seen failing by a person |
| [CAP-editing-regeneration-and-branching-08](#cap-editing-regeneration-and-branching-08) | Resend a message unchanged | unknown | unknown | built | code inspected only |
| [CAP-editing-regeneration-and-branching-09](#cap-editing-regeneration-and-branching-09) | Branch a conversation into a new chat from a message | no | yes | partly built | seen failing by a person |
| [CAP-editing-regeneration-and-branching-10](#cap-editing-regeneration-and-branching-10) | Branch tree: see and switch between branches | unknown | unknown | partly built | code inspected only |
| [CAP-editing-regeneration-and-branching-11](#cap-editing-regeneration-and-branching-11) | Stop generation | yes | yes | built | seen working by a person |
| [CAP-editing-regeneration-and-branching-12](#cap-editing-regeneration-and-branching-12) | Stopped state keeps partial text and offers Try again | unknown | partly | built | seen working by a person |
| [CAP-editing-regeneration-and-branching-13](#cap-editing-regeneration-and-branching-13) | Continue a cut-off answer | unknown | unknown | partly built | seen working by a person |
| [CAP-editing-regeneration-and-branching-14](#cap-editing-regeneration-and-branching-14) | Send, queue or steer while a reply is running | yes | yes | partly built | code inspected only |
| [CAP-editing-regeneration-and-branching-15](#cap-editing-regeneration-and-branching-15) | Interrupt a long research or agent run and add context | unknown | yes | partly built | seen failing by a person |
| [CAP-editing-regeneration-and-branching-16](#cap-editing-regeneration-and-branching-16) | Rewind conversation and code to an earlier point | yes | yes | partly built | code inspected only |
| [CAP-editing-regeneration-and-branching-17](#cap-editing-regeneration-and-branching-17) | Fork or branch a coding session | yes | yes | partly built | code inspected only |
| [CAP-editing-regeneration-and-branching-18](#cap-editing-regeneration-and-branching-18) | Edit and retry after a flagged message | yes | unknown | not built | not verified |
| [CAP-editing-regeneration-and-branching-19](#cap-editing-regeneration-and-branching-19) | Edit, retry and branch keep the Local boundary | no | no | partly built | code inspected only |

## CAP-editing-regeneration-and-branching-01 Edit a sent message and resubmit

The user changes the text of a message already sent and resubmits it. The assistant answers the new text.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat): partly**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Edit an earlier message to create a different version of the chat, with its own artifacts. Apps: web, desktop.
  - [https://support.claude.com/en/articles/15363606-why-claude-switched-models-in-your-conversation-with-fable-models](https://support.claude.com/en/articles/15363606-why-claude-switched-models-in-your-conversation-with-fable-models): With automatic model switching off, a blocked request pauses the chat and you can edit your message and retry. Catalogue id ch04:125 lists web, desktop, iOS, Android, CLI. Apps: web, desktop, iOS, Android, CLI.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): iOS long-press a message for Copy and Edit (Feb-Mar 2025); Jun 8, 2026 iOS and Android edit flow. Apps: iOS, Android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 6.2 (Edit/resend); docs/product/experience-contract.md section 8.2). Every chat surface lets a user edit a sent message and resubmit it, or states why it cannot (the contract says edit/resend, or an explicit gate).

**With different models, providers and the one subscription.** The edited turn runs on the conversation's current model and provider, or the one the user picks. It counts against the same subscription usage and limits as a new message and shows the same limit or upgrade state when blocked. In Local mode the edit runs only on the local model and makes no cloud call.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web done, Desktop done, Mobile done; CLI, VS Code and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S16.08
- Comparison list ids: none matched; rows without an id: comparison-web.csv 'Edit a sent message' (no id); comparison-mobile.csv 'Edit a sent message' (no id); comparison-chrome.csv 'Edit a message you already sent' (no id, Missing)
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:3734`; `apps/web/features/chat/components/messages/EditableMessage.tsx:148`; `apps/web/features/chat/pages/WebChatPage.tsx:5517`; `apps/mobile/src/features/chat/components/MessageBubble.tsx:1644`

**Gap.** No edit in CLI, VS Code or Chrome side panel. Web chat title still shows the old text after the first message is edited (defect seen).

**Acceptance criteria**

1. Send a message, press Edit, change the text, press Save and Retry: a new answer appears for the new text.
2. Press Cancel in the edit box: the original text and answer stay.
3. In a Local chat, edit and resubmit with the network off: the answer arrives and no cloud request is made.
4. At the usage limit, Save and Retry shows the same limit or upgrade message as a new send.
5. After the first message is edited, the conversation title updates or is regenerated.

**Verification: seen working by a person.** 5-results/basics/scorecards/web.csv rows W-3 (browser, free 20261124T2330Z and subscribed 20261124T1946Z): edit to VELA-75 with Save & Retry worked; Cancel kept the original. 6-defects/web-problems-seen-in-browser.csv W-3: chat title keeps the old code after edit. Not seen on Mobile, CLI, VS Code, Chrome.

## CAP-editing-regeneration-and-branching-02 Edit a sent message that has attachments

A message that carries images or files can be edited without re-attaching them.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat): unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Feb 27, 2026: web edits image prompts; Jun 8, 2026: iOS edits prompts that include attachments, Android clearer edit flow. Apps: web, iOS, Android.
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Messages with images can be edited without starting over. Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Editing a message keeps its attachments and sends them with the edited text.

**With different models, providers and the one subscription.** If the model chosen for the edit cannot read the attachment type, the app says so before sending and offers a capable model. Local mode: local models without vision or file support refuse with a capability message, and nothing is uploaded.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and Mobile carry attachments through the edit by code reading; other apps have no edit. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S16.03, S16.08
- Comparison list ids: none matched; rows without an id: comparison-web.csv 'Edit a sent message that has image attachments' (no id); comparison-mobile.csv 'Edit a sent message that has attachments' (no id)
- Code: `apps/web/features/chat/pages/WebChatPage.tsx:5584`; `apps/mobile/src/features/chat/components/MessageEditModal.tsx:17`

**Gap.** Not seen working by a person. Local-only attachment refusal on an edit not checked.

**Acceptance criteria**

1. Send a message with an image, edit the text, resubmit: the answer refers to the same image.
2. Edit with a model that cannot read images: a clear message names the limit before anything is sent.
3. In Local mode with a text-only local model, the edit shows a capability error and uploads nothing.

**Verification: code inspected only.** Code lines above; no scorecard row covers edit with attachments.

## CAP-editing-regeneration-and-branching-03 Versions of an edited message, with a pager

After an edit, the old and new versions both stay, and the user pages between them (for example 1 of 2). The thread follows the chosen version.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat): partly**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Editing an earlier message creates a different version of the chat so you can explore another direction without losing previous work. Apps: web, desktop.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 8.3 (branch graph, version ordinal, previous/next UI)). Message edits keep the earlier version, show a previous and next control, and replacing text in place is not allowed when later turns depend on it.

**With different models, providers and the one subscription.** Each version records the model and provider that answered it. Versions made in Local mode stay Local and are never synced to a cloud route without consent. Stored versions follow the same retention and sync rules on every app.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile done; CLI, VS Code, Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S103.07, S16.06, S16.11, S90.03
- Comparison list ids: none matched; rows without an id: comparison-web.csv 'Version arrows between edited or retried answers' (no id)
- Code: `apps/web/features/chat/components/messages/VariantPager.tsx:44`; `apps/web/features/chat/lib/message-variants-gate.ts:49`; `apps/mobile/src/features/chat/components/MessageBubble.tsx:1680`

**Gap.** Ledger lists an unfinished ui item for web and desktop. A build flag can switch versions off. No pager outside Web, Desktop, Mobile.

**Acceptance criteria**

1. After an edit a 2/2 pager shows; moving to 1/2 shows the original text and its answers.
2. Reload the page: both versions and the active one persist.
3. Later turns that followed the old text are hidden from the new version, not deleted.
4. The pager is reachable by keyboard and has an accessible name.

**Verification: seen working by a person.** scorecards/web.csv W-3 (free and subscribed): 2/2 pager appeared, 1/2 branch intact, both survived reload. 6-defects W-7: version counter wraps at 390 wide (image versions). Not seen on Mobile or Desktop.

## CAP-editing-regeneration-and-branching-04 Retry or regenerate a response

The user asks for a new answer to the same prompt. The new attempt replaces the view of the old one.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat): unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages): For a failed response, click the Regenerate button; or click Stop generating, then Regenerate to retry. Apps: web.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Mar 17, 2026: the three-dot retry menu regenerates with Thinking or Pro. Plans: Plus, Pro, Business, Enterprise, Edu. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 6.2 (Retry/regenerate); M-CHAT-005 (copy and retry at minimum, works after reload)). Every chat surface offers regenerate on a finished answer, or gates it with a reason.

**With different models, providers and the one subscription.** Regenerate reuses the conversation's route unless the user chooses another model. It spends usage like a new message. Local mode: regenerate stays on the local model; nothing leaves the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile, VS Code, Chrome done; CLI missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S17.19, S90.03
- Comparison list ids: none matched; rows without an id: comparison-web.csv 'Retry a response' (no id); comparison-mobile.csv 'Regenerate or retry a reply' (no id)
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:3878`; `apps/web/features/chat/pages/WebChatPage.tsx:4437`; `apps/mobile/stores/chat/chatExecutionStore.ts:2931`; `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1008`

**Gap.** No regenerate in the CLI chat. Retry after a failed answer re-ran the first turn on web (defect).

**Acceptance criteria**

1. Press Try again on a finished answer: a new full answer appears and the old one stays reachable.
2. Reload after regenerate: the new answer persists.
3. Regenerate a Local answer with the network off: it succeeds on the local model only.
4. Regenerate on a long chat acts on the chosen turn, not the first turn.

**Verification: seen working by a person.** scorecards/web.csv W-3: Try again gave a fresh full answer, stopped version kept as 1/2. 6-defects W-9 subscribed: Retry on a failed turn regenerated the first message and hid later turns (seen failing). Other apps not seen.

## CAP-editing-regeneration-and-branching-05 Regenerate with a different model

From an answer, the user picks another model and gets a new attempt in one step.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat): unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Retry menu regenerates with Thinking or Pro via the three-dot menu. Plans: Plus, Pro, Business, Enterprise, Edu. Apps: web, iOS, android listed in id oh01:258.

**AGI requirement** (inferred; source: competitor parity; docs/product/definition.md (model agnostic)). A Try again with menu lists the models the user may use and runs the attempt on the chosen one.

**With different models, providers and the one subscription.** List comes from the model catalog, not a call site. Locked models show the upgrade path and spend nothing. A Local conversation does not offer cloud models, and a cloud chat does not offer local ones, unless the user starts an explicit fork (definition.md trust modes).

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile, Chrome done; CLI and VS Code missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S17.22
- Comparison list ids: none matched; rows without an id: comparison-web.csv 'Retry with a different model (Switch model)' (no id)
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:3878-3910`; `apps/web/features/chat/pages/WebChatPage.tsx:4580`; `apps/extension/src/features/side-panel/bubbles.ts:396`

**Gap.** Whether Local chats hide cloud models in this menu was not checked.

**Acceptance criteria**

1. Open Try again, choose another model: the new answer is labelled with that model.
2. Choose a locked model: the upgrade dialog opens and no credit is spent.
3. In a Local chat the menu offers no cloud model.

**Verification: seen working by a person.** scorecards/web.csv W-3 subscribed: regenerate opened a menu with Try again and a model list; Try again worked. Model choice from the menu not recorded.

## CAP-editing-regeneration-and-branching-06 Regenerate with web search

The user retries an answer and forces web results.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat): unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt): To regenerate an existing response with web results, select the refresh control and choose Try again or Search the web, when available. Apps: web, iOS, Android, desktop.
  - [https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu](https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu): Where available, the refresh icon then Try again retries the answer with web results. Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Retry offers a search option wherever web search exists.

**With different models, providers and the one subscription.** Web search is a provider route or an AGI harness feature, not a model trait. Offer it only when the chosen route has it, and count it in usage. Local mode: not offered unless a local search tool is set up and the boundary label says so.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web partial: search can only be forced on a new message with /search. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP61
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:3878-3910`

**Gap.** No search choice in the retry menu on any app.

**Acceptance criteria**

1. Retry menu shows Search the web when search is available for the route.
2. Choosing it returns an answer with sources.
3. Menu hides it when the route has no search, with no dead control.

**Verification: not verified.** Missing list results/missing/partial-web.md WP61 says search only via /search.

## CAP-editing-regeneration-and-branching-07 Retry a failed send or failed answer in place

When a message fails to send or a turn returns nothing, the user presses Retry and the failure is replaced by the new outcome. The draft is not lost.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat): unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Mar 18, 2025: retry failed messages in place; unsent text in the prompt is saved. Apps: web, desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md M-CHAT-008; docs/product/experience-contract.md principle 8 (retry and cancellation states)). Errors are readable, never silent, no message is erased, and a failed turn offers Retry that re-runs that turn.

**With different models, providers and the one subscription.** The error names the cause: limit reached, plan ended, provider error, local model missing. Retry never silently switches provider or leaves Local. Usage is not charged twice for one failed turn.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile, VS Code, Chrome done; CLI missing for send retry. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S16.15, S16.16, S17.20, S17.40, S91.26
- Comparison list ids: none matched
- Code: `apps/web/lib/hooks/useChatStream.ts:4966`; `apps/web/lib/hooks/useChatStream.ts:5043`; `apps/mobile/stores/chat/chatExecutionStore.ts:2986`; `apps/extension/src/features/side-panel/bubbles.ts:198`

**Gap.** Defects seen on web: Retry re-ran turn 1 instead of the failed turn; limit denial shows a raw 'Error:' line with no upgrade path; reload mid-answer shows a misleading banner.

**Acceptance criteria**

1. Block the network, send: the draft stays and a failed state with Retry shows; Retry after reconnect sends it once.
2. Press Retry on the last failed turn of a three-turn chat: only that turn re-runs.
3. At the usage limit the failure shows the upgrade or reset path, not a raw error.
4. Reload mid-answer: the turn shows a true state, not 'no response'.

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv W-9 subscribed (Retry regenerates the first message), W-19 subscribed (raw Error with no upgrade path), W-3 free (misleading banner after mid-stream reload). Offline draft kept and sent: seen working in scorecards W-2, W-3.

## CAP-editing-regeneration-and-branching-08 Resend a message unchanged

A sent message can be sent again as is from the message itself, to get a fresh reply.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat): unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI ledger S16.09; no competitor page in the catalogue). A sent message offers resend where regenerate on the answer is not enough.

**With different models, providers and the one subscription.** Same route and usage rules as regenerate. Local mode stays local.

**Current implementation, as this trace read it on 2026-11-24: built.** Done on all six apps by ledger. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S16.09
- Comparison list ids: none matched; rows without an id: comparison-web.csv 'Retry and copy on your own message' (no id)
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:3037`; `apps/cli/src/tui/tui_app.rs:2726`; `apps/mobile/src/features/chat/components/MessageBubble.tsx:847`

**Gap.** none known

**Acceptance criteria**

1. Press resend on a sent message: a new reply appears and the original message is not duplicated.
2. Works after reload and in Local mode with the network off.

**Verification: code inspected only.** Ledger and code lines; no scorecard covers it.

## CAP-editing-regeneration-and-branching-09 Branch a conversation into a new chat from a message

From a chosen message the user starts a new conversation that holds the thread up to that point. The original is unchanged.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat): no**
  - [https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude): Current limitations: branching a conversation from an earlier point isn't available (unified Cowork and Chat experience). Apps: web, desktop, iOS, Android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Sep 4, 2025: the message More actions menu lets you fork a conversation from that point; web, all logged-in users. Plans: Free, Go, Plus, Pro. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 9.2 (Conversation Branching); docs/product/definition.md (Local thread remains Local forever)). AGI supports branches so alternate attempts are safe, and a Local to BYOK or Cloud move is a new branch that keeps the Local original.

**With different models, providers and the one subscription.** Branch metadata records source session, selected context, trust change, provider and model change, redaction result and consent time. A branch can use a different model. A Local branch stays Local; moving to BYOK or Cloud is an explicit fork with consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, CLI, VS Code done; Chrome missing; Mobile has the action in code but the ledger and an owner decision say off the phone. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S16.10, S17.27, S62.17, S72.13
- Comparison list ids: none matched; rows without an id: comparison-web.csv 'Branch in new chat' (no id); comparison-mobile.csv 'Branch a chat from an earlier message' (no id, marked Better); comparison-vscode.csv 'Fork a conversation' (no id); comparison-cli.csv 'Fork a session at a turn' (no id)
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:4014`; `apps/web/features/chat/hooks/use-conversation-branches.ts:103`; `apps/web/app/api/chat/conversations/[id]/branches/route.ts:52`; `apps/mobile/src/features/chat/components/MessageBubble.tsx:1669`; `apps/mobile/app/(app)/chat/[id].tsx:2589`; `apps/cli/src/tui/tui_app.rs:5955`

**Gap.** Mobile code ships Branch Conversation from Here although decision D-2026-09-28-15 keeps branching off the phone. Chrome has none. A web console 404 on the branches request was seen on the first turn.

**Acceptance criteria**

1. Choose Branch conversation from here on message 3 of 5: a new chat holds messages 1 to 3 and the original still has 5.
2. Edit the branch: the original is unchanged.
3. Branch a Local chat: the branch is Local and shows the Local label.
4. Branch is refused or confirmed with consent when it would cross to BYOK or Cloud.

**Verification: seen failing by a person.** 6-defects W-8 subscribed: console 404 for the conversation branches request during the first turn. No scorecard row exercises Branch in new chat.

## CAP-editing-regeneration-and-branching-10 Branch tree: see and switch between branches

A conversation with branches lets the user see them and move between them.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat): unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 8.3 (active branch pointer, previous/next branch UI)). A branched conversation shows its branches and the active one, with previous and next.

**With different models, providers and the one subscription.** Each branch shows its model, provider and Local, BYOK or Cloud label. Switching branches never changes the trust mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile done; CLI, VS Code, Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S18.17, S90.04
- Comparison list ids: none matched
- Code: `apps/web/features/chat/hooks/use-conversation-branches.ts:103`

**Gap.** No branch navigation in CLI, VS Code, Chrome.

**Acceptance criteria**

1. After branching, the parent and branch both appear and open.
2. The active branch is marked.
3. Reload keeps the active branch.

**Verification: code inspected only.** Ledger S18.17 and code line; not in the scorecards.

## CAP-editing-regeneration-and-branching-11 Stop generation

A visible control and a key end a reply that is running. What arrived stays.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/interactive-mode.md](https://code.claude.com/docs/en/interactive-mode.md): Esc stops the current response while keeping work done; Ctrl+C interrupts a running operation. Apps: cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Early releases added stop generating (Dec 2022-Jan 2023). Plans: Free. Apps: web.
  - [https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes](https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes): Command+. stops a streaming response. Apps: desktop (macOS).

**AGI requirement** (stated requirement; source: docs/product/requirements.md M-CHAT-003, M-CHAT-004; local test table 'Stop generation: stream stops cleanly'). While a reply runs, send turns into stop. Stop ends the stream, records an interrupted state, and the UI recovers. Local chat stop must stop the local model.

**With different models, providers and the one subscription.** Stop cancels the provider call or the local runtime, not only the screen. Usage for what was produced is settled the same way on every app (see unresolved choices). Local mode: no network involved.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, Desktop, Mobile, CLI, VS Code, Chrome done by ledger. Web defects: false limit banner after stop; stray row. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S13.07, S19.17, S19.18, S91.24, S92.20
- Comparison list ids: none matched; rows without an id: comparison-web.csv 'Stop button and Escape to stop' (no id); comparison-chrome.csv 'Send and Stop buttons' (no id)
- Code: `apps/web/features/chat/components/Composer/SendButton.tsx:40`; `packages/ui/unified-chat/src/lib/shortcutRegistry.ts:85`; `packages/ui/unified-chat/src/lib/shortcutRegistry.ts:199`

**Gap.** Web defects seen: false 'Free limit reached' banner after Stop; empty 'Writing response' row stays; an 'Agent run failed' notification after Stop; a stopped answer returns longer after reload; cloud task Stop adds 'model failed' text.

**Acceptance criteria**

1. Press Stop halfway through a long answer: streaming halts at once and the partial text stays.
2. Reload: the answer shows what the user saw at stop, with a stopped note.
3. Press Stop: no limit banner, no failure notification, no leftover progress row.
4. Stop in Local mode ends the local model run (CPU use falls).

**Verification: seen working by a person.** scorecards/web.csv W-1 to W-6 (free and subscribed): Stop halted the answer, kept partial text, showed Response stopped and Try again. 6-defects: W-2, W-5, W-19 false limit banner; W-1 stray row and notification; W-4 and W-19 text differs after reload.

## CAP-editing-regeneration-and-branching-12 Stopped state keeps partial text and offers Try again

A stopped or interrupted answer is marked as stopped, keeps what arrived, and offers retry or continue.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat): unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages](https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages): Click Stop generating, then Regenerate to retry. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md M-CHAT-004; docs/product/experience-contract.md principle 8). Interrupted state is recorded and the UI recovers; the stopped answer is not erased.

**With different models, providers and the one subscription.** Partial text keeps its model and provider label. Try again follows the regenerate rules. Local partial answers stay on the device.

**Current implementation, as this trace read it on 2026-11-24: built.** Done on all six apps by ledger. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S17.37, S17.39, S19.18
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/messages/ChatMessageList.tsx:1758`; `apps/mobile/src/features/chat/components/MessageBubble.tsx:1528`; `apps/cli/src/tui/tui_app.rs:5240`

**Gap.** Two retry controls appear together on a stopped web answer; stopped artifact shows raw HTML in chat.

**Acceptance criteria**

1. Stop an answer, reload: Response stopped and Try again still show with the partial text.
2. Stopped artifact turns still render as an artifact card, not raw code.
3. Only one retry control is shown.

**Verification: seen working by a person.** scorecards/web.csv W-2, W-3, W-6, W-8. 6-defects W-8 (raw HTML after Stop), W-3 free (two retry controls).

## CAP-editing-regeneration-and-branching-13 Continue a cut-off answer

An answer ended by a length limit or a reload offers Continue, which resumes the same answer.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat): unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI ledger S17.21; the contract lists Continue as a message action (experience-contract.md section 8.2)). Continue resumes the same answer without a new charge for the text already produced.

**With different models, providers and the one subscription.** Continue goes to the same route. If that model is no longer available, the app says so rather than switching silently.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile, CLI done; VS Code and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S17.21
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/messages/ChatMessageList.tsx:1744`; `apps/mobile/src/features/chat/utils/continuableAnswer.ts:19`; `apps/cli/src/claude_parity.rs:131`

**Gap.** Missing in VS Code and Chrome.

**Acceptance criteria**

1. Reload mid-answer: Continue generating shows and finishes the same answer.
2. No duplicate paragraph at the join.

**Verification: seen working by a person.** scorecards/web.csv W-6 subscribed and W-8 subscribed: Continue generating finished the answer after a mid-stream reload.

## CAP-editing-regeneration-and-branching-14 Send, queue or steer while a reply is running

A message typed during a run either waits for the next run (queue) or redirects the current run (steer). Queued messages can be edited, reordered or removed.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/how-claude-code-works.md](https://code.claude.com/docs/en/how-claude-code-works.md): Esc cancels the running tool call; typing and pressing Enter queues a steering message read after current tool calls finish. Apps: cli.
  - [https://code.claude.com/docs/en/interactive-mode.md](https://code.claude.com/docs/en/interactive-mode.md): Up from the first line pulls queued messages into the input box for editing. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/prompting.md](https://learn.chatgpt.com/docs/prompting.md): Queued follow-ups show above the composer with edit, reorder, send and delete controls. Apps: desktop.
  - [https://learn.chatgpt.com/docs/developer-settings.md](https://learn.chatgpt.com/docs/developer-settings.md): chatgpt.followUpQueueMode: queue (default) or steer; Cmd/Ctrl+Shift+Enter inverts it for one message. Apps: ide.

**AGI requirement** (inferred; source: competitor parity (coding tools); AGI ledger S13.38 to S13.40). A message sent during a run is queued or steers it, is shown as queued, and can be edited or cancelled before it goes out.

**With different models, providers and the one subscription.** Steering text goes to the same model and route as the run. Queued messages count against usage only when sent. Local mode: queued and steering text never leave the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Queue: Web, Desktop, Mobile, VS Code done; CLI and Chrome missing in ledger (comparison says CLI partial, Chrome better). Steering: all six done. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S13.38, S13.39, S13.40, S16.17, S60.20
- Comparison list ids: CP180, CP21, CP27; rows without an id: comparison-chrome.csv 'Queue follow-up messages while a reply runs' (no id)
- Code: `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3733`; `apps/mobile/src/features/chat/components/ChatInput.tsx:1141`; `apps/cli/src/tui/tui_app.rs:8423`; `apps/extension/src/side_panel.ts:14687`

**Gap.** Ledger and comparison disagree on Chrome queue (ledger missing, comparison Better with code). CLI queue is partial.

**Acceptance criteria**

1. Send a message during a run: it shows as queued and sends when the run ends.
2. Edit or delete the queued message before it sends.
3. Steering text during an agent task changes its next step without stopping it.

**Verification: code inspected only.** Ledger and code lines; no scorecard row covers queue or steer in chat.

## CAP-editing-regeneration-and-branching-15 Interrupt a long research or agent run and add context

During a long run the user can change focus or add information without restarting.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat): unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Review and edit a proposed plan, follow progress and interrupt to change focus or sources. Plans: Varies by plan. Apps: web, iOS, Android.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Nov 5, 2025: click update in the sidebar and send new info without restarting. Apps: web.

**AGI requirement** (inferred; source: competitor parity; AGI ledger S35.15, S60.20, S60.23). Long runs accept new guidance and can be cancelled on the server.

**With different models, providers and the one subscription.** Cancel stops provider calls and tools. Cloud runs are labelled as needing our servers; local runs stay on device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Task steering and cancel done on Web, Desktop, Mobile, CLI, VS Code; Chrome unverified. Desktop interrupt/steer partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S35.15, S35.18, S60.20, S60.23
- Comparison list ids: DP72
- Code: `apps/web/features/code/components/CodeComposer.tsx:1752`; `apps/mobile/src/features/tasks/components/CloudRunSteerSection.tsx`

**Gap.** Desktop comparison marks interrupt and steer partial; Chrome unverified. A cloud task page showed a stale 'model failed' line after Stop.

**Acceptance criteria**

1. Start a research run, send new info: the plan updates without restarting.
2. Press Stop on a cloud run: it ends, steps stay visible, no false error text.

**Verification: seen failing by a person.** 6-defects W-18 subscribed: Stop leaves 'The model failed to produce a response' in the transcript. Steering not seen by a person.

## CAP-editing-regeneration-and-branching-16 Rewind conversation and code to an earlier point

A coding tool rolls the conversation, the code, or both back to an earlier prompt or checkpoint.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/interactive-mode.md](https://code.claude.com/docs/en/interactive-mode.md): Double Esc on empty input opens the rewind menu to restore code and conversation. Apps: cli.
  - [https://code.claude.com/docs/en/vs-code.md](https://code.claude.com/docs/en/vs-code.md): Hover a message to fork conversation, rewind code, or both. Apps: ide.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/app-server.md](https://learn.chatgpt.com/docs/app-server.md): Revert thread history to before a turn: removes a turn and later turns without undoing local file changes. Apps: cli, desktop, ide.

**AGI requirement** (inferred; source: competitor parity (coding tools); AGI ledger S66.22, S66.23). Developer surfaces let the user restore conversation, code or both to a checkpoint.

**With different models, providers and the one subscription.** Restore does not change the provider or the trust mode. Code restore moves removed files to Trash first (AGENTS.md section 9). Checkpoints stay local.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI and VS Code done; Web and Desktop missing; Mobile missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S66.22, S66.23, S92.25, S99.14
- Comparison list ids: C48, C49, CP149; rows without an id: comparison-vscode.csv 'Rewind code, the conversation or both to an earlier prompt' (no id)
- Code: `apps/cli/src/tui/tui_app.rs:5986`; `apps/cli/src/tui/tui_app.rs:3927`; `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3139`

**Gap.** No rewind on the web or desktop Code views. CLI lacks a summarize-from-here option and retention settings.

**Acceptance criteria**

1. Press Esc twice in the CLI and pick a checkpoint: conversation and files return to that point.
2. Rewind in VS Code restores code, conversation, or both as chosen.
3. Deleted files from a rewind are recoverable from Trash.

**Verification: code inspected only.** Ledger and code lines; no person-run result.

## CAP-editing-regeneration-and-branching-17 Fork or branch a coding session

Copy a coding session into a new one and continue separately; the original stays.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/sessions.md](https://code.claude.com/docs/en/sessions.md): /branch copies the conversation so far into a new session, leaving the original intact; --fork-session when resuming. Apps: cli.
  - [https://code.claude.com/docs/en/remote-control.md](https://code.claude.com/docs/en/remote-control.md): Fork the whole session or from an earlier message at claude.ai/code into a new session while the original continues. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/app-server.md](https://learn.chatgpt.com/docs/app-server.md): Fork a conversation from any turn (or ephemerally). Apps: cli, desktop, ide.
  - [https://learn.chatgpt.com/docs/whats-new.md](https://learn.chatgpt.com/docs/whats-new.md): Fork a chat from an earlier message to try another approach while keeping the original. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 9.2 and the developer session list; definition.md developer continuity). Developer sessions support new, resume and fork, with fork carrying chosen context.

**With different models, providers and the one subscription.** A fork keeps its own route and permissions. A Local session forked to Cloud is an explicit fork with consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI done; VS Code done; Web and Desktop Code: Fork a coding session from the browser partial; Mobile missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S62.16, S62.17, S72.13
- Comparison list ids: CP68, WP200; rows without an id: comparison-cli.csv 'Slash commands /fork and /branch' (no id)
- Code: `apps/cli/src/lib.rs:1931`; `apps/cli/src/tui/tui_app.rs:5955`; `apps/web/features/code/CloudCodePage.tsx:1876`

**Gap.** Background fork is missing on web, desktop, mobile. Web fork is partial.

**Acceptance criteria**

1. Run /fork in the CLI: a new session holds the history and the original is listed and intact.
2. Fork a cloud code session from an earlier message in the browser: the original keeps running.

**Verification: code inspected only.** Ledger and code lines; not in the web scorecards.

## CAP-editing-regeneration-and-branching-18 Edit and retry after a flagged message

When a message is blocked and automatic model switching is off, the chat pauses and the user can edit the message and retry, or send it to another model.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat) and Claude Code: yes**
  - [https://support.claude.com/en/articles/15363606-why-claude-switched-models-in-your-conversation-with-fable-models](https://support.claude.com/en/articles/15363606-why-claude-switched-models-in-your-conversation-with-fable-models): With switching off, a blocked request pauses the chat; edit your message and retry, or send the same message to a less capable model manually. Apps: web, desktop, iOS, Android, CLI.
  - [https://code.claude.com/docs/en/model-config.md](https://code.claude.com/docs/en/model-config.md): Switch models when a message is flagged: Ask each time pauses to switch or edit the prompt; mobile cloud sessions cannot edit and retry. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: AGI missing list WP58 and W320; competitor parity (Claude only)). When a provider blocks or refuses a turn, the user can edit and retry or choose another model, and nothing switches silently.

**With different models, providers and the one subscription.** Fits model-agnostic routing: the app shows which provider blocked and offers other models from the catalog. Never auto-crosses the Local boundary.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web: no setting to turn model switching on or off (WP58 partial); not built elsewhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP58
- Code: `results/missing/partial-web.md line for WP58 (in leader-docs results)` (not found)

**Gap.** No flagged-message setting or label on any app.

**Acceptance criteria**

1. A refused turn shows Edit and retry and a model choice.
2. The provider that refused is named.
3. No automatic switch happens unless the user turned it on.

**Verification: not verified.** No person-run result.

## CAP-editing-regeneration-and-branching-19 Edit, retry and branch keep the Local boundary

AGI-specific: every edit, retry, version and branch of a Local conversation stays on the local route unless the user makes an explicit fork.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (chat): no**
  - no page found in the saved documentation
- **ChatGPT: no**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: AGENTS.md section 6; docs/product/definition.md trust modes; requirements.md M-CHAT-002 and M-CLOUD-005). Nothing silently routes a Local chat, file or session to BYOK or managed cloud; Local to BYOK is an explicit fork with consent and a visible label.

**With different models, providers and the one subscription.** Applies to regenerate, regenerate with another model, edit, Continue and branch. Cloud models are not offered inside a Local chat, and a Local turn cannot be added to a cloud chat. Sign-in is a separate matter from payment.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has guards on image routing, retry and cloud chat sends. Desktop shows the web app. Mobile and others not checked. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S18.10
- Comparison list ids: none matched
- Code: `apps/web/lib/hooks/useChatStream.ts:4200`; `apps/web/features/chat/pages/WebChatPage.tsx:4571`; `apps/web/features/chat/pages/WebChatPage.tsx:4443`

**Gap.** Regenerate-with-model menu content in a Local chat, and Local retry on Mobile, were not checked.

**Acceptance criteria**

1. In a Local chat, no cloud model appears in the Try again with menu.
2. Edit then resubmit a Local message with the network off: the answer comes from the local model.
3. Send a Local-turn chat to a cloud model: it is refused with an explanation, and an explicit fork is offered.
4. Branch a Local chat: the branch is Local.

**Verification: code inspected only.** Guard code lines above; no person-run Local test of retry.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether Mobile keeps Branch Conversation from Here: code ships it, but owner decision D-2026-09-28-15 keeps branching off the phone because the leaders did not offer it there. The ChatGPT note of 2025-09-04 lists web only; Claude documents none.
- Whether to match Claude's documented limit (no branching from an earlier point in the unified Cowork and Chat experience) or keep ChatGPT-style branching everywhere.
- Whether a stopped partial answer is billed, and how usage is settled for stop and regenerate on every app.
- Whether to add search-on-retry (ChatGPT only) and the flagged-message edit-and-retry setting (Claude only).
- Whether CLI, VS Code and Chrome get message edit, or stay gated with a stated reason.
- Whether rewind and checkpoints should exist in Web and Desktop Code views, as both coding tools have them.
- Whether to keep the build flag that can switch message versions off.

## Could not establish

- The catalogue has no Claude chat page on retry, regenerate, stop, response versions or edit of a sent message (other than edit-to-branch for artifacts and flagged-message edit and retry), so those are unknown, not absent. The web pages were not read live; the AGI comparison csv shows Claude 'Yes' for several of these from an older comparison document, which this page does not use.
- ChatGPT page for editing a message was not found in the saved help pages; edit evidence is release-note lines only.
- The ChatGPT note on plan limits for edit is not stated; Branch in new chat lists Free, Go, Plus, Pro.
- No person-run result exists for Desktop (Electron), Mobile, CLI, VS Code or Chrome on these features. The web scorecards were recorded by tool-driven testers on a local build and say they compared 'from my own knowledge', so their leader comparisons are not evidence.
- Desktop has no comparison rows for this topic; the ledger marks it done because Electron shows the hosted web app.
- Ledger status for Mobile branch is blank for S16.10 and S17.27 and missing for S62.17, while code and the comparison csv show the action; I did not resolve which is right.
- Whether Local-mode retry and regenerate on Mobile and Desktop stay on the local model was not run.
- Billing treatment of stopped and regenerated turns was not found in docs/product/commercial.md for this topic.
