# Upload scanner

Self-hosted ClamAV behind the web's upload scan webhook (`runExternalScanner` in
`apps/web/lib/security/upload-scan.ts`). User files never leave infrastructure
we run: the web posts the bytes here, this service streams them to a local
clamd and answers with a verdict. Deploying, verifying and rotating the token
are in `docs/security/upload-scanning.md`.

## Contract

`POST /scan` with `Authorization: Bearer <UPLOAD_SCAN_WEBHOOK_TOKEN>`, a
`Content-Length` header and the file's bytes as the body.

| Outcome                                      | Status | Body                                                    |
| -------------------------------------------- | ------ | ------------------------------------------------------- |
| clean                                        | 200    | `{ "safe": true }`                                      |
| malware                                      | 200    | `{ "safe": false, "detail": "ClamAV detected <name>" }` |
| password protected                           | 200    | `{ "safe": false, "detail": …, "reason": "encrypted" }` |
| missing or wrong token                       | 401    | `{ "safe": false, "detail": … }`                        |
| no `Content-Length`                          | 411    | `{ "safe": false, "detail": … }`                        |
| larger than `MAX_SCAN_BYTES`                 | 413    | `{ "safe": false, "detail": … }`                        |
| clamd down or failing, or no verdict in 14 s | 503    | `{ "safe": false, "detail": … }`                        |

The web rejects the upload for anything but `{ "safe": true }`, so every
failure here fails closed. `MAX_SCAN_BYTES` is the largest file the web sends,
and `__tests__/limits.test.ts` fails if the web's limit moves without it. The
14 s deadline answers 503 before the web's own 15 s timeout gives up, even
while the upload is still arriving. A 401, 411 or 413 closes the connection
without reading the body, so a client still sending a large file may see the
connection reset instead of the status.

clamd owes a verdict only after the zero-length chunk that ends the stream. A
reply that arrives before it means clamd did not see the whole file, so the
scan fails with 503 whatever the reply says.

`AlertExceedsMax` is on, so a file clamd cannot scan to the end (an archive
nested more than 17 deep, more than 10,000 members, a member above 100 MB
unpacked, more than 400 MB unpacked in total) comes back as a
`Heuristics.Limits.Exceeded` detection and is refused rather than passed on a
partial scan. `AlertEncrypted` is on for the same reason: a password-protected
archive, PDF or Office document, which clamd cannot open, comes back as a
`Heuristics.Encrypted.*` detection with `"reason": "encrypted"`, and the web
asks the person to remove the password and upload it again.

`GET /health` streams the EICAR test string to clamd, assembled at runtime so
the whole string never sits in the source, and passes only when clamd detects
it; it also reads the signature database's version and publication time. The
result is cached for 30 s. It answers 200 with `status` `ok`, or `stale` once
the signatures are older than seven days (the age at which ClamAV itself
warns), and 503 `unavailable` while clamd does not answer or does not detect
the test string. Without the bearer token the body is only `{ "status": … }`;
with it, the body adds clamd's engine version and the signatures' version,
publication time and age. Fly stops routing to a machine that fails this
check, so stale signatures never fail it. Fly does not restart a machine for a
failing check, so the service watches the same probe itself (below).
`GET /health/signatures` answers the same way but fails with 503 once the
signatures are stale; Fly runs it as a monitoring check that does not affect
routing.

## Protocol 2: source scans of large chat files

Off unless `UPLOAD_SCAN_SOURCE_HOSTS` is set. Without it every `/v2` path
answers 404 exactly as before, which is how the web's readiness probe sees
protocol 1, and clamd runs on `clamav/clamd.conf` unchanged. With it, the
service serves the routes below and starts clamd on a configuration written at
start from `clamav/clamd.conf` plus `CLAMD_SOURCE_SCAN_SETTINGS` in
`src/config.ts` (the clamd settings table of `docs/specs/large-file-uploads/spec.md`).
Those settings are global to clamd, so they also bind legacy `POST /scan` once
protocol 2 is on; deployment step 4 of `docs/specs/large-file-uploads/plan.md`
measures that before production.

Every route needs the bearer token; without it the answer is 401
`{ "reason": "unauthorized" }`. Every shape is pinned in
`__tests__/fixtures/protocol-2.json`, which `__tests__/server-v2.test.ts`
proves the server produces.

| Request                                                                                             | Answer                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v2/scans` `{ jobId, sourceUrl, byteCount, etag, mimeType }`                                  | 202 `{ scanId, deadlineMs }`; a repeated `jobId` gets the same scan                                                                                                   |
| the same, queue full or hourly budget spent                                                         | 429 `{ "reason": "queue_full" \| "source_budget" }` with `Retry-After` (at least 60 s)                                                                                |
| the same, `sourceUrl` not https, not an allowlisted host, an IP literal, with credentials or a port | 400 `{ "reason": "source_not_allowed" }`, before any fetch                                                                                                            |
| the same, `byteCount` over `MAX_SOURCE_SCAN_BYTES` or the hourly budget                             | 413 `{ "reason": "too_large" }`, before any fetch                                                                                                                     |
| the same, malformed                                                                                 | 400 `{ "reason": "invalid_request" }`                                                                                                                                 |
| `GET /v2/scans/:jobId`                                                                              | 200 `{ status: queued \| scanning \| done, deadlineMs, verdict? }`, or `{ "status": "unknown" }` for a job this process does not hold (after a restart: submit again) |
| `GET /v2/capability`                                                                                | 200 `{ protocol: 2, maxSourceScanBytes, queueDepth, running }`, without calling clamd                                                                                 |

The scanner fetches the object itself with `redirect: 'error'` and
`If-Match: <etag>`, then makes one pass: SHA-256 and byte count, the PDF
active-content tokens (`/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`) for
`application/pdf`, and clamd INSTREAM through the same `scanStream` as
`POST /scan`. The token scan reads the PDF's objects and skips the bytes from
`>> stream` to `endstream`: compressed stream data is close to random, and a
three-byte `/JS` turns up by chance about once in every 22 MiB of it. A
`>> stream` inside a comment, a string or a hex string does not open a skipped
region, and a file that ends inside a stream is refused as `active_pdf`. The
scan is a heuristic, not a parser: any object placed inside a stream body,
compressed or not, is invisible to it (the bytes between `>> stream` and
`endstream` are skipped whatever they hold, and a stream with no `endstream`
swallows the objects after it), and so is a token written with `#` name
escapes. clamd still scans every byte. The verdict is
`{ jobId, outcome, reason?, sha256, bytes, etag, ms }`:

