# Squad: rust-core

**Surface:** apps/cli + apps/desktop/src-tauri | **Subagent:** cli-engineer

## Baseline (cited from plan)

- `.unwrap()` in `apps/desktop/src-tauri`: 2,992 lines / 268 files
- `.unwrap()` in `apps/cli/src`: 883 lines / 73 files
- `unsafe { }` blocks in `apps/desktop/src-tauri`: 122 lines / 19 files
- `.cargo/audit.toml` has ~43 ignore entries with written justifications
- `Cargo.toml:24-29` comment notes `unwrap_used`/`expect_used` clippy lints intentionally NOT enabled (was ~2,409; now ~3,875 across CLI+Desktop)
- Workspace-wide clippy denies: `await_holding_lock`, `await_holding_invalid_type`, many manual-_ and needless-_ lints
- Workspace members: `apps/desktop/src-tauri`, `apps/cli`, `crates/*`
- `cargo check --workspace` is GREEN on this checkout

## Checker output (source of truth)

**Environment constraint:** This audit environment lacks system libraries required for full compilation (no `libasound2-dev`, `libgtk-3-dev`). The CI workflow (`ci.yml:39`) installs these via `apt-get`. Clippy cannot be run locally in this sandbox.

**CI gate confirms:** `cargo clippy -p agiworkforce-desktop -p agiworkforce-cli --lib -- -D warnings -D unsafe-code` runs as a required CI step (`ci.yml:190`). Both surfaces are in scope. A second `clippy-all-features` job (`ci.yml:338`) adds the OCR/local-llm/webrtc/sentry/whisper/devtools feature combinations. A macOS smoke job (`ci.yml:369`) runs `--workspace --lib` with the same flags.

**Known non-gate issue:** The main check job's Semgrep step (`ci.yml:111`) is `continue-on-error: true` with a comment acknowledging 41 pre-existing findings (child_process spawning, JWT secrets in test fixtures, dangerouslySetInnerHTML). This is not a Rust clippy issue but is a security gate gap.

**Test-target lints:** The CI comment at `ci.yml:332` explicitly notes "--lib (not --all-targets) matches the scope" and acknowledges a "36-error backlog" for `--all-targets` lint failures not currently gated. These are test-code lint violations, not production path issues.

## Findings

