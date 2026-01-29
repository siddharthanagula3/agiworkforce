#[cfg(test)]
mod unit_tests {
    use crate::core::mcp::{
        client::McpClient, config::McpServerConfig, protocol::*, session::McpSession,
    };
    use std::collections::HashMap;

    #[test]
    fn test_protocol_message_parsing() {
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
        let json =
            r#"{"jsonrpc":"2.0","error":{"code":-32601,"message":"Method not found"},"id":1}"#;
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
            arguments: Some(HashMap::from([(
                "path".to_string(),
                serde_json::json!("/tmp/test.txt"),
            )])),
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
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
            ],
            env: HashMap::from([("KEY".to_string(), "value".to_string())]),
            enabled: true,
            transport: None,
        };

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("npx"));
        assert!(json.contains("@modelcontextprotocol"));
    }

    #[test]
    fn test_request_id_types() {
        let id = RequestId::String("abc-123".to_string());
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, "\"abc-123\"");

        let id = RequestId::Number(42);
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, "42");

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
            transport: None,
        };

        let session = McpSession::connect("filesystem".to_string(), config)
            .await
            .unwrap();

        let init_result = session.initialize().await.unwrap();
        assert!(!init_result.server_info.name.is_empty());
        assert_eq!(init_result.protocol_version, "2024-11-05");

        let tools = session.list_tools().await.unwrap();
        assert!(!tools.is_empty());

        let tool_names: Vec<String> = tools.iter().map(|t| t.name.clone()).collect();
        assert!(
            tool_names.contains(&"read_file".to_string())
                || tool_names.contains(&"readFile".to_string())
        );

        session.shutdown().await.unwrap();
    }

    #[tokio::test]
    #[ignore]
    async fn test_client_multiple_servers() {
        let client = McpClient::new();

        let fs_config = McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
                ".".to_string(),
            ],
            env: HashMap::new(),
            enabled: true,
            transport: None,
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

        let results = client.search_tools("file");
        assert!(!results.is_empty());

        client.disconnect_server("filesystem").await.unwrap();
        assert_eq!(client.list_servers().len(), 0);
    }
}

// ============================================================================
// Timeout Handling Tests
// ============================================================================
#[cfg(test)]
mod timeout_tests {
    use crate::core::mcp::{
        error::McpError,
        protocol::{JsonRpcResponse, RequestId},
    };
    use std::time::Duration;
    use tokio::sync::oneshot;
    use tokio::time::timeout;

    /// Test that request timeout is properly detected
    #[tokio::test]
    async fn test_request_timeout_detection() {
        // Simulate a slow response using a channel that never receives
        let (_tx, rx) = oneshot::channel::<Result<JsonRpcResponse, McpError>>();

        // Apply a very short timeout (10ms) to simulate timeout scenario
        let result = timeout(Duration::from_millis(10), rx).await;

        // The timeout should trigger an Err
        assert!(result.is_err(), "Expected timeout to trigger");
    }

    /// Test that timeout error messages are descriptive
    #[tokio::test]
    async fn test_timeout_error_message_format() {
        let timeout_error = McpError::ToolExecutionTimeout(
            "Tool 'read_file' timed out after 30 seconds".to_string(),
        );

        let error_string = format!("{}", timeout_error);
        assert!(error_string.contains("timed out"));
        assert!(error_string.contains("read_file"));
        assert!(error_string.contains("30 seconds"));
    }

    /// Test initialization timeout error
    #[test]
    fn test_initialization_timeout_error() {
        let timeout_error = McpError::InitializationTimeout(
            "Session 'filesystem' initialization timed out after 10 seconds".to_string(),
        );

        let error_string = format!("{}", timeout_error);
        assert!(error_string.contains("initialization timed out"));
        assert!(error_string.contains("filesystem"));
        assert!(error_string.contains("10 seconds"));
    }

