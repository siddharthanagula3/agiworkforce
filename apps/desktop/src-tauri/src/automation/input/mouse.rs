use crate::automation::uia::BoundingRectangle;
use anyhow::{anyhow, Result};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_RIGHTDOWN,
    MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_WHEEL, MOUSEINPUT,
};
use windows::Win32::UI::WindowsAndMessaging::SetCursorPos;

pub enum MouseButton {
    Left,
    Right,
    Middle,
}

pub struct MouseSimulator;

impl MouseSimulator {
    pub fn new() -> Result<Self> {
        Ok(Self)
    }

    pub fn move_to(&self, x: i32, y: i32) -> Result<()> {
        unsafe { SetCursorPos(x, y) }.map_err(|err| anyhow!("SetCursorPos failed: {err:?}"))
    }

    /// Move cursor smoothly to target position with animation
    pub async fn move_to_smooth(&self, x: i32, y: i32, duration_ms: u32) -> Result<()> {
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
        let mut current_pos = windows::Win32::Foundation::POINT { x: 0, y: 0 };
        unsafe { GetCursorPos(&mut current_pos) }
            .map_err(|err| anyhow!("GetCursorPos failed: {err:?}"))?;

        let from_x = current_pos.x;
        let from_y = current_pos.y;
        let dx = x - from_x;
        let dy = y - from_y;

        if dx == 0 && dy == 0 {
            return Ok(());
        }

        let duration_ms = duration_ms.max(10);
        let steps = ((duration_ms as f64 / 16.0).ceil() as usize).max(2); // ~60fps
        let step_delay = duration_ms / steps as u32;

        for i in 1..=steps {
            let t = i as f64 / steps as f64;
            // Ease-out cubic for natural deceleration
            let ease_t = 1.0 - (1.0 - t).powi(3);
            let current_x = from_x + (dx as f64 * ease_t) as i32;
            let current_y = from_y + (dy as f64 * ease_t) as i32;
            self.move_to(current_x, current_y)?;
            if i < steps {
                tokio::time::sleep(std::time::Duration::from_millis(step_delay as u64)).await;
            }
        }

        Ok(())
    }

    pub async fn double_click(&self, x: i32, y: i32) -> Result<()> {
        self.click(x, y, MouseButton::Left)?;
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        self.click(x, y, MouseButton::Left)
    }

    pub fn click(&self, x: i32, y: i32, button: MouseButton) -> Result<()> {
        self.move_to(x, y)?;
        let (down_flag, up_flag) = match button {
            MouseButton::Left => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
            MouseButton::Right => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
            MouseButton::Middle => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
        };

        let mut inputs = [
            INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 {
                    mi: MOUSEINPUT {
                        dx: 0,
                        dy: 0,
                        mouseData: 0,
                        dwFlags: down_flag,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
            INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 {
                    mi: MOUSEINPUT {
                        dx: 0,
                        dy: 0,
                        mouseData: 0,
                        dwFlags: up_flag,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
        ];
        self.dispatch(&mut inputs)
    }

    pub fn click_rect_center(&self, rect: &BoundingRectangle, button: MouseButton) -> Result<()> {
        let x = (rect.left + rect.width / 2.0).round() as i32;
        let y = (rect.top + rect.height / 2.0).round() as i32;
        self.click(x, y, button)
    }

    pub fn drag(&self, start: (i32, i32), end: (i32, i32)) -> Result<()> {
        self.move_to(start.0, start.1)?;
        let mut inputs = Vec::new();
        inputs.push(INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_LEFTDOWN,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
        inputs.push(INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: end.0 - start.0,
                    dy: end.1 - start.1,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_MOVE,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
        inputs.push(INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_LEFTUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
        self.dispatch(&mut inputs)
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
        &self,
        from_x: i32,
        from_y: i32,
        to_x: i32,
        to_y: i32,
        duration_ms: u32,
    ) -> Result<()> {
        // Move to start position
        self.move_to(from_x, from_y)?;

        // Small delay to ensure position is set
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;

        // Press left mouse button
        let mut press_input = [INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_LEFTDOWN,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }];
        self.dispatch(&mut press_input)?;

        // Small delay after pressing button
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;

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
                tokio::time::sleep(std::time::Duration::from_millis(step_delay as u64)).await;
            }
        }

        // Small delay before releasing button
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;

        // Release left mouse button
        let mut release_input = [INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_LEFTUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }];
        self.dispatch(&mut release_input)?;

        Ok(())
    }

    pub fn scroll(&self, delta: i32) -> Result<()> {
        let mut inputs = [INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: (delta * 120) as u32,
                    dwFlags: MOUSEEVENTF_WHEEL,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }];
        self.dispatch(&mut inputs)
    }

    fn dispatch(&self, inputs: &mut [INPUT]) -> Result<()> {
        let sent = unsafe { SendInput(inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent == inputs.len() as u32 {
            Ok(())
        } else {
            Err(anyhow!("SendInput failed for mouse operation"))
        }
    }
}
