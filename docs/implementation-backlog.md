# AGI Implementation Backlog (Engineering-Book Audit Findings)

Status: Current
Owner: Founder + platform lead
Last updated: 2026-06-25
Last verified against implementation: 2026-06-25
Audience: Engineers and AI agents who fix implementation defects surfaced by canonical engineering books
Layer: docs
Document ID: AGI-DOC-0019
Authority: This is an **implementation-tracking artifact**, not a constitution or governance document. It records defects found when a canonical engineering book is generated and audited against the repository. The law it cites (AC-19, AC-20, §19) is owned by the [Architecture Constitution](00-foundation/architecture-constitution.md); this backlog references it by ID, never restates it.
Related: [architecture-constitution.md](00-foundation/architecture-constitution.md), [owner-decision-register.md](00-foundation/owner-decision-register.md), [master-documentation-roadmap.md](00-foundation/master-documentation-roadmap.md), `docs/03-runtimes/context-runtime/bk-11.01-deterministic-context-assembly.md`, `docs/agent-context/known-flaws.md`

---

## Purpose & scope

Every canonical engineering book is **both** the specification for its domain **and** an implementation audit of the repository against that specification. This backlog accumulates the implementation defects each book surfaces. It is **the actionable, prioritized tracker**; the per-book detail lives in the book's own Current-State and Implementation-Gaps sections.

**Single-owner discipline.** This backlog does not duplicate the two existing trackers; it links to them. The [Owner Decision Register](00-foundation/owner-decision-register.md) §9 owns **architecture-level findings** (`ARCH-D1…D17`, which need founder decisions); [`known-flaws.md`](agent-context/known-flaws.md) owns **previously-tracked platform flaws**. This backlog owns **book-discovered implementation defects** — the concrete, fix-by-fix code-level work. Where a finding overlaps an existing tracker, it cross-references rather than re-records. **No fix is applied here.**

**ID scheme:** `<DOMAIN>-NNN` (stable, never reused). This wave seeds the backlog from `AGI-DOC-0018` (VOL-11 / BK-11.01, Deterministic Context Assembly); the `CTX-` prefix is the Context Runtime domain.

---

## Findings — AGI-DOC-0018 (VOL-11 / BK-11.01)

All evidence is `file:line` verified during book generation. Roadmap link for every row: VOL-11 / BK-11.01. ADR link: none yet (BK-11.01 is `planned`; no ADR ratifies the assembler — itself an open item).

### Implementation status — Wave 0–1 (2026-06-25)

The first implementation pass landed the three **objectively-correct, unblocked AC-19 determinism** fixes and stopped at the blocked items. Each fix is the smallest correct change plus a zero-drift regression test; nothing was merged across concerns.

| Finding     | Status                        | Evidence of resolution                                                                                                                                          |
| ----------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CTX-003** | ✅ **Resolved**               | Position-based fallback id (`call_${i}_${ti}`) replacing the wall clock; `apps/web/lib/llm-providers/anthropic.test.ts` (3 tests) + web `tsc --noEmit` clean.   |
| **CTX-004** | ✅ **Resolved**               | Extracted `cmp_file_type_desc` (count desc, ext asc); `project_context::tests::file_type_breakdown_is_deterministic` ✔ (module 6/6).                            |
| **CTX-005** | ✅ **Resolved**               | Extracted `cmp_skill_match_desc` (score desc, name asc); `send_message_setup::tests::skill_match_ranking_is_deterministic` ✔ (module 17/17).                    |
| **CTX-002** | ⛔ **Blocked**                | Needs the unknown-model-window **policy decision** (Open Decision) — not a mechanical fix.                                                                      |
| **CTX-006** | ⛔ **Blocked**                | Needs **mandatory security review** (AC-92); the nonce is the FIX-015 jailbreak defense and MUST NOT be weakened.                                               |
| **CTX-012** | ⛔ **Blocked (reclassified)** | On reading the source, the audit's "derive from window / Deps: none" was based on **incomplete reading** (see CTX-012 below). Now a budget-**design** decision. |

All other findings remain queued per the waves below.

### Implementation status — Wave 2 re-triage (2026-06-25)

