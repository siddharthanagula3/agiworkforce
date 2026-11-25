---
id: "PLAN-web-086"
type: "test-plan"
title: "Web · 86. Security and connected-access settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "86"
---
# Web · 86. Security and connected-access settings

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S86.01 Authentication methods.

- **Expected:** The user can see every way they can sign in (password, passkeys, social/SSO identities) and add or remove methods.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/SecuritySection.tsx:126 (quoted code not found in the file now); apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:216 (quoted code not found in the file now); apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:584; apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:283 (quoted code not found in the file now); apps/web/lib/identity/client.ts:309 (quoted code not found in the file now); apps/web/app/api/settings/identities/route.ts:42
- **Earlier check in the running app:** UI_ONLY: E013 [UI_ONLY; visible UI]: Passkey, TOTP, password, session-timeout and security-activity UI is present. No credentials, authentication factors or sessions were changed. Trusted-device lists are explicitly unavailable.
- **Where to find it:** Settings > Security, then the sign-in methods list (Email address, Password, Passkeys, Single sign-on, linked accounts) (labels found in the code)
- **Needs:** a signed-in account (removing a method may need re-confirmation)
- **Steps:**
  1. Open Settings, then click Security in the left list.
  2. Find the sign-in methods list: Email address, Password, Passkeys, and any Single sign-on or Linked account rows.
  3. Click Change or Add on the Password row, and use Connect or Disconnect on a linked account row.
  4. Look at whether every sign-in method is listed and whether you can add or remove one, and compare with Expected.

## S86.02 Password management.

- **Expected:** The user can change their password (with the current password or a recent re-authentication) and reset a forgotten one.
- **Code:** done. Evidence moved: apps/web/app/api/settings/password/route.ts:56; apps/web/app/api/settings/password/route.ts:66 (quoted code not found in the file now)
- **Needs:** external-service
- **Earlier check in the running app:** UI_ONLY: E013 [UI_ONLY; visible UI]: Passkey, TOTP, password, session-timeout and security-activity UI is present. No credentials, authentication factors or sessions were changed. Trusted-device lists are explicitly unavailable.
- **Where to find it:** Settings > Security > Change Password (current password, new password, confirm); reset a forgotten one from the sign-in page with Forgot password? (labels found in the code)
- **Needs:** a password account and access to its email for the reset step
- **Steps:**
  1. Open Settings, click Security, and find the Change Password section.
  2. Type the Current Password, then a new password in New Password and Confirm Password.
  3. Click Change Password and read the result line.
  4. To test reset, sign out, go to the sign-in page, type your email, and click Forgot password?. Compare with Expected.

## S86.03 Passkeys.

- **Expected:** The user can add, see, rename and remove passkeys for their account.
- **Code:** done. Evidence moved: apps/web/features/settings/components/Settings/PasskeysPanel.tsx:46 (quoted code not found in the file now); apps/web/features/settings/components/Settings/PasskeysPanel.tsx:475; apps/web/lib/identity/client.ts:178 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E013 [UI_ONLY; visible UI]: Passkey, TOTP, password, session-timeout and security-activity UI is present. No credentials, authentication factors or sessions were changed. Trusted-device lists are explicitly unavailable.
- **Where to find it:** Settings > Security > Passkeys section: Add a passkey, then Rename and Remove passkey on each row (labels found in the code)
- **Needs:** a browser with passkey support and a device that can create one
- **Steps:**
  1. Open Settings, click Security, and find the passkeys list.
  2. Click Add a passkey and follow the browser prompt.
  3. Click Rename on the new passkey, type a new name, and press Enter.
  4. Click Remove passkey on a passkey you added, read the confirmation, and compare the list with Expected.

## S86.04 Multifactor authentication.

