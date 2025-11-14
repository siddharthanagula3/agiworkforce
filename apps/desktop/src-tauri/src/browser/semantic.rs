use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Selector strategy with priority ordering
/// Priority 1 (highest) to 7 (lowest)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SelectorStrategy {
    /// Priority 1: data-testid attribute
    DataTestId(String),
    /// Priority 2: aria-label
    AriaLabel(String),
    /// Priority 3: role + accessible name
    Role(String, String), // (role, name)
    /// Priority 4: visible text content
    Text(String),
    /// Priority 5: placeholder attribute
    Placeholder(String),
    /// Priority 6: CSS selector
    Css(String),
    /// Priority 7: XPath (last resort)
    XPath(String),
}

impl SelectorStrategy {
    /// Get priority order (1 = highest, 7 = lowest)
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

    /// Convert to a selector string for browser evaluation
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
                format!("document.querySelector('[placeholder=\"{}\"]')", placeholder)
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

/// Semantic selector with multiple fallback strategies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticSelector {
    /// Natural language description
    pub natural_language: String,
    /// Ordered list of selector strategies (sorted by priority)
    pub strategies: Vec<SelectorStrategy>,
    /// Optional parent element context
    pub context: Option<String>,
}

impl SemanticSelector {
    /// Create a new semantic selector
    pub fn new(natural_language: impl Into<String>) -> Self {
        Self {
            natural_language: natural_language.into(),
            strategies: Vec::new(),
            context: None,
        }
    }

    /// Add a selector strategy
    pub fn with_strategy(mut self, strategy: SelectorStrategy) -> Self {
        self.strategies.push(strategy);
        // Keep strategies sorted by priority
        self.strategies.sort_by_key(|s| s.priority());
        self
    }

    /// Set the parent context
    pub fn with_context(mut self, context: impl Into<String>) -> Self {
        self.context = Some(context.into());
        self
    }

    /// Generate selector strategies from natural language
    pub fn generate_strategies(mut self) -> Self {
        let nl_lower = self.natural_language.to_lowercase();

        // Extract element type and keywords
        let element_type = Self::extract_element_type(&nl_lower);
        let keywords = Self::extract_keywords(&nl_lower);

        // Generate strategies based on element type and keywords
        for keyword in &keywords {
            // Try data-testid variations
            self.strategies.push(SelectorStrategy::DataTestId(
                keyword.replace(' ', "-").to_lowercase(),
            ));
            self.strategies.push(SelectorStrategy::DataTestId(
                keyword.replace(' ', "_").to_lowercase(),
            ));

            // Try aria-label
            self.strategies.push(SelectorStrategy::AriaLabel(keyword.clone()));

            // Try role + name combinations
            if let Some(ref elem_type) = element_type {
                self.strategies.push(SelectorStrategy::Role(
                    elem_type.clone(),
                    keyword.clone(),
                ));
            }

            // Try text content
            self.strategies.push(SelectorStrategy::Text(keyword.clone()));

            // Try placeholder
            if element_type.as_deref() == Some("input") || element_type.as_deref() == Some("textbox") {
                self.strategies.push(SelectorStrategy::Placeholder(keyword.clone()));
            }
        }

        // Generate CSS selectors based on element type
        if let Some(elem_type) = element_type {
            for keyword in &keywords {
                let css = match elem_type.as_str() {
                    "button" => format!("button:contains('{}')", keyword),
                    "link" => format!("a:contains('{}')", keyword),
                    "input" => format!("input[name*='{}']", keyword.replace(' ', "")),
                    "textbox" => "input[type='text']".to_string(),
                    _ => format!("{}:contains('{}')", elem_type, keyword),
                };
                self.strategies.push(SelectorStrategy::Css(css));
            }
        }

        // Sort by priority
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

        // Remove common words
        let stop_words = ["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for"];
        let words: Vec<&str> = text.split_whitespace().collect();

        // Extract meaningful phrases
        let filtered: Vec<&str> = words
            .iter()
            .filter(|w| !stop_words.contains(&w.to_lowercase().as_str()))
            .copied()
            .collect();

        // Add multi-word phrases
        if filtered.len() >= 2 {
            keywords.push(filtered.join(" "));
        }

        // Add individual words
        for word in filtered {
            if word.len() > 2 {
                keywords.push(word.to_string());
            }
        }

        keywords
    }
}

/// Element type classification
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

/// Modifier for semantic queries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Modifier {
    First,
    Last,
    Visible,
    Enabled,
    Index(usize),
}

/// Semantic query parsed from natural language
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticQuery {
    pub element_type: Option<ElementType>,
    pub keywords: Vec<String>,
    pub modifiers: Vec<Modifier>,
}

/// Natural language parser for semantic selectors
pub struct NaturalLanguageParser;

impl NaturalLanguageParser {
    /// Parse natural language query into semantic query
    pub fn parse(query: &str) -> SemanticQuery {
        let query_lower = query.to_lowercase();

        // Extract element type
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

        // Extract modifiers
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

        // Extract keywords (remove element type and modifier words)
        let stop_words = ["the", "a", "an", "button", "link", "input", "field", "textbox",
                         "checkbox", "radio", "dropdown", "select", "first", "last",
                         "visible", "enabled"];
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

/// Accessibility tree node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessibilityNode {
    pub role: String,
    pub name: String,
    pub description: Option<String>,
    pub value: Option<String>,
    pub selector: String,
    pub children: Vec<AccessibilityNode>,
}

/// Accessibility tree representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessibilityTree {
    pub root: AccessibilityNode,
}

/// Accessibility analyzer for DOM inspection
pub struct AccessibilityAnalyzer;

