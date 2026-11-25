---
id: "DOC-50-competitors-data-lists-to-read-partial-mobile"
type: "comparison-data"
title: "partial mobile"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
## Mobile (114)

**Account and sign-in** (5)
- MP1 Sign-in methods offered ★: Microsoft is not in the list the builds set
- MP2 Advanced account security (ChatGPT): The mobile app has no advanced-security mode of its own
- MP3 Open options for an account (Claude): There is no per-account options menu
- MP4 Security keys and passkeys (ChatGPT): Security and login lists passkeys and security keys and can remove them; adding one opens the web
- MP5 Sign in with an emailed secure link (Claude): Sign-in sends a one-time code to type in the app, not a link

**Plans, billing and usage** (7)
- MP6 Invoices for paid plans ★: Opens the web only when web billing links are allowed
- MP7 Show how many usage credits are left ★: There is no buy button
- MP8 Invite a friend or coworker referral from the profile menu (ChatGPT): There is no invite dialog or link
- MP9 List of what each plan includes (ChatGPT): 'What your plan includes' lists only the current plan's benefits
- MP10 Notice that Work usage is used up (ChatGPT): Chat shows a limit banner with the reset time; its upgrade or buy action is hidden in this build
- MP11 Renewal terms note (ChatGPT): The 'auto-renews, cancel anytime' note only exists in the compiled-out purchase screen
- MP12 Subscription bought on another platform alert (ChatGPT): There is no pop-up alert

**Home and navigation** (3)
- MP13 Links open in an in-app browser sheet ★: There is no custom bar with tabs
- MP14 Explore row for browsing assistants made by others (ChatGPT): Not other people's assistants
- MP15 Type / or press + in the message box for commands (Claude): It says typing / does nothing

