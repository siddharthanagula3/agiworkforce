//! Native Messaging Manifest Generation and Installation

use super::*;
use std::path::{Path, PathBuf};

pub const NATIVE_MESSAGING_HOST_NAME: &str = "com.agiworkforce.browser";
pub const DEFAULT_BROWSER_EXTENSION_IDS: &[&str] = &["bblfoadbknbnmbchfjpgcefpkccpdnfc"];

pub fn is_valid_chrome_extension_id(extension_id: &str) -> bool {
    extension_id.len() == 32 && extension_id.bytes().all(|byte| matches!(byte, b'a'..=b'p'))
}

fn native_host_executable_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "native_messaging_host.exe"
    }

    #[cfg(not(target_os = "windows"))]
    {
        "native_messaging_host"
    }
}

fn is_native_host_executable_name(name: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        name == "native_messaging_host.exe"
            || (name.starts_with("native_messaging_host-") && name.ends_with(".exe"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        name == "native_messaging_host" || name.starts_with("native_messaging_host-")
    }
}

fn find_native_host_in_dir(dir: &Path) -> Option<PathBuf> {
    let exact = dir.join(native_host_executable_name());
    if exact.is_file() {
        return Some(exact);
    }

    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if is_native_host_executable_name(name) {
            return Some(path);
        }
    }

    None
}

fn resolve_native_host_executable(current_exe: &Path) -> Result<PathBuf> {
    if let Ok(configured) = std::env::var("AGI_NATIVE_MESSAGING_HOST") {
        let configured_path = PathBuf::from(configured);
        if configured_path.is_file() {
            return Ok(configured_path);
        }
    }

    if current_exe
        .file_name()
        .and_then(|name| name.to_str())
        .map(is_native_host_executable_name)
        .unwrap_or(false)
    {
        return Ok(current_exe.to_path_buf());
    }

    if let Some(parent) = current_exe.parent() {
        if let Some(candidate) = find_native_host_in_dir(parent) {
            return Ok(candidate);
        }

        // Dev builds run from target/debug while `build:native-host` writes the helper to
        // target/release by default. Check the sibling profile dir before giving up.
        if let Some(profile_dir) = parent.file_name().and_then(|name| name.to_str()) {
            let sibling = match profile_dir {
                "debug" => parent.parent().map(|target_dir| target_dir.join("release")),
                "release" => parent.parent().map(|target_dir| target_dir.join("debug")),
                _ => None,
            };
            if let Some(sibling_dir) = sibling {
                if let Some(candidate) = find_native_host_in_dir(&sibling_dir) {
                    return Ok(candidate);
                }
            }
        }
    }

    Err(anyhow!(
        "native_messaging_host helper was not found next to {:?}; run `pnpm --filter @agiworkforce/desktop build:native-host` before building or installing the browser native host",
        current_exe
    ))
}

#[cfg(target_os = "macos")]
fn normalize_macos_home_for_native_host_paths(home: &Path) -> PathBuf {
    let home_str = home.to_string_lossy();
    let marker = "/Library/Containers/com.agiworkforce.desktop/Data";

    if let Some(idx) = home_str.find(marker) {
        let real_home = &home_str[..idx];
        if !real_home.is_empty() {
            return PathBuf::from(real_home);
        }
    }

    home.to_path_buf()
}

#[cfg(target_os = "macos")]
fn get_macos_user_home_for_native_host_paths() -> Result<PathBuf> {
    let env_home = std::env::var("HOME").ok().map(PathBuf::from);
    let dirs_home = dirs::home_dir();

    // Try env HOME first
    if let Some(candidate) = env_home {
        let normalized = normalize_macos_home_for_native_host_paths(&candidate);
        tracing::debug!(
            "Resolved macOS user home (env): candidate={:?} normalized={:?}",
            candidate,
            normalized
        );
        return Ok(normalized);
    }

    // Fallback to dirs::home_dir()
    if let Some(candidate) = dirs_home {
        let normalized = normalize_macos_home_for_native_host_paths(&candidate);
        tracing::debug!(
            "Resolved macOS user home (dirs): candidate={:?} normalized={:?}",
            candidate,
            normalized
        );
        return Ok(normalized);
    }

    Err(anyhow!(
        "Could not determine macOS user home for native messaging paths"
    ))
}

