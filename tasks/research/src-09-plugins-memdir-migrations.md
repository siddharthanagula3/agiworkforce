# Research: Plugins, Memdir, Migrations (`~/Desktop/reference/src/{plugins,memdir,migrations}`)

**Scope**: Plugin extensibility, auto-memory infra, settings/model migrations.
**Date**: 2026-05-08. **Reference repo**: `~/Desktop/reference/src/` (Claude Code v2.x deobfuscated source).

`ls` summary:

- `plugins/` — 1 file + `bundled/` subdir → in-tree shell only. Real engine sits in `~/Desktop/reference/src/utils/plugins/` (43 files) + `~/Desktop/reference/src/services/plugins/` (3 files) + `~/Desktop/reference/src/types/plugin.ts`.
- `memdir/` — 8 files (74 KB total). Self-contained.
- `migrations/` — 11 files (one-shot startup migrations, no shared base class).

---

## 1. Plugins

### 1.1 Manifest format — `plugin.json` (Zod-validated)

Manifests are JSON files at the plugin root, validated by `PluginManifestSchema` at `~/Desktop/reference/src/utils/plugins/schemas.ts:884-898`. Top-level shape (composed via `z.object({...metadata.shape, ...hooks.partial().shape, ...})`):

| Field                                                                    | Kind                                                                                              | Notes                                                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `name`                                                                   | required string                                                                                   | kebab-case, no spaces (`schemas.ts:276-285`)                                                                           |
| `version`                                                                | optional semver                                                                                   | (`schemas.ts:286-291`)                                                                                                 |
| `description`, `author`, `homepage`, `repository`, `license`, `keywords` | optional metadata                                                                                 | (`schemas.ts:292-313`)                                                                                                 |
| `dependencies`                                                           | array of `DependencyRefSchema`                                                                    | accepts `"plugin"`, `"plugin@marketplace"`, or `{name, marketplace?}` (`schemas.ts:1367-1391`)                         |
| `hooks`                                                                  | path-or-inline                                                                                    | string `./hooks.json`, array, or inline (`schemas.ts:348-373`)                                                         |
| `commands`                                                               | path / array / object map                                                                         | object form `{cmdName: {source, content?, description?, argumentHint?, model?, allowedTools?}}` (`schemas.ts:385-451`) |
| `agents`                                                                 | path or array of `.md` paths                                                                      | (`schemas.ts:460-476`)                                                                                                 |
| `skills`                                                                 | dir path or array of dirs                                                                         | each dir contains `SKILL.md` (`schemas.ts:484-499`)                                                                    |
| `outputStyles`                                                           | path or array                                                                                     | (`schemas.ts:507-523`)                                                                                                 |
| `mcpServers`                                                             | path / `.mcpb`/`.dxt` URL / inline record / array                                                 | (`schemas.ts:543-572`)                                                                                                 |
| `lspServers`                                                             | `.lsp.json` path or inline record                                                                 | (`schemas.ts:797-820`)                                                                                                 |
| `channels`                                                               | array of `{server, displayName?, userConfig?}`                                                    | maps to MCP server providing `notifications/claude/channel` (`schemas.ts:670-703`)                                     |
| `userConfig`                                                             | `Record<KEY, {type, title, description, required?, default?, multiple?, sensitive?, min?, max?}>` | KEY must be valid identifier; sensitive values go to keychain (`schemas.ts:632-654`)                                   |
| `settings`                                                               | `Record<string, unknown>`; allowlisted at load time                                               | (`schemas.ts:857-867`)                                                                                                 |

Unknown top-level fields are silently stripped (`schemas.ts:875-882`); nested `userConfig`/`channels`/`lspServers` remain `.strict()` so typos there fail.

Convention directory layout shipped in pluginLoader.ts header (`~/Desktop/reference/src/utils/plugins/pluginLoader.ts:14-25`):

```
my-plugin/
├── plugin.json
├── commands/{*.md}
├── agents/{*.md}
└── hooks/hooks.json
```

### 1.2 Discovery paths

Resolved by `getPluginsDirectory()` at `pluginDirectories.ts:53-63`. Priority chain:

1. `CLAUDE_CODE_PLUGIN_CACHE_DIR` env var (with `expandTilde`).
2. `getClaudeConfigHomeDir()` + `'plugins'` (default `~/.claude/plugins`).
3. Coplowork mode swaps to `cowork_plugins` (`pluginDirectories.ts:34-44`) if `--cowork` flag or `CLAUDE_CODE_USE_COWORK_PLUGINS` env var.

Cache layout (`pluginLoader.ts:155-162, 172-177`): `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. Per-plugin user data: `~/.claude/plugins/data/<sanitizedPluginId>/` (`pluginDirectories.ts:97-123`).

Pre-baked seed dirs via `CLAUDE_CODE_PLUGIN_SEED_DIR` (`:`/`;` delimited, `pluginDirectories.ts:85-90`) — read-only fallback layer for container images.

Marketplace sources (`MarketplaceSourceSchema`, `schemas.ts:906-1044`): `url`, `github` (with `sparsePaths` for monorepos), `git` (any URL incl. Azure DevOps/CodeCommit), `npm`, `file`, `directory`, `hostPattern`/`pathPattern` (allowlist patterns), and `settings` (inline marketplace in settings.json).

Plugin sources (`PluginSourceSchema`, `schemas.ts:1062-1161`): relative path within marketplace, `npm` (with custom registry), `pip`, `url` (git URL), `github`, `git-subdir` (sparse-checkout monorepo).

### 1.3 Plugin types

Per `PluginComponent` union at `~/Desktop/reference/src/types/plugin.ts:72-77`:

- `commands` — slash commands (markdown files; can also be skill dirs)
- `agents` — sub-agent prompt files
- `skills` — skill directories with `SKILL.md`
- `hooks` — JSON hook configs
- `output-styles` — response-rendering presets

Plus orthogonal capabilities: MCP servers, LSP servers, channels (MCP-backed message injection), userConfig values.

### 1.4 Built-in plugins

Defined by `BuiltinPluginDefinition` at `types/plugin.ts:18-35`: `{name, description, version?, skills?, hooks?, mcpServers?, isAvailable?, defaultEnabled?}`. Registered via `registerBuiltinPlugin()` at `~/Desktop/reference/src/plugins/builtinPlugins.ts:28-32`.

**`~/Desktop/reference/src/plugins/bundled/index.ts:20-23` ships ZERO built-in plugins** — `initBuiltinPlugins()` is empty scaffolding. Comment: "No built-in plugins registered yet — this is the scaffolding for migrating bundled skills that should be user-toggleable." So bundled SKILLS exist (via `src/skills/bundled/`), but the user-toggleable plugin slot is reserved for future use.

Built-in IDs use `{name}@builtin` (`builtinPlugins.ts:23, 37-39`), and toggling persists to `enabledPlugins` in user settings (`builtinPlugins.ts:71-76`).

### 1.5 Lifecycle — there is no `onLoad`/`onActivate`

Plugins are **declarative**: the manifest enumerates components and hooks; the loader merges them into the global hook/command/MCP registries at startup. No imperative entry-point. Hooks (the closest analog) are described in `~/Desktop/reference/src/schemas/hooks.ts` (referenced from `schemas.ts:2`) and run on lifecycle events (PreToolUse, PostToolUse, etc.). Per-plugin "activation" = toggling `enabled` in settings; component-load happens via filesystem scan at the next session start.

### 1.6 Permissions / scopes

Plugin scopes (`PluginScopeSchema`, `schemas.ts:1506-1508`): `managed` (enterprise read-only), `user` (`~/.claude/settings.json`), `project` (`<repo>/.claude/settings.json`), `local` (`<repo>/.claude/settings.local.json`). Plus runtime-only `flag` from `--plugin-dir` (`pluginIdentifier.ts:14-32`).

Settings safety: `getAutoMemPathSetting()` at `paths.ts:179-186` deliberately excludes `projectSettings` from trusted overrides — a malicious repo could otherwise set `autoMemoryDirectory: "~/.ssh"` and exploit the filesystem write carve-out. Plugin loading follows the same trusted-source pattern.

Marketplace impersonation guard: `ALLOWED_OFFICIAL_MARKETPLACE_NAMES` at `schemas.ts:19-28` (`claude-code-marketplace`, `anthropic-marketplace`, etc.) restricts these names to the `anthropics` GitHub org via `validateOfficialNameSource()` (`schemas.ts:119-157`). Non-ASCII (homograph) names blocked at `schemas.ts:79`. Pattern-matched impersonation (`official-claude*`, `claude-marketplace-v2`) blocked by regex at `schemas.ts:71-72`.

### 1.7 Namespacing

Plugin identifier format (`PluginIdSchema`, `schemas.ts:1339-1346`): `^[a-z0-9][-a-z0-9._]*@[a-z0-9][-a-z0-9._]*$` — i.e., `plugin-name@marketplace-name`. Built-in plugins use the reserved marketplace name `builtin` (`schemas.ts:243-245`). Inline `--plugin-dir` plugins use reserved `inline` (`schemas.ts:239-242`).

Slash command namespacing example from manifest comment (`schemas.ts:447-449`): `"about"` command → `/plugin:about`.

### 1.8 Sandboxing

**No process isolation.** Plugins run in-process. The "sandbox" is the type-safe loader: schema validation, path-traversal checks (`schemas.ts:840-849, 222-233`), and the hook/MCP/LSP isolation that already separates external commands. MCP servers ARE separate processes (stdio/socket), so MCP-only plugins are inherently sandboxed by the MCP transport boundary.

### 1.9 Marketplace integration

Full marketplace system. Tracked in `~/.claude/plugins/known_marketplaces.json` (`KnownMarketplacesFileSchema`, `schemas.ts:1624-1629`). Each entry: `{source, installLocation, lastUpdated, autoUpdate?}`. Installations tracked separately in `installed_plugins.json` (V1 schema `InstalledPluginsFileSchemaV1` at `schemas.ts:1482-1492`, V2 at `schemas.ts:1562-1569` — multi-scope arrays).

Auto-update default for official marketplaces is true (`schemas.ts:48-58`), except `knowledge-work-plugins` (opted out at `schemas.ts:35`).

Mature ecosystem: `marketplaceManager.ts`, `officialMarketplace.ts`, `officialMarketplaceGcs.ts` (Google Cloud Storage backing for official marketplace), `officialMarketplaceStartupCheck.ts`, `dependencyResolver.ts` (resolves cross-plugin deps; root marketplace's `allowCrossMarketplaceDependenciesOn` allowlist is non-transitive — `schemas.ts:1319-1324`), `pluginBlocklist.ts`, `pluginPolicy.ts`, `installCounts.ts`, `fetchTelemetry.ts`. The NPM/pip plugin source variants invoke `npm`/`pip` directly to install packages.

### 1.10 Update / version management

`pluginVersioning.ts` calculates plugin version from manifest semver, marketplace pin, or git SHA. `pluginAutoupdate.ts` handles per-marketplace auto-update opt-in. Cache is version-keyed (`getVersionedCachePath` at `pluginLoader.ts:172-177`), so old versions don't get clobbered until orphan-GC runs (referenced in `orphanedPluginFilter.ts`). MCPB (MCP Bundle) `.mcpb`/`.dxt` files are extracted and re-validated by `mcpbHandler.ts`.

User config persistence: non-sensitive → `settings.json` `pluginConfigs[pluginId].options`; sensitive (`sensitive: true` flag) → macOS keychain or `.credentials.json` (`schemas.ts:613-617, 642-651`). Comment notes shared-keychain-entry size limit (~2KB) due to INC-3028.

---

## 2. Memdir (auto-memory)

### 2.1 File format — markdown with YAML frontmatter

Frontmatter format (`memoryTypes.ts:261-271`):

```markdown
---
name: { { memory name } }
description: { { one-line description — used to decide relevance... } }
type: { { user, feedback, project, reference } }
---