- **Expected:** The user can turn on a second factor that is then required when signing in, and turn it off.
- **Code:** done. Evidence moved: apps/web/app/api/settings/2fa/verify/route.ts:26 (quoted code not found in the file now); apps/web/lib/mfa-policy-gate.ts:79
- **Earlier check in the running app:** UI_ONLY: E013 [UI_ONLY; visible UI]: Passkey, TOTP, password, session-timeout and security-activity UI is present. No credentials, authentication factors or sessions were changed. Trusted-device lists are explicitly unavailable.
- **Where to find it:** Settings > Security > Enable two-factor; turn it off with Turn off two-factor (labels found in the code)
- **Needs:** an authenticator app on a phone
- **Steps:**
  1. Open Settings, click Security, and find the two-factor section.
  2. Click Enable two-factor and scan Scan this in your authenticator app with an authenticator app.
  3. Type the current 6-digit code and confirm; read Two-factor authentication is now enabled on your account.
  4. Sign out and sign in again: a code should be asked. Then click Turn off two-factor, confirm, and compare with Expected.

## S86.05 Recovery codes.

- **Expected:** The user can view, download and regenerate recovery codes that let them back into the account if the second factor is lost.
- **Code:** done. Evidence moved: apps/web/app/api/settings/2fa/backup-codes/route.ts:42 (quoted code not found in the file now)
- **Where to find it:** Settings > Security > Save your backup codes (view), Download codes (download), Replace backup codes (regenerate) (labels found in the code)
- **Needs:** two-factor turned on
- **Steps:**
  1. Open Settings, click Security, and turn on two-factor first if it is off.
  2. Look at the Backup codes list under Save your backup codes.
  3. Click Download codes and check the file, or use Print if it is shown.
  4. Click Replace backup codes, confirm, and check that the old codes are described as no longer working. Compare with Expected.

## S86.06 Active sessions.

- **Expected:** The user can see their signed-in sessions (device, place, last active) and end any of them.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:186 (quoted code not found in the file now); apps/web/features/settings/sections/AccountSection.tsx:321; apps/web/features/settings/sections/AccountSection.tsx:342
- **Earlier check in the running app:** PASS: E014 [PASS; read-only interaction]: Account view displays provider sessions and account actions. No sign-out, revocation, key creation or deletion performed.
- **Where to find it:** Settings > Account > Active sessions (columns Device, Location, Created, Last active) (labels found in the code)
- **Needs:** a second browser or device signed in to the same account
- **Steps:**
  1. Open Settings and click Account.
  2. Scroll to the Active sessions heading.
  3. Read the Device, Location, Created and Last active columns for each row.
  4. Sign in from a second browser and check that its row appears. Compare with Expected.

## S86.07 Trusted devices.

- **Expected:** The user can see the devices trusted on the account (e.g. that skip extra checks or are linked) and remove trust.
- **Code:** done. Evidence moved: apps/web/features/settings/components/LinkedDevicesPanel.tsx:170; apps/web/features/settings/components/LinkedDevicesPanel.tsx:196; apps/web/features/settings/sections/AccountSection.tsx:335; apps/web/features/settings/sections/SecuritySection.tsx:180 (quoted code not found in the file now)
- **Earlier check in the running app:** BLOCKED: E013 [BLOCKED; not available in current account contract]: Passkey, TOTP, password, session-timeout and security-activity UI is present. No credentials, authentication factors or sessions were changed. Trusted-device lists are explicitly unavailable.
- **Where to find it:** Settings > Account > Linked devices (remove link with Unlink device); Settings > Security > Device sign-in (toggle) (labels found in the code)
- **Needs:** a linked device (CLI, VS Code, Chrome extension or desktop app)
- **Steps:**
  1. Open Settings, click Account, and find the Linked devices section.
  2. Read each linked device row: its kind, status and Personal sign-in or Workspace sign-in label.
  3. Click Unlink device on a test device, read the confirmation, and confirm.
  4. Open Security and look at the Device sign-in toggle. Compare the list and toggle with Expected.

## S86.08 Remote paired devices.

