//! Extension manifest types
//!
//! Defines the structure of the manifest.json file that must be present
//! in every .agiext extension package. The manifest describes the extension's
//! metadata, configuration schema, and provided tools.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// The manifest.json file that describes an extension
///
/// This follows a format similar to Claude Desktop's .mcpb files,
/// with additional fields for AGI Workforce-specific features.
///
/// # Example
///
/// ```json
/// {
///   "id": "slack",
///   "name": "Slack",
///   "version": "1.0.0",
///   "description": "Slack workspace integration",
///   "author": "AGI Workforce",
///   "homepage": "https://github.com/agiworkforce/ext-slack",
///   "license": "MIT",
///   "manifestVersion": "1.0.0",
///   "transport": "stdio",
///   "command": "node",
///   "args": ["server/index.js"],
///   "configSchema": {
///     "type": "object",
///     "properties": {
///       "apiToken": {
///         "type": "string",
///         "title": "API Token",
///         "description": "Your Slack API token",
///         "sensitive": true,
///         "required": true
///       }
///     }
///   },
///   "tools": [
///     {
///       "name": "send_message",
///       "description": "Send a message to a Slack channel"
///     }
///   ],
///   "capabilities": ["network"],
///   "icon": "assets/icon.png"
/// }
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionManifest {
    /// Unique identifier for the extension (lowercase, alphanumeric with hyphens)
    pub id: String,

    /// Human-readable name
    pub name: String,

    /// Semantic version (e.g., "1.0.0")
    pub version: String,

    /// Description of what the extension does
    pub description: String,

    /// Author or organization name
    #[serde(default)]
    pub author: String,

    /// Homepage or repository URL
    #[serde(default)]
    pub homepage: Option<String>,

    /// SPDX license identifier
    #[serde(default)]
    pub license: Option<String>,

    /// Manifest format version (for forward compatibility)
    #[serde(default = "default_manifest_version")]
    pub manifest_version: String,

    /// Transport type for MCP communication
    #[serde(default)]
    pub transport: TransportType,

    /// Command to execute (for STDIO transport)
    /// Can be "node", "python", or a path to an executable
    #[serde(default)]
    pub command: Option<String>,

    /// Arguments to pass to the command
    #[serde(default)]
    pub args: Vec<String>,

    /// Environment variables to set
    #[serde(default)]
    pub env: HashMap<String, String>,

    /// Configuration schema for user-configurable settings
    #[serde(default)]
    pub config_schema: Option<ConfigSchema>,

    /// List of tools provided by this extension
    #[serde(default)]
    pub tools: Vec<ExtensionTool>,

    /// Required capabilities (network, filesystem, etc.)
    #[serde(default)]
    pub capabilities: Vec<ExtensionCapability>,

    /// Path to icon file within the package (relative to package root)
    #[serde(default)]
    pub icon: Option<String>,

    /// Minimum AGI Workforce version required
    #[serde(default)]
    pub min_app_version: Option<String>,

    /// Category for marketplace listing
    #[serde(default)]
    pub category: Option<String>,

    /// Tags for search and discovery
    #[serde(default)]
    pub tags: Vec<String>,

    /// Whether this extension requires Node.js dependencies
    #[serde(default)]
    pub has_node_dependencies: bool,

    /// HTTP/SSE configuration (for HTTP transport)
    #[serde(default)]
    pub http_config: Option<HttpConfig>,
}

fn default_manifest_version() -> String {
    "1.0.0".to_string()
}

/// Transport type for MCP communication
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TransportType {
    /// Standard I/O transport (spawns a local process)
    #[default]
    Stdio,

    /// HTTP with Server-Sent Events transport (connects to remote server)
    Http,
}

/// HTTP transport configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpConfig {
    /// Base URL for the HTTP server
    pub url: String,

    /// Bearer token configuration (uses config schema value)
    #[serde(default)]
    pub bearer_token_config_key: Option<String>,

    /// Timeout in seconds
    #[serde(default = "default_timeout")]
    pub timeout_secs: u32,
}

fn default_timeout() -> u32 {
    30
}

/// JSON Schema-like configuration schema
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSchema {
    /// Schema type (always "object" for root schema)
    #[serde(default = "default_object_type")]
    pub r#type: String,

    /// Configuration properties
    #[serde(default)]
    pub properties: HashMap<String, ConfigProperty>,

    /// List of required property names
    #[serde(default)]
    pub required: Vec<String>,
}

