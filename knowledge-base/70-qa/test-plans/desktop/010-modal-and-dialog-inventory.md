---
id: "PLAN-desktop-010"
type: "test-plan"
title: "Desktop · 10. Modal and dialog inventory"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "10"
---
# Desktop · 10. Modal and dialog inventory

47 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S10.01 Create Project.

- **Expected:** A create-project dialog (or command) asks for a name and creates the project in the account.
- **Code:** done. Evidence moved: apps/web/app/chat/projects/page.tsx:373; apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:71; apps/web/app/api/projects/route.ts:162; apps/web/app/api/projects/route.ts:199 (quoted code not found in the file now)
- **Where to find it:** Projects page > New project > Create project dialog (labels found in the code)
- **Needs:** a Free account or a paid account
- **Steps:**
  1. Sign in and open the Projects page (apps/web/app/chat/projects/page.tsx).
  2. Click "New project".
  3. In the "Create project" dialog, type a name and click "Create project".
  4. Check that the new project appears in the Projects list, compared with Expected.

## S10.02 Rename conversation.

- **Expected:** The user opens rename on a conversation, edits the title in a field or prompt, and the new title is saved.
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:153; packages/ui/ui/src/sidebar/SessionItem.tsx:343; apps/web/shared/components/layout/WebAppShell.tsx:345
- **Where to find it:** Chat title (Conversation options button) > Rename, or sidebar row > Rename (labels found in the code)
- **Needs:** a conversation in the account
- **Steps:**
  1. Open a conversation.
  2. Click the conversation title in the header to open the menu, then click "Rename".
  3. Or hover a row in the sidebar, open its menu and click "Rename".
  4. Type a new title, press Enter, and check the new title is shown in the header and sidebar.

## S10.03 Move conversation.

- **Expected:** A move dialog or menu lets the user pick a project for a conversation and files it there.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:414; apps/web/shared/components/layout/WebAppShell.tsx:379; apps/web/features/chat/components/ConversationTitleMenu.tsx:167
- **Where to find it:** Chat title menu > Move to project, or sidebar row > Move to project (labels found in the code)
- **Needs:** at least one project in the account
- **Steps:**
  1. Open a conversation that is not in a project.
  2. Open the title menu or the row menu and hover "Move to project".
  3. Click a project name in the submenu.
  4. Check the conversation now shows under that project in the sidebar.

## S10.04 Duplicate resource.

- **Expected:** A duplicate action creates an independent copy of a conversation or project and says where the copy is.
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:209; apps/web/features/chat/pages/WebChatPage.tsx:7422
- **Where to find it:** Chat title menu > Duplicate as branch (labels found in the code)
- **Needs:** a conversation with messages
- **Steps:**
  1. Open a conversation with at least one message.
  2. Open the title menu and click "Duplicate as branch".
  3. Look for the new copy in the sidebar and for any message saying where it is.
  4. Compare with Expected: an independent copy that names its location.

## S10.05 Archive confirmation.

- **Expected:** Archiving asks to confirm, or confirms afterwards with a way to undo, and says where archived items can be found.
- **Code:** done. Evidence present: apps/web/shared/components/layout/sidebar-session-actions.ts:61; apps/web/shared/components/layout/WebAppShell.tsx:362; apps/desktop/src/features/v3/Sidebar.tsx:908
- **Where to find it:** Sidebar row > Archive (labels found in the code)
- **Needs:** a conversation in the account
- **Steps:**
  1. Hover a conversation in the sidebar and open its menu.
  2. Click "Archive".
  3. Look for the toast "Chat archived" with "Undo" and "View archived".
  4. Compare with Expected: archiving confirms, offers undo and points to archived items.

## S10.06 Delete confirmation.

- **Expected:** Deleting asks for confirmation that names the item before anything is removed.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:397; apps/web/shared/components/layout/WebAppShell.tsx:337; apps/web/features/chat/components/ConversationTitleMenu.tsx:227
- **Where to find it:** Sidebar row > Delete (labels found in the code)
- **Needs:** a conversation in the account
- **Steps:**
  1. Hover a conversation in the sidebar and open its menu.
  2. Click "Delete".
  3. Look for a dialog titled "Delete conversation?" that shows the conversation title in quotes.
  4. Click Cancel first and check nothing is removed; compare with Expected.

