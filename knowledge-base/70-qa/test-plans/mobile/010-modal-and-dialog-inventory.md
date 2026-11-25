---
id: "PLAN-mobile-010"
type: "test-plan"
title: "Mobile · 10. Modal and dialog inventory"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "10"
---
# Mobile · 10. Modal and dialog inventory

34 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S10.01 Create Project.

- **Expected:** A create-project dialog (or command) asks for a name and creates the project in the account.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/projects.tsx:441; apps/mobile/app/(app)/(tabs)/projects.tsx:186 (quoted code not found in the file now); apps/mobile/src/features/projects/store.ts:416; apps/web/app/api/projects/sync/route.ts:104
- **Where to find it:** Projects > New project (labels found in the code)
- **Steps:**
  1. Open Projects (the Projects entry in the side drawer, which opens from the menu button).
  2. Tap the floating "New project" button at the bottom right.
  3. Type a name in the "Project name" field and tap "Create project".
  4. Look for the new project in the Projects list, compared with Expected.

## S10.02 Rename conversation.

- **Expected:** The user opens rename on a conversation, edits the title in a field or prompt, and the new title is saved.
- **Code:** done. Evidence moved: apps/mobile/src/features/conversation-actions/useConversationActions.ts:267; apps/mobile/app/(app)/chat/[id].tsx:1195 (quoted code not found in the file now)
- **Where to find it:** Chat > Conversation menu > Rename (labels found in the code)
- **Needs:** a chat
- **Steps:**
  1. Open a chat.
  2. Tap the "Conversation menu" button in the chat header.
  3. Tap "Rename"; the "Rename chat" box opens with the field "Enter a new title".
  4. Change the title and tap "Rename".
  5. Look for the new title in the chat header, compared with Expected.

## S10.05 Archive confirmation.

- **Expected:** Archiving asks to confirm, or confirms afterwards with a way to undo, and says where archived items can be found.
- **Code:** done. Evidence present: apps/mobile/src/features/conversation-actions/useConversationActions.ts:138
- **Where to find it:** Chat > Conversation menu > Archive (labels found in the code)
- **Needs:** a Cloud account and a Cloud chat
- **Steps:**
  1. Open a Cloud chat that is not temporary.
  2. Tap the "Conversation menu" button and tap "Archive".
  3. Note that no confirmation appears first; a message appears: "Chat archived. Find it in Settings, Archived chats." with an "Undo" button.
  4. Go to Settings > Archived Chats and check the chat is there, compared with Expected.

## S10.06 Delete confirmation.

- **Expected:** Deleting asks for confirmation that names the item before anything is removed.
- **Code:** done. Evidence moved: apps/mobile/src/features/conversation-actions/useConversationActions.ts:130 (quoted code not found in the file now); apps/mobile/src/features/conversation-actions/useConversationActions.ts:141 (quoted code not found in the file now)
- **Where to find it:** Chat > Conversation menu > Delete (labels found in the code)
- **Needs:** a chat
- **Steps:**
  1. Open a chat.
  2. Tap the "Conversation menu" button and tap "Delete".
  3. Read the "Delete chat?" dialog, which names the chat in quotes.
  4. Tap "Cancel" to check nothing is removed, then repeat and tap "Delete", and compare with Expected.

## S10.07 Permanent-delete confirmation.

- **Expected:** An irreversible delete says plainly that it cannot be undone and needs an explicit second confirmation.
- **Code:** done. Evidence moved: apps/mobile/src/features/conversation-actions/useConversationActions.ts:137 (quoted code not found in the file now); apps/mobile/src/features/conversation-actions/useConversationActions.ts:143 (quoted code not found in the file now)
- **Where to find it:** Chat > Conversation menu > Delete (on a chat that is only on this device) (labels found in the code)
- **Needs:** a chat kept only on this device
- **Steps:**
  1. Open a chat that is kept only on this device (not a Cloud chat).
  2. Tap the "Conversation menu" button and tap "Delete".
  3. Read the "Delete chat?" dialog: it says the chat is deleted from this device and cannot be restored.
  4. Tap "Delete" and compare with Expected.

## S10.08 Share conversation.

