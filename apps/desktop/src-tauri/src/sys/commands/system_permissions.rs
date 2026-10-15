use serde::{Deserialize, Serialize};

/// How a desktop-control capability becomes usable on this platform.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilitySupport {
    /// The operating system gates it behind a grant the user gives.
    NeedsGrant,
    /// The operating system has no such grant; it works without one.
    NoGrantNeeded,
    /// This build has no driver for it on this platform.
    Unsupported,
}

/// What desktop control can do on this platform, apart from which grants the
/// user has given.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlatformAutomationSupport {
    pub accessibility: CapabilitySupport,
    pub screen_recording: CapabilitySupport,
    pub input_monitoring: CapabilitySupport,
    /// The program window listing and switching need and this computer lacks,
    /// or `None` when window control is available.
    pub window_control_missing_program: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationPermissions {
    /// `false` only while a grant the user can give is missing. Where the
    /// platform has no such grant these are `true`; `support` says whether
    /// the capability exists at all.
    pub accessibility: bool,
    pub screen_recording: bool,
    pub input_monitoring: bool,
    /// Whether desktop control can start now. The service is built on first
    /// use once Accessibility is granted, so a fresh grant needs no restart.
    pub automation_service_ready: bool,
    pub support: PlatformAutomationSupport,
}

const LINUX_WINDOW_CONTROL_PROGRAM: &str = "wmctrl";

fn platform_support(
    os: &str,
    has_accessibility_driver: bool,
    program_installed: impl Fn(&str) -> bool,
) -> PlatformAutomationSupport {
    let grants = if os == "macos" {
        CapabilitySupport::NeedsGrant
    } else {
        CapabilitySupport::NoGrantNeeded
    };
    PlatformAutomationSupport {
        accessibility: if has_accessibility_driver {
            grants
        } else {
            CapabilitySupport::Unsupported
        },
        screen_recording: grants,
        input_monitoring: grants,
        window_control_missing_program: (os == "linux"
            && !program_installed(LINUX_WINDOW_CONTROL_PROGRAM))
        .then(|| LINUX_WINDOW_CONTROL_PROGRAM.to_string()),
    }
}

fn program_on_path(name: &str) -> bool {
    std::env::var_os("PATH").is_some_and(|path| {
        agiworkforce_sandbox_policy::host_path::find_program(&path, name, &[]).is_some()
    })
}

fn current_platform_support() -> PlatformAutomationSupport {
    platform_support(
        std::env::consts::OS,
        crate::automation::accessibility_backend().is_some(),
        program_on_path,
    )
}

/// Reports which automation grants the user has given and what this platform
/// supports. Windows and Linux have no grants to give, so the three flags are
/// `true` there and `support` carries the real capability.
#[tauri::command]
pub async fn check_automation_permissions(
    app: tauri::AppHandle,
) -> Result<AutomationPermissions, String> {
    let automation_service_ready = crate::automation::shared_service(&app).is_ok();
    let support = current_platform_support();

    #[cfg(target_os = "macos")]
    {
        let accessibility = check_accessibility();
        let screen_recording = check_screen_recording();
        let input_monitoring = check_input_monitoring();
        Ok(AutomationPermissions {
            accessibility,
            screen_recording,
            input_monitoring,
            automation_service_ready,
            support,
        })
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(AutomationPermissions {
            accessibility: true,
            screen_recording: true,
            input_monitoring: true,
            automation_service_ready,
            support,
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
                ));
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
        Err("This platform has no system permission to grant for desktop control.".to_string())
    }
}

#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
pub(crate) fn check_accessibility() -> bool {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn macos_gates_every_capability_behind_a_grant() {
        let support = platform_support("macos", true, |_| false);
        assert_eq!(support.accessibility, CapabilitySupport::NeedsGrant);
        assert_eq!(support.screen_recording, CapabilitySupport::NeedsGrant);
        assert_eq!(support.input_monitoring, CapabilitySupport::NeedsGrant);
        assert_eq!(support.window_control_missing_program, None);
    }

    #[test]
    fn windows_needs_no_grant_and_is_not_reported_as_granted() {
        let support = platform_support("windows", true, |_| false);
        assert_eq!(support.accessibility, CapabilitySupport::NoGrantNeeded);
        assert_eq!(support.screen_recording, CapabilitySupport::NoGrantNeeded);
        assert_eq!(support.window_control_missing_program, None);
    }

    #[test]
    fn linux_has_no_element_level_control() {
        let support = platform_support("linux", false, |_| true);
        assert_eq!(support.accessibility, CapabilitySupport::Unsupported);
        assert_eq!(support.screen_recording, CapabilitySupport::NoGrantNeeded);
        assert_eq!(support.window_control_missing_program, None);
    }

    #[test]
    fn linux_window_control_names_the_program_it_is_missing() {
        let asked = std::cell::RefCell::new(Vec::new());
        let support = platform_support("linux", false, |program| {
            asked.borrow_mut().push(program.to_string());
            false
        });
        assert_eq!(
            support.window_control_missing_program.as_deref(),
            Some("wmctrl")
        );
        assert_eq!(*asked.borrow(), ["wmctrl"]);
    }

    #[test]
    fn the_running_platform_reports_the_driver_it_was_built_with() {
        let support = current_platform_support();
        assert_eq!(
            support.accessibility == CapabilitySupport::Unsupported,
            crate::automation::accessibility_backend().is_none()
        );
    }
}
