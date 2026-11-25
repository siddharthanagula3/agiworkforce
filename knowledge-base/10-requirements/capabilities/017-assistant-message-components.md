---
id: "REQ-AREA-017"
type: "requirements"
title: "Requirement items: Assistant-message components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 17. Assistant-message components

40 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S17.01

**Assistant/model identity.** Assistant turns are distinguishable from the user's visually and to assistive tech, ideally naming the assistant/model (R-n).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F017-01 Who answered and live status](../../20-features/017-assistant-message-components/F017-01-who-answered-and-live-status.md)

## S17.02

**Streaming answer body.** The answer body renders incrementally as tokens arrive, with markdown formatting.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web BLOCKED
- Feature: [F017-01 Who answered and live status](../../20-features/017-assistant-message-components/F017-01-who-answered-and-live-status.md)

## S17.03

**Working indicator.** While the assistant works and before/while text arrives, a visible (and announced) working indicator is shown.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F017-01 Who answered and live status](../../20-features/017-assistant-message-components/F017-01-who-answered-and-live-status.md)

## S17.04

**Reasoning-summary or activity-summary disclosure.** An answer offers a collapsible summary of the model's reasoning and/or the work it did (steps, tools), expandable on demand.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F017-02 Work and sources shown under the answer](../../20-features/017-assistant-message-components/F017-02-work-and-sources-shown-under-the-answer.md)

## S17.05

**Tool-activity section.** Tool calls made for the answer appear in a tool-activity section with each tool's name, status and result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F017-02 Work and sources shown under the answer](../../20-features/017-assistant-message-components/F017-02-work-and-sources-shown-under-the-answer.md)

## S17.06

**Source citations.** Claims in an answer carry citation markers that link to the sources the answer used.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome done
- Feature: [F017-02 Work and sources shown under the answer](../../20-features/017-assistant-message-components/F017-02-work-and-sources-shown-under-the-answer.md)

## S17.07

**Sources footer.** A finished answer that used sources ends with a sources footer/list the user can open.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F017-02 Work and sources shown under the answer](../../20-features/017-assistant-message-components/F017-02-work-and-sources-shown-under-the-answer.md)

## S17.08

**Generated-file cards.** Files the assistant produced appear as cards on the answer with name/type and open/download.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, Chrome done
- Feature: [F017-03 Files, images, video and widgets the answer made](../../20-features/017-assistant-message-components/F017-03-files-images-video-and-widgets-the-answer-made.md)

## S17.09

**Artifact launch cards.** An answer that created an artifact shows a card that opens the artifact viewer/panel.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome done
- Feature: [F017-03 Files, images, video and widgets the answer made](../../20-features/017-assistant-message-components/F017-03-files-images-video-and-widgets-the-answer-made.md)

## S17.10

**Image results.** Images the assistant generated or returned render inline in the answer (viewable/downloadable).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Feature: [F017-03 Files, images, video and widgets the answer made](../../20-features/017-assistant-message-components/F017-03-files-images-video-and-widgets-the-answer-made.md)

## S17.11

**Audio results.** Audio the assistant produced (speech, music, clips) plays inline in the answer with playback controls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F017-03 Files, images, video and widgets the answer made](../../20-features/017-assistant-message-components/F017-03-files-images-video-and-widgets-the-answer-made.md)

## S17.12

**Video results.** Videos the assistant generated play inline in the answer with controls and download.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F017-03 Files, images, video and widgets the answer made](../../20-features/017-assistant-message-components/F017-03-files-images-video-and-widgets-the-answer-made.md)

## S17.13

**Interactive widgets.** Answers can contain interactive widgets (cards with choices, maps, actions) the user operates in place.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome done
- Feature: [F017-03 Files, images, video and widgets the answer made](../../20-features/017-assistant-message-components/F017-03-files-images-video-and-widgets-the-answer-made.md)

## S17.14

**Follow-up suggestions.** After an answer the product offers relevant follow-up prompts the user can pick.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile missing, CLI missing, Chrome missing
- Feature: [F017-04 Follow-up suggestions](../../20-features/017-assistant-message-components/F017-04-follow-up-suggestions.md)

## S17.15

**Copy plain text.** One action copies the whole answer's text to the clipboard.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F017-05 Copy, read aloud, share, export and save](../../20-features/017-assistant-message-components/F017-05-copy-read-aloud-share-export-and-save.md)

## S17.16

**Copy formatted answer.** A copy action places the answer on the clipboard with its formatting (rich text/HTML) so it pastes formatted into documents.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F017-05 Copy, read aloud, share, export and save](../../20-features/017-assistant-message-components/F017-05-copy-read-aloud-share-export-and-save.md)

## S17.17

**Read aloud.** An answer can be read aloud with text-to-speech from a control on the answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F017-05 Copy, read aloud, share, export and save](../../20-features/017-assistant-message-components/F017-05-copy-read-aloud-share-export-and-save.md)

## S17.18

**Stop read-aloud playback.** While an answer is being read aloud, the user can stop playback from the same place.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F017-05 Copy, read aloud, share, export and save](../../20-features/017-assistant-message-components/F017-05-copy-read-aloud-share-export-and-save.md)

## S17.19

**Regenerate answer.** A completed answer can be regenerated in place, producing a new attempt for the same prompt.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome done
- Feature: [F017-06 Regenerate, retry, continue, branch and answer versions](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md)
- Competitor trace: CAP-editing-regeneration-and-branching-04