- **Expected:** A share dialog creates a link to the conversation, shows it for copying, and states who can open it.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/chat/[id].tsx:1452 (quoted code not found in the file now)
- **Where to find it:** Chat > Conversation menu > Share > Create link (labels found in the code)
- **Needs:** a Cloud account and a saved chat
- **Steps:**
  1. Open a saved Cloud chat (not a temporary chat).
  2. Tap the "Conversation menu" button and tap "Share".
  3. Read the dialog "Share a link to this chat?", which says anyone with the link can read the chat until it expires or you revoke it.
  4. Tap "Create link"; the system share sheet opens with the link.
  5. Compare with Expected: the link goes to the system share sheet, not a box in the app.

## S10.09 Share file or folder.

- **Expected:** The user can share a file (or folder) from their library with someone, by link or the system share sheet.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:180 (quoted code not found in the file now); apps/mobile/src/features/library/index.tsx:147 (quoted code not found in the file now)
- **Where to find it:** Library > long-press an item > Share (labels found in the code)
- **Needs:** an item in the Library and a device
- **Steps:**
  1. Open Library from the side drawer.
  2. Long-press a picture or file and tap "Share", or tap Select, pick one item and tap "Share" at the bottom.
  3. Look for the system share sheet with that file.
  4. Compare with Expected: the file goes to the system share sheet.

## S10.10 Share artifact.

- **Expected:** An artifact share dialog publishes it to a link, lets the user copy it and choose who can open it, and can take it down.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx:154
- **Where to find it:** Chats search > Artifacts > open the artifact > Publish icon > Publish > Who can open this (labels found in the code)
- **Needs:** a Cloud account and an artifact that can be published
- **Steps:**
  1. On Chats, use the search field and type the artifact's title.
  2. Under "Artifacts" in the results, tap the artifact.
  3. Tap the globe button labelled "Publish artifact to a public link", then tap "Publish" in the dialog.
  4. Under "Who can open this" choose "Anyone with the link", "Only people you invite" or "Everyone in this workspace", then compare with Expected.
  5. Tap "Unpublish" and confirm "Unpublish this artifact?" to take it down.

## S10.11 Publish generated application.

- **Expected:** A publish dialog puts a generated app or page on a live URL and hands back the link.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1324; apps/mobile/src/features/chat/services/artifactPublishing.ts:13 (quoted code not found in the file now)
- **Where to find it:** Chats search > Artifacts > open the artifact > Publish artifact to a public link > Publish (labels found in the code)
- **Needs:** a Cloud account and a previewable artifact
- **Steps:**
  1. Open a Cloud artifact that can be published (a page or app).
  2. Tap the globe button "Publish artifact to a public link".
  3. Read "Publish to a public link?" and tap "Publish".
  4. Look for the published link and the "Copy publication link" button, and compare with Expected.

## S10.12 Manage link access.

- **Expected:** For a shared link the user can see its access (who, expiry) and change or revoke it.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/shared-links.tsx:51 (quoted code not found in the file now); apps/mobile/app/(app)/settings/shared-links.tsx:96 (quoted code not found in the file now); apps/mobile/src/features/settings/index.tsx:448 (quoted code not found in the file now)
- **Where to find it:** Settings > Privacy > Chat privacy > Shared links (labels found in the code)
- **Needs:** a Cloud account with at least one shared link
- **Steps:**
  1. Open Settings, then Privacy, then Chat privacy, then Shared links.
  2. Read each row for its title and "Expires" date, or "This link has expired".
  3. Tap "Revoke" on a row and read "Revoke this link?".
  4. Tap "Revoke" to confirm and compare with Expected.

## S10.13 Invite member.

- **Expected:** An invite dialog takes an email and role, sends the invitation, and lists pending invites to revoke or renew.
- **Code:** done. Evidence present: apps/mobile/src/features/team/WorkspaceAdministration.tsx:112
- **Where to find it:** Settings > Workspace > Invite by email (labels found in the code)
- **Needs:** a Cloud workspace where the account can manage the team, and a second email address
- **Steps:**
  1. Open Settings, then Workspace.
  2. Scroll to the administration section and tap "Invite by email".
  3. Type an address in "Email address", pick a role (Member, Admin or Viewer), and tap "Send invitation".
  4. Look at the pending invitations list; tap an invitation and choose "Resend invitation" or "Revoke invitation", and compare with Expected.

## S10.14 Change member role.

