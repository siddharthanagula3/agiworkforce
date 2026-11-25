---
id: "AREA-086"
type: "area"
title: "Security and connected-access settings"
features: ["F086-01", "F086-02", "F086-03", "F086-04", "F086-05", "F086-06", "F086-07", "F086-08", "F086-09", "F086-10", "F086-11", "F086-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 86. Security and connected-access settings

This area is where a signed-in person checks how their account can be reached and what AGI may touch. It lists sign-in methods, passwords, passkeys, second sign-in codes, signed-in sessions and linked devices, and lets the person end any of them. It also holds the rules for what the agent may do without asking: default approval level, per-tool rules, and permissions for folders, websites, apps, clipboard and screen on each device. It matters because a sign-in that someone else can still reach, or an agent that acts without consent, is the main account risk.

**Who uses it.** Every signed-in user on the web, desktop and phone settings screens. Developers use the API key rules (web and the CLI). Workspace admins set limits that bind members: a workspace can require two-step sign-in (apps/web/lib/mfa-policy-gate.ts:93-104) and can refuse skipping approvals (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:37-44). Local permissions (folders, apps, clipboard, screen, websites) are granted by the person on their own device. I found no paid-plan gate in the files I read.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F086-01](F086-01-sign-in-methods-and-password.md) | Sign-in methods and password | built | built | built | n/a | no | no |
| [F086-02](F086-02-passkeys.md) | Passkeys | built | built | partly | n/a | n/a | n/a |
| [F086-03](F086-03-two-step-sign-in-and-recovery-codes.md) | Two-step sign-in and recovery codes | built | built | built | n/a | n/a | n/a |
| [F086-04](F086-04-advanced-account-security.md) | Advanced Account Security | built | built | built | no | built | built |
| [F086-05](F086-05-active-sessions-and-sign-out.md) | Active sessions and sign-out | built | built | built | partly | partly | partly |
| [F086-06](F086-06-linked-and-remote-devices.md) | Linked and remote devices | built | built | built | n/a | built | built |
| [F086-07](F086-07-security-notices.md) | Security notices | built | built | n/a | no | no | no |
| [F086-08](F086-08-connected-accounts-and-their-granted-permissions.md) | Connected accounts and their granted permissions | built | built | partly | partly | n/a | no |
| [F086-09](F086-09-api-keys.md) | API keys | built | built | no | built | n/a | no |
| [F086-10](F086-10-agent-approval-rules.md) | Agent approval rules | built | built | built | built | built | built |
| [F086-11](F086-11-local-folders-websites-apps-clipboard-and-screen.md) | Local folders, websites, apps, clipboard and screen | n/a | built | n/a | built | n/a | built |
| [F086-12](F086-12-phone-microphone-and-camera.md) | Phone microphone and camera | n/a | n/a | built | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/086-security-and-connected-access-settings.md](../../10-requirements/capabilities/086-security-and-connected-access-settings.md).

## How this area works in the code

