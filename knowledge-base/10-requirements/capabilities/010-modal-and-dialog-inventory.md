---
id: "REQ-AREA-010"
type: "requirements"
title: "Requirement items: Modal and dialog inventory"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 10. Modal and dialog inventory

48 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S10.01

**Create Project.** A create-project dialog (or command) asks for a name and creates the project in the account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F010-01 Create and rename](../../20-features/010-modal-and-dialog-inventory/F010-01-create-and-rename.md)

## S10.02

**Rename conversation.** The user opens rename on a conversation, edits the title in a field or prompt, and the new title is saved.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F010-01 Create and rename](../../20-features/010-modal-and-dialog-inventory/F010-01-create-and-rename.md)

## S10.03

**Move conversation.** A move dialog or menu lets the user pick a project for a conversation and files it there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F010-02 Move and duplicate](../../20-features/010-modal-and-dialog-inventory/F010-02-move-and-duplicate.md)

## S10.04

**Duplicate resource.** A duplicate action creates an independent copy of a conversation or project and says where the copy is.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F010-02 Move and duplicate](../../20-features/010-modal-and-dialog-inventory/F010-02-move-and-duplicate.md)

## S10.05

**Archive confirmation.** Archiving asks to confirm, or confirms afterwards with a way to undo, and says where archived items can be found.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F010-03 Archive and delete](../../20-features/010-modal-and-dialog-inventory/F010-03-archive-and-delete.md)

## S10.06

**Delete confirmation.** Deleting asks for confirmation that names the item before anything is removed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F010-03 Archive and delete](../../20-features/010-modal-and-dialog-inventory/F010-03-archive-and-delete.md)

## S10.07

**Permanent-delete confirmation.** An irreversible delete says plainly that it cannot be undone and needs an explicit second confirmation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F010-03 Archive and delete](../../20-features/010-modal-and-dialog-inventory/F010-03-archive-and-delete.md)

## S10.08

**Share conversation.** A share dialog creates a link to the conversation, shows it for copying, and states who can open it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F010-04 Sharing links](../../20-features/010-modal-and-dialog-inventory/F010-04-sharing-links.md)

## S10.09

**Share file or folder.** The user can share a file (or folder) from their library with someone, by link or the system share sheet.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F010-04 Sharing links](../../20-features/010-modal-and-dialog-inventory/F010-04-sharing-links.md)

## S10.10

**Share artifact.** An artifact share dialog publishes it to a link, lets the user copy it and choose who can open it, and can take it down.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome unverified
- Feature: [F010-04 Sharing links](../../20-features/010-modal-and-dialog-inventory/F010-04-sharing-links.md)

## S10.11

**Publish generated application.** A publish dialog puts a generated app or page on a live URL and hands back the link.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome unverified
- Feature: [F010-04 Sharing links](../../20-features/010-modal-and-dialog-inventory/F010-04-sharing-links.md)

## S10.12

**Manage link access.** For a shared link the user can see its access (who, expiry) and change or revoke it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F010-04 Sharing links](../../20-features/010-modal-and-dialog-inventory/F010-04-sharing-links.md)

## S10.13

**Invite member.** An invite dialog takes an email and role, sends the invitation, and lists pending invites to revoke or renew.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Feature: [F010-05 Team and roles](../../20-features/010-modal-and-dialog-inventory/F010-05-team-and-roles.md)

## S10.14

**Change member role.** A role dialog changes a member's role after confirmation, and the server enforces the new role.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Feature: [F010-05 Team and roles](../../20-features/010-modal-and-dialog-inventory/F010-05-team-and-roles.md)

## S10.15

**Transfer ownership.** The owner picks another member and confirms, and ownership moves to them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing
- Feature: [F010-05 Team and roles](../../20-features/010-modal-and-dialog-inventory/F010-05-team-and-roles.md)

## S10.16

**Select sources.** A dialog lets the user choose which sources (sites, files, apps) an answer or research run may use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F010-06 Sources, uploads and screen share](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md)
- Competitor trace: CAP-research-04

## S10.17

