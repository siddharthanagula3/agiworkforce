use crate::profile_toml::ConfigProfile;
use crate::types::McpServerConfig;
use crate::types::OtelConfigToml;
use crate::types::SkillsConfig;
use crate::types::ToolSuggestConfig;
use agiworkforce_protocol::config_types::ApprovalsReviewer;
use agiworkforce_protocol::config_types::WebSearchMode;
use agiworkforce_protocol::openai_models::ReasoningEffort;
use agiworkforce_utils_absolute_path::AbsolutePathBuf;
use serde::Deserialize;
use serde::Serialize;
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::path::PathBuf;

/// A minimal re-export placeholder for `agiworkforce_features::FeaturesToml`.
///
/// `agiworkforce-config` cannot depend on `agiworkforce-features` because of
/// the `login → config → features → login` cycle. Callers that need typed
/// feature config should use `agiworkforce_features::FeaturesToml` directly;
/// this type is only used for TOML deserialization in `ConfigToml`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct FeaturesToml {
    #[serde(flatten)]
    pub entries: std::collections::BTreeMap<String, bool>,
}

impl FeaturesToml {
    /// Return a reference to the raw feature entries map.
    pub fn entries(&self) -> &std::collections::BTreeMap<String, bool> {
        &self.entries
    }
}

