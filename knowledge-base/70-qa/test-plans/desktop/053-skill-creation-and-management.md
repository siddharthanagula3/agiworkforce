---
id: "PLAN-desktop-053"
type: "test-plan"
title: "Desktop · 53. Skill creation and management"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "53"
---
# Desktop · 53. Skill creation and management

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S53.01 Skill directory.

- **Expected:** A user can browse a catalogue of available skills, including ones not yet installed, and open any of them.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-nav.ts:376; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/hooks/useDirectoryAdapter.ts:475; apps/web/features/directory/services/skills-directory.ts:269; apps/web/app/api/skills/route.ts:141
- **Where to find it:** Settings > Skills > Browse (labels found in the code)
- **Steps:**
  1. Sign in, open Settings, and click Skills under Customize.
  2. Click Browse at the top right of the Skills list.
  3. Scroll the catalogue and look for skills that are not installed yet.
  4. Click a skill name and check that its detail page opens, with an Install button if it is not installed.
  5. Compare with Expected: you can browse uninstalled skills and open any of them.

## S53.02 Installed Skills.

- **Expected:** A user can see the list of skills installed/active for them.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-nav.ts:376; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/services/skills-directory.ts:216; apps/web/features/directory/hooks/useDirectoryAdapter.ts:475; apps/web/app/api/skills/route.ts:141
- **Where to find it:** Settings > Skills (labels found in the code)
- **Steps:**
  1. Open Settings and click Skills under Customize.
  2. Look at the list: each row shows the skill name, its Author (You, AGI or Managed), Last updated, and a status.
  3. Compare with Expected: the list shows the skills installed or active for this account.

## S53.03 Personal Skills.

- **Expected:** A user can own personal skills that only they have and that they created or added.
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** Settings > Skills > Add > Create a skill (labels found in the code)
- **Needs:** a signed-in account that can create skills
- **Steps:**
  1. Open Settings, click Skills, then click Add.
  2. Click Create a skill.
  3. Type a Name, a Description and Instructions, then click Create skill.
  4. Look in the Skills list for the new skill with Author shown as You.
  5. Compare with Expected: the skill belongs only to this account and appears as personal.

## S53.06 Skill detail page.

- **Expected:** A user can open a skill detail view showing its description, instructions and files.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/SkillDetailView.tsx:210; packages/ui/ui/src/directory/SkillDetailView.tsx:256; apps/web/features/directory/services/skills-directory.ts:369
- **Where to find it:** Settings > Skills > click a skill name (labels found in the code)
- **Steps:**
  1. Open Settings, click Skills.
  2. Click any skill name in the list.
  3. Check that the detail page shows the description, the Source and access section, and a Skill files list.
  4. Click a file in Skill files and check that its contents show below.
  5. Compare with Expected: description, instructions and files are visible.

## S53.07 Skill name and description.

- **Expected:** Each skill shows its name and a description of what it does.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/services/skills-directory.ts:141; apps/web/app/api/skills/route.ts:141
- **Where to find it:** Settings > Skills (labels found in the code)
- **Steps:**
  1. Open Settings, click Skills.
  2. Read the name and any description shown on each row.
  3. Click a skill and check the Description field in the detail page.
  4. Compare with Expected: each skill shows its name and what it does.

## S53.08 Invocation guidance.

- **Expected:** The product tells users how and when a skill is invoked (slash name, button, or automatic matching).
- **Code:** done. Evidence moved: apps/web/features/directory/services/skills-directory.ts:141; packages/ui/ui/src/directory/SkillDetailView.tsx:248; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1333 (quoted code not found in the file now); apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:225
- **Where to find it:** Settings > Skills > open an installed skill > Try in chat; or type / in the chat box (labels found in the code)
- **Needs:** an installed skill
- **Steps:**
  1. Open Settings, click Skills, and open an installed skill.
  2. Click Try in chat; the chat opens with that skill selected.
  3. Or in the chat box, type / and look for the Skills group listing skill names.
  4. Compare with Expected: the product shows how a skill is started (slash name, button or automatic matching).

## S53.09 Instruction editor.

- **Expected:** A user can write and edit a skill's instructions in an editor in the product.
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** Settings > Skills > Add > Create a skill (or open an existing skill and click its edit control) (labels found in the code)
- **Needs:** a personal skill you can edit
- **Steps:**
  1. Open Settings, click Skills, click Add, then Create a skill.
  2. Find the Instructions field and type some text.
  3. Click Create skill and check the new skill appears in the list.
  4. Reopen an editable skill and change Instructions, then click Save changes.
  5. Compare with Expected: the instructions can be written and edited in the product.

## S53.10 Reference-file bundle.

- **Expected:** A skill can bundle reference files that the model reads when the skill runs.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1982 (quoted code not found in the file now); apps/web/features/plugins/server/directory/installed-skills.ts:322; apps/web/features/plugins/server/directory/skill-companions.ts:99; apps/web/features/plugins/server/directory/skill-companions.ts:200; apps/web/lib/services/user-skill-service.ts:368; apps/web/app/api/skills/[name]/files/route.ts:34
- **Where to find it:** Settings > Skills > open a skill > Skill files (labels found in the code)
- **Needs:** a skill with reference files
- **Steps:**
  1. Open Settings, click Skills, and open a skill that has more than one file.
  2. Look at the Skill files list on the left.
  3. Click a non-SKILL.md file and check that its contents appear.
  4. Compare with Expected: the skill's bundled reference files are visible. Whether the model reads them during a run is server-side and not checked here.

## S53.11 Script bundle.

