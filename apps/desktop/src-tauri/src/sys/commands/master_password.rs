//! Tauri commands for master password management
//!
//! These commands expose the master password functionality to the frontend,
//! allowing users to set up, verify, and manage their master password.

use crate::sys::native_confirm::{ConfirmGate, NativeConfirm};
use crate::sys::security::master_password::{
    password_rule_violation, MasterPasswordError, MasterPasswordManager, MasterPasswordStatus,
    PasswordKey, PasswordRuleViolation,
};
use crate::sys::security::{vault_credentials, KeyPurpose};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::State;

/// Failed verification attempts in this process: 5 lock for 30 seconds, 10
/// for 5 minutes, 20 until restart. A locked attempt is refused even with the
/// right password, so the delay cannot be timed to enumerate it.
#[derive(Debug)]
struct LockoutState {
    failed_count: u32,
    locked_until: Option<Instant>,
    require_restart: bool,
}

impl LockoutState {
    fn new() -> Self {
        Self {
            failed_count: 0,
            locked_until: None,
            require_restart: false,
        }
    }

    /// Returns Some(remaining_secs) if currently locked out, None if allowed.
    fn check_lockout(&self) -> Option<u64> {
        if self.require_restart {
            return Some(u64::MAX); // sentinel for restart-required
        }
        if let Some(until) = self.locked_until {
            let now = Instant::now();
            if now < until {
                let remaining = until.duration_since(now).as_secs().max(1);
                return Some(remaining);
            }
        }
        None
    }

    /// Records a failed attempt and sets lockout if thresholds are crossed.
    fn record_failure(&mut self) {
        self.failed_count += 1;
        match self.failed_count {
            n if n >= 20 => {
                self.require_restart = true;
                self.locked_until = None;
            }
            n if n >= 10 => {
                self.locked_until = Some(Instant::now() + Duration::from_secs(300));
            }
            n if n >= 5 => {
                // Only extend the lockout if it isn't already set to a longer duration
                let proposed = Instant::now() + Duration::from_secs(30);
                if self.locked_until.map(|u| proposed > u).unwrap_or(true) {
                    self.locked_until = Some(proposed);
                }
            }
            _ => {}
        }
    }

    /// Resets the failure counter and lockout on successful authentication.
    fn record_success(&mut self) {
        self.failed_count = 0;
        self.locked_until = None;
        // require_restart is NOT cleared on success, the app must restart.
    }
}

/// parking_lot::Mutex because it does not poison: a panic under a std Mutex
/// would refuse every later unlock until the app restarts.
static LOCKOUT: std::sync::OnceLock<parking_lot::Mutex<LockoutState>> = std::sync::OnceLock::new();

fn lockout() -> &'static parking_lot::Mutex<LockoutState> {
    LOCKOUT.get_or_init(|| parking_lot::Mutex::new(LockoutState::new()))
}

/// Argon2 dummy verification used to pad responses when locked out so that
/// timing is indistinguishable from a real verification attempt.
fn argon2_dummy_verify() {
    use argon2::{
        password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
        Argon2, Params,
    };
    let salt = SaltString::generate(&mut OsRng);
    let params = Params::new(19 * 1024, 2, 1, Some(32)).unwrap_or_default();
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    let _ = argon2.hash_password(b"dummy_lockout_pad", &salt);
}

/// Check the lockout gate before allowing a verification attempt.
/// Returns Ok(()) if the attempt is allowed, Err(message) if locked out.
/// Always performs a dummy Argon2 hash on lockout to prevent timing oracles.
fn check_and_enforce_lockout() -> Result<(), String> {
    let guard = lockout().lock();
    if let Some(remaining) = guard.check_lockout() {
        drop(guard); // release before the slow dummy hash
        argon2_dummy_verify();
        if remaining == u64::MAX {
            return Err(
                "Too many failed attempts. Please restart the application to try again."
                    .to_string(),
            );
        }
        return Err(format!(
            "Too many failed attempts. Please wait {} seconds before trying again.",
            remaining
        ));
    }
    Ok(())
}

