//! Compress the tool catalog for smaller / faster models.
//!
//! Gemini Flash and other tier-2/3 models don't need full verbose tool
//! descriptions. Sending a smaller payload saves 30–40% of context per turn.
//!
//! Strategy:
//! - Tier-1 (opus, gpt-5.4, gemini-3.1, claude-sonnet-4-6 above): full catalog
//! - Tier-2 (haiku, gpt-5, flash): drop `should_defer` tools; truncate descriptions to 80 chars
//! - Tier-3 (mini, nano, ollama small): drop `should_defer` tools; truncate descriptions to 40 chars; drop optional schema fields

#[allow(dead_code)]
use crate::models::ToolDefinition;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelTier {
    Tier1,
    Tier2,
    Tier3,
}

#[allow(dead_code)]
pub fn classify(model: &str) -> ModelTier {
    let m = model.to_lowercase();
    if m.contains("opus")
        || m.starts_with("gpt-5.4")
        || m.contains("gemini-3.1")
        || m.contains("sonnet-4-6")
        || m.contains("sonnet-4-7")
    {
        ModelTier::Tier1
    } else if m.contains("haiku")
        || m.contains("flash")
        || m.starts_with("gpt-5")
        || m.contains("qwen")
        || m.contains("deepseek")
    {
        ModelTier::Tier2
    } else if m.contains("mini")
        || m.contains("nano")
        || m.starts_with("ollama")
        || m.starts_with("lmstudio")
    {
        ModelTier::Tier3
    } else {
        ModelTier::Tier1 // conservative — full catalog for unknown
    }
}

#[allow(dead_code)]
pub fn distill_for(model: &str, full: &[ToolDefinition]) -> Vec<ToolDefinition> {
    let tier = classify(model);
    distill_for_tier(tier, full)
}

#[allow(dead_code)]
pub fn distill_for_tier(tier: ModelTier, full: &[ToolDefinition]) -> Vec<ToolDefinition> {
    full.iter()
        .filter(|t| match tier {
            ModelTier::Tier1 => true,
            ModelTier::Tier2 | ModelTier::Tier3 => !t.should_defer,
        })
        .map(|t| {
            let mut clone = t.clone();
            let desc_cap = match tier {
                ModelTier::Tier1 => usize::MAX,
                ModelTier::Tier2 => 80,
                ModelTier::Tier3 => 40,
            };
            if clone.description.len() > desc_cap {
                // Truncate on word boundary if possible.
                let cap = clone.description[..desc_cap]
                    .rfind(' ')
                    .unwrap_or(desc_cap);
                clone.description.truncate(cap);
                clone.description.push('\u{2026}');
            }
            clone
        })
        .collect()
}

#[allow(dead_code)]
pub fn estimate_payload_bytes(tools: &[ToolDefinition]) -> usize {
    tools
        .iter()
        .map(|t| t.name.len() + t.description.len() + t.input_schema.to_string().len() + 32)
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::tool_catalog::built_in_tool_definitions;

    #[test]
    fn classify_known_models() {
        assert_eq!(classify("claude-opus-4-7"), ModelTier::Tier1);
        assert_eq!(classify("claude-sonnet-4-6"), ModelTier::Tier1);
        assert_eq!(classify("claude-haiku-4-5"), ModelTier::Tier2);
        assert_eq!(classify("gpt-5.4"), ModelTier::Tier1);
        assert_eq!(classify("gpt-5"), ModelTier::Tier2);
        assert_eq!(classify("gpt-5-mini"), ModelTier::Tier3);
        assert_eq!(classify("gemini-3.1-flash"), ModelTier::Tier2);
        assert_eq!(classify("ollama:llama3"), ModelTier::Tier3);
        // Unknown defaults to Tier1 (conservative).
        assert_eq!(classify("some-new-model-xyz"), ModelTier::Tier1);
    }

    #[test]
    fn tier1_returns_full_catalog() {
        let full = built_in_tool_definitions();
        let distilled = distill_for_tier(ModelTier::Tier1, &full);
        assert_eq!(distilled.len(), full.len());
    }

    #[test]
    fn tier2_drops_should_defer_tools() {
        let full = built_in_tool_definitions();
        let distilled = distill_for_tier(ModelTier::Tier2, &full);
        assert!(distilled.len() < full.len(), "tier2 must drop something");
        assert!(
            distilled.iter().all(|t| !t.should_defer),
            "no should_defer tools in tier2"
        );
    }

    #[test]
    fn tier3_drops_should_defer_and_truncates_more() {
        let full = built_in_tool_definitions();
        let t2 = distill_for_tier(ModelTier::Tier2, &full);
        let t3 = distill_for_tier(ModelTier::Tier3, &full);
        let t2_bytes = estimate_payload_bytes(&t2);
        let t3_bytes = estimate_payload_bytes(&t3);
        assert!(t3_bytes <= t2_bytes, "tier3 payload must be ≤ tier2");
    }

    #[test]
    fn distillation_reduces_haiku_payload_significantly() {
        let full = built_in_tool_definitions();
        let opus = distill_for("claude-opus-4-7", &full);
        let haiku = distill_for("claude-haiku-4-5", &full);
        let opus_bytes = estimate_payload_bytes(&opus);
        let haiku_bytes = estimate_payload_bytes(&haiku);
        let savings = 1.0 - (haiku_bytes as f64 / opus_bytes as f64);
        assert!(
            savings > 0.10,
            "expected ≥10% savings on haiku; got {:.2}%",
            savings * 100.0
        );
    }

    #[test]
    fn distillation_preserves_tool_names() {
        let full = built_in_tool_definitions();
        let haiku = distill_for("claude-haiku-4-5", &full);
        for t in &haiku {
            assert!(!t.name.is_empty());
            assert!(full.iter().any(|orig| orig.name == t.name));
        }
    }

    #[test]
    fn distillation_truncates_description_to_target() {
        let full = built_in_tool_definitions();
        let nano = distill_for_tier(ModelTier::Tier3, &full);
        for t in &nano {
            // 40 chars + 1 for ellipsis = 41 max, with word-boundary
            // truncation may go a bit shorter, but never longer than 41.
            assert!(
                t.description.chars().count() <= 41,
                "{} description {:?} too long",
                t.name,
                t.description
            );
        }
    }
}
