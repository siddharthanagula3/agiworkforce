---
id: "GAPS-AREA-010"
type: "gap-list"
title: "Gaps: Modal and dialog inventory"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 10. Modal and dialog inventory

72 open gaps that touch this area. Area page: [20-features/010-modal-and-dialog-inventory](../../20-features/010-modal-and-dialog-inventory/README.md).

## CMP-WP178

**Deep research reads your connected apps**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md), [F010-06](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md), [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Detail: Only 13 connectors are released (airtable, canva, clickup, cloudflare, confluence, datadog, jira, linear, monday, notio… The research loop does read connected apps (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2818), but only 13 connectors are released (airtable, canva, clickup, cloudflare, confluence, datadog, jira, linear, monday, notion, posthog, sentry, todoist: packages/contracts/types/src/connec
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2812-2842

## CMP-WP80

**Research uses connected apps**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md), [F010-06](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md), [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md), [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Detail: Research can include connectors, but connectors are mostly Coming soon Research can include connectors, but connectors are mostly Coming soon.
- Evidence: apps/web/features/chat/components/research/ResearchActivity.tsx:218,313; packages/contracts/types/src/connector-release.ts:14

## GAP-AREA010-LW01

**Delete copy says the conversation 'cannot be undone', but the server comment says the delete only stamps deleted_at on the row. If a restore path exists the copy is too strong; if not, the comment is misleading. Not resolved in this read.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-010
- Detail: Area 10. Modal and dialog inventory
- Evidence: apps/web/shared/components/layout/sidebar-session-actions.ts (conversationDeleteConfirm and the comment above it); apps/web/app/api/chat/conversations/[id]/route.ts:269

## GAP-CAP-research-04

**Choose research sources: web, uploads, connected apps: Comparison marks connected-app research as Partial (WP80, WP178); the exact missing part was not read. Mobile has no source panel.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md), [F010-06](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md), [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Requirement items: S10.16, S35.05, S35.07, S35.08, S9.03
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-F010-01-01

**Typed text is not kept after a failed rename on web chat and mobile, and mobile project create closes before any result.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-01](../../20-features/010-modal-and-dialog-inventory/F010-01-create-and-rename.md)
- Detail: Affects: Web, desktop (Electron) and mobile users. Work needed: Keep the editor open on failure, show an inline error, retain the draft.
- Evidence: ConversationTitleMenu.tsx:93-103; apps/mobile/src/features/projects/useProjectEditor.ts:160-200

## GAP-F010-01-02

**VS Code has no session rename; Chrome has no project create.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-01](../../20-features/010-modal-and-dialog-inventory/F010-01-create-and-rename.md)
- Detail: Affects: VS Code and Chrome users. Work needed: Add the commands or record the exclusion in the surface matrix.
- Evidence: apps/extension-vscode/src/core/commandSetup.ts (only task-detail rename at 2712); apps/extension/src/features/cloud-bridge/projectsClient.ts:154

## GAP-F010-01-03

**Brief says VS Code and Chrome rename are missing; the code shows Chrome Rename exists and VS Code has a New Project command. The brief's line pointers are stale for CLI tui_app.rs and VS Code commandSetup.ts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-01](../../20-features/010-modal-and-dialog-inventory/F010-01-create-and-rename.md)
- Detail: Affects: Documentation readers. Work needed: Update the brief statuses.
- Evidence: apps/extension/src/side_panel.ts:12756; apps/extension-vscode/package.json:665

## GAP-F010-01-NOTBUILT

**Create and rename: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F010-01](../../20-features/010-modal-and-dialog-inventory/F010-01-create-and-rename.md)
- Requirement items: S10.02
- Detail: VS Code: S10.02; Chrome: S10.02

## GAP-F010-01-PARTLY

**Create and rename: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F010-01](../../20-features/010-modal-and-dialog-inventory/F010-01-create-and-rename.md)
- Requirement items: S10.01

## GAP-F010-02-01

**The brief says mobile Move and Duplicate are missing; the code has both. The brief's mobile statuses are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-02](../../20-features/010-modal-and-dialog-inventory/F010-02-move-and-duplicate.md)
- Detail: Affects: Documentation, testers. Work needed: Update the brief and surface matrix.
- Evidence: apps/mobile/src/features/conversation-actions/useConversationActions.ts:205-285

## GAP-F010-02-02

