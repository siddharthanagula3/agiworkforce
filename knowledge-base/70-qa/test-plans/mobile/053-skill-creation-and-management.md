---
id: "PLAN-mobile-053"
type: "test-plan"
title: "Mobile · 53. Skill creation and management"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "53"
---
# Mobile · 53. Skill creation and management

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S53.01 Skill directory.

- **Expected:** A user can browse a catalogue of available skills, including ones not yet installed, and open any of them.
- **Code:** done. Evidence present: apps/mobile/src/features/skills/service.ts:56; apps/mobile/app/(app)/skills/index.tsx:4
- **Where to find it:** Settings > Customize > Skills (labels found in the code)
- **Needs:** A signed-in AGI Cloud account
- **Steps:**
  1. Sign in and switch to AGI Cloud (the Cloud chat mode).
  2. Open the side menu, tap Settings, then tap Customize in the Cloud group.
  3. Tap Skills in the Customize list. The Skills screen opens with a Search skills field.
  4. Scroll the list. Skills that are not installed show the status Not installed and an Install button, so the catalogue includes them.
  5. Compare with Expected: you can browse skills not yet installed and tap Details on any of them.

## S53.02 Installed Skills.

- **Expected:** A user can see the list of skills installed/active for them.
- **Code:** done. Evidence moved: apps/mobile/src/features/drawer/components/DrawerContent.tsx:115 (quoted code not found in the file now); apps/mobile/app/(app)/skills/index.tsx:4; apps/mobile/src/features/skills/SkillsScreen.tsx:333; apps/mobile/src/features/skills/service.ts:19 (quoted code not found in the file now)
- **Where to find it:** Settings > Customize > Skills (labels found in the code)
- **Needs:** A signed-in AGI Cloud account
- **Steps:**
  1. Sign in and switch to AGI Cloud.
  2. Open the side menu, tap Settings, tap Customize, then tap Skills.
  3. Read the line at the top of the list: it shows a count such as 1 SKILL INSTALLED or N SKILLS INSTALLED.
  4. Look at the status line on each card: Installed or Not installed.
  5. Compare with Expected: the list shows which skills are installed for the account.

## S53.03 Personal Skills.

- **Expected:** A user can own personal skills that only they have and that they created or added.
- **Code:** partial. Evidence moved: apps/mobile/src/features/skills/SkillsScreen.tsx:789 (quoted code not found in the file now); apps/web/lib/services/user-skill-authoring.ts:11
- **Known to be unfinished:** mobile New skill is built (POST /api/skills, shown when canAuthorSkills)
- **Where to find it:** Settings > Customize > Skills > New skill (labels found in the code)
- **Needs:** A Cloud account that the server allows to author skills (if the buttons are missing the account is not allowed)
- **Steps:**
  1. Sign in to AGI Cloud and open Settings > Customize > Skills.
  2. Look for the New skill and Import buttons above the list. They appear only when the server says this account can author skills.
  3. Tap New skill, fill in the Skill name, Skill description and Skill instructions fields, then tap Create skill.
  4. Find the new skill in the list and check its source tag reads Personal.
  5. Tap Details on it and check the Make your own section shows Edit instructions and Delete skill.

## S53.07 Skill name and description.

- **Expected:** Each skill shows its name and a description of what it does.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/skills/index.tsx:4; apps/mobile/src/features/skills/SkillsScreen.tsx:333; apps/mobile/src/features/skills/service.ts:19 (quoted code not found in the file now)
- **Where to find it:** Settings > Customize > Skills (labels found in the code)
- **Needs:** A signed-in AGI Cloud account
- **Steps:**
  1. Open Settings > Customize > Skills.
  2. Read the bold name on each card, and the grey line under it.
  3. Find a skill with no description and check it shows No description provided.
  4. Tap Details on any card and check the name shows at the top of the skill screen.
  5. Compare with Expected: each skill shows its name and a description of what it does.

## S53.08 Invocation guidance.

- **Expected:** The product tells users how and when a skill is invoked (slash name, button, or automatic matching).
- **Code:** done. Evidence moved: apps/mobile/src/features/skills/SkillsScreen.tsx:326 (quoted code not found in the file now); apps/mobile/src/features/skills/SkillsScreen.tsx:387; apps/mobile/src/features/skills/SkillsScreen.tsx:538 (quoted code not found in the file now)
- **Where to find it:** Settings > Customize > Skills, then the + button (Add to chat) in a Cloud chat (labels found in the code)
- **Needs:** A signed-in AGI Cloud account with Cloud mode on; at least one installed skill to see the Use in chat button
- **Steps:**
  1. Open Settings > Customize > Skills and read the line under the Skills heading: Install a Skill to use it in your AGI Cloud messages.
  2. Tap Details on an installed skill and read the line Turned-on skills load in your Cloud chats when a task needs them.
  3. Open a Cloud chat and tap the + button (Add to chat); look for a Skills row showing Choose or the selected skill name.
  4. In the chat box type @ and look for the Skills to use list.
  5. Compare with Expected: the product states how a skill is used (a button, an @ mention, or automatic matching).

## S53.14 Required tools.

- **Expected:** A skill declares the tools it needs and the product shows or enforces that requirement.
- **Code:** done. Evidence moved: apps/mobile/src/features/skills/SkillsScreen.tsx:333; apps/mobile/src/features/skills/service.ts:19 (quoted code not found in the file now)
- **Where to find it:** Settings > Customize > Skills (card line Needs ...), then Details (section Needs) (labels found in the code)
- **Needs:** A signed-in AGI Cloud account and a skill that declares required tools
- **Steps:**
  1. Open Settings > Customize > Skills.
  2. Find a card that has a line starting Needs followed by tool names.
  3. Tap Details on that card.
  4. Find the Needs section and check it lists Tools: followed by the same tool names.
  5. Compare with Expected: the skill declares the tools it needs and the product shows them.

## S53.17 Manual invocation.

- **Expected:** A user can explicitly pick a skill for a message and the model then uses that skill.
- **Code:** done. Evidence moved: apps/mobile/src/features/skills/SkillsScreen.tsx:387; apps/mobile/src/features/skills/SkillsScreen.tsx:538 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:415 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:3452; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1047
- **Where to find it:** Settings > Customize > Skills > Use in chat (installed skill), then the chat box (labels found in the code)
- **Needs:** A signed-in AGI Cloud account with at least one installed skill, and Cloud mode
- **Steps:**
  1. Open Settings > Customize > Skills and tap Use in chat on an installed skill.
  2. Back in the chat, look for a chip with the skill name above the text box, with an x button labelled Clear selected Skill.
  3. Type a message and send it in Cloud mode.
  4. Read the reply and check whether it follows the chosen skill's instructions.
  5. Compare with Expected: the picked skill is used for that message. The chip disappears after sending.

## S53.18 Automatic relevance-based invocation.

- **Expected:** Without being asked, the product loads a skill whose description matches the user's request.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/chat.tsx:415 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:3452; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5442; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082
- **Where to find it:** no screen of its own. No visible indicator of automatic matching was found in the mobile code; the mobile surface is not excluded from the offer (only vscode, cli and api are excluded).
- **Needs:** A signed-in AGI Cloud account with an installed skill
- **Steps:**
  1. Install a skill that has a clear description, such as a skill about writing emails.
  2. Open a Cloud chat without picking a skill and send a message that matches that description.
  3. Read the reply and check whether it follows the skill's instructions.
  4. Compare with Expected: the skill is used without being asked. No visible marker in the mobile app was found to confirm it.
