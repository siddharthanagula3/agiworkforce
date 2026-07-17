# Volume 40 — Governance & the Session Loop

Status: Canonical · program volume (depth of Master Spec Vol 40)
Authority: `docs/spec/AGI_CODE_MASTER_SPEC.md` (the constitution + precedence + Operating Laws), `AGENTS.md`, `CLAUDE.md`, `docs/strategy/11-execution-playbook.md`, `PORTING-TRACKER.md`. This volume governs how the playbook is changed and how every autonomous session operates.

## Philosophy & Cloud/Local stance

A playbook only works if it is _governed_ — if there is one precedence order, one operating loop, and enforcement that fails the build when the rules are broken. This volume is that governance. The Master Spec is the terse constitution; these 40 volumes are its depth; the strategy/engineering/agent-context docs are the working detail. When they conflict, precedence decides (below), and the higher source wins.

The session loop is the operating system of the whole repo: **read the laws → pick one increment → study references → port license-clean → verify → commit → update the tracker → next.** It is designed to run with limited context — each increment is a self-contained work order a fresh subagent can finish in one focused pass (`strategy/11` §6).

Cloud/Local stance in governance terms: the trust boundary is the one rule that is _never_ a judgment call. Any change touching networking, sync, or routing must pass the trust-boundary contract tests before merge; a violation is a P0 regardless of how small the diff looks. Governance exists primarily to keep that boundary — the product's moat — provably intact across every session and every surface.

## Binding rules

1. **Precedence is fixed.** When sources conflict, obey in order: (1) `AGENTS.md` + `CLAUDE.md`; (2) this manual (`docs/spec/`); (3) `docs/current/`; (4) `docs/strategy/` + `docs/engineering/`; (5) `docs/agent-context/`. Treat `audit/**`, `reports/**`, `tasks/**`, `docs/archive/**`, and generated parity reports as evidence/working notes, never as law (Master Spec Preamble).
2. **Change the law in the same PR as the behavior.** This manual is canonical; any rule change updates the manual (and its mirror in `AGENTS.md` where required) in the same change that changes the code. Critical rules stay mirrored and are guarded by `pnpm check:agent-context`.
3. **Run the session loop, in order, every session.** Read Preamble + Operating Laws → pick one increment from `PORTING-TRACKER.md` → study references for intent → port from license-clean donors → attribute → verify (Operating Law 4) → commit on `feat/agi-alpha` (hooks pass; never `--no-verify`) → update the tracker → next.
4. **One increment at a time, self-contained.** Each increment is a work order with source files, target files, acceptance, and verify commands. Branch `inc/<id>-<slug>` off the integration branch; squash-merge to `feat/agi-alpha`; integration → `main` at phase gates (`strategy/11` §1).
5. **No increment lands without attribution + a green Definition of Done.** Every ported file records source repo + license + commit in `PORTING-TRACKER.md` + a `THIRD_PARTY_NOTICES.md` entry with preserved upstream headers; the license gate (`scripts/check-licenses.mjs`) passes; the per-increment DoD is green.
6. **The Operating Laws bind every session** (trust boundaries absolute; model IDs catalog-owned; adapt-never-copy-proprietary; verify-before-done; no theater; one-concern-per-file; commit+verify loop; runtime-before-surfaces). Do not relitigate them per task.
7. **`PORTING-TRACKER.md` is the single source of truth for status.** "What's done / in-flight / next" lives there; update it after every increment so the loop is resumable indefinitely.

## Repository map / authority docs

- Constitution + precedence + Operating Laws + volume index: `docs/spec/AGI_CODE_MASTER_SPEC.md`.
- Agent entry + mirrored critical rules: `AGENTS.md`, `CLAUDE.md`, path-scoped `apps/*/AGENTS.md`, `packages/ai/providers/AGENTS.md`, `services/AGENTS.md`.
- The loop protocol + phases + gates: `docs/strategy/11-execution-playbook.md`; live status + license register: `PORTING-TRACKER.md`; attribution: `THIRD_PARTY_NOTICES.md`.
- Working detail: `docs/current/` (source-of-truth, parity matrix, PRD, BYOK strategy, trust-mode matrix), `docs/engineering/` (naming, service-layer, harness rollout), `docs/agent-context/` (repo-map, known-flaws, commands, risk-map, llm-failure-taxonomy).
- Surface subagents: `.claude/agents/` (`desktop-engineer`, `web-engineer`, `mobile-engineer`, `cli-engineer`, `chrome-ext-engineer`, `vscode-ext-engineer`, `supervisor`).

