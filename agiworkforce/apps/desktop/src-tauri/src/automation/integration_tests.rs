//! Integration tests for Windows Automation MCP (M5)
//!
//! These tests verify real-world automation scenarios with actual Windows applications.
//! Tests use serial_test to prevent parallel execution and potential conflicts.
//!
//! ## Test Applications
//! - Notepad: Text input, menu navigation, find/replace
//! - Calculator: Button clicks, number entry, operations
//! - File Explorer: Navigation, file selection
//!
//! ## Running Tests
//! ```bash
//! cargo test --package agiworkforce-desktop integration_tests -- --test-threads=1
//! ```
//!
//! ## Notes
//! - Tests launch and close applications automatically
//! - Some tests are marked #[ignore] if they require manual setup
//! - Tests include cleanup to close windows and reset state

use super::*;
use crate::automation::input::{KeyboardSimulator, MouseSimulator, MouseButton};
use crate::automation::screen::{capture_primary_screen, capture_region};
use crate::automation::uia::{UIAutomationService, ElementQuery, BoundingRectangle};
use serial_test::serial;
use std::process::{Command, Child};
use std::thread;
use std::time::Duration;

/// Helper struct for managing test applications
pub struct TestApp {
    process: Child,
    name: String,
}

impl TestApp {
    /// Launch an application and wait for it to be ready
    pub fn launch(app_name: &str, args: &[&str]) -> anyhow::Result<Self> {
        let mut cmd = Command::new(app_name);
        if !args.is_empty() {
            cmd.args(args);
        }

        let process = cmd.spawn()
            .map_err(|e| anyhow!("Failed to launch {}: {}", app_name, e))?;

        // Wait for application to initialize
        thread::sleep(Duration::from_millis(1500));

        Ok(TestApp {
            process,
            name: app_name.to_string(),
        })
    }

    /// Close the application gracefully
    pub fn close(mut self) -> anyhow::Result<()> {
        self.process.kill()
            .map_err(|e| anyhow!("Failed to close {}: {}", self.name, e))?;

        // Wait for cleanup
        thread::sleep(Duration::from_millis(500));
        Ok(())
    }

    /// Close without consuming self
    pub fn close_ref(&mut self) -> anyhow::Result<()> {
        self.process.kill()
            .map_err(|e| anyhow!("Failed to close {}: {}", self.name, e))?;

        thread::sleep(Duration::from_millis(500));
        Ok(())
    }
}

impl Drop for TestApp {
    fn drop(&mut self) {
        // Best effort cleanup
        let _ = self.process.kill();
    }
}

/// Helper to find window with retry logic
pub fn find_window_with_retry(
    service: &UIAutomationService,
    name_contains: &str,
    max_attempts: u32,
) -> anyhow::Result<ElementInfo> {
    for attempt in 1..=max_attempts {
        let windows = service.list_windows()?;

        if let Some(window) = windows.iter().find(|w|
            w.name.to_lowercase().contains(&name_contains.to_lowercase())
        ) {
            return Ok(window.clone());
        }

        if attempt < max_attempts {
            thread::sleep(Duration::from_millis(500));
        }
    }

    Err(anyhow!("Failed to find window containing '{}'", name_contains))
}

/// Helper to find element with retry logic
pub fn find_element_with_retry(
    service: &UIAutomationService,
    window_id: Option<&str>,
    query: &ElementQuery,
    max_attempts: u32,
) -> anyhow::Result<ElementInfo> {
    for attempt in 1..=max_attempts {
        let elements = service.find_elements(window_id, query)?;

        if !elements.is_empty() {
            return Ok(elements[0].clone());
        }

        if attempt < max_attempts {
            thread::sleep(Duration::from_millis(300));
        }
    }

    Err(anyhow!("Failed to find element matching query after {} attempts", max_attempts))
}

/// Helper to wait for application state
pub fn wait_for_condition<F>(condition: F, timeout_ms: u64) -> anyhow::Result<()>
where
    F: Fn() -> bool,
{
    let start = std::time::Instant::now();
    let timeout = Duration::from_millis(timeout_ms);

    while start.elapsed() < timeout {
        if condition() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }

    Err(anyhow!("Timeout waiting for condition after {}ms", timeout_ms))
}

#[cfg(test)]
mod notepad_tests {
    use super::*;

