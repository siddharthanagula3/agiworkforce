use super::types::{ActionPlan, ComputerAction, ProgressVerification};
use crate::automation::screen::CapturedImage;
use crate::router::llm_router::LLMRouter;
use crate::router::{ChatMessage, ContentPart, ImageDetail, ImageFormat, ImageInput};
use anyhow::{Context, Result};
use base64::{engine::general_purpose, Engine as _};
use image::DynamicImage;
use std::io::Cursor;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct ActionPlanner {
    llm_router: Arc<Mutex<LLMRouter>>,
}

impl ActionPlanner {
    pub fn new(llm_router: Arc<Mutex<LLMRouter>>) -> Self {
        Self { llm_router }
    }

    /// Plan actions using vision analysis of the screen
    pub async fn plan_with_vision(
        &self,
        task: &str,
        screenshot: &CapturedImage,
        previous_actions: &[ComputerAction],
    ) -> Result<ActionPlan> {
        // Convert screenshot to base64
        let base64_image = self.image_to_base64(&screenshot.pixels)?;

        // Create vision prompt
        let prompt = self.create_planning_prompt(task, previous_actions);

        // Call vision-enabled LLM
        let response = self
            .call_vision_llm(&prompt, &base64_image)
            .await
            .context("Failed to call vision LLM")?;

        // Parse JSON response
        self.parse_action_plan(&response)
    }

    /// Verify if progress is being made toward the goal
    pub async fn verify_progress(
        &self,
        task: &str,
        screenshot: &CapturedImage,
        actions_taken: &[ComputerAction],
    ) -> Result<ProgressVerification> {
        let base64_image = self.image_to_base64(&screenshot.pixels)?;

        let prompt = format!(
            "You are verifying progress on a computer automation task.\n\n\
             Task: {}\n\n\
             Actions taken so far: {} actions\n\n\
             Look at the current screenshot and determine:\n\
             1. Is the task complete?\n\
             2. Is progress being made?\n\n\
             Respond with JSON:\n\
             {{\n\
               \"task_complete\": true/false,\n\
               \"making_progress\": true/false,\n\
               \"reasoning\": \"explanation of current state\"\n\
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
            "You are a computer use agent that controls the computer through vision and actions.\n\n\
             TASK: {}\n\n\
             {}\n\n\
             Look at the screenshot and plan the NEXT 1-3 actions needed to make progress on this task.\n\
             Provide coordinates in pixels (0,0 is top-left corner).\n\n\
             Available actions:\n\
             - {{\"type\": \"click\", \"x\": 100, \"y\": 200}}\n\
             - {{\"type\": \"double_click\", \"x\": 100, \"y\": 200}}\n\
             - {{\"type\": \"right_click\", \"x\": 100, \"y\": 200}}\n\
             - {{\"type\": \"type\", \"text\": \"hello\"}}\n\
             - {{\"type\": \"scroll\", \"direction\": \"down\", \"amount\": 3}}\n\
             - {{\"type\": \"key_press\", \"key\": \"Enter\"}}\n\
             - {{\"type\": \"wait\", \"ms\": 1000}}\n\
             - {{\"type\": \"drag_to\", \"from_x\": 100, \"from_y\": 100, \"to_x\": 200, \"to_y\": 200}}\n\n\
             Respond with JSON:\n\
             {{\n\
               \"actions\": [array of action objects],\n\
               \"reasoning\": \"why these actions will help\"\n\
             }}\n\n\
             If the task is complete, return {{\"actions\": [], \"reasoning\": \"task complete\"}}",
            task, action_history
        )
    }

    async fn call_vision_llm(&self, prompt: &str, base64_image: &str) -> Result<String> {
        let router = self.llm_router.lock().await;

        // Decode base64 image
        let image_bytes = general_purpose::STANDARD
            .decode(base64_image)
            .context("Failed to decode base64 image")?;

        // Create multimodal content
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

        // Create request with vision support
        let request = crate::router::LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: String::new(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: Some(multimodal_content),
            }],
            model: String::new(), // Will be set by router
            temperature: Some(0.7),
            max_tokens: Some(2048),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        // Get candidates (prefer vision-capable models)
        let preferences = crate::router::llm_router::RouterPreferences {
            provider: Some(crate::router::Provider::Anthropic), // Claude has vision
            model: None,
            strategy: crate::router::llm_router::RoutingStrategy::Auto,
        };

        let candidates = router.candidates(&request, &preferences);
        if candidates.is_empty() {
            return Err(anyhow::anyhow!(
                "No vision-capable LLM providers configured"
            ));
        }

        let outcome = router
            .invoke_candidate(&candidates[0], &request)
            .await
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

    fn parse_action_plan(&self, response: &str) -> Result<ActionPlan> {
        // Try to extract JSON from response (LLM might add explanation text)
        let json_str = if let Some(start) = response.find('{') {
            if let Some(end) = response.rfind('}') {
                &response[start..=end]
            } else {
                response
            }
        } else {
            response
        };

        serde_json::from_str(json_str)
            .context(format!("Failed to parse action plan from: {}", response))
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
