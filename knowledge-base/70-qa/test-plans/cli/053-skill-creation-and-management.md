---
id: "PLAN-cli-053"
type: "test-plan"
title: "CLI · 53. Skill creation and management"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "53"
---
# CLI · 53. Skill creation and management

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S53.02 Installed Skills.

- **Expected:** A user can see the list of skills installed/active for them.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6199; apps/cli/src/repl/slash_commands.rs:252; apps/cli/src/skills.rs:144
- **Where to find it:** /skills (type it in the chat and press Enter) (labels found in the code)
- **Needs:** none; a skill installed in .agiworkforce/skills/ or ~/.agiworkforce/skills/ helps
- **Steps:**
  1. Start the CLI and open the chat.
  2. Type /skills and press Enter.
  3. Compare the list with Expected: each skill shows its name, a description and a [project] or [global] tag, or a 'No skills found.' message when none are installed.

## S53.03 Personal Skills.

- **Expected:** A user can own personal skills that only they have and that they created or added.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6199; apps/cli/src/skills.rs:169
- **Where to find it:** /skills import <path to SKILL.md or its folder> (type it in the chat), then /skills (labels found in the code)
- **Needs:** a skill folder with SKILL.md on disk
- **Steps:**
  1. Make a folder with a SKILL.md file on your computer, and note its path.
  2. Type /skills import followed by that path, then press Enter.
  3. Read the 'Imported the skill to' message, then type /skills and check the skill is listed with the [global] tag.

## S53.04 Project Skills.

- **Expected:** Skills can be scoped to a project so they load only in that project.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:6199; apps/cli/src/skills.rs:169; apps/cli/src/skills.rs:190 (quoted code not found in the file now)
- **Where to find it:** Start the CLI in a project folder that contains .agiworkforce/skills/<name>/SKILL.md, answer the prompt, then type /skills (labels found in the code)
- **Needs:** a project folder with its own .agiworkforce/skills skill
- **Steps:**
  1. Open a terminal in a project folder that has a .agiworkforce/skills folder with a skill in it.
  2. Start the CLI there. When asked whether to load the project's skills, read the prompt and answer yes.
  3. Type /skills and press Enter.
  4. Check the project skill is listed with the [project] tag. Start the CLI in another folder and check it is not listed.

## S53.07 Skill name and description.

- **Expected:** Each skill shows its name and a description of what it does.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6199; apps/cli/src/repl/slash_commands.rs:252; apps/cli/src/skills.rs:144
- **Where to find it:** /skills (type it in the chat and press Enter) (labels found in the code)
- **Needs:** at least one installed skill
- **Steps:**
  1. Install or add at least one skill with a name and a description.
  2. Type /skills and press Enter.
  3. Check each row shows the skill name, then its description (or '(no description)' if empty).

## S53.08 Invocation guidance.

- **Expected:** The product tells users how and when a skill is invoked (slash name, button, or automatic matching).
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:4384 (quoted code not found in the file now); apps/cli/src/skills.rs:1469
- **Where to find it:** not found in the code. I searched apps/cli for invocation hint text (help, hints, 'Use /', 'type /' near skill) in tui_app.rs, widgets and repl and found no user-visible text that explains how a skill is invoked. The only skill-invocation strings are model-facing (skills.rs 'Skill bodies are lazy-loaded') and the /skills empty-state text, which names folders only. Invocation works by /<skill name> (skills.rs skill_command_prompt).

## S53.10 Reference-file bundle.

