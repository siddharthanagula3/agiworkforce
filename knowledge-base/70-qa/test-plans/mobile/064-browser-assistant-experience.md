---
id: "PLAN-mobile-064"
type: "test-plan"
title: "Mobile · 64. Browser-assistant experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "64"
---
# Mobile · 64. Browser-assistant experience

4 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S64.01 Current-page context.

- **Expected:** The assistant reads the page open in the user's browser and answers with it as context.
- **Code:** done. Evidence moved: apps/mobile/src/features/share-preview/index.tsx:126 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:3295
- **Where to find it:** not found in the code. No code reads the page open in the browser. The only page-related entry is the iOS share sheet, which passes the page URL and any selected text, not the page content. Searched apps/mobile for 'current page', 'currentPage', 'active tab', 'open page', 'browser tab' and 'pageContext' with no page-reading code found, and the cited chatExecutionStore.ts:3295 is cloud turn handling, not page capture.

## S64.02 Selected-text context.

- **Expected:** Text the user highlights on a web page reaches the assistant as context for a question.
- **Code:** done. Evidence present: apps/mobile/native/ios/AGIShareExtension/ShareViewController.swift:369
- **Where to find it:** Safari > Share button > Share with AGI > Save for AGI Review > open AGI Mobile > Send to Chat (labels found in the code)
- **Needs:** a signed-in account or local mode; an iPhone with Safari; the iOS app build with the share extension
- **Steps:**
  1. In Safari, select some text on a web page.
  2. Tap the Share button and choose the AGI share extension, titled Share with AGI.
  3. Tap Save for AGI Review.
  4. Open AGI Mobile. The share preview screen shows the selected text.
  5. Tap Send to Chat.
  6. Look in the chat that opens: the assistant's reply should use the selected text as context.

## S64.05 Page summary.

- **Expected:** One action summarizes the page the user is viewing.
- **Code:** done. Evidence moved: apps/mobile/src/features/share-preview/index.tsx:126 (quoted code not found in the file now)
- **Where to find it:** Safari > Share button > Share with AGI > Save for AGI Review > open AGI Mobile > Summarize this page (labels found in the code)
- **Needs:** a signed-in account or local mode; an iPhone with Safari; the iOS app build with the share extension
- **Steps:**
  1. In Safari, open a web page, tap the Share button and choose Share with AGI.
  2. Tap Save for AGI Review, then open AGI Mobile.
  3. On the share preview screen, find the two buttons under the shared text.
  4. Tap Summarize this page.
  5. Look in the new chat: a reply starting from the prompt 'Summarize this page.' should appear, with the page link in the message.

## S64.06 Question about page.

- **Expected:** The user asks a free-form question and the answer uses the current page's content.
- **Code:** done. Evidence present: apps/mobile/src/features/share-preview/index.tsx:234; apps/mobile/stores/chat/chatExecutionStore.ts:3295
- **Where to find it:** Safari > Share button > Share with AGI > Save for AGI Review > open AGI Mobile > Ask about this page (labels found in the code)
- **Needs:** a signed-in account or local mode (the button is disabled otherwise); an iPhone with Safari; the iOS app build with the share extension
- **Steps:**
  1. In Safari, open a web page, tap the Share button and choose Share with AGI.
  2. Tap Save for AGI Review, then open AGI Mobile.
  3. On the share preview screen, tap Ask about this page.
  4. The chat opens with the shared text placed in the message box. Type your own question after it.
  5. Send the question and look at the reply: it should answer using the page's content that was shared.