- **Expected:** A role dialog changes a member's role after confirmation, and the server enforces the new role.
- **Code:** done. Evidence present: apps/mobile/src/features/team/RolePickerModal.tsx:46; apps/mobile/app/(app)/settings/workspace.tsx:233
- **Where to find it:** Settings > Workspace > Change role for <member name> > Change role (labels found in the code)
- **Needs:** a Cloud workspace, an admin account, and a second member in the same workspace
- **Steps:**
  1. Open Settings, then Workspace, as an admin of the workspace.
  2. On a member who is not you, tap "Change role".
  3. In the sheet "Role for <name>", pick a role and tap "Save role".
  4. Look at the member's role in the list, and compare with Expected.

## S10.17 Upload from device.

- **Expected:** Choosing upload opens the device file chooser and the picked files attach to the message.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:722; apps/mobile/app/(app)/(tabs)/chat.tsx:1029; apps/mobile/app/(app)/(tabs)/chat.tsx:1426; apps/mobile/src/features/chat/components/ChatInput.tsx:247 (quoted code not found in the file now)
- **Where to find it:** Chat > Add to chat > File (labels found in the code)
- **Needs:** a Cloud chat and a file on the device
- **Steps:**
  1. Open a Cloud chat and tap "Add to chat" next to the message box.
  2. Tap "File"; the device file chooser opens.
  3. Pick a file.
  4. Look for the file attached to the message before sending, and compare with Expected.

## S10.18 Connect external account.

- **Expected:** A connect dialog starts the service's real authorization (OAuth or key) and ends with the account connected.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/index.tsx:517 (quoted code not found in the file now); apps/mobile/src/features/settings/cloud-connectors/index.tsx:676 (quoted code not found in the file now); apps/mobile/services/connectors.ts:149; packages/client/client-runtime/src/connectors/runtime.ts:264 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > (choose a connector) > Connect (labels found in the code)
- **Needs:** a Cloud account and an account on the outside service
- **Steps:**
  1. Open Settings, then Connectors.
  2. Tap a connector that is not connected yet.
  3. Tap "Connect <name>"; for an OAuth service the browser opens the service's sign-in page, and for a key service the "Connect {connectorName}" sheet asks for the key.
  4. Finish the authorization and return to the app, then look for the card showing "Connected", and compare with Expected.

## S10.19 Reauthorize connection.

- **Expected:** An expired connection offers a reconnect dialog that re-runs authorization and keeps its settings.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/index.tsx:430 (quoted code not found in the file now); apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:626
- **Where to find it:** Settings > Connectors > (connector showing "Authorization expired") > Reauthorize (labels found in the code)
- **Needs:** a connection whose authorization has expired (hard to set up)
- **Steps:**
  1. Open Settings, then Connectors, then the connector that shows "Authorization expired".
  2. Tap "Reauthorize" and complete the authorization in the browser.
  3. Return to the app and look for the connector showing as connected again, and compare with Expected.

## S10.20 Select among connected accounts.

- **Expected:** When a service has several connected accounts, a dialog lets the user pick which one to use or make default.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** not found in the code. I searched apps/mobile for an account picker, a default account or several accounts for one connector (cloud-connectors and services/connectors.ts); the only match was "Reset ... to default" for tool permissions, so no picker was found.
- **Needs:** several connected accounts for one service

## S10.27 Context-limit warning.

- **Expected:** As a conversation nears or passes the model's context limit, the user gets a clear warning with what to do (trim, compact, new chat).
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2700
- **Where to find it:** Chat > (a long conversation) > warning line under the header (labels found in the code)
- **Needs:** a long conversation
- **Steps:**
  1. Open a long chat with many messages.
  2. Look for the line "Chat is getting long. Start a fresh chat for faster responses." with a "New chat" button.
  3. Tap "New chat" to start a fresh chat, or open the "Conversation menu" and tap "What is in context" to see the details, then compare with Expected.

## S10.28 Usage-limit notice.

- **Expected:** When a usage limit is reached, the user sees which limit, when it resets, and what they can do.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2852; apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:128; apps/mobile/app/(app)/chat/[id].tsx:699
- **Where to find it:** Chat > usage warning banner above the message box (labels found in the code)
- **Needs:** a usage limit that has been reached
- **Steps:**
  1. Use a Free or other account until its usage limit is reached, then open a chat.
  2. Look for the usage banner; if a reset time is known, tap "Notify me when it resets".
  3. Tap the banner's action to open the recovery screen (Subscription), or tap "Dismiss usage warning".
  4. Compare the banner's text (which limit, when it resets, what to do) with Expected.

