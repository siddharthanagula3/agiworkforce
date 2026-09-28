use serde::{Deserialize, Serialize};

use super::client::{CloudClient, CloudError};

pub const DEVICES_PATH: &str = "/api/settings/devices";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCapabilities {
    #[serde(default)]
    pub browser: bool,
    #[serde(default)]
    pub computer_use: bool,
    #[serde(default)]
    pub local_models: bool,
    #[serde(default)]
    pub local_mcp: bool,
    #[serde(default)]
    pub remote_control: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub kind: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub platform: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub architecture: Option<String>,
    #[serde(default)]
    pub last_seen_at: Option<String>,
    #[serde(default)]
    pub presence: Option<String>,
    #[serde(default)]
    pub capabilities: Option<DeviceCapabilities>,
}

#[derive(Debug, Deserialize)]
struct DeviceList {
    #[serde(default)]
    devices: Vec<Device>,
}

impl Device {
    pub fn hosts(&self) -> Vec<&'static str> {
        let Some(capabilities) = self.capabilities.as_ref() else {
            return Vec::new();
        };
        [
            (capabilities.local_models, "local models"),
            (capabilities.local_mcp, "local MCP servers"),
            (capabilities.browser, "a browser"),
            (capabilities.computer_use, "computer use"),
            (capabilities.remote_control, "remote control"),
        ]
        .into_iter()
        .filter_map(|(available, label)| available.then_some(label))
        .collect()
    }

    fn state(&self) -> &str {
        match self.presence.as_deref() {
            Some("online") => "online",
            Some("sleeping") => "asleep",
            Some("offline") => "offline",
            _ => "not reported",
        }
    }
}

pub async fn list(client: &CloudClient) -> Result<Vec<Device>, CloudError> {
    let list: DeviceList = client.get(DEVICES_PATH, &[]).await?;
    Ok(list.devices)
}

pub fn render(devices: &[Device]) -> String {
    if devices.is_empty() {
        return "No devices are registered to your account yet. Each AGI app you sign in to appears here."
            .to_string();
    }
    let mut lines = vec![format!("Your devices ({})", devices.len())];
    for device in devices {
        let platform = match (device.platform.as_deref(), device.architecture.as_deref()) {
            (Some(platform), Some(architecture)) => format!("{platform} {architecture}"),
            (Some(platform), None) => platform.to_string(),
            _ => "unknown platform".to_string(),
        };
        let hosts = device.hosts();
        let hosts = if device.capabilities.is_none() {
            "does not report what it can host".to_string()
        } else if hosts.is_empty() {
            "reports nothing it can host".to_string()
        } else {
            format!("can host {}", hosts.join(", "))
        };
        lines.push(format!(
            "  {}  {}, {}, {}; {}",
            device.name.as_deref().unwrap_or("Unnamed device"),
            device.kind,
            platform,
            device.state(),
            hosts
        ));
    }
    lines.join("\n")
}
