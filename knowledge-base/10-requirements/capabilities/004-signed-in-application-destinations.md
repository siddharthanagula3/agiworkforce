---
id: "REQ-AREA-004"
type: "requirements"
title: "Requirement items: Signed-in application destinations"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 4. Signed-in application destinations

44 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S4.01

**New-chat home.** Signed-in user lands on (or opens) an empty new-chat screen with a ready composer from which a new conversation starts.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F004-01 New chat and past chats](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md)
- Competitor trace: CAP-conversations-and-history-01

## S4.02

**Existing conversation.** Opening a past conversation (from the list or a link) shows its transcript and lets the user continue it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F004-01 New chat and past chats](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md)
- Competitor trace: CAP-conversations-and-history-02, CAP-conversations-and-history-19

## S4.03

**Conversation search.** A search destination where the user types a keyword, gets past conversations matching titles or message text, and opens one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F004-02 Search, archived and pinned chats](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md)
- Competitor trace: CAP-conversations-and-history-03

## S4.04

**Archived conversations.** A destination lists the user's archived conversations and lets them open, restore or delete them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F004-02 Search, archived and pinned chats](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md)
- Competitor trace: CAP-conversations-and-history-08, CAP-conversations-and-history-09

## S4.05

**Pinned conversations.** Conversations the user pinned are shown together in a pinned section or filter and open from there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F004-02 Search, archived and pinned chats](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md)
- Competitor trace: CAP-conversations-and-history-02, CAP-conversations-and-history-07

## S4.06

**Projects index.** A Projects destination lists the user's projects and lets them open or create one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Seen in a real run: Web PASS
- Feature: [F004-03 Projects: list, overview, chats, instructions](../../20-features/004-signed-in-application-destinations/F004-03-projects-list-overview-chats-instructions.md)

## S4.07

**Project overview.** Opening a project shows its home: name, description/instructions summary, and entry points to its chats and files.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Seen in a real run: Web PASS
- Feature: [F004-03 Projects: list, overview, chats, instructions](../../20-features/004-signed-in-application-destinations/F004-03-projects-list-overview-chats-instructions.md)

## S4.08

**Project conversations.** Within a project, a list of the project's conversations that open when selected.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome unverified
- Seen in a real run: Web PARTIAL
- Feature: [F004-03 Projects: list, overview, chats, instructions](../../20-features/004-signed-in-application-destinations/F004-03-projects-list-overview-chats-instructions.md)

## S4.09

**Project files and sources.** Within a project, a files/sources view lists the project's knowledge files and lets the user add and remove them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Seen in a real run: Web BLOCKED
- Feature: [F004-04 Project sources, members, memory and notebook](../../20-features/004-signed-in-application-destinations/F004-04-project-sources-members-memory-and-notebook.md)

## S4.10

**Project instructions.** A place to view and edit a project's instructions, which then apply to chats in that project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Seen in a real run: Web PASS
- Feature: [F004-03 Projects: list, overview, chats, instructions](../../20-features/004-signed-in-application-destinations/F004-03-projects-list-overview-chats-instructions.md)

## S4.11

**Project members.** A project members view shows who has access to a project and lets the owner add or remove people.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F004-04 Project sources, members, memory and notebook](../../20-features/004-signed-in-application-destinations/F004-04-project-sources-members-memory-and-notebook.md)

## S4.12

**Project Memory.** A project memory view shows what has been remembered for that project, with scope controls, separately from account memory.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F004-04 Project sources, members, memory and notebook](../../20-features/004-signed-in-application-destinations/F004-04-project-sources-members-memory-and-notebook.md)

## S4.13

**Work-task home.** A home for agentic work where the user states a goal for an autonomous multi-step (AGI Work) run and can reach their recent work.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome done
- Feature: [F004-05 AGI Work tasks, approvals and details](../../20-features/004-signed-in-application-destinations/F004-05-agi-work-tasks-approvals-and-details.md)

## S4.14

**Active-task dashboard.** A dashboard lists the user's active/running work tasks with their live status, filterable from finished ones.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome unverified
- Feature: [F004-05 AGI Work tasks, approvals and details](../../20-features/004-signed-in-application-destinations/F004-05-agi-work-tasks-approvals-and-details.md)

## S4.15