- `clean`;
- `infected` with no reason (malware), `encrypted`, `limits_exceeded`,
  `active_pdf` or `size_mismatch`;
- `incomplete` with `deadline`, `source_unavailable` (connection error, 403
  from an expired URL, a redirect, any other non-2xx, a source that stops
  partway), `source_changed` (412) or `scan_failed` (clamd failed or answered
  before the end of the stream). Every `incomplete` is retried by the web,
  never treated as safe.

The ETag in the verdict is the one the scanner read, so the web's seal does not
depend on the store honouring `If-Match`.

Admission: `SCAN_SOURCE_CONCURRENCY` scans at once and `SCAN_QUEUE_MAX`
waiting in FIFO order; legacy `POST /scan` takes no part in it. A new `jobId`
is admitted only while the `byteCount` admitted in the last 60 minutes plus its
own stays within `SCAN_SOURCE_BYTES_PER_HOUR` times `min(1, uptime / 60 min)`,
so after a restart the allowance starts at zero and returns over the first
hour. The per-scan deadline is `SCAN_BASE_MS + byteCount / SCAN_MIN_BYTES_PER_SEC`
(130 s for 500 MiB at the built values), counted from the start of the scan,
and carried as `deadlineMs`. Jobs are kept in memory for an hour after they
finish. `GET /v2/capability` reports `maxSourceScanBytes` as the smaller of
`MAX_SOURCE_SCAN_BYTES` and `SCAN_SOURCE_BYTES_PER_HOUR`, the largest
`byteCount` a submit can be admitted for.

Liveness: from the first byte written to clamd until its reply, the socket
closing or the deadline, `/health` and the watchdog count the EICAR probe as
alive and use the last good signature status, because clamd's CPU-heavy phase
is the wait after the last byte. When a scan reaches its deadline with no
reply, no later scan gets that exemption until a probe started after that
deadline succeeds, so a hung clamd is masked for at most one deadline. A probe
taken during a live scan says nothing about clamd afterwards: a `/health`
request asked while a scan was live keeps the exemption when its probe answers
after the scan, and the cached probe is dropped when the last live scan ends
and at every deadline, so the next `/health` probes clamd afresh. The exemption
ends as soon as clamd has replied or closed its socket: the scanner then stops
reading the source and answers `incomplete: scan_failed` without reading the
rest of the object. After a deadline the scanner closes its socket and starts
the next queued scan; whether clamd keeps scanning the abandoned stream until
`MaxScanTime` has not been measured.

Logs carry the job id, the source host, the byte counts and the outcome,
never the source URL, its path or its query (a presigned read of an unscanned
file), and a fetch error by its class and status code, never its message.

## How it runs

One container. Node 24 runs `src/index.ts` directly, so nothing is built or
installed at runtime. At start it refreshes the signatures with freshclam, then
supervises clamd and the freshclam daemon. If clamd exits, the service exits
and Fly restarts the machine (`[[restart]]` in `fly.toml`). It also exits when
clamd has not detected the EICAR probe for five minutes, counted from clamd's
start, so a clamd that answers but no longer scans is restarted the same way.
If freshclam exits, which it does by design when the ClamAV CDN refuses it,
clamd keeps scanning with the signatures it has and freshclam starts again an
hour later. clamd listens only on `127.0.0.1:3310` (`clamav/clamd.conf`,
pinned to `LOCAL_CLAMD` in `src/clamd.ts` by `__tests__/clamd-config.test.ts`)
and, with protocol 2 off, spools each stream in `/dev/shm`, so upload bytes
stay in memory and are gone when the scan ends. With protocol 2 on it spools in
`/var/tmp/clamd`, which the image creates for the scanner user, because a
500 MiB stream does not fit in memory beside the signatures. The image carries the signatures from the build that
created its signature layer, which a builder may reuse from cache; freshclam
brings them up to date at start and every two hours after.

## Local run

```sh
docker build -t upload-scanner services/upload-scanner
docker run --rm -p 8080:8080 --shm-size=512m \
  -e UPLOAD_SCAN_WEBHOOK_TOKEN="$(openssl rand -hex 32)" upload-scanner
```

`--shm-size` matters: Docker's default `/dev/shm` is 64 MB, smaller than the
largest upload plus what clamd unpacks from it.

```sh
pnpm --filter @agiworkforce/upload-scanner test
pnpm --filter @agiworkforce/upload-scanner typecheck
```
