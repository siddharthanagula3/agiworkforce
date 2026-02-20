//! Hook configuration types and matcher patterns.
//!
//! Defines the configuration schema for hooks, including:
//! - Hook definitions with commands and matchers
//! - Regex-based tool name filtering
//! - Configuration loading and validation

use super::error::{HookError, HookResult};
use super::event::HookEvent;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

/// Default timeout for hook execution in milliseconds (120 seconds).
const DEFAULT_TIMEOUT_MS: u64 = 120_000;

/// Maximum allowed timeout for hooks in milliseconds (5 minutes).
const MAX_TIMEOUT_MS: u64 = 300_000;

/// Maximum number of hooks per event to prevent abuse.
const MAX_HOOKS_PER_EVENT: usize = 20;

/// Maximum command length in characters.
const MAX_COMMAND_LENGTH: usize = 4096;

/// Type of hook action to execute.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HookType {
    /// Execute a shell command.
    Command,
}

impl Default for HookType {
    fn default() -> Self {
        Self::Command
    }
}

/// A single hook definition.
///
/// Hooks execute shell commands when their associated event fires.
/// For tool-related events, hooks can be filtered by tool name using matchers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct HookDefinition {
    /// Type of hook (currently only "command" is supported).
    #[serde(default, rename = "type")]
    pub hook_type: HookType,

    /// The shell command to execute.
    ///
    /// The command is executed via the system shell (sh -c on Unix, cmd /C on Windows).
    /// Environment variables are set with hook context data.
    pub command: String,

    /// Optional timeout in milliseconds (default: 30000, max: 300000).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,

    /// Whether this hook is enabled (default: true).
    #[serde(default = "default_enabled")]
    pub enabled: bool,

    /// Optional description for documentation purposes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

fn default_enabled() -> bool {
    true
}

impl HookDefinition {
    /// Create a new hook definition with the given command.
    #[must_use]
    pub fn new(command: impl Into<String>) -> Self {
        Self {
            hook_type: HookType::Command,
            command: command.into(),
            timeout_ms: None,
            enabled: true,
            description: None,
        }
    }

    /// Set the timeout in milliseconds.
    #[must_use]
    pub fn with_timeout_ms(mut self, timeout_ms: u64) -> Self {
        self.timeout_ms = Some(timeout_ms.min(MAX_TIMEOUT_MS));
        self
    }

    /// Set whether the hook is enabled.
    #[must_use]
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// Set the description.
    #[must_use]
    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    /// Get the effective timeout as a Duration.
    #[must_use]
    pub fn timeout(&self) -> Duration {
        Duration::from_millis(
            self.timeout_ms
                .unwrap_or(DEFAULT_TIMEOUT_MS)
                .min(MAX_TIMEOUT_MS),
        )
    }

    /// Validate the hook definition.
    ///
    /// # Errors
    /// Returns error if the command is empty or too long.
    pub fn validate(&self) -> HookResult<()> {
        if self.command.trim().is_empty() {
            return Err(HookError::Configuration(
                "Hook command cannot be empty".into(),
            ));
        }

        if self.command.len() > MAX_COMMAND_LENGTH {
            return Err(HookError::Configuration(format!(
                "Hook command exceeds maximum length of {} characters",
                MAX_COMMAND_LENGTH
            )));
        }

        Ok(())
    }
}

/// A hook entry with an optional matcher for tool filtering.
///
/// Matchers use regex patterns to filter which tools trigger the hook.
/// For example, `"Write|Edit"` matches only Write and Edit tools.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct HookEntry {
    /// Optional regex pattern to match tool names.
    ///
    /// Only applicable for tool-related events (PreToolUse, PostToolUse, PostToolUseFailure).
    /// If not specified, the hooks will run for all tools.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matcher: Option<String>,

    /// List of hooks to execute when the matcher matches (or always if no matcher).
    pub hooks: Vec<HookDefinition>,
}

