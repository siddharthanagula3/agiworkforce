---
id: "AREA-010"
type: "area"
title: "Modal and dialog inventory"
features: ["F010-01", "F010-02", "F010-03", "F010-04", "F010-05", "F010-06", "F010-07", "F010-08", "F010-09", "F010-10", "F010-11", "F010-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 10. Modal and dialog inventory

Dialogs are the places where a person makes a choice that matters: naming or moving a chat, sharing a link, inviting a teammate, allowing the assistant to touch the computer, buying more usage, or deleting something. A good dialog says what will happen, names the item, asks before anything irreversible, and explains what to do next when a limit or error stops the action. This area is the shared set of those dialogs across the six apps, so the same action feels the same wherever the person is.

**Who uses it.** Every signed-in user meets the everyday dialogs (rename, archive, delete, share, upload, feedback, export, privacy). Workspace owners and admins use the team dialogs (invite, role change, transfer ownership). Paid or upgrading users reach the usage, credit and billing dialogs, and paid upgrades are currently gated behind a waitlist or access code (apps/web/lib/server/billing-waitlist-access.ts:22-60). Developers and terminal users reach the CLI and VS Code variants. Sensitive actions require a fresh identity check for any signed-in user (apps/web/features/auth/StepUpDialog.tsx:103).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F010-01](F010-01-create-and-rename.md) | Create and rename | built | built | built | built | partly | partly |
| [F010-02](F010-02-move-and-duplicate.md) | Move and duplicate | built | built | built | partly | partly | partly |
| [F010-03](F010-03-archive-and-delete.md) | Archive and delete | built | built | built | built | built | partly |
| [F010-04](F010-04-sharing-links.md) | Sharing links | built | built | built | partly | no | partly |
| [F010-05](F010-05-team-and-roles.md) | Team and roles | built | built | partly | no | n/a | n/a |
| [F010-06](F010-06-sources-uploads-and-screen-share.md) | Sources, uploads and screen share | built | built | partly | partly | partly | partly |
| [F010-07](F010-07-connectors-plugins-and-skills.md) | Connectors, plugins and skills | partly | built | partly | partly | no | no |
| [F010-08](F010-08-model-choice-usage-limits-and-billing.md) | Model choice, usage limits and billing | partly | partly | partly | partly | built | partly |
| [F010-09](F010-09-identity-check-and-sensitive-actions.md) | Identity check and sensitive actions | built | built | built | no | n/a | built |
| [F010-10](F010-10-device-permissions-and-approvals.md) | Device permissions and approvals | partly | partly | built | built | built | built |
| [F010-11](F010-11-unsaved-changes-and-conflicts.md) | Unsaved changes and conflicts | built | built | partly | built | no | no |
| [F010-12](F010-12-export-feedback-privacy-and-account.md) | Export, feedback, privacy and account | built | built | built | partly | partly | partly |

Requirement items for this area: [10-requirements/capabilities/010-modal-and-dialog-inventory.md](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md).

## How this area works in the code

1. **Menu or button opens a dialog.** The person picks archive, delete, or another action in a row or chat menu. The web shell asks for a delete confirmation through the shared hook, after the menu closes. (`apps/web/shared/components/layout/WebAppShell.tsx:189`, `apps/web/shared/components/layout/WebAppShell.tsx:295-305`)
2. **Shared confirm primitive.** useConfirmAction records which element had focus at the moment of the request, so focus returns there on cancel. It shows an alert dialog with the title, description and confirm label, and runs the action only on confirm. (`packages/ui/ui/src/primitives/ConfirmAction.tsx:44-60`)
3. **Copy names the item and the consequence.** The delete copy names the chat or project and says what survives (generated media stays in the library; schedules are not named because they cannot be linked to a chat). Archive shows a toast with Undo and View archived. (`apps/web/shared/components/layout/sidebar-session-actions.ts:50-80 (archive toast and undo)`, `apps/web/shared/components/layout/sidebar-session-actions.ts:80-120 (delete and project delete copy)`)
4. **Request goes to the server.** The confirmed action calls the server. The brief places the delete request at the conversation route; the code comment says it stamps deleted_at on the conversation and does not erase it. Archive on mobile is a server write to the archived column and is limited to Cloud chats. (`apps/web/app/api/chat/conversations/[id]/route.ts:269`, `apps/mobile/src/features/conversation-actions/useConversationActions.ts:110-130`)
5. **Sensitive actions need a fresh identity check.** For owner transfer and similar actions the page opens a step-up dialog (email code or passkey). The server route also calls requireStepUp before it changes anything, so the check cannot be skipped in the browser. (`apps/web/features/auth/StepUpDialog.tsx:103-130`, `apps/web/app/api/settings/organization/transfer-ownership/route.ts:21-50`)
6. **Paid upgrade gate.** Paid upgrade and checkout paths first ask whether billing is open for this user. It is open if the forced environment switch is set or the run-time flag is on. Otherwise the user needs a redeemed beta record. (`apps/web/lib/server/billing-waitlist-access.ts:22-60`)
7. **Desktop permission question.** The desktop app asks once per capability and scope, records the answer, and joins any identical open question so the person does not see stacked dialogs. (`apps/desktop/electron/runtime/permissionManager.ts:313-340`)
8. **Browser extension site consent.** The extension stores the sites the person allowed for browser control in extension storage, and checks both that stored consent and the browser's host permission before acting on a site. Account pages are always refused. (`apps/extension/src/features/computer-use/browserControlConsent.ts:125-170`)
9. **Unsaved-changes guard.** Editors register as dirty. Clicking an in-app link or closing the page is intercepted while any editor has unsaved edits, and the shared prompt offers keep editing or discard. (`packages/ui/ui/src/primitives/UnsavedChanges.tsx:1-60`)

