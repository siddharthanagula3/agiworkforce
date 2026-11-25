---
id: "F009-05"
type: "feature"
title: "Device, permission-scope and approval controls"
aliases: ["Audio route picker", "Audio output device", "API key scopes", "Action approvals", "Tool approvals", "Permission summary", "Permissions requested", "Permissions granted", "Approval card", "Tool call card approval", "Approval overlay (CLI)", "S9.09", "S9.10", "S9.31", "S9.32"]
area: "9 Compound interface components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S9.09", "S9.10", "S9.31", "S9.32"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-voice-and-media", "SYS-connectors-plugins-and-skills", "SYS-authorization-and-workspaces", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "api:POST /api/llm/v1/chat/completions/approve", "api:GET /api/settings/approvals"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F009-05 Device, permission-scope and approval controls

Four related controls: pick the speaker for voice replies (Web, Desktop), choose how far a permission reaches (API key scopes, approval policy), read in words what a connected app or the assistant may do, and approve or deny an action in an inline card or CLI overlay. The microphone cannot be picked.

Area: [9. Compound interface components](README.md). Requirement items: [S9.09](../../10-requirements/capabilities/009-compound-interface-components.md#s909), [S9.10](../../10-requirements/capabilities/009-compound-interface-components.md#s910), [S9.31](../../10-requirements/capabilities/009-compound-interface-components.md#s931), [S9.32](../../10-requirements/capabilities/009-compound-interface-components.md#s932).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Device picker: on Web voice, lists audio output devices and routes sound to the chosen one. Permission-scope picker: API key scopes on Web and the three-way tool approval policy on Mobile and elsewhere. Permission summary: plain sentences on connector scopes and on what the assistant can use. Approval card: shows the action, its request (command text, code or file diff) and offers Allow, Allow for this chat and Deny.

**Why it exists.** People must stay in control of what the assistant may do and must be told in plain words before it acts (brief S9.10, S9.31, S9.32; doc: docs/product/experience-contract.md:397).

**Who uses it.** Everyone who runs tools, connectors or voice; API users making keys.

**Problems it solves**

- Granting too much access to an API key.
- Approving an action without seeing it.
- Not knowing what a connector can do.
- Sound playing on the wrong device.

**Use cases**

- Create an API key with only 'Read usage'.
- Set action approvals to 'Ask before every action'.
- Open a connector and read 'Permissions requested' with Read or Write badges.
- See an approval card for a command, read its text, choose 'Allow for this chat'.

## 2. User experience

**Where to find it**

- Web voice: button labelled 'Audio output, <device>' appears in voice mode when at least two output devices exist (apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:99-100, :112-119).
- API key scopes: Settings, API keys, dialog 'Generate New API Key', field 'Scopes' (apps/web/features/settings/components/Settings/ApiKeys.tsx:357-380).
- Mobile approvals: Settings, 'Action approvals' (apps/mobile/app/(app)/settings/auto-approve.tsx:45-80).
- Permission summary: Web connector detail 'Permissions requested' and 'Permissions granted' (apps/web/features/connectors/components/ConnectorScopeList.tsx:56-120); Mobile Settings 'Capabilities', 'What AGI can use' (apps/mobile/src/features/settings/capabilities/index.tsx:337-339).
- Approval card: inside the chat, on tool calls awaiting approval (packages/ui/unified-chat/src/components/ToolCallCard.tsx:285-291); Mobile CloudToolApprovalControls; CLI overlay (apps/cli/src/tui/widgets/approval_overlay.rs); VS Code and Chrome webview cards.

**Before you start**

- Device picker: a browser that supports output device switching (setSinkId) and at least two output devices (AudioRoutePicker.tsx:21-25, :99).
- Approval card: a run that reaches a tool needing consent, and a handler provided by the host.
- Mobile approvals: policy loaded; 'Skip approvals' is disabled when the workspace forbids it (auto-approve.tsx:60-71).

**Screens and controls**

- Audio picker: menu 'Audio output device' with radio items; 'System default' for the default device (AudioRoutePicker.tsx:12-17, :133-160).
- API key scopes: checkboxes 'Read model catalog', 'Run inference', 'Read usage' with descriptions (apps/web/lib/api-key-scopes.ts:8-24).
- Approval policy: 'Ask before every action', 'Run read-only actions without asking', 'Skip approvals' (packages/contracts/types/src/tool-approval-policy.ts:52-76); 'Recommended' tag on the first.
- Approval card buttons: 'Allow', 'Allow for this chat', 'Deny' (tool-approval-policy.ts:23-31; ToolCallCard.tsx:412-437).
- CLI overlay choices: y Yes, n No, s Allow Session, a Always allow, d Deny All, t Allow All (approval_overlay.rs:18-19, :115-123).

**Journey**

1. Approval: the run pauses on a tool; the card shows the request; the person clicks Allow, Allow for this chat or Deny; the app posts the decisions to the approve endpoint and the run resumes or stops.
2. Policy: open Action approvals, tap a policy; it saves and syncs.
3. API key: tick scopes, name the key, generate; the key is shown once.
4. Voice: open the audio output menu and pick a device.

**What the person sees and gets**

- High risk notice: 'Private data from this chat could be sent outside AGI. Check where it goes before you allow it.' replaces the normal sentence and removes 'Allow for this chat' (tool-approval-policy.ts:38-39; ToolCallCard.tsx:290, :422).
- Expired: 'This approval request expired or is no longer active.' with 'Resend' when available; no buttons (ToolCallCard.tsx:371-387).
- Stakes list shows labelled facts about the action (ToolCallCard.tsx:445-455).
- API key list shows scopes joined with a dot (ApiKeys.tsx:262-268).

**Settings**

- Tool approval policy (three values) per account; workspace can forbid autonomy (auto-approve.tsx:60-71).
- API key scopes and project binding.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web audio output picker with device change listener (apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:31-71).
- Web API key scope checkboxes with a default of all scopes when none stored (apps/web/lib/api-key-scopes.ts:26-31).
- Approval card with high-risk handling, expired state, request code, diff or command, stakes (packages/ui/unified-chat/src/components/ToolCallCard.tsx:285-455); Web resume via the approve endpoint (apps/web/lib/hooks/useChatStream.ts:5513-5740; packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:35).
- Allow for this chat auto-approves later calls of the same tool unless the entry is high risk (apps/web/features/chat/components/messages/MessageBubble.tsx:2352-2372).
- Mobile Action approvals screen and sync (apps/mobile/app/(app)/settings/auto-approve.tsx; apps/mobile/src/features/settings/tool-approvals/useToolApprovalPolicySync.ts).
- Mobile CloudToolApprovalControls with Allow for chat and Always allow and a high-risk notice (apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:88-189).
- CLI approval overlay with six choices; Esc always answers No (apps/cli/src/tui/widgets/approval_overlay.rs:164-182).
- Chrome side panel has approve-for-chat logic (apps/extension/src/side_panel.ts:5543-5577, :5947) and VS Code has an approval card in its webview (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7030-7031).

**Incomplete**

- The picker covers speakers only; no microphone or camera picker found (AudioRoutePicker.tsx:44-47 filters audiooutput).
- The Chrome approval card is marked unverified in the brief although code exists.

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- Device picker on CLI and Chrome (brief S9.09); not listed for Mobile and VS Code.
- A paired-computer chooser as part of this picker was not found (brief S9.09 mentions it).

## 4. Required behaviour

**Established requirements**

- The user can pick which device is used (microphone, speaker, camera or paired computer) from a list. (source: brief S9.09)
- When granting access the user chooses how far the permission reaches: capabilities, or once versus always. (source: brief S9.10)
- One view states in plain language what the assistant or a connected app is allowed to do (scopes, autonomy, allowed sites or tools). (source: brief S9.31)
- An inline card names the action and offers approve and deny; the choice resumes or stops the run. (source: brief S9.32)
- High-risk actions do not offer 'approve for chat'; an expired approval shows no buttons. (source: packages/ui/unified-chat/src/components/ToolCallCard.tsx:289-291, :422)
- The approval card is part of the experience contract. (source: doc: docs/product/experience-contract.md:397)

**Acceptance criteria**

1. With two or more output devices the Web voice view shows the audio menu; with fewer it shows nothing.
2. Choosing a device calls setSinkId and marks it checked.
3. API key creation offers exactly the three scopes and stores the chosen subset.
4. On a high-risk approval 'Allow for this chat' is absent and the high-risk notice is shown.
5. An expired approval shows the expired message, no Allow or Deny buttons.
6. Allow resumes the run; Deny stops it and the decision is sent for every pending call.
7. Mobile 'Skip approvals' is disabled when the workspace forbids it.
8. The CLI overlay answers No on Esc and High-risk calls are excluded from Allow All.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A microphone choice is expected by the brief text but the Web code lists output only [inferred from AudioRoutePicker.tsx:44-47 versus brief S9.09].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an input device picker to Web voice.
- [proposed] Verify the Chrome approval card with a test and update its status.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AudioRoutePicker | `apps/web/features/chat/components/Voice/AudioRoutePicker.tsx` | Lists output devices and routes audio. |
| component | VoiceComposer | `apps/web/features/chat/components/Voice/VoiceComposer.tsx` | Voice controls where the picker sits. |
| component | ApiKeys | `apps/web/features/settings/components/Settings/ApiKeys.tsx` | Scope checkboxes and key list. |
| config | API_KEY_SCOPE_OPTIONS | `apps/web/lib/api-key-scopes.ts` | The three scope values, labels and descriptions. |
| schema | TOOL_APPROVAL_POLICY_OPTIONS and labels | `packages/contracts/types/src/tool-approval-policy.ts` | Shared policy names, action labels, high-risk notice. |
| component | ToolCallCard | `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Shared approval card, expired state, request display. |
| component | MessageBubble (Web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Wires approve, deny, allow for chat and auto-approve of allowed tools. |
| hook | useResolveToolApproval | `apps/web/lib/hooks/useChatStream.ts` | Collects decisions and posts tool_approvals to resume the run; expires superseded turns. |
| endpoint | POST /api/llm/v1/chat/completions/approve | `apps/web/app/api/llm/v1/chat/completions/approve/route.ts` | Resume endpoint named by TOOL_APPROVAL_RESUME_PATH. |
| endpoint | /api/settings/approvals | `apps/web/app/api/settings/approvals/route.ts` | Approvals route (contents not opened). |
| screen | Mobile Action approvals | `apps/mobile/app/(app)/settings/auto-approve.tsx` | Policy choice rows. |
| hook | useToolApprovalPolicySync | `apps/mobile/src/features/settings/tool-approvals/useToolApprovalPolicySync.ts` | Loads, saves and retries the policy. |
| component | CloudToolApprovalControls | `apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx` | Mobile approval buttons, high risk notice, stakes. |
| screen | Mobile Capabilities | `apps/mobile/src/features/settings/capabilities/index.tsx` | Plain words summary 'What AGI can use'. |
| component | ConnectorScopeList | `apps/web/features/connectors/components/ConnectorScopeList.tsx` | Permissions requested and granted with Read or Write badges. |
| service | scope-descriptions | `apps/web/lib/connectors/scope-descriptions.ts` | Turns scope ids into sentences. |
| component | approval_overlay | `apps/cli/src/tui/widgets/approval_overlay.rs` | CLI approval choices and keys. |
| component | VS Code approval card | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Webview approval card using the shared labels. |
| service | approve for chat (Chrome) | `apps/extension/src/side_panel.ts` | toolsAllowedForChat map and approveToolForChat. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The browser lists output devices and listens for device changes; no server call. | device | apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:31-71 |
| The agent run stops on a tool that needs consent and the card is drawn from the paused tool entry. | our servers | ToolCallCard.tsx:285-291; apps/web/lib/hooks/useChatStream.ts:5497-5560 |
| A click records the decision, updates the tool entry, then posts run_id and tool_approvals to the resume path and streams the continued answer. | device and our servers | useChatStream.ts:5536-5560, :5693-5740 |
| A newer turn marks the paused one expired; decisions on it are ignored. | device | useChatStream.ts:1018-1048, :5529 |
| Action approvals policy is loaded and saved to the account; mobile syncs it. | device and our servers | apps/mobile/src/features/settings/tool-approvals/useToolApprovalPolicySync.ts (hook named in auto-approve.tsx:38-40) |
| For desktop-side actions the approval can also arrive on the device ('Approve it if your desktop asks'). | device | ToolCallCard.tsx:343 |
| CLI shows the overlay locally and returns the choice to the agent loop. | device | apps/cli/src/tui/widgets/approval_overlay.rs:52-62 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approval decisions | Paused turn state in the browser (pendingTurns) and the run on the server | Posted to the resume endpoint | Pending turns are dropped on expiry or reset (useChatStream.ts:1026-1031) |
| Tools allowed for this chat | In memory per conversation (Web and Chrome) | no | Lost on reload [inferred from in-memory maps in side_panel.ts:5543] |
| Approval policy | Account settings (route /api/settings/approvals, contents not opened) | Yes on Mobile via sync hook | unknown |
| API key scopes | API key record with a scopes list (apiKey.scopes, ApiKeys.tsx:262) | Server side | Deleted when the key is deleted |
| Always allow rule (CLI) | Permission store on the device (approval_overlay.rs:105-107) | no | Kept across sessions until removed |

**Models and providers.** The card works for any model that emits tool calls; risk level comes from the run. The model and provider are not shown in the card. Whether tools exist at all depends on the harness and route, not the model alone (doc: AGENTS.md section 4).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Approval and API key features need a signed-in account; the CLI overlay works in local sessions too. |
| Permissions | Workspace can forbid skipping approvals; 'Workspace blocks and your Deny choices win' (tool-approval-policy.ts:73-74). Mobile disables 'Skip approvals' when forbidden. |
| Subscription | API key creation shows an upgrade message when the plan lacks it (ApiKeys.tsx:233-246 'upgrade.message'). Approval and scope controls have no plan gate found. |
| Limits and metering | none found in the code for the controls themselves. |
| Feature flags | none found in the code. |
| Model compatibility | not applicable. |
| Provider restrictions | Connector scope descriptions exist per connector id; a provider without OAuth scopes gets a plain note (ConnectorScopeList.tsx:41-52). |
| Local mode | CLI approvals and Desktop local approval cards work without an account or subscription (apps/web/features/code/components/LocalApprovalCard.test.tsx exists for the desktop local card). Output device switching is browser local. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading (policy) | Rows disabled until ready; retry offered on failure. | apps/mobile/app/(app)/settings/auto-approve.tsx:60-71 |
| Expired approval | Message, optional Resend, no buttons. | ToolCallCard.tsx:371-387 |
| Device wait | 'Running on this device. Approve it if your desktop asks.' and an expired variant 'This step waited too long for <device>'. | ToolCallCard.tsx:343, :358-365 |
| High risk | No allow-for-chat; notice shown. | ToolCallCard.tsx:289-290, :422 |
| Device list under two | Picker hidden. | AudioRoutePicker.tsx:99 |
| Device switch fails | Silently ignored; active mark unchanged. | AudioRoutePicker.tsx:87-92 |
| Labels hidden by browser | Unnamed device keeps id and shows 'Audio output'. | AudioRoutePicker.tsx:28-30, :51-54 |
| CLI Esc | Always No regardless of cursor. | approval_overlay.rs:164-170 |
| Keyboard | Audio menu uses menu keyboard handling; CLI keys y n s a d t. | AudioRoutePicker.tsx:80; approval_overlay.rs:115-123 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- apps/web/features/chat/components/Voice/__tests__/AudioRoutePicker.test.tsx (not found) (not found): Audio route picker (cases not itemised).
- `packages/ui/unified-chat/src/components/__tests__/MessageList.toolApproval.test.tsx`: Tool approval rendering in the message list.
- `packages/ui/unified-chat/src/components/__tests__/ToolCallCard.fileDiff.test.tsx`: File diff shown in the card.
- `apps/web/features/settings/components/Settings/ApiKeys.test.tsx`: API keys settings (cases not itemised).
- `apps/web/features/connectors/components/__tests__/ConnectorScopeList.test.tsx`: Scope list rendering.
- `apps/mobile/__tests__/AutoApproveSettings.test.tsx`: Mobile action approvals screen.
- `apps/mobile/__tests__/CapabilitiesSettings.test.tsx`: Mobile capabilities summary.
- `apps/mobile/__tests__/cloud-tool-approval-expired.test.ts`: Expired mobile cloud approvals.
- `apps/extension-vscode/src/__tests__/approvalCard.webview.test.ts`: VS Code approval card.
- `apps/extension-vscode/src/__tests__/approvalScope.test.ts`: VS Code approval scope.
- `apps/cli/src/tui/widgets/approval_overlay.rs`: CLI overlay (inline tests may exist; not confirmed).

**Test scenarios**

- **Approve once**
  1. Ask for an action that needs approval.
  2. Click Allow.
  - Expected: Run resumes with the tool result.
- **Deny**
  1. Click Deny on a card.
  - Expected: Run stops that call and replies without it.
- **High risk**
  1. Trigger a high-risk action.
  - Expected: Red notice; no 'Allow for this chat' button.
- **Expired**
  1. Leave an approval pending.
  2. Send a new message.
  - Expected: Old card shows the expired text and no buttons.
- **Scope on a key**
  1. Create a key with only 'Read usage'.
  2. Call the inference API with it.
  - Expected: Inference is refused (scope check inferred from apiKeyHasScope in apps/web/lib/api-key-scopes.ts:33).
- **Audio device**
  1. On a laptop with two outputs open Web voice mode.
  2. Pick the second.
  - Expected: Menu shows it checked and sound moves.

**Where to look when it fails**

- Network: POST /api/llm/v1/chat/completions/approve body tool_approvals.
- Toast or error text 'Resume failed: <status>' (useChatStream.ts).
- Mobile: policy status 'error' and Retry.
- CLI: overlay prompt text and permission store.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/009-compound-interface-components.md](../../70-qa/test-plans/web/009-compound-interface-components.md)
- Desktop: [70-qa/test-plans/desktop/009-compound-interface-components.md](../../70-qa/test-plans/desktop/009-compound-interface-components.md)
- Mobile: [70-qa/test-plans/mobile/009-compound-interface-components.md](../../70-qa/test-plans/mobile/009-compound-interface-components.md)
- CLI: [70-qa/test-plans/cli/009-compound-interface-components.md](../../70-qa/test-plans/cli/009-compound-interface-components.md)
- VS Code: [70-qa/test-plans/vscode/009-compound-interface-components.md](../../70-qa/test-plans/vscode/009-compound-interface-components.md)
- Chrome: [70-qa/test-plans/chrome/009-compound-interface-components.md](../../70-qa/test-plans/chrome/009-compound-interface-components.md)

## 10. Gaps and dependencies

- **No microphone, camera or paired-computer choice in the device picker.** Affects: Web and Desktop voice users. Evidence: apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:44-47. Work needed: Add input selection or narrow the requirement.
- **Device picker absent on CLI and Chrome; Mobile and VS Code not stated.** Affects: CLI, Chrome. Evidence: audit/partial/009-compound-interface-components.md (S9.09). Work needed: Decide scope per app.
- **Chrome approval card status unverified in the brief.** Affects: Chrome. Evidence: brief S9.32; apps/extension/src/side_panel.ts:5543-5577. Work needed: Add a test and record result.
- **Approval labels differ by app: Web says 'Allow', CLI offers 'Allow Session' and 'Always allow'.** Affects: Consistency across apps. Evidence: packages/contracts/types/src/tool-approval-policy.ts:23-31; apps/cli/src/tui/widgets/approval_overlay.rs:91-94. Work needed: Decide whether to align labels and whether Web needs an 'Always allow'.

**Depends on**

- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-voice-and-media
- SYS-connectors-plugins-and-skills
- SYS-authorization-and-workspaces
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- api:POST /api/llm/v1/chat/completions/approve
- api:GET /api/settings/approvals

## Unknown

- What /api/settings/approvals does and whether the Web account has a settings screen for the policy (user-preferences.ts:541 and AccountSection.tsx:22 from the brief were not opened).
- Whether Mobile or VS Code have an audio or device picker.
- How the server enforces API key scopes (only the helper apiKeyHasScope was seen).
- Test case lists for the audio picker, ApiKeys and connector scope tests.
- Where the CLI permission store keeps Always allow rules.
