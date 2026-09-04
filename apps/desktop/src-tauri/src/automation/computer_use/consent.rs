//! Consent Gate for Computer Use.
//!
//! Tracks whether the user has accepted the computer use terms.
//! Must be accepted before any computer use session can start.
//!
//! The record lives in `settings_v2`, which `settings_v2_set` writes for any
//! key the renderer names, so the row itself proves nothing. Each grant
//! therefore carries an HMAC keyed by the per-install secret in the OS
//! credential store, which no IPC command returns: a row a compromised webview
//! wrote is arithmetically indistinguishable from a row it never saw the user
//! approve, and both read as "not accepted".
//!
//! The sealed row is readable through `settings_v2_get` and deletable through
//! `settings_v2_delete`, so a caller that copies it can write it back later. A
//! grant is therefore also sealed under a [`ConsentScope`] secret that is
//! generated per process and never persisted. That bounds a copied row two
//! ways: it dies when the app quits, and [`revoke_consent`] rotates the secret
//! so every grant issued before a revocation stops verifying. [`load_consent`]
//! rotates on the same terms when it finds that a grant this process issued has
//! been removed or overwritten, which is how a revocation performed through the
//! generic settings commands also burns the copies.

use crate::data::settings::{SettingCategory, SettingValue, SettingsService, SettingsServiceError};
use crate::sys::security::machine_key::{self, KeyPurpose};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use once_cell::sync::Lazy;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::RwLock;

/// Current consent version. Increment to force re-consent on major changes.
pub const CONSENT_VERSION: &str = "1.0";

/// Settings key for persisting consent state.
pub const CONSENT_SETTINGS_KEY: &str = "computer_use.consent";

/// Domain separator for the grant key expanded out of the per-install secret.
const CONSENT_GRANT_INFO: &[u8] = b"agiworkforce:computer_use_consent:v2";

const SCOPE_SECRET_BYTES: usize = 32;

const HMAC_ACCEPTS_ANY_KEY: &str = "HMAC accepts a key of any length";

type ConsentMac = Hmac<Sha256>;

/// Why a consent record could not be written.
#[derive(Debug, thiserror::Error)]
pub enum ConsentError {
    #[error("computer-use consent cannot be bound to this installation: {0}")]
    Binding(String),
    #[error(transparent)]
    Storage(#[from] SettingsServiceError),
}

/// Persisted consent state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputerUseConsent {
    /// Whether the user has accepted computer use terms.
    pub accepted: bool,
    /// When consent was given.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accepted_at: Option<DateTime<Utc>>,
    /// Consent version that was accepted.
    pub version: String,
}

impl ComputerUseConsent {
    /// Creates a default (not accepted) consent state.
    pub fn not_accepted() -> Self {
        Self {
            accepted: false,
            accepted_at: None,
            version: CONSENT_VERSION.to_string(),
        }
    }

    /// Records that consent was given.
    pub fn accept() -> Self {
        Self {
            accepted: true,
            accepted_at: Some(Utc::now()),
            version: CONSENT_VERSION.to_string(),
        }
    }

    /// Whether consent is valid (accepted and correct version).
    pub fn is_valid(&self) -> bool {
        self.accepted && self.version == CONSENT_VERSION
    }
}

impl Default for ComputerUseConsent {
    fn default() -> Self {
        Self::not_accepted()
    }
}

/// The lifetime a grant is bound to.
///
/// Rotating the secret makes every grant sealed under the previous one
/// unverifiable, which is what turns "turn computer use off" into a revocation
/// a copied settings row cannot undo.
pub struct ConsentScope {
    secret: RwLock<Option<[u8; SCOPE_SECRET_BYTES]>>,
    issued: AtomicBool,
}

impl ConsentScope {
    pub fn new() -> Self {
        Self {
            secret: RwLock::new(fresh_secret()),
            issued: AtomicBool::new(false),
        }
    }

    /// A scope with no secret, standing in for a machine that cannot bind a
    /// grant. Sealing and verifying both fail closed.
    #[cfg(test)]
    pub fn unbindable() -> Self {
        Self {
            secret: RwLock::new(None),
            issued: AtomicBool::new(false),
        }
    }

    /// Invalidates every grant sealed under the current secret.
    pub fn rotate(&self) {
        if let Ok(mut secret) = self.secret.write() {
            *secret = fresh_secret();
        }
        self.issued.store(false, Ordering::SeqCst);
    }

