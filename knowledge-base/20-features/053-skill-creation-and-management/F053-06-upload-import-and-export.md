---
id: "F053-06"
type: "feature"
title: "Upload, import and export"
aliases: ["Upload a skill", "Import a skill", "Download a skill file", "Export", "/skills import", "Install a skill (VS Code)", "Items S53.21, S53.22"]
area: "53 Skill creation and management"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S53.21", "S53.22"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "api:POST /api/skills", "api:GET /api/skills/{name}/files/{path}", "api:GET /api/skills/{name}/download", "table:user_skills", "table:user_skill_files", "F053-05", "F053-02", "SYS-security-and-privacy", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F053-06 Upload, import and export

Brings a skill in from a file: web uploads a Markdown file, a .zip or a .skill package; mobile imports a Markdown, text or zip file; the CLI and VS Code copy a skill folder from disk. Export is limited to downloading one file from a skill's detail view on web and desktop.

Area: [53. Skill creation and management](README.md). Requirement items: [S53.21](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5321), [S53.22](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5322).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Creates a personal skill from a SKILL.md file or a single-skill zip package, keeping its text files (references, templates, scripts), and lets a person save a skill file out.

**Why it exists.** Skills written for other tools or by colleagues come as files. Keeping the folder whole means references and scripts keep working (apps/web/db/neon/0318_user_skill_files.sql:1-12).

**Who uses it.** People moving skills between tools or accounts; developers installing a skill folder.

**Problems it solves**

- Retyping a skill that already exists as a file
- Losing bundled references and scripts on import
- Unsafe or malformed packages

**Use cases**

- A person uploads a skill zip on web and sees '/<name>' added.
- A mobile user imports a SKILL.md from Files.
- A developer runs /skills import ~/downloads/my-skill.
- A person downloads a bundled non-text file from a skill detail view.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings > Skills header action 'Upload a skill' (A .zip, .skill or SKILL.md file.) (packages/ui/ui/src/directory/constants.ts:408-409; packages/ui/ui/src/directory/DirectoryPanel.tsx:478-483). Also 'Import a SKILL.md' inside the skill editor fills the form from the file in the browser (apps/web/features/skills/components/SkillEditorDialog.tsx:181-198).
- Mobile: 'Import' button next to 'New skill' on the Skills screen (apps/mobile/src/features/skills/SkillsScreen.tsx:880-888).
- CLI: '/skills import <path to SKILL.md or its folder>' (apps/cli/src/tui/tui_app.rs:6169-6182; apps/cli/src/repl/slash_commands.rs:217-230).
- VS Code: Skills quick pick action 'Install a skill' (folder picker, button 'Install skill') (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:200-210, 245-247).
- Export: web and Desktop detail view, 'Download file' for a file that cannot be previewed, and 'Copy file contents' for text (packages/ui/ui/src/directory/SkillFileViewer.tsx:179-242).

**Before you start**

- Signed in and authoring on for web, desktop and mobile import (apps/web/app/api/skills/route.ts:206-222).
- Mobile: Cloud mode.
- CLI: a readable SKILL.md with frontmatter; no account.

**Screens and controls**

- Web upload dialog: intro 'Zip the skill folder with SKILL.md inside, then upload the .zip or .skill file.', buttons 'Choose file' and 'Upload', text 'No file chosen yet.' (packages/ui/ui/src/directory/constants.ts:413-418).
- Mobile picker accepts Markdown, plain text and zip (apps/mobile/src/features/skills/SkillsScreen.tsx:716-723).
- VS Code: folder dialog titled '<product>, Install a skill' (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:200-210).

**Journey**

1. Choose the file (zip, .skill or SKILL.md).
2. The app checks size, then sends it as a multipart form field named 'file' to POST /api/skills.
3. The server scans and reads it; on success the skill is created.
4. Web shows 'Skill added' with '/<name>' and a line about any files left out; mobile reloads the list.
5. Export: open a skill, select a file, press 'Download file' or 'Copy file contents'.

**What the person sees and gets**

- Success title 'Skill added' with the slash name and an optional line 'Left out N files that are not text: ...' (apps/web/features/directory/constants.ts:306, 311-330; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1743-1767).
- Failure: server message, or 'The skill could not be uploaded.'; a file over the limit shows 'This file is larger than 4 MB.' (apps/web/features/directory/constants.ts:299-302; apps/web/lib/payload-ceiling.ts:8).
- Server refusals: not a zip when named .zip or .skill, 'SKILL.md is at the top of the zip instead of inside a skill folder...', folder name does not match the skill name, more than one SKILL.md, no SKILL.md, not UTF-8, unexpected frontmatter keys, or scan blocked (apps/web/app/api/skills/skill-upload-rules.ts:1-30; apps/web/app/api/skills/route.ts:84-139).
- Mobile: failure appears as a 'Refresh failed' style banner with Retry (apps/mobile/src/features/skills/SkillsScreen.tsx:893-897).
- CLI: 'Imported the skill to <path>.' or a refusal reason (apps/cli/src/tui/tui_app.rs:6177-6179).