## S10.29 Credit-purchase dialog.

- **Expected:** From where the limit is hit, a purchase dialog lets the user buy extra credits and completes payment.
- **Code:** partial. Evidence moved: apps/mobile/src/features/settings/cloud-billing/index.tsx:147 (quoted code not found in the file now); apps/web/lib/server/mobile-iap-catalog.ts:54; apps/web/app/api/mobile/iap/catalog/route.ts:83 (quoted code not found in the file now)
- **Known to be unfinished:** Owner and switch-on: waitlist hold plus MOBILE_IAP_ENABLED and store products.
- **Where to find it:** Settings > Subscription > Usage top-ups (labels found in the code)
- **Needs:** a Cloud account; the purchase needs store products and in-app purchases switched on by the owner
- **Steps:**
  1. Open Settings, then Subscription.
  2. Look for the "Usage top-ups" section: "Credits add to your plan and don't expire."
  3. Tap a credit amount to start a purchase, then compare with Expected.

## S10.30 Upgrade comparison.

- **Expected:** An upgrade dialog compares plans (price, limits, features) before the user picks one.
- **Code:** partial. Evidence present: apps/mobile/src/features/settings/cloud-billing/index.tsx:685; apps/web/lib/server/mobile-iap-catalog.ts:54
- **Known to be unfinished:** Owner: plan prices and pick action depend on FEATURES.billing and the native product list (waitlist hold).
- **Where to find it:** Settings > Subscription > Compare plans (or Upgrade, then Subscription) (labels found in the code)
- **Needs:** a Cloud account
- **Steps:**
  1. Open Upgrade from the side drawer, or open Settings, then Subscription.
  2. Tap "Compare plans" to see the plan list with prices and features.
  3. Tap "Upgrade plan" or "Choose plan" if shown, and compare with Expected.
  4. If the row shows "Unavailable in the app", plan changes are not available in the app.

## S10.31 Cancel subscription.

- **Expected:** A cancel dialog lets the user cancel their subscription, says when access ends, and confirms.
- **Code:** partial. Evidence present: apps/mobile/src/features/settings/cloud-billing/index.tsx:301; apps/mobile/src/features/settings/cloud-billing/index.tsx:324
- **Known to be unfinished:** D-2026-09-28-27: cancellation links out to the store or web billing.
- **Where to find it:** Settings > Subscription > Manage billing (labels found in the code)
- **Needs:** a paid Cloud account
- **Steps:**
  1. Open Settings, then Subscription.
  2. Look at the "Access ends" or "Renews" row, and check the date shown.
  3. Tap "Manage billing"; the web billing page opens in the browser (for a store subscription, a "Subscription managed elsewhere" dialog appears first).
  4. Compare with Expected: cancellation is done on that page or in the store, not in the app.

## S10.32 Payment-method update.

- **Expected:** A payment-method dialog lets the user add or replace the card on file.
- **Code:** partial. Evidence present: apps/mobile/src/features/settings/cloud-billing/index.tsx:324; apps/mobile/lib/v1FeatureFlags.ts:6
- **Known to be unfinished:** D-2026-09-28-27: card and payment method link out to web billing.
- **Where to find it:** Settings > Subscription > Manage billing (labels found in the code)
- **Needs:** a paid Cloud account
- **Steps:**
  1. Open Settings, then Subscription.
  2. Tap "Manage billing".
  3. Look at the web billing page in the browser for the card on file, and compare with Expected.

## S10.33 Reauthentication challenge.

- **Expected:** Before a sensitive account action, a dialog asks the user to prove it is them (code or passkey) and only then proceeds.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-account/index.tsx:532
- **Where to find it:** Settings > Account > Email > Delete Account (labels found in the code)
- **Needs:** a Cloud account and the way to confirm it is you
- **Steps:**
  1. Open Settings, then Account, then Email.
  2. Tap "Delete Account" (a sensitive action).
  3. Read the "Confirm it is you" dialog and enter a password, an email code, or an authenticator or backup code.
  4. Look for the action continuing only after verification, and compare with Expected.

## S10.34 Microphone permission explanation.

