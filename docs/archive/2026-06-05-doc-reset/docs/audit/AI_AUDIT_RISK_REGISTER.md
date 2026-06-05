# AI Audit — Risk Register

## P0 Critical Risks

| ID   | Risk                                                | Status               | Evidence                                                          |
| ---- | --------------------------------------------------- | -------------------- | ----------------------------------------------------------------- |
| P0-1 | Path validation bypass without app_handle           | **FIXED** (commit 1) | `tool_executor/mod.rs:676` returned `Ok(path)` without validation |
| P0-2 | Tool confirmation bypass when state unavailable     | **FIXED** (commit 1) | `tool_executor/mod.rs:1834-1841` returned `Ok(())` silently       |
| P0-3 | Mobile SQLCipher PRAGMA key string interpolation    | **FIXED** (commit 4) | `storage/db.ts:89` used `'${key}'` instead of `x'${key}'`         |
| P0-4 | CLI unsandboxed command execution (silent fallback) | **FIXED** (commit 2) | `bash.rs:92-114` fell back to `sh -c` without warning             |

## P1 High Risks

| ID    | Risk                                            | Status               | Evidence                                                            |
| ----- | ----------------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| P1-1  | MCP command validation used 7-pattern blocklist | **FIXED** (commit 1) | `tool_guard.rs:1157-1168` missed reverse shells, encoded PowerShell |
| P1-2  | MCP tool parameter names missed path values     | **FIXED** (commit 1) | `tool_guard.rs:1134` only checked 5 key names                       |
| P1-3  | System prompt injection via memory/file/skill   | **FIXED** (commit 2) | `chat/index.tsx:1012-1072` concatenated without fencing             |
| P1-4  | Dispatch HMAC session key manual zeroization    | **FIXED** (commit 4) | `dispatch_hmac.rs:167-173` used optimizable for-loop                |
| P1-5  | Computer-use permission substring bypass        | **FIXED** (commit 4) | `app_permissions.rs:92-106` used `.contains()`                      |
| P1-6  | MCP TS env vars unfiltered to subprocess        | **FIXED** (commit 2) | `transport.ts:23-31` passed env directly                            |
| P1-7  | Admin SSO route missing Zod validation          | **FIXED** (commit 4) | `sso/route.ts:242` used `as` type assertion                         |
| P1-8  | TS deprecation errors breaking CI               | **FIXED** (commit 7) | `tsconfig.base.json` had stale `ignoreDeprecations: "5.0"`          |
| P1-9  | Desktop Intl.Segmenter type error               | **FIXED** (commit 7) | `desktop/tsconfig.json` inherited ES2021 lib, needed ES2022         |
| P1-10 | 30+ placeholder test assertions                 | **OPEN**             | `expect(true).toBe(true)` across desktop, mobile, providers         |
| P1-11 | CSRF/CORS/safe-redirect functions untested      | **OPEN**             | No test files found for web security utilities                      |
| P1-12 | 33+ API routes without test coverage            | **OPEN**             | Only 7/40+ routes have tests                                        |
| P1-13 | WS token rotation doesn't disconnect sessions   | **OPEN**             | `websocket_server.rs` comment confirms this                         |
| P1-14 | 2452 `.unwrap()` calls in production Rust       | **OPEN**             | Potential panics on unexpected input                                |

## P2 Medium Risks

| ID   | Risk                                         | Status                   | Evidence                                        |
| ---- | -------------------------------------------- | ------------------------ | ----------------------------------------------- |
| P2-1 | In-memory rate limiting per-instance only    | **MITIGATED** (commit 2) | Redis wired up but optional                     |
| P2-2 | WS auth lockout expires silently             | **FIXED** (commit 4)     | Added logging for lockout expiry                |
| P2-3 | Missing CORS OPTIONS on /api/share           | **FIXED** (commit 3)     | Added OPTIONS handler                           |
| P2-4 | Mobile token refresh lacks circuit breaker   | **OPEN**                 | `api.ts:54-84` retries without backoff          |
| P2-5 | Prompt injection detection easily bypassed   | **OPEN**                 | Only 5 regex patterns in `chat/index.tsx:18-34` |
| P2-6 | 146 TODO/FIXME/HACK markers                  | **OPEN**                 | Potential incomplete implementations            |
| P2-7 | 147 `as any` TypeScript escape hatches       | **OPEN**                 | Type safety gaps                                |
| P2-8 | Desktop symlink TOCTOU in path validation    | **OPEN**                 | Between canonicalize and use                    |
| P2-9 | Case-insensitive filesystem blacklist bypass | **OPEN**                 | `.ssh` vs `.SSH` on macOS HFS+                  |

## P3 Low Risks

| ID   | Risk                                 | Status               | Evidence                          |
| ---- | ------------------------------------ | -------------------- | --------------------------------- |
| P3-1 | ESLint fence.ts irregular whitespace | **FIXED** (commit 7) | Used `\u` escape sequences        |
| P3-2 | Stale tsconfig comments              | **FIXED** (commit 7) | Removed outdated FIX-017 comments |
| P3-3 | Unused pnpm-lock.yaml entries        | **FIXED** (commit 7) | Updated lockfile                  |

## Deferred Items (Require Design Decisions)

| ID  | Item                                  | Reason                                |
| --- | ------------------------------------- | ------------------------------------- |
| D-1 | Bidirectional Dispatch HMAC           | Requires mobile crypto changes        |
| D-2 | TLS pinning enforcement on mobile     | Needs SPKI hash distribution infra    |
| D-3 | Screenshot redaction for computer-use | Needs OCR pipeline design             |
| D-4 | Full CLI sandbox on Windows           | Needs AppContainer or WSL integration |
