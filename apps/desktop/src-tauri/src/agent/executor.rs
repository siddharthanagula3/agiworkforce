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
        tracing::info!("[Executor] Executing step {}: {}", step.id, step.description);

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

    async fn execute_action(
        &self,
        action: &Action,
        vision: &VisionAutomation,
    ) -> Result<String> {
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
                // TODO: Integrate with browser automation
                Ok(format!("Navigated to {}", url))
            }
            Action::WaitForElement { target, timeout: wait_timeout } => {
                vision.wait_for_element(target, *wait_timeout).await?;
                Ok("Element appeared".to_string())
            }
            Action::ExecuteCommand { command, args } => {
                // TODO: Integrate with terminal/command execution
                Ok(format!("Executed: {} {:?}", command, args))
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
                Ok(format!("Found {} elements matching '{}'", elements.len(), query))
            }
            Action::Scroll { direction, amount } => {
                self.automation.mouse.scroll(*amount)?;
                Ok(format!("Scrolled {:?} by {}", direction, amount))
            }
            Action::PressKey { keys } => {
                // TODO: Parse and press key combination
                Ok(format!("Pressed keys: {:?}", keys))
            }
        }
    }

    async fn click_target(
        &self,
        target: &ClickTarget,
        vision: &VisionAutomation,
    ) -> Result<()> {
        match target {
            ClickTarget::Coordinates { x, y } => {
                self.automation.mouse.move_to_smooth(*x, *y, 200)?;
                self.automation.mouse.click(*x, *y, crate::automation::input::MouseButton::Left)?;
                Ok(())
            }
            ClickTarget::UIAElement { element_id } => {
                // Use UIA to click element
                // set_focus and invoke handle element retrieval internally
                self.automation.uia.set_focus(element_id)?;
                self.automation.uia.invoke(element_id)?;
                Ok(())
            }
            ClickTarget::ImageMatch { image_path, threshold } => {
                let (x, y) = vision.find_image(image_path, *threshold).await?;
                self.automation.mouse.move_to_smooth(x, y, 200)?;
                self.automation.mouse.click(x, y, crate::automation::input::MouseButton::Left)?;
                Ok(())
            }
            ClickTarget::TextMatch { text, fuzzy } => {
                let matches = vision.find_text(text, *fuzzy).await?;
                if let Some((x, y, _)) = matches.first() {
                    self.automation.mouse.move_to_smooth(*x, *y, 200)?;
                    self.automation.mouse.click(*x, *y, crate::automation::input::MouseButton::Left)?;
                    Ok(())
                } else {
                    Err(anyhow::anyhow!("Text '{}' not found", text))
                }
            }
        }
    }
}

