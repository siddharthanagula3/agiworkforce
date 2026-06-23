//! Shared fuzzy matching + ranking for the TUI pickers (slash commands, models,
//! agents…). A query matches a candidate when every query char appears in the
//! candidate in order (case-insensitive). The returned score rewards contiguous
//! runs, start-of-string matches, and word/camelCase boundaries so the best
//! candidates rank first — far better than a plain substring filter (e.g. `mdl`
//! matches `model`, and `/model` ranks above a description-only hit).

/// Returns `Some(score)` (higher is better) when `query` fuzzy-matches
/// `candidate`, or `None` when it doesn't. An empty query matches everything
/// with a neutral score.
pub fn fuzzy_score(query: &str, candidate: &str) -> Option<i32> {
    if query.is_empty() {
        return Some(0);
    }
    let q: Vec<char> = query.to_lowercase().chars().collect();
    let cand: Vec<char> = candidate.chars().collect();
    let cand_lower: Vec<char> = candidate.to_lowercase().chars().collect();

    let mut qi = 0usize;
    let mut score = 0i32;
    let mut prev_match: Option<usize> = None;

    for (ci, &ch) in cand_lower.iter().enumerate() {
        if qi >= q.len() {
            break;
        }
        if ch != q[qi] {
            continue;
        }
        score += 1;
        if ci == 0 {
            score += 12; // start of string
        } else if !cand[ci - 1].is_alphanumeric() {
            score += 9; // word boundary (after space/-/_/etc.)
        } else if cand[ci].is_uppercase() && cand[ci - 1].is_lowercase() {
            score += 5; // camelCase boundary
        }
        if prev_match == Some(ci.wrapping_sub(1)) {
            score += 6; // contiguous run
        }
        prev_match = Some(ci);
        qi += 1;
    }

    if qi == q.len() {
        // Prefer shorter candidates when scores are otherwise close.
        Some(score - (cand.len() as i32) / 16)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_subsequence_not_just_substring() {
        // Plain substring would miss this; fuzzy matches it.
        assert!(fuzzy_score("mdl", "model").is_some());
        assert!(fuzzy_score("rvw", "review").is_some());
        // Non-subsequence does not match.
        assert!(fuzzy_score("xyz", "model").is_none());
        assert!(fuzzy_score("ldm", "model").is_none(), "order matters");
    }

    #[test]
    fn ranks_prefix_and_exact_above_scattered() {
        // "model" should score higher against "model" than against "output-style".
        let exact = fuzzy_score("model", "model").unwrap();
        let scattered = fuzzy_score("model", "output-style-mode-loader");
        assert!(scattered.is_none() || exact > scattered.unwrap());
    }

    #[test]
    fn exact_name_outscores_scattered_for_ranking() {
        let mut scored: Vec<(i32, &str)> = ["plan", "model", "models", "mobile", "memory"]
            .iter()
            .filter_map(|s| fuzzy_score("model", s).map(|sc| (sc, *s)))
            .collect();
        scored.sort_by(|a, b| b.0.cmp(&a.0));
        assert_eq!(scored.first().map(|(_, s)| *s), Some("model"));
        assert!(!scored.iter().any(|(_, s)| *s == "plan"), "non-match dropped");
        assert!(!scored.iter().any(|(_, s)| *s == "memory"), "non-match dropped");
    }
}
