use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Configuration for a single MCP server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    /// Command to run the server (e.g., "npx", "python", "node")
    pub command: String,
    
    /// Arguments to pass to the command
    pub args: Vec<String>,
    
    /// Environment variables for the server
    #[serde(default)]
    pub env: HashMap<String, String>,
    
    /// Whether the server is enabled
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

/// Configuration for all MCP servers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServersConfig {
    #[serde(rename = "mcpServers")]
    pub mcp_servers: HashMap<String, McpServerConfig>,
}

impl McpServersConfig {
    /// Load configuration from a JSON file
    pub async fn from_file(path: &PathBuf) -> crate::mcp::McpResult<Self> {
        let contents = tokio::fs::read_to_string(path).await?;
        let config: Self = serde_json::from_str(&contents)?;
        Ok(config)
    }

    /// Load configuration from JSON string
    pub fn from_json(json: &str) -> crate::mcp::McpResult<Self> {
        let config: Self = serde_json::from_str(json)?;
        Ok(config)
    }

    /// Save configuration to a JSON file
    pub async fn save_to_file(&self, path: &PathBuf) -> crate::mcp::McpResult<()> {
        let json = serde_json::to_string_pretty(self)?;
        tokio::fs::write(path, json).await?;
        Ok(())
    }

    /// Get the default configuration path
    pub fn default_config_path() -> PathBuf {
        let app_data = dirs::data_dir().expect("Failed to get app data directory");
        app_data
            .join("agiworkforce")
            .join("mcp-servers-config.json")
    }

    /// Create a default configuration
    pub fn default() -> Self {
        let mut mcp_servers = HashMap::new();

        // Filesystem server (official MCP server)
        mcp_servers.insert(
            "filesystem".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-filesystem".to_string(),
                    ".".to_string(), // Current directory
                ],
                env: HashMap::new(),
                enabled: true,
            },
        );

        // GitHub server (official MCP server)
        mcp_servers.insert(
            "github".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-github".to_string(),
                ],
                env: {
                    let mut env = HashMap::new();
                    env.insert(
                        "GITHUB_PERSONAL_ACCESS_TOKEN".to_string(),
                        "<from_credential_manager>".to_string(),
                    );
                    env
                },
                enabled: false, // Disabled by default until token is configured
            },
        );

        // Google Drive server (official MCP server)
        mcp_servers.insert(
            "google-drive".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-gdrive".to_string(),
                ],
                env: HashMap::new(),
                enabled: false,
            },
        );

        // Slack server (official MCP server)
        mcp_servers.insert(
            "slack".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-slack".to_string(),
                ],
                env: {
                    let mut env = HashMap::new();
                    env.insert(
                        "SLACK_BOT_TOKEN".to_string(),
                        "<from_credential_manager>".to_string(),
                    );
                    env
                },
                enabled: false,
            },
        );

        // Brave Search server (official MCP server)
        mcp_servers.insert(
            "brave-search".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-brave-search".to_string(),
                ],
                env: {
                    let mut env = HashMap::new();
                    env.insert(
                        "BRAVE_API_KEY".to_string(),
                        "<from_credential_manager>".to_string(),
                    );
                    env
                },
                enabled: false,
            },
        );

        McpServersConfig { mcp_servers }
    }

    /// Inject credentials from Windows Credential Manager
    pub fn inject_credentials(&mut self) -> crate::mcp::McpResult<()> {
        for (server_name, config) in &mut self.mcp_servers {
            for (key, value) in &mut config.env {
                if value == "<from_credential_manager>" {
                    // Try to get credential from keyring
                    let service = format!("agiworkforce-mcp-{}", server_name);
                    if let Ok(entry) = keyring::Entry::new(&service, key) {
                        if let Ok(password) = entry.get_password() {
                            *value = password;
                        } else {
                            tracing::warn!(
                                "Credential not found for {} / {}",
                                server_name,
                                key
                            );
                        }
                    }
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = McpServersConfig::default();
        assert!(config.mcp_servers.contains_key("filesystem"));
        assert!(config.mcp_servers.contains_key("github"));
        assert!(config.mcp_servers["filesystem"].enabled);
        assert!(!config.mcp_servers["github"].enabled);
    }

    #[test]
    fn test_serialize_deserialize() {
        let config = McpServersConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: McpServersConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(config.mcp_servers.len(), deserialized.mcp_servers.len());
    }
}

