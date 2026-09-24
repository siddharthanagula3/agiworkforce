# ChatGPT And Claude Ecosystem Delta

Status: Current research snapshot
Owner: Product research
Verified: 2026-09-21
Coverage: 2026-07-01 through 2026-09-21

This document is the dated freshness layer for ChatGPT- and Claude-sensitive
product decisions made after the July 2026 baseline. It records capabilities
and continuity patterns from first-party documentation. It does not authorize
copying branding, layouts, wording, assets, or private implementation.

When an older research snapshot conflicts with this document about current
competitor behavior, this document wins. Repository implementation status still
comes from code, tests, and `docs/work/implementation-status.md`, not from this
market record.

## Executive Result

By September 21, the relevant leaders had moved beyond a collection of separate
chat clients:

- ChatGPT presents one account across Web, Mobile, and Desktop, with searchable
  history, projects, memory, files/library, connected apps, and cloud work that
  can continue across devices. Local work remains visibly distinct from cloud
  work.
- Claude presents Chat and longer-running work in one home. Cloud sessions and
  their files can resume across Web, Mobile, and Desktop, while local files,
  extensions, browser control, and computer use remain attached to an approved
  Desktop host.
- Both products distinguish account-scoped state from host-scoped capability.
  Neither pattern justifies silently uploading local files, credentials, or
  developer sessions.

AGI therefore needs two explicit continuity domains: Account Cloud for consumer
objects and Host Developer for Desktop Code, CLI, and VS Code. Desktop bridges
them only through a reviewed handoff.

## ChatGPT Changes, July 1 To September 21

| Date       | First-party change                                                                                                                                                                                                          | AGI requirement affected                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-07-09 | ChatGPT Work added longer-running work with connected apps and files, visible progress, user direction, questions, and approval points; it can produce finished documents, spreadsheets, presentations, reports, and sites. | One conversation home may escalate into a durable work run with typed progress, approvals, and reopenable deliverables.                                |
| 2026-07-14 | Search expanded across chats, projects, images, and documents on Web, iOS, and Android for all plans.                                                                                                                       | Global search must query every permitted Cloud object class while respecting account, workspace, deletion, and trust boundaries.                       |
| 2026-07-15 | Longer custom instructions became available on paid and work plans.                                                                                                                                                         | Personalization needs one versioned account owner, explicit size limits, and consistent cross-surface application.                                     |
| 2026-07-16 | Desktop unified Chat and Work recents, exposed projects, and synced Cloud Work across Web, Mobile, and Desktop. Local work remained on the computer and developer work retained separate history.                           | AGI Desktop must participate in Cloud continuity and Host Developer continuity without merging their histories or secrets.                             |
| 2026-08-04 | Large pasted text became an attachment rather than an oversized inline message.                                                                                                                                             | Composer ingestion must promote oversized input into a durable, inspectable attachment with clear ownership and limits.                                |
| 2026-08-07 | Files, search, formatting, and paste handling improved; Voice gained file and project context.                                                                                                                              | Voice is another input/output adapter over the same projects and files, not an isolated conversation store.                                            |
| 2026-08-13 | Google Drive content became available through the Library.                                                                                                                                                                  | Connected content needs a first-class library index with provider provenance and revocation handling.                                                  |
| 2026-08-14 | Projects and personalization expanded; Work remained outside project-only memory.                                                                                                                                           | Memory scopes must be explicit, inspectable, and enforced for chat, project, and work contexts.                                                        |
| 2026-08-20 | Apple Messages integration, expanded computer history, shareable developer-task snapshots, and synced pinned chats appeared.                                                                                                | New clients should reuse account objects and permissions; shares are immutable snapshots, not hidden access to a live private task.                    |
| 2026-09-03 | New connected apps and externally named site sharing arrived.                                                                                                                                                               | App connections and published outputs need identity, audience, revocation, and audit contracts.                                                        |
| 2026-09-08 | Image creation added templates, mobile sketch input, edit/comment flows, and prompt sharing.                                                                                                                                | Media is a versioned artifact workflow available from multiple surfaces, with provenance and safe sharing.                                             |
| 2026-09-10 | Data analysis in work/developer contexts and additional cloud-storage providers in Library expanded.                                                                                                                        | One file/artifact substrate should serve chat, work, and developer contexts without duplicating ownership.                                             |
| 2026-09-11 | OpenAI announced migration from Custom GPTs to plugins built from reusable instructions plus apps/tools, with staged retirement dates.                                                                                      | AGI must target reusable plugin/workflow packages, not a permanent GPT Store clone. Migration, export, compatibility, and admin controls are required. |
| 2026-09-14 | Health permissions became safer by default, and an automatic model-mode transition was retired for paid users.                                                                                                              | Sensitive domains fail closed; routing and effort transitions must be visible and policy-controlled rather than surprising.                            |
| 2026-09-17 | ChatGPT for Word expanded and connected apps gained multiple account connections across Web, Mobile, and Desktop.                                                                                                           | OAuth connections are account-scoped objects with per-connection identity; users can select, revoke, and audit more than one account per provider.     |
| 2026-09-21 | A Privacy Center was added, and a finance workflow gained credit-score integration on supported plans and regions.                                                                                                          | Privacy/data controls require a first-class destination. Sensitive integrations need plan, region, consent, data-minimization, and retention gates.    |

