---
id: "F095-02"
type: "feature"
title: "Safety checks on uploads (content inspection and malware scan)"
aliases: ["Upload scan", "Content inspection", "Malware scan", "Upload scanner", "services/upload-scanner", "UPLOAD_SCAN_WEBHOOK_URL", "Safety check", "source scan (v2)"]
area: "95 File and Library components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S95.05", "S95.06"]
depends_on: ["SYS-security-and-privacy", "SYS-files-artifacts-and-storage", "SYS-execution-boundaries", "F095-01", "mode:cloud", "file:services/upload-scanner/src/server.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F095-02 Safety checks on uploads (content inspection and malware scan)

Checks the real bytes of an upload: executable signatures, type confusion, active content in PDFs and SVGs, credential material, a known-bad hash list and the workspace data policy. Then asks a self-hosted virus scanner. Any failure refuses the file and deletes its bytes. Required in production unless an operator opts out.

Area: [95. File and Library components](README.md). Requirement items: [S95.05](../../10-requirements/capabilities/095-file-and-library-components.md#s9505), [S95.06](../../10-requirements/capabilities/095-file-and-library-components.md#s9506).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Runs structural inspection, credential scanning, an external malware scan and the workspace data policy on uploaded bytes before a record is created (apps/web/lib/security/upload-scan.ts:601-611; apps/web/lib/server/chat-attachment-completion.ts:348-440).

**Why it exists.** Stored files are later served, shared and read by models. A file full of secrets or an executable behind a picture name would otherwise be kept and distributed (apps/web/lib/security/upload-scan.ts:190-200 comment).

**Who uses it.** Every uploader indirectly; security owners and operators who deploy the scanner (doc: docs/security/upload-scanning.md).

**Problems it solves**

- Mislabelled executables and active content are refused.
- Credentials are not stored and fed to models.
- A scanner outage fails closed instead of admitting unscanned bytes (services/upload-scanner/README.md; apps/web/lib/security/upload-scan.ts:418-431).

**Use cases**

- Someone uploads a .png that is really a ZIP: refused.
- A text file containing a private key: refused.
- The virus engine is down: uploads fail with a retry message.
- A password-protected archive: refused with a message to remove the password.

## 2. User experience

**Where to find it**

- Nothing to open. Refusals appear wherever a file is attached: web, desktop, mobile, CLI and Chrome show the error text from the server [inferred from the shared routes].

**Before you start**

- An upload in progress (F095-01).

**Screens and controls**

- No controls. The person sees an error message.

**Journey**

1. 1. The person uploads a file.
2. 2. On complete, the server scans.
3. 3. If refused, the bytes are deleted and the person sees a fixed message.
4. 4. The person removes the problem and uploads again.

**What the person sees and gets**

- 'This file could not be attached because its contents failed a safety check.' (apps/web/lib/server/chat-attachment-completion.ts:57-58 region, SAFETY_CHECK_REFUSAL_MESSAGE).
- Password protected: 'This file is password protected, so its contents could not be checked. Remove the password and upload it again.' (apps/web/lib/security/upload-scan.ts:482).
- Scanner trouble: "We couldn't check this file for safety. Try again later." (apps/web/lib/security/upload-scan.ts:487).
- Too complex: 'This file is too complex for us to check for safety...' (apps/web/lib/security/upload-scan.ts:490).

**Settings**

- Operator settings by name: UPLOAD_SCAN_WEBHOOK_URL, UPLOAD_SCAN_WEBHOOK_TOKEN, UPLOAD_SCAN_REQUIRED (apps/web/lib/security/upload-scan.ts:408-450); scanner side UPLOAD_SCAN_SOURCE_HOSTS, MAX_SOURCE_SCAN_BYTES (services/upload-scanner/src/config.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Structural inspection and credential scan on chat attachments, then external scan, then the workspace data policy (apps/web/lib/server/chat-attachment-completion.ts:397-440).
- Same scan on project sources (apps/web/lib/server/project-knowledge-extraction.ts:359).
- Large chat files: head inspection in the intake workflow plus a scan job posted to the scanner's v2 route (apps/web/lib/server/chat-file-intake/steps.ts:14-17, 802; apps/web/lib/security/source-scan-client.ts:196-203).
- Known-illegal-media hash list blocks and records a moderation event (apps/web/lib/server/chat-attachment-completion.ts:348-364).
- Scanner service: constant-time bearer auth, 411 without length, 413 over cap, 503 on timeout or clamd failure, health probe with signature age (services/upload-scanner/src/server.ts:89,103-150,188).
- Production requires a configured scanner unless UPLOAD_SCAN_REQUIRED=false (apps/web/lib/security/upload-scan.ts:408-415).

**Incomplete**

- Brief says 'platform partial': complete once the scanner is deployed and the two environment values are set (S95.06). Whether it is deployed is not shown in the code: unknown.

**Present but disconnected or switched off**

- Audio dictation skips the external scan on purpose (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:469-472).
- If UPLOAD_SCAN_REQUIRED=false and no URL, only structural checks run and a warning event is logged once (apps/web/lib/security/upload-scan.ts:433-440).

**Not available**

- Quarantine: refused bytes are deleted, not kept (apps/web/lib/server/chat-attachment-completion.ts:415).
- On-device scanning on any app: none found.

## 4. Required behaviour

**Established requirements**

- Uploaded bytes are inspected for real type, active content and executables, not only the declared MIME. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.05)
- Uploads are malware-scanned and unsafe files are quarantined or rejected. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.06)
- Every route that materialises user bytes runs the same scanner; a failing file is deleted and never registered; production requires the external scanner. (source: doc: docs/security/upload-scanning.md)

**Acceptance criteria**

1. A ZIP declared as image/png is refused.
2. A PDF with a launch action is refused.
3. A text file with a recognised private key format is refused; a high-entropy string alone is logged, not refused.
4. With the scanner down in production, the upload is refused with the retry message and no row exists.
5. A file larger than the scanner cap gets 413 from the scanner and is refused.
6. A refused chat attachment leaves no staging object.
7. A password-protected PDF is refused with the password message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The credential scan reads only the first 256,000 bytes of text [inferred from CREDENTIAL_SCAN_BYTES, apps/web/lib/security/upload-scan.ts:173; use not confirmed].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Correct docs/security/upload-scanning.md:45, which says an unconfigured production refuses with external_scanner while the code returns scan_unavailable.
- [proposed] Decide whether to keep refused files for review (quarantine) or confirm deletion as the policy.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | scanUploadBytes | `apps/web/lib/security/upload-scan.ts` | Entry: structural + credential + external. |
| service | inspectUploadBytes | `apps/web/lib/security/upload-scan.ts` | Executable signatures, type confusion, active content. |
| service | scanUploadForCredentials | `apps/web/lib/security/upload-scan.ts` | Filename and content credential detection. |
| service | runExternalScanner | `apps/web/lib/security/upload-scan.ts` | POST bytes to UPLOAD_SCAN_WEBHOOK_URL, 15 s timeout, fail closed. |
| service | uploadScannerStatus | `apps/web/lib/security/upload-scan.ts` | Decides whether the scanner is required. |
| service | completeChatAttachmentUpload | `apps/web/lib/server/chat-attachment-completion.ts` | Chat call site, denylist, data policy, delete on refusal. |
| service | extractProjectKnowledgeFile | `apps/web/lib/server/project-knowledge-extraction.ts` | Project call site. |
| service | inspectOutboundContent | `apps/web/lib/security/outbound-content-inspection.ts` | Workspace data-policy check on uploads. |
| service | chat-file-intake steps | `apps/web/lib/server/chat-file-intake/steps.ts` | Large file head inspection, scan polling, seal. |
| service | source-scan-client | `apps/web/lib/security/source-scan-client.ts` | Submits and reads v2 scan jobs. |
| service | upload-scanner HTTP server | `services/upload-scanner/src/server.ts` | POST /scan, /v2/scans, /health. |
| service | clamd client | `services/upload-scanner/src/clamd.ts` | Streams bytes to the virus engine. |
| config | scanner config | `services/upload-scanner/src/config.ts` | Token length rule, source host allow list, size limits. |
| config | fly.toml | `services/upload-scanner/fly.toml` | Scanner deployment descriptor. |
| test | scanner tests | `services/upload-scanner/__tests__/server.test.ts` | HTTP contract (23 tests). |
| command | check-upload-inspection-coverage | `scripts/check-upload-inspection-coverage.mjs` | Guard named by the security doc; file not opened. |
| other | upload-scanning doc | `docs/security/upload-scanning.md` | Runbook and rules. |
| service | moderation hash denylist | `apps/web/lib/moderation` | matchDenylistedUpload, recordModerationEvent. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server reads the stored bytes within the declared size. | our servers | apps/web/lib/server/chat-attachment-completion.ts:326-345 |
| Hash list check, then checksum comparison with the client's value. | our servers | apps/web/lib/server/chat-attachment-completion.ts:348-368 |
| Structural and credential checks run in process. | our servers | apps/web/lib/security/upload-scan.ts:601-611 |
| Bytes are POSTed to the scanner, which streams them to the virus engine and answers safe or not. | our servers | apps/web/lib/security/upload-scan.ts:441-470; services/upload-scanner/README.md (self-hosted, files never go to a third party) |
| Workspace data policy decides block or allow. | our servers | apps/web/lib/server/chat-attachment-completion.ts:419-440 |
| On any refusal, the staged object is deleted and a validation error is returned. | our servers | apps/web/lib/server/chat-attachment-completion.ts:397-416 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Findings and moderation event (hash, rule id, storage key) | logs and the moderation recorder | No | Retention not read: unknown. |
| Refused bytes | nowhere after deletion | No | Deleted at once (apps/web/lib/server/chat-attachment-completion.ts:415). |

**Models and providers.** No model or LLM provider. The virus engine runs in our own scanner service (services/upload-scanner/README.md).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Runs inside authenticated upload routes. |
| Permissions | The scanner accepts only a bearer token of at least 32 characters (services/upload-scanner/src/config.ts:72). |
| Subscription | None found in the code: every plan gets the same scan. |
| Limits and metering | Web timeout 15 s (apps/web/lib/security/upload-scan.ts:450); scanner deadline 14 s (services/upload-scanner/README.md); source-scan cap 520 MiB by default (services/upload-scanner/src/config.ts:26). |
| Feature flags | UPLOAD_SCAN_REQUIRED true or false; unset means required in production (apps/web/lib/security/upload-scan.ts:408-415). |
| Model compatibility | Not applicable. |
| Provider restrictions | None; self-hosted. |
| Local mode | Local-mode files are not sent to this service by anything in this feature; any on-device check is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Scanner unreachable or non-OK | scan_unavailable finding, upload refused with the retry message. | apps/web/lib/security/upload-scan.ts:452-474 |
| No URL set, scanner required | scan_unavailable finding. | apps/web/lib/security/upload-scan.ts:418-431 |
| Scanner over size cap | 413 from scanner; web refuses. | services/upload-scanner/src/server.ts:115 |
| Timeout | 503 and fail closed. | services/upload-scanner/src/server.ts:34,112-150 |
| Stale or empty signatures | Health reports stale or unavailable. | services/upload-scanner/src/server.ts:188-200 |
| Bytes changed during check | Refused with 'changed during its safety check'. | apps/web/lib/server/chat-attachment-completion.ts:454 |
| Entropy-only credential finding | Logged, not refused. | apps/web/lib/security/upload-scan.ts:336-340,567-573 |
| Retry | Person re-uploads; large files poll the scanner until a give-up time. | apps/web/lib/server/chat-file-intake/steps.ts:190-196 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/security/upload-scan.test.ts`: Honest files, type confusion (ZIP as PNG, PDF as JPEG), bad image bytes.
- `apps/web/app/api/uploads/__tests__/chat-attachment-moderation.test.ts`: Hash denylist reject and delete, ETag, size growth.
- `services/upload-scanner/__tests__/server.test.ts`: Scanner HTTP contract (23 tests; titles not read).
- `services/upload-scanner/__tests__/limits.test.ts`: Scanner limit matches web limit.
- `apps/web/lib/security/__tests__/source-scan-client.test.ts`: Source scan client.
- `apps/web/lib/server/chat-file-intake/__tests__/full-inspection.test.ts`: Large file inspection.
- `apps/web/lib/server/chat-file-intake/__tests__/pdf-inspection.test.ts`: PDF inspection in the intake.
- `apps/web/lib/security/__tests__/outbound-content-inspection.test.ts`: Data-policy inspection.

**Test scenarios**

- **Disguised archive**
  1. Rename a ZIP to .png and attach it.
  - Expected: Refusal message; no media_assets row.
- **Credential file**
  1. Attach a text file containing a recognised private key.
  - Expected: Refused; staging object deleted.
- **Scanner down**
  1. In a test deployment, stop the scanner.
  2. Attach a small PDF.
  - Expected: Retry message; no row; log shows scan_unavailable.
- **Test virus string**
  1. Attach the standard antivirus test file to a chat.
  - Expected: Refused by the scanner as unsafe.
- **Scanner health**
  1. Call the scanner /health with the token.
  - Expected: status ok, stale or unavailable with signature age.

**Where to look when it fails**

- Log '[upload-scan] refused an upload that failed content inspection'.
- Log event upload_scanner_unconfigured.
- Scanner logs scan_clean, scan_infected, scan_failed (services/upload-scanner/src/server.ts).
- Moderation events for hash blocks.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Security doc says unconfigured production refuses with external_scanner; code returns scan_unavailable.** Affects: Operators reading the runbook. Evidence: docs/security/upload-scanning.md:45; apps/web/lib/security/upload-scan.ts:418-431. Work needed: Correct the doc.
- **No quarantine; refused bytes are deleted.** Affects: Security review of refusals. Evidence: apps/web/lib/server/chat-attachment-completion.ts:415. Work needed: Decide policy; brief says 'rejected, not quarantined, as before'.
- **Deployment state of the scanner is not shown by code.** Affects: All apps in production. Evidence: S95.06 unfinished note. Work needed: Record live validation in audit/.
- **Audio is not scanned by the virus engine.** Affects: Dictation on every app. Evidence: apps/web/app/api/llm/v1/audio/transcriptions/route.ts:469-472. Work needed: Accepted by comment (bytes are not stored); confirm.

**Depends on**

- SYS-security-and-privacy
- SYS-files-artifacts-and-storage
- SYS-execution-boundaries
- F095-01
- mode:cloud
- file:services/upload-scanner/src/server.ts

## Unknown

- Whether the scanner is deployed and both environment values are set in production.
- Retention of moderation events.
- Whether the credential scan covers more than the first 256,000 bytes.
- Which file types the scanner checks beyond clamd signatures.
