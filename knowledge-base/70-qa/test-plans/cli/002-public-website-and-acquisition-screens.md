---
id: "PLAN-cli-002"
type: "test-plan"
title: "CLI · 2. Public website and acquisition screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "2"
---
# CLI · 2. Public website and acquisition screens

2 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S2.28 Changelog and release notes.

- **Expected:** A public changelog lists dated releases.
- **Code:** done. Evidence present: apps/cli/src/update_check.rs:73; apps/cli/src/update_check.rs:197; apps/cli/src/claude_parity.rs:1905
- **Where to find it:** In the chat prompt, type /changelog (or /release-notes) and press Enter (labels found in the code)
- **Steps:**
  1. Start the CLI and wait for the chat prompt to appear.
  2. Type /changelog and press Enter. /release-notes also works.
  3. Look for a block titled Release notes with the line 'You are running ... v<version>'.
  4. If a latest release is known, look for 'What's new in <version>: <summary>' and 'Release notes: <url>'. If not, look for 'Notes for each release: <repository>/releases', which points to the GitHub releases page.
  5. Compare with Expected: a public changelog listing dated releases. The screen itself shows only the latest release summary and a link, with no dated list. The publish date is shown in the update status output, not here.

## S2.35 Contact and support page.

- **Expected:** A contact / support page lets a visitor reach the company.
- **Code:** unverified. Evidence moved: apps/cli/src/tui/tui_app.rs:3531 (quoted code not found in the file now)
- **Needs:** external-service
- **Where to find it:** In the chat prompt, type /feedback followed by a short message (or /bug) and press Enter (labels found in the code)
- **Needs:** a signed-in Managed Cloud account; a Local or BYOK session does not send feedback
- **Steps:**
  1. Sign in to the CLI with a Managed Cloud account. A Local or BYOK session does not send feedback.
  2. In the chat prompt, type /feedback and a short message, for example: /feedback QA contact test, then press Enter.
  3. Read the reply shown in the chat: a confirmation from the team's feedback inbox, or the failure line 'The team's feedback inbox did not confirm it. Try again in a moment.'
  4. Type /feedback alone and press Enter to see the usage text that explains what is sent.
  5. Compare with Expected: a contact or support page that lets a visitor reach the company. The CLI has no contact or support page; the closest is this in-app message to the team.
