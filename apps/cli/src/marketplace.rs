//! Plugin marketplace registry, search, install, uninstall, and update plugins.
//!
//! The remote registry at `registry.agiworkforce.com` is future-proofed;
//! `search()` degrades gracefully to an empty list when the registry is
//! unreachable.  Primary install methods are local path and git URL.
//!
//! Installed plugins are tracked in `~/.agiworkforce/plugins/installed.json`.
//!
//! `agi plugin install`/`agi plugin list` (see `crate::plugins::PluginsManager`)
//! manage the *same* `~/.agiworkforce/plugins/` directory but historically did
//! not write `installed.json`, they discover plugins by scanning the
//! directory tree for manifests instead. To keep both command families
//! interoperating over one source of truth, [`InstalledPlugins::load`]
//! reconciles the registry against the plugins directory on every load: any
//! subdirectory with a recognized plugin manifest that isn't yet tracked is
//! adopted into the registry (and the reconciled registry is persisted back
//! to disk). This makes a plugin installed via either `agi plugin install`
//! or `agi marketplace install` visible and manageable via both.

use anyhow::{bail, Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Installed plugin tracking, shared source of truth with `crate::plugins`
// ---------------------------------------------------------------------------

/// A single installed plugin entry in `installed.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledPluginEntry {
    pub scope: String,
    pub install_path: String,
    pub version: String,
    pub installed_at: chrono::DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
    /// [`crate::plugins::plugin_content_sha256`] of the plugin as a person
    /// last agreed to it: when it was installed, and at each update they kept.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_sha256: Option<String>,
}

/// Registry of installed plugins, persisted as `plugins/installed.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledPlugins {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub plugins: HashMap<String, InstalledPluginEntry>,
}

fn default_version() -> u32 {
    1
}

impl Default for InstalledPlugins {
    fn default() -> Self {
        Self {
            version: 1,
            plugins: HashMap::new(),
        }
    }
}

impl InstalledPlugins {
    /// Load installed.json from the plugins directory, then reconcile it
    /// against the directory tree so plugins installed via `agi plugin
    /// install` (which writes straight to disk without touching
    /// installed.json) are picked up here too. The reconciled registry is
    /// persisted back to `installed.json` on a best-effort basis so the two
    /// command families converge on one file instead of drifting apart
    /// again on the next read.
    pub fn load(plugins_dir: &Path) -> Self {
        let path = plugins_dir.join("installed.json");
        let mut registry: Self = match std::fs::read_to_string(&path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
            Err(_) => Self::default(),
        };
        if reconcile_with_disk(plugins_dir, &mut registry) {
            let _ = registry.save(plugins_dir);
        }
        registry
    }

    /// Save installed.json to the plugins directory.
    pub fn save(&self, plugins_dir: &Path) -> Result<()> {
        let path = plugins_dir.join("installed.json");
        let contents = serde_json::to_string_pretty(self)?;
        std::fs::write(&path, contents)?;
        Ok(())
    }
}

/// Scan `plugins_dir` for subdirectories that carry a recognized plugin
/// manifest but are not yet tracked in `registry`, and adopt them. Returns
/// `true` if the registry was modified (caller should persist).
///
/// Only directories with a real manifest are adopted so stray/unrelated
/// directories (e.g. a future non-plugin cache dir) don't get captured as
/// phantom "installed" plugins.
fn reconcile_with_disk(plugins_dir: &Path, registry: &mut InstalledPlugins) -> bool {
    let Ok(entries) = std::fs::read_dir(plugins_dir) else {
        return false;
    };
    let mut changed = false;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name == CACHE_DIR || registry.plugins.contains_key(name) {
            continue;
        }
        if crate::plugins::load_manifest_for(&path).is_none() {
            // No recognized manifest, not a plugin directory we can adopt.
            continue;
        }
        registry.plugins.insert(
            name.to_string(),
            InstalledPluginEntry {
                scope: "user".to_string(),
                install_path: path.to_string_lossy().to_string(),
                version: read_manifest_version(&path),
                installed_at: Utc::now(),
                signature: None,
                content_sha256: crate::plugins::plugin_content_sha256(&path).ok(),
            },
        );
        changed = true;
    }
    changed
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_REGISTRY_URL: &str = "https://registry.agiworkforce.com/plugins/v1";
/// Placeholder URL used by `Marketplace::default()`, matches the v1.2.1 spec.
const MARKETPLACE_PLACEHOLDER_URL: &str = "https://marketplace.agiworkforce.com";
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

/// Top-level registry index document (v1.2.1 format).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplaceIndex {
    pub registry_version: String,
    pub plugins: Vec<MarketplacePlugin>,
}

// ---------------------------------------------------------------------------
// Marketplace client
// ---------------------------------------------------------------------------

/// Client for the AGI Workforce plugin marketplace.
pub struct Marketplace {
    pub registry_url: String,
    client: reqwest::Client,
}

impl Default for Marketplace {
    fn default() -> Self {
        Self::new(MARKETPLACE_PLACEHOLDER_URL)
    }
}

impl Marketplace {
    /// Create a client targeting `registry_url`.
    pub fn new(registry_url: impl Into<String>) -> Self {
        Self {
            registry_url: registry_url.into(),
            client: reqwest::Client::builder()
                .user_agent(concat!("agiworkforce-cli/", env!("CARGO_PKG_VERSION")))
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default(),
        }
    }

    /// Create a client pointing at the production registry URL.
    pub fn new_production() -> Self {
        Self::new(DEFAULT_REGISTRY_URL)
    }

    /// Create a marketplace client with a custom registry URL (compat alias).
    #[allow(dead_code)]
    pub fn with_url(url: &str) -> Self {
        Self::new(url)
    }

    /// Fetch and return the registry index document.
    pub async fn list_plugins(&self) -> Result<Vec<MarketplacePlugin>> {
        let url = format!("{}/registry.json", self.registry_url.trim_end_matches('/'));
        let resp = match self.client.get(&url).send().await {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[marketplace] registry unreachable: {e}");
                return Ok(Vec::new());
            }
        };
        if !resp.status().is_success() {
            eprintln!(
                "Marketplace list returned HTTP {}: results may be incomplete.",
                resp.status()
            );
            return Ok(Vec::new());
        }
        let index: MarketplaceIndex = resp.json().await.context("parse registry.json")?;
        Ok(index.plugins)
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