#[cfg(target_os = "macos")]
fn prepare_macos_native_host_binary(source: &PathBuf) -> Result<PathBuf> {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::process::Command;

    let home = get_macos_user_home_for_native_host_paths()?;
    let destinations = [
        home.join(
            "Library/Containers/com.agiworkforce.desktop/Data/Library/Application Support/com.agiworkforce.desktop/native_messaging_host",
        ),
        home.join("Library/Application Support/com.agiworkforce.desktop/native_messaging_host"),
    ];

    let mut last_error: Option<anyhow::Error> = None;

    for dest in destinations {
        if let Some(parent) = dest.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                last_error = Some(anyhow!(
                    "Failed to create native host destination dir {:?}: {}",
                    parent,
                    e
                ));
                continue;
            }
        }

        if let Err(e) = fs::copy(source, &dest) {
            last_error = Some(anyhow!(
                "Failed to copy native host binary from {:?} to {:?}: {}",
                source,
                dest,
                e
            ));
            continue;
        }

        let _ = fs::set_permissions(&dest, fs::Permissions::from_mode(0o755));

        // The bundled helper inherits app sandbox entitlements and crashes when Chrome launches it.
        // Re-signing an external copy ad-hoc removes those entitlements and makes it launchable.
        let _ = Command::new("/usr/bin/codesign")
            .arg("--remove-signature")
            .arg(&dest)
            .output();

        match Command::new("/usr/bin/codesign")
            .args(["--force", "--sign", "-"])
            .arg(&dest)
            .output()
        {
            Ok(output) if output.status.success() => {
                tracing::info!(
                    "Prepared external native messaging host binary at {:?} (ad-hoc signed)",
                    dest
                );
            }
            Ok(output) => {
                tracing::warn!(
                    "codesign ad-hoc signing failed for {:?} (status {:?}): {}",
                    dest,
                    output.status.code(),
                    String::from_utf8_lossy(&output.stderr)
                );
            }
            Err(e) => {
                tracing::warn!(
                    "codesign not available or failed to launch for {:?}: {}",
                    dest,
                    e
                );
            }
        }

        return Ok(dest);
    }

    Err(last_error.unwrap_or_else(|| anyhow!("Failed to prepare macOS native host binary copy")))
}

#[cfg(target_os = "macos")]
fn helper_fallback_enabled() -> bool {
    std::env::var("AGI_NATIVE_HOST_INSTALLER_HELPER_CHILD")
        .map(|value| value != "1")
        .unwrap_or(true)
}

