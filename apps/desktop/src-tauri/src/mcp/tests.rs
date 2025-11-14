// MCP Integration Tests
//
// Tests for the real MCP protocol implementation

#[cfg(test)]
mod tests {
    use crate::mcp::{
        client::McpClient, config::McpServerConfig, protocol::*, session::McpSession,
        transport::StdioTransport,
    };
    use std::collections::HashMap;

    #[test]
    fn test_protocol_message_parsing() {
        // Test JSON-RPC request parsing
        let json = r#"{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05"},"id":1}"#;
        let msg = McpMessage::from_str(json).unwrap();

        match msg {
            McpMessage::Request(req) => {
                assert_eq!(req.method, "initialize");
                assert_eq!(req.jsonrpc, "2.0");
                assert!(req.params.is_some());
            }
            _ => panic!("Expected Request"),
        }
    }

    #[test]
    fn test_protocol_message_serialization() {
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: "tools/list".to_string(),
            params: None,
            id: RequestId::Number(42),
        };

        let msg = McpMessage::Request(req);
        let json = msg.to_string().unwrap();

        assert!(json.contains("\"jsonrpc\":\"2.0\""));
        assert!(json.contains("\"method\":\"tools/list\""));
        assert!(json.contains("\"id\":42"));
    }

    #[test]
    fn test_error_message() {
        let json = r#"{"jsonrpc":"2.0","error":{"code":-32601,"message":"Method not found"},"id":1}"#;
        let msg = McpMessage::from_str(json).unwrap();

        match msg {
            McpMessage::Error(err) => {
                assert_eq!(err.error.code, -32601);
                assert_eq!(err.error.message, "Method not found");
            }
            _ => panic!("Expected Error"),
        }
    }

    #[test]
    fn test_initialize_params() {
        let params = InitializeParams {
            protocol_version: "2024-11-05".to_string(),
            capabilities: ClientCapabilities::default(),
            client_info: Implementation {
                name: "Test Client".to_string(),
                version: "1.0.0".to_string(),
            },
        };

        let json = serde_json::to_string(&params).unwrap();
        assert!(json.contains("protocolVersion"));
        assert!(json.contains("clientInfo"));
    }

    #[test]
    fn test_tool_definition() {
        let tool = McpToolDefinition {
            name: "test_tool".to_string(),
            description: Some("A test tool".to_string()),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "param1": {"type": "string"}
                },
                "required": ["param1"]
            }),
        };

        let json = serde_json::to_string(&tool).unwrap();
        assert!(json.contains("test_tool"));
        assert!(json.contains("inputSchema"));
    }

    #[test]
    fn test_tool_call_params() {
        let params = ToolCallParams {
            name: "read_file".to_string(),
            arguments: Some(HashMap::from([
                ("path".to_string(), serde_json::json!("/tmp/test.txt")),
            ])),
        };

        let json = serde_json::to_string(&params).unwrap();
        assert!(json.contains("read_file"));
        assert!(json.contains("/tmp/test.txt"));
    }

    #[test]
    fn test_tool_content_text() {
        let content = ToolContent::Text {
            text: "Hello, world!".to_string(),
        };

        let json = serde_json::to_string(&content).unwrap();
        assert!(json.contains("\"type\":\"text\""));
        assert!(json.contains("Hello, world!"));
    }

    #[test]
    fn test_tool_content_image() {
        let content = ToolContent::Image {
            data: "base64data".to_string(),
            mime_type: "image/png".to_string(),
        };

        let json = serde_json::to_string(&content).unwrap();
        assert!(json.contains("\"type\":\"image\""));
        assert!(json.contains("base64data"));
        assert!(json.contains("image/png"));
    }

    #[test]
    fn test_client_creation() {
        let client = McpClient::new();
        assert_eq!(client.list_servers().len(), 0);
        assert_eq!(client.list_all_tools().len(), 0);
    }

    #[test]
    fn test_client_search_empty() {
        let client = McpClient::new();
        let results = client.search_tools("test");
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_server_config_serialization() {
        let config = McpServerConfig {
            command: "npx".to_string(),
            args: vec!["-y".to_string(), "@modelcontextprotocol/server-filesystem".to_string()],
            env: HashMap::from([("KEY".to_string(), "value".to_string())]),
            enabled: true,
        };

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("npx"));
        assert!(json.contains("@modelcontextprotocol"));
    }

    #[test]
    fn test_request_id_types() {
        // Test string ID
        let id = RequestId::String("abc-123".to_string());
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, "\"abc-123\"");

        // Test number ID
        let id = RequestId::Number(42);
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, "42");

        // Test null ID
        let id = RequestId::Null;
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, "null");
    }

    #[test]
    fn test_capabilities_serialization() {
        let caps = ServerCapabilities {
            tools: Some(HashMap::new()),
            resources: Some(HashMap::new()),
            prompts: None,
            logging: None,
        };

        let json = serde_json::to_string(&caps).unwrap();
        assert!(json.contains("tools"));
        assert!(json.contains("resources"));
    }

    #[test]
    fn test_resource_definition() {
        let resource = ResourceDefinition {
            uri: "file:///tmp/test.txt".to_string(),
            name: "test.txt".to_string(),
            description: Some("A test file".to_string()),
            mime_type: Some("text/plain".to_string()),
        };

        let json = serde_json::to_string(&resource).unwrap();
        assert!(json.contains("file:///tmp/test.txt"));
        assert!(json.contains("test.txt"));
        assert!(json.contains("text/plain"));
    }

    #[test]
    fn test_prompt_definition() {
        let prompt = PromptDefinition {
            name: "code_review".to_string(),
            description: Some("Review code for best practices".to_string()),
            arguments: Some(vec![PromptArgument {
                name: "code".to_string(),
                description: Some("Code to review".to_string()),
                required: Some(true),
            }]),
        };

        let json = serde_json::to_string(&prompt).unwrap();
        assert!(json.contains("code_review"));
        assert!(json.contains("Review code"));
    }

    // Integration test (requires npx and @modelcontextprotocol/server-filesystem)
    // This test is ignored by default
    #[tokio::test]
    #[ignore]
    async fn test_filesystem_server_integration() {
        let config = McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
                ".".to_string(),
            ],
            env: HashMap::new(),
            enabled: true,
        };

        let mut session = McpSession::connect("filesystem".to_string(), config)
            .await
            .unwrap();

        let init_result = session.initialize().await.unwrap();
        assert!(!init_result.server_info.name.is_empty());
        assert_eq!(init_result.protocol_version, "2024-11-05");

        let tools = session.list_tools().await.unwrap();
        assert!(!tools.is_empty());

        // Should have at least read_file, write_file, list_directory
        let tool_names: Vec<String> = tools.iter().map(|t| t.name.clone()).collect();
        assert!(tool_names.contains(&"read_file".to_string())
            || tool_names.contains(&"readFile".to_string()));

        session.shutdown().await.unwrap();
    }

    // Test MCP client with multiple servers (requires servers to be installed)
    #[tokio::test]
    #[ignore]
    async fn test_client_multiple_servers() {
        let client = McpClient::new();

        // Connect to filesystem server
        let fs_config = McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
                ".".to_string(),
            ],
            env: HashMap::new(),
            enabled: true,
        };

        client
            .connect_server("filesystem".to_string(), fs_config)
            .await
            .unwrap();

        let servers = client.list_servers();
        assert_eq!(servers.len(), 1);
        assert!(servers.contains(&"filesystem".to_string()));

        let tools = client.list_all_tools();
        assert!(!tools.is_empty());

        // Test tool search
        let results = client.search_tools("file");
        assert!(!results.is_empty());

        // Disconnect
        client.disconnect_server("filesystem").await.unwrap();
        assert_eq!(client.list_servers().len(), 0);
    }
}
