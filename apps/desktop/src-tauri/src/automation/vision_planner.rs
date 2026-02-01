use super::types::{ActionPlan, ComputerAction, ProgressVerification};
use crate::automation::screen::CapturedImage;
use crate::core::llm::llm_router::LLMRouter;
use crate::core::llm::{ChatMessage, ContentPart, ImageDetail, ImageFormat, ImageInput};
use anyhow::{Context, Result};
use base64::{engine::general_purpose, Engine as _};
use image::DynamicImage;
use std::io::Cursor;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::timeout;

pub struct ActionPlanner {
    llm_router: Arc<Mutex<LLMRouter>>,
}

impl ActionPlanner {
    pub fn new(llm_router: Arc<Mutex<LLMRouter>>) -> Self {
        Self { llm_router }
    }

    pub async fn plan_with_vision(
        &self,
        task: &str,
        screenshot: &CapturedImage,
        previous_actions: &[ComputerAction],
    ) -> Result<ActionPlan> {
        let base64_image = self.image_to_base64(&screenshot.pixels)?;

        let prompt = self.create_planning_prompt(task, previous_actions);

        let response = self
            .call_vision_llm(&prompt, &base64_image)
            .await
            .context("Failed to call vision LLM")?;

        self.parse_action_plan(&response)
    }

    pub async fn verify_progress(
        &self,
        task: &str,
        screenshot: &CapturedImage,
        actions_taken: &[ComputerAction],
    ) -> Result<ProgressVerification> {
        let base64_image = self.image_to_base64(&screenshot.pixels)?;

        let prompt = format!(
            "You are AGI Workforce's progress verification system, checking if the user's task is being completed successfully.\n\n
             Task: {}\n\n
             Actions taken so far: {} actions\n\n
             Look at the current screenshot and determine:\n
             1. Is the task complete?\n
             2. Is progress being made?\n\n
             Respond with JSON:\n
             {{\n
               \"task_complete\": true/false,\n
               \"making_progress\": true/false,\n
               \"reasoning\": \"explanation of current state\"\n
             }}",
            task,
            actions_taken.len()
        );

        let response = self.call_vision_llm(&prompt, &base64_image).await?;

        let verification: ProgressVerification =
            serde_json::from_str(&response).context("Failed to parse progress verification")?;

        Ok(verification)
    }

