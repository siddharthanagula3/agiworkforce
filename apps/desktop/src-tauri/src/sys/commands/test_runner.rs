//! Test Runner Integration
//!
//! Runs project tests (cargo test, pytest, jest/vitest, go test, rspec, …)
//! and returns structured results so the agent can:
//! - Identify which tests failed and why
//! - Iterate on fixes until tests pass
//! - Present a clear pass/fail summary to the user
//!
//! Mirrors the "run build → collect errors → auto-repair" loop described in
//! OpenCode's architecture. The agent calls `test_run`, receives structured
//! failures, fixes them, then calls `test_run` again.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};
use tracing::{debug, info, warn};

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/// A single test failure.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestFailure {
    /// Test name / path (e.g. "tests::unit::my_test", "test_foo.py::TestBar::test_baz").
    pub name: String,
    /// Short failure message or assertion error.
    pub message: String,
    /// Optional file path where the failure occurred.
    pub file: Option<String>,
    /// Optional line number.
    pub line: Option<usize>,
    /// Raw stdout/stderr excerpt for this failure.
    pub output: String,
}

/// Overall test run result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRunResult {
    /// Runner used (e.g. "cargo test", "pytest", "jest").
    pub runner: String,
    /// All tests passed.
    pub passed: bool,
    /// Number of tests that passed.
    pub pass_count: usize,
    /// Number of tests that failed.
    pub fail_count: usize,
    /// Number of tests skipped.
    pub skip_count: usize,
    /// Total wall-clock duration in milliseconds.
    pub duration_ms: u64,
    /// Structured failure details (empty when all pass).
    pub failures: Vec<TestFailure>,
    /// Raw combined stdout + stderr (trimmed to 64 KB).
    pub raw_output: String,
    /// Error message if the runner itself couldn't be started.
    pub error: Option<String>,
}

/// Which test runner to use.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TestRunner {
    /// Auto-detect from project files.
    Auto,
    Cargo,
    Pytest,
    Jest,
    Vitest,
    GoTest,
    Rspec,
    Mocha,
    Bun,
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const DEFAULT_TIMEOUT_SECS: u64 = 120;
const MAX_OUTPUT_BYTES: usize = 64 * 1024;

// ─────────────────────────────────────────────
// Auto-detection
// ─────────────────────────────────────────────

fn detect_runner(root: &Path) -> TestRunner {
    if root.join("Cargo.toml").exists() {
        return TestRunner::Cargo;
    }
    if root.join("go.mod").exists() {
        return TestRunner::GoTest;
    }
    // Check package.json scripts for test frameworks
    if root.join("package.json").exists() {
        if let Ok(content) = std::fs::read_to_string(root.join("package.json")) {
            if content.contains("\"vitest\"") {
                return TestRunner::Vitest;
            }
            if content.contains("\"jest\"") {
                return TestRunner::Jest;
            }
            if content.contains("\"mocha\"") {
                return TestRunner::Mocha;
            }
        }
        // Check if bun is installed and bun.lock exists
        if root.join("bun.lock").exists() || root.join("bun.lockb").exists() {
            if which::which("bun").is_ok() {
                return TestRunner::Bun;
            }
        }
    }
    if root.join("pyproject.toml").exists()
        || root.join("setup.py").exists()
        || root.join("pytest.ini").exists()
        || root.join("setup.cfg").exists()
    {
        return TestRunner::Pytest;
    }
    if root.join("Gemfile").exists() || root.join(".rspec").exists() {
        return TestRunner::Rspec;
    }
    TestRunner::Auto
}

// ─────────────────────────────────────────────
// Tauri command
// ─────────────────────────────────────────────

