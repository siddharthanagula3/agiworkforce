---
id: "PLAN-cli-110"
type: "test-plan"
title: "CLI · 110. Cross-product experiences to include in the product map"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "110"
---
# CLI · 110. Cross-product experiences to include in the product map

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S110.07 Voice → durable work task.

- **Expected:** A request made in voice mode becomes a durable AGI Work task (runs in background, tracked in Tasks) without the user retyping it.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** /voice typed at the agi prompt (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Type /voice and press Enter.
  2. Press SPACE to start recording, say the request, then stop recording as the prompt shows.
  3. Press ENTER to send the transcribed text (or e to edit it first).
  4. Look at the chat: the request should be sent to the agent. Compare with Expected: it should become a background task that shows in Tasks.

## S110.08 Voice → generated document.

- **Expected:** A spoken request in voice mode produces a document (docx/pdf/markdown artifact) the user can open from the voice session.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** not found in the code. The voice send path is the same as typed input (apps/cli/src/voice.rs, session.send). No voice-specific document output or open control was found. Searched apps/cli/src/voice.rs, apps/cli/src/documents.rs and all of apps/cli/src for docx and pdf references; the document result depends on what the agent produces, which this code audit did not confirm.
- **Needs:** a microphone

## S110.14 Completed task → reusable Skill.

- **Expected:** After a task completes, the user saves it as a reusable Skill that then appears in their Skills and can be invoked later.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:319; crates/agiworkforce-command-registry/src/lib.rs:512
- **Where to find it:** /save-skill typed after a task finishes (optionally followed by a name) (labels found in the code)
- **Steps:**
  1. Finish a normal task in agi.
  2. Type /save-skill and press Enter, optionally with a name after it.
  3. Wait for the agent to write the skill file and show it to you.
  4. Check that the file exists at .agiworkforce/skills/<name>/SKILL.md in the project folder, then start a new task that needs it and see whether the skill is used. Compare with Expected.

## S110.15 Completed task → scheduled routine.

- **Expected:** After a task completes, the user turns it into a scheduled routine that later runs the same work successfully on its schedule.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:321; crates/agiworkforce-command-registry/src/lib.rs:519
- **Where to find it:** /save-routine typed after a task finishes (optionally followed by how often it runs) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Finish a normal task in agi.
  2. Type /save-routine and press Enter, adding how often it should run, or leave it blank and answer the agent's question.
  3. Wait for the agent to create the routine with cron_check tool and state the schedule and what each run does.
  4. Wait for the first scheduled run and check that it did the same work and finished successfully. Compare with Expected.

## S110.19 CLI session → desktop continuation.

- **Expected:** A coding session started in the terminal CLI appears in the desktop app's local sessions for that folder and the user resumes and continues it there.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:916; apps/cli/src/app_server/developer_host.rs:7925
- **Where to find it:** not found in the code. CLI sessions are stored with the source value cli in apps/cli/src/app_server/developer_host.rs (source_to_stored). The desktop app's local-sessions list and folder filter are not in apps/cli, and the cited lib.rs line moved. The CLI side starts with agi resume (apps/cli/src/lib.rs, Continue previous session). The desktop screen words were not found in apps/cli.
- **Needs:** a Desktop app and a CLI session in the same folder

## S110.22 Local work → explicit cloud handoff.

- **Expected:** The user explicitly hands a local coding session (history, repo state, pending work) to cloud execution and it continues in a cloud session.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:2774 (quoted code not found in the file now)
- **Where to find it:** agi code handoff typed in the repository folder (labels found in the code)
- **Needs:** a signed-in account, a git repository with a pushed branch, a local session in that folder
- **Steps:**
  1. Push any unpushed commits: the handoff refuses while commits are not pushed.
  2. In the repository folder, type agi code handoff and press Enter, optionally with a local session id.
  3. Read the review shown and answer the prompt to continue, or use -y to skip the prompt.
  4. Open the cloud session link printed at the end and check that the history and pending work came with it. Compare with Expected.

## S110.24 Existing notebook → main assistant context.

- **Expected:** From the main chat, the user brings an existing notebook (project) into the conversation so its instructions and sources ground the answers.
- **Code:** done. Evidence present: apps/cli/src/agent/chat.rs:902; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855
- **Where to find it:** agi projects link <project> typed in the shell, then agi started in the same folder (labels found in the code)
- **Needs:** a signed-in account with an account project
- **Steps:**
  1. Sign in to the account and make sure the privacy mode is Managed (project knowledge is used only in Managed mode).
  2. In the folder, type agi projects link followed by the project name or id.
  3. Start agi in that folder and ask a question that the project's instructions or files should answer.
  4. Compare the answer with the project's instructions and sources. If a notice says the turn runs without your project's knowledge files, the link did not take effect.

## S110.26 Usage exhaustion → alternative eligible path.

- **Expected:** When the user runs out of usage, the product offers an eligible alternative (named eligible model, reset wait, or purchase) that the user can take in one step and continue.
- **Code:** done. Evidence present: apps/cli/src/errors.rs:687
- **Where to find it:** agi, any chat message sent after the usage limit is reached; read the error text (labels found in the code)
- **Needs:** a Free account or a paid account at its usage limit
- **Steps:**
  1. Use the account until its usage limit is reached (a test account at its limit is easiest).
  2. In agi, send any message.
  3. Read the error: it gives a reset time, and if a model is listed it says Your plan also includes that model. It can also show a billing or plans link.
  4. Type /model with the named model, send the message again, and check that the chat continues. Compare with Expected.
