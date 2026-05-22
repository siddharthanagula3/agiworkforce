# U3b — `utils/` Direct Files U–Z (Deep Dive)

> Scope: `~/Desktop/reference/src/utils/{u..z}*.ts(x)` — 18 files, ~92 KB.
> Sibling agent U3a covers a..t.
> Source: `~/Desktop/reference/src/utils/` (Claude Code reference snapshot, 2026-03-31).
> Output written incrementally — file-by-file, then synthesis.

---

## Inventory (sorted, with sizes)

| #   | File                     | Bytes      | Bucket                |
| --- | ------------------------ | ---------- | --------------------- |
| 1   | `unaryLogging.ts`        | 1,254      | small                 |
| 2   | `undercover.ts`          | 3,681      | small                 |
| 3   | `user.ts`                | 5,714      | small                 |
| 4   | `userAgent.ts`           | 281        | tiny                  |
| 5   | `userPromptKeywords.ts`  | 929        | tiny                  |
| 6   | `uuid.ts`                | 888        | tiny                  |
| 7   | `warningHandler.ts`      | 4,486      | small                 |
| 8   | `which.ts`               | 2,392      | small                 |
| 9   | `windowsPaths.ts`        | 6,008      | small                 |
| 10  | `withResolvers.ts`       | 444        | tiny                  |
| 11  | `words.ts`               | 10,960     | mid                   |
| 12  | `workloadContext.ts`     | 2,337      | small                 |
| 13  | `worktree.ts`            | **49,995** | **HIGH-LOC** (~50 KB) |
| 14  | `worktreeModeEnabled.ts` | 415        | tiny                  |
| 15  | `xdg.ts`                 | 1,876      | small                 |
| 16  | `xml.ts`                 | 622        | tiny                  |
| 17  | `yaml.ts`                | 525        | tiny                  |
| 18  | `zodToJsonSchema.ts`     | 761        | tiny                  |

Only one file (`worktree.ts`, 1,519 LOC) crosses the >500-LOC threshold and warrants structural breakdown.

---

## File 1 — `unaryLogging.ts` (39 LOC)

Telemetry shim for "unary" UI events (single-shot accept/reject of a tool suggestion: `str_replace_single`, `str_replace_multi`, `write_file_single`, `tool_use_single`). Exports `CompletionType` union and `logUnaryEvent(event)`. Event name `tengu_unary_event`. Every metadata field is cast through the brand alias `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS` — a deliberate self-review prompt at the call-site. Reusable as `AnalyticsField_NoPII` pattern.

---

## File 2 — `undercover.ts` (90 LOC)

Cover-identity safety mode for Anthropic engineers (`USER_TYPE === 'ant'`) committing to public repos. Guards against codename / model-version / co-author leakage. `CLAUDE_CODE_UNDERCOVER=1` forces ON; auto-mode is ON unless `getRepoClassCached() === 'internal'`. **No force-OFF** — fail-closed. Build-time gated on `--define USER_TYPE`; bundler eliminates the entire body for external users. Exports: `isUndercover()`, `getUndercoverInstructions()` (system-prompt fragment with forbidden-examples list), `shouldShowUndercoverAutoNotice()`. The instruction string mentions internal codenames ("Capybara", "Tengu", "claude-opus-4-6") only as forbidden examples inside a guardrail prompt — not authoritative model IDs, do not flag for the models.json rule. Lesson: gate codename-leakage paths behind a build-time env, not a runtime config flag.

---

## File 3 — `user.ts` (195 LOC)

Resolves the canonical `CoreUserData` shape (`{deviceId, sessionId, email, appVersion, platform, organizationUuid, accountUuid, userType, subscriptionType, rateLimitTier, firstTokenTime, githubActionsMetadata}`) consumed by every analytics provider and GrowthBook targeting. Exports: `CoreUserData`, `GitHubActionsMetadata`, `initUser`, `resetUserCache`, `getCoreUserData` (memoized), `getUserForGrowthBook`, `getGitEmail` (memoized async).

Email resolution order: `cachedEmail` → `getOauthAccountInfo().emailAddress` → ant-only fallbacks (`process.env.COO_CREATOR` + `@anthropic.com`, then `git config --get user.email`). When `GITHUB_ACTIONS` is truthy, ships a 6-field `githubActionsMetadata` block. Cross-cutting: `auth.{getOauthAccountInfo,getRateLimitTier,getSubscriptionType}`, `config.{getGlobalConfig,getOrCreateUserID}`, `env.getHostPlatformForAnalytics`, `bootstrap/state.getSessionId`.

