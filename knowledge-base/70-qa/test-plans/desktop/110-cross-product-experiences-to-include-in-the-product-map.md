---
id: "PLAN-desktop-110"
type: "test-plan"
title: "Desktop · 110. Cross-product experiences to include in the product map"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "110"
---
# Desktop · 110. Cross-product experiences to include in the product map

19 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S110.01 Chat → editable document.

- **Expected:** A document the assistant writes in chat opens as an artifact the user can edit as a document and save back as a new version.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3291; apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx:27
- **Where to find it:** Chat > open a document artifact from a reply (it opens in the artifact panel) > edit the text in the panel (labels found in the code)
- **Steps:**
  1. Ask the assistant in chat to write a document, for example a short memo.
  2. Click the document card under the reply so it opens in the artifact panel.
  3. Click into the document text and change a sentence.
  4. Open the artifact's menu and click Restore only if you need to compare versions; otherwise look for the edited text remaining after you close and reopen the panel, and check that a new version was recorded.

## S110.02 Document → presentation.

- **Expected:** A document (chat artifact or uploaded file) is turned into a presentation the user can open and keep working on.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:409
- **Known to be unfinished:** owner: provision the antivirus scanner endpoint and set UPLOAD_SCAN_WEBHOOK_URL (and UPLOAD_SCAN_WEBHOOK_TOKEN if needed); production refuses uploads without it (apps/web/lib/security/upload-scan.ts:264-282)
- **Where to find it:** not found in the code. Searched apps/web/features/chat and apps/web/lib for a document-to-presentation control and found none; presentation artifacts exist (ArtifactPreview.tsx, title fallback 'Presentation') but no convert button. Production uploads also need UPLOAD_SCAN_WEBHOOK_URL (apps/web/lib/security/upload-scan.ts:264-282).
- **Needs:** a file to upload

## S110.03 Spreadsheet → chart → report.

- **Expected:** A spreadsheet the user brings is analysed, charted, and turned into a report that contains the chart.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1, E2B_API_KEY, AGI_E2B_CHAT_TEMPLATE and UPLOAD_SCAN_WEBHOOK_URL; then live-check a chart-into-docx prompt on an uploaded xlsx (template has python-docx and matplotlib)
- **Where to find it:** Chat > attach an .xlsx file > ask for a chart inside a Word report > open the result in the artifact panel and choose Download as Word (.docx) (labels found in the code)
- **Needs:** a file to upload (an .xlsx); the sandbox path must be switched on by the owner (AGI_E2B_EXECUTION)
- **Steps:**
  1. Attach a spreadsheet (.xlsx) to a new chat message using the attach control in the composer.
  2. Ask for an analysis with a chart, and a Word report that contains the chart.
  3. When the report appears, open it in the artifact panel.
  4. Open the artifact menu and click Download as Word (.docx); open the file and check that the chart is inside the report.

## S110.05 Research → interactive page.

- **Expected:** A finished research report can be converted in one step into an interactive page (charts, navigation, controls) the user can open and publish.
- **Code:** done. Evidence moved: apps/web/features/chat/lib/visual-intent.ts:104; apps/web/features/chat/utils/research-plan.ts:67; apps/web/lib/services/published-artifact-service.ts:61; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1908 (quoted code not found in the file now)
- **Where to find it:** Chat > ask for a research report > ask for an interactive page from it > open the page in the artifact panel > Publish (labels found in the code)
- **Steps:**
  1. Ask the assistant for a research report on a topic and wait for it to finish.
  2. In the next message, ask for the report as an interactive page with charts and navigation.
  3. Open the page in the artifact panel and check that it has charts, navigation and controls.
  4. Open the artifact's menu and click Publish; check that a link is produced.

## S110.07 Voice → durable work task.

