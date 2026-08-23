//! Native Messaging Message Types and Serialization

use super::NativeMessage;
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
///
/// Every flag defaults to `false` when a peer omits it from the wire payload:
/// a capability this side never saw declared must never be treated as granted.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionCapabilities {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub supports_accessibility_tree: bool,
    #[serde(default)]
    pub supports_screenshot: bool,
    #[serde(default)]
    pub supports_cookies: bool,
    #[serde(default)]
    pub supports_local_storage: bool,
    #[serde(default)]
    pub supports_form_fill: bool,
    #[serde(default)]
    pub supports_script_execution: bool,
}

/// A native message capability that must be negotiated before the realtime
/// bridge will run the message.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativeCapability {
    ScriptExecution,
    Cookies,
    LocalStorage,
}

impl NativeCapability {
    pub fn label(self) -> &'static str {
        match self {
            NativeCapability::ScriptExecution => "script execution",
            NativeCapability::Cookies => "cookie access",
            NativeCapability::LocalStorage => "local storage access",
        }
    }

    /// The capability a native message needs before a bridge peer may run it.
    ///
    /// The match is exhaustive on purpose: a new `NativeMessage` variant must be
    /// classified here before the crate compiles, so a message can never reach a
    /// browser sink because nobody remembered to list it. `SetAttribute` needs
    /// the script-execution grant even though it is nominally a DOM write —
    /// `setAttribute("onmouseover", ...)`, `href`, `src`, `srcdoc` and a form's
    /// `action` all turn one attribute write into arbitrary JavaScript in the
    /// live tab or an off-origin submit of whatever that page holds, which is
    /// the same power `ExecuteScript` hands out.
    pub fn required_for(message: &NativeMessage) -> Option<Self> {
        match message {
            NativeMessage::ExecuteScript { .. } | NativeMessage::SetAttribute { .. } => {
                Some(NativeCapability::ScriptExecution)
            }
            NativeMessage::GetCookies { .. } | NativeMessage::SetCookie { .. } => {
                Some(NativeCapability::Cookies)
            }
            NativeMessage::GetLocalStorage { .. } | NativeMessage::SetLocalStorage { .. } => {
                Some(NativeCapability::LocalStorage)
            }
            NativeMessage::Connect { .. }
            | NativeMessage::Disconnect { .. }
            | NativeMessage::Ping
            | NativeMessage::Pong
            | NativeMessage::Click { .. }
            | NativeMessage::Type { .. }
            | NativeMessage::Navigate { .. }
            | NativeMessage::Screenshot { .. }
            | NativeMessage::Hover { .. }
            | NativeMessage::WaitForSelector { .. }
            | NativeMessage::SelectOption { .. }
            | NativeMessage::SetChecked { .. }
            | NativeMessage::Focus { .. }
            | NativeMessage::ScrollIntoView { .. }
            | NativeMessage::GetElement { .. }
            | NativeMessage::GetElements { .. }
            | NativeMessage::GetText { .. }
            | NativeMessage::GetAttribute { .. }
            | NativeMessage::GetAccessibilityTree { .. }
            | NativeMessage::GetFocusableElements { .. }
            | NativeMessage::GetTabs
            | NativeMessage::GetActiveTab
            | NativeMessage::CreateTab { .. }
            | NativeMessage::CloseTab { .. }
            | NativeMessage::SwitchTab { .. }
            | NativeMessage::GetPageInfo { .. }
            | NativeMessage::GetPageContent { .. }
            | NativeMessage::PageContext { .. }
            | NativeMessage::TaskResult { .. }
            | NativeMessage::SelectedTextQuery(_)
            | NativeMessage::Response { .. } => None,
        }
    }
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

impl ExtensionCapabilities {
    /// What a connection holds before it has negotiated anything.
    pub fn none() -> Self {
        Self {
            version: String::new(),
            supports_accessibility_tree: false,
            supports_screenshot: false,
            supports_cookies: false,
            supports_local_storage: false,
            supports_form_fill: false,
            supports_script_execution: false,
        }
    }

    /// The most the realtime bridge may ever grant a peer.
    ///
    /// Presenting the loopback bridge token proves only that the caller runs as
    /// this OS user — not that the user approved arbitrary JavaScript in their
    /// signed-in tabs, or reads of their session cookies and local storage. Those
    /// three stay off the ceiling until a host-side grant exists to raise them,
    /// so a peer declaring them cannot grant them to itself.
    pub fn bridge_ceiling() -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            supports_accessibility_tree: true,
            supports_screenshot: true,
            supports_cookies: false,
            supports_local_storage: false,
            supports_form_fill: true,
            supports_script_execution: false,
        }
    }

    /// Grant the intersection of what the peer declared and the bridge ceiling.
    pub fn negotiate(declared: &Self) -> Self {
        let ceiling = Self::bridge_ceiling();
        Self {
            version: ceiling.version,
            supports_accessibility_tree: declared.supports_accessibility_tree
                && ceiling.supports_accessibility_tree,
            supports_screenshot: declared.supports_screenshot && ceiling.supports_screenshot,
            supports_cookies: declared.supports_cookies && ceiling.supports_cookies,
            supports_local_storage: declared.supports_local_storage
                && ceiling.supports_local_storage,
            supports_form_fill: declared.supports_form_fill && ceiling.supports_form_fill,
            supports_script_execution: declared.supports_script_execution
                && ceiling.supports_script_execution,
        }
    }

    pub fn grants(&self, capability: NativeCapability) -> bool {
        match capability {
            NativeCapability::ScriptExecution => self.supports_script_execution,
            NativeCapability::Cookies => self.supports_cookies,
            NativeCapability::LocalStorage => self.supports_local_storage,
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
