use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

use super::llm_router::{LLMRouter, RouteOutcome, RouterPreferences};
use super::{ChatMessage, LLMRequest, Provider};

/// A single model's response in a council query.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CouncilMemberResponse {
    pub provider: String,
    pub model: String,
    pub content: String,
    pub tokens: u32,
    pub cost: f64,
    pub latency_ms: u64,
    pub error: Option<String>,
}

/// Aggregated council result with consensus analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CouncilResult {
    pub query: String,
    pub responses: Vec<CouncilMemberResponse>,
    pub consensus_summary: String,
    pub total_cost: f64,
    pub total_latency_ms: u64,
    pub agreement_score: f64,
    pub successful_count: usize,
    pub failed_count: usize,
}

/// Which models to include in a council query.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CouncilConfig {
    /// Specific provider/model pairs to query. If empty, uses top N configured providers.
    pub models: Vec<CouncilModel>,
    /// Maximum time to wait for all responses (seconds).
    pub timeout_secs: u64,
    /// Whether to synthesize a consensus summary via an additional LLM call.
    pub synthesize_consensus: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CouncilModel {
    pub provider: String,
    pub model: String,
}

impl Default for CouncilConfig {
    fn default() -> Self {
        Self {
            models: vec![],
            timeout_secs: 60,
            synthesize_consensus: true,
        }
    }
}

/// Fan-out a prompt to multiple LLM providers in parallel and collect responses.
pub async fn council_query(
    router: &Arc<RwLock<LLMRouter>>,
    prompt: &str,
    system_prompt: Option<&str>,
    config: &CouncilConfig,
) -> Result<CouncilResult> {
    let start = Instant::now();

    let models = if config.models.is_empty() {
        // Auto-select: get configured providers from the router
        let reader = router.read().await;
        let default_prefs = RouterPreferences::default();
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: String::new(),
            temperature: Some(0.7),
            max_tokens: Some(4000),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            ..Default::default()
        };
        let candidates = reader.candidates(&request, &default_prefs);
        drop(reader);

        // Take up to 3 unique providers
        let mut seen_providers = std::collections::HashSet::new();
        candidates
            .into_iter()
            .filter(|c| seen_providers.insert(c.provider))
            .take(3)
            .map(|c| CouncilModel {
                provider: c.provider.as_string().to_string(),
                model: c.model.clone(),
            })
            .collect::<Vec<_>>()
    } else {
        config.models.clone()
    };

    if models.is_empty() {
        return Err(anyhow!("No models configured for council query"));
    }

    tracing::info!(
        model_count = models.len(),
        "[Council] Starting parallel query across {} models",
        models.len()
    );

    // Fan-out: send request to all models in parallel
    let timeout = Duration::from_secs(config.timeout_secs);
    let mut handles = Vec::with_capacity(models.len());

    for model_cfg in &models {
        let router_clone = Arc::clone(router);
        let prompt_owned = prompt.to_string();
        let system_owned = system_prompt.map(|s| s.to_string());
        let provider_str = model_cfg.provider.clone();
        let model_str = model_cfg.model.clone();

        handles.push(tokio::spawn(async move {
            let member_start = Instant::now();
            let result = query_single_model(
                &router_clone,
                &prompt_owned,
                system_owned.as_deref(),
                &provider_str,
                &model_str,
            )
            .await;
            let latency = member_start.elapsed().as_millis() as u64;
            (provider_str, model_str, result, latency)
        }));
    }

    // Collect responses with timeout
    let mut responses = Vec::with_capacity(handles.len());
    let mut successful_count = 0;
    let mut failed_count = 0;
    let mut total_cost = 0.0;

    let results = tokio::time::timeout(timeout, futures_util::future::join_all(handles))
        .await
        .map_err(|_| anyhow!("Council query timed out after {}s", config.timeout_secs))?;

    for join_result in results {
        match join_result {
            Ok((provider, model, Ok(outcome), latency)) => {
                total_cost += outcome.cost;
                responses.push(CouncilMemberResponse {
                    provider,
                    model,
                    content: outcome.response.content.clone(),
                    tokens: outcome.completion_tokens,
                    cost: outcome.cost,
                    latency_ms: latency,
                    error: None,
                });
                successful_count += 1;
            }
            Ok((provider, model, Err(e), latency)) => {
                tracing::warn!(
                    provider = %provider,
                    model = %model,
                    error = %e,
                    "[Council] Model failed"
                );
                responses.push(CouncilMemberResponse {
                    provider,
                    model,
                    content: String::new(),
                    tokens: 0,
                    cost: 0.0,
                    latency_ms: latency,
                    error: Some(e.to_string()),
                });
                failed_count += 1;
            }
            Err(e) => {
                tracing::error!(error = %e, "[Council] Task join failed");
                failed_count += 1;
            }
        }
    }

    if successful_count == 0 {
        return Err(anyhow!("All council models failed"));
    }

    // Synthesize consensus
    let (consensus_summary, agreement_score) = if config.synthesize_consensus && successful_count > 1
    {
        synthesize_consensus(router, prompt, &responses).await
    } else if successful_count == 1 {
        (
            "Single model response — no consensus needed.".to_string(),
            1.0,
        )
    } else {
        ("Consensus synthesis disabled.".to_string(), 0.0)
    };

    let total_latency = start.elapsed().as_millis() as u64;

    Ok(CouncilResult {
        query: prompt.to_string(),
        responses,
        consensus_summary,
        total_cost,
        total_latency_ms: total_latency,
        agreement_score,
        successful_count,
        failed_count,
    })
}

