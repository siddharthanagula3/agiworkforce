---
id: "GAPS-AREA-086"
type: "gap-list"
title: "Gaps: Security and connected-access settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 86. Security and connected-access settings

103 open gaps that touch this area. Area page: [20-features/086-security-and-connected-access-settings](../../20-features/086-security-and-connected-access-settings/README.md).

## CMP-C10

**Log out of every device and session at once**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Detail: Ours logout clears the sign-in on this machine only; there is no sign-out of all devices from the CLI.
- Evidence: apps/cli/src/lib.rs:994; searched: revoke in apps/cli/src/auth.rs

## CMP-CP1

**Auth status showing expiry**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Detail: Gives no warning before sign-in ends and no JSON Ours auth-status prints provider, type, status and expiry in a table, but gives no warning before sign-in ends and no JSON.
- Evidence: apps/cli/src/lib.rs:7403

## CMP-CP2

**Long-lived token or API key for CI and scripts**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F086-09](../../20-features/086-security-and-connected-access-settings/F086-09-api-keys.md)
- Detail: It is a session token, not a long-lived CI token, and agi keys create only opens account settings (lib.rs:2229-223 There is an account token variable: AGIWORKFORCE_JWT is read before the saved sign-in (apps/cli/src/tier_cache.rs:99,948-952) and the expiry message names it (apps/cli/src/lib.rs:7970). It is a session token, not a long-lived CI token, and agi keys create only opens account settings (lib.rs:2229-223
- Evidence: searched: setup-token, ACCESS_TOKEN, with-access-token in apps/cli/src

## CMP-CP4

**Choose where login credentials are stored**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F086-09](../../20-features/086-security-and-connected-access-settings/F086-09-api-keys.md)
- Detail: No auto or in-memory setting Ours stores sign-in in the OS keyring with a file fallback chosen by AGIWORKFORCE_NO_KEYRING; no auto or in-memory setting.
- Evidence: apps/cli/src/auth.rs:697,778

## CMP-CP5

**Free plan can use the CLI**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F003-01](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md), [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Detail: Cloud in the CLI needs Pro or higher, so Free and Basic cannot use it: like Claude, unlike Codex which lets Free and Go… Cloud in the CLI needs Pro or higher, so Free and Basic cannot use it: like Claude, unlike Codex which lets Free and Go in lightly.
- Evidence: apps/cli/src/plans.rs:104-125 (developer_surfaces uses PRO_TIERS)

## CMP-CP8

**Sign out one CLI sign-in from the account's device list without signing out everywhere**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md), [F086-06](../../20-features/086-security-and-connected-access-settings/F086-06-linked-and-remote-devices.md)
- Detail: The CLI cannot sign another device out and agi logout only clears this machine agi devices lists the devices signed in to the account and what each can host, read-only; the CLI cannot sign another device out and agi logout only clears this machine.
- Evidence: apps/cli/src/lib.rs:1098-1104 (Devices: json only); apps/cli/src/cloud/devices.rs (no revoke or delete call); apps/cli/src/lib.rs:993-1000

## CMP-DP3

**Members create access tokens for non-interactive automation**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F086-09](../../20-features/086-security-and-connected-access-settings/F086-09-api-keys.md)
- Detail: There is no admin switch limiting who may create them for workspace automation Members can create API keys in Account settings, but there is no admin switch limiting who may create them for workspace automation.
- Evidence: apps/web/features/settings/sections/AccountSection.tsx:433; searched: allowApiKeys in organization policy

## CMP-M173

**Clear cloud browser cookies and data**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F041-07](../../20-features/041-temporary-and-private-experiences/F041-07-private-search-and-private-browsing-not-built.md), [F085-11](../../20-features/085-personalization-and-data-settings/F085-11-browsing-access.md), [F086-11](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)
- Detail: No cloud browser exists, so no browser data or cookie control.
- Evidence: searched: cloud browser, cookies, browser data in src/features/settings

## CMP-M5

**Push approval of a login in the signed-in app**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md), [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md), [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Detail: No push-to-approve login; two-step sign-in uses codes only.
- Evidence: searched: approve login, login approval, push approve in app, src, services

## CMP-M7

**Sign in with a passkey**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F003-06](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md), [F086-02](../../20-features/086-security-and-connected-access-settings/F086-02-passkeys.md)
- Detail: The sign-in screen has no passkey option. Passkeys can only be listed and removed under Security and login.
- Evidence: searched: passkeySignInEnabled in apps/mobile/src, app (defined only in packages/client/client-runtime/src/authProviders.ts:34, never imported); apps/mobile/src/features/auth/components/MobileSignIn.tsx:46

