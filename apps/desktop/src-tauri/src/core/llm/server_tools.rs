//! The Anthropic `web_search` server tool, which the chat path sends in its
//! native typed format rather than as a function tool.

/// Known Anthropic server tool names for detection during request adaptation.
/// When a tool name matches one of these, it should be sent in the server-tool
/// format (`{"type": "web_search_20250305", ...}`) rather than the regular
/// function-calling format (`{"name": ..., "input_schema": ...}`).
pub const ANTHROPIC_SERVER_TOOL_NAMES: &[&str] = &["web_search"];

/// Check if a tool name corresponds to a known Anthropic server-side tool.
pub fn is_anthropic_server_tool(name: &str) -> bool {
    ANTHROPIC_SERVER_TOOL_NAMES.contains(&name)
}

/// Build the server-tool JSON definition for the Anthropic API.
/// Server tools use a typed format: `{"type": "<versioned_type>", "name": "<name>", ...}`
pub fn build_server_tool_definition(name: &str) -> Option<serde_json::Value> {
    match name {
        "web_search" => Some(serde_json::json!({
            "type": "web_search_20250305",
            "name": "web_search",
            "max_uses": 5
        })),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_server_tool_registry_names_are_buildable() {
        for tool_name in ANTHROPIC_SERVER_TOOL_NAMES {
            assert!(
                build_server_tool_definition(tool_name).is_some(),
                "server tool '{}' must be buildable from registry names",
                tool_name
            );
        }
    }

    #[test]
    fn web_search_is_the_versioned_server_tool_entry() {
        let web_search = build_server_tool_definition("web_search").expect("web search entry");
        assert_eq!(web_search["type"], "web_search_20250305");
        assert_eq!(web_search["max_uses"], 5);
    }

    /// Anthropic's computer tool is a client tool versioned per model, with
    /// the display size of the screen being driven. A function tool someone
    /// names "computer" must stay a function tool.
    #[test]
    fn computer_is_not_sent_as_a_server_tool() {
        assert!(!is_anthropic_server_tool("computer"));
        assert!(build_server_tool_definition("computer").is_none());
    }
}
