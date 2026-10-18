//! Native Messaging capability negotiation

use super::NativeMessage;
use serde::{Deserialize, Serialize};

/// Extension capabilities
///
/// Every flag defaults to `false` when a peer omits it from the wire payload:
/// a capability this side never saw declared must never be treated as granted.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionCapabilities {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub supports_accessibility_tree: bool,
    #[serde(default)]
    pub supports_screenshot: bool,
    #[serde(default)]
    pub supports_cookies: bool,
    #[serde(default)]
    pub supports_local_storage: bool,
    #[serde(default)]
    pub supports_form_fill: bool,
    #[serde(default)]
    pub supports_script_execution: bool,
}

/// A native message capability that must be negotiated before the realtime
/// bridge will run the message.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativeCapability {
    ScriptExecution,
    Cookies,
    LocalStorage,
}

impl NativeCapability {
    pub fn label(self) -> &'static str {
        match self {
            NativeCapability::ScriptExecution => "script execution",
            NativeCapability::Cookies => "cookie access",
            NativeCapability::LocalStorage => "local storage access",
        }
    }

    /// The capability a native message needs before a bridge peer may run it.
    ///
    /// The match is exhaustive on purpose: a new `NativeMessage` variant must be
    /// classified here before the crate compiles, so a message can never reach a
    /// browser sink because nobody remembered to list it. `SetAttribute` needs
    /// the script-execution grant even though it is nominally a DOM write.
    /// `setAttribute("onmouseover", ...)`, `href`, `src`, `srcdoc` and a form's
    /// `action` all turn one attribute write into arbitrary JavaScript in the
    /// live tab or an off-origin submit of whatever that page holds, which is
    /// the same power `ExecuteScript` hands out.
    pub fn required_for(message: &NativeMessage) -> Option<Self> {
        match message {
            NativeMessage::ExecuteScript { .. } | NativeMessage::SetAttribute { .. } => {
                Some(NativeCapability::ScriptExecution)
            }
            NativeMessage::GetCookies { .. } | NativeMessage::SetCookie { .. } => {
                Some(NativeCapability::Cookies)
            }
            NativeMessage::GetLocalStorage { .. } | NativeMessage::SetLocalStorage { .. } => {
                Some(NativeCapability::LocalStorage)
            }
            NativeMessage::Connect { .. }
            | NativeMessage::Disconnect { .. }
            | NativeMessage::Ping
            | NativeMessage::Pong
            | NativeMessage::Click { .. }
            | NativeMessage::Type { .. }
            | NativeMessage::Navigate { .. }
            | NativeMessage::Screenshot { .. }
            | NativeMessage::Hover { .. }
            | NativeMessage::WaitForSelector { .. }
            | NativeMessage::SelectOption { .. }
            | NativeMessage::SetChecked { .. }
            | NativeMessage::Focus { .. }
            | NativeMessage::ScrollIntoView { .. }
            | NativeMessage::GetElement { .. }
            | NativeMessage::GetElements { .. }
            | NativeMessage::GetText { .. }
            | NativeMessage::GetAttribute { .. }
            | NativeMessage::GetAccessibilityTree { .. }
            | NativeMessage::GetFocusableElements { .. }
            | NativeMessage::GetTabs
            | NativeMessage::GetActiveTab
            | NativeMessage::CreateTab { .. }
            | NativeMessage::CloseTab { .. }
            | NativeMessage::SwitchTab { .. }
            | NativeMessage::GetPageInfo { .. }
            | NativeMessage::GetPageContent { .. }
            | NativeMessage::PageContext { .. }
            | NativeMessage::TaskResult { .. }
            | NativeMessage::SelectedTextQuery(_)
            | NativeMessage::Response { .. } => None,
        }
    }
}

impl ExtensionCapabilities {
    /// What a connection holds before it has negotiated anything.
    pub fn none() -> Self {
        Self {
            version: String::new(),
            supports_accessibility_tree: false,
            supports_screenshot: false,
            supports_cookies: false,
            supports_local_storage: false,
            supports_form_fill: false,
            supports_script_execution: false,
        }
    }

    /// The most the realtime bridge may ever grant a peer.
    ///
    /// Presenting the loopback bridge token proves only that the caller runs as
    /// this OS user, not that the user approved arbitrary JavaScript in their
    /// signed-in tabs, or reads of their session cookies and local storage. Those
    /// three stay off the ceiling until a host-side grant exists to raise them,
    /// so a peer declaring them cannot grant them to itself.
    pub fn bridge_ceiling() -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            supports_accessibility_tree: true,
            supports_screenshot: true,
            supports_cookies: false,
            supports_local_storage: false,
            supports_form_fill: true,
            supports_script_execution: false,
        }
    }

    /// Grant the intersection of what the peer declared and the bridge ceiling.
    pub fn negotiate(declared: &Self) -> Self {
        let ceiling = Self::bridge_ceiling();
        Self {
            version: ceiling.version,
            supports_accessibility_tree: declared.supports_accessibility_tree
                && ceiling.supports_accessibility_tree,
            supports_screenshot: declared.supports_screenshot && ceiling.supports_screenshot,
            supports_cookies: declared.supports_cookies && ceiling.supports_cookies,
            supports_local_storage: declared.supports_local_storage
                && ceiling.supports_local_storage,
            supports_form_fill: declared.supports_form_fill && ceiling.supports_form_fill,
            supports_script_execution: declared.supports_script_execution
                && ceiling.supports_script_execution,
        }
    }

    pub fn grants(&self, capability: NativeCapability) -> bool {
        match capability {
            NativeCapability::ScriptExecution => self.supports_script_execution,
            NativeCapability::Cookies => self.supports_cookies,
            NativeCapability::LocalStorage => self.supports_local_storage,
        }
    }
}
