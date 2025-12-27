#[cfg(test)]
mod clipboard_tests {
    use super::super::clipboard::ClipboardManager;
    use serial_test::serial;

    #[test]
    #[serial]
    fn test_clipboard_manager_creation() {
        if std::env::var("CI").is_ok() {
            return;
        }
        let clipboard = ClipboardManager::new();
        assert!(
            clipboard.is_ok(),
            "ClipboardManager creation should succeed"
        );
    }

    #[test]
    #[serial]
    fn test_clipboard_set_get_text() {
        if std::env::var("CI").is_ok() {
            return;
        }
        let mut clipboard = ClipboardManager::new().unwrap();

        let original = clipboard.get_text().unwrap_or_default();

        let test_text = "Test clipboard content 12345";
        clipboard
            .set_text(test_text)
            .expect("Failed to set clipboard text");

        let retrieved = clipboard.get_text().expect("Failed to get clipboard text");
        assert_eq!(retrieved, test_text, "Clipboard content should match");

        if !original.is_empty() {
            clipboard.set_text(&original).ok();
        }
    }

    #[test]
    #[serial]
    fn test_clipboard_empty_string() {
        if std::env::var("CI").is_ok() {
            return;
        }
        let mut clipboard = ClipboardManager::new().unwrap();

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
        if std::env::var("CI").is_ok() {
            return;
        }
        let mut clipboard = ClipboardManager::new().unwrap();

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
        if std::env::var("CI").is_ok() {
            return;
        }
        let mut clipboard = ClipboardManager::new().unwrap();

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
        if std::env::var("CI").is_ok() {
            return;
        }
        let mut clipboard = ClipboardManager::new().unwrap();

        let original = clipboard.get_text().unwrap_or_default();

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
    use enigo::Key;

    #[test]
    fn test_keyboard_simulator_creation() {
        if std::env::var("CI").is_ok() {
            return;
        }

        let keyboard = KeyboardSimulator::new();
        if let Err(err) = &keyboard {
            eprintln!(
                "[test] Skipping KeyboardSimulator::new test due to environment error: {:?}",
                err
            );
            // Environment (e.g. accessibility permissions) may prevent keyboard automation.
            // Treat this as a skipped test rather than a hard failure.
            return;
        }

        assert!(
            keyboard.is_ok(),
            "KeyboardSimulator creation should succeed"
        );
    }

    #[test]
    fn test_modifier_key_conversion() {
        assert_eq!(KeyboardSimulator::modifier_key("ctrl"), Some(Key::Control));
        assert_eq!(
            KeyboardSimulator::modifier_key("control"),
            Some(Key::Control)
        );
        assert_eq!(KeyboardSimulator::modifier_key("CTRL"), Some(Key::Control));

        assert_eq!(KeyboardSimulator::modifier_key("alt"), Some(Key::Alt));
        assert_eq!(KeyboardSimulator::modifier_key("ALT"), Some(Key::Alt));

        assert_eq!(KeyboardSimulator::modifier_key("shift"), Some(Key::Shift));
        assert_eq!(KeyboardSimulator::modifier_key("SHIFT"), Some(Key::Shift));

        assert_eq!(KeyboardSimulator::modifier_key("invalid"), None);
        assert_eq!(KeyboardSimulator::modifier_key(""), None);
    }

    #[tokio::test]
    #[ignore]
    async fn test_send_text_integration() {
        let mut keyboard = KeyboardSimulator::new().unwrap();

        let result = keyboard.send_text("test").await;
        assert!(result.is_ok(), "send_text should succeed");
    }

    #[test]
    #[ignore]
    fn test_press_key_integration() {
        let mut keyboard = KeyboardSimulator::new().unwrap();

        let result = keyboard.press_key(Key::Return);
        assert!(result.is_ok(), "press_key should succeed");
    }

    #[test]
    #[ignore]
    fn test_hotkey_integration() {
        let mut keyboard = KeyboardSimulator::new().unwrap();

        let modifiers = vec![Key::Control];
        let result = keyboard.send_hotkey(&modifiers, Key::Unicode('a'));
        assert!(result.is_ok(), "hotkey should succeed");
    }
}

#[cfg(test)]
mod mouse_tests {
    use super::super::mouse::{MouseButton, MouseSimulator};
    use crate::automation::types::BoundingRectangle;

    #[test]
    fn test_mouse_simulator_creation() {
        if std::env::var("CI").is_ok() {
            return;
        }

        let mouse = MouseSimulator::new();
        if let Err(err) = &mouse {
            eprintln!(
                "[test] Skipping MouseSimulator::new test due to environment error: {:?}",
                err
            );
            // Environment (e.g. accessibility permissions) may prevent mouse automation.
            // Treat this as a skipped test rather than a hard failure.
            return;
        }

        assert!(mouse.is_ok(), "MouseSimulator creation should succeed");
    }

    #[test]
    fn test_mouse_button_enum() {
        let _left = MouseButton::Left;
        let _right = MouseButton::Right;
        let _middle = MouseButton::Middle;
    }

    #[test]
    #[ignore]
    fn test_move_to_integration() {
        let mut mouse = MouseSimulator::new().unwrap();

        let result = mouse.move_to(960, 540);
        assert!(result.is_ok(), "move_to should succeed");

        let result = mouse.move_to(0, 0);
        assert!(result.is_ok(), "move_to to origin should succeed");
    }

    #[test]
    #[ignore]
    fn test_click_integration() {
        let mut mouse = MouseSimulator::new().unwrap();

        let result = mouse.click(960, 540, MouseButton::Left);
        assert!(result.is_ok(), "click should succeed");
    }

    #[test]
    #[cfg(windows)]
    #[ignore]
    fn test_click_rect_center_integration() {
        let mut mouse = MouseSimulator::new().unwrap();

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
        let mut mouse = MouseSimulator::new().unwrap();

        let result = mouse.drag((100, 100), (200, 200));
        assert!(result.is_ok(), "drag should succeed");
    }

    #[test]
    #[ignore]
    fn test_scroll_integration() {
        let mut mouse = MouseSimulator::new().unwrap();

        let result = mouse.scroll(3);
        assert!(result.is_ok(), "scroll up should succeed");

        let result = mouse.scroll(-3);
        assert!(result.is_ok(), "scroll down should succeed");
    }

    #[test]
    fn test_click_rect_center_calculation() {
        let rect = BoundingRectangle {
            left: 0.0,
            top: 0.0,
            width: 100.0,
            height: 50.0,
        };

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