        let result = self.client.get(&url).send().await;

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
            Err(e) => {
                eprintln!("[marketplace] registry unreachable: {e}");
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
    pub async fn install(
        &self,
        source: &str,
        home: &Path,
        scope: &str,
        signature: &crate::plugins::PluginSignaturePolicy,
    ) -> Result<()> {
        let plugins_dir = home.join("plugins");
        std::fs::create_dir_all(&plugins_dir).context("failed to create plugins directory")?;

        let name = derive_plugin_name(source);
        // `name` is joined onto `plugins_dir` and the cache dir below; a
        // segment like ".." would resolve those joins onto the CLI config root
        // and hand `remove_dir_all` the user's credentials directory.
        if let Err(error) = crate::plugins::validate_plugin_name(&name) {
            bail!(
                "refusing to install '{source}': derived plugin name '{name}' is unsafe: {error}"
            );
        }

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

        let signature_state =
            match crate::plugins::evaluate_plugin_signature(&install_path, signature) {
                Ok(state) => state,
                Err(error) => {
                    let _ = std::fs::remove_dir_all(&install_path);
                    bail!("refusing to install '{name}': {error}");
                }
            };

        // Read the real version from the plugin's manifest. Falling back to
        // "0.0.0" (unknown) rather than a fake "1.0.0" makes a missing/invalid
        // manifest version visible instead of pretending every plugin is 1.0.0.
        let version = read_manifest_version(&install_path);
        let _ = std::fs::remove_file(crate::plugins::pending_update_marker(&plugins_dir, &name));

        // Record in installed.json
        let mut reg = InstalledPlugins::load(&plugins_dir);
        reg.plugins.insert(
            name.clone(),
            InstalledPluginEntry {
                scope: scope.to_string(),
                install_path: install_path.to_string_lossy().to_string(),
                version,
                installed_at: Utc::now(),
                signature: Some(signature_state.label()),
                content_sha256: crate::plugins::plugin_content_sha256(&install_path).ok(),
            },
        );
        reg.save(&plugins_dir)?;

        eprintln!(
            "Installed '{}' to {} ({})",
            crate::terminal_text::sanitize_terminal_text(&name),
            install_path.display(),
            crate::terminal_text::sanitize_terminal_text(&signature_state.label())
        );
        Ok(())
    }

    /// Clone a git repository into the plugin cache and copy to plugins root.
    fn install_from_git(&self, url: &str, name: &str, plugins_dir: &Path) -> Result<PathBuf> {
        // Validate the clone source before it ever reaches git's argv. Without
        // this a caller-supplied "URL" beginning with `-` (e.g.
        // `--upload-pack=...`) would be parsed by git as an option rather than
        // a remote (argument injection), and an unexpected scheme (file://,
        // ext::, ssh helper tricks) could pull from an unintended source.
        validate_git_clone_url(url)?;

        let cache_dir = plugins_dir.join(CACHE_DIR);
        std::fs::create_dir_all(&cache_dir)?;

        let cache_target = cache_dir.join(name);
        ensure_within(&cache_dir, &cache_target)?;

        // Clean up any stale cache entry
        if cache_target.exists() {
            std::fs::remove_dir_all(&cache_target).context("failed to remove stale cache entry")?;
        }

        // Shallow clone. `--` terminates option parsing so neither the URL nor
        // the target path can be reinterpreted as a git option.
        let mut clone = agiworkforce_worktree::host_git();
        clone
            .arg("clone")
            .arg("--depth")
            .arg("1")
            .arg("--")
            .arg(url)
            .arg(&cache_target);
        let output = crate::platform::runtime::git::host_git_network_output(clone)
            .map_err(|error| {
                anyhow::anyhow!(crate::platform::runtime::git::host_git_failure(&error))
            })
            .context("failed to run git clone, is git installed?")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            bail!("git clone failed: {}", stderr.trim());
        }

        // Copy from cache to plugins root
        let final_target = plugins_dir.join(name);
        ensure_within(plugins_dir, &final_target)?;
        if final_target.exists() {
            std::fs::remove_dir_all(&final_target)?;
        }
        copy_dir(&cache_target, &final_target)?;

        Ok(final_target)
    }