- **Expected:** The user can see devices paired for remote use (phone to desktop, browser to desktop) and unpair them.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/AccountSection.tsx:629; apps/web/features/settings/components/LinkedDevicesPanel.tsx:385 (quoted code not found in the file now); apps/web/features/settings/components/LinkedDevicesPanel.tsx:175
- **Earlier check in the running app:** UI_ONLY: E014 [UI_ONLY; visible UI]: Account view displays provider sessions and account actions. No sign-out, revocation, key creation or deletion performed.
- **Where to find it:** Settings > Account > Linked devices (rows for Desktop app, VS Code extension, Chrome extension, Mobile app, Remote Control); Unlink device (labels found in the code)
- **Needs:** a phone or desktop app paired to the account
- **Steps:**
  1. Open Settings, click Account, and find Linked devices.
  2. Read the kind label on each row: Desktop app, Mobile app, Chrome extension or Remote Control.
  3. Click Unlink device on a test row, read the message, and confirm.
  4. Compare the list with Expected.

## S86.09 Sign out current device.

- **Expected:** The user can sign out of the current device or app.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:186 (quoted code not found in the file now); apps/web/features/settings/sections/AccountSection.tsx:342
- **Where to find it:** Settings > Account > Active sessions > the row marked as the current session > Log out current session (labels found in the code)
- **Steps:**
  1. Open Settings, click Account, and find Active sessions.
  2. Find the row for this browser and click Log out current session.
  3. Read the dialog Log out this session? and click Log out.
  4. Check that you return to the sign-in page. Compare with Expected.

## S86.10 Sign out all devices.

- **Expected:** One action signs the account out everywhere: every browser, app and device credential.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/AccountSection.tsx:380 (quoted code not found in the file now); apps/web/features/settings/sections/AccountSection.tsx:270 (quoted code not found in the file now); apps/web/app/api/settings/sessions/route.ts:209
- **Earlier check in the running app:** UI_ONLY: E014 [UI_ONLY; visible UI]: Account view displays provider sessions and account actions. No sign-out, revocation, key creation or deletion performed.
- **Where to find it:** Settings > Security > Log out of all devices > Log out (labels found in the code)
- **Needs:** a second browser signed in to the same account
- **Steps:**
  1. Open Settings and click Security.
  2. Scroll to the Log out of all devices row and click Log out.
  3. Read the dialog Log out of all devices? and click Log out everywhere.
  4. Check that you are returned to the sign-in page, then sign in from a second browser to see its session gone. Compare with Expected.

## S86.11 Security notifications.

- **Expected:** The user is told about security-relevant events (new sign-in, password or 2FA change, new device) and can control how.
- **Code:** done. Evidence present: apps/web/lib/server/session-sightings.ts:42; apps/web/lib/services/account-activity-notifications.ts:48; apps/web/features/settings/sections/NotificationsSection.tsx:67; apps/web/lib/services/notification-email-service.ts:141
- **Where to find it:** Settings > Notifications > Security alerts (labels found in the code)
- **Needs:** an email inbox for the test account
- **Steps:**
  1. Open Settings and click Notifications.
  2. Find the Security alerts heading and read its description: sign-in, password, email, two-factor and device changes.
  3. Turn the Security alerts control on or off and check the setting is saved.
  4. Make a sign-in or password change from another device and check for an email. Compare with Expected.

## S86.12 Connected accounts.

- **Expected:** The user can see third-party accounts connected to AGI (connectors) and disconnect them.
- **Code:** done. Evidence present: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1264; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:998
- **Where to find it:** Settings > Connectors, open a connected connector, then Disconnect (labels found in the code)
- **Needs:** a connected connector (for example GitHub)
- **Steps:**
  1. Open Settings and click Connectors.
  2. Open a connector that is connected.
  3. Read its account details and find the Disconnect button.
  4. Click Disconnect, read the confirmation, and compare with Expected.

## S86.13 Granted connector scopes.