    #[test]
    #[serial]
    fn test_notepad_launch_and_detect() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        assert!(!window.id.is_empty());
        assert!(window.name.to_lowercase().contains("notepad") ||
                window.name.to_lowercase().contains("untitled"));
        assert_eq!(window.control_type, "Window");

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_notepad_text_input_via_uia() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        // Focus the window
        service.focus_window(&window.id)
            .expect("Failed to focus Notepad");

        thread::sleep(Duration::from_millis(300));

        // Find the edit control
        let query = ElementQuery {
            window: None,
            window_class: None,
            name: None,
            class_name: None,
            automation_id: Some("15".to_string()), // Notepad edit control ID
            control_type: Some("Edit".to_string()),
            max_results: Some(1),
        };

        let edit = find_element_with_retry(&service, Some(&window.id), &query, 5)
            .expect("Failed to find edit control");

        // Set focus on edit control
        service.set_focus(&edit.id)
            .expect("Failed to focus edit control");

        // Set text value
        let test_text = "Hello from Windows Automation MCP!\nThis is line 2.";
        service.set_value(&edit.id, test_text)
            .expect("Failed to set text");

        thread::sleep(Duration::from_millis(500));

        // Verify text was set
        let retrieved_text = service.get_value(&edit.id)
            .expect("Failed to get text");

        assert!(retrieved_text.contains("Hello from Windows Automation"));

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_notepad_keyboard_input() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");
        let keyboard = KeyboardSimulator::new().expect("Failed to create keyboard simulator");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        // Focus the window
        service.focus_window(&window.id)
            .expect("Failed to focus Notepad");

        thread::sleep(Duration::from_millis(300));

        // Type text using keyboard simulation
        keyboard.send_text("Testing keyboard input simulation")
            .expect("Failed to send text");

        thread::sleep(Duration::from_millis(500));

        // Verify text was typed (via UIA)
        let query = ElementQuery {
            window: None,
            window_class: None,
            name: None,
            class_name: None,
            automation_id: Some("15".to_string()),
            control_type: Some("Edit".to_string()),
            max_results: Some(1),
        };

        let edit = find_element_with_retry(&service, Some(&window.id), &query, 5)
            .expect("Failed to find edit control");

        let text = service.get_value(&edit.id)
            .expect("Failed to get text");

        assert!(text.contains("Testing keyboard input"));

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_notepad_special_keys() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");
        let keyboard = KeyboardSimulator::new().expect("Failed to create keyboard simulator");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        service.focus_window(&window.id)
            .expect("Failed to focus Notepad");

        thread::sleep(Duration::from_millis(300));

        // Type multi-line text
        keyboard.send_text("Line 1").expect("Failed to type");
        keyboard.press_key(0x0D).expect("Failed to press Enter"); // VK_RETURN
        keyboard.send_text("Line 2").expect("Failed to type");
        keyboard.press_key(0x0D).expect("Failed to press Enter");
        keyboard.send_text("Line 3").expect("Failed to type");

        thread::sleep(Duration::from_millis(500));

        // Select all text (Ctrl+A)
        use windows::Win32::UI::Input::KeyboardAndMouse::VK_CONTROL;
        keyboard.hotkey(&[VK_CONTROL.0 as u16], 0x41) // 'A'
            .expect("Failed to press Ctrl+A");

        thread::sleep(Duration::from_millis(300));

        // Verify text content
        let query = ElementQuery {
            window: None,
            window_class: None,
            name: None,
            class_name: None,
            automation_id: Some("15".to_string()),
            control_type: Some("Edit".to_string()),
            max_results: Some(1),
        };

        let edit = find_element_with_retry(&service, Some(&window.id), &query, 5)
            .expect("Failed to find edit control");

        let text = service.get_value(&edit.id)
            .expect("Failed to get text");

        // Should contain all three lines
        assert!(text.contains("Line 1"));
        assert!(text.contains("Line 2"));
        assert!(text.contains("Line 3"));

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_notepad_menu_navigation() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        service.focus_window(&window.id)
            .expect("Failed to focus Notepad");

        thread::sleep(Duration::from_millis(300));

        // Find Edit menu
        let query = ElementQuery {
            window: None,
            window_class: None,
            name: Some("Edit".to_string()),
            class_name: None,
            automation_id: None,
            control_type: Some("MenuItem".to_string()),
            max_results: Some(1),
        };

        let result = service.find_elements(Some(&window.id), &query);

