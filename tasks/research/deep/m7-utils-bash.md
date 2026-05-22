# M7 — `src/utils/bash/` Deep Dive

> Source: `~/Desktop/reference/src/utils/bash/` — 16 files, 12,093 LOC TypeScript + 213 LOC of Fig-style command specs.
> Cross-refs: orientation `tasks/research/anthropic-claude-suite-may-2026.md` §F (threat model), §5.16 (auto-mode bypasses).
> Filed by deep-dive agent M7 (1 of 30) — 2026-05-08.

## TL;DR

This directory is **not a sandbox**. It is a **static argv extractor** whose job is to answer one question: "given this raw bash string, can we produce a trustworthy `argv[]` for every simple command inside it?" If yes, downstream `bashPermissions.ts` (owned by another agent) matches `argv[0]` against allow/deny rules. If no, the user is asked. Everything else — bubblewrap, Seatbelt, Landlock, network egress, background tracking — lives **outside this directory** and we found zero references to it here.

The depth (4,436 LOC for `bashParser.ts` + 2,679 LOC for `ast.ts`) exists because **bash's parser-vs-tokenizer mismatches and zsh divergences are the primary attack surface**. Every line in this directory is either (a) a faithful re-implementation of tree-sitter-bash semantics in pure TS (no native dep), (b) a fail-closed gate against a documented attack class, or (c) a normalization shim for the legacy `shell-quote`-backed path. The orientation §F.6 mentions one disclosed bypass (`/proc/self/root/usr/bin/npx`) that defeats bubblewrap entirely — **this directory does not attempt to defend against that**, because it operates at the static argv layer, not the syscall layer.

---

## File inventory

| File                    | LOC   | Role                                                                                                 |
| ----------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| `bashParser.ts`         | 4,436 | Pure-TS bash AST parser (tree-sitter-bash compatible). Tokenizer + recursive-descent grammar.        |
| `ast.ts`                | 2,679 | Security walker. `parseForSecurity()` + `checkSemantics()`. Allowlist-based argv extraction.         |
| `commands.ts`           | 1,339 | Legacy shell-quote-based path. Heredoc/redirect splitting. `BASH_POLICY_SPEC` system prompt.         |
| `heredoc.ts`            | 733   | Heredoc extraction/restoration with quote-aware scanner.                                             |
| `ShellSnapshot.ts`      | 582   | Captures user shell config (aliases/functions/options) into a sourceable file for subprocess shells. |
| `treeSitterAnalysis.ts` | 506   | `IParsedCommand` interface; AST→quote/compound-structure/dangerous-pattern extractors.               |
| `ParsedCommand.ts`      | 318   | Public `ParsedCommand.parse()` facade w/ size-1 cache + tree-sitter availability detection.          |
| `shellQuote.ts`         | 304   | Hardened wrappers around `shell-quote` lib. `hasMalformedTokens`, `hasShellQuoteSingleQuoteBug`.     |
| `bashPipeCommand.ts`    | 294   | `rearrangePipeCommand()` — places `< /dev/null` after first cmd in a pipeline for `eval`-safe stdin. |
| `shellCompletion.ts`    | 259   | bash/zsh tab-completion via `compgen` / zsh `parameters[]` lookups.                                  |
| `parser.ts`             | 230   | Thin facade over bashParser; `parseCommand`, `parseCommandRaw`, `PARSE_ABORTED` sentinel.            |
| `prefix.ts`             | 204   | `getCommandPrefixStatic()` — static prefix extraction for permission-rule matching.                  |
| `shellQuoting.ts`       | 128   | `quoteShellCommand` (heredoc-aware), `rewriteWindowsNullRedirect` (`>nul` → `/dev/null`).            |
| `registry.ts`           | 53    | Command-spec loader (Fig-format), memoized.                                                          |
| `shellPrefix.ts`        | 28    | `formatShellPrefixCommand` — handles `bash -c` style prefixes.                                       |
| `specs/*.ts`            | 213   | Per-command Fig specs: `pyright`, `timeout`, `sleep`, `alias`, `nohup`, `time`, `srun`.              |

`specs/index.ts` aggregates these into a `CommandSpec[]` consumed by `registry.ts:46-49`.

---

## 1. `bashParser.ts` — 4,436 LOC pure-TS bash parser

### Why this depth

The header comment at `bashParser.ts:1-10` says it all:

> Pure-TypeScript bash parser producing tree-sitter-bash-compatible ASTs. Validated against a 3449-input golden corpus generated from the WASM parser.

So this isn't experimentation — it's a **reimplementation** of the tree-sitter-bash WASM grammar, byte-for-byte compatible (UTF-8 byte offsets per `bashParser.ts:5-6`), without the native dep. Why? Because (a) tree-sitter-bash is sometimes feature-gated off (`parser.ts:51` checks `feature('TREE_SITTER_BASH')`), and (b) the WASM module is ~600 KB and the team wanted a fallback that ships zero binary. The `MODULE`/`getParserModule()` shim at `bashParser.ts:34-46` is a no-op that returns the pure-TS parser unconditionally — `ensureParserInitialized()` returns a resolved Promise.

