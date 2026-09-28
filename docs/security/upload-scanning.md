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
  body, a clamd error, or no verdict within 14 seconds answers a non-2xx status,
  the deadline's 503 even while the upload is still arriving. A clamd reply
  that arrives before the end of the stream fails the scan whatever it says,
  because clamd has not seen the whole file. The web rejects the upload in
  every one of those cases.
- A file clamd cannot scan to the end is refused, never passed on a partial
  scan: with `AlertExceedsMax` on, an archive nested more than 17 deep, more
  than 10,000 members, a member above 100 MB unpacked or more than 400 MB
  unpacked in total is reported as a `Heuristics.Limits.Exceeded` detection.
  The web's own office extraction already refuses documents that unpack past
  200 MB or 2,000 members.
- A password-protected archive, PDF or Office document is refused for the same
  reason: with `AlertEncrypted` on, clamd reports what it cannot open as a
  `Heuristics.Encrypted.*` detection, the service adds `"reason": "encrypted"`,
  and the web refuses the file with "This file is password protected, so its
  contents could not be checked. Remove the password and upload it again."
- Its size limit equals the largest file the web sends for scanning
  (`MAX_ATTACHMENT_BYTES`), pinned by `services/upload-scanner/__tests__/limits.test.ts`.
- `GET /health` streams the EICAR test string through clamd and fails unless
  clamd detects it, so a clamd that answers but no longer scans fails the
  check. The string is assembled at runtime, so it never sits whole in the
  source, and the result is cached for 30 seconds. Signatures more than seven
  days old are reported as `stale` there without failing it, because Fly stops
  routing to a machine that fails this check, and scanning on older signatures
  beats refusing every upload. Fly does not restart a machine for a failing
  check ([health checks](https://docs.fly.io/reference/health-checks/)); the
  troubleshooting list below covers that. `GET /health/signatures` fails once
  the signatures are stale; Fly runs it as the `signatures` monitoring check,
  which never affects routing. Without the bearer token both answer only
  `{"status": …}`; the engine and signature versions need the token.
- `services/upload-scanner/__tests__/clamd-config.test.ts` pins the clamd
  settings above: `AlertExceedsMax`, `AlertEncrypted`, the in-memory spool and
  the loopback address.

The machine is `shared-cpu-2x` with 4 GB. clamd holds about 1.2 GiB of
signatures and briefly doubles that while it reloads them after an update,
which is why ClamAV's Docker documentation gives 3 GiB as the minimum and 4 GiB
as the recommendation; the headroom is what lets a reload happen without
refusing uploads. There is no swap: swapping would page upload bytes to disk.
At Fly's published rates for `sjc` (checked 2026-09-28) the machine costs
about $25.51 per 30 days before bandwidth: two shared vCPUs at $0.00000075 a
second each, 3.5 GB of memory beyond the 0.25 GB each shared vCPU includes at
$0.00000193 per GB-second, and the region's 1.19 multiplier. Deploys use the
`bluegreen` strategy, which starts the new machine and waits for `/health`
before it retires the old one, so a deploy never leaves the web without a
scanner.

clamd exiting stops the service, and Fly restarts the machine. freshclam
exiting does not: it exits by design when the ClamAV CDN refuses it, so clamd
keeps scanning with the signatures it has, freshclam starts again an hour
later, and `/health` reports the growing signature age.

## Runbook: running the scanner

The `fly` commands run from `services/upload-scanner`; the `vercel` commands
run from the repository root, where the web's Vercel project is linked. Both
need an owner logged in with `fly auth login` and `vercel login`. Keep the
token in the password manager; it is set on both sides and nowhere else.

### First deploy

1. Create the app in the organization that holds `agiworkforce-signaling`:
   `fly apps create agiworkforce-upload-scanner --org <organization>`.
2. Generate the token and stage it on Fly:

   ```sh
   TOKEN="$(openssl rand -hex 32)"
   fly secrets set UPLOAD_SCAN_WEBHOOK_TOKEN="$TOKEN" --app agiworkforce-upload-scanner --stage
   ```

3. Check the configuration with `fly config validate`, then deploy one
   machine: `fly deploy --ha=false`. The first build downloads the signatures
   into the image (a later build may reuse that layer from cache; every start
   refreshes them), and the first boot takes a minute or two while clamd loads
   them; both checks have a 180 second grace period.

### Verify before the web uses it

```sh
URL=https://agiworkforce-upload-scanner.fly.dev
curl -sS "$URL/health"
curl -sS "$URL/health/signatures" -H "Authorization: Bearer $TOKEN"
printf 'hello' | curl -sS -X POST "$URL/scan" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/octet-stream' --data-binary @-
curl -fsS https://secure.eicar.org/eicar.com.txt | curl -sS -X POST "$URL/scan" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/octet-stream' --data-binary @-
printf 'hello' | zip -q -P test - - | curl -sS -X POST "$URL/scan" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/octet-stream' --data-binary @-
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$URL/scan" --data-binary 'hello'
```

Expect, in order:

1. `{"status":"ok"}` and nothing else.
2. `"status":"ok"` with an `ageHours` under 168.
3. `{"safe":true}`.
4. `{"safe":false,"detail":"ClamAV detected ..."}` naming an EICAR test
   signature.
5. `{"safe":false,"detail":"ClamAV detected Heuristics.Encrypted.Zip","reason":"encrypted"}`.
6. `401`.

The EICAR file is the industry's harmless test sample. It and the
password-protected zip are piped straight through, so neither lands on disk.
`fly logs --app agiworkforce-upload-scanner` shows a `scan_clean` line and two
`scan_infected` lines for the three scans.

### Point the web at it

From the repository root:

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
```

Then, from the repository root:

```sh
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

- `/health` answers `unavailable`: clamd is not up, or it answers but did not
  detect the EICAR test string. `fly logs` shows why, usually signatures still
  loading after a restart, or an out-of-memory exit. Fly stops routing to the
  machine but does not restart it, so if the check still fails once clamd has
  loaded, restart the machine; `fly machine list` names its id:

  ```sh
  fly machine restart <machine id> --app agiworkforce-upload-scanner
  ```

- `fly checks list --app agiworkforce-upload-scanner` shows the `signatures`
  check failing, and `/health` answers `status` `stale`: freshclam has not
  updated for seven days, and `/health` with the token shows the age. Scanning
  continues on the signatures on disk. The freshclam lines in `fly logs` name
  the cause. The ClamAV CDN answers `429` to a host that downloads too often,
  and freshclam waits out the cool-down on its own; a `403` makes freshclam
  exit, logged as `freshclam_exited`, and it is started again every hour.
- `fly logs` shows `scan_unauthorized`: the two sides hold different tokens.
  Set the same value on both. The scanner closes an unauthenticated connection
  without reading the upload, so the web logs either `Scanner returned 401` or,
  for a larger file, `Scanner unreachable`.
- The web logs `Scanner returned 413`, or `Scanner unreachable` for the same
  reason: the web now sends larger files than `MAX_SCAN_BYTES`.
  `limits.test.ts` fails in CI before this can ship.

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
- `services/upload-scanner/__tests__/server.test.ts`, `clamd-config.test.ts`,
  `config.test.ts` and `limits.test.ts`
- `apps/web/lib/security/__tests__/decompression-ratio.test.ts`
- `apps/web/lib/redaction/__tests__/redaction.test.ts`
- `scripts/check-client-bundle-secrets.mjs` and its `.test.mjs`
