//! Mirror of `packages/contracts/types/src/design-system/`.
//!
//! This file is a manual Rust mirror of the TypeScript design-system contracts.
//! The TypeScript side is the single source of truth, update both when the TS
//! contract changes.  Surfaces: provider-display.ts, effort.ts.

// ---------------------------------------------------------------------------
// ProviderId, mirrors ProviderId union in provider-display.ts
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProviderId {
    Anthropic,
    OpenAI,
    Google,
    XAI,
    DeepSeek,
    Perplexity,
    Qwen,
    Moonshot,
    Zhipu,
    OpenRouter,
    Ollama,
    LMStudio,
    CustomOpenAICompatible,
    AGICloud,
}

impl ProviderId {
    /// All provider IDs in the canonical display order (matches PROVIDER_DISPLAY key order).
    pub const ALL: &'static [ProviderId] = &[
        ProviderId::Anthropic,
        ProviderId::OpenAI,
        ProviderId::Google,
        ProviderId::XAI,
        ProviderId::DeepSeek,
        ProviderId::Perplexity,
        ProviderId::Qwen,
        ProviderId::Moonshot,
        ProviderId::Zhipu,
        ProviderId::OpenRouter,
        ProviderId::Ollama,
        ProviderId::LMStudio,
        ProviderId::CustomOpenAICompatible,
        ProviderId::AGICloud,
    ];

    /// Parse from the lowercase string used in `models.rs` / `model_catalog.rs`.
    pub fn from_catalog_name(name: &str) -> Option<ProviderId> {
        match name.to_lowercase().as_str() {
            "anthropic" => Some(ProviderId::Anthropic),
            "openai" => Some(ProviderId::OpenAI),
            "google" => Some(ProviderId::Google),
            "xai" | "grok" => Some(ProviderId::XAI),
            "deepseek" => Some(ProviderId::DeepSeek),
            "perplexity" => Some(ProviderId::Perplexity),
            "qwen" | "dashscope" => Some(ProviderId::Qwen),
            "moonshot" | "kimi" => Some(ProviderId::Moonshot),
            "zhipu" | "glm" => Some(ProviderId::Zhipu),
            "openrouter" | "open-router" | "open_router" => Some(ProviderId::OpenRouter),
            "ollama" | "ollama-local" | "ollama_local" | "ollama-cloud" | "ollama_cloud" => {
                Some(ProviderId::Ollama)
            }
            "lmstudio" | "lm-studio" | "lm_studio" => Some(ProviderId::LMStudio),
            "custom" | "custom-openai-compatible" => Some(ProviderId::CustomOpenAICompatible),
            "agi-cloud" | "agicloud" | "agi_cloud" => Some(ProviderId::AGICloud),
            _ => None,
        }
    }

    /// Which access mode / trust boundary this provider belongs to.
    ///
    /// This is purely a *presentation* grouping for pickers and status, it
    /// never changes routing or mixes trust boundaries. Local = on-device or a
    /// user-controlled endpoint (data stays with the user); Cloud = the
    /// AGI-managed subscription; everything else is BYOK (the user supplies the
    /// provider key and pays the provider directly).
    pub fn access_mode(self) -> AccessMode {
        match self {
            ProviderId::Ollama | ProviderId::LMStudio | ProviderId::CustomOpenAICompatible => {
                AccessMode::Local
            }
            ProviderId::AGICloud => AccessMode::Cloud,
            _ => AccessMode::Byok,
        }
    }
}

// ---------------------------------------------------------------------------
// AccessMode, the three trust boundaries AGI exposes to users
// ---------------------------------------------------------------------------

/// The access mode a model is reached through. Surfaced as the top-level
/// grouping in the model picker so a new user immediately sees the AGI value
/// proposition: run local, bring your own key, or use a managed subscription.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AccessMode {
    /// On-device (Ollama, LM Studio) or a user-controlled endpoint.
    Local,
    /// A cloud provider reached with the user's own API key.
    Byok,
    /// The AGI-managed cloud subscription.
    Cloud,
}