**Duplicate on web is called 'Duplicate as branch'; whether it tells the person where the copy is was not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-02](../../20-features/010-modal-and-dialog-inventory/F010-02-move-and-duplicate.md)
- Detail: Affects: Web and desktop. Work needed: Read createBranch outcome handling and add a clear 'opened copy' message if absent.
- Evidence: ConversationTitleMenu.tsx:184-190; WebChatPage.tsx:7414-7425

## GAP-F010-02-03

**Chrome has no duplicate; CLI and VS Code have no move of a session into a project.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-02](../../20-features/010-modal-and-dialog-inventory/F010-02-move-and-duplicate.md)
- Detail: Affects: Chrome, CLI, VS Code. Work needed: Decide whether to build or record as not applicable.
- Evidence: apps/extension/src/side_panel.ts:12700-12770; apps/cli/src/lib.rs:1323-1327

## GAP-F010-02-NOTBUILT

**Move and duplicate: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F010-02](../../20-features/010-modal-and-dialog-inventory/F010-02-move-and-duplicate.md)
- Requirement items: S10.03
- Detail: CLI: S10.03; VS Code: S10.03

## GAP-F010-03-01

**No second explicit confirmation exists for any permanent delete path read; the brief expects one.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-03](../../20-features/010-modal-and-dialog-inventory/F010-03-archive-and-delete.md)
- Detail: Affects: All apps. Work needed: Decide the real model (soft delete only vs true purge) and add a second confirm where purge exists.
- Evidence: sidebar-session-actions.ts:100-110; apps/cli/src/lib.rs:5800-5812; commandSetup.ts:1426-1450

## GAP-F010-03-02

**Web delete copy says it cannot be undone while the chat is restorable for 30 days; mobile Cloud copy says it is restorable.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-03](../../20-features/010-modal-and-dialog-inventory/F010-03-archive-and-delete.md)
- Detail: Affects: Web and desktop (Electron) users. Work needed: Make copy match the soft-delete behaviour.
- Evidence: sidebar-session-actions.ts:100-110; DeletedChatsSection.tsx:60

## GAP-F010-03-03

**CLI and local mobile deletes remove data without a Trash step.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-03](../../20-features/010-modal-and-dialog-inventory/F010-03-archive-and-delete.md)
- Detail: Affects: CLI, mobile Local. Work needed: Route removals through a recoverable step.
- Evidence: apps/cli/src/lib.rs:5814-5818; useConversationActions.ts:310-315; doc: AGENTS.md section 9

## GAP-F010-03-04

**Chrome has no Undo toast on archive (confirmation first instead) and brief marks Chrome archive missing though it exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-03](../../20-features/010-modal-and-dialog-inventory/F010-03-archive-and-delete.md)
- Detail: Affects: Chrome. Work needed: Update the brief; optionally add undo.
- Evidence: apps/extension/src/side_panel.ts:12400-12425

## GAP-F010-03-NOTBUILT

**Archive and delete: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F010-03](../../20-features/010-modal-and-dialog-inventory/F010-03-archive-and-delete.md)
- Requirement items: S10.05
- Detail: Chrome: S10.05

## GAP-F010-04-01

**No take-down control in the web artifact preview; it is in Settings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-04](../../20-features/010-modal-and-dialog-inventory/F010-04-sharing-links.md)
- Detail: Affects: Web and desktop (Electron). Work needed: Add Unpublish beside Copy link or point to it.
- Evidence: ArtifactPreview.tsx:3007-3045; PublishedArtifactsSection.tsx:93-100

## GAP-F010-04-02

**VS Code has no share or publish command found; the brief marks Chrome chat share missing though a Share row exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-04](../../20-features/010-modal-and-dialog-inventory/F010-04-sharing-links.md)
- Detail: Affects: VS Code, brief. Work needed: Update brief; decide VS Code scope.
- Evidence: apps/extension/src/side_panel.ts:12560-12610; apps/extension-vscode/src/core/commandSetup.ts

## GAP-F010-04-03

**CLI cannot create a chat share link, only list and revoke.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-04](../../20-features/010-modal-and-dialog-inventory/F010-04-sharing-links.md)
- Detail: Affects: CLI. Work needed: Add create or record as out of scope.
- Evidence: apps/cli/src/lib.rs:7349-7378

## GAP-F010-04-04

**Mobile chat share has no expiry choice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-04](../../20-features/010-modal-and-dialog-inventory/F010-04-sharing-links.md)
- Detail: Affects: Mobile. Work needed: Add expiry options if parity is required.
- Evidence: apps/mobile/src/features/shared-links/shareConversation.ts:17-30

