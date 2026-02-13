//! Native Messaging Manifest Generation and Installation

use super::*;
use std::path::PathBuf;

/// Native messaging host manifest
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeHostManifest {
    pub name: String,
    pub description: String,
    pub path: String,
    #[serde(rename = "type")]
    pub host_type: String,
    pub allowed_origins: Vec<String>,
}

impl NativeHostManifest {
    pub fn new(name: &str, description: &str, executable_path: &str) -> Self {
        Self {
            name: name.to_string(),
            description: description.to_string(),
            path: executable_path.to_string(),
            host_type: "stdio".to_string(),
            allowed_origins: vec![],
        }
    }

    pub fn add_extension(&mut self, extension_id: &str) {
        let origin = format!("chrome-extension://{}/", extension_id);
        if !self.allowed_origins.contains(&origin) {
            self.allowed_origins.push(origin);
        }
    }

    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string_pretty(self)
            .map_err(|e| anyhow!("Failed to serialize manifest: {}", e))
    }
}

/// Get platform-specific manifest directory
pub fn get_chrome_native_messaging_dir() -> Result<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let home =
            std::env::var("HOME").map_err(|_| anyhow!("HOME environment variable not set"))?;
        Ok(PathBuf::from(format!(
            "{}/Library/Application Support/Google/Chrome/NativeMessagingHosts",
            home
        )))
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, manifests go in the registry, but we can also use a file
        let local_app_data = std::env::var("LOCALAPPDATA")
            .map_err(|_| anyhow!("LOCALAPPDATA environment variable not set"))?;
        Ok(PathBuf::from(format!(
            "{}\\Google\\Chrome\\User Data\\NativeMessagingHosts",
            local_app_data
        )))
    }

    #[cfg(target_os = "linux")]
    {
        let home =
            std::env::var("HOME").map_err(|_| anyhow!("HOME environment variable not set"))?;

        // Check for Chrome first, then Chromium
        let chrome_path = PathBuf::from(format!(
            "{}/.config/google-chrome/NativeMessagingHosts",
            home
        ));

        if chrome_path.parent().map(|p| p.exists()).unwrap_or(false) {
            return Ok(chrome_path);
        }

        // Fallback to Chromium
        Ok(PathBuf::from(format!(
            "{}/.config/chromium/NativeMessagingHosts",
            home
        )))
    }
}

/// Get platform-specific manifest directory for Edge
pub fn get_edge_native_messaging_dir() -> Result<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let home =
            std::env::var("HOME").map_err(|_| anyhow!("HOME environment variable not set"))?;
        Ok(PathBuf::from(format!(
            "{}/Library/Application Support/Microsoft Edge/NativeMessagingHosts",
            home
        )))
    }

    #[cfg(target_os = "windows")]
    {
        let local_app_data = std::env::var("LOCALAPPDATA")
            .map_err(|_| anyhow!("LOCALAPPDATA environment variable not set"))?;
        Ok(PathBuf::from(format!(
            "{}\\Microsoft\\Edge\\User Data\\NativeMessagingHosts",
            local_app_data
        )))
    }

    #[cfg(target_os = "linux")]
    {
        let home =
            std::env::var("HOME").map_err(|_| anyhow!("HOME environment variable not set"))?;
        Ok(PathBuf::from(format!(
            "{}/.config/microsoft-edge/NativeMessagingHosts",
            home
        )))
    }
}

