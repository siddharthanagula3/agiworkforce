//! Picks which of several labelled candidates an utterance's phrase names.
//!
//! Both driven tiers resolve a target the same way, so the rule lives once: a
//! label is normalised to its alphanumeric words, scored against the phrase,
//! and the best score wins only when nothing ties it. Two candidates that tie
//! are reported as ambiguous rather than resolved by position, because picking
//! the first would act on a control the user did not name.

const NORMALISED_WORD_SEPARATOR: char = ' ';

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LabelScore {
    Contains,
    Prefix,
    Exact,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Match<T> {
    Found(T),
    Ambiguous { candidates: usize },
    NotFound,
}

impl<T> Match<T> {
    pub fn is_not_found(&self) -> bool {
        matches!(self, Self::NotFound)
    }
}

pub fn normalise_label(raw: &str) -> String {
    let mut normalised = String::with_capacity(raw.len());
    let mut separated = false;

    for character in raw.chars() {
        if character.is_alphanumeric() {
            if separated && !normalised.is_empty() {
                normalised.push(NORMALISED_WORD_SEPARATOR);
            }
            separated = false;
            normalised.extend(character.to_lowercase());
        } else {
            separated = true;
        }
    }

    normalised
}

pub fn score_label(normalised_phrase: &str, normalised_label: &str) -> Option<LabelScore> {
    if normalised_phrase.is_empty() || normalised_label.is_empty() {
        return None;
    }

    if normalised_label == normalised_phrase {
        return Some(LabelScore::Exact);
    }

    if normalised_label.starts_with(normalised_phrase) {
        return Some(LabelScore::Prefix);
    }

    if normalised_label.contains(normalised_phrase) {
        return Some(LabelScore::Contains);
    }

    None
}

pub fn pick_best<T, I>(phrase: &str, candidates: I) -> Match<T>
where
    T: PartialEq,
    I: IntoIterator<Item = (String, T)>,
{
    let normalised_phrase = normalise_label(phrase);
    let mut scored: Vec<(LabelScore, T)> = Vec::new();

    for (label, payload) in candidates {
        if let Some(score) = score_label(&normalised_phrase, &normalise_label(&label)) {
            scored.push((score, payload));
        }
    }

    let Some(best) = scored.iter().map(|(score, _)| *score).max() else {
        return Match::NotFound;
    };

    let mut distinct: Vec<T> = Vec::new();
    for (score, payload) in scored {
        if score == best && !distinct.contains(&payload) {
            distinct.push(payload);
        }
    }

    if distinct.len() > 1 {
        return Match::Ambiguous {
            candidates: distinct.len(),
        };
    }

    distinct.pop().map(Match::Found).unwrap_or(Match::NotFound)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidates(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
        pairs
            .iter()
            .map(|(label, id)| ((*label).to_string(), (*id).to_string()))
            .collect()
    }

    #[test]
    fn normalising_drops_punctuation_mnemonics_and_case() {
        assert_eq!(normalise_label("&Save As\u{2026}"), "save as");
        assert_eq!(normalise_label("  Send   Message  "), "send message");
        assert_eq!(normalise_label("---"), "");
    }

    #[test]
    fn an_exact_label_outranks_a_prefix_and_a_containment() {
        assert_eq!(score_label("send", "send"), Some(LabelScore::Exact));
        assert_eq!(score_label("send", "send later"), Some(LabelScore::Prefix));
        assert_eq!(
            score_label("send", "resend now"),
            Some(LabelScore::Contains)
        );
        assert_eq!(score_label("send", "reply"), None);
        assert_eq!(score_label("", "send"), None);
    }

    #[test]
    fn the_single_best_scoring_candidate_wins() {
        let picked = pick_best("send", candidates(&[("Send Later", "a"), ("Send", "b")]));

        assert_eq!(picked, Match::Found(String::from("b")));
    }

    #[test]
    fn two_candidates_at_the_same_score_are_ambiguous_rather_than_guessed() {
        let picked = pick_best(
            "send",
            candidates(&[("Send", "a"), ("send", "b"), ("Reply", "c")]),
        );

        assert_eq!(picked, Match::Ambiguous { candidates: 2 });
    }

    #[test]
    fn a_lower_scoring_candidate_never_creates_a_tie() {
        let picked = pick_best(
            "send",
            candidates(&[("Send", "a"), ("Send Later", "b"), ("Resend", "c")]),
        );

        assert_eq!(picked, Match::Found(String::from("a")));
    }

    #[test]
    fn the_same_candidate_reported_twice_is_one_candidate() {
        let picked = pick_best(
            "send",
            candidates(&[("Send", "a"), ("Send", "a"), ("Send Later", "b")]),
        );

        assert_eq!(picked, Match::Found(String::from("a")));
    }

    #[test]
    fn nothing_resembling_the_phrase_is_not_found() {
        let picked = pick_best("send", candidates(&[("Reply", "a"), ("Archive", "b")]));

        assert!(picked.is_not_found());
    }

    #[test]
    fn a_normalised_phrase_matches_a_label_that_only_differs_in_punctuation() {
        let picked = pick_best("save as", candidates(&[("&Save As\u{2026}", "a")]));

        assert_eq!(picked, Match::Found(String::from("a")));
    }
}
