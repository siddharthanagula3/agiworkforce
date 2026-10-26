# Local chat security audit

Status: Closed
Owner: Platform lead
Last verified: 2026-10-26

Record of a local red-team of the running web app. Production, customer accounts, and third-party systems were out of scope. Test data was the seeded development accounts `free` and `pro`. The conversation created for the cross-account checks was deleted afterward (delete returned 200, a following read returned 404).

## Executive summary

The signed-in chat API checks the caller on the server. A second test account could not read, rename, delete, or append to a conversation it did not own. A cookie-authenticated write without a CSRF token was rejected. Markup stored in a message was rendered as text.

One confirmed leak was fixed: the public health endpoint included an internal queue finding. After the change it reports that check as unavailable, and the original phrase is gone from the response.

## Coverage

Tested against `http://localhost:3000` while `pnpm --filter @agiworkforce/web dev` was running.

| Area                                                                                                                                                                                         | Result                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Unauthenticated `GET /api/me`, `GET /api/operator`, `GET /api/cron/live-artifacts-refresh`, `GET/POST /api/chat/conversations`, `GET /api/files/{uuid}`, `POST /api/llm/v1/chat/completions` | 401                                                                                                          |
| `GET /api/share/{24-char token}` with a token that does not exist                                                                                                                            | 404, no session body                                                                                         |
| Cookie `POST /api/chat/conversations` with no CSRF token                                                                                                                                     | 403 `CSRF_VALIDATION_FAILED`                                                                                 |
| Same create with the caller's session token                                                                                                                                                  | 201, conversation owned by that caller                                                                       |
| Other account `GET`, `PUT`, `DELETE` that conversation and `POST` a message into it                                                                                                          | 404, response did not contain the title or message text                                                      |
| Guessed conversation id                                                                                                                                                                      | 404                                                                                                          |
| Stored `<img onerror>` and `javascript:` link                                                                                                                                                | Document title is escaped. No matching image, no `javascript:` link, and the page did not set the probe flag |
| `GET /login?redirectTo=` with an external URL, a protocol-relative URL, and a `javascript:` URL                                                                                              | The completion redirect is `/`, not the supplied URL                                                         |
| `GET /api/models`                                                                                                                                                                            | 200, public catalog                                                                                          |
| `GET /api/health` before the fix                                                                                                                                                             | 200, `checks.work.message` was `1 queue(s) not draining`                                                     |
| `GET /api/health` after the fix                                                                                                                                                              | 200, that check is `{ status: "unhealthy", message: "unavailable" }`. The queue phrase is absent             |

Not exercised live, so they are not claimed as tested: model streaming and tool approval, file upload and download of a real object, code execution, billing changes, password reset mail, OAuth (those buttons stay disabled in this environment), multi-tab races past the conversation rate limit, and geographic sign-in signals. Code inspection of conversation queries, file serving, the Slack event receiver, guest chat, and the sync push showed ownership or signature checks on those paths; that is inspection, not a live exploit attempt.

## Vulnerability register

### HEALTH-PUBLIC-MESSAGE-01: public health text names an internal failure

- Severity: Low. An unauthenticated caller learns that a background queue is failing, not a secret or another user's data.
- Evidence: `GET /api/health` returned `checks.work.message` of `1 queue(s) not draining` while the process was up.
- Cause: `toPublicHealthCheck` removed dependency names and configuration findings, and still copied each capability `message` through. Several checks use specific sentences (`index schema missing`, `no live default route`, the queue sentence).
- Fix: `apps/web/app/api/health/route.ts` keeps only `unavailable` and `not configured`. Any other unhealthy message becomes `unavailable`. A healthy check with a non-generic message loses that message.
- Regression: `apps/web/__tests__/api/health.test.ts`, `redactPublicCapabilityCheck`. `pnpm --filter @agiworkforce/web exec vitest run __tests__/api/health.test.ts`: 22 passed.
- Retest: the same `GET /api/health` no longer contains `not draining`. `checks.work` is unhealthy with message `unavailable`. Overall status stays `degraded`, so an uptime monitor still sees the fault.

No other confirmed exploit. Client-supplied `role: "system"` and `role: "assistant"` are accepted on the message-persist route. That route is what the web app uses to store a BYOK handoff, and device sync writes assistant rows. A second account still cannot read those rows.

## Remediation

| File                                    | Change                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/web/app/api/health/route.ts`      | Public capability messages are reduced to the two generic phrases.                                     |
| `apps/web/__tests__/api/health.test.ts` | Covers a queue sentence, an index sentence, a preserved generic message, and a dropped healthy detail. |

No migration and no environment change. The operator dashboard and the health-check module still have the specific sentence; only the public JSON dropped it.

## Remaining risk

- Local `TOTP_ENCRYPTION_KEY` is shorter than the key source requires. The process logs the error and continues. Encryption refuses the short key, so two-factor setup fails closed until the key is replaced with 64 hex characters. This audit did not rotate it.
- `IP_HASH_PEPPER` and `EMAIL_HASH_PEPPER` are unset locally. Production already refuses a new email pseudonym without the email pepper. Sign-in risk scoring that depends on a stable IP hash is not meaningful in this environment.
- `CLERK_AUTHORIZED_PARTIES` includes `http://localhost:3000` and does not include `http://127.0.0.1:3000`. A session whose authorized party is `127.0.0.1` is rejected and `/chat` sends the browser to the session-expired page. That is the allowlist working. Use `localhost` for local sign-in.
- `NEXT_PUBLIC_SANDBOX_ORIGIN` is unset. Artifact HTML falls back to a same-origin `srcdoc` frame without `allow-same-origin`.
- Conversation writes are limited to 60 a minute and fail open if the shared rate-limit store is down. Production requires that store. This engagement did not send a burst past 60.
- Social sign-in, transactional email, places, and bank connectors are off because their environment variables are unset. Those flows were not attacked.