/// Install native messaging manifest for Chrome and Edge
pub fn install_manifests(extension_id: Option<&str>) -> Result<Vec<PathBuf>> {
    let host_name = "com.agiworkforce.browser";

    // Prefer dedicated native messaging host binary next to the app executable.
    // Fallback to current executable if the sidecar is not available.
    let current_exe =
        std::env::current_exe().map_err(|e| anyhow!("Failed to get executable path: {}", e))?;
    let mut exe_path = current_exe.clone();
    if let Some(parent) = current_exe.parent() {
        #[cfg(target_os = "windows")]
        let candidate = parent.join("native_messaging_host.exe");
        #[cfg(not(target_os = "windows"))]
        let candidate = parent.join("native_messaging_host");

        if candidate.exists() {
            exe_path = candidate;
        }
    }

    let exe_path_str = exe_path
        .to_str()
        .ok_or_else(|| anyhow!("Invalid executable path"))?;

    let mut manifest = NativeHostManifest::new(
        host_name,
        "AGI Workforce Browser Automation Host",
        exe_path_str,
    );

    // Add extension ID if provided
    if let Some(ext_id) = extension_id {
        manifest.add_extension(ext_id);
    }

    // Also add wildcard for development (remove in production)
    // manifest.add_extension("*");

    let manifest_json = manifest.to_json()?;
    let manifest_filename = format!("{}.json", host_name);

    let mut installed_paths = Vec::new();

    // Install for Chrome
    if let Ok(chrome_dir) = get_chrome_native_messaging_dir() {
        if let Err(e) = install_manifest_to_dir(&chrome_dir, &manifest_filename, &manifest_json) {
            tracing::warn!("Failed to install Chrome manifest: {}", e);
        } else {
            installed_paths.push(chrome_dir.join(&manifest_filename));
        }
    }

    // Install for Edge
    if let Ok(edge_dir) = get_edge_native_messaging_dir() {
        if let Err(e) = install_manifest_to_dir(&edge_dir, &manifest_filename, &manifest_json) {
            tracing::warn!("Failed to install Edge manifest: {}", e);
        } else {
            installed_paths.push(edge_dir.join(&manifest_filename));
        }
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, also register in the registry
        if let Err(e) = register_windows_native_host(host_name, &manifest_json) {
            tracing::warn!("Failed to register Windows native host: {}", e);
        }
    }

    if installed_paths.is_empty() {
        return Err(anyhow!("Failed to install any native messaging manifests"));
    }

    Ok(installed_paths)
}

fn install_manifest_to_dir(dir: &PathBuf, filename: &str, content: &str) -> Result<()> {
    // Create directory if it doesn't exist
    std::fs::create_dir_all(dir)
        .map_err(|e| anyhow!("Failed to create directory {:?}: {}", dir, e))?;

    let manifest_path = dir.join(filename);
    std::fs::write(&manifest_path, content)
        .map_err(|e| anyhow!("Failed to write manifest to {:?}: {}", manifest_path, e))?;

    tracing::info!("Installed native messaging manifest: {:?}", manifest_path);
    Ok(())
}

#[cfg(target_os = "windows")]
fn register_windows_native_host(host_name: &str, _manifest_json: &str) -> Result<()> {
    // Windows requires registry registration
    // This would use winreg crate in a real implementation
    tracing::info!(
        "Windows registry registration for {} would happen here",
        host_name
    );
    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[allow(dead_code)]
fn register_windows_native_host(_host_name: &str, _manifest_json: &str) -> Result<()> {
    Ok(())
}

/// Uninstall native messaging manifests
pub fn uninstall_manifests() -> Result<()> {
    let host_name = "com.agiworkforce.browser";
    let manifest_filename = format!("{}.json", host_name);

    // Remove from Chrome
    if let Ok(chrome_dir) = get_chrome_native_messaging_dir() {
        let manifest_path = chrome_dir.join(&manifest_filename);
        if manifest_path.exists() {
            std::fs::remove_file(&manifest_path)
                .map_err(|e| anyhow!("Failed to remove Chrome manifest: {}", e))?;
            tracing::info!("Removed Chrome manifest: {:?}", manifest_path);
        }
    }

    // Remove from Edge
    if let Ok(edge_dir) = get_edge_native_messaging_dir() {
        let manifest_path = edge_dir.join(&manifest_filename);
        if manifest_path.exists() {
            std::fs::remove_file(&manifest_path)
                .map_err(|e| anyhow!("Failed to remove Edge manifest: {}", e))?;
            tracing::info!("Removed Edge manifest: {:?}", manifest_path);
        }
    }

    Ok(())
}

/// Check if native messaging is properly installed
pub fn is_native_messaging_installed() -> bool {
    let host_name = "com.agiworkforce.browser";
    let manifest_filename = format!("{}.json", host_name);

    if let Ok(chrome_dir) = get_chrome_native_messaging_dir() {
        if chrome_dir.join(&manifest_filename).exists() {
            return true;
        }
    }

    if let Ok(edge_dir) = get_edge_native_messaging_dir() {
        if edge_dir.join(&manifest_filename).exists() {
            return true;
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manifest_creation() {
        let mut manifest =
            NativeHostManifest::new("com.test.host", "Test Host", "/usr/local/bin/test-host");

        manifest.add_extension("abcdefghijklmnop");

        let json = manifest.to_json().unwrap();
        assert!(json.contains("com.test.host"));
        assert!(json.contains("chrome-extension://abcdefghijklmnop/"));
    }
}
