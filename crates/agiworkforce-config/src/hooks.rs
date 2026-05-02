use std::path::PathBuf;

use serde::Deserialize;
use serde::Serialize;

/// A single hook handler entry in a config file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum HookHandlerConfig {
    #[serde(rename = "command")]
    Command {
        command: String,
        #[serde(default, rename = "timeout", alias = "timeoutSec")]
        timeout_sec: Option<u64>,
        #[serde(default)]
        r#async: bool,
        #[serde(default, rename = "statusMessage")]
        status_message: Option<String>,
    },
    #[serde(rename = "prompt")]
    Prompt {},
    #[serde(rename = "agent")]
    Agent {},
}

/// A group of hooks that share an optional tool-name matcher.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct MatcherGroup {
    #[serde(default)]
    pub matcher: Option<String>,
    #[serde(default)]
    pub hooks: Vec<HookHandlerConfig>,
}

/// Per-event hook lists as they appear in configuration files.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct HookEventsToml {
    #[serde(rename = "PreToolUse", default)]
    pub pre_tool_use: Vec<MatcherGroup>,
    #[serde(rename = "PermissionRequest", default)]
    pub permission_request: Vec<MatcherGroup>,
    #[serde(rename = "PostToolUse", default)]
    pub post_tool_use: Vec<MatcherGroup>,
    #[serde(rename = "SessionStart", default)]
    pub session_start: Vec<MatcherGroup>,
    #[serde(rename = "UserPromptSubmit", default)]
    pub user_prompt_submit: Vec<MatcherGroup>,
    #[serde(rename = "Stop", default)]
    pub stop: Vec<MatcherGroup>,
}

impl HookEventsToml {
    pub fn is_empty(&self) -> bool {
        self.pre_tool_use.is_empty()
            && self.permission_request.is_empty()
            && self.post_tool_use.is_empty()
            && self.session_start.is_empty()
            && self.user_prompt_submit.is_empty()
            && self.stop.is_empty()
    }

    /// Total number of `HookHandlerConfig` entries across every event bucket.
    pub fn handler_count(&self) -> usize {
        let buckets = [
            &self.pre_tool_use,
            &self.permission_request,
            &self.post_tool_use,
            &self.session_start,
            &self.user_prompt_submit,
            &self.stop,
        ];
        buckets
            .into_iter()
            .flat_map(|bucket| bucket.iter())
            .map(|group| group.hooks.len())
            .sum()
    }
}

/// Top-level hooks configuration file (JSON format).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct HooksFile {
    #[serde(default)]
    pub hooks: HookEventsToml,
}

/// Managed hooks requirements from a requirements file.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManagedHooksRequirementsToml {
    pub managed_dir: Option<PathBuf>,
    pub windows_managed_dir: Option<PathBuf>,
    #[serde(default)]
    pub hooks: HookEventsToml,
}
