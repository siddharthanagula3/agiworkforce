//! Normalized global CLI option contract.
//!
//! Claude's CLI parses many entrypoint flags into a single options object before
//! launching print, interactive, SDK, or remote-control modes. This module is
//! the Rust equivalent for flags that must be shared across those paths.

use clap::ValueEnum;

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub(crate) enum InputFormat {
    Text,
    #[value(name = "stream-json", alias = "streamJson")]
    StreamJson,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub(crate) enum PermissionMode {
    Default,
    Plan,
    #[value(name = "acceptEdits", alias = "accept-edits")]
    AcceptEdits,
    #[value(name = "bypassPermissions", alias = "bypass-permissions")]
    BypassPermissions,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CliOptions {
    pub(crate) input_format: InputFormat,
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
            input_format: cli.input_format,
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
        explicit_skip
            || matches!(
                self.permission_mode,
                Some(PermissionMode::BypassPermissions)
            )
    }

    pub(crate) fn should_auto_approve_safe(&self, explicit_yes: bool) -> bool {
        explicit_yes || matches!(self.permission_mode, Some(PermissionMode::AcceptEdits))
    }
}
