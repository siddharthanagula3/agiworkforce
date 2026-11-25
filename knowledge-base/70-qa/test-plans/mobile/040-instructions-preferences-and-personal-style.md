---
id: "PLAN-mobile-040"
type: "test-plan"
title: "Mobile · 40. Instructions, preferences, and personal style"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "40"
---
# Mobile · 40. Instructions, preferences, and personal style

19 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S40.01 Preferred name or form of address.

- **Expected:** The user can tell the assistant what to call them, and replies address them that way.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/personalization/index.tsx:530; apps/mobile/app/(app)/profile/index.tsx:197; apps/mobile/src/features/memory/services/personalContext.ts:39; apps/mobile/services/cloudSettingsMapping.ts:137
- **Where to find it:** Open menu > Settings > Personalization (under Assistant) > Nickname (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap "Open menu" at the top left of a chat.
  2. Tap "Settings" in the side menu.
  3. Under "Assistant", tap "Personalization".
  4. Type a name in "Nickname" (placeholder "What should AGI call you?").
  5. Tap "Save personalization settings" (Save at the top right).
  6. Start a new chat, ask "What is my name?" and check the reply uses that name.

## S40.02 Background information.

- **Expected:** The user can give the assistant background about themselves that it keeps in mind.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/personalization/index.tsx:554; apps/mobile/services/cloudSettingsMapping.ts:154
- **Where to find it:** Open menu > Settings > Personalization > More about you (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap "Open menu", then "Settings".
  2. Under "Assistant", tap "Personalization".
  3. Type interests, values or background into "More about you" (placeholder "Interests, values or background to keep in mind").
  4. Tap "Save personalization settings".
  5. Start a new chat and ask for a suggestion that depends on your background, and check the reply takes it into account.

## S40.03 Role or profession.

- **Expected:** The user can state their role or profession and replies are tailored to it.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/personalization/index.tsx:542; apps/mobile/app/(app)/profile/index.tsx:197; apps/mobile/src/features/memory/services/personalContext.ts:39; apps/mobile/services/cloudSettingsMapping.ts:137
- **Where to find it:** Open menu > Settings > Personalization > Occupation (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap "Open menu", then "Settings".
  2. Under "Assistant", tap "Personalization".
  3. Type your work into "Occupation" (placeholder "e.g. Founder & Engineer").
  4. Tap "Save personalization settings".
  5. Start a new chat, ask for an example, and check the example fits your work.

## S40.05 Desired response style.

- **Expected:** The user can choose the response style they want, and replies follow that one choice.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/StyleSelector.tsx:30; apps/mobile/stores/chat/chatExecutionStore.ts:1187
- **Where to find it:** Chat screen > Add to chat (+ button by the message box) > Choose style (labels found in the code)
- **Needs:** a signed-in account and a chat
- **Steps:**
  1. Open a chat or start a new one.
  2. Tap the "+" button labelled "Add to chat" next to the message box.
  3. Tap "Choose style".
  4. Tap "Explanatory" (or another option) in the style sheet.
  5. Send a question and check the reply follows that one style.

## S40.06 Response-length preference.

- **Expected:** The user can set how long replies should be, and replies follow it.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/personalization/index.tsx:604; apps/mobile/src/features/memory/services/personalization.ts:30
- **Where to find it:** Open menu > Settings > Personalization > Response Length (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap "Open menu", then "Settings".
  2. Under "Assistant", tap "Personalization".
  3. Under "Response Length", tap "Shorter" or "Longer" (or "Default").
  4. Tap "Save personalization settings".
  5. Start a new chat, ask a question, and compare the reply length with the choice.

## S40.07 Formality preference.

- **Expected:** The user can choose a more or less formal register and replies follow it.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/personalization/index.tsx:380 (quoted code not found in the file now); apps/mobile/src/features/settings/personalization/constants.ts:15; apps/mobile/app/(app)/profile/index.tsx:197; apps/mobile/src/features/memory/services/personalContext.ts:39
- **Where to find it:** Open menu > Settings > Personalization > Style Preset > Formal (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap "Open menu", then "Settings".
  2. Under "Assistant", tap "Personalization".
  3. Under "Style Preset", tap "Formal" (description "Professional, precise language").
  4. Tap "Save personalization settings".
  5. Start a new chat, ask a question, and check the reply uses a more formal register.

## S40.08 Tone presets.

- **Expected:** The user can pick from named tone/style presets, and one chosen preset governs replies.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/StyleSelector.tsx:30; apps/mobile/stores/chat/chatExecutionStore.ts:1187
- **Where to find it:** Open menu > Settings > Personalization > Style Preset (or Chat > Add to chat > Choose style) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap "Open menu", then "Settings", then "Personalization".
  2. Under "Style Preset", tap one preset: Default, Concise, Explanatory, Learning or Formal.
  3. Tap "Save personalization settings".
  4. Start a new chat, ask a question, and check the reply follows only that preset.

## S40.09 Warmth preference.

- **Expected:** The user can ask for warmer or cooler tone and replies follow it.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/personalization/index.tsx:400 (quoted code not found in the file now); apps/mobile/app/(app)/profile/index.tsx:197; apps/mobile/src/features/memory/services/personalContext.ts:39; apps/mobile/services/cloudSettingsMapping.ts:137
- **Where to find it:** Open menu > Settings > Personalization > Response Style > Warmth (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap "Open menu", then "Settings", then "Personalization".
  2. Under "Response Style", tap the "Warmth" row.
  3. In the sheet, tap "More" (warmer) or "Less" (cooler), or "Default".
  4. Tap "Save personalization settings".
  5. Start a new chat, ask a question, and compare the warmth of the reply.

## S40.10 Enthusiasm preference.

- **Expected:** The user can ask for more or less enthusiasm and replies follow it.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/personalization/index.tsx:400 (quoted code not found in the file now); apps/mobile/app/(app)/profile/index.tsx:197; apps/mobile/src/features/memory/services/personalContext.ts:39; apps/mobile/services/cloudSettingsMapping.ts:137
- **Where to find it:** Open menu > Settings > Personalization > Response Style > Enthusiasm (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap "Open menu", then "Settings", then "Personalization".
  2. Under "Response Style", tap the "Enthusiasm" row.
  3. In the sheet, tap "More" or "Less" (or "Default").
  4. Tap "Save personalization settings".
  5. Start a new chat, ask a question, and compare how energetic the reply sounds.

## S40.11 Heading/list preference.

- **Expected:** The user can say whether replies should use headings and lists or prose, and replies follow it.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/personalization/index.tsx:400 (quoted code not found in the file now); apps/mobile/app/(app)/profile/index.tsx:197; apps/mobile/src/features/memory/services/personalContext.ts:39; apps/mobile/services/cloudSettingsMapping.ts:137
- **Where to find it:** Open menu > Settings > Personalization > Response Style > Headers and lists (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap "Open menu", then "Settings", then "Personalization".
  2. Under "Response Style", tap the "Headers and lists" row.
  3. In the sheet, tap "More" for headings and lists, or "Less" for prose.
  4. Tap "Save personalization settings".
  5. Start a new chat, ask a question that has several parts, and check whether the reply uses headers and lists.

## S40.12 Emoji preference.

- **Expected:** The user can ask for more or less emoji and replies follow it.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/personalization/index.tsx:400 (quoted code not found in the file now); apps/mobile/app/(app)/profile/index.tsx:197; apps/mobile/src/features/memory/services/personalContext.ts:39; apps/mobile/services/cloudSettingsMapping.ts:137
- **Where to find it:** Open menu > Settings > Personalization > Response Style > Emoji (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap "Open menu", then "Settings", then "Personalization".
  2. Under "Response Style", tap the "Emoji" row.
  3. In the sheet, tap "Less" (no emoji) or "More".
  4. Tap "Save personalization settings".
  5. Start a new chat, ask a question, and check whether the reply has emoji.

## S40.13 Technical-depth preference.

- **Expected:** The user can set how technical replies should be, and replies follow it.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/personalization/index.tsx:613; apps/mobile/src/features/memory/services/personalization.ts:30
- **Where to find it:** Open menu > Settings > Personalization > Technical Level (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap "Open menu", then "Settings", then "Personalization".
  2. Under "Technical Level", tap "Beginner", "Intermediate" or "Expert" (or "Not set").
  3. Tap "Save personalization settings".
  4. Start a new chat, ask the same technical question, and compare the depth of the reply.

## S40.14 Language preference.

- **Expected:** The user can set the language replies are written in (separate from the interface language), and replies follow it.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/personalization/index.tsx:622; apps/mobile/src/features/memory/services/personalization.ts:30
- **Where to find it:** Open menu > Settings > Personalization > Response Language (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap "Open menu", then "Settings", then "Personalization".
  2. Under "Response Language", tap a language name, or "Match my message" to keep the default.
  3. Tap "Save personalization settings".
  4. Start a new chat, ask a question, and check the reply is written in the chosen language.

## S40.16 Persistent custom instructions.

- **Expected:** The user can save standing custom instructions that apply to every new chat, and switch them off without deleting them.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/personalization/index.tsx:566; apps/mobile/app/(app)/profile/index.tsx:197; apps/mobile/src/features/memory/services/personalContext.ts:39; apps/mobile/services/cloudSettingsMapping.ts:137
- **Where to find it:** Open menu > Settings > Personalization > Custom Instructions (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap "Open menu", then "Settings", then "Personalization".
  2. Type standing instructions into "Custom Instructions" (placeholder "e.g. I prefer direct, technical answers...").
  3. Tap "Save personalization settings", then start a new chat and check a reply follows them.
  4. To switch them off, clear the "Custom Instructions" field, tap save, and check the next reply no longer follows them.

## S40.17 Project instructions.

- **Expected:** The user can give a project its own instructions that apply to every chat in that project.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/projects.tsx:180 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2773
- **Where to find it:** Open menu > Projects > (a project) > Instructions (labels found in the code)
- **Needs:** a signed-in account and a project
- **Steps:**
  1. Tap "Open menu" and tap "Projects".
  2. Tap a project in the list.
  3. Tap the "Instructions" row.
  4. Type into "Project instructions" and save.
  5. Start a new chat inside that project, ask a question, and check the reply follows the project instructions.

## S40.19 Conversation overrides.

- **Expected:** For one conversation the user can override their standing style/instructions without changing their defaults.
- **Code:** done. Evidence present: apps/mobile/stores/chat/chatViewStore.ts:66; apps/mobile/stores/chat/chatExecutionStore.ts:134; apps/mobile/stores/chat/chatMessageStore.ts:603
- **Where to find it:** Chat screen > Add to chat (+) > Choose style (labels found in the code)
- **Needs:** a signed-in account and a chat
- **Steps:**
  1. Open a chat with a saved conversation.
  2. Tap "Add to chat" (+), then "Choose style".
  3. Tap "Concise" and send a question.
  4. Check the reply is short, then open Settings > Personalization and check the saved Style Preset is unchanged.

## S40.23 Style reset.

- **Expected:** One action returns the user's style preferences to the defaults.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/personalization/index.tsx:394
- **Where to find it:** Open menu > Settings > Personalization > Reset response style (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap "Open menu", then "Settings", then "Personalization".
  2. Change a few Response Style or Style Preset choices.
  3. Tap "Reset response style".
  4. Check the choices return to Default, then tap "Save personalization settings" to keep them.

## S40.24 Explanatory output style.

- **Expected:** The user can choose an explanatory style that explains reasoning and context, and replies follow it.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/StyleSelector.tsx:30; apps/mobile/stores/chat/chatExecutionStore.ts:1187
- **Where to find it:** Chat screen > Add to chat (+) > Choose style > Explanatory (labels found in the code)
- **Needs:** a signed-in account and a chat
- **Steps:**
  1. Open a chat.
  2. Tap "Add to chat" (+), then "Choose style".
  3. Tap "Explanatory" (description "Reasoning and context").
  4. Send a question and check the reply explains reasoning and context.

## S40.26 Concise output style.

- **Expected:** The user can choose a concise style and replies are short and direct.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/personalization/index.tsx:380 (quoted code not found in the file now); apps/mobile/app/(app)/profile/index.tsx:197; apps/mobile/src/features/memory/services/personalContext.ts:39; apps/mobile/stores/chat/chatExecutionStore.ts:388 (quoted code not found in the file now)
- **Where to find it:** Chat screen > Add to chat (+) > Choose style > Concise (labels found in the code)
- **Needs:** a signed-in account and a chat
- **Steps:**
  1. Open a chat.
  2. Tap "Add to chat" (+), then "Choose style".
  3. Tap "Concise" (description "Short, direct answers").
  4. Send a question and check the reply is short and direct.
