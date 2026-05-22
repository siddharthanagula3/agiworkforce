# M10 — Deep Dive: `src/utils/plugins/` (44 files, 20,521 LOC total)

> Scope: every file in `~/Desktop/reference/src/utils/plugins/` plus the cross-referenced built-in registry at `~/Desktop/reference/src/plugins/`. All citations are `file:line`.
> Inventory anchor: `tasks/research/anthropic-claude-suite-may-2026.md` §5.11 + §E.1.
> Marketplace stats from `claudemarketplaces.com` (May 7, 2026 snapshot): **4,200+ skills**, **770+ MCP servers**, **2,500+ marketplaces**. Anthropic's official marketplace `anthropics/claude-plugins-official` ships **16+ official skills** plus **11 open-source plugins for Cowork from Anthropic Labs (Jan 30, 2026)**.

---

## 0. File map (44 files, 20,521 LOC)

| File                                   | LOC   | Purpose                                                                                   |
| -------------------------------------- | ----- | ----------------------------------------------------------------------------------------- |
| `pluginLoader.ts`                      | 3,302 | Discovery, lifecycle, cache, manifest probing, marketplace-entry → LoadedPlugin           |
| `marketplaceManager.ts`                | 2,643 | Add/remove/refresh marketplaces, GCS mirror, git clone+pull, schema validate              |
| `schemas.ts`                           | 1,681 | All Zod schemas (manifest, marketplace, V1+V2 installed, sources, ID format)              |
| `installedPluginsManager.ts`           | 1,268 | `installed_plugins.json` V1↔V2, scope-array, in-memory vs disk, migration                 |
| `mcpbHandler.ts`                       | 968   | `.mcpb`/`.dxt` zip extraction, DXT manifest, sensitive userConfig → keychain              |
| `loadPluginCommands.ts`                | 946   | `commands/` markdown → slash commands; skills directory walk; namespacing                 |
| `validatePlugin.ts`                    | 903   | `claude plugin validate` impl — Zod errors, traversal checks, kebab-case warns            |
| `mcpPluginIntegration.ts`              | 634   | Per-plugin MCP server load (inline / .mcp.json / mcpServers / mcpb / array)               |
| `pluginInstallationHelpers.ts`         | 595   | `installResolvedPlugin` core, dependency closure, policy guards, telemetry                |
| `marketplaceHelpers.ts`                | 592   | Policy enforcement: blocklist, allowlist, hostPattern, pathPattern, regex                 |
| `officialMarketplaceStartupCheck.ts`   | 439   | Auto-install of `claude-plugins-official` with retry + GCS path                           |
| `zipCache.ts`                          | 406   | Zip-cache mode for ephemeral CCR containers (mounted FS)                                  |
| `pluginOptionsStorage.ts`              | 400   | `userConfig` storage: settings.json (non-sensitive) + keychain (sensitive)                |
| `lspPluginIntegration.ts`              | 387   | Per-plugin LSP server load (.lsp.json / manifest.lspServers)                              |
| `lspRecommendation.ts`                 | 374   | Hint engine: "you opened a .py file, install python-lsp@…"                                |
| `loadPluginAgents.ts`                  | 348   | `agents/` markdown → AgentDefinition; intentional drop of permissionMode/hooks/mcpServers |
| `pluginStartupCheck.ts`                | 341   | `checkEnabledPlugins`, scope reconciliation, install missing                              |
| `dependencyResolver.ts`                | 305   | DFS closure walk, cycle detection, cross-marketplace block, `verifyAndDemote`             |
| `installCounts.ts`                     | 292   | Fetch + 24h cache install-count stats (anthropic stats branch)                            |
| `loadPluginHooks.ts`                   | 287   | Plugin hooks → settings cascade, hot-reload, prune-on-disable                             |
| `pluginAutoupdate.ts`                  | 284   | Background auto-update — official mp default true, others default false                   |
| `reconciler.ts`                        | 265   | `diffMarketplaces` + `reconcileMarketplaces` — settings → state                           |
| `pluginInstallationHelpers.ts` (cont.) | …     | Same file, 595 LOC total                                                                  |
| `refresh.ts`                           | 215   | `refreshActivePlugins` — clear caches → reload → swap into AppState                       |
| `officialMarketplaceGcs.ts`            | 216   | inc-5046: GCS mirror for the official marketplace (CDN, ~3.5MB zip + sentinel)            |
| `pluginFlagging.ts`                    | 208   | `flagged-plugins.json` — auto-removed delisted plugins surface in /plugins                |
| `pluginDirectories.ts`                 | 178   | `~/.claude/plugins/` resolution, seed dir layering, data dir per-plugin                   |
| `loadPluginOutputStyles.ts`            | 178   | `output-styles/` files → output style registry                                            |
| `headlessPluginInstall.ts`             | 174   | CCR / `--print` install path: reconcile + delisting, no UI                                |
| `lspRecommendation.ts`                 | …     | Same file                                                                                 |
| `hintRecommendation.ts`                | 164   | Quick-install hint UI text                                                                |
| `parseMarketplaceInput.ts`             | 162   | Input string → `MarketplaceSource` (SSH/HTTPS/owner/repo/path detection)                  |
| `pluginVersioning.ts`                  | 157   | Version calc (manifest > entry > git SHA > 'unknown'), git-subdir SHA+pathHash            |
| `zipCacheAdapters.ts`                  | 164   | Sync mainline plugins/ → zip-cache mounted volume                                         |
| `pluginBlocklist.ts`                   | 127   | Detect delisted, auto-uninstall when `forceRemoveDeletedPlugins: true`                    |
| `pluginIdentifier.ts`                  | 123   | `parsePluginIdentifier`, `buildPluginId`, scope ↔ source mappings                         |
| `cacheUtils.ts`                        | 196   | `clearAllCaches`, orphan GC (7-day window), `markPluginVersionOrphaned`                   |
| `fetchTelemetry.ts`                    | 135   | `tengu_plugin_remote_fetch` event taxonomy                                                |
| `pluginPolicy.ts`                      | 20    | Single function `isPluginBlockedByPolicy` — policySettings deny                           |
| `addDirPluginSettings.ts`              | 71    | `--add-dir` → enabledPlugins / extraKnownMarketplaces (lowest priority)                   |
| `walkPluginMarkdown.ts`                | 69    | Recursive .md walker; `stopAtSkillDir` heuristic                                          |
| `gitAvailability.ts`                   | 69    | One-shot `git --version` cache + memoized warn                                            |
| `performStartupChecks.tsx`             | 69    | React ink view: cumulative startup event renderer                                         |
| `managedPlugins.ts`                    | 27    | Lock-list of plugin names from policy settings                                            |
| `officialMarketplace.ts`               | 25    | `OFFICIAL_MARKETPLACE_NAME` + source constants                                            |

