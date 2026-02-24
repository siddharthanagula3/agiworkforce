pub mod browser;
pub mod codegen;
pub mod computer_use;
pub mod executor;
pub mod input;
pub mod inspector;
#[cfg(all(test, windows))]
mod integration_tests;
#[cfg(target_os = "macos")]
pub mod mac;
pub(crate) mod os_lock;
pub mod recorder;
pub mod safety;
pub mod safety_patterns;
pub mod screen;
pub mod screen_watcher;
pub mod types;
#[cfg(target_os = "windows")]
pub mod uia;
pub mod vision_planner;

#[cfg(target_os = "windows")]
use uia::inspector_impl as platform_impl;

#[cfg(target_os = "macos")]
use mac::inspector_impl as platform_impl;

#[cfg(any(windows, target_os = "macos"))]
pub use platform_impl::InspectorService;

use once_cell::sync::Lazy;

use self::input::{ClipboardManager, KeyboardSimulator, MouseSimulator};

#[cfg(not(any(windows, target_os = "macos")))]
pub mod uia {
    pub use crate::automation::types::{BoundingRectangle, ElementQuery, UIElementInfo};

    pub struct UIPatterns {
        pub invoke: bool,
        pub value: bool,
        pub toggle: bool,
        pub text: bool,
    }

    pub struct UIAutomationService;

    impl UIAutomationService {
        pub fn new() -> anyhow::Result<Self> {
            Ok(Self)
        }

        pub fn invoke(&self, _element_id: &str) -> anyhow::Result<()> {
            Err(anyhow::anyhow!(
                "UI Automation not available on this platform"
            ))
        }

        pub fn bounding_rect(
            &self,
            _element_id: &str,
        ) -> anyhow::Result<Option<BoundingRectangle>> {
            Err(anyhow::anyhow!(
                "UI Automation not available on this platform"
            ))
        }

        pub fn set_focus(&self, _element_id: &str) -> anyhow::Result<()> {
            Err(anyhow::anyhow!(
                "UI Automation not available on this platform"
            ))
        }

        pub fn find_elements(
            &self,
            _parent_id: Option<String>,
            _query: &ElementQuery,
        ) -> anyhow::Result<Vec<UIElementInfo>> {
            Err(anyhow::anyhow!(
                "UI Automation not available on this platform"
            ))
        }

        pub fn toggle(&self, _element_id: &str) -> anyhow::Result<()> {
            Err(anyhow::anyhow!(
                "UI Automation not available on this platform"
            ))
        }

        pub fn set_value(&self, _element_id: &str, _value: &str) -> anyhow::Result<()> {
            Err(anyhow::anyhow!(
                "UI Automation not available on this platform"
            ))
        }

        pub fn list_windows(&self) -> anyhow::Result<Vec<UIElementInfo>> {
            Err(anyhow::anyhow!(
                "UI Automation not available on this platform"
            ))
        }

        pub fn get_value(&self, _element_id: &str) -> anyhow::Result<String> {
            Err(anyhow::anyhow!(
                "UI Automation not available on this platform"
            ))
        }

        pub fn focus_window(&self, _window_name: &str) -> anyhow::Result<()> {
            Err(anyhow::anyhow!(
                "UI Automation not available on this platform"
            ))
        }

        pub fn check_patterns(&self, _element_id: &str) -> anyhow::Result<UIPatterns> {
            Err(anyhow::anyhow!(
                "UI Automation not available on this platform"
            ))
        }
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
pub struct InspectorService;

#[cfg(not(any(windows, target_os = "macos")))]
impl InspectorService {
    pub fn new() -> anyhow::Result<Self> {
        Ok(Self)
    }

    pub fn inspect_element_at_point(
        &self,
        _x: i32,
        _y: i32,
    ) -> anyhow::Result<types::DetailedElementInfo> {
        Err(anyhow::anyhow!("Inspector not available on this platform"))
    }

    pub fn inspect_element_by_selector(
        &self,
        _selector: &types::ElementSelector,
    ) -> anyhow::Result<types::DetailedElementInfo> {
        Err(anyhow::anyhow!("Inspector not available on this platform"))
    }

    pub fn inspect_element_by_id(
        &self,
        _element_id: &str,
    ) -> anyhow::Result<types::DetailedElementInfo> {
        Err(anyhow::anyhow!("Inspector not available on this platform"))
    }

    pub fn find_element_by_selector(
        &self,
        _selector: &types::ElementSelector,
    ) -> anyhow::Result<Option<String>> {
        Err(anyhow::anyhow!("Inspector not available on this platform"))
    }

    pub fn get_element_tree(
        &self,
        _element_id: &str,
    ) -> anyhow::Result<(
        Option<types::BasicElementInfo>,
        Vec<types::BasicElementInfo>,
    )> {
        Err(anyhow::anyhow!("Inspector not available on this platform"))
    }

    pub fn generate_selector(
        &self,
        _element_id: &str,
    ) -> anyhow::Result<Vec<types::ElementSelector>> {
        Err(anyhow::anyhow!("Inspector not available on this platform"))
    }
}

#[cfg(target_os = "windows")]
pub type PlatformDriver = uia::UIAutomationService;

#[cfg(target_os = "macos")]
pub type PlatformDriver = mac::service::MacAutomationService;

#[cfg(not(any(windows, target_os = "macos")))]
pub type PlatformDriver = uia::UIAutomationService;

// use once_cell::sync::Lazy; // Defined at line 30
use std::sync::{Arc, Mutex as StdMutex};
// use tokio::sync::Mutex; // Defined at line 189 but conflict with std::sync::Mutex if not qualified
// use tokio::sync::Mutex as TokioMutex; // Unused

// use self::input::{ClipboardManager, KeyboardSimulator, MouseSimulator}; // Defined at line 33

pub struct AutomationService {
    pub native: PlatformDriver,
    pub keyboard: tokio::sync::Mutex<Option<KeyboardSimulator>>,
    pub mouse: tokio::sync::Mutex<Option<MouseSimulator>>,
    pub clipboard: tokio::sync::Mutex<ClipboardManager>,
}

impl AutomationService {
    pub fn new() -> anyhow::Result<Self> {
        let keyboard = match KeyboardSimulator::new() {
            Ok(kb) => Some(kb),
            Err(e) => {
                tracing::warn!(
                    "KeyboardSimulator unavailable (Input Monitoring permission likely not granted): {}",
                    e
                );
                None
            }
        };
        let mouse = match MouseSimulator::new() {
            Ok(m) => Some(m),
            Err(e) => {
                tracing::warn!(
                    "MouseSimulator unavailable (Input Monitoring permission likely not granted): {}",
                    e
                );
                None
            }
        };
        Ok(Self {
            native: PlatformDriver::new()?,
            keyboard: tokio::sync::Mutex::new(keyboard),
            mouse: tokio::sync::Mutex::new(mouse),
            clipboard: tokio::sync::Mutex::new(ClipboardManager::new()?),
        })
    }
}

pub static AUTOMATION_SINGLETON: Lazy<StdMutex<Option<Arc<AutomationService>>>> =
    Lazy::new(|| StdMutex::new(None));

pub fn global_service() -> anyhow::Result<Arc<AutomationService>> {
    let mut guard = AUTOMATION_SINGLETON
        .lock()
        .map_err(|e| anyhow::anyhow!("automation mutex poisoned: {}", e))?;

    if let Some(service) = guard.as_ref() {
        return Ok(service.clone());
    }

    let service = Arc::new(AutomationService::new()?);
    *guard = Some(service.clone());
    Ok(service)
}
