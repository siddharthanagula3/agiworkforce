//! MCP server bundles: the official MCP Registry merged with an embedded
//! list, installed through npm only at a version the packaged allow-list
//! pins, and only after a native confirmation.

use crate::core::mcp::manifest::{AllowedPackage, AllowlistState};
use crate::core::mcp::McpServerConfig;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::process::Command;

/// A tool provided by an MCP bundle
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleTool {
    /// Tool name (e.g., "read_file", "search_code")
    pub name: String,
    /// Human-readable description
    pub description: String,
    /// Input parameters schema (simplified)
    pub parameters: Vec<BundleToolParameter>,
}

/// A parameter for a bundle tool
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleToolParameter {
    /// Parameter name
    pub name: String,
    /// Parameter type (string, number, boolean, object, array)
    pub param_type: String,
    /// Whether the parameter is required
    pub required: bool,
    /// Description of the parameter
    pub description: String,
}

/// A credential required by an MCP bundle
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequiredCredential {
    /// Environment variable name (e.g., "GITHUB_PERSONAL_ACCESS_TOKEN")
    pub env_var: String,
    /// Human-readable name (e.g., "GitHub Personal Access Token")
    pub display_name: String,
    /// Description of what this credential is for
    pub description: String,
    /// URL to get the credential (e.g., GitHub settings page)
    pub help_url: Option<String>,
    /// Whether this credential is required or optional
    pub required: bool,
}

/// Configuration template for an MCP server
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConfigTemplate {
    /// Command to run (e.g., "npx", "node")
    pub command: String,
    /// Arguments to pass to the command
    pub args: Vec<String>,
    /// Environment variables (with placeholders for credentials)
    pub env: HashMap<String, String>,
}

/// An MCP Bundle from the registry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpBundle {
    /// Unique identifier (e.g., "mcp-filesystem", "mcp-github")
    pub id: String,
    /// Human-readable name
    pub name: String,
    /// Semantic version (e.g., "1.0.0")
    pub version: String,
    /// Description of what this bundle does
    pub description: String,
    /// Author or organization
    pub author: String,
    /// Category (e.g., "development", "productivity", "data", "search")
    pub category: String,
    /// Icon URL (optional)
    pub icon_url: Option<String>,
    /// NPM package name (e.g., "@modelcontextprotocol/server-filesystem")
    pub npm_package: Option<String>,
    /// GitHub repository URL
    pub github_url: Option<String>,
    /// Documentation URL
    pub documentation_url: Option<String>,
    /// Tools provided by this bundle
    pub tools: Vec<BundleTool>,
    /// Server configuration template
    pub config_template: McpConfigTemplate,
    /// Required credentials
    pub required_credentials: Vec<RequiredCredential>,
    /// Whether the packaged allow-list pins this bundle's package, the only
    /// review an install is held to. Set by `apply_allowlist`.
    pub verified: bool,
    /// Whether this bundle is featured
    pub featured: bool,
    /// Tags for search/filtering
    pub tags: Vec<String>,
    /// Whether this bundle is installed locally
    #[serde(default)]
    pub installed: bool,
    /// Installed version (if installed)
    pub installed_version: Option<String>,
    /// Whether an update is available
    #[serde(default)]
    pub update_available: bool,
}

/// Progress information during bundle installation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    /// Bundle ID being installed
    pub bundle_id: String,
    /// Current phase (e.g., "downloading", "installing", "configuring")
    pub phase: String,
    /// Progress percentage (0-100)
    pub progress: u8,
    /// Current status message
    pub message: String,
}

/// Metadata about an installed bundle
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledBundleMetadata {
    /// Bundle ID
    pub bundle_id: String,
    /// Installed version
    pub version: String,
    /// NPM package name
    pub npm_package: Option<String>,
    /// Installation timestamp (Unix epoch seconds)
    pub installed_at: u64,
    /// Last updated timestamp
    pub updated_at: u64,
    /// Server name in MCP config
    pub server_name: String,
    /// Normalized registry record retained so an installed official entry
    /// remains manageable after an offline restart.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bundle: Option<McpBundle>,
}

/// Container for all installed bundle metadata
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstalledBundlesData {
    pub bundles: HashMap<String, InstalledBundleMetadata>,
}

const OFFICIAL_MCP_REGISTRY_SERVERS_URL: &str =
    "https://registry.modelcontextprotocol.io/v0.1/servers";
const OFFICIAL_REGISTRY_BUNDLE_PREFIX: &str = "mcp-registry-";
const NPM_REGISTRY_URL: &str = "https://registry.npmjs.org";

#[derive(Debug, Deserialize)]
struct OfficialRegistryResponse {
    #[serde(default)]
    servers: Vec<OfficialRegistryEntry>,
}

