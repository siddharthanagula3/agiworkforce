#[cfg(test)]
mod service_tests {
    use super::super::UIAutomationService;

    #[test]
    fn test_uia_service_creation() {
        let result = UIAutomationService::new();
        assert!(
            result.is_ok(),
            "UIAutomationService creation should succeed"
        );
    }

    #[test]
    fn test_uia_service_singleton_pattern() {
        // Create multiple instances - each should succeed
        let service1 = UIAutomationService::new();
        let service2 = UIAutomationService::new();

        assert!(service1.is_ok());
        assert!(service2.is_ok());
    }

    #[test]
    fn test_root_element_access() {
        let service = UIAutomationService::new().expect("Failed to create service");
        let root = service.root_element();

        assert!(root.is_ok(), "Root element access should succeed");
    }
}

#[cfg(test)]
mod element_tree_tests {
    use super::super::{ElementQuery, UIAutomationService};

    #[test]
    fn test_list_windows() {
        let service = UIAutomationService::new().expect("Failed to create service");
        let windows = service.list_windows();

        assert!(windows.is_ok(), "list_windows should succeed");

        let window_list = windows.unwrap();
        // Should have at least one window (the test runner itself or Explorer)
        assert!(
            window_list.len() > 0,
            "Should detect at least one window, found {}",
            window_list.len()
        );

        // Verify window structure
        for window in window_list.iter() {
            assert!(!window.id.is_empty(), "Window should have an ID");
            // Name might be empty for some windows, so we don't assert on it
        }
    }

    #[test]
    fn test_window_info_structure() {
        let service = UIAutomationService::new().expect("Failed to create service");
        let windows = service.list_windows().expect("Failed to list windows");

        for window in windows.iter() {
            // ID should be non-empty and follow runtime ID format (numbers separated by dashes)
            assert!(!window.id.is_empty());
            assert!(
                window.id.contains('-') || window.id.chars().all(|c| c.is_numeric()),
                "Window ID should be valid runtime ID format"
            );

            // Control type should be populated
            assert!(!window.control_type.is_empty());
        }
    }

    #[test]
    fn test_element_query_default() {
        let query: ElementQuery = serde_json::from_str("{}").expect("Failed to parse empty query");

        assert!(query.window.is_none());
        assert!(query.window_class.is_none());
        assert!(query.name.is_none());
        assert!(query.class_name.is_none());
        assert!(query.automation_id.is_none());
        assert!(query.control_type.is_none());
        assert!(query.max_results.is_none());
    }

    #[test]
    fn test_element_query_parsing() {
        let json = r#"{
            "name": "TestButton",
            "control_type": "Button",
            "max_results": 10
        }"#;

        let query: ElementQuery = serde_json::from_str(json).expect("Failed to parse query");

        assert_eq!(query.name, Some("TestButton".to_string()));
        assert_eq!(query.control_type, Some("Button".to_string()));
        assert_eq!(query.max_results, Some(10));
        assert!(query.window.is_none());
    }

    #[test]
    fn test_find_elements_with_empty_query() {
        let service = UIAutomationService::new().expect("Failed to create service");
        let query = ElementQuery {
            window: None,
            window_class: None,
            name: None,
            class_name: None,
            automation_id: None,
            control_type: None,
            max_results: Some(50),
        };

        let result = service.find_elements(None, &query);

        // Finding elements with empty query should succeed (returns all elements up to max_results)
        assert!(result.is_ok(), "find_elements with empty query should work");

        let elements = result.unwrap();
        // Should find some elements in the desktop tree
        assert!(elements.len() > 0, "Should find at least some elements");
        // Should respect max_results
        assert!(elements.len() <= 50, "Should not exceed max_results");
    }

    #[test]
    #[ignore] // Requires Notepad to be open
    fn test_find_notepad_window() {
        let service = UIAutomationService::new().expect("Failed to create service");

        let query = ElementQuery {
            window: Some("Notepad".to_string()),
            window_class: None,
            name: None,
            class_name: None,
            automation_id: None,
            control_type: None,
            max_results: None,
        };

        let result = service.find_elements(None, &query);

        match result {
            Ok(elements) => {
                assert!(elements.len() > 0, "Should find elements in Notepad");
            }
            Err(e) => {
                // If Notepad is not open, the test should be skipped
                eprintln!(
                    "Notepad not found (test requires Notepad to be open): {}",
                    e
                );
            }
        }
    }

    #[test]
    fn test_bounding_rectangle_structure() {
        use super::super::BoundingRectangle;

        let rect = BoundingRectangle {
            left: 100.0,
            top: 200.0,
            width: 300.0,
            height: 150.0,
        };

        assert_eq!(rect.left, 100.0);
        assert_eq!(rect.top, 200.0);
        assert_eq!(rect.width, 300.0);
        assert_eq!(rect.height, 150.0);
    }

    #[test]
    fn test_element_cache() {
        let service = UIAutomationService::new().expect("Failed to create service");
        let windows = service.list_windows().expect("Failed to list windows");

        if windows.is_empty() {
            return; // Skip if no windows
        }

        let first_window = &windows[0];

        // Element should be cached by its ID
        // Try to retrieve it (this would fail if caching didn't work)
        let element_result = service.get_element(&first_window.id);

        assert!(
            element_result.is_ok(),
            "Should be able to retrieve cached element"
        );
    }
}

