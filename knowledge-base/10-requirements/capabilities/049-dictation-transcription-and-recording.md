---
id: "REQ-AREA-049"
type: "requirements"
title: "Requirement items: Dictation, transcription, and recording"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 49. Dictation, transcription, and recording

30 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S49.01

**Composer dictation.** A microphone control in the composer turns speech into text in the message field.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F049-01 Dictate into the message box](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Competitor trace: CAP-voice-17, CAP-voice-20

## S49.02

**Editable transcription before send.** The dictated transcript lands in the message field where the user can edit it before sending.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Feature: [F049-01 Dictate into the message box](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Competitor trace: CAP-voice-17

## S49.03

**Dictation language selection.** The user can choose the dictation language, and recognition uses it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F049-02 Choose the dictation language](../../20-features/049-dictation-transcription-and-recording/F049-02-choose-the-dictation-language.md)
- Competitor trace: CAP-voice-07, CAP-voice-19

## S49.04

**Interim transcript.** While dictating, interim (partial) text appears before the recording ends.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F049-01 Dictate into the message box](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Competitor trace: CAP-voice-18

## S49.05

**Final transcript.** When dictation ends, the final transcript is produced and delivered.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Feature: [F049-01 Dictate into the message box](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
- Competitor trace: CAP-voice-17

## S49.06

**Retry failed transcription.** After a failed transcription the user can retry without starting over.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing
- Feature: [F049-03 Stop, discard and retry a recording](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md)
- Competitor trace: CAP-voice-17

## S49.07

**Discard recording.** The user can discard a recording without inserting or sending anything.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F049-03 Stop, discard and retry a recording](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md)
- Competitor trace: CAP-voice-17

## S49.08

**Audio-file upload.** The user can upload an existing audio file and get its transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-04 Batch and file transcription](../../20-features/049-dictation-transcription-and-recording/F049-04-batch-and-file-transcription.md)
- Competitor trace: CAP-voice-28

## S49.09

**Batch transcription.** A whole recording or file can be transcribed in one non-streaming (batch) request.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing
- Feature: [F049-04 Batch and file transcription](../../20-features/049-dictation-transcription-and-recording/F049-04-batch-and-file-transcription.md)
- Competitor trace: CAP-voice-17

## S49.10

**Streaming transcription.** Speech is transcribed as it streams, with text arriving during speech.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-05 Live voice with streaming text](../../20-features/049-dictation-transcription-and-recording/F049-05-live-voice-with-streaming-text.md)
- Competitor trace: CAP-voice-18

## S49.11

**Timestamped transcript.** A transcript can carry timestamps per segment or word.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-06 Transcript timestamps, speakers, search and seek](../../20-features/049-dictation-transcription-and-recording/F049-06-transcript-timestamps-speakers-search-and-seek.md)

## S49.12

**Speaker labels.** A multi-speaker transcript labels who spoke each part.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-06 Transcript timestamps, speakers, search and seek](../../20-features/049-dictation-transcription-and-recording/F049-06-transcript-timestamps-speakers-search-and-seek.md)
- Competitor trace: CAP-voice-27

## S49.13

**Speaker-name correction.** The user can correct or rename speaker labels in a transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-06 Transcript timestamps, speakers, search and seek](../../20-features/049-dictation-transcription-and-recording/F049-06-transcript-timestamps-speakers-search-and-seek.md)

## S49.14

**Transcript search.** The user can search within a recording transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-06 Transcript timestamps, speakers, search and seek](../../20-features/049-dictation-transcription-and-recording/F049-06-transcript-timestamps-speakers-search-and-seek.md)

## S49.15

**Click transcript to seek audio.** Clicking a transcript line seeks the audio to that moment.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-06 Transcript timestamps, speakers, search and seek](../../20-features/049-dictation-transcription-and-recording/F049-06-transcript-timestamps-speakers-search-and-seek.md)

## S49.16

**Meeting recording.** The user can record a meeting and get it transcribed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-07 Meeting recording, notes and follow-ups](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Competitor trace: CAP-voice-27

## S49.17

**Recording notice and consent interface.** Before audio is captured, the user sees a notice of what is recorded and where it goes, and must agree.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F049-09 Recording notice and consent](../../20-features/049-dictation-transcription-and-recording/F049-09-recording-notice-and-consent.md)
- Competitor trace: CAP-voice-24

## S49.18

**Pause and resume recording.** The user can pause and resume a recording in progress.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-03 Stop, discard and retry a recording](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md)
- Competitor trace: CAP-voice-27

## S49.19

**Recording-duration display.** While recording, the elapsed duration is shown.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, CLI done, VS Code missing, Chrome missing
- Feature: [F049-03 Stop, discard and retry a recording](../../20-features/049-dictation-transcription-and-recording/F049-03-stop-discard-and-retry-a-recording.md)

## S49.20

**Meeting summary.** A recorded meeting produces a summary.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-07 Meeting recording, notes and follow-ups](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Competitor trace: CAP-voice-27

## S49.21

**Action-item extraction.** Action items are extracted from a recording transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-07 Meeting recording, notes and follow-ups](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Competitor trace: CAP-voice-27

## S49.22

**Decisions summary.** Decisions made are summarised from a recording transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-07 Meeting recording, notes and follow-ups](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Competitor trace: CAP-voice-27

## S49.23

**Follow-up email draft.** A follow-up email draft is generated from a recording.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-07 Meeting recording, notes and follow-ups](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)
- Competitor trace: CAP-voice-27

## S49.24

**Recording-to-Project association.** A recording and its transcript can be associated with a project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-07 Meeting recording, notes and follow-ups](../../20-features/049-dictation-transcription-and-recording/F049-07-meeting-recording-notes-and-follow-ups.md)

## S49.25

**Transcript export.** The user can export a recording transcript as a file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-08 Transcript export, audio download and recording retention](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md)

## S49.26

**Audio download.** The user can download the original recording audio.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-08 Transcript export, audio download and recording retention](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md)

## S49.27

**Retention and deletion controls.** Recordings and transcripts have retention settings and can be deleted.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F049-08 Transcript export, audio download and recording retention](../../20-features/049-dictation-transcription-and-recording/F049-08-transcript-export-audio-download-and-recording-ret.md)
- Competitor trace: CAP-voice-24

## S49.28

**Desktop dictation into another application.** A global desktop shortcut dictates into whatever application is focused, not only the product window.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing, Mobile missing, Chrome missing
- Feature: [F049-10 Desktop dictation into other apps](../../20-features/049-dictation-transcription-and-recording/F049-10-desktop-dictation-into-other-apps.md)
- Competitor trace: CAP-voice-22

## S49.29

**Spoken rewriting of selected text.** The user can select text and speak an instruction to rewrite it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F049-11 Spoken rewrite of selected text](../../20-features/049-dictation-transcription-and-recording/F049-11-spoken-rewrite-of-selected-text.md)
- Competitor trace: CAP-voice-21

## S49.30

**Undo inserted text.** Text inserted by dictation can be undone with the normal undo action.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile unverified, VS Code missing, Chrome unverified
- Feature: [F049-01 Dictate into the message box](../../20-features/049-dictation-transcription-and-recording/F049-01-dictate-into-the-message-box.md)