- **Expected:** A skill can bundle scripts that run when the skill is used.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2253; apps/web/lib/e2b/skill-staging.ts:80; apps/web/lib/e2b/skill-staging.ts:94; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3759
- **Where to find it:** no screen of its own. Script execution is in apps/web/lib/e2b/skill-staging.ts and the tool loop; the UI only shows the files.
- **Needs:** a skill with a script bundle
- **Steps:**
  1. Open a skill that bundles a script file in Settings > Skills.
  2. Check that the script file appears in Skill files.
  3. Use the skill in chat and see whether the reply reflects the script's output.

## S53.14 Required tools.

- **Expected:** A skill declares the tools it needs and the product shows or enforces that requirement.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:225; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3016; apps/web/app/api/skills/route.ts:190
- **Where to find it:** Settings > Skills > open a skill > Source and access > Needs tools (labels found in the code)
- **Needs:** a skill that declares required tools
- **Steps:**
  1. Open Settings, click Skills, and open a skill.
  2. Look under Source and access for the Needs tools row.
  3. Compare with Expected: the tools the skill needs are listed as names.

## S53.15 Required connections.

- **Expected:** A skill declares the connectors/MCP servers it needs and the product shows or enforces it.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/SkillDetailView.tsx:101; apps/web/features/directory/services/skills-directory.ts:385; apps/web/app/api/skills/route.ts:193; packages/tools/skills/src/tool.ts:188
- **Where to find it:** Settings > Skills > open a skill > Source and access > Needs connectors (labels found in the code)
- **Needs:** a skill that declares required connectors; an outside account if the connector needs sign-in
- **Steps:**
  1. Open Settings, click Skills, and open a skill that needs a connector.
  2. Look under Source and access at Needs connectors.
  3. Check each connector shows Connected, Not connected, or a Connect button.
  4. Click Connect if shown and check the state changes.
  5. Compare with Expected: the required connections are shown.

## S53.17 Manual invocation.

- **Expected:** A user can explicitly pick a skill for a message and the model then uses that skill.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1360; apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:225; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3925; apps/web/lib/hooks/useChatStream.ts:4643; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1047
- **Where to find it:** Chat box > Add attachments and tools (+) > Skills > pick a skill; or type / in the chat box (labels found in the code)
- **Needs:** an installed skill; a model that supports tools
- **Steps:**
  1. Open a chat and click the + button labelled Add attachments and tools.
  2. Click Skills and pick a skill from the list.
  3. Type a message and send it.
  4. Compare with Expected: the reply follows that skill's instructions.

## S53.18 Automatic relevance-based invocation.

- **Expected:** Without being asked, the product loads a skill whose description matches the user's request.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1360; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5442; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1831 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The offer is applied server-side in apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts (applyImplicitManagedSkillOffer) and skips some surfaces and any request with a tool choice.
- **Needs:** an installed skill; a model that supports tools
- **Steps:**
  1. Install a skill with a clear description, then in a new chat send a message that matches that description without choosing a skill.
  2. Check whether the reply follows that skill's instructions.

## S53.20 Enable/disable.

- **Expected:** A user can turn an installed skill off and back on without deleting it.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/SkillDetailView.tsx:235; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1407; apps/web/lib/services/skill-install-service.ts:89
- **Where to find it:** Settings > Skills > Browse > open an installed skill > Enable skill (labels found in the code)
- **Needs:** an installed catalogue skill
- **Steps:**
  1. Open Settings, click Skills, then click the skill (or Browse for a catalogue skill).
  2. Turn off the Enable skill switch.
  3. Check the skill stays in the list but no longer appears in the / menu in chat.
  4. Turn the switch on again and check it comes back.
  5. Compare with Expected: the skill is turned off and on without being deleted.

## S53.21 Upload/import.

- **Expected:** A user can upload or import a skill file/package and use it.
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** Settings > Skills > Add > Upload a skill; or Settings > Skills > Add > Create a skill > Import a SKILL.md (labels found in the code)
- **Needs:** a file to upload (a .zip with SKILL.md inside, a .skill file, or a SKILL.md)
- **Steps:**
  1. Open Settings, click Skills, click Add, then Upload a skill.
  2. Choose a .zip, .skill or SKILL.md file from your computer and click Upload.
  3. Check the skill appears in the Skills list.
  4. Use it in chat with / and check the reply follows it.
  5. Compare with Expected: the uploaded skill can be used.

## S53.22 Export.

- **Expected:** A user can export/download a skill.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/SkillFileViewer.tsx:186; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1131 (quoted code not found in the file now); apps/web/app/api/skills/[name]/files/[...path]/route.ts:61 (quoted code not found in the file now)
- **Where to find it:** Settings > Skills > open a skill > click a file in Skill files > Download file (labels found in the code)
- **Needs:** a skill with files
- **Steps:**
  1. Open Settings, click Skills, and open a skill.
  2. Click a file in Skill files.
  3. Click Download file.
  4. Check that the file saves to your computer with its contents.
  5. Compare with Expected: the skill's files can be downloaded.

## S53.36 Permission and provenance summary.

- **Expected:** A skill shows a summary of the permissions it uses and where it came from.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/SkillDetailView.tsx:64; apps/web/features/directory/services/skills-directory.ts:385
- **Where to find it:** Settings > Skills > open a skill > Source and access (labels found in the code)
- **Steps:**
  1. Open Settings, click Skills, and open a skill.
  2. Read the Source and access section.
  3. Check the Source, Added, Version, Needs tools, Needs connectors and Access rows.
  4. Compare with Expected: the skill's permissions and where it came from are summarised.
