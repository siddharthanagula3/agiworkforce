# Volume 32 — Testing & QA

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 32)
Authority: `docs/strategy/03` §5 (testing strategy), `docs/agent-context/commands.json`, Vol 30 (trust-boundary tests), Vol 7 (provider-contract tests)

## Philosophy & Cloud/Local stance

A feature is not done because it builds (Operating Law 4). It is done when the path is inspected, the surface check passes, targeted + trust-boundary tests pass, and launch-critical UI is verified by e2e/visual — per increment, not at the end. We already verify more than most startups (`docs/strategy/03` §5); the gap is _integration and trust-boundary_ coverage, so those become first-class gates. Tests must be real: no `expect(true).toBe(true)`, no swallowed mock assertions, no fabricated fixtures presented as live data (Operating Law 5). The trust boundary is proven mechanically — property-style tests assert a Local thread can never produce a non-local network call — because privacy is the product and any leak is existential, not cosmetic. Provider behavior is pinned with recorded fixtures so a provider changing its SSE shape fails CI, not production.

## Binding rules

1. Per-increment gate: typecheck/lint/cargo + targeted tests + the surface check from `commands.json` + trust-boundary tests + e2e/visual for UI.
2. Trust-boundary contract tests are a first-class gate on every surface ("Local → no non-local egress"); a failure blocks merge (Vol 30, `docs/strategy/03` §5).
3. Provider-contract tests run against recorded fixtures for every provider in `models.json`; an SSE/shape change fails CI (Vol 7).
4. No fake/hollow tests, no swallowed assertions, no fabricated data sold as real (`pnpm check:llm-failures`).
5. Launch-critical flow (empty chat → send → stream → persist → reload) is an e2e/visual test per surface; build success alone never marks it done.
6. Per surface: Web via Playwright + Chrome MCP; Mobile via Xcode MCP + Detox/Jest; Desktop via Playwright/smoke + cargo + computer-use MCP.
7. Security regression suite covers injection/SSRF/IDOR so fixes don't silently regress.
8. Accessibility (WCAG 2.1 AA) and performance budgets are tested, not assumed (Vol 23/31).

## Repository map (real paths)

- Surface checks: `docs/agent-context/commands.json` (per-surface primary checks; mirrored in `repo-map.json`).
- Desktop e2e (Playwright): `apps/desktop/e2e/` — `smoke.spec.ts`, `v3-smoke.spec.ts`, `v3-locks.spec.ts`, `v3-reachability.spec.ts`, `comprehensive-flows.spec.ts`, `agi-safety.spec.ts`, `gdpr.spec.ts`, `accessibility-audit.spec.ts`, `visual-regression.spec.ts`; cargo tests `apps/desktop/src-tauri/tests/`, benches `src-tauri/benches/`.
- Mobile tests: `apps/mobile/__tests__/` (`smoke.test.ts`, `mmkv-encryption-key.test.ts`, `dispatch-persist-strip.test.ts`, `content-filter.test.ts`, `hindi-qa-harness.test.ts`); Detox `apps/mobile/scripts/screenshots/jest.detox.config.js`.
- Web tests: co-located `*.test.ts(x)` (e.g., `apps/web/core/security/prompt-injection-detector.test.ts`, `apps/web/features/settings/services/totp-2fa.test.ts`); a11y `apps/web/scripts/a11y-audit.mjs`; perf `apps/web/scripts/perf-profile.js`.
- Services tests: `services/api-gateway/__tests__/` (`middleware/auth.test.ts`, `lib/rlsTenantIsolation.test.ts`, `routes/{cloudChat,enterprise}.test.ts`, `providerStream.live.test.ts`); `services/signaling-server/__tests__/`.
- Rust contract/unit: `crates/agiworkforce-execpolicy/`, `crates/agiworkforce-network-proxy/src/mitm_tests.rs`, `crates/agiworkforce-plugin-runtime/tests/manifest_matrix.rs`, `crates/agiworkforce-apply-patch/tests/`.
- Trust contracts under test: `packages/types/src/suite-contracts.ts`; `packages/types/vitest.config.ts`.

