//! Native-authoritative LLM proxy settings.
//!
//! The complete profile, including its optional password, is serialized into
//! `SecretManager`'s AES-256-GCM encrypted storage. Renderer callers only ever
//! receive a `has_password` boolean; neither settings.json nor localStorage
//! owns the credential.
//!
//! A proxy sees every request to a model provider, and a trusted root
//! certificate lets its holder read them. The page that sends this profile
//! renders model output, so a profile that routes traffic or trusts a
//! certificate is decided by the person in a native dialog that names the
//! proxy host and the certificate file with its SHA-256. The approved file's
//! hash is kept with the profile: a file that changed is not trusted again.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::{Manager, State};

use crate::core::llm::providers::http_client_factory::{
    set_network_proxy_config, NetworkProxyConfig,
};
use crate::sys::commands::llm::{rehydrate_byok_providers, LLMState};
use crate::sys::commands::security::SecretManagerState;
use crate::sys::native_confirm::{check_it_fits, shown_value, ConfirmGate, NativeConfirm};
use crate::sys::security::{MasterPasswordEncryption, SecretManager};

const NETWORK_PROXY_SECRET_KEY: &str = "llm_network_proxy_v1";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredNetworkProxyConfig {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    proxy_url: String,
    #[serde(default = "default_no_proxy")]
    no_proxy: String,
    #[serde(default)]
    ca_cert_path: String,
    /// SHA-256 of the certificate file the person approved, in hex. Empty in
    /// a profile saved before approval existed, which is then not trusted.
    #[serde(default)]
    ca_cert_sha256: String,
    #[serde(default)]
    username: String,
    #[serde(default)]
    password: String,
}

fn default_no_proxy() -> String {
    "localhost,127.0.0.1,::1".to_string()
}

impl Default for StoredNetworkProxyConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            proxy_url: String::new(),
            no_proxy: default_no_proxy(),
            ca_cert_path: String::new(),
            ca_cert_sha256: String::new(),
            username: String::new(),
            password: String::new(),
        }
    }
}

impl From<StoredNetworkProxyConfig> for NetworkProxyConfig {
    fn from(value: StoredNetworkProxyConfig) -> Self {
        Self {
            enabled: value.enabled,
            proxy_url: value.proxy_url,
            no_proxy: value.no_proxy,
            ca_cert_path: value.ca_cert_path,
            username: value.username,
            password: value.password,
        }
    }
}

fn stored_profile(
    config: &NetworkProxyConfig,
    certificate: Option<&CertificateFile>,
) -> StoredNetworkProxyConfig {
    StoredNetworkProxyConfig {
        enabled: config.enabled,
        proxy_url: config.proxy_url.clone(),
        no_proxy: config.no_proxy.clone(),
        ca_cert_path: config.ca_cert_path.clone(),
        ca_cert_sha256: certificate
            .map(|certificate| certificate.sha256.clone())
            .unwrap_or_default(),
        username: config.username.clone(),
        password: config.password.clone(),
    }
}

const MAX_CERTIFICATE_FILE_BYTES: u64 = 1024 * 1024;

/// A certificate file as the dialog names it and as it is trusted: where it
/// really is, and the SHA-256 of its bytes, which `shasum -a 256` prints too.
#[derive(Debug, Clone, PartialEq, Eq)]
struct CertificateFile {
    path: String,
    sha256: String,
}