/// Run project tests and return structured pass/fail results.
///
/// The agent uses this to run tests, parse failures, fix them, and repeat.
///
/// # Arguments
/// * `project_root`  — Path to the project root. Defaults to cwd / project folder.
/// * `runner`        — Force a specific runner, or omit to auto-detect.
/// * `filter`        — Optional test name filter (e.g. "my_module::my_test").
/// * `timeout_secs`  — Timeout in seconds (default 120).
#[tauri::command]
pub async fn test_run(
    project_root: Option<String>,
    runner: Option<String>,
    filter: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<TestRunResult, String> {
    let root = resolve_root(project_root);
    let timeout = Duration::from_secs(timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS));

    let runner_enum = match runner.as_deref() {
        Some("cargo") => TestRunner::Cargo,
        Some("pytest") | Some("python") => TestRunner::Pytest,
        Some("jest") => TestRunner::Jest,
        Some("vitest") => TestRunner::Vitest,
        Some("go") | Some("go test") => TestRunner::GoTest,
        Some("rspec") => TestRunner::Rspec,
        Some("mocha") => TestRunner::Mocha,
        Some("bun") => TestRunner::Bun,
        _ => detect_runner(&root),
    };

    info!(
        "[test_run] runner={:?} root={:?} filter={:?} timeout={}s",
        runner_enum,
        root,
        filter,
        timeout.as_secs()
    );

    let result = tokio::task::spawn_blocking(move || {
        run_tests_blocking(&root, &runner_enum, filter.as_deref(), timeout)
    })
    .await
    .map_err(|e| format!("test_run task panicked: {}", e))?;

    Ok(result)
}

/// Detect which test runner would be used for a project.
#[tauri::command]
pub async fn test_detect_runner(project_root: Option<String>) -> Result<String, String> {
    let root = resolve_root(project_root);
    let runner = tokio::task::spawn_blocking(move || detect_runner(&root))
        .await
        .map_err(|e| format!("Detect task panicked: {}", e))?;
    Ok(format!("{:?}", runner).to_lowercase())
}

// ─────────────────────────────────────────────
// Runner implementations
// ─────────────────────────────────────────────

fn run_tests_blocking(
    root: &Path,
    runner: &TestRunner,
    filter: Option<&str>,
    timeout: Duration,
) -> TestRunResult {
    match runner {
        TestRunner::Cargo => run_cargo_test(root, filter, timeout),
        TestRunner::Pytest => run_pytest(root, filter, timeout),
        TestRunner::Jest => run_jest(root, filter, timeout, false),
        TestRunner::Vitest => run_vitest(root, filter, timeout),
        TestRunner::GoTest => run_go_test(root, filter, timeout),
        TestRunner::Rspec => run_rspec(root, filter, timeout),
        TestRunner::Mocha => run_jest(root, filter, timeout, true), // mocha shares similar output
        TestRunner::Bun => run_bun_test(root, filter, timeout),
        TestRunner::Auto => TestRunResult {
            runner: "auto".to_string(),
            passed: false,
            pass_count: 0,
            fail_count: 0,
            skip_count: 0,
            duration_ms: 0,
            failures: vec![],
            raw_output: String::new(),
            error: Some(
                "Could not detect a test runner. Ensure Cargo.toml, package.json, \
                 pyproject.toml, or go.mod exists in the project root."
                    .to_string(),
            ),
        },
    }
}

// ── Cargo Test ──────────────────────────────────────────────────────────────

fn run_cargo_test(root: &Path, filter: Option<&str>, timeout: Duration) -> TestRunResult {
    let mut args = vec!["test", "--color=never"];
    let filter_owned: String;
    if let Some(f) = filter {
        filter_owned = f.to_string();
        args.push("--");
        args.push(&filter_owned);
    }

    let start = Instant::now();
    let output = timed_command("cargo", &args, root, timeout);
    let elapsed = start.elapsed().as_millis() as u64;

    match output {
        Err(e) => runner_unavailable("cargo test", &e, elapsed),
        Ok(out) => {
            let raw = truncate_output(&out.raw);
            let passed = out.status_ok;

            // Parse cargo test output:
            // "test result: ok. N passed; M failed; K ignored"
            let mut pass_count = 0usize;
            let mut fail_count = 0usize;
            let mut skip_count = 0usize;

            for line in raw.lines() {
                if line.starts_with("test result:") {
                    pass_count = extract_count(line, "passed");
                    fail_count = extract_count(line, "failed");
                    skip_count = extract_count(line, "ignored");
                }
            }

            let failures = parse_cargo_failures(&raw);

            TestRunResult {
                runner: "cargo test".to_string(),
                passed,
                pass_count,
                fail_count,
                skip_count,
                duration_ms: elapsed,
                failures,
                raw_output: raw,
                error: if !passed && fail_count == 0 {
                    Some(out.raw.lines().last().unwrap_or("").to_string())
                } else {
                    None
                },
            }
        }
    }
}

