//! Shared Action Executor for Computer Use.
//!
//! Extracted from the OPA loop to be reusable by both the original
//! `ComputerUseAgent` and the new `AnthropicComputerUseAgent`.

use anyhow::Result;
use std::time::Duration;
use tokio::time::sleep;

use crate::automation::input::{
    KeyboardSimulator, MouseButton as InputMouseButton, MouseSimulator,
};
use crate::automation::screen::{capture_primary_screen, list_displays, ScreenInfo};

use super::types::{
    ComputerUseAction, Coordinate, HotkeyModifier, MouseButton, ScrollDirection, WaitCondition,
};
use super::window_manager::WindowCoordinator;

/// Executes `ComputerUseAction` variants using the platform's input simulation.
///
/// Handles coordinate translation for HiDPI displays. Does NOT handle
/// advanced wait conditions (TextAppears, ScreenStable) — those require a
/// `VisualReasoner` and remain in the caller's responsibility.
pub struct ActionExecutor {
    window_coordinator: WindowCoordinator,
}

impl ActionExecutor {
    /// Creates a new executor with the given window coordinator.
    pub fn new(window_coordinator: WindowCoordinator) -> Self {
        Self {
            window_coordinator,
        }
    }

    /// Executes a single `ComputerUseAction`.
    ///
    /// Returns `Ok(())` on success. For `Wait` conditions beyond `Duration`,
    /// falls back to sleeping for the condition's max duration.
    pub async fn execute(&self, action: &ComputerUseAction) -> Result<()> {
        let primary_display = resolve_primary_display()?;

        match action {
            ComputerUseAction::Click { x, y, button } => {
                let mut mouse = MouseSimulator::new()?;
                let btn = match button {
                    MouseButton::Left => InputMouseButton::Left,
                    MouseButton::Right => InputMouseButton::Right,
                    MouseButton::Middle => InputMouseButton::Middle,
                };
                let (input_x, input_y) = translate_capture_point(*x, *y, &primary_display);
                mouse.click(input_x, input_y, btn)?;
            }
            ComputerUseAction::DoubleClick { x, y } => {
                let mut mouse = MouseSimulator::new()?;
                let (input_x, input_y) = translate_capture_point(*x, *y, &primary_display);
                mouse.double_click(input_x, input_y).await?;
            }
            ComputerUseAction::TripleClick { x, y } => {
                let mut mouse = MouseSimulator::new()?;
                let (input_x, input_y) = translate_capture_point(*x, *y, &primary_display);
                mouse.click(input_x, input_y, InputMouseButton::Left)?;
                sleep(Duration::from_millis(50)).await;
                mouse.click(input_x, input_y, InputMouseButton::Left)?;
                sleep(Duration::from_millis(50)).await;
                mouse.click(input_x, input_y, InputMouseButton::Left)?;
            }
            ComputerUseAction::RightClick { x, y } => {
                let mut mouse = MouseSimulator::new()?;
                let (input_x, input_y) = translate_capture_point(*x, *y, &primary_display);
                mouse.click(input_x, input_y, InputMouseButton::Right)?;
            }
            ComputerUseAction::Type { text, delay_ms } => {
                let mut keyboard = KeyboardSimulator::new()?;
                keyboard.send_text_with_delay(text, *delay_ms).await?;
            }
            ComputerUseAction::KeyPress { key } => {
                let mut keyboard = KeyboardSimulator::new()?;
                if let Some(k) = parse_key(key) {
                    keyboard.tap_key(k)?;
                }
            }
            ComputerUseAction::Hotkey { modifiers, key } => {
                let mut keyboard = KeyboardSimulator::new()?;
                let mods: Vec<enigo::Key> = modifiers
                    .iter()
                    .map(|m| match m {
                        HotkeyModifier::Ctrl => enigo::Key::Control,
                        HotkeyModifier::Alt => enigo::Key::Alt,
                        HotkeyModifier::Shift => enigo::Key::Shift,
                        HotkeyModifier::Meta => enigo::Key::Meta,
                    })
                    .collect();

                if let Some(k) = parse_key(key) {
                    keyboard.send_hotkey(&mods, k)?;
                }
            }
            ComputerUseAction::Scroll {
                direction,
                amount,
                at,
            } => {
                let mut mouse = MouseSimulator::new()?;

                if let Some(coord) = at {
                    let translated = translate_capture_coordinate(*coord, &primary_display);
                    mouse.move_to(translated.x, translated.y)?;
                }

                let scroll_amount = match direction {
                    ScrollDirection::Up | ScrollDirection::Left => *amount,
                    ScrollDirection::Down | ScrollDirection::Right => -*amount,
                };

                mouse.scroll(scroll_amount)?;
            }
            ComputerUseAction::Drag {
                from,
                to,
                duration_ms,
            } => {
                let mut mouse = MouseSimulator::new()?;
                let input_from = translate_capture_coordinate(*from, &primary_display);
                let input_to = translate_capture_coordinate(*to, &primary_display);
                mouse
                    .drag_and_drop(
                        input_from.x,
                        input_from.y,
                        input_to.x,
                        input_to.y,
                        *duration_ms,
                    )
                    .await?;
            }
            ComputerUseAction::MoveMouse { x, y, smooth } => {
                let mut mouse = MouseSimulator::new()?;
                let (input_x, input_y) = translate_capture_point(*x, *y, &primary_display);
                if *smooth {
                    mouse.move_to_smooth(input_x, input_y, 200).await?;
                } else {
                    mouse.move_to(input_x, input_y)?;
                }
            }
            ComputerUseAction::Wait { condition } => {
                // Basic wait handling. Advanced conditions (TextAppears, ScreenStable)
                // are handled by the caller with a VisualReasoner if available.
                match condition {
                    WaitCondition::Duration { ms } => {
                        sleep(Duration::from_millis(*ms)).await;
                    }
                    WaitCondition::WindowAppears {
                        title_contains,
                        timeout_ms,
                    } => {
                        let _ = self
                            .window_coordinator
                            .wait_for_window(
                                title_contains,
                                Duration::from_millis(*timeout_ms),
                            )
                            .await;
                    }
                    other => {
                        // Fallback: sleep for the condition's max duration
                        sleep(other.max_duration()).await;
                    }
                }
            }
            ComputerUseAction::Screenshot {
                region: _,
                save_path,
            } => {
                let screenshot = capture_primary_screen()?;
                if let Some(path) = save_path {
                    screenshot.pixels.save(path)?;
                }
            }
            ComputerUseAction::FocusWindow { title } => {
                self.window_coordinator.activate_by_title(title).await;
            }
            ComputerUseAction::LaunchApplication { name } => {
                self.window_coordinator.launch_application(name).await?;
            }
            ComputerUseAction::Copy => {
                let mut keyboard = KeyboardSimulator::new()?;
                #[cfg(target_os = "macos")]
                keyboard.send_hotkey(&[enigo::Key::Meta], enigo::Key::Unicode('c'))?;
                #[cfg(not(target_os = "macos"))]
                keyboard.send_hotkey(&[enigo::Key::Control], enigo::Key::Unicode('c'))?;
            }
            ComputerUseAction::Paste => {
                let mut keyboard = KeyboardSimulator::new()?;
                #[cfg(target_os = "macos")]
                keyboard.send_hotkey(&[enigo::Key::Meta], enigo::Key::Unicode('v'))?;
                #[cfg(not(target_os = "macos"))]
                keyboard.send_hotkey(&[enigo::Key::Control], enigo::Key::Unicode('v'))?;
            }
            ComputerUseAction::SelectAll => {
                let mut keyboard = KeyboardSimulator::new()?;
                #[cfg(target_os = "macos")]
                keyboard.send_hotkey(&[enigo::Key::Meta], enigo::Key::Unicode('a'))?;
                #[cfg(not(target_os = "macos"))]
                keyboard.send_hotkey(&[enigo::Key::Control], enigo::Key::Unicode('a'))?;
            }
            ComputerUseAction::Undo => {
                let mut keyboard = KeyboardSimulator::new()?;
                #[cfg(target_os = "macos")]
                keyboard.send_hotkey(&[enigo::Key::Meta], enigo::Key::Unicode('z'))?;
                #[cfg(not(target_os = "macos"))]
                keyboard.send_hotkey(&[enigo::Key::Control], enigo::Key::Unicode('z'))?;
            }
            ComputerUseAction::Redo => {
                let mut keyboard = KeyboardSimulator::new()?;
                #[cfg(target_os = "macos")]
                keyboard.send_hotkey(
                    &[enigo::Key::Meta, enigo::Key::Shift],
                    enigo::Key::Unicode('z'),
                )?;
                #[cfg(not(target_os = "macos"))]
                keyboard.send_hotkey(&[enigo::Key::Control], enigo::Key::Unicode('y'))?;
            }
            ComputerUseAction::Zoom {
                region,
                zoom_level,
                capture_screenshot: _,
            } => {
                let zoom_action = super::zoom::ZoomAction::new(
                    super::zoom::Region::from_element_bounds(region),
                    super::zoom::ZoomLevel::from_factor(*zoom_level),
                );
                let zoom_result = super::zoom::zoom_region(&zoom_action)?;
                tracing::info!(
                    "Zoomed region at ({}, {}) {}x{} with {}x magnification — zoomed image {}x{} ({} bytes base64)",
                    region.left,
                    region.top,
                    region.width,
                    region.height,
                    zoom_level,
                    zoom_result.width,
                    zoom_result.height,
                    zoom_result.image_base64.len(),
                );
            }
        }

        Ok(())
    }
}

