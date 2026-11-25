---
id: "PLAN-mobile-015"
type: "test-plan"
title: "Mobile · 15. Model-selector interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "15"
---
# Mobile · 15. Model-selector interface

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S15.01 Current-model label.

- **Expected:** The composer always shows the name of the model the next message will use.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ModelSelectorButton.tsx:28; apps/mobile/src/features/chat/components/ChatInput.tsx:2236; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:565
- **Where to find it:** Chat screen > composer bar: the model name button beside the + (Add to chat) button (labels found in the code)
- **Steps:**
  1. Open the app and go to a new chat.
  2. Look at the bottom bar of the message box, next to the + button.
  3. Read the model name on that button.
  4. Send a short message and compare the name on the button with the model shown under the answer (see S15.32).

## S15.02 Provider label.

- **Expected:** Each model in the selector shows which provider or developer makes it.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/components/ModelRow.tsx:86; apps/mobile/src/features/model-picker/components/ModelRow.tsx:203; apps/mobile/src/features/model-picker/components/ProviderMark.tsx:6
- **Where to find it:** Chat screen > tap the model name in the composer > Models sheet > any model row (labels found in the code)
- **Steps:**
  1. Tap the model name in the composer bar.
  2. In the Models sheet, look at the small grey text to the right of each model name.
  3. Compare the text with the company or provider shown for that model.

## S15.03 Model-family grouping.

- **Expected:** Models are grouped by family (e.g. all versions of one model line together) so related models sit side by side.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:941; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:943
- **Where to find it:** Chat screen > tap the model name in the composer > Models sheet > open a model row's chevron (More models) (labels found in the code)
- **Steps:**
  1. Tap the model name in the composer bar.
  2. Scroll the Models sheet to a model row that has a chevron on its right.
  3. Tap the chevron to open the other models in that line.
  4. Check that the related versions of one model line appear together under that row.

## S15.04 Searchable model list.

- **Expected:** The user can type to filter the model list by name.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:806; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:376
- **Where to find it:** Chat screen > tap the model name in the composer > Models sheet > Search models… (labels found in the code)
- **Steps:**
  1. Tap the model name in the composer bar.
  2. Tap the field that says Search models….
  3. Type part of a model name, such as a few letters.
  4. Check that the list shrinks to the models whose names match.

## S15.05 Favorite models.

- **Expected:** The user can mark models as favourites and see them together at the top.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:927; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:295
- **Where to find it:** Chat screen > tap the model name in the composer > Models sheet > long-press a model row (labels found in the code)
- **Steps:**
  1. Tap the model name in the composer bar.
  2. Press and hold a model row for about half a second.
  3. Check that a small gold star appears on that row.
  4. Scroll to the top of the Models sheet and check that the starred model is in the Favorites group.

## S15.06 Recently used models.

- **Expected:** The selector lists the models the user used most recently.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:924; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:565
- **Where to find it:** Chat screen > tap the model name in the composer > Models sheet > Recent group at the top (labels found in the code)
- **Steps:**
  1. Pick any model from the Models sheet so the sheet closes.
  2. Tap the model name in the composer bar again.
  3. Look at the group titled Recent at the top of the list.
  4. Check that the model you just used is listed there.

## S15.08 Automatic-selection option.

- **Expected:** The user can choose Auto so the product picks a model per message.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:896; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:565
- **Where to find it:** Chat screen > tap the model name in the composer > Models sheet > top row labelled Auto (labels found in the code)
- **Steps:**
  1. Tap the model name in the composer bar.
  2. Look at the rows at the top of the Models sheet, above Recent.
  3. Tap the row named Auto and wait for the sheet to close.
  4. Send a message and check the model shown under the answer (see S15.32) to see which model the product picked.

## S15.10 Explicit model selection.

- **Expected:** The user can pick a specific model and the next message uses it.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:148; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:356 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:1444
- **Where to find it:** Chat screen > tap the model name in the composer > Models sheet > tap a model row (labels found in the code)
- **Steps:**
  1. Tap the model name in the composer bar.
  2. Tap a model row that has no lock icon.
  3. Check that the sheet closes and the composer shows the new name.
  4. Send a message and check the model shown under the answer (see S15.32).

## S15.16 Relative speed information.