#[derive(Debug, Deserialize)]
struct OfficialRegistryEntry {
    server: OfficialRegistryServer,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfficialRegistryServer {
    name: String,
    title: Option<String>,
    description: String,
    version: String,
    packages: Option<Vec<OfficialRegistryPackage>>,
    remotes: Option<Vec<OfficialRegistryRemote>>,
    repository: Option<OfficialRegistryRepository>,
    website_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfficialRegistryPackage {
    registry_type: String,
    identifier: String,
    version: Option<String>,
    runtime_hint: Option<String>,
    transport: Option<OfficialRegistryTransport>,
    runtime_arguments: Option<Vec<OfficialRegistryArgument>>,
    package_arguments: Option<Vec<OfficialRegistryArgument>>,
    environment_variables: Option<Vec<OfficialRegistryEnvironmentVariable>>,
}

#[derive(Debug, Deserialize)]
struct OfficialRegistryTransport {
    #[serde(rename = "type")]
    transport_type: String,
}

#[derive(Debug, Deserialize)]
struct OfficialRegistryArgument {
    value: Option<String>,
    default: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfficialRegistryEnvironmentVariable {
    name: String,
    description: Option<String>,
    default: Option<String>,
    value: Option<String>,
    #[serde(default)]
    is_required: bool,
    #[serde(default)]
    is_secret: bool,
}

#[derive(Debug, Deserialize)]
struct OfficialRegistryRemote {
    #[serde(rename = "type")]
    transport_type: String,
    url: String,
}

#[derive(Debug, Deserialize)]
struct OfficialRegistryRepository {
    url: String,
}

fn registry_bundle_id(server_name: &str) -> String {
    let mut slug = String::with_capacity(server_name.len());
    let mut previous_was_separator = false;

    for character in server_name.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            previous_was_separator = false;
        } else if !previous_was_separator && !slug.is_empty() {
            slug.push('-');
            previous_was_separator = true;
        }
    }

    while slug.ends_with('-') {
        slug.pop();
    }

    if slug.is_empty() {
        slug.push_str("server");
    }

    format!("{OFFICIAL_REGISTRY_BUNDLE_PREFIX}{slug}")
}

fn registry_argument_value(argument: &OfficialRegistryArgument) -> Option<String> {
    argument
        .value
        .as_ref()
        .or(argument.default.as_ref())
        .filter(|value| !value.is_empty())
        .cloned()
}

fn official_registry_bundle(entry: OfficialRegistryEntry) -> McpBundle {
    let server = entry.server;
    let packages = server.packages.unwrap_or_default();
    let remotes = server.remotes.unwrap_or_default();
    let npm_package = packages.iter().find(|package| {
        package.registry_type.eq_ignore_ascii_case("npm")
            && package
                .transport
                .as_ref()
                .is_some_and(|transport| transport.transport_type == "stdio")
    });

    let (installable_package, config_template, required_credentials, transport_tag) =
        if let Some(package) = npm_package {
            let command = package
                .runtime_hint
                .clone()
                .filter(|hint| !hint.is_empty())
                .unwrap_or_else(|| "npx".to_string());
            let mut args = package
                .runtime_arguments
                .as_deref()
                .unwrap_or_default()
                .iter()
                .filter_map(registry_argument_value)
                .collect::<Vec<_>>();

            if command == "npx" && !args.iter().any(|arg| arg == "-y" || arg == "--yes") {
                args.push("-y".to_string());
            }

            let package_version = package.version.as_deref().unwrap_or(&server.version);
            args.push(format!("{}@{}", package.identifier, package_version));
            args.extend(
                package
                    .package_arguments
                    .as_deref()
                    .unwrap_or_default()
                    .iter()
                    .filter_map(registry_argument_value),
            );

            let mut env = HashMap::new();
            let mut credentials = Vec::new();
            for variable in package.environment_variables.as_deref().unwrap_or_default() {
                let configured_value = variable
                    .value
                    .as_ref()
                    .or(variable.default.as_ref())
                    .cloned();
                env.insert(
                    variable.name.clone(),
                    configured_value
                        .clone()
                        .unwrap_or_else(|| format!("<configure:{}>", variable.name)),
                );

                if variable.is_required || variable.is_secret || configured_value.is_none() {
                    credentials.push(RequiredCredential {
                        env_var: variable.name.clone(),
                        display_name: variable.name.replace('_', " "),
                        description: variable.description.clone().unwrap_or_else(|| {
                            format!("Configuration required by {}", server.name)
                        }),
                        help_url: server.website_url.clone(),
                        required: variable.is_required,
                    });
                }
            }

            (
                Some(package.identifier.clone()),
                McpConfigTemplate { command, args, env },
                credentials,
                "npm".to_string(),
            )
        } else if let Some(remote) = remotes.first() {
            (
                None,
                McpConfigTemplate {
                    command: remote.transport_type.clone(),
                    args: vec![remote.url.clone()],
                    env: HashMap::new(),
                },
                Vec::new(),
                "remote".to_string(),
            )
        } else if let Some(package) = packages.first() {
            (
                None,
                McpConfigTemplate {
                    command: package.registry_type.clone(),
                    args: vec![package.identifier.clone()],
                    env: HashMap::new(),
                },
                Vec::new(),
                package.registry_type.to_lowercase(),
            )
        } else {
            (
                None,
                McpConfigTemplate {
                    command: "manual".to_string(),
                    args: Vec::new(),
                    env: HashMap::new(),
                },
                Vec::new(),
                "manual".to_string(),
            )
        };

    let display_name = server
        .title
        .filter(|title| !title.trim().is_empty())
        .unwrap_or_else(|| server.name.clone());
    let author = server
        .name
        .split('/')
        .next()
        .filter(|namespace| !namespace.is_empty())
        .unwrap_or("Official MCP Registry")
        .to_string();

    let mut tags = vec![
        "official-registry".to_string(),
        "community".to_string(),
        transport_tag,
        server.name.clone(),
    ];
    if let Some(package) = npm_package {
        tags.push(package.identifier.clone());
    }

    McpBundle {
        id: registry_bundle_id(&server.name),
        name: display_name,
        version: server.version,
        description: server.description,
        author,
        category: "other".to_string(),
        icon_url: None,
        npm_package: installable_package,
        github_url: server.repository.map(|repository| repository.url),
        documentation_url: server.website_url,
        tools: Vec::new(),
        config_template,
        required_credentials,
        verified: false,
        featured: false,
        tags,
        installed: false,
        installed_version: None,
        update_available: false,
    }
}

fn merge_registry_bundles(target: &mut Vec<McpBundle>, incoming: Vec<McpBundle>) {
    for bundle in incoming {
        if let Some(existing) = target
            .iter_mut()
            .find(|candidate| candidate.id == bundle.id)
        {
            if !existing.verified {
                *existing = bundle;
            }
        } else {
            target.push(bundle);
        }
    }
}

fn mark_installed_bundles(
    bundles: &mut [McpBundle],
    installed: &HashMap<String, InstalledBundleMetadata>,
) {
    for bundle in bundles {
        let metadata = installed.get(&bundle.id);
        bundle.installed = metadata.is_some();
        bundle.installed_version = metadata.map(|metadata| metadata.version.clone());
        bundle.update_available =
            metadata.is_some_and(|metadata| metadata.version != bundle.version);
    }
}

fn merge_installed_bundle_snapshots(
    bundles: &mut Vec<McpBundle>,
    installed: &HashMap<String, InstalledBundleMetadata>,
) {
    for metadata in installed.values() {
        if let Some(bundle) = metadata.bundle.as_ref() {
            merge_registry_bundles(bundles, vec![bundle.clone()]);
        }
    }
}

/// A bundle is verified only when the packaged allow-list pins its package,
/// and is then offered at the pinned version, the one npm installs.
fn apply_allowlist(bundles: &mut [McpBundle], allowlist: &AllowlistState) {
    for bundle in bundles {
        let pin = bundle
            .npm_package
            .as_deref()
            .and_then(|package| allowlist.pinned(package));
        bundle.verified = pin.is_some();
        if let Some(pin) = pin {
            bundle.version = pin.version.clone();
        }
    }
}

/// The cached registry, or the embedded one before the first fetch, with
/// every installed bundle's snapshot merged in, checked against `allowlist`
/// and marked with what is installed.
fn catalog(state: &McpbState, allowlist: &AllowlistState) -> Vec<McpBundle> {
    let mut bundles = {
        let cache = state.registry_cache.lock();
        if cache.is_empty() {
            drop(cache);
            get_embedded_registry()
        } else {
            cache.clone()
        }
    };
    let installed = state.installed.lock();
    merge_installed_bundle_snapshots(&mut bundles, &installed.bundles);
    apply_allowlist(&mut bundles, allowlist);
    mark_installed_bundles(&mut bundles, &installed.bundles);
    bundles
}

/// The reviewed pin for a bundle's npm package. A package outside the
/// allow-list, or any package when the list is missing, has no pin and is
/// refused before npm can reach the network.
fn verified_install_spec(
    npm_package: &str,
    allowlist: &AllowlistState,
) -> Result<AllowedPackage, String> {
    allowlist.pinned(npm_package).cloned().ok_or_else(|| {
        tracing::warn!(package = %npm_package, absent = allowlist.is_absent(), "MCP install refused");
        if allowlist.is_absent() {
            format!("The MCP allow-list is missing from this installation, so '{npm_package}' cannot be verified. Reinstall AGI Workforce.")
        } else {
            format!("MCP package '{npm_package}' is not on the allow-list.")
        }
    })
}

/// Launch arguments that name the package run the pinned version, so the
/// server that starts is the one whose tarball was verified.
fn pinned_launch_args(args: &[String], pin: &AllowedPackage) -> Vec<String> {
    let versioned_prefix = format!("{}@", pin.name);
    args.iter()
        .map(|argument| {
            if *argument == pin.name || argument.starts_with(&versioned_prefix) {
                pin.install_spec()
            } else {
                argument.clone()
            }
        })
        .collect()
}

fn npm_version_url(pin: &AllowedPackage) -> String {
    format!(
        "{}/{}/{}",
        NPM_REGISTRY_URL,
        pin.name.replace('/', "%2F"),
        pin.version
    )
}

#[derive(Debug, Deserialize)]
struct NpmVersionDist {
    integrity: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NpmVersionManifest {
    dist: NpmVersionDist,
}

fn check_registry_integrity(pin: &AllowedPackage, published: Option<&str>) -> Result<(), String> {
    match published {
        Some(integrity) if integrity == pin.integrity => Ok(()),
        Some(_) => Err(format!(
            "The registry tarball for {} does not match the reviewed hash. The install was stopped.",
            pin.install_spec()
        )),
        None => Err(format!(
            "The registry publishes no sha512 hash for {}, so it cannot be verified.",
            pin.install_spec()
        )),
    }
}

async fn verify_registry_integrity(pin: &AllowedPackage) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let response = client
        .get(npm_version_url(pin))
        .header("Accept", "application/json")
        .header(
            "User-Agent",
            format!("AGIWorkforce/{}", env!("CARGO_PKG_VERSION")),
        )
        .send()
        .await
        .map_err(|e| format!("npm registry request failed: {}", e))?;
    if !response.status().is_success() {
        return Err(format!(
            "npm registry returned {} for {}",
            response.status(),
            pin.install_spec()
        ));
    }
    let manifest: NpmVersionManifest = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse npm registry response: {}", e))?;
    check_registry_integrity(pin, manifest.dist.integrity.as_deref())
}

fn npm_install_args(pin: &AllowedPackage) -> Vec<String> {
    let mut args = vec!["install".to_string(), "-g".to_string()];
    if !pin.allow_scripts {
        args.push("--ignore-scripts".to_string());
    }
    args.push(pin.install_spec());
    args
}

static PACKAGE_INSTALL_DECISIONS: crate::sys::native_confirm::ConfirmGate =
    crate::sys::native_confirm::ConfirmGate::new();

const INSTALL_PACKAGE_LABEL: &str = "Install Package";

/// The question asked before npm installs a bundle's package for the whole
/// computer. The package and its version are the allowlist's own, never the
/// page's.
fn package_install_question(pin: &AllowedPackage) -> crate::sys::native_confirm::NativeConfirm {
    let scripts = if pin.allow_scripts {
        "Its install scripts will run."
    } else {
        "Its install scripts will not run."
    };
    crate::sys::native_confirm::NativeConfirm {
        title: "Install this npm package?".to_string(),
        body: format!(
            "npm will install {} version {} for every program on this computer (npm install -g). {scripts}\n\nIt is a package this app lists, and the download is checked against the hash recorded for that version.",
            crate::sys::native_confirm::shown_value(&pin.name),
            crate::sys::native_confirm::shown_value(&pin.version),
        ),
        confirm_label: INSTALL_PACKAGE_LABEL.to_string(),
    }
}

/// Asks in a native dialog before a package is installed. The page renders
/// model output and can call the install commands itself, so its own
/// confirmation is not the one that counts.
async fn confirm_package_install<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    pin: &AllowedPackage,
) -> Result<(), String> {
    let spec = pin.install_spec();
    match PACKAGE_INSTALL_DECISIONS
        .confirm(
            app,
            &format!("npm_install:{spec}"),
            package_install_question(pin),
        )
        .await
    {
        Ok(true) => Ok(()),
        Ok(false) => Err(format!(
            "{spec} was not installed: installing it was not confirmed."
        )),
        Err(not_asked) => Err(not_asked.message()),
    }
}

