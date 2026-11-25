---
id: "PLAN-chrome-015"
type: "test-plan"
title: "Chrome · 15. Model-selector interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "15"
---
# Chrome · 15. Model-selector interface

13 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S15.01 Current-model label.

- **Expected:** The composer always shows the name of the model the next message will use.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10914; apps/extension/src/side_panel.ts:6045 (quoted code not found in the file now)
- **Where to find it:** Side panel > model button at the right end of the message box bar (shows AI Assistant until a model is resolved, then the model name) (labels found in the code)
- **Steps:**
  1. Open the side panel and sign in if asked.
  2. Look at the model button at the right end of the message box bar and read its text.
  3. Open the model button and pick a model under Recommended or All models ($COUNT$).
  4. Close the menu and compare the button text with the model you picked: it should show that model's name, the one the next message uses.

## S15.02 Provider label.

- **Expected:** Each model in the selector shows which provider or developer makes it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:11363; apps/extension/src/side_panel.ts:11215; apps/extension/src/side_panel.ts:6045 (quoted code not found in the file now)
- **Where to find it:** Side panel > model button > All models ($COUNT$) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the side panel with a signed-in account.
  2. Click the model button and then All models ($COUNT$).
  3. Read the group headings, which are provider names such as Anthropic or OpenAI.
  4. Compare: each model should sit under the provider that makes it.

## S15.03 Model-family grouping.

- **Expected:** Models are grouped by family (e.g. all versions of one model line together) so related models sit side by side.
- **Code:** done. Evidence present: apps/extension/src/features/cloud-bridge/managedModelPicker.ts:113
- **Where to find it:** Side panel > model button > All models ($COUNT$) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and open the model button.
  2. Click All models ($COUNT$).
  3. Look at the order of the models and the group headings.
  4. Compare: models of one family (all versions of one model line) should sit side by side.

## S15.07 Recommended models.

- **Expected:** The selector highlights a short list of recommended models for the user.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:11219; apps/extension/src/side_panel.ts:7930 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedModelPicker.ts:147
- **Where to find it:** Side panel > model button > Recommended (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and open the model button.
  2. Look for the Recommended heading and the short list of models under it.
  3. Click All models ($COUNT$) and check that the Recommended list is replaced by the full list.
  4. Compare the Recommended list with Expected: a short list highlighted for you.

## S15.08 Automatic-selection option.

- **Expected:** The user can choose Auto so the product picks a model per message.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6173 (quoted code not found in the file now); apps/extension/src/side_panel.ts:6045 (quoted code not found in the file now); apps/extension/_locales/en/messages.json:1229 (quoted code not found in the file now)
- **Where to find it:** Side panel > model button > Auto (first row) (labels found in the code)
- **Steps:**
  1. Open the model button.
  2. Read the first row, named Auto, with the line Picks the best model for each message.
  3. Click Auto and close the menu.
  4. Compare: the button should now show Auto and the next message should be routed automatically.

## S15.09 Default-profile option.

- **Expected:** The user can set which model or profile new chats start with, as a lasting default.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:1792; apps/extension/src/side_panel.ts:1826; apps/extension/src/side_panel.ts:6028; apps/extension/src/side_panel.ts:11496
- **Where to find it:** Side panel > model button > pick a model > New chat icon in the side panel header (title New chat) (labels found in the code)
- **Steps:**
  1. Open the model button and pick a model other than Auto.
  2. Click the New chat icon at the top right of the side panel.
  3. Read the model button in the new empty chat.
  4. Compare: the new chat should start with the model you picked. Close and reopen the side panel and check it again.

## S15.10 Explicit model selection.

- **Expected:** The user can pick a specific model and the next message uses it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10967; apps/extension/src/side_panel.ts:6045 (quoted code not found in the file now); apps/extension/src/side_panel.ts:11215
- **Where to find it:** Side panel > model button > Recommended or All models ($COUNT$) > click a model (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and open the model button.
  2. Click a specific model under Recommended.
  3. Check that the menu closes and the model button shows that model's name.
  4. Send a short message and compare: the reply should come from the model you chose, which the app shows on the reply.

## S15.11 Model description.

- **Expected:** Each model in the selector has a short description of what it is good for.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6035 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10967; apps/extension/src/side_panel.ts:6045 (quoted code not found in the file now)
- **Where to find it:** Side panel > model button > All models ($COUNT$) (or Recommended) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and open the model button.
  2. Read the grey line under each model name.
  3. Compare: each model should show a short line on what it is good for, such as its speed word and a best-for description.
  4. Note any model whose line is empty or shows only a speed word.

## S15.16 Relative speed information.

- **Expected:** The selector tells the user which models are faster or slower.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:1116; apps/extension/src/features/cloud-bridge/managedModelPicker.ts:94
- **Where to find it:** Side panel > model button > Recommended or All models ($COUNT$) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and open the model button.
  2. Read the speed word at the start of the grey line under each model: Fastest, Fast, Medium speed or Slower.
  3. Compare: the speed words should show which models are faster or slower.
  4. Check that the Auto row has no speed word.

## S15.18 Plan-eligibility information.

- **Expected:** Models the user's plan cannot use are marked with the plan that unlocks them.
- **Code:** done. Evidence present: apps/extension/src/features/cloud-bridge/managedModelPicker.ts:137; apps/extension/src/features/cloud-bridge/managedModelPicker.ts:141; apps/extension/src/side_panel.ts:10987; apps/extension/src/side_panel.ts:11047
- **Where to find it:** Side panel > model button > All models ($COUNT$) (labels found in the code)
- **Needs:** a signed-in account on a lower plan
- **Steps:**
  1. Sign in with a plan below the top tier.
  2. Open the model button and click All models ($COUNT$).
  3. Look for rows with a plan name on the right, such as Premium, and read the plan name.
  4. Click one locked row and compare: a new tab should open on the pricing page.

## S15.22 Reasoning-effort selector.

- **Expected:** For reasoning models the user can choose how hard the model thinks (effort level).
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:11088; apps/extension/src/side_panel.ts:11109
- **Where to find it:** Side panel > model button > pick a reasoning model > Effort heading (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Pick a model that has effort options (the Effort heading only appears for those).
  2. Open the model button and find the Effort heading with its rows (for example Direct, Brief, Quick, Balanced, Deep, Extended, Maximum).
  3. Click a different effort row and close the menu.
  4. Compare: the model button should now show that effort word beside the model name, and the Default badge should mark the default row.

## S15.29 Sticky model preference.

- **Expected:** The chosen model is remembered for the next session.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6045 (quoted code not found in the file now); apps/extension/src/side_panel.ts:11495; apps/extension/src/side_panel.ts:10967
- **Where to find it:** Side panel > model button > Recommended > pick a model; then close and reopen the side panel (labels found in the code)
- **Steps:**
  1. Open the model button and click a model other than Auto.
  2. Close the side panel completely.
  3. Reopen the side panel and read the model button.
  4. Compare: it should show the same model you picked before closing.

## S15.30 Conversation-specific override.

- **Expected:** A conversation can keep its own model, separate from the default used elsewhere.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6045 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10967; apps/extension/src/side_panel.ts:1638; apps/extension/src/side_panel.ts:1306
- **Where to find it:** Side panel > Recent chats (clock icon in the header) > open a chat; New chat icon in the header (labels found in the code)
- **Steps:**
  1. Pick model X in the model button, then send a message in a chat.
  2. Click the New chat icon, pick model Y, and send a message in the new chat.
  3. Click the Recent chats clock icon and open the first chat.
  4. Compare: the model button in the reopened chat should show model X, not model Y.
