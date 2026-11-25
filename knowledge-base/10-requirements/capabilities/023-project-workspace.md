---
id: "REQ-AREA-023"
type: "requirements"
title: "Requirement items: Project workspace"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 23. Project workspace

38 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S23.01

**Project creation.** A signed-in user can create a named project that is saved to their account and opens as its own workspace.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Seen in a real run: Web PASS
- Feature: [F023-01 Create and set up a project](../../20-features/023-project-workspace/F023-01-create-and-set-up-a-project.md)
- Competitor trace: CAP-projects-01

## S23.02

**Project name and description.** A project has a name and an optional description that the user can set at creation and edit later.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Seen in a real run: Web PASS
- Feature: [F023-01 Create and set up a project](../../20-features/023-project-workspace/F023-01-create-and-set-up-a-project.md)
- Competitor trace: CAP-projects-01

## S23.03

**Project icon and color.** The user can choose a project's icon and colour, and the choice is shown wherever the project appears.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F023-01 Create and set up a project](../../20-features/023-project-workspace/F023-01-create-and-set-up-a-project.md)
- Competitor trace: CAP-projects-01

## S23.04

**Project cover or identity treatment.** A project carries a visual identity (cover image or tinted icon badge) that distinguishes it in lists and on its page.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F023-01 Create and set up a project](../../20-features/023-project-workspace/F023-01-create-and-set-up-a-project.md)

## S23.05

**Project overview.** Opening a project shows an overview: its name, description, counts and its main sections (chats, files, instructions).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Seen in a real run: Web PASS
- Feature: [F023-02 Project overview and search](../../20-features/023-project-workspace/F023-02-project-overview-and-search.md)
- Competitor trace: CAP-projects-01

## S23.06

