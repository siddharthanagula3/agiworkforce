use super::types::ScrollDirection;
use crate::automation::input::keyboard::KeyboardSimulator;
use crate::automation::input::mouse::{MouseButton, MouseSimulator};
use anyhow::Result;

pub struct ScreenController {
    mouse: MouseSimulator,
    keyboard: KeyboardSimulator,
}

impl ScreenController {
    pub fn new() -> Result<Self> {
        Ok(Self {
            mouse: MouseSimulator::new()?,
            keyboard: KeyboardSimulator::new()?,
        })
    }

    pub async fn click(&mut self, x: i32, y: i32) -> Result<()> {
        // Use smooth movement for more human-like behavior
        self.mouse.move_to_smooth(x, y, 200).await?;
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        self.mouse.click(x, y, MouseButton::Left)?;
        Ok(())
    }

    pub async fn double_click(&mut self, x: i32, y: i32) -> Result<()> {
        self.mouse.move_to_smooth(x, y, 200).await?;
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        self.mouse.double_click(x, y).await?;
        Ok(())
    }

    pub async fn right_click(&mut self, x: i32, y: i32) -> Result<()> {
        self.mouse.move_to_smooth(x, y, 200).await?;
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        self.mouse.click(x, y, MouseButton::Right)?;
        Ok(())
    }

    pub async fn type_text(&mut self, text: &str) -> Result<()> {
        // Type with 50ms delay between characters for more human-like behavior
        self.keyboard.send_text_with_delay(text, 50).await?;
        Ok(())
    }

    pub async fn scroll(&mut self, direction: ScrollDirection, amount: i32) -> Result<()> {
        match direction {
            ScrollDirection::Down => {
                for _ in 0..amount {
                    self.mouse.scroll_down(1)?;
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                }
            }
            ScrollDirection::Up => {
                for _ in 0..amount {
                    self.mouse.scroll_up(1)?;
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                }
            }
            ScrollDirection::Left | ScrollDirection::Right => {
                // Horizontal scrolling not commonly supported, log warning
                tracing::warn!("Horizontal scrolling not implemented");
            }
        }
        Ok(())
    }

    pub async fn press_key(&mut self, key: &str) -> Result<()> {
        self.keyboard.press_key_by_name(key).await?;
        Ok(())
    }

    pub async fn drag_to(&mut self, from_x: i32, from_y: i32, to_x: i32, to_y: i32) -> Result<()> {
        // Move to start position
        self.mouse.move_to_smooth(from_x, from_y, 200).await?;
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Start drag
        self.mouse.drag_to(from_x, from_y, to_x, to_y)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_screen_controller_creation() {
        let result = ScreenController::new();
        assert!(result.is_ok());
    }
}
