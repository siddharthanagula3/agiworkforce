use super::*;
use crate::router::LLMRouter;
use anyhow::{anyhow, Result};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct TaskPlanner {
    router: Arc<Mutex<LLMRouter>>,
}

impl TaskPlanner {
    pub fn new(_router: Arc<LLMRouter>) -> Result<Self> {
        // Wrap router in Arc<Mutex> for async access
        // Note: This requires router to be wrapped in Mutex at the source
        // For now, we'll use a workaround by storing the Arc directly
        // and accessing it through a Mutex when needed
        Ok(Self {
            router: Arc::new(Mutex::new(LLMRouter::new())), // TODO: Properly wrap the router
        })
    }

    /// Plan a task by breaking it down into executable steps using LLM
    pub async fn plan_task(&self, description: &str) -> Result<Vec<TaskStep>> {
        tracing::info!("[Planner] Planning task: {}", description);

        // Use LLM to break down the task into steps
        let prompt = format!(
            r#"You are an autonomous AI software engineer and automation engineer. 
Break down the following task into concrete, executable steps that can be performed on a Windows desktop.

Task: {}

For each step, specify:
1. Action type (Screenshot, Click, Type, Navigate, WaitForElement, ExecuteCommand, ReadFile, WriteFile, SearchText, Scroll, PressKey)
2. Target (coordinates, UIA element, image match, or text match)
3. Description of what the step does
4. Expected result (optional)
5. Timeout in seconds (default 30)
6. Whether to retry on failure (default true)

Return a JSON array of steps. Each step should have:
- id: unique step identifier
- action: object with type and parameters
- description: human-readable description
- expected_result: optional expected outcome
- timeout: timeout in seconds
- retry_on_failure: boolean

Example format:
[
  {{
    "id": "step_1",
    "action": {{
      "type": "Screenshot",
      "region": null
    }},
    "description": "Take screenshot to see current state",
    "expected_result": "Screenshot saved",
    "timeout": 5,
    "retry_on_failure": false
  }},
  {{
    "id": "step_2",
    "action": {{
      "type": "Click",
      "target": {{
        "type": "TextMatch",
        "text": "Open",
        "fuzzy": true
      }}
    }},
    "description": "Click the Open button",
    "expected_result": "Dialog opens",
    "timeout": 10,
    "retry_on_failure": true
  }}
]

Return ONLY the JSON array, no other text."#,
            description
        );

        // Check token usage and use local LLM if needed
        let use_local = self.should_use_local_llm().await?;

        let response = if use_local {
            self.plan_with_local_llm(description).await?
        } else {
            self.plan_with_cloud_llm(&prompt).await?
        };

        // Parse response into steps
        self.parse_plan(&response)
    }

    async fn plan_with_cloud_llm(&self, prompt: &str) -> Result<String> {
        // Use router to get LLM response
        use crate::router::{ChatMessage, LLMRequest, RouterPreferences, RoutingStrategy};

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(4000),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        let preferences = RouterPreferences {
            provider: None,
            model: None,
            strategy: RoutingStrategy::Auto,
            context: None,
        };

        let router = self.router.lock().await;
        let candidates = router.candidates(&request, &preferences);
        drop(router);

        if !candidates.is_empty() {
            let router = self.router.lock().await;
            if let Ok(outcome) = router.invoke_candidate(&candidates[0], &request).await {
                return Ok(outcome.response.content);
            }
        }

        // Fallback to basic plan
        self.generate_basic_plan(prompt).await
    }

    async fn plan_with_local_llm(&self, description: &str) -> Result<String> {
        tracing::info!("[Planner] Using local LLM (Ollama) for planning");
        // TODO: Integrate with Ollama
        // For now, use basic plan
        self.generate_basic_plan(description).await
    }

    async fn generate_basic_plan(&self, description: &str) -> Result<String> {
        // Generate a basic plan without LLM (fallback)
        let steps = vec![
            json!({
                "id": "step_1",
                "action": {
                    "type": "Screenshot",
                    "region": null
                },
                "description": format!("Take screenshot to understand current state for: {}", description),
                "expected_result": "Screenshot captured",
                "timeout": 5,
                "retry_on_failure": false
            }),
            json!({
                "id": "step_2",
                "action": {
                    "type": "SearchText",
                    "query": description
                },
                "description": format!("Search for relevant UI elements related to: {}", description),
                "expected_result": "Elements found",
                "timeout": 10,
                "retry_on_failure": true
            }),
        ];

        Ok(serde_json::to_string(&steps)?)
    }

    fn parse_plan(&self, response: &str) -> Result<Vec<TaskStep>> {
        // Extract JSON from response (handle markdown code blocks)
        let json_str = if response.trim_start().starts_with('[') {
            response.to_string()
        } else if let Some(start) = response.find('[') {
            if let Some(end) = response.rfind(']') {
                response[start..=end].to_string()
            } else {
                return Err(anyhow!("Invalid plan response: no closing bracket"));
            }
        } else {
            return Err(anyhow!("Invalid plan response: no JSON array found"));
        };

        let steps_json: Vec<serde_json::Value> = serde_json::from_str(&json_str)?;

        let mut steps = Vec::new();
        for step_json in steps_json {
            let step = self.parse_step(step_json)?;
            steps.push(step);
        }

        Ok(steps)
    }