## CMP-M8

**Text message sign-in code**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md), [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Detail: Two-step sign-in supports only an authenticator app (with backup codes); no text message, push or WhatsApp code.
- Evidence: apps/mobile/src/features/settings/account-security/TwoFactorSection.tsx:250

## CMP-MP2

**Advanced account security**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F086-04](../../20-features/086-security-and-connected-access-settings/F086-04-advanced-account-security.md)
- Detail: The mobile app has no advanced-security mode of its own The row opens the web security page in an in-app browser. The mobile app has no advanced-security mode of its own.
- Evidence: apps/mobile/src/features/settings/account-security/index.tsx:594

## CMP-MP4

**Security keys and passkeys**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F003-06](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md), [F086-02](../../20-features/086-security-and-connected-access-settings/F086-02-passkeys.md)
- Detail: Security and login lists passkeys and security keys and can remove them; adding one opens the web Security and login lists passkeys and security keys and can remove them; adding one opens the web.
- Evidence: apps/mobile/src/features/settings/account-security/PasskeysSection.tsx:264; apps/mobile/src/features/settings/account-security/index.tsx:638

## CMP-MP90

**Approval cards before the assistant sends, pays, signs or deletes**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md), [F086-08](../../20-features/086-security-and-connected-access-settings/F086-08-connected-accounts-and-their-granted-permissions.md), [F086-10](../../20-features/086-security-and-connected-access-settings/F086-10-agent-approval-rules.md)
- Detail: Not for payments, signatures or sends on a user account Cloud tasks show approval cards for tool actions, but not for payments, signatures or sends on a user account.
- Evidence: src/features/cloud-code/components/CloudCodeApprovalCard.tsx; src/features/settings/tool-approvals

## CMP-MP92

**Apps with access**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F086-08](../../20-features/086-security-and-connected-access-settings/F086-08-connected-accounts-and-their-granted-permissions.md), [F086-10](../../20-features/086-security-and-connected-access-settings/F086-10-agent-approval-rules.md)
- Detail: There is no separate 'apps with access' row in privacy Settings > Connectors lists connected tools and approvals; there is no separate 'apps with access' row in privacy.
- Evidence: apps/mobile/src/features/settings/index.tsx:853

## CMP-VP1

**Login stored in the OS keyring, a file or memory**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F086-09](../../20-features/086-security-and-connected-access-settings/F086-09-api-keys.md)
- Detail: No setting offers a file or in-memory choice The shared CLI login is kept in the operating system keyring, but no setting offers a file or in-memory choice.
- Evidence: apps/cli/src/auth.rs:92-94 (os-keyring); searched: credential_store in apps/cli/src/

## CMP-W13

**Two-step sign-in by push approval**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md), [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Detail: No push-approval second factor.
- Evidence: searched: push approval, mfa push, WhatsApp in apps/web/features/settings, apps/web/features/auth

## CMP-W14

**Two-step sign-in by text message or WhatsApp**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md), [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Detail: Security pane says SMS two-step is not available; authenticator app and backup codes only.
- Evidence: apps/web/features/settings/sections/SecuritySection.tsx:303

## CMP-W295

**Cloud browser sign-in data and cookie clearing**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F041-07](../../20-features/041-temporary-and-private-experiences/F041-07-private-search-and-private-browsing-not-built.md), [F085-11](../../20-features/085-personalization-and-data-settings/F085-11-browsing-access.md), [F086-11](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)
- Detail: No hosted cloud browser with user cookie management.
- Evidence: searched: cloud browser in apps/web, unified-chat

## CMP-WP11

