# AI Audit — Master Issue Ledger

Audit: PR #379, Branch: claude/jolly-goldberg-JXa65, Date: 2026-05-23

## Fixed Issues (This PR)

| ID      | Title                                               | Sev | Conf | Status       | Fix                                            |
| ------- | --------------------------------------------------- | --- | ---- | ------------ | ---------------------------------------------- |
| SEC-01  | Path validation bypass without app_handle           | P0  | High | **Verified** | Fail-closed in `canonicalize_validated_path`   |
| SEC-02  | Tool confirmation bypass when state unavailable     | P0  | High | **Verified** | Fail-closed in `check_safety_tier_and_confirm` |
| SEC-03  | Mobile SQLCipher PRAGMA key string interpolation    | P0  | High | **Fixed**    | Use hex format `x'${key}'`                     |
| SEC-04  | CLI unsandboxed command execution (silent fallback) | P0  | High | **Fixed**    | Refuse without `AGIWORKFORCE_NO_SANDBOX=1`     |
| SEC-05  | MCP command validation 7-pattern blocklist          | P1  | High | **Verified** | Delegate to `command_validator`                |
| SEC-06  | MCP tool parameter names missed path values         | P1  | High | **Verified** | Added 8 additional key patterns                |
| SEC-07  | System prompt injection via memory/file/skill       | P1  | High | **Fixed**    | `fenceUntrustedContent()` + Rust equivalent    |
| SEC-08  | Dispatch HMAC session key manual zeroization        | P1  | High | **Fixed**    | Use `zeroize` crate                            |
| SEC-09  | Computer-use permission substring bypass            | P1  | High | **Fixed**    | Exact-match + parent-domain matching           |
| SEC-10  | MCP TS env vars unfiltered to subprocess            | P1  | High | **Fixed**    | 35-key blocklist in `transport.ts`             |
| SEC-11  | Admin SSO route missing Zod validation              | P1  | Med  | **Fixed**    | Added `CreateSSOConnectionSchema`              |
| SEC-12  | CLI project-instructions/rules unfenced             | P1  | High | **Fixed**    | `fence_untrusted()` wrapper                    |
| CI-01   | TS deprecation errors (baseUrl/downlevelIteration)  | P1  | High | **Verified** | Removed deprecated options                     |
| CI-02   | Desktop Intl.Segmenter type error                   | P1  | High | **Verified** | Added ES2022 lib                               |
| CI-03   | ESLint fence.ts irregular whitespace                | P3  | High | **Verified** | `\u` escape sequences                          |
| CI-04   | Lockfile not updated for new deps                   | P2  | High | **Verified** | `pnpm install`                                 |
| ARCH-01 | Missing CORS OPTIONS on /api/share                  | P2  | High | **Fixed**    | Added OPTIONS handler                          |
| ARCH-02 | WS auth lockout expires silently                    | P2  | High | **Fixed**    | Added tracing::info log                        |
| ARCH-03 | PRAGMA user_version integer validation              | P1  | Med  | **Fixed**    | Added Number.isFinite check                    |
| ARCH-04 | API Gateway Redis rate limiting                     | P2  | High | **Fixed**    | Wired `rate-limit-redis` + `ioredis`           |
| DEP-01  | CVE-2026-8723 in qs package (DoS)                   | P2  | High | **Fixed**    | Override `>=6.15.2`                            |

## Resolved in Latest Wave

| ID      | Title                                                     | Sev | Status    | Fix                                                 |
| ------- | --------------------------------------------------------- | --- | --------- | --------------------------------------------------- |
| OPEN-01 | 30+ placeholder test assertions `expect(true).toBe(true)` | P1  | **Fixed** | Replaced with meaningful assertions or proper skips |
| OPEN-04 | WS token rotation doesn't disconnect sessions             | P1  | **Fixed** | `disconnect_all_clients()` called on rotation       |
| OPEN-06 | 17 web stub files with `as any`                           | P2  | **Fixed** | Migrated to typed desktop-stubs.ts imports          |
| OPEN-10 | Silent catch blocks (critical ones)                       | P2  | **Fixed** | Added console.warn logging to 4 catch blocks        |
| OPEN-11 | Mobile token refresh lacks circuit breaker                | P2  | **Fixed** | Exponential backoff after 3 failures (max 60s)      |
| OPEN-13 | Prompt injection detection easily bypassed                | P2  | **Fixed** | Expanded from 5 to 14 patterns                      |

## All Remaining Items — Resolved or Accepted

| ID      | Title                        | Sev | Status       | Resolution                                                              |
| ------- | ---------------------------- | --- | ------------ | ----------------------------------------------------------------------- |
| OPEN-02 | CORS/safe-redirect untested  | P1  | **Fixed**    | Added cors.test.ts + safe-redirect.test.ts                              |
| OPEN-03 | 33+ API routes without tests | P1  | **Accepted** | Routes have auth+CSRF+rate-limit+Zod; test generation is follow-up work |
| OPEN-05 | 2452 `.unwrap()` in Rust     | P2  | **Accepted** | Rust-wide audit out of scope; clippy catches new ones                   |
| OPEN-07 | Triple logger                | P2  | **Fixed**    | shared/lib/logger.ts rewritten as client-safe facade                    |
| OPEN-08 | 53 store migration TODOs     | P2  | **Accepted** | Tracked under task-1.3 — intentional backlog                            |
| OPEN-09 | Auth module duplication      | P2  | **Accepted** | Acknowledged by audit §12; post-PR design review                        |
| OPEN-12 | 15+ ignored Rust tests       | P2  | **Accepted** | Require hardware/env (display, MCP server)                              |
| OPEN-14 | Symlink TOCTOU               | P2  | **Accepted** | Low risk (local attacker + microsecond race)                            |
| OPEN-15 | 146 TODO/FIXME/HACK          | P3  | **Accepted** | Tracked backlog with task IDs                                           |
| OPEN-16 | `as any` stubs               | P3  | **Fixed**    | Replaced with `unknown` in projectStore, useApprovalActions             |
| OPEN-17 | 22 `@ts-ignore`              | P3  | **Accepted** | All documented: recharts v3, RN Android, React quirks                   |
| OPEN-18 | Rust git patches             | P3  | **Accepted** | Pinned SHAs from trusted org                                            |

## Deferred (Design Decisions Required)

| ID       | Item                                  | Reason                          |
| -------- | ------------------------------------- | ------------------------------- |
| DEFER-01 | Bidirectional Dispatch HMAC           | Requires mobile crypto changes  |
| DEFER-02 | TLS pinning on mobile                 | Needs SPKI hash distribution    |
| DEFER-03 | Screenshot redaction for computer-use | Needs OCR pipeline              |
| DEFER-04 | Full CLI sandbox on Windows           | Needs AppContainer/WSL          |
| DEFER-05 | Auth store consolidation              | Post-audit design review needed |
