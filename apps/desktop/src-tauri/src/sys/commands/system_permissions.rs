use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationPermissions {
    pub accessibility: bool,
    pub screen_recording: bool,
    pub input_monitoring: bool,
}

/// Check the current macOS automation permission statuses.
/// On non-macOS platforms, returns true for all (no-op).
#[tauri::command]
pub async fn check_automation_permissions() -> Result<AutomationPermissions, String> {
    #[cfg(target_os = "macos")]
    {
        let accessibility = check_accessibility();
        let screen_recording = check_screen_recording();
        let input_monitoring = check_input_monitoring();
        Ok(AutomationPermissions {
            accessibility,
            screen_recording,
            input_monitoring,
        })
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(AutomationPermissions {
            accessibility: true,
            screen_recording: true,
            input_monitoring: true,
        })
    }
}

/// Open System Settings to the relevant privacy pane so the user can grant a permission.
/// `kind` must be one of: "accessibility", "screen_recording", "input_monitoring"
#[tauri::command]
pub async fn request_automation_permission(kind: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let url = match kind.as_str() {
            "accessibility" => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
            }
            "screen_recording" => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
            }
            "input_monitoring" => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
            }
            other => {
                return Err(format!(
                    "Unknown permission kind '{}'. Use: accessibility, screen_recording, input_monitoring",
                    other
                ))
            }
        };

        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open System Settings: {}", e))?;

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = kind;
        Ok(())
    }
}

#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
fn check_accessibility() -> bool {
    use accessibility_sys::AXIsProcessTrusted;
    unsafe { AXIsProcessTrusted() }
}

#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
fn check_screen_recording() -> bool {
    // CGPreflightScreenCaptureAccess() is available on macOS 10.15+.
    // We link against CoreGraphics via the existing build setup.
    // Returns true if screen capture access has been granted.
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
    }
    unsafe { CGPreflightScreenCaptureAccess() }
}

#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
fn check_input_monitoring() -> bool {
    // IOHIDCheckAccess() is available on macOS 10.15+ via IOKit.
    // kIOHIDRequestTypeListenEvent = 1
    // Return values: 0 = granted, 1 = denied, 2 = unknown (not yet determined)
    extern "C" {
        fn IOHIDCheckAccess(request_type: u32) -> u32;
    }
    const K_IOHID_REQUEST_TYPE_LISTEN_EVENT: u32 = 1;
    const K_IOHID_ACCESS_TYPE_GRANTED: u32 = 0;
    unsafe { IOHIDCheckAccess(K_IOHID_REQUEST_TYPE_LISTEN_EVENT) == K_IOHID_ACCESS_TYPE_GRANTED }
}