    fn secret(&self) -> Option<[u8; SCOPE_SECRET_BYTES]> {
        self.secret.read().ok().and_then(|secret| *secret)
    }

    fn forget_grants_issued_here(&self) {
        if self.issued.swap(false, Ordering::SeqCst) {
            self.rotate();
        }
    }
}

impl Default for ConsentScope {
    fn default() -> Self {
        Self::new()
    }
}

static PROCESS_SCOPE: Lazy<ConsentScope> = Lazy::new(ConsentScope::new);

/// The scope every shipped caller seals and verifies grants under.
pub fn process_scope() -> &'static ConsentScope {
    &PROCESS_SCOPE
}

static PROMPTS_ON_SCREEN: AtomicUsize = AtomicUsize::new(0);

/// True while a native consent prompt is waiting for the user's answer.
///
/// The prompt is only a decision the user makes if the app cannot answer it, so
/// every path that can synthesize a keystroke or a click has to refuse while
/// this holds, including callers that never went through a Tauri command.
pub fn consent_prompt_is_on_screen() -> bool {
    PROMPTS_ON_SCREEN.load(Ordering::SeqCst) > 0
}

/// Marks a consent prompt as on screen until the returned guard is dropped.
pub fn consent_prompt_on_screen() -> ConsentPromptOnScreen {
    PROMPTS_ON_SCREEN.fetch_add(1, Ordering::SeqCst);
    ConsentPromptOnScreen(())
}

pub struct ConsentPromptOnScreen(());

impl Drop for ConsentPromptOnScreen {
    fn drop(&mut self) {
        PROMPTS_ON_SCREEN.fetch_sub(1, Ordering::SeqCst);
    }
}

fn fresh_secret() -> Option<[u8; SCOPE_SECRET_BYTES]> {
    let mut secret = [0u8; SCOPE_SECRET_BYTES];
    match OsRng.try_fill_bytes(&mut secret) {
        Ok(()) => Some(secret),
        Err(error) => {
            tracing::error!("computer-use consent scope has no randomness: {error}");
            None
        }
    }
}

/// A consent record plus the grant that proves this installation wrote it.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SealedConsent {
    record: ComputerUseConsent,
    grant: String,
}

/// Reads the persisted grant.
///
/// A missing, unreadable, malformed, unbound, or out-of-scope record is
/// reported as "not accepted", so neither a corrupted settings row nor one
/// forged through a generic settings writer can ever be read as permission to
/// take over the desktop.
pub fn load_consent(scope: &ConsentScope, service: &SettingsService) -> ComputerUseConsent {
    let sealed = service
        .get(CONSENT_SETTINGS_KEY)
        .ok()
        .and_then(|value| sealed_from_setting_value(&value))
        .filter(|sealed| grant_matches(scope, &sealed.record, &sealed.grant));

    match sealed {
        Some(sealed) => sealed.record,
        None => {
            scope.forget_grants_issued_here();
            ComputerUseConsent::not_accepted()
        }
    }
}

pub fn persist_consent(
    scope: &ConsentScope,
    service: &SettingsService,
    consent: &ComputerUseConsent,
) -> Result<(), ConsentError> {
    let sealed = SealedConsent {
        record: consent.clone(),
        grant: grant_for(scope, consent)?,
    };
    let value =
        serde_json::to_value(&sealed).map_err(|error| ConsentError::Binding(error.to_string()))?;
    service.set(
        CONSENT_SETTINGS_KEY.to_string(),
        SettingValue::Json(value),
        SettingCategory::Security,
        false,
    )?;
    if consent.is_valid() {
        scope.issued.store(true, Ordering::SeqCst);
    }
    Ok(())
}

/// Withdraws consent and makes every grant already issued under this scope
/// unusable, so a caller that copied the sealed row cannot write it back.
pub fn revoke_consent(scope: &ConsentScope, service: &SettingsService) -> Result<(), ConsentError> {
    scope.rotate();
    service.delete(CONSENT_SETTINGS_KEY)?;
    Ok(())
}

fn sealed_from_setting_value(value: &SettingValue) -> Option<SealedConsent> {
    match value {
        SettingValue::Json(json) => serde_json::from_value(json.clone()).ok(),
        SettingValue::String(raw) => serde_json::from_str(raw).ok(),
        _ => None,
    }
}