/// Parses a key name string into an enigo `Key`.
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

/// Translates a coordinate from capture space to input space, accounting for HiDPI.
pub fn translate_capture_coordinate(coord: Coordinate, display: &ScreenInfo) -> Coordinate {
    Coordinate::new(
        display.x + ((coord.x as f32) / display.scale_factor).round() as i32,
        display.y + ((coord.y as f32) / display.scale_factor).round() as i32,
    )
}

/// Translates an (x, y) point from capture space to input space.
pub fn translate_capture_point(x: i32, y: i32, display: &ScreenInfo) -> (i32, i32) {
    let translated = translate_capture_coordinate(Coordinate::new(x, y), display);
    (translated.x, translated.y)
}

/// Resolves the primary display for coordinate translation.
pub fn resolve_primary_display() -> Result<ScreenInfo> {
    let displays = list_displays()?;
    if let Some(primary) = displays.iter().find(|display| display.is_primary) {
        return Ok(primary.clone());
    }

    displays
        .into_iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("No display available for coordinate translation"))
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
    fn test_translate_capture_coordinate_hidpi() {
        let display = ScreenInfo {
            id: 0,
            x: 100,
            y: 50,
            width: 1440,
            height: 900,
            scale_factor: 2.0,
            is_primary: true,
        };

        let translated = translate_capture_coordinate(Coordinate::new(400, 200), &display);
        assert_eq!(translated, Coordinate::new(300, 150));
    }

    #[test]
    fn test_translate_capture_coordinate_no_scaling() {
        let display = ScreenInfo {
            id: 0,
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            scale_factor: 1.0,
            is_primary: true,
        };

        let translated = translate_capture_coordinate(Coordinate::new(500, 300), &display);
        assert_eq!(translated, Coordinate::new(500, 300));
    }
}
