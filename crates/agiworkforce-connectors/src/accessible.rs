use std::collections::HashMap;

use agiworkforce_app_server_protocol::AppInfo;

use crate::connector_install_url;

/// Represents a single MCP tool that belongs to an accessible connector.
pub struct AccessibleConnectorTool {
    pub connector_id: String,
    pub connector_name: Option<String>,
    pub connector_description: Option<String>,
    pub plugin_display_names: Vec<String>,
}

/// Aggregate a flat iterator of `AccessibleConnectorTool` items into one `AppInfo`
/// per connector ID, merging plugin display names and taking the first non-None name.
pub fn collect_accessible_connectors(
    tools: impl Iterator<Item = AccessibleConnectorTool>,
) -> Vec<AppInfo> {
    let mut by_id: HashMap<String, AppInfo> = HashMap::new();

    for tool in tools {
        let entry = by_id
            .entry(tool.connector_id.clone())
            .or_insert_with(|| {
                let name = tool
                    .connector_name
                    .clone()
                    .unwrap_or_else(|| tool.connector_id.clone());
                AppInfo {
                    id: tool.connector_id.clone(),
                    name: name.clone(),
                    description: tool.connector_description.clone(),
                    logo_url: None,
                    logo_url_dark: None,
                    distribution_channel: None,
                    branding: None,
                    app_metadata: None,
                    labels: None,
                    install_url: Some(connector_install_url(&name, &tool.connector_id)),
                    is_accessible: true,
                    is_enabled: true,
                    plugin_display_names: Vec::new(),
                }
            });

        // Merge plugin display names (deduplicate while preserving order).
        for display_name in tool.plugin_display_names {
            if !entry.plugin_display_names.contains(&display_name) {
                entry.plugin_display_names.push(display_name);
            }
        }

        // If we now have a richer name, update.
        if entry.name == tool.connector_id {
            if let Some(name) = tool.connector_name {
                if !name.is_empty() {
                    entry.install_url = Some(connector_install_url(&name, &entry.id));
                    entry.name = name;
                }
            }
        }

        // Fill description if missing.
        if entry.description.is_none() {
            entry.description = tool.connector_description;
        }
    }

    by_id.into_values().collect()
}
