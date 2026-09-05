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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IntentOperation {
    Retrieve,
    Navigate,
    Invoke,
    EnterText,
    SelectOption,
    Toggle,
    Focus,
    Scroll,
    Read,
    Unresolved,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TargetRole {
    Button,
    Link,
    MenuItem,
    Tab,
    Checkbox,
    TextField,
    ListItem,
    ComboBox,
    Window,
    StaticText,
    ScrollArea,
}

const VERBS: &[(&str, IntentOperation)] = &[
    ("read", IntentOperation::Retrieve),
    ("show", IntentOperation::Retrieve),
    ("fetch", IntentOperation::Retrieve),
    ("download", IntentOperation::Retrieve),
    ("summarize", IntentOperation::Retrieve),
    ("click", IntentOperation::Invoke),
    ("press", IntentOperation::Invoke),
    ("tap", IntentOperation::Invoke),
    ("select", IntentOperation::Invoke),
    ("choose", IntentOperation::Invoke),
    ("open", IntentOperation::Invoke),
    ("activate", IntentOperation::Invoke),
    ("launch", IntentOperation::Invoke),
    ("type", IntentOperation::EnterText),
    ("enter", IntentOperation::EnterText),
    ("fill", IntentOperation::EnterText),
    ("toggle", IntentOperation::Toggle),
    ("flip", IntentOperation::Toggle),
    ("switch", IntentOperation::Toggle),
    ("focus", IntentOperation::Focus),
    ("switch to", IntentOperation::Focus),
    ("bring up", IntentOperation::Focus),
    ("scroll", IntentOperation::Scroll),
];

/// A retrieval verb with no URL beside it is a request to read a value back off
/// a control. Every other retrieval verb keeps its meaning, so an utterance the
/// parse cannot place stays out of the driven tiers instead of resolving to a
/// read of whatever happens to carry that label.
const READ_BACK_VERBS: &[&str] = &["read", "show"];

const ELEMENT_NOUNS: &[(&str, TargetRole)] = &[
    ("button", TargetRole::Button),
    ("icon", TargetRole::Button),
    ("link", TargetRole::Link),
    ("item", TargetRole::MenuItem),
    ("tab", TargetRole::Tab),
    ("checkbox", TargetRole::Checkbox),
    ("switch", TargetRole::Checkbox),
    ("toggle", TargetRole::Checkbox),
    ("field", TargetRole::TextField),
    ("box", TargetRole::TextField),
    ("input", TargetRole::TextField),
    ("row", TargetRole::ListItem),
    ("cell", TargetRole::ListItem),
    ("list", TargetRole::ListItem),
    ("dropdown", TargetRole::ComboBox),
    ("menu", TargetRole::ComboBox),
    ("window", TargetRole::Window),
    ("label", TargetRole::StaticText),
    ("value", TargetRole::StaticText),
    ("text", TargetRole::StaticText),
    ("region", TargetRole::ScrollArea),
    ("area", TargetRole::ScrollArea),
    ("pane", TargetRole::ScrollArea),
];

const FILLER_PREFIXES: &[&str] = &["the", "a", "an", "on", "onto", "to", "into", "in", "from"];
const VALUE_SEPARATOR_PATTERNS: &[&str] = &[r"\s+into\s+", r"\s+in\s+"];
const OPTION_SEPARATOR_PATTERNS: &[&str] = &[r"\s+from\s+"];
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
/// "the New Window menu item" names an item inside a menu, so two trailing
/// nouns come off. A third would start eating labels that are themselves
/// control words.
const MAX_TRAILING_ROLE_NOUNS: usize = 2;
const TRAILING_PUNCTUATION: &[char] = &['.', ',', ';', ':', '!', '?', ')', '\'', '"'];
const QUOTE_CHARACTERS: &[char] = &['\'', '"', '\u{201c}', '\u{2018}'];
const QUOTE_PAIRS: &[(char, char)] = &[
    ('\'', '\''),
    ('"', '"'),
    ('\u{201c}', '\u{201d}'),
    ('\u{2018}', '\u{2019}'),
];

fn alternation(patterns: &[&str]) -> Regex {
    Regex::new(&format!(
        "{CASE_INSENSITIVE_PREFIX}{}",
        patterns.join(ALTERNATION)
    ))
    .expect("action router regex")
}

static CLAUSE_SEPARATORS: Lazy<Regex> = Lazy::new(|| alternation(CLAUSE_SEPARATOR_PATTERNS));
static SCOPE_PREPOSITIONS: Lazy<Regex> = Lazy::new(|| alternation(SCOPE_PREPOSITION_PATTERNS));
static VALUE_SEPARATORS: Lazy<Regex> = Lazy::new(|| alternation(VALUE_SEPARATOR_PATTERNS));
static OPTION_SEPARATORS: Lazy<Regex> = Lazy::new(|| alternation(OPTION_SEPARATOR_PATTERNS));
static ABSOLUTE_URL: Lazy<Regex> =
    Lazy::new(|| Regex::new(URL_PATTERN_SOURCE).expect("action router regex: absolute url"));

/// Longest first, so a verb phrase is never shadowed by the shorter verb it
/// starts with: "switch to the inbox" focuses a window, "switch the alarm"
/// flips a control.
static VERBS_BY_LENGTH: Lazy<Vec<(&'static str, IntentOperation)>> = Lazy::new(|| {
    let mut verbs = VERBS.to_vec();
    verbs.sort_by(|left, right| right.0.len().cmp(&left.0.len()));
    verbs
});

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionIntent {
    pub utterance: String,
    pub operation: IntentOperation,
    pub web_url: Option<String>,
    pub application: Option<String>,
    pub target_phrase: Option<String>,
    pub target_role: Option<TargetRole>,
    pub value: Option<String>,
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

        let web_url = first_url(utterance);
        let Some((verb, operation, remainder)) = leading_verb(primary) else {
            return Self {
                utterance: utterance.to_string(),
                operation: IntentOperation::Unresolved,
                web_url,
                application,
                target_phrase: None,
                target_role: None,
                value: None,
                clauses: clauses.len().max(SINGLE_OPERATION_CLAUSES),
            };
        };

        let remainder = remainder.to_string();
        let (operation, value, remainder) =
            split_value(verb, operation, &remainder, web_url.is_some());
        let (remainder, scoped_application) = split_scope(&remainder);
        let (target_phrase, target_role) = target_phrase(&remainder);

        Self {
            utterance: utterance.to_string(),
            operation,
            web_url,
            application: application.or(scoped_application),
            target_phrase,
            target_role,
            value,
            clauses: clauses.len().max(SINGLE_OPERATION_CLAUSES),
        }
    }

    /// The intent a planner step addresses, or `None` when the step names no
    /// control a driver can resolve.
    ///
    /// A step already states its operation, so nothing here is inferred from
    /// wording: the lexical parse is reused for the target phrase alone, to
    /// read off the role noun the step named and drop it from the label the
    /// platform matches on. A step is one operation by construction, so it
    /// never carries the multi-clause decline an utterance can.
    pub fn from_planned_step(step: PlannedStepIntent<'_>) -> Option<Self> {
        let (target_phrase, target_role) = match step.verb {
            StepVerb::Navigate => (None, None),
            StepVerb::FocusWindow => (
                Some(non_empty(step.target?)?.to_string()),
                Some(TargetRole::Window),
            ),
            _ => {
                let (phrase, role) = target_phrase(step.target?);
                (Some(phrase?), role)
            }
        };

        let operation = match step.verb {
            StepVerb::Activate if target_role == Some(TargetRole::Checkbox) => {
                IntentOperation::Toggle
            }
            StepVerb::Activate if step.value.is_some() => IntentOperation::SelectOption,
            StepVerb::Activate => IntentOperation::Invoke,
            StepVerb::EnterText => IntentOperation::EnterText,
            StepVerb::Scroll => IntentOperation::Scroll,
            StepVerb::FocusWindow => IntentOperation::Focus,
            StepVerb::Read => IntentOperation::Read,
            StepVerb::Navigate => IntentOperation::Navigate,
        };

        let web_url = match step.verb {
            StepVerb::Navigate => Some(non_empty(step.url?)?.to_string()),
            _ => step.url.and_then(non_empty).map(str::to_string),
        };

        if operation == IntentOperation::EnterText && step.value.is_none() {
            return None;
        }

        Some(Self {
            utterance: step.label.to_string(),
            operation,
            web_url,
            application: step.application.and_then(non_empty).map(str::to_string),
            target_phrase,
            target_role,
            value: step.value.and_then(non_empty).map(str::to_string),
            clauses: SINGLE_OPERATION_CLAUSES,
        })
    }

    /// A tier below the visual loop drives one existing tool per action, so an
    /// utterance carrying several operations has to fall through rather than
    /// run its first clause and report the whole task done.
    pub fn is_single_operation(&self) -> bool {
        self.clauses == SINGLE_OPERATION_CLAUSES
    }
}

