// Cross-platform clipboard implementation using arboard
use anyhow::{anyhow, Result};
use arboard::Clipboard;

use crate::automation::os_lock::lock_os_automation;

pub struct ClipboardManager {
    clipboard: Clipboard,
}

impl ClipboardManager {
    pub fn new() -> Result<Self> {
        let _lock = lock_os_automation()?;
        let clipboard =
            Clipboard::new().map_err(|e| anyhow!("Failed to initialize clipboard: {}", e))?;
        Ok(Self { clipboard })
    }

    pub fn get_text(&mut self) -> Result<String> {
        let _lock = lock_os_automation()?;
        self.clipboard
            .get_text()
            .map_err(|e| anyhow!("Failed to get clipboard text: {}", e))
    }

    pub fn set_text(&mut self, text: &str) -> Result<()> {
        let _lock = lock_os_automation()?;
        self.clipboard
            .set_text(text.to_string())
            .map_err(|e| anyhow!("Failed to set clipboard text: {}", e))
    }

    pub fn clear(&mut self) -> Result<()> {
        let _lock = lock_os_automation()?;
        self.clipboard
            .clear()
            .map_err(|e| anyhow!("Failed to clear clipboard: {}", e))
    }
}

impl Default for ClipboardManager {
    fn default() -> Self {
        Self::new().expect("Failed to create ClipboardManager")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clipboard_set_get() {
        let mut clipboard = ClipboardManager::new().unwrap();
        let test_text = "Hello, cross-platform clipboard!";

        clipboard.set_text(test_text).unwrap();
        let retrieved = clipboard.get_text().unwrap();

        assert_eq!(retrieved, test_text);
    }
}