impl AccessMode {
    /// Display order: local first (the privacy-first default), then BYOK, then
    /// managed cloud.
    pub const ORDER: &'static [AccessMode] =
        &[AccessMode::Local, AccessMode::Byok, AccessMode::Cloud];

    /// Classify the runtime provider into an access mode. Presentation only,
    /// it never affects routing. A keyless OpenAI-compatible endpoint and local
    /// Ollama are Local; the AGI-managed endpoint is Cloud; anything reached
    /// with a key is BYOK.
    pub fn for_provider(provider: &crate::models::Provider) -> AccessMode {
        use crate::models::{OllamaMode, Provider};
        match provider {
            Provider::ManagedCloud => AccessMode::Cloud,
            Provider::Ollama(OllamaMode::Local) => AccessMode::Local,
            Provider::Ollama(OllamaMode::Cloud) => AccessMode::Byok,
            Provider::Custom { api_key_env, .. } => {
                if api_key_env.is_some() {
                    AccessMode::Byok
                } else {
                    AccessMode::Local
                }
            }
            Provider::OpenAICompatible {
                name, api_key_env, ..
            } => {
                if name.eq_ignore_ascii_case("agi-cloud") || name.eq_ignore_ascii_case("agicloud") {
                    AccessMode::Cloud
                } else if api_key_env.is_none() {
                    AccessMode::Local
                } else {
                    AccessMode::Byok
                }
            }
            Provider::Anthropic | Provider::Google => AccessMode::Byok,
        }
    }

    /// What a zero-dollar session total means for this access mode. Zero cost
    /// is only "free" when the model runs on the device: a BYOK session is
    /// billed by the provider and a managed session against the plan.
    pub fn zero_cost_note(self) -> &'static str {
        match self {
            AccessMode::Local => "no cost, local model",
            AccessMode::Byok => "billed by your provider",
            AccessMode::Cloud => "included in your plan",
        }
    }

    /// Short section label.
    pub fn label(self) -> &'static str {
        match self {
            AccessMode::Local => "Local",
            AccessMode::Byok => "Bring your own key",
            AccessMode::Cloud => "Cloud subscription",
        }
    }

    /// The trust-boundary word shown to a person in the welcome banner and the
    /// status-bar chip: "Local" / "Your key" / "Managed", the same vocabulary
    /// the VS Code extension uses. `label`/`tagline` stay full-sentence forms
    /// for the model picker's section headers.
    pub fn trust_word(self) -> &'static str {
        match self {
            AccessMode::Local => "Local",
            AccessMode::Byok => "Your key",
            AccessMode::Cloud => "Managed",
        }
    }

    /// One-line value-prop tagline shown under the section header. Kept short so
    /// it fits beside the label inside a narrow (≈70-col) picker without
    /// truncating.
    pub fn tagline(self) -> &'static str {
        match self {
            AccessMode::Local => "on-device · private · free",
            AccessMode::Byok => "your own provider keys",
            AccessMode::Cloud => "managed by AGI subscription",
        }
    }
}

// ---------------------------------------------------------------------------
// ProviderDisplay, mirrors ProviderDisplay interface in provider-display.ts
// ---------------------------------------------------------------------------

pub struct ProviderDisplay {
    #[allow(dead_code)] // retained for completeness of the TS contract mirror
    pub id: ProviderId,
    /// Human-readable label shown in pickers (matches `label` in TS).
    pub label: &'static str,
    /// Brand-neutral hex for CLI dot indicators (matches `brandColor` in TS).
    #[allow(dead_code)] // available for future colour-mode rendering
    pub brand_color: &'static str,
    /// True for Ollama / LMStudio (matches `isLocal` in TS).
    pub is_local: bool,
    /// True when provider has an explicit thinking/effort axis (matches `supportsEffort` in TS).
    pub supports_effort: bool,
}

