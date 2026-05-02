use agiworkforce_network_proxy::NetworkProxyConfig;
use agiworkforce_protocol::permissions::FileSystemAccessMode;
use serde::Deserialize;
use serde::Serialize;
use std::collections::BTreeMap;

/// Top-level `[permissions]` config table.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PermissionsToml {
    #[serde(flatten)]
    pub entries: BTreeMap<String, PermissionProfileToml>,
}

impl PermissionsToml {
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

/// A named permission profile entry.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PermissionProfileToml {
    #[serde(default)]
    pub filesystem: Option<FilesystemPermissionsToml>,
    #[serde(default)]
    pub network: Option<NetworkToml>,
}

/// `[permissions.<name>.filesystem]` table.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct FilesystemPermissionsToml {
    #[serde(default)]
    pub glob_scan_max_depth: Option<usize>,
    #[serde(flatten)]
    pub entries: BTreeMap<String, FilesystemPermissionToml>,
}

impl FilesystemPermissionsToml {
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

/// Per-path filesystem permission entry.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FilesystemPermissionToml {
    /// Simple access mode for a single path.
    Access(FileSystemAccessMode),
    /// Scoped sub-path access table.
    Scoped(BTreeMap<String, FileSystemAccessMode>),
}

/// `[permissions.<name>.network]` table.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct NetworkToml {
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub proxy_url: Option<String>,
    #[serde(default)]
    pub enable_socks5: Option<bool>,
    #[serde(default)]
    pub socks_url: Option<String>,
    #[serde(default)]
    pub enable_socks5_udp: Option<bool>,
    #[serde(default)]
    pub allow_upstream_proxy: Option<bool>,
    #[serde(default)]
    pub dangerously_allow_non_loopback_proxy: Option<bool>,
    #[serde(default)]
    pub dangerously_allow_all_unix_sockets: Option<bool>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub domains: Option<NetworkDomainPermissionsToml>,
    #[serde(default)]
    pub unix_sockets: Option<NetworkUnixSocketPermissionsToml>,
    #[serde(default)]
    pub allow_local_binding: Option<bool>,
}

impl NetworkToml {
    /// Convert this `NetworkToml` to a `NetworkProxyConfig`.
    pub fn to_network_proxy_config(&self) -> NetworkProxyConfig {
        let mut config = NetworkProxyConfig::default();
        self.apply_to_network_proxy_config(&mut config);
        config
    }

    /// Apply settings from this `NetworkToml` to an existing `NetworkProxyConfig`.
    pub fn apply_to_network_proxy_config(&self, config: &mut NetworkProxyConfig) {
        if let Some(enabled) = self.enabled {
            config.network.enabled = enabled;
        }
        if let Some(ref url) = self.proxy_url {
            config.network.proxy_url = url.clone();
        }
        if let Some(v) = self.enable_socks5 {
            config.network.enable_socks5 = v;
        }
        if let Some(ref url) = self.socks_url {
            config.network.socks_url = url.clone();
        }
        if let Some(v) = self.enable_socks5_udp {
            config.network.enable_socks5_udp = v;
        }
        if let Some(v) = self.allow_upstream_proxy {
            config.network.allow_upstream_proxy = v;
        }
        if let Some(v) = self.dangerously_allow_non_loopback_proxy {
            config.network.dangerously_allow_non_loopback_proxy = v;
        }
        if let Some(v) = self.dangerously_allow_all_unix_sockets {
            config.network.dangerously_allow_all_unix_sockets = v;
        }
        if let Some(ref mode_str) = self.mode {
            config.network.mode = match mode_str.as_str() {
                "limited" => agiworkforce_network_proxy::NetworkMode::Limited,
                _ => agiworkforce_network_proxy::NetworkMode::Full,
            };
        }
        if let Some(ref domains) = self.domains {
            if let Some(allowed) = domains.allowed_domains() {
                config.network.allowed_domains = allowed;
            }
            if let Some(denied) = domains.denied_domains() {
                config.network.denied_domains = denied;
            }
        }
        if let Some(ref unix_sockets) = self.unix_sockets {
            config.network.allow_unix_sockets = unix_sockets.allow_unix_sockets();
        }
        if let Some(v) = self.allow_local_binding {
            config.network.allow_local_binding = v;
        }
    }
}

/// Merge a list of domain permissions into a `NetworkProxyConfig`.
pub fn overlay_network_domain_permissions(
    config: &mut agiworkforce_network_proxy::NetworkProxyConfig,
    domains: &NetworkDomainPermissionsToml,
) {
    for entry in &domains.0 {
        let permission = if entry.allow == Some(false) {
            agiworkforce_network_proxy::NetworkDomainPermission::Deny
        } else {
            agiworkforce_network_proxy::NetworkDomainPermission::Allow
        };
        config
            .network
            .upsert_domain_permission(entry.domain.clone(), permission, |s| s.to_string());
    }
}

/// Network domain permission list.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkDomainPermissionsToml(pub Vec<NetworkDomainPermissionToml>);

impl NetworkDomainPermissionsToml {
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Returns allowed domains (entries where `allow` is not `Some(false)`).
    pub fn allowed_domains(&self) -> Option<Vec<String>> {
        let domains: Vec<String> = self
            .0
            .iter()
            .filter(|p| p.allow != Some(false))
            .map(|p| p.domain.clone())
            .collect();
        if domains.is_empty() { None } else { Some(domains) }
    }

    /// Returns denied domains (entries where `allow` is `Some(false)`).
    pub fn denied_domains(&self) -> Option<Vec<String>> {
        let domains: Vec<String> = self
            .0
            .iter()
            .filter(|p| p.allow == Some(false))
            .map(|p| p.domain.clone())
            .collect();
        if domains.is_empty() { None } else { Some(domains) }
    }
}

/// A single network domain permission entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkDomainPermissionToml {
    pub domain: String,
    #[serde(default)]
    pub allow: Option<bool>,
}

/// Network Unix socket permission list.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkUnixSocketPermissionsToml(pub Vec<NetworkUnixSocketPermissionToml>);

impl NetworkUnixSocketPermissionsToml {
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Returns the list of socket paths.
    pub fn allow_unix_sockets(&self) -> Vec<String> {
        self.0.iter().map(|p| p.path.clone()).collect()
    }
}

/// A single network Unix socket permission entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkUnixSocketPermissionToml {
    pub path: String,
    #[serde(default)]
    pub allow: Option<bool>,
}