**Settings**

- Server payload ceiling for /api/skills is the 4 MB default (apps/web/lib/payload-ceiling.ts:8; apps/web/features/directory/constants.ts:299).
- Companion file limits: 200 files, 512 KB per file when read (apps/web/features/plugins/server/directory/constants.ts:137-138).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web multipart upload: CSRF, rate limit, authoring and workspace gates, upload content scan, zip detection by file signature, single-skill zip rule, folder equals name, UTF-8 check, allowed frontmatter keys, built-in name refusal, store text files (apps/web/app/api/skills/route.ts:84-258).
- Companion files that are empty, contain a zero byte or are not UTF-8 are left out and returned as omittedFiles; more than 200 files refuses the upload (apps/web/features/plugins/server/directory/archive.ts:300-338).
- Package scan: a blocking finding refuses; a review-level finding needs the person to acknowledge a content hash, returned as a 409 scan_review_required (apps/web/lib/services/user-skill-service.ts:122-153).
- Web client: size check, caution handling and success summary (apps/web/features/directory/hooks/useDirectoryAdapter.ts:1743-1767).
- Mobile import through the document picker and multipart upload (apps/mobile/src/features/skills/SkillsScreen.tsx:716-738; apps/mobile/src/features/skills/service.ts:208-240).
- CLI import copies a SKILL.md or a folder (max 500 files, skips links and dot files) into the user skills folder and removes it again if the copy does not load (apps/cli/src/skills.rs:1496-1588).
- VS Code install uses the same CLI import through the app server (apps/cli/src/app_server/surfaces.rs:998-1004).
- File export: GET /api/skills/{name}/files/{path}?download=1 returns the bytes as an attachment with an ETag; desktop host downloads in the window (apps/web/app/api/skills/[name]/files/[...path]/route.ts:36-47, 77-120; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1529-1537).

**Incomplete**

- Mobile has no acknowledge step for a review-level scan and does not list omitted files (apps/mobile/src/features/skills/service.ts:208-240) [inferred].
- Export is per file and the 'Download file' button shows only for files that cannot be previewed (packages/ui/ui/src/directory/SkillFileViewer.tsx:179-192).
- Over-size files are not 'left out' at upload; the 512 KB limit applies when a file is read, and staging into the sandbox is capped at 4 MB per turn (apps/web/lib/services/user-skill-service.ts:381-388; apps/web/lib/e2b/skill-staging.ts:11).

**Present but disconnected or switched off**

- GET /api/skills/{name}/download (SKILL.md of a built-in skill) has no UI caller found (apps/web/app/api/skills/[name]/download/route.ts:26-37).
- Upload and mobile import are off when AGI_USER_SKILL_AUTHORING is 0 (apps/web/lib/services/user-skill-authoring.ts:14-18).

**Not available**

- CLI import takes a folder or a Markdown file, not a zip (apps/cli/src/skills.rs:1498-1560).
- No whole-skill export (zip or SKILL.md bundle) on any app; personal skills are marked not downloadable (apps/web/lib/services/user-skill-service.ts:187-191).
- Mobile and Chrome have no export; Chrome has no import.

## 4. Required behaviour

**Established requirements**

- A user can upload or import a skill file or package and use it (S53.21). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.21)
- A user can export or download a skill (S53.22). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.22)
- A zip must hold a single skill whose folder name matches the skill name; unsafe files are refused before parsing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.21)
- Failed source fetches and revoked permissions are explained without claiming installation. (source: doc: docs/product/experience-contract.md:788)

**Acceptance criteria**

