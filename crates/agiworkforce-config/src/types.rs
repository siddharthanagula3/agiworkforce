pub use agiworkforce_app_server_protocol::AppToolApproval;
use agiworkforce_utils_absolute_path::AbsolutePathBuf;
use serde::Deserialize;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

/// Determine where Agiworkforce should store CLI auth credentials.
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuthCredentialsStoreMode {
    #[default]
    /// Persist credentials in AGIWORKFORCE_HOME/auth.json.
    File,
    /// Persist credentials in the keyring. Fail if unavailable.
    Keyring,
    /// Use keyring when available; otherwise, fall back to a file in AGIWORKFORCE_HOME.
    Auto,
    /// Store credentials in memory only for the current process.
    Ephemeral,
}

/// Determine where Agiworkforce should store and read MCP credentials.
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OAuthCredentialsStoreMode {
    /// `Keyring` when available; otherwise, `File`.
    #[default]
    Auto,
    /// AGIWORKFORCE_HOME/.credentials.json
    File,
    /// Keyring when available, otherwise fail.
    Keyring,
}

/// A single environment variable entry for an MCP server.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum McpServerEnvVar {
    /// Named env var, read from the local process environment.
    Name(String),
    /// Env var with an explicit source.
    Config {
        name: String,
        #[serde(default)]
        source: Option<String>,
    },
}

impl McpServerEnvVar {
    /// Returns the name of the environment variable.
    pub fn name(&self) -> &str {
        match self {
            McpServerEnvVar::Name(name) => name,
            McpServerEnvVar::Config { name, .. } => name,
        }
    }

    /// Returns `true` if the env var is explicitly marked as `remote` source.
    pub fn is_remote_source(&self) -> bool {
        match self {
            McpServerEnvVar::Name(_) => false,
            McpServerEnvVar::Config { source, .. } => {
                source.as_deref() == Some("remote")
            }
        }
    }
}

impl From<String> for McpServerEnvVar {
    fn from(name: String) -> Self {
        McpServerEnvVar::Name(name)
    }
}

impl From<&str> for McpServerEnvVar {
    fn from(name: &str) -> Self {
        McpServerEnvVar::Name(name.to_string())
    }
}

/// Transport-level configuration for a single MCP server.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum McpServerTransportConfig {
    Stdio {
        command: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        env: Option<HashMap<String, String>>,
        #[serde(default)]
        env_vars: Vec<McpServerEnvVar>,
        #[serde(default)]
        cwd: Option<PathBuf>,
    },
    StreamableHttp {
        url: String,
        #[serde(default)]
        bearer_token_env_var: Option<String>,
        #[serde(default)]
        http_headers: Option<HashMap<String, String>>,
        #[serde(default)]
        env_http_headers: Option<HashMap<String, String>>,
    },
}

/// Per-tool configuration within an MCP server.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct McpServerToolConfig {
    #[serde(default)]
    pub approval_mode: Option<AppToolApproval>,
}

/// Full configuration for a single MCP server entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub transport: McpServerTransportConfig,
    #[serde(default)]
    pub experimental_environment: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub supports_parallel_tool_calls: bool,
    #[serde(default)]
    pub disabled_reason: Option<String>,
    #[serde(default, with = "opt_duration_secs")]
    pub startup_timeout_sec: Option<Duration>,
    #[serde(default, with = "opt_duration_secs")]
    pub tool_timeout_sec: Option<Duration>,
    #[serde(default)]
    pub default_tools_approval_mode: Option<AppToolApproval>,
    #[serde(default)]
    pub enabled_tools: Option<Vec<String>>,
    #[serde(default)]
    pub disabled_tools: Option<Vec<String>>,
    #[serde(default)]
    pub scopes: Option<Vec<String>>,
    #[serde(default)]
    pub oauth_resource: Option<String>,
    #[serde(default)]
    pub tools: HashMap<String, McpServerToolConfig>,
}

