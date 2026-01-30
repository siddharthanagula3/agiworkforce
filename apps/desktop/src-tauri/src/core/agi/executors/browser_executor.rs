//! Browser automation executor.
//!
//! Handles browser automation operations including navigation, clicking,
//! and extracting content from web pages.
//!
//! # Tools
//!
//! - `browser_navigate` - Navigate to a URL, opening a new tab if needed
//! - `browser_click` - Click an element using a CSS selector
//! - `browser_extract` - Extract text, attributes, or all elements matching a selector

use super::{ExecutorContext, ToolExecutor};
use crate::automation::AutomationService;
use crate::core::agi::ExecutionContext;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

/// Executor for browser automation operations.
///
/// This executor provides browser automation capabilities through the
/// Tauri browser state wrapper, supporting navigation, clicking, and
/// content extraction.
pub struct BrowserExecutor {
    /// Shared automation service (currently unused, reserved for future use)
    #[allow(dead_code)]
    automation: Arc<AutomationService>,
}

impl BrowserExecutor {
    /// Create a new browser executor with the given automation service.
    ///
    /// # Arguments
    ///
    /// * `automation` - Shared automation service for cross-platform operations
    pub fn new(automation: Arc<AutomationService>) -> Self {
        Self { automation }
    }
}

#[async_trait]
impl ToolExecutor for BrowserExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec!["browser_navigate", "browser_click", "browser_extract"]
    }

    fn description(&self) -> &'static str {
        "Browser automation executor for navigation, clicking, and content extraction"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "browser_navigate" => execute_navigate(parameters, context).await,
            "browser_click" => execute_click(parameters, context).await,
            "browser_extract" => execute_extract(parameters, context).await,
            _ => Err(anyhow!("Unknown browser tool: {}", tool_name)),
        }
    }
}

/// Execute browser_navigate operation.
///
/// Navigates the browser to the specified URL. If no tabs are open, opens a new
/// tab first. Otherwise, navigates the first available tab.
///
/// # Parameters
///
/// - `url` (required): The URL to navigate to
///
/// # Returns
///
/// JSON object with:
/// - `success`: boolean indicating success
/// - `url`: the URL navigated to
/// - `tab_id`: the ID of the tab used
async fn execute_navigate(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let url = parameters["url"]
        .as_str()
        .ok_or_else(|| anyhow!("Missing url parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not navigate to the page. Browser automation is not available."
        ));
    };

    use crate::sys::commands::BrowserStateWrapper;
    use tauri::Manager;

    let browser_state = app.state::<BrowserStateWrapper>();
    let tab_manager = browser_state
        .get_tab_manager()
        .map_err(|e| anyhow!("Browser is not ready: {}", e))?
        .lock()
        .await;

    // Get existing tabs or open a new one
    let tabs = tab_manager
        .list_tabs()
        .await
        .map_err(|e| anyhow!("Could not access browser tabs: {}", e))?;

    let tab_id = if tabs.is_empty() {
        tab_manager
            .open_tab(url)
            .await
            .map_err(|e| anyhow!("Could not open a new browser tab: {}", e))?
    } else {
        tabs[0].id.clone()
    };

    // Navigate to the URL
    use crate::automation::browser::NavigationOptions;
    tab_manager
        .navigate(&tab_id, url, NavigationOptions::default())
        .await
        .map_err(|e| anyhow!("Could not navigate to '{}': {}", url, e))?;

    Ok(json!({
        "success": true,
        "url": url,
        "tab_id": tab_id
    }))
}

/// Execute browser_click operation.
///
/// Clicks on an element in the browser using a CSS selector. Uses CDP (Chrome
/// DevTools Protocol) for reliable element interaction.
///
/// # Parameters
///
/// - `selector` (required): CSS selector for the element to click
/// - `tab_id` (optional): Specific tab to use; defaults to first tab
///
/// # Returns
///
/// JSON object with:
/// - `success`: boolean indicating success
/// - `action`: "clicked"
/// - `selector`: the selector used
/// - `tab_id`: the ID of the tab used
async fn execute_click(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing selector parameter"))?;
    let tab_id = parameters.get("tab_id").and_then(|v| v.as_str());

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not click the element. Browser automation is not available."
        ));
    };

    use crate::automation::browser::{ClickOptions, DomOperations};
    use crate::sys::commands::BrowserStateWrapper;
    use tauri::Manager;

    let browser_state = app.state::<BrowserStateWrapper>();
    let tab_manager = browser_state
        .get_tab_manager()
        .map_err(|e| anyhow!("Browser is not ready: {}", e))?
        .lock()
        .await;

    // Determine target tab
    let target_tab_id = if let Some(tid) = tab_id {
        tid.to_string()
    } else {
        let tabs = tab_manager
            .list_tabs()
            .await
            .map_err(|e| anyhow!("Could not access browser tabs: {}", e))?;
        if tabs.is_empty() {
            return Err(anyhow!(
                "No browser tabs available. Please navigate to a URL first using browser_navigate."
            ));
        }
        tabs[0].id.clone()
    };

    // Get CDP client for the tab
    let cdp_client = browser_state
        .get_cdp_client_for_tab(&target_tab_id)
        .await
        .map_err(|e| anyhow!("Could not connect to browser tab: {}", e))?;

    // Perform the click
    let options = ClickOptions::default();
    DomOperations::click_with_cdp(cdp_client, selector, options)
        .await
        .map_err(|e| anyhow!("Could not click element '{}': {}", selector, e))?;

    Ok(json!({
        "success": true,
        "action": "clicked",
        "selector": selector,
        "tab_id": target_tab_id
    }))
}