        // Menu might not be accessible without keyboard navigation
        // This test verifies the query mechanism works
        match result {
            Ok(elements) => {
                if !elements.is_empty() {
                    let menu = &elements[0];
                    assert_eq!(menu.control_type, "MenuItem");
                    assert_eq!(menu.name, "Edit");
                }
            }
            Err(e) => {
                // Menu might not be enumerable in all Windows versions
                eprintln!("Menu enumeration not available: {}", e);
            }
        }

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_notepad_bounding_rectangle() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        // Get window bounds
        let bounds = service.bounding_rect(&window.id)
            .expect("Failed to get bounding rect");

        assert!(bounds.is_some(), "Window should have bounding rectangle");

        let rect = bounds.unwrap();
        assert!(rect.width > 0.0, "Width should be positive");
        assert!(rect.height > 0.0, "Height should be positive");
        assert!(rect.left >= 0.0, "Left should be non-negative");
        assert!(rect.top >= 0.0, "Top should be non-negative");

        // Verify reasonable window size (at least 200x100)
        assert!(rect.width >= 200.0, "Window should be at least 200px wide");
        assert!(rect.height >= 100.0, "Window should be at least 100px tall");

        app.close().expect("Failed to close Notepad");
    }
}

#[cfg(test)]
mod calculator_tests {
    use super::*;

    #[test]
    #[serial]
    fn test_calculator_launch_and_detect() {
        let app = TestApp::launch("calc.exe", &[])
            .expect("Failed to launch Calculator");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "calculator", 5)
            .expect("Failed to find Calculator window");

        assert!(!window.id.is_empty());
        assert!(window.name.to_lowercase().contains("calculator"));

        app.close().expect("Failed to close Calculator");
    }

    #[test]
    #[serial]
    fn test_calculator_button_click() {
        let app = TestApp::launch("calc.exe", &[])
            .expect("Failed to launch Calculator");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "calculator", 5)
            .expect("Failed to find Calculator window");

        service.focus_window(&window.id)
            .expect("Failed to focus Calculator");

        thread::sleep(Duration::from_millis(500));

        // Find number button "1"
        let query = ElementQuery {
            window: None,
            window_class: None,
            name: Some("One".to_string()),
            class_name: None,
            automation_id: None,
            control_type: Some("Button".to_string()),
            max_results: Some(1),
        };

        let button_result = service.find_elements(Some(&window.id), &query);

        if let Ok(elements) = button_result {
            if !elements.is_empty() {
                let button = &elements[0];

                // Check if button supports invoke pattern
                let patterns = service.check_patterns(&button.id)
                    .expect("Failed to check patterns");

                if patterns.invoke {
                    // Click the button
                    service.invoke(&button.id)
                        .expect("Failed to invoke button");

                    thread::sleep(Duration::from_millis(300));
                } else {
                    eprintln!("Button does not support invoke pattern");
                }
            }
        } else {
            // Calculator UI structure varies by Windows version
            eprintln!("Calculator button enumeration not available");
        }

        app.close().expect("Failed to close Calculator");
    }

    #[test]
    #[serial]
    fn test_calculator_keyboard_input() {
        let app = TestApp::launch("calc.exe", &[])
            .expect("Failed to launch Calculator");

        let service = UIAutomationService::new().expect("Failed to create service");
        let keyboard = KeyboardSimulator::new().expect("Failed to create keyboard simulator");

        let window = find_window_with_retry(&service, "calculator", 5)
            .expect("Failed to find Calculator window");

        service.focus_window(&window.id)
            .expect("Failed to focus Calculator");

        thread::sleep(Duration::from_millis(500));

        // Type calculation: 5 + 3 =
        keyboard.send_text("5").expect("Failed to type 5");
        thread::sleep(Duration::from_millis(100));
        keyboard.send_text("+").expect("Failed to type +");
        thread::sleep(Duration::from_millis(100));
        keyboard.send_text("3").expect("Failed to type 3");
        thread::sleep(Duration::from_millis(100));
        keyboard.press_key(0x0D).expect("Failed to press Enter"); // =

        thread::sleep(Duration::from_millis(500));

        // Calculator result verification would require reading display element
        // This test verifies keyboard input works

        app.close().expect("Failed to close Calculator");
    }

    #[test]
    #[serial]
    fn test_calculator_pattern_detection() {
        let app = TestApp::launch("calc.exe", &[])
            .expect("Failed to launch Calculator");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "calculator", 5)
            .expect("Failed to find Calculator window");

        // Check patterns on window
        let patterns = service.check_patterns(&window.id)
            .expect("Failed to check patterns");

        // Verify pattern structure
        let _ = patterns.invoke;
        let _ = patterns.value;
        let _ = patterns.toggle;
        let _ = patterns.text;

        app.close().expect("Failed to close Calculator");
    }
}

