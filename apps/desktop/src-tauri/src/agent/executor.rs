use super::*;
use crate::automation::AutomationService;
use anyhow::Result;
use std::sync::Arc;
use std::time::Instant;
use tokio::time::timeout;

pub struct TaskExecutor {
    automation: Arc<AutomationService>,
}

impl TaskExecutor {
    pub fn new(automation: Arc<AutomationService>) -> Result<Self> {
        Ok(Self { automation })
    }

    /// Execute a single task step
    pub async fn execute_step(
        &self,
        step: &TaskStep,
        vision: &VisionAutomation,
    ) -> Result<StepResult> {
        let start = Instant::now();
        tracing::info!(
            "[Executor] Executing step {}: {}",
            step.id,
            step.description
        );

        let result = timeout(step.timeout, self.execute_action(&step.action, vision)).await;

        match result {
            Ok(Ok(action_result)) => {
                let duration = start.elapsed();
                Ok(StepResult {
                    step_id: step.id.clone(),
                    success: true,
                    result: Some(action_result),
                    error: None,
                    screenshot_path: None,
                    duration,
                })
            }
            Ok(Err(e)) => {
                let duration = start.elapsed();
                Ok(StepResult {
                    step_id: step.id.clone(),
                    success: false,
                    result: None,
                    error: Some(e.to_string()),
                    screenshot_path: None,
                    duration,
                })
            }
            Err(_) => {
                let duration = start.elapsed();
                Ok(StepResult {
                    step_id: step.id.clone(),
                    success: false,
                    result: None,
                    error: Some(format!("Step timed out after {:?}", step.timeout)),
                    screenshot_path: None,
                    duration,
                })
            }
        }
    }

    async fn execute_action(&self, action: &Action, vision: &VisionAutomation) -> Result<String> {
        match action {
            Action::Screenshot { region } => {
                let path = vision.capture_screenshot(region.clone()).await?;
                Ok(format!("Screenshot saved to {}", path))
            }
            Action::Click { target } => {
                self.click_target(target, vision).await?;
                Ok("Click performed".to_string())
            }
            Action::Type { target, text } => {
                self.click_target(target, vision).await?;
                self.automation.keyboard.send_text(text)?;
                Ok(format!("Typed: {}", text))
            }
            Action::Navigate { url } => {
                // Integrate with browser automation
                // Note: BrowserState would need to be added to TaskExecutor as a field
                // For now, log the intent
                tracing::info!(
                    "[Executor] Would navigate to {} using browser automation",
                    url
                );

                // Use platform-specific browser launch or existing browser automation
                tracing::info!("Opening browser to: {}", url);

                // On Windows, use shell execute; on Linux/Mac, use xdg-open/open
                #[cfg(target_os = "windows")]
                {
                    use std::process::Command;
                    Command::new("cmd")
                        .args(["/C", "start", url])
                        .spawn()
                        .map_err(|e| anyhow::anyhow!("Failed to open browser: {}", e))?;
                }

                #[cfg(target_os = "linux")]
                {
                    use std::process::Command;
                    Command::new("xdg-open")
                        .arg(url)
                        .spawn()
                        .map_err(|e| anyhow::anyhow!("Failed to open browser: {}", e))?;
                }

                #[cfg(target_os = "macos")]
                {
                    use std::process::Command;
                    Command::new("open")
                        .arg(url)
                        .spawn()
                        .map_err(|e| anyhow::anyhow!("Failed to open browser: {}", e))?;
                }

                Ok(format!("Opened browser to {}", url))
            }
            Action::WaitForElement {
                target,
                timeout: wait_timeout,
            } => {
                vision.wait_for_element(target, *wait_timeout).await?;
                Ok("Element appeared".to_string())
            }
            Action::ExecuteCommand { command, args } => {
                // Execute command using tokio::process with timeout
                use tokio::process::Command;
                use tokio::time::{timeout, Duration};

                tracing::info!("Executing command: {} {:?}", command, args);

                let mut cmd = Command::new(command);
                cmd.args(args);

                // Execute with 30 second timeout
                let result = timeout(Duration::from_secs(30), cmd.output()).await;

                match result {
                    Ok(Ok(output)) => {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        let status = output.status;

                        if status.success() {
                            tracing::debug!("Command succeeded: {}", stdout);
                            Ok(format!(
                                "Command executed successfully\nOutput: {}",
                                stdout.trim()
                            ))
                        } else {
                            tracing::warn!("Command failed with status {:?}: {}", status, stderr);
                            Err(anyhow::anyhow!(
                                "Command failed with status {:?}\nError: {}",
                                status,
                                stderr
                            ))
                        }
                    }
                    Ok(Err(e)) => {
                        tracing::error!("Failed to execute command: {}", e);
                        Err(anyhow::anyhow!("Failed to execute command: {}", e))
                    }
                    Err(_) => {
                        tracing::error!("Command execution timed out after 30 seconds");
                        Err(anyhow::anyhow!(
                            "Command execution timed out after 30 seconds"
                        ))
                    }
                }
            }
            Action::ReadFile { path } => {
                let content = std::fs::read_to_string(path)?;
                Ok(format!("Read {} bytes from {}", content.len(), path))
            }
            Action::WriteFile { path, content } => {
                std::fs::write(path, content)?;
                Ok(format!("Wrote {} bytes to {}", content.len(), path))
            }
            Action::SearchText { query } => {
                let elements = vision.search_text(query).await?;
                Ok(format!(
                    "Found {} elements matching '{}'",
                    elements.len(),
                    query
                ))
            }
            Action::Scroll { direction, amount } => {
                self.automation.mouse.scroll(*amount)?;
                Ok(format!("Scrolled {:?} by {}", direction, amount))
            }
            Action::PressKey { keys } => {
                // Parse and press key combination (e.g., ["Ctrl", "C"] or ["Ctrl+C"])
                use crate::automation::input::Key;

                tracing::info!("Pressing key combination: {:?}", keys);

                // Convert Vec<String> to key parts
                // If vec has one element with '+', split it; otherwise use the vec as-is
                let key_parts: Vec<String> = if keys.len() == 1 && keys[0].contains('+') {
                    keys[0].split('+').map(|s| s.trim().to_string()).collect()
                } else {
                    keys.clone()
                };

                // Parse modifier keys and main key
                let mut modifiers = Vec::new();
                let mut main_key = None;

                for (i, part) in key_parts.iter().enumerate() {
                    let is_last = i == key_parts.len() - 1;

                    match part.to_lowercase().as_str() {
                        "ctrl" | "control" => modifiers.push(Key::Control),
                        "alt" => modifiers.push(Key::Alt),
                        "shift" => modifiers.push(Key::Shift),
                        "win" | "windows" | "super" | "meta" => modifiers.push(Key::Windows),
                        key_str if is_last => {
                            // This is the main key
                            main_key = Some(self.parse_key_string(key_str)?);
                        }
                        _ => {
                            return Err(anyhow::anyhow!("Unknown key or modifier: {}", part));
                        }
                    }
                }

                // If no main key and only one part, treat it as a single key press
                if main_key.is_none() && key_parts.len() == 1 {
                    main_key = Some(self.parse_key_string(&key_parts[0])?);
                }

                let main_key = main_key.ok_or_else(|| anyhow::anyhow!("No main key specified"))?;

                // Press the key combination
                if modifiers.is_empty() {
                    // Single key press
                    self.automation.keyboard.press_key(main_key)?;
                } else {
                    // Key combination with modifiers
                    self.automation
                        .keyboard
                        .press_key_combination(&modifiers, main_key)?;
                }

                Ok(format!("Pressed key combination: {:?}", keys))
            }
        }
    }

