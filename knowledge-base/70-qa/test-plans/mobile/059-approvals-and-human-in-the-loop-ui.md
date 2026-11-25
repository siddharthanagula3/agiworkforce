---
id: "PLAN-mobile-059"
type: "test-plan"
title: "Mobile · 59. Approvals and human-in-the-loop UI"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "59"
---
# Mobile · 59. Approvals and human-in-the-loop UI

25 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S59.01 One-action approval.

- **Expected:** When a single tool call needs approval, the user can approve or deny that one call and the run continues accordingly.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:307 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2519 (quoted code not found in the file now)
- **Where to find it:** Chat > the tool call card in the transcript > Allow once or Deny (labels found in the code)
- **Needs:** a signed-in account that can use tools
- **Steps:**
  1. Sign in and open a chat that can use tools (AGI Cloud).
  2. Set Settings > Capabilities > Action approvals to Ask before every action.
  3. Ask the agent for an action that needs approval, for example a write.
  4. Tap Allow once on that one card.
  5. Look: only that call runs, and the reply continues with its result.

## S59.02 Batch approval.

- **Expected:** The user can approve or deny several pending tool calls of a run in one action.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/CloudTasksScreen.tsx:840; apps/mobile/src/features/tasks/store.ts:330
- **Where to find it:** Drawer > AGI Work > open a run labelled Waiting for your approval > Approve (labels found in the code)
- **Needs:** a Cloud task run paused for approval with several pending calls
- **Steps:**
  1. Open the side menu and tap AGI Work (shown only when cloud tasks are on).
  2. Open a run that has Waiting for your approval.
  3. Read the listed tool calls in that section.
  4. Tap Approve (it approves every pending call of that run at once).
  5. Look: the run continues and the pending calls are no longer listed as waiting.

## S59.03 Per-session approval.

- **Expected:** The user can allow a tool for the rest of the current session so it stops asking until the session ends.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:690 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:719 (quoted code not found in the file now)
- **Where to find it:** Chat > the tool call card > Allow for this chat (labels found in the code)
- **Needs:** a Cloud account with a tool that asks for approval
- **Steps:**
  1. Open a chat with tools and trigger an approval for a tool.
  2. Tap Allow for this chat on the card.
  3. If the tool is marked destructive, confirm in the dialog that opens.
  4. Ask the agent to use the same tool again in the same chat.
  5. Look: the second call runs without a new card asking first.

## S59.04 Per-application permission.

- **Expected:** The user can set allow/ask/deny per connected app (and per tool within it), and the runtime enforces it.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:278 (quoted code not found in the file now); apps/mobile/services/connectors.ts:173
- **Where to find it:** Settings > Cloud > Connectors > open a connector > Tool permissions (labels found in the code)
- **Needs:** a Cloud account with a connected app
- **Steps:**
  1. Open Settings and go to the Cloud group, then tap Connectors.
  2. Open a connected app.
  3. Under Tool permissions, find a tool and read its Policy row.
  4. Tap Allow, Ask or Block on that tool.
  5. Look: the row shows the new choice, and the tool follows it on its next run.

## S59.07 Persistent permission settings.

- **Expected:** Permission choices (policy and per-tool rules) persist across sessions and devices until changed.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/auto-approve.tsx:74; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:278 (quoted code not found in the file now)
- **Where to find it:** Settings > Capabilities > Action approvals (labels found in the code)
- **Needs:** a signed-in Cloud account; a second device for the cross-device check
- **Steps:**
  1. Open Settings, tap Capabilities, then tap Action approvals.
  2. Choose Run read-only actions without asking.
  3. Close the screen, force-quit the app and open it again.
  4. Open Action approvals again.
  5. Look: the same choice is still selected. Repeat on a second signed-in device if you have one.

## S59.08 Permission-mode selector.

