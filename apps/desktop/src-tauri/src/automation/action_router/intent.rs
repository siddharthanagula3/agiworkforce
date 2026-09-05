//! The typed shape a tier can answer "can I do this" about.
//!
//! Parsing here is lexical on purpose: the router must not spend a model call
//! deciding where an action should run, and a tier that guessed a target from
//! an inferred meaning would click something the user never named. Anything the
//! parse cannot resolve stays `None`, which every tier reads as a decline.
//!
//! Case is preserved through the parse because the accessibility probe matches
//! an element by the name the platform reports, not by a folded copy of it.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;

use crate::automation::computer_use::ComputerUseTask;

const RETRIEVAL_VERBS: &[&str] = &["read", "fetch", "download", "summarize"];
const INVOKE_VERBS: &[&str] = &[
    "click", "press", "tap", "select", "choose", "open", "activate", "toggle", "launch",
];
const ENTER_TEXT_VERBS: &[&str] = &["type", "enter", "fill"];
const FILLER_PREFIXES: &[&str] = &["the", "a", "an", "on", "onto", "to", "into"];
const ELEMENT_NOUNS: &[&str] = &[
    "button", "link", "menu", "item", "tab", "checkbox", "field", "icon", "row", "cell", "toggle",
];
const CLAUSE_SEPARATOR_PATTERNS: &[&str] = &[
    ";",
    ",",
    r"\s+and\s+then\s+",
    r"\s+after\s+that\s+",
    r"\s+then\s+",
    r"\s+and\s+",
];
const SCOPE_PREPOSITION_PATTERNS: &[&str] = &[r"\s+inside\s+", r"\s+in\s+", r"\s+on\s+"];
const URL_PATTERN_SOURCE: &str = r"(?i)\bhttps?://[^\s'\x22]+";
const CASE_INSENSITIVE_PREFIX: &str = "(?i)";
const ALTERNATION: &str = "|";
const SINGLE_OPERATION_CLAUSES: usize = 1;
const MAX_TARGET_PHRASE_WORDS: usize = 6;
const TRAILING_PUNCTUATION: &[char] = &['.', ',', ';', ':', '!', '?', ')', '\'', '"'];

static CLAUSE_SEPARATORS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        "{CASE_INSENSITIVE_PREFIX}{}",
        CLAUSE_SEPARATOR_PATTERNS.join(ALTERNATION)
    ))
    .expect("action router regex: clause separators")
});

static SCOPE_PREPOSITIONS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        "{CASE_INSENSITIVE_PREFIX}{}",
        SCOPE_PREPOSITION_PATTERNS.join(ALTERNATION)
    ))
    .expect("action router regex: scope prepositions")
});

