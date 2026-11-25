---
id: "AREA-110"
type: "area"
title: "Cross-product experiences to include in the product map"
features: ["F110-01", "F110-02", "F110-03", "F110-04", "F110-05", "F110-06", "F110-07", "F110-08", "F110-09", "F110-10", "F110-11", "F110-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 110. Cross-product experiences to include in the product map

These are the places where one piece of work moves across the product: a chat answer becomes an editable document or a slide deck, a voice request becomes a background task, a finished task becomes a reusable skill or a scheduled routine, a coding session moves between the web, desktop, terminal, editor and phone, and a shared artifact can be copied, versioned or reconnected. A person gets to keep working on something without retyping it or losing its history. It matters because most of the value of the product is in these hand-offs, and they are where the brief shows the most gaps (audio overview, image to video, Project sources, and the phone remote are missing or switched off).

**Who uses it.** Every signed-in user for chat documents, voice, publishing and sharing. Paid-plan gates apply to the background work task (plan capability 'agi_work', live-voice-tools.ts:400-401) and to remote control (companion/index.tsx:105). Cloud coding needs the server's sandbox provider key and the managed-compute beta switch (see switches). GitHub mentions only start work for members of the repository (github/webhook/route.ts:228). Workspace members use organization sharing with read-only or can-edit access (OrganizationSharingSection.tsx:196). Developers and operators use the environment switches and the CLI slash commands.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F110-01](F110-01-editable-chat-documents-and-slide-decks.md) | Editable chat documents and slide decks | partly | partly | partly | no | no | partly |
| [F110-02](F110-02-spreadsheet-analysis-charts-and-reports.md) | Spreadsheet analysis, charts and reports | partly | partly | partly | no | no | no |
| [F110-03](F110-03-research-outputs-audio-overview-and-interactive-pa.md) | Research outputs: audio overview and interactive page | partly | partly | partly | no | no | no |
| [F110-04](F110-04-image-to-video.md) | Image to video | partly | partly | partly | no | n/a | no |
| [F110-05](F110-05-voice-requests-that-start-work-or-make-documents.md) | Voice requests that start work or make documents | built | built | partly | built | no | no |
| [F110-06](F110-06-projects-saved-sources-and-answers.md) | Projects: saved sources and answers | partly | partly | partly | partly | partly | partly |
| [F110-07](F110-07-skills-and-routines-from-a-finished-task.md) | Skills and routines from a finished task | partly | partly | no | partly | no | no |
| [F110-08](F110-08-email-and-github-mentions-start-tracked-work.md) | Email and GitHub mentions start tracked work | partly | partly | no | partly | no | no |
| [F110-09](F110-09-cloud-coding-sessions.md) | Cloud coding sessions | partly | partly | partly | partly | partly | no |
| [F110-10](F110-10-moving-work-between-devices.md) | Moving work between devices | built | built | built | partly | built | n/a |
| [F110-11](F110-11-usage-limit-recovery-and-reconnecting-a-connected.md) | Usage limit recovery and reconnecting a connected account | built | built | built | built | built | built |
| [F110-12](F110-12-sharing-forking-and-publishing.md) | Sharing, forking and publishing | partly | partly | partly | no | no | partly |

Requirement items for this area: [10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md).

## How this area works in the code

1. **Chat answer becomes an artifact and is edited.** The web chat keeps artifacts in browser storage under a fixed key. The artifact view opens the rich editor for a document. Leaving the editor or pausing writes the draft back through upsertArtifact, and a content change creates the next version in the artifact store. (`~/Desktop/agiworkforce/apps/web/features/chat/stores/artifacts-store.ts:562-564, 590-591` (not found), `~/Desktop/agiworkforce/apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1124-1150, 3291-3296` (not found), `~/Desktop/agiworkforce/apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx:53-60` (not found), `~/Desktop/agiworkforce/packages/platform/artifacts/src/artifact-store.ts:69-120` (not found))
2. **Office file tool makes Word, PowerPoint, Excel, PDF or CSV files.** The model is offered one tool that writes a real file. A slide deck is built from an outline of up to 40 slides with a presentation library. Only Word and Excel files can be used as a source to edit. (`~/Desktop/agiworkforce/apps/web/lib/services/managed-office-file-service.ts:23, 142-146, 233-241, 253-259` (not found))
3. **Voice tool list is built per turn.** The server decides which tools the voice model may call: the web search and page fetch tools, the office file tool, the work-task tool (only with the 'agi_work' plan capability and a client hand-off), and the sandbox tools (only when the sandbox is provisioned). (`~/Desktop/agiworkforce/apps/web/lib/voice/live-voice-tools.ts:378, 396-406` (not found))
4. **Voice work-task call becomes a work-mode chat turn.** The voice client receives the tool call, checks the goal, and calls back into the chat page. The chat page sends the goal as a work-mode turn, so it runs as a tracked task in the chat. (`~/Desktop/agiworkforce/apps/web/features/chat/lib/live-voice-session.ts:756-769` (not found), `~/Desktop/agiworkforce/apps/web/features/chat/pages/WebChatPage.tsx:6801-6817` (not found))
5. **Cloud execution is gated by switches.** Cloud coding and code execution are refused unless the sandbox key and switch are set, the sandbox rate is priceable, and the managed-compute beta is on (on by default when unset). (`~/Desktop/agiworkforce/apps/web/lib/e2b/gate.ts:6-7, 9-18, 20-28` (not found), `~/Desktop/agiworkforce/apps/web/lib/services/cloud-code-session-open.ts:44-52` (not found), `~/Desktop/agiworkforce/apps/web/lib/managed-compute-gate.ts:40, 55-58` (not found))
6. **GitHub mention becomes a coding task or review.** The GitHub webhook checks the comment for a mention and the commenter's standing on the repository. A review request or a coding task starts in the background. The coding task replies on the issue or pull request. (`~/Desktop/agiworkforce/apps/web/app/api/github/webhook/route.ts:211-213, 228, 238, 266` (not found), `~/Desktop/agiworkforce/apps/web/lib/services/cloud-code-github-task.ts:102-110, 209, 221-224` (not found))
7. **Publish, version and restore a shared artifact.** Publishing writes a publication row. Restoring an older version writes its content back to the same row in one transaction. Versions are listed from a separate versions table. Unpublish deletes the row. (`~/Desktop/agiworkforce/apps/web/lib/services/published-artifact-service.ts:421, 500-520, 563-578, 971-990` (not found), `~/Desktop/agiworkforce/apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:80-117` (not found))
8. **Email event starts a tracked run.** A new Gmail message is ingested as a trigger event. The trigger builds the run prompt and puts the event data in a block marked as data, not instructions. (`~/Desktop/agiworkforce/apps/web/lib/triggers/gmail-watch.ts:425-431` (not found), `~/Desktop/agiworkforce/apps/web/lib/triggers/trigger-fire.ts:60-75` (not found))
9. **Desktop and VS Code list local sessions from the CLI app server.** The desktop app runs the CLI app server and asks it for the thread list, page by page. VS Code asks the same server for the thread list and resumes a thread by id. The CLI app server implements the thread calls. (`~/Desktop/agiworkforce/apps/desktop/electron/runtime/developerSessionService.ts:2563-2571` (not found), `~/Desktop/agiworkforce/apps/extension-vscode/src/integrations/localRuntimeClient.ts:1652-1668` (not found), `~/Desktop/agiworkforce/apps/cli/src/app_server/account_host.rs:568-600` (not found))
10. **Connector needs reconnecting.** When a connector tool needs authorization, the result carries a reconnect flag, a reason and a connect URL. The client is told to send the request again. An expired token also records a reconnect notification for the user. (`~/Desktop/agiworkforce/packages/contracts/types/src/connector-connect-required.ts:1, 90-99` (not found), `~/Desktop/agiworkforce/apps/web/public/openapi.json:642` (not found), `~/Desktop/agiworkforce/apps/web/lib/connectors/oauth-access.ts:39-56` (not found))

## Files to know

| File | Role |
|---|---|
| `~/Desktop/agiworkforce/apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` (not found) | Artifact view on web: editing draft, saving to the store, version chip, publish and comment controls. |
| `~/Desktop/agiworkforce/apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx` (not found) | Rich document editor; falls back to Markdown source when the document would not survive a round trip. |
| `~/Desktop/agiworkforce/packages/platform/artifacts/src/artifact-store.ts` (not found) | Version rule for artifacts: a new id creates version 1, a content change appends the next version. |
| `~/Desktop/agiworkforce/apps/web/lib/services/managed-office-file-service.ts` (not found) | Office file tool: builds Word, PowerPoint, Excel, PDF and CSV files for chat and voice. |
| `~/Desktop/agiworkforce/apps/web/lib/voice/live-voice-tools.ts` (not found) | Decides which tools a voice turn may use, including the work-task hand-off and sandbox tools. |
| `~/Desktop/agiworkforce/apps/web/lib/e2b/gate.ts` (not found) | Single place for the sandbox switches: key, flag, and priceable rate. |
| `~/Desktop/agiworkforce/apps/web/lib/services/published-artifact-service.ts` (not found) | Publish, restore, list versions and unpublish for shared artifacts. |
| `~/Desktop/agiworkforce/apps/web/app/api/github/webhook/route.ts` (not found) | GitHub webhook: turns a repository member's mention into a review or a coding task. |
| `~/Desktop/agiworkforce/apps/web/lib/triggers/gmail-watch.ts` (not found) | Reads new Gmail messages and ingests each one as a trigger event. |
| `~/Desktop/agiworkforce/apps/web/lib/security/upload-scan.ts` (not found) | Upload scanner: structural checks, optional external scanner, and the production refusal when no scanner is set. |
| `~/Desktop/agiworkforce/apps/desktop/electron/runtime/developerSessionService.ts` (not found) | Desktop side of local sessions: talks to the CLI app server (thread list, start, archive, rename). |
| `~/Desktop/agiworkforce/apps/cli/src/claude_parity.rs` (not found) | CLI slash commands: save-skill, save-routine, continue-with-cloud hand-off drafts. |
| `~/Desktop/agiworkforce/apps/mobile/lib/v1FeatureFlags.ts` (not found) | Mobile v1 feature switches; companion and dispatch are off in this build. |

## What is stored

- Web chat artifacts and their versions (until published): Browser localStorage under the key 'agi-artifacts-store' (artifacts-store.ts:562-591).
- Published artifacts and their version history: Postgres tables public.published_artifacts and public.published_artifact_versions (published-artifact-service.ts:563-578, 904, 971-978).
- Uploaded files: A private object storage bucket; the upload scan runs on the bytes before they are used (upload-scan.ts:42-44).
- Bytes sent to an external scanner when one is configured: Sent in the request body to UPLOAD_SCAN_WEBHOOK_URL (upload-scan.ts:445-455); not stored by this code.
- Trigger definitions and trigger events: Postgres table event_triggers (trigger-fire.ts:70-76) and the trigger ingest path (gmail-watch.ts:431).
- Reconnect notifications: Recorded through recordNotification in the database (oauth-access.ts:41-55).
- User skills: Postgres table user_skills (user-skill-service.ts:176).
- CLI skills written by the agent: Files at .agiworkforce/skills/<name>/SKILL.md in the project folder, written by the agent when the prompt is followed (claude_parity.rs:887, 897).
- Voice transcript lines in the CLI: Added to the terminal session messages and labelled as voice transcript (tui_app.rs:7556-7575).
- Organization sharing and local session storage: Not established from the code I read.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_E2B_EXECUTION**: Set to 1 to turn on the cloud sandbox switch. Needed for cloud coding, code execution and the voice sandbox tools when used with the key. (apps/web/lib/e2b/gate.ts:6, 12, 17, 23)
- **E2B_API_KEY**: Sandbox provider key. Setting it alone turns on some sandbox paths (e2bExecutionEnabled); cloud coding also needs the flag. (apps/web/lib/e2b/gate.ts:7, 10, 21-24)
- **AGI_E2B_CHAT_TEMPLATE**: Sandbox template name used for office rendering in chat; empty means no office rendering template. (apps/web/lib/e2b/chat-template.ts:1-5)
- **AGI_MANAGED_COMPUTE_PRIVATE_BETA**: Managed-compute beta switch. On when unset; off when set to 0, false or off. Cloud coding is refused when off. (apps/web/lib/managed-compute-gate.ts:40, 55-58)
- **UPLOAD_SCAN_WEBHOOK_URL and UPLOAD_SCAN_WEBHOOK_TOKEN**: External scanner endpoint and bearer token. Without the URL, uploads get structural checks only, unless the scanner is required. (apps/web/lib/security/upload-scan.ts:409, 419-420, 445-446; apps/web/.env.example:183-184)
- **UPLOAD_SCAN_REQUIRED**: true or false overrides the default. The default is required in production, so uploads are refused with scan_unavailable when no scanner is set. (apps/web/lib/security/upload-scan.ts:408-415, 421-431)
- **AGI_USER_SKILL_AUTHORING**: Skill authoring is on unless set to 0. (apps/web/lib/services/user-skill-authoring.ts:5-16; apps/web/app/api/skills/route.ts:212)
- **Plan capability 'agi_work'**: Lets the voice model offer the background work-task tool. (apps/web/lib/voice/live-voice-tools.ts:400-402 (capability list type at packages/contracts/types/src/billing-catalog.ts:311))
- **Plan capability 'remote_control'**: Required on mobile to use the companion and remote screens. (apps/mobile/app/(app)/companion/index.tsx:99-105)
- **Tier policy allowToolUse and allowSearch**: Turns tool use off for a tier; allowSearch controls the page fetch tool offered to voice. (apps/web/lib/voice/live-voice-tools.ts:378 and the product tool list near :396)
- **FEATURES.companion and FEATURES.dispatch (mobile)**: Both false in the v1 build, which switches off the phone remote screens and dispatch. (apps/mobile/lib/v1FeatureFlags.ts:12, 16; apps/mobile/app/(app)/companion/index.tsx:183)
- **FEATURES.videoGen (mobile)**: False, so video generation is off on the phone. (apps/mobile/lib/v1FeatureFlags.ts:28)
- **AGIWORKFORCE_VOICE_ALLOW_CLOUD (CLI)**: Set to 1 to allow CLI voice audio to go to a cloud transcription service. (apps/cli/src/voice.rs:85-86)
- **Temporary chat and Project binding**: A temporary chat cannot be attached to a Project; the Project must be owned, not archived and not deleted. (apps/web/app/api/chat/conversations/route.ts:230-242)

## Shared between apps

Shared: the web chat UI and connector reconnect helpers are in packages/ui/unified-chat, used by web and other surfaces (packages/ui/unified-chat/src/index.ts:487-495). Shared contracts: the work-task tool name (packages/contracts/cloud-contracts/src/live-voice-tools.ts:53), the GitHub and Gmail trigger event types (packages/contracts/cloud-contracts/src/triggers.ts:17-30), and connector reconnect detection (packages/contracts/types/src/connector-connect-required.ts). Server routes under apps/web serve web, desktop and mobile clients. Separate per app: the web artifact store (apps/web/features/chat/stores/artifacts-store.ts), the mobile artifact and voice code (apps/mobile/src/features/...), the desktop runtime (apps/desktop/electron/runtime/...), the CLI in Rust (apps/cli/src/...), the VS Code extension (apps/extension-vscode/src/...), and the Chrome extension (apps/extension/src/...). A second artifact version rule exists in packages/platform/artifacts/src/artifact-store.ts; whether the web app uses it was not established.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief cites upload-scan.ts:264-282 for the production refusal. Lines 264-282 are a credential-scan helper. The refusal is in uploadScannerStatus and runExternalScanner at lines 408-435, and the brief does not mention UPLOAD_SCAN_REQUIRED. (~/Desktop/agiworkforce/apps/web/lib/security/upload-scan.ts:264, 408-435)
- The sandbox switches use different rules in different places. e2bExecutionEnabled is true with the key alone or the flag (used by runtime and templates). e2bCutoverEnabled needs the flag only (used by the code-runs route and the tool loop). e2bProvisioningReady needs flag, key and priceable rate. Setting only the key can enable some paths and not others. (~/Desktop/agiworkforce/apps/web/lib/e2b/gate.ts:9-28; ~/Desktop/agiworkforce/apps/web/app/api/chat/conversations/[id]/code-runs/route.ts:76; ~/Desktop/agiworkforce/apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2802)
- Mobile remote control (S110.21) is marked done, but the v1 build turns off the companion and dispatch switches, so the phone remote screens show unavailable. (~/Desktop/agiworkforce/apps/mobile/lib/v1FeatureFlags.ts:12, 16; ~/Desktop/agiworkforce/apps/mobile/app/(app)/companion/index.tsx:183)
- CLI voice (S110.07, S110.08) is marked done. The cited release workflow line is a Node smoke step and the cited voice.rs line writes a WAV file. The CLI voice module is push-to-talk transcription into the session; no code found starts a background task or makes a document from voice. (~/Desktop/agiworkforce/.github/workflows/release-cli.yml:222-235; ~/Desktop/agiworkforce/apps/cli/src/voice.rs:1-10, 949-961)
- CLI cloud hand-off (S110.22) is cited at lib.rs:2774, which is marketplace code. The real hand-off is the /continue-with-cloud draft, which sends a selected transcript (default 8 messages) and says unlisted context is not available. The brief's 'repo state and pending work' is not carried by that code. (~/Desktop/agiworkforce/apps/cli/src/lib.rs:2774; ~/Desktop/agiworkforce/apps/cli/src/claude_parity.rs:247-249, 516-541, 604)
- Browser page to Project source (S110.09) cites mobile share-preview index.tsx:93, which is identity capture. The share intake stages text and files into the chat composer. No save to a Project was found. (~/Desktop/agiworkforce/apps/mobile/src/features/share-preview/index.tsx:26-28, 93)
- Project grounding (S110.24, S110.25) cites request-processor.ts:2548, which is a search budget helper, not Project context. (~/Desktop/agiworkforce/apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2542-2556)
- Email trigger (S110.10): the Gmail trigger fires for every new email. The brief's 'forwarded, addressed or picked from a connected mailbox' is not in the code; the panel says 'Runs for each new email'. (~/Desktop/agiworkforce/apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:74-79; ~/Desktop/agiworkforce/apps/web/lib/triggers/gmail-watch.ts:425-431)
- Viewer-authorized connected app (S110.17) is marked missing for web, but the shared-artifact page has a sign-in prompt and a connector consent card. The brief cites the sandbox HTML, whose CSP blocks network calls from the page (connect-src 'none'). (~/Desktop/agiworkforce/apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:280-297; ~/Desktop/agiworkforce/infrastructure/sandbox/index.html:54)
- Connector reconnect and resume (S110.27): the brief cites VS Code ChatStateManager lines, which are MCP server reconnect and write tracking. The connector reauthorization path is the server response in the API spec, which asks the client to resend. No automatic resume of the interrupted turn was found. (~/Desktop/agiworkforce/apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2394-2398, 3315-3322; ~/Desktop/agiworkforce/apps/web/public/openapi.json:642)
- Presentation from an uploaded document (S110.02): the office file tool accepts only Word and Excel files as an editable source, so an uploaded PowerPoint or PDF cannot be the input to a new deck through this tool. (~/Desktop/agiworkforce/apps/web/lib/services/managed-office-file-service.ts:233-241)
- Team mention (S110.11) is marked partial in the brief and cites only the sandbox gate. The GitHub mention flow exists in the webhook route, so the brief's status and citation do not match the code. (~/Desktop/agiworkforce/apps/web/app/api/github/webhook/route.ts:211-266; ~/Desktop/agiworkforce/apps/web/lib/services/cloud-code-github-task.ts:221-224)
- Two artifact version stores: the web store keeps artifacts in browser localStorage, and a shared store package has its own version rule. Which one is used by which app was not established. (~/Desktop/agiworkforce/apps/web/features/chat/stores/artifacts-store.ts:590-591; ~/Desktop/agiworkforce/packages/platform/artifacts/src/artifact-store.ts:69-120)

## Not established

- Nothing was built, run or tested: the task was read-only, so the localhost and one-surface-at-a-time test rule in the user's request was not applied.
- When the chat document editor writes its draft to the stored artifact: I saw saveSourceEdit (ArtifactPreview.tsx:1124-1150) and two call sites (lines 1183-1185 and 2184) but did not read the full trigger logic.
- Empty, waiting and failure states, and plan limits, for most features beyond what is named above.
- Desktop, Chrome and VS Code code was not opened for most items; their statuses are taken from the brief.
- S110.12 design to implementation and S110.13 repository review deck: no code opened. S110.16 plugin conversion: no code opened.
- S110.04 audio overview: a search for audio overview or podcast found no code; I did not confirm there is none in other folders.
- S110.06 image to video: a media service file exists (apps/web/features/media/services/media-api-service.ts) and matched a search for image and video terms, but I did not open it.
- Whether a shared app's viewer connected services work end to end (consent card, grant storage, sandbox network rules).
- How Project sources reach the model in a chat. Not found.
- Where organization shares are stored and how members see them.
- Where desktop and CLI local session data sits on disk (the thread store path).
- How the Gmail watch is registered with the mail provider (gmail-watch.ts was read only from line 425).
- The bring-branch-in review step on VS Code and whether a diff is shown before applying (cloudCodeSessions.ts:227-230, 311-321 only).
- What the sandbox template includes for chart and Word rendering (AGI_E2B_CHAT_TEMPLATE value is not in the code).
- Plan tiers that include 'agi_work' and 'remote_control' (only the type and the checks were read).
- The mobile PaywallBottomSheet and CLI errors.rs paywall paths (brief citations, not opened).
- Whether the mobile chart parser in @agiworkforce/types exists as the brief says (not opened).