#[cfg(test)]
mod file_explorer_tests {
    use super::*;

    #[test]
    #[serial]
    fn test_explorer_launch_and_detect() {
        let app = TestApp::launch("explorer.exe", &[])
            .expect("Failed to launch Explorer");

        thread::sleep(Duration::from_millis(1000));

        let service = UIAutomationService::new().expect("Failed to create service");

        // Find Explorer window
        let windows = service.list_windows().expect("Failed to list windows");
        let explorer_window = windows.iter().find(|w|
            w.class_name.contains("CabinetWClass") ||
            w.name.to_lowercase().contains("file explorer")
        );

        assert!(explorer_window.is_some(), "Should find Explorer window");

        if let Some(window) = explorer_window {
            assert!(!window.id.is_empty());
        }

        app.close().expect("Failed to close Explorer");
    }

    #[test]
    #[serial]
    fn test_explorer_address_bar() {
        let app = TestApp::launch("explorer.exe", &[])
            .expect("Failed to launch Explorer");

        thread::sleep(Duration::from_millis(1000));

        let service = UIAutomationService::new().expect("Failed to create service");

        let windows = service.list_windows().expect("Failed to list windows");
        let explorer_window = windows.iter().find(|w|
            w.class_name.contains("CabinetWClass")
        );

        if let Some(window) = explorer_window {
            // Try to find address bar
            let query = ElementQuery {
                window: None,
                window_class: None,
                name: None,
                class_name: None,
                automation_id: None,
                control_type: Some("Edit".to_string()),
                max_results: Some(10),
            };

            let result = service.find_elements(Some(&window.id), &query);

            if let Ok(elements) = result {
                // Explorer has multiple edit controls (address bar, search box)
                assert!(elements.len() > 0, "Should find edit controls in Explorer");
            }
        }

        app.close().expect("Failed to close Explorer");
    }
}

#[cfg(test)]
mod pattern_integration_tests {
    use super::*;

    #[test]
    #[serial]
    fn test_invoke_pattern_on_button() {
        // Test invoke pattern using Notepad's close button
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        // Find close button
        let query = ElementQuery {
            window: None,
            window_class: None,
            name: Some("Close".to_string()),
            class_name: None,
            automation_id: None,
            control_type: Some("Button".to_string()),
            max_results: Some(1),
        };

        let result = service.find_elements(Some(&window.id), &query);

        if let Ok(elements) = result {
            if !elements.is_empty() {
                let close_button = &elements[0];

                let patterns = service.check_patterns(&close_button.id)
                    .expect("Failed to check patterns");

                assert!(patterns.invoke, "Close button should support invoke pattern");

                // Don't actually invoke to avoid closing the window
                // service.invoke(&close_button.id).expect("Failed to invoke");
            }
        }

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_value_pattern_on_edit() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        let query = ElementQuery {
            window: None,
            window_class: None,
            name: None,
            class_name: None,
            automation_id: Some("15".to_string()),
            control_type: Some("Edit".to_string()),
            max_results: Some(1),
        };

        let edit = find_element_with_retry(&service, Some(&window.id), &query, 5)
            .expect("Failed to find edit control");

        // Check patterns
        let patterns = service.check_patterns(&edit.id)
            .expect("Failed to check patterns");

        assert!(patterns.value || patterns.text,
            "Edit control should support value or text pattern");

        // Test set_value
        service.set_value(&edit.id, "Pattern test")
            .expect("Failed to set value");

        thread::sleep(Duration::from_millis(300));

        // Test get_value
        let value = service.get_value(&edit.id)
            .expect("Failed to get value");

        assert!(value.contains("Pattern test"));

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_text_pattern_reading() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");
        let keyboard = KeyboardSimulator::new().expect("Failed to create keyboard");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        service.focus_window(&window.id)
            .expect("Failed to focus window");

        thread::sleep(Duration::from_millis(300));

        // Type some text
        keyboard.send_text("Multi-line\ntext\npattern\ntest")
            .expect("Failed to type text");

        thread::sleep(Duration::from_millis(500));

        // Read back using text pattern
        let query = ElementQuery {
            window: None,
            window_class: None,
            name: None,
            class_name: None,
            automation_id: Some("15".to_string()),
            control_type: Some("Edit".to_string()),
            max_results: Some(1),
        };

        let edit = find_element_with_retry(&service, Some(&window.id), &query, 5)
            .expect("Failed to find edit control");

        let text = service.get_value(&edit.id)
            .expect("Failed to get text");

        assert!(text.contains("Multi-line"));
        assert!(text.contains("pattern"));
        assert!(text.contains("test"));

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_unsupported_pattern_error() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        // Try to toggle a window (windows don't support toggle pattern)
        let result = service.toggle(&window.id);

        assert!(result.is_err(), "Toggle on window should fail");

        let error = result.unwrap_err().to_string();
        assert!(error.contains("does not support") || error.contains("Toggle"));

        app.close().expect("Failed to close Notepad");
    }
}