**Provider-coupling:** `organizationUuid` / `accountUuid` are Anthropic-OAuth-shaped — needs to be made provider-agnostic for AGI's multi-provider fork.

---

## File 4 — `userAgent.ts` (10 LOC)

Returns `claude-code/${MACRO.VERSION}`. Kept dependency-free so SDK-bundled code (bridge, CLI transports) can import without pulling `auth.ts`'s transitive tree. AGI: `getAGIWorkforceUserAgent()` from a single MACRO source.

---

## File 5 — `userPromptKeywords.ts` (28 LOC)

Regex classifiers on raw user prompts. `matchesNegativeKeyword(input)` flags rage prompts (`wtf`, `wth`, `ffs`, `fucking broken`, `screw this`, etc.). `matchesKeepGoingKeyword(input)` exact-matches `continue` or substring-matches `keep going` / `go on`. Allocation-free, no deps, no model round-trip — drop-in for chat-composer rage-detection and auto-continue UX.

---

## File 6 — `uuid.ts` (28 LOC)

UUID validation (`^[0-9a-f]{8}-...$` regex) returning a branded `UUID | null`; `createAgentId(label?)` mints `a${label?-}${randomBytes(8).toString('hex')}`. `AgentId` is a brand type from `src/types/ids.ts`. Branded ID types kill cross-ID-type bugs (sessionId vs agentId vs taskId).

---

## File 7 — `warningHandler.ts` (122 LOC)

Process-level Node warning handler. Suppresses stderr warnings for non-development users; deduplicates via `Map<key,count>` capped at `MAX_WARNING_KEYS = 1000`; logs to Statsig as `tengu_node_warning` with `is_internal`, `occurrence_count`, `classname`. Ant users get full message; external users get only classname. `CLAUDE_DEBUG` prints everything. `INTERNAL_WARNINGS` regex list (e.g., `MaxListenersExceededWarning.*AbortSignal`) is suppressed silently. `isRunningFromBuildDirectory()` mirrors `getCurrentInstallationType()` synchronously by checking `argv[1]` / `execPath` against `[/build-ant/, /build-external/, /build-external-native/, /build-ant-native/]` (Windows-aware path-flip). Idempotent install: checks `process.listeners('warning')` to avoid double-install. Same brand-cast pattern as `unaryLogging.ts`.

---

## File 8 — `which.ts` (83 LOC)

Cross-platform `which` / `where.exe` wrapper, sync + async. `Bun.which` fast-path when available; otherwise spawns via `execa` / `execSync_DEPRECATED`. `where.exe` multi-result → first line.

---

## File 9 — `windowsPaths.ts` (174 LOC)

Windows path helpers. `setShellIfWindows()`, `findGitBashPath` (memoized), `windowsPathToPosixPath` / `posixPathToWindowsPath` (LRU 500). **Security note:** `findExecutable` (lines 56-69) filters out `where.exe` results that resolve into the current working directory — defends against hostile `git.bat`/`.cmd`/`.exe` in a clone. Hardcoded preferred locations: `C:\Program Files\Git\cmd\git.exe`, `C:\Program Files (x86)\Git\cmd\git.exe`. Comment explicitly avoids `mingw64\bin\git.exe` (no env setup). `process.exit(1)` if git-bash absent (only file in scope that exits). Conversions handle UNC, drive letters, `/cygdrive/c/`, MSYS2 `/c/`. Override via `CLAUDE_CODE_GIT_BASH_PATH`.

---

## File 10 — `withResolvers.ts` (14 LOC)

Polyfill for `Promise.withResolvers()` (ES2024 / Node 22+). Package declares `engines.node >= 18`. AGI's `.nvmrc` pins Node 22, so the native is fine — keep this template only for sub-packages that need lower floor.

---

## File 11 — `words.ts` (801 LOC, data-heavy)

Random-word slug generator (`generateWordSlug` for `adj-verb-noun`, `generateShortWordSlug` for `adj-noun`). ~228 ADJECTIVES, ~109 VERBS, ~340 NOUNS (incl. computer-scientists hall of fame: babbage, dijkstra, hopper, knuth, lovelace, ritchie, turing). Crypto-quality random via `crypto.randomBytes(4).readUInt32BE(0) % max`. Combinatorial space ~8.4M for 3-word slugs — caller must dedupe. Note: noun `'sonnet'` (line 504) is the false-positive for the model-IDs grep.

---

## File 12 — `workloadContext.ts` (58 LOC)

