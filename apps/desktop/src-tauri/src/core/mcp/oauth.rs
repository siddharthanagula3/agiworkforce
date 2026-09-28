use agiworkforce_mcp::{BrowserAuthorizer, ClientRegistration, OAuthToken, TokenStore};
use anyhow::anyhow;
use serde::de::DeserializeOwned;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use super::config::{
    decrypt_oauth_token, encrypt_oauth_token, open_mcp_settings_db, upsert_settings_v2_value,
};

const TOKEN_KEY_PREFIX: &str = "mcp_oauth_v3_token";
const CLIENT_KEY_PREFIX: &str = "mcp_oauth_v3_client";

pub struct DesktopTokenStore;

impl DesktopTokenStore {
    fn key(prefix: &str, value: &str) -> String {
        format!("{prefix}_{}", hex::encode(Sha256::digest(value.as_bytes())))
    }

    fn load<T: DeserializeOwned>(key: &str) -> Option<T> {
        let conn = open_mcp_settings_db().ok()?;
        let encrypted: String = conn
            .query_row(
                "SELECT value FROM settings_v2 WHERE key = ?1",
                rusqlite::params![key],
                |row| row.get(0),
            )
            .ok()?;
        let json = decrypt_oauth_token(&encrypted)
            .map_err(|error| {
                tracing::warn!(
                    "[MCP OAuth] stored credential {key} could not be decrypted: {error}"
                );
            })
            .ok()?;
        serde_json::from_str(&json).ok()
    }

    fn save<T: Serialize>(key: &str, value: &T) -> anyhow::Result<()> {
        let json = serde_json::to_string(value)?;
        let encrypted = encrypt_oauth_token(&json)
            .ok_or_else(|| anyhow!("could not encrypt the MCP OAuth credential"))?;
        let conn = open_mcp_settings_db().map_err(|error| anyhow!(error))?;
        upsert_settings_v2_value(&conn, key, &encrypted, "security", true)
            .map_err(|error| anyhow!(error))
    }
}

impl TokenStore for DesktopTokenStore {
    fn get(&self, server_url: &str) -> Option<OAuthToken> {
        Self::load(&Self::key(TOKEN_KEY_PREFIX, server_url))
    }

    fn set(&self, server_url: &str, token: OAuthToken) -> anyhow::Result<()> {
        Self::save(&Self::key(TOKEN_KEY_PREFIX, server_url), &token)
    }

    fn client(&self, issuer: &str) -> Option<ClientRegistration> {
        Self::load(&Self::key(CLIENT_KEY_PREFIX, issuer))
    }

    fn set_client(&self, issuer: &str, client: ClientRegistration) -> anyhow::Result<()> {
        Self::save(&Self::key(CLIENT_KEY_PREFIX, issuer), &client)
    }
}

pub struct DesktopBrowser {
    pub interactive: Arc<AtomicBool>,
}

impl BrowserAuthorizer for DesktopBrowser {
    fn is_interactive(&self) -> bool {
        self.interactive.load(Ordering::SeqCst)
    }

    fn open_url(&self, url: &str) -> bool {
        self.is_interactive() && open::that_detached(url).is_ok()
    }
}