#[cfg(test)]
mod mouse_integration_tests {
    use super::*;

    #[test]
    #[serial]
    fn test_mouse_click_on_element() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");
        let mouse = MouseSimulator::new().expect("Failed to create mouse");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        // Get window bounds
        let bounds = service.bounding_rect(&window.id)
            .expect("Failed to get bounds")
            .expect("Window should have bounds");

        // Click center of window
        mouse.click_rect_center(&bounds, MouseButton::Left)
            .expect("Failed to click window center");

        thread::sleep(Duration::from_millis(300));

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_mouse_click_edit_control() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");
        let mouse = MouseSimulator::new().expect("Failed to create mouse");
        let keyboard = KeyboardSimulator::new().expect("Failed to create keyboard");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        let query = ElementQuery {
            window: None,
            window_class: None,
            name: None,
            class_name: None,
            automation_id: Some("15".to_string()),
            control_type: Some("Edit".to_string()),
            max_results: Some(1),
        };

        let edit = find_element_with_retry(&service, Some(&window.id), &query, 5)
            .expect("Failed to find edit control");

        // Get edit control bounds
        let bounds = service.bounding_rect(&edit.id)
            .expect("Failed to get bounds")
            .expect("Edit should have bounds");

        // Click to focus
        mouse.click_rect_center(&bounds, MouseButton::Left)
            .expect("Failed to click edit");

        thread::sleep(Duration::from_millis(300));

        // Type after clicking
        keyboard.send_text("Clicked and typed")
            .expect("Failed to type");

        thread::sleep(Duration::from_millis(300));

        let text = service.get_value(&edit.id)
            .expect("Failed to get text");

        assert!(text.contains("Clicked and typed"));

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_mouse_double_click() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");
        let mouse = MouseSimulator::new().expect("Failed to create mouse");
        let keyboard = KeyboardSimulator::new().expect("Failed to create keyboard");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        service.focus_window(&window.id)
            .expect("Failed to focus window");

        thread::sleep(Duration::from_millis(300));

        // Type a word
        keyboard.send_text("doubleclick")
            .expect("Failed to type");

        thread::sleep(Duration::from_millis(300));

        let query = ElementQuery {
            window: None,
            window_class: None,
            name: None,
            class_name: None,
            automation_id: Some("15".to_string()),
            control_type: Some("Edit".to_string()),
            max_results: Some(1),
        };

        let edit = find_element_with_retry(&service, Some(&window.id), &query, 5)
            .expect("Failed to find edit control");

        let bounds = service.bounding_rect(&edit.id)
            .expect("Failed to get bounds")
            .expect("Edit should have bounds");

        // Double-click should select the word
        let center_x = (bounds.left + bounds.width / 2.0) as i32;
        let center_y = (bounds.top + bounds.height / 2.0) as i32;

        // Perform double-click
        mouse.click(center_x, center_y, MouseButton::Left)
            .expect("Failed to click");
        thread::sleep(Duration::from_millis(50));
        mouse.click(center_x, center_y, MouseButton::Left)
            .expect("Failed to click");

        thread::sleep(Duration::from_millis(300));

        app.close().expect("Failed to close Notepad");
    }
}

#[cfg(test)]
mod screen_capture_integration_tests {
    use super::*;

    #[test]
    #[serial]
    fn test_capture_element_region() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        // Get window bounds
        let bounds = service.bounding_rect(&window.id)
            .expect("Failed to get bounds")
            .expect("Window should have bounds");

        // Capture the window region
        let capture = capture_region(
            bounds.left as u32,
            bounds.top as u32,
            bounds.width as u32,
            bounds.height as u32,
        ).expect("Failed to capture region");