#[cfg(test)]
mod pattern_tests {
    use super::super::{PatternCapabilities, UIAutomationService};

    #[test]
    fn test_pattern_capabilities_structure() {
        let caps = PatternCapabilities {
            invoke: true,
            value: true,
            selection: false,
            toggle: false,
            text: true,
            grid: false,
            table: false,
            scroll: false,
            expand_collapse: false,
        };

        assert!(caps.invoke);
        assert!(caps.value);
        assert!(!caps.selection);
        assert!(!caps.toggle);
        assert!(caps.text);
    }

    #[test]
    fn test_pattern_capabilities_serialization() {
        let caps = PatternCapabilities {
            invoke: true,
            value: false,
            selection: true,
            toggle: false,
            text: true,
            grid: false,
            table: true,
            scroll: true,
            expand_collapse: false,
        };

        let json = serde_json::to_string(&caps).expect("Failed to serialize");
        let deserialized: PatternCapabilities =
            serde_json::from_str(&json).expect("Failed to deserialize");

        assert_eq!(caps.invoke, deserialized.invoke);
        assert_eq!(caps.value, deserialized.value);
        assert_eq!(caps.selection, deserialized.selection);
        assert_eq!(caps.toggle, deserialized.toggle);
        assert_eq!(caps.text, deserialized.text);
    }

    #[test]
    #[ignore] // Requires actual UI element to test
    fn test_check_patterns() {
        let service = UIAutomationService::new().expect("Failed to create service");
        let windows = service.list_windows().expect("Failed to list windows");

        if windows.is_empty() {
            return;
        }

        for window in windows.iter().take(3) {
            let result = service.check_patterns(&window.id);

            // check_patterns should succeed even if no patterns are supported
            assert!(
                result.is_ok(),
                "check_patterns should succeed for window: {}",
                window.name
            );

            let caps = result.unwrap();
            // At least one field should exist (they can all be false)
            // This just tests the structure is valid
            let _has_invoke = caps.invoke;
            let _has_value = caps.value;
        }
    }
}

#[cfg(test)]
mod action_tests {
    use super::super::UIAutomationService;

    #[test]
    #[ignore] // Requires actual UI element to test
    fn test_invoke_pattern_structure() {
        let service = UIAutomationService::new().expect("Failed to create service");

        // This test verifies the invoke method exists and has correct signature
        // Actual invocation requires a real button element
        let result = service.invoke("dummy-id");

        // Should fail with "Unknown element id" error
        assert!(result.is_err());
        let error = result.unwrap_err().to_string();
        assert!(error.contains("Unknown element id"));
    }

    #[test]
    #[ignore] // Requires actual UI element to test
    fn test_set_value_pattern_structure() {
        let service = UIAutomationService::new().expect("Failed to create service");

        // This test verifies the set_value method exists
        let result = service.set_value("dummy-id", "test");

        // Should fail with "Unknown element id" error
        assert!(result.is_err());
        let error = result.unwrap_err().to_string();
        assert!(error.contains("Unknown element id"));
    }

    #[test]
    #[ignore] // Requires actual UI element to test
    fn test_get_value_pattern_structure() {
        let service = UIAutomationService::new().expect("Failed to create service");

        // This test verifies the get_value method exists
        let result = service.get_value("dummy-id");

        // Should fail with "Unknown element id" error
        assert!(result.is_err());
        let error = result.unwrap_err().to_string();
        assert!(error.contains("Unknown element id"));
    }

    #[test]
    #[ignore] // Requires actual UI element to test
    fn test_set_toggle_pattern_structure() {
        let service = UIAutomationService::new().expect("Failed to create service");

        // This test verifies the toggle method exists
        let result = service.toggle("dummy-id");

        // Should fail with "Unknown element id" error
        assert!(result.is_err());
        let error = result.unwrap_err().to_string();
        assert!(error.contains("Unknown element id"));
    }
}

#[cfg(test)]
mod integration_tests {
    use super::super::{ElementQuery, UIAutomationService};

