---
id: "PLAN-desktop-086"
type: "test-plan"
title: "Desktop · 86. Security and connected-access settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "86"
---
# Desktop · 86. Security and connected-access settings

21 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S86.01 Authentication methods.

- **Expected:** The user can see every way they can sign in (password, passkeys, social/SSO identities) and add or remove methods.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/SecuritySection.tsx:126 (quoted code not found in the file now); apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:216 (quoted code not found in the file now); apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:584; apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:283 (quoted code not found in the file now); apps/web/lib/identity/client.ts:309 (quoted code not found in the file now); apps/web/app/api/settings/identities/route.ts:42
- **Where to find it:** Settings > Security > Sign-in methods (labels found in the code)
- **Needs:** none (linked social accounts need the outside account, e.g. Google)
- **Steps:**
  1. Open Settings and choose Security.
  2. Find the Sign-in methods section.
  3. Check the Password row shows Set or Not set with a Change or Add button.
  4. Check the Passkeys row and the list of linked sign-in accounts, each with a Remove button.
  5. Compare with Expected: every sign-in way is shown and can be added or removed.

## S86.02 Password management.

- **Expected:** The user can change their password (with the current password or a recent re-authentication) and reset a forgotten one.
- **Code:** done. Evidence moved: apps/web/app/api/settings/password/route.ts:56; apps/web/app/api/settings/password/route.ts:66 (quoted code not found in the file now)
- **Needs:** external-service
- **Where to find it:** Settings > Security > Sign-in methods > Password (Change or Add) (labels found in the code)
- **Needs:** an outside email account to receive the reset link
- **Steps:**
  1. Open Settings > Security.
  2. In Sign-in methods, click Change on the Password row (or Add if none is set).
  3. Look for the Current Password, New Password and Confirm Password fields and the Change Password button.
  4. Compare with Expected: a password can be changed with the current password.
  5. Sign out, then on the sign-in page click Forgot password? and compare with Expected: a forgotten password can be reset.

## S86.03 Passkeys.

- **Expected:** The user can add, see, rename and remove passkeys for their account.
- **Code:** done. Evidence moved: apps/web/features/settings/components/Settings/PasskeysPanel.tsx:46 (quoted code not found in the file now); apps/web/features/settings/components/Settings/PasskeysPanel.tsx:475; apps/web/lib/identity/client.ts:178 (quoted code not found in the file now)
- **Needs:** electron-build
- **Where to find it:** Settings > Security > Passkeys (labels found in the code)
- **Needs:** a Desktop app build (per plan); a device that can make a passkey
- **Steps:**
  1. Open Settings > Security.
  2. Find the Passkeys section (the Passkeys row in Sign-in methods lists the count).
  3. Click Add a passkey to add one, then check it appears in the list with its created and last-used dates.
  4. Click Rename on a passkey, change the name, and save.
  5. Click Remove on a passkey and confirm; compare with Expected: each action works.

## S86.04 Multifactor authentication.

- **Expected:** The user can turn on a second factor that is then required when signing in, and turn it off.
- **Code:** done. Evidence moved: apps/web/app/api/settings/2fa/verify/route.ts:26 (quoted code not found in the file now); apps/web/lib/mfa-policy-gate.ts:79
- **Where to find it:** Settings > Security > Authenticator app (labels found in the code)
- **Needs:** an authenticator app on a phone
- **Steps:**
  1. Open Settings > Security and find the Authenticator app section.
  2. Click Enable two-factor and confirm the prompt.
  3. Enter the code from your authenticator app and check that two-factor shows On.
  4. Sign out and sign in again: a code from the authenticator app is asked for.
  5. Return to Authenticator app and click Turn off two-factor to compare with Expected: it can be turned off.

## S86.05 Recovery codes.

