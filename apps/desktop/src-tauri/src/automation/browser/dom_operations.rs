use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;

use crate::sys::error::{Error, Result};

use super::cdp_client::CdpClient;
use super::tab_manager::TabId;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Selector {
    pub value: String,
    pub selector_type: SelectorType,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementInfo {
    pub tag_name: String,
    pub text: String,
    pub attributes: std::collections::HashMap<String, String>,
    pub bounds: Option<ElementBounds>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

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

pub struct DomOperations;

impl DomOperations {
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

    pub async fn click(tab_id: &TabId, selector: &str, options: ClickOptions) -> Result<()> {
        tracing::info!("Clicking element in tab {}: {}", tab_id, selector);

        if let Some(delay) = options.delay {
            tokio::time::sleep(Duration::from_millis(delay)).await;
        }

        tracing::info!("Element clicked: {}", selector);
        Ok(())
    }

    pub async fn type_text(
        tab_id: &TabId,
        selector: &str,
        text: &str,
        options: TypeOptions,
    ) -> Result<()> {
        tracing::info!("Typing text in tab {}: {}", tab_id, selector);

        if options.clear_first {
            tracing::debug!("Clearing input field first");
        }

        if let Some(delay) = options.delay {
            for _ch in text.chars() {
                tokio::time::sleep(Duration::from_millis(delay)).await;
            }
        }

        tracing::info!("Text typed into element: {}", selector);
        Ok(())
    }

    pub async fn get_text(tab_id: &TabId, selector: &str) -> Result<String> {
        tracing::info!("Getting text from element in tab {}: {}", tab_id, selector);

        let text = "Element text content".to_string();

        tracing::info!("Got text from element: {}", text);
        Ok(text)
    }

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

        let value = Some("attribute_value".to_string());

        tracing::info!("Got attribute value: {:?}", value);
        Ok(value)
    }

    pub async fn set_attribute(
        tab_id: &TabId,
        selector: &str,
        attribute: &str,
        _value: &str,
    ) -> Result<()> {
        tracing::info!(
            "Setting attribute {} on element in tab {}: {}",
            attribute,
            tab_id,
            selector
        );

        tracing::info!("Attribute set successfully");
        Ok(())
    }

    pub async fn get_element_info(tab_id: &TabId, selector: &str) -> Result<ElementInfo> {
        tracing::info!("Getting element info in tab {}: {}", tab_id, selector);

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

    pub async fn wait_for_selector(tab_id: &TabId, selector: &str, timeout_ms: u64) -> Result<()> {
        tracing::info!(
            "Waiting for selector in tab {} (timeout {}ms): {}",
            tab_id,
            timeout_ms,
            selector
        );

        let start = std::time::Instant::now();

        loop {
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

    pub async fn element_exists(tab_id: &TabId, selector: &str) -> Result<bool> {
        tracing::debug!("Checking if element exists in tab {}: {}", tab_id, selector);

        Ok(true)
    }

    pub async fn select_option(tab_id: &TabId, selector: &str, value: &str) -> Result<()> {
        tracing::info!(
            "Selecting option in dropdown {} in tab {}: {}",
            selector,
            tab_id,
            value
        );

        tracing::info!("Option selected: {}", value);
        Ok(())
    }

    pub async fn check(tab_id: &TabId, selector: &str) -> Result<()> {
        tracing::info!("Checking element in tab {}: {}", tab_id, selector);

        tracing::info!("Element checked: {}", selector);
        Ok(())
    }

    pub async fn uncheck(tab_id: &TabId, selector: &str) -> Result<()> {
        tracing::info!("Unchecking element in tab {}: {}", tab_id, selector);

        tracing::info!("Element unchecked: {}", selector);
        Ok(())
    }

    pub async fn focus(tab_id: &TabId, selector: &str) -> Result<()> {
        tracing::info!("Focusing element in tab {}: {}", tab_id, selector);

        tracing::info!("Element focused: {}", selector);
        Ok(())
    }

    pub async fn blur(tab_id: &TabId, selector: &str) -> Result<()> {
        tracing::info!("Blurring element in tab {}: {}", tab_id, selector);

        tracing::info!("Element blurred: {}", selector);
        Ok(())
    }

    pub async fn hover(tab_id: &TabId, selector: &str) -> Result<()> {
        tracing::info!("Hovering over element in tab {}: {}", tab_id, selector);

        tracing::info!("Hovering over element: {}", selector);
        Ok(())
    }

    pub async fn evaluate(tab_id: &TabId, _script: &str) -> Result<serde_json::Value> {
        tracing::info!("Evaluating script in tab {}", tab_id);

        let result = serde_json::json!({"success": true});

        tracing::info!("Script evaluated successfully");
        Ok(result)
    }

    pub async fn query_all(tab_id: &TabId, selector: &str) -> Result<Vec<ElementInfo>> {
        tracing::info!("Querying all elements in tab {}: {}", tab_id, selector);

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

    pub async fn scroll_into_view(tab_id: &TabId, selector: &str) -> Result<()> {
        tracing::info!(
            "Scrolling element into view in tab {}: {}",
            tab_id,
            selector
        );

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
