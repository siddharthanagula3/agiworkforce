# Execution Playbook — Adapt-Don't-Rebuild to Public Alpha (1mo) → Production for 1M (3mo)

Status: Active execution plan
Owner: Founder + platform lead
Last updated: 2026-06-28
Companion docs: `09-reference-codebases.md`, `10-oss-corpus-port-plan.md`, `03-code-reality-and-tech-debt.md`, `07-roadmap-12-month.md`
Reference library: `/Users/siddhartha/Desktop/opensource_reference/` (odysseus updated to `main` @ `dd055ee` on 2026-06-28)

This is the build plan to run end-to-end as a loop. Surfaces in priority order, per founder: **Website → Mobile → Desktop** first. Strategy: adapt licensed open source aggressively; spend original engineering only on the moat (trust enforcement, billing, client-side BYOK).

---

## 0. Hard rules (read before any increment)

1. **IP rule — non-negotiable.** `claude-code/` is Anthropic's proprietary source (no license). It is **study-only**: read it to understand _decisions_, then implement from a **license-clean twin**. Never copy its code, even renamed. The runtime twin is **`codex-rs` (Apache-2.0)** — already the parent of our `execpolicy` fork. Other clean donors: `continue` (Apache-2.0, IDE), `opencode` (MIT), `odysseus` (MIT), `SkillSpector` (Apache-2.0), `gemini-cli`/`qwen-code`/`goose`/`aider`/`agentscope`/`codebuff` (Apache/MIT).
2. **License gate before any port.** Every ported file records source repo + license + commit in `PORTING-TRACKER.md`, preserves upstream `LICENSE`/`NOTICE` headers, and adds an entry to `THIRD_PARTY_NOTICES.md`. **Never port from:** `crush` (FSL — competing-use ban), `auto-code-rover` (SONAR — competing-use ban), `Devon` (AGPL), `plandex` pre-2.0 (AGPL), `OpenHands/enterprise/` (PolyForm), `CopilotKit/showcase/` (proprietary), Ultralytics YOLO (AGPL), `init`/`chat-template` (no license). These are pattern-study-only.
3. **Brand rename is fine; attribution stays.** Renaming ported symbols/paths to AGI is allowed. Stripping the upstream copyright/NOTICE is not.
4. **Model IDs come from `packages/contracts/types/src/models.json`.** Never hardcode an ID from a ported file (several donors hardcode example IDs — rewrite to read the catalog).
5. **Trust boundaries are never weakened by a port.** Local never silently routes to BYOK/Managed. Any ported networking code passes the trust-boundary contract tests (INC-0.3) before merge.

---

## 1. The loop protocol (how every increment runs)

Each increment is a self-contained **work order**. Run them in order; each is small enough to finish + verify in one focused pass (ideal for a fresh subagent when context is tight).

```
for each increment in backlog:
  1. branch:   git checkout -b inc/<id>-<slug>   (off the integration branch)
  2. study:    read the named claude-code reference for intent (optional)
  3. port:     adapt from the named LICENSE-CLEAN source into the target files
  4. attribute: update PORTING-TRACKER.md + THIRD_PARTY_NOTICES.md
  5. verify:   run the increment's Verify commands (must all pass)
  6. commit:   conventional message; pre-commit hooks must pass (no --no-verify)
  7. record:   update this file's status + known-flaws.md if risks remain
  8. PR/merge: into integration branch; then next increment
```

**Definition of done (every increment must pass before commit):**

- `pnpm typecheck:all` and `pnpm lint` green (TS); `cargo check --workspace --locked` + `cargo clippy` green (Rust).
- Targeted tests for the changed behavior pass; new behavior has a new test.
- The relevant surface check from `docs/agent-context/commands.json` passes.
- `pnpm check:llm-failures` + `pnpm check:agent-context` + `pnpm check:boundaries` green.
- For UI: an e2e/screenshot check of the launch-critical flow.
- For anything touching networking/trust: the trust-boundary contract tests (INC-0.3) pass.
- `git diff --check` clean; `PORTING-TRACKER.md` updated.