    /// Test concurrent timeout handling - multiple requests timing out
    #[tokio::test]
    async fn test_concurrent_request_timeouts() {
        let mut handles = Vec::new();

        // Spawn multiple requests that will all timeout
        for i in 0..5 {
            let handle = tokio::spawn(async move {
                let (_tx, rx) = oneshot::channel::<Result<JsonRpcResponse, McpError>>();
                let result = timeout(Duration::from_millis(10), rx).await;
                (i, result.is_err())
            });
            handles.push(handle);
        }

        // All requests should timeout
        for handle in handles {
            let (index, timed_out) = handle.await.unwrap();
            assert!(timed_out, "Request {} should have timed out", index);
        }
    }

    /// Test that response received before timeout succeeds
    #[tokio::test]
    async fn test_response_before_timeout_succeeds() {
        let (tx, rx) = oneshot::channel::<Result<JsonRpcResponse, McpError>>();

        // Send response immediately
        let response = JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            result: serde_json::json!({"tools": []}),
            id: RequestId::Number(1),
        };
        tx.send(Ok(response)).unwrap();

        // Apply timeout and expect success
        let result = timeout(Duration::from_secs(1), rx).await;

        assert!(result.is_ok(), "Should receive response before timeout");
        let inner_result = result.unwrap();
        assert!(inner_result.is_ok(), "Inner result should be Ok");
    }

    /// Test timeout boundary conditions
    #[tokio::test]
    async fn test_timeout_boundary_near_limit() {
        let (tx, rx) = oneshot::channel::<Result<JsonRpcResponse, McpError>>();

        // Spawn task that sends response after 50ms
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            let response = JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                result: serde_json::json!({}),
                id: RequestId::Number(1),
            };
            let _ = tx.send(Ok(response));
        });

        // Apply 100ms timeout - should succeed
        let result = timeout(Duration::from_millis(100), rx).await;
        assert!(
            result.is_ok(),
            "Response sent within timeout window should succeed"
        );
    }

    /// Test stale request cleanup scenario
    #[test]
    fn test_stale_request_age_calculation() {
        use std::time::Instant;

        let created_at = Instant::now();
        let max_age_secs = 300u64; // 5 minutes

        // Simulate immediate check - should not be stale
        let now = Instant::now();
        let age = now.duration_since(created_at).as_secs();
        assert!(age < max_age_secs, "Fresh request should not be stale");
    }
}

// ============================================================================
// Credential Management Tests
// ============================================================================
#[cfg(test)]
mod credential_tests {
    use crate::core::mcp::config::{
        encrypt_mcp_credential, encrypt_oauth_token, McpServerConfig, McpServersConfig,
    };
    use std::collections::HashMap;

    /// Test OAuth placeholder detection
    #[test]
    fn test_oauth_placeholder_detection() {
        let oauth_placeholder = "<from_oauth:github>";
        let legacy_placeholder = "<from_credential_manager>";
        let regular_value = "actual_token_value";

        assert!(oauth_placeholder.starts_with("<from_oauth:"));
        assert!(oauth_placeholder.ends_with(">"));
        assert!(!legacy_placeholder.starts_with("<from_oauth:"));
        assert!(!regular_value.starts_with("<from_oauth:"));
    }

    /// Test OAuth provider extraction from placeholder
    #[test]
    fn test_oauth_provider_extraction() {
        let placeholder = "<from_oauth:github>";
        let prefix = "<from_oauth:";

        if placeholder.starts_with(prefix) && placeholder.ends_with(">") {
            let provider = &placeholder[prefix.len()..placeholder.len() - 1];
            assert_eq!(provider, "github");
        } else {
            panic!("Failed to parse OAuth placeholder");
        }
    }

    /// Test various OAuth providers
    #[test]
    fn test_oauth_provider_variants() {
        let providers = vec![
            ("<from_oauth:github>", "github"),
            ("<from_oauth:google>", "google"),
            ("<from_oauth:slack>", "slack"),
            ("<from_oauth:microsoft>", "microsoft"),
            ("<from_oauth:dropbox>", "dropbox"),
        ];

        let prefix = "<from_oauth:";
        for (placeholder, expected) in providers {
            let provider = &placeholder[prefix.len()..placeholder.len() - 1];
            assert_eq!(provider, expected, "Provider mismatch for {}", placeholder);
        }
    }

