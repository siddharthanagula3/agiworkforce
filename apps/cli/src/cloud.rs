#![allow(dead_code, unused_imports)]

//! Managed cloud status and model catalog.
//!
//! Execution is private beta and fails closed until the backend contract is
//! available. BYOK provider execution uses the normal model path, not this
//! managed cloud stub.

use anyhow::{bail, Result};
use colored::Colorize;
use std::collections::HashMap;

use crate::model_catalog;
use crate::terminal_style as ts;

// ─────────────────────────────────────────────────────────────────────────────
// Cloud eligibility — delegated to model_catalog
// ─────────────────────────────────────────────────────────────────────────────

pub fn is_cloud_eligible(model_id: &str) -> bool {
    model_catalog::find(model_id).is_some_and(|m| m.cloud_eligible)
}

pub fn format_cloud_models() -> String {
    let models = model_catalog::cloud_models();
    let mut out = format!(
        "{}\n\n",
        "Managed Cloud Models — Private Beta".bold()
    );
    out.push_str(&format!(
        "  {:<22} {:<12} {:>8} {:>8} {}\n",
        "Model", "Provider", "Context", "Output", "Released"
    ));
    out.push_str(&format!("  {}\n", "-".repeat(70)));
    for m in &models {
        out.push_str(&format!(
            "  {:<22} {:<12} {:>7}K {:>7}K  {}\n",
            m.display_name,
            m.provider,
            m.context_window / 1000,
            m.max_output_tokens / 1000,
            m.release_date
        ));
    }
    out
}

// ─────────────────────────────────────────────────────────────────────────────
// BYOK config
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Clone, Default)]
pub struct ByokConfig {
    pub api_keys: HashMap<String, String>,
}

// Manual Debug that redacts BYOK API key *values* — only the configured
// provider names are printed. A derived Debug would emit plaintext secrets into
// any `{:?}`/`tracing` call that touches this struct (or `CloudConfig`).
impl std::fmt::Debug for ByokConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut providers: Vec<&str> = self.api_keys.keys().map(String::as_str).collect();
        providers.sort_unstable();
        f.debug_struct("ByokConfig")
            .field("providers", &providers)
            .field("api_keys", &"<redacted>")
            .finish()
    }
}

impl ByokConfig {
    pub fn from_env() -> Self {
        let mut keys = HashMap::new();
        for (p, e) in [
            ("anthropic", "ANTHROPIC_API_KEY"),
            ("openai", "OPENAI_API_KEY"),
            ("google", "GOOGLE_API_KEY"),
            ("deepseek", "DEEPSEEK_API_KEY"),
            ("mistral", "MISTRAL_API_KEY"),
            ("xai", "XAI_API_KEY"),
        ] {
            if let Ok(k) = std::env::var(e) {
                if !k.is_empty() {
                    keys.insert(p.to_string(), k);
                }
            }
        }
        Self { api_keys: keys }
    }
    pub fn has_key(&self, provider: &str) -> bool {
        self.api_keys.contains_key(provider)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloud config
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CloudConfig {
    pub base_url: String,
    pub byok: ByokConfig,
    pub default_model: String,
}

impl Default for CloudConfig {
    fn default() -> Self {
        Self {
            base_url: "https://cloud.agiworkforce.com/api/v1".into(),
            byok: ByokConfig::from_env(),
            default_model: model_catalog::default_model().into(),
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloud exec
// ─────────────────────────────────────────────────────────────────────────────

pub async fn cloud_exec(
    config: &CloudConfig,
    _prompt: &str,
    model: Option<&str>,
) -> Result<String> {
    let model_id = model.unwrap_or(&config.default_model);
    if !is_cloud_eligible(model_id) {
        let eligible: Vec<&str> = model_catalog::cloud_models()
            .iter()
            .map(|m| m.id.as_str())
            .collect();
        anyhow::bail!(
            "Model '{}' not cloud-eligible. Use: {}",
            model_id,
            eligible.join(", ")
        );
    }
    let cm = model_catalog::find(model_id)
        .ok_or_else(|| anyhow::anyhow!("Model '{}' not found in catalog", model_id))?;
    bail!(
        "Cloud execution is private beta and is not wired in this CLI build. No task was submitted for model '{}' via provider '{}'. Use a local/BYOK model path, or join the managed cloud waitlist when the backend contract is available.",
        cm.display_name,
        cm.provider
    )
}

pub fn print_cloud_status(config: &CloudConfig) {
    println!("\n{}", "BYOK Status:".bold());
    for &p in &model_catalog::providers() {
        if p == "ollama" {
            continue;
        } // local, no key needed
        let st = if config.byok.has_key(p) {
            ts::success("configured")
        } else {
            ts::danger("not set")
        };
        println!("  {:<12} {}", p, st);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cloud_exec_fails_closed_without_fake_task_id() {
        let cloud_models = model_catalog::cloud_models();
        let model = cloud_models
            .first()
            .expect("cloud model catalog should include at least one model");
        let mut config = CloudConfig {
            default_model: model.id.clone(),
            ..CloudConfig::default()
        };
        config
            .byok
            .api_keys
            .insert(model.provider.clone(), "test-key".to_string());

        let error = cloud_exec(&config, "test prompt", Some(&model.id))
            .await
            .expect_err("cloud exec should fail closed");
        let message = error.to_string();

        assert!(message.contains("private beta"), "{message}");
        assert!(message.contains("not wired"), "{message}");
        assert!(!message.contains("Submitted"), "{message}");
    }
}