{{memory content — for feedback/project, structure as: rule/fact, then **Why:** and **How to apply:**}}
```

Verified in our own auto-memory files (`~/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/cli-audit-2026-05-03.md:1-7`):

```
---
name: CLI competitive audit 2026-05-03
description: ...
type: project
originSessionId: b4ea7cb6-4451-4694-bca3-3463093db39f
---
```

Note `originSessionId` is an extra field — the Zod / parser side accepts arbitrary frontmatter (parser only reads `description` and `type`, see `memoryScan.ts:55-62`).

### 2.2 Memory types — closed taxonomy

Locked at `memoryTypes.ts:14-19`: `['user', 'feedback', 'project', 'reference']`. `parseMemoryType()` at `memoryTypes.ts:28-31` returns `undefined` for unknown / missing — files without `type:` keep working but are untyped.

| Type          | Scope                     | When to save                                    | When to use                                                   |
| ------------- | ------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| **user**      | always private            | role/preferences/responsibilities/knowledge     | tailor explanations to user's domain                          |
| **feedback**  | private (default) or team | corrections OR validations of approach          | avoid repeated guidance; include **Why:** + **How to apply:** |
| **project**   | bias toward team          | who/what/why/by-when (decay fast)               | broader context, anticipate coordination                      |
| **reference** | usually team              | external system pointers (Linear/Slack/Grafana) | when user references external system                          |

Excluded by policy (`WHAT_NOT_TO_SAVE_SECTION`, `memoryTypes.ts:183-195`): code patterns, architecture, file paths, git history, debug-fix recipes, anything in `CLAUDE.md`, ephemeral task state. Explicit-save gate: even direct "save this PR list" requests should be deflected unless something was _surprising_.

### 2.3 Discovery path — per-project, repo-rooted

Resolved by `getAutoMemPath()` at `paths.ts:223-235`. Memoized on `getProjectRoot()`. Resolution order:

1. `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE` env var (full-path override; used by Cowork; `paths.ts:161-166`)
2. `autoMemoryDirectory` in trusted settings (policy/local/user; `paths.ts:179-186`)
3. `<memoryBase>/projects/<sanitized-git-root>/memory/` where `<memoryBase>` = `CLAUDE_CODE_REMOTE_MEMORY_DIR` env or `~/.claude` (`paths.ts:85-90`).

Project root uses `findCanonicalGitRoot()` (`paths.ts:200-205`) — all worktrees of the same repo share one auto-memory dir (Claude Code issue #24382).

`isAutoMemoryEnabled()` priority chain (`paths.ts:30-55`):

1. `CLAUDE_CODE_DISABLE_AUTO_MEMORY` env (truthy → off, falsy → on)
2. `CLAUDE_CODE_SIMPLE` (`--bare`) → off
3. CCR remote without `CLAUDE_CODE_REMOTE_MEMORY_DIR` → off
4. `autoMemoryEnabled` setting
5. Default: enabled

Path validation hardened: `validateMemoryPath()` at `paths.ts:109-150` rejects relative, `<3` char, Windows drive root `C:`, UNC `\\server\share`, `//server`, null bytes; bare `~`/`~/`/`~/..` rejected before tilde expansion (`paths.ts:122-135`).