- **Expected:** The user can pick a permission mode (ask every time / auto for low risk / skip approvals) that governs how every tool runs.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5309; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4573 (quoted code not found in the file now); apps/web/lib/voice/live-voice-tools.ts:315; apps/web/lib/services/scheduled-agent-executor.ts:305
- **Where to find it:** Settings > Capabilities > Action approvals (labels found in the code)
- **Needs:** a signed-in Cloud account
- **Steps:**
  1. Open Settings, tap Capabilities, then tap Action approvals.
  2. Read the three choices: Ask before every action, Run read-only actions without asking, Skip approvals.
  3. Tap each choice in turn; a Recommended tag sits on Ask before every action.
  4. Look: the selected choice moves, and the Safety default card below updates to match.

## S59.10 Ask-before-writing mode.

- **Expected:** A mode lets reads run automatically but stops and asks before any write, send or execute action.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/auto-approve.tsx:74; apps/mobile/app/(app)/settings/auto-approve.tsx:34 (quoted code not found in the file now)
- **Where to find it:** Settings > Capabilities > Action approvals > Run read-only actions without asking (labels found in the code)
- **Needs:** a signed-in Cloud account with a tool that reads and one that writes
- **Steps:**
  1. Open Settings, tap Capabilities, then tap Action approvals.
  2. Tap Run read-only actions without asking.
  3. In a chat, ask the agent to search or read something, then to write or send something.
  4. Look: the read runs with no card; the write stops at an approval card.

## S59.11 Automatic low-risk approval mode.

- **Expected:** A mode auto-approves low-risk actions (reads, searches) while riskier actions still ask.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/auto-approve.tsx:74; apps/mobile/app/(app)/settings/auto-approve.tsx:34 (quoted code not found in the file now)
- **Where to find it:** Settings > Capabilities > Action approvals > Run read-only actions without asking (labels found in the code)
- **Needs:** a signed-in Cloud account
- **Steps:**
  1. Open Settings, tap Capabilities, then tap Action approvals.
  2. Tap Run read-only actions without asking.
  3. In a chat, ask for a search or page read, then for a riskier action such as a delete or a purchase.
  4. Look: the search runs by itself; the riskier action shows a card and waits.

## S59.12 Approval summary.

- **Expected:** An approval request shows a plain summary of what the tool will do and why it needs approval.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:307 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2519 (quoted code not found in the file now)
- **Where to find it:** Chat > the tool call card (above the Allow once and Deny buttons) (labels found in the code)
- **Needs:** a signed-in Cloud account with a tool that asks for approval
- **Steps:**
  1. Ask the agent for an action that needs approval.
  2. Read the card: the tool summary line, the risk label, and the parameter rows.
  3. Check any notice (for example the private-data notice for high risk).
  4. Look: the card says what the tool will do and why it asks.

## S59.13 Exact recipients.

- **Expected:** Before a send is approved, the approval names exactly who will receive it.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:207; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:403; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:526
- **Where to find it:** Chat > the approval card for a send (email, message or invite) > read the To row above Allow once (labels found in the code)
- **Needs:** a signed-in account with a send tool that needs approval
- **Steps:**
  1. Ask the agent to send an email or message that needs approval.
  2. Read the card before tapping anything.
  3. Find the row for recipients (To, Cc, Bcc, channel or attendees).
  4. Look: the exact address or name appears above Allow once.

## S59.14 Exact destination.

- **Expected:** Before an outbound action is approved, the approval shows the exact destination (URL, host or target).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:382 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2519 (quoted code not found in the file now)
- **Where to find it:** Chat > the approval card for an outbound action > read the parameter rows above Allow once (labels found in the code)
- **Needs:** a signed-in account with a tool that reaches an outside service
- **Steps:**
  1. Ask the agent for an action that sends data to a web address or service.
  2. Read the parameter rows on the card, in monospace.
  3. Find the url, host or target row.
  4. Look: the exact destination is shown before you tap Allow once.

## S59.15 Exact amount or purchase.

- **Expected:** Before a payment or purchase is approved, the approval shows the exact amount and what is bought.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:78; apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:207
- **Where to find it:** Chat > the approval card for a payment or purchase > read the amount row above Allow once (labels found in the code)
- **Needs:** a signed-in account with a payment tool that needs approval
- **Steps:**
  1. Ask the agent for a purchase or payment that needs approval.
  2. Read the card before tapping anything.
  3. Find the amount row (for example Amount) and the item row.
  4. Look: the exact amount and what is bought are shown before approval.

