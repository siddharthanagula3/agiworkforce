/**
 * Visual Design Capabilities
 * AI-powered CSS generation and UI styling from natural language
 */
use crate::router::{ChatMessage, LLMRequest, LLMRouter, RouterPreferences};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

/// Design request from user
#[derive(Debug, Deserialize)]
pub struct DesignRequest {
    pub description: String,
    pub selector: Option<String>,
    pub context: Option<DesignContext>,
    pub constraints: Option<DesignConstraints>,
}

/// Design context for better CSS generation
#[derive(Debug, Deserialize, Serialize)]
pub struct DesignContext {
    pub current_styles: Option<String>,
    pub element_type: Option<String>,
    pub parent_styles: Option<String>,
    pub viewport_width: Option<u32>,
    pub viewport_height: Option<u32>,
}

/// Design constraints
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DesignConstraints {
    pub color_scheme: Option<String>, // "light", "dark", "auto"
    pub max_width: Option<u32>,
    pub responsive: bool,
    pub accessibility: bool,
}

impl Default for DesignConstraints {
    fn default() -> Self {
        Self {
            color_scheme: None,
            max_width: None,
            responsive: true,
            accessibility: true,
        }
    }
}

/// Generated CSS response
#[derive(Debug, Serialize)]
pub struct DesignResponse {
    pub css: String,
    pub explanation: String,
    pub preview_html: Option<String>,
    pub accessibility_notes: Option<String>,
}

/// Theme colors
#[derive(Debug, Deserialize, Serialize)]
pub struct ColorScheme {
    pub primary: String,
    pub secondary: String,
    pub background: String,
    pub surface: String,
    pub text: String,
    pub text_secondary: String,
    pub accent: String,
    pub error: String,
    pub warning: String,
    pub success: String,
}

/// Generate CSS from natural language description
#[tauri::command]
pub async fn design_generate_css(
    request: DesignRequest,
    router_state: State<'_, Arc<Mutex<LLMRouter>>>,
) -> Result<DesignResponse, String> {
    tracing::info!("Generating CSS from description: {}", request.description);

    // Build comprehensive prompt for LLM
    let prompt = build_css_generation_prompt(&request)?;

    // Query LLM
    let llm_request = LLMRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
            tool_calls: None,
            tool_call_id: None,
        }],
        model: "".to_string(), // Will be set by router
        max_tokens: Some(1500),
        temperature: Some(0.3), // Lower temperature for more consistent CSS
        stream: false,
        tools: None,
        tool_choice: None,
    };

    let router = router_state.lock().await;
    let preferences = RouterPreferences::default();
    let candidates = router.candidates(&llm_request, &preferences);

    if candidates.is_empty() {
        return Err("No LLM providers configured".to_string());
    }

    let outcome = router
        .invoke_candidate(&candidates[0], &llm_request)
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    // Parse response and extract CSS
    let (css, explanation) = parse_css_response(&outcome.response.content)?;

    // Generate accessibility notes if requested
    let accessibility_notes = if request
        .constraints
        .as_ref()
        .map(|c| c.accessibility)
        .unwrap_or(true)
    {
        Some(generate_accessibility_notes(&css))
    } else {
        None
    };

    Ok(DesignResponse {
        css,
        explanation,
        preview_html: None,
        accessibility_notes,
    })
}

/// Apply CSS to element via selector
#[tauri::command]
pub async fn design_apply_css(selector: String, css: String) -> Result<String, String> {
    tracing::info!("Applying CSS to selector: {}", selector);

    // In a real implementation, this would communicate with the browser
    // via CDP or inject a <style> tag

    // For now, return instructions for manual application
    Ok(format!(
        "Apply the following CSS to '{}': {}",
        selector, css
    ))
}

/// Extract existing styles from element
#[tauri::command]
pub async fn design_get_element_styles(selector: String) -> Result<String, String> {
    tracing::info!("Getting styles for: {}", selector);

    // In real implementation, would use CDP to get computed styles
    // For now, return placeholder
    Ok(String::new())
}

