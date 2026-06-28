# Volume 34 — Competitive Parity (Claude / ChatGPT / Codex Reverse-Engineering)

Status: Canonical · program volume (depth of Master Spec Vol 34)
Authority: `docs/strategy/01-competitive-teardown.md`, `docs/strategy/02-gap-analysis.md`, `docs/current/parity-implementation-matrix.md`, `docs/current/source-of-truth.md`. Where this volume and the parity matrix differ on a specific feature, **the matrix wins on detail**.

## Philosophy & Cloud/Local stance

Parity means **user-capability and workflow parity** — a user can do the same job, with the same affordances, to the same quality bar. Parity never means copied code, copied assets, copied prompts, or copied branding. We study Claude/ChatGPT/Codex to understand _what jobs the surface does and why_, then build that capability from license-clean donors or original work (Vol 7, `PORTING-TRACKER.md`).

The single most load-bearing insight from the teardown (`strategy/01` §1): neither Anthropic nor OpenAI ships "seven apps." Each ships **one agent runtime + one model platform, then thin clients**. AGI's monorepo already has this shape. So parity work is mostly _runtime_ parity, not surface count — every hour hardening shared `packages/`/`crates/` buys parity on six surfaces at once.

Cloud/Local divergence is where we _deliberately diverge_, not match. Incumbents are single-lab, cloud-only, data-flywheel businesses. AGI's parity bar on Cloud features (managed chat, sync, artifacts hosting) tracks the incumbents; AGI's _advantage_ features (Local no-egress, multi-provider, BYOK at no markup) have **no incumbent to match** — they exist because incumbents are structurally conflicted out (`strategy/01` §5).

## Binding rules

1. **Parity = capability/workflow, never copied code/assets/branding.** Study `claude-code` for intent only; it is proprietary (no license) — never copy it, even renamed. Port from license-clean twins (`codex-rs` Apache-2.0, `continue`, `odysseus`, etc. — `PORTING-TRACKER.md`).
2. **The parity matrix is the unit of work.** Pick a row or tightly-related rows from `parity-implementation-matrix.md`; implement the smallest end-to-end slice (UI control → store → runtime → persistence → trust label → test). Never claim parity from placeholder UI or a green typecheck.
3. **Marketing is gated to `Present`.** A capability may not appear in public copy until its matrix row is `Present` (Operating Law 5; `strategy/03` §4 marketing-vs-reality theme). `Partial`/`Missing`/`Gated` rows are roadmap, not claims.
4. **Competitor facts decay — re-verify.** All competitor facts in `strategy/01` are web-sourced June 2026; model lineups, pricing, and stack choices drift. Re-confirm from a primary source before any external use or before building to a competitor detail.
5. **Match the job, diverge on trust.** Where an incumbent's design assumes cloud egress, re-derive the AGI version inside the active trust boundary (Vol 3). Never import a competitor flow that would silently cross Local→BYOK/Managed.
6. **Model IDs from the catalog.** Competitor docs name competitor model IDs; AGI selectors/tests/routes read only `packages/types/src/models.json`.

## Repository map / authority docs

- Parity ledger: `docs/current/parity-implementation-matrix.md` (rows, surfaces W/D/M/CLI/VSC/CHR, status `Present`/`Partial`/`Missing`/`Gated`).
- Teardown + gap framing: `docs/strategy/01-competitive-teardown.md`, `02-gap-analysis.md`.
- Reference reading: `docs/strategy/09-reference-codebases.md` (`claude-code`, `odysseus`), `10-oss-corpus-port-plan.md`.
- Contracts that encode the divergence: `packages/types/src/suite-contracts.ts`, `packages/types/src/models.json`.
- Local UI reference for visual parity: `/Users/siddhartha/Desktop/claude_reference` (study-only).

## Competitor notes (the reverse-engineering summary)

