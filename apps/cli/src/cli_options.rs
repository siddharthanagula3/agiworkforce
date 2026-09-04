//! Normalized global CLI option contract.
//!
//! Entrypoint flags are normalized into one options object before launching the
//! implemented print, interactive, or SDK paths. Remote control is intentionally
//! absent until AGI has a real authenticated host/relay transport.

use clap::ValueEnum;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, ValueEnum, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionMode {
    #[default]
    Default,
    Plan,
    #[value(name = "acceptEdits", alias = "accept-edits")]
    AcceptEdits,
    #[value(name = "bypassPermissions", alias = "bypass-permissions")]
    BypassPermissions,
    /// Headless mode: do not prompt interactively. Only pre-approved safe work runs.
    #[value(name = "dontAsk", alias = "dont-ask")]
    DontAsk,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CliOptions {
    pub(crate) permission_mode: Option<PermissionMode>,
    pub(crate) allowed_tools: Vec<String>,
    pub(crate) disallowed_tools: Vec<String>,
    pub(crate) mcp_config_paths: Vec<String>,
    pub(crate) strict_mcp_config: bool,
    pub(crate) additional_dirs: Vec<String>,
    pub(crate) agent: Option<String>,
    pub(crate) agent_id: Option<String>,
    pub(crate) session_persistence: bool,
    pub(crate) resume_session_at: Option<String>,
    pub(crate) setting_sources: Vec<String>,
}

impl CliOptions {
    pub(crate) fn from_cli(cli: &crate::Cli) -> Self {
        Self {
            permission_mode: cli.permission_mode,
            allowed_tools: cli.allowed_tools.clone(),
            disallowed_tools: cli.disallowed_tools.clone(),
            mcp_config_paths: cli.mcp_config.clone(),
            strict_mcp_config: cli.strict_mcp_config,
            additional_dirs: cli.add_dir.clone(),
            agent: cli.agent.clone(),
            agent_id: cli.agent_id.clone(),
            session_persistence: cli.session_persistence,
            resume_session_at: cli.resume_session_at.clone(),
            setting_sources: cli.settings.clone(),
        }
    }

    pub(crate) fn should_skip_permissions(&self, explicit_skip: bool) -> bool {
        // `DontAsk` is deliberately NOT a blanket skip: it must keep the
        // approval gate so that non-safe tools auto-deny in headless runs (no
        // interactive prompt -> denied), matching the documented contract that
        // only pre-approved safe work runs. Only `BypassPermissions` (and the
        // explicit `--dangerously-skip-permissions` flag) skip all approvals.
        explicit_skip
            || matches!(
                self.permission_mode,
                Some(PermissionMode::BypassPermissions)
            )
    }

    pub(crate) fn should_auto_approve_safe(&self, explicit_yes: bool) -> bool {
        // `DontAsk` auto-approves only the read-only/safe-tool allowlist so that
        // pre-approved safe work runs non-interactively while mutating tools
        // still hit the (non-interactive -> deny) approval gate.
        explicit_yes
            || matches!(
                self.permission_mode,
                Some(PermissionMode::AcceptEdits) | Some(PermissionMode::DontAsk)
            )
    }

    pub(crate) fn mcp_config_load_options(&self) -> crate::mcp::McpConfigLoadOptions {
        crate::mcp::McpConfigLoadOptions {
            explicit_paths: self.mcp_config_paths.iter().map(Into::into).collect(),
            strict: self.strict_mcp_config,
        }
    }
}

/// Process-wide session-persistence policy, seeded from `--no-session-persistence`.
///
/// `--no-session-persistence` is a privacy opt-out, so it has to reach every
/// managed-session write site. `agi exec`, `run_oneshot`, the REPL and the TUI
/// each build their own `AgentSession` through helpers that do not share an
/// options struct, and the subcommand dispatch runs before the per-run option
/// resolution, so the policy is published once at entry instead of being
/// threaded through ~20 signatures. Mirrors `sandbox::set_sandbox_disabled`.
///
/// `AgentSession` reads this once at construction into
/// `AgentSession::session_persistence`; per-session overrides never consult it
/// again, so embedders can opt an individual session out (or back in) without
/// disturbing the process policy.
static SESSION_PERSISTENCE_ENABLED: AtomicBool = AtomicBool::new(true);

/// Publish the run's session-persistence policy. Called once from `run_main`
/// before any subcommand dispatches or any session is constructed.
pub(crate) fn set_session_persistence_enabled(enabled: bool) {
    SESSION_PERSISTENCE_ENABLED.store(enabled, Ordering::Relaxed);
}

/// The run's session-persistence policy. `true` unless the user passed
/// `--no-session-persistence`.
pub(crate) fn session_persistence_enabled() -> bool {
    SESSION_PERSISTENCE_ENABLED.load(Ordering::Relaxed)
}

/// Serializes the tests that flip the process-wide policy against the tests
/// that rely on the default. The policy is genuinely global, so the tests that
/// mutate it must not run concurrently with the ones that read it.
#[cfg(test)]
pub(crate) fn session_persistence_policy_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_persistence_policy_defaults_to_enabled_and_roundtrips() {
        let _guard = session_persistence_policy_lock();
        let previous = session_persistence_enabled();
        assert!(
            previous,
            "session persistence must default to enabled so a run without the flag still persists"
        );

        set_session_persistence_enabled(false);
        assert!(!session_persistence_enabled());

        set_session_persistence_enabled(previous);
        assert!(session_persistence_enabled());
    }
}
