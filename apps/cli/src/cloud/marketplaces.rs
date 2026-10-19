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
    pub declared_skills: Vec<String>,
    #[serde(default)]
    pub required_connectors: Vec<String>,
    #[serde(default)]
    pub agents: Vec<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub example_prompts: Vec<String>,
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

/// Every plugin on the account's marketplaces whose name or description holds
/// `query`, rendered the way `browse` names them.
pub async fn search_catalogue(client: &CloudClient, query: &str) -> Result<String, CloudError> {
    let sources = list(client).await?;
    let catalogue = entries(client).await?;
    Ok(render_search(query, &sources, &matching(&catalogue, query)))
}

/// The account's marketplace plugins that fit this project, best first,
/// leaving out the ones already installed here.
pub async fn recommend_catalogue(
    client: &CloudClient,
    signals: &std::collections::BTreeSet<String>,
    installed: &[String],
) -> Result<String, CloudError> {
    let sources = list(client).await?;
    let catalogue = entries(client).await?;
    Ok(render_recommendations(
        signals,
        &sources,
        &recommend(&catalogue, signals, installed),
    ))
}

const RECOMMENDATION_LIMIT: usize = 5;

fn entry_words(entry: &MarketplaceEntry) -> std::collections::BTreeSet<String> {
    std::iter::once(entry.name.as_str())
        .chain(entry.description.as_deref())
        .chain(entry.declared_skills.iter().map(String::as_str))
        .chain(entry.example_prompts.iter().map(String::as_str))
        .flat_map(|text| {
            text.split(|c: char| !c.is_ascii_alphanumeric())
                .filter(|word| word.len() >= 2)
                .map(str::to_lowercase)
                .collect::<Vec<_>>()
        })
        .collect()
}

fn signal_matches(signal: &str, words: &std::collections::BTreeSet<String>) -> bool {
    let parts: Vec<&str> = signal
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|part| !part.is_empty())
        .collect();
    !parts.is_empty()
        && parts.iter().all(|part| part.len() >= 2)
        && parts.iter().all(|part| words.contains(*part))
}

pub(crate) fn recommend<'a>(
    catalogue: &'a [MarketplaceEntry],
    signals: &std::collections::BTreeSet<String>,
    installed: &[String],
) -> Vec<(&'a MarketplaceEntry, Vec<String>)> {
    let mut scored: Vec<(&MarketplaceEntry, Vec<String>)> = catalogue
        .iter()
        .filter(|entry| {
            !installed
                .iter()
                .any(|name| name.eq_ignore_ascii_case(&entry.name))
        })
        .filter_map(|entry| {
            let words = entry_words(entry);
            let reasons: Vec<String> = signals
                .iter()
                .filter(|signal| signal_matches(signal, &words))
                .cloned()
                .collect();
            (!reasons.is_empty()).then_some((entry, reasons))
        })
        .collect();
    scored.sort_by(|a, b| b.1.len().cmp(&a.1.len()).then(a.0.name.cmp(&b.0.name)));
    scored.truncate(RECOMMENDATION_LIMIT);
    scored
}

fn render_recommendations(
    signals: &std::collections::BTreeSet<String>,
    sources: &[MarketplaceSource],
    picks: &[(&MarketplaceEntry, Vec<String>)],
) -> String {
    let sanitize = |text: &str| crate::terminal_text::sanitize_terminal_text(text).into_owned();
    if picks.is_empty() {
        let seen = if signals.is_empty() {
            "nothing this folder is built with".to_string()
        } else {
            signals
                .iter()
                .take(8)
                .cloned()
                .collect::<Vec<_>>()
                .join(", ")
        };
        return format!(
            "No plugin on your account's marketplaces fits this project (looked for: {}). `agi marketplace browse` lists them all.",
            sanitize(&seen)
        );
    }
    let mut lines = vec!["Suggested for this project".to_string()];
    for (entry, reasons) in picks {
        let marketplace = sources
            .iter()
            .find(|source| source.id == entry.source_id)
            .map_or_else(
                || sanitize(&entry.source_id),
                |source| sanitize(&source.name),
            );
        lines.push(format!(
            "  {}@{}  for {}",
            sanitize(&entry.name),
            marketplace,
            sanitize(&reasons.join(", "))
        ));
        if let Some(description) = entry.description.as_deref() {
            lines.push(format!("      {}", sanitize(description)));
        }
    }
    lines.push(
        "See one with `agi marketplace show <plugin>@<marketplace>` and install it with `agi marketplace get <plugin>@<marketplace>`.".to_string(),
    );
    lines.join("\n")
}

fn matching<'a>(catalogue: &'a [MarketplaceEntry], query: &str) -> Vec<&'a MarketplaceEntry> {
    let needle = query.trim().to_lowercase();
    catalogue
        .iter()
        .filter(|entry| {
            entry.name.to_lowercase().contains(&needle)
                || entry
                    .description
                    .as_deref()
                    .is_some_and(|description| description.to_lowercase().contains(&needle))
        })
        .collect()
}