static ABSOLUTE_URL: Lazy<Regex> =
    Lazy::new(|| Regex::new(URL_PATTERN_SOURCE).expect("action router regex: absolute url"));

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IntentOperation {
    Retrieve,
    Invoke,
    EnterText,
    Unresolved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionIntent {
    pub utterance: String,
    pub operation: IntentOperation,
    pub web_url: Option<String>,
    pub application: Option<String>,
    pub target_phrase: Option<String>,
    pub clauses: usize,
}

impl ActionIntent {
    pub fn from_task(task: &ComputerUseTask) -> Self {
        Self::parse(&task.description, task.target_application.clone())
    }

    pub fn parse(utterance: &str, application: Option<String>) -> Self {
        let clauses = split_clauses(utterance);
        let primary = clauses
            .iter()
            .find(|clause| leading_verb(clause).is_some())
            .map(String::as_str)
            .unwrap_or(utterance);

        let (operation, remainder) = leading_verb(primary)
            .map(|(operation, remainder)| (operation, remainder.to_string()))
            .unwrap_or((IntentOperation::Unresolved, String::new()));

        let (remainder, scoped_application) = split_scope(&remainder);

        Self {
            utterance: utterance.to_string(),
            operation,
            web_url: first_url(utterance),
            application: application.or(scoped_application),
            target_phrase: target_phrase(&remainder),
            clauses: clauses.len().max(SINGLE_OPERATION_CLAUSES),
        }
    }

    /// A tier below the visual loop drives one existing tool per action, so an
    /// utterance carrying several operations has to fall through rather than
    /// run its first clause and report the whole task done.
    pub fn is_single_operation(&self) -> bool {
        self.clauses == SINGLE_OPERATION_CLAUSES
    }
}

fn split_clauses(utterance: &str) -> Vec<String> {
    CLAUSE_SEPARATORS
        .split(utterance)
        .map(|clause| clause.trim().to_string())
        .filter(|clause| !clause.is_empty())
        .collect()
}

fn leading_verb(clause: &str) -> Option<(IntentOperation, &str)> {
    let clause = clause.trim();

    for (verbs, operation) in [
        (RETRIEVAL_VERBS, IntentOperation::Retrieve),
        (INVOKE_VERBS, IntentOperation::Invoke),
        (ENTER_TEXT_VERBS, IntentOperation::EnterText),
    ] {
        for verb in verbs {
            let Some(head) = clause.get(..verb.len()) else {
                continue;
            };
            if !head.eq_ignore_ascii_case(verb) {
                continue;
            }
            let remainder = &clause[verb.len()..];
            if remainder.is_empty() || remainder.starts_with(char::is_whitespace) {
                return Some((operation, remainder.trim()));
            }
        }
    }

    None
}

fn split_scope(remainder: &str) -> (String, Option<String>) {
    let Some(found) = SCOPE_PREPOSITIONS.find(remainder) else {
        return (remainder.trim().to_string(), None);
    };

    let head = remainder[..found.start()].trim();
    let scope = remainder[found.end()..]
        .trim()
        .trim_matches(|c| TRAILING_PUNCTUATION.contains(&c));

    if scope.is_empty() || scope.split_whitespace().count() > MAX_TARGET_PHRASE_WORDS {
        return (remainder.trim().to_string(), None);
    }

    (head.to_string(), Some(scope.to_string()))
}

fn target_phrase(remainder: &str) -> Option<String> {
    let mut words: Vec<&str> = remainder
        .split_whitespace()
        .map(|word| word.trim_matches(|c| TRAILING_PUNCTUATION.contains(&c)))
        .filter(|word| !word.is_empty())
        .collect();

    while words
        .first()
        .is_some_and(|word| FILLER_PREFIXES.iter().any(|f| word.eq_ignore_ascii_case(f)))
    {
        words.remove(0);
    }

    while words
        .last()
        .is_some_and(|word| ELEMENT_NOUNS.iter().any(|n| word.eq_ignore_ascii_case(n)))
    {
        words.pop();
    }

    if words.is_empty() || words.len() > MAX_TARGET_PHRASE_WORDS {
        return None;
    }

    Some(words.join(" "))
}

fn first_url(utterance: &str) -> Option<String> {
    ABSOLUTE_URL.find(utterance).map(|found| {
        found
            .as_str()
            .trim_end_matches(|c| TRAILING_PUNCTUATION.contains(&c))
            .to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_invoke_utterance_yields_the_element_phrase_without_its_noun() {
        let intent = ActionIntent::parse("Click the Send button", None);

        assert_eq!(intent.operation, IntentOperation::Invoke);
        assert_eq!(intent.target_phrase.as_deref(), Some("Send"));
        assert!(intent.is_single_operation());
        assert_eq!(intent.web_url, None);
    }

    #[test]
    fn a_scope_preposition_names_the_application() {
        let intent = ActionIntent::parse("click the Send button in Slack", None);

        assert_eq!(intent.application.as_deref(), Some("Slack"));
        assert_eq!(intent.target_phrase.as_deref(), Some("Send"));
    }

    #[test]
    fn an_explicit_target_application_outranks_the_parsed_scope() {
        let intent = ActionIntent::parse("click Send in Slack", Some(String::from("Notes")));

        assert_eq!(intent.application.as_deref(), Some("Notes"));
    }

    #[test]
    fn a_multi_clause_utterance_is_not_a_single_operation() {
        let comma = ActionIntent::parse("open Slack, go to the general channel", None);
        assert!(!comma.is_single_operation());
        assert_eq!(comma.clauses, 2);

        let sequenced = ActionIntent::parse("open Slack then click the general channel", None);
        assert!(!sequenced.is_single_operation());

        let single = ActionIntent::parse("open Slack", None);
        assert!(single.is_single_operation());
    }

    #[test]
    fn a_retrieval_utterance_keeps_its_url() {
        let intent = ActionIntent::parse("read https://example.invalid/pricing.", None);

        assert_eq!(intent.operation, IntentOperation::Retrieve);
        assert_eq!(
            intent.web_url.as_deref(),
            Some("https://example.invalid/pricing")
        );
    }

    #[test]
    fn an_enter_text_verb_is_not_read_as_an_invocation() {
        let intent = ActionIntent::parse("type hello there", None);

        assert_eq!(intent.operation, IntentOperation::EnterText);
        assert_eq!(intent.target_phrase.as_deref(), Some("hello there"));
    }

    #[test]
    fn an_utterance_with_no_known_verb_resolves_nothing() {
        let intent = ActionIntent::parse("my screen looks wrong", None);

        assert_eq!(intent.operation, IntentOperation::Unresolved);
        assert_eq!(intent.target_phrase, None);
    }

    #[test]
    fn a_phrase_longer_than_the_cap_is_not_a_target() {
        let intent = ActionIntent::parse(
            "click whichever one of these seven similar looking controls is right",
            None,
        );

        assert_eq!(intent.target_phrase, None);
    }

    #[test]
    fn a_task_supplies_its_own_target_application() {
        let task = ComputerUseTask {
            description: String::from("click Send"),
            target_application: Some(String::from("Slack")),
            ..ComputerUseTask::default()
        };
        let intent = ActionIntent::from_task(&task);

        assert_eq!(intent.application.as_deref(), Some("Slack"));
        assert_eq!(intent.target_phrase.as_deref(), Some("Send"));
    }
}
