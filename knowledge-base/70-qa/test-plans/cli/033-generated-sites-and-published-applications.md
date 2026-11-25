---
id: "PLAN-cli-033"
type: "test-plan"
title: "CLI · 33. Generated Sites and published applications"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "33"
---
# CLI · 33. Generated Sites and published applications

7 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S33.01 Generated-site dashboard.

- **Expected:** A dashboard lists the user's generated/published sites with their state and actions.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3877
- **Where to find it:** agi artifacts published (labels found in the code)
- **Needs:** a signed-in AGI account (not Local mode) with at least one published artifact
- **Steps:**
  1. Sign in to an AGI account (not Local mode), then in the terminal type: agi artifacts published
  2. Look at the list: each line shows an artifact id, its audience in brackets, and its link
  3. Compare with Expected: a dashboard of published sites with state and actions. The list shows id, audience and link only, with no state column and no per-site actions; the other actions are separate commands (agi artifacts audience, agi artifacts unpublish)

## S33.07 Preview deployment.

- **Expected:** The site can be deployed to a shareable preview URL.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1399; apps/cli/src/cloud/artifacts.rs:451
- **Where to find it:** agi artifacts publish <id> (labels found in the code)
- **Needs:** a signed-in AGI account (not Local mode) with a publishable artifact
- **Steps:**
  1. Sign in to an AGI account (not Local mode), then type: agi artifacts list
  2. Copy an artifact id from the list
  3. Type: agi artifacts publish <id>
  4. Look at the printed result: it should show a share link you can open in a browser, to compare with Expected (a shareable preview URL)

## S33.10 Public URL.

- **Expected:** The published site is reachable at a public URL.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1399; apps/cli/src/cloud/artifacts.rs:451; apps/cli/src/lib.rs:4013
- **Where to find it:** agi artifacts publish <id>, then agi artifacts published (labels found in the code)
- **Needs:** a signed-in AGI account (not Local mode) with a publishable artifact; a browser without the AGI sign-in for the last step
- **Steps:**
  1. Sign in to an AGI account (not Local mode) and publish an artifact with: agi artifacts publish <id>
  2. Type: agi artifacts published
  3. Find your artifact in the list and copy its link
  4. Open the link in a browser that is not signed in and check the page loads (compare with Expected: reachable at a public URL)

## S33.12 Workspace-only access.

- **Expected:** The owner can restrict a site to members of their workspace.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3888
- **Where to find it:** agi artifacts audience <id> workspace (labels found in the code)
- **Needs:** a signed-in AGI account that belongs to a workspace, with a published artifact; a second account in the same workspace and one outside it to test access
- **Steps:**
  1. Sign in to an AGI account (not Local mode) and find a published artifact id with: agi artifacts published
  2. Type: agi artifacts audience <id> workspace
  3. Read the printed result: the audience should now be workspace
  4. Type: agi artifacts published and confirm the entry shows [workspace] (compare with Expected: restricted to workspace members)

## S33.24 Unpublish.

- **Expected:** The owner can take the site offline (unpublish).
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1423; apps/cli/src/cloud/artifacts.rs:585
- **Where to find it:** agi artifacts unpublish <id> (labels found in the code)
- **Needs:** a signed-in AGI account with a published artifact; a browser for the last step
- **Steps:**
  1. Sign in to an AGI account (not Local mode) and find a published artifact id with: agi artifacts published
  2. Type: agi artifacts unpublish <id>, and answer the confirmation prompt with y (or add --yes)
  3. Read the result: it should say the artifact was unpublished and its share link no longer resolves
  4. Open the old share link in a browser and check it no longer loads (compare with Expected: taken offline)

## S33.26 Download source.

- **Expected:** The owner can download the app's source.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1371; apps/cli/src/lib.rs:3958
- **Where to find it:** agi artifacts show <id> --out <path> (labels found in the code)
- **Needs:** a signed-in AGI account with an artifact that has content; a folder to write into
- **Steps:**
  1. Sign in to an AGI account (not Local mode) and find an artifact id with: agi artifacts list
  2. Type: agi artifacts show <id> --out ~/Desktop/test-download (a directory takes the artifact's name; a path without an extension gains one)
  3. Check the printed result shows the written file path
  4. Open the file and check it holds the app's source content (compare with Expected: download the source)

## S33.30 Deletion of app and associated data.

- **Expected:** Deleting an app removes it and its associated data.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1423; apps/cli/src/cloud/artifacts.rs:585
- **Where to find it:** not found in the code. No delete command exists for artifacts or apps. The only removal is agi artifacts unpublish <id> (apps/cli/src/lib.rs:1423, apps/cli/src/cloud/artifacts.rs:585), which removes the share link and keeps the artifact. Searched apps/cli/src/lib.rs and apps/cli/src/cloud/artifacts.rs for delete and remove terms, plus the artifacts subcommand enum.
- **Needs:** a signed-in AGI account with a published artifact, if the tester wants to check unpublish as the nearest step
