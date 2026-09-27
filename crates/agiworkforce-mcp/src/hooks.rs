use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::elicitation::SharedElicitationHandler;

pub type ClientInfo = crate::protocol::Implementation;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthToken {
    pub access_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_server_metadata_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issuer: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resource: Option<String>,
}

impl OAuthToken {
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClientRegistration {
    pub client_id: String,
    pub redirect_uri: String,
}

pub trait TokenStore: Send + Sync {
    fn get(&self, server_url: &str) -> Option<OAuthToken>;
    fn set(&self, server_url: &str, token: OAuthToken) -> anyhow::Result<()>;
    fn client(&self, issuer: &str) -> Option<ClientRegistration>;
    fn set_client(&self, issuer: &str, client: ClientRegistration) -> anyhow::Result<()>;
}

#[derive(Default)]
pub struct InMemoryTokenStore {
    tokens: Mutex<HashMap<String, OAuthToken>>,
    clients: Mutex<HashMap<String, ClientRegistration>>,
}

impl InMemoryTokenStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl TokenStore for InMemoryTokenStore {
    fn get(&self, server_url: &str) -> Option<OAuthToken> {
        self.tokens.lock().ok()?.get(server_url).cloned()
    }

    fn set(&self, server_url: &str, token: OAuthToken) -> anyhow::Result<()> {
        self.tokens
            .lock()
            .map_err(|_| anyhow::anyhow!("token store mutex poisoned"))?
            .insert(server_url.to_string(), token);
        Ok(())
    }

    fn client(&self, issuer: &str) -> Option<ClientRegistration> {
        self.clients.lock().ok()?.get(issuer).cloned()
    }

    fn set_client(&self, issuer: &str, client: ClientRegistration) -> anyhow::Result<()> {
        self.clients
            .lock()
            .map_err(|_| anyhow::anyhow!("token store mutex poisoned"))?
            .insert(issuer.to_string(), client);
        Ok(())
    }
}

pub trait BrowserAuthorizer: Send + Sync {
    fn is_interactive(&self) -> bool;
    fn open_url(&self, url: &str) -> bool;
}

pub struct DenyBrowserAuthorizer;

impl BrowserAuthorizer for DenyBrowserAuthorizer {
    fn is_interactive(&self) -> bool {
        false
    }
    fn open_url(&self, _url: &str) -> bool {
        false
    }
}

pub type LogSink = Arc<dyn Fn(&str) + Send + Sync>;

pub fn noop_log() -> LogSink {
    Arc::new(|_: &str| {})
}

#[derive(Clone)]
pub struct ClientHooks {
    pub token_store: Arc<dyn TokenStore>,
    pub elicitation: SharedElicitationHandler,
    pub browser: Arc<dyn BrowserAuthorizer>,
    pub client_info: ClientInfo,
    pub client_metadata_url: Option<String>,
    pub on_log: LogSink,
}

impl ClientHooks {
    pub(crate) fn log(&self, msg: &str) {
        (self.on_log)(msg);
    }
}
