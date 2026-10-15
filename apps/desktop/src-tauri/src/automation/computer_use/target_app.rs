//! The app a chat desktop action is aimed at: resolved from the name or bundle
//! id the model gives, brought to the front, and checked again before input.

use super::window_manager::ActiveWindow;
use crate::automation::AutomationService;

const MAX_LISTED_APPS: usize = 40;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TargetApp {
    pub pid: i32,
    pub name: String,
    pub bundle_id: Option<String>,
}

impl TargetApp {
    /// The bundle id when the app has one, else its name; what a recorded
    /// step stores and what `app` accepts back.
    pub fn identifier(&self) -> String {
        self.bundle_id.clone().unwrap_or_else(|| self.name.clone())
    }

    pub fn as_active_window(&self) -> ActiveWindow {
        ActiveWindow {
            app_name: self.name.clone(),
            window_title: String::new(),
            bundle_id: self.bundle_id.clone(),
        }
    }
}

/// Exact matches only, bundle id first, then the name shown in the Dock. A
/// near match could put the input into an app the user never named.
pub fn match_target_app(apps: &[TargetApp], query: &str) -> Result<TargetApp, String> {
    let trimmed = query.trim();
    let wanted = trimmed
        .strip_suffix(".app")
        .filter(|name| !name.is_empty())
        .unwrap_or(trimmed);
    if wanted.is_empty() {
        return Err(
            "Name the app to use, as it appears in the Dock, or give its bundle id.".to_string(),
        );
    }

    if let Some(app) = apps.iter().find(|app| {
        app.bundle_id
            .as_deref()
            .is_some_and(|bundle_id| bundle_id.eq_ignore_ascii_case(wanted))
    }) {
        return Ok(app.clone());
    }

    let named: Vec<&TargetApp> = apps
        .iter()
        .filter(|app| app.name.eq_ignore_ascii_case(wanted))
        .collect();
    match named.as_slice() {
        [app] => Ok((*app).clone()),
        [] => {
            let mut names: Vec<&str> = apps.iter().map(|app| app.name.as_str()).collect();
            names.sort_unstable();
            names.dedup();
            names.truncate(MAX_LISTED_APPS);
            Err(format!(
                "No running app is called '{wanted}'. Open it first, or use one of: {}.",
                names.join(", ")
            ))
        }
        several => {
            let bundle_ids: Vec<&str> = several
                .iter()
                .filter_map(|app| app.bundle_id.as_deref())
                .collect();
            Err(format!(
                "More than one running app is called '{wanted}'. Name it by bundle id: {}.",
                bundle_ids.join(", ")
            ))
        }
    }
}

/// The app whose window is drawn at a screen point.
pub fn app_at_point(x: i32, y: i32) -> Option<TargetApp> {
    platform::app_at_point(x, y)
}

/// The app keystrokes currently go to.
pub fn app_with_keyboard_focus() -> Option<TargetApp> {
    platform::app_with_keyboard_focus()
}

/// Every running app a user could switch to.
pub fn running_target_apps() -> Result<Vec<TargetApp>, String> {
    running_apps()
}

pub fn resolve_target_app(query: &str) -> Result<TargetApp, String> {
    match_target_app(&running_apps()?, query)
}

/// The identified process in front, or `None` when it cannot be read, which
/// the per-app gate treats as an app nobody approved.
pub fn frontmost_app(automation: &AutomationService) -> Option<TargetApp> {
    platform::frontmost_app(automation)
}

/// Brings `target` to the front and waits, bounded, until the accessibility
/// server reports it there.
pub async fn bring_to_front(
    automation: &AutomationService,
    target: &TargetApp,
) -> Result<(), String> {
    platform::bring_to_front(automation, target).await
}

/// Refuses a pointer coordinate unless what is drawn there belongs to the
/// target: a click on another app's window would bring that app forward and
/// act on it without its per-app check.
pub fn ensure_point_in_target(
    automation: &AutomationService,
    target: &TargetApp,
    x: i32,
    y: i32,
) -> Result<(), String> {
    judge_point_owner(platform::pid_at_point(automation, x, y), target, x, y)
}

/// A point goes ahead only when its owner is known to be the target. "Could
/// not tell" is a refusal, never a pass: the only way this platform layer
/// fails to name an owner is that it has no hit-test at all (Linux), or that
/// the lookup itself failed.
fn judge_point_owner(
    owner: Result<i32, String>,
    target: &TargetApp,
    x: i32,
    y: i32,
) -> Result<(), String> {
    point_owner_matches(owner?, target, x, y)
}