| #   | Severity | File:line                                                | Category                                                            | Checker-cited?       | Effort (hrs) | Note                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------- | -------------------------------------------------------- | ------------------------------------------------------------------- | -------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P0       | `apps/cli/src/agent/mod.rs:488`                          | Hardcoded model ID                                                  | No (blocked locally) | 0.5          | `"claude-haiku-4-5-20251001"` used as `.unwrap_or()` fallback for fast_mode in production path. Comment says "rule-models-json exception" but the string is not cross-referenced to `model_catalog::economy_default_model()`. If model is renamed in models.json this silently diverges.                                                                  |
| 2   | P1       | `apps/cli/src/daemon.rs:1007-1033`                       | Bare `.unwrap()` in production hot path                             | No                   | 1            | 12 `Regex::new(...).unwrap()` calls in the key-redaction function (production code, not tests). These run on every exec/chat log line. Regex patterns are compile-time literals so panics are impossible in practice, but the standard pattern (`LazyLock<Regex>`) would be cleaner and eliminate the `unwrap`.                                           |
| 3   | P1       | `apps/cli/src/tui/bottom_pane/textarea.rs:1287`          | `unwrap()` with `#[expect(clippy::unwrap_used)]` in production code | No                   | 0.5          | The `wrapped_lines()` method unconditionally unwraps `wrap_cache` after a guard ensures it is `Some`. The invariant is locally sound; the `#[expect]` annotation is correct usage. Minor: the `#[expect]` attribute silences clippy but means the linter cannot catch a regression if the guard is removed. Document the invariant with a SAFETY comment. |
| 4   | P1       | `apps/cli/src/init.rs:63`                                | Hardcoded model ID in config template                               | No                   | 0.5          | `# fast_model = "claude-haiku-4-5-20251001"` written as a commented example in the generated `config.toml`. Not a runtime defect (it's a comment) but violates the spirit of the models-SSOT rule and will mislead users if the model ID changes. Should derive from `model_catalog::economy_default_model()` at init time.                               |
| 5   | P1       | `apps/desktop/src-tauri` → Semgrep gate                  | Security audit advisory-only                                        | No                   | 8            | CI Semgrep is `continue-on-error: true` with 41 pre-existing findings. The comment (`ci.yml:100-110`) acknowledges `child_process` spawning, JWT secrets in test fixtures, and `dangerouslySetInnerHTML`. These need a drive-to-zero pass before Semgrep can block.                                                                                       |
| 6   | P2       | `apps/cli/src/tui/wrapping.rs:50,85`                     | `unsafe` pointer arithmetic without SAFETY comment                  | No                   | 0.5          | `slice.as_ptr().offset_from(text.as_ptr())` relies on both pointers being into the same allocation (guaranteed by `textwrap::wrap` returning `Cow::Borrowed` slices of the input). No SAFETY comment explains this invariant.                                                                                                                             |
| 7   | P2       | `apps/desktop/src-tauri/src/core/agi/sandbox.rs:536,546` | `unsafe` libc kills without SAFETY comment                          | No                   | 0.5          | `libc::kill(pid, 0)` probe + `libc::kill(pid, SIGKILL)` are preceded by inline comment explaining PID-reuse guard, but no formal `// SAFETY:` block. Low risk; the guard is correct.                                                                                                                                                                      |
| 8   | P3       | All test files                                           | `--all-targets` clippy 36-error backlog                             | No (test scope)      | 8            | CI gates `--lib` only. The 36 test-target errors are acknowledged but untracked. Enabling `--all-targets` would catch test-code quality regressions before they proliferate.                                                                                                                                                                              |

## Top unwrap hotspots (top 20 only)

**Methodology note:** The `.unwrap()` counts from `rg -c` include `unwrap_or*` variants. Bare `.unwrap()` counts below use filtered counts. The vast majority of high-count files are either dedicated test files (`tests/`, `*_tests.rs`) or have their `#[cfg(test)]` section contain all or nearly all of the unwraps.

| Rank | File                                                                        | Total `.unwrap*` | Bare `.unwrap()` (prod)       | Hot path?            | Recommendation |
| ---- | --------------------------------------------------------------------------- | ---------------- | ----------------------------- | -------------------- | -------------- |
| 1    | `apps/cli/src/context.rs`                                                   | 69               | 0 (all in tests at L451)      | Cold                 | No action      |
| 2    | `apps/cli/src/sync.rs`                                                      | 62               | 0 (all in tests at L445)      | Cold                 | No action      |
| 3    | `apps/cli/src/tui/chatwidget/tests.rs`                                      | 45               | 45 (dedicated test file)      | Cold                 | No action      |
| 4    | `apps/cli/src/config.rs`                                                    | 45               | 0 (all in tests at L609)      | Cold                 | No action      |
| 5    | `apps/cli/src/subagent_v2.rs`                                               | 46               | 0 (all in cfg(test) blocks)   | Cold                 | No action      |
| 6    | `apps/cli/src/message_queue.rs`                                             | 32               | 0 (all in tests at L322)      | Cold                 | No action      |
| 7    | `apps/cli/src/features/exec/tools/mod.rs`                                   | 28               | 0 (all in tests at L297)      | Cold                 | No action      |
| 8    | `apps/cli/src/tui/resume_picker.rs`                                         | 24               | 0 (all in tests at L1379)     | Cold                 | No action      |
| 9    | `apps/cli/src/tui/bottom_pane/textarea.rs`                                  | 24               | 1 (L1287, suppressed)         | Warm (render)        | See Finding #3 |
| 10   | `apps/cli/src/sessions.rs`                                                  | 23               | 0 (all in tests at L770)      | Cold                 | No action      |
| 11   | `apps/cli/src/project_registry.rs`                                          | 27               | 0 (all in tests at L138)      | Cold                 | No action      |
| 12   | `apps/cli/src/notebook_edit.rs`                                             | 25               | 0 (all in tests at L174)      | Cold                 | No action      |
| 13   | `apps/cli/src/platform/runtime/session_control.rs`                          | 21               | 0 (all in tests at L336)      | Cold                 | No action      |
| 14   | `apps/cli/src/auth.rs`                                                      | 26               | 0 (all in tests at L1013)     | Cold                 | No action      |
| 15   | `apps/cli/src/daemon.rs`                                                    | 26               | 12 (L1007–1033, static Regex) | Warm (exec/log path) | See Finding #2 |
| 16   | `apps/desktop/src-tauri/src/core/scheduler/tests.rs`                        | 123              | 123 (dedicated test file)     | Cold                 | No action      |
| 17   | `apps/desktop/src-tauri/src/core/agi/executors/tests/git_executor_tests.rs` | 114              | 114 (dedicated test file)     | Cold                 | No action      |
| 18   | `apps/desktop/src-tauri/src/core/scheduler/nlp_parser.rs`                   | 78               | 0 (all in tests at L609)      | Cold                 | No action      |
| 19   | `apps/desktop/src-tauri/src/data/db/migrations.rs`                          | 61               | 0 (all in tests at L5360)     | Cold (init only)     | No action      |
| 20   | `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`      | 55               | 0 (all in tests at L1795)     | Cold                 | No action      |

**Summary:** The majority of the ~3,875 unwrap instances are in test modules. Estimated production bare `.unwrap()` (non-`_or`/`_else`/`_default`) in CLI: ~25 total, almost all either static regex compilation or annotated with `#[expect]`. Desktop production bare `.unwrap()` count is similarly low with the bulk in dedicated test files.

## Unsafe block audit (all ~120 production instances)

Total non-comment `unsafe { }` blocks: 120 desktop + 16 CLI = 136. The baseline figure of 122 appears to be a line-count from `rg -c` which includes comment occurrences; actual production block count is ~136 including inline comments within blocks.

**Desktop (120 blocks across 17 files):**

| File                                        | Blocks | Category                                                                         | Justified?                                                                                                        |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `automation/uia/actions.rs`                 | 26     | Windows UI Automation COM FFI                                                    | Yes — `#![allow(unsafe_code)]` with file-level SAFETY note, Windows COM pattern                                   |
| `automation/uia/inspector_impl.rs`          | 21     | Windows UI Automation COM FFI                                                    | Yes — same pattern                                                                                                |
| `automation/mac/service.rs`                 | 21     | macOS Accessibility API (AXUIElement CFType FFI)                                 | Yes — `accessibility_sys` crate requires raw C pointers                                                           |
| `automation/uia/element_tree.rs`            | 17     | Windows UI Automation COM FFI                                                    | Yes                                                                                                               |
| `automation/uia/patterns.rs`                | 9      | Windows UI Automation COM FFI                                                    | Yes                                                                                                               |
| `automation/uia/mod.rs`                     | 5      | Windows UI Automation COM FFI                                                    | Yes                                                                                                               |
| `automation/computer_use/window_manager.rs` | 5      | Win32 `GetForegroundWindow`/`EnumWindows`                                        | Yes — Win32 callbacks require unsafe extern                                                                       |
| `sys/commands/system_permissions.rs`        | 3      | macOS `AXIsProcessTrusted`, `CGPreflightScreenCaptureAccess`, `IOHIDCheckAccess` | Yes — OS permission check syscalls                                                                                |
| `automation/screen/capture.rs`              | 3      | Win32 `EnumWindows`, `GetWindowRect`, `OpenClipboard`                            | Yes — Win32 window/clipboard capture                                                                              |
| `sys/power.rs`                              | 2      | Win32 `SetThreadExecutionState`                                                  | Yes — sleep prevention API                                                                                        |
| `core/agi/sandbox.rs`                       | 2      | `libc::kill` PID probe + SIGKILL                                                 | Yes — signal 0 probe for PID validity before kill; inline comment present but no formal SAFETY block (Finding #7) |
| `sys/commands/chat/agent_mode.rs`           | 1      | macOS `AXIsProcessTrusted`                                                       | Yes                                                                                                               |
| `lib.rs`                                    | 1      | macOS `AXIsProcessTrusted`                                                       | Yes                                                                                                               |
| `integrations/native_messaging/host.rs`     | 1      | Win32 `RegCreateKeyExW`                                                          | Yes — Chrome native messaging registry setup                                                                      |
| `automation/uia/wait.rs`                    | 1      | Windows UI Automation COM FFI                                                    | Yes                                                                                                               |
| `automation/input/mouse.rs`                 | 1      | Win32 `GetCursorPos`                                                             | Yes                                                                                                               |
| `automation/codegen.rs`                     | 1      | FALSE POSITIVE — `push_str("    unsafe {\n")` is a string, not a code block      | N/A — rg pattern match on string literal                                                                          |

**CLI (16 blocks across 6 files):**

| File                               | Blocks | Category                                                                                     | Justified?                                                                |
| ---------------------------------- | ------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `tui/tui.rs`                       | 5      | Win32 stdin flush (`FlushConsoleInputBuffer`, `GetLastError`), Linux `tcflush`               | Yes — crossterm terminal I/O                                              |
| `tui/external_editor.rs`           | 4      | `env::set_var`/`remove_var` (env mutation is unsafe in multithreaded context per Rust 1.81+) | Yes — test-only and single-threaded init; `#[cfg(test)]` blocks confirmed |
| `tui/notifications/mod.rs`         | 3      | Same `env::set_var`/`remove_var` pattern                                                     | Yes — test-only env manipulation                                          |
| `tui/wrapping.rs`                  | 2      | `ptr::offset_from` for computing slice byte offset within parent string                      | Partially — invariant is sound but lacks SAFETY comment (Finding #6)      |
| `tui/tui/job_control.rs`           | 1      | `libc::kill(0, SIGTSTP)` — send SIGTSTP to process group for Ctrl-Z                          | Yes — TTY job control                                                     |
| `platform/policy/linux_sandbox.rs` | 1      | `libc::prctl(PR_SET_NO_NEW_PRIVS)` — sandbox hardening syscall                               | Yes — required for bwrap integration                                      |

**Unjustified/flagged:** None. All blocks serve legitimate FFI, OS API, or signal-handling purposes. Two blocks lack formal SAFETY comments (Findings #6, #7) but are logically correct.

## .cargo/audit.toml re-validation

Audit ran by hand against the 37 unique RUSTSEC IDs (cargo-audit binary not installed in this environment; CI installs it at `ci.yml:161`).

| Group                                                          | IDs                                          | Justification status                                                                                                                                                                                     |
| -------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GTK3 bindings (10 IDs: 2024-0411..0420)                        | Unmaintained — Tauri Linux transitive        | **Still valid.** Tauri v2 on Linux depends on gtk-3; no GTK4 migration path available yet in Tauri stable.                                                                                               |
| `async-std` (RUSTSEC-2025-0052)                                | Discontinued — async-imap transitive         | **Still valid.** async-imap has no tokio-native replacement. Low user-facing impact (email integration only).                                                                                            |
| `bincode` (RUSTSEC-2025-0141)                                  | Unmaintained                                 | **Still valid.** bincode v1.x is widely used; migration to bincode v2 is tracked separately.                                                                                                             |
| `fxhash` (RUSTSEC-2025-0057)                                   | Unmaintained                                 | **Still valid.** Performance-only hash; no known exploitable vulnerability.                                                                                                                              |
| `instant` (RUSTSEC-2024-0384)                                  | Unmaintained                                 | **Still valid.** Replaced by `std::time::Instant` in new code; transitive from older deps.                                                                                                               |
| `paste` (RUSTSEC-2024-0436)                                    | Unmaintained                                 | **Still valid.** Proc-macro; no security surface.                                                                                                                                                        |
| `proc-macro-error` (RUSTSEC-2024-0370)                         | Unmaintained                                 | **Still valid.** Used transitively by older proc-macro deps.                                                                                                                                             |
| `rustls-pemfile` (RUSTSEC-2025-0134)                           | Unmaintained                                 | **Still valid.**                                                                                                                                                                                         |
| `serial` (RUSTSEC-2017-0008)                                   | Unmaintained                                 | **Stale but harmless.** This advisory is from 2017; the crate appears in no direct dependency. Consider removing if not in `cargo tree` output.                                                          |
| UNIC crates (5 IDs: 2025-0075/0080/0081/0098/0100)             | Unmaintained Unicode utilities               | **Still valid.** starlark-rs transitive.                                                                                                                                                                 |
| `lru` (RUSTSEC-2026-0002)                                      | Unsound IterMut — mysql_async                | **Still valid.** Only affects `IterMut`, not used directly.                                                                                                                                              |
| `rustls-webpki` 0.101.x (RUSTSEC-2026-0049)                    | CRL matching — Tauri transitive              | **Still valid.** Tauri pins 0.101.x; no patch available for that branch.                                                                                                                                 |
| RSA Marvin Attack (RUSTSEC-2023-0071)                          | mongodb/mysql_async transitive               | **Still valid.** Gated behind `remote-databases` optional feature (`Cargo.toml:271`), off by default. Direct code never calls `rsa::` in production paths (confirmed by grep).                           |
| hickory-proto (RUSTSEC-2026-0119, 0118)                        | O(n²) / unbounded loop — mongodb transitive  | **Still valid.** Same optional feature gate.                                                                                                                                                             |
| `rand` (RUSTSEC-2026-0097)                                     | Unsound from panic hook                      | **Still valid.** `rand::` is used in production (auth_oauth.rs, tooltips.rs, security modules) but never inside `panic::set_hook` closures (confirmed by grep). The triggering condition is unreachable. |
| `rustls-webpki` name constraints (RUSTSEC-2026-0098/0099/0104) | CRL panic / wildcard cert / URI constraints  | **Still valid.** Same Tauri transitive chain. All three are low-exploitability (require attacker-controlled CA or cert).                                                                                 |
| `core2` (RUSTSEC-2026-0105)                                    | All versions yanked — PDF parsing transitive | **Still valid.** rav1e → ravif → image chain. `[yanked] enabled = false` in audit.toml is appropriate.                                                                                                   |
| `derivative` (RUSTSEC-2024-0388)                               | Unmaintained derive macro                    | **Still valid.**                                                                                                                                                                                         |
| `number_prefix` (RUSTSEC-2025-0119)                            | Unmaintained — indicatif dep                 | **Still valid.**                                                                                                                                                                                         |
| `yaml-rust` (RUSTSEC-2024-0320)                                | Unmaintained                                 | **Still valid.** serde-yaml transitive.                                                                                                                                                                  |

**One removable entry:** `RUSTSEC-2017-0008` (serial crate, 2017) is a very old advisory. If `cargo tree -p agiworkforce-cli -p agiworkforce-desktop --duplicates | grep serial` returns nothing, this entry can be removed. Low priority.

## CI gate gap

**Finding:** Desktop backend IS covered by clippy in CI. The main `check` job at `ci.yml:190` runs:

```
cargo clippy -p agiworkforce-desktop -p agiworkforce-cli --lib -- -D warnings -D unsafe-code
```

Both surfaces are scoped. A second `clippy-all-features` job at `ci.yml:338` adds optional features for desktop. A macOS smoke job at `ci.yml:369` runs `--workspace --lib`. The baseline claim that desktop is "not currently in CI clippy gate" is **incorrect** — it is gated.

**Actual gap:** Test-target lints (`--all-targets`) are explicitly excluded from all three clippy CI steps. The CI comment (`ci.yml:332`) acknowledges a "36-error backlog" for test-target lints that pre-dates this audit. These are not security issues but are technical debt that could mask test-code quality regressions.

## Out-of-scope observations (flagged, not findings)

1. `cargo audit --deny warnings` runs in CI (`ci.yml:161`) which converts all RUSTSEC warnings (including the ~37 ignored ones) into errors. However the `.cargo/audit.toml` `[advisories] ignore = [...]` list exempts them before the `--deny warnings` flag evaluates. This is the correct pattern.

2. `model_catalog.rs` `legacy_bundled_models()` function contains hardcoded model IDs (e.g., `"claude-opus-4-7"`, `"gpt-5.4"` at lines 400–580). These are the offline fallback table compiled into the binary. The function is explicitly designated as the fallback when `models.json` fails to parse. This is architecturally sound — `SHARED_MODELS_JSON: &str = include_str!("../../../packages/types/src/models.json")` is the primary path; `legacy_bundled_models()` only fires if `serde_json::from_str` on the bundled JSON fails (startup-time panic guard). The hardcoded check-no-hardcoded-models.sh gate at `ci.yml:73` governs production routing code.

3. The `check-no-hardcoded-models.sh` script (`ci.yml:72-77`) covers both Rust (CLI + Tauri) for the rule-models-json enforcement. The agent/mod.rs fast-mode fallback (Finding #1) is documented with a "rule-models-json exception" comment; that exception should be formally tracked with a ticket.

4. `conversations.rs:730` contains `"claude-sonnet-4-20250514"` in a test fixture — a stale API model ID from pre-rebranding. Not a production defect but the fixture might cause a test to pass against a model that no longer exists.

## False-positive watchlist

- `automation/codegen.rs:220` — `rg` matches `push_str("    unsafe {\n")` as an unsafe block. It is a string literal used for code generation. Not a real unsafe block.
- `master_password.rs:38` — `rg` counts `// \`unsafe { ... }\`` in a comment explaining a refactoring. Not a real unsafe block.
- All `unwrap_or`, `unwrap_or_else`, `unwrap_or_default` in the 883/2,992 baseline line counts — the baseline uses `rg -c '\.unwrap()'` which includes these safe variants. Production bare `.unwrap()` count is substantially lower.
- `#[expect(clippy::unwrap_used)]` annotated sites (e.g., textarea.rs:1268) — these are reviewed and suppressed at the call site; they are not overlooked panics.