- **Expected:** Before or when the microphone is first needed, the product explains why it wants it and what to do if access is refused.
- **Code:** done. Evidence moved: apps/mobile/app.config.js:74 (quoted code not found in the file now); apps/mobile/src/features/voice/hooks/useVoiceConversation.ts:41 (quoted code not found in the file now); apps/mobile/src/features/voice/services/voiceInput.ts:427
- **Where to find it:** Chat > Start voice mode (first use asks for the microphone) (labels found in the code)
- **Needs:** a microphone and a way to deny the permission
- **Steps:**
  1. Open a chat and tap "Start voice mode" (the accessibility label of the voice button).
  2. On the system microphone prompt, read the text "AGI Mobile uses the microphone for voice input and real-time voice conversations with AI." then choose Don't Allow.
  3. Tap voice again and read the "Voice input unavailable" alert with "Open Settings" or "Not now".
  4. Compare with Expected; the message says microphone access is off and how to turn it on.

## S10.38 Tool-action approval.

- **Expected:** When a tool action needs approval, a prompt shows the action and the user approves or denies that one call.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:307 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2519 (quoted code not found in the file now)
- **Where to find it:** Chat (Cloud) > a tool call that is awaiting approval > Allow once / Allow for this chat / Always allow / Deny (labels found in the code)
- **Needs:** a Cloud account and a request that triggers a tool approval (set by the server policy)
- **Steps:**
  1. Open a Cloud chat and ask for an action that a tool needs approval for.
  2. Look for the tool row in the chat that shows the action and its decision buttons.
  3. Tap "Allow once" or "Deny" for that call only, then compare with Expected.
  4. For a broader scope such as "Allow for this chat" on a destructive tool, read the confirmation dialog first.

## S10.39 Sensitive-data transfer approval.

- **Expected:** Before private or sensitive data is sent to an outside destination, the user is asked to approve that transfer and told what goes where.
- **Code:** done. Evidence present: packages/contracts/types/src/tool-approval-policy.ts:38; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1086
- **Where to find it:** Chat screen > send a message that asks the agent to use a connected outside tool > the tool approval card that shows "Allow" and "Deny" (labels found in the code)
- **Needs:** a Cloud account with a connected outside tool; a chat that triggers a tool approval
- **Steps:**
  1. Sign in and open a chat that runs in AGI Cloud.
  2. Ask the agent for an action that uses a connected outside tool.
  3. When the approval card appears, read the notice text and the destination it names.
  4. Compare with Expected: the card should show what is being sent and let you allow or deny that one call.

## S10.40 Remote-device pairing.

- **Expected:** A pairing dialog links a phone or another device to this machine by code or QR, bound to the signed-in account.
- **Code:** done. Evidence present: apps/mobile/src/features/companion/components/ConnectionStateViews.tsx:162
- **Where to find it:** not found in the code. Pairing exists in code but is hidden in this build: apps/mobile/lib/v1FeatureFlags.ts sets companion to false, and apps/mobile/app/(app)/settings/remote-control.tsx returns a feature-unavailable screen when the flag is off. The QR scanner is apps/mobile/src/features/companion/components/QRScanner.tsx. Searched the settings and companion folders for a reachable entry point and found none while the flag is off.
- **Needs:** a desktop app paired on Managed Cloud (for a real test)

## S10.41 Unsaved-changes warning.

- **Expected:** Leaving an editor with unsaved edits warns the user and lets them keep editing or discard.
- **Code:** done. Evidence moved: apps/mobile/src/shared/hooks/useUnsavedChangesGuard.ts:24; apps/mobile/src/features/schedules/components/ScheduleForm.tsx:76 (quoted code not found in the file now); apps/mobile/src/features/settings/components/AddMemorySheet.tsx:63
- **Where to find it:** Settings > Assistant > Memory > add or edit memory sheet, then close it with unsaved text (labels found in the code)
- **Needs:** a Free account or a Cloud account
- **Steps:**
  1. Open the Settings screen and go to the Assistant section, then tap Memory.
  2. Tap the control that adds or edits a memory (the exact button label was not found in the code).
  3. Type some text into the memory field without saving.
  4. Close the sheet without saving, then compare with Expected: a "Discard changes?" alert should appear with "Discard" and "Keep Editing".
  5. Repeat with a new schedule on the schedule create screen; the same guard is used there, but I could not find the screen's entry label.

## S10.43 Export options.

