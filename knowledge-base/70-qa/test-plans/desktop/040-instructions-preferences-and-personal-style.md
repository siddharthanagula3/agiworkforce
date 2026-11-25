---
id: "PLAN-desktop-040"
type: "test-plan"
title: "Desktop · 40. Instructions, preferences, and personal style"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "40"
---
# Desktop · 40. Instructions, preferences, and personal style

23 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S40.01 Preferred name or form of address.

- **Expected:** The user can tell the assistant what to call them, and replies address them that way.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:559 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Where to find it:** Settings > Personalization > About you > What should AGI call you? (some labels not found in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in, open the account menu and choose Settings, then click Personalization.
  2. Scroll to About you and click the field under What should AGI call you?.
  3. Type a nickname or first name you choose (the field holds up to 60 characters).
  4. Wait for the Saved text under the Personalization heading.
  5. Open a new chat, send a short greeting, and check whether the reply uses the name.

## S40.02 Background information.

- **Expected:** The user can give the assistant background about themselves that it keeps in mind.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:631 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:163; apps/web/lib/server/user-identity.ts:180
- **Where to find it:** Settings > Personalization > About you > More about you (some labels not found in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then click Personalization.
  2. In About you, click the box under More about you and type a background detail, such as a hobby or a field you work in.
  3. Wait for the Saved text under the Personalization heading.
  4. Open a new chat and ask a question where that background would matter.
  5. Compare the reply with Expected. The box holds up to 1,500 characters.

## S40.03 Role or profession.

- **Expected:** The user can state their role or profession and replies are tailored to it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:581 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Where to find it:** Settings > Personalization > About you > What best describes your work? (some labels not found in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then click Personalization.
  2. In About you, open the list under What best describes your work? and pick a role.
  3. Wait for the Saved text under the Personalization heading.
  4. Open a new chat and ask for help with a task that fits the role you picked.
  5. Compare the reply with Expected.

## S40.05 Desired response style.

- **Expected:** The user can choose the response style they want, and replies follow that one choice.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/StyleSelector.tsx:31; apps/web/features/chat/stores/style-store.ts:319; apps/web/lib/prompts/prompt-manifest.ts:170
- **Where to find it:** Settings > Personalization > Response style (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then click Personalization.
  2. Open the list under Response style and pick Explanatory.
  3. Wait for the Saved text under the Personalization heading.
  4. Open a chat and click the Style button in the composer to confirm it shows the same choice.
  5. Send a question and compare the reply with Expected.

## S40.06 Response-length preference.

- **Expected:** The user can set how long replies should be, and replies follow it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/StyleSelector.tsx:260; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1433; apps/web/features/chat/stores/style-store.ts:330; apps/web/lib/hooks/useChatStream.ts:4534
- **Where to find it:** Settings > Personalization > Response length (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then click Personalization.
  2. Open the list under Response length and pick Shorter.
  3. Wait for the Saved text under the Personalization heading.
  4. Open a new chat, ask a question that has a long answer, and compare its length with Expected.

## S40.07 Formality preference.

- **Expected:** The user can choose a more or less formal register and replies follow it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:608 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Where to find it:** Settings > Personalization > Response style > Formal (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then click Personalization.
  2. Open the list under Response style and pick Formal.
  3. Wait for the Saved text under the Personalization heading.
  4. Open a new chat, send a casual question, and compare the register of the reply with Expected.

## S40.08 Tone presets.

- **Expected:** The user can pick from named tone/style presets, and one chosen preset governs replies.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/StyleSelector.tsx:31; apps/web/features/chat/stores/style-store.ts:319
- **Where to find it:** Settings > Personalization > Response style (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then click Personalization.
  2. Open the list under Response style and pick Learning.
  3. Wait for the Saved text under the Personalization heading.
  4. Open a new chat, send a question, and compare the reply with Expected.
  5. Change to Concise and send the same question, then compare again.

## S40.09 Warmth preference.

- **Expected:** The user can ask for warmer or cooler tone and replies follow it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:697 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Where to find it:** Settings > Personalization > Characteristics > Warmth (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then click Personalization.
  2. Scroll to Characteristics and open the list under Warmth.
  3. Pick More, then wait for the Saved text under the Personalization heading.
  4. Open a new chat, send a question, and compare the warmth of the reply with Expected.
  5. Pick Less, send the same question, and compare again.

## S40.10 Enthusiasm preference.

- **Expected:** The user can ask for more or less enthusiasm and replies follow it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:697 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Where to find it:** Settings > Personalization > Characteristics > Enthusiasm (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then click Personalization.
  2. Scroll to Characteristics and open the list under Enthusiasm.
  3. Pick Less, then wait for the Saved text under the Personalization heading.
  4. Open a new chat, send a question, and compare the enthusiasm of the reply with Expected.
  5. Pick More, send the same question, and compare again.

## S40.11 Heading/list preference.

- **Expected:** The user can say whether replies should use headings and lists or prose, and replies follow it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:652 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Where to find it:** Settings > Personalization > Preferred formatting (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then click Personalization.
  2. Open the list under Preferred formatting and pick Prose.
  3. Wait for the Saved text under the Personalization heading.
  4. Open a new chat, ask a question that could have a list, and check whether the reply is prose or uses lists.
  5. Compare with Expected. Headers and lists can also be turned Less or More under Characteristics.

## S40.12 Emoji preference.

- **Expected:** The user can ask for more or less emoji and replies follow it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:697 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Where to find it:** Settings > Personalization > Characteristics > Emoji (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then click Personalization.
  2. Scroll to Characteristics and open the list under Emoji.
  3. Pick Less, then wait for the Saved text under the Personalization heading.
  4. Open a new chat, send a question that invites emoji, and check whether the reply uses any.
  5. Pick More, send the same question, and compare with Expected.

## S40.13 Technical-depth preference.

- **Expected:** The user can set how technical replies should be, and replies follow it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:630 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Where to find it:** Settings > Personalization > Technical level (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then click Personalization.
  2. Open the list under Technical level and pick Beginner.
  3. Wait for the Saved text under the Personalization heading.
  4. Open a new chat, ask a technical question, and compare the depth of the reply with Expected.
  5. Pick Expert, ask the same question again, and compare.

## S40.14 Language preference.

- **Expected:** The user can set the language replies are written in (separate from the interface language), and replies follow it.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:674 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:315 (quoted code not found in the file now); apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Where to find it:** Settings > Personalization > Response language (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then click Personalization.
  2. Open the list under Response language and pick a language other than Match my message, such as French.
  3. Wait for the Saved text under the Personalization heading.
  4. Open a new chat, write a message in English, and check which language the reply uses.
  5. Compare with Expected.

## S40.16 Persistent custom instructions.

- **Expected:** The user can save standing custom instructions that apply to every new chat, and switch them off without deleting them.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:721 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/lib/server/user-identity.ts:271; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6460
- **Where to find it:** Settings > Personalization > Instructions for AGI (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then click Personalization.
  2. Click the box under Instructions for AGI and type a standing rule, such as always end with a one-line summary.
  3. Wait for the Saved text under the Personalization heading.
  4. Open a new chat, send a question, and check that the reply follows the rule.
  5. Turn off the switch beside Instructions for AGI, open a new chat, send the same question, and check the rule is no longer followed while the text stays in the box.

## S40.17 Project instructions.

- **Expected:** The user can give a project its own instructions that apply to every chat in that project.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSettingsDialog.tsx:321; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4123
- **Where to find it:** Sidebar > your project's row menu > Project settings > Instructions (labels found in the code)
- **Needs:** a project you own
- **Steps:**
  1. In the left sidebar, open the menu on a project row and click Project settings.
  2. In the Instructions box, type a rule for that project, such as answer in short bullets.
  3. Click Save.
  4. Open a chat inside that project, send a question, and check the reply follows the rule.
  5. Open a chat in a different project and check it does not follow the same rule.

## S40.19 Conversation overrides.

- **Expected:** For one conversation the user can override their standing style/instructions without changing their defaults.
- **Code:** done. Evidence present: apps/web/features/chat/stores/style-store.ts:157; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1859; apps/web/features/chat/pages/WebChatPage.tsx:1977
- **Where to find it:** Style > Concise (composer, in an open chat) (labels found in the code)
- **Needs:** a chat with messages
- **Steps:**
  1. Open a chat that already has messages and click the Style button in the composer.
  2. Click Concise and send a message.
  3. Compare the reply with Expected.
  4. Open a second chat and check its Style button still shows its own choice.
  5. Open Settings > Personalization > Response style and check the default there did not change.

## S40.20 Writing-style examples.

- **Expected:** The user can give samples of their own writing so replies match their voice.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/StyleSelector.tsx:380; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1433; apps/web/features/chat/stores/style-store.ts:353; apps/web/lib/hooks/useChatStream.ts:4534
- **Where to find it:** Style > Create Custom Style > Writing sample (labels found in the code)
- **Needs:** a writing sample of your own
- **Steps:**
  1. Click the Style button in the composer, then click Create Custom Style.
  2. Type a name, paste two or three sentences of your own writing into Writing sample, and check the Style instruction box fills in.
  3. Click Save.
  4. Send a message in that chat and compare the reply's tone with your sample.
  5. Edit the style and check the sample is still there.

## S40.23 Style reset.

- **Expected:** One action returns the user's style preferences to the defaults.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:463 (quoted code not found in the file now); apps/web/features/settings/sections/GeneralSection.tsx:808 (quoted code not found in the file now)
- **Where to find it:** Settings > Personalization > Reset response style (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then click Personalization.
  2. Change Response style to Concise and set one Characteristics trait to More.
  3. Click Reset response style.
  4. Check the toast text Response style is back to the defaults. and that Response style and the traits show Default.
  5. Check that About you and Instructions for AGI kept their text.

## S40.24 Explanatory output style.

- **Expected:** The user can choose an explanatory style that explains reasoning and context, and replies follow it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/StyleSelector.tsx:31; apps/web/features/chat/stores/style-store.ts:319
- **Where to find it:** Style > Explanatory (composer, in an open chat) (labels found in the code)
- **Needs:** a chat
- **Steps:**
  1. Open a chat and click the Style button in the composer.
  2. Click Explanatory and send a question.
  3. Compare the reply with Expected, looking for reasoning and context.

## S40.25 Learning-oriented output style.

- **Expected:** The user can choose a learning-oriented style (teaching, quizzing, step by step), and replies actually follow it.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2627 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2710 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2122; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1214 (quoted code not found in the file now)
- **Where to find it:** Style > Learning (composer, in an open chat) (labels found in the code)
- **Needs:** a chat
- **Steps:**
  1. Open a chat and click the Style button in the composer.
  2. Click Learning, which is described as Step by step, with check-ins, and send a question.
  3. Compare the reply with Expected: teaching, quizzing and step-by-step structure.

## S40.26 Concise output style.

- **Expected:** The user can choose a concise style and replies are short and direct.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:608 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/lib/server/user-identity.ts:271; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1433; apps/web/lib/hooks/useChatStream.ts:4534
- **Where to find it:** Style > Concise (composer, in an open chat) (labels found in the code)
- **Needs:** a chat
- **Steps:**
  1. Open a chat and click the Style button in the composer.
  2. Click Concise and send a question that normally gets a long answer.
  3. Compare the reply with Expected: it should be short and direct.

## S40.27 Custom output-style creation.

- **Expected:** The user can create, name, edit and delete their own output style and use it in chats.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/StyleSelector.tsx:170; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1433; apps/web/features/chat/stores/style-store.ts:365; apps/web/lib/hooks/useChatStream.ts:4534
- **Where to find it:** Style > Create Custom Style (labels found in the code)
- **Needs:** a chat
- **Steps:**
  1. Click the Style button in the composer, then click Create Custom Style.
  2. Type a Name, a Style instruction such as Answer in two sentences, and click Save.
  3. Check the new style is listed and selected. Click the pencil icon to edit it, change the name, and click Save changes.
  4. Click the trash icon, then Delete style in the confirmation to delete it.
  5. Check it is gone from the list and that the dialog warned it cannot be recovered.

## S40.30 Selective sharing of preferences with a Project.

- **Expected:** For each project the user can choose which of their personal preferences and instructions apply there.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3998
- **Where to find it:** Sidebar > your project's row menu > Project settings > Personalization (labels found in the code)
- **Needs:** a project you own and a saved Instructions for AGI
- **Steps:**
  1. In the left sidebar, open the menu on a project row and click Project settings.
  2. Under Personalization, untick Use your profile and instructions for AGI and read the line beneath it.
  3. Click Save.
  4. Open a chat in that project and send a question, then compare with Expected.
  5. Open a chat in another project that still has the box ticked and compare.