(LOC counts via `wc -l`; total inside `src/utils/plugins/` = **20,521**.)

---

## 1. Plugin manifest schema (Zod) — `schemas.ts`

The plugin manifest (`plugin.json`, lives at `<plugin-root>/.claude-plugin/plugin.json`) is composed by spreading multiple narrow Zod object schemas into one `PluginManifestSchema` (`schemas.ts:884-898`). Top-level schema does **not** call `.strict()` — unknown keys silently strip. Strict mode is reserved for the developer-facing `claude plugin validate` command (`validatePlugin.ts:247`).

**Metadata fields** (`schemas.ts:274-320`):

- `name` (required, no spaces, used for namespacing — kebab-case warned but not enforced at load)
- `version` (optional, recommend semver)
- `description` (optional)
- `author` — `{ name, email?, url? }` (`schemas.ts:251-265`)
- `homepage` (optional URL)
- `repository` (optional)
- `license` (optional, SPDX string)
- `keywords` (optional string array)
- `dependencies` — array of `DependencyRefSchema` entries (string `name`, `name@marketplace`, or object form; `name@^v` is silently stripped for forward compat — `schemas.ts:1367-1391`)

**Component fields** (each individually optional, all spread into the manifest):

| Field          | Path types accepted                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commands`     | relative `.md` path / `.md` directory / array of either / object map of `<name>` → `{source\|content, description, argumentHint, model, allowedTools}` (`schemas.ts:385-451`)                           |
| `agents`       | relative `.md` path or array (`schemas.ts:460-476`)                                                                                                                                                     |
| `skills`       | relative directory or array of directories (`schemas.ts:484-499`)                                                                                                                                       |
| `outputStyles` | relative path (file or directory) or array (`schemas.ts:507-524`)                                                                                                                                       |
| `hooks`        | relative `.json` path / inline `HooksSchema` / array of those (`schemas.ts:348-373`)                                                                                                                    |
| `mcpServers`   | relative `.json` path / `McpbPath` (`.mcpb` or `.dxt`, local OR https URL) / inline `McpServerConfig` record / array of any (`schemas.ts:543-572`)                                                      |
| `lspServers`   | relative `.json` path / inline record `<name>` → `LspServerConfigSchema` / array (`schemas.ts:797-820`)                                                                                                 |
| `channels`     | strict array of `{server, displayName?, userConfig?}` — declares an MCP server as a chat-injecting channel (Telegram/Slack/Discord) (`schemas.ts:670-703`)                                              |
| `userConfig`   | record of `<KEY>` → `{type: string\|number\|boolean\|directory\|file, title, description, required?, default?, multiple?, sensitive?, min?, max?}` — sensitive `true` ⇒ keychain (`schemas.ts:587-654`) |
| `settings`     | unconstrained record, filtered to allowlisted keys at load (currently only `agent`) (`schemas.ts:857-866`)                                                                                              |

**Plugin source** (where to fetch the plugin code, used by marketplace entries — `schemas.ts:1062-1161`): tagged union of `string` (relative path, marketplace-internal), `npm`, `pip`, `url` (full git URL with optional ref/sha), `github` (`owner/repo`), `git-subdir` (monorepo with `path` + sparse-checkout). NPM/pip carry `package`, `version?`, `registry?`. Pip is parsed but throws "not yet supported" at install time (`pluginLoader.ts:960`).

**Plugin ID format** (`schemas.ts:1339-1346`): `^[a-z0-9][-a-z0-9._]*@[a-z0-9][-a-z0-9._]*$/i` (case-insensitive). Both halves allow `[A-Za-z0-9._-]` after the leading alphanumeric. `parsePluginIdentifier` only splits on the first `@` (`pluginIdentifier.ts:51-57`).

**Marketplace name validation** (`schemas.ts:216-246`): no spaces, no `/`, `\`, `..`, or `.`; not `inline` (reserved for `--plugin-dir`); not `builtin`; must not match `BLOCKED_OFFICIAL_NAME_PATTERN` (homograph + impersonation regex; non-ASCII rejected — `schemas.ts:71-101`).

**`ALLOWED_OFFICIAL_MARKETPLACE_NAMES`** (reserved set, `schemas.ts:19-28`): `claude-code-marketplace`, `claude-code-plugins`, `claude-plugins-official`, `anthropic-marketplace`, `anthropic-plugins`, `agent-skills`, `life-sciences`, `knowledge-work-plugins`. Reserved names ONLY allowed when source is `github.com/anthropics/...` per `validateOfficialNameSource` (`schemas.ts:119-157`); the check runs both at registration AND post-write (with a `.refine` blocker on settings-source — `schemas.ts:1017-1024`) so a malicious `extraKnownMarketplaces` cannot land a synthetic file with a reserved name.

---

## 2. Marketplace schema — `schemas.ts`

`PluginMarketplaceSchema` (`schemas.ts:1293-1326`) — a marketplace.json contains:

- `name` (validated by `MarketplaceNameSchema`)
- `owner` (PluginAuthor)
- `plugins` — array of `PluginMarketplaceEntrySchema` entries
- `forceRemoveDeletedPlugins` — when true, plugins removed from this marketplace.json are auto-uninstalled and flagged (`pluginBlocklist.ts:79`)
- `metadata.{pluginRoot, version, description}`
- `allowCrossMarketplaceDependenciesOn` — array of marketplace names whose plugins this marketplace's plugins may pull as dependencies. **Non-transitive**: only the ROOT marketplace's allowlist applies during a closure walk (`schemas.ts:1319-1324`, `dependencyResolver.ts:80-86`).

`PluginMarketplaceEntrySchema` (`schemas.ts:1254-1285`) extends `PluginManifestSchema().partial()` and adds `name`, `source` (PluginSource), `category?`, `tags?`, `strict?` (default `true`). Strict=true means a plugin.json MUST exist in the plugin folder; strict=false means the marketplace entry IS the manifest.

**`MarketplaceSourceSchema`** (`schemas.ts:906-1043`) — discriminated union by `source` field: `url` (with optional `headers`), `github` (`{repo, ref?, path?, sparsePaths?}`), `git` (full URL, ref, path, sparsePaths — Azure DevOps support drops `.endsWith('.git')` per gh-31256), `npm` (`package`), `file` (path), `directory` (path), `hostPattern` (regex pattern matched against host; allowlist-only), `pathPattern` (regex against file/directory `.path`; allowlist-only), and `settings` (inline manifest declared in `extraKnownMarketplaces`, with `name` + `plugins[]` + `owner?`). The `settings` arm specifically blocks reserved names (`schemas.ts:1017-1024`) so a synthetic disk write cannot precede `validateOfficialNameSource`.

---

## 3. `pluginLoader.ts` — discovery, cache, lifecycle (3,302 LOC)

### 3.1 Discovery sources (precedence order)

Documented at `pluginLoader.ts:10-13`:

1. Marketplace-based plugins (`plugin@marketplace` in `enabledPlugins`).
2. Session-only plugins via `--plugin-dir` (synthetic marketplace `inline`) — `dependencyResolver.ts:25` defines the sentinel; `getInlinePlugins()` from bootstrap state seeds them.
3. **Built-in plugins** — `BUILTIN_MARKETPLACE_NAME = 'builtin'` (`src/plugins/builtinPlugins.ts:23`), separate path; the marketplace loader filter at `pluginLoader.ts:1911-1913` skips `@builtin` plugins so they go through `getBuiltinPlugins()` instead.
4. **NPM packages** — only via marketplace entries with `source: npm`; never raw.

NPM packages "supported but must be referenced through marketplaces" (`pluginLoader.ts:7-8`).

### 3.2 Cache layout

`getPluginsDirectory()` resolves to `~/.claude/plugins/` (or `cowork_plugins/` when `--cowork`); overridable via `CLAUDE_CODE_PLUGIN_CACHE_DIR` (`pluginDirectories.ts:53-63`). Tilde expansion is explicit because settings.json `env` doesn't shell-expand (gh-30794).

Cache structure (per `marketplaceManager.ts:11-18`):

```
~/.claude/plugins/
├── known_marketplaces.json
├── installed_plugins.json
├── flagged-plugins.json
├── install-counts-cache.json
├── data/<plugin-id>/                   ← persistent, ${CLAUDE_PLUGIN_DATA}
├── marketplaces/
│   ├── <name>/.claude-plugin/marketplace.json   (git-cloned)
│   └── <name>.json                              (URL-fetched)
└── cache/
    └── <marketplace>/<plugin>/<version>/        (versioned plugin sources)
