//! Native Messaging Message Types and Serialization

use serde::{Deserialize, Serialize};

/// Accessibility tree node for web pages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessibilityNode {
    /// Unique ID for this node
    pub id: String,
    /// Role of the element (button, textbox, link, etc.)
    pub role: String,
    /// Name/label of the element
    pub name: Option<String>,
    /// Value (for inputs)
    pub value: Option<String>,
    /// Description
    pub description: Option<String>,
    /// Bounding box
    pub bounds: Option<NodeBounds>,
    /// Whether the element is focusable
    pub focusable: bool,
    /// Whether the element is focused
    pub focused: bool,
    /// Whether the element is enabled
    pub enabled: bool,
    /// Whether the element is visible
    pub visible: bool,
    /// Child nodes
    pub children: Vec<AccessibilityNode>,
    /// HTML attributes
    pub attributes: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Tab information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabInfo {
    pub id: i32,
    pub url: String,
    pub title: String,
    pub active: bool,
    pub window_id: i32,
    pub favicon_url: Option<String>,
    pub status: String,
}

/// Page information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageInfo {
    pub url: String,
    pub title: String,
    pub favicon_url: Option<String>,
    pub ready_state: String,
    pub scroll_position: ScrollPosition,
    pub viewport_size: ViewportSize,
    pub document_size: DocumentSize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrollPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewportSize {
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentSize {
    pub width: f64,
    pub height: f64,
}

/// Element information from DOM
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementInfo {
    pub tag_name: String,
    pub id: Option<String>,
    pub class_list: Vec<String>,
    pub text_content: Option<String>,
    pub inner_html: Option<String>,
    pub attributes: std::collections::HashMap<String, String>,
    pub bounds: NodeBounds,
    pub is_visible: bool,
    pub is_enabled: bool,
    pub is_focusable: bool,
}

/// Screenshot result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotResult {
    /// Base64 encoded image data
    pub data: String,
    /// Image format (png, jpeg)
    pub format: String,
    /// Image width
    pub width: u32,
    /// Image height
    pub height: u32,
    /// Tab ID where screenshot was taken
    pub tab_id: i32,
    /// Timestamp
    pub timestamp: u64,
}

/// Form field for auto-fill
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormField {
    pub selector: String,
    pub field_type: String,
    pub name: Option<String>,
    pub label: Option<String>,
    pub value: Option<String>,
    pub placeholder: Option<String>,
    pub required: bool,
    pub readonly: bool,
    pub bounds: NodeBounds,
}

/// Form data for submission
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormData {
    pub action: Option<String>,
    pub method: String,
    pub fields: Vec<FormField>,
}

/// Extension capabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionCapabilities {
    pub version: String,
    pub supports_accessibility_tree: bool,
    pub supports_screenshot: bool,
    pub supports_cookies: bool,
    pub supports_local_storage: bool,
    pub supports_form_fill: bool,
    pub supports_script_execution: bool,
}

impl Default for ExtensionCapabilities {
    fn default() -> Self {
        Self {
            version: "1.0.0".to_string(),
            supports_accessibility_tree: true,
            supports_screenshot: true,
            supports_cookies: true,
            supports_local_storage: true,
            supports_form_fill: true,
            supports_script_execution: false, // Disabled by default for security
        }
    }
}

/// Browser action recording entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordedAction {
    pub timestamp: u64,
    pub action_type: RecordedActionType,
    pub target: Option<ActionTarget>,
    pub value: Option<String>,
    pub tab_id: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecordedActionType {
    Click,
    Type,
    Navigate,
    Scroll,
    Select,
    Check,
    Submit,
    Focus,
    Blur,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionTarget {
    pub selector: String,
    pub tag_name: String,
    pub text: Option<String>,
    pub attributes: std::collections::HashMap<String, String>,
}

/// Convert accessibility tree to flat list for easier processing
pub fn flatten_accessibility_tree(node: &AccessibilityNode) -> Vec<&AccessibilityNode> {
    let mut result = vec![node];
    for child in &node.children {
        result.extend(flatten_accessibility_tree(child));
    }
    result
}

/// Find focusable elements in accessibility tree
pub fn find_focusable_elements(node: &AccessibilityNode) -> Vec<&AccessibilityNode> {
    flatten_accessibility_tree(node)
        .into_iter()
        .filter(|n| n.focusable && n.visible && n.enabled)
        .collect()
}

/// Find interactive elements (buttons, links, inputs)
pub fn find_interactive_elements(node: &AccessibilityNode) -> Vec<&AccessibilityNode> {
    let interactive_roles = [
        "button", "link", "textbox", "checkbox", "radio", "combobox", "menuitem", "tab",
    ];

    flatten_accessibility_tree(node)
        .into_iter()
        .filter(|n| {
            n.visible && n.enabled && interactive_roles.contains(&n.role.to_lowercase().as_str())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_flatten_accessibility_tree() {
        let tree = AccessibilityNode {
            id: "root".to_string(),
            role: "document".to_string(),
            name: Some("Test Page".to_string()),
            value: None,
            description: None,
            bounds: None,
            focusable: false,
            focused: false,
            enabled: true,
            visible: true,
            children: vec![AccessibilityNode {
                id: "btn1".to_string(),
                role: "button".to_string(),
                name: Some("Submit".to_string()),
                value: None,
                description: None,
                bounds: None,
                focusable: true,
                focused: false,
                enabled: true,
                visible: true,
                children: vec![],
                attributes: std::collections::HashMap::new(),
            }],
            attributes: std::collections::HashMap::new(),
        };

        let flat = flatten_accessibility_tree(&tree);
        assert_eq!(flat.len(), 2);
    }
}
