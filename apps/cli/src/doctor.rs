//! Preflight diagnostics for `agi doctor`.

use anyhow::Result;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;

use crate::config::CliConfig;
use crate::mcp::{McpManager, McpServerConfig, McpTransport};

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
    checks.push(config_file_check());
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

fn config_file_check() -> DoctorCheck {
    match CliConfig::config_path() {
        Ok(path) => config_file_check_at(&path),
        Err(err) => check(
            "config.file",
            "config file",
            DoctorStatus::Fail,
            format!("could not resolve the config file: {err:#}"),
            vec![],
        ),
    }
}

fn config_file_check_at(path: &Path) -> DoctorCheck {
    if !path.exists() {
        return check(
            "config.file",
            "config file",
            DoctorStatus::Pass,
            format!(
                "{} does not exist yet; built-in defaults apply",
                path.display()
            ),
            vec![],
        );
    }
    match CliConfig::load_from(path) {
        Ok(_) => check(
            "config.file",
            "config file",
            DoctorStatus::Pass,
            format!("{} loads", path.display()),
            vec![],
        ),
        Err(err) => check(
            "config.file",
            "config file",
            DoctorStatus::Fail,
            format!("{err:#}"),
            vec![format!(
                "agi runs on built-in defaults until {} is fixed or moved aside",
                path.display()
            )],
        ),
    }
}

