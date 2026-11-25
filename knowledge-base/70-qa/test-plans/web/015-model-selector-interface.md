---
id: "PLAN-web-015"
type: "test-plan"
title: "Web · 15. Model-selector interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "15"
---
# Web · 15. Model-selector interface

31 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S15.01 Current-model label.

- **Expected:** The composer always shows the name of the model the next message will use.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1324 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFooter.tsx:1143; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6734
- **Earlier check in the running app:** PASS: E001 [PASS; visible UI]: New chat renders personalized greeting, composer, and default model. Ordinary Project chip and recurring provider banner are absent. A draft-conflict toast was also visible and is tracked separately. | E035 [PASS; picker interaction]: Picker shows OpenRouter Free Auto and free-pool models; unavailable routes disabled with explanation, available routes show quota expiration. No claim those routes generate successfully.
- **Where to find it:** New chat > composer footer model button. The button shows the name of the selected model, with "Change model" as its accessible name. (labels found in the code)
- **Steps:**
  1. Sign in and open New chat.
  2. Look at the model button in the composer footer and note the model name shown.
  3. Click the model button and pick a different model in the list.
  4. Send a short message and compare the name on the composer footer with the Expected text: the composer still shows the model the next message uses.

## S15.02 Provider label.

- **Expected:** Each model in the selector shows which provider or developer makes it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:517; apps/web/features/chat/components/Composer/ComposerFooter.tsx:742; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1171
- **Earlier check in the running app:** UI_ONLY: E035 [UI_ONLY; labels and badges]: Picker shows OpenRouter Free Auto and free-pool models; unavailable routes disabled with explanation, available routes show quota expiration. No claim those routes generate successfully.
- **Where to find it:** New chat > composer footer model button > model list. Each row shows a provider logo and a developer name line. (labels found in the code)
- **Steps:**
  1. Open New chat and click the model button in the composer footer.
  2. In the list, read the small grey line under each model name and look at the provider logo.
  3. Compare with Expected: each model shows which company makes it.

## S15.03 Model-family grouping.

- **Expected:** Models are grouped by family (e.g. all versions of one model line together) so related models sit side by side.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:80; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:737 (quoted code not found in the file now); packages/ai/routing/src/model-picker.ts:232; packages/ai/routing/src/__tests__/model-picker.test.ts:41
- **Where to find it:** New chat > composer footer model button > model list > "About" button on a model row (accessible name "About <model name>") > Family line. (labels found in the code)
- **Steps:**
  1. Open the model list from the composer footer model button.
  2. Click the help icon (accessible name "About <model name>") on a model row.
  3. Read the Family line on the card.
  4. Go back with "Back to the model list" and check that models of the same family sit together in the list, as Expected says.

## S15.04 Searchable model list.

- **Expected:** The user can type to filter the model list by name.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:640; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:380; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571
- **Earlier check in the running app:** PASS: E095 [PASS; search interaction]: Search (model name).8-max narrowed Free models list to two matching routes. Other provider group remains separately displayed.
- **Where to find it:** New chat > composer footer model button > search field labelled "Search models". (labels found in the code)
- **Steps:**
  1. Open the model list from the composer footer model button.
  2. Click the search field labelled "Search models".
  3. Type part of a model name, such as qwen.
  4. Compare: the list narrows to matching models.

## S15.05 Favorite models.

- **Expected:** The user can mark models as favourites and see them together at the top.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:587; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1707; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1210
- **Where to find it:** New chat > composer footer model button > model list > star button (accessible name "Add <model name> to favourites"). Favourites appear under the "Favourites" heading. (labels found in the code)
- **Steps:**
  1. Open the model list from the composer footer model button.
  2. Click the star button on a model row (accessible name "Add <model name> to favourites").
  3. Close the list and open it again.
  4. Compare: the starred model appears in the "Favourites" section at the top.

## S15.06 Recently used models.

- **Expected:** The selector lists the models the user used most recently.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:439; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1146; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571
- **Where to find it:** New chat > composer footer model button > "Recent" rail in the model list. (labels found in the code)
- **Steps:**
  1. Use two or three different models in a few chats.
  2. Open the model list from the composer footer model button.
  3. Click the "Recent" rail.
  4. Compare: the models you used most recently are listed.

## S15.07 Recommended models.