The parser is **timeout-bounded (50 ms)** and **node-budget-bounded (50 K nodes)** at `bashParser.ts:29-33`. `checkBudget()` at `bashParser.ts:647-657` increments a counter and checks the deadline every 128 nodes (`& 0x7f`). On budget exhaustion, throws `'budget'` / `'timeout'` and the caller (`parseSource` at `bashParser.ts:610-631`) returns `null` (= `PARSE_ABORTED` from `parser.ts:93`). Adversarial inputs like `(( a[0][0]... ))` with ~2,800 subscripts are explicitly called out at `parser.ts:88-94` as known abuse vectors — under the 10K command-length cap they will trigger the timeout, and `parser.ts:104-136` returns `PARSE_ABORTED` (a Symbol), which `ast.ts:444-457` translates to `kind: 'too-complex'` (fail closed → ask user).

### Architecture

**Tokenizer** (`bashParser.ts:48-591`):

- 17 token types (`bashParser.ts:50-66`) including `WORD`, `NUMBER`, `OP`, `NEWLINE`, `COMMENT`, four flavors of dollar-prefixed (`$`, `$(`, `${`, `$((`), and quote types.
- Context-sensitive `nextToken(L, ctx)` at `bashParser.ts:302`: in `'cmd'` mode, `[`/`[[`/`{` are operators (test command, group); in `'arg'` mode they're word chars.
- Multi-char operators handled longest-match-first at `bashParser.ts:327-447`. Covers `&&`, `||`, `|&`, `;;&`, `;&`, `>>`, `>&-`, `<<<`, `<<-`, `&>>`, etc.
- Line-continuation handling at `bashParser.ts:278-294`: tree-sitter's extras rule `/\\\r?\n/` is replicated. CRLF inputs (`\r` at `bashParser.ts:275-276`) treated as whitespace.

**Heredoc state** (`bashParser.ts:118-132`): pending heredocs queued at `<<` operator, body scanned at next newline (`scanHeredocBodies` at `bashParser.ts:1885-1927`). Both quoted (`<<'EOF'`) and unquoted heredocs supported, including `<<-` tab-stripping (`bashParser.ts:1897-1898`).

**Recursive-descent parser** (`bashParser.ts:706-3700+`):

- `parseProgram` → `parseStatements` → `parseAndOr` → `parsePipeline` → `parseCommand` → `parseSimpleCommand`
- Compound commands: `parseIf`, `parseWhile`, `parseFor`, `parseCase`, `parseFunction`, `parseDeclaration`, `parseUnset`
- Test commands `[ ]` and `[[ ]]` with arithmetic/regex RHS handling (`parseTestExpr` at `bashParser.ts:3699+`)
- Process substitution `<(...)` / `>(...)` at `bashParser.ts:1861-1883`
- `tryParseRedirect` at `bashParser.ts:1623-1858` — handles all bash redirect operators including FD-prefixed, herestrings, heredocs

### Why bash parsing is this deep — the answer

**It's permission classification, not execution sandboxing.** The orientation §F.1 distinguishes "auto-allowed" (read-only tools, web search) from "approval needed" (Bash, Edit, Write, NotebookEdit). For Bash specifically, Anthropic's auto-mode classifier (orientation §F.2) is "reasoning-blind by design" — it sees only user messages and agent tool calls. The classifier makes its decision against the literal string the agent emits. If that string is, say, `git push`, it might match a `Bash(git push:*)` allow rule. But what if the agent emits `git\ push` or `git $SUB --force` where `SUB=push`? Without parsing, both look like _different_ commands than `git push`. With parsing, `bashParser.ts` produces an AST whose `command_name` is `git` and `argv[1]` is `push` — and `ast.ts:1349-1358` even _rebuilds_ the `.text` from the resolved argv when expansions were resolved, so downstream rule matching sees the canonical form.

So the depth is required because **every parser quirk is a potential bypass primitive**. The corpus-validation against tree-sitter-bash's WASM output is the gate that keeps parser differentials from accumulating.

---

## 2. `ast.ts` — 2,679 LOC security walker

### Mental model

`parseForSecurity(cmd)` (`ast.ts:381-392`) returns one of three shapes (`ast.ts:42-45`):

- `{kind: 'simple', commands: SimpleCommand[]}` — every simple command extracted with clean argv/envVars/redirects
- `{kind: 'too-complex', reason, nodeType?}` — anywhere we couldn't statically reason → ask user
- `{kind: 'parse-unavailable'}` — tree-sitter not loaded → caller falls back to legacy regex path

The header (`ast.ts:1-19`) states the design property explicitly: **fail closed**. Any tree-sitter node type not in the explicit allowlist triggers `tooComplex()`. There's no "best effort" fallback inside the AST walker.

### Pre-checks (run before tree walk)

`parseForSecurityFromAst` at `ast.ts:400-460` runs differential-killing pre-checks:

