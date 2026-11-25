---
id: "PLAN-web-110"
type: "test-plan"
title: "Web · 110. Cross-product experiences to include in the product map"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "110"
---
# Web · 110. Cross-product experiences to include in the product map

18 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S110.01 Chat → editable document.

- **Expected:** A document the assistant writes in chat opens as an artifact the user can edit as a document and save back as a new version.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3291; apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx:27
- **Where to find it:** Open a chat answer that holds a document > open the document as an artifact > Edit document (labels found in the code)
- **Steps:**
  1. Ask the assistant in chat to write a document, for example a short memo, and wait for it to finish.
  2. Open the document artifact from the chat.
  3. Click the Edit button (aria-label "Edit document").
  4. Change some text in the document.
  5. Click the save control (title "Save as a new version").
  6. Look for the new version in the artifact's version controls and compare with Expected: the edit is saved back as a new version.

## S110.02 Document → presentation.

- **Expected:** A document (chat artifact or uploaded file) is turned into a presentation the user can open and keep working on.
- **Code:** partial. Evidence present: apps/web/lib/security/upload-scan.ts:409
- **Known to be unfinished:** owner: provision the antivirus scanner endpoint and set UPLOAD_SCAN_WEBHOOK_URL (and UPLOAD_SCAN_WEBHOOK_TOKEN if needed); production refuses uploads without it (apps/web/lib/security/upload-scan.ts:264-282)
- **Where to find it:** not found in the code. Searched apps/web/features and apps/web/lib for presentation, slide, deck and convert labels. Only a prompt-based 'Slide deck' starter in apps/web/features/projects/components/ProjectStudio.tsx was found, with no control that converts an existing document into a presentation.
- **Needs:** a document

## S110.03 Spreadsheet → chart → report.

- **Expected:** A spreadsheet the user brings is analysed, charted, and turned into a report that contains the chart.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1, E2B_API_KEY, AGI_E2B_CHAT_TEMPLATE and UPLOAD_SCAN_WEBHOOK_URL; then live-check a chart-into-docx prompt on an uploaded xlsx (template has python-docx and matplotlib)
- **Where to find it:** not found in the code. Found apps/web/lib/e2b/gate.ts, which gates on AGI_E2B_EXECUTION and E2B_API_KEY. No visible chart or report control was found for this flow, so the path is unknown.
- **Needs:** a spreadsheet file to upload

## S110.05 Research → interactive page.

- **Expected:** A finished research report can be converted in one step into an interactive page (charts, navigation, controls) the user can open and publish.
- **Code:** done. Evidence moved: apps/web/features/chat/lib/visual-intent.ts:104; apps/web/features/chat/utils/research-plan.ts:67; apps/web/lib/services/published-artifact-service.ts:61; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1908 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Checked apps/web/features/chat/lib/visual-intent.ts and apps/web/features/chat/utils/research-plan.ts. No visible control for converting a report to an interactive page was found. The Publish button exists in apps/web/features/chat/components/artifacts/ArtifactPreview.tsx, but it is not confirmed as this feature.
- **Needs:** a finished research report

## S110.07 Voice → durable work task.

- **Expected:** A request made in voice mode becomes a durable AGI Work task (runs in background, tracked in Tasks) without the user retyping it.
- **Code:** done. Evidence moved: apps/web/lib/voice/live-voice-tools.ts:223; apps/web/lib/voice/live-voice-tools.ts:402; apps/web/lib/voice/live-voice-tool-runner.ts:254; apps/web/features/chat/lib/live-voice-session.ts:470 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:6801
- **Where to find it:** not found in the code. Found the voice tool files under apps/web/lib/voice/ (live-voice-tools.ts). No visible voice control that creates a tracked work task was found, so the path is unknown.
- **Needs:** a microphone and a Free or paid account

## S110.08 Voice → generated document.

- **Expected:** A spoken request in voice mode produces a document (docx/pdf/markdown artifact) the user can open from the voice session.
- **Code:** done. Evidence moved: apps/web/lib/voice/live-voice-tools.ts:135; apps/web/lib/voice/live-voice-tools.ts:399; apps/web/lib/voice/live-voice-tool-runner.ts:151; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:366 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Found apps/web/lib/voice/live-voice-tools.ts and apps/web/features/chat/components/Voice/VoiceModeSurface.tsx. No visible label tying a voice request to a generated document was found.
- **Needs:** a microphone

## S110.10 Email thread → agent task.

