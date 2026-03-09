use super::*;

impl ToolExecutor {
    pub(super) async fn execute_llm_reason_tool(&self, args: &HashMap<String, Value>) -> Result<ToolResult> {
        let prompt = args
            .get("prompt")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing prompt parameter"))?;
        let model = args.get("model").and_then(|v| v.as_str());
        let _max_tokens = args
            .get("max_tokens")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);
        let depth = args.get("depth").and_then(|v| v.as_u64()).unwrap_or(0);

        const MAX_DEPTH: u64 = 3;
        if depth >= MAX_DEPTH {
            let err_msg = format!("Maximum recursion depth ({}) exceeded", MAX_DEPTH);
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": err_msg.clone(), "success": false }),
                error: Some(err_msg),
                metadata: HashMap::from([("depth".to_string(), json!(depth))]),
            });
        }

        if let Some(ref app) = self.app_handle {
            use crate::core::llm::RouterPreferences;
            use crate::sys::commands::LLMState;
            use tauri::Manager;

            let llm_state = app.state::<LLMState>();

            let model_str = model.unwrap_or("gpt-5-nano");
            let preferences = Some(RouterPreferences {
                provider: None,
                model: Some(model_str.to_string()),
                strategy: crate::core::llm::RoutingStrategy::Auto,
                context: None,
                prefer_cloud_credits: false,
            });

            let router = llm_state.router.read().await;
            match router.send_message(prompt, preferences).await {
                Ok(response) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "reasoning": response,
                        "model": model_str,
                        "depth": depth,
                    }),
                    error: None,
                    metadata: HashMap::from([("depth".to_string(), json!(depth))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("LLM reasoning failed: {}", e), "success": false }),
                    error: Some(format!("LLM reasoning failed: {}", e)),
                    metadata: HashMap::from([("depth".to_string(), json!(depth))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for LLM reasoning", "success": false }),
                error: Some("App handle not available for LLM reasoning".to_string()),
                metadata: HashMap::new(),
            })
        }
    }
}