The second pass adversarially re-triaged **every remaining finding** (7-group investigate→skeptic workflow + direct repo verification) to find any objectively-correct work before declaring the gate. Outcome: **one safe code fix** (dead-code removal under CTX-008) + **one stale finding corrected** (CTX-007); everything else is genuinely gated. Per _"never stop because one task is blocked if unrelated work remains,"_ the hunt was exhaustive — including probing for sub-fixes inside each blocked item.

| Finding                 | Verdict                          | Basis (verified against current source)                                                                                                                                                                                       |
| ----------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CTX-008** sub-fix     | ✅ **Landed**                    | Dead `shouldCompact()` removed (`context-management.ts:100-111`); 0 callers repo-wide; zero behavior change; `tsc` clean. Parent convergence stays blocked.                                                                   |
| **CTX-007**             | ✅ **Corrected (stale)**         | Window source is already catalog-derived; the "hardcoded dict" claim was false. Part B (char-cap allocation) → budget-design (BK-11.02); fallback shared with CTX-002. No code.                                               |
| **CTX-001/009/010/011** | ⛔ Blocked (architecture)        | Trust-boundary + convergence cluster — all gated on the canonical packing-order ratification + the not-yet-existing VOL-20 egress predicate + BK-11.02/03.                                                                    |
| **CTX-013**             | ⛔ Blocked (dependency/judgment) | Equivalence test needs the single assembler (CTX-008); a strict budget-source lint would red the build on CTX-002's open fallback + CTX-006's security-blocked nonce → needs them first or a known-debt allowlist (judgment). |
| **CTX-014**             | ⛔ Blocked (roadmap)             | Net-new RAG/project-knowledge source; owned by BK-11.04 (VOL-12 a dependency). `factory.ts:346` is correct prose, not a defect.                                                                                               |
| **CTX-015**             | ⛔ Blocked (architecture)        | `summary_message_id` cannot be populated without a schema/persistence redesign; the id is assigned downstream at insert. (`created_at` inspected → DB metadata, not AC-19.)                                                   |
| **CTX-016**             | ⛔ Blocked (trade-off)           | Per-provider tokenizers = a dependency/perf/bundle-size trade-off across five surfaces with different runtimes; not mechanical.                                                                                               |
| **CTX-017**             | ⛔ Blocked (architecture)        | Wiring compaction on mobile/VS Code imports unratified triggers + the unblessed BK-11.02 algorithm; deleting the mobile dead compactor would be wrong (intended future wiring).                                               |

**Gate reached.** Every remaining context-runtime finding now requires a founder decision, an architectural ratification (the canonical packing-order), a security review, a product decision, or an ADR/sibling book (BK-11.02/03/04). See the decision registers at the end of this document.

### CRITICAL

**CTX-001 — Trust-boundary read scoping is unimplemented in context assembly.**
Description (Current): no surface gates **context assembly** by trust boundary; the managed-compute gate blocks models/features at the handler level but does not affect message/memory/tool assembly, so the same assembled context is built regardless of Local/BYOK/Managed origin. CH-11.01.03 is unimplemented.
Evidence: `apps/web/app/api/llm/v2/chat/route.ts:624-661` (gate checks `providerMode` but does not affect message building); `apps/web/.../WebChatRuntime.ts:126-127` (memory injected client-side, no mode check); `request-processor.ts` (no context assembly).
Violated requirements: AGI-TRUST-0001. Violated AC rules: §19 trust rule, AC-35, AC-36 (Local content/state MUST NOT cross a boundary it is not authorized for).
Root cause: trust-mode is enforced at routing/sync but never threaded into the assembler; assembly predates the §19 trust rule.
Recommended fix (Target): make the assembler trust-mode-aware — a `managed` turn MUST NOT assemble `local`-origin content; a `local`/`byok` turn MUST NOT read the shared cloud store. Reference the VOL-20 egress mechanism; do not redefine it.
Estimated impact: **High** — a trust-boundary correctness gap; the platform's core differentiator. Dependencies: VOL-20 egress predicate; CTX-008 (single assembler is the natural place to add the gate).