1. Uploading a valid single-skill zip on web creates the skill and lists omitted non-text files.
2. A zip with SKILL.md at the top, or in a folder whose name differs from the skill name, is refused with the matching message.
3. A zip with two SKILL.md files is refused.
4. A zip carrying a symbolic link is refused.
5. A file with an unexpected frontmatter key is refused naming the key.
6. A file over the size limit is refused with 'This file is larger than 4 MB.'
7. CLI /skills import of a folder with SKILL.md copies it and refuses an existing name.
8. Downloading a bundled binary file saves it with its original file name.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The same endpoint and rules serve web and mobile, so refusals are identical.
- [inferred] Imported files are text only, so a script stays as text and runs only through the code sandbox.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add whole-skill export as a zip that the upload accepts again.
- [proposed] Show omitted files and the scan acknowledgement step on mobile.
- [proposed] Accept zip in the CLI import.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/skills (multipart) | `apps/web/app/api/skills/route.ts` | Reads the uploaded file and creates the skill (lines 84-139, 206-258). |
| service | upload rules | `apps/web/app/api/skills/skill-upload-rules.ts` | Zip layout and folder-name messages (lines 1-30). |
| service | archive reader | `apps/web/features/plugins/server/directory/archive.ts` | readSingleSkillFromArchive and companion files (lines 300-338, 651-673). |
| service | upload scan | `apps/web/lib/security/upload-scan.ts` | refuseUnsafeUpload before parsing (line 520). |
| service | user-skill-service package scan | `apps/web/lib/services/user-skill-service.ts` | Blocking and review verdicts, file insert (lines 122-153, 240-292). |
| service | parseUploadedSkillDraft | `packages/tools/skills/src/validation.ts` | Allowed frontmatter keys and draft parsing (lines 8-30, 88-103). |
| table | user_skill_files | `apps/web/db/neon/0318_user_skill_files.sql` | Stores text files with hash and size. |
| config | payload ceiling | `apps/web/lib/payload-ceiling.ts` | 4 MB default request size (line 8). |
| config | companion limits | `apps/web/features/plugins/server/directory/constants.ts` | 200 files, 512 KB read limit (lines 137-138). |
| hook | uploadSkillFile | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | Client upload and result lines (lines 1743-1767). |
| component | upload dialog and action | `packages/ui/ui/src/directory/DirectoryPanel.tsx` | 'Upload a skill' action and dialog (lines 478-483, 1060-1072). |
| component | SkillEditorDialog import | `apps/web/features/skills/components/SkillEditorDialog.tsx` | Client-side SKILL.md import into the form (lines 181-198). |
| endpoint | GET /api/skills/{name}/files/{path} | `apps/web/app/api/skills/[name]/files/[...path]/route.ts` | Download with ?download=1 (lines 36-47, 77-120). |
| component | SkillFileBody download | `packages/ui/ui/src/directory/SkillFileViewer.tsx` | 'Download file' and 'Copy file contents' (lines 179-242). |
| hook | downloadSkillFile | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | Opens the download in a window or in the desktop host (lines 1529-1537). |
| service | mobile importSkillFile | `apps/mobile/src/features/skills/service.ts` | Multipart upload with the signed-in session (lines 208-240). |
| screen | mobile import button | `apps/mobile/src/features/skills/SkillsScreen.tsx` | Document picker and import states (lines 716-738, 880-888). |
| service | CLI import_skill | `apps/cli/src/skills.rs` | Folder or file copy with rollback (lines 1496-1588). |
| command | /skills import | `apps/cli/src/tui/tui_app.rs` | CLI command (lines 6169-6182). |
| command | VS Code installSkillFromFolder | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | Folder picker (lines 200-210). |
| service | app server install_skill | `apps/cli/src/app_server/surfaces.rs` | skills/install handler (lines 998-1004). |
| test | skill-upload.test.ts | `apps/web/app/api/skills/__tests__/skill-upload.test.ts` | Upload route tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The client checks the file against the payload limit and posts it as a multipart form (field 'file') with a CSRF token on web or the session on mobile. | device and our servers | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1743-1748; apps/mobile/src/features/skills/service.ts:208-232 |
| The server checks CSRF, the rate limit, authoring and the workspace Skills feature. | our servers | apps/web/app/api/skills/route.ts:206-222 |
| The bytes are inspected by the upload scanner, then a zip is detected by its first four bytes; a zip is opened and must hold exactly one SKILL.md directly inside one folder named like the skill. | our servers | apps/web/app/api/skills/route.ts:95-139; apps/web/features/plugins/server/directory/archive.ts:651-673 |
| Text companion files are read; non-text ones are listed as omitted. Frontmatter is parsed and only allowed keys pass. | our servers | apps/web/features/plugins/server/directory/archive.ts:300-338; packages/tools/skills/src/validation.ts:88-103 |
| The package is scanned; blocked content is refused, review-level content needs an acknowledgement hash sent back by the client. | our servers | apps/web/lib/services/user-skill-service.ts:122-153 |
| The skill row and its file rows are inserted in one transaction; a duplicate name returns 409. | our servers | apps/web/lib/services/user-skill-service.ts:261-292 |
| The client reloads the list and shows the result. | device | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1757-1766 |
| CLI import copies files on disk and validates the copy. | device | apps/cli/src/skills.rs:1505-1560 |
| Export: the client opens the download URL; the server streams the file bytes with attachment headers. | device and our servers | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1529-1537; apps/web/app/api/skills/[name]/files/[...path]/route.ts:36-47 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Uploaded skill text and files | public.user_skills and public.user_skill_files (apps/web/lib/services/user-skill-service.ts:246-292) | Per account; CLI copies on its next sync | Deleted with the skill; the uploaded archive itself is not kept (only parsed content is stored) [inferred] |
| Imported CLI skill | CLI user skills folder (apps/cli/src/skills.rs:1498-1503) | Not synced | Removed with /skills remove |
| Downloaded file | The person's device download folder | No | Kept by the person |

