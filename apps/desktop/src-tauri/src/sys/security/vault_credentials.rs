//! The credentials the master-password vault owns, and the one codec for them.
//!
//! Two kinds of secret live in `settings_v2` under `category = 'security'`:
//!
//! - **Vault-owned** rows, named by [`vault_owns_setting`]: provider API keys
//!   (`api_key_*`). They are written through [`seal`] and read through
//!   [`open`], so once a master password is set they are sealed under it and
//!   cannot be read while the vault is locked.
//! - **Install-key** rows: MCP server credentials (`mcp_secret/*`), connector
//!   app credentials (`mcp_oauth_config_*`), connector sign-ins
//!   (`mcp_oauth_tokens_*`, `mcp_oauth_*_access_token`,
//!   `mcp_oauth_*_refresh_token`) and everything the settings service
//!   encrypts. MCP servers start and tokens refresh unattended, at launch and
//!   in scheduled runs, before anyone has typed a password, and a refresh
//!   needs the app credential beside the refresh token, so these stay under
//!   the per-install key and are never rewritten under the vault key.
//!
//! Connector app credentials were vault-owned for a time. A row of theirs
//! still sealed under the vault key is moved back to the per-install key
//! whenever the vault key is in hand, and its readers go through [`open`]
//! until then.
//!
//! Setting, upgrading, changing and removing the master password, the vault
//! migration and every reader take the family rule from here. A row family
//! moves into the vault only by adding its prefix below and routing each of
//! its readers and writers through this module in the same change.
//!
//! Nothing outside `settings_v2` is sealed under the vault key any more. An
//! earlier build sealed the connector permissions file under it; that store
//! decides which tools may run while locked, so
//! `sys::commands::connector_permissions` now keeps it under the machine key,
//! and the commands that have the vault key in hand move an old file back.
use std::sync::OnceLock;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose;
use base64::Engine as _;
use rusqlite::Connection;

use super::aead_nonce::random_nonce;
use super::machine_key::{try_derive_key, KeyPurpose};
use super::master_password::{MasterPasswordError, PasswordKey};
use super::master_password_encryption::MasterPasswordEncryption;

const NONCE_SIZE: usize = 12;

const VAULT_OWNED_SETTING_PREFIXES: [&str; 1] = ["api_key_"];

const RELEASED_SETTING_PREFIXES: [&str; 1] = ["mcp_oauth_config_"];

/// What a reader reports when a credential is sealed under the master
/// password and the vault is locked.
pub const VAULT_LOCKED_MESSAGE: &str = "This credential is protected by your master password. Unlock your saved keys in Settings, under Privacy, and try again.";

static VAULT: OnceLock<MasterPasswordEncryption> = OnceLock::new();

/// Publish the vault for readers that cannot take Tauri `State`, such as MCP
/// configuration resolution. Idempotent: a second call leaves the first handle
/// in place.
pub fn install_global(vault: MasterPasswordEncryption) {
    let _ = VAULT.set(vault);
}

/// The installed vault, or `None` before `lib.rs::setup` has published it.
pub fn global() -> Option<&'static MasterPasswordEncryption> {
    VAULT.get()
}

/// Whether a `settings_v2` row belongs to the vault.
pub fn vault_owns_setting(key: &str) -> bool {
    VAULT_OWNED_SETTING_PREFIXES
        .iter()
        .any(|prefix| key.starts_with(prefix))
}

/// Whether a `settings_v2` row belongs to a family the vault used to own.
fn vault_released_setting(key: &str) -> bool {
    RELEASED_SETTING_PREFIXES
        .iter()
        .any(|prefix| key.starts_with(prefix))
}

/// Seal a vault-owned credential for storage.
///
/// With a master password set, the value is sealed under it, and a locked
/// vault is an error rather than a silent write under a weaker key. With none
/// set, the per-install key is used.
pub fn seal(vault: Option<&MasterPasswordEncryption>, value: &str) -> Result<String, String> {
    if let Some(vault) = vault.filter(|vault| vault.is_configured()) {
        return vault
            .encrypt(KeyPurpose::McpCredentials, value)
            .map_err(|error| match error {
                MasterPasswordError::AppLocked => {
                    "Master password is set up but the vault is locked. Unlock the vault before storing credentials.".to_string()
                }
                other => format!("Failed to encrypt with master password: {other}"),
            });
    }
    seal_with_install_key(value)
}

/// Open a vault-owned credential.
///
/// The vault key is tried first when the vault is unlocked. A row of a store
/// whose master password was set by an older build, and not migrated since,
/// still opens under the per-install key. When neither opens it and the vault
/// is locked, the answer is [`VAULT_LOCKED_MESSAGE`], so the caller asks for
/// an unlock instead of reporting a corrupt key.
pub fn open(vault: Option<&MasterPasswordEncryption>, encrypted: &str) -> Result<String, String> {
    let vault = vault.filter(|vault| vault.is_configured());
    if let Some(vault) = vault.filter(|vault| vault.is_unlocked()) {
        if let Ok(plaintext) = vault.decrypt(KeyPurpose::McpCredentials, encrypted) {
            return Ok(plaintext);
        }
    }
    open_with_install_key(encrypted).map_err(|error| {
        if vault.is_some_and(|vault| !vault.is_unlocked()) {
            VAULT_LOCKED_MESSAGE.to_string()
        } else {
            error
        }
    })
}

/// The per-install key, or an error. Never the process-ephemeral key
/// `machine_key::derive_key` falls back to: a credential moved under that
/// would be unreadable after the next launch.
fn per_install_key() -> Result<Vec<u8>, String> {
    try_derive_key(KeyPurpose::McpCredentials)
        .map_err(|e| format!("This device's encryption key is unavailable: {e}"))
}

pub fn seal_with_install_key(value: &str) -> Result<String, String> {
    seal_with_key(&per_install_key()?, value)
}

