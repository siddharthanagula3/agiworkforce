use anyhow::{anyhow, Result};
use arboard::Clipboard;

use crate::automation::os_lock::lock_os_automation;

pub struct ClipboardManager {
    clipboard: Option<Clipboard>,
}

impl ClipboardManager {
    pub fn new() -> Result<Self> {
        let _lock = lock_os_automation()?;
        let clipboard =
            Clipboard::new().map_err(|e| anyhow!("Failed to initialize clipboard: {}", e))?;
        Ok(Self {
            clipboard: Some(clipboard),
        })
    }

    /// Returns a reference to the clipboard, initializing it lazily if needed.
    /// Returns an error if the clipboard cannot be initialized.
    fn get_clipboard(&mut self) -> Result<&mut Clipboard> {
        if self.clipboard.is_none() {
            let _lock = lock_os_automation()?;
            let clipboard =
                Clipboard::new().map_err(|e| anyhow!("Failed to initialize clipboard: {}", e))?;
            self.clipboard = Some(clipboard);
        }
        self.clipboard
            .as_mut()
            .ok_or_else(|| anyhow!("Clipboard not available"))
    }

    pub fn get_text(&mut self) -> Result<String> {
        let _lock = lock_os_automation()?;
        self.get_clipboard()?
            .get_text()
            .map_err(|e| anyhow!("Failed to get clipboard text: {}", e))
    }

    pub fn set_text(&mut self, text: &str) -> Result<()> {
        let _lock = lock_os_automation()?;
        self.get_clipboard()?
            .set_text(text.to_string())
            .map_err(|e| anyhow!("Failed to set clipboard text: {}", e))
    }

    pub fn clear(&mut self) -> Result<()> {
        let _lock = lock_os_automation()?;
        self.get_clipboard()?
            .clear()
            .map_err(|e| anyhow!("Failed to clear clipboard: {}", e))
    }
}

impl Default for ClipboardManager {
    fn default() -> Self {
        // Try to create the clipboard, but return an uninitialized manager if it fails.
        // The clipboard will be lazily initialized on first use.
        match Self::new() {
            Ok(manager) => manager,
            Err(e) => {
                tracing::warn!(
                    "Failed to initialize clipboard in Default impl, will retry on first use: {}",
                    e
                );
                Self { clipboard: None }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clipboard_set_get() {
        if std::env::var("CI").is_ok() {
            return;
        }
        let mut clipboard = ClipboardManager::new().unwrap();
        let test_text = "Hello, cross-platform clipboard!";

        clipboard.set_text(test_text).unwrap();
        let retrieved = clipboard.get_text().unwrap();

        assert_eq!(retrieved, test_text);
    }
}
