---
id: "PLAN-cli-026"
type: "test-plan"
title: "CLI · 26. Artifact container and panel"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "26"
---
# CLI · 26. Artifact container and panel

10 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S26.02 Artifact title.

- **Expected:** The artifact's title is shown on its card and in the viewer, with a fallback when the artifact has none.
- **Code:** done. Evidence present: apps/cli/src/cloud/artifacts.rs:660; apps/cli/src/lib.rs:3861
- **Where to find it:** agi artifacts list (labels found in the code)
- **Needs:** a signed-in account with artifacts (Managed mode, not Local); one artifact with no title for the fallback check
- **Steps:**
  1. Open a terminal and run: agi artifacts list
  2. Find a row: the title sits between the artifact id and the [type] tag
  3. Check that an artifact with no title shows Untitled artifact
  4. Compare with Expected: the title shows on the row (no card or viewer exists in the CLI); agi artifacts show <id> --json also carries the title

## S26.03 Artifact type.

- **Expected:** The artifact's kind (HTML, React, diagram, document, code, spreadsheet...) is shown on its card and in the viewer.
- **Code:** done. Evidence present: apps/cli/src/cloud/artifacts.rs:660; apps/cli/src/lib.rs:3861
- **Where to find it:** agi artifacts list (labels found in the code)
- **Needs:** a signed-in account with artifacts of more than one kind (Managed mode)
- **Steps:**
  1. Run: agi artifacts list
  2. Look at the [bracketed] tag after each title
  3. Compare the tag with the kind named in Expected (for example html, react, svg, mermaid, markdown, text, code)

## S26.05 Open artifact.

- **Expected:** User can open an artifact from the chat or from an artifact list into a view that shows its content.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:1371; apps/cli/src/lib.rs:1914 (quoted code not found in the file now)
- **Where to find it:** agi artifacts show <id> (labels found in the code)
- **Needs:** a signed-in account with at least one artifact (Managed mode)
- **Steps:**
  1. Run: agi artifacts list and copy one id from the first column
  2. Run: agi artifacts show <that id>
  3. Look: the artifact's content prints in the terminal
  4. Optionally run agi artifacts open <id> to open its page in the browser, then compare with Expected

## S26.07 Reopen artifact.

- **Expected:** After closing, the user can reopen the same artifact later (from the chat, a toggle, or a list), including after a reload.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:1914 (quoted code not found in the file now); apps/cli/src/cloud/artifacts.rs:603
- **Where to find it:** agi artifacts show <id> (labels found in the code)
- **Needs:** a signed-in account with at least one artifact (Managed mode)
- **Steps:**
  1. Run: agi artifacts show <id> and read the output
  2. Note that the command prints and ends, so there is nothing to close
  3. Open a new terminal window (the reload step) and run the same command again
  4. Compare: the same content prints with the same id

## S26.12 Multiple-artifact switching.

- **Expected:** When a conversation has several artifacts, the user can switch between them without leaving the viewer.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:1914 (quoted code not found in the file now); apps/cli/src/cloud/artifacts.rs:660
- **Where to find it:** agi artifacts list, then agi artifacts show <id> (labels found in the code)
- **Needs:** a signed-in account with at least two artifacts in one conversation (Managed mode)
- **Steps:**
  1. Run: agi artifacts list in an account with several artifacts
  2. Run: agi artifacts show <first id> and read the content
  3. Run: agi artifacts show <second id> and read the content
  4. Compare: each command prints its own artifact's content

## S26.16 Read-only mode.

- **Expected:** An artifact can be viewed in a read-only state where its content cannot be changed (e.g. a viewer, an older version, or a shared copy).
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:1914 (quoted code not found in the file now); apps/cli/src/lib.rs:1371
- **Where to find it:** no screen of its own. The code has no read-only state or label; read-only is only true because no artifact subcommand edits content.
- **Needs:** a signed-in account with at least one artifact (Managed mode)
- **Steps:**
  1. Run: agi artifacts --help and read the subcommand list: list, show, open, publish, published, audience, unpublish
  2. Run: agi artifacts show <id> and confirm it only prints the content
  3. Compare with Expected: no edit command or read-only label exists in the code for artifacts

## S26.30 Copy content.

- **Expected:** A copy control puts the artifact's own content on the clipboard and confirms it.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3928
- **Where to find it:** agi artifacts show <id> --copy (labels found in the code)
- **Needs:** a Mac terminal with clipboard access, a signed-in account with an artifact (Managed mode)
- **Steps:**
  1. Run: agi artifacts list and copy an id
  2. Run: agi artifacts show <id> --copy
  3. Look for the line Copied '<title>' to the clipboard.
  4. Paste into a text editor and compare with the output of agi artifacts show <id>

## S26.31 Share controls.

- **Expected:** The user can publish an artifact to a link, copy/share the link, choose who can open it, and take it down.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1399; apps/cli/src/lib.rs:4020; apps/cli/src/cloud/artifacts.rs:451
- **Where to find it:** agi artifacts publish <id>, then agi artifacts audience <id> workspace, then agi artifacts unpublish <id> (labels found in the code)
- **Needs:** a signed-in account with an artifact (Managed mode); a workspace that can share artifacts for the workspace step
- **Steps:**
  1. Run: agi artifacts publish <id> and read the line Published '<title>' at <share URL> (opens for anyone with the link).
  2. Run: agi artifacts audience <id> workspace and read the reply: can now be opened by workspace
  3. Run: agi artifacts unpublish <id>, answer the prompt, and read: Unpublished artifact <id>. Its share link no longer resolves.
  4. Run: agi artifacts published to check the state, then compare with Expected

## S26.32 Public/private state.

- **Expected:** Wherever an artifact is shown, the user can see whether it is private, published to anyone, or shared with the workspace.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3877; apps/cli/src/cloud/artifacts.rs:664
- **Where to find it:** agi artifacts list (labels found in the code)
- **Needs:** a signed-in account with one published and one unpublished artifact (Managed mode)
- **Steps:**
  1. Run: agi artifacts list
  2. Look at each row: a published artifact ends with published: anyone with the link or published: workspace
  3. Check that an unpublished row shows no published state
  4. Run: agi artifacts published and compare the audience of each page with Expected

## S26.38 Open originating session.

- **Expected:** From an artifact seen outside its chat (gallery, list, library), the user can jump to the conversation that produced it.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3975
- **Where to find it:** agi artifacts open <id> --chat (labels found in the code)
- **Needs:** a signed-in account with an artifact, and a browser on the Mac (Managed mode)
- **Steps:**
  1. Run: agi artifacts list and copy the id of an artifact (each row also shows its conversation id)
  2. Run: agi artifacts open <id> --chat
  3. Look for Opened https://... in the terminal and check the browser shows that conversation
  4. Compare with Expected
