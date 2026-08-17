//! Preflight diagnostics for `agi doctor`.
//!
//! This command is intentionally read-mostly: it validates configuration,
//! local tools, state directories, MCP/plugin shape, and git hygiene without
//! starting an LLM request or connecting to user MCP servers.

use anyhow::Result;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;

use crate::config::CliConfig;
use crate::mcp::{McpManager, McpTransport};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DoctorStatus {
    Pass,
    Warn,
    Fail,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct DoctorCheck {
    pub id: String,
    pub title: String,
    pub status: DoctorStatus,
    pub message: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub details: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DoctorSummary {
    pub overall: DoctorStatus,
    pub pass: usize,
    pub warn: usize,
    pub fail: usize,
    pub unknown: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct DoctorReport {
    pub version: String,
    pub generated_at: String,
    pub cwd: String,
    pub summary: DoctorSummary,
    pub checks: Vec<DoctorCheck>,
}

pub fn run_doctor(config: &CliConfig, json: bool) -> Result<()> {
    let report = collect_doctor_report(config);
    if json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        println!("{}", format_text_report(&report));
    }
    Ok(())
}

pub fn collect_doctor_report(config: &CliConfig) -> DoctorReport {
    let mut checks = Vec::new();
    checks.extend(runtime_dependency_checks());
    checks.extend(auth_checks());
    checks.extend(sandbox_checks());
    checks.extend(state_dir_checks());
    checks.extend(mcp_checks());
    checks.extend(plugin_checks());
    checks.extend(model_access_checks(config));
    checks.extend(transport_health_checks(config));
    checks.extend(git_hygiene_checks());

    let cwd = std::env::current_dir()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|err| format!("unavailable: {err}"));

    DoctorReport {
        version: env!("CARGO_PKG_VERSION").to_string(),
        generated_at: chrono::Utc::now().to_rfc3339(),
        cwd,
        summary: summarize_checks(&checks),
        checks,
    }
}

fn check(
    id: impl Into<String>,
    title: impl Into<String>,
    status: DoctorStatus,
    message: impl Into<String>,
    details: Vec<String>,
) -> DoctorCheck {
    DoctorCheck {
        id: id.into(),
        title: title.into(),
        status,
        message: message.into(),
        details,
    }
}

fn summarize_checks(checks: &[DoctorCheck]) -> DoctorSummary {
    let mut summary = DoctorSummary {
        overall: DoctorStatus::Pass,
        pass: 0,
        warn: 0,
        fail: 0,
        unknown: 0,
    };

    for item in checks {
        match item.status {
            DoctorStatus::Pass => summary.pass += 1,
            DoctorStatus::Warn => summary.warn += 1,
            DoctorStatus::Fail => summary.fail += 1,
            DoctorStatus::Unknown => summary.unknown += 1,
        }
    }

    summary.overall = if summary.fail > 0 {
        DoctorStatus::Fail
    } else if summary.warn > 0 {
        DoctorStatus::Warn
    } else if summary.unknown > 0 {
        DoctorStatus::Unknown
    } else {
        DoctorStatus::Pass
    };

    summary
}

pub fn format_text_report(report: &DoctorReport) -> String {
    let mut lines = vec![
        "AGI doctor".to_string(),
        format!("  version: {}", report.version),
        format!("  generated: {}", report.generated_at),
        format!("  cwd: {}", report.cwd),
        format!("  overall: {:?}", report.summary.overall),
        String::new(),
    ];

    for item in &report.checks {
        lines.push(format!(
            "[{:?}] {} - {}",
            item.status, item.title, item.message
        ));
        for detail in &item.details {
            lines.push(format!("  - {}", detail));
        }
    }

    lines.join("\n")
}

fn runtime_dependency_checks() -> Vec<DoctorCheck> {
    let mut checks = Vec::new();
    for (id, binary, required) in [
        ("runtime.git", "git", true),
        ("runtime.shell", "sh", true),
        ("runtime.rg", "rg", false),
        ("runtime.node", "node", false),
        ("runtime.cargo", "cargo", false),
    ] {
        let available = command_available(binary);
        let status = if available {
            DoctorStatus::Pass
        } else if required {
            DoctorStatus::Fail
        } else {
            DoctorStatus::Warn
        };
        let message = if available {
            format!("`{binary}` is available")
        } else if required {
            format!("required runtime `{binary}` is missing")
        } else {
            format!("optional runtime `{binary}` is missing")
        };
        checks.push(check(
            id,
            format!("runtime dependency: {binary}"),
            status,
            message,
            command_version(binary).into_iter().collect(),
        ));
    }
    checks
}

fn command_available(binary: &str) -> bool {
    if binary == "sh" {
        return StdCommand::new(binary)
            .arg("-c")
            .arg("true")
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
    }

    StdCommand::new(binary)
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn command_version(binary: &str) -> Option<String> {
    if binary == "sh" {
        return std::env::var("SHELL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .map(|value| format!("SHELL={value}"));
    }

    let output = StdCommand::new(binary).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let line = stdout
        .lines()
        .next()
        .or_else(|| stderr.lines().next())
        .unwrap_or_default()
        .trim();
    (!line.is_empty()).then(|| line.to_string())
}

fn auth_checks() -> Vec<DoctorCheck> {
    match crate::auth::auth_status() {
        Ok(statuses) => {
            if statuses.is_empty() {
                return vec![check(
                    "auth.providers",
                    "auth providers",
                    DoctorStatus::Warn,
                    "no provider auth entries found; Local models still work",
                    vec![
                        "run `agi login` or configure provider API-key environment variables"
                            .into(),
                    ],
                )];
            }

            let expired = statuses
                .iter()
                .filter(|entry| entry.status == "expired")
                .count();
            let insecure = statuses
                .iter()
                .filter(|entry| !entry.permissions_secure)
                .count();
            let status = if insecure > 0 {
                DoctorStatus::Fail
            } else if expired > 0 {
                DoctorStatus::Warn
            } else {
                DoctorStatus::Pass
            };
            let mut details = Vec::new();
            for entry in statuses {
                details.push(format!(
                    "{}: {} ({}){}",
                    entry.provider,
                    entry.status,
                    entry.auth_type,
                    entry
                        .expires_in
                        .as_ref()
                        .map(|value| format!(", {value}"))
                        .unwrap_or_default(),
                ));
            }
            vec![check(
                "auth.providers",
                "auth providers",
                status,
                format!("{expired} expired, {insecure} insecure permission entries"),
                details,
            )]
        }
        Err(err) => vec![check(
            "auth.providers",
            "auth providers",
            DoctorStatus::Fail,
            format!("failed to read auth status: {err}"),
            vec![],
        )],
    }
}

fn sandbox_checks() -> Vec<DoctorCheck> {
    let detected = crate::sandbox::SandboxType::detect();
    let details = vec![format!("detected executor sandbox: {}", detected.name())];

    #[cfg(target_os = "macos")]
    {
        let available = crate::platform::policy::macos_sandbox::is_available();
        vec![check(
            "sandbox.os",
            "OS sandbox",
            if available {
                DoctorStatus::Pass
            } else {
                DoctorStatus::Warn
            },
            if available {
                "macOS Seatbelt is available"
            } else {
                "sandbox-exec is unavailable; shell tools will need fallback policy"
            },
            details,
        )]
    }

    #[cfg(target_os = "linux")]
    {
        let mut details = details;
        details.push(format!(
            "in-process seccomp filter compiled in (never installed by exec): {}",
            crate::platform::policy::linux_sandbox::compile_bpf_available()
        ));
        // Only bubblewrap backs sandboxed exec on Linux. The seccomp module
        // installs no filter on any exec path, so its presence must never
        // upgrade this verdict.
        let missing = detected == crate::sandbox::SandboxType::None;
        vec![check(
            "sandbox.os",
            "OS sandbox",
            if missing {
                DoctorStatus::Warn
            } else {
                DoctorStatus::Pass
            },
            if missing {
                crate::sandbox::missing_sandbox_message("linux")
            } else {
                "Linux sandbox available via bubblewrap".to_string()
            },
            details,
        )]
    }

    #[cfg(target_os = "windows")]
    {
        let available = crate::platform::policy::windows_sandbox::is_available();
        vec![check(
            "sandbox.os",
            "OS sandbox",
            if available {
                DoctorStatus::Pass
            } else {
                DoctorStatus::Warn
            },
            "Windows AppContainer probe completed",
            details,
        )]
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        vec![check(
            "sandbox.os",
            "OS sandbox",
            DoctorStatus::Unknown,
            "no OS sandbox probe is implemented for this platform",
            details,
        )]
    }
}

fn state_dir_checks() -> Vec<DoctorCheck> {
    let mut checks = Vec::new();
    match CliConfig::config_dir() {
        Ok(config_dir) => {
            for (id, title, path) in [
                ("state.config", "config directory", config_dir.clone()),
                (
                    "state.managed_sessions",
                    "managed sessions directory",
                    config_dir.join(crate::runtime::session_control::MANAGED_SESSION_DIR_NAME),
                ),
                ("state.cache", "cache directory", config_dir.join("cache")),
                (
                    "state.daemon_logs",
                    "daemon logs directory",
                    config_dir.join("daemon-logs"),
                ),
            ] {
                checks.push(writable_path_check(id, title, &path));
            }
        }
        Err(err) => checks.push(check(
            "state.config",
            "config directory",
            DoctorStatus::Fail,
            format!("could not resolve config directory: {err}"),
            vec![],
        )),
    }
    checks
}

fn writable_path_check(id: &str, title: &str, path: &Path) -> DoctorCheck {
    let probe_dir = if path.exists() {
        path.to_path_buf()
    } else if let Some(parent) = path.parent() {
        parent.to_path_buf()
    } else {
        PathBuf::from(".")
    };
    let test_file = probe_dir.join(".agi-doctor-write-test");
    match std::fs::write(&test_file, b"ok").and_then(|_| std::fs::remove_file(&test_file)) {
        Ok(()) => check(
            id,
            title,
            DoctorStatus::Pass,
            format!("writable or creatable at {}", path.display()),
            vec![],
        ),
        Err(err) => check(
            id,
            title,
            DoctorStatus::Fail,
            format!("not writable at {}: {err}", probe_dir.display()),
            vec![],
        ),
    }
}

fn mcp_checks() -> Vec<DoctorCheck> {
    match McpManager::load_configs() {
        Ok(configs) => {
            let mut transport_counts: BTreeMap<&'static str, usize> = BTreeMap::new();
            let mut invalid = Vec::new();
            for (name, config) in &configs {
                match config.as_transport() {
                    McpTransport::Stdio { command, .. } => {
                        *transport_counts.entry("stdio").or_default() += 1;
                        if command.trim().is_empty() {
                            invalid.push(format!("{name}: stdio command is empty"));
                        }
                    }
                    McpTransport::Sse { url, .. } => {
                        *transport_counts.entry("sse").or_default() += 1;
                        if !is_http_url(&url) {
                            invalid.push(format!("{name}: invalid SSE URL `{url}`"));
                        }
                    }
                    McpTransport::Http { url, .. } => {
                        *transport_counts.entry("http").or_default() += 1;
                        if !is_http_url(&url) {
                            invalid.push(format!("{name}: invalid HTTP URL `{url}`"));
                        }
                    }
                }
            }
            let status = if invalid.is_empty() {
                DoctorStatus::Pass
            } else {
                DoctorStatus::Fail
            };
            let mut details: Vec<String> = transport_counts
                .iter()
                .map(|(transport, count)| format!("{transport}: {count}"))
                .collect();
            details.extend(invalid);
            vec![check(
                "mcp.config",
                "MCP configuration",
                status,
                format!("{} configured server(s)", configs.len()),
                details,
            )]
        }
        Err(err) => vec![check(
            "mcp.config",
            "MCP configuration",
            DoctorStatus::Fail,
            format!("failed to load MCP configuration: {err}"),
            vec![],
        )],
    }
}

fn plugin_checks() -> Vec<DoctorCheck> {
    let mut manager = crate::plugins::PluginsManager::new();
    match manager.load_all(std::env::current_dir().ok().as_deref()) {
        Ok(plugins) => {
            let project_local = plugins
                .iter()
                .filter(|plugin| plugin.from_project_dir)
                .count();
            let with_errors = plugins
                .iter()
                .filter(|plugin| plugin.error.is_some())
                .count();
            let status = if with_errors > 0 {
                DoctorStatus::Fail
            } else if project_local > 0 {
                DoctorStatus::Warn
            } else {
                DoctorStatus::Pass
            };
            let details = plugins
                .iter()
                .map(|plugin| {
                    format!(
                        "{} [{}] {}",
                        plugin.config_name,
                        plugin
                            .format
                            .map(|format| format.short_tag())
                            .unwrap_or("no-manifest"),
                        plugin.root.display()
                    )
                })
                .collect();
            vec![check(
                "plugins.load",
                "plugins",
                status,
                format!(
                    "{} loaded, {} project-local, {} with errors",
                    plugins.len(),
                    project_local,
                    with_errors
                ),
                details,
            )]
        }
        Err(err) => vec![check(
            "plugins.load",
            "plugins",
            DoctorStatus::Fail,
            format!("failed to load plugins: {err}"),
            vec![],
        )],
    }
}

fn model_access_checks(config: &CliConfig) -> Vec<DoctorCheck> {
    let model = &config.default.model;
    let configured_provider = &config.default.provider;
    let catalog_model = crate::provider::find_model(model);
    let inferred_provider = catalog_model
        .as_ref()
        .map(|entry| entry.provider.as_str())
        .or_else(|| crate::provider::provider_for_model(model));
    let provider = if configured_provider.is_empty() {
        inferred_provider.unwrap_or("unknown")
    } else {
        configured_provider.as_str()
    };

    let mut details = vec![format!("model: {model}"), format!("provider: {provider}")];
    let mut status = if catalog_model.is_some() {
        DoctorStatus::Pass
    } else {
        DoctorStatus::Warn
    };
    if catalog_model.is_none() {
        details.push(
            "model is not in the built-in catalog; custom provider routing may still work".into(),
        );
    }

    match config.providers.get(provider) {
        Some(provider_config) => {
            if let Some(env_name) = &provider_config.api_key_env {
                if std::env::var_os(env_name).is_some() {
                    details.push(format!("api key env `{env_name}` is set"));
                } else if crate::auth::load_auth()
                    .ok()
                    .and_then(|store| {
                        crate::models::provider_dispatch::api_key_from_auth_store(&store, provider)
                    })
                    .is_some()
                {
                    details.push(format!(
                        "api key env `{env_name}` is not set; the credential store has a saved {provider} API key"
                    ));
                } else {
                    status = DoctorStatus::Warn;
                    details.push(format!(
                        "api key env `{env_name}` is not set and the credential store has no {provider} API key"
                    ));
                }
            } else if provider_config.base_url.is_some() {
                details.push("provider has no API-key env requirement".into());
            } else {
                status = DoctorStatus::Warn;
                details.push("provider has no API-key env or base URL configured".into());
            }
        }
        None => {
            status = DoctorStatus::Warn;
            details.push("provider is not present in config providers map".into());
        }
    }

    vec![check(
        "model.default_access",
        "default model access",
        status,
        "checked catalog metadata and provider credential route",
        details,
    )]
}

fn transport_health_checks(config: &CliConfig) -> Vec<DoctorCheck> {
    let mut invalid = Vec::new();
    let mut configured_base_urls = 0usize;
    for (provider, provider_config) in &config.providers {
        if let Some(base_url) = &provider_config.base_url {
            configured_base_urls += 1;
            if !is_http_url(base_url) {
                invalid.push(format!("{provider}: invalid base URL `{base_url}`"));
            }
        }
    }

    let status = if invalid.is_empty() {
        DoctorStatus::Pass
    } else {
        DoctorStatus::Fail
    };
    let mut details = invalid;
    details.push("live network probes are intentionally skipped by doctor".into());
    vec![check(
        "transport.config",
        "transport configuration",
        status,
        format!("{configured_base_urls} provider base URL override(s) configured"),
        details,
    )]
}

fn is_http_url(value: &str) -> bool {
    let Ok(url) = value.parse::<reqwest::Url>() else {
        return false;
    };
    matches!(url.scheme(), "http" | "https") && url.host_str().is_some()
}

fn git_hygiene_checks() -> Vec<DoctorCheck> {
    if !git_is_repo() {
        return vec![check(
            "git.repository",
            "git repository",
            DoctorStatus::Unknown,
            "current directory is not inside a git worktree",
            vec![],
        )];
    }

    let current_branch = git_output(&["branch", "--show-current"]).unwrap_or_default();
    let branches = stale_branches(60).unwrap_or_default();
    let status = if branches.is_empty() {
        DoctorStatus::Pass
    } else {
        DoctorStatus::Warn
    };
    vec![check(
        "git.stale_branches",
        "stale branches",
        status,
        format!("{} branch(es) older than 60 days", branches.len()),
        {
            let mut details = vec![format!("current branch: {}", current_branch.trim())];
            details.extend(branches.into_iter().take(20));
            details
        },
    )]
}

fn git_is_repo() -> bool {
    git_output(&["rev-parse", "--is-inside-work-tree"])
        .map(|value| value.trim() == "true")
        .unwrap_or(false)
}

fn git_output(args: &[&str]) -> Option<String> {
    let output = StdCommand::new("git").args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).to_string())
}

fn stale_branches(days: i64) -> Option<Vec<String>> {
    let output = git_output(&[
        "for-each-ref",
        "--format=%(refname:short)|%(committerdate:unix)",
        "refs/heads",
    ])?;
    let now = chrono::Utc::now().timestamp();
    let cutoff_seconds = days * 24 * 60 * 60;
    let mut branches = Vec::new();
    for line in output.lines() {
        let Some((name, timestamp)) = line.split_once('|') else {
            continue;
        };
        if matches!(name, "main" | "master" | "develop" | "dev") {
            continue;
        }
        let Ok(timestamp) = timestamp.parse::<i64>() else {
            continue;
        };
        if now.saturating_sub(timestamp) > cutoff_seconds {
            branches.push(format!("{name}: older than {days} days"));
        }
    }
    branches.sort();
    Some(branches)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summary_prefers_fail_over_warn() {
        let checks = vec![
            check("a", "A", DoctorStatus::Pass, "ok", vec![]),
            check("b", "B", DoctorStatus::Warn, "warn", vec![]),
            check("c", "C", DoctorStatus::Fail, "fail", vec![]),
        ];
        let summary = summarize_checks(&checks);
        assert_eq!(summary.overall, DoctorStatus::Fail);
        assert_eq!(summary.pass, 1);
        assert_eq!(summary.warn, 1);
        assert_eq!(summary.fail, 1);
    }

    #[test]
    fn http_url_validation_requires_host() {
        assert!(is_http_url("https://api.openai.com/v1"));
        assert!(is_http_url("http://localhost:11434"));
        assert!(!is_http_url("file:///tmp/model.sock"));
        assert!(!is_http_url("not a url"));
    }

    #[test]
    fn text_report_formatter_is_reusable_by_slash_doctor() {
        let report = DoctorReport {
            version: "test".to_string(),
            generated_at: "2026-05-21T00:00:00Z".to_string(),
            cwd: "/tmp/project".to_string(),
            summary: DoctorSummary {
                overall: DoctorStatus::Warn,
                pass: 0,
                warn: 1,
                fail: 0,
                unknown: 0,
            },
            checks: vec![check(
                "runtime.rg",
                "runtime dependency: rg",
                DoctorStatus::Warn,
                "optional runtime `rg` is missing",
                vec!["install ripgrep for faster code search".to_string()],
            )],
        };

        let text = format_text_report(&report);

        assert!(text.contains("AGI doctor"));
        assert!(text.contains("overall: Warn"));
        assert!(text.contains("[Warn] runtime dependency: rg"));
        assert!(text.contains("install ripgrep"));
    }
}
