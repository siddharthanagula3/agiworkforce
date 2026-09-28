# Upload scanner

Self-hosted ClamAV behind the web's upload scan webhook (`runExternalScanner` in
`apps/web/lib/security/upload-scan.ts`). User files never leave infrastructure
we run: the web posts the bytes here, this service streams them to a local
clamd and answers with a verdict. Deploying, verifying and rotating the token
are in `docs/security/upload-scanning.md`.

## Contract

`POST /scan` with `Authorization: Bearer <UPLOAD_SCAN_WEBHOOK_TOKEN>`, a
`Content-Length` header and the file's bytes as the body.

| Outcome                                        | Status | Body                                                    |
| ---------------------------------------------- | ------ | ------------------------------------------------------- |
| clean                                          | 200    | `{ "safe": true }`                                      |
| malware                                        | 200    | `{ "safe": false, "detail": "ClamAV detected <name>" }` |
| missing or wrong token                         | 401    | `{ "safe": false, "detail": … }`                        |
| no `Content-Length`                            | 411    | `{ "safe": false, "detail": … }`                        |
| larger than `MAX_SCAN_BYTES`                   | 413    | `{ "safe": false, "detail": … }`                        |
| clamd down, clamd error, or no verdict in 14 s | 503    | `{ "safe": false, "detail": … }`                        |

The web rejects the upload for anything but `{ "safe": true }`, so every
failure here fails closed. `MAX_SCAN_BYTES` is the largest file the web sends,
and `__tests__/limits.test.ts` fails if the web's limit moves without it. The
14 s deadline answers before the web's own 15 s timeout gives up.

`GET /health` reports clamd's engine version and the signature database's
version, publication time and age. It answers 200 while the signatures are
fresh, 503 `stale` once they are older than seven days (the age at which ClamAV
itself warns), and 503 `unavailable` while clamd does not answer.

## How it runs

One container. Node 24 runs `src/index.ts` directly, so nothing is built or
installed at runtime. At start it refreshes the signatures with freshclam, then
supervises clamd and the freshclam daemon; if either exits, the service exits
and Fly restarts the machine. clamd listens only on `127.0.0.1:3310`
(`clamav/clamd.conf`, matching `CLAMD` in `src/index.ts`) and spools each
stream in `/dev/shm`, so upload bytes stay in memory and are gone when the scan
ends. The image carries the signatures current at build time; freshclam brings
them up to date at start and every two hours after.

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
