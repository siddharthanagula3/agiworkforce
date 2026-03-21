//! 3-tier model catalog: bundled defaults → disk cache → remote fetch.
//!
//! Architecture (inspired by Codex CLI + Aider + models.dev):
//!
//! Tier 1 — BUNDLED:  Compiled into binary. Always available offline.
//! Tier 2 — CACHE:    ~/.agiworkforce/cache/models.json (5-min TTL, version-aware)
//! Tier 3 — REMOTE:   models.dev/api.json (104 providers, free, open-source)
//! Tier 4 — USER:     config.toml [[models]] overrides (always win)
//!
//! To add/update models: edit BUNDLED_MODELS below. Remote fetch auto-discovers new
//! models from providers; bundled list is the offline fallback.
//!
//! Last updated: 2026-03-20

#![allow(dead_code, unused_imports)]

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL: Duration = Duration::from_secs(300); // 5 minutes
const FETCH_TIMEOUT: Duration = Duration::from_secs(5); // never block startup
const MODELS_DEV_URL: &str = "https://models.dev/api.json";
const CACHE_FILE: &str = "cache/models.json";

pub const DEFAULT_MODEL: &str = "claude-opus-4-6";
pub const DEFAULT_PROVIDER: &str = "anthropic";

// ─────────────────────────────────────────────────────────────────────────────
// Model type — shared by all tiers
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Model {
    pub id: String,
    pub provider: String,
    pub display_name: String,
    pub context_window: usize,
    pub max_output_tokens: usize,
    pub input_price_per_1m: f64,
    pub output_price_per_1m: f64,
    pub supports_tools: bool,
    pub supports_vision: bool,
    pub supports_reasoning: bool,
    #[serde(default)]
    pub supports_audio_input: bool,
    #[serde(default)]
    pub supports_audio_output: bool,
    #[serde(default)]
    pub supports_pdf: bool,
    #[serde(default)]
    pub release_date: String,
    #[serde(default)]
    pub cloud_eligible: bool,
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 1 — BUNDLED DEFAULTS (compiled into binary, works offline)
// ─────────────────────────────────────────────────────────────────────────────
// Edit this list when models change. This is the offline fallback.

fn bundled_models() -> Vec<Model> {
    vec![
        // ── Anthropic ── docs.anthropic.com/en/docs/about-claude/models
        m(
            "claude-opus-4-6",
            "anthropic",
            "Claude Opus 4.6",
            200_000,
            32_000,
            15.0,
            75.0,
            true,
            true,
            true,
            "2026-02-05",
            true,
        ),
        m(
            "claude-sonnet-4-6",
            "anthropic",
            "Claude Sonnet 4.6",
            200_000,
            16_000,
            3.0,
            15.0,
            true,
            true,
            true,
            "2026-02-17",
            true,
        ),
        m(
            "claude-haiku-4-5",
            "anthropic",
            "Claude Haiku 4.5",
            200_000,
            8_192,
            0.25,
            1.25,
            true,
            true,
            false,
            "2025-04-01",
            false,
        ),
        // ── OpenAI ── platform.openai.com/docs/models
        m(
            "gpt-5.4",
            "openai",
            "GPT-5.4",
            1_050_000,
            128_000,
            2.50,
            10.0,
            true,
            true,
            false,
            "2026-03-05",
            true,
        ),
        m(
            "gpt-5.4-mini",
            "openai",
            "GPT-5.4 Mini",
            400_000,
            128_000,
            0.15,
            0.60,
            true,
            true,
            false,
            "2026-03-17",
            false,
        ),
        m(
            "gpt-4.1",
            "openai",
            "GPT-4.1",
            1_047_576,
            32_768,
            2.0,
            8.0,
            true,
            true,
            false,
            "2025-04-01",
            false,
        ),
        m(
            "o3-mini",
            "openai",
            "o3-mini",
            200_000,
            100_000,
            1.10,
            4.40,
            true,
            false,
            true,
            "2025-01-01",
            false,
        ),
        // ── Google ── ai.google.dev/gemini-api/docs/models
        m(
            "gemini-3.1-pro-preview",
            "google",
            "Gemini 3.1 Pro",
            1_048_576,
            65_536,
            1.25,
            10.0,
            true,
            true,
            true,
            "2026-02-19",
            true,
        ),
        m(
            "gemini-3-flash-preview",
            "google",
            "Gemini 3 Flash",
            1_048_576,
            8_192,
            0.10,
            0.40,
            true,
            true,
            false,
            "2026-01-01",
            false,
        ),
        // ── Mistral ── docs.mistral.ai/models
        m(
            "mistral-large-2512",
            "mistral",
            "Mistral Large 3",
            256_000,
            65_536,
            2.0,
            6.0,
            true,
            false,
            false,
            "2025-12-01",
            true,
        ),
        m(
            "codestral-latest",
            "mistral",
            "Codestral",
            32_000,
            8_192,
            0.3,
            0.9,
            true,
            false,
            false,
            "2024-05-01",
            false,
        ),
        // ── xAI ── docs.x.ai/developers/models
        m(
            "grok-4.1",
            "xai",
            "Grok 4.1",
            2_000_000,
            128_000,
            2.0,
            10.0,
            true,
            true,
            false,
            "2025-11-17",
            true,
        ),
        m(
            "grok-4-1-fast-non-reasoning",
            "xai",
            "Grok 4.1 Fast",
            2_000_000,
            128_000,
            0.60,
            4.0,
            true,
            true,
            false,
            "2025-11-20",
            false,
        ),
        // ── DeepSeek ── api-docs.deepseek.com (V3.2 shipping, V4 not yet released)
        m(
            "deepseek-chat",
            "deepseek",
            "DeepSeek V3.2",
            128_000,
            8_000,
            0.14,
            0.28,
            true,
            false,
            false,
            "2025-12-01",
            true,
        ),
        m(
            "deepseek-reasoner",
            "deepseek",
            "DeepSeek V3.2 Reasoner",
            128_000,
            64_000,
            0.55,
            2.19,
            false,
            false,
            true,
            "2025-12-01",
            false,
        ),
        // ── Ollama (local, free) ──
        m(
            "llama3.1",
            "ollama",
            "Llama 3.1",
            128_000,
            8_192,
            0.0,
            0.0,
            false,
            false,
            false,
            "2024-07-01",
            false,
        ),
        m(
            "mistral-7b",
            "ollama",
            "Mistral 7B",
            32_000,
            4_096,
            0.0,
            0.0,
            false,
            false,
            false,
            "2023-09-01",
            false,
        ),
        m(
            "codellama",
            "ollama",
            "Code Llama",
            16_000,
            4_096,
            0.0,
            0.0,
            false,
            false,
            false,
            "2023-08-01",
            false,
        ),
    ]
}

/// Shorthand constructor to keep the bundled table compact.
#[allow(clippy::too_many_arguments)]
fn m(
    id: &str,
    provider: &str,
    name: &str,
    ctx: usize,
    out: usize,
    price_in: f64,
    price_out: f64,
    tools: bool,
    vision: bool,
    reasoning: bool,
    date: &str,
    cloud: bool,
) -> Model {
    Model {
        id: id.into(),
        provider: provider.into(),
        display_name: name.into(),
        context_window: ctx,
        max_output_tokens: out,
        input_price_per_1m: price_in,
        output_price_per_1m: price_out,
        supports_tools: tools,
        supports_vision: vision,
        supports_reasoning: reasoning,
        supports_audio_input: false,
        supports_audio_output: false,
        supports_pdf: false,
        release_date: date.into(),
        cloud_eligible: cloud,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 2 — DISK CACHE (version-aware, 5-min TTL)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct CacheEnvelope {
    /// CLI version that wrote this cache (invalidate on upgrade).
    version: String,
    /// Unix timestamp when cache was written.
    timestamp: u64,
    /// The cached models.
    models: Vec<Model>,
}

fn cache_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".agiworkforce")
        .join(CACHE_FILE)
}

fn read_cache() -> Option<Vec<Model>> {
    let path = cache_path();
    let content = std::fs::read_to_string(&path).ok()?;
    let envelope: CacheEnvelope = serde_json::from_str(&content).ok()?;

    // Version check: invalidate if CLI was upgraded
    if envelope.version != env!("CARGO_PKG_VERSION") {
        return None;
    }

    // TTL check
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    if now.saturating_sub(envelope.timestamp) > CACHE_TTL.as_secs() {
        return None;
    }

    Some(envelope.models)
}

fn write_cache(models: &[Model]) {
    let path = cache_path();
    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            eprintln!("[model_catalog] cache dir error: {e}");
            return;
        }
    }
    let envelope = CacheEnvelope {
        version: env!("CARGO_PKG_VERSION").to_string(),
        timestamp: SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        models: models.to_vec(),
    };
    match serde_json::to_string(&envelope) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&path, json) {
                eprintln!("[model_catalog] cache write error: {e}");
            }
        }
        Err(e) => eprintln!("[model_catalog] cache serialize error: {e}"),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 3 — REMOTE FETCH from models.dev (5s timeout, non-blocking)
