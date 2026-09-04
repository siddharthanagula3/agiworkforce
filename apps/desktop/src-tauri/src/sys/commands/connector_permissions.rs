
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::sys::commands::master_password::MasterPasswordState;
use crate::sys::security::machine_key::{self, KeyPurpose};
use crate::sys::security::machine_key_rewrap;
use crate::sys::security::master_password_encryption::MasterPasswordEncryption;

// ── Types ────────────────────────────────────────────────────────────────────

/// Mirrors `ConnectorPermissionLevel` from packages/contracts/types.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PermissionLevel {
    AlwaysAllow,
    NeedsApproval,
    Blocked,
}

impl PermissionLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            PermissionLevel::AlwaysAllow => "always-allow",
            PermissionLevel::NeedsApproval => "needs-approval",
            PermissionLevel::Blocked => "blocked",
        }
    }
}

impl std::fmt::Display for PermissionLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPermission {
    pub level: PermissionLevel,
    pub destructive: bool,
}

/// Serialised form of the whole permissions file.
type PermissionsFile = HashMap<String, HashMap<String, ToolPermission>>;

// ── Process-scoped write lock ─────────────────────────────────────────────────

static FILE_LOCK: Mutex<()> = Mutex::new(());

// ── File path helper ──────────────────────────────────────────────────────────

fn permissions_file_path() -> Result<PathBuf, String> {
    crate::sys::utils::app_data_dir()
        .map(|d| d.join("connector-permissions.json"))
        .map_err(|e| format!("cannot resolve app data dir: {e}"))
}

// ── Encryption helpers ────────────────────────────────────────────────────────

/// Produce a `MasterPasswordEncryption` wrapper from the managed state.
pub fn encryption_from_state(mp_state: &MasterPasswordState) -> MasterPasswordEncryption {
    MasterPasswordEncryption::new(mp_state.manager.clone())
}

/// Encrypt a JSON string.  Falls back to machine-key AES when vault not unlocked.
fn encrypt_json(json: &str, enc: &MasterPasswordEncryption) -> Result<String, String> {
    if enc.is_unlocked() {
        enc.encrypt(KeyPurpose::ConnectorPermissions, json)
            .map_err(|e| format!("vault encrypt: {e}"))
    } else {
        machine_key_encrypt(json)
    }
}

/// Decrypt a blob.  Try vault first, then machine-key.
///
/// The flag reports that the payload opened only under a legacy machine-only
/// key, so the caller can write it back before the next save makes that
/// ciphertext unreadable.
fn decrypt_json(
    ciphertext: &str,
    enc: &MasterPasswordEncryption,
) -> Result<(String, bool), String> {
    if enc.is_unlocked() {
        if let Ok(plain) = enc.decrypt(KeyPurpose::ConnectorPermissions, ciphertext) {
            return Ok((plain, false));
        }
    }
    // Try machine-key path (covers migration and vault-locked scenarios)
    machine_key_decrypt(ciphertext)
}

// ── Machine-key AES helpers (vault-locked fallback) ───────────────────────────

/// Label this store reports itself under while it still holds legacy ciphertext.
fn machine_only_label() -> String {
    match permissions_file_path() {
        Ok(path) => format!("file:{}", path.display()),
        Err(_) => "connector-permissions".to_string(),
    }
}

fn machine_key_encrypt(plaintext: &str) -> Result<String, String> {
    let key = machine_key::try_derive_key(KeyPurpose::ConnectorPermissions)
        .map_err(|e| format!("machine-key unavailable: {e}"))?;
    machine_key_rewrap::encrypt_combined(&key, plaintext)
        .ok_or_else(|| "machine-key encrypt failed".to_string())
}

/// Read the store under the current key, then under the keys a shipped build
/// derived from machine identifiers alone.
///
/// Without the legacy attempt a failed read becomes an empty permission map,
/// which the next save writes back over every grant the user ever gave.
fn machine_key_decrypt(ciphertext_b64: &str) -> Result<(String, bool), String> {
    let label = machine_only_label();
    let opened =
        machine_key::open_with_key_rotation(KeyPurpose::ConnectorPermissions, &label, |key| {
            machine_key_rewrap::decrypt_combined(key, ciphertext_b64)
        })
        .map_err(|e| format!("machine-key unavailable: {e}"))?
        .ok_or_else(|| "machine-key decrypt: no available key opens this store".to_string())?;

    Ok((opened.value, opened.rewrap_required))
}

// ── File I/O ──────────────────────────────────────────────────────────────────

fn load_file(enc: &MasterPasswordEncryption) -> PermissionsFile {
    let path = match permissions_file_path() {
        Ok(p) => p,
        Err(_) => return HashMap::new(),
    };
    if !path.exists() {
        return HashMap::new();
    }
    let ciphertext = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return HashMap::new(),
    };
    let (json, rewrap_required) = match decrypt_json(ciphertext.trim(), enc) {
        Ok(decrypted) => decrypted,
        Err(error) => {
            tracing::warn!("Could not read connector permissions: {error}");
            return HashMap::new();
        }
    };
    let data: PermissionsFile = match serde_json::from_str(&json) {
        Ok(data) => data,
        Err(error) => {
            tracing::warn!("Connector permissions file is not readable JSON: {error}");
            return HashMap::new();
        }
    };

    // Only a store that parsed may be written back; serializing a failed parse
    // would replace every grant with an empty map.
    if rewrap_required {
        match save_file(&data, enc) {
            Ok(()) => machine_key::clear_machine_only_payload(&machine_only_label()),
            Err(error) => tracing::warn!(
                "Connector permissions still hold legacy machine-key ciphertext: {error}"
            ),
        }
    }

    data
}

