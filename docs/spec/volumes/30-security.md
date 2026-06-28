# Volume 30 — Security

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 30)
Authority: `docs/strategy/03` (risk register R1–R3), `docs/agent-context/risk-map.json`, Vol 27 (Auth), Vol 29 (Observability), Vol 32 (contract tests)

## Philosophy & Cloud/Local stance

Privacy is the product, so security is not a feature bolted on — it is the moat, enforced in code and proven by tests. The defining control is **trust partitioning**: Local, BYOK, and Managed are separate trust boundaries, and the code must make a silent crossing impossible, not merely unlikely. A Local thread can never produce a network call to a non-local host; a Local→BYOK fork is an explicit, consented event with a **fail-closed secret scan** so a key or secret can't leak into the new branch. Everything defaults to deny: permissions, egress, third-party code. Managed adds server-side controls (RLS, abuse defenses, immutable audit) because it is the one surface where AGI holds user data. The three named risks from the audit — audit-log immutability (R1), mobile TLS pins (R2), and Rust-transport egress (R3) — are launch-critical, not hygiene.

## Binding rules

1. Trust partitioning is enforced in code and guarded by contract tests (Vol 32). Any boundary crossing without explicit consent is a P0 (Operating Law 1).
2. The Local→BYOK fork runs a fail-closed secret scan + payload preview before any send; if the scan can't run, the fork is blocked.
3. Outbound requests and BYOK base URLs pass an SSRF allowlist; Rust-transport egress is gated the same as JS egress (R3, `risk-map` `BYOK-RUST-EGRESS-01`).
4. Audit logs are append-only and immutable: REVOKE update/delete from the app role (R1, `0014_security.sql` → `0043_audit_log_immutability.sql`).
5. Secrets live in OS keystores; never in client logs, source, env committed to git, or telemetry (Vol 27/29).
6. RLS enforced on every multi-tenant table; no cross-tenant read (Vol 4).
7. Agent/tool/plugin code runs sandboxed with least privilege; deny beats allow in the permission pipeline (Vol 18).
8. Third-party skills/plugins/MCP are vetted before install and re-scanned on update (rug-pull defense, Vol 21/22).
9. Mobile TLS pinning provisioned and enforced before App Store release (R2).
10. Claim only what evidence backs; security/trust pages may not overclaim (`docs/strategy/03` F09).

## Repository map (real paths)

- Trust contracts: `packages/types/src/suite-contracts.ts` (`PrivacyMode`, `ProviderMode`, `assertSurfaceCanSyncChats`).
- Exec/permission policy (Rust): `crates/agiworkforce-execpolicy/src/` (`decision.rs`, `execpolicycheck.rs`, `rule.rs`, `parser.rs`); sandbox `crates/sandbox-policy/src/lib.rs`.
- Egress / SSRF (Rust): `crates/agiworkforce-network-proxy/src/` (`network_policy.rs`, `http_proxy.rs`, `proxy.rs`, `mitm_tests.rs`, `reasons.rs`); protocol `crates/agiworkforce-protocol/src/network_policy.rs`.
- Web security: `apps/web/core/security/prompt-injection-detector.test.ts`; shared `packages/api/src/security.ts`, `packages/utils/src/crypto.ts`.
- DB security/RLS/audit: `apps/web/db/neon/0014_security.sql`, `0037_rls_user_isolation.sql`, `0032_security_severity_superset.sql`, `0043_audit_log_immutability.sql`.
- Plugin/skill vetting: `crates/agiworkforce-plugin-runtime/` (manifest matrix, fixtures); skills catalog `services/api-gateway/src/services/skillsCatalog.ts`.
- Mobile TLS pinning: `apps/mobile/lib/pinning.ts` (R2 — provision pins, enable enforcement).
- Gateway gates: `services/api-gateway/src/middleware/{auth,managedComputeGate,planGate}.ts`.

## Competitor notes (`docs/strategy/01`, `02`)

