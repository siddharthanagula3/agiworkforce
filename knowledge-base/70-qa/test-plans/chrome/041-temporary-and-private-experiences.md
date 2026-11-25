---
id: "PLAN-chrome-041"
type: "test-plan"
title: "Chrome · 41. Temporary and private experiences"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "41"
---
# Chrome · 41. Temporary and private experiences

4 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S41.14 Local-only conversation.

- **Expected:** The user can keep conversations only on their device, never uploaded to the account.
- **Code:** done. Evidence present: apps/extension/src/features/options/data-handling-section.ts:173; apps/extension/src/options.ts (text found, layout changed); apps/extension/src/features/background/conversation-history.ts:1983
- **Where to find it:** Add attachment (composer button) > Temporary chat, or More > Extension settings > Account > Save Managed Cloud chats to my account (switch) (labels found in the code)
- **Needs:** A signed-in AGI account; a Managed Cloud chat to see the mirror switch take effect; a web or mobile check for account history.
- **Steps:**
  1. Sign in to the AGI side panel and open the composer's "Add attachment" button.
  2. Click "Temporary chat" and send a message in the new chat.
  3. Open More > Extension settings, then click "Account" in the left list of the options page.
  4. Find "Save Managed Cloud chats to my account" under "Privacy and data handling", switch it off, and start a Managed Cloud chat.
  5. Check that the chat appears only in this browser and not in the account's history on the web or mobile, and compare with Expected.

## S41.18 Separate history, training, and retention controls.

- **Expected:** History, model training and data retention each have their own clearly separate control or statement.
- **Code:** done. Evidence present: apps/extension/src/features/privacy/dataHandling.ts:44; apps/extension/src/features/privacy/dataHandling.ts:49; apps/extension/src/features/options/data-handling-section.ts:155
- **Where to find it:** More > Extension settings > Account > Privacy and data handling (labels found in the code)
- **Steps:**
  1. Open More, then click "Extension settings".
  2. In the options page, click "Account" in the left list.
  3. Scroll to the "Privacy and data handling" section.
  4. Read the separate rows "Save Managed Cloud chats to my account" (a switch), "Model training" (text only) and "How long chats are kept" (text only).
  5. Check that history, training and retention each have their own row, and compare with Expected.

## S41.19 Privacy-setting education.

- **Expected:** The product explains, in context, what each privacy setting does.
- **Code:** done. Evidence moved: apps/extension/src/features/privacy/dataHandling.ts:24; apps/extension/src/side_panel.ts:5598 (quoted code not found in the file now); apps/extension/src/features/options/data-handling-section.ts:177; apps/extension/src/features/background/conversation-history.ts:1983
- **Where to find it:** Add attachment > Temporary chat (hint line under the item), and More > Extension settings > Account > Privacy and data handling (text under each row) (labels found in the code)
- **Steps:**
  1. Open the composer's "Add attachment" button and look at the "Temporary chat" item and its hint line.
  2. Click "Temporary chat" to close the menu, then open More > Extension settings.
  3. Click "Account" and scroll to "Privacy and data handling".
  4. Read the text under "Model training", "How long chats are kept" and the switch "Save Managed Cloud chats to my account", and check each one says what the setting does, and compare with Expected.

## S41.20 Per-feature processing-location disclosure.

- **Expected:** For each feature the product says where the data is processed (on device, AGI cloud, a named provider).
- **Code:** done. Evidence moved: apps/extension/src/features/privacy/dataHandling.ts:39; apps/extension/src/side_panel.ts:5598 (quoted code not found in the file now); apps/extension/src/features/background/conversation-history.ts:1983
- **Where to find it:** More > Extension settings > Account > Privacy and data handling (labels found in the code)
- **Needs:** none for reading; a Free account to see the Free-plan provider wording.
- **Steps:**
  1. Open More, then click "Extension settings".
  2. Click "Account" in the left list and scroll to "Privacy and data handling".
  3. Read the rows "The debugger permission drives computer use", "Managed Cloud chats are mirrored to your account" and "Model training".
  4. Check each row says where the data goes (this browser, your AGI account, or the hosted provider of the model), and compare with Expected.