## Competitor notes (`docs/strategy/01`, `02`)

Codex/Claude lean on heavy automated verification — OpenAI's mobile apps are "preview-first + snapshot testing" (`01` §3.1); Claude Code is ~90% written by Claude Code with a test culture that lets the team delete code as models improve (`01` §2.1). Both run continuous vulnerability-patching pipelines with published red-team metrics for prompt injection (`01` §4). AGI's deliberate divergence: our highest-value tests aren't feature tests, they're **trust-boundary contract tests** and **provider-contract tests** — the first proves the privacy moat mechanically (our buyer's literal requirement, `docs/strategy/05` §6), the second turns 15-provider fragility into a CI signal instead of a production incident (`03` §5). We use computer-use/Chrome/Xcode MCP for surface verification the same way incumbents use their own harnesses.

## Checklists

### Per-increment gate (every change)

- [ ] `typecheck`/`lint` (TS) and `cargo check`/`clippy` (Rust) pass.
- [ ] Targeted unit tests for the changed behavior pass.
- [ ] Surface check from `commands.json` for the touched surface passes.
- [ ] Trust-boundary contract tests pass.
- [ ] `git diff --check` clean; no `--no-verify`.

### Unit & integration

- [ ] New logic has unit tests with real assertions (no hollow tests).
- [ ] Integration tests cover the action → service → runtime → response path.
- [ ] Mocks assert behavior; no swallowed/never-called mock expectations.

### E2E / visual (launch-critical)

- [ ] Web: Playwright + Chrome MCP cover empty chat → send → stream → persist → reload.
- [ ] Desktop: Playwright/smoke + computer-use MCP cover the same flow + V3 locks/reachability.
- [ ] Mobile: Detox/Jest + Xcode MCP cover on-device chat + cloud-gate behavior.
- [ ] Visual regression baseline current for chat/settings (`visual-regression.spec.ts`).

### Trust-boundary & provider contracts

- [ ] Property test: Local thread → zero non-local network calls (each surface).
- [ ] Local→BYOK fork: secret scan fail-closed under fault injection.
- [ ] Provider-contract tests run for every `models.json` provider against recorded fixtures.
- [ ] A simulated provider SSE-shape change fails CI.

### Security regression

- [ ] Injection, SSRF, and IDOR paths have regression tests (`prompt-injection-detector`, `mitm_tests.rs`, RLS isolation).
- [ ] Plugin/skill manifest + permission matrix tested (`manifest_matrix.rs`).

### Accessibility & performance

- [ ] axe/a11y audit on chat + settings passes AA (`accessibility-audit.spec.ts`, `a11y-audit.mjs`).
- [ ] Performance budgets checked (web LCP, first-token p95 — Vol 31) (`perf-profile.js`, benches).

### Load & chaos (pre-scale, shared backend)

- [ ] Load/soak test on `api-gateway`/signaling before scale events (`04`).
- [ ] Chaos/failover test: provider outage → transparent failover (Vol 7, `04` §7).
- [ ] Fuzz inputs on parsers (apply-patch, SSE) for crash safety.

## Definition of Done

The per-increment gate is green for the change; launch-critical e2e/visual passes on the touched surface; trust-boundary contract tests pass on every surface; provider-contract tests pass for all `models.json` providers (and a shape-change fault fails CI as expected); security regression and a11y suites pass; `pnpm check:llm-failures` shows no fake/hollow tests or fabricated data; residual risk recorded in `known-flaws.md`.

## Anti-patterns

- Marking work done on build success without inspecting the path or running the surface check (Operating Law 4).
- Hollow tests (`expect(true).toBe(true)`), swallowed mock assertions, or fabricated fixtures presented as live.
- Skipping hooks with `--no-verify`.
- Shipping a networking change without trust-boundary tests.
- Provider integrations with no recorded-fixture contract test (SSE drift reaches prod).
- E2e that asserts nothing meaningful or screenshots without comparison.
- Treating a11y/performance/load as post-launch chores.