## Files to know

| File | Role |
|---|---|
| `packages/ui/ui/src/primitives/ConfirmAction.tsx` | Shared confirm hook used by web, desktop and the unified chat components for anything the person cannot undo. |
| `apps/web/shared/components/layout/sidebar-session-actions.ts` | Archive toast with Undo, and the delete and project-delete confirmation copy. |
| `apps/web/shared/components/layout/WebAppShell.tsx` | Wires the sidebar's delete and archive actions to the confirm hook and the server calls. |
| `apps/mobile/src/features/conversation-actions/useConversationActions.ts` | Mobile archive, undo, rename and delete actions for chats, with account ownership checks. |
| `apps/web/features/auth/StepUpDialog.tsx` | Identity check dialog (email code or passkey) before sensitive account actions. |
| `apps/web/app/api/settings/organization/transfer-ownership/route.ts` | Server route for owner transfer; enforces the step-up check, admin access and the one-owner rule. |
| `apps/web/lib/server/billing-waitlist-access.ts` | Decides whether paid upgrades are open to a user, or whether a waitlist or access code is needed. |
| `apps/desktop/electron/runtime/permissionManager.ts` | Desktop permission questions: asks once, records the answer, lists and revokes stored decisions. |
| `apps/extension/src/features/computer-use/browserControlConsent.ts` | Browser extension per-site consent for computer control, stored in extension storage. |
| `packages/ui/ui/src/primitives/UnsavedChanges.tsx` | Shared unsaved-changes guard for links and page close. |
| `apps/cli/src/lib.rs` | CLI commands, including the confirmation prompt on share revoke that a --yes flag skips. |

## What is stored

- Conversation deleted marker (deleted_at) and archived flag on web conversations: Database table web_conversations (named in apps/mobile/src/features/conversation-actions/useConversationActions.ts:110-118 and apps/web/shared/components/layout/sidebar-session-actions.ts delete comment)
- Project deleted marker; project source bytes erased on delete; knowledge files soft-deleted: Database, via the project delete route (described in sidebar-session-actions.ts project-delete comment; route file not opened)
- Media assets generated in a chat (kept after chat delete; link to conversation set to null): Database table media_assets (per the comment in apps/web/shared/components/layout/sidebar-session-actions.ts)
- Paid-upgrade access grant: a redeemed beta record and an invite of kind billing_upgrade_access: Database tables beta_redemptions and beta_invites (apps/web/lib/server/billing-waitlist-access.ts:1-60)
- Organization member rows and ownership transfer: Database, members table of the organization, written inside a transaction with an advisory lock (apps/web/app/api/settings/organization/transfer-ownership/route.ts:40-60)
- Desktop permission decisions (capability, scope, duration, time decided): Desktop local store, read by apps/desktop/electron/runtime/permissionManager.ts:313-340; storage backend not opened
- Browser control consent list (approved site origins): Browser extension storage under BROWSER_CONTROL_CONSENT_STORAGE_KEY (apps/extension/src/features/computer-use/browserControlConsent.ts:125-170)
- Mobile feature flags for billing and the v1 surface: apps/mobile/lib/v1FeatureFlags.ts (file read only by name in brief; contents not opened)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_BILLING_WAITLIST_OPEN**: When set to 1 it forces paid upgrades open for everyone; when unset the waitlist gate depends on the run-time flag and access codes. (apps/web/lib/server/billing-waitlist-access.ts:22-30 (read from process.env))
- **Billing upgrades open run-time flag**: Operator switch that opens or closes paid upgrades without a deploy, per user. (apps/web/lib/server/billing-waitlist-access.ts:6 imports readBillingUpgradesOpen from apps/web/lib/feature-flags/billing-upgrade-gate (that file was not opened))
- **v1 feature flags on mobile (billing and the waitlist hold)**: Controls whether mobile shows plan prices and purchase actions (brief note S10.30). (apps/mobile/lib/v1FeatureFlags.ts:6 (per brief; not opened))
- **Plan gate: deletion blocked by plan**: Account deletion shows a blocker instead of the delete button when the plan blocks it. (apps/web/features/settings/sections/AccountSection.tsx:415-420)
- **Plan gate: free plans never show usage meters**: Usage screens show only an upgrade action on free plans (owner rule; see the usage notice items). (Not verified in code during this read.)