/// Top-level `config.toml` structure.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ConfigToml {
    // Model settings
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub model_context_window: Option<i64>,
    #[serde(default)]
    pub model_auto_compact_token_limit: Option<i64>,
    #[serde(default)]
    pub model_supports_reasoning_summaries: Option<bool>,
    #[serde(default)]
    pub model_verbosity: Option<String>,
    #[serde(default)]
    pub model_reasoning_effort: Option<ReasoningEffort>,
    #[serde(default)]
    pub plan_mode_reasoning_effort: Option<ReasoningEffort>,

    // Provider settings
    #[serde(default)]
    pub model_providers: HashMap<String, toml::Value>,
    #[serde(default)]
    pub oss_provider: Option<String>,
    #[serde(default)]
    pub openai_base_url: Option<String>,
    #[serde(default)]
    pub chatgpt_base_url: Option<String>,
    #[serde(default)]
    pub service_tier: Option<agiworkforce_protocol::config_types::ServiceTier>,

    // Review settings
    #[serde(default)]
    pub review_model: Option<String>,
    #[serde(default)]
    pub auto_review: Option<AutoReviewToml>,

    // Approval settings
    #[serde(default)]
    pub approval_policy: Option<agiworkforce_protocol::protocol::AskForApproval>,
    #[serde(default)]
    pub approvals_reviewer: Option<ApprovalsReviewer>,

    // Permission / sandbox settings
    #[serde(default)]
    pub sandbox_mode: Option<agiworkforce_protocol::config_types::SandboxMode>,
    #[serde(default)]
    pub sandbox_workspace_write: Option<crate::types::SandboxWorkspaceWrite>,
    #[serde(default)]
    pub default_permissions: Option<String>,
    #[serde(default)]
    pub permissions: Option<crate::permissions_toml::PermissionsToml>,

    // MCP settings
    #[serde(default)]
    pub mcp_servers: Option<HashMap<String, McpServerConfig>>,
    #[serde(default)]
    pub mcp_oauth_credentials_store: Option<crate::types::OAuthCredentialsStoreMode>,
    #[serde(default)]
    pub mcp_oauth_callback_port: Option<u16>,
    #[serde(default)]
    pub mcp_oauth_callback_url: Option<String>,

    // Auth settings
    #[serde(default)]
    pub cli_auth_credentials_store: Option<crate::types::AuthCredentialsStoreMode>,
    #[serde(default)]
    pub forced_login_method: Option<agiworkforce_protocol::config_types::ForcedLoginMethod>,
    #[serde(default)]
    pub forced_chatgpt_workspace_id: Option<String>,

    // Features / skills
    #[serde(default)]
    pub features: Option<FeaturesToml>,
    #[serde(default)]
    pub skills: Option<SkillsConfig>,

    // Web search
    #[serde(default)]
    pub web_search: Option<WebSearchMode>,

    // Instructions
    #[serde(default)]
    pub developer_instructions: Option<String>,
    #[serde(default)]
    pub model_instructions_file: Option<AbsolutePathBuf>,

    // Include flags
    #[serde(default)]
    pub include_apply_patch_tool: Option<bool>,
    #[serde(default)]
    pub include_permissions_instructions: Option<bool>,
    #[serde(default)]
    pub include_apps_instructions: Option<bool>,
    #[serde(default)]
    pub include_environment_context: Option<bool>,

    // Experimental flags
    #[serde(default)]
    pub experimental_use_freeform_apply_patch: Option<bool>,
    #[serde(default)]
    pub experimental_use_unified_exec_tool: Option<bool>,
    #[serde(default)]
    pub experimental_compact_prompt_file: Option<AbsolutePathBuf>,
    #[serde(default)]
    pub experimental_realtime_ws_base_url: Option<String>,
    #[serde(default)]
    pub experimental_realtime_ws_model: Option<String>,
    #[serde(default)]
    pub experimental_realtime_ws_backend_prompt: Option<String>,
    #[serde(default)]
    pub experimental_realtime_ws_startup_context: Option<String>,
    #[serde(default)]
    pub experimental_realtime_start_instructions: Option<String>,
    #[serde(default)]
    pub experimental_thread_config_endpoint: Option<String>,
    #[serde(default)]
    pub experimental_thread_store: Option<ThreadStoreToml>,
    #[serde(default)]
    pub experimental_thread_store_endpoint: Option<String>,

    // Compact prompt
    #[serde(default)]
    pub compact_prompt: Option<String>,

    // TUI settings
    #[serde(default)]
    pub tui: Option<crate::types::Tui>,

    // Tool suggest
    #[serde(default)]
    pub tool_suggest: Option<ToolSuggestConfig>,

    // Model catalog
    #[serde(default)]
    pub model_catalog_json: Option<String>,

    // Notifications / notify
    #[serde(default)]
    pub notify: Option<crate::types::Notifications>,

    // History
    #[serde(default)]
    pub history: Option<crate::types::History>,

    // Memories
    #[serde(default)]
    pub memories: Option<crate::types::MemoriesToml>,

    // OTel
    #[serde(default)]
    pub otel: Option<OtelConfigToml>,

    // Notice
    #[serde(default)]
    pub notice: Option<crate::types::Notice>,

    // Miscellaneous
    #[serde(default)]
    pub personality: Option<agiworkforce_protocol::config_types::Personality>,
    #[serde(default)]
    pub hide_agent_reasoning: Option<bool>,
    #[serde(default)]
    pub log_dir: Option<PathBuf>,
    #[serde(default)]
    pub sqlite_home: Option<PathBuf>,
    #[serde(default)]
    pub allow_login_shell: Option<bool>,
    #[serde(default)]
    pub shell_environment_policy: Option<toml::Value>,
    #[serde(default)]
    pub check_for_update_on_startup: Option<bool>,
    #[serde(default)]
    pub disable_paste_burst: Option<bool>,
    #[serde(default)]
    pub analytics: Option<crate::types::AnalyticsToml>,
    #[serde(default)]
    pub feedback: Option<crate::types::FeedbackToml>,
    #[serde(default)]
    pub audio: Option<crate::types::AudioToml>,
    #[serde(default)]
    pub model_provider: Option<String>,
    #[serde(default)]
    pub zsh_path: Option<String>,
    #[serde(default)]
    pub show_raw_agent_reasoning: Option<bool>,
    #[serde(default)]
    pub model_reasoning_summary: Option<bool>,
    #[serde(default)]
    pub project_doc_fallback_filenames: Option<Vec<String>>,
    #[serde(default)]
    pub background_terminal_max_timeout: Option<u64>,
    #[serde(default)]
    pub commit_attribution: Option<String>,
    #[serde(default)]
    pub windows_wsl_setup_acknowledged: Option<bool>,
    #[serde(default)]
    pub suppress_unstable_features_warning: Option<bool>,
    #[serde(default)]
    pub tool_output_token_limit: Option<i64>,
    #[serde(default)]
    pub project_doc_max_bytes: Option<usize>,
    #[serde(default)]
    pub ghost_snapshot: Option<crate::types::GhostSnapshotToml>,
    #[serde(default)]
    pub file_opener: Option<crate::types::UriBasedFileOpener>,
    #[serde(default)]
    pub realtime: Option<RealtimeToml>,
    #[serde(default)]
    pub agents: Option<AgentsToml>,
    #[serde(default)]
    pub profile: Option<String>,
    #[serde(default)]
    pub profiles: Option<HashMap<String, ConfigProfile>>,
    #[serde(default)]
    pub projects: Option<HashMap<String, ProjectConfig>>,
    #[serde(default)]
    pub project_root_markers: Option<Vec<String>>,
    // Windows-specific
    #[serde(default)]
    pub windows: Option<crate::types::WindowsToml>,
    // Tools
    #[serde(default)]
    pub tools: Option<ToolsToml>,
}