/// The operation a planner step states, as opposed to one parsed out of an
/// utterance. `Activate` covers the three verbs a press resolves to once the
/// role the step named is known: an invoke, a toggle of a checkbox, or a
/// selection out of a list.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StepVerb {
    Activate,
    EnterText,
    Scroll,
    FocusWindow,
    Read,
    Navigate,
}

pub struct PlannedStepIntent<'a> {
    pub verb: StepVerb,
    pub target: Option<&'a str>,
    pub value: Option<&'a str>,
    pub url: Option<&'a str>,
    pub application: Option<&'a str>,
    pub label: &'a str,
}

fn non_empty(raw: &str) -> Option<&str> {
    let trimmed = raw.trim();

    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn split_clauses(utterance: &str) -> Vec<String> {
    CLAUSE_SEPARATORS
        .split(utterance)
        .map(|clause| clause.trim().to_string())
        .filter(|clause| !clause.is_empty())
        .collect()
}

fn leading_verb(clause: &str) -> Option<(&'static str, IntentOperation, &str)> {
    let clause = clause.trim();

    for (verb, operation) in VERBS_BY_LENGTH.iter() {
        let Some(head) = clause.get(..verb.len()) else {
            continue;
        };
        if !head.eq_ignore_ascii_case(verb) {
            continue;
        }
        let remainder = &clause[verb.len()..];
        if remainder.is_empty() || remainder.starts_with(char::is_whitespace) {
            return Some((verb, *operation, remainder.trim()));
        }
    }

    None
}

/// Splits the literal an utterance carries from the control it names, and
/// settles the operations a bare verb cannot: a retrieval with no URL reads a
/// value back, an invocation of a URL navigates, and an invocation naming a
/// source picks an option out of it.
fn split_value(
    verb: &str,
    operation: IntentOperation,
    remainder: &str,
    has_web_url: bool,
) -> (IntentOperation, Option<String>, String) {
    match operation {
        IntentOperation::EnterText => {
            let (value, target) = split_literal(remainder, &VALUE_SEPARATORS);
            (operation, value, target)
        }
        IntentOperation::Invoke if has_web_url => {
            (IntentOperation::Navigate, None, String::new())
        }
        IntentOperation::Invoke => match split_literal_at(remainder, &OPTION_SEPARATORS) {
            Some((value, target)) => (IntentOperation::SelectOption, Some(value), target),
            None => (operation, None, remainder.to_string()),
        },
        IntentOperation::Retrieve
            if !has_web_url
                && READ_BACK_VERBS
                    .iter()
                    .any(|candidate| candidate.eq_ignore_ascii_case(verb)) =>
        {
            (IntentOperation::Read, None, remainder.to_string())
        }
        _ => (operation, None, remainder.to_string()),
    }
}

fn split_literal(remainder: &str, separators: &Regex) -> (Option<String>, String) {
    if let Some((quoted, rest)) = quoted_prefix(remainder) {
        return (Some(quoted), rest.to_string());
    }

    match split_literal_at(remainder, separators) {
        Some((value, target)) => (Some(value), target),
        None => (trimmed_value(remainder), String::new()),
    }
}

fn split_literal_at(remainder: &str, separators: &Regex) -> Option<(String, String)> {
    let found = separators.find(remainder)?;
    let value = trimmed_value(&remainder[..found.start()])?;
    let target = remainder[found.end()..].trim().to_string();

    if target.is_empty() {
        return None;
    }

    Some((value, target))
}

fn quoted_prefix(remainder: &str) -> Option<(String, &str)> {
    let trimmed = remainder.trim_start();
    let opening = trimmed.chars().next()?;

    if !QUOTE_CHARACTERS.contains(&opening) {
        return None;
    }

    let closing = QUOTE_PAIRS
        .iter()
        .find(|(open, _)| *open == opening)
        .map(|(_, close)| *close)?;
    let body = &trimmed[opening.len_utf8()..];
    let end = body.find(closing)?;

    Some((body[..end].to_string(), &body[end + closing.len_utf8()..]))
}

fn trimmed_value(raw: &str) -> Option<String> {
    let value = raw.trim().trim_matches(|c| TRAILING_PUNCTUATION.contains(&c));

    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
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

/// The noun an utterance ends on is the role the user named, so it is read off
/// before it is dropped from the phrase. The innermost noun wins: "the New Tab
/// menu item" names an item, not a menu.
fn target_phrase(remainder: &str) -> (Option<String>, Option<TargetRole>) {
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

    let mut role = None;
    for _ in 0..MAX_TRAILING_ROLE_NOUNS {
        if words.len() <= 1 {
            break;
        }
        let Some(last) = words.last() else {
            break;
        };
        let Some((_, noun_role)) = ELEMENT_NOUNS
            .iter()
            .find(|(noun, _)| last.eq_ignore_ascii_case(noun))
        else {
            break;
        };
        role.get_or_insert(*noun_role);
        words.pop();
    }

    if words.is_empty() || words.len() > MAX_TARGET_PHRASE_WORDS {
        return (None, role);
    }

    (Some(words.join(" ")), role)
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
        assert_eq!(intent.target_role, Some(TargetRole::Button));
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
        let intent = ActionIntent::parse("fetch https://example.invalid/pricing.", None);

        assert_eq!(intent.operation, IntentOperation::Retrieve);
        assert_eq!(
            intent.web_url.as_deref(),
            Some("https://example.invalid/pricing")
        );
    }

    #[test]
    fn opening_a_url_is_a_navigation_rather_than_an_invocation() {
        let intent = ActionIntent::parse("open https://example.invalid/inbox", None);

        assert_eq!(intent.operation, IntentOperation::Navigate);
        assert_eq!(
            intent.web_url.as_deref(),
            Some("https://example.invalid/inbox")
        );
    }

    #[test]
    fn an_enter_text_verb_carries_its_literal_and_its_field() {
        let intent = ActionIntent::parse("type hello there into the Search field", None);

        assert_eq!(intent.operation, IntentOperation::EnterText);
        assert_eq!(intent.value.as_deref(), Some("hello there"));
        assert_eq!(intent.target_phrase.as_deref(), Some("Search"));
        assert_eq!(intent.target_role, Some(TargetRole::TextField));
    }

    #[test]
    fn a_quoted_literal_survives_the_prepositions_inside_it() {
        let intent = ActionIntent::parse(
            "type \"meet me in the lobby\" into the Message box",
            None,
        );

        assert_eq!(intent.value.as_deref(), Some("meet me in the lobby"));
        assert_eq!(intent.target_phrase.as_deref(), Some("Message"));
    }

    #[test]
    fn an_enter_text_utterance_naming_an_application_keeps_both() {
        let intent = ActionIntent::parse("type hello into the Search field in Slack", None);

        assert_eq!(intent.value.as_deref(), Some("hello"));
        assert_eq!(intent.target_phrase.as_deref(), Some("Search"));
        assert_eq!(intent.application.as_deref(), Some("Slack"));
    }

    #[test]
    fn an_enter_text_verb_with_no_field_names_no_target() {
        let intent = ActionIntent::parse("type hello there", None);

        assert_eq!(intent.operation, IntentOperation::EnterText);
        assert_eq!(intent.value.as_deref(), Some("hello there"));
        assert_eq!(intent.target_phrase, None);
    }

    #[test]
    fn choosing_a_value_out_of_a_control_is_a_select_option() {
        let intent = ActionIntent::parse("select Weekly from the Frequency dropdown", None);

        assert_eq!(intent.operation, IntentOperation::SelectOption);
        assert_eq!(intent.value.as_deref(), Some("Weekly"));
        assert_eq!(intent.target_phrase.as_deref(), Some("Frequency"));
        assert_eq!(intent.target_role, Some(TargetRole::ComboBox));
    }

    #[test]
    fn selecting_a_menu_item_stays_an_invocation() {
        let intent = ActionIntent::parse("select the New Window menu item", None);

        assert_eq!(intent.operation, IntentOperation::Invoke);
        assert_eq!(intent.target_phrase.as_deref(), Some("New Window"));
        assert_eq!(intent.target_role, Some(TargetRole::MenuItem));
    }

    #[test]
    fn a_flip_verb_is_a_toggle_and_a_switch_to_is_a_focus() {
        let toggle = ActionIntent::parse("toggle the Do Not Disturb switch", None);
        assert_eq!(toggle.operation, IntentOperation::Toggle);
        assert_eq!(toggle.target_phrase.as_deref(), Some("Do Not Disturb"));
        assert_eq!(toggle.target_role, Some(TargetRole::Checkbox));

        let focus = ActionIntent::parse("switch to the Notes window", None);
        assert_eq!(focus.operation, IntentOperation::Focus);
        assert_eq!(focus.target_phrase.as_deref(), Some("Notes"));
        assert_eq!(focus.target_role, Some(TargetRole::Window));
    }

    #[test]
    fn a_directional_check_verb_is_not_read_as_a_flip() {
        let intent = ActionIntent::parse("check the Remember Me box", None);

        assert_eq!(intent.operation, IntentOperation::Unresolved);
    }

    #[test]
    fn scrolling_a_named_region_keeps_its_role() {
        let intent = ActionIntent::parse("scroll the Messages list", None);

        assert_eq!(intent.operation, IntentOperation::Scroll);
        assert_eq!(intent.target_phrase.as_deref(), Some("Messages"));
        assert_eq!(intent.target_role, Some(TargetRole::ListItem));
    }

    #[test]
    fn reading_a_named_value_back_is_not_a_url_retrieval() {
        let intent = ActionIntent::parse("read the Total field", None);

        assert_eq!(intent.operation, IntentOperation::Read);
        assert_eq!(intent.target_phrase.as_deref(), Some("Total"));
        assert_eq!(intent.web_url, None);
    }

    #[test]
    fn a_retrieval_verb_that_is_not_a_read_back_stays_a_retrieval() {
        let intent = ActionIntent::parse("download the quarterly report", None);

        assert_eq!(intent.operation, IntentOperation::Retrieve);
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
