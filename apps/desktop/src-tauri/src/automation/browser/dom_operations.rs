use serde::{Deserialize, Serialize};

use crate::sys::error::Result;

use super::cdp_client::CdpClient;

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

pub struct DomOperations;

impl DomOperations {
    pub async fn click(client: &CdpClient, selector: &str) -> Result<()> {
        tracing::debug!("Clicking element: {}", selector);

        client.click_element(selector).await?;

        tracing::info!("Element clicked: {}", selector);
        Ok(())
    }

    pub async fn type_text(
        client: &CdpClient,
        selector: &str,
        text: &str,
        clear_first: bool,
    ) -> Result<()> {
        tracing::debug!("Typing text into: {}", selector);

        client
            .type_into_element(selector, text, clear_first)
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

    pub async fn get_element_info(client: &CdpClient, selector: &str) -> Result<ElementInfo> {
        tracing::debug!("Getting element info: {}", selector);

        // Use Runtime.evaluate to extract element info via CDP
        let js = format!(
            r#"(function() {{
                var el = document.querySelector('{}');
                if (!el) return null;
                var rect = el.getBoundingClientRect();
                var attrs = {{}};
                for (var i = 0; i < el.attributes.length; i++) {{
                    attrs[el.attributes[i].name] = el.attributes[i].value;
                }}
                return {{
                    tagName: el.tagName.toLowerCase(),
                    text: (el.innerText || el.textContent || '').substring(0, 1000),
                    attributes: attrs,
                    bounds: {{
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height
                    }}
                }};
            }})()"#,
            Self::escape_js(selector),
        );

        let result = client.evaluate(&js).await?;

        if result.is_null() {
            return Err(crate::sys::error::Error::Other(format!(
                "Element not found: {}",
                selector
            )));
        }

        let tag_name = result
            .get("tagName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let text = result
            .get("text")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let mut attributes = std::collections::HashMap::new();
        if let Some(attrs) = result.get("attributes").and_then(|v| v.as_object()) {
            for (k, v) in attrs {
                if let Some(val) = v.as_str() {
                    attributes.insert(k.clone(), val.to_string());
                }
            }
        }

        let bounds = result.get("bounds").map(|b| ElementBounds {
            x: b.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0),
            y: b.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0),
            width: b.get("width").and_then(|v| v.as_f64()).unwrap_or(0.0),
            height: b.get("height").and_then(|v| v.as_f64()).unwrap_or(0.0),
        });

        Ok(ElementInfo {
            tag_name,
            text,
            attributes,
            bounds,
        })
    }

    /// Escape special characters for safe insertion into JavaScript string literals.
    fn escape_js(s: &str) -> String {
        s.replace('\\', "\\\\")
            .replace('\'', "\\'")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
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

    pub async fn hover(client: &CdpClient, selector: &str) -> Result<()> {
        tracing::debug!("Hovering element: {}", selector);
        client.hover_element(selector).await?;
        Ok(())
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
