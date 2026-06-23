# AUDIT_TAXONOMY — failure modes to detect (check EVERY file against EVERY applicable item)

Report: file path, line number(s), failure mode name, one-line description of the specific instance.

## AI-GENERATED CODE QUALITY

hallucination, AI slop, plausible nonsense, semantic incorrectness, intent mismatch, spec mismatch, fake completion, implementation theater, test theater, security theater, mock leakage, stub behavior, placeholder code, TODO debt, no-op logic, hardcoded success, magic constants, demo-data leakage, partial implementation, incomplete wiring, dead UI, orphaned code, unused integration, happy-path bias, edge-case blindness, context blindness

## ARCHITECTURE & DRIFT

architecture drift, pattern drift, contract drift, schema drift, migration drift, configuration drift, dependency drift, documentation drift, test drift, version skew, outdated knowledge, deprecated API usage, cargo-cult coding, premature abstraction, overengineering, abstraction bloat, leaky abstraction, copy-paste architecture, duplicate utilities, framework mismatch, platform mismatch, server-client boundary violation, scope creep, requirement drift, instruction drift, wrong-problem solving, symptom patching, brittle fix, regression risk

## TYPE & LOGIC BUGS

invariant violation, type erasure, unsafe casting, lint suppression, validation bypass, fail-open behavior, silent failure, swallowed exception, ignored promise, async race, missing await, retry storm, unbounded loop, resource exhaustion, memory leak, stale state, stale closure, lost update, double submit, optimistic-update bug, cache invalidation bug, cache poisoning, timezone bug, locale bug, precision loss, pagination bug, sorting mismatch, filtering mismatch, off-by-one error, null handling bug, empty-state bug, malformed-response handling

## API & INTEGRATION

request validation gap, response validation gap, environment validation gap, API contract violation, unsafe API consumption, third-party trust bias, rate-limit omission, timeout omission, backoff omission, circuit-breaker omission, idempotency gap, webhook verification gap, webhook replay, event ordering bug, duplicate event handling

## SECURITY

authentication gap, authorization gap, BOLA, IDOR, BFLA, mass assignment, tenant isolation failure, ownership-check gap, role bypass, privilege escalation, session confusion, token leakage, insecure token storage, frontend-secret exposure, hardcoded secret, PII leakage, log leakage, telemetry leakage, prompt leakage, cross-tenant leak, excessive data exposure, CORS misconfiguration, CSRF, SSRF, XSS, SQL injection, NoSQL injection, command injection, path traversal, open redirect, prototype pollution, unsafe deserialization, file-upload vulnerability, MIME confusion, weak CSP, unsafe HTML rendering, unsafe markdown rendering, unsafe eval, supply-chain risk, dependency confusion, typosquatting, vulnerable dependency, abandoned dependency, lockfile drift, postinstall risk

## LLM-SPECIFIC

prompt injection, indirect prompt injection, jailbreak, system-prompt leakage, role confusion, data-as-instruction bug, context poisoning, RAG poisoning, tool poisoning, insecure output handling, LLM output injection, function-call injection, excessive agency, tool overreach, permission overreach, approval-gate gap, human-in-the-loop gap, least-privilege violation, overreliance, citation hallucination, ungrounded answer, retrieval drift, stale retrieval, irrelevant retrieval, context overload, lost-in-the-middle, embedding leakage, vector-store leakage, model denial of service, token explosion, cost explosion, agent loop, runaway agent

## TESTING

eval gap, golden-test gap, adversarial-test gap, red-team gap, regression-test gap, negative-test gap, integration-test gap, E2E-test gap, smoke-test gap, auth-test gap, webhook-test gap, migration-test gap, false-green test, flaky test, brittle test, snapshot abuse, mock-only test, coverage illusion, assertion theater, test deletion, test weakening

## BUILD & DEPLOYMENT

build omission, typecheck omission, CI bypass, broken script, stale README, env-example gap, release-checklist gap, rollback gap, debug-mode leakage, staging-production mixup, Docker drift, deployment drift, health-check gap, observability gap, error-reporting gap

## FRONTEND (Web)

hydration mismatch, SSR bug, route-guard gap, auth-redirect loop, error-boundary gap, loading-boundary gap, accessibility regression, keyboard-navigation bug, focus-management bug, ARIA misuse, SEO regression, cookie misconfiguration

## MOBILE

mobile permission overreach, secure-storage gap, offline-mode gap, resume-state bug, background-task bug, deep-link bug, push-notification bug, privacy-label mismatch, battery drain

## DESKTOP / TAURI

desktop trust-boundary violation, IPC validation gap, filesystem overreach, shell-access overreach, webview insecurity, custom-protocol bug, updater insecurity, code-signing gap, notarization gap

## CLI

CLI exit-code bug, stdout-stderr confusion, unstable JSON output, dry-run gap, confirmation gap, secret printing, signal-handling bug, Windows-path bug, POSIX assumption

## VS CODE EXTENSION

VSCode activation bloat, workspace-trust violation, webview-CSP gap, localResourceRoots abuse, acquireVsCodeApi leak, subscription leak, unsafe command arguments, telemetry-consent gap

## CHROME EXTENSION

Chrome MV3 violation, service-worker lifecycle bug, persistent-background assumption, host-permission overreach, all-urls abuse, content-script trust bug, message-validation gap, sender-validation gap, externally-connectable overreach, web-accessible-resource leak, remote-code violation, extension-CSP gap

---

# FINDING FORMAT (exact — one block per finding, never grouped)

### [SEVERITY] FAILURE_MODE_NAME

- **File:** `path/to/file.ts`
- **Line:** 142
- **Instance:** One sentence describing exactly what was found in this file
- **Risk:** One sentence on what breaks or gets exploited if not fixed
- **Fix:** One sentence on the correct remediation

Severity: CRITICAL / HIGH / MEDIUM / LOW

Rules:

- Every finding must cite a specific file and line. No invented findings.
- Do not under-classify severity to reduce noise.
- Never copy secret values verbatim into a finding — redact to first/last 4 chars.
- Docs (.md) are scanned for documentation drift only.
- Machine-generated/minified artifacts (lockfiles, dist bundles, snapshots, generated JSON): scan structurally for secrets, tokens, PII, source-map leaks, vulnerable pinned versions — line-by-line semantic review not required; note `(generated artifact — structural scan)` in the Instance.
