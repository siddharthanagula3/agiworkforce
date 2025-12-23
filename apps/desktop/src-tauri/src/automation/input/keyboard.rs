use anyhow::{anyhow, Result};
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::time::Duration;
use tokio::time::sleep;

use super::enigo_lock::lock_enigo;

pub struct KeyboardSimulator {
    enigo: Enigo,
    typing_delay_ms: u64,
}

#[derive(Debug, Clone)]
pub struct MacroStep {
    pub action: MacroAction,
    pub delay_ms: u64,
}

#[derive(Debug, Clone)]
pub enum MacroAction {
    PressKey(Key),
    ReleaseKey(Key),
    SendText(String),
    Hotkey(Vec<Key>, Key),
}

impl KeyboardSimulator {
    pub fn new() -> Result<Self> {
        let _enigo_lock = lock_enigo()?;
        let settings = Settings::default();
        let enigo =
            Enigo::new(&settings).map_err(|e| anyhow!("Failed to create enigo: {:?}", e))?;
        Ok(Self {
            enigo,
            typing_delay_ms: 10,
        })
    }

    pub fn set_typing_speed(&mut self, delay_ms: u64) {
        self.typing_delay_ms = delay_ms;
    }

    pub async fn send_text(&mut self, text: &str) -> Result<()> {
        self.send_text_with_delay(text, self.typing_delay_ms).awai
    }

    pub async fn send_text_with_delay(&mut self, text: &str, delay_ms: u64) -> Result<()> {
        for ch in text.chars() {
            {
                let _enigo_lock = lock_enigo()?;
                self.enigo
                    .text(&ch.to_string())
                    .map_err(|e| anyhow!("Failed to send text: {:?}", e))?;
            }
            if delay_ms > 0 {
                sleep(Duration::from_millis(delay_ms)).await;
            }
        }
        Ok(())
    }

    pub fn press_key(&mut self, key: Key) -> Result<()> {
        let _enigo_lock = lock_enigo()?;
        self.enigo
            .key(key, Direction::Press)
            .map_err(|e| anyhow!("Failed to press key: {:?}", e))
    }

    pub fn release_key(&mut self, key: Key) -> Result<()> {
        let _enigo_lock = lock_enigo()?;
        self.enigo
            .key(key, Direction::Release)
            .map_err(|e| anyhow!("Failed to release key: {:?}", e))
    }

    pub fn tap_key(&mut self, key: Key) -> Result<()> {
        let _enigo_lock = lock_enigo()?;
        self.enigo
            .key(key, Direction::Click)
            .map_err(|e| anyhow!("Failed to tap key: {:?}", e))
    }

    pub fn send_hotkey(&mut self, modifiers: &[Key], key: Key) -> Result<()> {
        let _enigo_lock = lock_enigo()?;

        for modifier in modifiers {
            self.enigo
                .key(*modifier, Direction::Press)
                .map_err(|e| anyhow!("Failed to press modifier: {:?}", e))?;
        }

        self.enigo
            .key(key, Direction::Click)
            .map_err(|e| anyhow!("Failed to click key: {:?}", e))?;

        for modifier in modifiers.iter().rev() {
            self.enigo
                .key(*modifier, Direction::Release)
                .map_err(|e| anyhow!("Failed to release modifier: {:?}", e))?;
        }

        Ok(())
    }

    pub async fn execute_macro(&mut self, steps: &[MacroStep]) -> Result<()> {
        for step in steps {
            match &step.action {
                MacroAction::PressKey(key) => self.press_key(*key)?,
                MacroAction::ReleaseKey(key) => self.release_key(*key)?,
                MacroAction::SendText(text) => self.send_text(text).await?,
                MacroAction::Hotkey(modifiers, key) => self.send_hotkey(modifiers, *key)?,
            }

            if step.delay_ms > 0 {
                sleep(Duration::from_millis(step.delay_ms)).await;
            }
        }
        Ok(())
    }
}

impl Default for KeyboardSimulator {
    fn default() -> Self {
        Self::new().expect("Failed to create KeyboardSimulator")
    }
}

impl KeyboardSimulator {
    pub fn modifier_key(name: &str) -> Option<Key> {
        match name.to_lowercase().as_str() {
            "ctrl" | "control" => Some(Key::Control),
            "shift" => Some(Key::Shift),
            "alt" | "option" | "opt" => Some(Key::Alt),

            "cmd" | "command" | "meta" | "super" | "windows" => Some(Key::Control),
            _ => None,
        }
    }

    pub fn vk_to_key(vk: u16) -> Option<Key> {
        match vk {
            0x08 => Some(Key::Backspace),
            0x09 => Some(Key::Tab),
            0x0D => Some(Key::Return),
            0x10 => Some(Key::Shift),
            0x11 => Some(Key::Control),
            0x12 => Some(Key::Alt),
            0x1B => Some(Key::Escape),
            0x20 => Some(Key::Space),
            0x21 => Some(Key::PageUp),
            0x22 => Some(Key::PageDown),
            0x23 => Some(Key::End),
            0x24 => Some(Key::Home),
            0x25 => Some(Key::LeftArrow),
            0x26 => Some(Key::UpArrow),
            0x27 => Some(Key::RightArrow),
            0x28 => Some(Key::DownArrow),
            0x2E => Some(Key::Delete),
            0x70..=0x87 => Some(Key::F1),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keyboard_simulator_creation() {
        let result = KeyboardSimulator::new();
        assert!(result.is_ok());
    }
}
