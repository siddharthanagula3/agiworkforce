/**
 * Qwen Provider (Alibaba Cloud - Qwen2.5-Max, Qwen3-Coder)
 * OpenAI-compatible API at https://dashscope-intl.aliyuncs.com/compatible-mode/v1
 */
use crate::router::{ChatMessage, LLMProvider, LLMRequest, LLMResponse, ToolCall};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::error::Error;

const QWEN_API_BASE: &str = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

pub struct QwenProvider {
    api_key: Option<String>,
    client: Client,
}

impl QwenProvider {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }

    fn get_api_key(&self) -> Result<&str, Box<dyn Error + Send + Sync>> {
        self.api_key
            .as_deref()
            .ok_or_else(|| "Qwen API key not configured".into())
    }
}

#[derive(Debug, Serialize)]
struct QwenRequest {
    model: String,
    messages: Vec<QwenMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<serde_json::Value>>,
    stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct QwenMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct QwenResponse {
    choices: Vec<QwenChoice>,
    usage: QwenUsage,
    model: String,
}

#[derive(Debug, Deserialize)]
struct QwenChoice {
    message: QwenMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QwenUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[async_trait]
impl LLMProvider for QwenProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let api_key = self.get_api_key()?;

        let messages: Vec<QwenMessage> = request
            .messages
            .iter()
            .map(|m| QwenMessage {
                role: m.role.clone(),
                content: m.content.clone(),
            })
            .collect();

        let qwen_request = QwenRequest {
            model: request.model.clone(),
            messages,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            tools: None, // TODO: Implement function calling
            stream: false,
        };

        let response = self
            .client
            .post(format!("{}/chat/completions", QWEN_API_BASE))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&qwen_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Qwen API error: {}", error_text).into());
        }

        let qwen_response: QwenResponse = response.json().await?;

        let choice = qwen_response
            .choices
            .first()
            .ok_or("No choices in Qwen response")?;

        // Calculate cost (estimated $0.40/$1.20 per million tokens for Qwen2.5-Max)
        let cost = (qwen_response.usage.prompt_tokens as f64 * 0.0000004)
            + (qwen_response.usage.completion_tokens as f64 * 0.0000012);

        Ok(LLMResponse {
            content: choice.message.content.clone(),
            tokens: Some(qwen_response.usage.total_tokens),
            prompt_tokens: Some(qwen_response.usage.prompt_tokens),
            completion_tokens: Some(qwen_response.usage.completion_tokens),
            cost: Some(cost),
            model: qwen_response.model,
            cached: false,
            tool_calls: None,
            finish_reason: choice.finish_reason.clone(),
        })
    }

    fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    fn name(&self) -> &str {
        "qwen"
    }
}