- **Expected:** A skill can bundle reference files that the model reads when the skill runs.
- **Code:** done. Evidence present: apps/cli/src/skills.rs:1209
- **Where to find it:** /<skill name> <request> (type the skill's name with a slash in the chat and press Enter) (labels found in the code)
- **Needs:** a skill folder with SKILL.md and references/ on disk, in the <id>/SKILL.md layout
- **Steps:**
  1. Make a skill folder with SKILL.md and a references/ subfolder holding a note file with a made-up fact, for example a code word.
  2. Start the CLI, make sure the skill is listed by /skills.
  3. Type /<skill name> and a request that needs the note, then press Enter.
  4. Check the answer uses the fact from the reference file. The skill result text tells the model where the bundled files are.

## S53.11 Script bundle.

- **Expected:** A skill can bundle scripts that run when the skill is used.
- **Code:** done. Evidence present: apps/cli/src/skills.rs:1209
- **Where to find it:** no screen of its own. No code in apps/cli/src/skills.rs runs scripts. The skill result only names the folder and the model decides whether to run a script through its own tools, so the run is not guaranteed.
- **Needs:** a skill folder with a script, and the tool that runs commands allowed in the session
- **Steps:**
  1. Make a skill folder with SKILL.md and a scripts/ subfolder holding a script that writes a made-up word to a file, and have SKILL.md tell the model to run it.
  2. Invoke the skill with /<skill name> and a request, then watch the chat for a shell command run.
  3. Check the file the script writes exists afterwards.

## S53.14 Required tools.

- **Expected:** A skill declares the tools it needs and the product shows or enforces that requirement.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:6199; apps/cli/src/features/exec/tools/mod.rs:348 (quoted code not found in the file now); apps/cli/src/skills.rs:1392
- **Where to find it:** /<skill name> <request> (type it in the chat and press Enter) (labels found in the code)
- **Needs:** a skill file with a tools: line naming a missing tool
- **Steps:**
  1. Make a skill whose SKILL.md frontmatter lists a tool name the CLI does not have, for example tools: [no-such-tool].
  2. Start the CLI and type /<skill name> with any request, then press Enter.
  3. Check the message says the skill cannot be loaded and names the missing tool, instead of running the skill.

## S53.17 Manual invocation.

- **Expected:** A user can explicitly pick a skill for a message and the model then uses that skill.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:4384 (quoted code not found in the file now); apps/cli/src/skills.rs:1469
- **Where to find it:** / then pick the skill's name, then type a request (in the chat) (labels found in the code)
- **Needs:** at least one installed skill
- **Steps:**
  1. In the chat, type / and look for the skill's name in the list that opens.
  2. Pick the skill and type a request after it, then press Enter.
  3. Check the answer follows the skill's steps; the model is told 'The user invoked the /<name> skill.'

## S53.18 Automatic relevance-based invocation.

- **Expected:** Without being asked, the product loads a skill whose description matches the user's request.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:6199; apps/cli/src/agent/prompt.rs:411 (quoted code not found in the file now); apps/cli/src/skills.rs:1265; apps/cli/src/features/exec/tools/mod.rs:348 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. No code outside tests calls match_skills_scored or extract_skill_mentions, so there is no code-scored automatic match; the model chooses from the catalog in the system prompt. $name and @name mentions are parsed only by tests.
- **Needs:** an installed skill with a clear description
- **Steps:**
  1. Install a skill whose description states a clear use, for example 'Use when the user asks for a haiku'.
  2. Start the CLI and type a request that matches that description, without naming the skill or using a slash.
  3. Check whether the answer follows the skill, or the transcript shows a call to the skill tool.

## S53.20 Enable/disable.

- **Expected:** A user can turn an installed skill off and back on without deleting it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6540; apps/cli/src/skills.rs:654; apps/cli/src/skills.rs:144
- **Where to find it:** /skills-toggle (type it in the full-screen chat, which opens an overlay) (labels found in the code)
- **Needs:** at least one installed skill
- **Steps:**
  1. Type /skills-toggle and press Enter.
  2. Move with the arrow keys to a skill, press Space to turn it off, then press Enter to save.
  3. Type /skills and check the skill is no longer listed; the skill folder is still on disk.
  4. Type /skills-toggle again, press Space on the same skill to turn it on, press Enter, and check /skills lists it again.

## S53.21 Upload/import.

- **Expected:** A user can upload or import a skill file/package and use it.
- **Code:** done. Evidence present: apps/cli/src/skills.rs:1498
- **Where to find it:** /skills import <path to SKILL.md or its folder> (type it in the chat and press Enter) (labels found in the code)
- **Needs:** a skill folder or SKILL.md file on disk
- **Steps:**
  1. Make a skill folder with a SKILL.md file on your computer, and note its path.
  2. Type /skills import and that path, then press Enter.
  3. Read the 'Imported the skill to' message, then type /skills and check the skill is listed.
  4. Invoke it with /<skill name> and a request, and check the answer uses the skill.
