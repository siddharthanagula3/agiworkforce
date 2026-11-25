---
id: "PLAN-vscode-053"
type: "test-plan"
title: "VS Code · 53. Skill creation and management"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "53"
---
# VS Code · 53. Skill creation and management

10 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S53.02 Installed Skills.

- **Expected:** A user can see the list of skills installed/active for them.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/surfaces/surfaceMenu.ts:38; apps/extension-vscode/src/core/commandSetup.ts:2309 (quoted code not found in the file now); apps/extension-vscode/src/features/surfaces/index.ts:382 (quoted code not found in the file now); apps/cli/src/app_server/surfaces.rs:107
- **Where to find it:** Settings > Skills > Loaded skills (full list: Settings > Skills > Manage skills, or Command Palette > Code: Show Skills) (labels found in the code)
- **Needs:** at least one installed or created skill
- **Steps:**
  1. Click Settings in the app, then click Skills in the left list.
  2. Read the Loaded skills list: each row shows a skill name and its description.
  3. Or open the Command Palette and type Code: Show Skills to open the full list.
  4. Compare with Expected: the skills installed or made for you should appear in the list.

## S53.03 Personal Skills.

- **Expected:** A user can own personal skills that only they have and that they created or added.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:232; apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:32
- **Where to find it:** Settings > Skills > Manage skills > Create a skill > Personal (labels found in the code)
- **Steps:**
  1. Click Settings, then Skills, then click Manage skills.
  2. Click Create a skill and choose Personal.
  3. Type a lowercase name with hyphens, such as release-notes, and a description, following the prompts.
  4. The new skill file opens for editing. Check it saved under ~/.agiworkforce/skills (or AGIWORKFORCE_HOME if set), and that the list shows its scope as user.
  5. Compare with Expected: the skill is yours and is not tied to one folder.

## S53.04 Project Skills.

- **Expected:** Skills can be scoped to a project so they load only in that project.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:232; apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:32; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:101 (quoted code not found in the file now)
- **Where to find it:** Settings > Skills > Manage skills > Create a skill > This project (labels found in the code)
- **Needs:** a project folder open in VS Code
- **Steps:**
  1. Open a project folder in VS Code.
  2. Click Settings, then Skills, then Manage skills.
  3. Click Create a skill, choose This project, and name the skill.
  4. Check the list: the new skill shows scope project and not allowed yet until you allow it.
  5. Click Allow this folder’s project skills, then open another folder and check the skill does not appear there.
  6. Compare with Expected: the skill loads only in the project it was made for.

## S53.07 Skill name and description.

- **Expected:** Each skill shows its name and a description of what it does.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:2309 (quoted code not found in the file now); apps/extension-vscode/src/features/surfaces/index.ts:382 (quoted code not found in the file now); apps/cli/src/app_server/surfaces.rs:107
- **Where to find it:** Settings > Skills > Loaded skills (also Command Palette > Code: Show Skills) (labels found in the code)
- **Needs:** at least one installed or created skill
- **Steps:**
  1. Click Settings, then Skills.
  2. Look at each row in Loaded skills: the skill name is the title and its description is shown under it.
  3. Open Command Palette, type Code: Show Skills, and check each entry shows the name, description and scope.
  4. Compare with Expected: each skill shows its name and what it does.

## S53.10 Reference-file bundle.

- **Expected:** A skill can bundle reference files that the model reads when the skill runs.
- **Code:** done. Evidence present: apps/cli/src/skills.rs:1203
- **Where to find it:** no screen of its own. Code shows the skill's bundled files are listed under its folder for the model (apps/cli/src/skills.rs:1218); that the model reads them was not confirmed by reading code.
- **Steps:**
  1. Create a skill (Settings > Skills > Manage skills > Create a skill > Personal).
  2. In its folder, next to SKILL.md, add a references folder with a text file that holds a made-up fact.
  3. Make sure the skill is on, then in the chat ask a question that needs that fact and asks for the skill to be used.
  4. Compare with Expected: the answer uses the fact from the reference file.

## S53.11 Script bundle.

- **Expected:** A skill can bundle scripts that run when the skill is used.
- **Code:** done. Evidence present: apps/cli/src/skills.rs:1203
- **Where to find it:** no screen of its own. apps/cli/src/skills.rs hashes the scripts folder and lists it for the model (line 1218), but no code found that runs scripts automatically; that whether they run is unknown.
- **Steps:**
  1. Create a skill and add a scripts folder with a small script that writes a marker file.
  2. In SKILL.md, tell the model to run that script.
  3. Make sure the skill is on, then in the chat ask for the task the skill covers.
  4. Compare with Expected: the script runs and the marker file appears.

## S53.14 Required tools.

- **Expected:** A skill declares the tools it needs and the product shows or enforces that requirement.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:213
- **Where to find it:** Settings > Skills > Manage skills (read the detail line of a skill row) (labels found in the code)
- **Needs:** a skill that lists required tools, such as one you write
- **Steps:**
  1. Click Settings, then Skills, then Manage skills.
  2. Find a skill whose SKILL.md lists a tool it needs, or create one that names a tool.
  3. Read the detail after its description: it shows Needs followed by the tool names.
  4. Compare with Expected: a skill whose tool is missing shows Missing ... so it will not load, and does not load.

## S53.17 Manual invocation.

- **Expected:** A user can explicitly pick a skill for a message and the model then uses that skill.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1649 (quoted code not found in the file now)
- **Where to find it:** Chat start screen > Skills (group) > click the skill name (labels found in the code)
- **Needs:** a skill that is on and allowed in this folder
- **Steps:**
  1. Open the chat and start a new chat so the start screen shows.
  2. Under the Skills heading, click a skill name; the message box fills with Use the <name> skill to.
  3. Type the task after it and send.
  4. Compare with Expected: the reply follows that skill.

## S53.18 Automatic relevance-based invocation.

- **Expected:** Without being asked, the product loads a skill whose description matches the user's request.
- **Code:** done. Evidence moved: apps/cli/src/agent/prompt.rs:411 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The skill catalog is placed in the model prompt (apps/cli/src/agent/prompt.rs and apps/cli/src/skills.rs format_skill_catalog_for_prompt); the choice is made by the model, so the cited quote is gone and it is not a code rule. The description-matching itself was not run.
- **Needs:** a skill that is on and allowed
- **Steps:**
  1. Create a skill with a clear description, such as one about writing release notes.
  2. Make sure it is on and allowed (Settings > Skills > Loaded skills).
  3. In the chat, ask for a task that matches the description without naming the skill.
  4. Compare with Expected: the reply follows the skill's steps.

## S53.20 Enable/disable.

- **Expected:** A user can turn an installed skill off and back on without deleting it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:283
- **Where to find it:** Settings > Skills > Loaded skills (switch on each row), or Settings > Skills > Manage skills > the skill row's Turn off / Turn on button (labels found in the code)
- **Needs:** a skill that is allowed in this folder (the switch is disabled otherwise)
- **Steps:**
  1. Click Settings, then Skills.
  2. In Loaded skills, flip the switch of a skill to off; the status line shows Turning <name> off.
  3. Click Manage skills and check the row now shows the off icon.
  4. Flip it back on, and check the skill is still listed (it was not deleted).
