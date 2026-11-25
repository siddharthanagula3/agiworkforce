---
id: "F017-06"
type: "feature"
title: "Regenerate, retry, continue, branch and answer versions"
aliases: ["Regenerate, retry, continue, branch and answer versions", "Regenerate response", "Try again", "Retry with Another Model", "Continue generating", "Branch conversation from here", "Variant pager", "Response N of M", "S17.19", "S17.20", "S17.21", "S17.22", "S17.27", "S17.28"]
area: "17 Assistant-message components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "seen failing", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S17.19", "S17.20", "S17.21", "S17.22", "S17.27", "S17.28"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:own-key", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F017-06 Regenerate, retry, continue, branch and answer versions

Lets the person re-run an answer, retry a failed or stopped one, continue a cut-off answer, switch the model for a retry, branch a new chat from an answer, and page through attempts. Built on web and mobile; the CLI, VS Code and Chrome cover only some of it.

Area: [17. Assistant-message components](README.md). Requirement items: [S17.19](../../10-requirements/capabilities/017-assistant-message-components.md#s1719), [S17.20](../../10-requirements/capabilities/017-assistant-message-components.md#s1720), [S17.21](../../10-requirements/capabilities/017-assistant-message-components.md#s1721), [S17.22](../../10-requirements/capabilities/017-assistant-message-components.md#s1722), [S17.27](../../10-requirements/capabilities/017-assistant-message-components.md#s1727), [S17.28](../../10-requirements/capabilities/017-assistant-message-components.md#s1728).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen failing |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the person controls to get another attempt, finish a truncated answer, fork the chat at an answer and compare attempts.

**Why it exists.** Models fail, stop at output limits or give weak answers; people need recovery without retyping.

**Who uses it.** Anyone who gets a failed, partial, stopped or unsatisfying answer.

**Problems it solves**

- Failed or interrupted turns
- Answers cut at the output limit
- Trying a different model on the same prompt
- Exploring a different path without losing the original

**Use cases**

- Press Regenerate response and pick Try again with another model.
- Press Continue generating after a length cutoff.
- Press Branch conversation from here to start a new chat from an answer.
- Use Previous response and Next response to page through tries.

## 2. User experience

**Where to find it**

- Web and Desktop: Regenerate response button or menu with Try again and Try again with <model> (MessageBubble.tsx:3871-3919); Branch conversation from here (3922-3944); version pager (apps/web/features/chat/components/messages/VariantPager.tsx labels Previous response, Next response, Response N of M); Continue generating button under the transcript (ChatMessageList.tsx:1938-1950); Retry in failure notices; Try again in Response stopped (1952-1963).
- Mobile: Regenerate response button (apps/mobile/src/features/chat/components/MessageBubble.tsx:3178-3185); sheet actions Retry, Retry with Another Model, Branch Conversation from Here (1654-1675); Continue generating button (2961-2989); VariantPager noun response (3130-3150).
- CLI: /continue (apps/cli/src/claude_parity.rs:185), retry of a failed tool call via the tools command (claude_parity.rs:1576), fork session option (apps/cli/src/lib.rs:327).
- VS Code: Regenerate button on the latest answer only, branch button, Retry in the error banner (webviewContent.ts:4817-4852, 4521-4525).
- Chrome: regenerate control with a model menu: Try again and Try again with (apps/extension/src/features/side-panel/bubbles.ts:567-606).

**Before you start**

- Not available while the conversation is streaming (web disabled flags; mobile WAIT_FOR_RESPONSE text, mobile MessageBubble.tsx:259).
- Branch needs a signed-in cloud conversation on web (POST to the branches endpoint) and is hidden in temporary chats on mobile (chat/[id].tsx:2589).
- Mobile Continue needs a Cloud conversation, a managed or Auto model, and not a free-allowance model (apps/mobile/src/features/chat/utils/continuableAnswer.ts).

**Screens and controls**

- Web Continue is hidden after a user Stop; that turn gets Response stopped. with Try again instead (ChatMessageList.tsx:1353-1366).
- Web regenerate hidden for image and video turns and while awaiting approval (MessageBubble.tsx:3865-3870).
- Web branch shows Creating branch… while working (3931-3941).

**Journey**

1. Person sees the answer, notice or error.
2. Presses Regenerate, Retry, Continue or Branch.
3. Regenerate adds a new attempt for the same question; the pager shows Response N of M.
4. Continue appends to the same answer; branch opens a new chat with history up to that answer.

**What the person sees and gets**

- Web toast Conversation branch created and navigation to the new chat (apps/web/features/chat/hooks/use-conversation-branches.ts createBranch).
- Failure reasons come from the taxonomy such as the answer reached this model's maximum length (ChatMessageList.tsx:108).
- Refusal notice with Retry (ChatMessageList.tsx:1967-1995).

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: regenerate in place with sibling variants, model override, retry, stop notice, refusal notice, continue and branch (apps/web/features/chat/pages/WebChatPage.tsx:5704, 5877, 6433, 7752; ChatMessageList.tsx:1355-1403, 1938-1997).
- Web continue appends to the same message (apps/web/lib/hooks/useChatStream.ts:4910-4985; WebChatPage.tsx:6430-6445).
- Mobile: retry, retry with another model, continue, branch (forkConversation with forkPointMessageId) and version pager (chat/[id].tsx:1316-1325, 1905-1925; mobile MessageBubble.tsx:1654-1675).
- VS Code: regenerate and branch from an answer via host commands (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1811-1815, 6017).
- Chrome: regenerate with model menu (bubbles.ts:567).

**Incomplete**

- CLI /continue sends a new prompt telling the model to continue where it stopped; it does not append to the same answer (claude_parity.rs:185-188).
- CLI has no regenerate or answer-level branch: fork works on a saved session with a flag (lib.rs:327, apps/cli/src/sessions.rs:953), not from an answer.
- VS Code regenerate only on the latest answer (CSS .message-action--regenerate hidden unless latest, webviewContent.ts:759-760); no continue.
- Chrome has no continue or branch (no hits in side-panel code searched).

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Branch from answer in Chrome; continue in VS Code and Chrome; model rewrite in CLI and VS Code (none found).

## 4. Required behaviour

**Established requirements**

- A completed answer can be regenerated in place, producing a new attempt. (source: brief S17.19)
- A failed answer shows Retry that re-runs the turn and replaces the failure. (source: brief S17.20)
- An answer cut off by the output limit offers Continue that resumes the same answer; a user Stop is not a cut-off. (source: brief S17.21)
- The user can regenerate with a different model in one step. (source: brief S17.22)
- Branching keeps history to that point and leaves the original unchanged. (source: brief S17.27)
- When an answer has several attempts the user can page between them. (source: brief S17.28)
- Retry and regenerate are chat requirements. (source: doc: docs/product/requirements.md)
- Regenerate must not silently cross from Local to BYOK; it fails closed with a visible reason. (source: doc: AGENTS.md section 6; code comment in WebChatPage.tsx near line 5745)

**Acceptance criteria**

1. Regenerate on web produces a new attempt and a Response 2 of 2 pager.
2. Choosing Try again with <model> re-answers with that model.
3. After a length cutoff, Continue generating appends text to the same message.
4. After a user Stop there is no Continue; the notice Response stopped. offers Try again.
5. Branch creates a new chat with history up to that answer and leaves the original unchanged.
6. Regenerate for a Local chat with a BYOK target model refuses with a visible reason.
7. Continue is blocked with an upgrade dialog when the trial is used up (web).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile Continue should not run for free-allowance turns because it would start a second billed answer [inferred from continuableAnswer.ts comment and the isFreeQuotaTurnModelId check].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make CLI /continue resume the same answer, or rename it.
- [proposed] Add branch and continue to Chrome and VS Code.
- [proposed] Hide web branch in temporary chats if that is required; no gate was found in web code.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble (web) controls | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Regenerate and model menu 3871-3919, branch 3922-3944. |
| component | ChatMessageList notices | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Continue, stopped, stream-error and refusal notices (1355-1403, 1938-1997). |
| component | VariantPager | `apps/web/features/chat/components/messages/VariantPager.tsx` | Previous response and Next response with N of M label. |
| hook | useChatStream.continueGeneration | `apps/web/lib/hooks/useChatStream.ts` | Resumes a truncated answer in the same message (4910); regenerate variants (895). |
| component | WebChatPage handlers | `apps/web/features/chat/pages/WebChatPage.tsx` | handleRegenerateMessage 5704, handleRegenerateWithModel 5877, handleContinueMessage 6433, onBranch 7752. |
| hook | useConversationBranches | `apps/web/features/chat/hooks/use-conversation-branches.ts` | createBranch posts to the branches endpoint. |
| endpoint | conversation branches | `apps/web/app/api/chat/conversations/[id]/branches/route.ts` | List and create branches. |
| service | continue-generation | `packages/ui/unified-chat/src/lib/continue-generation.ts` | isMessageContinuable, hasStreamError, CONTINUE_GENERATION_INSTRUCTION shared by web and mobile. |
| component | MessageBubble (mobile) controls | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Retry actions 1654-1675, Continue 2961, pager 3130-3150. |
| service | continuableCloudModel | `apps/mobile/src/features/chat/utils/continuableAnswer.ts` | Decides whether a mobile answer can be continued. |
| component | Mobile chat screen handlers | `apps/mobile/app/(app)/chat/[id].tsx` | handleContinueMessage 1919, handleBranchFromMessage 1316, retry handlers 1930+. |
| command | CLI /continue | `apps/cli/src/claude_parity.rs` | Sends a continue prompt (185). |
| command | VS Code regenerate and branch | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | regenerate 1811, branchAnswer 6017. |
| component | Chrome regenerate control | `apps/extension/src/features/side-panel/bubbles.ts` | buildRegenerateControl 567. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Regenerate; the page rolls back to the preceding user turn and re-sends it, as a new sibling variant. | device and our servers | WebChatPage.tsx:5704-5740; useChatStream.ts:4250-4272 |
| A boundary check refuses a regenerate that would move a Local chat to a BYOK model. | device | WebChatPage.tsx comment before resolveRegenerateBoundaryRefusal |
| Trial exhausted opens the upgrade dialog instead of running. | device | WebChatPage.tsx:5732-5735, 6436-6439 |
| The server streams a new answer from the chosen model and provider. | our servers | useChatStream.ts stream request |
| Continue sends the history through the truncated answer plus a continue instruction and appends the reply. | our servers | useChatStream.ts:4975-4985 (apiMessages slice), CONTINUE_GENERATION_INSTRUCTION export |
| Branch posts the message id and a request id to the branches endpoint and opens the new conversation. | our servers | use-conversation-branches.ts createBranch |
| Mobile branch calls forkConversation with the fork point message id. | device and our servers | chat/[id].tsx:1321-1322 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Variant siblings (parent message id) and branch conversations | Server message and conversation rows; branch groups read from the branches endpoint (use-conversation-branches.ts). Table names not opened. | Yes for cloud chats | Delete this response and what follows is a menu item with confirmation (MessageBubble.tsx:4096-4103). |

**Models and providers.** Regenerate re-uses the chat route with the same or a chosen model from regenerateModelOptions. Continue uses the model of the message (useChatStream.ts: message.model || selectedModel). Any catalog model; Local and BYOK keep their own boundary rules.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Branch needs sign-in (headers via getHeaders and CSRF). Mobile Continue needs Cloud mode. |
| Permissions | none found in the code beyond sign-in |
| Subscription | Web blocks regenerate and Continue with an upgrade dialog when trial is exhausted (WebChatPage.tsx:5732, 6436). Mobile excludes free-allowance models from Continue (continuableAnswer.ts, isFreeQuotaTurnModelId check). |
| Limits and metering | Each regenerate and continue is a new metered turn [inferred]; amounts unknown. |
| Feature flags | none found in the code |
| Model compatibility | Continue only for models and finish reasons that count as cut off (isContinuableFinishReason). |
| Provider restrictions | Local to BYOK crossing is refused. |
| Local mode | Web regenerate in a Local chat stays local and is refused for BYOK targets. Mobile Continue is not offered for local conversations (continuableAnswer.ts requires the cloud execution mode). Mobile retry works in local chats [inferred from retry action not gated by mode, mobile MessageBubble.tsx:1654]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming | Controls disabled or hidden. | MessageBubble.tsx:3715; mobile WAIT_FOR_RESPONSE 259 |
| User stopped | Response stopped. with Try again. | ChatMessageList.tsx:1952-1963 |
| Mid-stream failure | Stream error notice with reason and retry; mobile offers Switch model for some codes. | ChatMessageList.tsx:1380-1386; mobile MessageBubble.tsx:2907-2910 |
| Refusal | Distinct notice with safety appeal and Retry. | ChatMessageList.tsx:1967-1995 |
| Empty response | Retry offered with reason no response was returned. | ChatMessageList.tsx:120 |
| Variant delete | Confirmation before removing a response and what follows. | MessageBubble.tsx:4096-4103 |
| Unsaved answer edits (mobile) | Prompt Discard your unsaved changes? before regenerate. | mobile MessageBubble.tsx:268-309 |
| Branch in progress | Button disabled, Creating branch…. | MessageBubble.tsx:3929-3941 |
| Branch in temporary chat | Mobile hides it; web: no gate found. | chat/[id].tsx:2589 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/VariantPager.test.tsx`: Pager (from file name).
- `apps/web/features/chat/components/messages/ChatMessageList.variants.test.tsx`: Variants in the list (from file name).
- `apps/web/features/chat/components/messages/ChatMessageList.retryAnchor.test.tsx`: Retry anchoring (from file name).
- `apps/web/features/chat/components/messages/__tests__/ChatMessageList.serverStoppedTurn.test.tsx`: Stopped turn notice (from file name).
- `apps/web/features/chat/components/messages/__tests__/ChatMessageList.turnFailureNotice.test.tsx`: Failure notice (from file name).
- `apps/web/e2e/variant-pager.spec.ts`: Browser spec for the pager (from file name).
- `apps/mobile/__tests__/ContinueOnlyForCutOffAnswer.test.ts`: Mobile continue only for cut-off answers (from file name).
- `apps/mobile/src/features/chat/components/__tests__/MessageList.continue.test.tsx`: Mobile continue button (from file name).
- `apps/mobile/__tests__/cloud-message-variants.test.ts`: Mobile variants (from file name).
- `apps/mobile/__tests__/cloud-continue-answer.test.ts`: Cloud continue (from file name).

**Test scenarios**

- **Regenerate with another model**
  1. On web open the Regenerate response menu.
  2. Choose Try again with a different model.
  - Expected: A new attempt with that model; pager shows Response 2 of 2; answered-by shows the new model.
- **Continue a cut-off answer**
  1. Ask for a very long answer with a low output limit.
  2. Press Continue generating.
  - Expected: Text appends to the same message.
- **Stop is not a cutoff**
  1. Stop an answer midway.
  - Expected: Response stopped. with Try again; no Continue.
- **Branch**
  1. Press Branch conversation from here on a middle answer.
  - Expected: New chat opens with history to that point; the original is unchanged.
- **Local to BYOK refusal**
  1. In a Local chat select a BYOK model and press Regenerate.
  - Expected: A visible refusal and no send.
- **CLI continue**
  1. In the CLI run /continue.
  - Expected: A new prompt is sent; compare to web (documents the difference).

**Where to look when it fails**

- Message metadata finishReason and streamError.code decide notices (ChatMessageList.tsx:1166, 85-130).
- Mobile metadata keys resolvedModel, finishReason (continuableAnswer.ts).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/017-assistant-message-components.md](../../70-qa/test-plans/web/017-assistant-message-components.md)
- Desktop: [70-qa/test-plans/desktop/017-assistant-message-components.md](../../70-qa/test-plans/desktop/017-assistant-message-components.md)
- Mobile: [70-qa/test-plans/mobile/017-assistant-message-components.md](../../70-qa/test-plans/mobile/017-assistant-message-components.md)
- CLI: [70-qa/test-plans/cli/017-assistant-message-components.md](../../70-qa/test-plans/cli/017-assistant-message-components.md)
- VS Code: [70-qa/test-plans/vscode/017-assistant-message-components.md](../../70-qa/test-plans/vscode/017-assistant-message-components.md)
- Chrome: [70-qa/test-plans/chrome/017-assistant-message-components.md](../../70-qa/test-plans/chrome/017-assistant-message-components.md)

## 10. Gaps and dependencies

- **CLI /continue is a new prompt, not a resume; no regenerate, retry-answer or answer-level branch.** Affects: CLI users. Evidence: claude_parity.rs:185-188. Work needed: Resume same answer or document.
- **VS Code has no continue and regenerate only on the latest answer.** Affects: VS Code users. Evidence: webviewContent.ts:759-760. Work needed: Add continue; allow older answers.
- **Chrome has no branch or continue.** Affects: Chrome users. Evidence: no hits in side-panel greps. Work needed: Add or document.
- **Web code comment says Continue covers user-stopped turns; the list excludes them.** Affects: Maintainers. Evidence: WebChatPage.tsx:6428-6431 versus ChatMessageList.tsx:1353-1357. Work needed: Fix the comment.
- **Web branch has no temporary-chat gate found, unlike the brief.** Affects: Web users. Evidence: no temporary check in MessageBubble.tsx, ChatMessageList.tsx or branches/route.ts. Work needed: Verify live and add a gate if needed.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:own-key
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- SYS-security-and-privacy

## Unknown

- Exact URL string and method of the branches endpoint (only the path helper and route folder were seen).
- Whether the CLI has any retry-answer command beyond the tools retry.
- Whether Chrome has continue or branch under other names (grep only).
- Per-plan limits on regenerate and continue.
- How Desktop Electron differs from web.