### 2.4 `MEMORY.md` index format

Constants at `memdir.ts:34-38`:

```
ENTRYPOINT_NAME = 'MEMORY.md'
MAX_ENTRYPOINT_LINES = 200
MAX_ENTRYPOINT_BYTES = 25_000
```

Two-step save: write topic file with frontmatter; then add line to `MEMORY.md` index (`memdir.ts:222-234`). Each index line: `- [Title](file.md) — one-line hook` under ~150 chars, no frontmatter on `MEMORY.md` itself. Both line and byte caps enforced; truncation appends a warning naming which cap fired (`memdir.ts:57-103`).

Verified our `~/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/MEMORY.md` follows this with `## Critical Rules`, `## Memory Files (45 — actual count per docs agent reconciliation 2026-05-04)` sections — exactly the upstream pattern.

### 2.5 Loading — auto-loaded + on-demand recall

Auto-load: `loadMemoryPrompt()` at `memdir.ts:419-507` is invoked from `~/Desktop/reference/src/constants/prompts.ts:476, 495` to inject the `# auto memory` system-prompt section on every session start. The full `MEMORY.md` (truncated to caps) is appended.

On-demand: `findRelevantMemories()` at `findRelevantMemories.ts:39-75` is invoked per user turn from `attachments.ts:2217`. It:

1. `scanMemoryFiles()` — walks the memory dir, parses frontmatter (first 30 lines, `memoryScan.ts:23, 35-77`), keeps newest 200 (`memoryScan.ts:21, 73`).
2. Asks Sonnet to pick up to 5 (`findRelevantMemories.ts:77-141`) given query + manifest (`[type] filename (timestamp): description` per memory).
3. Returns `{path, mtimeMs}` of selected.
4. Caller injects file content as `relevant_memories` attachment with `<system-reminder>` staleness note for files >1 day old (`memoryAge.ts:33-53`).