fn default_object_type() -> String {
    "object".to_string()
}

/// A single configuration property
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigProperty {
    /// Property type (string, number, boolean, array, object)
    #[serde(default = "default_string_type")]
    pub r#type: String,

    /// Human-readable title
    #[serde(default)]
    pub title: Option<String>,

    /// Description of what this property configures
    #[serde(default)]
    pub description: Option<String>,

    /// Default value
    #[serde(default)]
    pub default: Option<serde_json::Value>,

    /// Whether this is a sensitive value (will be stored encrypted)
    #[serde(default)]
    pub sensitive: bool,

    /// Whether this property is required
    #[serde(default)]
    pub required: bool,

    /// Enum values for string type
    #[serde(default, rename = "enum")]
    pub enum_values: Option<Vec<String>>,

    /// Minimum value for number type
    #[serde(default)]
    pub minimum: Option<f64>,

    /// Maximum value for number type
    #[serde(default)]
    pub maximum: Option<f64>,

    /// Pattern for string validation (regex)
    #[serde(default)]
    pub pattern: Option<String>,

    /// Help URL for obtaining this configuration value
    #[serde(default)]
    pub help_url: Option<String>,

    /// Placeholder text for input fields
    #[serde(default)]
    pub placeholder: Option<String>,
}

fn default_string_type() -> String {
    "string".to_string()
}

/// Description of a tool provided by the extension
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionTool {
    /// Tool name (used in MCP tool calls)
    pub name: String,

    /// Human-readable description
    pub description: String,

    /// Tool parameters (optional, for documentation)
    #[serde(default)]
    pub parameters: Vec<ToolParameter>,
}

/// A parameter for an extension tool
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolParameter {
    /// Parameter name
    pub name: String,

    /// Parameter type
    #[serde(default = "default_string_type")]
    pub r#type: String,

    /// Whether the parameter is required
    #[serde(default)]
    pub required: bool,

    /// Parameter description
    #[serde(default)]
    pub description: Option<String>,
}

/// Capabilities that an extension may require
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ExtensionCapability {
    /// Network access
    Network,

    /// File system access
    Filesystem,

    /// Clipboard access
    Clipboard,

    /// System notifications
    Notifications,

    /// Browser automation
    Browser,

    /// Execute system commands
    Shell,

    /// Access to sensitive data
    Sensitive,
}

