//! Normalized global CLI option contract.
//!
//! Claude's CLI parses many entrypoint flags into a single options object before
//! launching print, interactive, SDK, or remote-control modes. This module is
//! the Rust equivalent for flags that must be shared across those paths.

use clap::ValueEnum;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub(crate) enum InputFormat {
    Text,
    #[value(name = "stream-json", alias = "streamJson")]
    StreamJson,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, ValueEnum, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum PermissionMode {
    #[default]
    Default,
    Plan,
    #[value(name = "acceptEdits", alias = "accept-edits")]
    AcceptEdits,
    #[value(name = "bypassPermissions", alias = "bypass-permissions")]
    BypassPermissions,
    /// Headless mode: no interactive prompts, fall back to local rules.
    /// Used by SDK embedders where canUseTool comes through the control channel.
    #[value(name = "dontAsk", alias = "dont-ask")]
    DontAsk,
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
                Some(PermissionMode::BypassPermissions) | Some(PermissionMode::DontAsk)
            )
    }

    pub(crate) fn should_auto_approve_safe(&self, explicit_yes: bool) -> bool {
        explicit_yes || matches!(self.permission_mode, Some(PermissionMode::AcceptEdits))
    }

    /// True when the embedder owns permission decisions over the SDK control channel
    /// rather than the CLI prompting interactively. Wired in the next session
    /// when sdk_io's control channel intercepts canUseTool decisions.
    #[allow(dead_code)]
    pub(crate) fn is_headless_permissions(&self) -> bool {
        matches!(self.permission_mode, Some(PermissionMode::DontAsk))
    }
}
