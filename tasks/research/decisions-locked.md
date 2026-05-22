# Decisions Locked — Phase 1

Tracking strategic decisions made during the post-research synthesis sitting (2026-05-08). Each entry: decision, picked option, one-line rationale, follow-up actions.

---

## Decision #4 — Capture session scope (2026-05-08)

**Picked:** Full 8-flow capture (~3–4 hours)

**Rationale:** Maximum corpus completeness; the supporting 2 flows (Claude Code slash commands + Perplexity streaming/citations) pay back later and are cheap to capture once the user is already in a focused capture sitting.

**Follow-up actions:**

- Precise capture checklist authored in `tasks/research/phase1-plan.md` after all 5 decisions land.
- User runs the capture session and drops PNGs into `~/Desktop/reference/ui/_capture-2026-05/<surface>/<flow>.png`.
- Re-synthesize captured flows into the gap matrix once delivered.

---

## Decision #1 — Skill format (2026-05-08)

**Picked:** Compatible-superset (all 14 of Anthropic's frontmatter fields + our extensions)

**Rationale:** Preserves one-way compat (their skills run on us) while letting us extend for our differentiators (per-provider model fallback, BYOK bindings, sandbox profiles, local-only flags) without forking from a future Anthropic schema evolution.

**Follow-up actions:**

- Phase 1 plan specifies the v1 extension fields and migration path if Anthropic adds something we already extended.
- Schema lives in `packages/skills/src/schema.ts` (Zod), loader in `packages/skills/src/loader.ts`, on-disk paths `~/.agiworkforce/skills/` (user-level) + `<project>/.agiworkforce/skills/` (project-level) + plugin-provided paths (compat: also read `~/.claude/skills/` if present so users don't double-install).
- `Skill` tool added to `apps/cli/src/tools.rs` with model-driven dispatch and system-reminder skill list (matches Anthropic's pattern).

---

## Decision #2 — Phase 1 starting surface (2026-05-08)

**Picked:** Unified shell first (`apps/desktop/`)

**Rationale:** Visible differentiation day one validates the Cowork-light thesis with real users; Anthropic's Customize migration window is time-bound and we land before they consolidate.

**Follow-up actions:**

- Phase 1 plan enumerates concrete files in `apps/desktop/src/` to touch: status-footer chip component, inline tool-call group-header renderer, three-tier connector permission UI.
- Owning surface engineer: `desktop-engineer` (per CLAUDE.md ownership map).
- Weekly milestones: W1 status-footer chip + permissions chip turns orange, W2 inline tool group-header + collapsed/expanded states, W3 three-tier connector permission grid + per-tool icon row, W4 polish + demo.
- Agent-loop hardening (compaction + streaming-tool executor + ToolSearch + speculation) deferred to Phase 2.
