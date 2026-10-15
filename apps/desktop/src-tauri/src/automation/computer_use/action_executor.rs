//! Input the observe-plan-act loop sends: keystroke sequences for file
//! pickers and dialogs, key names, and the wheel motion of a scroll.

use anyhow::Result;
use std::time::Duration;
use tokio::time::sleep;

use crate::automation::input::KeyboardSimulator;

use super::control::{ensure_agent_in_control, PickerKeystroke, PickerModifier};
use super::types::ScrollDirection;

pub async fn run_keystrokes(strokes: &[PickerKeystroke]) -> Result<()> {
    let mut keyboard = KeyboardSimulator::new()?;
    for stroke in strokes {
        ensure_agent_in_control()?;
        match stroke {
            PickerKeystroke::Chord(modifiers, key) => {
                let mods: Vec<enigo::Key> = modifiers
                    .iter()
                    .map(|modifier| match modifier {
                        PickerModifier::Command => enigo::Key::Meta,
                        PickerModifier::Control => enigo::Key::Control,
                        PickerModifier::Shift => enigo::Key::Shift,
                        PickerModifier::Alt => enigo::Key::Alt,
                    })
                    .collect();
                keyboard.send_hotkey(&mods, enigo::Key::Unicode(*key))?;
            }
            PickerKeystroke::Text(text) => keyboard.send_text_with_delay(text, 5).await?,
            PickerKeystroke::Enter => keyboard.tap_key(enigo::Key::Return)?,
            PickerKeystroke::Escape => keyboard.tap_key(enigo::Key::Escape)?,
            PickerKeystroke::Pause(ms) => sleep(Duration::from_millis(*ms)).await,
        }
    }
    Ok(())
}

/// Parses a key string to enigo Key.
pub fn parse_key(key: &str) -> Option<enigo::Key> {
    match key.to_lowercase().as_str() {
        "enter" | "return" => Some(enigo::Key::Return),
        "tab" => Some(enigo::Key::Tab),
        "space" => Some(enigo::Key::Space),
        "backspace" => Some(enigo::Key::Backspace),
        "delete" => Some(enigo::Key::Delete),
        "escape" | "esc" => Some(enigo::Key::Escape),
        "up" | "uparrow" => Some(enigo::Key::UpArrow),
        "down" | "downarrow" => Some(enigo::Key::DownArrow),
        "left" | "leftarrow" => Some(enigo::Key::LeftArrow),
        "right" | "rightarrow" => Some(enigo::Key::RightArrow),
        "home" => Some(enigo::Key::Home),
        "end" => Some(enigo::Key::End),
        "pageup" => Some(enigo::Key::PageUp),
        "pagedown" => Some(enigo::Key::PageDown),
        "f1" => Some(enigo::Key::F1),
        "f2" => Some(enigo::Key::F2),
        "f3" => Some(enigo::Key::F3),
        "f4" => Some(enigo::Key::F4),
        "f5" => Some(enigo::Key::F5),
        "f6" => Some(enigo::Key::F6),
        "f7" => Some(enigo::Key::F7),
        "f8" => Some(enigo::Key::F8),
        "f9" => Some(enigo::Key::F9),
        "f10" => Some(enigo::Key::F10),
        "f11" => Some(enigo::Key::F11),
        "f12" => Some(enigo::Key::F12),
        s if s.len() == 1 => s.chars().next().map(enigo::Key::Unicode),
        _ => None,
    }
}

/// The wheel axis and signed length for a scroll. enigo scrolls down and to
/// the right for a positive length, on every platform.
pub fn wheel_motion(direction: ScrollDirection, amount: i32) -> (enigo::Axis, i32) {
    match direction {
        ScrollDirection::Up => (enigo::Axis::Vertical, -amount),
        ScrollDirection::Down => (enigo::Axis::Vertical, amount),
        ScrollDirection::Left => (enigo::Axis::Horizontal, -amount),
        ScrollDirection::Right => (enigo::Axis::Horizontal, amount),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_key_basic() {
        assert!(matches!(parse_key("enter"), Some(enigo::Key::Return)));
        assert!(matches!(parse_key("Enter"), Some(enigo::Key::Return)));
        assert!(matches!(parse_key("tab"), Some(enigo::Key::Tab)));
        assert!(matches!(parse_key("escape"), Some(enigo::Key::Escape)));
        assert!(matches!(parse_key("esc"), Some(enigo::Key::Escape)));
        assert!(matches!(parse_key("space"), Some(enigo::Key::Space)));
    }

    #[test]
    fn test_parse_key_arrows() {
        assert!(matches!(parse_key("up"), Some(enigo::Key::UpArrow)));
        assert!(matches!(parse_key("down"), Some(enigo::Key::DownArrow)));
        assert!(matches!(parse_key("left"), Some(enigo::Key::LeftArrow)));
        assert!(matches!(parse_key("right"), Some(enigo::Key::RightArrow)));
    }

    #[test]
    fn test_parse_key_function_keys() {
        assert!(matches!(parse_key("f1"), Some(enigo::Key::F1)));
        assert!(matches!(parse_key("f12"), Some(enigo::Key::F12)));
    }

    #[test]
    fn test_parse_key_single_char() {
        assert!(matches!(parse_key("a"), Some(enigo::Key::Unicode('a'))));
        assert!(matches!(parse_key("z"), Some(enigo::Key::Unicode('z'))));
    }

    #[test]
    fn test_parse_key_unknown() {
        assert!(parse_key("unknown_key").is_none());
    }

    #[test]
    fn a_scroll_turns_the_wheel_the_way_it_was_asked() {
        assert_eq!(
            wheel_motion(ScrollDirection::Down, 3),
            (enigo::Axis::Vertical, 3)
        );
        assert_eq!(
            wheel_motion(ScrollDirection::Up, 3),
            (enigo::Axis::Vertical, -3)
        );
        assert_eq!(
            wheel_motion(ScrollDirection::Right, 2),
            (enigo::Axis::Horizontal, 2)
        );
        assert_eq!(
            wheel_motion(ScrollDirection::Left, 2),
            (enigo::Axis::Horizontal, -2)
        );
    }
}