- **Expected:** The selector highlights a short list of recommended models for the user.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1695; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1231; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6734
- **Where to find it:** New chat > composer footer model button > "Recommended" section at the top of the list. (labels found in the code)
- **Steps:**
  1. Open the model list from the composer footer model button.
  2. Look at the section titled "Recommended".
  3. Compare: it shows a short list of recommended models for your plan.

## S15.08 Automatic-selection option.

- **Expected:** The user can choose Auto so the product picks a model per message.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1636; apps/web/features/chat/components/Composer/ComposerFooter.tsx:205; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1171
- **Earlier check in the running app:** UI_ONLY: E035 [UI_ONLY; labels and badges]: Picker shows OpenRouter Free Auto and free-pool models; unavailable routes disabled with explanation, available routes show quota expiration. No claim those routes generate successfully.
- **Where to find it:** New chat > composer footer model button > first row "Auto" in the list (guidance text "Picks the best model for each message"). (labels found in the code)
- **Steps:**
  1. Open the model list from the composer footer model button.
  2. Click the first row, the Auto row.
  3. Send a message and check the model name on the composer footer and the model that answers.
  4. Compare: Auto picks a model for each message, as Expected says.

## S15.09 Default-profile option.

- **Expected:** The user can set which model or profile new chats start with, as a lasting default.
- **Code:** done. Evidence present: apps/web/features/settings/sections/GeneralSection.tsx:371; apps/web/features/settings/sections/GeneralSection.tsx:405; apps/web/features/chat/lib/default-model-preference.ts:95; apps/web/features/chat/hooks/use-new-chat-default-model.ts:37
- **Where to find it:** Settings > General > "Default model". (labels found in the code)
- **Needs:** a paid account for models outside the Free plan
- **Steps:**
  1. Open Settings and go to General.
  2. Find the "Default model" select (its first option is "Last used").
  3. Choose a model, then open a new chat.
  4. Compare: the new chat starts with the model you chose.

## S15.10 Explicit model selection.

- **Expected:** The user can pick a specific model and the next message uses it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:736; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1171; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1143; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6734
- **Earlier check in the running app:** PASS: E036 [PASS; send and generating UI]: Model changed to an available free-pool route; sent project context question; user message persisted into new chat and Thinking state appeared. Project chip correctly names selected project.
- **Where to find it:** New chat > composer footer model button > model row. (labels found in the code)
- **Steps:**
  1. Click the model button in the composer footer.
  2. Click a model row that is not locked.
  3. Type a message and send it.
  4. Compare: the answer comes from the model you picked, and the composer shows that model name.

## S15.11 Model description.

- **Expected:** Each model in the selector has a short description of what it is good for.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:717; apps/web/features/chat/components/Composer/ComposerFooter.tsx:346; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1171
- **Earlier check in the running app:** UI_ONLY: E035 [UI_ONLY; labels and badges]: Picker shows OpenRouter Free Auto and free-pool models; unavailable routes disabled with explanation, available routes show quota expiration. No claim those routes generate successfully.
- **Where to find it:** New chat > composer footer model button > model row guidance line under the model name. Full card: "About <model name>" button. (labels found in the code)
- **Steps:**
  1. Open the model list from the composer footer model button.
  2. Read the short grey line under each model name.
  3. Click the help icon "About <model name>" and read the card.
  4. Compare: each model has a short line about what it is good for.

## S15.12 Input-modality badges.

- **Expected:** Models show which inputs they accept (e.g. images, audio) as badges.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:129; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:301; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:380
- **Earlier check in the running app:** UI_ONLY: E035 [UI_ONLY; labels and badges]: Picker shows OpenRouter Free Auto and free-pool models; unavailable routes disabled with explanation, available routes show quota expiration. No claim those routes generate successfully.
- **Where to find it:** New chat > composer footer model button > model row or "About <model name>" card > capability chips. (labels found in the code)
- **Steps:**
  1. Open the model list from the composer footer model button.
  2. Look at the small chips on a model row, or open its "About" card.
  3. Find the "Vision" chip on a model that accepts images.
  4. Compare: the chip shows which inputs the model accepts.

## S15.13 Output-modality badges.

- **Expected:** Models show which outputs they produce (e.g. image, video, audio) as badges.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:144; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:301; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:380
- **Where to find it:** New chat > composer footer model button > model row or "About <model name>" card > capability chips. (labels found in the code)
- **Steps:**
  1. Open the model list from the composer footer model button.
  2. Look for chips such as "Image out", "Video out" or "Audio out".
  3. Compare the chips with the outputs the model produces.

