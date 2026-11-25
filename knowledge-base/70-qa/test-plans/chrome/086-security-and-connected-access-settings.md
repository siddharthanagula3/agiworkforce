---
id: "PLAN-chrome-086"
type: "test-plan"
title: "Chrome · 86. Security and connected-access settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "86"
---
# Chrome · 86. Security and connected-access settings

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S86.08 Remote paired devices.

- **Expected:** The user can see devices paired for remote use (phone to desktop, browser to desktop) and unpair them.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7236 (quoted code not found in the file now); apps/extension/src/features/native-bridge/pairing.ts:513
- **Where to find it:** Extension Options page > Desktop app > Unpair (then Unpair again in the question that appears) (labels found in the code)
- **Needs:** The browser must already be paired with the Desktop app (AGI Desktop installed and running).
- **Steps:**
  1. Open the extension's Options page (the page the extension opens with Options; its sections are Permissions, Shortcuts, Options, Account, Help).
  2. Scroll to the section titled Desktop app.
  3. If this browser is paired with Desktop, the Unpair button is visible. Click Unpair.
  4. Read the question that appears: Unpair the desktop app? Browser actions that run through Desktop stop working until you pair again. Click Keep paired to cancel, or Unpair to confirm.
  5. Compare with Expected: the paired device is visible here and Unpair removes the pairing.

## S86.09 Sign out current device.

- **Expected:** The user can sign out of the current device or app.
- **Code:** done. Evidence moved: apps/extension/src/options.ts:1713; apps/extension/src/options.ts:1426 (quoted code not found in the file now)
- **Where to find it:** Extension Options page > Account > Log out (labels found in the code)
- **Needs:** A signed-in AGI account in the Chrome extension. Use a test account, because the tester is signed out afterwards.
- **Steps:**
  1. Sign in to the AGI account in the extension.
  2. Open the extension's Options page and click the Account section.
  3. Find the row with the Log out button and read its hint: Remove your AGI account session and saved autofill profile from this device.
  4. Click Log out. The button shows Logging out… while it runs.
  5. Compare with Expected: the account row changes to a signed-out state and the status message appears if the web session or autofill profile could not be removed.

## S86.17 Browser sites.

- **Expected:** The user can choose which websites AGI may read or act on and remove sites later.
- **Code:** done. Evidence present: apps/extension/src/options.ts:1389; apps/extension/src/features/options/site-allowlist.ts:86
- **Where to find it:** Extension Options page > Permissions > Add or Remove for the current site (under the line Approve a site so the assistant can act on it, and remove it any time.) (labels found in the code)
- **Needs:** A normal website open in Chrome (not a Chrome settings page).
- **Steps:**
  1. Open a normal website in Chrome, then open the extension's Options page.
  2. Click the Permissions section and find the line Approve a site so the assistant can act on it, and remove it any time.
  3. Click Add next to the current site to approve it. The button changes to Remove.
  4. Open the list of approved sites and click Remove on that site to take it away.
  5. Compare with Expected: the site can be chosen and removed later. Also check the Browser control setting in the same section.

## S86.23 Saved approvals.

- **Expected:** The user can review the approvals they chose to remember (always-allow/deny) and remove any of them.
- **Code:** done. Evidence moved: apps/extension/src/features/options/site-permission-policy.ts:380 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched apps/extension for always allow, always deny, remembered, saved approval and approval in apps/extension/src/features/options/site-permission-policy.ts and apps/extension/src/options.ts. No list of remembered always-allow or always-deny approvals was found. The nearest controls are the approved-sites Add/Remove list (apps/extension/src/options.ts) and Blocked sites (apps/extension/src/features/options/blocked-sites-section.ts); S86.17 covers those.

## S86.24 Default permission mode.

- **Expected:** The user can set the default approval posture for agent actions (ask every time, auto-approve safe, autonomous) and it is enforced.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/computerUsePanel.ts:610 (quoted code not found in the file now); apps/extension/src/background.ts:4036 (quoted code not found in the file now)
- **Where to find it:** Extension Options page > Permissions > Browser control (drop-down), or the side panel's mode drop-down (labelled with the composer's autonomy text) (labels found in the code)
- **Needs:** An approved site for the task run. A test site the tester controls is safest.
- **Steps:**
  1. Open the extension's Options page and click the Permissions section.
  2. Find the row titled Browser control and open its drop-down.
  3. Choose Ask first, then Auto, then Full access, and read the hint under the row each time.
  4. Start a browser task on an approved site and check that it asks before each action when Ask first is set, and does not ask for routine steps when Auto or Full access is set.
  5. Compare with Expected: the default setting is Auto and the setting is enforced during a run.

## S86.26 Advanced/hardened account-security mode.

- **Expected:** The user can turn on a hardened mode that tightens account and agent security beyond defaults.
- **Code:** done. Evidence present: apps/web/lib/api-auth.ts:349; apps/web/lib/api-auth.ts:394; apps/web/lib/server/account-security/gate.ts:220; apps/web/lib/server/account-security/service.ts:401; apps/web/lib/server/account-security/service.ts:404
- **Where to find it:** Web app Settings > Security > Advanced Account Security > Turn on Advanced Account Security (labels found in the code)
- **Needs:** A web app account with a passkey or security key, and access to the account email. Not available in the Chrome extension.
- **Steps:**
  1. In the web app (not the Chrome side panel), open Settings and open the Security section.
  2. Find the Advanced Account Security panel and read its text.
  3. Click Turn on Advanced Account Security, then enter the code from the email.
  4. Read the confirmation: Advanced Account Security is on, with a link that turns it off for the next 48 hours.
  5. Compare with Expected: sign-in is tightened, and every signed-in session needs a passkey or security key check.
