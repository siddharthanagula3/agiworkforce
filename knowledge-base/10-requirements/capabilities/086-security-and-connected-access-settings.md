---
id: "REQ-AREA-086"
type: "requirements"
title: "Requirement items: Security and connected-access settings"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 86. Security and connected-access settings

26 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S86.01

**Authentication methods.** The user can see every way they can sign in (password, passkeys, social/SSO identities) and add or remove methods.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F086-01 Sign-in methods and password](../../20-features/086-security-and-connected-access-settings/F086-01-sign-in-methods-and-password.md)
- Competitor trace: CAP-account-and-sign-in-26

## S86.02

**Password management.** The user can change their password (with the current password or a recent re-authentication) and reset a forgotten one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Seen in a real run: Web UI_ONLY
- Feature: [F086-01 Sign-in methods and password](../../20-features/086-security-and-connected-access-settings/F086-01-sign-in-methods-and-password.md)
- Competitor trace: CAP-account-and-sign-in-02

## S86.03

**Passkeys.** The user can add, see, rename and remove passkeys for their account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing
- Seen in a real run: Web UI_ONLY
- Feature: [F086-02 Passkeys](../../20-features/086-security-and-connected-access-settings/F086-02-passkeys.md)
- Competitor trace: CAP-privacy-and-data-controls-22, CAP-account-and-sign-in-05

## S86.04

**Multifactor authentication.** The user can turn on a second factor that is then required when signing in, and turn it off.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Seen in a real run: Web UI_ONLY
- Feature: [F086-03 Two-step sign-in and recovery codes](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Competitor trace: CAP-privacy-and-data-controls-22, CAP-account-and-sign-in-06

## S86.05

**Recovery codes.** The user can view, download and regenerate recovery codes that let them back into the account if the second factor is lost.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F086-03 Two-step sign-in and recovery codes](../../20-features/086-security-and-connected-access-settings/F086-03-two-step-sign-in-and-recovery-codes.md)
- Competitor trace: CAP-privacy-and-data-controls-22, CAP-account-and-sign-in-06

## S86.06

**Active sessions.** The user can see their signed-in sessions (device, place, last active) and end any of them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing
- Seen in a real run: Web PASS
- Feature: [F086-05 Active sessions and sign-out](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Competitor trace: CAP-privacy-and-data-controls-21, CAP-account-and-sign-in-09, CAP-account-and-sign-in-11

## S86.07

**Trusted devices.** The user can see the devices trusted on the account (e.g. that skip extra checks or are linked) and remove trust.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Seen in a real run: Web BLOCKED
- Feature: [F086-06 Linked and remote devices](../../20-features/086-security-and-connected-access-settings/F086-06-linked-and-remote-devices.md)
- Competitor trace: CAP-privacy-and-data-controls-21, CAP-account-and-sign-in-09

## S86.08

**Remote paired devices.** The user can see devices paired for remote use (phone to desktop, browser to desktop) and unpair them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F086-06 Linked and remote devices](../../20-features/086-security-and-connected-access-settings/F086-06-linked-and-remote-devices.md)
- Competitor trace: CAP-account-and-sign-in-09

## S86.09

**Sign out current device.** The user can sign out of the current device or app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F086-05 Active sessions and sign-out](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Competitor trace: CAP-privacy-and-data-controls-21, CAP-account-and-sign-in-10, CAP-account-and-sign-in-23

## S86.10

**Sign out all devices.** One action signs the account out everywhere: every browser, app and device credential.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F086-05 Active sessions and sign-out](../../20-features/086-security-and-connected-access-settings/F086-05-active-sessions-and-sign-out.md)
- Competitor trace: CAP-privacy-and-data-controls-21, CAP-account-and-sign-in-10

## S86.11

**Security notifications.** The user is told about security-relevant events (new sign-in, password or 2FA change, new device) and can control how.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, VS Code missing, Chrome missing
- Feature: [F086-07 Security notices](../../20-features/086-security-and-connected-access-settings/F086-07-security-notices.md)
- Competitor trace: CAP-privacy-and-data-controls-24, CAP-account-and-sign-in-08, CAP-account-and-sign-in-26