### Current ChatGPT Continuity Rules

- A subscription follows the signed-in account across devices. AGI likewise has
  one effective suite entitlement even when a platform store owns billing.
- Projects combine chats, files, instructions, app links, tools, and scoped
  memory. Project-only memory must not leak into unrelated work.
- Saved memories and referenced chat history are distinct controls. Temporary
  chats neither read nor write memory.
- Connected-app availability varies by plan, region, role, workspace policy,
  interface, and execution route. A model catalog entry alone does not make an
  app or tool available.
- Search and Library are account services, not sidebar-only UI. Deletion,
  revocation, and account switching must remove stale results and access.

## Claude Changes, July 1 To September 21

| Date       | First-party change                                                                                                                                                                                                                            | AGI requirement affected                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-01 | Enterprise administrators gained model-entitlement controls.                                                                                                                                                                                  | Capabilities resolve through organization policy and entitlement, never a surface-local picker list.                                     |
| 2026-07-07 | Cloud work expanded across Web and Mobile; remote sessions and files became account-saved and resumable across devices, schedules could run without a laptop, and Chat and work moved into one home. Microsoft 365 write tools also expanded. | AGI needs one conversational home, durable cloud runs, cross-device steering, and explicit confirmation/audit for writes.                |
| 2026-07-09 | Recaps and focus/break controls expanded.                                                                                                                                                                                                     | Long work needs progress summaries, pause/resume, and attention-aware controls.                                                          |
| 2026-07-10 | Memory became a set of individually visible and editable entries.                                                                                                                                                                             | Memory must be inspectable, attributable, editable, scoped, and deletable rather than an opaque prompt blob.                             |
| 2026-07-14 | Self-service health-data configuration expanded.                                                                                                                                                                                              | Sensitive features need an explicit administrative configuration and evidence trail.                                                     |
| 2026-08-06 | Enterprise skills and plugins gained security scanning.                                                                                                                                                                                       | Installable extensions require provenance, permission review, scanning, quarantine, update, and removal paths.                           |
| 2026-08-25 | Memory expanded across chat and cloud work with editable topics and sensitive-topic opt-in; defaults differed by plan/workspace.                                                                                                              | One memory service may serve multiple Cloud experiences, but scope, sensitive categories, defaults, and workspace policy remain visible. |
| 2026-09-10 | Smart reports entered enterprise beta.                                                                                                                                                                                                        | Research/report outputs belong in the durable artifact and approval system, with honest availability labels.                             |
| 2026-09-15 | A Salesforce plugin entered beta.                                                                                                                                                                                                             | Plugin availability is separately gated by plan, rollout, connection, and workspace approval.                                            |

### Current Claude Continuity Rules

- Cloud work sessions and their files are account-saved and can be resumed from
  supported Web, Mobile, and Desktop clients.
