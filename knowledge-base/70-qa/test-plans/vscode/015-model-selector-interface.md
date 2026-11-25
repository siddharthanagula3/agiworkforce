---
id: "PLAN-vscode-015"
type: "test-plan"
title: "VS Code · 15. Model-selector interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "15"
---
# VS Code · 15. Model-selector interface

16 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S15.01 Current-model label.

- **Expected:** The composer always shows the name of the model the next message will use.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3361; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5286; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4406; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1997
- **Where to find it:** Chat panel > bottom of the message box, the button that shows the model name (its tooltip is "Model"; it reads "Auto" by default) (labels found in the code)
- **Steps:**
  1. Sign in and open the chat panel.
  2. Look at the button at the right of the composer bottom bar. It shows "Auto" by default.
  3. Pick a specific model (see S15.10) and look at the button again.
  4. Compare the name on the button with the model the next message will use, as Expected says.

## S15.02 Provider label.

- **Expected:** Each model in the selector shows which provider or developer makes it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1168 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1997; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5286
- **Where to find it:** Chat panel > the model button at the bottom of the message box > group headings in the list (for example "Anthropic"); also Command Palette > Code: Select Model > the provider headings in the list (labels found in the code)
- **Needs:** a signed-in account or a provider key
- **Steps:**
  1. Click the model button at the bottom of the chat.
  2. Read the group headings. Provider headings show a provider name such as "Anthropic" or "OpenAI".
  3. Open Command Palette and run "Code: Select Model" and compare the provider headings there.
  4. Check each model row sits under the provider that makes it, as Expected says.

## S15.04 Searchable model list.

- **Expected:** The user can type to filter the model list by name.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:1116 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:1302; apps/extension-vscode/package.json:187
- **Where to find it:** Command Palette > Code: Select Model (the list opens with a text box; type to filter) (labels found in the code)
- **Steps:**
  1. Open Command Palette and type "Code: Select Model", then press Enter.
  2. Type part of a model name into the box at the top of the list.
  3. Look at the list: it should narrow to matching rows by name.
  4. Clear the box and check the full list comes back.

## S15.08 Automatic-selection option.

- **Expected:** The user can choose Auto so the product picks a model per message.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2008; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5286
- **Where to find it:** Chat panel > model button at the bottom of the message box > row "Auto" under Recommended; also Command Palette > Code: Select Model > row "Auto" (labels found in the code)
- **Needs:** a signed-in account whose plan includes Auto
- **Steps:**
  1. Click the model button at the bottom of the chat.
  2. Choose the row "Auto" in the Recommended group.
  3. Send a short message and check the model button still reads "Auto".
  4. Compare with Expected: the product picks a model per message.

## S15.09 Default-profile option.

- **Expected:** The user can set which model or profile new chats start with, as a lasting default.
- **Code:** done. Evidence moved: apps/extension-vscode/package.json:1219; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1225 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5286
- **Where to find it:** Command Palette > Code: Select Model, with no chat conversation open (the picker then saves a default); the saved value is the setting Default LLM model (labels found in the code)
- **Steps:**
  1. Close any open chat conversation, or use a fresh panel with no conversation.
  2. Open Command Palette, run "Code: Select Model" and pick a model.
  3. Read the message: it should say new chats now use that model.
  4. Open Settings, search for agiWorkforce.model, and check the value is the chosen model.

## S15.10 Explicit model selection.

- **Expected:** The user can pick a specific model and the next message uses it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5286; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2150
- **Where to find it:** Command Palette > Code: Select Model > pick a model row (not Auto); or the model button at the bottom of the chat (labels found in the code)
- **Needs:** a signed-in account or a provider key with at least one reachable model
- **Steps:**
  1. Open Command Palette and run "Code: Select Model".
  2. Pick a specific model row, for example one from a provider group.
  3. Check the model button at the bottom of the chat now shows that model's name.
  4. Send a message and check it runs on the chosen model, as Expected says.

## S15.11 Model description.

- **Expected:** Each model in the selector has a short description of what it is good for.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/model-picker/modelConstants.ts:240 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5286
- **Where to find it:** Command Palette > Code: Select Model > the grey description text on each model row (the detail line shows the model id and limits) (labels found in the code)
- **Steps:**
  1. Open Command Palette and run "Code: Select Model".
  2. Read the description on each model row: it shows a plan line, best-use phrases, "Thinking" for thinking models and a speed word.
  3. Read the detail line under a row for the model id and context limits.
  4. Compare with Expected: each model has a short note of what it is good for.

## S15.16 Relative speed information.

- **Expected:** The selector tells the user which models are faster or slower.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:287
- **Where to find it:** Command Palette > Code: Select Model > the speed word in the description of each model row (labels found in the code)
- **Steps:**
  1. Open Command Palette and run "Code: Select Model".
  2. Read the speed word on several rows, for example "Fastest", "Fast", "Medium speed" or "Slower".
  3. Compare the words between models.
  4. Check the faster and slower models show different words, as Expected says.

## S15.17 Relative usage or cost information.

- **Expected:** The selector shows how much each model costs or how fast it uses up the allowance.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/model-picker/modelConstants.ts:94 (quoted code not found in the file now); apps/extension-vscode/src/features/model-picker/modelConstants.ts:240 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched apps/extension-vscode for cost and usage text in the model list. The picker rows show plan, speed and capability only, not cost or usage. MODEL_COST_RATES in apps/extension-vscode/src/features/model-picker/modelConstants.ts feeds only the token counter in apps/extension-vscode/src/data/tokenCounter.ts. Turn cost appears only as a status bar message after a turn (apps/extension-vscode/src/data/turnUsage.ts), and the Model Dashboard (Code: Model Dashboard) shows requests and latency, not cost.

