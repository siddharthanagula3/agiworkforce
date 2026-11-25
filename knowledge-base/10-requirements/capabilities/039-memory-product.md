---
id: "REQ-AREA-039"
type: "requirements"
title: "Requirement items: Memory product"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 39. Memory product

32 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S39.01

**Memory onboarding.** A first-run flow introduces Memory: what it stores, that it is off by default, and how to turn it on or manage it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F039-01 Turn Memory on or off](../../20-features/039-memory-product/F039-01-turn-memory-on-or-off.md)
- Competitor trace: CAP-memory-and-personalization-02

## S39.02

**Memory enable/disable control.** A visible switch turns Memory on or off, and when off the assistant neither reads nor saves memories.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F039-01 Turn Memory on or off](../../20-features/039-memory-product/F039-01-turn-memory-on-or-off.md)
- Competitor trace: CAP-memory-and-personalization-02

## S39.03

**Separate past-chat-reference control.** A control separate from the Memory switch decides whether the assistant may look up excerpts from other past chats.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F039-01 Turn Memory on or off](../../20-features/039-memory-product/F039-01-turn-memory-on-or-off.md)
- Competitor trace: CAP-memory-and-personalization-09

## S39.04

**Saved-Memory list.** The user can open a list of every memory the assistant has saved about them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F039-04 Review the Saved Memory list](../../20-features/039-memory-product/F039-04-review-the-saved-memory-list.md)
- Competitor trace: CAP-memory-and-personalization-04

## S39.05

**Memory search.** The user can search or filter their saved memories by text.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome missing
- Feature: [F039-04 Review the Saved Memory list](../../20-features/039-memory-product/F039-04-review-the-saved-memory-list.md)
- Competitor trace: CAP-memory-and-personalization-04

## S39.06

**Topic grouping.** Saved memories are grouped by topic (e.g. preferences, work, background) when the user reviews them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F039-04 Review the Saved Memory list](../../20-features/039-memory-product/F039-04-review-the-saved-memory-list.md)
- Competitor trace: CAP-memory-and-personalization-04

## S39.07

**Profile summary.** The user can read a summary of what the assistant has learned about them as a person (a profile summary).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F039-07 Summaries of what the assistant knows](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md)
- Competitor trace: CAP-memory-and-personalization-11

## S39.08

**Preference summary.** The user can read a summary of the preferences the assistant has learned from memory.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F039-07 Summaries of what the assistant knows](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md)
- Competitor trace: CAP-memory-and-personalization-11

## S39.09

**Ongoing-work summary.** The user can read a summary of the ongoing work or projects the assistant knows they are pursuing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F039-07 Summaries of what the assistant knows](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md)
- Competitor trace: CAP-memory-and-personalization-27

## S39.10

**Add Memory manually.** The user can type a new fact and save it to their memory, where later chats can use it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F039-03 Add a memory by hand or by asking](../../20-features/039-memory-product/F039-03-add-a-memory-by-hand-or-by-asking.md)
- Competitor trace: CAP-memory-and-personalization-04

## S39.11

**Explicit “remember this” action.** From inside a conversation the user can explicitly ask the assistant to remember something and gets confirmation it was saved.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F039-03 Add a memory by hand or by asking](../../20-features/039-memory-product/F039-03-add-a-memory-by-hand-or-by-asking.md)
- Competitor trace: CAP-memory-and-personalization-05

## S39.12

**Automatic Memory update.** After ordinary conversations the assistant automatically saves new durable facts to memory (when allowed).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F039-02 Automatic saving after chats](../../20-features/039-memory-product/F039-02-automatic-saving-after-chats.md)
- Competitor trace: CAP-memory-and-personalization-01

## S39.13

**Edit Memory.** The user can change the text of a saved memory and the corrected text is what later chats use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F039-05 Edit, delete and reset memory](../../20-features/039-memory-product/F039-05-edit-delete-and-reset-memory.md)
- Competitor trace: CAP-memory-and-personalization-04

## S39.14

**Delete individual Memory.** The user can delete one saved memory so the assistant stops using it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F039-05 Edit, delete and reset memory](../../20-features/039-memory-product/F039-05-edit-delete-and-reset-memory.md)
- Competitor trace: CAP-memory-and-personalization-04

## S39.15

**Delete all Memory.** One action deletes every saved memory, after a confirmation, and afterwards none remain.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome missing
- Feature: [F039-05 Edit, delete and reset memory](../../20-features/039-memory-product/F039-05-edit-delete-and-reset-memory.md)
- Competitor trace: CAP-memory-and-personalization-03

## S39.16

**Prioritize Memory.** The user can mark a memory as important (pin) so it is kept and preferred over others.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F039-06 Pin, correct stale facts and settle conflicts](../../20-features/039-memory-product/F039-06-pin-correct-stale-facts-and-settle-conflicts.md)
- Competitor trace: CAP-memory-and-personalization-04