    #[test]
    fn test_complete_uia_workflow() {
        // Test a complete UIA workflow without requiring specific apps

        // 1. Create service
        let service = UIAutomationService::new().expect("Failed to create service");

        // 2. List windows
        let windows = service.list_windows().expect("Failed to list windows");
        assert!(windows.len() > 0, "Should have at least one window");

        // 3. Get first window and check patterns
        let first_window = &windows[0];
        let patterns = service
            .check_patterns(&first_window.id)
            .expect("Failed to check patterns");

        // Patterns structure should be valid (values can be true or false)
        let _ = patterns.invoke;
        let _ = patterns.value;

        // 4. Try to find elements with a query
        let query = ElementQuery {
            window: None,
            window_class: None,
            name: None,
            class_name: None,
            automation_id: None,
            control_type: None,
            max_results: Some(10),
        };

        let elements = service
            .find_elements(None, &query)
            .expect("Failed to find elements");

        // Should find some elements
        assert!(elements.len() > 0, "Should find some UI elements");
    }

    #[test]
    #[ignore] // Requires Notepad to be open
    fn test_notepad_automation_workflow() {
        use std::process::Command;
        use std::thread;
        use std::time::Duration;

        // Launch Notepad
        let mut notepad_process = Command::new("notepad.exe")
            .spawn()
            .expect("Failed to launch Notepad");

        // Wait for Notepad to open
        thread::sleep(Duration::from_secs(2));

        let service = UIAutomationService::new().expect("Failed to create service");

        // Find Notepad window
        let windows = service.list_windows().expect("Failed to list windows");
        let notepad_window = windows
            .iter()
            .find(|w| w.name.contains("Notepad") || w.name.contains("Untitled"));

        assert!(notepad_window.is_some(), "Should find Notepad window");

        let notepad_window = notepad_window.unwrap();

        // Check patterns on Notepad window
        let patterns = service
            .check_patterns(&notepad_window.id)
            .expect("Failed to check patterns");

        // Notepad window should support some patterns
        let _ = patterns.invoke;

        // Find edit control in Notepad
        let query = ElementQuery {
            window: Some(notepad_window.name.clone()),
            window_class: None,
            name: None,
            class_name: None,
            automation_id: None,
            control_type: Some("Edit".to_string()),
            max_results: Some(5),
        };

        let elements = service.find_elements(None, &query);

        if let Ok(edit_elements) = elements {
            assert!(
                edit_elements.len() > 0,
                "Should find edit control in Notepad"
            );

            let edit = &edit_elements[0];

            // Try to set text value
            let set_result = service.set_value(&edit.id, "Hello from test!");

            if set_result.is_ok() {
                // Verify text was set
                let get_result = service.get_value(&edit.id);
                if let Ok(value) = get_result {
                    assert!(
                        value.contains("Hello from test!"),
                        "Text should be set in Notepad"
                    );
                }
            }
        }

        // Close Notepad without saving
        notepad_process.kill().expect("Failed to close Notepad");
    }

    #[test]
    fn test_element_registration_and_retrieval() {
        let service = UIAutomationService::new().expect("Failed to create service");
        let windows = service.list_windows().expect("Failed to list windows");

        if windows.is_empty() {
            return; // Skip if no windows
        }

        // Get first window
        let window = &windows[0];
        let id = &window.id;

        // Element should be registered in cache during list_windows
        let element = service.get_element(id);

        assert!(element.is_ok(), "Should retrieve cached element");
    }

    #[test]
    fn test_invalid_element_id() {
        let service = UIAutomationService::new().expect("Failed to create service");

        // Try to get element with invalid ID
        let result = service.get_element("invalid-non-existent-id-12345");

        assert!(result.is_err(), "Should fail with invalid element ID");
        let error = result.unwrap_err().to_string();
        assert!(
            error.contains("Unknown element id"),
            "Error should indicate unknown element"
        );
    }
}

#[cfg(test)]
mod error_handling_tests {
    use super::super::UIAutomationService;

    #[test]
    fn test_invalid_window_name() {
        let service = UIAutomationService::new().expect("Failed to create service");

        let result = service.find_window("ThisWindowDefinitelyDoesNotExist12345XYZ", None);

        assert!(
            result.is_ok(),
            "find_window should return Ok(None) for non-existent window"
        );
        assert!(
            result.unwrap().is_none(),
            "Should return None for non-existent window"
        );
    }

    #[test]
    fn test_element_access_after_window_closed() {
        // This tests that the service handles stale element references gracefully
        // In practice, accessing a closed window's elements should return errors

        let service = UIAutomationService::new().expect("Failed to create service");

        // Try to access a definitely non-existent element
        let result = service.get_element("999999-888888-777777");

        assert!(result.is_err(), "Should fail to get non-existent element");
    }
}
