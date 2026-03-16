use super::*;

/// Pseudo-classes that are safe for DOM querying (no side effects, no code execution).
const SAFE_PSEUDO_CLASSES: &[&str] = &[
    ":first-child",
    ":last-child",
    ":first-of-type",
    ":last-of-type",
    ":only-child",
    ":only-of-type",
    ":nth-child",
    ":nth-last-child",
    ":nth-of-type",
    ":nth-last-of-type",
    ":checked",
    ":disabled",
    ":enabled",
    ":required",
    ":optional",
    ":read-only",
    ":read-write",
    ":empty",
    ":hover",
    ":focus",
    ":active",
    ":visited",
    ":link",
    ":target",
    ":root",
    ":placeholder-shown",
    ":default",
    ":valid",
    ":invalid",
    ":in-range",
    ":out-of-range",
    ":indeterminate",
    ":first-line",
    ":first-letter",
    ":before",
    ":after",
    "::first-line",
    "::first-letter",
    "::before",
    "::after",
    "::placeholder",
    "::selection",
    "::marker",
];

/// Validates a CSS selector for safety before it reaches the browser DOM query API.
///
/// Uses a layered defense:
/// 1. Reject empty / excessively long selectors
/// 2. Reject characters that enable JS string breakout (`<`, `>`, `'`, `"`, `\`)
/// 3. Blocklist dangerous CSS/JS patterns (`@import`, `javascript:`, `expression(`)
/// 4. Allowlist pseudo-classes — only known-safe ones are permitted
/// 5. Reject nested `:not()` / `:has()` abuse
///
/// Returns `Ok(())` when the selector is safe, or `Err(reason)` with a
/// human-readable rejection reason.
fn validate_css_selector(selector: &str) -> Result<(), String> {
    // 1. Length / emptiness guards
    let trimmed = selector.trim();
    if trimmed.is_empty() {
        return Err("selector is empty".to_string());
    }
    // 2 KiB is far beyond any real-world selector; reject to prevent ReDoS-style abuse.
    if trimmed.len() > 2048 {
        return Err(format!(
            "selector exceeds maximum length ({}  > 2048)",
            trimmed.len()
        ));
    }

    let lower = trimmed.to_lowercase();

    // 2. Characters that break out of a JS string literal when interpolated.
    //    These are never valid in a CSS selector token anyway.
    for ch in ['<', '>', '\'', '"', '\\'] {
        if trimmed.contains(ch) {
            return Err(format!(
                "contains disallowed character '{}'",
                ch
            ));
        }
    }

    // Null bytes
    if trimmed.contains('\0') {
        return Err("contains null byte".to_string());
    }

    // 3. Blocklist — dangerous patterns
    if lower.contains("@import") {
        return Err("contains @import (code injection risk)".to_string());
    }
    if lower.contains("javascript:") {
        return Err("contains javascript: protocol handler".to_string());
    }
    if lower.contains("expression(") || lower.contains("expression:") {
        return Err("contains CSS expression (IE legacy code execution risk)".to_string());
    }
    if lower.contains("-moz-binding") {
        return Err("contains -moz-binding (XBL injection risk)".to_string());
    }
    if lower.contains("behavior:") || lower.contains("behaviour:") {
        return Err("contains behavior/behaviour (HTC injection risk)".to_string());
    }
    if lower.contains("url(") {
        return Err("contains url() (external resource loading risk)".to_string());
    }

    // 4. Validate pseudo-classes against the safe allowlist.
    //    Walk the selector and extract every `:name` or `::name` token.
    validate_pseudo_classes(trimmed)?;

    // 5. Reject nested :not() — `:not(:not(...))` is a known abuse vector.
    validate_not_nesting(trimmed)?;

    // 6. Reject :has() — it allows parent/ancestor selection which can have
    //    side effects in some engines and is a known attack surface.
    if lower.contains(":has(") {
        return Err("contains :has() (parent selection with potential side effects)".to_string());
    }

    Ok(())
}

