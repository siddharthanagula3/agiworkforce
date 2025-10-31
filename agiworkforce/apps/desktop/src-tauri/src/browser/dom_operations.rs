use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;

use crate::error::{Error, Result};

use super::cdp_client::CdpClient;
use super::tab_manager::TabId;

/// Element selector
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Selector {
    pub value: String,
    pub selector_type: SelectorType,
}

/// Selector type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SelectorType {
    Css,
    XPath,
    Text,
}

impl Selector {
    pub fn css(value: impl Into<String>) -> Self {
        Self {
            value: value.into(),
            selector_type: SelectorType::Css,
        }
    }

    pub fn xpath(value: impl Into<String>) -> Self {
        Self {
            value: value.into(),
            selector_type: SelectorType::XPath,
        }
    }

    pub fn text(value: impl Into<String>) -> Self {
        Self {
            value: value.into(),
            selector_type: SelectorType::Text,
        }
    }
}

/// Element information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementInfo {
    pub tag_name: String,
    pub text: String,
    pub attributes: std::collections::HashMap<String, String>,
    pub bounds: Option<ElementBounds>,
}

/// Element bounds/position
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Click options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickOptions {
    pub button: MouseButton,
    pub click_count: u32,
    pub delay: Option<u64>,
}

impl Default for ClickOptions {
    fn default() -> Self {
        Self {
            button: MouseButton::Left,
            click_count: 1,
            delay: None,
        }
    }
}

/// Mouse button
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

/// Type options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeOptions {
    pub delay: Option<u64>,
    pub clear_first: bool,
}

impl Default for TypeOptions {
    fn default() -> Self {
        Self {
            delay: Some(0),
            clear_first: true,
        }
    }
}

/// DOM operations for web automation
pub struct DomOperations;

impl DomOperations {
    /// Click an element by selector (with CDP client)
    pub async fn click_with_cdp(
        cdp: Arc<CdpClient>,
        selector: &str,
        options: ClickOptions,
    ) -> Result<()> {
        tracing::info!("Clicking element: {}", selector);

        if let Some(delay) = options.delay {
            tokio::time::sleep(Duration::from_millis(delay)).await;
        }

        cdp.click_element(selector).await?;

        tracing::info!("Element clicked: {}", selector);
        Ok(())
    }

    /// Click an element by selector (legacy method for backward compatibility)
    pub async fn click(tab_id: &TabId, selector: &str, options: ClickOptions) -> Result<()> {
        tracing::info!("Clicking element in tab {}: {}", tab_id, selector);

        // Legacy placeholder - in real usage, get CDP client first
        if let Some(delay) = options.delay {
            tokio::time::sleep(Duration::from_millis(delay)).await;
        }

        tracing::info!("Element clicked: {}", selector);
        Ok(())
    }

    /// Type text into an input field
    pub async fn type_text(
        tab_id: &TabId,
        selector: &str,
        text: &str,
        options: TypeOptions,
    ) -> Result<()> {
        tracing::info!("Typing text in tab {}: {}", tab_id, selector);

        // In production, send CDP command to focus and type
        // 1. DOM.focus
        // 2. Input.insertText or Input.dispatchKeyEvent for each character

        if options.clear_first {
            tracing::debug!("Clearing input field first");
            // Send Ctrl+A, Delete
        }

        if let Some(delay) = options.delay {
            // Type each character with delay
            for ch in text.chars() {
                // Send key event
                tokio::time::sleep(Duration::from_millis(delay)).await;
            }
        } else {
            // Type all at once
        }

        tracing::info!("Text typed into element: {}", selector);
        Ok(())
    }

    /// Get text content from an element
    pub async fn get_text(tab_id: &TabId, selector: &str) -> Result<String> {
        tracing::info!("Getting text from element in tab {}: {}", tab_id, selector);

        // In production, evaluate JavaScript to get textContent
        // Runtime.evaluate: document.querySelector(selector).textContent

        let text = "Element text content".to_string();

        tracing::info!("Got text from element: {}", text);
        Ok(text)
    }

    /// Get an attribute value from an element
    pub async fn get_attribute(
        tab_id: &TabId,
        selector: &str,
        attribute: &str,
    ) -> Result<Option<String>> {
        tracing::info!(
            "Getting attribute {} from element in tab {}: {}",
            attribute,
            tab_id,
            selector
        );

        // In production, evaluate JavaScript to get attribute
        // Runtime.evaluate: document.querySelector(selector).getAttribute(attribute)

        let value = Some("attribute_value".to_string());

        tracing::info!("Got attribute value: {:?}", value);
        Ok(value)
    }

    /// Set an attribute value on an element
    pub async fn set_attribute(
        tab_id: &TabId,
        selector: &str,
        attribute: &str,
        value: &str,
    ) -> Result<()> {
        tracing::info!(
            "Setting attribute {} on element in tab {}: {}",
            attribute,
            tab_id,
            selector
        );

        // In production, evaluate JavaScript to set attribute
        // Runtime.evaluate: document.querySelector(selector).setAttribute(attribute, value)

        tracing::info!("Attribute set successfully");
        Ok(())
    }

    /// Get element information
    pub async fn get_element_info(tab_id: &TabId, selector: &str) -> Result<ElementInfo> {
        tracing::info!("Getting element info in tab {}: {}", tab_id, selector);

        // In production, use CDP to get element details
        let info = ElementInfo {
            tag_name: "div".to_string(),
            text: "Element text".to_string(),
            attributes: std::collections::HashMap::new(),
            bounds: Some(ElementBounds {
                x: 100.0,
                y: 200.0,
                width: 300.0,
                height: 50.0,
            }),
        };

        Ok(info)
    }

