mod cloud_requirements;
pub mod hooks;
pub mod types;
mod config_requirements;
mod constraint;
mod diagnostics;
mod fingerprint;
mod marketplace;
mod merge;
mod overrides;
mod requirements_exec_policy;
mod state;
pub mod config_toml;
pub mod loader;
pub mod permissions_toml;
pub mod profile_toml;
mod thread_config;

pub const CONFIG_TOML_FILE: &str = "config.toml";

pub use types::McpServerConfig;
pub use types::McpServerToolConfig;
pub use types::McpServerTransportConfig;
pub use types::SkillConfig;
pub use types::SkillsConfig;

/// Default markers used to detect the project root when none are configured.
pub fn default_project_root_markers() -> Vec<String> {
    vec![".git".to_string()]
}

/// Read `project_root_markers` from a merged TOML config value.
///
/// Returns `Ok(None)` when the key is absent (caller should fall back to
/// [`default_project_root_markers`]).
pub fn project_root_markers_from_config(
    config: &toml::Value,
) -> Result<Option<Vec<String>>, toml::de::Error> {
    let Some(markers) = config.get("project_root_markers") else {
        return Ok(None);
    };
    let markers: Vec<String> = markers.clone().try_into()?;
    Ok(Some(markers))
}

pub use hooks::HookEventsToml;
pub use hooks::HookHandlerConfig;
pub use hooks::HooksFile;
pub use hooks::ManagedHooksRequirementsToml;
pub use hooks::MatcherGroup;
pub use marketplace::MarketplaceConfigUpdate;
pub use marketplace::RemoveMarketplaceConfigOutcome;
pub use marketplace::record_user_marketplace;
pub use marketplace::remove_user_marketplace_config;
pub use cloud_requirements::CloudRequirementsLoadError;
pub use cloud_requirements::CloudRequirementsLoadErrorCode;
pub use cloud_requirements::CloudRequirementsLoader;
pub use config_requirements::AppRequirementToml;
pub use config_requirements::AppsRequirementsToml;
pub use config_requirements::ConfigRequirements;
pub use config_requirements::ConfigRequirementsToml;
pub use config_requirements::ConfigRequirementsWithSources;
pub use config_requirements::ConstrainedWithSource;
pub use config_requirements::FeatureRequirementsToml;
pub use config_requirements::McpServerIdentity;
pub use config_requirements::McpServerRequirement;
pub use config_requirements::NetworkConstraints;
pub use config_requirements::NetworkRequirementsToml;
pub use config_requirements::RequirementSource;
pub use config_requirements::ResidencyRequirement;
pub use config_requirements::SandboxModeRequirement;
pub use config_requirements::Sourced;
pub use config_requirements::WebSearchModeRequirement;
pub use constraint::Constrained;
pub use constraint::ConstraintError;
pub use constraint::ConstraintResult;
pub use diagnostics::ConfigError;
pub use diagnostics::ConfigLoadError;
pub use diagnostics::TextPosition;
pub use diagnostics::TextRange;
pub use diagnostics::config_error_from_toml;
pub use diagnostics::config_error_from_typed_toml;
pub use diagnostics::first_layer_config_error;
pub use diagnostics::first_layer_config_error_from_entries;
pub use diagnostics::format_config_error;
pub use diagnostics::format_config_error_with_source;
pub use diagnostics::io_error_from_config_error;
pub use fingerprint::version_for_toml;
pub use merge::merge_toml_values;
pub use overrides::build_cli_overrides_layer;
pub use requirements_exec_policy::RequirementsExecPolicy;
pub use requirements_exec_policy::RequirementsExecPolicyDecisionToml;
pub use requirements_exec_policy::RequirementsExecPolicyParseError;
pub use requirements_exec_policy::RequirementsExecPolicyPatternTokenToml;
pub use requirements_exec_policy::RequirementsExecPolicyPrefixRuleToml;
pub use requirements_exec_policy::RequirementsExecPolicyToml;
pub use state::ConfigLayerEntry;
pub use state::ConfigLayerStack;
pub use state::ConfigLayerStackOrdering;
pub use state::LoaderOverrides;
pub use agiworkforce_app_server_protocol::ConfigLayerSource;
pub use config_requirements::PluginRequirementsToml;
pub use config_requirements::sandbox_mode_requirement_for_permission_profile;
pub use config_requirements::FilesystemDenyReadPattern;
pub use config_requirements::FilesystemConstraints;
pub use thread_config::NoopThreadConfigLoader;
pub use thread_config::ThreadConfigLoader;
pub use thread_config::RemoteThreadConfigLoader;
pub use thread_config::SessionThreadConfig;
pub use thread_config::StaticThreadConfigLoader;
pub use thread_config::ThreadConfigSource;
pub use loader::load_global_mcp_servers;
pub use config_toml::ConfigEditsBuilder;
pub use types::AppToolApproval;
pub use types::AppToolConfig;
pub use types::AppToolsConfig;
pub use types::BundledSkillsConfig;
pub use types::DEFAULT_MEMORIES_MAX_RAW_MEMORIES_FOR_CONSOLIDATION;
pub use types::DEFAULT_TERMINAL_RESIZE_REFLOW_FALLBACK_MAX_ROWS;
pub use types::FeedbackConfigToml;
pub use types::HistoryPersistence;
pub use types::KeybindingSpec;
pub use types::KeybindingsSpec;
pub use types::MemoriesToml;
pub use types::NotificationCondition;
pub use types::NotificationMethod;
pub use types::Notifications;
pub use types::Tui;
pub use types::WindowsToml;
pub use permissions_toml::NetworkDomainPermissionsToml;
pub use permissions_toml::NetworkDomainPermissionToml;
pub use permissions_toml::NetworkUnixSocketPermissionsToml;
pub use permissions_toml::NetworkUnixSocketPermissionToml;
pub use permissions_toml::NetworkToml;
pub use permissions_toml::PermissionsToml;
pub use permissions_toml::PermissionProfileToml;
pub use permissions_toml::FilesystemPermissionsToml;
pub use permissions_toml::FilesystemPermissionToml;
