# Volume 33 — Developer Experience

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 33)
Authority: Vol 2 (structure), `docs/engineering/naming-conventions.md`, `docs/strategy/15` (granularity), `docs/strategy/05` §5 (developer-led distribution), Vol 38 (contracts)

## Philosophy & Cloud/Local stance

Developers are the top of the funnel and the credibility engine — they adopt AGI free (Local + BYOK) and make it real before any enterprise buyer trusts it (`docs/strategy/05` §3, §5). So the developer experience is a product, not internal plumbing: the CLI, SDK, API, docs, and scaffolds are first-class surfaces with the same "no theater" bar as the UI. DX is trust-boundary aware too — the SDK and CLI default to the user's chosen mode, never silently route Local work to Managed, and BYOK keys flow client→provider only (Vol 27/30). Scaffolds emit the canonical structure (Vol 2 / naming-conventions) so every new tool, command, or feature lands in the right shape automatically and the structure checks stay green. Examples are runnable: a developer who pastes one and it works is a developer who stays.

## Binding rules

1. Scaffolds/generators emit the canonical structure: folder-per-tool/command/feature, one concern per file, co-located prompt/UI/validators, barrels (`index.ts`/`mod.rs`) — and pass `check:structure-conventions` (Vol 2, `docs/strategy/15`).
2. SDK and API are first-party contracts defined in `packages/contracts/types`; generated types live under `*/generated/`. No drift between docs and the typed contract (Vol 38).
3. Docs live under `docs/`; root docs are restricted by `docs/engineering/naming-conventions.md`. Don't scatter READMEs.
4. Every documented API/route/env/flag must exist in code; do not invent surface area (Operating Law 5). Mark unknowns or file a tracked gap.
5. Examples and templates are runnable and version-pinned; a broken example is a bug.
6. CLI flags that are accepted must do something; remove or implement bailing flags (R14, `docs/strategy/03`).
7. Naming follows `docs/engineering/naming-conventions.md` for product names, CLI commands, files, commits, hooks.
8. Devtools (debugging, profiling, logs) respect privacy: no Local content in shared diagnostics without consent (Vol 29).

## Repository map (real paths)

- CLI (Rust dev engine): `apps/cli/` (`src/agent/mod.rs` privacy modes); shared protocol `crates/agiworkforce-protocol/src/` (`items.rs`, `mcp.rs`, `custom_prompts.rs`, `plan_tool.rs`); command registry/parse `crates/agiworkforce-protocol/src/parse_command.rs`.
- SDK/API contracts: `packages/contracts/types/src/` (`suite-contracts.ts`, `models.json`, `model-catalog.ts`, `artifacts.ts`, `memory.ts`, `research.ts`, `workflow.ts`, `voice.ts`, `mcp-apps.ts`, `command-capabilities.ts`); generated types under `packages/*/generated/` and `apps/*/generated/`.
- Programmatic API surface: `packages/client/desktop-command-client/src/` (`agent.ts`, `mcp.ts`, `skills.ts`, `marketplace.ts`, `lsp.ts`, `artifacts.ts`, `memory.ts`, `settings.ts`, `governance.ts`, `security.ts`).
- Runtime helpers: `packages/client/client-runtime/src/` (`command.ts`, `http.ts`, `detect.ts`, `errors.ts`); utils `packages/platform/utils/src/` (`validation.ts`, `retry.ts`, `crypto.ts`).
- API gateway (public API): `services/api-gateway/src/routes/` (`chat.ts`, `usage.ts`, `sync.ts`, `dotfile.ts`); MCP `src/mcp/`.
- VS Code DX: `apps/extension-vscode/` (provider client → `agiworkforce.com/api/llm/v1`, diff/edit/checkpoint providers).
- Structure/convention enforcement: `pnpm check:structure-conventions`, `check:repo-organization`, `check:boundaries`, `check:agent-context`; command inventory `docs/agent-context/commands.json`.
- Docs root: `docs/` (spec, current, strategy, engineering, agent-context, enterprise).

## Competitor notes (`docs/strategy/01`, `02`)