**Project conversations.** A project lists its conversations, opens them, and starts new chats that are filed under the project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Seen in a real run: Web PASS
- Feature: [F023-03 Project chats, files, sources, notes and artifacts content](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Competitor trace: CAP-projects-07

## S23.07

**Project files.** Users can upload files to a project, see them listed, preview/download and remove them, and project chats can use them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Seen in a real run: Web BLOCKED
- Feature: [F023-03 Project chats, files, sources, notes and artifacts content](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Competitor trace: CAP-projects-03

## S23.08

**Project sources.** A project's Sources tab lets the user add files, text or connected-service content that project chats use as reference.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI missing, Chrome missing
- Seen in a real run: Web BLOCKED
- Feature: [F023-03 Project chats, files, sources, notes and artifacts content](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Competitor trace: CAP-projects-05

## S23.09

**Project instructions.** Instructions saved on a project are applied to every chat in that project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Seen in a real run: Web PASS
- Feature: [F023-04 Instructions, memory and project defaults](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Competitor trace: CAP-projects-02

## S23.10

**Project notes.** Users can keep written notes in a project that they can view, edit and that project chats can draw on.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F023-03 Project chats, files, sources, notes and artifacts content](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)

## S23.11

**Project Memory.** A project keeps its own memories, and the user can choose whether the project also draws on account-wide memory.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F023-04 Instructions, memory and project defaults](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Competitor trace: CAP-projects-08

## S23.12

**Project artifacts.** A project shows the artifacts produced in its chats, and each opens from there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F023-03 Project chats, files, sources, notes and artifacts content](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Competitor trace: CAP-projects-23

## S23.13

**Project coding sessions.** Coding sessions can belong to a project and are listed and reopened from it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing
- Feature: [F023-05 Local folders and coding sessions](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md)
- Competitor trace: CAP-projects-21

## S23.14

**Project work tasks.** Autonomous work tasks can be started in a project and the project lists their state.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F023-06 Work tasks and routines](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Competitor trace: CAP-projects-23

## S23.15

**Project routines.** Scheduled routines can be created inside a project and are listed on the project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web BLOCKED
- Feature: [F023-06 Work tasks and routines](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Competitor trace: CAP-projects-23

## S23.16

**Default model/profile.** A project can set a default model (or profile) that new chats in it start with.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, VS Code done
- Feature: [F023-04 Instructions, memory and project defaults](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Competitor trace: CAP-projects-18

## S23.17

**Default tools and Skills.** A project can set which tools and Skills are on by default for chats in it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F023-04 Instructions, memory and project defaults](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Competitor trace: CAP-projects-16

## S23.18

**Local-folder association.** A project can be associated with a local folder so work in that folder uses the project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done, VS Code done
- Feature: [F023-05 Local folders and coding sessions](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md)
- Competitor trace: CAP-projects-22

## S23.19

**Repository association.** A project can be associated with a code repository so coding work and context follow that repository.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F023-05 Local folders and coding sessions](../../20-features/023-project-workspace/F023-05-local-folders-and-coding-sessions.md)
- Competitor trace: CAP-projects-22

## S23.20

**Project search.** Users can search their projects by name or description.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F023-02 Project overview and search](../../20-features/023-project-workspace/F023-02-project-overview-and-search.md)
- Competitor trace: CAP-projects-15

## S23.21

**Project members.** A project shows who can access it (owner and members) and a member can see a project is shared with them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F023-07 Sharing, members and roles](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Competitor trace: CAP-projects-10, CAP-sharing-and-collaboration-16

## S23.22

**Member roles.** Project members hold distinct roles (owner, can edit, can view, no access) that the server enforces.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F023-07 Sharing, members and roles](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Competitor trace: CAP-projects-10, CAP-projects-12, CAP-sharing-and-collaboration-16

## S23.23

**Invite and remove members.** An owner or manager can add a person to a specific project and remove them from it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F023-07 Sharing, members and roles](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Competitor trace: CAP-projects-10, CAP-sharing-and-collaboration-16

## S23.24

**Shared Project links.** A user can get a link to a project that opens it for the people it is shared with.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F023-07 Sharing, members and roles](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Competitor trace: CAP-projects-11, CAP-sharing-and-collaboration-16

## S23.25

**Project-level access requests.** A person who opens a project they cannot access can request access, and an owner/manager can approve or deny it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F023-07 Sharing, members and roles](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Competitor trace: CAP-projects-10

## S23.26

**Move or copy conversations.** A user can move a conversation into (or out of) a project, or copy it into one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F023-03 Project chats, files, sources, notes and artifacts content](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Competitor trace: CAP-projects-07

## S23.27

**Add an answer to Project knowledge.** From a chat, a user can add an assistant answer (or its artifact) to a project's knowledge in one action.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F023-03 Project chats, files, sources, notes and artifacts content](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md)
- Competitor trace: CAP-projects-06

## S23.28

**Import an existing Project.** A user can import an existing project (e.g. from another assistant or an export file) and get its name, instructions and files.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F023-08 Lifecycle: archive, duplicate, delete, import and export](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Competitor trace: CAP-projects-20

## S23.29

**Duplicate a Project.** A project owner can duplicate a project, getting a copy with its settings, instructions and files.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F023-08 Lifecycle: archive, duplicate, delete, import and export](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Competitor trace: CAP-projects-19

## S23.30

**Archive and restore.** A project can be archived out of the active list and restored later with its contents intact.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F023-08 Lifecycle: archive, duplicate, delete, import and export](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Competitor trace: CAP-projects-14

## S23.31

**Export.** A project owner can export a project (settings, instructions, files and conversations) as a downloadable file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F023-08 Lifecycle: archive, duplicate, delete, import and export](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Competitor trace: CAP-projects-19

## S23.32

**Delete.** A project owner can delete a project after confirming; its files are removed and its chats are kept (unfiled).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Seen in a real run: Web UI_ONLY
- Feature: [F023-08 Lifecycle: archive, duplicate, delete, import and export](../../20-features/023-project-workspace/F023-08-lifecycle-archive-duplicate-delete-import-and-expo.md)
- Competitor trace: CAP-projects-14

## S23.33

**Project-only context mode.** A user can switch a project to use only its own context (its memories, chats and files), excluding account-wide memory and other chats.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web BLOCKED
- Feature: [F023-04 Instructions, memory and project defaults](../../20-features/023-project-workspace/F023-04-instructions-memory-and-project-defaults.md)
- Competitor trace: CAP-projects-08

## S23.34

**Shared versus personal-context explanation.** Where a project is shared, the product explains which context is shared with members (instructions, files) and which stays personal (chats, memories).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F023-07 Sharing, members and roles](../../20-features/023-project-workspace/F023-07-sharing-members-and-roles.md)
- Competitor trace: CAP-projects-10, CAP-sharing-and-collaboration-16

## S23.35

**Project activity history.** A project shows a history of what changed in it (files added/removed, settings and instruction edits, sharing changes, chats) with who and when.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F023-09 Project activity history](../../20-features/023-project-workspace/F023-09-project-activity-history.md)
- Competitor trace: CAP-sharing-and-collaboration-19

## S23.36

**Coordinating conversation for parallel work, where offered.** Where offered, one coordinating conversation can split work into parallel child threads and bring their results back together.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F023-06 Work tasks and routines](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Competitor trace: CAP-projects-21

## S23.37

**Overview of child threads and blocked work.** A project (or coordinating thread) shows an overview of its child threads and which ones are blocked and why.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F023-06 Work tasks and routines](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Competitor trace: CAP-projects-21

## S23.38

**Thread-specific steering without changing unrelated work.** A user can steer one child thread (redirect, answer, pause or stop it) without changing the other threads' work.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F023-06 Work tasks and routines](../../20-features/023-project-workspace/F023-06-work-tasks-and-routines.md)
- Competitor trace: CAP-projects-21
