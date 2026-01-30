//! Hook event types and contexts.
//!
//! Defines all lifecycle events that can trigger hooks, along with
//! the contextual data available for each event type.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// All lifecycle events that can trigger hooks.
///
/// These events fire at key points in the AGI Workforce lifecycle,
/// allowing users to run custom commands for automation, validation,
/// logging, or integration purposes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum HookEvent {
    /// Fired when a new AGI session starts.
    /// Context: session_id, timestamp, user_id
    SessionStart,

    /// Fired when an AGI session ends.
    /// Context: session_id, timestamp, duration_ms, exit_reason
    SessionEnd,

    /// Fired when the user submits a prompt.
    /// Context: session_id, prompt (truncated), timestamp
    UserPromptSubmit,

    /// Fired before a tool is executed.
    /// Context: tool_name, tool_id, arguments (serialized), session_id
    PreToolUse,

    /// Fired after a tool executes successfully.
    /// Context: tool_name, tool_id, result (truncated), duration_ms, session_id
    PostToolUse,

    /// Fired when a tool execution fails.
    /// Context: tool_name, tool_id, error, duration_ms, session_id
    PostToolUseFailure,

    /// Fired when a permission request is made.
    /// Context: permission_type, resource, session_id
    PermissionRequest,

    /// Fired when a sub-agent is spawned.
    /// Context: agent_id, parent_session_id, task_description
    SubagentStart,

    /// Fired when a sub-agent terminates.
    /// Context: agent_id, parent_session_id, exit_reason, duration_ms
    SubagentStop,

    /// Fired when the AGI is stopped (user cancellation or limit).
    /// Context: session_id, reason, timestamp
    Stop,

    /// Fired before context compaction occurs.
    /// Context: session_id, token_count_before, compaction_strategy
    PreCompact,

    /// Fired when a notification is generated.
    /// Context: notification_type, title, body, session_id
    Notification,
}

impl HookEvent {
    /// Returns the string representation used in configuration files.
    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SessionStart => "SessionStart",
            Self::SessionEnd => "SessionEnd",
            Self::UserPromptSubmit => "UserPromptSubmit",
            Self::PreToolUse => "PreToolUse",
            Self::PostToolUse => "PostToolUse",
            Self::PostToolUseFailure => "PostToolUseFailure",
            Self::PermissionRequest => "PermissionRequest",
            Self::SubagentStart => "SubagentStart",
            Self::SubagentStop => "SubagentStop",
            Self::Stop => "Stop",
            Self::PreCompact => "PreCompact",
            Self::Notification => "Notification",
        }
    }

    /// Parse a hook event from a string.
    #[must_use]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "SessionStart" => Some(Self::SessionStart),
            "SessionEnd" => Some(Self::SessionEnd),
            "UserPromptSubmit" => Some(Self::UserPromptSubmit),
            "PreToolUse" => Some(Self::PreToolUse),
            "PostToolUse" => Some(Self::PostToolUse),
            "PostToolUseFailure" => Some(Self::PostToolUseFailure),
            "PermissionRequest" => Some(Self::PermissionRequest),
            "SubagentStart" => Some(Self::SubagentStart),
            "SubagentStop" => Some(Self::SubagentStop),
            "Stop" => Some(Self::Stop),
            "PreCompact" => Some(Self::PreCompact),
            "Notification" => Some(Self::Notification),
            _ => None,
        }
    }

    /// Returns all available hook events.
    #[must_use]
    pub fn all() -> &'static [Self] {
        &[
            Self::SessionStart,
            Self::SessionEnd,
            Self::UserPromptSubmit,
            Self::PreToolUse,
            Self::PostToolUse,
            Self::PostToolUseFailure,
            Self::PermissionRequest,
            Self::SubagentStart,
            Self::SubagentStop,
            Self::Stop,
            Self::PreCompact,
            Self::Notification,
        ]
    }

    /// Returns true if this is a tool-related event that supports matchers.
    #[must_use]
    pub fn supports_matcher(&self) -> bool {
        matches!(
            self,
            Self::PreToolUse | Self::PostToolUse | Self::PostToolUseFailure
        )
    }

    /// Returns true if this is a blocking event (hooks must complete before continuing).
    #[must_use]
    pub fn is_blocking(&self) -> bool {
        matches!(self, Self::PreToolUse | Self::PermissionRequest)
    }
}

