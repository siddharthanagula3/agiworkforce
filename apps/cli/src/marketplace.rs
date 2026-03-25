//! Plugin marketplace registry — search, install, uninstall, and update plugins.
//!
//! The remote registry at `registry.agiworkforce.com` is future-proofed;
//! `search()` degrades gracefully to an empty list when the registry is
//! unreachable.  Primary install methods are local path and git URL.
//!
//! Installed plugins are tracked in `~/.agiworkforce/plugins/installed.json`
//! (the same file used by [`crate::plugins::InstalledPlugins`]).

use anyhow::{bail, Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::plugins::{InstalledPluginEntry, InstalledPlugins};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_REGISTRY_URL: &str = "https://registry.agiworkforce.com/plugins/v1";
const CACHE_DIR: &str = "cache";

// ---------------------------------------------------------------------------
// Registry types
// ---------------------------------------------------------------------------

/// A plugin listed in the remote marketplace registry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplacePlugin {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub download_url: Option<String>,
    #[serde(default)]
    pub repository: Option<String>,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub keywords: Vec<String>,
}

/// Wrapper for the remote registry JSON response.
#[derive(Debug, Deserialize)]
struct RegistryResponse {
    #[serde(default)]
    plugins: Vec<MarketplacePlugin>,
}

// ---------------------------------------------------------------------------
// Marketplace client
// ---------------------------------------------------------------------------

/// Client for the AGI Workforce plugin marketplace.
pub struct Marketplace {
    registry_url: String,
}

impl Marketplace {
    pub fn new() -> Self {
        Self {
            registry_url: DEFAULT_REGISTRY_URL.to_string(),
        }
    }

    /// Create a marketplace client with a custom registry URL.
    #[allow(dead_code)]
    pub fn with_url(url: &str) -> Self {
        Self {
            registry_url: url.to_string(),
        }
    }

    // -----------------------------------------------------------------------
    // Search
    // -----------------------------------------------------------------------

    /// Search the remote marketplace.
    ///
    /// Tries an HTTP GET to the registry. If the registry is unreachable or
    /// returns an error, returns an empty list instead of failing.
    pub async fn search(&self, query: &str) -> Result<Vec<MarketplacePlugin>> {
        let url = format!("{}/search?q={}", self.registry_url, urlencoded(query));

        let result = reqwest::Client::new()
            .get(&url)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await;

        match result {
            Ok(resp) if resp.status().is_success() => {
                let body = resp.text().await.unwrap_or_default();
                match serde_json::from_str::<RegistryResponse>(&body) {
                    Ok(registry) => Ok(registry.plugins),
                    Err(_) => {
                        // Try alternate format: bare array
                        match serde_json::from_str::<Vec<MarketplacePlugin>>(&body) {
                            Ok(plugins) => Ok(plugins),
                            Err(_) => Ok(Vec::new()),
                        }
                    }
                }
            }
            Ok(resp) => {
                eprintln!(
                    "Marketplace search returned HTTP {}: results may be incomplete.",
                    resp.status()
                );
                Ok(Vec::new())
            }
            Err(_) => {
                // Registry unreachable — graceful degradation
                Ok(Vec::new())
            }
        }
    }

    // -----------------------------------------------------------------------
    // Install
    // -----------------------------------------------------------------------

    /// Install a plugin from a local path or git URL.
    ///
    /// - Local path: copies the directory into `~/.agiworkforce/plugins/<name>/`
    /// - Git URL: clones (shallow) into `~/.agiworkforce/plugins/cache/<name>/`
    ///   then symlinks or copies into the plugins root.
    ///
    /// The `scope` parameter records the installation scope in installed.json
    /// (one of `"user"`, `"project"`, `"local"`).
    pub async fn install(&self, source: &str, home: &Path, scope: &str) -> Result<()> {
        let plugins_dir = home.join("plugins");
        std::fs::create_dir_all(&plugins_dir)
            .context("failed to create plugins directory")?;

        let name = derive_plugin_name(source);

        // Check if already installed
        let registry = InstalledPlugins::load(&plugins_dir);
        if registry.plugins.contains_key(&name) {
            let existing = &registry.plugins[&name];
            eprintln!(
                "Plugin '{}' is already installed at {}",
                name, existing.install_path
            );
            return Ok(());
        }

        let install_path = if is_git_url(source) {
            self.install_from_git(source, &name, &plugins_dir)?
        } else {
            self.install_from_path(source, &name, &plugins_dir)?
        };

        // Record in installed.json
        let mut reg = InstalledPlugins::load(&plugins_dir);
        reg.plugins.insert(
            name.clone(),
            InstalledPluginEntry {
                scope: scope.to_string(),
                install_path: install_path.to_string_lossy().to_string(),
                version: "1.0.0".to_string(),
                installed_at: Utc::now(),
            },
        );
        reg.save(&plugins_dir)?;

        eprintln!("Installed '{}' to {}", name, install_path.display());
        Ok(())
    }