## Shared between apps

Shared across apps: the confirm hook packages/ui/ui/src/primitives/ConfirmAction.tsx (used by web, desktop and the unified chat components in packages/ui/unified-chat), the unsaved-changes guard packages/ui/ui/src/primitives/UnsavedChanges.tsx, the chat sidebar row in packages/ui/ui/src/sidebar/SessionItem.tsx, and the tool-approval card packages/ui/unified-chat/src/components/ToolCallCard.tsx. Web and desktop share most of the web shell and the sidebar copy. Separate per app: mobile (apps/mobile/src/features/...) has its own action hooks, sheets and toasts; the CLI (apps/cli/src/lib.rs, apps/cli/src/tui/...) is Rust and has its own prompts; VS Code (apps/extension-vscode/src/core/commandSetup.ts) has its own commands; the Chrome extension (apps/extension/src/...) has its own consent storage and panels. Shared server routes under apps/web/app/api serve web, desktop and mobile.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Delete copy says the conversation 'cannot be undone', but the server comment says the delete only stamps deleted_at on the row. If a restore path exists the copy is too strong; if not, the comment is misleading. Not resolved in this read. (apps/web/shared/components/layout/sidebar-session-actions.ts (conversationDeleteConfirm and the comment above it); apps/web/app/api/chat/conversations/[id]/route.ts:269)
- Brief lists permanent delete as done on web, desktop, mobile, CLI and VS Code, but the code opened only shows the single delete confirm (with 'cannot be undone' copy). No separate second-step permanent-delete dialog was found. (apps/web/shared/components/layout/sidebar-session-actions.ts:80-100; apps/mobile/src/features/conversation-actions/useConversationActions.ts:137-143)
- Brief status for manage link access says CLI missing, but the CLI has a shares revoke command that asks for confirmation unless --yes is passed. (apps/cli/src/lib.rs:1250-1270 (SharesSubcommand::Revoke with --yes))
- Brief says mobile archive is 'done', but the code says archive exists only for Cloud chats; Local chats have no archive. Possibly intended, but it is a gap against 'every chat can be archived'. (apps/mobile/src/features/conversation-actions/useConversationActions.ts:110-116)
- Brief marks the connector reconnect flow as partial on web, pending a live check with a revoked Google Drive grant. (Brief S10.19 (unfinished note); packages/ui/ui/src/directory/ConnectorDetailView.tsx:293)

## Not established

- Whether a separate permanent-delete path exists on any app; only the delete confirm was seen.
- The contents of the project delete route, the conversation delete route body, and whether soft-deleted chats can be restored.
- Exact line numbers for most citations were taken from the brief or from surrounding output, not re-counted; the file paths were confirmed to exist.
- The plan-by-plan limits for credits, upgrades and usage meters were not traced to plan tables.
- Whether Local-mode and own-key chats get the same share, publish and archive dialogs as Cloud chats; the three-mode split was not traced per dialog.
- Mobile and VS Code status values are from the brief; only a few were checked in code.
- The desktop permission store backend and the feature flag file apps/web/lib/feature-flags/billing-upgrade-gate were not opened.
- Whether the waitlist hold is currently on in production; this needs the owner's configuration, not the code.
- No tests, builds, installs or servers were run, per the read-only instruction; no localhost run was done.