**Branching:** integration branch `feat/agi-alpha`; per-increment branches `inc/<id>-<slug>`; squash-merge to integration; integration → `main` at each phase gate. Keep this separate from the current `feat/p3-model-env-gating` worktree.

---

## 2. Phase 0 — Machinery (days 1–5, blocks everything)

| ID          | Goal                                                                                                    | Source (license)                                                          | Target                                                       | Verify                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **INC-0.1** | License-gate CI: fail the build on AGPL/GPL/SONAR/FSL/no-license deps                                   | `codebase-memory-mcp/scripts/license-gate-check.py` (MIT, study)          | `scripts/check-licenses.*`, CI job, `THIRD_PARTY_NOTICES.md` | CI fails on a planted AGPL dep; passes clean tree                                 |
| **INC-0.2** | Pin reference SHAs; record odysseus @ `dd055ee`; create `PORTING-TRACKER.md`                            | —                                                                         | `docs/strategy/PORTING-TRACKER.md`                           | tracker lists every donor repo + license + SHA                                    |
| **INC-0.3** | Trust-boundary contract tests: a Local thread can NEVER emit a non-local network call, on every surface | pattern: `odysseus app.py:_is_trusted_loopback`; AGI `suite-contracts.ts` | `packages/*/__tests__/trust-boundary.*`, Rust egress test    | tests fail if a Local path hits a non-local host                                  |
| **INC-0.4** | Provider-contract test harness (recorded fixtures, all 15 providers)                                    | RLLM `sse.rs`/`error.rs`, Portkey auth-shapes, Bifrost SSRF (Apache/MIT)  | `packages/ai/providers/__tests__/contracts/*`                | a provider SSE-shape change fails CI, not prod                                    |
| **INC-0.5** | SkillSpector vetting service stand-up (the trust differentiator)                                        | `SkillSpector` (Apache-2.0)                                               | `services/skill-vetting/`                                    | scanning a malicious sample → `DO_NOT_INSTALL`; model IDs read from `models.json` |

Phase-0 gate: all five green in CI on the integration branch.

---

## 3. Phase 1 — Public Alpha in ~4 weeks (Website + Mobile + Desktop)

Goal: a safe, coherent public alpha on the three priority surfaces. "Alpha" = real and honest, not feature-complete. Sequence within the phase: runtime → privacy/trust → launch-blockers → perception closers → provider robustness → ship.

### 3a. Runtime hardening (port from `codex-rs`, study `claude-code`)

| ID          | Goal                                                                               | Source files (codex-rs, Apache-2.0)                                                                          | Target (AGI)                                                   | Verify                                                                |
| ----------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| **INC-1.1** | **C3** wire `execpolicy` into the agent loop (highest ROI — engine already forked) | `core/src/exec_policy.rs`, `core/src/tools/orchestrator.rs`, `core/src/tools/sandboxing.rs`                  | `apps/cli/src/agent/chat.rs`, `crates/agiworkforce-execpolicy` | command allow/prompt/deny enforced in-loop; approval cache; tests     |
| **INC-1.2** | **C1** real `Tool` trait (fail-closed defaults)                                    | `tools/src/tool_executor.rs`, `core/src/tools/registry.rs`                                                   | `apps/cli/src/features/exec/tools/`, new `tool` trait module   | ≥3 tools migrated; per-tool safety flags; tests green                 |
| **INC-1.3** | **C2** LLM-summary compaction + circuit breaker                                    | codex `core/src/compact.rs` (mechanism) + gemini-cli `chatCompressionService.ts` (`<state_snapshot>` prompt) | `apps/cli/src/compaction.rs`                                   | long-session test: facts survive compaction; breaker stops runaway    |
| **INC-1.4** | **C4** streaming tool exec + withhold-and-recover                                  | codex `core/src/session/turn.rs`, `tools/parallel.rs`                                                        | `apps/cli/src/agent/chat.rs`                                   | read-only tools dispatch mid-stream; overflow → trim+retry, not error |

