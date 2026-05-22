# T2 — BashTool & PowerShellTool Deep Dive

> **Scope:** every file under `~/Desktop/reference/src/tools/BashTool/` (18 files, ~5,200 LOC) and `~/Desktop/reference/src/tools/PowerShellTool/` (14 files, ~6,700 LOC). The shell-execution surface is the dominant security perimeter for an agentic CLI: an unguarded `Bash(*)` is identity-equivalent to local-shell access. This file enumerates the entry contracts, the permission state machine, and the ~22+ known parser-differential / RCE-class patches that have hardened these tools.

---

## 1. BashTool entry contract — `BashTool.tsx`

**File:** `~/Desktop/reference/src/tools/BashTool/BashTool.tsx` (1143 lines).

The tool is constructed via `buildTool({...})` at line 420 with `name = BASH_TOOL_NAME` ("Bash"), `searchHint = 'execute shell commands'`, `maxResultSizeChars = 30_000`, `strict = true`.

**Input schema** (`fullInputSchema`, line 227-247):

```
command:                   z.string                     "The command to execute"
timeout:                   semanticNumber(z.number)    "Optional timeout in milliseconds (max ${getMaxTimeoutMs()})"
description:               z.string optional            multi-paragraph guidance — "active voice", "no 'complex'/'risk'", concrete examples
run_in_background:         semanticBoolean optional     "Set to true to run this command in the background. Use Read to read the output later."
dangerouslyDisableSandbox: semanticBoolean optional     "dangerously override sandbox mode"
_simulatedSedEdit:         { filePath, newContent }     INTERNAL — set after sed-edit preview is approved; OMITTED from model-facing schema (line 254-259)
```

The omission of `_simulatedSedEdit` is load-bearing: line 250-252 explicitly notes that exposing it would "let the model bypass permission checks and the sandbox by pairing an innocuous command with an arbitrary file write." `inputSchema` (line 254) also conditionally drops `run_in_background` when `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` is truthy at module-load time.

**Output schema** (line 279-294): `stdout`, `stderr`, `interrupted`, optional `isImage`, `backgroundTaskId`, `backgroundedByUser`, `assistantAutoBackgrounded`, `dangerouslyDisableSandbox`, `returnCodeInterpretation`, `noOutputExpected`, `structuredContent`, `persistedOutputPath`, `persistedOutputSize`, `rawOutputPath`.

**Tool handler hooks** (line 420-825):

- `description` returns `input.description || 'Run shell command'`.
- `prompt` → `getSimplePrompt()` (`prompt.ts:275`).
- `isReadOnly(input)` → `checkReadOnlyConstraints(input, commandHasAnyCd(command)).behavior === 'allow'` (line 437-441).
- `toAutoClassifierInput(input)` returns `input.command` — this is the string fed to the auto-mode transcript classifier (`§F.2` of orientation).
- `preparePermissionMatcher` (line 445-468) parses with tree-sitter (`parseForSecurity`), then for each subcommand strips leading `VAR=val` and matches against the rule pattern. Compound commands fire pre-tool hooks if **any** subcommand matches the pattern, so `ls && git push` cannot bypass `Bash(git *)` security hooks.
- `validateInput` (line 524-538) blocks bare `sleep N` (N≥2) at the front of a command — directing the model to `run_in_background: true` or the `Monitor` tool. ErrorCode 10.
- `checkPermissions` → `bashToolHasPermission(input, context)` (`bashPermissions.ts:1663`).
- `call` (line 624-820) drives an async generator (`runShellCommand`) that yields progress events every ~1s and races the result promise against a progress signal.

**Background process management** (`BashTool.tsx:826-1142`):

- `spawnBackgroundTask` calls `spawnShellTask` from `tasks/LocalShellTask/LocalShellTask.js`. Returns a task ID.
- `startBackgrounding(eventName, fn)` (line 924-963) handles three cases: existing foreground task → `backgroundExistingForegroundTask`; otherwise spawn fresh, then wake the progress signal so the generator returns immediately.
- `auto-backgrounding` triggers on three events:
  1. **Timeout**: `shellCommand.onTimeout` fires → `tengu_bash_command_timeout_backgrounded`.
  2. **Assistant blocking budget**: in KAIROS / assistant mode, after `ASSISTANT_BLOCKING_BUDGET_MS = 15_000`, the main agent's blocking command flips to background → `tengu_bash_command_assistant_auto_backgrounded`.
  3. **Explicit `run_in_background: true`** → spawns immediately, returns code:0 with backgroundTaskId, no foreground race.
- `DISALLOWED_AUTO_BACKGROUND_COMMANDS = ['sleep']` (line 220) — never auto-background sleep; forces the model's hand.
- The result tuple (line 555-622, `mapToolResultToToolResultBlockParam`) emits a `<persisted-output>` block when output > 30KB inline (the model gets a preview + filepath; UI shows full stdout). For >64MB the file is `truncate`d after copy.

---

## 2. `bashPermissions.ts` — 2621-LOC permission state machine

The main entry is `bashToolHasPermission` at line 1663-2557. The flow (annotated with file:line landmarks):

**Step 0 — AST parse** (line 1670-1806): `parseCommandRaw` → tree-sitter bash. Three outcomes:

- `kind === 'too-complex'` → command-substitution / parser differential / unanalyzable. Line 1741: short-circuit to `checkEarlyExitDeny` (exact + prefix deny rules), else **ask** with `pendingClassifierCheck`.
- `kind === 'simple'` → call `checkSemantics(commands)` (semantic walk for zsh builtins, `eval`, etc.). Line 1771-1806: store `astSubcommands`, `astRedirects`, `astCommands`. If semantics fail → `checkSemanticsDeny` then ask.
- `kind === 'parse-unavailable'` → fallback to `tryParseShellCommand` (shell-quote). The `MAX_SUBCOMMANDS_FOR_SECURITY_CHECK = 50` cap (line 103) prevents ReDoS-style fanout.

**Step 1 — sandbox auto-allow** (line 1829-1843): if sandboxing AND auto-allow-bash-if-sandboxed AND `shouldUseSandbox(input)` → `checkSandboxAutoAllow` (line 1270). This does deny-then-ask checks per subcommand and otherwise auto-allows with sandbox.