## S59.16 Exact command.

- **Expected:** Before a command runs, the approval shows the exact command line (and where it will run).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:382 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2519 (quoted code not found in the file now)
- **Where to find it:** Chat > the approval card for a command > read the parameter rows above Allow once (labels found in the code)
- **Needs:** a signed-in account with a command or code tool that needs approval
- **Steps:**
  1. Ask the agent to run a command that needs approval.
  2. Read the parameter rows on the card (monospace text).
  3. Open Raw JSON to see the full arguments.
  4. Look: the exact command line is shown before Allow once.

## S59.17 Exact files or records affected.

- **Expected:** Before a write, the approval shows exactly which files or records will change.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:382 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2519 (quoted code not found in the file now)
- **Where to find it:** Chat > the approval card for a write > read the parameter rows and any stakes above Allow once (labels found in the code)
- **Needs:** a signed-in account with a write tool that needs approval
- **Steps:**
  1. Ask the agent to change or create files or records that needs approval.
  2. Read the path and item rows on the card.
  3. Open Raw JSON if you need the full arguments.
  4. Look: the exact file or record names are shown before approval.

## S59.18 Proposed-diff preview.

- **Expected:** Before a file edit is approved, the user sees the proposed diff.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:153 (quoted code not found in the file now); apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:78
- **Where to find it:** Chat > the approval card for a file edit > the diff block above Allow once (labels found in the code)
- **Needs:** a signed-in account with a file edit tool that needs approval
- **Steps:**
  1. Ask the agent to edit a file that needs approval.
  2. Look at the card before tapping anything.
  3. Read the proposed diff block (removed and added lines).
  4. Look: the proposed change is visible before you tap Allow once.

## S59.19 Allow action.

- **Expected:** The user can allow a pending action and it then runs.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:307 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2519 (quoted code not found in the file now)
- **Where to find it:** Chat > the approval card > Allow once (labels found in the code)
- **Needs:** a signed-in Cloud account with a tool that asks for approval
- **Steps:**
  1. Ask the agent for an action that needs approval.
  2. Tap Allow once.
  3. Look: the card changes to Allowed and the tool runs; the result appears in the transcript.

## S59.20 Deny action.

- **Expected:** The user can deny a pending action; it does not run and the model is told it was denied.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:307 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2519 (quoted code not found in the file now)
- **Where to find it:** Chat > the approval card > Deny (labels found in the code)
- **Needs:** a signed-in Cloud account with a tool that asks for approval
- **Steps:**
  1. Ask the agent for an action that needs approval.
  2. Tap Deny.
  3. Look: the card shows Denied, the action does not run, and the agent replies that it was refused.

## S59.22 Ask for an alternative.

- **Expected:** Instead of just denying, the user can tell the agent what to do instead, and the agent continues with that guidance.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:305; apps/mobile/stores/chat/chatExecutionStore.ts:743
- **Where to find it:** Chat > the approval card > Add guidance > type in the box > Allow once or Deny (labels found in the code)
- **Needs:** a signed-in Cloud account with a tool that asks for approval
- **Steps:**
  1. Ask the agent for an action that needs approval.
  2. Tap Add guidance under the card.
  3. Type what to do instead, for example Use the draft folder.
  4. Tap Deny (or Allow once) to send it.
  5. Look: the guidance is sent with the decision and the agent continues from it.

## S59.23 Approval expiration.

- **Expected:** A pending approval expires after a set time, the UI shows it expired, and the action cannot run from it.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1431; apps/mobile/stores/chat/chatExecutionStore.ts:2519 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. I did not find a fixed time limit in the code read; expiry looks tied to the turn no longer being live (isApprovalTurnLive in stores/chat/chatExecutionStore.ts). Unverified.
- **Needs:** a pending approval that is left unanswered
- **Steps:**
  1. Leave an approval card unanswered in a chat for a long time, or let the run pause or end.
  2. Reopen the chat.
  3. Look: the card shows an expired line and its Allow and Deny buttons are not usable.

