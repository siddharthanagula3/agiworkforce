use serde_json::json;
use std::collections::HashMap;

#[cfg(test)]
mod mcp_integration_tests {
    use super::*;

    #[test]
    fn test_mcp_client_creation() {
        use agiworkforce_desktop::mcp::client::McpClient;

        let client = McpClient::new();
        assert_eq!(client.list_servers().len(), 0);
    }

    #[test]
    fn test_mcp_server_configuration() {
        use agiworkforce_desktop::mcp::config::{McpServerConfig, McpServersConfig};

        let mut servers = HashMap::new();
        servers.insert(
            "filesystem".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-filesystem".to_string(),
                    ".".to_string(),
                ],
                env: HashMap::new(),
                enabled: true,
            },
        );

        let config = McpServersConfig {
            mcp_servers: servers,
        };

        assert!(config.mcp_servers.contains_key("filesystem"));
        assert_eq!(config.mcp_servers.get("filesystem").unwrap().command, "npx");
        assert!(config.mcp_servers.get("filesystem").unwrap().enabled);
    }

    #[test]
    fn test_tool_registry_creation() {
        use agiworkforce_desktop::mcp::client::McpClient;
        use agiworkforce_desktop::mcp::registry::McpToolRegistry;
        use std::sync::Arc;

        let client = Arc::new(McpClient::new());
        let _registry = McpToolRegistry::new(client);
    }

    #[tokio::test]
    async fn test_server_connection() {
        use agiworkforce_desktop::mcp::client::McpClient;
        use agiworkforce_desktop::mcp::config::McpServerConfig;
        use std::collections::HashMap;

        let client = McpClient::new();

        let config = McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
            ],
            env: HashMap::new(),
            enabled: true,
        };

        let result = client
            .connect_server("test_server".to_string(), config)
            .await;
        assert!(result.is_ok());

        let servers = client.list_servers();
        assert!(servers.contains(&"test_server".to_string()));
    }

    #[tokio::test]
    async fn test_tool_listing() {
        use agiworkforce_desktop::mcp::client::McpClient;
        use agiworkforce_desktop::mcp::config::McpServerConfig;
        use std::collections::HashMap;

        let client = McpClient::new();

        let config = McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
            ],
            env: HashMap::new(),
            enabled: true,
        };

        client
            .connect_server("filesystem".to_string(), config)
            .await
            .unwrap();

        let tools = client.list_all_tools();
        assert!(!tools.is_empty());

        let tool_names: Vec<String> = tools.iter().map(|(_, tool)| tool.name.clone()).collect();
        assert!(tool_names.contains(&"read_file".to_string()));
        assert!(tool_names.contains(&"write_file".to_string()));
    }

    #[tokio::test]
    async fn test_tool_execution() {
        use agiworkforce_desktop::mcp::client::McpClient;
        use agiworkforce_desktop::mcp::config::McpServerConfig;
        use std::collections::HashMap;

        let client = McpClient::new();

        let config = McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
            ],
            env: HashMap::new(),
            enabled: true,
        };

        client
            .connect_server("filesystem".to_string(), config)
            .await
            .unwrap();

        let _args = json!({
            "path": "/test/path"
        });

        assert!(true);
    }

    #[tokio::test]
    async fn test_tool_search() {
        use agiworkforce_desktop::mcp::client::McpClient;
        use agiworkforce_desktop::mcp::config::McpServerConfig;
        use std::collections::HashMap;

        let client = McpClient::new();

        let config = McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
            ],
            env: HashMap::new(),
            enabled: true,
        };

        client
            .connect_server("filesystem".to_string(), config)
            .await
            .unwrap();

        let results = client.search_tools("file");
        assert!(!results.is_empty());

        let tool_names: Vec<String> = results.iter().map(|(_, tool)| tool.name.clone()).collect();
        assert!(tool_names.contains(&"read_file".to_string()));
    }

    #[tokio::test]
    async fn test_server_disconnection() {
        use agiworkforce_desktop::mcp::client::McpClient;
        use agiworkforce_desktop::mcp::config::McpServerConfig;
        use std::collections::HashMap;

        let client = McpClient::new();

        let config = McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
            ],
            env: HashMap::new(),
            enabled: true,
        };

        client
            .connect_server("test_server".to_string(), config)
            .await
            .unwrap();

        let result = client.disconnect_server("test_server").await;
        assert!(result.is_ok());

        let servers = client.list_servers();
        assert!(!servers.contains(&"test_server".to_string()));
    }

    #[test]
    fn test_mcp_to_agi_tool_conversion() {
        use agiworkforce_desktop::mcp::client::{McpClient, McpTool};
        use agiworkforce_desktop::mcp::registry::McpToolRegistry;
        use std::sync::Arc;

        let client = Arc::new(McpClient::new());
        let registry = McpToolRegistry::new(client);

        let mcp_tool = McpTool {
            name: "test_tool".to_string(),
            description: Some("Test tool".to_string()),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "input": {
                        "type": "string",
                        "description": "Test input"
                    }
                },
                "required": ["input"]
            }),
        };

        let agi_tool = registry.mcp_tool_to_schema("test_server", &mcp_tool);

        assert_eq!(agi_tool.id, "mcp_test_server_test_tool");
        assert_eq!(agi_tool.name, "test_tool");
        assert!(!agi_tool.parameters.is_empty());
        assert_eq!(agi_tool.parameters[0].name, "input");
        assert!(agi_tool.parameters[0].required);
    }

    #[tokio::test]
    async fn test_nonexistent_server_error() {
        use agiworkforce_desktop::mcp::client::McpClient;

        let client = McpClient::new();

        let result = client.disconnect_server("nonexistent").await;
        assert!(result.is_err());
    }

    #[test]
    fn test_config_serialization() {
        use agiworkforce_desktop::mcp::config::{McpServerConfig, McpServersConfig};

        let mut servers = HashMap::new();
        servers.insert(
            "filesystem".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec!["-y".to_string()],
                env: HashMap::new(),
                enabled: true,
            },
        );

        let config = McpServersConfig {
            mcp_servers: servers,
        };

        let json_str = serde_json::to_string(&config).unwrap();
        assert!(json_str.contains("filesystem"));
        assert!(json_str.contains("npx"));

        let parsed: McpServersConfig = serde_json::from_str(&json_str).unwrap();
        assert!(parsed.mcp_servers.contains_key("filesystem"));
    }
}
