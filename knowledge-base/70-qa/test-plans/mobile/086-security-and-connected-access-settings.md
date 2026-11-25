---
id: "PLAN-mobile-086"
type: "test-plan"
title: "Mobile · 86. Security and connected-access settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "86"
---
# Mobile · 86. Security and connected-access settings

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S86.01 Authentication methods.

- **Expected:** The user can see every way they can sign in (password, passkeys, social/SSO identities) and add or remove methods.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/account-security/index.tsx:602; apps/mobile/src/features/settings/account-security/index.tsx:615
- **Where to find it:** Profile > Security and login > Manage (AGI Cloud section; also Settings > Security and login) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account, cloud mode
- **Steps:**
  1. Sign in with an AGI Cloud account and open the Profile tab.
  2. Tap "Security and login" in the AGI Cloud section.
  3. Read the "Sign-in methods" group: each linked sign-in appears as a row showing "Last used" or "Linked".
  4. Tap "Passkeys and security keys" and look for "Add a passkey or security key".
  5. Tap "Add or remove a sign-in method" to see that it opens the web security page.
  6. Compare with Expected: password, passkeys and social/SSO identities are all visible, and methods can be added or removed.

## S86.02 Password management.

- **Expected:** The user can change their password (with the current password or a recent re-authentication) and reset a forgotten one.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/account-security/index.tsx:409
- **Needs:** external-service
- **Where to find it:** Profile > Security and login > Change password (labels found in the code)
- **Needs:** an AGI Cloud account that has a password and its current password; an outside sign-in service for reset
- **Steps:**
  1. Open Profile, tap "Security and login" in the AGI Cloud section.
  2. Tap "Change password" (it reads "Set a password" if the account has none).
  3. Fill "Current password", "New password" and "Confirm new password", then tap "Change password" in the sheet.
  4. Read the "Password changed" alert and check that other sessions are signed out.
  5. For a forgotten password, go to the sign-in screen and tap "Forgot password or try another way".
  6. Compare with Expected: change works with the current password; reset is started from the sign-in screen.

## S86.04 Multifactor authentication.

- **Expected:** The user can turn on a second factor that is then required when signing in, and turn it off.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/account-security/TwoFactorSection.tsx:136; apps/mobile/src/features/settings/account-security/TwoFactorSection.tsx:200
- **Where to find it:** Profile > Security and login > Two-factor sign-in (labels found in the code)
- **Needs:** an AGI Cloud account and an authenticator app on a phone
- **Steps:**
  1. Open Profile, tap "Security and login", then scroll to "Two-factor sign-in".
  2. Tap "Set up authenticator app" and scan the QR code, or use "Copy setup key".
  3. Type the code from the authenticator app into "Authenticator code" and tap "Turn on".
  4. Check that the "Authenticator app" row now shows on and "Turn off two-factor" appears.
  5. Tap "Turn off two-factor", then "Turn off" in the alert, and check the row goes back to off.
  6. Compare with Expected: turning on makes a code required at sign-in, and it can be turned off.

## S86.05 Recovery codes.

- **Expected:** The user can view, download and regenerate recovery codes that let them back into the account if the second factor is lost.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/account-security/TwoFactorSection.tsx:180
- **Where to find it:** Profile > Security and login > Two-factor sign-in > Backup codes (labels found in the code)
- **Needs:** an AGI Cloud account with two-factor on
- **Steps:**
  1. With two-factor on, open "Security and login" and scroll to "Two-factor sign-in".
  2. Read the "Backup codes" row, which shows "Ready" or "Not set".
  3. Tap "Generate new backup codes" and complete the step-up check if asked.
  4. Tap "Copy codes" or "Save or share" on the codes screen.
  5. Tap "I saved these codes" to finish.
  6. Compare with Expected: codes can be viewed, saved and regenerated.

## S86.06 Active sessions.

- **Expected:** The user can see their signed-in sessions (device, place, last active) and end any of them.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/account-security/index.tsx:740; apps/mobile/src/features/settings/account-security/service.ts:150 (quoted code not found in the file now)
- **Where to find it:** Profile > Security and login > Sessions (labels found in the code)
- **Needs:** an AGI Cloud account with at least one other signed-in session
- **Steps:**
  1. Open Profile, tap "Security and login", then scroll to the "Sessions" section.
  2. Read the device rows under "Devices": each shows the device name and a last-active value.
  3. Tap a row that is not this device.
  4. Read the alert "Sign out this device?" and tap "Sign out".
  5. Compare with Expected: the session is listed with device, place and last active, and can be ended.

## S86.08 Remote paired devices.

- **Expected:** The user can see devices paired for remote use (phone to desktop, browser to desktop) and unpair them.
- **Code:** done. Evidence present: apps/mobile/app/(app)/companion/index.tsx:162; apps/mobile/src/features/companion/components/DesktopInfoCard.tsx:91; apps/mobile/services/manualPairing.ts:165
- **Where to find it:** Settings > AGI Code > Remote control (labels found in the code)
- **Needs:** a desktop app already paired by QR code
- **Steps:**
  1. Open Settings and tap "AGI Code".
  2. Tap "Remote control" (shown only when the companion feature is on).
  3. On the companion screen, read the desktop card with the "Paired" badge and its name.
  4. Tap "Disconnect" and then "Disconnect" in the alert.
  5. Compare with Expected: the desktop is listed as paired and the pairing can be removed.

## S86.09 Sign out current device.

