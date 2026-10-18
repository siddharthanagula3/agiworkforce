use serde::{Deserialize, Serialize};
use std::collections::HashMap;

fn escape_script_value(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SelectorStrategy {
    DataTestId(String),

    AriaLabel(String),

    Role(String, String),

    Text(String),

    Placeholder(String),

    Css(String),

    XPath(String),
}

impl SelectorStrategy {
    pub fn priority(&self) -> u8 {
        match self {
            SelectorStrategy::DataTestId(_) => 1,
            SelectorStrategy::AriaLabel(_) => 2,
            SelectorStrategy::Role(_, _) => 3,
            SelectorStrategy::Text(_) => 4,
            SelectorStrategy::Placeholder(_) => 5,
            SelectorStrategy::Css(_) => 6,
            SelectorStrategy::XPath(_) => 7,
        }
    }

    pub fn to_selector_script(&self) -> String {
        match self {
            SelectorStrategy::DataTestId(id) => {
                format!(
                    "document.querySelector('[data-testid=\"{}\"]')",
                    escape_script_value(id)
                )
            }
            SelectorStrategy::AriaLabel(label) => {
                format!(
                    "document.querySelector('[aria-label=\"{}\"]')",
                    escape_script_value(label)
                )
            }
            SelectorStrategy::Role(role, name) => {
                format!(
                    r#"Array.from(document.querySelectorAll('[role="{}"]')).find(el => el.textContent.includes('{}'))"#,
                    escape_script_value(role),
                    escape_script_value(name)
                )
            }
            SelectorStrategy::Text(text) => {
                format!(
                    r#"Array.from(document.querySelectorAll('*')).find(el => el.textContent.trim() === '{}')"#,
                    escape_script_value(text)
                )
            }
            SelectorStrategy::Placeholder(placeholder) => {
                format!(
                    "document.querySelector('[placeholder=\"{}\"]')",
                    escape_script_value(placeholder)
                )
            }
            SelectorStrategy::Css(selector) => {
                format!(
                    "document.querySelector('{}')",
                    escape_script_value(selector)
                )
            }
            SelectorStrategy::XPath(xpath) => {
                format!(
                    "document.evaluate('{}', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue",
                    escape_script_value(xpath)
                )
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticSelector {
    pub natural_language: String,

    pub strategies: Vec<SelectorStrategy>,

    pub context: Option<String>,
}

impl SemanticSelector {
    pub fn new(natural_language: impl Into<String>) -> Self {
        Self {
            natural_language: natural_language.into(),
            strategies: Vec::new(),
            context: None,
        }
    }

    pub fn with_context(mut self, context: impl Into<String>) -> Self {
        self.context = Some(context.into());
        self
    }

    pub fn generate_strategies(mut self) -> Self {
        let nl_lower = self.natural_language.to_lowercase();

        let element_type = Self::extract_element_type(&nl_lower);
        let keywords = Self::extract_keywords(&nl_lower);

        for keyword in &keywords {
            self.strategies.push(SelectorStrategy::DataTestId(
                keyword.replace(' ', "-").to_lowercase(),
            ));
            self.strategies.push(SelectorStrategy::DataTestId(
                keyword.replace(' ', "_").to_lowercase(),
            ));

            self.strategies
                .push(SelectorStrategy::AriaLabel(keyword.clone()));

            if let Some(ref elem_type) = element_type {
                self.strategies
                    .push(SelectorStrategy::Role(elem_type.clone(), keyword.clone()));
            }

            self.strategies
                .push(SelectorStrategy::Text(keyword.clone()));

            if element_type.as_deref() == Some("input")
                || element_type.as_deref() == Some("textbox")
            {
                self.strategies
                    .push(SelectorStrategy::Placeholder(keyword.clone()));
            }
        }

        if let Some(elem_type) = element_type {
            for keyword in &keywords {
                match elem_type.as_str() {
                    "button" => {
                        // :contains() is not valid CSS in modern browsers; use XPath instead
                        let xpath = format!(
                            "//button[contains(text(),'{}')]",
                            keyword.replace('\'', "\\'")
                        );
                        self.strategies.push(SelectorStrategy::XPath(xpath));
                    }
                    "link" => {
                        let xpath =
                            format!("//a[contains(text(),'{}')]", keyword.replace('\'', "\\'"));
                        self.strategies.push(SelectorStrategy::XPath(xpath));
                    }
                    "input" => {
                        let css = format!("input[name*='{}']", keyword.replace(' ', ""));
                        self.strategies.push(SelectorStrategy::Css(css));
                    }
                    "textbox" => {
                        self.strategies
                            .push(SelectorStrategy::Css("input[type='text']".to_string()));
                    }
                    _ => {
                        // Use XPath for text-based matching instead of invalid :contains()
                        let xpath = format!(
                            "//{}[contains(text(),'{}')]",
                            elem_type,
                            keyword.replace('\'', "\\'")
                        );
                        self.strategies.push(SelectorStrategy::XPath(xpath));
                    }
                };
            }
        }

        self.strategies.sort_by_key(|s| s.priority());
        self.strategies.dedup_by(|a, b| a == b);

        self
    }

    fn extract_element_type(text: &str) -> Option<String> {
        if text.contains("button") {
            Some("button".to_string())
        } else if text.contains("link") {
            Some("a".to_string())
        } else if text.contains("input") || text.contains("field") {
            Some("input".to_string())
        } else if text.contains("textbox") {
            Some("textbox".to_string())
        } else if text.contains("checkbox") {
            Some("checkbox".to_string())
        } else if text.contains("radio") {
            Some("radio".to_string())
        } else if text.contains("select") || text.contains("dropdown") {
            Some("select".to_string())
        } else {
            None
        }
    }

    fn extract_keywords(text: &str) -> Vec<String> {
        let mut keywords = Vec::new();

        let stop_words = [
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        ];
        let words: Vec<&str> = text.split_whitespace().collect();

        let filtered: Vec<&str> = words
            .iter()
            .filter(|w| !stop_words.contains(&w.to_lowercase().as_str()))
            .copied()
            .collect();

        if filtered.len() >= 2 {
            keywords.push(filtered.join(" "));
        }

        for word in filtered {
            if word.len() > 2 {
                keywords.push(word.to_string());
            }
        }

        keywords
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ElementType {
    Button,
    Link,
    Input,
    Textbox,
    Checkbox,
    Radio,
    Select,
    Image,
    Text,
    Container,
    Other(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Modifier {
    First,
    Last,
    Visible,
    Enabled,
    Index(usize),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticQuery {
    pub element_type: Option<ElementType>,
    pub keywords: Vec<String>,
    pub modifiers: Vec<Modifier>,
}

pub struct NaturalLanguageParser;

impl NaturalLanguageParser {
    pub fn parse(query: &str) -> SemanticQuery {
        let query_lower = query.to_lowercase();

        let element_type = if query_lower.contains("button") {
            Some(ElementType::Button)
        } else if query_lower.contains("link") {
            Some(ElementType::Link)
        } else if query_lower.contains("input") || query_lower.contains("field") {
            Some(ElementType::Input)
        } else if query_lower.contains("textbox") {
            Some(ElementType::Textbox)
        } else if query_lower.contains("checkbox") {
            Some(ElementType::Checkbox)
        } else if query_lower.contains("radio") {
            Some(ElementType::Radio)
        } else if query_lower.contains("dropdown") || query_lower.contains("select") {
            Some(ElementType::Select)
        } else {
            None
        };

        let mut modifiers = Vec::new();
        if query_lower.contains("first") {
            modifiers.push(Modifier::First);
        }
        if query_lower.contains("last") {
            modifiers.push(Modifier::Last);
        }
        if query_lower.contains("visible") {
            modifiers.push(Modifier::Visible);
        }
        if query_lower.contains("enabled") {
            modifiers.push(Modifier::Enabled);
        }

        let stop_words = [
            "the", "a", "an", "button", "link", "input", "field", "textbox", "checkbox", "radio",
            "dropdown", "select", "first", "last", "visible", "enabled",
        ];
        let keywords: Vec<String> = query
            .split_whitespace()
            .filter(|w| !stop_words.contains(&w.to_lowercase().as_str()))
            .map(|w| w.to_string())
            .collect();

        SemanticQuery {
            element_type,
            keywords,
            modifiers,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticElement {
    pub id: String,
    pub role: String,
    pub label: Option<String>,
    pub text: Option<String>,
    pub attributes: HashMap<String, String>,
    pub selectors: Vec<SelectorStrategy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ElementRelationship {
    Parent(String, String),
    LabelFor(String, String),
    DescribedBy(String, String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DOMSemanticGraph {
    pub elements: Vec<SemanticElement>,
    pub relationships: Vec<ElementRelationship>,
}

impl DOMSemanticGraph {
    pub fn new() -> Self {
        Self {
            elements: Vec::new(),
            relationships: Vec::new(),
        }
    }
}

impl Default for DOMSemanticGraph {
    fn default() -> Self {
        Self::new()
    }
}

pub struct SelfHealingFinder;

impl SelfHealingFinder {
}

pub struct SemanticElementFinder;

impl SemanticElementFinder {
    pub fn from_natural_language(query: &str) -> SemanticSelector {
        SemanticSelector::new(query).generate_strategies()
    }

    pub fn builder(query: &str) -> SemanticSelector {
        SemanticSelector::new(query)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_selector_priority() {
        assert_eq!(SelectorStrategy::DataTestId("test".into()).priority(), 1);
        assert_eq!(SelectorStrategy::AriaLabel("test".into()).priority(), 2);
        assert_eq!(SelectorStrategy::XPath("//div".into()).priority(), 7);
    }

    #[test]
    fn test_natural_language_parser() {
        let query = NaturalLanguageParser::parse("the login button");
        assert_eq!(query.element_type, Some(ElementType::Button));
        assert!(query.keywords.contains(&"login".to_string()));
    }

    #[test]
    fn test_semantic_selector_generation() {
        let selector = SemanticElementFinder::from_natural_language("the email input field");
        assert!(!selector.strategies.is_empty());
        assert_eq!(selector.natural_language, "the email input field");
    }

    #[test]
    fn test_selector_strategy_script() {
        let strat = SelectorStrategy::DataTestId("login-btn".into());
        let script = strat.to_selector_script();
        assert!(script.contains("data-testid"));
        assert!(script.contains("login-btn"));
    }

    #[test]
    fn selector_scripts_escape_single_quotes() {
        let strat = SelectorStrategy::Text("user's profile".into());
        let script = strat.to_selector_script();
        assert!(script.contains("user\\'s profile"));
    }

    #[test]
    fn selector_scripts_escape_double_quotes_in_attribute_contexts() {
        let strat = SelectorStrategy::DataTestId("test\"quote".into());
        let script = strat.to_selector_script();
        assert!(script.contains("test\\\"quote"));
    }
}
