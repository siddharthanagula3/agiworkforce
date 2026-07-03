use serde_json::json;
use std::collections::HashMap;

#[cfg(test)]
mod mcp_integration_tests {
    use super::*;

    #[test]
    fn test_mcp_client_creation() {
        use agiworkforce_desktop::core::mcp::client::McpClient;

        let client = McpClient::new();
        assert_eq!(client.list_servers().len(), 0);
    }

    #[test]
    fn test_mcp_server_configuration() {
        use agiworkforce_desktop::core::mcp::config::{McpServerConfig, McpServersConfig};

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
                transport: None,
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
        use agiworkforce_desktop::core::mcp::client::McpClient;
        use agiworkforce_desktop::core::mcp::registry::McpToolRegistry;
        use std::sync::Arc;

        let client = Arc::new(McpClient::new());
        let _registry = McpToolRegistry::new(client);
    }

    #[tokio::test]
    #[ignore] // llm-guardrail-allow: pre-existing reasoned skip, not introduced by this change — requires a real, network-installable MCP server binary. Requires MCP server to be installed and available
    async fn test_server_connection() {
        use agiworkforce_desktop::core::mcp::client::McpClient;
        use agiworkforce_desktop::core::mcp::config::McpServerConfig;
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
            transport: None,
        };

        let result = client
            .connect_server("test_server".to_string(), config)
            .await;
        assert!(result.is_ok());

