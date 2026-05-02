use serde::Deserialize;
use serde::Serialize;

use crate::config_toml::FeaturesToml;
use crate::config_toml::ToolsToml;
use crate::types::WindowsToml;

/// Per-profile configuration that overrides `ConfigToml` for the active profile.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ConfigProfile {
    // Model settings
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub model_provider: Option<String>,
    #[serde(default)]
    pub model_verbosity: Option<String>,
    #[serde(default)]
    pub oss_provider: Option<String>,
    #[serde(default)]
    pub service_tier: Option<agiworkforce_protocol::config_types::ServiceTier>,

    // Personality
    #[serde(default)]
    pub personality: Option<agiworkforce_protocol::config_types::Personality>,

    // Approval settings
    #[serde(default)]
    pub approval_policy: Option<agiworkforce_protocol::protocol::AskForApproval>,
    #[serde(default)]
    pub approvals_reviewer: Option<agiworkforce_protocol::config_types::ApprovalsReviewer>,

    // Sandbox settings
    #[serde(default)]
    pub sandbox_mode: Option<agiworkforce_protocol::config_types::SandboxMode>,

    // Web search
    #[serde(default)]
    pub web_search: Option<agiworkforce_protocol::config_types::WebSearchMode>,

    // Features
    #[serde(default)]
    pub features: Option<FeaturesToml>,

    // Tools
    #[serde(default)]
    pub tools: Option<ToolsToml>,

    // Include flags
    #[serde(default)]
    pub include_apply_patch_tool: Option<bool>,
    #[serde(default)]
    pub experimental_use_freeform_apply_patch: Option<bool>,
    #[serde(default)]
    pub experimental_use_unified_exec_tool: Option<bool>,

    // Model reasoning settings
    #[serde(default)]
    pub model_reasoning_effort: Option<agiworkforce_protocol::openai_models::ReasoningEffort>,
    #[serde(default)]
    pub plan_mode_reasoning_effort: Option<agiworkforce_protocol::openai_models::ReasoningEffort>,
    #[serde(default)]
    pub model_reasoning_summary: Option<bool>,

    // Chat base URL
    #[serde(default)]
    pub chatgpt_base_url: Option<String>,

    // Analytics
    #[serde(default)]
    pub analytics: Option<crate::types::AnalyticsToml>,

    // Shell settings
    #[serde(default)]
    pub zsh_path: Option<String>,

    // Compact prompt
    #[serde(default)]
    pub experimental_compact_prompt_file: Option<agiworkforce_utils_absolute_path::AbsolutePathBuf>,

    // Windows-specific
    #[serde(default)]
    pub windows: Option<WindowsToml>,

    // Instruction overrides
    #[serde(default)]
    pub model_instructions_file: Option<agiworkforce_utils_absolute_path::AbsolutePathBuf>,
    #[serde(default)]
    pub include_permissions_instructions: Option<bool>,
    #[serde(default)]
    pub include_apps_instructions: Option<bool>,
    #[serde(default)]
    pub include_environment_context: Option<bool>,
    #[serde(default)]
    pub model_catalog_json: Option<agiworkforce_utils_absolute_path::AbsolutePathBuf>,
}