/// Extract pseudo-class tokens from the selector and verify each one appears
/// in [`SAFE_PSEUDO_CLASSES`].
fn validate_pseudo_classes(selector: &str) -> Result<(), String> {
    let bytes = selector.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        // Skip past attribute selectors `[...]` entirely — colons inside
        // attribute values (e.g. `[href="http://x"]`) are not pseudo-classes.
        if bytes[i] == b'[' {
            let mut depth = 1u32;
            i += 1;
            while i < len && depth > 0 {
                if bytes[i] == b'[' {
                    depth = depth.saturating_add(1);
                } else if bytes[i] == b']' {
                    depth = depth.saturating_sub(1);
                }
                i += 1;
            }
            continue;
        }

        if bytes[i] == b':' {
            let start = i;
            // Consume `::` (pseudo-elements) or `:` (pseudo-classes).
            i += 1;
            if i < len && bytes[i] == b':' {
                i += 1;
            }
            // Consume the name: [a-zA-Z0-9_-]
            let name_start = i;
            while i < len && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'-' || bytes[i] == b'_') {
                i += 1;
            }
            if i == name_start {
                // Bare `:` at end or followed by non-alpha — skip.
                continue;
            }
            // For functional pseudo-classes like `:nth-child(2n)`, we compare
            // just the name portion (up to the `(`).
            let pseudo_name = &selector[start..i];
            let pseudo_lower = pseudo_name.to_lowercase();

            let is_safe = SAFE_PSEUDO_CLASSES.iter().any(|safe| {
                pseudo_lower == *safe
            });
            // Also allow `:not(` — we validate nesting depth separately.
            let is_not = pseudo_lower == ":not";

            if !is_safe && !is_not {
                return Err(format!(
                    "contains unsupported pseudo-class/element '{}'",
                    pseudo_name
                ));
            }
        } else {
            i += 1;
        }
    }

    Ok(())
}

/// Reject selectors that contain nested `:not()` — e.g. `:not(:not(div))`.
/// Single-level `:not(.foo)` is permitted.
fn validate_not_nesting(selector: &str) -> Result<(), String> {
    let lower = selector.to_lowercase();
    let bytes = lower.as_bytes();
    let len = bytes.len();
    let not_pattern = b":not(";

    let mut i = 0;
    while i + not_pattern.len() <= len {
        if &bytes[i..i + not_pattern.len()] == not_pattern {
            // Found `:not(` — scan inside its parenthesised argument for
            // another `:not(`.
            let inner_start = i + not_pattern.len();
            let mut depth = 1u32;
            let mut j = inner_start;
            while j < len && depth > 0 {
                if bytes[j] == b'(' {
                    depth = depth.saturating_add(1);
                } else if bytes[j] == b')' {
                    depth = depth.saturating_sub(1);
                }
                if depth > 0 && j + not_pattern.len() <= len && &bytes[j..j + not_pattern.len()] == not_pattern {
                    return Err(
                        "contains nested :not() (negation abuse)".to_string(),
                    );
                }
                j += 1;
            }
            i = j;
        } else {
            i += 1;
        }
    }

    Ok(())
}

/// Validate the selector and return a user-facing `anyhow::Error` on failure.
/// Also emits a `warn!` log so rejected selectors appear in telemetry.
fn require_safe_selector(selector: &str) -> Result<()> {
    if let Err(reason) = validate_css_selector(selector) {
        tracing::warn!("Invalid selector pattern: {reason}");
        return Err(anyhow!(
            "Invalid CSS selector: {reason}"
        ));
    }
    Ok(())
}

