//! Tauri commands for per-tool connector permission storage (Desktop P0, audit C-rank 1).
//!
//! Permissions are stored in `~/.agiworkforce/connector-permissions.json`,
//! AES-256-GCM under the per-install machine key (purpose:
//! [`KeyPurpose::ConnectorPermissions`]), never under the master password. This
//! store decides which tools may run, and tools run while the vault is locked,
//! so it has to open without a password.
//!
//! An earlier build sealed the file under the master-password vault whenever
//! it was saved while unlocked. Such a file is moved back to the machine key at
//! the next unlock, and read through the vault until then.
//!
//! A store that exists and cannot be opened is never treated as empty: saving
//! fails without changing it, and every tool resolves to blocked.
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
use std::path::{Path, PathBuf};
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

/// Whether the saved store can be used, sent with every listing so the
/// interface can say when it cannot and offer the reset.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum PermissionStoreState {
    #[serde(rename = "ok")]
    Readable,
    Missing,
    Unreadable {
        reason: String,
        /// The vault is locked, and an earlier build may have sealed the
        /// store under it, so an unlock is worth trying before a reset.
        #[serde(rename = "unlockMayFix")]
        unlock_may_fix: bool,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectorPermissionListing {
    pub store: PermissionStoreState,
    pub permissions: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionStoreReset {
    pub reset: bool,
    /// The file name the unreadable store was kept under, beside the new one.
    pub kept_as: Option<String>,
}

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

/// What a caller is told when the store does not open and the vault is
/// locked, which is the one state an unlock can fix.
const UNOPENED_WHILE_LOCKED_MESSAGE: &str = "Saved connector permissions could not be opened while your saved keys are locked. Unlock them in Settings, under Privacy, and try again.";

/// Open the stored payload.
///
/// The flag reports that it opened under a key this store no longer writes
/// with, a legacy machine-only key or the master-password vault, so the
/// caller writes it back under the machine key.
fn decrypt_json(
    ciphertext: &str,
    label: &str,
    enc: &MasterPasswordEncryption,
) -> Result<(String, bool), String> {
    let machine_key_error = match machine_key_decrypt(ciphertext, label) {
        Ok(opened) => return Ok(opened),
        Err(error) => error,
    };

    if enc.is_unlocked() {
        if let Ok(plain) = enc.decrypt(KeyPurpose::ConnectorPermissions, ciphertext) {
            return Ok((plain, true));
        }
    } else if enc.is_configured() {
        return Err(UNOPENED_WHILE_LOCKED_MESSAGE.to_string());
    }
    Err(format!(
        "Saved connector permissions could not be opened: {machine_key_error}"
    ))
}

/// Label this store reports itself under while it still holds legacy ciphertext.
fn machine_only_label(path: &Path) -> String {
    format!("file:{}", path.display())
}

fn machine_key_encrypt(plaintext: &str) -> Result<String, String> {
    let key = machine_key::try_derive_key(KeyPurpose::ConnectorPermissions)
        .map_err(|e| format!("machine-key unavailable: {e}"))?;
    machine_key_rewrap::encrypt_combined(&key, plaintext)
        .ok_or_else(|| "machine-key encrypt failed".to_string())
}

/// Read the store under the current key, then under the keys a shipped build
/// derived from machine identifiers alone.
fn machine_key_decrypt(ciphertext_b64: &str, label: &str) -> Result<(String, bool), String> {
    let opened =
        machine_key::open_with_key_rotation(KeyPurpose::ConnectorPermissions, label, |key| {
            machine_key_rewrap::decrypt_combined(key, ciphertext_b64)
        })
        .map_err(|e| format!("machine-key unavailable: {e}"))?
        .ok_or_else(|| "no available key opens this store".to_string())?;

    Ok((opened.value, opened.rewrap_required))
}

// ── File I/O ──────────────────────────────────────────────────────────────────

fn read_ciphertext(path: &Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(ciphertext) => Ok(Some(ciphertext)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "Saved connector permissions could not be read: {error}"
        )),
    }
}

fn parse_store(json: &str) -> Result<PermissionsFile, String> {
    serde_json::from_str(json)
        .map_err(|e| format!("Saved connector permissions are not readable JSON: {e}"))
}

/// The saved permissions, `None` when nothing was ever saved, or an error
/// when a store exists and cannot be opened. Callers must not turn that error
/// into an empty map: the next save would replace every grant and block with
/// it.
fn read_store(
    path: &Path,
    enc: &MasterPasswordEncryption,
) -> Result<Option<PermissionsFile>, String> {
    let Some(ciphertext) = read_ciphertext(path)? else {
        return Ok(None);
    };
    let label = machine_only_label(path);
    let (json, rewrap_required) = decrypt_json(ciphertext.trim(), &label, enc)?;
    let data = parse_store(&json)?;

    if rewrap_required {
        match save_store(path, &data) {
            Ok(()) => machine_key::clear_machine_only_payload(&label),
            Err(error) => {
                tracing::warn!("Connector permissions are still under a retired key: {error}")
            }
        }
    }

    Ok(Some(data))
}

fn load_store(path: &Path, enc: &MasterPasswordEncryption) -> Result<PermissionsFile, String> {
    Ok(read_store(path, enc)?.unwrap_or_default())
}

