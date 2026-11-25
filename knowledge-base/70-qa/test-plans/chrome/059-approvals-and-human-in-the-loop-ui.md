---
id: "PLAN-chrome-059"
type: "test-plan"
title: "Chrome · 59. Approvals and human-in-the-loop UI"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "59"
---
# Chrome · 59. Approvals and human-in-the-loop UI

24 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S59.01 One-action approval.

- **Expected:** When a single tool call needs approval, the user can approve or deny that one call and the run continues accordingly.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:489 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:1260
- **Where to find it:** Side panel > chat > approval card > Approve or Decline. During a browser task the same card shows Allow or Skip. (labels found in the code)
- **Needs:** a signed-in account and an approved site for a browser task
- **Steps:**
  1. Start a chat task that makes the agent use a tool needing approval (a browser task on an approved site works).
  2. When the approval card appears, click Allow (browser task) or Approve (chat).
  3. Look for the action running and the run continuing.
  4. Repeat with Skip or Decline and look for the action not running.

## S59.02 Batch approval.

- **Expected:** The user can approve or deny several pending tool calls of a run in one action.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No batch control found. Searched apps/extension/src for approve all, decline all, allow all and batch; each pending call has only its own buttons in bubbles.ts and computerUsePanel.ts.
- **Needs:** a run with several pending tool calls

## S59.03 Per-session approval.

- **Expected:** The user can allow a tool for the rest of the current session so it stops asking until the session ends.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:1011; apps/extension/src/features/side-panel/bubbles.ts:1019; apps/extension/src/side_panel.ts:5543; apps/extension/src/side_panel.ts:13899 (quoted code not found in the file now); apps/extension/src/background.ts:4198 (quoted code not found in the file now); apps/extension/src/features/side-panel/computerUsePanel.ts:907
- **Where to find it:** Side panel > browser task > approval card > Allow for this task (chat cards use Allow for this chat). (labels found in the code)
- **Needs:** a browser task on an approved site
- **Steps:**
  1. Start a browser task on an approved site that triggers an approval.
  2. Click Allow for this task on the approval card.
  3. Let the same tool run again in the task and look for no new approval card.
  4. Start a new task and check that the tool asks again.

## S59.06 Per-domain permission.

- **Expected:** The user can allow or block specific websites/domains the agent may act on or fetch, and it is enforced.
- **Code:** done. Evidence present: apps/extension/src/features/options/site-allowlist.ts:34; apps/extension/src/features/computer-use/approvalPolicy.ts:353
- **Where to find it:** Extension settings > Permissions > Approved sites (Add or Remove for the current site). (labels found in the code)
- **Needs:** a website open in a tab
- **Steps:**
  1. Open a website in a tab and click the side panel's menu item Extension settings (the settings menu location was not traced).
  2. Click Permissions in the Options page navigation.
  3. In the Approved sites area, click Add for the open site.
  4. Open a task on that site and on a site not in the list, and look for the agent acting only on approved sites.

## S59.07 Persistent permission settings.

- **Expected:** Permission choices (policy and per-tool rules) persist across sessions and devices until changed.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/computerUsePanel.ts:613 (quoted code not found in the file now); apps/extension/src/features/options/site-allowlist.ts:34
- **Where to find it:** Extension settings > Permissions > Approved sites list. (labels found in the code)
- **Needs:** a website open in a tab
- **Steps:**
  1. Open Extension settings and go to Permissions.
  2. Add the current site under Approved sites.
  3. Close and reopen the browser, then reopen Options.
  4. Look for the site still listed under Approved sites.

## S59.08 Permission-mode selector.

- **Expected:** The user can pick a permission mode (ask every time / auto for low risk / skip approvals) that governs how every tool runs.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/computerUsePanel.ts:607 (quoted code not found in the file now); apps/extension/src/features/computer-use/approvalPolicy.ts:353
- **Where to find it:** Side panel > the mode chip beside the + button in the composer > pick Ask first, Auto, Full access or YOLO. (labels found in the code)
- **Steps:**
  1. Open the side panel and find the chip beside the + button.
  2. Click the chip; the heading reads How should AGI act in your browser?.
  3. Pick Ask first, then Auto, then Full access, then YOLO.
  4. Start a browser task in each mode and look for the approval prompts to change with the mode.

## S59.09 Read-only mode.

- **Expected:** The user can switch the agent into a read-only mode in which write, send and execute tools are refused.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:14829; apps/web/app/connectors/page.tsx:23; apps/web/features/connectors/components/ToolPermissionsPanel.tsx:179; apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** not found in the code. No read-only mode found. Searched apps/extension for read-only, readonly and read only; only unrelated hits (for example the card text This card is read-only in Chrome). The four modes in S59.08 have no read-only option.

## S59.10 Ask-before-writing mode.