**CTX-002 — AC-20 violation: web hardcoded prefix-match budget fallback overrides the catalog SSOT.**
Description (Current): `getModelContextWindow()` falls through to a hardcoded prefix branch (`claude-`=200K, `gemini-`=1M, `gpt-5`=128K, `grok-`=128K, `deepseek`=64K, `sonar`=127K) for models not found in the catalog — overriding `models.json`. The `claude-` prefix returns 200K while `models.json` declares `claude-opus-4.8` at 1,000,000 (a **5× underestimate**), forcing premature compaction.
Evidence: `apps/web/lib/llm-providers/context-management.ts:73-81` (fallback); `:64-67` (correct catalog path).
Violated requirements: AGI-AI-0001. Violated AC rules: AC-20.
Root cause: defensive fallback added before the catalog was authoritative; prefix match is stale and overly broad.
Recommended fix (Target): derive the window solely from the catalog SSOT; replace the fallback with an explicit unknown-model policy (fail-closed or a single documented default), not per-prefix guesses.
Estimated impact: **High** — wrong budget → wrong compaction timing on the live web path. Dependencies: an unknown-model-window **policy decision** (Open Decision in the book) — do not hard-fail catalog-init gaps the fallback currently masks.
**Status:** ⛔ Blocked (architecture decision) — not implemented this wave. The correct fix replaces per-prefix guesses with one policy for catalog-misses (fail-closed vs. a single documented default); choosing that policy is a founder/architecture decision, not a mechanical swap. Deferred until the Open Decision is resolved.

### HIGH

**CTX-003 — AC-19 nondeterminism: tool-use IDs minted with `Date.now()`.**
Current: when a caller omits a tool-call id, the Anthropic mapping mints `` `call_${Date.now()}` ``, so identical inputs assemble non-identically. Evidence: `apps/web/lib/llm-providers/anthropic.ts:602`. Violated: AC-19. Root cause: clock-based id fallback. Fix: derive a deterministic id (content hash or stable counter) or require caller-provided ids. Impact: breaks reproducibility/testability. Deps: none.
**Status:** ✅ Resolved 2026-06-25 — fallback replaced with a stable, request-unique position id `` `call_${i}_${ti}` `` (message + tool index); only the id-absent defensive path changed, upstream ids pass through verbatim. Regression test: `apps/web/lib/llm-providers/anthropic.test.ts` (3 cases — stable ids, byte-identical repeat output, id passthrough). Validated: web `tsc --noEmit` clean (0 errors).

**CTX-004 — AC-19 nondeterminism: unordered-`HashMap` project file-type ordering, no tiebreaker.**
Current: project-context file-type counts iterate an unordered `HashMap`, sorted by count only with no secondary key, so equal counts order nondeterministically. Evidence: `apps/desktop/src-tauri/src/sys/commands/project_context.rs:515, 539-541`. Violated: AC-19. Fix: stable sort with an extension-name tiebreaker. Impact: non-identical assembled context. Deps: none.
**Status:** ✅ Resolved 2026-06-25 — extracted `cmp_file_type_desc` (count desc, then extension name asc) and applied it to the sort. Regression test: `project_context::tests::file_type_breakdown_is_deterministic` (asserts input-order independence) ✔; touched module 6/6 pass; crate compiles (exit 0).

**CTX-005 — AC-19 nondeterminism: injected-skill ranking has no equal-score tiebreaker.**
Current: skills are ranked by similarity score with no tiebreaker for equal scores. Evidence: `apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs:659-730`. Violated: AC-19. Fix: deterministic tiebreaker (id/name). Impact: non-identical assembly. Deps: none.
**Status:** ✅ Resolved 2026-06-25 — extracted `cmp_skill_match_desc` (score desc, then skill name asc) so equal-score skills select a stable top-2 independent of the skill manager's iteration order. Regression test: `send_message_setup::tests::skill_match_ranking_is_deterministic` ✔; touched module 17/17 pass; crate compiles (exit 0).

