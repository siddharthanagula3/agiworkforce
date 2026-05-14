//! MCP resource enumeration + reading.

use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct McpResource {
    pub uri: String,
    pub name: String,
    pub description: Option<String>,
    pub mime_type: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct McpResourceList {
    pub resources: Vec<McpResource>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resource_serde_roundtrip() {
        let r = McpResource {
            uri: "file:///x.txt".into(),
            name: "x.txt".into(),
            description: Some("test".into()),
            mime_type: Some("text/plain".into()),
        };
        let j = serde_json::to_string(&r).unwrap();
        let back: McpResource = serde_json::from_str(&j).unwrap();
        assert_eq!(r, back);
    }

    #[test]
    fn resource_list_with_cursor_roundtrip() {
        let l = McpResourceList {
            resources: vec![],
            next_cursor: Some("c1".into()),
        };
        let j = serde_json::to_string(&l).unwrap();
        let back: McpResourceList = serde_json::from_str(&j).unwrap();
        assert_eq!(back.next_cursor.as_deref(), Some("c1"));
    }

    #[test]
    fn resource_list_without_cursor_omits_field() {
        let l = McpResourceList {
            resources: vec![],
            next_cursor: None,
        };
        let j = serde_json::to_string(&l).unwrap();
        assert!(!j.contains("next_cursor") && !j.contains("nextCursor"));
    }

    #[test]
    fn resource_optional_fields_missing_on_none() {
        let r = McpResource {
            uri: "file:///y.txt".into(),
            name: "y.txt".into(),
            description: None,
            mime_type: None,
        };
        let j = serde_json::to_string(&r).unwrap();
        let back: McpResource = serde_json::from_str(&j).unwrap();
        assert_eq!(r, back);
        assert!(back.description.is_none());
    }
}
