//! Where a run begins. The user starts a run from this app, so this app is in
//! front at the first iteration, and again whenever a confirmation hands focus
//! back. The run neither captures this app's own window nor gives up: it moves
//! to the app it is meant to work in first, and only then looks at the screen.

use async_trait::async_trait;

use super::app_permissions::{AppPermissionManager, PermissionStatus};
use super::target_app::TargetApp;

pub const NOTHING_TO_START_IN: &str = "No app is open that this task could use. Open the app you want AGI Desktop to work in, allow it in Settings > Capabilities > Computer use, then start the task again.";
const NO_APP_CHOSEN: &str = "The task did not name an app, and no open app could be chosen for it. Name the app in the task, then start it again.";

/// What the app in front means for the next capture.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FrontAppState {
    /// An app the run may look at and act in.
    Allowed,
    /// This app's own window: never captured, and not a reason to stop.
    OwnApp,
    /// An app the run may not touch; the reason is what the user reads.
    Refused(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StartCandidate {
    pub app: TargetApp,
    pub approved: bool,
}

/// The running apps a run could start in: approved ones, and ones the user
/// has not ruled on. This app, denied apps and the refuse-list are left out,
/// so the model is never offered a name it could not be given.
pub async fn classify_start_apps(
    permissions: &AppPermissionManager,
    running: Vec<TargetApp>,
    is_own_app: impl Fn(&TargetApp) -> bool,
) -> Vec<StartCandidate> {
    let mut candidates = Vec::new();
    for app in running {
        if is_own_app(&app) {
            continue;
        }
        let approved = match permissions
            .decide(&app.name, app.bundle_id.as_deref())
            .await
        {
            PermissionStatus::Allowed => true,
            PermissionStatus::AskEveryTime => false,
            PermissionStatus::Denied => continue,
        };
        candidates.push(StartCandidate { app, approved });
    }
    candidates.sort_by(|a, b| {
        b.approved
            .cmp(&a.approved)
            .then_with(|| a.app.name.cmp(&b.app.name))
    });
    candidates.dedup_by(|a, b| a.app.name.eq_ignore_ascii_case(&b.app.name));
    candidates
}

/// The first planning step, taken without a screenshot: the model is given
/// the task and app names only, and may answer with one of those names.
pub fn start_app_prompt(task: &str, candidates: &[StartCandidate]) -> String {
    let apps = candidates
        .iter()
        .map(|candidate| {
            if candidate.approved {
                format!("- {} (already allowed)", candidate.app.name)
            } else {
                format!("- {}", candidate.app.name)
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "You are starting a computer task for the user. No screenshot is available yet: first choose the app to work in.\n\nTASK: {task}\n\nOpen apps you may choose, by name:\n{apps}\n\nAnswer with JSON only: {{\"app\": \"<one name from the list, exactly as written>\"}}"
    )
}

/// Accepts only a name that was offered. Anything else is no choice at all.
pub fn parse_start_choice(
    response: &str,
    candidates: &[StartCandidate],
) -> Result<StartCandidate, String> {
    let named = response
        .find('{')
        .zip(response.rfind('}'))
        .filter(|(start, end)| start < end)
        .and_then(|(start, end)| {
            serde_json::from_str::<serde_json::Value>(&response[start..=end]).ok()
        })
        .and_then(|value| {
            value
                .get("app")
                .and_then(|app| app.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| response.to_string());
    let named = named.trim();
    candidates
        .iter()
        .find(|candidate| candidate.app.name.eq_ignore_ascii_case(named))
        .cloned()
        .ok_or_else(|| NO_APP_CHOSEN.to_string())
}

/// What settling the front app needs from the desktop and the model, so the
/// order of those steps can be tested without either.
#[async_trait]
pub trait StartSurface: Sync {
    async fn front(&self) -> FrontAppState;
    fn resolve(&self, name: &str) -> Result<TargetApp, String>;
    async fn candidates(&self) -> Result<Vec<StartCandidate>, String>;
    async fn choose(&self, prompt: &str) -> Result<String, String>;
    async fn authorize(&self, app: &TargetApp) -> Result<(), String>;
    async fn activate(&self, app: &TargetApp) -> Result<(), String>;
}

/// Returns `Ok` only once an app the run may use is in front, which is the
/// caller's licence to capture. With this app in front it moves to the task's
/// named app, or to one the model picks from names alone, and that app passes
/// the per-app gate before it is brought forward. Every other outcome is an
/// `Err` the user reads, and nothing has been captured.
pub async fn settle_front_app<S: StartSurface + ?Sized>(
    surface: &S,
    task: &str,
    target: Option<&str>,
) -> Result<(), String> {
    match surface.front().await {
        FrontAppState::Allowed => return Ok(()),
        FrontAppState::Refused(reason) => return Err(reason),
        FrontAppState::OwnApp => {}
    }

    let app = match target.map(str::trim).filter(|name| !name.is_empty()) {
        Some(name) => surface.resolve(name)?,
        None => {
            let candidates = surface.candidates().await?;
            if candidates.is_empty() {
                return Err(NOTHING_TO_START_IN.to_string());
            }
            let answer = surface.choose(&start_app_prompt(task, &candidates)).await?;
            parse_start_choice(&answer, &candidates)?.app
        }
    };

    surface.authorize(&app).await?;
    surface.activate(&app).await?;

    match surface.front().await {
        FrontAppState::Allowed => Ok(()),
        FrontAppState::Refused(reason) => Err(reason),
        FrontAppState::OwnApp => Err(format!(
            "'{}' did not come to the front, so nothing was captured.",
            app.name
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn app(pid: i32, name: &str, bundle_id: &str) -> TargetApp {
        TargetApp {
            pid,
            name: name.to_string(),
            bundle_id: Some(bundle_id.to_string()),
        }
    }

    /// A desktop that starts with this app in front and puts whatever is
    /// activated in front afterwards, recording the order things happen in.
    struct ScriptedDesktop {
        running: Vec<StartCandidate>,
        allowed: Vec<&'static str>,
        answer: &'static str,
        front: Mutex<Option<TargetApp>>,
        events: Mutex<Vec<String>>,
    }

    impl ScriptedDesktop {
        fn new(running: Vec<StartCandidate>, allowed: Vec<&'static str>) -> Self {
            Self {
                running,
                allowed,
                answer: "",
                front: Mutex::new(None),
                events: Mutex::new(Vec::new()),
            }
        }

        fn note(&self, event: impl Into<String>) {
            self.events.lock().unwrap().push(event.into());
        }

        fn events(&self) -> Vec<String> {
            self.events.lock().unwrap().clone()
        }
    }

    #[async_trait]
    impl StartSurface for ScriptedDesktop {
        async fn front(&self) -> FrontAppState {
            let front = self.front.lock().unwrap().clone();
            match front {
                None => {
                    self.note("front:own");
                    FrontAppState::OwnApp
                }
                Some(app) => {
                    self.note(format!("front:{}", app.name));
                    FrontAppState::Allowed
                }
            }
        }

        fn resolve(&self, name: &str) -> Result<TargetApp, String> {
            self.note(format!("resolve:{name}"));
            self.running
                .iter()
                .find(|candidate| candidate.app.name == name)
                .map(|candidate| candidate.app.clone())
                .ok_or_else(|| format!("No running app is called '{name}'."))
        }

        async fn candidates(&self) -> Result<Vec<StartCandidate>, String> {
            self.note("candidates");
            Ok(self.running.clone())
        }

        async fn choose(&self, _prompt: &str) -> Result<String, String> {
            self.note("choose");
            Ok(self.answer.to_string())
        }

        async fn authorize(&self, app: &TargetApp) -> Result<(), String> {
            self.note(format!("authorize:{}", app.name));
            if self.allowed.contains(&app.name.as_str()) {
                Ok(())
            } else {
                Err(format!(
                    "'{}' has not been approved for automation yet.",
                    app.name
                ))
            }
        }

        async fn activate(&self, app: &TargetApp) -> Result<(), String> {
            self.note(format!("activate:{}", app.name));
            *self.front.lock().unwrap() = Some(app.clone());
            Ok(())
        }
    }

    fn notes() -> StartCandidate {
        StartCandidate {
            app: app(10, "Notes", "com.apple.Notes"),
            approved: true,
        }
    }

    /// The caller captures only after `Ok`. With this app in front and a named
    /// target, `Ok` comes only after the target was authorized, activated and
    /// seen in front.
    #[tokio::test]
    async fn a_run_started_from_this_app_moves_to_its_named_target_before_any_capture() {
        let desktop = ScriptedDesktop::new(vec![notes()], vec!["Notes"]);

        let settled = settle_front_app(&desktop, "write a note", Some("Notes")).await;

        assert_eq!(settled, Ok(()));
        assert_eq!(
            desktop.events(),
            [
                "front:own",
                "resolve:Notes",
                "authorize:Notes",
                "activate:Notes",
                "front:Notes"
            ]
        );
    }

    #[tokio::test]
    async fn an_unapproved_target_is_never_brought_forward() {
        let desktop = ScriptedDesktop::new(vec![notes()], vec![]);

        let settled = settle_front_app(&desktop, "write a note", Some("Notes")).await;

        assert!(settled.unwrap_err().contains("Notes"));
        assert!(!desktop
            .events()
            .iter()
            .any(|event| event.starts_with("activate")));
    }

    /// With no target the first step is planned from names alone, and the
    /// model's pick is still authorized before it is activated.
    #[tokio::test]
    async fn a_run_with_no_target_picks_an_app_by_name_without_a_screenshot() {
        let mut desktop = ScriptedDesktop::new(vec![notes()], vec!["Notes"]);
        desktop.answer = r#"{"app": "Notes"}"#;

        assert_eq!(
            settle_front_app(&desktop, "write a note", None).await,
            Ok(())
        );
        assert_eq!(
            desktop.events(),
            [
                "front:own",
                "candidates",
                "choose",
                "authorize:Notes",
                "activate:Notes",
                "front:Notes"
            ]
        );
    }

    #[tokio::test]
    async fn a_run_with_no_target_and_nothing_approvable_ends_with_a_clear_message() {
        let desktop = ScriptedDesktop::new(vec![], vec![]);

        let settled = settle_front_app(&desktop, "write a note", None).await;

        assert_eq!(settled, Err(NOTHING_TO_START_IN.to_string()));
        assert_eq!(desktop.events(), ["front:own", "candidates"]);
    }

    #[test]
    fn only_a_name_that_was_offered_counts_as_a_choice() {
        let offered = [notes()];
        assert_eq!(
            parse_start_choice(r#"Sure: {"app": "notes"}"#, &offered),
            Ok(notes())
        );
        assert!(parse_start_choice(r#"{"app": "Terminal"}"#, &offered).is_err());
        assert!(parse_start_choice("I cannot decide", &offered).is_err());
    }

    /// The model is offered names it could actually be given: not this app,
    /// not a denied app, not the refuse-list.
    #[tokio::test]
    async fn the_offered_apps_leave_out_this_app_and_everything_refused() {
        let permissions = AppPermissionManager::new();
        permissions
            .set_permission_with_bundle("Notes", Some("com.apple.Notes"), PermissionStatus::Allowed)
            .await;
        permissions
            .set_permission_with_bundle("Mail", Some("com.apple.mail"), PermissionStatus::Denied)
            .await;
        let running = vec![
            app(1, "AGI Workforce", "com.agiworkforce.test"),
            app(2, "Safari", "com.apple.Safari"),
            app(3, "Notes", "com.apple.Notes"),
            app(4, "Mail", "com.apple.mail"),
            app(5, "Terminal", "com.apple.Terminal"),
            app(6, "Robinhood", "com.robinhood.app"),
        ];

        let offered = classify_start_apps(&permissions, running, |app| app.pid == 1).await;

        let names: Vec<(&str, bool)> = offered
            .iter()
            .map(|candidate| (candidate.app.name.as_str(), candidate.approved))
            .collect();
        assert_eq!(names, [("Notes", true), ("Safari", false)]);
        let prompt = start_app_prompt("write a note", &offered);
        assert!(prompt.contains("- Notes (already allowed)"));
        assert!(!prompt.contains("Terminal"));
    }
}
