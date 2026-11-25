# Area 10. Modal and dialog inventory

48 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S10.01 Create Project.
- Should: A create-project dialog (or command) asks for a name and creates the project in the account.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/app/chat/projects/page.tsx:397; apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:70; apps/web/app/api/projects/route.ts:133; apps/web/app/api/projects/route.ts:199; apps/mobile/app/(app)/(tabs)/projects.tsx:443; apps/mobile/app/(app)/(tabs)/projects.tsx:186; apps/mobile/src/features/projects/store.ts:227; apps/web/app/api/projects/sync/route.ts:91

## S10.02 Rename conversation.
- Should: The user opens rename on a conversation, edits the title in a field or prompt, and the new title is saved.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/ConversationTitleMenu.tsx:142; packages/ui/ui/src/sidebar/SessionItem.tsx:322; apps/web/shared/components/layout/WebAppShell.tsx:307; apps/mobile/src/features/conversation-actions/useConversationActions.ts:116; apps/mobile/app/(app)/chat/[id].tsx:1195; apps/cli/src/tui/tui_app.rs:3574

## S10.03 Move conversation.
- Should: A move dialog or menu lets the user pick a project for a conversation and files it there.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/sidebar/SessionItem.tsx:386; apps/web/shared/components/layout/WebAppShell.tsx:337; apps/web/features/chat/components/ConversationTitleMenu.tsx:146

## S10.04 Duplicate resource.
- Should: A duplicate action creates an independent copy of a conversation or project and says where the copy is.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/ConversationTitleMenu.tsx:184; apps/web/features/chat/pages/WebChatPage.tsx:5475; apps/cli/src/tui/tui_app.rs:3562; apps/extension-vscode/src/core/commandSetup.ts:1210; apps/extension-vscode/src/core/commandSetup.ts:1219

## S10.05 Archive confirmation.
- Should: Archiving asks to confirm, or confirms afterwards with a way to undo, and says where archived items can be found.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/shared/components/layout/sidebar-session-actions.ts:62; apps/web/shared/components/layout/WebAppShell.tsx:327; apps/desktop/src/features/v3/Sidebar.tsx:784; apps/mobile/src/features/conversation-actions/useConversationActions.ts:110; apps/cli/src/lib.rs:2851; apps/cli/src/lib.rs:2848; apps/extension-vscode/src/core/commandSetup.ts:1172; apps/extension-vscode/src/core/commandSetup.ts:1177

## S10.06 Delete confirmation.
- Should: Deleting asks for confirmation that names the item before anything is removed.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/ui/src/sidebar/SessionItem.tsx:374; apps/web/shared/components/layout/WebAppShell.tsx:295; apps/web/features/chat/components/ConversationTitleMenu.tsx:205; apps/mobile/src/features/conversation-actions/useConversationActions.ts:130; apps/mobile/src/features/conversation-actions/useConversationActions.ts:141; apps/cli/src/lib.rs:1259; apps/cli/src/lib.rs:2868; apps/extension-vscode/src/core/commandSetup.ts:1184

## S10.07 Permanent-delete confirmation.
- Should: An irreversible delete says plainly that it cannot be undone and needs an explicit second confirmation.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/shared/components/layout/sidebar-session-actions.ts:80; apps/web/shared/components/layout/WebAppShell.tsx:301; apps/mobile/src/features/conversation-actions/useConversationActions.ts:137; apps/mobile/src/features/conversation-actions/useConversationActions.ts:143; apps/cli/src/lib.rs:2884; apps/cli/src/lib.rs:2874; apps/extension-vscode/src/core/commandSetup.ts:1193; apps/extension-vscode/src/core/commandSetup.ts:1199

## S10.08 Share conversation.
- Should: A share dialog creates a link to the conversation, shows it for copying, and states who can open it.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5535; apps/web/features/chat/components/share/ShareConversationDialog.tsx:288; apps/web/features/chat/hooks/use-share-conversation.ts:177; apps/mobile/app/(app)/chat/[id].tsx:1452

## S10.09 Share file or folder.
- Should: The user can share a file (or folder) from their library with someone, by link or the system share sheet.
- Status: mobile done, cli missing, vscode missing, chrome missing
- Code: apps/mobile/src/features/library/index.tsx:180; apps/mobile/src/features/library/index.tsx:147

## S10.10 Share artifact.
- Should: An artifact share dialog publishes it to a link, lets the user copy it and choose who can open it, and can take it down.
- Status: web done, desktop done, mobile done, cli done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1563; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1704; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:78; apps/web/app/api/artifacts/publish/route.ts:182; apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx:106; apps/cli/src/lib.rs:2398; apps/cli/src/lib.rs:2278