/// Record the outcome of an attempt.
fn record_attempt_outcome(success: bool) {
    let mut guard = lockout().lock();
    if success {
        guard.record_success();
    } else {
        guard.record_failure();
        if guard.require_restart {
            tracing::warn!(
                "Master password brute-force threshold reached, restart required to unlock"
            );
        }
    }
}

/// State wrapper for the master password manager
pub struct MasterPasswordState {
    pub manager: Arc<Mutex<MasterPasswordManager>>,
}

impl MasterPasswordState {
    /// Create a new master password state with an existing database connection
    pub fn new(db_conn: Arc<Mutex<Connection>>) -> Result<Self, String> {
        let manager = MasterPasswordManager::new(db_conn);
        manager
            .init_table()
            .map_err(|e| format!("Failed to initialize master password table: {}", e))?;

        Ok(Self {
            manager: Arc::new(Mutex::new(manager)),
        })
    }

    /// Create a degraded MasterPasswordState backed by an in-memory database.
    /// The master password table will not be initialized; commands will return
    /// meaningful errors instead of panicking on missing state.
    pub fn new_degraded() -> Self {
        let conn =
            Connection::open_in_memory().expect("in-memory SQLite connection should never fail");
        let manager = MasterPasswordManager::new(Arc::new(Mutex::new(conn)));
        Self {
            manager: Arc::new(Mutex::new(manager)),
        }
    }
}

/// Response for master password operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MasterPasswordResponse {
    pub success: bool,
    pub message: String,
    /// The password rule a refused new password broke, for the interface to
    /// explain in its own words.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub violation: Option<PasswordRuleViolation>,
    /// Providers whose saved key no key opens. An unlock that finds any keeps
    /// the stored password row as it is and reports them here.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub keys_not_upgraded: Vec<String>,
}

impl MasterPasswordResponse {
    fn done(message: &str) -> Self {
        Self {
            success: true,
            message: message.to_string(),
            violation: None,
            keys_not_upgraded: Vec::new(),
        }
    }

    fn refused(message: &str) -> Self {
        Self {
            success: false,
            message: message.to_string(),
            violation: None,
            keys_not_upgraded: Vec::new(),
        }
    }

    fn rejected(violation: PasswordRuleViolation) -> Self {
        Self {
            success: false,
            message: violation.to_string(),
            violation: Some(violation),
            keys_not_upgraded: Vec::new(),
        }
    }
}

/// An earlier build sealed the connector permissions file under the vault key
/// whenever it was saved while unlocked. With the key in hand the file goes
/// back under the machine key, which is where it now always lives and which
/// opens it whether or not a key replacement commits.
fn release_connector_permissions(vault_key: &PasswordKey<'_>) -> Result<(), MasterPasswordError> {
    let keys = vault_key.purpose_keys(KeyPurpose::ConnectorPermissions)?;
    crate::sys::commands::connector_permissions::release_from_vault_keys(&keys)
        .map_err(MasterPasswordError::CryptoError)
}

fn settle_unlock(
    conn: &Connection,
    key: &PasswordKey<'_>,
    upgraded: Option<&PasswordKey<'_>>,
) -> Result<(), MasterPasswordError> {
    vault_credentials::settle_at_unlock(conn, key, upgraded)?;
    release_connector_permissions(key)
}

fn reseal_for_change(
    conn: &Connection,
    old_key: &PasswordKey<'_>,
    new_key: &PasswordKey<'_>,
) -> Result<(), MasterPasswordError> {
    vault_credentials::reseal_for_new_password(conn, old_key, new_key)?;
    release_connector_permissions(old_key)
}

fn reseal_for_removal(conn: &Connection, key: &PasswordKey<'_>) -> Result<(), MasterPasswordError> {
    vault_credentials::reseal_under_install_key(conn, key)?;
    release_connector_permissions(key)
}

/// Get the current master password status
#[tauri::command]
pub async fn master_password_get_status(
    state: State<'_, MasterPasswordState>,
) -> Result<MasterPasswordStatus, String> {
    let manager = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    manager.get_status().map_err(|e| e.to_string())
}