## GAP-F010-04-NOTBUILT

**Sharing links: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F010-04](../../20-features/010-modal-and-dialog-inventory/F010-04-sharing-links.md)
- Requirement items: S10.08, S10.09, S10.11, S10.12
- Detail: CLI: S10.08, S10.09, S10.12; VS Code: S10.08, S10.09, S10.11, S10.12; Chrome: S10.08, S10.09, S10.12

## GAP-F010-04-PARTLY

**Sharing links: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F010-04](../../20-features/010-modal-and-dialog-inventory/F010-04-sharing-links.md)
- Requirement items: S10.10, S10.11

## GAP-F010-05-01

**CLI has no team administration commands.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-05](../../20-features/010-modal-and-dialog-inventory/F010-05-team-and-roles.md)
- Detail: Affects: CLI users. Work needed: Build commands or record as out of scope.
- Evidence: Command list in apps/cli/src/lib.rs searched for team and invite; only agent-team flags found (lib.rs:341)

## GAP-F010-05-02

**Brief marks mobile transfer missing and desktop transfer unlisted; code has transfer on mobile and web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-05](../../20-features/010-modal-and-dialog-inventory/F010-05-team-and-roles.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: apps/mobile/app/(app)/settings/workspace.tsx:175-210

## GAP-F010-05-03

**Mobile transfer is reached only by picking Owner in the role picker; its confirmation is the picker, not a dedicated dialog.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-05](../../20-features/010-modal-and-dialog-inventory/F010-05-team-and-roles.md)
- Detail: Affects: Mobile. Work needed: Confirm the ownership warning meets the brief's confirm rule.
- Evidence: workspace.tsx:270-290

## GAP-F010-05-NOTBUILT

**Team and roles: not built on Mobile, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI
- Features: [F010-05](../../20-features/010-modal-and-dialog-inventory/F010-05-team-and-roles.md)
- Requirement items: S10.13, S10.14, S10.15
- Detail: Mobile: S10.15; CLI: S10.13, S10.14, S10.15

## GAP-F010-06-01

**Web screen share: only the feedback screenshot is wired in the files read; the composer menu items in the shared AttachmentMenu have no found web consumer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-06](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md)
- Detail: Affects: Web and Electron desktop. Work needed: Find or build the composer entry, or correct the brief.
- Evidence: ComposerFeedbackDialog.tsx:53-71; packages/ui/unified-chat/src/components/AttachmentMenu.tsx:692,726; apps/web/features/chat/pages/WebChatPage.tsx (no import found)

## GAP-F010-06-02

**Sources are chosen only at research plan approval, not for every answer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-06](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Decide whether the brief's 'an answer' needs a general control.
- Evidence: ResearchActivity.tsx:459,676-690

## GAP-F010-06-03

**Brief says mobile sources are missing; mobile has them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-06](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md)
- Detail: Affects: Documentation. Work needed: Update brief.
- Evidence: apps/mobile/src/features/chat/components/research/ResearchPlanOptions.tsx:258-340

## GAP-F010-06-04

**Brief pointers to ChatComposerNew.tsx:1098/1832/1947/4919 and main.ts:642/652 do not match the screen-share code, which sits at main.ts:851-880.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-06](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md)
- Detail: Affects: Documentation. Work needed: Correct the code references.
- Evidence: apps/desktop/electron/main.ts:851-880

## GAP-F010-06-NOTBUILT

**Sources, uploads and screen share: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F010-06](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md)
- Requirement items: S10.16, S10.35
- Detail: Mobile: S10.16, S10.35; CLI: S10.16; VS Code: S10.16; Chrome: S10.16

## GAP-F010-07-01

**No way to pick or make default one of several connected accounts**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-07](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)
- Detail: Affects: Web, desktop, mobile, CLI users with several accounts per service. Work needed: Add a default-account write endpoint and a picker control on each surface
- Evidence: apps/web/app/api/connectors/[connectorId]/accounts/route.ts:44 (GET only); apps/web/features/connectors/components/ConnectorAccountSummary.tsx:112 (list only)

## GAP-F010-07-02

**Plugin permissions are shown only inside an install confirmation that exists when an install notice is set; update shows new permissions in the version picker, not in a required acceptance step**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-07](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)
- Detail: Affects: Web and desktop. Work needed: Require explicit acceptance of new permissions before an update applies
- Evidence: packages/ui/ui/src/directory/DirectoryPanel.tsx:405, :636

## GAP-F010-07-03

