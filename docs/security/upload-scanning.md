# Upload scanning

Status: Current
Owner: Security
Last updated: 2026-09-28

Every route that materialises bytes a user uploads runs the same scanner, and
`scripts/check-upload-inspection-coverage.mjs` enumerates them from the route
tree so a new one cannot skip it. The two paths that store files scan where the
object becomes usable:

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
   signature-based malware detection. That URL is our own ClamAV service,
   `services/upload-scanner`, so user files never go to a third party.

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

Production therefore needs one of:

- the scanner deployed and both `UPLOAD_SCAN_WEBHOOK_URL` and
  `UPLOAD_SCAN_WEBHOOK_TOKEN` set, as the runbook below does, or
- `UPLOAD_SCAN_REQUIRED=false`, which accepts structural scanning only and logs
  `upload_scanner_unconfigured` once per process.

## The scanner service

`services/upload-scanner` runs clamd, the freshclam signature updater and a
small HTTP front end in one container on Fly.io. Its README holds the full
contract; the parts that decide an upload are:

- `POST /scan` needs `Authorization: Bearer <UPLOAD_SCAN_WEBHOOK_TOKEN>`,
  compared in constant time. The service refuses to start without a token of
  at least 32 characters, so it never serves an unauthenticated scan.
- The body streams to clamd over `INSTREAM` and is never written to disk:
  clamd spools it in `/dev/shm`, which is memory on a Fly Machine.
- It answers `{ "safe": true }` only for a clean verdict. Malware answers
  `{ "safe": false }` with the signature name; a missing token, an oversize
  body, a clamd error, or no verdict within 14 seconds answers a non-2xx status.
  The web rejects the upload in every one of those cases.
- Its size limit equals the largest file the web sends for scanning
  (`MAX_ATTACHMENT_BYTES`), pinned by `services/upload-scanner/__tests__/limits.test.ts`.
- `GET /health` reports the signature version and age, and fails once the
  signatures are more than seven days old or clamd does not answer.

The machine is `shared-cpu-2x` with 4 GB. clamd holds about 1.2 GiB of
signatures and briefly doubles that while it reloads them after an update,
which is why ClamAV's Docker documentation gives 3 GiB as the minimum and 4 GiB
as the recommendation. There is no swap: swapping would page upload bytes to
disk. Deploys use the `bluegreen` strategy, which starts the new machine and
waits for `/health` before it retires the old one, so a deploy never leaves the
web without a scanner.

## Runbook: running the scanner

Every command below runs from `services/upload-scanner`, and needs an owner
logged in with `fly auth login` and `vercel login`. Keep the token in the
password manager; it is set on both sides and nowhere else.

### First deploy

1. Create the app in the organization that holds `agiworkforce-signaling`:
   `fly apps create agiworkforce-upload-scanner --org <organization>`.
2. Generate the token and stage it on Fly:

   ```sh
   TOKEN="$(openssl rand -hex 32)"
   fly secrets set UPLOAD_SCAN_WEBHOOK_TOKEN="$TOKEN" --app agiworkforce-upload-scanner --stage
   ```

3. Deploy one machine: `fly deploy --ha=false`. The build downloads the
   current signatures, and the first boot takes a minute or two while clamd
   loads them; `/health` has a 180 second grace period.

### Verify before the web uses it

```sh
URL=https://agiworkforce-upload-scanner.fly.dev
curl -sS "$URL/health"
printf 'hello' | curl -sS -X POST "$URL/scan" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/octet-stream' --data-binary @-
curl -fsS https://secure.eicar.org/eicar.com.txt | curl -sS -X POST "$URL/scan" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/octet-stream' --data-binary @-
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$URL/scan" --data-binary 'hello'
```

Expect, in order: `"status":"ok"` with an `ageHours` under 168;
`{"safe":true}`; `{"safe":false,"detail":"ClamAV detected ..."}` naming an
EICAR test signature; and `401`. The EICAR file is the industry's harmless
test sample, piped straight through so it never lands on disk. `fly logs --app
agiworkforce-upload-scanner` shows a `scan_clean` and a `scan_infected` line
for the two scans.

### Point the web at it

```sh
printf '%s' "$URL/scan" | vercel env add UPLOAD_SCAN_WEBHOOK_URL production
printf '%s' "$TOKEN" | vercel env add UPLOAD_SCAN_WEBHOOK_TOKEN production --sensitive
```

Leave `UPLOAD_SCAN_REQUIRED` unset so production keeps requiring the scanner,
then redeploy production: Vercel applies environment changes to new
deployments only. Attach an image to a chat and ask about it; the answer shows
the upload passed. Attaching `eicar.com.txt` is refused with "This file could
not be accepted because its contents failed a safety check.", and the web logs
the `external_scanner` finding.

### Rotate the token

The scanner accepts `UPLOAD_SCAN_WEBHOOK_TOKEN_PREVIOUS` alongside the current
token, so rotation never refuses an upload:

```sh
NEW_TOKEN="$(openssl rand -hex 32)"
fly secrets set UPLOAD_SCAN_WEBHOOK_TOKEN="$NEW_TOKEN" UPLOAD_SCAN_WEBHOOK_TOKEN_PREVIOUS="$TOKEN" \
  --app agiworkforce-upload-scanner --stage
fly deploy
printf '%s' "$NEW_TOKEN" | vercel env add UPLOAD_SCAN_WEBHOOK_TOKEN production --sensitive --force
```

Redeploy the web's production and confirm uploads still pass with no
`scan_unauthorized` in `fly logs`. Then retire the old token the same way:

```sh
fly secrets unset UPLOAD_SCAN_WEBHOOK_TOKEN_PREVIOUS --app agiworkforce-upload-scanner --stage
fly deploy
```

Staging the secrets and running `fly deploy` sends each change through the
bluegreen swap, so the scanner never goes down in between.

### When it is unhealthy

- `/health` answers `unavailable`: clamd is not up. `fly logs` shows why,
  usually signatures still loading after a restart, or an out-of-memory exit.
- `/health` answers `stale`: freshclam has not updated for seven days. Its log
  lines name the cause; the ClamAV CDN answers `429` to a host that downloads
  too often and freshclam waits out the cool-down on its own.
- The web logs `Scanner returned 401`: the two sides hold different tokens.
  Set the same value on both.
- The web logs `Scanner returned 413`: the web now sends larger files than
  `MAX_SCAN_BYTES`. `limits.test.ts` fails in CI before this can ship.

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
- `services/upload-scanner/__tests__/server.test.ts`, `config.test.ts` and
  `limits.test.ts`
- `apps/web/lib/security/__tests__/decompression-ratio.test.ts`
- `apps/web/lib/redaction/__tests__/redaction.test.ts`
- `scripts/check-client-bundle-secrets.mjs` and its `.test.mjs`