fn render_search(
    query: &str,
    sources: &[MarketplaceSource],
    matches: &[&MarketplaceEntry],
) -> String {
    let sanitize = |text: &str| crate::terminal_text::sanitize_terminal_text(text).into_owned();
    if matches.is_empty() {
        return format!(
            "No plugin on your account's marketplaces matches \"{}\". `agi marketplace sources` lists them.",
            sanitize(query)
        );
    }
    let mut lines = vec![format!(
        "Plugins matching \"{}\" ({})",
        sanitize(query),
        matches.len()
    )];
    for entry in matches {
        let marketplace = sources
            .iter()
            .find(|source| source.id == entry.source_id)
            .map_or_else(
                || sanitize(&entry.source_id),
                |source| sanitize(&source.name),
            );
        lines.push(format!(
            "  {}@{}  {}",
            sanitize(&entry.name),
            marketplace,
            entry.version.as_deref().map(sanitize).unwrap_or_default()
        ));
        if let Some(description) = entry.description.as_deref() {
            lines.push(format!("      {}", sanitize(description)));
        }
    }
    lines.push(
        "Install one on your account with `agi marketplace get <plugin>@<marketplace>`."
            .to_string(),
    );
    lines.join("\n")
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
        "See what one adds with `agi marketplace show <plugin>@{0}`, and install it with `agi marketplace get <plugin>@{0}`.",
        sanitize(&source.name)
    ));
    lines.join("\n")
}

/// One plugin's page before it is installed: what it adds, the connections it
/// needs and the permissions it asks for.
pub fn render_entry_detail(source: &MarketplaceSource, entry: &MarketplaceEntry) -> String {
    let sanitize = |text: &str| crate::terminal_text::sanitize_terminal_text(text).into_owned();
    let list = |items: &[String]| {
        items
            .iter()
            .map(|item| sanitize(item))
            .collect::<Vec<_>>()
            .join(", ")
    };
    let mut lines = vec![format!(
        "{}@{}  {}",
        sanitize(&entry.name),
        sanitize(&source.name),
        entry.version.as_deref().map(sanitize).unwrap_or_default()
    )];
    if let Some(description) = entry.description.as_deref() {
        lines.push(format!("  {}", sanitize(description)));
    }
    for (label, items) in [
        ("Skills", &entry.declared_skills),
        ("Agents", &entry.agents),
        ("Needs", &entry.required_connectors),
        ("Permissions", &entry.permissions),
    ] {
        if !items.is_empty() {
            lines.push(format!("  {label:<12} {}", list(items)));
        }
    }
    for prompt in entry.example_prompts.iter().take(3) {
        lines.push(format!("  {:<12} \"{}\"", "Try", sanitize(prompt)));
    }
    lines.push(format!(
        "Install it on your account with `agi marketplace get {}@{}`.",
        sanitize(&entry.name),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plugins_that_fit_the_project_are_suggested_unless_already_installed() {
        let entry = |name: &str, description: &str| -> MarketplaceEntry {
            serde_json::from_value(serde_json::json!({
                "id": name, "sourceId": "src-1", "name": name, "description": description
            }))
            .expect("entry")
        };
        let catalogue = vec![
            entry("terraform-helpers", "Terraform conventions and plan review"),
            entry(
                "rust-release",
                "Release Rust crates with cargo and GitHub Actions",
            ),
            entry("nextjs-kit", "Pages and routes for Next.js apps"),
            entry("slides", "Make slides from notes"),
        ];
        let signals: std::collections::BTreeSet<String> =
            ["rust", "github actions", "next.js", "terraform"]
                .into_iter()
                .map(String::from)
                .collect();
        let picks = recommend(&catalogue, &signals, &["terraform-helpers".to_string()]);
        let names: Vec<(&str, Vec<String>)> = picks
            .iter()
            .map(|(entry, reasons)| (entry.name.as_str(), reasons.clone()))
            .collect();
        assert_eq!(
            names,
            vec![
                (
                    "rust-release",
                    vec!["github actions".to_string(), "rust".to_string()]
                ),
                ("nextjs-kit", vec!["next.js".to_string()]),
            ]
        );
    }

    #[test]
    fn a_plugin_page_shows_what_it_adds_and_asks_for_before_install() {
        let source: MarketplaceSource = serde_json::from_value(serde_json::json!({
            "id": "src-1", "name": "acme", "status": "ready"
        }))
        .expect("source");
        let entry: MarketplaceEntry = serde_json::from_value(serde_json::json!({
            "id": "entry-1",
            "sourceId": "src-1",
            "pluginKey": "release-tools",
            "name": "release-tools",
            "description": "Ship releases",
            "version": "1.2.0",
            "declaredSkills": ["changelog", "tagging"],
            "requiredConnectors": ["github"],
            "agents": ["release-manager"],
            "examplePrompts": ["Draft the changelog for v2"],
            "permissions": ["read repositories"],
            "contentHash": "sha256:abc"
        }))
        .expect("entry");
        let page = render_entry_detail(&source, &entry);
        for expected in [
            "release-tools@acme  1.2.0",
            "Ship releases",
            "Skills       changelog, tagging",
            "Agents       release-manager",
            "Needs        github",
            "Permissions  read repositories",
            "Try          \"Draft the changelog for v2\"",
            "agi marketplace get release-tools@acme",
        ] {
            assert!(page.contains(expected), "{expected} missing from\n{page}");
        }
    }
}