#[cfg(target_os = "macos")]
fn try_install_manifests_via_external_helper(
    helper_binary: &PathBuf,
    extension_id: Option<&str>,
) -> Result<Vec<PathBuf>> {
    use std::process::Command;

    if !helper_binary.exists() {
        return Err(anyhow!(
            "External helper binary does not exist: {:?}",
            helper_binary
        ));
    }

    let helper_name = helper_binary
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    if !is_native_host_executable_name(helper_name) {
        return Err(anyhow!(
            "Refusing helper fallback for non-helper executable: {:?}",
            helper_binary
        ));
    }

    let mut command = Command::new(helper_binary);
    command
        .arg("--install-manifests")
        .env("AGI_NATIVE_HOST_INSTALLER_HELPER_CHILD", "1");
    if let Some(ext_id) = extension_id {
        command.arg(ext_id);
    }

    let output = command.output().map_err(|e| {
        anyhow!(
            "Failed to launch external helper installer {:?}: {}",
            helper_binary,
            e
        )
    })?;

    if !output.status.success() {
        return Err(anyhow!(
            "External helper installer exited with status {:?}. stderr: {}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let manifest_filename = "com.agiworkforce.browser.json";
    let mut installed = Vec::new();

    if let Ok(chrome_dir) = get_chrome_native_messaging_dir() {
        let path = chrome_dir.join(manifest_filename);
        if path.exists() {
            installed.push(path);
        }
    }
    if let Ok(edge_dir) = get_edge_native_messaging_dir() {
        let path = edge_dir.join(manifest_filename);
        if path.exists() {
            installed.push(path);
        }
    }

    if installed.is_empty() {
        return Err(anyhow!(
            "External helper installer reported success but no manifests were found"
        ));
    }

    Ok(installed)
}

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
        let home = get_macos_user_home_for_native_host_paths()?;
        Ok(home.join("Library/Application Support/Google/Chrome/NativeMessagingHosts"))
    }

    #[cfg(target_os = "windows")]
    {
        let base_dir = dirs::data_local_dir()
            .ok_or_else(|| anyhow!("Could not determine Windows local data directory"))?;
        Ok(base_dir
            .join("com.agiworkforce.desktop")
            .join("native-messaging")
            .join("chrome"))
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
        let home = get_macos_user_home_for_native_host_paths()?;
        Ok(home.join("Library/Application Support/Microsoft Edge/NativeMessagingHosts"))
    }

    #[cfg(target_os = "windows")]
    {
        let base_dir = dirs::data_local_dir()
            .ok_or_else(|| anyhow!("Could not determine Windows local data directory"))?;
        Ok(base_dir
            .join("com.agiworkforce.desktop")
            .join("native-messaging")
            .join("edge"))
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
    let host_name = NATIVE_MESSAGING_HOST_NAME;

    let current_exe =
        std::env::current_exe().map_err(|e| anyhow!("Failed to get executable path: {}", e))?;
    let exe_path = resolve_native_host_executable(&current_exe)?;

    #[cfg(target_os = "macos")]
    let exe_path = {
        let mut exe_path = exe_path;
        let current_exe_str = current_exe.to_string_lossy();
        let helper_is_bundled_sidecar = exe_path
            .file_name()
            .and_then(|name| name.to_str())
            .map(is_native_host_executable_name)
            .unwrap_or(false)
            && current_exe_str.contains(".app/Contents/MacOS/");

        if helper_is_bundled_sidecar {
            match prepare_macos_native_host_binary(&exe_path) {
                Ok(prepared_path) => {
                    exe_path = prepared_path;
                }
                Err(e) => {
                    tracing::warn!(
                        "Failed to prepare external macOS native host binary; falling back to bundled helper: {}",
                        e
                    );
                }
            }
        }
        exe_path
    };

    let exe_path_str = exe_path
        .to_str()
        .ok_or_else(|| anyhow!("Invalid executable path"))?;

    let mut manifest = NativeHostManifest::new(
        host_name,
        "AGI Workforce Browser Automation Host",
        exe_path_str,
    );

    for ext_id in DEFAULT_BROWSER_EXTENSION_IDS {
        manifest.add_extension(ext_id);
    }

    if let Some(ext_id) = extension_id {
        if !is_valid_chrome_extension_id(ext_id) {
            return Err(anyhow!("Invalid Chrome extension ID: {}", ext_id));
        }
        manifest.add_extension(ext_id);
    }

    // Also add wildcard for development (remove in production)
    // manifest.add_extension("*");

    let manifest_json = manifest.to_json()?;
    let manifest_filename = format!("{}.json", host_name);

    let mut installed_paths = Vec::new();
    let mut chrome_manifest_path: Option<PathBuf> = None;
    let mut edge_manifest_path: Option<PathBuf> = None;

    // Install for Chrome
    if let Ok(chrome_dir) = get_chrome_native_messaging_dir() {
        chrome_manifest_path = Some(chrome_dir.join(&manifest_filename));
        if let Err(e) = install_manifest_to_dir(&chrome_dir, &manifest_filename, &manifest_json) {
            tracing::warn!("Failed to install Chrome manifest: {}", e);
        } else {
            installed_paths.push(chrome_dir.join(&manifest_filename));
        }
    }

    // Install for Edge
    if let Ok(edge_dir) = get_edge_native_messaging_dir() {
        edge_manifest_path = Some(edge_dir.join(&manifest_filename));
        if let Err(e) = install_manifest_to_dir(&edge_dir, &manifest_filename, &manifest_json) {
            tracing::warn!("Failed to install Edge manifest: {}", e);
        } else {
            installed_paths.push(edge_dir.join(&manifest_filename));
        }
    }

    #[cfg(target_os = "windows")]
    {
        let mut registered_count = 0usize;
        if let Some(path) = &chrome_manifest_path {
            if path.exists() {
                register_windows_native_host(host_name, BrowserFamily::Chrome, path)?;
                registered_count += 1;
            }
        }
        if let Some(path) = &edge_manifest_path {
            if path.exists() {
                register_windows_native_host(host_name, BrowserFamily::Edge, path)?;
                registered_count += 1;
            }
        }
        if registered_count == 0 {
            return Err(anyhow!(
                "Failed to register Windows native messaging host because no manifest files were written"
            ));
        }
    }

    // Consume on non-macOS to satisfy dead-code lints; only macOS uses these paths.
    #[cfg(not(target_os = "macos"))]
    let _ = (chrome_manifest_path, edge_manifest_path);

    #[cfg(target_os = "macos")]
    {
        let chrome_missing = chrome_manifest_path
            .as_ref()
            .map(|path| !path.exists())
            .unwrap_or(true);

        if helper_fallback_enabled() && (installed_paths.is_empty() || chrome_missing) {
            match try_install_manifests_via_external_helper(&exe_path, extension_id) {
                Ok(paths) => {
                    tracing::info!(
                        "Installed native messaging manifests via external helper at {} location(s)",
                        paths.len()
                    );
                    for path in paths {
                        if !installed_paths.iter().any(|existing| existing == &path) {
                            installed_paths.push(path);
                        }
                    }
                }
                Err(error) => {
                    tracing::warn!(
                        "External helper native messaging manifest install fallback failed: {}",
                        error
                    );
                }
            }
        }

        // Ensure returned paths include currently present manifest files even if they were pre-existing.
        if let Some(path) = chrome_manifest_path {
            if path.exists() && !installed_paths.iter().any(|existing| existing == &path) {
                installed_paths.push(path);
            }
        }
        if let Some(path) = edge_manifest_path {
            if path.exists() && !installed_paths.iter().any(|existing| existing == &path) {
                installed_paths.push(path);
            }
        }
    }

    if installed_paths.is_empty() {
        return Err(anyhow!("Failed to install any native messaging manifests"));
    }

    Ok(installed_paths)
}

fn install_manifest_to_dir(dir: &Path, filename: &str, content: &str) -> Result<()> {
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
#[derive(Debug, Clone, Copy)]
enum BrowserFamily {
    Chrome,
    Edge,
}

#[cfg(target_os = "windows")]
fn windows_registry_key_path(host_name: &str, browser: BrowserFamily) -> String {
    match browser {
        BrowserFamily::Chrome => {
            format!(
                "Software\\Google\\Chrome\\NativeMessagingHosts\\{}",
                host_name
            )
        }
        BrowserFamily::Edge => {
            format!(
                "Software\\Microsoft\\Edge\\NativeMessagingHosts\\{}",
                host_name
            )
        }
    }
}

#[cfg(target_os = "windows")]
fn register_windows_native_host(
    host_name: &str,
    browser: BrowserFamily,
    manifest_path: &Path,
) -> Result<()> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
    use winreg::RegKey;

    let manifest_path = manifest_path
        .to_str()
        .ok_or_else(|| anyhow!("Invalid manifest path"))?;
    let key_path = windows_registry_key_path(host_name, browser);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey_with_flags(&key_path, KEY_WRITE)
        .map_err(|e| anyhow!("Failed to create HKCU\\{}: {}", key_path, e))?;
    key.set_value("", &manifest_path.to_string())
        .map_err(|e| anyhow!("Failed to set HKCU\\{} default value: {}", key_path, e))?;

    tracing::info!(
        "Registered Windows native messaging host {:?}: HKCU\\{} -> {}",
        browser,
        key_path,
        manifest_path
    );
    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[allow(dead_code)]
fn register_windows_native_host(_host_name: &str, _manifest_json: &str) -> Result<()> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn unregister_windows_native_hosts(host_name: &str) -> Result<()> {
    use std::io::ErrorKind;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    for browser in [BrowserFamily::Chrome, BrowserFamily::Edge] {
        let key_path = windows_registry_key_path(host_name, browser);
        match hkcu.delete_subkey_all(&key_path) {
            Ok(()) => tracing::info!("Removed Windows native host key HKCU\\{}", key_path),
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => {
                return Err(anyhow!(
                    "Failed to remove Windows native host key HKCU\\{}: {}",
                    key_path,
                    error
                ));
            }
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn is_windows_native_host_registered(host_name: &str) -> bool {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    [BrowserFamily::Chrome, BrowserFamily::Edge]
        .iter()
        .any(|browser| {
            let key_path = windows_registry_key_path(host_name, *browser);
            let Ok(key) = hkcu.open_subkey_with_flags(key_path, KEY_READ) else {
                return false;
            };
            let Ok(manifest_path) = key.get_value::<String, _>("") else {
                return false;
            };
            PathBuf::from(manifest_path).exists()
        })
}

/// Uninstall native messaging manifests
pub fn uninstall_manifests() -> Result<()> {
    let host_name = NATIVE_MESSAGING_HOST_NAME;
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

    #[cfg(target_os = "windows")]
    unregister_windows_native_hosts(host_name)?;

    Ok(())
}

/// Check if native messaging is properly installed
pub fn is_native_messaging_installed() -> bool {
    let host_name = NATIVE_MESSAGING_HOST_NAME;

    #[cfg(target_os = "windows")]
    {
        return is_windows_native_host_registered(host_name);
    }

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
    #[cfg(target_os = "macos")]
    use std::sync::Mutex;

    /// Guards tests that mutate process-global environment variables so they
    /// don't race each other when `cargo test` runs them in parallel.
    #[cfg(target_os = "macos")]
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn test_manifest_creation() {
        let mut manifest =
            NativeHostManifest::new("com.test.host", "Test Host", "/usr/local/bin/test-host");

        manifest.add_extension("abcdefghijklmnop");

        let json = manifest.to_json().unwrap();
        assert!(json.contains("com.test.host"));
        assert!(json.contains("chrome-extension://abcdefghijklmnop/"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_normalize_macos_home_for_native_host_paths_from_sandbox_home() {
        let sandbox_home =
            PathBuf::from("/Users/testuser/Library/Containers/com.agiworkforce.desktop/Data");
        let normalized = normalize_macos_home_for_native_host_paths(&sandbox_home);
        assert_eq!(normalized, PathBuf::from("/Users/testuser"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_get_macos_user_home_prefers_env_home() {
        let _guard = ENV_LOCK.lock().unwrap();
        // When HOME env var is set, it should be used as the candidate
        let original = std::env::var("HOME").ok();
        std::env::set_var("HOME", "/Users/testuser");

        let result = get_macos_user_home_for_native_host_paths();
        assert!(result.is_ok(), "Should resolve home when HOME env is set");
        assert_eq!(result.unwrap(), PathBuf::from("/Users/testuser"));

        // Restore original
        match original {
            Some(val) => std::env::set_var("HOME", val),
            None => std::env::remove_var("HOME"),
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_get_macos_user_home_falls_back_to_dirs() {
        let _guard = ENV_LOCK.lock().unwrap();
        // When HOME env var is unset, dirs::home_dir() should be used as fallback
        let original = std::env::var("HOME").ok();
        std::env::remove_var("HOME");

        let result = get_macos_user_home_for_native_host_paths();
        // dirs::home_dir() may or may not return Some depending on the system,
        // but the important thing is that the function does NOT panic and
        // the fallback path is reachable (no never_loop).
        // On most macOS systems dirs::home_dir() will still return Some.
        if dirs::home_dir().is_some() {
            assert!(result.is_ok(), "Should fall back to dirs::home_dir()");
        } else {
            assert!(result.is_err(), "Should error when no home dir available");
        }

        // Restore original
        if let Some(val) = original {
            std::env::set_var("HOME", val);
        }
    }
}