- Local files, local extensions, browser control, and screen-level computer use
  depend on a trusted Desktop host that is open and explicitly approved.
- Remote connectors follow the account; Desktop connectors and host tools do
  not become cloud credentials merely because the same account is signed in.
- Chat and work share one product home, but a direct answer does not need to
  become an asynchronous work run.
- Execution prefers a typed connector or tool, then controlled browser
  automation, then screen interaction. The fallback order cannot bypass a
  confirmation, permission, workspace policy, or trust boundary.
- Projects, artifacts, memory, generated files, and voice remain first-class
  product objects rather than being flattened into transcript text.

## AGI Product Delta

The September 21 target is a capability and continuity synthesis:

| Product behavior       | AGI target                                                                                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account identity       | One AGI account and one effective entitlement across all six surfaces; paid acquisition remains waitlist/access-code gated until opened by the founder.                                                                                |
| Cloud continuity       | Web, Mobile Cloud, Desktop Cloud, and eligible Chrome Managed Cloud share chats, messages, projects, memory, Cloud files/artifacts, connected tools/apps, OAuth connection metadata, settings, personalization, and entitlement state. |
| Developer continuity   | Desktop Code, CLI, and VS Code share host-owned local session IDs/transcripts, tools/extensions, approvals, repositories/files, and credential references.                                                                             |
| Desktop role           | One shell can show both domains, but any transfer is a previewed, scanned, consented handoff that preserves provenance.                                                                                                                |
| Chat and work          | One home answers immediately by default and escalates to a durable work run only when the job needs steps, approvals, scheduling, or background execution.                                                                             |
| Search                 | One permission-aware Cloud search covers conversations, messages, projects, files, artifacts, images, and eligible work output. Local developer search remains host-scoped.                                                            |
| Memory                 | Entries are scoped, inspectable, editable, attributable, exportable, and deletable. Sensitive categories require explicit controls.                                                                                                    |
| Apps and plugins       | Reusable instructions, skills, apps/connectors, and tools form AGI-owned workflow packages. Multiple OAuth accounts per provider and complete revocation are supported.                                                                |
| Files and artifacts    | Uploaded files, generated deliverables, visual artifacts, reports, and code outputs are versioned objects with preview, edit, compare, restore, export, share, and revoke behavior.                                                    |
| Voice and computer use | Voice invokes the same tools and objects. Desktop automation uses the least-powerful precise mechanism and asks before consequential actions.                                                                                          |
| Privacy                | A first-class privacy center controls memory, history, connections, retention, export, deletion, sensitive integrations, and account switching.                                                                                        |

## Official Sources

### OpenAI

- Release notes: https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- Projects: https://help.openai.com/en/articles/10169521-projects-in-chatgpt
- Memory: https://help.openai.com/en/articles/8590148-memory-faq
- Connected apps: https://help.openai.com/en/articles/11487775-connectors-in-chatgpt
- Subscription across devices: https://help.openai.com/en/articles/8980438-can-i-access-my-chatgpt-plus-or-pro-subscription-from-another-device
- Duplicate-subscription guidance: https://help.openai.com/articles/20001043
- Chat-history search: https://help.openai.com/en/articles/10056348-how-do-i-search-my-chat-history-in-the-chatgpt
- Library: https://help.openai.com/en/articles/20001052
- Desktop built-in browser: https://help.openai.com/en/articles/20001277-using-the-built-in-browser-in-the-chatgpt-desktop-app
- Cloud browser: https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt
- Scheduled tasks: https://help.openai.com/en/articles/10291617-tasks-in-chatgpt

### Anthropic

- Release notes: https://support.claude.com/en/articles/12138966-release-notes
- Cloud and host work across surfaces: https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile
- One Chat and work home: https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude
- Chat search and memory: https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context
- Desktop and remote connectors: https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors
- Computer use: https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork
- Artifacts: https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- Projects: https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects
- Voice: https://support.claude.com/en/articles/11101966-use-voice-mode
- File creation: https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude
- Browser enterprise defaults: https://support.claude.com/en/articles/16635803-set-up-browser-use-in-claude-cowork-for-team-and-enterprise-plans