- **Expected:** A request made in voice mode becomes a durable AGI Work task (runs in background, tracked in Tasks) without the user retyping it.
- **Code:** done. Evidence moved: apps/web/lib/voice/live-voice-tools.ts:223; apps/web/lib/voice/live-voice-tools.ts:402; apps/web/lib/voice/live-voice-tool-runner.ts:254; apps/web/features/chat/lib/live-voice-session.ts:470 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:6801
- **Where to find it:** Chat > voice mode > say a longer task out loud > Tasks in the sidebar (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Start voice mode from the chat.
  2. Say a task that needs a longer piece of work, for example a research summary.
  3. Wait for the voice assistant to confirm it is starting a task.
  4. Open Tasks in the sidebar and check that the task is listed and running in the background without you retyping it.

## S110.08 Voice → generated document.

- **Expected:** A spoken request in voice mode produces a document (docx/pdf/markdown artifact) the user can open from the voice session.
- **Code:** done. Evidence moved: apps/web/lib/voice/live-voice-tools.ts:135; apps/web/lib/voice/live-voice-tools.ts:399; apps/web/lib/voice/live-voice-tool-runner.ts:151; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:366 (quoted code not found in the file now)
- **Where to find it:** Chat > voice mode > ask for a document out loud > open the document from the voice session (path not confirmed in the code; trust the screen)
- **Needs:** a microphone
- **Steps:**
  1. Start voice mode from the chat.
  2. Say a request for a document, for example a Word file about a topic.
  3. Wait until the document card appears in the voice session.
  4. Open the document card and check that it opens as an artifact and can be downloaded.

## S110.10 Email thread → agent task.

- **Expected:** The user turns an email thread (forwarded, addressed, or picked from a connected mailbox) into an agent task that reads the thread and runs as a tracked task.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:64 (quoted code not found in the file now); packages/contracts/cloud-contracts/src/triggers.ts:194; apps/web/lib/triggers/gmail-watch.ts:431; apps/web/lib/triggers/trigger-fire.ts:71; apps/web/lib/services/scheduled-agent-executor.ts:350
- **Where to find it:** Schedules > open a scheduled task > Triggers for <task name> > Gmail (labels found in the code)
- **Needs:** an outside account (Google) with Gmail connected in Connectors
- **Steps:**
  1. Open the scheduled task page and open an existing scheduled task (or create one).
  2. Find the trigger panel for the task and choose Gmail as the trigger type.
  3. Read the note that says it runs for each new email and uses the Gmail address connected in Connectors.
  4. Send a test email to the connected address and check that a tracked task run appears.

## S110.11 Team mention → coding session.

- **Expected:** A teammate mentions the assistant in a team channel, issue or PR, and that mention opens a coding session on the repository that the team can follow and whose result posts back.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. Slack settings exist in apps/web/features/settings/sections/SlackSection.tsx, but I found no visible path from a team mention to a coding session in /code; the feature depends on an owner switch-on.
- **Needs:** a Slack workspace; the owner must switch the sandbox on (AGI_E2B_EXECUTION) before the coding session can run

## S110.14 Completed task → reusable Skill.

- **Expected:** After a task completes, the user saves it as a reusable Skill that then appears in their Skills and can be invoked later.
- **Code:** done. Evidence present: apps/web/lib/server/tools/plugin-draft-tool.ts:48; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5382; apps/web/features/chat/components/PluginDraftCard.tsx:30; apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** Chat > finish a task > under the reply click Save as skill, or on a plugin draft card click Save as a skill > Settings > Skills (labels found in the code)
- **Steps:**
  1. Finish a task in chat (for example a repeated process with clear steps).
  2. Under the final reply, click Save as skill (or on a draft card, click Save as a skill).
  3. Open Settings and choose Skills.
  4. Find the new skill in the list and invoke it in a new chat to check that it runs.

## S110.18 Web conversation → mobile continuation.

- **Expected:** A conversation started in the web app appears on the phone with its full history, the user sends a follow-up there, and the reply syncs back to web.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:266; apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:200; apps/web/app/api/chat/sync/route.ts:130
- **Where to find it:** no screen of its own. I checked the web sync route (apps/web/app/api/chat/sync/route.ts) and the sidebar item, not the phone app code.
- **Needs:** a phone with the AGI mobile app signed in to the same account
- **Steps:**
  1. On web or desktop, start a new chat and get one reply.
  2. Open the AGI phone app with the same account and find the same chat in Chat history, with its full history.
  3. On the phone, send a follow-up message.
  4. Back on web, reload the chat and check that the phone's follow-up and its reply appear.

## S110.19 CLI session → desktop continuation.

- **Expected:** A coding session started in the terminal CLI appears in the desktop app's local sessions for that folder and the user resumes and continues it there.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionsSection.tsx:427; apps/desktop/electron/runtime/dispatcher.ts:882 (quoted code not found in the file now); apps/desktop/electron/runtime/developerSessionService.ts:984 (quoted code not found in the file now); apps/desktop/electron/runtime/developerSessionService.ts:1734; apps/desktop/electron/runtime/developerSessionService.ts:684 (quoted code not found in the file now)
- **Where to find it:** Code > choose the folder the CLI session used > open the CLI session from the list (labels found in the code)
- **Needs:** the AGI command-line tool installed and a folder used in both places
- **Steps:**
  1. Start a coding session in a folder from the terminal with the AGI command-line tool.
  2. Open the desktop app and click Code in the sidebar.
  3. Choose the same folder; if asked, click Allow running commands.
  4. Open the session listed for that folder and send a follow-up; check that it continues the terminal session.

## S110.20 Desktop session → IDE continuation.

- **Expected:** A coding session started in the desktop app is listed in VS Code for the same folder and the user opens it and continues it in the IDE.
- **Code:** done. Evidence moved: apps/web/features/code/components/LocalSessionsSection.tsx:427; apps/desktop/electron/runtime/dispatcher.ts:882 (quoted code not found in the file now); apps/cli/src/app_server/developer_host.rs:3110; apps/desktop/electron/runtime/developerSessionService.ts:684 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched LocalSessionsSection.tsx, apps/cli and apps/desktop/electron for a visible VS Code or open-in-IDE control and found none by visible text.
- **Needs:** VS Code installed; a folder with a desktop-app coding session

## S110.21 Mobile request → authorized local-host execution.

- **Expected:** From the phone the user sends a new request that runs on their paired computer under that computer's approvals, and sees the result on the phone.
- **Code:** done. Evidence present: packages/platform/utils/src/remoteControl/codeRemoteController.ts:867; apps/desktop/electron/remote/remoteControlService.ts:29
- **Where to find it:** Settings > Capabilities > Remote Control (pairing a phone); Linked devices lists paired computers (labels found in the code)
- **Needs:** a paired computer and a phone with the AGI app signed in to the same account
- **Steps:**
  1. On the computer, open Settings and choose Capabilities, then Remote Control, and pair the phone if it is not paired.
  2. On the phone, send a new request to the paired computer.
  3. On the computer, approve the request if an approval appears, and let the run finish.
  4. On the phone, check that the result appears in the chat.

## S110.24 Existing notebook → main assistant context.

- **Expected:** From the main chat, the user brings an existing notebook (project) into the conversation so its instructions and sources ground the answers.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2782; apps/web/features/chat/pages/WebChatPage.tsx:5019; apps/web/features/chat/pages/WebChatPage.tsx:2665; apps/web/app/api/chat/conversations/route.ts:279; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855
- **Where to find it:** Chat > composer > Project picker > choose a project > ask a question in that chat (labels found in the code)
- **Needs:** a project with sources and instructions
- **Steps:**
  1. In a new chat, open the project picker in the composer.
  2. Choose the project that holds the notebook's instructions and sources.
  3. Ask a question that the project's sources cover.
  4. Check that the answer uses the project's sources and instructions.

## S110.25 Main conversation → persistent notebook sources.

- **Expected:** From the main conversation, the user saves answers or the chat into a notebook (project) as persistent sources that later project chats can cite.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4026; apps/web/features/chat/components/messages/MessageBubble.tsx:1147; apps/web/features/chat/pages/WebChatPage.tsx:6156; apps/web/features/chat/pages/WebChatPage.tsx:7728; apps/web/features/projects/components/project-answer-save.ts:21; apps/web/features/projects/services/project-knowledge-upload.ts:50
- **Where to find it:** Chat > an answer's menu > Save to project > choose the project; then open the project and check Project sources (labels found in the code)
- **Needs:** a project to save into
- **Steps:**
  1. Open a conversation with an answer you want to keep.
  2. On the answer, open its menu and click Save to project.
  3. Pick the project name in the list.
  4. Open the project and check Project sources; then start a chat in that project and ask about the saved answer.

## S110.26 Usage exhaustion → alternative eligible path.

- **Expected:** When the user runs out of usage, the product offers an eligible alternative (named eligible model, reset wait, or purchase) that the user can take in one step and continue.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:2175; apps/web/features/chat/pages/WebChatPage.tsx:2187; apps/web/features/chat/components/InlinePaywallCard.tsx:457
- **Where to find it:** Chat > send a message after usage is used up > the paywall card under the composer > Switch to <model name>, Buy credits or Upgrade to <plan> (labels found in the code)
- **Needs:** an account whose usage is used up (for example a Free account)
- **Steps:**
  1. Send messages until a usage limit blocks a send.
  2. Read the card under the composer and check which options it offers.
  3. Click Switch to <model name> if it is offered (or Buy credits or Upgrade to).
  4. Check that the chat continues and the reply comes from the new model.

## S110.28 Published output → versioned update.

- **Expected:** A published output is updated in place: the user changes it, republishes to the same link, and the new version is recorded and reversible.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PublishedArtifactsSection.tsx:64 (quoted code not found in the file now); apps/web/features/settings/sections/PublishedArtifactsSection.tsx:98 (quoted code not found in the file now); apps/web/app/api/artifacts/publish/[token]/versions/route.ts:28; apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:39; apps/web/lib/services/published-artifact-service.ts:971; apps/web/features/settings/services/conversation-data-service.ts:263 (quoted code not found in the file now)
- **Where to find it:** not found in the code. PublishedArtifactsSection.tsx has a Published artifacts heading and a live-again message, but no settings nav entry for it was found in packages/ui/ui/src/settings-nav.ts or apps/web/features/settings/components/web-settings-navigation.ts; the republish control is Publish in ArtifactPreview.tsx.
- **Needs:** a published artifact on the account

## S110.29 Public creation → private fork.

- **Expected:** A viewer of a public/shared creation (conversation, artifact, app) can make a private copy in their own account and continue it.
- **Code:** done. Evidence moved: apps/web/features/chat/lib/shared-conversation-snapshot.ts:64; apps/web/features/chat/hooks/use-share-conversation.ts:135; apps/web/app/chat/from-share/[token]/page.tsx:40 (quoted code not found in the file now); apps/web/app/chat/from-share/[token]/page.tsx:168 (quoted code not found in the file now); apps/web/features/chat/components/messages/MessageBubble.tsx:2991; apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:226; apps/web/features/chat/lib/copy-shared-artifact.ts (text found, layout changed)
- **Where to find it:** Open a shared artifact link from another account > Save a copy to my chats (labels found in the code)
- **Needs:** a second account and a shared link from the first account
- **Steps:**
  1. Sign in with a second account (not the owner).
  2. Open a public or shared artifact link created by the first account.
  3. Click Save a copy to my chats.
  4. Open My chats and check that the copy opens with the same content and can be continued.

## S110.30 Personal resource → explicitly shared workspace resource.

- **Expected:** A user explicitly shares a resource they own (project, conversation, artifact, skill) into their workspace with an access level, and members then find and open it.
- **Code:** done. Evidence present: apps/web/features/settings/sections/OrganizationSharingSection.tsx:385; apps/web/features/settings/sections/OrganizationSharingSection.tsx:492; apps/web/app/share/[token]/page.tsx:44
- **Where to find it:** Settings > Workspace > Share project with organization (sharing page at /workspace/sharing) (labels found in the code)
- **Needs:** a workspace with a second member in the same workspace; sharing rights depend on the member's role
- **Steps:**
  1. Open Settings and choose Workspace.
  2. Find the sharing section and click Share project with organization on one of your projects, with an access level if asked.
  3. Sign in as a second member of the same workspace and find the shared item under Shared with your organization.
  4. Open it and check that it opens with the access level you chose.
