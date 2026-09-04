//! Hosted plugin registry resolution (CAP-046 slice 4).
//!
//! `plugins.rs` already installs a plugin from a local directory or a git URL,
//! and it already understands `name@marketplace` dependency addressing, but
//! there was nowhere to ask what `name@marketplace` MEANS. This module is that
//! lookup: it resolves a plugin reference against the hosted registry that
//! `apps/web/app/api/plugins` serves, and hands the resulting
//! [`PluginManifest`] back to the existing loader.
//!
//! Three rules shape everything here:
//!
//! 1. **No hardcoded production URL.** The registry base URL must be supplied
//!    by the user, through `AGI_PLUGIN_REGISTRY_URL` or the
//!    `[plugins] registry_url` key in `~/.agiworkforce/config.toml`. A CLI that
//!    silently phones a default host is a network side effect nobody approved.
//! 2. **Fail closed on integrity.** A manifest artifact is only accepted when
//!    its SHA-256 matches the digest the registry published for it. Resolution
//!    of an artifact with no published digest is refused unless the caller
//!    explicitly opts in, mirroring `plugin install`'s existing
//!    `--integrity` / `--unsafe-no-integrity` contract.
//! 3. **Never claim installability the registry did not.** A `preview` entry
//!    has no artifact; resolving it returns [`RegistryError::NotInstallable`]
//!    instead of synthesizing a manifest from the entry's declared contents.
//!
//! Transport is behind the [`RegistryTransport`] trait so the resolution logic
//! is testable without a network, and so the same logic can be driven by the
//! real HTTP client (`HttpRegistryTransport`).

use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::plugins::{validate_plugin_name, PluginManifest};

/// Environment variable that supplies the registry base URL. Takes precedence
/// over the config file so a one-off `AGI_PLUGIN_REGISTRY_URL=… agi …` works.
pub const REGISTRY_URL_ENV: &str = "AGI_PLUGIN_REGISTRY_URL";

/// Config file key, documented for `agi config` and the docs site:
/// `~/.agiworkforce/config.toml` → `[plugins]` → `registry_url`.
pub const REGISTRY_URL_CONFIG_KEY: &str = "plugins.registry_url";

/// Request timeout for registry lookups and manifest downloads.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

/// A manifest artifact is a JSON document; anything larger is refused before it
/// is parsed so a hostile registry cannot exhaust memory.
const MAX_MANIFEST_BYTES: usize = 1024 * 1024;

/// How deep a dependency chain may go before resolution gives up.
const MAX_DEPENDENCY_DEPTH: usize = 8;

/// Total plugins one resolution may pull in, including the root.
const MAX_RESOLVED_PLUGINS: usize = 32;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RegistryError {
    /// No registry URL configured. Carries the exact keys to set.
    NotConfigured,
    /// The configured or returned URL is unusable (bad scheme, plaintext to a
    /// remote host, unparseable).
    InvalidUrl(String),
    /// The plugin reference is not a usable plugin name.
    InvalidReference(String),
    /// Registry replied, but not with a usable entry.
    NotFound(String),
    /// The entry exists and is honest about not being installable.
    NotInstallable { name: String, status: String },
    /// The registry published no digest for the artifact and the caller did not
    /// opt into unverified resolution.
    MissingIntegrity(String),
    /// The downloaded artifact does not match the published digest.
    IntegrityMismatch {
        name: String,
        expected: String,
        actual: String,
    },
    /// Transport failure (DNS, TLS, timeout, non-2xx).
    Transport(String),
    /// Response body was not the shape the contract defines.
    Malformed(String),
    /// Dependency graph is cyclic or larger than the resolver accepts.
    DependencyLimit(String),
}

impl std::fmt::Display for RegistryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotConfigured => write!(
                f,
                "no plugin registry configured; set {} or `{}` in ~/.agiworkforce/config.toml",
                REGISTRY_URL_ENV, REGISTRY_URL_CONFIG_KEY
            ),
            Self::InvalidUrl(detail) => write!(f, "invalid registry URL: {detail}"),
            Self::InvalidReference(detail) => write!(f, "invalid plugin reference: {detail}"),
            Self::NotFound(name) => write!(f, "plugin '{name}' is not in this registry"),
            Self::NotInstallable { name, status } => write!(
                f,
                "plugin '{name}' is listed as '{status}' and has no published artifact, there is nothing to install yet"
            ),
            Self::MissingIntegrity(name) => write!(
                f,
                "plugin '{name}' has no published sha256; refusing to resolve it without an explicit unverified opt-in"
            ),
            Self::IntegrityMismatch {
                name,
                expected,
                actual,
            } => write!(
                f,
                "integrity mismatch for '{name}': expected sha256:{expected}, got sha256:{actual}"
            ),
            Self::Transport(detail) => write!(f, "registry request failed: {detail}"),
            Self::Malformed(detail) => write!(f, "registry response was malformed: {detail}"),
            Self::DependencyLimit(detail) => write!(f, "dependency resolution refused: {detail}"),
        }
    }
}