    fn parse_step(&self, step_json: serde_json::Value) -> Result<TaskStep> {
        let id = step_json["id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing step id"))?
            .to_string();

        let description = step_json["description"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing step description"))?
            .to_string();

        let expected_result = step_json["expected_result"].as_str().map(|s| s.to_string());

        let timeout_secs = step_json["timeout"].as_u64().unwrap_or(30);
        let timeout = Duration::from_secs(timeout_secs);

        let retry_on_failure = step_json["retry_on_failure"].as_bool().unwrap_or(true);

        let action = self.parse_action(&step_json["action"])?;

        Ok(TaskStep {
            id,
            action,
            description,
            expected_result,
            timeout,
            retry_on_failure,
        })
    }

    fn parse_action(&self, action_json: &serde_json::Value) -> Result<Action> {
        let action_type = action_json["type"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing action type"))?;

        match action_type {
            "Screenshot" => {
                let region = if action_json["region"].is_null() {
                    None
                } else {
                    Some(ScreenRegion {
                        x: action_json["region"]["x"].as_i64().unwrap_or(0) as i32,
                        y: action_json["region"]["y"].as_i64().unwrap_or(0) as i32,
                        width: action_json["region"]["width"].as_i64().unwrap_or(0) as i32,
                        height: action_json["region"]["height"].as_i64().unwrap_or(0) as i32,
                    })
                };
                Ok(Action::Screenshot { region })
            }
            "Click" => {
                let target = self.parse_click_target(&action_json["target"])?;
                Ok(Action::Click { target })
            }
            "Type" => {
                let target = self.parse_click_target(&action_json["target"])?;
                let text = action_json["text"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing text for Type action"))?
                    .to_string();
                Ok(Action::Type { target, text })
            }
            "Navigate" => {
                let url = action_json["url"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing URL"))?
                    .to_string();
                Ok(Action::Navigate { url })
            }
            "WaitForElement" => {
                let target = self.parse_click_target(&action_json["target"])?;
                let timeout_secs = action_json["timeout"].as_u64().unwrap_or(10);
                Ok(Action::WaitForElement {
                    target,
                    timeout: Duration::from_secs(timeout_secs),
                })
            }
            "ExecuteCommand" => {
                let command = action_json["command"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing command"))?
                    .to_string();
                let args = action_json["args"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();
                Ok(Action::ExecuteCommand { command, args })
            }
            "ReadFile" => {
                let path = action_json["path"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing path"))?
                    .to_string();
                Ok(Action::ReadFile { path })
            }
            "WriteFile" => {
                let path = action_json["path"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing path"))?
                    .to_string();
                let content = action_json["content"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing content"))?
                    .to_string();
                Ok(Action::WriteFile { path, content })
            }
            "SearchText" => {
                let query = action_json["query"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing query"))?
                    .to_string();
                Ok(Action::SearchText { query })
            }
            "Scroll" => {
                let direction_str = action_json["direction"].as_str().unwrap_or("down");
                let direction = match direction_str {
                    "up" => ScrollDirection::Up,
                    "down" => ScrollDirection::Down,
                    "left" => ScrollDirection::Left,
                    "right" => ScrollDirection::Right,
                    _ => ScrollDirection::Down,
                };
                let amount = action_json["amount"].as_i64().unwrap_or(3) as i32;
                Ok(Action::Scroll { direction, amount })
            }
            "PressKey" => {
                let keys = action_json["keys"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();
                Ok(Action::PressKey { keys })
            }
            _ => Err(anyhow!("Unknown action type: {}", action_type)),
        }
    }

    fn parse_click_target(&self, target_json: &serde_json::Value) -> Result<ClickTarget> {
        let target_type = target_json["type"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing target type"))?;

        match target_type {
            "Coordinates" => Ok(ClickTarget::Coordinates {
                x: target_json["x"].as_i64().unwrap_or(0) as i32,
                y: target_json["y"].as_i64().unwrap_or(0) as i32,
            }),
            "UIAElement" => Ok(ClickTarget::UIAElement {
                element_id: target_json["element_id"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing element_id"))?
                    .to_string(),
            }),
            "ImageMatch" => Ok(ClickTarget::ImageMatch {
                image_path: target_json["image_path"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing image_path"))?
                    .to_string(),
                threshold: target_json["threshold"].as_f64().unwrap_or(0.8),
            }),
            "TextMatch" => Ok(ClickTarget::TextMatch {
                text: target_json["text"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing text"))?
                    .to_string(),
                fuzzy: target_json["fuzzy"].as_bool().unwrap_or(false),
            }),
            _ => Err(anyhow!("Unknown target type: {}", target_type)),
        }
    }

    async fn should_use_local_llm(&self) -> Result<bool> {
        // TODO: Check token usage and decide
        // For now, always prefer local if available
        Ok(true)
    }
}
