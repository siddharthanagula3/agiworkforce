---
id: "PLAN-web-053"
type: "test-plan"
title: "Web · 53. Skill creation and management"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "53"
---
# Web · 53. Skill creation and management

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S53.01 Skill directory.

- **Expected:** A user can browse a catalogue of available skills, including ones not yet installed, and open any of them.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-nav.ts:376; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/hooks/useDirectoryAdapter.ts:475; apps/web/features/directory/services/skills-directory.ts:269; apps/web/app/api/skills/route.ts:141
- **Earlier check in the running app:** PASS: E019 [PASS; interaction]: Browse opens the built-in Installed catalog; searching research-and-citations narrows it to one skill with name, publisher and description.
- **Where to find it:** Settings > Customize > Skills > Browse (then Add from the catalog) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings and choose Skills under the Customize group.
  2. Click Browse at the top right of the Skills page.
  3. Look for the catalogue list of skills, including ones not yet installed.
  4. Click one skill name to open its detail page and check it opens.

## S53.02 Installed Skills.

- **Expected:** A user can see the list of skills installed/active for them.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-nav.ts:376; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/services/skills-directory.ts:216; apps/web/features/directory/hooks/useDirectoryAdapter.ts:475; apps/web/app/api/skills/route.ts:141
- **Earlier check in the running app:** PASS: E018 [UI_ONLY; visible UI]: Personal skill manager loads with no user skills and Browse/Add controls; no installation or imported executable content used. | E019 [PASS; interaction]: Browse opens the built-in Installed catalog; searching research-and-citations narrows it to one skill with name, publisher and description.
- **Where to find it:** Settings > Customize > Skills (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings and choose Skills under the Customize group.
  2. Look at the list of skills shown for this account.
  3. Check the Status column of each row (for example 'Available' or an installed state).
  4. Compare the rows with the skills you know are active for this account.

## S53.03 Personal Skills.

- **Expected:** A user can own personal skills that only they have and that they created or added.
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Earlier check in the running app:** UI_ONLY: E018 [UI_ONLY; visible UI]: Personal skill manager loads with no user skills and Browse/Add controls; no installation or imported executable content used.
- **Where to find it:** Settings > Customize > Skills > Add > Create a skill (labels found in the code)
- **Needs:** an account that can create skills
- **Steps:**
  1. Open Settings, then Skills.
  2. Click Add and choose Create a skill.
  3. Fill in Name, Description and Instructions, then click Create skill.
  4. Check the new skill appears in your own list, and that the empty-state text 'No skills of your own yet.' is gone.

## S53.06 Skill detail page.

- **Expected:** A user can open a skill detail view showing its description, instructions and files.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/SkillDetailView.tsx:210; packages/ui/ui/src/directory/SkillDetailView.tsx:256; apps/web/features/directory/services/skills-directory.ts:369
- **Earlier check in the running app:** PASS: E020 [PASS; interaction]: Skill detail shows its built-in publisher, installed state, SKILL.md content, raw/rendered toggle, enable switch and Try in chat. No skill executed or disabled.
- **Where to find it:** Settings > Customize > Skills > [skill name] (labels found in the code)
- **Steps:**
  1. Open Settings, then Skills.
  2. Click any skill name in the list.
  3. Check the detail page shows the description, the Source and access section, and the skill's instructions (Rendered and Raw buttons).
  4. Check the Enable skill switch and the Try in chat button are visible.

## S53.07 Skill name and description.

- **Expected:** Each skill shows its name and a description of what it does.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/services/skills-directory.ts:141; apps/web/app/api/skills/route.ts:141
- **Earlier check in the running app:** PASS: E019 [PASS; interaction]: Browse opens the built-in Installed catalog; searching research-and-citations narrows it to one skill with name, publisher and description. | E020 [PASS; interaction]: Skill detail shows its built-in publisher, installed state, SKILL.md content, raw/rendered toggle, enable switch and Try in chat. No skill executed or disabled.
- **Where to find it:** Settings > Customize > Skills > Browse (labels found in the code)
- **Steps:**
  1. Open Settings, then Skills.
  2. Click Browse and look at the catalogue cards.
  3. Check each skill shows its name and a description line.
  4. Click a skill and check the Description label appears on the detail page.

## S53.08 Invocation guidance.

- **Expected:** The product tells users how and when a skill is invoked (slash name, button, or automatic matching).
- **Code:** done. Evidence moved: apps/web/features/directory/services/skills-directory.ts:141; packages/ui/ui/src/directory/SkillDetailView.tsx:248; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1333 (quoted code not found in the file now); apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:225
- **Where to find it:** Chat message box > type / (slash), or Settings > Customize > Skills > [skill name] > Try in chat (labels found in the code)
- **Needs:** a signed-in account with at least one skill
- **Steps:**
  1. In a chat, click the message box and type /.
  2. Look for the skill names in the menu, each with its description.
  3. Open Settings > Skills, click a skill and find the Try in chat button.
  4. Check that the text tells you how to use the skill (slash name, button, or automatic matching).

## S53.09 Instruction editor.

- **Expected:** A user can write and edit a skill's instructions in an editor in the product.
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** Settings > Customize > Skills > Add > Create a skill (editor dialog titled New skill) (labels found in the code)
- **Needs:** an account that can create skills
- **Steps:**
  1. Open Settings, then Skills.
  2. Click Add and choose Create a skill.
  3. In the dialog, find the Instructions field and type or edit text.
  4. Click Create skill (or Save changes when editing) and check the text is kept.

## S53.10 Reference-file bundle.

- **Expected:** A skill can bundle reference files that the model reads when the skill runs.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1982 (quoted code not found in the file now); apps/web/features/plugins/server/directory/installed-skills.ts:322; apps/web/features/plugins/server/directory/skill-companions.ts:99; apps/web/features/plugins/server/directory/skill-companions.ts:200; apps/web/lib/services/user-skill-service.ts:368; apps/web/app/api/skills/[name]/files/route.ts:34
- **Where to find it:** Settings > Customize > Skills > [skill name] > Skill files (labels found in the code)
- **Needs:** a skill with reference files
- **Steps:**
  1. Open Settings, then Skills.
  2. Click a skill that has more than one file.
  3. Look at the Skill files list and click a reference file.
  4. Check the file content appears, with Copy file contents and Download file available.

## S53.11 Script bundle.

- **Expected:** A skill can bundle scripts that run when the skill is used.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2253; apps/web/lib/e2b/skill-staging.ts:80; apps/web/lib/e2b/skill-staging.ts:94; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3759
- **Where to find it:** no screen of its own. No control runs scripts directly; execution happens inside the chat tool loop and is inferred from the chat output.
- **Needs:** a skill with a script file and code execution allowed
- **Steps:**
  1. Open Settings, then Skills, click a skill whose Skill files list includes script files.
  2. Start a chat, select that skill with Try in chat, and send a request that needs the script.
  3. Look in the chat for a code run or tool result that the skill's script produced.

## S53.14 Required tools.

- **Expected:** A skill declares the tools it needs and the product shows or enforces that requirement.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:225; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3016; apps/web/app/api/skills/route.ts:190
- **Where to find it:** Settings > Customize > Skills > [skill name] > Needs tools (labels found in the code)
- **Needs:** a skill that declares required tools
- **Steps:**
  1. Open Settings, then Skills.
  2. Click a skill that declares tools.
  3. Find the Needs tools row on the detail page and read the tool names.
  4. Open the chat slash menu (type /) and check the same skill shows a Needs line with those tools.

## S53.15 Required connections.

- **Expected:** A skill declares the connectors/MCP servers it needs and the product shows or enforces it.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/SkillDetailView.tsx:101; apps/web/features/directory/services/skills-directory.ts:385; apps/web/app/api/skills/route.ts:193; packages/tools/skills/src/tool.ts:188
- **Where to find it:** Settings > Customize > Skills > [skill name] > Needs connectors (labels found in the code)
- **Needs:** a skill that declares connectors, and a connector account
- **Steps:**
  1. Open Settings, then Skills.
  2. Click a skill that needs connectors.
  3. Find the Needs connectors row and read the connector names.
  4. Check each connector shows a connected state, or an option to open it when it is not connected.

## S53.17 Manual invocation.

- **Expected:** A user can explicitly pick a skill for a message and the model then uses that skill.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1360; apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:225; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3925; apps/web/lib/hooks/useChatStream.ts:4643; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1047
- **Earlier check in the running app:** UI_ONLY: E020 [UI_ONLY; visible UI]: Skill detail shows its built-in publisher, installed state, SKILL.md content, raw/rendered toggle, enable switch and Try in chat. No skill executed or disabled.
- **Where to find it:** Chat > Add attachments and tools > Skills > [skill name] (labels found in the code)
- **Needs:** a signed-in account with at least one skill
- **Steps:**
  1. In a chat, click the Add attachments and tools button next to the message box.
  2. Click Skills and choose a skill name from the list.
  3. Check the Skills entry now shows the chosen skill name in place of Skills.
  4. Send a message and check the reply follows that skill.

## S53.18 Automatic relevance-based invocation.

- **Expected:** Without being asked, the product loads a skill whose description matches the user's request.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1360; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5442; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1831 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Matching happens on the server when no skill is selected; the UI shows no indicator of it, so the tester can only judge from the reply.
- **Needs:** a skill with a clear description and an account that has it installed
- **Steps:**
  1. Start a new chat without choosing any skill from Add attachments and tools.
  2. Send a request that matches the description of a skill you have installed.
  3. Look at the reply for the skill's style or steps, without any skill name shown in the message box.

## S53.20 Enable/disable.

- **Expected:** A user can turn an installed skill off and back on without deleting it.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/SkillDetailView.tsx:235; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1407; apps/web/lib/services/skill-install-service.ts:89
- **Earlier check in the running app:** UI_ONLY: E020 [UI_ONLY; visible UI]: Skill detail shows its built-in publisher, installed state, SKILL.md content, raw/rendered toggle, enable switch and Try in chat. No skill executed or disabled.
- **Where to find it:** Settings > Customize > Skills > [skill name] > Enable skill (labels found in the code)
- **Needs:** an installed skill that is not your own (own skills have no switch on the detail page)
- **Steps:**
  1. Open Settings, then Skills, and click an installed skill.
  2. Switch Enable skill off and read the hint text about keeping it in the catalogue.
  3. Check the skill is still listed and its status changes.
  4. Switch Enable skill back on and check the skill is offered again in the chat slash menu.

## S53.21 Upload/import.

- **Expected:** A user can upload or import a skill file/package and use it.
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Earlier check in the running app:** UI_ONLY: E018 [UI_ONLY; visible UI]: Personal skill manager loads with no user skills and Browse/Add controls; no installation or imported executable content used.
- **Where to find it:** Settings > Customize > Skills > Add > Upload a skill (labels found in the code)
- **Needs:** a file to upload (.zip, .skill or SKILL.md)
- **Steps:**
  1. Open Settings, then Skills.
  2. Click Add and choose Upload a skill.
  3. Pick a .zip, .skill or SKILL.md file from your computer.
  4. Check the skill appears in the list and can be opened and used.

## S53.22 Export.

- **Expected:** A user can export/download a skill.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/SkillFileViewer.tsx:186; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1131 (quoted code not found in the file now); apps/web/app/api/skills/[name]/files/[...path]/route.ts:61 (quoted code not found in the file now)
- **Where to find it:** Settings > Customize > Skills > [skill name] > Skill files > [file] > Download file (labels found in the code)
- **Steps:**
  1. Open Settings, then Skills, and click a skill.
  2. Click a file in the Skill files list.
  3. Click Download file.
  4. Check the file saves to your computer with the same content as shown.

## S53.36 Permission and provenance summary.

- **Expected:** A skill shows a summary of the permissions it uses and where it came from.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/SkillDetailView.tsx:64; apps/web/features/directory/services/skills-directory.ts:385
- **Where to find it:** Settings > Customize > Skills > [skill name] > Source and access (labels found in the code)
- **Steps:**
  1. Open Settings, then Skills, and click a skill.
  2. Scroll to the Source and access section.
  3. Read the Source row and the Needs tools and Needs connectors rows, plus Added and Version if shown.
  4. Compare the Source text with where you got the skill (built in, uploaded or your own).