Both incumbents win developers with a shared instruction format and an SDK/MCP/Skills ecosystem team (`01` §4). `AGENTS.md` is OpenAI's shared instruction format across all Codex surfaces; Claude ships an Agent SDK, slash commands, hooks, skills, and the `127.0.0.1` `ide` MCP server pattern (`01` §2.1, §3.1). Both adopted MCP and the open Skills standard deliberately, so interoperability beats walls (`05` §5). AGI's deliberate divergence and alignment: we adopt MCP + the open Skills standard (ride the ecosystem, don't fight it), keep `AGENTS.md` as the canonical agent entry, and make BYOK/local a first-class SDK path — the DX a privacy-conscious developer can't get from a single-lab SDK. Our CLI targets Claude-Code/Codex-CLI parity (`02` CLI) but must finish or remove the bailing SDK flags (R14) to avoid the overclaiming the audit flags.

## Checklists

### Scaffolding & structure

- [ ] Generators for a new tool, command, feature, and connector emit canonical folders + barrels + co-located prompt/validator/UI.
- [ ] Scaffold output passes `check:structure-conventions` and `check:boundaries` with no manual fixup.
- [ ] New surface scaffold inherits shared runtime + contracts (no re-implemented trust logic).

### SDK & API contracts

- [ ] SDK/API types defined in `packages/contracts/types`; consumers import from there, not local copies.
- [ ] Generated types isolated under `*/generated/` and reproducible.
- [ ] Every public route/method has a typed contract and a validation schema (Vol 38).
- [ ] API versioning + deprecation policy documented; no silent breaking changes.

### CLI ergonomics

- [ ] `--help` lists only flags that work; bailing flags implemented or removed (R14).
- [ ] CLI defaults to the user's trust mode; never silently uses a non-local provider in Local (`apps/cli/src/agent/mod.rs`).
- [ ] Slash commands / memory / MCP / skills / hooks documented and matched to behavior.
- [ ] Clear error messages with actionable next steps.

### Docs & examples

- [ ] Docs live under `docs/`; structure respects naming-conventions (no stray root docs).
- [ ] Every documented API/env/flag exists in code (grep-verified).
- [ ] Examples are runnable and version-pinned; CI (or a smoke check) runs them.
- [ ] Templates produce a working project on first run.

### Devtools, debugging & profiling

- [ ] Local dev logs available without leaking Local content into shared diagnostics (Vol 29).
- [ ] Profiling hooks (web perf, cargo benches) documented for contributors.
- [ ] Reproducible local setup: one command to install, one to run, one to test (per `commands.json`).

### Interop & ecosystem

- [ ] MCP client/server contracts documented; `127.0.0.1` `ide`-style bridge uses fresh per-session tokens (Vol 27).
- [ ] Skills follow the open `SKILL.md` standard; plugin manifest documented (Vol 21/22).
- [ ] `AGENTS.md` kept canonical and discoverable as the agent entry point.

## Definition of Done

Scaffolds emit canonical structure and pass `check:structure-conventions`/`check:boundaries` without manual fixup; SDK/API contracts are in `packages/contracts/types` with generated types isolated and reproducible; every documented API/env/flag is verified to exist in code; examples and templates run on first try; CLI `--help` lists only working flags (R14 closed) and respects trust mode; docs placement passes the naming-convention/repo-organization checks; no DX path silently crosses a trust boundary or transmits a BYOK key (Vol 30).

## Anti-patterns

- Documenting routes, envs, flags, or SDK methods that don't exist in code (Operating Law 5).
- Scaffolds that produce non-canonical structure and fail the structure checks.
- Duplicating contracts in app code instead of importing from `packages/contracts/types`.
- CLI flags accepted in `--help` that bail at runtime (R14).
- Stale or non-runnable examples; templates that don't build.
- Stray root-level docs/READMEs that violate naming-conventions.
- A DX shortcut that routes Local work to Managed or moves a BYOK key through AGI servers.
- Re-implementing trust logic in a new surface scaffold instead of inheriting the shared runtime.
