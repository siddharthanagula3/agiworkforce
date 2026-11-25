---
id: "REQ-AREA-110"
type: "requirements"
title: "Requirement items: Cross-product experiences to include in the product map"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 110. Cross-product experiences to include in the product map

30 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S110.01

**Chat → editable document.** A document the assistant writes in chat opens as an artifact the user can edit as a document and save back as a new version.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome unverified
- Feature: [F110-01 Editable chat documents and slide decks](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-01-editable-chat-documents-and-slide-decks.md)

## S110.02

**Document → presentation.** A document (chat artifact or uploaded file) is turned into a presentation the user can open and keep working on.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F110-01 Editable chat documents and slide decks](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-01-editable-chat-documents-and-slide-decks.md)

## S110.03

**Spreadsheet → chart → report.** A spreadsheet the user brings is analysed, charted, and turned into a report that contains the chart.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI missing, VS Code missing, Chrome missing
- Feature: [F110-02 Spreadsheet analysis, charts and reports](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-02-spreadsheet-analysis-charts-and-reports.md)

## S110.04

**Research → report → audio overview.** A finished research report can be turned into a spoken audio overview (single or multi-voice) that plays in the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F110-03 Research outputs: audio overview and interactive page](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-03-research-outputs-audio-overview-and-interactive-pa.md)

## S110.05

**Research → interactive page.** A finished research report can be converted in one step into an interactive page (charts, navigation, controls) the user can open and publish.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F110-03 Research outputs: audio overview and interactive page](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-03-research-outputs-audio-overview-and-interactive-pa.md)
- Competitor trace: CAP-research-27

## S110.06

**Image → edited image → video.** An image (generated or uploaded) can be edited, and the edited image then used as the input to generate a video.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome missing
- Feature: [F110-04 Image to video](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-04-image-to-video.md)

## S110.07

**Voice → durable work task.** A request made in voice mode becomes a durable AGI Work task (runs in background, tracked in Tasks) without the user retyping it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F110-05 Voice requests that start work or make documents](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-05-voice-requests-that-start-work-or-make-documents.md)

## S110.08

**Voice → generated document.** A spoken request in voice mode produces a document (docx/pdf/markdown artifact) the user can open from the voice session.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F110-05 Voice requests that start work or make documents](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-05-voice-requests-that-start-work-or-make-documents.md)

## S110.09

**Browser page → Project source.** From a web page the user is viewing, one action saves that page (URL or captured content) as a source in a chosen Project, and later project chats are grounded on it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F110-06 Projects: saved sources and answers](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-06-projects-saved-sources-and-answers.md)

## S110.10

**Email thread → agent task.** The user turns an email thread (forwarded, addressed, or picked from a connected mailbox) into an agent task that reads the thread and runs as a tracked task.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, VS Code partial, Chrome missing
- Feature: [F110-08 Email and GitHub mentions start tracked work](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-08-email-and-github-mentions-start-tracked-work.md)

## S110.11

**Team mention → coding session.** A teammate mentions the assistant in a team channel, issue or PR, and that mention opens a coding session on the repository that the team can follow and whose result posts back.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile missing, CLI missing, VS Code missing
- Feature: [F110-08 Email and GitHub mentions start tracked work](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-08-email-and-github-mentions-start-tracked-work.md)

## S110.12

**Design → implementation.** A design (generated prototype or Figma file) is handed to a coding agent and implemented in the user's repository.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Chrome unverified
- Feature: [F110-09 Cloud coding sessions](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)

## S110.13

**Repository → review deck.** A repository is analysed and turned into a review deck grounded in its code.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing
- Feature: [F110-09 Cloud coding sessions](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)

## S110.14

**Completed task → reusable Skill.** After a task completes, the user saves it as a reusable Skill that then appears in their Skills and can be invoked later.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F110-07 Skills and routines from a finished task](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-07-skills-and-routines-from-a-finished-task.md)

## S110.15

**Completed task → scheduled routine.** After a task completes, the user turns it into a scheduled routine that later runs the same work successfully on its schedule.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F110-07 Skills and routines from a finished task](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-07-skills-and-routines-from-a-finished-task.md)

## S110.16

