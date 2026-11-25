---
id: "PLAN-web-040"
type: "test-plan"
title: "Web · 40. Instructions, preferences, and personal style"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "40"
---
# Web · 40. Instructions, preferences, and personal style

23 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S40.01 Preferred name or form of address.

- **Expected:** The user can tell the assistant what to call them, and replies address them that way.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:559 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Personalization > About you > What should AGI call you? (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in, open the account menu and choose Settings, then choose Personalization.
  2. Scroll to About you and type a nickname in the field with the placeholder Nickname or first name.
  3. Wait for the save status to show Saved, then start a new chat and ask a question.
  4. Check that the reply uses that name, as in Expected.

## S40.02 Background information.

- **Expected:** The user can give the assistant background about themselves that it keeps in mind.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:631 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:163; apps/web/lib/server/user-identity.ts:180
- **Where to find it:** Settings > Personalization > About you > More about you (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Personalization.
  2. Scroll to About you and type background in More about you, for example interests or your situation.
  3. Wait for Saved, then start a new chat and ask a question that needs the background.
  4. Check that the reply takes the background into account, as in Expected.

## S40.03 Role or profession.

- **Expected:** The user can state their role or profession and replies are tailored to it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:581 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Personalization > About you > What best describes your work? (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Personalization.
  2. Scroll to About you and open the What best describes your work? menu.
  3. Pick a role from the list, wait for Saved, then ask a question in a new chat.
  4. Check that the reply is pitched at that role, as in Expected.

## S40.05 Desired response style.

- **Expected:** The user can choose the response style they want, and replies follow that one choice.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/StyleSelector.tsx:31; apps/web/features/chat/stores/style-store.ts:319; apps/web/lib/prompts/prompt-manifest.ts:170
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Composer > Style > Response Style (labels found in the code)
- **Steps:**
  1. In a chat, click the Style control in the composer.
  2. Under Response Style, pick Concise, Explanatory, Learning or Formal (or Default).
  3. Send a question and look at the reply shape.
  4. Check that the reply follows the chosen style and only one style is active, as in Expected.

## S40.06 Response-length preference.

- **Expected:** The user can set how long replies should be, and replies follow it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/StyleSelector.tsx:260; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1433; apps/web/features/chat/stores/style-store.ts:330; apps/web/lib/hooks/useChatStream.ts:4534
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Composer > Style > Response Length (Brief, Default, Thorough) (labels found in the code)
- **Steps:**
  1. In a chat, click the Style control in the composer.
  2. Under Response Length, pick Brief, then send a question.
  3. Pick Thorough, send the same question, and compare the lengths.
  4. Check that the reply length changes with the choice, as in Expected.

## S40.07 Formality preference.

- **Expected:** The user can choose a more or less formal register and replies follow it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:608 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Composer > Style > Formal (labels found in the code)
- **Steps:**
  1. In a chat, click the Style control in the composer.
  2. Pick Formal under Response Style.
  3. Send a casual question and read the reply.
  4. Check that the wording is formal, as in Expected.

## S40.08 Tone presets.

- **Expected:** The user can pick from named tone/style presets, and one chosen preset governs replies.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/StyleSelector.tsx:31; apps/web/features/chat/stores/style-store.ts:319
- **Where to find it:** Composer > Style > Response Style (Default, Concise, Explanatory, Learning, Formal) (labels found in the code)
- **Steps:**
  1. In a chat, click the Style control in the composer.
  2. Pick one preset under Response Style, for example Concise.
  3. Send a question and compare the reply with the Expected tone.
  4. Switch to a different preset, send again, and check that the reply changes.

## S40.09 Warmth preference.

- **Expected:** The user can ask for warmer or cooler tone and replies follow it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:697 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Personalization > Characteristics > Warmth (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Personalization.
  2. Scroll to Characteristics and open Warmth.
  3. Pick More, then ask a question in a new chat.
  4. Check that the reply is warmer, and repeat with Less to compare, as in Expected.

## S40.10 Enthusiasm preference.

- **Expected:** The user can ask for more or less enthusiasm and replies follow it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:697 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Personalization > Characteristics > Enthusiasm (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Personalization.
  2. Scroll to Characteristics and open Enthusiasm.
  3. Pick More, then ask a question in a new chat.
  4. Check that the reply is more enthusiastic, and repeat with Less to compare, as in Expected.

## S40.11 Heading/list preference.

- **Expected:** The user can say whether replies should use headings and lists or prose, and replies follow it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:652 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Personalization > Characteristics > Headers and lists (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Personalization.
  2. Scroll to Characteristics and open Headers and lists.
  3. Pick Less, ask a question in a new chat, then pick More and ask again.
  4. Check that the first reply is prose and the second uses headers and bullets, as in Expected.

## S40.12 Emoji preference.

- **Expected:** The user can ask for more or less emoji and replies follow it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:697 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Personalization > Characteristics > Emoji (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Personalization.
  2. Scroll to Characteristics and open Emoji.
  3. Pick Less, ask a question in a new chat, then pick More and ask again.
  4. Check that emoji appear only on the More reply, as in Expected.

## S40.13 Technical-depth preference.

- **Expected:** The user can set how technical replies should be, and replies follow it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:630 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Personalization > Style and tone > Technical level (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Personalization.
  2. Under Style and tone, open Technical level and pick Beginner.
  3. Ask a technical question in a new chat.
  4. Check that the reply is explained for a beginner, then pick Expert and compare, as in Expected.

## S40.14 Language preference.

- **Expected:** The user can set the language replies are written in (separate from the interface language), and replies follow it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:674 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Personalization > Style and tone > Response language (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Personalization.
  2. Under Style and tone, open Response language and pick a language other than Match my message.
  3. Send a message in English in a new chat.
  4. Check that the reply is written in the chosen language, as in Expected.

## S40.16 Persistent custom instructions.

- **Expected:** The user can save standing custom instructions that apply to every new chat, and switch them off without deleting them.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:721 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Personalization > Instructions for AGI (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Personalization.
  2. Type standing instructions in the Instructions for AGI box and wait for Saved.
  3. Start a new chat and ask a question that the instruction should change.
  4. Turn off the switch labelled Apply instructions for AGI, ask again in a new chat, and compare, as in Expected.

## S40.17 Project instructions.

- **Expected:** The user can give a project its own instructions that apply to every chat in that project.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSettingsDialog.tsx:321; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4123
- **Where to find it:** Sidebar > Projects > project row menu > Project settings > Instructions (labels found in the code)
- **Needs:** a project
- **Steps:**
  1. In the sidebar, open a project's menu and choose Project settings.
  2. Type text in the Instructions box and click Save.
  3. Open a chat inside that project and ask a question.
  4. Check that the reply follows the project instructions, as in Expected.

## S40.19 Conversation overrides.

- **Expected:** For one conversation the user can override their standing style/instructions without changing their defaults.
- **Code:** done. Evidence present: apps/web/features/chat/stores/style-store.ts:157; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1859; apps/web/features/chat/pages/WebChatPage.tsx:1977
- **Where to find it:** Composer > Style (in one chat) (labels found in the code)
- **Steps:**
  1. In a chat, click the Style control and pick a style such as Concise.
  2. Send a question in this chat and check the reply is short.
  3. Open a second chat and leave its style at Default.
  4. Check that the second chat keeps its own style and the Settings default is unchanged, as in Expected.

## S40.20 Writing-style examples.

- **Expected:** The user can give samples of their own writing so replies match their voice.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/StyleSelector.tsx:380; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1433; apps/web/features/chat/stores/style-store.ts:353; apps/web/lib/hooks/useChatStream.ts:4534
- **Where to find it:** Composer > Style > Create Custom Style > Writing sample (labels found in the code)
- **Needs:** a sample of your own writing (paste text)
- **Steps:**
  1. In a chat, click the Style control and choose Create Custom Style.
  2. Type a Name, paste text into Writing sample, and click Save.
  3. Select the new style and ask for a short piece of writing.
  4. Check that the reply matches the voice of the sample, as in Expected.

## S40.23 Style reset.

- **Expected:** One action returns the user's style preferences to the defaults.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:463 (quoted code not found in the file now); apps/web/features/settings/sections/GeneralSection.tsx:808 (quoted code not found in the file now)
- **Where to find it:** Settings > Personalization > Reset response style (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Personalization.
  2. Change Response style and a few Characteristics.
  3. Click Reset response style and read the toast.
  4. Check that the controls return to Default and the toast says Response style is back to the defaults, as in Expected.

## S40.24 Explanatory output style.

- **Expected:** The user can choose an explanatory style that explains reasoning and context, and replies follow it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/StyleSelector.tsx:31; apps/web/features/chat/stores/style-store.ts:319
- **Where to find it:** Composer > Style > Explanatory (labels found in the code)
- **Steps:**
  1. In a chat, click the Style control and pick Explanatory under Response Style.
  2. Ask how a simple process works.
  3. Check that the reply gives reasoning and context, as in Expected.

## S40.25 Learning-oriented output style.

- **Expected:** The user can choose a learning-oriented style (teaching, quizzing, step by step), and replies actually follow it.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2627 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2710 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2122; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1214 (quoted code not found in the file now)
- **Where to find it:** Composer > Style > Learning (labels found in the code)
- **Steps:**
  1. In a chat, click the Style control and pick Learning under Response Style.
  2. Ask a question about a topic you want to learn.
  3. Check that the reply goes step by step with check-ins, as in Expected.

## S40.26 Concise output style.

- **Expected:** The user can choose a concise style and replies are short and direct.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:608 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/lib/server/user-identity.ts:271; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1433; apps/web/lib/hooks/useChatStream.ts:4534
- **Where to find it:** Composer > Style > Concise (labels found in the code)
- **Steps:**
  1. In a chat, click the Style control and pick Concise under Response Style.
  2. Ask a question that normally gets a long answer.
  3. Check that the reply is short and direct, as in Expected.

## S40.27 Custom output-style creation.

- **Expected:** The user can create, name, edit and delete their own output style and use it in chats.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/StyleSelector.tsx:170; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1433; apps/web/features/chat/stores/style-store.ts:365; apps/web/lib/hooks/useChatStream.ts:4534
- **Where to find it:** Composer > Style > Create Custom Style (edit with the pencil, delete with the trash icon) (labels found in the code)
- **Steps:**
  1. In a chat, click the Style control and choose Create Custom Style.
  2. Enter a Name and a Style instruction, then click Save. Use the Edit control on the style to change it and Save changes.
  3. Select the style, ask a question, and check the reply follows it.
  4. Use the Delete control, read the confirmation and choose Delete style, then check the style is gone, as in Expected.

## S40.30 Selective sharing of preferences with a Project.

- **Expected:** For each project the user can choose which of their personal preferences and instructions apply there.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3998
- **Where to find it:** Sidebar > Projects > project row menu > Project settings > Personalization (labels found in the code)
- **Needs:** a project and a saved personal instruction
- **Steps:**
  1. Open a project's Project settings from its sidebar menu.
  2. Under Personalization, check or uncheck Use your profile and instructions for AGI.
  3. Click Save, open a chat in that project, and ask a question.
  4. Check that the reply uses your personal instructions only when the box is checked, as in Expected.
