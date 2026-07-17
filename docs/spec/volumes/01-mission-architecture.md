# Volume 01 — Mission, Vision, Philosophy, Architecture

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 1)
Authority: this manual + `docs/strategy/README.md`, `docs/strategy/01-competitive-teardown.md`, `docs/strategy/02-gap-analysis.md`, `docs/current/source-of-truth.md`

## Philosophy & Cloud/Local stance

AGI is **the AI workspace you own**: multi-provider, local-first, private by architecture. The mission is to be the application layer users choose for Claude/ChatGPT-class workflows _without single-lab lock-in_, and to earn a sovereign/privacy-first enterprise wedge.

The architectural conviction, lifted straight from the teardown of the two incumbents, is the most consequential fact in this whole playbook: **neither Anthropic nor OpenAI builds "seven apps."** Each builds one agent runtime and one model platform, then ships thin clients over it (`docs/strategy/01` §1). The surfaces are the cheap, replicable part. The defensible parts are (1) the model + routing + agent-runtime layer, (2) the permission/trust/safety system, and (3) ecosystem standards (MCP, Skills).

AGI's monorepo already encodes this instinct — shared `packages/` (TS) and `crates/` (Rust) with thin per-surface clients. So our philosophy is: **adapt licensed OSS for the replicable layer; originate only the moat.** The moat is exactly three things the incumbents are structurally unwilling to do (`docs/strategy/01` §5): local-first/no-egress privacy, multi-provider neutrality with BYOK at no markup, and Rust-first desktop. Originate trust enforcement, client-side BYOK, and metered managed billing; port everything else from license-clean donors.

Cloud vs Local is not a deployment detail here — it is the product's center of gravity. Local is on-device or local-host execution that never silently leaves the device. Managed Cloud is AGI-managed compute (public alpha, open by default). BYOK is the user's own key, direct. Hybrid is _consented_ routing across them. Every domain volume restates how its subsystem behaves under each mode, because the answer is rarely the same.

## Binding rules

1. **Build the runtime once; reuse it on every surface.** Do not re-implement chat, agent loops, providers, or trust logic per surface. New surfaces consume `packages/*` and `crates/*`; they never fork the runtime.
2. **Originate only the moat.** Trust-boundary enforcement, client-side BYOK, and exactly-once managed metering are first-party. Everything else is adapted from license-clean donors (Operating Law 3; `PORTING-TRACKER.md`).
3. **Harden the one runtime before widening surfaces.** One hardened runtime beats six half-built ones (`docs/strategy/02` §5). Depth in the active surface before breadth.
4. **Trust boundaries are absolute** (Operating Law 1). Local never silently routes to BYOK or Managed. A violation is a P0.
5. **No claim exceeds shipped scope.** Marketing and UI may only assert what the parity matrix marks `Present` (Operating Law 5).
6. **Model IDs are catalog-owned.** Read every ID/capability from `packages/contracts/types/src/models.json` (Operating Law 2).

## Repository map

This volume owns the top-level shape, detailed in Vol 2:

- `apps/{web,desktop,mobile,cli,extension,extension-vscode,sandbox}` — the seven surfaces (thin clients).
- `packages/*` — shared TS: `types` (contracts + `models.json`), `providers`, `routing`, `runtime`, `provider-runtime`, `unified-chat`, `mcp`, `skills`, `ui`, `stores`, `local-llm`, `data-layer`, `utils`.
- `crates/*` — shared Rust: `agiworkforce-protocol`, `agiworkforce-command-registry`, `agiworkforce-task-runtime`, `agiworkforce-execpolicy`, `sandbox-policy`, `agiworkforce-network-proxy`, `agiworkforce-plugin-runtime`, and `agiworkforce-utils-*`.
- `services/{api-gateway,signaling-server}` — backend; managed-compute scaffolding.
- `apps/web/db/neon` — canonical migrations.
- `docs/spec/`, `docs/current/`, `docs/strategy/`, `docs/agent-context/` — law, source-of-truth, analysis, repo telemetry.

## Competitor notes

- **Claude (Anthropic):** one account, one usage pool, one model set; Cowork and Claude Code are the _same_ agentic engine re-skinned for terminal, desktop, browser, IDE (`docs/strategy/01` §2). Desktop is Electron — which makes Rust/Tauri AGI's clearest technical wedge.
- **ChatGPT/Codex (OpenAI):** one account + the Responses API as a stateful agent runtime, fronted by ~10 surfaces; Codex CLI rewritten in Rust; `AGENTS.md` is their shared instruction format (`docs/strategy/01` §3).
- **AGI divergence:** both incumbents are single-lab by definition and cannot lead on no-egress privacy without cannibalizing inference revenue. AGI's deliberate divergence is multi-provider neutrality (15 providers in `models.json`), provable local-first trust boundaries (`suite-contracts.ts`), BYOK at no markup, and a Rust/Tauri desktop. These are assets, not gaps (`docs/strategy/02` §4) — protect them as the center of gravity.

## Checklists

### Architecture review (every cross-surface change)

- [ ] New capability lives in `packages/*` or `crates/*`, not duplicated per surface.
- [ ] Reusable Rust moved to `crates/` only when a second consumer exists.
- [ ] No surface re-implements trust, sync, or provider logic locally.
- [ ] Shared contract changes land in `packages/contracts/types` first, then surfaces adapt at the boundary.
- [ ] The change strengthens (or is neutral to) one of the three moat assets; if it weakens one, it is rejected or escalated.

### Mission/scope guard (every feature)

- [ ] Feature declares which surfaces and which trust modes it supports.
- [ ] Feature is hidden (not faked) where unsupported (Operating Law 5).
- [ ] Marketing/UI copy is gated to `Present` rows in `docs/current/parity-implementation-matrix.md`.
- [ ] Work targets the active serial surface unless the founder authorized otherwise (`source-of-truth.md` Launch Lock).

### Build discipline

- [ ] Increment chosen from `PORTING-TRACKER.md` (study → port → attribute → verify → commit).
- [ ] License gate (`scripts/check-licenses.mjs`) passes; upstream attribution preserved.
- [ ] No model ID hardcoded; read from `models.json`.
- [ ] Verification done per Operating Law 4 (inspect path, surface check, targeted + trust-boundary tests); residual risk in `known-flaws.md`.

### Security/trust baseline

- [ ] No code path lets Local content reach BYOK/Managed without the explicit fork (Vol 3).
- [ ] Trust labels sourced from `suite-contracts.ts`, never hardcoded.
- [ ] Any networking change passes the trust-boundary contract tests.

## Definition of Done

The architecture is "production-ready" for a change when: the capability is implemented once in shared `packages`/`crates` and consumed by surfaces; no trust logic is duplicated or weakened; the moat assets are intact and provable; model IDs come from the catalog; the per-increment verification gate (Law 4) is green; and no claim exceeds the parity matrix.

## Anti-patterns

- Treating the six surfaces as six products and rebuilding the runtime in each.
- Spreading effort across surfaces instead of hardening the one runtime they depend on (`docs/strategy/01` §1).
- Originating commodity infrastructure that a license-clean donor already provides — or copying proprietary code instead of adapting intent.
- Shipping marketing parity claims ahead of `Present` implementation.
- Adding a "convenient" silent fallback that crosses a trust boundary. That is a P0, not a feature.
