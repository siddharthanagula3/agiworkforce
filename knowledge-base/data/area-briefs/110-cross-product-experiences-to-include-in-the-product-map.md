# Area 110. Cross-product experiences to include in the product map

30 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S110.01 Chat → editable document.
- Should: A document the assistant writes in chat opens as an artifact the user can edit as a document and save back as a new version.
- Status: web done, desktop done, mobile missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2201; apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx:26

## S110.02 Document → presentation.
- Should: A document (chat artifact or uploaded file) is turned into a presentation the user can open and keep working on.
- Status: web partial, desktop partial, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/lib/security/upload-scan.ts:264; apps/mobile/src/features/chat/utils/generatedFileArtifacts.ts:79; apps/mobile/src/features/chat/components/GeneratedFileCard.tsx:43; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:273; apps/extension/src/features/side-panel/generatedFiles.ts:153
- Unfinished: web: owner: provision the antivirus scanner endpoint and set UPLOAD_SCAN_WEBHOOK_URL (and UPLOAD_SCAN_WEBHOOK_TOKEN if needed); production refuses uploads without it (apps/web/lib/security/upload-scan.ts:264-282) | desktop: owner: provision the antivirus scanner endpoint and set UPLOAD_SCAN_WEBHOOK_URL (and UPLOAD_SCAN_WEBHOOK_TOKEN if needed); production refuses uploads without it (apps/web/lib/security/upload-scan.ts:264-282)

## S110.03 Spreadsheet → chart → report.
- Should: A spreadsheet the user brings is analysed, charted, and turned into a report that contains the chart.
- Status: web partial, desktop partial, mobile partial, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/e2b/gate.ts:16; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1012
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1, E2B_API_KEY, AGI_E2B_CHAT_TEMPLATE and UPLOAD_SCAN_WEBHOOK_URL; then live-check a chart-into-docx prompt on an uploaded xlsx (template has python-docx and matplotlib) | desktop: switch-on: set AGI_E2B_EXECUTION=1, E2B_API_KEY, AGI_E2B_CHAT_TEMPLATE and UPLOAD_SCAN_WEBHOOK_URL; then live-check a chart-into-docx prompt on an uploaded xlsx (template has python-docx and matplotlib) | mobile: chart artifacts now draw as charts on the phone (shared parser in @agiworkforce/types); the chart-in-report part is the web switch-on: AGI_E2B_EXECUTION=1 with E2B keys

## S110.04 Research → report → audio overview.
- Should: A finished research report can be turned into a spoken audio overview (single or multi-voice) that plays in the product.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S110.05 Research → interactive page.
- Should: A finished research report can be converted in one step into an interactive page (charts, navigation, controls) the user can open and publish.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/lib/visual-intent.ts:104; apps/web/features/chat/utils/research-plan.ts:97; apps/web/lib/services/published-artifact-service.ts:50; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1908

## S110.06 Image → edited image → video.
- Should: An image (generated or uploaded) can be edited, and the edited image then used as the input to generate a video.
- Status: web missing, desktop missing, mobile missing, cli missing, chrome missing

## S110.07 Voice → durable work task.
- Should: A request made in voice mode becomes a durable AGI Work task (runs in background, tracked in Tasks) without the user retyping it.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/lib/voice/live-voice-tools.ts:226; apps/web/lib/voice/live-voice-tools.ts:405; apps/web/lib/voice/live-voice-tool-runner.ts:207; apps/web/features/chat/lib/live-voice-session.ts:470; apps/web/features/chat/pages/WebChatPage.tsx:5667; apps/mobile/src/features/voice/services/liveVoiceSession.ts:288; apps/mobile/app/(app)/chat/[id].tsx:1244; .github/workflows/release-cli.yml:229

## S110.08 Voice → generated document.
- Should: A spoken request in voice mode produces a document (docx/pdf/markdown artifact) the user can open from the voice session.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/lib/voice/live-voice-tools.ts:127; apps/web/lib/voice/live-voice-tools.ts:359; apps/web/lib/voice/live-voice-tool-runner.ts:108; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:366; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S110.09 Browser page → Project source.
- Should: From a web page the user is viewing, one action saves that page (URL or captured content) as a source in a chosen Project, and later project chats are grounded on it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/mobile/src/features/share-preview/index.tsx:93

