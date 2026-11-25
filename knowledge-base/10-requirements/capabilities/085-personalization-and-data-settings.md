---
id: "REQ-AREA-085"
type: "requirements"
title: "Requirement items: Personalization and data settings"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 85. Personalization and data settings

26 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S85.01

**Profile details.** The user can view and edit their account profile (name, photo, email) on the surface, and the change is saved to the account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F085-01 Profile and account deletion](../../20-features/085-personalization-and-data-settings/F085-01-profile-and-account-deletion.md)

## S85.02

**Custom instructions.** The user can write custom instructions on the surface and they are applied to that surface's chats until changed or switched off.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Seen in a real run: Web UI_ONLY
- Feature: [F085-02 Custom instructions and reply style](../../20-features/085-personalization-and-data-settings/F085-02-custom-instructions-and-reply-style.md)

## S85.03

**Communication style.** The user can choose how the assistant communicates (tone, length, formatting) on the surface and replies follow it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome unverified
- Seen in a real run: Web UI_ONLY
- Feature: [F085-02 Custom instructions and reply style](../../20-features/085-personalization-and-data-settings/F085-02-custom-instructions-and-reply-style.md)
- Competitor trace: CAP-settings-10

## S85.04

**Writing-style personalization.** The user can give the assistant a sample of their own writing (or a named custom style) and replies imitate that writing style.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code missing, Chrome missing
- Feature: [F085-03 Writing-style sample](../../20-features/085-personalization-and-data-settings/F085-03-writing-style-sample.md)

## S85.05

**Saved Memory.** The user can see, add, edit and delete saved memories on the surface and turn memory on or off, and saved memories are used in that surface's chats.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F085-04 Saved memory](../../20-features/085-personalization-and-data-settings/F085-04-saved-memory.md)
- Competitor trace: CAP-privacy-and-data-controls-09

## S85.06

**Past-chat reference.** The user can let the assistant search or reference their other chats when answering, and switch it off; temporary chats are never referenced.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F085-05 Past-chat reference](../../20-features/085-personalization-and-data-settings/F085-05-past-chat-reference.md)
- Competitor trace: CAP-privacy-and-data-controls-09

## S85.07

**Project Memory preferences.** The user can choose, per project, whether project chats also use account-wide memories or only that project's memories.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F085-04 Saved memory](../../20-features/085-personalization-and-data-settings/F085-04-saved-memory.md)
- Competitor trace: CAP-privacy-and-data-controls-09

## S85.08

**Connected personalization sources.** The user can connect outside sources (mail, calendar, docs) that the assistant reads in the background to personalize answers, and disconnect them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F085-12 Clear device data, and options that are not offered](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)

## S85.09

**Location-use preference.** The user can allow or block use of their location to personalize answers.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F085-12 Clear device data, and options that are not offered](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)

## S85.10

**Browsing-context preference.** The user controls which websites or browser the assistant may read or act in, and can revoke that access.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Chrome done
- Feature: [F085-11 Browsing access](../../20-features/085-personalization-and-data-settings/F085-11-browsing-access.md)
- Competitor trace: CAP-privacy-and-data-controls-33

## S85.11

**Activity-history preference.** The user can choose whether their chats are kept in history (and synced to the account) or not saved.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Feature: [F085-06 Chat history and temporary chats](../../20-features/085-personalization-and-data-settings/F085-06-chat-history-and-temporary-chats.md)

## S85.12

**Training/improvement choice.** The user can choose whether their content may be used to train or improve models.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F085-10 Privacy choices: training, crash reports, feedback](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md)
- Competitor trace: CAP-settings-18, CAP-privacy-and-data-controls-01, CAP-privacy-and-data-controls-18
- An owner decision is open on this item.

## S85.13

**Feedback-data choice.** When sending feedback (thumbs, reports), the user can choose whether the conversation content is shared with it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F085-10 Privacy choices: training, crash reports, feedback](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md)
- Competitor trace: CAP-settings-18, CAP-privacy-and-data-controls-02