**Task details and transcript.** Opening one task shows its status, step-by-step activity/transcript, outputs, and any pending decision.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome unverified
- Feature: [F004-05 AGI Work tasks, approvals and details](../../20-features/004-signed-in-application-destinations/F004-05-agi-work-tasks-approvals-and-details.md)

## S4.16

**Approvals inbox.** An approvals inbox gathers every pending approval across the user's tasks and lets them approve or reject each.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome unverified
- Feature: [F004-05 AGI Work tasks, approvals and details](../../20-features/004-signed-in-application-destinations/F004-05-agi-work-tasks-approvals-and-details.md)

## S4.17

**Scheduled-task manager.** A scheduled-task manager lists the user's schedules with cadence/status and lets them create, edit, pause/resume, run now and delete.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F004-06 Scheduled tasks and routine details](../../20-features/004-signed-in-application-destinations/F004-06-scheduled-tasks-and-routine-details.md)

## S4.18

**Routine details.** Opening one routine/schedule shows its configuration (prompt, cadence, next run) and its run history.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F004-06 Scheduled tasks and routine details](../../20-features/004-signed-in-application-destinations/F004-06-scheduled-tasks-and-routine-details.md)

## S4.19

**Coding-session home.** A coding home lists the user's coding sessions and starts a new one on a repository or runtime.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F004-07 Coding sessions](../../20-features/004-signed-in-application-destinations/F004-07-coding-sessions.md)

## S4.20

**Coding-session workspace.** A coding-session workspace shows the session transcript, file changes/diffs and a composer to steer the next turn.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F004-07 Coding sessions](../../20-features/004-signed-in-application-destinations/F004-07-coding-sessions.md)

## S4.21

**Remote devices.** A devices destination lists the user's linked devices with status/last activity and lets them manage (rename, unlink, pair) them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F004-08 Devices and remote sessions](../../20-features/004-signed-in-application-destinations/F004-08-devices-and-remote-sessions.md)

## S4.22

**Remote-session viewer.** A viewer opens a session running on another of the user's devices and shows its live transcript/state with controls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F004-08 Devices and remote sessions](../../20-features/004-signed-in-application-destinations/F004-08-devices-and-remote-sessions.md)

## S4.23

**Library.** A Library destination lists everything the account produced or uploaded (files, images, videos, documents, artifacts) with filters and open/download actions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Seen in a real run: Web PASS
- Feature: [F004-09 Library, artifacts, images and media jobs](../../20-features/004-signed-in-application-destinations/F004-09-library-artifacts-images-and-media-jobs.md)

## S4.24

**Shared-with-me resources.** A destination lists resources (projects, conversations, artifacts, connectors) that other people shared with the user, and opens them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F004-10 Shared items](../../20-features/004-signed-in-application-destinations/F004-10-shared-items.md)

## S4.25

**Artifact gallery.** An artifact gallery lists the user's generated artifacts and opens any of them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Feature: [F004-09 Library, artifacts, images and media jobs](../../20-features/004-signed-in-application-destinations/F004-09-library-artifacts-images-and-media-jobs.md)

## S4.26

**Artifact editor.** An artifact editor lets the user edit an artifact's content directly and saves the result as a new version.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F004-09 Library, artifacts, images and media jobs](../../20-features/004-signed-in-application-destinations/F004-09-library-artifacts-images-and-media-jobs.md)

## S4.27

**Image studio.** A dedicated image studio where the user writes a prompt, picks style/size options, generates images and sees results/history in one place.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F004-09 Library, artifacts, images and media jobs](../../20-features/004-signed-in-application-destinations/F004-09-library-artifacts-images-and-media-jobs.md)

## S4.28

**Image collection.** An image collection view shows all images the user generated or uploaded, with open/download/remix actions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F004-09 Library, artifacts, images and media jobs](../../20-features/004-signed-in-application-destinations/F004-09-library-artifacts-images-and-media-jobs.md)

## S4.29

**Video studio.** A dedicated video studio where the user prompts, configures and generates videos and sees results/history in one place.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F004-99 Other items in Signed-in application destinations](../../20-features/004-signed-in-application-destinations/F004-99-other-items.md)

## S4.30

**Media job history.** A media job history lists image/video generation jobs with their status (queued, running, failed, done) and links to results.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F004-09 Library, artifacts, images and media jobs](../../20-features/004-signed-in-application-destinations/F004-09-library-artifacts-images-and-media-jobs.md)