/// Install the pinned package after its registry hash matches the pin.
/// `npm` then checks the downloaded tarball against that same hash.
async fn install_pinned_package(pin: &AllowedPackage) -> Result<(), String> {
    verify_registry_integrity(pin).await?;

    let args = npm_install_args(pin);
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", "npm"])
            .args(&args)
            .output()
            .await
    } else {
        Command::new("npm").args(&args).output().await
    }
    .map_err(|e| format!("Failed to run npm: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("npm install failed: {}", stderr));
    }
    Ok(())
}

/// State for the MCPB system
pub struct McpbState {
    /// Cached registry data
    pub registry_cache: Arc<Mutex<Vec<McpBundle>>>,
    /// Installed bundles metadata
    pub installed: Arc<Mutex<InstalledBundlesData>>,
}

impl Default for McpbState {
    fn default() -> Self {
        Self::new()
    }
}

impl McpbState {
    pub fn new() -> Self {
        let installed = Self::load_installed_metadata().unwrap_or_default();
        Self {
            registry_cache: Arc::new(Mutex::new(Vec::new())),
            installed: Arc::new(Mutex::new(installed)),
        }
    }

    /// Get the path to the installed bundles metadata file
    fn metadata_path() -> Result<PathBuf, String> {
        let app_data =
            dirs::data_dir().ok_or_else(|| "Failed to get app data directory".to_string())?;
        Ok(app_data.join("agiworkforce").join("mcpb-installed.json"))
    }

    /// Load installed bundles metadata from disk
    fn load_installed_metadata() -> Result<InstalledBundlesData, String> {
        let path = Self::metadata_path()?;
        if !path.exists() {
            return Ok(InstalledBundlesData::default());
        }
        let contents = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read installed bundles: {}", e))?;
        serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse installed bundles: {}", e))
    }

    /// Save installed bundles metadata to disk
    async fn save_installed_metadata(&self) -> Result<(), String> {
        let path = Self::metadata_path()?;

        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        let data = self.installed.lock().clone();
        let json = serde_json::to_string_pretty(&data)
            .map_err(|e| format!("Failed to serialize installed bundles: {}", e))?;
        tokio::fs::write(&path, json)
            .await
            .map_err(|e| format!("Failed to write installed bundles: {}", e))?;

        Ok(())
    }
}

fn emit_install_progress(app: &AppHandle, progress: &InstallProgress) {
    let _ = app.emit("mcpb:install_progress", progress);
}

