use super::safety_patterns;
use super::types::ComputerAction;
use anyhow::Result;

pub struct ComputerUseSafety;

impl Default for ComputerUseSafety {
    fn default() -> Self {
        Self::new()
    }
}

impl ComputerUseSafety {
    pub fn new() -> Self {
        // Ensure shared patterns are initialised
        let _ = safety_patterns::dangerous_command_patterns();
        let _ = safety_patterns::dangerous_key_combinations();
        Self
    }

    pub fn is_action_safe(&self, action: &ComputerAction) -> Result<bool> {
        match action {
            ComputerAction::Type { text } => Ok(self.is_text_safe(text)),
            ComputerAction::Click { x, y } => Ok(self.is_click_location_safe(*x, *y)),
            ComputerAction::DoubleClick { x, y } => Ok(self.is_click_location_safe(*x, *y)),
            ComputerAction::RightClick { x, y } => Ok(self.is_click_location_safe(*x, *y)),
            ComputerAction::KeyPress { key } => Ok(self.is_key_safe(key)),
            ComputerAction::Scroll { .. } => Ok(true),
            ComputerAction::Wait { .. } => Ok(true),
            ComputerAction::DragTo { .. } => Ok(true),
        }
    }

    fn is_text_safe(&self, text: &str) -> bool {
        let patterns = safety_patterns::dangerous_command_patterns();

        for pattern in patterns {
            if pattern.is_match(text) {
                tracing::warn!("Dangerous pattern detected in text: {:?}", text);
                return false;
            }
        }

        if text.len() > 10_000 {
            tracing::warn!("Text too long: {} characters", text.len());
            return false;
        }

        true
    }

    fn is_click_location_safe(&self, x: i32, y: i32) -> bool {
        if x < 0 || y < 0 {
            tracing::warn!("Negative coordinates not allowed: ({}, {})", x, y);
            return false;
        }

        if x < 10 && y < 10 {
            tracing::warn!("Click too close to top-left corner: ({}, {})", x, y);
            return false;
        }

        if y <= 15 && x >= 1800 {
            tracing::warn!("Click near window controls blocked: ({}, {})", x, y);
            return false;
        }

        if y >= 1040 && (x <= 120 || x >= 1800) {
            tracing::warn!("Click near system taskbar blocked: ({}, {})", x, y);
            return false;
        }

        true
    }

    fn is_key_safe(&self, key: &str) -> bool {
        let dangerous_keys = safety_patterns::dangerous_key_combinations();

        if dangerous_keys.iter().any(|k| k == key) {
            tracing::warn!("Dangerous key combination blocked: {}", key);
            return false;
        }

        true
    }

    pub fn is_task_safe(&self, task: &str) -> bool {
        let task_lower = task.to_lowercase();

        for keyword in safety_patterns::DANGEROUS_TASK_KEYWORDS {
            if task_lower.contains(keyword) {
                tracing::warn!("Dangerous task detected: {}", task);
                return false;
            }
        }

        true
    }

    pub fn get_risk_level(&self, action: &ComputerAction) -> u8 {
        match action {
            ComputerAction::Type { text } => {
                if !self.is_text_safe(text) {
                    10
                } else if text.len() > 1000 {
                    5
                } else {
                    2
                }
            }
            ComputerAction::Click { .. }
            | ComputerAction::DoubleClick { .. }
            | ComputerAction::RightClick { .. } => 3,
            ComputerAction::KeyPress { key } => {
                if !self.is_key_safe(key) {
                    10
                } else {
                    4
                }
            }
            ComputerAction::Scroll { .. } => 1,
            ComputerAction::Wait { .. } => 0,
            ComputerAction::DragTo { .. } => 2,
        }
    }
}