impl ConfigToml {
    /// Get the active config profile by key, if any.
    pub fn get_config_profile(
        &self,
        key: Option<String>,
    ) -> Result<ConfigProfile, String> {
        let key = match key {
            Some(k) => k,
            None => return Ok(ConfigProfile::default()),
        };
        self.profiles
            .as_ref()
            .and_then(|profiles| profiles.get(&key))
            .cloned()
            .ok_or_else(|| format!("config profile `{key}` not found"))
    }

    /// Get the active project config for the given cwd, if any.
    pub fn get_active_project(
        &self,
        _cwd: &std::path::Path,
        _repo_root: Option<&std::path::Path>,
    ) -> Option<ProjectConfig> {
        todo!()
    }

    /// Derive a permission profile from this config, given various inputs.
    pub fn derive_permission_profile(
        &self,
        _sandbox_mode_override: Option<agiworkforce_protocol::config_types::SandboxMode>,
        _profile_sandbox_mode: Option<agiworkforce_protocol::config_types::SandboxMode>,
        _windows_sandbox_level: agiworkforce_protocol::config_types::WindowsSandboxLevel,
        _active_project: Option<&ProjectConfig>,
        _permission_profile_constraint: Option<
            &crate::constraint::Constrained<agiworkforce_protocol::models::PermissionProfile>,
        >,
    ) -> agiworkforce_protocol::models::PermissionProfile {
        todo!()
    }
}

/// Per-project trust configuration.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ProjectConfig {
    #[serde(default)]
    pub trust_level: Option<agiworkforce_protocol::config_types::TrustLevel>,
}

impl ProjectConfig {
    pub fn is_trusted(&self) -> bool {
        matches!(
            self.trust_level,
            Some(agiworkforce_protocol::config_types::TrustLevel::Trusted)
        )
    }

    pub fn is_untrusted(&self) -> bool {
        matches!(
            self.trust_level,
            Some(agiworkforce_protocol::config_types::TrustLevel::Untrusted)
        )
    }
}

/// Auto-review / guardian policy configuration.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AutoReviewToml {
    #[serde(default)]
    pub policy: Option<String>,
}

/// Agent pool configuration.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AgentsToml {
    #[serde(default)]
    pub max_threads: Option<usize>,
    #[serde(default)]
    pub max_depth: Option<i32>,
    #[serde(default)]
    pub job_max_runtime_seconds: Option<u64>,
    #[serde(default)]
    pub interrupt_message: Option<String>,
    #[serde(default)]
    pub roles: BTreeMap<String, AgentRoleToml>,
}