    fn create_planning_prompt(&self, task: &str, previous_actions: &[ComputerAction]) -> String {
        let action_history = if previous_actions.is_empty() {
            "No actions taken yet.".to_string()
        } else {
            format!(
                "Previous actions:\n{}",
                previous_actions
                    .iter()
                    .enumerate()
                    .map(|(i, action)| format!("{}. {:?}", i + 1, action))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        };

        format!(
            "You are AGI Workforce's vision-based automation agent that controls the computer through screenshots and actions to complete the user's task.\n\n
             TASK: {}\n\n
             {}\n\n
             Look at the screenshot and plan the NEXT 1-3 actions needed to make progress on this task.\n
             Provide coordinates in pixels (0,0 is top-left corner).\n\n
             Available actions:\n
             - {{\"type\": \"click\", \"x\": 100, \"y\": 200}}\n
             - {{\"type\": \"double_click\", \"x\": 100, \"y\": 200}}\n
             - {{\"type\": \"right_click\", \"x\": 100, \"y\": 200}}\n
             - {{\"type\": \"type\", \"text\": \"hello\"}}\n
             - {{\"type\": \"scroll\", \"direction\": \"down\", \"amount\": 3}}\n
             - {{\"type\": \"key_press\", \"key\": \"Enter\"}}\n
             - {{\"type\": \"wait\", \"ms\": 1000}}\n
             - {{\"type\": \"drag_to\", \"from_x\": 100, \"from_y\": 100, \"to_x\": 200, \"to_y\": 200}}\n\n
             Respond with JSON:\n
             {{\n
               \"actions\": [array of action objects],\n
               \"reasoning\": \"why these actions will help\"\n
             }}\n\n
             If the task is complete, return {{\"actions\": [], \"reasoning\": \"task complete\"}}",
            task, action_history
        )
    }

    /// HIGH-002 fix: Add timeout to prevent hanging on slow/unresponsive LLM providers.
    async fn call_vision_llm(&self, prompt: &str, base64_image: &str) -> Result<String> {
        // HIGH-002 fix: 60-second timeout for vision LLM calls
        // Vision models process images which takes longer than text-only calls
        const VISION_LLM_TIMEOUT: Duration = Duration::from_secs(60);

        let router = self.llm_router.lock().await;

        let image_bytes = general_purpose::STANDARD
            .decode(base64_image)
            .context("Failed to decode base64 image")?;

        let multimodal_content = vec![
            ContentPart::Text {
                text: prompt.to_string(),
            },
            ContentPart::Image {
                image: ImageInput {
                    data: image_bytes,
                    format: ImageFormat::Png,
                    detail: ImageDetail::Auto,
                },
            },
        ];

        let request = crate::core::llm::LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: String::new(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: Some(multimodal_content),
            }],
            model: String::new(),
            temperature: Some(0.7),
            max_tokens: Some(2048),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            ..Default::default()
        };

        let preferences = crate::core::llm::llm_router::RouterPreferences {
            provider: Some(crate::core::llm::Provider::Anthropic),
            model: None,
            strategy: crate::core::llm::llm_router::RoutingStrategy::Auto,
            context: None,
            prefer_cloud_credits: false,
        };

        let candidates = router.candidates(&request, &preferences);
        if candidates.is_empty() {
            return Err(anyhow::anyhow!(
                "No vision-capable LLM providers configured"
            ));
        }

        // HIGH-002 fix: Wrap LLM call with timeout
        let llm_future = router.invoke_candidate(&candidates[0], &request);
        let outcome = timeout(VISION_LLM_TIMEOUT, llm_future)
            .await
            .map_err(|_| {
                anyhow::anyhow!(
                    "Vision LLM request timed out after {} seconds",
                    VISION_LLM_TIMEOUT.as_secs()
                )
            })?
            .context("Vision LLM request failed")?;

        Ok(outcome.response.content)
    }

    fn image_to_base64(&self, image: &image::RgbaImage) -> Result<String> {
        let mut buf = Vec::new();
        let dynamic_image = DynamicImage::ImageRgba8(image.clone());
        dynamic_image
            .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
            .context("Failed to encode image as PNG")?;

        Ok(general_purpose::STANDARD.encode(&buf))
    }

    /// CRITICAL-002 fix: Add size limits and bounds checking for JSON parsing.
    /// Prevents memory exhaustion from maliciously large LLM responses.
    fn parse_action_plan(&self, response: &str) -> Result<ActionPlan> {
        // Maximum allowed response size (1MB should be more than enough for action plans)
        const MAX_RESPONSE_SIZE: usize = 1024 * 1024;
        // Maximum number of actions to prevent runaway plans
        const MAX_ACTIONS: usize = 100;

        // CRITICAL-002 fix: Enforce size limit before any processing
        if response.len() > MAX_RESPONSE_SIZE {
            return Err(anyhow::anyhow!(
                "Response too large: {} bytes (max: {} bytes)",
                response.len(),
                MAX_RESPONSE_SIZE
            ));
        }

        let json_str = if let Some(start) = response.find('{') {
            if let Some(end) = response.rfind('}') {
                // Additional bounds check to prevent slice issues
                if end >= start && end < response.len() {
                    &response[start..=end]
                } else {
                    return Err(anyhow::anyhow!("Invalid JSON bounds in response"));
                }
            } else {
                response
            }
        } else {
            response
        };

        // CRITICAL-002 fix: Check extracted JSON size
        if json_str.len() > MAX_RESPONSE_SIZE {
            return Err(anyhow::anyhow!(
                "Extracted JSON too large: {} bytes",
                json_str.len()
            ));
        }

        // Parse with size awareness
        let plan: ActionPlan = serde_json::from_str(json_str).context(format!(
            "Failed to parse action plan from: {}",
            &response[..response.len().min(500)] // Truncate error message
        ))?;

        // CRITICAL-002 fix: Validate action count to prevent runaway plans
        if plan.actions.len() > MAX_ACTIONS {
            return Err(anyhow::anyhow!(
                "Too many actions in plan: {} (max: {})",
                plan.actions.len(),
                MAX_ACTIONS
            ));
        }

        Ok(plan)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_planning_prompt() {
        let router = Arc::new(Mutex::new(LLMRouter::new()));
        let planner = ActionPlanner::new(router);
        let prompt = planner.create_planning_prompt("Open notepad", &[]);
        assert!(prompt.contains("Open notepad"));
        assert!(prompt.contains("Available actions"));
    }

    #[test]
    fn test_parse_action_plan() {
        let router = Arc::new(Mutex::new(LLMRouter::new()));
        let planner = ActionPlanner::new(router);

        let json = r#"{"actions": [{"type": "click", "x": 100, "y": 200}], "reasoning": "test"}"#;
        let plan = planner.parse_action_plan(json).unwrap();
        assert_eq!(plan.actions.len(), 1);
        assert_eq!(plan.reasoning, "test");
    }

    #[test]
    fn test_parse_action_plan_with_extra_text() {
        let router = Arc::new(Mutex::new(LLMRouter::new()));
        let planner = ActionPlanner::new(router);

        let response = "Here's the plan:\n{\"actions\": [], \"reasoning\": \"complete\"}\nDone!";
        let plan = planner.parse_action_plan(response).unwrap();
        assert_eq!(plan.actions.len(), 0);
    }
}