```

**Versioned cache** (`pluginLoader.ts:139-177`): `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. Sanitization replaces `[^a-zA-Z0-9\-_]` with `-`; version sanitization additionally allows `.` (`pluginLoader.ts:154`). Legacy non-versioned `~/.claude/plugins/cache/<plugin-name>/` paths are read on fallback (`pluginLoader.ts:249-287`) and GC'd on V1→V2 migration (`installedPluginsManager.ts:192-244`).

**Seed dirs** (`pluginDirectories.ts:85-90`): `CLAUDE_CODE_PLUGIN_SEED_DIR` is a delimiter-separated path list (`:` Unix, `;` Windows). Read-only fallback layer; first-seed-wins (`marketplaceManager.ts:380-434` `registerSeedMarketplaces`). Seed-managed marketplaces auto-set `autoUpdate: false` and refuse `removeMarketplaceSource` / `setMarketplaceAutoUpdate` (`marketplaceManager.ts:496-499`, `1947-1955`, `2603-2610`).

### 3.3 Plugin install pipeline (cachePlugin)

`cachePlugin(source, options)` (`pluginLoader.ts:911-1098`) executes:

1. Generate `tempName` with `temp_<prefix>_<timestamp>_<rand>` (`pluginLoader.ts:873-906`).
2. Clone/copy/install based on source type:
   - `installFromLocal` (`pluginLoader.ts:856-868`) — `copyDir` then strip `.git`
   - `installFromGitHub` (`pluginLoader.ts:662-678`) — `git@github.com:owner/repo.git` (or HTTPS when `CLAUDE_CODE_REMOTE` set)
   - `installFromGit` (`pluginLoader.ts:645-657`) — validates URL via `validateGitUrl`
   - `installFromGitSubdir` (`pluginLoader.ts:718-851`) — partial clone (`--filter=tree:0 --no-checkout`), `sparse-checkout set --cone -- <path>`, optional sha fetch+checkout, rename subdir to target, discard rest. Captures `gitCommitSha` so version calc can encode it (the discard erases `.git`).
   - `installFromNpm` (`pluginLoader.ts:492-524`) — global cache at `~/.claude/plugins/npm-cache`, then copy