**Step 2 — exact-match permission** (line 1846-1854): `bashToolCheckExactMatchPermission` consults `getRuleByContentsForTool` for exact deny/ask/allow. Deny short-circuits.

**Step 3 — Bash prompt classifiers** (line 1859-1971): in parallel, run `classifyBashCommand` against deny + ask description sets (Haiku-classified). High-confidence deny short-circuits; high-confidence ask returns ask + `pendingClassifierCheck`. **Skipped in auto mode** (line 1862-1864) — the auto-mode transcript classifier owns these decisions instead.

**Step 4 — Operator (`|`, `>`, `<`) checks** (line 1976-2076): `checkCommandOperatorPermissions` → `bashCommandHelpers.ts:181`. Splits pipelines; checks each segment via recursion; for unsafe compound (`(...)`/`{...}`) returns ask + custom message. After the operator path returns "allow", **also** runs `bashCommandIsSafeAsync` and `checkPathConstraints` on the original input — closing the GH#28784-class hole where stripped `>` redirections were never validated.

**Step 5 — legacy misparsing gate** (line 2078-2142): only on `astSubcommands === null`. Calls `bashCommandIsSafeAsync` with `isBashSecurityCheckForMisparsing: true`. Heredoc-substitution allowance (`stripSafeHeredocSubstitutions`).

**Step 6 — splitCommand + filtering** (line 2144-2225):

- Cap at `MAX_SUBCOMMANDS_FOR_SECURITY_CHECK = 50`.
- If multiple `cd` subcommands → ask.
- **Compound `cd` + `git` → ask** (line 2209-2225). Comment: "prevent bare repository attacks." Bare-repo TOCTOU is pervasive; see also `readOnlyValidation.ts:1917-1923`, `gitSafety.ts` (PowerShell equivalent).
- Run `bashToolCheckPermission` per subcommand (line 2239) which itself calls `checkPathConstraints` per sub.
- `checkPathConstraints` runs once on the **original** command for redirection target validation (line 2276-2285) — load-bearing because `splitCommand` strips `> /etc/passwd`.
- A **single** `ask` subresult short-circuits (line 2310-2330). Multiple non-allow subcommands fall through to merge flow (line 2473-2556) which collects up to `MAX_SUGGESTED_RULES_FOR_COMPOUND = 5` (line 110) rule suggestions per subcommand.

**Permission rule semantics:**

- Three rule types — exact (`Bash(git status)`), prefix (`Bash(git:*)`), wildcard (`Bash(*echo*)`) — parsed by `bashPermissionRule` / `parsePermissionRule` (line 364).
- **Prefix matching is compound-blocked** (line 891-893): `Bash(cd:*)` does NOT match `cd /path && python3 evil.py`. SECURITY: defense against shell-escape compound bypasses like `cd src\&\& python3 hello.py`. Deny/ask rules SKIP this guard (line 859-861, `skipCompoundCheck: true`) so denied commands can never be wrapped out of a deny rule.
- Wildcard rules in **exact mode** are forbidden (line 920-921); they only apply after splitting.
- `xargs <prefix>` matching: `Bash(grep:*)` matches `xargs grep pattern` (line 902-911) — flag-bearing xargs (`xargs -n1 grep`) doesn't.
- **Allow-rule env stripping** uses `SAFE_ENV_VARS` (line 378-430) only — `PATH`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_*`, `PYTHONPATH`, `NODE_PATH`, `RUBYLIB`, `GOFLAGS`, `RUSTFLAGS`, `NODE_OPTIONS`, `HOME`, `TMPDIR`, `SHELL`, `BASH_ENV` are **explicitly not safe**. Comment at line 372: "These must NEVER be added to the whitelist." `ANT_ONLY_SAFE_ENV_VARS` (line 447-497) extends the list for internal users (`KUBECONFIG`, `DOCKER_HOST`, `AWS_PROFILE`, etc.) — user-type-gated and acknowledged-risk-only.
- **Deny/ask rule env stripping** uses `stripAllLeadingEnvVars` (line 733-776) — strips ALL env-var prefixes (any name) with a `BINARY_HIJACK_VARS` (`/^(LD_|DYLD_|PATH$)/`) blocklist. Reason (line 715-731): a denied command should stay denied even if prefixed with `FOO=bar`. Line 826-852 iteratively applies wrapper + env-var stripping until a fixed point — handles interleaved `nohup FOO=bar timeout 5 claude`.

**Wrapper stripping** (`stripSafeWrappers`, line 524-615): iterative, two-phase. Phase 1 strips env vars + comments. Phase 2 strips `timeout`, `time`, `nice`, `nohup`, `stdbuf`. Comment at line 525-528: "MUST be `[ \\t]+` not `\\s+`" because `\\s` matches newlines = command separators. The argv counterpart `stripWrappersFromArgv` (line 678-701) consumes optional `--` after wrapper options (load-bearing — without it, `nohup -- rm -- -/../foo` yields `--` as `baseCmd` and skips path validation).

`BARE_SHELL_PREFIXES` (line 196-226) — the set of prefixes the system never auto-suggests as `Bash(*:*)` rules: `sh`, `bash`, `zsh`, `fish`, `csh`, `tcsh`, `ksh`, `dash`, `cmd`, `powershell`, `pwsh`, `env`, `xargs`, `nice`, `stdbuf`, `nohup`, `timeout`, `time`, `sudo`, `doas`, `pkexec`. Suggesting any of these would equal `Bash(*)`.

---

## 3. `bashSecurity.ts` — 2592-LOC validator chain

The deprecated-but-load-bearing `bashCommandIsSafe_DEPRECATED` (line 2257-2413) and `bashCommandIsSafeAsync_DEPRECATED` (line 2426-2592) run a 22-validator chain in order. Each validator returns `{ behavior: 'passthrough' | 'ask' | 'allow', message? }`. **`ask` from a `nonMisparsingValidators` validator is DEFERRED** (line 2392-2404, 2571-2585): the loop keeps running so a later misparsing validator can produce a stronger `isBashSecurityCheckForMisparsing: true` signal.

**Pre-flight blockers** (line 2261-2293):

- `CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/` (line 2251) — null bytes silently dropped by bash but confuse our validators.
- `hasShellQuoteSingleQuoteBug` (line 2277) — `'\'` patterns desync shell-quote.
- `extractHeredocs(..., { quotedOnly: true })` (line 2293) — strip literal heredoc bodies (only quoted/escaped delimiters).

