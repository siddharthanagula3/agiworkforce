---
id: "PLAN-desktop-059"
type: "test-plan"
title: "Desktop · 59. Approvals and human-in-the-loop UI"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "59"
---
# Desktop · 59. Approvals and human-in-the-loop UI

29 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S59.01 One-action approval.

- **Expected:** When a single tool call needs approval, the user can approve or deny that one call and the run continues accordingly.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/ToolCallCard.tsx:415; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:566; apps/desktop/electron/runtime/permissionManager.ts:292 (quoted code not found in the file now)
- **Where to find it:** Chat > a tool step that shows "This tool requires approval before execution." > Allow or Deny on that one card (labels found in the code)
- **Needs:** a connected app or the Ask before every action setting
- **Steps:**
  1. Sign in, open Chat and ask the agent for an action that needs approval (for example a write or a send). Set Settings > Capabilities > Tool approvals > Ask before every action first if nothing asks.
  2. When the card shows "This tool requires approval before execution.", click Deny on that one card.
  3. Look: the run continues, the card records Denied and the agent answers without running that tool.
  4. Repeat with a new request and click Allow: the tool runs and the run continues.

## S59.02 Batch approval.

- **Expected:** The user can approve or deny several pending tool calls of a run in one action.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:899; apps/web/lib/services/cloud-agent-run-service.ts:1917
- **Where to find it:** Tasks page > a run under "Waiting for your approval" > Approve or Deny (one button decides every request in that run) (labels found in the code)
- **Needs:** a task run that asks for several approvals
- **Steps:**
  1. Start a task that calls several tools that need approval, then open the Tasks page.
  2. Find the run that shows "Waiting for your approval".
  3. Click Approve once.
  4. Look: all pending requests of that run are approved together, as Expected. The Tasks page path was taken from code and not confirmed on screen.

## S59.03 Per-session approval.

- **Expected:** The user can allow a tool for the rest of the current session so it stops asking until the session ends.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:428; apps/web/features/chat/components/messages/MessageBubble.tsx:2343; apps/web/features/chat/components/messages/MessageBubble.tsx:2373; apps/web/features/chat/components/messages/MessageBubble.tsx:2679
- **Where to find it:** Chat > a tool step that shows "This tool requires approval before execution." > Allow for this chat (labels found in the code)
- **Needs:** a tool that asks for approval
- **Steps:**
  1. In a chat, trigger a tool that needs approval.
  2. Click Allow for this chat on its card.
  3. Trigger the same tool again in the same chat and watch whether it asks.
  4. Look: the second call runs without a card, as Expected. It lasts for the chat, not for the whole app session.

## S59.04 Per-application permission.

- **Expected:** The user can set allow/ask/deny per connected app (and per tool within it), and the runtime enforces it.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ToolPermissionsPanel.tsx:76; apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:71
- **Where to find it:** Settings > Connectors > (connector row) > Tool permissions > Allow, Ask or Deny for each tool or group (labels found in the code)
- **Needs:** a connected app with tools
- **Steps:**
  1. Open Settings and choose Connectors.
  2. Click the connector, then Tool permissions.
  3. Pick Allow, Ask or Deny for a tool or a group such as Read-only tools.
  4. Look: the choice shows as selected, and the next run of that tool follows it (runs without asking, asks each time, or never runs).

## S59.05 Per-folder permission.

- **Expected:** The agent can touch only folders the user granted, and the user grants or revokes each folder.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx:104; apps/desktop/electron/runtime/dispatcher.ts:2312
- **Where to find it:** Desktop app > chat composer > attach a local folder > "Attach from a local folder" dialog (grant); revoke under Settings > Desktop app > Permissions (labels found in the code)
- **Needs:** the Desktop app and a local folder
- **Steps:**
  1. In the Desktop app, open a chat and use the composer's folder attach action.
  2. Choose a folder and check that the dialog title reads "Attach from a local folder".
  3. Confirm the folder appears as granted and the agent can read it.
  4. Open Settings > Desktop app > General > Permissions and remove or stop the folder, then check the agent no longer reaches it.

## S59.06 Per-domain permission.

