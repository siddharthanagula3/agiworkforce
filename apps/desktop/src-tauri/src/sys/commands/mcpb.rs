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

use crate::core::mcp::McpServerConfig;
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
                    name: "read_text_file".to_string(),
                    description: "Read complete contents of a file as UTF-8 text, with optional head/tail line limits".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "Path to the file to read".to_string() },
                        BundleToolParameter { name: "head".to_string(), param_type: "number".to_string(), required: false, description: "Read only the first N lines".to_string() },
                        BundleToolParameter { name: "tail".to_string(), param_type: "number".to_string(), required: false, description: "Read only the last N lines".to_string() },
                    ],
                },
                BundleTool {
                    name: "read_media_file".to_string(),
                    description: "Read an image or audio file and return base64 data with MIME type".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "Path to the media file".to_string() },
                    ],
                },
                BundleTool {
                    name: "read_multiple_files".to_string(),
                    description: "Read multiple files simultaneously; failed reads don't stop the operation".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "paths".to_string(), param_type: "array".to_string(), required: true, description: "Array of file paths to read".to_string() },
                    ],
                },
                BundleTool {
                    name: "write_file".to_string(),
                    description: "Create new file or overwrite existing with content".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "File path".to_string() },
                        BundleToolParameter { name: "content".to_string(), param_type: "string".to_string(), required: true, description: "Content to write".to_string() },
                    ],
                },
                BundleTool {
                    name: "edit_file".to_string(),
                    description: "Make selective edits using pattern matching with whitespace normalization and git-style diff output".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "File to edit".to_string() },
                        BundleToolParameter { name: "edits".to_string(), param_type: "array".to_string(), required: true, description: "List of {oldText, newText} edit operations".to_string() },
                        BundleToolParameter { name: "dryRun".to_string(), param_type: "boolean".to_string(), required: false, description: "Preview changes without applying".to_string() },
                    ],
                },
                BundleTool {
                    name: "create_directory".to_string(),
                    description: "Create new directory (including parent directories if needed)".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "Directory path to create".to_string() },
                    ],
                },
                BundleTool {
                    name: "list_directory".to_string(),
                    description: "List directory contents with [FILE] or [DIR] prefixes".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "Directory path".to_string() },
                    ],
                },
                BundleTool {
                    name: "list_directory_with_sizes".to_string(),
                    description: "List directory contents with file sizes and summary statistics".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "Directory path".to_string() },
                        BundleToolParameter { name: "sortBy".to_string(), param_type: "string".to_string(), required: false, description: "Sort by 'name' or 'size' (default: name)".to_string() },
                    ],
                },
                BundleTool {
                    name: "move_file".to_string(),
                    description: "Move or rename files and directories".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "source".to_string(), param_type: "string".to_string(), required: true, description: "Source path".to_string() },
                        BundleToolParameter { name: "destination".to_string(), param_type: "string".to_string(), required: true, description: "Destination path".to_string() },
                    ],
                },
                BundleTool {
                    name: "search_files".to_string(),
                    description: "Recursively search for files/directories matching glob patterns".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "Starting directory".to_string() },
                        BundleToolParameter { name: "pattern".to_string(), param_type: "string".to_string(), required: true, description: "Search pattern (glob)".to_string() },
                        BundleToolParameter { name: "excludePatterns".to_string(), param_type: "array".to_string(), required: false, description: "Patterns to exclude".to_string() },
                    ],
                },
                BundleTool {
                    name: "directory_tree".to_string(),
                    description: "Get recursive JSON tree structure of directory contents".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "Starting directory".to_string() },
                        BundleToolParameter { name: "excludePatterns".to_string(), param_type: "array".to_string(), required: false, description: "Patterns to exclude (glob)".to_string() },
                    ],
                },
                BundleTool {
                    name: "get_file_info".to_string(),
                    description: "Get detailed file/directory metadata (size, timestamps, permissions)".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "File or directory path".to_string() },
                    ],
                },
                BundleTool {
                    name: "list_allowed_directories".to_string(),
                    description: "List all directories the server is allowed to access".to_string(),
                    parameters: vec![],
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

        // Git - Local repository operations
        McpBundle {
            id: "mcp-git".to_string(),
            name: "Git".to_string(),
            version: "0.6.2".to_string(),
            description: "Git repository operations — status, diff, commit, branch, log, and more. Read, search, and manipulate local Git repositories.".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "development".to_string(),
            icon_url: Some("https://git-scm.com/images/logos/downloads/Git-Icon-1788C.png".to_string()),
            npm_package: None,
            github_url: Some("https://github.com/modelcontextprotocol/servers/tree/main/src/git".to_string()),
            documentation_url: Some("https://modelcontextprotocol.io/docs/servers/git".to_string()),
            tools: vec![
                BundleTool {
                    name: "git_status".to_string(),
                    description: "Shows the working tree status".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "repo_path".to_string(), param_type: "string".to_string(), required: true, description: "Path to Git repository".to_string() },
                    ],
                },
                BundleTool {
                    name: "git_diff_unstaged".to_string(),
                    description: "Shows changes in working directory not yet staged".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "repo_path".to_string(), param_type: "string".to_string(), required: true, description: "Path to Git repository".to_string() },
                        BundleToolParameter { name: "context_lines".to_string(), param_type: "number".to_string(), required: false, description: "Number of context lines (default: 3)".to_string() },
                    ],
                },
                BundleTool {
                    name: "git_diff_staged".to_string(),
                    description: "Shows changes that are staged for commit".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "repo_path".to_string(), param_type: "string".to_string(), required: true, description: "Path to Git repository".to_string() },
                        BundleToolParameter { name: "context_lines".to_string(), param_type: "number".to_string(), required: false, description: "Number of context lines (default: 3)".to_string() },
                    ],
                },
                BundleTool {
                    name: "git_diff".to_string(),
                    description: "Shows differences between branches or commits".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "repo_path".to_string(), param_type: "string".to_string(), required: true, description: "Path to Git repository".to_string() },
                        BundleToolParameter { name: "target".to_string(), param_type: "string".to_string(), required: true, description: "Target branch or commit to compare with".to_string() },
                        BundleToolParameter { name: "context_lines".to_string(), param_type: "number".to_string(), required: false, description: "Number of context lines (default: 3)".to_string() },
                    ],
                },
                BundleTool {
                    name: "git_commit".to_string(),
                    description: "Records changes to the repository".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "repo_path".to_string(), param_type: "string".to_string(), required: true, description: "Path to Git repository".to_string() },
                        BundleToolParameter { name: "message".to_string(), param_type: "string".to_string(), required: true, description: "Commit message".to_string() },
                    ],
                },
                BundleTool {
                    name: "git_add".to_string(),
                    description: "Adds file contents to the staging area".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "repo_path".to_string(), param_type: "string".to_string(), required: true, description: "Path to Git repository".to_string() },
                        BundleToolParameter { name: "files".to_string(), param_type: "array".to_string(), required: true, description: "Array of file paths to stage".to_string() },
                    ],
                },
                BundleTool {
                    name: "git_reset".to_string(),
                    description: "Unstages all staged changes".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "repo_path".to_string(), param_type: "string".to_string(), required: true, description: "Path to Git repository".to_string() },
                    ],
                },
                BundleTool {
                    name: "git_log".to_string(),
                    description: "Shows commit logs with optional date filtering".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "repo_path".to_string(), param_type: "string".to_string(), required: true, description: "Path to Git repository".to_string() },
                        BundleToolParameter { name: "max_count".to_string(), param_type: "number".to_string(), required: false, description: "Maximum commits to show (default: 10)".to_string() },
                        BundleToolParameter { name: "start_timestamp".to_string(), param_type: "string".to_string(), required: false, description: "Start date filter (ISO 8601 or relative)".to_string() },
                        BundleToolParameter { name: "end_timestamp".to_string(), param_type: "string".to_string(), required: false, description: "End date filter (ISO 8601 or relative)".to_string() },
                    ],
                },
                BundleTool {
                    name: "git_create_branch".to_string(),
                    description: "Creates a new branch".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "repo_path".to_string(), param_type: "string".to_string(), required: true, description: "Path to Git repository".to_string() },
                        BundleToolParameter { name: "branch_name".to_string(), param_type: "string".to_string(), required: true, description: "Name of the new branch".to_string() },
                        BundleToolParameter { name: "base_branch".to_string(), param_type: "string".to_string(), required: false, description: "Base branch (defaults to current)".to_string() },
                    ],
                },
                BundleTool {
                    name: "git_checkout".to_string(),
                    description: "Switches branches".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "repo_path".to_string(), param_type: "string".to_string(), required: true, description: "Path to Git repository".to_string() },
                        BundleToolParameter { name: "branch_name".to_string(), param_type: "string".to_string(), required: true, description: "Branch to checkout".to_string() },
                    ],
                },
                BundleTool {
                    name: "git_show".to_string(),
                    description: "Shows the contents of a commit".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "repo_path".to_string(), param_type: "string".to_string(), required: true, description: "Path to Git repository".to_string() },
                        BundleToolParameter { name: "revision".to_string(), param_type: "string".to_string(), required: true, description: "Revision (commit hash, branch, tag)".to_string() },
                    ],
                },
                BundleTool {
                    name: "git_branch".to_string(),
                    description: "List Git branches (local, remote, or all)".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "repo_path".to_string(), param_type: "string".to_string(), required: true, description: "Path to Git repository".to_string() },
                        BundleToolParameter { name: "branch_type".to_string(), param_type: "string".to_string(), required: true, description: "local, remote, or all".to_string() },
                        BundleToolParameter { name: "contains".to_string(), param_type: "string".to_string(), required: false, description: "Filter branches containing this commit SHA".to_string() },
                        BundleToolParameter { name: "not_contains".to_string(), param_type: "string".to_string(), required: false, description: "Filter branches NOT containing this commit SHA".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "uvx".to_string(),
                args: vec!["mcp-server-git".to_string()],
                env: HashMap::new(),
            },
            required_credentials: vec![],
            rating: 4.8,
            downloads: 142000,
            verified: true,
            featured: true,
            tags: vec!["git".to_string(), "version-control".to_string(), "development".to_string(), "diff".to_string(), "commit".to_string()],
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
            github_url: Some("https://github.com/github/github-mcp-server".to_string()),
            documentation_url: Some("https://github.com/github/github-mcp-server#readme".to_string()),
            tools: vec![
                BundleTool {
                    name: "create_or_update_file".to_string(),
                    description: "Create or update a file in a repository".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "owner".to_string(), param_type: "string".to_string(), required: true, description: "Repository owner".to_string() },
                        BundleToolParameter { name: "repo".to_string(), param_type: "string".to_string(), required: true, description: "Repository name".to_string() },
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "File path".to_string() },
                        BundleToolParameter { name: "content".to_string(), param_type: "string".to_string(), required: true, description: "File content".to_string() },
                        BundleToolParameter { name: "message".to_string(), param_type: "string".to_string(), required: true, description: "Commit message".to_string() },
                        BundleToolParameter { name: "branch".to_string(), param_type: "string".to_string(), required: true, description: "Branch to commit to".to_string() },
                    ],
                },
                BundleTool {
                    name: "push_files".to_string(),
                    description: "Push multiple files in a single commit".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "owner".to_string(), param_type: "string".to_string(), required: true, description: "Repository owner".to_string() },
                        BundleToolParameter { name: "repo".to_string(), param_type: "string".to_string(), required: true, description: "Repository name".to_string() },
                        BundleToolParameter { name: "branch".to_string(), param_type: "string".to_string(), required: true, description: "Branch to push to".to_string() },
                        BundleToolParameter { name: "files".to_string(), param_type: "array".to_string(), required: true, description: "Array of {path, content} objects".to_string() },
                        BundleToolParameter { name: "message".to_string(), param_type: "string".to_string(), required: true, description: "Commit message".to_string() },
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
                        BundleToolParameter { name: "body".to_string(), param_type: "string".to_string(), required: false, description: "Issue body".to_string() },
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
                        BundleToolParameter { name: "body".to_string(), param_type: "string".to_string(), required: false, description: "PR body/description".to_string() },
                    ],
                },
                BundleTool {
                    name: "search_code".to_string(),
                    description: "Search for code across GitHub".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "query".to_string(), param_type: "string".to_string(), required: true, description: "Code search query".to_string() },
                    ],
                },
                BundleTool {
                    name: "get_file_contents".to_string(),
                    description: "Retrieve the contents of a file or directory from a repository".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "owner".to_string(), param_type: "string".to_string(), required: true, description: "Repository owner".to_string() },
                        BundleToolParameter { name: "repo".to_string(), param_type: "string".to_string(), required: true, description: "Repository name".to_string() },
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "File path".to_string() },
                        BundleToolParameter { name: "branch".to_string(), param_type: "string".to_string(), required: false, description: "Branch (optional)".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@github/github-mcp-server".to_string()],
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
            github_url: Some("https://github.com/modelcontextprotocol/server-slack".to_string()),
            documentation_url: Some("https://github.com/modelcontextprotocol/server-slack#readme".to_string()),
            tools: vec![
                BundleTool {
                    name: "slack_list_channels".to_string(),
                    description: "List available Slack channels".to_string(),
                    parameters: vec![],
                },
                BundleTool {
                    name: "slack_post_message".to_string(),
                    description: "Post a new message to a Slack channel".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "channel".to_string(), param_type: "string".to_string(), required: true, description: "Channel ID or name".to_string() },
                        BundleToolParameter { name: "text".to_string(), param_type: "string".to_string(), required: true, description: "Message text".to_string() },
                    ],
                },
                BundleTool {
                    name: "slack_reply_to_thread".to_string(),
                    description: "Reply to a specific message thread".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "channel".to_string(), param_type: "string".to_string(), required: true, description: "Channel ID".to_string() },
                        BundleToolParameter { name: "thread_ts".to_string(), param_type: "string".to_string(), required: true, description: "Thread timestamp".to_string() },
                        BundleToolParameter { name: "text".to_string(), param_type: "string".to_string(), required: true, description: "Reply text".to_string() },
                    ],
                },
                BundleTool {
                    name: "slack_add_reaction".to_string(),
                    description: "Add an emoji reaction to a message".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "channel".to_string(), param_type: "string".to_string(), required: true, description: "Channel ID".to_string() },
                        BundleToolParameter { name: "timestamp".to_string(), param_type: "string".to_string(), required: true, description: "Message timestamp".to_string() },
                        BundleToolParameter { name: "name".to_string(), param_type: "string".to_string(), required: true, description: "Emoji name (without colons)".to_string() },
                    ],
                },
                BundleTool {
                    name: "slack_get_channel_history".to_string(),
                    description: "Get recent messages from a channel".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "channel".to_string(), param_type: "string".to_string(), required: true, description: "Channel ID".to_string() },
                        BundleToolParameter { name: "limit".to_string(), param_type: "number".to_string(), required: false, description: "Number of messages to retrieve".to_string() },
                    ],
                },
                BundleTool {
                    name: "slack_get_thread_replies".to_string(),
                    description: "Get all replies in a message thread".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "channel".to_string(), param_type: "string".to_string(), required: true, description: "Channel ID".to_string() },
                        BundleToolParameter { name: "thread_ts".to_string(), param_type: "string".to_string(), required: true, description: "Thread timestamp".to_string() },
                    ],
                },
                BundleTool {
                    name: "slack_get_users".to_string(),
                    description: "Get a list of workspace users".to_string(),
                    parameters: vec![],
                },
                BundleTool {
                    name: "slack_get_user_profile".to_string(),
                    description: "Get detailed profile information for a user".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "user".to_string(), param_type: "string".to_string(), required: true, description: "User ID".to_string() },
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
            npm_package: Some("@henkey/postgres-mcp-server".to_string()),
            github_url: Some("https://github.com/modelcontextprotocol/server-postgres".to_string()),
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
                args: vec!["-y".to_string(), "@henkey/postgres-mcp-server".to_string()],
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
                    description: "Create multiple new entities in the knowledge graph".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "entities".to_string(), param_type: "array".to_string(), required: true, description: "Array of {name, entityType, observations} objects".to_string() },
                    ],
                },
                BundleTool {
                    name: "create_relations".to_string(),
                    description: "Create multiple new relations between entities".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "relations".to_string(), param_type: "array".to_string(), required: true, description: "Array of {from, to, relationType} objects".to_string() },
                    ],
                },
                BundleTool {
                    name: "add_observations".to_string(),
                    description: "Add new observations to existing entities".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "observations".to_string(), param_type: "array".to_string(), required: true, description: "Array of {entityName, contents} objects".to_string() },
                    ],
                },
                BundleTool {
                    name: "delete_entities".to_string(),
                    description: "Remove entities and their associated relations".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "entityNames".to_string(), param_type: "array".to_string(), required: true, description: "Array of entity names to delete".to_string() },
                    ],
                },
                BundleTool {
                    name: "delete_observations".to_string(),
                    description: "Remove specific observations from entities".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "deletions".to_string(), param_type: "array".to_string(), required: true, description: "Array of {entityName, observations} objects".to_string() },
                    ],
                },
                BundleTool {
                    name: "delete_relations".to_string(),
                    description: "Remove specific relations from the graph".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "relations".to_string(), param_type: "array".to_string(), required: true, description: "Array of {from, to, relationType} objects".to_string() },
                    ],
                },
                BundleTool {
                    name: "read_graph".to_string(),
                    description: "Read the entire knowledge graph".to_string(),
                    parameters: vec![],
                },
                BundleTool {
                    name: "search_nodes".to_string(),
                    description: "Search for nodes by name, type, or observation content".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "query".to_string(), param_type: "string".to_string(), required: true, description: "Search query".to_string() },
                    ],
                },
                BundleTool {
                    name: "open_nodes".to_string(),
                    description: "Retrieve specific nodes by name with their relations".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "names".to_string(), param_type: "array".to_string(), required: true, description: "Array of entity names to retrieve".to_string() },
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
                    name: "puppeteer_hover".to_string(),
                    description: "Hover over an element on the page".to_string(),
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
                BundleTool {
                    name: "puppeteer_select".to_string(),
                    description: "Select an option from a dropdown".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "selector".to_string(), param_type: "string".to_string(), required: true, description: "CSS selector".to_string() },
                        BundleToolParameter { name: "value".to_string(), param_type: "string".to_string(), required: true, description: "Value to select".to_string() },
                    ],
                },
                BundleTool {
                    name: "puppeteer_evaluate".to_string(),
                    description: "Evaluate JavaScript on the page".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "script".to_string(), param_type: "string".to_string(), required: true, description: "JavaScript code to evaluate".to_string() },
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
                    description: "Fetch a URL and extract its contents as markdown".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "url".to_string(), param_type: "string".to_string(), required: true, description: "URL to fetch".to_string() },
                        BundleToolParameter { name: "max_length".to_string(), param_type: "number".to_string(), required: false, description: "Maximum number of characters to return (default: 5000)".to_string() },
                        BundleToolParameter { name: "start_index".to_string(), param_type: "number".to_string(), required: false, description: "Start content from this character index (default: 0)".to_string() },
                        BundleToolParameter { name: "raw".to_string(), param_type: "boolean".to_string(), required: false, description: "Get raw content without markdown conversion (default: false)".to_string() },
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
                    name: "sequential_thinking".to_string(),
                    description: "Facilitate step-by-step thinking for problem-solving and analysis".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "thought".to_string(), param_type: "string".to_string(), required: true, description: "The current thinking step".to_string() },
                        BundleToolParameter { name: "nextThoughtNeeded".to_string(), param_type: "boolean".to_string(), required: true, description: "Whether another thought step is needed".to_string() },
                        BundleToolParameter { name: "thoughtNumber".to_string(), param_type: "number".to_string(), required: true, description: "Current thought number".to_string() },
                        BundleToolParameter { name: "totalThoughts".to_string(), param_type: "number".to_string(), required: true, description: "Estimated total thoughts needed".to_string() },
                        BundleToolParameter { name: "isRevision".to_string(), param_type: "boolean".to_string(), required: false, description: "Whether this revises previous thinking".to_string() },
                        BundleToolParameter { name: "revisesThought".to_string(), param_type: "number".to_string(), required: false, description: "Which thought is being reconsidered".to_string() },
                        BundleToolParameter { name: "branchFromThought".to_string(), param_type: "number".to_string(), required: false, description: "Branching point thought number".to_string() },
                        BundleToolParameter { name: "branchId".to_string(), param_type: "string".to_string(), required: false, description: "Branch identifier".to_string() },
                        BundleToolParameter { name: "needsMoreThoughts".to_string(), param_type: "boolean".to_string(), required: false, description: "If more thoughts are needed beyond estimate".to_string() },
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
            npm_package: Some("@notionhq/notion-mcp-server".to_string()),
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
                args: vec!["-y".to_string(), "@notionhq/notion-mcp-server".to_string()],
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
            npm_package: Some("@larryhudson/linear-mcp-server".to_string()),
            github_url: Some("https://github.com/larryhudson/linear-mcp-server".to_string()),
            documentation_url: Some("https://github.com/larryhudson/linear-mcp-server#readme".to_string()),
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
                BundleTool {
                    name: "linear_get_issue".to_string(),
                    description: "Get details of a specific issue".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "issue_id".to_string(), param_type: "string".to_string(), required: true, description: "Issue ID".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@larryhudson/linear-mcp-server".to_string()],
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
            npm_package: Some("@stripe/mcp".to_string()),
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
                args: vec!["-y".to_string(), "@stripe/mcp".to_string()],
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
            npm_package: Some("@cloudflare/mcp-server-cloudflare".to_string()),
            github_url: Some("https://github.com/cloudflare/mcp-server-cloudflare".to_string()),
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
                args: vec!["-y".to_string(), "@cloudflare/mcp-server-cloudflare".to_string()],
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

        // Desktop Commander
        McpBundle {
            id: "mcp-desktop-commander".to_string(),
            name: "Desktop Commander".to_string(),
            version: "0.2.0".to_string(),
            description: "Terminal control, file system operations, process management, and diff-based code editing. Supports interactive sessions (SSH, REPL), PDF/Excel read/write, and ripgrep-powered search.".to_string(),
            author: "wonderwhy-er".to_string(),
            category: "automation".to_string(),
            icon_url: Some("https://raw.githubusercontent.com/wonderwhy-er/DesktopCommanderMCP/main/assets/icon.png".to_string()),
            npm_package: Some("desktop-commander".to_string()),
            github_url: Some("https://github.com/wonderwhy-er/DesktopCommanderMCP".to_string()),
            documentation_url: Some("https://github.com/wonderwhy-er/DesktopCommanderMCP#readme".to_string()),
            tools: vec![
                BundleTool {
                    name: "start_process".to_string(),
                    description: "Start a terminal process with interactive session support".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "command".to_string(), param_type: "string".to_string(), required: true, description: "Command to execute".to_string() },
                    ],
                },
                BundleTool {
                    name: "read_file".to_string(),
                    description: "Read file contents with offset and length support".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "File path to read".to_string() },
                    ],
                },
                BundleTool {
                    name: "write_file".to_string(),
                    description: "Write content to a file".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "File path".to_string() },
                        BundleToolParameter { name: "content".to_string(), param_type: "string".to_string(), required: true, description: "Content to write".to_string() },
                    ],
                },
                BundleTool {
                    name: "edit_block".to_string(),
                    description: "Surgical search/replace with fuzzy matching and diff output".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "file_path".to_string(), param_type: "string".to_string(), required: true, description: "File to edit".to_string() },
                        BundleToolParameter { name: "search".to_string(), param_type: "string".to_string(), required: true, description: "Text to find".to_string() },
                        BundleToolParameter { name: "replace".to_string(), param_type: "string".to_string(), required: true, description: "Replacement text".to_string() },
                    ],
                },
                BundleTool {
                    name: "list_processes".to_string(),
                    description: "List running system processes".to_string(),
                    parameters: vec![],
                },
                BundleTool {
                    name: "kill_process".to_string(),
                    description: "Kill a system process by PID".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "pid".to_string(), param_type: "number".to_string(), required: true, description: "Process ID".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "desktop-commander".to_string()],
                env: HashMap::new(),
            },
            required_credentials: vec![],
            rating: 4.8,
            downloads: 156000,
            verified: false,
            featured: true,
            tags: vec!["terminal".to_string(), "process".to_string(), "file-system".to_string(), "code-editing".to_string(), "automation".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Time
        McpBundle {
            id: "mcp-time".to_string(),
            name: "Time".to_string(),
            version: "0.6.2".to_string(),
            description: "Get current time, convert between timezones, and perform date/time calculations.".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "productivity".to_string(),
            icon_url: Some("https://raw.githubusercontent.com/modelcontextprotocol/servers/main/assets/time.svg".to_string()),
            npm_package: Some("@modelcontextprotocol/server-time".to_string()),
            github_url: Some("https://github.com/modelcontextprotocol/servers/tree/main/src/time".to_string()),
            documentation_url: Some("https://modelcontextprotocol.io/docs/servers/time".to_string()),
            tools: vec![
                BundleTool {
                    name: "get_current_time".to_string(),
                    description: "Get the current time in a specific timezone".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "timezone".to_string(), param_type: "string".to_string(), required: true, description: "IANA timezone name (e.g. America/New_York)".to_string() },
                    ],
                },
                BundleTool {
                    name: "convert_time".to_string(),
                    description: "Convert time between timezones".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "source_timezone".to_string(), param_type: "string".to_string(), required: true, description: "Source IANA timezone name".to_string() },
                        BundleToolParameter { name: "time".to_string(), param_type: "string".to_string(), required: true, description: "Time in 24-hour format (HH:MM)".to_string() },
                        BundleToolParameter { name: "target_timezone".to_string(), param_type: "string".to_string(), required: true, description: "Target IANA timezone name".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@modelcontextprotocol/server-time".to_string()],
                env: HashMap::new(),
            },
            required_credentials: vec![],
            rating: 4.1,
            downloads: 18000,
            verified: true,
            featured: false,
            tags: vec!["time".to_string(), "timezone".to_string(), "date".to_string(), "utility".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Apidog - API Specification Integration
        McpBundle {
            id: "mcp-apidog".to_string(),
            name: "Apidog".to_string(),
            version: "1.0.0".to_string(),
            description: "Connect AI to your API specifications. Generate DTOs, controllers, and client code from OpenAPI/Swagger docs. Supports Apidog projects, online docs, and local spec files.".to_string(),
            author: "Apidog".to_string(),
            category: "development".to_string(),
            icon_url: Some("https://assets.apidog.com/app/project-icon/custom/20230512/24e0cf63-bf05-4e3e-ae1c-e43deb490b49.png".to_string()),
            npm_package: Some("apidog-mcp-server".to_string()),
            github_url: Some("https://github.com/nicepkg/apidog-mcp-server".to_string()),
            documentation_url: Some("https://docs.apidog.com/mcp".to_string()),
            tools: vec![
                BundleTool {
                    name: "list_api_endpoints".to_string(),
                    description: "List all API endpoints from the specification".to_string(),
                    parameters: vec![],
                },
                BundleTool {
                    name: "get_api_endpoint".to_string(),
                    description: "Get details of a specific API endpoint".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "endpoint".to_string(), param_type: "string".to_string(), required: true, description: "Endpoint path (e.g. /api/users)".to_string() },
                        BundleToolParameter { name: "method".to_string(), param_type: "string".to_string(), required: false, description: "HTTP method (GET, POST, etc.)".to_string() },
                    ],
                },
                BundleTool {
                    name: "search_api".to_string(),
                    description: "Search API specifications by keyword".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "query".to_string(), param_type: "string".to_string(), required: true, description: "Search query".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "apidog-mcp-server@latest".to_string(), "--oas=<spec-path-or-url>".to_string()],
                env: HashMap::new(),
            },
            required_credentials: vec![],
            rating: 4.6,
            downloads: 89000,
            verified: false,
            featured: true,
            tags: vec!["api".to_string(), "openapi".to_string(), "swagger".to_string(), "code-generation".to_string(), "development".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Figma - Design to Code
        McpBundle {
            id: "mcp-figma".to_string(),
            name: "Figma".to_string(),
            version: "1.0.0".to_string(),
            description: "Bridge design and code. Convert Figma layouts to UI components, inspect design tokens, and align development with design specs.".to_string(),
            author: "Community".to_string(),
            category: "design".to_string(),
            icon_url: Some("https://cdn.sanity.io/images/599r6htc/regionalized/f07b8be25c5e19990cb1cfbdeb3ebe6ee93bb3f5-1080x1080.svg".to_string()),
            npm_package: Some("@sethdouglasford/mcp-figma".to_string()),
            github_url: Some("https://github.com/sethdouglasford/mcp-figma".to_string()),
            documentation_url: Some("https://github.com/sethdouglasford/mcp-figma#readme".to_string()),
            tools: vec![
                BundleTool {
                    name: "figma_get_file".to_string(),
                    description: "Get a Figma file's structure and contents".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "file_key".to_string(), param_type: "string".to_string(), required: true, description: "Figma file key from URL".to_string() },
                    ],
                },
                BundleTool {
                    name: "figma_get_node".to_string(),
                    description: "Get a specific node's properties and children".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "file_key".to_string(), param_type: "string".to_string(), required: true, description: "Figma file key".to_string() },
                        BundleToolParameter { name: "node_id".to_string(), param_type: "string".to_string(), required: true, description: "Node ID".to_string() },
                    ],
                },
                BundleTool {
                    name: "figma_get_styles".to_string(),
                    description: "Get design tokens (colors, typography, spacing) from a file".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "file_key".to_string(), param_type: "string".to_string(), required: true, description: "Figma file key".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@sethdouglasford/mcp-figma".to_string()],
                env: {
                    let mut env = HashMap::new();
                    env.insert("FIGMA_ACCESS_TOKEN".to_string(), "<from_credential_manager>".to_string());
                    env
                },
            },
            required_credentials: vec![
                RequiredCredential {
                    env_var: "FIGMA_ACCESS_TOKEN".to_string(),
                    display_name: "Figma Access Token".to_string(),
                    description: "Personal access token from Figma settings.".to_string(),
                    help_url: Some("https://www.figma.com/developers/api#access-tokens".to_string()),
                    required: true,
                },
            ],
            rating: 4.5,
            downloads: 42000,
            verified: false,
            featured: true,
            tags: vec!["figma".to_string(), "design".to_string(), "ui".to_string(), "components".to_string(), "prototyping".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Zapier - Cross-App Automation
        McpBundle {
            id: "mcp-zapier".to_string(),
            name: "Zapier".to_string(),
            version: "1.0.0".to_string(),
            description: "Cross-app automation via Zapier. Trigger actions in Slack, Gmail, Trello, and hundreds of other services from AI prompts.".to_string(),
            author: "Composio".to_string(),
            category: "automation".to_string(),
            icon_url: Some("https://cdn.zapier.com/ssr/15fde625cfb111391887504ad54e7de0/favicon.ico".to_string()),
            npm_package: Some("@composio/mcp".to_string()),
            github_url: Some("https://github.com/composiohq/composio".to_string()),
            documentation_url: Some("https://docs.composio.dev/".to_string()),
            tools: vec![
                BundleTool {
                    name: "zapier_trigger".to_string(),
                    description: "Trigger a Zapier action or workflow".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "action".to_string(), param_type: "string".to_string(), required: true, description: "Action to trigger".to_string() },
                        BundleToolParameter { name: "params".to_string(), param_type: "object".to_string(), required: false, description: "Action parameters".to_string() },
                    ],
                },
                BundleTool {
                    name: "zapier_list_actions".to_string(),
                    description: "List available Zapier actions and integrations".to_string(),
                    parameters: vec![],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@composio/mcp@latest".to_string(), "setup".to_string(), "zapier".to_string()],
                env: {
                    let mut env = HashMap::new();
                    env.insert("COMPOSIO_API_KEY".to_string(), "<from_credential_manager>".to_string());
                    env
                },
            },
            required_credentials: vec![
                RequiredCredential {
                    env_var: "COMPOSIO_API_KEY".to_string(),
                    display_name: "Composio API Key".to_string(),
                    description: "API key from Composio dashboard for Zapier integration.".to_string(),
                    help_url: Some("https://app.composio.dev/settings".to_string()),
                    required: true,
                },
            ],
            rating: 4.4,
            downloads: 31000,
            verified: false,
            featured: false,
            tags: vec!["zapier".to_string(), "automation".to_string(), "workflow".to_string(), "integration".to_string(), "no-code".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Playwright - Browser automation by Microsoft
        McpBundle {
            id: "mcp-playwright".to_string(),
            name: "Playwright".to_string(),
            version: "0.0.22".to_string(),
            description: "Browser automation using Playwright by Microsoft. Interact with web pages through structured accessibility snapshots — click, type, navigate, screenshot, and run Playwright code.".to_string(),
            author: "Microsoft".to_string(),
            category: "automation".to_string(),
            icon_url: Some("https://playwright.dev/img/playwright-logo.svg".to_string()),
            npm_package: Some("@playwright/mcp".to_string()),
            github_url: Some("https://github.com/microsoft/playwright-mcp".to_string()),
            documentation_url: Some("https://github.com/microsoft/playwright-mcp#readme".to_string()),
            tools: vec![
                BundleTool {
                    name: "browser_navigate".to_string(),
                    description: "Navigate to a URL".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "url".to_string(), param_type: "string".to_string(), required: true, description: "The URL to navigate to".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_navigate_back".to_string(),
                    description: "Go back to the previous page in history".to_string(),
                    parameters: vec![],
                },
                BundleTool {
                    name: "browser_snapshot".to_string(),
                    description: "Capture accessibility snapshot of the current page".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "filename".to_string(), param_type: "string".to_string(), required: false, description: "Save snapshot to file".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_click".to_string(),
                    description: "Perform click on a web page element".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "element".to_string(), param_type: "string".to_string(), required: false, description: "Human-readable element description".to_string() },
                        BundleToolParameter { name: "ref".to_string(), param_type: "string".to_string(), required: true, description: "Target element reference from page snapshot".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_type".to_string(),
                    description: "Type text into editable element".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "ref".to_string(), param_type: "string".to_string(), required: true, description: "Target element reference".to_string() },
                        BundleToolParameter { name: "text".to_string(), param_type: "string".to_string(), required: true, description: "Text to type".to_string() },
                        BundleToolParameter { name: "submit".to_string(), param_type: "boolean".to_string(), required: false, description: "Press Enter after typing".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_fill_form".to_string(),
                    description: "Fill multiple form fields at once".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "fields".to_string(), param_type: "array".to_string(), required: true, description: "Fields to fill in".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_select_option".to_string(),
                    description: "Select an option in a dropdown".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "ref".to_string(), param_type: "string".to_string(), required: true, description: "Target element reference".to_string() },
                        BundleToolParameter { name: "values".to_string(), param_type: "array".to_string(), required: true, description: "Values to select".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_hover".to_string(),
                    description: "Hover over element on page".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "ref".to_string(), param_type: "string".to_string(), required: true, description: "Target element reference".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_drag".to_string(),
                    description: "Drag and drop between two elements".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "startRef".to_string(), param_type: "string".to_string(), required: true, description: "Source element reference".to_string() },
                        BundleToolParameter { name: "endRef".to_string(), param_type: "string".to_string(), required: true, description: "Target element reference".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_press_key".to_string(),
                    description: "Press a key on the keyboard".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "key".to_string(), param_type: "string".to_string(), required: true, description: "Key name (e.g. ArrowLeft, Enter)".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_take_screenshot".to_string(),
                    description: "Take a screenshot of the current page".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "filename".to_string(), param_type: "string".to_string(), required: false, description: "File to save screenshot to".to_string() },
                        BundleToolParameter { name: "fullPage".to_string(), param_type: "boolean".to_string(), required: false, description: "Capture full scrollable page".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_evaluate".to_string(),
                    description: "Evaluate JavaScript expression on page".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "function".to_string(), param_type: "string".to_string(), required: true, description: "JavaScript function to execute".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_run_code".to_string(),
                    description: "Run a Playwright code snippet".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "code".to_string(), param_type: "string".to_string(), required: true, description: "Playwright code function to execute".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_file_upload".to_string(),
                    description: "Upload one or multiple files".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "paths".to_string(), param_type: "array".to_string(), required: false, description: "Absolute paths to files to upload".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_handle_dialog".to_string(),
                    description: "Handle a browser dialog (alert, confirm, prompt)".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "accept".to_string(), param_type: "boolean".to_string(), required: true, description: "Whether to accept the dialog".to_string() },
                        BundleToolParameter { name: "promptText".to_string(), param_type: "string".to_string(), required: false, description: "Text for prompt dialogs".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_console_messages".to_string(),
                    description: "Returns all console messages".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "level".to_string(), param_type: "string".to_string(), required: false, description: "Console level filter (info, warn, error)".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_network_requests".to_string(),
                    description: "Returns all network requests since page load".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "includeStatic".to_string(), param_type: "boolean".to_string(), required: false, description: "Include static resources".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_resize".to_string(),
                    description: "Resize the browser window".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "width".to_string(), param_type: "number".to_string(), required: true, description: "Window width".to_string() },
                        BundleToolParameter { name: "height".to_string(), param_type: "number".to_string(), required: true, description: "Window height".to_string() },
                    ],
                },
                BundleTool {
                    name: "browser_close".to_string(),
                    description: "Close the browser page".to_string(),
                    parameters: vec![],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@playwright/mcp@latest".to_string()],
                env: HashMap::new(),
            },
            required_credentials: vec![],
            rating: 4.9,
            downloads: 280000,
            verified: true,
            featured: true,
            tags: vec!["browser".to_string(), "playwright".to_string(), "testing".to_string(), "automation".to_string(), "microsoft".to_string(), "e2e".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Vercel - Deployment Management
        McpBundle {
            id: "mcp-vercel".to_string(),
            name: "Vercel".to_string(),
            version: "1.0.0".to_string(),
            description: "Manage Vercel deployments, projects, environments, and teams. Monitor deployments, configure environment variables, and deploy from Git.".to_string(),
            author: "nganiet".to_string(),
            category: "deployment".to_string(),
            icon_url: Some("https://vercel.com/favicon.ico".to_string()),
            npm_package: Some("mcp-vercel".to_string()),
            github_url: Some("https://github.com/nganiet/mcp-vercel".to_string()),
            documentation_url: Some("https://github.com/nganiet/mcp-vercel#readme".to_string()),
            tools: vec![
                BundleTool {
                    name: "vercel-list-all-deployments".to_string(),
                    description: "List deployments with filtering".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "projectId".to_string(), param_type: "string".to_string(), required: false, description: "Filter by project ID".to_string() },
                        BundleToolParameter { name: "limit".to_string(), param_type: "number".to_string(), required: false, description: "Max results".to_string() },
                    ],
                },
                BundleTool {
                    name: "vercel-get-deployment".to_string(),
                    description: "Retrieve specific deployment details".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "deploymentId".to_string(), param_type: "string".to_string(), required: true, description: "Deployment ID".to_string() },
                    ],
                },
                BundleTool {
                    name: "vercel-list-deployment-files".to_string(),
                    description: "List files in a deployment".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "deploymentId".to_string(), param_type: "string".to_string(), required: true, description: "Deployment ID".to_string() },
                    ],
                },
                BundleTool {
                    name: "vercel-create-deployment".to_string(),
                    description: "Create a new deployment".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "name".to_string(), param_type: "string".to_string(), required: true, description: "Project name".to_string() },
                    ],
                },
                BundleTool {
                    name: "vercel-create-project".to_string(),
                    description: "Create a new Vercel project".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "name".to_string(), param_type: "string".to_string(), required: true, description: "Project name".to_string() },
                    ],
                },
                BundleTool {
                    name: "vercel-list-projects".to_string(),
                    description: "List all projects with pagination".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "limit".to_string(), param_type: "number".to_string(), required: false, description: "Max results".to_string() },
                    ],
                },
                BundleTool {
                    name: "vercel-find-project".to_string(),
                    description: "Find a specific project by ID or name".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "idOrName".to_string(), param_type: "string".to_string(), required: true, description: "Project ID or name".to_string() },
                    ],
                },
                BundleTool {
                    name: "vercel-create-environment-variables".to_string(),
                    description: "Create environment variables for a project".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "projectId".to_string(), param_type: "string".to_string(), required: true, description: "Project ID".to_string() },
                    ],
                },
                BundleTool {
                    name: "vercel-get-project-domain".to_string(),
                    description: "Get domain info for a project".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "projectId".to_string(), param_type: "string".to_string(), required: true, description: "Project ID".to_string() },
                        BundleToolParameter { name: "domain".to_string(), param_type: "string".to_string(), required: true, description: "Domain name".to_string() },
                    ],
                },
                BundleTool {
                    name: "vercel-get-environments".to_string(),
                    description: "Access project environment variables".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "projectId".to_string(), param_type: "string".to_string(), required: true, description: "Project ID".to_string() },
                    ],
                },
                BundleTool {
                    name: "vercel-create-custom-environment".to_string(),
                    description: "Create custom environments for projects".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "projectId".to_string(), param_type: "string".to_string(), required: true, description: "Project ID".to_string() },
                    ],
                },
                BundleTool {
                    name: "vercel-list-all-teams".to_string(),
                    description: "List all accessible teams".to_string(),
                    parameters: vec![],
                },
                BundleTool {
                    name: "vercel-create-team".to_string(),
                    description: "Create a new team".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "slug".to_string(), param_type: "string".to_string(), required: true, description: "Team slug".to_string() },
                        BundleToolParameter { name: "name".to_string(), param_type: "string".to_string(), required: false, description: "Team display name".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "mcp-vercel".to_string()],
                env: {
                    let mut env = HashMap::new();
                    env.insert("VERCEL_API_TOKEN".to_string(), "<from_credential_manager>".to_string());
                    env
                },
            },
            required_credentials: vec![
                RequiredCredential {
                    env_var: "VERCEL_API_TOKEN".to_string(),
                    display_name: "Vercel API Token".to_string(),
                    description: "API token from Vercel dashboard for deployment management.".to_string(),
                    help_url: Some("https://vercel.com/account/tokens".to_string()),
                    required: true,
                },
            ],
            rating: 4.5,
            downloads: 18000,
            verified: false,
            featured: false,
            tags: vec!["vercel".to_string(), "deployment".to_string(), "hosting".to_string(), "devops".to_string(), "ci-cd".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // Shadcn UI - Component Library
        McpBundle {
            id: "mcp-shadcn-ui".to_string(),
            name: "Shadcn UI".to_string(),
            version: "1.0.0".to_string(),
            description: "Access and manage shadcn/ui components. List, inspect documentation, and install components and blocks with support for npm, pnpm, yarn, and bun.".to_string(),
            author: "heilgar".to_string(),
            category: "design".to_string(),
            icon_url: Some("https://ui.shadcn.com/favicon.ico".to_string()),
            npm_package: Some("@heilgar/shadcn-ui-mcp-server".to_string()),
            github_url: Some("https://github.com/heilgar/shadcn-ui-mcp-server".to_string()),
            documentation_url: Some("https://github.com/heilgar/shadcn-ui-mcp-server#readme".to_string()),
            tools: vec![
                BundleTool {
                    name: "list-components".to_string(),
                    description: "Get the list of available shadcn/ui components".to_string(),
                    parameters: vec![],
                },
                BundleTool {
                    name: "get-component-docs".to_string(),
                    description: "Get documentation for a specific component".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "component".to_string(), param_type: "string".to_string(), required: true, description: "Component name".to_string() },
                    ],
                },
                BundleTool {
                    name: "install-component".to_string(),
                    description: "Install a shadcn/ui component".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "component".to_string(), param_type: "string".to_string(), required: true, description: "Component name to install".to_string() },
                    ],
                },
                BundleTool {
                    name: "list-blocks".to_string(),
                    description: "Get the list of available shadcn/ui blocks".to_string(),
                    parameters: vec![],
                },
                BundleTool {
                    name: "get-block-docs".to_string(),
                    description: "Get documentation for a specific block".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "block".to_string(), param_type: "string".to_string(), required: true, description: "Block name".to_string() },
                    ],
                },
                BundleTool {
                    name: "install-blocks".to_string(),
                    description: "Install a shadcn/ui block".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "block".to_string(), param_type: "string".to_string(), required: true, description: "Block name to install".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@heilgar/shadcn-ui-mcp-server".to_string()],
                env: HashMap::new(),
            },
            required_credentials: vec![],
            rating: 4.6,
            downloads: 42000,
            verified: false,
            featured: false,
            tags: vec!["shadcn".to_string(), "ui".to_string(), "components".to_string(), "design-system".to_string(), "react".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },

        // CodeMCP - Pair Programming
        McpBundle {
            id: "mcp-codemcp".to_string(),
            name: "CodeMCP".to_string(),
            version: "0.1.0".to_string(),
            description: "Deep pair-programming assistant. Directly edit files, fix bugs, refactor code, and run tests on your local codebase with Git-versioned edits and restricted shell access.".to_string(),
            author: "ezyang".to_string(),
            category: "development".to_string(),
            icon_url: None,
            npm_package: None,
            github_url: Some("https://github.com/ezyang/codemcp".to_string()),
            documentation_url: Some("https://github.com/ezyang/codemcp#readme".to_string()),
            tools: vec![
                BundleTool {
                    name: "codemcp".to_string(),
                    description: "Initialize a coding session — edit files, run tests, and apply refactors with Git-versioned changes".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "chat_id".to_string(), param_type: "string".to_string(), required: true, description: "Session identifier".to_string() },
                        BundleToolParameter { name: "subcmd".to_string(), param_type: "string".to_string(), required: true, description: "Subcommand: InitProject, ReadFile, WriteFile, EditFile, RunCommand".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "uvx".to_string(),
                args: vec!["codemcp".to_string()],
                env: HashMap::new(),
            },
            required_credentials: vec![],
            rating: 4.5,
            downloads: 28000,
            verified: false,
            featured: false,
            tags: vec!["coding".to_string(), "pair-programming".to_string(), "refactoring".to_string(), "git".to_string(), "testing".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },
    ]
}

