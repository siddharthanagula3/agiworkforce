---
id: "PLAN-web-010"
type: "test-plan"
title: "Web · 10. Modal and dialog inventory"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "10"
---
# Web · 10. Modal and dialog inventory

44 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S10.01 Create Project.

- **Expected:** A create-project dialog (or command) asks for a name and creates the project in the account.
- **Code:** done. Evidence moved: apps/web/app/chat/projects/page.tsx:373; apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx:71; apps/web/app/api/projects/route.ts:162; apps/web/app/api/projects/route.ts:199 (quoted code not found in the file now)
- **Where to find it:** Sidebar > New project (icon button), or Projects > New project (labels found in the code)
- **Steps:**
  1. Sign in and look at the left sidebar.
  2. Click the New project button (icon only, no visible text in the sidebar).
  3. In the Create project dialog, type a name in the Project name field.
  4. Click Create project.
  5. Look for the new project in the sidebar Projects list and on the Projects page.

## S10.02 Rename conversation.

- **Expected:** The user opens rename on a conversation, edits the title in a field or prompt, and the new title is saved.
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:153; packages/ui/ui/src/sidebar/SessionItem.tsx:343; apps/web/shared/components/layout/WebAppShell.tsx:345
- **Where to find it:** Chat header > Conversation options > Rename (also sidebar row > More options > Rename) (labels found in the code)
- **Steps:**
  1. Open any chat.
  2. Click the Conversation options control in the chat title area.
  3. Click Rename.
  4. Type a new title and press Enter.
  5. Check that the header and the sidebar row show the new title.

## S10.03 Move conversation.

- **Expected:** A move dialog or menu lets the user pick a project for a conversation and files it there.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:414; apps/web/shared/components/layout/WebAppShell.tsx:379; apps/web/features/chat/components/ConversationTitleMenu.tsx:167
- **Where to find it:** Chat header > Conversation options > Move to project (also sidebar row > More options > Move to project) (labels found in the code)
- **Needs:** at least one project
- **Steps:**
  1. Make sure at least one project exists.
  2. Open a chat and click Conversation options.
  3. Click Move to project and pick a project name.
  4. Check that the chat now appears inside that project.

## S10.04 Duplicate resource.

- **Expected:** A duplicate action creates an independent copy of a conversation or project and says where the copy is.
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:209; apps/web/features/chat/pages/WebChatPage.tsx:7422
- **Where to find it:** Chat header > Conversation options > Duplicate as branch (labels found in the code)
- **Steps:**
  1. Open a chat with some messages.
  2. Click Conversation options.
  3. Click Duplicate as branch.
  4. Look for the new copy and for any message that says where it is.

## S10.05 Archive confirmation.

- **Expected:** Archiving asks to confirm, or confirms afterwards with a way to undo, and says where archived items can be found.
- **Code:** done. Evidence present: apps/web/shared/components/layout/sidebar-session-actions.ts:61; apps/web/shared/components/layout/WebAppShell.tsx:362; apps/desktop/src/features/v3/Sidebar.tsx:908
- **Where to find it:** Sidebar > chat row > More options > Archive (also chat header > Conversation options > Archive) (labels found in the code)
- **Steps:**
  1. Click More options on a chat row in the sidebar.
  2. Click Archive.
  3. No confirm question is expected. Look for the notice with Undo and View archived.
  4. Click View archived and check that the chat is there.
  5. Click Undo on a second chat and check that it returns to the list.

## S10.06 Delete confirmation.

- **Expected:** Deleting asks for confirmation that names the item before anything is removed.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:397; apps/web/shared/components/layout/WebAppShell.tsx:337; apps/web/features/chat/components/ConversationTitleMenu.tsx:227
- **Where to find it:** Chat header > Conversation options > Delete (also sidebar row > More options > Delete) (labels found in the code)
- **Needs:** a test chat you can delete
- **Steps:**
  1. Open a chat or use the sidebar row menu.
  2. Click Delete.
  3. Read the dialog title, which names the chat.
  4. Click Cancel first and check that nothing is removed.
  5. Repeat and confirm only if you are willing to delete a test chat.