**Custom assistant → Plugin migration.** The user converts an existing custom assistant into a plugin (instructions, knowledge, tools carried over) and installs or shares it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F110-07 Skills and routines from a finished task](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-07-skills-and-routines-from-a-finished-task.md)

## S110.17

**Shared artifact → viewer-authorized connected app.** A viewer opening a shared artifact or app signs in with their own account so the app can use that viewer's connected services with their permissions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome missing
- Feature: [F110-12 Sharing, forking and publishing](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-12-sharing-forking-and-publishing.md)

## S110.18

**Web conversation → mobile continuation.** A conversation started in the web app appears on the phone with its full history, the user sends a follow-up there, and the reply syncs back to web.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F110-10 Moving work between devices](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Competitor trace: CAP-synchronization-and-continuity-01

## S110.19

**CLI session → desktop continuation.** A coding session started in the terminal CLI appears in the desktop app's local sessions for that folder and the user resumes and continues it there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, CLI done
- Feature: [F110-10 Moving work between devices](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Competitor trace: CAP-synchronization-and-continuity-20

## S110.20

**Desktop session → IDE continuation.** A coding session started in the desktop app is listed in VS Code for the same folder and the user opens it and continues it in the IDE.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, VS Code done
- Feature: [F110-10 Moving work between devices](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Competitor trace: CAP-synchronization-and-continuity-20

## S110.21

**Mobile request → authorized local-host execution.** From the phone the user sends a new request that runs on their paired computer under that computer's approvals, and sees the result on the phone.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile done, CLI missing, VS Code done
- Feature: [F110-10 Moving work between devices](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Competitor trace: CAP-synchronization-and-continuity-13, CAP-synchronization-and-continuity-16

## S110.22

**Local work → explicit cloud handoff.** The user explicitly hands a local coding session (history, repo state, pending work) to cloud execution and it continues in a cloud session.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code partial
- Feature: [F110-09 Cloud coding sessions](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Competitor trace: CAP-synchronization-and-continuity-12, CAP-synchronization-and-continuity-18

## S110.23

**Cloud result → local repository application.** A cloud coding session's result (diff, branch or files) is brought into the user's local checkout from a product control, with review before applying.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, CLI missing, VS Code partial
- Feature: [F110-09 Cloud coding sessions](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Competitor trace: CAP-synchronization-and-continuity-17

## S110.24

**Existing notebook → main assistant context.** From the main chat, the user brings an existing notebook (project) into the conversation so its instructions and sources ground the answers.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F110-06 Projects: saved sources and answers](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-06-projects-saved-sources-and-answers.md)

## S110.25

**Main conversation → persistent notebook sources.** From the main conversation, the user saves answers or the chat into a notebook (project) as persistent sources that later project chats can cite.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F110-06 Projects: saved sources and answers](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-06-projects-saved-sources-and-answers.md)

## S110.26

**Usage exhaustion → alternative eligible path.** When the user runs out of usage, the product offers an eligible alternative (named eligible model, reset wait, or purchase) that the user can take in one step and continue.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F110-11 Usage limit recovery and reconnecting a connected account](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-11-usage-limit-recovery-and-reconnecting-a-connected.md)

## S110.27

**Disconnected integration → reconnect and resume.** When a connected integration expires mid-task, the user is prompted to reconnect and the interrupted turn or run continues from where it stopped once reauthorized.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done
- Feature: [F110-11 Usage limit recovery and reconnecting a connected account](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-11-usage-limit-recovery-and-reconnecting-a-connected.md)

## S110.28

**Published output → versioned update.** A published output is updated in place: the user changes it, republishes to the same link, and the new version is recorded and reversible.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome unverified
- Feature: [F110-12 Sharing, forking and publishing](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-12-sharing-forking-and-publishing.md)

## S110.29

**Public creation → private fork.** A viewer of a public/shared creation (conversation, artifact, app) can make a private copy in their own account and continue it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F110-12 Sharing, forking and publishing](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-12-sharing-forking-and-publishing.md)

## S110.30

**Personal resource → explicitly shared workspace resource.** A user explicitly shares a resource they own (project, conversation, artifact, skill) into their workspace with an access level, and members then find and open it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, Chrome missing
- Feature: [F110-12 Sharing, forking and publishing](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-12-sharing-forking-and-publishing.md)
