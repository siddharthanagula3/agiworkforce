use agiworkforce_app_server_protocol::AppInfo;

use crate::connector_name_slug;

/// Return the display label for a connector (its name).
pub fn connector_display_label(connector: &AppInfo) -> String {
    connector.name.clone()
}

/// Return a URL-safe slug derived from the connector name (e.g. "Google Calendar" → "google-calendar").
pub fn connector_mention_slug(connector: &AppInfo) -> String {
    connector_name_slug(&connector.name)
}

/// Build the chatgpt.com install URL for a connector.
pub fn connector_install_url(name: &str, connector_id: &str) -> String {
    crate::connector_install_url(name, connector_id)
}

/// Sanitize a connector name for use in an MCP tool namespace.
/// Replaces any non-alphanumeric ASCII characters with underscores and lowercases everything.
pub fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect()
}
