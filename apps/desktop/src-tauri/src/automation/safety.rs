use super::types::ComputerAction;
use anyhow::Result;
use regex::Regex;
use std::sync::OnceLock;

static DANGEROUS_PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
static DANGEROUS_KEYS: OnceLock<Vec<String>> = OnceLock::new();

pub struct ComputerUseSafety;

impl ComputerUseSafety {
    pub fn new() -> Self {
        // Initialize dangerous patterns
        DANGEROUS_PATTERNS.get_or_init(|| {
            vec![
                // Dangerous shell commands
                Regex::new(r"(?i)rm\s+-rf").unwrap(),
                Regex::new(r"(?i)format\s+[a-z]:").unwrap(),
                Regex::new(r"(?i)del\s+/[fqs]").unwrap(),
                Regex::new(r"(?i)deltree").unwrap(),
                Regex::new(r"(?i)mkfs").unwrap(),
                // System file deletion
                Regex::new(r"(?i)system32").unwrap(),
                Regex::new(r"(?i)windir").unwrap(),
                // Credential harvesting
                Regex::new(r"(?i)password|passwd|credential|api[_-]?key|secret|token").unwrap(),
                // Registry modifications
                Regex::new(r"(?i)regedit|reg\s+delete|reg\s+add").unwrap(),
            ]
        });

        // Initialize dangerous keys
        DANGEROUS_KEYS.get_or_init(|| {
            vec![
                "Alt+F4".to_string(),
                "Ctrl+Alt+Del".to_string(),
                "Win+L".to_string(), // Lock screen
            ]
        });

        Self
    }

    /// Check if an action is safe to execute
    pub fn is_action_safe(&self, action: &ComputerAction) -> Result<bool> {
        match action {
            ComputerAction::Type { text } => Ok(self.is_text_safe(text)),
            ComputerAction::Click { x, y } => Ok(self.is_click_location_safe(*x, *y)),
            ComputerAction::DoubleClick { x, y } => Ok(self.is_click_location_safe(*x, *y)),
            ComputerAction::RightClick { x, y } => Ok(self.is_click_location_safe(*x, *y)),
            ComputerAction::KeyPress { key } => Ok(self.is_key_safe(key)),
            ComputerAction::Scroll { .. } => Ok(true), // Scrolling is always safe
            ComputerAction::Wait { .. } => Ok(true),   // Waiting is always safe
            ComputerAction::DragTo { .. } => Ok(true), // Dragging is generally safe
        }
    }

    fn is_text_safe(&self, text: &str) -> bool {
        let patterns = DANGEROUS_PATTERNS.get().unwrap();

        // Check for dangerous patterns
        for pattern in patterns {
            if pattern.is_match(text) {
                tracing::warn!("Dangerous pattern detected in text: {:?}", text);
                return false;
            }
        }

        // Block excessively long text (potential DOS)
        if text.len() > 10_000 {
            tracing::warn!("Text too long: {} characters", text.len());
            return false;
        }

        true
    }

    fn is_click_location_safe(&self, x: i32, y: i32) -> bool {
        // Prevent negative coordinates
        if x < 0 || y < 0 {
            tracing::warn!("Negative coordinates not allowed: ({}, {})", x, y);
            return false;
        }

        // Prevent clicking in extreme corners (potential system UI)
        if x < 10 && y < 10 {
            tracing::warn!("Click too close to top-left corner: ({}, {})", x, y);
            return false;
        }

        // Block close button area (assumes 1080p scaling)
        if y <= 15 && x >= 1800 {
            tracing::warn!("Click near window controls blocked: ({}, {})", x, y);
            return false;
        }

        // Block common taskbar hot zones (start button + system tray)
        if y >= 1040 && (x <= 120 || x >= 1800) {
            tracing::warn!("Click near system taskbar blocked: ({}, {})", x, y);
            return false;
        }

        true
    }

    fn is_key_safe(&self, key: &str) -> bool {
        let dangerous_keys = DANGEROUS_KEYS.get().unwrap();

        // Check for dangerous key combinations
        if dangerous_keys.iter().any(|k| k == key) {
            tracing::warn!("Dangerous key combination blocked: {}", key);
            return false;
        }

        true
    }

    /// Check if a task description seems dangerous
    pub fn is_task_safe(&self, task: &str) -> bool {
        let task_lower = task.to_lowercase();

        // Block obvious dangerous tasks
        let dangerous_keywords = [
            "delete system",
            "format drive",
            "remove windows",
            "steal",
            "hack",
            "crack password",
            "bypass security",
            "disable firewall",
            "disable antivirus",
        ];

        for keyword in &dangerous_keywords {
            if task_lower.contains(keyword) {
                tracing::warn!("Dangerous task detected: {}", task);
                return false;
            }
        }

        true
    }

    /// Get risk level for an action (0-10, higher is riskier)
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
        assert!(safety.is_click_location_safe(1920, 1080));
        assert!(!safety.is_click_location_safe(-10, 50));
        assert!(!safety.is_click_location_safe(5, 5));
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
}
