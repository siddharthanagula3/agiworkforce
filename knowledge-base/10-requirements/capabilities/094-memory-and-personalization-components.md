---
id: "REQ-AREA-094"
type: "requirements"
title: "Requirement items: Memory and personalization components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 94. Memory and personalization components

22 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S94.01

**Memory candidate extraction.** A component extracts candidate facts from ordinary turns for memory.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-01 Learn facts from chats](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md)
- Competitor trace: CAP-memory-and-personalization-01

## S94.02

**Explicit Memory write handler.** A handler performs explicit remember/forget commands and reports the result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-02 Explicit remember and forget commands](../../20-features/094-memory-and-personalization-components/F094-02-explicit-remember-and-forget-commands.md)
- Competitor trace: CAP-memory-and-personalization-05

## S94.03

**Memory topic store.** Memories are stored with a topic/category that later features can use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-03 Manage saved memories (list, pin, delete)](../../20-features/094-memory-and-personalization-components/F094-03-manage-saved-memories-list-pin-delete.md)
- Competitor trace: CAP-memory-and-personalization-04

## S94.04

**Memory provenance.** Each memory records where it came from (conversation, turn, writer).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-01 Learn facts from chats](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md)

## S94.05

**Memory retrieval.** Saved memories are retrieved into the model context for a turn, scoped and filtered.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-05 Use memories in replies (retrieval, ranking, scope)](../../20-features/094-memory-and-personalization-components/F094-05-use-memories-in-replies-retrieval-ranking-scope.md)

## S94.06

**Memory relevance ranking.** Retrieved memories are ranked by relevance to the current request.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-05 Use memories in replies (retrieval, ranking, scope)](../../20-features/094-memory-and-personalization-components/F094-05-use-memories-in-replies-retrieval-ranking-scope.md)

## S94.07

**Duplicate-Memory merger.** Duplicate memories are merged instead of stored twice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-01 Learn facts from chats](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md)
- Competitor trace: CAP-memory-and-personalization-14, CAP-memory-and-personalization-16

## S94.08

**Contradiction/correction handling.** A newer contradicting fact supersedes the older memory.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-01 Learn facts from chats](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md)
- Competitor trace: CAP-memory-and-personalization-16

## S94.09

**Memory prioritization.** Pinned/important memories are preferred when context space is limited.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-03 Manage saved memories (list, pin, delete)](../../20-features/094-memory-and-personalization-components/F094-03-manage-saved-memories-list-pin-delete.md)
- Competitor trace: CAP-memory-and-personalization-16

## S94.10

**Memory expiry.** Memories with an expiry date stop being used and are removed on schedule.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-04 Expiry and background upkeep](../../20-features/094-memory-and-personalization-components/F094-04-expiry-and-background-upkeep.md)
- Competitor trace: CAP-memory-and-personalization-16

## S94.11

**Memory deletion.** Deleting a memory removes it from every read path immediately.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-03 Manage saved memories (list, pin, delete)](../../20-features/094-memory-and-personalization-components/F094-03-manage-saved-memories-list-pin-delete.md)

## S94.12

**Memory import/export.** Memories can be imported and exported in bulk.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-06 Import and export memories](../../20-features/094-memory-and-personalization-components/F094-06-import-and-export-memories.md)
- Competitor trace: CAP-memory-and-personalization-14, CAP-memory-and-personalization-15

## S94.13

**Personal versus Project scope resolver.** A resolver decides whether personal, workspace or project memory applies to a turn.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-05 Use memories in replies (retrieval, ranking, scope)](../../20-features/094-memory-and-personalization-components/F094-05-use-memories-in-replies-retrieval-ranking-scope.md)
- Competitor trace: CAP-memory-and-personalization-08

## S94.14

**Agent-specific Memory store.** A store keeps memory per agent, separate from personal memory.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-10 Agent-specific memory and writing-style profile (not built)](../../20-features/094-memory-and-personalization-components/F094-10-agent-specific-memory-and-writing-style-profile-no.md)
- Competitor trace: CAP-memory-and-personalization-17

## S94.15

**Background Memory maintenance.** Background jobs maintain memory (expiry, consolidation) without user action.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-04 Expiry and background upkeep](../../20-features/094-memory-and-personalization-components/F094-04-expiry-and-background-upkeep.md)
- Competitor trace: CAP-memory-and-personalization-16

## S94.16

**Writing-style profile generator.** A component builds a profile of the user's writing style from their text.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-10 Agent-specific memory and writing-style profile (not built)](../../20-features/094-memory-and-personalization-components/F094-10-agent-specific-memory-and-writing-style-profile-no.md)
- Competitor trace: CAP-memory-and-personalization-22

## S94.17

**Personalization-source selection.** The user can choose which sources (chats, connectors, imports) personalization may draw on, and the choice is enforced.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-07 Personalization source choices and never-remember rules](../../20-features/094-memory-and-personalization-components/F094-07-personalization-source-choices-and-never-remember.md)
- Competitor trace: CAP-memory-and-personalization-13

## S94.18

**Personalization attribution.** Replies record which memories or past chats shaped them, so the product can show attribution.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-08 Attribution of replies to memories and past chats](../../20-features/094-memory-and-personalization-components/F094-08-attribution-of-replies-to-memories-and-past-chats.md)
- Competitor trace: CAP-memory-and-personalization-10

## S94.19

**Sensitive-data exclusion rules.** Rules exclude credentials, special-category data and user-listed terms from memory.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-07 Personalization source choices and never-remember rules](../../20-features/094-memory-and-personalization-components/F094-07-personalization-source-choices-and-never-remember.md)
- Competitor trace: CAP-memory-and-personalization-13

## S94.20

**Temporary-conversation exclusions.** Temporary conversations are excluded from memory, past-chat recall, search and history.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-07 Personalization source choices and never-remember rules](../../20-features/094-memory-and-personalization-components/F094-07-personalization-source-choices-and-never-remember.md)
- Competitor trace: CAP-memory-and-personalization-06, CAP-memory-and-personalization-07

## S94.21

**Personal recap generator.** A component generates a personal recap of the user's recent activity.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-09 Personal recap and scheduled-run context](../../20-features/094-memory-and-personalization-components/F094-09-personal-recap-and-scheduled-run-context.md)
- Competitor trace: CAP-memory-and-personalization-27

## S94.22

**Daily-brief context builder.** A component assembles context for a daily brief (plans, time-sensitive items, recent work).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F094-09 Personal recap and scheduled-run context](../../20-features/094-memory-and-personalization-components/F094-09-personal-recap-and-scheduled-run-context.md)
- Competitor trace: CAP-memory-and-personalization-09