Selector prompt (`findRelevantMemories.ts:18-24`): "Be selective and discerning … If a list of recently-used tools is provided, do not select memories that are usage reference or API documentation for those tools."

### 2.6 Write rules

Save: any user correction, validation, role/preference disclosure, project context not derivable from code, external-system reference. Don't save: derivable code/architecture, ephemeral state, things in `CLAUDE.md`. The exclusion applies even when explicitly asked (`memoryTypes.ts:193-195`).

Convention: lead with rule/fact, then `**Why:** ...` and `**How to apply:** ...` for feedback/project types (`memoryTypes.ts:62-63, 81-82`). Convert relative dates to absolute when saving (`memoryTypes.ts:79`).

### 2.7 Deduplication / update

No automatic dedup. Prompt rule: "First check if there is an existing memory you can update before writing a new one" (`memdir.ts:216, 233`). Outdated entries should be updated or removed. Nightly (KAIROS) `/dream` skill distills append-only daily logs into topic files + MEMORY.md index for assistant-mode (`memdir.ts:319-370`).

### 2.8 Rotation / cleanup

`MAX_MEMORY_FILES = 200` cap at scan time (`memoryScan.ts:21`). Beyond that, oldest files drop out of recall but remain on disk. No TTL/expiry. Staleness conveyed via `memoryAge.ts:15-20` ("today" / "yesterday" / "N days ago") and freshness note for >1d files at `memoryAge.ts:33-53`.

### 2.9 Recall invocation

Two paths:

1. **Always-on**: `MEMORY.md` is in system prompt every session.
2. **Per-turn**: `findRelevantMemories` runs on user input (`attachments.ts:2215-2225`), capped at 5 selected, deduped against `alreadySurfaced` and `readFileState` (`attachments.ts:2231-2234`).

Trust guidance section (`TRUSTING_RECALL_SECTION`, `memoryTypes.ts:240-256`): "A memory that names a specific function, file, or flag is a claim that it existed _when the memory was written_. … Before recommending it: grep for the function/flag, check the file exists." Eval-validated (header wording test 3/3 vs. 0/3 with abstract header).

### 2.10 Cross-project / user-level

Auto memory IS per-project (keyed on canonical git root). Cross-project / user-level memories live in regular topic files of `type: user` under each project's memory dir — there is no separate user-global directory in the upstream code. Team memory at `paths.ts/teamMemPaths.ts:84-86` is `<autoMemPath>/team/` subdirectory (per-project shared), behind `tengu_herring_clock` GrowthBook gate.

Path validation for team paths: full traversal-attack defense at `teamMemPaths.ts:22-64` (null bytes, URL-encoded `%2e%2e%2f`, NFKC homograph `．．／`, backslash, leading `/`). Symlink-resolution write check at `teamMemPaths.ts:109-256` walks dirname chain via `realpath()` since `path.resolve()` doesn't follow symlinks (PSR M22186, comment at `teamMemPaths.ts:104-108`).

Agent-scoped memory: when an agent is `@`-mentioned, search isolates to the agent's memory dir (`attachments.ts:2206-2212`). `extractAgentMentions(input)` → per-agent dir override.

### 2.11 Extract loop (background)

`isExtractModeActive()` at `paths.ts:69-77` controls a background extraction agent (gated on `tengu_passport_quail`). Main agent's prompt always has full save instructions; the background agent fills in anything missed. Skips ranges where the main agent already wrote. Implementation in `~/Desktop/reference/src/services/extractMemories/extractMemories.ts` (615 LOC).

---

## 3. Migrations

### 3.1 File format — plain TS function (no shared base class)

Each file exports a single named function with no down-migration. Examples:

| File                                                  | Function                                             | What it does                                                                                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrateAutoUpdatesToSettings.ts`                     | `migrateAutoUpdatesToSettings()`                     | Move `autoUpdates: false` from global config → `userSettings.env.DISABLE_AUTOUPDATER='1'`; deletes both old keys                                                                         |
| `migrateBypassPermissionsAcceptedToSettings.ts`       | `migrateBypassPermissionsAcceptedToSettings()`       | `bypassPermissionsModeAccepted` → `skipDangerousModePermissionPrompt: true`                                                                                                              |
| `migrateEnableAllProjectMcpServersToSettings.ts`      | `migrateEnableAllProjectMcpServersToSettings()`      | Move 3 MCP fields from project config → local settings; merges array dedup                                                                                                               |
| `migrateFennecToOpus.ts`                              | `migrateFennecToOpus()`                              | Internal-only (`USER_TYPE === 'ant'`); fennec-\* model aliases → opus / opus[1m] / opus + fastMode                                                                                       |
| `migrateLegacyOpusToCurrent.ts`                       | `migrateLegacyOpusToCurrent()`                       | First-party `claude-opus-4-{0,1}*` → `'opus'` alias; sets `legacyOpusMigrationTimestamp` for one-time UI notification                                                                    |
| `migrateOpusToOpus1m.ts`                              | `migrateOpusToOpus1m()`                              | Eligible Max/Team Premium 1P users on `'opus'` → `'opus[1m]'`                                                                                                                            |
| `migrateReplBridgeEnabledToRemoteControlAtStartup.ts` | `migrateReplBridgeEnabledToRemoteControlAtStartup()` | Rename global config key                                                                                                                                                                 |
| `migrateSonnet1mToSonnet45.ts`                        | `migrateSonnet1mToSonnet45()`                        | `'sonnet[1m]'` → `'sonnet-4-5-20250929[1m]'`; tracked by `sonnet1m45MigrationComplete` flag in global config                                                                             |
| `migrateSonnet45ToSonnet46.ts`                        | `migrateSonnet45ToSonnet46()`                        | Pro/Max/TeamPremium 1P from explicit Sonnet 4.5 strings → `'sonnet'` alias (which now resolves to 4.6); skip notification for `numStartups <= 1`                                         |
| `resetAutoModeOptInForDefaultOffer.ts`                | `resetAutoModeOptInForDefaultOffer()`                | One-shot: clear `skipAutoPermissionPrompt` for old 2-option dialog acceptors so they see new "make it default" option; guard via `hasResetAutoModeOptInForDefaultOffer` in global config |
| `resetProToOpusDefault.ts`                            | `resetProToOpusDefault()`                            | Pro 1P users get `opusProMigrationComplete` + optional notification timestamp                                                                                                            |

No SQL, no DB schema. All mutations to `~/.claude.json` (global config) and `settings.json` cascade.

### 3.2 Discovery — explicit imports + ordered list

No directory scan. All migrations are imported and called by `runMigrations()` at `~/Desktop/reference/src/main.tsx:326-352`:

```ts
const CURRENT_MIGRATION_VERSION = 11;
function runMigrations(): void {
  if (getGlobalConfig().migrationVersion !== CURRENT_MIGRATION_VERSION) {
    migrateAutoUpdatesToSettings();
    migrateBypassPermissionsAcceptedToSettings();
    migrateEnableAllProjectMcpServersToSettings();
    resetProToOpusDefault();
    migrateSonnet1mToSonnet45();
    migrateLegacyOpusToCurrent();
    migrateSonnet45ToSonnet46();
    migrateOpusToOpus1m();
    migrateReplBridgeEnabledToRemoteControlAtStartup();
    if (feature('TRANSCRIPT_CLASSIFIER')) resetAutoModeOptInForDefaultOffer();
    if ('external' === 'ant') migrateFennecToOpus();
    saveGlobalConfig((prev) =>
      prev.migrationVersion === CURRENT_MIGRATION_VERSION
        ? prev
        : { ...prev, migrationVersion: CURRENT_MIGRATION_VERSION },
    );
  }
  migrateChangelogFromConfig().catch(() => {}); // async, fire-and-forget
}
```

`@[MODEL LAUNCH]` comment marker at `main.tsx:323` reminds engineers to add a model migration when launching new Claude versions. The `CURRENT_MIGRATION_VERSION = 11` bump (and the matching `migrationVersion` flag in global config) re-runs the entire set; individual migrations stay idempotent so running twice is safe.

### 3.3 What gets migrated

- `~/.claude.json` global config (autoUpdates, bypassPermissionsModeAccepted, replBridgeEnabled, model name pins, completion flags like `sonnet1m45MigrationComplete`, `opusProMigrationComplete`).
- `settings.json` cascade (user/local/project) — `model`, `env.DISABLE_AUTOUPDATER`, `enableAllProjectMcpServers`, `skipDangerousModePermissionPrompt`, etc.
- No DB schema, no memory files.
- Async chunk: `migrateChangelogFromConfig` (`utils/releaseNotes.js`, fire-and-forget at `main.tsx:349-351`).

### 3.4 Lifecycle — startup, gated by version flag

Single entry-point at startup (synchronous, before main loop). Gated by `migrationVersion` integer in global config — bumped each time the set changes. Idempotent migrations may still re-run on bump, which they handle.

### 3.5 Per-migration metadata

Each migration carries its own completion flag in global config (e.g., `sonnet1m45MigrationComplete`, `hasResetAutoModeOptInForDefaultOffer`, `opusProMigrationComplete`). Some also write a notification timestamp (`sonnet45To46MigrationTimestamp`, `legacyOpusMigrationTimestamp`, `opusProMigrationTimestamp`) so the REPL can surface a one-time banner. Idempotency typically achieved by reading-and-writing the same source — re-running is a no-op unless settings revert (`migrateFennecToOpus.ts:13-17` comment).

### 3.6 Failure handling

Each migration wraps work in `try/catch`, logs via `logError()` and `logEvent('tengu_migrate_*_error', ...)` (e.g. `migrateAutoUpdatesToSettings.ts:55-60`, `migrateBypassPermissions...:36-40`). **Failures don't throw** — startup continues, retry happens implicitly on next session if `migrationVersion` still mismatches. No rollback.

Telemetry events fire on success (`tengu_migrate_<name>` or `tengu_migrate_<name>_success`), explicit skipped state, and error.

---

## 4. Cross-references

### 4.1 Plugins as commands / skills / tools

The bundled-plugin scaffolding at `bundled/index.ts` is currently empty. Built-in skills shipping in-tree live at `~/Desktop/reference/src/skills/bundled/` (referenced from `builtinPlugins.ts:17` via `BundledSkillDefinition`); these are imported by `skillDefinitionToCommand()` at `builtinPlugins.ts:132-159` and converted to `Command` objects with `source: 'bundled'`, `loadedFrom: 'bundled'`, `disableModelInvocation: false` (default), `userInvocable: true` (default).

Concrete commands from the upstream UI: `/plugin`, `/plugins` (toggle UI per `pluginCliCommands.ts`); `/dream` (KAIROS distillation referenced at `memdir.ts:319-326`).

### 4.2 Memory → context injection

Two injection points:

1. **System prompt** (`prompts.ts:476, 495`) — `loadMemoryPrompt()` returns either `buildMemoryLines()` (auto only) or `buildCombinedMemoryPrompt()` (auto+team) or `buildAssistantDailyLogPrompt()` (KAIROS). The full `MEMORY.md` index (truncated) is appended at `memdir.ts:295-313`.
2. **User-context attachments** (`attachments.ts:2215-2241`) — `relevant_memories` attachment carries up-to-5 file paths/contents wrapped in `<system-reminder>` if stale. `collectSurfacedMemories()` (`attachments.ts:2251-2266`) tracks paths across messages so the selector doesn't re-pick.

### 4.3 Migration → state

`getGlobalConfig()` (from `utils/config.js`) is the durable state. `migrationVersion: 11` lives there. `state.ts` (the bootstrap state for the live process) doesn't track migrations — they're a config-file concern, not session state.

---

## 5. Comparison hooks

### 5.1 Our auto-memory vs Claude Code's

**Match** — our `~/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/` directory is exactly the Claude Code pattern. 49 files counted, including `MEMORY.md` index. Frontmatter format matches (`name`, `description`, `type`). We even have `originSessionId` extra field, which the upstream parser silently ignores (`memoryScan.ts:55-62` only reads `description` and `type`).

**Cosmetic differences (already in tolerance window):**

- Our `MEMORY.md` is written as authored prose under `## Critical Rules` / `## What This Project Is` / `## Verified Codebase Stats` / etc., not the canonical `- [Title](file.md) — one-line hook` index format from `memdir.ts:227`. Upstream would render it but truncate at line 200 / byte 25,000. Currently 45+ entries — likely under both caps.
- Three sibling project keys at `~/.claude/projects/`: `-Users-siddhartha-Desktop-agiworkforce`, `-Users-siddhartha-Desktop-agiworkforce-apps`, `-Users-siddhartha-Desktop-agiworkforce-apps-cli`, etc. Upstream `findCanonicalGitRoot()` (`paths.ts:200-205`) would normalize all of these to one repo. Our setup created multiple project keys because the auto-memory was bound to working directory not git root. **This is the only structural divergence** — Claude Code would give us one shared dir; we have several small ones.