**Same-email accounts merge; sign-in methods listed and linkable**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md), [F086-01](../../20-features/086-security-and-connected-access-settings/F086-01-sign-in-methods-and-password.md), [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Detail: Automatic merge on a matching email was not verified Sign-in methods panel lists connected accounts and links more; automatic merge on a matching email was not verified.
- Evidence: apps/web/features/settings/components/Settings/SignInMethodsPanel.tsx:25-31; searched: merge, identities in apps/web/features/settings

## CMP-WP12

**Sign in with a passkey on the login screen**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F003-06](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md), [F086-02](../../20-features/086-security-and-connected-access-settings/F086-02-passkeys.md), [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Detail: Production setting not visible Passkey sign-in appears on the login screen only when AGI_AUTH_PROVIDERS includes passkey; production setting not visible.
- Evidence: apps/web/features/auth/authProviderConfig.ts:15; packages/client/client-runtime/src/authProviders.ts:35-40

## CMP-WP14

**Temporary lockout after repeated failed sign-in codes**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Detail: Ordinary sign-in lockout is left to the identity provider and is not set anywhere in the repository Our code locks only the advanced-security enrollment code (5 tries, 60 minute lockout). Ordinary sign-in lockout is left to the identity provider and is not set anywhere in the repository.
- Evidence: packages/contracts/cloud-contracts/src/account-security.ts:44-56 (enrollmentCodeAttempts, enrollmentCodeLockoutMinutes); searched apps/web (app, features, lib, shared) and packages (ui, contracts, client), tests excluded: too many attempts, locked out, lockout, user_locked

## CMP-WP16

**Web session length and renewal**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Detail: Sessions last up to 7 days with a user-set idle timeout; owner chose to stay on the 7 day limit Sessions last up to 7 days with a user-set idle timeout; owner chose to stay on the 7 day limit.
- Evidence: apps/web/lib/auth/session-policy.ts:35-65; apps/web/features/settings/sections/SecuritySection.tsx:192

## CMP-WP241

**Suspicious activity alerts**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Detail: There is no in-product alert banner Every new sign-in is emailed and security anomalies are monitored server side, but there is no in-product alert banner.
- Evidence: apps/web/features/account-security/components/AdvancedAccountSecurityPanel.tsx:71; apps/web/lib/services/security-monitoring-service.ts:122

## CMP-WP9

**Emailed code when signing in from a new device or unusual place**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Detail: No extra code step for a new device or location was found in our code We record and label a new-device sign-in in Security activity and can email a security alert, but no extra code step for a new device or location was found in our code.
- Evidence: apps/web/app/api/settings/activity/activity-presentation.ts:53-57; apps/web/features/settings/sections/NotificationsSection.tsx:67-72; searched apps/web (app, features, lib, shared) and packages (ui, contracts, client), tests excluded: new device, unrecognized sign-in, client_trust

## CMP-X1

**Log out of all active sessions at once**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Detail: Ours signs out this browser only; no sign-out-everywhere action in the extension.
- Evidence: searched: logout, signOut, all sessions, other devices in apps/extension/src (options.ts:1708 signOutOfAccount ends one session)

## GAP-AREA086-LW11

**Approval default mismatch: the panel starts at Skip approvals (the account default), while the server falls back to Ask before every action when the saved value cannot be read. The panel can therefore show Skip approvals while enforcement falls back to asking; there is no visible warning of the fall**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-086
- Detail: Area 86. Security and connected-access settings
- Evidence: apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:23-25, 38-47; apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:63-68; packages/contracts/types/src/tool-approval-policy.ts:11, 13

## GAP-AREA086-LW12

**A read has a side effect: listing sessions ends sessions past the lifetime policy and writes an audit record. Looks intentional but surprising for a GET.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-086
- Detail: Area 86. Security and connected-access settings
- Evidence: apps/web/app/api/settings/sessions/route.ts:143-187 and 108-141

## GAP-AREA086-LW13

**Security email opt-out is overridden when Advanced Account Security is on, so a person who turned security email off still gets it. The Should says the person can control how they are told; the UI text states the rule but the toggle cannot stop the email.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-086
- Detail: Area 86. Security and connected-access settings
- Evidence: apps/web/lib/services/account-activity-notifications.ts:87-91; apps/web/features/settings/sections/NotificationsSection.tsx:70

## GAP-AREA086-LW15

**Connector permission routes share the chat rate-limit bucket (chat-conversation) instead of their own name.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-086
- Detail: Area 86. Security and connected-access settings
- Evidence: apps/web/app/api/connectors/permissions/route.ts:43, 65, 135

## GAP-CAP-account-and-sign-in-02

**Email and password sign-in, reset and add password: Mobile reset is unverified in the ledger. Review accounts need password sign-in (owner memory, 2026-11-20); not re-checked.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-04](../../20-features/003-authentication-and-onboarding-screens/F003-04-password-reset.md), [F086-01](../../20-features/086-security-and-connected-access-settings/F086-01-sign-in-methods-and-password.md)
- Requirement items: S3.06, S3.07, S86.02
- Detail: Claude no, ChatGPT yes; AGI built

## GAP-CAP-account-and-sign-in-05

**Passkeys for sign-in and as a second step: Mobile passkey sign-in and in-app enrollment missing (S86.03 mobile missing). Production setting for web sign-in not visible.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-06](../../20-features/003-authentication-and-onboarding-screens/F003-06-passkey-sign-in-and-passkey-setup.md), [F086-02](../../20-features/086-security-and-connected-access-settings/F086-02-passkeys.md)
- Requirement items: S3.11, S3.12, S86.03
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-account-and-sign-in-06