- **Expected:** A mode lets reads run automatically but stops and asks before any write, send or execute action.
- **Code:** done. Evidence moved: apps/extension/src/background.ts:4200 (quoted code not found in the file now); apps/extension/src/features/computer-use/approvalPolicy.ts:169; apps/extension/src/background.ts:4198 (quoted code not found in the file now)
- **Where to find it:** Side panel > the mode chip beside the + button > Ask first. (labels found in the code)
- **Needs:** an approved site for a browser task
- **Steps:**
  1. Open the mode chip beside the + button and choose Ask first.
  2. Start a browser task that reads a page and then tries to type or click.
  3. Look for the reads to run without a card and the write action to show the approval card.
  4. Compare with Expected.

## S59.11 Automatic low-risk approval mode.

- **Expected:** A mode auto-approves low-risk actions (reads, searches) while riskier actions still ask.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/computerUsePanel.ts:607 (quoted code not found in the file now); apps/extension/src/features/computer-use/approvalPolicy.ts:408
- **Where to find it:** Side panel > the mode chip beside the + button > Auto. (labels found in the code)
- **Needs:** an approved site for a browser task
- **Steps:**
  1. Open the mode chip beside the + button and choose Auto.
  2. Start a browser task on an approved site.
  3. Look for reads and page searches to run without a card.
  4. Look for sending, deleting, signing in or downloading to show an approval card.

## S59.12 Approval summary.

- **Expected:** An approval request shows a plain summary of what the tool will do and why it needs approval.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:467 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:1260
- **Where to find it:** Side panel > browser task > approval card (title Approve action: followed by the tool name). (labels found in the code)
- **Needs:** an approved site for a browser task
- **Steps:**
  1. Start a browser task that needs an approval.
  2. Read the approval card title and the line under it.
  3. Compare the plain summary with Expected: what the tool will do and why it needs approval.

## S59.13 Exact recipients.

- **Expected:** Before a send is approved, the approval names exactly who will receive it.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:926; packages/contracts/types/src/tool-approval-stakes.ts:129
- **Where to find it:** Side panel > chat > approval card for a send tool (the stakes list shows the recipient fields). (labels found in the code)
- **Needs:** a signed-in account and a send-capable connector
- **Steps:**
  1. Start a chat where the agent asks to send a message or email.
  2. Read the approval card before clicking Approve.
  3. Look for the recipient names or addresses listed in the card.

## S59.14 Exact destination.

- **Expected:** Before an outbound action is approved, the approval shows the exact destination (URL, host or target).
- **Code:** done. Evidence present: apps/extension/src/features/computer-use/describeAction.ts:106; apps/extension/src/features/side-panel/computerUsePanel.ts:891; apps/extension/src/features/computer-use/approvalPolicy.ts:353
- **Where to find it:** Side panel > browser task > approval card (description line shows the host or URL). (labels found in the code)
- **Needs:** an approved site for a browser task
- **Steps:**
  1. Start a browser task that will open or navigate to another site.
  2. Read the description on the approval card before clicking Allow.
  3. Look for the destination host (for navigate: Open <host> in this tab) or URL.

## S59.15 Exact amount or purchase.

- **Expected:** Before a payment or purchase is approved, the approval shows the exact amount and what is bought.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:926; apps/extension/src/features/computer-use/approvalPolicy.ts:390; apps/extension/src/features/computer-use/agentLoop.ts:1617; apps/extension/src/features/computer-use/agentLoop.ts:1133
- **Where to find it:** Side panel > browser task > the agent reaches a checkout; the agent refuses with a message beginning Not done: this completes a purchase or payment. (labels found in the code)
- **Needs:** an approved shopping site
- **Steps:**
  1. Start a browser task on a shopping page and ask it to buy an item.
  2. When it reaches the payment step, read the message in the task.
  3. Look for the message to say the purchase was not done and the user must check the amount.
  4. Also look at a chat approval card for a payment tool: it lists amount and item.

## S59.19 Allow action.

