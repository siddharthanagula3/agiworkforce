//! Host-neutral memory taxonomy, decay, embedding validation, and relevance
//! scoring. Persistence and embedding provider selection stay in surface
//! adapters so Local/BYOK/Managed boundaries remain explicit.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MemoryCategory {
    Preference,
    Fact,
    Decision,
    #[default]
    Context,
    Summary,
    Skill,
}

impl MemoryCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Preference => "preference",
            Self::Fact => "fact",
            Self::Decision => "decision",
            Self::Context => "context",
            Self::Summary => "summary",
            Self::Skill => "skill",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "preference" => Some(Self::Preference),
            "fact" => Some(Self::Fact),
            "decision" => Some(Self::Decision),
            "context" => Some(Self::Context),
            "summary" => Some(Self::Summary),
            "skill" => Some(Self::Skill),
            _ => None,
        }
    }
}

pub fn normalize_memory_key(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

pub fn classify_memory_category(value: &str) -> MemoryCategory {
    let normalized = normalize_memory_key(value);
    if [
        " prefer",
        "prefers ",
        " like",
        " likes ",
        " love",
        " loves ",
        " hate",
        " dislike",
        "favorite",
        "favourite",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
    {
        MemoryCategory::Preference
    } else if [
        "decided", "decision", "we will", "must use", "chosen", "chose ",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
    {
        MemoryCategory::Decision
    } else if ["remember", "note that", "for future reference", "context:"]
        .iter()
        .any(|needle| normalized.contains(needle))
    {
        MemoryCategory::Context
    } else {
        MemoryCategory::Fact
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct MemoryDecayConfig {
    pub enabled: bool,
    pub decay_rate: f32,
    pub decay_period_days: i64,
    pub min_importance: i32,
    pub max_importance: i32,
    pub access_boost: i32,
}

impl Default for MemoryDecayConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            decay_rate: 0.1,
            decay_period_days: 7,
            min_importance: 1,
            max_importance: 10,
            access_boost: 1,
        }
    }
}

pub fn decayed_importance(
    current_importance: i32,
    days_since_access: i64,
    config: &MemoryDecayConfig,
) -> i32 {
    let current = current_importance.clamp(config.min_importance, config.max_importance);
    if !config.enabled || config.decay_period_days <= 0 || days_since_access <= 0 {
        return current;
    }
    let periods = days_since_access / config.decay_period_days;
    if periods <= 0 {
        return current;
    }
    let maximum_decay = current - config.min_importance;
    let decay =
        (current as f32 * config.decay_rate.clamp(0.0, 1.0) * periods as f32).floor() as i32;
    current - decay.clamp(0, maximum_decay)
}

pub fn boosted_importance(current_importance: i32, config: &MemoryDecayConfig) -> i32 {
    let current = current_importance.clamp(config.min_importance, config.max_importance);
    if !config.enabled {
        current
    } else {
        current
            .saturating_add(config.access_boost.max(0))
            .min(config.max_importance)
    }
}

pub fn valid_embedding(embedding: &[f32]) -> bool {
    if embedding.is_empty() || !embedding.iter().all(|value| value.is_finite()) {
        return false;
    }
    embedding
        .iter()
        .map(|value| value * value)
        .sum::<f32>()
        .sqrt()
        > 1e-8
}

pub fn cosine_similarity(left: &[f32], right: &[f32]) -> Option<f32> {
    if left.len() != right.len() || !valid_embedding(left) || !valid_embedding(right) {
        return None;
    }
    let dot = left
        .iter()
        .zip(right)
        .map(|(left, right)| left * right)
        .sum::<f32>();
    let left_norm = left.iter().map(|value| value * value).sum::<f32>().sqrt();
    let right_norm = right.iter().map(|value| value * value).sum::<f32>().sqrt();
    let similarity = dot / (left_norm * right_norm);
    similarity.is_finite().then(|| similarity.clamp(-1.0, 1.0))
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MemoryRelevanceInput {
    pub lexical_similarity: f32,
    pub embedding_similarity: Option<f32>,
    /// Share of retrieval relevance assigned to the lexical signal when a
    /// dense embedding is available. Defaults to 0.25.
    pub lexical_weight: Option<f32>,
    pub importance: i32,
    pub days_since_access: i64,
}

pub fn memory_relevance_score(input: MemoryRelevanceInput) -> f32 {
    let lexical = input.lexical_similarity.clamp(0.0, 1.0);
    let importance = (input.importance.clamp(1, 10) as f32) / 10.0;
    let recency = 0.5_f32.powf(input.days_since_access.max(0) as f32 / 30.0);
    let score = match input.embedding_similarity.filter(|score| score.is_finite()) {
        Some(embedding) => {
            let lexical_weight = input.lexical_weight.unwrap_or(0.25).clamp(0.0, 1.0);
            let retrieval =
                lexical * lexical_weight + embedding.clamp(0.0, 1.0) * (1.0 - lexical_weight);
            retrieval * 0.80 + importance * 0.15 + recency * 0.05
        }
        None => lexical * 0.70 + importance * 0.20 + recency * 0.10,
    };
    score.clamp(0.0, 1.0)
}