**Two-step verification (authenticator, SMS, push) and backup codes: SMS, WhatsApp and push factors missing. The 2026-09-28 decision says authenticator controls may show Temporarily unavailable until the vendor plan is bought; current state in production not verified.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-07](../../20-features/003-authentication-and-onboarding-screens/F003-07-two-step-sign-in-and-recovery-codes.md), [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Requirement items: S3.13, S3.14, S3.15, S86.04, S86.05
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-account-and-sign-in-07

**Hardened account mode (Advanced Account Security) and recovery keys: Mobile has no mode of its own, only a web hand-off.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F086-04](../../20-features/086-security-and-connected-access-settings/F086-04-advanced-account-security.md)
- Requirement items: S86.26
- Detail: Claude unknown, ChatGPT yes; AGI built

## GAP-CAP-account-and-sign-in-08

**Login verification for new devices and push approval: No new-device code; no push approval; ordinary sign-in lockout left to the identity vendor.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Requirement items: S86.11
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-account-and-sign-in-09

**Active sessions list with remote sign-out: No sign-out of one CLI, VS Code or Chrome sign-in from the device list (CP8).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md), [F086-06](../../20-features/086-security-and-connected-access-settings/F086-06-linked-and-remote-devices.md)
- Requirement items: S86.06, S86.07, S86.08
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-account-and-sign-in-10

**Log out of all devices: Need proof that web sign-out-all ends CLI, VS Code and Chrome credentials; no sign-out-everywhere action in CLI or extension.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Requirement items: S86.09, S86.10
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-account-and-sign-in-11

**Session lifetime and renewal: CLI auth-status gives no pre-expiry warning and no JSON (CP1). Web session shorter than Claude's 28 days by owner choice.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Requirement items: S86.06
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-account-and-sign-in-23

**Terminal and editor sign-in (browser, device code, headless): Free and Basic accounts cannot use the CLI Cloud (CP5), matching Claude Code and not Codex.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-01](../../20-features/003-authentication-and-onboarding-screens/F003-01-sign-in-to-your-account.md), [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Requirement items: S3.01, S86.09
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-account-and-sign-in-24

**Credentials for automation (tokens, API keys, storage): No one-command long-lived token; no in-memory or file choice; no admin limit on key creation.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F086-09](../../20-features/086-security-and-connected-access-settings/F086-09-api-keys.md)
- Requirement items: S86.14
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-account-and-sign-in-26

**Linked sign-in methods, security history and device lock: Same-email merge on web unverified (WP11); security notices missing on CLI, VS Code and Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F003-05](../../20-features/003-authentication-and-onboarding-screens/F003-05-social-and-work-sign-in.md), [F086-01](../../20-features/086-security-and-connected-access-settings/F086-01-sign-in-methods-and-password.md), [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Requirement items: S3.17, S86.01, S86.11
- Detail: Claude unknown, ChatGPT unknown; AGI built

## GAP-CAP-privacy-and-data-controls-21

**Active sessions and sign out everywhere: CLI, VS Code and Chrome credentials not shown or revocable from one list.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md), [F086-06](../../20-features/086-security-and-connected-access-settings/F086-06-linked-and-remote-devices.md)
- Requirement items: S86.06, S86.07, S86.09, S86.10
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-22

**Multi-factor sign-in, passkeys and recovery: Passkeys missing on mobile; passkey sign-in on login depends on a provider setting (WP12 partial).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F086-02](../../20-features/086-security-and-connected-access-settings/F086-02-passkeys.md), [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Requirement items: S86.03, S86.04, S86.05
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-24

**Security activity log and sign-in alerts: No in-product alert.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Requirement items: S86.11
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-25

**Lockdown mode: Not on desktop, CLI or extensions per comparison files reviewed.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F086-04](../../20-features/086-security-and-connected-access-settings/F086-04-advanced-account-security.md)
- Requirement items: S86.26
- Detail: Claude unknown, ChatGPT yes; AGI built

## GAP-CAP-privacy-and-data-controls-26

**Connected app data sharing and approvals: Mobile lacks a privacy row for apps with access; no approvals for payments or signatures.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-11](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md), [F086-08](../../20-features/086-security-and-connected-access-settings/F086-08-connected-accounts-and-their-granted-permissions.md), [F086-10](../../20-features/086-security-and-connected-access-settings/F086-10-agent-approval-rules.md)
- Requirement items: S41.20, S86.12, S86.13, S86.23
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-privacy-and-data-controls-33