## S39.17

**Memory source/provenance.** Each saved memory shows where it came from (typed by the user, imported, or learned from a named conversation).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F039-04 Review the Saved Memory list](../../20-features/039-memory-product/F039-04-review-the-saved-memory-list.md)

## S39.18

**Last-updated information.** Each saved memory shows when it was last added or changed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F039-04 Review the Saved Memory list](../../20-features/039-memory-product/F039-04-review-the-saved-memory-list.md)

## S39.19

**Correction of stale information.** When the user states a newer fact that contradicts a stored memory, the outdated memory stops being used without a manual edit.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F039-06 Pin, correct stale facts and settle conflicts](../../20-features/039-memory-product/F039-06-pin-correct-stale-facts-and-settle-conflicts.md)
- Competitor trace: CAP-memory-and-personalization-16

## S39.20

**Conflicting-Memory resolution.** When two memories disagree, a stated rule decides which one the assistant uses, and the user can see or settle the conflict.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F039-06 Pin, correct stale facts and settle conflicts](../../20-features/039-memory-product/F039-06-pin-correct-stale-facts-and-settle-conflicts.md)
- Competitor trace: CAP-memory-and-personalization-16

## S39.21

**Memory import.** The user can bring memories from a file or another assistant into their memory, preview them, and later chats use them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F039-10 Import and export memories](../../20-features/039-memory-product/F039-10-import-and-export-memories.md)
- Competitor trace: CAP-memory-and-personalization-14

## S39.22

**Memory export.** The user can download their saved memories in a readable file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F039-10 Import and export memories](../../20-features/039-memory-product/F039-10-import-and-export-memories.md)
- Competitor trace: CAP-memory-and-personalization-15

## S39.23

**Memory-capacity display where relevant.** Where memory has a limit, the user can see how much of it is used and which memories fall outside it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F039-11 Capacity display](../../20-features/039-memory-product/F039-11-capacity-display.md)
- Competitor trace: CAP-memory-and-personalization-16
- An owner decision is open on this item.

## S39.24

**Project-scoped Memory.** Memories can be confined to one project, are used only in that project, and the user can tell which memories are project-only.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F039-08 Project-scoped and agent-scoped memory](../../20-features/039-memory-product/F039-08-project-scoped-and-agent-scoped-memory.md)
- Competitor trace: CAP-memory-and-personalization-08

## S39.25

**Agent-specific Memory.** A custom agent or assistant can keep its own memory, separate from the user's personal memory, and the user can review it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F039-08 Project-scoped and agent-scoped memory](../../20-features/039-memory-product/F039-08-project-scoped-and-agent-scoped-memory.md)
- Competitor trace: CAP-memory-and-personalization-17

## S39.26

**Organization knowledge distinct from personal Memory.** Organization or workspace knowledge is kept apart from personal memory: work memories never appear in personal chats and vice versa, and the user can tell which is which.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F039-09 Work and organization knowledge kept apart](../../20-features/039-memory-product/F039-09-work-and-organization-knowledge-kept-apart.md)
- Competitor trace: CAP-memory-and-personalization-20

## S39.27

**Memory-used indication.** When saved memory or past chats shaped a reply, the reply shows it (and which memories), so the user can tell remembered facts from invented ones.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F039-12 Privacy rules, temporary chats and where memory applies](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Competitor trace: CAP-memory-and-personalization-10

## S39.28

**Temporary-chat exclusions.** In a temporary chat nothing is read from or saved to memory, and the temporary chat is never used later as past-chat context.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F039-12 Privacy rules, temporary chats and where memory applies](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Competitor trace: CAP-memory-and-personalization-06, CAP-memory-and-personalization-07

## S39.29

**Sensitive-Memory controls.** The user can stop sensitive information from being remembered (e.g. never-remember terms or categories), and sensitive facts such as credentials are refused automatically.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F039-12 Privacy rules, temporary chats and where memory applies](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Competitor trace: CAP-memory-and-personalization-13

## S39.30

**Memory reset independent from chat deletion.** The user can reset all memory without deleting chats, and deleting chats does not silently wipe (or silently keep) memory.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome missing
- Feature: [F039-05 Edit, delete and reset memory](../../20-features/039-memory-product/F039-05-edit-delete-and-reset-memory.md)
- Competitor trace: CAP-memory-and-personalization-03

## S39.31

**Cross-model personalization.** Saved memory and personalization apply the same way whichever model the user picks.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Feature: [F039-12 Privacy rules, temporary chats and where memory applies](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Competitor trace: CAP-memory-and-personalization-29

## S39.32

**Cross-surface Memory continuity.** A memory saved on one client appears and is used on every other client signed in to the same account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Feature: [F039-12 Privacy rules, temporary chats and where memory applies](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Competitor trace: CAP-memory-and-personalization-24, CAP-memory-and-personalization-29