## S85.14

**Diagnostic-sharing choice.** The user can choose whether crash reports and diagnostics are sent, and the choice is honoured.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F085-10 Privacy choices: training, crash reports, feedback](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md)
- Competitor trace: CAP-privacy-and-data-controls-29

## S85.15

**Voice recording retention.** The user can see and control how long voice recordings are kept, or delete them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F085-12 Clear device data, and options that are not offered](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Competitor trace: CAP-settings-19, CAP-privacy-and-data-controls-18

## S85.16

**Temporary-chat preferences.** The user can make new chats temporary by default (not saved, not used for memory) and the preference is honoured.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F085-06 Chat history and temporary chats](../../20-features/085-personalization-and-data-settings/F085-06-chat-history-and-temporary-chats.md)
- Competitor trace: CAP-settings-24, CAP-privacy-and-data-controls-07

## S85.17

**Archived-chat management.** The user can list archived chats, restore them, and delete them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F085-07 Archived and deleted chats](../../20-features/085-personalization-and-data-settings/F085-07-archived-and-deleted-chats.md)
- Competitor trace: CAP-settings-21, CAP-privacy-and-data-controls-11, CAP-privacy-and-data-controls-12

## S85.18

**Delete all chats.** One action deletes every chat in the user's history (active and archived) after confirmation, and the copy states truthfully whether they can be restored.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F085-07 Archived and deleted chats](../../20-features/085-personalization-and-data-settings/F085-07-archived-and-deleted-chats.md)
- Competitor trace: CAP-settings-22, CAP-privacy-and-data-controls-11

## S85.19

**Shared-link management.** The user can list the chat links (and published pages) they have shared and revoke any of them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F085-08 Shared links](../../20-features/085-personalization-and-data-settings/F085-08-shared-links.md)
- Competitor trace: CAP-settings-23, CAP-privacy-and-data-controls-19

## S85.20

**Data export.** The user can download a copy of their account data (chats, memory, files, settings) from the surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F085-09 Data export and history import](../../20-features/085-personalization-and-data-settings/F085-09-data-export-and-history-import.md)
- Competitor trace: CAP-settings-20, CAP-privacy-and-data-controls-13

## S85.21

**Import history.** The user can import chat history from another assistant (e.g. a ChatGPT or Claude export) into their conversation list.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F085-09 Data export and history import](../../20-features/085-personalization-and-data-settings/F085-09-data-export-and-history-import.md)
- Competitor trace: CAP-settings-26

## S85.22

**Import Memory.** The user can import memories exported from another assistant and they become saved memories.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F085-04 Saved memory](../../20-features/085-personalization-and-data-settings/F085-04-saved-memory.md)
- Competitor trace: CAP-settings-26, CAP-privacy-and-data-controls-09

## S85.23

**Clear local storage.** The user can wipe the data the app keeps on this device (local chats, cache, settings) from within the app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing, Mobile done, CLI missing, VS Code missing
- Feature: [F085-12 Clear device data, and options that are not offered](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Competitor trace: CAP-settings-27, CAP-privacy-and-data-controls-28

## S85.24

**Clear browser data.** The user can clear cookies and browsing data held by an AGI-controlled browser.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F085-12 Clear device data, and options that are not offered](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Competitor trace: CAP-settings-27

## S85.25

**Reset personalization.** One action resets personalization (instructions, style, memory) to defaults after confirmation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F085-02 Custom instructions and reply style](../../20-features/085-personalization-and-data-settings/F085-02-custom-instructions-and-reply-style.md)

## S85.26

**Delete account.** The user can delete their account (and its data) from the surface after an explicit confirmation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Seen in a real run: Web UI_ONLY
- Feature: [F085-01 Profile and account deletion](../../20-features/085-personalization-and-data-settings/F085-01-profile-and-account-deletion.md)
- Competitor trace: CAP-settings-25, CAP-privacy-and-data-controls-15