    /// Copy a local directory into the plugins root.
    fn install_from_path(&self, source: &str, name: &str, plugins_dir: &Path) -> Result<PathBuf> {
        let src = Path::new(source);
        if !src.exists() {
            bail!("source path does not exist: {}", source);
        }
        if !src.is_dir() {
            bail!("source path is not a directory: {}", source);
        }

        let target = plugins_dir.join(name);
        ensure_within(plugins_dir, &target)?;
        if target.exists() {
            bail!(
                "target directory already exists: {}, remove it first",
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
        ensure_within(&plugins_dir, &install_path)?;
        if install_path.exists() {
            std::fs::remove_dir_all(&install_path).context(format!(
                "failed to remove plugin directory: {}",
                install_path.display()
            ))?;
        }

        // Remove cache entry if it exists
        let cache_dir = plugins_dir.join(CACHE_DIR);
        let cache_path = cache_dir.join(name);
        ensure_within(&cache_dir, &cache_path)?;
        if cache_path.exists() {
            let _ = std::fs::remove_dir_all(&cache_path);
        }

        let _ = std::fs::remove_file(crate::plugins::pending_update_marker(&plugins_dir, name));

        // Update registry
        registry.plugins.remove(name);
        registry.save(&plugins_dir)?;

        eprintln!(
            "Uninstalled plugin '{}'",
            crate::terminal_text::sanitize_terminal_text(name)
        );
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

    /// Update every git-installed plugin by pulling its repository.
    ///
    /// A pull that changed anything is kept only when the person at the
    /// terminal agrees to it, after seeing the files it changed and every
    /// hook, MCP server, skill, command and agent it adds or changes. A run
    /// that cannot ask keeps nothing. From before the pull until that answer
    /// the plugin is off ([`crate::plugins::pending_update_marker`]), so a
    /// run that ends at the question never leaves an update in use. Local-path
    /// plugins are skipped (no remote to pull from).
    pub async fn update_all(
        &self,
        home: &Path,
        signature: &crate::plugins::PluginSignaturePolicy,
    ) -> Result<()> {
        self.update_all_with(home, signature, &mut ask_to_keep_update)
    }

    /// [`Self::update_all`] with the decision supplied: `keep` is shown each
    /// pulled update and answers whether it stays.
    fn update_all_with(
        &self,
        home: &Path,
        signature: &crate::plugins::PluginSignaturePolicy,
        keep: &mut dyn FnMut(&PluginUpdateReview) -> bool,
    ) -> Result<()> {
        let plugins_dir = home.join("plugins");
        let mut registry = InstalledPlugins::load(&plugins_dir);

        if registry.plugins.is_empty() {
            eprintln!("No plugins installed.");
            return Ok(());
        }

        let mut updated = 0u32;
        let mut not_kept = 0u32;
        let mut skipped = 0u32;
        // What each kept update leaves on record: the version, the signature
        // and the content digest the person agreed to.
        let mut kept: Vec<(String, String, String, String)> = Vec::new();

        for (name, entry) in &registry.plugins {
            let install_path = PathBuf::from(&entry.install_path);
            if !is_git_checkout(&install_path)
                && !plugins_dir.join(CACHE_DIR).join(name).join(".git").exists()
            {
                skipped += 1;
                continue;
            }

            // An update an earlier run pulled and never decided is still on
            // disk: the marker names the commit to go back to, and what the
            // plugin held then is no longer there to compare with.
            let marker = crate::plugins::pending_update_marker(&plugins_dir, name);
            let undecided = marker.exists();
            if !undecided {
                if let Some(pinned) = pinned_at(&install_path) {
                    eprintln!(
                        "  {}, pinned to {}; install it again with --ref <tag> to move it",
                        crate::terminal_text::sanitize_terminal_text(name),
                        crate::terminal_text::sanitize_terminal_text(&pinned)
                    );
                    continue;
                }
            }
            let approved_commit = if undecided {
                std::fs::read_to_string(&marker)
                    .ok()
                    .map(|commit| commit.trim().to_string())
                    .filter(|commit| is_commit_id(commit))
            } else {
                head_commit(&install_path)
            };
            let agreed_to = if undecided {
                std::collections::BTreeSet::new()
            } else {
                let held_off = approved_commit
                    .as_deref()
                    .ok_or_else(|| "its current commit could not be read".to_string())
                    .and_then(|commit| {
                        std::fs::write(&marker, commit).map_err(|error| {
                            format!("it could not be held off while updating: {error}")
                        })
                    });
                if let Err(reason) = held_off {
                    eprintln!(
                        "  {}, not updated: {}",
                        crate::terminal_text::sanitize_terminal_text(name),
                        crate::terminal_text::sanitize_terminal_text(&reason)
                    );
                    continue;
                }
                crate::plugins::plugin_capabilities(&install_path)
            };
            let undo = |reason: &str| {
                undo_update(
                    name,
                    &install_path,
                    approved_commit.as_deref(),
                    &marker,
                    reason,
                )
            };
            // A pull that changed nothing leaves nothing to decide, unless an
            // earlier one did.
            let nothing_pulled = || {
                if !undecided {
                    let _ = std::fs::remove_file(&marker);
                }
            };

            // Try git pull in the install directory
            let mut pull = agiworkforce_worktree::host_git();
            pull.arg("-C")
                .arg(&install_path)
                .arg("pull")
                .arg("--ff-only");
            let output = crate::platform::runtime::git::host_git_network_output(pull);

            match output {
                Ok(o) if o.status.success() => {
                    if !undecided && head_commit(&install_path) == approved_commit {
                        nothing_pulled();
                        eprintln!(
                            "  {}, already up to date",
                            crate::terminal_text::sanitize_terminal_text(name)
                        );
                        continue;
                    }
                    let signature_state =
                        match crate::plugins::evaluate_plugin_signature(&install_path, signature) {
                            Ok(state) => state,
                            Err(error) => {
                                undo(error.as_str());
                                not_kept += 1;
                                continue;
                            }
                        };
                    let sha256 = match crate::plugins::plugin_content_sha256(&install_path) {
                        Ok(sha256) => sha256,
                        Err(error) => {
                            undo(format!("its files could not be read: {error}").as_str());
                            not_kept += 1;
                            continue;
                        }
                    };
                    let review = PluginUpdateReview {
                        name: name.clone(),
                        previous_version: entry.version.clone(),
                        version: read_manifest_version(&install_path),
                        signature: signature_state.label(),
                        changed_files: approved_commit
                            .as_deref()
                            .map(|commit| changed_files_since(&install_path, commit))
                            .unwrap_or_default(),
                        unapproved: crate::plugins::unapproved_capabilities(
                            &agreed_to,
                            &crate::plugins::plugin_capabilities(&install_path),
                        ),
                        approved_sha256: entry.content_sha256.clone(),
                        sha256,
                    };
                    if !keep(&review) {
                        undo("it was not approved");
                        not_kept += 1;
                        continue;
                    }
                    let _ = std::fs::remove_file(&marker);
                    eprintln!(
                        "  {}",
                        crate::terminal_text::sanitize_terminal_text(&describe_plugin_update(
                            name,
                            &review.previous_version,
                            &review.version,
                            &[],
                        ))
                    );
                    kept.push((
                        name.clone(),
                        review.version,
                        review.signature,
                        review.sha256,
                    ));
                    updated += 1;
                }
                Ok(o) => {
                    nothing_pulled();
                    let stderr = String::from_utf8_lossy(&o.stderr);
                    eprintln!(
                        "  {}, update failed: {}",
                        crate::terminal_text::sanitize_terminal_text(name),
                        crate::terminal_text::sanitize_terminal_text(stderr.trim())
                    );
                }
                Err(e) => {
                    nothing_pulled();
                    eprintln!(
                        "  {}, git error: {}",
                        crate::terminal_text::sanitize_terminal_text(name),
                        crate::terminal_text::sanitize_terminal_text(&e.to_string())
                    );
                }
            }
        }

        if !kept.is_empty() {
            for (name, version, signature_label, sha256) in kept {
                if let Some(entry) = registry.plugins.get_mut(&name) {
                    entry.version = version;
                    entry.signature = Some(signature_label);
                    entry.content_sha256 = Some(sha256);
                }
            }
            registry.save(&plugins_dir)?;
        }

        eprintln!(
            "\n{} updated, {} not kept, {} skipped (local installs).",
            updated, not_kept, skipped
        );
        Ok(())
    }
}

pub enum PluginCheckoutUpdate {
    UpToDate,
    Updated {
        version: String,
        changed_files: Vec<String>,
        signature: String,
    },
}

pub fn is_git_checkout(install_path: &Path) -> bool {
    install_path.join(".git").exists()
}

pub fn update_plugin_checkout(
    install_path: &Path,
    signature: &crate::plugins::PluginSignaturePolicy,
) -> std::result::Result<PluginCheckoutUpdate, String> {
    if let Some(pinned) = pinned_at(install_path) {
        return Err(format!(
            "pinned to {pinned}; install it again with --ref <tag> to move it"
        ));
    }
    let before = head_commit(install_path);
    let mut pull = agiworkforce_worktree::host_git();
    pull.arg("-C").arg(install_path).args(["pull", "--ff-only"]);
    let output = crate::platform::runtime::git::host_git_network_output(pull)
        .map_err(|error| format!("git error: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "update failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    if before.is_some() && before == head_commit(install_path) {
        return Ok(PluginCheckoutUpdate::UpToDate);
    }
    match crate::plugins::evaluate_plugin_signature(install_path, signature) {
        Ok(state) => Ok(PluginCheckoutUpdate::Updated {
            version: read_manifest_version(install_path),
            changed_files: changed_files_since(install_path, "ORIG_HEAD"),
            signature: state.label(),
        }),
        Err(error) => {
            let mut rollback = agiworkforce_worktree::host_git();
            rollback
                .arg("-C")
                .arg(install_path)
                .args(["reset", "--hard", "ORIG_HEAD"]);
            let rolled_back = matches!(
                crate::platform::runtime::git::host_git_output(rollback),
                Ok(ref out) if out.status.success()
            );
            Err(format!(
                "update refused ({error}){}",
                if rolled_back {
                    ", kept the previous version"
                } else {
                    ", rollback failed: remove the plugin"
                }
            ))
        }
    }
}

fn pinned_at(install_path: &Path) -> Option<String> {
    let mut on_branch = agiworkforce_worktree::host_git();
    on_branch
        .arg("-C")
        .arg(install_path)
        .args(["symbolic-ref", "-q", "HEAD"]);
    if crate::platform::runtime::git::host_git_output(on_branch)
        .is_ok_and(|output| output.status.success())
    {
        return None;
    }
    let mut describe = agiworkforce_worktree::host_git();
    describe
        .arg("-C")
        .arg(install_path)
        .args(["describe", "--tags", "--always"]);
    Some(
        crate::platform::runtime::git::host_git_output(describe)
            .ok()
            .filter(|output| output.status.success())
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
            .unwrap_or_else(|| "a fixed version".to_string()),
    )
}

/// What a pulled update holds, for the person deciding whether it stays.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PluginUpdateReview {
    pub name: String,
    pub previous_version: String,
    pub version: String,
    pub signature: String,
    pub changed_files: Vec<String>,
    /// Every hook, MCP server, skill, command and agent the update adds or
    /// changes, as [`crate::plugins::unapproved_capabilities`] names them.
    pub unapproved: Vec<String>,
    /// The content digest on record from the install or the last kept update.
    pub approved_sha256: Option<String>,
    pub sha256: String,
}

pub fn describe_plugin_review(review: &PluginUpdateReview) -> String {
    let mut out = if review.previous_version == review.version {
        format!(
            "{}, update pulled (still v{}, {})",
            review.name, review.version, review.signature
        )
    } else {
        format!(
            "{}, update pulled v{} -> v{} ({})",
            review.name, review.previous_version, review.version, review.signature
        )
    };
    if !review.changed_files.is_empty() {
        out.push_str(&format!(
            "\n      {} file(s) changed:",
            review.changed_files.len()
        ));
        for change in &review.changed_files {
            out.push_str("\n        ");
            out.push_str(change);
        }
    }
    if review.unapproved.is_empty() {
        out.push_str("\n      It adds or changes no hook, MCP server, skill, command or agent.");
    } else {
        out.push_str("\n      Not agreed to yet, and not in use unless this update is kept:");
        for capability in &review.unapproved {
            out.push_str("\n        ");
            out.push_str(capability);
        }
    }
    out.push_str(&format!("\n      content sha256:{}", review.sha256));
    if let Some(approved) = &review.approved_sha256 {
        out.push_str(&format!(" (last agreed to: sha256:{approved})"));
    }
    out
}

fn ask_to_keep_update(review: &PluginUpdateReview) -> bool {
    eprintln!(
        "  {}",
        crate::terminal_text::sanitize_terminal_text(&describe_plugin_review(review))
    );
    if !crate::interactive::can_prompt() {
        eprintln!(
            "      This run cannot ask, so the update is not kept. \
             Run `agi marketplace update` in a terminal to review it."
        );
        return false;
    }
    dialoguer::Confirm::new()
        .with_prompt(format!(
            "Keep this update to {}?",
            crate::terminal_text::sanitize_terminal_text(&review.name)
        ))
        .default(false)
        .interact()
        .unwrap_or(false)
}

/// Put a plugin back on the commit the person last agreed to and let it
/// load again. When that cannot be done the marker stays, and with it the
/// plugin stays off: what is on disk is something nobody agreed to.
fn undo_update(
    name: &str,
    install_path: &Path,
    approved_commit: Option<&str>,
    marker: &Path,
    reason: &str,
) {
    let put_back = approved_commit.is_some_and(|commit| {
        let mut reset = agiworkforce_worktree::host_git();
        reset
            .arg("-C")
            .arg(install_path)
            .args(["reset", "--hard", commit]);
        matches!(
            crate::platform::runtime::git::host_git_output(reset),
            Ok(ref out) if out.status.success()
        )
    });
    let outcome = if put_back && std::fs::remove_file(marker).is_ok() {
        ", kept the previous version"
    } else {
        ", and it could not be put back: the plugin stays off until it is updated or reinstalled"
    };
    eprintln!(
        "  {}, update refused ({}){}",
        crate::terminal_text::sanitize_terminal_text(name),
        crate::terminal_text::sanitize_terminal_text(reason),
        outcome
    );
}

fn is_commit_id(text: &str) -> bool {
    matches!(text.len(), 40 | 64) && text.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn head_commit(install_path: &Path) -> Option<String> {
    let mut command = agiworkforce_worktree::host_git();
    command
        .arg("-C")
        .arg(install_path)
        .args(["rev-parse", "--verify", "HEAD"]);
    let output = crate::platform::runtime::git::host_git_output(command).ok()?;
    let commit = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (output.status.success() && is_commit_id(&commit)).then_some(commit)
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/// Format installed plugins for display.
pub fn format_installed(registry: &InstalledPlugins) -> String {
    if registry.plugins.is_empty() {
        return "No plugins installed.\n\nInstall with:\n  agi plugin install <path-or-git-url>"
            .to_string();
    }

    let mut out = String::new();
    for (name, entry) in &registry.plugins {
        out.push_str(&format!(
            "  {:<25} v{:<8} [{}] [{}]  {}\n",
            name,
            entry.version,
            entry.scope,
            entry
                .signature
                .as_deref()
                .unwrap_or("signature not checked"),
            entry.install_path,
        ));
    }
    out.push_str(&format!(
        "\n{} plugin(s) installed.",
        registry.plugins.len()
    ));
    out
}

/// Format marketplace search results for display.
pub fn format_search_results(plugins: &[MarketplacePlugin]) -> String {
    if plugins.is_empty() {
        return "No plugins found.\n\nThe marketplace registry may be offline. \
                Try installing directly:\n  agi plugin install <git-url>"
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

/// Read the plugin's declared version from its installed manifest.
///
/// Returns the manifest `version` field when present, or `"0.0.0"` (unknown)
/// when the plugin has no manifest or omits a version. This is recorded in
/// `installed.json` so `format_installed` and update/compatibility logic
/// reflect the real version rather than a hardcoded placeholder.
fn changed_files_since(install_path: &Path, commit: &str) -> Vec<String> {
    let mut command = agiworkforce_worktree::host_git();
    command
        .arg("-C")
        .arg(install_path)
        .args(["diff", "--name-status", commit, "HEAD"]);
    crate::platform::runtime::git::host_git_output(command)
        .ok()
        .filter(|out| out.status.success())
        .map(|out| {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
                .filter(|line| !line.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

pub fn describe_plugin_update(
    name: &str,
    previous_version: &str,
    current_version: &str,
    changed_files: &[String],
) -> String {
    let version = if previous_version == current_version {
        format!("{name}, updated (still v{current_version})")
    } else {
        format!("{name}, updated v{previous_version} -> v{current_version}")
    };
    if changed_files.is_empty() {
        return version;
    }
    let mut out = format!("{version}, {} file(s) changed:", changed_files.len());
    for change in changed_files {
        out.push_str("\n      ");
        out.push_str(change);
    }
    out
}

fn read_manifest_version(install_path: &Path) -> String {
    crate::plugins::load_manifest_for(install_path)
        .and_then(|(manifest, _format)| manifest.version)
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "0.0.0".to_string())
}

/// Derive a plugin name from a source string (path or URL).
fn derive_plugin_name(source: &str) -> String {
    // Strip trailing separators and .git suffix
    let cleaned = source
        .trim_end_matches(['/', '\\'])
        .trim_end_matches(".git");

    // Take the last path component
    cleaned
        .rsplit(['/', '\\'])
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

/// Reject a plugin path that does not stay strictly inside `root`.
///
/// `Path::starts_with` is purely lexical, so `root/..` still "starts with"
/// `root`; the relative components are what has to be checked.
fn ensure_within(root: &Path, target: &Path) -> Result<()> {
    let contained = target.strip_prefix(root).is_ok_and(|rel| {
        rel.components()
            .all(|c| matches!(c, std::path::Component::Normal(_)))
    });
    if !contained {
        bail!(
            "refusing plugin path outside {}: {}",
            root.display(),
            target.display()
        );
    }
    Ok(())
}

/// Validate a clone source before it is handed to `git clone`.
///
/// Rejects argument-injection (`-`-prefixed sources or hosts git would treat as
/// an option), confines the source to an allowlist of safe transports
/// (`https://`, `http://`, `git://`, `ssh://`, and `git@host:path` SSH
/// shorthand), and rejects credentials embedded in the authority, which would
/// otherwise be readable in the process table for the length of the clone.
/// Local-path transports git understands implicitly, `file://`, plain
/// filesystem paths, and the `ext::`/`fd::` helper transports that can run
/// arbitrary commands, are not accepted here; local plugins install via
/// [`install_from_path`](Marketplace::install_from_path) instead.
pub(crate) fn validate_git_clone_url(url: &str) -> Result<()> {
    const ALLOWED: &str = "only https://, http://, git://, ssh://, and git@host:path are allowed";
    if url.starts_with('-') {
        bail!("refusing git source that begins with '-' (argument injection): {url}");
    }
    let (scheme, authority) = match url.split_once("://") {
        Some((scheme, rest)) => (
            scheme.to_ascii_lowercase(),
            rest.split(['/', '?', '#']).next().unwrap_or_default(),
        ),
        None => {
            if !url.starts_with("git@") || !url.contains(':') {
                bail!("unsupported git source '{url}': {ALLOWED}");
            }
            ("ssh".to_string(), url.split(':').next().unwrap_or_default())
        }
    };
    if !matches!(scheme.as_str(), "https" | "http" | "git" | "ssh") {
        bail!("unsupported git source '{url}': {ALLOWED}");
    }
    let host = match authority.rsplit_once('@') {
        Some((userinfo, host)) => {
            // An ssh userinfo is a login name, but a password there, or any
            // userinfo on an http(s)/git:// URL, is a secret that would land
            // in `ps` output and shell history.
            if scheme != "ssh" || userinfo.contains([':', '@']) {
                bail!("refusing git source with credentials embedded in the URL; use a git credential helper or ssh key instead");
            }
            host
        }
        None => authority,
    };
    if host.is_empty() {
        bail!("unsupported git source '{url}': no host");
    }
    if host.starts_with('-') {
        bail!("refusing git source whose host begins with '-' (argument injection): {url}");
    }
    Ok(())
}

/// Minimal percent-encoding for query strings.
fn urlencoded(s: &str) -> String {
    s.replace(' ', "%20")
        .replace('&', "%26")
        .replace('=', "%3D")
        .replace('#', "%23")
}

/// Recursively copy a directory tree.
///
/// Symlinks are skipped rather than followed: `symlink_metadata` does not
/// traverse the link, so a malicious plugin source containing a symlink to a
/// directory outside the source tree cannot pull arbitrary host files into the
/// install target (or create a copy loop). `is_dir()`/`is_file()` here would
/// follow the link and reintroduce that overreach.
fn copy_dir(src: &Path, dst: &Path) -> Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let e = entry?;
        let path = e.path();
        let meta = std::fs::symlink_metadata(&path)
            .with_context(|| format!("failed to stat {}", path.display()))?;
        if meta.file_type().is_symlink() {
            eprintln!(
                "[marketplace] skipping symlink during plugin copy: {}",
                path.display()
            );
            continue;
        }
        let d = dst.join(e.file_name());
        if meta.is_dir() {
            copy_dir(&path, &d)?;
        } else {
            std::fs::copy(&path, d)?;
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
        assert_eq!(
            derive_plugin_name("/home/user/plugins/cool-tool"),
            "cool-tool"
        );
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
        let m = Marketplace::new_production();
        assert_eq!(m.registry_url, DEFAULT_REGISTRY_URL);
    }

    #[test]
    fn test_marketplace_custom_url() {
        let m = Marketplace::with_url("https://custom.example.com/v1");
        assert_eq!(m.registry_url, "https://custom.example.com/v1");
    }

    #[test]
    fn default_uses_placeholder_url() {
        let m = Marketplace::default();
        assert!(m.registry_url.contains("agiworkforce.com"));
    }

    #[test]
    fn explicit_url_overrides_default() {
        let m = Marketplace::new("https://internal.example.com");
        assert_eq!(m.registry_url, "https://internal.example.com");
    }

    #[test]
    fn marketplace_plugin_serde_roundtrip() {
        let p = MarketplacePlugin {
            name: "demo".into(),
            version: "0.1.0".into(),
            description: "Test plugin".into(),
            author: "me".into(),
            download_url: Some("https://example.com/demo-0.1.0.tar.gz".into()),
            repository: None,
            category: "test".into(),
            keywords: vec!["test".into()],
        };
        let j = serde_json::to_string(&p).unwrap();
        let back: MarketplacePlugin = serde_json::from_str(&j).unwrap();
        assert_eq!(p.name, back.name);
        assert_eq!(p.version, back.version);
    }

    #[test]
    fn index_serde_roundtrip() {
        let idx = MarketplaceIndex {
            registry_version: "1.0".into(),
            plugins: vec![MarketplacePlugin {
                name: "demo".into(),
                version: "0.1.0".into(),
                description: "Test".into(),
                author: String::new(),
                download_url: Some("https://example.com/x.tar.gz".into()),
                repository: None,
                category: String::new(),
                keywords: vec![],
            }],
        };
        let j = serde_json::to_string(&idx).unwrap();
        let back: MarketplaceIndex = serde_json::from_str(&j).unwrap();
        assert_eq!(back.registry_version, "1.0");
        assert_eq!(back.plugins.len(), 1);
    }

    #[test]
    fn search_filters_by_name_description_or_keyword() {
        let plugins = [
            MarketplacePlugin {
                name: "rust-helper".into(),
                version: "1.0".into(),
                description: "Helps with Rust".into(),
                author: String::new(),
                download_url: None,
                repository: None,
                category: String::new(),
                keywords: vec!["rust".into()],
            },
            MarketplacePlugin {
                name: "linter".into(),
                version: "1.0".into(),
                description: "Generic linter".into(),
                author: String::new(),
                download_url: None,
                repository: None,
                category: String::new(),
                keywords: vec!["lint".into()],
            },
        ];
        let q = "rust";
        let filtered: Vec<_> = plugins
            .iter()
            .filter(|p| {
                p.name.to_lowercase().contains(q)
                    || p.description.to_lowercase().contains(q)
                    || p.keywords.iter().any(|t| t.to_lowercase().contains(q))
            })
            .collect();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].name, "rust-helper");
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
                signature: None,
                content_sha256: None,
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

    #[test]
    fn validate_git_clone_url_rejects_injection_credentials_and_bad_transports() {
        assert!(validate_git_clone_url("https://github.com/acme/plugin.git").is_ok());
        assert!(validate_git_clone_url("git@github.com:acme/plugin.git").is_ok());
        assert!(validate_git_clone_url("ssh://git@github.com/acme/plugin.git").is_ok());

        for url in [
            "https://user:token@github.com/acme/plugin.git",
            "https://ghp_token@github.com/acme/plugin.git",
            "git://oauth2:token@example.com/acme/plugin.git",
            "ssh://user:password@example.com/acme/plugin.git",
            "ssh://a@b@example.com/acme/plugin.git",
        ] {
            let err = validate_git_clone_url(url).unwrap_err().to_string();
            assert!(err.contains("credentials"), "{url}: {err}");
            assert!(
                !err.contains("token") && !err.contains("password"),
                "{url}: {err}"
            );
        }

        for url in [
            "--upload-pack=/tmp/evil.git",
            "ext::sh -c evil",
            "file:///etc/passwd",
            "https://-oProxyCommand=evil/acme/plugin.git",
            "https:///acme/plugin.git",
        ] {
            assert!(
                validate_git_clone_url(url).is_err(),
                "{url} should be rejected"
            );
        }
    }

    #[test]
    fn ensure_within_rejects_parent_escape() {
        let root = Path::new("/home/u/.agiworkforce/plugins");
        assert!(ensure_within(root, &root.join("ok")).is_ok());
        assert!(ensure_within(root, &root.join("..")).is_err());
        assert!(ensure_within(root, Path::new("/home/u/.agiworkforce")).is_err());
    }

    #[tokio::test]
    async fn install_refuses_traversal_name_without_touching_config_dir() {
        let home = tempfile::tempdir().unwrap();
        let keep = home.path().join("plugins").join("keep");
        std::fs::create_dir_all(&keep).unwrap();
        std::fs::write(keep.join("marker.txt"), "keep").unwrap();

        let mp = Marketplace::with_url("http://127.0.0.1:1");
        let err = mp
            .install(
                "https://example.invalid/..",
                home.path(),
                "user",
                &crate::plugins::PluginSignaturePolicy::default(),
            )
            .await
            .unwrap_err()
            .to_string();

        assert!(err.contains("plugin name"), "{err}");
        assert!(keep.join("marker.txt").exists(), "config dir was wiped");
    }

    #[test]
    fn plugin_update_summary_shows_the_version_diff_and_changed_files() {
        assert_eq!(
            describe_plugin_update("acme", "1.0.0", "1.1.0", &[]),
            "acme, updated v1.0.0 -> v1.1.0"
        );
        assert_eq!(
            describe_plugin_update(
                "acme",
                "1.0.0",
                "1.0.0",
                &["M commands/run.md".to_string(), "A hooks.json".to_string()]
            ),
            "acme, updated (still v1.0.0), 2 file(s) changed:\n      M commands/run.md\n      A hooks.json"
        );
    }

    fn unsigned_source() -> (tempfile::TempDir, PathBuf) {
        let source = tempfile::tempdir().unwrap();
        let source_dir = source.path().join("unsigned");
        let manifest = source_dir.join(".agiworkforce-plugin").join("plugin.json");
        std::fs::create_dir_all(manifest.parent().unwrap()).unwrap();
        std::fs::write(&manifest, r#"{"name":"unsigned","version":"1.0.0"}"#).unwrap();
        (source, source_dir)
    }

    #[tokio::test]
    async fn marketplace_install_accepts_an_unsigned_plugin_by_default_and_lists_it_unsigned() {
        let home = tempfile::tempdir().unwrap();
        let (_source, source_dir) = unsigned_source();

        Marketplace::with_url("http://127.0.0.1:1")
            .install(
                source_dir.to_str().unwrap(),
                home.path(),
                "user",
                &crate::plugins::PluginSignaturePolicy::default(),
            )
            .await
            .unwrap();

        let registry = Marketplace::list_installed(home.path());
        assert_eq!(
            registry.plugins["unsigned"].signature.as_deref(),
            Some("unsigned")
        );
        assert!(format_installed(&registry).contains("[unsigned]"));
        assert_eq!(
            registry.plugins["unsigned"].content_sha256,
            crate::plugins::plugin_content_sha256(&home.path().join("plugins").join("unsigned"))
                .ok(),
            "the digest of what was installed is on record"
        );
        assert!(registry.plugins["unsigned"].content_sha256.is_some());
    }

    fn git(dir: &Path, args: &[&str]) {
        let status = std::process::Command::new("git")
            .arg("-C")
            .arg(dir)
            .args([
                "-c",
                "user.name=test",
                "-c",
                "user.email=test@example.invalid",
            ])
            .args(args)
            .output()
            .unwrap();
        assert!(status.status.success(), "git {args:?}: {status:?}");
    }

    fn write_manifest(dir: &Path, version: &str) {
        let manifest = dir.join(".agiworkforce-plugin").join("plugin.json");
        std::fs::create_dir_all(manifest.parent().unwrap()).unwrap();
        std::fs::write(
            manifest,
            format!(r#"{{"name":"tracked","version":"{version}"}}"#),
        )
        .unwrap();
    }

    fn cloned_plugin_with_pending_update() -> (tempfile::TempDir, tempfile::TempDir, PathBuf) {
        cloned_plugin_with_update(r#"{"name":"tracked","version":"2.0.0"}"#)
    }

    /// A plugin cloned at version 1.0.0 whose origin has since committed
    /// `next_manifest`.
    fn cloned_plugin_with_update(
        next_manifest: &str,
    ) -> (tempfile::TempDir, tempfile::TempDir, PathBuf) {
        let origin = tempfile::tempdir().unwrap();
        git(origin.path(), &["init", "-q"]);
        write_manifest(origin.path(), "1.0.0");
        git(origin.path(), &["add", "."]);
        git(origin.path(), &["commit", "-q", "-m", "v1"]);

        let home = tempfile::tempdir().unwrap();
        let plugins_dir = home.path().join("plugins");
        std::fs::create_dir_all(&plugins_dir).unwrap();
        let install_path = plugins_dir.join("tracked");
        git(
            &plugins_dir,
            &["clone", "-q", origin.path().to_str().unwrap(), "tracked"],
        );
        let mut registry = InstalledPlugins::default();
        registry.plugins.insert(
            "tracked".to_string(),
            InstalledPluginEntry {
                scope: "user".to_string(),
                install_path: install_path.to_string_lossy().to_string(),
                version: "1.0.0".to_string(),
                installed_at: Utc::now(),
                signature: None,
                content_sha256: None,
            },
        );
        registry.save(&plugins_dir).unwrap();

        std::fs::write(
            origin
                .path()
                .join(".agiworkforce-plugin")
                .join("plugin.json"),
            next_manifest,
        )
        .unwrap();
        git(origin.path(), &["commit", "-q", "-am", "v2"]);
        (origin, home, install_path)
    }

    #[test]
    fn an_unsigned_update_rolls_back_when_signatures_are_required_without_asking() {
        let mp = Marketplace::with_url("http://127.0.0.1:1");
        let (_origin, home, install_path) = cloned_plugin_with_pending_update();
        let mut asked = 0;
        mp.update_all_with(
            home.path(),
            &crate::plugins::PluginSignaturePolicy {
                require_signed: true,
                ..Default::default()
            },
            &mut |_| {
                asked += 1;
                true
            },
        )
        .unwrap();
        assert_eq!(
            asked, 0,
            "a refused signature is never offered for approval"
        );
        assert_eq!(read_manifest_version(&install_path), "1.0.0");
    }

    #[test]
    fn a_pulled_update_stays_only_when_it_is_approved() {
        let mp = Marketplace::with_url("http://127.0.0.1:1");
        let policy = crate::plugins::PluginSignaturePolicy::default();
        let (_origin, home, install_path) = cloned_plugin_with_pending_update();

        let marker = crate::plugins::pending_update_marker(&home.path().join("plugins"), "tracked");
        let mut shown: Vec<PluginUpdateReview> = Vec::new();
        mp.update_all_with(home.path(), &policy, &mut |review| {
            assert!(
                marker.exists(),
                "the plugin is held off while the question is open"
            );
            shown.push(review.clone());
            false
        })
        .unwrap();
        assert_eq!(shown.len(), 1);
        assert_eq!(
            read_manifest_version(&install_path),
            "1.0.0",
            "an update nobody approved is put back"
        );
        assert!(!marker.exists(), "put back, it loads again");
        let entry = &Marketplace::list_installed(home.path()).plugins["tracked"];
        assert_eq!(entry.version, "1.0.0");
        assert_eq!(entry.content_sha256, None, "nothing new is put on record");

        mp.update_all_with(home.path(), &policy, &mut |_| true)
            .unwrap();
        assert_eq!(read_manifest_version(&install_path), "2.0.0");
        assert!(!marker.exists(), "kept, it loads again");

        mp.update_all_with(home.path(), &policy, &mut |_| {
            panic!("nothing new was pulled, so there is nothing to ask")
        })
        .unwrap();
        assert!(!marker.exists());
        let entry = &Marketplace::list_installed(home.path()).plugins["tracked"];
        assert_eq!(entry.version, "2.0.0");
        assert_eq!(entry.signature.as_deref(), Some("unsigned"));
        assert_eq!(
            entry.content_sha256,
            crate::plugins::plugin_content_sha256(&install_path).ok(),
            "the digest on record is the one that was approved"
        );
        assert_eq!(
            entry.content_sha256.as_deref(),
            Some(shown[0].sha256.as_str())
        );
    }

    #[test]
    fn an_update_pulled_and_never_decided_is_asked_about_on_the_next_run() {
        let mp = Marketplace::with_url("http://127.0.0.1:1");
        let policy = crate::plugins::PluginSignaturePolicy::default();
        let (_origin, home, install_path) = cloned_plugin_with_pending_update();
        let marker = crate::plugins::pending_update_marker(&home.path().join("plugins"), "tracked");

        // What a run that ended at the question leaves behind: the marker
        // naming the approved commit, and the pulled update on disk.
        let approved = head_commit(&install_path).expect("a commit");
        std::fs::write(&marker, &approved).unwrap();
        git(&install_path, &["pull", "-q", "--ff-only"]);
        assert_eq!(read_manifest_version(&install_path), "2.0.0");

        let mut asked = 0;
        mp.update_all_with(home.path(), &policy, &mut |review| {
            asked += 1;
            assert_eq!(
                review.changed_files,
                vec!["M .agiworkforce-plugin/plugin.json".to_string()]
            );
            false
        })
        .unwrap();
        assert_eq!(
            asked, 1,
            "there was nothing new to pull, yet nobody had decided"
        );
        assert_eq!(read_manifest_version(&install_path), "1.0.0");
        assert_eq!(head_commit(&install_path), Some(approved));
        assert!(!marker.exists());
    }

    #[test]
    fn a_marker_that_names_no_commit_keeps_the_plugin_off_when_the_update_is_refused() {
        let mp = Marketplace::with_url("http://127.0.0.1:1");
        let (_origin, home, install_path) = cloned_plugin_with_pending_update();
        let marker = crate::plugins::pending_update_marker(&home.path().join("plugins"), "tracked");
        std::fs::write(&marker, "--hard-to-believe").unwrap();
        git(&install_path, &["pull", "-q", "--ff-only"]);

        mp.update_all_with(
            home.path(),
            &crate::plugins::PluginSignaturePolicy::default(),
            &mut |_| false,
        )
        .unwrap();
        assert!(
            marker.exists(),
            "with no commit to go back to, the plugin stays off"
        );
        assert!(is_commit_id(&"a".repeat(40)) && is_commit_id(&"0".repeat(64)));
        assert!(!is_commit_id("--hard") && !is_commit_id(&"g".repeat(40)));
    }

    #[test]
    fn the_review_names_the_hooks_and_servers_an_update_brings() {
        let mp = Marketplace::with_url("http://127.0.0.1:1");
        let (_origin, home, _install_path) = cloned_plugin_with_update(
            r#"{
                "name": "tracked",
                "version": "2.0.0",
                "hooks": {"PreToolUse": [{"command": "sh", "args": ["guard.sh"]}]},
                "mcpServers": {"files": {"command": "node", "args": ["server.js"]}}
            }"#,
        );

        let mut shown: Vec<PluginUpdateReview> = Vec::new();
        mp.update_all_with(
            home.path(),
            &crate::plugins::PluginSignaturePolicy::default(),
            &mut |review| {
                shown.push(review.clone());
                false
            },
        )
        .unwrap();

        let review = &shown[0];
        assert_eq!(review.previous_version, "1.0.0");
        assert_eq!(review.version, "2.0.0");
        assert_eq!(
            review.changed_files,
            vec!["M .agiworkforce-plugin/plugin.json".to_string()]
        );
        assert_eq!(
            review.unapproved,
            vec![
                "new MCP server files".to_string(),
                "new hook under PreToolUse: sh guard.sh".to_string(),
            ]
        );
        assert_eq!(review.sha256.len(), 64);
        assert_eq!(review.approved_sha256, None);

        let text = describe_plugin_review(review);
        assert!(
            text.starts_with("tracked, update pulled v1.0.0 -> v2.0.0 (unsigned)"),
            "{text}"
        );
        assert!(
            text.contains("new hook under PreToolUse: sh guard.sh"),
            "{text}"
        );
        assert!(
            text.contains(&format!("content sha256:{}", review.sha256)),
            "{text}"
        );
    }

    #[test]
    fn a_review_with_nothing_new_to_agree_to_says_so_and_shows_both_digests() {
        let text = describe_plugin_review(&PluginUpdateReview {
            name: "acme".to_string(),
            previous_version: "1.0.0".to_string(),
            version: "1.0.0".to_string(),
            signature: "signed by acme".to_string(),
            changed_files: vec!["M README.md".to_string()],
            unapproved: Vec::new(),
            approved_sha256: Some("aa".to_string()),
            sha256: "bb".to_string(),
        });
        assert_eq!(
            text,
            "acme, update pulled (still v1.0.0, signed by acme)\n      1 file(s) changed:\n        M README.md\n      It adds or changes no hook, MCP server, skill, command or agent.\n      content sha256:bb (last agreed to: sha256:aa)"
        );
    }

    #[tokio::test]
    async fn marketplace_install_rolls_back_an_unsigned_plugin_when_signatures_are_required() {
        let home = tempfile::tempdir().unwrap();
        let (_source, source_dir) = unsigned_source();

        let err = Marketplace::with_url("http://127.0.0.1:1")
            .install(
                source_dir.to_str().unwrap(),
                home.path(),
                "user",
                &crate::plugins::PluginSignaturePolicy {
                    require_signed: true,
                    ..Default::default()
                },
            )
            .await
            .unwrap_err()
            .to_string();

        assert!(err.contains("--unsafe-allow-unsigned"), "{err}");
        assert!(!home.path().join("plugins").join("unsigned").exists());
        assert!(!Marketplace::list_installed(home.path())
            .plugins
            .contains_key("unsigned"));
    }

    #[tokio::test]
    async fn test_search_unreachable_registry() {
        // Search against a guaranteed-unreachable URL should return empty, not error
        let m = Marketplace::with_url("http://127.0.0.1:1");
        let results = m.search("test").await.unwrap();
        assert!(results.is_empty());
    }
}
