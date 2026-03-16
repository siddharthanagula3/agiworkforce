// H18 — Task planner tests.
//
// `TaskPlanner` wraps an LLMRouter for the `plan_task()` call, which
// requires live network.  But `parse_plan_response()` (and therefore
// `parse_plan` / `parse_step` / `parse_action` / `parse_click_target`)
// is a pure JSON-parsing method that can be called on a planner built
// with an Arc<RwLock<LLMRouter>>.
//
// Strategy:
//  • Build a minimal `TaskPlanner` using `LLMRouter::new()` (no API keys needed
//    — the router itself compiles fine; we never call send_message in these tests).
//  • Call `parse_plan_response()` with realistic JSON strings and assert that
//    the resulting `TaskStep` / `Action` fields are correct.
//  • Mark tests that would need a live LLM with `#[ignore]`.
#[cfg(test)]
mod tests {
    use crate::core::agent::planner::TaskPlanner;
    use crate::core::agent::{Action, ClickTarget, ScrollDirection};
    use crate::core::llm::LLMRouter;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    // ------------------------------------------------------------------
    // Helper: build a TaskPlanner without needing AppHandle or network
    // ------------------------------------------------------------------

    fn make_planner() -> TaskPlanner {
        let router = Arc::new(RwLock::new(LLMRouter::new()));
        TaskPlanner::new(router).expect("TaskPlanner::new must not fail")
    }

    // ------------------------------------------------------------------
    // parse_plan_response — valid JSON arrays
    // ------------------------------------------------------------------

    #[test]
    fn test_parse_plan_response_screenshot_step() {
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_1",
                "action": {"type": "Screenshot", "region": null},
                "description": "Take a screenshot",
                "expected_result": "Screenshot captured",
                "timeout": 5,
                "retry_on_failure": false
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        assert_eq!(steps.len(), 1);
        assert_eq!(steps[0].id, "step_1");
        assert_eq!(steps[0].description, "Take a screenshot");
        assert_eq!(
            steps[0].expected_result.as_deref(),
            Some("Screenshot captured")
        );
        assert!(!steps[0].retry_on_failure);
        assert!(matches!(
            steps[0].action,
            Action::Screenshot { region: None }
        ));
    }

    #[test]
    fn test_parse_plan_response_navigate_step() {
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_2",
                "action": {"type": "Navigate", "url": "https://example.com"},
                "description": "Open the website",
                "timeout": 15,
                "retry_on_failure": true
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        assert_eq!(steps.len(), 1);
        if let Action::Navigate { url } = &steps[0].action {
            assert_eq!(url, "https://example.com");
        } else {
            panic!("Expected Navigate action");
        }
        assert!(steps[0].retry_on_failure);
    }

    #[test]
    fn test_parse_plan_response_execute_command_step() {
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_3",
                "action": {
                    "type": "ExecuteCommand",
                    "command": "echo",
                    "args": ["hello", "world"]
                },
                "description": "Run echo",
                "timeout": 10,
                "retry_on_failure": false
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        if let Action::ExecuteCommand { command, args } = &steps[0].action {
            assert_eq!(command, "echo");
            assert_eq!(args, &["hello", "world"]);
        } else {
            panic!("Expected ExecuteCommand");
        }
    }

    #[test]
    fn test_parse_plan_response_read_file_step() {
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_4",
                "action": {"type": "ReadFile", "path": "/tmp/data.txt"},
                "description": "Read the data file",
                "timeout": 5,
                "retry_on_failure": false
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        if let Action::ReadFile { path } = &steps[0].action {
            assert_eq!(path, "/tmp/data.txt");
        } else {
            panic!("Expected ReadFile");
        }
    }

    #[test]
    fn test_parse_plan_response_write_file_step() {
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_5",
                "action": {
                    "type": "WriteFile",
                    "path": "/tmp/out.txt",
                    "content": "hello world"
                },
                "description": "Write output",
                "timeout": 5,
                "retry_on_failure": false
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        if let Action::WriteFile { path, content } = &steps[0].action {
            assert_eq!(path, "/tmp/out.txt");
            assert_eq!(content, "hello world");
        } else {
            panic!("Expected WriteFile");
        }
    }