**Upload from device.** Choosing upload opens the device file chooser and the picked files attach to the message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F010-06 Sources, uploads and screen share](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md)

## S10.18

**Connect external account.** A connect dialog starts the service's real authorization (OAuth or key) and ends with the account connected.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F010-07 Connectors, plugins and skills](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)

## S10.19

**Reauthorize connection.** An expired connection offers a reconnect dialog that re-runs authorization and keeps its settings.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done
- Feature: [F010-07 Connectors, plugins and skills](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)

## S10.20

**Select among connected accounts.** When a service has several connected accounts, a dialog lets the user pick which one to use or make default.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F010-07 Connectors, plugins and skills](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)

## S10.21

**Install Plugin.** An install dialog shows the plugin and installs it into the account or workspace.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F010-07 Connectors, plugins and skills](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)

## S10.22

**Review Plugin permissions.** Before installing or updating, a dialog lists the permissions the plugin requires and asks the user to accept them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F010-07 Connectors, plugins and skills](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)

## S10.23

**Update Plugin.** An update dialog offers a newer plugin version, shows what changes, and applies it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F010-07 Connectors, plugins and skills](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)

## S10.24

**Skill import.** An import dialog takes a skill file or package and adds a usable skill.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F010-07 Connectors, plugins and skills](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)

## S10.25

**Skill edit.** An edit dialog changes a skill's name, description and instructions and saves them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing, Chrome missing
- Feature: [F010-07 Connectors, plugins and skills](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)

## S10.26

**Model incompatibility warning.** Switching to a model that cannot handle the conversation (images, tools, context) warns and asks before switching.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code done, Chrome missing
- Feature: [F010-08 Model choice, usage limits and billing](../../20-features/010-modal-and-dialog-inventory/F010-08-model-choice-usage-limits-and-billing.md)

## S10.27

**Context-limit warning.** As a conversation nears or passes the model's context limit, the user gets a clear warning with what to do (trim, compact, new chat).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F010-08 Model choice, usage limits and billing](../../20-features/010-modal-and-dialog-inventory/F010-08-model-choice-usage-limits-and-billing.md)

## S10.28

**Usage-limit notice.** When a usage limit is reached, the user sees which limit, when it resets, and what they can do.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F010-08 Model choice, usage limits and billing](../../20-features/010-modal-and-dialog-inventory/F010-08-model-choice-usage-limits-and-billing.md)

## S10.29

**Credit-purchase dialog.** From where the limit is hit, a purchase dialog lets the user buy extra credits and completes payment.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial
- Feature: [F010-08 Model choice, usage limits and billing](../../20-features/010-modal-and-dialog-inventory/F010-08-model-choice-usage-limits-and-billing.md)

## S10.30

**Upgrade comparison.** An upgrade dialog compares plans (price, limits, features) before the user picks one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile partial
- Seen in a real run: Web PASS
- Feature: [F010-08 Model choice, usage limits and billing](../../20-features/010-modal-and-dialog-inventory/F010-08-model-choice-usage-limits-and-billing.md)

## S10.31

**Cancel subscription.** A cancel dialog lets the user cancel their subscription, says when access ends, and confirms.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile partial
- Feature: [F010-08 Model choice, usage limits and billing](../../20-features/010-modal-and-dialog-inventory/F010-08-model-choice-usage-limits-and-billing.md)

## S10.32

**Payment-method update.** A payment-method dialog lets the user add or replace the card on file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile partial
- Feature: [F010-08 Model choice, usage limits and billing](../../20-features/010-modal-and-dialog-inventory/F010-08-model-choice-usage-limits-and-billing.md)

## S10.33

**Reauthentication challenge.** Before a sensitive account action, a dialog asks the user to prove it is them (code or passkey) and only then proceeds.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F010-09 Identity check and sensitive actions](../../20-features/010-modal-and-dialog-inventory/F010-09-identity-check-and-sensitive-actions.md)

## S10.34

**Microphone permission explanation.** Before or when the microphone is first needed, the product explains why it wants it and what to do if access is refused.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile done, Chrome done
- Feature: [F010-10 Device permissions and approvals](../../20-features/010-modal-and-dialog-inventory/F010-10-device-permissions-and-approvals.md)

