//! MCP resource wire shapes, kept here until agiworkforce_protocol::mcp models them.
//! Parsing is lenient like `Tool::from_mcp_value`: unknown or missing optional fields still list.

use serde::{Deserialize, Serialize};

/// One concrete thing a server will hand over, named by its own URI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct McpResource {
    pub uri: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "mimeType", default, skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

/// A family of resources the caller names by filling in the template.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct McpResourceTemplate {
    #[serde(rename = "uriTemplate")]
    pub uri_template: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "mimeType", default, skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
}

/// One block of a resource's contents. Text and blob are mutually exclusive on
/// the wire; both are optional here so an unreadable block is still listed
/// rather than failing the whole read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct McpResourceContents {
    pub uri: String,
    #[serde(rename = "mimeType", default, skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blob: Option<String>,
}

fn parse_list<T: serde::de::DeserializeOwned>(
    response: Option<serde_json::Value>,
    key: &str,
) -> Vec<T> {
    response
        .and_then(|result| result.get(key).cloned())
        .and_then(|items| items.as_array().cloned())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| serde_json::from_value(item).ok())
        .collect()
}

pub(crate) fn parse_resources(response: Option<serde_json::Value>) -> Vec<McpResource> {
    parse_list(response, "resources")
}

pub(crate) fn parse_resource_templates(
    response: Option<serde_json::Value>,
) -> Vec<McpResourceTemplate> {
    parse_list(response, "resourceTemplates")
}

pub(crate) fn parse_resource_contents(
    response: Option<serde_json::Value>,
) -> Vec<McpResourceContents> {
    parse_list(response, "contents")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_resource_with_only_its_required_field() {
        let parsed = parse_resources(Some(serde_json::json!({
            "resources": [{ "uri": "file:///a.md" }]
        })));
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].uri, "file:///a.md");
        assert!(parsed[0].mime_type.is_none());
    }

    #[test]
    fn keeps_the_resources_a_server_described_correctly() {
        let parsed = parse_resources(Some(serde_json::json!({
            "resources": [
                { "uri": "file:///a.md", "name": "a", "mimeType": "text/markdown", "size": 12 },
                { "name": "no uri at all" }
            ]
        })));
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].size, Some(12));
        assert_eq!(parsed[0].mime_type.as_deref(), Some("text/markdown"));
    }

    #[test]
    fn treats_a_server_that_listed_nothing_as_offering_nothing() {
        assert!(parse_resources(None).is_empty());
        assert!(parse_resources(Some(serde_json::json!({}))).is_empty());
        assert!(parse_resource_templates(Some(serde_json::json!({ "resources": [] }))).is_empty());
    }

    #[test]
    fn reads_both_text_and_binary_contents() {
        let parsed = parse_resource_contents(Some(serde_json::json!({
            "contents": [
                { "uri": "file:///a.md", "text": "hello" },
                { "uri": "file:///a.png", "blob": "aGk=", "mimeType": "image/png" }
            ]
        })));
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].text.as_deref(), Some("hello"));
        assert_eq!(parsed[1].blob.as_deref(), Some("aGk="));
    }

    #[test]
    fn reads_a_template_by_its_uri_template() {
        let parsed = parse_resource_templates(Some(serde_json::json!({
            "resourceTemplates": [{ "uriTemplate": "acme://issues/{id}", "name": "issue" }]
        })));
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].uri_template, "acme://issues/{id}");
    }
}