impl std::fmt::Display for HookEvent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Context data provided to hooks when they execute.
///
/// Contains all relevant information about the event that triggered the hook.
/// This is serialized to JSON and passed to hook commands via environment variables.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct HookContext {
    /// The event that triggered this hook.
    pub event: HookEvent,

    /// Session ID if applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,

    /// Timestamp when the event occurred (Unix epoch milliseconds).
    pub timestamp_ms: u64,

    /// Tool name for tool-related events.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,

    /// Full tool ID (e.g., mcp__server__tool).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_id: Option<String>,

    /// Tool arguments for PreToolUse (may be truncated for large payloads).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_arguments: Option<serde_json::Value>,

    /// Tool result for PostToolUse (may be truncated).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<serde_json::Value>,

    /// Error message for failure events.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,

    /// Duration in milliseconds for timed events.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,

    /// Agent ID for sub-agent events.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,

    /// Reason for stop/exit events.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,

    /// User prompt for UserPromptSubmit (truncated to 500 chars).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,

    /// Permission type for PermissionRequest.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permission_type: Option<String>,

    /// Resource being accessed for PermissionRequest.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource: Option<String>,

    /// Notification type for Notification events.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notification_type: Option<String>,

    /// Notification title.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notification_title: Option<String>,

    /// Notification body.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notification_body: Option<String>,

    /// Token count before compaction for PreCompact.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_count: Option<u64>,

    /// Compaction strategy for PreCompact.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compaction_strategy: Option<String>,

    /// Additional key-value metadata.
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

impl HookContext {
    /// Create a new hook context for the given event.
    #[must_use]
    pub fn new(event: HookEvent) -> Self {
        Self {
            event,
            session_id: None,
            timestamp_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            tool_name: None,
            tool_id: None,
            tool_arguments: None,
            tool_result: None,
            error: None,
            duration_ms: None,
            agent_id: None,
            reason: None,
            prompt: None,
            permission_type: None,
            resource: None,
            notification_type: None,
            notification_title: None,
            notification_body: None,
            token_count: None,
            compaction_strategy: None,
            metadata: HashMap::new(),
        }
    }

    /// Set the session ID.
    #[must_use]
    pub fn with_session_id(mut self, session_id: impl Into<String>) -> Self {
        self.session_id = Some(session_id.into());
        self
    }

    /// Set tool information for tool events.
    #[must_use]
    pub fn with_tool(mut self, tool_name: impl Into<String>, tool_id: impl Into<String>) -> Self {
        self.tool_name = Some(tool_name.into());
        self.tool_id = Some(tool_id.into());
        self
    }

    /// Set tool arguments.
    #[must_use]
    pub fn with_tool_arguments(mut self, arguments: serde_json::Value) -> Self {
        self.tool_arguments = Some(arguments);
        self
    }

    /// Set tool result.
    #[must_use]
    pub fn with_tool_result(mut self, result: serde_json::Value) -> Self {
        self.tool_result = Some(result);
        self
    }

    /// Set error message.
    #[must_use]
    pub fn with_error(mut self, error: impl Into<String>) -> Self {
        self.error = Some(error.into());
        self
    }

    /// Set duration.
    #[must_use]
    pub fn with_duration_ms(mut self, duration_ms: u64) -> Self {
        self.duration_ms = Some(duration_ms);
        self
    }

    /// Set agent ID for sub-agent events.
    #[must_use]
    pub fn with_agent_id(mut self, agent_id: impl Into<String>) -> Self {
        self.agent_id = Some(agent_id.into());
        self
    }

    /// Set reason for stop/exit events.
    #[must_use]
    pub fn with_reason(mut self, reason: impl Into<String>) -> Self {
        self.reason = Some(reason.into());
        self
    }

    /// Set user prompt (will be truncated to 500 chars).
    #[must_use]
    pub fn with_prompt(mut self, prompt: impl Into<String>) -> Self {
        let prompt_str = prompt.into();
        self.prompt = Some(if prompt_str.len() > 500 {
            format!("{}...", &prompt_str[..497])
        } else {
            prompt_str
        });
        self
    }

    /// Set permission info.
    #[must_use]
    pub fn with_permission(
        mut self,
        permission_type: impl Into<String>,
        resource: impl Into<String>,
    ) -> Self {
        self.permission_type = Some(permission_type.into());
        self.resource = Some(resource.into());
        self
    }

