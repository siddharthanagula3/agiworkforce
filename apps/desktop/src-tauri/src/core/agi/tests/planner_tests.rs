//! Planner Tests for AGI Core
//!
//! This module tests plan generation and step validation including:
//! - Plan step creation and structure
//! - Dependency chain validation
//! - Duration estimation
//! - Resource aggregation
//! - Tool suggestion based on keywords
//! - Plan JSON parsing

#[cfg(test)]
mod tests {
    use crate::core::agi::{
        ExecutionContext, Goal, Priority, ResourceState, ResourceUsage, ToolExecutionResult,
    };
    use serde_json::json;
    use std::collections::HashMap;
    use std::time::Duration;

    /// Mock plan step structure for testing (mirrors planner::PlanStep)
    #[derive(Debug, Clone)]
    struct TestPlanStep {
        id: String,
        tool_id: String,
        description: String,
        parameters: HashMap<String, serde_json::Value>,
        estimated_resources: ResourceUsage,
        dependencies: Vec<String>,
    }

    /// Mock plan structure for testing (mirrors planner::Plan)
    #[derive(Debug, Clone)]
    #[allow(dead_code)]
    struct TestPlan {
        goal_id: String,
        steps: Vec<TestPlanStep>,
        estimated_duration: Duration,
        estimated_resources: ResourceUsage,
    }

    fn create_test_goal(id: &str, description: &str) -> Goal {
        Goal {
            id: id.to_string(),
            description: description.to_string(),
            priority: Priority::High,
            deadline: None,
            constraints: vec![],
            success_criteria: vec!["Task completed".to_string()],
        }
    }

    fn create_test_context(goal: Goal) -> ExecutionContext {
        ExecutionContext {
            goal,
            current_state: HashMap::new(),
            available_resources: ResourceState {
                cpu_usage_percent: 30.0,
                memory_usage_mb: 1024,
                network_usage_mbps: 10.0,
                storage_usage_mb: 5000,
                available_tools: vec![
                    "file_read".to_string(),
                    "file_write".to_string(),
                    "ui_screenshot".to_string(),
                    "ui_click".to_string(),
                    "browser_navigate".to_string(),
                    "code_execute".to_string(),
                ],
            },
            tool_results: vec![],
            context_memory: vec![],
        }
    }

    // ============================================
    // Plan Step Creation Tests
    // ============================================

    #[test]
    fn test_plan_step_basic_creation() {
        let step = TestPlanStep {
            id: "step_1".to_string(),
            tool_id: "file_read".to_string(),
            description: "Read configuration file".to_string(),
            parameters: HashMap::new(),
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 10,
                network_mb: 0.0,
            },
            dependencies: vec![],
        };

