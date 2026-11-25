---
id: "PLAN-web-059"
type: "test-plan"
title: "Web · 59. Approvals and human-in-the-loop UI"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "59"
---
# Web · 59. Approvals and human-in-the-loop UI

27 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S59.01 One-action approval.

- **Expected:** When a single tool call needs approval, the user can approve or deny that one call and the run continues accordingly.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:415; apps/web/lib/hooks/useChatStream.ts:5513; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:566
- **Where to find it:** Chat > send a message that makes the agent use a tool that needs approval > on the tool card, click Allow or Deny (labels found in the code)
- **Needs:** a Free account or a paid account that can use tools
- **Steps:**
  1. Sign in with an account that can run tools, open a chat, and send a request that needs a tool (for example a web search or a file write).
  2. When the tool card shows 'This tool requires approval before execution.', read the card.
  3. Click Allow (or Deny) on that one card.
  4. Look at whether the tool ran (Allowed or Denied shown) and whether the reply continued, and compare with Expected.

## S59.02 Batch approval.

- **Expected:** The user can approve or deny several pending tool calls of a run in one action.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:899; apps/web/lib/services/cloud-agent-run-service.ts:1917
- **Where to find it:** not found in the code. Tasks page (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx) has Approve and deny actions per run, not per call; the code does not show several calls approved in one click. Each request in the Approvals popover has its own Approve and Deny.
- **Needs:** two or more pending tool calls in one run

## S59.03 Per-session approval.

- **Expected:** The user can allow a tool for the rest of the current session so it stops asking until the session ends.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:428; apps/web/features/chat/components/messages/MessageBubble.tsx:2343; apps/web/features/chat/components/messages/MessageBubble.tsx:2373; apps/web/features/chat/components/messages/MessageBubble.tsx:2679
- **Where to find it:** Chat > send a request that needs a tool > on the tool card, click Allow for this chat (labels found in the code)
- **Needs:** a Free account or a paid account that can use tools
- **Steps:**
  1. Open a chat and send a request that makes the agent use the same tool, such as a web search.
  2. On the approval card, click Allow for this chat (this button is not shown for high-risk requests).
  3. Send another request that uses the same tool in the same chat.
  4. Check that it runs without asking again, and compare with Expected. Note it applies to this chat only, not the whole session.

## S59.04 Per-application permission.

- **Expected:** The user can set allow/ask/deny per connected app (and per tool within it), and the runtime enforces it.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ToolPermissionsPanel.tsx:76; apps/web/app/api/connectors/permissions/route.ts:61; apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:71
- **Where to find it:** Connectors > choose a connector > tool permissions panel (heading text 'Control which tools this connector can run automatically.') (labels found in the code)
- **Needs:** a connected app (connector) on the account
- **Steps:**
  1. Open the Connectors page and choose a connected app.
  2. In its tool permissions panel, find a tool and change its level (allow, ask or deny).
  3. Use a chat request that calls that tool.
  4. Check the tool follows the level you chose, and compare with Expected.

## S59.06 Per-domain permission.

- **Expected:** The user can allow or block specific websites/domains the agent may act on or fetch, and it is enforced.
- **Code:** done. Evidence moved: apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:296; apps/web/app/api/settings/organization/connector-policy/route.ts:138; apps/web/lib/services/connector-policy-service.ts:83; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1521; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6313; apps/web/lib/web-search/web-search-tool.ts:464; apps/web/lib/url-fetch/url-fetch-tool.ts:556; apps/web/lib/url-fetch/url-fetch-tool.ts:572; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2735; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:880; apps/web/lib/services/scheduled-agent-executor.ts:261 (quoted code not found in the file now); apps/web/app/api/voice/live/sessions/route.ts:518; apps/web/db/neon/0336_workspace_web_domain_policy.sql:26
- **Where to find it:** Workspace console (organization settings) > web domain policy section ('Allow site' and 'Block site' buttons) (labels found in the code)
- **Needs:** a workspace admin account in a workspace
- **Steps:**
  1. Sign in as a workspace admin and open the workspace console.
  2. In the web domain section, type a site such as example.com into the site field.
  3. Click Allow site or Block site, then check that the site appears under Allowed sites or Blocked sites.
  4. Run a web search that should reach that site, and compare the result with Expected.