3. Read manifest at `tempPath/.claude-plugin/plugin.json` (or legacy `tempPath/plugin.json`) → Zod validate → throw on invalid; create default if missing (`pluginLoader.ts:983-1079`).
4. Sanitize `manifest.name` to `[A-Za-z0-9-_]` and rename `tempPath` → `cachePath/<finalName>`.

### 3.4 Plugin loading hot path

`loadAllPlugins` and `loadAllPluginsCacheOnly` (`pluginLoader.ts:1900+` and `:2098-2174`) walk `enabledPlugins` from merged settings → filter to plugin@marketplace → preload all referenced marketplace catalogs in parallel (`pluginLoader.ts:1942-1955`) → enforce policy (`isSourceAllowedByPolicy` / fail-closed when policy active and marketplace unverifiable, `pluginLoader.ts:1933-2020`) → dispatch each to `loadPluginFromMarketplaceEntry` (full path, may clone) or `loadPluginFromMarketplaceEntryCacheOnly` (no network, error `plugin-cache-miss` if not on disk).

**Hot path optimization**: M unique marketplaces × N plugins originally meant 2N+M reads; preloading reduces to M (`pluginLoader.ts:1939-1955`).

`finishLoadingPluginFromPath` (`pluginLoader.ts:2420-2900+`) is the shared tail: probe `<plugin>/.claude-plugin/plugin.json`, run `createPluginFromPath`, then either treat the marketplace entry AS the manifest (no plugin.json) or supplement plugin.json (strict mode is set per-entry — strict=true forbids marketplace entry from also providing components; conflicts emit `generic-error`; `pluginLoader.ts:2683-2706`).

`createPluginFromPath` (`pluginLoader.ts:1348+`) constructs the `LoadedPlugin`: loads/defaults manifest, parallel-checks `commands/`, `agents/`, `skills/`, `output-styles/` directories, processes manifest.commands/agents/skills/outputStyles paths in parallel (`Promise.all` over `pathExists`, deterministic-ordered errors), reports `path-not-found` per missing component file.

### 3.5 Component loaders