**Early validators** (line 2308-2332): `validateEmpty`, `validateIncompleteCommands`, `validateSafeCommandSubstitution` (allows `$(cat <<'EOF'\n...\nEOF\n)` as arg), `validateGitCommit` (allows `git commit -m "msg"` w/ strict checks).

**Main 18-validator pipeline** (line 2348-2378):

| #   | Validator                            | Concern                                                                                                       | CHECK_ID                                                                   |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --- |
| 1   | `validateJqCommand`                  | `jq` `system()`, `-f`/`--rawfile`/`--slurpfile`/`-L`                                                          | 2,3                                                                        |
| 2   | `validateObfuscatedFlags`            | `$'...'` ANSI-C, `$"..."` locale, empty quotes + dash, `"-"exec` continuation, multi-quote chains             | 4,5,6,7,9,10,11                                                            |
| 3   | `validateShellMetacharacters`        | `;\|&` inside `"..."`/`'...'` glob args                                                                       | 5                                                                          |
| 4   | `validateDangerousVariables`         | `$VAR` in redirect/pipe context                                                                               | 6                                                                          |
| 5   | `validateCommentQuoteDesync`         | `# ' "` desync trap that fools quote tracker (BashTool only)                                                  | 22                                                                         |
| 6   | `validateQuotedNewline`              | newline inside quotes followed by `#`-prefixed line — defeats `stripCommentLines`                             | 23                                                                         |
| 7   | `validateCarriageReturn`             | `\r` outside DQ — shell-quote tokenizes, bash treats as literal                                               | 7                                                                          |
| 8   | `validateNewlines`                   | LF in unquoted content followed by non-WS                                                                     | 7 (sub 1)                                                                  |
| 9   | `validateIFSInjection`               | `$IFS` / `${...IFS...}`                                                                                       | 11                                                                         |
| 10  | `validateProcEnvironAccess`          | `/proc/*/environ`                                                                                             | 13                                                                         |
| 11  | `validateDangerousPatterns`          | unescaped backticks, `$()`, `${}`, `$[]`, zsh `=cmd`, `<(`, `>(`, `=(`, `~[`, `(e:`, `(+`, `} always {`, `<#` | 8                                                                          |
| 12  | `validateRedirections`               | any unquoted `<` or `>`                                                                                       | 9, 10                                                                      |
| 13  | `validateBackslashEscapedWhitespace` | `cmd\ test/.../touch` parser diff                                                                             | 15                                                                         |
| 14  | `validateBackslashEscapedOperators`  | `\;`, `\\                                                                                                     | `, `\\&`, `\<`, `\>`— splitCommand normalizes`\;`→`;`, double-parse hazard | 21  |
| 15  | `validateUnicodeWhitespace`          | ` `, ` - `, ` `, ` `, ` `, ` `, `　`, `﻿`                                                                     | 18                                                                         |
| 16  | `validateMidWordHash`                | `\S#` — shell-quote treats as comment, bash treats as literal                                                 | 19                                                                         |
| 17  | `validateBraceExpansion`             | mismatched `{` count, `'{'` in unquoted brace, `{a,b}`, `{1..5}`                                              | 16                                                                         |
| 18  | `validateZshDangerousCommands`       | `zmodload`, `emulate -c`, `sysopen`, `zpty`, `ztcp`, `zsocket`, `mapfile`, `zf_*`, `fc -e`                    | 20                                                                         |
| 19  | `validateMalformedTokenInjection`    | unbalanced delimiters + cmd-separator (HackerOne eval-bypass)                                                 | 14                                                                         |

`ZSH_DANGEROUS_COMMANDS` set (line 45-74) blocks 16 zsh module entries (`zmodload`, `emulate`, `sysopen/sysread/syswrite/sysseek`, `zpty`, `ztcp`, `zsocket`, `mapfile`, `zf_rm`, `zf_mv`, `zf_ln`, `zf_chmod`, `zf_chown`, `zf_mkdir`, `zf_rmdir`, `zf_chgrp`).

`isSafeHeredoc` (line 317-514) — line-based matcher (NOT regex `[\s\S]*?`) for `$(cat <<'DELIM'\n...\nDELIM\n)` pattern. Five hard rules: delimiter must be quoted or escaped; closing delimiter must be alone or `DELIM)`; closing must be the FIRST such line; substitution must be in argument position (not command-name); remaining text must contain only `[a-zA-Z0-9 \t"'.\-/_@=,:+~]` and pass all validators recursively.

`stripSafeHeredocSubstitutions` (line 521-578) — defensive: strips just safe heredocs, lets the remainder be re-checked.

**Tree-sitter shadow mode** (`bashPermissions.ts:1707-1739`): `TREE_SITTER_BASH_SHADOW` feature logs ts-vs-legacy verdict divergence (`tengu_tree_sitter_shadow`) but always forces `parse-unavailable` — observational only.

---

## 4. `readOnlyValidation.ts` — 1990-LOC plan-mode auto-allow

`checkReadOnlyConstraints(input, compoundCommandHasCd)` (line 1876-1990) is the entry. Its only `behavior: 'allow'` exit (line 1978) drives `BashTool.isReadOnly(input)` → `true`, gating Plan mode and read-only auto-allow paths.

**Hard rejections that route to `passthrough`** (force the main permission flow to take over):

- `tryParseShellCommand` failure (line 1884-1888).
- `bashCommandIsSafe_DEPRECATED` returns non-passthrough (line 1894-1899) — full security chain runs first.
- `containsVulnerableUncPath` (line 1903-1908) — Windows UNC paths route via `ask`.
- `compoundCommandHasCd && hasGitCommand` (line 1917-1923) — bare-repo defense.
- `hasGitCommand && isCurrentDirectoryBareGitRepo()` (line 1930-1935) — current dir looks like a bare repo.
- `hasGitCommand && commandWritesToGitInternalPaths(command)` (line 1943-1948) — compound writes HEAD/objects/refs/hooks/.
- `hasGitCommand && SandboxManager.isSandboxingEnabled() && getCwd() !== getOriginalCwd()` (line 1956-1965) — race-condition defense for backgrounded git after `cd`.

