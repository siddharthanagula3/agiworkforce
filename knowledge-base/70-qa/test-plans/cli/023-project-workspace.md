---
id: "PLAN-cli-023"
type: "test-plan"
title: "CLI · 23. Project workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "23"
---
# CLI · 23. Project workspace

13 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S23.01 Project creation.

- **Expected:** A signed-in user can create a named project that is saved to their account and opens as its own workspace.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3787; apps/cli/src/cloud/mod.rs:442
- **Where to find it:** agi projects create <name>, then agi projects list (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. In a terminal, type: agi projects create "QA Test Project" (add --description "Test text" if you want a description).
  2. Look for the line: Created 'QA Test Project' in your account (<id>).
  3. Type: agi projects list.
  4. Look for a row with the id and the name QA Test Project in the list.

## S23.02 Project name and description.

- **Expected:** A project has a name and an optional description that the user can set at creation and edit later.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3750; apps/cli/src/cloud/mod.rs:548
- **Where to find it:** agi projects create <name> --description <text>, then agi projects edit <project> --description <text>, then agi projects show <project> (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Type: agi projects create "QA Described" --description "First description".
  2. Type: agi projects show "QA Described" and look for the line "First description" under the project name.
  3. Type: agi projects edit "QA Described" --description "Changed description".
  4. Type: agi projects show "QA Described" and check that the description now reads "Changed description".

## S23.05 Project overview.

- **Expected:** Opening a project shows an overview: its name, description, counts and its main sections (chats, files, instructions).
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3687; apps/cli/src/cloud/mod.rs:525
- **Where to find it:** agi projects show <project> (labels found in the code)
- **Needs:** a signed-in account and a project
- **Steps:**
  1. Type: agi projects show "QA Described" (use a project id or name from agi projects list).
  2. Look for the id and name on the first line, then the description line indented under it.
  3. Look for "Conversations:" with a number, then "Instructions:" (or "Instructions: none").
  4. Look for "Knowledge files: none" or a "Knowledge files (<n>):" list, and compare with Expected.

## S23.06 Project conversations.

- **Expected:** A project lists its conversations, opens them, and starts new chats that are filed under the project.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2876
- **Where to find it:** agi projects link <project>, then agi in that folder, then agi history --project <project>, then agi resume --cloud <id> (labels found in the code)
- **Needs:** a signed-in account and a folder to link
- **Steps:**
  1. Go to a folder in Terminal and type: agi projects link "QA Described".
  2. Start agi in the same folder, send one message, and exit.
  3. Type: agi history --project "QA Described" and look for the heading "Conversations in QA Described:" with your chat listed.
  4. Type: agi resume --cloud <id> using the id shown in that list, and check the chat opens.

## S23.09 Project instructions.

- **Expected:** Instructions saved on a project are applied to every chat in that project.
- **Code:** done. Evidence present: apps/cli/src/cloud/mod.rs:963; apps/cli/src/agent/mod.rs:240
- **Where to find it:** agi projects link <project>, then agi projects edit <project> --instructions <text>, then agi in that folder (labels found in the code)
- **Needs:** a signed-in account and a folder to link
- **Steps:**
  1. In a folder, type: agi projects link "QA Described".
  2. Type: agi projects edit "QA Described" --instructions "Always answer in one short sentence."
  3. Type: agi projects show "QA Described" and check the Instructions text is shown.
  4. Start agi in that same folder, ask a question, and compare the answer with the instruction.

## S23.11 Project Memory.

- **Expected:** A project keeps its own memories, and the user can choose whether the project also draws on account-wide memory.
- **Code:** done. Evidence present: apps/web/app/api/memory/sync/route.ts:60; apps/cli/src/cloud/memory.rs:199; apps/cli/src/cloud/mod.rs:927; apps/cli/src/agent/mod.rs:234
- **Where to find it:** agi memory add <text> --project (in a linked folder), then agi memory list (labels found in the code)
- **Needs:** a signed-in account and a folder linked to a project
- **Steps:**
  1. In a folder linked to a project (agi projects link), type: agi memory add "Prefer short answers" --project.
  2. Look for the line that says the memory was remembered in this project's memory.
  3. Type: agi memory list and look for the new memory with the tag ", this project".
  4. Type: agi memory add "Use metric units" (no --project), then agi memory list, and check it has no project tag.

## S23.12 Project artifacts.

- **Expected:** A project shows the artifacts produced in its chats, and each opens from there.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1362; apps/cli/src/lib.rs:3866
- **Where to find it:** agi artifacts list --project <project id>, then agi artifacts show <id> or agi artifacts open <id> (labels found in the code)
- **Needs:** a signed-in account and an artifact made in a project chat
- **Steps:**
  1. Type: agi projects list and copy the id of the project.
  2. Type: agi artifacts list --project <project id> and look for artifacts from that project's chats.
  3. Type: agi artifacts show <artifact id> and check the content prints.
  4. Type: agi artifacts open <artifact id> and check it opens the published page or the chat it came from.

## S23.13 Project coding sessions.

- **Expected:** Coding sessions can belong to a project and are listed and reopened from it.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2876
- **Where to find it:** not found in the code. The cited apps/cli/src/lib.rs:2876 lists conversations filed under a project ('Conversations in'), not coding sessions; no separate CLI listing of project coding sessions was found.
- **Needs:** a signed-in account

## S23.17 Default tools and Skills.

- **Expected:** A project can set which tools and Skills are on by default for chats in it.
- **Code:** done. Evidence present: apps/cli/src/skills.rs:105; apps/cli/src/skills.rs:586; apps/cli/src/lib.rs:5518
- **Where to find it:** not found in the code. The CLI project record has no default tools or Skills field (apps/cli/src/cloud/projects.rs); the cited skills.rs code covers user and folder disabled skills, not account project defaults. The web projects tests mention chatDefaults, but the web app is not this CLI.
- **Needs:** a signed-in account

## S23.18 Local-folder association.

- **Expected:** A project can be associated with a local folder so work in that folder uses the project.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1322; apps/cli/src/project_registry.rs:276; apps/cli/src/agent/mod.rs:3063
- **Where to find it:** agi projects link <project>, then agi projects recent (labels found in the code)
- **Needs:** a signed-in account and a folder on this Mac
- **Steps:**
  1. Go to a folder on this Mac in Terminal.
  2. Type: agi projects link "QA Described" and check the line that says the folder is linked to the account project 'QA Described'.
  3. Type: agi projects recent and look for this folder in the list of recent project folders.
  4. Start agi in this folder and check that the project's instructions and knowledge are used (compare with Expected).

## S23.30 Archive and restore.

- **Expected:** A project can be archived out of the active list and restored later with its contents intact.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/route.ts:248 (quoted code not found in the file now)
- **Where to find it:** agi projects archive <project>, then agi projects archive <project> --undo (labels found in the code)
- **Needs:** a signed-in account and a project
- **Steps:**
  1. Type: agi projects archive "QA Described" and look for the line Archived 'QA Described' (<id>) in your account.
  2. Type: agi projects list and look for the tag [archived] on that project.
  3. Type: agi projects show "QA Described" and check its description and conversation count are still there.
  4. Type: agi projects archive "QA Described" --undo, look for the Unarchived line, and check the tag is gone from agi projects list.

## S23.32 Delete.

- **Expected:** A project owner can delete a project after confirming; its files are removed and its chats are kept (unfiled).
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:3600; apps/cli/src/cloud/mod.rs:515; apps/web/app/api/projects/[id]/route.ts:326 (quoted code not found in the file now)
- **Where to find it:** agi projects delete <project> (labels found in the code)
- **Needs:** a signed-in account and a throwaway project
- **Steps:**
  1. Type: agi projects delete "QA Test Project" (use a throwaway project).
  2. At the prompt that starts Delete project 'QA Test Project'?, type n and check the line Left the project in place.
  3. Type the command again and answer y.
  4. Look for Deleted project 'QA Test Project' (<id>) from your account., then type agi projects list and check the project is gone.

## S23.36 Coordinating conversation for parallel work, where offered.

- **Expected:** Where offered, one coordinating conversation can split work into parallel child threads and bring their results back together.
- **Code:** done. Evidence present: apps/cli/src/background.rs:342; apps/cli/src/background.rs:409; apps/cli/src/claude_parity.rs:136
- **Where to find it:** /thread <instruction>, then /threads, then /gather (typed in agi chat) (labels found in the code)
- **Needs:** a signed-in account and a conversation that is being saved
- **Steps:**
  1. Start agi, sign in, and open a conversation that is being saved.
  2. Type: /thread Summarise the last answer in three bullets. Check the message says a thread started on a copy of this conversation.
  3. Type: /threads and check the thread shows a state such as running or finished.
  4. When a thread has finished, type: /gather and check its result is brought back into this conversation.
