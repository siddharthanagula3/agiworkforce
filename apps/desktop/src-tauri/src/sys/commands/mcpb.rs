//! MCP Bundle (MCPB) Support
//!
//! This module provides comprehensive support for discovering, installing, managing,
//! and updating MCP server bundles. Bundles are pre-configured MCP server packages
//! that can be easily installed via npm.
//!
//! ## Features
//! - Registry-based bundle discovery (with embedded data + future API support)
//! - Bundle installation via npm
//! - Bundle updates and version management
//! - Progress events during installation
//! - Persistent metadata storage

use crate::core::mcp::{McpServerConfig, McpServersConfig};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::process::Command;

// ============================================================================
// Types
// ============================================================================

/// A tool provided by an MCP bundle
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleTool {
    /// Tool name (e.g., "read_file", "search_code")
    pub name: String,
    /// Human-readable description
    pub description: String,
    /// Input parameters schema (simplified)
    pub parameters: Vec<BundleToolParameter>,
}

/// A parameter for a bundle tool
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleToolParameter {
    /// Parameter name
    pub name: String,
    /// Parameter type (string, number, boolean, object, array)
    pub param_type: String,
    /// Whether the parameter is required
    pub required: bool,
    /// Description of the parameter
    pub description: String,
}

/// A credential required by an MCP bundle
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequiredCredential {
    /// Environment variable name (e.g., "GITHUB_PERSONAL_ACCESS_TOKEN")
    pub env_var: String,
    /// Human-readable name (e.g., "GitHub Personal Access Token")
    pub display_name: String,
    /// Description of what this credential is for
    pub description: String,
    /// URL to get the credential (e.g., GitHub settings page)
    pub help_url: Option<String>,
    /// Whether this credential is required or optional
    pub required: bool,
}

/// Configuration template for an MCP server
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConfigTemplate {
    /// Command to run (e.g., "npx", "node")
    pub command: String,
    /// Arguments to pass to the command
    pub args: Vec<String>,
    /// Environment variables (with placeholders for credentials)
    pub env: HashMap<String, String>,
}

/// An MCP Bundle from the registry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpBundle {
    /// Unique identifier (e.g., "mcp-filesystem", "mcp-github")
    pub id: String,
    /// Human-readable name
    pub name: String,
    /// Semantic version (e.g., "1.0.0")
    pub version: String,
    /// Description of what this bundle does
    pub description: String,
    /// Author or organization
    pub author: String,
    /// Category (e.g., "development", "productivity", "data", "search")
    pub category: String,
    /// Icon URL (optional)
    pub icon_url: Option<String>,
    /// NPM package name (e.g., "@modelcontextprotocol/server-filesystem")
    pub npm_package: Option<String>,
    /// GitHub repository URL
    pub github_url: Option<String>,
    /// Documentation URL
    pub documentation_url: Option<String>,
    /// Tools provided by this bundle
    pub tools: Vec<BundleTool>,
    /// Server configuration template
    pub config_template: McpConfigTemplate,
    /// Required credentials
    pub required_credentials: Vec<RequiredCredential>,
    /// Average rating (0.0 - 5.0)
    pub rating: f64,
    /// Number of downloads
    pub downloads: u32,
    /// Whether this bundle is verified by the registry
    pub verified: bool,
    /// Whether this bundle is featured
    pub featured: bool,
    /// Tags for search/filtering
    pub tags: Vec<String>,
    /// Whether this bundle is installed locally
    #[serde(default)]
    pub installed: bool,
    /// Installed version (if installed)
    pub installed_version: Option<String>,
    /// Whether an update is available
    #[serde(default)]
    pub update_available: bool,
}

/// Progress information during bundle installation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    /// Bundle ID being installed
    pub bundle_id: String,
    /// Current phase (e.g., "downloading", "installing", "configuring")
    pub phase: String,
    /// Progress percentage (0-100)
    pub progress: u8,
    /// Current status message
    pub message: String,
}

/// Metadata about an installed bundle
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledBundleMetadata {
    /// Bundle ID
    pub bundle_id: String,
    /// Installed version
    pub version: String,
    /// NPM package name
    pub npm_package: Option<String>,
    /// Installation timestamp (Unix epoch seconds)
    pub installed_at: u64,
    /// Last updated timestamp
    pub updated_at: u64,
    /// Server name in MCP config
    pub server_name: String,
}

/// Container for all installed bundle metadata
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstalledBundlesData {
    pub bundles: HashMap<String, InstalledBundleMetadata>,
}

// ============================================================================
// State
// ============================================================================

/// State for the MCPB system
pub struct McpbState {
    /// Cached registry data
    pub registry_cache: Arc<Mutex<Vec<McpBundle>>>,
    /// Installed bundles metadata
    pub installed: Arc<Mutex<InstalledBundlesData>>,
}

impl Default for McpbState {
    fn default() -> Self {
        Self::new()
    }
}

impl McpbState {
    pub fn new() -> Self {
        let installed = Self::load_installed_metadata().unwrap_or_default();
        Self {
            registry_cache: Arc::new(Mutex::new(Vec::new())),
            installed: Arc::new(Mutex::new(installed)),
        }
    }

    /// Get the path to the installed bundles metadata file
    fn metadata_path() -> Result<PathBuf, String> {
        let app_data =
            dirs::data_dir().ok_or_else(|| "Failed to get app data directory".to_string())?;
        Ok(app_data.join("agiworkforce").join("mcpb-installed.json"))
    }

    /// Load installed bundles metadata from disk
    fn load_installed_metadata() -> Result<InstalledBundlesData, String> {
        let path = Self::metadata_path()?;
        if !path.exists() {
            return Ok(InstalledBundlesData::default());
        }
        let contents = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read installed bundles: {}", e))?;
        serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse installed bundles: {}", e))
    }

    /// Save installed bundles metadata to disk
    async fn save_installed_metadata(&self) -> Result<(), String> {
        let path = Self::metadata_path()?;

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        let data = self.installed.lock().clone();
        let json = serde_json::to_string_pretty(&data)
            .map_err(|e| format!("Failed to serialize installed bundles: {}", e))?;
        tokio::fs::write(&path, json)
            .await
            .map_err(|e| format!("Failed to write installed bundles: {}", e))?;

        Ok(())
    }
}

// ============================================================================
// Event Emission Helpers
// ============================================================================

fn emit_install_started(app: &AppHandle, bundle_id: &str) {
    let _ = app.emit(
        "mcpb:install_started",
        serde_json::json!({
            "bundleId": bundle_id,
            "timestamp": chrono::Utc::now().timestamp()
        }),
    );
}

fn emit_install_progress(app: &AppHandle, progress: &InstallProgress) {
    let _ = app.emit("mcpb:install_progress", progress);
}

