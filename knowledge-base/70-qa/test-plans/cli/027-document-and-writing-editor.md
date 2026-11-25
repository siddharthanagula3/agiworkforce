---
id: "PLAN-cli-027"
type: "test-plan"
title: "CLI · 27. Document and writing editor"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "27"
---
# CLI · 27. Document and writing editor

3 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S27.01 Document title.

- **Expected:** A document shows its title in its card and viewer, falling back to a default when it has none.
- **Code:** done. Evidence present: apps/cli/src/cloud/artifacts.rs:660; apps/cli/src/lib.rs:3861
- **Where to find it:** Type "agi artifacts list" in a terminal, or type "/artifacts" in the chat. Each artifact prints as an id, then its title, then its type in brackets; the title shows "Untitled artifact" when it has none. Run "agi artifacts show <id> --json" to see the "title" field. (labels found in the code)
- **Needs:** a CLI sign-in to an AGI account that has artifacts; an artifact with no title is optional
- **Steps:**
  1. Sign in to the AGI CLI so the account has at least one artifact, and optionally publish or create one.
  2. In a terminal, run: agi artifacts list
  3. Check that each artifact line shows its title after its id and type in brackets.
  4. Find an artifact with no title (if one exists) and check that its line shows "Untitled artifact" instead.
  5. Run: agi artifacts show <id> --json and check that the "title" field matches the list, with "Untitled artifact" when there is no title.
  6. Type /artifacts in the chat and compare the same titles with the list output.

## S27.37 Export to Markdown.

- **Expected:** A document can be exported as a Markdown file.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1375; apps/cli/src/lib.rs:3958
- **Where to find it:** Type "agi artifacts show <id> --out <folder or file>" in a terminal. A file path with no extension gains the artifact's extension, and a Markdown artifact gets ".md". For a conversation, type "/export markdown <path>" in the chat. (labels found in the code)
- **Needs:** a CLI sign-in to an AGI account with a markdown artifact
- **Steps:**
  1. Sign in to the AGI CLI and find an artifact of type markdown with: agi artifacts list
  2. Run: agi artifacts show <id> --out notes (replace notes with a folder or file name you want)
  3. Look at the printed path; it should end in .md for a markdown artifact.
  4. Open the written .md file in a text editor and compare its text with the artifact content shown by agi artifacts show <id>.
  5. Optional: in the chat, type /export markdown my-chat.md and open the file the message names, to check the conversation export.

## S27.41 Send-email review step.

- **Expected:** Before an email is sent on the user's behalf, they review the final message (recipients, subject, body) and confirm.
- **Code:** done. Evidence present: apps/cli/src/approval_details.rs:97; apps/cli/src/approval_details.rs:98; apps/cli/src/agent/tools.rs:151
- **Needs:** credential
- **Where to find it:** In the chat, ask the agent to send an email using a connected email tool (an MCP server). The approval prompt "Allow MCP tool '<tool>' from server '<server>'?" appears before the send, and it lists "Who receives it" and "Subject" when those fields are in the call, followed by the full arguments (the body). (labels found in the code)
- **Needs:** a credential for an email MCP server (a connected email account) and a test address you control
- **Steps:**
  1. Connect an email MCP server in the CLI so a send-email tool is available, and sign in with its credential.
  2. In the chat, ask: "Send an email to <a test address you control> with subject 'QA test' and body 'hello'."
  3. When the approval prompt opens, read its title "Allow MCP tool ... from server ...?".
  4. Check that the detail shows "Who receives it" with the recipient, "Subject" with the subject, and the body in the argument text below.
  5. Decline or allow the call with the prompt's keys and check that the email is sent only after you allow it.