fn store_state(
    path: &Path,
    enc: &MasterPasswordEncryption,
) -> (PermissionStoreState, PermissionsFile) {
    match read_store(path, enc) {
        Ok(Some(data)) => (PermissionStoreState::Readable, data),
        Ok(None) => (PermissionStoreState::Missing, HashMap::new()),
        Err(reason) => (
            PermissionStoreState::Unreadable {
                reason,
                unlock_may_fix: enc.is_configured() && !enc.is_unlocked(),
            },
            HashMap::new(),
        ),
    }
}

/// A store that does not open while the vault is locked may only be sealed
/// under it by an earlier build, with every saved block intact. Resetting
/// then would throw those away for something an unlock repairs.
const RESET_NEEDS_UNLOCK_MESSAGE: &str = "Unlock your saved keys in Settings, under Privacy, first: an earlier version sealed connector permissions with your master password, and unlocking brings them back. If they still cannot be read once unlocked, reset them then. Nothing was changed.";

/// Start again when the saved store cannot be opened, and only then.
///
/// Refused while the vault is locked, see [`RESET_NEEDS_UNLOCK_MESSAGE`].
/// The unreadable file is never deleted: it is renamed beside itself with the
/// time in its name, and an empty store takes its place. The empty store is
/// encrypted before anything is moved, so a missing machine key fails here
/// with the old file still in place.
fn reset_unreadable_store(
    path: &Path,
    enc: &MasterPasswordEncryption,
    taken_at: chrono::DateTime<chrono::Utc>,
) -> Result<PermissionStoreReset, String> {
    if read_store(path, enc).is_ok() {
        return Ok(PermissionStoreReset {
            reset: false,
            kept_as: None,
        });
    }
    if enc.is_configured() && !enc.is_unlocked() {
        return Err(RESET_NEEDS_UNLOCK_MESSAGE.to_string());
    }

    let empty =
        serde_json::to_string(&PermissionsFile::new()).map_err(|e| format!("serialize: {e}"))?;
    let empty = machine_key_encrypt(&empty)?;

    let kept = path.with_extension(format!(
        "unreadable-{}.json",
        taken_at.format("%Y%m%dT%H%M%S%3fZ")
    ));
    let kept_as = kept
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or_else(|| "The connector permissions file has no name to keep it under".to_string())?;
    if kept.exists() {
        return Err(format!(
            "{kept_as} already exists, so nothing was changed. Try again."
        ));
    }

    std::fs::rename(path, &kept).map_err(|e| {
        format!("The unreadable connector permissions could not be moved aside, so nothing was changed: {e}")
    })?;
    write_store(path, &empty).map_err(|e| {
        format!("The old connector permissions were kept as {kept_as}, but a new store could not be written: {e}")
    })?;

    Ok(PermissionStoreReset {
        reset: true,
        kept_as: Some(kept_as),
    })
}

fn save_store(path: &Path, data: &PermissionsFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create dirs: {e}"))?;
    }
    let json = serde_json::to_string(data).map_err(|e| format!("serialize: {e}"))?;
    write_store(path, &machine_key_encrypt(&json)?)
}

/// Replace the file in one step, so an interrupted write leaves the old store.
fn write_store(path: &Path, ciphertext: &str) -> Result<(), String> {
    let staged = path.with_extension("json.writing");
    std::fs::write(&staged, ciphertext).map_err(|e| format!("stage connector permissions: {e}"))?;
    std::fs::rename(&staged, path).map_err(|e| format!("replace connector permissions: {e}"))
}

/// Save one permission into the existing store, or change nothing when the
/// existing store cannot be opened.
fn set_permission(
    path: &Path,
    enc: &MasterPasswordEncryption,
    connector_id: String,
    tool_name: String,
    permission: ToolPermission,
) -> Result<(), String> {
    let mut data =
        load_store(path, enc).map_err(|error| format!("{error} No permission was changed."))?;
    data.entry(connector_id)
        .or_default()
        .insert(tool_name, permission);
    save_store(path, &data)
}