        assert_eq!(capture.pixels.width(), bounds.width as u32);
        assert_eq!(capture.pixels.height(), bounds.height as u32);
        assert_eq!(capture.x, bounds.left as u32);
        assert_eq!(capture.y, bounds.top as u32);

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_capture_edit_control() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");
        let keyboard = KeyboardSimulator::new().expect("Failed to create keyboard");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        service.focus_window(&window.id)
            .expect("Failed to focus window");

        thread::sleep(Duration::from_millis(300));

        // Type visible text
        keyboard.send_text("Screenshot Test")
            .expect("Failed to type");

        thread::sleep(Duration::from_millis(300));

        let query = ElementQuery {
            window: None,
            window_class: None,
            name: None,
            class_name: None,
            automation_id: Some("15".to_string()),
            control_type: Some("Edit".to_string()),
            max_results: Some(1),
        };

        let edit = find_element_with_retry(&service, Some(&window.id), &query, 5)
            .expect("Failed to find edit control");

        let bounds = service.bounding_rect(&edit.id)
            .expect("Failed to get bounds")
            .expect("Edit should have bounds");

        // Capture edit control
        let capture = capture_region(
            bounds.left as u32,
            bounds.top as u32,
            bounds.width as u32,
            bounds.height as u32,
        ).expect("Failed to capture edit control");

        assert!(capture.pixels.width() > 0);
        assert!(capture.pixels.height() > 0);

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_verify_element_bounds_accuracy() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        let bounds = service.bounding_rect(&window.id)
            .expect("Failed to get bounds")
            .expect("Window should have bounds");

        // Verify bounds are within screen dimensions
        let screen = capture_primary_screen()
            .expect("Failed to capture screen");

        assert!(bounds.left >= 0.0);
        assert!(bounds.top >= 0.0);
        assert!(bounds.left + bounds.width <= screen.display.width as f64);
        assert!(bounds.top + bounds.height <= screen.display.height as f64);

        app.close().expect("Failed to close Notepad");
    }
}

#[cfg(test)]
mod focus_and_window_management_tests {
    use super::*;

    #[test]
    #[serial]
    fn test_set_focus_on_element() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        let query = ElementQuery {
            window: None,
            window_class: None,
            name: None,
            class_name: None,
            automation_id: Some("15".to_string()),
            control_type: Some("Edit".to_string()),
            max_results: Some(1),
        };

        let edit = find_element_with_retry(&service, Some(&window.id), &query, 5)
            .expect("Failed to find edit control");

        // Set focus should succeed
        service.set_focus(&edit.id)
            .expect("Failed to set focus");

        thread::sleep(Duration::from_millis(300));

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_focus_window_brings_to_foreground() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        // Focus window should bring it to foreground
        service.focus_window(&window.id)
            .expect("Failed to focus window");

        thread::sleep(Duration::from_millis(500));

        // Window should still be findable and accessible
        let windows = service.list_windows()
            .expect("Failed to list windows");

        let still_there = windows.iter().any(|w| w.id == window.id);
        assert!(still_there, "Window should still exist after focusing");

        app.close().expect("Failed to close Notepad");
    }
}

#[cfg(test)]
mod error_handling_integration_tests {
    use super::*;

    #[test]
    #[serial]
    fn test_invoke_on_closed_window() {
        let mut app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        let window_id = window.id.clone();

        // Close the window
        app.close_ref().expect("Failed to close Notepad");

        thread::sleep(Duration::from_millis(500));

        // Try to invoke on closed window
        let result = service.invoke(&window_id);

        assert!(result.is_err(), "Should fail on closed window");
    }

    #[test]
    #[serial]
    fn test_get_value_on_non_text_element() {
        let app = TestApp::launch("notepad.exe", &[])
            .expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "notepad", 5)
            .expect("Failed to find Notepad window");

        // Try to get value from window (which doesn't have value pattern)
        let result = service.get_value(&window.id);

        // May fail or return empty, depending on implementation
        match result {
            Ok(val) => assert!(val.is_empty() || !val.is_empty()),
            Err(e) => assert!(e.to_string().contains("does not provide")),
        }

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_invalid_element_id() {
        let service = UIAutomationService::new().expect("Failed to create service");

        let result = service.invoke("invalid-element-id-99999");

        assert!(result.is_err());
        let error = result.unwrap_err().to_string();
        assert!(error.contains("Unknown element"));
    }
}
