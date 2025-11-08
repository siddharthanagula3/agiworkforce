#[cfg(test)]
mod tests {
    use crate::agi::{Tool, ToolCapability};
    use serde_json::json;

    fn create_test_tool(id: &str, name: &str) -> Tool {
        Tool {
            id: id.to_string(),
            name: name.to_string(),
            description: format!("Test tool: {}", name),
            category: "test".to_string(),
            capabilities: vec![ToolCapability::FileSystem],
            parameters: json!({
                "path": {
                    "type": "string",
                    "required": true
                }
            }),
            examples: vec![],
            cost_estimate_ms: 100,
        }
    }

    #[test]
    fn test_tool_creation() {
        let tool = create_test_tool("file_read", "File Read");

        assert_eq!(tool.id, "file_read");
        assert_eq!(tool.name, "File Read");
        assert_eq!(tool.category, "test");
        assert_eq!(tool.capabilities.len(), 1);
        assert_eq!(tool.cost_estimate_ms, 100);
    }

    #[test]
    fn test_tool_serialization() {
        let tool = create_test_tool("test_tool", "Test Tool");
        let serialized = serde_json::to_string(&tool).unwrap();
        let deserialized: Tool = serde_json::from_str(&serialized).unwrap();

        assert_eq!(tool.id, deserialized.id);
        assert_eq!(tool.name, deserialized.name);
        assert_eq!(tool.description, deserialized.description);
    }

    #[test]
    fn test_tool_capability_filesystem() {
        let capability = ToolCapability::FileSystem;
        let serialized = serde_json::to_string(&capability).unwrap();
        assert!(serialized.contains("FileSystem"));
    }

    #[test]
    fn test_tool_capability_browser() {
        let capability = ToolCapability::Browser;
        let serialized = serde_json::to_string(&capability).unwrap();
        assert!(serialized.contains("Browser"));
    }

    #[test]
    fn test_tool_capability_automation() {
        let capability = ToolCapability::Automation;
        let serialized = serde_json::to_string(&capability).unwrap();
        assert!(serialized.contains("Automation"));
    }

    #[test]
    fn test_tool_capability_database() {
        let capability = ToolCapability::Database;
        let serialized = serde_json::to_string(&capability).unwrap();
        assert!(serialized.contains("Database"));
    }

    #[test]
    fn test_tool_capability_api() {
        let capability = ToolCapability::API;
        let serialized = serde_json::to_string(&capability).unwrap();
        assert!(serialized.contains("API"));
    }

    #[test]
    fn test_tool_with_multiple_capabilities() {
        let tool = Tool {
            id: "multi_tool".to_string(),
            name: "Multi Tool".to_string(),
            description: "Tool with multiple capabilities".to_string(),
            category: "advanced".to_string(),
            capabilities: vec![
                ToolCapability::FileSystem,
                ToolCapability::Browser,
                ToolCapability::API,
            ],
            parameters: json!({}),
            examples: vec![],
            cost_estimate_ms: 500,
        };

        assert_eq!(tool.capabilities.len(), 3);
        assert!(tool.capabilities.contains(&ToolCapability::FileSystem));
        assert!(tool.capabilities.contains(&ToolCapability::Browser));
        assert!(tool.capabilities.contains(&ToolCapability::API));
    }

    #[test]
    fn test_tool_parameters_validation() {
        let tool = Tool {
            id: "param_tool".to_string(),
            name: "Parameter Tool".to_string(),
            description: "Tool with parameters".to_string(),
            category: "test".to_string(),
            capabilities: vec![ToolCapability::FileSystem],
            parameters: json!({
                "path": {
                    "type": "string",
                    "required": true,
                    "description": "File path"
                },
                "mode": {
                    "type": "string",
                    "required": false,
                    "default": "read"
                }
            }),
            examples: vec![json!({"path": "/test/file.txt", "mode": "read"})],
            cost_estimate_ms: 200,
        };

        assert!(tool.parameters.is_object());
        assert!(tool.parameters.get("path").is_some());
        assert!(tool.parameters.get("mode").is_some());
        assert_eq!(tool.examples.len(), 1);
    }

    #[test]
    fn test_tool_cost_estimation() {
        let fast_tool = create_test_tool("fast", "Fast Tool");
        let slow_tool = Tool {
            id: "slow".to_string(),
            name: "Slow Tool".to_string(),
            description: "Slow tool".to_string(),
            category: "test".to_string(),
            capabilities: vec![ToolCapability::Browser],
            parameters: json!({}),
            examples: vec![],
            cost_estimate_ms: 5000,
        };

        assert!(fast_tool.cost_estimate_ms < slow_tool.cost_estimate_ms);
    }

    #[test]
    fn test_tool_result_type() {
        use crate::agi::ToolResult;

        let result = ToolResult::Success {
            data: json!({"status": "completed"}),
        };

        match result {
            ToolResult::Success { data } => {
                assert!(data.is_object());
            }
            _ => panic!("Expected Success variant"),
        }
    }

    #[test]
    fn test_tool_result_error() {
        use crate::agi::ToolResult;

        let result = ToolResult::Error {
            error: "Tool execution failed".to_string(),
            details: Some(json!({"reason": "file not found"})),
        };

        match result {
            ToolResult::Error { error, details } => {
                assert_eq!(error, "Tool execution failed");
                assert!(details.is_some());
            }
            _ => panic!("Expected Error variant"),
        }
    }

    #[test]
    fn test_tool_result_partial() {
        use crate::agi::ToolResult;

        let result = ToolResult::Partial {
            data: json!({"progress": 50}),
            reason: "Still processing".to_string(),
        };

        match result {
            ToolResult::Partial { data, reason } => {
                assert_eq!(reason, "Still processing");
                assert!(data.get("progress").is_some());
            }
            _ => panic!("Expected Partial variant"),
        }
    }

    #[test]
    fn test_tool_examples() {
        let tool = Tool {
            id: "example_tool".to_string(),
            name: "Example Tool".to_string(),
            description: "Tool with examples".to_string(),
            category: "demo".to_string(),
            capabilities: vec![ToolCapability::FileSystem],
            parameters: json!({}),
            examples: vec![
                json!({"path": "/test1.txt"}),
                json!({"path": "/test2.txt"}),
                json!({"path": "/test3.txt"}),
            ],
            cost_estimate_ms: 150,
        };

        assert_eq!(tool.examples.len(), 3);
        assert!(tool.examples[0].get("path").is_some());
    }

    #[test]
    fn test_tool_category_grouping() {
        let tools = vec![
            create_test_tool("tool1", "Tool 1"),
            Tool {
                id: "tool2".to_string(),
                name: "Tool 2".to_string(),
                description: "Test".to_string(),
                category: "browser".to_string(),
                capabilities: vec![],
                parameters: json!({}),
                examples: vec![],
                cost_estimate_ms: 100,
            },
            create_test_tool("tool3", "Tool 3"),
        ];

        let test_category: Vec<_> = tools.iter().filter(|t| t.category == "test").collect();
        let browser_category: Vec<_> = tools.iter().filter(|t| t.category == "browser").collect();

        assert_eq!(test_category.len(), 2);
        assert_eq!(browser_category.len(), 1);
    }
}
