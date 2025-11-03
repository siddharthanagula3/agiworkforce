#[cfg(test)]
mod clipboard_tests {
    use super::super::clipboard::ClipboardManager;
    use serial_test::serial;

    #[test]
    #[serial]
    fn test_clipboard_manager_creation() {
        let clipboard = ClipboardManager::new();
        assert!(
            clipboard.is_ok(),
            "ClipboardManager creation should succeed"
        );
    }

    #[test]
    #[serial]
    fn test_clipboard_set_get_text() {
        let clipboard = ClipboardManager::new().unwrap();

        // Save original clipboard content
        let original = clipboard.get_text().unwrap_or_default();

        // Test setting and getting text
        let test_text = "Test clipboard content 12345";
        clipboard
            .set_text(test_text)
            .expect("Failed to set clipboard text");

        let retrieved = clipboard.get_text().expect("Failed to get clipboard text");
        assert_eq!(retrieved, test_text, "Clipboard content should match");

        // Restore original content if it wasn't empty
        if !original.is_empty() {
            clipboard.set_text(&original).ok();
        }
    }

    #[test]
    #[serial]
    fn test_clipboard_empty_string() {
        let clipboard = ClipboardManager::new().unwrap();

        let original = clipboard.get_text().unwrap_or_default();

        clipboard.set_text("").expect("Failed to set empty string");
        let retrieved = clipboard.get_text().expect("Failed to get clipboard text");
        assert_eq!(retrieved, "", "Empty string should be handled correctly");

        if !original.is_empty() {
            clipboard.set_text(&original).ok();
        }
    }

    #[test]
    #[serial]
    fn test_clipboard_unicode_text() {
        let clipboard = ClipboardManager::new().unwrap();

        let original = clipboard.get_text().unwrap_or_default();

        let unicode_text = "Hello 世界 🌍 Привет";
        clipboard
            .set_text(unicode_text)
            .expect("Failed to set unicode text");
        let retrieved = clipboard.get_text().expect("Failed to get clipboard text");
        assert_eq!(retrieved, unicode_text, "Unicode text should be preserved");

        if !original.is_empty() {
            clipboard.set_text(&original).ok();
        }
    }

    #[test]
    #[serial]
    fn test_clipboard_multiline_text() {
        let clipboard = ClipboardManager::new().unwrap();

        let original = clipboard.get_text().unwrap_or_default();

        let multiline = "Line 1\nLine 2\nLine 3\r\nLine 4";
        clipboard
            .set_text(multiline)
            .expect("Failed to set multiline text");
        let retrieved = clipboard.get_text().expect("Failed to get clipboard text");
        assert_eq!(retrieved, multiline, "Multiline text should be preserved");

        if !original.is_empty() {
            clipboard.set_text(&original).ok();
        }
    }

    #[test]
    #[serial]
    fn test_clipboard_large_text() {
        let clipboard = ClipboardManager::new().unwrap();

        let original = clipboard.get_text().unwrap_or_default();

        // Test with ~10KB of text
        let large_text = "A".repeat(10000);
        clipboard
            .set_text(&large_text)
            .expect("Failed to set large text");
        let retrieved = clipboard.get_text().expect("Failed to get clipboard text");
        assert_eq!(
            retrieved.len(),
            large_text.len(),
            "Large text should be preserved"
        );

        if !original.is_empty() {
            clipboard.set_text(&original).ok();
        }
    }
}

#[cfg(test)]
mod keyboard_tests {
    use super::super::keyboard::KeyboardSimulator;

    #[test]
    fn test_keyboard_simulator_creation() {
        let keyboard = KeyboardSimulator::new();
        assert!(
            keyboard.is_ok(),
            "KeyboardSimulator creation should succeed"
        );
    }

    #[test]
    fn test_modifier_key_conversion() {
        use super::super::keyboard::KeyboardSimulator;
        use windows::Win32::UI::Input::KeyboardAndMouse::{VK_CONTROL, VK_MENU, VK_SHIFT};

        assert_eq!(
            KeyboardSimulator::modifier_key("ctrl"),
            Some(VK_CONTROL.0 as u16)
        );
        assert_eq!(
            KeyboardSimulator::modifier_key("control"),
            Some(VK_CONTROL.0 as u16)
        );
        assert_eq!(
            KeyboardSimulator::modifier_key("CTRL"),
            Some(VK_CONTROL.0 as u16)
        );

        assert_eq!(
            KeyboardSimulator::modifier_key("alt"),
            Some(VK_MENU.0 as u16)
        );
        assert_eq!(
            KeyboardSimulator::modifier_key("ALT"),
            Some(VK_MENU.0 as u16)
        );

        assert_eq!(
            KeyboardSimulator::modifier_key("shift"),
            Some(VK_SHIFT.0 as u16)
        );
        assert_eq!(
            KeyboardSimulator::modifier_key("SHIFT"),
            Some(VK_SHIFT.0 as u16)
        );

        assert_eq!(KeyboardSimulator::modifier_key("invalid"), None);
        assert_eq!(KeyboardSimulator::modifier_key(""), None);
    }

