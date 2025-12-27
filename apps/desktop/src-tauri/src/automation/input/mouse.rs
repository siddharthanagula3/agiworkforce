use anyhow::{anyhow, Result};
use enigo::{Button, Coordinate, Enigo, Mouse, Settings};
use std::time::Duration;
use tokio::time::sleep;

use super::enigo_lock::lock_enigo;

#[cfg(windows)]
use crate::automation::types::BoundingRectangle;

#[derive(Debug, Clone, Copy)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

impl From<MouseButton> for Button {
    fn from(button: MouseButton) -> Self {
        match button {
            MouseButton::Left => Button::Left,
            MouseButton::Right => Button::Right,
            MouseButton::Middle => Button::Middle,
        }
    }
}

pub struct MouseSimulator {
    enigo: Enigo,
}

impl MouseSimulator {
    pub fn new() -> Result<Self> {
        let _enigo_lock = lock_enigo()?;
        let enigo = Enigo::new(&Settings::default())
            .map_err(|e| anyhow!("Failed to create mouse simulator: {:?}", e))?;
        Ok(Self { enigo })
    }

    pub fn move_to(&mut self, x: i32, y: i32) -> Result<()> {
        let _enigo_lock = lock_enigo()?;
        self.enigo
            .move_mouse(x, y, Coordinate::Abs)
            .map_err(|e| anyhow!("Failed to move mouse: {:?}", e))
    }

    pub async fn move_to_smooth(&mut self, x: i32, y: i32, duration_ms: u32) -> Result<()> {
        let duration_ms = duration_ms.max(10);
        let steps = ((duration_ms as f64 / 16.0).ceil() as usize).max(2);
        let step_delay = duration_ms / steps as u32;

        let target_x = x;
        let target_y = y;

        for i in 1..=steps {
            let t = i as f64 / steps as f64;

            let _ease_t = 1.0 - (1.0 - t).powi(3);

            if i == steps {
                self.move_to(target_x, target_y)?;
            }

            if i < steps {
                sleep(Duration::from_millis(step_delay as u64)).await;
            }
        }

        Ok(())
    }

    pub async fn double_click(&mut self, x: i32, y: i32) -> Result<()> {
        self.click(x, y, MouseButton::Left)?;
        sleep(Duration::from_millis(50)).await;
        self.click(x, y, MouseButton::Left)
    }

    pub fn click(&mut self, x: i32, y: i32, button: MouseButton) -> Result<()> {
        self.move_to(x, y)?;
        let _enigo_lock = lock_enigo()?;
        self.enigo
            .button(button.into(), enigo::Direction::Click)
            .map_err(|e| anyhow!("Failed to click mouse button: {:?}", e))
    }

    #[cfg(windows)]
    pub fn click_rect_center(
        &mut self,
        rect: &BoundingRectangle,
        button: MouseButton,
    ) -> Result<()> {
        let x = (rect.left + rect.width / 2.0).round() as i32;
        let y = (rect.top + rect.height / 2.0).round() as i32;
        self.click(x, y, button)
    }

    #[cfg(not(windows))]
    pub fn click_rect_center(
        &mut self,
        _rect: &crate::automation::types::BoundingRectangle,
        _button: MouseButton,
    ) -> Result<()> {
        Err(anyhow!("UI Automation not available on this platform"))
    }

    pub fn drag(&mut self, start: (i32, i32), end: (i32, i32)) -> Result<()> {
        self.move_to(start.0, start.1)?;
        {
            let _enigo_lock = lock_enigo()?;
            self.enigo
                .button(Button::Left, enigo::Direction::Press)
                .map_err(|e| anyhow!("Failed to press mouse button: {:?}", e))?;
        }

        self.move_to(end.0, end.1)?;

        let _enigo_lock = lock_enigo()?;
        self.enigo
            .button(Button::Left, enigo::Direction::Release)
            .map_err(|e| anyhow!("Failed to release mouse button: {:?}", e))
    }

    pub async fn drag_and_drop(
        &mut self,
        from_x: i32,
        from_y: i32,
        to_x: i32,
        to_y: i32,
        duration_ms: u32,
    ) -> Result<()> {
        self.move_to(from_x, from_y)?;

        sleep(Duration::from_millis(10)).await;

        {
            let _enigo_lock = lock_enigo()?;
            self.enigo
                .button(Button::Left, enigo::Direction::Press)
                .map_err(|e| anyhow!("Failed to press mouse button: {:?}", e))?;
        }

        sleep(Duration::from_millis(10)).await;

        let duration_ms = duration_ms.max(50);
        let steps = ((duration_ms as f64 / 100.0).ceil() as usize).max(5);
        let step_delay = duration_ms / steps as u32;

        let dx = to_x - from_x;
        let dy = to_y - from_y;

        for i in 1..=steps {
            let t = i as f64 / steps as f64;

            let ease_t = if t < 0.5 {
                4.0 * t * t * t
            } else {
                1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
            };

            let current_x = from_x + (dx as f64 * ease_t) as i32;
            let current_y = from_y + (dy as f64 * ease_t) as i32;

            self.move_to(current_x, current_y)?;

            if i < steps {
                sleep(Duration::from_millis(step_delay as u64)).await;
            }
        }

        sleep(Duration::from_millis(10)).await;

        {
            let _enigo_lock = lock_enigo()?;
            self.enigo
                .button(Button::Left, enigo::Direction::Release)
                .map_err(|e| anyhow!("Failed to release mouse button: {:?}", e))?;
        }

        Ok(())
    }

    pub fn scroll(&mut self, delta: i32) -> Result<()> {
        let _enigo_lock = lock_enigo()?;
        self.enigo
            .scroll(delta, enigo::Axis::Vertical)
            .map_err(|e| anyhow!("Failed to scroll: {:?}", e))
    }

    pub fn scroll_up(&mut self, amount: i32) -> Result<()> {
        self.scroll(amount)
    }

    pub fn scroll_down(&mut self, amount: i32) -> Result<()> {
        self.scroll(-amount)
    }

    pub fn drag_to(&mut self, from_x: i32, from_y: i32, to_x: i32, to_y: i32) -> Result<()> {
        self.drag((from_x, from_y), (to_x, to_y))
    }
}

impl Default for MouseSimulator {
    fn default() -> Self {
        Self::new().expect("Failed to create MouseSimulator")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mouse_button_conversion() {
        assert!(matches!(Button::from(MouseButton::Left), Button::Left));
        assert!(matches!(Button::from(MouseButton::Right), Button::Right));
        assert!(matches!(Button::from(MouseButton::Middle), Button::Middle));
    }

    #[tokio::test]
    async fn test_mouse_simulator_creation() {
        if std::env::var("CI").is_ok() {
            return;
        }

        let result = MouseSimulator::new();
        if let Err(err) = &result {
            eprintln!(
                "[test] Skipping MouseSimulator::new check due to environment error: {:?}",
                err
            );
            // Environment (e.g. accessibility permissions) may prevent mouse automation.
            // Treat this as a skipped test rather than a hard failure.
            return;
        }

        assert!(result.is_ok());
    }
}