/// The permission a tool call runs under. A store that cannot be opened
/// blocks the call: it may hold a block for this tool.
fn resolve_permission_at(
    path: &Path,
    enc: &MasterPasswordEncryption,
    connector_id: &str,
    tool_name: &str,
    destructive: bool,
) -> PermissionLevel {
    let data = match load_store(path, enc) {
        Ok(data) => data,
        Err(error) => {
            tracing::warn!(
                "Connector tool blocked because its permissions are unreadable: {error}"
            );
            return PermissionLevel::Blocked;
        }
    };
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

/// Move the store off a vault key that is about to stop existing.
///
/// A store an earlier build saved while the vault was unlocked is sealed
/// under the vault key, which a password change, a password removal and a
/// key-derivation upgrade all replace. Every unlock, and each of those before
/// it commits a new key, writes the store back under the machine key: that key
/// opens it whatever state the vault is in, so neither a finished change nor
/// an interrupted one leaves it unreadable.
///
/// A file a reset kept is looked at too: if it opens under one of the keys,
/// its choices are merged back, see [`merge_kept_stores`].
///
/// Called with the vault manager locked, so this must not wait for
/// `FILE_LOCK`: a save in progress holds it while waiting for the manager.
pub(crate) fn release_from_vault_keys(vault_keys: &[Vec<u8>]) -> Result<(), String> {
    let _guard = match FILE_LOCK.try_lock() {
        Ok(guard) => guard,
        Err(std::sync::TryLockError::Poisoned(poisoned)) => poisoned.into_inner(),
        Err(std::sync::TryLockError::WouldBlock) => {
            return Err(
                "Connector permissions are being saved. Try again in a moment.".to_string(),
            );
        }
    };

    let path = permissions_file_path()?;
    release_store_from_vault_keys(&path, vault_keys)?;
    if let Err(error) = merge_kept_stores(&path, vault_keys) {
        tracing::warn!("Connector permissions kept by a reset were not merged back: {error}");
    }
    Ok(())
}

fn open_under_any(vault_keys: &[Vec<u8>], ciphertext: &str) -> Option<String> {
    vault_keys
        .iter()
        .find_map(|key| machine_key_rewrap::decrypt_combined(key, ciphertext.trim()))
}

fn release_store_from_vault_keys(path: &Path, vault_keys: &[Vec<u8>]) -> Result<(), String> {
    let Some(stored) = read_ciphertext(path)? else {
        return Ok(());
    };
    let Some(json) = open_under_any(vault_keys, &stored) else {
        return Ok(());
    };

    let machine_key = machine_key::try_derive_key(KeyPurpose::ConnectorPermissions)
        .map_err(|e| format!("machine-key unavailable: {e}"))?;
    let released = machine_key_rewrap::encrypt_combined(&machine_key, &json)
        .ok_or_else(|| "machine-key encrypt failed".to_string())?;
    if machine_key_rewrap::decrypt_combined(&machine_key, &released).as_deref()
        != Some(json.as_str())
    {
        return Err(
            "Connector permissions did not read back under the machine key, so nothing was changed"
                .to_string(),
        );
    }

    write_store(path, &released)
}

fn strictness(level: &PermissionLevel) -> u8 {
    match level {
        PermissionLevel::AlwaysAllow => 0,
        PermissionLevel::NeedsApproval => 1,
        PermissionLevel::Blocked => 2,
    }
}

/// Bring `kept` choices into `current`. Where both name a tool the stricter
/// choice stands, so a block is never undone by a merge.
fn merge_stricter(current: &mut PermissionsFile, kept: PermissionsFile) {
    for (connector, tools) in kept {
        let saved = current.entry(connector).or_default();
        for (tool, kept_permission) in tools {
            match saved.get_mut(&tool) {
                Some(permission) => {
                    if strictness(&kept_permission.level) > strictness(&permission.level) {
                        permission.level = kept_permission.level;
                    }
                    permission.destructive |= kept_permission.destructive;
                }
                None => {
                    saved.insert(tool, kept_permission);
                }
            }
        }
    }
}

/// Merge back the stores a reset moved aside that turn out to open under a
/// vault key now in hand. Each merged file is renamed from `unreadable-` to
/// `merged-`, so it is merged once and still never deleted. Returns how many
/// were merged.
fn merge_kept_stores(path: &Path, vault_keys: &[Vec<u8>]) -> Result<u32, String> {
    let (Some(dir), Some(stem)) = (path.parent(), path.file_stem().and_then(|s| s.to_str())) else {
        return Ok(0);
    };
    let kept_prefix = format!("{stem}.unreadable-");
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(format!("list kept connector permissions: {error}")),
    };
    let mut kept_paths: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|kept| {
            kept.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(&kept_prefix) && name.ends_with(".json"))
        })
        .collect();
    kept_paths.sort();

    let mut merged = 0;
    for kept_path in kept_paths {
        let Ok(stored) = std::fs::read_to_string(&kept_path) else {
            continue;
        };
        let Some(json) = open_under_any(vault_keys, &stored) else {
            continue;
        };
        let Ok(kept) = parse_store(&json) else {
            continue;
        };

        let mut current = match read_ciphertext(path)? {
            Some(ciphertext) => {
                let (json, _) = machine_key_decrypt(ciphertext.trim(), &machine_only_label(path))?;
                parse_store(&json)?
            }
            None => PermissionsFile::new(),
        };
        merge_stricter(&mut current, kept);
        save_store(path, &current)?;

        let merged_name = kept_path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.replacen(".unreadable-", ".merged-", 1))
            .ok_or_else(|| "a kept connector permissions file has no name".to_string())?;
        std::fs::rename(&kept_path, kept_path.with_file_name(merged_name))
            .map_err(|e| format!("mark kept connector permissions as merged: {e}"))?;
        merged += 1;
    }
    Ok(merged)
}

/// A change that lets a connector tool run more freely than it does today is
/// the one kind the page may not make on its own: lifting a block, or
/// granting always allow, is asked in a dialog the operating system draws. A
/// change that tightens a tool, or leaves it as it is, is saved as requested.
const ALWAYS_ALLOW_CONFIRM_LABEL: &str = "Always Allow";
const UNBLOCK_CONFIRM_LABEL: &str = "Unblock Tool";
/// One such question at a time, and a wait after a no that grows while the
/// noes keep coming.
static LOOSENING_DECISIONS: crate::sys::native_confirm::ConfirmGate =
    crate::sys::native_confirm::ConfirmGate::new();

const LOOSENING_DECLINED_MESSAGE: &str =
    "The change was not confirmed, so the permission was not changed.";
const MAX_SHOWN_NAME_CHARS: usize = 120;

fn shown_whole(name: &str) -> bool {
    !name.trim().is_empty()
        && name.chars().count() <= MAX_SHOWN_NAME_CHARS
        && !name.chars().any(char::is_control)
}

