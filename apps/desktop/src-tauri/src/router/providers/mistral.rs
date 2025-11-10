/**
 * Mistral AI Provider (Mistral Large 2, Codestral)
 * OpenAI-compatible API at https://api.mistral.ai/v1
 */
use crate::router::{
    ChatMessage, LLMProvider, LLMRequest, LLMResponse, ToolCall, ToolChoice, ToolDefinition,
};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::error::Error;

const MISTRAL_API_BASE: &str = "https://api.mistral.ai/v1";

pub struct MistralProvider {
    api_key: Option<String>,
    client: Client,
}

impl MistralProvider {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }

    fn get_api_key(&self) -> Result<&str, Box<dyn Error + Send + Sync>> {
        self.api_key
            .as_deref()
            .ok_or_else(|| "Mistral API key not configured".into())
    }
}

#[derive(Debug, Serialize)]
struct MistralRequest {
    model: String,
    messages: Vec<MistralMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<serde_json::Value>>,
    stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct MistralMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct MistralResponse {
    choices: Vec<MistralChoice>,
    usage: MistralUsage,
    model: String,
}

#[derive(Debug, Deserialize)]
struct MistralChoice {
    message: MistralMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MistralUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[async_trait]
impl LLMProvider for MistralProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let api_key = self.get_api_key()?;

        let messages: Vec<MistralMessage> = request
            .messages
            .iter()
            .map(|m| MistralMessage {
                role: m.role.clone(),
                content: m.content.clone(),
            })
            .collect();

        let mistral_request = MistralRequest {
            model: request.model.clone(),
            messages,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            tools: None, // TODO: Implement function calling
            stream: false,
        };

        let response = self
            .client
            .post(format!("{}/chat/completions", MISTRAL_API_BASE))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&mistral_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Mistral API error: {}", error_text).into());
        }

        let mistral_response: MistralResponse = response.json().await?;

        let choice = mistral_response
            .choices
            .first()
            .ok_or("No choices in Mistral response")?;

        // Calculate cost ($2/$6 per million tokens for Mistral Large 2)
        let cost = (mistral_response.usage.prompt_tokens as f64 * 0.000002)
            + (mistral_response.usage.completion_tokens as f64 * 0.000006);

        Ok(LLMResponse {
            content: choice.message.content.clone(),
            tokens: Some(mistral_response.usage.total_tokens),
            prompt_tokens: Some(mistral_response.usage.prompt_tokens),
            completion_tokens: Some(mistral_response.usage.completion_tokens),
            cost: Some(cost),
            model: mistral_response.model,
            cached: false,
            tool_calls: None,
            finish_reason: choice.finish_reason.clone(),
        })
    }

    fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    fn name(&self) -> &str {
        "mistral"
    }
}