## S59.07 Persistent permission settings.

- **Expected:** Permission choices (policy and per-tool rules) persist across sessions and devices until changed.
- **Code:** done. Evidence present: apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:151; apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:48; apps/web/app/api/connectors/permissions/route.ts:61
- **Earlier check in the running app:** UI_ONLY: E024 [UI_ONLY; settings controls]: Code execution, approval radios, and lockdown switch visible. Skip approvals is selected but disabled; text says workspace enforcement asks every action. No permissions changed or enforcement tested.
- **Where to find it:** Settings > Capabilities > Tool approvals (radio group 'Default approval for tool actions') (labels found in the code)
- **Needs:** a signed-in account and a second device for the cross-device check
- **Steps:**
  1. Open Settings and go to the section that holds Tool approvals (the Capabilities section).
  2. Choose a different option in the Default approval for tool actions group.
  3. Sign out, or open the app on a second device signed in with the same account.
  4. Check the chosen option is still selected, and compare with Expected.

## S59.08 Permission-mode selector.

- **Expected:** The user can pick a permission mode (ask every time / auto for low risk / skip approvals) that governs how every tool runs.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5309; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4573 (quoted code not found in the file now); apps/web/lib/voice/live-voice-tools.ts:315; apps/web/lib/services/scheduled-agent-executor.ts:305
- **Earlier check in the running app:** UI_ONLY: E024 [UI_ONLY; settings controls]: Code execution, approval radios, and lockdown switch visible. Skip approvals is selected but disabled; text says workspace enforcement asks every action. No permissions changed or enforcement tested. | E056 [UI_ONLY; mode choices]: Isolated, Trusted hosts and Full internet choices visible. Kept Isolated; no security setting changed and no network isolation enforcement claim.
- **Where to find it:** Settings > Capabilities > Tool approvals (radio group 'Default approval for tool actions') (labels found in the code)
- **Needs:** a signed-in account; 'Skip approvals' may be disabled when the workspace requires asking every action
- **Steps:**
  1. Open Settings and go to Tool approvals in the Capabilities section.
  2. Choose one of the three options: 'Ask before every action', 'Run read-only actions without asking', or 'Skip approvals'.
  3. Run a read action and a write action in a chat.
  4. Check that each one behaves as the chosen mode says, and compare with Expected.

## S59.09 Read-only mode.

- **Expected:** The user can switch the agent into a read-only mode in which write, send and execute tools are refused.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:82; apps/web/app/api/connectors/permissions/route.ts:80; apps/web/features/connectors/components/ToolPermissionsPanel.tsx:179; apps/web/public/openapi.json:5618
- **Earlier check in the running app:** UI_ONLY: E024 [UI_ONLY; settings controls]: Code execution, approval radios, and lockdown switch visible. Skip approvals is selected but disabled; text says workspace enforcement asks every action. No permissions changed or enforcement tested.
- **Where to find it:** not found in the code. No read-only mode that refuses write, send and execute tools was found in the UI. The closest option, 'Run read-only actions without asking', still asks before writes. Searched the settings panels and tool-approval-policy.ts for a read-only refusal option.
- **Needs:** a Free account or a paid account

## S59.10 Ask-before-writing mode.

- **Expected:** A mode lets reads run automatically but stops and asks before any write, send or execute action.
- **Code:** done. Evidence present: apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:151; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:1083; packages/contracts/types/src/tool-approval-policy.ts:61
- **Earlier check in the running app:** UI_ONLY: E024 [UI_ONLY; settings controls]: Code execution, approval radios, and lockdown switch visible. Skip approvals is selected but disabled; text says workspace enforcement asks every action. No permissions changed or enforcement tested.
- **Where to find it:** Settings > Capabilities > Tool approvals > 'Run read-only actions without asking' (labels found in the code)
- **Needs:** a signed-in account that can use tools
- **Steps:**
  1. Open Settings, go to Tool approvals, and choose 'Run read-only actions without asking'.
  2. In a chat, ask for a read action such as a web search; it should run without a card.
  3. Ask for a write or send action; an approval card should appear.
  4. Check reads ran on their own and writes stopped for approval, and compare with Expected.

