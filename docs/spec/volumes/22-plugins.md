# Volume 22 — Plugins

Status: Canonical (depth expansion of `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 22)
Authority: this manual · `docs/strategy/10-oss-corpus-port-plan.md` §5 (SkillSpector vetting, declared-vs-actual, packaging) · `docs/strategy/09-reference-codebases.md` (plugin/hook patterns) · `crates/agiworkforce-plugin-runtime/` · `apps/cli/src/features/plugins/`

## Philosophy & Cloud/Local stance

A plugin is the largest installable unit: a signed bundle that can ship **skills + agents + hooks + commands + MCP servers + LSP** behind one manifest. It is the distribution wrapper around the lower layers (Vol 17 agents, Vol 18 tools, Vol 19 MCP, Vol 21 skills). Because a plugin can do everything those layers can do, it runs with **user privileges** — which makes it the highest-risk install in the system and the one with the strictest gate. The manifest (`.agiworkforce-plugin/plugin.json`) declares exactly what the plugin contributes and what permissions it requires; the **declared-vs-actual permission check** is a hard gate, and plugins are **pinned by commit/SHA** so an install is reproducible and tamper-evident.

The trust posture mirrors skills, scaled up: plugins install **only from an allowlisted marketplace**, pass a full vetting scan before install, and re-scan on update for rug-pulls (`docs/strategy/10` §5). Cloud/Local/Hybrid changes which plugin contributions activate, never the gate. A plugin's bundled MCP servers and skills inherit their own volume's rules (additive-only scoping, no shell-injection from remote-sourced skills, `allowed-tools` ceiling). A plugin never widens the trust boundary: a Local session running a plugin still cannot silently reach a hosted provider. Managed/enterprise deployments get an **admin allowlist** so orgs control exactly which plugins run.

## Binding rules

1. A plugin bundles skills + agents + hooks + commands + MCP/LSP behind one manifest (`.agiworkforce-plugin/plugin.json`) that declares all contributions and required permissions.
2. Plugins install only from an allowlisted marketplace; sideload requires explicit, recorded user override (and is admin-blockable).
3. Every plugin passes a full vetting scan (SkillSpector) before install; `DO_NOT_INSTALL` is blocked; findings are shown to the user.
4. The declared-vs-actual permission diff is a hard gate; a plugin that does more than it declares is blocked.
5. Plugins are pinned by commit/SHA; updates are explicit and trigger a rug-pull re-scan against the last-approved manifest.
6. Bundled contributions inherit their layer's rules: agents (Vol 17 scoping/cleanup), MCP (Vol 19 additive-only, no remote shell-injection), skills (Vol 21 `allowed-tools` ceiling), hooks (typed lifecycle, `if:`-gated).
7. A plugin never widens the active trust boundary; a Local session cannot reach a hosted provider via a plugin without the explicit fork.
8. Managed/enterprise deployments enforce an admin allowlist; org admins control which plugins run.

## Repository map

- Plugin runtime + manifest matrix: `crates/agiworkforce-plugin-runtime/` (`tests/manifest_matrix.rs`, fixtures: `agiworkforce/.agiworkforce-plugin/plugin.json`, plus `claude_code`/`codex`/legacy manifest compatibility fixtures).
- CLI plugin surface: `apps/cli/src/features/plugins/` (`mod.rs`, `plugins.rs`) — install/list/enable.
- Hooks contributed by plugins: `apps/cli/src/features/hooks/` (`hooks.rs`), typed lifecycle (`docs/strategy/09`).
- Commands contributed by plugins: folder-per-command convention (`docs/strategy/15` §3); CLI command registry.
- MCP servers contributed by plugins: Vol 19 (`apps/cli/src/features/mcp/`, `crates/agiworkforce-protocol/src/mcp.rs`).
- TS plugin/marketplace API: `packages/api/src/marketplace.ts`; settings surface: Desktop settings includes a Plugins section (source-of-truth Desktop section).
- Vetting (adopt SkillSpector wholesale, Apache-2.0): wire scanner model IDs to `packages/types/src/models.json`; submit-time lint via a `validate_plugins`-style check (`docs/strategy/10` §5).

## Competitor notes

Codex ships plugins, skills, hooks, and commands across its app/CLI/IDE ecosystem; Claude Code supports plugin-style bundles (skills + hooks + MCP + commands) with permission controls and hook lifecycles (study only, `docs/strategy/09`, `01`). AGI's manifest deliberately interoperates with foreign manifest shapes (the `crates/agiworkforce-plugin-runtime` fixtures cover claude-code/codex/legacy layouts for import compatibility) while owning its own `.agiworkforce-plugin/plugin.json` format. AGI's divergence is the security pipeline no competitor markets: **allowlisted marketplace + pre-install vetting + declared-vs-actual gate + SHA pinning + rug-pull re-scan + admin allowlist** (`docs/strategy/10` §5). Parity is the plugin capability and authoring/distribution workflow, never copied plugin code or another vendor's marketplace assets.

## Checklists

### Manifest & packaging

- [ ] `.agiworkforce-plugin/plugin.json` declares every contribution (skills/agents/hooks/commands/MCP/LSP) and all required permissions.
- [ ] Manifest validates against the runtime's manifest matrix (`crates/agiworkforce-plugin-runtime/tests/manifest_matrix.rs`).
- [ ] Commands follow folder-per-command; hooks declare typed lifecycle events with `if:` conditions.
- [ ] Foreign-manifest import (claude-code/codex/legacy) maps cleanly or is rejected with a clear reason.

### Vetting & install gate

- [ ] SkillSpector scan runs; `DO_NOT_INSTALL` blocked, `CAUTION` surfaced; findings shown before install.
- [ ] Declared-vs-actual permission diff is a hard gate.
- [ ] Submit-time lint validates manifest/frontmatter/author.
- [ ] Scanner model IDs read from `models.json`.

### Marketplace & signing

- [ ] Installs only from an allowlisted marketplace; sideload requires recorded override.
- [ ] Plugin pinned by commit/SHA; signature/integrity verified on install.
- [ ] Catalog entry shows author, declared contributions/scopes, and last scan result.

### Bundled contributions inherit layer rules

- [ ] Bundled agents fork with scoped envelopes + cleanup (Vol 17).
- [ ] Bundled MCP servers are additive-only; remote-sourced skills cannot shell-inject (Vol 19).
- [ ] Bundled skills honor the `allowed-tools` ceiling and the permission pipeline (Vol 21).
- [ ] Bundled hooks are sandboxed/timeout-bounded; `if:`-gated so they don't spawn on non-matching calls.

### Lifecycle (update / rug-pull / removal)

- [ ] Update is explicit and re-scans against the last-approved manifest.
- [ ] New permissions after approval block pending re-consent.
- [ ] Uninstall fully removes all contributed skills/agents/hooks/commands/MCP and their grants.

### Trust boundary & admin

- [ ] A plugin never widens the trust boundary; Local cannot reach hosted via a plugin without the fork (test-asserted).
- [ ] Managed/enterprise admin allowlist enforced; admins can disable a plugin org-wide.

## Definition of Done

Plugins install only from an allowlisted marketplace, pass a SkillSpector vetting scan and a declared-vs-actual permission gate before install (with visible findings), are SHA-pinned, and re-scan on update for rug-pulls; bundled contributions inherit their layer's safety rules; admin allowlists govern managed deployments; and a trust-boundary test proves a plugin cannot widen the boundary. Scanner model IDs come from `models.json`. Verified per Operating Law 4 (manifest-matrix + targeted + trust-boundary tests).

## Anti-patterns

- Installing from an unvetted source or skipping the declared-vs-actual gate.
- Unpinned plugins (no SHA) or silent updates with no rug-pull re-scan.
- A plugin granting its bundled skills/agents authority beyond the trust boundary.
- Bundled hooks running unsandboxed or spawning on every call.
- Letting a plugin's MCP/skill contributions bypass Vol 19/21 rules.
- Hardcoding scanner model IDs instead of reading `models.json`.
