---
id: "PLAN-chrome-088"
type: "test-plan"
title: "Chrome · 88. Support, trust, and policy product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "88"
---
# Chrome · 88. Support, trust, and policy product

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S88.01 Contextual help links.

- **Expected:** Screens that need explaining link straight to the matching help or docs article for that feature.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/helpLinks.ts:37; apps/extension/src/side_panel.ts:15765; apps/extension/src/side_panel.ts:12609; apps/extension/src/features/side-panel/schedulesSection.ts:438; apps/extension/src/features/options/approval-history-section.ts:94
- **Where to find it:** Schedules > How schedules work (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Sign in to the extension if asked, then open the Schedules section in the side panel (the section titled "Schedules").
  2. Look at the row beside the "Schedules" title for the link "How schedules work".
  3. Click "How schedules work".
  4. Look at the new browser tab: it should open a help article about schedules, with the address ending in /help/schedules-and-triggers?from=chrome-extension, and compare with Expected.

## S88.02 Searchable help center.

- **Expected:** Users can search a help centre and open matching articles.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The extension has no help search. It only links to the web Help center (options.ts, "Help center", opening the /help page), and the search, if any, lives on the web side, which is not in this folder. Searched apps/extension/src for "help center", "helpcenter", "help-center" and "search help".
- **Needs:** live-web

## S88.03 Contact-support flow.

- **Expected:** A signed-in user can reach support from the product, describe a problem, and follow the replies.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** More > Help > Contact support (some labels not found in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in, then click the "More" button in the side panel header (its label is "More").
  2. Click "Help" in the menu. The options page opens on its Help section.
  3. In the Help section, find the row "Contact support" with the hint "Reach a person about your account."
  4. Click "Open" beside it, and look at the new tab that opens to the support page, then compare with Expected.

## S88.04 Report-a-bug flow.

- **Expected:** A user can report a bug from the product, with enough context (build, platform) for support to act.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No report-a-bug control was found in apps/extension/src. Searched for "report a bug", "report bug", "bug report" and "feedback" (non-test files); the only support entry is "Contact support" in the Help section, which does not send build or platform details.
- **Needs:** live-web

## S88.07 User-reviewable diagnostic bundle.

- **Expected:** A user can produce a diagnostic bundle, see what it contains, and choose to share it with support.
- **Code:** done. Evidence present: apps/extension/src/options.ts:2073; apps/extension/src/options.ts:2098
- **Where to find it:** More > Help > Export diagnostics (some labels not found in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in, then click the "More" button in the side panel header.
  2. Click "Help". The options page opens on its Help section.
  3. Find the row "Export diagnostics" with the hint "Saves a redacted bundle to attach to a support request. The server redacts it before you get the file." Read the hint.
  4. Click "Export" beside it. A JSON file downloads and the status line under the row shows a summary. Compare with Expected: the file is the only view of the contents, so open it in a text editor to see what it holds, then decide whether to attach it to a support request.

## S88.08 Request/error identifier.

- **Expected:** When a request fails, the user sees a reference id they can quote to support.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/chat-state.ts:233 (quoted code not found in the file now); apps/web/lib/error-handler.ts:346
- **Where to find it:** Chat > a request that fails > failed reply line ending "Reference:" (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account and a way to make a request fail
- **Steps:**
  1. Sign in and send a chat message in the side panel.
  2. Make a request fail (for example, a server error or a quota block); the failed reply is shown in the chat.
  3. Read the end of the failed reply for the words "Reference:" followed by an id.
  4. Compare with Expected: the id should be quotable to support. Check that the id is shown.
