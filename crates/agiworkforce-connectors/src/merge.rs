use std::collections::HashMap;

use agiworkforce_app_server_protocol::AppInfo;

use crate::connector_install_url;

/// Convert a plugin connector ID (which has no metadata) into a placeholder `AppInfo`.
/// The name defaults to the connector ID until it is enriched by a real `AppInfo`.
pub fn plugin_connector_to_app_info(connector_id: String) -> AppInfo {
    AppInfo {
        install_url: Some(connector_install_url(&connector_id, &connector_id)),
        name: connector_id.clone(),
        id: connector_id,
        description: None,
        logo_url: None,
        logo_url_dark: None,
        distribution_channel: None,
        branding: None,
        app_metadata: None,
        labels: None,
        is_accessible: false,
        is_enabled: true,
        plugin_display_names: Vec::new(),
    }
}

/// Merge a list of plugin-backed connector placeholders with an authoritative list of
/// accessible connectors. The accessible connector's metadata takes precedence; plugin
/// display names are unioned.
///
/// Connectors that are only in `accessible` (i.e. not in `plugin_connectors`) are
/// also included in the result.
pub fn merge_connectors(
    plugin_connectors: Vec<AppInfo>,
    accessible_connectors: Vec<AppInfo>,
) -> Vec<AppInfo> {
    let mut result: HashMap<String, AppInfo> = plugin_connectors
        .into_iter()
        .map(|c| (c.id.clone(), c))
        .collect();

    for accessible in accessible_connectors {
        let id = accessible.id.clone();
        if let Some(existing) = result.get_mut(&id) {
            // Prefer accessible metadata.
            let plugin_display_names = std::mem::take(&mut existing.plugin_display_names);
            *existing = accessible;
            // Union plugin display names.
            for name in plugin_display_names {
                if !existing.plugin_display_names.contains(&name) {
                    existing.plugin_display_names.push(name);
                }
            }
        } else {
            result.insert(id, accessible);
        }
    }

    result.into_values().collect()
}

/// Merge plugin connector IDs (strings) with an existing list of accessible connectors.
///
/// Each plugin connector ID that does not already appear in `accessible_connectors`
/// is converted to a placeholder `AppInfo` via `plugin_connector_to_app_info`.
pub fn merge_plugin_connectors_with_accessible(
    plugin_connector_ids: impl Iterator<Item = String>,
    accessible_connectors: Vec<AppInfo>,
) -> Vec<AppInfo> {
    let plugin_connectors: Vec<AppInfo> = plugin_connector_ids
        .map(plugin_connector_to_app_info)
        .collect();
    merge_connectors(plugin_connectors, accessible_connectors)
}