### 5.2 What we'd need to ship plugins in our CLI

To clone this system into `apps/cli`:

1. **Manifest schema** — port `PluginManifestSchema` (Zod) to a Rust equivalent (serde + custom validation). Allowlist top-level fields, strip unknown.
2. **Discovery** — `~/.agiworkforce/plugins/` (matches our existing `comp-dotfile-architectures.md` blueprint), with `cache/<marketplace>/<plugin>/<version>/` and `data/<id>/` layout.
3. **Plugin types** — start with `commands`, `agents`, `skills`, `hooks`. Defer `mcpServers` (already partially supported in CLI via `apps/cli/src/mcp/`), `lspServers`, `outputStyles`. Defer `channels`.
4. **Sources** — start with `git` (any URL — Azure DevOps support), `github`, `directory` for local development. Defer `npm`/`pip` (foreign toolchains).
5. **Marketplaces** — `marketplace.json` listing plugins; `known_marketplaces.json` and `installed_plugins.json` (V2 multi-scope) tracking. Reserve official names (`agi-workforce-marketplace`, `agi-workforce-plugins`).
6. **Built-in plugin scaffold** — `apps/cli/src/plugins/builtinPlugins.rs` mirroring `BUILTIN_MARKETPLACE_NAME = 'builtin'` pattern.
7. **Settings cascade** — extend our `models.json`/settings system with `enabledPlugins`, `pluginConfigs[id].options`, `extraKnownMarketplaces`, `strictKnownMarketplaces`, `blockedMarketplaces`.
8. **No process sandbox** — match upstream (in-process loader, MCP transport boundary for MCP-backed plugins). Add `policySettings` source for enterprise lockdown.
9. **userConfig prompt flow** — at enable time, prompt for sensitive fields → keychain (macOS), DPAPI (Windows), libsecret (Linux). Reuse our existing `master_password.rs` vault.
10. **Hooks** — wire 22 canonical CLI event names (per `apps/cli/src/hooks.rs:179-200`) so plugin-supplied hooks register on familiar lifecycle points.

