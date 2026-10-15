use crate::automation::computer_use::consent::{process_scope, revoke_consent, ConsentScope};
use crate::data::settings::SettingsService;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct SettingsServiceState {
    pub service: Arc<Mutex<SettingsService>>,
}

impl SettingsServiceState {
    pub fn new(service: SettingsService) -> Self {
        Self {
            service: Arc::new(Mutex::new(service)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsResponse {
    pub success: bool,
    pub message: Option<String>,
}

/// Withdraw computer-use consent: the stored grant is removed and every
/// grant already issued under it stops working.
fn withdraw_computer_use_consent(
    scope: &ConsentScope,
    service: &SettingsService,
) -> Result<(), String> {
    revoke_consent(scope, service)
        .map_err(|e| format!("Failed to withdraw computer-use consent: {}", e))
}

/// Withdraw the consent that lets the app control this computer.
///
/// This is the only thing the page may change in `settings_v2`. No
/// page-callable command reads, writes or deletes a setting by key: the same
/// table holds saved provider keys, connector sign-ins, capability consents
/// and the list of approved hooks, and a delete by key could remove any of
/// them.
#[tauri::command]
pub async fn computer_use_revoke_consent(
    state: State<'_, SettingsServiceState>,
) -> Result<SettingsResponse, String> {
    let service = state
        .service
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    withdraw_computer_use_consent(process_scope(), &service)?;

    Ok(SettingsResponse {
        success: true,
        message: Some("Computer-use consent withdrawn".to_string()),
    })
}

#[tauri::command]
pub async fn settings_v2_clear_cache(
    state: State<'_, SettingsServiceState>,
) -> Result<SettingsResponse, String> {
    let service = state
        .service
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    service.clear_cache();

    Ok(SettingsResponse {
        success: true,
        message: Some("Cache cleared".to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::automation::computer_use::CONSENT_SETTINGS_KEY;
    use crate::data::settings::{SettingCategory, SettingValue};
    use rusqlite::Connection;

    fn service_holding(rows: &[&str]) -> SettingsService {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE settings_v2 (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                category TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )
        .unwrap();
        let service = SettingsService::new(Arc::new(Mutex::new(conn))).unwrap();
        for row in rows {
            service
                .set(
                    row.to_string(),
                    SettingValue::String("fixture".to_string()),
                    SettingCategory::Security,
                    false,
                )
                .unwrap();
        }
        service
    }

    #[test]
    fn withdrawing_consent_removes_the_consent_row_and_no_other_setting() {
        let kept = [
            "hooks_approved_yaml",
            "api_key_openai",
            "mcp_oauth_tokens_github",
            "mcp_oauth_config_github_client_secret",
        ];
        let mut rows = kept.to_vec();
        rows.push(CONSENT_SETTINGS_KEY);
        let service = service_holding(&rows);

        withdraw_computer_use_consent(&ConsentScope::new(), &service).expect("withdraw");

        assert!(service.get(CONSENT_SETTINGS_KEY).is_err());
        for row in kept {
            assert_eq!(
                service.get(row).unwrap(),
                SettingValue::String("fixture".to_string()),
                "{row} was removed with the consent"
            );
        }
    }

    #[test]
    fn withdrawing_consent_that_was_never_given_changes_nothing() {
        let service = service_holding(&["hooks_approved_yaml"]);

        withdraw_computer_use_consent(&ConsentScope::new(), &service).expect("withdraw");

        assert_eq!(
            service.get("hooks_approved_yaml").unwrap(),
            SettingValue::String("fixture".to_string())
        );
    }
}