fn save_file(data: &PermissionsFile, enc: &MasterPasswordEncryption) -> Result<(), String> {
    let path = permissions_file_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create dirs: {e}"))?;
    }
    let json = serde_json::to_string(data).map_err(|e| format!("serialize: {e}"))?;
    let ciphertext = encrypt_json(&json, enc)?;
    std::fs::write(&path, ciphertext).map_err(|e| format!("write file: {e}"))
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn connector_permission_get(
    mp_state: State<'_, MasterPasswordState>,
    connector_id: String,
    tool_name: String,
) -> Result<Option<String>, String> {
    let enc = encryption_from_state(&mp_state);
    let data = load_file(&enc);
    let level = data
        .get(&connector_id)
        .and_then(|tools| tools.get(&tool_name))
        .map(|tp| tp.level.as_str().to_string());
    Ok(level)
}

/// Persist a permission level for a specific tool.
#[tauri::command]
pub async fn connector_permission_set(
    mp_state: State<'_, MasterPasswordState>,
    connector_id: String,
    tool_name: String,
    level: String,
    destructive: bool,
) -> Result<(), String> {
    let perm_level = match level.as_str() {
        "always-allow" => PermissionLevel::AlwaysAllow,
        "needs-approval" => PermissionLevel::NeedsApproval,
        "blocked" => PermissionLevel::Blocked,
        other => return Err(format!("unknown permission level: {other}")),
    };
    let enc = encryption_from_state(&mp_state);
    let _guard = FILE_LOCK.lock().map_err(|e| format!("file lock: {e}"))?;
    let mut data = load_file(&enc);
    data.entry(connector_id).or_default().insert(
        tool_name,
        ToolPermission {
            level: perm_level,
            destructive,
        },
    );
    save_file(&data, &enc)
}

/// List all saved permissions for a connector.
#[tauri::command]
pub async fn connector_permission_list(
    mp_state: State<'_, MasterPasswordState>,
    connector_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let enc = encryption_from_state(&mp_state);
    let data = load_file(&enc);
    let tools = data.get(&connector_id).cloned().unwrap_or_default();
    let result = tools
        .into_iter()
        .map(|(name, tp)| {
            serde_json::json!({
                "toolName": name,
                "level": tp.level.as_str(),
                "destructive": tp.destructive,
            })
        })
        .collect();
    Ok(result)
}

/// Look up the effective permission for a connector/tool pair at runtime.
/// Used by the approval gate in `mcp_call_tool`.
pub fn resolve_permission(
    enc: &MasterPasswordEncryption,
    connector_id: &str,
    tool_name: &str,
    destructive: bool,
) -> PermissionLevel {
    let data = load_file(enc);
    data.get(connector_id)
        .and_then(|tools| tools.get(tool_name))
        .map(|tp| tp.level.clone())
        .unwrap_or_else(|| {
            if destructive {
                PermissionLevel::Blocked
            } else {
                PermissionLevel::NeedsApproval
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn legacy_key() -> [u8; 32] {
        machine_key::legacy_machine_only_keys(KeyPurpose::ConnectorPermissions)
            .first()
            .copied()
            .expect("a legacy candidate always exists")
    }

    /// A shipped build wrote this store under the machine-only key. Without a
    /// legacy read the decrypt fails, `load_file` returns an empty map, and the
    /// next save replaces every grant the user ever gave with `{}`.
    #[test]
    fn legacy_machine_key_permissions_are_read_and_flagged_for_rewrap() {
        let saved = r#"{"gmail":{"send":{"level":"always-allow","destructive":true}}}"#;
        let stored =
            machine_key_rewrap::encrypt_combined(&legacy_key(), saved).expect("legacy encrypt");

        let (json, rewrap_required) =
            machine_key_decrypt(&stored).expect("a legacy store must stay readable");
        assert_eq!(json, saved);
        assert!(rewrap_required);

        let parsed: PermissionsFile =
            serde_json::from_str(&json).expect("the recovered store must parse");
        assert_eq!(
            parsed["gmail"]["send"].level.as_str(),
            PermissionLevel::AlwaysAllow.as_str()
        );
    }

    #[test]
    fn machine_key_roundtrip_needs_no_rewrap_and_rejects_the_legacy_key() {
        let saved = r#"{"slack":{"post":{"level":"blocked","destructive":false}}}"#;
        let stored = machine_key_encrypt(saved).expect("encrypt under the per-install key");

        assert_eq!(
            machine_key_decrypt(&stored).expect("read back"),
            (saved.to_string(), false)
        );
        assert_eq!(
            machine_key_rewrap::decrypt_combined(&legacy_key(), &stored),
            None,
            "a newly written store must not open under the recomputable legacy key"
        );
    }
}