**Browser and computer agent data handling: No private browser session (S41.13 missing); no cookie clearing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F041-07](../../20-features/041-temporary-and-private-experiences/F041-07-private-search-and-private-browsing-not-built.md), [F085-11](../../20-features/085-personalization-and-data-settings/F085-11-browsing-access.md), [F086-11](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)
- Requirement items: S41.13, S85.10, S86.17, S86.18
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F086-01-01

**Phone cannot add or remove a sign-in method.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-01](../../20-features/086-security-and-connected-access-settings/F086-01-sign-in-methods-and-password.md)
- Detail: Affects: Mobile users. Work needed: Decide whether in-app management is required; the identities API and step-up already exist.
- Evidence: apps/mobile/src/features/settings/account-security/index.tsx:629-635

## GAP-F086-01-02

**No forgotten-password reset found in the settings area although the brief requires it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-01](../../20-features/086-security-and-connected-access-settings/F086-01-sign-in-methods-and-password.md)
- Detail: Affects: All apps. Work needed: Confirm where reset lives (sign-in screens) and record it, or add it.
- Evidence: Brief S86.02; no reset route in files opened

## GAP-F086-01-03

**CLI, VS Code and Chrome have no equivalent screen or pointer to the web page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-01](../../20-features/086-security-and-connected-access-settings/F086-01-sign-in-methods-and-password.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Add a link to Security settings or mark not applicable.
- Evidence: Brief status vscode and chrome missing; none found in code opened

## GAP-F086-01-04

**Last-used time is hidden for the Email and Password rows and for a single identity.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-01](../../20-features/086-security-and-connected-access-settings/F086-01-sign-in-methods-and-password.md)
- Detail: Affects: Web and Desktop. Work needed: Show last-used for every row if the data exists.
- Evidence: SignInMethodsPanel.tsx:598-612

## GAP-F086-01-NOTBUILT

**Sign-in methods and password: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F086-01](../../20-features/086-security-and-connected-access-settings/F086-01-sign-in-methods-and-password.md)
- Requirement items: S86.01
- Detail: VS Code: S86.01; Chrome: S86.01

## GAP-F086-02-01

**The brief says Mobile is missing while the code has a Passkeys page, so the brief is stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-02](../../20-features/086-security-and-connected-access-settings/F086-02-passkeys.md)
- Detail: Affects: Documentation, testers. Work needed: Correct the brief status to partial.
- Evidence: apps/mobile/src/features/settings/account-security/index.tsx:637-650

## GAP-F086-02-02

**Mobile cannot add or rename a passkey.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-02](../../20-features/086-security-and-connected-access-settings/F086-02-passkeys.md)
- Detail: Affects: Mobile. Work needed: Decide whether to build in-app registration.
- Evidence: PasskeysSection.tsx:258-265

## GAP-F086-02-03

**Web passkey changes have no AGI-side re-check; the earlier draft claim that account_security.change guards every change is not true for the web panel.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-02](../../20-features/086-security-and-connected-access-settings/F086-02-passkeys.md)
- Detail: Affects: Web and Desktop. Work needed: Confirm whether the identity provider enforces a recent sign-in; if not, add a step-up.
- Evidence: client.ts:190-280 (no requireStepUp); step-up only in account-security routes

## GAP-F086-02-04

**Two separate passkey stores (provider and Advanced Account Security) can confuse people.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-02](../../20-features/086-security-and-connected-access-settings/F086-02-passkeys.md)
- Detail: Affects: All. Work needed: Explain or unify in the UI.
- Evidence: PasskeysSection.tsx merges two lists

## GAP-F086-03-01

**Brief wants codes viewable; codes are shown once only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Decide whether once-only display is the intended rule and amend the brief, or add a safe re-display.
- Evidence: verify/route.ts:99; TwoFactorSection.tsx:259-265

## GAP-F086-03-02

**Availability depends on a server switch that is not shown to be set in production.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Detail: Affects: All users. Work needed: Confirm the production value and record it.
- Evidence: authenticator-enrollment.ts:5-12

## GAP-F086-03-03

**No two-factor settings on CLI, VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-03](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Detail: Affects: Those apps. Work needed: Point to web Security or mark not applicable.
- Evidence: none found

## GAP-F086-04-01

**Phone cannot enroll or manage the mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-04](../../20-features/086-security-and-connected-access-settings/F086-04-advanced-account-security.md)
- Detail: Affects: Mobile. Work needed: Use the existing handoff endpoints or accept web-only and fix the brief status.
- Evidence: index.tsx:592-598

## GAP-F086-04-02

