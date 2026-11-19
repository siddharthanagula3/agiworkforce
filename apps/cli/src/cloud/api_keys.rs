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

pub fn select<'a>(keys: &'a [ApiKey], selector: &str) -> Result<&'a ApiKey, String> {
    if let Some(key) = keys.iter().find(|key| key.id == selector) {
        return Ok(key);
    }
    let named: Vec<&ApiKey> = keys.iter().filter(|key| key.name == selector).collect();
    match named.as_slice() {
        [key] => Ok(*key),
        [] => Err(format!(
            "No active API key '{}'",
            crate::terminal_text::sanitize_terminal_text(selector)
        )),
        several => Err(format!(
            "{} active API keys are named '{}'. Name one by its id: {}",
            several.len(),
            crate::terminal_text::sanitize_terminal_text(selector),
            several
                .iter()
                .map(|key| format!("{} ({}…)", key.id, key.key_prefix))
                .collect::<Vec<_>>()
                .join(", ")
        )),
    }
}

pub fn describe(key: &ApiKey) -> String {
    format!(
        "{} ({}, {}…)",
        crate::terminal_text::sanitize_terminal_text(&key.name),
        key.id,
        key.key_prefix
    )
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

#[cfg(test)]
mod tests {
    use super::*;

    fn key(id: &str, name: &str) -> ApiKey {
        ApiKey {
            id: id.to_string(),
            name: name.to_string(),
            key_prefix: format!("agi_{}", &id[..4]),
            scopes: Vec::new(),
            created_at: "2026-11-09T00:00:00Z".to_string(),
            last_used_at: None,
            expires_at: None,
        }
    }

    const OLDER_ID: &str = "0a1b2c3d-0000-4000-8000-000000000001";
    const NEWER_ID: &str = "9f8e7d6c-0000-4000-8000-000000000002";

    #[test]
    fn an_exact_id_wins_over_a_newer_key_named_after_it() {
        let keys = vec![key(NEWER_ID, OLDER_ID), key(OLDER_ID, "ci deploy")];

        assert_eq!(select(&keys, OLDER_ID).unwrap().id, OLDER_ID);

        let reversed: Vec<ApiKey> = keys.into_iter().rev().collect();
        assert_eq!(select(&reversed, OLDER_ID).unwrap().id, OLDER_ID);
    }

    #[test]
    fn a_unique_name_selects_its_key() {
        let keys = vec![key(NEWER_ID, "staging"), key(OLDER_ID, "ci deploy")];

        assert_eq!(select(&keys, "ci deploy").unwrap().id, OLDER_ID);
    }

    #[test]
    fn a_shared_name_is_refused_and_lists_the_ids_to_choose_from() {
        let keys = vec![key(NEWER_ID, "ci deploy"), key(OLDER_ID, "ci deploy")];

        let refusal = select(&keys, "ci deploy").unwrap_err();

        assert!(refusal.contains(NEWER_ID), "{refusal}");
        assert!(refusal.contains(OLDER_ID), "{refusal}");
    }

    #[test]
    fn an_unknown_selector_or_empty_inventory_selects_nothing() {
        assert!(select(&[], OLDER_ID).is_err());
        assert!(select(&[key(NEWER_ID, "staging")], "ci deploy").is_err());
    }

    #[test]
    fn the_description_names_the_immutable_id() {
        let described = describe(&key(OLDER_ID, "ci\u{1b}[2J deploy"));

        assert!(described.contains(OLDER_ID), "{described}");
        assert!(!described.contains('\u{1b}'), "{described}");
    }
}