- **Expected:** The user turns an email thread (forwarded, addressed, or picked from a connected mailbox) into an agent task that reads the thread and runs as a tracked task.
- **Code:** done. Evidence moved: apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:64 (quoted code not found in the file now); packages/contracts/cloud-contracts/src/triggers.ts:194; apps/web/lib/triggers/gmail-watch.ts:431; apps/web/lib/triggers/trigger-fire.ts:71; apps/web/lib/services/scheduled-agent-executor.ts:350
- **Where to find it:** not found in the code. Found a Gmail trigger labelled 'Gmail' in apps/web/features/schedules/components/ScheduleTriggersPanel.tsx (line 75), which runs for each new email. The path from the app to that panel and the thread-to-task step were not confirmed.
- **Needs:** an outside account (Google) with Gmail connected

## S110.11 Team mention → coding session.

- **Expected:** A teammate mentions the assistant in a team channel, issue or PR, and that mention opens a coding session on the repository that the team can follow and whose result posts back.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. Searched apps/web/features/code and apps/web/lib/e2b/gate.ts. The feature depends on AGI_E2B_EXECUTION and E2B_API_KEY. No visible label for a team mention flow was found.
- **Needs:** a team with a repository and the coding feature enabled

## S110.12 Design → implementation.

- **Expected:** A design (generated prototype or Figma file) is handed to a coding agent and implemented in the user's repository.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. Searched apps/web/features/code and apps/web/lib/e2b/gate.ts. The feature depends on AGI_E2B_EXECUTION and E2B_API_KEY. No visible label for a design-to-implementation flow was found.
- **Needs:** a design file and a repository

## S110.14 Completed task → reusable Skill.

- **Expected:** After a task completes, the user saves it as a reusable Skill that then appears in their Skills and can be invoked later.
- **Code:** done. Evidence present: apps/web/lib/server/tools/plugin-draft-tool.ts:48; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5382; apps/web/features/chat/components/PluginDraftCard.tsx:30; apps/web/lib/services/user-skill-authoring.ts:11
- **Where to find it:** Chat > the answer's More message actions menu > Save as skill (labels found in the code)
- **Needs:** a finished task
- **Steps:**
  1. Finish a task in chat so the answer is complete.
  2. Click the More message actions button on that answer.
  3. Click Save as skill.
  4. Look at the plugin draft card and confirm the skill is saved.
  5. Open the skills list in settings and check that the skill appears, compared with Expected.

## S110.18 Web conversation → mobile continuation.

- **Expected:** A conversation started in the web app appears on the phone with its full history, the user sends a follow-up there, and the reply syncs back to web.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:266; apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:200; apps/web/app/api/chat/sync/route.ts:130
- **Where to find it:** no screen of its own. The effect is in the sync and persistence routes (apps/web/app/api/chat/sync/route.ts and persist-message.ts), not a control of its own.
- **Needs:** a signed-in account on web and the phone app
- **Steps:**
  1. Start a chat in the web app and send a message.
  2. Open the same conversation on the phone app and check that the full history is there.
  3. Send a follow-up from the phone.
  4. Reload the web app and check that the reply appears in the same conversation.

## S110.23 Cloud result → local repository application.

- **Expected:** A cloud coding session's result (diff, branch or files) is brought into the user's local checkout from a product control, with review before applying.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. Found apps/web/lib/e2b/gate.ts. The feature depends on AGI_E2B_EXECUTION and E2B_API_KEY. No visible label for bringing a cloud result into a local checkout was found.
- **Needs:** a finished cloud coding session

## S110.24 Existing notebook → main assistant context.

- **Expected:** From the main chat, the user brings an existing notebook (project) into the conversation so its instructions and sources ground the answers.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2782; apps/web/features/chat/pages/WebChatPage.tsx:5019; apps/web/features/chat/pages/WebChatPage.tsx:2665; apps/web/app/api/chat/conversations/route.ts:279; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855
- **Where to find it:** Chat > composer > Project or folder > pick the project (labels found in the code)
- **Needs:** a project with sources
- **Steps:**
  1. Open the main chat.
  2. Click the Project or folder control in the composer.
  3. Search for or pick an existing project.
  4. Ask a question that the project's sources should answer.
  5. Check that the answer uses the project's sources, compared with Expected.

## S110.25 Main conversation → persistent notebook sources.