/// Setting or changing the master password seals the user's saved keys under
/// a password of the caller's choosing, after which a lock keeps them out of
/// reach. The window may ask for that, but only the user may agree to it, in
/// a dialog the operating system draws. One such question at a time, and a
/// wait after a no that grows while the noes keep coming.
static MASTER_PASSWORD_DECISIONS: ConfirmGate = ConfirmGate::new();

const SETUP_CONFIRM_LABEL: &str = "Set Master Password";
const CHANGE_CONFIRM_LABEL: &str = "Change Master Password";
const SETUP_NOT_CONFIRMED: &str =
    "Setting a master password was not confirmed, so nothing was changed.";
const CHANGE_NOT_CONFIRMED: &str =
    "Changing the master password was not confirmed, so nothing was changed.";

fn setup_question() -> NativeConfirm {
    NativeConfirm {
        title: "Set a master password?".to_string(),
        body: "Your saved provider keys will be sealed with the password you just typed in the AGI Workforce window, and will need it at every start.\n\nIt cannot be recovered. If you forget it, those saved keys are lost.".to_string(),
        confirm_label: SETUP_CONFIRM_LABEL.to_string(),
    }
}

fn change_question() -> NativeConfirm {
    NativeConfirm {
        title: "Change the master password?".to_string(),
        body: "Your saved provider keys will be sealed with the new password you just typed in the AGI Workforce window, and will need it at every start.\n\nIt cannot be recovered. If you forget it, those saved keys are lost.".to_string(),
        confirm_label: CHANGE_CONFIRM_LABEL.to_string(),
    }
}

/// `None` when the user said yes in the native dialog; otherwise the refusal
/// to hand back, which never claims the change was made.
async fn refusal_unless_confirmed(
    app: &tauri::AppHandle,
    request: &str,
    question: NativeConfirm,
    not_confirmed: &str,
) -> Option<MasterPasswordResponse> {
    match MASTER_PASSWORD_DECISIONS
        .confirm(app, request, question)
        .await
    {
        Ok(true) => None,
        Ok(false) => Some(MasterPasswordResponse::refused(not_confirmed)),
        Err(held) => Some(MasterPasswordResponse::refused(&held.message())),
    }
}

/// Set the master password for the first time, once the user has confirmed
/// it natively. Every saved provider key is sealed under it in the
/// transaction that stores the salt and verifier, so none stays readable
/// without the password, and a failure sets no password. A password that
/// breaks the rules, or a vault that already has one, is turned down before
/// anything is asked.
#[tauri::command]
pub async fn master_password_setup(
    app: tauri::AppHandle,
    password: String,
    state: State<'_, MasterPasswordState>,
) -> Result<MasterPasswordResponse, String> {
    if let Some(violation) = password_rule_violation(&password) {
        return Ok(MasterPasswordResponse::rejected(violation));
    }
    let already_configured = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?
        .is_configured()
        .map_err(|e| e.to_string())?;
    if already_configured {
        return Ok(MasterPasswordResponse::refused(
            "Master password is already configured",
        ));
    }
    if let Some(refusal) =
        refusal_unless_confirmed(&app, "setup", setup_question(), SETUP_NOT_CONFIRMED).await
    {
        return Ok(refusal);
    }

    let manager = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    match manager.setup_with(&password, |conn, new_key| {
        vault_credentials::seal_existing_under_password(conn, new_key).map(|_| ())
    }) {
        Ok(()) => Ok(MasterPasswordResponse::done(
            "Master password set up successfully",
        )),
        Err(MasterPasswordError::PasswordRejected(violation)) => {
            Ok(MasterPasswordResponse::rejected(violation))
        }
        Err(MasterPasswordError::AlreadyConfigured) => Ok(MasterPasswordResponse::refused(
            "Master password is already configured",
        )),
        Err(e) => Err(e.to_string()),
    }
}