**Brief says CLI, VS Code and Chrome are done but no management screen exists; only error mapping was found, and none for CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-04](../../20-features/086-security-and-connected-access-settings/F086-04-advanced-account-security.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Verify each app shows a useful message and update the brief.
- Evidence: cloudRefusal.ts:67; accountRefusal.ts:7; gateway_models.rs:497

## GAP-F086-04-03

**Earlier draft said the organization check was not found; it exists in service.ts and applies to enrollment.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-04](../../20-features/086-security-and-connected-access-settings/F086-04-advanced-account-security.md)
- Detail: Affects: Documentation. Work needed: None; keep this page as the source.
- Evidence: service.ts:104-153

## GAP-F086-04-NOTBUILT

**Advanced Account Security: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F086-04](../../20-features/086-security-and-connected-access-settings/F086-04-advanced-account-security.md)
- Requirement items: S86.26
- Detail: CLI: S86.26

## GAP-F086-05-01

**CLI, VS Code and Chrome cannot list sessions or sign out everywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Point to the web sessions page or build an in-app list.
- Evidence: Brief S86.06 and S86.10 status; none found in code

## GAP-F086-05-02

**Single revoke has no step-up while revoke all does.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Detail: Affects: Web, Mobile. Work needed: Decide the intended rule and record it.
- Evidence: [sessionId]/route.ts:15-76 vs sessions/route.ts:198-204

## GAP-F086-05-03

**Listing ends sessions as a side effect of a read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Detail: Affects: All. Work needed: Consider a background job so reads stay read-only.
- Evidence: sessions/route.ts:151-155

## GAP-F086-05-04

**VS Code sign out is described as device only but also signs the CLI out.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Detail: Affects: VS Code, CLI. Work needed: State this on the page the person sees.
- Evidence: commandSetup.ts:1245

## GAP-F086-05-NOTBUILT

**Active sessions and sign-out: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F086-05](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Requirement items: S86.06, S86.10
- Detail: CLI: S86.06, S86.10; VS Code: S86.06, S86.10; Chrome: S86.10

## GAP-F086-06-01

**Lost device, log out everywhere and stop remote work exist on the server but have no button.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-06](../../20-features/086-security-and-connected-access-settings/F086-06-linked-and-remote-devices.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Add controls or remove unused code paths.
- Evidence: devices/[deviceId]/route.ts; no caller found in apps

## GAP-F086-06-02

**Unlink does not need a re-check.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-06](../../20-features/086-security-and-connected-access-settings/F086-06-linked-and-remote-devices.md)
- Detail: Affects: Web, Desktop. Work needed: Decide the rule; add step-up if required.
- Evidence: devices/[deviceId]/route.ts, handleUnlink (no requireStepUp)

## GAP-F086-06-03

**Phone pairing is switched off although the brief says done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-06](../../20-features/086-security-and-connected-access-settings/F086-06-linked-and-remote-devices.md)
- Detail: Affects: Mobile. Work needed: Record the flag state in the brief or enable when ready.
- Evidence: v1FeatureFlags.ts:12,16

## GAP-F086-06-04

**VS Code pairing not found in code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-06](../../20-features/086-security-and-connected-access-settings/F086-06-linked-and-remote-devices.md)
- Detail: Affects: VS Code. Work needed: Locate or build, then verify.
- Evidence: Searched extension-vscode/src for unpair; no match

## GAP-F086-06-05

**The earlier draft said the list shows the latest 50 registrations; the code caps at 200 across three sources.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-06](../../20-features/086-security-and-connected-access-settings/F086-06-linked-and-remote-devices.md)
- Detail: Affects: Documentation. Work needed: None; use this page.
- Evidence: devices/route.ts:15

## GAP-F086-07-01

**Nine catalogued notices are never raised, including passkey added or removed, API key created or revoked, new device and new location.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Detail: Affects: Web and Desktop account holders.. Work needed: Raise each where the act happens or drop it from the catalogue.
- Evidence: apps/web/lib/server/__tests__/security-event-coverage.test.ts:56-66

## GAP-F086-07-02

**No notice display or alert preference on CLI, VS Code, Chrome (and none found on mobile).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Detail: Affects: CLI, VS Code, Chrome, Mobile users.. Work needed: Decide whether those surfaces show the web feed; add a read surface.
- Evidence: S86.11 brief; apps/mobile/src/features/settings searched

## GAP-F086-07-03

**Device-approval and compromise notices are not emailed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Detail: Affects: People who are away from the app when a device is approved.. Work needed: Send email through the same preference rules.
- Evidence: apps/web/lib/services/account-activity-notifications.ts:98-139