- **Claude suite (7 surfaces):** Desktop is **Electron** (confirmed) — AGI's Rust/Tauri desktop is the clearest technical wedge. Web Projects use **RAG retrieval, not full-context stuffing** (Vol 11). CLI is **TS + Ink + Bun**, "thinnest shell over the model." IDE extensions run a `127.0.0.1` MCP `ide` server with a per-session token. Chrome extension is where the **prompt-injection arms race** lives (Vol 30). Cowork reaches **connectors first, browser second, computer-use last** ("most precise tool first") — adopt this ordering (Vol 17/18). Artifacts include **AI-powered artifacts** (viewer authenticates with their own account) — a novel distribution mechanic worth disproportionate polish (Vol 14). Skills are an **open cross-platform standard** (Vol 21) — adopt it, don't fork it.
- **ChatGPT/Codex suite:** Web is **Remix/React Router v7, not Next.js**; macOS desktop is **fully native**; mobile is **native SwiftUI + Jetpack Compose** — which means AGI's Expo/RN choice is _not_ a known disadvantage (no incumbent mandate for RN). The **Responses API is a stateful agent runtime** (web/file search, code interpreter, computer use, remote MCP, shell tool, hosted container, compaction, skills) — this is the runtime AGI's shared runtime must reach parity with (Vol 6/17). `AGENTS.md` is Codex's shared instruction format across surfaces — AGI uses the same convention.
- **Deliberate AGI divergence** (`strategy/01` §5, `02` §4): local-first/no-egress, multi-provider neutrality + BYOK at no markup, Rust-first desktop, a real on-device mobile LLM. These are assets, not gaps — protect them.

## Checklists

### Per-row parity execution (run for each matrix row)

- [ ] Read the matrix row: surfaces, competitive target, AGI requirement, current status.
- [ ] Read the listed AGI anchor paths before editing (matrix "AGI anchors" column).
- [ ] Study the competitor behavior from the cited source or `claude_reference` (intent only).
- [ ] Identify the license-clean donor for any ported logic (`PORTING-TRACKER.md`); record attribution.
- [ ] Build the smallest end-to-end slice: UI control → state/store → runtime/service → persistence → trust/provider label → test.
- [ ] Confirm the slice respects the active trust boundary (no silent Local→BYOK/Managed crossing).
- [ ] Update the matrix row status; only set `Present` when verifiable end-to-end.
- [ ] If incomplete, leave a tracked gap (matrix `Partial`/`Missing` + `known-flaws.md`), never a fake claim.

### Anti-copy / IP discipline

- [ ] Confirm no `claude-code` source was copied (even renamed) into the change.
- [ ] Confirm any ported file preserves upstream `LICENSE`/`NOTICE` headers + a `THIRD_PARTY_NOTICES.md` entry.
- [ ] Confirm no competitor branding, asset, prompt string, or copyrighted copy was imported.
- [ ] Run `scripts/check-licenses.mjs` (the license gate) green.

### Marketing-vs-reality gate

- [ ] Map every present-tense public claim to a matrix row.
- [ ] Confirm each such row is `Present` (not `Partial`/`Missing`/`Gated`).
- [ ] Flag mobile over-claims specifically (vision = OCR-only; translation = en↔hi only; "parity" itself) per `strategy/03` R5/R6.
- [ ] Confirm "no markup" is framed as a **trust feature**, not the revenue line (Vol 37).

### Re-verification cadence (before external use)

- [ ] Re-confirm competitor model lineups against primary docs (they drift fast).
- [ ] Re-confirm any cited competitor stack/pricing/limit fact against a primary source.
- [ ] Mark anything unconfirmed `[unverified]`; do not repeat it in investor or marketing materials.

## Definition of Done

A parity domain is "production-ready" when: every targeted matrix row is `Present` and verified end-to-end on its declared surfaces; the change carries clean license attribution with zero `claude-code` copying; all present-tense marketing maps to `Present` rows; competitor facts that informed the build were re-verified; and the trust boundary held across the new flow.

## Anti-patterns

- Copying `claude-code` (or any no-license/competing-use donor) code, renamed or not.
- Claiming "parity with Claude/ChatGPT" as a blanket statement; parity is per-row, per-surface.
- Shipping a flow that mirrors a cloud-only incumbent design and silently egresses Local data.
- Marketing a `Partial`/`Missing` capability in the present tense.
- Widening surface count to "catch up" instead of hardening the one shared runtime (the actual parity lever).
- Hardcoding a competitor's model ID, or any model ID, instead of reading `models.json`.
