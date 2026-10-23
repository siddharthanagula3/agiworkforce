//! /advisor tool, routes a question to a higher-tier model for a quick
//! second opinion without polluting the main session context.
//!
//! The advisor builds a one-shot prompt and collects streaming chunks into a
//! single response string. It does not mutate the caller's message history.

use anyhow::{bail, Result};

use crate::agent::PrivacyMode;
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
        "minimax",
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
        "minimax" => std::env::var("MINIMAX_API_KEY").is_ok_and(|k| !k.is_empty()),
        "openrouter" => std::env::var("OPENROUTER_API_KEY").is_ok_and(|k| !k.is_empty()),
        "nvidia" => std::env::var("NVIDIA_API_KEY").is_ok_and(|k| !k.is_empty()),
        _ => false,
    }
}

fn advisor_rank(model: &crate::model_catalog::Model) -> (u8, usize, usize) {
    let tier_rank = match crate::model_catalog::quality_tier_for_model(&model.id).as_deref() {
        Some("best") => 3,
        Some("balanced") => 2,
        Some("fast") => 1,
        _ => 0,
    };
    (tier_rank, model.context_window, model.max_output_tokens)
}

fn best_catalog_model_for_provider(provider_name: &str) -> Option<String> {
    crate::model_catalog::models_for(provider_name)
        .into_iter()
        .filter(|model| model.status == "active")
        .max_by_key(|model| advisor_rank(model))
        .map(|model| model.id.clone())
}

fn best_managed_model(account: &models::AccountRoute) -> Option<String> {
    crate::model_catalog::cloud_models()
        .into_iter()
        .filter(|model| model.status == "active" && account.runs_managed(&model.id))
        .max_by_key(|model| advisor_rank(model))
        .map(|model| model.id.clone())
}

/// The model and provider the advisor may use for a session in `privacy`.
/// The question carries session context, so it never leaves that session's
/// trust boundary: none for Local, the account for Managed, a provider key
/// for BYOK.
fn advisor_route(
    model: Option<String>,
    privacy: PrivacyMode,
    account: &models::AccountRoute,
) -> Result<(String, Provider)> {
    let model = model.filter(|model| !model.trim().is_empty());
    let (model, provider) = match privacy {
        PrivacyMode::Local => bail!(
            "advisor: unavailable in a Local session; its context must not leave this device."
        ),
        PrivacyMode::Managed => {
            let model = match model {
                Some(model) => model,
                None => best_managed_model(account).ok_or_else(|| {
                    anyhow::anyhow!(
                        "advisor: no model on this account's plan can answer from a Managed session."
                    )
                })?,
            };
            if !account.runs_managed(&model) {
                bail!(
                    "advisor: model '{}' is not on this account's plan, and a Managed session's question never goes to a provider key.",
                    model
                );
            }
            (model, Provider::ManagedCloud)
        }
        PrivacyMode::Byok => match model {
            Some(model) => {
                let provider = models::try_detect_provider(&model).ok_or_else(|| {
                    anyhow::anyhow!(
                        "advisor: model '{}' is not recognized. Use a catalog model from `agi models list`.",
                        model
                    )
                })?;
                (model, provider)
            }
            None => pick_default_advisor_model()?,
        },
    };
    let route_mode = crate::agent::provider_privacy_mode(&provider);
    if route_mode != privacy {
        bail!(
            "advisor: model '{}' routes through {} mode, outside this {} session's trust boundary.",
            model,
            route_mode.trust_word(),
            privacy.trust_word()
        );
    }
    Ok((model, provider))
}

/// Consult a higher-tier model with a one-shot question, inside the trust
/// boundary of the session asking.
///
/// Returns an error if no API key is configured for the chosen provider.
pub async fn consult(req: AdvisorRequest, privacy: PrivacyMode) -> Result<AdvisorResponse> {
    let config = CliConfig::load().unwrap_or_default();

    let (model, provider) = advisor_route(req.model, privacy, &models::AccountRoute::load())?;

    // Validate the chosen provider has credentials before attempting a call.
    let has_key = match &provider {
        Provider::ManagedCloud => crate::tier_cache::load_jwt().is_some(),
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
        None, // Advisor queries don't use extended thinking,
        None,
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

    /// Holding a provider key does not guarantee the catalog exposes an advisor
    /// model for that provider, so the old form of this test asserted Ok on any
    /// machine whose environment happened to carry one and failed there. What
    /// holds everywhere: a success names a non-empty model belonging to a keyed
    /// provider, and a failure says why.
    #[test]
    fn pick_default_model_either_names_a_keyed_model_or_explains_itself() {
        match pick_default_advisor_model() {
            Ok((model, provider)) => {
                assert!(!model.is_empty(), "advisor model must not be empty");
                assert!(
                    keyed_provider_preference()
                        .iter()
                        .any(|name| provider_has_key(name)),
                    "advisor returned {provider:?} with no keyed provider present"
                );
            }
            Err(error) => {
                let message = error.to_string();
                assert!(
                    message.contains("provider") || message.contains("catalog"),
                    "unexplained advisor failure: {message}"
                );
            }
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
        let result = consult(req, PrivacyMode::Byok).await;
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

    fn signed_out() -> models::AccountRoute {
        models::AccountRoute::with(false, None)
    }

    #[test]
    fn a_managed_session_never_routes_the_advisor_to_a_provider_key() {
        let vendor_model = best_catalog_model_for_provider("anthropic")
            .unwrap_or_else(|| crate::model_catalog::default_model().to_string());

        for model in [Some(vendor_model), None] {
            let error = advisor_route(model, PrivacyMode::Managed, &signed_out())
                .expect_err("a Managed session's question stays on the account");
            assert!(error.to_string().contains("Managed"), "{error}");
        }
    }

    #[test]
    fn a_managed_session_routes_the_advisor_through_the_account() {
        let vendor_model = best_catalog_model_for_provider("anthropic")
            .unwrap_or_else(|| crate::model_catalog::default_model().to_string());
        let account = models::AccountRoute::with(true, None).with_plan_models(&[&vendor_model]);

        let (model, provider) =
            advisor_route(Some(vendor_model.clone()), PrivacyMode::Managed, &account)
                .expect("a plan model routes through the account");

        assert_eq!(model, vendor_model);
        assert_eq!(provider, Provider::ManagedCloud);
    }

    #[test]
    fn a_byok_session_keeps_the_advisor_on_a_provider_key() {
        let vendor_model = best_catalog_model_for_provider("anthropic")
            .unwrap_or_else(|| crate::model_catalog::default_model().to_string());
        let (_, provider) = advisor_route(Some(vendor_model), PrivacyMode::Byok, &signed_out())
            .expect("a catalog vendor model routes through a provider key");
        assert_eq!(
            crate::agent::provider_privacy_mode(&provider),
            PrivacyMode::Byok
        );

        let error = advisor_route(
            Some("fixture-local-model:latest".to_string()),
            PrivacyMode::Byok,
            &signed_out(),
        )
        .expect_err("a device model is outside a BYOK session's boundary");
        assert!(error.to_string().contains("outside this"), "{error}");
    }

    #[test]
    fn a_local_session_never_consults_the_advisor() {
        assert!(advisor_route(None, PrivacyMode::Local, &signed_out()).is_err());
    }
}