## GAP-F086-07-04

**Choosing Off for Security alerts looks effective but Advanced Account Security still emails; the only hint is inside Delivery details.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Detail: Affects: Web and Desktop users with Advanced Account Security.. Work needed: Show the rule next to the control.
- Evidence: NotificationsSection.tsx:69-71; account-activity-notifications.ts:90

## GAP-F086-07-05

**Silent skip of email when the transport is not configured.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Detail: Affects: Operators.. Work needed: Log or surface a deployment check.
- Evidence: notification-email-service.ts:145-151, 168

## GAP-F086-07-NOTBUILT

**Security notices: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F086-07](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Requirement items: S86.11
- Detail: CLI: S86.11; VS Code: S86.11; Chrome: S86.11

## GAP-F086-08-01

**CLI connectors list shows no granted permissions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-08](../../20-features/086-security-and-connected-access-settings/F086-08-connected-accounts-and-their-granted-permissions.md)
- Detail: Affects: CLI users.. Work needed: Return and render grantedPermissions.
- Evidence: apps/cli/src/cloud/connectors.rs:97-108

## GAP-F086-08-02

**Brief marks phone scopes and CLI connectors missing, but code has them; the brief is stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-08](../../20-features/086-security-and-connected-access-settings/F086-08-connected-accounts-and-their-granted-permissions.md)
- Detail: Affects: Anyone planning from the brief.. Work needed: Update the brief status.
- Evidence: ConnectorDetailScreen.tsx:895-925; apps/cli/src/lib.rs:7377-7410

## GAP-F086-08-03

**Chrome has no connected-account view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-08](../../20-features/086-security-and-connected-access-settings/F086-08-connected-accounts-and-their-granted-permissions.md)
- Detail: Affects: Chrome users.. Work needed: Build the view or hide the entry.
- Evidence: apps/extension/src/side_panel.ts:15251

## GAP-F086-08-04

**No per-account disconnect where a connector holds several accounts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-08](../../20-features/086-security-and-connected-access-settings/F086-08-connected-accounts-and-their-granted-permissions.md)
- Detail: Affects: Web, phone.. Work needed: Add a delete action keyed by account.
- Evidence: accounts route exports only GET (route.ts:42)

## GAP-F086-08-05

**Web disconnect confirmation and empty state not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-08](../../20-features/086-security-and-connected-access-settings/F086-08-connected-accounts-and-their-granted-permissions.md)
- Detail: Affects: Web, Desktop.. Work needed: Check the settings component that calls onDisconnectConnector; add confirmation if missing (AGENTS.md section 9 requires it for irreversible actions).
- Evidence: useConnectorsSettingsAdapter.tsx:998-1058 has no confirm

## GAP-F086-08-NOTBUILT

**Connected accounts and their granted permissions: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F086-08](../../20-features/086-security-and-connected-access-settings/F086-08-connected-accounts-and-their-granted-permissions.md)
- Requirement items: S86.12, S86.13
- Detail: Mobile: S86.13; Chrome: S86.12, S86.13

## GAP-F086-09-01

**No security notice or email when a key is created or revoked.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-09](../../20-features/086-security-and-connected-access-settings/F086-09-api-keys.md)
- Detail: Affects: Web, Desktop, CLI users.. Work needed: Call emitIdentitySecurityEvent from both routes.
- Evidence: apps/web/lib/server/__tests__/security-event-coverage.test.ts:56-66

## GAP-F086-09-02

**Key rotation exists in the service but nothing reaches it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-09](../../20-features/086-security-and-connected-access-settings/F086-09-api-keys.md)
- Detail: Affects: Developers wanting rotation.. Work needed: Add a route and a control, or remove the code (AGENTS.md section 9).
- Evidence: apps/web/lib/services/api-key-service.ts:145

## GAP-F086-09-03

**Wording differs: web 'Delete', API and CLI 'revoke'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-09](../../20-features/086-security-and-connected-access-settings/F086-09-api-keys.md)
- Detail: Affects: All users of this feature.. Work needed: Pick one term.
- Evidence: ApiKeys.tsx:730-746; [keyId]/route.ts:66

## GAP-F086-09-04

**No API key view on phone or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-09](../../20-features/086-security-and-connected-access-settings/F086-09-api-keys.md)
- Detail: Affects: Phone and Chrome users.. Work needed: Decide whether needed; a developer feature may stay web and CLI only.
- Evidence: brief S86.14

## GAP-F086-09-NOTBUILT

**API keys: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F086-09](../../20-features/086-security-and-connected-access-settings/F086-09-api-keys.md)
- Requirement items: S86.14
- Detail: Mobile: S86.14; Chrome: S86.14