/// The bundles listed beside the official MCP Registry, and alone when it
/// cannot be reached.
fn get_embedded_registry() -> Vec<McpBundle> {
    vec![
        McpBundle {
            id: "mcp-filesystem".to_string(),
            name: "Filesystem".to_string(),
            version: "0.6.2".to_string(),
            description: "Secure, sandboxed access to local filesystem. Read, write, and manage files and directories with configurable access controls.".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "development".to_string(),
            icon_url: Some("https://raw.githubusercontent.com/modelcontextprotocol/servers/main/assets/filesystem.svg".to_string()),
            npm_package: Some("@modelcontextprotocol/server-filesystem".to_string()),
            github_url: Some("https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem".to_string()),
            documentation_url: Some("https://modelcontextprotocol.io/docs/servers/filesystem".to_string()),
            tools: vec![
                BundleTool {
                    name: "read_text_file".to_string(),
                    description: "Read complete contents of a file as UTF-8 text, with optional head/tail line limits".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "Path to the file to read".to_string() },
                        BundleToolParameter { name: "head".to_string(), param_type: "number".to_string(), required: false, description: "Read only the first N lines".to_string() },
                        BundleToolParameter { name: "tail".to_string(), param_type: "number".to_string(), required: false, description: "Read only the last N lines".to_string() },
                    ],
                },
                BundleTool {
                    name: "read_media_file".to_string(),
                    description: "Read an image or audio file and return base64 data with MIME type".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "Path to the media file".to_string() },
                    ],
                },
                BundleTool {
                    name: "read_multiple_files".to_string(),
                    description: "Read multiple files simultaneously; failed reads don't stop the operation".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "paths".to_string(), param_type: "array".to_string(), required: true, description: "Array of file paths to read".to_string() },
                    ],
                },
                BundleTool {
                    name: "write_file".to_string(),
                    description: "Create new file or overwrite existing with content".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "File path".to_string() },
                        BundleToolParameter { name: "content".to_string(), param_type: "string".to_string(), required: true, description: "Content to write".to_string() },
                    ],
                },
                BundleTool {
                    name: "edit_file".to_string(),
                    description: "Make selective edits using pattern matching with whitespace normalization and git-style diff output".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "File to edit".to_string() },
                        BundleToolParameter { name: "edits".to_string(), param_type: "array".to_string(), required: true, description: "List of {oldText, newText} edit operations".to_string() },
                        BundleToolParameter { name: "dryRun".to_string(), param_type: "boolean".to_string(), required: false, description: "Preview changes without applying".to_string() },
                    ],
                },
                BundleTool {
                    name: "create_directory".to_string(),
                    description: "Create new directory (including parent directories if needed)".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "Directory path to create".to_string() },
                    ],
                },
                BundleTool {
                    name: "list_directory".to_string(),
                    description: "List directory contents with [FILE] or [DIR] prefixes".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "Directory path".to_string() },
                    ],
                },
                BundleTool {
                    name: "list_directory_with_sizes".to_string(),
                    description: "List directory contents with file sizes and summary statistics".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "Directory path".to_string() },
                        BundleToolParameter { name: "sortBy".to_string(), param_type: "string".to_string(), required: false, description: "Sort by 'name' or 'size' (default: name)".to_string() },
                    ],
                },
                BundleTool {
                    name: "move_file".to_string(),
                    description: "Move or rename files and directories".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "source".to_string(), param_type: "string".to_string(), required: true, description: "Source path".to_string() },
                        BundleToolParameter { name: "destination".to_string(), param_type: "string".to_string(), required: true, description: "Destination path".to_string() },
                    ],
                },
                BundleTool {
                    name: "search_files".to_string(),
                    description: "Recursively search for files/directories matching glob patterns".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "Starting directory".to_string() },
                        BundleToolParameter { name: "pattern".to_string(), param_type: "string".to_string(), required: true, description: "Search pattern (glob)".to_string() },
                        BundleToolParameter { name: "excludePatterns".to_string(), param_type: "array".to_string(), required: false, description: "Patterns to exclude".to_string() },
                    ],
                },
                BundleTool {
                    name: "directory_tree".to_string(),
                    description: "Get recursive JSON tree structure of directory contents".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "Starting directory".to_string() },
                        BundleToolParameter { name: "excludePatterns".to_string(), param_type: "array".to_string(), required: false, description: "Patterns to exclude (glob)".to_string() },
                    ],
                },
                BundleTool {
                    name: "get_file_info".to_string(),
                    description: "Get detailed file/directory metadata (size, timestamps, permissions)".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "File or directory path".to_string() },
                    ],
                },
                BundleTool {
                    name: "list_allowed_directories".to_string(),
                    description: "List all directories the server is allowed to access".to_string(),
                    parameters: vec![],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@modelcontextprotocol/server-filesystem".to_string(), ".".to_string()],
                env: HashMap::new(),
            },
            required_credentials: vec![],
            verified: true,
            featured: true,
            tags: vec!["files".to_string(), "filesystem".to_string(), "io".to_string(), "storage".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },
        McpBundle {
            id: "mcp-github".to_string(),
            name: "GitHub".to_string(),
            version: "0.6.2".to_string(),
            description: "Full GitHub integration - repositories, issues, pull requests, code search, and more. Supports both public and private repos.".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "development".to_string(),
            icon_url: Some("https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png".to_string()),
            npm_package: Some("@modelcontextprotocol/server-github".to_string()),
            github_url: Some("https://github.com/github/github-mcp-server".to_string()),
            documentation_url: Some("https://github.com/github/github-mcp-server#readme".to_string()),
            tools: vec![
                BundleTool {
                    name: "create_or_update_file".to_string(),
                    description: "Create or update a file in a repository".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "owner".to_string(), param_type: "string".to_string(), required: true, description: "Repository owner".to_string() },
                        BundleToolParameter { name: "repo".to_string(), param_type: "string".to_string(), required: true, description: "Repository name".to_string() },
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "File path".to_string() },
                        BundleToolParameter { name: "content".to_string(), param_type: "string".to_string(), required: true, description: "File content".to_string() },
                        BundleToolParameter { name: "message".to_string(), param_type: "string".to_string(), required: true, description: "Commit message".to_string() },
                        BundleToolParameter { name: "branch".to_string(), param_type: "string".to_string(), required: true, description: "Branch to commit to".to_string() },
                    ],
                },
                BundleTool {
                    name: "push_files".to_string(),
                    description: "Push multiple files in a single commit".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "owner".to_string(), param_type: "string".to_string(), required: true, description: "Repository owner".to_string() },
                        BundleToolParameter { name: "repo".to_string(), param_type: "string".to_string(), required: true, description: "Repository name".to_string() },
                        BundleToolParameter { name: "branch".to_string(), param_type: "string".to_string(), required: true, description: "Branch to push to".to_string() },
                        BundleToolParameter { name: "files".to_string(), param_type: "array".to_string(), required: true, description: "Array of {path, content} objects".to_string() },
                        BundleToolParameter { name: "message".to_string(), param_type: "string".to_string(), required: true, description: "Commit message".to_string() },
                    ],
                },
                BundleTool {
                    name: "search_repositories".to_string(),
                    description: "Search GitHub repositories".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "query".to_string(), param_type: "string".to_string(), required: true, description: "Search query".to_string() },
                    ],
                },
                BundleTool {
                    name: "create_issue".to_string(),
                    description: "Create a new issue".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "owner".to_string(), param_type: "string".to_string(), required: true, description: "Repository owner".to_string() },
                        BundleToolParameter { name: "repo".to_string(), param_type: "string".to_string(), required: true, description: "Repository name".to_string() },
                        BundleToolParameter { name: "title".to_string(), param_type: "string".to_string(), required: true, description: "Issue title".to_string() },
                        BundleToolParameter { name: "body".to_string(), param_type: "string".to_string(), required: false, description: "Issue body".to_string() },
                    ],
                },
                BundleTool {
                    name: "create_pull_request".to_string(),
                    description: "Create a new pull request".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "owner".to_string(), param_type: "string".to_string(), required: true, description: "Repository owner".to_string() },
                        BundleToolParameter { name: "repo".to_string(), param_type: "string".to_string(), required: true, description: "Repository name".to_string() },
                        BundleToolParameter { name: "title".to_string(), param_type: "string".to_string(), required: true, description: "PR title".to_string() },
                        BundleToolParameter { name: "head".to_string(), param_type: "string".to_string(), required: true, description: "Head branch".to_string() },
                        BundleToolParameter { name: "base".to_string(), param_type: "string".to_string(), required: true, description: "Base branch".to_string() },
                        BundleToolParameter { name: "body".to_string(), param_type: "string".to_string(), required: false, description: "PR body/description".to_string() },
                    ],
                },
                BundleTool {
                    name: "search_code".to_string(),
                    description: "Search for code across GitHub".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "query".to_string(), param_type: "string".to_string(), required: true, description: "Code search query".to_string() },
                    ],
                },
                BundleTool {
                    name: "get_file_contents".to_string(),
                    description: "Retrieve the contents of a file or directory from a repository".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "owner".to_string(), param_type: "string".to_string(), required: true, description: "Repository owner".to_string() },
                        BundleToolParameter { name: "repo".to_string(), param_type: "string".to_string(), required: true, description: "Repository name".to_string() },
                        BundleToolParameter { name: "path".to_string(), param_type: "string".to_string(), required: true, description: "File path".to_string() },
                        BundleToolParameter { name: "branch".to_string(), param_type: "string".to_string(), required: false, description: "Branch (optional)".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@github/github-mcp-server".to_string()],
                env: {
                    let mut env = HashMap::new();
                    env.insert("GITHUB_PERSONAL_ACCESS_TOKEN".to_string(), "<from_credential_manager>".to_string());
                    env
                },
            },
            required_credentials: vec![
                RequiredCredential {
                    env_var: "GITHUB_PERSONAL_ACCESS_TOKEN".to_string(),
                    display_name: "GitHub Personal Access Token".to_string(),
                    description: "Personal access token with repo and user scopes. Required for API access.".to_string(),
                    help_url: Some("https://github.com/settings/tokens".to_string()),
                    required: true,
                },
            ],
            verified: true,
            featured: true,
            tags: vec!["github".to_string(), "git".to_string(), "code".to_string(), "development".to_string(), "version-control".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },
        McpBundle {
            id: "mcp-puppeteer".to_string(),
            name: "Puppeteer".to_string(),
            version: "0.6.2".to_string(),
            description: "Browser automation with Puppeteer. Navigate pages, take screenshots, interact with elements, and extract content.".to_string(),
            author: "Model Context Protocol".to_string(),
            category: "automation".to_string(),
            icon_url: Some("https://user-images.githubusercontent.com/10379601/29446482-04f7036a-841f-11e7-9872-91d1fc2ea683.png".to_string()),
            npm_package: Some("@modelcontextprotocol/server-puppeteer".to_string()),
            github_url: Some("https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer".to_string()),
            documentation_url: Some("https://modelcontextprotocol.io/docs/servers/puppeteer".to_string()),
            tools: vec![
                BundleTool {
                    name: "puppeteer_navigate".to_string(),
                    description: "Navigate to a URL".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "url".to_string(), param_type: "string".to_string(), required: true, description: "URL to navigate to".to_string() },
                    ],
                },
                BundleTool {
                    name: "puppeteer_screenshot".to_string(),
                    description: "Take a screenshot of the current page".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "name".to_string(), param_type: "string".to_string(), required: true, description: "Screenshot name".to_string() },
                    ],
                },
                BundleTool {
                    name: "puppeteer_click".to_string(),
                    description: "Click an element on the page".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "selector".to_string(), param_type: "string".to_string(), required: true, description: "CSS selector".to_string() },
                    ],
                },
                BundleTool {
                    name: "puppeteer_hover".to_string(),
                    description: "Hover over an element on the page".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "selector".to_string(), param_type: "string".to_string(), required: true, description: "CSS selector".to_string() },
                    ],
                },
                BundleTool {
                    name: "puppeteer_fill".to_string(),
                    description: "Fill an input field".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "selector".to_string(), param_type: "string".to_string(), required: true, description: "CSS selector".to_string() },
                        BundleToolParameter { name: "value".to_string(), param_type: "string".to_string(), required: true, description: "Value to fill".to_string() },
                    ],
                },
                BundleTool {
                    name: "puppeteer_select".to_string(),
                    description: "Select an option from a dropdown".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "selector".to_string(), param_type: "string".to_string(), required: true, description: "CSS selector".to_string() },
                        BundleToolParameter { name: "value".to_string(), param_type: "string".to_string(), required: true, description: "Value to select".to_string() },
                    ],
                },
                BundleTool {
                    name: "puppeteer_evaluate".to_string(),
                    description: "Evaluate JavaScript on the page".to_string(),
                    parameters: vec![
                        BundleToolParameter { name: "script".to_string(), param_type: "string".to_string(), required: true, description: "JavaScript code to evaluate".to_string() },
                    ],
                },
            ],
            config_template: McpConfigTemplate {
                command: "npx".to_string(),
                args: vec!["-y".to_string(), "@modelcontextprotocol/server-puppeteer".to_string()],
                env: HashMap::new(),
            },
            required_credentials: vec![],
            verified: true,
            featured: true,
            tags: vec!["browser".to_string(), "automation".to_string(), "puppeteer".to_string(), "web".to_string(), "scraping".to_string()],
            installed: false,
            installed_version: None,
            update_available: false,
        },
    ]
}