## S10.07 Permanent-delete confirmation.

- **Expected:** An irreversible delete says plainly that it cannot be undone and needs an explicit second confirmation.
- **Code:** done. Evidence present: apps/web/shared/components/layout/sidebar-session-actions.ts:102; apps/web/shared/components/layout/WebAppShell.tsx:337
- **Where to find it:** Sidebar row > Delete (the dialog says it cannot be undone) (labels found in the code)
- **Needs:** a conversation in the account
- **Steps:**
  1. Open a conversation's row menu and click "Delete".
  2. Read the dialog "Delete conversation?" for the words "This cannot be undone."
  3. Check whether a second confirmation appears before anything is removed.
  4. Compare with Expected.

## S10.08 Share conversation.

- **Expected:** A share dialog creates a link to the conversation, shows it for copying, and states who can open it.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:7502; apps/web/features/chat/components/share/ShareConversationDialog.tsx:444; apps/web/features/chat/hooks/use-share-conversation.ts:177 (quoted code not found in the file now)
- **Where to find it:** Chat title menu > Share…, or the Share button in the chat header (labels found in the code)
- **Needs:** a conversation with messages
- **Steps:**
  1. Open a conversation with messages.
  2. Click "Share…" in the title menu (or the header Share button).
  3. Read the dialog title "Share conversation" and the audience text, for example "Anyone with the link".
  4. Click "Copy" and check the link is copied and the dialog states who can open it.

## S10.10 Share artifact.

- **Expected:** An artifact share dialog publishes it to a link, lets the user copy it and choose who can open it, and can take it down.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2924; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3056; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:88; apps/web/app/api/artifacts/publish/route.ts:42
- **Where to find it:** Artifact panel > Publish, then Share (labels found in the code)
- **Needs:** a chat that has produced an artifact
- **Steps:**
  1. Generate an artifact in a chat so the artifact panel opens.
  2. Click the "Publish" action in the artifact panel.
  3. Click the "Share" button in the panel to see the sharing choices.
  4. Check that a link appears with copy, the audience options and a way to take it down; compare with Expected.

## S10.11 Publish generated application.

- **Expected:** A publish dialog puts a generated app or page on a live URL and hands back the link.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2924; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3056; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:88; apps/web/app/api/artifacts/publish/route.ts:42
- **Where to find it:** Artifact panel > Publish (labels found in the code)
- **Needs:** a chat that has produced a generated page or app
- **Steps:**
  1. Generate a web page or app in a chat so it appears as an artifact.
  2. Click "Publish" in the artifact panel.
  3. Wait for the toast "Published. Copy the link from the bar below." or "Published · link copied to clipboard".
  4. Open the link shown in the bar below and compare with Expected: a live URL.

## S10.12 Manage link access.

- **Expected:** For a shared link the user can see its access (who, expiry) and change or revoke it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/share/ShareConversationDialog.tsx:223; apps/web/features/chat/hooks/use-share-conversation.ts:212 (quoted code not found in the file now)
- **Where to find it:** Chat title menu > Share… > Anyone with the link (audience) and expiry choice (labels found in the code)
- **Needs:** a conversation with messages and an existing shared link
- **Steps:**
  1. Share a conversation with Share… and create the link.
  2. Look at the expiry choices "1 day", "7 days" and "30 days" and the audience choice "Anyone with the link".
  3. Change the audience or click "Revoke all links" and confirm.
  4. Check the link shows its access and stops working after revoking; compare with Expected.

## S10.13 Invite member.