## S15.18 Plan-eligibility information.

- **Expected:** Models the user's plan cannot use are marked with the plan that unlocks them.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:983
- **Where to find it:** Command Palette > Code: Select Model > the group heading "Upgrade your AGI plan" (locked rows sit under it); in the chat model button popover, a group with the text "Your plan uses Auto; upgrade your AGI plan to choose these models" (labels found in the code)
- **Needs:** a Free account or any account whose plan lacks some models
- **Steps:**
  1. Sign in with an account whose plan does not include every model (for example a Free account).
  2. Open Command Palette and run "Code: Select Model".
  3. Find the heading "Upgrade your AGI plan" and read the rows under it; each shows a lock icon and a line such as "<plan> plan and up".
  4. Compare the plan named on each locked row with Expected: the plan that unlocks the model is shown.

## S15.22 Reasoning-effort selector.

- **Expected:** For reasoning models the user can choose how hard the model thinks (effort level).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5231; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1219
- **Where to find it:** Chat panel > the button with tooltip "Mode and reasoning effort" at the bottom of the message box > group "Reasoning effort"; also Command Palette > Code: Set Reasoning Effort, and the "..." More actions menu > "Next message effort" (labels found in the code)
- **Needs:** a reasoning-capable model (for example a thinking model on the plan)
- **Steps:**
  1. Choose a reasoning-capable model (see S15.10).
  2. Click the button with tooltip "Mode and reasoning effort".
  3. Read the group "Reasoning effort" and its options (None, Minimal, Low, Medium, High, xHigh, Max).
  4. Pick one level, send a message and check the choice applied, as Expected says.

## S15.27 Local-model selection.

- **Expected:** The user can pick a model that runs on their own device.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2035; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5286; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1997
- **Where to find it:** Chat panel > model button at the bottom of the message box > group "On this device" (labels found in the code)
- **Needs:** Ollama or LM Studio installed and running with a model loaded
- **Steps:**
  1. Start Ollama or LM Studio on this computer and load a model.
  2. Click the model button at the bottom of the chat.
  3. Look for the group "On this device" and the local model names in it.
  4. Pick a local model, send a message and check the model button shows it, as Expected says.

## S15.28 BYOK route selection.

- **Expected:** The user can choose to send turns through their own provider key, supplied in the product.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1409; apps/extension-vscode/src/integrations/localRuntimeClient.ts:1790
- **Where to find it:** Command Palette > Code: Provider API Keys > pick a provider > enter the key; then the model button at the bottom of the chat shows models under "Your providers" (labels found in the code)
- **Needs:** your own provider API key (from that provider's console)
- **Steps:**
  1. Open Command Palette and run "Code: Provider API Keys".
  2. Pick a provider from the list and enter your own API key.
  3. Read the confirmation: it says that provider's models are now under Your providers in the model picker.
  4. Open the model button at the bottom of the chat and look for the "Your providers" group, as Expected says.

## S15.29 Sticky model preference.

- **Expected:** The chosen model is remembered for the next session.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5286; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1225 (quoted code not found in the file now)
- **Where to find it:** Command Palette > Code: Select Model (with no conversation open) > pick a model; then reload VS Code and open a new chat to see the model button (labels found in the code)
- **Steps:**
  1. Close any open conversation and run "Code: Select Model" from Command Palette.
  2. Pick a model and confirm the message that new chats now use it.
  3. Run Developer: Reload Window from Command Palette, or quit and reopen VS Code.
  4. Open a new chat and check the model button shows the same model, as Expected says.

## S15.30 Conversation-specific override.

- **Expected:** A conversation can keep its own model, separate from the default used elsewhere.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1202; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2167; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1208; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3237; apps/extension-vscode/src/core/commandSetup.ts:1372
- **Where to find it:** Open a chat that already has messages (Sessions button in the chat header) > model button or Command Palette > Code: Select Model > pick a different model (labels found in the code)
- **Needs:** an existing chat with messages
- **Steps:**
  1. Open an existing chat that has at least one message (Sessions in the chat header opens the list).
  2. Pick a different model from the model button or from Code: Select Model.
  3. Read the message: it says this chat now uses that model and new chats still start with the default.
  4. Click New chat and check the model button still shows the default, as Expected says.

## S15.34 Model-switch incompatibility dialog.

- **Expected:** Switching to a model that cannot handle the current conversation (images, tools, context) asks for confirmation and explains what will be lost.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:347; apps/extension-vscode/src/core/commandSetup.ts:1359
- **Where to find it:** Command Palette > Code: Select Model > pick a model that cannot use tools, cannot read images, or has a smaller context than the current model; a modal dialog appears with the button "Switch anyway" (labels found in the code)
- **Needs:** a chat on a model that can use tools or images, and a target model that cannot
- **Steps:**
  1. Use a chat on a model that can use tools or read images.
  2. Open Command Palette and run "Code: Select Model".
  3. Pick a model that lacks tools or image input, or has a smaller context window.
  4. Read the modal dialog: it says Switch to <model>? and explains what is lost (for example it cannot read or edit files or run commands). Choose Switch anyway to confirm or cancel to stop, as Expected says.