        let servers = client.list_servers();
        assert!(servers.contains(&"test_server".to_string()));
    }

    #[tokio::test]
    #[ignore] // llm-guardrail-allow: pre-existing reasoned skip, not introduced by this change — requires a real, network-installable MCP server binary. Requires MCP server to be installed and available
    async fn test_tool_listing() {
        use agiworkforce_desktop::core::mcp::client::McpClient;
        use agiworkforce_desktop::core::mcp::config::McpServerConfig;
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
            transport: None,
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
    #[ignore] // llm-guardrail-allow: pre-existing reasoned skip, not introduced by this change — requires a real, network-installable MCP server binary. Requires MCP server to be installed and available
    async fn test_tool_execution() {
        use agiworkforce_desktop::core::mcp::client::McpClient;
        use agiworkforce_desktop::core::mcp::config::McpServerConfig;
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
            transport: None,
        };

        client
            .connect_server("filesystem".to_string(), config)
            .await
            .unwrap();

        let _args = json!({
            "path": "/test/path"
        });
    }

    #[tokio::test]
    #[ignore] // llm-guardrail-allow: pre-existing reasoned skip, not introduced by this change — requires a real, network-installable MCP server binary. Requires MCP server to be installed and available
    async fn test_tool_search() {
        use agiworkforce_desktop::core::mcp::client::McpClient;
        use agiworkforce_desktop::core::mcp::config::McpServerConfig;
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
            transport: None,
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
    #[ignore] // llm-guardrail-allow: pre-existing reasoned skip, not introduced by this change — requires a real, network-installable MCP server binary. Requires MCP server to be installed and available
    async fn test_server_disconnection() {
        use agiworkforce_desktop::core::mcp::client::McpClient;
        use agiworkforce_desktop::core::mcp::config::McpServerConfig;
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
            transport: None,
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
        use agiworkforce_desktop::core::mcp::client::{McpClient, McpTool};
        use agiworkforce_desktop::core::mcp::registry::McpToolRegistry;
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

        assert_eq!(agi_tool.id, "mcp__b64_dGVzdF9zZXJ2ZXI__b64_dGVzdF90b29s");
        assert_eq!(agi_tool.name, "test_tool");
        assert!(!agi_tool.parameters.is_empty());
        assert_eq!(agi_tool.parameters[0].name, "input");
        assert!(agi_tool.parameters[0].required);
    }

    #[tokio::test]
    async fn test_nonexistent_server_error() {
        use agiworkforce_desktop::core::mcp::client::McpClient;

        let client = McpClient::new();

        let result = client.disconnect_server("nonexistent").await;
        assert!(result.is_err());
    }

    #[test]
    fn test_config_serialization() {
        use agiworkforce_desktop::core::mcp::config::{McpServerConfig, McpServersConfig};

        let mut servers = HashMap::new();
        servers.insert(
            "filesystem".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec!["-y".to_string()],
                env: HashMap::new(),
                enabled: true,
                transport: None,
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

    // DESKTOP-MCP-DOTFILE-CONFIG-FAKE-SUCCESS-01 regression test.
    //
    // Before the fix, a server declared only in the shared CLI dotfile
    // (~/.agiworkforce/mcp.json, written by Settings -> Developer's
    // DotfileSettings.tsx) was never read by the live MCP client
    // (McpServersConfig, backed by a completely different app-data JSON
    // file) -- the UI showed a success toast, but the server never
    // connected and exposed zero tools. This test proves the real fix
    // (McpServersConfig::merge_dotfile_servers) end-to-end against a REAL,
    // runnable MCP stdio server: the dotfile entry is merged in, the exact
    // same McpClient the live app uses connects to it for real (spawns a
    // real `npx` process, performs a real MCP JSON-RPC handshake), its
    // real tools are discoverable, and a real tool call succeeds.
    //
    // Uses an isolated temp HOME so it never touches a real developer's
    // `~/.agiworkforce/mcp.json`, and runs in its own test-binary process
    // (a Cargo integration test, not a `--lib` unit test) so mutating the
    // `HOME` env var here cannot leak into other test binaries.
    #[tokio::test]
    #[ignore] // llm-guardrail-allow: not CI-run-by-default because it spawns a real network-installed
    // npx process (@modelcontextprotocol/server-everything) — this test was run manually and passed
    // (see docs/agent-context/known-flaws.md DESKTOP-MCP-DOTFILE-CONFIG-FAKE-SUCCESS-01), matching
    // the pre-existing ignored-test pattern already used by this file's other real-MCP-server tests.
    async fn dotfile_mcp_server_actually_connects_and_exposes_real_tools() {
        use agiworkforce_desktop::core::mcp::client::McpClient;
        use agiworkforce_desktop::core::mcp::config::McpServersConfig;
        use std::sync::Mutex;

        // Guards HOME env mutation across this binary's tests. No other test
        // in this file touches HOME today, but this keeps future additions
        // safe (mirrors core::mcp::config::tests::DOTFILE_ENV_LOCK).
        static ENV_LOCK: Mutex<()> = Mutex::new(());
        let _guard = ENV_LOCK.lock().unwrap();

        let temp_home = tempfile::tempdir().expect("failed to create tempdir");
        let dotfile_dir = temp_home.path().join(".agiworkforce");
        std::fs::create_dir_all(&dotfile_dir).unwrap();
        std::fs::write(
            dotfile_dir.join("mcp.json"),
            r#"{"mcpServers":{"integration-test-everything":{"command":"npx","args":["-y","@modelcontextprotocol/server-everything"]}}}"#,
        )
        .unwrap();

        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_home.path());

        // Simulates exactly what McpState::reload_active_config does: start
        // from the (empty) primary config, then merge in the dotfile.
        let mut config = McpServersConfig {
            mcp_servers: HashMap::new(),
        };
        config.merge_dotfile_servers();

        match original_home {
            Some(val) => std::env::set_var("HOME", val),
            None => std::env::remove_var("HOME"),
        }

        let server_config = config
            .mcp_servers
            .get("integration-test-everything")
            .expect("dotfile server should have been merged into the config")
            .clone();
        assert_eq!(server_config.command, "npx");

        let client = McpClient::new();
        client
            .connect_server("integration-test-everything".to_string(), server_config)
            .await
            .expect("real MCP server should connect");

        assert!(client
            .get_connected_servers()
            .contains(&"integration-test-everything".to_string()));

        let tools = client.list_all_tools();
        let tool_names: Vec<String> = tools
            .iter()
            .filter(|(server, _)| server == "integration-test-everything")
            .map(|(_, tool)| tool.name.clone())
            .collect();
        assert!(
            tool_names.contains(&"echo".to_string()),
            "expected 'echo' tool from @modelcontextprotocol/server-everything, got: {:?}",
            tool_names
        );

        let result = client
            .call_tool(
                "integration-test-everything",
                "echo",
                json!({ "message": "DESKTOP-MCP-DOTFILE-CONFIG-FAKE-SUCCESS-01 verified" }),
            )
            .await
            .expect("real tool call should succeed");
        let result_str = serde_json::to_string(&result).unwrap();
        assert!(
            result_str.contains("DESKTOP-MCP-DOTFILE-CONFIG-FAKE-SUCCESS-01 verified"),
            "expected echoed message in tool result, got: {}",
            result_str
        );

        client
            .disconnect_server("integration-test-everything")
            .await
            .expect("disconnect should succeed");
    }

    #[test]
    fn test_http_transport_config_serialization() {
        use agiworkforce_desktop::core::mcp::transport::{HttpSseConfig, TransportConfig};

        // Test HTTP transport config serialization
        let http_config = HttpSseConfig {
            url: "https://mcp.example.com".to_string(),
            api_key: Some("test-api-key".to_string()),
            bearer_token: None,
            headers: HashMap::new(),
            timeout_secs: 60,
            verify_ssl: true,
        };

        let json = serde_json::to_string(&http_config).unwrap();
        assert!(json.contains("mcp.example.com"));
        assert!(json.contains("test-api-key"));

        let parsed: HttpSseConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.url, "https://mcp.example.com");
        assert_eq!(parsed.api_key, Some("test-api-key".to_string()));
        assert_eq!(parsed.timeout_secs, 60);
        assert!(parsed.verify_ssl);

        // Test TransportConfig serialization
        let transport_config = TransportConfig::Http(http_config);
        let json = serde_json::to_string(&transport_config).unwrap();
        assert!(json.contains("http"));
        assert!(json.contains("mcp.example.com"));
    }
}
