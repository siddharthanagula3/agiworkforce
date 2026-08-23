//! Re-wrap payloads an older build encrypted under the machine-only key.
//!
//! [`machine_key`] no longer derives keys from machine identifiers alone, so
//! every payload a shipped build wrote has to be read once under the legacy key
//! and written back under the per-install key. Stores that own their AES-GCM
//! framing — `base64(nonce || ciphertext)` — are swept here rather than at each
//! read site, so a consumer that never re-reads a value still keeps its data.
//!
//! Every entry point is idempotent: a payload already under the per-install key
//! is left byte-for-byte alone.

use super::machine_key::{self, KeyDerivationError, KeyPurpose};
use aes_gcm::{
    aead::{rand_core::RngCore, Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use std::path::{Path, PathBuf};

const NONCE_SIZE: usize = 12;
const AES_GCM_TAG_SIZE: usize = 16;

/// Mirrors `core::mcp::config::ENCRYPTED_AT_REST_PREFIX`. An MCP credential is
/// stored as `<enc:BASE64>`; re-wrapping the inner ciphertext without restoring
/// the marker would leave a value that module reads back as plaintext.
const ENCRYPTED_AT_REST_PREFIX: &str = "<enc:";

/// Encrypt in the `base64(nonce || ciphertext)` framing shared by the MCP,
/// connector-permission, and OAuth-token stores.
pub fn encrypt_combined(key: &[u8], plaintext: &str) -> Option<String> {
    let cipher = Aes256Gcm::new_from_slice(key).ok()?;

    let mut nonce_bytes = [0u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce_bytes);
    #[allow(deprecated)]
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).ok()?;

    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    Some(general_purpose::STANDARD.encode(combined))
}

/// Decrypt the `base64(nonce || ciphertext)` framing with exactly `key`.
pub fn decrypt_combined(key: &[u8], encoded: &str) -> Option<String> {
    let combined = general_purpose::STANDARD.decode(encoded).ok()?;
    if combined.len() <= NONCE_SIZE {
        return None;
    }

    let (nonce_bytes, ciphertext) = combined.split_at(NONCE_SIZE);
    let cipher = Aes256Gcm::new_from_slice(key).ok()?;
    #[allow(deprecated)]
    let nonce = Nonce::from_slice(nonce_bytes);
    String::from_utf8(cipher.decrypt(nonce, ciphertext).ok()?).ok()
}

/// Whether a stored value could be one of this framing's payloads at all.
///
/// Deriving the legacy keys costs 600,000 PBKDF2 rounds per machine identifier,
/// so a store holding no plausible ciphertext must never pay for it.
pub fn looks_like_combined_payload(stored: &str) -> bool {
    let body = stored
        .strip_prefix(ENCRYPTED_AT_REST_PREFIX)
        .and_then(|rest| rest.strip_suffix('>'))
        .unwrap_or(stored);

    general_purpose::STANDARD
        .decode(body)
        .is_ok_and(|bytes| bytes.len() > NONCE_SIZE + AES_GCM_TAG_SIZE)
}

/// Re-wrap a stored value under the current `purpose` key.
///
/// `Ok(None)` means nothing to do: the value already opens under the current
/// key, or it is not one of this purpose's payloads at all. AES-GCM
/// authentication is what proves which key wrote a value, so an unrelated
/// setting can never be mistaken for one and rewritten.
pub fn rewrap_value(
    purpose: KeyPurpose,
    label: &str,
    stored: &str,
) -> Result<Option<String>, KeyDerivationError> {
    if let Some(inner) = stored
        .strip_prefix(ENCRYPTED_AT_REST_PREFIX)
        .and_then(|rest| rest.strip_suffix('>'))
    {
        return Ok(rewrap_ciphertext(purpose, label, inner)?
            .map(|next| format!("{ENCRYPTED_AT_REST_PREFIX}{next}>")));
    }

    rewrap_ciphertext(purpose, label, stored)
}

fn rewrap_ciphertext(
    purpose: KeyPurpose,
    label: &str,
    ciphertext: &str,
) -> Result<Option<String>, KeyDerivationError> {
    let Some(opened) = machine_key::open_with_key_rotation(purpose, label, |key| {
        decrypt_combined(key, ciphertext)
    })?
    else {
        return Ok(None);
    };

    if !opened.rewrap_required {
        return Ok(None);
    }

    let current = machine_key::try_derive_key(purpose)?;
    Ok(encrypt_combined(&current, &opened.value))
}

/// Replace only the `<enc:…>` tokens in a config file.
///
/// Re-serializing the document instead would reorder keys and drop anything the
/// desktop config model does not represent, so the surrounding bytes are copied
/// through untouched.
pub fn rewrap_encrypted_at_rest_tokens(
    text: &str,
    label: &str,
) -> Result<Option<String>, KeyDerivationError> {
    let mut rewritten = String::with_capacity(text.len());
    let mut rest = text;
    let mut changed = false;

    while let Some(start) = rest.find(ENCRYPTED_AT_REST_PREFIX) {
        let (before, from_marker) = rest.split_at(start);
        rewritten.push_str(before);

        let body = &from_marker[ENCRYPTED_AT_REST_PREFIX.len()..];
        let Some(end) = body.find('>') else {
            rewritten.push_str(from_marker);
            rest = "";
            break;
        };

        match rewrap_ciphertext(KeyPurpose::McpCredentials, label, &body[..end])? {
            Some(next) => {
                rewritten.push_str(ENCRYPTED_AT_REST_PREFIX);
                rewritten.push_str(&next);
                rewritten.push('>');
                changed = true;
            }
            None => rewritten.push_str(&from_marker[..ENCRYPTED_AT_REST_PREFIX.len() + end + 1]),
        }

        rest = &body[end + 1..];
    }
    rewritten.push_str(rest);

    Ok(changed.then_some(rewritten))
}

/// Run [`rewrap_legacy_machine_only_files`] off the startup path.
///
/// Proving a payload is not legacy costs a full PBKDF2 derivation, and every
/// store here is replaced with a single atomic rename that concurrent readers
/// tolerate, so this must not hold the window closed.
pub fn spawn_legacy_machine_only_file_rewrap() {
    std::thread::Builder::new()
        .name("machine-key-rewrap".to_string())
        .spawn(rewrap_legacy_machine_only_files)
        .map(|_| ())
        .unwrap_or_else(|error| {
            tracing::warn!("Could not start the legacy key re-wrap sweep: {error}");
        });
}

/// Re-wrap every file-backed payload a shipped build left under the
/// machine-only key. Runs on each launch; a current payload is a no-op.
pub fn rewrap_legacy_machine_only_files() {
    if !machine_key::has_install_secret() {
        return;
    }

    if let Ok(app_data_dir) = crate::sys::utils::app_data_dir() {
        let connector_permissions = app_data_dir.join("connector-permissions.json");
        if let Err(error) =
            rewrap_whole_file(KeyPurpose::ConnectorPermissions, &connector_permissions)
        {
            tracing::warn!(
                "Could not re-wrap {}: {error}",
                connector_permissions.display()
            );
        }
    }

    for path in mcp_config_paths() {
        if let Err(error) = rewrap_encrypted_at_rest_file(&path) {
            tracing::warn!(
                "Could not re-wrap MCP credentials in {}: {error}",
                path.display()
            );
        }
    }
}

fn mcp_config_paths() -> Vec<PathBuf> {
    use crate::core::mcp::config::{McpServersConfig, PROJECT_FOLDER_ENV_VAR};

    let mut paths = Vec::new();
    if let Ok(path) = McpServersConfig::default_config_path() {
        paths.push(path);
    }
    if let Some(path) = McpServersConfig::dotfile_config_path() {
        if !paths.contains(&path) {
            paths.push(path);
        }
    }

    // A project root is only known when one is already open. Configs under any
    // other root are re-wrapped when `McpServersConfig::from_file` reads them.
    if let Ok(project_root) = std::env::var(PROJECT_FOLDER_ENV_VAR) {
        for path in McpServersConfig::project_config_candidates(&project_root) {
            if path.exists() && !paths.contains(&path) {
                paths.push(path);
            }
        }
    }

    paths
}

fn rewrap_whole_file(purpose: KeyPurpose, path: &Path) -> Result<(), String> {
    let Ok(stored) = std::fs::read_to_string(path) else {
        return Ok(());
    };
    if !looks_like_combined_payload(stored.trim()) {
        return Ok(());
    }

    let label = format!("file:{}", path.display());
    let Some(rewrapped) =
        rewrap_value(purpose, &label, stored.trim()).map_err(|error| error.to_string())?
    else {
        return Ok(());
    };

    if !replace_file_contents(path, &stored, &rewrapped)? {
        return Ok(());
    }
    machine_key::clear_machine_only_payload(&label);
    tracing::info!(
        "Re-wrapped {} under the per-install encryption key",
        path.display()
    );
    Ok(())
}

/// Re-wrap every `<enc:…>` token in one config file.
///
/// Idempotent: a document whose tokens already open under the per-install key
/// is left byte-for-byte alone.
pub fn rewrap_encrypted_at_rest_file(path: &Path) -> Result<(), String> {
    let Ok(stored) = std::fs::read_to_string(path) else {
        return Ok(());
    };

    let label = format!("file:{}", path.display());
    let Some(rewritten) =
        rewrap_encrypted_at_rest_tokens(&stored, &label).map_err(|error| error.to_string())?
    else {
        return Ok(());
    };

    if !replace_file_contents(path, &stored, &rewritten)? {
        return Ok(());
    }
    machine_key::clear_machine_only_payload(&label);
    tracing::info!(
        "Re-wrapped MCP credentials in {} under the per-install encryption key",
        path.display()
    );
    Ok(())
}

/// Write through a sibling temporary file so an interrupted re-wrap cannot
/// truncate a store whose only copy is this file.
///
/// Deriving the legacy keys takes long enough for the app to have saved the
/// store again in the meantime; `expected` is re-checked so the sweep replaces
/// only the exact bytes it read, and returns `false` when it did not.
fn replace_file_contents(path: &Path, expected: &str, contents: &str) -> Result<bool, String> {
    if std::fs::read_to_string(path).ok().as_deref() != Some(expected) {
        return Ok(false);
    }

    let mut temp = path.as_os_str().to_os_string();
    temp.push(format!(".rewrap-{}.tmp", std::process::id()));
    let temp = PathBuf::from(temp);

    std::fs::write(&temp, contents)
        .map_err(|error| format!("write {}: {error}", temp.display()))?;

    // A fresh file takes the process umask; these stores hold credentials, so
    // the replacement must not be more readable than what it replaces.
    #[cfg(unix)]
    if let Ok(metadata) = std::fs::metadata(path) {
        use std::os::unix::fs::PermissionsExt;
        let mode = metadata.permissions().mode();
        if let Err(error) = std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(mode)) {
            let _ = std::fs::remove_file(&temp);
            return Err(format!(
                "preserve permissions on {}: {error}",
                path.display()
            ));
        }
    }

    std::fs::rename(&temp, path)
        .map(|()| true)
        .map_err(|error| {
            let _ = std::fs::remove_file(&temp);
            format!("replace {}: {error}", path.display())
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn legacy_key(purpose: KeyPurpose) -> [u8; 32] {
        machine_key::legacy_machine_only_keys(purpose)
            .first()
            .copied()
            .expect("a legacy candidate always exists")
    }

    /// The connector-permission reader has no legacy path and overwrites the
    /// file on the next save, so a failure to re-wrap loses every saved grant.
    #[test]
    fn legacy_connector_permissions_file_is_rewrapped_and_stops_opening_under_the_old_key() {
        let purpose = KeyPurpose::ConnectorPermissions;
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("connector-permissions.json");
        let saved = r#"{"gmail":{"send":{"level":"always-allow","destructive":true}}}"#;

        std::fs::write(
            &path,
            encrypt_combined(&legacy_key(purpose), saved).expect("legacy encrypt"),
        )
        .expect("seed legacy file");

        rewrap_whole_file(purpose, &path).expect("re-wrap the legacy file");

        let stored = std::fs::read_to_string(&path).expect("read re-wrapped file");
        let current = machine_key::try_derive_key(purpose).expect("install secret in tests");
        assert_eq!(decrypt_combined(&current, &stored).as_deref(), Some(saved));
        assert_eq!(decrypt_combined(&legacy_key(purpose), &stored), None);
        assert!(!machine_key::machine_only_payloads().contains(&format!("file:{}", path.display())));

        rewrap_whole_file(purpose, &path).expect("re-wrapping again must be a no-op");
        assert_eq!(
            std::fs::read_to_string(&path).expect("re-read"),
            stored,
            "a payload already under the per-install key must not be rewritten"
        );
    }

    #[test]
    fn a_payload_of_another_purpose_is_never_rewritten() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("connector-permissions.json");
        let foreign = encrypt_combined(&legacy_key(KeyPurpose::McpCredentials), "{}")
            .expect("legacy encrypt");
        std::fs::write(&path, &foreign).expect("seed file");

        rewrap_whole_file(KeyPurpose::ConnectorPermissions, &path).expect("sweep");

        assert_eq!(std::fs::read_to_string(&path).expect("re-read"), foreign);
    }

    /// MCP credentials live inside a user-authored JSON document; only the
    /// `<enc:…>` tokens may change.
    #[test]
    fn legacy_mcp_credential_tokens_are_rewrapped_without_touching_the_document() {
        let purpose = KeyPurpose::McpCredentials;
        let token = encrypt_combined(&legacy_key(purpose), "sk-legacy-token").expect("encrypt");
        let document =
            format!("{{\n  \"mcpServers\": {{\n    \"vercel\": {{ \"headers\": {{ \"Authorization\": \"<enc:{token}>\", \"X-Plain\": \"kept\" }} }}\n  }}\n}}\n");

        let rewritten = rewrap_encrypted_at_rest_tokens(&document, "test:mcp")
            .expect("install secret in tests")
            .expect("a legacy token must be re-wrapped");

        assert!(rewritten.contains("\"X-Plain\": \"kept\""));
        assert!(rewritten.starts_with("{\n  \"mcpServers\""));
        assert!(rewritten.ends_with("}\n"));

        let start = rewritten.find("<enc:").expect("marker") + "<enc:".len();
        let end = rewritten[start..].find('>').expect("terminator") + start;
        let rotated = &rewritten[start..end];
        let current = machine_key::try_derive_key(purpose).expect("install secret in tests");
        assert_eq!(
            decrypt_combined(&current, rotated).as_deref(),
            Some("sk-legacy-token")
        );
        assert_eq!(decrypt_combined(&legacy_key(purpose), rotated), None);

        assert_eq!(
            rewrap_encrypted_at_rest_tokens(&rewritten, "test:mcp")
                .expect("install secret in tests"),
            None,
            "re-running the sweep must not rewrite an already-current document"
        );
    }

    /// The sweep runs off the startup path, so the app can save the store while
    /// the legacy keys are still being derived. Replacing bytes the sweep never
    /// read would silently undo that save.
    #[test]
    fn a_store_rewritten_during_the_sweep_is_not_clobbered() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("connector-permissions.json");
        std::fs::write(&path, "written-while-we-worked").expect("seed");

        assert!(!replace_file_contents(&path, "what-we-read", "re-wrapped").expect("replace"));
        assert_eq!(
            std::fs::read_to_string(&path).expect("read"),
            "written-while-we-worked"
        );

        assert!(
            replace_file_contents(&path, "written-while-we-worked", "re-wrapped").expect("replace")
        );
        assert_eq!(std::fs::read_to_string(&path).expect("read"), "re-wrapped");
    }

    /// A project-scoped `.mcp.json` lives under an arbitrary root the startup
    /// sweep cannot enumerate, so `McpServersConfig::from_file` re-wraps it
    /// through this entry point when a credential opened under a legacy key.
    #[test]
    fn a_project_scoped_mcp_config_file_is_rewrapped_in_place() {
        let purpose = KeyPurpose::McpCredentials;
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join(".mcp.json");
        let token = encrypt_combined(&legacy_key(purpose), "sk-project-token").expect("encrypt");
        let document = format!(
            "{{\n  \"mcpServers\": {{\n    \"vercel\": {{ \"transport\": {{ \"bearer_token\": \"<enc:{token}>\" }} }}\n  }}\n}}\n"
        );
        std::fs::write(&path, &document).expect("seed project config");

        rewrap_encrypted_at_rest_file(&path).expect("re-wrap the project config");

        let rewritten = std::fs::read_to_string(&path).expect("read re-wrapped config");
        assert_ne!(rewritten, document);
        assert!(rewritten.contains("\"vercel\""));

        let start = rewritten.find("<enc:").expect("marker") + "<enc:".len();
        let end = rewritten[start..].find('>').expect("terminator") + start;
        let rotated = &rewritten[start..end];
        let current = machine_key::try_derive_key(purpose).expect("install secret in tests");
        assert_eq!(
            decrypt_combined(&current, rotated).as_deref(),
            Some("sk-project-token")
        );
        assert_eq!(decrypt_combined(&legacy_key(purpose), rotated), None);

        rewrap_encrypted_at_rest_file(&path).expect("re-running must be a no-op");
        assert_eq!(
            std::fs::read_to_string(&path).expect("re-read"),
            rewritten,
            "a document already under the per-install key must not be rewritten"
        );
    }

    #[test]
    fn an_unterminated_marker_is_copied_through_unchanged() {
        let document = "{\"header\":\"<enc:not-terminated\"}";
        assert_eq!(
            rewrap_encrypted_at_rest_tokens(document, "test:mcp").expect("install secret in tests"),
            None
        );
    }
}
