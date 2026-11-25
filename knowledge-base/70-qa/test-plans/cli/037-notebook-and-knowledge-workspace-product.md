---
id: "PLAN-cli-037"
type: "test-plan"
title: "CLI · 37. Notebook and knowledge-workspace product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "37"
---
# CLI · 37. Notebook and knowledge-workspace product

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S37.01 Notebook index.

- **Expected:** The user sees a list of their notebooks (knowledge workspaces) and can open one.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3673; apps/cli/src/cloud/mod.rs:442
- **Where to find it:** agi projects list (then agi projects show <project>) (labels found in the code)
- **Needs:** a signed-in AGI account (a Free account is fine if it has at least one project; create one with S37.02 first otherwise)
- **Steps:**
  1. Sign in to the AGI account with agi login.
  2. Type agi projects list in a terminal and press Enter.
  3. Copy one project name from the list, then type agi projects show <that name>.
  4. Compare with Expected: a list of the account's projects appears, and show opens one with its description, instructions, knowledge files and conversation count. If the account has none, the line No projects in your AGI account. appears.

## S37.02 Notebook creation.

- **Expected:** The user can create a new notebook that is saved to the account.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3787; apps/cli/src/cloud/mod.rs:442
- **Where to find it:** agi projects create <name> (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Sign in to the AGI account with agi login.
  2. Type agi projects create "QA Notebook 37" and press Enter.
  3. Read the line that starts with Created ' and gives the id in brackets.
  4. Type agi projects list and check that QA Notebook 37 is in the list. Compare with Expected: the project is saved to the account.

## S37.03 Notebook title and description.

- **Expected:** A notebook has a title and description the user can set and later edit.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3750; apps/cli/src/cloud/mod.rs:548
- **Where to find it:** agi projects edit <project> --name <new name> --description <text> (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Create a test project with agi projects create "QA Title 37" --description "first description".
  2. Type agi projects edit "QA Title 37" --name "QA Renamed 37" --description "second description".
  3. Look for the line Updated project followed by the project reference.
  4. Type agi projects show "QA Renamed 37" and check that the name and description show the new values. Compare with Expected: the title and description were set and then changed.

## S37.15 Notebook instructions.

- **Expected:** The notebook has instructions that apply to every chat in it.
- **Code:** done. Evidence present: apps/cli/src/cloud/mod.rs:963; apps/cli/src/agent/mod.rs:240
- **Where to find it:** agi projects edit <project> --instructions <text>, then agi projects link <project> in a folder, then agi (labels found in the code)
- **Needs:** a signed-in AGI account; the chat only uses instructions on a signed-in (Managed) turn, not in Local mode
- **Steps:**
  1. Type agi projects edit "QA Notebook 37" --instructions "Answer in one short sentence.".
  2. Type agi projects show "QA Notebook 37" and check that the instructions show the new text.
  3. In a folder, type agi projects link "QA Notebook 37" and check the line that says the folder is linked to the project.
  4. Type agi in that folder and send a question. Compare with Expected: the reply follows the instructions in every chat from this folder.

## S37.37 Notebook-to-main-chat context handoff.

- **Expected:** From the main chat the user can bring a notebook's context into the conversation.
- **Code:** done. Evidence moved: apps/cli/src/agent/chat.rs:875; apps/cli/src/agent/chat.rs:992 (quoted code not found in the file now); apps/cli/src/cloud/mod.rs:195; apps/cli/src/models/streaming.rs:521; crates/agiworkforce-llm/src/stream.rs:808; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3797
- **Where to find it:** agi projects link <project> in a folder, then agi (labels found in the code)
- **Needs:** a signed-in AGI account and a small text file to add as knowledge
- **Steps:**
  1. In a folder, type agi projects link "QA Notebook 37" and press Enter.
  2. Check the line that says the folder is linked to the account project.
  3. Add a knowledge file with agi projects add-file "QA Notebook 37" <a text file>.
  4. Type agi in that folder and ask a question whose answer is only in that file. Compare with Expected: the reply uses the file. If the project knowledge could not be filed, the line This turn runs without your project's knowledge files appears.

## S37.38 Cross-application notebook synchronization.

- **Expected:** A notebook and its sources and notes are available in every app the user signs into.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3687; apps/cli/src/lib.rs:2876
- **Where to find it:** no screen of its own. The CLI has no notebook sync: the 'Sync' command (apps/cli/src/lib.rs, 'Sync dotfiles and settings across devices.') covers only dotfiles and settings. Account projects are refreshed from the account on each list. Cross-app sync to other apps (web, desktop, mobile) is outside apps/cli and was not checked.
- **Needs:** a second device or terminal signed in to the same AGI account
- **Steps:**
  1. On a first machine, sign in with agi login and create a project with agi projects create "QA Sync 37".
  2. On a second machine, sign in to the same account with agi login.
  3. On the second machine, type agi projects list.
  4. Compare with Expected: the project created on the first machine appears in the list. Notebook sources and notes are not separately listed in the CLI.
