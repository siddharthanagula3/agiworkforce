//! Workspace-level settings fetched from the ChatGPT backend.
//!
//! Stub: the upstream codex-rs `workspace_settings` module fetches per-workspace
//! plugin enablement from the ChatGPT account settings endpoint and caches the
//! result. This crate has not yet ported the HTTP machinery, so the stub
//! conservatively answers "plugins enabled" — matching the warn-and-allow
//! fallback the caller in `agiworkforce-app-server` already runs when the real
//! fetch errors. See FIX-006a in `FIX_QUEUE.md`.
use agiworkforce_core::config::Config;
use agiworkforce_core::auth::AgiworkforceAuth;

#[derive(Default, Debug)]
pub struct WorkspaceSettingsCache;

pub async fn agiworkforce_plugins_enabled_for_workspace(
    _config: &Config,
    _auth: Option<&AgiworkforceAuth>,
    _cache: Option<&WorkspaceSettingsCache>,
) -> anyhow::Result<bool> {
    Ok(true)
}