**Plugin install, permissions and update not built on mobile, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-07](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)
- Detail: Affects: Those three apps. Work needed: Decide scope per surface, then build
- Evidence: No DirectoryPanel or installations call under apps/mobile, apps/extension, apps/extension-vscode

## GAP-F010-07-04

**CLI has no connect or reconnect command, only a link in a tool notice, and plugin update is a git update without permission review**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-07](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)
- Detail: Affects: CLI users. Work needed: Add connect command; add review step to plugin update
- Evidence: apps/cli/src/lib.rs:1275, apps/cli/src/cloud/connectors.rs:26

## GAP-F010-07-05

**Web reconnect with a real revoked grant not live-checked**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-07](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)
- Detail: Affects: Web and Electron. Work needed: Run the live check
- Evidence: brief S10.19 Unfinished

## GAP-F010-07-06

**Skill import and edit missing on mobile, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-07](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)
- Detail: Affects: Those apps. Work needed: Build or mark not applicable
- Evidence: No skill editor found in apps/mobile/app (grep for skills returned only layout and reflect)

## GAP-F010-07-NOTBUILT

**Connectors, plugins and skills: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F010-07](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)
- Requirement items: S10.21, S10.22, S10.23, S10.24, S10.25
- Detail: Mobile: S10.21, S10.22, S10.23, S10.24, S10.25; CLI: S10.22; VS Code: S10.21, S10.22, S10.23, S10.24, S10.25; Chrome: S10.21, S10.22, S10.23, S10.24, S10.25

## GAP-F010-07-PARTLY

**Connectors, plugins and skills: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F010-07](../../20-features/010-modal-and-dialog-inventory/F010-07-connectors-plugins-and-skills.md)
- Requirement items: S10.19
- Detail: Web S10.19: live-check: with a revoked or expired OAuth grant (e.g. Google Drive), open Connectors on web and in Electron: Reconnect shows beside Disconnect and re-runs OAuth, settings and tool permissions persist, and chat shows the agi_reconnect card

## GAP-F010-08-01

**Web context warning has no trim, compact or new-chat actions**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-08](../../20-features/010-modal-and-dialog-inventory/F010-08-model-choice-usage-limits-and-billing.md)
- Detail: Affects: Web and Electron. Work needed: Add actions to the notice
- Evidence: apps/web/features/chat/components/Composer/model-compatibility.ts:183

## GAP-F010-08-02

**No model-switch compatibility warning on mobile, CLI, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-08](../../20-features/010-modal-and-dialog-inventory/F010-08-model-choice-usage-limits-and-billing.md)
- Detail: Affects: Those apps. Work needed: Add per-surface check using the shared catalog
- Evidence: Not found in apps/mobile chat, apps/cli src, apps/extension

## GAP-F010-08-03

**CLI has no plan usage-limit notice with reset time found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-08](../../20-features/010-modal-and-dialog-inventory/F010-08-model-choice-usage-limits-and-billing.md)
- Detail: Affects: CLI. Work needed: Confirm or add managed limit message
- Evidence: apps/cli/src/errors.rs:604 handles provider rate limits only

## GAP-F010-08-04

**Cancel and card change are not in-app dialogs**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-08](../../20-features/010-modal-and-dialog-inventory/F010-08-model-choice-usage-limits-and-billing.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Decide if the portal hand-off is acceptable; add own confirmation naming the end date
- Evidence: apps/web/features/settings/sections/BillingSection.tsx:327

## GAP-F010-08-05

**Purchase held by waitlist; mobile billing off**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-08](../../20-features/010-modal-and-dialog-inventory/F010-08-model-choice-usage-limits-and-billing.md)
- Detail: Affects: All apps. Work needed: Owner decision to open
- Evidence: doc: docs/product/commercial.md:24; apps/mobile/lib/v1FeatureFlags.ts:6

## GAP-F010-08-06

**Free-plan 'no meter' rule is not in project docs; VS Code renders a meter list**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-08](../../20-features/010-modal-and-dialog-inventory/F010-08-model-choice-usage-limits-and-billing.md)
- Detail: Affects: VS Code, Free users. Work needed: Check the VS Code meter against the rule
- Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3154

## GAP-F010-08-NOTBUILT

**Model choice, usage limits and billing: not built on Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, Chrome
- Features: [F010-08](../../20-features/010-modal-and-dialog-inventory/F010-08-model-choice-usage-limits-and-billing.md)
- Requirement items: S10.26, S10.27
- Detail: Mobile: S10.26; CLI: S10.26; Chrome: S10.26, S10.27