### 3b. Privacy & trust (the moat — original work + licensed rules)

| ID          | Goal                                                                     | Source                                                          | Target                                    | Verify                                                                 |
| ----------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| **INC-1.5** | Secret-scan, fail-closed, at the Local→BYOK fork                         | `llm-guard` rules (your scout) ported to Rust/TS                | `packages/contracts/compliance/`, fork UI | planted AWS/Stripe/OpenAI keys block + force user choice; audit-logged |
| **INC-1.6** | SkillSpector gate wired into skill/plugin/MCP install + rug-pull re-scan | `SkillSpector` (Apache) + `pm-skills/validate_plugins.py` (MIT) | install flow + `services/skill-vetting`   | install of a poisoned/updated skill is blocked; findings shown to user |

### 3c. Launch blockers (from `03`)

| ID          | Goal                                                                        | Target                                  | Verify                                                               |
| ----------- | --------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| **INC-1.7** | Provision real mobile TLS pins + enable enforcement                         | `apps/mobile/lib/pinning.ts`            | `check:tls-pins` green; pinned hosts connect, bad cert fails closed  |
| **INC-1.8** | Apply audit-log immutability migration                                      | `apps/web/db/neon/00xx_audit_immut.sql` | `app_rls` cannot UPDATE/DELETE audit rows                            |
| **INC-1.9** | Align marketing copy to shipped scope (mobile vision/translation, "parity") | web marketing pages                     | a claims-vs-parity check passes; no unshipped claim in present tense |

### 3d. Perception closers (cheap, high-visibility)

| ID           | Goal                                                         | Source                                                                 | Target                       | Verify                                            |
| ------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------- |
| **INC-1.10** | Global search (chats/projects/artifacts/files)               | pattern: odysseus search; continue retrieval                           | web + desktop                | search returns across types; respects trust scope |
| **INC-1.11** | Settings IA to the locked spec                               | `source-of-truth.md` UX Lock                                           | web + desktop settings       | all required sections present + wired             |
| **INC-1.12** | Artifacts polish (versioning, publish/share, error-fix loop) | CopilotKit `defineToolCallRenderer` + status-union (`packages/*`, MIT) | web + desktop artifact panel | artifact lifecycle e2e passes                     |

### 3e. Provider robustness (port from scout repos)

| ID           | Goal                                                                                                              | Source                                                                                                    | Verify                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **INC-1.13** | SSE/UTF-8 safety, typed retryable errors, backoff, Anthropic `X-API-Key` auth-shape, SSRF guard on BYOK base URLs | RLLM `sse.rs`/`error.rs`/`wrapper.rs`, Portkey `anthropic/api.ts`, Bifrost `provider.go` (all Apache/MIT) | provider-contract tests (INC-0.4) green for all 15 |

### 3f. Ship the three surfaces

| ID           | Goal                                                               | Verify                                                                |
| ------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| **INC-1.14** | Website public alpha deploy (Neon-backed, no BYOK on web)          | smoke e2e on prod URL; trust-boundary tests green                     |
| **INC-1.15** | Desktop alpha — signed/notarized build, Local+BYOK+Managed visible | install + first-token e2e on macOS/Windows                            |
| **INC-1.16** | Mobile alpha — TestFlight + Play internal → public alpha           | on-device LLM first-token; cloud gated correctly; store review passed |

Phase-1 gate: three surfaces live in public alpha; all DoD checks green; zero trust-boundary violations.

---

## 4. Phase 2 — Full production for 1M (weeks 5–12)

