use std::collections::HashSet;

use agiworkforce_app_server_protocol::AppInfo;

/// Connector IDs that should never be surfaced to the user.
/// These are hardcoded identifiers for internal/reserved connectors.
static DISALLOWED_CONNECTOR_IDS: &[&str] = &[
    "asdk_app_6938a94a61d881918ef32cb999ff937c",
    "connector_3f8d1a79f27c4c7ba1a897ab13bf37dc",
];

/// Originator values that trigger additional filtering of connectors whose IDs
/// start with `connector_0...` (target-specific connectors).
static TARGET_ORIGINATOR_PREFIX: &str = "agiworkforce_atlas";

/// Remove connectors that should not be surfaced in the current context.
///
/// Connectors are removed if:
/// 1. Their ID starts with `connector_openai_` (OpenAI-internal prefix).
/// 2. Their ID is in the hardcoded `DISALLOWED_CONNECTOR_IDS` blocklist.
/// 3. The originator is a "target" originator (e.g. `agiworkforce_atlas`) **and** the
///    connector ID starts with `connector_0…` (target-specific connectors).
pub fn filter_disallowed_connectors(
    connectors: Vec<AppInfo>,
    originator: &str,
) -> Vec<AppInfo> {
    let is_target_originator = originator.starts_with(TARGET_ORIGINATOR_PREFIX);

    connectors
        .into_iter()
        .filter(|connector| {
            let id = connector.id.as_str();

            // Filter OpenAI-prefixed connectors.
            if id.starts_with("connector_openai_") {
                return false;
            }

            // Filter hardcoded disallowed IDs.
            if DISALLOWED_CONNECTOR_IDS.contains(&id) {
                return false;
            }

            // Filter target-specific connectors for non-target originators.
            if is_target_originator && id.starts_with("connector_0") {
                return false;
            }

            true
        })
        .collect()
}

/// Return the subset of `directory_connectors` that are:
/// 1. Present in `connector_ids` (user/plugin-configured).
/// 2. **Not** already accessible (i.e. not in `accessible_connectors`).
///
/// This is used by tool-suggest: only show connectors that the user has
/// configured but hasn't yet installed/authorised.
pub fn filter_tool_suggest_discoverable_connectors(
    directory_connectors: Vec<AppInfo>,
    accessible_connectors: &[AppInfo],
    connector_ids: &HashSet<String>,
    originator: &str,
) -> Vec<AppInfo> {
    let accessible_ids: HashSet<&str> = accessible_connectors
        .iter()
        .filter(|c| c.is_accessible)
        .map(|c| c.id.as_str())
        .collect();

    let allowed = filter_disallowed_connectors(directory_connectors, originator);

    allowed
        .into_iter()
        .filter(|connector| {
            // Must be in the user-configured set.
            if !connector_ids.contains(&connector.id) {
                return false;
            }
            // Must not already be accessible.
            if accessible_ids.contains(connector.id.as_str()) {
                return false;
            }
            true
        })
        .collect()
}