/// Reads the certificate file at `path`. One inside `app_folders` is refused:
/// the page can write there, so it could put its own certificate in place.
fn certificate_file(path: &str, app_folders: &[PathBuf]) -> Result<CertificateFile, String> {
    let resolved = std::fs::canonicalize(path)
        .map_err(|error| format!("The certificate file {path} could not be opened: {error}"))?;
    if app_folders
        .iter()
        .any(|folder| resolved.starts_with(folder))
    {
        return Err(format!(
            "{} is inside this app's own data folder, where a page in the app can write. Choose a certificate file kept somewhere else.",
            resolved.display()
        ));
    }
    let metadata = std::fs::metadata(&resolved).map_err(|error| {
        format!(
            "The certificate file {} could not be read: {error}",
            resolved.display()
        )
    })?;
    if !metadata.is_file() || metadata.len() > MAX_CERTIFICATE_FILE_BYTES {
        return Err(format!(
            "{} is not a certificate file this app can use.",
            resolved.display()
        ));
    }
    let bytes = std::fs::read(&resolved).map_err(|error| {
        format!(
            "The certificate file {} could not be read: {error}",
            resolved.display()
        )
    })?;
    Ok(CertificateFile {
        path: resolved.to_string_lossy().into_owned(),
        sha256: hex::encode(Sha256::digest(&bytes)),
    })
}

/// Every folder this app keeps its own files in, as named and as resolved.
fn app_folders<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Vec<PathBuf> {
    let paths = app.path();
    [
        paths.app_data_dir(),
        paths.app_local_data_dir(),
        paths.app_config_dir(),
        paths.app_cache_dir(),
        paths.app_log_dir(),
    ]
    .into_iter()
    .flatten()
    .flat_map(|folder| [std::fs::canonicalize(&folder).ok(), Some(folder)])
    .flatten()
    .collect()
}

/// What a profile hands to someone else: the proxy every request goes
/// through, and the certificate whose holder can read them.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Granted {
    proxy_url: Option<String>,
    no_proxy: String,
    username: String,
    certificate: Option<CertificateFile>,
}

/// `None` for a profile that routes nothing and trusts nothing, which is
/// never asked about.
fn granted(config: &NetworkProxyConfig, certificate: Option<CertificateFile>) -> Option<Granted> {
    let proxy_url =
        (config.enabled && !config.proxy_url.is_empty()).then(|| config.proxy_url.clone());
    if proxy_url.is_none() && certificate.is_none() {
        return None;
    }
    let routed = proxy_url.is_some();
    Some(Granted {
        proxy_url,
        no_proxy: if routed {
            config.no_proxy.clone()
        } else {
            String::new()
        },
        username: if routed {
            config.username.clone()
        } else {
            String::new()
        },
        certificate,
    })
}

/// What the person last approved, read from the saved profile. A certificate
/// saved without a hash was never approved.
fn approved(stored: &StoredNetworkProxyConfig) -> Option<Granted> {
    let certificate =
        (!stored.ca_cert_path.is_empty() && !stored.ca_cert_sha256.is_empty()).then(|| {
            CertificateFile {
                path: stored.ca_cert_path.clone(),
                sha256: stored.ca_cert_sha256.clone(),
            }
        });
    granted(&NetworkProxyConfig::from(stored.clone()), certificate)
}

fn proxy_as_shown(proxy_url: &str) -> Result<String, String> {
    let url = url::Url::parse(proxy_url)
        .map_err(|error| format!("Invalid proxy URL '{proxy_url}': {error}"))?;
    let host = url
        .host_str()
        .ok_or_else(|| format!("Invalid proxy URL '{proxy_url}': it names no host"))?;
    Ok(match url.port_or_known_default() {
        Some(port) => format!("{host}, port {port}, over {}", url.scheme()),
        None => format!("{host}, over {}", url.scheme()),
    })
}