Turn-scoped workload tag (currently only `'cron'`) via `AsyncLocalStorage`. Exports: `Workload`, `WORKLOAD_CRON`, `getWorkload`, `runWithWorkload`. Why ALS not global: detached agents (`executeForkedSlashCommand`, `AgentTool`) yield at their first await; parent's `finally` clobbers a global tag. Why a separate module from `bootstrap/state.ts`: bootstrap is imported by `browser-sdk` entrypoint, which can't load `async_hooks`. Server-side `_sanitize_entrypoint` accepts only `[a-z0-9_-]{0,32}` — uppercase truncates at char 0. **Subtle fix:** `runWithWorkload(undefined, fn)` always calls `.run()`, not pass-through, to prevent sticky leakage when REPL re-renders capture ALS at scheduling time. Perfect fit for AGI's workforce-style multi-source agents.

---

## File 13 — `worktree.ts` (1,519 LOC) — HIGH-LOC file

The largest util in scope. Implements **EnterWorktree / ExitWorktree** — running a Claude session inside an isolated `git worktree` at `<repoRoot>/.claude/worktrees/<slug>` so the model can touch files without contaminating the user's branch. Lifecycle: create / resume / keep / cleanup, with optional tmux multiplexing, sparse-checkout, hook-based VCS substitution, gitignored-file propagation. Includes "agent worktree" variants for sub-agents (AgentTool, WorkflowTool, bridgeMain) that don't touch global session state.

### Top-level structure

| Section                        | Lines     | Public API                                                                                                                                        |
| ------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slug validation + dir helpers  | 48–227    | `validateWorktreeSlug`, `worktreeBranchName`, `WorktreeSession`, `getCurrentWorktreeSession`, `restoreWorktreeSession`, `generateTmuxSessionName` |
| Core git plumbing              | 235–375   | `getOrCreateWorktree` (private)                                                                                                                   |
| `.worktreeinclude` propagation | 391–504   | `copyWorktreeIncludeFiles`                                                                                                                        |
| Post-creation setup            | 510–624   | `performPostCreationSetup` (private)                                                                                                              |
| PR-ref + tmux helpers          | 633–700   | `parsePRReference`, `isTmuxAvailable`, `getTmuxInstallInstructions`, `createTmuxSessionForWorktree`, `killTmuxSession`                            |
| Session lifecycle              | 702–894   | `createWorktreeForSession`, `keepWorktree`, `cleanupWorktree`                                                                                     |
| Agent worktrees                | 902–1020  | `createAgentWorktree`, `removeAgentWorktree`                                                                                                      |
| Stale cleanup                  | 1030–1136 | `cleanupStaleAgentWorktrees`, `EPHEMERAL_WORKTREE_PATTERNS`                                                                                       |
| Change detection               | 1144–1173 | `hasWorktreeChanges`                                                                                                                              |
| Fast-path tmux exec            | 1180–1519 | `execIntoTmuxWorktree`                                                                                                                            |

### Key flows

**Create-or-resume.** `getOrCreateWorktree` fast-paths via `readWorktreeHeadSha(worktreePath)` (direct fs read of `.git` pointer file — saves ~15ms vs subprocess). On miss: parallel `getDefaultBranch` + `resolveGitDir`, then `resolveRef refs/remotes/origin/<defaultBranch>` (skips `git fetch` — saves 6–8s on 210k-file repos). Falls back to `git fetch origin <defaultBranch>` only when the ref isn't local. `git worktree add -B <branch>` (-B not -b: resets orphan branches from removed worktrees, saving a `git branch -D` spawn).

**Sparse-checkout.** When `settings.worktree.sparsePaths` is non-empty, adds `--no-checkout`, then `git sparse-checkout set --cone`, then `git checkout HEAD`. Tear-down on partial failure is critical — registered-but-empty worktree would be falsely "resumed" next run, so code explicitly `worktree remove --force` before throwing.

**Slug safety.** `validateWorktreeSlug` rejects `>64` chars, `.` / `..` segments, and any segment failing `^[a-zA-Z0-9._-]+$`. Allows `/` for nesting; each segment validated independently. Branch name AND dir path use `flattenSlug = replaceAll('/', '+')` to avoid git ref D/F conflicts and dir nesting that would let `worktree remove` delete uncommitted children. `+` is valid in git refs but excluded from the slug allowlist → mapping is injective.

**Hook-based VCS substitution.** `WorktreeCreate` / `WorktreeRemove` hooks override the git path entirely — Mercurial / Pijul / Sapling users get the same flow. Hook runs **after** `validateWorktreeSlug` so it can't be exploited via path-traversal slug.