1. **1. Person opens the security screen on the web.** The Security section mounts the sign-in methods, passkeys, Advanced Account Security and two-step panels. Log out of all devices sits here with a confirm dialog. (`apps/web/features/settings/sections/SecuritySection.tsx:120-135`, `apps/web/features/settings/sections/SecuritySection.tsx:241-250`)
2. **2. Person asks for a change, and a confirm dialog appears for risky actions.** Ending all sessions, unpairing a browser and unlinking a device each ask first. The panel then calls the server route and updates its list. (`apps/web/features/settings/sections/SecuritySection.tsx:126-134`, `apps/web/features/desktop-host/components/BrowserPairingSection.tsx:90-109`, `apps/web/features/settings/components/LinkedDevicesPanel.tsx:170-188`)
3. **3. Server checks the request.** Each write route checks the security token (CSRF), applies a rate limit, and resolves the signed-in person. Password change checks the current password and the second-factor state. (`apps/web/app/api/settings/sessions/route.ts:189-196`, `apps/web/app/api/settings/password/route.ts:31-71`, `apps/web/app/api/settings/identities/route.ts:47-58`)
4. **4. Recent re-check for risky actions.** Removing a sign-in method, ending all sessions, changing the password (in some cases) and regenerating backup codes need a fresh re-check. The required freshness and the consequence text come from one table. (`apps/web/app/api/settings/sessions/route.ts:198-204`, `apps/web/app/api/settings/2fa/backup-codes/route.ts:39-45`, `apps/web/lib/server/step-up/actions.ts:27-64`)
5. **5. Identity provider and credentials change.** The external identity provider sets the password, unlinks the method, or ends other sessions. Device refresh credentials are revoked in the app's own database. (`apps/web/app/api/settings/password/route.ts:74-87`, `apps/web/app/api/settings/sessions/route.ts:206-209`, `apps/web/app/api/settings/identities/route.ts:75-79`)
6. **6. Partial failure is reported.** If some sessions could not be ended, the route returns 502 with counts and asks for another try. Password change returns 503 and says to end other sessions in Settings. (`apps/web/app/api/settings/sessions/route.ts:213-236`, `apps/web/app/api/settings/password/route.ts:107-114`)
7. **7. Change is recorded and the person is told.** Audit records are written. Identity security events and two-step change notices are sent to the account holder, even when they made the change. (`apps/web/app/api/settings/sessions/route.ts:252-262`, `apps/web/app/api/settings/password/route.ts:98-105`, `apps/web/app/api/settings/2fa/backup-codes/route.ts:54-72`)
8. **8. Default approval level is saved and applied on every turn.** The approvals panel saves the default in account settings. Each agent turn reads it fresh, bounded by the workspace's permission, and falls back to Ask before every action if the read fails. (`apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:69-88`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:37-70`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/settings/sections/SecuritySection.tsx` | The web Security page. Mounts the sign-in, passkey, Advanced and two-step panels and the log out everywhere button. |
| `apps/web/app/api/settings/sessions/route.ts` | Lists signed-in sessions, ends sessions past the lifetime policy, and revokes all other sessions after a re-check. |
| `apps/web/app/api/settings/password/route.ts` | Changes the password, ends other sessions and device credentials, and tells the person. |
| `apps/web/app/api/settings/identities/route.ts` | Lists sign-in methods and removes one, refusing the last or the primary method. |
| `apps/web/app/api/settings/2fa/verify/route.ts` | Completes two-step sign-in setup from the authenticator code; gated by the authenticator environment switch. |
| `apps/web/lib/server/step-up/actions.ts` | Single table of risky actions: how fresh a re-check must be and the consequence text shown to the person. |
| `apps/web/app/api/connectors/permissions/route.ts` | Per-tool approval rules for connectors: read, save, and remove, with the critical-tool refusal. |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts` | Reads the saved approval default on each turn, applies the workspace ceiling, and falls back to asking. |
| `apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx` | The approval default radio group in settings; saves on change and reverts on failure. |
| `apps/desktop/electron/runtime/permissionManager.ts` | Desktop permission decisions: reviews them for the settings list and asks the person when needed. |

## What is stored

- Passwords, sign-in sessions, passkeys, backup codes and the authenticator secret held by the identity provider (the external service): External identity provider, reached through getIdentityProvider (apps/web/app/api/settings/sessions/route.ts:14; apps/web/app/api/settings/password/route.ts:43)
- Authenticator secret for setup in progress, encrypted, valid 30 minutes: Database table user_two_factor, column totp_secret_enc (apps/web/app/api/settings/2fa/verify/route.ts:63-76)
- Device name, OS and surface for each session and linked device; live-credential flag: Database table device_registrations and device_refresh_tokens (apps/web/app/api/settings/sessions/route.ts:46-50; apps/web/app/api/settings/devices/route.ts:66-85)
- Per-tool connector rules (allow, ask, deny): Database table public.connector_tool_permissions (apps/web/app/api/connectors/permissions/route.ts:47-50, 154-160)
- Default approval level, stored under the tool-approvals namespace: Database table public.user_settings, JSON column settings (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:54-58; apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:76)
- API keys and their revoked time: Database table public.api_keys (apps/web/app/api/settings/api-keys/[keyId]/route.ts:30-34, 48)
- Two-step enrollment cache, 300 seconds: Shared key-value store (apps/web/lib/mfa-policy-gate.ts:11-12, 43-55)
- Marker that a session's first sign-in was announced, kept for the session lifetime: Shared key-value store (apps/web/lib/server/session-sightings.ts:34-37)
- Advanced Account Security enrollment and undo state: Database table public.account_security_enrollments (apps/web/lib/services/account-activity-notifications.ts:63); undo state through apps/web/lib/server/account-security/store.ts
- Security notices and their email: Notification records and email send (apps/web/lib/services/account-activity-notifications.ts:43-54)
- Audit trail of changes: recordAuditEvent calls in the routes (apps/web/app/api/connectors/permissions/route.ts:112-124; apps/web/app/api/settings/api-keys/[keyId]/route.ts:52-57)
- Desktop permission decisions: Desktop runtime, listed by permissionManager.ts:299-312; where the store is written was not opened (persist at :300)
- Website access granted in Chrome: The browser's own host permissions, through chrome.permissions (apps/extension/src/features/options/site-allowlist.ts:75, 93)
- Phone microphone and camera permission: Held by the phone operating system; the app only reads and requests it (apps/mobile/src/features/settings/permissions/registry.ts:52-77)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_AUTHENTICATOR_ENROLLMENT**: Must be 1 for authenticator apps and backup codes to be set up or regenerated. Otherwise the server answers that they are temporarily unavailable. (apps/web/lib/authenticator-enrollment.ts:5, 11-17; checked by apps/web/app/api/settings/2fa/verify/route.ts:55 and apps/web/app/api/settings/2fa/backup-codes/route.ts:33)
- **Organization requires two-step sign-in**: Members of a workspace with this policy are refused until they enroll. (apps/web/lib/mfa-policy-gate.ts:97-104 (reads the organization policy requireMfa))
- **Workspace allows skipping approvals**: Skip approvals is offered and honoured only if every workspace the person belongs to permits it. Otherwise the default falls back to asking. (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:37-44, 60-62; the desktop CLI holds the same ceiling at apps/cli/src/lib.rs:4937-4949)
- **Account default approval level**: Sets the default for each agent turn. The packaged default for accounts is Skip approvals; the fallback on a failed read is Ask before every action. (packages/contracts/types/src/tool-approval-policy.ts:11 (fallback), :13 (account default); saved by apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:76)
- **Re-check freshness for each risky action**: How recently the person must have re-verified: 300 seconds for most actions, 120 for revealing an API key. (apps/web/lib/server/step-up/actions.ts:27-64)
- **Session lifetime policy**: Sessions older than the policy are ended when the session list loads. (apps/web/app/api/settings/sessions/route.ts:22-28, 151-155)
- **New sign-in window**: A session started more than 15 minutes earlier does not trigger a new sign-in notice. (apps/web/lib/server/session-sightings.ts:14)
- **Security email opt-out key**: emailSecurityAlerts turns off security email. Ignored when Advanced Account Security is on. (apps/web/lib/services/account-activity-notifications.ts:57, 87-91; UI at apps/web/features/settings/sections/NotificationsSection.tsx:67-71)
- **Critical tools cannot be always allowed**: A standing allow on a critical tool is refused with 422. (apps/web/app/api/connectors/permissions/route.ts:103-109; apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:45-80)
- **Screen capture blocked warning (macOS only)**: Shows a one-time dialog that tells the person where to enable screen recording. (apps/desktop/electron/screenshot.ts:39-50)
- **ACCOUNT_STATUS_FAIL_OPEN**: Named in a log message; when set, an account-status lookup failure lets the request through. (apps/web/lib/api-auth.ts:275-276 (message only; the reading code was not opened))

## Shared between apps

Web server routes in apps/web/app/api/settings/* and apps/web/app/api/connectors/* serve the web, the desktop screens (apps/web/features/desktop-host, which talk to the desktop runtime through a host bridge) and the phone app (apps/mobile/src/features/settings/account-security/service.ts:164-186 calls /api/settings/sessions and /api/settings/password). Shared types come from packages (apps/web/shared/types/toolApprovalPolicy.ts re-exports packages/contracts/types/src/tool-approval-policy.ts; connector schemas from @agiworkforce/cloud-contracts, connectors/permissions/route.ts:4-11; identity provider types from @agiworkforce/identity, sessions/route.ts:13). The step-up table (apps/web/lib/server/step-up/actions.ts) is shared by all server routes. Separate per app: the desktop permission runtime (apps/desktop/electron/runtime), the phone permission code (apps/mobile/src/features/settings/permissions), the phone account-security screen (apps/mobile/src/features/settings/account-security), the CLI key module and sign-out (apps/cli/src/cloud/api_keys.rs, apps/cli/src/app_server/account.rs), the Chrome extension site allowlist (apps/extension/src/features/options/site-allowlist.ts) and the VS Code extension. Whether the phone and extension approval settings use the same policy types was not checked.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief cites CLI sign-out at apps/cli/src/lib.rs:3943, but that line is artifact output code. Real sign-out is apps/cli/src/app_server/account.rs:635-694. (~/Desktop/agiworkforce-QA/tools/area-briefs/086-security-and-connected-access-settings.md (S86.09); apps/cli/src/lib.rs:3943)
- Brief cites VS Code sign-out at apps/extension-vscode/src/core/commandSetup.ts:1048, but that is the reject-diff command. Brief cites Chrome sign-out at apps/extension/src/options.ts:1426, which refreshes the site allowlist. Real Chrome sign-out is apps/extension/src/features/cloud-bridge/freeTrialClient.ts:504 and side_panel.ts:12089-12110. (Brief S86.09; apps/extension-vscode/src/core/commandSetup.ts:1048; apps/extension/src/options.ts:1426)
- Brief cites apps/desktop/electron/runtime/dispatcher.ts:870 and :924 for pairing and remote devices. Those lines map developer tool capabilities and a branch-push reason. Pairing code was not found there. (Brief S86.08 and S86.18; apps/desktop/electron/runtime/dispatcher.ts:870, 924)
- Brief cites DesktopSettingsSection.tsx:278 and :47 for clipboard and screen-sharing controls. Line 47 is a text constant and line 278 is the general settings save code. No clipboard or screen-sharing preference toggle was found; the screen-sharing preference (S86.22) is not established. (Brief S86.19 and S86.22; apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:47, 278)
- Brief cites apps/extension/src/options.ts:1100 for the Chrome site list, but that line is CSS. The allowlist code is apps/extension/src/features/options/site-allowlist.ts. (Brief S86.17; apps/extension/src/options.ts:1100)
- Brief cites apps/mobile/src/features/settings/permissions/registry.ts:104 for microphone and camera. Line 104 is the calendar status reader. Microphone is at registry.ts:52-57 and 163-172; camera at 71-77 and 181-190. (Brief S86.20 and S86.21; apps/mobile/src/features/settings/permissions/registry.ts:104)
- Brief cites apps/web/lib/api-auth.ts:284 and :312 for hardened mode. Those lines are the account-status fail-closed check and the auth result builder. The hardened mode is Advanced Account Security (apps/web/features/account-security). Brief also cites recovery.ts:51 and :122; line 124 is only a support message. (Brief S86.26; apps/web/lib/api-auth.ts:284, 312; apps/web/lib/support/tickets/recovery.ts:51, 122)
- Brief marks mobile passkeys missing, but the phone account-security screen renders a Passkeys section in cloud mode, and changes use a re-check. (apps/mobile/src/features/settings/account-security/index.tsx:495-509, 637-650; apps/mobile/src/features/settings/account-security/PasskeysSection.tsx:143)
- Brief says mobile add or remove of sign-in methods is done in-app. The phone screen only opens the web Security page for it. Also hardened mode on the phone is a link only. (apps/mobile/src/features/settings/account-security/index.tsx:629-635 and 592-598)
- Brief describes trusted devices that skip extra checks. The code has only linked devices, unlinked by revoking their credential. No trust-skip setting was found, and the support copy says no device skips sign-in checks. (apps/web/features/settings/components/LinkedDevicesPanel.tsx:374-378; apps/web/lib/support/agent/corpus.generated.json (Passkeys, two-factor and active sessions entry))
- Approval default mismatch: the panel starts at Skip approvals (the account default), while the server falls back to Ask before every action when the saved value cannot be read. The panel can therefore show Skip approvals while enforcement falls back to asking; there is no visible warning of the fallback. (apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:23-25, 38-47; apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:63-68; packages/contracts/types/src/tool-approval-policy.ts:11, 13)
- A read has a side effect: listing sessions ends sessions past the lifetime policy and writes an audit record. Looks intentional but surprising for a GET. (apps/web/app/api/settings/sessions/route.ts:143-187 and 108-141)
- Security email opt-out is overridden when Advanced Account Security is on, so a person who turned security email off still gets it. The Should says the person can control how they are told; the UI text states the rule but the toggle cannot stop the email. (apps/web/lib/services/account-activity-notifications.ts:87-91; apps/web/features/settings/sections/NotificationsSection.tsx:70)
- Brief marks S86.25 (revoke all optional grants) not applicable, but its Should describes one action. No single action exists; only per-tool removal exists. (Brief S86.25; apps/web/app/api/connectors/permissions/route.ts:131-185)
- Connector permission routes share the chat rate-limit bucket (chat-conversation) instead of their own name. (apps/web/app/api/connectors/permissions/route.ts:43, 65, 135)

## Not established

- Password reset for a forgotten password (S86.02 Should) lives in the sign-in flow; it was not opened.
- Step-up mechanism itself (requireStepUp in apps/web/lib/server/step-up-auth) and the identity-provider session revocation (apps/web/lib/server/session-revocation.ts) were not read; only their call sites were.
- Web panels not opened: SignInMethodsPanel, PasskeysPanel body, TwoFactorEnrollmentPanel, AccountSection, WebSettingsModal, NotificationsSection beyond the labels, and the top of LinkedDevicesPanel.
- Advanced Account Security enable and disable routes (apps/web/app/api/account-security/*) and the panel body were not read; the support copy is the only source for their rules.
- Organisation-managed and verified-domain exclusion for Advanced Account Security: stated in support copy, not found in code.
- Plan or paid gates for any item in this area: none seen in the files I read.
- Desktop: where permission decisions are persisted (permissionManager.ts persist, line 300) and the folder add and remove handlers (LocalAccessSection.tsx) were not read; desktop screen-sharing preference was not found.
- CLI: approval enforcement (apps/cli/src/agent/mod.rs:1552) and folder access (apps/cli/src/tui/tui_app.rs:3868) were not opened.
- VS Code, Chrome and phone approval settings (settingsProtocol.ts:76; useToolApprovalPolicySync.ts:76; apps/mobile/app/(app)/settings/auto-approve.tsx) were not opened.
- Empty states, waiting states and error copy for most panels were not verified.
- The Chrome site allowlist removal path beyond removeApprovedSiteHostPermission (site-allowlist.ts:99) and the options page UI for it were not read.
- No tests, builds, servers or installs were run, as the task was read-only. Localhost testing was not done for this summary.