## S110.10 Email thread → agent task.
- Should: The user turns an email thread (forwarded, addressed, or picked from a connected mailbox) into an agent task that reads the thread and runs as a tracked task.
- Status: web done, desktop done, vscode partial, chrome missing
- Code: apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:64; packages/contracts/cloud-contracts/src/triggers.ts:125; apps/web/lib/triggers/gmail-watch.ts:427; apps/web/lib/triggers/trigger-fire.ts:69; apps/web/lib/services/scheduled-agent-executor.ts:295; apps/extension-vscode/src/integrations/localRuntimeClient.ts:1157
- Unfinished: vscode: Inherits CLI limits (operator-gated Gmail, no email intake command); fix belongs to c-cli.

## S110.11 Team mention → coding session.
- Should: A teammate mentions the assistant in a team channel, issue or PR, and that mention opens a coding session on the repository that the team can follow and whose result posts back.
- Status: web partial, desktop partial, mobile missing, cli missing, vscode missing
- Code: apps/web/lib/e2b/gate.ts:16
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | desktop: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when

## S110.12 Design → implementation.
- Should: A design (generated prototype or Figma file) is handed to a coding agent and implemented in the user's repository.
- Status: web partial, chrome unverified
- Code: apps/web/lib/e2b/gate.ts:16
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S110.13 Repository → review deck.
- Should: A repository is analysed and turned into a review deck grounded in its code.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing

## S110.14 Completed task → reusable Skill.
- Should: After a task completes, the user saves it as a reusable Skill that then appears in their Skills and can be invoked later.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/lib/server/tools/plugin-draft-tool.ts:42; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4382; apps/web/features/chat/components/PluginDraftCard.tsx:20; apps/web/lib/services/user-skill-authoring.ts:11; apps/cli/src/claude_parity.rs:255; crates/agiworkforce-command-registry/src/lib.rs:470

## S110.15 Completed task → scheduled routine.
- Should: After a task completes, the user turns it into a scheduled routine that later runs the same work successfully on its schedule.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/claude_parity.rs:256; crates/agiworkforce-command-registry/src/lib.rs:477

## S110.16 Custom assistant → Plugin migration.
- Should: The user converts an existing custom assistant into a plugin (instructions, knowledge, tools carried over) and installs or shares it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S110.17 Shared artifact → viewer-authorized connected app.
- Should: A viewer opening a shared artifact or app signs in with their own account so the app can use that viewer's connected services with their permissions.
- Status: web missing, desktop missing, mobile missing, chrome missing
- Code: infrastructure/sandbox/index.html:54

## S110.18 Web conversation → mobile continuation.
- Should: A conversation started in the web app appears on the phone with its full history, the user sends a follow-up there, and the reply syncs back to web.
- Status: web done, desktop done, mobile done
- Code: packages/ui/ui/src/sidebar/SessionItem.tsx:245; apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:160; apps/web/app/api/chat/sync/route.ts:85; apps/mobile/src/features/chat/ChatsListScreen.tsx:327; apps/mobile/services/cloudSyncEngine.ts:402; apps/mobile/stores/chat/chatExecutionStore.ts:710; apps/mobile/stores/chat/chatExecutionStore.ts:636

## S110.19 CLI session → desktop continuation.
- Should: A coding session started in the terminal CLI appears in the desktop app's local sessions for that folder and the user resumes and continues it there.
- Status: desktop done, cli done
- Code: apps/web/features/code/components/LocalSessionsSection.tsx:88; apps/desktop/electron/runtime/dispatcher.ts:882; apps/desktop/electron/runtime/developerSessionService.ts:984; apps/desktop/electron/runtime/developerSessionService.ts:767; apps/desktop/electron/runtime/developerSessionService.ts:684; apps/cli/src/lib.rs:829; apps/cli/src/app_server/developer_host.rs:3659

## S110.20 Desktop session → IDE continuation.
- Should: A coding session started in the desktop app is listed in VS Code for the same folder and the user opens it and continues it in the IDE.
- Status: desktop done, vscode done
- Code: apps/web/features/code/components/LocalSessionsSection.tsx:88; apps/desktop/electron/runtime/dispatcher.ts:882; apps/cli/src/app_server/developer_host.rs:1550; apps/desktop/electron/runtime/developerSessionService.ts:684; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:939; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1571; apps/extension-vscode/src/core/commandSetup.ts:458

## S110.21 Mobile request → authorized local-host execution.
- Should: From the phone the user sends a new request that runs on their paired computer under that computer's approvals, and sees the result on the phone.
- Status: desktop done, mobile done, cli missing, vscode done
- Code: packages/platform/utils/src/remoteControl/codeRemoteController.ts:350; apps/desktop/electron/remote/remoteControlService.ts:29; apps/mobile/src/features/companion/components/DispatchTaskComposer.tsx:181; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:316; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:330