- **Expected:** The user can sign out of the current device or app.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/profile/index.tsx:118 (quoted code not found in the file now); apps/mobile/app/(app)/profile/index.tsx:53
- **Where to find it:** Profile > Log Out (AGI Cloud section) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account, cloud mode
- **Steps:**
  1. Open the Profile tab in cloud mode while signed in.
  2. Scroll to the "AGI Cloud" section and tap "Log Out".
  3. Read the alert "Log out of AGI Cloud on this device?".
  4. Tap "Cancel" once to check it leaves you signed in, then tap "Log Out" again.
  5. Compare with Expected: the app signs out on this device and returns to sign-in.

## S86.10 Sign out all devices.

- **Expected:** One action signs the account out everywhere: every browser, app and device credential.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/account-security/index.tsx:754; apps/mobile/src/features/settings/account-security/index.tsx:344; apps/mobile/src/features/settings/account-security/service.ts:152 (quoted code not found in the file now)
- **Where to find it:** Profile > Security and login > Sessions > Log out of all devices (labels found in the code)
- **Needs:** an AGI Cloud account and a second signed-in device or browser to check
- **Steps:**
  1. Open Profile, tap "Security and login", then scroll to the "Sessions" section.
  2. Tap "Log out of all devices" (shown in cloud mode only).
  3. Read the alert "Log out of all devices?" and tap "Log out everywhere".
  4. Check that the app returns to sign-in.
  5. Compare with Expected: one action signs out every browser, app and device.

## S86.12 Connected accounts.

- **Expected:** The user can see third-party accounts connected to AGI (connectors) and disconnect them.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:684; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:671
- **Where to find it:** Settings > Connectors > tap a connected connector > Disconnect (labels found in the code)
- **Needs:** a connected third-party connector
- **Steps:**
  1. Open Settings and tap "Connectors" (cloud mode).
  2. Tap a connector that shows as connected.
  3. Find the "Connected" row and the "Granted access" section.
  4. Scroll to the bottom and tap "Disconnect", then "Disconnect" in the alert.
  5. Compare with Expected: the connector leaves the list, or a notice says it is disconnected.

## S86.20 Microphone access.

- **Expected:** The user can see and change whether AGI may use the microphone.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/permissions/registry.ts:165; apps/mobile/src/features/settings/permissions/detail.tsx:99
- **Where to find it:** Settings > Capabilities > Camera and files > Permissions > Microphone (labels found in the code)
- **Needs:** none; a phone with the microphone permission in either state
- **Steps:**
  1. Open Settings and tap "Capabilities".
  2. Tap "Camera and files".
  3. Tap "Microphone" in the Permissions list.
  4. Read the status and the level choices shown on the detail screen.
  5. Tap the request button if shown, then compare with Expected: the user sees and can change microphone access.

## S86.21 Camera access.

- **Expected:** The user can see and change whether AGI may use the camera.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/permissions/registry.ts:183; apps/mobile/src/features/settings/permissions/detail.tsx:99
- **Where to find it:** Settings > Capabilities > Camera and files > Permissions > Camera (labels found in the code)
- **Needs:** none; a phone with the camera permission in either state
- **Steps:**
  1. Open Settings and tap "Capabilities".
  2. Tap "Camera and files".
  3. Tap "Camera" in the Permissions list.
  4. Read the status and the level choices on the detail screen.
  5. Tap the request button if shown, then compare with Expected: the user sees and can change camera access.

## S86.23 Saved approvals.

- **Expected:** The user can review the approvals they chose to remember (always-allow/deny) and remove any of them.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:540 (quoted code not found in the file now); apps/mobile/services/connectors.ts:173
- **Where to find it:** Settings > Connectors > tap a connector > Tool permissions (labels found in the code)
- **Needs:** a connected connector that lists tools
- **Steps:**
  1. Open Settings and tap "Connectors".
  2. Tap a connected connector.
  3. Scroll to "Tool permissions".
  4. Set a tool to "Allow" or "Block" and reopen the connector.
  5. Check the choice is kept, and set it back to "Ask" to remove the saved choice.
  6. Compare with Expected: saved always-allow and always-deny choices can be reviewed and removed.

## S86.24 Default permission mode.

- **Expected:** The user can set the default approval posture for agent actions (ask every time, auto-approve safe, autonomous) and it is enforced.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/auto-approve.tsx:74; apps/mobile/src/features/settings/tool-approvals/useToolApprovalPolicySync.ts:76 (quoted code not found in the file now)
- **Where to find it:** Settings > Capabilities > Action approvals (labels found in the code)
- **Needs:** a connected connector to test the approval
- **Steps:**
  1. Open Settings and tap "Capabilities".
  2. Tap "Action approvals".
  3. Read the three choices: "Ask before every action", "Run read-only actions without asking" and "Skip approvals".
  4. Tap one choice and check that it is marked as selected.
  5. Ask chat to run a connector action and compare what AGI asks before doing it with Expected.

## S86.26 Advanced/hardened account-security mode.

- **Expected:** The user can turn on a hardened mode that tightens account and agent security beyond defaults.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/account-security/index.tsx:828; apps/mobile/src/features/settings/account-security/service.ts:208 (quoted code not found in the file now)
- **Where to find it:** Profile > Security and login > Lockdown mode (labels found in the code)
- **Needs:** an AGI Cloud account, cloud mode
- **Steps:**
  1. Open Profile, tap "Security and login".
  2. Scroll to the "Lockdown mode" switch, below "Recent security activity".
  3. Read its description: "Blocks connectors, web access, code execution and Deep Research."
  4. Turn it on, then try a chat that uses web search or running code.
  5. Compare with Expected: stronger limits apply; turn it off again to restore normal use.