- **Expected:** For each connected account the user can see which permissions (scopes) were actually granted.
- **Code:** done. Evidence present: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1236
- **Where to find it:** Settings > Connectors > open a connected connector > Permissions granted (labels found in the code)
- **Needs:** a connected connector
- **Steps:**
  1. Open Settings and click Connectors.
  2. Open a connected connector.
  3. Find the Permissions granted box with the scopes list.
  4. Read each scope sentence and its access badge, and compare with Expected.

## S86.14 API keys.

- **Expected:** The user can create, see (masked) and revoke their API keys.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:186 (quoted code not found in the file now); apps/web/features/settings/sections/AccountSection.tsx:458; apps/web/features/settings/components/Settings/ApiKeys.tsx:550; apps/web/app/api/settings/api-keys/[keyId]/route.ts:69
- **Earlier check in the running app:** UI_ONLY: E014 [UI_ONLY; visible UI]: Account view displays provider sessions and account actions. No sign-out, revocation, key creation or deletion performed.
- **Where to find it:** Settings > Account > API keys > API Keys panel (Generate New API Key; Delete Key) (labels found in the code)
- **Steps:**
  1. Open Settings, click Account, and click the API keys row.
  2. Click Generate New API Key, enter a Key Name, and copy the key once shown.
  3. Read the list: each key row should show its name, scopes and expiry, and the key itself should be masked.
  4. Click Delete Key on the test key, read the warning, and confirm. Compare with Expected.

## S86.23 Saved approvals.

- **Expected:** The user can review the approvals they chose to remember (always-allow/deny) and remove any of them.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ToolPermissionsPanel.tsx:81; apps/web/features/connectors/stores/tool-permissions-store.ts:85; apps/web/app/api/connectors/permissions/route.ts:189
- **Where to find it:** Settings > Connectors > open a connector > Tool Permissions (Always run without asking, Needs approval each time, Never run this tool; Reset all to default) (labels found in the code)
- **Needs:** a connected connector with tools
- **Steps:**
  1. Open Settings and click Connectors.
  2. Open a connected connector and click Tool Permissions.
  3. Look at each tool's current level, and change one to Always run without asking or Never run this tool.
  4. Click Reset all to default and confirm the reset. Compare with Expected.

## S86.24 Default permission mode.

- **Expected:** The user can set the default approval posture for agent actions (ask every time, auto-approve safe, autonomous) and it is enforced.
- **Code:** done. Evidence present: apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:125; apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:76; apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:108
- **Where to find it:** Settings > Capabilities > Default approval for tool actions (labels found in the code)
- **Needs:** a signed-in account (Skip approvals is blocked when the workspace does not allow it)
- **Steps:**
  1. Open Settings and click Capabilities.
  2. Find Default approval for tool actions and pick Ask before every action, Run read-only actions without asking, or Skip approvals.
  3. Read the Saved and Synced to your account status after each change.
  4. Start a chat that runs a tool and check whether it asks. Compare with Expected.

## S86.26 Advanced/hardened account-security mode.

- **Expected:** The user can turn on a hardened mode that tightens account and agent security beyond defaults.
- **Code:** done. Evidence present: apps/web/lib/support/tickets/recovery.ts:51; apps/web/lib/support/tickets/recovery.ts:122; apps/web/content/support/account-security.md:67; apps/web/lib/server/account-security/undo.ts:28
- **Where to find it:** Settings > Security > Advanced Account Security > Turn on Advanced Account Security (labels found in the code)
- **Needs:** a passkey or security key, and access to the account email
- **Steps:**
  1. Open Settings, click Security, and find the Advanced Account Security card.
  2. Read its description: for accounts at higher risk, sign-in needs a passkey or security key.
  3. Click Turn on Advanced Account Security after entering the code from the email, and read the result.
  4. Check that password and email-code sign-in stop working, then click Turn off Advanced Account Security to undo it if the test allows. Compare with Expected.