/// Keys an HMAC over the record with a subkey expanded from the per-install
/// secret and the scope secret. The install secret never leaves the process and
/// no command returns it, so a caller that can write the settings row still
/// cannot produce this value; the scope secret bounds how long a value it
/// copied stays usable.
fn consent_mac(
    scope: &ConsentScope,
    consent: &ComputerUseConsent,
) -> Result<ConsentMac, ConsentError> {
    let install_key = machine_key::try_derive_key(KeyPurpose::MasterEncryption)
        .map_err(|error| ConsentError::Binding(error.to_string()))?;
    let scope_secret = scope
        .secret()
        .ok_or_else(|| ConsentError::Binding("consent scope has no secret".to_string()))?;

    let mut expand = <ConsentMac as Mac>::new_from_slice(&install_key).expect(HMAC_ACCEPTS_ANY_KEY);
    expand.update(CONSENT_GRANT_INFO);
    expand.update(&scope_secret);
    let grant_key = expand.finalize().into_bytes();

    let payload =
        serde_json::to_vec(consent).map_err(|error| ConsentError::Binding(error.to_string()))?;
    let mut grant = <ConsentMac as Mac>::new_from_slice(&grant_key).expect(HMAC_ACCEPTS_ANY_KEY);
    grant.update(&payload);
    Ok(grant)
}

fn grant_for(scope: &ConsentScope, consent: &ComputerUseConsent) -> Result<String, ConsentError> {
    Ok(hex::encode(
        consent_mac(scope, consent)?.finalize().into_bytes(),
    ))
}