/// Unlock the app with the master password. A stored row from before the
/// verifier and the vault key were separated is replaced here, with everything
/// its key sealed moved to the new key in the same transaction.
#[tauri::command]
pub async fn master_password_unlock(
    password: String,
    state: State<'_, MasterPasswordState>,
    llm_state: State<'_, crate::sys::commands::llm::LLMState>,
    encryption: State<'_, crate::sys::security::MasterPasswordEncryption>,
) -> Result<MasterPasswordResponse, String> {
    check_and_enforce_lockout()?;

    let outcome = {
        let manager = state
            .manager
            .lock()
            .map_err(|e| format!("Failed to acquire lock: {}", e))?;
        manager.unlock(&password, settle_unlock)
    };

    match outcome {
        Ok(unlocked) => {
            record_attempt_outcome(true);
            crate::sys::commands::llm::rehydrate_byok_providers(
                &llm_state.router,
                encryption.inner(),
            )
            .await;
            Ok(MasterPasswordResponse {
                keys_not_upgraded: unlocked.keys_not_upgraded,
                ..MasterPasswordResponse::done("App unlocked successfully")
            })
        }
        Err(MasterPasswordError::InvalidPassword) => {
            record_attempt_outcome(false);
            Ok(MasterPasswordResponse::refused("Invalid password"))
        }
        Err(MasterPasswordError::NotConfigured) => Ok(MasterPasswordResponse::refused(
            "Master password has not been set up yet",
        )),
        Err(e) => Err(e.to_string()),
    }
}

/// Lock the app: clear the cached vault key and forget every provider key
/// that was read through it, so nothing the vault protects stays usable from
/// memory. The providers come back on the next unlock.
#[tauri::command]
pub async fn master_password_lock(
    state: State<'_, MasterPasswordState>,
    llm_state: State<'_, crate::sys::commands::llm::LLMState>,
    encryption: State<'_, crate::sys::security::MasterPasswordEncryption>,
) -> Result<MasterPasswordResponse, String> {
    {
        let manager = state
            .manager
            .lock()
            .map_err(|e| format!("Failed to acquire lock: {}", e))?;
        manager.lock();
    }

    crate::sys::commands::llm::forget_locked_providers(&llm_state.router, encryption.inner()).await;

    Ok(MasterPasswordResponse::done("App locked successfully"))
}

