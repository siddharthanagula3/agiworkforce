/**
 * DeepSeek Provider (V3.2, Coder-V2, Reasoner)
 * OpenAI-compatible API at https://api.deepseek.com/v1
 */
use crate::router::{ChatMessage, LLMProvider, LLMRequest, LLMResponse, ToolCall, ToolChoice, ToolDefinition};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::error::Error;

const DEEPSEEK_API_BASE: &str = "https://api.deepseek.com/v1";

pub struct DeepSeekProvider {
    api_key: Option<String>,
    client: Client,
}

impl DeepSeekProvider {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }

    fn get_api_key(&self) -> Result<&str, Box<dyn Error + Send + Sync>> {
        self.api_key
            .as_deref()
            .ok_or_else(|| "DeepSeek API key not configured".into())
    }
}

#[derive(Debug, Serialize)]
struct DeepSeekRequest {
    model: String,
    messages: Vec<DeepSeekMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<serde_json::Value>>,
    stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeepSeekMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct DeepSeekResponse {
    choices: Vec<DeepSeekChoice>,
    usage: DeepSeekUsage,
    model: String,
}

#[derive(Debug, Deserialize)]
struct DeepSeekChoice {
    message: DeepSeekMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeepSeekUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[async_trait]
impl LLMProvider for DeepSeekProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let api_key = self.get_api_key()?;

        let messages: Vec<DeepSeekMessage> = request
            .messages
            .iter()
            .map(|m| DeepSeekMessage {
                role: m.role.clone(),
                content: m.content.clone(),
            })
            .collect();

        let deepseek_request = DeepSeekRequest {
            model: request.model.clone(),
            messages,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            tools: None, // TODO: Implement function calling
            stream: false,
        };

        let response = self
            .client
            .post(format!("{}/chat/completions", DEEPSEEK_API_BASE))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&deepseek_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("DeepSeek API error: {}", error_text).into());
        }

        let deepseek_response: DeepSeekResponse = response.json().await?;

        let choice = deepseek_response
            .choices
            .first()
            .ok_or("No choices in DeepSeek response")?;

        // Calculate cost ($0.14/$0.28 per million tokens for V3, $0.14/$0.28 for Coder)
        // Using average of $0.14 input / $0.28 output
        let cost = (deepseek_response.usage.prompt_tokens as f64 * 0.00000014)
            + (deepseek_response.usage.completion_tokens as f64 * 0.00000028);

        Ok(LLMResponse {
            content: choice.message.content.clone(),
            tokens: Some(deepseek_response.usage.total_tokens),
            prompt_tokens: Some(deepseek_response.usage.prompt_tokens),
            completion_tokens: Some(deepseek_response.usage.completion_tokens),
            cost: Some(cost),
            model: deepseek_response.model,
            cached: false,
            tool_calls: None,
            finish_reason: choice.finish_reason.clone(),
        })
    }

    fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    fn name(&self) -> &str {
        "deepseek"
    }
}
