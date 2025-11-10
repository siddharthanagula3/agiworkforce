/**
 * xAI Provider (Grok 4, Grok 3)
 * OpenAI-compatible API at https://api.x.ai/v1
 */

use crate::router::{ChatMessage, LLMProvider, LLMRequest, LLMResponse, ToolCall};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::error::Error;

const XAI_API_BASE: &str = "https://api.x.ai/v1";

pub struct XAIProvider {
    api_key: Option<String>,
    client: Client,
}

impl XAIProvider {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }

    fn get_api_key(&self) -> Result<&str, Box<dyn Error + Send + Sync>> {
        self.api_key
            .as_deref()
            .ok_or_else(|| "XAI API key not configured".into())
    }
}

#[derive(Debug, Serialize)]
struct XAIRequest {
    model: String,
    messages: Vec<XAIMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<serde_json::Value>>,
    stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct XAIMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct XAIResponse {
    choices: Vec<XAIChoice>,
    usage: XAIUsage,
    model: String,
}

#[derive(Debug, Deserialize)]
struct XAIChoice {
    message: XAIMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct XAIUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[async_trait]
impl LLMProvider for XAIProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let api_key = self.get_api_key()?;

        let messages: Vec<XAIMessage> = request
            .messages
            .iter()
            .map(|m| XAIMessage {
                role: m.role.clone(),
                content: m.content.clone(),
            })
            .collect();

        let xai_request = XAIRequest {
            model: request.model.clone(),
            messages,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            tools: None, // TODO: Implement function calling
            stream: false,
        };

        let response = self
            .client
            .post(format!("{}/chat/completions", XAI_API_BASE))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&xai_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("XAI API error: {}", error_text).into());
        }

        let xai_response: XAIResponse = response.json().await?;

        let choice = xai_response
            .choices
            .first()
            .ok_or("No choices in XAI response")?;

        // Calculate cost ($3/$15 per million tokens)
        let cost = (xai_response.usage.prompt_tokens as f64 * 0.000003)
            + (xai_response.usage.completion_tokens as f64 * 0.000015);

        Ok(LLMResponse {
            content: choice.message.content.clone(),
            tokens: Some(xai_response.usage.total_tokens),
            prompt_tokens: Some(xai_response.usage.prompt_tokens),
            completion_tokens: Some(xai_response.usage.completion_tokens),
            cost: Some(cost),
            model: xai_response.model,
            cached: false,
            tool_calls: None,
            finish_reason: choice.finish_reason.clone(),
        })
    }

    fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    fn name(&self) -> &str {
        "xai"
    }
}