impl ProviderId {
    /// Classify a runtime provider. The `OpenAICompatible` and `Custom`
    /// variants carry the vendor in their `name`, which is the same spelling
    /// the catalog uses.
    pub fn for_provider(provider: &crate::models::Provider) -> Option<ProviderId> {
        use crate::models::{OllamaMode, Provider};
        match provider {
            Provider::ManagedCloud => Some(ProviderId::AGICloud),
            Provider::Anthropic => Some(ProviderId::Anthropic),
            Provider::Google => Some(ProviderId::Google),
            Provider::Ollama(OllamaMode::Local | OllamaMode::Cloud) => Some(ProviderId::Ollama),
            Provider::OpenAICompatible { name, .. } => ProviderId::from_catalog_name(name),
            Provider::Custom { name, .. } => ProviderId::from_catalog_name(name),
        }
    }
}

/// The provider's human-readable name, the one the model picker and
/// `agi models list` print. Falls back to the endpoint's own name for a
/// user-defined provider the catalog does not know.
pub fn provider_label(provider: &crate::models::Provider) -> String {
    use crate::models::Provider;
    if let Some(id) = ProviderId::for_provider(provider) {
        return provider_display(id).label.to_string();
    }
    match provider {
        Provider::OpenAICompatible { name, .. } => (*name).to_string(),
        Provider::Custom { name, .. } => name.clone(),
        other => format!("{other:?}"),
    }
}

/// Returns the canonical display metadata for a provider.
///
/// Values mirror `PROVIDER_DISPLAY` in `packages/contracts/types/src/design-system/provider-display.ts`.
pub fn provider_display(id: ProviderId) -> ProviderDisplay {
    match id {
        ProviderId::Anthropic => ProviderDisplay {
            id,
            label: "Anthropic",
            brand_color: "#D4A27F",
            is_local: false,
            supports_effort: true,
        },
        ProviderId::OpenAI => ProviderDisplay {
            id,
            label: "OpenAI",
            brand_color: "#10A37F",
            is_local: false,
            supports_effort: true,
        },
        ProviderId::Google => ProviderDisplay {
            id,
            label: "Google",
            brand_color: "#4285F4",
            is_local: false,
            supports_effort: true,
        },
        ProviderId::XAI => ProviderDisplay {
            id,
            label: "xAI",
            brand_color: "#000000",
            is_local: false,
            supports_effort: false,
        },
        ProviderId::DeepSeek => ProviderDisplay {
            id,
            label: "DeepSeek",
            brand_color: "#4D6BFE",
            is_local: false,
            supports_effort: false,
        },
        ProviderId::Perplexity => ProviderDisplay {
            id,
            label: "Perplexity",
            brand_color: "#1FB8CD",
            is_local: false,
            supports_effort: false,
        },
        ProviderId::Qwen => ProviderDisplay {
            id,
            label: "Qwen",
            brand_color: "#615CED",
            is_local: false,
            supports_effort: false,
        },
        ProviderId::Moonshot => ProviderDisplay {
            id,
            label: "Moonshot",
            brand_color: "#16A34A",
            is_local: false,
            supports_effort: false,
        },
        ProviderId::Zhipu => ProviderDisplay {
            id,
            label: "Zhipu",
            brand_color: "#3B82F6",
            is_local: false,
            supports_effort: false,
        },
        ProviderId::OpenRouter => ProviderDisplay {
            id,
            label: "OpenRouter",
            brand_color: "#6467F2",
            is_local: false,
            supports_effort: false,
        },
        ProviderId::Ollama => ProviderDisplay {
            id,
            label: "Ollama",
            brand_color: "#000000",
            is_local: true,
            supports_effort: false,
        },
        ProviderId::LMStudio => ProviderDisplay {
            id,
            label: "LM Studio",
            brand_color: "#7C3AED",
            is_local: true,
            supports_effort: false,
        },
        ProviderId::CustomOpenAICompatible => ProviderDisplay {
            id,
            label: "Custom (OpenAI-compatible)",
            brand_color: "#71717A",
            is_local: false,
            supports_effort: false,
        },
        ProviderId::AGICloud => ProviderDisplay {
            id,
            label: "AGI Cloud",
            brand_color: "#F59E0B",
            is_local: false,
            supports_effort: true,
        },
    }
}