The prompt-injection arms race lives in the browser/OS-touching surfaces (Claude for Chrome: ShadowPrompt, ClaudeBleed; Cowork scans model activations to detect injection — `01` §2.1). Incumbents run a continuous vulnerability-patching pipeline, published red-team metrics, action confirmations, and site/app permission models (`01` §4). They offer enterprise SSO/SCIM, audit logs, a Compliance API, customer-managed keys, HIPAA-readiness (`01` §4) — much of which AGI still owes (R11 SCIM). AGI's deliberate divergence and edge (`docs/strategy/05` §6): incumbents are structurally conflicted out of the privacy-purist niche; our defensible asset is a trust architecture _enforced in code and provable by contract tests_ — exactly what a compliance buyer is purchasing. Do not demo autonomous browser actions until approval gates + sender validation are confirmed (`02` Chrome).

## Checklists

### Trust-partition enforcement (the moat)

- [ ] Contract test: a Local thread never produces a non-local network call (every surface).
- [ ] Local→BYOK fork shows context selection + payload preview + provider label + consent.
- [ ] Secret scan at the fork is fail-closed (blocks on scanner error).
- [ ] `assertSurfaceCanSyncChats` governs all sync paths; no bypass.
- [ ] Rust-transport egress (`SyncManager`/account paths) privacy-mode-gated (R3).

### Network: SSRF / egress / TLS

- [ ] Outbound + BYOK base URLs pass the SSRF allowlist.
- [ ] No requests to internal/metadata IPs; allowlist tested.
- [ ] Mobile TLS pins provisioned (real SPKI) and `PINNING_ENFORCED=true` before release (R2); `check:tls-pins` green.

### Secrets & key management

- [ ] Secrets only in OS keystore (stronghold/keychain/keyring/SecureStore); none in git/logs/telemetry.
- [ ] Key rotation path defined for server-side provider keys (Managed).
- [ ] BYOK keys never transit AGI servers (contract test, Vol 27).

### Web app security (CSRF/XSS)

- [ ] CSRF on state-changing routes (Vol 27).
- [ ] Output encoding / sanitization for any rendered user/LLM content; artifact rendering isolated in sandbox iframe (Vol 14, `apps/sandbox`).
- [ ] Zod/serde validation on every tool/LLM/API/IPC input (Vol 38).

### Data isolation & audit

- [ ] RLS on every multi-tenant table; cross-tenant read test green (`__tests__/lib/rlsTenantIsolation.test.ts`).
- [ ] Audit log append-only: UPDATE/DELETE revoked from app role; verified in Neon (R1, `0043`).
- [ ] Audit entries cover auth, billing changes, refunds, admin actions, boundary crossings.

### Sandboxing & untrusted code

- [ ] Agent/autonomous runs sandboxed; credentials kept outside the sandbox.
- [ ] Permission pipeline fail-closed; deny beats allow (Vol 18).
- [ ] Skills/plugins/MCP vetted before install; declared-vs-actual permission check; re-scan on update (Vol 21/22).
- [ ] Browser/computer-use autonomous actions gated behind human approval + sender validation.

### Prompt-injection program

- [ ] Injection detection on browser/OS-touching paths (`prompt-injection-detector`).
- [ ] Untrusted-remote (MCP) content cannot shell-inject (Vol 19).
- [ ] Security regression suite covers injection/SSRF/IDOR so fixes don't silently regress.

## Definition of Done

Trust-boundary contract tests pass on every surface (Local → no non-local egress); Local→BYOK fork proven fail-closed on secret scan; SSRF allowlist covers JS and Rust transports (R3 gated); audit-log immutability applied and verified in Neon (R1 closed); mobile TLS pins provisioned + enforced and `check:tls-pins` green (R2 closed); RLS isolation test green; skills/plugins/MCP vetting + re-scan wired; security pages claim only what is shipped (F09). `pnpm check:llm-failures` and the boundary checks pass.

## Anti-patterns

- A networking change that ships without passing the trust-boundary contract tests.
- A secret scan that "fails open" and lets the fork proceed on scanner error.
- Audit tables the app role can UPDATE/DELETE (R1).
- TLS pinning left as placeholders / disabled at release (R2).
- An ungated Rust egress path that bypasses the JS egress guard (R3).
- Installing third-party skills/plugins/MCP without vetting or update re-scan.
- Demoing autonomous browser/computer actions before approval gates exist.
- Trust/compliance copy that exceeds shipped, evidence-backed scope.