## GAP-F086-10-01

**A never-configured cloud account is treated as Skip approvals, and the panel labels it Default; this conflicts with the fail-closed rule and the draft's statement that the default is Ask.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-10](../../20-features/086-security-and-connected-access-settings/F086-10-agent-approval-rules.md)
- Detail: Affects: New web, Desktop and phone Cloud accounts.. Work needed: Product decision; if Ask is intended, change the constant and add a test for an unset account.
- Evidence: apps/web/shared/types/toolApprovalPolicy.ts:23-45; packages/contracts/types/src/tool-approval-policy.ts:13

## GAP-F086-10-02

**No one action withdraws every optional grant.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-10](../../20-features/086-security-and-connected-access-settings/F086-10-agent-approval-rules.md)
- Detail: Affects: All surfaces.. Work needed: Decision on whether to build.
- Evidence: S86.25 brief (not applicable)

## GAP-F086-10-03

**CLI, VS Code and Chrome vocabularies differ and their settings UI was not opened, so parity with the three account policies is unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-10](../../20-features/086-security-and-connected-access-settings/F086-10-agent-approval-rules.md)
- Detail: Affects: CLI, VS Code, Chrome.. Work needed: Map and test each.
- Evidence: apps/cli/src/onboarding.rs:737-772; localRuntimeClient.ts:978

## GAP-F086-10-04

**The phone history is read-only; removal of remembered approvals on the phone goes through connector detail only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-10](../../20-features/086-security-and-connected-access-settings/F086-10-agent-approval-rules.md)
- Detail: Affects: Phone.. Work needed: Confirm sufficiency against S86.23.
- Evidence: ApprovalHistory.tsx:14-50; ConnectorDetailScreen.tsx:540-547

## GAP-F086-10-05

**Drafted citations for CLI agent and VS Code settings protocol do not hold approval code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-10](../../20-features/086-security-and-connected-access-settings/F086-10-agent-approval-rules.md)
- Detail: Affects: Documentation accuracy.. Work needed: Use the corrected paths in this page.
- Evidence: apps/cli/src/agent/mod.rs:1552; settingsProtocol.ts:76

## GAP-F086-11-01

**No dedicated screen-sharing preference (S86.22).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-11](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)
- Detail: Affects: Desktop users.. Work needed: Add a Screen row with purpose text, or restate the requirement.
- Evidence: DesktopPermissionsSection.tsx:48-85; screenshot.ts:39-50

## GAP-F086-11-02

**Folder access differs per surface: Desktop list with removal, CLI per-session add-dir; no shared list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-11](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)
- Detail: Affects: Desktop, CLI.. Work needed: Decide if CLI folders should persist and show in Desktop.
- Evidence: LocalAccessSection.tsx; claude_parity.rs:332-380

## GAP-F086-11-03

**Draft evidence for the CLI folder control (tui_app.rs:3868) is wrong.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-11](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)
- Detail: Affects: Documentation.. Work needed: Use corrected paths.
- Evidence: apps/cli/src/tui/tui_app.rs:3850-3890

## GAP-F086-11-04

**Empty state, waiting state and plan limits for the Folders list are not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-11](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)
- Detail: Affects: Desktop.. Work needed: Read the empty branch and add a test.
- Evidence: LocalAccessSection.tsx

## GAP-F086-11-05

**macOS-only explanation; no equivalent on other platforms.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-11](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)
- Detail: Affects: Windows and Linux Desktop.. Work needed: Check platform behaviour.
- Evidence: screenshot.ts:40

## GAP-F086-12-01

**Restricted state is shown as denied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-12](../../20-features/086-security-and-connected-access-settings/F086-12-phone-microphone-and-camera.md)
- Detail: Affects: Phone users with managed devices.. Work needed: Map restricted separately and explain.
- Evidence: registry.ts:45-49

## GAP-F086-12-02

**Draft cited detail.tsx; the real file is Detail.tsx, with different line numbers.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-12](../../20-features/086-security-and-connected-access-settings/F086-12-phone-microphone-and-camera.md)
- Detail: Affects: Documentation.. Work needed: Use corrected paths.
- Evidence: apps/mobile/src/features/settings/permissions/Detail.tsx

## GAP-F086-12-03

**No evidence that the voice feature handles a denied microphone with a guiding message outside Settings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F086-12](../../20-features/086-security-and-connected-access-settings/F086-12-phone-microphone-and-camera.md)
- Detail: Affects: Phone voice users.. Work needed: Check the voice path.
- Evidence: not opened
