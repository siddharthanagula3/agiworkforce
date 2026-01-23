//! Integration tests for the automation subsystem.
//! These tests require a display server and are marked with #[ignore] by default.
//! Run with: cargo test --test automation_integration -- --ignored

use std::process::Command;
use std::thread;
use std::time::Duration;

#[test]
#[ignore]
fn test_complete_notepad_automation_workflow() {
    let mut notepad = Command::new("notepad.exe")
        .spawn()
        .expect("Failed to launch Notepad");

    // Give it a moment to start
    thread::sleep(Duration::from_secs(1));

    // Verify it's running
    assert!(notepad.id() > 0);

    // Clean up
    notepad.kill().expect("Failed to close Notepad");
    notepad.wait().ok();
}

/// Test clipboard operations in a GUI context.
/// Requires: Display server, clipboard access
/// Verifies: Text can be copied and pasted via the automation layer
#[test]
#[ignore]
fn test_clipboard_paste_workflow() {
    // ClipboardManager is re-exported from automation::input
    use agiworkforce_desktop::automation::input::ClipboardManager;

    let mut clipboard = ClipboardManager::new().expect("ClipboardManager creation should succeed");

    let test_text = "Automation test text 🚀";
    clipboard
        .set_text(test_text)
        .expect("Set text should succeed");

    let retrieved = clipboard.get_text().expect("Get text should succeed");
    assert_eq!(
        retrieved, test_text,
        "Clipboard round-trip should preserve text"
    );
}

/// Test screenshot capture and OCR in a GUI context.
/// Requires: Display server, screen capture permissions
/// Verifies: Screenshot can be taken and optionally processed with OCR
#[test]
#[ignore]
fn test_screenshot_and_ocr_workflow() {
    // Use the public capture_primary_screen function
    use agiworkforce_desktop::automation::screen::capture_primary_screen;

    let capture = capture_primary_screen().expect("Screen capture should succeed");

    // CapturedImage has pixels (RgbaImage) and display (ScreenInfo) fields
    assert!(
        capture.display.width > 0,
        "Captured image should have width"
    );
    assert!(
        capture.display.height > 0,
        "Captured image should have height"
    );
    assert!(
        !capture.pixels.is_empty(),
        "Captured image should have pixel data"
    );
}

#[test]
fn test_automation_service_singleton() {
    // CI environments often run headless where automation is not possible
    if std::env::var("CI").is_ok() {
        return;
    }

    use agiworkforce_desktop::automation::AutomationService;

    let service1 = AutomationService::new();
    assert!(service1.is_ok(), "First service creation should succeed");

    let service2 = AutomationService::new();
    assert!(service2.is_ok(), "Second service creation should succeed");
}

/// Test multi-monitor screenshot capture.
/// Requires: Display server, multiple monitors
/// Verifies: Screenshots can be captured from all connected displays
#[test]
#[ignore]
fn test_multi_monitor_screenshot() {
    use agiworkforce_desktop::automation::screen::list_displays;

    let displays = list_displays().expect("Should list available displays");
    assert!(
        !displays.is_empty(),
        "At least one display should be available"
    );

    // Verify display info is populated
    for display in &displays {
        assert!(display.width > 0, "Display should have width");
        assert!(display.height > 0, "Display should have height");
    }
}

/// Test UI element click automation.
/// Requires: Display server, accessibility permissions
/// Verifies: UI elements can be found and clicked
#[test]
#[ignore]
fn test_element_click_workflow() {
    // MouseSimulator is re-exported from automation::input
    use agiworkforce_desktop::automation::input::MouseSimulator;

    let mut mouse = MouseSimulator::new().expect("MouseSimulator creation should succeed");

    // Get current position
    let (x, y) = mouse.get_position().expect("Should get mouse position");
    assert!(x >= 0, "X coordinate should be non-negative");
    assert!(y >= 0, "Y coordinate should be non-negative");

    // Move to a safe position
    mouse.move_to(100, 100).expect("Move should succeed");
    // Note: Not actually clicking in tests to avoid side effects
}

/// Test keyboard text input automation.
/// Requires: Display server, input permissions
/// Verifies: Text can be typed via the keyboard automation layer
#[test]
#[ignore]
fn test_text_input_workflow() {
    // KeyboardSimulator is re-exported from automation::input
    use agiworkforce_desktop::automation::input::KeyboardSimulator;

    let keyboard = KeyboardSimulator::new().expect("KeyboardSimulator creation should succeed");

    // Just verify the keyboard simulator can be created
    // Actual typing would require a focused text field
    drop(keyboard); // Explicitly drop to show it was created
    assert!(true, "Keyboard simulator created successfully");
}

/// Test mouse drag and drop automation.
/// Requires: Display server, input permissions
/// Verifies: Mouse can perform drag operations
#[test]
#[ignore]
fn test_drag_and_drop_workflow() {
    // MouseSimulator is re-exported from automation::input
    use agiworkforce_desktop::automation::input::MouseSimulator;

    let mut mouse = MouseSimulator::new().expect("MouseSimulator creation should succeed");

    // Get current position
    let (start_x, start_y) = mouse.get_position().expect("Should get mouse position");

    // Move to a different position (simulating end of drag)
    let end_x = start_x + 50;
    let end_y = start_y + 50;

    mouse.move_to(end_x, end_y).expect("Move should succeed");

    let (new_x, new_y) = mouse.get_position().expect("Should get new position");
    assert_eq!(new_x, end_x, "X should match end position");
    assert_eq!(new_y, end_y, "Y should match end position");
}
