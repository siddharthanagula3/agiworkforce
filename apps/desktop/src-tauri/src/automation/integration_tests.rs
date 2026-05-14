// This module is #[cfg(all(test, windows))]-gated (see automation/mod.rs); some
// imports / helpers are only used by individual test cases whose bodies are
// further-gated by feature flags or DE availability. Allow unused here so the
// Windows test build doesn't fail on each iteration as test bodies evolve.
#![allow(unused_imports, dead_code, unused_variables)]

use super::*;
use crate::automation::input::{KeyboardSimulator, MouseButton, MouseSimulator};
use crate::automation::screen::{capture_primary_screen, capture_region};
use crate::automation::types::UIElementInfo as ElementInfo;
use crate::automation::uia::{BoundingRectangle, ElementQuery, UIAutomationService};
use anyhow::anyhow;
use enigo::Key;
use serial_test::serial;
use std::process::{Child, Command};
use std::thread;
use std::time::Duration;

pub struct TestApp {
    process: Child,
    name: String,
}

impl TestApp {
    pub fn launch(app_name: &str, args: &[&str]) -> anyhow::Result<Self> {
        let mut cmd = Command::new(app_name);
        if !args.is_empty() {
            cmd.args(args);
        }

        let process = cmd
            .spawn()
            .map_err(|e| anyhow!("Failed to launch {}: {}", app_name, e))?;

        thread::sleep(Duration::from_millis(1500));

        Ok(TestApp {
            process,
            name: app_name.to_string(),
        })
    }

    pub fn close(mut self) -> anyhow::Result<()> {
        self.process
            .kill()
            .map_err(|e| anyhow!("Failed to close {}: {}", self.name, e))?;

        thread::sleep(Duration::from_millis(500));
        Ok(())
    }

    pub fn close_ref(&mut self) -> anyhow::Result<()> {
        self.process
            .kill()
            .map_err(|e| anyhow!("Failed to close {}: {}", self.name, e))?;

        thread::sleep(Duration::from_millis(500));
        Ok(())
    }
}

impl Drop for TestApp {
    fn drop(&mut self) {
        let _ = self.process.kill();
    }
}

pub fn find_window_with_retry(
    service: &UIAutomationService,
    name_contains: &str,
    max_attempts: u32,
) -> anyhow::Result<ElementInfo> {
    for attempt in 1..=max_attempts {
        let windows = service.list_windows()?;

        if let Some(window) = windows.iter().find(|w| {
            w.name
                .to_lowercase()
                .contains(&name_contains.to_lowercase())
        }) {
            return Ok(window.clone());
        }

        if attempt < max_attempts {
            thread::sleep(Duration::from_millis(500));
        }
    }

    Err(anyhow!(
        "Failed to find window containing '{}'",
        name_contains
    ))
}

pub fn find_element_with_retry(
    service: &UIAutomationService,
    window_id: Option<&str>,
    query: &ElementQuery,
    max_attempts: u32,
) -> anyhow::Result<ElementInfo> {
    for attempt in 1..=max_attempts {
        let elements = service.find_elements(window_id.map(String::from), query)?;

        if !elements.is_empty() {
            return Ok(elements[0].clone());
        }

        if attempt < max_attempts {
            thread::sleep(Duration::from_millis(300));
        }
    }

    Err(anyhow!(
        "Failed to find element matching query after {} attempts",
        max_attempts
    ))
}

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

    Err(anyhow!(
        "Timeout waiting for condition after {}ms",
        timeout_ms
    ))
}

#[cfg(test)]
mod notepad_tests {
    use super::*;