pub fn open_with_install_key(encrypted: &str) -> Result<String, String> {
    open_with_key(&per_install_key()?, encrypted)
}

fn seal_with_key(key: &[u8], value: &str) -> Result<String, String> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| format!("Failed to create cipher: {e}"))?;
    let nonce = random_nonce();
    let ciphertext = cipher
        .encrypt(&nonce, value.as_bytes())
        .map_err(|e| format!("Encryption failed: {e}"))?;

    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(general_purpose::STANDARD.encode(combined))
}

fn open_with_key(key: &[u8], encrypted: &str) -> Result<String, String> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| format!("Failed to create cipher: {e}"))?;
    let combined = general_purpose::STANDARD
        .decode(encrypted)
        .map_err(|e| format!("Failed to decode: {e}"))?;
    if combined.len() < NONCE_SIZE {
        return Err("Invalid encrypted data".to_string());
    }

    let (nonce_bytes, ciphertext) = combined.split_at(NONCE_SIZE);
    #[allow(deprecated)]
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {e}"))?;
    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8: {e}"))
}

fn security_rows(conn: &Connection) -> Result<Vec<(String, String)>, String> {
    let has_settings: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'settings_v2'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to look for settings_v2: {e}"))?;
    if has_settings == 0 {
        return Ok(Vec::new());
    }

    let mut stmt = conn
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
    let rows = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("Failed to collect settings_v2 rows: {e}"))?;
    Ok(rows)
}

/// How many vault-owned rows still open under the per-install key, which is
/// to say without the master password.
pub fn owned_settings_outside_the_vault(conn: &Connection) -> Result<u32, String> {
    let Ok(install_key) = per_install_key() else {
        return Ok(0);
    };
    let outside = security_rows(conn)?
        .iter()
        .filter(|(key, stored)| {
            vault_owns_setting(key) && open_with_key(&install_key, stored).is_ok()
        })
        .count();
    Ok(outside as u32)
}

/// Why a re-seal changed nothing.
enum ResealFailure {
    /// Vault-owned rows, by provider, that no available key opens.
    Unopened(Vec<String>),
    Failed(String),
}

impl From<ResealFailure> for MasterPasswordError {
    fn from(failure: ResealFailure) -> Self {
        match failure {
            ResealFailure::Unopened(providers) => {
                MasterPasswordError::UnreadableSavedKeys { providers }
            }
            ResealFailure::Failed(reason) => MasterPasswordError::CryptoError(reason),
        }
    }
}

/// One re-seal pass over the security rows.
struct Reseal<'a> {
    /// Keys a row may currently be sealed under, tried in order.
    from_keys: &'a [Vec<u8>],
    /// Where a vault-owned row that opens goes. `None` leaves those rows.
    owned_to: Option<&'a [u8]>,
    /// Where a row of a released family that opens goes.
    released_to: Option<&'a [u8]>,
    /// Set when the `from_keys` are about to stop existing. Every vault-owned
    /// row must then open under one of them or under this, the per-install
    /// key; a row that opens under neither would be lost for good, so the
    /// pass fails and names it.
    must_open_under: Option<&'a [u8]>,
}

fn provider_of(setting_key: &str) -> String {
    VAULT_OWNED_SETTING_PREFIXES
        .iter()
        .find_map(|prefix| setting_key.strip_prefix(prefix))
        .unwrap_or(setting_key)
        .to_string()
}

/// Move the rows that open under one of `from_keys`: vault-owned ones to
/// `owned_to`, ones of a released family to `released_to`. Returns how many
/// moved.
///
/// Runs on the caller's connection, which is expected to be inside a
/// transaction: each new ciphertext is read back under its new key before it
/// replaces the old one, and the first failure is returned so the caller
/// rolls back with every row as it was. A row that opens under none of the
/// keys was never sealed with them and is left alone, as is every row of a
/// family the vault never owned.
fn reseal_settings(conn: &Connection, pass: Reseal<'_>) -> Result<u32, ResealFailure> {
    let mut moved = 0;
    let mut unopened = Vec::new();
    for (key, stored) in security_rows(conn).map_err(ResealFailure::Failed)? {
        let owned = vault_owns_setting(&key);
        let to_key = if owned {
            pass.owned_to
        } else if vault_released_setting(&key) {
            pass.released_to
        } else {
            None
        };
        let Some(to_key) = to_key else {
            continue;
        };
        let opened = pass
            .from_keys
            .iter()
            .find_map(|from_key| open_with_key(from_key, &stored).ok());
        let Some(plaintext) = opened else {
            let lost = owned
                && pass
                    .must_open_under
                    .is_some_and(|other| open_with_key(other, &stored).is_err());
            if lost {
                unopened.push(provider_of(&key));
            }
            continue;
        };

        let sealed = seal_with_key(to_key, &plaintext).map_err(|e| {
            ResealFailure::Failed(format!(
                "Failed to re-seal {key}, so nothing was changed: {e}"
            ))
        })?;
        let read_back = open_with_key(to_key, &sealed).map_err(|e| {
            ResealFailure::Failed(format!(
                "{key} did not read back after re-sealing, so nothing was changed: {e}"
            ))
        })?;
        if read_back != plaintext {
            return Err(ResealFailure::Failed(format!(
                "{key} read back differently after re-sealing, so nothing was changed"
            )));
        }

        conn.execute(
            "UPDATE settings_v2 SET value = ?1 WHERE key = ?2",
            rusqlite::params![sealed, key],
        )
        .map_err(|e| {
            ResealFailure::Failed(format!(
                "Failed to update {key}, so nothing was changed: {e}"
            ))
        })?;
        moved += 1;
    }

    if unopened.is_empty() {
        Ok(moved)
    } else {
        Err(ResealFailure::Unopened(unopened))
    }
}

