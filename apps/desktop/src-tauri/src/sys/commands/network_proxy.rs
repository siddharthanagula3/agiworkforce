//! Native-authoritative LLM proxy settings.
//!
//! The complete profile, including its optional password, is serialized into
//! `SecretManager`'s AES-256-GCM encrypted storage. Renderer callers only ever
//! receive a `has_password` boolean; neither settings.json nor localStorage
//! owns the credential.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::core::llm::providers::http_client_factory::{
    set_network_proxy_config, NetworkProxyConfig,
};
use crate::sys::commands::llm::{rehydrate_byok_providers, LLMState};
use crate::sys::commands::security::SecretManagerState;
use crate::sys::security::{MasterPasswordEncryption, SecretManager};

const NETWORK_PROXY_SECRET_KEY: &str = "llm_network_proxy_v1";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredNetworkProxyConfig {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    proxy_url: String,
    #[serde(default = "default_no_proxy")]
    no_proxy: String,
    #[serde(default)]
    ca_cert_path: String,
    #[serde(default)]
    username: String,
    #[serde(default)]
    password: String,
}

fn default_no_proxy() -> String {
    "localhost,127.0.0.1,::1".to_string()
}

impl Default for StoredNetworkProxyConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            proxy_url: String::new(),
            no_proxy: default_no_proxy(),
            ca_cert_path: String::new(),
            username: String::new(),
            password: String::new(),
        }
    }
}

impl From<StoredNetworkProxyConfig> for NetworkProxyConfig {
    fn from(value: StoredNetworkProxyConfig) -> Self {
        Self {
            enabled: value.enabled,
            proxy_url: value.proxy_url,
            no_proxy: value.no_proxy,
            ca_cert_path: value.ca_cert_path,
            username: value.username,
            password: value.password,
        }
    }
}

