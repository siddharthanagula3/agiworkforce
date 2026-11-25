---
id: "PLAN-cli-015"
type: "test-plan"
title: "CLI · 15. Model-selector interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "15"
---
# CLI · 15. Model-selector interface

27 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S15.01 Current-model label.

- **Expected:** The composer always shows the name of the model the next message will use.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3406 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:2035; apps/cli/src/tui/widgets/model_picker.rs:786
- **Where to find it:** agi (start, then read the top header line); or /statusline, then turn on the model item to see model: in the status bar (labels found in the code)
- **Steps:**
  1. Start agi and sign in if asked.
  2. Read the top header line: the model name is shown next to the product name and version.
  3. Type /statusline, keep the model item on (Space toggles, Enter saves), and read the model: label in the status bar.
  4. Type /model and pick another row; check the header and status bar now show the new model name.

## S15.02 Provider label.

- **Expected:** Each model in the selector shows which provider or developer makes it.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:544; apps/cli/src/tui/tui_app.rs:2035; apps/cli/src/tui/widgets/model_picker.rs:786
- **Where to find it:** /model (opens the Models picker); provider name is the heading above each group under a section such as Bring your own key (labels found in the code)
- **Steps:**
  1. Type /model and press Enter.
  2. Read the section heading, for example Bring your own key, and under it the provider name row (bold, not indented as much as models).
  3. Read the model rows under that provider heading and check they belong to that provider.
  4. Compare with Expected: each model is listed under its provider name.

## S15.03 Model-family grouping.

- **Expected:** Models are grouped by family (e.g. all versions of one model line together) so related models sit side by side.
- **Code:** done. Evidence present: crates/agiworkforce-model-registry/src/lib.rs:542; apps/cli/src/tui/widgets/model_picker.rs:165
- **Where to find it:** /model, then scroll inside one provider section (labels found in the code)
- **Steps:**
  1. Type /model and press Enter.
  2. Move the cursor with Up and Down through one provider section.
  3. Check that versions of the same model family sit next to each other.

## S15.04 Searchable model list.

- **Expected:** The user can type to filter the model list by name.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:109; apps/cli/src/tui/widgets/model_picker.rs:493; apps/cli/src/tui/tui_app.rs:2035
- **Where to find it:** /model, then type in the search line (labels found in the code)
- **Steps:**
  1. Type /model and press Enter.
  2. Type part of a model name, for example a few letters.
  3. Check that the list shows only matching rows and their provider headings.
  4. Clear the search text and check the full list returns.

## S15.08 Automatic-selection option.

- **Expected:** The user can choose Auto so the product picks a model per message.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:477; apps/cli/src/lib.rs:8004; apps/cli/src/lib.rs:8037
- **Where to find it:** Start a terminal command: agi --auto (not in the /model picker) (labels found in the code)
- **Needs:** a signed-in AGI account (managed cloud)
- **Steps:**
  1. Sign in to an AGI account, then run agi --auto in a terminal.
  2. Read the line printed before the session starts.
  3. Send a message and check the answer details name a model.

## S15.09 Default-profile option.

- **Expected:** The user can set which model or profile new chats start with, as a lasting default.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1880; apps/cli/src/lib.rs:4778
- **Where to find it:** Terminal command: agi models set <model-id>, then start agi (labels found in the code)
- **Steps:**
  1. Run agi models set <model-id> (add --provider <name> if needed).
  2. Read the line Default model set to <model-id> (<provider>).
  3. Quit and run agi with no -m flag.
  4. Check the header shows the model you set.

## S15.10 Explicit model selection.

- **Expected:** The user can pick a specific model and the next message uses it.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:568; apps/cli/src/tui/widgets/model_picker.rs:786; apps/cli/src/tui/tui_app.rs:2035
- **Where to find it:** /model, pick a row, press Enter (labels found in the code)
- **Steps:**
  1. Type /model and press Enter.
  2. Move to a model row with Up and Down and press Enter.
  3. Read the banner Model changed to <model-id>.
  4. Send a message and check the header or answer details name that model.

## S15.11 Model description.

- **Expected:** Each model in the selector has a short description of what it is good for.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:424; apps/cli/src/tui/widgets/model_picker.rs:438; apps/cli/src/model_catalog.rs:1395
- **Where to find it:** /model, then move the cursor over a model row (labels found in the code)
- **Steps:**
  1. Type /model and press Enter.
  2. Move the cursor up and down over several model rows.
  3. Read the single line under the list for the highlighted model, which starts with Best for.

## S15.12 Input-modality badges.

- **Expected:** Models show which inputs they accept (e.g. images, audio) as badges.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5859; apps/cli/src/tui/tui_app.rs:5851
- **Where to find it:** /models (type it and press Enter); flags are in the text list, not in the /model picker (labels found in the code)
- **Steps:**
  1. Type /models and press Enter.
  2. Find the line Flags: T=tools, V=vision, R=reasoning, P=reads PDFs, A=audio input.
  3. Read the letters in brackets after each model id, for example [T V].
  4. Compare with Expected: input types appear as letters, not badges.

