use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;

const HEARTBEAT_PATH: &str = "/api/devices/heartbeat";
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5 * 60);
const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(5);
const INSTALL_ID_FILE: &str = "device-id";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub browser: bool,
    pub computer_use: bool,
    pub local_models: bool,
    pub local_mcp: bool,
    pub remote_control: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Heartbeat {
    pub surface: &'static str,
    pub install_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub os: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os_version: Option<String>,
    pub architecture: &'static str,
    pub app_version: String,
    pub capabilities: Capabilities,
}

pub fn registry_os(os: &str) -> &'static str {
    match os {
        "macos" => "macos",
        "windows" => "windows",
        "linux" => "linux",
        _ => "other",
    }
}

pub fn registry_architecture(arch: &str) -> &'static str {
    match arch {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        "x86" => "x86",
        "arm" => "arm",
        _ => "other",
    }
}

pub fn is_valid_install_id(value: &str) -> bool {
    (8..=128).contains(&value.len())
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn clip(value: &str, limit: usize) -> String {
    value.chars().take(limit).collect()
}

pub fn build_heartbeat(
    install_id: String,
    hostname: Option<&str>,
    os_version: Option<&str>,
    local_mcp: bool,
) -> Heartbeat {
    Heartbeat {
        surface: "cli",
        install_id,
        name: hostname
            .map(|name| name.trim().trim_end_matches(".local"))
            .filter(|name| !name.is_empty())
            .map(|name| clip(name, 120)),
        os: registry_os(std::env::consts::OS),
        os_version: os_version
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| clip(value, 64)),
        architecture: registry_architecture(std::env::consts::ARCH),
        app_version: clip(env!("CARGO_PKG_VERSION"), 64),
        capabilities: Capabilities {
            browser: false,
            computer_use: false,
            local_models: true,
            local_mcp,
            remote_control: false,
        },
    }
}

fn install_id_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".agiworkforce").join(INSTALL_ID_FILE))
}

fn install_id() -> Option<String> {
    let path = install_id_path()?;
    if let Ok(existing) = std::fs::read_to_string(&path) {
        let existing = existing.trim().to_string();
        if is_valid_install_id(&existing) {
            return Some(existing);
        }
    }
    let created = uuid::Uuid::new_v4().to_string();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok()?;
    }
    std::fs::write(&path, &created).ok()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Some(created)
}

fn hostname() -> Option<String> {
    std::env::var("HOSTNAME")
        .ok()
        .or_else(|| std::env::var("COMPUTERNAME").ok())
        .or_else(|| {
            std::process::Command::new("hostname")
                .output()
                .ok()
                .and_then(|out| String::from_utf8(out.stdout).ok())
        })
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
}

fn os_version() -> Option<String> {
    let (program, args): (&str, &[&str]) = match std::env::consts::OS {
        "macos" => ("sw_vers", &["-productVersion"]),
        "windows" => ("cmd", &["/C", "ver"]),
        _ => ("uname", &["-r"]),
    };
    std::process::Command::new(program)
        .args(args)
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub async fn send_heartbeat() -> bool {
    let Some(jwt) = crate::tier_cache::load_jwt() else {
        return false;
    };
    let raw_base = std::env::var("AGIWORKFORCE_API_BASE")
        .unwrap_or_else(|_| crate::tier_cache::default_api_base().to_string());
    let Some(base) = crate::tier_cache::resolve_agi_api_base(&raw_base) else {
        return false;
    };
    let Some(install_id) = tokio::task::spawn_blocking(install_id).await.ok().flatten() else {
        return false;
    };
    let local_mcp = crate::mcp::McpManager::load_configs()
        .map(|configs| !configs.is_empty())
        .unwrap_or(false);
    let facts = tokio::task::spawn_blocking(|| (hostname(), os_version()))
        .await
        .unwrap_or((None, None));
    let heartbeat = build_heartbeat(
        install_id,
        facts.0.as_deref(),
        facts.1.as_deref(),
        local_mcp,
    );

    let Ok(client) = reqwest::Client::builder()
        .timeout(HEARTBEAT_TIMEOUT)
        .build()
    else {
        return false;
    };
    match client
        .post(format!("{base}{HEARTBEAT_PATH}"))
        .header("Authorization", format!("Bearer {jwt}"))
        .json(&heartbeat)
        .send()
        .await
    {
        Ok(response) => response.status().is_success(),
        Err(error) => {
            tracing::debug!("[device_registry] heartbeat failed: {error}");
            false
        }
    }
}

pub fn spawn_heartbeat_loop() -> tokio::task::JoinHandle<()> {
    tokio::spawn(async {
        let mut interval = tokio::time::interval(HEARTBEAT_INTERVAL);
        loop {
            interval.tick().await;
            send_heartbeat().await;
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heartbeat_serializes_in_the_registry_contract_shape() {
        let heartbeat = build_heartbeat(
            "cli-install-0001".to_string(),
            Some("build-box.local"),
            Some("6.8.0"),
            true,
        );
        let value = serde_json::to_value(&heartbeat).unwrap();
        assert_eq!(value["surface"], "cli");
        assert_eq!(value["installId"], "cli-install-0001");
        assert_eq!(value["name"], "build-box");
        assert_eq!(value["osVersion"], "6.8.0");
        assert_eq!(value["appVersion"], env!("CARGO_PKG_VERSION"));
        assert_eq!(value["capabilities"]["localMcp"], true);
        assert_eq!(value["capabilities"]["remoteControl"], false);
        assert!(value.get("userId").is_none());
    }

    #[test]
    fn omits_blank_host_facts_instead_of_sending_empty_strings() {
        let value = serde_json::to_value(build_heartbeat(
            "cli-install-0001".into(),
            Some("  "),
            None,
            false,
        ))
        .unwrap();
        assert!(value.get("name").is_none());
        assert!(value.get("osVersion").is_none());
    }

    #[test]
    fn maps_rust_platform_names_to_the_registry_vocabulary() {
        assert_eq!(registry_os("macos"), "macos");
        assert_eq!(registry_os("freebsd"), "other");
        assert_eq!(registry_architecture("aarch64"), "arm64");
        assert_eq!(registry_architecture("x86_64"), "x64");
        assert_eq!(registry_architecture("riscv64"), "other");
    }

    #[test]
    fn only_accepts_install_ids_the_server_accepts() {
        assert!(is_valid_install_id("4f7a2c1e-9d7b-4c0a-8a51-2d9e0f1b3c4d"));
        assert!(!is_valid_install_id("short"));
        assert!(!is_valid_install_id("../../etc/passwd"));
    }
}
