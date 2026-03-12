use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
                format!("document.querySelector('[data-testid=\"{}\"]')", id)
            }
            SelectorStrategy::AriaLabel(label) => {
                format!("document.querySelector('[aria-label=\"{}\"]')", label)
            }
            SelectorStrategy::Role(role, name) => {
                format!(
                    r#"Array.from(document.querySelectorAll('[role="{}"]')).find(el => el.textContent.includes('{}'))"#,
                    role, name
                )
            }
            SelectorStrategy::Text(text) => {
                format!(
                    r#"Array.from(document.querySelectorAll('*')).find(el => el.textContent.trim() === '{}')"#,
                    text
                )
            }
            SelectorStrategy::Placeholder(placeholder) => {
                format!(
                    "document.querySelector('[placeholder=\"{}\"]')",
                    placeholder
                )
            }
            SelectorStrategy::Css(selector) => {
                format!("document.querySelector('{}')", selector)
            }
            SelectorStrategy::XPath(xpath) => {
                format!(
                    "document.evaluate('{}', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue",
                    xpath
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

    pub fn with_strategy(mut self, strategy: SelectorStrategy) -> Self {
        self.strategies.push(strategy);

        self.strategies.sort_by_key(|s| s.priority());
        self
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

impl ElementType {
    pub fn from_role(role: &str) -> Self {
        match role.to_lowercase().as_str() {
            "button" => ElementType::Button,
            "link" => ElementType::Link,
            "textbox" => ElementType::Textbox,
            "checkbox" => ElementType::Checkbox,
            "radio" => ElementType::Radio,
            "combobox" | "listbox" => ElementType::Select,
            "img" => ElementType::Image,
            _ => ElementType::Other(role.to_string()),
        }
    }
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
pub struct AccessibilityNode {
    pub role: String,
    pub name: String,
    pub description: Option<String>,
    pub value: Option<String>,
    pub selector: String,
    pub children: Vec<AccessibilityNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessibilityTree {
    pub root: AccessibilityNode,
}

pub struct AccessibilityAnalyzer;

impl AccessibilityAnalyzer {
    pub fn get_accessibility_tree_script() -> &'static str {
        r#"
        (function() {
            function buildA11yTree(element, depth = 0) {
                if (depth > 10) return null;

                const role = element.getAttribute('role') || element.tagName.toLowerCase();
                const ariaLabel = element.getAttribute('aria-label');
                const ariaDescribedBy = element.getAttribute('aria-describedby');
                const name = ariaLabel || element.textContent?.trim().substring(0, 50) || '';
                const value = element.value || element.getAttribute('aria-valuenow');

                let description = null;
                if (ariaDescribedBy) {
                    const descElement = document.getElementById(ariaDescribedBy);
                    description = descElement?.textContent?.trim();
                }


                let selector = '';
                if (element.id) {
                    selector = `#${element.id}`;
                } else if (element.className) {
                    selector = `.${element.className.split(' ')[0]}`;
                } else {
                    selector = element.tagName.toLowerCase();
                }

                const node = {
                    role,
                    name,
                    description,
                    value,
                    selector,
                    children: []
                };


                const interactiveRoles = ['button', 'link', 'textbox', 'checkbox', 'radio',
                                          'combobox', 'listbox', 'menu', 'menuitem', 'tab'];
                const semanticTags = ['a', 'button', 'input', 'select', 'textarea', 'form'];

                if (interactiveRoles.includes(role) || semanticTags.includes(element.tagName.toLowerCase())) {
                    for (let child of element.children) {
                        const childNode = buildA11yTree(child, depth + 1);
                        if (childNode) node.children.push(childNode);
                    }
                }

                return node;
            }

            return {
                root: buildA11yTree(document.body)
            };
        })()
        "#
    }

    pub fn find_by_role_script(role: &str, name: Option<&str>) -> String {
        if let Some(name) = name {
            format!(
                r#"
                Array.from(document.querySelectorAll('[role="{}"]'))
                    .filter(el => el.textContent.includes('{}'))
                    .map(el => ({{
                        role: el.getAttribute('role'),
                        name: el.textContent.trim(),
                        selector: el.id ? `#${{el.id}}` : el.className ? `.${{el.className.split(' ')[0]}}` : el.tagName.toLowerCase()
                    }}))
                "#,
                role, name
            )
        } else {
            format!(
                r#"
                Array.from(document.querySelectorAll('[role="{}"]'))
                    .map(el => ({{
                        role: el.getAttribute('role'),
                        name: el.textContent.trim(),
                        selector: el.id ? `#${{el.id}}` : el.className ? `.${{el.className.split(' ')[0]}}` : el.tagName.toLowerCase()
                    }}))
                "#,
                role
            )
        }
    }

    pub fn get_interactive_elements_script() -> &'static str {
        r#"
        Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"]'))
            .map(el => ({
                role: el.getAttribute('role') || el.tagName.toLowerCase(),
                name: el.getAttribute('aria-label') || el.textContent?.trim() || '',
                description: el.getAttribute('aria-describedby') ? document.getElementById(el.getAttribute('aria-describedby'))?.textContent?.trim() : null,
                value: el.value || el.getAttribute('aria-valuenow'),
                selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase()
            }))
        "#
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

    pub fn add_element(&mut self, element: SemanticElement) {
        self.elements.push(element);
    }

    pub fn add_relationship(&mut self, relationship: ElementRelationship) {
        self.relationships.push(relationship);
    }

    pub fn build_graph_script() -> &'static str {
        r#"
        (function() {
            const elements = [];
            const relationships = [];


            const selector = 'button, a, input, select, textarea, form, [role], [aria-label]';
            const nodes = document.querySelectorAll(selector);

            nodes.forEach((el, index) => {
                const id = el.id || `element-${index}`;
                const role = el.getAttribute('role') || el.tagName.toLowerCase();
                const label = el.getAttribute('aria-label');
                const text = el.textContent?.trim().substring(0, 100);


                const attributes = {};
                for (let attr of el.attributes) {
                    attributes[attr.name] = attr.value;
                }


                const selectors = [];
                if (el.getAttribute('data-testid')) {
                    selectors.push({ DataTestId: el.getAttribute('data-testid') });
                }
                if (el.getAttribute('aria-label')) {
                    selectors.push({ AriaLabel: el.getAttribute('aria-label') });
                }
                if (el.id) {
                    selectors.push({ Css: `#${el.id}` });
                }

                elements.push({
                    id,
                    role,
                    label,
                    text,
                    attributes,
                    selectors
                });


                const labelFor = el.getAttribute('aria-labelledby');
                if (labelFor) {
                    relationships.push({ LabelFor: [labelFor, id] });
                }

                const describedBy = el.getAttribute('aria-describedby');
                if (describedBy) {
                    relationships.push({ DescribedBy: [describedBy, id] });
                }
            });

            return { elements, relationships };
        })()
        "#
    }
}

impl Default for DOMSemanticGraph {
    fn default() -> Self {
        Self::new()
    }
}

pub struct SelfHealingFinder;

impl SelfHealingFinder {
    pub fn find_with_healing(selector: &SemanticSelector) -> String {
        let mut attempts = String::from("(function() {\n");
        attempts.push_str("  let element = null;\n");
        attempts.push_str("  let strategy = null;\n\n");

        for (idx, strat) in selector.strategies.iter().enumerate() {
            attempts.push_str(&format!("  // Strategy {}: {:?}\n", idx, strat));
            attempts.push_str("  if (!element) {\n");
            attempts.push_str("    try {\n");
            attempts.push_str(&format!(
                "      element = {};\n",
                strat.to_selector_script()
            ));
            attempts.push_str(&format!("      if (element) strategy = \"{:?}\";\n", strat));
            attempts.push_str("    } catch (e) {}\n");
            attempts.push_str("  }\n\n");
        }

        attempts.push_str("  return { element, strategy };\n");
        attempts.push_str("})()");

        attempts
    }

    pub fn llm_fallback_prompt(query: &str, a11y_tree: &AccessibilityTree) -> String {
        format!(
            r#"Find the element matching: '{}'

Accessibility tree:
{}

Return a JSON object with the best selector strategy to find this element.
Format: {{"strategy": "css"|"xpath"|"text", "value": "..."}}"#,
            query,
            serde_json::to_string_pretty(a11y_tree).unwrap_or_default()
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticElementInfo {
    pub selector: String,
    pub strategy: String,
    pub role: Option<String>,
    pub name: Option<String>,
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectorResult {
    pub strategy: SelectorStrategy,
    pub found: bool,
    pub element_info: Option<SemanticElementInfo>,
    pub error: Option<String>,
}

pub struct SemanticElementFinder;

impl SemanticElementFinder {
    pub fn from_natural_language(query: &str) -> SemanticSelector {
        SemanticSelector::new(query).generate_strategies()
    }

    pub fn builder(query: &str) -> SemanticSelector {
        SemanticSelector::new(query)
    }

    pub fn parse_query(query: &str) -> SemanticQuery {
        NaturalLanguageParser::parse(query)
    }

    pub fn find_element_script(selector: &SemanticSelector) -> String {
        SelfHealingFinder::find_with_healing(selector)
    }

    pub fn test_strategies_script(selector: &SemanticSelector) -> String {
        let mut script = String::from("(function() {\n");
        script.push_str("  const results = [];\n\n");

        for strat in &selector.strategies {
            script.push_str(&format!("  // Testing strategy: {:?}\n", strat));
            script.push_str("  try {\n");
            script.push_str(&format!("    const el = {};\n", strat.to_selector_script()));
            script.push_str("    results.push({\n");
            script.push_str(&format!("      strategy: \"{:?}\",\n", strat));
            script.push_str("      found: !!el,\n");
            script.push_str("      element_info: el ? {\n");
            script.push_str("        selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),\n");
            script.push_str("        role: el.getAttribute('role'),\n");
            script.push_str(
                "        name: el.getAttribute('aria-label') || el.textContent?.trim(),\n",
            );
            script.push_str("        text: el.textContent?.trim()\n");
            script.push_str("      } : null,\n");
            script.push_str("      error: null\n");
            script.push_str("    });\n");
            script.push_str("  } catch (e) {\n");
            script.push_str("    results.push({\n");
            script.push_str(&format!("      strategy: \"{:?}\",\n", strat));
            script.push_str("      found: false,\n");
            script.push_str("      element_info: null,\n");
            script.push_str("      error: e.message\n");
            script.push_str("    });\n");
            script.push_str("  }\n\n");
        }

        script.push_str("  return results;\n");
        script.push_str("})()");

        script
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
}