- **Expected:** The user can allow a pending action and it then runs.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:489 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:1260
- **Where to find it:** Side panel > chat > approval card > Approve (browser task cards use Allow). (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Trigger an approval in chat or in a browser task.
  2. Click Approve (chat) or Allow (browser task).
  3. Look for the action to run and the result to appear in the transcript.

## S59.20 Deny action.

- **Expected:** The user can deny a pending action; it does not run and the model is told it was denied.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:489 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:1260
- **Where to find it:** Side panel > chat > approval card > Decline (browser task cards use Skip). (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Trigger an approval in chat or in a browser task.
  2. Click Decline (chat) or Skip (browser task).
  3. Look for the action not to run, and the transcript to say it was denied or skipped.

## S59.22 Ask for an alternative.

- **Expected:** Instead of just denying, the user can tell the agent what to do instead, and the agent continues with that guidance.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:946; apps/extension/src/side_panel.ts:5642; apps/extension/src/side_panel.ts:5670; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:1270; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:2135
- **Where to find it:** Side panel > chat > approval card > the text box Add guidance to steer the run (optional), typed before Approve or Decline. (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Trigger a chat approval.
  2. Type an alternative into the box Add guidance to steer the run (optional).
  3. Click Decline.
  4. Look for the agent to continue with that guidance in the next step.

## S59.23 Approval expiration.

- **Expected:** A pending approval expires after a set time, the UI shows it expired, and the action cannot run from it.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/computerUsePanel.ts:1127 (quoted code not found in the file now); apps/extension/src/features/computer-use/agentLoop.ts:624 (quoted code not found in the file now)
- **Where to find it:** Side panel > browser task > approval card left unanswered for 5 minutes. (labels found in the code)
- **Needs:** an approved site for a browser task; a wait of about 5 minutes
- **Steps:**
  1. Start a browser task that needs an approval.
  2. Do not click anything on the card for 5 minutes.
  3. Look for the buttons to become disabled and the title to read Skipped (no response).

## S59.24 Approval history.

- **Expected:** The user can review a history of past approval requests and their decisions.
- **Code:** done. Evidence present: apps/extension/src/options.ts:1614; apps/extension/src/features/options/approval-history-section.ts:196; apps/extension/src/features/options/approval-history-section.ts:162
- **Where to find it:** Extension settings > Permissions > Approval history. (labels found in the code)
- **Needs:** a signed-in account with past approvals
- **Steps:**
  1. Open Extension settings and go to Permissions.
  2. Scroll to Approval history.
  3. Look for past decisions with tool name, decision and time.
  4. Click Open chat on an entry to see the chat where it was decided.

## S59.25 Revoke saved permission.

- **Expected:** The user can revoke a saved "always allow" (or folder/site grant) so the action asks again.
- **Code:** done. Evidence present: apps/extension/src/options.ts:1453; apps/extension/src/features/options/site-allowlist.ts:34
- **Where to find it:** Extension settings > Permissions > Approved sites list > click Remove beside a site. (labels found in the code)
- **Needs:** a site already approved
- **Steps:**
  1. Open Extension settings and go to Permissions.
  2. In the Approved sites list, click Remove beside a site (the x button is titled Remove followed by the origin).
  3. Open a task on that site.
  4. Look for the agent to ask again before acting there.

## S59.26 Approval from another device.

- **Expected:** An approval raised on one device can be answered from another signed-in device, and the first device sees the result.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No code found that lets a second device answer an approval. Searched the approval history and chat approval code; the only match was the history hint text Tool requests you allowed or denied in chats on every device.
- **Needs:** two signed-in devices

## S59.28 Stronger confirmation for sensitive operations.

- **Expected:** Sensitive or irreversible actions get a stronger confirmation than routine ones (warning, no permanent allow, re-ask).
- **Code:** done. Evidence present: apps/extension/src/features/computer-use/approvalPolicy.ts:358; apps/extension/src/features/side-panel/computerUsePanel.ts:891
- **Where to find it:** Side panel > chat > approval card for a high-risk tool (no Allow for this chat button; warning text shown). (labels found in the code)
- **Needs:** a signed-in account and a high-risk tool
- **Steps:**
  1. Trigger a chat approval for a high-risk tool.
  2. Look for the warning text Private data from this chat could be sent outside AGI.
  3. Look for no Allow for this chat button, only Approve and Decline.
  4. Compare with a low-risk approval card, which does show Allow for this chat.

## S59.29 User takeover.

- **Expected:** While the agent controls a screen or browser, the user can take over control and later hand it back.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/computerUsePanel.ts:1227; apps/extension/src/features/side-panel/computerUsePanel.ts:1234; apps/extension/src/features/computer-use/runOwnership.ts:120; apps/extension/src/background.ts:4491 (quoted code not found in the file now)
- **Where to find it:** Side panel > during a browser task, the button Take over (after pausing, the button Continue appears). (labels found in the code)
- **Needs:** an approved site for a browser task
- **Steps:**
  1. Start a browser task on an approved site.
  2. While it runs, click Take over.
  3. Use the page yourself and look for the handoff banner to tell you to choose Continue.
  4. Click Continue and look for AGI to take the page back.

## S59.30 Resume after user intervention.

- **Expected:** After the user intervenes (approves, answers a question, or hands control back), the same run resumes where it stopped.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:489 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:569 (quoted code not found in the file now)
- **Where to find it:** Side panel > browser task > Continue (after Take over). (labels found in the code)
- **Needs:** an approved site for a browser task
- **Steps:**
  1. Start a browser task and click Take over.
  2. Make a change on the page, then click Continue.
  3. Look for the task to carry on from the same step rather than restart.

## S59.31 Action receipt and outcome display.

- **Expected:** After an approval decision the transcript shows what was decided and what happened (ran, result, or denied).
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:479 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:1260
- **Where to find it:** Side panel > browser task > transcript step titles Completed, Skipped, Not verified or Result, followed by the tool name. (labels found in the code)
- **Needs:** an approved site for a browser task
- **Steps:**
  1. Run a browser task with an approval.
  2. Decide the approval (Allow or Skip).
  3. Read the step title in the transcript.
  4. Look for Completed or Skipped with the tool name, and the result text under it.