/// Fetch servers from the official MCP Registry and adapt its published
/// server.json contract to the bundle model used by the Desktop client.
///
/// The registry search endpoint is also used for queries so discovery is not
/// limited to the first result page loaded by the browser.
async fn fetch_official_registry(search: Option<&str>) -> Result<Vec<McpBundle>, String> {
    use std::time::Duration;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut request = client
        .get(OFFICIAL_MCP_REGISTRY_SERVERS_URL)
        .query(&[("limit", "100"), ("version", "latest")])
        .header("Accept", "application/json")
        .header(
            "User-Agent",
            format!("AGIWorkforce/{}", env!("CARGO_PKG_VERSION")),
        );

    if let Some(query) = search.filter(|query| !query.trim().is_empty()) {
        request = request.query(&[("search", query.trim())]);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Official MCP Registry request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Official MCP Registry returned status: {}",
            response.status()
        ));
    }

    let registry: OfficialRegistryResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse official MCP Registry response: {}", e))?;

    Ok(registry
        .servers
        .into_iter()
        .map(official_registry_bundle)
        .collect())
}

/// Fetch the bundle registry.
///
/// Merges the official MCP Registry with the embedded entries. If the
/// network is unavailable, the embedded directory remains usable.
#[tauri::command]
pub async fn mcpb_fetch_registry(
    state: State<'_, McpbState>,
    app: AppHandle,
) -> Result<Vec<McpBundle>, String> {
    tracing::info!("Fetching MCPB registry");

    let mut bundles = get_embedded_registry();
    match fetch_official_registry(None).await {
        Ok(official_bundles) => {
            tracing::info!(
                "Fetched {} servers from the official MCP Registry",
                official_bundles.len()
            );
            merge_registry_bundles(&mut bundles, official_bundles);
        }
        Err(e) => {
            tracing::warn!(
                "Failed to fetch the official MCP Registry, using the embedded list: {}",
                e
            );
        }
    }

    let allowlist = load_packaged_allowlist(&app);
    let installed = state.installed.lock();
    merge_installed_bundle_snapshots(&mut bundles, &installed.bundles);
    apply_allowlist(&mut bundles, &allowlist);
    mark_installed_bundles(&mut bundles, &installed.bundles);
    drop(installed);

    *state.registry_cache.lock() = bundles.clone();

    tracing::info!("Fetched {} bundles from registry", bundles.len());
    Ok(bundles)
}

/// Search and filter bundles.
#[tauri::command]
pub async fn mcpb_search_bundles(
    state: State<'_, McpbState>,
    app: AppHandle,
    query: String,
    category: Option<String>,
) -> Result<Vec<McpBundle>, String> {
    tracing::info!(
        "Searching bundles: query='{}', category={:?}",
        query,
        category
    );

    let normalized_query = query.trim();
    if !normalized_query.is_empty() {
        match fetch_official_registry(Some(normalized_query)).await {
            Ok(official_matches) => {
                let mut cache = state.registry_cache.lock();
                if cache.is_empty() {
                    *cache = get_embedded_registry();
                }
                merge_registry_bundles(&mut cache, official_matches);
            }
            Err(error) => {
                tracing::warn!(
                    "Official MCP Registry search failed; searching cached entries only: {}",
                    error
                );
            }
        }
    }

    let query_lower = normalized_query.to_lowercase();

    let filtered: Vec<McpBundle> = catalog(&state, &load_packaged_allowlist(&app))
        .into_iter()
        .filter(|bundle| {
            if let Some(ref cat) = category {
                if !cat.is_empty() && bundle.category != *cat {
                    return false;
                }
            }

            if query_lower.is_empty() {
                return true;
            }

            bundle.name.to_lowercase().contains(&query_lower)
                || bundle.description.to_lowercase().contains(&query_lower)
                || bundle
                    .npm_package
                    .as_ref()
                    .is_some_and(|package| package.to_lowercase().contains(&query_lower))
                || bundle
                    .tags
                    .iter()
                    .any(|t| t.to_lowercase().contains(&query_lower))
                || bundle.author.to_lowercase().contains(&query_lower)
        })
        .collect();

    tracing::info!("Search returned {} bundles", filtered.len());
    Ok(filtered)
}

/// Resolves the allow-list shipped alongside the binary. Declared in
/// `tauri.conf.json` under `bundle.resources`, so it exists in every installer;
/// when it does not, [`AllowlistState::permits`] denies in a release build.
fn load_packaged_allowlist(app: &AppHandle) -> crate::core::mcp::manifest::AllowlistState {
    let resolved = app
        .path()
        .resolve(
            crate::core::mcp::manifest::ALLOWLIST_RESOURCE,
            BaseDirectory::Resource,
        )
        .ok();
    crate::core::mcp::manifest::load_state(resolved.as_deref())
}