**Post-creation setup** copies `settings.local.json` (may contain secrets — intentional propagation), configures `core.hooksPath` to point at the **main repo's** `.husky` or `.git/hooks` (idempotent via `parseGitConfigValue` check), symlinks `settings.worktree.symlinkDirectories` (commonly `node_modules` — avoids ~30s pnpm install per worktree), copies `.worktreeinclude`-listed gitignored files (`.env.local`, etc.), and best-effort installs the `prepare-commit-msg` attribution hook directly in the worktree's `.husky/` (gated on `feature('COMMIT_ATTRIBUTION')`) to defend against husky's `prepare` script resetting `core.hooksPath` on every `bun install`.

**`.worktreeinclude` perf trick** (lines 410-479): `git ls-files --others --ignored --exclude-standard --directory` collapses fully-gitignored dirs (`node_modules/`) into single entries — cuts 500k/7s down to hundreds/100ms. Edge case: explicit pattern inside a collapsed dir → scoped second `ls-files` for just that dir.

**Session vs Agent worktrees.** `createWorktreeForSession` mutates `currentWorktreeSession` + persists to project config. `createAgentWorktree` does NOT — used by AgentTool / WorkflowTool / bridgeMain for ephemeral sub-agents. Uses `findCanonicalGitRoot` (not `findGitRoot`) so agent worktrees always land in the main repo, never nesting. On resume, bumps mtime via `utimes` so the 30-day stale sweep doesn't GC actively-resumed agents.

**Stale sweep** (`cleanupStaleAgentWorktrees`). Scans for slugs matching `EPHEMERAL_WORKTREE_PATTERNS`: `agent-a<7hex>`, `wf_<8hex>-<3hex>-<idx>`, legacy `wf-<idx>`, `bridge-<id>`, `job-<name>-<8hex>`. Skips current session. Fail-closed: non-zero git exit, tracked changes (`status --porcelain -uno`), or unpushed commits (`rev-list HEAD --not --remotes`) → skip. Single `worktree prune` after batch.

**Fast-path `execIntoTmuxWorktree`** (lines 1180-1519). Called early in `cli.tsx` before full CLI load. Parses `--worktree`, `--tmux`, `--tmux=classic`; supports PR refs (`#123` or GitHub URLs → `pr-N`). Uses `tmux -CC` (control mode) when in iTerm2 unless `--tmux=classic` or already-in-tmux. Detects prefix conflicts with Claude bindings (`C-b, C-c, C-d, C-t, C-o, C-r, C-s, C-g, C-e`) and surfaces via `CLAUDE_CODE_TMUX_PREFIX_CONFLICTS=1` env. Ant + `claude-cli-internal` repo gets a 3-pane dev layout. Already-in-tmux uses `switch-client` instead of nesting.

### Cross-cutting touches

`git.ts`, `git/gitFilesystem.ts`, `git/gitConfigParser.ts`; `hooks.ts`; `settings/settings.ts`; `execFileNoThrow*`; `containsPathTraversal`; `isInITerm2`; build-time `feature('COMMIT_ATTRIBUTION')` from `bun:bundle`.

### Hardcoded constants worth surfacing

- `MAX_WORKTREE_SLUG_LENGTH = 64`, `VALID_WORKTREE_SLUG_SEGMENT = /^[a-zA-Z0-9._-]+$/`.
- `GIT_NO_PROMPT_ENV = { GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '' }` — secret-sauce for "git never blocks CLI on credential prompts."
- Claude tmux-conflict bindings: `C-b, C-c, C-d, C-t, C-o, C-r, C-s, C-g, C-e`.
- Internal repo name `'claude-cli-internal'` (line 1397) gates ant-only dev-panes.

### Hardcoded model IDs / provider-coupling

**None on either axis.** Worktree machinery is invariant across providers; AGI Workforce can port verbatim.

---

## File 14 — `worktreeModeEnabled.ts` (12 LOC)