Engineering scope estimate: 6–10 weeks for a Rust port at parity with the upstream loader (3,302 LOC). Marketplace-with-deps + auto-update is the long pole.

---

## 6. Open questions

1. **Built-in plugin shipping policy** — upstream `bundled/index.ts` is empty. Claude Code uses `src/skills/bundled/` for hardcoded skills and reserves the built-in plugin slot for "skills users should be able to enable/disable." For our `agiworkforce` CLI, do we mirror the empty scaffold, or pre-register a small set (e.g., `code-review`, `commit-msg`) so Hobby tier users see something out of the box? If we register them, do we ship pre-bundled in the binary or as auto-installed marketplace entries? Decision affects binary size budget (~5.7 MB current) and update cadence.
2. **Project root for memdir** — upstream uses `findCanonicalGitRoot()` so worktrees share memory. Our `~/.claude/projects/` already has 12+ sibling keys for the same repo (apps subdirs treated as separate projects). Are those auto-memory files mergeable into the canonical project key, or is the per-app split intentional? If we adopt this pattern in CLI/Desktop, we should standardize on git-root canonicalization at clone time to prevent fragmented memory.
3. **Migration `CURRENT_MIGRATION_VERSION` strategy** — upstream bumps an integer and re-runs all migrations. For our multi-surface platform (CLI, Desktop, Web, Mobile, two extensions), do all surfaces share one version flag stored where (Supabase user prefs? per-surface local config?), or each surface gets its own with cross-surface coordination via Supabase realtime? Current `apps/web/supabase/migrations/` (legacy) vs canonical `supabase/migrations/` divergence (per MEMORY.md "two supabase migration directories" pitfall) shows we already have the multi-surface split problem; an integer-version-flag system on top would be a third migration system to coordinate. Could we instead use a per-migration completion flag (no master version) so each surface re-runs only what it hasn't done?