- **Expected:** The user can view, download and regenerate recovery codes that let them back into the account if the second factor is lost.
- **Code:** done. Evidence moved: apps/web/app/api/settings/2fa/backup-codes/route.ts:42 (quoted code not found in the file now)
- **Where to find it:** Settings > Security > Authenticator app > Replace backup codes or Generate new backup codes (labels found in the code)
- **Needs:** an authenticator app with two-factor already on
- **Steps:**
  1. Open Settings > Security > Authenticator app.
  2. Click Generate new backup codes (or Replace backup codes if codes exist) and confirm.
  3. Read the new codes shown, tick I have saved these backup codes somewhere safe, and continue.
  4. Compare with Expected: codes are shown once and the old codes stop working.
  5. Check whether the codes can be viewed or downloaded again; this was not confirmed in the code.

## S86.06 Active sessions.

- **Expected:** The user can see their signed-in sessions (device, place, last active) and end any of them.
- **Code:** done. Evidence present: apps/web/features/settings/sections/AccountSection.tsx:321; apps/web/features/settings/sections/AccountSection.tsx:342
- **Where to find it:** Settings > Security > Active sessions (opens Settings > Account session list) (labels found in the code)
- **Needs:** a second signed-in device or browser to end a session
- **Steps:**
  1. Open Settings > Security and click the Active sessions row.
  2. On the Account page, read each session row: device, place and last active.
  3. Click Revoke on a session other than the current one and confirm Revoke session.
  4. Compare with Expected: the chosen session is ended and removed from the list.

## S86.07 Trusted devices.

- **Expected:** The user can see the devices trusted on the account (e.g. that skip extra checks or are linked) and remove trust.
- **Code:** done. Evidence moved: apps/web/features/settings/components/LinkedDevicesPanel.tsx:170; apps/web/features/settings/components/LinkedDevicesPanel.tsx:196; apps/web/features/settings/sections/AccountSection.tsx:335; apps/web/features/settings/sections/SecuritySection.tsx:180 (quoted code not found in the file now)
- **Where to find it:** Settings > Account > Linked devices (labels found in the code)
- **Needs:** a linked device such as the desktop app or the Chrome extension
- **Steps:**
  1. Open Settings > Account and scroll to Linked devices.
  2. Read the list of linked devices (CLI, VS Code, Chrome extension, desktop app).
  3. Click Unlink on one device, then Unlink device in the prompt.
  4. Compare with Expected: the device is removed and its access is revoked when it next connects.

## S86.08 Remote paired devices.

- **Expected:** The user can see devices paired for remote use (phone to desktop, browser to desktop) and unpair them.
- **Code:** done. Evidence moved: apps/web/features/desktop-host/components/BrowserPairingSection.tsx:92; apps/desktop/electron/runtime/dispatcher.ts:3131; apps/web/features/desktop-host/components/RemoteControlSection.tsx:50 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2659
- **Where to find it:** Settings > Capabilities > Remote Control (Pair a phone) and Settings > Capabilities > Chrome (Unpair) (labels found in the code)
- **Needs:** the Desktop app; a paid plan for Remote Control; the Chrome extension for browser pairing
- **Steps:**
  1. Open Settings > Capabilities and find the Remote Control section.
  2. Click Pair a phone to see the pairing code, then cancel or close it.
  3. Find the Chrome section and read whether the browser is paired.
  4. Click Unpair, then Unpair in the prompt.
  5. Compare with Expected: the paired device is listed and can be unpaired.

## S86.09 Sign out current device.

- **Expected:** The user can sign out of the current device or app.
- **Code:** done. Evidence present: apps/web/features/settings/sections/AccountSection.tsx:321; apps/web/features/settings/sections/AccountSection.tsx:342
- **Where to find it:** Settings > Account > Active sessions row marked current > Log out (labels found in the code)
- **Steps:**
  1. Open Settings > Security and click Active sessions to reach the Account session list.
  2. Find the row marked as this device (current session).
  3. Click Log out on that row and confirm Log out this session?.
  4. Compare with Expected: this device or app is signed out.

## S86.10 Sign out all devices.

- **Expected:** One action signs the account out everywhere: every browser, app and device credential.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/AccountSection.tsx:380 (quoted code not found in the file now); apps/web/features/settings/sections/AccountSection.tsx:270 (quoted code not found in the file now); apps/web/app/api/settings/sessions/route.ts:209
- **Where to find it:** Settings > Security > Log out of all devices (labels found in the code)
- **Needs:** a second signed-in device or browser to confirm it ends
- **Steps:**
  1. Open Settings > Security.
  2. Find the row Log out of all devices and click its Log out button.
  3. Read the prompt Log out of all devices? and click Log out everywhere.
  4. Compare with Expected: every browser and app is signed out, including this one.
  5. On another device, check that its session has ended.