## S10.11 Publish generated application.
- Should: A publish dialog puts a generated app or page on a live URL and hands back the link.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1563; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1704; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:78; apps/web/app/api/artifacts/publish/route.ts:182; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:405; apps/mobile/src/features/chat/services/artifactPublishing.ts:13; apps/cli/src/lib.rs:1053; apps/cli/src/cloud/artifacts.rs:391

## S10.12 Manage link access.
- Should: For a shared link the user can see its access (who, expiry) and change or revoke it.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/share/ShareConversationDialog.tsx:262; apps/web/features/chat/hooks/use-share-conversation.ts:212; apps/mobile/app/(app)/settings/shared-links.tsx:51; apps/mobile/app/(app)/settings/shared-links.tsx:96; apps/mobile/src/features/settings/index.tsx:448

## S10.13 Invite member.
- Should: An invite dialog takes an email and role, sends the invitation, and lists pending invites to revoke or renew.
- Status: web done, desktop done, mobile done, cli missing
- Code: apps/web/features/settings/sections/TeamSection.tsx:685; apps/web/features/settings/sections/TeamSection.tsx:827; apps/web/app/api/settings/team/invitations/route.ts:92; apps/web/app/api/settings/team/invitations/[invitationId]/route.ts:129; apps/mobile/src/features/team/WorkspaceAdministration.tsx:43

## S10.14 Change member role.
- Should: A role dialog changes a member's role after confirmation, and the server enforces the new role.
- Status: web done, desktop done, mobile done, cli missing
- Code: apps/web/features/workspace-console/components/WorkspaceRoles.tsx:261; apps/web/features/settings/sections/TeamSection.tsx:1315; apps/web/app/api/settings/team/[memberId]/route.ts:27; apps/web/app/api/settings/team/[memberId]/route.ts:236; apps/mobile/src/features/team/RolePickerModal.tsx:45; apps/mobile/app/(app)/settings/workspace.tsx:180

## S10.15 Transfer ownership.
- Should: The owner picks another member and confirms, and ownership moves to them.
- Status: web done, desktop done, mobile missing, cli missing
- Code: apps/web/features/settings/sections/TeamSection.tsx:1079; apps/web/features/settings/sections/TeamSection.tsx:1149; apps/web/app/api/settings/organization/transfer-ownership/route.ts:29

## S10.16 Select sources.
- Should: A dialog lets the user choose which sources (sites, files, apps) an answer or research run may use.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchActivity.tsx:373; apps/web/features/chat/components/research/ResearchActivity.tsx:455; apps/web/features/chat/components/messages/MessageBubble.tsx:1834

## S10.17 Upload from device.
- Should: Choosing upload opens the device file chooser and the picked files attach to the message.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:647; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5228; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1818; apps/web/features/chat/pages/WebChatPage.tsx:2022; apps/web/features/chat/pages/WebChatPage.tsx:5668; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:382; apps/mobile/app/(app)/(tabs)/chat.tsx:633; apps/mobile/app/(app)/(tabs)/chat.tsx:927

## S10.18 Connect external account.
- Should: A connect dialog starts the service's real authorization (OAuth or key) and ends with the account connected.
- Status: web done, desktop done, mobile done, cli done
- Code: packages/ui/ui/src/directory/ConnectorDetailView.tsx:292; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:530; apps/web/app/api/connectors/route.ts:530; apps/mobile/src/features/settings/cloud-connectors/index.tsx:517; apps/mobile/src/features/settings/cloud-connectors/index.tsx:676; apps/mobile/services/connectors.ts:69; packages/client/client-runtime/src/connectors/runtime.ts:264; apps/cli/src/lib.rs:1337

## S10.19 Reauthorize connection.
- Should: An expired connection offers a reconnect dialog that re-runs authorization and keeps its settings.
- Status: web partial, desktop done, mobile done, cli done
- Code: packages/ui/ui/src/directory/ConnectorDetailView.tsx:293; apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:864; packages/ui/ui/src/settings-modal/SettingsModal.tsx:293; apps/desktop/src/api/cloudConnectors.ts:77; apps/mobile/src/features/settings/cloud-connectors/index.tsx:430; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:318; apps/cli/src/lib.rs:1337; apps/cli/src/lib.rs:2542
- Unfinished: web: live-check: with a revoked or expired OAuth grant (e.g. Google Drive), open Connectors on web and in Electron: Reconnect shows beside Disconnect and re-runs OAuth, settings and tool permissions persist, and chat shows the agi_reconnect card