## S59.11 Automatic low-risk approval mode.

- **Expected:** A mode auto-approves low-risk actions (reads, searches) while riskier actions still ask.
- **Code:** done. Evidence present: apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:151; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:1083
- **Earlier check in the running app:** UI_ONLY: E024 [UI_ONLY; settings controls]: Code execution, approval radios, and lockdown switch visible. Skip approvals is selected but disabled; text says workspace enforcement asks every action. No permissions changed or enforcement tested.
- **Where to find it:** Settings > Capabilities > Tool approvals > 'Run read-only actions without asking' (labels found in the code)
- **Needs:** a signed-in account that can use tools
- **Steps:**
  1. Open Settings, go to Tool approvals, and choose 'Run read-only actions without asking'.
  2. Ask for a search or page read in a chat and confirm it runs without a card.
  3. Ask for an action that changes something and confirm an approval card appears.
  4. Compare with Expected. The option is the same one used for S59.10.

## S59.12 Approval summary.

- **Expected:** An approval request shows a plain summary of what the tool will do and why it needs approval.
- **Code:** done. Evidence present: apps/web/features/chat/components/approvals/ApprovalInbox.tsx:209; packages/ui/unified-chat/src/components/ToolCallCard.tsx:409; apps/web/lib/hooks/useChatStream.ts:5513
- **Where to find it:** Top bar of the chat > 'Approvals' button > a request card; the tool card in the conversation shows the same summary (labels found in the code)
- **Needs:** a request that needs approval
- **Steps:**
  1. Send a request that needs an approval.
  2. Click the Approvals button in the top bar, or look at the approval card in the conversation.
  3. Read the title, the Request block and the line 'This tool requires approval before execution.'
  4. Check the summary says what the tool will do and why it asks, and compare with Expected.

## S59.13 Exact recipients.

- **Expected:** Before a send is approved, the approval names exactly who will receive it.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:302; packages/ui/unified-chat/src/components/ToolCallCard.tsx:446; packages/contracts/types/src/tool-approval-stakes.ts:129
- **Where to find it:** Chat > a request that sends a message or email > on the approval card, read the Request and detail rows (labels found in the code)
- **Needs:** a send-type tool connected to the account
- **Steps:**
  1. Ask the agent to send a message to a named person.
  2. Wait for the approval card to appear in the conversation.
  3. Read the detail rows on the card and the Request block.
  4. Check that the recipients are named before you approve, and compare with Expected.

## S59.14 Exact destination.

- **Expected:** Before an outbound action is approved, the approval shows the exact destination (URL, host or target).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:473; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1063; apps/web/lib/hooks/useChatStream.ts:5513
- **Where to find it:** Chat > a request that opens or sends to an outside destination > on the approval card, read the detail rows (labels found in the code)
- **Needs:** a request that reaches an outside site
- **Steps:**
  1. Ask the agent to fetch a web page or send data to an outside site.
  2. Wait for the approval card.
  3. Read the detail rows for the destination (URL or host).
  4. Check the destination shows before you approve, and compare with Expected.

## S59.15 Exact amount or purchase.

- **Expected:** Before a payment or purchase is approved, the approval shows the exact amount and what is bought.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:302; packages/contracts/types/src/tool-approval-stakes.ts:130
- **Where to find it:** not found in the code. The approval stakes code has a purchase entry, but no purchase tool was found to test it. The exact wording on screen was not read.
- **Needs:** a purchase-capable tool connected to the account

## S59.16 Exact command.

- **Expected:** Before a command runs, the approval shows the exact command line (and where it will run).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:469; apps/web/lib/hooks/useChatStream.ts:5513
- **Where to find it:** Chat > a request that runs a command > on the approval card, read the Request block (labels found in the code)
- **Needs:** a tool that runs commands
- **Steps:**
  1. Ask the agent to run a command such as listing files in a folder.
  2. Wait for the approval card.
  3. Read the Request block, which shows the command text.
  4. Check the exact command line is shown before you approve, and compare with Expected.

## S59.17 Exact files or records affected.