**CTX-006 — AC-19 vs security tension: per-call random nonce in tool injection.**
Current: `inject_tools_into_system_prompt_with_nonce()` generates a per-call random 16-byte nonce (the FIX-015 jailbreak defense), making the injected system prompt nondeterministic. Evidence: `apps/desktop/src-tauri/src/core/llm/prompt_tool_injection.rs:182-229` (`:198` nonce). Violated: AC-19 (in tension with the FIX-015 security control). Root cause: genuine design tension between determinism and forged-tool-catalog defense. Fix: derive the nonce deterministically from turn-stable inputs **without** weakening the jailbreak defense — **requires security review, not a mechanical swap**. Impact: nondeterminism, but security-gated. Deps: **mandatory security review** (AC-92).
**Status:** ⛔ Blocked (security review) — not implemented this wave. The nonce is the FIX-015 forged-tool-catalog defense; changing its derivation is a security control change that MUST pass review (AC-92) before any determinism change. Held deliberately.

**CTX-007 — AC-20: VS Code context-window source (originally "uses a local `MODEL_CONTEXT_LIMITS` constant").**
Current: **Correction (2026-06-25, verified against current source):** Part A of this finding is **stale/false**. `contextBudget.ts` does **not** define a hardcoded `MODEL_CONTEXT_LIMITS` dict — `:12-17` _imports_ it (with `DEFAULT_CONTEXT_LIMIT`, `CHARS_PER_TOKEN`, `normalizeConfiguredModelId`) from `../features/model-picker/modelConstants`. There is exactly one `MODEL_CONTEXT_LIMITS` in the extension (`modelConstants.ts:279-284`), and it is **catalog-derived**: `getModelContextLimits(MANUAL_MODEL_IDS)` (`:232`) + `getModelMetadataById(id).contextWindow` (`:235-237`), where `getModelContextLimits` reads `models.json` via the SSOT (`packages/types/src/model-catalog.ts:1931-1944`). So AC-20 / AGI-AI-0001 are **already satisfied** for the window source; the cited `contextBudget.ts:13-24` "hardcoded dict" does not exist. **Caveat (not resolved):** the unknown-model fallback (`?? DEFAULT_CONTEXT_LIMIT = 128_000`) is the **same open unknown-model-window policy as CTX-002** — shared, not independently closed. Part B (the `contextBuilder.ts:23-27` fixed char caps `MAX_GIT_DIFF_CHARS=2000`/`MAX_FILE_TREE_CHARS=1500`/… decoupled from the resolved budget) is **real but a budget-design/tuning decision** — choosing the per-section allocation is judgment, not mechanical (same class as CTX-012). Violated: none for the window source (already catalog-derived); Part B is a fidelity gap, not an AC-19/AC-20 defect. Deps: Part B → BK-11.02 budget-derivation; fallback → CTX-002's open policy.
**Status:** ✅ Part A already-compliant (stale finding — no code change) · ⛔ Part B blocked (budget-design, BK-11.02) · fallback shared with CTX-002. No production code change this wave.

