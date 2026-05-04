// SAFETY: Window management requires unsafe Win32 API calls (GetForegroundWindow, EnumWindows, etc.)
#![allow(unsafe_code)]

//! Window Manager for Computer Use.
//!
//! This module provides cross-app window management capabilities:
//! - Window enumeration
//! - Window activation/focusing
//! - Multi-window coordination
//! - Application launching

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::time::sleep;

/// Sanitizes a string for safe interpolation into AppleScript string literals.
/// Removes double quotes, backslashes, single quotes, null bytes, and newlines
/// (`\n`, `\r`) that could break out of AppleScript string literals or inject
/// arbitrary commands. Trims to max 200 chars.
///
/// Only called from macOS code paths in this module — suppress dead_code on
/// other platforms so CI's `-D dead-code` (set by setup-rust-toolchain
/// via RUSTFLAGS=-D warnings) doesn't flag the Linux build.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn sanitize_applescript_string(input: &str) -> String {
    input
        .chars()
        .filter(|c| *c != '"' && *c != '\\' && *c != '\'' && *c != '\0' && *c != '\n' && *c != '\r')
        .take(200)
        .collect()
}

/// Sanitizes a window title for use as a direct argument to external commands
/// (e.g. wmctrl) where the value is passed as a separate argv element rather than
/// through a shell. Strips null bytes (which would truncate argv), newlines
/// (`\n`, `\r`) which could be interpreted by some tools, and enforces a length
/// limit to prevent excessively long arguments.
// Only used on non-Windows/non-macOS (Linux) — suppress dead_code on other platforms.
#[cfg_attr(any(target_os = "windows", target_os = "macos"), allow(dead_code))]
fn sanitize_window_title_arg(input: &str) -> String {
    input
        .chars()
        .filter(|c| *c != '\0' && *c != '\n' && *c != '\r')
        .take(200)
        .collect()
}

/// Validates an application name to prevent arbitrary binary execution.
/// Only allows alphanumeric characters, hyphens, spaces, and dots.
/// Rejects path separators and shell metacharacters.
fn validate_app_name(name: &str) -> Result<()> {
    if name.is_empty() {
        return Err(anyhow!("Application name cannot be empty"));
    }

    // Reject relative path components
    if name == "." || name == ".." {
        return Err(anyhow!(
            "Application name cannot be a relative path component: '{}'",
            name
        ));
    }

    // Reject path separators — prevents launching arbitrary binaries by path
    if name.contains('/') || name.contains('\\') {
        return Err(anyhow!(
            "Application name must not contain path separators: '{}'",
            name
        ));
    }

    // Reject shell metacharacters
    let forbidden = [
        ';', '|', '&', '$', '`', '(', ')', '{', '}', '<', '>', '!', '#', '*', '?', '[', ']', '~',
    ];
    for ch in &forbidden {
        if name.contains(*ch) {
            return Err(anyhow!(
                "Application name contains forbidden character '{}': '{}'",
                ch,
                name
            ));
        }
    }

    // Only allow alphanumeric + hyphens + spaces + dots
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == ' ' || c == '.')
    {
        return Err(anyhow!(
            "Application name contains invalid characters (only alphanumeric, hyphens, spaces, dots allowed): '{}'",
            name
        ));
    }

    Ok(())
}

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetForegroundWindow, GetWindowTextW, IsWindowVisible, SetForegroundWindow,
    ShowWindow, SW_RESTORE, SW_SHOW,
};

#[cfg(target_os = "macos")]
use std::process::Command;

/// Configuration for window management.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowManagerConfig {
    /// Timeout for window activation.
    pub activation_timeout: Duration,
    /// Delay after activation before interaction.
    pub post_activation_delay: Duration,
    /// Whether to bring windows to front automatically.
    pub auto_bring_to_front: bool,
    /// Number of retries for window activation.
    pub activation_retries: u32,
}