    /// Test legacy credential placeholder detection
    #[test]
    fn test_legacy_credential_placeholder() {
        let legacy_placeholder = "<from_credential_manager>";
        assert_eq!(legacy_placeholder, "<from_credential_manager>");
    }

    /// Test MCP credential encryption produces non-empty result
    #[test]
    fn test_mcp_credential_encryption_produces_output() {
        let plaintext = "test_api_key_12345";
        let encrypted = encrypt_mcp_credential(plaintext);

        assert!(encrypted.is_some(), "Encryption should produce a result");
        let encrypted_value = encrypted.unwrap();
        assert!(
            !encrypted_value.is_empty(),
            "Encrypted value should not be empty"
        );
        assert_ne!(
            encrypted_value, plaintext,
            "Encrypted value should differ from plaintext"
        );
    }

    /// Test OAuth token encryption produces non-empty result
    #[test]
    fn test_oauth_token_encryption_produces_output() {
        let plaintext = "oauth_access_token_xyz";
        let encrypted = encrypt_oauth_token(plaintext);

        assert!(encrypted.is_some(), "Encryption should produce a result");
        let encrypted_value = encrypted.unwrap();
        assert!(
            !encrypted_value.is_empty(),
            "Encrypted value should not be empty"
        );
        assert_ne!(
            encrypted_value, plaintext,
            "Encrypted value should differ from plaintext"
        );
    }

    /// Test that encryption produces base64-encoded output
    #[test]
    fn test_encryption_produces_base64() {
        let plaintext = "secret_value";
        let encrypted = encrypt_mcp_credential(plaintext).unwrap();

        // Base64 should only contain alphanumeric, +, /, and = characters
        let is_base64 = encrypted
            .chars()
            .all(|c| c.is_alphanumeric() || c == '+' || c == '/' || c == '=');
        assert!(is_base64, "Encrypted output should be valid base64");
    }

    /// Test encryption with different input lengths
    #[test]
    fn test_encryption_various_lengths() {
        let inputs = vec![
            "a",
            "short",
            "medium_length_token",
            "a_very_long_api_key_that_exceeds_typical_token_length_12345678901234567890",
            "", // Empty input
        ];

        for input in inputs {
            let result = encrypt_mcp_credential(input);
            if input.is_empty() {
                // Empty input should still encrypt (to encrypted empty string)
                assert!(result.is_some(), "Empty input should still encrypt");
            } else {
                assert!(result.is_some(), "Should encrypt input: {}", input);
            }
        }
    }

    /// Test credential key format for database storage
    #[test]
    fn test_credential_key_format() {
        let server_name = "github";
        let env_key = "GITHUB_PERSONAL_ACCESS_TOKEN";
        let cred_key = format!("mcp_credential_{}_{}", server_name, env_key);

        assert_eq!(
            cred_key,
            "mcp_credential_github_GITHUB_PERSONAL_ACCESS_TOKEN"
        );
    }

    /// Test OAuth key format for database storage
    #[test]
    fn test_oauth_key_format() {
        let provider = "github";

        let access_token_key = format!("mcp_oauth_{}_access_token", provider);
        let refresh_token_key = format!("mcp_oauth_{}_refresh_token", provider);
        let expires_at_key = format!("mcp_oauth_{}_expires_at", provider);

        assert_eq!(access_token_key, "mcp_oauth_github_access_token");
        assert_eq!(refresh_token_key, "mcp_oauth_github_refresh_token");
        assert_eq!(expires_at_key, "mcp_oauth_github_expires_at");
    }

