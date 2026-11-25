---
id: "REQ-AREA-095"
type: "requirements"
title: "Requirement items: File and Library components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 95. File and Library components

28 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S95.01

**Upload-session service.** Uploads run as a two-phase session: presign a private object, then complete it server-side with checks before a record exists.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-01 Upload a file (two steps, resumable for large files)](../../20-features/095-file-and-library-components/F095-01-upload-a-file-two-steps-resumable-for-large-files.md)

## S95.02

**Multipart/resumable-upload service.** Large uploads can be sent in resumable parts and resumed after interruption.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-01 Upload a file (two steps, resumable for large files)](../../20-features/095-file-and-library-components/F095-01-upload-a-file-two-steps-resumable-for-large-files.md)

## S95.03

**File metadata store.** File metadata (owner, type, size, source, conversation, lifecycle) is stored per file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-05 Library catalog and storage use](../../20-features/095-file-and-library-components/F095-05-library-catalog-and-storage-use.md)

## S95.04

**Blob/object storage.** File bytes live in object storage with private and public buckets.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-05 Library catalog and storage use](../../20-features/095-file-and-library-components/F095-05-library-catalog-and-storage-use.md)

## S95.05

**MIME/content inspection.** Uploaded bytes are inspected for real type, active content and executables, not only the declared MIME.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-02 Safety checks on uploads (content inspection and malware scan)](../../20-features/095-file-and-library-components/F095-02-safety-checks-on-uploads-content-inspection-and-ma.md)

## S95.06

**Malware/quarantine pipeline.** Uploads are malware-scanned and unsafe files are quarantined or rejected.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-02 Safety checks on uploads (content inspection and malware scan)](../../20-features/095-file-and-library-components/F095-02-safety-checks-on-uploads-content-inspection-and-ma.md)

## S95.07

**Document parser workers.** Document parsers extract text from PDFs and office files for use by the model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-03 Reading files for the model (text, scanned pages, pictures)](../../20-features/095-file-and-library-components/F095-03-reading-files-for-the-model-text-scanned-pages-pic.md)

## S95.08

**OCR worker.** Scanned (image-only) pages are OCR-ed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-03 Reading files for the model (text, scanned pages, pictures)](../../20-features/095-file-and-library-components/F095-03-reading-files-for-the-model-text-scanned-pages-pic.md)
- Competitor trace: CAP-files-and-attachments-07

## S95.09

**Image preprocessing.** Images are preprocessed (resize, normalise, strip metadata) before storage or model use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-03 Reading files for the model (text, scanned pages, pictures)](../../20-features/095-file-and-library-components/F095-03-reading-files-for-the-model-text-scanned-pages-pic.md)

## S95.10

**Audio transcription worker.** Audio can be transcribed server-side.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-04 Audio and video](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Competitor trace: CAP-files-and-attachments-09

## S95.11

**Video frame/transcript processor.** Video files get frames and a transcript extracted.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-04 Audio and video](../../20-features/095-file-and-library-components/F095-04-audio-and-video.md)
- Competitor trace: CAP-files-and-attachments-10

## S95.12

**Preview generator.** Previews are generated for non-image files.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-03 Reading files for the model (text, scanned pages, pictures)](../../20-features/095-file-and-library-components/F095-03-reading-files-for-the-model-text-scanned-pages-pic.md)

## S95.13

**Thumbnail generator.** Thumbnails are generated for files.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-03 Reading files for the model (text, scanned pages, pictures)](../../20-features/095-file-and-library-components/F095-03-reading-files-for-the-model-text-scanned-pages-pic.md)

## S95.14

**Extraction-result store.** Extracted text and anchors are stored for reuse.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-03 Reading files for the model (text, scanned pages, pictures)](../../20-features/095-file-and-library-components/F095-03-reading-files-for-the-model-text-scanned-pages-pic.md)

## S95.15

**File-version store.** File versions are kept (supersede chain, published versions, lineage).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-07 Versions, sharing and access](../../20-features/095-file-and-library-components/F095-07-versions-sharing-and-access.md)

## S95.16

**Library catalog.** A Library catalog lists a user's files with filters, sort and search.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-05 Library catalog and storage use](../../20-features/095-file-and-library-components/F095-05-library-catalog-and-storage-use.md)
- Competitor trace: CAP-files-and-attachments-18

## S95.17

**Folder hierarchy.** Files can be organised in a folder hierarchy.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-06 Folders and connected sources](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Competitor trace: CAP-files-and-attachments-19

## S95.18

**External-resource reference store.** External resources (Drive/URL files) are stored as references distinct from owned bytes.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-06 Folders and connected sources](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Competitor trace: CAP-files-and-attachments-22

## S95.19

**Connected-file synchronization.** Connected-storage files stay in sync with their source.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-06 Folders and connected sources](../../20-features/095-file-and-library-components/F095-06-folders-and-connected-sources.md)
- Competitor trace: CAP-files-and-attachments-22

## S95.20

**Download authorization.** Downloads are authorised per request against owner/workspace and served with safe headers.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-09 Download and export](../../20-features/095-file-and-library-components/F095-09-download-and-export.md)

## S95.21

**Export packaging.** Exports are packaged (archive of files and metadata).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-09 Download and export](../../20-features/095-file-and-library-components/F095-09-download-and-export.md)

## S95.22

**File conversion.** Files can be converted between formats server-side.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-09 Download and export](../../20-features/095-file-and-library-components/F095-09-download-and-export.md)

## S95.23

**Storage-quota accounting.** Storage use is accounted against the plan allowance.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-05 Library catalog and storage use](../../20-features/095-file-and-library-components/F095-05-library-catalog-and-storage-use.md)
- Competitor trace: CAP-files-and-attachments-20

## S95.24

**Trash/restore service.** Deleted files move to trash and can be restored within a window.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-08 Delete, trash and restore](../../20-features/095-file-and-library-components/F095-08-delete-trash-and-restore.md)
- Competitor trace: CAP-files-and-attachments-21

## S95.25

**Retention cleanup.** Expired trash and retention windows are purged, including stored objects.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-08 Delete, trash and restore](../../20-features/095-file-and-library-components/F095-08-delete-trash-and-restore.md)
- Competitor trace: CAP-files-and-attachments-21

## S95.26

**Derivative-resource cleanup.** Derived resources (indexes, jobs, lineage, thumbnails) are cleaned up with their source.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-08 Delete, trash and restore](../../20-features/095-file-and-library-components/F095-08-delete-trash-and-restore.md)
- Competitor trace: CAP-files-and-attachments-21

## S95.27

**Resource-sharing service.** Files and file-bearing resources can be shared (org sharing, publish links) under access control.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-07 Versions, sharing and access](../../20-features/095-file-and-library-components/F095-07-versions-sharing-and-access.md)

## S95.28

**Source-deletion propagation.** Deleting a source file withdraws everything derived from it (index chunks, context).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F095-08 Delete, trash and restore](../../20-features/095-file-and-library-components/F095-08-delete-trash-and-restore.md)
- Competitor trace: CAP-files-and-attachments-21
