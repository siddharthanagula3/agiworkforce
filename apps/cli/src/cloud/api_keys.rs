use serde::{Deserialize, Serialize};

use super::client::{CloudClient, CloudError, Route};

pub const API_KEYS_PATH: &str = "/api/settings/api-keys";

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
pub struct ApiKey {
    pub id: String,
    pub name: String,
    pub key_prefix: String,
    #[serde(default)]
    pub scopes: Vec<String>,
    pub created_at: String,
    #[serde(default)]
    pub last_used_at: Option<String>,
    #[serde(default)]
    pub expires_at: Option<String>,
}

#[derive(Deserialize)]
struct ApiKeyList {
    #[serde(default)]
    api_keys: Vec<ApiKey>,
}

pub fn list_route() -> Route {
    Route::get(API_KEYS_PATH)
}

pub fn revoke_route(key_id: &str) -> Route {
    Route::delete(format!("{API_KEYS_PATH}/{}", urlencoding::encode(key_id)))
}

pub async fn list(client: &CloudClient) -> Result<Vec<ApiKey>, CloudError> {
    let body: ApiKeyList = client.call(&list_route(), &[], None).await?;
    Ok(body.api_keys)
}

pub async fn revoke(client: &CloudClient, key_id: &str) -> Result<(), CloudError> {
    let _: serde_json::Value = client.call(&revoke_route(key_id), &[], None).await?;
    Ok(())
}

pub fn render(keys: &[ApiKey]) -> String {
    if keys.is_empty() {
        return "No API keys on this account.".to_string();
    }
    keys.iter()
        .map(|key| {
            format!(
                "{}  {}  {}…  [{}]\n  created {}  last used {}{}",
                key.id,
                crate::terminal_text::sanitize_terminal_text(&key.name),
                key.key_prefix,
                key.scopes.join(", "),
                key.created_at,
                key.last_used_at.as_deref().unwrap_or("never"),
                key.expires_at
                    .as_deref()
                    .map(|expires| format!("  expires {expires}"))
                    .unwrap_or_default()
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}