| ID           | Goal                                                                                       | Source (license)                                                                      | Verify                                                                   |
| ------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **INC-2.1**  | LMCache sidecar for managed-cloud inference cost                                           | `LMCache` (Apache, service)                                                           | TTFT/prefill cost drop on repeated contexts                              |
| **INC-2.2**  | Gateway hardening: per-user/IP/provider rate limit, circuit breaker, failover              | own + Bifrost patterns                                                                | load test: graceful under provider outage                                |
| **INC-2.3**  | Exact metering + daily drift audit (BILL-01)                                               | own + OpenMeter (Apache, service)                                                     | usage↔billed reconcile >99.99%; idempotent on retries                    |
| **INC-2.4**  | Abuse/fraud at the edge (signup, payment, prompt-abuse)                                    | own                                                                                   | red-team signup/payment fraud blocked                                    |
| **INC-2.5**  | Memory P0: two-layer store + hybrid retrieval + trust-scoped isolation                     | `supermemory` schema (MIT) + `codegraph` FTS (MIT) + `fastembed` (Apache, on-device)  | generated-from-history works; Local memory never surfaces cross-boundary |
| **INC-2.6**  | Connectors/apps directory (categories, search, per-tool permissions)                       | own + MCP SDK                                                                         | install/permission flow e2e; admin controls                              |
| **INC-2.7**  | Sync engine: PowerSync (mutable) + Electric (read-only), trust-matrix enforced             | PowerSync (FSL→Apache 2027) / Electric (Apache)                                       | cross-device app-chat sync; CLI/VSC stay local                           |
| **INC-2.8**  | VS Code surface from `continue`: IDE-host abstraction, autocomplete, lazy-apply, next-edit | `continue` (Apache)                                                                   | inline completion + diff-apply e2e in VS Code                            |
| **INC-2.9**  | Local file ingestion (PDF/doc→Markdown, on-device)                                         | `liteparse` (Apache)                                                                  | local upload parsed, never leaves device                                 |
| **INC-2.10** | Voice (TTS) + vision-beyond-OCR                                                            | `VoxCPM` (Apache incl. weights) + `supervision`+permissive VLM (MIT; NOT Ultralytics) | read-aloud works; image Q&A beyond OCR                                   |
| **INC-2.11** | Enterprise controls for the sovereign-AI wedge: SCIM, audit API, RBAC, data residency      | own                                                                                   | a design-partner tenant provisioned end-to-end                           |
| **INC-2.12** | Load/soak to 1M; SLOs (`04` targets)                                                       | k6/own                                                                                | p95 first-token <2.5s; stream success >99.5%; metering accurate          |

Phase-2 gate: SLOs met under soak; enterprise tenant live; managed-cloud safe-to-scale checklist green.

---

## 5. Per-surface launch checklists (condensed)

- **Website:** Neon-backed state only; no BYOK/free-env-key chat; CSP/CORS/CSRF verified; global search + settings IA; trust labels; smoke e2e on prod.
- **Mobile:** real TLS pins enforced; on-device LLM first-token; cloud gated unless entitled; copy matches shipped scope; App Store + Play review passed; crash-free >99.5%.
- **Desktop:** signed/notarized; Local+BYOK+Managed modes visible; MCP/connectors; local files never auto-upload; updater; computer/browser-use approvals gated.

---

## 6. Running this with limited context (the realistic operating model)

- Treat each increment as a **fresh subagent work order** — the orchestrator (me, next session, or you) hands a subagent ONE increment with its source files, target files, acceptance, and verify commands; the subagent ports + tests; the orchestrator verifies and commits.
- After each commit, re-read only: this file (status), `PORTING-TRACKER.md`, and the increment's verify output. That keeps context small and the loop resumable indefinitely.
- Phase gates are the natural "checkpoint, then continue" points.
- **Status is tracked in `PORTING-TRACKER.md`** — the single source of truth for "what's done / in-flight / next."

---

## 7. What stays original (do not look for OSS — this is the moat)

Per your own 9-axis scout, three things have no good donor and are exactly your differentiators — spend real engineering here:

1. **Entitlement → real-time request-severing** (gateway ↔ metering ↔ Stripe fusion).
2. **The trust-partition enforcement itself** (Local/BYOK/Managed, in code, across surfaces).
3. **Client-side BYOK raw-HTTP provider layer** (all OSS routers are server-side).

Everything else: adapt. Originate only the moat.
