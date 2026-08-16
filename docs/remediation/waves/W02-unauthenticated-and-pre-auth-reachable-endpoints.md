# W2 — Unauthenticated and pre-auth reachable endpoints

[← all waves](../WAVES.md) · [register index](../README.md)

**Why now.** These are the paths a party with no account can hit, plus the checks that decide whether a request is authenticated at all. The local /pair endpoint hands out its own authorization token and can be crashed by a non-char-boundary slice; the gateway WebSocket skips revocation and the account kill switch; ACCOUNT_STATUS_FAIL_OPEN admits banned accounts (filed twice, SEC-10 and DPDP-35, so they must be fixed as one change); Clerk verification omits authorizedParties; the cron secret compares non-constant-time; the api-gateway defaults to localhost CORS with credentials. The computer-use permission gate and the voice controller's auto-grant are default-open consent gates on the same authorization boundary (SEC-59 and DESK-08 are the same defect). SEC-04/DOCS-13 sit here because a live public page tells users nothing leaves the device while the extension posts whole conversations to the cloud — a trust-boundary misstatement that must not survive another day. Nearly all are S/M and touch auth middleware, the gateway, and the desktop pairing server, so one loaded context covers them.

**Size.** 25 items (2 critical, 9 high, 11 medium, 3 low); 22 open.

**Done when.** A single fail-closed account-status/revocation helper is used by the HTTP and WebSocket paths and the fail-open env var is removed (or documented, validated and default-off); a test proves a revoked JWT and a suspended account are rejected on both. /pair requires an out-of-band local secret before installing a native-messaging manifest and survives a fuzz corpus of multi-byte and truncated bodies without aborting. Clerk verification passes authorizedParties; cron secret uses timingSafeEqual; api-gateway CORS origin comes from env with credentials rejected on localhost defaults in production, and sslmode=require is set. Middleware redirect target is rebuilt from a parsed URL and a protocol-relative path test returns 400/relative-only. Surface classification is read from a signed JWT claim, not a header; an API key with the inference scope succeeds through RLS and a real failure surfaces as 403 not 503. Computer-use gate resolves the foreground app or denies; voice controller shows the consent dialog. The /chrome-extension page text matches observed extension network behaviour, verified against a captured request.

