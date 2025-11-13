pub mod action_planner;
pub mod screen_controller;
pub mod safety;
pub mod types;

use crate::automation::screen::capture::{capture_primary_screen, CapturedImage};
use crate::router::llm_router::LLMRouter;
use action_planner::ActionPlanner;
use anyhow::{Context, Result};
use safety::ComputerUseSafety;
use screen_controller::ScreenController;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use types::{ComputerAction, ComputerUseError, ComputerUseResult, ComputerUseSession};

/// Computer Use Agent - vision-based agent that can see and control the computer
pub struct ComputerUseAgent {
    llm_router: Arc<Mutex<LLMRouter>>,
    action_planner: ActionPlanner,
    screen_controller: ScreenController,
    safety: ComputerUseSafety,
}

impl ComputerUseAgent {
    pub fn new(llm_router: Arc<Mutex<LLMRouter>>) -> Result<Self> {
        Ok(Self {
            llm_router: llm_router.clone(),
            action_planner: ActionPlanner::new(llm_router),
            screen_controller: ScreenController::new()?,
            safety: ComputerUseSafety::new(),
        })
    }

    /// Execute a task using vision and computer control
    pub async fn execute_task(
        &mut self,
        task: &str,
        session_id: String,
    ) -> Result<ComputerUseResult> {
        tracing::info!("Starting computer use task: {}", task);

        let mut actions_taken = Vec::new();
        let mut max_iterations = 10; // Prevent infinite loops
        let mut iteration = 0;

        loop {
            if iteration >= max_iterations {
                return Err(ComputerUseError::MaxIterationsReached.into());
            }

            // 1. Capture screenshot
            let screenshot = self.capture_screen().await?;

            // 2. Send to vision LLM with task description
            let plan = self
                .action_planner
                .plan_with_vision(task, &screenshot, &actions_taken)
                .await?;

            if plan.actions.is_empty() {
                tracing::info!("No more actions needed, task complete");
                break;
            }

            // 3. Execute planned actions
            for action in plan.actions {
                // Safety check
                if !self.safety.is_action_safe(&action)? {
                    tracing::warn!("Action blocked by safety layer: {:?}", action);
                    return Err(ComputerUseError::ActionBlockedBySafety.into());
                }

                tracing::info!("Executing action: {:?}", action);
                self.execute_action(&action).await?;
                actions_taken.push(action.clone());

                // Small delay between actions
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            }

            // 4. Verify progress
            let new_screenshot = self.capture_screen().await?;
            let verification = self
                .action_planner
                .verify_progress(task, &new_screenshot, &actions_taken)
                .await?;

            if verification.task_complete {
                tracing::info!("Task verified complete!");
                break;
            }

            if !verification.making_progress {
                tracing::warn!("Not making progress, stopping");
                return Err(ComputerUseError::NotMakingProgress.into());
            }

            iteration += 1;
        }

        Ok(ComputerUseResult {
            success: true,
            actions_taken: actions_taken.len(),
            session_id,
            message: format!("Task completed with {} actions", actions_taken.len()),
        })
    }

    async fn capture_screen(&self) -> Result<CapturedImage> {
        capture_primary_screen().context("Failed to capture screenshot")
    }

    async fn execute_action(&mut self, action: &ComputerAction) -> Result<()> {
        match action {
            ComputerAction::Click { x, y } => {
                self.screen_controller.click(*x, *y).await?;
            }
            ComputerAction::Type { text } => {
                self.screen_controller.type_text(text).await?;
            }
            ComputerAction::Scroll { direction, amount } => {
                self.screen_controller.scroll(*direction, *amount).await?;
            }
            ComputerAction::KeyPress { key } => {
                self.screen_controller.press_key(key).await?;
            }
            ComputerAction::Wait { ms } => {
                tokio::time::sleep(tokio::time::Duration::from_millis(*ms)).await;
            }
            ComputerAction::DoubleClick { x, y } => {
                self.screen_controller.double_click(*x, *y).await?;
            }
            ComputerAction::RightClick { x, y } => {
                self.screen_controller.right_click(*x, *y).await?;
            }
            ComputerAction::DragTo { from_x, from_y, to_x, to_y } => {
                self.screen_controller.drag_to(*from_x, *from_y, *to_x, *to_y).await?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_computer_use_agent_creation() {
        // Test that we can create an agent
        // Note: Requires LLM router which is not available in tests
        // This is a placeholder for future integration tests
    }
}