- **Expected:** Before a write, the approval shows exactly which files or records will change.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:477; packages/ui/unified-chat/src/components/ToolCallCard.tsx:466; apps/web/lib/hooks/useChatStream.ts:5513
- **Where to find it:** Chat > a request that writes a file > on the approval card, read the detail rows and the Request block (labels found in the code)
- **Needs:** a tool that writes files
- **Steps:**
  1. Ask the agent to create or change a file.
  2. Wait for the approval card.
  3. Read the detail rows and the Request block for the file or record names.
  4. Check that the exact files or records are named before you approve, and compare with Expected.

## S59.18 Proposed-diff preview.

- **Expected:** Before a file edit is approved, the user sees the proposed diff.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:466; packages/ui/unified-chat/src/components/ToolCallCard.tsx:299; apps/web/lib/hooks/useChatStream.ts:5513
- **Where to find it:** Chat > a request that edits a file > on the approval card, read the Request block (diff view) (labels found in the code)
- **Needs:** a tool that edits files
- **Steps:**
  1. Ask the agent to change text in a file.
  2. Wait for the approval card.
  3. Look in the Request block for the proposed diff lines.
  4. Check the proposed change is visible before you approve, and compare with Expected.

## S59.19 Allow action.

- **Expected:** The user can allow a pending action and it then runs.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:415; apps/web/lib/hooks/useChatStream.ts:5513; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:566
- **Where to find it:** Chat > send a request that needs a tool > on the approval card, click Allow (labels found in the code)
- **Needs:** a request that needs approval
- **Steps:**
  1. Send a request that needs approval.
  2. When the approval card appears, click Allow.
  3. Watch the tool card change state and the run continue.
  4. Check the action ran and the card shows its result, and compare with Expected.

## S59.20 Deny action.

- **Expected:** The user can deny a pending action; it does not run and the model is told it was denied.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:415; apps/web/lib/hooks/useChatStream.ts:5513; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:566
- **Where to find it:** Chat > send a request that needs a tool > on the approval card, click Deny (labels found in the code)
- **Needs:** a request that needs approval
- **Steps:**
  1. Send a request that needs approval.
  2. When the approval card appears, click Deny.
  3. Check the card shows 'Denied' and the action did not run.
  4. Ask the agent what happened; it should say the action was denied, and compare with Expected.

## S59.22 Ask for an alternative.

- **Expected:** Instead of just denying, the user can tell the agent what to do instead, and the agent continues with that guidance.
- **Code:** done. Evidence present: apps/web/features/chat/components/approvals/ApprovalInbox.tsx:238; apps/web/lib/hooks/useChatStream.ts (text found, layout changed)
- **Where to find it:** Top bar > 'Approvals' button > a request > text box 'Add guidance to steer the run (optional)', then Approve or Deny (labels found in the code)
- **Needs:** a request that needs approval
- **Steps:**
  1. Send a request that needs approval.
  2. Click the Approvals button, then type guidance such as 'use a different site instead' in the box.
  3. Click Deny (or Approve) for that request.
  4. Check the agent continues with your guidance in the same chat, and compare with Expected.

## S59.23 Approval expiration.

- **Expected:** A pending approval expires after a set time, the UI shows it expired, and the action cannot run from it.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:372; apps/web/lib/services/cloud-agent-run-service.ts:457; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:145
- **Where to find it:** Chat > a request that needs approval > leave it waiting until it expires; the card then shows 'This approval request expired or is no longer active.' (labels found in the code)
- **Needs:** a request that needs approval, and patience for the time limit
- **Steps:**
  1. Send a request that needs approval and do not answer it.
  2. Wait for the time limit to pass (the length is not shown in the UI).
  3. Check the card shows the expired message and has no Allow button.
  4. Try to use the old card; the action should not run, and compare with Expected.

## S59.24 Approval history.

- **Expected:** The user can review a history of past approval requests and their decisions.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/approve/route.ts:631; apps/web/app/api/settings/approvals/route.ts:90; apps/web/features/settings/sections/CapabilitiesSection.tsx:219
- **Where to find it:** Settings > Capabilities > 'Approval history' (labels found in the code)
- **Needs:** a signed-in account with past approvals
- **Steps:**
  1. Open Settings and go to the Capabilities section.
  2. Find the 'Approval history' heading.
  3. Read the list, which shows requests you allowed or denied in chats, newest first.
  4. Compare the list with the decisions you made earlier, and compare with Expected.

