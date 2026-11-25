# Area 95. File and Library components

28 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S95.01 Upload-session service.
- Should: Uploads run as a two-phase session: presign a private object, then complete it server-side with checks before a record exists.
- Status: platform done
- Code: apps/web/app/api/uploads/presign/route.ts:74; apps/web/app/api/uploads/chat-attachment/complete/route.ts:246; apps/web/app/api/uploads/chat-attachment/complete/route.ts:318

## S95.02 Multipart/resumable-upload service.
- Should: Large uploads can be sent in resumable parts and resumed after interruption.
- Status: platform done
- Code: packages/contracts/cloud-contracts/src/resumable-uploads.ts:27; apps/web/app/api/files/uploads/route.ts:59; apps/web/app/api/files/uploads/[uploadId]/parts/route.ts:70; apps/web/app/api/files/uploads/[uploadId]/route.ts:107; apps/web/app/api/files/uploads/[uploadId]/route.ts:267; packages/contracts/cloud-contracts/src/managed-cloud-resumable-upload-client.ts:341; packages/contracts/cloud-contracts/src/managed-cloud-resumable-upload-client.ts:358; packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts:196

## S95.03 File metadata store.
- Should: File metadata (owner, type, size, source, conversation, lifecycle) is stored per file.
- Status: platform done
- Code: apps/web/lib/server/media-assets.ts:181; apps/web/app/api/projects/[id]/knowledge-files/route.ts:502

## S95.04 Blob/object storage.
- Should: File bytes live in object storage with private and public buckets.
- Status: platform done
- Code: apps/web/lib/server/object-storage-runtime.ts:24; apps/web/app/api/files/[id]/route.ts:75

## S95.05 MIME/content inspection.
- Should: Uploaded bytes are inspected for real type, active content and executables, not only the declared MIME.
- Status: platform done
- Code: apps/web/lib/security/upload-scan.ts:200; apps/web/app/api/uploads/chat-attachment/complete/route.ts:246

## S95.06 Malware/quarantine pipeline.
- Should: Uploads are malware-scanned and unsafe files are quarantined or rejected.
- Status: platform partial
- Code: services/upload-scanner/src/server.ts:183; services/upload-scanner/src/server.ts:106; services/upload-scanner/src/server.ts:124; services/upload-scanner/src/server.ts:99; services/upload-scanner/src/server.ts:114; services/upload-scanner/src/server.ts:130; services/upload-scanner/src/server.ts:170; services/upload-scanner/src/clamd.ts:107
- Unfinished: platform: done once the scanner is deployed and the two Vercel env vars are set; rejected files are deleted, not quarantined, as before

## S95.07 Document parser workers.
- Should: Document parsers extract text from PDFs and office files for use by the model.
- Status: platform done
- Code: apps/web/lib/server/project-knowledge-extraction.ts:313; apps/web/app/api/projects/[id]/knowledge-files/route.ts:430

## S95.08 OCR worker.
- Should: Scanned (image-only) pages are OCR-ed.
- Status: platform done
- Code: apps/web/lib/server/project-knowledge-files.ts:302; apps/web/lib/server/file-storage.ts:64; apps/web/lib/services/entitlement-resolution.ts:113; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:511

## S95.09 Image preprocessing.
- Should: Images are preprocessed (resize, normalise, strip metadata) before storage or model use.
- Status: platform missing

## S95.10 Audio transcription worker.
- Should: Audio can be transcribed server-side.
- Status: platform done
- Code: apps/web/app/api/llm/v1/audio/transcriptions/route.ts:253; apps/web/app/api/voice/transcribe/route.ts:29

## S95.11 Video frame/transcript processor.
- Should: Video files get frames and a transcript extracted.
- Status: platform missing

## S95.12 Preview generator.
- Should: Previews are generated for non-image files.
- Status: not applicable anywhere

## S95.13 Thumbnail generator.
- Should: Thumbnails are generated for files.
- Status: platform missing

## S95.14 Extraction-result store.
- Should: Extracted text and anchors are stored for reuse.
- Status: platform done
- Code: apps/web/app/api/projects/[id]/knowledge-files/route.ts:502; apps/web/lib/server/project-knowledge-extraction.ts:313

