pub mod codegen;
pub mod executor;
pub mod input;
pub mod inspector;
pub mod recorder;
pub mod screen;
pub mod uia;

use once_cell::sync::Lazy;
use std::sync::Mutex;

use self::{
    input::{ClipboardManager, KeyboardSimulator, MouseSimulator},
    uia::UIAutomationService,
};

pub struct AutomationService {
    pub uia: UIAutomationService,
    pub keyboard: KeyboardSimulator,
    pub mouse: MouseSimulator,
    pub clipboard: ClipboardManager,
}

impl AutomationService {
    pub fn new() -> anyhow::Result<Self> {
        Ok(Self {
            uia: UIAutomationService::new()?,
            keyboard: KeyboardSimulator::new()?,
            mouse: MouseSimulator::new()?,
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
