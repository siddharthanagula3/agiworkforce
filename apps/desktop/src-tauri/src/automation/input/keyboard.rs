use anyhow::{anyhow, Result};
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::time::Duration;
use tokio::time::sleep;

use super::enigo_lock::lock_enigo;
use crate::automation::computer_use::consent::consent_prompt_is_on_screen;

/// F20 (audit 2026-08-21): the native computer-use consent prompt is only a
/// decision the user makes if the app cannot answer it for them. Every command
/// that reaches this simulator is gated on persisted consent, but the script
/// executor reaches it without one, so the refusal also lives here, a
/// synthesized `Return` must never be what accepts the prompt.
fn refuse_while_consent_prompt_is_on_screen() -> Result<()> {
    if consent_prompt_is_on_screen() {
        return Err(anyhow!(
            "Refusing to synthesize input while the computer-use consent prompt is open. Answer it on this computer first."
        ));
    }
    Ok(())
}

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
        self.send_text_with_delay(text, self.typing_delay_ms).await
    }

    pub async fn send_text_with_delay(&mut self, text: &str, delay_ms: u64) -> Result<()> {
        refuse_while_consent_prompt_is_on_screen()?;
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
        refuse_while_consent_prompt_is_on_screen()?;
        let _enigo_lock = lock_enigo()?;
        self.enigo
            .key(key, Direction::Press)
            .map_err(|e| anyhow!("Failed to press key: {:?}", e))
    }

    pub fn release_key(&mut self, key: Key) -> Result<()> {
        refuse_while_consent_prompt_is_on_screen()?;
        let _enigo_lock = lock_enigo()?;
        self.enigo
            .key(key, Direction::Release)
            .map_err(|e| anyhow!("Failed to release key: {:?}", e))
    }

    pub fn tap_key(&mut self, key: Key) -> Result<()> {
        refuse_while_consent_prompt_is_on_screen()?;
        let _enigo_lock = lock_enigo()?;
        self.enigo
            .key(key, Direction::Click)
            .map_err(|e| anyhow!("Failed to tap key: {:?}", e))
    }

    pub fn send_hotkey(&mut self, modifiers: &[Key], key: Key) -> Result<()> {
        refuse_while_consent_prompt_is_on_screen()?;
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

impl KeyboardSimulator {
    pub fn modifier_key(name: &str) -> Option<Key> {
        match name.to_lowercase().as_str() {
            "ctrl" | "control" => Some(Key::Control),
            "shift" => Some(Key::Shift),
            "alt" | "option" | "opt" => Some(Key::Alt),

            "cmd" | "command" | "meta" | "super" | "windows" => Some(Key::Meta),
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
    use crate::automation::computer_use::consent::consent_prompt_on_screen;

    /// Every keystroke this simulator can emit is a keystroke that could accept
    /// the native consent prompt, so none of them may reach `enigo` while that
    /// prompt is waiting for the user.
    #[test]
    fn keystrokes_are_refused_while_the_consent_prompt_is_on_screen() {
        let _prompt = consent_prompt_on_screen();
        let refusal = refuse_while_consent_prompt_is_on_screen()
            .expect_err("synthetic input during the consent prompt");
        assert!(refusal.to_string().contains("consent prompt is open"));
    }

    /// The refusal is only worth anything while every emitting method asks for
    /// it before it touches `enigo`.
    #[test]
    fn every_emitting_method_asks_before_it_types() {
        const SOURCE: &str = include_str!("keyboard.rs");
        for method in [
            "pub async fn send_text_with_delay(",
            "pub fn press_key(",
            "pub fn release_key(",
            "pub fn tap_key(",
            "pub fn send_hotkey(",
        ] {
            let after = SOURCE
                .split(method)
                .nth(1)
                .unwrap_or_else(|| panic!("{method} is missing from this file"));
            let (_, body) = after
                .split_once("> {\n")
                .unwrap_or_else(|| panic!("{method} has no recognizable body"));
            assert_eq!(
                body.trim_start().lines().next().unwrap_or_default().trim(),
                "refuse_while_consent_prompt_is_on_screen()?;",
                "{method} must refuse before it synthesizes input"
            );
        }
    }

    #[test]
    fn test_keyboard_simulator_creation() {
        if std::env::var("CI").is_ok() {
            return;
        }

        let result = KeyboardSimulator::new();
        if let Err(err) = &result {
            eprintln!(
                "[test] Skipping KeyboardSimulator::new check due to environment error: {:?}",
                err
            );
            // Environment (e.g. accessibility permissions) may prevent keyboard automation.
            // Treat this as a skipped test rather than a hard failure.
            return;
        }

        assert!(result.is_ok());
    }
}