- **Expected:** An invite dialog takes an email and role, sends the invitation, and lists pending invites to revoke or renew.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TeamSection.tsx:976; apps/web/features/settings/sections/TeamSection.tsx:1119; apps/web/app/api/settings/team/invitations/route.ts:92; apps/web/app/api/settings/team/invitations/[invitationId]/route.ts:130
- **Where to find it:** Settings > Team section > Invite teammate (labels found in the code)
- **Needs:** a workspace owner or admin account
- **Steps:**
  1. Open Settings and go to the team section.
  2. Type an email in the "Invitee email" field and choose a role ("Member role", "Viewer role" or "Admin role").
  3. Click the invite button and check "Pending invitations" lists the invite with revoke and renew actions.
  4. Compare with Expected.

## S10.14 Change member role.

- **Expected:** A role dialog changes a member's role after confirmation, and the server enforces the new role.
- **Code:** done. Evidence moved: apps/web/features/workspace-console/components/WorkspaceRoles.tsx:239; apps/web/features/settings/sections/TeamSection.tsx:1651; apps/web/app/api/settings/team/[memberId]/route.ts:22; apps/web/app/api/settings/team/[memberId]/route.ts:236 (quoted code not found in the file now)
- **Where to find it:** Settings > Team section > member row role menu (labels found in the code)
- **Needs:** a workspace owner or admin account and a second member account
- **Steps:**
  1. Open Settings and the team section as an owner or admin.
  2. On a member row, pick a new role from the role menu ("Viewer role", "Member role" or "Admin role").
  3. In the "Change member role?" dialog, confirm.
  4. Check the member row shows the new role; compare with Expected.

## S10.15 Transfer ownership.

- **Expected:** The owner picks another member and confirms, and ownership moves to them.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TeamSection.tsx:1407; apps/web/features/settings/sections/TeamSection.tsx:1495; apps/web/app/api/settings/organization/transfer-ownership/route.ts:43
- **Where to find it:** Settings > Team section > Transfer ownership (labels found in the code)
- **Needs:** the owner account and a second member account
- **Steps:**
  1. Open Settings and the team section as the owner.
  2. In the card "Transfer ownership", pick another member and the role you keep.
  3. Click "Transfer ownership" and confirm the "Transfer ownership?" dialog.
  4. Check that the other member now shows as owner; compare with Expected.

## S10.16 Select sources.

- **Expected:** A dialog lets the user choose which sources (sites, files, apps) an answer or research run may use.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchActivity.tsx:690; apps/web/features/chat/components/research/ResearchActivity.tsx:808; apps/web/features/chat/components/messages/MessageBubble.tsx:2626
- **Where to find it:** Research run plan > Add a source (labels found in the code)
- **Needs:** a Free or paid account; a connected app for the app option
- **Steps:**
  1. Start a research run in a chat.
  2. When the research plan appears, read "Sources for this run" or "Searching the whole web. Add a source to narrow it."
  3. Click "Add a source" and pick the sources (connected apps, files, or web) to allow.
  4. Check the plan lists only the chosen sources; compare with Expected.

## S10.17 Upload from device.

