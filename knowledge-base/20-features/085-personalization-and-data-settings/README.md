---
id: "AREA-085"
type: "area"
title: "Personalization and data settings"
features: ["F085-01", "F085-02", "F085-03", "F085-04", "F085-05", "F085-06", "F085-07", "F085-08", "F085-09", "F085-10", "F085-11", "F085-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 85. Personalization and data settings

This area is where a person controls what the assistant knows about them and what happens to their chats and data. It covers profile, custom instructions, reply style, saved memory, using past chats, keeping or not keeping chat history, deleting and exporting data, sharing links, and privacy choices about training and crash reports. A person needs it to trust the product: they decide what is remembered, what is kept, and how to remove it.

**Who uses it.** Every signed-in user on web, desktop, mobile, CLI, the VS Code extension and the Chrome extension, as the brief's per-app status shows. Some controls depend on plan: the web privacy screen reads the subscription and treats Free plan users differently (apps/web/features/settings/sections/PrivacySection.tsx:219-220, and the managedOnly flag on toggles). Workspace owners and members see workspace-scoped bulk delete (apps/web/features/settings/components/BulkConversationControls.tsx:95-100). Developers read the server routes and the turn-context code. The brief does not list a separate admin screen for this area.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F085-01](F085-01-profile-and-account-deletion.md) | Profile and account deletion | built | built | built | no | built | partly |
| [F085-02](F085-02-custom-instructions-and-reply-style.md) | Custom instructions and reply style | built | built | built | built | partly | no |
| [F085-03](F085-03-writing-style-sample.md) | Writing-style sample | built | built | no | n/a | no | no |
| [F085-04](F085-04-saved-memory.md) | Saved memory | built | built | partly | partly | partly | partly |
| [F085-05](F085-05-past-chat-reference.md) | Past-chat reference | built | built | built | no | no | built |
| [F085-06](F085-06-chat-history-and-temporary-chats.md) | Chat history and temporary chats | built | built | built | built | no | partly |
| [F085-07](F085-07-archived-and-deleted-chats.md) | Archived and deleted chats | built | built | built | partly | built | no |
| [F085-08](F085-08-shared-links.md) | Shared links | built | built | built | built | no | no |
| [F085-09](F085-09-data-export-and-history-import.md) | Data export and history import | partly | partly | partly | partly | no | no |
| [F085-10](F085-10-privacy-choices-training-crash-reports-feedback.md) | Privacy choices: training, crash reports, feedback | built | built | built | built | built | built |
| [F085-11](F085-11-browsing-access.md) | Browsing access | n/a | built | n/a | n/a | n/a | built |
| [F085-12](F085-12-clear-device-data-and-options-that-are-not-offered.md) | Clear device data, and options that are not offered | n/a | partly | built | no | no | n/a |

Requirement items for this area: [10-requirements/capabilities/085-personalization-and-data-settings.md](../../10-requirements/capabilities/085-personalization-and-data-settings.md).

## How this area works in the code

1. **1. The person changes a setting on a surface.** On web, the privacy screen reads the stored value and the subscription tier. Toggles save through a request authority that checks the owner and the screen is still current. Free plan users see the toggles marked for all plans, while some toggles are managed-only. (`apps/web/features/settings/sections/PrivacySection.tsx:219-220`, `apps/web/features/settings/sections/PrivacySection.tsx:35-37 (switches removed on purpose)`, `apps/web/features/settings/sections/PrivacySection.tsx:221-222 (savePrivacy path and request authority)`)
2. **2. Chat settings are held in the browser store.** The 'start new chats temporary' flag and other web settings live in a client store with a default of off. (`apps/web/shared/stores/web-settings-store.ts:71`, `apps/web/shared/stores/web-settings-store.ts:128`, `apps/web/shared/stores/web-settings-store.ts:159`)
3. **3. A chat turn is built with context.** For each message, the server decides which sources may be used: project files, past chats, and account memory. Temporary chats and organization policy remove sources. Memory is used only when memory is on and the chat is not temporary. (`apps/web/lib/services/turn-context-service.ts:186-196`, `apps/web/lib/services/turn-context-service.ts:93-104`, `apps/web/lib/services/turn-context-service.ts:223-236 (loaders and context resolution)`)
4. **4. Custom instructions and style are added.** The server reads the general and personalization settings, checks whether the project opts out, and writes a block of instructions into the prompt. (`apps/web/lib/server/user-identity.ts:205-215 (buildCustomInstructionsPreamble, two namespaces)`, `apps/web/lib/server/user-identity.ts (readProjectPersonalizationScope and formatPersonalizationBlock, below line 226; exact lines not re-read)`)
5. **5. Temporary and history rules apply when saving.** A chat marked temporary is not written to history on the free-plan save path. Search filters out temporary chats. (`apps/web/lib/server/persist-free-offering-user.ts:23-33`, `apps/web/app/api/search/route.ts:324-326`, `apps/web/app/api/search/route.ts:375`)
6. **6. Bulk and single deletes write soft deletes.** Delete all sets deleted_at on the account's active and archived chats in one statement. Restore clears it within 30 days. Single delete and restore go through the conversation data service. (`apps/web/app/api/chat/conversations/bulk/route.ts:29-30`, `apps/web/app/api/chat/conversations/bulk/route.ts:53-56`, `apps/web/features/settings/services/conversation-data-service.ts:131 (restore)`, `apps/web/features/settings/services/conversation-data-service.ts:181 (delete)`)
7. **7. Memory import runs in two passes.** The import route first runs a dry run, then a commit if asked. It checks the CSRF token and a rate limit first. (`apps/web/app/api/memory/import/route.ts:184 (handleImport)`)
8. **8. Account deletion checks billing first.** The delete route checks for an active paid subscription and for sole-owned workspaces. If either check cannot run, it stops and deletes nothing. (`apps/web/app/api/user/delete-account/route.ts:400-440`)
9. **9. Training opt-out gates background calls.** A background call that would send content to a provider checks the opt-out. A provider that keeps inputs out of training is always allowed. If the opt-out cannot be read, the call is blocked. (`apps/web/lib/server/side-call-training-policy.ts:19-24`, `apps/web/lib/server/side-call-training-policy.ts:31-40`)
10. **10. Mobile wipes device data.** The local wipe signs out, withdraws provider sharing on this device, and deletes local rows in one transaction. (`apps/mobile/services/dsarExport.ts:431-440`, `apps/mobile/src/features/settings/data-controls/index.tsx:371-376`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/settings/sections/PrivacySection.tsx` | Web privacy screen: toggles, temporary-chat switch, training choices, recently deleted, export row. |
| `apps/web/lib/services/turn-context-service.ts` | Decides per turn which memory, past chats and project context are sent, and removes temporary chats and withdrawn sources. |
| `apps/web/lib/server/user-identity.ts` | Builds the custom instructions and reply style block from stored settings and project opt-outs. |
| `apps/web/features/settings/components/BulkConversationControls.tsx` | Archive all and Delete all chats controls with the confirmation text. |
| `apps/web/app/api/chat/conversations/bulk/route.ts` | Server route for bulk archive and delete (soft delete with deleted_at). |
| `apps/web/features/settings/services/conversation-data-service.ts` | Client calls for restore, archive restore and delete of a single chat, and shared-link list. |
| `apps/web/app/api/memory/import/route.ts` | Memory import endpoint with dry-run and commit modes. |
| `apps/web/app/api/user/delete-account/route.ts` | Account deletion endpoint with billing and workspace checks. |
| `apps/web/lib/server/side-call-training-policy.ts` | Decides whether background provider calls may run given the training opt-out. |
| `apps/mobile/services/dsarExport.ts` | Mobile local data wipe and the export transcript builder. |
| `apps/mobile/src/features/settings/data-controls/index.tsx` | Mobile delete-all controls and confirmations for local and cloud chats. |
| `apps/cli/src/cloud/data_export.rs` | CLI client for the account data export archives. |

## What is stored

- Chats, with deleted_at (soft delete), archived, is_temporary and organization_id flags: Database table web_conversations (apps/web/app/api/chat/conversations/bulk/route.ts:53-56; apps/web/lib/server/persist-free-offering-user.ts:23-24)
- Context manifest for each turn (not written for temporary chats): Postgres via createPostgresContextManifestStore (apps/web/lib/services/turn-context-service.ts, manifest write block; table name not verified)
- Account settings: general and personalization namespaces (instructions, name, reply style): Settings namespace rows read by readIdentityNamespace and readSettingsNamespace in apps/web/lib/server/user-identity.ts (table name not verified)
- Project flags uses_account_instructions and uses_account_style: Database table user_projects (apps/web/lib/server/user-identity.ts readProjectPersonalizationScope)
- Web settings such as newChatsTemporary: Client store apps/web/shared/stores/web-settings-store.ts (persistence layer not verified)
- Extension site allowlist: Extension storage key agi_site_allowlist (apps/extension/src/features/options/site-allowlist.ts:64 comment)
- Mobile local data: telemetry_queue, memory_facts, custom_instructions, installed_models: Mobile on-device database (apps/mobile/services/dsarExport.ts:431 onward)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Start new chats temporary**: New chats are made temporary: not saved to history and not used for memory. Default off. (apps/web/shared/stores/web-settings-store.ts:71,128,159; read at apps/web/features/settings/sections/PrivacySection.tsx:219)
- **Only use models that do not train on your chats (keepOutOfProviderTraining)**: Keeps chats off free models whose terms may allow training. Default off. (PrivacySection.tsx TOGGLES list (near lines 46-60))
- **Use my chats to improve models (allowChatsForModelImprovement) and voice equivalent**: Model improvement consent. Default off. (PrivacySection.tsx MODEL_IMPROVEMENT_TOGGLES (near lines 60-70); provider opt-out read in apps/web/lib/server/provider-training-opt-out.ts)
- **Share crash and error reports (shareTelemetry)**: Off requests a telemetry opt-out immediately. Default off. (PrivacySection.tsx TOGGLES; apps/web/lib/sentry-shared.ts:81)
- **Account memory on or off, and past-chat search policy**: Turns memory and past-chat search on or off for a turn. Organization policy can also remove sources. (apps/web/lib/services/turn-context-service.ts:186-196 (policy.enabled, policy.searchPastChats, memoryEnabled, organizationContextPolicy))
- **Project uses account instructions / style**: A project can stop using account-wide instructions or reply style. (apps/web/lib/server/user-identity.ts readProjectPersonalizationScope (columns on user_projects))
- **Plan gate for web privacy controls**: Some controls show only on paid plans or are managed-only; Free plan users see a plan-specific description. (apps/web/features/settings/sections/PrivacySection.tsx:221-222 (hasHostedCloud from subscription and isFreeBillingPlanTier); toggle managedOnly flag)
- **Rate limit for chat conversation routes**: Limits bulk actions and memory import. (apps/web/app/api/memory/import/route.ts:184 onward (withRateLimit 'chat-conversation'); bulk/route.ts rate limit before body parse)
- **Browser access allowlist**: Sites the extension may act on. (apps/extension/src/features/options/site-allowlist.ts:84; apps/extension/src/options.ts:1100)

## Shared between apps

Shared across apps: the server routes under apps/web/app/api (for example bulk chat actions, memory import, data export, account deletion) are the same routes the desktop and mobile Cloud clients call. The turn-context and user-identity services under apps/web/lib/ build the prompt for every Cloud chat, whichever surface sends it. The Cloud data export route is used by the CLI (apps/cli/src/cloud/data_export.rs). The privacy UI in apps/mobile/src/features/settings/ is separate code from the web screen. Desktop reuses the web settings components (PrivacySection.tsx and BulkConversationControls.tsx) and adds the browser pairing screen. The VS Code and Chrome extensions each have their own settings code and storage. Whether mobile calls the same bulk-delete route is not verified.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief says Activity-history (keep chats or not saved) is done on web, but the code says the 'rememberChats' switch was removed because it changed nothing. Conversation save never reads it. So web offers no 'not saved' choice. (apps/web/features/settings/sections/PrivacySection.tsx:29-37)
- Mobile 'Delete all local chats' copy says memory and settings stay. The wipe that the mobile storage code runs deletes memory_facts and custom_instructions. Which function the delete-all-local alert calls was not confirmed, so the copy may be wrong. (apps/mobile/src/features/settings/data-controls/index.tsx:371-376; apps/mobile/services/dsarExport.ts:431-440)
- The temporary-chat switch comment says useConversations sends isTemporary at creation. I did not open useConversations to confirm this, so the claim is unverified. (apps/web/features/settings/sections/PrivacySection.tsx:697-720)
- The brief's status for CLI and VS Code deletion of account and history import conflicts with what I could find: no history import code exists on any app, though the brief lists it as missing everywhere, which matches. (apps/web/app/api/memory/import/route.ts:184 (memory import only; no chat-history import route found))

## Not established

- Line numbers marked 'per brief' or 'not re-opened' were taken from the brief, not checked in the file. The brief's 'Code' lines for user-identity.ts, conversation-data-service.ts, DataExportRow.tsx and similar were only partly re-opened.
- Whether project memory choice (S85.07) on mobile, CLI and VS Code is missing or merely not listed. I only confirmed web code for it.
- Whether revoking a shared link really stops the link: I did not open the revoke route.
- Exact database table names for settings namespaces, the context manifest store, and project flags beyond the column names read in readProjectPersonalizationScope.
- Failure, empty and waiting states on most screens, including what the user sees when export or import fails.
- Plan limits: which exact plans see which controls beyond the Free check in PrivacySection.tsx.
- Chrome status for custom instructions (brief says unverified) and for the extension's own delete-all and export paths.
- Desktop: how the browsing permission check in apps/desktop/electron/runtime/dispatcher.ts:924 works; not read in full.
- Mobile sync-local-chats-to-cloud copy: the file that holds it was not identified.
- Testing: the task asked for localhost and one-surface-at-a-time testing. This was a read-only code reading task, so no builds, tests or servers were run, and nothing was tested in localhost or on any surface.
- Wait and failure behaviour for the memory import and bulk delete in the web UI.