/// Install a bundle via npm.
#[tauri::command]
pub async fn mcpb_install_bundle(
    state: State<'_, McpbState>,
    mcp_state: State<'_, crate::sys::commands::mcp::McpState>,
    app: AppHandle,
    bundle_id: String,
) -> Result<String, String> {
    tracing::info!("Installing bundle: {}", bundle_id);

    let allowlist = load_packaged_allowlist(&app);
    let bundle = catalog(&state, &allowlist)
        .into_iter()
        .find(|b| b.id == bundle_id)
        .ok_or_else(|| format!("Bundle not found: {}", bundle_id))?;

    let npm_package = bundle
        .npm_package
        .clone()
        .ok_or_else(|| "Bundle has no npm package".to_string())?;
    // The spec is refused before npm can fetch the package and run its install
    // scripts, so a typosquatted registry entry never reaches the network.
    let pin = verified_install_spec(&npm_package, &allowlist)?;
    confirm_package_install(&app, &pin).await?;
    let install_spec = pin.install_spec();

    emit_install_progress(
        &app,
        &InstallProgress {
            bundle_id: bundle_id.clone(),
            phase: "installing".to_string(),
            progress: 10,
            message: format!("Installing {}...", install_spec),
        },
    );

    if let Err(error) = install_pinned_package(&pin).await {
        tracing::error!("{}", error);
        return Err(error);
    }
    tracing::info!("npm install succeeded for {}", install_spec);

    emit_install_progress(
        &app,
        &InstallProgress {
            bundle_id: bundle_id.clone(),
            phase: "configuring".to_string(),
            progress: 60,
            message: "Configuring MCP server...".to_string(),
        },
    );

    let server_name = bundle_id
        .strip_prefix("mcp-")
        .unwrap_or(&bundle_id)
        .to_string();

    let server_config = McpServerConfig {
        command: bundle.config_template.command.clone(),
        args: pinned_launch_args(&bundle.config_template.args, &pin),
        env: bundle.config_template.env.clone(),
        enabled: false, // Start disabled so user can configure credentials
        transport: None,
        allow_local_network: false,
    };

    let config_clone = {
        let mut config = mcp_state.config.lock();
        config
            .mcp_servers
            .insert(server_name.clone(), server_config);
        config.clone()
    };

    mcp_state.persist_config_snapshot(&config_clone).await?;

    emit_install_progress(
        &app,
        &InstallProgress {
            bundle_id: bundle_id.clone(),
            phase: "finalizing".to_string(),
            progress: 90,
            message: "Saving metadata...".to_string(),
        },
    );

    {
        let mut installed = state.installed.lock();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        installed.bundles.insert(
            bundle_id.clone(),
            InstalledBundleMetadata {
                bundle_id: bundle_id.clone(),
                version: pin.version.clone(),
                npm_package: bundle.npm_package.clone(),
                installed_at: now,
                updated_at: now,
                server_name: server_name.clone(),
                bundle: Some(bundle.clone()),
            },
        );
    }

    state.save_installed_metadata().await?;

    tracing::info!("Bundle {} installed successfully", bundle_id);
    Ok(format!(
        "Bundle '{}' installed successfully as MCP server '{}'",
        bundle.name, server_name
    ))
}

/// What uninstalling did. The server leaves the MCP configuration; the npm
/// package stays installed for the whole computer, because another program
/// may run it, so the message says how to remove it too.
fn uninstalled_message(server_name: &str, npm_package: Option<&str>) -> String {
    match npm_package {
        Some(package) => format!(
            "Removed MCP server '{server_name}'. The npm package {package} is still installed on this computer; run `npm uninstall -g {package}` if nothing else uses it."
        ),
        None => format!("Removed MCP server '{server_name}'."),
    }
}

/// Uninstall a bundle.
#[tauri::command]
pub async fn mcpb_uninstall_bundle(
    state: State<'_, McpbState>,
    mcp_state: State<'_, crate::sys::commands::mcp::McpState>,
    bundle_id: String,
) -> Result<String, String> {
    tracing::info!("Uninstalling bundle: {}", bundle_id);

    let metadata = {
        let installed = state.installed.lock();
        installed
            .bundles
            .get(&bundle_id)
            .cloned()
            .ok_or_else(|| format!("Bundle not installed: {}", bundle_id))?
    };

    let (config_clone, orphaned_credential_rows) = {
        let mut config = mcp_state.config.lock();

        let rows = match config.mcp_servers.remove(&metadata.server_name) {
            Some(removed) => config.credential_rows_left_by(
                &crate::core::mcp::config::active_credential_scope(),
                &metadata.server_name,
                &removed,
            ),
            None => Vec::new(),
        };
        (config.clone(), rows)
    };

    mcp_state.persist_config_snapshot(&config_clone).await?;
    if let Err(error) = crate::sys::commands::mcp::forget_credential_rows(&orphaned_credential_rows)
    {
        tracing::warn!(
            "Stored credentials of '{}' were not deleted: {}",
            metadata.server_name,
            error
        );
    }

    {
        let mut installed = state.installed.lock();
        installed.bundles.remove(&bundle_id);
    }

    state.save_installed_metadata().await?;

    tracing::info!("Bundle {} removed from the MCP configuration", bundle_id);
    Ok(uninstalled_message(
        &metadata.server_name,
        metadata.npm_package.as_deref(),
    ))
}

/// Get list of installed bundles.
#[tauri::command]
pub async fn mcpb_get_installed_bundles(
    state: State<'_, McpbState>,
    app: AppHandle,
) -> Result<Vec<McpBundle>, String> {
    tracing::info!("Getting installed bundles");

    let installed_bundles: Vec<McpBundle> = catalog(&state, &load_packaged_allowlist(&app))
        .into_iter()
        .filter(|bundle| bundle.installed)
        .collect();

    tracing::info!("Found {} installed bundles", installed_bundles.len());
    Ok(installed_bundles)
}

/// Update a specific bundle.
#[tauri::command]
pub async fn mcpb_update_bundle(
    state: State<'_, McpbState>,
    mcp_state: State<'_, crate::sys::commands::mcp::McpState>,
    app: AppHandle,
    bundle_id: String,
) -> Result<String, String> {
    tracing::info!("Updating bundle: {}", bundle_id);

    let metadata = {
        let installed = state.installed.lock();
        installed
            .bundles
            .get(&bundle_id)
            .cloned()
            .ok_or_else(|| format!("Bundle not installed: {}", bundle_id))?
    };

    let allowlist = load_packaged_allowlist(&app);
    let bundle = catalog(&state, &allowlist)
        .into_iter()
        .find(|b| b.id == bundle_id)
        .ok_or_else(|| format!("Bundle not found in registry: {}", bundle_id))?;

    if !bundle.update_available {
        return Ok("Bundle is already up to date".to_string());
    }

    let npm_package = bundle
        .npm_package
        .clone()
        .ok_or_else(|| "Bundle has no npm package".to_string())?;
    let pin = verified_install_spec(&npm_package, &allowlist)?;
    confirm_package_install(&app, &pin).await?;

    emit_install_progress(
        &app,
        &InstallProgress {
            bundle_id: bundle_id.clone(),
            phase: "updating".to_string(),
            progress: 20,
            message: format!("Updating to {}...", pin.install_spec()),
        },
    );

    if let Err(error) = install_pinned_package(&pin).await {
        tracing::error!("{}", error);
        return Err(error);
    }

    emit_install_progress(
        &app,
        &InstallProgress {
            bundle_id: bundle_id.clone(),
            phase: "configuring".to_string(),
            progress: 70,
            message: "Updating MCP configuration...".to_string(),
        },
    );

    let config_clone = {
        let mut config = mcp_state.config.lock();
        if let Some(server_config) = config.mcp_servers.get_mut(&metadata.server_name) {
            server_config.args = pinned_launch_args(&bundle.config_template.args, &pin);
        }
        config.clone()
    };

    mcp_state.persist_config_snapshot(&config_clone).await?;

    {
        let mut installed = state.installed.lock();
        if let Some(meta) = installed.bundles.get_mut(&bundle_id) {
            meta.version = pin.version.clone();
            meta.updated_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            meta.bundle = Some(bundle.clone());
        }
    }

    state.save_installed_metadata().await?;

    tracing::info!("Bundle {} updated to version {}", bundle_id, pin.version);
    Ok(format!(
        "Bundle '{}' updated to version {}",
        bundle.name, pin.version
    ))
}