// ─────────────────────────────────────────────────────────────────────────────

/// Response shape from models.dev/api.json (simplified — we only take what we need).
#[derive(Debug, Deserialize)]
struct ModelsDevResponse {
    #[serde(flatten)]
    providers: HashMap<String, ModelsDevProvider>,
}

#[derive(Debug, Deserialize)]
struct ModelsDevProvider {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    models: HashMap<String, ModelsDevModel>,
}

#[derive(Debug, Deserialize)]
struct ModelsDevModel {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    tool_call: Option<bool>,
    #[serde(default)]
    reasoning: Option<bool>,
    #[serde(default)]
    attachment: Option<bool>,
    #[serde(default)]
    cost: Option<ModelsDevCost>,
    #[serde(default)]
    limit: Option<ModelsDevLimit>,
    #[serde(default)]
    release_date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ModelsDevCost {
    #[serde(default)]
    input: Option<f64>,
    #[serde(default)]
    output: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct ModelsDevLimit {
    #[serde(default)]
    context: Option<usize>,
    #[serde(default)]
    output: Option<usize>,
}

/// Fetch models from models.dev. Returns None on any failure (timeout, parse error, etc.).
async fn fetch_remote() -> Option<Vec<Model>> {
    let client = reqwest::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .build()
        .ok()?;

    let resp = client.get(MODELS_DEV_URL).send().await.ok()?;
    let body = resp.text().await.ok()?;

    // models.dev returns a flat object of providers, each with a models map
    let raw: serde_json::Value = serde_json::from_str(&body).ok()?;
    let providers = raw.as_object()?;

    // Map provider names to our provider IDs
    let provider_map: HashMap<&str, &str> = [
        ("anthropic", "anthropic"),
        ("openai", "openai"),
        ("google", "google"),
        ("mistral", "mistral"),
        ("xai", "xai"),
        ("deepseek", "deepseek"),
        ("groq", "groq"),
        ("cohere", "cohere"),
        ("together", "together"),
    ]
    .into_iter()
    .collect();

    let mut models = Vec::new();

    for (provider_key, provider_val) in providers {
        let Some(provider_obj) = provider_val.as_object() else {
            continue;
        };
        let Some(models_obj) = provider_obj.get("models").and_then(|m| m.as_object()) else {
            continue;
        };
        let our_provider = provider_map
            .get(provider_key.as_str())
            .copied()
            .unwrap_or(provider_key.as_str());

        for (model_id, model_val) in models_obj {
            if let Ok(md) = serde_json::from_value::<ModelsDevModel>(model_val.clone()) {
                let ctx = md.limit.as_ref().and_then(|l| l.context).unwrap_or(128_000);
                let out = md.limit.as_ref().and_then(|l| l.output).unwrap_or(4_096);
                let price_in = md.cost.as_ref().and_then(|c| c.input).unwrap_or(0.0);
                let price_out = md.cost.as_ref().and_then(|c| c.output).unwrap_or(0.0);

                models.push(Model {
                    id: model_id.clone(),
                    provider: our_provider.to_string(),
                    display_name: md.name.unwrap_or_else(|| model_id.clone()),
                    context_window: ctx,
                    max_output_tokens: out,
                    input_price_per_1m: price_in,
                    output_price_per_1m: price_out,
                    supports_tools: md.tool_call.unwrap_or(false),
                    supports_vision: md.attachment.unwrap_or(false),
                    supports_reasoning: md.reasoning.unwrap_or(false),
                    supports_audio_input: false,
                    supports_audio_output: false,
                    supports_pdf: false,
                    release_date: md.release_date.unwrap_or_default(),
                    cloud_eligible: false, // only bundled models are cloud-eligible
                });
            }
        }
    }

    if models.is_empty() {
        None
    } else {
        Some(models)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 4 — USER OVERRIDES from config.toml [[models]]
// ─────────────────────────────────────────────────────────────────────────────

/// User-defined model override from config.toml.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserModelOverride {
    pub id: String,
    pub provider: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub context_window: Option<usize>,
    #[serde(default)]
    pub max_output_tokens: Option<usize>,
    #[serde(default)]
    pub input_price_per_1m: Option<f64>,
    #[serde(default)]
    pub output_price_per_1m: Option<f64>,
    #[serde(default)]
    pub supports_tools: Option<bool>,
    #[serde(default)]
    pub supports_vision: Option<bool>,
    #[serde(default)]
    pub supports_reasoning: Option<bool>,
}

impl UserModelOverride {
    /// Convert to a full Model with defaults for missing fields.
    pub fn to_model(&self) -> Model {
        Model {
            id: self.id.clone(),
            provider: self.provider.clone(),
            display_name: self.display_name.clone().unwrap_or_else(|| self.id.clone()),
            context_window: self.context_window.unwrap_or(128_000),
            max_output_tokens: self.max_output_tokens.unwrap_or(4_096),
            input_price_per_1m: self.input_price_per_1m.unwrap_or(0.0),
            output_price_per_1m: self.output_price_per_1m.unwrap_or(0.0),
            supports_tools: self.supports_tools.unwrap_or(true),
            supports_vision: self.supports_vision.unwrap_or(false),
            supports_reasoning: self.supports_reasoning.unwrap_or(false),
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: false,
            release_date: String::new(),
            cloud_eligible: false,
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog Manager — merges all 4 tiers
// ─────────────────────────────────────────────────────────────────────────────

/// The resolved model catalog. Call `load()` once at startup or `refresh()` to update.
pub struct Catalog {
    models: Vec<Model>,
    /// Index by model ID for O(1) lookup.
    index: HashMap<String, usize>,
}

impl Catalog {
    /// Build catalog from bundled defaults only (no I/O, instant).
    pub fn bundled() -> Self {
        let models = bundled_models();
        Self::from_models(models)
    }

    /// Load catalog: cache → bundled fallback. No network (sync).
    pub fn load() -> Self {
        // Try cache first
        if let Some(cached) = read_cache() {
            let mut catalog = Self::from_models(cached);
            // Always overlay bundled cloud-eligible models (cache doesn't track cloud_eligible)
            for bm in bundled_models() {
                if bm.cloud_eligible {
                    catalog.upsert(bm);
                }
            }
            return catalog;
        }
        Self::bundled()
    }

    /// Load + background refresh from models.dev (non-blocking).
    /// Returns the catalog immediately; spawns a task to fetch + update cache.
    pub fn load_with_refresh() -> Self {
        let catalog = Self::load();

        // Spawn non-blocking background refresh
        tokio::spawn(async {
            if let Some(remote_models) = fetch_remote().await {
                // Merge: bundled models take priority, remote fills gaps
                let mut merged = bundled_models();
                let bundled_ids: Vec<String> = merged.iter().map(|m| m.id.clone()).collect();
                for rm in remote_models {
                    if !bundled_ids.contains(&rm.id) {
                        merged.push(rm);
                    }
                }
                write_cache(&merged);
            }
        });

        catalog
    }

    /// Apply user overrides (Tier 4). Call after load.
    pub fn apply_overrides(&mut self, overrides: &[UserModelOverride]) {
        for ov in overrides {
            self.upsert(ov.to_model());
        }
    }

    fn from_models(models: Vec<Model>) -> Self {
        let mut index = HashMap::new();
        for (i, m) in models.iter().enumerate() {
            index.insert(m.id.to_lowercase(), i);
        }
        Self { models, index }
    }

    fn upsert(&mut self, model: Model) {
        let key = model.id.to_lowercase();
        if let Some(&idx) = self.index.get(&key) {
            self.models[idx] = model;
        } else {
            let idx = self.models.len();
            self.index.insert(key, idx);
            self.models.push(model);
        }
    }

    // ── Lookups ──────────────────────────────────────────────────

    pub fn find(&self, id: &str) -> Option<&Model> {
        let key = id.to_lowercase();
        self.index.get(&key).map(|&i| &self.models[i])
    }

    pub fn all(&self) -> &[Model] {
        &self.models
    }

    pub fn cloud_models(&self) -> Vec<&Model> {
        self.models.iter().filter(|m| m.cloud_eligible).collect()
    }

    pub fn models_for(&self, provider: &str) -> Vec<&Model> {
        self.models
            .iter()
            .filter(|m| m.provider == provider)
            .collect()
    }

    pub fn providers(&self) -> Vec<&str> {
        let mut seen = Vec::new();
        for m in &self.models {
            if !seen.contains(&m.provider.as_str()) {
                seen.push(m.provider.as_str());
            }
        }
        seen
    }

    pub fn count(&self) -> usize {
        self.models.len()
    }

    pub fn context_window(&self, model_id: &str) -> usize {
        if let Some(m) = self.find(model_id) {
            return m.context_window;
        }
        // Provider-level prefix fallback for unknown models
        let lower = model_id.to_lowercase();
        if lower.starts_with("claude") {
            return 200_000;
        }
        if lower.starts_with("gpt") {
            return 128_000;
        }
        if lower.starts_with("gemini") {
            return 1_048_576;
        }
        if lower.starts_with("grok") {
            return 2_000_000;
        }
        if lower.starts_with("mistral") || lower.starts_with("codestral") {
            return 256_000;
        }
        if lower.starts_with("deepseek") {
            return 128_000;
        }
        128_000
    }

    pub fn pricing(&self, model_id: &str) -> (f64, f64) {
        if let Some(m) = self.find(model_id) {
            return (m.input_price_per_1m, m.output_price_per_1m);
        }
        (0.0, 0.0)
    }

    pub fn provider_for(&self, model_id: &str) -> Option<&str> {
        if let Some(m) = self.find(model_id) {
            return Some(&m.provider);
        }
        let lower = model_id.to_lowercase();
        if lower.starts_with("claude") {
            return Some("anthropic");
        }
        if lower.starts_with("gpt") || lower.starts_with("o1") || lower.starts_with("o3") {
            return Some("openai");
        }
        if lower.starts_with("gemini") {
            return Some("google");
        }
        if lower.starts_with("mistral") || lower.starts_with("codestral") {
            return Some("mistral");
        }
        if lower.starts_with("grok") {
            return Some("xai");
        }
        if lower.starts_with("deepseek") {
            return Some("deepseek");
        }
        None
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Global singleton — use catalog() to access
// ─────────────────────────────────────────────────────────────────────────────

static GLOBAL_CATALOG: OnceLock<Catalog> = OnceLock::new();

/// Get the global catalog (initialized on first call).
pub fn catalog() -> &'static Catalog {
    GLOBAL_CATALOG.get_or_init(Catalog::load)
}

/// Convenience: find a model by ID.
pub fn find(id: &str) -> Option<&'static Model> {
    catalog().find(id)
}

/// Convenience: context window for a model.
pub fn context_window(model_id: &str) -> usize {
    catalog().context_window(model_id)
}

/// Convenience: pricing for a model.
pub fn pricing(model_id: &str) -> (f64, f64) {
    catalog().pricing(model_id)
}

/// Convenience: provider for a model.
pub fn provider_for(model_id: &str) -> Option<&str> {
    catalog().provider_for(model_id)
}

/// Convenience: cloud-eligible models.
pub fn cloud_models() -> Vec<&'static Model> {
    catalog().cloud_models()
}

/// Convenience: all models for a provider.
pub fn models_for(provider: &str) -> Vec<&'static Model> {
    catalog().models_for(provider)
}

/// Convenience: all providers.
pub fn providers() -> Vec<&'static str> {
    catalog().providers()
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_catalog_not_empty() {
        let cat = Catalog::bundled();
        assert!(cat.count() >= 15);
    }

    #[test]
    fn default_model_exists() {
        let cat = Catalog::bundled();
        assert!(cat.find(DEFAULT_MODEL).is_some());
    }

    #[test]
    fn all_providers_represented() {
        let cat = Catalog::bundled();
        for p in [
            "anthropic",
            "openai",
            "google",
            "mistral",
            "xai",
            "deepseek",
            "ollama",
        ] {
            assert!(!cat.models_for(p).is_empty(), "Missing: {}", p);
        }
    }

    #[test]
    fn cloud_models_are_paid() {
        let cat = Catalog::bundled();
        for m in cat.cloud_models() {
            assert!(m.input_price_per_1m > 0.0, "{} should not be free", m.id);
        }
    }

    #[test]
    fn context_window_lookup() {
        let cat = Catalog::bundled();
        assert_eq!(cat.context_window("claude-opus-4-6"), 200_000);
        assert_eq!(cat.context_window("gpt-5.4"), 1_050_000);
        assert_eq!(cat.context_window("gemini-3.1-pro-preview"), 1_048_576);
        assert_eq!(cat.context_window("grok-4.1"), 2_000_000);
    }

    #[test]
    fn pricing_lookup() {
        let cat = Catalog::bundled();
        let (i, o) = cat.pricing("claude-opus-4-6");
        assert!(i > 0.0 && o > 0.0);
        let (i, o) = cat.pricing("llama3.1");
        assert_eq!((i, o), (0.0, 0.0));
    }

    #[test]
    fn provider_detection() {
        let cat = Catalog::bundled();
        assert_eq!(cat.provider_for("claude-opus-4-6"), Some("anthropic"));
        assert_eq!(cat.provider_for("gpt-5.4"), Some("openai"));
        assert_eq!(cat.provider_for("gemini-3.1-pro-preview"), Some("google"));
        assert_eq!(cat.provider_for("grok-4.1"), Some("xai"));
        assert_eq!(cat.provider_for("deepseek-chat"), Some("deepseek"));
        // Prefix fallback
        assert_eq!(cat.provider_for("claude-future"), Some("anthropic"));
        assert_eq!(cat.provider_for("gemini-99"), Some("google"));
    }

    #[test]
    fn no_duplicate_ids() {
        let cat = Catalog::bundled();
        let mut ids: Vec<&str> = cat.all().iter().map(|m| m.id.as_str()).collect();
        let count = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), count, "Duplicate model IDs");
    }

    #[test]
    fn user_override_wins() {
        let mut cat = Catalog::bundled();
        let ov = UserModelOverride {
            id: "my-custom-model".into(),
            provider: "ollama".into(),
            display_name: Some("My Model".into()),
            context_window: Some(999_999),
            max_output_tokens: None,
            input_price_per_1m: None,
            output_price_per_1m: None,
            supports_tools: Some(true),
            supports_vision: None,
            supports_reasoning: None,
        };
        cat.apply_overrides(&[ov]);
        let found = cat.find("my-custom-model").unwrap();
        assert_eq!(found.context_window, 999_999);
        assert_eq!(found.provider, "ollama");
    }

    #[test]
    fn user_override_replaces_existing() {
        let mut cat = Catalog::bundled();
        let ov = UserModelOverride {
            id: "claude-opus-4-6".into(),
            provider: "anthropic".into(),
            display_name: Some("Custom Opus".into()),
            context_window: Some(500_000),
            max_output_tokens: None,
            input_price_per_1m: None,
            output_price_per_1m: None,
            supports_tools: None,
            supports_vision: None,
            supports_reasoning: None,
        };
        cat.apply_overrides(&[ov]);
        let found = cat.find("claude-opus-4-6").unwrap();
        assert_eq!(found.context_window, 500_000);
        assert_eq!(found.display_name, "Custom Opus");
    }

    #[test]
    fn cache_path_is_valid() {
        let path = cache_path();
        assert!(path.to_string_lossy().contains(".agiworkforce"));
        assert!(path.to_string_lossy().contains("models.json"));
    }
}