## Competitor notes

The incumbents' governance lesson is the **shared instruction format**: OpenAI's `AGENTS.md` is the single instruction file across all Codex surfaces (`strategy/01` §3.1), and Anthropic ships one runtime with consistent agent behavior across surfaces. AGI uses the same convention — `AGENTS.md` as the canonical entry, with path-scoped variants — so governance is uniform across the six surfaces rather than re-invented per surface. The deeper lesson from `strategy/01` §4 (the "trust & safety tax" and continuous review-compliance) is that governance is _ongoing_, not one-time: enforcement checks must run every session, every commit, forever.

## Checklists

### Session start

- [ ] Read the Master Spec Preamble + Operating Laws.
- [ ] Read the volume(s) for the surface/domain being touched.
- [ ] Read the nearest path-scoped `AGENTS.md` before editing a high-risk surface.
- [ ] Pick exactly one increment from `PORTING-TRACKER.md` (or the next backlog item).

### Per-increment loop (`strategy/11` §1)

- [ ] Branch `inc/<id>-<slug>` off the integration branch `feat/agi-alpha`.
- [ ] Study the named `claude-code` reference for _intent only_ (optional; never copy).
- [ ] Port/adapt from the named **license-clean** donor into the target files.
- [ ] Update `PORTING-TRACKER.md` (status + attribution row) + `THIRD_PARTY_NOTICES.md`.
- [ ] Run the increment's verify commands (all must pass).
- [ ] Commit with a conventional message; pre-commit hooks pass (never `--no-verify`).
- [ ] Update `known-flaws.md` if residual risk remains; update this/the tracker's status.

### Per-increment Definition of Done (must be green before commit)

- [ ] `pnpm typecheck:all` + `pnpm lint` green (TS); `cargo check --workspace --locked` + `cargo clippy` green (Rust).
- [ ] Targeted tests for the changed behavior pass; new behavior has a new test.
- [ ] The relevant surface check from `docs/agent-context/commands.json` passes.
- [ ] `check:llm-failures` + `check:agent-context` + `check:boundaries` green.
- [ ] For UI: an e2e/screenshot check of the launch-critical flow.
- [ ] For networking/trust changes: trust-boundary contract tests pass.
- [ ] `git diff --check` clean; `PORTING-TRACKER.md` updated.

### Governing the playbook itself

- [ ] Any rule change updates this manual (+ `AGENTS.md` mirror where required) in the same PR.
- [ ] `pnpm check:agent-context` confirms mirrored critical rules stay in sync.
- [ ] New repeated bug class → update `docs/agent-context/known-flaws.md` (and taxonomy if structural).
- [ ] Precedence respected: no working-note/audit doc treated as law.

### Subagent dispatch (CLAUDE.md "Surface Subagents")

- [ ] Single-surface substantial work → dispatch that surface engineer.
- [ ] Work touching 2+ surfaces / cross-surface synthesis / multi-surface release → dispatch `supervisor` (delegate-only).
- [ ] Scope already narrowed to one surface by the user → edit directly, don't spawn.

### Enforcement (must run / pass)

- [ ] `check:structure-conventions`, `check:agent-context`, `check:licenses`, `check:llm-operability`/`check:llm-failures`, `check:boundaries`, `check:service-layer`, `check:repo-organization`, `check:hooks`, and the trust-boundary contract tests.

## Definition of Done

Governance is "production-ready" when: precedence is unambiguous and obeyed; every session runs the loop in order and leaves `PORTING-TRACKER.md` accurate; no increment lands without attribution + a green DoD + passing hooks; rule changes ship in the same PR as the behavior with mirrors kept in sync by `check:agent-context`; and the enforcement checks (structure, licenses, boundaries, llm-failures, trust-boundary tests) all pass in CI. The loop is resumable indefinitely with limited context.

## Anti-patterns

- Editing code that changes a rule without updating this manual / `AGENTS.md` in the same PR.
- Committing with `--no-verify`, or marking an increment done on a green build alone (Operating Law 4/5).
- Treating an audit/report/working-note doc as law (precedence violation).
- Copying `claude-code` (proprietary) or any competing-use/AGPL/no-license donor (license gate).
- Landing a ported file with no `PORTING-TRACKER.md` row / `THIRD_PARTY_NOTICES.md` entry / preserved header.
- Running several increments at once so none is independently verifiable/resumable.
- Spawning a surface subagent when the user already scoped the task to that one surface (edit directly).