**Models and providers.** No model or provider takes part in upload, import or download.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in on web, desktop, mobile. CLI and VS Code import need none. |
| Permissions | Workspace Skills feature must be allowed for upload (apps/web/app/api/skills/route.ts:215-222). Download of files reads only skills visible to the account (apps/web/app/api/skills/[name]/files/[...path]/route.ts:64-76). |
| Subscription | No plan check found in the upload or download routes. |
| Limits and metering | 4 MB request default; 200 companion files; 512 KB per file read; 60 writes per minute on the chat-conversation bucket; downloads and reads 300 per minute on the catalogue bucket. CLI import: 500 files. |
| Feature flags | AGI_USER_SKILL_AUTHORING; FEATURES.skills on mobile. |
| Model compatibility | Not applicable; none found in the code. |
| Provider restrictions | None found in the code. |
| Local mode | Mobile Local mode: gated, no import. CLI import is fully local and works with any route. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| File too large | Client message 'This file is larger than 4 MB.'; server answers 413. | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1744-1747; apps/web/app/api/skills/__tests__/skill-upload.test.ts:204 |
| Not UTF-8 or no frontmatter | Refused with a validation message. | apps/web/app/api/skills/route.ts:120-129; apps/web/app/api/skills/__tests__/skill-upload.test.ts:133-147 |
| Zip layout wrong | Specific message for root, nested, folder mismatch, none or many SKILL.md files. | apps/web/app/api/skills/skill-upload-rules.ts:1-30; apps/web/features/plugins/server/directory/archive.ts:658-659 |
| Review-level scan | 409 scan_review_required; web can re-send with acknowledgement. | apps/web/lib/services/user-skill-service.ts:146-153; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1757-1760 |
| Non-text files in a package | Left out and named in omittedFiles. | apps/web/app/api/skills/route.ts:253-256 |
| Name already used | 409 built-in or own duplicate. | apps/web/app/api/skills/route.ts:237-240 |
| Binary file preview | 415 and a Download file button. | apps/web/app/api/skills/[name]/files/[...path]/route.ts:96-103 |
| CLI existing target or failed copy | Refused with 'already exists; remove it first to replace it.'; a failed copy is removed. | apps/cli/src/skills.rs:1527-1560 |
| Cancel, offline, timeout | Mobile picker cancel does nothing; other cases not handled beyond the error banner. | apps/mobile/src/features/skills/SkillsScreen.tsx:716-726 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/skills/__tests__/skill-upload.test.ts`: Markdown and zip upload, CSRF, missing file, not UTF-8, no frontmatter, name rules, zip with none, many or a symbolic link, built-in name, size ceiling.
- `apps/web/app/api/skills/[name]/files/__tests__/skill-files.test.ts`: File listing, preview, binary refusal, download, traversal blocking.
- `apps/web/app/api/skills/[name]/files/[...path]/__tests__/route.test.ts`: File route.
- `apps/web/app/api/skills/[name]/download/__tests__/route.test.ts`: SKILL.md download.
- `apps/web/features/skills/components/SkillEditorDialog.test.tsx`: Import of SKILL.md into the editor and refusal of unexpected keys.
- `packages/ui/ui/src/directory/__tests__/SkillFileViewer.test.tsx`: File viewer.
- `apps/web/lib/services/user-skill-service.test.ts`: Service rules.
- `apps/mobile/src/features/skills/__tests__/SkillDetail.test.tsx`: Mobile import as multipart and server refusal.
- `apps/cli/src/skills.rs`: In-file tests for folder import and link refusal.
- `packages/tools/skills/src/__tests__/validation.test.ts`: Frontmatter and draft validation.

**Test scenarios**

- **Valid zip**
  1. Make a folder 'my-skill' with SKILL.md (name: my-skill) and a references/notes.md.
  2. Zip the folder.
  3. Upload on web.
  - Expected: 'Skill added' with '/my-skill'; the file tree shows references/notes.md.
- **Wrong folder name**
  1. Zip a folder 'other' holding SKILL.md with name: my-skill and upload.
  - Expected: Refused with 'The folder "other" does not match the skill name "my-skill"...'.
- **Binary file in package**
  1. Add a PNG to the skill folder, zip and upload.
  - Expected: Skill added and the line 'Left out a file that is not text: <path>'.
- **Mobile import**
  1. Cloud mode, tap Import, choose a SKILL.md.
  - Expected: The list reloads with the new skill, or the server message shows in the banner.
- **CLI import**
  1. Run /skills import ./my-skill twice.
  - Expected: First imports to the user skills folder; second refuses because it already exists.
- **Download**
  1. Open a bundled skill with a non-text file and press Download file.
  - Expected: The file saves with its name; response carries an ETag.

**Where to look when it fails**

- Server upload scan warning '[upload-scan] refused an upload that failed content inspection' (apps/web/lib/security/upload-scan.ts:527-535).
- Error body message and code scan_review_required.
- HTTP 413 (too large), 415 (not text), 409 (conflict).
- CLI error text from import_skill.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/053-skill-creation-and-management.md](../../70-qa/test-plans/web/053-skill-creation-and-management.md)
- Desktop: [70-qa/test-plans/desktop/053-skill-creation-and-management.md](../../70-qa/test-plans/desktop/053-skill-creation-and-management.md)
- Mobile: [70-qa/test-plans/mobile/053-skill-creation-and-management.md](../../70-qa/test-plans/mobile/053-skill-creation-and-management.md)
- CLI: [70-qa/test-plans/cli/053-skill-creation-and-management.md](../../70-qa/test-plans/cli/053-skill-creation-and-management.md)
- VS Code: [70-qa/test-plans/vscode/053-skill-creation-and-management.md](../../70-qa/test-plans/vscode/053-skill-creation-and-management.md)

## 10. Gaps and dependencies

- **No whole-skill export on any app; only single-file download and a copy button.** Affects: All apps. Evidence: packages/ui/ui/src/directory/SkillFileViewer.tsx:179-242; apps/web/lib/services/user-skill-service.ts:187-191. Work needed: Add a zip export that the upload accepts.
- **Brief says scripts and over-size files are left out at upload; code leaves out only non-text files, and size limits apply at read and staging time.** Affects: Documentation and testers. Evidence: apps/web/features/plugins/server/directory/archive.ts:300-338; apps/web/lib/services/user-skill-service.ts:381-388. Work needed: Correct the brief wording.
- **Brief says mobile import is missing, but mobile has Import with a document picker.** Affects: Documentation. Evidence: apps/mobile/src/features/skills/SkillsScreen.tsx:716-738. Work needed: Correct the brief.
- **Mobile lacks the scan-acknowledge step and the omitted-files notice.** Affects: Mobile users importing packages. Evidence: apps/mobile/src/features/skills/service.ts:208-240. Work needed: Reuse the web handling of scan_review_required and omittedFiles.
- **CLI import takes no zip; VS Code import is a folder only; the brief marks VS Code import missing though 'Install a skill' exists.** Affects: CLI, VS Code. Evidence: apps/cli/src/skills.rs:1498-1560; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:200-210. Work needed: Accept a zip; correct the brief.
- **GET /api/skills/{name}/download has no caller.** Affects: Web. Evidence: apps/web/app/api/skills/[name]/download/route.ts:26-37. Work needed: Wire to a UI control or remove.
- **Personal-skill 'Download file' for text files is not offered (only for non-previewable files).** Affects: Web, Desktop. Evidence: packages/ui/ui/src/directory/SkillFileViewer.tsx:179-192. Work needed: Offer download for every file.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- api:POST /api/skills
- api:GET /api/skills/{name}/files/{path}
- api:GET /api/skills/{name}/download
- table:user_skills
- table:user_skill_files
- F053-05
- F053-02
- SYS-security-and-privacy
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts

## Unknown

- Exact place where a zip with a symbolic link is refused (a test covers it, the reader code was not traced).
- Whether the mobile app sends a CSRF token or relies on the session header for the multipart upload.
- Whether Desktop's hosted window offers the same upload dialog (assumed from shared web code).
- Retention of audit events for uploads.
