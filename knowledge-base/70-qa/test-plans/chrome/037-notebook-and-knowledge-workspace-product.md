---
id: "PLAN-chrome-037"
type: "test-plan"
title: "Chrome · 37. Notebook and knowledge-workspace product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "37"
---
# Chrome · 37. Notebook and knowledge-workspace product

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S37.01 Notebook index.

- **Expected:** The user sees a list of their notebooks (knowledge workspaces) and can open one.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No notebook or knowledge-workspace code in apps/extension. Searched the folder with rg for notebook, knowledge workspace, knowledgeWorkspace and knowledge_workspace; no matches.
- **Needs:** a Free account

## S37.02 Notebook creation.

- **Expected:** The user can create a new notebook that is saved to the account.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No notebook creation code in apps/extension. The same rg search found no notebook or knowledge-workspace matches.
- **Needs:** a Free account

## S37.03 Notebook title and description.

- **Expected:** A notebook has a title and description the user can set and later edit.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No notebook title or description code in apps/extension. The same rg search found no matches.
- **Needs:** a Free account

## S37.14 Source-grounded chat.

- **Expected:** Chats in the notebook answer from its sources.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7359 (quoted code not found in the file now); apps/extension/src/side_panel.ts:7342 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/conversationSync.ts:195; apps/extension/src/background.ts:6194
- **Needs:** live-web
- **Where to find it:** not found in the code. The cited lines do not match: side_panel.ts lines 7342 and 7359 are in the computer-use start flow, not notebook chat. conversationSync.ts:195 is ensureCloudConversation and background.ts:6194 is the ENSURE_CLOUD_CONVERSATION handler. None of them read notebook sources. Searched for notebook, knowledge and grounded with no notebook match.
- **Needs:** a Free account

## S37.15 Notebook instructions.

- **Expected:** The notebook has instructions that apply to every chat in it.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No notebook instructions code in apps/extension. The same rg search found no notebook or knowledge-workspace matches.
- **Needs:** a Free account

## S37.37 Notebook-to-main-chat context handoff.

- **Expected:** From the main chat the user can bring a notebook's context into the conversation.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7359 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/conversationSync.ts:195
- **Where to find it:** not found in the code. The cited lines do not match a notebook handoff. The closest module, apps/extension/src/features/context-handoff/index.ts, hands selected page context to AGI Desktop or VS Code, not a notebook. Searched for notebook and knowledge with no notebook match.
- **Needs:** a Free account