/// Change the master password, once the user has confirmed it natively.
/// Every credential sealed under the old password is re-sealed under the new
/// one in the transaction that stores the new salt and verifier, so a failure
/// leaves the old password working and nothing unreadable.
#[tauri::command]
pub async fn master_password_change(
    app: tauri::AppHandle,
    current_password: String,
    new_password: String,
    state: State<'_, MasterPasswordState>,
    llm_state: State<'_, crate::sys::commands::llm::LLMState>,
    encryption: State<'_, crate::sys::security::MasterPasswordEncryption>,
) -> Result<MasterPasswordResponse, String> {
    check_and_enforce_lockout()?;

    if let Some(violation) = password_rule_violation(&new_password) {
        return Ok(MasterPasswordResponse::rejected(violation));
    }
    if let Some(refusal) =
        refusal_unless_confirmed(&app, "change", change_question(), CHANGE_NOT_CONFIRMED).await
    {
        return Ok(refusal);
    }

    let outcome = {
        let manager = state
            .manager
            .lock()
            .map_err(|e| format!("Failed to acquire lock: {}", e))?;
        manager.change(&current_password, &new_password, reseal_for_change)
    };

    match outcome {
        Ok(()) => {
            record_attempt_outcome(true);
            // A change made while locked leaves the vault open under the new
            // password, so the providers it protects are restored.
            crate::sys::commands::llm::rehydrate_byok_providers(
                &llm_state.router,
                encryption.inner(),
            )
            .await;
            Ok(MasterPasswordResponse::done(
                "Master password changed successfully",
            ))
        }
        Err(MasterPasswordError::InvalidPassword) => {
            record_attempt_outcome(false);
            Ok(MasterPasswordResponse::refused(
                "Current password is incorrect",
            ))
        }
        Err(MasterPasswordError::PasswordRejected(violation)) => {
            Ok(MasterPasswordResponse::rejected(violation))
        }
        Err(unreadable @ MasterPasswordError::UnreadableSavedKeys { .. }) => {
            Ok(MasterPasswordResponse::refused(&unreadable.to_string()))
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Remove the master password. Every credential sealed under it is re-sealed
/// under this device's key in the transaction that deletes the salt and
/// verifier, so nothing is deleted and everything opens without a password
/// afterwards. A failure leaves the password in place.
#[tauri::command]
pub async fn master_password_remove(
    password: String,
    state: State<'_, MasterPasswordState>,
    llm_state: State<'_, crate::sys::commands::llm::LLMState>,
    encryption: State<'_, crate::sys::security::MasterPasswordEncryption>,
) -> Result<MasterPasswordResponse, String> {
    check_and_enforce_lockout()?;

    let outcome = {
        let manager = state
            .manager
            .lock()
            .map_err(|e| format!("Failed to acquire lock: {}", e))?;
        manager.remove(&password, reseal_for_removal)
    };

    match outcome {
        Ok(()) => {
            record_attempt_outcome(true);
            crate::sys::commands::llm::rehydrate_byok_providers(
                &llm_state.router,
                encryption.inner(),
            )
            .await;
            Ok(MasterPasswordResponse::done("Master password removed"))
        }
        Err(MasterPasswordError::InvalidPassword) => {
            record_attempt_outcome(false);
            Ok(MasterPasswordResponse::refused("Password is incorrect"))
        }
        Err(MasterPasswordError::NotConfigured) => Ok(MasterPasswordResponse::refused(
            "Master password has not been set up yet",
        )),
        Err(unreadable @ MasterPasswordError::UnreadableSavedKeys { .. }) => {
            Ok(MasterPasswordResponse::refused(&unreadable.to_string()))
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Result of running the credential-store migration to the master-password
/// vault. Emitted to the frontend so the UI can summarize what happened.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct VaultMigrationReport {
    pub api_keys_migrated: u32,
    pub rows_skipped_already_modern: u32,
    pub rows_skipped_undecryptable: u32,
}

/// Seal every vault-owned credential that is still under the per-install key.
/// Setting a master password does this itself; this is for a store whose
/// password was set by a build that did not.
///
/// Only the rows `vault_credentials::vault_owns_setting` names are touched.
/// MCP server credentials, connector app credentials and connector sign-ins
/// are read by code that runs with the vault locked, so rewriting them under
/// the vault key would leave them unreadable; they are never candidates.
///
/// Each new ciphertext is read back through `vault_credentials::open`, the
/// path every reader of these rows uses, before it replaces the old one. The
/// whole pass is one transaction: an error returns before the commit, which
/// leaves every row as it was.
///
/// Idempotent: a row that already opens under the vault key is counted and
/// skipped, and a row no key opens is counted and left for a later retry.
pub(crate) fn migrate_vault_owned_settings(
    conn: &mut Connection,
    vault: &crate::sys::security::MasterPasswordEncryption,
) -> Result<VaultMigrationReport, String> {
    let mut report = VaultMigrationReport::default();
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to begin the credential migration: {e}"))?;

    let candidates: Vec<(String, String)> = {
        let mut stmt = tx
            .prepare(
                "SELECT key, value FROM settings_v2
                 WHERE category = 'security' AND encrypted = 1
                 ORDER BY key",
            )
            .map_err(|e| format!("Failed to query settings_v2: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("Failed to iterate settings_v2 rows: {e}"))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| format!("Failed to collect settings_v2 rows: {e}"))?
    };

    for (key, stored) in candidates {
        if !vault_credentials::vault_owns_setting(&key) {
            continue;
        }
        if vault.decrypt(KeyPurpose::McpCredentials, &stored).is_ok() {
            report.rows_skipped_already_modern += 1;
            continue;
        }
        let Ok(plaintext) = vault_credentials::open_with_install_key(&stored) else {
            report.rows_skipped_undecryptable += 1;
            continue;
        };

        let sealed = vault_credentials::seal(Some(vault), &plaintext)
            .map_err(|e| format!("Failed to re-encrypt {key}, so nothing was changed: {e}"))?;
        let read_back = vault_credentials::open(Some(vault), &sealed).map_err(|e| {
            format!("{key} did not read back after re-encryption, so nothing was changed: {e}")
        })?;
        if read_back != plaintext {
            return Err(format!(
                "{key} read back differently after re-encryption, so nothing was changed"
            ));
        }

        tx.execute(
            "UPDATE settings_v2 SET value = ?1 WHERE key = ?2",
            rusqlite::params![sealed, key],
        )
        .map_err(|e| format!("Failed to update {key}, so nothing was changed: {e}"))?;

        report.api_keys_migrated += 1;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit the credential migration: {e}"))?;
    Ok(report)
}

/// Re-encrypt the vault-owned credentials under the master password. See
/// [`migrate_vault_owned_settings`] for which rows that is and what it
/// guarantees. Requires the vault to be unlocked.
#[tauri::command]
pub async fn master_password_migrate_credentials(
    encryption: State<'_, crate::sys::security::MasterPasswordEncryption>,
) -> Result<VaultMigrationReport, String> {
    if !encryption.is_configured() {
        return Err("Master password is not set up yet, nothing to migrate.".to_string());
    }
    if !encryption.is_unlocked() {
        return Err(
            "Master password is set up but the vault is locked. Unlock the vault before running migration.".to_string(),
        );
    }

    let mut conn = crate::core::mcp::config::open_mcp_settings_db()?;
    migrate_vault_owned_settings(&mut conn, encryption.inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_test_passphrase() -> &'static str {
        "Alpha-Beta-Unique-1"
    } // gitleaks:allow
    fn invalid_test_passphrase() -> &'static str {
        "Nonmatching-Phrase-9"
    } // gitleaks:allow

    fn create_test_state() -> MasterPasswordState {
        // Use in-memory database for tests to avoid temp file cleanup issues
        let conn = Connection::open_in_memory().unwrap();
        MasterPasswordState::new(Arc::new(Mutex::new(conn))).unwrap()
    }

    #[tokio::test]
    async fn test_setup_and_unlock_flow() {
        let state = create_test_state();
        let manager = state.manager.lock().unwrap();

        // Initially not configured
        assert!(!manager.is_configured().unwrap());

        // Setup
        manager.setup(valid_test_passphrase()).unwrap();
        assert!(manager.is_configured().unwrap());

        // Verify
        assert!(manager.verify(valid_test_passphrase()).unwrap());
        assert!(!manager.verify(invalid_test_passphrase()).unwrap());

        // Lock and unlock
        manager.lock();
        assert!(!manager.is_unlocked());

        manager
            .unlock(valid_test_passphrase(), |_, _, _| Ok(()))
            .unwrap();
        assert!(manager.is_unlocked());
    }

    #[test]
    fn the_native_questions_say_what_cannot_be_undone_and_can_be_asked() {
        for question in [setup_question(), change_question()] {
            assert!(question.body.contains("cannot be recovered"));
            assert!(question.body.contains("at every start"));
            assert!(question.body.contains("typed in the AGI Workforce window"));
            assert!(crate::sys::native_confirm::can_ask_with(
                &question.confirm_label
            ));
            assert!(crate::sys::native_confirm::check_it_fits(&question.body).is_ok());
        }
        assert_ne!(
            setup_question().confirm_label,
            change_question().confirm_label
        );
        assert!(SETUP_NOT_CONFIRMED.contains("nothing was changed"));
        assert!(CHANGE_NOT_CONFIRMED.contains("nothing was changed"));
    }

    #[test]
    fn a_refused_new_password_names_the_rule_it_broke() {
        let state = create_test_state();
        let manager = state.manager.lock().unwrap();

        let refusal = manager
            .setup_with("onlylowercaseletters", |_, _| Ok(())) // gitleaks:allow
            .expect_err("one character class is not enough");
        let MasterPasswordError::PasswordRejected(violation) = refusal else {
            panic!("expected a password rule violation");
        };

        let response = MasterPasswordResponse::rejected(violation);
        assert!(!response.success);
        assert!(!response.message.contains("Cryptographic"));
        let sent = serde_json::to_value(&response).unwrap();
        assert_eq!(sent["violation"]["rule"], "too_few_character_classes");
        assert_eq!(sent["violation"]["min_character_classes"], 3);

        let sent = serde_json::to_value(MasterPasswordResponse::done("ok")).unwrap();
        assert!(sent.get("violation").is_none());
    }
}
