//! Anthropic-defined tool entries the chat path sends in the native format:
//! the `web_search` server tool and the computer use client toolset.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const COMPUTER_TOOLSET_TYPE: &str = "computer_toolset_20260801";

/// Anthropic-defined tool entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerTool {
    /// Web search tool for real-time search (web_search_20250305)
    #[serde(rename = "web_search_20250305")]
    WebSearch20250305 {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        max_uses: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        allowed_domains: Option<Vec<String>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        blocked_domains: Option<Vec<String>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        user_location: Option<UserLocation>,
    },

    /// Computer use client toolset. The entry takes no `name` and no display
    /// size; the API rejects both.
    #[serde(rename = "computer_toolset_20260801")]
    ComputerToolset20260801 {
        #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
        configs: BTreeMap<String, ToolsetMemberConfig>,
    },
}

/// Per-member settings of a client toolset entry. The API accepts only these
/// two fields and rejects any other.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolsetMemberConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub defer_loading: Option<bool>,
}

/// User location for web search localization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserLocation {
    #[serde(rename = "type")]
    pub location_type: String,
    pub city: String,
    pub region: String,
    pub country: String,
    pub timezone: String,
}

impl UserLocation {
    pub fn approximate(city: String, region: String, country: String, timezone: String) -> Self {
        Self {
            location_type: "approximate".to_string(),
            city,
            region,
            country,
            timezone,
        }
    }
}

/// Known Anthropic server tool names for detection during request adaptation.
/// When a tool name matches one of these, it should be sent in the server-tool
/// format (`{"type": "web_search_20250305", ...}`) rather than the regular
/// function-calling format (`{"name": ..., "input_schema": ...}`).
pub const ANTHROPIC_SERVER_TOOL_NAMES: &[&str] = &[COMPUTER_TOOLSET_TYPE, "web_search"];

/// Check if a tool name corresponds to a known Anthropic server-side tool.
pub fn is_anthropic_server_tool(name: &str) -> bool {
    ANTHROPIC_SERVER_TOOL_NAMES.contains(&name)
}

/// Build the server-tool JSON definition for the Anthropic API.
/// Server tools use a typed format: `{"type": "<versioned_type>", "name": "<name>", ...}`
///
/// `parameters` is the caller's `ToolDefinition::parameters`. Only the computer
/// toolset reads it, for the per-member `configs` it withholds members with.
pub fn build_server_tool_definition(
    name: &str,
    parameters: &serde_json::Value,
) -> Option<serde_json::Value> {
    match name {
        "web_search" => Some(serde_json::json!({
            "type": "web_search_20250305",
            "name": "web_search",
            "max_uses": 5
        })),
        COMPUTER_TOOLSET_TYPE => Some(computer_toolset_definition(parameters)),
        _ => None,
    }
}

fn computer_toolset_definition(parameters: &serde_json::Value) -> serde_json::Value {
    let configs: BTreeMap<String, ToolsetMemberConfig> = parameters
        .get("configs")
        .and_then(|configs| serde_json::from_value(configs.clone()).ok())
        .unwrap_or_default();

    serde_json::to_value(ServerTool::ComputerToolset20260801 { configs })
        .unwrap_or_else(|_| serde_json::json!({ "type": COMPUTER_TOOLSET_TYPE }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn test_server_tool_serialization() {
        let tool = ServerTool::WebSearch20250305 {
            name: "web_search".to_string(),
            max_uses: Some(5),
            allowed_domains: None,
            blocked_domains: None,
            user_location: None,
        };

        let json = serde_json::to_string(&tool).unwrap();
        assert!(json.contains("web_search_20250305"));
        assert!(json.contains("max_uses"));
    }

    #[test]
    fn test_user_location() {
        let location = UserLocation::approximate(
            "San Francisco".to_string(),
            "California".to_string(),
            "US".to_string(),
            "America/Los_Angeles".to_string(),
        );

        assert_eq!(location.location_type, "approximate");
        assert_eq!(location.city, "San Francisco");
    }

    #[test]
    fn test_server_tool_registry_names_are_buildable() {
        for tool_name in ANTHROPIC_SERVER_TOOL_NAMES {
            let built = build_server_tool_definition(tool_name, &Value::Null);
            assert!(
                built.is_some(),
                "server tool '{}' must be buildable from registry names",
                tool_name
            );
        }
    }

    /// Anthropic's computer tool is a client tool versioned per model, with
    /// the display size of the screen being driven. A fixed version and a
    /// fixed 1920x1080 display sent every model a contract it may not accept,
    /// and a function tool someone names "computer" must stay a function tool.
    #[test]
    fn computer_is_not_sent_as_a_fixed_server_tool() {
        assert!(!is_anthropic_server_tool("computer"));
        assert!(build_server_tool_definition("computer", &Value::Null).is_none());
    }

    // Fixture: the request body under "After" in
    // platform.claude.com/docs/en/models/opus-5-5/migration-guide, whose
    // `tools` array is `[{"type": "computer_toolset_20260801"}]`.
    #[test]
    fn computer_tool_is_the_bare_toolset_entry() {
        let computer = build_server_tool_definition(COMPUTER_TOOLSET_TYPE, &Value::Null)
            .expect("computer tool definition");
        assert_eq!(
            computer,
            serde_json::json!({ "type": "computer_toolset_20260801" })
        );
    }

    // Fixture: the `tools` entry "after the change" under "Migrate from
    // `computer_20251124`" in
    // platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool.
    #[test]
    fn computer_toolset_carries_member_configs() {
        let computer = build_server_tool_definition(
            COMPUTER_TOOLSET_TYPE,
            &serde_json::json!({ "configs": { "zoom": { "enabled": false } } }),
        )
        .expect("computer tool definition");
        assert_eq!(
            computer,
            serde_json::json!({
                "type": "computer_toolset_20260801",
                "configs": { "zoom": { "enabled": false } }
            })
        );
    }

    // The entry rejects `name`, `display_width_px`, `display_height_px`,
    // `display_number` and `enable_zoom` with an `invalid_request_error`
    // ("Tool parameters", same page), so nothing a caller passes may leak in.
    #[test]
    fn computer_toolset_drops_every_field_the_entry_rejects() {
        let computer = build_server_tool_definition(
            COMPUTER_TOOLSET_TYPE,
            &serde_json::json!({
                "name": "computer",
                "display_width_px": 1024,
                "display_height_px": 768,
                "display_number": 1,
                "enable_zoom": true,
                "strict": true,
                "configs": { "zoom": { "enabled": false, "strict": true } }
            }),
        )
        .expect("computer tool definition");
        assert_eq!(
            computer,
            serde_json::json!({
                "type": "computer_toolset_20260801",
                "configs": { "zoom": { "enabled": false } }
            })
        );
    }

    #[test]
    fn computer_toolset_enum_serialises_without_a_name() {
        let entry = serde_json::to_value(ServerTool::ComputerToolset20260801 {
            configs: BTreeMap::new(),
        })
        .expect("toolset entry serialises");
        assert_eq!(entry, serde_json::json!({ "type": COMPUTER_TOOLSET_TYPE }));
    }
}