Was a GrowthBook flag-check (`tengu_worktree_mode`); now hard-coded `true`. The `CACHED_MAY_BE_STALE` pattern returned `false` on first-launch before cache-fill, silently swallowing `--worktree` (claude-code#27044). Lesson: remote-config flags need safe-on-fail posture for user-typed flags.

---

## File 15 — `xdg.ts` (66 LOC)

XDG Base Directory spec resolver. `getXDGStateHome` (`~/.local/state`), `getXDGCacheHome` (`~/.cache`), `getXDGDataHome` (`~/.local/share`), `getUserBinDir` (`~/.local/bin`, not strictly XDG). Each accepts `{env?, homedir?}` for testability via shared `resolveOptions`. Drop-in for AGI's CLI install layout.

---

## File 16 — `xml.ts` (16 LOC)

`escapeXml(s)` (text-content: `& < >`) and `escapeXmlAttr(s)` (adds `" '`). Used widely in system-prompt construction. Pure, no deps — port verbatim.

---

## File 17 — `yaml.ts` (15 LOC)

`parseYaml(input)` with Bun fast-path: `typeof Bun !== 'undefined'` → `Bun.YAML.parse`; else lazy-`require('yaml')`. Avoids loading the ~270 KB yaml parser into native Bun builds.

---

## File 18 — `zodToJsonSchema.ts` (23 LOC)

Wraps Zod v4 `toJSONSchema` with WeakMap caching by schema identity. Comment notes `toolToAPISchema()` runs this 60–250×/turn; `lazySchema()` guarantees same `ZodTypeAny` reference per session, so identity-cache hits. AGI's tool registry should adopt the same — WeakMap auto-GCs, no manual invalidation.

---

## Synthesis

### Cross-cutting patterns (worth porting)

1. **Branded analytics-cast `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS`** (unaryLogging, warningHandler). Verbose alias forces the author to re-affirm at every call-site that no PII is shipped. Self-review-as-types. AGI equivalent: `AnalyticsField_NoPII`.
2. **Build-time `USER_TYPE === 'ant'` define-folding** (undercover, user, warningHandler). `--define` constants dead-code-eliminate ant-only branches from external builds — one source tree, two binaries with different behaviour. AGI: `USER_TYPE === 'internal'` for dogfood paths.
3. **Identity-keyed WeakMap caching** (zodToJsonSchema). Stable input ref + WeakMap → automatic GC, no LRU bookkeeping. Drop-in for any expensive pure transform on stable JS objects (tool-schema generation runs 60–250×/turn).
4. **ALS for turn-scoped context** (workloadContext). Always `.run()`, never pass-through, to prevent context leakage across detached promises. The leak-mode (REPL re-render captures ALS at scheduling time → tag becomes sticky forever) is non-obvious; document for AGI's React contexts.
5. **Slug-allowlist + injective flatten mapping** (worktree). `[a-zA-Z0-9._-]+` + `/` → `+` flatten — round-trips without git D/F conflicts. AGI's plan / session names should adopt.
6. **CWD-poisoning defense** (windowsPaths). Filter out `where.exe` results inside CWD — defends against hostile `git.bat`. Useful for any cross-platform CLI calling system tools.
7. **Memory-bounded dedup** (warningHandler). `Map<key,count>` capped at 1000; past cap, new keys stop tracking but existing ones still increment. Bounded memory + faithful counts for high-frequency offenders.
8. **Bun-or-fallback** (which, yaml). `typeof Bun !== 'undefined'` ? native fast-path : subprocess / lazy-require. Same shape works for any browser-vs-node split.

### Telemetry surface

- `tengu_unary_event` (unaryLogging — UI accept/reject/response).
- `tengu_node_warning` (warningHandler — unhandled Node warnings).
- All routed via `services/analytics/index.ts` `logEvent(name, metadata)`. Full message details gated behind `USER_TYPE === 'ant'`.

### Settings surface touched (worktree)

`settings.worktree.sparsePaths`, `settings.worktree.symlinkDirectories`, `.worktreeinclude` (gitignore-syntax), `.husky` / `.git/hooks`, `settings.local.json` (propagated to worktrees).

### Error / safety types worth porting

- `WorktreeCreateResult` discriminated union — `baseBranch` only on `existed: false`, encoding "we did or didn't fetch" in the type.
- `WorktreeSession` durable record persisted via `saveCurrentProjectConfig`.
- `Workload` — single-member union (`'cron'`) ready to extend.

### Hardcoded model IDs

**Zero across all 18 files.** Grep hits in `words.ts` (`'sonnet'`, `'octopus'`) are slug-noun entries. `undercover.ts` lists model IDs only inside a forbidden-examples block in a safety prompt — correct shape.

### Provider coupling

- `user.ts` uses Anthropic-shaped `organizationUuid` / `accountUuid` — make provider-agnostic for AGI's multi-provider fork.
- All other 17 files are provider-agnostic.

### Failure recovery

No file required >5 paginated reads. `worktree.ts` (1,519 LOC) read in 4 chunks. No PARTIAL flags.
