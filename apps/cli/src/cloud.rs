#![allow(dead_code, unused_imports)]

//! Cloud mode: BYOK execution with top agentic coding models.
//!
//! Model list comes from `model_catalog.rs` (cloud_eligible = true).
//! Update models there, not here.

use anyhow::Result;
use colored::Colorize;
use std::collections::HashMap;

use crate::model_catalog;

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
        "Cloud Models — Top Agentic Coding Models (March 2026)".bold()
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

#[derive(Debug, Clone, Default)]
pub struct ByokConfig {
    pub api_keys: HashMap<String, String>,
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

#[derive(Debug, Clone, Default)]
pub struct CloudConfig {
    pub base_url: String,
    pub byok: ByokConfig,
    pub default_model: String,
}

impl CloudConfig {
    pub fn default() -> Self {
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
    if !config.byok.has_key(&cm.provider) {
        anyhow::bail!(
            "No API key for '{}'. Set the env var to use cloud BYOK.",
            cm.provider
        );
    }
    println!(
        "{} Submitted with {} (BYOK: {})",
        "cloud:".cyan().bold(),
        cm.display_name.as_str().bold(),
        cm.provider.as_str().green()
    );
    Ok(uuid::Uuid::new_v4().to_string())
}

pub fn print_cloud_status(config: &CloudConfig) {
    println!("\n{}", "BYOK Status:".bold());
    for &p in &model_catalog::providers() {
        if p == "ollama" {
            continue;
        } // local, no key needed
        let st = if config.byok.has_key(p) {
            "configured".green()
        } else {
            "not set".red()
        };
        println!("  {:<12} {}", p, st);
    }
}