impl Default for WindowManagerConfig {
    fn default() -> Self {
        Self {
            activation_timeout: Duration::from_secs(5),
            post_activation_delay: Duration::from_millis(200),
            auto_bring_to_front: true,
            activation_retries: 3,
        }
    }
}

/// Lightweight identification of the currently focused application,
/// returned by `WindowCoordinator::get_active_window`. Used by the
/// per-app permission gate before the agent sends an action that would
/// affect the foreground window.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveWindow {
    /// Human-readable application name (e.g. "Safari", "Terminal", "chrome").
    pub app_name: String,
    /// Title of the focused window (may be empty on some platforms).
    pub window_title: String,
    /// macOS bundle identifier (e.g. "com.apple.Safari"). On Windows this
    /// is the executable file name (e.g. "chrome.exe"). On Linux this is
    /// `None` because reliable bundle-id discovery requires X11/Wayland
    /// atom queries that haven't been implemented yet.
    pub bundle_id: Option<String>,
}

/// Information about an application window.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppWindow {
    /// Platform-specific window handle.
    pub handle: isize,
    /// Window title.
    pub title: String,
    /// Process/application name.
    pub process_name: String,
    /// Window position and size.
    pub bounds: WindowBounds,
    /// Whether the window is currently visible.
    pub is_visible: bool,
    /// Whether the window is currently focused.
    pub is_focused: bool,
    /// Whether the window is minimized.
    pub is_minimized: bool,
}

/// Window bounds (position and size).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl WindowBounds {
    /// Returns the center point of the window.
    pub fn center(&self) -> (i32, i32) {
        (
            self.x + (self.width as i32 / 2),
            self.y + (self.height as i32 / 2),
        )
    }
}

/// Result of a window activation attempt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowActivation {
    /// Whether activation succeeded.
    pub success: bool,
    /// The activated window (if successful).
    pub window: Option<AppWindow>,
    /// Error message if failed.
    pub error: Option<String>,
    /// Number of attempts made.
    pub attempts: u32,
}

impl WindowActivation {
    fn success(window: AppWindow, attempts: u32) -> Self {
        Self {
            success: true,
            window: Some(window),
            error: None,
            attempts,
        }
    }

    fn failure(error: impl Into<String>, attempts: u32) -> Self {
        Self {
            success: false,
            window: None,
            error: Some(error.into()),
            attempts,
        }
    }
}

/// Enumerates windows on the system.
pub struct WindowEnumerator;

impl WindowEnumerator {
    /// Lists all visible top-level windows.
    #[cfg(target_os = "windows")]
    pub fn list_windows() -> Result<Vec<AppWindow>> {
        use std::sync::{Arc, Mutex};
        use windows::Win32::Foundation::RECT;
        use windows::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId, IsIconic, GWL_EXSTYLE,
            WS_EX_TOOLWINDOW,
        };

        let windows: Arc<Mutex<Vec<AppWindow>>> = Arc::new(Mutex::new(Vec::new()));
        let windows_clone = Arc::clone(&windows);

        let foreground = unsafe { GetForegroundWindow() };