## S10.35

**Screen-sharing source selection.** When sharing the screen, the user picks which screen or window to share before anything is captured.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing
- Feature: [F010-06 Sources, uploads and screen share](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md)

## S10.36

**Computer-control permission.** Before the assistant first controls the computer or browser, a dialog says what it will be able to do and the user grants or refuses it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Chrome done
- Feature: [F010-10 Device permissions and approvals](../../20-features/010-modal-and-dialog-inventory/F010-10-device-permissions-and-approvals.md)

## S10.37

**Folder-access permission.** Before the assistant reads or writes a local folder, the user is asked to grant access to that folder.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, CLI done, VS Code done
- Feature: [F010-10 Device permissions and approvals](../../20-features/010-modal-and-dialog-inventory/F010-10-device-permissions-and-approvals.md)

## S10.38

**Tool-action approval.** When a tool action needs approval, a prompt shows the action and the user approves or denies that one call.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F010-10 Device permissions and approvals](../../20-features/010-modal-and-dialog-inventory/F010-10-device-permissions-and-approvals.md)

## S10.39

**Sensitive-data transfer approval.** Before private or sensitive data is sent to an outside destination, the user is asked to approve that transfer and told what goes where.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome done
- Feature: [F010-09 Identity check and sensitive actions](../../20-features/010-modal-and-dialog-inventory/F010-09-identity-check-and-sensitive-actions.md)

## S10.40

**Remote-device pairing.** A pairing dialog links a phone or another device to this machine by code or QR, bound to the signed-in account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile done, VS Code done
- Feature: [F010-10 Device permissions and approvals](../../20-features/010-modal-and-dialog-inventory/F010-10-device-permissions-and-approvals.md)

## S10.41

**Unsaved-changes warning.** Leaving an editor with unsaved edits warns the user and lets them keep editing or discard.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome missing
- Feature: [F010-11 Unsaved changes and conflicts](../../20-features/010-modal-and-dialog-inventory/F010-11-unsaved-changes-and-conflicts.md)

## S10.42

**Edit-conflict resolution.** When the same item was changed elsewhere, the user sees both versions and chooses which to keep (or merges).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F010-11 Unsaved changes and conflicts](../../20-features/010-modal-and-dialog-inventory/F010-11-unsaved-changes-and-conflicts.md)

## S10.43

**Export options.** An export dialog lets the user pick a format and exports the conversation or item to a file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F010-12 Export, feedback, privacy and account](../../20-features/010-modal-and-dialog-inventory/F010-12-export-feedback-privacy-and-account.md)

## S10.44

**Report-content dialog.** A report dialog lets the user flag an answer (with a reason) and the report reaches moderation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F010-12 Export, feedback, privacy and account](../../20-features/010-modal-and-dialog-inventory/F010-12-export-feedback-privacy-and-account.md)

## S10.45

**Feedback submission.** A feedback dialog, reachable product-wide, sends the user's message to the team's feedback store.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F010-12 Export, feedback, privacy and account](../../20-features/010-modal-and-dialog-inventory/F010-12-export-feedback-privacy-and-account.md)

## S10.46

**Diagnostic-sharing consent.** Before diagnostics or crash reports leave the device, the user is told what is included and chooses (or sets a preference that is honoured).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F010-12 Export, feedback, privacy and account](../../20-features/010-modal-and-dialog-inventory/F010-12-export-feedback-privacy-and-account.md)

## S10.47

**Data-export request.** A data-export dialog requests a copy of the account's data and delivers it as a download.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Feature: [F010-12 Export, feedback, privacy and account](../../20-features/010-modal-and-dialog-inventory/F010-12-export-feedback-privacy-and-account.md)

## S10.48

**Account-deletion request.** An account-deletion dialog explains what is deleted and requires explicit confirmation before deleting the account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F010-12 Export, feedback, privacy and account](../../20-features/010-modal-and-dialog-inventory/F010-12-export-feedback-privacy-and-account.md)
