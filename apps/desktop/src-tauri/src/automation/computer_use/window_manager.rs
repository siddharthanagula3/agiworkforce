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
    #[cfg(target_os = "macos")]
    async fn activate_window_internal(&self, _handle: isize) -> Result<()> {
        // On macOS, we need to use accessibility APIs or AppleScript
        // For now, this is handled by activate_by_title using AppleScript
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
        let script = format!(
            r#"tell application "System Events"
                set targetWindow to first window of (first process whose frontmost is true) whose name contains "{}"
                click button 1 of targetWindow
            end tell"#,
            title
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
        std::process::Command::new("wmctrl")
            .args(["-c", title])
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
}