## S15.14 Tool-support badge.

- **Expected:** Models show whether they can use tools.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5859; apps/cli/src/tui/tui_app.rs:5851
- **Where to find it:** /models (type it and press Enter) (labels found in the code)
- **Steps:**
  1. Type /models and press Enter.
  2. Read the flags line at the end of the list for T=tools.
  3. Read the T letter in brackets for each model.

## S15.15 Context-capacity information.

- **Expected:** The selector shows how much context each model can hold.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:657; apps/cli/src/tui/widgets/model_picker.rs:568; apps/cli/src/tui/tui_app.rs:5851
- **Where to find it:** /model, read the right side of each model row (labels found in the code)
- **Steps:**
  1. Type /model and press Enter.
  2. Read the right side of each model row, for example 200K ctx.
  3. Compare the numbers between two models.

## S15.16 Relative speed information.

- **Expected:** The selector tells the user which models are faster or slower.
- **Code:** done. Evidence present: apps/cli/src/design_system.rs:355; apps/cli/src/tui/widgets/model_picker.rs:568; apps/cli/src/tui/widgets/model_picker.rs:786
- **Where to find it:** /model, read the tier word in the middle of each model row (labels found in the code)
- **Steps:**
  1. Type /model and press Enter.
  2. Read the word after each model name: Fastest, Balanced or Most capable.
  3. Compare Fastest rows with Most capable rows.

## S15.17 Relative usage or cost information.

- **Expected:** The selector shows how much each model costs or how fast it uses up the allowance.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:5851; apps/cli/src/tui/tui_app.rs:3465 (quoted code not found in the file now)
- **Where to find it:** /models (prices); or /models <model-id> for one model's Pricing line (labels found in the code)
- **Steps:**
  1. Type /models and press Enter.
  2. Read the price note: Prices are per 1M input/output tokens.
  3. Type /models <model-id> with a model id and read the Pricing line.

## S15.18 Plan-eligibility information.

