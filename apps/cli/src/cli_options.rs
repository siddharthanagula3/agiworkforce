//! Normalized global CLI option contract.
//!
//! Entrypoint flags are normalized into one options object before launching the
//! implemented print, interactive, or SDK paths. Remote control is intentionally
//! absent until AGI has a real authenticated host/relay transport.

use clap::ValueEnum;
use serde::{Deserialize, Serialize};

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
