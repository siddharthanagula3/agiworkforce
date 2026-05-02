//! Supabase auth-token storage for Tauri builds (FIX-004, Sprint 1).
//!
//! The web build keeps using `localStorage` (the Supabase JS default), but
//! in the Tauri build the previous helper at `apps/desktop/src/lib/supabase.ts`
//! "encrypted" the token with a key derived from a hardcoded constant +
//! the bundled hostname — anyone with source could reproduce the
//! derivation. The frontend now calls these IPC commands instead, so the
//! token actually goes through the master-password vault.
//!
//! Storage schema: a single `supabase_tokens` table keyed on the Supabase
//! storage key (e.g. `sb-localhost-auth-token`) with the
//! master-password-encrypted ciphertext as the value.
use rusqlite::params;
use tauri::State;

use crate::sys::commands::AppDatabase;
use crate::sys::security::{KeyPurpose, MasterPasswordEncryption, MasterPasswordError};

const CREATE_TABLE_SQL: &str = "CREATE TABLE IF NOT EXISTS supabase_tokens (
    key TEXT PRIMARY KEY,
    ciphertext TEXT NOT NULL,
    updated_at INTEGER NOT NULL
)";

fn ensure_table(db: &AppDatabase) -> Result<(), String> {
    let conn = db.connection()?;
    conn.execute(CREATE_TABLE_SQL, [])
        .map_err(|e| format!("Failed to ensure supabase_tokens table: {e}"))?;
    Ok(())
}

fn require_unlocked_helper(
    helper: &MasterPasswordEncryption,
) -> Result<(), String> {
    if !helper.is_configured() {
        return Err(
            "Master password is not configured. Open Settings → Security to set it up before storing Supabase sessions in the vault."
                .to_string(),
        );
    }
    if !helper.is_unlocked() {
        return Err(
            "Master password is set up but the vault is locked. Unlock the vault before storing Supabase sessions."
                .to_string(),
        );
    }
    Ok(())
}

/// Store an encrypted Supabase auth-storage value keyed on `key`.
#[tauri::command]
pub async fn supabase_token_set(
    key: String,
    value: String,
    db: State<'_, AppDatabase>,
    encryption: State<'_, MasterPasswordEncryption>,
) -> Result<(), String> {
    require_unlocked_helper(encryption.inner())?;
    ensure_table(db.inner())?;

    let ciphertext = encryption
        .inner()
        .encrypt(KeyPurpose::SupabaseAuth, &value)
        .map_err(|e| match e {
            MasterPasswordError::AppLocked => {
                "Vault locked between status check and write — retry after unlocking.".to_string()
            }
            other => format!("Failed to encrypt Supabase token: {other}"),
        })?;
    let now = chrono::Utc::now().timestamp();

    let conn = db.connection()?;
    conn.execute(
        "INSERT INTO supabase_tokens (key, ciphertext, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET ciphertext = excluded.ciphertext, updated_at = excluded.updated_at",
        params![key, ciphertext, now],
    )
    .map_err(|e| format!("Failed to upsert supabase token: {e}"))?;
    Ok(())
}

/// Read and decrypt a Supabase auth-storage value. Returns `Ok(None)` for
/// an unknown key so the Supabase JS adapter can synthesize a "no session"
/// state and trigger re-auth instead of erroring.
#[tauri::command]
pub async fn supabase_token_get(
    key: String,
    db: State<'_, AppDatabase>,
    encryption: State<'_, MasterPasswordEncryption>,
) -> Result<Option<String>, String> {
    require_unlocked_helper(encryption.inner())?;
    ensure_table(db.inner())?;

    let stored: Option<String> = {
        let conn = db.connection()?;
        conn.query_row(
            "SELECT ciphertext FROM supabase_tokens WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .ok()
    };

    let Some(ciphertext) = stored else {
        return Ok(None);
    };

    let plaintext = encryption
        .inner()
        .decrypt(KeyPurpose::SupabaseAuth, &ciphertext)
        .map_err(|e| format!("Failed to decrypt Supabase token: {e}"))?;
    Ok(Some(plaintext))
}

/// Delete a Supabase auth-storage entry. Returns Ok even when the key was
/// already absent — matches `localStorage.removeItem` semantics.
#[tauri::command]
pub async fn supabase_token_remove(
    key: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    ensure_table(db.inner())?;
    let conn = db.connection()?;
    conn.execute("DELETE FROM supabase_tokens WHERE key = ?1", params![key])
        .map_err(|e| format!("Failed to delete supabase token: {e}"))?;
    Ok(())
}