fn approval_question(granted: &Granted) -> Result<NativeConfirm, String> {
    let mut parts = Vec::new();
    if let Some(proxy_url) = &granted.proxy_url {
        parts.push(format!(
            "Send every request to a model provider through this proxy:\n{}",
            shown_value(&proxy_as_shown(proxy_url)?)
        ));
        if !granted.username.is_empty() {
            parts.push(format!(
                "Sign in to it as: {}",
                shown_value(&granted.username)
            ));
        }
        parts.push(format!(
            "Hosts that skip it: {}",
            shown_value(&granted.no_proxy)
        ));
    }
    if let Some(certificate) = &granted.certificate {
        parts.push(format!(
            "Trust this file as a root certificate authority:\n{}\nSHA-256 of the file: {}",
            shown_value(&certificate.path),
            certificate.sha256
        ));
    }
    parts.push(
        "Whoever runs the proxy, or holds the key of that certificate, can read and change what this app sends to model providers, including your API keys."
            .to_string(),
    );
    let body = parts.join("\n\n");
    check_it_fits(&body).map_err(|rows| {
        format!(
            "These network settings take {rows} rows to show, more than the system dialog holds, so they were not applied. Shorten the bypass list or move the certificate to a shorter path."
        )
    })?;
    let confirm_label = match (&granted.proxy_url, &granted.certificate) {
        (Some(_), Some(_)) => "Use Proxy and Certificate",
        (Some(_), None) => "Use Proxy",
        (None, _) => "Trust Certificate",
    };
    Ok(NativeConfirm {
        title: "Change how this app reaches model providers?".to_string(),
        body,
        confirm_label: confirm_label.to_string(),
    })
}