/// Whether a tool's name says it changes data. The approval gates in
/// `sys::commands::mcp` and the tool executor apply this same test to a tool
/// with no saved choice, which is why such a tool starts out blocked.
pub(crate) fn tool_name_looks_destructive(tool_name: &str) -> bool {
    ["delete", "write", "create", "update", "remove"]
        .iter()
        .any(|verb| tool_name.contains(verb))
}

/// What a tool runs under before a change: its saved choice, or the default
/// the approval gate would apply to it. The page's own `destructive` flag can
/// make that default stricter and never looser.
fn level_before_change(
    data: &PermissionsFile,
    connector_id: &str,
    tool_name: &str,
    declared_destructive: bool,
) -> PermissionLevel {
    data.get(connector_id)
        .and_then(|tools| tools.get(tool_name))
        .map(|tp| tp.level.clone())
        .unwrap_or_else(|| {
            if declared_destructive || tool_name_looks_destructive(tool_name) {
                PermissionLevel::Blocked
            } else {
                PermissionLevel::NeedsApproval
            }
        })
}

/// The question for a change that loosens a tool, or `None` when the change
/// does not loosen it and needs no asking. A connector or tool name the
/// dialog could not show whole and on one line is refused, so the user never
/// confirms text that hides what it names.
fn loosening_question(
    connector_id: &str,
    tool_name: &str,
    from: &PermissionLevel,
    to: &PermissionLevel,
) -> Result<Option<crate::sys::native_confirm::NativeConfirm>, String> {
    if strictness(to) >= strictness(from) {
        return Ok(None);
    }
    if !shown_whole(connector_id) || !shown_whole(tool_name) {
        return Err(
            "This connector or tool name cannot be shown in full, so it cannot be made more permissive."
                .to_string(),
        );
    }
    let (title, effect, confirm_label) = match to {
        PermissionLevel::AlwaysAllow => (
            "Always allow this connector tool?",
            "whenever a chat or an agent asks, without asking you first",
            ALWAYS_ALLOW_CONFIRM_LABEL,
        ),
        PermissionLevel::NeedsApproval | PermissionLevel::Blocked => (
            "Unblock this connector tool?",
            "after asking you each time",
            UNBLOCK_CONFIRM_LABEL,
        ),
    };
    let today = match from {
        PermissionLevel::Blocked => "It is blocked today.",
        PermissionLevel::NeedsApproval | PermissionLevel::AlwaysAllow => {
            "It asks you each time today."
        }
    };
    Ok(Some(crate::sys::native_confirm::NativeConfirm {
        title: title.to_string(),
        body: format!(
            "The connector \"{connector_id}\" will run its tool \"{tool_name}\" {effect}. {today}\n\nYou can change this later in Settings, under Connectors."
        ),
        confirm_label: confirm_label.to_string(),
    }))
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Get the permission level for a specific tool on a connector.
/// Returns `None` (null in JS) when no explicit permission has been saved.
/// the frontend should apply `defaultPermissionForTool(destructive)` in that case.
#[tauri::command]
pub async fn connector_permission_get(
    mp_state: State<'_, MasterPasswordState>,
    connector_id: String,
    tool_name: String,
) -> Result<Option<String>, String> {
    let enc = encryption_from_state(&mp_state);
    let data = load_store(&permissions_file_path()?, &enc)?;
    let level = data
        .get(&connector_id)
        .and_then(|tools| tools.get(&tool_name))
        .map(|tp| tp.level.as_str().to_string());
    Ok(level)
}

/// Persist a permission level for a specific tool. A change that makes the
/// tool no more permissive than it is today is saved as requested; one that
/// lifts a block or grants always allow is saved only after the user confirms
/// it in a native dialog that names the connector and the tool.
#[tauri::command]
pub async fn connector_permission_set(
    app: tauri::AppHandle,
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
    let path = permissions_file_path()?;
    let before = level_before_change(
        &load_store(&path, &enc).map_err(|error| format!("{error} No permission was changed."))?,
        &connector_id,
        &tool_name,
        destructive,
    );
    if let Some(question) = loosening_question(&connector_id, &tool_name, &before, &perm_level)? {
        let request = format!("{connector_id}\n{tool_name}\n{}", perm_level.as_str());
        let confirmed = LOOSENING_DECISIONS
            .confirm(&app, &request, question)
            .await
            .map_err(|held| held.message())?;
        if !confirmed {
            return Err(LOOSENING_DECLINED_MESSAGE.to_string());
        }
    }
    let _guard = FILE_LOCK.lock().map_err(|e| format!("file lock: {e}"))?;
    set_permission(
        &path,
        &enc,
        connector_id,
        tool_name,
        ToolPermission {
            level: perm_level,
            destructive,
        },
    )
}

/// List all saved permissions for a connector, with the state of the store
/// they came from. An unreadable store lists nothing and says why.
#[tauri::command]
pub async fn connector_permission_list(
    mp_state: State<'_, MasterPasswordState>,
    connector_id: String,
) -> Result<ConnectorPermissionListing, String> {
    let enc = encryption_from_state(&mp_state);
    let (store, data) = store_state(&permissions_file_path()?, &enc);
    let tools = data.get(&connector_id).cloned().unwrap_or_default();
    let permissions = tools
        .into_iter()
        .map(|(name, tp)| {
            serde_json::json!({
                "toolName": name,
                "level": tp.level.as_str(),
                "destructive": tp.destructive,
            })
        })
        .collect();
    Ok(ConnectorPermissionListing { store, permissions })
}

/// Replace a permissions store that cannot be opened with an empty one,
/// keeping the old file beside it. Does nothing when the store opens.
#[tauri::command]
pub async fn connector_permission_reset(
    mp_state: State<'_, MasterPasswordState>,
) -> Result<PermissionStoreReset, String> {
    let enc = encryption_from_state(&mp_state);
    let path = permissions_file_path()?;
    let _guard = FILE_LOCK.lock().map_err(|e| format!("file lock: {e}"))?;
    reset_unreadable_store(&path, &enc, chrono::Utc::now())
}

/// Look up the effective permission for a connector/tool pair at runtime.
/// Used by the approval gate in `mcp_call_tool`.
pub fn resolve_permission(
    enc: &MasterPasswordEncryption,
    connector_id: &str,
    tool_name: &str,
    destructive: bool,
) -> PermissionLevel {
    match permissions_file_path() {
        Ok(path) => resolve_permission_at(&path, enc, connector_id, tool_name, destructive),
        Err(error) => {
            tracing::warn!(
                "Connector tool blocked because its permissions are unreachable: {error}"
            );
            PermissionLevel::Blocked
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::sys::security::MasterPasswordManager;

    const VAULT_FIXTURE_PASSPHRASE: &str = "Alpha-Beta-Unique-Phrase-9"; // gitleaks:allow

    const SAVED_PERMISSIONS: &str = r#"{"gmail":{"send":{"level":"blocked","destructive":false}}}"#;

    struct Vault {
        manager: Arc<Mutex<MasterPasswordManager>>,
        enc: MasterPasswordEncryption,
    }

    impl Vault {
        fn without_a_password() -> Self {
            let conn = rusqlite::Connection::open_in_memory().unwrap();
            let manager = MasterPasswordManager::new(Arc::new(Mutex::new(conn)));
            manager.init_table().unwrap();
            let manager = Arc::new(Mutex::new(manager));
            Self {
                enc: MasterPasswordEncryption::new(manager.clone()),
                manager,
            }
        }

        fn unlocked() -> Self {
            let vault = Self::without_a_password();
            vault
                .manager
                .lock()
                .unwrap()
                .setup(VAULT_FIXTURE_PASSPHRASE)
                .unwrap();
            vault
        }

        fn lock(&self) {
            self.manager.lock().unwrap().lock();
            assert!(!self.enc.is_unlocked());
        }

        fn unlock(&self) {
            self.manager
                .lock()
                .unwrap()
                .unlock(VAULT_FIXTURE_PASSPHRASE, |_, _, _| Ok(()))
                .unwrap();
        }
    }

    fn store_path(dir: &tempfile::TempDir) -> PathBuf {
        dir.path().join("connector-permissions.json")
    }

    fn permission(level: PermissionLevel) -> ToolPermission {
        ToolPermission {
            level,
            destructive: false,
        }
    }

    fn opens_under_the_machine_key(path: &Path) -> Option<String> {
        let machine_key = machine_key::try_derive_key(KeyPurpose::ConnectorPermissions).unwrap();
        machine_key_rewrap::decrypt_combined(&machine_key, &std::fs::read_to_string(path).unwrap())
    }

    #[test]
    fn nothing_saved_yet_means_the_defaults_and_a_first_save_works() {
        let dir = tempfile::tempdir().unwrap();
        let path = store_path(&dir);
        let vault = Vault::without_a_password();

        assert_eq!(
            resolve_permission_at(&path, &vault.enc, "gmail", "read", false),
            PermissionLevel::NeedsApproval
        );
        assert_eq!(
            resolve_permission_at(&path, &vault.enc, "gmail", "delete", true),
            PermissionLevel::Blocked
        );

        set_permission(
            &path,
            &vault.enc,
            "gmail".to_string(),
            "read".to_string(),
            permission(PermissionLevel::AlwaysAllow),
        )
        .expect("first save");

        assert_eq!(
            resolve_permission_at(&path, &vault.enc, "gmail", "read", false),
            PermissionLevel::AlwaysAllow
        );
        assert!(!path.with_extension("json.writing").exists());
    }

    #[test]
    fn a_permission_saved_while_unlocked_is_enforced_and_kept_while_locked() {
        let dir = tempfile::tempdir().unwrap();
        let path = store_path(&dir);
        let vault = Vault::unlocked();

        set_permission(
            &path,
            &vault.enc,
            "gmail".to_string(),
            "send".to_string(),
            permission(PermissionLevel::Blocked),
        )
        .expect("save while unlocked");
        assert!(
            opens_under_the_machine_key(&path).is_some(),
            "the store is never sealed under the master password"
        );

        vault.lock();
        assert_eq!(
            resolve_permission_at(&path, &vault.enc, "gmail", "send", false),
            PermissionLevel::Blocked
        );

        set_permission(
            &path,
            &vault.enc,
            "gmail".to_string(),
            "read".to_string(),
            permission(PermissionLevel::AlwaysAllow),
        )
        .expect("save while locked");

        let saved = load_store(&path, &vault.enc).expect("the store opens while locked");
        assert_eq!(saved["gmail"]["send"].level, PermissionLevel::Blocked);
        assert_eq!(saved["gmail"]["read"].level, PermissionLevel::AlwaysAllow);
    }

    #[test]
    fn a_store_an_older_build_sealed_under_the_vault_is_not_overwritten_while_locked() {
        let dir = tempfile::tempdir().unwrap();
        let path = store_path(&dir);
        let vault = Vault::unlocked();
        let sealed = vault
            .enc
            .encrypt(KeyPurpose::ConnectorPermissions, SAVED_PERMISSIONS)
            .unwrap();
        std::fs::write(&path, &sealed).unwrap();
        vault.lock();

        let refusal = set_permission(
            &path,
            &vault.enc,
            "gmail".to_string(),
            "read".to_string(),
            permission(PermissionLevel::AlwaysAllow),
        )
        .expect_err("the existing store cannot be opened");
        assert!(refusal.contains("Unlock them in Settings"), "{refusal}");
        assert!(refusal.contains("No permission was changed"), "{refusal}");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), sealed);

        assert!(load_store(&path, &vault.enc).is_err());
        assert_eq!(
            resolve_permission_at(&path, &vault.enc, "gmail", "send", false),
            PermissionLevel::Blocked,
            "the saved block still holds"
        );
        assert_eq!(
            resolve_permission_at(&path, &vault.enc, "gmail", "read", false),
            PermissionLevel::Blocked,
            "an unreadable store allows nothing"
        );

        vault.unlock();
        let saved = load_store(&path, &vault.enc).expect("the store opens once unlocked");
        assert_eq!(saved["gmail"]["send"].level, PermissionLevel::Blocked);
        assert_eq!(
            opens_under_the_machine_key(&path).as_deref(),
            Some(SAVED_PERMISSIONS),
            "reading it moved it to the machine key"
        );

        vault.lock();
        assert_eq!(
            resolve_permission_at(&path, &vault.enc, "gmail", "send", false),
            PermissionLevel::Blocked
        );
        assert_eq!(
            resolve_permission_at(&path, &vault.enc, "gmail", "read", false),
            PermissionLevel::NeedsApproval
        );
    }

    #[test]
    fn a_store_no_key_opens_blocks_every_tool_and_refuses_changes() {
        let dir = tempfile::tempdir().unwrap();
        let path = store_path(&dir);
        let vault = Vault::without_a_password();
        std::fs::write(&path, "not a ciphertext").unwrap();

        let refusal = set_permission(
            &path,
            &vault.enc,
            "gmail".to_string(),
            "read".to_string(),
            permission(PermissionLevel::AlwaysAllow),
        )
        .expect_err("the existing store cannot be opened");
        assert!(refusal.contains("could not be opened"), "{refusal}");
        assert!(refusal.contains("No permission was changed"), "{refusal}");

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "not a ciphertext");
        assert_eq!(
            resolve_permission_at(&path, &vault.enc, "gmail", "read", false),
            PermissionLevel::Blocked
        );
    }

    fn fixture_time() -> chrono::DateTime<chrono::Utc> {
        chrono::DateTime::parse_from_rfc3339("2026-10-11T12:34:56.789Z")
            .unwrap()
            .with_timezone(&chrono::Utc)
    }

    fn files_in(dir: &tempfile::TempDir) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn an_unreadable_store_can_be_reset_and_then_saves_again() {
        let dir = tempfile::tempdir().unwrap();
        let path = store_path(&dir);
        let vault = Vault::without_a_password();
        std::fs::write(&path, "not a ciphertext").unwrap();

        let (state, listed) = store_state(&path, &vault.enc);
        assert!(listed.is_empty());
        let PermissionStoreState::Unreadable {
            reason,
            unlock_may_fix,
        } = state
        else {
            panic!("a store no key opens is unreadable");
        };
        assert!(reason.contains("could not be opened"), "{reason}");
        assert!(!unlock_may_fix);

        let outcome = reset_unreadable_store(&path, &vault.enc, fixture_time()).expect("reset");
        let kept_as = "connector-permissions.unreadable-20261011T123456789Z.json";
        assert_eq!(
            outcome,
            PermissionStoreReset {
                reset: true,
                kept_as: Some(kept_as.to_string()),
            }
        );
        assert_eq!(
            files_in(&dir),
            vec![
                "connector-permissions.json".to_string(),
                kept_as.to_string()
            ]
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join(kept_as)).unwrap(),
            "not a ciphertext",
            "the old file is kept as it was"
        );

        let (state, listed) = store_state(&path, &vault.enc);
        assert_eq!(state, PermissionStoreState::Readable);
        assert!(listed.is_empty());
        assert_eq!(
            resolve_permission_at(&path, &vault.enc, "gmail", "read", false),
            PermissionLevel::NeedsApproval
        );
        set_permission(
            &path,
            &vault.enc,
            "gmail".to_string(),
            "read".to_string(),
            permission(PermissionLevel::AlwaysAllow),
        )
        .expect("saving works again");
        assert_eq!(
            resolve_permission_at(&path, &vault.enc, "gmail", "read", false),
            PermissionLevel::AlwaysAllow
        );
    }

    #[test]
    fn a_store_that_opens_is_not_reset() {
        let dir = tempfile::tempdir().unwrap();
        let path = store_path(&dir);
        let vault = Vault::without_a_password();

        assert_eq!(
            reset_unreadable_store(&path, &vault.enc, fixture_time()).expect("nothing saved yet"),
            PermissionStoreReset {
                reset: false,
                kept_as: None,
            }
        );
        assert!(files_in(&dir).is_empty());
        assert_eq!(
            store_state(&path, &vault.enc).0,
            PermissionStoreState::Missing
        );

        set_permission(
            &path,
            &vault.enc,
            "gmail".to_string(),
            "send".to_string(),
            permission(PermissionLevel::Blocked),
        )
        .unwrap();
        let saved = std::fs::read_to_string(&path).unwrap();

        assert_eq!(
            reset_unreadable_store(&path, &vault.enc, fixture_time()).expect("a readable store"),
            PermissionStoreReset {
                reset: false,
                kept_as: None,
            }
        );
        assert_eq!(std::fs::read_to_string(&path).unwrap(), saved);
        assert_eq!(
            files_in(&dir),
            vec!["connector-permissions.json".to_string()]
        );
        assert_eq!(
            store_state(&path, &vault.enc).0,
            PermissionStoreState::Readable
        );
        assert_eq!(
            resolve_permission_at(&path, &vault.enc, "gmail", "send", false),
            PermissionLevel::Blocked
        );
    }

    #[test]
    fn a_store_sealed_under_a_locked_vault_says_an_unlock_may_fix_it() {
        let dir = tempfile::tempdir().unwrap();
        let path = store_path(&dir);
        let vault = Vault::unlocked();
        std::fs::write(
            &path,
            vault
                .enc
                .encrypt(KeyPurpose::ConnectorPermissions, SAVED_PERMISSIONS)
                .unwrap(),
        )
        .unwrap();
        vault.lock();

        let (state, _) = store_state(&path, &vault.enc);

        assert!(matches!(
            state,
            PermissionStoreState::Unreadable {
                unlock_may_fix: true,
                ..
            }
        ));
    }

    #[test]
    fn a_reset_is_refused_while_a_locked_vault_may_hold_the_store() {
        let dir = tempfile::tempdir().unwrap();
        let path = store_path(&dir);
        let vault = Vault::unlocked();
        let sealed = vault
            .enc
            .encrypt(KeyPurpose::ConnectorPermissions, SAVED_PERMISSIONS)
            .unwrap();
        std::fs::write(&path, &sealed).unwrap();
        vault.lock();

        let refusal = reset_unreadable_store(&path, &vault.enc, fixture_time())
            .expect_err("an unlock would bring the store back");

        assert!(refusal.contains("Unlock your saved keys"), "{refusal}");
        assert!(refusal.contains("Nothing was changed"), "{refusal}");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), sealed);
        assert_eq!(
            files_in(&dir),
            vec!["connector-permissions.json".to_string()]
        );

        vault.unlock();
        assert_eq!(
            resolve_permission_at(&path, &vault.enc, "gmail", "send", false),
            PermissionLevel::Blocked,
            "the block the reset would have discarded"
        );
    }

    fn saved(choices: &[(&str, PermissionLevel)]) -> PermissionsFile {
        let tools = choices
            .iter()
            .map(|(tool, level)| (tool.to_string(), permission(level.clone())))
            .collect();
        HashMap::from([("gmail".to_string(), tools)])
    }

    #[test]
    fn a_kept_store_that_opens_under_the_vault_key_is_merged_back_once_and_blocks_win() {
        let dir = tempfile::tempdir().unwrap();
        let path = store_path(&dir);
        let vault = Vault::without_a_password();
        let vault_key = vec![9u8; 32];
        let kept_path = dir
            .path()
            .join("connector-permissions.unreadable-20261011T123456789Z.json");
        let kept = saved(&[
            ("send", PermissionLevel::Blocked),
            ("read", PermissionLevel::AlwaysAllow),
            ("archive", PermissionLevel::NeedsApproval),
        ]);
        std::fs::write(
            &kept_path,
            machine_key_rewrap::encrypt_combined(
                &vault_key,
                &serde_json::to_string(&kept).unwrap(),
            )
            .unwrap(),
        )
        .unwrap();
        let stranger_path = dir
            .path()
            .join("connector-permissions.unreadable-20261012T000000000Z.json");
        std::fs::write(&stranger_path, "not a ciphertext").unwrap();
        save_store(
            &path,
            &saved(&[
                ("send", PermissionLevel::AlwaysAllow),
                ("read", PermissionLevel::NeedsApproval),
                ("label", PermissionLevel::Blocked),
            ]),
        )
        .unwrap();

        assert_eq!(merge_kept_stores(&path, &[vec![1u8; 32]]).unwrap(), 0);
        assert!(
            kept_path.exists(),
            "a key that does not open it merges nothing"
        );

        assert_eq!(merge_kept_stores(&path, &[vault_key.clone()]).unwrap(), 1);

        let merged = load_store(&path, &vault.enc).unwrap();
        let level = |tool: &str| merged["gmail"][tool].level.clone();
        assert_eq!(level("send"), PermissionLevel::Blocked, "a kept block wins");
        assert_eq!(
            level("read"),
            PermissionLevel::NeedsApproval,
            "a kept allow does not loosen a newer choice"
        );
        assert_eq!(level("archive"), PermissionLevel::NeedsApproval);
        assert_eq!(level("label"), PermissionLevel::Blocked);
        assert_eq!(
            files_in(&dir),
            vec![
                "connector-permissions.json".to_string(),
                "connector-permissions.merged-20261011T123456789Z.json".to_string(),
                "connector-permissions.unreadable-20261012T000000000Z.json".to_string(),
            ],
            "the merged file is kept under a name that is not merged again"
        );

        set_permission(
            &path,
            &vault.enc,
            "gmail".to_string(),
            "send".to_string(),
            permission(PermissionLevel::NeedsApproval),
        )
        .unwrap();
        assert_eq!(merge_kept_stores(&path, &[vault_key]).unwrap(), 0);
        assert_eq!(
            resolve_permission_at(&path, &vault.enc, "gmail", "send", false),
            PermissionLevel::NeedsApproval,
            "a choice made after the merge is not overwritten by the next unlock"
        );
    }

    fn question(
        tool: &str,
        from: PermissionLevel,
        to: PermissionLevel,
    ) -> Option<crate::sys::native_confirm::NativeConfirm> {
        loosening_question("gmail", tool, &from, &to).expect("names that can be shown")
    }

    #[test]
    fn every_change_that_loosens_a_tool_is_asked_and_no_other_is() {
        use PermissionLevel::{AlwaysAllow, Blocked, NeedsApproval};

        for (from, to) in [
            (Blocked, NeedsApproval),
            (Blocked, AlwaysAllow),
            (NeedsApproval, AlwaysAllow),
        ] {
            assert!(
                question("send_message", from.clone(), to.clone()).is_some(),
                "{from} to {to} loosens the tool"
            );
        }
        for (from, to) in [
            (Blocked, Blocked),
            (NeedsApproval, NeedsApproval),
            (AlwaysAllow, AlwaysAllow),
            (NeedsApproval, Blocked),
            (AlwaysAllow, NeedsApproval),
            (AlwaysAllow, Blocked),
        ] {
            assert!(
                question("send_message", from.clone(), to.clone()).is_none(),
                "{from} to {to} does not loosen the tool"
            );
        }
    }

    #[test]
    fn lifting_a_block_is_asked_in_words_that_name_the_connector_the_tool_and_today() {
        let asked = question(
            "delete_message",
            PermissionLevel::Blocked,
            PermissionLevel::NeedsApproval,
        )
        .expect("a question");

        assert!(asked.body.contains("\"gmail\""), "{}", asked.body);
        assert!(asked.body.contains("\"delete_message\""), "{}", asked.body);
        assert!(asked.body.contains("after asking you each time"));
        assert!(asked.body.contains("It is blocked today."));
        assert_eq!(asked.confirm_label, UNBLOCK_CONFIRM_LABEL);
        assert!(crate::sys::native_confirm::can_ask_with(
            &asked.confirm_label
        ));
    }

    #[test]
    fn always_allow_is_asked_in_words_that_say_it_will_run_without_asking() {
        let asked = question(
            "send_message",
            PermissionLevel::NeedsApproval,
            PermissionLevel::AlwaysAllow,
        )
        .expect("a question");

        assert!(asked.body.contains("\"gmail\""), "{}", asked.body);
        assert!(asked.body.contains("\"send_message\""), "{}", asked.body);
        assert!(asked.body.contains("without asking you first"));
        assert!(asked.body.contains("It asks you each time today."));
        assert_eq!(asked.confirm_label, ALWAYS_ALLOW_CONFIRM_LABEL);
        assert!(crate::sys::native_confirm::can_ask_with(
            &asked.confirm_label
        ));
    }

    #[test]
    fn a_loosening_is_refused_for_a_name_the_dialog_could_not_show_whole() {
        let long = "x".repeat(MAX_SHOWN_NAME_CHARS + 1);
        let loosen = |connector: &str, tool: &str| {
            loosening_question(
                connector,
                tool,
                &PermissionLevel::Blocked,
                &PermissionLevel::NeedsApproval,
            )
        };

        assert!(loosen("gmail", "send\nAllow everything").is_err());
        assert!(loosen("gmail", &long).is_err());
        assert!(loosen("  ", "send").is_err());
        assert!(loosen("gmail", &"x".repeat(MAX_SHOWN_NAME_CHARS)).is_ok());
        assert!(
            loosening_question(
                "gmail",
                &long,
                &PermissionLevel::AlwaysAllow,
                &PermissionLevel::Blocked
            )
            .is_ok(),
            "tightening needs no dialog, so the name does not have to fit one"
        );
    }

    #[test]
    fn a_tool_with_no_saved_choice_starts_where_the_approval_gate_would_put_it() {
        let nothing_saved = PermissionsFile::new();

        assert_eq!(
            level_before_change(&nothing_saved, "gmail", "read_message", false),
            PermissionLevel::NeedsApproval
        );
        assert_eq!(
            level_before_change(&nothing_saved, "gmail", "delete_message", false),
            PermissionLevel::Blocked,
            "the window calling a write-like tool harmless does not unblock it"
        );
        assert_eq!(
            level_before_change(&nothing_saved, "gmail", "read_message", true),
            PermissionLevel::Blocked
        );
        for name in ["delete_x", "write_x", "create_x", "update_x", "remove_x"] {
            assert!(tool_name_looks_destructive(name), "{name}");
        }
        assert!(!tool_name_looks_destructive("read_message"));
    }

    #[test]
    fn a_saved_choice_is_what_a_change_is_measured_against() {
        let saved = saved(&[
            ("delete_message", PermissionLevel::AlwaysAllow),
            ("read_message", PermissionLevel::Blocked),
        ]);

        assert_eq!(
            level_before_change(&saved, "gmail", "delete_message", true),
            PermissionLevel::AlwaysAllow
        );
        assert_eq!(
            level_before_change(&saved, "gmail", "read_message", false),
            PermissionLevel::Blocked
        );
        assert_eq!(
            level_before_change(&saved, "slack", "read_message", false),
            PermissionLevel::NeedsApproval
        );
    }
}