## S86.11 Security notifications.

- **Expected:** The user is told about security-relevant events (new sign-in, password or 2FA change, new device) and can control how.
- **Code:** done. Evidence present: apps/web/lib/server/session-sightings.ts:42; apps/web/lib/services/account-activity-notifications.ts:48; apps/web/features/settings/sections/NotificationsSection.tsx:67; apps/web/lib/services/notification-email-service.ts:141
- **Where to find it:** Settings > Notifications > Security alerts (labels found in the code)
- **Needs:** an email address on the account
- **Steps:**
  1. Open Settings > Notifications.
  2. Find the Security alerts group (sign-in, password, email, two-factor and device changes).
  3. Change a control for Security alerts and close the panel.
  4. Reopen it and check the choice was kept.
  5. Trigger a security event (e.g. a password change) and compare with Expected: a notice arrives by the chosen channel.

## S86.12 Connected accounts.

- **Expected:** The user can see third-party accounts connected to AGI (connectors) and disconnect them.
- **Code:** done. Evidence present: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1264; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:998
- **Where to find it:** Settings > Connectors (labels found in the code)
- **Needs:** a connector already connected (e.g. GitHub or Slack)
- **Steps:**
  1. Open Settings > Connectors.
  2. Read the list of connected accounts.
  3. Open a connected account and find its disconnect action.
  4. Click it and confirm; compare with Expected: the account is disconnected and no longer listed.

## S86.13 Granted connector scopes.

- **Expected:** For each connected account the user can see which permissions (scopes) were actually granted.
- **Code:** done. Evidence present: apps/web/app/api/connectors/route.ts:285; apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:891
- **Where to find it:** Settings > Connectors > (a connected account) > Permissions granted (labels found in the code)
- **Needs:** a connected account
- **Steps:**
  1. Open Settings > Connectors.
  2. Open a connected account.
  3. Find the Permissions granted list.
  4. Compare with Expected: the granted permissions for that account are shown.

## S86.14 API keys.

- **Expected:** The user can create, see (masked) and revoke their API keys.
- **Code:** done. Evidence present: apps/web/features/settings/sections/AccountSection.tsx:458; apps/web/features/settings/components/Settings/ApiKeys.tsx:550; apps/web/app/api/settings/api-keys/[keyId]/route.ts:69
- **Where to find it:** Settings > Account > API keys (labels found in the code)
- **Needs:** none (a plan that allows API keys may be required)
- **Steps:**
  1. Open Settings > Account and click API keys.
  2. Click Generate New API Key, type a name, and submit.
  3. Copy the key shown once and close it.
  4. Check the list shows the key masked with a Created date.
  5. Find a Revoke action on a key and compare with Expected: keys can be revoked.

## S86.16 Local folders.

- **Expected:** The user can choose which local folders AGI may read or write, see the list, and remove access.
- **Code:** done. Evidence present: apps/web/features/settings/sections/CapabilitiesSection.tsx:213; apps/web/features/desktop-host/components/LocalAccessSection.tsx:379; apps/desktop/electron/runtime/dispatcher.ts:2316
- **Where to find it:** Settings > Capabilities > Local access > Folders (labels found in the code)
- **Needs:** the Desktop app; at least one folder added
- **Steps:**
  1. Open Settings > Capabilities and find the Local access section.
  2. Read the Folders list.
  3. Click Remove access next to a folder and confirm.
  4. Compare with Expected: the folder is removed and AGI can no longer read or write in it.

## S86.18 Computer applications.

