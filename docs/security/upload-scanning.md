# Upload scanning

Status: Current
Owner: Security
Last updated: 2026-09-18

Every byte a user uploads reaches the product through one of two paths, and both
run the same scanner:

- `POST /api/uploads/chat-attachment/complete` for chat attachments
- `apps/web/lib/server/project-knowledge-extraction.ts` for project sources

Both write to the private object bucket, which
`isPrivateObjectStorageConfigured` keeps distinct from the public one, so an
uploaded object is never world-readable while it waits to be scanned. A file
that fails the scan is deleted and never registered as an asset.

## What runs, in order

1. `inspectUploadBytes` reads the real bytes: executable signatures
   (PE, ELF, Mach-O, shebang), declared-type confusion, active content in SVG
   and PDF.
2. `scanUploadForCredentials` refuses a name that carries a path
   (`unsafe_filename`), a name that is itself a credential file
   (`sensitive_filename`), and high-confidence secrets in textual content
   (`credential_material`). Low-confidence entropy hits are logged, not refused.
3. `runExternalScanner` posts the bytes to `UPLOAD_SCAN_WEBHOOK_URL` for
   signature-based malware detection.

## The external scanner is required in production

`uploadScannerStatus()` resolves `required` as:

| `UPLOAD_SCAN_REQUIRED` | `NODE_ENV=production` | result       |
| ---------------------- | --------------------- | ------------ |
| `true`                 | any                   | required     |
| `false`                | any                   | not required |
| unset                  | yes                   | **required** |
| unset                  | no                    | not required |

A production deployment with no `UPLOAD_SCAN_WEBHOOK_URL` and no explicit
`UPLOAD_SCAN_REQUIRED=false` refuses every upload with an `external_scanner`
finding. That is deliberate: an unprovisioned deployment fails closed rather
than admitting unscanned bytes.

**Before deploying this change**, provision one of:

- `UPLOAD_SCAN_WEBHOOK_URL` (plus `UPLOAD_SCAN_WEBHOOK_TOKEN`) pointing at a
  scanner that answers `{ "safe": true }` for a clean file, or
- `UPLOAD_SCAN_REQUIRED=false`, which accepts structural scanning only and logs
  `upload_scanner_unconfigured` once per process.

## Decompression bounds

`apps/web/lib/security/archive-bounds.ts` is the one place that bounds an
archive. It refuses on three limits:

- `members`: more than `MAX_ARCHIVE_MEMBERS` entries.
- `total_bytes`: more than the caller's absolute ceiling.
- `ratio`: more than `MAX_DECOMPRESSION_RATIO` times the archive's own size.

`readArchiveMember` counts bytes as they inflate rather than trusting the size
the zip header declares, so a member that claims a kilobyte and expands to a
gigabyte is cut off mid-stream.

Consumers:

- `apps/web/lib/server/office-document-text.ts` (docx, xlsx, pptx from both
  chat attachments and project sources) bounds member count, declared total and
  inflated bytes, and turns any limit into `OfficeDocumentUnreadableError`.
- `apps/web/features/plugins/server/directory/archive.ts` carries its own
  equivalent budget for plugin and skill archives
  (`PLUGIN_UPLOAD_MAX_TOTAL_BYTES`, `PLUGIN_UPLOAD_MAX_MEMBERS`).

## Parser output is untrusted

`apps/web/lib/server/untrusted-document-text.ts` fences extracted document text
the way `packages/tools/mcp/src/connect.ts` fences remote MCP text: an
`untrusted="true"` element with a preamble saying the content is data and never
instructions. Extraction itself does not fence, because project knowledge stores
character offsets into the raw extracted text; the fence is applied where the
text is assembled into a prompt.

## Verification

- `apps/web/lib/security/upload-scan.test.ts`
- `apps/web/lib/security/__tests__/decompression-ratio.test.ts`
- `apps/web/lib/redaction/__tests__/redaction.test.ts`
- `scripts/check-client-bundle-secrets.mjs` and its `.test.mjs`