/// Whether `front` is the very app a plan was made for: the same process and
/// the same bundle. Where the platform reports no process id, the bundle (an
/// executable name there) decides, and with neither, the name.
pub fn same_app(planned: &TargetApp, front: &TargetApp) -> bool {
    planned.pid == front.pid
        && planned.bundle_id == front.bundle_id
        && (planned.bundle_id.is_some() || planned.name == front.name)
}

fn point_owner_matches(owner: i32, target: &TargetApp, x: i32, y: i32) -> Result<(), String> {
    if owner == target.pid {
        Ok(())
    } else {
        Err(format!(
            "({x}, {y}) is not on a window of '{}', so it was not clicked.",
            target.name
        ))
    }
}

/// Refuses an element that another process owns, as a cached element id can
/// name any app the accessibility tree was ever read from.
pub fn ensure_element_in_target(
    automation: &AutomationService,
    target: &TargetApp,
    element_id: &str,
) -> Result<(), String> {
    if platform::element_pid(automation, element_id)? == target.pid {
        Ok(())
    } else {
        Err(format!(
            "Element {element_id} does not belong to '{}', so it was not used.",
            target.name
        ))
    }
}

fn running_apps() -> Result<Vec<TargetApp>, String> {
    platform::running_apps()
}

#[cfg(target_os = "macos")]
mod platform {
    use std::time::{Duration, Instant};

    use super::TargetApp;
    use crate::automation::mac::apps;
    use crate::automation::mac::service::MacAutomationService;
    use crate::automation::AutomationService;

    const FRONT_TIMEOUT: Duration = Duration::from_secs(3);
    const FRONT_POLL: Duration = Duration::from_millis(50);

    pub(super) fn running_apps() -> Result<Vec<TargetApp>, String> {
        apps::running_apps().map_err(|e| format!("Could not list running apps: {e}"))
    }

    pub(super) fn frontmost_app(automation: &AutomationService) -> Option<TargetApp> {
        apps::running_app(automation.native.frontmost_pid().ok()?)
    }

    pub(super) fn app_at_point(x: i32, y: i32) -> Option<TargetApp> {
        let accessibility = MacAutomationService::new().ok()?;
        apps::running_app(accessibility.pid_at_point(x as f32, y as f32).ok()?)
    }

    pub(super) fn app_with_keyboard_focus() -> Option<TargetApp> {
        let accessibility = MacAutomationService::new().ok()?;
        apps::running_app(accessibility.frontmost_pid().ok()?)
    }

    pub(super) async fn bring_to_front(
        automation: &AutomationService,
        target: &TargetApp,
    ) -> Result<(), String> {
        if automation.native.frontmost_pid().ok() == Some(target.pid) {
            return Ok(());
        }
        apps::activate(target.pid).map_err(|e| e.to_string())?;
        let deadline = Instant::now() + FRONT_TIMEOUT;
        loop {
            if automation.native.frontmost_pid().ok() == Some(target.pid) {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err(format!(
                    "'{}' did not come to the front within {} seconds, so nothing was clicked or typed.",
                    target.name,
                    FRONT_TIMEOUT.as_secs()
                ));
            }
            tokio::time::sleep(FRONT_POLL).await;
        }
    }

    pub(super) fn pid_at_point(
        automation: &AutomationService,
        x: i32,
        y: i32,
    ) -> Result<i32, String> {
        automation
            .native
            .pid_at_point(x as f32, y as f32)
            .map_err(|e| format!("Could not tell which app is at ({x}, {y}): {e}"))
    }

    pub(super) fn element_pid(
        automation: &AutomationService,
        element_id: &str,
    ) -> Result<i32, String> {
        automation
            .native
            .element_pid(element_id)
            .map_err(|e| e.to_string())
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::TargetApp;
    use crate::automation::AutomationService;

    const APP_TARGETING_UNSUPPORTED: &str =
        "Choosing which app to click or type into is available on macOS only.";
    const OTHER_PROCESS: i32 = -1;
    #[cfg(windows)]
    const NO_WINDOW_AT_POINT: &str = "No window was found at that point, so it was not used.";
    #[cfg(not(windows))]
    const POINT_OWNER_UNKNOWN: &str = "This platform cannot say which app owns a point on screen, so pointer steps are not sent here.";

    pub(super) fn running_apps() -> Result<Vec<TargetApp>, String> {
        Err(APP_TARGETING_UNSUPPORTED.to_string())
    }

    /// The process that owns the foreground window.
    #[cfg(windows)]
    #[allow(unsafe_code)]
    fn foreground_pid() -> Option<i32> {
        use windows::Win32::UI::WindowsAndMessaging::{
            GetForegroundWindow, GetWindowThreadProcessId,
        };

        let mut pid: u32 = 0;
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0 == 0 {
                return None;
            }
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
        }
        i32::try_from(pid).ok().filter(|pid| *pid > 0)
    }

