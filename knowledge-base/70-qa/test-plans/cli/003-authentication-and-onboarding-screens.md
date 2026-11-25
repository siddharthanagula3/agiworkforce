---
id: "PLAN-cli-003"
type: "test-plan"
title: "CLI · 3. Authentication and onboarding screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "3"
---
# CLI · 3. Authentication and onboarding screens

7 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S3.01 Sign-in screen.

- **Expected:** The surface offers a sign-in entry that authenticates the user to their AGI account, in-app or through a browser/device handoff that returns a session to the surface.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:7269; apps/cli/src/oauth.rs:495; apps/cli/src/auth.rs:1046
- **Where to find it:** Run "agi login" in a terminal, or on first run: "Choose how to connect" > "AGI cloud" (labels found in the code)
- **Needs:** an AGI account and a web browser
- **Steps:**
  1. Open a terminal and type agi login, then press Enter.
  2. Read the lines "Connecting to AGI..." and "Open this link in your browser:" and note the one-time code shown.
  3. Open the link in a browser, check the page shows the same code, and approve it.
  4. Back in the terminal, wait for "Waiting for authorization..." to finish.
  5. Compare with Expected: the terminal should finish without an error and the session should be signed in.

## S3.02 Create-account screen.

- **Expected:** A new user can create an account (email or provider) from a sign-up screen on the surface, or is handed to one.
- **Code:** done. Evidence present: apps/web/features/auth/authRoutes.ts:47; apps/web/features/auth/authRoutes.ts:32; apps/web/features/auth/authRoutes.ts:80
- **Where to find it:** not found in the code. The CLI has no sign-up screen; it only opens a browser link during agi login (apps/cli/src/oauth.rs). apps/web/features/auth/AuthEmailStep.tsx has a heading "Log in or sign up", but the browser approval page was not confirmed to reach it. Searched apps/cli/src/onboarding.rs and apps/cli/src/oauth.rs for sign-up wording.
- **Needs:** a web browser and an email address

## S3.25 Memory setup.

- **Expected:** During setup the user is told about memory and chooses whether and how it is used, with the choice changeable later.
- **Code:** done. Evidence present: apps/cli/src/onboarding.rs:982
- **Where to find it:** First-run setup shows a "Memory" paragraph; change later with "agi memory on" or "agi memory off" (check with "agi memory status") (labels found in the code)
- **Needs:** an AGI account
- **Steps:**
  1. Start agi for the first time on a machine where setup has not run, and read the "Memory" paragraph shown after the permission mode choice.
  2. In a terminal, type agi memory status and read the answer.
  3. Type agi memory off, then agi memory status, and check it says memory is off.
  4. Type agi memory on, then agi memory status, and check it is back on.
  5. Compare with Expected: the user is told about memory and can change the choice later.

## S3.29 Desktop permission setup.

- **Expected:** The app walks the user through the local permissions it needs (folders, commands, screen control) with guidance, and records the grants.
- **Code:** done. Evidence moved: apps/cli/src/onboarding.rs:165; apps/cli/src/onboarding.rs:716 (quoted code not found in the file now)
- **Where to find it:** First-run setup: "Trust This Directory" > "Yes, trust this directory", then "Default permission mode" (labels found in the code)
- **Needs:** a first run where setup has not finished, and a folder not yet trusted
- **Steps:**
  1. Start agi for the first time on a folder you have not trusted, where setup has not finished.
  2. At "Trust This Directory", read the warning and choose "Yes, trust this directory" (or the restricted option).
  3. Read the "Before you start:" notes about approval for file edits and shell commands.
  4. At "Default permission mode", pick one of the three modes and read its line.
  5. Compare with Expected: the setup covers folder trust and approval mode only; check whether it walks through commands or screen control.

## S3.32 Optional notification setup.

- **Expected:** The user is offered an optional, declinable way to turn on notifications (primer or setup step), and can change it later.
- **Code:** done. Evidence moved: apps/cli/src/onboarding.rs:979 (quoted code not found in the file now); apps/cli/src/config.rs:1467
- **Where to find it:** First-run setup, last question "Ring the terminal bell when a long turn finishes?"; change later with "/config set bell true" or "/config set bell false" (labels found in the code)
- **Needs:** a way to run a turn, such as a local model or a signed-in account, to hear the bell
- **Steps:**
  1. Start agi for the first time on a machine where setup has not run, and go to the question "Ring the terminal bell when a long turn finishes?".
  2. Answer no (the default) or yes, then continue to "Press Enter to start...".
  3. Start the app and type /config set bell true to turn the bell on later, or /config set bell false to turn it off.
  4. Run a long task and check whether the terminal bell rings only when the setting is on.
  5. Compare with Expected: the choice is optional, can be declined, and can be changed later.

## S3.35 First-conversation introduction.

- **Expected:** New users get an introduction to their first conversation (what to try, how it works) that leads into a first chat.
- **Code:** done. Evidence moved: apps/cli/src/onboarding.rs:57 (quoted code not found in the file now); apps/cli/src/onboarding.rs:720; apps/cli/src/onboarding.rs:795; apps/cli/src/onboarding.rs:912
- **Where to find it:** not found in the code. No introduction to a first conversation was found. The closest screen is the start view in apps/cli/src/tui/tui_app.rs, which shows "Welcome to AGI" and "Choose Local, Your key, or Managed with /model." but not what to try. Searched apps/cli/src/onboarding.rs and apps/cli/src/tui for first conversation, what to try and try wording.
- **Needs:** a first run

## S3.37 Guest experience and guest-to-account conversion.

- **Expected:** Without an account the user can try the product (guest/local use), and later sign up with their guest work carried over or still available.
- **Code:** done. Evidence present: apps/cli/src/onboarding.rs:843; apps/cli/src/lib.rs:7269; apps/cli/src/oauth.rs:495
- **Where to find it:** First run: "Choose how to connect" > "Local model" (no account) (labels found in the code)
- **Needs:** Ollama or LM Studio running with a local model, and no AGI account
- **Steps:**
  1. Start agi for the first time on a machine that is not signed in and where setup has not run.
  2. At "Choose how to connect", pick "Local model" (Run AI locally, no account required).
  3. Follow the local model choice, with Ollama or LM Studio running, until the terminal says "Local model, no account needed."
  4. Send a message in the first chat and check it answers without signing in.
  5. Compare with Expected: the product works without an account, but no step was found that signs up later and carries guest work over.
