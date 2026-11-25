---
id: "REQ-AREA-014"
type: "requirements"
title: "Requirement items: Attachment intake components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 14. Attachment intake components

36 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S14.01

**Device file picker.** The composer opens the device file chooser and the chosen file is attached to the next message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F014-01 Pick files from the device](../../20-features/014-attachment-intake-components/F014-01-pick-files-from-the-device.md)
- Competitor trace: CAP-files-and-attachments-01

## S14.02

**Drag-and-drop intake.** Dropping files onto the chat attaches them to the next message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, VS Code done, Chrome done
- Feature: [F014-02 Drag, drop and paste into the composer](../../20-features/014-attachment-intake-components/F014-02-drag-drop-and-paste-into-the-composer.md)
- Competitor trace: CAP-files-and-attachments-02

## S14.03

**Paste-image intake.** Pasting an image from the clipboard into the composer attaches it as an image.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome done
- Feature: [F014-02 Drag, drop and paste into the composer](../../20-features/014-attachment-intake-components/F014-02-drag-drop-and-paste-into-the-composer.md)
- Competitor trace: CAP-files-and-attachments-02

## S14.04

**Camera capture.** The composer offers a camera control that takes a photo and attaches it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, Chrome missing
- Feature: [F014-03 Take a photo with the camera](../../20-features/014-attachment-intake-components/F014-03-take-a-photo-with-the-camera.md)
- Competitor trace: CAP-files-and-attachments-11

## S14.05

**Photo-library selection.** The user can pick one or more photos from the photo library and attach them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome done
- Feature: [F014-04 Choose photos from the photo library](../../20-features/014-attachment-intake-components/F014-04-choose-photos-from-the-photo-library.md)
- Competitor trace: CAP-files-and-attachments-11

## S14.06

**Screenshot capture.** A composer control captures the screen and attaches the screenshot to the next message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, VS Code missing, Chrome done
- Feature: [F014-05 Screenshot and window capture](../../20-features/014-attachment-intake-components/F014-05-screenshot-and-window-capture.md)
- Competitor trace: CAP-files-and-attachments-12

## S14.07

**Window capture.** The user can pick a single application window and attach a capture of it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, VS Code missing
- Feature: [F014-05 Screenshot and window capture](../../20-features/014-attachment-intake-components/F014-05-screenshot-and-window-capture.md)
- Competitor trace: CAP-files-and-attachments-12

## S14.08

**URL attachment.** The user can attach a web page by its URL so its content is used as context for the message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done, VS Code done, Chrome done
- Feature: [F014-06 Attach a web page by its link](../../20-features/014-attachment-intake-components/F014-06-attach-a-web-page-by-its-link.md)
- Competitor trace: CAP-files-and-attachments-26

## S14.09

**Cloud-file picker.** The user can browse a cloud drive (Google Drive, OneDrive, Dropbox) from the composer and attach a file from it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, VS Code missing, Chrome missing
- Feature: [F014-08 Cloud drives, audio and video](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md)
- Competitor trace: CAP-files-and-attachments-22

## S14.10

**Library-file picker.** The user can pick a file already in their product Library and attach it to a message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F014-07 Attach from the Library, a repository or a folder](../../20-features/014-attachment-intake-components/F014-07-attach-from-the-library-a-repository-or-a-folder.md)

## S14.11

**Repository attachment.** The user can attach a code repository (e.g. a GitHub repo) as the context for a task.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F014-07 Attach from the Library, a repository or a folder](../../20-features/014-attachment-intake-components/F014-07-attach-from-the-library-a-repository-or-a-folder.md)
- Competitor trace: CAP-files-and-attachments-26

## S14.12

**Folder attachment.** The user can attach a whole folder so the assistant can use the files inside it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done, VS Code done
- Feature: [F014-07 Attach from the Library, a repository or a folder](../../20-features/014-attachment-intake-components/F014-07-attach-from-the-library-a-repository-or-a-folder.md)
- Competitor trace: CAP-files-and-attachments-26

## S14.13

**Audio attachment.** The user can attach an audio file (e.g. MP3, M4A, WAV) and the model receives it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F014-08 Cloud drives, audio and video](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md)
- Competitor trace: CAP-files-and-attachments-09

## S14.14

**Video attachment.** The user can attach a video file and the model receives it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F014-08 Cloud drives, audio and video](../../20-features/014-attachment-intake-components/F014-08-cloud-drives-audio-and-video.md)
- Competitor trace: CAP-files-and-attachments-10

## S14.15

**Multiple-file selection.** One pick action can select several files, and all of them are attached.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F014-01 Pick files from the device](../../20-features/014-attachment-intake-components/F014-01-pick-files-from-the-device.md)
- Competitor trace: CAP-files-and-attachments-01

## S14.16

**Attachment thumbnail.** An attached image shows a small visual thumbnail in the composer before sending.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F014-09 See, preview, remove and replace attachments](../../20-features/014-attachment-intake-components/F014-09-see-preview-remove-and-replace-attachments.md)

## S14.17

**File-type icon.** Each non-image attachment shows an icon matching its file type (PDF, spreadsheet, code, other).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done
- Seen in a real run: Web PASS
- Feature: [F014-09 See, preview, remove and replace attachments](../../20-features/014-attachment-intake-components/F014-09-see-preview-remove-and-replace-attachments.md)

