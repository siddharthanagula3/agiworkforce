//! Token store for MCP OAuth (Sprint B3).
//!
//! New credentials are persisted per server in the OS keyring. The legacy
//! `~/.agiworkforce/mcp-oauth.json` map remains readable only for one-time
//! migration and for the explicit headless keyring opt-out.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// A single OAuth token record cached for one MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpOAuthToken {
    pub access_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    /// Typically "Bearer".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_type: Option<String>,
    /// Unix epoch seconds when the access_token expires.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    /// AS metadata URL discovered via RFC 9728 (cached for refresh).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_server_metadata_url: Option<String>,
    /// Discovered token endpoint (cached so refresh skips discovery).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_url: Option<String>,
    /// Dynamically-registered (or pre-supplied) client id (cached for refresh).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
}

impl McpOAuthToken {
    /// Returns true if `expires_at` is set and within `leeway_secs` of now.
    /// A token without `expires_at` is treated as not-expiring (servers that
    /// omit `expires_in` typically issue long-lived tokens).
    pub fn is_expiring_soon(&self, leeway_secs: u64) -> bool {
        match self.expires_at {
            Some(exp) => {
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                exp.saturating_sub(leeway_secs) <= now
            }
            None => false,
        }
    }
}

/// Disk-persisted token map keyed by MCP server URL.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct McpOAuthStore {
    /// Server URL (canonical, normalized) -> token.
    #[serde(default)]
    pub tokens: HashMap<String, McpOAuthToken>,
}

impl McpOAuthStore {
    /// `~/.agiworkforce/mcp-oauth.json`.
    pub fn store_path() -> Result<PathBuf> {
        let home = dirs::home_dir().context("could not resolve home dir")?;
        Ok(home.join(".agiworkforce").join("mcp-oauth.json"))
    }

    /// Load the store. Missing file → empty store.
    pub fn load() -> Result<Self> {
        let path = Self::store_path()?;
        if !path.exists() {
            return Ok(Self::default());
        }
        let content = fs::read_to_string(&path).context("read mcp-oauth.json")?;
        if content.trim().is_empty() {
            return Ok(Self::default());
        }
        serde_json::from_str(&content).context("parse mcp-oauth.json")
    }

    /// Persist the store, creating parent dir as needed and tightening
    /// permissions to `0o600` on Unix.
    pub fn save(&self) -> Result<()> {
        let path = Self::store_path()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).context("create ~/.agiworkforce dir")?;
        }
        let json = serde_json::to_string_pretty(self).context("serialize mcp-oauth.json")?;
        fs::write(&path, json).context("write mcp-oauth.json")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&path)
                .context("stat mcp-oauth.json for chmod")?
                .permissions();
            perms.set_mode(0o600);
            fs::set_permissions(&path, perms).context("chmod 0o600 mcp-oauth.json")?;
        }
        Ok(())
    }

    pub fn get(&self, server_url: &str) -> Option<&McpOAuthToken> {
        self.tokens.get(server_url)
    }

    pub fn put(&mut self, server_url: String, token: McpOAuthToken) {
        self.tokens.insert(server_url, token);
    }

    #[allow(dead_code)]
    pub fn remove(&mut self, server_url: &str) {
        self.tokens.remove(server_url);
    }
}

// ---------------------------------------------------------------------------
// Per-server keyring-backed store (M29)
// ---------------------------------------------------------------------------

/// OS keyring service name for MCP OAuth tokens.
const KEYRING_SERVICE: &str = "agiworkforce-mcp-oauth";

/// Per-server token entry used by `McpServerOAuthStore`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerToken {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_type: Option<String>,
    /// Unix epoch seconds.
    pub expires_at: Option<u64>,
    pub scope: Option<String>,
    pub auth_server_metadata_url: Option<String>,
    pub token_url: Option<String>,
    pub client_id: Option<String>,
}

/// Keyring-backed OAuth token store keyed by a SHA-256 digest of the canonical
/// server URL, so tenant/path details never appear in credential metadata.
///
/// Strategy:
/// 1. Primary: OS keyring (`keyring` crate) — survives reboots, OS-encrypted.
/// 2. Explicit headless opt-out: file at
///    `~/.agiworkforce/secrets/<server-hash>.token` with 0o600 permissions.
///
/// On Linux without DBus, callers receive an actionable keyring error unless
/// `AGIWORKFORCE_NO_KEYRING=1` was explicitly configured.
#[allow(dead_code)]
pub struct McpServerOAuthStore {
    base_dir: PathBuf,
    /// When false, all save/load/delete go through the file fallback only
    /// (no OS keychain interaction). Tests + headless environments use this
    /// path to avoid auth prompts.
    use_keyring: bool,
}