## GAP-F010-08-PARTLY

**Model choice, usage limits and billing: partly built on Web, Desktop, Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F010-08](../../20-features/010-modal-and-dialog-inventory/F010-08-model-choice-usage-limits-and-billing.md)
- Requirement items: S10.29, S10.30, S10.31, S10.32
- Detail: Web S10.29: owner-held (lead ruling 2026-09-28): the billing waitlist stays on by owner decision; paid checkout, portal and store purchases need a redeemed access code. aaae88832e added AGI_BILLING_WAITLIST_OPEN, which stays unset at deploy until the owner opens paid upgrades | Desktop S10.29: owner-held (lead ruling 2026-09-28): the billing waitlist stays on by owner decision; paid checkout, portal and store purchases need a redeemed access code. aaae88832e added AGI_BILLING_WAITLIST_OPEN, which stays unset at deploy until the owner opens paid upgrades | Mobile S10.29: Owner and switch-on: waitlist hold plus MOBILE_IAP_ENABLED and store products. | Mobile S10.30: Owner: plan prices and pick action depend on FEATURES.billing and the native product list (waitlist hold). | Mobile S10.31: D-2026-09-28-27: cancellation links out to the store or web billing. | Mobile S10.32: D-2026-09-28-27:

## GAP-F010-09-01

**Mobile modal has no passkey option**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-09](../../20-features/010-modal-and-dialog-inventory/F010-09-identity-check-and-sensitive-actions.md)
- Detail: Affects: Mobile users with passkeys. Work needed: Add passkey prompt
- Evidence: apps/mobile/src/features/auth/components/StepUpModal.tsx:14

## GAP-F010-09-02

**Egress approval names destination but not the data**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-09](../../20-features/010-modal-and-dialog-inventory/F010-09-identity-check-and-sensitive-actions.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Include data kinds in the summary
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1079

## GAP-F010-09-03

**CLI has no sensitive-data transfer approval**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-09](../../20-features/010-modal-and-dialog-inventory/F010-09-identity-check-and-sensitive-actions.md)
- Detail: Affects: CLI. Work needed: Add overlay rule
- Evidence: none found under apps/cli/src

## GAP-F010-09-04

**Chrome's approval policy is an always-ask list, not a private-data check**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-09](../../20-features/010-modal-and-dialog-inventory/F010-09-identity-check-and-sensitive-actions.md)
- Detail: Affects: Chrome. Work needed: Decide if Chrome needs a data egress rule
- Evidence: apps/extension/src/features/computer-use/approvalPolicy.ts:5

## GAP-F010-09-05

**Cloud account default tool policy is autonomous, so many sends do not ask unless the trifecta gate fires**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-09](../../20-features/010-modal-and-dialog-inventory/F010-09-identity-check-and-sensitive-actions.md)
- Detail: Affects: Cloud users. Work needed: Confirm this matches the product intent
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:13

## GAP-F010-09-NOTBUILT

**Identity check and sensitive actions: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F010-09](../../20-features/010-modal-and-dialog-inventory/F010-09-identity-check-and-sensitive-actions.md)
- Requirement items: S10.39
- Detail: CLI: S10.39

## GAP-F010-10-01

**Approvals offer scopes wider than one call; brief says one call**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-10](../../20-features/010-modal-and-dialog-inventory/F010-10-device-permissions-and-approvals.md)
- Detail: Affects: Web, desktop, CLI, VS Code. Work needed: Decide the rule; align copy
- Evidence: apps/cli/src/tui/widgets/approval_overlay.rs:104; packages/contracts/types/src/tool-approval-policy.ts:21

## GAP-F010-10-02

**Desktop Deny is session-only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-10](../../20-features/010-modal-and-dialog-inventory/F010-10-device-permissions-and-approvals.md)
- Detail: Affects: Desktop. Work needed: Offer a persistent refusal for all capabilities
- Evidence: apps/desktop/electron/runtime/permissionManager.ts:405

## GAP-F010-10-03

**Mobile pairing disabled in v1 and its copy is stale**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-10](../../20-features/010-modal-and-dialog-inventory/F010-10-device-permissions-and-approvals.md)
- Detail: Affects: Mobile. Work needed: Fix copy before switching on
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:16; ConnectionStateViews.tsx:122

## GAP-F010-10-04