impl AccessibilityAnalyzer {
    /// Get the accessibility tree script
    pub fn get_accessibility_tree_script() -> &'static str {
        r#"
        (function() {
            function buildA11yTree(element, depth = 0) {
                if (depth > 10) return null; // Prevent infinite recursion

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

                // Generate selector
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

                // Only traverse interactive or semantic elements
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

    /// Get script to find elements by role
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

    /// Get script to find all interactive elements
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

/// Semantic element in DOM graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticElement {
    pub id: String,
    pub role: String,
    pub label: Option<String>,
    pub text: Option<String>,
    pub attributes: HashMap<String, String>,
    pub selectors: Vec<SelectorStrategy>,
}

/// Element relationship types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ElementRelationship {
    Parent(String, String),
    LabelFor(String, String),
    DescribedBy(String, String),
}

/// DOM semantic graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DOMSemanticGraph {
    pub elements: Vec<SemanticElement>,
    pub relationships: Vec<ElementRelationship>,
}

impl DOMSemanticGraph {
    /// Create a new empty graph
    pub fn new() -> Self {
        Self {
            elements: Vec::new(),
            relationships: Vec::new(),
        }
    }

    /// Add an element to the graph
    pub fn add_element(&mut self, element: SemanticElement) {
        self.elements.push(element);
    }

    /// Add a relationship
    pub fn add_relationship(&mut self, relationship: ElementRelationship) {
        self.relationships.push(relationship);
    }

    /// Get script to build semantic graph
    pub fn build_graph_script() -> &'static str {
        r#"
        (function() {
            const elements = [];
            const relationships = [];

            // Find all interactive and semantic elements
            const selector = 'button, a, input, select, textarea, form, [role], [aria-label]';
            const nodes = document.querySelectorAll(selector);

            nodes.forEach((el, index) => {
                const id = el.id || `element-${index}`;
                const role = el.getAttribute('role') || el.tagName.toLowerCase();
                const label = el.getAttribute('aria-label');
                const text = el.textContent?.trim().substring(0, 100);

                // Collect attributes
                const attributes = {};
                for (let attr of el.attributes) {
                    attributes[attr.name] = attr.value;
                }

                // Generate selector strategies
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

                // Track relationships
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

/// Self-healing element finder with fallback strategies
pub struct SelfHealingFinder;

impl SelfHealingFinder {
    /// Find element with self-healing capabilities
    /// Returns JavaScript to execute in the browser
    pub fn find_with_healing(selector: &SemanticSelector) -> String {
        let mut attempts = String::from("(function() {\n");
        attempts.push_str("  let element = null;\n");
        attempts.push_str("  let strategy = null;\n\n");

        // Try each strategy in order
        for (idx, strat) in selector.strategies.iter().enumerate() {
            attempts.push_str(&format!("  // Strategy {}: {:?}\n", idx + 1, strat));
            attempts.push_str("  if (!element) {\n");
            attempts.push_str("    try {\n");
            attempts.push_str(&format!("      element = {};\n", strat.to_selector_script()));
            attempts.push_str(&format!("      if (element) strategy = '{:?}';\n", strat));
            attempts.push_str("    } catch (e) {}\n");
            attempts.push_str("  }\n\n");
        }

        attempts.push_str("  return { element, strategy };\n");
        attempts.push_str("})()");

        attempts
    }

    /// Generate LLM fallback prompt
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

/// Element information returned from semantic find operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementInfo {
    pub selector: String,
    pub strategy: String,
    pub role: Option<String>,
    pub name: Option<String>,
    pub text: Option<String>,
}

/// Result of testing selector strategies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectorResult {
    pub strategy: SelectorStrategy,
    pub found: bool,
    pub element_info: Option<ElementInfo>,
    pub error: Option<String>,
}

/// Semantic element finder - main API
pub struct SemanticElementFinder;

impl SemanticElementFinder {
    /// Create a semantic selector from natural language
    pub fn from_natural_language(query: &str) -> SemanticSelector {
        SemanticSelector::new(query).generate_strategies()
    }

    /// Build a custom semantic selector
    pub fn builder(query: &str) -> SemanticSelector {
        SemanticSelector::new(query)
    }

    /// Parse natural language query
    pub fn parse_query(query: &str) -> SemanticQuery {
        NaturalLanguageParser::parse(query)
    }

    /// Find element script generator
    pub fn find_element_script(selector: &SemanticSelector) -> String {
        SelfHealingFinder::find_with_healing(selector)
    }

    /// Test all strategies and return results
    pub fn test_strategies_script(selector: &SemanticSelector) -> String {
        let mut script = String::from("(function() {\n");
        script.push_str("  const results = [];\n\n");

        for strat in &selector.strategies {
            script.push_str(&format!("  // Testing: {:?}\n", strat));
            script.push_str("  try {\n");
            script.push_str(&format!("    const el = {};\n", strat.to_selector_script()));
            script.push_str("    results.push({\n");
            script.push_str(&format!("      strategy: {:?},\n", strat));
            script.push_str("      found: !!el,\n");
            script.push_str("      element_info: el ? {\n");
            script.push_str("        selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),\n");
            script.push_str("        role: el.getAttribute('role'),\n");
            script.push_str("        name: el.getAttribute('aria-label') || el.textContent?.trim(),\n");
            script.push_str("        text: el.textContent?.trim()\n");
            script.push_str("      } : null,\n");
            script.push_str("      error: null\n");
            script.push_str("    });\n");
            script.push_str("  } catch (e) {\n");
            script.push_str("    results.push({\n");
            script.push_str(&format!("      strategy: {:?},\n", strat));
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