fn default_true() -> bool {
    true
}

mod opt_duration_secs {
    use serde::Deserialize;
    use serde::Deserializer;
    use serde::Serializer;
    use std::time::Duration;

    pub fn serialize<S: Serializer>(v: &Option<Duration>, s: S) -> Result<S::Ok, S::Error> {
        match v {
            Some(d) => s.serialize_f64(d.as_secs_f64()),
            None => s.serialize_none(),
        }
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Option<Duration>, D::Error> {
        let opt = Option::<f64>::deserialize(d)?;
        Ok(opt.map(Duration::from_secs_f64))
    }
}

/// Plugin-level policy applied to a single MCP server entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginMcpServerConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub default_tools_approval_mode: Option<AppToolApproval>,
    #[serde(default)]
    pub enabled_tools: Option<Vec<String>>,
    #[serde(default)]
    pub disabled_tools: Option<Vec<String>>,
    #[serde(default)]
    pub tools: HashMap<String, PluginMcpToolPolicy>,
}

/// Per-tool policy from a plugin manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginMcpToolPolicy {
    #[serde(default)]
    pub approval_mode: Option<AppToolApproval>,
}

/// Configuration for a single skill override entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillConfig {
    #[serde(default)]
    pub path: Option<AbsolutePathBuf>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

/// Bundled-skills on/off toggle within the `[skills]` config table.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillsBundledConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
}

impl Default for SkillsBundledConfig {
    fn default() -> Self {
        Self { enabled: true }
    }
}

/// Top-level `[skills]` config table for per-skill enable/disable rules.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillsConfig {
    #[serde(default)]
    pub config: Vec<SkillConfig>,
    #[serde(default)]
    pub bundled: Option<SkillsBundledConfig>,
    #[serde(default)]
    pub include_instructions: Option<bool>,
}

/// The type of source for a marketplace entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MarketplaceSourceType {
    Git,
    Local,
}

/// A single marketplace entry as it appears in `config.toml`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarketplaceConfig {
    #[serde(default)]
    pub last_updated: Option<String>,
    #[serde(default)]
    pub last_revision: Option<String>,
    #[serde(default)]
    pub source_type: Option<MarketplaceSourceType>,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default, rename = "ref")]
    pub ref_name: Option<String>,
    #[serde(default)]
    pub sparse_paths: Option<Vec<String>>,
}

/// Per-plugin configuration within the `[plugins]` config table.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub mcp_servers: HashMap<String, PluginMcpServerConfig>,
}

pub use agiworkforce_protocol::config_types::ApprovalsReviewer;

