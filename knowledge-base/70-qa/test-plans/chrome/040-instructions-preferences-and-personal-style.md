---
id: "PLAN-chrome-040"
type: "test-plan"
title: "Chrome · 40. Instructions, preferences, and personal style"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "40"
---
# Chrome · 40. Instructions, preferences, and personal style

15 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S40.01 Preferred name or form of address.

- **Expected:** The user can tell the assistant what to call them, and replies address them that way.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10127 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10141 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993
- **Where to find it:** not found in the code. No preferred-name field exists in apps/extension. The name is read from the account profile only for the greeting (apps/extension/src/features/cloud-bridge/capabilityDocument.ts), and no control for it was found. Searched apps/extension for preferred name, nickname, about you, and call me.
- **Needs:** a signed-in account

## S40.02 Background information.

- **Expected:** The user can give the assistant background about themselves that it keeps in mind.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10127 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10141 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993
- **Where to find it:** More (⋮, top right) > Memory > New memory field > Add (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in, then click the ⋮ button labelled More at the top right of the side panel.
  2. Click Memory in the menu. The Memory dialog opens.
  3. Click the box labelled "Add something for AGI to remember" and type a line of background about yourself, for example your situation or interests.
  4. Click Add.
  5. Compare: the message "Memory saved." appears and your line shows in the list. In a new chat, check that replies take it into account.

## S40.03 Role or profession.

- **Expected:** The user can state their role or profession and replies are tailored to it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10127 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10141 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993
- **Where to find it:** not found in the code. No role or profession field or control was found in apps/extension. Searched apps/extension for role, profession, personalization, and about you. The only related screen is Memory (see S40.02), which has no role field.

## S40.05 Desired response style.

- **Expected:** The user can choose the response style they want, and replies follow that one choice.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10127 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10141 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993
- **Where to find it:** not found in the code. No response style setting was found in apps/extension. Searched apps/extension for response style, tone, and personalization strings.

## S40.07 Formality preference.

- **Expected:** The user can choose a more or less formal register and replies follow it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10127 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10141 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993
- **Where to find it:** not found in the code. No formality setting was found in apps/extension. Searched apps/extension for formal, formality, and tone strings.

## S40.08 Tone presets.

- **Expected:** The user can pick from named tone/style presets, and one chosen preset governs replies.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10127 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10141 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993
- **Where to find it:** not found in the code. No tone preset picker was found in apps/extension. Searched apps/extension for tone, preset, and style strings.

## S40.09 Warmth preference.

- **Expected:** The user can ask for warmer or cooler tone and replies follow it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10127 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10141 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993
- **Where to find it:** not found in the code. No warmth setting was found in apps/extension. Searched apps/extension for warm, warmth, and tone strings.

## S40.10 Enthusiasm preference.

- **Expected:** The user can ask for more or less enthusiasm and replies follow it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10127 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10141 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993
- **Where to find it:** not found in the code. No enthusiasm setting was found in apps/extension. Searched apps/extension for enthusiasm and tone strings.

## S40.11 Heading/list preference.

- **Expected:** The user can say whether replies should use headings and lists or prose, and replies follow it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10127 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10141 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993
- **Where to find it:** not found in the code. No headings or lists preference was found in apps/extension. Searched apps/extension for heading, list, and prose strings.

## S40.12 Emoji preference.

- **Expected:** The user can ask for more or less emoji and replies follow it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10127 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10141 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993
- **Where to find it:** not found in the code. No emoji preference was found in apps/extension. The only emoji code is for the computer-use step icons (apps/extension/src/features/side-panel/computerUsePanel.ts), not a reply setting.

## S40.13 Technical-depth preference.

- **Expected:** The user can set how technical replies should be, and replies follow it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10127 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10141 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993
- **Where to find it:** not found in the code. No technical-depth setting was found in apps/extension. Searched apps/extension for technical, depth, and expertise strings.

## S40.14 Language preference.

- **Expected:** The user can set the language replies are written in (separate from the interface language), and replies follow it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10127 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10141 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993
- **Where to find it:** not found in the code. No reply-language setting was found. The only language control is Dictation language (apps/extension/src/features/options/preference-rows.ts), which sets the microphone transcription language, not the language replies are written in.

## S40.16 Persistent custom instructions.

- **Expected:** The user can save standing custom instructions that apply to every new chat, and switch them off without deleting them.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10127 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10141 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993
- **Where to find it:** not found in the code. No standing custom instructions feature was found in apps/extension. The Memory dialog stores facts with Edit and Delete only, with no on or off switch, so it does not match the Expected behaviour. Searched apps/extension for custom instructions and instructions strings.

## S40.24 Explanatory output style.

- **Expected:** The user can choose an explanatory style that explains reasoning and context, and replies follow it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10127 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10141 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993
- **Where to find it:** not found in the code. No explanatory output style was found in apps/extension. Searched apps/extension for explanatory, style, and output strings.

## S40.26 Concise output style.

- **Expected:** The user can choose a concise style and replies are short and direct.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10127 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10141 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993
- **Where to find it:** not found in the code. No concise output style setting was found in apps/extension. The only concise strings are page-summary prompts (apps/extension/src/features/side-panel/pageCommands.ts), not a setting.