impl std::error::Error for RegistryError {}

// ---------------------------------------------------------------------------
// Wire types, mirror packages/contracts/types/src/plugins.ts
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryPublisher {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    /// `first-party` or `third-party`. Never used to grant trust, it is
    /// displayed, and third-party entries do not exist at launch.
    #[serde(default)]
    pub kind: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryDistribution {
    pub manifest_url: String,
    #[serde(default)]
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryIntegrity {
    #[serde(default)]
    pub sha256: Option<String>,
    /// Always `None` today: the registry has no signing key and no verifier.
    /// Present so a signing policy can populate it without a wire break.
    #[serde(default)]
    pub signature: Option<String>,
    #[serde(default)]
    pub signature_algorithm: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryEntry {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub publisher: RegistryPublisher,
    /// `preview` | `published` | `deprecated`.
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub distribution: Option<RegistryDistribution>,
    #[serde(default)]
    pub integrity: RegistryIntegrity,
    /// Unknown fields are preserved rather than rejected, matching how
    /// `PluginManifest` tolerates surplus keys.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryEntryResponse {
    pub entry: RegistryEntry,
    /// The inline manifest, when the registry stores one. It is metadata for
    /// display, resolution always re-downloads and verifies the artifact.
    #[serde(default)]
    pub manifest: Option<PluginManifest>,
}

/// A plugin the registry resolved, with its verification result attached.
#[derive(Debug, Clone)]
pub struct ResolvedPlugin {
    /// The name the caller asked for (the install directory name).
    pub name: String,
    /// The registry entry.
    pub entry: RegistryEntry,
    /// The manifest parsed from the DOWNLOADED artifact, never the inline copy.
    pub manifest: PluginManifest,
    /// Raw artifact bytes, so a caller can write exactly what was verified.
    pub manifest_bytes: Vec<u8>,
    /// Digest actually computed over `manifest_bytes`.
    pub sha256: String,
    /// True when `sha256` matched a digest the registry published. False only
    /// when the caller explicitly allowed unverified resolution.
    pub integrity_verified: bool,
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Resolve the registry base URL from an env value and the contents of
/// `~/.agiworkforce/config.toml`, in that order.
///
/// Pure so the precedence rules are testable without touching a real HOME.
pub fn resolve_registry_url(
    env_value: Option<&str>,
    config_toml: Option<&str>,
) -> Result<String, RegistryError> {
    if let Some(raw) = env_value.map(str::trim).filter(|v| !v.is_empty()) {
        return normalize_base_url(raw);
    }

    let Some(contents) = config_toml else {
        return Err(RegistryError::NotConfigured);
    };
    let parsed: toml::Value = toml::from_str(contents)
        .map_err(|e| RegistryError::InvalidUrl(format!("config.toml is not valid TOML: {e}")))?;
    let raw = parsed
        .get("plugins")
        .and_then(|plugins| plugins.get("registry_url"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or(RegistryError::NotConfigured)?;

    normalize_base_url(raw)
}

/// Path of the global config file the registry URL is read from.
pub fn registry_config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".agiworkforce").join("config.toml"))
}

/// Read the configured registry URL from the environment and global config.
pub fn configured_registry_url() -> Result<String, RegistryError> {
    let env_value = std::env::var(REGISTRY_URL_ENV).ok();
    let config = registry_config_path()
        .filter(|path| path.exists())
        .and_then(|path| std::fs::read_to_string(path).ok());
    resolve_registry_url(env_value.as_deref(), config.as_deref())
}

/// Accept only `https://`, plus `http://` to a loopback host for local
/// development. A plaintext registry on the open internet would let anyone on
/// the path swap the manifest the CLI is about to execute.
fn normalize_base_url(raw: &str) -> Result<String, RegistryError> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(RegistryError::InvalidUrl("URL is empty".to_string()));
    }

    let (scheme, rest) = trimmed
        .split_once("://")
        .ok_or_else(|| RegistryError::InvalidUrl(format!("missing scheme: {trimmed}")))?;
    let scheme = scheme.to_ascii_lowercase();
    if scheme != "https" && scheme != "http" {
        return Err(RegistryError::InvalidUrl(format!(
            "unsupported scheme '{scheme}'; use https"
        )));
    }

    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.is_empty() {
        return Err(RegistryError::InvalidUrl(format!(
            "missing host: {trimmed}"
        )));
    }
    // Credentials in the URL would end up in logs and process listings.
    if authority.contains('@') {
        return Err(RegistryError::InvalidUrl(
            "registry URL must not embed credentials".to_string(),
        ));
    }
    let host = authority
        .rsplit_once(':')
        .map(|(host, _)| host)
        .unwrap_or(authority)
        .to_ascii_lowercase();

    let is_loopback =
        host == "localhost" || host == "127.0.0.1" || host == "[::1]" || host == "::1";
    if scheme == "http" && !is_loopback {
        return Err(RegistryError::InvalidUrl(format!(
            "refusing plaintext http to non-loopback host '{host}'; use https"
        )));
    }

    Ok(trimmed.to_string())
}

/// Split a plugin reference into `(name, marketplace)`.
///
/// `plugins.rs` records dependencies as `"name"` or `"name@marketplace"`; this
/// is the parser for that addressing. The name half is validated with the same
/// rules the installer uses, so a reference can never become a path segment
/// that escapes the plugins directory or the registry's URL space.
pub fn parse_plugin_reference(reference: &str) -> Result<(String, Option<String>), RegistryError> {
    let trimmed = reference.trim();
    if trimmed.is_empty() {
        return Err(RegistryError::InvalidReference(
            "reference is empty".to_string(),
        ));
    }

    let (name, marketplace) = match trimmed.split_once('@') {
        Some((name, marketplace)) => {
            let marketplace = marketplace.trim();
            if marketplace.is_empty() {
                return Err(RegistryError::InvalidReference(format!(
                    "'{trimmed}' has an empty marketplace"
                )));
            }
            if marketplace.contains('@') || marketplace.contains('/') {
                return Err(RegistryError::InvalidReference(format!(
                    "'{trimmed}' has an unusable marketplace segment"
                )));
            }
            (name.trim(), Some(marketplace.to_string()))
        }
        None => (trimmed, None),
    };

    validate_plugin_name(name).map_err(RegistryError::InvalidReference)?;
    Ok((name.to_string(), marketplace))
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/// Everything the resolver needs from the network, so resolution logic can be
/// exercised without one.
#[async_trait::async_trait]
pub trait RegistryTransport: Send + Sync {
    /// GET `url`, returning the raw body on a 2xx response.
    async fn get(&self, url: &str) -> Result<Vec<u8>, RegistryError>;
}

/// The real client: JSON over HTTPS with a bounded timeout and a body cap.
pub struct HttpRegistryTransport {
    client: reqwest::Client,
}

impl HttpRegistryTransport {
    pub fn new() -> Result<Self, RegistryError> {
        let client = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .user_agent(concat!("agi-cli/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| RegistryError::Transport(e.to_string()))?;
        Ok(Self { client })
    }
}

#[async_trait::async_trait]
impl RegistryTransport for HttpRegistryTransport {
    async fn get(&self, url: &str) -> Result<Vec<u8>, RegistryError> {
        let response = self
            .client
            .get(url)
            .header("accept", "application/json")
            .send()
            .await
            .map_err(|e| RegistryError::Transport(e.to_string()))?;

        let status = response.status();
        if !status.is_success() {
            if status == reqwest::StatusCode::NOT_FOUND {
                return Err(RegistryError::NotFound(url.to_string()));
            }
            return Err(RegistryError::Transport(format!("HTTP {status}")));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| RegistryError::Transport(e.to_string()))?;
        if bytes.len() > MAX_MANIFEST_BYTES {
            return Err(RegistryError::Malformed(format!(
                "response exceeds {MAX_MANIFEST_BYTES} bytes"
            )));
        }
        Ok(bytes.to_vec())
    }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/// Resolution knobs. `Default` is the strict, fail-closed setting: every field
/// here must default to the safe value, which is why the derive is safe.
#[derive(Debug, Clone, Copy, Default)]
pub struct ResolveOptions {
    /// Accept an artifact the registry published no digest for. Off by default;
    /// the caller must surface this to the user the way `plugin install`
    /// surfaces `--unsafe-no-integrity`.
    pub allow_unverified: bool,
}

/// A registry bound to one base URL and one transport.
pub struct PluginRegistryClient<T: RegistryTransport> {
    base_url: String,
    transport: T,
}

impl<T: RegistryTransport> PluginRegistryClient<T> {
    /// Build a client against an already-validated base URL.
    pub fn new(base_url: impl Into<String>, transport: T) -> Result<Self, RegistryError> {
        Ok(Self {
            base_url: normalize_base_url(&base_url.into())?,
            transport,
        })
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    fn entry_url(&self, name: &str) -> String {
        format!("{}/api/plugins/{}", self.base_url, name)
    }

    /// Fetch one registry entry (plus its inline manifest, if any).
    pub async fn fetch_entry(
        &self,
        reference: &str,
    ) -> Result<RegistryEntryResponse, RegistryError> {
        let (name, _marketplace) = parse_plugin_reference(reference)?;
        let body = self.transport.get(&self.entry_url(&name)).await?;
        let parsed: RegistryEntryResponse = serde_json::from_slice(&body)
            .map_err(|e| RegistryError::Malformed(format!("entry for '{name}': {e}")))?;
        if parsed.entry.id.is_empty() {
            return Err(RegistryError::Malformed(format!(
                "entry for '{name}' has no id"
            )));
        }
        Ok(parsed)
    }

    /// Resolve one plugin: fetch the entry, download its artifact, verify the
    /// digest, and parse the manifest.
    pub async fn resolve(
        &self,
        reference: &str,
        options: ResolveOptions,
    ) -> Result<ResolvedPlugin, RegistryError> {
        let (name, _marketplace) = parse_plugin_reference(reference)?;
        let response = self.fetch_entry(&name).await?;
        let entry = response.entry;

        // An entry that is not `published`, or that carries no artifact, is not
        // installable. The inline manifest is deliberately NOT used as a
        // fallback: it would install contents nobody published.
        let distribution = match (&entry.status[..], entry.distribution.clone()) {
            ("published", Some(distribution)) => distribution,
            (status, _) => {
                return Err(RegistryError::NotInstallable {
                    name,
                    status: status.to_string(),
                })
            }
        };

        let manifest_url = validate_artifact_url(&distribution.manifest_url)?;
        let expected = distribution
            .sha256
            .as_deref()
            .or(entry.integrity.sha256.as_deref())
            .map(str::trim)
            .filter(|digest| !digest.is_empty());

        if expected.is_none() && !options.allow_unverified {
            return Err(RegistryError::MissingIntegrity(name));
        }

        let bytes = self.transport.get(&manifest_url).await?;
        if bytes.len() > MAX_MANIFEST_BYTES {
            return Err(RegistryError::Malformed(format!(
                "manifest for '{name}' exceeds {MAX_MANIFEST_BYTES} bytes"
            )));
        }

        let actual = sha256_hex(&bytes);
        let mut integrity_verified = false;
        if let Some(expected) = expected {
            let expected = expected.trim_start_matches("sha256:");
            if !actual.eq_ignore_ascii_case(expected) {
                return Err(RegistryError::IntegrityMismatch {
                    name,
                    expected: expected.to_string(),
                    actual,
                });
            }
            integrity_verified = true;
        }

        let manifest: PluginManifest = serde_json::from_slice(&bytes)
            .map_err(|e| RegistryError::Malformed(format!("manifest for '{name}': {e}")))?;

        Ok(ResolvedPlugin {
            name,
            entry,
            manifest,
            manifest_bytes: bytes,
            sha256: actual,
            integrity_verified,
        })
    }

    /// Resolve a plugin and everything its manifest depends on.
    ///
    /// Breadth-first with a visited set, a depth cap, and a total cap, so a
    /// registry that returns a cyclic or unbounded dependency graph cannot spin
    /// the CLI forever. The root is always first in the returned vector.
    pub async fn resolve_with_dependencies(
        &self,
        reference: &str,
        options: ResolveOptions,
    ) -> Result<Vec<ResolvedPlugin>, RegistryError> {
        let mut resolved: Vec<ResolvedPlugin> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();
        let mut queue: Vec<(String, usize)> = vec![(reference.to_string(), 0)];

        while let Some((current, depth)) = queue.first().cloned() {
            queue.remove(0);

            let (name, _) = parse_plugin_reference(&current)?;
            if !seen.insert(name.clone()) {
                // Already resolved: a diamond dependency, not an error. A cycle
                // terminates here too, which is why the visited set is checked
                // before any fetch.
                continue;
            }
            if depth > MAX_DEPENDENCY_DEPTH {
                return Err(RegistryError::DependencyLimit(format!(
                    "dependency chain deeper than {MAX_DEPENDENCY_DEPTH} at '{name}'"
                )));
            }
            if resolved.len() >= MAX_RESOLVED_PLUGINS {
                return Err(RegistryError::DependencyLimit(format!(
                    "more than {MAX_RESOLVED_PLUGINS} plugins in one resolution"
                )));
            }

            let plugin = self.resolve(&name, options).await?;
            for dependency in &plugin.manifest.dependencies {
                queue.push((dependency.clone(), depth + 1));
            }
            resolved.push(plugin);
        }

        Ok(resolved)
    }
}

/// Artifact URLs come from the registry, so they are untrusted input: enforce
/// the same scheme rules as the base URL and reject anything that is not an
/// absolute http(s) URL (`file://`, `data:`, a bare path, …).
fn validate_artifact_url(raw: &str) -> Result<String, RegistryError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(RegistryError::InvalidUrl(
            "manifest URL is empty".to_string(),
        ));
    }
    normalize_base_url(trimmed).map(|_| trimmed.to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Arc;
    use std::sync::Mutex;

    /// In-memory transport: a URL -> response map plus a request log, so tests
    /// assert on exactly which URLs the resolver fetched and in what order.
    #[derive(Default)]
    struct MockTransport {
        responses: HashMap<String, Result<Vec<u8>, RegistryError>>,
        requested: Arc<Mutex<Vec<String>>>,
    }

    impl MockTransport {
        fn with(mut self, url: &str, body: &str) -> Self {
            self.responses
                .insert(url.to_string(), Ok(body.as_bytes().to_vec()));
            self
        }

        fn with_error(mut self, url: &str, error: RegistryError) -> Self {
            self.responses.insert(url.to_string(), Err(error));
            self
        }

        fn log(&self) -> Arc<Mutex<Vec<String>>> {
            Arc::clone(&self.requested)
        }
    }

    #[async_trait::async_trait]
    impl RegistryTransport for MockTransport {
        async fn get(&self, url: &str) -> Result<Vec<u8>, RegistryError> {
            self.requested.lock().unwrap().push(url.to_string());
            match self.responses.get(url) {
                Some(Ok(body)) => Ok(body.clone()),
                Some(Err(error)) => Err(error.clone()),
                None => Err(RegistryError::NotFound(url.to_string())),
            }
        }
    }

    const BASE: &str = "https://registry.example.com";

    fn manifest_json(name: &str, dependencies: &[&str]) -> String {
        let deps = dependencies
            .iter()
            .map(|d| format!("\"{d}\""))
            .collect::<Vec<_>>()
            .join(",");
        format!(r#"{{"name":"{name}","version":"1.0.0","dependencies":[{deps}]}}"#)
    }

    fn entry_json(name: &str, status: &str, artifact: Option<(&str, Option<&str>)>) -> String {
        let distribution = match artifact {
            Some((url, Some(sha))) => {
                format!(r#"{{"manifestUrl":"{url}","sha256":"{sha}"}}"#)
            }
            Some((url, None)) => format!(r#"{{"manifestUrl":"{url}","sha256":null}}"#),
            None => "null".to_string(),
        };
        format!(
            r#"{{"entry":{{"id":"{name}","name":"{name}","version":"1.0.0","description":"","publisher":{{"id":"agi","name":"AGI","kind":"first-party"}},"status":"{status}","distribution":{distribution},"integrity":{{"sha256":null,"signature":null,"signatureAlgorithm":null}}}},"manifest":null}}"#
        )
    }

    // ── Configuration ──────────────────────────────────────────────────────

    #[test]
    fn registry_url_requires_explicit_configuration() {
        assert_eq!(
            resolve_registry_url(None, None).unwrap_err(),
            RegistryError::NotConfigured
        );
        assert_eq!(
            resolve_registry_url(Some("   "), Some("[plugins]\n")).unwrap_err(),
            RegistryError::NotConfigured
        );
    }

    #[test]
    fn registry_url_comes_from_env_then_config() {
        let config = "[plugins]\nregistry_url = \"https://from-config.example\"\n";
        assert_eq!(
            resolve_registry_url(Some("https://from-env.example"), Some(config)).unwrap(),
            "https://from-env.example"
        );
        assert_eq!(
            resolve_registry_url(None, Some(config)).unwrap(),
            "https://from-config.example"
        );
    }

    #[test]
    fn registry_url_trailing_slash_is_normalized() {
        assert_eq!(
            resolve_registry_url(Some("https://registry.example.com/"), None).unwrap(),
            "https://registry.example.com"
        );
    }

    #[test]
    fn registry_url_rejects_plaintext_and_hostile_schemes() {
        for url in [
            "http://registry.example.com",
            "file:///etc/passwd",
            "ftp://registry.example.com",
            "registry.example.com",
            "https://",
            "https://user:pass@registry.example.com",
        ] {
            assert!(
                matches!(
                    resolve_registry_url(Some(url), None),
                    Err(RegistryError::InvalidUrl(_))
                ),
                "{url} should be rejected"
            );
        }
    }

    #[test]
    fn registry_url_allows_plaintext_loopback_for_local_development() {
        for url in ["http://localhost:3000", "http://127.0.0.1:3000"] {
            assert_eq!(resolve_registry_url(Some(url), None).unwrap(), url);
        }
    }

    // ── Reference parsing ──────────────────────────────────────────────────

    #[test]
    fn plugin_reference_parses_name_and_marketplace() {
        assert_eq!(
            parse_plugin_reference("github-automation").unwrap(),
            ("github-automation".to_string(), None)
        );
        assert_eq!(
            parse_plugin_reference(" github-automation@agi ").unwrap(),
            ("github-automation".to_string(), Some("agi".to_string()))
        );
    }

    #[test]
    fn plugin_reference_rejects_traversal_and_empty_segments() {
        for reference in [
            "", "   ", "../evil", "a/b", "@agi", "name@", "name@a/b", "-x",
        ] {
            assert!(
                parse_plugin_reference(reference).is_err(),
                "{reference:?} should be rejected"
            );
        }
    }

    // ── Resolution ─────────────────────────────────────────────────────────

    #[tokio::test]
    async fn resolves_a_published_plugin_and_verifies_the_digest() {
        let manifest = manifest_json("github-automation", &[]);
        let digest = sha256_hex(manifest.as_bytes());
        let artifact = "https://cdn.example.com/github-automation-1.0.0.json";
        let transport = MockTransport::default()
            .with(
                &format!("{BASE}/api/plugins/github-automation"),
                &entry_json(
                    "github-automation",
                    "published",
                    Some((artifact, Some(&digest))),
                ),
            )
            .with(artifact, &manifest);
        let log = transport.log();
        let client = PluginRegistryClient::new(BASE, transport).unwrap();

        let resolved = client
            .resolve("github-automation", ResolveOptions::default())
            .await
            .unwrap();

        assert_eq!(resolved.name, "github-automation");
        assert_eq!(resolved.manifest.name.as_deref(), Some("github-automation"));
        assert_eq!(resolved.sha256, digest);
        assert!(resolved.integrity_verified);
        assert_eq!(
            log.lock().unwrap().as_slice(),
            [
                format!("{BASE}/api/plugins/github-automation"),
                artifact.to_string()
            ]
        );
    }

    #[tokio::test]
    async fn refuses_a_manifest_whose_digest_does_not_match() {
        let artifact = "https://cdn.example.com/tampered.json";
        let transport = MockTransport::default()
            .with(
                &format!("{BASE}/api/plugins/github-automation"),
                &entry_json(
                    "github-automation",
                    "published",
                    Some((artifact, Some(&"0".repeat(64)))),
                ),
            )
            .with(artifact, &manifest_json("github-automation", &[]));
        let client = PluginRegistryClient::new(BASE, transport).unwrap();

        let error = client
            .resolve("github-automation", ResolveOptions::default())
            .await
            .unwrap_err();

        assert!(
            matches!(error, RegistryError::IntegrityMismatch { .. }),
            "{error}"
        );
    }

    #[tokio::test]
    async fn refuses_an_artifact_with_no_published_digest_unless_opted_in() {
        let manifest = manifest_json("research-pack", &[]);
        let artifact = "https://cdn.example.com/research-pack.json";
        let entry = entry_json("research-pack", "published", Some((artifact, None)));
        let build = || {
            MockTransport::default()
                .with(&format!("{BASE}/api/plugins/research-pack"), &entry)
                .with(artifact, &manifest)
        };

        let strict = PluginRegistryClient::new(BASE, build()).unwrap();
        assert!(matches!(
            strict
                .resolve("research-pack", ResolveOptions::default())
                .await
                .unwrap_err(),
            RegistryError::MissingIntegrity(_)
        ));

        let lenient = PluginRegistryClient::new(BASE, build()).unwrap();
        let resolved = lenient
            .resolve(
                "research-pack",
                ResolveOptions {
                    allow_unverified: true,
                },
            )
            .await
            .unwrap();
        assert!(!resolved.integrity_verified);
        assert_eq!(resolved.sha256, sha256_hex(manifest.as_bytes()));
    }

    #[tokio::test]
    async fn refuses_a_preview_entry_instead_of_using_its_inline_manifest() {
        let transport = MockTransport::default().with(
            &format!("{BASE}/api/plugins/crm-sync"),
            &entry_json("crm-sync", "preview", None),
        );
        let log = transport.log();
        let client = PluginRegistryClient::new(BASE, transport).unwrap();

        let error = client
            .resolve("crm-sync", ResolveOptions::default())
            .await
            .unwrap_err();

        assert!(
            matches!(error, RegistryError::NotInstallable { ref status, .. } if status == "preview"),
            "{error}"
        );
        // Only the entry lookup happened, nothing was downloaded.
        assert_eq!(log.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn refuses_a_deprecated_entry() {
        let artifact = "https://cdn.example.com/old.json";
        let transport = MockTransport::default().with(
            &format!("{BASE}/api/plugins/crm-sync"),
            &entry_json("crm-sync", "deprecated", Some((artifact, None))),
        );
        let client = PluginRegistryClient::new(BASE, transport).unwrap();

        assert!(matches!(
            client
                .resolve("crm-sync", ResolveOptions::default())
                .await
                .unwrap_err(),
            RegistryError::NotInstallable { .. }
        ));
    }

    #[tokio::test]
    async fn refuses_a_non_http_artifact_url() {
        let transport = MockTransport::default().with(
            &format!("{BASE}/api/plugins/evil"),
            &entry_json("evil", "published", Some(("file:///etc/passwd", None))),
        );
        let client = PluginRegistryClient::new(BASE, transport).unwrap();

        assert!(matches!(
            client
                .resolve(
                    "evil",
                    ResolveOptions {
                        allow_unverified: true
                    }
                )
                .await
                .unwrap_err(),
            RegistryError::InvalidUrl(_)
        ));
    }

    #[tokio::test]
    async fn reports_a_missing_plugin_rather_than_a_generic_failure() {
        let client = PluginRegistryClient::new(BASE, MockTransport::default()).unwrap();
        assert!(matches!(
            client
                .resolve("does-not-exist", ResolveOptions::default())
                .await
                .unwrap_err(),
            RegistryError::NotFound(_)
        ));
    }

    #[tokio::test]
    async fn reports_a_malformed_registry_body() {
        let transport =
            MockTransport::default().with(&format!("{BASE}/api/plugins/broken"), "not json");
        let client = PluginRegistryClient::new(BASE, transport).unwrap();
        assert!(matches!(
            client.fetch_entry("broken").await.unwrap_err(),
            RegistryError::Malformed(_)
        ));
    }

    #[tokio::test]
    async fn propagates_a_transport_failure() {
        let transport = MockTransport::default().with_error(
            &format!("{BASE}/api/plugins/flaky"),
            RegistryError::Transport("HTTP 503".to_string()),
        );
        let client = PluginRegistryClient::new(BASE, transport).unwrap();
        assert!(matches!(
            client.fetch_entry("flaky").await.unwrap_err(),
            RegistryError::Transport(_)
        ));
    }

    // ── Dependency resolution ──────────────────────────────────────────────

    fn published(transport: MockTransport, name: &str, deps: &[&str]) -> MockTransport {
        let manifest = manifest_json(name, deps);
        let digest = sha256_hex(manifest.as_bytes());
        let artifact = format!("https://cdn.example.com/{name}.json");
        transport
            .with(
                &format!("{BASE}/api/plugins/{name}"),
                &entry_json(name, "published", Some((&artifact, Some(&digest)))),
            )
            .with(&artifact, &manifest)
    }

    #[tokio::test]
    async fn resolves_dependencies_including_marketplace_addressing() {
        let mut transport = MockTransport::default();
        transport = published(transport, "root-pack", &["base-pack@agi"]);
        transport = published(transport, "base-pack", &[]);
        let client = PluginRegistryClient::new(BASE, transport).unwrap();

        let resolved = client
            .resolve_with_dependencies("root-pack", ResolveOptions::default())
            .await
            .unwrap();

        assert_eq!(
            resolved
                .iter()
                .map(|plugin| plugin.name.as_str())
                .collect::<Vec<_>>(),
            ["root-pack", "base-pack"]
        );
        assert!(resolved.iter().all(|plugin| plugin.integrity_verified));
    }

    #[tokio::test]
    async fn dependency_cycle_terminates_without_repeating_a_fetch() {
        let mut transport = MockTransport::default();
        transport = published(transport, "a-pack", &["b-pack"]);
        transport = published(transport, "b-pack", &["a-pack"]);
        let log = transport.log();
        let client = PluginRegistryClient::new(BASE, transport).unwrap();

        let resolved = client
            .resolve_with_dependencies("a-pack", ResolveOptions::default())
            .await
            .unwrap();

        assert_eq!(resolved.len(), 2);
        let entry_fetches = log
            .lock()
            .unwrap()
            .iter()
            .filter(|url| url.contains("/api/plugins/"))
            .count();
        assert_eq!(entry_fetches, 2, "each plugin fetched exactly once");
    }

    #[tokio::test]
    async fn a_broken_dependency_fails_the_whole_resolution() {
        let mut transport = MockTransport::default();
        transport = published(transport, "root-pack", &["missing-pack"]);
        let client = PluginRegistryClient::new(BASE, transport).unwrap();

        assert!(matches!(
            client
                .resolve_with_dependencies("root-pack", ResolveOptions::default())
                .await
                .unwrap_err(),
            RegistryError::NotFound(_)
        ));
    }

    #[tokio::test]
    async fn a_hostile_dependency_reference_is_rejected_before_any_fetch() {
        let mut transport = MockTransport::default();
        transport = published(transport, "root-pack", &["../../etc/passwd"]);
        let client = PluginRegistryClient::new(BASE, transport).unwrap();

        assert!(matches!(
            client
                .resolve_with_dependencies("root-pack", ResolveOptions::default())
                .await
                .unwrap_err(),
            RegistryError::InvalidReference(_)
        ));
    }

    // ── Real HTTP path ─────────────────────────────────────────────────────

    /// Drives `HttpRegistryTransport` against a loopback server that speaks
    /// HTTP/1.1 by hand, so the reqwest client, the URL rules, the digest
    /// check, and the manifest parse are all exercised for real, no mock
    /// standing in for the transport itself.
    #[tokio::test]
    async fn resolves_over_real_http_against_a_loopback_server() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let manifest = manifest_json("loopback-pack", &[]);
        let digest = sha256_hex(manifest.as_bytes());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let base = format!("http://127.0.0.1:{port}");
        let entry = entry_json(
            "loopback-pack",
            "published",
            Some((
                &format!("{base}/artifacts/loopback-pack.json"),
                Some(&digest),
            )),
        );
        let manifest_body = manifest.clone();

        let server = tokio::spawn(async move {
            for _ in 0..2 {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut buffer = [0u8; 2048];
                let read = socket.read(&mut buffer).await.unwrap();
                let request = String::from_utf8_lossy(&buffer[..read]).to_string();
                let body = if request.contains("/artifacts/") {
                    manifest_body.clone()
                } else {
                    entry.clone()
                };
                let response = format!(
                    "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                socket.write_all(response.as_bytes()).await.unwrap();
                socket.flush().await.unwrap();
            }
        });

        let client =
            PluginRegistryClient::new(&base, HttpRegistryTransport::new().unwrap()).unwrap();
        let resolved = client
            .resolve("loopback-pack", ResolveOptions::default())
            .await
            .unwrap();

        assert_eq!(resolved.manifest.name.as_deref(), Some("loopback-pack"));
        assert_eq!(resolved.sha256, digest);
        assert!(resolved.integrity_verified);
        server.await.unwrap();
    }

    #[tokio::test]
    async fn real_http_reports_a_404_as_a_missing_plugin() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let base = format!("http://127.0.0.1:{port}");

        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = [0u8; 2048];
            let _ = socket.read(&mut buffer).await.unwrap();
            socket
                .write_all(
                    b"HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\nconnection: close\r\n\r\n",
                )
                .await
                .unwrap();
            socket.flush().await.unwrap();
        });

        let client =
            PluginRegistryClient::new(&base, HttpRegistryTransport::new().unwrap()).unwrap();
        let error = client.fetch_entry("nope").await.unwrap_err();

        assert!(matches!(error, RegistryError::NotFound(_)), "{error}");
        server.await.unwrap();
    }
}