**Composer and input** (3)
- MP16 Mark up an image to point at a part of it (ChatGPT): Brush marking exists only for generated images (to edit an area), not attached photos
- MP17 No time limit on dictation (ChatGPT): Dictation stops on its own after 60 seconds of listening
- MP18 Slash commands in the composer: Ours lists up to four commands on / (image, voice, compare, export) (apps/mobile/src/features/chat/components/ChatInput…

**Conversations and message actions** (6)
- MP19 Long chat full warning with a fresh-start offer ★: It does not carry a summary
- MP20 Edits to written or code blocks autosave and feed follow-ups (ChatGPT): There is no direct text editing with autosave
- MP21 Save a temporary chat into history (ChatGPT): There is no general Save chat control in the chat menu
- MP22 Search chats including archived chats (ChatGPT): Archived chats are managed on a separate Archived chats page and search coverage of them is not shown
- MP23 Search filters by type: All, Chats, Images, Documents, Projects (ChatGPT): There are no type filter chips
- MP24 Select several chats and delete them at once (Claude): Individual chats cannot be multi-selected

**Rendering and content** (2)
- MP25 Inline web images with source links in answers ★: The answer does not add sourced web images
- MP26 Preview HTML, React, SVG, Mermaid and Vega code blocks (ChatGPT): A code block has no Preview toggle for React or Vega

**Models and reasoning** (2)
- MP27 Context window size shown for the plan or model ★: The picker shows no per-model size
- MP28 Pick the model inside voice mode (Claude): No selector inside the voice screen

**Search and research** (1)
- MP29 Search filters by kind (All, Chats, Images, Documents, Projects) (ChatGPT): There are no filter pills

**Files, media and creation** (8)
- MP30 Create Word, PowerPoint and Excel files in chat ★: PDF is not an option
- MP31 Data analysis with code run in a sandbox ★: Interactive data tables from analysis were not found
- MP32 Largest file you can attach ★: Files are capped at 25 MB each and 25 MB per message, with up to 20 files
- MP33 PDF pages and embedded images read by the model ★: No page-count rule or image-reading promise is shown in the app
- MP34 Interactive flashcards saved in the library (ChatGPT): No saving of decks to the library was found
- MP35 Resize and remove controls on a generated image (ChatGPT): There is no remove control
- MP36 Saved reference images for later requests (ChatGPT): Named saved references are not shown
- MP37 Scan a document with the camera: Ours has a Scan screen that is opened only by an app shortcut or share intent (apps/mobile/app/_layout.tsx:304-309), no…

**Artifacts and documents** (5)
- MP38 Artifacts tab for everything the assistant built (Claude): No Artifacts entry in the side menu
- MP39 Design and Slides from any conversation, edited directly (Claude): No direct editing and no Design artifact
- MP40 Filter artifacts by scope (Claude): No separate scope filter
- MP41 Living documents (Docs) drafted in front of you with comments (Claude): No in-place editing or comments
- MP42 Sheets: spreadsheet edited together with the assistant (Claude): No cell editing with the assistant

**Accessibility and languages** (2)
- MP43 Interface languages ★: The app shows English only
- MP44 Screen reader support (ChatGPT): No screen reader audit was found

**Agents, tasks and automation** (8)
- MP45 Create a scheduled task ★: Repeat choices are once, daily, weekly and monthly, so no hourly
- MP46 Per-chat cloud computer with idle snapshot and 30-day expiry ★: There is no per-chat computer or snapshot the user can see
- MP47 Scheduled tasks page ★: Only Basic and above can create them
- MP48 Clock button in the agent tasks header (Claude): No separate history button
- MP49 Flexible morning, afternoon or evening schedule windows (ChatGPT): Schedules run in the daily Cloud window, with no morning or evening window choice
- MP50 Monitoring tasks that notify only on changes and stop at an end condition (ChatGPT): There is no notify-on-change rule or end condition
- MP51 Scheduled task caps by plan (ChatGPT): Free users cannot schedule at all
- MP52 Scheduled view shows unread indicator for runs needing attention (ChatGPT): The Schedules list has no unread mark

**Browser actions** (1)
- MP53 Website sign-in through a secure form unseen by the model (ChatGPT): A task can ask for input or open a link to finish in the browser, with no secure credential form

**Coding agent** (7)
- MP54 Choose the environment for a session (Claude): Each session picks only a network access level and a coding harness (runtime)
- MP55 Cloud agent switch with status (ChatGPT): There is no switch to turn cloud coding off
- MP56 Coding agent profile row (ChatGPT): No profile row
- MP57 Disconnect all connections (ChatGPT): There is no single Disconnect all
- MP58 Environment network access select (Claude): Cloud mode only
- MP59 Permission mode for the session (Claude): Edits are governed by an account-wide approval policy (ask every time, read-only auto, skip approvals), not a per-sessi…
- MP60 Run a code block and see the console output (ChatGPT): No Run on any code block

**Connectors, apps, plugins and skills** (10)
- MP61 Per-tool permission for a connector: Allow, Ask or Block ★: No separate read-only versus low-risk levels
- MP62 Access level for a device connector (Claude): Per-tool Allow, Ask or Block exists for cloud connectors, not for the device
- MP63 Approval card: Deny, Allow once, Allow for chat, Always allow, plus low-risk (ChatGPT): No low-risk level
- MP64 Assistant proposes a connected app on its own (Claude): The assistant does not pick a connected app mid-chat
- MP65 Confirmation before connected apps book or buy (Claude): No booking or buying connectors to confirm
- MP66 Connectors page for linking outside apps (Claude): Free plan cannot connect any
- MP67 Customize page for tools, memory and connections (ChatGPT): Memory is in its own Settings screen and Customize is not in the side menu
- MP68 Device connectors with access values (Claude): No contacts, photos or other device rows
- MP69 Plugin sources: add a marketplace: The Add a marketplace card is wrapped in FEATURES.pluginMarketplaceAdmin (apps/mobile/src/features/plugins/PluginSource…
- MP70 Use several accounts of the same app (ChatGPT): No Add another account control was found

**Cross-device continuity** (3)
- MP71 Mobile task list across cloud and connected computers (ChatGPT): No connected computers exist
- MP72 Move conversations between accounts by export and upload (ChatGPT): Importing a chat history file as reference was not found (memory import only)
- MP73 Open a session or chat from a link on the phone (Claude): No link starts or opens a code session

**Device and OS integration** (3)
- MP74 Ask by voice through Siri (ChatGPT): AGI is not a Siri or Apple Intelligence extension
- MP75 Draft a text or email that opens pre-filled in Messages or Mail (iPhone) (Claude): There is no drafting tool: the phone tools are calendar and reminders only
- MP76 Lock Screen, Control Center and Action Button control (Claude): No Analyze Photo control and no Lock Screen widget

**Help, feedback and support** (3)
- MP77 Help center chat widget (ChatGPT): No chat widget on help pages
- MP78 One-tap localized crisis resources (ChatGPT): No localized one-tap card or check-in
- MP79 Send feedback on a request that was wrongly blocked (Claude): No control on a blocked reply or refusal

**Install, release and update** (3)
- MP80 Countries where the app is offered ★: The draft listing offers all App Store territories except Mainland China, Russia, Iran, North Korea, Syria, Cuba and Cr…
- MP81 Languages on the store listing ★: The draft listing is English (US) only for v1, with seven more planned
- MP82 Minimum iPhone system version ★: The main app's floor (Expo default) was not confirmed, so parity with the leaders' iOS 18 is unknown

**Memory and personalization** (4)
- MP83 Advanced row in Personalization (ChatGPT): No Advanced row
- MP84 Edit the memory summary by text or highlight (ChatGPT): Our Memory summary page is read-only
- MP85 Switch memory off for one chat (Claude): No per-chat memory switch in Add to chat
- MP86 Year-end recap of themes and stats (ChatGPT): A Reflect recap of ongoing work exists, not a yearly stats recap

**Notifications** (3)
- MP87 Choose push, email or both for scheduled task results (ChatGPT): Email notifications show as a read-only line that says they are set on the web
- MP88 Notification switch for finished research (Claude): A Research complete switch shows only when research is on and the server announces the group
- MP89 Notification switches for Code and Dispatch (Claude): A Code switch shows once the server announces that group; the Dispatch switch is off with the dispatch flag

**Privacy, security and data** (8)
- MP90 Approval cards before the assistant sends, pays, signs or deletes ★: Not for payments, signatures or sends on a user account
- MP91 Approval prompt before opening generated links (ChatGPT): The user is never asked to approve one
- MP92 Apps with access (ChatGPT): There is no separate 'apps with access' row in privacy
- MP93 Distress detection routes to a safer model with crisis resources (ChatGPT): Sensitive moments are not routed to another model
- MP94 Provenance marks on generated images, audio and documents (ChatGPT): Audio and exported files are not stated
- MP95 Voice recording sharing: ask each time or always allow, and delete shared recordings (Claude): There is no per-conversation ask and no button to delete recordings already shared
- MP96 Warnings, ended chats and temporary suspension for serious policy violations (ChatGPT): There are no warnings, ended chats or suspension notices
- MP97 Work network access (ChatGPT): There is no general Work network setting

**Projects and organization** (3)
- MP98 Menu in the library header (ChatGPT): No add button beside search
- MP99 Share a project by invite and branch chats in shared projects (ChatGPT): There is no anyone-with-link option
- MP100 Sharing line and filter on artifact cards (Claude): The filters are by kind, not by owner or pin

**Settings** (1)
- MP101 Choose the start screen (ChatGPT): No start screen choice

**Sharing and collaboration** (3)
- MP102 Artifacts start private and sharing is set later (Claude): Default-private rules are not stated
- MP103 Share a project with view or edit access (ChatGPT): No groups and no outside-by-email invite
- MP104 Share one response, image or file by link (ChatGPT): One answer can only be sent as plain text or a file through the share sheet

**Teams and admin** (5)
- MP105 Admin invites by email, seats and member roles on mobile ★: No domain capture, JIT or SCIM controls
- MP106 Browser and network controls that limit hosted Work (ChatGPT): No admin limits
- MP107 Connector permission levels per role: always allow, needs approval, blocked (Claude): No per-role connector levels
- MP108 GitHub connector enabled by owner and quick setup (Claude): Has no owner enable step or quick setup
- MP109 Several identity providers and split domains with a chooser (Claude): No provider chooser is built in the app

**Voice** (5)
- MP110 Add photos or files during a voice conversation (Claude): The full live voice screen in Cloud has none
- MP111 Privacy settings link from voice (Claude): Voice settings link to a How voice works help page, not to privacy settings
- MP112 Voice model choice (ChatGPT): The speech engine is not selectable
- MP113 Voice speaks answers in extra language voices (ChatGPT): Not voices tied to a language
- MP114 Voice starts and steers Work tasks (ChatGPT): Cannot check or steer other threads
