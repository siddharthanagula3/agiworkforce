---
id: "PLAN-chrome-110"
type: "test-plan"
title: "Chrome · 110. Cross-product experiences to include in the product map"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "110"
---
# Chrome · 110. Cross-product experiences to include in the product map

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S110.01 Chat → editable document.

- **Expected:** A document the assistant writes in chat opens as an artifact the user can edit as a document and save back as a new version.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension/src for editable or contenteditable, textarea, version, publish and save-version controls. The artifact panel (src/features/side-panel/artifactPanel.ts) only offers Preview/Code, Copy, Download and 'Run in this chat on the web'; no in-extension edit or save-as-new-version control was found.
- **Needs:** a Free account

## S110.02 Document → presentation.

- **Expected:** A document (chat artifact or uploaded file) is turned into a presentation the user can open and keep working on.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/generatedFiles.ts:289
- **Where to find it:** not found in the code. Searched apps/extension/src and _locales for pptx, slides, presentation and deck. The only file actions are Open and Download (src/features/side-panel/generatedFiles.ts:284-290, and the Outputs popover in artifactPanel.ts); the code at generatedFiles.ts:289 is buildFileActions, not a conversion to a presentation.
- **Needs:** a Free account

## S110.12 Design → implementation.

- **Expected:** A design (generated prototype or Figma file) is handed to a coding agent and implemented in the user's repository.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension/src and _locales for figma, handoff, implement, coding agent and repository. Only a Figma page prompt exists (src/features/content/platform-prompts.ts:78); no hand-off from a design to a coding agent in the repository was found.
- **Needs:** a Free account

## S110.24 Existing notebook → main assistant context.

- **Expected:** From the main chat, the user brings an existing notebook (project) into the conversation so its instructions and sources ground the answers.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7359 (quoted code not found in the file now); apps/extension/src/side_panel.ts:7365 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/conversationSync.ts:357
- **Where to find it:** Chat composer > type @ > Projects heading > click the project row (the row says 'Start the chat in this project'); then check the header chip 'Project · <name>' (labels found in the code)
- **Needs:** a signed-in account with at least one project
- **Steps:**
  1. Sign in and make sure the account has at least one project.
  2. Click the chat box at the bottom of the side panel and type @.
  3. Look for the menu labelled 'Tabs and projects' with a 'Projects' heading.
  4. Click your project name (second line 'Start the chat in this project').
  5. Look for the header chip 'Project · <name>' above the chat.
  6. Ask a question that depends on the project's instructions or sources and compare the answer with Expected.

## S110.26 Usage exhaustion → alternative eligible path.

- **Expected:** When the user runs out of usage, the product offers an eligible alternative (named eligible model, reset wait, or purchase) that the user can take in one step and continue.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:9751; apps/extension/src/features/side-panel/bubbles.ts:319
- **Where to find it:** Chat, under the message 'Your Managed Cloud usage limit has been reached.' > click 'Add credits' (or the other recovery label shown), which opens the AGI web app in a new tab. A failed reply can also show 'Switch model', which opens the model picker. (labels found in the code)
- **Needs:** an account whose usage is used up
- **Steps:**
  1. Use an account whose usage is used up, then send a message in the side panel chat.
  2. Read the message that says 'Your Managed Cloud usage limit has been reached.' and the button beside it.
  3. Click the button, for example 'Add credits', and note that a new tab opens to the AGI web page.
  4. If a reply shows the 'Switch model' button, click it and check whether the model picker opens with a model you can pick.
  5. Compare with Expected: one step to an eligible alternative, reset wait or purchase.

## S110.28 Published output → versioned update.

- **Expected:** A published output is updated in place: the user changes it, republishes to the same link, and the new version is recorded and reversible.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension/src and _locales for publish, republish, version and link sharing. The only related text is 'The live preview is not available right now...' and an artifact app runtime message; no republish-to-same-link or version-history control was found.
- **Needs:** a Free account