## S10.20 Select among connected accounts.
- Should: When a service has several connected accounts, a dialog lets the user pick which one to use or make default.
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/app/api/connectors/[connectorId]/accounts/route.ts:44

## S10.21 Install Plugin.
- Should: An install dialog shows the plugin and installs it into the account or workspace.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/PluginDetailView.tsx:456; apps/web/features/directory/hooks/useDirectoryAdapter.ts:996; apps/web/app/api/plugins/installations/route.ts:58; apps/web/features/plugins/server/directory/install.ts:155; apps/cli/src/lib.rs:1293; apps/cli/src/lib.rs:3655; apps/cli/src/lib.rs:3984

## S10.22 Review Plugin permissions.
- Should: Before installing or updating, a dialog lists the permissions the plugin requires and asks the user to accept them.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/directory/services/plugins-directory.ts:677; apps/web/features/directory/services/plugins-directory.ts:719; packages/ui/ui/src/directory/DirectoryPanel.tsx:344; packages/ui/ui/src/directory/PluginDetailView.tsx:815

## S10.23 Update Plugin.
- Should: An update dialog offers a newer plugin version, shows what changes, and applies it.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/directory/services/plugins-directory.ts:1376; packages/ui/ui/src/directory/DirectoryPanel.tsx:541; packages/ui/ui/src/directory/PluginDetailView.tsx:807; apps/cli/src/lib.rs:1428; apps/cli/src/lib.rs:3984

## S10.24 Skill import.
- Should: An import dialog takes a skill file or package and adds a usable skill.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/lib/services/user-skill-authoring.ts:11; apps/cli/src/skills.rs:1031

## S10.25 Skill edit.
- Should: An edit dialog changes a skill's name, description and instructions and saves them.
- Status: web done, desktop done, mobile missing, vscode missing, chrome missing
- Code: apps/web/lib/services/user-skill-authoring.ts:11

## S10.26 Model incompatibility warning.
- Should: Switching to a model that cannot handle the conversation (images, tools, context) warns and asks before switching.
- Status: web done, desktop done, mobile missing, cli missing, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1341; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1051; apps/extension-vscode/src/features/model-picker/modelConstants.ts:304; apps/extension-vscode/src/core/commandSetup.ts:1208

## S10.27 Context-limit warning.
- Should: As a conversation nears or passes the model's context limit, the user gets a clear warning with what to do (trim, compact, new chat).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/model-compatibility.ts:160; apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx:28; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1523; apps/mobile/app/(app)/chat/[id].tsx:1828; apps/cli/src/tui/tui_app.rs:5820; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3564

## S10.28 Usage-limit notice.
- Should: When a usage limit is reached, the user sees which limit, when it resets, and what they can do.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/InlinePaywallCard.tsx:386; apps/web/lib/services/managed-usage-request-service.ts:392; apps/mobile/app/(app)/chat/[id].tsx:1606; apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:77; apps/mobile/app/(app)/chat/[id].tsx:400; apps/cli/src/errors.rs:604; apps/cli/src/models/streaming.rs:161; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3080

## S10.29 Credit-purchase dialog.
- Should: From where the limit is hit, a purchase dialog lets the user buy extra credits and completes payment.
- Status: web partial, desktop partial, mobile partial
- Code: apps/web/lib/server/billing-waitlist-access.ts:22; apps/mobile/src/features/settings/cloud-billing/index.tsx:147; apps/web/lib/server/mobile-iap-catalog.ts:25; apps/web/app/api/mobile/iap/catalog/route.ts:83
- Unfinished: web: owner-held (lead ruling 2026-09-28): the billing waitlist stays on by owner decision; paid checkout, portal and store purchases need a redeemed access code. aaae88832e added AGI_BILLING_WAITLIST_OPEN, which stays unset at deploy until the owner opens paid upgrades | desktop: owner-held (lead ruling 2026-09-28): the billing waitlist stays on by owner decision; paid checkout, portal and store purchases need a redeemed access code. aaae88832e added AGI_BILLING_WAITLIST_OPEN, which stays unset at deploy until the owner opens paid upgrades | mobile: Owner and switch-on: waitlist hold plus MOBI

## S10.30 Upgrade comparison.
- Should: An upgrade dialog compares plans (price, limits, features) before the user picks one.
- Status: web done, desktop done, mobile partial
- Code: apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:145; apps/web/app/pricing/page.tsx:1392; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:79; apps/web/features/billing/hooks/useUpgradePlanFlow.tsx:123; apps/mobile/src/features/settings/cloud-billing/index.tsx:416; apps/web/lib/server/mobile-iap-catalog.ts:25
- Unfinished: mobile: Owner: plan prices and pick action depend on FEATURES.billing and the native product list (waitlist hold).