    /// Clone a git repository into the plugin cache and copy to plugins root.
    fn install_from_git(
        &self,
        url: &str,
        name: &str,
        plugins_dir: &Path,
    ) -> Result<PathBuf> {
        let cache_dir = plugins_dir.join(CACHE_DIR);
        std::fs::create_dir_all(&cache_dir)?;

        let cache_target = cache_dir.join(name);

        // Clean up any stale cache entry
        if cache_target.exists() {
            std::fs::remove_dir_all(&cache_target)
                .context("failed to remove stale cache entry")?;
        }

        // Shallow clone
        let output = std::process::Command::new("git")
            .arg("clone")
            .arg("--depth")
            .arg("1")
            .arg(url)
            .arg(&cache_target)
            .output()
            .context("failed to run git clone — is git installed?")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            bail!("git clone failed: {}", stderr.trim());
        }

        // Copy from cache to plugins root
        let final_target = plugins_dir.join(name);
        if final_target.exists() {
            std::fs::remove_dir_all(&final_target)?;
        }
        copy_dir(&cache_target, &final_target)?;

        Ok(final_target)
    }

    /// Copy a local directory into the plugins root.
    fn install_from_path(
        &self,
        source: &str,
        name: &str,
        plugins_dir: &Path,
    ) -> Result<PathBuf> {
        let src = Path::new(source);
        if !src.exists() {
            bail!("source path does not exist: {}", source);
        }
        if !src.is_dir() {
            bail!("source path is not a directory: {}", source);
        }

        let target = plugins_dir.join(name);
        if target.exists() {
            bail!(
                "target directory already exists: {} — remove it first",
                target.display()
            );
        }

        copy_dir(src, &target)?;
        Ok(target)
    }

    // -----------------------------------------------------------------------
    // Uninstall
    // -----------------------------------------------------------------------

    /// Uninstall a plugin by name.
    ///
    /// Removes the plugin directory and its cache entry, then updates
    /// installed.json.
    pub fn uninstall(&self, name: &str, home: &Path) -> Result<()> {
        let plugins_dir = home.join("plugins");
        let mut registry = InstalledPlugins::load(&plugins_dir);

        if !registry.plugins.contains_key(name) {
            bail!("plugin '{}' is not installed", name);
        }

        // Remove the plugin directory
        let entry = &registry.plugins[name];
        let install_path = PathBuf::from(&entry.install_path);
        if install_path.exists() {
            std::fs::remove_dir_all(&install_path)
                .context(format!("failed to remove plugin directory: {}", install_path.display()))?;
        }

        // Remove cache entry if it exists
        let cache_path = plugins_dir.join(CACHE_DIR).join(name);
        if cache_path.exists() {
            let _ = std::fs::remove_dir_all(&cache_path);
        }

        // Update registry
        registry.plugins.remove(name);
        registry.save(&plugins_dir)?;

        eprintln!("Uninstalled plugin '{}'", name);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // List installed
    // -----------------------------------------------------------------------

    /// List all installed plugins from installed.json.
    pub fn list_installed(home: &Path) -> InstalledPlugins {
        let plugins_dir = home.join("plugins");
        InstalledPlugins::load(&plugins_dir)
    }

    // -----------------------------------------------------------------------
    // Update
    // -----------------------------------------------------------------------

    /// Update all git-installed plugins by re-cloning from their repositories.
    ///
    /// Local-path plugins are skipped (no remote to pull from).
    pub async fn update_all(&self, home: &Path) -> Result<()> {
        let plugins_dir = home.join("plugins");
        let registry = InstalledPlugins::load(&plugins_dir);

        if registry.plugins.is_empty() {
            eprintln!("No plugins installed.");
            return Ok(());
        }

        let mut updated = 0u32;
        let mut skipped = 0u32;

        for (name, entry) in &registry.plugins {
            let install_path = PathBuf::from(&entry.install_path);

            // Check if this was a git clone by looking for .git directory
            let is_git = install_path.join(".git").exists()
                || plugins_dir.join(CACHE_DIR).join(name).join(".git").exists();

            if !is_git {
                skipped += 1;
                continue;
            }

            // Try git pull in the install directory
            let output = std::process::Command::new("git")
                .arg("-C")
                .arg(&install_path)
                .arg("pull")
                .arg("--ff-only")
                .output();

            match output {
                Ok(o) if o.status.success() => {
                    let stdout = String::from_utf8_lossy(&o.stdout);
                    if stdout.contains("Already up to date") {
                        eprintln!("  {} — already up to date", name);
                    } else {
                        eprintln!("  {} — updated", name);
                    }
                    updated += 1;
                }
                Ok(o) => {
                    let stderr = String::from_utf8_lossy(&o.stderr);
                    eprintln!("  {} — update failed: {}", name, stderr.trim());
                }
                Err(e) => {
                    eprintln!("  {} — git error: {}", name, e);
                }
            }
        }

        eprintln!(
            "\n{} updated, {} skipped (local installs).",
            updated, skipped
        );
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/// Format installed plugins for display.
pub fn format_installed(registry: &InstalledPlugins) -> String {
    if registry.plugins.is_empty() {
        return "No plugins installed.\n\nInstall with:\n  agiworkforce plugin install <path-or-git-url>"
            .to_string();
    }

    let mut out = String::new();
    for (name, entry) in &registry.plugins {
        out.push_str(&format!(
            "  {:<25} v{:<8} [{}]  {}\n",
            name, entry.version, entry.scope, entry.install_path,
        ));
    }
    out.push_str(&format!("\n{} plugin(s) installed.", registry.plugins.len()));
    out
}

/// Format marketplace search results for display.
pub fn format_search_results(plugins: &[MarketplacePlugin]) -> String {
    if plugins.is_empty() {
        return "No plugins found.\n\nThe marketplace registry may be offline. \
                Try installing directly:\n  agiworkforce plugin install <git-url>"
            .to_string();
    }

    let mut out = String::new();
    for p in plugins {
        let author = if p.author.is_empty() {
            "unknown".to_string()
        } else {
            p.author.clone()
        };
        out.push_str(&format!(
            "  {:<25} {} (by {}, v{})\n",
            p.name, p.description, author, p.version,
        ));
        if let Some(ref url) = p.repository {
            out.push_str(&format!("    {}\n", url));
        }
    }
    out.push_str(&format!("\n{} result(s).", plugins.len()));
    out
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Derive a plugin name from a source string (path or URL).
fn derive_plugin_name(source: &str) -> String {
    // Strip trailing slashes and .git suffix
    let cleaned = source
        .trim_end_matches('/')
        .trim_end_matches(".git");

    // Take the last path component
    cleaned
        .rsplit('/')
        .next()
        .unwrap_or("plugin")
        .to_string()
}

/// Check if a source string looks like a git URL.
fn is_git_url(source: &str) -> bool {
    source.starts_with("http://")
        || source.starts_with("https://")
        || source.starts_with("git://")
        || source.starts_with("git@")
        || source.ends_with(".git")
}

/// Minimal percent-encoding for query strings.
fn urlencoded(s: &str) -> String {
    s.replace(' ', "%20")
        .replace('&', "%26")
        .replace('=', "%3D")
        .replace('#', "%23")
}

/// Recursively copy a directory tree.
fn copy_dir(src: &Path, dst: &Path) -> Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let e = entry?;
        let d = dst.join(e.file_name());
        if e.path().is_dir() {
            copy_dir(&e.path(), &d)?;
        } else {
            std::fs::copy(e.path(), d)?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_derive_plugin_name_git_url() {
        assert_eq!(
            derive_plugin_name("https://github.com/user/my-plugin.git"),
            "my-plugin"
        );
    }

    #[test]
    fn test_derive_plugin_name_git_url_no_suffix() {
        assert_eq!(
            derive_plugin_name("https://github.com/user/my-plugin"),
            "my-plugin"
        );
    }

    #[test]
    fn test_derive_plugin_name_local_path() {
        assert_eq!(derive_plugin_name("/home/user/plugins/cool-tool"), "cool-tool");
    }

    #[test]
    fn test_derive_plugin_name_trailing_slash() {
        assert_eq!(
            derive_plugin_name("https://github.com/user/plugin/"),
            "plugin"
        );
    }

    #[test]
    fn test_is_git_url_https() {
        assert!(is_git_url("https://github.com/user/repo"));
    }

    #[test]
    fn test_is_git_url_http() {
        assert!(is_git_url("http://github.com/user/repo"));
    }

    #[test]
    fn test_is_git_url_git_protocol() {
        assert!(is_git_url("git://github.com/user/repo"));
    }

    #[test]
    fn test_is_git_url_ssh() {
        assert!(is_git_url("git@github.com:user/repo.git"));
    }

    #[test]
    fn test_is_git_url_local_path() {
        assert!(!is_git_url("/home/user/my-plugin"));
    }

    #[test]
    fn test_is_git_url_relative_path() {
        assert!(!is_git_url("./my-plugin"));
    }

    #[test]
    fn test_urlencoded_spaces() {
        assert_eq!(urlencoded("hello world"), "hello%20world");
    }

    #[test]
    fn test_urlencoded_special_chars() {
        assert_eq!(urlencoded("a&b=c#d"), "a%26b%3Dc%23d");
    }

    #[test]
    fn test_marketplace_new() {
        let m = Marketplace::new();
        assert_eq!(m.registry_url, DEFAULT_REGISTRY_URL);
    }

    #[test]
    fn test_marketplace_custom_url() {
        let m = Marketplace::with_url("https://custom.example.com/v1");
        assert_eq!(m.registry_url, "https://custom.example.com/v1");
    }

    #[test]
    fn test_format_installed_empty() {
        let reg = InstalledPlugins {
            version: 1,
            plugins: HashMap::new(),
        };
        let out = format_installed(&reg);
        assert!(out.contains("No plugins installed."));
    }

    #[test]
    fn test_format_installed_with_plugins() {
        let mut plugins = HashMap::new();
        plugins.insert(
            "test-plugin".to_string(),
            InstalledPluginEntry {
                scope: "user".to_string(),
                install_path: "/home/user/.agiworkforce/plugins/test-plugin".to_string(),
                version: "1.2.0".to_string(),
                installed_at: Utc::now(),
            },
        );
        let reg = InstalledPlugins {
            version: 1,
            plugins,
        };
        let out = format_installed(&reg);
        assert!(out.contains("test-plugin"));
        assert!(out.contains("1.2.0"));
        assert!(out.contains("[user]"));
        assert!(out.contains("1 plugin(s) installed."));
    }

    #[test]
    fn test_format_search_results_empty() {
        let out = format_search_results(&[]);
        assert!(out.contains("No plugins found."));
    }

    #[test]
    fn test_format_search_results_with_results() {
        let plugins = vec![MarketplacePlugin {
            name: "cool-plugin".to_string(),
            description: "Does cool things".to_string(),
            version: "2.0.0".to_string(),
            author: "Jane".to_string(),
            download_url: None,
            repository: Some("https://github.com/jane/cool-plugin".to_string()),
            category: "tools".to_string(),
            keywords: vec!["cool".to_string()],
        }];
        let out = format_search_results(&plugins);
        assert!(out.contains("cool-plugin"));
        assert!(out.contains("Does cool things"));
        assert!(out.contains("Jane"));
        assert!(out.contains("https://github.com/jane/cool-plugin"));
        assert!(out.contains("1 result(s)."));
    }

    #[test]
    fn test_list_installed_no_crash() {
        // Should not crash even with a nonexistent home dir
        let reg = Marketplace::list_installed(Path::new("/tmp/nonexistent-agiworkforce-test"));
        assert!(reg.plugins.is_empty());
    }

    #[tokio::test]
    async fn test_search_unreachable_registry() {
        // Search against a guaranteed-unreachable URL should return empty, not error
        let m = Marketplace::with_url("http://127.0.0.1:1");
        let results = m.search("test").await.unwrap();
        assert!(results.is_empty());
    }
}