    async fn click_target(&self, target: &ClickTarget, vision: &VisionAutomation) -> Result<()> {
        match target {
            ClickTarget::Coordinates { x, y } => {
                self.automation.mouse.move_to_smooth(*x, *y, 200)?;
                self.automation
                    .mouse
                    .click(*x, *y, crate::automation::input::MouseButton::Left)?;
                Ok(())
            }
            ClickTarget::UIAElement { element_id } => {
                // Use UIA to click element
                // set_focus and invoke handle element retrieval internally
                self.automation.uia.set_focus(element_id)?;
                self.automation.uia.invoke(element_id)?;
                Ok(())
            }
            ClickTarget::ImageMatch {
                image_path,
                threshold,
            } => {
                let (x, y) = vision.find_image(image_path, *threshold).await?;
                self.automation.mouse.move_to_smooth(x, y, 200)?;
                self.automation
                    .mouse
                    .click(x, y, crate::automation::input::MouseButton::Left)?;
                Ok(())
            }
            ClickTarget::TextMatch { text, fuzzy } => {
                let matches = vision.find_text(text, *fuzzy).await?;
                if let Some((x, y, _)) = matches.first() {
                    self.automation.mouse.move_to_smooth(*x, *y, 200)?;
                    self.automation.mouse.click(
                        *x,
                        *y,
                        crate::automation::input::MouseButton::Left,
                    )?;
                    Ok(())
                } else {
                    Err(anyhow::anyhow!("Text '{}' not found", text))
                }
            }
        }
    }

    /// Parse a key string (e.g., "Enter", "A", "F1") to a Key enum
    fn parse_key_string(&self, key_str: &str) -> Result<crate::automation::input::Key> {
        use crate::automation::input::Key;

        let key = match key_str.to_lowercase().as_str() {
            // Special keys
            "enter" | "return" => Key::Return,
            "esc" | "escape" => Key::Escape,
            "tab" => Key::Tab,
            "space" | "spacebar" => Key::Space,
            "backspace" | "back" => Key::Backspace,
            "delete" | "del" => Key::Delete,
            "home" => Key::Home,
            "end" => Key::End,
            "pageup" | "pgup" => Key::PageUp,
            "pagedown" | "pgdn" => Key::PageDown,
            "insert" | "ins" => Key::Insert,

            // Arrow keys
            "up" | "uparrow" => Key::UpArrow,
            "down" | "downarrow" => Key::DownArrow,
            "left" | "leftarrow" => Key::LeftArrow,
            "right" | "rightarrow" => Key::RightArrow,

            // Function keys
            "f1" => Key::F1,
            "f2" => Key::F2,
            "f3" => Key::F3,
            "f4" => Key::F4,
            "f5" => Key::F5,
            "f6" => Key::F6,
            "f7" => Key::F7,
            "f8" => Key::F8,
            "f9" => Key::F9,
            "f10" => Key::F10,
            "f11" => Key::F11,
            "f12" => Key::F12,

            // Single character keys
            s if s.len() == 1 => {
                let c = s.chars().next().unwrap();
                if c.is_ascii_alphanumeric() || c.is_ascii_punctuation() {
                    Key::Layout(c)
                } else {
                    return Err(anyhow::anyhow!("Unsupported key character: {}", c));
                }
            }

            _ => return Err(anyhow::anyhow!("Unknown key: {}", key_str)),
        };

        Ok(key)
    }
}