fn emit_install_completed(app: &AppHandle, bundle_id: &str, version: &str) {
    let _ = app.emit(
        "mcpb:install_completed",
        serde_json::json!({
            "bundleId": bundle_id,
            "version": version,
            "timestamp": chrono::Utc::now().timestamp()
        }),
    );
}

fn emit_install_failed(app: &AppHandle, bundle_id: &str, error: &str) {
    let _ = app.emit(
        "mcpb:install_failed",
        serde_json::json!({
            "bundleId": bundle_id,
            "error": error,
            "timestamp": chrono::Utc::now().timestamp()
        }),
    );
}

// ============================================================================
// Registry Data (Embedded)
// ============================================================================

/// Get the embedded registry data for popular MCP servers.
///
/// In the future, this could be replaced or augmented with:
/// - API call to: GET https://registry.mcpservers.io/api/v1/bundles
/// - Local cache with TTL
/// - User-contributed bundles
fn get_embedded_registry() -> Vec<McpBundle> {
    vec![
        // Filesystem - Local file system access
        McpBundle {
            id: "mcp-filesystem".to_string(),
            name: "Filesystem".to_string(),
            version: "0.6.2".to_string(),
            description: "Secure, sandboxed access to local filesystem. Read, write, and manage files and directories with configurable access controls.".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "development".to_string(),
            icon_url: Some("https://raw.githubusercontent.com/modelcontextprotocol/servers/main/assets/filesystem.svg".to_string()),
            npm_package: Some("@modelcontextprotocol/server-filesystem".to_string()),
            github_url: Some("https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem".to_string()),
            documentation_url: Some("https://modelcontextprotocol.io/docs/servers/filesystem".to_string()),
            tools: vec![
                BundleTool {
                    name: "read_file".to_string(),
                    description: "Read the contents of a file".to_string(),
                    parameters: vec![
                        BundleToolParameter {
                            name: "path".to_string(),
                            param_type: "string".to_string(),
                            required: true,
                            description: "Path to the file to read".to_string(),
                        },
                    ],
                },
                BundleTool {
                    name: "write_file".to_string(),
                    description: "Write content to a file".to_string(),
                    parameters: vec![
                        BundleToolParameter {
                            name: "path".to_string(),
                            param_type: "string".to_string(),
                            required: true,
                            description: "Path to the file to write".to_string(),
                        },
                        BundleToolParameter {
                            name: "content".to_string(),
                            param_type: "string".to_string(),
                            required: true,
                            description: "Content to write to the file".to_string(),
                        },
                    ],
                },
                BundleTool {
                    name: "list_directory".to_string(),
                    description: "List contents of a directory".to_string(),
                    parameters: vec![
                        BundleToolParameter {
                            name: "path".to_string(),
                            param_type: "string".to_string(),
                            required: true,
                            description: "Path to the directory".to_string(),
                        },
                    ],
                },
                BundleTool {
                    name: "create_directory".to_string(),
                    description: "Create a new directory".to_string(),
                    parameters: vec![
                        BundleToolParameter {
                            name: "path".to_string(),
                            param_type: "string".to_string(),
                            required: true,
                            description: "Path of the directory to create".to_string(),
                        },
                    ],
                },
                BundleTool {
                    name: "move_file".to_string(),
                    description: "Move or rename a file".to_string(),
                    parameters: vec![
                        BundleToolParameter {
                            name: "source".to_string(),
                            param_type: "string".to_string(),
                            required: true,
                            description: "Source path".to_string(),
                        },
                        BundleToolParameter {
                            name: "destination".to_string(),
                            param_type: "string".to_string(),
                            required: true,
                            description: "Destination path".to_string(),
                        },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@modelcontextprotocol/server-filesystem".to_string(), ".".to_string()],
                env: HashMap::new(),
            },
            required_credentials: vec![],
            rating: 4.9,
            downloads: 156000,
            verified: true,
            featured: true,
            tags: vec!["files".to_string(), "filesystem".to_string(), "io".to_string(), "storage".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // GitHub
        McpBundle {
            id: "mcp-github".to_string(),
            name: "GitHub".to_string(),
            version: "0.6.2".to_string(),
            description: "Full GitHub integration - repositories, issues, pull requests, code search, and more. Supports both public and private repos.".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "development".to_string(),
            icon_url: Some("https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png".to_string()),
            npm_package: Some("@modelcontextprotocol/server-github".to_string()),
            github_url: Some("https://github.com/modelcontextprotocol/servers/tree/main/src/github".to_string()),
            documentation_url: Some("https://modelcontextprotocol.io/docs/servers/github".to_string()),
            tools: vec![
                BundleTool {
                    name: "create_or_update_file".to_string(),
                    description: "Create or update a file in a repository".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "owner".to_string(), param_type: "string".to_string(), required: true, description: "Repository owner".to_string() },
                        BundleToolParameter { name: "repo".to_string(), param_type: "string".to_string(), required: true, description: "Repository name".to_string() },
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "File path".to_string() },
                        BundleToolParameter { name: "content".to_string(), param_type: "string".to_string(), required: true, description: "File content".to_string() },
                    ],
                },
                BundleTool {
                    name: "search_repositories".to_string(),
                    description: "Search GitHub repositories".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "query".to_string(), param_type: "string".to_string(), required: true, description: "Search query".to_string() },
                    ],
                },
                BundleTool {
                    name: "create_issue".to_string(),
                    description: "Create a new issue".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "owner".to_string(), param_type: "string".to_string(), required: true, description: "Repository owner".to_string() },
                        BundleToolParameter { name: "repo".to_string(), param_type: "string".to_string(), required: true, description: "Repository name".to_string() },
                        BundleToolParameter { name: "title".to_string(), param_type: "string".to_string(), required: true, description: "Issue title".to_string() },
                    ],
                },
                BundleTool {
                    name: "create_pull_request".to_string(),
                    description: "Create a new pull request".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "owner".to_string(), param_type: "string".to_string(), required: true, description: "Repository owner".to_string() },
                        BundleToolParameter { name: "repo".to_string(), param_type: "string".to_string(), required: true, description: "Repository name".to_string() },
                        BundleToolParameter { name: "title".to_string(), param_type: "string".to_string(), required: true, description: "PR title".to_string() },
                        BundleToolParameter { name: "head".to_string(), param_type: "string".to_string(), required: true, description: "Head branch".to_string() },
                        BundleToolParameter { name: "base".to_string(), param_type: "string".to_string(), required: true, description: "Base branch".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@modelcontextprotocol/server-github".to_string()],
                env: {
                    let mut env = HashMap::new();
                    env.insert("GITHUB_PERSONAL_ACCESS_TOKEN".to_string(), "<from_credential_manager>".to_string());
                    env
                },
            },
            required_credentials: vec![
                RequiredCredential {
                    env_var: "GITHUB_PERSONAL_ACCESS_TOKEN".to_string(),
                    display_name: "GitHub Personal Access Token".to_string(),
                    description: "Personal access token with repo and user scopes. Required for API access.".to_string(),
                    help_url: Some("https://github.com/settings/tokens".to_string()),
                    required: true,
                },
            ],
            rating: 4.9,
            downloads: 234000,
            verified: true,
            featured: true,
            tags: vec!["github".to_string(), "git".to_string(), "code".to_string(), "development".to_string(), "version-control".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Slack
        McpBundle {
            id: "mcp-slack".to_string(),
            name: "Slack".to_string(),
            version: "0.6.2".to_string(),
            description: "Slack workspace integration - send messages, read channels, manage reactions, and search conversations.".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "productivity".to_string(),
            icon_url: Some("https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png".to_string()),
            npm_package: Some("@modelcontextprotocol/server-slack".to_string()),
            github_url: Some("https://github.com/modelcontextprotocol/servers/tree/main/src/slack".to_string()),
            documentation_url: Some("https://modelcontextprotocol.io/docs/servers/slack".to_string()),
            tools: vec![
                BundleTool {
                    name: "slack_post_message".to_string(),
                    description: "Post a message to a Slack channel".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "channel".to_string(), param_type: "string".to_string(), required: true, description: "Channel ID or name".to_string() },
                        BundleToolParameter { name: "text".to_string(), param_type: "string".to_string(), required: true, description: "Message text".to_string() },
                    ],
                },
                BundleTool {
                    name: "slack_list_channels".to_string(),
                    description: "List available Slack channels".to_string(),
                    parameters: vec![],
                },
                BundleTool {
                    name: "slack_get_channel_history".to_string(),
                    description: "Get message history from a channel".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "channel".to_string(), param_type: "string".to_string(), required: true, description: "Channel ID".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@modelcontextprotocol/server-slack".to_string()],
                env: {
                    let mut env = HashMap::new();
                    env.insert("SLACK_BOT_TOKEN".to_string(), "<from_credential_manager>".to_string());
                    env.insert("SLACK_TEAM_ID".to_string(), "<from_credential_manager>".to_string());
                    env
                },
            },
            required_credentials: vec![
                RequiredCredential {
                    env_var: "SLACK_BOT_TOKEN".to_string(),
                    display_name: "Slack Bot Token".to_string(),
                    description: "Bot token starting with xoxb-. Create a Slack app to get one.".to_string(),
                    help_url: Some("https://api.slack.com/apps".to_string()),
                    required: true,
                },
                RequiredCredential {
                    env_var: "SLACK_TEAM_ID".to_string(),
                    display_name: "Slack Team ID".to_string(),
                    description: "Your Slack workspace team ID".to_string(),
                    help_url: Some("https://api.slack.com/methods/team.info".to_string()),
                    required: true,
                },
            ],
            rating: 4.7,
            downloads: 78000,
            verified: true,
            featured: true,
            tags: vec!["slack".to_string(), "messaging".to_string(), "chat".to_string(), "team".to_string(), "communication".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // PostgreSQL
        McpBundle {
            id: "mcp-postgres".to_string(),
            name: "PostgreSQL".to_string(),
            version: "0.6.2".to_string(),
            description: "Read-only access to PostgreSQL databases. Query data, explore schemas, and analyze database structures.".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "data".to_string(),
            icon_url: Some("https://www.postgresql.org/media/img/about/press/elephant.png".to_string()),
            npm_package: Some("@modelcontextprotocol/server-postgres".to_string()),
            github_url: Some("https://github.com/modelcontextprotocol/servers/tree/main/src/postgres".to_string()),
            documentation_url: Some("https://modelcontextprotocol.io/docs/servers/postgres".to_string()),
            tools: vec![
                BundleTool {
                    name: "query".to_string(),
                    description: "Execute a read-only SQL query".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "sql".to_string(), param_type: "string".to_string(), required: true, description: "SQL query to execute".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@modelcontextprotocol/server-postgres".to_string()],
                env: {
                    let mut env = HashMap::new();
                    env.insert("POSTGRES_CONNECTION_STRING".to_string(), "<from_credential_manager>".to_string());
                    env
                },
            },
            required_credentials: vec![
                RequiredCredential {
                    env_var: "POSTGRES_CONNECTION_STRING".to_string(),
                    display_name: "PostgreSQL Connection String".to_string(),
                    description: "Database connection string in the format: postgresql://user:password@host:port/database".to_string(),
                    help_url: Some("https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING".to_string()),
                    required: true,
                },
            ],
            rating: 4.6,
            downloads: 67000,
            verified: true,
            featured: false,
            tags: vec!["database".to_string(), "postgresql".to_string(), "sql".to_string(), "data".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Memory
        McpBundle {
            id: "mcp-memory".to_string(),
            name: "Memory".to_string(),
            version: "0.6.2".to_string(),
            description: "Persistent memory and knowledge graph storage. Store entities, relations, and observations that persist across sessions.".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "data".to_string(),
            icon_url: Some("https://raw.githubusercontent.com/modelcontextprotocol/servers/main/assets/memory.svg".to_string()),
            npm_package: Some("@modelcontextprotocol/server-memory".to_string()),
            github_url: Some("https://github.com/modelcontextprotocol/servers/tree/main/src/memory".to_string()),
            documentation_url: Some("https://modelcontextprotocol.io/docs/servers/memory".to_string()),
            tools: vec![
                BundleTool {
                    name: "create_entities".to_string(),
                    description: "Create new entities in the knowledge graph".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "entities".to_string(), param_type: "array".to_string(), required: true, description: "Array of entities to create".to_string() },
                    ],
                },
                BundleTool {
                    name: "create_relations".to_string(),
                    description: "Create relations between entities".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "relations".to_string(), param_type: "array".to_string(), required: true, description: "Array of relations".to_string() },
                    ],
                },
                BundleTool {
                    name: "search_nodes".to_string(),
                    description: "Search for entities in the knowledge graph".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "query".to_string(), param_type: "string".to_string(), required: true, description: "Search query".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@modelcontextprotocol/server-memory".to_string()],
                env: HashMap::new(),
            },
            required_credentials: vec![],
            rating: 4.5,
            downloads: 45000,
            verified: true,
            featured: false,
            tags: vec!["memory".to_string(), "knowledge-graph".to_string(), "persistence".to_string(), "entities".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Puppeteer
        McpBundle {
            id: "mcp-puppeteer".to_string(),
            name: "Puppeteer".to_string(),
            version: "0.6.2".to_string(),
            description: "Browser automation with Puppeteer. Navigate pages, take screenshots, interact with elements, and extract content.".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "automation".to_string(),
            icon_url: Some("https://user-images.githubusercontent.com/10379601/29446482-04f7036a-841f-11e7-9872-91d1fc2ea683.png".to_string()),
            npm_package: Some("@modelcontextprotocol/server-puppeteer".to_string()),
            github_url: Some("https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer".to_string()),
            documentation_url: Some("https://modelcontextprotocol.io/docs/servers/puppeteer".to_string()),
            tools: vec![
                BundleTool {
                    name: "puppeteer_navigate".to_string(),
                    description: "Navigate to a URL".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "url".to_string(), param_type: "string".to_string(), required: true, description: "URL to navigate to".to_string() },
                    ],
                },
                BundleTool {
                    name: "puppeteer_screenshot".to_string(),
                    description: "Take a screenshot of the current page".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "name".to_string(), param_type: "string".to_string(), required: true, description: "Screenshot name".to_string() },
                    ],
                },
                BundleTool {
                    name: "puppeteer_click".to_string(),
                    description: "Click an element on the page".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "selector".to_string(), param_type: "string".to_string(), required: true, description: "CSS selector".to_string() },
                    ],
                },
                BundleTool {
                    name: "puppeteer_fill".to_string(),
                    description: "Fill an input field".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "selector".to_string(), param_type: "string".to_string(), required: true, description: "CSS selector".to_string() },
                        BundleToolParameter { name: "value".to_string(), param_type: "string".to_string(), required: true, description: "Value to fill".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@modelcontextprotocol/server-puppeteer".to_string()],
                env: HashMap::new(),
            },
            required_credentials: vec![],
            rating: 4.7,
            downloads: 92000,
            verified: true,
            featured: true,
            tags: vec!["browser".to_string(), "automation".to_string(), "puppeteer".to_string(), "web".to_string(), "scraping".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Fetch
        McpBundle {
            id: "mcp-fetch".to_string(),
            name: "Fetch".to_string(),
            version: "0.6.2".to_string(),
            description: "HTTP client for fetching web content. Retrieve web pages and convert them to markdown for easy processing.".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "data".to_string(),
            icon_url: Some("https://raw.githubusercontent.com/modelcontextprotocol/servers/main/assets/fetch.svg".to_string()),
            npm_package: Some("@modelcontextprotocol/server-fetch".to_string()),
            github_url: Some("https://github.com/modelcontextprotocol/servers/tree/main/src/fetch".to_string()),
            documentation_url: Some("https://modelcontextprotocol.io/docs/servers/fetch".to_string()),
            tools: vec![
                BundleTool {
                    name: "fetch".to_string(),
                    description: "Fetch a URL and return content as markdown".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "url".to_string(), param_type: "string".to_string(), required: true, description: "URL to fetch".to_string() },
                        BundleToolParameter { name: "max_length".to_string(), param_type: "number".to_string(), required: false, description: "Maximum content length".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@modelcontextprotocol/server-fetch".to_string()],
                env: HashMap::new(),
            },
            required_credentials: vec![],
            rating: 4.6,
            downloads: 112000,
            verified: true,
            featured: false,
            tags: vec!["http".to_string(), "fetch".to_string(), "web".to_string(), "content".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Sequential Thinking
        McpBundle {
            id: "mcp-sequential-thinking".to_string(),
            name: "Sequential Thinking".to_string(),
            version: "0.6.2".to_string(),
            description: "Dynamic problem-solving through structured thought sequences. Break down complex problems into manageable steps.".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "reasoning".to_string(),
            icon_url: Some("https://raw.githubusercontent.com/modelcontextprotocol/servers/main/assets/thinking.svg".to_string()),
            npm_package: Some("@modelcontextprotocol/server-sequential-thinking".to_string()),
            github_url: Some("https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking".to_string()),
            documentation_url: Some("https://modelcontextprotocol.io/docs/servers/sequential-thinking".to_string()),
            tools: vec![
                BundleTool {
                    name: "create_thought".to_string(),
                    description: "Add a thought to the reasoning chain".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "thought".to_string(), param_type: "string".to_string(), required: true, description: "The thought content".to_string() },
                        BundleToolParameter { name: "thought_number".to_string(), param_type: "number".to_string(), required: true, description: "Sequence number".to_string() },
                        BundleToolParameter { name: "total_thoughts".to_string(), param_type: "number".to_string(), required: true, description: "Estimated total thoughts".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@modelcontextprotocol/server-sequential-thinking".to_string()],
                env: HashMap::new(),
            },
            required_credentials: vec![],
            rating: 4.4,
            downloads: 34000,
            verified: true,
            featured: false,
            tags: vec!["reasoning".to_string(), "thinking".to_string(), "problem-solving".to_string(), "chain-of-thought".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Google Drive
        McpBundle {
            id: "mcp-gdrive".to_string(),
            name: "Google Drive".to_string(),
            version: "0.6.2".to_string(),
            description: "Access and manage Google Drive files. List, read, and search files in your Google Drive.".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "productivity".to_string(),
            icon_url: Some("https://ssl.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png".to_string()),
            npm_package: Some("@modelcontextprotocol/server-gdrive".to_string()),
            github_url: Some("https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive".to_string()),
            documentation_url: Some("https://modelcontextprotocol.io/docs/servers/gdrive".to_string()),
            tools: vec![
                BundleTool {
                    name: "gdrive_list".to_string(),
                    description: "List files in Google Drive".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "folder_id".to_string(), param_type: "string".to_string(), required: false, description: "Folder ID to list (root if omitted)".to_string() },
                    ],
                },
                BundleTool {
                    name: "gdrive_read".to_string(),
                    description: "Read a file from Google Drive".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "file_id".to_string(), param_type: "string".to_string(), required: true, description: "File ID to read".to_string() },
                    ],
                },
                BundleTool {
                    name: "gdrive_search".to_string(),
                    description: "Search files in Google Drive".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "query".to_string(), param_type: "string".to_string(), required: true, description: "Search query".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@modelcontextprotocol/server-gdrive".to_string()],
                env: HashMap::new(),
            },
            required_credentials: vec![
                RequiredCredential {
                    env_var: "GDRIVE_CREDENTIALS_PATH".to_string(),
                    display_name: "Google OAuth Credentials Path".to_string(),
                    description: "Path to Google OAuth credentials JSON file. Create credentials in Google Cloud Console.".to_string(),
                    help_url: Some("https://console.cloud.google.com/apis/credentials".to_string()),
                    required: true,
                },
            ],
            rating: 4.5,
            downloads: 56000,
            verified: true,
            featured: false,
            tags: vec!["google".to_string(), "drive".to_string(), "cloud".to_string(), "storage".to_string(), "files".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Notion
        McpBundle {
            id: "mcp-notion".to_string(),
            name: "Notion".to_string(),
            version: "1.0.0".to_string(),
            description: "Notion workspace integration. Search pages, read content, create and update pages and databases.".to_string(),
            author: "Community".to_string(),
            category: "productivity".to_string(),
            icon_url: Some("https://upload.wikimedia.org/wikipedia/commons/e/e9/Notion-logo.svg".to_string()),
            npm_package: Some("@notionhq/mcp-server".to_string()),
            github_url: Some("https://github.com/makenotion/notion-mcp-server".to_string()),
            documentation_url: Some("https://developers.notion.com/".to_string()),
            tools: vec![
                BundleTool {
                    name: "notion_search".to_string(),
                    description: "Search Notion pages and databases".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "query".to_string(), param_type: "string".to_string(), required: true, description: "Search query".to_string() },
                    ],
                },
                BundleTool {
                    name: "notion_get_page".to_string(),
                    description: "Get a Notion page by ID".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "page_id".to_string(), param_type: "string".to_string(), required: true, description: "Page ID".to_string() },
                    ],
                },
                BundleTool {
                    name: "notion_create_page".to_string(),
                    description: "Create a new Notion page".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "parent_id".to_string(), param_type: "string".to_string(), required: true, description: "Parent page or database ID".to_string() },
                        BundleToolParameter { name: "title".to_string(), param_type: "string".to_string(), required: true, description: "Page title".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@notionhq/mcp-server".to_string()],
                env: {
                    let mut env = HashMap::new();
                    env.insert("NOTION_API_KEY".to_string(), "<from_credential_manager>".to_string());
                    env
                },
            },
            required_credentials: vec![
                RequiredCredential {
                    env_var: "NOTION_API_KEY".to_string(),
                    display_name: "Notion Integration Token".to_string(),
                    description: "Internal integration token from Notion. Create an integration at notion.so/my-integrations.".to_string(),
                    help_url: Some("https://www.notion.so/my-integrations".to_string()),
                    required: true,
                },
            ],
            rating: 4.6,
            downloads: 67000,
            verified: false,
            featured: true,
            tags: vec!["notion".to_string(), "productivity".to_string(), "notes".to_string(), "wiki".to_string(), "database".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Linear
        McpBundle {
            id: "mcp-linear".to_string(),
            name: "Linear".to_string(),
            version: "1.0.0".to_string(),
            description: "Linear issue tracker integration. Create, update, and search issues. Manage projects and cycles.".to_string(),
            author: "Community".to_string(),
            category: "development".to_string(),
            icon_url: Some("https://linear.app/static/apple-touch-icon.png".to_string()),
            npm_package: Some("@linear/mcp-server".to_string()),
            github_url: Some("https://github.com/linear/linear-mcp-server".to_string()),
            documentation_url: Some("https://developers.linear.app/".to_string()),
            tools: vec![
                BundleTool {
                    name: "linear_create_issue".to_string(),
                    description: "Create a new Linear issue".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "title".to_string(), param_type: "string".to_string(), required: true, description: "Issue title".to_string() },
                        BundleToolParameter { name: "team_id".to_string(), param_type: "string".to_string(), required: true, description: "Team ID".to_string() },
                    ],
                },
                BundleTool {
                    name: "linear_search_issues".to_string(),
                    description: "Search Linear issues".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "query".to_string(), param_type: "string".to_string(), required: true, description: "Search query".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@linear/mcp-server".to_string()],
                env: {
                    let mut env = HashMap::new();
                    env.insert("LINEAR_API_KEY".to_string(), "<from_credential_manager>".to_string());
                    env
                },
            },
            required_credentials: vec![
                RequiredCredential {
                    env_var: "LINEAR_API_KEY".to_string(),
                    display_name: "Linear API Key".to_string(),
                    description: "Personal API key from Linear settings.".to_string(),
                    help_url: Some("https://linear.app/settings/api".to_string()),
                    required: true,
                },
            ],
            rating: 4.5,
            downloads: 34000,
            verified: false,
            featured: false,
            tags: vec!["linear".to_string(), "issues".to_string(), "project-management".to_string(), "development".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Stripe
        McpBundle {
            id: "mcp-stripe".to_string(),
            name: "Stripe".to_string(),
            version: "0.6.2".to_string(),
            description: "Stripe payment integration. Query customers, subscriptions, invoices, and more. Read-only access for safety.".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "data".to_string(),
            icon_url: Some("https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg".to_string()),
            npm_package: Some("@modelcontextprotocol/server-stripe".to_string()),
            github_url: Some("https://github.com/modelcontextprotocol/servers/tree/main/src/stripe".to_string()),
            documentation_url: Some("https://modelcontextprotocol.io/docs/servers/stripe".to_string()),
            tools: vec![
                BundleTool {
                    name: "stripe_list_customers".to_string(),
                    description: "List Stripe customers".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "limit".to_string(), param_type: "number".to_string(), required: false, description: "Max results".to_string() },
                    ],
                },
                BundleTool {
                    name: "stripe_get_customer".to_string(),
                    description: "Get a Stripe customer by ID".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "customer_id".to_string(), param_type: "string".to_string(), required: true, description: "Customer ID".to_string() },
                    ],
                },
                BundleTool {
                    name: "stripe_list_subscriptions".to_string(),
                    description: "List active subscriptions".to_string(),
                    parameters: vec![],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@modelcontextprotocol/server-stripe".to_string()],
                env: {
                    let mut env = HashMap::new();
                    env.insert("STRIPE_SECRET_KEY".to_string(), "<from_credential_manager>".to_string());
                    env
                },
            },
            required_credentials: vec![
                RequiredCredential {
                    env_var: "STRIPE_SECRET_KEY".to_string(),
                    display_name: "Stripe Secret Key".to_string(),
                    description: "Stripe secret API key. Use a restricted key with read-only permissions for safety.".to_string(),
                    help_url: Some("https://dashboard.stripe.com/apikeys".to_string()),
                    required: true,
                },
            ],
            rating: 4.4,
            downloads: 28000,
            verified: true,
            featured: false,
            tags: vec!["stripe".to_string(), "payments".to_string(), "billing".to_string(), "finance".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Sentry
        McpBundle {
            id: "mcp-sentry".to_string(),
            name: "Sentry".to_string(),
            version: "1.0.0".to_string(),
            description: "Sentry error monitoring integration. Query issues, events, and project statistics.".to_string(),
            author: "Community".to_string(),
            category: "development".to_string(),
            icon_url: Some("https://sentry-brand.storage.googleapis.com/sentry-glyph-black.png".to_string()),
            npm_package: Some("@sentry/mcp-server".to_string()),
            github_url: Some("https://github.com/getsentry/sentry-mcp-server".to_string()),
            documentation_url: Some("https://docs.sentry.io/api/".to_string()),
            tools: vec![
                BundleTool {
                    name: "sentry_list_issues".to_string(),
                    description: "List Sentry issues for a project".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "project".to_string(), param_type: "string".to_string(), required: true, description: "Project slug".to_string() },
                    ],
                },
                BundleTool {
                    name: "sentry_get_issue".to_string(),
                    description: "Get details for a specific issue".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "issue_id".to_string(), param_type: "string".to_string(), required: true, description: "Issue ID".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@sentry/mcp-server".to_string()],
                env: {
                    let mut env = HashMap::new();
                    env.insert("SENTRY_AUTH_TOKEN".to_string(), "<from_credential_manager>".to_string());
                    env.insert("SENTRY_ORG".to_string(), "<from_credential_manager>".to_string());
                    env
                },
            },
            required_credentials: vec![
                RequiredCredential {
                    env_var: "SENTRY_AUTH_TOKEN".to_string(),
                    display_name: "Sentry Auth Token".to_string(),
                    description: "Sentry authentication token with project read access.".to_string(),
                    help_url: Some("https://sentry.io/settings/account/api/auth-tokens/".to_string()),
                    required: true,
                },
                RequiredCredential {
                    env_var: "SENTRY_ORG".to_string(),
                    display_name: "Sentry Organization".to_string(),
                    description: "Your Sentry organization slug.".to_string(),
                    help_url: None,
                    required: true,
                },
            ],
            rating: 4.3,
            downloads: 19000,
            verified: false,
            featured: false,
            tags: vec!["sentry".to_string(), "errors".to_string(), "monitoring".to_string(), "debugging".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Cloudflare
        McpBundle {
            id: "mcp-cloudflare".to_string(),
            name: "Cloudflare".to_string(),
            version: "1.0.0".to_string(),
            description: "Cloudflare integration for managing Workers, KV, R2, and D1. Deploy and query Cloudflare services.".to_string(),
            author: "Community".to_string(),
            category: "infrastructure".to_string(),
            icon_url: Some("https://www.cloudflare.com/img/logo-cloudflare-dark.svg".to_string()),
            npm_package: Some("@cloudflare/mcp-server".to_string()),
            github_url: Some("https://github.com/cloudflare/mcp-server".to_string()),
            documentation_url: Some("https://developers.cloudflare.com/".to_string()),
            tools: vec![
                BundleTool {
                    name: "cloudflare_list_workers".to_string(),
                    description: "List Cloudflare Workers".to_string(),
                    parameters: vec![],
                },
                BundleTool {
                    name: "cloudflare_kv_get".to_string(),
                    description: "Get a value from KV".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "namespace_id".to_string(), param_type: "string".to_string(), required: true, description: "KV namespace ID".to_string() },
                        BundleToolParameter { name: "key".to_string(), param_type: "string".to_string(), required: true, description: "Key to retrieve".to_string() },
                    ],
                },
                BundleTool {
                    name: "cloudflare_d1_query".to_string(),
                    description: "Query a D1 database".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "database_id".to_string(), param_type: "string".to_string(), required: true, description: "D1 database ID".to_string() },
                        BundleToolParameter { name: "sql".to_string(), param_type: "string".to_string(), required: true, description: "SQL query".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@cloudflare/mcp-server".to_string()],
                env: {
                    let mut env = HashMap::new();
                    env.insert("CLOUDFLARE_API_TOKEN".to_string(), "<from_credential_manager>".to_string());
                    env.insert("CLOUDFLARE_ACCOUNT_ID".to_string(), "<from_credential_manager>".to_string());
                    env
                },
            },
            required_credentials: vec![
                RequiredCredential {
                    env_var: "CLOUDFLARE_API_TOKEN".to_string(),
                    display_name: "Cloudflare API Token".to_string(),
                    description: "Cloudflare API token with appropriate permissions.".to_string(),
                    help_url: Some("https://dash.cloudflare.com/profile/api-tokens".to_string()),
                    required: true,
                },
                RequiredCredential {
                    env_var: "CLOUDFLARE_ACCOUNT_ID".to_string(),
                    display_name: "Cloudflare Account ID".to_string(),
                    description: "Your Cloudflare account ID.".to_string(),
                    help_url: Some("https://dash.cloudflare.com/".to_string()),
                    required: true,
                },
            ],
            rating: 4.2,
            downloads: 23000,
            verified: false,
            featured: false,
            tags: vec!["cloudflare".to_string(), "workers".to_string(), "kv".to_string(), "r2".to_string(), "d1".to_string(), "edge".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },
    ]
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Fetch the bundle registry.
///
/// Currently returns embedded data. In the future, this could:
/// - Fetch from: GET https://registry.mcpservers.io/api/v1/bundles
/// - Cache results with a TTL (e.g., 1 hour)
/// - Merge with local/custom bundles
#[tauri::command]
pub async fn mcpb_fetch_registry(state: State<'_, McpbState>) -> Result<Vec<McpBundle>, String> {
    tracing::info!("Fetching MCPB registry");

    // TODO: Future API integration
    // let response = reqwest::get("https://registry.mcpservers.io/api/v1/bundles")
    //     .await
    //     .map_err(|e| format!("Failed to fetch registry: {}", e))?;
    // let bundles: Vec<McpBundle> = response.json().await
    //     .map_err(|e| format!("Failed to parse registry: {}", e))?;

    let mut bundles = get_embedded_registry();

    // Mark installed bundles
    let installed = state.installed.lock();
    for bundle in &mut bundles {
        if let Some(metadata) = installed.bundles.get(&bundle.id) {
            bundle.installed = true;
            bundle.installed_version = Some(metadata.version.clone());
            bundle.update_available = metadata.version != bundle.version;
        }
    }

    // Cache the registry
    *state.registry_cache.lock() = bundles.clone();

    tracing::info!("Fetched {} bundles from registry", bundles.len());
    Ok(bundles)
}

/// Search and filter bundles.
#[tauri::command]
pub async fn mcpb_search_bundles(
    state: State<'_, McpbState>,
    query: String,
    category: Option<String>,
) -> Result<Vec<McpBundle>, String> {
    tracing::info!(
        "Searching bundles: query='{}', category={:?}",
        query,
        category
    );

    let cache = state.registry_cache.lock();
    let bundles = if cache.is_empty() {
        drop(cache);
        // Re-fetch if cache is empty
        let mut bundles = get_embedded_registry();
        let installed = state.installed.lock();
        for bundle in &mut bundles {
            if let Some(metadata) = installed.bundles.get(&bundle.id) {
                bundle.installed = true;
                bundle.installed_version = Some(metadata.version.clone());
                bundle.update_available = metadata.version != bundle.version;
            }
        }
        bundles
    } else {
        cache.clone()
    };

    let query_lower = query.to_lowercase();

    let filtered: Vec<McpBundle> = bundles
        .into_iter()
        .filter(|bundle| {
            // Category filter
            if let Some(ref cat) = category {
                if !cat.is_empty() && bundle.category != *cat {
                    return false;
                }
            }

            // Query filter (search name, description, tags)
            if query_lower.is_empty() {
                return true;
            }

            bundle.name.to_lowercase().contains(&query_lower)
                || bundle.description.to_lowercase().contains(&query_lower)
                || bundle
                    .tags
                    .iter()
                    .any(|t| t.to_lowercase().contains(&query_lower))
                || bundle.author.to_lowercase().contains(&query_lower)
        })
        .collect();

    tracing::info!("Search returned {} bundles", filtered.len());
    Ok(filtered)
}

/// Get full details for a specific bundle.
#[tauri::command]
pub async fn mcpb_get_bundle_details(
    state: State<'_, McpbState>,
    bundle_id: String,
) -> Result<McpBundle, String> {
    tracing::info!("Getting bundle details: {}", bundle_id);

    let cache = state.registry_cache.lock();
    let bundles = if cache.is_empty() {
        drop(cache);
        get_embedded_registry()
    } else {
        cache.clone()
    };

    let mut bundle = bundles
        .into_iter()
        .find(|b| b.id == bundle_id)
        .ok_or_else(|| format!("Bundle not found: {}", bundle_id))?;

    // Check installed status
    let installed = state.installed.lock();
    if let Some(metadata) = installed.bundles.get(&bundle.id) {
        bundle.installed = true;
        bundle.installed_version = Some(metadata.version.clone());
        bundle.update_available = metadata.version != bundle.version;
    }

    Ok(bundle)
}

/// Install a bundle via npm.
#[tauri::command]
pub async fn mcpb_install_bundle(
    state: State<'_, McpbState>,
    mcp_state: State<'_, crate::sys::commands::mcp::McpState>,
    app: AppHandle,
    bundle_id: String,
) -> Result<String, String> {
    tracing::info!("Installing bundle: {}", bundle_id);

    // Get bundle info
    let bundle = {
        let cache = state.registry_cache.lock();
        let bundles = if cache.is_empty() {
            drop(cache);
            get_embedded_registry()
        } else {
            cache.clone()
        };
        bundles
            .into_iter()
            .find(|b| b.id == bundle_id)
            .ok_or_else(|| format!("Bundle not found: {}", bundle_id))?
    };

    let npm_package = bundle
        .npm_package
        .clone()
        .ok_or_else(|| "Bundle has no npm package".to_string())?;

    // Emit install started event
    emit_install_started(&app, &bundle_id);

    // Phase 1: Downloading/Installing npm package
    emit_install_progress(
        &app,
        &InstallProgress {
            bundle_id: bundle_id.clone(),
            phase: "installing".to_string(),
            progress: 10,
            message: format!("Installing {}...", npm_package),
        },
    );

    // Run npm install globally
    let npm_result = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", "npm", "install", "-g", &npm_package])
            .output()
            .await
    } else {
        Command::new("npm")
            .args(["install", "-g", &npm_package])
            .output()
            .await
    };

    match npm_result {
        Ok(output) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                tracing::error!("npm install failed: {}", stderr);
                emit_install_failed(&app, &bundle_id, &stderr);
                return Err(format!("npm install failed: {}", stderr));
            }
            tracing::info!("npm install succeeded for {}", npm_package);
        }
        Err(e) => {
            tracing::error!("Failed to run npm: {}", e);
            emit_install_failed(&app, &bundle_id, &e.to_string());
            return Err(format!("Failed to run npm: {}", e));
        }
    }

    emit_install_progress(
        &app,
        &InstallProgress {
            bundle_id: bundle_id.clone(),
            phase: "configuring".to_string(),
            progress: 60,
            message: "Configuring MCP server...".to_string(),
        },
    );

    // Phase 2: Add to MCP config
    let server_name = bundle_id
        .strip_prefix("mcp-")
        .unwrap_or(&bundle_id)
        .to_string();

    let server_config = McpServerConfig {
        command: bundle.config_template.command.clone(),
        args: bundle.config_template.args.clone(),
        env: bundle.config_template.env.clone(),
        enabled: false, // Start disabled so user can configure credentials
        transport: None, // Use default STDIO transport
    };

    // Add to MCP config
    let config_clone = {
        let mut config = mcp_state.config.lock();
        config
            .mcp_servers
            .insert(server_name.clone(), server_config);
        config.clone()
    };

    // Save config (outside the lock)
    let config_path = McpServersConfig::default_config_path()
        .map_err(|e| format!("Failed to get config path: {}", e))?;

    config_clone
        .save_to_file(&config_path)
        .await
        .map_err(|e| format!("Failed to save MCP config: {}", e))?;

    emit_install_progress(
        &app,
        &InstallProgress {
            bundle_id: bundle_id.clone(),
            phase: "finalizing".to_string(),
            progress: 90,
            message: "Saving metadata...".to_string(),
        },
    );

    // Phase 3: Save installed metadata
    {
        let mut installed = state.installed.lock();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        installed.bundles.insert(
            bundle_id.clone(),
            InstalledBundleMetadata {
                bundle_id: bundle_id.clone(),
                version: bundle.version.clone(),
                npm_package: bundle.npm_package.clone(),
                installed_at: now,
                updated_at: now,
                server_name: server_name.clone(),
            },
        );
    }

    state.save_installed_metadata().await?;

    // Emit completion
    emit_install_completed(&app, &bundle_id, &bundle.version);

    tracing::info!("Bundle {} installed successfully", bundle_id);
    Ok(format!(
        "Bundle '{}' installed successfully as MCP server '{}'",
        bundle.name, server_name
    ))
}

/// Uninstall a bundle.
#[tauri::command]
pub async fn mcpb_uninstall_bundle(
    state: State<'_, McpbState>,
    mcp_state: State<'_, crate::sys::commands::mcp::McpState>,
    bundle_id: String,
) -> Result<String, String> {
    tracing::info!("Uninstalling bundle: {}", bundle_id);

    // Get installed metadata
    let metadata = {
        let installed = state.installed.lock();
        installed
            .bundles
            .get(&bundle_id)
            .cloned()
            .ok_or_else(|| format!("Bundle not installed: {}", bundle_id))?
    };

    // Remove from MCP config
    let config_clone = {
        let mut config = mcp_state.config.lock();

        // Remove if present
        if config.mcp_servers.contains_key(&metadata.server_name) {
            config.mcp_servers.remove(&metadata.server_name);
        }
        config.clone()
    };

    // Save config (outside the lock)
    let config_path = McpServersConfig::default_config_path()
        .map_err(|e| format!("Failed to get config path: {}", e))?;

    config_clone
        .save_to_file(&config_path)
        .await
        .map_err(|e| format!("Failed to save MCP config: {}", e))?;

    // Optionally uninstall npm package (commented out to avoid breaking other uses)
    // if let Some(ref npm_package) = metadata.npm_package {
    //     let _ = Command::new("npm")
    //         .args(["uninstall", "-g", npm_package])
    //         .output()
    //         .await;
    // }

    // Remove from installed metadata
    {
        let mut installed = state.installed.lock();
        installed.bundles.remove(&bundle_id);
    }

    state.save_installed_metadata().await?;

    tracing::info!("Bundle {} uninstalled successfully", bundle_id);
    Ok(format!("Bundle '{}' uninstalled successfully", bundle_id))
}

/// Get list of installed bundles.
#[tauri::command]
pub async fn mcpb_get_installed_bundles(
    state: State<'_, McpbState>,
) -> Result<Vec<McpBundle>, String> {
    tracing::info!("Getting installed bundles");

    let installed = state.installed.lock();
    let registry = get_embedded_registry();

    let installed_bundles: Vec<McpBundle> = registry
        .into_iter()
        .filter_map(|mut bundle| {
            if let Some(metadata) = installed.bundles.get(&bundle.id) {
                bundle.installed = true;
                bundle.installed_version = Some(metadata.version.clone());
                bundle.update_available = metadata.version != bundle.version;
                Some(bundle)
            } else {
                None
            }
        })
        .collect();

    tracing::info!("Found {} installed bundles", installed_bundles.len());
    Ok(installed_bundles)
}

/// Check for bundle updates.
#[tauri::command]
pub async fn mcpb_check_updates(state: State<'_, McpbState>) -> Result<Vec<McpBundle>, String> {
    tracing::info!("Checking for bundle updates");

    let installed = state.installed.lock();
    let registry = get_embedded_registry();

    let updates: Vec<McpBundle> = registry
        .into_iter()
        .filter_map(|mut bundle| {
            if let Some(metadata) = installed.bundles.get(&bundle.id) {
                if metadata.version != bundle.version {
                    bundle.installed = true;
                    bundle.installed_version = Some(metadata.version.clone());
                    bundle.update_available = true;
                    return Some(bundle);
                }
            }
            None
        })
        .collect();

    tracing::info!("Found {} bundles with updates", updates.len());
    Ok(updates)
}

/// Update a specific bundle.
#[tauri::command]
pub async fn mcpb_update_bundle(
    state: State<'_, McpbState>,
    mcp_state: State<'_, crate::sys::commands::mcp::McpState>,
    app: AppHandle,
    bundle_id: String,
) -> Result<String, String> {
    tracing::info!("Updating bundle: {}", bundle_id);

    // Get current metadata
    let metadata = {
        let installed = state.installed.lock();
        installed
            .bundles
            .get(&bundle_id)
            .cloned()
            .ok_or_else(|| format!("Bundle not installed: {}", bundle_id))?
    };

    // Get latest bundle info
    let bundle = {
        let registry = get_embedded_registry();
        registry
            .into_iter()
            .find(|b| b.id == bundle_id)
            .ok_or_else(|| format!("Bundle not found in registry: {}", bundle_id))?
    };

    if metadata.version == bundle.version {
        return Ok("Bundle is already up to date".to_string());
    }

    let npm_package = bundle
        .npm_package
        .clone()
        .ok_or_else(|| "Bundle has no npm package".to_string())?;

    emit_install_started(&app, &bundle_id);

    emit_install_progress(
        &app,
        &InstallProgress {
            bundle_id: bundle_id.clone(),
            phase: "updating".to_string(),
            progress: 20,
            message: format!("Updating {} to version {}...", npm_package, bundle.version),
        },
    );

    // Run npm update
    let npm_result = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args([
                "/C",
                "npm",
                "install",
                "-g",
                &format!("{}@latest", npm_package),
            ])
            .output()
            .await
    } else {
        Command::new("npm")
            .args(["install", "-g", &format!("{}@latest", npm_package)])
            .output()
            .await
    };

    match npm_result {
        Ok(output) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                tracing::error!("npm update failed: {}", stderr);
                emit_install_failed(&app, &bundle_id, &stderr);
                return Err(format!("npm update failed: {}", stderr));
            }
        }
        Err(e) => {
            tracing::error!("Failed to run npm: {}", e);
            emit_install_failed(&app, &bundle_id, &e.to_string());
            return Err(format!("Failed to run npm: {}", e));
        }
    }

    emit_install_progress(
        &app,
        &InstallProgress {
            bundle_id: bundle_id.clone(),
            phase: "configuring".to_string(),
            progress: 70,
            message: "Updating MCP configuration...".to_string(),
        },
    );

    // Update MCP config if needed
    let config_clone = {
        let mut config = mcp_state.config.lock();
        if let Some(server_config) = config.mcp_servers.get_mut(&metadata.server_name) {
            // Update args in case they changed
            server_config.args = bundle.config_template.args.clone();
        }
        config.clone()
    };

    // Save config (outside the lock)
    let config_path = McpServersConfig::default_config_path()
        .map_err(|e| format!("Failed to get config path: {}", e))?;

    config_clone
        .save_to_file(&config_path)
        .await
        .map_err(|e| format!("Failed to save MCP config: {}", e))?;

    // Update metadata
    {
        let mut installed = state.installed.lock();
        if let Some(meta) = installed.bundles.get_mut(&bundle_id) {
            meta.version = bundle.version.clone();
            meta.updated_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
        }
    }

    state.save_installed_metadata().await?;

    emit_install_completed(&app, &bundle_id, &bundle.version);

    tracing::info!("Bundle {} updated to version {}", bundle_id, bundle.version);
    Ok(format!(
        "Bundle '{}' updated to version {}",
        bundle.name, bundle.version
    ))
}

