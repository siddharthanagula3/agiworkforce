use agiworkforce_config::types::McpServerConfig;

mod discoverable;
mod injection;
mod manager;
mod mentions;
mod render;
mod startup_sync;
#[cfg(test)]
pub(crate) mod test_support;

pub use agiworkforce_core_plugins::marketplace_upgrade::ConfiguredMarketplaceUpgradeError as PluginMarketplaceUpgradeError;
pub use agiworkforce_core_plugins::marketplace_upgrade::ConfiguredMarketplaceUpgradeOutcome as PluginMarketplaceUpgradeOutcome;
pub use agiworkforce_plugin::AppConnectorId;
pub use agiworkforce_plugin::EffectiveSkillRoots;
pub use agiworkforce_plugin::PluginCapabilitySummary;
pub use agiworkforce_plugin::PluginId;
pub use agiworkforce_plugin::PluginIdError;
pub use agiworkforce_plugin::PluginTelemetryMetadata;
pub use agiworkforce_plugin::validate_plugin_segment;

pub type LoadedPlugin = agiworkforce_plugin::LoadedPlugin<McpServerConfig>;
pub type PluginLoadOutcome = agiworkforce_plugin::PluginLoadOutcome<McpServerConfig>;

pub(crate) use discoverable::list_tool_suggest_discoverable_plugins;
pub(crate) use injection::build_plugin_injections;
pub use manager::ConfiguredMarketplace;
pub use manager::ConfiguredMarketplaceListOutcome;
pub use manager::ConfiguredMarketplacePlugin;
pub use manager::PluginDetail;
pub use manager::PluginDetailsUnavailableReason;
pub use manager::PluginInstallError;
pub use manager::PluginInstallOutcome;
pub use manager::PluginInstallRequest;
pub use manager::PluginReadOutcome;
pub use manager::PluginReadRequest;
pub use manager::PluginRemoteSyncError;
pub use manager::PluginUninstallError;
pub use manager::PluginsManager;
pub use manager::RemotePluginSyncResult;
pub(crate) use render::render_explicit_plugin_instructions;

pub(crate) use mentions::build_connector_slug_counts;
pub(crate) use mentions::build_skill_name_counts;
pub(crate) use mentions::collect_explicit_app_ids;
pub(crate) use mentions::collect_explicit_plugin_mentions;
pub(crate) use mentions::collect_tool_mentions_from_messages;