**Per-subcommand check** (line 1968-1976): `splitCommand_DEPRECATED(command).every(subcmd => bashCommandIsSafe(subcmd) === passthrough && isCommandReadOnly(subcmd))`.

`isCommandReadOnly` (line 1678-1752):

1. Strip trailing ` 2>&1`.
2. `containsVulnerableUncPath` → false.
3. `containsUnquotedExpansion` (line 1600-1669) — unquoted glob `[?*[\]]` or `$VAR` outside SQ → false. Comment at line 1572-1597: critical because `python *` could expand to `python --help` if a file named `--help` exists; `uniq --skip-chars=0$_` smuggles positional args via `$_`.
4. `isCommandSafeViaFlagParsing` (line 1246-1408) — strict allowlist parse using `COMMAND_ALLOWLIST` + `validateFlags`.
5. `READONLY_COMMAND_REGEXES` (line 1509-1570) regex fallback.
6. Per-subcommand git anti-injection: reject `-c[\s=]`, `--exec-path[\s=]`, `--config-env[\s=]` even if a regex matched.

**`COMMAND_ALLOWLIST`** (line 128-1232) — declarative per-cmd config:

- 25+ commands have explicit `safeFlags` Records: `xargs`, `git` (via `GIT_READ_ONLY_COMMANDS` import), `file`, `sed`, `sort`, `man`, `help`, `netstat`, `ps`, `base64`, `grep`, `fd`, `fdfind`, `ls`, `find`, `tree`, `head`, `tail`, `cat`, `cut`, `awk`, `stat`, `wc`, `nl`, `column`, `paste`, `tr`, `diff`, `cmp`, `comm`, `gh` (via `GH_READ_ONLY_COMMANDS`), `pyright` (via `PYRIGHT_READ_ONLY_COMMANDS`), `rg` (via `RIPGREP_READ_ONLY_COMMANDS`), `docker` (via `DOCKER_READ_ONLY_COMMANDS`).
- `xargs.safeFlags` (line 130-161) — uppercase `-I`, `-E EOF` (mandatory args), POSIX-only — explicit comment at 132-150 explaining why `-i`/`-e` (lowercase, GNU `i::`/`e::`) are removed: their optional-attached-arg semantics let an attacker bind a "target command" position to a sensitive binary like `/usr/sbin/sendmail`.
- `fd.safeFlags` excludes `-x`/`--exec`, `-X`/`--exec-batch`, `-l`/`--list-details` (latter exec's `ls` internally — PATH hijack risk).
- `sed.additionalCommandIsDangerousCallback` → `sedCommandIsAllowedByAllowlist` enforces only safe `s///` and `p`/`d` commands.
- `ps.additionalCommandIsDangerousCallback` blocks BSD `e` modifier (env-var leak).
- `base64.respectsDoubleDash: false` (line 432) — macOS base64 doesn't honor POSIX `--`.

**`isCommandSafeViaFlagParsing` `$`-rejection** (line 1351-1369): every token after the command tokens is rejected if it contains `$` or both `{` and `,`/`..`. Comment at 1328-1349 documents the three attack patterns this kills: prefix flag injection (`git diff "$Z--output=/tmp/pwned"`), `rg --pre=bash` RCE, infix bypass of additional-callback regex.

**`READONLY_COMMANDS`** (line 1432-1503) — converted via `makeRegexForSafeCommand(cmd)` = `/^${cmd}(?:\\s|$)[^<>()$\`|{}&;\\n\\r]\*$/`. The character class blocks shell metas, `$`, backtick, `{}`. Lists 60+ canonical-safe commands.

`READONLY_COMMAND_REGEXES` (line 1509-1570) hand-rolled patterns: `echo` (no `$`, no quotes-inside-DQ-with-newlines), `cd`, `ls`, `find` (negative lookaheads block `-delete`, `-exec`, `-execdir`, `-ok`, `-okdir`, `-fprint*`, `-fls`), `jq` (negative lookaheads block `-f`, `--from-file`, `--rawfile`, `--slurpfile`, `--run-tests`, `-L`, `--library-path`, `env` builtin, `$ENV`), `node -v`, `node --version`, `python --version`, `python3 --version`, `history N?`, `alias`, `arch`, `pwd`, `whoami`, `ip addr`, `ifconfig <iface>?`, `uniq` (flags-only, no input/output files).

---

## 5. `Bash(*)` blanket-rule drop on auto-mode entry

Per `anthropic-claude-suite-may-2026.md:738-743`: on entering auto mode, **blanket-shell rules `Bash(*)`, `python *`, `node *`, package-manager-run rules are dropped to force the classifier to see them.**

In `bashPermissions.ts`, the auto-mode skip is implemented via `feature('TRANSCRIPT_CLASSIFIER') && toolPermissionContext.mode === 'auto'` checks in three places:

- `buildPendingClassifierCheck` (line 1467-1468) — skip pendingClassifierCheck attachment in auto mode.
- Bash prompt deny/ask classifiers (line 1862-1864) — skip the per-prompt-rule Haiku call.
- `awaitClassifierAutoApproval` and `executeAsyncClassifierCheck` (line 1555-1657) — used by swarm/subagent paths that gate on the bash-allow classifier rather than the auto-mode classifier.

**Block list (Anthropic published, ~20+ rules):**

- Force-pushes (`git push --force`/`-f`/`--force-with-lease`)
- Mass cloud deletion (`kubectl delete`, `terraform destroy`)
- Credential exfiltration (`/proc/*/environ` reads, env-var leak via `ps e`)
- Production deploys (deny rules vary)
- Permission escalation (`sudo`, `doas`, `pkexec`)
- Dangerous removal (`rm -rf /`, `~`, `/etc`, `/usr` — `pathValidation.ts:70-110`)
- Bare-repo escape (`cd /malicious && git status`)
- Module loading (`Import-Module`, `Install-Module`, `Add-Type`)
- COM object instantiation (`New-Object -ComObject`)
- WMI process spawn (`Invoke-WmiMethod`, `Invoke-CimMethod`)
- Encoded commands (`pwsh -e ...`)
- Download cradles (`IWR ... | IEX`, `certutil -urlcache`, `bitsadmin /transfer`)
- `Invoke-Item` ShellExecute
- Scheduled-task persistence (`Register-ScheduledTask`, `schtasks /create`)
- Runtime-state hijack (`Set-Alias`, `Set-Variable PSDefaultParameterValues`)

(Documented across `bashSecurity.ts`, `powershellSecurity.ts`, `destructiveCommandWarning.ts`, `pathValidation.ts`.)

`destructiveCommandWarning.ts` (102 lines): purely informational warnings rendered in the permission dialog — does NOT affect approval. Patterns: `git reset --hard`, `git push --force`, `git clean -f` (no `-n`/`--dry-run`), `git checkout .`, `git restore .`, `git stash drop|clear`, `git branch -D`, `--no-verify`, `git commit --amend`, `rm -rf`, `rm -f`, `DROP TABLE/DATABASE/SCHEMA`, `TRUNCATE`, `DELETE FROM`, `kubectl delete`, `terraform destroy`.

---

## 6. `bwrapPath` / `socatPath` settings — Linux bubblewrap invocation

Per `anthropic-claude-suite-may-2026.md:320`: `settings.json` exposes `sandbox.bwrapPath` and `sandbox.socatPath`. The `prompt.ts:172-273` `getSimpleSandboxSection()` rendering shows what reaches the model:

```
## Command sandbox
By default, your command will be run in a sandbox. ...
The sandbox has the following restrictions:
Filesystem: { read: { denyOnly, allowWithinDeny }, write: { allowOnly, denyWithinAllow } }
Network: { allowedHosts, deniedHosts, allowUnixSockets }
Ignored violations: ...
```

`getSimpleSandboxSection` dedups paths and replaces the per-UID temp dir literal with `$TMPDIR` to keep the prompt cache stable across users (line 188-190). `SandboxManager` lives in `utils/sandbox/sandbox-adapter.js` and exposes `isSandboxingEnabled`, `isAutoAllowBashIfSandboxedEnabled`, `wrapWithSandbox`, `getFsReadConfig`, `getFsWriteConfig`, `getNetworkRestrictionConfig`, `areUnsandboxedCommandsAllowed`, `annotateStderrWithSandboxFailures`. The actual bubblewrap/seatbelt invocation is in that adapter (out of T2 scope — see T11/T12 for sandbox internals).

`shouldUseSandbox` (`shouldUseSandbox.ts:130-153`) decides if the current invocation should wrap:

1. `SandboxManager.isSandboxingEnabled()` → false → no.
2. `dangerouslyDisableSandbox && areUnsandboxedCommandsAllowed()` → bypass.
3. `containsExcludedCommand` (line 21-128) — checks **dynamic ant-only `tengu_sandbox_disabled_commands` GrowthBook config** (substrings + commands) AND user `sandbox.excludedCommands` from `settings.json`. Iteratively strips wrapper + env-var prefixes (with `BINARY_HIJACK_VARS` blocklist).

The exclusion is explicitly **NOT a security boundary** (line 18-20) — permission prompts are. It's a UX feature for "this binary doesn't work under sandbox, let it through."

---

## 7. Cross-ref — `utils/bash/` parser

The BashTool relies on three abstraction layers in `utils/bash/`:

- **`utils/bash/ast.ts`** — tree-sitter wrapper. Exports `parseForSecurity`, `parseForSecurityFromAst`, `checkSemantics`, `nodeTypeId`, `ParseForSecurityResult`, `Redirect`, `SimpleCommand`. The `'too-complex'` discriminant carries `nodeType` (logged via `tengu_bash_ast_too_complex`). `checkSemantics` walks the AST for zsh builtins, `eval`, `source`, `.` dot-source, etc.
- **`utils/bash/commands.ts`** — `splitCommand_DEPRECATED`, `splitCommandWithOperators`, `extractOutputRedirections`, `getCommandSubcommandPrefix`, `CommandPrefixResult`, `isUnsafeCompoundCommand_DEPRECATED`. The "DEPRECATED" suffix is intentional — these are shell-quote-based legacy functions retained for non-tree-sitter platforms.
- **`utils/bash/parser.ts`** — `parseCommandRaw`, `Node`, `PARSE_ABORTED`. Async because tree-sitter WASM module is loaded lazily.
- **`utils/bash/heredoc.ts`** — `extractHeredocs(cmd, { quotedOnly })`. Replaces literal heredoc bodies with placeholders so validators don't see the contents.
- **`utils/bash/shellQuote.ts`** — `tryParseShellCommand`, `hasMalformedTokens`, `hasShellQuoteSingleQuoteBug`. The "single-quote bug" is the known shell-quote misparsing of `'\'` patterns.
- **`utils/bash/treeSitterAnalysis.ts`** — `TreeSitterAnalysis` struct: `quoteContext`, `dangerousPatterns`, `compoundStructure`, `hasActualOperatorNodes`. Threaded into `ValidationContext` for tree-sitter-aware validators (`validateBackslashEscapedOperators` short-circuits if no operator nodes; `validateCommentQuoteDesync` short-circuits because tree-sitter quote context is authoritative).
- **`utils/bash/ParsedCommand.ts`** — `IParsedCommand` interface + `ParsedCommand.parse` static factory + `buildParsedCommandFromRoot(cmd, astRoot)` — wraps an AST so `getPipeSegments`, `withoutOutputRedirections`, `getTreeSitterAnalysis` are available.

---

## 8. PowerShellTool entry — `PowerShellTool.tsx`

**File:** `~/Desktop/reference/src/tools/PowerShellTool/PowerShellTool.tsx` (1000 lines).

Built via `buildTool({...})` at line 272 with `name = POWERSHELL_TOOL_NAME` ("PowerShell"), same `maxResultSizeChars = 30_000`.

**Input schema** (line 228-234):

```
command:                   z.string             "The PowerShell command to execute"
timeout:                   semanticNumber       "(max ${getMaxTimeoutMs()})"
description:               z.string optional    "active voice"
run_in_background:         semanticBoolean      conditionally omitted when CLAUDE_CODE_DISABLE_BACKGROUND_TASKS
dangerouslyDisableSandbox: semanticBoolean      "dangerously override sandbox mode"
```

**Note: no `_simulatedSedEdit`** — sed is bash-only. PowerShell's equivalent (Set-Content/Add-Content) flows through `pathValidation.ts` directly with no preview-then-apply trick.

**Windows sandbox policy refusal** (line 219-222, 354-360, 444-446): `WINDOWS_SANDBOX_POLICY_REFUSAL` — if `getPlatform() === 'windows' && SandboxManager.isSandboxEnabledInSettings() && !SandboxManager.areUnsandboxedCommandsAllowed()`, refuse execution outright. Both `validateInput` and `call` enforce this; `call` is load-bearing because `promptShellExecution.ts` and `processBashCommand.tsx` bypass `validateInput`.

**Sandboxing on Linux/macOS/WSL2** (line 740-749): pwsh runs as a native binary under `wrapWithSandbox` exactly like bash; `Shell.ts` uses `/bin/sh` for the outer spawn so the POSIX-quoted bwrap/sandbox-exec string parses. On Windows native `shouldUseSandbox` returns false unconditionally.

**Pre-flight failures** (line 717-728, 752-762): `getCachedPowerShellPath()` null OR exec spawn rejection → return `code: 0, stderr: 'PowerShell is not available...'` instead of throwing `ShellError`. The pre-flight sentinel is detected at line 502-504 (`code: 0 && !stdout && stderr && !backgroundTaskId`) so `trackGitOperations` doesn't mis-count.

`powershellPath` resolution lives in `utils/shell/powershellDetection.ts` — caches the result, distinguishes `pwsh` (Core 7+) vs `powershell.exe` (Desktop 5.1).

---

## 9. PowerShell `pathValidation.ts` — Windows path traversal protection

**File:** 2049 lines.

Core entry: `checkPathConstraints(input, parsed, cwd, toolPermissionContext)` at line 1528-1568 — iterates over `parsed.statements`, dispatching to `checkPathConstraintsForStatement` (line 1569).

**`CMDLET_PATH_CONFIG`** (line 124-839): per-cmdlet metadata with `operationType: 'read'|'write'|'create'`, `pathParams[]` (validated against allowed dirs), `knownSwitches[]` (no value), `knownValueParams[]` (consume next arg, NOT path-validated), `leafOnlyPathParams?[]` (resolved relative to ANOTHER param), `positionalSkip?` (e.g. `iwr`'s positional `-Uri` is a URL not a path), `optionalWrite?` (only writes when -OutFile present).

Configured cmdlets include: `set-content`, `add-content`, `remove-item`, `clear-content`, `out-file`, `tee-object`, `new-item`, `copy-item`, `move-item`, `rename-item`, `import-csv`, `export-csv`, `import-clixml`, `export-clixml`, `convertto-json`, `convertfrom-json`, `get-content`, `get-childitem`, `select-string`, `test-path`, `resolve-path`, `get-item`, `get-acl`, `get-filehash`, `format-hex`, `invoke-webrequest`, `invoke-restmethod`. **All non-listed cmdlets** force `hasUnvalidatablePathArg → ask`.

Comment at line 73-78: "SECURITY MODEL: Any -Param NOT in one of these three sets forces hasUnvalidatablePathArg → ask. This ends the KNOWN_SWITCH_PARAMS whack-a-mole..." — explicit allowlist beats blocklist.

Common parameters from `commonParameters.ts` (`COMMON_SWITCHES = ['-verbose', '-debug']`, `COMMON_VALUE_PARAMS = ['-erroraction', '-warningaction', '-informationaction', '-progressaction', '-errorvariable', '-warningvariable', '-informationvariable', '-outvariable', '-outbuffer', '-pipelinevariable']`) are merged at lookup time so cmdlet-specific configs don't repeat them.

**Glob detection** (line 50): `GLOB_PATTERN_REGEX = /[*?[\]]/`. Critical comment: PowerShell wildcards are `* ? [ ]` only — braces are LITERAL (no brace expansion). Including `{}` in glob detection misrouted paths through glob-base truncation.

**Dangerous removal** (line 840-857): `isDangerousRemovalRawPath` checks the **raw** user-provided path (pre-realpath, pre-tilde-expansion-and-back-slash-norm). `dangerousRemovalDeny(path)` returns `behavior: 'deny'`. The reason (line 833-839): `safeResolvePath` rewrites `/` to `C:\` on Windows and `homedir()` may be under `/var` rewritten to `/private/var` on macOS — both would defeat the path-equality check post-canonicalization.

**Provider/UNC scan** in `powershellPermissions.ts:983-1041`:

- Non-FS provider regex: `/^(?:[\w.]+\\)?(env|hklm|hkcu|function|alias|variable|cert|wsman|registry)::?/i` — env vars, registry, certs, WSMAN, functions, aliases, variables.
- `extractProviderPathFromArg` (line 985-1002) strips colon-bound prefix (handling unicode dash chars `–`/`—`/`―` and `/` for PS 5.1) and backtick escapes.
- Backtick-escaped provider syntax: `` `Registry`::HKLM\... `` — backtick removed before regex.

**`gitSafety.ts`** (176 lines) — git-internal path normalization to defeat 8.3 short names, drive-relative paths, provider qualifiers, NTFS trailing space/dot stripping, `..\<cwd-basename>\` re-entry. `isGitInternalPathPS(arg)` and `isDotGitPathPS(arg)` exported. `GIT_INTERNAL_PREFIXES = ['head', 'objects', 'refs', 'hooks']`. `git~N` (NTFS 8.3 short name for `.git`) explicitly handled.

---

## 10. PowerShell vs Bash differences

**Permission flow shape (`powershellPermissions.ts:639-1648`):** PowerShell uses a **collect-then-reduce** pattern instead of bash's sequential early-returns. Decisions are pushed into a `decisions[]` array (line 900); a single reduce applies precedence (`deny > ask > allow > passthrough`). Comment at line 879-895: "Supersedes the firstSubCommandAskRule stash from commit 8f5ae6c56b — that fix only patched step 4; steps 3, 3.5, 4.42 had the same flaw. Collect-then-reduce makes the bypass impossible to write."

**Pre-parse stage (line 661-757):**

- 1. exact match deny
- 2a. prefix deny (early return — fires even when pwsh unavailable)
- 2b. prefix **ask** is DEFERRED into `preParseAskDecision` (line 701-711)
- raw UNC check also deferred (line 717-723)
- 2c. exact allow short-circuits ONLY if parse failed AND no preParseAsk AND `classifyCommandName(first) !== 'application'` (escape hatch for parse-degraded mode)

**Parse-failed fallback** (line 764-874): when `pwsh` unavailable / parser timeout, split on `[;|\n\r{}()&]+` and run each fragment through the SAME rule matcher. Strips backtick-newline (line continuation) and stray backticks first; normalizes invocation-operator (`& cmd`, `. cmd`) and assignment prefixes (`$x = ...`) — so `$x = Invoke-Expression 'p'` doesn't bypass `deny(iex:*)`. A parse-independent dangerous-removal check on `Remove-Item` runs on raw args even without AST (line 832-840).

**Post-parse decisions** (line 876-1648):

- powershell security validators (`powershellSecurity.ts`)
- `using` statement / `#Requires` directive checks (line 940-971)
- provider/UNC arg scan (line 983-1041)
- per-sub-command deny/ask (line 1059-1107) — checks rules against BOTH the raw `subCmd` text AND a canonical AST-derived `element.name + ' ' + element.args.join(' ')` form. Comment at 1048-1058 explains why this dual-check is needed: invocation operators (`& 'Remove-Item' ./x` → raw text starts with `&`); non-space whitespace (`rm\t./x`); module prefixes (`Microsoft.PowerShell.Management\Remove-Item` → element.name has prefix stripped).
- `cd+git` compound guard (line 1109-1147)
- `path` constraint check
- `mode` validation (`modeValidation.ts:checkPermissionMode`)
- per-sub-command ask via `checkCommandAndSuggestRules`

**`powershellSecurity.ts`** runs **24 AST-based validators** (vs bash's 22 regex-based ones) at line 1054-1086:

`checkInvokeExpression`, `checkDynamicCommandName` (allowlist `StringConstantExpressionAst` only — anything else flagged), `checkEncodedCommand` (`pwsh -e`), `checkPwshCommandOrFile` (any nested PS executable invocation), `checkDownloadCradles` (per-statement piped + cross-statement split), `checkDownloadUtilities` (`Start-BitsTransfer`, `certutil -urlcache`, `bitsadmin /transfer`), `checkAddType` (compiles .NET at runtime), `checkComObject` (`New-Object -ComObject`, also extracts `-TypeName` / positional and CLM-checks), `checkDangerousFilePathExecution` (`Invoke-Command -FilePath`, `Start-Job -FilePath`, etc.), `checkInvokeItem` (ShellExecute), `checkScheduledTask` (`Register-ScheduledTask`, `schtasks /create`), `checkForEachMemberName` (`ForEach-Object -MemberName Kill`), `checkStartProcess` (`-Verb RunAs`, `Start-Process pwsh`), `checkScriptBlockInjection` (with `SAFE_SCRIPT_BLOCK_CMDLETS = {where, sort, select, group, format-{table,list,wide,custom}}` allowlist), `checkSubExpressions` (`$()`), `checkExpandableStrings` (DQ with `$env:` or `$()`), `checkSplatting` (`@variable`), `checkStopParsing` (`--%`), `checkMemberInvocations` (`.Method()`), `checkTypeLiterals` (against `clmTypes.ts:CLM_ALLOWED_TYPES`), `checkEnvVarManipulation` (`Set-Item env:` etc.), `checkModuleLoading` (`Import-Module`, `Install-Module`, `Save-Module`), `checkRuntimeStateManipulation` (`Set-Alias`, `Set-Variable PSDefaultParameterValues`), `checkWmiProcessSpawn` (`Invoke-WmiMethod`, `Invoke-CimMethod`).

**Constrained Language Mode allowlist** (`clmTypes.ts:18-188`): inverts Microsoft's CLM whitelist. `[Reflection.Assembly]`, `[IO.Pipes]`, `[Diagnostics.Process]`, `[InteropServices.Marshal]`, `[Net.WebClient]`, `[adsi]`, `[adsisearcher]`, `[wmi]`, `[wmiclass]`, `[wmisearcher]`, `[cimsession]`, `[directoryservices.directoryentry]`, `[directoryservices.directorysearcher]`, `[management.managementobject]`, `[management.managementclass]`, `[management.managementobjectsearcher]` are all OUTSIDE the allowlist → ask. Notable removals from Microsoft's official CLM list: `adsi`, `adsisearcher`, `wmi`, `wmiclass`, `wmisearcher`, `cimsession` — all perform NETWORK BINDS (LDAP, remote WMI, CIM session) when cast. Comment at line 22-26 documents the rationale.

**ExecutionPolicy:** not directly enforced by the validator chain. The PS prompt (`prompt.ts:73-145`) sets edition-specific guidance (5.1 vs Core 7+) including avoidance of `&&`/`||`/ternary on 5.1, UTF-16 BOM defaults, and use of `--%` stop-parsing. `-NonInteractive` is enforced at the shell-spawn layer (`utils/Shell.ts`); cmdlets that prompt (`Read-Host`, `Get-Credential`, `Out-GridView`, `$Host.UI.PromptForChoice`, `pause`, `git rebase -i`, `git add -i`) are explicitly called out as "will hang" in the prompt. There is no equivalent of bash's `2>&1` — the prompt explicitly directs against `2>&1` on PS 5.1 because it wraps each line in `NativeCommandError` and breaks `$?`.

**Script-block logging:** not directly hooked by the BashTool/PowerShellTool surface. The `checkScriptBlockInjection` validator + `DANGEROUS_SCRIPT_BLOCK_CMDLETS` set in `utils/powershell/dangerousCmdlets.js` provide the static analog. Runtime script-block logging would be enforced by `pwsh.exe` itself when the `-NonInteractive` shell launches in a logged-policy environment.

**`sleep` blocking divergence:**

- Bash: bare `sleep N` (N≥2) blocked at the front of a command (`BashTool.tsx:322-337`).
- PowerShell: `Start-Sleep N`, `Start-Sleep -Seconds N`, `Start-Sleep -s N`, `sleep N` (alias) all blocked at front (`PowerShellTool.tsx:189-205`). Sub-second `Start-Sleep -Milliseconds` is allowed (legitimate pacing).

**Runtime-state hijack** (PS-specific, no bash analog): `Set-Alias`, `New-Alias`, `Set-Variable`, `New-Variable` are all flagged because they can poison `$PSDefaultParameterValues` or alias `Get-Content` to `Invoke-Expression` for the rest of the session.

**`acceptEdits` mode allowlist:**

- Bash (`modeValidation.ts:7-15`): `mkdir`, `touch`, `rm`, `rmdir`, `mv`, `cp`, `sed`.
- PowerShell (`modeValidation.ts:33-38`): `set-content`, `add-content`, `remove-item`, `clear-content`. Tier-3 cmdlets (`new-item`, `copy-item`, `move-item`) intentionally NOT auto-allowed — they fall through to ask. Comment at line 30-32: "Tier 3 cmdlets with complex parameter binding removed — they fall through to 'ask'."

PowerShell `acceptEdits` mode also adds **compound-cwd-desync** and **symlink-create** guards (line 198-242):

- If any statement contains `Set-Location`/`Push-Location`/`Pop-Location` (or aliases `cd`, `sl`, `chdir`, `pushd`, `popd`) AND any write cmdlet → passthrough.
- If any statement creates a symlink/junction/hardlink (`New-Item -ItemType SymbolicLink/Junction/HardLink`) → passthrough. Read-through-symlink is equally dangerous (exfil), so no `hasWriteCommand` requirement.
- `isSymlinkCreatingCommand` (line 82-117) handles unicode dash params (`–`/`—`/`―`), `/` (PS 5.1), backtick escapes, colon-bound values.

---

## 11. Background-task lifecycle (both tools)

The shared infrastructure lives in `tasks/LocalShellTask/LocalShellTask.js`:

- `spawnShellTask(spec, ctx)` — creates a task entry in `AppState.tasks`, returns handle.
- `registerForeground(spec, setAppState, toolUseId)` — declares a running command as foreground (so it can be backgrounded via `Ctrl+B`).
- `unregisterForeground(taskId, setAppState)` — on completion.
- `backgroundExistingForegroundTask(taskId, shellCommand, description, setAppState, toolUseId)` — converts a foreground task to background in-place (avoids re-spawning).
- `markTaskNotified(taskId, setAppState)` — marks the task's completion notification as delivered (so `<task_notification>` doesn't get sent twice).
- `getTaskOutputPath(taskId)` — returns the on-disk output path for the task.

The race condition at `BashTool.tsx:1037-1064` is significant: a backgrounded task can complete between `shellCommand.background()` and the next progress poll. The fix is to detect `result.backgroundTaskId !== undefined`, call `markTaskNotified`, strip the backgroundTaskId so the model sees a clean completed command, and reconstruct `outputFilePath` for large outputs (which `#handleExit` skipped because `#backgroundTaskId` was set).

---

## 12. Cross-cutting: `commandSemantics.ts` (both tools)

`BashTool/commandSemantics.ts` (140 lines) and `PowerShellTool/commandSemantics.ts` (142 lines) implement `interpretCommandResult(command, exitCode, stdout, stderr)` — semantic interpretation of non-zero exit codes that aren't actually errors:

- `grep`/`rg`: exit 1 = "no match" (not an error)
- `diff`: exit 1 = "files differ" (not an error)
- `cmp`: exit 1 = "files differ"
- `test`/`[`: exit 1 = condition false
- `find`: exit 1 = some files unreadable but search completed
- `git diff --quiet`: exit 1 = there are differences

Result: the model gets `returnCodeInterpretation: "diff: files differ (exit 1)"` instead of seeing it as an error.

---

## 13. UI rendering — `UI.tsx`, `BashToolResultMessage.tsx`

`BashTool/UI.tsx` (184 lines): exports `BackgroundHint`, `renderToolUseMessage`, `renderToolResultMessage`, `renderToolUseProgressMessage`, `renderToolUseQueuedMessage`, `renderToolUseErrorMessage`. The "Sandbox" indicator only shows when `CLAUDE_CODE_BASH_SANDBOX_SHOW_INDICATOR` env truthy — see `BashTool.tsx:498-503` rationale: env-var first because `shouldUseSandbox` calls `splitCommand_DEPRECATED` (slow), and `userFacingName` runs per-render in chat history.

`PowerShellTool/UI.tsx` (130 lines): same shape, no sandbox indicator (no env-var equivalent).

---

## Summary count

- **18 BashTool files**, ~5,200 LOC (excluding tests).
- **14 PowerShellTool files**, ~6,700 LOC.
- **22 bash validators** + **24 PS validators** = 46 distinct security checks.
- **23 numeric `BASH_SECURITY_CHECK_IDS`** for telemetry.
- **~40+ documented attack patterns** with HackerOne / GH issue references.
- **3 sandbox modes**: Seatbelt (macOS), bubblewrap (Linux), policy-refusal (Windows native).
- **6 permission modes**: `default`, `acceptEdits`, `plan`, `auto`, `bypassPermissions`, `dontAsk`.
- **3 rule types**: exact, prefix, wildcard — with separate semantics for allow vs deny/ask.
- **2 env-stripping policies**: SAFE_ENV_VARS for allow-rule matching, BINARY_HIJACK_VARS-blocked for deny/ask.

The shell perimeter is hardened by an unusual combination of (1) tree-sitter as the primary parser with shell-quote as fallback, (2) per-validator deferral of non-misparsing asks so misparsing concerns can override them, (3) compound-aware permission semantics that prevent prefix bypasses, and (4) explicit allowlist-only flag parsing for the read-only auto-allow path. The PowerShell side adds AST-driven analysis (PS Parser is more capable than bash tree-sitter for permission semantics), CLM allowlist as the type-cast safety boundary, and the collect-then-reduce decision pattern that closes the deny-after-ask bypass class structurally.