fn runtime_dependency_checks() -> Vec<DoctorCheck> {
    let mut checks = Vec::new();
    for (id, binary, required, absent_note) in [
        ("runtime.git", "git", true, ""),
        ("runtime.shell", "sh", true, ""),
        ("runtime.rg", "rg", false, "file search falls back to grep"),
        (
            "runtime.node",
            "node",
            false,
            "only needed by tools that run on Node",
        ),
        (
            "runtime.cargo",
            "cargo",
            false,
            "only needed for Rust projects",
        ),
    ] {
        let available = command_available(binary);
        let status = runtime_dependency_status(available, required);
        let message = if available {
            format!("`{binary}` is available")
        } else if required {
            format!("required runtime `{binary}` is missing")
        } else {
            format!("optional runtime `{binary}` is not installed, {absent_note}")
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

fn runtime_dependency_status(available: bool, required: bool) -> DoctorStatus {
    if available || !required {
        DoctorStatus::Pass
    } else {
        DoctorStatus::Fail
    }
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
                    "{}: {} ({}){}, {}",
                    entry.provider,
                    entry.status,
                    entry.auth_type,
                    entry
                        .expires_in
                        .as_ref()
                        .map(|value| format!(", {value}"))
                        .unwrap_or_default(),
                    entry
                        .last_used
                        .as_deref()
                        .unwrap_or("never used since the trail began"),
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
                crate::sandbox::missing_sandbox_message("macos")
            } else {
                "macOS Seatbelt is available".to_string()
            },
            details,
        )]
    }

    #[cfg(target_os = "linux")]
    {
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

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        vec![check(
            "sandbox.os",
            "OS sandbox",
            DoctorStatus::Warn,
            crate::sandbox::missing_sandbox_message(std::env::consts::OS),
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
    let test_file = probe_dir.join(format!(".agi-doctor-write-test-{}", uuid::Uuid::new_v4()));
    let probe = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&test_file)
        .map(drop)
        .and_then(|()| std::fs::remove_file(&test_file));
    match probe {
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
    mcp_check_results(
        McpManager::load_configs(),
        McpManager::default_config_problems(None),
    )
}

fn mcp_check_results(
    loaded: Result<HashMap<String, McpServerConfig>>,
    load_problems: Vec<String>,
) -> Vec<DoctorCheck> {
    match loaded {
        Ok(configs) => {
            let mut transport_counts: BTreeMap<&'static str, usize> = BTreeMap::new();
            let mut invalid = load_problems;
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
    if crate::models::AccountRoute::load().runs_managed(model) {
        return vec![check(
            "model.default_access",
            "default model access",
            DoctorStatus::Pass,
            "uses your AGI plan",
            vec![
                format!("model: {model}"),
                format!(
                    "provider: {}",
                    crate::models::provider_name(&crate::models::Provider::ManagedCloud)
                ),
            ],
        )];
    }
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
    let layout = std::env::current_dir()
        .ok()
        .and_then(|cwd| crate::repo::detect_repository_layout(&cwd));
    let Some(layout) = layout else {
        return vec![check(
            "git.repository",
            "git repository",
            DoctorStatus::Unknown,
            "current directory is not inside a git worktree",
            vec![],
        )];
    };

    let mut checks = vec![repository_layout_check(&layout)];
    if layout.bare {
        return checks;
    }

    checks.push(stale_branches_check(
        &layout.head.to_string(),
        stale_branches(60),
    ));
    checks
}

fn stale_branches_check(current_branch: &str, branches: Option<Vec<String>>) -> DoctorCheck {
    let details = vec![format!("current branch: {current_branch}")];
    let Some(branches) = branches else {
        return check(
            "git.stale_branches",
            "stale branches",
            DoctorStatus::Unknown,
            "branch list could not be read",
            details,
        );
    };
    let status = if branches.is_empty() {
        DoctorStatus::Pass
    } else {
        DoctorStatus::Warn
    };
    let message = format!("{} branch(es) older than 60 days", branches.len());
    let mut details = details;
    details.extend(branches.into_iter().take(20));
    check(
        "git.stale_branches",
        "stale branches",
        status,
        message,
        details,
    )
}

/// The repository's shape as one check: a detached HEAD, a bare checkout, a
/// linked worktree or a repository nested inside another all change what a.
fn repository_layout_check(layout: &crate::repo::RepositoryLayout) -> DoctorCheck {
    let mut details = vec![
        format!("root: {}", layout.root.display()),
        format!("HEAD: {}", layout.head),
    ];
    if layout.linked_worktree {
        details.push(format!("common git dir: {}", layout.common_dir.display()));
    }
    if let Some(parent) = &layout.parent_root {
        details.push(format!("nested inside: {}", parent.display()));
    }
    for remote in &layout.remotes {
        details.push(format!("remote {}: {}", remote.name, remote.url));
    }
    if let Some(branch) = &layout.default_branch {
        details.push(format!("default branch: {branch}"));
    }
    if let Some(workspace) = &layout.workspace {
        details.push(format!(
            "workspace: {} pattern(s), {} package(s)",
            workspace.patterns.len(),
            workspace.members.len()
        ));
    }
    for nested in layout.nested_roots.iter().take(20) {
        details.push(format!("nested repository: {}", nested.display()));
    }
    for (key, value) in &layout.config {
        details.push(format!("config {key}={value}"));
    }

    let status = if layout.remotes.is_empty() || layout.head.is_detached() || layout.is_nested() {
        DoctorStatus::Warn
    } else {
        DoctorStatus::Pass
    };
    check(
        "git.repository",
        "git repository",
        status,
        layout.summary(),
        details,
    )
}

fn git_output(args: &[&str]) -> Option<String> {
    let mut command = agiworkforce_worktree::host_git();
    command.args(args);
    let output = crate::platform::runtime::git::host_git_output(command).ok()?;
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
    fn a_config_file_that_does_not_parse_fails_the_check_and_names_the_file() {
        let home = tempfile::tempdir().expect("temp home");
        let path = home.path().join("config.toml");
        std::fs::write(&path, "[default]\nprovider = \"oll").expect("write config");

        let result = config_file_check_at(&path);

        assert_eq!(result.status, DoctorStatus::Fail);
        assert!(
            result.message.contains(&path.display().to_string()),
            "{}",
            result.message
        );

        std::fs::write(&path, "[default]\nstream = true\n").expect("write config");
        assert_eq!(config_file_check_at(&path).status, DoctorStatus::Pass);
    }

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
    fn a_detached_head_and_a_nested_checkout_are_both_reported_as_warnings() {
        let mut config = std::collections::BTreeMap::new();
        config.insert("core.bare".to_string(), "false".to_string());
        let layout = crate::repo::RepositoryLayout {
            root: PathBuf::from("/work/inner"),
            opened_at: PathBuf::from("/work/inner"),
            vcs: crate::repo::VersionControl::Git,
            shallow: false,
            submodules: Vec::new(),
            git_dir: PathBuf::from("/work/inner/.git"),
            common_dir: PathBuf::from("/work/inner/.git"),
            bare: false,
            linked_worktree: false,
            head: crate::repo::HeadState::Detached {
                commit: "1a2b3c4d5e6f".to_string(),
                describe: Some("v2.0.0".to_string()),
            },
            remotes: vec![agiworkforce_protocol::code_domain::RepositoryRemote::new(
                "fork",
                "https://example.test/fork.git",
            )],
            default_remote: Some("fork".to_string()),
            default_branch: Some("main".to_string()),
            parent_root: Some(PathBuf::from("/work")),
            nested_roots: Vec::new(),
            workspace: None,
            config,
        };

        let result = repository_layout_check(&layout);

        assert_eq!(result.status, DoctorStatus::Warn);
        assert!(result.message.contains("detached at 1a2b3c4 (v2.0.0)"));
        assert!(result
            .details
            .iter()
            .any(|detail| detail == "remote fork: https://example.test/fork.git"));
        assert!(result
            .details
            .iter()
            .any(|detail| detail == "nested inside: /work"));
        assert!(result
            .details
            .iter()
            .any(|detail| detail == "config core.bare=false"));
    }

    #[test]
    fn a_branch_list_that_could_not_be_read_is_unknown_not_a_pass() {
        let result = stale_branches_check("main", None);

        assert_eq!(result.status, DoctorStatus::Unknown);
        assert!(!result.message.contains("0 branch(es)"));
        assert_eq!(result.details, vec!["current branch: main".to_string()]);
    }

    #[test]
    fn an_empty_branch_list_passes_and_stale_branches_warn() {
        let empty = stale_branches_check("main", Some(Vec::new()));
        assert_eq!(empty.status, DoctorStatus::Pass);
        assert_eq!(empty.message, "0 branch(es) older than 60 days");

        let stale = (0..25)
            .map(|index| format!("old-{index}: older than 60 days"))
            .collect::<Vec<_>>();
        let warned = stale_branches_check("main", Some(stale));
        assert_eq!(warned.status, DoctorStatus::Warn);
        assert_eq!(warned.message, "25 branch(es) older than 60 days");
        assert_eq!(warned.details.len(), 21);
    }

    #[test]
    fn mcp_load_problems_fail_the_check_instead_of_passing_with_zero_servers() {
        let problems = vec!["/home/u/.agiworkforce/mcp.json: invalid JSON: EOF".to_string()];

        let results = mcp_check_results(Ok(HashMap::new()), problems.clone());

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, DoctorStatus::Fail);
        assert!(results[0].details.contains(&problems[0]));
    }

    #[test]
    fn an_empty_mcp_configuration_without_problems_still_passes() {
        let results = mcp_check_results(Ok(HashMap::new()), Vec::new());

        assert_eq!(results[0].status, DoctorStatus::Pass);
        assert_eq!(results[0].message, "0 configured server(s)");
    }

    #[test]
    fn a_valid_server_keeps_its_inventory_beside_a_load_problem() {
        let servers: HashMap<String, McpServerConfig> = serde_json::from_value(serde_json::json!({
            "docs": { "command": "node", "args": ["server.js"] }
        }))
        .expect("server config");

        let results = mcp_check_results(
            Ok(servers),
            vec!["mcp.json: server `broken` skipped: invalid".to_string()],
        );

        assert_eq!(results[0].status, DoctorStatus::Fail);
        assert_eq!(results[0].message, "1 configured server(s)");
        assert!(results[0].details.contains(&"stdio: 1".to_string()));
    }

    #[test]
    fn http_url_validation_requires_host() {
        assert!(is_http_url("https://api.openai.com/v1"));
        assert!(is_http_url("http://localhost:11434"));
        assert!(!is_http_url("file:///tmp/model.sock"));
        assert!(!is_http_url("not a url"));
    }

    #[test]
    fn an_absent_optional_runtime_does_not_degrade_the_verdict() {
        assert_eq!(runtime_dependency_status(false, false), DoctorStatus::Pass);
        assert_eq!(runtime_dependency_status(true, false), DoctorStatus::Pass);
        assert_eq!(runtime_dependency_status(true, true), DoctorStatus::Pass);
        assert_eq!(runtime_dependency_status(false, true), DoctorStatus::Fail);
        let checks = vec![
            check(
                "runtime.rg",
                "runtime dependency: rg",
                runtime_dependency_status(false, false),
                "optional runtime `rg` is not installed",
                vec![],
            ),
            check(
                "runtime.git",
                "runtime dependency: git",
                runtime_dependency_status(false, true),
                "required runtime `git` is missing",
                vec![],
            ),
        ];
        assert_eq!(summarize_checks(&checks[..1]).overall, DoctorStatus::Pass);
        assert_eq!(summarize_checks(&checks).overall, DoctorStatus::Fail);
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