    #[test]
    fn test_parse_plan_response_search_text_step() {
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_6",
                "action": {"type": "SearchText", "query": "Submit Button"},
                "description": "Find the submit button",
                "timeout": 10,
                "retry_on_failure": true
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        if let Action::SearchText { query } = &steps[0].action {
            assert_eq!(query, "Submit Button");
        } else {
            panic!("Expected SearchText");
        }
    }

    #[test]
    fn test_parse_plan_response_click_with_text_match() {
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_7",
                "action": {
                    "type": "Click",
                    "target": {
                        "type": "TextMatch",
                        "text": "OK",
                        "fuzzy": false
                    }
                },
                "description": "Click OK button",
                "timeout": 5,
                "retry_on_failure": true
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        if let Action::Click { target } = &steps[0].action {
            if let ClickTarget::TextMatch { text, fuzzy } = target {
                assert_eq!(text, "OK");
                assert!(!fuzzy);
            } else {
                panic!("Expected TextMatch target");
            }
        } else {
            panic!("Expected Click action");
        }
    }

    #[test]
    fn test_parse_plan_response_click_with_coordinates() {
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_8",
                "action": {
                    "type": "Click",
                    "target": {"type": "Coordinates", "x": 960, "y": 540}
                },
                "description": "Click center of screen",
                "timeout": 5,
                "retry_on_failure": false
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        if let Action::Click { target } = &steps[0].action {
            if let ClickTarget::Coordinates { x, y } = target {
                assert_eq!(*x, 960);
                assert_eq!(*y, 540);
            } else {
                panic!("Expected Coordinates target");
            }
        } else {
            panic!("Expected Click");
        }
    }

    #[test]
    fn test_parse_plan_response_type_action() {
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_9",
                "action": {
                    "type": "Type",
                    "target": {"type": "Coordinates", "x": 0, "y": 0},
                    "text": "Hello World"
                },
                "description": "Type greeting",
                "timeout": 5,
                "retry_on_failure": true
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        if let Action::Type { text, .. } = &steps[0].action {
            assert_eq!(text, "Hello World");
        } else {
            panic!("Expected Type");
        }
    }

    #[test]
    fn test_parse_plan_response_scroll_down() {
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_10",
                "action": {"type": "Scroll", "direction": "down", "amount": 5},
                "description": "Scroll down",
                "timeout": 3,
                "retry_on_failure": false
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        if let Action::Scroll { direction, amount } = &steps[0].action {
            assert!(matches!(direction, ScrollDirection::Down));
            assert_eq!(*amount, 5);
        } else {
            panic!("Expected Scroll");
        }
    }

    #[test]
    fn test_parse_plan_response_press_key() {
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_11",
                "action": {"type": "PressKey", "keys": ["Enter"]},
                "description": "Press Enter",
                "timeout": 3,
                "retry_on_failure": false
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        if let Action::PressKey { keys } = &steps[0].action {
            assert_eq!(keys, &["Enter"]);
        } else {
            panic!("Expected PressKey");
        }
    }

    #[test]
    fn test_parse_plan_response_multi_step() {
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_1",
                "action": {"type": "Screenshot", "region": null},
                "description": "Take screenshot",
                "timeout": 5,
                "retry_on_failure": false
            },
            {
                "id": "step_2",
                "action": {"type": "Navigate", "url": "https://example.com"},
                "description": "Navigate to site",
                "timeout": 15,
                "retry_on_failure": true
            },
            {
                "id": "step_3",
                "action": {"type": "SearchText", "query": "Login"},
                "description": "Find login",
                "timeout": 10,
                "retry_on_failure": true
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        assert_eq!(steps.len(), 3);
        assert_eq!(steps[0].id, "step_1");
        assert_eq!(steps[1].id, "step_2");
        assert_eq!(steps[2].id, "step_3");
    }