impl HookEntry {
    /// Create a new hook entry without a matcher (matches all).
    #[must_use]
    pub fn new(hooks: Vec<HookDefinition>) -> Self {
        Self {
            matcher: None,
            hooks,
        }
    }

    /// Create a new hook entry with a matcher pattern.
    #[must_use]
    pub fn with_matcher(matcher: impl Into<String>, hooks: Vec<HookDefinition>) -> Self {
        Self {
            matcher: Some(matcher.into()),
            hooks,
        }
    }

    /// Check if a tool name matches this entry's matcher.
    ///
    /// Returns true if:
    /// - No matcher is specified (matches all tools)
    /// - The matcher regex matches the tool name
    ///
    /// # Errors
    /// Returns error if the matcher regex is invalid.
    pub fn matches_tool(&self, tool_name: &str) -> HookResult<bool> {
        match &self.matcher {
            None => Ok(true),
            Some(pattern) => {
                let regex = Regex::new(pattern).map_err(|e| HookError::InvalidMatcher {
                    pattern: pattern.clone(),
                    reason: e.to_string(),
                })?;
                Ok(regex.is_match(tool_name))
            }
        }
    }

    /// Get enabled hooks from this entry.
    #[must_use]
    pub fn enabled_hooks(&self) -> Vec<&HookDefinition> {
        self.hooks.iter().filter(|h| h.enabled).collect()
    }

    /// Validate the hook entry.
    ///
    /// # Errors
    /// Returns error if the matcher is invalid or hooks are invalid.
    pub fn validate(&self) -> HookResult<()> {
        // Validate matcher regex if present
        if let Some(pattern) = &self.matcher {
            Regex::new(pattern).map_err(|e| HookError::InvalidMatcher {
                pattern: pattern.clone(),
                reason: e.to_string(),
            })?;
        }

        // Validate each hook
        for hook in &self.hooks {
            hook.validate()?;
        }

        if self.hooks.len() > MAX_HOOKS_PER_EVENT {
            return Err(HookError::Configuration(format!(
                "Too many hooks in entry (max {})",
                MAX_HOOKS_PER_EVENT
            )));
        }

        Ok(())
    }
}

/// Complete hooks configuration.
///
/// Maps hook events to their corresponding hook entries.
/// This is the root configuration object stored in settings.
///
/// # Example Configuration
///
/// ```json
/// {
///   "hooks": {
///     "PostToolUse": [{
///       "matcher": "Write|Edit",
///       "hooks": [{
///         "type": "command",
///         "command": "./scripts/run-linter.sh"
///       }]
///     }],
///     "SessionStart": [{
///       "hooks": [{
///         "type": "command",
///         "command": "echo 'Session started'"
///       }]
///     }]
///   }
/// }
/// ```
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct HooksConfig {
    /// Map of event names to hook entries.
    #[serde(default)]
    pub hooks: HashMap<String, Vec<HookEntry>>,
}

impl HooksConfig {
    /// Create an empty hooks configuration.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a hook entry for an event.
    pub fn add_hook(&mut self, event: HookEvent, entry: HookEntry) {
        self.hooks
            .entry(event.as_str().to_string())
            .or_default()
            .push(entry);
    }

    /// Get hook entries for a specific event.
    #[must_use]
    pub fn get_entries(&self, event: HookEvent) -> Option<&Vec<HookEntry>> {
        self.hooks.get(event.as_str())
    }

    /// Get mutable hook entries for a specific event.
    pub fn get_entries_mut(&mut self, event: HookEvent) -> Option<&mut Vec<HookEntry>> {
        self.hooks.get_mut(event.as_str())
    }

    /// Check if any hooks are configured for an event.
    #[must_use]
    pub fn has_hooks(&self, event: HookEvent) -> bool {
        self.hooks
            .get(event.as_str())
            .map(|entries| !entries.is_empty())
            .unwrap_or(false)
    }