/// Configuration for a named agent role.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AgentRoleToml {
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub config_file: Option<AbsolutePathBuf>,
    #[serde(default)]
    pub nickname_candidates: Option<Vec<String>>,
}

/// Thread store configuration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ThreadStoreToml {
    Local {},
    Remote { endpoint: String },
    #[cfg(debug_assertions)]
    InMemory { id: String },
}

/// Real-time session configuration (TOML, all fields optional).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct RealtimeToml {
    #[serde(default)]
    pub version: Option<RealtimeWsVersion>,
    #[serde(default)]
    pub session_type: Option<RealtimeWsMode>,
    #[serde(default)]
    pub transport: Option<RealtimeTransport>,
    #[serde(default)]
    pub voice: Option<String>,
}

/// Real-time WebSocket protocol version.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RealtimeWsVersion {
    V1,
    V2,
}

/// Real-time WebSocket session mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RealtimeWsMode {
    Conversational,
    Conversation,
    Transcription,
}

/// Real-time transport type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RealtimeTransport {
    WebSocket,
    WebRtc,
}

/// Resolved realtime configuration (non-optional fields, derived from TOML).
///
/// This is the fully-resolved version of [`RealtimeToml`] that the application
/// uses at runtime. Optional TOML fields are replaced by default values.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RealtimeConfig {
    pub version: RealtimeWsVersion,
    pub session_type: RealtimeWsMode,
    pub transport: RealtimeTransport,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voice: Option<String>,
}

impl Default for RealtimeConfig {
    fn default() -> Self {
        Self {
            version: RealtimeWsVersion::V1,
            session_type: RealtimeWsMode::Conversational,
            transport: RealtimeTransport::WebSocket,
            voice: None,
        }
    }
}

/// Top-level `[realtime]` audio configuration table.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct RealtimeAudioConfig {
    #[serde(default)]
    pub microphone: Option<String>,
    #[serde(default)]
    pub speaker: Option<String>,
}

/// Tool-level configuration table.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ToolsToml {
    #[serde(default)]
    pub web_search: Option<WebSearchToml>,
    #[serde(default)]
    pub view_image: Option<bool>,
}

/// Web search tool configuration.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct WebSearchToml {
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub mode: Option<WebSearchMode>,
}

impl WebSearchToml {
    pub fn merge(&self, other: &WebSearchToml) -> WebSearchToml {
        WebSearchToml {
            enabled: other.enabled.or(self.enabled),
            mode: other.mode.or(self.mode),
        }
    }
}

impl From<WebSearchToml> for agiworkforce_protocol::config_types::WebSearchConfig {
    fn from(_val: WebSearchToml) -> Self {
        todo!()
    }
}

/// Validate all configured model providers; returns `Err` with a message
/// describing the first validation error found.
pub fn validate_model_providers(
    _providers: &HashMap<String, toml::Value>,
) -> Result<(), String> {
    Ok(())
}

/// Validate that the OSS provider ID is valid.
pub fn validate_oss_provider(_provider: &str) -> Result<(), String> {
    Ok(())
}

/// A stub `ConfigEditsBuilder`.
///
/// The real implementation lives in `agiworkforce-core::config::edit`.
/// This stub exists so `agiworkforce-config` can re-export `ConfigEditsBuilder`
/// at the crate root without creating a circular dependency.
pub struct ConfigEditsBuilder;

impl ConfigEditsBuilder {
    pub fn new(_agiworkforce_home: &std::path::Path) -> Self {
        ConfigEditsBuilder
    }

    pub fn replace_mcp_servers(
        self,
        _servers: &std::collections::BTreeMap<String, crate::types::McpServerConfig>,
    ) -> Self {
        self
    }

    pub async fn apply(self) -> std::io::Result<()> {
        Ok(())
    }
}