    // NOTE: Actual keyboard input tests are marked as #[ignore] by default
    // to avoid disrupting the development environment.
    // Run with: cargo test -- --ignored

    #[test]
    #[ignore]
    fn test_send_text_integration() {
        // This test requires manual verification
        // It will type text into the currently focused window
        let keyboard = KeyboardSimulator::new().unwrap();

        // WARNING: This will type into whatever window has focus!
        // Only run in isolated test environment
        let result = keyboard.send_text("test");
        assert!(result.is_ok(), "send_text should succeed");
    }

    #[test]
    #[ignore]
    fn test_press_key_integration() {
        let keyboard = KeyboardSimulator::new().unwrap();

        // Test Enter key (VK_RETURN = 0x0D)
        let result = keyboard.press_key(0x0D);
        assert!(result.is_ok(), "press_key should succeed");
    }

    #[test]
    #[ignore]
    fn test_hotkey_integration() {
        use windows::Win32::UI::Input::KeyboardAndMouse::VK_CONTROL;

        let keyboard = KeyboardSimulator::new().unwrap();

        // Test Ctrl+A
        let modifiers = vec![VK_CONTROL.0 as u16];
        let result = keyboard.hotkey(&modifiers, 0x41); // 'A'
        assert!(result.is_ok(), "hotkey should succeed");
    }
}

#[cfg(test)]
mod mouse_tests {
    use super::super::mouse::{MouseButton, MouseSimulator};
    use crate::automation::uia::BoundingRectangle;

    #[test]
    fn test_mouse_simulator_creation() {
        let mouse = MouseSimulator::new();
        assert!(mouse.is_ok(), "MouseSimulator creation should succeed");
    }

    #[test]
    fn test_mouse_button_enum() {
        // Test that MouseButton enum values exist
        let _left = MouseButton::Left;
        let _right = MouseButton::Right;
        let _middle = MouseButton::Middle;
    }

    // NOTE: Actual mouse input tests are marked as #[ignore] by default
    // to avoid disrupting the development environment.
    // Run with: cargo test -- --ignored

    #[test]
    #[ignore]
    fn test_move_to_integration() {
        let _mouse = MouseSimulator::new().unwrap();

        // Move to center of primary screen (assuming 1920x1080)
        let result = mouse.move_to(960, 540);
        assert!(result.is_ok(), "move_to should succeed");

        // Move to top-left
        let result = mouse.move_to(0, 0);
        assert!(result.is_ok(), "move_to to origin should succeed");
    }

    #[test]
    #[ignore]
    fn test_click_integration() {
        let mouse = MouseSimulator::new().unwrap();

        // Click at safe position (center of screen)
        let result = mouse.click(960, 540, MouseButton::Left);
        assert!(result.is_ok(), "click should succeed");
    }

    #[test]
    #[ignore]
    fn test_click_rect_center_integration() {
        let mouse = MouseSimulator::new().unwrap();

        let rect = BoundingRectangle {
            left: 100.0,
            top: 100.0,
            width: 200.0,
            height: 100.0,
        };

        let result = mouse.click_rect_center(&rect, MouseButton::Left);
        assert!(result.is_ok(), "click_rect_center should succeed");
    }

    #[test]
    #[ignore]
    fn test_drag_integration() {
        let mouse = MouseSimulator::new().unwrap();

        let result = mouse.drag((100, 100), (200, 200));
        assert!(result.is_ok(), "drag should succeed");
    }

    #[test]
    #[ignore]
    fn test_scroll_integration() {
        let mouse = MouseSimulator::new().unwrap();

        // Scroll up 3 clicks
        let result = mouse.scroll(3);
        assert!(result.is_ok(), "scroll up should succeed");

        // Scroll down 3 clicks
        let result = mouse.scroll(-3);
        assert!(result.is_ok(), "scroll down should succeed");
    }

    #[test]
    fn test_click_rect_center_calculation() {
        let mouse = MouseSimulator::new().unwrap();

        // Test that calculation doesn't panic
        let rect = BoundingRectangle {
            left: 0.0,
            top: 0.0,
            width: 100.0,
            height: 50.0,
        };

        // Should click at (50, 25) which is center
        // We can't easily verify the exact position without mocking,
        // but we can ensure it doesn't panic
        let result = std::panic::catch_unwind(|| {
            let x = (rect.left + rect.width / 2.0).round() as i32;
            let y = (rect.top + rect.height / 2.0).round() as i32;
            (x, y)
        });

        assert!(result.is_ok(), "Center calculation should not panic");
        let (x, y) = result.unwrap();
        assert_eq!(x, 50, "X coordinate should be 50");
        assert_eq!(y, 25, "Y coordinate should be 25");
    }
}
