---
id: "PLAN-chrome-085"
type: "test-plan"
title: "Chrome · 85. Personalization and data settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "85"
---
# Chrome · 85. Personalization and data settings

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S85.01 Profile details.

- **Expected:** The user can view and edit their account profile (name, photo, email) on the surface, and the change is saved to the account.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:12239 (quoted code not found in the file now); apps/extension/src/side_panel.ts:12304 (quoted code not found in the file now); apps/extension/src/side_panel.ts:12845 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/capabilityDocument.ts:72
- **Where to find it:** More > Settings (opens the AGI web settings page; the extension itself only shows the name and email) (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Sign in to the extension and click the More button in the side panel header.
  2. Read the account name row at the top of the More menu, which shows the display name or email.
  3. Click Settings, which opens the AGI web app in a new tab.
  4. Look for name, photo and email fields on that web page and compare with Expected. Editing was not found in the extension code, so check the web page directly.

## S85.02 Custom instructions.

- **Expected:** The user can write custom instructions on the surface and they are applied to that surface's chats until changed or switched off.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension for 'custom instruction', 'personalization', 'personalisation' and 'communication style' and found no matches. The control is probably on the web app, which was not searched.
- **Needs:** live-web

## S85.03 Communication style.

- **Expected:** The user can choose how the assistant communicates (tone, length, formatting) on the surface and replies follow it.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension for 'communication style', 'tone', 'response style' and 'personality' and found no matching control. The control is probably on the web app, which was not searched.
- **Needs:** live-web

## S85.05 Saved Memory.

- **Expected:** The user can see, add, edit and delete saved memories on the surface and turn memory on or off, and saved memories are used in that surface's chats.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:11181 (quoted code not found in the file now); apps/extension/src/side_panel.ts:11191 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/memoryClient.ts:251 (quoted code not found in the file now); apps/web/lib/services/managed-memory-context-service.ts:274
- **Where to find it:** More > Memory (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Sign in to the extension and click the More button in the side panel header.
  2. Click the Memory item in the account part of the More menu.
  3. In the sheet titled Memory, type a memory in the add field and click Add, then click Edit or Delete on an item.
  4. Check the list updates to match Expected. Use Memory settings on the web to reach the web memory page.

## S85.06 Past-chat reference.

- **Expected:** The user can let the assistant search or reference their other chats when answering, and switch it off; temporary chats are never referenced.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:11191 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/memoryClient.ts:251 (quoted code not found in the file now); apps/web/lib/services/turn-context-service.ts:129
- **Where to find it:** not found in the code. Searched apps/extension for past-chat reference terms and found no on/off control. The only related control found is Temporary chat, whose text says it stays out of history, search and memory. Temporary chat is a chat mode, not the past-chat reference setting.
- **Needs:** a signed-in AGI account

## S85.10 Browsing-context preference.

- **Expected:** The user controls which websites or browser the assistant may read or act in, and can revoke that access.
- **Code:** done. Evidence present: apps/extension/src/options.ts:1389; apps/extension/src/features/options/site-allowlist.ts:86
- **Where to find it:** Extension settings > Permissions > Browser access (labels found in the code)
- **Steps:**
  1. Click Extension settings in the side panel More menu.
  2. Click Permissions in the left navigation of the settings page.
  3. Find the Browser access section and read its text and the Browser control default.
  4. Grant or remove an approved site and check the site list (it shows No sites allowlisted yet. when empty) against Expected.

## S85.11 Activity-history preference.

- **Expected:** The user can choose whether their chats are kept in history (and synced to the account) or not saved.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:1215 (quoted code not found in the file now); apps/extension/src/side_panel.ts:8941
- **Where to find it:** Extension settings > Account > Privacy and data handling > Save Managed Cloud chats to my account (labels found in the code)
- **Needs:** a signed-in AGI account and a Managed Cloud chat
- **Steps:**
  1. Click Extension settings in the side panel More menu.
  2. Click Account in the left navigation.
  3. Scroll to the Privacy and data handling section and find the toggle Save Managed Cloud chats to my account.
  4. Turn the toggle off, then check the text beside it (Managed Cloud chats stay in this browser only.) against Expected.

## S85.14 Diagnostic-sharing choice.

- **Expected:** The user can choose whether crash reports and diagnostics are sent, and the choice is honoured.
- **Code:** done. Evidence present: apps/extension/src/features/options/data-handling-section.ts:185; apps/extension/src/features/observability/errorReporting.ts:26
- **Where to find it:** Extension settings > Account > Privacy and data handling > Share crash reports (labels found in the code)
- **Steps:**
  1. Click Extension settings in the side panel More menu.
  2. Click Account in the left navigation.
  3. Scroll to Privacy and data handling and find the toggle Share crash reports, which starts off.
  4. Switch it on or off and read the text beside it, then compare with Expected.