- **Expected:** The user can allow or block specific websites/domains the agent may act on or fetch, and it is enforced.
- **Code:** partial. Evidence moved: apps/desktop/src/api/cloudApi.ts:884; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1521; apps/desktop/src-tauri/src/core/llm/server_tools.rs:207 (quoted code not found in the file now)
- **Known to be unfinished:** Desktop cloud chats send web_search and web_fetch to the server, so the workspace site rules bind them. BYOK and local desktop turns attach the provider's hosted web_search and web_fetch in the Tauri client (server_tools.rs), which does not read the workspace lists; the client would have to withhold hosted search or pass the lists as allowed_domains or blocked_domains. The native browser gate still asks per command and reads no site rule.
- **Where to find it:** Workspace console > Connectors > Websites > type a site in the field and click Allow site (owners and admins only) (labels found in the code)
- **Needs:** a workspace owner or admin account
- **Steps:**
  1. Sign in as a workspace owner or admin and open the workspace Connectors page.
  2. Find the Websites section and type a domain such as example.com in the field.
  3. Click Allow site and save.
  4. Look: the site is listed, and web search and fetch in chat are limited to it. In the Desktop app, local and BYOK turns still use the provider's own search, as Expected notes.

## S59.07 Persistent permission settings.

- **Expected:** Permission choices (policy and per-tool rules) persist across sessions and devices until changed.
- **Code:** done. Evidence moved: apps/desktop/electron/runtime/permissionManager.ts:363; apps/desktop/electron/runtime/permissionManager.ts:292 (quoted code not found in the file now)
- **Where to find it:** Settings > Capabilities > Tool approvals > pick one option (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings and choose Capabilities.
  2. Under Tool approvals, pick a different option and wait for the status to say Saved or Synced to your account.
  3. Close Settings, sign out and back in, or open the app on a second device.
  4. Look: the same option is still selected.

## S59.08 Permission-mode selector.

- **Expected:** The user can pick a permission mode (ask every time / auto for low risk / skip approvals) that governs how every tool runs.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5309; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4573 (quoted code not found in the file now); apps/web/lib/voice/live-voice-tools.ts:315; apps/web/lib/services/scheduled-agent-executor.ts:305
- **Where to find it:** Settings > Capabilities > Tool approvals > radio buttons: Ask before every action, Run read-only actions without asking, Skip approvals (labels found in the code)
- **Needs:** a Free or paid account; a tool that needs approval
- **Steps:**
  1. Open Settings > Capabilities.
  2. Select Ask before every action, then start a chat and ask for a read such as a search: it waits for approval.
  3. Select Skip approvals and run the same request: tools run without waiting.
  4. Look: destructive or unknown actions still ask under Skip approvals, as the option text says.

## S59.09 Read-only mode.

- **Expected:** The user can switch the agent into a read-only mode in which write, send and execute tools are refused.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:82; apps/web/app/api/connectors/permissions/route.ts:80; apps/web/features/connectors/components/ToolPermissionsPanel.tsx:179; apps/web/public/openapi.json:5618
- **Where to find it:** not found in the code. No single read-only mode that refuses writes was found in the UI; the nearest control is Settings > Connectors > Tool permissions, where a whole write category can be set to Deny. Searched for read-only mode and read-only tools in ToolPermissionsPanel.tsx and tool-approval-policy.ts.
- **Needs:** a connected app with write tools

## S59.10 Ask-before-writing mode.

- **Expected:** A mode lets reads run automatically but stops and asks before any write, send or execute action.
- **Code:** done. Evidence present: apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:151; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:1083
- **Where to find it:** Settings > Capabilities > Tool approvals > Run read-only actions without asking (labels found in the code)
- **Needs:** a connected app or a tool that writes
- **Steps:**
  1. Open Settings > Capabilities and select Run read-only actions without asking under Tool approvals.
  2. In a chat, ask for a read (search or page fetch): it runs without a card.
  3. Ask for a write (for example a send or an edit): a card with "This tool requires approval before execution." appears.
  4. Look: reads run and writes stop and ask, as Expected.

## S59.11 Automatic low-risk approval mode.

- **Expected:** A mode auto-approves low-risk actions (reads, searches) while riskier actions still ask.
- **Code:** done. Evidence present: apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:151; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:1083
- **Where to find it:** Settings > Capabilities > Tool approvals > Run read-only actions without asking (labels found in the code)
- **Needs:** a tool that can read and one that can write
- **Steps:**
  1. Select Run read-only actions without asking under Tool approvals.
  2. Trigger a low-risk read in chat and confirm it runs without asking.
  3. Trigger a riskier action and confirm a card asks first.
  4. Look: low-risk runs automatically while the riskier one still asks.

## S59.12 Approval summary.

- **Expected:** An approval request shows a plain summary of what the tool will do and why it needs approval.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:409; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:566
- **Where to find it:** Chat > a tool step waiting for approval > the card and the Approvals button in the chat header (labels found in the code)
- **Needs:** a tool that asks for approval
- **Steps:**
  1. Trigger a tool that needs approval in chat.
  2. Read the card: the label line and the parameters block show what the tool does.
  3. Open the Approvals button in the chat header and read the request there.
  4. Look: the card shows the tool name and the reason in the line "This tool requires approval before execution."

## S59.13 Exact recipients.

- **Expected:** Before a send is approved, the approval names exactly who will receive it.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:302; packages/ui/unified-chat/src/components/ToolCallCard.tsx:446; packages/contracts/types/src/tool-approval-stakes.ts:129
- **Where to find it:** Chat > a send tool step (email, message or invite) waiting for approval > the card shows the recipient rows (labels found in the code)
- **Needs:** a connected messaging or email app
- **Steps:**
  1. Ask the agent to send a message or email to a named person.
  2. When the card says "This tool requires approval before execution.", read the rows under it.
  3. Look: recipients are listed in the rows (To, Cc, and similar) before you click Allow.

## S59.14 Exact destination.

- **Expected:** Before an outbound action is approved, the approval shows the exact destination (URL, host or target).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:473; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:566
- **Where to find it:** Chat > an outbound tool step waiting for approval > the card's parameters block (labels found in the code)
- **Needs:** a tool that sends data outside the app
- **Steps:**
  1. Ask the agent to call a tool that goes to a site or service.
  2. Open the card's parameters block under "This tool requires approval before execution."
  3. Look for the URL, host or target in the parameters block.
  4. Note: the code shows raw arguments only; there is no dedicated destination row.

## S59.15 Exact amount or purchase.

- **Expected:** Before a payment or purchase is approved, the approval shows the exact amount and what is bought.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:302; packages/contracts/types/src/tool-approval-stakes.ts:130
- **Where to find it:** Chat > a payment or purchase tool step waiting for approval > the card shows amount and item rows (labels found in the code)
- **Needs:** a connected payment or store app
- **Steps:**
  1. Ask the agent to make a purchase or payment in a connected store.
  2. Read the card before approving.
  3. Look: the amount and item rows (from arguments such as amount and item) appear under the approval line.

## S59.16 Exact command.

- **Expected:** Before a command runs, the approval shows the exact command line (and where it will run).
- **Code:** done. Evidence present: apps/desktop/electron/runtime/dispatcher.ts:2017; apps/desktop/electron/runtime/dispatcher.ts:2071
- **Where to find it:** Desktop app > agent runs a local command > native dialog "Run a local command?" (labels found in the code)
- **Needs:** the Desktop app and a granted folder
- **Steps:**
  1. In the Desktop app, ask the agent to run a shell command in a folder you granted.
  2. Read the dialog: the message says Run <program> in this folder and the detail lists the command.
  3. Look: the buttons are Cancel and Run once (or Run without a sandbox when the sandbox is off).
  4. Click Cancel and check the command does not run.

## S59.17 Exact files or records affected.

- **Expected:** Before a write, the approval shows exactly which files or records will change.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:477; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:566
- **Where to find it:** Chat > a file-changing tool step waiting for approval > the card shows the file and its change (labels found in the code)
- **Needs:** a granted folder or a connected files app
- **Steps:**
  1. Ask the agent to edit or create a file in a granted folder.
  2. Read the card before clicking Allow.
  3. Look: the card shows the file name icon and the requested content or diff under "This tool requires approval before execution."

## S59.18 Proposed-diff preview.

- **Expected:** Before a file edit is approved, the user sees the proposed diff.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:466; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:566
- **Where to find it:** Chat > a file edit tool step waiting for approval > the card shows the diff block (labels found in the code)
- **Needs:** a file edit request
- **Steps:**
  1. Ask the agent to change text in a file.
  2. Before you approve, read the diff block in the card.
  3. Look: removed and added lines are shown before Allow.

## S59.19 Allow action.

- **Expected:** The user can allow a pending action and it then runs.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:415; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:566
- **Where to find it:** Chat > a tool step waiting for approval > Allow (labels found in the code)
- **Needs:** a tool that asks for approval
- **Steps:**
  1. Trigger a tool that needs approval.
  2. Click Allow on that card.
  3. Look: the card changes to the result and the tool runs as Expected.

## S59.20 Deny action.

- **Expected:** The user can deny a pending action; it does not run and the model is told it was denied.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:415; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:566
- **Where to find it:** Chat > a tool step waiting for approval > Deny (labels found in the code)
- **Needs:** a tool that asks for approval
- **Steps:**
  1. Trigger a tool that needs approval.
  2. Click Deny on that card.
  3. Look: the card shows Denied and the tool does not run; the agent replies that the action was refused.

## S59.22 Ask for an alternative.

- **Expected:** Instead of just denying, the user can tell the agent what to do instead, and the agent continues with that guidance.
- **Code:** done. Evidence present: apps/web/features/chat/components/approvals/ApprovalInbox.tsx:238; apps/web/lib/hooks/useChatStream.ts:5513
- **Where to find it:** Chat header > Approvals > pick a request > type in "Add guidance to steer the run (optional)" > Deny or Approve (labels found in the code)
- **Needs:** a tool that asks for approval
- **Steps:**
  1. Trigger a tool that needs approval, then open the Approvals button in the chat header.
  2. Type an instruction in the guidance box, for example a different way to do the task.
  3. Click Deny.
  4. Look: the request is denied and the run continues with the guidance, as Expected.

## S59.23 Approval expiration.

- **Expected:** A pending approval expires after a set time, the UI shows it expired, and the action cannot run from it.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:372; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:145
- **Where to find it:** Chat > an approval card whose run has ended > "This approval request expired or is no longer active." (labels found in the code)
- **Needs:** a request left unanswered until it expires
- **Steps:**
  1. Trigger a tool that needs approval and leave the card unanswered until the run ends or times out.
  2. Come back to the card.
  3. Look: it shows "This approval request expired or is no longer active." and has no Allow or Deny; the Approvals header shows "This request expired. Open the conversation to rerun the turn."

## S59.24 Approval history.

- **Expected:** The user can review a history of past approval requests and their decisions.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/approve/route.ts:631; apps/web/app/api/settings/approvals/route.ts:90; apps/web/features/settings/sections/CapabilitiesSection.tsx:219
- **Where to find it:** Settings > Capabilities > Approval history (labels found in the code)
- **Needs:** at least one past approval decision
- **Steps:**
  1. Open Settings > Capabilities and scroll below Tool approvals.
  2. Read the section "Approval history" with its entries list.
  3. Look: past requests appear newest first with the decision for each.

## S59.25 Revoke saved permission.

- **Expected:** The user can revoke a saved "always allow" (or folder/site grant) so the action asks again.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/dispatcher.ts:2316; apps/web/features/connectors/components/ToolPermissionsPanel.tsx:52
- **Where to find it:** Settings > Connectors > (connector) > Tool permissions > Reset all to default; Desktop: Settings > Desktop app > General > Permissions > Remove or Ask again (labels found in the code)
- **Needs:** a saved always-allow permission
- **Steps:**
  1. Set a tool to Always run without asking under Settings > Connectors > Tool permissions.
  2. Click Reset all to default and confirm.
  3. Trigger that tool again and look: it asks again.
  4. On the Desktop app, open Settings > Desktop app > General > Permissions, click Remove on a saved answer, and check it asks next time.

## S59.26 Approval from another device.

- **Expected:** An approval raised on one device can be answered from another signed-in device, and the first device sees the result.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:899; apps/web/lib/services/cloud-agent-run-service.ts:1917
- **Where to find it:** Second signed-in device > open the same chat > Approvals in the chat header (or Tasks > run "Waiting for your approval") (labels found in the code)
- **Needs:** two signed-in devices on the same account
- **Steps:**
  1. Start an approval on the first device and leave it pending.
  2. On a second device signed into the same account, open the same chat.
  3. Open Approvals in the header, approve the request.
  4. Look: the first device shows the result (Allowed or Denied) and the run continues.

## S59.28 Stronger confirmation for sensitive operations.

- **Expected:** Sensitive or irreversible actions get a stronger confirmation than routine ones (warning, no permanent allow, re-ask).
- **Code:** done. Evidence moved: apps/desktop/electron/runtime/permissionManager.ts:382; apps/desktop/electron/runtime/permissionManager.ts:292 (quoted code not found in the file now)
- **Where to find it:** Desktop app > ask AGI to run a shell command or control another app > the native window titled "Permission required" (its buttons are "Deny", "Allow this session", and "Never allow" for app control only). In the web chat, a high-risk tool card shows the notice and has no "Allow for this chat" button. (labels found in the code)
- **Needs:** a Desktop app and a run that asks for a high-impact permission; the tester cannot choose the trigger directly, so it may take a few tries
- **Steps:**
  1. Open the Desktop app and sign in.
  2. In a chat, ask AGI to run a shell command, or to control another app.
  3. When the native window "Permission required" appears, read its warning text and buttons.
  4. Check that the text says it is a high-impact permission that lasts until you quit the app, and that there is no "Always allow" button.
  5. For a web tool card with the high-risk notice, check that "Allow for this chat" is missing and the card is red.
  6. Compare with Expected: a stronger warning, no permanent allow, and the permission is asked again later.

## S59.29 User takeover.

- **Expected:** While the agent controls a screen or browser, the user can take over control and later hand it back.
- **Code:** done. Evidence moved: packages/contracts/local-runtime/src/protocol.ts:126 (quoted code not found in the file now); apps/desktop/electron/runtime/computerUseSession.ts:275; apps/desktop/electron/runtime/computerUseSession.ts:357; apps/desktop/electron/runtime/computerUseSession.ts:369; apps/desktop/electron/main.ts:2658; apps/web/features/desktop-host/hooks/use-computer-use-resume.ts:29; apps/web/features/desktop-host/hooks/use-computer-use-resume.ts:39; apps/web/features/desktop-host/components/DesktopChatRunner.tsx:11
- **Where to find it:** Desktop app > File > Take Over Screen Control (also the bar "AGI is using your computer" with the "Take over" button; hand back with File > Hand Back Screen Control or "Hand back"). Computer use must be on in Settings > Computer use. (labels found in the code)
- **Needs:** a Desktop app, computer use turned on, and a task that uses the screen (a Mac with screen permission for the app)
- **Steps:**
  1. Open the Desktop app, sign in, and turn on computer use in Settings > Computer use.
  2. Start a chat task that makes AGI use the screen, for example a click on a visible app.
  3. While AGI is using your computer, click the "Take over" button in the bar at the bottom of the window, or choose File > Take Over Screen Control.
  4. Check that the bar now says "Paused. You have the screen." and that AGI stops moving the pointer.
  5. Click "Hand back" in the bar, or choose File > Hand Back Screen Control, and check that AGI can act again.
  6. Compare with Expected: the user can take control while AGI works and give it back.

## S59.30 Resume after user intervention.

- **Expected:** After the user intervenes (approves, answers a question, or hands control back), the same run resumes where it stopped.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:415; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:566
- **Where to find it:** Chat > send a request that needs approval > click "Allow" on the tool card (the card text is "This tool requires approval before execution."). For computer use: "Hand back" in the Desktop bar sends a message that makes the run carry on. (labels found in the code)
- **Needs:** none for the approval card (a signed-in account where a tool needs approval); the computer-use hand-back needs the Desktop app and a paused computer-use run
- **Steps:**
  1. In a chat, send a request that makes AGI call a tool needing approval.
  2. When the tool card shows "This tool requires approval before execution.", click "Allow".
  3. Watch the same chat and the same tool entry: check that the run continues in this chat and does not start over.
  4. Optional on the Desktop app: while AGI is paused, click "Hand back" in the bar; check that a new message saying the control was handed back appears and that AGI takes a new screenshot and continues.
  5. Compare with Expected: after the user acts, the same run carries on where it stopped.

## S59.31 Action receipt and outcome display.

- **Expected:** After an approval decision the transcript shows what was decided and what happened (ran, result, or denied).
- **Code:** done. Evidence present: apps/web/lib/hooks/useChatStream.ts:5601; apps/web/features/chat/components/messages/ToolTimeline.tsx:490
- **Where to find it:** Chat > send a request that needs approval > click "Allow" or "Deny" on the tool card > read the tool summary line in the chat (the timeline). (labels found in the code)
- **Needs:** none beyond a signed-in account where a tool needs approval
- **Steps:**
  1. In a chat, send a request that makes AGI call a tool needing approval.
  2. Click "Deny" on the tool card and read the tool entry: it should say "You denied this tool." as the error and "The user denied permission to run this tool." as the result.
  3. Look at the tool timeline summary line: it should read "You denied 1 tool call" (or "You denied N tool calls").
  4. Send another request, click "Allow", and read the summary line when the tool finishes: it should read "Tool run complete" and the tool entry should show the result.
  5. Compare with Expected: each decision shows what was decided and what happened (denied, or ran with a result).