## S17.20

**Retry failed answer.** A failed answer shows a Retry control that re-runs the turn and replaces the failure with the new outcome.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome done
- Seen in a real run: Web PARTIAL
- Feature: [F017-06 Regenerate, retry, continue, branch and answer versions](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md)
- Competitor trace: CAP-editing-regeneration-and-branching-07

## S17.21

**Continue truncated answer.** An answer cut off by the output limit offers Continue, which resumes the same answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F017-06 Regenerate, retry, continue, branch and answer versions](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md)
- Competitor trace: CAP-editing-regeneration-and-branching-13

## S17.22

**Rewrite with another model.** From an answer, the user can regenerate it with a different model in one step.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F017-06 Regenerate, retry, continue, branch and answer versions](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md)
- Competitor trace: CAP-editing-regeneration-and-branching-05

## S17.23

**Shorten answer.** One action rewrites an answer shorter.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F017-07 Rewrite the answer (shorter, longer, tone) and revise a selected part](../../20-features/017-assistant-message-components/F017-07-rewrite-the-answer-shorter-longer-tone-and-revise.md)

## S17.24

**Expand answer.** One action rewrites an answer longer/more detailed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F017-07 Rewrite the answer (shorter, longer, tone) and revise a selected part](../../20-features/017-assistant-message-components/F017-07-rewrite-the-answer-shorter-longer-tone-and-revise.md)

## S17.25

**Change tone.** One action rewrites an answer in a different tone.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F017-07 Rewrite the answer (shorter, longer, tone) and revise a selected part](../../20-features/017-assistant-message-components/F017-07-rewrite-the-answer-shorter-longer-tone-and-revise.md)

## S17.26

**Revise selected text.** The user can select part of an answer and ask for that span to be revised or asked about.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F017-07 Rewrite the answer (shorter, longer, tone) and revise a selected part](../../20-features/017-assistant-message-components/F017-07-rewrite-the-answer-shorter-longer-tone-and-revise.md)

## S17.27

**Branch from answer.** From any answer, the user can branch a new conversation that keeps history up to that point and leaves the original unchanged.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome missing
- Feature: [F017-06 Regenerate, retry, continue, branch and answer versions](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md)
- Competitor trace: CAP-editing-regeneration-and-branching-09

## S17.28

**Navigate answer variants.** When an answer has several attempts, the user can page between them (e.g. '2 of 3').

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F017-06 Regenerate, retry, continue, branch and answer versions](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md)

## S17.29

**Positive feedback.** A thumbs-up on an answer records positive feedback tied to that message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome missing
- Feature: [F017-08 Feedback and report](../../20-features/017-assistant-message-components/F017-08-feedback-and-report.md)

## S17.30

**Negative feedback.** A thumbs-down on an answer records negative feedback tied to that message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome missing
- Feature: [F017-08 Feedback and report](../../20-features/017-assistant-message-components/F017-08-feedback-and-report.md)

## S17.31

**Report answer.** An answer can be reported (e.g. harmful/incorrect) to the trust-and-safety intake from the answer itself.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F017-08 Feedback and report](../../20-features/017-assistant-message-components/F017-08-feedback-and-report.md)

## S17.32

**Share answer or conversation.** The user can share an answer or the conversation (link or system share sheet).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F017-05 Copy, read aloud, share, export and save](../../20-features/017-assistant-message-components/F017-05-copy-read-aloud-share-export-and-save.md)

## S17.33

**Save answer to Project knowledge.** From an answer, the user can save it into a Project's knowledge/sources.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F017-05 Copy, read aloud, share, export and save](../../20-features/017-assistant-message-components/F017-05-copy-read-aloud-share-export-and-save.md)

## S17.34

**Save answer as a document.** From an answer, the user can save it as an editable document inside the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F017-05 Copy, read aloud, share, export and save](../../20-features/017-assistant-message-components/F017-05-copy-read-aloud-share-export-and-save.md)

## S17.35

**Export answer.** A single answer can be exported to a file (e.g. PDF, Markdown, text).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F017-05 Copy, read aloud, share, export and save](../../20-features/017-assistant-message-components/F017-05-copy-read-aloud-share-export-and-save.md)

## S17.36

**Actual-model and usage details.** For each answer the user can see which model actually answered and its usage (tokens/cost/time).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F017-01 Who answered and live status](../../20-features/017-assistant-message-components/F017-01-who-answered-and-live-status.md)
- Competitor trace: CAP-research-15

## S17.37

**Partial-result state.** When an answer fails after producing some output, the partial output is kept and visibly marked incomplete, with the reason.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F017-09 Stopped, failed and refused answers](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md)
- Competitor trace: CAP-editing-regeneration-and-branching-12

## S17.38

**Refusal state.** When the model/safety layer refuses, the answer shows a distinct refusal state (not a generic error or a normal answer), with a next step.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F017-09 Stopped, failed and refused answers](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md)

## S17.39

**Interrupted state.** An answer the user stopped (or that was interrupted) is marked as stopped, keeps what arrived, and offers to try again.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F017-09 Stopped, failed and refused answers](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md)
- Competitor trace: CAP-editing-regeneration-and-branching-12

## S17.40

**Empty-output error state.** A turn that returns nothing shows an explicit 'no response' error with retry, not an empty bubble.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F017-09 Stopped, failed and refused answers](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md)
- Competitor trace: CAP-editing-regeneration-and-branching-07
