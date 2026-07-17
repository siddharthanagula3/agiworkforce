use agiworkforce_agent_core::memory::{
    MemoryCategory, MemoryDecayConfig, MemoryRelevanceInput, boosted_importance,
    classify_memory_category, cosine_similarity, decayed_importance, memory_relevance_score,
    normalize_memory_key,
};

#[test]
fn categories_and_normalization_are_shared_contracts() {
    assert_eq!(
        classify_memory_category("User prefers Rust over Go"),
        MemoryCategory::Preference
    );
    assert_eq!(
        classify_memory_category("We decided to keep SQLite local"),
        MemoryCategory::Decision
    );
    assert_eq!(
        normalize_memory_key("  User   PREFERS\nRust  "),
        "user prefers rust"
    );
}

#[test]
fn decay_and_access_boost_match_the_desktop_policy() {
    let config = MemoryDecayConfig::default();
    assert_eq!(decayed_importance(10, 14, &config), 8);
    assert_eq!(decayed_importance(2, 365, &config), 1);
    assert_eq!(boosted_importance(9, &config), 10);
}

#[test]
fn dense_similarity_rejects_invalid_vectors() {
    assert_eq!(cosine_similarity(&[1.0, 0.0], &[1.0, 0.0]), Some(1.0));
    assert_eq!(cosine_similarity(&[0.0, 0.0], &[1.0, 0.0]), None);
    assert_eq!(cosine_similarity(&[1.0], &[1.0, 0.0]), None);
    assert_eq!(cosine_similarity(&[f32::NAN], &[1.0]), None);
}

#[test]
fn relevance_uses_embeddings_when_available() {
    let with_embedding = memory_relevance_score(MemoryRelevanceInput {
        lexical_similarity: 0.2,
        embedding_similarity: Some(0.9),
        lexical_weight: None,
        importance: 8,
        days_since_access: 1,
    });
    let lexical_only = memory_relevance_score(MemoryRelevanceInput {
        embedding_similarity: None,
        ..MemoryRelevanceInput {
            lexical_similarity: 0.2,
            embedding_similarity: None,
            lexical_weight: None,
            importance: 8,
            days_since_access: 1,
        }
    });
    assert!(with_embedding > lexical_only);
    assert!((0.0..=1.0).contains(&with_embedding));
}

#[test]
fn relevance_respects_surface_retrieval_weighting() {
    let keyword_heavy = memory_relevance_score(MemoryRelevanceInput {
        lexical_similarity: 0.9,
        embedding_similarity: Some(0.1),
        lexical_weight: Some(0.8),
        importance: 5,
        days_since_access: 0,
    });
    let semantic_heavy = memory_relevance_score(MemoryRelevanceInput {
        lexical_weight: Some(0.2),
        ..MemoryRelevanceInput {
            lexical_similarity: 0.9,
            embedding_similarity: Some(0.1),
            lexical_weight: None,
            importance: 5,
            days_since_access: 0,
        }
    });
    assert!(keyword_heavy > semantic_heavy);
}