## S110.22 Local work → explicit cloud handoff.
- Should: The user explicitly hands a local coding session (history, repo state, pending work) to cloud execution and it continues in a cloud session.
- Status: web missing, desktop missing, mobile missing, cli done, vscode partial
- Code: apps/cli/src/lib.rs:2774; apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:79; docs/decisions/2026-09-27-founder-decisions.md:391
- Unfinished: vscode: Met at parity with claude --cloud (new session from the pushed branch, D-2026-09-28-25); needs AGI_E2B_EXECUTION=1.

## S110.23 Cloud result → local repository application.
- Should: A cloud coding session's result (diff, branch or files) is brought into the user's local checkout from a product control, with review before applying.
- Status: web partial, cli missing, vscode partial
- Code: apps/web/lib/e2b/gate.ts:16; apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:266
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | vscode: Bring the branch in pulls a cloud session's branch after review; needs AGI_E2B_EXECUTION=1.

## S110.24 Existing notebook → main assistant context.
- Should: From the main chat, the user brings an existing notebook (project) into the conversation so its instructions and sources ground the answers.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2210; apps/web/features/chat/pages/WebChatPage.tsx:3862; apps/web/features/chat/pages/WebChatPage.tsx:2005; apps/web/app/api/chat/conversations/route.ts:236; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2548; apps/mobile/stores/chat/chatExecutionStore.ts:2219; apps/mobile/stores/chat/chatMessageStore.ts:696; apps/cli/src/agent/chat.rs:777

## S110.25 Main conversation → persistent notebook sources.
- Should: From the main conversation, the user saves answers or the chat into a notebook (project) as persistent sources that later project chats can cite.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:3358; apps/web/features/chat/components/messages/MessageBubble.tsx:1023; apps/web/features/chat/pages/WebChatPage.tsx:5114; apps/web/features/chat/pages/WebChatPage.tsx:6388; apps/web/features/projects/components/project-answer-save.ts:21; apps/web/features/projects/services/project-knowledge-upload.ts:33

## S110.26 Usage exhaustion → alternative eligible path.
- Should: When the user runs out of usage, the product offers an eligible alternative (named eligible model, reset wait, or purchase) that the user can take in one step and continue.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:1818; apps/web/features/chat/pages/WebChatPage.tsx:1830; apps/web/features/chat/components/InlinePaywallCard.tsx:442; apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:287; apps/mobile/app/(app)/chat/[id].tsx:2012; apps/cli/src/errors.rs:604; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:369; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:461

## S110.27 Disconnected integration → reconnect and resume.
- Should: When a connected integration expires mid-task, the user is prompted to reconnect and the interrupted turn or run continues from where it stopped once reauthorized.
- Status: vscode done, api done
- Code: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3321; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3811; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1840; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1858; apps/web/public/openapi.json:611; apps/web/public/openapi.json:889; apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:156; apps/web/app/api/llm/v1/chat/completions/route.ts:780

## S110.28 Published output → versioned update.
- Should: A published output is updated in place: the user changes it, republishes to the same link, and the new version is recorded and reversible.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/settings/sections/PublishedArtifactsSection.tsx:64; apps/web/features/settings/sections/PublishedArtifactsSection.tsx:98; apps/web/app/api/artifacts/publish/[token]/versions/route.ts:28; apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:29; apps/web/lib/services/published-artifact-service.ts:572; apps/web/features/settings/services/conversation-data-service.ts:263; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:539; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:374

## S110.29 Public creation → private fork.
- Should: A viewer of a public/shared creation (conversation, artifact, app) can make a private copy in their own account and continue it.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/lib/shared-conversation-snapshot.ts:60; apps/web/features/chat/hooks/use-share-conversation.ts:167; apps/web/app/chat/from-share/[token]/page.tsx:40; apps/web/app/chat/from-share/[token]/page.tsx:168; apps/web/features/chat/components/messages/MessageBubble.tsx:2401; apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:122; apps/web/features/chat/lib/copy-shared-artifact.ts:37

## S110.30 Personal resource → explicitly shared workspace resource.
- Should: A user explicitly shares a resource they own (project, conversation, artifact, skill) into their workspace with an access level, and members then find and open it.
- Status: web done, desktop done, cli missing, chrome missing
- Code: apps/web/features/settings/sections/OrganizationSharingSection.tsx:384; apps/web/features/settings/sections/OrganizationSharingSection.tsx:491; apps/web/app/share/[token]/page.tsx:44