    // ------------------------------------------------------------------
    // parse_plan_response — extracted from LLM response with markdown wrapper
    // ------------------------------------------------------------------

    #[test]
    fn test_parse_plan_response_embedded_in_markdown() {
        let planner = make_planner();
        // The LLM often wraps the JSON in a code block; the parser must strip the preamble.
        let response = r#"
Thinking Process:
I need to take a screenshot first.

```json
[
    {
        "id": "step_1",
        "action": {"type": "Screenshot", "region": null},
        "description": "Take screenshot",
        "timeout": 5,
        "retry_on_failure": false
    }
]
```
        "#;

        let steps = planner.parse_plan_response(response).unwrap();
        assert_eq!(steps.len(), 1);
        assert_eq!(steps[0].id, "step_1");
    }

    // ------------------------------------------------------------------
    // parse_plan_response — error cases
    // ------------------------------------------------------------------

    #[test]
    fn test_parse_plan_response_no_json_array_returns_error() {
        let planner = make_planner();
        let result = planner.parse_plan_response("this is not json");
        assert!(result.is_err(), "Non-JSON input must return an error");
    }

    #[test]
    fn test_parse_plan_response_unknown_action_type_returns_error() {
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_1",
                "action": {"type": "FlyToMoon"},
                "description": "Undefined action",
                "timeout": 5,
                "retry_on_failure": false
            }
        ]"#;
        let result = planner.parse_plan_response(json);
        assert!(result.is_err(), "Unknown action type must return an error");
    }

    #[test]
    fn test_parse_plan_response_missing_step_id_returns_error() {
        let planner = make_planner();
        let json = r#"[
            {
                "action": {"type": "Screenshot", "region": null},
                "description": "No id step",
                "timeout": 5,
                "retry_on_failure": false
            }
        ]"#;
        let result = planner.parse_plan_response(json);
        assert!(result.is_err(), "Missing step id must return an error");
    }

    #[test]
    fn test_parse_plan_response_empty_array() {
        let planner = make_planner();
        let steps = planner.parse_plan_response("[]").unwrap();
        assert!(steps.is_empty(), "Empty JSON array must produce no steps");
    }

    // ------------------------------------------------------------------
    // Bug #51 — camelCase IPC: parser accepts both camelCase and snake_case
    // ------------------------------------------------------------------

    #[test]
    fn test_parse_plan_response_camel_case_keys() {
        // The parser must accept camelCase keys (produced by serde serialization
        // and the updated LLM prompt).
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_1",
                "action": {"type": "Screenshot", "region": null},
                "description": "Take a screenshot",
                "expectedResult": "Screenshot captured",
                "timeout": 5,
                "retryOnFailure": false
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        assert_eq!(steps.len(), 1);
        assert_eq!(
            steps[0].expected_result.as_deref(),
            Some("Screenshot captured")
        );
        assert!(!steps[0].retry_on_failure);
    }

    #[test]
    fn test_parse_plan_response_snake_case_keys_still_accepted() {
        // Legacy LLM responses may still produce snake_case keys.
        // The parser must accept both conventions.
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_1",
                "action": {"type": "Screenshot", "region": null},
                "description": "Take a screenshot",
                "expected_result": "Screenshot captured",
                "timeout": 5,
                "retry_on_failure": true
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        assert_eq!(steps.len(), 1);
        assert_eq!(
            steps[0].expected_result.as_deref(),
            Some("Screenshot captured")
        );
        assert!(steps[0].retry_on_failure);
    }

    #[test]
    fn test_parse_click_target_camel_case_element_id() {
        // UIAElement target with camelCase `elementId` must parse correctly.
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_1",
                "action": {
                    "type": "Click",
                    "target": {
                        "type": "UIAElement",
                        "elementId": "btn-submit"
                    }
                },
                "description": "Click submit",
                "timeout": 5,
                "retryOnFailure": false
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        if let Action::Click { target } = &steps[0].action {
            if let ClickTarget::UIAElement { element_id } = target {
                assert_eq!(element_id, "btn-submit");
            } else {
                panic!("Expected UIAElement target");
            }
        } else {
            panic!("Expected Click action");
        }
    }

    #[test]
    fn test_parse_click_target_snake_case_element_id_still_accepted() {
        // Legacy snake_case `element_id` must still parse.
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_1",
                "action": {
                    "type": "Click",
                    "target": {
                        "type": "UIAElement",
                        "element_id": "btn-cancel"
                    }
                },
                "description": "Click cancel",
                "timeout": 5,
                "retry_on_failure": false
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        if let Action::Click { target } = &steps[0].action {
            if let ClickTarget::UIAElement { element_id } = target {
                assert_eq!(element_id, "btn-cancel");
            } else {
                panic!("Expected UIAElement target");
            }
        } else {
            panic!("Expected Click action");
        }
    }

    #[test]
    fn test_parse_click_target_camel_case_image_path() {
        // ImageMatch target with camelCase `imagePath` must parse correctly.
        let planner = make_planner();
        let json = r#"[
            {
                "id": "step_1",
                "action": {
                    "type": "Click",
                    "target": {
                        "type": "ImageMatch",
                        "imagePath": "/tmp/btn.png",
                        "threshold": 0.85
                    }
                },
                "description": "Click image match",
                "timeout": 5,
                "retryOnFailure": false
            }
        ]"#;

        let steps = planner.parse_plan_response(json).unwrap();
        if let Action::Click { target } = &steps[0].action {
            if let ClickTarget::ImageMatch {
                image_path,
                threshold,
            } = target
            {
                assert_eq!(image_path, "/tmp/btn.png");
                assert!((threshold - 0.85).abs() < f64::EPSILON);
            } else {
                panic!("Expected ImageMatch target");
            }
        } else {
            panic!("Expected Click action");
        }
    }

    #[test]
    fn test_serde_round_trip_through_parser() {
        // Bug #51 core test: serialize a TaskStep to JSON (produces camelCase),
        // then feed it back through the planner's parser. This simulates the
        // checkpoint save/restore path where serde output must parse correctly.
        use crate::core::agent::TaskStep;
        use std::time::Duration;

        let step = TaskStep {
            id: "step_rt".to_string(),
            action: Action::Click {
                target: ClickTarget::UIAElement {
                    element_id: "my-btn".to_string(),
                },
            },
            description: "Round-trip click".to_string(),
            expected_result: Some("Button clicked".to_string()),
            timeout: Duration::from_secs(10),
            retry_on_failure: true,
        };

        // Serialize (produces camelCase via serde)
        let json_str = serde_json::to_string(&vec![step]).unwrap();

        // Parse back through the planner
        let planner = make_planner();
        let parsed = planner.parse_plan_response(&json_str).unwrap();

        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].id, "step_rt");
        assert_eq!(
            parsed[0].expected_result.as_deref(),
            Some("Button clicked")
        );
        assert!(parsed[0].retry_on_failure);

        if let Action::Click { target } = &parsed[0].action {
            if let ClickTarget::UIAElement { element_id } = target {
                assert_eq!(element_id, "my-btn");
            } else {
                panic!("Expected UIAElement after round-trip");
            }
        } else {
            panic!("Expected Click after round-trip");
        }
    }

    // ------------------------------------------------------------------
    // Live LLM tests — marked #[ignore]
    // ------------------------------------------------------------------

    #[tokio::test]
    #[ignore] // Requires a configured LLM provider
    async fn test_plan_task_requires_llm_provider() {
        let router = Arc::new(RwLock::new(LLMRouter::new()));
        let planner = TaskPlanner::new(router).unwrap();
        let steps = planner
            .plan_task("Take a screenshot and find the OK button")
            .await
            .unwrap();
        assert!(!steps.is_empty());
    }
}