        unsafe {
            unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
                let windows = &*(lparam.0 as *const Mutex<Vec<AppWindow>>);

                if !IsWindowVisible(hwnd).as_bool() {
                    return BOOL(1);
                }

                // Get window title
                let mut title_buffer = [0u16; 512];
                let title_len = GetWindowTextW(hwnd, &mut title_buffer);
                if title_len == 0 {
                    return BOOL(1);
                }
                let title = String::from_utf16_lossy(&title_buffer[..title_len as usize]);

                // Skip tool windows
                let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                if (ex_style as u32 & WS_EX_TOOLWINDOW.0) != 0 {
                    return BOOL(1);
                }

                // Get window rect
                let mut rect = RECT::default();
                if GetWindowRect(hwnd, &mut rect).is_err() {
                    return BOOL(1);
                }

                let width = rect.right - rect.left;
                let height = rect.bottom - rect.top;
                if width <= 0 || height <= 0 {
                    return BOOL(1);
                }

                // Get process name
                let mut process_id: u32 = 0;
                GetWindowThreadProcessId(hwnd, Some(&mut process_id));

                let process_name = if process_id != 0 {
                    if let Ok(process_handle) =
                        OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id)
                    {
                        use windows::core::PWSTR;
                        use windows::Win32::System::Threading::PROCESS_NAME_WIN32;
                        let mut buffer = [0u16; 512];
                        let mut size = buffer.len() as u32;

                        if QueryFullProcessImageNameW(
                            process_handle,
                            PROCESS_NAME_WIN32,
                            PWSTR(buffer.as_mut_ptr()),
                            &mut size,
                        )
                        .is_ok()
                        {
                            let path = String::from_utf16_lossy(&buffer[..size as usize]);
                            path.split('\\')
                                .next_back()
                                .unwrap_or("Unknown")
                                .to_string()
                        } else {
                            "Unknown".to_string()
                        }
                    } else {
                        "Unknown".to_string()
                    }
                } else {
                    "Unknown".to_string()
                };

                let is_minimized = IsIconic(hwnd).as_bool();

                if let Ok(mut guard) = windows.lock() {
                    guard.push(AppWindow {
                        handle: hwnd.0,
                        title,
                        process_name,
                        bounds: WindowBounds {
                            x: rect.left,
                            y: rect.top,
                            width: width as u32,
                            height: height as u32,
                        },
                        is_visible: true,
                        is_focused: false, // Will be set after enumeration
                        is_minimized,
                    });
                }

