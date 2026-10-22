pub mod action_router;
pub mod audit;
pub mod browser;
pub mod computer_use;
pub mod input;
#[cfg(all(test, windows))]
mod integration_tests;
#[cfg(target_os = "macos")]
pub mod mac;
pub(crate) mod os_lock;
pub mod recorder;
pub mod safety_patterns;
pub mod screen;
pub mod types;
#[cfg(target_os = "windows")]
pub mod uia;

use once_cell::sync::Lazy;

use self::input::{ClipboardManager, KeyboardSimulator, MouseSimulator};

/// Named so a caller can say which service is missing rather than repeating the
/// sentence, and so the action router's accessibility tier has one place to ask
/// whether this platform has a driver at all.
pub const ACCESSIBILITY_UNSUPPORTED_PLATFORM: &str =
    "no accessibility automation service is available on this platform";
pub const ACCESSIBILITY_DRIVER_MACOS: &str = "macos_accessibility";
pub const ACCESSIBILITY_DRIVER_WINDOWS: &str = "windows_ui_automation";

/// The accessibility driver this build talks to, or `None` where the platform
/// has none. Linux has no implementation here and is not silently degraded to
/// one: the tier declines and the visual loop takes the action instead.
pub fn accessibility_backend() -> Option<&'static str> {
    #[cfg(target_os = "macos")]
    {
        Some(ACCESSIBILITY_DRIVER_MACOS)
    }
    #[cfg(windows)]
    {
        Some(ACCESSIBILITY_DRIVER_WINDOWS)
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        None
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
pub mod uia {
    use super::ACCESSIBILITY_UNSUPPORTED_PLATFORM;
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
            Err(anyhow::anyhow!(ACCESSIBILITY_UNSUPPORTED_PLATFORM))
        }

        pub fn bounding_rect(
            &self,
            _element_id: &str,
        ) -> anyhow::Result<Option<BoundingRectangle>> {
            Err(anyhow::anyhow!(ACCESSIBILITY_UNSUPPORTED_PLATFORM))
        }

        pub fn set_focus(&self, _element_id: &str) -> anyhow::Result<()> {
            Err(anyhow::anyhow!(ACCESSIBILITY_UNSUPPORTED_PLATFORM))
        }

        pub fn find_elements(
            &self,
            _parent_id: Option<String>,
            _query: &ElementQuery,
        ) -> anyhow::Result<Vec<UIElementInfo>> {
            Err(anyhow::anyhow!(ACCESSIBILITY_UNSUPPORTED_PLATFORM))
        }

        pub fn toggle(&self, _element_id: &str) -> anyhow::Result<()> {
            Err(anyhow::anyhow!(ACCESSIBILITY_UNSUPPORTED_PLATFORM))
        }

        pub fn set_value(&self, _element_id: &str, _value: &str) -> anyhow::Result<()> {
            Err(anyhow::anyhow!(ACCESSIBILITY_UNSUPPORTED_PLATFORM))
        }

        pub fn list_windows(&self) -> anyhow::Result<Vec<UIElementInfo>> {
            Err(anyhow::anyhow!(ACCESSIBILITY_UNSUPPORTED_PLATFORM))
        }

        pub fn get_value(&self, _element_id: &str) -> anyhow::Result<String> {
            Err(anyhow::anyhow!(ACCESSIBILITY_UNSUPPORTED_PLATFORM))
        }

        pub fn focus_window(&self, _window_name: &str) -> anyhow::Result<()> {
            Err(anyhow::anyhow!(ACCESSIBILITY_UNSUPPORTED_PLATFORM))
        }

        pub fn check_patterns(&self, _element_id: &str) -> anyhow::Result<UIPatterns> {
            Err(anyhow::anyhow!(ACCESSIBILITY_UNSUPPORTED_PLATFORM))
        }
    }
}

#[cfg(target_os = "windows")]
pub type PlatformDriver = uia::UIAutomationService;

#[cfg(target_os = "macos")]
pub type PlatformDriver = mac::service::MacAutomationService;

#[cfg(not(any(windows, target_os = "macos")))]
pub type PlatformDriver = uia::UIAutomationService;

use std::sync::{Arc, Mutex as StdMutex};

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

pub const ACCESSIBILITY_PERMISSION_MISSING: &str = "Desktop control needs the macOS Accessibility permission. Turn on AGI Desktop in System Settings > Privacy & Security > Accessibility, then try again.";

/// The service startup manages, or, when Accessibility was granted after
/// launch, the process-wide one built on first use, so a fresh grant works
/// without a restart. On macOS the service is never built before the grant:
/// constructing it raises the system's "control this computer" prompt.
pub fn shared_service<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Arc<AutomationService>, String> {
    use tauri::Manager as _;

    if let Some(service) = app
        .try_state::<Option<Arc<AutomationService>>>()
        .and_then(|state| state.inner().clone())
    {
        return Ok(service);
    }

    #[cfg(target_os = "macos")]
    {
        if !mac::service::MacAutomationService::check_accessibility_permissions() {
            return Err(ACCESSIBILITY_PERMISSION_MISSING.to_string());
        }
    }

    global_service().map_err(|e| format!("Desktop control could not start: {e}"))
}

#[cfg(test)]
mod shared_service_tests {
    use super::*;
    use tauri::Manager as _;

    #[test]
    fn reuses_the_instance_startup_manages() {
        let app = tauri::test::mock_app();
        let managed = Arc::new(AutomationService::new().expect("automation service"));
        app.handle().manage(Some(managed.clone()));

        let shared = shared_service(app.handle()).expect("managed automation service");

        assert!(Arc::ptr_eq(&shared, &managed));
    }
}
