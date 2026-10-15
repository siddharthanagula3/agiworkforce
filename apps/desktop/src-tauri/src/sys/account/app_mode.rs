//! Process-wide app mode.
//!
//! The renderer owns the Local or Cloud choice and reports it at startup and
//! on every change. Until the first report the process is Local, so no code
//! path can reach AGI Cloud by default.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::State;

use crate::sys::commands::llm::{reconcile_managed_cloud_provider, LLMState};

static CLOUD_APP_MODE: AtomicBool = AtomicBool::new(false);

pub(crate) const LOCAL_MODE_REFUSAL: &str =
    "[ERR_LOCAL_MODE] AGI Cloud is not used while the app is in Local mode. Switch to Cloud to use it.";

pub fn is_cloud_app_mode() -> bool {
    CLOUD_APP_MODE.load(Ordering::SeqCst)
}

pub(crate) fn set_cloud_app_mode(cloud: bool) {
    CLOUD_APP_MODE.store(cloud, Ordering::SeqCst);
}

/// SECURITY: every read of the AGI Cloud credential passes through here, so a
/// Local or BYOK session cannot attach the bearer to any request.
pub(crate) fn require_cloud_app_mode() -> Result<(), String> {
    if is_cloud_app_mode() {
        Ok(())
    } else {
        Err(LOCAL_MODE_REFUSAL.to_string())
    }
}

fn parse_cloud_app_mode(mode: &str) -> Result<bool, String> {
    match mode {
        "cloud" => Ok(true),
        "local" => Ok(false),
        other => Err(format!(
            "Unknown app mode '{other}'. Expected 'local' or 'cloud'."
        )),
    }
}

/// Report the renderer's app mode. An unrecognised value leaves the process
/// Local and returns the error.
#[tauri::command]
pub async fn account_set_app_mode(
    mode: String,
    llm_state: State<'_, LLMState>,
) -> Result<(), String> {
    let parsed = parse_cloud_app_mode(&mode);
    set_cloud_app_mode(matches!(parsed, Ok(true)));
    reconcile_managed_cloud_provider(&llm_state.router).await;
    parsed.map(|_| ())
}

#[cfg(test)]
static APP_MODE_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Serialises tests that read or write the process-wide mode or the stored
/// credential, and returns the process to Local when dropped.
#[cfg(test)]
pub(crate) struct AppModeTestGuard {
    _lock: tokio::sync::MutexGuard<'static, ()>,
}

#[cfg(test)]
impl AppModeTestGuard {
    pub(crate) async fn cloud() -> Self {
        Self::enter(true).await
    }

    pub(crate) async fn local() -> Self {
        Self::enter(false).await
    }

    async fn enter(cloud: bool) -> Self {
        let lock = APP_MODE_TEST_LOCK.lock().await;
        set_cloud_app_mode(cloud);
        Self { _lock: lock }
    }
}

#[cfg(test)]
impl Drop for AppModeTestGuard {
    fn drop(&mut self) {
        set_cloud_app_mode(false);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::account::{
        get_access_token, get_access_token_for_active_managed_boundary,
        replace_access_token_for_managed_boundary_test,
    };
    use base64::Engine;

    fn signed_in_token() -> String {
        let header = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(br#"{"alg":"none"}"#);
        let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(serde_json::json!({ "sub": "account-a", "sid": "session-a" }).to_string());
        format!("{header}.{payload}.test-signature")
    }

    #[test]
    fn only_the_two_known_modes_parse() {
        assert_eq!(parse_cloud_app_mode("cloud"), Ok(true));
        assert_eq!(parse_cloud_app_mode("local"), Ok(false));
        for unknown in ["", "Cloud", "byok", "managed", " cloud"] {
            assert!(
                parse_cloud_app_mode(unknown).is_err(),
                "'{unknown}' must not be accepted as an app mode"
            );
        }
    }

    #[tokio::test]
    async fn a_local_process_refuses_the_cloud_credential_even_when_signed_in() {
        let _guard = AppModeTestGuard::local().await;
        replace_access_token_for_managed_boundary_test(Some(signed_in_token()));

        let ambient = get_access_token();
        let scoped = get_access_token_for_active_managed_boundary();
        replace_access_token_for_managed_boundary_test(None);

        assert_eq!(ambient, Err(LOCAL_MODE_REFUSAL.to_string()));
        assert_eq!(scoped, Err(LOCAL_MODE_REFUSAL.to_string()));
    }

    #[tokio::test]
    async fn a_cloud_process_returns_the_stored_credential() {
        let _guard = AppModeTestGuard::cloud().await;
        let token = signed_in_token();
        replace_access_token_for_managed_boundary_test(Some(token.clone()));

        let selected = get_access_token();
        replace_access_token_for_managed_boundary_test(None);

        assert_eq!(selected, Ok(token));
    }

    #[tokio::test]
    async fn leaving_cloud_revokes_the_credential_for_the_next_read() {
        let _guard = AppModeTestGuard::cloud().await;
        replace_access_token_for_managed_boundary_test(Some(signed_in_token()));
        assert!(get_access_token().is_ok());

        set_cloud_app_mode(false);
        let after_switch = get_access_token();
        replace_access_token_for_managed_boundary_test(None);

        assert_eq!(after_switch, Err(LOCAL_MODE_REFUSAL.to_string()));
    }

    #[tokio::test]
    async fn the_test_guard_returns_the_process_to_local() {
        {
            let _guard = AppModeTestGuard::cloud().await;
            assert!(is_cloud_app_mode());
        }
        let _guard = AppModeTestGuard::local().await;
        assert!(!is_cloud_app_mode());
        assert_eq!(
            require_cloud_app_mode(),
            Err(LOCAL_MODE_REFUSAL.to_string())
        );
    }
}
