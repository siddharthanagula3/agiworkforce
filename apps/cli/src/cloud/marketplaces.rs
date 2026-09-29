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

const ENTRIES_PATH: &str = "/api/plugins/marketplaces/entries";
const INSTALLATIONS_PATH: &str = "/api/plugins/marketplace-installations";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceEntry {
    pub id: String,
    pub source_id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub declared_skills: Vec<serde_json::Value>,
    #[serde(default)]
    pub required_connectors: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
struct EntryList {
    #[serde(default)]
    entries: Vec<MarketplaceEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceInstallation {
    pub id: String,
    #[serde(default)]
    pub installed_version: Option<String>,
}

#[derive(Deserialize)]
struct Installed {
    installation: MarketplaceInstallation,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallEntry<'a> {
    entry_id: &'a str,
}

pub async fn entries(client: &CloudClient) -> Result<Vec<MarketplaceEntry>, CloudError> {
    let list: EntryList = client.get(ENTRIES_PATH, &[]).await?;
    Ok(list.entries)
}

pub async fn install(
    client: &CloudClient,
    entry_id: &str,
) -> Result<MarketplaceInstallation, CloudError> {
    let installed: Installed = client
        .post(INSTALLATIONS_PATH, &InstallEntry { entry_id })
        .await?;
    Ok(installed.installation)
}

pub fn source_matches(source: &MarketplaceSource, reference: &str) -> bool {
    source.id == reference || source.name.eq_ignore_ascii_case(reference)
}

pub fn render_entries(source: &MarketplaceSource, entries: &[MarketplaceEntry]) -> String {
    let sanitize = |text: &str| crate::terminal_text::sanitize_terminal_text(text).into_owned();
    if entries.is_empty() {
        return format!(
            "{} lists no plugins yet [{}].",
            sanitize(&source.name),
            sanitize(&source.status)
        );
    }
    let mut lines = vec![format!(
        "Plugins in {} ({})",
        sanitize(&source.name),
        entries.len()
    )];
    for entry in entries {
        lines.push(format!(
            "  {}@{}  {}  {} skills, {} connectors",
            sanitize(&entry.name),
            sanitize(&source.name),
            entry.version.as_deref().map(sanitize).unwrap_or_default(),
            entry.declared_skills.len(),
            entry.required_connectors.len()
        ));
        if let Some(description) = entry.description.as_deref() {
            lines.push(format!("      {}", sanitize(description)));
        }
    }
    lines.push(format!(
        "Install one on your account with `agi marketplace get <plugin>@{}`.",
        sanitize(&source.name)
    ));
    lines.join("\n")
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