- **Expected:** Models the user's plan cannot use are marked with the plan that unlocks them.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:627
- **Where to find it:** /model, under the Managed section (tagline managed by AGI subscription), on a dimmed row (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in to a Free account, then type /model and press Enter.
  2. Find the section with the tagline managed by AGI subscription.
  3. Read the dimmed rows; the word at the right reads needs <plan>, or unavailable.
  4. Compare with Expected: each locked model names the plan that unlocks it.

## S15.19 Preview or experimental badge.

- **Expected:** Preview or experimental models carry a visible badge in the selector.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:438
- **Where to find it:** /model, highlight a model, read the single detail line under the list (labels found in the code)
- **Steps:**
  1. Type /model and press Enter.
  2. Move the cursor onto each model and read the detail line under the list.
  3. Check a preview, beta or experimental model shows that word on the detail line.

## S15.20 Deprecated-model notice.

- **Expected:** A model scheduled for retirement shows a notice with its leaving date before it disappears.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:438; apps/cli/src/provider.rs:224
- **Where to find it:** /model, highlight a model; or /models <model-id> (labels found in the code)
- **Steps:**
  1. Type /model and press Enter.
  2. Move the cursor onto each model and read the detail line under the list.
  3. Check a scheduled model shows deprecated, leaves <date>.
  4. Compare with /models <model-id>, which shows deprecated, leaves the catalog <date>.

## S15.22 Reasoning-effort selector.

- **Expected:** For reasoning models the user can choose how hard the model thinks (effort level).
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:603; apps/cli/src/tui/tui_app.rs:6452; apps/cli/src/tui/widgets/model_picker.rs:786
- **Where to find it:** /model, highlight a reasoning model, then Left or Right arrow; or /effort (labels found in the code)
- **Steps:**
  1. Type /model and press Enter, then highlight a reasoning model.
  2. Read the bar Thinking: on with Effort: followed by a level, for example Medium.
  3. Press Right or Left and watch the level change.
  4. Press Enter to select, then type /effort and read the line Effort set to.

## S15.23 Fast-serving option where supported.

- **Expected:** Where a model offers a faster serving tier, the user can turn it on.
- **Code:** partial. Evidence moved: apps/cli/src/tui/tui_app.rs:5825; apps/cli/src/agent/mod.rs:2903; apps/cli/src/tui/tui_app.rs:3433 (quoted code not found in the file now)
- **Known to be unfinished:** Waits on the c-platform fast tier (per-model fast tier and price in the registry, speed or service_tier in the gateway, provider payloads and billing); then /fast switches to that tier of the same model.
- **Where to find it:** Type /fast in the chat and press Enter (labels found in the code)
- **Steps:**
  1. Type /fast and press Enter.
  2. Read the line Fast mode ON, using <model>, with a credit-rate note if priced.
  3. Type /fast again and read Fast mode OFF, back to <model>.
  4. Compare with Expected: a faster tier of the same model.

## S15.24 Response-length preference.

- **Expected:** The user can set a preferred response length (shorter or longer answers).
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:5724; apps/cli/src/output_styles.rs:36 (quoted code not found in the file now)
- **Where to find it:** Type /output-style in the chat and press Enter (labels found in the code)
- **Steps:**
  1. Type /output-style and press Enter.
  2. Read the list under Available styles:, which includes concise.
  3. Type /output-style concise and press Enter.
  4. Ask a short question and compare the answer length with the default style.

## S15.25 Advanced sampling controls where exposed.

- **Expected:** Where sampling settings are exposed, the user can set them (temperature, top-p).
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:252; apps/cli/src/lib.rs:4303 (quoted code not found in the file now)
- **Where to find it:** Terminal command: agi --help, then agi -t <value> (temperature flag) (labels found in the code)
- **Steps:**
  1. Run agi --help and find the line Temperature (0.0 - 1.0).
  2. Start a session with agi -t 0.2 and send the same message twice with agi -t 1.0.
  3. Compare how varied the two answers are.

## S15.26 Provider-route selection where exposed.

- **Expected:** Where a model is offered by several providers, the user can choose which provider serves it.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:194; apps/cli/src/tui/widgets/model_picker.rs:786
- **Where to find it:** Terminal command: agi --provider <name> -m <model>, or agi --help for the flag text (labels found in the code)
- **Needs:** a key or local server for the chosen provider
- **Steps:**
  1. Run agi --help and find the line Provider override (anthropic, openai, google, ollama).
  2. Run agi --provider <name> -m <model> and send a message.
  3. Check the header or answer details name the model served by that provider.

## S15.27 Local-model selection.

- **Expected:** The user can pick a model that runs on their own device.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:535; apps/cli/src/tui/widgets/model_picker.rs:786
- **Where to find it:** /model, top section Local (tagline on-device · private · free) (labels found in the code)
- **Needs:** a local model server (Ollama or LM Studio) with a model installed
- **Steps:**
  1. Type /model and press Enter.
  2. Find the section Local with the tagline on-device · private · free.
  3. Highlight a local model row and press Enter.
  4. Read the banner Model changed to <model-id>, then send a message.

## S15.28 BYOK route selection.

- **Expected:** The user can choose to send turns through their own provider key, supplied in the product.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:535; apps/cli/src/auth.rs:120
- **Where to find it:** /model, section Bring your own key (tagline your own provider keys) (labels found in the code)
- **Needs:** a provider key saved in the product
- **Steps:**
  1. Type /model and press Enter.
  2. Find the section Bring your own key with the tagline your own provider keys.
  3. Highlight a row under it and press Enter.
  4. Read the banner Model changed to <model-id> and check the status chip says Your key.

## S15.29 Sticky model preference.

- **Expected:** The chosen model is remembered for the next session.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1880; apps/cli/src/lib.rs:4778
- **Where to find it:** Terminal command: agi models set <model-id> (persists), then a new agi session (labels found in the code)
- **Steps:**
  1. Run agi models set <model-id>.
  2. Quit and start agi again with no -m flag.
  3. Check the header shows the saved model.

## S15.30 Conversation-specific override.

- **Expected:** A conversation can keep its own model, separate from the default used elsewhere.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:786; apps/cli/src/tui/tui_app.rs:2035
- **Where to find it:** /model in one session, then resume a conversation with its stored model (entry point not traced) (labels found in the code)
- **Needs:** a signed-in AGI account to store conversations
- **Steps:**
  1. Type /model, choose a model, and send a message in one conversation.
  2. Start a second conversation with a different model as default.
  3. Resume the first conversation and check the header shows its model, not the default.

## S15.32 Actual-serving-model disclosure.

- **Expected:** Each answer shows which model actually produced it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2133; apps/cli/src/tui/tui_app.rs:8650; apps/cli/src/agent/chat.rs:921
- **Where to find it:** Type `agi` to open the chat screen, send any message, then look at the line under the answer (the line starts with "↳"). (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Run `agi` in a terminal to open the chat screen.
  2. Type a short message such as "hi" and press Enter.
  3. When the answer finishes, look at the grey line under the answer.
  4. Check that the model name on that line is the model you chose or the one the product routed to, and that it matches the model shown in the composer.

## S15.33 Fallback disclosure.

- **Expected:** When a different model answered because the chosen one failed or was unavailable, the answer says so and why.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3324; apps/cli/src/tui/tui_app.rs:1018
- **Where to find it:** Type `agi` to open the chat screen, send a message while a fallback model is in use, then look at the banner above the composer and the "↳" line under the answer. (labels found in the code)
- **Needs:** a setup where the chosen model fails (for example a fallback chain set with --fallback-model or -m a,b,c, or a rate-limited account)
- **Steps:**
  1. Run `agi` in a terminal and start a chat with a model set that can fail or be unavailable (for example, a model that is rate limited or unreachable).
  2. Send a message and wait for the answer.
  3. Watch the chat area for the banner " ↘ Falling back: <from> → <to> (<reason>)"; it stays for about 5 seconds.
  4. Check that the banner names the model that failed, the model that answered, and the reason, and that the answer line shows the model that answered.