// ============================================================================
// Remote Registry API
// ============================================================================

/// Fetch bundles from the remote MCP registry API.
///
/// Uses a timeout and returns an error if the API is unavailable.
async fn fetch_remote_registry() -> Result<Vec<McpBundle>, String> {
    use std::time::Duration;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get("https://registry.mcpservers.io/api/v1/bundles")
        .header("Accept", "application/json")
        .header("User-Agent", "AGIWorkforce/1.0")
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API returned status: {}", response.status()));
    }

    // Try to parse as our McpBundle format
    let bundles: Vec<McpBundle> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse registry response: {}", e))?;

    Ok(bundles)
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Fetch the bundle registry.
///
/// Tries to fetch from the remote API first, falls back to embedded data.
/// Cache results with a 1-hour TTL to avoid excessive API calls.
#[tauri::command]
pub async fn mcpb_fetch_registry(state: State<'_, McpbState>) -> Result<Vec<McpBundle>, String> {
    tracing::info!("Fetching MCPB registry");

    // Try to fetch from remote API
    let mut bundles = match fetch_remote_registry().await {
        Ok(remote_bundles) => {
            tracing::info!(
                "Fetched {} bundles from remote registry",
                remote_bundles.len()
            );
            // Merge with embedded registry to ensure we have all bundles
            let mut combined = get_embedded_registry();
            for bundle in remote_bundles {
                if !combined.iter().any(|b| b.id == bundle.id) {
                    combined.push(bundle);
                }
            }
            combined
        }
        Err(e) => {
            tracing::warn!(
                "Failed to fetch remote registry, using embedded data: {}",
                e
            );
            get_embedded_registry()
        }
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
        enabled: false,  // Start disabled so user can configure credentials
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
    mcp_state.persist_config_snapshot(&config_clone).await?;

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
    mcp_state.persist_config_snapshot(&config_clone).await?;

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
    mcp_state.persist_config_snapshot(&config_clone).await?;

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