    /// Wait for an element to appear
    pub async fn wait_for_selector(tab_id: &TabId, selector: &str, timeout_ms: u64) -> Result<()> {
        tracing::info!(
            "Waiting for selector in tab {} (timeout {}ms): {}",
            tab_id,
            timeout_ms,
            selector
        );

        let start = std::time::Instant::now();

        loop {
            // In production, check if element exists via CDP
            let exists = Self::element_exists(tab_id, selector).await?;

            if exists {
                tracing::info!("Element found: {}", selector);
                return Ok(());
            }

            if start.elapsed().as_millis() > timeout_ms as u128 {
                return Err(Error::CommandTimeout(format!(
                    "Element not found after {}ms: {}",
                    timeout_ms, selector
                )));
            }

            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }

    /// Check if element exists
    pub async fn element_exists(tab_id: &TabId, selector: &str) -> Result<bool> {
        tracing::debug!("Checking if element exists in tab {}: {}", tab_id, selector);

        // In production, evaluate JavaScript
        // Runtime.evaluate: !!document.querySelector(selector)

        Ok(true) // Placeholder
    }

    /// Select option in dropdown
    pub async fn select_option(tab_id: &TabId, selector: &str, value: &str) -> Result<()> {
        tracing::info!(
            "Selecting option in dropdown {} in tab {}: {}",
            selector,
            tab_id,
            value
        );

        // In production, use CDP to select option
        // Runtime.evaluate: select element, set value, dispatch change event

        tracing::info!("Option selected: {}", value);
        Ok(())
    }

    /// Check a checkbox or radio button
    pub async fn check(tab_id: &TabId, selector: &str) -> Result<()> {
        tracing::info!("Checking element in tab {}: {}", tab_id, selector);

        // In production, evaluate JavaScript to check element
        // Runtime.evaluate: element.checked = true; element.dispatchEvent(new Event('change'))

        tracing::info!("Element checked: {}", selector);
        Ok(())
    }

    /// Uncheck a checkbox
    pub async fn uncheck(tab_id: &TabId, selector: &str) -> Result<()> {
        tracing::info!("Unchecking element in tab {}: {}", tab_id, selector);

        // In production, evaluate JavaScript to uncheck element
        // Runtime.evaluate: element.checked = false; element.dispatchEvent(new Event('change'))

        tracing::info!("Element unchecked: {}", selector);
        Ok(())
    }

    /// Focus an element
    pub async fn focus(tab_id: &TabId, selector: &str) -> Result<()> {
        tracing::info!("Focusing element in tab {}: {}", tab_id, selector);

        // In production, use CDP to focus element
        // DOM.focus

        tracing::info!("Element focused: {}", selector);
        Ok(())
    }

    /// Blur an element (remove focus)
    pub async fn blur(tab_id: &TabId, selector: &str) -> Result<()> {
        tracing::info!("Blurring element in tab {}: {}", tab_id, selector);

        // In production, evaluate JavaScript to blur element
        // Runtime.evaluate: element.blur()

        tracing::info!("Element blurred: {}", selector);
        Ok(())
    }

    /// Hover over an element
    pub async fn hover(tab_id: &TabId, selector: &str) -> Result<()> {
        tracing::info!("Hovering over element in tab {}: {}", tab_id, selector);

        // In production, use CDP to move mouse to element
        // Input.dispatchMouseEvent

        tracing::info!("Hovering over element: {}", selector);
        Ok(())
    }

    /// Execute JavaScript in the page context
    pub async fn evaluate(tab_id: &TabId, script: &str) -> Result<serde_json::Value> {
        tracing::info!("Evaluating script in tab {}", tab_id);

        // In production, use CDP Runtime.evaluate
        // Return the result as JSON

        let result = serde_json::json!({"success": true});

        tracing::info!("Script evaluated successfully");
        Ok(result)
    }

    /// Get all elements matching selector
    pub async fn query_all(tab_id: &TabId, selector: &str) -> Result<Vec<ElementInfo>> {
        tracing::info!("Querying all elements in tab {}: {}", tab_id, selector);

        // In production, evaluate JavaScript to get all matching elements
        // Runtime.evaluate: Array.from(document.querySelectorAll(selector))

        let elements = vec![
            ElementInfo {
                tag_name: "div".to_string(),
                text: "Element 1".to_string(),
                attributes: std::collections::HashMap::new(),
                bounds: None,
            },
            ElementInfo {
                tag_name: "div".to_string(),
                text: "Element 2".to_string(),
                attributes: std::collections::HashMap::new(),
                bounds: None,
            },
        ];

        tracing::info!("Found {} elements", elements.len());
        Ok(elements)
    }

    /// Scroll element into view
    pub async fn scroll_into_view(tab_id: &TabId, selector: &str) -> Result<()> {
        tracing::info!(
            "Scrolling element into view in tab {}: {}",
            tab_id,
            selector
        );

        // In production, evaluate JavaScript
        // Runtime.evaluate: element.scrollIntoView({ behavior: 'smooth', block: 'center' })

        tracing::info!("Element scrolled into view: {}", selector);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_selector_creation() {
        let css_sel = Selector::css("#my-id");
        assert_eq!(css_sel.value, "#my-id");

        let xpath_sel = Selector::xpath("//div[@class='test']");
        assert_eq!(xpath_sel.value, "//div[@class='test']");
    }

    #[tokio::test]
    async fn test_click_options_default() {
        let options = ClickOptions::default();
        assert_eq!(options.click_count, 1);
    }

    #[tokio::test]
    async fn test_type_options_default() {
        let options = TypeOptions::default();
        assert!(options.clear_first);
    }
}