/// Get available categories from the registry.
#[tauri::command]
pub async fn mcpb_get_categories(state: State<'_, McpbState>) -> Result<Vec<String>, String> {
    let cache = state.registry_cache.lock();
    let bundles = if cache.is_empty() {
        drop(cache);
        get_embedded_registry()
    } else {
        cache.clone()
    };

    let mut categories: Vec<String> = bundles.iter().map(|b| b.category.clone()).collect();

    categories.sort();
    categories.dedup();

    Ok(categories)
}

/// Get featured bundles.
#[tauri::command]
pub async fn mcpb_get_featured(state: State<'_, McpbState>) -> Result<Vec<McpBundle>, String> {
    let cache = state.registry_cache.lock();
    let mut bundles = if cache.is_empty() {
        drop(cache);
        get_embedded_registry()
    } else {
        cache.clone()
    };

    // Mark installed bundles
    let installed = state.installed.lock();
    for bundle in &mut bundles {
        if let Some(metadata) = installed.bundles.get(&bundle.id) {
            bundle.installed = true;
            bundle.installed_version = Some(metadata.version.clone());
            bundle.update_available = metadata.version != bundle.version;
        }
    }

    let featured: Vec<McpBundle> = bundles.into_iter().filter(|b| b.featured).collect();

    Ok(featured)
}