    /// Get all enabled hooks for an event, optionally filtered by tool name.
    ///
    /// # Arguments
    /// - `event`: The hook event to get hooks for
    /// - `tool_name`: Optional tool name for filtering (only used for tool-related events)
    ///
    /// # Errors
    /// Returns error if a matcher pattern is invalid.
    pub fn get_matching_hooks(
        &self,
        event: HookEvent,
        tool_name: Option<&str>,
    ) -> HookResult<Vec<&HookDefinition>> {
        let entries = match self.get_entries(event) {
            Some(e) => e,
            None => return Ok(vec![]),
        };

        let mut matching_hooks = Vec::new();

        for entry in entries {
            let matches = match (tool_name, event.supports_matcher()) {
                (Some(name), true) => entry.matches_tool(name)?,
                _ => entry.matcher.is_none(), // Non-tool events only match entries without matchers
            };

            if matches {
                matching_hooks.extend(entry.enabled_hooks());
            }
        }

        Ok(matching_hooks)
    }

    /// Validate the entire configuration.
    ///
    /// # Errors
    /// Returns error if any event name is invalid or any hook entry is invalid.
    pub fn validate(&self) -> HookResult<()> {
        for (event_name, entries) in &self.hooks {
            // Validate event name
            if HookEvent::from_str(event_name).is_none() {
                return Err(HookError::Configuration(format!(
                    "Unknown hook event: {}",
                    event_name
                )));
            }

            // Validate each entry
            for entry in entries {
                entry.validate()?;
            }

            // Check total hooks for this event
            let total_hooks: usize = entries.iter().map(|e| e.hooks.len()).sum();
            if total_hooks > MAX_HOOKS_PER_EVENT {
                return Err(HookError::Configuration(format!(
                    "Too many total hooks for event {} ({} > {})",
                    event_name, total_hooks, MAX_HOOKS_PER_EVENT
                )));
            }
        }

        Ok(())
    }

    /// Merge another configuration into this one.
    ///
    /// Hook entries from the other configuration are appended to existing entries.
    pub fn merge(&mut self, other: HooksConfig) {
        for (event_name, entries) in other.hooks {
            self.hooks.entry(event_name).or_default().extend(entries);
        }
    }

    /// Load configuration from JSON string.
    ///
    /// # Errors
    /// Returns error if parsing or validation fails.
    pub fn from_json(json: &str) -> HookResult<Self> {
        let config: Self = serde_json::from_str(json)?;
        config.validate()?;
        Ok(config)
    }

    /// Load configuration from JSON value.
    ///
    /// # Errors
    /// Returns error if parsing or validation fails.
    pub fn from_value(value: serde_json::Value) -> HookResult<Self> {
        let config: Self = serde_json::from_value(value)?;
        config.validate()?;
        Ok(config)
    }

    /// Serialize to JSON string.
    ///
    /// # Errors
    /// Returns error if serialization fails.
    pub fn to_json(&self) -> HookResult<String> {
        Ok(serde_json::to_string(self)?)
    }

    /// Serialize to pretty JSON string.
    ///
    /// # Errors
    /// Returns error if serialization fails.
    pub fn to_json_pretty(&self) -> HookResult<String> {
        Ok(serde_json::to_string_pretty(self)?)
    }
}

/// Compiled matcher for efficient repeated matching.
///
/// Pre-compiles the regex pattern for better performance when
/// matching against many tool names.
#[derive(Debug, Clone)]
pub struct CompiledMatcher {
    pattern: String,
    regex: Regex,
}

impl CompiledMatcher {
    /// Create a new compiled matcher from a pattern.
    ///
    /// # Errors
    /// Returns error if the regex pattern is invalid.
    pub fn new(pattern: impl Into<String>) -> HookResult<Self> {
        let pattern = pattern.into();
        let regex = Regex::new(&pattern).map_err(|e| HookError::InvalidMatcher {
            pattern: pattern.clone(),
            reason: e.to_string(),
        })?;
        Ok(Self { pattern, regex })
    }