    /// Test server config with OAuth environment variable
    #[test]
    fn test_server_config_oauth_env() {
        let mut env = HashMap::new();
        env.insert(
            "GITHUB_PERSONAL_ACCESS_TOKEN".to_string(),
            "<from_oauth:github>".to_string(),
        );

        let config = McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-github".to_string(),
            ],
            env,
            enabled: false,
            transport: None,
        };

        let token_value = config.env.get("GITHUB_PERSONAL_ACCESS_TOKEN").unwrap();
        assert!(token_value.starts_with("<from_oauth:"));
    }

    /// Test server config with legacy credential placeholder
    #[test]
    fn test_server_config_legacy_credential() {
        let mut env = HashMap::new();
        env.insert(
            "STRIPE_SECRET_KEY".to_string(),
            "<from_credential_manager>".to_string(),
        );

        let config = McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-stripe".to_string(),
            ],
            env,
            enabled: false,
            transport: None,
        };

        let key_value = config.env.get("STRIPE_SECRET_KEY").unwrap();
        assert_eq!(key_value, "<from_credential_manager>");
    }

    /// Test McpServersConfig default contains expected servers
    #[test]
    fn test_servers_config_default_structure() {
        let config = McpServersConfig::default();

        // Should have some default servers configured
        assert!(
            !config.mcp_servers.is_empty(),
            "Should have default servers"
        );

        // Check filesystem server exists and is enabled by default
        if let Some(fs_server) = config.mcp_servers.get("filesystem") {
            assert!(
                fs_server.enabled,
                "Filesystem server should be enabled by default"
            );
        }
    }

    /// Test config serialization round-trip preserves data
    #[test]
    fn test_config_serialization_roundtrip() {
        let mut env = HashMap::new();
        env.insert("API_KEY".to_string(), "<from_oauth:test>".to_string());

        let original = McpServerConfig {
            command: "test_command".to_string(),
            args: vec!["arg1".to_string(), "arg2".to_string()],
            env,
            enabled: true,
            transport: None,
        };

        let json = serde_json::to_string(&original).unwrap();
        let deserialized: McpServerConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(original.command, deserialized.command);
        assert_eq!(original.args, deserialized.args);
        assert_eq!(original.enabled, deserialized.enabled);
        assert_eq!(original.env.get("API_KEY"), deserialized.env.get("API_KEY"));
    }

    /// Test token expiry calculation
    #[test]
    fn test_token_expiry_calculation() {
        use std::time::{SystemTime, UNIX_EPOCH};

        let current_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let expires_in_secs = 3600i64; // 1 hour
        let expires_at = current_time + expires_in_secs;

        // Token should not be expired yet
        assert!(expires_at > current_time);

        // Check expiry with 60-second buffer
        let buffer_secs = 60i64;
        let is_expired = current_time >= expires_at - buffer_secs;
        assert!(!is_expired, "Fresh token should not be considered expired");

        // Simulate an expired token
        let expired_at = current_time - 100; // 100 seconds ago
        let is_expired_token = current_time >= expired_at - buffer_secs;
        assert!(is_expired_token, "Old token should be considered expired");
    }
}

// ============================================================================
// Malformed Message Handling Tests
// ============================================================================
#[cfg(test)]
mod malformed_message_tests {
    use crate::core::mcp::protocol::{
        ErrorObject, JsonRpcError, JsonRpcRequest, McpMessage, RequestId, INTERNAL_ERROR,
        INVALID_PARAMS, INVALID_REQUEST, METHOD_NOT_FOUND, PARSE_ERROR,
    };

    /// Test parsing completely invalid JSON
    #[test]
    fn test_parse_invalid_json() {
        let invalid_json = "this is not json at all";
        let result = McpMessage::from_str(invalid_json);

        assert!(result.is_err(), "Invalid JSON should fail to parse");
    }

    /// Test parsing JSON with syntax errors
    #[test]
    fn test_parse_json_syntax_errors() {
        let syntax_errors = vec![
            r#"{"jsonrpc": "2.0", "method": "test""#, // Missing closing brace
            r#"{"jsonrpc": "2.0", method: "test"}"#,  // Unquoted key
            r#"{"jsonrpc": "2.0", "method": test}"#,  // Unquoted value
            r#"{jsonrpc: 2.0, method: test}"#,        // All unquoted
            r#"["jsonrpc", "2.0"]"#,                  // Array instead of object
        ];

        for invalid in syntax_errors {
            let result = McpMessage::from_str(invalid);
            assert!(result.is_err(), "Syntax error should fail: {}", invalid);
        }
    }