- **Expected:** From the main conversation, the user saves answers or the chat into a notebook (project) as persistent sources that later project chats can cite.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4026; apps/web/features/chat/components/messages/MessageBubble.tsx:1147; apps/web/features/chat/pages/WebChatPage.tsx:6156; apps/web/features/chat/pages/WebChatPage.tsx:7728; apps/web/features/projects/components/project-answer-save.ts:21; apps/web/features/projects/services/project-knowledge-upload.ts:50
- **Where to find it:** Chat > an answer's More message actions > Save to project > pick the project (labels found in the code)
- **Needs:** a project
- **Steps:**
  1. Open a chat with a finished answer.
  2. Click the More message actions button on the answer.
  3. Click Save to project.
  4. Pick the project name from the list.
  5. Open that project and check that the answer is listed as a source, compared with Expected.

## S110.26 Usage exhaustion → alternative eligible path.

- **Expected:** When the user runs out of usage, the product offers an eligible alternative (named eligible model, reset wait, or purchase) that the user can take in one step and continue.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:2175; apps/web/features/chat/pages/WebChatPage.tsx:2187; apps/web/features/chat/components/InlinePaywallCard.tsx:457
- **Where to find it:** Chat > send a message after the usage limit is reached > inline card (labels found in the code)
- **Needs:** an account that has run out of usage
- **Steps:**
  1. Use up the account's usage, or use an account that is already out of usage.
  2. Send a new message in chat.
  3. Look at the inline card that appears under the message.
  4. Click Switch to (the named model) to continue, or Buy credits.
  5. Check that the reply continues, compared with Expected.

## S110.28 Published output → versioned update.

- **Expected:** A published output is updated in place: the user changes it, republishes to the same link, and the new version is recorded and reversible.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PublishedArtifactsSection.tsx:64 (quoted code not found in the file now); apps/web/features/settings/sections/PublishedArtifactsSection.tsx:98 (quoted code not found in the file now); apps/web/app/api/artifacts/publish/[token]/versions/route.ts:28; apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:39; apps/web/lib/services/published-artifact-service.ts:971; apps/web/features/settings/services/conversation-data-service.ts:263 (quoted code not found in the file now)
- **Where to find it:** Settings > Published artifacts > History (labels found in the code)
- **Needs:** a published artifact
- **Steps:**
  1. Publish an artifact with the Publish button in the artifact panel.
  2. Edit the artifact and publish again to the same link.
  3. Open Settings and find the Published artifacts section.
  4. Click History on the artifact row.
  5. Check that the new version is listed and can be restored, compared with Expected.

## S110.29 Public creation → private fork.

- **Expected:** A viewer of a public/shared creation (conversation, artifact, app) can make a private copy in their own account and continue it.
- **Code:** done. Evidence moved: apps/web/features/chat/lib/shared-conversation-snapshot.ts:64; apps/web/features/chat/hooks/use-share-conversation.ts:135; apps/web/app/chat/from-share/[token]/page.tsx:40 (quoted code not found in the file now); apps/web/app/chat/from-share/[token]/page.tsx:168 (quoted code not found in the file now); apps/web/features/chat/components/messages/MessageBubble.tsx:2991; apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:226; apps/web/features/chat/lib/copy-shared-artifact.ts (text found, layout changed)
- **Where to find it:** Shared artifact link > Save a copy to my chats (labels found in the code)
- **Needs:** a second account and a shared artifact link
- **Steps:**
  1. Sign in with a second account.
  2. Open a shared artifact link from the first account.
  3. Click Save a copy to my chats.
  4. Open the copy in your own chats.
  5. Continue the copy and check that it is private to your account, compared with Expected.

## S110.30 Personal resource → explicitly shared workspace resource.

- **Expected:** A user explicitly shares a resource they own (project, conversation, artifact, skill) into their workspace with an access level, and members then find and open it.
- **Code:** done. Evidence present: apps/web/features/settings/sections/OrganizationSharingSection.tsx:385; apps/web/features/settings/sections/OrganizationSharingSection.tsx:492; apps/web/app/share/[token]/page.tsx:44
- **Where to find it:** Workspace console > Sharing (labels found in the code)
- **Needs:** a second member in the same workspace
- **Steps:**
  1. Open the workspace console and click Sharing.
  2. Or open a project, artifact or chat and click Share, then Share with workspace.
  3. Pick an access level, such as Can view or Can edit.
  4. Sign in as another member and open the shared resource.
  5. Check the member can find and open it, compared with Expected.