## S14.18

**Filename and file-size metadata.** Each attachment shows its file name and size before sending.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F014-09 See, preview, remove and replace attachments](../../20-features/014-attachment-intake-components/F014-09-see-preview-remove-and-replace-attachments.md)

## S14.19

**Upload progress.** While a file uploads, its chip shows that the upload is in progress.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Seen in a real run: Web PASS
- Feature: [F014-10 Upload progress, retry and cancel](../../20-features/014-attachment-intake-components/F014-10-upload-progress-retry-and-cancel.md)
- Competitor trace: CAP-files-and-attachments-14

## S14.20

**Parsing progress.** After upload, the attachment shows that its content is being read or extracted, until it is ready.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing
- Feature: [F014-10 Upload progress, retry and cancel](../../20-features/014-attachment-intake-components/F014-10-upload-progress-retry-and-cancel.md)
- Competitor trace: CAP-files-and-attachments-14

## S14.21

**Indexing progress.** A file added to searchable knowledge shows indexing progress and whether indexing finished or failed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing
- Feature: [F014-12 Retention and model fit](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md)
- Competitor trace: CAP-files-and-attachments-17

## S14.22

**Ready-to-use state.** The composer makes clear when an attachment is ready and the message can be sent with it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F014-09 See, preview, remove and replace attachments](../../20-features/014-attachment-intake-components/F014-09-see-preview-remove-and-replace-attachments.md)

## S14.23

**Partial-extraction notice.** When only part of a file could be read or it was cut to a size limit, the user is told.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F014-11 Limits, duplicates and refusals](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Competitor trace: CAP-files-and-attachments-04, CAP-files-and-attachments-16

## S14.24

**Unsupported-file notice.** Adding a file type the chat cannot read shows a notice naming the file and why.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F014-11 Limits, duplicates and refusals](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Competitor trace: CAP-files-and-attachments-03

## S14.25

**Password-protected-file notice.** A password-protected file produces a notice that says it is locked and how to fix it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F014-11 Limits, duplicates and refusals](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Competitor trace: CAP-files-and-attachments-07

## S14.26

**Upload retry.** A failed upload offers Retry on that file, which uploads it again.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F014-10 Upload progress, retry and cancel](../../20-features/014-attachment-intake-components/F014-10-upload-progress-retry-and-cancel.md)
- Competitor trace: CAP-files-and-attachments-14

## S14.27

**Upload cancellation.** While a file is uploading the user can cancel that upload.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F014-10 Upload progress, retry and cancel](../../20-features/014-attachment-intake-components/F014-10-upload-progress-retry-and-cancel.md)
- Competitor trace: CAP-files-and-attachments-14

## S14.28

**Attachment removal.** Each attachment can be removed before sending, and a removed file is not sent.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F014-09 See, preview, remove and replace attachments](../../20-features/014-attachment-intake-components/F014-09-see-preview-remove-and-replace-attachments.md)
- Competitor trace: CAP-files-and-attachments-14

## S14.29

**Attachment replacement.** An attached file can be replaced with another in place, keeping its position, without removing and re-adding.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F014-09 See, preview, remove and replace attachments](../../20-features/014-attachment-intake-components/F014-09-see-preview-remove-and-replace-attachments.md)

## S14.30

**Attachment preview.** Before sending, the user can open an attachment to view it at full size or read its content.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code missing, Chrome missing
- Feature: [F014-09 See, preview, remove and replace attachments](../../20-features/014-attachment-intake-components/F014-09-see-preview-remove-and-replace-attachments.md)

## S14.31

**Duplicate-file treatment.** Adding the same file twice is detected and handled visibly (skipped, merged or flagged) rather than sent twice silently.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F014-11 Limits, duplicates and refusals](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Competitor trace: CAP-files-and-attachments-14

## S14.32

**Per-file error display.** When a file fails, the error is shown against that file (name and reason), not as one generic message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F014-11 Limits, duplicates and refusals](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Competitor trace: CAP-files-and-attachments-14

## S14.33

**Batch-upload summary.** After adding several files at once the user sees one summary of what was attached and what was refused.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F014-11 Limits, duplicates and refusals](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md)
- Competitor trace: CAP-files-and-attachments-14

## S14.34

**File-retention explanation.** The composer explains whether and how long attached files are kept.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F014-12 Retention and model fit](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md)
- Competitor trace: CAP-files-and-attachments-29, CAP-files-and-attachments-30

## S14.35

**Selected-model compatibility warning.** If the selected model cannot read an attached file type, the composer warns before sending and offers a fix.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F014-12 Retention and model fit](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md)
- Competitor trace: CAP-files-and-attachments-06, CAP-files-and-attachments-15

## S14.36

**Alternative processing-path explanation.** When a file cannot go the normal way, the user is told the alternative (switch model or mode, convert, or what is sent instead).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F014-12 Retention and model fit](../../20-features/014-attachment-intake-components/F014-12-retention-and-model-fit.md)
- Competitor trace: CAP-files-and-attachments-06, CAP-files-and-attachments-15