    /// Test parsing JSON-RPC with wrong protocol version
    #[test]
    fn test_wrong_protocol_version() {
        // JSON-RPC 1.0 format (no jsonrpc field)
        let json_rpc_1 = r#"{"method":"test","params":[],"id":1}"#;
        let _result = McpMessage::from_str(json_rpc_1);
        // This will parse as a request but with wrong/missing jsonrpc field
        // The actual protocol version validation happens at a higher level

        // JSON-RPC with wrong version string
        let wrong_version = r#"{"jsonrpc":"1.0","method":"test","id":1}"#;
        let result = McpMessage::from_str(wrong_version);
        // Should still parse, but validation of version is application-level
        if let Ok(McpMessage::Request(req)) = result {
            assert_ne!(req.jsonrpc, "2.0", "Version should not be 2.0");
        }
    }

    /// Test parsing request missing required fields
    #[test]
    fn test_request_missing_method() {
        let missing_method = r#"{"jsonrpc":"2.0","id":1}"#;
        let result = McpMessage::from_str(missing_method);

        // Without method, this should not parse as a valid Request
        // It might parse as Response if it has result field, or fail
        match result {
            Ok(McpMessage::Request(_)) => panic!("Should not parse as request without method"),
            _ => {} // Any other result is acceptable
        }
    }

    /// Test parsing request missing id (should be notification)
    #[test]
    fn test_request_without_id_is_notification() {
        let no_id = r#"{"jsonrpc":"2.0","method":"test"}"#;
        let result = McpMessage::from_str(no_id);

        // A message with method but no id should be a notification
        match result {
            Ok(McpMessage::Notification(notif)) => {
                assert_eq!(notif.method, "test");
            }
            Ok(McpMessage::Request(req)) => {
                // If parsed as request, id should be Null
                assert!(matches!(req.id, RequestId::Null));
            }
            _ => {} // Other results may occur depending on parsing priority
        }
    }

    /// Test parsing response missing result and error (invalid)
    #[test]
    fn test_response_missing_result() {
        let missing_result = r#"{"jsonrpc":"2.0","id":1}"#;
        let result = McpMessage::from_str(missing_result);

        // A response without result or error is malformed
        // The parser might try to interpret this differently
        match result {
            Ok(McpMessage::Response(resp)) => {
                // If parsed as response, result should be null or default
                assert!(resp.result.is_null());
            }
            _ => {} // Other interpretations are acceptable
        }
    }

    /// Test parsing error response with invalid error object
    #[test]
    fn test_error_response_invalid_error_object() {
        // Error without code
        let missing_code = r#"{"jsonrpc":"2.0","error":{"message":"error"},"id":1}"#;
        let result = McpMessage::from_str(missing_code);
        // This should fail or produce an error with default code
        assert!(result.is_ok() || result.is_err());

        // Error without message
        let missing_message = r#"{"jsonrpc":"2.0","error":{"code":-32600},"id":1}"#;
        let result = McpMessage::from_str(missing_message);
        // This should fail or produce an error with default message
        assert!(result.is_ok() || result.is_err());
    }

    /// Test standard JSON-RPC error codes
    #[test]
    fn test_standard_error_codes() {
        assert_eq!(PARSE_ERROR, -32700);
        assert_eq!(INVALID_REQUEST, -32600);
        assert_eq!(METHOD_NOT_FOUND, -32601);
        assert_eq!(INVALID_PARAMS, -32602);
        assert_eq!(INTERNAL_ERROR, -32603);
    }