/// Send a request to a single provider/model.
async fn query_single_model(
    router: &Arc<RwLock<LLMRouter>>,
    prompt: &str,
    system_prompt: Option<&str>,
    provider_str: &str,
    model_str: &str,
) -> Result<RouteOutcome> {
    let mut messages = Vec::new();

    if let Some(sys) = system_prompt {
        messages.push(ChatMessage {
            role: "system".to_string(),
            content: sys.to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        });
    }

    messages.push(ChatMessage {
        role: "user".to_string(),
        content: prompt.to_string(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    });

    let request = LLMRequest {
        messages,
        model: model_str.to_string(),
        temperature: Some(0.7),
        max_tokens: Some(4000),
        stream: false,
        tools: None,
        tool_choice: None,
        thinking_mode: None,
        ..Default::default()
    };

    let prefs = RouterPreferences {
        provider: Provider::from_string(provider_str),
        model: Some(model_str.to_string()),
        ..Default::default()
    };

    let reader = router.read().await;
    reader.route_with_retry(&request, &prefs, None).await
}

/// Use an LLM to synthesize a consensus summary from multiple responses.
async fn synthesize_consensus(
    router: &Arc<RwLock<LLMRouter>>,
    original_prompt: &str,
    responses: &[CouncilMemberResponse],
) -> (String, f64) {
    let successful: Vec<_> = responses.iter().filter(|r| r.error.is_none()).collect();

    if successful.len() < 2 {
        return ("Insufficient responses for consensus.".to_string(), 0.0);
    }

    let mut synthesis_prompt = format!(
        "You are a council synthesizer. Multiple AI models were asked the same question. \
         Analyze their responses and produce:\n\
         1. A CONSENSUS SUMMARY capturing points of agreement\n\
         2. DISAGREEMENTS noting where models diverge\n\
         3. An AGREEMENT SCORE from 0.0 (total disagreement) to 1.0 (complete agreement)\n\n\
         Original question: {}\n\n",
        original_prompt
    );

    for (i, resp) in successful.iter().enumerate() {
        synthesis_prompt.push_str(&format!(
            "--- Model {} ({}/{}) ---\n{}\n\n",
            i + 1,
            resp.provider,
            resp.model,
            resp.content
        ));
    }

    synthesis_prompt.push_str(
        "Respond in this exact format:\n\
         CONSENSUS: <summary of agreements>\n\
         DISAGREEMENTS: <summary of disagreements, or \"None\" if all agree>\n\
         AGREEMENT_SCORE: <0.0 to 1.0>",
    );

    let reader = router.read().await;
    match reader.send_message(&synthesis_prompt, None).await {
        Ok(synthesis) => {
            let score = extract_agreement_score(&synthesis);
            (synthesis, score)
        }
        Err(e) => {
            tracing::warn!(error = %e, "[Council] Consensus synthesis failed");
            ("Consensus synthesis failed.".to_string(), 0.0)
        }
    }
}

/// Extract the agreement score from the synthesis response.
fn extract_agreement_score(text: &str) -> f64 {
    for line in text.lines().rev() {
        let line_lower = line.to_lowercase();
        if line_lower.contains("agreement_score") || line_lower.contains("agreement score") {
            // Find a float in the line
            for word in line.split_whitespace() {
                let cleaned = word.trim_matches(|c: char| !c.is_ascii_digit() && c != '.');
                if let Ok(score) = cleaned.parse::<f64>() {
                    if (0.0..=1.0).contains(&score) {
                        return score;
                    }
                }
            }
        }
    }
    0.5 // Default if parsing fails
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_agreement_score() {
        assert!((extract_agreement_score("AGREEMENT_SCORE: 0.85") - 0.85).abs() < f64::EPSILON);
        assert!((extract_agreement_score("Agreement Score: 0.7") - 0.7).abs() < f64::EPSILON);
        assert!(
            (extract_agreement_score("Some text\nAGREEMENT_SCORE: 0.95\nMore text") - 0.95).abs()
                < f64::EPSILON
        );
        assert!((extract_agreement_score("No score here") - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn test_default_council_config() {
        let config = CouncilConfig::default();
        assert!(config.models.is_empty());
        assert_eq!(config.timeout_secs, 60);
        assert!(config.synthesize_consensus);
    }
}