/// Generate a complete color scheme
#[tauri::command]
pub async fn design_generate_color_scheme(
    base_color: String,
    theme: String, // "light" or "dark"
    router_state: State<'_, Arc<Mutex<LLMRouter>>>,
) -> Result<ColorScheme, String> {
    tracing::info!(
        "Generating {} color scheme from base: {}",
        theme,
        base_color
    );

    let prompt = format!(
        r##"Generate a complete, professional {} color scheme based on the primary color {}.

Provide colors in hex format for:
- primary: The base color provided
- secondary: A complementary color
- background: Main background color
- surface: Card/surface background
- text: Primary text color
- text_secondary: Secondary/muted text
- accent: Accent/highlight color
- error: Error state color
- warning: Warning state color
- success: Success state color

Return ONLY valid JSON in this exact format:
{{
  "primary": "#hexcode",
  "secondary": "#hexcode",
  "background": "#hexcode",
  "surface": "#hexcode",
  "text": "#hexcode",
  "text_secondary": "#hexcode",
  "accent": "#hexcode",
  "error": "#hexcode",
  "warning": "#hexcode",
  "success": "#hexcode"
}}

Ensure colors have proper contrast ratios (WCAG AA minimum):
- Text on background: at least 4.5:1
- Text on surface: at least 4.5:1"##,
        theme, base_color
    );

    let llm_request = LLMRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
            tool_calls: None,
            tool_call_id: None,
        }],
        model: "".to_string(), // Will be set by router
        max_tokens: Some(500),
        temperature: Some(0.4),
        stream: false,
        tools: None,
        tool_choice: None,
    };

    let router = router_state.lock().await;
    let preferences = RouterPreferences::default();
    let candidates = router.candidates(&llm_request, &preferences);

    if candidates.is_empty() {
        return Err("No LLM providers configured".to_string());
    }

    let outcome = router
        .invoke_candidate(&candidates[0], &llm_request)
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    // Extract JSON from response
    let json_str = extract_json_from_response(&outcome.response.content)?;

    serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse color scheme: {}", e))
}

/// Suggest design improvements
#[tauri::command]
pub async fn design_suggest_improvements(
    current_css: String,
    goals: Vec<String>, // e.g., ["better contrast", "more modern", "mobile-friendly"]
    router_state: State<'_, Arc<Mutex<LLMRouter>>>,
) -> Result<Vec<DesignSuggestion>, String> {
    tracing::info!("Suggesting design improvements for {} goals", goals.len());

    let goals_str = goals.join(", ");
    let prompt = format!(
        r#"Analyze this CSS and suggest specific improvements to achieve these goals: {}

Current CSS:
```css
{}
```

Provide 3-5 specific, actionable suggestions. For each suggestion:
1. What to change
2. Why it improves the design
3. The updated CSS code

Return as JSON array:
[
  {{
    "title": "Suggestion title",
    "description": "Why this helps",
    "css": "Updated CSS code",
    "impact": "high|medium|low"
  }}
]"#,
        goals_str, current_css
    );

    let llm_request = LLMRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
            tool_calls: None,
            tool_call_id: None,
        }],
        model: "".to_string(), // Will be set by router
        max_tokens: Some(2000),
        temperature: Some(0.5),
        stream: false,
        tools: None,
        tool_choice: None,
    };

    let router = router_state.lock().await;
    let preferences = RouterPreferences::default();
    let candidates = router.candidates(&llm_request, &preferences);

    if candidates.is_empty() {
        return Err("No LLM providers configured".to_string());
    }

    let outcome = router
        .invoke_candidate(&candidates[0], &llm_request)
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    let json_str = extract_json_from_response(&outcome.response.content)?;

    serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse suggestions: {}", e))
}