**No microphone explanation on web or desktop**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-10](../../20-features/010-modal-and-dialog-inventory/F010-10-device-permissions-and-approvals.md)
- Detail: Affects: Web, Electron. Work needed: Add a short notice before the first request
- Evidence: apps/desktop/electron/runtime/permissionManager.ts:263

## GAP-F010-10-05

**Pairing absent on web, CLI and Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-10](../../20-features/010-modal-and-dialog-inventory/F010-10-device-permissions-and-approvals.md)
- Detail: Affects: Those apps. Work needed: Decide scope
- Evidence: none found

## GAP-F010-10-PARTLY

**Device permissions and approvals: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F010-10](../../20-features/010-modal-and-dialog-inventory/F010-10-device-permissions-and-approvals.md)
- Requirement items: S10.34

## GAP-F010-11-01

**Conflict dialog is for chat drafts only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-11](../../20-features/010-modal-and-dialog-inventory/F010-11-unsaved-changes-and-conflicts.md)
- Detail: Affects: Web, desktop. Work needed: Extend to other editable items or document the scope
- Evidence: apps/web/features/chat/components/DraftConflictDialog.tsx:62

## GAP-F010-11-02

**Mobile and VS Code and Chrome have no edit-conflict dialog**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-11](../../20-features/010-modal-and-dialog-inventory/F010-11-unsaved-changes-and-conflicts.md)
- Detail: Affects: Those apps. Work needed: Decide scope
- Evidence: none found

## GAP-F010-11-03

**No unsaved-changes guard on Chrome pages**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-11](../../20-features/010-modal-and-dialog-inventory/F010-11-unsaved-changes-and-conflicts.md)
- Detail: Affects: Chrome. Work needed: Add to options editors
- Evidence: none found in apps/extension

## GAP-F010-11-04

**CLI sync conflict is not a chooser**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-11](../../20-features/010-modal-and-dialog-inventory/F010-11-unsaved-changes-and-conflicts.md)
- Detail: Affects: CLI. Work needed: Add an interactive choice or document
- Evidence: apps/cli/src/sync.rs:401

## GAP-F010-11-NOTBUILT

**Unsaved changes and conflicts: not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F010-11](../../20-features/010-modal-and-dialog-inventory/F010-11-unsaved-changes-and-conflicts.md)
- Requirement items: S10.41, S10.42
- Detail: Mobile: S10.42; VS Code: S10.42; Chrome: S10.41, S10.42

## GAP-F010-12-01

**Web report has no reason selection**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-12](../../20-features/010-modal-and-dialog-inventory/F010-12-export-feedback-privacy-and-account.md)
- Detail: Affects: Web, Electron. Work needed: Add a category and note dialog like mobile
- Evidence: apps/web/features/chat/components/messages/MessageBubble.tsx:1182

## GAP-F010-12-02

**Export, report, deletion missing on several apps**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-12](../../20-features/010-modal-and-dialog-inventory/F010-12-export-feedback-privacy-and-account.md)
- Detail: Affects: VS Code, Chrome, CLI as listed. Work needed: Decide per surface
- Evidence: none found

## GAP-F010-12-03

**Chrome has no diagnostics choice**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-12](../../20-features/010-modal-and-dialog-inventory/F010-12-export-feedback-privacy-and-account.md)
- Detail: Affects: Chrome. Work needed: Add a choice or document that none is collected
- Evidence: apps/extension/src/features/privacy/dataHandling.ts:17

## GAP-F010-12-04

**CLI product analytics defaults on**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-12](../../20-features/010-modal-and-dialog-inventory/F010-12-export-feedback-privacy-and-account.md)
- Detail: Affects: CLI. Work needed: Confirm against 'sends nothing when off' and default policy
- Evidence: apps/cli/src/config.rs:89

## GAP-F010-12-05

**Mobile deletion has no typed confirmation**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F010-12](../../20-features/010-modal-and-dialog-inventory/F010-12-export-feedback-privacy-and-account.md)
- Detail: Affects: Mobile. Work needed: Decide if the alert plus identity check is enough
- Evidence: apps/mobile/src/features/settings/cloud-account/deleteAccountConfirmation.ts:13

## GAP-F010-12-NOTBUILT

**Export, feedback, privacy and account: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F010-12](../../20-features/010-modal-and-dialog-inventory/F010-12-export-feedback-privacy-and-account.md)
- Requirement items: S10.43, S10.44, S10.45, S10.47, S10.48
- Detail: CLI: S10.44, S10.48; VS Code: S10.43, S10.44; Chrome: S10.43, S10.44, S10.45, S10.47, S10.48
