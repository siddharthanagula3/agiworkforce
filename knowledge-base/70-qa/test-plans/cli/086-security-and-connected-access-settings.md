---
id: "PLAN-cli-086"
type: "test-plan"
title: "CLI · 86. Security and connected-access settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "86"
---
# CLI · 86. Security and connected-access settings

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S86.09 Sign out current device.

- **Expected:** The user can sign out of the current device or app.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:3943 (quoted code not found in the file now); apps/cli/src/lib.rs:3943 (quoted code not found in the file now)
- **Where to find it:** agi logout (in Terminal), or /logout inside an agi session (labels found in the code)
- **Needs:** a signed-in AGI account in the CLI
- **Steps:**
  1. Sign in with agi login so there is an account on this machine.
  2. In Terminal, run agi logout.
  3. Read the message printed after the command.
  4. Compare with Expected: the account should be signed out of this machine. The message should also say that saved provider API keys stay.

## S86.14 API keys.

- **Expected:** The user can create, see (masked) and revoke their API keys.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:7687; apps/cli/src/cloud/api_keys.rs:35; apps/cli/src/cloud/api_keys.rs:73
- **Where to find it:** agi keys (list), agi keys revoke <key id or name> (revoke), agi keys create (opens account settings in the browser) (labels found in the code)
- **Needs:** a signed-in AGI account; a key to revoke (create one in account settings first)
- **Steps:**
  1. In Terminal, run agi keys to see the keys with their masked prefix (ending in an ellipsis).
  2. If there are no keys, look for the message No API keys on this account.
  3. To revoke, run agi keys revoke <key id or name>, then answer the prompt. Or add -y to skip it.
  4. Run agi keys again and compare: the key should be gone. Expected also asks that a key can be created, so run agi keys create and check that the account settings page opens.

## S86.16 Local folders.

- **Expected:** The user can choose which local folders AGI may read or write, see the list, and remove access.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5891
- **Where to find it:** /trust status, /trust grant and /trust revoke inside an agi session, run from the folder in question (labels found in the code)
- **Needs:** a folder you can cd into; the test is per folder
- **Steps:**
  1. Open Terminal, cd into the folder you want to test, and run agi.
  2. At the prompt type /trust status and read the result.
  3. Type /trust grant to allow AGI to act in this folder, then /trust status again.
  4. Type /trust revoke and compare with Expected: access for this folder should be removed and the status should show it.

## S86.23 Saved approvals.

- **Expected:** The user can review the approvals they chose to remember (always-allow/deny) and remove any of them.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1890; apps/cli/src/lib.rs:5406
- **Where to find it:** agi approvals list (in Terminal), agi approvals remove <allow|ask|deny|session> <rule>, or /permissions inside an agi session (labels found in the code)
- **Steps:**
  1. Run agi approvals allow "git status" to save a rule to test with.
  2. Run agi approvals list and find the saved rule under the Allow tab.
  3. Run agi approvals remove allow "git status".
  4. Run agi approvals list again and compare with Expected: the rule should be gone.

## S86.24 Default permission mode.

- **Expected:** The user can set the default approval posture for agent actions (ask every time, auto-approve safe, autonomous) and it is enforced.
- **Code:** done. Evidence present: apps/cli/src/onboarding.rs:971; apps/cli/src/agent/mod.rs:2408
- **Where to find it:** The Default permission mode prompt on first run of agi (after the trust prompt), or Shift+Tab during an agi chat session to cycle modes (labels found in the code)
- **Needs:** a test folder; the first-run prompt appears only when no saved mode exists
- **Steps:**
  1. Remove the saved config or use a new folder so the first-run setup appears, then run agi.
  2. At the prompt titled Default permission mode, read the three choices: Default, Auto and Plan.
  3. Pick Auto, then start a chat and ask it to run a safe command such as ls and a dangerous one such as rm on a test file.
  4. Compare with Expected: safe commands should run without asking while the dangerous one asks. Also press Shift+Tab in chat and check that the mode changes.

## S86.26 Advanced/hardened account-security mode.

- **Expected:** The user can turn on a hardened mode that tightens account and agent security beyond defaults.
- **Code:** done. Evidence present: apps/web/lib/api-auth.ts:349; apps/web/lib/api-auth.ts:394; apps/web/lib/server/account-security/gate.ts:220; apps/web/lib/server/account-security/service.ts:401; apps/web/lib/server/account-security/service.ts:404
- **Where to find it:** Settings > Security > Advanced Account Security (web app, not the CLI) (labels found in the code)
- **Needs:** a web account with access to its email and at least two passkeys or security keys
- **Steps:**
  1. Sign in to the web app and open Settings, then the Security section.
  2. Find the card titled Advanced Account Security and read its description: For accounts at higher risk. Sign-in needs a passkey or security key.
  3. Add at least two passkeys or security keys, then save recovery keys, as the support page describes.
  4. Enter the code emailed to the account address, then click Turn on Advanced Account Security.
  5. Compare with Expected: the card should say On since, and other devices should be signed out.