## S86.12

**Connected accounts.** The user can see third-party accounts connected to AGI (connectors) and disconnect them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F086-08 Connected accounts and their granted permissions](../../20-features/086-security-and-connected-access-settings/F086-08-connected-accounts-and-their-granted-permissions.md)
- Competitor trace: CAP-privacy-and-data-controls-26

## S86.13

**Granted connector scopes.** For each connected account the user can see which permissions (scopes) were actually granted.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, Chrome missing
- Feature: [F086-08 Connected accounts and their granted permissions](../../20-features/086-security-and-connected-access-settings/F086-08-connected-accounts-and-their-granted-permissions.md)
- Competitor trace: CAP-privacy-and-data-controls-26

## S86.14

**API keys.** The user can create, see (masked) and revoke their API keys.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F086-09 API keys](../../20-features/086-security-and-connected-access-settings/F086-09-api-keys.md)
- Competitor trace: CAP-account-and-sign-in-24

## S86.15

**Personal access tokens.** The user can create and revoke personal access tokens distinct from API keys.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F086-09 API keys](../../20-features/086-security-and-connected-access-settings/F086-09-api-keys.md)

## S86.16

**Local folders.** The user can choose which local folders AGI may read or write, see the list, and remove access.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, CLI done
- Feature: [F086-11 Local folders, websites, apps, clipboard and screen](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)

## S86.17

**Browser sites.** The user can choose which websites AGI may read or act on and remove sites later.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F086-11 Local folders, websites, apps, clipboard and screen](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)
- Competitor trace: CAP-privacy-and-data-controls-33

## S86.18

**Computer applications.** The user can choose which desktop applications AGI may control and revoke that.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F086-11 Local folders, websites, apps, clipboard and screen](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)
- Competitor trace: CAP-privacy-and-data-controls-33

## S86.19

**Clipboard access.** The user controls whether AGI may read the clipboard, and can review or withdraw that permission.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F086-11 Local folders, websites, apps, clipboard and screen](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)

## S86.20

**Microphone access.** The user can see and change whether AGI may use the microphone.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F086-12 Phone microphone and camera](../../20-features/086-security-and-connected-access-settings/F086-12-phone-microphone-and-camera.md)

## S86.21

**Camera access.** The user can see and change whether AGI may use the camera.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F086-12 Phone microphone and camera](../../20-features/086-security-and-connected-access-settings/F086-12-phone-microphone-and-camera.md)

## S86.22

**Screen-sharing preferences.** The user can set preferences for screen capture/sharing (whether and how AGI may see the screen).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F086-11 Local folders, websites, apps, clipboard and screen](../../20-features/086-security-and-connected-access-settings/F086-11-local-folders-websites-apps-clipboard-and-screen.md)

## S86.23

**Saved approvals.** The user can review the approvals they chose to remember (always-allow/deny) and remove any of them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F086-10 Agent approval rules](../../20-features/086-security-and-connected-access-settings/F086-10-agent-approval-rules.md)
- Competitor trace: CAP-privacy-and-data-controls-26

## S86.24

**Default permission mode.** The user can set the default approval posture for agent actions (ask every time, auto-approve safe, autonomous) and it is enforced.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F086-10 Agent approval rules](../../20-features/086-security-and-connected-access-settings/F086-10-agent-approval-rules.md)

## S86.25

**Revoke all optional grants.** One action withdraws every optional permission granted to AGI (connectors, saved approvals, device grants, folders).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F086-10 Agent approval rules](../../20-features/086-security-and-connected-access-settings/F086-10-agent-approval-rules.md)

## S86.26

**Advanced/hardened account-security mode.** The user can turn on a hardened mode that tightens account and agent security beyond defaults.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F086-04 Advanced Account Security](../../20-features/086-security-and-connected-access-settings/F086-04-advanced-account-security.md)
- Competitor trace: CAP-privacy-and-data-controls-23, CAP-privacy-and-data-controls-25, CAP-account-and-sign-in-07
