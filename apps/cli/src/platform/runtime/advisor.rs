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

/// Pick the best available advisor model from the shared model catalog.
fn pick_default_advisor_model() -> Result<(String, Provider)> {
    for provider_name in keyed_provider_preference() {
        if !provider_has_key(provider_name) {
            continue;
        }
        if let Some(model) = best_catalog_model_for_provider(provider_name) {
            let provider = models::provider_from_name(provider_name)
                .or_else(|| models::try_detect_provider(&model))
                .ok_or_else(|| {
                    anyhow::anyhow!(
                        "advisor: catalog model '{}' has no supported provider mapping",
                        model
                    )
                })?;
            return Ok((model, provider));
        }
    }

    bail!(
        "advisor: no catalog-backed advisor model is available for the configured providers. \
         Set a provider API key or pass an explicit catalog model."
    )
}

fn keyed_provider_preference() -> &'static [&'static str] {
    &[
        "anthropic",
        "openai",
        "google",
        "xai",
        "deepseek",
        "qwen",
        "mistral",
        "openrouter",
        "nvidia",
    ]
}

fn provider_has_key(provider_name: &str) -> bool {
    match provider_name {
        "anthropic" => std::env::var("ANTHROPIC_API_KEY").is_ok_and(|k| !k.is_empty()),
        "openai" => std::env::var("OPENAI_API_KEY").is_ok_and(|k| !k.is_empty()),
        "google" => {
            std::env::var("GOOGLE_API_KEY").is_ok_and(|k| !k.is_empty())
                || std::env::var("GEMINI_API_KEY").is_ok_and(|k| !k.is_empty())
        }
        "xai" => std::env::var("XAI_API_KEY").is_ok_and(|k| !k.is_empty()),
        "deepseek" => std::env::var("DEEPSEEK_API_KEY").is_ok_and(|k| !k.is_empty()),
        "qwen" => std::env::var("DASHSCOPE_API_KEY").is_ok_and(|k| !k.is_empty()),
        "mistral" => std::env::var("MISTRAL_API_KEY").is_ok_and(|k| !k.is_empty()),
        "openrouter" => std::env::var("OPENROUTER_API_KEY").is_ok_and(|k| !k.is_empty()),
        "nvidia" => std::env::var("NVIDIA_API_KEY").is_ok_and(|k| !k.is_empty()),
        _ => false,
    }
}

fn best_catalog_model_for_provider(provider_name: &str) -> Option<String> {
    crate::model_catalog::models_for(provider_name)
        .into_iter()
        .filter(|model| model.status == "active")
        .max_by_key(|model| {
            let tier_rank = match crate::model_catalog::quality_tier_for_model(&model.id).as_deref()
            {
                Some("best") => 3,
                Some("balanced") => 2,
                Some("fast") => 1,
                _ => 0,
            };
            (tier_rank, model.context_window, model.max_output_tokens)
        })
        .map(|model| model.id.clone())
}

/// Consult a higher-tier model with a one-shot question.
///
/// Returns an error if no API key is configured for the chosen provider.
pub async fn consult(req: AdvisorRequest) -> Result<AdvisorResponse> {
    let config = CliConfig::load().unwrap_or_default();

    let (model, provider) = if let Some(m) = req.model.filter(|m| !m.is_empty()) {
        // Detect the provider from the explicitly requested model.
        let prov = models::try_detect_provider(&m).ok_or_else(|| {
            anyhow::anyhow!(
                "advisor: model '{}' is not recognized. Use a catalog model from `agi models list`.",
                m
            )
        })?;
        (m, prov)
    } else {
        pick_default_advisor_model()?
    };

    // Validate the chosen provider has credentials before attempting a call.
    let has_key = match &provider {
        Provider::Anthropic => provider_has_key("anthropic"),
        Provider::Google => provider_has_key("google"),
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
        if keyed_provider_preference()
            .iter()
            .any(|provider| provider_has_key(provider))
        {
            let (model, _provider) = pick_default_advisor_model().expect("keyed provider model");
            assert!(!model.is_empty());
        } else {
            assert!(pick_default_advisor_model().is_err());
        }
    }

    #[tokio::test]
    async fn consult_no_key_returns_error() {
        // Remove all provider keys to ensure the error path is exercised.
        // This test uses a model that requires ANTHROPIC_API_KEY.
        let original = std::env::var("ANTHROPIC_API_KEY").ok();
        std::env::remove_var("ANTHROPIC_API_KEY");
        std::env::remove_var("OPENAI_API_KEY");

        let model = best_catalog_model_for_provider("anthropic")
            .unwrap_or_else(|| crate::model_catalog::default_model().to_string());
        let req = AdvisorRequest {
            question: "test question".to_string(),
            model: Some(model),
        };
        let result = consult(req).await;
        assert!(result.is_err(), "expected error when no API key configured");
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("no API key configured"),
            "error message should mention missing key"
        );

        // Restore the env var if it was set.
        if let Some(v) = original {
            std::env::set_var("ANTHROPIC_API_KEY", v);
        }
    }
}
