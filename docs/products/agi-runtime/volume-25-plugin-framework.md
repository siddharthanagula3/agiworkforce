# AGI Runtime — Volume 25 — Plugin Framework

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root), `apps/cli/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and the real repo paths grounded below: `crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/{src/lib.rs,README.md,tests/manifest_matrix.rs}`, `apps/cli/src/features/plugins/plugins.rs`, `apps/cli/src/marketplace.rs`, `apps/cli/src/command_registry.rs`.

## Overview & stance

A plugin contributes slash commands, sub-agents, skills, hooks, and MCP-server declarations to a session. In the AGI suite this is a **local, workspace-scoped capability**, not a cloud feature: plugins are discovered and executed on the host that runs the session — Desktop, CLI, or VS Code — never Web or Mobile. Discovery and installation exist today in the CLI; the surrounding execution, isolation, and cross-surface lifecycle are the target this volume defines.

Trust modes shape every rule. Discovery does **not** imply execution permission (`crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/README.md`, "Known Caveats"): a plugin may _declare_ an MCP server or hook, but running one is a separate, consented step. A plugin must never silently move a Local session's context into BYOK or Managed Cloud — if a plugin declares an MCP server reaching a BYOK provider or the cloud gateway, that crossing is the same explicit Local→BYOK fork the canon mandates (context selection, secret scan, payload preview, provider label, consent). Plugins ride the surface's existing trust boundary; they do not create a new one. Installing a plugin has no plan gate — the Free / Basic ($8·₹399) / Pro ($20) / Max ($100 & $200) / Enterprise ladder governs cloud usage, not local plugin authorship.

## Plugin Discovery

**✅ Built** — `crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` (`load_manifest_for`, `MANIFEST_PATHS`, `ManifestFormat`); CLI consumer mirror in `apps/cli/src/features/plugins/plugins.rs` (`PluginRegistry::load_all`).

Requirements, all verifiable from source:

- A plugin root is probed for five manifest paths in fixed priority order; the first that exists **and** parses wins: `.agiworkforce-plugin/plugin.json` (preferred) → `.claude-plugin/plugin.json` (Claude Code interop) → `.codex-plugin/plugin.json` (Codex interop) → `.app.json` → `.mcp.json` (both legacy).
- All five share one schema (`PluginManifest`); unknown keys land in `extra` via serde-flatten so foreign-format manifests (`transport`, `url`, `marketplace`, …) load without error.
- Legacy formats emit a one-time stderr deprecation notice per plugin per session; `short_tag()` renders `[agi]`/`[claude]`/`[codex]`/`[legacy]` in `agi plugin list`. Coverage is asserted by `tests/manifest_matrix.rs`, round-tripping one fixture per format including camelCase `mcpServers` and passthrough `transport`/`url`.

🔭 Planned: a shared discovery service so Desktop and VS Code reuse this crate rather than the CLI-local copy (the crate README lists Desktop as a future consumer).

## Installation

**✅ Built (CLI)** — `apps/cli/src/marketplace.rs` (`Marketplace::install`, `install_from_git`, `install_from_path`) and `apps/cli/src/features/plugins/plugins.rs` (`PluginRegistry::install`, `validate_plugin_name`).

- Two install sources: a local filesystem path and a git URL. Installed plugins are tracked in `~/.agiworkforce/plugins/installed.json` (scope, path, version, timestamp).
- Git sources pass `validate_git_clone_url`: sources beginning with `-` are rejected (argument injection), and only `https://`, `http://`, `git://`, and `git@host:path` SSH shorthand are allowed. `file://`, `ext::`, and `fd::` helper transports (which can run arbitrary commands) are rejected — local plugins install via the path source.
- Names pass `validate_plugin_name`, and the resolved target must stay inside the global plugins dir (`target.starts_with(global_dir)`); an escaping target fails.
- Supply-chain gate: `verify_plugin_integrity` checks a required SHA-256 claim before the tree is accepted; a mismatch rolls back. `agi plugin install` without a claim requires the explicit `--unsafe-no-integrity` acknowledgement (`AUDIT-FIX: H-16`). Post-install, `load_manifest_for` must find a recognized manifest or the install is rolled back.

🟡 Partial: a remote registry (`registry.agiworkforce.com`) is referenced but `search()` degrades to an empty list when unreachable — no live catalog yet. 🔭 Planned: Desktop/VS Code install UIs and a signed marketplace index.

## Lifecycle — manage plugin lifecycle

**🟡 Partial** — `apps/cli/src/features/plugins/plugins.rs` exposes load/enable-by-presence, contribution accessors (`command_paths`, `skill_paths`, `agent_paths`, `mcp_configs`, `hook_configs`), and `marketplace.rs::uninstall`; the gap is that only the CLI drives this loop.

- States: discovered → installed (registry entry) → loaded (contributions surfaced) → uninstalled (tree + registry entry removed). Enablement is presence-based; a first-class enable/disable toggle is 🔭.
- Contribution surfacing must be side-effect-free: loading a manifest exposes command/skill/agent/MCP/hook _declarations_ only. Execution stays gated.
- Hook trust is enforced at load: `hook_configs()` **excludes** project-local plugin hooks by default (`HIGH-2`), and `hook_configs_with_trust()` tags each hook with its `from_project_dir` origin so the host can require consent for untrusted, repo-supplied hooks.
- `agi plugin` / `plugins` / `marketplace` aliases route to these flows (`apps/cli/src/command_registry.rs`).