                BOOL(1)
            }

            let lparam = LPARAM(&*windows_clone as *const Mutex<Vec<AppWindow>> as isize);
            EnumWindows(Some(enum_callback), lparam).context("Failed to enumerate windows")?;
        }

        let mut result = Arc::try_unwrap(windows)
            .map_err(|_| anyhow!("Failed to unwrap Arc"))?
            .into_inner()
            .map_err(|e| anyhow!("Failed to lock mutex: {}", e))?;

        // Mark the focused window
        let foreground_handle = foreground.0;
        for window in &mut result {
            if window.handle == foreground_handle {
                window.is_focused = true;
            }
        }

        Ok(result)
    }

    /// Lists all visible top-level windows (macOS).
    #[cfg(target_os = "macos")]
    pub fn list_windows() -> Result<Vec<AppWindow>> {
        // Use AppleScript to get window list
        let script = r#"
            set windowList to {}
            tell application "System Events"
                set allProcesses to every process whose visible is true
                repeat with proc in allProcesses
                    try
                        set procName to name of proc
                        set procWindows to every window of proc
                        repeat with win in procWindows
                            try
                                set winTitle to name of win
                                set winPos to position of win
                                set winSize to size of win
                                set end of windowList to procName & "|" & winTitle & "|" & (item 1 of winPos) & "|" & (item 2 of winPos) & "|" & (item 1 of winSize) & "|" & (item 2 of winSize)
                            end try
                        end repeat
                    end try
                end repeat
            end tell
            return windowList as string
        "#;

        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .context("Failed to execute AppleScript")?;

        if !output.status.success() {
            return Err(anyhow!(
                "AppleScript failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let output_str = String::from_utf8_lossy(&output.stdout);
        let mut windows = Vec::new();

        for (i, line) in output_str.split(", ").enumerate() {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 6 {
                let x: i32 = parts[2].trim().parse().unwrap_or(0);
                let y: i32 = parts[3].trim().parse().unwrap_or(0);
                let width: u32 = parts[4].trim().parse().unwrap_or(0);
                let height: u32 = parts[5].trim().parse().unwrap_or(0);

                windows.push(AppWindow {
                    handle: i as isize, // macOS doesn't have HWND, use index
                    title: parts[1].to_string(),
                    process_name: parts[0].to_string(),
                    bounds: WindowBounds {
                        x,
                        y,
                        width,
                        height,
                    },
                    is_visible: true,
                    is_focused: i == 0, // First window is usually focused
                    is_minimized: false,
                });
            }
        }

        Ok(windows)
    }

    /// Lists all visible top-level windows (Linux).
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    pub fn list_windows() -> Result<Vec<AppWindow>> {
        // Use wmctrl or xdotool on Linux
        let output = std::process::Command::new("wmctrl")
            .args(["-l", "-G"])
            .output();

        match output {
            Ok(output) if output.status.success() => {
                let output_str = String::from_utf8_lossy(&output.stdout);
                let mut windows = Vec::new();

                for (i, line) in output_str.lines().enumerate() {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 8 {
                        let x: i32 = parts[2].parse().unwrap_or(0);
                        let y: i32 = parts[3].parse().unwrap_or(0);
                        let width: u32 = parts[4].parse().unwrap_or(0);
                        let height: u32 = parts[5].parse().unwrap_or(0);
                        let title = parts[7..].join(" ");

                        windows.push(AppWindow {
                            handle: i as isize,
                            title,
                            process_name: "Unknown".to_string(),
                            bounds: WindowBounds {
                                x,
                                y,
                                width,
                                height,
                            },
                            is_visible: true,
                            is_focused: false,
                            is_minimized: false,
                        });
                    }
                }

                Ok(windows)
            }
            _ => Err(anyhow!("Window enumeration requires wmctrl on Linux")),
        }
    }

    /// Finds windows matching a title pattern.
    pub fn find_by_title(pattern: &str) -> Result<Vec<AppWindow>> {
        let windows = Self::list_windows()?;
        let pattern_lower = pattern.to_lowercase();

        Ok(windows
            .into_iter()
            .filter(|w| w.title.to_lowercase().contains(&pattern_lower))
            .collect())
    }

    /// Finds windows by process name.
    pub fn find_by_process(process: &str) -> Result<Vec<AppWindow>> {
        let windows = Self::list_windows()?;
        let process_lower = process.to_lowercase();

        Ok(windows
            .into_iter()
            .filter(|w| w.process_name.to_lowercase().contains(&process_lower))
            .collect())
    }

    /// Gets the currently focused window.
    pub fn get_focused() -> Result<Option<AppWindow>> {
        let windows = Self::list_windows()?;
        Ok(windows.into_iter().find(|w| w.is_focused))
    }
}

/// Coordinates multi-window operations.
pub struct WindowCoordinator {
    config: WindowManagerConfig,
}

impl WindowCoordinator {
    /// Creates a new window coordinator.
    pub fn new(config: WindowManagerConfig) -> Self {
        Self { config }
    }

    /// Creates a coordinator with default configuration.
    pub fn with_defaults() -> Self {
        Self::new(WindowManagerConfig::default())
    }

    /// Returns the currently focused (frontmost) application's identification.
    ///
    /// macOS: queries NSWorkspace.frontmostApplication via AppleScript
    /// (avoids pulling additional cocoa/objc bindings; the call is cheap
    /// and AppleScript already handles the security boundary).
    /// Windows: GetForegroundWindow + GetWindowThreadProcessId +
    /// QueryFullProcessImageNameW for the executable name.
    /// Linux: returns `None` for v1 (TODO: implement via X11/Wayland atom
    /// queries — `_NET_ACTIVE_WINDOW` + `_NET_WM_PID`).
    pub fn get_active_window() -> Option<ActiveWindow> {
        Self::get_active_window_impl()
    }

    #[cfg(target_os = "macos")]
    fn get_active_window_impl() -> Option<ActiveWindow> {
        // Use AppleScript via System Events. Returns three pipe-separated fields:
        //   bundleId|appName|windowTitle
        // We deliberately use AppleScript instead of cocoa/NSWorkspace bindings
        // so we don't need to add `objc2` to Cargo.toml — AppleScript already
        // does the right thing here, has no extra security surface (the agent
        // is already capable of arbitrary AppleScript via existing window code),
        // and matches the patterns used elsewhere in this module.
        let script = r#"
            try
                tell application "System Events"
                    set frontApp to first application process whose frontmost is true
                    set procName to name of frontApp
                    set bid to (bundle identifier of frontApp) as string
                    set winTitle to ""
                    try
                        set winTitle to name of front window of frontApp
                    end try
                    return bid & "|" & procName & "|" & winTitle
                end tell
            on error
                return ""
            end try
        "#;

        let output = Command::new("osascript").arg("-e").arg(script).output().ok()?;
        if !output.status.success() {
            return None;
        }

        let raw = String::from_utf8_lossy(&output.stdout);
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return None;
        }

        let parts: Vec<&str> = trimmed.splitn(3, '|').collect();
        let (bundle_id, app_name, window_title) = match parts.as_slice() {
            [bid, name, title] => (bid.to_string(), name.to_string(), title.to_string()),
            [bid, name] => (bid.to_string(), name.to_string(), String::new()),
            _ => return None,
        };

        Some(ActiveWindow {
            app_name,
            window_title,
            bundle_id: if bundle_id.is_empty() {
                None
            } else {
                Some(bundle_id)
            },
        })
    }

    #[cfg(target_os = "windows")]
    fn get_active_window_impl() -> Option<ActiveWindow> {
        use windows::core::PWSTR;
        use windows::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
            PROCESS_QUERY_LIMITED_INFORMATION,
        };
        use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0 == 0 {
                return None;
            }

            // Title
            let mut title_buf = [0u16; 512];
            let title_len = GetWindowTextW(hwnd, &mut title_buf);
            let window_title = if title_len > 0 {
                String::from_utf16_lossy(&title_buf[..title_len as usize])
            } else {
                String::new()
            };

            // Process ID -> executable path
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return None;
            }

            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut path_buf = [0u16; 512];
            let mut size = path_buf.len() as u32;

            let exe_name = if QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                PWSTR(path_buf.as_mut_ptr()),
                &mut size,
            )
            .is_ok()
            {
                let full_path = String::from_utf16_lossy(&path_buf[..size as usize]);
                full_path
                    .split('\\')
                    .next_back()
                    .unwrap_or("Unknown")
                    .to_string()
            } else {
                "Unknown".to_string()
            };

            Some(ActiveWindow {
                app_name: exe_name.clone(),
                window_title,
                // On Windows there's no bundle id; we use the exe filename
                // (lowercased) as the matching key for ALWAYS_BLOCKED_BUNDLE_IDS.
                bundle_id: Some(exe_name.to_lowercase()),
            })
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    fn get_active_window_impl() -> Option<ActiveWindow> {
        // TODO: implement via X11/Wayland atom queries
        // (_NET_ACTIVE_WINDOW + _NET_WM_PID -> /proc/<pid>/exe). Until then,
        // return None so the permission gate falls through to the user-prompt
        // path rather than incorrectly allowing actions on Linux.
        None
    }

    /// Activates a window by title.
    pub async fn activate_by_title(&self, title: &str) -> WindowActivation {
        let mut attempts = 0;

        while attempts < self.config.activation_retries {
            attempts += 1;

            match WindowEnumerator::find_by_title(title) {
                Ok(windows) if !windows.is_empty() => {
                    let window = &windows[0];

                    match self.activate_window_internal(window.handle).await {
                        Ok(()) => {
                            // Verify activation
                            sleep(Duration::from_millis(100)).await;

                            if let Ok(Some(focused)) = WindowEnumerator::get_focused() {
                                if focused.title.to_lowercase().contains(&title.to_lowercase()) {
                                    return WindowActivation::success(focused, attempts);
                                }
                            }

                            // Return success even if verification failed
                            return WindowActivation::success(window.clone(), attempts);
                        }
                        Err(e) => {
                            if attempts >= self.config.activation_retries {
                                return WindowActivation::failure(e.to_string(), attempts);
                            }
                        }
                    }
                }
                Ok(_) => {
                    return WindowActivation::failure(
                        format!("No window found matching: {}", title),
                        attempts,
                    );
                }
                Err(e) => {
                    if attempts >= self.config.activation_retries {
                        return WindowActivation::failure(e.to_string(), attempts);
                    }
                }
            }

            sleep(Duration::from_millis(200)).await;
        }

        WindowActivation::failure("Max activation retries exceeded", attempts)
    }

    /// Activates a window by process name.
    pub async fn activate_by_process(&self, process: &str) -> WindowActivation {
        let mut attempts = 0;

        while attempts < self.config.activation_retries {
            attempts += 1;

            match WindowEnumerator::find_by_process(process) {
                Ok(windows) if !windows.is_empty() => {
                    let window = &windows[0];

                    match self.activate_window_internal(window.handle).await {
                        Ok(()) => {
                            sleep(Duration::from_millis(100)).await;
                            return WindowActivation::success(window.clone(), attempts);
                        }
                        Err(e) => {
                            if attempts >= self.config.activation_retries {
                                return WindowActivation::failure(e.to_string(), attempts);
                            }
                        }
                    }
                }
                Ok(_) => {
                    return WindowActivation::failure(
                        format!("No window found for process: {}", process),
                        attempts,
                    );
                }
                Err(e) => {
                    if attempts >= self.config.activation_retries {
                        return WindowActivation::failure(e.to_string(), attempts);
                    }
                }
            }

            sleep(Duration::from_millis(200)).await;
        }

        WindowActivation::failure("Max activation retries exceeded", attempts)
    }

    /// Activates a window by handle.
    #[cfg(target_os = "windows")]
    async fn activate_window_internal(&self, handle: isize) -> Result<()> {
        unsafe {
            let hwnd = HWND(handle as _);

            // Restore if minimized
            let _ = ShowWindow(hwnd, SW_RESTORE);

            // Show window
            let _ = ShowWindow(hwnd, SW_SHOW);

            // Set foreground
            SetForegroundWindow(hwnd)
                .ok()
                .context("Failed to set foreground window")?;
        }

        // Wait for window to come to front
        sleep(self.config.post_activation_delay).await;

        Ok(())
    }

    /// Activates a window by handle (macOS).
    ///
    /// On macOS, window handles are indices (not real HWNDs). We use
    /// AppleScript via `activate_by_title` for title-based activation,
    /// but this method is also called directly so we attempt to activate
    /// by finding the window at the given index via System Events.
    #[cfg(target_os = "macos")]
    async fn activate_window_internal(&self, handle: isize) -> Result<()> {
        // Look up the window by its index handle and activate its owning process
        let windows = WindowEnumerator::list_windows().unwrap_or_default();
        if let Some(window) = windows.iter().find(|w| w.handle == handle) {
            let safe_process = sanitize_applescript_string(&window.process_name);
            let script = format!(r#"tell application "{}" to activate"#, safe_process);
            Command::new("osascript")
                .arg("-e")
                .arg(&script)
                .status()
                .context("Failed to activate window via AppleScript")?;
        }

        sleep(self.config.post_activation_delay).await;
        Ok(())
    }

    /// Activates a window by handle (Linux).
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    async fn activate_window_internal(&self, handle: isize) -> Result<()> {
        // Use wmctrl or xdotool
        std::process::Command::new("wmctrl")
            .args(["-i", "-a", &format!("0x{:x}", handle)])
            .status()
            .context("Failed to activate window")?;

        sleep(self.config.post_activation_delay).await;
        Ok(())
    }

    /// Launches an application by name.
    #[cfg(target_os = "windows")]
    pub async fn launch_application(&self, name: &str) -> Result<()> {
        use std::process::Command;

        validate_app_name(name)?;

        // Try to run directly first
        let result = Command::new(name).spawn();

        if result.is_ok() {
            sleep(Duration::from_millis(500)).await;
            return Ok(());
        }

        // Try via cmd /c start
        Command::new("cmd")
            .args(["/c", "start", "", name])
            .spawn()
            .context("Failed to launch application")?;

        sleep(Duration::from_millis(500)).await;
        Ok(())
    }

    /// Launches an application by name (macOS).
    #[cfg(target_os = "macos")]
    pub async fn launch_application(&self, name: &str) -> Result<()> {
        validate_app_name(name)?;

        Command::new("open")
            .args(["-a", name])
            .spawn()
            .context("Failed to launch application")?;

        sleep(Duration::from_millis(500)).await;
        Ok(())
    }

    /// Launches an application by name (Linux).
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    pub async fn launch_application(&self, name: &str) -> Result<()> {
        validate_app_name(name)?;

        std::process::Command::new(name)
            .spawn()
            .context("Failed to launch application")?;

        sleep(Duration::from_millis(500)).await;
        Ok(())
    }

    /// Waits for a window with matching title to appear.
    pub async fn wait_for_window(
        &self,
        title_contains: &str,
        timeout: Duration,
    ) -> Result<AppWindow> {
        let start = std::time::Instant::now();
        let check_interval = Duration::from_millis(250);

        while start.elapsed() < timeout {
            if let Ok(windows) = WindowEnumerator::find_by_title(title_contains) {
                if !windows.is_empty() {
                    if let Some(window) = windows.into_iter().next() {
                        return Ok(window);
                    }
                }
            }

            sleep(check_interval).await;
        }

        Err(anyhow!(
            "Window with title containing '{}' did not appear within {:?}",
            title_contains,
            timeout
        ))
    }

    /// Closes a window by title.
    #[cfg(target_os = "windows")]
    pub async fn close_window(&self, title: &str) -> Result<()> {
        use windows::Win32::UI::WindowsAndMessaging::{SendMessageW, WM_CLOSE};

        let windows = WindowEnumerator::find_by_title(title)?;
        if windows.is_empty() {
            return Err(anyhow!("No window found matching: {}", title));
        }

        unsafe {
            let hwnd = HWND(windows[0].handle as _);
            let _ = SendMessageW(hwnd, WM_CLOSE, None, None);
        }

        Ok(())
    }

    /// Closes a window by title (macOS).
    #[cfg(target_os = "macos")]
    pub async fn close_window(&self, title: &str) -> Result<()> {
        let safe_title = sanitize_applescript_string(title);

        let script = format!(
            r#"tell application "System Events"
                set targetWindow to first window of (first process whose frontmost is true) whose name contains "{}"
                click button 1 of targetWindow
            end tell"#,
            safe_title
        );

        Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .status()
            .context("Failed to close window")?;

        Ok(())
    }

    /// Closes a window by title (Linux).
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    pub async fn close_window(&self, title: &str) -> Result<()> {
        // Use sanitize_window_title_arg (not sanitize_applescript_string) since wmctrl
        // receives the title as a direct argv element — no shell interpolation occurs.
        // We only need to strip null bytes and enforce a length cap.
        let safe_title = sanitize_window_title_arg(title);

        std::process::Command::new("wmctrl")
            .args(["-c", &safe_title])
            .status()
            .context("Failed to close window")?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_window_bounds_center() {
        let bounds = WindowBounds {
            x: 100,
            y: 200,
            width: 800,
            height: 600,
        };

        let (cx, cy) = bounds.center();
        assert_eq!(cx, 500); // 100 + 800/2
        assert_eq!(cy, 500); // 200 + 600/2
    }

    #[test]
    fn test_window_activation_result() {
        let window = AppWindow {
            handle: 123,
            title: "Test Window".to_string(),
            process_name: "test.exe".to_string(),
            bounds: WindowBounds {
                x: 0,
                y: 0,
                width: 800,
                height: 600,
            },
            is_visible: true,
            is_focused: true,
            is_minimized: false,
        };

        let success = WindowActivation::success(window.clone(), 1);
        assert!(success.success);
        assert!(success.window.is_some());
        assert!(success.error.is_none());

        let failure = WindowActivation::failure("Test error", 3);
        assert!(!failure.success);
        assert!(failure.window.is_none());
        assert!(failure.error.is_some());
    }

    #[test]
    fn test_config_defaults() {
        let config = WindowManagerConfig::default();
        assert_eq!(config.activation_timeout, Duration::from_secs(5));
        assert!(config.auto_bring_to_front);
        assert_eq!(config.activation_retries, 3);
    }

    #[test]
    fn test_sanitize_applescript_string_removes_quotes_and_backslashes() {
        assert_eq!(
            sanitize_applescript_string(r#"My "Window" Title"#),
            "My Window Title"
        );
        assert_eq!(
            sanitize_applescript_string(r#"test\" ; do shell script"#),
            "test ; do shell script"
        );
        assert_eq!(sanitize_applescript_string("normal title"), "normal title");
    }

    #[test]
    fn test_sanitize_applescript_string_truncates_long_input() {
        let long_input = "a".repeat(300);
        assert_eq!(sanitize_applescript_string(&long_input).len(), 200);
    }

    #[test]
    fn test_sanitize_applescript_string_strips_newlines() {
        // Newline injection: attacker crafts a window title containing \n to inject AppleScript
        assert_eq!(
            sanitize_applescript_string("title\ndo shell script \"evil\""),
            "titledo shell script evil"
        );
        assert_eq!(
            sanitize_applescript_string("title\r\ndo shell script \"evil\""),
            "titledo shell script evil"
        );
        assert_eq!(sanitize_applescript_string("clean title"), "clean title");
    }

    #[test]
    fn test_sanitize_window_title_arg_strips_null_and_newlines() {
        assert_eq!(sanitize_window_title_arg("title\0rest"), "titlerest");
        assert_eq!(
            sanitize_window_title_arg("title\ninjected"),
            "titleinjected"
        );
        assert_eq!(
            sanitize_window_title_arg("title\r\ninjected"),
            "titleinjected"
        );
        assert_eq!(sanitize_window_title_arg("normal title"), "normal title");
    }

    #[test]
    fn test_sanitize_window_title_arg_truncates_long_input() {
        let long_input = "b".repeat(300);
        assert_eq!(sanitize_window_title_arg(&long_input).len(), 200);
    }

    #[test]
    fn test_validate_app_name_rejects_path_separators() {
        assert!(validate_app_name("/usr/bin/evil").is_err());
        assert!(validate_app_name("..\\evil.exe").is_err());
    }

    #[test]
    fn test_validate_app_name_rejects_shell_metacharacters() {
        assert!(validate_app_name("app; rm -rf /").is_err());
        assert!(validate_app_name("app | cat /etc/passwd").is_err());
        assert!(validate_app_name("app & bg").is_err());
        assert!(validate_app_name("$(whoami)").is_err());
        assert!(validate_app_name("app`id`").is_err());
    }

    #[test]
    fn test_validate_app_name_allows_valid_names() {
        assert!(validate_app_name("Firefox").is_ok());
        assert!(validate_app_name("Google Chrome").is_ok());
        assert!(validate_app_name("code").is_ok());
        assert!(validate_app_name("my-app.exe").is_ok());
    }

    #[test]
    fn test_validate_app_name_rejects_empty() {
        assert!(validate_app_name("").is_err());
    }
}