    #[cfg(not(windows))]
    fn foreground_pid() -> Option<i32> {
        None
    }

    /// The process whose top-level window is drawn at a screen point: the
    /// window there, its root ancestor, and that window's process.
    #[cfg(windows)]
    #[allow(unsafe_code)]
    fn window_owner_at(x: i32, y: i32) -> Result<i32, String> {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetAncestor, GetWindowThreadProcessId, WindowFromPoint, GA_ROOT,
        };

        let mut pid: u32 = 0;
        unsafe {
            let hwnd = WindowFromPoint(POINT { x, y });
            if hwnd.0 == 0 {
                return Err(NO_WINDOW_AT_POINT.to_string());
            }
            let root = GetAncestor(hwnd, GA_ROOT);
            let top_level = if root.0 == 0 { hwnd } else { root };
            GetWindowThreadProcessId(top_level, Some(&mut pid));
        }
        i32::try_from(pid)
            .ok()
            .filter(|pid| *pid > 0)
            .ok_or_else(|| NO_WINDOW_AT_POINT.to_string())
    }

    /// The app in front, by the process that owns the foreground window where
    /// the platform exposes one, and otherwise by executable name alone, with
    /// this process recognised by its own.
    pub(super) fn frontmost_app(_automation: &AutomationService) -> Option<TargetApp> {
        let foreground = foreground_pid();
        let window = crate::automation::computer_use::WindowCoordinator::get_active_window()?;
        let own_executable = std::env::current_exe().ok().and_then(|path| {
            path.file_name()
                .map(|name| name.to_string_lossy().to_lowercase())
        });
        let is_this_app = own_executable.is_some()
            && window.bundle_id.as_deref().map(str::to_lowercase) == own_executable;
        Some(TargetApp {
            pid: if is_this_app {
                i32::try_from(std::process::id()).unwrap_or(OTHER_PROCESS)
            } else {
                foreground.unwrap_or(OTHER_PROCESS)
            },
            name: window.app_name,
            bundle_id: window.bundle_id,
        })
    }

    pub(super) fn app_at_point(_x: i32, _y: i32) -> Option<TargetApp> {
        None
    }

    pub(super) fn app_with_keyboard_focus() -> Option<TargetApp> {
        None
    }

    pub(super) async fn bring_to_front(
        _automation: &AutomationService,
        _target: &TargetApp,
    ) -> Result<(), String> {
        Err(APP_TARGETING_UNSUPPORTED.to_string())
    }

    #[cfg(windows)]
    pub(super) fn pid_at_point(
        _automation: &AutomationService,
        x: i32,
        y: i32,
    ) -> Result<i32, String> {
        window_owner_at(x, y)
    }

    /// X11 can answer this, Wayland cannot, and a session does not say which
    /// answer to trust, so the owner of a point is left unknown here.
    #[cfg(not(windows))]
    pub(super) fn pid_at_point(
        _automation: &AutomationService,
        _x: i32,
        _y: i32,
    ) -> Result<i32, String> {
        Err(POINT_OWNER_UNKNOWN.to_string())
    }

    pub(super) fn element_pid(
        _automation: &AutomationService,
        _element_id: &str,
    ) -> Result<i32, String> {
        Err(APP_TARGETING_UNSUPPORTED.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(pid: i32, name: &str, bundle_id: &str) -> TargetApp {
        TargetApp {
            pid,
            name: name.to_string(),
            bundle_id: Some(bundle_id.to_string()),
        }
    }

    fn running() -> Vec<TargetApp> {
        vec![
            app(10, "Notes", "com.apple.Notes"),
            app(11, "Mail", "com.apple.mail"),
            app(12, "Code", "com.microsoft.VSCode"),
            app(13, "Code", "com.todesktop.cursor"),
        ]
    }

    #[test]
    fn an_app_resolves_by_bundle_id_or_its_exact_name() {
        assert_eq!(
            match_target_app(&running(), "com.apple.mail").unwrap().pid,
            11
        );
        assert_eq!(match_target_app(&running(), " notes ").unwrap().pid, 10);
        assert_eq!(match_target_app(&running(), "Notes.app").unwrap().pid, 10);
        assert_eq!(
            match_target_app(&running(), "COM.MICROSOFT.VSCODE")
                .unwrap()
                .pid,
            12
        );
    }

    /// A near match could aim the input at an app the user never named, so a
    /// partial name is refused with the names that would have worked.
    #[test]
    fn a_partial_or_unknown_name_is_refused_with_what_is_running() {
        let error = match_target_app(&running(), "Note").unwrap_err();
        assert!(error.contains("No running app is called 'Note'"));
        assert!(error.contains("Notes"));
        assert!(match_target_app(&running(), "").is_err());
        assert!(match_target_app(&running(), ".app").is_err());
    }

    #[test]
    fn two_apps_with_one_name_must_be_told_apart_by_bundle_id() {
        let error = match_target_app(&running(), "code").unwrap_err();
        assert!(error.contains("com.microsoft.VSCode"));
        assert!(error.contains("com.todesktop.cursor"));
    }

    /// A recorded step stores this, and replay resolves it straight back.
    #[test]
    fn a_recorded_identifier_resolves_to_the_same_app() {
        for recorded in running() {
            assert_eq!(
                match_target_app(&running(), &recorded.identifier()),
                Ok(recorded.clone())
            );
        }
        let unbundled = TargetApp {
            pid: 20,
            name: "Helper".to_string(),
            bundle_id: None,
        };
        assert_eq!(unbundled.identifier(), "Helper");
    }

    /// The run loop's case: Notes is allowed and in front, and the planned
    /// point lands on a visible Terminal window or on this app's own.
    #[test]
    fn a_run_step_aimed_at_another_apps_window_is_refused() {
        let notes = app(10, "Notes", "com.apple.Notes");
        let terminal_pid = 11;
        let own_pid = 12;
        assert!(point_owner_matches(notes.pid, &notes, 400, 300).is_ok());
        assert!(point_owner_matches(terminal_pid, &notes, 400, 300).is_err());
        assert!(point_owner_matches(own_pid, &notes, 400, 300).is_err());
    }

    /// A hit-test that cannot say who owns the point is a refusal: a click
    /// never goes ahead on the strength of "unknown".
    #[test]
    fn a_point_whose_owner_is_unknown_is_not_clicked() {
        let notes = app(10, "Notes", "com.apple.Notes");
        let unknown = Err("Could not tell which app is at (5, 5)".to_string());
        assert!(judge_point_owner(unknown, &notes, 5, 5).is_err());
        assert!(judge_point_owner(Ok(10), &notes, 5, 5).is_ok());
        assert!(judge_point_owner(Ok(11), &notes, 5, 5).is_err());
    }

    /// The plan was made on Notes. Mail taking focus is a different app even
    /// though Mail is allowed too; a relaunched Notes is a different process.
    #[test]
    fn only_the_app_a_plan_was_made_for_counts_as_the_same_app() {
        let notes = app(10, "Notes", "com.apple.Notes");
        assert!(same_app(&notes, &notes.clone()));
        assert!(!same_app(&notes, &app(11, "Mail", "com.apple.mail")));
        assert!(!same_app(&notes, &app(42, "Notes", "com.apple.Notes")));

        let unnamed_process = |name: &str| TargetApp {
            pid: -1,
            name: name.to_string(),
            bundle_id: None,
        };
        assert!(same_app(
            &unnamed_process("gedit"),
            &unnamed_process("gedit")
        ));
        assert!(!same_app(
            &unnamed_process("gedit"),
            &unnamed_process("xterm")
        ));
        let by_executable = |exe: &str| TargetApp {
            pid: -1,
            name: "Window".to_string(),
            bundle_id: Some(exe.to_string()),
        };
        assert!(!same_app(
            &by_executable("notepad.exe"),
            &by_executable("cmd.exe")
        ));
    }

    #[test]
    fn a_point_owned_by_another_process_is_not_clicked() {
        let target = app(10, "Notes", "com.apple.Notes");
        assert!(point_owner_matches(10, &target, 5, 5).is_ok());
        let refusal = point_owner_matches(11, &target, 5, 5).unwrap_err();
        assert!(refusal.contains("not on a window of 'Notes'"));
    }
}