fn parse_cargo_failures(raw: &str) -> Vec<TestFailure> {
    // Failures section looks like:
    // ---- tests::my_test stdout ----
    // thread 'tests::my_test' panicked at 'assertion failed: ...'
    let mut failures = Vec::new();
    let mut in_failure_section = false;
    let mut current_name = String::new();
    let mut current_lines: Vec<String> = Vec::new();

    for line in raw.lines() {
        if line.starts_with("---- ") && line.ends_with(" stdout ----") {
            // Save previous
            if !current_name.is_empty() {
                failures.push(build_cargo_failure(&current_name, &current_lines));
            }
            current_name = line
                .trim_start_matches("---- ")
                .trim_end_matches(" stdout ----")
                .to_string();
            current_lines.clear();
            in_failure_section = true;
        } else if in_failure_section {
            if line.starts_with("failures:") || line.starts_with("test result:") {
                if !current_name.is_empty() {
                    failures.push(build_cargo_failure(&current_name, &current_lines));
                    current_name.clear();
                    current_lines.clear();
                }
                in_failure_section = false;
            } else {
                current_lines.push(line.to_string());
            }
        }
    }

    // Catch trailing failure block
    if !current_name.is_empty() && !current_lines.is_empty() {
        failures.push(build_cargo_failure(&current_name, &current_lines));
    }

    failures
}

fn build_cargo_failure(name: &str, lines: &[String]) -> TestFailure {
    let output = lines.join("\n");
    // Extract file:line from "panicked at '...', src/lib.rs:42"
    let mut file = None;
    let mut line_num = None;
    let mut message = String::new();

    for l in lines {
        if l.contains("panicked at") {
            // Modern format: panicked at src/lib.rs:42
            if let Some(loc) = l.rsplit(',').next() {
                let loc = loc.trim();
                if let Some((f, ln)) = loc.rsplit_once(':') {
                    if let Ok(n) = ln.parse::<usize>() {
                        file = Some(f.to_string());
                        line_num = Some(n);
                    }
                }
            }
            // Extract message
            if let Some(start) = l.find("panicked at '") {
                if let Some(end) = l[start + 13..].find('\'') {
                    message = l[start + 13..start + 13 + end].to_string();
                }
            } else {
                message = l.clone();
            }
        }
        if l.contains("assertion") && message.is_empty() {
            message = l.trim().to_string();
        }
    }

    if message.is_empty() {
        message = output.lines().next().unwrap_or("(no message)").to_string();
    }

    TestFailure {
        name: name.to_string(),
        message,
        file,
        line: line_num,
        output,
    }
}

// ── pytest ───────────────────────────────────────────────────────────────────

fn run_pytest(root: &Path, filter: Option<&str>, timeout: Duration) -> TestRunResult {
    let mut args = vec!["-v", "--tb=short", "--no-header", "-q"];
    let filter_owned: String;
    if let Some(f) = filter {
        filter_owned = format!("-k {}", f);
        args.push(&filter_owned);
    }

    // Try python -m pytest first (more reliable in venvs), then pytest binary.
    let (cmd, full_args) = if which::which("python").is_ok() || which::which("python3").is_ok() {
        let py = if which::which("python3").is_ok() {
            "python3"
        } else {
            "python"
        };
        let mut a = vec!["-m", "pytest", "-v", "--tb=short", "--no-header", "-q"];
        if let Some(f) = filter {
            a.push("-k");
            a.push(f);
        }
        (py, a)
    } else {
        ("pytest", args)
    };

    let start = Instant::now();
    let output = timed_command(cmd, &full_args, root, timeout);
    let elapsed = start.elapsed().as_millis() as u64;

    match output {
        Err(e) => runner_unavailable("pytest", &e, elapsed),
        Ok(out) => {
            let raw = truncate_output(&out.raw);
            let passed = out.status_ok;

            let mut pass_count = 0;
            let mut fail_count = 0;
            let mut skip_count = 0;

            // "5 passed, 2 failed, 1 skipped"
            for line in raw.lines() {
                if line.contains(" passed") || line.contains(" failed") {
                    pass_count += extract_count(line, "passed");
                    fail_count += extract_count(line, "failed");
                    skip_count += extract_count(line, "skipped");
                }
            }

            let failures = parse_pytest_failures(&raw);

            TestRunResult {
                runner: "pytest".to_string(),
                passed,
                pass_count,
                fail_count,
                skip_count,
                duration_ms: elapsed,
                failures,
                raw_output: raw,
                error: None,
            }
        }
    }
}