/// Execute browser_extract operation.
///
/// Extracts content from the browser page using CSS selectors. Supports multiple
/// extraction types for different use cases.
///
/// # Parameters
///
/// - `selector` (optional): CSS selector for elements; defaults to "body"
/// - `tab_id` (optional): Specific tab to use; defaults to first tab
/// - `extract_type` (optional): Type of extraction, one of:
///   - "text" (default): Extract text content
///   - "attribute": Extract a specific attribute (requires `attribute` parameter)
///   - "all": Extract all matching elements with their properties
/// - `attribute` (required if extract_type is "attribute"): Attribute name to extract
///
/// # Returns
///
/// JSON object with:
/// - `success`: boolean indicating success
/// - `selector`: the selector used
/// - `tab_id`: the ID of the tab used
/// - `data`: extraction result object containing:
///   - For "text": `{ type: "text", content: string }`
///   - For "attribute": `{ type: "attribute", attribute: string, content: string }`
///   - For "all": `{ type: "all_elements", count: number, elements: array }`
async fn execute_extract(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let selector = parameters
        .get("selector")
        .and_then(|v| v.as_str())
        .unwrap_or("body");
    let tab_id = parameters.get("tab_id").and_then(|v| v.as_str());
    let extract_type = parameters
        .get("extract_type")
        .and_then(|v| v.as_str())
        .unwrap_or("text");

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Could not extract content. Browser automation is not available."
        ));
    };

    use crate::automation::browser::DomOperations;
    use crate::sys::commands::BrowserStateWrapper;
    use tauri::Manager;

    let browser_state = app.state::<BrowserStateWrapper>();
    let tab_manager = browser_state
        .get_tab_manager()
        .map_err(|e| anyhow!("Browser is not ready: {}", e))?
        .lock()
        .await;

    // Determine target tab
    let target_tab_id = if let Some(tid) = tab_id {
        tid.to_string()
    } else {
        let tabs = tab_manager
            .list_tabs()
            .await
            .map_err(|e| anyhow!("Could not access browser tabs: {}", e))?;
        if tabs.is_empty() {
            return Err(anyhow!(
                "No browser tabs available. Please navigate to a URL first using browser_navigate."
            ));
        }
        tabs[0].id.clone()
    };

    // Perform extraction based on type
    let result = match extract_type {
        "text" => {
            let text = DomOperations::get_text(&target_tab_id, selector)
                .await
                .map_err(|e| anyhow!("Could not extract text from '{}': {}", selector, e))?;
            json!({ "type": "text", "content": text })
        }
        "attribute" => {
            let attribute_name = parameters
                .get("attribute")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing attribute parameter for attribute extraction"))?;

            let attr_value = DomOperations::get_attribute(&target_tab_id, selector, attribute_name)
                .await
                .map_err(|e| {
                    anyhow!(
                        "Could not get attribute '{}' from '{}': {}",
                        attribute_name,
                        selector,
                        e
                    )
                })?;

            json!({
                "type": "attribute",
                "attribute": attribute_name,
                "content": attr_value
            })
        }
        "all" => {
            let elements = DomOperations::query_all(&target_tab_id, selector)
                .await
                .map_err(|e| anyhow!("Could not query elements '{}': {}", selector, e))?;

            let elements_json = serde_json::to_value(&elements)
                .map_err(|e| anyhow!("Could not serialize elements: {}", e))?;

            json!({
                "type": "all_elements",
                "count": elements.len(),
                "elements": elements_json
            })
        }
        _ => {
            // Default to text extraction for unknown types
            let text = DomOperations::get_text(&target_tab_id, selector)
                .await
                .map_err(|e| anyhow!("Could not extract text from '{}': {}", selector, e))?;
            json!({ "type": "text", "content": text })
        }
    };

    Ok(json!({
        "success": true,
        "selector": selector,
        "tab_id": target_tab_id,
        "data": result
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::automation::AutomationService;

    fn create_test_automation() -> Arc<AutomationService> {
        Arc::new(AutomationService::new().expect("Failed to create automation service"))
    }

    #[test]
    fn test_browser_executor_tool_names() {
        let automation = create_test_automation();
        let executor = BrowserExecutor::new(automation);
        let names = executor.tool_names();

        assert!(names.contains(&"browser_navigate"));
        assert!(names.contains(&"browser_click"));
        assert!(names.contains(&"browser_extract"));
    }

    #[test]
    fn test_browser_executor_description() {
        let automation = create_test_automation();
        let executor = BrowserExecutor::new(automation);

        assert!(!executor.description().is_empty());
        assert!(executor.description().contains("Browser"));
    }
}