## S4.31

**Notebook workspace.** A notebook workspace holds a set of sources and notes that the user reads, annotates and chats over, with generated outputs (NotebookLM-style).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F004-04 Project sources, members, memory and notebook](../../20-features/004-signed-in-application-destinations/F004-04-project-sources-members-memory-and-notebook.md)

## S4.32

**Research report reader.** A research report reader lists the user's research reports and opens one with its sections and cited sources.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F004-99 Other items in Signed-in application destinations](../../20-features/004-signed-in-application-destinations/F004-99-other-items.md)
- Competitor trace: CAP-research-10, CAP-research-12

## S4.33

**Custom-assistant manager.** A signed-in destination lists the user's custom assistants (GPT/Gem-style) and lets them open, create, edit and delete them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F004-11 Agents (custom assistants)](../../20-features/004-signed-in-application-destinations/F004-11-agents-custom-assistants.md)

## S4.34

**Custom-assistant builder.** A builder lets the user define a custom assistant (name, instructions, knowledge, tools, starters), preview it and save it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F004-11 Agents (custom assistants)](../../20-features/004-signed-in-application-destinations/F004-11-agents-custom-assistants.md)

## S4.35

**Skills manager.** A skills manager lists installed and available skills and lets the user install, enable/disable, author and remove them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F004-12 Skills, plugins and connected accounts](../../20-features/004-signed-in-application-destinations/F004-12-skills-plugins-and-connected-accounts.md)

## S4.36

**Plugins manager.** A plugins manager lists installed and available plugins and lets the user install, configure, update and remove them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F004-12 Skills, plugins and connected accounts](../../20-features/004-signed-in-application-destinations/F004-12-skills-plugins-and-connected-accounts.md)

## S4.37

**Connected accounts.** A connected-accounts destination lists the third-party services the user has connected and lets them connect, reconnect and disconnect each.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Seen in a real run: Web UI_ONLY
- Feature: [F004-12 Skills, plugins and connected accounts](../../20-features/004-signed-in-application-destinations/F004-12-skills-plugins-and-connected-accounts.md)

## S4.38

**Model catalog.** A model catalog lists the models the user can reach with capabilities/context/price and lets them pick one or set a default.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F004-13 Models, usage, billing and settings](../../20-features/004-signed-in-application-destinations/F004-13-models-usage-billing-and-settings.md)

## S4.39

**Usage dashboard.** A usage dashboard shows current usage against plan limits per window (session/weekly/credits), reset times and recent usage history.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PARTIAL
- Feature: [F004-13 Models, usage, billing and settings](../../20-features/004-signed-in-application-destinations/F004-13-models-usage-billing-and-settings.md)

## S4.40

**Billing settings.** A billing settings destination shows the current plan, renewal, payment method and invoices, and lets the user change or cancel the plan.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial
- Seen in a real run: Web PASS
- Feature: [F004-13 Models, usage, billing and settings](../../20-features/004-signed-in-application-destinations/F004-13-models-usage-billing-and-settings.md)

## S4.41

**Personal settings.** A personal settings destination lets the signed-in user view and change their own preferences (profile, appearance, personalization, notifications) and saves them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F004-13 Models, usage, billing and settings](../../20-features/004-signed-in-application-destinations/F004-13-models-usage-billing-and-settings.md)

## S4.42

**Workspace administration.** A workspace administration destination lets an admin manage members, roles, invitations, policies and workspace settings.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, VS Code missing
- Seen in a real run: Web BLOCKED
- Feature: [F004-14 Workspace admin, developer console and help](../../20-features/004-signed-in-application-destinations/F004-14-workspace-admin-developer-console-and-help.md)

## S4.43

**Developer console.** A developer console lets the user create/revoke API keys, see API usage per key, read API docs and try requests.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F004-14 Workspace admin, developer console and help](../../20-features/004-signed-in-application-destinations/F004-14-workspace-admin-developer-console-and-help.md)

## S4.44

**Help and feedback.** A help-and-feedback destination links to help/docs/status and lets the user send product feedback or a bug report from inside the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Seen in a real run: Web PASS
- Feature: [F004-14 Workspace admin, developer console and help](../../20-features/004-signed-in-application-destinations/F004-14-workspace-admin-developer-console-and-help.md)