- **Expected:** An export dialog lets the user pick a format and exports the conversation or item to a file.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2837; apps/mobile/app/(app)/chat/[id].tsx:1790
- **Where to find it:** Open a chat > Conversation menu > Export > sheet "Export Conversation" > Export as Markdown (labels found in the code)
- **Needs:** a chat with at least one message
- **Steps:**
  1. Open any chat that has messages.
  2. Tap the control labelled Conversation menu in the chat header.
  3. Tap Export.
  4. Tap Export as Markdown (or Export as PDF or Export as Text) and choose where to share the file.
  5. Compare with Expected: the sheet should offer formats and the exported file should contain the conversation.

## S10.44 Report-content dialog.

- **Expected:** A report dialog lets the user flag an answer (with a reason) and the report reaches moderation.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1126 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ReportFlagButton.tsx:32; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Open a chat > on an assistant answer, tap Message actions > Report… > choose a category > Send (some labels not found in the code; trust the screen)
- **Needs:** a chat with an assistant answer
- **Steps:**
  1. Open a chat that has an answer from the assistant.
  2. Tap Message actions on that answer (or long-press it) and tap Report….
  3. Choose a category (for example Other) and optionally write a note.
  4. Tap Send and compare the result with Expected: the confirmation should say the report was sent or saved on this device.

## S10.45 Feedback submission.

- **Expected:** A feedback dialog, reachable product-wide, sends the user's message to the team's feedback store.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/index.tsx:599 (quoted code not found in the file now); apps/mobile/src/features/feedback/index.tsx:34; apps/mobile/src/features/feedback/index.tsx:50 (quoted code not found in the file now)
- **Where to find it:** Settings > Support > Report App Issue (labels found in the code)
- **Steps:**
  1. Open Settings and go to the Support section, then tap Report App Issue.
  2. Choose General Feedback (or the bug option) and type a message.
  3. Tap Submit Feedback (or Email Feedback when the app sends by email).
  4. Compare with Expected: the "Thank You!" alert should appear with "Your feedback has been submitted.".

## S10.46 Diagnostic-sharing consent.

- **Expected:** Before diagnostics or crash reports leave the device, the user is told what is included and chooses (or sets a preference that is honoured).
- **Code:** done. Evidence present: apps/mobile/src/features/settings/index.tsx:598
- **Where to find it:** Settings > Support > Export Diagnostics > Share diagnostics? > Continue (labels found in the code)
- **Steps:**
  1. Open Settings, go to the Support section, and tap Export Diagnostics.
  2. Read the alert "Share diagnostics?" and its text.
  3. Tap Continue to share, or Cancel to stop.
  4. Compare with Expected: the consent text should say what is sent, and nothing should be shared after Cancel.

## S10.47 Data-export request.

- **Expected:** A data-export dialog requests a copy of the account's data and delivers it as a download.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-account/index.tsx:916; apps/mobile/src/features/settings/cloud-account/index.tsx:510; apps/mobile/services/cloudDataExport.ts:28 (quoted code not found in the file now)
- **Where to find it:** Settings > Account > Email > Export Cloud Data (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Sign in to an AGI Cloud account, open Settings, and go to the Account section.
  2. Tap the Email row to open the cloud account screen.
  3. Tap Export Cloud Data and wait for the share sheet.
  4. Compare with Expected: the export should be delivered as a file to share or save. The code does not show a confirmation step first.

## S10.48 Account-deletion request.

- **Expected:** An account-deletion dialog explains what is deleted and requires explicit confirmation before deleting the account.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-account/index.tsx:182 (quoted code not found in the file now); apps/mobile/src/features/settings/cloud-account/index.tsx:1003
- **Where to find it:** Settings > Account > Email > Delete Account > Delete Account (labels found in the code)
- **Needs:** a throwaway signed-in AGI Cloud account (not a real one)
- **Steps:**
  1. Sign in to an AGI Cloud account, open Settings, tap the Email row in the Account section.
  2. Scroll to Delete Account and tap it.
  3. Read the "Delete Account" dialog text: it schedules deletion, names what is deleted, and says erasure cannot be undone once it begins.
  4. Tap Delete Account to confirm, or Cancel to stop. Compare with Expected: the dialog should explain what is deleted and require this confirmation.
  5. Use a throwaway test account only, because the deletion is scheduled for real.