// ---------------------------------------------------------------------------
// CapabilityTier, mirrors CapabilityTier in provider-display.ts
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CapabilityTier {
    Fastest,
    Balanced,
    MostCapable,
}

pub fn capability_label(tier: CapabilityTier) -> &'static str {
    match tier {
        CapabilityTier::Fastest => "Fastest",
        CapabilityTier::Balanced => "Balanced",
        CapabilityTier::MostCapable => "Most capable",
    }
}

impl From<&str> for CapabilityTier {
    /// Convert a qualityTier string from models.json to a CapabilityTier.
    /// Values: "fast" → Fastest, "best" → MostCapable, anything else → Balanced.
    fn from(tier: &str) -> Self {
        match tier {
            "fast" | "economy" => CapabilityTier::Fastest,
            "best" => CapabilityTier::MostCapable,
            _ => CapabilityTier::Balanced,
        }
    }
}

/// Map a model ID to its capability tier for the picker sub-label.
///
/// Looks up the `qualityTier` field from the bundled models.json catalog via
/// `model_catalog::quality_tier_for_model()`.  Unknown model IDs (Ollama local
/// models, user-defined BYO endpoints) default to `Balanced`.
///
/// This replaces the former 30-arm hard-coded match, no model ID literals live here.
pub fn capability_for_model(model_id: &str) -> CapabilityTier {
    crate::model_catalog::quality_tier_for_model(model_id)
        .as_deref()
        .map(CapabilityTier::from)
        .unwrap_or(CapabilityTier::Balanced)
}

// ---------------------------------------------------------------------------
// Effort, mirrors Effort union in effort.ts
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Effort {
    Low,
    #[default]
    Medium,
    High,
    Max,
}

impl Effort {
    #[allow(dead_code)] // used in tests; future effort-cycle iterator
    pub const ALL: &'static [Effort] = &[Effort::Low, Effort::Medium, Effort::High, Effort::Max];