## S15.14 Tool-support badge.

- **Expected:** Models show whether they can use tools.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:135; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:301; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:380
- **Earlier check in the running app:** UI_ONLY: E035 [UI_ONLY; labels and badges]: Picker shows OpenRouter Free Auto and free-pool models; unavailable routes disabled with explanation, available routes show quota expiration. No claim those routes generate successfully.
- **Where to find it:** New chat > composer footer model button > model row or "About <model name>" card > capability chips. (labels found in the code)
- **Steps:**
  1. Open the model list from the composer footer model button.
  2. Find the "Tools" chip on a model row.
  3. Open the "About" card for a model with and without the chip.
  4. Compare: the chip appears only on models that can use tools.

## S15.15 Context-capacity information.

- **Expected:** The selector shows how much context each model can hold.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:185 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ModelCatalogue.tsx:114 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571
- **Where to find it:** New chat > composer footer model button > "About <model name>" button > "Context ceiling" line. (labels found in the code)
- **Steps:**
  1. Open the model list from the composer footer model button.
  2. Click the help icon "About <model name>" on a model row.
  3. Read the "Context ceiling" and "Output ceiling" lines.
  4. Compare: they show the context size in K or M.

## S15.16 Relative speed information.

- **Expected:** The selector tells the user which models are faster or slower.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/lib/modelPicker.ts:164 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFooter.tsx:333 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ModelCatalogue.tsx:516 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No relative speed label found. Searched for speed, faster, slower and latency in packages/ui/unified-chat/src/lib/modelPicker.ts, packages/ai/routing/src/model-picker.ts, ModelCatalogue.tsx and ComposerFooter.tsx. The only match is the Fast mode text "Faster answers at ... the usage" (ComposerFooter.tsx:2034), which is not a speed comparison between models.

## S15.17 Relative usage or cost information.

- **Expected:** The selector shows how much each model costs or how fast it uses up the allowance.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:759; apps/web/features/chat/components/Composer/ComposerFooter.tsx:307; apps/web/features/chat/components/Composer/ComposerFooter.tsx:700
- **Earlier check in the running app:** UI_ONLY: E035 [UI_ONLY; labels and badges]: Picker shows OpenRouter Free Auto and free-pool models; unavailable routes disabled with explanation, available routes show quota expiration. No claim those routes generate successfully.
- **Where to find it:** New chat > composer footer model button > price bars on a model row (accessible text "Price band X of Y") and the "About <model name>" card > "Credits per 1M tokens" and "Typical message". (labels found in the code)
- **Steps:**
  1. Open the model list from the composer footer model button.
  2. Look at the price bars on each row, or hover a bar to see its title.
  3. Click the help icon "About <model name>" and read "Credits per 1M tokens" and "Typical message".
  4. Compare: more filled bars or larger numbers mean a higher cost or faster use of the allowance.

## S15.18 Plan-eligibility information.