## S10.31 Cancel subscription.
- Should: A cancel dialog lets the user cancel their subscription, says when access ends, and confirms.
- Status: web done, desktop done, mobile partial
- Code: apps/web/features/settings/sections/BillingSection.tsx:828; apps/web/features/billing/services/stripe-payments.ts:112; apps/web/app/api/portal/route.ts:455; apps/mobile/src/features/settings/cloud-billing/index.tsx:165; apps/mobile/src/features/settings/cloud-billing/index.tsx:367
- Unfinished: mobile: D-2026-09-28-27: cancellation links out to the store or web billing.

## S10.32 Payment-method update.
- Should: A payment-method dialog lets the user add or replace the card on file.
- Status: web done, desktop done, mobile partial
- Code: apps/web/features/settings/sections/BillingSection.tsx:923; apps/web/app/api/billing/payment-methods/route.ts:80; apps/web/features/billing/services/stripe-payments.ts:112; apps/mobile/src/features/settings/cloud-billing/index.tsx:367; apps/mobile/lib/v1FeatureFlags.ts:6
- Unfinished: mobile: D-2026-09-28-27: card and payment method link out to web billing.

## S10.33 Reauthentication challenge.
- Should: Before a sensitive account action, a dialog asks the user to prove it is them (code or passkey) and only then proceeds.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/auth/StepUpDialog.tsx:103; apps/web/features/auth/StepUpDialog.tsx:43; apps/web/features/settings/hooks/useStepUp.tsx:59; apps/web/features/settings/hooks/use-settings-queries.ts:1287; apps/mobile/src/features/settings/cloud-account/index.tsx:203

## S10.34 Microphone permission explanation.
- Should: Before or when the microphone is first needed, the product explains why it wants it and what to do if access is refused.
- Status: web unverified, desktop unverified, mobile done, chrome done
- Code: apps/mobile/app.config.js:74; apps/mobile/src/features/voice/hooks/useVoiceConversation.ts:41; apps/mobile/src/features/voice/services/voiceInput.ts:227; apps/extension/src/features/side-panel/voice.ts:27

## S10.35 Screen-sharing source selection.
- Should: When sharing the screen, the user picks which screen or window to share before anything is captured.
- Status: web done, desktop done, mobile missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1098; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4919; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1947; apps/desktop/electron/main.ts:652; apps/desktop/electron/main.ts:642; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1832

## S10.36 Computer-control permission.
- Should: Before the assistant first controls the computer or browser, a dialog says what it will be able to do and the user grants or refuses it.
- Status: desktop done, chrome done
- Code: apps/desktop/electron/runtime/permissionManager.ts:313; apps/desktop/electron/runtime/dispatcher.ts:414; apps/desktop/electron/runtime/dispatcher.ts:1043; apps/extension/src/options.ts:1137; apps/extension/src/features/computer-use/browserControlConsent.ts:133; apps/extension/src/features/computer-use/browserControlConsent.ts:159

## S10.37 Folder-access permission.
- Should: Before the assistant reads or writes a local folder, the user is asked to grant access to that folder.
- Status: desktop done, cli done, vscode done
- Code: apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx:62; apps/desktop/electron/runtime/dispatcher.ts:704; apps/cli/src/tui/tui_app.rs:4865; apps/cli/src/features/exec/tools/mod.rs:498; apps/cli/src/features/exec/tools/mod.rs:1028; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4596; apps/extension-vscode/src/features/permissions/approvalScope.ts:18

## S10.38 Tool-action approval.
- Should: When a tool action needs approval, a prompt shows the action and the user approves or denies that one call.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/ToolCallCard.tsx:476; apps/web/lib/hooks/useChatStream.ts:4047; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:328; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:307; apps/mobile/stores/chat/chatExecutionStore.ts:2519; apps/cli/src/tui/widgets/approval_overlay.rs:81; apps/cli/src/tui/tui_app.rs:861; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4596

## S10.39 Sensitive-data transfer approval.
- Should: Before private or sensitive data is sent to an outside destination, the user is asked to approve that transfer and told what goes where.
- Status: web done, desktop done, mobile done, cli missing, chrome done
- Code: packages/contracts/types/src/tool-approval-policy.ts:36; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:936; apps/extension/src/features/computer-use/approvalPolicy.ts:217; apps/extension/src/features/computer-use/approvalPolicy.ts:220; apps/extension/src/features/side-panel/computerUsePanel.ts:1107

