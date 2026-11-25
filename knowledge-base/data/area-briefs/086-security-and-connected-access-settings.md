# Area 86. Security and connected-access settings

26 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S86.01 Authentication methods.
- Should: The user can see every way they can sign in (password, passkeys, social/SSO identities) and add or remove methods.
- Status: web done, desktop done, mobile done, vscode missing, chrome missing
- Code: apps/web/features/settings/sections/SecuritySection.tsx:126; apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:216; apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:241; apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:283; apps/web/lib/identity/client.ts:309; apps/web/app/api/settings/identities/route.ts:42; apps/mobile/src/features/settings/account-security/index.tsx:453; apps/mobile/src/features/settings/account-security/index.tsx:466

## S86.02 Password management.
- Should: The user can change their password (with the current password or a recent re-authentication) and reset a forgotten one.
- Status: web done, desktop done, mobile done
- Code: apps/web/app/api/settings/password/route.ts:55; apps/web/app/api/settings/password/route.ts:66; apps/mobile/src/features/settings/account-security/index.tsx:239

## S86.03 Passkeys.
- Should: The user can add, see, rename and remove passkeys for their account.
- Status: web done, desktop done, mobile missing
- Code: apps/web/features/settings/components/Settings/PasskeysPanel.tsx:46; apps/web/features/settings/components/Settings/PasskeysPanel.tsx:226; apps/web/lib/identity/client.ts:178

## S86.04 Multifactor authentication.
- Should: The user can turn on a second factor that is then required when signing in, and turn it off.
- Status: web done, desktop done, mobile done
- Code: apps/web/app/api/settings/2fa/verify/route.ts:26; apps/web/lib/mfa-policy-gate.ts:70; apps/mobile/src/features/settings/account-security/TwoFactorSection.tsx:102; apps/mobile/src/features/settings/account-security/TwoFactorSection.tsx:146

## S86.05 Recovery codes.
- Should: The user can view, download and regenerate recovery codes that let them back into the account if the second factor is lost.
- Status: web done, desktop done, mobile done
- Code: apps/web/app/api/settings/2fa/backup-codes/route.ts:42; apps/mobile/src/features/settings/account-security/TwoFactorSection.tsx:131

## S86.06 Active sessions.
- Should: The user can see their signed-in sessions (device, place, last active) and end any of them.
- Status: web done, desktop done, mobile done, cli missing, vscode missing
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:186; apps/web/features/settings/sections/AccountSection.tsx:530; apps/web/features/settings/sections/AccountSection.tsx:292; apps/mobile/src/features/settings/account-security/index.tsx:385; apps/mobile/src/features/settings/account-security/service.ts:150

## S86.07 Trusted devices.
- Should: The user can see the devices trusted on the account (e.g. that skip extra checks or are linked) and remove trust.
- Status: web done, desktop done
- Code: apps/web/features/settings/components/LinkedDevicesPanel.tsx:169; apps/web/features/settings/components/LinkedDevicesPanel.tsx:195; apps/web/features/settings/sections/AccountSection.tsx:304; apps/web/features/settings/sections/SecuritySection.tsx:180

## S86.08 Remote paired devices.
- Should: The user can see devices paired for remote use (phone to desktop, browser to desktop) and unpair them.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: apps/web/features/settings/sections/AccountSection.tsx:529; apps/web/features/settings/components/LinkedDevicesPanel.tsx:385; apps/web/features/settings/components/LinkedDevicesPanel.tsx:170; apps/web/features/desktop-host/components/BrowserPairingSection.tsx:86; apps/desktop/electron/runtime/dispatcher.ts:924; apps/web/features/desktop-host/components/RemoteControlSection.tsx:50; apps/desktop/electron/runtime/dispatcher.ts:870; apps/mobile/app/(app)/companion/index.tsx:135

## S86.09 Sign out current device.
- Should: The user can sign out of the current device or app.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:186; apps/web/features/settings/sections/AccountSection.tsx:292; apps/web/features/settings/sections/AccountSection.tsx:530; apps/mobile/app/(app)/profile/index.tsx:118; apps/mobile/app/(app)/profile/index.tsx:49; apps/cli/src/lib.rs:3943; apps/extension-vscode/src/core/commandSetup.ts:1048; apps/extension/src/options.ts:1426

## S86.10 Sign out all devices.
- Should: One action signs the account out everywhere: every browser, app and device credential.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/settings/sections/AccountSection.tsx:380; apps/web/features/settings/sections/AccountSection.tsx:270; apps/web/app/api/settings/sessions/route.ts:183; apps/mobile/src/features/settings/account-security/index.tsx:501; apps/mobile/src/features/settings/account-security/index.tsx:249; apps/mobile/src/features/settings/account-security/service.ts:152

## S86.11 Security notifications.
- Should: The user is told about security-relevant events (new sign-in, password or 2FA change, new device) and can control how.
- Status: web done, desktop done, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/server/session-sightings.ts:40; apps/web/lib/services/account-activity-notifications.ts:48; apps/web/features/settings/sections/NotificationsSection.tsx:46; apps/web/lib/services/notification-email-service.ts:146