fn parse_pytest_failures(raw: &str) -> Vec<TestFailure> {
    // pytest short TB format:
    // FAILED tests/test_foo.py::TestBar::test_baz - AssertionError: ...
    let mut failures = Vec::new();

    for line in raw.lines() {
        if line.starts_with("FAILED ") {
            let rest = &line["FAILED ".len()..];
            if let Some((loc, msg)) = rest.split_once(" - ") {
                let (file, name) = if let Some((f, n)) = loc.split_once("::") {
                    (Some(f.to_string()), loc.to_string())
                } else {
                    (None, loc.to_string())
                };
                failures.push(TestFailure {
                    name,
                    message: msg.to_string(),
                    file,
                    line: None,
                    output: line.to_string(),
                });
            }
        }
    }

    failures
}

// ── Jest ─────────────────────────────────────────────────────────────────────

fn run_jest(root: &Path, filter: Option<&str>, timeout: Duration, mocha: bool) -> TestRunResult {
    let runner_name = if mocha { "mocha" } else { "jest" };

    // Prefer local binary
    let bin = {
        let local = root
            .join("node_modules/.bin")
            .join(runner_name)
            .to_string_lossy()
            .to_string();
        if PathBuf::from(&local).exists() {
            local
        } else {
            runner_name.to_string()
        }
    };

    let mut args: Vec<String> = if mocha {
        vec!["--reporter=spec".to_string()]
    } else {
        vec!["--no-coverage".to_string(), "--ci".to_string()]
    };

    if let Some(f) = filter {
        if mocha {
            args.push("--grep".to_string());
            args.push(f.to_string());
        } else {
            args.push("-t".to_string());
            args.push(f.to_string());
        }
    }

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let start = Instant::now();
    let output = timed_command(&bin, &arg_refs, root, timeout);
    let elapsed = start.elapsed().as_millis() as u64;

    match output {
        Err(e) => runner_unavailable(runner_name, &e, elapsed),
        Ok(out) => {
            let raw = truncate_output(&out.raw);
            let passed = out.status_ok;

            // "Tests: 2 failed, 5 passed, 7 total"
            let mut pass_count = 0;
            let mut fail_count = 0;
            let mut skip_count = 0;
            for line in raw.lines() {
                if line.trim_start().starts_with("Tests:") {
                    pass_count = extract_count(line, "passed");
                    fail_count = extract_count(line, "failed");
                    skip_count = extract_count(line, "skipped");
                }
            }

            let failures = parse_jest_failures(&raw);

            TestRunResult {
                runner: runner_name.to_string(),
                passed,
                pass_count,
                fail_count,
                skip_count,
                duration_ms: elapsed,
                failures,
                raw_output: raw,
                error: None,
            }
        }
    }
}

fn parse_jest_failures(raw: &str) -> Vec<TestFailure> {
    // Jest output: "● MyTest › should do foo"
    let mut failures = Vec::new();
    let mut capture = false;
    let mut current_name = String::new();
    let mut current_msg = Vec::new();

    for line in raw.lines() {
        if line.starts_with("  ●") {
            if !current_name.is_empty() {
                failures.push(TestFailure {
                    name: current_name.clone(),
                    message: current_msg.join(" ").trim().to_string(),
                    file: None,
                    line: None,
                    output: current_msg.join("\n"),
                });
                current_msg.clear();
            }
            current_name = line.trim_start_matches("  ● ").to_string();
            capture = true;
        } else if capture {
            if line.trim().is_empty() && !current_msg.is_empty() {
                // end of message block
            } else if line.starts_with("    ") {
                current_msg.push(line.trim().to_string());
            } else {
                capture = false;
            }
        }
    }

    if !current_name.is_empty() {
        failures.push(TestFailure {
            name: current_name,
            message: current_msg.join(" ").trim().to_string(),
            file: None,
            line: None,
            output: current_msg.join("\n"),
        });
    }

    failures
}