## S10.07 Permanent-delete confirmation.

- **Expected:** An irreversible delete says plainly that it cannot be undone and needs an explicit second confirmation.
- **Code:** done. Evidence present: apps/web/shared/components/layout/sidebar-session-actions.ts:102; apps/web/shared/components/layout/WebAppShell.tsx:337
- **Where to find it:** Sidebar > Library > Recently deleted > pick an item > Delete permanently (labels found in the code)
- **Needs:** an item already in Recently deleted (delete one in Library first)
- **Steps:**
  1. Click Library in the sidebar.
  2. Click Recently deleted.
  3. Click the three-dot or action control on an item and click Delete permanently.
  4. Read the dialog title and text, which say it cannot be undone and asks for a second confirmation.
  5. Cancel first and check the item is still in Recently deleted.

## S10.08 Share conversation.

- **Expected:** A share dialog creates a link to the conversation, shows it for copying, and states who can open it.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:7502; apps/web/features/chat/components/share/ShareConversationDialog.tsx:444; apps/web/features/chat/hooks/use-share-conversation.ts:177 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E093 [UI_ONLY; dialog and expiry choices]: Share explains read-only snapshot, anyone-with-link access and 1/7/30-day expiry. No public link created.
- **Where to find it:** Chat header > Conversation options > Share…  (also sidebar row > More options > Share) (labels found in the code)
- **Needs:** a chat with messages; creating a link makes a real public link
- **Steps:**
  1. Open a chat and click Conversation options, then Share….
  2. Read the dialog text: read-only snapshot, who can open it, and the expiry choices.
  3. Check the Link expires after choices (1, 7 or 30 days).
  4. Click Create public link only if you accept that a real public link is created, then copy it.
  5. Check the dialog states that anyone with the link can read the snapshot.

## S10.10 Share artifact.

- **Expected:** An artifact share dialog publishes it to a link, lets the user copy it and choose who can open it, and can take it down.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2924; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3056; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:88; apps/web/app/api/artifacts/publish/route.ts:42
- **Where to find it:** Chat > open an artifact in the artifact panel > Publish (labels found in the code)
- **Needs:** a test artifact; publishing makes a live link
- **Steps:**
  1. Open an artifact (a document or page) in the artifact preview.
  2. Click Publish.
  3. Read the confirm dialog: Share with workspace or the public text about anyone holding the link.
  4. Confirm only on a test artifact, then copy the link from the bar or the toast.
  5. Check that the published link opens.

## S10.11 Publish generated application.

- **Expected:** A publish dialog puts a generated app or page on a live URL and hands back the link.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2924; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3056; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:88; apps/web/app/api/artifacts/publish/route.ts:42
- **Where to find it:** Chat > open a generated app or page artifact > Publish (labels found in the code)
- **Needs:** a generated app or page; publishing makes a live link
- **Steps:**
  1. Open a generated app or page in the artifact preview.
  2. Click Publish.
  3. Confirm when the dialog asks.
  4. Read the toast and the link bar, which give the live URL.
  5. Open the URL in a new tab.

## S10.12 Manage link access.

- **Expected:** For a shared link the user can see its access (who, expiry) and change or revoke it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/share/ShareConversationDialog.tsx:223; apps/web/features/chat/hooks/use-share-conversation.ts:212 (quoted code not found in the file now)
- **Where to find it:** Settings > Shared links > Revoke (also chat > Conversation options > Share… > Revoke share) (labels found in the code)
- **Needs:** a shared link you made
- **Steps:**
  1. Open Settings and go to Shared links.
  2. Read each link's title and access.
  3. Click Revoke on a test link.
  4. Read the confirm dialog Revoke this public link? and click cancel first.
  5. Confirm and check the link is gone from the list.

## S10.13 Invite member.