pub const DEFAULT_OTEL_ENVIRONMENT: &str = "production";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum OtelHttpProtocol {
    Json,
    #[default]
    Binary,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct OtelTlsConfigToml {
    #[serde(default)]
    pub ca_certificate: Option<AbsolutePathBuf>,
    #[serde(default)]
    pub client_certificate: Option<AbsolutePathBuf>,
    #[serde(default)]
    pub client_private_key: Option<AbsolutePathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum OtelExporterKind {
    #[default]
    None,
    Statsig,
    OtlpHttp {
        #[serde(default)]
        endpoint: String,
        #[serde(default)]
        headers: HashMap<String, String>,
        #[serde(default)]
        protocol: OtelHttpProtocol,
        #[serde(default)]
        tls: Option<OtelTlsConfigToml>,
    },
    OtlpGrpc {
        #[serde(default)]
        endpoint: String,
        #[serde(default)]
        headers: HashMap<String, String>,
        #[serde(default)]
        tls: Option<OtelTlsConfigToml>,
    },
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct OtelConfigToml {
    #[serde(default)]
    pub log_user_prompt: Option<bool>,
    #[serde(default)]
    pub environment: Option<String>,
    #[serde(default)]
    pub exporter: Option<OtelExporterKind>,
    #[serde(default)]
    pub trace_exporter: Option<OtelExporterKind>,
    #[serde(default)]
    pub metrics_exporter: Option<OtelExporterKind>,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct OtelConfig {
    pub log_user_prompt: bool,
    pub environment: String,
    pub exporter: OtelExporterKind,
    pub trace_exporter: OtelExporterKind,
    pub metrics_exporter: OtelExporterKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum HistoryPersistence {
    #[default]
    SaveAll,
    None,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct History {
    #[serde(default)]
    pub persistence: HistoryPersistence,
    #[serde(default)]
    pub max_bytes: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct MemoriesConfig {
    pub disable_on_external_context: bool,
    pub generate_memories: bool,
    pub use_memories: bool,
    pub max_raw_memories_for_consolidation: usize,
    pub max_unused_days: i64,
    pub max_rollout_age_days: i64,
    pub max_rollouts_per_startup: usize,
    pub min_rollout_idle_hours: i64,
    pub min_rate_limit_remaining_percent: f64,
    pub extract_model: Option<String>,
    pub consolidation_model: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ModelAvailabilityNuxConfig {
    #[serde(default)]
    pub shown_count: HashMap<String, u32>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Notice {
    #[serde(default)]
    pub fast_default_opt_out: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ToolSuggestDiscoverableType {
    #[default]
    Connector,
    Plugin,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolSuggestDiscoverable {
    pub kind: ToolSuggestDiscoverableType,
    pub id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ToolSuggestDisabledTool {
    pub kind: ToolSuggestDiscoverableType,
    pub id: String,
}

impl ToolSuggestDisabledTool {
    pub fn connector(id: impl Into<String>) -> Self {
        Self { kind: ToolSuggestDiscoverableType::Connector, id: id.into() }
    }
    pub fn plugin(id: impl Into<String>) -> Self {
        Self { kind: ToolSuggestDiscoverableType::Plugin, id: id.into() }
    }
    pub fn normalized(&self) -> Option<Self> {
        let id = self.id.trim().to_string();
        if id.is_empty() { None } else { Some(Self { kind: self.kind, id }) }
    }
    pub fn id(&self) -> &str {
        &self.id
    }
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ToolSuggestConfig {
    #[serde(default)]
    pub discoverables: Vec<ToolSuggestDiscoverable>,
    #[serde(default)]
    pub disabled_tools: Vec<ToolSuggestDisabledTool>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct TuiKeymap {}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct TuiNotificationSettings {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum UriBasedFileOpener {
    #[default]
    VsCode,
    Cursor,
    Zed,
    Custom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowsSandboxModeToml {
    Elevated,
    Unelevated,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct SandboxWorkspaceWrite {
    #[serde(default)]
    pub writable_roots: Vec<AbsolutePathBuf>,
    #[serde(default)]
    pub network_access: bool,
    #[serde(default)]
    pub exclude_tmpdir_env_var: bool,
    #[serde(default)]
    pub exclude_slash_tmp: bool,
}

/// Default settings applied to all apps.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppsDefaultConfigToml {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub destructive_enabled: bool,
    #[serde(default = "default_true")]
    pub open_world_enabled: bool,
}

impl Default for AppsDefaultConfigToml {
    fn default() -> Self {
        Self { enabled: true, destructive_enabled: true, open_world_enabled: true }
    }
}

/// Per-app configuration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppConfigToml {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub destructive_enabled: Option<bool>,
    #[serde(default)]
    pub open_world_enabled: Option<bool>,
    #[serde(default)]
    pub default_tools_approval_mode: Option<AppToolApproval>,
    #[serde(default)]
    pub default_tools_enabled: Option<bool>,
    #[serde(default)]
    pub tools: Option<AppToolsConfig>,
}

impl Default for AppConfigToml {
    fn default() -> Self {
        Self {
            enabled: true,
            destructive_enabled: None,
            open_world_enabled: None,
            default_tools_approval_mode: None,
            default_tools_enabled: None,
            tools: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct AppsConfigToml {
    #[serde(default, rename = "_default")]
    pub default: Option<AppsDefaultConfigToml>,
    #[serde(default, flatten)]
    pub apps: HashMap<String, AppConfigToml>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum McpServerDisabledReason {
    /// Disabled by a requirements policy from a specific source.
    Requirements { source: crate::config_requirements::RequirementSource },
    /// Disabled for an unknown reason.
    Unknown,
    /// Disabled with a custom message.
    Custom(String),
}

impl McpServerDisabledReason {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Requirements { .. } => "disabled by requirements",
            Self::Unknown => "disabled (unknown reason)",
            Self::Custom(s) => s.as_str(),
        }
    }
}

impl std::fmt::Display for McpServerDisabledReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Requirements { source } => write!(f, "disabled by requirements from {source}"),
            Self::Unknown => write!(f, "disabled (unknown reason)"),
            Self::Custom(s) => s.fmt(f),
        }
    }
}

pub use agiworkforce_protocol::config_types::Personality;

// ──────────────────────────────────────────────────────────────────────────────
// App tool config
// ──────────────────────────────────────────────────────────────────────────────

/// Per-tool configuration for an installed app.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppToolConfig {
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub approval_mode: Option<AppToolApproval>,
}

/// Map of tool name → per-tool config for an installed app.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppToolsConfig {
    #[serde(default)]
    pub tools: HashMap<String, AppToolConfig>,
}

// ──────────────────────────────────────────────────────────────────────────────
// Skills
// ──────────────────────────────────────────────────────────────────────────────

/// Re-export alias kept for backwards compatibility.
pub use SkillsBundledConfig as BundledSkillsConfig;

// ──────────────────────────────────────────────────────────────────────────────
// Feedback
// ──────────────────────────────────────────────────────────────────────────────

/// User-facing feedback collection settings.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct FeedbackConfigToml {
    #[serde(default)]
    pub enabled: Option<bool>,
}

// ──────────────────────────────────────────────────────────────────────────────
// Keybindings
// ──────────────────────────────────────────────────────────────────────────────

pub const DEFAULT_TERMINAL_RESIZE_REFLOW_FALLBACK_MAX_ROWS: usize = 2000;

/// A single keybinding value (e.g. `"ctrl-c"`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeybindingSpec(pub String);

/// One or more keybindings for a single action.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum KeybindingsSpec {
    /// A single keybinding.
    One(KeybindingSpec),
    /// Multiple keybindings.
    Many(Vec<KeybindingSpec>),
}

// ──────────────────────────────────────────────────────────────────────────────
// Memories TOML
// ──────────────────────────────────────────────────────────────────────────────

pub const DEFAULT_MEMORIES_MAX_RAW_MEMORIES_FOR_CONSOLIDATION: usize = 50;

/// `[memories]` TOML configuration section.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct MemoriesToml {
    #[serde(default)]
    pub disable_on_external_context: Option<bool>,
    #[serde(default)]
    pub generate_memories: Option<bool>,
    #[serde(default)]
    pub use_memories: Option<bool>,
    #[serde(default)]
    pub max_raw_memories_for_consolidation: Option<usize>,
    #[serde(default)]
    pub max_unused_days: Option<i64>,
    #[serde(default)]
    pub max_rollout_age_days: Option<i64>,
    #[serde(default)]
    pub max_rollouts_per_startup: Option<usize>,
    #[serde(default)]
    pub min_rollout_idle_hours: Option<i64>,
    #[serde(default)]
    pub min_rate_limit_remaining_percent: Option<f64>,
    #[serde(default)]
    pub extract_model: Option<String>,
    #[serde(default)]
    pub consolidation_model: Option<String>,
}

impl From<MemoriesToml> for MemoriesConfig {
    fn from(toml: MemoriesToml) -> Self {
        MemoriesConfig {
            disable_on_external_context: toml.disable_on_external_context.unwrap_or(false),
            generate_memories: toml.generate_memories.unwrap_or(false),
            use_memories: toml.use_memories.unwrap_or(false),
            max_raw_memories_for_consolidation: toml
                .max_raw_memories_for_consolidation
                .unwrap_or(DEFAULT_MEMORIES_MAX_RAW_MEMORIES_FOR_CONSOLIDATION),
            max_unused_days: toml.max_unused_days.unwrap_or(30),
            max_rollout_age_days: toml.max_rollout_age_days.unwrap_or(7),
            max_rollouts_per_startup: toml.max_rollouts_per_startup.unwrap_or(3),
            min_rollout_idle_hours: toml.min_rollout_idle_hours.unwrap_or(1),
            min_rate_limit_remaining_percent: toml
                .min_rate_limit_remaining_percent
                .unwrap_or(0.1),
            extract_model: toml.extract_model,
            consolidation_model: toml.consolidation_model,
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Notifications
// ──────────────────────────────────────────────────────────────────────────────

/// When a notification should be triggered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NotificationCondition {
    /// Trigger on every turn.
    Always,
    /// Trigger only when Agiworkforce is in background mode.
    Background,
    /// Never trigger.
    Never,
}

/// How to deliver a notification.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum NotificationMethod {
    /// macOS / freedesktop system notification.
    SystemNotification,
    /// Execute a custom command.
    Command { command: String, args: Vec<String> },
}

/// `[notify]` TOML section.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Notifications {
    #[serde(default)]
    pub condition: Option<NotificationCondition>,
    #[serde(default)]
    pub methods: Option<Vec<NotificationMethod>>,
}

// ──────────────────────────────────────────────────────────────────────────────
// TUI configuration
// ──────────────────────────────────────────────────────────────────────────────

/// Top-level `[tui]` configuration table.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Tui {
    #[serde(default)]
    pub theme: Option<String>,
    #[serde(default)]
    pub animations: bool,
    #[serde(default = "default_true_fn")]
    pub show_tooltips: bool,
    #[serde(default)]
    pub status_line: Option<Vec<String>>,
    #[serde(default)]
    pub terminal_title: Option<Vec<String>>,
    #[serde(default)]
    pub keymap: Option<TuiKeymap>,
    #[serde(default)]
    pub notification_settings: Option<TuiNotificationSettings>,
    #[serde(default)]
    pub model_availability_nux: Option<ModelAvailabilityNuxConfig>,
    #[serde(default)]
    pub terminal_resize_reflow_max_rows: Option<u32>,
    #[serde(default)]
    pub alternate_screen: Option<bool>,
}

fn default_true_fn() -> bool {
    true
}

// ──────────────────────────────────────────────────────────────────────────────
// Windows configuration
// ──────────────────────────────────────────────────────────────────────────────

/// `[windows]` TOML configuration section.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct WindowsToml {
    #[serde(default)]
    pub sandbox: Option<WindowsSandboxModeToml>,
    #[serde(default)]
    pub sandbox_private_desktop: Option<bool>,
    #[serde(default)]
    pub wsl_setup_acknowledged: Option<bool>,
}

/// `[analytics]` TOML configuration section.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AnalyticsToml {
    #[serde(default)]
    pub enabled: Option<bool>,
}

/// `[feedback]` TOML configuration section.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct FeedbackToml {
    #[serde(default)]
    pub enabled: Option<bool>,
}

/// `[audio]` TOML configuration section (used for realtime audio device selection).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AudioToml {
    #[serde(default)]
    pub microphone: Option<String>,
    #[serde(default)]
    pub speaker: Option<String>,
}

/// `[ghost_snapshot]` TOML configuration section.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct GhostSnapshotToml {
    #[serde(default)]
    pub ignore_large_untracked_files: Option<i64>,
    #[serde(default)]
    pub ignore_large_untracked_dirs: Option<i64>,
    #[serde(default)]
    pub disable_warnings: Option<bool>,
}