// ── Vitest ───────────────────────────────────────────────────────────────────

fn run_vitest(root: &Path, filter: Option<&str>, timeout: Duration) -> TestRunResult {
    let bin = {
        let local = root
            .join("node_modules/.bin/vitest")
            .to_string_lossy()
            .to_string();
        if PathBuf::from(&local).exists() {
            local
        } else {
            "vitest".to_string()
        }
    };

    let mut args: Vec<String> = vec!["run".to_string(), "--reporter=verbose".to_string()];
    if let Some(f) = filter {
        args.push("-t".to_string());
        args.push(f.to_string());
    }

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let start = Instant::now();
    let output = timed_command(&bin, &arg_refs, root, timeout);
    let elapsed = start.elapsed().as_millis() as u64;

    match output {
        Err(e) => runner_unavailable("vitest", &e, elapsed),
        Ok(out) => {
            let raw = truncate_output(&out.raw);
            let passed = out.status_ok;
            let failures = parse_jest_failures(&raw); // vitest shares jest format
            let pass_count = extract_count(&raw, "passed");
            let fail_count = extract_count(&raw, "failed");

            TestRunResult {
                runner: "vitest".to_string(),
                passed,
                pass_count,
                fail_count,
                skip_count: 0,
                duration_ms: elapsed,
                failures,
                raw_output: raw,
                error: None,
            }
        }
    }
}

// ── Go Test ──────────────────────────────────────────────────────────────────

fn run_go_test(root: &Path, filter: Option<&str>, timeout: Duration) -> TestRunResult {
    let mut args: Vec<String> = vec!["test".to_string(), "-v".to_string(), "./...".to_string()];
    if let Some(f) = filter {
        args.push("-run".to_string());
        args.push(f.to_string());
    }

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let start = Instant::now();
    let output = timed_command("go", &arg_refs, root, timeout);
    let elapsed = start.elapsed().as_millis() as u64;

    match output {
        Err(e) => runner_unavailable("go test", &e, elapsed),
        Ok(out) => {
            let raw = truncate_output(&out.raw);
            let passed = out.status_ok;

            let pass_count = raw.lines().filter(|l| l.starts_with("--- PASS")).count();
            let fail_count = raw.lines().filter(|l| l.starts_with("--- FAIL")).count();

            let failures: Vec<TestFailure> = raw
                .lines()
                .filter(|l| l.starts_with("--- FAIL"))
                .map(|l| {
                    let name = l
                        .trim_start_matches("--- FAIL: ")
                        .split_whitespace()
                        .next()
                        .unwrap_or(l)
                        .to_string();
                    TestFailure {
                        name,
                        message: l.to_string(),
                        file: None,
                        line: None,
                        output: l.to_string(),
                    }
                })
                .collect();

            TestRunResult {
                runner: "go test".to_string(),
                passed,
                pass_count,
                fail_count,
                skip_count: raw.lines().filter(|l| l.starts_with("--- SKIP")).count(),
                duration_ms: elapsed,
                failures,
                raw_output: raw,
                error: None,
            }
        }
    }
}

// ── RSpec ─────────────────────────────────────────────────────────────────────

fn run_rspec(root: &Path, filter: Option<&str>, timeout: Duration) -> TestRunResult {
    let mut args: Vec<String> = vec!["--format=progress".to_string()];
    if let Some(f) = filter {
        args.push("--example".to_string());
        args.push(f.to_string());
    }

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let start = Instant::now();
    let output = timed_command("rspec", &arg_refs, root, timeout);
    let elapsed = start.elapsed().as_millis() as u64;

    match output {
        Err(e) => runner_unavailable("rspec", &e, elapsed),
        Ok(out) => {
            let raw = truncate_output(&out.raw);
            let passed = out.status_ok;
            let pass_count = extract_count(&raw, "example");
            let fail_count = extract_count(&raw, "failure");

            TestRunResult {
                runner: "rspec".to_string(),
                passed,
                pass_count,
                fail_count,
                skip_count: extract_count(&raw, "pending"),
                duration_ms: elapsed,
                failures: vec![],
                raw_output: raw,
                error: None,
            }
        }
    }
}

