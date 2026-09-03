

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

    /// Short section label.
    pub fn label(self) -> &'static str {
        match self {
            AccessMode::Local => "Local",
            AccessMode::Byok => "Bring your own key",
            AccessMode::Cloud => "Cloud subscription",
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

pub fn capability_for_model(model_id: &str) -> CapabilityTier {
    crate::model_catalog::quality_tier_for_model(model_id)
        .as_deref()
        .map(CapabilityTier::from)
        .unwrap_or(CapabilityTier::Balanced)
}


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