🔭 Planned: cross-surface lifecycle (Desktop/VS Code parity), persistent enable/disable state, and lifecycle events over the Runtime protocol.

## Isolation — sandbox plugins

**🟡 Partial guards / 🔭 process sandbox** — path and supply-chain guards exist; an OS-level execution sandbox does not. `crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/README.md` states plainly that the plugin **execution sandbox** does not belong to the discovery crate.

Guards that exist today (✅ within their scope):

- Path containment: `plugin_path_stays_within_root` canonicalizes root and candidate and requires `candidate.starts_with(root)`, blocking traversal out of a plugin's tree (`apps/cli/src/features/plugins/plugins.rs`).
- Symlink escape prevention: the marketplace `copy_dir` uses `symlink_metadata` and skips symlinks, so a plugin source cannot pull arbitrary host files into the install target (`apps/cli/src/marketplace.rs`).
- Install-target confinement, name validation, git-transport allowlist, and the SHA-256 integrity gate above; project-local hooks are blocked from silent execution by default.

🔭 Planned (the real isolation target): a process/OS sandbox around plugin-spawned MCP servers and hook commands (least-privilege filesystem + network scoping, per-plugin capability grants, resource limits) and a permission prompt for each declared tool before first execution. Until built, a declared MCP server or hook runs as an ordinary child process and must be treated as trusted code the user consented to install.

## Updates — update plugins

**✅ Built (git installs)** — `apps/cli/src/marketplace.rs::update_all`.

- `agi plugin update` iterates installed plugins; git-cloned installs refresh via `git pull --ff-only` (fast-forward only — no merge/rebase surprises); local path installs are skipped and reported.
- After a pull, the recorded version is re-read from the post-pull manifest (`read_manifest_version`) so the registry never carries a stale version; an `N updated, M skipped` tally is printed.

🔭 Planned: re-verifying the SHA-256 integrity claim on update (today checked at install only), pinned-version / changelog-gated updates, and update notifications on Desktop/VS Code.

## Repository map

- `crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/` — manifest schema + discovery (`src/lib.rs`), fixtures + matrix tests (`tests/`), crate README.
- `apps/cli/src/features/plugins/plugins.rs` — CLI registry, load, contribution accessors, hook-trust gating, path containment, install with integrity + rollback.
- `apps/cli/src/marketplace.rs` — install (path/git), uninstall, `update_all`, git-URL allowlist, symlink-safe copy, `installed.json`.
- `apps/cli/src/command_registry.rs` — `plugin`/`plugins`/`marketplace` routing; `apps/cli/tests/coverage_wave2_plugins.rs` — coverage tests.

## Competitor notes

Claude Code, Codex, and ChatGPT plugin/MCP ecosystems assume a single-vendor trust context and (for the hosted assistants) run connectors through the vendor cloud. AGI diverges deliberately: it **interoperates** with Claude Code and Codex manifests (loading `.claude-plugin` and `.codex-plugin` directly) while preferring its own `.agiworkforce-plugin` format, so authors migrate without a rewrite. It stays **local-first** — plugins execute on Desktop/CLI/VS Code hosts, never Web or Mobile, never on the AGI cloud implicitly. It is **multi-provider and per-surface trust-aware**: a plugin-declared MCP server honors the surface's trust mode (BYOK only where allowed; an explicit, redacted fork before Local data leaves the box), not one managed backend.

## Acceptance / Definition of Done

Production-ready when discovery, install, lifecycle, isolation, and update hold their guarantees on every host surface (Desktop, CLI, VS Code), with a permission prompt before any plugin-declared tool first executes.

- [ ] **Build:** `cargo test -p agiworkforce-plugin-runtime (crate REMOVED 2026-07-08, zero dependents — this check is stale until a replacement crate exists)` green; the five-format matrix and CLI plugin coverage pass; `agi plugin install/list/update/uninstall` verified against a local path and a git source.
- [ ] **Trust:** no plugin can route a Local session's context to BYOK or Cloud without the explicit fork (context selection, secret scan, payload preview, provider label, consent); Web and Mobile expose no plugin install path.
- [ ] **Security:** git-transport allowlist, install-target containment, symlink skip, path canonicalization, and the SHA-256 integrity gate are all enforced; project-local hooks stay consent-gated; the process/OS execution sandbox (🔭) has a tracked design before any auto-run of declared tools ships.

## Anti-patterns

- Do **not** claim a plugin execution sandbox exists — it does not (`crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/README.md`); label it 🔭. Do not auto-run declared MCP servers or hooks without consent, and never let a plugin silently cross Local→BYOK/Cloud.
- Do **not** widen the git-transport allowlist to `file://`/`ext::`/`fd::` or follow symlinks during copy; do not skip the integrity gate outside the explicit `--unsafe-no-integrity` acknowledgement.
- Do **not** hardcode model IDs in a plugin path — LLM/provider IDs come only from `packages/contracts/types/src/models.json`. Do not invent a monolithic runtime daemon, a remote registry catalog, or Desktop/VS Code plugin UIs as shipped; mark them 🔭.
- Do **not** reference Supabase, `middleware.ts`, removed tiers ("Plus", `pro_plus`, "Hobby"), credit top-ups, or unverified INR prices anywhere in this domain.