// ── Bun Test ─────────────────────────────────────────────────────────────────

fn run_bun_test(root: &Path, filter: Option<&str>, timeout: Duration) -> TestRunResult {
    let mut args: Vec<String> = vec!["test".to_string()];
    if let Some(f) = filter {
        args.push("--test-name-pattern".to_string());
        args.push(f.to_string());
    }

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let start = Instant::now();
    let output = timed_command("bun", &arg_refs, root, timeout);
    let elapsed = start.elapsed().as_millis() as u64;

    match output {
        Err(e) => runner_unavailable("bun test", &e, elapsed),
        Ok(out) => {
            let raw = truncate_output(&out.raw);
            let passed = out.status_ok;
            let pass_count = extract_count(&raw, "pass");
            let fail_count = extract_count(&raw, "fail");

            TestRunResult {
                runner: "bun test".to_string(),
                passed,
                pass_count,
                fail_count,
                skip_count: extract_count(&raw, "skip"),
                duration_ms: elapsed,
                failures: parse_jest_failures(&raw),
                raw_output: raw,
                error: None,
            }
        }
    }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

struct CommandOutput {
    raw: String,
    status_ok: bool,
}

fn timed_command(
    cmd: &str,
    args: &[&str],
    cwd: &Path,
    timeout: Duration,
) -> Result<CommandOutput, String> {
    if which::which(cmd).is_err() {
        return Err(format!(
            "'{}' not found in PATH. Install it to run tests.",
            cmd
        ));
    }

    debug!(
        "[test_runner] running: {} {:?} in {:?}",
        cmd, args, cwd
    );

    // We use std::process::Command (blocking). The calling function already
    // runs inside spawn_blocking so this is fine.
    let output = Command::new(cmd)
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to spawn '{}': {}", cmd, e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let raw = format!("{}\n{}", stdout, stderr);

    Ok(CommandOutput {
        raw,
        status_ok: output.status.success(),
    })
}

fn runner_unavailable(runner: &str, error: &str, elapsed: u64) -> TestRunResult {
    warn!("[test_runner] runner '{}' unavailable: {}", runner, error);
    TestRunResult {
        runner: runner.to_string(),
        passed: false,
        pass_count: 0,
        fail_count: 0,
        skip_count: 0,
        duration_ms: elapsed,
        failures: vec![],
        raw_output: String::new(),
        error: Some(error.to_string()),
    }
}

fn truncate_output(raw: &str) -> String {
    if raw.len() > MAX_OUTPUT_BYTES {
        let truncated = &raw[..MAX_OUTPUT_BYTES];
        format!("{}\n\n[... output truncated at 64 KB]", truncated)
    } else {
        raw.to_string()
    }
}

/// Extract a count from a summary line like "5 passed, 2 failed".
fn extract_count(line: &str, keyword: &str) -> usize {
    let tokens: Vec<&str> = line.split_whitespace().collect();
    for (i, token) in tokens.iter().enumerate() {
        if token.starts_with(keyword) {
            if i > 0 {
                if let Ok(n) = tokens[i - 1].trim_matches(',').parse::<usize>() {
                    return n;
                }
            }
            // Also handle "keyword: N" style
            if let Some(rest) = token.strip_prefix(keyword) {
                if let Ok(n) = rest.trim_matches(':').trim().parse::<usize>() {
                    return n;
                }
            }
        }
    }
    0
}

fn resolve_root(root_hint: Option<String>) -> PathBuf {
    if let Some(r) = root_hint {
        let p = PathBuf::from(&r);
        if p.exists() && p.is_dir() {
            return p;
        }
    }
    if let Ok(proj) = std::env::var("AGI_PROJECT_FOLDER") {
        let p = PathBuf::from(&proj);
        if p.exists() && p.is_dir() {
            return p;
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}