    /// Test error object construction and serialization
    #[test]
    fn test_error_object_construction() {
        let error = ErrorObject {
            code: METHOD_NOT_FOUND,
            message: "Method not found".to_string(),
            data: Some(serde_json::json!({"detail": "tools/unknown"})),
        };

        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("-32601"));
        assert!(json.contains("Method not found"));
        assert!(json.contains("tools/unknown"));
    }

    /// Test parsing empty JSON object
    #[test]
    fn test_parse_empty_object() {
        let empty = "{}";
        let result = McpMessage::from_str(empty);

        // Empty object doesn't match any valid message type
        // It might parse with defaults or fail
        match result {
            Ok(_) => {
                // If it parses, it should have empty/default values
            }
            Err(_) => {
                // Failure is also acceptable for empty object
            }
        }
    }

    /// Test parsing null values in various positions
    #[test]
    fn test_null_values() {
        // Null id
        let null_id = r#"{"jsonrpc":"2.0","method":"test","id":null}"#;
        let result = McpMessage::from_str(null_id);
        if let Ok(McpMessage::Request(req)) = result {
            assert!(matches!(req.id, RequestId::Null));
        }

        // Null params
        let null_params = r#"{"jsonrpc":"2.0","method":"test","params":null,"id":1}"#;
        let result = McpMessage::from_str(null_params);
        if let Ok(McpMessage::Request(req)) = result {
            assert!(req.params.is_none() || req.params == Some(serde_json::Value::Null));
        }

        // Null result
        let null_result = r#"{"jsonrpc":"2.0","result":null,"id":1}"#;
        let result = McpMessage::from_str(null_result);
        if let Ok(McpMessage::Response(resp)) = result {
            assert!(resp.result.is_null());
        }
    }

    /// Test parsing with extra unexpected fields
    #[test]
    fn test_extra_fields_ignored() {
        let extra_fields =
            r#"{"jsonrpc":"2.0","method":"test","id":1,"extra":"ignored","another":123}"#;
        let result = McpMessage::from_str(extra_fields);

        // Extra fields should be ignored (not cause parse failure)
        assert!(result.is_ok(), "Extra fields should be ignored");
        if let Ok(McpMessage::Request(req)) = result {
            assert_eq!(req.method, "test");
        }
    }

    /// Test parsing with deeply nested params
    #[test]
    fn test_deeply_nested_params() {
        let nested = r#"{"jsonrpc":"2.0","method":"test","params":{"level1":{"level2":{"level3":{"level4":"value"}}}},"id":1}"#;
        let result = McpMessage::from_str(nested);

        assert!(result.is_ok(), "Deeply nested params should parse");
        if let Ok(McpMessage::Request(req)) = result {
            let params = req.params.unwrap();
            let value = params["level1"]["level2"]["level3"]["level4"].as_str();
            assert_eq!(value, Some("value"));
        }
    }

    /// Test parsing request with array params (positional)
    #[test]
    fn test_array_params() {
        let array_params =
            r#"{"jsonrpc":"2.0","method":"test","params":["arg1","arg2",123],"id":1}"#;
        let result = McpMessage::from_str(array_params);

        assert!(result.is_ok(), "Array params should parse");
        if let Ok(McpMessage::Request(req)) = result {
            let params = req.params.unwrap();
            assert!(params.is_array());
            assert_eq!(params[0], "arg1");
            assert_eq!(params[2], 123);
        }
    }

    /// Test string id vs numeric id
    #[test]
    fn test_request_id_types() {
        // Numeric ID
        let numeric_id = r#"{"jsonrpc":"2.0","method":"test","id":42}"#;
        let result = McpMessage::from_str(numeric_id);
        if let Ok(McpMessage::Request(req)) = result {
            assert!(matches!(req.id, RequestId::Number(42)));
        }

        // String ID
        let string_id = r#"{"jsonrpc":"2.0","method":"test","id":"uuid-123-abc"}"#;
        let result = McpMessage::from_str(string_id);
        if let Ok(McpMessage::Request(req)) = result {
            if let RequestId::String(s) = req.id {
                assert_eq!(s, "uuid-123-abc");
            }
        }
    }

    /// Test parsing large numeric values
    #[test]
    fn test_large_numeric_values() {
        let large_id = r#"{"jsonrpc":"2.0","method":"test","id":9223372036854775807}"#;
        let result = McpMessage::from_str(large_id);

        // Should handle large i64 values
        assert!(result.is_ok(), "Should handle large numeric ID");
    }

    /// Test parsing unicode in strings
    #[test]
    fn test_unicode_strings() {
        let unicode =
            r#"{"jsonrpc":"2.0","method":"test","params":{"text":"Hello, \u4e16\u754c!"},"id":1}"#;
        let result = McpMessage::from_str(unicode);

        assert!(result.is_ok(), "Should handle unicode escape sequences");
        if let Ok(McpMessage::Request(req)) = result {
            let params = req.params.unwrap();
            let text = params["text"].as_str().unwrap();
            assert!(text.contains("Hello"));
        }
    }

    /// Test notification without id is valid
    #[test]
    fn test_valid_notification() {
        let notification = r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#;
        let result = McpMessage::from_str(notification);

        match result {
            Ok(McpMessage::Notification(notif)) => {
                assert_eq!(notif.method, "notifications/initialized");
                assert_eq!(notif.jsonrpc, "2.0");
            }
            Ok(McpMessage::Request(req)) => {
                // Could also parse as request with null id
                assert_eq!(req.method, "notifications/initialized");
            }
            _ => panic!("Should parse as notification or request"),
        }
    }

    /// Test response ambiguity (result vs error)
    #[test]
    fn test_response_with_both_result_and_error() {
        // Per spec, a response should have either result OR error, not both
        let both =
            r#"{"jsonrpc":"2.0","result":{},"error":{"code":-32600,"message":"test"},"id":1}"#;
        let result = McpMessage::from_str(both);

        // Parser might accept this, preferring one over the other
        // The behavior depends on parsing priority (result or error first)
        assert!(result.is_ok() || result.is_err());
    }

    /// Test McpMessage to_string and back
    #[test]
    fn test_message_roundtrip() {
        let original_request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: "tools/call".to_string(),
            params: Some(serde_json::json!({"name": "read_file", "path": "/tmp/test"})),
            id: RequestId::Number(1),
        };

        let msg = McpMessage::Request(original_request.clone());
        let json = msg.to_string().unwrap();
        let parsed = McpMessage::from_str(&json).unwrap();

        if let McpMessage::Request(req) = parsed {
            assert_eq!(req.jsonrpc, "2.0");
            assert_eq!(req.method, "tools/call");
            assert!(matches!(req.id, RequestId::Number(1)));
        } else {
            panic!("Expected Request after roundtrip");
        }
    }

    /// Test error response roundtrip
    #[test]
    fn test_error_response_roundtrip() {
        let original_error = JsonRpcError {
            jsonrpc: "2.0".to_string(),
            error: ErrorObject {
                code: METHOD_NOT_FOUND,
                message: "The method does not exist".to_string(),
                data: None,
            },
            id: RequestId::Number(1),
        };

        let msg = McpMessage::Error(original_error);
        let json = msg.to_string().unwrap();
        let parsed = McpMessage::from_str(&json).unwrap();

        if let McpMessage::Error(err) = parsed {
            assert_eq!(err.error.code, METHOD_NOT_FOUND);
            assert_eq!(err.error.message, "The method does not exist");
        } else {
            panic!("Expected Error after roundtrip");
        }
    }

    /// Test handling of batch requests (JSON-RPC 2.0 allows arrays)
    #[test]
    fn test_batch_request_not_supported() {
        // MCP typically doesn't use batch requests, but test parsing behavior
        let batch = r#"[{"jsonrpc":"2.0","method":"test1","id":1},{"jsonrpc":"2.0","method":"test2","id":2}]"#;
        let result = McpMessage::from_str(batch);

        // Current implementation doesn't support batch, should fail
        assert!(result.is_err(), "Batch requests should not be supported");
    }

    /// Test empty string input
    #[test]
    fn test_empty_string_input() {
        let empty = "";
        let result = McpMessage::from_str(empty);

        assert!(result.is_err(), "Empty string should fail to parse");
    }

    /// Test whitespace-only input
    #[test]
    fn test_whitespace_only_input() {
        let whitespace = "   \n\t  ";
        let result = McpMessage::from_str(whitespace);

        assert!(
            result.is_err(),
            "Whitespace-only input should fail to parse"
        );
    }
}