| Check                     | Source           | Attack class                                                                                                                                     |
| ------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CONTROL_CHAR_RE`         | `ast.ts:254`     | `\x00`–`\x08`, `\x0B`–`\x1F`, `\x7F` — `\r` (0x0D) is a tree-sitter/bash word-boundary disagreement                                              |
| `UNICODE_WHITESPACE_RE`   | `ast.ts:262-263` | NBSP, zero-width spaces, line/paragraph separators, BOM — invisible in terminals, treated as word chars by bash but as separators by tree-sitter |
| `BACKSLASH_WHITESPACE_RE` | `ast.ts:279`     | `\<space>` and `\<NL>` → tree-sitter splits to two words, bash joins. `tr\<NL>aceroute` is the canonical exploit.                                |
| `ZSH_TILDE_BRACKET_RE`    | `ast.ts:287`     | `~[name]` invokes zsh's `zsh_directory_name` hook — arbitrary code                                                                               |
| `ZSH_EQUALS_EXPANSION_RE` | `ast.ts:297`     | `=cmd` in zsh expands to `$(which cmd)` — bypasses `Bash(curl:*)` deny because tree-sitter sees `=curl` as a literal word                        |
| `BRACE_WITH_QUOTE_RE`     | `ast.ts:314`     | `{a'}',b}` brace expansion using quoted braces to obfuscate                                                                                      |

All six route to `kind: 'too-complex'` → ask user.

### Walker allowlist

`collectCommands` (`ast.ts:482`) recurses through structural nodes. The handled types are:

- `command` → `walkCommand` (`ast.ts:1237`)
- `redirected_statement` → `walkRedirectedStatement` (`ast.ts:1017`)
- `program`, `list`, `pipeline` (`STRUCTURAL_TYPES` at `ast.ts:54-59`)
- `negated_command` (`ast.ts:567`)
- `declaration_command` — `export`/`local`/`readonly`/`declare`/`typeset` (`ast.ts:579-676`)
- `variable_assignment` — bare `VAR=value` (`ast.ts:678`)
- `for_statement` (`ast.ts:693`), `if_statement`, `while_statement` (`ast.ts:764`)
- `subshell` (`ast.ts:882`)
- `test_command` `[ ]` / `[[ ]]` (`ast.ts:897`)
- `unset_command` (`ast.ts:920`)

Anything else returns `tooComplex(node)`. The `DANGEROUS_TYPES` set at `ast.ts:186-205` is documentation only — it lists _known_ dangerous types but the actual gate is the allowlist's default branch.

### Variable scoping (subtle)

`varScope: Map<string, string>` is the most security-sensitive piece in this file. The rules:

1. `&&` and `;` carry scope linearly: `VAR=x && cmd $VAR` resolves correctly (`ast.ts:530-547`).
2. `||`, `|`, `|&`, `&` reset scope from a snapshot taken at entry (`ast.ts:540`). The flag-omission attack documented at `ast.ts:506-512` is the rationale: `true || FLAG=--dry-run && cmd $FLAG` — bash skips the `||` RHS so `cmd` runs WITHOUT `--dry-run`. With linear scope, our argv would have `['cmd','--dry-run']` → looks safe → bypass.
3. Pipeline stages always run in subshells → start with a copy of incoming `varScope` so nothing mutates caller's scope (`ast.ts:544`).
4. Subshells `(cmd)` use a copy (`ast.ts:887`) — bash isolation.
5. `for VAR in WORDS` always sets `VAR` to `VAR_PLACEHOLDER` regardless of how "static" the iteration words look (`ast.ts:697-708`). Even `for i in /etc/passwd` doesn't get treated as a literal — bare `$i` in body becomes too-complex. Justification: prevents glob/flag/path smuggling.
6. `while read VAR` tracks `VAR` as `VAR_PLACEHOLDER` (`ast.ts:846-873`) but with a **defense-in-depth check**: if `VAR` already had a literal value in scope and we're about to overwrite it with a placeholder, fail closed (`ast.ts:861-872`). Rationale: `true || read VAR` may not execute, but `commands[]` is a flat accumulator that doesn't know that — and overwriting a literal with a placeholder hides path-traversal exploits.
7. `unset VAR` deletes from scope (`ast.ts:938`).

### `walkArgument` — the type allowlist

`ast.ts:1399-1491` switches on `node.type`:

- `word` → unescape `\X` → `X`, reject brace-expansion via `BRACE_EXPANSION_RE`
- `number` → reject if `children.length > 0` (catches `NN#$(cmd)` arithmetic-base abuse)
- `raw_string` → strip outer `'`
- `string` → `walkString` (handles double-quote escape rules `$`, backtick, `"`, `\` only)
- `concatenation` → recurse, reject brace
- `arithmetic_expansion` → `walkArithmetic` (only literal numerics; rejects ALL variables)
- `simple_expansion` → `resolveSimpleExpansion`

**Bare `command_substitution` is intentionally NOT handled** at arg position (`ast.ts:1481-1486`) — `$()` output IS the argument, and using a placeholder would hide the real path. So `cd $(echo /etc)` is always too-complex.

### `walkArithmetic` — recursive integer-only validator

`ast.ts:1675-1702`. Rationale at `ast.ts:1666-1670`: bash arithmetic recursively evaluates variable values, so `x='a[$(cmd)]'` then `$((x))` runs cmd. Therefore variables are rejected; `ARITH_LEAF_RE` at `ast.ts:1659-1660` accepts only digits / `0x` hex / `BASE#digits` / operators. Cited reference: Vidar Holen's arithmetic-injection blog post.

### `walkString` solo-placeholder rejection

`ast.ts:1631-1638`. `"$(cmd)"` or `"$VAR"` (where VAR holds an unknown sentinel) where the entire string is JUST the placeholder → reject. Otherwise `cd "$(echo /etc)"` would pass with argv `['cd', '__CMDSUB_OUTPUT__']` and `validatePath('__CMDSUB_OUTPUT__')` would resolve as cwd-relative → allowed → bash actually `cd /etc`.

Mixed content (`"prefix: $(cmd)"`) is allowed because runtime concat can't equal a bare path.

### `extractSafeCatHeredoc` — the carve-out

`ast.ts:1721+`. Special-cases `$(cat <<'DELIM'...DELIM)` where DELIM is quoted (literal body, no expansion). Why: this is the idiomatic way to pass multi-line content to `gh pr create --body` etc. The prior version dropped the body → `rm "$(cat <<'EOF'\n/etc/passwd\nEOF)"` produced argv `['rm','']` → `validatePath('')` resolved to cwd → bypass. Fix at `ast.ts:1573-1591`: append the body (single-line only — multi-line bodies are markdown/scripts, can't be paths, dropped).

### `checkSemantics` — post-argv sweep

`ast.ts:2213-2679`. Runs after `parseForSecurity` returns `simple`. Catches:

1. **Wrapper unwrapping**: `time`, `nohup`, `timeout DUR`, `nice -n N`, `env [VAR=x...]`, `stdbuf`. Each peels off its layer and checks the wrapped command's name. Multi-step fail-closed: any unknown flag → reject (e.g., `timeout -k 5 10 eval ...` previously broke out with name=`timeout` because the loop only handled `--long`; now fails at unknown short flag — `ast.ts:2228-2274`).
2. **Empty argv[0]** at `ast.ts:2395-2400` — defense-in-depth against unquoted empty expansion (`V="" && $V cmd` → bash drops empty field, runs cmd).
3. **Placeholder argv[0]** at `ast.ts:2406-2411` — should be unreachable but caught for safety.
4. **`SUBSCRIPT_EVAL_FLAGS`** (`ast.ts:2143-2155`) — `test -v 'a[$(id)]'`, `printf -v 'a[$(id)]'`, `read -a 'a[$(id)]'`, `unset -v 'a[$(id)]'`, `wait -p 'a[$(id)]'`. These builtins re-parse a NAME operand internally and arithmetically evaluate `arr[EXPR]` subscripts. Same `$(cmd)` execution primitive as `walkArithmetic` guards. Tree-sitter sees the single-quoted form as a `raw_string` leaf — opaque. Combined-flag forms (`-vNAME`) and short-flag bundles (`-ra`) handled.
5. **`TEST_ARITH_CMP_OPS`** (`ast.ts:2169`) — `[[ ARG -eq ARG ]]` arith comparison evaluates both sides. Either side containing `[` rejects.
6. **`BARE_SUBSCRIPT_NAME_BUILTINS`** (`ast.ts:2182`) — `read 'a[$(id)]'` works without `-a`. `read`/`unset` treat every bare positional as a NAME.
7. **`SHELL_KEYWORDS` as argv[0]** (`ast.ts:2547`) — `do`, `done`, `then`, etc. as command names indicates parser mis-parse.
8. **`NEWLINE_HASH_RE`** (`ast.ts:2204`) — `\n[ \t]*#` inside an argv element, env value, or redirect target. Downstream `stripSafeWrappers` re-tokenizes line-by-line and treats `#` after `\n` as comment, hiding args from path validation.
9. **`jq` system()/--from-file** (`ast.ts:2594-2617`) — jq's `system()` builtin executes shell; `-f`/`-L`/`--from-file`/`--rawfile`/`--slurpfile`/`--library-path` read arbitrary files.
10. **`ZSH_DANGEROUS_BUILTINS`** (`ast.ts:2060-2078`) — `zmodload`, `emulate`, `sysopen`, `zpty`, `ztcp`, `zsocket`, `zf_rm`, etc. Zsh-only internals; matched by name because they parse as plain `command` nodes.
11. **`EVAL_LIKE_BUILTINS`** (`ast.ts:2086-2134`) — `eval`, `source`, `.`, `exec`, `command` (without `-v`/`-V`), `builtin`, `fc`, `coproc`, `noglob`, `nocorrect`, `trap`, `enable`, `mapfile`, `readarray`, `hash`, `bind`, `complete`, `compgen` (without safe flags), `alias`, `let`. All reject unless explicitly carved out.
12. **`/proc/*/environ`** (`ast.ts:2197`) — exposes env vars (incl. secrets) of other processes. `cat /proc/self/environ` and `cat < /proc/self/environ` both checked. Uses `.*` not `[^/]*` because Linux resolves `..` in procfs.

---

## 3. `commands.ts` — legacy shell-quote path

This is the **fallback** when tree-sitter is unavailable (`parser.ts:65` gates on `feature('TREE_SITTER_BASH')`). Every export is annotated `@deprecated Legacy regex/shell-quote path. Only used when tree-sitter is unavailable. The primary gate is parseForSecurity (ast.ts).` (e.g., `commands.ts:259-261`, `commands.ts:606-608`).

Key pieces:

- **`splitCommandWithOperators`** (`commands.ts:85-249`) — uses `shell-quote` lib but injects random-salted placeholders to prevent injection (`commands.ts:13-36`). Heredocs extracted first via `heredoc.ts`. Line-continuations `\<NL>` joined ONLY when odd backslash count (`commands.ts:106-120`) — even count = real separator.
- **`splitCommand_DEPRECATED`** (`commands.ts:265-369`) — splits compound commands, strips redirects (handled by `pathValidation.ts` separately).
- **`extractOutputRedirections`** (`commands.ts:634-790`) — finds `>`, `>>`, `>&`, ZSH `>!`, POSIX `>|` patterns. Returns `hasDangerousRedirection: true` when target contains `$`/backtick/glob/`~`. **Fail-closed** on parse failure (`commands.ts:688-699`) — previously returned `redirections:[]` (silent bypass); now flags as dangerous.
- **`isStaticRedirectTarget`** (`commands.ts:47-81`) — defines what counts as a path-validatable target. Rejects whitespace, `#`-prefix (shell-quote comment differential), `!` (history), `=` (zsh equals), variables, command sub, globs, brace, tilde, process sub, FD prefix.
- **`hasDangerousExpansion`** (`commands.ts:830-858`) — design invariant at `commands.ts:826-829`: every redirect target is either captured (`isSimpleTarget=true`) OR flagged dangerous OR rejected via fail-closed. No third path.
- **`BASH_POLICY_SPEC`** (`commands.ts:438-499`) — the **system prompt** that goes to a **separate** Haiku model (or whichever fast classifier is configured) to extract a "command prefix" for permission rule matching. Includes ~30 examples covering injection patterns (backtick, `$(...)`, `;`+`&&`+`||`+`#` chains). Returns `command_injection_detected` for unsafe patterns, `none` for prefix-less commands like `git push` (no subcommand prefix), or the actual prefix like `git commit` for `git commit -m "foo"`.

The policy spec is an **LLM-as-classifier** approach. The legacy regex path uses Haiku for prefix extraction; the AST path skips it because the structural extraction is reliable. Bash policy spec lives in `commands.ts` because the legacy path needed it; with `ast.ts:1349-1358` rebuilding `.text` from extracted argv, AST consumers don't.

---

## 4. `heredoc.ts` — quote-aware heredoc extractor

The whole file is a defensive scanner. The header (`heredoc.ts:1-25`) explains: `shell-quote` parses `<<` as two `<` operators, so we must extract heredocs BEFORE handing the command to shell-quote. Lots of CVE-class scenarios:

- **Backslash-quoted delimiters** (`heredoc.ts:42-66`): `<<\EOF` (escape consumed), `<<'\EOF'` (delim is `\EOF`). Old regex put `\\?` outside the capture group → mismatch → command smuggling. Now alternation: `(['"]) (\\?\w+) \2` for quoted, `\\?(\w+)` for unquoted.
- **Pre-validation bail-outs** (`heredoc.ts:124-167`): bails on `$'...'`/`$"..."` (ANSI-C/locale quoting — quote tracker can't handle the `$` prefix); bails on backticks before first `<<` (PST_EOFTOKEN early-closure semantics); bails on unbalanced `((` arithmetic context (where `<<` is bit-shift, not heredoc).
- **Incremental quote/comment scanner** (`heredoc.ts:185-275`): O(n) replacement for the previous O(n²) per-match re-scan. Big perf win on `std::cout << ...` C++ heredocs (200 lines × multiple shell-validation calls).
- **Logical-line newline scan** (`heredoc.ts:380-435`): a quoted-newline `'${}\n'` extends the logical command line. Uses quote-state tracking to find the FIRST UNQUOTED newline after the operator. Old `indexOf('\n')` was vulnerable to `echo <<'EOF' '${}\n' ; curl evil.com\nEOF` — would put `curl` in the heredoc body, hiding it from validators.
- **PST_EOFTOKEN emulation** (`heredoc.ts:501-524`): `make_cmd.c:606` early-closure inside `$()`/`${}`/backtick. Bails on shell metacharacters (`)`, `}`, backtick, `|`, `&`, `;`, `(`, `<`, `>`) after the delimiter on a closing-line candidate.
- **Skipped/overlap guards** (`heredoc.ts:548-598`): when `quotedOnly=true` skips an unquoted heredoc, still records its content range so a quoted "heredoc" pattern inside the unquoted body doesn't get mis-extracted.
- **Random salted placeholders** (`heredoc.ts:36-39`, `heredoc.ts:660-669`) — prevents `__HEREDOC_0__` collision attacks.

---

## 5. `treeSitterAnalysis.ts` — IParsedCommand surface

Defines `IParsedCommand` interface (`treeSitterAnalysis.ts:21-32`) implemented by both regex (`RegexParsedCommand_DEPRECATED`) and tree-sitter (`TreeSitterParsedCommand`) paths in `ParsedCommand.ts`.

Exports for AST consumers:

- `extractQuoteContext` — produces `{withDoubleQuotes, fullyUnquoted, unquotedKeepQuoteChars}` views of the command (`treeSitterAnalysis.ts:224-290`). Used by validators that need to inspect non-quoted code.
- `extractCompoundStructure` — operators/pipelines/subshells/segments at top level (`treeSitterAnalysis.ts:296-411`).
- `hasActualOperatorNodes` — "is this `\;` a real `;` or part of a `find -exec` word?" (`treeSitterAnalysis.ts:421-443`). Used to skip the false-positive backslash-escaped-operator check when no real operator nodes exist.
- `extractDangerousPatterns` — quick AST-level flag for `command_substitution`, `process_substitution`, `expansion`, `heredoc_redirect`, `comment` (`treeSitterAnalysis.ts:448-489`).

The `collectQuoteSpans` single-pass scanner (`treeSitterAnalysis.ts:88-137`) replaces 5 separate tree walks with one — ~5× speedup. Replicates per-type-walk semantics including the "outermost only" rule for nested quotes and the descend-into-`$()`/`${}` for inner quote nodes.

---

## 6. `ParsedCommand.ts` — facade

`ParsedCommand.parse(command)` is the public entry point. `ParsedCommand.ts:240-248` checks tree-sitter availability via probe parse of `'echo test'`; falls back to `RegexParsedCommand_DEPRECATED`. Size-1 cache at `ParsedCommand.ts:297-317` because legacy callers (`bashCommandIsSafeAsync`, `buildSegmentWithoutRedirections`) re-parse identical commands repeatedly.

`TreeSitterParsedCommand` (`ParsedCommand.ts:151-238`) operates on **UTF-8 byte buffers** (`ParsedCommand.ts:159, 171`) because tree-sitter offsets are bytes but JS `String.slice` is code units. For ASCII they coincide; for `—` U+2014 (3 UTF-8 bytes, 1 code unit) they diverge and slicing string directly lands mid-token.

---

## 7. `shellQuote.ts` — hardened shell-quote wrappers

The `shell-quote` npm lib has well-documented bugs that this module compensates for:

- **`hasMalformedTokens`** (`shellQuote.ts:117-176`): detects when shell-quote's parsing diverges from bash's. Two indicators: (a) unterminated quotes in the original (shell-quote silently drops unmatched `"`/`'`), (b) unbalanced delimiters in any token. Cites HackerOne #3482049 (`shellQuote.ts:115`) — `echo {"hi":"hi;evil"}` injection.
- **`hasShellQuoteSingleQuoteBug`** (`shellQuote.ts:190-265`): the `'\' <payload> '\'` exploit. shell-quote treats `\'` as escape inside single quotes (wrong); bash treats backslash as literal. Both odd (always-bug) and even (bug-only-with-later-`'`) trailing-backslash patterns detected. Cites H1 report `git ls-remote 'safe\\' '--upload-pack=evil' 'repo'` — shell-quote merges to one token, bash splits into three.
- **`quote`** (`shellQuote.ts:267-304`): wraps `shell-quote.quote` with strict + lenient validation. Critical line at `shellQuote.ts:296-302`: **"NEVER use JSON.stringify as a fallback for shell quoting"** — JSON.stringify uses double quotes which don't prevent shell injection.

---

## 8. `bashPipeCommand.ts` — `< /dev/null` placement

`rearrangePipeCommand(cmd)` (`bashPipeCommand.ts:14-100`). Problem: when running `eval 'cmd1 | cmd2' < /dev/null`, the redirect attaches to `cmd2` (last in pipeline), not `cmd1`. We want `cmd1 < /dev/null | cmd2`. Solution: parse the command, find the first `|`, rebuild with redirect after first segment.

Bail-outs (fall back to `quoteWithEvalStdinRedirect` which puts redirect on eval itself):

- Backticks (`bashPipeCommand.ts:15-17`)
- `$(...)` (parser bug — splits parens — `bashPipeCommand.ts:21-23`)
- Shell variables `$VAR`/`${VAR}` (shell-quote drops them — `bashPipeCommand.ts:30-32`)
- Bash control structures `for/while/until/if/case/select` (`bashPipeCommand.ts:37-39`)
- Bare newlines (separator differential — `bashPipeCommand.ts:51-53`, citing #32515)
- shell-quote single-quote bug (`bashPipeCommand.ts:60-62`)
- `hasMalformedTokens` (`bashPipeCommand.ts:82-84`)

`singleQuoteForEval` (`bashPipeCommand.ts:273-275`) uses `'"'"'` escape pattern instead of shell-quote's `quote()` because the latter switches to double-quote mode and corrupts `!` in jq filters (`select(.x != .y)` → `select(.x \!= .y)`).

---

## 9. `ShellSnapshot.ts` — env capture

Not a parser. Captures the user's shell environment (functions, options, aliases) into a sourceable file (`~/.claude/shell-snapshots/snapshot-{shell}-{ts}-{rand}.sh`) so subsequent BashTool subshells see the same alias resolution as an interactive shell.

Key trick: **embedded ripgrep/find/grep dispatch via `ARGV0`**. `createArgv0ShellFunction` at `ShellSnapshot.ts:35-59` wraps `bun`'s ARGV0-based tool dispatch. The `bun` binary embeds `rg` (ripgrep), `bfs` (find replacement), and `ugrep` (grep replacement); checks its argv[0] to decide which to run. The shell function uses `exec -a NAME path` (or `ARGV0=NAME path` on Windows/zsh) to set argv[0]. Result: faster, gitignore-respecting `find` and `grep` available in BashTool shells without depending on user PATH.

`getUserSnapshotContent` (`ShellSnapshot.ts:197-263`) handles bash and zsh function-listing differently. Bash: declare functions, base64-encode (preserves special chars), eval-decode. Zsh: `typeset +f`. Filters single-underscore-prefix completion functions.

`createAndSaveSnapshot` (`ShellSnapshot.ts:413-582`) executes the snapshot script with `execFile(binShell, ['-c', '-l', script], ...)`. 10s timeout. Non-snapshots-failed builds simply don't get user aliases.

---

## 10. `prefix.ts` — static prefix extractor

`getCommandPrefixStatic` (`prefix.ts:28-70`): given `git commit -m "foo"`, returns `git commit`. Used to match against permission rules like `Bash(git commit:*)`.

Logic:

1. Parse via `parseCommand` (`prefix.ts:35`). If `command.commandNode` is null (e.g., bare assignment), return `commandPrefix: null`.
2. Look up Fig spec via `getCommandSpec` (`prefix.ts:48`).
3. If wrapper command (e.g., `nice cmd`, `timeout 5 cmd`) — recurse on the wrapped command (`prefix.ts:54-58, 72-121`).
4. Otherwise call `buildPrefix(cmd, args, spec)` from sibling module `shell/specPrefix.ts`.
5. Re-attach env vars: `FOO=bar git commit` → `FOO=bar git commit`.

Wrapper recursion bounded at depth 10 / wrapperCount 2 (`prefix.ts:33`) to prevent runaway parsing.

`getCompoundCommandPrefixesStatic` (`prefix.ts:135-175`): for `git fetch && git worktree add`, returns `['git']` (LCP). For `git status; cat foo`, returns `['git status', 'cat']`. Used to suggest unified deny rules.

---

## 11. `shellCompletion.ts` — bash/zsh tab-completion

Out of scope for security but uses the parser to determine completion context. `parseInputContext` at `shellCompletion.ts:80-137` decides command vs file vs variable completion based on cursor position and operator preceding. Then dispatches to `getBashCompletionCommand` or `getZshCompletionCommand` which builds a `compgen`/`parameters[]` lookup.

**Anti-injection note** at `shellCompletion.ts:152-153`: bash file completion uses `while IFS= read -r f; do ...; done` instead of `for f in $(...)` because filenames can contain newlines and word-splitting would inject. zsh equivalent at `shellCompletion.ts:174` uses native glob with `(N[1,N])` qualifier.

---

## 12. `specs/*.ts` — Fig command specs

Seven hand-authored specs:

- `pyright` — full option/arg list
- `timeout` — duration + isCommand wrapped command
- `sleep` — duration only
- `alias` — variadic name=value pairs
- `nohup` — isCommand wrapped command
- `time` — isCommand wrapped command
- `srun` — SLURM wrapper with `-n`/`-N` options + isCommand command

`registry.ts:30-43` falls back to dynamic `@withfig/autocomplete/build/{cmd}.js` import for any command not in this static list. Path-traversal hardened (`registry.ts:33-35`): rejects `/`, `\`, `..`, `-` prefix.

---

## Cross-references

### To `BashTool/` (separate agent)

This directory has **no imports from `tools/BashTool/`**. The dependency goes the other way — `BashTool` imports `parseForSecurity` from `ast.ts`, `getCommandPrefixStatic` from `prefix.ts`, `ParsedCommand.parse` from `ParsedCommand.ts`, and `quoteShellCommand` / `rearrangePipeCommand` for command construction. Permission classification (allow/deny/ask) lives in `tools/BashTool/bashPermissions.ts` per inventory; this directory only produces the inputs that classifier reads.

The `BashTool` shell IS bash/zsh — there is **no PowerShell support anywhere in this directory**. Searches for `PowerShell|powershell|pwsh|cmd\.exe` returned zero hits. Windows path support exists only via Git Bash semantics — `shellQuoting.ts:107-128` rewrites `>nul` (CMD-style) to `/dev/null` to defeat agent hallucinations of CMD syntax in a bash shell.

### To sandbox / network egress / background tracking

Searches for `bwrap|seatbelt|landlock|/proc/self/root|sandbox|network|egress|fetch|run_in_background` in this directory returned **zero hits relevant to sandbox primitives**. The two `/proc/` references are in `ast.ts` (the `PROC_ENVIRON_RE` check at `ast.ts:2197`) — unrelated to sandbox bypass. The `auto-mode bubblewrap bypass` documented in orientation §F.6 (`/proc/self/root/usr/bin/npx`) is **not defended against here** because:

1. This directory operates at the static argv layer. `argv[0] = '/proc/self/root/usr/bin/npx'` would be classified by the permission system as an unusual binary path; whether to allow is a permission-rule decision.
2. The bubblewrap bypass is a **filesystem-namespace trick**, not a parser trick. Once npx runs (even from `/proc/self/root/...`), the OS-level sandbox is gone. That's a kernel/LSM problem, not a parsing problem.

### To OAuth / browser / file ops

None. This module is a pure command-string analyzer.

---

## Top 7 findings (for our cli sandbox.rs + bash tool)

1. **`apps/cli/src/sandbox.rs` cannot replicate this defense layer with regex.** Anthropic ship a 4,436-LOC pure-TS bash parser specifically to avoid the parser-differential attacks at the boundary between regex/shell-quote and bash. If our sandbox classifies bash commands by string matching (not AST), every entry in `ast.ts:254-314` (control chars, Unicode whitespace, `\<space>`, zsh `~[`, zsh `=cmd`, brace+quote) is a free bypass.

2. **`/proc/*/environ` is the only secret-exfiltration vector caught at this layer** (`ast.ts:2197, 2658-2675`). Notably absent: AWS metadata (`169.254.169.254`), GCP metadata (`metadata.google.internal`), `/var/run/secrets`, `~/.ssh/`, `~/.aws/`. Path-based secret exfil is presumably caught by `pathValidation.ts` (separate module) — confirm.

3. **`EVAL_LIKE_BUILTINS` (22 entries) is the canonical block-list for argv-bypassing builtins** (`ast.ts:2086-2134`). Our CLI must mirror this AT MINIMUM: `eval`, `source`, `.`, `exec`, `command` (gated), `builtin`, `fc` (gated), `coproc`, `noglob`, `nocorrect`, `trap`, `enable`, `mapfile`, `readarray`, `hash`, `bind`, `complete`, `compgen` (gated), `alias`, `let`. Plus the 18 zsh builtins in `ZSH_DANGEROUS_BUILTINS` (`ast.ts:2060-2078`).

4. **Wrapper command unwrapping is non-trivial and a prior CVE source.** `checkSemantics` at `ast.ts:2213-2384` peels off `time`, `nohup`, `timeout DUR`, `nice -n N`, `env`, `stdbuf` — including fail-closed handling of `timeout -k 5 10 eval ...` (which previously broke out and ran eval unchecked). Any sandbox that accepts user commands through bash MUST do this unwrapping before applying allowlists.

5. **`for VAR in WORDS` always treats VAR as unknown** (`ast.ts:697-708`). Our CLI must **never** trust the iteration words even when they look static. Glob/path/flag smuggling defenses depend on this.

6. **`while read VAR` requires defense-in-depth on prior literal value** (`ast.ts:861-872`). If `VAR=safe` was tracked literally and a conditional-branch `read VAR` could overwrite it with `VAR_PLACEHOLDER`, that's a path-traversal vector. The fix is: if a tracked literal would be overwritten by an unknown-value placeholder from a maybe-not-executed branch, fail closed.

7. **Pure-TS parser with timeout (50ms) + node budget (50K) IS the abort-handling pattern** for adversarial input. `parseCommandRaw` returns `null` for "module not loaded" (→ legacy fallback) but `PARSE_ABORTED` Symbol for "module loaded, parse failed" (→ too-complex). Conflating these was a real bypass: `(( a[0]... ))` triggers the timeout, and pre-fix the legacy path lacked `EVAL_LIKE_BUILTINS`, so `trap`/`enable`/`hash` leaked under `Bash(*)` allow. Documented at `parser.ts:88-94, 115-118`.

---

## Top 4 gaps for `apps/cli/src/sandbox.rs` + bash tool

1. **No shell-AST parser in our CLI.** Per FINAL_AUDIT, our `apps/cli/src/sandbox.rs:159` has Windows + Landlock as enum stubs (silent fallthrough). Beyond OS-sandbox stubs, we have **no equivalent to `parseForSecurity`** — meaning permission classification matches against literal command strings, which is the bypass-rich approach Anthropic explicitly engineered around. **Action:** port either `bashParser.ts` to Rust (significant engineering) or use a Rust-native bash parser (e.g., `tree-sitter-bash` Rust binding). Latter is faster path; matches Anthropic's now-deprecated tree-sitter-WASM dependency model.

2. **No `EVAL_LIKE_BUILTINS` / `ZSH_DANGEROUS_BUILTINS` block-list.** Our CLI presumably lets `eval`, `source`, `trap`, `enable`, `hash`, etc. through if `Bash(*)` is allowed. **Action:** add semantic check on argv[0] after wrapper unwrapping. Block 22 + 18 = 40 builtins by name. Mirror `EVAL_LIKE_BUILTINS` carve-outs (`command -v|-V`, `fc -l`, `compgen -c|-f|-v`).

3. **No `/proc/*/environ` defense.** Linux-specific but trivial. **Action:** add to permission classifier: scan argv and redirect targets for `/proc/.*/environ`. Optional: extend to known sensitive paths (`/etc/shadow`, `~/.ssh/`, `~/.aws/credentials`, AWS/GCP metadata IPs).

4. **No documented bash policy spec for our LLM-driven command-prefix extractor (if we have one).** `commands.ts:438-499` shows Anthropic's Haiku-classifier prompt. If our CLI uses an LLM for permission-rule prefix extraction (e.g., to decide that `git commit -m "foo"` matches `Bash(git commit:*)`), we need an equivalent prompt with the same injection examples. **Action:** if/when we ship an LLM-prefix extractor, lift this prompt verbatim (with attribution per OpenClaw/Anthropic licensing — already established in `THIRD_PARTY_LICENSES.md`).

**Bonus (not strictly a gap):** the `/proc/self/root/usr/bin/npx` bubblewrap bypass (orientation §F.6) is **kernel-level**, not parsing-level. Our `apps/cli/src/sandbox.rs` should treat any path resolving to `/proc/self/root/*` or containing `/proc/*/root/*` as suspicious AT THE SANDBOX LAYER (mount-namespace canonicalization), not the AST layer — since this directory shows Anthropic doesn't catch it either.

---

## Word count check

~4,400 words. ✓ within 3,500–5,000 target.

---

_Filed by deep-dive agent M7 — `src/utils/bash/` (16 files, 12,093 LOC). Cited file:line refs throughout. No emojis. Cross-refs to BashTool, sandbox.rs, and orientation §F maintained._