    /// Check if the matcher matches the given tool name.
    #[must_use]
    pub fn matches(&self, tool_name: &str) -> bool {
        self.regex.is_match(tool_name)
    }

    /// Get the original pattern.
    #[must_use]
    pub fn pattern(&self) -> &str {
        &self.pattern
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hook_definition_builder() {
        let hook = HookDefinition::new("echo hello")
            .with_timeout_ms(5000)
            .with_description("Test hook")
            .with_enabled(true);

        assert_eq!(hook.command, "echo hello");
        assert_eq!(hook.timeout_ms, Some(5000));
        assert_eq!(hook.description, Some("Test hook".to_string()));
        assert!(hook.enabled);
    }

    #[test]
    fn test_hook_definition_timeout_capped() {
        let hook = HookDefinition::new("test").with_timeout_ms(999_999_999);
        assert_eq!(hook.timeout(), Duration::from_millis(MAX_TIMEOUT_MS));
    }

    #[test]
    fn test_hook_definition_default_timeout() {
        let hook = HookDefinition::new("test");
        assert_eq!(hook.timeout(), Duration::from_millis(DEFAULT_TIMEOUT_MS));
    }

    #[test]
    fn test_hook_definition_validation() {
        let empty = HookDefinition::new("");
        assert!(empty.validate().is_err());

        let whitespace = HookDefinition::new("   ");
        assert!(whitespace.validate().is_err());

        let too_long = HookDefinition::new("a".repeat(MAX_COMMAND_LENGTH + 1));
        assert!(too_long.validate().is_err());

        let valid = HookDefinition::new("echo hello");
        assert!(valid.validate().is_ok());
    }

    #[test]
    fn test_hook_entry_no_matcher() {
        let entry = HookEntry::new(vec![HookDefinition::new("echo test")]);

        assert!(entry.matches_tool("Write").unwrap());
        assert!(entry.matches_tool("Edit").unwrap());
        assert!(entry.matches_tool("AnyTool").unwrap());
    }

    #[test]
    fn test_hook_entry_with_matcher() {
        let entry = HookEntry::with_matcher("Write|Edit", vec![HookDefinition::new("echo test")]);

        assert!(entry.matches_tool("Write").unwrap());
        assert!(entry.matches_tool("Edit").unwrap());
        assert!(!entry.matches_tool("Read").unwrap());
        assert!(!entry.matches_tool("Delete").unwrap());
    }

    #[test]
    fn test_hook_entry_invalid_matcher() {
        let entry = HookEntry::with_matcher("[invalid", vec![]);
        assert!(entry.matches_tool("test").is_err());
    }

    #[test]
    fn test_hook_entry_enabled_hooks() {
        let entry = HookEntry::new(vec![
            HookDefinition::new("cmd1").with_enabled(true),
            HookDefinition::new("cmd2").with_enabled(false),
            HookDefinition::new("cmd3").with_enabled(true),
        ]);

        let enabled = entry.enabled_hooks();
        assert_eq!(enabled.len(), 2);
        assert_eq!(enabled[0].command, "cmd1");
        assert_eq!(enabled[1].command, "cmd3");
    }

    #[test]
    fn test_hooks_config_add_and_get() {
        let mut config = HooksConfig::new();
        config.add_hook(
            HookEvent::SessionStart,
            HookEntry::new(vec![HookDefinition::new("echo start")]),
        );

        assert!(config.has_hooks(HookEvent::SessionStart));
        assert!(!config.has_hooks(HookEvent::SessionEnd));

        let entries = config.get_entries(HookEvent::SessionStart).unwrap();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn test_hooks_config_matching_hooks() {
        let mut config = HooksConfig::new();

        // Add a hook with matcher for Write|Edit
        config.add_hook(
            HookEvent::PostToolUse,
            HookEntry::with_matcher("Write|Edit", vec![HookDefinition::new("./lint.sh")]),
        );

        // Add a hook without matcher (runs for all tools)
        config.add_hook(
            HookEvent::PostToolUse,
            HookEntry::new(vec![HookDefinition::new("./log.sh")]),
        );

        // Write should match both
        let write_hooks = config
            .get_matching_hooks(HookEvent::PostToolUse, Some("Write"))
            .unwrap();
        assert_eq!(write_hooks.len(), 2);

        // Read should only match the one without matcher
        let read_hooks = config
            .get_matching_hooks(HookEvent::PostToolUse, Some("Read"))
            .unwrap();
        assert_eq!(read_hooks.len(), 1);
        assert_eq!(read_hooks[0].command, "./log.sh");
    }

    #[test]
    fn test_hooks_config_validation() {
        let mut config = HooksConfig::new();
        config.hooks.insert(
            "InvalidEvent".to_string(),
            vec![HookEntry::new(vec![HookDefinition::new("test")])],
        );

        assert!(config.validate().is_err());
    }

    #[test]
    fn test_hooks_config_from_json() {
        let json = r#"{
            "hooks": {
                "PostToolUse": [{
                    "matcher": "Write|Edit",
                    "hooks": [{
                        "type": "command",
                        "command": "./scripts/run-linter.sh"
                    }]
                }],
                "SessionStart": [{
                    "hooks": [{
                        "type": "command",
                        "command": "echo 'Session started'"
                    }]
                }]
            }
        }"#;

        let config = HooksConfig::from_json(json).unwrap();
        assert!(config.has_hooks(HookEvent::PostToolUse));
        assert!(config.has_hooks(HookEvent::SessionStart));

        let post_tool_hooks = config
            .get_matching_hooks(HookEvent::PostToolUse, Some("Write"))
            .unwrap();
        assert_eq!(post_tool_hooks.len(), 1);
        assert_eq!(post_tool_hooks[0].command, "./scripts/run-linter.sh");
    }

    #[test]
    fn test_hooks_config_merge() {
        let mut config1 = HooksConfig::new();
        config1.add_hook(
            HookEvent::SessionStart,
            HookEntry::new(vec![HookDefinition::new("cmd1")]),
        );

        let mut config2 = HooksConfig::new();
        config2.add_hook(
            HookEvent::SessionStart,
            HookEntry::new(vec![HookDefinition::new("cmd2")]),
        );
        config2.add_hook(
            HookEvent::SessionEnd,
            HookEntry::new(vec![HookDefinition::new("cmd3")]),
        );

        config1.merge(config2);

        let start_entries = config1.get_entries(HookEvent::SessionStart).unwrap();
        assert_eq!(start_entries.len(), 2);

        assert!(config1.has_hooks(HookEvent::SessionEnd));
    }

    #[test]
    fn test_hooks_config_roundtrip() {
        let mut config = HooksConfig::new();
        config.add_hook(
            HookEvent::PreToolUse,
            HookEntry::with_matcher(
                "Bash",
                vec![HookDefinition::new("./validate.sh")
                    .with_timeout_ms(10000)
                    .with_description("Validate bash commands")],
            ),
        );

        let json = config.to_json_pretty().unwrap();
        let parsed = HooksConfig::from_json(&json).unwrap();

        assert!(parsed.has_hooks(HookEvent::PreToolUse));
    }

    #[test]
    fn test_compiled_matcher() {
        let matcher = CompiledMatcher::new("^(Write|Edit)$").unwrap();

        assert!(matcher.matches("Write"));
        assert!(matcher.matches("Edit"));
        assert!(!matcher.matches("WriteFile"));
        assert!(!matcher.matches("Read"));
    }

    #[test]
    fn test_compiled_matcher_invalid() {
        let result = CompiledMatcher::new("[invalid");
        assert!(result.is_err());
    }
}