- **Expected:** The user can choose which desktop applications AGI may control and revoke that.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/applicationControl.ts:148; apps/desktop/electron/runtime/applicationControl.ts:115; apps/desktop/electron/runtime/computerUseSteps.ts:125; apps/desktop/electron/runtime/computerUseService.ts:434; apps/desktop/electron/native/macos/agi-input.swift:250; apps/desktop/electron/runtime/permissionManager.ts:290; apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:148
- **Where to find it:** Settings > Computer use > Allowed apps (labels found in the code)
- **Needs:** the Desktop app (Electron); macOS accessibility permission for control
- **Steps:**
  1. Open Settings > Computer use.
  2. Read the Allowed apps list.
  3. Click Add app under Refused apps to refuse an app, then check it appears.
  4. Click Stop if an action is running and compare with Expected: AGI stops controlling the app.

## S86.19 Clipboard access.

- **Expected:** The user controls whether AGI may read the clipboard, and can review or withdraw that permission.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:449; apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:148; apps/desktop/electron/runtime/dispatcher.ts:2324; apps/desktop/electron/runtime/computerUseSteps.ts:67
- **Where to find it:** Settings > Capabilities > Local access > Permissions > Read the clipboard (labels found in the code)
- **Needs:** the Desktop app
- **Steps:**
  1. Open Settings > Capabilities and find Local access.
  2. Find the Permissions list and locate Read the clipboard.
  3. Change the choice or remove it, then compare with Expected: AGI's clipboard access follows that choice.

## S86.22 Screen-sharing preferences.

- **Expected:** The user can set preferences for screen capture/sharing (whether and how AGI may see the screen).
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:102; apps/desktop/electron/screenshot.ts:41
- **Where to find it:** Settings > General > Screenshot to chat shortcut (labels found in the code)
- **Needs:** the Desktop app; macOS screen recording permission
- **Steps:**
  1. Open Settings > General (desktop section).
  2. Find the Screenshot to chat shortcut and Window to chat shortcut rows.
  3. Change or clear a shortcut.
  4. Press the shortcut and compare with Expected: only the chosen capture happens.

## S86.23 Saved approvals.

- **Expected:** The user can review the approvals they chose to remember (always-allow/deny) and remove any of them.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:449; apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:148; apps/desktop/electron/runtime/dispatcher.ts:2324
- **Where to find it:** Settings > General > Permissions (labels found in the code)
- **Needs:** the Desktop app; a saved approval (answer Always allow once first)
- **Steps:**
  1. Open Settings > General and scroll to Permissions.
  2. Read each saved answer; it shows Always allowed, Allowed once, or Allowed until you quit the app.
  3. Click Remove (or Ask again on a refused one) and confirm.
  4. Compare with Expected: the saved approval is gone and AGI asks again next time.

## S86.24 Default permission mode.

- **Expected:** The user can set the default approval posture for agent actions (ask every time, auto-approve safe, autonomous) and it is enforced.
- **Code:** done. Evidence present: apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:125; apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:76; apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:108
- **Where to find it:** Settings > Capabilities > Tool approvals (labels found in the code)
- **Needs:** none; Skip approvals needs a workspace that allows it
- **Steps:**
  1. Open Settings > Capabilities and find Tool approvals.
  2. Read the radio group Default approval for tool actions: Ask before every action, Run read-only actions without asking, Skip approvals.
  3. Select Run read-only actions without asking, then start an agent action and check it runs without a prompt for read-only steps.
  4. Select Ask before every action and check it asks again.

## S86.26 Advanced/hardened account-security mode.

- **Expected:** The user can turn on a hardened mode that tightens account and agent security beyond defaults.
- **Code:** done. Evidence present: apps/web/lib/support/tickets/recovery.ts:51; apps/web/lib/support/tickets/recovery.ts:122; apps/web/content/support/account-security.md:67; apps/web/lib/server/account-security/undo.ts:28
- **Where to find it:** Settings > Security > Advanced Account Security > Turn on Advanced Account Security (labels found in the code)
- **Needs:** a passkey or security key; an email address
- **Steps:**
  1. Open Settings > Security and find the Advanced Account Security section.
  2. Click Turn on Advanced Account Security.
  3. Confirm with one of your passkeys or security keys when asked.
  4. Check the on state and the notice that a link turns it off within the undo window.
  5. Compare with Expected: the stronger settings apply to the account.
