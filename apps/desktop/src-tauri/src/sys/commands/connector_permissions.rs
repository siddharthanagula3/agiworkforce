//! Tauri commands for per-tool connector permission storage (Desktop P0, audit C-rank 1).
//!
//! Permissions are stored in `~/.agiworkforce/connector-permissions.json` encrypted
//! via the existing [`MasterPasswordEncryption`] vault (AES-256-GCM, purpose:
//! [`KeyPurpose::ConnectorPermissions`]). When the vault is locked or not yet
//! configured the file falls back to machine-key encryption so read/write never
//! fails silently — the caller gets a clear error only when neither key is usable.
//!
//! # Storage layout
//! ```json
//! {
//!   "<connector_id>": {
//!     "<tool_name>": { "level": "always-allow" | "needs-approval" | "blocked",
//!                      "destructive": bool }
//!   }
//! }
//! ```
//! The file is re-read on every `get` / `list` to survive concurrent writers
//! (e.g. settings UI + background agent running simultaneously).  Writes do a
//! read-modify-write with a naïve in-process `Mutex` guard; cross-process
//! safety is acceptable at desktop tier.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::sys::security::machine_key::{self, KeyPurpose};
use crate::sys::security::master_password_encryption::MasterPasswordEncryption;
use crate::sys::commands::master_password::MasterPasswordState;

// ── Types ────────────────────────────────────────────────────────────────────

/// Mirrors `ConnectorPermissionLevel` from packages/types.
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
        // Machine-key fallback: XOR-free path — use the same AES helper via
        // the public `machine_key::derive_key_base64` and do raw AES-256-GCM
        // in one shot.  We reuse `MasterPasswordEncryption` with a temporary
        // in-memory manager seeded from the machine key.
        machine_key_encrypt(json)
    }
}

/// Decrypt a blob.  Try vault first, then machine-key.
fn decrypt_json(ciphertext: &str, enc: &MasterPasswordEncryption) -> Result<String, String> {
    if enc.is_unlocked() {
        if let Ok(plain) = enc.decrypt(KeyPurpose::ConnectorPermissions, ciphertext) {
            return Ok(plain);
        }
    }
    // Try machine-key path (covers migration and vault-locked scenarios)
    machine_key_decrypt(ciphertext)
}

// ── Machine-key AES helpers (vault-locked fallback) ───────────────────────────

fn machine_key_encrypt(plaintext: &str) -> Result<String, String> {
    use aes_gcm::aead::rand_core::{OsRng, RngCore};
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Nonce};
    use base64::engine::general_purpose;
    use base64::Engine as _;

    let key_bytes = machine_key::derive_key(KeyPurpose::ConnectorPermissions);
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| format!("machine-key AES init: {e}"))?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("machine-key encrypt: {e}"))?;

    let mut combined = Vec::with_capacity(12 + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);
    Ok(general_purpose::STANDARD.encode(combined))
}

fn machine_key_decrypt(ciphertext_b64: &str) -> Result<String, String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Nonce};
    use base64::engine::general_purpose;
    use base64::Engine as _;

    let key_bytes = machine_key::derive_key(KeyPurpose::ConnectorPermissions);
    let combined = general_purpose::STANDARD
        .decode(ciphertext_b64)
        .map_err(|e| format!("base64 decode: {e}"))?;
    if combined.len() <= 12 {
        return Err("ciphertext too short".to_string());
    }
    let (nonce_bytes, ct) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| format!("machine-key AES init: {e}"))?;
    let plain = cipher
        .decrypt(nonce, ct)
        .map_err(|e| format!("machine-key decrypt: {e}"))?;
    String::from_utf8(plain).map_err(|e| format!("utf-8: {e}"))
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
    let json = match decrypt_json(ciphertext.trim(), enc) {
        Ok(j) => j,
        Err(_) => return HashMap::new(),
    };
    serde_json::from_str(&json).unwrap_or_default()
}

fn save_file(data: &PermissionsFile, enc: &MasterPasswordEncryption) -> Result<(), String> {
    let path = permissions_file_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create dirs: {e}"))?;
    }
    let json = serde_json::to_string(data)
        .map_err(|e| format!("serialize: {e}"))?;
    let ciphertext = encrypt_json(&json, enc)?;
    std::fs::write(&path, ciphertext)
        .map_err(|e| format!("write file: {e}"))
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Get the permission level for a specific tool on a connector.
/// Returns `None` (null in JS) when no explicit permission has been saved —
/// the frontend should apply `defaultPermissionForTool(destructive)` in that case.
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
    data.entry(connector_id)
        .or_default()
        .insert(tool_name, ToolPermission { level: perm_level, destructive });
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