/// Convert design tokens to CSS variables
#[tauri::command]
pub async fn design_tokens_to_css(tokens: DesignTokens) -> Result<String, String> {
    tracing::info!("Converting design tokens to CSS");

    let mut css = String::from(":root {\n");

    // Colors
    for (name, value) in tokens.colors {
        css.push_str(&format!("  --color-{}: {};\n", name, value));
    }

    // Spacing
    for (name, value) in tokens.spacing {
        css.push_str(&format!("  --spacing-{}: {};\n", name, value));
    }

    // Typography
    for (name, value) in tokens.typography {
        css.push_str(&format!("  --font-{}: {};\n", name, value));
    }

    // Shadows
    for (name, value) in tokens.shadows {
        css.push_str(&format!("  --shadow-{}: {};\n", name, value));
    }

    // Border radius
    for (name, value) in tokens.radii {
        css.push_str(&format!("  --radius-{}: {};\n", name, value));
    }

    css.push_str("}\n");

    Ok(css)
}

/// Analyze CSS for accessibility issues
#[tauri::command]
pub async fn design_check_accessibility(
    css: String,
    router_state: State<'_, Arc<Mutex<LLMRouter>>>,
) -> Result<AccessibilityReport, String> {
    tracing::info!("Checking CSS accessibility");

    let prompt = format!(
        r#"Analyze this CSS for accessibility issues according to WCAG 2.1 guidelines.

CSS:
```css
{}
```

Check for:
- Color contrast ratios (minimum 4.5:1 for normal text, 3:1 for large text)
- Focus indicators
- Color as sole indicator
- Font sizes (minimum 16px for body text)
- Touch target sizes (minimum 44x44px for interactive elements)

Return as JSON:
{{
  "score": 85,
  "level": "AA",
  "issues": [
    {{
      "severity": "high|medium|low",
      "description": "Issue description",
      "suggestion": "How to fix",
      "wcag_criterion": "1.4.3"
    }}
  ],
  "passed_checks": ["List of passed checks"],
  "summary": "Overall assessment"
}}"#,
        css
    );

    let llm_request = LLMRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
            tool_calls: None,
            tool_call_id: None,
        }],
        model: "".to_string(), // Will be set by router
        max_tokens: Some(1500),
        temperature: Some(0.3),
        stream: false,
        tools: None,
        tool_choice: None,
    };

    let router = router_state.lock().await;
    let preferences = RouterPreferences::default();
    let candidates = router.candidates(&llm_request, &preferences);

    if candidates.is_empty() {
        return Err("No LLM providers configured".to_string());
    }

    let outcome = router
        .invoke_candidate(&candidates[0], &llm_request)
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    let json_str = extract_json_from_response(&outcome.response.content)?;

    serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse accessibility report: {}", e))
}

// Helper functions

fn build_css_generation_prompt(request: &DesignRequest) -> Result<String, String> {
    let mut prompt = String::from(
        "You are an expert CSS developer. Generate CSS code based on this description.\n\n",
    );

    prompt.push_str(&format!("Description: {}\n\n", request.description));

    if let Some(ref selector) = request.selector {
        prompt.push_str(&format!("Target selector: {}\n", selector));
    }

    if let Some(ref context) = request.context {
        prompt.push_str("Context:\n");
        if let Some(ref current) = context.current_styles {
            prompt.push_str(&format!("Current styles: {}\n", current));
        }
        if let Some(ref element_type) = context.element_type {
            prompt.push_str(&format!("Element type: {}\n", element_type));
        }
    }

    let constraints = request.constraints.as_ref().cloned().unwrap_or_default();

    prompt.push_str("\nRequirements:\n");
    if constraints.responsive {
        prompt.push_str("- Must be responsive (use relative units, media queries)\n");
    }
    if constraints.accessibility {
        prompt.push_str("- Must meet WCAG AA standards (contrast, focus states)\n");
    }
    if let Some(ref scheme) = constraints.color_scheme {
        prompt.push_str(&format!("- Color scheme: {}\n", scheme));
    }

    prompt.push_str("\nReturn:\n");
    prompt.push_str("1. CSS code (clean, well-commented)\n");
    prompt.push_str("2. Brief explanation of design choices\n");
    prompt.push_str("\nFormat:\n```css\n[CSS CODE]\n```\n\n[EXPLANATION]");

    Ok(prompt)
}

