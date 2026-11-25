---
id: "PLAN-desktop-015"
type: "test-plan"
title: "Desktop · 15. Model-selector interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "15"
---
# Desktop · 15. Model-selector interface

32 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S15.01 Current-model label.

- **Expected:** The composer always shows the name of the model the next message will use.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1324 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFooter.tsx:1143; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6734
- **Where to find it:** New chat screen > the composer at the bottom > the model button beside the send button (its name shows the current model); tap it to open the Models panel (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and open a new chat.
  2. Look at the composer at the bottom of the screen and find the model button; note the model name shown on it.
  3. Tap that button to open the panel titled Models.
  4. Pick a different model, close the panel, and check the composer shows the new model's name.

## S15.02 Provider label.

- **Expected:** Each model in the selector shows which provider or developer makes it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:517; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1171
- **Where to find it:** New chat > composer model button > Models panel > All models > model developer rail (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open a new chat and tap the model button in the composer.
  2. In the Models panel, tap All models.
  3. Look at the row of developers under the search box, under the label Model developers.
  4. Open a model row and compare the provider shown with the developer rail.

## S15.03 Model-family grouping.

- **Expected:** Models are grouped by family (e.g. all versions of one model line together) so related models sit side by side.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:80; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:737 (quoted code not found in the file now); packages/ai/routing/src/model-picker.ts:232; packages/ai/routing/src/__tests__/model-picker.test.ts:41
- **Where to find it:** New chat > composer model button > Models panel > All models > model developer rail, and the About card's Family line (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the Models panel from the composer and tap All models.
  2. Look at the list: versions of one model line should sit together.
  3. Tap the About button on a model row and find the Family line in the card.
  4. Compare the family shown with the other versions listed next to it.

## S15.04 Searchable model list.

- **Expected:** The user can type to filter the model list by name.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:640; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:380; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571
- **Where to find it:** New chat > composer model button > Models panel > All models > Search models box (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the Models panel and tap All models.
  2. Tap the box with the placeholder Search models.
  3. Type part of a model name.
  4. Check that the list shrinks to matching models, and that No models match appears when nothing fits.

## S15.05 Favorite models.

- **Expected:** The user can mark models as favourites and see them together at the top.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:587; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1210
- **Where to find it:** New chat > composer model button > Models panel > All models > star button on a model row, then the Favourites rail (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the Models panel and tap All models.
  2. Tap the star button on a model row; its label changes to Remove <model> from favourites.
  3. Tap the Favourites rail entry.
  4. Check the starred model is listed on its own.

## S15.06 Recently used models.

- **Expected:** The selector lists the models the user used most recently.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:439; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1146
- **Where to find it:** New chat > composer model button > Models panel > All models > Recent rail (labels found in the code)
- **Needs:** a signed-in account with some past model use
- **Steps:**
  1. Use two or three different models in chats.
  2. Open the Models panel from the composer and tap All models.
  3. Tap the Recent rail entry.
  4. Check the models you used most recently appear there.

## S15.07 Recommended models.

- **Expected:** The selector highlights a short list of recommended models for the user.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1695; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1231
- **Where to find it:** New chat > composer model button > Models panel > section labelled Recommended (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Sign in with a paid plan.
  2. Open the Models panel from the composer.
  3. Look for the section labelled Recommended above the rest of the list.
  4. Compare the models listed there with what Expected says.

## S15.08 Automatic-selection option.

- **Expected:** The user can choose Auto so the product picks a model per message.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1636; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1171
- **Where to find it:** New chat > composer model button > Models panel > top row Auto (labels found in the code)
- **Needs:** a signed-in account; a Free account sees Auto (free) instead
- **Steps:**
  1. Open the Models panel from the composer.
  2. Find the top row, which shows the guidance text Picks the best model for each message.
  3. Tap it and send a message.
  4. Check the composer label shows Auto and the answer discloses which model was chosen (Auto chose ...).

## S15.09 Default-profile option.

- **Expected:** The user can set which model or profile new chats start with, as a lasting default.
- **Code:** done. Evidence present: apps/web/features/settings/sections/GeneralSection.tsx:371; apps/web/features/settings/sections/GeneralSection.tsx:405; apps/web/features/chat/lib/default-model-preference.ts:95; apps/web/features/chat/hooks/use-new-chat-default-model.ts:37
- **Where to find it:** Settings > General > Default model (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings and tap General.
  2. Find the row labelled Default model.
  3. Open the select and choose a model; the hint under the row says New chats start with this model.
  4. Open a new chat and check the composer shows the chosen model.

## S15.10 Explicit model selection.

- **Expected:** The user can pick a specific model and the next message uses it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:736; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1171; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1143; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6734
- **Where to find it:** New chat > composer model button > Models panel > tap a model row (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap the model button in the composer.
  2. In the Models panel, tap a model row.
  3. Check the composer model button now shows that model's name.
  4. Send a message and check the answer is labelled with that model.

## S15.11 Model description.

- **Expected:** Each model in the selector has a short description of what it is good for.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:717; apps/web/features/chat/components/Composer/ComposerFooter.tsx:346
- **Where to find it:** New chat > composer model button > Models panel > each model row's guidance line, and the About button on a row (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the Models panel from the composer.
  2. Read the one-line text under each model name.
  3. Tap the About button on a row to open its card.
  4. Compare the text with the short description in Expected.

## S15.12 Input-modality badges.

- **Expected:** Models show which inputs they accept (e.g. images, audio) as badges.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:129; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:301; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:380
- **Where to find it:** New chat > composer model button > Models panel > All models > Filter by capability chips (Vision, Audio in) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the Models panel and tap All models.
  2. Look at the chips under the search box: Vision, Tools, Search and others.
  3. Tap Audio in or Vision to filter the list.
  4. Check the models shown accept that input.

## S15.13 Output-modality badges.

- **Expected:** Models show which outputs they produce (e.g. image, video, audio) as badges.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:144; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:301; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:380
- **Where to find it:** New chat > composer model button > Models panel > All models > Filter by capability chips (Image out, Video out, Audio out) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the Models panel and tap All models.
  2. Tap the chip Image out.
  3. Check the models shown produce images.
  4. Repeat with Video out and Audio out and compare with Expected.

## S15.14 Tool-support badge.

- **Expected:** Models show whether they can use tools.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:135; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:301; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:380
- **Where to find it:** New chat > composer model button > Models panel > All models > Tools chip (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the Models panel and tap All models.
  2. Tap the Tools chip under Filter by capability.
  3. Check that only models with tool support are listed.
  4. Compare with Expected.

## S15.15 Context-capacity information.

- **Expected:** The selector shows how much context each model can hold.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:185 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ModelCatalogue.tsx:114 (quoted code not found in the file now)
- **Where to find it:** New chat > composer model button > Models panel > All models > About button on a model row > Context ceiling (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the Models panel and tap All models.
  2. Tap the About button on a model row.
  3. Find the line Context ceiling and the line Output ceiling in the card.
  4. Compare the numbers with the model's documented context size.

## S15.16 Relative speed information.

- **Expected:** The selector tells the user which models are faster or slower.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/lib/modelPicker.ts:164 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFooter.tsx:333 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ModelCatalogue.tsx:516 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No visible wording about relative speed (faster or slower) was found in ModelCatalogue.tsx, ComposerFooter.tsx or packages/ui/unified-chat/src/lib/modelPicker.ts; the only speed text found is the Fast mode toggle (see S15.23). The cited lines are no longer there.
- **Needs:** a signed-in account

## S15.17 Relative usage or cost information.

- **Expected:** The selector shows how much each model costs or how fast it uses up the allowance.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:759; apps/web/features/chat/components/Composer/ComposerFooter.tsx:307
- **Where to find it:** New chat > composer model button > Models panel > All models > About button on a model row > Credits per 1M tokens and Typical message (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the Models panel and tap All models.
  2. Tap the About button on a model row.
  3. Read the lines Typical message and Credits per 1M tokens.
  4. Compare the cost lines with the price band shown on the row.

## S15.18 Plan-eligibility information.

- **Expected:** Models the user's plan cannot use are marked with the plan that unlocks them.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:805; apps/web/features/chat/components/Composer/ComposerFooter.tsx:671
- **Where to find it:** New chat > composer model button > Models panel > a locked model row shows its plan and an Upgrade button (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in on a Free plan.
  2. Open the Models panel from the composer.
  3. Find a model row marked with a lock; its text shows the plan that unlocks it, and it has an Upgrade button.
  4. Tap What each plan includes to see the plan list.

## S15.19 Preview or experimental badge.

- **Expected:** Preview or experimental models carry a visible badge in the selector.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/lib/modelPicker.ts:198 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFooter.tsx:776; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:532
- **Where to find it:** New chat > composer model button > Models panel > a model row with a stage badge (Preview, Experimental) or the Beta or Coming soon tag (labels found in the code)
- **Needs:** a signed-in account; whether a Preview model is listed depends on the catalogue
- **Steps:**
  1. Open the Models panel from the composer.
  2. Look for a row carrying a badge: Preview or Experimental.
  3. Also look for the Beta or Coming soon tag on other rows.
  4. Compare the badges shown with Expected.

## S15.20 Deprecated-model notice.

- **Expected:** A model scheduled for retirement shows a notice with its leaving date before it disappears.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:353; apps/web/features/chat/components/Composer/ComposerFooter.tsx:323
- **Where to find it:** New chat > composer model button > Models panel > a model row within 30 days of retirement shows Leaving on <date> (labels found in the code)
- **Needs:** a model whose retirement date is within 30 days (a test or live catalogue entry)
- **Steps:**
  1. Open the Models panel from the composer.
  2. Look at the status line of each row for the text Leaving on followed by a date.
  3. Compare the date with the retirement date.
  4. Check the row is still selectable before the date passes.

## S15.21 Temporary-unavailability state.

- **Expected:** A model that is temporarily unavailable is marked as such in the selector and cannot be picked by mistake.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:320; apps/web/features/chat/components/Composer/ComposerFooter.tsx:223
- **Where to find it:** New chat > composer model button > Models panel > a model row marked Temporarily unavailable or Unavailable right now (labels found in the code)
- **Needs:** a model that is marked unavailable in the live catalogue (may not occur in a normal account)
- **Steps:**
  1. Open the Models panel from the composer.
  2. Find a row with the text Temporarily unavailable (catalogue) or Unavailable right now (chooser row).
  3. Try to tap that row.
  4. Check the row cannot be chosen and the composer model does not change.

## S15.22 Reasoning-effort selector.

- **Expected:** For reasoning models the user can choose how hard the model thinks (effort level).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1964; apps/web/features/chat/components/Composer/ComposerFooter.tsx:912 (quoted code not found in the file now)
- **Where to find it:** New chat > pick a reasoning model in the composer model button > the composer control labelled Reasoning effort (its slider shows Off or the level) (labels found in the code)
- **Needs:** a reasoning-capable model; a paid plan may be needed for higher levels
- **Steps:**
  1. Choose a reasoning model from the Models panel.
  2. Look at the composer for the control labelled Reasoning effort.
  3. Tap it and move the slider to another level.
  4. Send a message and check the answer used the chosen level (compare with Expected).

## S15.23 Fast-serving option where supported.

- **Expected:** Where a model offers a faster serving tier, the user can turn it on.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1322; apps/web/features/chat/components/Composer/ComposerFooter.tsx:2027; apps/web/features/chat/hooks/use-fast-mode-availability.ts:18
- **Where to find it:** New chat > pick a model that offers a fast tier > the Reasoning effort control > the Fast mode switch (labels found in the code)
- **Needs:** a model with a fast tier and an account allowed to use it (a paid plan is likely)
- **Steps:**
  1. Choose a model that offers faster serving from the Models panel.
  2. Tap the Reasoning effort control in the composer.
  3. Find the switch labelled Fast mode and turn it on; a Fast pill appears.
  4. Read the help text and compare the extra usage with Expected.

## S15.24 Response-length preference.

- **Expected:** The user can set a preferred response length (shorter or longer answers).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/StyleSelector.tsx:258; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3923
- **Where to find it:** New chat > composer Style control (labelled Style) > Response Length row of buttons (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap the Style control in the composer.
  2. Find the heading Response Length and the row of length buttons below it.
  3. Tap a different length and close the panel.
  4. Send the same question and compare answer length with Expected.

## S15.27 Local-model selection.

- **Expected:** The user can pick a model that runs on their own device.
- **Code:** done. Evidence moved: apps/desktop/electron/runtime/dispatcher.ts:799 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFooter.tsx:1722; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1133
- **Where to find it:** Desktop app > New chat > composer model button > Models panel > section On this device (Use models on this device; Manage local models) (labels found in the code)
- **Needs:** the Desktop app; a paid account (the section is hidden on Free); Ollama or LM Studio with a model loaded
- **Steps:**
  1. Start the Desktop app on a paid plan with Ollama or LM Studio running and a model loaded.
  2. Open the Models panel from the composer.
  3. Find the section On this device; if asked, allow Use models on this device.
  4. Pick a local model, send a message and check the composer shows the local model name with the Local badge.

## S15.29 Sticky model preference.

- **Expected:** The chosen model is remembered for the next session.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1324 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFooter.tsx:1143; apps/web/shared/stores/model-store.ts:376
- **Where to find it:** Composer, model button (shows the model name) > pick a model in the list (under "Models") (labels found in the code)
- **Needs:** a Free account or a paid account; the model must be one your plan can use
- **Steps:**
  1. Sign in and open a new chat.
  2. Click the model name button under the message box (its label ends in "change model").
  3. In the "Models" list, click a different model such as one shown in the list.
  4. Close the list, press Cmd+R or quit and reopen the Desktop app, then open a new chat.
  5. Compare: the composer still shows the model you picked, as Expected says.

## S15.30 Conversation-specific override.

- **Expected:** A conversation can keep its own model, separate from the default used elsewhere.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1324 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFooter.tsx:1157
- **Where to find it:** Open a chat > Composer, model button (ends in "change model") > pick a model in the "Models" list (labels found in the code)
- **Needs:** a Free account or a paid account; two chats
- **Steps:**
  1. Sign in, open an existing chat or start one and send a message.
  2. Click the model name button under the message box.
  3. In the "Models" list, click a different model.
  4. Open a different chat, then come back to this chat.
  5. Compare: this chat still uses the model you picked, while the other chat keeps its own model, as Expected says.

## S15.31 Per-turn model override.

- **Expected:** The user can run a single turn with a different model without changing the conversation's model.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3895; apps/web/features/chat/pages/WebChatPage.tsx:4869 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:5707
- **Where to find it:** Chat > under an answer, hover it and click "Regenerate response" (the arrow icon) > "Try again with" list (labels found in the code)
- **Needs:** a chat with an answer; a Free account or a paid account
- **Steps:**
  1. Open a chat that has at least one answer.
  2. Hover the answer so the action icons appear under it.
  3. Click the "Regenerate response" button.
  4. In the menu, look at the list under "Try again with" and click a different model.
  5. Compare: a new answer appears from that model, and the chat's own model in the model button does not change, as Expected says.

## S15.32 Actual-serving-model disclosure.

- **Expected:** Each answer shows which model actually produced it.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4127; apps/web/features/chat/components/messages/MessageBubble.tsx:2397
- **Where to find it:** Chat > hover an answer from the assistant > small line under the answer that names the model (for example "Auto chose" followed by the model name) (labels found in the code)
- **Needs:** none beyond a Free account or a paid account; a message that has an answer
- **Steps:**
  1. Open a chat and send a message to get an answer.
  2. Move the mouse over the answer so the line under it appears (it is hidden until hover, or shown by touch on a touch screen).
  3. Read the line under the answer that names the model.
  4. Compare: the name shown is the model that wrote this answer, with "Auto chose" in front when Auto was used, as Expected says.

## S15.33 Fallback disclosure.

- **Expected:** When a different model answered because the chosen one failed or was unavailable, the answer says so and why.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3527; apps/web/lib/chat-fallback-reason.ts:79 (quoted code not found in the file now)
- **Where to find it:** Chat > under an answer, a grey notice box that says why another model answered (with a "Dismiss" button) (labels found in the code)
- **Needs:** a situation where the chosen model fails and another model answers; a tester cannot force this from the menus alone
- **Steps:**
  1. Start a chat and send a message.
  2. Look under the answer for a grey notice box with the words from the substitution text.
  3. Click "Dismiss" to remove the notice, then send another message if one appears again.
  4. Compare: the notice says a different model answered and gives the reason, and "Dismiss" hides it, as Expected says.

## S15.34 Model-switch incompatibility dialog.

- **Expected:** Switching to a model that cannot handle the current conversation (images, tools, context) asks for confirmation and explains what will be lost.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1536; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1181
- **Where to find it:** Composer, model button (ends in "change model") > pick a model that cannot read the current chat (such as a text-only model when an image is attached) > the box that says "Switch to <model name>?" (labels found in the code)
- **Needs:** a Free account or a paid account; an image file to upload; a model in the list that cannot read images
- **Steps:**
  1. Open a new chat and attach an image using the attach control in the message box.
  2. Click the model name button under the message box.
  3. Click a model that cannot read images, if one is listed.
  4. Read the box that says "Switch to" followed by the model name, and the reason under it.
  5. Compare: the box names what will be lost and gives "Switch anyway" and "Keep <your current model>" buttons, as Expected says.

## S15.35 Preserve-or-remove incompatible attachments choice.

- **Expected:** When the chosen model cannot read attached files, the user can choose to keep them (switching to a model that can) or remove them.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5258; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5425
- **Where to find it:** Composer, a red-grey box above the message box after you attach a file a model cannot read > buttons "Use Auto" or "Choose a compatible model" or "Remove attachments" (labels found in the code)
- **Needs:** a Free account or a paid account; an image or document file to upload; a model in the list that cannot read it
- **Steps:**
  1. Open a new chat and attach an image or document with the attach control.
  2. Click the model name button and choose a model that cannot read that file type.
  3. Read the box above the message box that starts with "The selected model can't read the attached".
  4. Click "Choose a compatible model" to see the list of models that can read it, or click "Use Auto" to switch.
  5. Compare: you can keep the file by switching to a model that can read it, or remove it with "Remove attachments", as Expected says.