- **Commands** (`loadPluginCommands.ts`): walks `commands/` recursively via `walkPluginMarkdown.ts`, treats SKILL.md folders as leaf "skill directories" (don't recurse), assigns slash command names `<plugin>:<namespace>:<command>` derived from path (`loadPluginCommands.ts:60-97`). Substitutes `${CLAUDE_PLUGIN_ROOT}` and (non-sensitive) `${user_config.KEY}` in allowed-tools and content (`loadPluginCommands.ts:243+`).
- **Agents** (`loadPluginAgents.ts`): walks `agents/`. **Intentionally drops** frontmatter `permissionMode`, `hooks`, `mcpServers` from plugin agents — these would escalate beyond install-time consent (`loadPluginAgents.ts:153-168`, citing PR #22558). Auto-injects Write/Edit/Read tools when `memory` scope is set and auto-memory is enabled (`loadPluginAgents.ts:186-197`).
- **Skills** (`loadPluginCommands.ts:53-97`, treat-as-command path): each `SKILL.md` becomes a slash command `<plugin>:<skill>` and is also exposed via the SkillTool registry. Skills directories are stop-points for the markdown walker (`walkPluginMarkdown.ts:33-46`).
- **Output styles** (`loadPluginOutputStyles.ts`).
- **Hooks** (`loadPluginHooks.ts`): converts hooks per plugin into `PluginHookMatcher[]` keyed by 27 events (`loadPluginHooks.ts:31-59`): PreToolUse, PostToolUse, PostToolUseFailure, PermissionDenied, Notification, UserPromptSubmit, SessionStart, SessionEnd, Stop, StopFailure, SubagentStart, SubagentStop, PreCompact, PostCompact, PermissionRequest, Setup, TeammateIdle, TaskCreated, TaskCompleted, Elicitation, ElicitationResult, ConfigChange, WorktreeCreate, WorktreeRemove, InstructionsLoaded, CwdChanged, FileChanged. Atomic clear+register pair (`loadPluginHooks.ts:147-148`) prevents the gh-29767 bug where `clearAllCaches` left plugin hooks dead. `pruneRemovedPluginHooks` (`loadPluginHooks.ts:179-207`) keeps newly-disabled plugin hooks from firing immediately while newly-enabled wait for `/reload-plugins` — consistent with commands/agents/MCP behavior. Hot-reload subscription on `policySettings` change uses a 4-field hash (`enabledPlugins`, `extraKnownMarketplaces`, `strictKnownMarketplaces`, `blockedMarketplaces`) so remote managed-settings changes propagate even when only allow/blocklists move (`loadPluginHooks.ts:233-247`).
- **MCP servers** (`mcpPluginIntegration.ts`): merge `.mcp.json` (lowest priority) with manifest `mcpServers` (string path / `.mcpb`/`.dxt` URL or local path / inline record / array). MCPB handler (`mcpbHandler.ts`) downloads, hash-verifies, extracts, surfaces `needs-config` when `userConfig` schema isn't satisfied yet.
- **LSP servers** (`lspPluginIntegration.ts`): `.lsp.json` + manifest `lspServers`. Path-traversal guarded (`lspPluginIntegration.ts:28-45`).

### 3.6 Component namespacing

All slash commands prefix with the plugin name: `<plugin>:<sub>:<name>` (`loadPluginCommands.ts:60-97`). Agents likewise use `<plugin>:<namespace>:<agentName>` (`loadPluginAgents.ts:88-90`). MCP server names are NOT prefixed; collisions surface at MCP merge time.

### 3.7 Sandboxing

Plugins run inside the same Node process — there is no per-plugin sandbox. Trust boundaries are install-time:

- Cross-marketplace dependency auto-install is BLOCKED by default (`dependencyResolver.ts:117-132`).
- Reserved-name marketplaces require `anthropics/*` GitHub source (`schemas.ts:119-157`).
- Org policy can deny-list plugins (`pluginPolicy.ts:17-20`) and marketplaces (`marketplaceHelpers.ts:461-505`).
- Plugin agents' frontmatter cannot declare hooks/permissionMode/mcpServers (`loadPluginAgents.ts:153-168`).
- Path traversal blocked at: `validatePathWithinBase` (`pluginInstallationHelpers.ts:87-107`), `validatePathWithinPlugin` (`lspPluginIntegration.ts:28-45`), `checkPathTraversal` validator (`validatePlugin.ts:92-106`), and the marketplace-name resolve check before any rm (`marketplaceManager.ts:1716-1720`).
- Install location of marketplaces is verified to be inside `marketplacesCacheDir` before any `fs.rm` (`marketplaceManager.ts:2414-2426`, `officialMarketplaceGcs.ts:55-65` — both citing gh-32793, gh-32661 corrupted-path cases).
- Git ops use `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=''`, `BatchMode=yes`, `StrictHostKeyChecking=yes` (`marketplaceManager.ts:510-513`, `:626-627`, `:812`). Fail-closed on unknown SSH host; HTTPS fallback path via `isGitHubSshLikelyConfigured` heuristic (`marketplaceManager.ts:723-761`).
- URL credentials redacted in all logs (`marketplaceManager.ts:1213-1226`).

---

## 4. `marketplaceManager.ts` — registration & sync (2,643 LOC)

### 4.1 Two-layer model

- **Intent layer** = settings `extraKnownMarketplaces` (per-scope) + `--add-dir` + the implicit `claude-plugins-official` declaration (`marketplaceManager.ts:161-192`)
- **State layer** = `~/.claude/plugins/known_marketplaces.json`

Reconciler (`reconciler.ts:50-83` `diffMarketplaces`, `:114-234` `reconcileMarketplaces`) classifies declared vs materialized into `missing`, `sourceChanged`, `upToDate`. Idempotent and additive (never deletes). `sourceIsFallback` on the implicit official-marketplace entry (`marketplaceManager.ts:151-181`) makes presence sufficient — never reports `sourceChanged` so a seed dir's mirror source isn't stomped by a re-clone.

### 4.2 `addMarketplaceSource` — `claude plugin marketplace add <repo>` flow

`addMarketplaceSource(source, onProgress)` (`marketplaceManager.ts:1782-1924`):

1. Resolve relative directory/file paths to absolute (cwd-independent state).
2. Policy check (`isSourceAllowedByPolicy` / `isSourceInBlocklist`) — error before any network/disk work.
3. Source-idempotency: if the exact source object already exists in `known_marketplaces.json`, return `alreadyMaterialized: true` without cloning.
4. `loadAndCacheMarketplace(source)` — switch on source type:
   - `url` → axios GET `marketplace.json` with optional headers, validate via `PluginMarketplaceSchema`
   - `github` → smart SSH/HTTPS selection (`isGitHubSshLikelyConfigured`); if HTTPS-then-SSH and SSH-then-HTTPS both fail, surface the second error
   - `git` → `cacheMarketplaceFromGit(source.url, ...)` — pull-first (avoids stat-before-operate TOCTOU), fallback to `rm` + reclone
   - `npm` → throws "not yet implemented"
   - `file` → resolve to absolute `parent of .claude-plugin/`
   - `directory` → look for `.claude-plugin/marketplace.json`
   - `settings` → synthesize the marketplace.json on disk (no fetch); plugins array already passed schema validation in settings
5. Re-validate the loaded marketplace through the FULL `PluginMarketplaceSchema` (catches drift between `SettingsMarketplacePlugin` narrow schema and full schema).
6. `validateOfficialNameSource(name, source)` — refuse reserved names from non-anthropics sources (`marketplaceManager.ts:1851-1856`).
7. Path resolve guard: `marketplace.name` must resolve inside `cacheDir` (defense-in-depth, `marketplaceManager.ts:1714-1720`).
8. If overwriting an existing entry with different source: refuse if seed-managed; otherwise rm old install location only when it's inside cache dir AND differs from new path (`marketplaceManager.ts:1859-1910`).
9. Persist to `known_marketplaces.json`.

### 4.3 `claude plugin install <name>@<marketplace>` flow

`installResolvedPlugin` (`pluginInstallationHelpers.ts:348-481`) is the shared core:

1. Parse the plugin ID; `parsePluginIdentifier` splits on first `@` (`pluginIdentifier.ts:51-57`).
2. Policy guard via `isPluginBlockedByPolicy` (org `enabledPlugins[id] === false` from policySettings — `pluginPolicy.ts:17-20`).
3. Bail early when source is local-relative AND no `marketplaceInstallLocation` is provided (would silently no-op).
4. Look up the **root** marketplace's `allowCrossMarketplaceDependenciesOn`.
5. `resolveDependencyClosure` (`dependencyResolver.ts:95-159`):
   - DFS walk
   - Skip already-enabled deps (avoids surprise settings writes)
   - Block cross-marketplace traversal unless ROOT allowlist permits (no transitive trust)
   - Cycle detection via stack
   - Errors: `cycle`, `not-found`, `cross-marketplace`
6. Policy guard for **every** dep (`pluginInstallationHelpers.ts:418-427`).
7. Single settings update writes the entire closure to `enabledPlugins[scope]`.
8. Loop closure: `cacheAndRegisterPlugin` — calls `cachePlugin` then moves to versioned cache `cache/<m>/<p>/<v>/`, registers in `installed_plugins.json` V2 with `{scope, projectPath?, installPath, version, installedAt, lastUpdated, gitCommitSha?}`.
9. `clearAllCaches()` so `/reload-plugins` users see fresh state.

### 4.4 `claude plugin tag` (May 2026)

Not implemented inside this file tree — it's a CLI-side `pluginVersioning.ts` consumer. Server logic at `apps/cli/...` (out of M10 scope). The deep-dive snippet that's local: `calculatePluginVersion` (`pluginVersioning.ts:36-106`) prefers (in order) plugin.json `version` → marketplace entry version → pre-resolved git SHA (with subdir path-hash for `git-subdir` sources, `pluginVersioning.ts:62-91`) → `getHeadForDir` lookup → `'unknown'`. The git-subdir path hash is sha256 of the normalized subdir path (forward-slash, strip leading `./`, strip trailing `/`); MUST match the squashfs cron byte-for-byte (`pluginVersioning.ts:69-74`).

### 4.5 GCS mirror for the official marketplace (`officialMarketplaceGcs.ts`)

Inc-5046 path, May 2026: instead of cloning `anthropics/claude-plugins-official` from GitHub on every startup, fetch a CDN-fronted zip from `https://downloads.claude.ai/claude-code-releases/plugins/claude-plugins-official/`:

1. GET `/latest` (~40 bytes, 5-min cache header)
2. Sentinel `.gcs-sha` at install location — same SHA → no-op
3. GET `/<sha>.zip` (~3.5MB, content-addressed, infinite cache)
4. Extract to `<installLocation>.staging`, parse zip mode bits to preserve `+x` (hooks need exec), rename atomically
5. Path safety: refuse install location outside the marketplaces cache dir (`officialMarketplaceGcs.ts:56-65`)
6. Telemetry buckets failures into stable kinds (`network`, `timeout`, `http_<status>`, `fs_<errno>`, `zip_parse`, `empty_latest`, `other`) for dashboard cardinality (`officialMarketplaceGcs.ts:196-216`)

GrowthBook kill-switch `tengu_plugin_official_mkt_git_fallback` (default `true`) controls whether GCS failures fall through to a git clone (`marketplaceManager.ts:2446-2459`). Once backend is confirmed live, flipping to `false` would force GCS-only.

---

## 5. `KnownMarketplacesFile` and `InstalledPluginsFileV2` formats

### 5.1 `known_marketplaces.json` (`schemas.ts:1592-1629`)

```json
{
  "claude-plugins-official": {
    "source": { "source": "github", "repo": "anthropics/claude-plugins-official" },
    "installLocation": "/Users/me/.claude/plugins/marketplaces/claude-plugins-official",
    "lastUpdated": "2026-05-08T12:00:00.000Z",
    "autoUpdate": true
  },
  "company-plugins": {
    "source": { "source": "git", "url": "git@gitlab.com:org/plugins.git", "ref": "v2.1.0" },
    "installLocation": ".../marketplaces/company-plugins",
    "lastUpdated": "...",
    "autoUpdate": false
  }
}
```

`autoUpdate` defaults: `true` for `ALLOWED_OFFICIAL_MARKETPLACE_NAMES` minus the no-auto-update set `{ knowledge-work-plugins }` (`schemas.ts:35`); `false` otherwise (`schemas.ts:48-58`).

### 5.2 `installed_plugins.json` V2 (`schemas.ts:1505-1577`)

V1 was per-plugin `{version, installedAt, ...}`; V2 changed each plugin to an **array of installations** (one per scope) so the same plugin can be installed at user scope @1.0 AND at project scope @1.1:

```json
{
  "version": 2,
  "plugins": {
    "code-formatter@anthropic-tools": [
      {
        "scope": "user",
        "installPath": "...",
        "version": "1.0.0",
        "installedAt": "...",
        "lastUpdated": "...",
        "gitCommitSha": "..."
      },
      { "scope": "project", "projectPath": "/repo", "installPath": "...", "version": "1.1.0" }
    ]
  }
}
```

`PluginScope` enum: `managed` | `user` | `project` | `local` (`schemas.ts:1506-1508`); the runtime extension `'flag'` (session-only, not persisted) lives in `pluginIdentifier.ts:14-32`. V1→V2 migration runs once per session at startup (`installedPluginsManager.ts:115-182`); `installed_plugins_v2.json` is moved to `installed_plugins.json` (the canonical name).

In-memory vs disk separation (`installedPluginsManager.ts:478-696`): the running session uses a frozen snapshot; background autoupdate writes new versions to disk; `hasPendingUpdates` / `getPendingUpdatesDetails` show the diff so the REPL can offer a restart prompt.

---

## 6. `dependencyResolver.ts` — non-transitive cross-marketplace allowlist

`allowCrossMarketplaceDependenciesOn` is a per-marketplace.json field. **Only the ROOT marketplace's allowlist applies** during a closure walk (`dependencyResolver.ts:80-86`, restated `:117-132`). Concrete: if `A`'s manifest allows `[B]` and you install `A`'s plugin which depends on `B`'s plugin which depends on `C`'s plugin, the walk fails on `C` even though `B`'s marketplace might trust `C`. Two escape hatches:

1. User installs the cross-mkt dep manually first (already-enabled deps are skipped).
2. The root marketplace adds the deeper marketplace to its own allowlist.

Bare-name deps inherit the declaring plugin's marketplace (`dependencyResolver.ts:38-46`), with one exception: `@inline` synthetic marketplace (from `--plugin-dir`) returns the bare name unchanged because there's no real marketplace to inherit from (`:44`). `verifyAndDemote` (`:177-234`) handles bare deps via name-only matching against `enabledByName`.

---

## 7. Built-in plugins (`bundled/`) — empty per memory, verified

`src/plugins/bundled/index.ts:18-23` is scaffolding only:

```ts
export function initBuiltinPlugins(): void {
  // No built-in plugins registered yet — this is the scaffolding for
  // migrating bundled skills that should be user-toggleable.
}
```

Comment at `bundled/index.ts:8-10` explains the policy: "Not all bundled features should be built-in plugins — use this for features that users should be able to explicitly enable/disable. For features with complex setup or automatic-enabling logic (e.g. claude-in-chrome), use src/skills/bundled/ instead."

Built-in registry plumbing exists (`builtinPlugins.ts:1-159`): `registerBuiltinPlugin`, `getBuiltinPlugins`, `getBuiltinPluginSkillCommands`, IDs are `<name>@builtin`. Default-enabled state: user setting > definition default > `true`. A `LoadedPlugin.path = 'builtin'` sentinel + `isBuiltin: true` flag distinguish them from filesystem plugins.

**Inventory cross-ref**: Anthropic Labs released **11 open-source plugins for Cowork on Jan 30, 2026** (per `tasks/research/anthropic-claude-suite-may-2026.md` line 622). Those 11 ship via the official marketplace `claude-plugins-official` (a Git repo), NOT via `bundled/` — so the empty `bundled/` and the existence of those plugins are not contradictory.

---

## 8. `userConfig` storage — `pluginOptionsStorage.ts`

Plugins declare per-key user-configurable options at `manifest.userConfig` (`schemas.ts:632-654`). Each key has type (`string|number|boolean|directory|file`), title, description, optional default/required/multiple/sensitive/min/max. Keys MUST be valid identifier-shaped (`^[A-Za-z_]\w*$`) so they can become `CLAUDE_PLUGIN_OPTION_<KEY>` env vars in hooks (`schemas.ts:639`).

Storage split (`pluginOptionsStorage.ts:90-194`):

- `sensitive: true` ⇒ `secureStorage.pluginSecrets[pluginId][key]` (macOS keychain, or `.credentials.json` elsewhere)
- everything else ⇒ `settings.json: pluginConfigs[pluginId].options[key]`

Reads merge both with secureStorage winning on collision (`:75`). Save order is keychain-first so a keychain failure leaves plaintext fallback intact (`:114-150`). Memoized per-pluginId (`:56`) since hooks fire per-tool-call; a `security find-generic-password` spawn is ~50-100ms on macOS.

Substitution helpers (`pluginOptionsStorage.ts` plus `pluginDirectories.ts:107-123`): `${CLAUDE_PLUGIN_ROOT}` (versioned install path) and `${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/<id>/`, lazy-mkdir), and `${user_config.KEY}` for non-sensitive values (sensitive resolves to a placeholder in skill/agent content; only flowing through MCP/LSP `env` and hook commands as actual values).

---

## 9. Auto-update (`pluginAutoupdate.ts`) and delisting (`pluginBlocklist.ts`)

**Auto-update** (`pluginAutoupdate.ts:227-284`): startup background job `autoUpdateMarketplacesAndPluginsInBackground` — collect marketplaces with `autoUpdate: true`, refresh each (skip seed-managed and `settings`-sourced), then update plugins from those marketplaces in parallel. Updates are non-in-place (disk-only, in-memory snapshot stays on old version) so a running session never gets surprised; REPL's `onPluginsAutoUpdated` callback shows a "restart to apply" toast (`:51-65`).

**Delisting enforcement** (`pluginBlocklist.ts:34-127`): for each marketplace with `forceRemoveDeletedPlugins: true`, find installed plugins whose name is no longer in the marketplace, auto-uninstall from user-controllable scopes (managed scopes are admin-only), add to `flagged-plugins.json`. The user sees them in a "Flagged" section in `/plugins` for 48 hours after first view, then they expire (`pluginFlagging.ts:31`, `:117-136`).

---

## 10. Inventory cross-reference

Per `tasks/research/anthropic-claude-suite-may-2026.md`:

- §5.10 `settings.json` keys (line 320): `enabledPlugins`, `extraKnownMarketplaces`, `strictKnownMarketplaces` are exactly the three plugin-related keys this file tree implements. **`enabledPlugins`** is read at every loader entry point (`pluginLoader.ts:1900`, `pluginStartupCheck.ts:39-72`, `dependencyResolver.ts:275-283`); accepts `true`, `false`, `undefined`, or array (version constraints, `dependencyResolver.ts:281`). **`extraKnownMarketplaces`** + `--add-dir` overlay produces the declared-marketplaces map used by reconciler (`marketplaceManager.ts:161-192`). **`strictKnownMarketplaces`** is a policy-only allowlist (`marketplaceHelpers.ts:159-165`); empty array = deny all; null = no policy.
- §5.11 (line 322-324): plugins ARE GitHub repos with `.claude-plugin/marketplace.json`. `claude plugin marketplace add <repo>` calls `parseMarketplaceInput` → `addMarketplaceSource`. `claude plugin install <name>@<marketplace>` calls `installResolvedPlugin`. `claude plugin tag` (May 2026) creates a release Git tag with version validation (CLI-side; `calculatePluginVersion` is the local validator).
- §E.1 (line 657-671): Skills schema (`SKILL.md` with YAML frontmatter `name ≤ 64 chars` lowercase/numbers/hyphens, `description ≤ 1024 chars`). Implemented inside `loadPluginCommands.ts` for the discovery side; the SKILL.md folder treatment as a leaf at `walkPluginMarkdown.ts:33-46` matches the documented `scripts/`/`references/`/`assets/` structure (those subfolders are NOT walked for slash commands, only the SKILL.md becomes a command).
- §D (line 622, Jan 2026 Cowork plugins): 11 open-source plugins ship via `anthropics/claude-plugins-official`, validated by `validateOfficialNameSource`.

Aggregator stats (`tasks/research/anthropic-claude-suite-may-2026.md:651`, also restated at `:324`):

- 4,200+ skills (May 7 2026 snapshot)
- 770+ MCP servers
- 2,500+ marketplaces

Of those, **the 16+ official skills inside `anthropics/skills`** are surfaced through the same loader path as third-party — there is NO special bundled path for official skills (they're cloned as a marketplace).

---

## 11. Threat model & locked-down behaviors

1. **Reserved-name impersonation**: regex `BLOCKED_OFFICIAL_NAME_PATTERN` (`schemas.ts:71-72`) + ASCII-only enforcement (`:79`) + `validateOfficialNameSource` (`:119-157`).
2. **Path traversal**: every fs.rm-adjacent code path resolves and verifies inside an expected base; per-fix CC-bug citations: gh-32793, gh-32661 (corrupted `installLocation`), gh-29485 (marketplace-source `..`), gh-31256 (Azure DevOps URL), gh-30794 (literal `~`), gh-28373 (empty stderr clone failure).
3. **Plugin agent privilege escalation**: explicit drop of `permissionMode`, `hooks`, `mcpServers` from plugin agent frontmatter (`loadPluginAgents.ts:153-168`). Plugin authors can ship those at the manifest level (install-time consent) but not buried inside an `agents/<...>.md` file.
4. **Cross-marketplace auto-install**: blocked by default; only ROOT marketplace's allowlist counts; no transitive trust (`dependencyResolver.ts:80-86`).
5. **SSH host key verification**: `StrictHostKeyChecking=yes` everywhere — unknown hosts fail closed, never silently accepted (`marketplaceManager.ts:626-627`, `:736`, `:812`).
6. **Credential leakage**: all log paths run `redactUrlCredentials` (`marketplaceManager.ts:1213-1226`).
7. **Policy fail-closed**: when policy is configured but a marketplace's source is unverifiable (corrupted config), `loadAllPlugins` blocks rather than fall through to an unchecked raw-cast lookup (`pluginLoader.ts:1933-2020`).
8. **`forceRemoveDeletedPlugins`**: marketplace owners can invalidate plugins by removing them from `marketplace.json`; clients auto-uninstall on next startup.
9. **Org policy `enabledPlugins[<id>] = false`**: deny-list any plugin name (no install, no enable, even at any user scope) via `isPluginBlockedByPolicy` (`pluginPolicy.ts:17-20`).
10. **Settings-sourced marketplaces**: cannot use a reserved name (`schemas.ts:1017-1024`); the inline plugins array surfaces edits as `sourceChanged` via `isEqual` (no special dirty-tracking).

---

## 12. Architecture notes for AGI Workforce

The Claude Code plugin/marketplace architecture is **the largest gap** between AGI Workforce and parity with Claude's CLI ecosystem. Five structural lessons:

1. **Three layers separated**: intent (settings) → state (`known_marketplaces.json` + `installed_plugins.json`) → active (AppState in process). Reconciler shifts intent → state; refresh.ts shifts state → active. We need the same separation; mixing them invites the gh-29767-class bugs (caches cleared without re-register, hooks silently dead).
2. **Cache hygiene is hard**: V1→V2 migration, legacy GC, orphan markers, 7-day window for in-progress sessions, ripgrep glob exclusions for orphaned versions (`orphanedPluginFilter.ts:38-88`). Get this wrong and every plugin update either breaks live sessions or accumulates GBs of dead caches.
3. **GCS mirror substitutes for git on hot path**: the official marketplace is fetched as a content-addressed zip on a CDN-cacheable URL. Hits a SHA sentinel, no work when up-to-date. AGI can do the same — host an `agi-plugins-official` zip on Cloudflare R2 keyed by SHA, fall back to git only if the GCS fetch fails.
4. **Sandbox defense-in-depth, not isolation**: plugins are JS code in the same process. The trust gate is install-time consent (manifest-level hooks/MCP/LSP) plus author boundaries (plugin agents drop privileged frontmatter). We should mirror this — and we should NOT promise per-plugin sandboxing we can't deliver.
5. **Manifest is split**: marketplace.json gives discoverability + override (strict=false); plugin.json gives author-controlled metadata (strict=true). Each entry can be its own choice. Author error (`category` accidentally in plugin.json) is surfaced as a warning by `claude plugin validate`, not a runtime failure (`validatePlugin.ts:215-241`). Tooling-friendly.

The empty `bundled/` is intentional — Anthropic's policy is that anything user-toggleable should be installable via a marketplace, not statically baked. The `built-in` machinery exists for future migration but is unused in v2.x. AGI Workforce should adopt the same posture: ship one ofcial marketplace as a Git repo + GCS mirror, not as bundled code.
