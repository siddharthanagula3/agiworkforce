pub mod browser;
pub mod codegen;
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
pub mod screen;
pub mod types;
#[cfg(target_os = "windows")]
pub mod uia;
pub mod vision_planner;

#[cfg(target_os = "windows")]
use uia::inspector_impl as platform_impl;

#[cfg(target_os = "macos")]
use mac::inspector_impl as platform_impl;

pub use platform_impl::InspectorService;

use once_cell::sync::Lazy;
use std::sync::Mutex;

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
    ) -> anyhow::Result<Option<types::BasicElementInfo>> {
        Err(anyhow::anyhow!("Inspector not available on this platform"))
    }

    pub fn get_element_tree(&self) -> anyhow::Result<types::DetailedElementInfo> {
        Err(anyhow::anyhow!("Inspector not available on this platform"))
    }

    pub fn generate_selector(&self, _element_id: &str) -> anyhow::Result<types::ElementSelector> {
        Err(anyhow::anyhow!("Inspector not available on this platform"))
    }
}

#[cfg(target_os = "windows")]
pub type PlatformDriver = uia::UIAutomationService;

#[cfg(target_os = "macos")]
pub type PlatformDriver = mac::service::MacAutomationService;

pub struct AutomationService {
    pub native: PlatformDriver,
    pub keyboard: Mutex<KeyboardSimulator>,
    pub mouse: Mutex<MouseSimulator>,
    pub clipboard: ClipboardManager,
}

impl AutomationService {
    pub fn new() -> anyhow::Result<Self> {
        Ok(Self {
            native: PlatformDriver::new()?,
            keyboard: Mutex::new(KeyboardSimulator::new()?),
            mouse: Mutex::new(MouseSimulator::new()?),
            clipboard: ClipboardManager::new()?,
        })
    }
}

pub static AUTOMATION_SINGLETON: Lazy<Mutex<Option<AutomationService>>> =
    Lazy::new(|| Mutex::new(None));

pub fn global_service() -> anyhow::Result<std::sync::MutexGuard<'static, Option<AutomationService>>>
{
    let mut guard = AUTOMATION_SINGLETON
        .lock()
        .expect("automation mutex poisoned");
    if guard.is_none() {
        *guard = Some(AutomationService::new()?);
    }
    Ok(guard)
}
