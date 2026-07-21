//! Shared-first model catalog: bundled shared catalog → disk cache → remote fetch.
//!
//! Architecture (inspired by Aider + models.dev):
//!
//! Tier 1 — SHARED:   `packages/contracts/types/src/models.json`, compiled into binary.
//! Tier 2 — CACHE:    ~/.agiworkforce/cache/models.json (5-min TTL, version-aware)
//! Tier 3 — REMOTE:   models.dev/api.json (104 providers, free, open-source)
//! Tier 4 — USER:     config.toml [[models]] overrides (always win)
//!
//! To add/update models: edit `packages/ai/model-registry/catalog/models.curation.json`, run
//! `pnpm sync:models`, then the CLI picks up the generated shared
//! catalog through `include_str!`. Do not maintain a separate CLI model table.
//!
//! Last updated: 2026-06-03

#![allow(dead_code, unused_imports)]

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};

use agiworkforce_model_registry::{
    resolve_auto_route, AutoRouteDecision, AutoRoutingRequest, RoutingTaskType, TrustMode,
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL: Duration = Duration::from_secs(300); // 5 minutes
const FETCH_TIMEOUT: Duration = Duration::from_secs(5); // never block startup
const MODELS_DEV_URL: &str = "https://models.dev/api.json";
const CACHE_FILE: &str = "cache/models.json";
const SHARED_MODELS_JSON: &str = include_str!("../../../packages/contracts/types/src/models.json");
const SUPPORTED_SHARED_PROVIDERS: &[&str] = &[
    "anthropic",
    "openai",
    "google",
    "mistral",
    "xai",
    "deepseek",
    "perplexity",
    "qwen",
    "moonshot",
    "zhipu",
    "open_router",
    "nvidia_nim",
];
const FALLBACK_DEFAULT_PROVIDER: &str = "anthropic";

fn canonical_cli_provider(provider: &str) -> &str {
    match provider {
        "open_router" | "openrouter" | "open-router" => "openrouter",
        "nvidia_nim" | "nvidia-nim" | "nvidia" | "nim" => "nvidia",
        other => other,
    }
}

fn pick_fallback_default_model() -> String {
    if let Ok(model) = std::env::var("AGIWORKFORCE_DEFAULT_MODEL") {
        let model = model.trim();
        if !model.is_empty() {
            return model.to_string();
        }
    }
    if let Some(model) = raw_catalog_default_model() {
        return model;
    }
    panic!(
        "rule-models-json: packages/contracts/types/src/models.json failed to parse; \
         cannot derive a default model without hardcoded model IDs"
    )
}

fn raw_catalog_default_model() -> Option<String> {
    let root: serde_json::Value = serde_json::from_str(SHARED_MODELS_JSON).ok()?;
    let provider = root
        .get("providers")
        .and_then(|providers| providers.get(FALLBACK_DEFAULT_PROVIDER));

    for canonical in [
        provider
            .and_then(|p| p.get("taskRouting"))
            .and_then(|routing| routing.get("complex_reasoning"))
            .and_then(|value| value.as_str()),
        provider
            .and_then(|p| p.get("defaultModel"))
            .and_then(|value| value.as_str()),
    ]
    .into_iter()
    .flatten()
    {
        if let Some(model) = raw_api_model_id_for(&root, canonical) {
            return Some(model);
        }
    }

    raw_best_model_for_provider(&root, FALLBACK_DEFAULT_PROVIDER)
        .or_else(|| raw_first_supported_model(&root))
}

fn raw_api_model_id_for(root: &serde_json::Value, canonical_id: &str) -> Option<String> {
    root.get("models")
        .and_then(|models| models.get(canonical_id))
        .and_then(raw_model_id)
}

fn raw_best_model_for_provider(root: &serde_json::Value, provider: &str) -> Option<String> {
    root.get("models")
        .and_then(|models| models.as_object())
        .and_then(|models| {
            models
                .values()
                .filter(|model| raw_model_provider(model) == Some(provider))
                .filter(|model| !raw_model_deprecated(model))
                .filter(|model| {
                    model
                        .get("modelType")
                        .and_then(|value| value.as_str())
                        .is_some_and(supports_cli_model_type)
                })
                .max_by_key(|model| {
                    (
                        raw_quality_rank(model),
                        model
                            .get("contextWindow")
                            .and_then(|value| value.as_u64())
                            .unwrap_or(0),
                    )
                })
                .and_then(raw_model_id)
        })
}

fn raw_first_supported_model(root: &serde_json::Value) -> Option<String> {
    root.get("models")
        .and_then(|models| models.as_object())
        .and_then(|models| {
            models
                .values()
                .filter(|model| !raw_model_deprecated(model))
                .filter(|model| {
                    model
                        .get("modelType")
                        .and_then(|value| value.as_str())
                        .is_some_and(supports_cli_model_type)
                })
                .max_by_key(|model| {
                    (
                        raw_quality_rank(model),
                        model
                            .get("contextWindow")
                            .and_then(|value| value.as_u64())
                            .unwrap_or(0),
                    )
                })
                .and_then(raw_model_id)
        })
}

fn raw_model_id(model: &serde_json::Value) -> Option<String> {
    model
        .get("apiModelId")
        .and_then(|value| value.as_str())
        .or_else(|| model.get("id").and_then(|value| value.as_str()))
        .map(str::to_string)
}

fn raw_model_provider(model: &serde_json::Value) -> Option<&str> {
    model.get("provider").and_then(|value| value.as_str())
}

fn raw_model_deprecated(model: &serde_json::Value) -> bool {
    model
        .get("deprecated")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn raw_quality_rank(model: &serde_json::Value) -> u8 {
    match model.get("qualityTier").and_then(|value| value.as_str()) {
        Some("best") => 3,
        Some("balanced") => 2,
        Some("fast") => 1,
        _ => 0,
    }
}

/// Fallback defaults for model metadata when upstream data is missing.
const DEFAULT_CONTEXT_WINDOW: usize = 128_000;
const DEFAULT_MAX_OUTPUT: usize = 4_096;
const DEFAULT_PRICE: f64 = 0.0;

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
    #[serde(default)]
    pub cache_read_price_per_1m: f64,
    #[serde(default)]
    pub cache_write_price_per_1m: f64,
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
    #[serde(default = "default_model_status")]
    pub status: String,
    #[serde(default)]
    pub cloud_eligible: bool,
    /// OPTIONAL environment gate signal, mirroring the TS catalog's
    /// `requiresEnvironment?: 'e2b' | 'local-runtime'` field.
    ///
    /// `None` on all current models (absent from models.json).
    /// Phase B wires the real env-availability check; Phase A stubs it as always-false
    /// so any model that would carry this flag is hidden until the env is live.
    #[serde(default, rename = "requiresEnvironment")]
    pub requires_environment: Option<String>,
}

fn default_model_status() -> String {
    "active".to_string()
}

#[derive(Debug, Deserialize)]
struct SharedModelsCatalog {
    providers: HashMap<String, SharedProviderConfig>,
    models: HashMap<String, SharedModelMetadata>,
    #[serde(rename = "tierAllowedModels")]
    tier_allowed_models: SharedTierAllowedModels,
}

#[derive(Debug, Deserialize)]
struct SharedProviderConfig {
    #[serde(rename = "defaultModel")]
    default_model: Option<String>,
    #[serde(default, rename = "taskRouting")]
    task_routing: Option<SharedTaskRouting>,
    #[serde(default)]
    canonicalization: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct SharedTaskRouting {
    #[serde(default)]
    complex_reasoning: Option<String>,
    #[serde(default)]
    fast_completion: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SharedTierAllowedModels {
    economy: Vec<String>,
    pro_additions: Vec<String>,
    flagship_additions: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct SharedModelMetadata {
    id: String,
    #[serde(default, rename = "apiModelId")]
    api_model_id: Option<String>,
    name: String,
    provider: String,
    #[serde(rename = "modelType")]
    model_type: String,
    #[serde(rename = "contextWindow")]
    context_window: usize,
    #[serde(default, rename = "maxOutputTokens")]
    max_output_tokens: Option<usize>,
    #[serde(rename = "inputCost")]
    input_cost: f64,
    #[serde(rename = "outputCost")]
    output_cost: f64,
    #[serde(default, rename = "cached_input")]
    cached_input: Option<f64>,
    #[serde(
        default,
        rename = "cached_write",
        alias = "cache_write",
        alias = "cacheWrite",
        alias = "cache_creation",
        alias = "cacheCreation"
    )]
    cache_write: Option<f64>,
    capabilities: SharedModelCapabilities,
    #[serde(default)]
    released: Option<String>,
    #[serde(default)]
    deprecated: Option<bool>,
    #[serde(default)]
    status: Option<String>,
    /// "fast" | "balanced" | "best" — from models.json qualityTier field.
    #[serde(default, rename = "qualityTier")]
    quality_tier: Option<String>,
    /// Optional env gate from models.json `requiresEnvironment` field.
    /// Absent on all current models → always deserializes to None.
    #[serde(default, rename = "requiresEnvironment")]
    requires_environment: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SharedModelCapabilities {
    tools: bool,
    vision: bool,
    thinking: bool,
}

static SHARED_CATALOG: OnceLock<Option<SharedModelsCatalog>> = OnceLock::new();
static DEFAULT_MODEL_ID: OnceLock<String> = OnceLock::new();
static DEFAULT_PROVIDER_ID: OnceLock<String> = OnceLock::new();

fn shared_catalog() -> Option<&'static SharedModelsCatalog> {
    SHARED_CATALOG
        .get_or_init(|| serde_json::from_str(SHARED_MODELS_JSON).ok())
        .as_ref()
}

fn api_model_id_for(catalog: &SharedModelsCatalog, canonical_id: &str) -> Option<String> {
    catalog.models.get(canonical_id).map(|model| {
        model
            .api_model_id
            .clone()
            .unwrap_or_else(|| model.id.clone())
    })
}

fn api_model_id_for_any(catalog: &SharedModelsCatalog, model_id: &str) -> Option<String> {
    if let Some(api_id) = api_model_id_for(catalog, model_id) {
        return Some(api_id);
    }

    catalog.models.values().find_map(|model| {
        let api_id = model.api_model_id.as_deref().unwrap_or(&model.id);
        if api_id.eq_ignore_ascii_case(model_id) || model.id.eq_ignore_ascii_case(model_id) {
            Some(api_id.to_string())
        } else {
            None
        }
    })
}

/// Resolve a user- or config-supplied model identifier to the **wire id** the
/// provider API expects (`apiModelId`). The shared `models.json` catalog carries
/// both the dotted display `id` (`claude-haiku-4.5`, used on web/desktop/mobile)
/// and the dashed `apiModelId` (`claude-haiku-4-5`, the actual wire id). Callers
/// that put a model into a provider request body must resolve through this so a
/// dotted display id does not 404 the provider.
///
/// Falls back to the input unchanged when the id is not in the shared catalog
/// (local/Ollama/custom models, or already-wire ids), so it is safe to apply at
/// the request boundary for every provider. Display, pricing, and provider
/// inference intentionally keep the dotted catalog `id` and must NOT call this.
pub fn api_wire_id(model_id: &str) -> String {
    shared_catalog()
        .and_then(|catalog| api_model_id_for_any(catalog, model_id))
        .unwrap_or_else(|| model_id.to_string())
}

fn shared_catalog_lookup_aliases() -> Vec<(String, String)> {
    let Some(catalog) = shared_catalog() else {
        return Vec::new();
    };

    let mut aliases = Vec::new();

    for model in catalog.models.values() {
        if let Some(api_id) = model.api_model_id.as_deref() {
            aliases.push((model.id.clone(), api_id.to_string()));
            aliases.push((api_id.to_string(), api_id.to_string()));
        } else {
            aliases.push((model.id.clone(), model.id.clone()));
        }
    }

    for provider in catalog.providers.values() {
        for (alias, target) in &provider.canonicalization {
            if let Some(api_id) = api_model_id_for_any(catalog, target) {
                aliases.push((alias.clone(), api_id));
            }
        }
    }

    aliases
}

fn cache_read_price(provider: &str, input_price_per_1m: f64, explicit: Option<f64>) -> f64 {
    if let Some(price) = explicit {
        return price;
    }
    if matches!(provider, "anthropic" | "openai") && input_price_per_1m > DEFAULT_PRICE {
        return input_price_per_1m * 0.1;
    }
    DEFAULT_PRICE
}

fn cache_write_price(provider: &str, input_price_per_1m: f64, explicit: Option<f64>) -> f64 {
    if let Some(price) = explicit {
        return price;
    }
    if input_price_per_1m <= DEFAULT_PRICE {
        return DEFAULT_PRICE;
    }
    if provider == "anthropic" {
        return input_price_per_1m * 1.25;
    }
    input_price_per_1m
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliAutoModelSelection {
    pub model_key: String,
    pub provider_model_id: String,
    pub upstream_provider: String,
    pub harness_id: String,
    pub fallback_provider_model_ids: Vec<String>,
}

/// Resolve a CLI Auto profile through the same generated policy used by the
/// TypeScript surfaces and Desktop. The caller still owns the transport
/// boundary: Managed Cloud uses the AGI gateway, while BYOK uses the selected
/// provider directly.
pub fn resolve_auto_model(
    selection: &str,
    task_type: RoutingTaskType,
    tier: &str,
    trust_mode: TrustMode,
) -> Result<CliAutoModelSelection, String> {
    resolve_auto_model_with_context(selection, task_type, tier, trust_mode, None, None)
}

/// Resolve Auto for a subsequent developer-session turn while preserving the
/// previous concrete model when the central cache-continuity policy permits
/// it and re-evaluating when the task genuinely changes.
pub fn resolve_auto_model_with_context(
    selection: &str,
    task_type: RoutingTaskType,
    tier: &str,
    trust_mode: TrustMode,
    current_model_key: Option<&str>,
    previous_task_type: Option<RoutingTaskType>,
) -> Result<CliAutoModelSelection, String> {
    let runtime_profile_id = match trust_mode {
        TrustMode::ManagedCloud => "cli/managed-chat",
        TrustMode::Byok => "cli/byok-chat",
        TrustMode::Local | TrustMode::OnDevice => "cli/local-chat",
    };
    let request = AutoRoutingRequest {
        selection: Some(selection),
        task_type,
        subscription_tier: Some(tier),
        trust_mode,
        current_model_key,
        previous_task_type,
        runtime_profile_id: Some(runtime_profile_id),
        ..AutoRoutingRequest::default()
    };

    match resolve_auto_route(&request).map_err(|error| error.to_string())? {
        AutoRouteDecision::Selected(selected) => Ok(CliAutoModelSelection {
            model_key: selected.model_key,
            provider_model_id: selected.provider_model_id,
            upstream_provider: selected.provider,
            harness_id: selected.harness_id,
            fallback_provider_model_ids: selected
                .fallbacks
                .into_iter()
                .map(|fallback| fallback.provider_model_id)
                .collect(),
        }),
        AutoRouteDecision::Unavailable(unavailable) => Err(format!(
            "Auto routing is unavailable ({:?}): {}",
            unavailable.code,
            unavailable.reasons.join("; ")
        )),
    }
}

pub fn default_model() -> &'static str {
    DEFAULT_MODEL_ID
        .get_or_init(|| {
            let Some(catalog) = shared_catalog() else {
                return pick_fallback_default_model();
            };
            catalog
                .providers
                .get("anthropic")
                .and_then(|provider| {
                    provider
                        .task_routing
                        .as_ref()
                        .and_then(|routing| routing.complex_reasoning.as_deref())
                        .and_then(|canonical_id| api_model_id_for(catalog, canonical_id))
                        .or_else(|| {
                            provider
                                .default_model
                                .as_deref()
                                .and_then(|canonical_id| api_model_id_for(catalog, canonical_id))
                        })
                })
                .unwrap_or_else(pick_fallback_default_model)
        })
        .as_str()
}

pub fn default_provider() -> &'static str {
    DEFAULT_PROVIDER_ID
        .get_or_init(|| {
            provider_for(default_model())
                .unwrap_or(FALLBACK_DEFAULT_PROVIDER)
                .to_string()
        })
        .as_str()
}

/// Return the API model ID for the `fast_completion` task slot of the named
/// provider, as declared in `models.json`'s `providers.<name>.taskRouting.fast_completion`.
///
/// Resolution order:
///   1. `taskRouting.fast_completion` canonical id → resolve to `apiModelId` if present.
///   2. Provider `defaultModel` → resolve to `apiModelId`.
///   3. Fail loudly if models.json is unavailable; callers must not hardcode
///      model IDs as a fallback.
///
/// Do NOT hardcode model ID strings in callers — call this function instead.
pub fn fast_completion_model(provider: &str) -> String {
    let Some(catalog) = shared_catalog() else {
        return pick_fallback_default_model();
    };
    catalog
        .providers
        .get(provider)
        .and_then(|pc| {
            pc.task_routing
                .as_ref()
                .and_then(|tr| tr.fast_completion.as_deref())
                .and_then(|canonical| api_model_id_for(catalog, canonical))
                .or_else(|| {
                    pc.default_model
                        .as_deref()
                        .and_then(|canonical| api_model_id_for(catalog, canonical))
                })
        })
        .unwrap_or_else(pick_fallback_default_model)
}

/// Return the API model ID for the economy tier's first allowed model, as read
/// from `models.json`'s `tierAllowedModels.economy` list.
///
/// This is the tier-appropriate default when the user has no explicit `--model`
/// flag and their tier is free/hobby.  It is NOT the workhorse routing slot
/// (that lives in `packages/contracts/types/src/model-catalog.ts` SLOT_REGISTRY) — it is
/// simply the first entry of the economy bucket so CLI users get a cheap,
/// capable model by default without touching the TS type catalog.
///
/// Fails loudly if the shared catalog is unavailable; hardcoded model fallbacks
/// would drift from the source of truth.
pub fn economy_default_model() -> &'static str {
    static ECONOMY_MODEL_ID: OnceLock<String> = OnceLock::new();
    ECONOMY_MODEL_ID
        .get_or_init(|| {
            let Some(catalog) = shared_catalog() else {
                return pick_fallback_default_model();
            };
            let first = catalog.tier_allowed_models.economy.first().cloned();
            // Resolve the canonical id to an apiModelId if one is specified.
            first
                .as_deref()
                .and_then(|canonical_id| api_model_id_for(catalog, canonical_id))
                .or(first)
                .unwrap_or_else(pick_fallback_default_model)
        })
        .as_str()
}