- **Expected:** Choosing upload opens the device file chooser and the picked files attach to the message.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:892; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7011; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2301; apps/web/features/chat/pages/WebChatPage.tsx (text found, layout changed); apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** Composer > + (Add photos & files) > Upload from device (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. In the chat composer, click the + control.
  2. Click "Add photos & files", then "Upload from device".
  3. Pick one or more files in the device file chooser.
  4. Check the picked files appear as attachments on the message before sending.

## S10.18 Connect external account.

- **Expected:** A connect dialog starts the service's real authorization (OAuth or key) and ends with the account connected.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/ConnectorDetailView.tsx:292 (quoted code not found in the file now); apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:757; apps/web/app/api/connectors/route.ts:690
- **Where to find it:** Settings > Connectors > (choose a service) > Connect (labels found in the code)
- **Needs:** an outside account for the service (for example Google)
- **Steps:**
  1. Open Settings and then Connectors.
  2. Open a service and click "Connect" (or "Add API key" for key-based services).
  3. Complete the service's sign-in or key entry in the window or form that opens.
  4. Check the service now shows as connected; compare with Expected.

## S10.19 Reauthorize connection.

- **Expected:** An expired connection offers a reconnect dialog that re-runs authorization and keeps its settings.
- **Code:** done. Evidence moved: apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:877; packages/ui/ui/src/settings-modal/SettingsModal.tsx:382; apps/desktop/src/api/cloudConnectors.ts:77 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > (service that needs reconnecting) > Reconnect (labels found in the code)
- **Needs:** a connection that has expired (cannot be made on demand)
- **Steps:**
  1. Open Settings and then Connectors.
  2. Find a service whose text says it needs reconnecting.
  3. Click "Reconnect" and complete the authorization again.
  4. Check the service is connected again and its settings are still there; compare with Expected.

## S10.20 Select among connected accounts.

- **Expected:** When a service has several connected accounts, a dialog lets the user pick which one to use or make default.
- **Code:** done. Evidence present: apps/web/app/api/connectors/[connectorId]/accounts/route.ts:37
- **Where to find it:** not found in the code. Only the API route apps/web/app/api/connectors/[connectorId]/accounts/route.ts was found. I searched apps/web/features and packages/ui/ui/src for "Make default", "Default account" and "Use this account" and found no matching visible control.
- **Needs:** a service with more than one connected account

## S10.21 Install Plugin.

- **Expected:** An install dialog shows the plugin and installs it into the account or workspace.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/PluginDetailView.tsx:899; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1363; apps/web/app/api/plugins/installations/route.ts:58 (quoted code not found in the file now); apps/web/features/plugins/server/directory/install.ts:311
- **Where to find it:** Settings > Plugins > (choose a plugin) > Install (labels found in the code)
- **Needs:** a Free or paid account
- **Steps:**
  1. Open Settings and then Plugins.
  2. Open a plugin and read its details.
  3. Click "Install".
  4. Check the plugin shows as installed ("Installed") in the account or workspace; compare with Expected.

## S10.22 Review Plugin permissions.

- **Expected:** Before installing or updating, a dialog lists the permissions the plugin requires and asks the user to accept them.
- **Code:** done. Evidence present: apps/web/features/directory/services/plugins-directory.ts:694; apps/web/features/directory/services/plugins-directory.ts:737; packages/ui/ui/src/directory/DirectoryPanel.tsx:409; packages/ui/ui/src/directory/PluginDetailView.tsx:1066
- **Where to find it:** Settings > Plugins > (choose a plugin) > Permissions (labels found in the code)
- **Needs:** a plugin that asks for permissions
- **Steps:**
  1. Open Settings, then Plugins, and open a plugin.
  2. Scroll to the "Permissions" section and read the list of permissions.
  3. Compare with Expected: the list must be shown before the install or update is accepted.
  4. Note whether an accept step follows the list, since the code read shows only the list.

## S10.23 Update Plugin.

- **Expected:** An update dialog offers a newer plugin version, shows what changes, and applies it.
- **Code:** done. Evidence present: apps/web/features/directory/services/plugins-directory.ts:1565; packages/ui/ui/src/directory/DirectoryPanel.tsx:639; packages/ui/ui/src/directory/PluginDetailView.tsx:1058
- **Where to find it:** Settings > Plugins > (plugin with an update) > Update (labels found in the code)
- **Needs:** an installed plugin that has a newer version
- **Steps:**
  1. Open Settings, then Plugins.
  2. Look for a plugin marked "Update available".
  3. Open it and read the "Update to" version text and what changed.
  4. Apply the update and compare with Expected.

## S10.24 Skill import.

- **Expected:** An import dialog takes a skill file or package and adds a usable skill.
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** Settings > Skills > New skill > Import a SKILL.md (labels found in the code)
- **Needs:** a SKILL.md file to import
- **Steps:**
  1. Open Settings, then Skills.
  2. Click the control that creates a new skill, which opens the "New skill" dialog.
  3. Click "Import a SKILL.md" and pick a SKILL.md file (.md or text).
  4. Check the name, description and instructions fields fill from the file; then click "Create skill" and compare with Expected.

## S10.25 Skill edit.

- **Expected:** An edit dialog changes a skill's name, description and instructions and saves them.
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** not found in the code. The edit dialog exists in apps/web/features/skills/components/SkillEditorDialog.tsx (title "Edit skill", save button "Save changes"), but the control that opens it for an existing skill was not found in the files read.
- **Needs:** an existing skill

## S10.26 Model incompatibility warning.

- **Expected:** Switching to a model that cannot handle the conversation (images, tools, context) warns and asks before switching.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1536; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1181
- **Where to find it:** Composer > model picker > choose a model that cannot take this chat (labels found in the code)
- **Needs:** a chat with an image or tool use, and two or more models
- **Steps:**
  1. Attach an image, or start a chat with tools or a long conversation.
  2. Open the model picker in the composer and pick a model that cannot handle it.
  3. Read the warning "Switch to <model name>?" with its reasons.
  4. Click "Keep <current model>" to cancel or "Switch anyway" to switch; compare with Expected.

## S10.27 Context-limit warning.

- **Expected:** As a conversation nears or passes the model's context limit, the user gets a clear warning with what to do (trim, compact, new chat).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/model-compatibility.ts:183; apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx:28; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1756
- **Where to find it:** Open a long conversation > the warning appears in the composer footer above the message box (no button) (labels found in the code)
- **Needs:** a conversation large enough to pass the model's context budget (no test account setting found)
- **Steps:**
  1. Sign in and open a conversation with many long messages, or paste a long text into the message box until the conversation is large
  2. Look at the strip above the message box, under the model name
  3. Read the warning text and compare it with Expected: a clear warning with what to do (trim, compact, new chat)

## S10.28 Usage-limit notice.

- **Expected:** When a usage limit is reached, the user sees which limit, when it resets, and what they can do.
- **Code:** done. Evidence moved: apps/web/features/chat/components/InlinePaywallCard.tsx:386 (quoted code not found in the file now); apps/web/lib/services/managed-usage-request-service.ts:424
- **Where to find it:** Send a message in chat once the plan's usage budget is used up; the message shows a limit notice (labels found in the code)
- **Needs:** an account whose usage budget is exhausted
- **Steps:**
  1. Sign in on a Free or paid account whose usage budget is used up for this period
  2. Open a chat and send a message
  3. Read the notice that appears in the chat and check it shows which limit was reached, when it resets, and what to do (Upgrade or add credits)

## S10.29 Credit-purchase dialog.

- **Expected:** From where the limit is hit, a purchase dialog lets the user buy extra credits and completes payment.
- **Code:** partial. Evidence moved: apps/web/lib/server/billing-waitlist-access.ts:22 (quoted code not found in the file now)
- **Known to be unfinished:** owner-held (lead ruling 2026-09-28): the billing waitlist stays on by owner decision; paid checkout, portal and store purchases need a redeemed access code. aaae88832e added AGI_BILLING_WAITLIST_OPEN, which stays unset at deploy until the owner opens paid upgrades
- **Where to find it:** Settings > Billing > Buy credits (labels found in the code)
- **Needs:** a paid or Free account; checkout also needs an access code while the billing waitlist is on
- **Steps:**
  1. Open Settings from the account menu, then choose Billing
  2. Find the section titled Buy credits
  3. Choose a pack or type an amount and press the checkout button
  4. Compare with Expected: a purchase dialog lets the user buy credits and complete payment

## S10.30 Upgrade comparison.

- **Expected:** An upgrade dialog compares plans (price, limits, features) before the user picks one.
- **Code:** done. Evidence moved: apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:145 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:1392 (quoted code not found in the file now); apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:79 (quoted code not found in the file now); apps/web/features/billing/hooks/useUpgradePlanFlow.tsx:134
- **Where to find it:** not found in the code. The upgrade comparison dialog exists with the title 'Upgrade your plan' (or 'Upgrade to <plan>'), but I did not trace which button opens it, so the path is unknown.

## S10.31 Cancel subscription.

- **Expected:** A cancel dialog lets the user cancel their subscription, says when access ends, and confirms.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:908; apps/web/features/billing/services/stripe-payments.ts:112 (quoted code not found in the file now); apps/web/app/api/portal/route.ts:400
- **Where to find it:** Settings > Billing > Cancel plan (labels found in the code)
- **Needs:** a paid account billed through Stripe that is not already ending
- **Steps:**
  1. Open Settings from the account menu, then choose Billing
  2. Find the Cancel plan button in the plan area (shown only on a paid plan billed through Stripe and not already ending)
  3. Press Cancel plan and compare with Expected: a dialog says when access ends and asks to confirm

## S10.32 Payment-method update.

- **Expected:** A payment-method dialog lets the user add or replace the card on file.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:1031; apps/web/app/api/billing/payment-methods/route.ts:78; apps/web/features/billing/services/stripe-payments.ts:112 (quoted code not found in the file now)
- **Where to find it:** Settings > Billing > Add payment method (or Manage cards / Open billing portal) (labels found in the code)
- **Needs:** a paid account with Stripe billing for the portal to open
- **Steps:**
  1. Open Settings from the account menu, then choose Billing
  2. Find the payment method area and press the button; its label is Add payment method when no card is saved, Manage cards when one is, and Open billing portal when the list fails to load
  3. Compare with Expected: a dialog lets the user add or replace the card on file

## S10.33 Reauthentication challenge.

- **Expected:** Before a sensitive account action, a dialog asks the user to prove it is them (code or passkey) and only then proceeds.
- **Code:** done. Evidence moved: apps/web/features/auth/StepUpDialog.tsx:434; apps/web/features/auth/StepUpDialog.tsx:43 (quoted code not found in the file now); apps/web/features/settings/hooks/useStepUp.tsx:158; apps/web/features/settings/hooks/use-settings-queries.ts:307
- **Where to find it:** not found in the code. The 'Confirm it is you' step-up dialog exists and offers email code, passkey or password, but I did not trace which sensitive action opens it (useStepUp hook at apps/web/features/settings/hooks/useStepUp.tsx), so the tester's path is unknown.
- **Needs:** an account with a passkey or an email code for its second check

## S10.34 Microphone permission explanation.

- **Expected:** Before or when the microphone is first needed, the product explains why it wants it and what to do if access is refused.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/web, apps/desktop and packages/ui for microphone wording: found only error text after access fails (apps/desktop/src/hooks/useVoiceTranscription.ts) and an OS permission request (apps/desktop/electron/runtime/systemPermissions.ts); no explanation shown before first use was found.
- **Needs:** a microphone

## S10.35 Screen-sharing source selection.

- **Expected:** When sharing the screen, the user picks which screen or window to share before anything is captured.
- **Code:** done. Evidence moved: apps/desktop/electron/main.ts:872; apps/desktop/electron/main.ts:862; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1832 (quoted code not found in the file now)
- **Where to find it:** Chat > screen share control in the composer > native dialog 'Share a screen or window' (labels found in the code)
- **Needs:** the desktop app and a screen with more than one window open
- **Steps:**
  1. Sign in to the desktop app and open a chat
  2. Press the screen-share control in the message box (its exact label was not traced)
  3. Read the native dialog: it lists each screen and window, plus Cancel
  4. Pick one and compare with Expected: the chosen screen or window is the only one captured

## S10.36 Computer-control permission.

- **Expected:** Before the assistant first controls the computer or browser, a dialog says what it will be able to do and the user grants or refuses it.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/permissionManager.ts:373; apps/desktop/electron/runtime/dispatcher.ts:1085; apps/desktop/electron/runtime/dispatcher.ts:3425
- **Where to find it:** Not a menu: appears the first time the assistant tries to control the computer or browser; native dialog 'Permission required' (labels found in the code)
- **Needs:** the desktop app and a task that triggers computer control
- **Steps:**
  1. Open the desktop app and ask the assistant to do a task that uses the computer or browser
  2. When the native dialog 'Permission required' appears, read the text 'Allow ... to ...?' and the high-impact note if shown
  3. Choose Deny, Allow this session, or Always allow (Never allow appears only for high-impact permissions)
  4. Compare with Expected: the dialog says what it can do and only a granted choice lets it continue

## S10.37 Folder-access permission.

- **Expected:** Before the assistant reads or writes a local folder, the user is asked to grant access to that folder.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx:104; apps/desktop/electron/runtime/dispatcher.ts:2312
- **Where to find it:** Message box + button > Attach from local folder > Choose a folder (labels found in the code)
- **Needs:** the desktop app and a local folder to pick
- **Steps:**
  1. In the desktop app, open a chat and press the + button in the message box
  2. Choose Attach from local folder
  3. Read the dialog text and press Choose a folder to approve a folder
  4. Pick a file inside and compare with Expected: the app asked permission before reading the folder

## S10.38 Tool-action approval.

- **Expected:** When a tool action needs approval, a prompt shows the action and the user approves or denies that one call.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:415; apps/web/lib/hooks/useChatStream.ts:5513; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:566
- **Where to find it:** Chat > a tool action card shows Approve and Deny buttons while it waits (labels found in the code)
- **Needs:** a task that needs a tool approval
- **Steps:**
  1. Ask the assistant to do a task that calls a tool which needs approval
  2. When the tool card appears in the chat, read the action it shows
  3. Press Approve or Deny on that one card
  4. Compare with Expected: only that single call is approved or denied

## S10.39 Sensitive-data transfer approval.

- **Expected:** Before private or sensitive data is sent to an outside destination, the user is asked to approve that transfer and told what goes where.
- **Code:** done. Evidence present: packages/contracts/types/src/tool-approval-policy.ts:38; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1086
- **Where to find it:** Chat > tool approval card, the high-risk warning text (labels found in the code)
- **Needs:** a task that sends chat data outside, such as a connector or web action
- **Steps:**
  1. Ask the assistant to do a task that could send private chat data to an outside service
  2. When the approval card appears, read the warning text
  3. Check that it says where the data goes before you press Approve
  4. Compare with Expected: the user is asked to approve the transfer and told what goes where

## S10.40 Remote-device pairing.

- **Expected:** A pairing dialog links a phone or another device to this machine by code or QR, bound to the signed-in account.
- **Code:** done. Evidence moved: apps/web/features/desktop-host/components/RemoteControlSection.tsx:50 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2659
- **Where to find it:** Settings > Capabilities > Remote Control > Pair a phone (labels found in the code)
- **Needs:** a paid plan (the code shows 'Remote Control comes with paid plans' otherwise) and the mobile app on a phone
- **Steps:**
  1. In the desktop app, open Settings from the account menu, then choose Capabilities
  2. Find Remote Control and press Pair a phone
  3. Read the pairing dialog 'Pair your phone' and the code or QR shown
  4. Compare with Expected: the code is for one phone only and is tied to the signed-in account

## S10.41 Unsaved-changes warning.

- **Expected:** Leaving an editor with unsaved edits warns the user and lets them keep editing or discard.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/UnsavedChanges.tsx:108; packages/ui/ui/src/primitives/UnsavedChanges.tsx:26; apps/web/features/projects/components/ProjectSettingsDialog.tsx:119; packages/ui/unified-chat/src/components/MemoryEditor.tsx:235
- **Where to find it:** Any editor with unsaved edits (for example project settings), then close it (labels found in the code)
- **Steps:**
  1. Open an editor such as a project's settings
  2. Change a field without saving
  3. Close the editor or leave the page
  4. Compare with Expected: the dialog 'Discard unsaved changes?' offers Keep editing and Discard

## S10.42 Edit-conflict resolution.

- **Expected:** When the same item was changed elsewhere, the user sees both versions and chooses which to keep (or merges).
- **Code:** done. Evidence present: apps/web/app/api/chat/conversations/[id]/route.ts:261; apps/web/features/chat/components/DraftConflictDialog.tsx:46; apps/web/features/chat/hooks/use-conversation-draft-sync.ts:328
- **Where to find it:** Two browser tabs or devices on the same chat: edit the unsent draft in one, then in the other, when the conflict appears (labels found in the code)
- **Needs:** a second tab or device signed in to the same account
- **Steps:**
  1. Open the same chat in two tabs or on two devices, both signed in to one account
  2. Type in the message box in tab 1 but do not send
  3. Type a different draft in the same chat in tab 2 and wait
  4. Return to tab 1 and compare with Expected: the dialog 'Choose which draft to keep' shows both drafts and offers Keep this version or Use the other version

## S10.43 Export options.

- **Expected:** An export dialog lets the user pick a format and exports the conversation or item to a file.
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:198; apps/web/features/chat/pages/WebChatPage.tsx:7938
- **Where to find it:** Conversation title menu > Export… (labels found in the code)
- **Needs:** a chat with messages
- **Steps:**
  1. Open a chat and open its title menu (the conversation title at the top)
  2. Choose Export…
  3. Read the export dialog and pick a format
  4. Compare with Expected: a file is exported for the chosen format

## S10.44 Report-content dialog.

- **Expected:** A report dialog lets the user flag an answer (with a reason) and the report reaches moderation.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4072; apps/web/features/chat/components/messages/MessageBubble.tsx:1174; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Chat > an assistant answer > its menu > Report this response (labels found in the code)
- **Needs:** a chat with an assistant answer
- **Steps:**
  1. Open a chat with an answer from the assistant
  2. Open that answer's menu and choose Report this response
  3. Read the toast that appears
  4. Compare with Expected: the report is sent to the moderation team after the user gives a reason

## S10.45 Feedback submission.

- **Expected:** A feedback dialog, reachable product-wide, sends the user's message to the team's feedback store.
- **Code:** done. Evidence present: apps/web/shared/components/layout/AccountMenuItems.tsx:105; apps/web/shared/components/layout/WebAppShell.tsx:619; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:166
- **Where to find it:** Account menu > Get help > Send feedback (labels found in the code)
- **Steps:**
  1. Open the account menu from your name or avatar
  2. Choose Get help, then Send feedback
  3. Pick a Feedback type, type a message, and press send
  4. Compare with Expected: the message is saved to the team's feedback store and the dialog confirms it

## S10.46 Diagnostic-sharing consent.

- **Expected:** Before diagnostics or crash reports leave the device, the user is told what is included and chooses (or sets a preference that is honoured).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PrivacySection.tsx:51 (quoted code not found in the file now); apps/web/features/settings/sections/PrivacySection.tsx:211 (quoted code not found in the file now); apps/web/lib/sentry-shared.ts:94
- **Where to find it:** Settings > Privacy > Share crash and error reports (labels found in the code)
- **Steps:**
  1. Open Settings from the account menu, then choose Privacy
  2. Find the switch Share crash and error reports and read its description
  3. Turn it on or off, then check the saved state stays after reload
  4. Compare with Expected: the user is told what is included before choosing

## S10.47 Data-export request.

- **Expected:** A data-export dialog requests a copy of the account's data and delivers it as a download.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:186 (quoted code not found in the file now)
- **Where to find it:** Settings > Privacy > Export data (labels found in the code)
- **Needs:** an account that can request an export (email delivery is mentioned in the code)
- **Steps:**
  1. Open Settings from the account menu, then choose Privacy
  2. Find the Export data row and press the Export data button
  3. Wait while it shows Preparing…, then look for Download your export or Download part N of M
  4. Compare with Expected: the download link is delivered and opens as a file

## S10.48 Account-deletion request.

- **Expected:** An account-deletion dialog explains what is deleted and requires explicit confirmation before deleting the account.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:186 (quoted code not found in the file now); apps/web/features/settings/sections/AccountSection.tsx:545; apps/web/features/settings/hooks/use-settings-queries.ts:436 (quoted code not found in the file now); apps/web/app/api/user/delete-account/route.ts:617
- **Where to find it:** Settings > Account > Delete account (labels found in the code)
- **Needs:** an account that is not blocked by a plan or a pending payment
- **Steps:**
  1. Open Settings from the account menu, then choose Account
  2. Press Delete account (the button is disabled when a plan or payment blocks it)
  3. In the dialog Delete your account?, read the text and type DELETE in the box
  4. Press the confirm button and compare with Expected: the dialog says what is deleted and deletion is scheduled, with a way to cancel before the deadline