fn grant_matches(scope: &ConsentScope, consent: &ComputerUseConsent, grant: &str) -> bool {
    let Ok(mac) = consent_mac(scope, consent) else {
        return false;
    };
    let Ok(candidate) = hex::decode(grant) else {
        return false;
    };
    mac.verify_slice(&candidate).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    fn settings_service() -> SettingsService {
        let conn = Connection::open_in_memory().expect("in-memory settings database");
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
        .expect("create settings table");
        SettingsService::new(Arc::new(Mutex::new(conn))).expect("settings service")
    }

    /// Writes the row exactly as `settings_v2_set` would from the renderer:
    /// arbitrary key, arbitrary JSON object, `security` category, unencrypted.
    fn write_unbound_row(service: &SettingsService, value: serde_json::Value) {
        service
            .set(
                CONSENT_SETTINGS_KEY.to_string(),
                SettingValue::Json(value),
                SettingCategory::Security,
                false,
            )
            .expect("write settings row");
    }

    /// Everything `settings_v2_get` would hand a caller that read the row.
    fn copy_stored_row(service: &SettingsService) -> serde_json::Value {
        match service.get(CONSENT_SETTINGS_KEY).expect("stored consent") {
            SettingValue::Json(json) => json,
            other => panic!("unexpected stored consent value: {other:?}"),
        }
    }

    #[test]
    fn test_default_is_not_accepted() {
        let consent = ComputerUseConsent::default();
        assert!(!consent.accepted);
        assert!(!consent.is_valid());
    }

    #[test]
    fn test_accept() {
        let consent = ComputerUseConsent::accept();
        assert!(consent.accepted);
        assert!(consent.is_valid());
        assert!(consent.accepted_at.is_some());
    }

    #[test]
    fn test_version_mismatch_invalidates() {
        let mut consent = ComputerUseConsent::accept();
        consent.version = "0.9".to_string();
        assert!(!consent.is_valid());
    }

    #[test]
    fn test_json_roundtrip() {
        let consent = ComputerUseConsent::accept();
        let json = serde_json::to_string(&consent).unwrap();
        let restored: ComputerUseConsent = serde_json::from_str(&json).unwrap();
        assert!(restored.is_valid());
    }

    #[test]
    fn unset_consent_loads_as_not_accepted() {
        let service = settings_service();
        assert!(!load_consent(&ConsentScope::new(), &service).is_valid());
    }

    #[test]
    fn persisted_consent_round_trips_through_settings() {
        let service = settings_service();
        let scope = ConsentScope::new();
        persist_consent(&scope, &service, &ComputerUseConsent::accept()).expect("persist consent");
        let loaded = load_consent(&scope, &service);
        assert!(loaded.is_valid());
        assert!(loaded.accepted_at.is_some());

        persist_consent(&scope, &service, &ComputerUseConsent::not_accepted())
            .expect("revoke consent");
        assert!(!load_consent(&scope, &service).is_valid());
    }

    #[test]
    fn stale_version_and_malformed_records_load_as_not_accepted() {
        let service = settings_service();
        let scope = ConsentScope::new();
        let mut stale = ComputerUseConsent::accept();
        stale.version = "0.9".to_string();
        persist_consent(&scope, &service, &stale).expect("persist stale consent");
        assert!(!load_consent(&scope, &service).is_valid());

        service
            .set(
                CONSENT_SETTINGS_KEY.to_string(),
                SettingValue::Boolean(true),
                SettingCategory::Security,
                false,
            )
            .expect("persist malformed consent");
        assert!(!load_consent(&scope, &service).is_valid());
    }

    /// F20 (audit 2026-08-21): a webview that can reach `settings_v2_set` can
    /// write this key with any JSON it likes. Without the install-secret grant
    /// that row was byte-identical to a real acceptance.
    #[test]
    fn a_consent_row_written_without_the_install_grant_is_not_consent() {
        let service = settings_service();
        write_unbound_row(
            &service,
            serde_json::json!({
                "accepted": true,
                "accepted_at": "2026-08-21T00:00:00Z",
                "version": CONSENT_VERSION,
            }),
        );
        assert!(!load_consent(&ConsentScope::new(), &service).is_valid());
    }

    #[test]
    fn a_forged_grant_string_is_not_consent() {
        let service = settings_service();
        write_unbound_row(
            &service,
            serde_json::json!({
                "record": {
                    "accepted": true,
                    "accepted_at": "2026-08-21T00:00:00Z",
                    "version": CONSENT_VERSION,
                },
                "grant": "00".repeat(32),
            }),
        );
        assert!(!load_consent(&ConsentScope::new(), &service).is_valid());
    }

    /// The grant covers the whole record, so the one a revocation was sealed
    /// with cannot be lifted onto an acceptance.
    #[test]
    fn a_grant_cannot_be_moved_between_records() {
        let service = settings_service();
        let scope = ConsentScope::new();
        persist_consent(&scope, &service, &ComputerUseConsent::not_accepted())
            .expect("persist revocation");
        let stolen_grant = copy_stored_row(&service)["grant"]
            .as_str()
            .expect("stored grant")
            .to_string();

        write_unbound_row(
            &service,
            serde_json::json!({
                "record": {
                    "accepted": true,
                    "accepted_at": "2026-08-21T00:00:00Z",
                    "version": CONSENT_VERSION,
                },
                "grant": stolen_grant,
            }),
        );
        assert!(!load_consent(&scope, &service).is_valid());
    }

    /// The dialog promises the grant ends when computer use is turned off, so
    /// a row copied out of `settings_v2_get` while it was valid must not be
    /// usable afterwards.
    #[test]
    fn a_copied_grant_cannot_be_replayed_after_a_revocation() {
        let service = settings_service();
        let scope = ConsentScope::new();
        persist_consent(&scope, &service, &ComputerUseConsent::accept()).expect("persist consent");
        let copied = copy_stored_row(&service);
        assert!(load_consent(&scope, &service).is_valid());

        revoke_consent(&scope, &service).expect("revoke consent");
        assert!(!load_consent(&scope, &service).is_valid());

        write_unbound_row(&service, copied);
        assert!(!load_consent(&scope, &service).is_valid());
    }

    /// The settings toggle revokes by deleting the row through the generic
    /// settings commands, so the read that notices the grant is gone must burn
    /// it too.
    #[test]
    fn a_grant_deleted_through_settings_cannot_be_written_back() {
        let service = settings_service();
        let scope = ConsentScope::new();
        persist_consent(&scope, &service, &ComputerUseConsent::accept()).expect("persist consent");
        let copied = copy_stored_row(&service);

        service.delete(CONSENT_SETTINGS_KEY).expect("delete row");
        assert!(!load_consent(&scope, &service).is_valid());

        write_unbound_row(&service, copied);
        assert!(!load_consent(&scope, &service).is_valid());
    }

    /// A grant is sealed to one process, so a row that survives on disk does
    /// not hand the next launch desktop control without asking again.
    #[test]
    fn a_grant_does_not_verify_under_another_scope() {
        let service = settings_service();
        let first_run = ConsentScope::new();
        persist_consent(&first_run, &service, &ComputerUseConsent::accept())
            .expect("persist consent");
        assert!(load_consent(&first_run, &service).is_valid());

        let next_run = ConsentScope::new();
        assert!(!load_consent(&next_run, &service).is_valid());
    }
}
