---
id: "REQ-AREA-041"
type: "requirements"
title: "Requirement items: Temporary and private experiences"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 41. Temporary and private experiences

20 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S41.01

**Temporary-chat entry.** The user can start a temporary chat (or make new chats temporary by default) from the chat surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PARTIAL
- Feature: [F041-01 Start a temporary chat](../../20-features/041-temporary-and-private-experiences/F041-01-start-a-temporary-chat.md)
- Competitor trace: CAP-conversations-and-history-13, CAP-privacy-and-data-controls-07

## S41.02

**Visible temporary-mode banner.** While a chat is temporary, a visible indicator says so for as long as the chat is open.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F041-02 Temporary-mode indicator and explainer](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md)
- Competitor trace: CAP-conversations-and-history-13, CAP-privacy-and-data-controls-07

## S41.03

**History-persistence explanation.** The product explains accurately what is and is not kept from a temporary chat, and the explanation matches what happens.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web FAIL
- Feature: [F041-02 Temporary-mode indicator and explainer](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md)
- Competitor trace: CAP-conversations-and-history-14, CAP-privacy-and-data-controls-07

## S41.04

**Memory-read choice where offered.** Where offered, the user can choose whether a temporary chat may read saved memory, and the choice is honoured.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F041-03 Memory and custom-instruction choices in temporary chat](../../20-features/041-temporary-and-private-experiences/F041-03-memory-and-custom-instruction-choices-in-temporary.md)
- Competitor trace: CAP-conversations-and-history-14, CAP-conversations-and-history-15, CAP-privacy-and-data-controls-08

## S41.05

**Memory-write exclusion.** Nothing from a temporary chat is saved to memory.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F041-03 Memory and custom-instruction choices in temporary chat](../../20-features/041-temporary-and-private-experiences/F041-03-memory-and-custom-instruction-choices-in-temporary.md)
- Competitor trace: CAP-conversations-and-history-14, CAP-conversations-and-history-15, CAP-privacy-and-data-controls-07

## S41.06

**Custom-instruction choice.** The user can choose whether custom instructions apply in a temporary chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F041-03 Memory and custom-instruction choices in temporary chat](../../20-features/041-temporary-and-private-experiences/F041-03-memory-and-custom-instruction-choices-in-temporary.md)
- Competitor trace: CAP-conversations-and-history-14, CAP-conversations-and-history-15, CAP-privacy-and-data-controls-08

## S41.07

**Plugin availability in temporary mode.** The user can tell which plugins/connectors work in a temporary chat and how they behave there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F041-04 Plugins and connectors in temporary chat](../../20-features/041-temporary-and-private-experiences/F041-04-plugins-and-connectors-in-temporary-chat.md)
- Competitor trace: CAP-conversations-and-history-14

## S41.08

**File-retention explanation.** The product explains what happens to files attached in a temporary chat and for how long they are kept.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F041-05 Files and generated images in temporary chats](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md)
- Competitor trace: CAP-conversations-and-history-14, CAP-privacy-and-data-controls-04, CAP-privacy-and-data-controls-07

## S41.09

**Generated-output saving choice.** In a temporary chat the user can choose to keep a generated output (image, file) even though the chat is not saved.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F041-05 Files and generated images in temporary chats](../../20-features/041-temporary-and-private-experiences/F041-05-files-and-generated-images-in-temporary-chats.md)
- Competitor trace: CAP-conversations-and-history-14

## S41.10

**Save temporary conversation explicitly.** The user can explicitly save a temporary conversation, and everything in it is then kept.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F041-06 Save a temporary chat to history](../../20-features/041-temporary-and-private-experiences/F041-06-save-a-temporary-chat-to-history.md)
- Competitor trace: CAP-conversations-and-history-16, CAP-privacy-and-data-controls-08

## S41.11

**Temporary-to-normal conversion review.** Before a temporary chat becomes a normal one, the user sees what will be kept and confirms.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F041-06 Save a temporary chat to history](../../20-features/041-temporary-and-private-experiences/F041-06-save-a-temporary-chat-to-history.md)
- Competitor trace: CAP-conversations-and-history-16, CAP-privacy-and-data-controls-08

## S41.12

**Incognito search.** The user can run searches that are not saved to their history.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F041-07 Private search and private browsing (not built)](../../20-features/041-temporary-and-private-experiences/F041-07-private-search-and-private-browsing-not-built.md)

## S41.13

**Private browser session.** The agent can browse in a private session that keeps no cookies or history afterward.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F041-07 Private search and private browsing (not built)](../../20-features/041-temporary-and-private-experiences/F041-07-private-search-and-private-browsing-not-built.md)
- Competitor trace: CAP-privacy-and-data-controls-33

## S41.14

**Local-only conversation.** The user can keep conversations only on their device, never uploaded to the account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F041-08 Local-only conversations and files](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md)
- Competitor trace: CAP-conversations-and-history-21, CAP-privacy-and-data-controls-27, CAP-privacy-and-data-controls-28

## S41.15

**Local-only file collection.** The user can keep a collection of files on the device that chats can use without uploading them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, CLI done, VS Code missing, Chrome missing
- Feature: [F041-08 Local-only conversations and files](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md)
- Competitor trace: CAP-privacy-and-data-controls-28

## S41.16

**Local-only Memory.** The user can keep memory only on the device, never stored in the account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F041-09 Local-only memory](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md)
- Competitor trace: CAP-privacy-and-data-controls-09, CAP-privacy-and-data-controls-28

## S41.17

**Clear local data.** One action clears all data the app keeps on this device.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F041-10 Clear all data on this device](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md)
- Competitor trace: CAP-conversations-and-history-21, CAP-privacy-and-data-controls-28

## S41.18

**Separate history, training, and retention controls.** History, model training and data retention each have their own clearly separate control or statement.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F041-11 Privacy controls and where data is processed](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md)
- Competitor trace: CAP-privacy-and-data-controls-01

## S41.19

**Privacy-setting education.** The product explains, in context, what each privacy setting does.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F041-02 Temporary-mode indicator and explainer](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md)
- Competitor trace: CAP-privacy-and-data-controls-17

## S41.20

**Per-feature processing-location disclosure.** For each feature the product says where the data is processed (on device, AGI cloud, a named provider).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F041-11 Privacy controls and where data is processed](../../20-features/041-temporary-and-private-experiences/F041-11-privacy-controls-and-where-data-is-processed.md)
- Competitor trace: CAP-privacy-and-data-controls-04, CAP-privacy-and-data-controls-17, CAP-privacy-and-data-controls-26, CAP-privacy-and-data-controls-27
