use anyhow::{ensure, Result};

/// Account-wide Cloud new-chat defaults. The developer-session protocol has
/// no method for the web `default-model` preference namespace, so this desktop
/// does not keep a private copy and does not write a setting.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CloudNewChatDefaults {
    pub available: bool,
}

pub fn current() -> CloudNewChatDefaults {
    CloudNewChatDefaults { available: false }
}

pub const UNAVAILABLE: &str =
    "Account-wide defaults for new Cloud conversations are unavailable on this desktop. Nothing is saved here.";

pub fn attempt(defaults: CloudNewChatDefaults, writes: &mut Vec<String>) -> Result<()> {
    ensure!(defaults.available, "{UNAVAILABLE}");
    writes.push("cloud-default".to_owned());
    Ok(())
}
