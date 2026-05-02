use crate::CONFIG_TOML_FILE;
use std::io;
use std::path::Path;
use toml_edit::DocumentMut;
use toml_edit::Item;
use toml_edit::Table;

/// Fields used to write or update a marketplace entry in `config.toml`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarketplaceConfigUpdate<'a> {
    pub last_updated: &'a str,
    pub last_revision: Option<&'a str>,
    pub source_type: &'a str,
    pub source: &'a str,
    pub ref_name: Option<&'a str>,
    pub sparse_paths: &'a [String],
}

/// Outcome of [`remove_user_marketplace_config`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RemoveMarketplaceConfigOutcome {
    /// The marketplace entry was found and removed.
    Removed,
    /// No marketplace entry with that name exists in the config.
    NotFound,
    /// An entry exists but its name differs in case from the requested name.
    NameCaseMismatch { configured_name: String },
}

/// Write or update a `[marketplaces.<name>]` section in
/// `<agiworkforce_home>/config.toml`.
pub fn record_user_marketplace(
    agiworkforce_home: &Path,
    name: &str,
    update: &MarketplaceConfigUpdate<'_>,
) -> Result<(), io::Error> {
    let config_path = agiworkforce_home.join(CONFIG_TOML_FILE);
    let existing = match std::fs::read_to_string(&config_path) {
        Ok(s) => s,
        Err(e) if e.kind() == io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(e),
    };

    let mut doc: DocumentMut = existing
        .parse()
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

    // Ensure `[marketplaces]` exists as a table.
    if doc.get("marketplaces").is_none() {
        doc["marketplaces"] = Item::Table(Table::new());
    }

    // Build the sub-table for this marketplace entry.
    let mut entry = Table::new();
    entry.insert("last_updated", toml_edit::value(update.last_updated));
    if let Some(rev) = update.last_revision {
        entry.insert("last_revision", toml_edit::value(rev));
    }
    entry.insert("source_type", toml_edit::value(update.source_type));
    entry.insert("source", toml_edit::value(update.source));
    if let Some(r) = update.ref_name {
        entry.insert("ref", toml_edit::value(r));
    }
    if !update.sparse_paths.is_empty() {
        let arr: toml_edit::Array = update
            .sparse_paths
            .iter()
            .map(|p| toml_edit::Value::from(p.as_str()))
            .collect();
        entry.insert("sparse_paths", Item::Value(toml_edit::Value::Array(arr)));
    }

    doc["marketplaces"][name] = Item::Table(entry);

    std::fs::write(&config_path, doc.to_string())
}

/// Remove a `[marketplaces.<name>]` entry from
/// `<agiworkforce_home>/config.toml`.
pub fn remove_user_marketplace_config(
    agiworkforce_home: &Path,
    name: &str,
) -> Result<RemoveMarketplaceConfigOutcome, io::Error> {
    let config_path = agiworkforce_home.join(CONFIG_TOML_FILE);
    let contents = match std::fs::read_to_string(&config_path) {
        Ok(s) => s,
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            return Ok(RemoveMarketplaceConfigOutcome::NotFound);
        }
        Err(e) => return Err(e),
    };

    let mut doc: DocumentMut = contents
        .parse()
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

    let Some(marketplaces) = doc.get_mut("marketplaces").and_then(|v| v.as_table_mut()) else {
        return Ok(RemoveMarketplaceConfigOutcome::NotFound);
    };

    // Exact-match removal.
    if marketplaces.contains_key(name) {
        marketplaces.remove(name);
        std::fs::write(&config_path, doc.to_string())?;
        return Ok(RemoveMarketplaceConfigOutcome::Removed);
    }

    // Case-insensitive fallback to detect name mismatches.
    let name_lower = name.to_lowercase();
    let case_match = marketplaces
        .iter()
        .find(|(k, _)| k.to_lowercase() == name_lower)
        .map(|(k, _)| k.to_string());

    if let Some(configured_name) = case_match {
        return Ok(RemoveMarketplaceConfigOutcome::NameCaseMismatch { configured_name });
    }

    Ok(RemoveMarketplaceConfigOutcome::NotFound)
}
