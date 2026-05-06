//! Mirror of `packages/types/src/design-system/`.
//!
//! This file is a manual Rust mirror of the TypeScript design-system contracts.
//! The TypeScript side is the single source of truth — update both when the TS
//! contract changes.  Surfaces: provider-display.ts, effort.ts.

// ---------------------------------------------------------------------------
// ProviderId — mirrors ProviderId union in provider-display.ts
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
            "ollama" | "ollama-local" | "ollama_local" | "ollama-cloud" | "ollama_cloud" => {
                Some(ProviderId::Ollama)
            }
            "lmstudio" | "lm-studio" | "lm_studio" => Some(ProviderId::LMStudio),
            "custom" | "custom-openai-compatible" => Some(ProviderId::CustomOpenAICompatible),
            "agi-cloud" | "agicloud" | "agi_cloud" => Some(ProviderId::AGICloud),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// ProviderDisplay — mirrors ProviderDisplay interface in provider-display.ts
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

/// Returns the canonical display metadata for a provider.
///
/// Values mirror `PROVIDER_DISPLAY` in `packages/types/src/design-system/provider-display.ts`.
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
// CapabilityTier — mirrors CapabilityTier in provider-display.ts
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

/// Map a model ID to its capability tier for the picker sub-label.
///
/// Model IDs are read from the catalog at runtime — this function only handles
/// the well-known bundled IDs.  Unknown IDs default to `Balanced`.
pub fn capability_for_model(model_id: &str) -> CapabilityTier {
    match model_id {
        // Anthropic
        "claude-haiku-4-5" => CapabilityTier::Fastest,
        "claude-sonnet-4-5" => CapabilityTier::Balanced,
        "claude-sonnet-4-6" => CapabilityTier::Balanced,
        "claude-opus-4-6" => CapabilityTier::MostCapable,
        "claude-opus-4.6" => CapabilityTier::MostCapable,
        "claude-opus-4.7" => CapabilityTier::MostCapable,
        "claude-opus-4-7" => CapabilityTier::MostCapable,
        // OpenAI
        "gpt-5.5" => CapabilityTier::Balanced,
        "gpt-5.5-mini" => CapabilityTier::Fastest,
        "gpt-5.4-codex" => CapabilityTier::MostCapable,
        "o3" => CapabilityTier::MostCapable,
        // Google
        "gemini-3.1-pro-preview" => CapabilityTier::MostCapable,
        "gemini-3.1-flash-lite" => CapabilityTier::Fastest,
        "gemini-3.1-flash-image" => CapabilityTier::Balanced,
        "gemini-3-pro-preview" => CapabilityTier::MostCapable,
        "gemini-3-flash-preview" => CapabilityTier::Fastest,
        "gemini-3-ultra" => CapabilityTier::MostCapable,
        // xAI
        "grok-4.3" => CapabilityTier::MostCapable,
        "grok-4" => CapabilityTier::Balanced,
        "grok-4-fast" => CapabilityTier::Fastest,
        "grok-4-mini" => CapabilityTier::Fastest,
        "grok-4-fast-reasoning" | "grok-4-1-fast-reasoning" => CapabilityTier::Balanced,
        // DeepSeek
        "deepseek-chat" => CapabilityTier::Balanced,
        "deepseek-v4-flash" => CapabilityTier::Fastest,
        "deepseek-v4-pro" => CapabilityTier::MostCapable,
        // Perplexity
        "sonar" => CapabilityTier::Fastest,
        "sonar-reasoning" => CapabilityTier::Balanced,
        "sonar-reasoning-pro" => CapabilityTier::MostCapable,
        // Qwen
        "qwen-turbo" | "qwen-flash" | "qwen-coder-flash" => CapabilityTier::Fastest,
        "qwen-max" | "qwen-3.6-plus" | "qwen-coder-plus" => CapabilityTier::MostCapable,
        // Moonshot
        "kimi-k2.5-turbo" => CapabilityTier::Fastest,
        "kimi-k2.5" => CapabilityTier::Balanced,
        "kimi-k2.5-thinking" | "kimi-k2.6" => CapabilityTier::MostCapable,
        // Zhipu
        "glm-4.6v-flash" => CapabilityTier::Fastest,
        "glm-4.7" | "glm-4.6v" => CapabilityTier::Balanced,
        "glm-5.1" => CapabilityTier::MostCapable,
        // Default
        _ => CapabilityTier::Balanced,
    }
}

// ---------------------------------------------------------------------------
// Effort — mirrors Effort union in effort.ts
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

    /// OpenAI `reasoning.effort` string (mirrors `OPENAI_REASONING_EFFORT`).
    /// Note: `Max` falls back to `"high"` for o-series.
    #[allow(dead_code)]
    pub fn openai_effort_str(self) -> &'static str {
        match self {
            Effort::Low => "low",
            Effort::Medium => "medium",
            Effort::High | Effort::Max => "high",
        }
    }

    /// Gemini `thinkingConfig.thinkingBudget` value (mirrors `GEMINI_THINKING_BUDGET`).
    #[allow(dead_code)]
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
        assert_eq!(
            capability_for_model("claude-haiku-4-5"),
            CapabilityTier::Fastest
        );
        assert_eq!(
            capability_for_model("claude-sonnet-4-6"),
            CapabilityTier::Balanced
        );
        assert_eq!(
            capability_for_model("claude-opus-4-7"),
            CapabilityTier::MostCapable
        );
        // default fallback
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
        assert_eq!(
            ProviderId::from_catalog_name("unknown-xyz"),
            None
        );
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