## S86.12 Connected accounts.
- Should: The user can see third-party accounts connected to AGI (connectors) and disconnect them.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:845; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:640; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:352

## S86.13 Granted connector scopes.
- Should: For each connected account the user can see which permissions (scopes) were actually granted.
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:985; apps/web/app/api/connectors/route.ts:295; apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:878

## S86.14 API keys.
- Should: The user can create, see (masked) and revoke their API keys.
- Status: web done, desktop done, mobile missing, cli done, chrome missing
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:186; apps/web/features/settings/sections/AccountSection.tsx:410; apps/web/features/settings/components/Settings/ApiKeys.tsx:348; apps/web/app/api/settings/api-keys/[keyId]/route.ts:60; apps/cli/src/lib.rs:4942; apps/cli/src/cloud/api_keys.rs:35; apps/cli/src/cloud/api_keys.rs:40

## S86.15 Personal access tokens.
- Should: The user can create and revoke personal access tokens distinct from API keys.
- Status: not applicable anywhere

## S86.16 Local folders.
- Should: The user can choose which local folders AGI may read or write, see the list, and remove access.
- Status: desktop done, cli done
- Code: apps/web/features/settings/sections/CapabilitiesSection.tsx:88; apps/web/features/desktop-host/components/LocalAccessSection.tsx:279; apps/desktop/electron/runtime/dispatcher.ts:870; apps/cli/src/tui/tui_app.rs:3868

## S86.17 Browser sites.
- Should: The user can choose which websites AGI may read or act on and remove sites later.
- Status: chrome done
- Code: apps/extension/src/options.ts:1100; apps/extension/src/features/options/site-allowlist.ts:84

## S86.18 Computer applications.
- Should: The user can choose which desktop applications AGI may control and revoke that.
- Status: desktop done
- Code: apps/desktop/electron/runtime/applicationControl.ts:121; apps/desktop/electron/runtime/applicationControl.ts:116; apps/desktop/electron/runtime/computerUseSteps.ts:126; apps/desktop/electron/runtime/computerUseService.ts:380; apps/desktop/electron/native/macos/agi-input.swift:250; apps/desktop/electron/runtime/permissionManager.ts:311; apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:81

## S86.19 Clipboard access.
- Should: The user controls whether AGI may read the clipboard, and can review or withdraw that permission.
- Status: desktop done
- Code: apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:278; apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:81; apps/desktop/electron/runtime/dispatcher.ts:1070; apps/desktop/electron/runtime/computerUseSteps.ts:67

## S86.20 Microphone access.
- Should: The user can see and change whether AGI may use the microphone.
- Status: mobile done
- Code: apps/mobile/src/features/settings/permissions/registry.ts:104; apps/mobile/src/features/settings/permissions/detail.tsx:74

## S86.21 Camera access.
- Should: The user can see and change whether AGI may use the camera.
- Status: mobile done
- Code: apps/mobile/src/features/settings/permissions/registry.ts:104; apps/mobile/src/features/settings/permissions/detail.tsx:74

## S86.22 Screen-sharing preferences.
- Should: The user can set preferences for screen capture/sharing (whether and how AGI may see the screen).
- Status: desktop done
- Code: apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:47; apps/desktop/electron/screenshot.ts:37

## S86.23 Saved approvals.
- Should: The user can review the approvals they chose to remember (always-allow/deny) and remove any of them.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/connectors/components/ToolPermissionsPanel.tsx:60; apps/web/features/connectors/stores/tool-permissions-store.ts:60; apps/web/app/api/connectors/permissions/route.ts:150; apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:278; apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:81; apps/desktop/electron/runtime/dispatcher.ts:1070; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:540; apps/mobile/services/connectors.ts:87

## S86.24 Default permission mode.
- Should: The user can set the default approval posture for agent actions (ask every time, auto-approve safe, autonomous) and it is enforced.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:119; apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:70; apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:89; apps/mobile/app/(app)/settings/auto-approve.tsx:30; apps/mobile/src/features/settings/tool-approvals/useToolApprovalPolicySync.ts:76; apps/cli/src/onboarding.rs:962; apps/cli/src/agent/mod.rs:1552; apps/extension-vscode/src/features/settings/settingsProtocol.ts:76

## S86.25 Revoke all optional grants.
- Should: One action withdraws every optional permission granted to AGI (connectors, saved approvals, device grants, folders).
- Status: not applicable anywhere

## S86.26 Advanced/hardened account-security mode.
- Should: The user can turn on a hardened mode that tightens account and agent security beyond defaults.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/lib/support/tickets/recovery.ts:51; apps/web/lib/support/tickets/recovery.ts:122; apps/web/content/support/account-security.md:61; apps/web/lib/server/account-security/undo.ts:18; apps/mobile/src/features/settings/account-security/index.tsx:633; apps/mobile/src/features/settings/account-security/service.ts:208; apps/web/lib/api-auth.ts:284; apps/web/lib/api-auth.ts:312