/// The seal step of setting a master password: every vault-owned row moves
/// from the per-install key to the new vault key, so none stays readable
/// without the password. Pass it to `MasterPasswordManager::setup_with`.
pub fn seal_existing_under_password(
    conn: &Connection,
    new_key: &PasswordKey<'_>,
) -> Result<u32, MasterPasswordError> {
    let install_key = per_install_key().map_err(MasterPasswordError::CryptoError)?;
    let to = new_key.purpose_key(KeyPurpose::McpCredentials)?;
    Ok(reseal_settings(
        conn,
        Reseal {
            from_keys: std::slice::from_ref(&install_key),
            owned_to: Some(to.as_slice()),
            released_to: None,
            must_open_under: None,
        },
    )?)
}

/// The settle step of an unlock. Rows of a released family go back to the
/// per-install key. When the stored row is being upgraded, every vault-owned
/// row also moves from the old vault keys to `upgraded`, and the step fails
/// with [`MasterPasswordError::UnreadableSavedKeys`] if one of them opens
/// under no key, so the old row is kept. Pass it to
/// `MasterPasswordManager::unlock`.
pub fn settle_at_unlock(
    conn: &Connection,
    key: &PasswordKey<'_>,
    upgraded: Option<&PasswordKey<'_>>,
) -> Result<u32, MasterPasswordError> {
    let install_key = per_install_key().map_err(MasterPasswordError::CryptoError)?;
    let from_keys = key.purpose_keys(KeyPurpose::McpCredentials)?;
    let to = upgraded
        .map(|upgraded| upgraded.purpose_key(KeyPurpose::McpCredentials))
        .transpose()?;
    Ok(reseal_settings(
        conn,
        Reseal {
            from_keys: &from_keys,
            owned_to: to.as_deref(),
            released_to: Some(install_key.as_slice()),
            must_open_under: to.as_ref().map(|_| install_key.as_slice()),
        },
    )?)
}

/// The re-seal step of a master password change: every vault-owned row moves
/// from the old vault keys to the new one, or the step fails naming the rows
/// no key opens. Pass it to `MasterPasswordManager::change`.
pub fn reseal_for_new_password(
    conn: &Connection,
    old_key: &PasswordKey<'_>,
    new_key: &PasswordKey<'_>,
) -> Result<u32, MasterPasswordError> {
    let install_key = per_install_key().map_err(MasterPasswordError::CryptoError)?;
    let from_keys = old_key.purpose_keys(KeyPurpose::McpCredentials)?;
    let to = new_key.purpose_key(KeyPurpose::McpCredentials)?;
    Ok(reseal_settings(
        conn,
        Reseal {
            from_keys: &from_keys,
            owned_to: Some(to.as_slice()),
            released_to: Some(install_key.as_slice()),
            must_open_under: Some(install_key.as_slice()),
        },
    )?)
}