impl From<NetworkProxyConfig> for StoredNetworkProxyConfig {
    fn from(value: NetworkProxyConfig) -> Self {
        Self {
            enabled: value.enabled,
            proxy_url: value.proxy_url,
            no_proxy: value.no_proxy,
            ca_cert_path: value.ca_cert_path,
            username: value.username,
            password: value.password,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProxySettings {
    pub enabled: bool,
    pub proxy_url: String,
    pub no_proxy: String,
    pub ca_cert_path: String,
    pub username: String,
    pub has_password: bool,
}

impl From<&NetworkProxyConfig> for NetworkProxySettings {
    fn from(value: &NetworkProxyConfig) -> Self {
        Self {
            enabled: value.enabled,
            proxy_url: value.proxy_url.clone(),
            no_proxy: value.no_proxy.clone(),
            ca_cert_path: value.ca_cert_path.clone(),
            username: value.username.clone(),
            has_password: !value.password.is_empty(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProxyUpdate {
    pub enabled: bool,
    pub proxy_url: String,
    pub no_proxy: String,
    pub ca_cert_path: String,
    pub username: String,
    /// `None` preserves the encrypted password already on disk. A non-empty
    /// value replaces it; `clear_password` explicitly removes it.
    pub password: Option<String>,
    #[serde(default)]
    pub clear_password: bool,
}

fn merge_update(request: NetworkProxyUpdate, previous: &NetworkProxyConfig) -> NetworkProxyConfig {
    let password = if request.clear_password {
        String::new()
    } else {
        request
            .password
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| previous.password.clone())
    };

    NetworkProxyConfig {
        enabled: request.enabled,
        proxy_url: request.proxy_url.trim().to_string(),
        no_proxy: request.no_proxy.trim().to_string(),
        ca_cert_path: request.ca_cert_path.trim().to_string(),
        username: request.username.trim().to_string(),
        password,
    }
}

fn load_from_secret_manager(manager: &SecretManager) -> Result<NetworkProxyConfig, String> {
    match manager.get_secret(NETWORK_PROXY_SECRET_KEY) {
        Ok(json) => serde_json::from_str::<StoredNetworkProxyConfig>(&json)
            .map(NetworkProxyConfig::from)
            .map_err(|e| format!("Saved network proxy settings are invalid: {e}")),
        Err(crate::sys::security::SecretError::SecretNotFound)
        | Err(crate::sys::security::SecretError::DatabaseRetrieveError(
            rusqlite::Error::QueryReturnedNoRows,
        )) => Ok(NetworkProxyConfig::default()),
        Err(error) => Err(format!("Failed to load network proxy settings: {error}")),
    }
}

fn persist_to_secret_manager(
    manager: &SecretManager,
    config: &NetworkProxyConfig,
) -> Result<(), String> {
    let json = serde_json::to_string(&StoredNetworkProxyConfig::from(config.clone()))
        .map_err(|e| format!("Failed to serialize network proxy settings: {e}"))?;
    manager
        .set_secret(NETWORK_PROXY_SECRET_KEY, &json)
        .map_err(|e| format!("Failed to save network proxy settings: {e}"))
}

/// Apply encrypted settings before the LLM router is initialized at startup.
/// Invalid/corrupt profiles fail closed to reqwest's normal environment proxy
/// behavior and return an error for the setup log.
pub fn apply_saved_network_proxy(manager: &SecretManager) -> Result<(), String> {
    let config = load_from_secret_manager(manager)?;
    set_network_proxy_config(config)
}

#[tauri::command]
pub async fn llm_network_proxy_get(
    secret_state: State<'_, SecretManagerState>,
) -> Result<NetworkProxySettings, String> {
    let config = load_from_secret_manager(secret_state.manager())?;
    Ok(NetworkProxySettings::from(&config))
}

#[tauri::command]
pub async fn llm_network_proxy_set(
    request: NetworkProxyUpdate,
    secret_state: State<'_, SecretManagerState>,
    llm_state: State<'_, LLMState>,
    encryption: State<'_, MasterPasswordEncryption>,
) -> Result<NetworkProxySettings, String> {
    if encryption.is_configured() && !encryption.is_unlocked() {
        return Err(
            "Unlock the credential vault before changing network settings so configured BYOK providers can be rebuilt safely"
                .to_string(),
        );
    }

    let previous = load_from_secret_manager(secret_state.manager())?;
    let config = merge_update(request, &previous);

    // Build a client before persistence so malformed URLs, unreadable CA files,
    // and invalid certificates cannot replace a working profile.
    set_network_proxy_config(config.clone())?;
    if let Err(error) = persist_to_secret_manager(secret_state.manager(), &config) {
        // Restore the previous runtime value when durable persistence fails.
        let _ = set_network_proxy_config(previous);
        return Err(error);
    }

    // Every provider owns one or more reqwest clients. Drop them all, then
    // restore encrypted BYOK providers under the new profile. Managed Cloud and
    // local providers are lazily recreated; the settings UI also immediately
    // restores custom local-runtime URLs after this command returns.
    llm_state.router.write().await.clear_providers();
    rehydrate_byok_providers(&llm_state.router, encryption.inner()).await;

    Ok(NetworkProxySettings::from(&config))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_settings_never_return_password() {
        let config = NetworkProxyConfig {
            password: "very-secret".to_string(),
            ..NetworkProxyConfig::default()
        };
        let public = NetworkProxySettings::from(&config);
        let json = serde_json::to_string(&public).unwrap();
        assert!(public.has_password);
        assert!(!json.contains("very-secret"));
        assert!(!json.contains("password\""));
    }

    #[test]
    fn stored_config_defaults_to_loopback_bypass() {
        let stored: StoredNetworkProxyConfig = serde_json::from_str("{}").unwrap();
        assert_eq!(stored.no_proxy, "localhost,127.0.0.1,::1");
    }

    #[test]
    fn update_preserves_password_when_renderer_does_not_return_one() {
        let previous = NetworkProxyConfig {
            password: "encrypted-native-secret".to_string(),
            ..NetworkProxyConfig::default()
        };
        let merged = merge_update(
            NetworkProxyUpdate {
                enabled: true,
                proxy_url: "  https://proxy.example.com:8443  ".to_string(),
                no_proxy: " localhost ".to_string(),
                ca_cert_path: String::new(),
                username: " network-user ".to_string(),
                password: None,
                clear_password: false,
            },
            &previous,
        );
        assert_eq!(merged.password, "encrypted-native-secret");
        assert_eq!(merged.proxy_url, "https://proxy.example.com:8443");
        assert_eq!(merged.username, "network-user");
    }

    #[test]
    fn clear_password_wins_over_replacement_value() {
        let previous = NetworkProxyConfig {
            password: "old-secret".to_string(),
            ..NetworkProxyConfig::default()
        };
        let merged = merge_update(
            NetworkProxyUpdate {
                enabled: true,
                proxy_url: "http://proxy.example.com".to_string(),
                no_proxy: String::new(),
                ca_cert_path: String::new(),
                username: String::new(),
                password: Some("new-secret".to_string()),
                clear_password: true,
            },
            &previous,
        );
        assert!(merged.password.is_empty());
    }
}