/// Get available categories from the registry.
#[tauri::command]
pub async fn mcpb_get_categories(state: State<'_, McpbState>) -> Result<Vec<String>, String> {
    let cache = state.registry_cache.lock();
    let bundles = if cache.is_empty() {
        drop(cache);
        get_embedded_registry()
    } else {
        cache.clone()
    };

    let mut categories: Vec<String> = bundles.iter().map(|b| b.category.clone()).collect();

    categories.sort();
    categories.dedup();

    Ok(categories)
}

/// Get featured bundles.
#[tauri::command]
pub async fn mcpb_get_featured(
    state: State<'_, McpbState>,
    app: AppHandle,
) -> Result<Vec<McpBundle>, String> {
    Ok(catalog(&state, &load_packaged_allowlist(&app))
        .into_iter()
        .filter(|b| b.featured)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uninstalling_says_the_npm_package_is_still_installed() {
        let message = uninstalled_message("github", Some("@modelcontextprotocol/server-github"));
        assert!(message.contains("still installed"), "{message}");
        assert!(message.contains("npm uninstall -g @modelcontextprotocol/server-github"));
        assert_eq!(
            uninstalled_message("remote", None),
            "Removed MCP server 'remote'."
        );
    }

    fn parse_official_fixture(json: &str) -> Vec<McpBundle> {
        serde_json::from_str::<OfficialRegistryResponse>(json)
            .expect("official registry fixture should parse")
            .servers
            .into_iter()
            .map(official_registry_bundle)
            .collect()
    }

    #[test]
    fn adapts_official_npm_server_without_claiming_agi_verification() {
        let bundles = parse_official_fixture(
            r#"{
                "servers": [{
                    "server": {
                        "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
                        "name": "ai.example/secure-tools",
                        "title": "Secure Tools",
                        "description": "Example tools from the official registry.",
                        "version": "1.2.3",
                        "packages": [{
                            "registryType": "npm",
                            "identifier": "@example/secure-tools",
                            "version": "1.2.3",
                            "runtimeHint": "npx",
                            "transport": { "type": "stdio" },
                            "packageArguments": [{ "type": "positional", "value": "--stdio" }],
                            "environmentVariables": [{
                                "name": "EXAMPLE_API_KEY",
                                "description": "Publisher API key",
                                "isRequired": true,
                                "isSecret": true
                            }]
                        }],
                        "repository": {
                            "url": "https://github.com/example/secure-tools",
                            "source": "github"
                        },
                        "websiteUrl": "https://example.ai/docs"
                    },
                    "_meta": {
                        "io.modelcontextprotocol.registry/official": {
                            "status": "active",
                            "isLatest": true
                        }
                    }
                }],
                "metadata": { "count": 1 }
            }"#,
        );

        let bundle = bundles.first().expect("mapped bundle");
        assert_eq!(bundle.id, "mcp-registry-ai-example-secure-tools");
        assert_eq!(bundle.name, "Secure Tools");
        assert_eq!(bundle.npm_package.as_deref(), Some("@example/secure-tools"));
        assert_eq!(
            bundle.config_template.args,
            vec!["-y", "@example/secure-tools@1.2.3", "--stdio"]
        );
        assert_eq!(
            bundle.config_template.env.get("EXAMPLE_API_KEY"),
            Some(&"<configure:EXAMPLE_API_KEY>".to_string())
        );
        assert_eq!(bundle.required_credentials.len(), 1);
        assert!(bundle.required_credentials[0].required);
        assert!(!bundle.verified);
        let pin = verified_install_spec(
            "@example/secure-tools",
            &allowlist_naming("@example/secure-tools"),
        )
        .unwrap();
        assert_eq!(
            pinned_launch_args(&bundle.config_template.args, &pin),
            vec!["-y", "@example/secure-tools@1.2.3", "--stdio"]
        );
    }

    const PINNED_INTEGRITY: &str = "sha512-kKaFkyAh6oipvc9+EAbJ552JafnMnOq5nzmzWkp1jJdBhTAAGpmIpWihUG1+rfNhmEFM98gUZDdCHCDD4v6a7Q==";

    fn pin_for(package: &str) -> AllowedPackage {
        AllowedPackage {
            name: package.to_string(),
            version: "1.2.3".to_string(),
            integrity: PINNED_INTEGRITY.to_string(),
            allow_scripts: false,
        }
    }

    #[test]
    fn the_install_question_names_the_package_its_version_and_its_scripts() {
        let question = package_install_question(&pin_for("@example/secure-tools"));

        assert!(
            question
                .body
                .contains("install @example/secure-tools version 1.2.3 for every program"),
            "{}",
            question.body
        );
        assert!(question.body.contains("Its install scripts will not run."));
        assert_eq!(question.confirm_label, INSTALL_PACKAGE_LABEL);
        assert!(crate::sys::native_confirm::can_ask_with(
            &question.confirm_label
        ));
        assert!(crate::sys::native_confirm::check_it_fits(&question.body).is_ok());

        let mut scripted = pin_for("@example/secure-tools");
        scripted.allow_scripts = true;
        assert!(package_install_question(&scripted)
            .body
            .contains("Its install scripts will run."));
    }

    /// `npm install -g` runs for the whole computer. Installing and updating
    /// a bundle each ask natively first.
    #[test]
    fn npm_is_not_run_before_the_native_answer() {
        let shipped = include_str!("mcpb.rs")
            .split("#[cfg(test)]")
            .next()
            .unwrap_or_default();
        for command in [
            "pub async fn mcpb_install_bundle(",
            "pub async fn mcpb_update_bundle(",
        ] {
            let body = shipped.split(command).nth(1).expect(command);
            let body = body.split("#[tauri::command]").next().unwrap_or(body);
            let asked = body
                .find("confirm_package_install(&app, &pin).await?")
                .unwrap_or_else(|| panic!("{command} must ask natively"));
            let installed = body
                .find("install_pinned_package(&pin)")
                .unwrap_or_else(|| panic!("{command} installs the pinned package"));
            assert!(asked < installed, "{command} must ask before npm runs");
        }
        assert_eq!(
            shipped.matches("install_pinned_package(&pin)").count(),
            2,
            "every place npm installs a package is one of the two that ask"
        );
    }

    fn allowlist_naming(package: &str) -> AllowlistState {
        AllowlistState::Loaded(crate::core::mcp::manifest::Manifest {
            version: 2,
            allowed_packages: vec![pin_for(package)],
        })
    }

    #[test]
    fn install_skips_scripts_unless_the_pin_allows_them() {
        let mut pin = pin_for("@example/secure-tools");
        assert_eq!(
            npm_install_args(&pin),
            vec![
                "install",
                "-g",
                "--ignore-scripts",
                "@example/secure-tools@1.2.3"
            ]
        );
        pin.allow_scripts = true;
        assert_eq!(
            npm_install_args(&pin),
            vec!["install", "-g", "@example/secure-tools@1.2.3"]
        );
    }

    #[test]
    fn registry_hash_must_equal_the_pin() {
        let pin = pin_for("@example/secure-tools");
        assert!(check_registry_integrity(&pin, Some(PINNED_INTEGRITY)).is_ok());
        assert!(check_registry_integrity(&pin, Some("sha512-other==")).is_err());
        assert!(check_registry_integrity(&pin, None).is_err());
    }

    #[test]
    fn launch_args_run_the_pinned_version() {
        let pin = pin_for("@modelcontextprotocol/server-github");
        let args = vec![
            "-y".to_string(),
            "@modelcontextprotocol/server-github".to_string(),
        ];
        assert_eq!(
            pinned_launch_args(&args, &pin),
            vec!["-y", "@modelcontextprotocol/server-github@1.2.3"]
        );
        let versioned = vec!["@modelcontextprotocol/server-github@9.9.9".to_string()];
        assert_eq!(
            pinned_launch_args(&versioned, &pin),
            vec!["@modelcontextprotocol/server-github@1.2.3"]
        );
    }

    #[test]
    fn scoped_package_url_encodes_the_slash() {
        assert_eq!(
            npm_version_url(&pin_for("@example/secure-tools")),
            "https://registry.npmjs.org/@example%2Fsecure-tools/1.2.3"
        );
    }

    #[test]
    fn no_install_spec_exists_for_a_package_outside_the_allowlist() {
        let refusal = verified_install_spec(
            "@modelcontextprotocol/server-fetchh",
            &allowlist_naming("@modelcontextprotocol/server-fetch"),
        )
        .unwrap_err();

        assert!(refusal.contains("not on the allow-list"), "got: {refusal}");
    }

    #[test]
    fn a_missing_packaged_allowlist_yields_no_install_spec() {
        let refusal = verified_install_spec(
            "@modelcontextprotocol/server-fetch",
            &AllowlistState::Absent,
        )
        .unwrap_err();

        assert!(refusal.contains("Reinstall"), "got: {refusal}");
    }

    #[test]
    fn maps_remote_only_server_to_honest_manual_setup() {
        let bundles = parse_official_fixture(
            r#"{
                "servers": [{
                    "server": {
                        "name": "cloud.example/remote",
                        "description": "Remote-only MCP server.",
                        "version": "4.0.0",
                        "remotes": [{
                            "type": "streamable-http",
                            "url": "https://cloud.example/mcp"
                        }]
                    }
                }]
            }"#,
        );

        let bundle = bundles.first().expect("mapped bundle");
        assert_eq!(bundle.name, "cloud.example/remote");
        assert!(bundle.npm_package.is_none());
        assert_eq!(bundle.config_template.command, "streamable-http");
        assert_eq!(
            bundle.config_template.args,
            vec!["https://cloud.example/mcp"]
        );
        assert!(bundle.tags.contains(&"remote".to_string()));
    }

    #[test]
    fn npm_package_without_stdio_transport_is_not_installable() {
        let bundle = parse_official_fixture(
            r#"{
                "servers": [{
                    "server": {
                        "name": "unsafe.example/ambiguous-package",
                        "description": "Package with no declared transport.",
                        "version": "1.0.0",
                        "packages": [{
                            "registryType": "npm",
                            "identifier": "@unsafe/ambiguous-package",
                            "version": "1.0.0"
                        }]
                    }
                }]
            }"#,
        )
        .remove(0);

        assert!(bundle.npm_package.is_none());
        assert_eq!(bundle.config_template.command, "npm");
    }

    #[test]
    fn reviewed_embedded_entry_wins_an_id_collision() {
        let mut target = get_embedded_registry();
        let reviewed = target
            .iter()
            .find(|bundle| bundle.verified)
            .expect("embedded registry should contain a reviewed entry")
            .clone();
        let mut unreviewed_collision = reviewed.clone();
        unreviewed_collision.name = "Unreviewed replacement".to_string();
        unreviewed_collision.verified = false;

        merge_registry_bundles(&mut target, vec![unreviewed_collision]);

        let merged = target
            .iter()
            .find(|bundle| bundle.id == reviewed.id)
            .expect("reviewed entry should remain");
        assert_eq!(merged.name, reviewed.name);
        assert!(merged.verified);
    }

    #[test]
    fn only_an_allowlisted_package_is_verified_and_offered_at_its_pin() {
        let package = "@modelcontextprotocol/server-filesystem";
        let mut bundles = get_embedded_registry();
        apply_allowlist(&mut bundles, &allowlist_naming(package));

        let pinned = bundles
            .iter()
            .find(|bundle| bundle.npm_package.as_deref() == Some(package))
            .expect("embedded entry for the pinned package");
        assert!(pinned.verified);
        assert_eq!(pinned.version, "1.2.3");
        assert!(bundles
            .iter()
            .filter(|bundle| bundle.npm_package.as_deref() != Some(package))
            .all(|bundle| !bundle.verified));

        apply_allowlist(&mut bundles, &AllowlistState::Absent);
        assert!(bundles.iter().all(|bundle| !bundle.verified));
    }

    #[test]
    fn an_uninstalled_bundle_loses_its_installed_mark() {
        let mut bundles = get_embedded_registry();
        let id = bundles[0].id.clone();
        let metadata = InstalledBundleMetadata {
            bundle_id: id.clone(),
            version: "0.0.1".to_string(),
            npm_package: None,
            installed_at: 1,
            updated_at: 1,
            server_name: "server".to_string(),
            bundle: None,
        };

        mark_installed_bundles(&mut bundles, &HashMap::from([(id, metadata)]));
        assert!(bundles[0].installed);
        assert!(bundles[0].update_available);

        mark_installed_bundles(&mut bundles, &HashMap::new());
        assert!(!bundles[0].installed);
        assert!(bundles[0].installed_version.is_none());
        assert!(!bundles[0].update_available);
    }

    #[test]
    fn installed_registry_snapshot_survives_an_offline_restart() {
        let bundle = parse_official_fixture(
            r#"{
                "servers": [{
                    "server": {
                        "name": "offline.example/tools",
                        "description": "Installed registry server.",
                        "version": "1.0.0",
                        "packages": [{
                            "registryType": "npm",
                            "identifier": "@offline/example-tools",
                            "version": "1.0.0",
                            "transport": { "type": "stdio" }
                        }]
                    }
                }]
            }"#,
        )
        .remove(0);
        let metadata = InstalledBundleMetadata {
            bundle_id: bundle.id.clone(),
            version: bundle.version.clone(),
            npm_package: bundle.npm_package.clone(),
            installed_at: 1,
            updated_at: 1,
            server_name: "registry-offline-example-tools".to_string(),
            bundle: Some(bundle.clone()),
        };
        let installed = HashMap::from([(bundle.id.clone(), metadata)]);
        let mut offline_registry = Vec::new();

        merge_installed_bundle_snapshots(&mut offline_registry, &installed);
        mark_installed_bundles(&mut offline_registry, &installed);

        assert_eq!(offline_registry.len(), 1);
        assert_eq!(offline_registry[0].id, bundle.id);
        assert!(offline_registry[0].installed);
    }

    #[test]
    fn legacy_install_metadata_without_snapshot_still_loads() {
        let metadata: InstalledBundleMetadata = serde_json::from_str(
            r#"{
                "bundleId": "mcp-filesystem",
                "version": "1.0.0",
                "npmPackage": "@modelcontextprotocol/server-filesystem",
                "installedAt": 1,
                "updatedAt": 1,
                "serverName": "filesystem"
            }"#,
        )
        .expect("legacy metadata should remain compatible");

        assert!(metadata.bundle.is_none());
    }
}