## S59.25 Revoke saved permission.

- **Expected:** The user can revoke a saved "always allow" (or folder/site grant) so the action asks again.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ToolPermissionsPanel.tsx:52; apps/web/app/api/connectors/permissions/route.ts:131
- **Where to find it:** Connectors > choose a connector > tool permissions panel > 'Reset all to default' > 'Reset permissions' (labels found in the code)
- **Needs:** a connected app with saved permission choices
- **Steps:**
  1. Open the Connectors page and choose a connected app with saved allow or deny choices.
  2. Click Reset all to default.
  3. Read the confirmation and click Reset permissions.
  4. Use a chat request that calls the tool, and check it asks again, and compare with Expected.

## S59.26 Approval from another device.

- **Expected:** An approval raised on one device can be answered from another signed-in device, and the first device sees the result.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:899; apps/web/lib/services/cloud-agent-run-service.ts:1917
- **Where to find it:** Tasks page (run list) > a run waiting for approval; or the card text 'Waiting for [device]. Open the desktop app to continue.' (labels found in the code)
- **Needs:** two signed-in devices with the same account, plus a desktop app
- **Steps:**
  1. Start a task on one device that needs an approval (the desktop app).
  2. Sign in with the same account on a second device and open the same run.
  3. Approve the request on the second device.
  4. Check the first device shows the result, and compare with Expected.

## S59.28 Stronger confirmation for sensitive operations.

- **Expected:** Sensitive or irreversible actions get a stronger confirmation than routine ones (warning, no permanent allow, re-ask).
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/ToolCallCard.tsx:52 (quoted code not found in the file now); packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:974
- **Where to find it:** Chat > a sensitive request that needs approval > the approval card shows a high-risk notice and no 'Allow for this chat' button (some labels not found in the code; trust the screen)
- **Needs:** a request that triggers a high-risk approval
- **Steps:**
  1. Send a request that is risky, such as one that could send private data outside.
  2. Wait for the approval card.
  3. Read the red notice at the top of the card and check that 'Allow for this chat' is not shown.
  4. Click Allow only if you mean it, and compare with Expected.

## S59.30 Resume after user intervention.

- **Expected:** After the user intervenes (approves, answers a question, or hands control back), the same run resumes where it stopped.
- **Code:** done. Evidence present: apps/web/lib/hooks/useChatStream.ts:5513; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:566; packages/ui/unified-chat/src/components/ToolCallCard.tsx:415
- **Where to find it:** Chat > send a message that makes the assistant use a tool that needs approval > the tool card shows the text 'This tool requires approval before execution.' > click Allow (or Deny) (labels found in the code)
- **Needs:** a paid account or a Free account that can reach a tool needing approval
- **Steps:**
  1. Sign in and open a new chat.
  2. Send a request that makes the assistant use a tool needing approval, for example a web action or a connector action.
  3. When the tool card shows 'This tool requires approval before execution.', click Allow.
  4. Watch the same assistant message: the run should carry on in that message after the click, and the tool card should show its result.
  5. Compare with Expected: the run continues from where it stopped after the approval, with no new message started by hand.

## S59.31 Action receipt and outcome display.

- **Expected:** After an approval decision the transcript shows what was decided and what happened (ran, result, or denied).
- **Code:** done. Evidence present: apps/web/lib/hooks/useChatStream.ts:5601; apps/web/features/chat/components/messages/ToolTimeline.tsx:490
- **Where to find it:** Chat > after Allow or Deny on a tool card > look at the tool step in the same assistant message (count line 'You denied 1 tool call' or 'N denied') (labels found in the code)
- **Needs:** a paid account or a Free account that can reach a tool needing approval
- **Steps:**
  1. Trigger a tool that needs approval in a chat (see S59.30).
  2. Click Deny on the tool card and wait for the reply to finish.
  3. Look at the tool step in the transcript: it should say the call was denied, using the count line 'You denied {count} tool call' and the 'denied' counter next to the step.
  4. Click Allow on a second tool request, then look at its card: the result block should show what ran, or the error text if it failed.
  5. Compare with Expected: the transcript shows what was decided and what happened (ran, result, or denied).