- **Expected:** An invite dialog takes an email and role, sends the invitation, and lists pending invites to revoke or renew.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TeamSection.tsx:976; apps/web/features/settings/sections/TeamSection.tsx:1119; apps/web/app/api/settings/team/invitations/route.ts:92; apps/web/app/api/settings/team/invitations/[invitationId]/route.ts:130
- **Where to find it:** Settings > Workspace > Invite teammate (labels found in the code)
- **Needs:** a workspace owner or admin account with a free seat
- **Steps:**
  1. Open Settings and click Workspace.
  2. In Invite teammate, type an email in Invitee email and pick a role.
  3. Click Create invitation.
  4. Check the Pending invitations list shows the email.
  5. Click Renew invitation or Revoke on a test invite.

## S10.14 Change member role.

- **Expected:** A role dialog changes a member's role after confirmation, and the server enforces the new role.
- **Code:** done. Evidence moved: apps/web/features/workspace-console/components/WorkspaceRoles.tsx:239; apps/web/features/settings/sections/TeamSection.tsx:1651; apps/web/app/api/settings/team/[memberId]/route.ts:22; apps/web/app/api/settings/team/[memberId]/route.ts:236 (quoted code not found in the file now)
- **Where to find it:** Settings > Workspace > change a member's role (role on the member row) (labels found in the code)
- **Needs:** an admin account and a second test member
- **Steps:**
  1. Open Settings > Workspace as an owner or admin.
  2. Find another member and open the role choice on their row.
  3. Pick a different role.
  4. Read the dialog Change member role? and click Change role.
  5. Check that the role label on the row changed.

## S10.15 Transfer ownership.

- **Expected:** The owner picks another member and confirms, and ownership moves to them.
- **Code:** done. Evidence present: apps/web/features/settings/sections/TeamSection.tsx:1407; apps/web/features/settings/sections/TeamSection.tsx:1495; apps/web/app/api/settings/organization/transfer-ownership/route.ts:43
- **Where to find it:** Settings > Workspace > Transfer ownership (labels found in the code)
- **Needs:** an owner account and a second test member
- **Steps:**
  1. Open Settings > Workspace as the owner.
  2. Find the card with the text Hand the owner role to another member while keeping your own seat.
  3. Pick another member and click Transfer ownership.
  4. Read the dialog Transfer ownership? and confirm only with a test member.
  5. Check that the owner label moved to that member.

## S10.16 Select sources.

- **Expected:** A dialog lets the user choose which sources (sites, files, apps) an answer or research run may use.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchActivity.tsx:690; apps/web/features/chat/components/research/ResearchActivity.tsx:808; apps/web/features/chat/components/messages/MessageBubble.tsx:2626
- **Where to find it:** Chat > a research run > Sources for this run > Add a source (labels found in the code)
- **Needs:** a research run
- **Steps:**
  1. Start a research run in chat.
  2. Read the text above the list: Searching the whole web. Add a source to narrow it. or Sources for this run.
  3. Click Add a source and pick a source.
  4. Click the remove control on a source to take it out.
  5. Check the list changes and the run uses the chosen sources.

## S10.17 Upload from device.