## S10.40 Remote-device pairing.
- Should: A pairing dialog links a phone or another device to this machine by code or QR, bound to the signed-in account.
- Status: desktop done, mobile done, vscode done
- Code: apps/web/features/desktop-host/components/RemoteControlSection.tsx:50; apps/desktop/electron/runtime/dispatcher.ts:870; apps/mobile/src/features/companion/components/ConnectionStateViews.tsx:106; apps/extension-vscode/src/features/remote-control/index.ts:154; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:173

## S10.41 Unsaved-changes warning.
- Should: Leaving an editor with unsaved edits warns the user and lets them keep editing or discard.
- Status: web done, desktop done, mobile done, chrome missing
- Code: packages/ui/ui/src/primitives/UnsavedChanges.tsx:108; packages/ui/ui/src/primitives/UnsavedChanges.tsx:26; apps/web/features/projects/components/ProjectSettingsDialog.tsx:90; packages/ui/unified-chat/src/components/MemoryEditor.tsx:197; apps/mobile/src/shared/hooks/useUnsavedChangesGuard.ts:13; apps/mobile/src/features/schedules/components/ScheduleForm.tsx:76; apps/mobile/src/features/settings/components/AddMemorySheet.tsx:45

## S10.42 Edit-conflict resolution.
- Should: When the same item was changed elsewhere, the user sees both versions and chooses which to keep (or merges).
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/app/api/chat/conversations/[id]/route.ts:269; apps/web/features/chat/components/DraftConflictDialog.tsx:46; apps/web/features/chat/hooks/use-conversation-draft-sync.ts:205; apps/cli/src/sync.rs:169

## S10.43 Export options.
- Should: An export dialog lets the user pick a format and exports the conversation or item to a file.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/ConversationTitleMenu.tsx:178; apps/web/features/chat/pages/WebChatPage.tsx:5851; apps/mobile/app/(app)/chat/[id].tsx:1599; apps/mobile/app/(app)/chat/[id].tsx:1189; apps/cli/src/tui/tui_app.rs:3581

## S10.44 Report-content dialog.
- Should: A report dialog lets the user flag an answer (with a reason) and the report reaches moderation.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:3083; apps/web/features/chat/components/messages/MessageBubble.tsx:935; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/mobile/src/features/chat/components/MessageBubble.tsx:1126; apps/mobile/src/features/chat/components/ReportFlagButton.tsx:31; apps/mobile/src/features/chat/components/MessageList.tsx:92

## S10.45 Feedback submission.
- Should: A feedback dialog, reachable product-wide, sends the user's message to the team's feedback store.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/shared/components/layout/AccountMenuItems.tsx:92; apps/web/shared/components/layout/WebAppShell.tsx:627; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:162; apps/mobile/src/features/settings/index.tsx:599; apps/mobile/src/features/feedback/index.tsx:18; apps/mobile/src/features/feedback/index.tsx:50; apps/cli/src/cloud/feedback.rs:53; apps/cli/src/claude_parity.rs:157

## S10.46 Diagnostic-sharing consent.
- Should: Before diagnostics or crash reports leave the device, the user is told what is included and chooses (or sets a preference that is honoured).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/PrivacySection.tsx:51; apps/web/features/settings/sections/PrivacySection.tsx:211; apps/web/lib/sentry-shared.ts:81; apps/mobile/src/features/settings/index.tsx:409; apps/cli/src/tui/tui_app.rs:3864; apps/cli/src/config.rs:1126; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1563; apps/extension/src/features/options/data-handling-section.ts:160

## S10.47 Data-export request.
- Should: A data-export dialog requests a copy of the account's data and delivers it as a download.
- Status: web done, desktop done, mobile done, cli done, chrome missing
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:186; apps/mobile/src/features/settings/cloud-account/index.tsx:332; apps/mobile/src/features/settings/cloud-account/index.tsx:132; apps/mobile/services/cloudDataExport.ts:28; apps/cli/src/cloud/data_export.rs:45; apps/cli/src/cloud/data_export.rs:52; apps/cli/src/lib.rs:5591

## S10.48 Account-deletion request.
- Should: An account-deletion dialog explains what is deleted and requires explicit confirmation before deleting the account.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/features/settings/components/WebSettingsModal.tsx:186; apps/web/features/settings/sections/AccountSection.tsx:448; apps/web/features/settings/hooks/use-settings-queries.ts:436; apps/web/app/api/user/delete-account/route.ts:416; apps/mobile/src/features/settings/cloud-account/index.tsx:182; apps/mobile/src/features/settings/cloud-account/index.tsx:370