impl ToolExecutor {
    pub(crate) async fn execute_browser_tool(
        &self,
        tool_id: &str,
        args: HashMap<String, serde_json::Value>,
    ) -> Result<ToolResult> {
        use crate::automation::browser::dom_operations::{
            ClickOptions, DomOperations, TypeOptions,
        };
        use crate::sys::commands::BrowserStateWrapper;
        use tauri::Manager;

        let app = self
            .app_handle
            .as_ref()
            .ok_or_else(|| anyhow!("App handle not available for browser automation"))?;
        let browser_state = app.state::<BrowserStateWrapper>();

        // Helper to get client by tab_id from args, or fall back to active client
        let get_client = || async {
            let tab_id = args
                .get("tab_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            browser_state
                .get_client_for_tab(tab_id)
                .await
                .map_err(anyhow::Error::msg)
        };

        match tool_id {
            "browser_get_url" => {
                let (client, tab_id) = get_client().await?;
                let url = client.get_url().await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "url": url, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_title" => {
                let (client, tab_id) = get_client().await?;
                let title = client.get_title().await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "title": title, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_go_back" => {
                let (client, tab_id) = get_client().await?;
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(anyhow::Error::msg)?;
                tab_manager
                    .lock()
                    .await
                    .go_back(&tab_id)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "tab_id": tab_id, "url": client.get_url().await.unwrap_or_default() }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_go_forward" => {
                let (client, tab_id) = get_client().await?;
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(anyhow::Error::msg)?;
                tab_manager
                    .lock()
                    .await
                    .go_forward(&tab_id)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "tab_id": tab_id, "url": client.get_url().await.unwrap_or_default() }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_reload" => {
                let (client, tab_id) = get_client().await?;
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(anyhow::Error::msg)?;
                tab_manager
                    .lock()
                    .await
                    .reload(&tab_id)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "tab_id": tab_id, "url": client.get_url().await.unwrap_or_default() }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_wait_for_navigation" => {
                let (client, tab_id) = get_client().await?;
                let timeout_ms = args
                    .get("timeout_ms")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(30000);
                let script = format!(
                    r#"
                    new Promise((resolve, reject) => {{
                        const navTimeout = {};
                        let lastUrl = window.location.href;
                        let resolved = false;

                        const check = () => {{
                            if (window.location.href !== lastUrl) {{
                                resolved = true;
                                resolve({{ newUrl: window.location.href }});
                                return;
                            }}

                            if (!resolved) {{
                                setTimeout(check, 100);
                            }}
                        }};

                        setTimeout(() => {{
                            if (!resolved) {{
                                reject(new Error('Navigation timeout'));
                            }}
                        }}, navTimeout);

                        check();
                    }})
                    "#,
                    timeout_ms
                );
                let result = client.evaluate(&script).await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "result": result, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_execute_async_js" => {
                let (client, tab_id) = get_client().await?;
                let script = args
                    .get("script")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing script parameter"))?;
                // For async JS, wrap it in a Promise and await it
                let await_promise = args
                    .get("await_promise")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                let wrapped_script = if await_promise {
                    format!(
                        "new Promise((resolve) => {{ {}; resolve(undefined); }})",
                        script
                    )
                } else {
                    script.to_string()
                };
                let result = client
                    .evaluate(&wrapped_script)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "result": result, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_element_state" => {
                let (client, tab_id) = get_client().await?;
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                require_safe_selector(selector)?;
                let script = format!(
                    r#"
                    (function() {{
                        const el = document.querySelector('{}');
                        if (!el) return {{ error: 'Element not found' }};
                        const rect = el.getBoundingClientRect();
                        return {{
                            visible: rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none',
                            enabled: !el.disabled,
                            checked: el.checked,
                            selected: el.selected,
                            focused: document.activeElement === el,
                            tagName: el.tagName.toLowerCase(),
                            id: el.id,
                            classes: el.className
                        }};
                    }})()
                    "#,
                    selector
                );
                let result = client.evaluate(&script).await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "state": result, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_wait_for_interactive" => {
                let (client, tab_id) = get_client().await?;
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                require_safe_selector(selector)?;
                let timeout_ms = args
                    .get("timeout_ms")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(30000);
                let script = format!(
                    r#"
                    new Promise((resolve, reject) => {{
                        const timeout = {};
                        const interval = 100;
                        let elapsed = 0;

                        const check = () => {{
                            const el = document.querySelector('{}');
                            if (!el) {{
                                elapsed += interval;
                                if (elapsed >= timeout) {{
                                    reject(new Error('Element not found'));
                                    return;
                                }}
                                setTimeout(check, interval);
                                return;
                            }}

                            const rect = el.getBoundingClientRect();
                            const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
                            const isEnabled = !el.disabled;

                            if (isVisible && isEnabled) {{
                                resolve(true);
                                return;
                            }}

                            elapsed += interval;
                            if (elapsed >= timeout) {{
                                reject(new Error('Timeout waiting for element to be interactive'));
                                return;
                            }}


                            setTimeout(check, interval);
                        }};

                        check();
                    }})
                    "#,
                    timeout_ms, selector
                );
                client.evaluate(&script).await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_click" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                require_safe_selector(selector)?;
                let (client, tab_id) = get_client().await?;
                DomOperations::click(&client, selector, ClickOptions::default())
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_extract" => {
                let (client, tab_id) = get_client().await?;
                let text = if let Some(selector) = args.get("selector").and_then(|v| v.as_str()) {
                    require_safe_selector(selector)?;
                    DomOperations::get_text(&client, selector)
                        .await
                        .map_err(anyhow::Error::msg)?
                } else {
                    DomOperations::get_text(&client, "body")
                        .await
                        .map_err(anyhow::Error::msg)?
                };
                Ok(ToolResult {
                    success: true,
                    data: json!({ "content": text, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_type" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                require_safe_selector(selector)?;
                let text = args
                    .get("text")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing text parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::type_text(&client, selector, text, TypeOptions::default())
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_wait_for_selector" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                require_safe_selector(selector)?;
                let timeout_ms = args
                    .get("timeout")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(120_000);
                let (client, tab_id) = get_client().await?;
                DomOperations::wait_for_selector(&client, selector, timeout_ms)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_text" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                require_safe_selector(selector)?;
                let (client, tab_id) = get_client().await?;
                let text = DomOperations::get_text(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "text": text, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_content" => {
                let (client, tab_id) = get_client().await?;
                let content = client.get_content().await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "content": content, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_dom_snapshot" => {
                let (client, tab_id) = get_client().await?;
                let content = client.get_content().await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "html": content, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_attribute" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                require_safe_selector(selector)?;
                let attribute = args
                    .get("attribute")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing attribute parameter"))?;
                let (client, tab_id) = get_client().await?;
                let value = DomOperations::get_attribute(&client, selector, attribute)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({
                        "value": value,
                        "selector": selector,
                        "attribute": attribute,
                        "tab_id": tab_id
                    }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_screenshot" => {
                let (client, tab_id) = get_client().await?;
                let bytes = client
                    .capture_screenshot(false)
                    .await
                    .map_err(anyhow::Error::msg)?;
                use base64::{engine::general_purpose::STANDARD, Engine};
                Ok(ToolResult {
                    success: true,
                    data: json!({ "image_base64": STANDARD.encode(bytes), "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_hover" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                require_safe_selector(selector)?;
                let (client, tab_id) = get_client().await?;
                DomOperations::hover(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_focus" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                require_safe_selector(selector)?;
                let (client, tab_id) = get_client().await?;
                DomOperations::focus(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_scroll_into_view" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                require_safe_selector(selector)?;
                let (client, tab_id) = get_client().await?;
                DomOperations::scroll_into_view(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_query_all" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                require_safe_selector(selector)?;
                let (client, tab_id) = get_client().await?;
                let elements = DomOperations::query_all(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                let texts: Vec<String> = elements.into_iter().map(|e| e.text).collect();
                Ok(ToolResult {
                    success: true,
                    data: json!({ "results": texts, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_select_option" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                require_safe_selector(selector)?;
                let value = args
                    .get("value")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing value parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::select_option(&client, selector, value)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "value": value, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_check" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                require_safe_selector(selector)?;
                let (client, tab_id) = get_client().await?;
                DomOperations::check(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_uncheck" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                require_safe_selector(selector)?;
                let (client, tab_id) = get_client().await?;
                DomOperations::uncheck(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_autofill_job_application" => {
                let (client, tab_id) = get_client().await?;
                let mut profile = Self::build_job_autofill_profile(&args)?;
                self.attach_job_profile_file_from_path(
                    &mut profile,
                    &args,
                    "resume_path",
                    "resumeDataUrl",
                    "resumeFileName",
                    "resume.pdf",
                )
                .await?;
                self.attach_job_profile_file_from_path(
                    &mut profile,
                    &args,
                    "cover_letter_path",
                    "coverLetterDataUrl",
                    "coverLetterFileName",
                    "cover-letter.pdf",
                )
                .await?;

                let options = Self::build_job_autofill_options(&args);
                let timeout_ms = args
                    .get("timeout_ms")
                    .and_then(|value| value.as_u64())
                    .unwrap_or(120_000)
                    .clamp(5_000, 300_000);

                let script = build_job_autofill_eval_script(
                    &Value::Object(profile),
                    &Value::Object(options),
                    timeout_ms,
                )?;

                let response = client.evaluate(&script).await.map_err(anyhow::Error::msg)?;
                let success = response
                    .get("success")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let response_error = response
                    .get("error")
                    .and_then(Value::as_str)
                    .map(|value| value.to_string());

                Ok(ToolResult {
                    success,
                    data: json!({
                        "tab_id": tab_id,
                        "platform": response.get("platform").cloned().unwrap_or(Value::Null),
                        "filled_count": response.get("filledCount").cloned().unwrap_or(json!(0)),
                        "skipped_count": response.get("skippedCount").cloned().unwrap_or(json!(0)),
                        "missing_required_fields": response
                            .get("missingRequiredFields")
                            .cloned()
                            .unwrap_or_else(|| json!([])),
                        "submitted": response.get("submitted").cloned().unwrap_or(json!(false)),
                        "steps_advanced": response.get("stepsAdvanced").cloned().unwrap_or(json!(0)),
                        "details": response.get("details").cloned().unwrap_or_else(|| json!({})),
                        "result": response
                    }),
                    error: if success {
                        None
                    } else {
                        Some(response_error.unwrap_or_else(|| {
                            "Job autofill failed in browser context".to_string()
                        }))
                    },
                    metadata: HashMap::from([("tab_id".to_string(), json!(tab_id))]),
                })
            }
            "browser_navigate" => {
                let url = args
                    .get("url")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing url parameter"))?;
                let tab_id = browser_state
                    .resolve_cdp_tab(None, true, Some(url))
                    .await
                    .map_err(anyhow::Error::msg)?;
                let client = browser_state
                    .get_cdp_client_for_tab(&tab_id)
                    .await
                    .map_err(anyhow::Error::msg)?;
                client.navigate(url).await.map_err(anyhow::Error::msg)?;

                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "url": url, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            _ => Err(anyhow!("Unknown browser tool: {}", tool_id)),
        }
    }

    pub(crate) async fn execute_browser_navigate_tool(
        &self,
        args: &HashMap<String, Value>,
        action_id: &str,
    ) -> Result<ToolResult> {
        let url = args
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing url parameter"))?;
        let tool_id = action_id;

        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::BrowserStateWrapper;
            use tauri::Manager;

            // Emit progress: starting navigation
            emit_tool_progress(
                app,
                tool_id,
                0.1,
                Some(&format!("Navigating to {}", &url[..url.len().min(50)])),
            );

            let browser_state = app.state::<BrowserStateWrapper>();

            emit_tool_progress(app, tool_id, 0.3, Some("Browser ready"));

            let tab_id = match browser_state.resolve_cdp_tab(None, true, Some(url)).await {
                Ok(tab_id) => tab_id,
                Err(e) => {
                    let err_msg = format!("Failed to resolve browser tab: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            emit_tool_progress(app, tool_id, 0.6, Some("Loading page..."));

            let client = match browser_state.get_cdp_client_for_tab(&tab_id).await {
                Ok(client) => client,
                Err(e) => {
                    let err_msg = format!("Failed to connect to browser tab: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            match client.navigate(url).await {
                Ok(_) => {
                    emit_tool_progress(app, tool_id, 1.0, Some("Page loaded"));
                    Ok(ToolResult {
                        success: true,
                        data: json!({ "success": true, "url": url, "tab_id": tab_id }),
                        error: None,
                        metadata: HashMap::new(),
                    })
                }
                Err(e) => {
                    let err_msg = format!("Failed to navigate: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    })
                }
            }
        } else {
            let err_msg = "App handle not available for browser navigation".to_string();
            Ok(ToolResult {
                success: false,
                data: json!({ "error": err_msg.clone(), "success": false }),
                error: Some(err_msg),
                metadata: HashMap::new(),
            })
        }
    }

    pub(super) fn build_job_autofill_profile(
        args: &HashMap<String, Value>,
    ) -> Result<serde_json::Map<String, Value>> {
        let mut profile = Self::parse_object_argument(args, "profile").unwrap_or_default();

        let canonical_fields = [
            "firstName",
            "lastName",
            "fullName",
            "email",
            "phone",
            "locationCity",
            "locationState",
            "locationCountry",
            "linkedinUrl",
            "githubUrl",
            "portfolioUrl",
            "websiteUrl",
            "currentCompany",
            "currentTitle",
            "yearsOfExperience",
            "workAuthorization",
            "requiresSponsorship",
            "salaryExpectation",
            "resumeText",
            "coverLetterText",
            "customAnswers",
            "files",
        ];

        for key in canonical_fields {
            if profile.contains_key(key) {
                continue;
            }
            if let Some(value) = args.get(key) {
                if Self::value_is_present(value) {
                    profile.insert(key.to_string(), value.clone());
                }
            }
        }

        let aliases = [
            ("first_name", "firstName"),
            ("last_name", "lastName"),
            ("full_name", "fullName"),
            ("location_city", "locationCity"),
            ("location_state", "locationState"),
            ("location_country", "locationCountry"),
            ("linkedin_url", "linkedinUrl"),
            ("github_url", "githubUrl"),
            ("portfolio_url", "portfolioUrl"),
            ("website_url", "websiteUrl"),
            ("current_company", "currentCompany"),
            ("current_title", "currentTitle"),
            ("years_of_experience", "yearsOfExperience"),
            ("work_authorization", "workAuthorization"),
            ("requires_sponsorship", "requiresSponsorship"),
            ("salary_expectation", "salaryExpectation"),
            ("resume_text", "resumeText"),
            ("cover_letter_text", "coverLetterText"),
            ("custom_answers", "customAnswers"),
        ];

        for (alias_key, canonical_key) in aliases {
            if profile.contains_key(canonical_key) {
                continue;
            }
            if let Some(value) = args.get(alias_key) {
                if Self::value_is_present(value) {
                    profile.insert(canonical_key.to_string(), value.clone());
                }
            }
        }

        if profile.is_empty() {
            return Err(anyhow!(
                "Missing profile parameter. Provide a 'profile' object with fields like firstName/email/phone."
            ));
        }

        Ok(profile)
    }

    pub(super) fn build_job_autofill_options(
        args: &HashMap<String, Value>,
    ) -> serde_json::Map<String, Value> {
        let mut options = Self::parse_object_argument(args, "options").unwrap_or_default();

        let canonical_fields = [
            "platform",
            "autoSubmit",
            "allowSubmitWithMissingRequired",
            "includeOptionalFields",
            "delayMs",
            "maxSubmitSteps",
        ];

        for key in canonical_fields {
            if options.contains_key(key) {
                continue;
            }
            if let Some(value) = args.get(key) {
                if Self::value_is_present(value) {
                    options.insert(key.to_string(), value.clone());
                }
            }
        }

        let aliases = [
            ("auto_submit", "autoSubmit"),
            (
                "allow_submit_with_missing_required",
                "allowSubmitWithMissingRequired",
            ),
            ("include_optional_fields", "includeOptionalFields"),
            ("delay_ms", "delayMs"),
            ("max_submit_steps", "maxSubmitSteps"),
        ];

        for (alias_key, canonical_key) in aliases {
            if options.contains_key(canonical_key) {
                continue;
            }
            if let Some(value) = args.get(alias_key) {
                if Self::value_is_present(value) {
                    options.insert(canonical_key.to_string(), value.clone());
                }
            }
        }

        options
    }

    pub(crate) async fn attach_job_profile_file_from_path(
        &self,
        profile: &mut serde_json::Map<String, Value>,
        args: &HashMap<String, Value>,
        path_key: &str,
        data_key: &str,
        file_name_key: &str,
        default_file_name: &str,
    ) -> Result<()> {
        let Some(path) = args
            .get(path_key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return Ok(());
        };

        self.validate_path(path).await?;
        let (data_url, file_name) =
            crate::core::llm::job_autofill_runtime::encode_file_as_data_url(
                path,
                default_file_name,
            )
            .await
            .map_err(|e| anyhow!("Failed to encode {} '{}': {}", path_key, path, e))?;

        let files_value = profile
            .entry("files".to_string())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        if !files_value.is_object() {
            *files_value = Value::Object(serde_json::Map::new());
        }

        if let Some(files) = files_value.as_object_mut() {
            files
                .entry(data_key.to_string())
                .or_insert_with(|| Value::String(data_url));
            files
                .entry(file_name_key.to_string())
                .or_insert_with(|| Value::String(file_name));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---------------------------------------------------------------
    // Safe selectors — must all pass
    // ---------------------------------------------------------------

    #[test]
    fn test_safe_id_selector() {
        assert!(validate_css_selector("#myid").is_ok());
    }

    #[test]
    fn test_safe_class_selector() {
        assert!(validate_css_selector(".myclass").is_ok());
    }

    #[test]
    fn test_safe_tag_selector() {
        assert!(validate_css_selector("div").is_ok());
    }

    #[test]
    fn test_safe_child_combinator() {
        assert!(validate_css_selector("div > p").is_ok());
    }

    #[test]
    fn test_safe_adjacent_sibling_combinator() {
        assert!(validate_css_selector("h1 + p").is_ok());
    }

    #[test]
    fn test_safe_general_sibling_combinator() {
        assert!(validate_css_selector("h1 ~ p").is_ok());
    }

    #[test]
    fn test_safe_descendant_combinator() {
        assert!(validate_css_selector("div span").is_ok());
    }

    #[test]
    fn test_safe_attribute_selector() {
        assert!(validate_css_selector("input[type=text]").is_ok());
    }

    #[test]
    fn test_safe_data_testid_attribute() {
        assert!(validate_css_selector("input[data-testid=foo]").is_ok());
    }

    #[test]
    fn test_safe_nth_child() {
        assert!(validate_css_selector("li:nth-child(2n+1)").is_ok());
    }

    #[test]
    fn test_safe_first_child() {
        assert!(validate_css_selector("p:first-child").is_ok());
    }

    #[test]
    fn test_safe_last_child() {
        assert!(validate_css_selector("p:last-child").is_ok());
    }

    #[test]
    fn test_safe_checked_pseudo() {
        assert!(validate_css_selector("input:checked").is_ok());
    }

    #[test]
    fn test_safe_disabled_pseudo() {
        assert!(validate_css_selector("button:disabled").is_ok());
    }

    #[test]
    fn test_safe_hover_pseudo() {
        assert!(validate_css_selector("a:hover").is_ok());
    }

    #[test]
    fn test_safe_focus_pseudo() {
        assert!(validate_css_selector("input:focus").is_ok());
    }

    #[test]
    fn test_safe_not_simple() {
        assert!(validate_css_selector("div:not(.hidden)").is_ok());
    }

    #[test]
    fn test_safe_pseudo_element_before() {
        assert!(validate_css_selector("p::before").is_ok());
    }

    #[test]
    fn test_safe_pseudo_element_after() {
        assert!(validate_css_selector("p::after").is_ok());
    }

    #[test]
    fn test_safe_complex_real_world_selector() {
        assert!(validate_css_selector(
            "div.container > ul.list > li:first-child"
        )
        .is_ok());
    }

    #[test]
    fn test_safe_multiple_classes() {
        assert!(validate_css_selector(".btn.btn-primary.active").is_ok());
    }

    #[test]
    fn test_safe_universal_selector() {
        assert!(validate_css_selector("*").is_ok());
    }

    #[test]
    fn test_safe_placeholder_pseudo() {
        assert!(validate_css_selector("input::placeholder").is_ok());
    }

    // ---------------------------------------------------------------
    // Dangerous selectors — must all be rejected
    // ---------------------------------------------------------------

    #[test]
    fn test_reject_empty_selector() {
        let err = validate_css_selector("").unwrap_err();
        assert!(err.contains("empty"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_whitespace_only() {
        let err = validate_css_selector("   ").unwrap_err();
        assert!(err.contains("empty"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_at_import() {
        let err = validate_css_selector("@import url(evil.css)").unwrap_err();
        assert!(err.contains("@import"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_at_import_case_insensitive() {
        let err = validate_css_selector("@IMPORT url(evil.css)").unwrap_err();
        assert!(err.contains("@import"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_javascript_protocol() {
        let err = validate_css_selector("a[href=javascript:alert(1)]").unwrap_err();
        assert!(err.contains("javascript:"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_javascript_protocol_case_insensitive() {
        let err = validate_css_selector("a[href=JAVASCRIPT:void(0)]").unwrap_err();
        assert!(err.contains("javascript:"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_expression_parenthesis() {
        let err = validate_css_selector("div[style=expression(alert(1))]").unwrap_err();
        assert!(err.contains("expression"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_expression_colon() {
        let err = validate_css_selector("div[style=expression:alert]").unwrap_err();
        assert!(err.contains("expression"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_moz_binding() {
        let err = validate_css_selector("div[-moz-binding:url(x)]").unwrap_err();
        assert!(err.contains("-moz-binding"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_behavior() {
        let err = validate_css_selector("div[style=behavior:url(x)]").unwrap_err();
        assert!(err.contains("behavior"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_url_function() {
        let err = validate_css_selector("div[style=url(http://evil.com)]").unwrap_err();
        assert!(err.contains("url()"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_angle_bracket_open() {
        let err = validate_css_selector("<script>alert(1)</script>").unwrap_err();
        assert!(err.contains("disallowed character"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_single_quote() {
        let err = validate_css_selector("div'); alert('xss").unwrap_err();
        assert!(err.contains("disallowed character"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_double_quote() {
        let err = validate_css_selector(r#"div"); alert("xss"#).unwrap_err();
        assert!(err.contains("disallowed character"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_backslash() {
        let err = validate_css_selector(r"div\").unwrap_err();
        assert!(err.contains("disallowed character"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_null_byte() {
        let err = validate_css_selector("div\0.class").unwrap_err();
        assert!(err.contains("null byte"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_nested_not() {
        let err = validate_css_selector(":not(:not(div))").unwrap_err();
        assert!(err.contains("nested :not()"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_nested_not_deep() {
        let err = validate_css_selector("#id:not(:not(.x))").unwrap_err();
        assert!(err.contains("nested :not()"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_has_pseudo() {
        let err = validate_css_selector("div:has(> .child)").unwrap_err();
        assert!(err.contains(":has()"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_unknown_pseudo_class() {
        let err = validate_css_selector("div:matches(.foo)").unwrap_err();
        assert!(err.contains("unsupported pseudo"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_is_pseudo() {
        let err = validate_css_selector("div:is(.a, .b)").unwrap_err();
        assert!(err.contains("unsupported pseudo"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_where_pseudo() {
        let err = validate_css_selector("div:where(.foo)").unwrap_err();
        assert!(err.contains("unsupported pseudo"), "unexpected: {err}");
    }

    #[test]
    fn test_reject_oversized_selector() {
        let long = "a".repeat(2049);
        let err = validate_css_selector(&long).unwrap_err();
        assert!(err.contains("maximum length"), "unexpected: {err}");
    }

    // ---------------------------------------------------------------
    // Edge cases — make sure colon inside attribute values is not
    // misidentified as a pseudo-class.
    // ---------------------------------------------------------------

    #[test]
    fn test_colon_inside_attribute_brackets_is_safe() {
        // Attribute selectors like [data-url=http://x.com] contain colons
        // but those are not pseudo-classes.
        assert!(validate_css_selector("a[data-url=http://x.com]").is_ok());
    }

    #[test]
    fn test_multiple_safe_pseudos_combined() {
        assert!(
            validate_css_selector("input:enabled:checked:first-child").is_ok()
        );
    }

    // ---------------------------------------------------------------
    // require_safe_selector wrapper
    // ---------------------------------------------------------------

    #[test]
    fn test_require_safe_selector_ok() {
        assert!(require_safe_selector("#safe").is_ok());
    }

    #[test]
    fn test_require_safe_selector_err() {
        let result = require_safe_selector("@import url(x)");
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("@import"), "unexpected: {msg}");
    }
}