## S95.15 File-version store.
- Should: File versions are kept (supersede chain, published versions, lineage).
- Status: platform done
- Code: apps/web/app/api/projects/[id]/knowledge-files/route.ts:540; apps/web/lib/server/generated-file-persist.ts:66

## S95.16 Library catalog.
- Should: A Library catalog lists a user's files with filters, sort and search.
- Status: platform done
- Code: apps/web/lib/server/media-assets.ts:454; apps/web/app/api/library/route.ts:67

## S95.17 Folder hierarchy.
- Should: Files can be organised in a folder hierarchy.
- Status: platform missing

## S95.18 External-resource reference store.
- Should: External resources (Drive/URL files) are stored as references distinct from owned bytes.
- Status: platform missing

## S95.19 Connected-file synchronization.
- Should: Connected-storage files stay in sync with their source.
- Status: platform missing

## S95.20 Download authorization.
- Should: Downloads are authorised per request against owner/workspace and served with safe headers.
- Status: platform done
- Code: apps/web/app/api/files/[id]/route.ts:75; apps/web/app/api/files/[id]/route.ts:160

## S95.21 Export packaging.
- Should: Exports are packaged (archive of files and metadata).
- Status: platform done
- Code: apps/web/app/api/user/export/route.ts:2754; apps/web/lib/server/data-export-archive.ts:516; apps/web/lib/server/stored-zip-writer.ts:53; apps/web/lib/server/data-export-archive.ts:639; apps/web/lib/server/data-export-archive.ts:704; apps/web/app/api/user/export/archives/[exportId]/route.ts:66; apps/web/lib/server/account-erasure.ts:929; packages/platform/object-storage/src/adapters/s3.ts:271

## S95.22 File conversion.
- Should: Files can be converted between formats server-side.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:437; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3985; apps/web/scripts/build-e2b-office-template.mjs:5

## S95.23 Storage-quota accounting.
- Should: Storage use is accounted against the plan allowance.
- Status: platform done
- Code: apps/web/lib/server/file-storage.ts:38; apps/web/lib/server/file-storage.ts:64; apps/web/lib/server/file-storage.ts:69; apps/web/lib/server/project-knowledge-files.ts:231; apps/web/lib/server/chat-attachment-completion.ts:262; apps/web/app/api/projects/[id]/knowledge-files/route.ts:101; apps/web/app/api/library/route.ts:130; packages/ui/unified-chat/src/components/library/LibraryView.tsx:866

## S95.24 Trash/restore service.
- Should: Deleted files move to trash and can be restored within a window.
- Status: platform done
- Code: apps/web/app/api/media/route.ts:45; apps/web/lib/server/media-assets.ts:492

## S95.25 Retention cleanup.
- Should: Expired trash and retention windows are purged, including stored objects.
- Status: platform done
- Code: apps/web/app/api/cron/purge-deleted-media/route.ts:80; vercel.json:49

## S95.26 Derivative-resource cleanup.
- Should: Derived resources (indexes, jobs, lineage, thumbnails) are cleaned up with their source.
- Status: platform done
- Code: apps/web/lib/resources/deletion-policies.ts:247; apps/web/lib/resources/deletion-policies.ts:329; apps/web/lib/resources/purge-soft-deleted.ts:181; apps/web/app/api/cron/purge-deleted-media/route.ts:127; apps/web/lib/server/media-assets.ts:833; apps/web/lib/server/temporary-files/purge.ts:90; apps/web/lib/services/domain-retention-service.ts:387

## S95.27 Resource-sharing service.
- Should: Files and file-bearing resources can be shared (org sharing, publish links) under access control.
- Status: platform done
- Code: apps/web/lib/services/org-sharing-service.ts:267; apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:71

## S95.28 Source-deletion propagation.
- Should: Deleting a source file withdraws everything derived from it (index chunks, context).
- Status: platform done
- Code: apps/web/app/api/projects/sync/route.ts:212; apps/web/lib/server/project-deletion.ts:69; apps/web/lib/server/project-deletion.ts:40; apps/web/db/neon/0202_retrieval_index.sql:360
