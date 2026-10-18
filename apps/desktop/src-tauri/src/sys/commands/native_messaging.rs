//! Native Messaging state managed by the Tauri app.

use crate::integrations::native_messaging::NativeMessagingState;
use std::sync::Arc;
use tokio::sync::RwLock;

/// State wrapper for native messaging
pub struct NativeMessagingStateWrapper {
    pub state: Arc<RwLock<NativeMessagingState>>,
    pub extension_id: Arc<RwLock<Option<String>>>,
}

impl NativeMessagingStateWrapper {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(NativeMessagingState::new())),
            extension_id: Arc::new(RwLock::new(None)),
        }
    }
}

impl Default for NativeMessagingStateWrapper {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_native_messaging_state_wrapper_creation() {
        let wrapper = NativeMessagingStateWrapper::new();
        assert!(wrapper.extension_id.try_read().unwrap().is_none());
    }
}