| ID                    | Sev      | Item                                                                                                                                                           | Effort |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [DOCS-13](#docs-13)   | CRITICAL | The /chrome-extension page tells users no inference happens in Chrome while the extension posts conversations to the cloud gateway                             | S      |
| [SEC-04](#sec-04)     | CRITICAL | /chrome-extension page states inference and keys never leave Desktop while the extension POSTs whole conversations to the cloud gateway                        | M      |
| [DESK-08](#desk-08)   | HIGH     | Computer-use permission gate cannot resolve the live foreground app, so most apps default to allow                                                             | L      |
| [SEC-09](#sec-09)     | HIGH     | Gateway WebSocket authentication skips the JWT revocation table and the account_status kill switch                                                             | S      |
| [SEC-10](#sec-10)     | HIGH     | ACCOUNT_STATUS_FAIL_OPEN admits suspended and banned accounts when the status lookup fails, and is invisible to env validation                                 | S      |
| [SEC-11](#sec-11)     | HIGH     | Native-messaging manifest install on POST /pair is authorized by a token the same unauthenticated endpoint hands out                                           | S      |
| [SEC-44](#sec-44)     | HIGH     | API keys minted with a 'Run inference' scope are rejected by the RLS layer and the failure is masked as a 503 billing outage                                   | M      |
| [SEC-59](#sec-59)     | HIGH     | Computer-use permission gate cannot resolve the foreground application, so unconfigured apps default to allow                                                  | M      |
| [SEC-72](#sec-72)     | HIGH     | /tasks is missing from the proxy protected-route matcher, so a signed-out visitor is served full authenticated app chrome instead of being redirected to login | S      |
| [SEC-87](#sec-87)     | HIGH     | Remote-control access is granted as ephemeral session keys, not revocable per-device grants                                                                    | XL     |
| [WEB-33](#web-33)     | HIGH     | /tasks renders full authenticated chrome to signed-out visitors — route missing from the proxy auth matcher                                                    | S      |
| [INFRA-52](#infra-52) | MEDIUM   | Two parallel device-pairing auth flows with near-homograph routes and separate validation logic                                                                | M      |
| [SEC-12](#sec-12)     | MEDIUM   | Unauthenticated local HTTP POST /pair aborts the desktop app via a non-char-boundary string slice                                                              | S      |
| [SEC-13](#sec-13)     | MEDIUM   | Remote search-result content is byte-sliced at a fixed offset, aborting the desktop app on multi-byte text                                                     | S      |
| [SEC-27](#sec-27)     | MEDIUM   | Middleware api-host bounce builds its redirect target from the raw request path, allowing a protocol-relative open redirect                                    | S      |
| [SEC-43](#sec-43)     | MEDIUM   | Web chat-completions classifies the client surface by an advisory, spoofable header rather than a signed JWT claim                                             | M      |
| [SEC-45](#sec-45)     | MEDIUM   | Clerk JWT verification omits authorizedParties                                                                                                                 | S      |
| [SEC-47](#sec-47)     | MEDIUM   | api-gateway hardening gaps: CORS defaults to localhost with credentials:true and no env guard, no sslmode=require, rate limiting fails open to in-memory       | M      |
| [SEC-60](#sec-60)     | MEDIUM   | Desktop voice controller auto-grants computer-use consent flags instead of showing the consent dialog                                                          | S      |
| [SEC-61](#sec-61)     | MEDIUM   | No task-time BYOK consent ceremony for cloud vision picks from a Local workspace, leaving computer use restricted by workaround                                | M      |
| [SEC-66](#sec-66)     | MEDIUM   | Reauthentication mid-turn does not stop before unauthorized side effects or resume the interrupted work                                                        | M      |
| [SEC-73](#sec-73)     | MEDIUM   | Two parallel device-pairing authentication flows exist on near-homograph routes with separately implemented code-format validation                             | M      |
| [SEC-46](#sec-46)     | LOW      | Cron bearer secret is compared non-constant-time                                                                                                               | S      |
| [SEC-62](#sec-62)     | LOW      | Chrome extension REPLAY_SHORTCUT remains reachable from any allowlisted tab pending security review                                                            | S      |
| [SEC-64](#sec-64)     | LOW      | CAPTCHA/bot protection on Clerk-gated sign-up is unverified in either direction                                                                                | S      |

---

### DOCS-13 — The /chrome-extension page tells users no inference happens in Chrome while the extension posts conversations to the cloud gateway

`CRITICAL` · docs · effort S

**What.** phase4 PP-15 (NOT_SUPPORTED), VERIFIED still present: the page's BOUNDARY_LEDGER states 'Inference in Chrome: None. Execution happens on Desktop' and the body says 'AGI in Chrome never runs models and never stores provider keys', while apps/extension/src/features/computer-use/cloudAgentClient.ts:75 sets DEFAULT_GATEWAY_BASE='https://api.agiworkforce.com' and callCloud POSTs the full conversation — including unredactable screenshots — directly to that gateway with the user's Managed Cloud JWT. /agent-permissions already states the truth, so two company pages give opposite answers to the single question that matters for consent. Primary home is docs accuracy because the defect is the published claim; the consent and trust-boundary consequence overlaps the security and compliance slices, and CLAUDE.md's trust-boundary rules make a false boundary statement a first-order violation.

**Done when.** The Chrome page states the real data flow — conversations and screenshots leave the browser for the managed gateway — so a user's consent decision is based on what the extension does.

**Where.** `apps/web/app/chrome-extension/page.tsx:72,130`, `apps/extension/src/features/computer-use/cloudAgentClient.ts:75,327-345`

**From.** phase4-capability-audit.md

### SEC-04 — /chrome-extension page states inference and keys never leave Desktop while the extension POSTs whole conversations to the cloud gateway

`CRITICAL` · security · effort M

**What.** phase4 PP-15 (NOT_SUPPORTED, verified still present): the page's BOUNDARY_LEDGER states 'Inference in Chrome: None. Execution happens on Desktop' and the body says 'AGI in Chrome never runs models and never stores provider keys.' In fact `cloudAgentClient.ts` sets DEFAULT_GATEWAY_BASE='https://api.agiworkforce.com' and `callCloud` POSTs the conversation — including unredactable screenshots — directly to /api/llm/v1/chat/completions with the user's Managed Cloud JWT. /agent-permissions already states the truth, so two first-party pages give opposite answers to the single question that determines informed consent for a browser extension with page access. This is a trust-boundary disclosure defect, not a copy nit: users grant extension permissions on the strength of the false claim.

**Done when.** The /chrome-extension boundary ledger is rewritten to state what the extension actually transmits (full conversation content and screenshots to the managed cloud gateway under the user's token), matching /agent-permissions, and a test pins the two pages against the same generated boundary source so they cannot diverge again.

**Where.** `apps/web/app/chrome-extension/page.tsx:72,130`, `apps/extension/src/features/computer-use/cloudAgentClient.ts:75,327-345`, `apps/web/app/agent-permissions/page.tsx`

**From.** phase4-capability-audit.md (PP-15)

### DESK-08 — Computer-use permission gate cannot resolve the live foreground app, so most apps default to allow

`HIGH` · desktop · effort L

**What.** Platform window detection is unbuilt, so the safety gate never calls app_permissions.decide against the actual foreground window. It blocks explicit denials and deny-listed apps but defaults to allow for every unconfigured app — i.e. there is no per-action gating for most apps. Related: the desktop voice controller sets consentAccepted and computerUseEnabled to true automatically instead of showing ComputerUseConsentDialog (rated PLAUSIBLE, Rust-side enforcement not verified). A separate open follow-up records that there is no task-time BYOK consent flow for cloud vision picks from a Local workspace, so Local-mode computer use stays restricted to local models by design.

**Done when.** Implement foreground-window resolution per platform and make the gate fail closed for unconfigured apps; remove the voice-path auto-consent so the standing consent dialog is the only grant path; build the fork-ceremony consent flow that would lift the Local-mode restriction.

**Where.** `apps/desktop/src-tauri/src/automation/computer_use/anthropic_agent.rs`, `apps/desktop/src-tauri/src/automation/computer_use/window_manager.rs`, `apps/desktop/src/features/voice/useCloudVoiceController.ts:286-287,293`

**From.** docs/agent-context/known-flaws.md (DESKTOP-COMPUTER-USE-FOREGROUND-GATE-01, COMPUTERUSE-BYOK-TASK-CONSENT); docs/agent-context/phase4-capability-audit.md (PP-15)

**Folded in.** Desktop voice controller auto-flips computer-use consent flags instead of showing the consent dialog; COMPUTERUSE-BYOK-TASK-CONSENT: no task-time BYOK consent flow for cloud vision picks from a Local workspace

### SEC-09 — Gateway WebSocket authentication skips the JWT revocation table and the account_status kill switch

`HIGH` · security/auth · effort S

**What.** F5 (2/3 panel, MEDIUM): `handleAuthMessage` accepts the attacker-supplied `message.token` from an unauthenticated /ws frame on signature validity alone. Unlike `authenticateToken` on the HTTP path, it never queries `revoked_jwts` for the token's `jti` and never reads `profiles.account_status`. So explicit sign-out (POST /api/auth/logout, which writes revoked_jwts and evicts the cache) and the P0 account-suspension kill switch have no effect on the WebSocket surface: a stolen or revoked 7-day device token, or a token belonging to a banned account, keeps a live socket that receives every command/sync payload broadcast among the victim's devices and queued desktop commands, and can inject chat/automation/query commands the victim's desktop executes.

**Done when.** WebSocket authentication runs the same verification as HTTP — after jwt.verify it looks up payload.jti in revoked_jwts and checks profiles.account_status, closing the socket on revocation, non-active status or DB error; long-lived sockets re-check periodically or on a revocation signal, and /auth/logout closes existing sockets for that userId.

**Where.** `services/api-gateway/src/websocket.ts:439,585`, `services/api-gateway/src/middleware/auth.ts:165-249`

**From.** CLAUDE-SECURITY-RESULTS.md (F5)

### SEC-10 — ACCOUNT_STATUS_FAIL_OPEN admits suspended and banned accounts when the status lookup fails, and is invisible to env validation

`HIGH` · security/auth · effort S

**What.** DPDP_PROGRESS O-19a (verified still present): api-auth.ts reads ACCOUNT_STATUS_FAIL_OPEN and allows the request when the account-status lookup errors, so the suspension kill switch silently stops working on any DB blip. Grep of scripts/env-doctor.mjs and apps/web/lib/validate-env.ts confirms zero references to the variable in either, so a deploy left with the escape hatch on gives no boot-time signal at all. DPDP names this one of the two O-19 items worth doing first. Pairs with SEC-09: two independent paths where suspension does not suspend.

**Done when.** The account-status check fails closed on lookup error; if an escape hatch is retained it is declared in the env contract and surfaced by env-doctor/validate-env as a loud non-default, and an alert fires whenever it is enabled in production.

**Where.** `apps/web/lib/api-auth.ts:81-90`, `apps/web/lib/validate-env.ts`, `scripts/env-doctor.mjs`

**From.** DPDP_PROGRESS.md (O-19a); DPDP_PROGRESS.md O-19a

**Folded in.** O-19a ACCOUNT_STATUS_FAIL_OPEN env escape hatch; ACCOUNT_STATUS_FAIL_OPEN admits suspended and banned accounts on lookup failure and is invisible to environment validation

### SEC-11 — Native-messaging manifest install on POST /pair is authorized by a token the same unauthenticated endpoint hands out

`HIGH` · security/auth · effort S

**What.** F6 (3/3 panel, MEDIUM): `handle_http_pair` gates the privileged `install_manifests(Some(extension_id))` write behind an X-Bridge-Token that must equal the stored pair token — but the same endpoint issues and rotates that token to any unauthenticated caller when the body carries no `extensionId`. The credential is self-authorizing, so a two-step bootstrap works: POST /pair empty to mint a token, then POST /pair with that token and the attacker's own extension id to write a manifest whose allowed_origins includes `chrome-extension://<attacker id>/`. The extension then `connectNative`s to the AGI native host, which reads `.ipc_token` and authenticates to the desktop bridge on its behalf — handing it Navigate, GetCookies, GetPageContent and Screenshot. This defeats the exact control that exists to stop a local page or process from adding an attacker extension id.

**Done when.** Token issuance for a new extension id is never self-authorizing: any request carrying extensionId requires an out-of-band secret (.ipc_token or a code shown in the desktop UI), or explicit in-app user consent per extension id before install_manifests is called.

**Where.** `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs:588,604`, `apps/desktop/src-tauri/src/lib.rs:1077`

**From.** CLAUDE-SECURITY-RESULTS.md (F6)

### SEC-44 — API keys minted with a 'Run inference' scope are rejected by the RLS layer and the failure is masked as a 503 billing outage

`HIGH` · security/auth · effort M

**What.** phase4 PP-29 (verified still present): getUserScopedDb explicitly rejects sk*live*/sk*test* bearer tokens at rls-db.ts:95 because they carry no signed sub claim for RLS. The rejection is caught inside the managed-usage-reservation try/catch and mapped to a generic 503 'Managed usage billing is temporarily unavailable.' So the product mints a key, names 'Run inference' on the checkbox that creates it, then rejects that exact credential on the documented quick-start curl — and reports the auth failure as a platform outage. Two defects in one: an auth path that cannot work as advertised, and an error-mapping layer that hides an authorization failure behind a false availability claim.

Also recorded by a later audit (PP-29: API key with 'Run inference' scope does not behave as scoped): PP-29 (docs/agent-context/HANDOFF.md §4, from phase4-capability-audit.md) independently reproduces SEC-44 from the user-facing side — a key minted with the 'Run inference' scope does not behave as scoped. Adds the remediation requirement: add a regression test that fails without the fix, since the failure currently surfaces masked as a 503 billing outage.

**Done when.** API-key principals resolve to an RLS-usable identity (a scoped role or a derived signed claim) so a key with the inference scope can call the documented endpoints, and authorization failures surface as 401/403 with a scope-specific reason instead of being folded into the billing 503 branch.

**Where.** `apps/web/lib/server/rls-db.ts:95`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1426,2625,2645-2655`, `apps/web/lib/api-key-scopes.ts:15-19`

**From.** phase4-capability-audit.md (PP-29); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

### SEC-59 — Computer-use permission gate cannot resolve the foreground application, so unconfigured apps default to allow

`HIGH` · security · effort M

**What.** known-flaws DESKTOP-COMPUTER-USE-FOREGROUND-GATE-01: platform window detection is unbuilt, so the safety gate never calls app_permissions.decide against the actual foreground window. It blocks explicit denials and deny-listed apps but defaults to allow for unconfigured apps — meaning there is no per-action gating for most applications on the surface that drives the user's real mouse and keyboard. known-flaws DESKTOP-LINUX-PLATFORM-GAP-01 records that the only real X11 integration is an xdotool shell-out used solely by this gate, so computer-use is hard-blocked on Linux while defaulting permissive elsewhere.

**Done when.** Foreground-window resolution is implemented per platform and the gate fails closed — an app whose identity cannot be resolved is denied rather than allowed — with the allow decision recorded per action.

**Where.** `apps/desktop/src-tauri/src/automation/computer_use/anthropic_agent.rs`, `apps/desktop/src-tauri/src/automation/computer_use/window_manager.rs`

**From.** known-flaws.md (DESKTOP-COMPUTER-USE-FOREGROUND-GATE-01, DESKTOP-LINUX-PLATFORM-GAP-01)

### SEC-72 — /tasks is missing from the proxy protected-route matcher, so a signed-out visitor is served full authenticated app chrome instead of being redirected to login

`HIGH` · security/auth · effort S

**What.** AGENTIC-WORK-002, duplicate filing SHELL-NAV-IA-001 (audit/parity-2026-08-15). apps/web/proxy.ts's isProtectedAppRoute lists /chat, /library, /schedules, /settings, /billing, /admin but omits /tasks; app/tasks/page.tsx performs no auth check of its own and unconditionally renders WebAppShell + TasksPage. A live route sweep confirmed an unauthenticated visit renders signed-in nav chrome stuck on a 'Loading account…' placeholder rather than redirecting.

**Done when.** Add '/tasks(.\*)' to isProtectedAppRoute and add a regression test asserting a 302 to /login?redirectTo=%2Ftasks.

**Where.** `apps/web/proxy.ts:145-152,232`, `apps/web/app/tasks/page.tsx:1-18`

**From.** audit/parity-2026-08-15/gaps/domain-agentic-work (AGENTIC-WORK-002); audit/parity-2026-08-15/gaps/domain-shell-nav-ia (SHELL-NAV-IA-001)

**Folded in.** AGENTIC-WORK-002; SHELL-NAV-IA-001

### SEC-87 — Remote-control access is granted as ephemeral session keys, not revocable per-device grants

`HIGH` · security/auth · effort XL

**What.** MS-18 (docs/current/parity-implementation-matrix.md, 2026-08-01 founder scope decisions): 'Requires promoting session keys to revocable device grants.' Founder-approved but unbuilt; the frontend-experience-contract's Remote control row records the host relay as missing on CLI/VS Code and the companion UI unmounted on Desktop, so no device-grant lifecycle (issue, list, revoke, expire) exists anywhere. Distinct from SEC-16 (dispatch control-frame HMAC key derived from relay-visible material) and DESK-51 (single-session ephemeral pairing declined by design for the mobile companion).

**Done when.** Define a device-grant record (identity, scope, issued-at, expiry, revocation) as part of the host-relay contract before any remote developer-session control ships, and expose list/revoke in settings.

**Blocked by.** MS-3: no host-relay/remote-control contract exists yet

**From.** docs/current/parity-implementation-matrix.md#2026-08-01 Founder Scope Decisions (MS-18); docs/current/frontend-experience-contract.md §13 Remote control row

### WEB-33 — /tasks renders full authenticated chrome to signed-out visitors — route missing from the proxy auth matcher

`HIGH` · web · effort S

**What.** AGENTIC-WORK-002 (also filed SHELL-NAV-IA-001): proxy.ts's isProtectedAppRoute lists /chat, /library, /schedules, /settings, /billing, /admin but omits /tasks; app/tasks/page.tsx does no auth check and unconditionally renders WebAppShell + TasksPage. A live route sweep confirmed an unauthenticated visit renders signed-in nav chrome stuck on 'Loading account…' instead of redirecting.

**Done when.** Add '/tasks(.\*)' to isProtectedAppRoute and add a regression test asserting a 302 to /login?redirectTo=%2Ftasks.

**Where.** `apps/web/proxy.ts:145-152,232`, `apps/web/app/tasks/page.tsx:1-18`

**From.** audit/parity-2026-08-15 GapMatrix P0/P1 — AGENTIC-WORK-002 / SHELL-NAV-IA-001

### INFRA-52 — Two parallel device-pairing auth flows with near-homograph routes and separate validation logic

`MEDIUM` · infra/ci · effort M · **unclear**

**What.** BACKEND-RUNTIME-004. auth/device/{code,approve,token,refresh} implements the RFC 8628 CLI device-code flow; device/{link,poll,approve} implements a separate QR-code linking system with its own regex, table and crypto module (0077_gateway_compatibility_tables.sql:64). Not proven broken today — flagged in the audit brief as requiring verification and confirmed to exist as described, with no functional defect confirmed — but the device/_ vs auth/device/_ near-collision plus duplicated code-format validation is a live footgun.

**Done when.** Consolidate code-format validation into one shared regex/constant module used by both flows as low-risk hardening, and rename the QR flow's routes to remove the near-collision.

**Where.** `apps/web/app/api/auth/device/`, `apps/web/app/api/device/`, `apps/web/db/neon/0077_gateway_compatibility_tables.sql:64`

**From.** audit/parity-2026-08-15/gaps/domain-backend-runtime.json BACKEND-RUNTIME-004

### SEC-12 — Unauthenticated local HTTP POST /pair aborts the desktop app via a non-char-boundary string slice

`MEDIUM` · security · effort S

**What.** F7 (3/3 panel, MEDIUM): `parse_pair_extension_id` takes `content_length` verbatim from the attacker's Content-Length header and uses it as a byte index into a &str body from the same request; if that index splits a multi-byte UTF-8 codepoint the slice panics, and the workspace release profile sets `panic = "abort"`, killing the whole Tauri process. `Content-Length: 1` followed by a two-byte character is enough. Any local process — and any Chrome or VS Code extension origin, which `is_origin_allowed` accepts unconditionally — can crash the app on demand, terminating in-flight agent runs, with no token, pairing or user interaction.

**Done when.** The pairing request is parsed against the raw byte slice rather than a &str, content_length above a small maximum is rejected, and `body.is_char_boundary(content_length)` is checked before any sub-slice is taken.

**Where.** `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs:101`, `apps/desktop/src-tauri/Cargo.toml:65`

**From.** CLAUDE-SECURITY-RESULTS.md (F7)

### SEC-13 — Remote search-result content is byte-sliced at a fixed offset, aborting the desktop app on multi-byte text

`MEDIUM` · security · effort S

**What.** F8 (3/3 panel, MEDIUM): `truncate_content` indexes the `snippet`/`content` field of a remote search API result at byte 497 with no char-boundary check, and the release profile's `panic = "abort"` turns the resulting panic into a full process kill. Any published or SEO-boosted page whose snippet exceeds 500 bytes with byte 497 mid-codepoint crashes the app and destroys the running research session; non-English results (CJK, Cyrillic, emoji) trigger it accidentally roughly two times in three, so it is also a routine availability bug. The repo already has the correct helper. The sibling `truncate_title` has the same defect.

**Done when.** Both truncate_content and truncate_title use the existing `crate::core::agi::floor_char_boundary(content, max_len - 3)` instead of a raw byte index.

**Where.** `apps/desktop/src-tauri/src/core/research/orchestrator.rs:1003`, `apps/desktop/src-tauri/src/core/research/report.rs:456`, `apps/desktop/src-tauri/src/core/agi/mod.rs:104`

**From.** CLAUDE-SECURITY-RESULTS.md (F8)

### SEC-27 — Middleware api-host bounce builds its redirect target from the raw request path, allowing a protocol-relative open redirect

`MEDIUM` · security · effort S

**What.** F20 (2/3 panel, MEDIUM): apiHostRedirect concatenates request.nextUrl.pathname and passes it to new URL(relative, base). A path beginning with `//` is scheme-relative, so `https://api.agiworkforce.com//attacker-phish.example/login` resolves to `https://attacker-phish.example/login` and is emitted verbatim as the Location of a 307 by NextResponse.redirect. That lends the first-party domain to phishing and can be chained into OAuth/return-URL flows that trust redirects originating from the product's own hostname. The scan notes one unverified precondition: whether the upstream edge collapses duplicate leading slashes before the Next.js proxy runs was not tested, since no request was issued.

**Done when.** The path is normalized before resolution (collapse leading slashes) and the target is constructed from guaranteed-relative values via target.pathname/target.search, with an assertion that target.host === appHost before the redirect is returned so any future change fails closed.

**Where.** `apps/web/proxy.ts:225`

**From.** CLAUDE-SECURITY-RESULTS.md (F20)

### SEC-43 — Web chat-completions classifies the client surface by an advisory, spoofable header rather than a signed JWT claim

`MEDIUM` · security/auth · effort M

**What.** known-flaws DEV-SURFACE-WEB-CLAIM-01 (P1 residual): after DEV-SURFACE-ENTITLEMENT-BYPASS-01 was closed at the device-token exploit vector, the web chat-completions route still classifies Clerk-token clients by the `x-agi-surface` / `x-client` header, which is advisory and spoofable in principle. Surface classification drives entitlement and capability decisions, so the durable fix is a signed surface claim in the Clerk JWT template. Related: MATCH-001 shows the surface vocabulary itself is inconsistent (a TS-permitted 'cli' value the SQL enum rejects), so hardening this also needs one canonical surface schema.

**Done when.** Surface is carried as a signed claim in the Clerk JWT template and read from the verified token; the advisory header is ignored for any entitlement or capability decision, and one canonical surface enum is shared by the TS contract and the SQL constraint.

**Where.** `apps/web/app/api/llm/v1/chat/completions`

**From.** known-flaws.md (DEV-SURFACE-WEB-CLAIM-01); AuditRemediationLedger.md (MATCH-001)

### SEC-45 — Clerk JWT verification omits authorizedParties

`MEDIUM` · security/auth · effort S

**What.** DPDP_PROGRESS §6 (fail-open/verification gap table): api-auth.ts:110 verifies the Clerk token without passing authorizedParties, so a token minted for a different authorized party on the same Clerk instance is not rejected on azp grounds. Listed alongside the other untriaged O-19 items, none of which were fixed on the compliance branch because each has its own blast radius.

**Done when.** Clerk token verification passes an explicit authorizedParties list matching the deployment's own origins, and a test asserts a token with a foreign azp is refused.

**Where.** `apps/web/lib/api-auth.ts:110`

**From.** DPDP_PROGRESS.md (§6)

### SEC-47 — api-gateway hardening gaps: CORS defaults to localhost with credentials:true and no env guard, no sslmode=require, rate limiting fails open to in-memory

`MEDIUM` · security · effort M

**What.** DPDP_PROGRESS §6 (three rows in the fail-open and transport tables): app.ts:49-90 sets a CORS default of localhost with credentials:true and no NODE_ENV guard, so a misconfigured production deploy accepts credentialed cross-origin requests from a development origin; neonClients.ts:562-569 does not enforce sslmode=require in code, leaving transport security to configuration; and rateLimit.ts:60-99 falls open to an in-memory limiter when Redis is absent, so a shared multi-instance deployment silently loses its rate limit. ExecutionPlan #27 fixed the flat/tier-blind limit and the RATE_LIMIT_REDIS_URL fallback on the web side; the gateway's fail-open path is a separate module and remains. None were fixed on the compliance branch.

**Done when.** The gateway's CORS origin list is required in production with no localhost default and no credentials on a wildcard, Postgres connections assert sslmode=require in code, and the rate limiter fails closed (or degrades to a documented conservative fixed limit with an alert) when Redis is unavailable.

**Where.** `services/api-gateway/src/app.ts:49-90`, `services/api-gateway/src/lib/neonClients.ts:562-569`, `services/api-gateway/src/middleware/rateLimit.ts:60-99`

**From.** DPDP_PROGRESS.md (§6); ExecutionPlan.md (#27)

**Folded in.** api-gateway rate limiting fail-open to in-memory (DPDP §6); No sslmode=require enforcement in code (DPDP §6)

### SEC-60 — Desktop voice controller auto-grants computer-use consent flags instead of showing the consent dialog

`MEDIUM` · security · effort S

**What.** phase4 PP-15: useCloudVoiceController.ts:286-287 sets consentAccepted and computerUseEnabled to true automatically rather than presenting ComputerUseConsentDialog, so entering voice mode silently satisfies the standing consent gate for screen and input control. The auditor rated this PLAUSIBLE rather than confirmed because it did not verify whether the Rust side independently enforces consent, and noted a per-action approval exists upstream — so the blast radius depends on SEC-59, which shows that upstream per-action gate defaults to allow for unconfigured apps.

**Done when.** The voice controller cannot write consent flags; entering voice mode with computer use requested presents the same consent dialog as every other entry point, and the Rust side refuses a computer-use action whose consent record was not produced by an explicit user decision.

**Where.** `apps/desktop/src/features/voice/useCloudVoiceController.ts:286-287,293`

**From.** phase4-capability-audit.md (PP-15)

### SEC-61 — No task-time BYOK consent ceremony for cloud vision picks from a Local workspace, leaving computer use restricted by workaround

`MEDIUM` · security · effort M

**What.** known-flaws COMPUTERUSE-BYOK-TASK-CONSENT (open follow-up to the COMPUTERUSE-BYOK-SILENT-EGRESS fix): until a fork-ceremony consent flow exists, Local-mode computer use is restricted to local-models-only by design. That is the correct fail-closed posture, but it means a documented product capability is unavailable in Local mode and the restriction is a workaround rather than the intended control. The repository's Local→BYOK product lock (PRIVACY-01) requires an explicit fork with context selection, secret scan, payload preview, consent and a visible provider label — none of which exists for the task-time computer-use path.

**Done when.** A task-time fork ceremony exists for computer use — context selection, secret scan, payload preview, explicit consent and a visible provider label — so a Local-mode user can knowingly send a screenshot to a BYOK vision model, and the local-models-only restriction is lifted only once it does.

**From.** known-flaws.md (COMPUTERUSE-BYOK-TASK-CONSENT, PRIVACY-01)

### SEC-66 — Reauthentication mid-turn does not stop before unauthorized side effects or resume the interrupted work

`MEDIUM` · security/auth · effort M

**What.** CAP-040 / gap-audit GAP-P1-006: when auth expires mid-turn, the system does not reliably persist the pending turn and attachments, stop before unauthorized side effects, and resume via a single-use continuation token across web, the desktop cloud shell, mobile and the extensions. The security-relevant half is the middle clause — a turn whose credential has expired can continue into tool execution and side effects rather than halting at the boundary; the UX half (losing the user's work) is what makes the defect visible.

**Done when.** An expired credential halts the turn before any further side effect, the pending turn and attachments persist, and resumption after sign-in requires a single-use continuation token bound to the original principal — consistently across web, desktop cloud, mobile and both extensions.

**From.** capability-gaps.csv (CAP-040); gap-audit-2026-08-08.md (GAP-P1-006)

### SEC-73 — Two parallel device-pairing authentication flows exist on near-homograph routes with separately implemented code-format validation

`MEDIUM` · security/auth · effort M · **unclear**

**What.** BACKEND-RUNTIME-004 (audit/parity-2026-08-15). auth/device/{code,approve,token,refresh} implements the RFC 8628 CLI device-code flow; device/{link,poll,approve} implements a separate QR-code linking system with its own regex, table and crypto module. Confirmed to exist as described; no functional defect proven, but the near-collision between device/_ and auth/device/_ plus duplicated validation logic is a standing auth-surface hazard. Distinct from SEC-11 (native-messaging manifest install authorized by a token the same unauthenticated endpoint issues).

**Done when.** Consolidate code-format validation into one shared regex/constant module used by both flows as low-risk hardening, and rename the QR flow's routes to remove the device/_ vs auth/device/_ near-collision.

**Where.** `apps/web/app/api/auth/device/{code,approve,token,refresh}/route.ts`, `apps/web/app/api/device/{link,poll,approve}/route.ts`, `apps/web/db/neon/0077_gateway_compatibility_tables.sql:64`

**From.** audit/parity-2026-08-15/gaps/domain-backend-runtime (BACKEND-RUNTIME-004)

### SEC-46 — Cron bearer secret is compared non-constant-time

`LOW` · security/auth · effort S

**What.** DPDP_PROGRESS §6: cron-auth.ts:13 compares the cron bearer secret with a plain equality check rather than a constant-time comparison, making it theoretically timing-distinguishable. Low impact given the secret's length and network noise, but it is a one-line fix in an authentication path that guards scheduled execution.

**Done when.** The cron secret comparison uses a constant-time equality function.

**Where.** `apps/web/lib/server/cron-auth.ts:13`

**From.** DPDP_PROGRESS.md (§6)

### SEC-62 — Chrome extension REPLAY_SHORTCUT remains reachable from any allowlisted tab pending security review

`LOW` · security · effort S

**What.** known-flaws EXT-POLICY-PRIVILEGED-MSG-WEB-REACHABLE: the privileged tab/cookie/chat messages (GET_ALL_TABS, CREATE/CLOSE/SWITCH_TAB, GET/SET/CLEAR_COOKIES, CHAT_MESSAGE) were reachable from any allowlisted web page's content script and have been gated extension-page-only with a regression test. REPLAY_SHORTCUT was deliberately left on the allowlisted-tab policy as a design choice explicitly recorded as needing a future security-review call — it remains the one privileged verb a web page in the allowlist can still invoke. ExecutionPlan #8/#9 closed the adjacent memory and tab-group policy defaults and the retyped agi_site_allowlist storage key.

**Done when.** REPLAY_SHORTCUT's reachability is decided on the record — either moved extension-page-only like its siblings, or kept with a written rationale bounding what a hostile allowlisted page can drive with it, plus a regression test pinning the decision.

**Where.** `apps/extension/src/background/policy.ts`

**From.** known-flaws.md (EXT-POLICY-PRIVILEGED-MSG-WEB-REACHABLE); ExecutionPlan.md (#8, #9)

### SEC-64 — CAPTCHA/bot protection on Clerk-gated sign-up is unverified in either direction

`LOW` · security · effort S · **unclear**

**What.** DPDP_PROGRESS §6: whether Turnstile/CAPTCHA is enabled on the Clerk-gated sign-up flow cannot be confirmed from the repository either way — the setting lives in the Clerk dashboard, and proxy.ts:87,93 only routes the flow. The doc's own instruction is to treat it as unverified until the dashboard toggle is checked and the answer recorded. Relevant because managed cloud is open by default and free accounts are the precondition for SEC-03 (billion-laughs), SEC-25 (MCP redirect SSRF) and SEC-30 (upload OOM) — cheap account creation is the amplifier for all three.

**Done when.** The Clerk bot-protection setting is inspected and its state recorded in the repository, and if disabled, enabled — so account-creation cost is a known quantity rather than an assumption.

**Where.** `apps/web/proxy.ts:87,93`

**Blocked by.** Requires reading the Clerk dashboard configuration (founder/operator)

**From.** DPDP_PROGRESS.md (§6)
