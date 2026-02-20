//! Server-side tool definitions for Anthropic Claude API.
//!
//! These tools are executed server-side by Anthropic's API, not client-side.
//! Includes: text_editor, web_search, web_fetch, memory, bash, computer, tool_search.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Server-side tool definition that runs on Anthropic's servers
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerTool {
    /// Text editor tool for file operations (Claude 4.x: text_editor_20250728)
    #[serde(rename = "text_editor_20250728")]
    TextEditor20250728 {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        max_characters: Option<u32>,
    },

    /// Legacy text editor tool for earlier model families.
    #[serde(rename = "text_editor_20250429")]
    TextEditor20250429 {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        max_characters: Option<u32>,
    },

    /// Legacy text editor tool for older model families.
    #[serde(rename = "text_editor_20250124")]
    TextEditor20250124 {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        max_characters: Option<u32>,
    },

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

    /// Web fetch tool for retrieving web content (web_fetch_20250305)
    #[serde(rename = "web_fetch_20250305")]
    WebFetch20250305 {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        max_uses: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        allowed_domains: Option<Vec<String>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        blocked_domains: Option<Vec<String>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        citations: Option<CitationsConfig>,
        #[serde(skip_serializing_if = "Option::is_none")]
        max_content_tokens: Option<u32>,
    },

    /// Memory tool for persistent storage (memory_20250728)
    #[serde(rename = "memory_20250728")]
    Memory20250728 { name: String },

    /// Bash tool for command execution (bash_20250124)
    #[serde(rename = "bash_20250124")]
    Bash20250124 { name: String },

    /// Computer use tool for desktop interaction (computer_20250124)
    #[serde(rename = "computer_20250124")]
    Computer20250124 {
        name: String,
        display_width_px: u32,
        display_height_px: u32,
        display_number: Option<u32>,
    },

    /// Tool search tool with regex (tool_search_tool_regex_20251119)
    #[serde(rename = "tool_search_tool_regex_20251119")]
    ToolSearchRegex20251119 { name: String },

    /// Tool search tool with BM25 (tool_search_tool_bm25_20251119)
    #[serde(rename = "tool_search_tool_bm25_20251119")]
    ToolSearchBm2520251119 { name: String },

    /// Code execution tool for sandboxed Python (code_execution_20250522)
    #[serde(rename = "code_execution_20250522")]
    CodeExecution20250522 { name: String },
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

/// Citations configuration for web fetch
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CitationsConfig {
    pub enabled: bool,
}

/// Server tool use block in responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerToolUse {
    #[serde(rename = "type")]
    pub block_type: String, // "server_tool_use"
    pub id: String,
    pub name: String,
    pub input: Value,
}

/// Tool search result reference
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolReference {
    #[serde(rename = "type")]
    pub reference_type: String, // "tool_reference"
    pub tool_name: String,
}

/// Web search result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSearchResult {
    #[serde(rename = "type")]
    pub result_type: String, // "web_search_result"
    pub url: String,
    pub title: String,
    pub encrypted_content: String,
    pub page_age: String,
}

/// Web fetch result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebFetchResult {
    #[serde(rename = "type")]
    pub result_type: String, // "web_fetch_result"
    pub url: String,
    pub content: DocumentContent,
    pub retrieved_at: String,
}

/// Content from a fetched document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentContent {
    #[serde(rename = "type")]
    pub content_type: String,
    pub text: String,
}

/// Known Anthropic server tool names for detection during request adaptation.
/// When a tool name matches one of these, it should be sent in the server-tool
/// format (`{"type": "web_search_20250305", ...}`) rather than the regular
/// function-calling format (`{"name": ..., "input_schema": ...}`).
pub const ANTHROPIC_SERVER_TOOL_NAMES: &[&str] = &[
    "web_search",
    "web_fetch",
    "text_editor",
    "bash",
    "memory",
    "computer",
    "code_execution",
    // Canonical names
    "tool_search_tool_regex",
    "tool_search_tool_bm25",
    // Backward-compatible aliases
    "tool_search_regex",
    "tool_search_bm25",
];

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
        "web_fetch" => Some(serde_json::json!({
            "type": "web_fetch_20250305",
            "name": "web_fetch",
            "max_uses": 5
        })),
        "text_editor" => Some(serde_json::json!({
            "type": "text_editor_20250728",
            "name": "text_editor"
        })),
        "bash" => Some(serde_json::json!({
            "type": "bash_20250124",
            "name": "bash"
        })),
        "memory" => Some(serde_json::json!({
            "type": "memory_20250728",
            "name": "memory"
        })),
        "computer" => Some(serde_json::json!({
            "type": "computer_20250124",
            "name": "computer",
            "display_width_px": 1920,
            "display_height_px": 1080
        })),
        "code_execution" => Some(serde_json::json!({
            "type": "code_execution_20250522",
            "name": "code_execution"
        })),
        "tool_search_tool_regex" | "tool_search_regex" => Some(serde_json::json!({
            "type": "tool_search_tool_regex_20251119",
            "name": "tool_search_tool_regex"
        })),
        "tool_search_tool_bm25" | "tool_search_bm25" => Some(serde_json::json!({
            "type": "tool_search_tool_bm25_20251119",
            "name": "tool_search_tool_bm25"
        })),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
            let built = build_server_tool_definition(tool_name);
            assert!(
                built.is_some(),
                "server tool '{}' must be buildable from registry names",
                tool_name
            );
        }
    }

    #[test]
    fn test_tool_search_names_use_latest_versions() {
        let regex_tool =
            build_server_tool_definition("tool_search_tool_regex").expect("regex tool definition");
        assert_eq!(
            regex_tool["type"], "tool_search_tool_regex_20251119",
            "regex tool must use latest versioned type"
        );
        assert_eq!(regex_tool["name"], "tool_search_tool_regex");

        let bm25_tool =
            build_server_tool_definition("tool_search_tool_bm25").expect("bm25 tool definition");
        assert_eq!(
            bm25_tool["type"], "tool_search_tool_bm25_20251119",
            "bm25 tool must use latest versioned type"
        );
        assert_eq!(bm25_tool["name"], "tool_search_tool_bm25");
    }

    #[test]
    fn test_tool_search_legacy_aliases_map_to_canonical_names() {
        let regex_alias =
            build_server_tool_definition("tool_search_regex").expect("regex alias definition");
        assert_eq!(regex_alias["name"], "tool_search_tool_regex");

        let bm25_alias =
            build_server_tool_definition("tool_search_bm25").expect("bm25 alias definition");
        assert_eq!(bm25_alias["name"], "tool_search_tool_bm25");
    }
}
