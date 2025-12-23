use super::*;
use crate::core::router::LLMRouter;
use anyhow::{anyhow, Result};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;

pub struct TaskPlanner {
    router: Arc<TokioMutex<LLMRouter>>,
}

impl TaskPlanner {
    pub fn new(router: Arc<TokioMutex<LLMRouter>>) -> Result<Self> {
        Ok(Self { router })
    }

    pub async fn plan_task(&self, description: &str) -> Result<Vec<TaskStep>> {
        tracing::info!("[Planner] Planning task: {}", description);

        let prompt = format!(
            r#"You are an expert Autonomous AI Automation Engineer. Your goal is to break down high-level user tasks into a precise, robust sequence of executable steps for a Windows desktop environment.

Task: {}

### Guidelines:
1.  **Think Step-by-Step:** Before generating the JSON plan, briefly analyze the task constraints, potential failure points, and the logical flow of operations.
2.  **Atomic Actions:** Each step must be a single, discrete action (e.g., "Click", "Type", "Wait"). Do not combine complex logic into one step.
3.  **Verification:** Whenever possible, include a `WaitForElement` or `Screenshot` step after a significant action (like clicking a submit button) to verify the UI state has changed.
4.  **Error Handling:** Set `retry_on_failure: true` for actions that might be flaky (e.g., finding an element that loads asynchronously).
5.  **Context:** Assume the agent has full control of the mouse and keyboard, and can see the screen via screenshots.

### Available Actions:
- **Screenshot**: Capture the current state.
- **Click**: Click a UI element (TextMatch, ImageMatch, Coordinates).
- **Type**: Enter text into a field.
- **Navigate**: Open a URL (if a browser is open).
- **WaitForElement**: Pause until an element appears.
- **ExecuteCommand**: Run a shell command.
- **ReadFile / WriteFile**: File system operations.
- **SearchText**: Find text on screen.
- **Scroll**: Scroll the active window.
- **PressKey**: Send keystrokes (e.g., "Enter", "Ctrl+C").

### Output Format:
First, provide a brief **Thinking Process** (analysis).
Then, provide the **JSON Plan** inside a code block.

Example:
Thinking Process:
The user wants to open Notepad and type "Hello".
1. I need to find Notepad. I can use `ExecuteCommand` to launch it or search for it. Launching via command is more reliable.
2. I need to wait for the Notepad window to appear.
3. Then I can type the text.

```json
[
  {{
    "id": "step_1",
    "action": {{
      "type": "ExecuteCommand",
      "command": "notepad.exe"
    }},
    "description": "Launch Notepad application",
    "expected_result": "Notepad process starts",
    "timeout": 5,
    "retry_on_failure": false
  }},
  {{
    "id": "step_2",
    "action": {{
      "type": "WaitForElement",
      "target": {{
        "type": "TextMatch",
        "text": "Untitled",
        "fuzzy": true
      }}
    }},
    "description": "Wait for Notepad window to be visible",
    "timeout": 10,
    "retry_on_failure": true
  }},
  {{
    "id": "step_3",
    "action": {{
      "type": "Type",
      "target": {{ "type": "Coordinates", "x": 0, "y": 0 }},
      "text": "Hello World"
    }},
    "description": "Type greeting text into the active window",
    "timeout": 5,
    "retry_on_failure": true
  }}
]
```"#,
            description
        );

        let response = match self.router.lock().await.send_message(&prompt, None).await {
            Ok(res) => res,
            Err(e) => {
                tracing::warn!(
                    "[Planner] LLM planning failed: {}. Falling back to basic plan.",
                    e
                );
                self.generate_basic_plan(description).await?
            }
        };

        self.parse_plan(&response)
    }

    async fn generate_basic_plan(&self, description: &str) -> Result<String> {
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
}
