---
id: "REQ-AREA-016"
type: "requirements"
title: "Requirement items: User-message components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 16. User-message components

22 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S16.01

**User identity/avatar.** The author of each turn is distinguishable visually (avatar, name, alignment/bubble style or terminal marker) AND announced to assistive tech (R-n).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F016-01 Who sent it (identity)](../../20-features/016-user-message-components/F016-01-who-sent-it-identity.md)

## S16.02

**Message text.** The text the user sent is shown in their message in the transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F016-02 Message text, attachments and context chips](../../20-features/016-user-message-components/F016-02-message-text-attachments-and-context-chips.md)

## S16.03

**Attachment group.** Files and images sent with a user turn are listed on that message (thumbnail or named chip) after sending.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F016-02 Message text, attachments and context chips](../../20-features/016-user-message-components/F016-02-message-text-attachments-and-context-chips.md)
- Competitor trace: CAP-editing-regeneration-and-branching-02

## S16.04

**Source and context chips.** A sent user message shows chips for the non-file context it carried (quoted text, connector/MCP resources, page, editor selection, @mentions).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F016-02 Message text, attachments and context chips](../../20-features/016-user-message-components/F016-02-message-text-attachments-and-context-chips.md)

## S16.05

**Timestamp.** Each user message exposes when it was sent (inline or on demand).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome done
- Feature: [F016-03 Timestamp and edited marker](../../20-features/016-user-message-components/F016-03-timestamp-and-edited-marker.md)

## S16.06

**Edited-message indicator.** A user message that was edited after sending is visibly marked as edited.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F016-03 Timestamp and edited marker](../../20-features/016-user-message-components/F016-03-timestamp-and-edited-marker.md)
- Competitor trace: CAP-editing-regeneration-and-branching-03

## S16.07

**Copy action.** A sent user message offers a Copy action that puts its text on the clipboard.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F016-04 Copy](../../20-features/016-user-message-components/F016-04-copy.md)

## S16.08

**Edit action.** A sent user message can be edited in place and resubmitted, producing a new reply.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F016-05 Edit in place and version paging](../../20-features/016-user-message-components/F016-05-edit-in-place-and-version-paging.md)
- Competitor trace: CAP-editing-regeneration-and-branching-01, CAP-editing-regeneration-and-branching-02

## S16.09

**Resend action.** A sent user message can be re-sent unchanged from the message itself to get a fresh reply.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F016-06 Resend / Retry](../../20-features/016-user-message-components/F016-06-resend-retry.md)
- Competitor trace: CAP-editing-regeneration-and-branching-08

## S16.10

**Branch-from-message action.** From a chosen user message the user can start a new branch conversation that contains the thread up to that message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome missing
- Feature: [F016-07 Branch from here](../../20-features/016-user-message-components/F016-07-branch-from-here.md)
- Competitor trace: CAP-editing-regeneration-and-branching-09

## S16.11

**Message-version navigation.** When a user message has several revisions the user can page between them (n of m) and the thread follows the chosen revision.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F016-05 Edit in place and version paging](../../20-features/016-user-message-components/F016-05-edit-in-place-and-version-paging.md)
- Competitor trace: CAP-editing-regeneration-and-branching-03

## S16.12

**Expand long message.** A long user message is shown collapsed with a control that expands it to full length.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F016-08 Long message collapse](../../20-features/016-user-message-components/F016-08-long-message-collapse.md)

## S16.13

**Collapse long message.** An expanded long user message can be collapsed again.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F016-08 Long message collapse](../../20-features/016-user-message-components/F016-08-long-message-collapse.md)

## S16.14

**Delivery-pending state.** While a user message is not yet accepted by the service, the message shows a pending/sending/queued state.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI missing, VS Code done, Chrome missing
- Feature: [F016-09 Sending state: queued, pending, draft](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md)

## S16.15

**Delivery-failed state.** When a user message fails to deliver, the transcript shows a clear failed state for that turn.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F016-06 Resend / Retry](../../20-features/016-user-message-components/F016-06-resend-retry.md)
- Competitor trace: CAP-editing-regeneration-and-branching-07

## S16.16

**Retry-send action.** A failed send offers Retry that re-sends the same turn (text and attachments) and replaces the failure with the new outcome.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome done
- Feature: [F016-06 Resend / Retry](../../20-features/016-user-message-components/F016-06-resend-retry.md)
- Competitor trace: CAP-editing-regeneration-and-branching-07

## S16.17

**Queued-message state.** A message sent while a reply is still running is shown as queued (not yet sent) until it goes out.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome missing
- Feature: [F016-09 Sending state: queued, pending, draft](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md)
- Competitor trace: CAP-editing-regeneration-and-branching-14

## S16.18

**Draft versus submitted distinction.** Unsent composer text is kept as a draft per conversation, separate from sent messages, and a failed send returns to the composer as an unsent draft.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F016-09 Sending state: queued, pending, draft](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md)

## S16.19

**Voice-transcript attribution.** A user message that came from speech is marked as a voice transcript (e.g. mic badge or "Transcribed").

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, Chrome missing
- Feature: [F016-10 Voice and imported attribution](../../20-features/016-user-message-components/F016-10-voice-and-imported-attribution.md)

## S16.20

**Imported-message attribution.** Messages brought in from elsewhere (another product, a shared link, another device) are marked with where they came from.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F016-10 Voice and imported attribution](../../20-features/016-user-message-components/F016-10-voice-and-imported-attribution.md)

## S16.21

**Group-conversation author identity.** In a conversation with several human participants, each user message shows which person wrote it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F016-11 Group author and message link (not built)](../../20-features/016-user-message-components/F016-11-group-author-and-message-link-not-built.md)

## S16.22

**Message-level deep link.** A user can obtain and open a link that lands on one specific message in a conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F016-11 Group author and message link (not built)](../../20-features/016-user-message-components/F016-11-group-author-and-message-link-not-built.md)