## S59.24 Approval history.

- **Expected:** The user can review a history of past approval requests and their decisions.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/auto-approve.tsx:82 (quoted code not found in the file now); apps/mobile/src/features/settings/tool-approvals/ApprovalHistory.tsx:46
- **Where to find it:** Settings > Capabilities > Action approvals > Approval history (labels found in the code)
- **Needs:** a signed-in Cloud account with past approvals
- **Steps:**
  1. Open Settings, tap Capabilities, then tap Action approvals.
  2. Scroll to Approval history.
  3. Tap an earlier entry if the list offers it.
  4. Look: past requests appear with their decisions.

## S59.25 Revoke saved permission.

- **Expected:** The user can revoke a saved "always allow" (or folder/site grant) so the action asks again.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:302 (quoted code not found in the file now); apps/mobile/services/connectors.ts:180
- **Where to find it:** Settings > Cloud > Connectors > open a connector > Tool permissions > reset a tool (labels found in the code)
- **Needs:** a Cloud account with a connector tool set to Allow or an always-allow grant
- **Steps:**
  1. Open Settings, go to Cloud, then tap Connectors.
  2. Open a connector that has a tool set to Allow.
  3. Under Tool permissions, find the tool and tap its reset control (labelled Reset to default).
  4. Ask the agent to use that tool in a chat.
  5. Look: the approval card asks again.

## S59.26 Approval from another device.

- **Expected:** An approval raised on one device can be answered from another signed-in device, and the first device sees the result.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/CloudTasksScreen.tsx:840; apps/mobile/src/features/tasks/store.ts:328
- **Where to find it:** Drawer > AGI Work > open a run labelled Waiting for your approval > Approve (on a second device) (labels found in the code)
- **Needs:** two signed-in devices on the same account and a paused task
- **Steps:**
  1. Start a task that pauses for approval on device A.
  2. Sign in to the same account on device B and open AGI Work.
  3. Open the same run and tap Approve.
  4. Look: device A shows the run moving on and the decision recorded.

## S59.28 Stronger confirmation for sensitive operations.

- **Expected:** Sensitive or irreversible actions get a stronger confirmation than routine ones (warning, no permanent allow, re-ask).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:200; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:526
- **Where to find it:** Chat > the approval card for a destructive tool > Always allow or Allow for this chat > confirmation dialog (labels found in the code)
- **Needs:** a signed-in account with a destructive tool that asks for approval
- **Steps:**
  1. Ask the agent to run a destructive tool (a delete or change that cannot be undone).
  2. Tap Always allow or Allow for this chat on the card.
  3. Read the dialog title and message; it has Cancel and a confirm button.
  4. Look: the dialog warns before the permission is saved; Cancel leaves the tool asking.

## S59.30 Resume after user intervention.

- **Expected:** After the user intervenes (approves, answers a question, or hands control back), the same run resumes where it stopped.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:307 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2519 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Resume behaviour is in apps/mobile/stores/chat/chatExecutionStore.ts; I did not trace it fully.
- **Needs:** a signed-in Cloud account with a multi-step task that asks for approval
- **Steps:**
  1. Ask the agent for a multi-step task that includes one approval.
  2. Tap Allow once on that card.
  3. Look: the same assistant reply continues below the card, without starting a new message.

## S59.31 Action receipt and outcome display.

- **Expected:** After an approval decision the transcript shows what was decided and what happened (ran, result, or denied).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:307 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2519 (quoted code not found in the file now)
- **Where to find it:** Chat > the approval card after a decision (the transcript row keeps the decision) (labels found in the code)
- **Needs:** a signed-in Cloud account with two approval requests
- **Steps:**
  1. Approve one action with Allow once and deny another with Deny.
  2. Look at each card after the decision.
  3. Read the decided label (Allowed or Denied) and the result or outcome line below it.