fn parse_css_response(response: &str) -> Result<(String, String), String> {
    // Extract CSS from markdown code blocks
    let css = if let Some(start) = response.find("```css") {
        let content_start = start + 6;
        if let Some(end) = response[content_start..].find("```") {
            response[content_start..content_start + end]
                .trim()
                .to_string()
        } else {
            return Err("Malformed CSS code block".to_string());
        }
    } else {
        // Try to find any code block
        if let Some(start) = response.find("```") {
            let content_start = response[start..]
                .find('\n')
                .map(|n| start + n + 1)
                .unwrap_or(start + 3);
            if let Some(end) = response[content_start..].find("```") {
                response[content_start..content_start + end]
                    .trim()
                    .to_string()
            } else {
                return Err("Malformed code block".to_string());
            }
        } else {
            return Err("No CSS code found in response".to_string());
        }
    };

    // Extract explanation (text after CSS block)
    let explanation = if let Some(css_end) = response.rfind("```") {
        response[css_end + 3..].trim().to_string()
    } else {
        "No explanation provided".to_string()
    };

    Ok((css, explanation))
}

fn extract_json_from_response(response: &str) -> Result<String, String> {
    // Try to find JSON in markdown code blocks first
    if let Some(start) = response.find("```json") {
        let content_start = start + 7;
        if let Some(end) = response[content_start..].find("```") {
            return Ok(response[content_start..content_start + end]
                .trim()
                .to_string());
        }
    }

    // Try to find raw JSON
    if let Some(start) = response.find('{') {
        if let Some(end) = response.rfind('}') {
            return Ok(response[start..=end].trim().to_string());
        }
    }

    Err("No valid JSON found in response".to_string())
}

fn generate_accessibility_notes(css: &str) -> String {
    let mut notes = Vec::new();

    // Check for color usage
    if css.contains("color:") {
        notes.push("• Ensure text colors have sufficient contrast (4.5:1 ratio minimum)");
    }

    // Check for interactive elements
    if css.contains(":hover") && !css.contains(":focus") {
        notes.push("• Add :focus styles to match :hover for keyboard accessibility");
    }

    // Check for font sizing
    if css.contains("font-size") {
        notes.push("• Verify font sizes are at least 16px for body text");
    }

    // Check for animations
    if css.contains("animation") || css.contains("transition") {
        notes.push(
            "• Consider adding @media (prefers-reduced-motion) for users sensitive to motion",
        );
    }

    if notes.is_empty() {
        "No specific accessibility concerns detected. Always test with real users.".to_string()
    } else {
        notes.join("\n")
    }
}

// Supporting types

#[derive(Debug, Serialize, Deserialize)]
pub struct DesignSuggestion {
    pub title: String,
    pub description: String,
    pub css: String,
    pub impact: String,
}

#[derive(Debug, Deserialize)]
pub struct DesignTokens {
    pub colors: std::collections::HashMap<String, String>,
    pub spacing: std::collections::HashMap<String, String>,
    pub typography: std::collections::HashMap<String, String>,
    pub shadows: std::collections::HashMap<String, String>,
    pub radii: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AccessibilityReport {
    pub score: u8,
    pub level: String, // "A", "AA", "AAA"
    pub issues: Vec<AccessibilityIssue>,
    pub passed_checks: Vec<String>,
    pub summary: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AccessibilityIssue {
    pub severity: String,
    pub description: String,
    pub suggestion: String,
    pub wcag_criterion: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_css_response() {
        let response = r#"```css
.button {
    color: blue;
}
```

This creates a blue button."#;

        let (css, explanation) = parse_css_response(response).unwrap();
        assert!(css.contains("color: blue"));
        assert!(explanation.contains("blue button"));
    }

    #[test]
    fn test_extract_json() {
        let response = r#"```json
{"key": "value"}
```"#;

        let json = extract_json_from_response(response).unwrap();
        assert_eq!(json, r#"{"key": "value"}"#);
    }
}