/// The re-seal step of removing the master password: every row sealed under
/// it moves back to the per-install key, so it opens without a password, or
/// the step fails naming the rows no key opens. Pass it to
/// `MasterPasswordManager::remove`.
pub fn reseal_under_install_key(
    conn: &Connection,
    password_key: &PasswordKey<'_>,
) -> Result<u32, MasterPasswordError> {
    let install_key = per_install_key().map_err(MasterPasswordError::CryptoError)?;
    let from_keys = password_key.purpose_keys(KeyPurpose::McpCredentials)?;
    Ok(reseal_settings(
        conn,
        Reseal {
            from_keys: &from_keys,
            owned_to: Some(install_key.as_slice()),
            released_to: Some(install_key.as_slice()),
            must_open_under: Some(install_key.as_slice()),
        },
    )?)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::super::master_password::test_support::{
        fixture_passphrase, other_fixture_passphrase,
    };
    use super::super::master_password::{MasterPasswordManager, UnlockOutcome};
    use super::*;

    const SHARED_VERIFIER_KDF_VERSION: u32 = 2;
    const FIRST_KDF_VERSION: u32 = 1;
    const ITERATIONS_BEFORE_MAY_2026: u32 = 2;

    const LOST_API_KEY_ROW: &str = "api_key_lostprovider";

    const API_KEY_ROW: &str = "api_key_fixtureprovider";
    const SECOND_API_KEY_ROW: &str = "api_key_secondprovider";
    const APP_SECRET_ROW: &str = "mcp_oauth_config_github_client_secret";
    const UNMIGRATED_API_KEY_ROW: &str = "api_key_unmigratedprovider";
    const SERVER_CREDENTIAL_ROW: &str = "mcp_secret/user/666978747572652d736572766572/TOKEN";

    const API_KEY: &str = "fixture-provider-key";
    const SECOND_API_KEY: &str = "fixture-second-provider-key";
    const APP_SECRET: &str = "fixture-client-secret";
    const UNMIGRATED_API_KEY: &str = "fixture-unmigrated-key";
    const SERVER_CREDENTIAL: &str = "fixture-server-credential";

    /// A vault whose database also holds `settings_v2`, as the app's does, so
    /// every step that changes the vault key re-seals in the same transaction.
    struct Vault {
        db: Arc<Mutex<Connection>>,
        helper: MasterPasswordEncryption,
        manager: Arc<Mutex<MasterPasswordManager>>,
    }

    impl Vault {
        fn without_a_password() -> Self {
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
            let db = Arc::new(Mutex::new(conn));
            let manager = MasterPasswordManager::new(db.clone());
            manager.init_table().unwrap();
            let manager = Arc::new(Mutex::new(manager));
            Self {
                db,
                helper: MasterPasswordEncryption::new(manager.clone()),
                manager,
            }
        }

        fn unlocked() -> Self {
            let vault = Self::without_a_password();
            vault.set_password().expect("set the password");
            vault
        }

        /// A vault as a build before the verifier and the key were separated
        /// left it, unlocked under that build's key.
        fn unlocked_under_a_shared_verifier_row() -> Self {
            let vault = Self::without_a_password();
            let manager = vault.manager.lock().unwrap();
            manager.store_legacy_row(fixture_passphrase(), SHARED_VERIFIER_KDF_VERSION);
            manager
                .unlock(fixture_passphrase(), |_, _, _| {
                    Err(MasterPasswordError::CryptoError(
                        "fixture: stay on the stored row".to_string(),
                    ))
                })
                .unwrap();
            drop(manager);
            vault
        }

        fn set_password(&self) -> Result<(), MasterPasswordError> {
            self.manager
                .lock()
                .unwrap()
                .setup_with(fixture_passphrase(), |conn, new_key| {
                    seal_existing_under_password(conn, new_key).map(|_| ())
                })
        }

        fn lock(&self) {
            self.manager.lock().unwrap().lock();
            assert!(!self.helper.is_unlocked());
        }

        /// A vault from a build before 2026-05-05, unlocked the way builds
        /// since then unlocked it, holding one provider key saved in each
        /// period: the first under the two-iteration key, the second under
        /// the three-iteration key. Returns both keys, the current one first.
        fn from_before_may_2026() -> (Self, Vec<Vec<u8>>) {
            let vault = Self::without_a_password();
            let manager = vault.manager.lock().unwrap();
            manager.store_legacy_row_at(
                fixture_passphrase(),
                FIRST_KDF_VERSION,
                ITERATIONS_BEFORE_MAY_2026,
            );
            let keys =
                manager.candidate_purpose_keys(fixture_passphrase(), KeyPurpose::McpCredentials);
            manager
                .unlock(fixture_passphrase(), |_, _, _| {
                    Err(MasterPasswordError::CryptoError(
                        "fixture: stay on the stored row".to_string(),
                    ))
                })
                .unwrap();
            drop(manager);
            assert_eq!(keys.len(), 2);

            vault.store(API_KEY_ROW, &seal_with_key(&keys[1], API_KEY).unwrap());
            vault.store(
                SECOND_API_KEY_ROW,
                &seal_with_key(&keys[0], SECOND_API_KEY).unwrap(),
            );
            vault.store(
                APP_SECRET_ROW,
                &seal_with_key(&keys[1], APP_SECRET).unwrap(),
            );
            vault.store_install_key_rows(&[
                (UNMIGRATED_API_KEY_ROW, UNMIGRATED_API_KEY),
                (SERVER_CREDENTIAL_ROW, SERVER_CREDENTIAL),
            ]);
            (vault, keys)
        }

        /// A provider key sealed under a key nothing here can derive.
        fn store_a_key_no_key_opens(&self) {
            self.store(
                LOST_API_KEY_ROW,
                &seal_with_key(&rand::random::<[u8; 32]>(), "fixture-lost-key").unwrap(),
            );
        }

        fn delete(&self, key: &str) {
            self.db
                .lock()
                .unwrap()
                .execute("DELETE FROM settings_v2 WHERE key = ?1", [key])
                .unwrap();
        }

        fn unlock(&self, password: &str) -> Result<UnlockOutcome, MasterPasswordError> {
            self.manager
                .lock()
                .unwrap()
                .unlock(password, |conn, key, upgraded| {
                    settle_at_unlock(conn, key, upgraded).map(|_| ())
                })
        }

        fn store(&self, key: &str, value: &str) {
            self.db
                .lock()
                .unwrap()
                .execute(
                    "INSERT INTO settings_v2 (key, value, category, encrypted, created_at, updated_at)
                     VALUES (?1, ?2, 'security', 1, 'now', 'now')",
                    rusqlite::params![key, value],
                )
                .unwrap();
        }

        fn stored(&self, key: &str) -> String {
            self.db
                .lock()
                .unwrap()
                .query_row(
                    "SELECT value FROM settings_v2 WHERE key = ?1",
                    [key],
                    |row| row.get(0),
                )
                .unwrap()
        }

        /// Two provider keys and one connector app credential sealed under
        /// the vault key, one provider key never migrated, and one install-key
        /// row the vault never owned.
        fn store_fixture_rows(&self) {
            for (row, value) in [
                (API_KEY_ROW, API_KEY),
                (SECOND_API_KEY_ROW, SECOND_API_KEY),
                (APP_SECRET_ROW, APP_SECRET),
            ] {
                self.store(row, &seal(Some(&self.helper), value).unwrap());
            }
            self.store_install_key_rows(&[
                (UNMIGRATED_API_KEY_ROW, UNMIGRATED_API_KEY),
                (SERVER_CREDENTIAL_ROW, SERVER_CREDENTIAL),
            ]);
        }

        fn store_install_key_rows(&self, rows: &[(&str, &str)]) {
            for (row, value) in rows {
                self.store(row, &seal_with_install_key(value).unwrap());
            }
        }

        fn every_row(&self) -> Vec<String> {
            [
                API_KEY_ROW,
                SECOND_API_KEY_ROW,
                APP_SECRET_ROW,
                UNMIGRATED_API_KEY_ROW,
                SERVER_CREDENTIAL_ROW,
            ]
            .iter()
            .map(|row| self.stored(row))
            .collect()
        }

        fn purpose_key(&self) -> Vec<u8> {
            self.manager
                .lock()
                .unwrap()
                .derive_key(KeyPurpose::McpCredentials)
                .unwrap()
        }

        fn change_password(&self, current: &str, new: &str) -> Result<(), MasterPasswordError> {
            self.manager
                .lock()
                .unwrap()
                .change(current, new, |conn, old_key, new_key| {
                    reseal_for_new_password(conn, old_key, new_key).map(|_| ())
                })
        }

        fn remove_password(&self, password: &str) -> Result<(), MasterPasswordError> {
            self.manager
                .lock()
                .unwrap()
                .remove(password, |conn, password_key| {
                    reseal_under_install_key(conn, password_key).map(|_| ())
                })
        }

        fn refuse_updates_to(&self, key: &str) {
            self.db
                .lock()
                .unwrap()
                .execute_batch(&format!(
                    "CREATE TRIGGER refuse_fixture_update
                     BEFORE UPDATE ON settings_v2
                     WHEN NEW.key = '{key}'
                     BEGIN
                         SELECT RAISE(ABORT, 'fixture write failure');
                     END;"
                ))
                .unwrap();
        }

        fn verifies(&self, password: &str) -> bool {
            self.manager.lock().unwrap().verify(password).unwrap()
        }

        fn needs_migration(&self) -> bool {
            self.manager.lock().unwrap().needs_migration().unwrap()
        }

        fn opens(&self, row: &str) -> Result<String, String> {
            open(Some(&self.helper), &self.stored(row))
        }
    }

    #[test]
    fn setting_a_password_leaves_no_provider_key_readable_without_it() {
        let vault = Vault::without_a_password();
        vault.store_install_key_rows(&[
            (API_KEY_ROW, API_KEY),
            (SECOND_API_KEY_ROW, SECOND_API_KEY),
            (APP_SECRET_ROW, APP_SECRET),
            (SERVER_CREDENTIAL_ROW, SERVER_CREDENTIAL),
        ]);
        let app_secret = vault.stored(APP_SECRET_ROW);
        let server_credential = vault.stored(SERVER_CREDENTIAL_ROW);

        vault.set_password().expect("set the password");

        let purpose_key = vault.purpose_key();
        for (row, plaintext) in [(API_KEY_ROW, API_KEY), (SECOND_API_KEY_ROW, SECOND_API_KEY)] {
            let stored = vault.stored(row);
            assert_eq!(open_with_key(&purpose_key, &stored).unwrap(), plaintext);
            assert!(
                open_with_install_key(&stored).is_err(),
                "{row} is still readable without the password"
            );
        }
        assert_eq!(vault.stored(APP_SECRET_ROW), app_secret);
        assert_eq!(vault.stored(SERVER_CREDENTIAL_ROW), server_credential);
        assert_eq!(
            owned_settings_outside_the_vault(&vault.db.lock().unwrap()).unwrap(),
            0
        );
        assert!(!vault.needs_migration());

        vault.lock();
        assert_eq!(vault.opens(API_KEY_ROW).unwrap_err(), VAULT_LOCKED_MESSAGE);
        assert_eq!(vault.opens(APP_SECRET_ROW).unwrap(), APP_SECRET);
        assert!(!vault.needs_migration());
    }

    #[test]
    fn setting_a_password_that_cannot_seal_every_key_sets_no_password() {
        let vault = Vault::without_a_password();
        vault.store_install_key_rows(&[
            (API_KEY_ROW, API_KEY),
            (SECOND_API_KEY_ROW, SECOND_API_KEY),
        ]);
        let before = [vault.stored(API_KEY_ROW), vault.stored(SECOND_API_KEY_ROW)];
        vault.refuse_updates_to(SECOND_API_KEY_ROW);

        let failure = vault.set_password().expect_err("the second key is refused");
        assert!(
            failure.to_string().contains("nothing was changed"),
            "{failure}"
        );

        assert!(!vault.helper.is_configured());
        assert!(!vault.helper.is_unlocked());
        assert_eq!(
            [vault.stored(API_KEY_ROW), vault.stored(SECOND_API_KEY_ROW)],
            before
        );
        assert_eq!(vault.opens(API_KEY_ROW).unwrap(), API_KEY);
    }

    #[test]
    fn a_store_whose_password_predates_sealing_at_setup_reports_a_migration_until_it_is_done() {
        let vault = Vault::without_a_password();
        vault.store_install_key_rows(&[
            (UNMIGRATED_API_KEY_ROW, UNMIGRATED_API_KEY),
            (APP_SECRET_ROW, APP_SECRET),
            (SERVER_CREDENTIAL_ROW, SERVER_CREDENTIAL),
        ]);
        vault.store(API_KEY_ROW, "not a ciphertext");
        assert!(!vault.needs_migration(), "no password, nothing to migrate");

        vault
            .manager
            .lock()
            .unwrap()
            .setup(fixture_passphrase())
            .unwrap();
        assert!(vault.needs_migration());
        vault.lock();
        assert!(
            vault.needs_migration(),
            "the answer does not depend on the vault being open"
        );

        vault.unlock(fixture_passphrase()).unwrap();
        let sealed = seal(Some(&vault.helper), UNMIGRATED_API_KEY).unwrap();
        vault
            .db
            .lock()
            .unwrap()
            .execute(
                "UPDATE settings_v2 SET value = ?1 WHERE key = ?2",
                rusqlite::params![sealed, UNMIGRATED_API_KEY_ROW],
            )
            .unwrap();

        assert!(
            !vault.needs_migration(),
            "install-key families and unreadable rows are not the vault's to migrate"
        );
    }

    #[test]
    fn a_shared_verifier_row_is_upgraded_at_unlock_and_every_secret_still_opens() {
        let vault = Vault::unlocked_under_a_shared_verifier_row();
        vault.store_fixture_rows();
        let old_purpose_key = vault.purpose_key();
        let unmigrated = vault.stored(UNMIGRATED_API_KEY_ROW);
        let server_credential = vault.stored(SERVER_CREDENTIAL_ROW);
        vault.lock();

        assert!(matches!(
            vault.unlock(other_fixture_passphrase()),
            Err(MasterPasswordError::InvalidPassword)
        ));
        assert_eq!(
            open_with_key(&old_purpose_key, &vault.stored(API_KEY_ROW)).unwrap(),
            API_KEY,
            "a refused password upgrades nothing"
        );

        vault.unlock(fixture_passphrase()).expect("unlock");

        let new_purpose_key = vault.purpose_key();
        assert_ne!(new_purpose_key, old_purpose_key);
        for (row, plaintext) in [(API_KEY_ROW, API_KEY), (SECOND_API_KEY_ROW, SECOND_API_KEY)] {
            let stored = vault.stored(row);
            assert_eq!(open_with_key(&new_purpose_key, &stored).unwrap(), plaintext);
            assert!(
                open_with_key(&old_purpose_key, &stored).is_err(),
                "{row} still opens under the key the old row gave away"
            );
            assert_eq!(vault.opens(row).unwrap(), plaintext);
        }
        assert_eq!(
            open_with_install_key(&vault.stored(APP_SECRET_ROW)).unwrap(),
            APP_SECRET
        );
        assert_eq!(vault.stored(UNMIGRATED_API_KEY_ROW), unmigrated);
        assert_eq!(vault.stored(SERVER_CREDENTIAL_ROW), server_credential);

        vault.lock();
        vault.unlock(fixture_passphrase()).expect("second unlock");
        assert_eq!(vault.purpose_key(), new_purpose_key);
        assert_eq!(vault.opens(API_KEY_ROW).unwrap(), API_KEY);

        vault
            .change_password(fixture_passphrase(), other_fixture_passphrase())
            .expect("password change after the upgrade");
        assert_eq!(vault.opens(SECOND_API_KEY_ROW).unwrap(), SECOND_API_KEY);

        vault
            .remove_password(other_fixture_passphrase())
            .expect("password removal after the upgrade");
        assert_eq!(
            open_with_install_key(&vault.stored(API_KEY_ROW)).unwrap(),
            API_KEY
        );
    }

    #[test]
    fn an_upgrade_that_fails_part_way_leaves_every_row_opening_under_the_stored_row() {
        let vault = Vault::unlocked_under_a_shared_verifier_row();
        vault.store_fixture_rows();
        let before = vault.every_row();
        let old_purpose_key = vault.purpose_key();
        vault.lock();
        vault.refuse_updates_to(SECOND_API_KEY_ROW);

        vault
            .unlock(fixture_passphrase())
            .expect("the vault still opens");

        assert_eq!(vault.every_row(), before);
        assert_eq!(vault.purpose_key(), old_purpose_key);
        assert_eq!(vault.opens(API_KEY_ROW).unwrap(), API_KEY);
        assert_eq!(vault.opens(SECOND_API_KEY_ROW).unwrap(), SECOND_API_KEY);
        assert_eq!(vault.opens(APP_SECRET_ROW).unwrap(), APP_SECRET);
    }

    #[test]
    fn a_row_from_before_may_2026_is_upgraded_with_the_keys_of_both_periods() {
        let (vault, old_keys) = Vault::from_before_may_2026();
        let unmigrated = vault.stored(UNMIGRATED_API_KEY_ROW);
        assert!(
            vault.opens(API_KEY_ROW).is_err(),
            "builds since 2026-05-05 could not read a key saved before it"
        );
        vault.lock();

        let outcome = vault.unlock(fixture_passphrase()).expect("unlock");

        assert_eq!(outcome, UnlockOutcome::default());
        let new_purpose_key = vault.purpose_key();
        for (row, plaintext) in [(API_KEY_ROW, API_KEY), (SECOND_API_KEY_ROW, SECOND_API_KEY)] {
            let stored = vault.stored(row);
            assert_eq!(open_with_key(&new_purpose_key, &stored).unwrap(), plaintext);
            for old_key in &old_keys {
                assert!(open_with_key(old_key, &stored).is_err());
            }
            assert_eq!(vault.opens(row).unwrap(), plaintext);
        }
        assert_eq!(
            open_with_install_key(&vault.stored(APP_SECRET_ROW)).unwrap(),
            APP_SECRET
        );
        assert_eq!(vault.stored(UNMIGRATED_API_KEY_ROW), unmigrated);

        vault.lock();
        assert_eq!(
            vault.unlock(fixture_passphrase()).unwrap(),
            UnlockOutcome::default()
        );
        assert_eq!(vault.purpose_key(), new_purpose_key);
    }

    #[test]
    fn an_upgrade_is_refused_while_a_saved_key_opens_under_no_key_and_nothing_is_destroyed() {
        let (vault, old_keys) = Vault::from_before_may_2026();
        vault.store_a_key_no_key_opens();
        let before = vault.every_row();
        let lost_before = vault.stored(LOST_API_KEY_ROW);
        vault.lock();

        let outcome = vault
            .unlock(fixture_passphrase())
            .expect("the vault still opens");

        assert_eq!(outcome.keys_not_upgraded, vec!["lostprovider".to_string()]);
        assert_eq!(vault.every_row(), before, "no ciphertext was replaced");
        assert_eq!(vault.stored(LOST_API_KEY_ROW), lost_before);
        assert_eq!(
            vault.purpose_key(),
            old_keys[0],
            "unlocked under the stored row"
        );
        assert_eq!(vault.opens(SECOND_API_KEY_ROW).unwrap(), SECOND_API_KEY);
        assert_eq!(
            open_with_key(&old_keys[1], &vault.stored(API_KEY_ROW)).unwrap(),
            API_KEY,
            "the key saved before 2026-05-05 still opens under the key it was sealed with"
        );
        assert_eq!(
            vault
                .manager
                .lock()
                .unwrap()
                .candidate_purpose_keys(fixture_passphrase(), KeyPurpose::McpCredentials),
            old_keys,
            "the stored row was not replaced"
        );

        vault.delete(LOST_API_KEY_ROW);
        vault.lock();
        assert_eq!(
            vault.unlock(fixture_passphrase()).unwrap(),
            UnlockOutcome::default()
        );
        assert_eq!(vault.opens(API_KEY_ROW).unwrap(), API_KEY);
        assert_eq!(vault.opens(SECOND_API_KEY_ROW).unwrap(), SECOND_API_KEY);
    }

    #[test]
    fn a_password_change_or_removal_is_refused_while_a_saved_key_opens_under_no_key() {
        let vault = Vault::unlocked();
        vault.store_fixture_rows();
        vault.store_a_key_no_key_opens();
        let before = vault.every_row();

        let change = vault
            .change_password(fixture_passphrase(), other_fixture_passphrase())
            .expect_err("a key would be lost");
        let MasterPasswordError::UnreadableSavedKeys { providers } = &change else {
            panic!("expected the unreadable key to be named");
        };
        assert_eq!(providers, &vec!["lostprovider".to_string()]);
        assert!(change.to_string().contains("lostprovider"), "{change}");
        assert!(!change.to_string().contains("Cryptographic"), "{change}");

        assert!(matches!(
            vault.remove_password(fixture_passphrase()),
            Err(MasterPasswordError::UnreadableSavedKeys { .. })
        ));

        assert_eq!(vault.every_row(), before);
        assert!(vault.verifies(fixture_passphrase()));
        assert!(!vault.verifies(other_fixture_passphrase()));
        assert!(vault.helper.is_configured());
        assert_eq!(vault.opens(API_KEY_ROW).unwrap(), API_KEY);

        vault.delete(LOST_API_KEY_ROW);
        vault
            .change_password(fixture_passphrase(), other_fixture_passphrase())
            .expect("nothing would be lost now");
        assert_eq!(vault.opens(API_KEY_ROW).unwrap(), API_KEY);
    }

    #[test]
    fn unlocking_returns_connector_app_credentials_to_the_install_key() {
        let vault = Vault::unlocked();
        vault.store_fixture_rows();
        let api_key = vault.stored(API_KEY_ROW);
        vault.lock();
        assert_eq!(
            vault.opens(APP_SECRET_ROW).unwrap_err(),
            VAULT_LOCKED_MESSAGE
        );

        vault.unlock(fixture_passphrase()).expect("unlock");

        assert_eq!(
            open_with_install_key(&vault.stored(APP_SECRET_ROW)).unwrap(),
            APP_SECRET
        );
        assert_eq!(vault.stored(API_KEY_ROW), api_key);
        vault.lock();
        assert_eq!(vault.opens(APP_SECRET_ROW).unwrap(), APP_SECRET);
        assert_eq!(vault.opens(API_KEY_ROW).unwrap_err(), VAULT_LOCKED_MESSAGE);
    }

    #[test]
    fn after_a_password_change_every_owned_row_opens_with_the_new_password_and_none_with_the_old() {
        let vault = Vault::unlocked();
        vault.store_fixture_rows();
        let old_purpose_key = vault.purpose_key();

        vault
            .change_password(fixture_passphrase(), other_fixture_passphrase())
            .expect("password change");

        let new_purpose_key = vault.purpose_key();
        assert_ne!(new_purpose_key, old_purpose_key);
        for (row, plaintext) in [(API_KEY_ROW, API_KEY), (SECOND_API_KEY_ROW, SECOND_API_KEY)] {
            let stored = vault.stored(row);
            assert_eq!(open_with_key(&new_purpose_key, &stored).unwrap(), plaintext);
            assert!(
                open_with_key(&old_purpose_key, &stored).is_err(),
                "{row} still opens under the old password"
            );
        }
        let app_secret = vault.stored(APP_SECRET_ROW);
        assert_eq!(open_with_install_key(&app_secret).unwrap(), APP_SECRET);
        assert!(open_with_key(&old_purpose_key, &app_secret).is_err());

        vault.lock();
        assert!(matches!(
            vault.unlock(fixture_passphrase()),
            Err(MasterPasswordError::InvalidPassword)
        ));
        vault
            .unlock(other_fixture_passphrase())
            .expect("new password");
        assert_eq!(vault.opens(API_KEY_ROW).unwrap(), API_KEY);
        assert_eq!(vault.opens(SECOND_API_KEY_ROW).unwrap(), SECOND_API_KEY);
    }

    #[test]
    fn a_password_change_leaves_rows_the_password_never_sealed_alone() {
        let vault = Vault::unlocked();
        vault.store_fixture_rows();
        let unmigrated = vault.stored(UNMIGRATED_API_KEY_ROW);
        let server_credential = vault.stored(SERVER_CREDENTIAL_ROW);

        vault
            .change_password(fixture_passphrase(), other_fixture_passphrase())
            .expect("password change");

        assert_eq!(vault.stored(UNMIGRATED_API_KEY_ROW), unmigrated);
        assert_eq!(vault.stored(SERVER_CREDENTIAL_ROW), server_credential);
        assert_eq!(
            vault.opens(UNMIGRATED_API_KEY_ROW).unwrap(),
            UNMIGRATED_API_KEY
        );
    }

    #[test]
    fn a_password_change_that_fails_part_way_leaves_every_row_opening_with_the_old_password() {
        let vault = Vault::unlocked();
        vault.store_fixture_rows();
        let before = vault.every_row();
        vault.refuse_updates_to(SECOND_API_KEY_ROW);

        let failure = vault
            .change_password(fixture_passphrase(), other_fixture_passphrase())
            .expect_err("the second re-seal is refused");
        assert!(
            failure.to_string().contains("nothing was changed"),
            "{failure}"
        );

        assert_eq!(vault.every_row(), before);
        assert!(vault.verifies(fixture_passphrase()));
        assert!(!vault.verifies(other_fixture_passphrase()));
        assert_eq!(vault.opens(API_KEY_ROW).unwrap(), API_KEY);

        vault.lock();
        vault.unlock(fixture_passphrase()).expect("old password");
        assert_eq!(vault.opens(API_KEY_ROW).unwrap(), API_KEY);
        assert_eq!(vault.opens(SECOND_API_KEY_ROW).unwrap(), SECOND_API_KEY);
        assert_eq!(vault.opens(APP_SECRET_ROW).unwrap(), APP_SECRET);
    }

    #[test]
    fn a_password_change_made_while_locked_still_moves_every_owned_row() {
        let vault = Vault::unlocked();
        vault.store_fixture_rows();
        vault.lock();

        vault
            .change_password(fixture_passphrase(), other_fixture_passphrase())
            .expect("password change");

        assert_eq!(vault.opens(API_KEY_ROW).unwrap(), API_KEY);
        assert_eq!(vault.opens(SECOND_API_KEY_ROW).unwrap(), SECOND_API_KEY);
    }

    #[test]
    fn a_wrong_current_password_changes_nothing() {
        let vault = Vault::unlocked();
        vault.store_fixture_rows();
        let before = vault.every_row();

        assert!(matches!(
            vault.change_password(other_fixture_passphrase(), other_fixture_passphrase()),
            Err(MasterPasswordError::InvalidPassword)
        ));
        assert!(matches!(
            vault.remove_password(other_fixture_passphrase()),
            Err(MasterPasswordError::InvalidPassword)
        ));

        assert_eq!(vault.every_row(), before);
        assert!(vault.verifies(fixture_passphrase()));
    }

    #[test]
    fn after_the_password_is_removed_every_row_opens_without_one() {
        let vault = Vault::unlocked();
        vault.store_fixture_rows();
        let unmigrated = vault.stored(UNMIGRATED_API_KEY_ROW);
        let server_credential = vault.stored(SERVER_CREDENTIAL_ROW);

        vault
            .remove_password(fixture_passphrase())
            .expect("password removal");

        assert!(!vault.helper.is_configured());
        assert!(!vault.helper.is_unlocked());
        for (row, plaintext) in [
            (API_KEY_ROW, API_KEY),
            (SECOND_API_KEY_ROW, SECOND_API_KEY),
            (APP_SECRET_ROW, APP_SECRET),
            (UNMIGRATED_API_KEY_ROW, UNMIGRATED_API_KEY),
        ] {
            let stored = vault.stored(row);
            assert_eq!(open_with_install_key(&stored).unwrap(), plaintext);
            assert_eq!(open(Some(&vault.helper), &stored).unwrap(), plaintext);
            assert_eq!(open(None, &stored).unwrap(), plaintext);
        }
        assert_eq!(vault.stored(UNMIGRATED_API_KEY_ROW), unmigrated);
        assert_eq!(vault.stored(SERVER_CREDENTIAL_ROW), server_credential);
    }

    #[test]
    fn a_removal_that_fails_part_way_leaves_the_password_and_every_row_in_place() {
        let vault = Vault::unlocked();
        vault.store_fixture_rows();
        let before = vault.every_row();
        vault.refuse_updates_to(SECOND_API_KEY_ROW);

        let failure = vault
            .remove_password(fixture_passphrase())
            .expect_err("the second re-seal is refused");
        assert!(
            failure.to_string().contains("nothing was changed"),
            "{failure}"
        );

        assert_eq!(vault.every_row(), before);
        assert!(vault.helper.is_configured());
        assert!(vault.verifies(fixture_passphrase()));
        assert_eq!(vault.opens(API_KEY_ROW).unwrap(), API_KEY);
    }

    #[test]
    fn only_provider_api_keys_belong_to_the_vault() {
        assert!(vault_owns_setting("api_key_openai"));

        assert!(!vault_owns_setting("mcp_oauth_config_github_client_secret"));
        assert!(!vault_owns_setting("mcp_secret/user/abc/TOKEN"));
        assert!(!vault_owns_setting("mcp_oauth_tokens_github"));
        assert!(!vault_owns_setting("mcp_oauth_github_access_token"));
        assert!(!vault_owns_setting("mcp_oauth_github_refresh_token"));
        assert!(!vault_owns_setting("tool_confirmation.agent_mode"));

        assert!(vault_released_setting(
            "mcp_oauth_config_github_client_secret"
        ));
        assert!(!vault_released_setting("mcp_oauth_tokens_github"));
        assert!(!vault_released_setting("api_key_openai"));
    }

    #[test]
    fn a_sealed_credential_opens_while_the_vault_is_unlocked() {
        let vault = Vault::unlocked();
        let sealed = seal(Some(&vault.helper), API_KEY).unwrap();

        assert_eq!(open(Some(&vault.helper), &sealed).unwrap(), API_KEY);
        assert!(open_with_install_key(&sealed).is_err());
    }

    #[test]
    fn a_sealed_credential_asks_for_an_unlock_while_the_vault_is_locked() {
        let vault = Vault::unlocked();
        let sealed = seal(Some(&vault.helper), API_KEY).unwrap();
        vault.lock();

        assert_eq!(
            open(Some(&vault.helper), &sealed).unwrap_err(),
            VAULT_LOCKED_MESSAGE
        );
    }

    #[test]
    fn sealing_is_refused_while_the_vault_is_locked() {
        let vault = Vault::unlocked();
        vault.lock();

        let refusal = seal(Some(&vault.helper), API_KEY).unwrap_err();
        assert!(refusal.contains("vault is locked"), "{refusal}");
    }

    #[test]
    fn a_row_an_older_build_left_under_the_install_key_opens_locked_or_unlocked() {
        let vault = Vault::unlocked();
        let unmigrated = seal_with_install_key(API_KEY).unwrap();

        assert_eq!(open(Some(&vault.helper), &unmigrated).unwrap(), API_KEY);
        vault.lock();
        assert_eq!(open(Some(&vault.helper), &unmigrated).unwrap(), API_KEY);
    }

    #[test]
    fn without_a_master_password_the_install_key_is_used() {
        let sealed = seal(None, API_KEY).unwrap();

        assert_eq!(open(None, &sealed).unwrap(), API_KEY);
        assert_eq!(open_with_install_key(&sealed).unwrap(), API_KEY);
    }
}
