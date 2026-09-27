#[derive(Debug, Clone, PartialEq)]
pub struct McpNotification {
    pub method: String,
    pub params: serde_json::Value,
}