/// Honor `AGIWORKFORCE_NO_KEYRING=1` (or any non-empty value) — opt-out for
/// environments where the OS keyring is unavailable or undesirable (CI,
/// sandboxes, devs who don't want the Mac to prompt them constantly).
fn env_disables_keyring() -> bool {
    std::env::var("AGIWORKFORCE_NO_KEYRING")
        .map(|v| !v.is_empty() && v != "0")
        .unwrap_or(false)
}

#[allow(dead_code)]
impl McpServerOAuthStore {
    pub fn new() -> Result<Self> {
        let home = dirs::home_dir().context("no home dir")?;
        let base = home.join(".agiworkforce").join("secrets");
        fs::create_dir_all(&base).ok();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&base, fs::Permissions::from_mode(0o700));
        }
        Ok(Self {
            base_dir: base,
            use_keyring: !env_disables_keyring(),
        })
    }

    /// Test / sandboxed-runtime entry. **Does not touch the OS keyring.**
    /// Useful for unit tests (avoids macOS Keychain auth prompts) and for
    /// headless / CI / containerized environments where DBus or Keychain
    /// aren't available.
    pub fn with_base_dir(base: PathBuf) -> Result<Self> {
        fs::create_dir_all(&base).ok();
        Ok(Self {
            base_dir: base,
            use_keyring: false,
        })
    }

    fn credential_id(server: &str) -> String {
        let digest = Sha256::digest(server.as_bytes());
        format!("server:{digest:x}")
    }

    fn fallback_path(&self, server: &str) -> PathBuf {
        self.base_dir
            .join(format!("{}.token", Self::credential_id(server)))
    }

    /// Save a token to the OS keyring, or to the owner-only compatibility file
    /// when keyring use was explicitly disabled.
    pub fn save(&self, server: &str, token: &McpServerToken) -> Result<()> {
        let json = serde_json::to_string(token)?;
        if self.use_keyring {
            let entry = keyring::Entry::new(KEYRING_SERVICE, &Self::credential_id(server))
                .context("open the OS credential store for MCP OAuth")?;
            entry
                .set_password(&json)
                .context("save the MCP OAuth credential in the OS keyring")?;
            let fallback = self.fallback_path(server);
            if fallback.exists() {
                fs::remove_file(&fallback)
                    .with_context(|| format!("remove migrated {}", fallback.display()))?;
            }
            return Ok(());
        }
        self.write_file(server, &json)
    }

    pub fn load(&self, server: &str) -> Result<Option<McpServerToken>> {
        if self.use_keyring {
            let entry = keyring::Entry::new(KEYRING_SERVICE, &Self::credential_id(server))
                .context("open the OS credential store for MCP OAuth")?;
            match entry.get_password() {
                Ok(json) => {
                    let token = serde_json::from_str::<McpServerToken>(&json)
                        .context("saved MCP OAuth credential is invalid")?;
                    return Ok(Some(token));
                }
                Err(keyring::Error::NoEntry) => return Ok(None),
                Err(error) => {
                    return Err(error).context("read the MCP OAuth credential from the OS keyring")
                }
            }
        }
        Ok(self.read_file(server))
    }

    pub fn delete(&self, server: &str) -> Result<()> {
        if self.use_keyring {
            let entry = keyring::Entry::new(KEYRING_SERVICE, &Self::credential_id(server))
                .context("open the OS credential store for MCP OAuth")?;
            match entry.delete_password() {
                Ok(()) | Err(keyring::Error::NoEntry) => {}
                Err(error) => {
                    return Err(error)
                        .context("delete the MCP OAuth credential from the OS keyring")
                }
            }
        }
        let path = self.fallback_path(server);
        if path.exists() {
            fs::remove_file(&path)?;
        }
        Ok(())
    }

    fn write_file(&self, server: &str, json: &str) -> Result<()> {
        let path = self.fallback_path(server);
        fs::write(&path, json).with_context(|| format!("write {}", path.display()))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
        }
        Ok(())
    }

    fn read_file(&self, server: &str) -> Option<McpServerToken> {
        let path = self.fallback_path(server);
        let json = fs::read_to_string(&path).ok()?;
        serde_json::from_str::<McpServerToken>(&json).ok()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_without_expires_never_expires() {
        let t = McpOAuthToken {
            access_token: "abc".into(),
            refresh_token: None,
            token_type: None,
            expires_at: None,
            scope: None,
            auth_server_metadata_url: None,
            token_url: None,
            client_id: None,
        };
        assert!(!t.is_expiring_soon(60));
    }

    #[test]
    fn token_expired_ten_seconds_ago_is_expiring() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(1_000_000);
        let t = McpOAuthToken {
            access_token: "abc".into(),
            refresh_token: None,
            token_type: None,
            expires_at: Some(now.saturating_sub(10)),
            scope: None,
            auth_server_metadata_url: None,
            token_url: None,
            client_id: None,
        };
        assert!(t.is_expiring_soon(60));
    }

    #[test]
    fn store_default_is_empty() {
        let s = McpOAuthStore::default();
        assert!(s.tokens.is_empty());
        assert!(s.get("https://example.com").is_none());
    }

    #[test]
    fn store_put_and_get_roundtrip() {
        let mut s = McpOAuthStore::default();
        let t = McpOAuthToken {
            access_token: "xyz".into(),
            refresh_token: Some("r".into()),
            token_type: Some("Bearer".into()),
            expires_at: None,
            scope: None,
            auth_server_metadata_url: None,
            token_url: None,
            client_id: None,
        };
        s.put("https://mcp.example.com/mcp".to_string(), t);
        assert!(s.get("https://mcp.example.com/mcp").is_some());
    }

    // -----------------------------------------------------------------------
    // McpServerOAuthStore (keyring fallback path via file)
    // -----------------------------------------------------------------------

    fn dummy_server_token() -> McpServerToken {
        McpServerToken {
            access_token: "atk-abc".into(),
            refresh_token: Some("rtk-xyz".into()),
            token_type: Some("Bearer".into()),
            expires_at: Some(1_700_000_000),
            scope: Some("read write".into()),
            auth_server_metadata_url: None,
            token_url: None,
            client_id: None,
        }
    }

    #[test]
    fn server_store_save_and_load_roundtrip_via_file_fallback() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = McpServerOAuthStore::with_base_dir(dir.path().to_path_buf()).unwrap();
        store.save("server-a", &dummy_server_token()).expect("save");
        let loaded = store
            .load("server-a")
            .expect("load should succeed")
            .expect("token should exist");
        assert_eq!(loaded.access_token, "atk-abc");
        assert_eq!(loaded.refresh_token.as_deref(), Some("rtk-xyz"));
    }

    #[test]
    fn server_store_missing_server_returns_none() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = McpServerOAuthStore::with_base_dir(dir.path().to_path_buf()).unwrap();
        assert!(store.load("nope").unwrap().is_none());
    }

    #[test]
    fn server_store_delete_clears_token() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = McpServerOAuthStore::with_base_dir(dir.path().to_path_buf()).unwrap();
        store.save("server-b", &dummy_server_token()).unwrap();
        assert!(store.load("server-b").unwrap().is_some());
        store.delete("server-b").unwrap();
        assert!(store.load("server-b").unwrap().is_none());
    }

    #[test]
    fn server_store_overwrite_updates_token() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = McpServerOAuthStore::with_base_dir(dir.path().to_path_buf()).unwrap();
        store.save("server-c", &dummy_server_token()).unwrap();
        let updated = McpServerToken {
            access_token: "new-token".into(),
            refresh_token: None,
            token_type: None,
            expires_at: None,
            scope: None,
            auth_server_metadata_url: None,
            token_url: None,
            client_id: None,
        };
        store.save("server-c", &updated).unwrap();
        let loaded = store.load("server-c").unwrap().unwrap();
        assert_eq!(loaded.access_token, "new-token");
    }

    #[test]
    fn server_identifiers_are_hashed_before_reaching_the_keyring_or_filesystem() {
        let identifier = McpServerOAuthStore::credential_id(
            "https://mcp.example.com/path?tenant=private-customer",
        );
        assert!(identifier.starts_with("server:"));
        assert_eq!(identifier.len(), "server:".len() + 64);
        assert!(!identifier.contains("example.com"));
        assert!(!identifier.contains("private-customer"));
    }
}