**CTX-008 — §19 violation: multiple per-surface assemblers with divergent thresholds + dead code.**
Current: six assembly paths with diverging live triggers — web 60% (`route.ts:775-776`, with a **dead** `shouldCompact()` 80% never called, `context-management.ts:106-111`), desktop 95% (`context_compactor.rs:37`), CLI 90% (`compaction.rs:22-25`), mobile 80% warn-only (`contextBudgeter.ts:32-49`), VS Code budget-percent (3%/5%). "Two-plus assemblers, not one shared deterministic assembler." Violated: §19 (single deterministic assembler). Fix: converge onto one shared assembler with a canonical source-packing order and one budget-derivation. Impact: capability-honesty/reproducibility across surfaces. Deps: **packing-order ratification** (Open Decision); BK-11.02/BK-11.03 authored; a CI equivalence guard (CTX-013).
**Status:** ⛔ Parent convergence blocked (packing-order ratification + the not-yet-existing VOL-20 egress predicate + BK-11.02/03 — founder/architecture). ✅ **Safe sub-fix landed 2026-06-25:** the **dead `shouldCompact()`** (phantom 80% threshold, verified **0 callers/tests/re-exports repo-wide**) was removed from `context-management.ts:100-111`, eliminating a capability-honesty contradiction with the live 60% trigger (`route.ts:775-776`). **Zero** runtime behavior change; web `tsc` clean. The live per-surface triggers and the `triggerTokens` API-param default (`context-management.ts:47-51`) were deliberately left untouched (BK-11.02's decision).

### MEDIUM

**CTX-009 — Memory source class assembled only client-side; absent from server API routes.**
Current: memory facts are prepended via `WebChatRuntime` (client) but no v1/v2 API route assembles memory — direct API callers get 4/5 source classes. Evidence: `WebChatRuntime.ts:126-127`; 0 callers in `/api/*`. Violated: §19 (consistent assembly). Fix: move memory assembly server-side (trust-mode-aware, ties to CTX-001). Impact: inconsistent context for API vs client. Deps: CTX-001.

**CTX-010 — Web v1 fallback path performs no compaction (unbounded growth).**
Current: compaction is wired only on the v2 AI-SDK path; v1 fallback estimates tokens but never compacts. Evidence: `route.ts:768-798`; `factory.ts` base providers. Fix: route all paths through the shared assembler (CTX-008) or add v1 compaction. Impact: v1 contexts can exceed the window. Deps: CTX-008.

**CTX-011 — Desktop assembly split across two `ContextManager` implementations.**
Current: `core/agi` (generic segmentation) and `core/agent` (project-scoped) are separate; chat uses `core/agent`. Evidence: `core/agi/context_manager.rs:7-12`; `core/agent/context_manager.rs:81-109`. Fix: unify under the shared assembler. Impact: maintainability/drift. Deps: CTX-008.

**CTX-012 — Desktop `CompactionConfig.max_tokens = 100_000` hardcoded, decoupled from the resolved window.**
Current: `CompactionConfig::default()` sets `max_tokens: 100_000` (`context_compactor.rs:32`). **Correction (2026-06-25, on implementation reading):** the audit's "derive from the resolved window / Deps: none" was based on **incomplete reading**. `config.max_tokens` is the compaction **target ceiling** (the size to compact _down to_), **not** the auto-compaction trigger window — `should_auto_compact(current, max_tokens, …)` already takes the **caller-supplied resolved window** as a separate `max_tokens` argument and derives the trigger as `max_tokens * auto_compact_threshold` (`context_compactor.rs:50-60`). So the trigger already honors the resolved window. The residual issue is that the compaction _target_ (100K) does not scale with the window — for a 1M-window model it over-compacts; for a 128K model it is reasonable. Choosing the target's fraction-of-window is a **budget-design decision**, not a mechanical "derive from window." Violated: none cleanly (AC-20 governs the _trigger_, which already complies). Impact: over-aggressive compaction target on large-window models. Deps: budget-design decision (ties to the packing-order/budget work in BK-11.02).
**Status:** ⛔ Blocked (reclassified to architecture/design) — moved out of Wave 0. Not a Wave-0 mechanical item; do not re-pick as one. Defer to the budget-derivation design (BK-11.02 / Wave 3).

### LOW

**CTX-013 — No cross-surface CI guard for catalog-only budget or assembled-context equivalence.**
Current: nothing enforces AC-20 budget-from-catalog or AC-19 reproducibility across surfaces. Evidence: `architecture-constitution.md:1004` (rule, no check). Fix: add a guard (golden-fixture equivalence test + a budget-source lint). Impact: regressions go uncaught during convergence. Deps: CTX-008 (gives a single target to test).

**CTX-014 — Web project-knowledge / RAG source class entirely absent (4/5 classes).**
Current: no document/file injection or knowledge-base assembly in web. Evidence: `factory.ts:346` is a caching heuristic, not assembly. Fix: implement the project-knowledge source (deferred to VOL-12 / a RAG book). Impact: feature gap, not a determinism defect. Deps: VOL-12.

**CTX-015 — Desktop compaction is not row-auditable.**
Current: summary `id=0`, `summary_message_id=None`, no FK to the deleted messages. Evidence: `context_compactor.rs:158-164, 279-293`. Fix: persist an auditable compaction record. Impact: cannot trace what compaction removed. Deps: none.
**Status:** ⛔ Blocked (architecture) — verified 2026-06-25: the summary `Message` is built in-memory with `id: 0` in `get_compacted_messages` (`context_compactor.rs:~280`); the real row id is assigned downstream at DB insert (`context_monitor.rs:371-382`), so `summary_message_id` cannot be populated at the `CompactionResult` site without a schema/persistence redesign (FK + auditable record) — a design decision, not mechanical. _Adjacent disposition (`created_at`):_ the in-memory summary's `created_at: Utc::now()` is **DB metadata only** — it is **not** serialized into the assembled prompt bytes (content is `[Compacted Context]\n\n{summary}`), and the **persisted** summary uses a deterministic `created_at` derived from the prior message (`context_monitor.rs:336-340`). Therefore **not an AC-19 concern**; inspected, no finding opened.

**CTX-016 — Token counting uses char/byte heuristics, not provider tokenizers.**
Current: web 3.5-chars/token (`context-management.ts:90-98`), desktop/CLI text/4. Fix: per-provider tokenizers where the window is tight. Impact: estimation error near the budget edge. Deps: none.

**CTX-017 — Mobile & VS Code track/warn on budget but never compact.**
Current: both compute budget but perform no compaction. Evidence: `contextBudgeter.ts`; `contextBudget.ts`. Fix: wire compaction (or document the intentional no-compaction posture). Impact: those surfaces can hit the window with no recovery. Deps: CTX-008.

---

## Implementation Plan (Phase 4) — dependency-ordered waves

Prioritized for **architectural correctness over issue count**: restore the violated invariants (trust, budget, determinism) before the large convergence refactor, and gate the convergence on the architecture decisions it depends on.

| Wave                                          | Items                                                                                                                               | Rationale & gate                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wave 0 — Invariant restoration** ⛔ blocked | CTX-002 (AC-20 web fallback), CTX-012 (desktop max_tokens)                                                                          | **Both items blocked after implementation reading, none landed.** CTX-002 needs the unknown-model-window policy decision (Open Decision). CTX-012 was **reclassified** out of Wave 0 — its audit fix ("derive from window") was based on incomplete reading; it is a budget-design decision (see CTX-012). |
| **Wave 1 — Determinism** ✅ 3/4 done          | CTX-003, CTX-004, CTX-005 (deterministic ids + sort tiebreakers) ✅ **done 2026-06-25**, then CTX-006 (nonce) ⛔                    | AC-19 reproducibility. **CTX-003/004/005 implemented + tested + validated** (see status table above). **CTX-006 held** — security-gated (mandatory security review, AC-92); not merged blindly.                                                                                                            |
| **Wave 2 — Trust boundary**                   | CTX-001, CTX-009                                                                                                                    | Thread trust-mode into assembly (managed never reads local-origin) and move memory assembly server-side. **Gate:** consumes the VOL-20 egress predicate; best landed with the single assembler (Wave 3) so the gate has one home.                                                                          |
| **Wave 3 — Assembler convergence (gated)**    | CTX-008, CTX-010, CTX-011, CTX-017                                                                                                  | The §19 target: one shared deterministic assembler + canonical packing order across surfaces. Large refactor on live chat paths. **Gate:** packing-order **ratification** (Open Decision / architecture authority) + BK-11.02/BK-11.03 authored + CTX-013 equivalence guard in place first.                |
| **Wave 4 — Coverage & tooling**               | CTX-013 (CI guard — pull earlier if convergence starts), CTX-015 (auditability), CTX-014 (RAG source, VOL-12), CTX-016 (tokenizers) | Completeness + the guardrail that protects the converged assembler.                                                                                                                                                                                                                                        |

**Critical path:** unknown-model policy → CTX-002 → (Wave 1 determinism in parallel) → packing-order ratification + BK-11.02/03 → CTX-013 guard → CTX-008 convergence (carrying CTX-001/009/010/011). Waves 0–1 are **unblocked today**; Wave 3 is **blocked on a founder/architecture decision** (the canonical packing order) and on sibling books.

---

## Traceability validation

| Link                        | Status                                                                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| → Architecture Constitution | Every finding cites AC-19 / AC-20 / §19 trust rule (AC-35/36) by ID. ✔                                                                                                                                                         |
| → Requirements              | AGI-AI-0001 (catalog SSOT), AGI-TRUST-0001 (trust boundary). ✔                                                                                                                                                                 |
| → ADR                       | None yet — BK-11.01 is `planned`; no ADR ratifies the assembler (recorded as the Wave-3 gate). ✔ (honest absence)                                                                                                              |
| → Engineering Book          | All findings ← `AGI-DOC-0018` (VOL-11 / BK-11.01) generation audit. ✔                                                                                                                                                          |
| → Roadmap                   | VOL-11 / BK-11.01 (and BK-11.02/03 as Wave-3 prerequisites). ✔                                                                                                                                                                 |
| → Repository paths          | Every finding carries a `file:line`. ✔                                                                                                                                                                                         |
| → Existing trackers         | No duplication with register §9 (`ARCH-D*`) or `known-flaws.md`; these context-assembly defects are newly book-discovered. ✔                                                                                                   |
| → Resolved fixes + tests    | CTX-003 → `anthropic.test.ts` (3 cases); CTX-004 → `file_type_breakdown_is_deterministic`; CTX-005 → `skill_match_ranking_is_deterministic`. Each resolved finding links fix → regression test → validation. ✔                 |
| → Wave 2 cleanup            | CTX-008 sub-fix → dead `shouldCompact()` removed (`context-management.ts`, 0-caller proof, `tsc` clean); CTX-007 → corrected to current source (catalog-derived). Every remaining finding → a decision register entry below. ✔ |

_Wave 0–1 implementation pass (2026-06-25, option A): CTX-003/004/005 resolved, tested, and validated; CTX-002, CTX-006, and (reclassified) CTX-012 held as blocked with reasons above. No commit was made — three independently-reviewable diffs await founder review._

_Wave 2 re-triage + cleanup (2026-06-25): adversarially re-triaged all remaining findings. Landed one safe code fix — removed the dead `shouldCompact()` (CTX-008 sub-fix, zero behavior change, `tsc` clean). Corrected one stale finding (CTX-007 — window source already catalog-derived). All eight remaining findings (CTX-001/008/009/010/011/013/014/015/016/017) are now gated on a founder decision, architectural ratification, security review, product decision, or sibling book (BK-11.02/03/04). **Gate reached** — see decision registers below. No commit was made._

---

## Decision registers (the gate — all remaining context-runtime work)

Every unresolved finding maps to exactly one decision class below. Nothing here is objectively implementable; each needs an owner.

**Remaining founder / architectural decisions**

- **Canonical source-packing order + single shared assembler (the §19 target).** Ratify the one deterministic packing order all surfaces converge on. Unblocks CTX-008 → CTX-001/009/010/011/017. Owner: founder + architecture. Recommended: ratify via an ADR seeded from BK-11.01's Target precedence, then author BK-11.02 (compaction algorithm/threshold) and BK-11.03 before the convergence refactor.
- **Unknown-model context-window policy (AC-20 fallback).** Decide fail-closed vs. one documented default for catalog-miss models. Unblocks CTX-002; also closes the shared fallback caveat in CTX-007. Recommended: a single documented default (e.g. a conservative floor) + an explicit tracked-gap log, not per-prefix guesses.
- **Compaction budget-target derivation.** Decide how the compaction target scales with the resolved window (the fraction-of-window). Unblocks CTX-012; owned by BK-11.02. Recommended: derive the target from the window with a documented headroom fraction.

**Remaining security reviews**

- **Deterministic tool-injection nonce (CTX-006).** Re-derive the FIX-015 nonce from turn-stable inputs **without** weakening the forged-tool-catalog defense. Owner: security (AC-92). Recommended: security-reviewed keyed derivation over turn-stable inputs; do **not** swap mechanically.

**Remaining product decisions**

- **Mobile / VS Code compaction posture (CTX-017).** Wire real compaction vs. document an intentional no-compaction posture. Owner: product. Tied to BK-11.02's algorithm.
- **Web project-knowledge / RAG source class (CTX-014).** Net-new feature; owned by **BK-11.04** (VOL-12 dependency). Owner: product + roadmap.

**Remaining ADRs / sibling books**

- **BK-11.02 / BK-11.03** (compaction + summarization) and **BK-11.04** (project-knowledge/RAG) must be authored before their dependent findings are implementable. **CTX-013** (cross-surface CI equivalence guard + budget-source lint) lands once a single assembler exists and the open AC-20 violations are closed (else it reds the build on known debt).