    /// Set notification info.
    #[must_use]
    pub fn with_notification(
        mut self,
        notification_type: impl Into<String>,
        title: impl Into<String>,
        body: impl Into<String>,
    ) -> Self {
        self.notification_type = Some(notification_type.into());
        self.notification_title = Some(title.into());
        self.notification_body = Some(body.into());
        self
    }

    /// Set compaction info.
    #[must_use]
    pub fn with_compaction(mut self, token_count: u64, strategy: impl Into<String>) -> Self {
        self.token_count = Some(token_count);
        self.compaction_strategy = Some(strategy.into());
        self
    }

    /// Add metadata key-value pair.
    #[must_use]
    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }

    /// Serialize context to JSON string.
    ///
    /// # Errors
    /// Returns error if serialization fails.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    /// Serialize context to pretty JSON string.
    ///
    /// # Errors
    /// Returns error if serialization fails.
    pub fn to_json_pretty(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hook_event_str_roundtrip() {
        for event in HookEvent::all() {
            let s = event.as_str();
            let parsed = HookEvent::from_str(s);
            assert_eq!(parsed, Some(*event), "Failed roundtrip for {:?}", event);
        }
    }

    #[test]
    fn test_hook_event_from_invalid() {
        assert_eq!(HookEvent::from_str("InvalidEvent"), None);
        assert_eq!(HookEvent::from_str(""), None);
        assert_eq!(HookEvent::from_str("sessionstart"), None); // case sensitive
    }

    #[test]
    fn test_hook_event_supports_matcher() {
        assert!(HookEvent::PreToolUse.supports_matcher());
        assert!(HookEvent::PostToolUse.supports_matcher());
        assert!(HookEvent::PostToolUseFailure.supports_matcher());
        assert!(!HookEvent::SessionStart.supports_matcher());
        assert!(!HookEvent::Stop.supports_matcher());
    }

    #[test]
    fn test_hook_event_is_blocking() {
        assert!(HookEvent::PreToolUse.is_blocking());
        assert!(HookEvent::PermissionRequest.is_blocking());
        assert!(!HookEvent::PostToolUse.is_blocking());
        assert!(!HookEvent::SessionStart.is_blocking());
    }

    #[test]
    fn test_hook_event_display() {
        assert_eq!(format!("{}", HookEvent::SessionStart), "SessionStart");
        assert_eq!(format!("{}", HookEvent::PreToolUse), "PreToolUse");
    }

    #[test]
    fn test_hook_event_serde() {
        let event = HookEvent::PostToolUse;
        let json = serde_json::to_string(&event).unwrap();
        assert_eq!(json, "\"PostToolUse\"");

        let parsed: HookEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, event);
    }

    #[test]
    fn test_hook_context_builder() {
        let ctx = HookContext::new(HookEvent::PostToolUse)
            .with_session_id("session-123")
            .with_tool("Write", "mcp__fs__write")
            .with_tool_result(serde_json::json!({"success": true}))
            .with_duration_ms(150)
            .with_metadata("file_path", "/tmp/test.txt");

        assert_eq!(ctx.event, HookEvent::PostToolUse);
        assert_eq!(ctx.session_id, Some("session-123".to_string()));
        assert_eq!(ctx.tool_name, Some("Write".to_string()));
        assert_eq!(ctx.tool_id, Some("mcp__fs__write".to_string()));
        assert_eq!(ctx.duration_ms, Some(150));
        assert_eq!(
            ctx.metadata.get("file_path"),
            Some(&"/tmp/test.txt".to_string())
        );
    }

    #[test]
    fn test_hook_context_prompt_truncation() {
        let long_prompt = "a".repeat(1000);
        let ctx = HookContext::new(HookEvent::UserPromptSubmit).with_prompt(long_prompt);

        let prompt = ctx.prompt.unwrap();
        assert_eq!(prompt.len(), 500);
        assert!(prompt.ends_with("..."));
    }

    #[test]
    fn test_hook_context_serialization() {
        let ctx = HookContext::new(HookEvent::PreToolUse)
            .with_session_id("test-session")
            .with_tool("Edit", "mcp__fs__edit");

        let json = ctx.to_json().unwrap();
        assert!(json.contains("PreToolUse"));
        assert!(json.contains("test-session"));
        assert!(json.contains("mcp__fs__edit"));

        // Verify we can deserialize it back
        let parsed: HookContext = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.event, HookEvent::PreToolUse);
        assert_eq!(parsed.session_id, Some("test-session".to_string()));
    }
}