impl ExtensionManifest {
    /// Validate the manifest for required fields and valid values
    pub fn validate(&self) -> Result<(), Vec<String>> {
        let mut errors = Vec::new();

        // Validate ID
        if self.id.is_empty() {
            errors.push("Extension ID is required".to_string());
        } else if !Self::is_valid_id(&self.id) {
            errors.push(format!(
                "Extension ID '{}' is invalid. Use only lowercase letters, numbers, and hyphens.",
                self.id
            ));
        }

        // Validate name
        if self.name.is_empty() {
            errors.push("Extension name is required".to_string());
        }

        // Validate version
        if self.version.is_empty() {
            errors.push("Extension version is required".to_string());
        } else if !Self::is_valid_semver(&self.version) {
            errors.push(format!(
                "Extension version '{}' is not a valid semantic version",
                self.version
            ));
        }

        // Validate command for STDIO transport
        if self.transport == TransportType::Stdio && self.command.is_none() {
            errors.push("Command is required for STDIO transport".to_string());
        }

        // Validate HTTP config for HTTP transport
        if self.transport == TransportType::Http && self.http_config.is_none() {
            errors.push("HTTP configuration is required for HTTP transport".to_string());
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }

    /// Check if an ID is valid (lowercase alphanumeric with hyphens)
    fn is_valid_id(id: &str) -> bool {
        if id.is_empty() || id.len() > 64 {
            return false;
        }

        // Must start with a letter
        let first_char = match id.chars().next() {
            Some(c) => c,
            None => return false,
        };
        if !first_char.is_ascii_lowercase() {
            return false;
        }

        // Only lowercase letters, numbers, and hyphens
        for c in id.chars() {
            if !c.is_ascii_lowercase() && !c.is_ascii_digit() && c != '-' {
                return false;
            }
        }

        // Cannot end with a hyphen
        if id.ends_with('-') {
            return false;
        }

        // No consecutive hyphens
        if id.contains("--") {
            return false;
        }

        true
    }

    /// Check if a version string is valid semantic versioning
    fn is_valid_semver(version: &str) -> bool {
        let parts: Vec<&str> = version.split('.').collect();
        if parts.len() < 2 || parts.len() > 3 {
            return false;
        }

        for part in parts {
            if part.is_empty() {
                return false;
            }
            // Allow pre-release suffix on last part (e.g., "0-beta")
            let numeric_part = part.split('-').next().unwrap_or(part);
            if numeric_part.parse::<u32>().is_err() {
                return false;
            }
        }

        true
    }

    /// Get the server entry point path
    pub fn server_entry_point(&self) -> String {
        if let Some(ref cmd) = self.command {
            if cmd == "node" || cmd == "python" || cmd == "python3" {
                // For interpreted languages, the first arg is the entry point
                self.args
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "server/index.js".to_string())
            } else {
                // For binaries, the command itself is the entry point
                cmd.clone()
            }
        } else {
            "server/index.js".to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_manifest() {
        let manifest = ExtensionManifest {
            id: "slack".to_string(),
            name: "Slack".to_string(),
            version: "1.0.0".to_string(),
            description: "Slack integration".to_string(),
            author: "Test".to_string(),
            homepage: None,
            license: Some("MIT".to_string()),
            manifest_version: "1.0.0".to_string(),
            transport: TransportType::Stdio,
            command: Some("node".to_string()),
            args: vec!["server/index.js".to_string()],
            env: HashMap::new(),
            config_schema: None,
            tools: vec![],
            capabilities: vec![ExtensionCapability::Network],
            icon: None,
            min_app_version: None,
            category: Some("productivity".to_string()),
            tags: vec!["messaging".to_string()],
            has_node_dependencies: true,
            http_config: None,
        };

        assert!(manifest.validate().is_ok());
    }

    #[test]
    fn test_invalid_id() {
        assert!(!ExtensionManifest::is_valid_id(""));
        assert!(!ExtensionManifest::is_valid_id("Slack")); // uppercase
        assert!(!ExtensionManifest::is_valid_id("slack_ext")); // underscore
        assert!(!ExtensionManifest::is_valid_id("-slack")); // starts with hyphen
        assert!(!ExtensionManifest::is_valid_id("slack-")); // ends with hyphen
        assert!(!ExtensionManifest::is_valid_id("slack--ext")); // consecutive hyphens

        assert!(ExtensionManifest::is_valid_id("slack"));
        assert!(ExtensionManifest::is_valid_id("slack-ext"));
        assert!(ExtensionManifest::is_valid_id("my-slack-extension-123"));
    }

    #[test]
    fn test_valid_semver() {
        assert!(ExtensionManifest::is_valid_semver("1.0.0"));
        assert!(ExtensionManifest::is_valid_semver("0.1.0"));
        assert!(ExtensionManifest::is_valid_semver("1.0"));
        assert!(ExtensionManifest::is_valid_semver("1.0.0-beta"));

        assert!(!ExtensionManifest::is_valid_semver("1"));
        assert!(!ExtensionManifest::is_valid_semver("1.0.0.0"));
        assert!(!ExtensionManifest::is_valid_semver("v1.0.0"));
        assert!(!ExtensionManifest::is_valid_semver(""));
    }

    #[test]
    fn test_deserialize_manifest() {
        let json = r#"{
            "id": "slack",
            "name": "Slack",
            "version": "1.0.0",
            "description": "Slack integration",
            "configSchema": {
                "type": "object",
                "properties": {
                    "apiToken": {
                        "type": "string",
                        "sensitive": true,
                        "required": true
                    }
                }
            },
            "tools": [
                {
                    "name": "send_message",
                    "description": "Send a message to a channel"
                }
            ]
        }"#;

        let manifest: ExtensionManifest = serde_json::from_str(json).unwrap();
        assert_eq!(manifest.id, "slack");
        assert_eq!(manifest.name, "Slack");
        assert!(manifest.config_schema.is_some());
        assert_eq!(manifest.tools.len(), 1);
        assert_eq!(manifest.tools[0].name, "send_message");
    }
}