- **Expected:** Models the user's plan cannot use are marked with the plan that unlocks them.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:805; apps/web/features/chat/components/Composer/ComposerFooter.tsx:671; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:222 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E035 [PASS; picker interaction]: Picker shows OpenRouter Free Auto and free-pool models; unavailable routes disabled with explanation, available routes show quota expiration. No claim those routes generate successfully.
- **Where to find it:** New chat > composer footer model button > model row marked "Upgrade" (locked rows show the plan that unlocks them). (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a Free account.
  2. Open the model list from the composer footer model button.
  3. Find a row with an "Upgrade" label, marked with a lock.
  4. Compare: the row names the plan that unlocks the model, as Expected says.

## S15.19 Preview or experimental badge.

- **Expected:** Preview or experimental models carry a visible badge in the selector.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/lib/modelPicker.ts:198 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFooter.tsx:776; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:532
- **Where to find it:** New chat > composer footer model button > model row badge (Preview, Experimental, Beta or Alpha). (labels found in the code)
- **Needs:** a preview or experimental model in the catalogue
- **Steps:**
  1. Open the model list from the composer footer model button.
  2. Look for a badge reading "Preview", "Experimental", "Beta" or "Alpha" on a row.
  3. Compare: the model carries the badge, as Expected says.

## S15.20 Deprecated-model notice.

- **Expected:** A model scheduled for retirement shows a notice with its leaving date before it disappears.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:353; apps/web/features/chat/components/Composer/ComposerFooter.tsx:323; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1171
- **Where to find it:** New chat > composer footer model button > model row guidance reads "Leaving <date>". (labels found in the code)
- **Needs:** a model with a retirement date in the catalogue
- **Steps:**
  1. Open the model list from the composer footer model button.
  2. Look for a row whose grey line reads "Leaving" followed by a date.
  3. Compare: the notice shows the retirement date before the model leaves the list.

## S15.21 Temporary-unavailability state.

- **Expected:** A model that is temporarily unavailable is marked as such in the selector and cannot be picked by mistake.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ModelCatalogue.tsx:320; apps/web/features/chat/components/Composer/ComposerFooter.tsx:352; apps/web/features/chat/components/Composer/ComposerFooter.tsx:223; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1571
- **Earlier check in the running app:** PASS: E035 [PASS; picker interaction]: Picker shows OpenRouter Free Auto and free-pool models; unavailable routes disabled with explanation, available routes show quota expiration. No claim those routes generate successfully.
- **Where to find it:** New chat > composer footer model button > model row guidance reads "Unavailable right now" and the row cannot be picked. (labels found in the code)
- **Needs:** a provider in a degraded state, which a tester cannot set up
- **Steps:**
  1. Open the model list from the composer footer model button.
  2. Look for a row whose grey line reads "Unavailable right now".
  3. Click that row and check that the model is not selected.
  4. Compare: the row is marked unavailable and cannot be picked.

## S15.22 Reasoning-effort selector.

- **Expected:** For reasoning models the user can choose how hard the model thinks (effort level).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1964; apps/web/features/chat/components/Composer/ComposerFooter.tsx:912 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6734
- **Where to find it:** New chat > composer footer reasoning control (the control whose accessible name starts "Reasoning effort:") > effort slider labelled "Reasoning effort". Settings > General > "Reasoning effort". (labels found in the code)
- **Needs:** a reasoning model, and a paid account for the higher levels
- **Steps:**
  1. Select a reasoning model in the composer footer model button.
  2. Click the "Reasoning effort" control in the composer footer.
  3. Drag the slider to a different level, or pick an option.
  4. Send a message and compare the level chosen with Expected: the model thinks at that level.

## S15.23 Fast-serving option where supported.

- **Expected:** Where a model offers a faster serving tier, the user can turn it on.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1322; apps/web/features/chat/components/Composer/ComposerFooter.tsx:2027; apps/web/features/chat/hooks/use-fast-mode-availability.ts:18
- **Where to find it:** New chat > composer footer reasoning control > "Fast mode" switch. The "Fast" pill appears when it is on. (labels found in the code)
- **Needs:** a paid account and a model with a fast tier
- **Steps:**
  1. Select a model that offers a faster tier in the composer footer model button.
  2. Click the composer footer reasoning control.
  3. Turn on the "Fast mode" switch.
  4. Send a message and check the "Fast" pill and the usage note: faster answers at the stated usage multiplier.

## S15.24 Response-length preference.

- **Expected:** The user can set a preferred response length (shorter or longer answers).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/StyleSelector.tsx:258; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3923; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1433
- **Where to find it:** New chat > composer footer "Style" button > "Response Length" row (Brief, Default, Thorough). Also Settings > Personalization > "Response length". (labels found in the code)
- **Steps:**
  1. Click the "Style" button in the composer footer.
  2. Find the "Response Length" row.
  3. Click "Brief" or "Thorough".
  4. Send the same question twice, once with each setting, and compare the answer lengths with Expected.

## S15.29 Sticky model preference.

- **Expected:** The chosen model is remembered for the next session.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1324 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFooter.tsx:1143; apps/web/shared/stores/model-store.ts:376
- **Where to find it:** no screen of its own. The choice is saved in localStorage under the key agi-model-store (apps/web/shared/stores/model-store.ts:376); it is per browser, not per account.
- **Steps:**
  1. Choose a model in the composer footer model button.
  2. Close the browser tab and open the app again.
  3. Open New chat and read the model name on the composer footer.
  4. Compare with Expected: the chosen model is still selected. If Settings > General > "Default model" is set to a fixed model, that setting wins over this memory.

## S15.30 Conversation-specific override.

- **Expected:** A conversation can keep its own model, separate from the default used elsewhere.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1324 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerFooter.tsx:1157; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1143
- **Where to find it:** Composer footer > model name button > Models (pick a model), then send a message in the same conversation (labels found in the code)
- **Needs:** an account with more than one model available
- **Steps:**
  1. Open or start a conversation in the web app.
  2. Click the model name button at the bottom of the message box (it opens the picker titled Models).
  3. Choose a different model from the list.
  4. Send a message in this same conversation and wait for the answer.
  5. Open a new chat and look at the model name in its composer.
  6. Compare: this conversation keeps the model you chose, and the new chat shows the default model.

## S15.31 Per-turn model override.

- **Expected:** The user can run a single turn with a different model without changing the conversation's model.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3895; apps/web/features/chat/pages/WebChatPage.tsx:4869 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:5707
- **Where to find it:** Under an answer, click the refresh icon (Regenerate response) > Try again with > pick a model (labels found in the code)
- **Needs:** an account with more than one model available
- **Steps:**
  1. Send a message and wait for the answer to finish.
  2. Hover under the answer and click the refresh icon (it opens a menu).
  3. Under Try again with, click a model name.
  4. Look at the new answer, and then open the composer model picker.
  5. Compare: the new answer comes from the model you picked, and the composer still shows the conversation's previous model.

## S15.32 Actual-serving-model disclosure.

- **Expected:** Each answer shows which model actually produced it.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4127; apps/web/features/chat/components/messages/MessageBubble.tsx:2397
- **Earlier check in the running app:** PASS: E040 [PASS; live generated answer]: Follow-up on (model name).8-max-0902 returned exact LIVE_QA_20260926_OK; served route labeled via free pool. Renamed own conversation Browser QA, Chat and rendering. The earlier Retry click on failed activity did not visibly restart a request; fresh send succeeded. Sources panel opens empty, no research performed.
- **Where to find it:** Hover over an answer; the model name that answered shows under it (data-testid message-answered-by in MessageBubble) (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Send a message and wait for the answer to finish.
  2. Move the mouse over the answer (on touch screens the label is always shown).
  3. Read the small muted model name under the answer.
  4. Compare: the name matches the model that actually answered, shown on the composer or in the Try again with menu.

## S15.33 Fallback disclosure.

- **Expected:** When a different model answered because the chosen one failed or was unavailable, the answer says so and why.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3527; apps/web/lib/chat-fallback-reason.ts:79 (quoted code not found in the file now)
- **Where to find it:** A notice appears under an answer when a fallback happened (role status, data-testid fallback-reason-notice) (path not confirmed in the code; trust the screen)
- **Needs:** none; a model failure or outage is needed to trigger the notice, which a tester cannot force from the UI
- **Steps:**
  1. Send a message with a model; wait for the answer to finish.
  2. Look under the answer for a small notice with an alert icon and a close control.
  3. Read the notice text: it says the different model answered and gives the reason.
  4. Click the close control to dismiss the notice.
  5. Compare: the notice names the model that answered and the reason, and it appears only when the chosen model failed or was unavailable.

## S15.34 Model-switch incompatibility dialog.

- **Expected:** Switching to a model that cannot handle the current conversation (images, tools, context) asks for confirmation and explains what will be lost.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1536; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1181
- **Where to find it:** Composer footer > model name button > Models > choose a model that cannot handle the current chat (labels found in the code)
- **Needs:** a file or image to upload, and an account with a model that cannot read it
- **Steps:**
  1. Attach an image to the chat (use the attach control in the message box).
  2. Click the model name button and open the Models picker.
  3. Choose a model that cannot read images or other files in this chat.
  4. Look for the line Switch to <model name>? with a warning sentence under it.
  5. Read the sentence, then compare: it says what will be lost, and the two buttons are Switch anyway and Keep <current model name>.

## S15.35 Preserve-or-remove incompatible attachments choice.

- **Expected:** When the chosen model cannot read attached files, the user can choose to keep them (switching to a model that can) or remove them.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5258; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5425; apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** Attach a file or image, then choose a model that cannot read it; an alert appears above the message box with Use Auto, Remove attachments and Choose a compatible model (labels found in the code)
- **Needs:** a file or image to upload; a Free account shows Use Free Auto instead of Use Auto
- **Steps:**
  1. Attach an image or document to the chat.
  2. Click the model name button and choose a model that cannot read that file type.
  3. Look at the alert above the message box: it says the selected model can't read the attachment.
  4. To keep the files, click Use Auto, or click Choose a compatible model and pick a listed model.
  5. To drop them instead, click Remove attachments.
  6. Compare: the files are kept with a model that can read them, or removed, and the alert goes away.
