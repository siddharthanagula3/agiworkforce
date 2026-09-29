use serde::{Deserialize, Serialize};

use super::{CloudClient, CloudError};

const MARKETPLACES_PATH: &str = "/api/plugins/marketplaces";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSource {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub repository_url: Option<String>,
    #[serde(default, rename = "ref")]
    pub git_ref: Option<String>,
    pub status: String,
    #[serde(default)]
    pub last_error: Option<String>,
    #[serde(default)]
    pub entry_count: u64,
    #[serde(default)]
    pub last_synced_at: Option<String>,
}

#[derive(Deserialize)]
struct SourceList {
    #[serde(default)]
    sources: Vec<MarketplaceSource>,
}

#[derive(Deserialize)]
struct SourceCreated {
    source: MarketplaceSource,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RegisterSource<'a> {
    repository_url: &'a str,
    #[serde(rename = "ref", skip_serializing_if = "Option::is_none")]
    git_ref: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<&'a str>,
}

pub async fn list(client: &CloudClient) -> Result<Vec<MarketplaceSource>, CloudError> {
    let list: SourceList = client.get(MARKETPLACES_PATH, &[]).await?;
    Ok(list.sources)
}

pub async fn add(
    client: &CloudClient,
    repository_url: &str,
    git_ref: Option<&str>,
    name: Option<&str>,
) -> Result<MarketplaceSource, CloudError> {
    let created: SourceCreated = client
        .post(
            MARKETPLACES_PATH,
            &RegisterSource {
                repository_url,
                git_ref,
                name,
            },
        )
        .await?;
    Ok(created.source)
}

pub async fn remove(client: &CloudClient, id: &str) -> Result<(), CloudError> {
    let _: serde_json::Value = client
        .call(
            &super::Route::delete(format!("{MARKETPLACES_PATH}/{}", urlencoding::encode(id))),
            &[],
            None,
        )
        .await?;
    Ok(())
}

pub fn render(sources: &[MarketplaceSource]) -> String {
    if sources.is_empty() {
        return "No marketplaces added to your account. Add one with `agi marketplace add <github url>`.".to_string();
    }
    let sanitize = |text: &str| crate::terminal_text::sanitize_terminal_text(text).into_owned();
    let mut lines = vec![format!("Marketplaces on your account ({})", sources.len())];
    for source in sources {
        lines.push(format!(
            "  {}  {}  [{}]  {} plugins  {}",
            sanitize(&source.id),
            sanitize(&source.name),
            sanitize(&source.status),
            source.entry_count,
            source
                .repository_url
                .as_deref()
                .map(sanitize)
                .unwrap_or_default()
        ));
        if let Some(error) = source.last_error.as_deref() {
            lines.push(format!("      {}", sanitize(error)));
        }
    }
    lines.join("\n")
}
