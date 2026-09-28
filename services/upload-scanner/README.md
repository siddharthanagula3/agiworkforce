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
and spools each stream in `/dev/shm`, so upload bytes stay in memory and are
gone when the scan ends. The image carries the signatures from the build that
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
