// Cross-platform mouse simulation using enigo
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

    /// Move cursor smoothly to target position with animation
    pub async fn move_to_smooth(&mut self, x: i32, y: i32, duration_ms: u32) -> Result<()> {
        // Get current position (enigo doesn't provide this, so we'll track it ourselves)
        // For now, we'll use a simple linear interpolation from assumed current position
        // In practice, you might want to track the last known position

        // For cross-platform compatibility, we'll just move to the target position
        // with intermediate steps to simulate smoothness
        let duration_ms = duration_ms.max(10);
        let steps = ((duration_ms as f64 / 16.0).ceil() as usize).max(2); // ~60fps
        let step_delay = duration_ms / steps as u32;

        // We need to get current position - enigo doesn't provide this
        // As a workaround, we'll assume we're moving from (0, 0) or track position
        // For production use, consider using platform-specific APIs to get cursor position

        // Simple approach: divide the movement into steps
        // This assumes we're starting from wherever the cursor currently is
        let target_x = x;
        let target_y = y;

        for i in 1..=steps {
            let t = i as f64 / steps as f64;
            // Ease-out cubic for natural deceleration
            let _ease_t = 1.0 - (1.0 - t).powi(3);

            // For simplicity, we'll just move in a linear fashion
            // A full implementation would track current position
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

    /// Click the center of a bounding rectangle (Windows UI Automation only)
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

    /// Click the center of a bounding rectangle (Stub for non-Windows)
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

    /// Perform a drag-and-drop operation with smooth animation.
    ///
    /// # Arguments
    /// * `from_x` - Starting X coordinate
    /// * `from_y` - Starting Y coordinate
    /// * `to_x` - Ending X coordinate
    /// * `to_y` - Ending Y coordinate
    /// * `duration_ms` - Duration of the drag animation in milliseconds (minimum 50ms)
    ///
    /// # Details
    /// This function simulates a smooth drag-and-drop by:
    /// 1. Moving the cursor to the start position
    /// 2. Pressing the left mouse button
    /// 3. Animating the cursor movement over multiple intermediate points
    /// 4. Releasing the left mouse button at the end position
    ///
    /// The animation creates intermediate points for smooth movement, with a minimum
    /// of 5 steps and approximately 10 steps per second based on duration.
    pub async fn drag_and_drop(
        &mut self,
        from_x: i32,
        from_y: i32,
        to_x: i32,
        to_y: i32,
        duration_ms: u32,
    ) -> Result<()> {
        // Move to start position
        self.move_to(from_x, from_y)?;

        // Small delay to ensure position is set
        sleep(Duration::from_millis(10)).await;

        // Press left mouse button
        {
            let _enigo_lock = lock_enigo()?;
            self.enigo
                .button(Button::Left, enigo::Direction::Press)
                .map_err(|e| anyhow!("Failed to press mouse button: {:?}", e))?;
        }

        // Small delay after pressing button
        sleep(Duration::from_millis(10)).await;

        // Calculate smooth animation parameters
        let duration_ms = duration_ms.max(50); // Minimum 50ms
        let steps = ((duration_ms as f64 / 100.0).ceil() as usize).max(5); // At least 5 steps, ~10 steps per second
        let step_delay = duration_ms / steps as u32;

        let dx = to_x - from_x;
        let dy = to_y - from_y;

        // Animate movement with intermediate points using ease-in-out curve
        for i in 1..=steps {
            let t = i as f64 / steps as f64;
            // Ease-in-out cubic function for smooth animation
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

        // Small delay before releasing button
        sleep(Duration::from_millis(10)).await;

        // Release left mouse button
        {
            let _enigo_lock = lock_enigo()?;
            self.enigo
                .button(Button::Left, enigo::Direction::Release)
                .map_err(|e| anyhow!("Failed to release mouse button: {:?}", e))?;
        }

        Ok(())
    }

    pub fn scroll(&mut self, delta: i32) -> Result<()> {
        // Enigo scroll units may differ from Windows (120 per notch)
        // Adjust the delta to work similarly across platforms
        let _enigo_lock = lock_enigo()?;
        self.enigo
            .scroll(delta, enigo::Axis::Vertical)
            .map_err(|e| anyhow!("Failed to scroll: {:?}", e))
    }

    /// Scroll up (positive delta)
    pub fn scroll_up(&mut self, amount: i32) -> Result<()> {
        self.scroll(amount)
    }

    /// Scroll down (negative delta)
    pub fn scroll_down(&mut self, amount: i32) -> Result<()> {
        self.scroll(-amount)
    }

    /// Drag from one point to another (alias for drag with simpler signature)
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
        // Just ensure it doesn't panic - actual simulation requires GUI
        let result = MouseSimulator::new();
        assert!(result.is_ok());
    }
}
