//! /advisor tool — routes a question to a higher-tier model for a quick
//! second opinion without polluting the main session context.
//!
//! The advisor builds a one-shot prompt and collects streaming chunks into a
//! single response string. It does not mutate the caller's message history.

use anyhow::{bail, Result};

use crate::config::CliConfig;
use crate::models::{self, Message, Provider};

pub struct AdvisorRequest {
    pub question: String,
    /// Explicit model override; defaults to the highest-tier available.
    pub model: Option<String>,
}

#[derive(Debug)]
pub struct AdvisorResponse {
    pub answer: String,
    pub model_used: String,
    pub tokens: u32,
}

/// Pick the best available advisor model by checking env-var availability.
fn pick_default_advisor_model() -> (String, Provider) {
    // Prefer claude-opus-4-7 if Anthropic key is present.
    if std::env::var("ANTHROPIC_API_KEY").is_ok_and(|k| !k.is_empty()) {
        return ("claude-opus-4-7".to_string(), Provider::Anthropic);
    }
    // Fall back to gpt-5.5 if OpenAI key is present.
    if std::env::var("OPENAI_API_KEY").is_ok_and(|k| !k.is_empty()) {
        return (
            "gpt-5.5".to_string(),
            models::openai_provider(),
        );
    }
    // Last resort: return Anthropic anyway (will fail with a clear error at
    // call time if the key is missing).
    ("claude-opus-4-7".to_string(), Provider::Anthropic)
}

/// Consult a higher-tier model with a one-shot question.
///
/// Returns an error if no API key is configured for the chosen provider.
pub async fn consult(req: AdvisorRequest) -> Result<AdvisorResponse> {
    let config = CliConfig::load().unwrap_or_default();

    let (model, provider) = if let Some(m) = req.model.filter(|m| !m.is_empty()) {
        // Detect the provider from the explicitly requested model.
        let prov = models::detect_provider(&m);
        (m, prov)
    } else {
        pick_default_advisor_model()
    };

    // Validate the chosen provider has credentials before attempting a call.
    let has_key = match &provider {
        Provider::Anthropic => {
            std::env::var("ANTHROPIC_API_KEY").is_ok_and(|k| !k.is_empty())
        }
        Provider::Google => {
            std::env::var("GOOGLE_API_KEY").is_ok_and(|k| !k.is_empty())
                || std::env::var("GEMINI_API_KEY").is_ok_and(|k| !k.is_empty())
        }
        Provider::Ollama(_) => true, // keyless
        Provider::OpenAICompatible { api_key_env, .. } => api_key_env
            .map(|env| std::env::var(env).is_ok_and(|k| !k.is_empty()))
            .unwrap_or(true),
        Provider::Custom { api_key_env, .. } => api_key_env
            .as_deref()
            .map(|env| std::env::var(env).is_ok_and(|k| !k.is_empty()))
            .unwrap_or(true),
    };

    if !has_key {
        bail!(
            "advisor: no API key configured for provider required by model '{}'. \
             Set the relevant *_API_KEY environment variable.",
            model
        );
    }

    let messages = vec![
        Message::text(
            "system",
            "You are an expert advisor. Be concise and precise. \
             Answer the question directly without preamble.",
        ),
        Message::text("user", &req.question),
    ];

    let answer_chunks = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let chunks_cb = answer_chunks.clone();
    let result = models::stream_completion(
        &config,
        &provider,
        &model,
        &messages,
        1024,
        None,
        Box::new(move |chunk: &str| {
            chunks_cb.lock().unwrap().push(chunk.to_string());
        }),
    )
    .await?;

    // Prefer the accumulated streaming text; fall back to result.text.
    let collected = answer_chunks.lock().unwrap().join("");
    let answer = if collected.is_empty() {
        result.text.clone()
    } else {
        collected
    };

    Ok(AdvisorResponse {
        answer,
        model_used: model,
        tokens: result.input_tokens + result.output_tokens,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_default_model_returns_string() {
        let (model, _provider) = pick_default_advisor_model();
        assert!(!model.is_empty());
    }

    #[tokio::test]
    async fn consult_no_key_returns_error() {
        // Remove all provider keys to ensure the error path is exercised.
        // This test uses a model that requires ANTHROPIC_API_KEY.
        let original = std::env::var("ANTHROPIC_API_KEY").ok();
        std::env::remove_var("ANTHROPIC_API_KEY");
        std::env::remove_var("OPENAI_API_KEY");

        let req = AdvisorRequest {
            question: "test question".to_string(),
            model: Some("claude-opus-4-7".to_string()),
        };
        let result = consult(req).await;
        assert!(result.is_err(), "expected error when no API key configured");
        assert!(
            result.unwrap_err().to_string().contains("no API key configured"),
            "error message should mention missing key"
        );

        // Restore the env var if it was set.
        if let Some(v) = original {
            std::env::set_var("ANTHROPIC_API_KEY", v);
        }
    }
}