- **Expected:** Choosing upload opens the device file chooser and the picked files attach to the message.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:892; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7011; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2301; apps/web/features/chat/pages/WebChatPage.tsx (text found, layout changed); apps/web/features/chat/pages/WebChatPage.tsx:7670
- **Where to find it:** Composer + button > Add photos & files (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. In a chat, click the + button at the left of the message box.
  2. Click Add photos & files.
  3. Pick a file in the device file chooser.
  4. Check that the file chip appears in the message box before you send.
  5. Send and check the file is attached to the message.

## S10.18 Connect external account.

- **Expected:** A connect dialog starts the service's real authorization (OAuth or key) and ends with the account connected.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/ConnectorDetailView.tsx:292 (quoted code not found in the file now); apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:757; apps/web/app/api/connectors/route.ts:690
- **Where to find it:** Settings > Connectors > pick a service > Connect (labels found in the code)
- **Needs:** an outside account (for example Google) to sign in with
- **Steps:**
  1. Open Settings and click Connectors.
  2. Click a service that is not connected yet.
  3. Click Connect.
  4. Complete the sign-in page of the service in the browser.
  5. Return to the app and check the service shows as connected.

## S10.19 Reauthorize connection.

- **Expected:** An expired connection offers a reconnect dialog that re-runs authorization and keeps its settings.
- **Code:** partial. Evidence present: packages/ui/ui/src/directory/ConnectorDetailView.tsx:306
- **Known to be unfinished:** live-check: with a revoked or expired OAuth grant (e.g. Google Drive), open Connectors on web and in Electron: Reconnect shows beside Disconnect and re-runs OAuth, settings and tool permissions persist, and chat shows the agi_reconnect card
- **Where to find it:** not found in the code. Searched ConnectorDetailView.tsx for Reconnect: the only hits were a copy function (connectorReconnectCopy in packages/ui/ui/src/directory/constants.ts) and no button label. The message reads Name needs reconnecting. Its tools stop until you do; its settings are kept. The code is partial per the ledger.
- **Needs:** a connection with a revoked or expired grant (for example Google Drive)

## S10.20 Select among connected accounts.

- **Expected:** When a service has several connected accounts, a dialog lets the user pick which one to use or make default.
- **Code:** done. Evidence present: apps/web/app/api/connectors/[connectorId]/accounts/route.ts:37
- **Where to find it:** not found in the code. ConnectorAccountSummary.tsx lists accounts, but I found no default or account-switch label in packages/ui or apps/web/features/connectors.
- **Needs:** two or more connected accounts for one service

## S10.21 Install Plugin.

- **Expected:** An install dialog shows the plugin and installs it into the account or workspace.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/PluginDetailView.tsx:899; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1363; apps/web/app/api/plugins/installations/route.ts:58 (quoted code not found in the file now); apps/web/features/plugins/server/directory/install.ts:311
- **Where to find it:** Settings > Plugins > pick a plugin > Install (labels found in the code)
- **Steps:**
  1. Open Settings and click Plugins.
  2. Open a plugin from the list.
  3. Click Install.
  4. Read the confirm dialog titled Install <plugin name>? and click Cancel first.
  5. Install a test plugin and check it shows as Installed.

## S10.22 Review Plugin permissions.

- **Expected:** Before installing or updating, a dialog lists the permissions the plugin requires and asks the user to accept them.
- **Code:** done. Evidence present: apps/web/features/directory/services/plugins-directory.ts:694; apps/web/features/directory/services/plugins-directory.ts:737; packages/ui/ui/src/directory/DirectoryPanel.tsx:409; packages/ui/ui/src/directory/PluginDetailView.tsx:1066
- **Where to find it:** Settings > Plugins > pick a plugin > Permissions (before Install) (labels found in the code)
- **Needs:** a plugin that lists permissions
- **Steps:**
  1. Open Settings > Plugins and open a plugin.
  2. Scroll to the Permissions heading.
  3. Read the copy: What this plugin says it needs. Installing it agrees to these; you can remove it at any time.
  4. Click Install and read the confirm dialog.
  5. Check the dialog lists the permissions, then cancel if you do not agree.

## S10.23 Update Plugin.

- **Expected:** An update dialog offers a newer plugin version, shows what changes, and applies it.
- **Code:** done. Evidence present: apps/web/features/directory/services/plugins-directory.ts:1565; packages/ui/ui/src/directory/DirectoryPanel.tsx:639; packages/ui/ui/src/directory/PluginDetailView.tsx:1058
- **Where to find it:** Settings > Plugins > an installed plugin > Switch version (labels found in the code)
- **Needs:** an installed plugin with another version
- **Steps:**
  1. Open Settings > Plugins and open an installed plugin.
  2. Click Switch version and pick a different version.
  3. Read the confirm dialog Switch to version <version>? and any It also asks for: or What changed text.
  4. Cancel first, then confirm on a test plugin.
  5. Check the installed version label changed.

## S10.24 Skill import.

- **Expected:** An import dialog takes a skill file or package and adds a usable skill.
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** Settings > Skills > New skill > Import a SKILL.md (labels found in the code)
- **Needs:** a SKILL.md file
- **Steps:**
  1. Open Settings and click Skills.
  2. Click New skill.
  3. Click Import a SKILL.md and choose a SKILL.md file.
  4. Check that Name, Description and Instructions fill in.
  5. Click Create skill and check the skill is in the list.

## S10.25 Skill edit.

- **Expected:** An edit dialog changes a skill's name, description and instructions and saves them.
- **Code:** done. Evidence present: apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** Settings > Skills > pick a skill > Edit (labels found in the code)
- **Needs:** a skill you created
- **Steps:**
  1. Open Settings and click Skills.
  2. Click Edit on a skill you made.
  3. In the Edit skill dialog, change Name, Description or Instructions.
  4. Click Save changes.
  5. Reopen the skill and check the new values stay.

## S10.26 Model incompatibility warning.

- **Expected:** Switching to a model that cannot handle the conversation (images, tools, context) warns and asks before switching.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1536; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1181
- **Where to find it:** Chat > composer model picker > pick a model that cannot take the chat content (labels found in the code)
- **Needs:** a model that lacks a capability in use (for example images), which depends on the model catalog
- **Steps:**
  1. Attach an image or turn on a feature the chosen model cannot handle.
  2. Open the model picker at the bottom of the message box.
  3. Pick a model that does not support it.
  4. Read the dialog that starts Switch to <model>? and its findings.
  5. Click Keep to stay, or Switch anyway to switch, and check which model is selected.

## S10.27 Context-limit warning.

- **Expected:** As a conversation nears or passes the model's context limit, the user gets a clear warning with what to do (trim, compact, new chat).
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/model-compatibility.ts:183; apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx:28; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1756
- **Where to find it:** Message box > model picker (open the model name under the message box) > look at the bottom of the open list (labels found in the code)
- **Needs:** a long conversation near the model's context limit
- **Steps:**
  1. Sign in and open a conversation that is long (near the model's context limit), or paste a very long message into a new chat
  2. Open the model picker under the message box
  3. Read the warning at the bottom of the open picker
  4. Compare the warning with Expected: it should say the conversation is near or over the limit and what to do (trim, compact, new chat)

## S10.28 Usage-limit notice.

- **Expected:** When a usage limit is reached, the user sees which limit, when it resets, and what they can do.
- **Code:** done. Evidence moved: apps/web/features/chat/components/InlinePaywallCard.tsx:386 (quoted code not found in the file now); apps/web/lib/services/managed-usage-request-service.ts:424
- **Where to find it:** Chat > keep sending messages until a usage limit is reached; the limit card appears in the chat. For the usage screen: the 'Usage details' button in the composer status line > Settings > Usage (labels found in the code)
- **Needs:** a Free account that has used its allowance
- **Steps:**
  1. Use a Free account until its usage allowance is used up
  2. Send a message in a chat
  3. Read the limit card in the chat: it should name the limit, say when it resets and offer a next step
  4. Compare with Expected: the code text is 'Usage budget exhausted for this billing period. Upgrade your plan or add credits.'

## S10.29 Credit-purchase dialog.

- **Expected:** From where the limit is hit, a purchase dialog lets the user buy extra credits and completes payment.
- **Code:** partial. Evidence moved: apps/web/lib/server/billing-waitlist-access.ts:22 (quoted code not found in the file now)
- **Known to be unfinished:** owner-held (lead ruling 2026-09-28): the billing waitlist stays on by owner decision; paid checkout, portal and store purchases need a redeemed access code. aaae88832e added AGI_BILLING_WAITLIST_OPEN, which stays unset at deploy until the owner opens paid upgrades
- **Where to find it:** not found in the code. No credit-purchase dialog was found. Searched apps/web for credit purchase and top-up dialogs; the only code found is the billing waitlist gate in apps/web/lib/server/billing-waitlist-access.ts, whose message is 'Paid upgrades are opening in stages. Join the waitlist or enter an access code to continue.' (the file says the top-up panel exists in apps/web/features/billing/components/TopUpPanel.tsx but its opening control was not traced).
- **Needs:** a Free account, and the owner must have opened paid upgrades (the billing waitlist is on by owner decision)

## S10.30 Upgrade comparison.

- **Expected:** An upgrade dialog compares plans (price, limits, features) before the user picks one.
- **Code:** done. Evidence moved: apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:145 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:1392 (quoted code not found in the file now); apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:79 (quoted code not found in the file now); apps/web/features/billing/hooks/useUpgradePlanFlow.tsx:134
- **Earlier check in the running app:** PASS: E096 [PASS; dialog and period interaction]: Create image opens Upgrade plan rather than generation. Monthly/Annual switch works and Basic stays $7/month with Monthly only label. Initial dialog lists Free/Basic and See all plans; purchase not attempted. Video entry also carries Upgrade label, generation not attempted.
- **Where to find it:** not found in the code. The upgrade comparison dialog exists (UpgradePlanDialog.tsx, opened through apps/web/features/billing/hooks/useUpgradePlanFlow.tsx), and 'See all plans' is its button, but the control that opens it was not found, so the path is unknown.
- **Needs:** a Free account

## S10.31 Cancel subscription.

- **Expected:** A cancel dialog lets the user cancel their subscription, says when access ends, and confirms.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:908; apps/web/features/billing/services/stripe-payments.ts:112 (quoted code not found in the file now); apps/web/app/api/portal/route.ts:400
- **Where to find it:** Settings > Billing > Cancel plan (some labels not found in the code; trust the screen)
- **Needs:** a paid account billed by Stripe
- **Steps:**
  1. Sign in with a paid plan billed by Stripe (not Apple or Google)
  2. Open Settings, then Billing
  3. Click Cancel plan (it is not shown when the plan is already set to end)
  4. Look at where you land: the code opens Stripe's billing portal in a new page with the cancel flow
  5. Compare with Expected: Expected asks for an in-app cancel dialog that says when access ends; the code sends the user to Stripe's portal instead

## S10.32 Payment-method update.

- **Expected:** A payment-method dialog lets the user add or replace the card on file.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:1031; apps/web/app/api/billing/payment-methods/route.ts:78; apps/web/features/billing/services/stripe-payments.ts:112 (quoted code not found in the file now)
- **Where to find it:** Settings > Billing > Payment > Add payment method (or Manage cards when a card is saved) (labels found in the code)
- **Needs:** a paid account billed by Stripe
- **Steps:**
  1. Sign in with a paid account billed by Stripe
  2. Open Settings, then Billing
  3. Find the Payment heading and click Add payment method (or Manage cards)
  4. Look at where you land: the code opens Stripe's billing portal, not a card form in the app
  5. Compare with Expected: a payment-method dialog in the app that adds or replaces the card

## S10.33 Reauthentication challenge.

- **Expected:** Before a sensitive account action, a dialog asks the user to prove it is them (code or passkey) and only then proceeds.
- **Code:** done. Evidence moved: apps/web/features/auth/StepUpDialog.tsx:434; apps/web/features/auth/StepUpDialog.tsx:43 (quoted code not found in the file now); apps/web/features/settings/hooks/useStepUp.tsx:158; apps/web/features/settings/hooks/use-settings-queries.ts:307
- **Where to find it:** Settings > Security > (a sensitive action in the advanced account security panel) (labels found in the code)
- **Needs:** a second factor or passkey set up on the account
- **Steps:**
  1. Open Settings, then Security
  2. Start a sensitive action in the advanced account security panel
  3. When asked, read the dialog titled 'Confirm it is you'
  4. Choose a sign-in method (code, passkey or password) and check that the action only continues after the check passes

## S10.34 Microphone permission explanation.

- **Expected:** Before or when the microphone is first needed, the product explains why it wants it and what to do if access is refused.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No explanation shown before the first microphone request was found. Searched apps/web and packages/ui for microphone copy. Found only messages shown after access is refused: 'Microphone permission denied. Please allow access in your browser settings.' (apps/web/features/chat/stores/voice-input-store.ts) and 'Microphone access was denied. Allow the microphone to use voice mode.' (apps/web/features/chat/lib/live-voice-session.ts).
- **Needs:** a microphone, live-web

## S10.35 Screen-sharing source selection.

- **Expected:** When sharing the screen, the user picks which screen or window to share before anything is captured.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1098 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4919 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1947 (quoted code not found in the file now)
- **Where to find it:** not found in the code. The screen capture call is navigator.mediaDevices.getDisplayMedia in packages/ui/unified-chat/src/components/AttachmentMenu.tsx (line 613, the screenshot action), and the live source name 'Live screen' is in the same file (line 346). The menu item words that start this were not found, so the path is unknown. The browser's own screen picker is what the user sees before capture, not an app dialog.
- **Needs:** a browser that offers screen capture, and a microphone is not needed

## S10.38 Tool-action approval.

- **Expected:** When a tool action needs approval, a prompt shows the action and the user approves or denies that one call.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/ToolCallCard.tsx:415; apps/web/lib/hooks/useChatStream.ts:5513; apps/web/app/api/llm/v1/chat/completions/approve/route.ts:566
- **Where to find it:** Chat > ask for a tool action that needs approval (a connector or plugin tool) > the approval card in the chat (labels found in the code)
- **Needs:** a connected tool or connector
- **Steps:**
  1. Connect a tool or connector, then ask the chat to use it
  2. When the card appears, read 'This tool requires approval before execution.'
  3. Click Allow, or Deny to refuse this one call (Allow for this chat appears when the action is not high risk)
  4. Check that only that one call runs or stops, as Expected says

## S10.39 Sensitive-data transfer approval.

- **Expected:** Before private or sensitive data is sent to an outside destination, the user is asked to approve that transfer and told what goes where.
- **Code:** done. Evidence present: packages/contracts/types/src/tool-approval-policy.ts:38; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1086
- **Where to find it:** Chat > ask for an action that would send private data to a website, a search engine or a connector > the approval card in the chat (labels found in the code)
- **Needs:** web search or an outside connector
- **Steps:**
  1. Turn on web search or connect an outside tool, then ask for something that uses it
  2. When the approval card appears, read the high-risk warning
  3. Read what it says goes where (the destination text)
  4. Click Deny if the destination is not wanted, and check that nothing is sent

## S10.41 Unsaved-changes warning.

- **Expected:** Leaving an editor with unsaved edits warns the user and lets them keep editing or discard.
- **Code:** done. Evidence present: packages/ui/ui/src/primitives/UnsavedChanges.tsx:108; packages/ui/ui/src/primitives/UnsavedChanges.tsx:26; apps/web/features/projects/components/ProjectSettingsDialog.tsx:119; packages/ui/unified-chat/src/components/MemoryEditor.tsx:235
- **Where to find it:** Projects > (open a project) > Project settings (labels found in the code)
- **Needs:** a project you can edit
- **Steps:**
  1. Open a project and then Project settings
  2. Change the name or instructions, but do not save
  3. Close the dialog or click a link to another page
  4. Look for the warning: 'Your changes to this project have not been saved. If you leave now, they will be lost.' with a choice to keep editing or discard

## S10.42 Edit-conflict resolution.

- **Expected:** When the same item was changed elsewhere, the user sees both versions and chooses which to keep (or merges).
- **Code:** done. Evidence present: apps/web/app/api/chat/conversations/[id]/route.ts:261; apps/web/features/chat/components/DraftConflictDialog.tsx:46; apps/web/features/chat/hooks/use-conversation-draft-sync.ts:328
- **Where to find it:** No menu: open the same conversation in two browser tabs (or two devices), type an unsent draft in one, then change the draft in the other (labels found in the code)
- **Needs:** two browser tabs or two devices signed in to the same account
- **Steps:**
  1. Open the same conversation in two tabs
  2. Type a draft in one tab
  3. Type a different draft in the other tab, then go back to the first tab
  4. Look for the dialog 'Choose which draft to keep' with 'Here' and 'Elsewhere' versions
  5. Click Keep this version or Use the other version and check the draft matches your choice

## S10.43 Export options.

- **Expected:** An export dialog lets the user pick a format and exports the conversation or item to a file.
- **Code:** done. Evidence present: apps/web/features/chat/components/ConversationTitleMenu.tsx:198; apps/web/features/chat/pages/WebChatPage.tsx:7938
- **Where to find it:** Conversation title menu > Export…, then the 'Export Chat History' dialog (labels found in the code)
- **Needs:** a conversation with messages
- **Steps:**
  1. Open a conversation that has messages
  2. Open its title menu and choose Export…
  3. In 'Export Chat History', pick a format (Markdown, PDF, Word Document, HTML or JSON)
  4. Click Export Markdown (or the chosen format name) and check the file downloads with the conversation in it

## S10.44 Report-content dialog.

- **Expected:** A report dialog lets the user flag an answer (with a reason) and the report reaches moderation.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4072; apps/web/features/chat/components/messages/MessageBubble.tsx:1174; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Open the menu on an assistant answer > Report this response (labels found in the code)
- **Needs:** a chat with at least one answer
- **Steps:**
  1. Send a message and wait for the answer
  2. Open the menu on that answer
  3. Choose Report this response
  4. Check the item changes to Reported (or Reporting… while sending) and that the report is recorded

## S10.45 Feedback submission.

- **Expected:** A feedback dialog, reachable product-wide, sends the user's message to the team's feedback store.
- **Code:** done. Evidence present: apps/web/shared/components/layout/AccountMenuItems.tsx:105; apps/web/shared/components/layout/WebAppShell.tsx:619; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:166
- **Where to find it:** Account menu > Send feedback, then the 'Share feedback' dialog (labels found in the code)
- **Steps:**
  1. Open the account menu
  2. Click Send feedback
  3. Pick a feedback type (General feedback, Something is broken or Feature request) and write a message
  4. Click Send feedback in the dialog and check the success message appears

## S10.46 Diagnostic-sharing consent.

- **Expected:** Before diagnostics or crash reports leave the device, the user is told what is included and chooses (or sets a preference that is honoured).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PrivacySection.tsx:51 (quoted code not found in the file now); apps/web/features/settings/sections/PrivacySection.tsx:211 (quoted code not found in the file now); apps/web/lib/sentry-shared.ts:94
- **Where to find it:** Settings > Privacy > Share crash and error reports (labels found in the code)
- **Steps:**
  1. Open Settings, then Privacy
  2. Read the switch 'Share crash and error reports' and its line: 'Send error reports, with sensitive fields removed.'
  3. Turn the switch on, then off
  4. Check the switch state persists after reloading the page

## S10.47 Data-export request.

- **Expected:** A data-export dialog requests a copy of the account's data and delivers it as a download.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:186 (quoted code not found in the file now)
- **Where to find it:** Settings > Privacy > Export data (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Privacy
  2. Find the row 'Export data' with 'Download a copy of your account data and files.'
  3. Click Export data (it shows Preparing… while it works)
  4. Check a file downloads and that it contains your account data

## S10.48 Account-deletion request.

- **Expected:** An account-deletion dialog explains what is deleted and requires explicit confirmation before deleting the account.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:186 (quoted code not found in the file now); apps/web/features/settings/sections/AccountSection.tsx:545; apps/web/features/settings/hooks/use-settings-queries.ts:436 (quoted code not found in the file now); apps/web/app/api/user/delete-account/route.ts:617
- **Where to find it:** Settings > Account > Delete account > Delete (labels found in the code)
- **Needs:** an account that can schedule deletion (some paid plans are blocked)
- **Steps:**
  1. Open Settings, then Account
  2. Find the row Delete account and click Delete
  3. Read the dialog 'Delete your account?' and what it deletes
  4. Type DELETE in the box and read the button Schedule deletion (do not click it unless you want to schedule deletion)