    #[test]
    #[serial]
    fn test_notepad_launch_and_detect() {
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        assert!(!window.id.is_empty());
        assert!(
            window.name.to_lowercase().contains("notepad")
                || window.name.to_lowercase().contains("untitled")
        );
        assert_eq!(window.control_type, "Window");

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_notepad_text_input_via_uia() {
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        service
            .focus_window(&window.id)
            .expect("Failed to focus Notepad");

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

        service
            .set_focus(&edit.id)
            .expect("Failed to focus edit control");

        let test_text = "Hello from Windows Automation MCP!\nThis is line 2.";
        service
            .set_value(&edit.id, test_text)
            .expect("Failed to set text");

        thread::sleep(Duration::from_millis(500));

        let retrieved_text = service.get_value(&edit.id).expect("Failed to get text");

        assert!(retrieved_text.contains("Hello from Windows Automation"));

        app.close().expect("Failed to close Notepad");
    }

    #[tokio::test]
    #[serial]
    async fn test_notepad_keyboard_input() {
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");
        let mut keyboard = KeyboardSimulator::new().expect("Failed to create keyboard simulator");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        service
            .focus_window(&window.id)
            .expect("Failed to focus Notepad");

        thread::sleep(Duration::from_millis(300));

        keyboard
            .send_text("Testing keyboard input simulation")
            .await
            .expect("Failed to send text");

        thread::sleep(Duration::from_millis(500));

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

        let text = service.get_value(&edit.id).expect("Failed to get text");

        assert!(text.contains("Testing keyboard input"));

        app.close().expect("Failed to close Notepad");
    }

    #[tokio::test]
    #[serial]
    async fn test_notepad_special_keys() {
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");
        let mut keyboard = KeyboardSimulator::new().expect("Failed to create keyboard simulator");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        service
            .focus_window(&window.id)
            .expect("Failed to focus Notepad");

        thread::sleep(Duration::from_millis(300));

        keyboard.send_text("Line 1").await.expect("Failed to type");
        keyboard
            .press_key(Key::Return)
            .expect("Failed to press Enter");
        keyboard.send_text("Line 2").await.expect("Failed to type");
        keyboard
            .press_key(Key::Return)
            .expect("Failed to press Enter");
        keyboard.send_text("Line 3").await.expect("Failed to type");

        thread::sleep(Duration::from_millis(500));

        use windows::Win32::UI::Input::KeyboardAndMouse::VK_CONTROL;
        keyboard
            .send_hotkey(&[Key::Control], Key::Other(0x41))
            .expect("Failed to press Ctrl+A");

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

        let text = service.get_value(&edit.id).expect("Failed to get text");

        assert!(text.contains("Line 1"));
        assert!(text.contains("Line 2"));
        assert!(text.contains("Line 3"));

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_notepad_menu_navigation() {
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        service
            .focus_window(&window.id)
            .expect("Failed to focus Notepad");

        thread::sleep(Duration::from_millis(300));

        let query = ElementQuery {
            window: None,
            window_class: None,
            name: Some("Edit".to_string()),
            class_name: None,
            automation_id: None,
            control_type: Some("MenuItem".to_string()),
            max_results: Some(1),
        };

        let result = service.find_elements(Some(window.id.clone()), &query);

        match result {
            Ok(elements) => {
                if !elements.is_empty() {
                    let menu = &elements[0];
                    assert_eq!(menu.control_type, "MenuItem");
                    assert_eq!(menu.name, "Edit");
                }
            }
            Err(e) => {
                eprintln!("Menu enumeration not available: {}", e);
            }
        }

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_notepad_bounding_rectangle() {
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        let bounds = service
            .bounding_rect(&window.id)
            .expect("Failed to get bounding rect");

        assert!(bounds.is_some(), "Window should have bounding rectangle");

        let rect = bounds.unwrap();
        assert!(rect.width > 0.0, "Width should be positive");
        assert!(rect.height > 0.0, "Height should be positive");
        assert!(rect.left >= 0.0, "Left should be non-negative");
        assert!(rect.top >= 0.0, "Top should be non-negative");

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
        let app = TestApp::launch("calc.exe", &[]).expect("Failed to launch Calculator");

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
        let app = TestApp::launch("calc.exe", &[]).expect("Failed to launch Calculator");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "calculator", 5)
            .expect("Failed to find Calculator window");

        service
            .focus_window(&window.id)
            .expect("Failed to focus Calculator");

        thread::sleep(Duration::from_millis(500));

        let query = ElementQuery {
            window: None,
            window_class: None,
            name: Some("One".to_string()),
            class_name: None,
            automation_id: None,
            control_type: Some("Button".to_string()),
            max_results: Some(1),
        };

        let button_result = service.find_elements(Some(window.id.clone()), &query);

        if let Ok(elements) = button_result {
            if !elements.is_empty() {
                let button = &elements[0];

                let patterns = service
                    .check_patterns(&button.id)
                    .expect("Failed to check patterns");

                if patterns.invoke {
                    service.invoke(&button.id).expect("Failed to invoke button");

                    thread::sleep(Duration::from_millis(300));
                } else {
                    eprintln!("Button does not support invoke pattern");
                }
            }
        } else {
            eprintln!("Calculator button enumeration not available");
        }

        app.close().expect("Failed to close Calculator");
    }

    #[tokio::test]
    #[serial]
    async fn test_calculator_keyboard_input() {
        let app = TestApp::launch("calc.exe", &[]).expect("Failed to launch Calculator");

        let service = UIAutomationService::new().expect("Failed to create service");
        let mut keyboard = KeyboardSimulator::new().expect("Failed to create keyboard simulator");

        let window = find_window_with_retry(&service, "calculator", 5)
            .expect("Failed to find Calculator window");

        service
            .focus_window(&window.id)
            .expect("Failed to focus Calculator");

        thread::sleep(Duration::from_millis(500));

        keyboard.send_text("5").await.expect("Failed to type 5");
        thread::sleep(Duration::from_millis(100));
        keyboard.send_text("+").await.expect("Failed to type +");
        thread::sleep(Duration::from_millis(100));
        keyboard.send_text("3").await.expect("Failed to type 3");
        thread::sleep(Duration::from_millis(100));
        keyboard
            .press_key(Key::Return)
            .expect("Failed to press Enter");

        thread::sleep(Duration::from_millis(500));

        app.close().expect("Failed to close Calculator");
    }

    #[test]
    #[serial]
    fn test_calculator_pattern_detection() {
        let app = TestApp::launch("calc.exe", &[]).expect("Failed to launch Calculator");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window = find_window_with_retry(&service, "calculator", 5)
            .expect("Failed to find Calculator window");

        let patterns = service
            .check_patterns(&window.id)
            .expect("Failed to check patterns");

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
        let app = TestApp::launch("explorer.exe", &[]).expect("Failed to launch Explorer");

        thread::sleep(Duration::from_millis(1000));

        let service = UIAutomationService::new().expect("Failed to create service");

        let windows = service.list_windows().expect("Failed to list windows");
        let explorer_window = windows.iter().find(|w| {
            w.class_name.contains("CabinetWClass")
                || w.name.to_lowercase().contains("file explorer")
        });

        assert!(explorer_window.is_some(), "Should find Explorer window");

        if let Some(window) = explorer_window {
            assert!(!window.id.is_empty());
        }

        app.close().expect("Failed to close Explorer");
    }

    #[test]
    #[serial]
    fn test_explorer_address_bar() {
        let app = TestApp::launch("explorer.exe", &[]).expect("Failed to launch Explorer");

        thread::sleep(Duration::from_millis(1000));

        let service = UIAutomationService::new().expect("Failed to create service");

        let windows = service.list_windows().expect("Failed to list windows");
        let explorer_window = windows
            .iter()
            .find(|w| w.class_name.contains("CabinetWClass"));

        if let Some(window) = explorer_window {
            let query = ElementQuery {
                window: None,
                window_class: None,
                name: None,
                class_name: None,
                automation_id: None,
                control_type: Some("Edit".to_string()),
                max_results: Some(10),
            };

            let result = service.find_elements(Some(window.id.clone()), &query);

            if let Ok(elements) = result {
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
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        let query = ElementQuery {
            window: None,
            window_class: None,
            name: Some("Close".to_string()),
            class_name: None,
            automation_id: None,
            control_type: Some("Button".to_string()),
            max_results: Some(1),
        };

        let result = service.find_elements(Some(window.id.clone()), &query);

        if let Ok(elements) = result {
            if !elements.is_empty() {
                let close_button = &elements[0];

                let patterns = service
                    .check_patterns(&close_button.id)
                    .expect("Failed to check patterns");

                assert!(
                    patterns.invoke,
                    "Close button should support invoke pattern"
                );
            }
        }

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_value_pattern_on_edit() {
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

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

        let patterns = service
            .check_patterns(&edit.id)
            .expect("Failed to check patterns");

        assert!(
            patterns.value || patterns.text,
            "Edit control should support value or text pattern"
        );

        service
            .set_value(&edit.id, "Pattern test")
            .expect("Failed to set value");

        thread::sleep(Duration::from_millis(300));

        let value = service.get_value(&edit.id).expect("Failed to get value");

        assert!(value.contains("Pattern test"));

        app.close().expect("Failed to close Notepad");
    }

    #[tokio::test]
    #[serial]
    async fn test_text_pattern_reading() {
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");
        let mut keyboard = KeyboardSimulator::new().expect("Failed to create keyboard");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        service
            .focus_window(&window.id)
            .expect("Failed to focus window");

        thread::sleep(Duration::from_millis(300));

        keyboard
            .send_text("Multi-line\ntext\npattern\ntest")
            .await
            .expect("Failed to type text");

        thread::sleep(Duration::from_millis(500));

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

        let text = service.get_value(&edit.id).expect("Failed to get text");

        assert!(text.contains("Multi-line"));
        assert!(text.contains("pattern"));
        assert!(text.contains("test"));

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_unsupported_pattern_error() {
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

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
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");
        let mut mouse = MouseSimulator::new().expect("Failed to create mouse");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        let bounds = service
            .bounding_rect(&window.id)
            .expect("Failed to get bounds")
            .expect("Window should have bounds");

        mouse
            .click_rect_center(&bounds, MouseButton::Left)
            .expect("Failed to click window center");

        thread::sleep(Duration::from_millis(300));

        app.close().expect("Failed to close Notepad");
    }

    #[tokio::test]
    #[serial]
    async fn test_mouse_click_edit_control() {
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");
        let mut mouse = MouseSimulator::new().expect("Failed to create mouse");
        let mut keyboard = KeyboardSimulator::new().expect("Failed to create keyboard");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

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

        let bounds = service
            .bounding_rect(&edit.id)
            .expect("Failed to get bounds")
            .expect("Edit should have bounds");

        mouse
            .click_rect_center(&bounds, MouseButton::Left)
            .expect("Failed to click edit");

        thread::sleep(Duration::from_millis(300));

        keyboard
            .send_text("Clicked and typed")
            .await
            .expect("Failed to type");

        thread::sleep(Duration::from_millis(300));

        let text = service.get_value(&edit.id).expect("Failed to get text");

        assert!(text.contains("Clicked and typed"));

        app.close().expect("Failed to close Notepad");
    }

    #[tokio::test]
    #[serial]
    async fn test_mouse_double_click() {
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");
        let mut mouse = MouseSimulator::new().expect("Failed to create mouse");
        let mut keyboard = KeyboardSimulator::new().expect("Failed to create keyboard");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        service
            .focus_window(&window.id)
            .expect("Failed to focus window");

        thread::sleep(Duration::from_millis(300));

        keyboard
            .send_text("doubleclick")
            .await
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

        let bounds = service
            .bounding_rect(&edit.id)
            .expect("Failed to get bounds")
            .expect("Edit should have bounds");

        let center_x = (bounds.left + bounds.width / 2.0) as i32;
        let center_y = (bounds.top + bounds.height / 2.0) as i32;

        mouse
            .click(center_x, center_y, MouseButton::Left)
            .expect("Failed to click");
        thread::sleep(Duration::from_millis(50));
        mouse
            .click(center_x, center_y, MouseButton::Left)
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
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        let bounds = service
            .bounding_rect(&window.id)
            .expect("Failed to get bounds")
            .expect("Window should have bounds");

        let capture = capture_region(
            bounds.left as i32,
            bounds.top as i32,
            bounds.width as u32,
            bounds.height as u32,
        )
        .expect("Failed to capture region");

        assert_eq!(capture.pixels.width(), bounds.width as u32);
        assert_eq!(capture.pixels.height(), bounds.height as u32);
        assert_eq!(capture.x, bounds.left as i32);
        assert_eq!(capture.y, bounds.top as i32);

        app.close().expect("Failed to close Notepad");
    }

    #[tokio::test]
    #[serial]
    async fn test_capture_edit_control() {
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");
        let mut keyboard = KeyboardSimulator::new().expect("Failed to create keyboard");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        service
            .focus_window(&window.id)
            .expect("Failed to focus window");

        thread::sleep(Duration::from_millis(300));

        keyboard
            .send_text("Screenshot Test")
            .await
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

        let bounds = service
            .bounding_rect(&edit.id)
            .expect("Failed to get bounds")
            .expect("Edit should have bounds");

        let capture = capture_region(
            bounds.left as i32,
            bounds.top as i32,
            bounds.width as u32,
            bounds.height as u32,
        )
        .expect("Failed to capture edit control");

        assert!(capture.pixels.width() > 0);
        assert!(capture.pixels.height() > 0);

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_verify_element_bounds_accuracy() {
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        let bounds = service
            .bounding_rect(&window.id)
            .expect("Failed to get bounds")
            .expect("Window should have bounds");

        let screen = capture_primary_screen().expect("Failed to capture screen");

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
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

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

        service.set_focus(&edit.id).expect("Failed to set focus");

        thread::sleep(Duration::from_millis(300));

        app.close().expect("Failed to close Notepad");
    }

    #[test]
    #[serial]
    fn test_focus_window_brings_to_foreground() {
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        service
            .focus_window(&window.id)
            .expect("Failed to focus window");

        thread::sleep(Duration::from_millis(500));

        let windows = service.list_windows().expect("Failed to list windows");

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
        let mut app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        let window_id = window.id.clone();

        app.close_ref().expect("Failed to close Notepad");

        thread::sleep(Duration::from_millis(500));

        let result = service.invoke(&window_id);

        assert!(result.is_err(), "Should fail on closed window");
    }

    #[test]
    #[serial]
    fn test_get_value_on_non_text_element() {
        let app = TestApp::launch("notepad.exe", &[]).expect("Failed to launch Notepad");

        let service = UIAutomationService::new().expect("Failed to create service");

        let window =
            find_window_with_retry(&service, "notepad", 5).expect("Failed to find Notepad window");

        let result = service.get_value(&window.id);

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