/// Why a saved certificate is not trusted at startup, or `None` when the
/// profile trusts none or the file is the one approved.
fn certificate_problem(stored: &StoredNetworkProxyConfig) -> Option<String> {
    if stored.ca_cert_path.is_empty() {
        return None;
    }
    if stored.ca_cert_sha256.is_empty() {
        return Some(format!(
            "The root certificate {} was saved before this app asked for confirmation, so it is not trusted. Apply the network settings again to confirm it.",
            stored.ca_cert_path
        ));
    }
    match certificate_file(&stored.ca_cert_path, &[]) {
        Ok(now) if now.sha256 == stored.ca_cert_sha256 => None,
        Ok(_) => Some(format!(
            "The root certificate file {} has changed since you approved it, so it is not trusted. Apply the network settings again to confirm it.",
            stored.ca_cert_path
        )),
        Err(error) => Some(error),
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProxySettings {
    pub enabled: bool,
    pub proxy_url: String,
    pub no_proxy: String,
    pub ca_cert_path: String,
    pub username: String,
    pub has_password: bool,
    /// Why the saved certificate is not in use, for the screen to show.
    pub ca_cert_problem: Option<String>,
}

impl From<&NetworkProxyConfig> for NetworkProxySettings {
    fn from(value: &NetworkProxyConfig) -> Self {
        Self {
            enabled: value.enabled,
            proxy_url: value.proxy_url.clone(),
            no_proxy: value.no_proxy.clone(),
            ca_cert_path: value.ca_cert_path.clone(),
            username: value.username.clone(),
            has_password: !value.password.is_empty(),
            ca_cert_problem: None,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProxyUpdate {
    pub enabled: bool,
    pub proxy_url: String,
    pub no_proxy: String,
    pub ca_cert_path: String,
    pub username: String,
    /// `None` preserves the encrypted password already on disk. A non-empty
    /// value replaces it; `clear_password` explicitly removes it.
    pub password: Option<String>,
    #[serde(default)]
    pub clear_password: bool,
}

/// The proxy a saved password belongs to: scheme, host and port. Sending
/// it anywhere else would hand the credentials to whoever the page names.
fn proxy_origin(proxy_url: &str) -> Option<String> {
    let url = url::Url::parse(proxy_url.trim()).ok()?;
    let host = url.host_str()?.to_ascii_lowercase();
    let port = url.port_or_known_default()?;
    Some(format!("{}://{host}:{port}", url.scheme()))
}

/// A saved password is kept only for the proxy it was saved for. When the
/// scheme, host or port changes it is dropped unless this same update
/// supplies the password again.
fn merge_update(request: NetworkProxyUpdate, previous: &NetworkProxyConfig) -> NetworkProxyConfig {
    let same_proxy = proxy_origin(&request.proxy_url) == proxy_origin(&previous.proxy_url);
    let supplied = request.password.filter(|value| !value.is_empty());
    let password = match supplied {
        _ if request.clear_password => String::new(),
        Some(password) => password,
        None if same_proxy => previous.password.clone(),
        None => String::new(),
    };

    NetworkProxyConfig {
        enabled: request.enabled,
        proxy_url: request.proxy_url.trim().to_string(),
        no_proxy: request.no_proxy.trim().to_string(),
        ca_cert_path: request.ca_cert_path.trim().to_string(),
        username: request.username.trim().to_string(),
        password,
    }
}

fn load_from_secret_manager(manager: &SecretManager) -> Result<StoredNetworkProxyConfig, String> {
    match manager.get_secret(NETWORK_PROXY_SECRET_KEY) {
        Ok(json) => serde_json::from_str::<StoredNetworkProxyConfig>(&json)
            .map_err(|e| format!("Saved network proxy settings are invalid: {e}")),
        Err(crate::sys::security::SecretError::SecretNotFound)
        | Err(crate::sys::security::SecretError::DatabaseRetrieveError(
            rusqlite::Error::QueryReturnedNoRows,
        )) => Ok(StoredNetworkProxyConfig::default()),
        Err(error) => Err(format!("Failed to load network proxy settings: {error}")),
    }
}

fn persist_to_secret_manager(
    manager: &SecretManager,
    profile: &StoredNetworkProxyConfig,
) -> Result<(), String> {
    let json = serde_json::to_string(profile)
        .map_err(|e| format!("Failed to serialize network proxy settings: {e}"))?;
    manager
        .set_secret(NETWORK_PROXY_SECRET_KEY, &json)
        .map_err(|e| format!("Failed to save network proxy settings: {e}"))
}

/// Apply encrypted settings before the LLM router is initialized at startup.
/// Invalid/corrupt profiles fail closed to reqwest's normal environment proxy
/// behavior and return an error for the setup log.
pub fn apply_saved_network_proxy(manager: &SecretManager) -> Result<(), String> {
    let stored = load_from_secret_manager(manager)?;
    if let Some(problem) = certificate_problem(&stored) {
        return Err(problem);
    }
    set_network_proxy_config(stored.into())
}

#[tauri::command]
pub async fn llm_network_proxy_get(
    secret_state: State<'_, SecretManagerState>,
) -> Result<NetworkProxySettings, String> {
    let stored = load_from_secret_manager(secret_state.manager())?;
    let ca_cert_problem = certificate_problem(&stored);
    Ok(NetworkProxySettings {
        ca_cert_problem,
        ..NetworkProxySettings::from(&NetworkProxyConfig::from(stored))
    })
}

/// One question about the network profile at a time, and a wait after a no.
static PROXY_DECISIONS: ConfirmGate = ConfirmGate::new();

/// Saves and applies the network profile. A profile that routes requests
/// through a proxy or trusts a certificate, and is not the one already
/// approved, is decided by the person in a native dialog; a declined dialog
/// is an error that says so and changes nothing. Turning both off never asks.
#[tauri::command]
pub async fn llm_network_proxy_set(
    request: NetworkProxyUpdate,
    app_handle: tauri::AppHandle,
    secret_state: State<'_, SecretManagerState>,
    llm_state: State<'_, LLMState>,
    encryption: State<'_, MasterPasswordEncryption>,
) -> Result<NetworkProxySettings, String> {
    if encryption.is_configured() && !encryption.is_unlocked() {
        return Err(
            "Unlock the credential vault before changing network settings so configured BYOK providers can be rebuilt safely"
                .to_string(),
        );
    }

    let previous_stored = load_from_secret_manager(secret_state.manager())?;
    let previous = NetworkProxyConfig::from(previous_stored.clone());
    let mut config = merge_update(request, &previous);

    let certificate = if config.ca_cert_path.is_empty() {
        None
    } else {
        Some(certificate_file(
            &config.ca_cert_path,
            &app_folders(&app_handle),
        )?)
    };
    if let Some(certificate) = &certificate {
        config.ca_cert_path = certificate.path.clone();
    }

    if let Some(wanted) = granted(&config, certificate.clone()) {
        if approved(&previous_stored).as_ref() != Some(&wanted) {
            let question = approval_question(&wanted)?;
            let confirmed = PROXY_DECISIONS
                .confirm(&app_handle, &format!("{wanted:?}"), question)
                .await
                .map_err(|held| held.message())?;
            if !confirmed {
                return Err(
                    "The network settings were not changed. You declined them in the system dialog."
                        .to_string(),
                );
            }
        }
    }

    // Build a client before persistence so malformed URLs, unreadable CA files,
    // and invalid certificates cannot replace a working profile.
    set_network_proxy_config(config.clone())?;
    let profile = stored_profile(&config, certificate.as_ref());
    if let Err(error) = persist_to_secret_manager(secret_state.manager(), &profile) {
        // Restore the previous runtime value when durable persistence fails.
        let _ = set_network_proxy_config(previous);
        return Err(error);
    }

    // Every provider owns one or more reqwest clients. Drop them all, then
    // restore encrypted BYOK providers under the new profile. Managed Cloud and
    // local providers are lazily recreated; the settings UI also immediately
    // restores custom local-runtime URLs after this command returns.
    llm_state.router.write().await.clear_providers();
    rehydrate_byok_providers(&llm_state.router, encryption.inner()).await;

    Ok(NetworkProxySettings::from(&config))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_settings_never_return_password() {
        let config = NetworkProxyConfig {
            password: "very-secret".to_string(),
            ..NetworkProxyConfig::default()
        };
        let public = NetworkProxySettings::from(&config);
        let json = serde_json::to_string(&public).unwrap();
        assert!(public.has_password);
        assert!(!json.contains("very-secret"));
        assert!(!json.contains("password\""));
    }

    fn certificate_on_disk(name: &str, pem: &str) -> (tempfile::TempDir, String) {
        let folder = tempfile::tempdir().expect("a folder");
        let path = folder.path().join(name);
        std::fs::write(&path, pem).expect("a certificate file");
        (folder, path.to_string_lossy().into_owned())
    }

    fn routed(proxy_url: &str) -> NetworkProxyConfig {
        NetworkProxyConfig {
            enabled: true,
            proxy_url: proxy_url.to_string(),
            ..NetworkProxyConfig::default()
        }
    }

    #[test]
    fn a_certificate_is_named_by_its_real_path_and_the_hash_of_its_bytes() {
        let (_folder, path) = certificate_on_disk("root.pem", "abc");
        let file = certificate_file(&path, &[]).expect("read");
        assert_eq!(
            file.sha256,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            std::path::Path::new(&file.path),
            std::fs::canonicalize(&path).expect("resolved")
        );
    }

    #[test]
    fn a_certificate_inside_the_apps_own_folders_is_refused() {
        let (folder, path) = certificate_on_disk("planted.pem", "abc");
        let app_folder = std::fs::canonicalize(folder.path()).expect("resolved");
        let refused = certificate_file(&path, &[app_folder]).expect_err("refused");
        assert!(
            refused.contains("inside this app's own data folder"),
            "{refused}"
        );

        #[cfg(unix)]
        {
            let (outside, _) = certificate_on_disk("unused.pem", "abc");
            let link = outside.path().join("link.pem");
            std::os::unix::fs::symlink(&path, &link).expect("a link");
            let app_folder = std::fs::canonicalize(folder.path()).expect("resolved");
            assert!(
                certificate_file(&link.to_string_lossy(), &[app_folder]).is_err(),
                "a link into the app's folder is the file it points at"
            );
        }
    }

    #[test]
    fn turning_everything_off_is_never_asked() {
        assert_eq!(granted(&NetworkProxyConfig::default(), None), None);
        let disabled = NetworkProxyConfig {
            enabled: false,
            proxy_url: "https://proxy.example.com:8443".to_string(),
            ..NetworkProxyConfig::default()
        };
        assert_eq!(granted(&disabled, None), None);
    }

    #[test]
    fn a_proxy_or_a_certificate_is_asked_unless_it_is_the_one_approved() {
        let (_folder, path) = certificate_on_disk("root.pem", "abc");
        let file = certificate_file(&path, &[]).expect("read");

        let config = NetworkProxyConfig {
            ca_cert_path: file.path.clone(),
            ..routed("https://proxy.example.com:8443")
        };
        let wanted = granted(&config, Some(file.clone())).expect("grants");
        assert_eq!(
            approved(&stored_profile(&config, Some(&file))),
            Some(wanted.clone())
        );

        let never_approved = stored_profile(&config, None);
        assert_ne!(approved(&never_approved), Some(wanted.clone()));
        assert_eq!(approved(&StoredNetworkProxyConfig::default()), None);

        std::fs::write(&path, "abd").expect("rewritten");
        let rewritten = certificate_file(&path, &[]).expect("read");
        assert_ne!(
            granted(&config, Some(rewritten)),
            approved(&stored_profile(&config, Some(&file)))
        );

        let other_host = NetworkProxyConfig {
            ca_cert_path: file.path.clone(),
            ..routed("https://other.example.com:8443")
        };
        assert_ne!(
            granted(&other_host, Some(file.clone())),
            approved(&stored_profile(&config, Some(&file)))
        );

        let certificate_only = NetworkProxyConfig {
            ca_cert_path: file.path.clone(),
            ..NetworkProxyConfig::default()
        };
        assert!(
            granted(&certificate_only, Some(file)).is_some(),
            "a certificate is trusted with the proxy off, so it is asked about"
        );
    }

    #[test]
    fn the_question_shows_the_host_the_file_and_its_hash() {
        let (_folder, path) = certificate_on_disk("root.pem", "abc");
        let file = certificate_file(&path, &[]).expect("read");
        let config = NetworkProxyConfig {
            username: "network-user".to_string(),
            ca_cert_path: file.path.clone(),
            ..routed("https://proxy.example.com:8443")
        };
        let question = approval_question(&granted(&config, Some(file.clone())).expect("grants"))
            .expect("fits");
        assert!(question
            .body
            .contains("proxy.example.com, port 8443, over https"));
        assert!(question.body.contains("network-user"));
        assert!(question.body.contains(&shown_value(&file.path)));
        assert!(question.body.contains(&file.sha256));
        assert!(question.body.contains("including your API keys"));
        assert_eq!(question.confirm_label, "Use Proxy and Certificate");
        assert!(crate::sys::native_confirm::can_ask_with(
            &question.confirm_label
        ));

        let proxy_only =
            approval_question(&granted(&routed("http://10.0.0.7"), None).expect("grants"))
                .expect("fits");
        assert!(proxy_only.body.contains("10.0.0.7, port 80, over http"));
        assert_eq!(proxy_only.confirm_label, "Use Proxy");

        assert!(approval_question(&granted(&routed("not a url"), None).expect("grants")).is_err());
    }

    #[test]
    fn a_saved_certificate_is_trusted_at_startup_only_as_approved() {
        let (_folder, path) = certificate_on_disk("root.pem", "abc");
        let file = certificate_file(&path, &[]).expect("read");
        let config = NetworkProxyConfig {
            ca_cert_path: file.path.clone(),
            ..NetworkProxyConfig::default()
        };

        assert_eq!(
            certificate_problem(&StoredNetworkProxyConfig::default()),
            None
        );
        assert_eq!(
            certificate_problem(&stored_profile(&config, Some(&file))),
            None
        );
        assert!(certificate_problem(&stored_profile(&config, None))
            .is_some_and(|problem| problem.contains("before this app asked")));

        std::fs::write(&path, "abd").expect("rewritten");
        assert!(certificate_problem(&stored_profile(&config, Some(&file)))
            .is_some_and(|problem| problem.contains("has changed since you approved it")));

        std::fs::remove_file(&path).expect("removed");
        assert!(certificate_problem(&stored_profile(&config, Some(&file))).is_some());
    }

    fn update_to(proxy_url: &str, password: Option<&str>) -> NetworkProxyUpdate {
        NetworkProxyUpdate {
            enabled: true,
            proxy_url: proxy_url.to_string(),
            no_proxy: String::new(),
            ca_cert_path: String::new(),
            username: "network-user".to_string(),
            password: password.map(str::to_string),
            clear_password: false,
        }
    }

    #[test]
    fn a_saved_password_is_not_sent_to_another_proxy() {
        let previous = NetworkProxyConfig {
            password: "saved-secret".to_string(),
            ..routed("https://proxy.example.com:8443")
        };

        for elsewhere in [
            "https://evil.example.net:8443",
            "https://proxy.example.com:9443",
            "http://proxy.example.com:8443",
            "https://proxy.example.com.evil.net:8443",
            "",
            "not a url",
        ] {
            assert_eq!(
                merge_update(update_to(elsewhere, None), &previous).password,
                "",
                "the saved password followed the proxy to {elsewhere:?}"
            );
            assert_eq!(
                merge_update(update_to(elsewhere, Some("")), &previous).password,
                ""
            );
        }

        assert_eq!(
            merge_update(
                update_to("https://evil.example.net:8443", Some("typed-again")),
                &previous
            )
            .password,
            "typed-again"
        );
        assert_eq!(
            merge_update(
                update_to("https://proxy.example.com:8443/", None),
                &previous
            )
            .password,
            "saved-secret"
        );
        assert_eq!(
            merge_update(
                update_to("https://proxy.example.com:443", None),
                &routed_with_password()
            )
            .password,
            "saved-secret",
            "the default port written out is the same proxy"
        );
    }

    fn routed_with_password() -> NetworkProxyConfig {
        NetworkProxyConfig {
            password: "saved-secret".to_string(),
            ..routed("https://proxy.example.com")
        }
    }

    #[test]
    fn stored_config_defaults_to_loopback_bypass() {
        let stored: StoredNetworkProxyConfig = serde_json::from_str("{}").unwrap();
        assert_eq!(stored.no_proxy, "localhost,127.0.0.1,::1");
    }

    #[test]
    fn update_preserves_password_when_renderer_does_not_return_one() {
        let previous = NetworkProxyConfig {
            proxy_url: "https://PROXY.example.com:8443/".to_string(),
            password: "encrypted-native-secret".to_string(),
            ..NetworkProxyConfig::default()
        };
        let merged = merge_update(
            NetworkProxyUpdate {
                enabled: true,
                proxy_url: "  https://proxy.example.com:8443  ".to_string(),
                no_proxy: " localhost ".to_string(),
                ca_cert_path: String::new(),
                username: " network-user ".to_string(),
                password: None,
                clear_password: false,
            },
            &previous,
        );
        assert_eq!(merged.password, "encrypted-native-secret");
        assert_eq!(merged.proxy_url, "https://proxy.example.com:8443");
        assert_eq!(merged.username, "network-user");
    }

    #[test]
    fn clear_password_wins_over_replacement_value() {
        let previous = NetworkProxyConfig {
            password: "old-secret".to_string(),
            ..NetworkProxyConfig::default()
        };
        let merged = merge_update(
            NetworkProxyUpdate {
                enabled: true,
                proxy_url: "http://proxy.example.com".to_string(),
                no_proxy: String::new(),
                ca_cert_path: String::new(),
                username: String::new(),
                password: Some("new-secret".to_string()),
                clear_password: true,
            },
            &previous,
        );
        assert!(merged.password.is_empty());
    }
}
