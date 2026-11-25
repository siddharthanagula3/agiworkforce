---
id: "REQ-AREA-018"
type: "requirements"
title: "Requirement items: Conversation-level controls"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 18. Conversation-level controls

28 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S18.01

**Automatic title.** A new conversation gets a meaningful title automatically without the user naming it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F018-01 Test](../../20-features/018-conversation-level-controls/F018-01-test.md)
- Competitor trace: CAP-conversations-and-history-06

## S18.02

**Manual rename.** The user can rename a conversation and the new title persists.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Competitor trace: CAP-conversations-and-history-06

## S18.03

**Pin and unpin.** A conversation can be pinned so it stays at the top of the list, and unpinned.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Competitor trace: CAP-conversations-and-history-07

## S18.04

**Archive and restore.** A conversation can be archived (hidden, kept) and later restored.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Competitor trace: CAP-conversations-and-history-08

## S18.05

**Delete.** A conversation can be deleted, with confirmation, and it disappears everywhere.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Competitor trace: CAP-conversations-and-history-10, CAP-conversations-and-history-11

## S18.06

**Duplicate.** A conversation can be duplicated into a new, independent conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.07

**Move to Project.** An existing conversation can be moved into a Project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Competitor trace: CAP-conversations-and-history-24

## S18.08

**Copy into Project.** A conversation can be copied into a Project while the original stays where it is.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.09

**Change conversation mode.** Within a conversation, the user can switch its working mode (e.g. chat vs agent/work/plan) and later turns follow it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.10

**Change privacy mode through an explicit flow.** The user switches a conversation's privacy mode (e.g. temporary/incognito, local-only) through an explicit flow that explains the consequence.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Competitor trace: CAP-conversations-and-history-13, CAP-editing-regeneration-and-branching-19

## S18.11

**Conversation search.** The user can search within the open conversation's messages.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.12

**Jump between search matches.** In-conversation search moves between matches (next/previous) and scrolls to each.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.13

**Conversation outline.** A long conversation offers an outline (list of turns/headings) to see its structure.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.14

**Jump to a turn.** The user can jump directly to a chosen earlier turn in the conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.15

**Jump to latest.** After scrolling up, one control returns the view to the latest message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.16

**Scroll-position restoration.** Leaving and returning to a conversation restores the previous scroll position.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.17

**Branch-tree navigation.** A conversation with branches lets the user see and switch between branches.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Competitor trace: CAP-editing-regeneration-and-branching-10

## S18.18

**Conversation export.** The whole conversation can be exported to a file (e.g. Markdown, PDF, JSON).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Competitor trace: CAP-conversations-and-history-17

## S18.19

**Conversation sharing.** The user can share a conversation (e.g. a read-only link) from the conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.20

**Shared-link management.** The user can see and revoke links they have shared.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.21

**Conversation details inspector.** A conversation details view shows its metadata (created/updated, model, message count, id, project).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.22

**Context and source inspector.** The user can inspect what context and sources the conversation is using (files, instructions, memory, token budget).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.23

**Usage summary.** The conversation shows a usage summary (tokens/cost) for the conversation as a whole.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.24

**Conversation-level instructions.** The user can set instructions that apply only to this conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.25

**Conversation-level enabled tools.** Tool enablement (web search, code, etc.) can be set for this conversation and persists across its turns.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, Chrome missing
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.26

**Conversation-level connected accounts.** The user can choose which connected accounts/connectors this conversation may use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.27

**Active tasks associated with the conversation.** The conversation shows the active tasks/runs started from it and their status.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)

## S18.28

**Continuation on another device.** A conversation started on one device can be continued on another.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F018-99 Other items in Conversation-level controls](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Competitor trace: CAP-conversations-and-history-20