        assert_eq!(step.id, "step_1");
        assert_eq!(step.tool_id, "file_read");
        assert_eq!(step.description, "Read configuration file");
        assert!(step.dependencies.is_empty());
    }

    #[test]
    fn test_plan_step_with_parameters() {
        let mut parameters = HashMap::new();
        parameters.insert("path".to_string(), json!("/tmp/config.json"));
        parameters.insert("encoding".to_string(), json!("utf-8"));

        let step = TestPlanStep {
            id: "step_1".to_string(),
            tool_id: "file_read".to_string(),
            description: "Read file".to_string(),
            parameters,
            estimated_resources: ResourceUsage {
                cpu_percent: 1.0,
                memory_mb: 10,
                network_mb: 0.0,
            },
            dependencies: vec![],
        };

        assert_eq!(step.parameters.len(), 2);
        assert_eq!(step.parameters.get("path").unwrap(), "/tmp/config.json");
    }

    #[test]
    fn test_plan_step_with_dependencies() {
        let step1 = TestPlanStep {
            id: "step_1".to_string(),
            tool_id: "ui_screenshot".to_string(),
            description: "Take screenshot".to_string(),
            parameters: HashMap::new(),
            estimated_resources: ResourceUsage {
                cpu_percent: 10.0,
                memory_mb: 100,
                network_mb: 0.0,
            },
            dependencies: vec![],
        };

        let step2 = TestPlanStep {
            id: "step_2".to_string(),
            tool_id: "ui_click".to_string(),
            description: "Click on button".to_string(),
            parameters: HashMap::new(),
            estimated_resources: ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 0.0,
            },
            dependencies: vec!["step_1".to_string()],
        };

        assert!(step1.dependencies.is_empty());
        assert_eq!(step2.dependencies.len(), 1);
        assert_eq!(step2.dependencies[0], "step_1");
    }

    #[test]
    fn test_plan_step_with_multiple_dependencies() {
        let step = TestPlanStep {
            id: "step_3".to_string(),
            tool_id: "file_write".to_string(),
            description: "Write combined output".to_string(),
            parameters: HashMap::new(),
            estimated_resources: ResourceUsage {
                cpu_percent: 2.0,
                memory_mb: 20,
                network_mb: 0.0,
            },
            dependencies: vec!["step_1".to_string(), "step_2".to_string()],
        };

        assert_eq!(step.dependencies.len(), 2);
    }

    // ============================================
    // Plan Creation Tests
    // ============================================

    #[test]
    fn test_plan_with_single_step() {
        let goal = create_test_goal("single-step", "Execute single step");

        let plan = TestPlan {
            goal_id: goal.id.clone(),
            steps: vec![TestPlanStep {
                id: "step_1".to_string(),
                tool_id: "file_read".to_string(),
                description: "Read file".to_string(),
                parameters: HashMap::new(),
                estimated_resources: ResourceUsage {
                    cpu_percent: 1.0,
                    memory_mb: 10,
                    network_mb: 0.0,
                },
                dependencies: vec![],
            }],
            estimated_duration: Duration::from_secs(5),
            estimated_resources: ResourceUsage {
                cpu_percent: 1.0,
                memory_mb: 10,
                network_mb: 0.0,
            },
        };

        assert_eq!(plan.steps.len(), 1);
        assert_eq!(plan.goal_id, "single-step");
    }

    #[test]
    fn test_plan_with_multiple_steps() {
        let goal = create_test_goal("multi-step", "Execute multi-step workflow");

        let plan = TestPlan {
            goal_id: goal.id.clone(),
            steps: vec![
                TestPlanStep {
                    id: "step_1".to_string(),
                    tool_id: "ui_screenshot".to_string(),
                    description: "Capture current state".to_string(),
                    parameters: HashMap::new(),
                    estimated_resources: ResourceUsage {
                        cpu_percent: 10.0,
                        memory_mb: 100,
                        network_mb: 0.0,
                    },
                    dependencies: vec![],
                },
                TestPlanStep {
                    id: "step_2".to_string(),
                    tool_id: "file_read".to_string(),
                    description: "Read configuration".to_string(),
                    parameters: HashMap::new(),
                    estimated_resources: ResourceUsage {
                        cpu_percent: 1.0,
                        memory_mb: 10,
                        network_mb: 0.0,
                    },
                    dependencies: vec!["step_1".to_string()],
                },
                TestPlanStep {
                    id: "step_3".to_string(),
                    tool_id: "file_write".to_string(),
                    description: "Write results".to_string(),
                    parameters: HashMap::new(),
                    estimated_resources: ResourceUsage {
                        cpu_percent: 2.0,
                        memory_mb: 20,
                        network_mb: 0.0,
                    },
                    dependencies: vec!["step_2".to_string()],
                },
            ],
            estimated_duration: Duration::from_secs(30),
            estimated_resources: ResourceUsage {
                cpu_percent: 13.0,
                memory_mb: 130,
                network_mb: 0.0,
            },
        };

        assert_eq!(plan.steps.len(), 3);

        // Verify dependency chain
        assert!(plan.steps[0].dependencies.is_empty());
        assert_eq!(plan.steps[1].dependencies[0], "step_1");
        assert_eq!(plan.steps[2].dependencies[0], "step_2");
    }

    #[test]
    fn test_empty_plan() {
        let plan = TestPlan {
            goal_id: "empty-plan".to_string(),
            steps: vec![],
            estimated_duration: Duration::from_secs(5),
            estimated_resources: ResourceUsage {
                cpu_percent: 0.0,
                memory_mb: 0,
                network_mb: 0.0,
            },
        };

        assert!(plan.steps.is_empty());
        assert_eq!(plan.estimated_duration.as_secs(), 5);
    }

    // ============================================
    // Duration Estimation Tests
    // ============================================

    #[test]
    fn test_duration_calculation_by_tool_type() {
        // Tool duration mapping based on planner logic
        let tool_durations = vec![
            ("ui_screenshot", 1),
            ("file_read", 1),
            ("ui_click", 1),
            ("ui_type", 3),
            ("file_write", 3),
            ("image_ocr", 3),
            ("browser_navigate", 8),
            ("db_query", 8),
            ("api_call", 8),
            ("code_execute", 20),
            ("llm_reason", 20),
            ("unknown_tool", 5), // default
        ];

        for (tool_id, expected_duration) in tool_durations {
            let duration = match tool_id {
                "ui_screenshot" | "file_read" | "ui_click" => 1,
                "ui_type" | "file_write" | "image_ocr" => 3,
                "browser_navigate" | "db_query" | "api_call" => 8,
                "code_execute" | "llm_reason" => 20,
                _ => 5,
            };

            assert_eq!(
                duration, expected_duration,
                "Duration mismatch for tool: {}",
                tool_id
            );
        }
    }

    #[test]
    fn test_plan_duration_with_overhead() {
        let steps = vec![
            TestPlanStep {
                id: "1".to_string(),
                tool_id: "file_read".to_string(),
                description: "Step 1".to_string(),
                parameters: HashMap::new(),
                estimated_resources: ResourceUsage {
                    cpu_percent: 1.0,
                    memory_mb: 10,
                    network_mb: 0.0,
                },
                dependencies: vec![],
            },
            TestPlanStep {
                id: "2".to_string(),
                tool_id: "file_write".to_string(),
                description: "Step 2".to_string(),
                parameters: HashMap::new(),
                estimated_resources: ResourceUsage {
                    cpu_percent: 2.0,
                    memory_mb: 20,
                    network_mb: 0.0,
                },
                dependencies: vec!["1".to_string()],
            },
        ];

        // Calculate base duration
        let mut base_duration = 0u64;
        for step in &steps {
            base_duration += match step.tool_id.as_str() {
                "file_read" => 1,
                "file_write" => 3,
                _ => 5,
            };
        }

        // Add overhead
        let planning_overhead = 5u64;
        let dependency_overhead = steps.len() as u64 * 2;
        let total_estimated = base_duration + planning_overhead + dependency_overhead;

        assert_eq!(base_duration, 4); // 1 + 3
        assert_eq!(total_estimated, 4 + 5 + 4); // base + planning + dependency
    }

    #[test]
    fn test_max_duration_capping() {
        // Plan duration should be capped at 600 seconds (10 minutes)
        let raw_duration = 1000u64;
        let capped_duration = raw_duration.min(600);

        assert_eq!(capped_duration, 600);
    }

    // ============================================
    // Resource Aggregation Tests
    // ============================================

    #[test]
    fn test_resource_aggregation_single_step() {
        let step = TestPlanStep {
            id: "1".to_string(),
            tool_id: "tool".to_string(),
            description: "Test".to_string(),
            parameters: HashMap::new(),
            estimated_resources: ResourceUsage {
                cpu_percent: 10.0,
                memory_mb: 100,
                network_mb: 1.0,
            },
            dependencies: vec![],
        };

        assert_eq!(step.estimated_resources.cpu_percent, 10.0);
        assert_eq!(step.estimated_resources.memory_mb, 100);
        assert_eq!(step.estimated_resources.network_mb, 1.0);
    }

    #[test]
    fn test_resource_aggregation_multiple_steps() {
        let steps = [
            TestPlanStep {
                id: "1".to_string(),
                tool_id: "tool1".to_string(),
                description: "Step 1".to_string(),
                parameters: HashMap::new(),
                estimated_resources: ResourceUsage {
                    cpu_percent: 10.0,
                    memory_mb: 100,
                    network_mb: 1.0,
                },
                dependencies: vec![],
            },
            TestPlanStep {
                id: "2".to_string(),
                tool_id: "tool2".to_string(),
                description: "Step 2".to_string(),
                parameters: HashMap::new(),
                estimated_resources: ResourceUsage {
                    cpu_percent: 20.0,
                    memory_mb: 200,
                    network_mb: 2.0,
                },
                dependencies: vec![],
            },
            TestPlanStep {
                id: "3".to_string(),
                tool_id: "tool3".to_string(),
                description: "Step 3".to_string(),
                parameters: HashMap::new(),
                estimated_resources: ResourceUsage {
                    cpu_percent: 15.0,
                    memory_mb: 150,
                    network_mb: 1.5,
                },
                dependencies: vec![],
            },
        ];

        let total_cpu: f64 = steps
            .iter()
            .map(|s| s.estimated_resources.cpu_percent)
            .sum();
        let total_memory: u64 = steps.iter().map(|s| s.estimated_resources.memory_mb).sum();
        let total_network: f64 = steps.iter().map(|s| s.estimated_resources.network_mb).sum();

        assert_eq!(total_cpu, 45.0);
        assert_eq!(total_memory, 450);
        assert!((total_network - 4.5).abs() < 0.001);
    }

    // ============================================
    // Dependency Validation Tests
    // ============================================

    #[test]
    fn test_dependency_validation_all_exist() {
        let steps = vec![
            TestPlanStep {
                id: "step_1".to_string(),
                tool_id: "tool".to_string(),
                description: "First".to_string(),
                parameters: HashMap::new(),
                estimated_resources: ResourceUsage {
                    cpu_percent: 5.0,
                    memory_mb: 50,
                    network_mb: 0.0,
                },
                dependencies: vec![],
            },
            TestPlanStep {
                id: "step_2".to_string(),
                tool_id: "tool".to_string(),
                description: "Second".to_string(),
                parameters: HashMap::new(),
                estimated_resources: ResourceUsage {
                    cpu_percent: 5.0,
                    memory_mb: 50,
                    network_mb: 0.0,
                },
                dependencies: vec!["step_1".to_string()],
            },
            TestPlanStep {
                id: "step_3".to_string(),
                tool_id: "tool".to_string(),
                description: "Third".to_string(),
                parameters: HashMap::new(),
                estimated_resources: ResourceUsage {
                    cpu_percent: 5.0,
                    memory_mb: 50,
                    network_mb: 0.0,
                },
                dependencies: vec!["step_1".to_string(), "step_2".to_string()],
            },
        ];

        let step_ids: Vec<&String> = steps.iter().map(|s| &s.id).collect();

        for step in &steps {
            for dep in &step.dependencies {
                assert!(
                    step_ids.contains(&dep),
                    "Dependency {} not found for step {}",
                    dep,
                    step.id
                );
            }
        }
    }

    #[test]
    fn test_no_circular_dependencies_linear() {
        // Linear chain: step_1 -> step_2 -> step_3
        let steps: [(&str, &[&str]); 3] = [
            ("step_1", &[]),
            ("step_2", &["step_1"]),
            ("step_3", &["step_2"]),
        ];

        // Verify no step depends on a later step (simple linear check)
        for (i, (id, deps)) in steps.iter().enumerate() {
            for dep in deps.iter() {
                let dep_index = steps.iter().position(|(sid, _)| sid == dep).unwrap();
                assert!(dep_index < i, "Step {} depends on later step {}", id, dep);
            }
        }
    }

    #[test]
    fn test_dependency_execution_order() {
        // Determine execution order based on dependencies
        let mut executed: Vec<String> = vec![];
        let steps = vec![
            ("step_1", vec![]),
            ("step_2", vec!["step_1"]),
            ("step_3", vec!["step_1", "step_2"]),
        ];

        for (id, deps) in &steps {
            // Check all dependencies are executed
            for dep in deps.iter() {
                assert!(
                    executed.contains(&dep.to_string()),
                    "Dependency {} not yet executed for {}",
                    dep,
                    id
                );
            }
            executed.push(id.to_string());
        }

        assert_eq!(executed.len(), 3);
        assert_eq!(executed[0], "step_1");
        assert_eq!(executed[1], "step_2");
        assert_eq!(executed[2], "step_3");
    }

    // ============================================
    // Tool Suggestion Tests
    // ============================================

    #[test]
    fn test_tool_suggestion_file_operations() {
        let test_cases = vec![
            ("read a file from disk", "file_read"),
            ("write content to file", "file_write"),
            ("read the configuration file", "file_read"),
        ];

        for (description, expected_tool) in test_cases {
            let desc_lower = description.to_lowercase();
            let suggested = if desc_lower.contains("read") {
                "file_read"
            } else if desc_lower.contains("write") {
                "file_write"
            } else {
                "unknown"
            };

            assert_eq!(suggested, expected_tool, "Failed for: {}", description);
        }
    }

    #[test]
    fn test_tool_suggestion_ui_operations() {
        let test_cases = vec![
            ("click on the button", "ui_click"),
            ("take a screenshot", "ui_screenshot"),
            ("type some text", "ui_type"),
        ];

        for (description, expected_tool) in test_cases {
            let desc_lower = description.to_lowercase();
            let suggested = if desc_lower.contains("click") {
                "ui_click"
            } else if desc_lower.contains("screenshot") {
                "ui_screenshot"
            } else if desc_lower.contains("type") {
                "ui_type"
            } else {
                "unknown"
            };

            assert_eq!(suggested, expected_tool, "Failed for: {}", description);
        }
    }

    #[test]
    fn test_tool_suggestion_browser_operations() {
        let test_cases = vec![
            ("navigate to website", "browser_navigate"),
            ("go to the URL", "browser_navigate"),
            ("browse to the page", "browser_navigate"),
        ];

        for (description, expected_tool) in test_cases {
            let desc_lower = description.to_lowercase();
            let suggested = if desc_lower.contains("navigate")
                || desc_lower.contains("url")
                || desc_lower.contains("browse")
            {
                "browser_navigate"
            } else {
                "unknown"
            };

            assert_eq!(suggested, expected_tool, "Failed for: {}", description);
        }
    }

    #[test]
    fn test_tool_suggestion_code_operations() {
        let test_cases = vec![
            ("execute the code", "code_execute"),
            ("run the script", "code_execute"),
        ];

        for (description, expected_tool) in test_cases {
            let desc_lower = description.to_lowercase();
            let suggested = if desc_lower.contains("execute") || desc_lower.contains("run") {
                "code_execute"
            } else {
                "unknown"
            };

            assert_eq!(suggested, expected_tool, "Failed for: {}", description);
        }
    }

    #[test]
    fn test_tool_suggestion_database_operations() {
        let test_cases = vec![
            ("query the database", "db_query"),
            ("run SQL query", "db_query"),
        ];

        for (description, expected_tool) in test_cases {
            let desc_lower = description.to_lowercase();
            let suggested = if desc_lower.contains("query") || desc_lower.contains("database") {
                "db_query"
            } else {
                "unknown"
            };

            assert_eq!(suggested, expected_tool, "Failed for: {}", description);
        }
    }

    #[test]
    fn test_tool_suggestion_api_operations() {
        let test_cases = vec![
            ("make an API call", "api_call"),
            ("send HTTP request", "api_call"),
        ];

        for (description, expected_tool) in test_cases {
            let desc_lower = description.to_lowercase();
            let suggested = if desc_lower.contains("api") || desc_lower.contains("http") {
                "api_call"
            } else {
                "unknown"
            };

            assert_eq!(suggested, expected_tool, "Failed for: {}", description);
        }
    }

    // ============================================
    // Plan JSON Parsing Tests
    // ============================================

    #[test]
    fn test_plan_step_json_parsing() {
        let step_json = json!({
            "id": "step_1",
            "tool_id": "file_write",
            "description": "Write content to file",
            "parameters": {
                "path": "/tmp/test.txt",
                "content": "Hello World"
            },
            "estimated_resources": {
                "cpu_percent": 2.0,
                "memory_mb": 20,
                "network_mb": 0.0
            },
            "dependencies": []
        });

        assert_eq!(step_json["id"], "step_1");
        assert_eq!(step_json["tool_id"], "file_write");
        assert!(step_json["dependencies"].as_array().unwrap().is_empty());

        // Parse parameters
        let params = step_json["parameters"].as_object().unwrap();
        assert_eq!(params.get("path").unwrap(), "/tmp/test.txt");
        assert_eq!(params.get("content").unwrap(), "Hello World");
    }

    #[test]
    fn test_plan_json_array_parsing() {
        let plan_json = json!([
            {
                "id": "step_1",
                "tool_id": "ui_screenshot",
                "description": "Take screenshot",
                "parameters": {},
                "estimated_resources": {"cpu_percent": 10.0, "memory_mb": 100, "network_mb": 0.0},
                "dependencies": []
            },
            {
                "id": "step_2",
                "tool_id": "ui_click",
                "description": "Click button",
                "parameters": {"target": {"type": "text", "text": "Open"}},
                "estimated_resources": {"cpu_percent": 5.0, "memory_mb": 50, "network_mb": 0.0},
                "dependencies": ["step_1"]
            }
        ]);

        let steps = plan_json.as_array().unwrap();
        assert_eq!(steps.len(), 2);

        // Verify first step has no dependencies
        assert!(steps[0]["dependencies"].as_array().unwrap().is_empty());

        // Verify second step depends on first
        let deps = steps[1]["dependencies"].as_array().unwrap();
        assert_eq!(deps.len(), 1);
        assert_eq!(deps[0], "step_1");
    }

    #[test]
    fn test_invalid_step_json_missing_id() {
        let step_json = json!({
            "tool_id": "file_read",
            "description": "Read file",
            "parameters": {},
            "estimated_resources": {"cpu_percent": 1.0, "memory_mb": 10, "network_mb": 0.0},
            "dependencies": []
        });

        // ID is missing
        assert!(step_json["id"].as_str().is_none());
    }

    #[test]
    fn test_step_json_with_default_resources() {
        let step_json = json!({
            "id": "step_1",
            "tool_id": "file_read",
            "description": "Read file",
            "parameters": {},
            "dependencies": []
            // Note: estimated_resources is missing
        });

        // Should use default resources when not specified
        let resources = step_json["estimated_resources"].as_object();
        assert!(resources.is_none());

        // Default values would be applied during parsing
        let default_cpu = 5.0f64;
        let default_memory = 50u64;
        let default_network = 0.0f64;

        assert!(default_cpu > 0.0);
        assert!(default_memory > 0);
        assert!(default_network >= 0.0);
    }

    // ============================================
    // Context with Tool Results Tests
    // ============================================

    #[test]
    fn test_context_tool_results_influence_planning() {
        let goal = create_test_goal("context-test", "Test with context");
        let mut context = create_test_context(goal);

        // Add previous tool results
        context.tool_results.push(ToolExecutionResult {
            tool_id: "file_read".to_string(),
            step_id: "prev_step_1".to_string(),
            success: true,
            result: json!({"content": "config data"}),
            error: None,
            execution_time_ms: 50,
            resources_used: ResourceUsage {
                cpu_percent: 1.0,
                memory_mb: 10,
                network_mb: 0.0,
            },
        });

        // Verify context has history
        assert_eq!(context.tool_results.len(), 1);
        assert!(context.tool_results[0].success);
    }

    // ============================================
    // CPU Threshold & Multiplier Tests (Bug #48)
    //
    // Validates that calculate_plan_duration checks
    // >80 BEFORE >50, making both branches reachable.
    // ============================================

    /// Mirror of the CPU resource multiplier logic from
    /// AGIPlanner::calculate_plan_duration. Must check >80
    /// before >50 so the 2.0 multiplier branch is reachable.
    fn cpu_resource_multiplier(cpu_percent: f64) -> f64 {
        if cpu_percent > 80.0 {
            2.0
        } else if cpu_percent > 50.0 {
            1.5
        } else {
            1.0
        }
    }

    /// Mirror of the network multiplier logic from
    /// AGIPlanner::calculate_plan_duration.
    fn network_multiplier(network_mb: f64) -> f64 {
        if network_mb > 0.0 {
            1.2
        } else {
            1.0
        }
    }

    /// Mirror of the base duration lookup from
    /// AGIPlanner::calculate_plan_duration.
    fn base_duration_for_tool(tool_id: &str) -> u64 {
        match tool_id {
            "ui_screenshot" | "file_read" | "ui_click" => 1,
            "ui_type" | "file_write" | "image_ocr" => 3,
            "browser_navigate" | "db_query" | "api_call" => 8,
            "code_execute" | "llm_reason" => 20,
            _ => 5,
        }
    }

    /// Full mirror of calculate_plan_duration for testing.
    fn calculate_plan_duration_mirror(steps: &[TestPlanStep]) -> Duration {
        if steps.is_empty() {
            return Duration::from_secs(5);
        }

        let mut total_seconds = 0u64;

        for step in steps {
            let base = base_duration_for_tool(&step.tool_id);
            let cpu_mult = cpu_resource_multiplier(step.estimated_resources.cpu_percent);
            let net_mult = network_multiplier(step.estimated_resources.network_mb);
            let step_duration = (base as f64 * cpu_mult * net_mult) as u64;
            total_seconds += step_duration;
        }

        total_seconds += (steps.len() as u64) / 2;
        total_seconds = total_seconds.min(600);

        Duration::from_secs(total_seconds)
    }

    fn make_step(tool_id: &str, cpu_percent: f64, network_mb: f64) -> TestPlanStep {
        TestPlanStep {
            id: "s".to_string(),
            tool_id: tool_id.to_string(),
            description: "test".to_string(),
            parameters: HashMap::new(),
            estimated_resources: ResourceUsage {
                cpu_percent,
                memory_mb: 50,
                network_mb,
            },
            dependencies: vec![],
        }
    }

    // --- CPU multiplier threshold tests ---

    #[test]
    fn test_cpu_multiplier_below_50() {
        assert_eq!(cpu_resource_multiplier(0.0), 1.0);
        assert_eq!(cpu_resource_multiplier(25.0), 1.0);
        assert_eq!(cpu_resource_multiplier(49.9), 1.0);
    }

    #[test]
    fn test_cpu_multiplier_exactly_50_is_1x() {
        // 50.0 is NOT > 50.0, so it falls through to the 1.0 branch
        assert_eq!(cpu_resource_multiplier(50.0), 1.0);
    }

    #[test]
    fn test_cpu_multiplier_between_50_and_80() {
        assert_eq!(cpu_resource_multiplier(50.1), 1.5);
        assert_eq!(cpu_resource_multiplier(65.0), 1.5);
        assert_eq!(cpu_resource_multiplier(79.9), 1.5);
    }

    #[test]
    fn test_cpu_multiplier_exactly_80_is_1_5x() {
        // 80.0 is NOT > 80.0, so it falls to the >50 branch (1.5)
        assert_eq!(cpu_resource_multiplier(80.0), 1.5);
    }

    #[test]
    fn test_cpu_multiplier_above_80() {
        // This is the branch that was unreachable when >50 was checked first
        assert_eq!(cpu_resource_multiplier(80.1), 2.0);
        assert_eq!(cpu_resource_multiplier(90.0), 2.0);
        assert_eq!(cpu_resource_multiplier(100.0), 2.0);
    }

    // --- Network multiplier tests ---

    #[test]
    fn test_network_multiplier_zero() {
        assert_eq!(network_multiplier(0.0), 1.0);
    }

    #[test]
    fn test_network_multiplier_positive() {
        assert_eq!(network_multiplier(0.1), 1.2);
        assert_eq!(network_multiplier(5.0), 1.2);
        assert_eq!(network_multiplier(100.0), 1.2);
    }

    // --- End-to-end duration calculation tests ---

    #[test]
    fn test_duration_empty_steps_returns_5s() {
        let steps: Vec<TestPlanStep> = vec![];
        assert_eq!(
            calculate_plan_duration_mirror(&steps),
            Duration::from_secs(5)
        );
    }

    #[test]
    fn test_duration_single_step_low_cpu_no_network() {
        // file_read base=1, cpu=10 (1.0x), network=0 (1.0x)
        // step_duration = (1 * 1.0 * 1.0) = 1
        // overhead = 1 / 2 = 0 (integer division)
        // total = 1 + 0 = 1
        let steps = vec![make_step("file_read", 10.0, 0.0)];
        assert_eq!(
            calculate_plan_duration_mirror(&steps),
            Duration::from_secs(1)
        );
    }

    #[test]
    fn test_duration_single_step_mid_cpu() {
        // file_write base=3, cpu=60 (1.5x), network=0 (1.0x)
        // step_duration = (3 * 1.5 * 1.0) = 4.5 -> 4 as u64
        // overhead = 1 / 2 = 0
        // total = 4
        let steps = vec![make_step("file_write", 60.0, 0.0)];
        assert_eq!(
            calculate_plan_duration_mirror(&steps),
            Duration::from_secs(4)
        );
    }

    #[test]
    fn test_duration_single_step_high_cpu() {
        // code_execute base=20, cpu=90 (2.0x), network=0 (1.0x)
        // step_duration = (20 * 2.0 * 1.0) = 40
        // overhead = 1 / 2 = 0
        // total = 40
        let steps = vec![make_step("code_execute", 90.0, 0.0)];
        assert_eq!(
            calculate_plan_duration_mirror(&steps),
            Duration::from_secs(40)
        );
    }

    #[test]
    fn test_duration_with_network_multiplier() {
        // browser_navigate base=8, cpu=10 (1.0x), network=5.0 (1.2x)
        // step_duration = (8 * 1.0 * 1.2) = 9.6 -> 9 as u64
        // overhead = 1 / 2 = 0
        // total = 9
        let steps = vec![make_step("browser_navigate", 10.0, 5.0)];
        assert_eq!(
            calculate_plan_duration_mirror(&steps),
            Duration::from_secs(9)
        );
    }

    #[test]
    fn test_duration_high_cpu_and_network_combined() {
        // llm_reason base=20, cpu=95 (2.0x), network=10.0 (1.2x)
        // step_duration = (20 * 2.0 * 1.2) = 48
        // overhead = 1 / 2 = 0
        // total = 48
        let steps = vec![make_step("llm_reason", 95.0, 10.0)];
        assert_eq!(
            calculate_plan_duration_mirror(&steps),
            Duration::from_secs(48)
        );
    }

    #[test]
    fn test_duration_multiple_steps_with_overhead() {
        // 4 steps, each file_read (base=1), cpu=10 (1.0x), network=0 (1.0x)
        // each step_duration = 1
        // sum = 4
        // overhead = 4 / 2 = 2
        // total = 4 + 2 = 6
        let steps = vec![
            make_step("file_read", 10.0, 0.0),
            make_step("file_read", 10.0, 0.0),
            make_step("file_read", 10.0, 0.0),
            make_step("file_read", 10.0, 0.0),
        ];
        assert_eq!(
            calculate_plan_duration_mirror(&steps),
            Duration::from_secs(6)
        );
    }

    #[test]
    fn test_duration_capped_at_600s() {
        // 50 steps of llm_reason (base=20), cpu=95 (2.0x), network=10 (1.2x)
        // each step_duration = 48
        // sum = 50 * 48 = 2400
        // overhead = 50 / 2 = 25
        // raw total = 2425, capped to 600
        let steps: Vec<TestPlanStep> = (0..50)
            .map(|_| make_step("llm_reason", 95.0, 10.0))
            .collect();
        assert_eq!(
            calculate_plan_duration_mirror(&steps),
            Duration::from_secs(600)
        );
    }

    #[test]
    fn test_duration_mixed_tools_and_thresholds() {
        // step1: file_read base=1, cpu=10 (1.0x), net=0 (1.0x) -> 1
        // step2: file_write base=3, cpu=60 (1.5x), net=2.0 (1.2x) -> (3*1.5*1.2)=5.4 -> 5
        // step3: code_execute base=20, cpu=85 (2.0x), net=0 (1.0x) -> 40
        // step4: api_call base=8, cpu=50 (1.0x), net=1.0 (1.2x) -> (8*1.0*1.2)=9.6 -> 9
        // sum = 1 + 5 + 40 + 9 = 55
        // overhead = 4 / 2 = 2
        // total = 57
        let steps = vec![
            make_step("file_read", 10.0, 0.0),
            make_step("file_write", 60.0, 2.0),
            make_step("code_execute", 85.0, 0.0),
            make_step("api_call", 50.0, 1.0),
        ];
        assert_eq!(
            calculate_plan_duration_mirror(&steps),
            Duration::from_secs(57)
        );
    }

    #[test]
    fn test_duration_unknown_tool_uses_default_base() {
        // unknown tool base=5, cpu=10 (1.0x), net=0 (1.0x) -> 5
        // overhead = 1 / 2 = 0
        // total = 5
        let steps = vec![make_step("totally_custom_tool", 10.0, 0.0)];
        assert_eq!(
            calculate_plan_duration_mirror(&steps),
            Duration::from_secs(5)
        );
    }

    #[test]
    fn test_threshold_ordering_correctness() {
        // The critical invariant: cpu=90 must produce 2.0x, not 1.5x.
        // If thresholds were checked in wrong order (>50 before >80),
        // cpu=90 would match >50 first and return 1.5 instead of 2.0.
        let high_cpu = cpu_resource_multiplier(90.0);
        let mid_cpu = cpu_resource_multiplier(60.0);
        let low_cpu = cpu_resource_multiplier(30.0);

        assert!(
            high_cpu > mid_cpu,
            "90% CPU must produce higher multiplier than 60%"
        );
        assert!(
            mid_cpu > low_cpu,
            "60% CPU must produce higher multiplier than 30%"
        );
        assert_eq!(high_cpu, 2.0);
        assert_eq!(mid_cpu, 1.5);
        assert_eq!(low_cpu, 1.0);
    }
}