/// Return the list of model IDs allowed for the given named tier slot.
///
/// Slot names: `"economy"`, `"pro_additions"`, `"flagship_additions"`.
/// Returns an empty slice for unknown slot names — callers treat that as
/// "allow all" so existing behavior is preserved.
pub fn tier_allowed_models(tier_slot: &str) -> Vec<String> {
    let Some(catalog) = shared_catalog() else {
        return Vec::new();
    };
    match tier_slot {
        "economy" => catalog.tier_allowed_models.economy.clone(),
        "pro_additions" => catalog.tier_allowed_models.pro_additions.clone(),
        "flagship_additions" => catalog.tier_allowed_models.flagship_additions.clone(),
        _ => Vec::new(),
    }
}

/// True when `tier` can actually route the managed-cloud model `model_id`.
///
/// Rust mirror of `canAccessModelForSubscriptionTier`
/// (`packages/contracts/types/src/model-catalog.ts`), reading the same
/// `tierAllowedModels` slots from the same `models.json`, so the CLI and the
/// TypeScript surfaces cannot drift on who may reach which model:
///
/// - Free / BYOK → no managed-cloud model (BYOK reaches providers with the
///   user's own key, which is the picker's separate BYOK section, not this one)
/// - Pro         → `economy` + `pro_additions`
/// - Max / Enterprise → all three slots
///
/// Applies to the picker's **Cloud** section only. Local and BYOK models are
/// user-provided access and are never gated by subscription tier.
pub fn can_access_model_for_tier(model_id: &str, tier: &crate::tier_cache::UserTier) -> bool {
    use crate::tier_cache::UserTier;

    // Free and BYOK carry no managed-cloud entitlement.
    if matches!(tier, UserTier::Free | UserTier::Byok) {
        return false;
    }

    let in_slot = |slot: &str| tier_allowed_models(slot).iter().any(|id| id == model_id);

    if in_slot("flagship_additions") {
        return matches!(tier, UserTier::Max | UserTier::Enterprise);
    }
    if in_slot("pro_additions") {
        return matches!(tier, UserTier::Pro | UserTier::Max | UserTier::Enterprise);
    }
    in_slot("economy")
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 1 — BUNDLED DEFAULTS (compiled into binary, works offline)
// ─────────────────────────────────────────────────────────────────────────────
// The embedded shared JSON catalog is the only source of model IDs. Do not add
// Rust-side model ID fallbacks.

fn bundled_models() -> Vec<Model> {
    if let Some(shared_models) = shared_bundled_models() {
        return shared_models;
    }
    panic!(
        "rule-models-json: packages/contracts/types/src/models.json failed to parse; \
         cannot build model catalog without hardcoded model IDs"
    )
}

fn shared_bundled_models() -> Option<Vec<Model>> {
    let catalog = shared_catalog()?;
    let cloud_eligible_ids = HashSet::<String>::from_iter(
        catalog
            .tier_allowed_models
            .economy
            .iter()
            .chain(catalog.tier_allowed_models.pro_additions.iter())
            .chain(catalog.tier_allowed_models.flagship_additions.iter())
            .cloned(),
    );

    let mut models: Vec<Model> = catalog
        .models
        .values()
        .filter(|model| SUPPORTED_SHARED_PROVIDERS.contains(&model.provider.as_str()))
        .filter(|model| supports_cli_model_type(&model.model_type))
        .filter(|model| !model.deprecated.unwrap_or(false))
        .map(|model| {
            let api_id = model
                .api_model_id
                .clone()
                .unwrap_or_else(|| model.id.clone());
            Model {
                id: api_id.clone(),
                provider: canonical_cli_provider(&model.provider).to_string(),
                display_name: model.name.clone(),
                context_window: model.context_window,
                max_output_tokens: model.max_output_tokens.unwrap_or(DEFAULT_MAX_OUTPUT),
                input_price_per_1m: model.input_cost,
                output_price_per_1m: model.output_cost,
                cache_read_price_per_1m: cache_read_price(
                    &model.provider,
                    model.input_cost,
                    model.cached_input,
                ),
                cache_write_price_per_1m: cache_write_price(
                    &model.provider,
                    model.input_cost,
                    model.cache_write,
                ),
                supports_tools: model.capabilities.tools,
                supports_vision: model.capabilities.vision,
                supports_reasoning: model.capabilities.thinking,
                supports_audio_input: false,
                supports_audio_output: false,
                supports_pdf: false,
                release_date: normalize_release_date(model.released.as_deref()),
                status: model.status.clone().unwrap_or_else(|| "active".to_string()),
                cloud_eligible: cloud_eligible_ids.contains(&model.id)
                    || cloud_eligible_ids.contains(&api_id),
                requires_environment: model.requires_environment.clone(),
            }
        })
        .collect();

    models.sort_by(|left, right| {
        left.provider
            .cmp(&right.provider)
            .then(left.display_name.cmp(&right.display_name))
    });

    let mut seen = HashSet::new();
    models.retain(|model| seen.insert(model.id.clone()));
    Some(models)
}

fn supports_cli_model_type(model_type: &str) -> bool {
    matches!(
        model_type,
        "chat" | "code" | "reasoning" | "multimodal" | "search"
    )
}

fn normalize_release_date(released: Option<&str>) -> String {
    let Some(released) = released.map(str::trim).filter(|value| !value.is_empty()) else {
        return String::new();
    };
    if released.len() >= 7
        && released.chars().take(4).all(|c| c.is_ascii_digit())
        && released.as_bytes().get(4) == Some(&b'-')
    {
        return released[..7].to_string();
    }
    if released.len() == 4 && released.chars().all(|c| c.is_ascii_digit()) {
        return format!("{released}-01");
    }
    // Accepts both "April 2026" and "October 15, 2025" — the year is always
    // the last whitespace token in the catalog's human-readable forms.
    let mut parts = released.split_whitespace();
    let month = parts.next().unwrap_or_default();
    let year = parts.last().unwrap_or_default();
    let month_number = match month.to_ascii_lowercase().as_str() {
        "january" => Some("01"),
        "february" => Some("02"),
        "march" => Some("03"),
        "april" => Some("04"),
        "may" => Some("05"),
        "june" => Some("06"),
        "july" => Some("07"),
        "august" => Some("08"),
        "september" => Some("09"),
        "october" => Some("10"),
        "november" => Some("11"),
        "december" => Some("12"),
        _ => None,
    };
    match (
        month_number,
        year.len() == 4 && year.chars().all(|c| c.is_ascii_digit()),
    ) {
        (Some(month), true) => format!("{year}-{month}"),
        _ => released.to_string(),
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

    Some(
        envelope
            .models
            .into_iter()
            .map(|mut model| {
                model.provider = canonical_cli_provider(&model.provider).to_string();
                model
            })
            .collect(),
    )
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
            } else {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
                }
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
    #[serde(
        default,
        alias = "cache_read",
        alias = "cacheRead",
        alias = "cached_input",
        alias = "cachedInput"
    )]
    cached_input: Option<f64>,
    #[serde(
        default,
        alias = "cache_write",
        alias = "cacheWrite",
        alias = "cached_write",
        alias = "cachedWrite",
        alias = "cache_creation",
        alias = "cacheCreation"
    )]
    cache_write: Option<f64>,
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
        ("perplexity", "perplexity"),
        ("qwen", "qwen"),
        ("moonshot", "moonshot"),
        ("zhipu", "zhipu"),
        ("open_router", "openrouter"),
        ("openrouter", "openrouter"),
        ("nvidia_nim", "nvidia"),
        ("nvidia", "nvidia"),
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
                let ctx = md
                    .limit
                    .as_ref()
                    .and_then(|l| l.context)
                    .unwrap_or(DEFAULT_CONTEXT_WINDOW);
                let out = md
                    .limit
                    .as_ref()
                    .and_then(|l| l.output)
                    .unwrap_or(DEFAULT_MAX_OUTPUT);
                let price_in = md
                    .cost
                    .as_ref()
                    .and_then(|c| c.input)
                    .unwrap_or(DEFAULT_PRICE);
                let price_out = md
                    .cost
                    .as_ref()
                    .and_then(|c| c.output)
                    .unwrap_or(DEFAULT_PRICE);
                let cache_read_price = cache_read_price(
                    our_provider,
                    price_in,
                    md.cost.as_ref().and_then(|c| c.cached_input),
                );
                let cache_write_price = cache_write_price(
                    our_provider,
                    price_in,
                    md.cost.as_ref().and_then(|c| c.cache_write),
                );

                models.push(Model {
                    id: model_id.clone(),
                    provider: canonical_cli_provider(our_provider).to_string(),
                    display_name: md.name.unwrap_or_else(|| model_id.clone()),
                    context_window: ctx,
                    max_output_tokens: out,
                    input_price_per_1m: price_in,
                    output_price_per_1m: price_out,
                    cache_read_price_per_1m: cache_read_price,
                    cache_write_price_per_1m: cache_write_price,
                    supports_tools: md.tool_call.unwrap_or(false),
                    supports_vision: md.attachment.unwrap_or(false),
                    supports_reasoning: md.reasoning.unwrap_or(false),
                    supports_audio_input: false,
                    supports_audio_output: false,
                    supports_pdf: false,
                    release_date: md.release_date.unwrap_or_default(),
                    status: "active".into(),
                    cloud_eligible: false, // only bundled models are cloud-eligible
                    requires_environment: None, // models.dev has no env-gate concept
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
    pub cache_read_price_per_1m: Option<f64>,
    #[serde(default)]
    pub cache_write_price_per_1m: Option<f64>,
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
            context_window: self.context_window.unwrap_or(DEFAULT_CONTEXT_WINDOW),
            max_output_tokens: self.max_output_tokens.unwrap_or(DEFAULT_MAX_OUTPUT),
            input_price_per_1m: self.input_price_per_1m.unwrap_or(DEFAULT_PRICE),
            output_price_per_1m: self.output_price_per_1m.unwrap_or(DEFAULT_PRICE),
            cache_read_price_per_1m: self.cache_read_price_per_1m.unwrap_or(DEFAULT_PRICE),
            cache_write_price_per_1m: self.cache_write_price_per_1m.unwrap_or(DEFAULT_PRICE),
            supports_tools: self.supports_tools.unwrap_or(true),
            supports_vision: self.supports_vision.unwrap_or(false),
            supports_reasoning: self.supports_reasoning.unwrap_or(false),
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: false,
            release_date: String::new(),
            status: "active".into(),
            cloud_eligible: false,
            requires_environment: None, // user overrides cannot declare env gates
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
    ///
    /// Also checks `models_cache` (1h TTL) as an additional cache tier before
    /// fetching from the network.
    pub fn load_with_refresh() -> Self {
        let catalog = Self::load();

        // Spawn non-blocking background refresh
        tokio::spawn(async {
            // Check models_cache (separate from the model_catalog cache) — if
            // it has recent data, skip the network fetch entirely.
            let home = crate::config::CliConfig::config_dir().ok();
            if let Some(ref h) = home {
                if crate::models_cache::ModelsCache::load(h).is_some() {
                    // models_cache is fresh (within its own TTL) — skip remote fetch
                    return;
                }
            }

            if let Some(remote_models) = fetch_remote().await {
                // Merge: bundled models take priority, remote fills gaps
                let mut merged = bundled_models();
                let bundled_ids: Vec<String> = merged.iter().map(|m| m.id.clone()).collect();
                for rm in &remote_models {
                    if !bundled_ids.contains(&rm.id) {
                        merged.push(rm.clone());
                    }
                }
                write_cache(&merged);

                // Also update models_cache with the raw JSON for cross-module use
                if let Some(ref h) = home {
                    let json_val = serde_json::to_value(&remote_models).unwrap_or_default();
                    if let Err(e) = crate::models_cache::ModelsCache::save(h, &json_val) {
                        eprintln!("[model_catalog] failed to update models_cache: {}", e);
                    }
                }
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
        for (alias, target) in shared_catalog_lookup_aliases() {
            if let Some(&idx) = index.get(&target.to_lowercase()) {
                index.insert(alias.to_lowercase(), idx);
            }
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
        DEFAULT_CONTEXT_WINDOW
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
pub fn provider_for(model_id: &str) -> Option<&'static str> {
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

/// Return the qualityTier string for a model as declared in models.json.
///
/// Returns `None` for models not in the bundled shared catalog (e.g. Ollama local
/// models or user-defined BYO models).  The returned string is one of:
///   "fast" | "balanced" | "best" | "economy"
///
/// Callers that want a CapabilityTier enum should use `design_system::capability_for_model`
/// which delegates to this function.
pub fn quality_tier_for_model(model_id: &str) -> Option<String> {
    let Some(catalog) = shared_catalog() else {
        return None;
    };
    // The shared catalog is keyed by canonical ID (e.g. "claude-opus-4.8"),
    // but model_id may be an apiModelId (e.g. "claude-opus-4-8").  Try both.
    let canonical = catalog
        .models
        .iter()
        .find(|(_, meta)| {
            let api_id = meta.api_model_id.as_deref().unwrap_or(&meta.id);
            api_id.eq_ignore_ascii_case(model_id) || meta.id.eq_ignore_ascii_case(model_id)
        })
        .map(|(k, _)| k.as_str())
        .unwrap_or(model_id);
    catalog
        .models
        .get(canonical)
        .and_then(|m| m.quality_tier.clone())
}

/// Return the three canonical Anthropic primary models for the v3 model picker,
/// in display order: Opus (flagship) → Sonnet (balanced) → Haiku (fast).
///
/// Each entry is `(api_model_id, display_name, quality_tier)`.
///
/// Resolution: reads `taskRouting.complex_reasoning`, the default model, and
/// `taskRouting.fast_completion` from the shared catalog's anthropic provider
/// block. Returns no entries if models.json is unavailable.
pub fn anthropic_primary_models() -> Vec<(String, String, String)> {
    let Some(catalog) = shared_catalog() else {
        return Vec::new();
    };

    let anthropic = match catalog.providers.get("anthropic") {
        Some(p) => p,
        None => return Vec::new(),
    };

    let routing = anthropic.task_routing.as_ref();

    // Collect the three canonical slot IDs (canonical key → apiModelId).
    let slots: Vec<Option<String>> = vec![
        // complex_reasoning → flagship (Opus)
        routing
            .and_then(|r| r.complex_reasoning.as_deref())
            .and_then(|canonical| api_model_id_for(catalog, canonical)),
        // default model → balanced (Sonnet)
        anthropic
            .default_model
            .as_deref()
            .and_then(|canonical| api_model_id_for(catalog, canonical)),
        // fast_completion → fast (Haiku)
        routing
            .and_then(|r| r.fast_completion.as_deref())
            .and_then(|canonical| api_model_id_for(catalog, canonical)),
    ];

    let mut seen = std::collections::HashSet::new();
    slots
        .into_iter()
        .flatten()
        .filter(|id| seen.insert(id.clone()))
        .map(|api_id| {
            // Resolve display name and quality tier from catalog.
            let (name, tier) = catalog
                .models
                .values()
                .find(|m| m.api_model_id.as_deref().unwrap_or(&m.id) == api_id || m.id == api_id)
                .map(|m| {
                    (
                        m.name.clone(),
                        m.quality_tier
                            .clone()
                            .unwrap_or_else(|| "balanced".to_string()),
                    )
                })
                .unwrap_or_else(|| (api_id.clone(), "balanced".to_string()));
            (api_id, name, tier)
        })
        .collect()
}

/// Return true if a model ID is known to the bundled shared catalog.
///
/// "Known" means the catalog has an entry whose `id` or `apiModelId` matches
/// (case-insensitive).  Ollama local models, user-defined BYO models, and any
/// model ID not yet added to models.json will return `false`.
pub fn is_known_model(model_id: &str) -> bool {
    let Some(catalog) = shared_catalog() else {
        // Can't verify without the catalog — treat as unknown.
        return false;
    };
    let resolved = api_model_id_for_any(catalog, model_id);
    catalog.models.values().any(|meta| {
        let api_id = meta.api_model_id.as_deref().unwrap_or(&meta.id);
        api_id.eq_ignore_ascii_case(model_id)
            || meta.id.eq_ignore_ascii_case(model_id)
            || resolved.as_deref().is_some_and(|id| {
                api_id.eq_ignore_ascii_case(id) || meta.id.eq_ignore_ascii_case(id)
            })
    })
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
        assert!(cat.find(default_model()).is_some());
    }

    #[test]
    fn cli_auto_selection_uses_the_canonical_registry_policy() {
        let selected = resolve_auto_model(
            "auto-premium",
            agiworkforce_model_registry::RoutingTaskType::Coding,
            "byok",
            agiworkforce_model_registry::TrustMode::Byok,
        )
        .expect("BYOK coding route should be available");

        assert_eq!(selected.model_key, "claude-opus-4.8");
        assert_eq!(selected.provider_model_id, "claude-opus-4-8");
        assert_eq!(selected.upstream_provider, "anthropic");
        assert!(!selected.provider_model_id.starts_with("auto"));
    }

    #[test]
    fn api_wire_id_resolves_dotted_display_id_to_wire_id() {
        // A dotted display id (the form web/desktop/mobile use) must resolve to
        // the dashed provider wire id so it does not 404 at the provider.
        assert_eq!(api_wire_id("claude-haiku-4.5"), "claude-haiku-4-5");
        // An already-wire id is returned unchanged (idempotent).
        assert_eq!(api_wire_id("claude-haiku-4-5"), "claude-haiku-4-5");
        // Case-insensitive on the display id.
        assert_eq!(api_wire_id("Claude-Haiku-4.5"), "claude-haiku-4-5");
        // Unknown ids (local/Ollama/custom) fall through unchanged.
        assert_eq!(
            api_wire_id("my-local-model:latest"),
            "my-local-model:latest"
        );
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
            "perplexity",
            "qwen",
            "zhipu",
            "openrouter",
            "nvidia",
            "moonshot",
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
        // context_window() resolves every catalog model by the id the catalog
        // actually uses (its apiModelId) and returns that model's declared
        // window — no hardcoded ids, so it never goes stale and it catches
        // id-form regressions across the whole catalog.
        for m in cat.cloud_models() {
            assert!(
                m.context_window > 0,
                "{} should declare a positive context window",
                m.id
            );
            assert_eq!(
                cat.context_window(&m.id),
                m.context_window,
                "{} window lookup",
                m.id
            );
        }
        assert_eq!(
            cat.context_window("claude-does-not-exist"),
            DEFAULT_CONTEXT_WINDOW
        );
    }

    #[test]
    fn pricing_lookup() {
        let cat = Catalog::bundled();
        // pricing() resolves every cloud model by its own id (catches id-form
        // regressions) and returns its declared prices; cloud models are paid.
        for m in cat.cloud_models() {
            assert_eq!(
                cat.pricing(&m.id),
                (m.input_price_per_1m, m.output_price_per_1m),
                "{} pricing lookup",
                m.id
            );
            assert!(
                m.input_price_per_1m > 0.0,
                "{} should not be free (input)",
                m.id
            );
        }
        // Unknown model → no pricing.
        assert_eq!(cat.pricing("totally-unknown-model"), (0.0, 0.0));
    }

    #[test]
    fn provider_detection() {
        let cat = Catalog::bundled();
        for provider in [
            "anthropic",
            "openai",
            "google",
            "xai",
            "deepseek",
            "qwen",
            "nvidia",
            "openrouter",
        ] {
            let model = cat
                .models_for(provider)
                .into_iter()
                .next()
                .unwrap_or_else(|| panic!("expected {provider} model in bundled catalog"));
            assert_eq!(cat.provider_for(&model.id), Some(provider), "{}", model.id);
        }
        assert_eq!(cat.provider_for("claude-future"), None);
        assert_eq!(cat.provider_for("gemini-99"), None);
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
            cache_read_price_per_1m: None,
            cache_write_price_per_1m: None,
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
            id: "claude-opus-4-8".into(),
            provider: "anthropic".into(),
            display_name: Some("Custom Opus".into()),
            context_window: Some(500_000),
            max_output_tokens: None,
            input_price_per_1m: None,
            output_price_per_1m: None,
            cache_read_price_per_1m: None,
            cache_write_price_per_1m: None,
            supports_tools: None,
            supports_vision: None,
            supports_reasoning: None,
        };
        cat.apply_overrides(&[ov]);
        let found = cat.find("claude-opus-4-8").unwrap();
        assert_eq!(found.context_window, 500_000);
        assert_eq!(found.display_name, "Custom Opus");
    }

    #[test]
    fn cache_path_is_valid() {
        let path = cache_path();
        assert!(path.to_string_lossy().contains(".agiworkforce"));
        assert!(path.to_string_lossy().contains("models.json"));
    }

    /// rule-models-json: fast_completion_model must resolve to a model that exists
    /// in the bundled catalog for both anthropic and openai providers.
    #[test]
    fn fast_completion_model_exists_in_catalog() {
        let cat = Catalog::bundled();
        for provider in ["anthropic", "openai", "google"] {
            let model_id = fast_completion_model(provider);
            assert!(
                cat.find(&model_id).is_some(),
                "fast_completion_model({provider}) returned \"{model_id}\" \
                 which is not in the bundled catalog — add it to bundled_models() \
                 or fix the models.json taskRouting entry"
            );
        }
    }

    /// rule-models-json: the fast_completion_model for openai must be an openai model.
    #[test]
    fn fast_completion_model_correct_provider() {
        let cat = Catalog::bundled();
        let openai_fast = fast_completion_model("openai");
        let m = cat.find(&openai_fast).unwrap_or_else(|| {
            panic!("fast_completion_model(openai) = {openai_fast} not in catalog")
        });
        assert_eq!(
            m.provider, "openai",
            "fast_completion_model(openai) should be an openai model, got provider={}",
            m.provider
        );

        let anthropic_fast = fast_completion_model("anthropic");
        let m = cat.find(&anthropic_fast).unwrap_or_else(|| {
            panic!("fast_completion_model(anthropic) = {anthropic_fast} not in catalog")
        });
        assert_eq!(
            m.provider, "anthropic",
            "fast_completion_model(anthropic) should be an anthropic model, got provider={}",
            m.provider
        );
    }

    /// rule-models-json: no Rust source file in apps/cli/src/ (outside model_catalog.rs
    /// and models.rs) may contain a hardcoded model ID literal matching the patterns
    /// gpt-5\.\d, claude-(opus|sonnet|haiku)-\d, gemini-\d, or grok-\d.
    ///
    /// This test scans the live tui implementation files at compile time using include_str!
    /// and asserts the known forbidden literals are absent.
    #[test]
    fn no_hardcoded_model_ids_in_tui() {
        // tui_app.rs is the live ratatui implementation (~3K LOC). cost_hud.rs
        // renders token/cost metrics. Both were identified as likely violation sites
        // after the orphan tree removal in e3a316d39.
        // Note: tui_app.rs contains a #[cfg(test)] fixture using "claude-sonnet-5"
        // which is intentional and not in the forbidden list below.
        let tui_app_src = include_str!("tui/tui_app.rs");
        let cost_hud_src = include_str!("tui/cost_hud.rs");

        // Patterns that would indicate a hardcoded model literal (not inside a comment).
        let forbidden: &[&str] = &[
            "\"gpt-5.5\"",
            "\"gpt-5.5\"",
            "\"claude-opus-4-6-mini\"",
            "\"claude-haiku-4-5\"", // must come from catalog, not hardcoded
            "\"gpt-5.4-mini\"",     // must come from catalog, not hardcoded
        ];

        for literal in forbidden {
            for (file, src) in [("tui_app.rs", tui_app_src), ("cost_hud.rs", cost_hud_src)] {
                assert!(
                    !src.contains(literal),
                    "{file} contains hardcoded model literal {literal} — \
                     use model_catalog::fast_completion_model() or model_catalog::find() instead"
                );
            }
        }
    }

    // ── New tests for the 4 hardcoded-model-id violation fixes ──────────────

    /// Site 2 fix: quality_tier_for_model() resolves to meaningful tiers for
    /// known models, driving capability_for_model() without hardcoded literals.
    #[test]
    fn quality_tier_for_known_models() {
        // Anthropic: opus → best, sonnet → balanced, haiku → fast
        assert_eq!(
            quality_tier_for_model("claude-opus-4-8").as_deref(),
            Some("best"),
            "claude-opus-4-8 should be qualityTier=best"
        );
        assert_eq!(
            quality_tier_for_model("claude-sonnet-5").as_deref(),
            Some("balanced"),
            "claude-sonnet-5 should be qualityTier=balanced"
        );
        // OpenAI: gpt-5.6-sol → best (per models.json)
        assert_eq!(
            quality_tier_for_model("gpt-5.6-sol").as_deref(),
            Some("best"),
            "gpt-5.6-sol should be qualityTier=best"
        );
        // xAI: grok-4.5 → best
        assert_eq!(
            quality_tier_for_model("grok-4.5").as_deref(),
            Some("best"),
            "grok-4.5 should be qualityTier=best"
        );
    }

    /// Site 2 fix: quality_tier_for_model() returns None for models not in the
    /// shared catalog (e.g. local Ollama models, user BYO endpoints).
    #[test]
    fn quality_tier_for_unknown_model_is_none() {
        assert!(
            quality_tier_for_model("llama3.1").is_none(),
            "llama3.1 is an Ollama local model not in the shared catalog — \
             quality_tier_for_model should return None"
        );
        assert!(
            quality_tier_for_model("my-custom-byo-endpoint").is_none(),
            "user BYO model ID should return None from quality_tier_for_model"
        );
    }

    /// Site 3 fix: is_known_model() returns true for well-known IDs and false
    /// for deprecated / unknown IDs — the new warn_for_model logic in chatwidget.
    #[test]
    fn is_known_model_reflects_catalog() {
        // Active models present in models.json must be known.
        assert!(
            is_known_model("claude-opus-4-8"),
            "claude-opus-4-8 should be in the bundled catalog"
        );
        assert!(
            is_known_model("gpt-5.6-sol"),
            "gpt-5.6-sol should be in the bundled catalog"
        );
        assert!(
            is_known_model("gemini-3.1-pro-preview"),
            "gemini-3.1-pro-preview should be in the bundled catalog"
        );
        // Models that are NOT in models.json must be unknown.
        assert!(
            !is_known_model("gpt-5.2"),
            "gpt-5.2 is not in models.json — is_known_model should return false"
        );
        assert!(
            !is_known_model("claude-opus-4-6-mini"),
            "claude-opus-4-6-mini is a ghost model — is_known_model should return false"
        );
    }

    /// Site 4 fix: pick_fallback_default_model() returns a non-empty model ID
    /// derived from the embedded catalog or explicit env, not a hardcoded literal.
    #[test]
    fn fallback_default_model_is_derivable() {
        let fallback = pick_fallback_default_model();
        assert!(
            !fallback.is_empty(),
            "pick_fallback_default_model() must not return an empty string"
        );
        assert!(
            is_known_model(&fallback),
            "pick_fallback_default_model() = \"{fallback}\" is not in the shared catalog"
        );
    }

    /// Site 1 fix: no_hardcoded_model_ids_in_onboarding verifies that onboarding.rs
    /// no longer contains the 8 formerly-hardcoded model literals.
    #[test]
    fn no_hardcoded_model_ids_in_onboarding() {
        let onboarding_src = include_str!("onboarding.rs");
        // These are the IDs that were hardcoded in ONBOARDING_MODEL_SPECS before the fix.
        let formerly_hardcoded: &[&str] = &[
            "\"claude-opus-4-6\"",
            "\"claude-sonnet-4-6\"",
            "\"claude-haiku-4-5-20251001\"",
            "\"gpt-5.5\"",
            "\"gpt-5.4-mini\"",
            "\"gpt-5.5-pro\"",
            "\"gemini-3.1-pro-preview\"",
            "\"gemini-3.1-flash-lite\"",
        ];
        for literal in formerly_hardcoded {
            assert!(
                !onboarding_src.contains(literal),
                "onboarding.rs still contains hardcoded model literal {literal} — \
                 ONBOARDING_MODEL_SPECS should be derived from the catalog"
            );
        }
    }

    /// Site 2 fix: design_system.rs capability_for_model must not contain
    /// the former 30-arm hardcoded match.  We verify by checking that model IDs
    /// which were exclusively match arms (never used in tests) are absent from
    /// the non-test portion of the file.
    ///
    /// Note: model IDs that appear in *test fixtures* in design_system.rs are
    /// legitimately there and are not checked here.  Only production-code-only
    /// literals are asserted absent.
    #[test]
    fn no_hardcoded_model_ids_in_design_system() {
        let ds_src = include_str!("design_system.rs");
        // Split at the #[cfg(test)] boundary to avoid scanning test fixtures.
        let production_src = ds_src.split("#[cfg(test)]").next().unwrap_or(ds_src);
        // IDs that were only ever in the match arms, not in tests.
        let formerly_hardcoded: &[&str] = &[
            "\"grok-4.3\"",
            "\"deepseek-chat\"",
            "\"kimi-k2.5\"",
            "\"glm-5.2\"",
            "\"sonar-reasoning-pro\"",
            "\"qwen-max\"",
        ];
        for literal in formerly_hardcoded {
            assert!(
                !production_src.contains(literal),
                "design_system.rs production code still contains hardcoded model literal {literal} — \
                 capability_for_model() should use quality_tier_for_model() from the catalog"
            );
        }
    }
}