/// Sanitizes tool output before forwarding to LLM context.
/// Strips patterns that look like secrets to prevent prompt injection leaks.
pub fn sanitize_tool_output(output: &str) -> String {
    use once_cell::sync::Lazy;
    use regex::Regex;

    static SECRET_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
        vec![
            Regex::new(r"sk-[A-Za-z0-9_-]{32,}").expect("valid regex: sk- API key pattern"),
            Regex::new(r"sk_live_[A-Za-z0-9]{24,}").expect("valid regex: sk_live_ key pattern"),
            Regex::new(r"sk_test_[A-Za-z0-9]{24,}").expect("valid regex: sk_test_ key pattern"),
            Regex::new(r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}").expect("valid regex: JWT pattern"),
            Regex::new(r"Bearer\s+[A-Za-z0-9_-]{20,}").expect("valid regex: bearer token pattern"),
        ]
    });

    let mut result = output.to_string();
    for pattern in SECRET_PATTERNS.iter() {
        result = pattern.replace_all(&result, "[REDACTED]").to_string();
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_text_safe() {
        let safety = ComputerUseSafety::new();

        assert!(safety.is_text_safe("Hello world"));
        assert!(safety.is_text_safe("npm install"));
        assert!(!safety.is_text_safe("rm -rf /"));
        assert!(!safety.is_text_safe("format c:"));
        assert!(!safety.is_text_safe("del /f /s /q C:\\*"));
    }

    #[test]
    fn test_is_click_location_safe() {
        let safety = ComputerUseSafety::new();

        assert!(safety.is_click_location_safe(100, 100));
        assert!(safety.is_click_location_safe(960, 540));
        assert!(!safety.is_click_location_safe(-10, 50));
        assert!(!safety.is_click_location_safe(5, 5));
        assert!(!safety.is_click_location_safe(1900, 1070));
    }

    #[test]
    fn test_is_key_safe() {
        let safety = ComputerUseSafety::new();

        assert!(safety.is_key_safe("Enter"));
        assert!(safety.is_key_safe("Ctrl+C"));
        assert!(!safety.is_key_safe("Alt+F4"));
        assert!(!safety.is_key_safe("Ctrl+Alt+Del"));
    }

    #[test]
    fn test_is_task_safe() {
        let safety = ComputerUseSafety::new();

        assert!(safety.is_task_safe("Open notepad and type hello"));
        assert!(safety.is_task_safe("Search for cats on Google"));
        assert!(!safety.is_task_safe("Delete system files"));
        assert!(!safety.is_task_safe("Format drive C:"));
        assert!(!safety.is_task_safe("Hack into the mainframe"));
    }

    #[test]
    fn test_get_risk_level() {
        let safety = ComputerUseSafety::new();

        assert_eq!(safety.get_risk_level(&ComputerAction::Wait { ms: 1000 }), 0);
        assert_eq!(
            safety.get_risk_level(&ComputerAction::Scroll {
                direction: crate::automation::types::ScrollDirection::Down,
                amount: 3
            }),
            1
        );
        assert!(
            safety.get_risk_level(&ComputerAction::Type {
                text: "rm -rf /".to_string()
            }) >= 5
        );
    }

    #[test]
    fn test_sanitize_tool_output_redacts_openai_key() {
        let input = "Found key: sk-abc123def456ghi789jkl012mno345pqr678";
        let result = sanitize_tool_output(input);
        assert_eq!(result, "Found key: [REDACTED]");
        assert!(!result.contains("sk-abc123"));
    }

    #[test]
    fn test_sanitize_tool_output_redacts_stripe_live_key() {
        // Construct dynamically so the full pattern never appears as a static literal.
        let fake_key = format!("sk_live_{}", "abcdefghijklmnopqrstuvwx"); // gitleaks:allow
        let input = format!("STRIPE_KEY={fake_key}");
        let result = sanitize_tool_output(&input);
        assert_eq!(result, "STRIPE_KEY=[REDACTED]");
        assert!(!result.contains("sk_live_"));
    }

    #[test]
    fn test_sanitize_tool_output_redacts_stripe_test_key() {
        // Construct dynamically so the full pattern never appears as a static literal.
        let fake_key = format!("sk_test_{}", "abcdefghijklmnopqrstuvwx"); // gitleaks:allow
        let input = format!("key: {fake_key}");
        let result = sanitize_tool_output(&input);
        assert_eq!(result, "key: [REDACTED]");
        assert!(!result.contains("sk_test_"));
    }

    #[test]
    fn test_sanitize_tool_output_redacts_jwt() {
        let input = "Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0";
        let result = sanitize_tool_output(input);
        assert!(result.contains("[REDACTED]"));
        assert!(!result.contains("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
    }

    #[test]
    fn test_sanitize_tool_output_redacts_bearer_token() {
        let input = "Header: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc";
        let result = sanitize_tool_output(input);
        assert!(result.contains("[REDACTED]"));
        assert!(!result.contains("Bearer eyJ"));
    }

    #[test]
    fn test_sanitize_tool_output_preserves_safe_text() {
        let input = "Hello world, this is normal output with no secrets.";
        let result = sanitize_tool_output(input);
        assert_eq!(result, input);
    }

    #[test]
    fn test_sanitize_tool_output_multiple_secrets() {
        // Construct dynamically so the full patterns never appear as static literals.
        let live_key = format!("sk_live_{}", "abcdefghijklmnopqrstuvwx"); // gitleaks:allow
        let input = format!("key1=sk-abc123def456ghi789jkl012mno345pqr678 key2={live_key}");
        let result = sanitize_tool_output(&input);
        assert_eq!(result, "key1=[REDACTED] key2=[REDACTED]");
    }
}
