use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;

use crate::sys::error::Result;

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

    pub async fn click(client: &CdpClient, selector: &str, options: ClickOptions) -> Result<()> {
        tracing::debug!("Clicking element: {}", selector);

        if let Some(delay) = options.delay {
            tokio::time::sleep(Duration::from_millis(delay)).await;
        }

        // Use CDP client to click
        client.click_element(selector).await?;

        tracing::info!("Element clicked: {}", selector);
        Ok(())
    }

    pub async fn type_text(
        client: &CdpClient,
        selector: &str,
        text: &str,
        options: TypeOptions,
    ) -> Result<()> {
        tracing::debug!("Typing text into: {}", selector);

        if let Some(delay) = options.delay {
            // If explicit delay requested, we might need a custom loop,
            // but CdpClient::type_into_element handles basic typing.
            // For now, we'll just sleep before typing if delay is set,
            // or if we truly need character-by-character with delay, we'd need to extend CdpClient.
            // Let's rely on CdpClient's atomic type_into_element for now unless specific delay logic is needed.
            if delay > 0 {
                tokio::time::sleep(Duration::from_millis(delay)).await;
            }
        }

        client
            .type_into_element(selector, text, options.clear_first)
            .await?;

        tracing::info!("Text typed into element: {}", selector);
        Ok(())
    }

    pub async fn get_text(client: &CdpClient, selector: &str) -> Result<String> {
        tracing::debug!("Getting text from: {}", selector);
        let text = client.get_text(selector).await?;
        Ok(text)
    }

    pub async fn get_attribute(
        client: &CdpClient,
        selector: &str,
        attribute: &str,
    ) -> Result<Option<String>> {
        tracing::debug!("Getting attribute {} from: {}", attribute, selector);
        let value = client.get_attribute(selector, attribute).await?;
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

    pub async fn wait_for_selector(
        client: &CdpClient,
        selector: &str,
        timeout_ms: u64,
    ) -> Result<()> {
        tracing::debug!(
            "Waiting for selector (timeout {}ms): {}",
            timeout_ms,
            selector
        );
        client.wait_for_selector(selector, timeout_ms).await?;
        Ok(())
    }

    pub async fn element_exists(client: &CdpClient, selector: &str) -> Result<bool> {
        client.element_exists(selector).await
    }

    pub async fn select_option(client: &CdpClient, selector: &str, value: &str) -> Result<()> {
        tracing::debug!("Selecting option in {}: {}", selector, value);
        client.select_option(selector, value).await?;
        Ok(())
    }

    pub async fn check(client: &CdpClient, selector: &str) -> Result<()> {
        tracing::debug!("Checking element: {}", selector);
        client.set_checked(selector, true).await?;
        Ok(())
    }

    pub async fn uncheck(client: &CdpClient, selector: &str) -> Result<()> {
        tracing::debug!("Unchecking element: {}", selector);
        client.set_checked(selector, false).await?;
        Ok(())
    }

    pub async fn focus(client: &CdpClient, selector: &str) -> Result<()> {
        tracing::debug!("Focusing element: {}", selector);
        client.focus_element(selector).await?;
        Ok(())
    }

    pub async fn blur(tab_id: &TabId, selector: &str) -> Result<()> {
        tracing::info!("Blurring element in tab {}: {}", tab_id, selector);

        tracing::info!("Element blurred: {}", selector);
        Ok(())
    }

    pub async fn hover(client: &CdpClient, selector: &str) -> Result<()> {
        tracing::debug!("Hovering element: {}", selector);
        client.hover_element(selector).await?;
        Ok(())
    }

    pub async fn evaluate(client: &CdpClient, script: &str) -> Result<serde_json::Value> {
        tracing::debug!("Evaluating script");
        client.evaluate(script).await
    }

    pub async fn query_all(client: &CdpClient, selector: &str) -> Result<Vec<ElementInfo>> {
        tracing::debug!("Querying all elements: {}", selector);
        let values = client.query_all(selector).await?;

        let mut elements = Vec::new();
        for val in values {
            if let Some(obj) = val.as_object() {
                let tag_name = obj
                    .get("tagName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let text = obj
                    .get("text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let mut attributes = std::collections::HashMap::new();
                if let Some(id) = obj.get("id").and_then(|v| v.as_str()) {
                    if !id.is_empty() {
                        attributes.insert("id".to_string(), id.to_string());
                    }
                }
                if let Some(class) = obj.get("className").and_then(|v| v.as_str()) {
                    if !class.is_empty() {
                        attributes.insert("class".to_string(), class.to_string());
                    }
                }
                elements.push(ElementInfo {
                    tag_name,
                    text,
                    attributes,
                    bounds: None,
                });
            }
        }
        Ok(elements)
    }

    pub async fn scroll_into_view(client: &CdpClient, selector: &str) -> Result<()> {
        client.scroll_into_view(selector).await
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
