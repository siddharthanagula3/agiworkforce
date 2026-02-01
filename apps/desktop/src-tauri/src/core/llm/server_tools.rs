//! Server-side tool definitions for Anthropic Claude API.
//!
//! These tools are executed server-side by Anthropic's API, not client-side.
//! Includes: text_editor, web_search, web_fetch, memory, bash, computer_use, tool_search.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Server-side tool definition that runs on Anthropic's servers
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerTool {
    /// Text editor tool for file operations (Claude 4.x: text_editor_20250728)
    TextEditor20250728 {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        max_characters: Option<u32>,
    },

    /// Web search tool for real-time search (web_search_20250305)
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

    /// Web fetch tool for retrieving web content (web_fetch_20250910)
    WebFetch20250910 {
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

    /// Memory tool for persistent storage (memory_20250818)
    Memory20250818 { name: String },

    /// Bash tool for command execution (bash_20250124)
    Bash20250124 { name: String },

    /// Computer use tool for desktop interaction (computer-use-2025-11-24)
    ComputerUse20251124 {
        name: String,
        display_width_px: u32,
        display_height_px: u32,
        display_number: Option<u32>,
    },

    /// Tool search tool with regex (tool_search_tool_regex_20251119)
    ToolSearchRegex20251119 { name: String },

    /// Tool search tool with BM25 (tool_search_tool_bm25_20251119)
    ToolSearchBm2520251119 { name: String },
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

use super::DocumentContent;

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
}
