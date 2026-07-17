# Volume 02 — Repository Map & Structure Conventions

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 2)
Authority: `docs/agent-context/repo-map.json`, `docs/strategy/15-structure-and-granularity-conventions.md`, `docs/engineering/naming-conventions.md`

## Philosophy & Cloud/Local stance

The repo is a `pnpm` + `cargo` monorepo. Its shape is the architecture: thin clients (`apps/`) over a shared runtime (`packages/`, `crates/`), backed by `services/` and a canonical Neon database. The structure encodes the trust boundary too — secret-holding and local-execution code lives in surfaces and crates that can hold keys (Desktop stronghold, CLI keyring, Mobile SecureStore), while Web/Chrome surfaces are structured so they _cannot_ hold BYOK keys (Vol 25, Vol 30). Cloud-only logic concentrates in `services/` and `apps/web/db/neon`; local-only logic concentrates in `packages/platform/local-llm`, `crates/`, and per-surface native code. Where a module must behave differently in Local vs Managed, that difference is gated at the contract boundary in `packages/contracts/types`, not scattered.

The target tree is the clean, deeply-modular shape of the best agent codebases: folder-per-tool, one concern per file, co-located prompt + UI + logic, barrel exports, domain-grouped `utils/`, isolated generated code (`docs/strategy/15` §1). We adopt the _patterns_ in AGI's own names; we apply them to new code and refactor toward them as each surface's production plan touches a subsystem.

## Binding rules

1. **Packages must not import from apps.** Shared TS is consumer-agnostic (`repo-map.json` platform rule).
2. **Services must not import UI.** Backend never depends on surface UI packages (`repo-map.json`).
3. **Reusable Rust belongs in `crates/` only when a second consumer exists.** Do not pre-extract.
4. **`apps/web/db/neon` is the canonical migration home.** No competing schema source.
5. **One concern per file; folder-per-feature.** Soft cap ~300 lines; banned junk-drawer names (`helpers.ts`, `misc.ts`, `common.ts`, catch-all `utils.ts`) inside a feature (Operating Law 6; `docs/strategy/15` §5).
6. **Every tool and command is a folder** with a co-located `prompt.ts`/`prompt.rs`, validators, UI, and an `index.ts`/`mod.rs` barrel (`docs/strategy/15` §2–3).
7. **Generated code is isolated under `*/generated/` and never hand-edited** (`docs/strategy/15` §7).
8. **CLI imports cross the `crates/*` and generated/protocol boundary only** — not arbitrary `packages` (`repo-map.json` CLI `allowedImports`).

## Repository map

Surfaces (`apps/`), each with a path-scoped `AGENTS.md` at high-risk surfaces:

- `apps/web` — Next.js app router; account, projects, synced app chats, artifacts, billing, admin. Allowed imports: `packages/*`.
- `apps/desktop` — Tauri v2 + React + Vite + Rust backend; local-private compute host. Imports `packages/*`; `src-tauri` only via Tauri IPC.
- `apps/mobile` — Expo / React Native; on-device LLM + public-alpha cloud.
- `apps/cli` — Rust + Ratatui TUI; developer engine. Imports `crates/*` (packages only through generated/protocol boundaries).
- `apps/extension` — Chrome MV3; browser context + native bridge.
- `apps/extension-vscode` — VS Code IDE surface.
- `apps/sandbox` — static single `index.html`, no build step; cross-origin artifact renderer, isolated (`postMessage` only).

Shared TS (`packages/`): `types`, `providers`, `routing`, `runtime`, `provider-runtime`, `provider-protocol`, `unified-chat`, `mcp`, `skills`, `local-llm`, `browser-tool`, `apply-patch`, `stores`, `ui`, `design-tokens`, `data-layer`, `compliance`, `api`, `services`, `utils`, `react-native-worklets`.

Shared Rust (`crates/`): `agiworkforce-protocol`, `agiworkforce-command-registry`, `agiworkforce-task-runtime`, `agiworkforce-execpolicy`, `sandbox-policy`, `agiworkforce-network-proxy`, `agiworkforce-plugin-runtime`, `agiworkforce-app-server`, `agiworkforce-apply-patch`, `agiworkforce-async-utils`, `agiworkforce-utils-*`.

Backend: `services/api-gateway`, `services/signaling-server` (path-scoped `services/AGENTS.md`). Database: `apps/web/db/neon`.

## Competitor notes

- **OpenAI/Codex** use `AGENTS.md` as the shared instruction format across every surface (`docs/strategy/01` §3) — AGI mirrors this with a root `AGENTS.md` plus path-scoped files at each high-risk surface.
- **Claude Code's** clean folder-per-tool, co-located-prompt structure is the _organizational_ reference for `docs/strategy/15`. We adopt the patterns, not the code (Operating Law 3). AGI's `apps/web/features/chat/` is already close to the canonical template.
- **AGI divergence:** the import-boundary rules (packages-not-apps, services-not-UI, crates-second-consumer) are AGI-specific and enforced mechanically by `check:boundaries` and `check:structure-conventions` — incumbents do not publish their monorepo boundary contracts; ours are checked in CI.

## Checklists

### Structure review (every new module)

- [ ] New tool is a folder with `<Name>Tool.*`/`mod.rs` + co-located `prompt.*` (`docs/strategy/15` §2).
- [ ] New command is a folder with an `index.*` barrel (§3).
- [ ] Each folder exposes a single barrel; consumers import the folder, not deep paths.
- [ ] No junk-drawer file added inside a `features/*` folder.
- [ ] File under the ~300-line soft cap, or has a split rationale (warn >300, error >800).
- [ ] Constants in `constants/` or per-feature `constants.ts`; no inline magic values.

### Import-boundary review

- [ ] No `packages/*` file imports from `apps/*`.
- [ ] No `services/*` file imports a UI package.
- [ ] CLI changes import `crates/*` (or generated/protocol), not arbitrary packages.
- [ ] New reusable Rust placed in `crates/` only with a real second consumer; otherwise kept surface-local.
- [ ] `pnpm check:boundaries` and `pnpm check:repo-organization` pass.

### Generated/vendored code

- [ ] Codegen output lives under `*/generated/` and is not hand-edited.
- [ ] Ported third-party code sits under an attributed path and is recorded in `PORTING-TRACKER.md`.
- [ ] Shared contracts changed in `packages/contracts/types`, not duplicated in a surface.

### Database & migrations

- [ ] New migration is a single file under `apps/web/db/neon` (one migration per file).
- [ ] No competing schema definition introduced outside the canonical path.
- [ ] Billing/security migrations reviewed manually before merge (`repo-map.json`).

## Definition of Done

The repository structure is "production-ready" for a change when: import boundaries hold (`check:boundaries`, `check:repo-organization` green); new tools/commands follow the folder-per-feature contract (`check:structure-conventions` green); no junk-drawer or oversized files were introduced without rationale; generated code is isolated; migrations live only in `apps/web/db/neon`; and the nearest path-scoped `AGENTS.md` rules were followed.

## Anti-patterns

- A `packages/*` file reaching into `apps/*`, or a service importing UI — both break the dependency direction.
- Pre-extracting Rust into `crates/` "to be ready" before a second consumer exists.
- Flat `tools/{bash,git,web}.rs` instead of folder-per-tool with co-located prompts (the current → target gap, `docs/strategy/15` §6).
- Junk-drawer `helpers.ts`/`misc.ts`, 800-line files, or deep relative imports that bypass a barrel.
- A second schema source competing with `apps/web/db/neon`.
- Hand-editing files under `*/generated/`.
