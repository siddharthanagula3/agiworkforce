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

## Open Issues (Require Follow-Up)

| ID      | Title                                                     | Sev | Conf | Category      | Evidence                                                           |
| ------- | --------------------------------------------------------- | --- | ---- | ------------- | ------------------------------------------------------------------ |
| OPEN-01 | 30+ placeholder test assertions `expect(true).toBe(true)` | P1  | High | Test quality  | settingsStore.features.test.ts, windows.spec.ts, analytics.test.ts |
| OPEN-02 | CSRF/CORS/safe-redirect functions untested                | P1  | High | Test coverage | No test files for apps/web/lib/csrf.ts, cors.ts, safe-redirect.ts  |
| OPEN-03 | 33+ API routes without test coverage                      | P1  | High | Test coverage | Only 7/40+ routes have tests                                       |
| OPEN-04 | WS token rotation doesn't disconnect sessions             | P1  | Med  | Security      | websocket_server.rs comment confirms                               |
| OPEN-05 | 2452 `.unwrap()` calls in production Rust                 | P2  | High | Robustness    | Potential panics on unexpected input                               |
| OPEN-06 | 17 web stub files with `as any`                           | P2  | High | AI slop       | tokenCount.ts, clipboard.ts, security.ts, etc.                     |
| OPEN-07 | Triple logger implementation                              | P2  | Med  | Architecture  | utils/logger, web/lib/logger, web/shared/lib/logger                |
| OPEN-08 | 53 identical store migration TODOs                        | P2  | High | Tech debt     | All desktop stores have TODO(task-1.3)                             |
| OPEN-09 | Auth module duplication (auth.ts + authOrchestrator.ts)   | P2  | High | Architecture  | 501 + 1492 LOC, separate caches, race risk                         |
| OPEN-10 | Silent catch blocks (~20+)                                | P2  | Med  | Observability | `.catch(() => {})` across desktop and web                          |
| OPEN-11 | Mobile token refresh lacks circuit breaker                | P2  | Med  | Robustness    | api.ts:54-84 retries without backoff                               |
| OPEN-12 | 15+ ignored Rust integration tests                        | P2  | Med  | Test coverage | `#[ignore]` in automation/input, uia, mcp tests                    |
| OPEN-13 | Prompt injection detection easily bypassed                | P2  | Med  | Security      | Only 5 regex patterns                                              |
| OPEN-14 | Desktop symlink TOCTOU in path validation                 | P2  | Low  | Security      | Between canonicalize and file use                                  |
| OPEN-15 | 146 TODO/FIXME/HACK markers                               | P3  | High | Tech debt     | Across apps/packages/services                                      |
| OPEN-16 | 147 `as any` TypeScript escape hatches                    | P3  | High | Type safety   | Across codebase                                                    |
| OPEN-17 | 22 `@ts-ignore`/`@ts-expect-error`                        | P3  | High | Type safety   | Mostly library quirks                                              |
| OPEN-18 | Rust git patches (openai-oss-forks)                       | P3  | Med  | Supply chain  | tokio-tungstenite, tungstenite pinned SHAs                         |

## Deferred (Design Decisions Required)

| ID       | Item                                  | Reason                          |
| -------- | ------------------------------------- | ------------------------------- |
| DEFER-01 | Bidirectional Dispatch HMAC           | Requires mobile crypto changes  |
| DEFER-02 | TLS pinning on mobile                 | Needs SPKI hash distribution    |
| DEFER-03 | Screenshot redaction for computer-use | Needs OCR pipeline              |
| DEFER-04 | Full CLI sandbox on Windows           | Needs AppContainer/WSL          |
| DEFER-05 | Auth store consolidation              | Post-audit design review needed |