    pub fn label(self) -> &'static str {
        match self {
            Effort::Low => "Low",
            Effort::Medium => "Medium",
            Effort::High => "High",
            Effort::Max => "Max",
        }
    }

    /// Parse the `[default] reasoning_effort` config value onboarding writes.
    pub fn from_config_value(value: &str) -> Option<Effort> {
        match value.trim().to_ascii_lowercase().as_str() {
            "low" => Some(Effort::Low),
            "medium" => Some(Effort::Medium),
            "high" => Some(Effort::High),
            "max" => Some(Effort::Max),
            _ => None,
        }
    }

    /// Anthropic `thinking.budget_tokens` value (mirrors `ANTHROPIC_THINKING_BUDGET`).
    #[allow(dead_code)]
    pub fn anthropic_budget_tokens(self) -> u32 {
        match self {
            Effort::Low => 4_096,
            Effort::Medium => 16_384,
            Effort::High => 32_768,
            Effort::Max => 65_536,
        }
    }

    /// Returns the Anthropic extended-thinking budget for this effort level,
    /// or `None` for Low/Medium where standard inference is used.
    /// High = 32K tokens, Max = 65K tokens.
    pub fn thinking_budget_for_anthropic(self) -> Option<u32> {
        match self {
            Effort::Low | Effort::Medium => None,
            Effort::High => Some(32_768),
            Effort::Max => Some(65_536),
        }
    }

    /// OpenAI `reasoning.effort` string (mirrors `OPENAI_REASONING_EFFORT`).
    /// Note: `Max` falls back to `"high"` for o-series.
    pub fn openai_effort_str(self) -> &'static str {
        match self {
            Effort::Low => "low",
            Effort::Medium => "medium",
            Effort::High | Effort::Max => "high",
        }
    }

    /// Gemini `thinkingConfig.thinkingBudget` value (mirrors `GEMINI_THINKING_BUDGET`).
    pub fn gemini_thinking_budget(self) -> u32 {
        match self {
            Effort::Low => 4_096,
            Effort::Medium => 16_384,
            Effort::High => 32_768,
            Effort::Max => 65_536,
        }
    }

    /// Advance to the next effort level (wraps around).
    pub fn next(self) -> Effort {
        match self {
            Effort::Low => Effort::Medium,
            Effort::Medium => Effort::High,
            Effort::High => Effort::Max,
            Effort::Max => Effort::Low,
        }
    }

    /// Retreat to the previous effort level (wraps around).
    pub fn prev(self) -> Effort {
        match self {
            Effort::Low => Effort::Max,
            Effort::Medium => Effort::Low,
            Effort::High => Effort::Medium,
            Effort::Max => Effort::High,
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_providers_have_display() {
        for &id in ProviderId::ALL {
            let d = provider_display(id);
            assert_eq!(d.id, id);
            assert!(!d.label.is_empty());
            assert!(d.brand_color.starts_with('#'));
        }
    }

    /// The welcome banner and status chip must read for a person: no bare
    /// "BYOK" acronym, matching the words the VS Code extension shows.
    #[test]
    fn access_mode_trust_words_have_no_jargon() {
        assert_eq!(AccessMode::Local.trust_word(), "Local");
        assert_eq!(AccessMode::Byok.trust_word(), "Your key");
        assert_eq!(AccessMode::Cloud.trust_word(), "Managed");
        for &mode in AccessMode::ORDER {
            assert!(!mode.trust_word().to_uppercase().contains("BYOK"));
        }
    }

    #[test]
    fn effort_supports_effort_providers() {
        // Providers with supportsEffort=true in the TS source
        assert!(provider_display(ProviderId::Anthropic).supports_effort);
        assert!(provider_display(ProviderId::OpenAI).supports_effort);
        assert!(provider_display(ProviderId::Google).supports_effort);
        assert!(provider_display(ProviderId::AGICloud).supports_effort);
        // Providers with supportsEffort=false
        assert!(!provider_display(ProviderId::XAI).supports_effort);
        assert!(!provider_display(ProviderId::Ollama).supports_effort);
        assert!(!provider_display(ProviderId::LMStudio).supports_effort);
    }

    #[test]
    fn effort_labels_match_ts() {
        assert_eq!(Effort::Low.label(), "Low");
        assert_eq!(Effort::Medium.label(), "Medium");
        assert_eq!(Effort::High.label(), "High");
        assert_eq!(Effort::Max.label(), "Max");
    }

    #[test]
    fn capability_tier_for_known_models() {
        for model in crate::model_catalog::catalog().all() {
            let expected = crate::model_catalog::quality_tier_for_model(&model.id)
                .as_deref()
                .map(CapabilityTier::from)
                .unwrap_or(CapabilityTier::Balanced);
            assert_eq!(capability_for_model(&model.id), expected, "{}", model.id);
        }
        // default fallback for models not in the shared catalog (e.g. local Ollama)
        assert_eq!(
            capability_for_model("some-unknown-model"),
            CapabilityTier::Balanced
        );
    }

    #[test]
    fn provider_from_catalog_name_roundtrip() {
        assert_eq!(
            ProviderId::from_catalog_name("anthropic"),
            Some(ProviderId::Anthropic)
        );
        assert_eq!(
            ProviderId::from_catalog_name("lmstudio"),
            Some(ProviderId::LMStudio)
        );
        assert_eq!(ProviderId::from_catalog_name("unknown-xyz"), None);
    }

    #[test]
    fn effort_cycle() {
        assert_eq!(Effort::Low.next(), Effort::Medium);
        assert_eq!(Effort::Max.next(), Effort::Low);
        assert_eq!(Effort::Medium.prev(), Effort::Low);
        assert_eq!(Effort::Low.prev(), Effort::Max);
    }

    #[test]
    fn anthropic_budget_tokens_order() {
        assert!(Effort::Low.anthropic_budget_tokens() < Effort::Medium.anthropic_budget_tokens());
        assert!(Effort::Medium.anthropic_budget_tokens() < Effort::High.anthropic_budget_tokens());
        assert!(Effort::High.anthropic_budget_tokens() < Effort::Max.anthropic_budget_tokens());
    }
}