- **Expected:** The selector tells the user which models are faster or slower.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/modelFilters.ts:16; apps/mobile/src/features/model-picker/components/ModelFilterChips.tsx:21
- **Where to find it:** Chat screen > side menu > AGI Cloud (mode switch) > tap the model name in the composer > Instant chip in the Models sheet (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the side menu and tap AGI Cloud in the mode switch.
  2. Tap the model name in the composer bar.
  3. Tap the chip labelled Instant under the search field.
  4. Check that only the quick models remain in the list.

## S15.18 Plan-eligibility information.

- **Expected:** Models the user's plan cannot use are marked with the plan that unlocks them.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelRow.tsx:188 (quoted code not found in the file now); apps/mobile/src/features/model-picker/service.ts:191
- **Where to find it:** Chat screen > tap the model name in the composer > Models sheet > a model row with a lock icon and an Upgrade badge (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Tap the model name in the composer bar.
  2. Find a model row with a lock icon and a yellow badge.
  3. Read the badge text and compare it with Expected.
  4. Tap that row and check that the upgrade options open.

## S15.21 Temporary-unavailability state.

- **Expected:** A model that is temporarily unavailable is marked as such in the selector and cannot be picked by mistake.
- **Code:** done. Evidence present: apps/mobile/src/features/model-picker/components/ModelRow.tsx:79; apps/mobile/src/features/model-picker/components/ModelRow.tsx:270; apps/mobile/src/features/model-picker/components/ModelRow.tsx:302; apps/mobile/src/features/model-picker/providerAvailabilityStore.ts:20
- **Where to find it:** Chat screen > tap the model name in the composer > Models sheet > a model row with an Unavailable badge (labels found in the code)
- **Needs:** a live provider outage (cannot be made on demand) or an on-device model that is not on this device
- **Steps:**
  1. Tap the model name in the composer bar.
  2. Look for a row with a grey Unavailable badge and a dimmed look.
  3. Tap the row and check that nothing changes and the model is not selected.

## S15.22 Reasoning-effort selector.

- **Expected:** For reasoning models the user can choose how hard the model thinks (effort level).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ComposerEffort.tsx:64; apps/mobile/src/features/model-picker/components/EffortSlider.tsx:62; apps/mobile/src/features/chat/components/ChatInput.tsx:549
- **Where to find it:** Chat screen > composer bar > reasoning effort button (appears for a reasoning model in AGI Cloud mode) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and a reasoning model
- **Steps:**
  1. Open the side menu and tap AGI Cloud, then open a new chat.
  2. Choose a model that thinks (reasoning model) from the Models sheet.
  3. Tap the effort button in the composer bar.
  4. Move the effort slider to another level, then tap Done.
  5. Check that the effort name changes on the slider and in the composer.

## S15.24 Response-length preference.

- **Expected:** The user can set a preferred response length (shorter or longer answers).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/StyleSelector.tsx:20; apps/mobile/stores/chat/chatExecutionStore.ts:1355 (quoted code not found in the file now)
- **Where to find it:** Chat screen > + (Add to chat) > Choose style (labels found in the code)
- **Steps:**
  1. Tap the + button in the composer bar (labelled Add to chat).
  2. Tap Choose style.
  3. Pick Concise, Normal, Explanatory, Learning or Formal.
  4. Send the same question twice, once with Concise and once with Explanatory, and compare the answer lengths.

## S15.27 Local-model selection.

- **Expected:** The user can pick a model that runs on their own device.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:67 (quoted code not found in the file now); apps/mobile/src/features/model-picker/components/ModelRow.tsx:148; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:565
- **Where to find it:** Side menu > Local Mode (mode switch) > tap the model name in the composer > Models sheet > On device group (labels found in the code)
- **Needs:** a device with room for an on-device model (downloading is required for Ready)
- **Steps:**
  1. Open the side menu and tap Local Mode in the mode switch.
  2. Tap the model name in the composer bar.
  3. Look for the group titled On device and a row with a chip icon.
  4. Download a model if needed (Download badge), wait until it shows Ready, then pick it and check the composer name.

## S15.29 Sticky model preference.

- **Expected:** The chosen model is remembered for the next session.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ModelSelectorButton.tsx:28; apps/mobile/src/features/model-picker/store.ts:316; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:565
- **Where to find it:** Chat screen > tap the model name in the composer > Models sheet > pick a model, then close and reopen the app (labels found in the code)
- **Steps:**
  1. Pick a model from the Models sheet.
  2. Close the app completely and open it again.
  3. Go to a new chat and read the model name in the composer bar.
  4. Check that it is the model you picked before closing.

## S15.30 Conversation-specific override.

- **Expected:** A conversation can keep its own model, separate from the default used elsewhere.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ModelSelectorButton.tsx:28; apps/mobile/app/(app)/chat/[id].tsx:1447
- **Where to find it:** Open an existing chat > tap the model name in the composer > Models sheet > pick a model (labels found in the code)
- **Needs:** two chats
- **Steps:**
  1. Open chat A and pick model X from the Models sheet.
  2. Start a new chat and check its composer model name differs or stays as the default.
  3. Go back to chat A and check the composer still shows model X.
  4. Check that a different chat with no change still shows its own model.

## S15.32 Actual-serving-model disclosure.

- **Expected:** Each answer shows which model actually produced it.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1129; apps/mobile/src/features/chat/components/MessageBubble.tsx:189 (quoted code not found in the file now)
- **Where to find it:** Chat screen > under any finished assistant answer, the small line with provider and model (labels found in the code)
- **Needs:** a signed-in AGI Cloud account for the AGI Cloud label
- **Steps:**
  1. Send a message in a chat and wait for the answer to finish streaming.
  2. Look at the small text line under the answer.
  3. Read the text, which joins the provider and the model name with a dot.
  4. Compare it with the model you picked in the composer.
