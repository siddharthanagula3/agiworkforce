pub mod codegen;
pub mod executor;
pub mod input;
#[cfg(windows)]
pub mod inspector;
#[cfg(test)]
mod integration_tests;
pub(crate) mod os_lock;
pub mod recorder;
pub mod safety;
pub mod screen;
pub mod types;
#[cfg(windows)]
pub mod uia;
pub mod vision_planner;

use once_cell::sync::Lazy;
use std::sync::Mutex;

use self::input::{ClipboardManager, KeyboardSimulator, MouseSimulator};

#[cfg(windows)]
use self::uia::UIAutomationService;

// Stub for non-Windows platforms
#[cfg(not(windows))]
pub struct UIAutomationService;

#[cfg(not(windows))]
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
    ) -> anyhow::Result<Option<types::BoundingRectangle>> {
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
        _query: &types::ElementQuery,
    ) -> anyhow::Result<Vec<types::UIElementInfo>> {
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

    pub fn list_windows(&self) -> anyhow::Result<Vec<types::UIElementInfo>> {
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
}

#[cfg(not(windows))]
pub struct InspectorService;

#[cfg(not(windows))]
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

pub struct AutomationService {
    pub uia: UIAutomationService,
    pub keyboard: Mutex<KeyboardSimulator>,
    pub mouse: Mutex<MouseSimulator>,
    pub clipboard: ClipboardManager,
}

impl AutomationService {
    pub fn new() -> anyhow::Result<Self> {
        Ok(Self {
            uia: UIAutomationService::new()?,
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
