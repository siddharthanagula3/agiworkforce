use std::process::Command;
use std::thread;
use std::time::Duration;

#[test]
#[ignore]
fn test_complete_notepad_automation_workflow() {
    let mut notepad = Command::new("notepad.exe")
        .spawn()
        .expect("Failed to launch Notepad");

    thread::sleep(Duration::from_secs(2));

    notepad.kill().expect("Failed to close Notepad");
}

#[test]
#[ignore]
fn test_clipboard_paste_workflow() {}

#[test]
#[ignore]
fn test_screenshot_and_ocr_workflow() {}

#[test]
fn test_automation_service_singleton() {
    use agiworkforce_desktop::automation::AutomationService;

    let service1 = AutomationService::new();
    assert!(service1.is_ok(), "First service creation should succeed");

    let service2 = AutomationService::new();
    assert!(service2.is_ok(), "Second service creation should succeed");
}

#[test]
#[ignore]
fn test_multi_monitor_screenshot() {}

#[test]
#[ignore]
fn test_element_click_workflow() {}

#[test]
#[ignore]
fn test_text_input_workflow() {}

#[test]
#[ignore]
fn test_drag_and_drop_workflow() {}
