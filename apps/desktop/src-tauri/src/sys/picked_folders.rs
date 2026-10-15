//! Folders the person chose in the native folder picker during this run.
//!
//! A command that grants a folder cannot take the page's word for which
//! folder was chosen: the page renders model output and can call any command
//! with any path. Rust opens the picker itself, remembers what it returned,
//! and a granting command accepts a path only when it is already granted or
//! is one remembered here.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// How long a picked folder may still be granted. Settings are saved some
/// time after the folder is picked, so this is longer than one click.
const REMEMBERED_FOR: Duration = Duration::from_secs(60 * 60);
const REMEMBERED_AT_MOST: usize = 64;

struct Picked {
    folders: Vec<(PathBuf, Instant)>,
}

impl Picked {
    const fn new() -> Self {
        Self {
            folders: Vec::new(),
        }
    }

    fn forget_old(&mut self, now: Instant) {
        self.folders
            .retain(|(_, at)| now.saturating_duration_since(*at) < REMEMBERED_FOR);
    }

    fn remember(&mut self, folder: PathBuf, now: Instant) {
        self.forget_old(now);
        self.folders.retain(|(held, _)| *held != folder);
        if self.folders.len() >= REMEMBERED_AT_MOST {
            self.folders.remove(0);
        }
        self.folders.push((folder, now));
    }

    fn holds(&mut self, folder: &Path, now: Instant) -> bool {
        self.forget_old(now);
        self.folders.iter().any(|(held, _)| held == folder)
    }

    fn forget(&mut self, folder: &Path) {
        self.folders.retain(|(held, _)| held != folder);
    }
}

static PICKED: Mutex<Picked> = Mutex::new(Picked::new());

fn picked() -> std::sync::MutexGuard<'static, Picked> {
    PICKED
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// What the folder is picked for, which decides the picker's title. The
/// title is Rust's own text, never the page's.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PickPurpose {
    AllowedFolder,
    ProjectFolder,
}

impl PickPurpose {
    fn title(self) -> &'static str {
        match self {
            Self::AllowedFolder => "Choose a folder the agent may use",
            Self::ProjectFolder => "Choose the project folder",
        }
    }
}

/// `folder` resolved through its links, by the rule a chosen folder is
/// stored under ([`agiworkforce_sandbox_policy::host_path::resolve_chosen_root`]).
fn resolved(folder: &Path) -> Result<PathBuf, String> {
    if cfg!(windows) {
        Ok(folder.to_path_buf())
    } else {
        agiworkforce_sandbox_policy::host_path::resolve_chosen_root(folder)
    }
}

/// The folder as it is stored and granted: resolved through its links once,
/// here, so that nothing on its way is consulted again.
fn as_granted(selected: &Path) -> Result<String, String> {
    resolved(selected)?
        .into_os_string()
        .into_string()
        .map_err(|_| {
            "This folder's path is not valid Unicode, so it cannot be granted.".to_string()
        })
}

/// Whether `path` still resolves to itself. A picked folder is remembered in
/// its resolved form, so a path that resolves anywhere else now is one a
/// link was put into after the pick.
fn resolves_to_itself(path: &str) -> bool {
    resolved(Path::new(path)).is_ok_and(|now| now == Path::new(path))
}

/// Opens the native folder picker and remembers the folder the person
/// chose. `None` when they closed the picker without choosing.
pub async fn pick<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    purpose: PickPurpose,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let dialog_app = app.clone();
    let selected = tokio::task::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .set_title(purpose.title())
            .blocking_pick_folder()
    })
    .await
    .map_err(|error| format!("The folder picker failed: {error}"))?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let selected = selected
        .into_path()
        .map_err(|error| format!("The selected folder path is unavailable: {error}"))?;
    let folder = as_granted(&selected)?;
    picked().remember(PathBuf::from(&folder), Instant::now());
    Ok(Some(folder))
}

/// Whether `path` is exactly a folder [`pick`] returned in this run and not
/// long ago, and still is that folder: it is resolved again here and must
/// come out as the path that was remembered. A folder inside a picked one
/// was not picked.
pub fn was_picked(path: &str) -> bool {
    was_picked_with(&mut picked(), path, Instant::now(), &resolves_to_itself)
}

fn was_picked_with(
    picked: &mut Picked,
    path: &str,
    now: Instant,
    resolves_to_itself: &dyn Fn(&str) -> bool,
) -> bool {
    picked.holds(Path::new(path), now) && resolves_to_itself(path)
}

/// Forgets that `path` was picked. A granting command calls this for a
/// folder the person takes away again, so that removing a grant is not
/// undone by naming the folder once more while the pick is still remembered.
pub fn forget(path: &str) {
    picked().forget(Path::new(path));
}

/// `Err` naming the first of `paths` that is neither in `already_granted`
/// nor a folder the person picked. A granted folder is matched as it is
/// stored, which is its resolved form and is never resolved again; a picked
/// one is resolved again and must still be the folder that was picked.
pub fn require_granted_or_picked(
    already_granted: &[String],
    paths: &[String],
) -> Result<(), String> {
    require_with(already_granted, paths, &was_picked)
}

fn require_with(
    already_granted: &[String],
    paths: &[String],
    was_picked: &dyn Fn(&str) -> bool,
) -> Result<(), String> {
    match paths
        .iter()
        .find(|path| !already_granted.contains(*path) && !was_picked(path.as_str()))
    {
        None => Ok(()),
        Some(path) => Err(format!(
            "{} was not chosen in the folder picker, so it was not granted. Choose it there to grant it.",
            crate::sys::native_confirm::shown_value(path)
        )),
    }
}

/// Opens the native folder picker for the page. The page gets the chosen
/// folder back to show it; what makes the folder grantable is that Rust
/// remembers having returned it.
#[tauri::command]
pub async fn pick_folder(
    app: tauri::AppHandle,
    purpose: PickPurpose,
) -> Result<Option<String>, String> {
    pick(&app, purpose).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_folder_is_held_only_as_picked_and_only_for_a_while() {
        let start = Instant::now();
        let mut picked = Picked::new();
        picked.remember(PathBuf::from("/picked/project"), start);

        assert!(picked.holds(Path::new("/picked/project"), start));
        assert!(
            !picked.holds(Path::new("/picked/project/inner"), start),
            "a folder inside a picked one was not picked"
        );
        assert!(
            !picked.holds(Path::new("/picked"), start),
            "nor was the folder above it"
        );
        assert!(picked.holds(
            Path::new("/picked/project"),
            start + REMEMBERED_FOR - Duration::from_secs(1)
        ));
        assert!(!picked.holds(Path::new("/picked/project"), start + REMEMBERED_FOR));
    }

    #[test]
    fn a_folder_taken_away_again_has_to_be_picked_again() {
        let start = Instant::now();
        let mut picked = Picked::new();
        picked.remember(PathBuf::from("/picked/one"), start);
        picked.remember(PathBuf::from("/picked/two"), start);

        picked.forget(Path::new("/picked/one"));

        assert!(!picked.holds(Path::new("/picked/one"), start));
        assert!(picked.holds(Path::new("/picked/two"), start));
    }

    #[test]
    fn picking_again_renews_a_folder_and_the_oldest_gives_way_when_full() {
        let start = Instant::now();
        let mut picked = Picked::new();
        picked.remember(PathBuf::from("/first"), start);
        for index in 0..REMEMBERED_AT_MOST - 1 {
            picked.remember(PathBuf::from(format!("/other-{index}")), start);
        }
        let later = start + Duration::from_secs(60);
        picked.remember(PathBuf::from("/first"), later);
        picked.remember(PathBuf::from("/one-more"), later);

        assert_eq!(picked.folders.len(), REMEMBERED_AT_MOST);
        assert!(picked.holds(Path::new("/first"), later));
        assert!(picked.holds(Path::new("/one-more"), later));
        assert!(
            !picked.holds(Path::new("/other-0"), later),
            "the oldest pick gives way"
        );
    }

    #[test]
    fn a_path_the_page_names_is_refused_unless_granted_or_picked() {
        let granted = vec!["/granted/already".to_string()];
        let picked = |path: &str| path == "/picked/now";

        assert!(require_with(&granted, &granted, &picked).is_ok());
        assert!(require_with(
            &granted,
            &["/granted/already".to_string(), "/picked/now".to_string()],
            &picked
        )
        .is_ok());
        let refused = require_with(
            &granted,
            &["/picked/now".to_string(), "/Users/someone/.ssh".to_string()],
            &picked,
        )
        .expect_err("a folder nobody picked");
        assert!(refused.contains("/Users/someone/.ssh"), "{refused}");
        assert!(
            refused.contains("was not chosen in the folder picker"),
            "{refused}"
        );
        assert!(
            require_with(&granted, &["/granted/already/".to_string()], &picked).is_err(),
            "a granted folder is matched as it is stored"
        );
    }

    #[test]
    fn a_picked_folder_that_no_longer_resolves_to_itself_is_not_the_one_picked() {
        let now = Instant::now();
        let mut picked = Picked::new();
        picked.remember(PathBuf::from("/picked/project"), now);

        assert!(was_picked_with(
            &mut picked,
            "/picked/project",
            now,
            &|_| true
        ));
        assert!(
            !was_picked_with(&mut picked, "/picked/project", now, &|_| false),
            "a link put in its place since the pick leads somewhere else"
        );
        assert!(!was_picked_with(&mut picked, "/never/picked", now, &|_| {
            true
        }));
    }

    #[cfg(unix)]
    #[test]
    fn a_real_folder_resolves_to_itself_and_a_link_to_it_does_not() {
        let exe = std::env::current_exe().unwrap().canonicalize().unwrap();
        let tree = exe
            .parent()
            .unwrap()
            .join(format!("agi-picked-folder-{}", uuid::Uuid::new_v4()));
        if agiworkforce_sandbox_policy::host_path::inside_any(
            &tree,
            &agiworkforce_sandbox_policy::host_path::untrusted_roots(&[]),
        ) {
            return;
        }
        let real = tree.join("real");
        let link = tree.join("link");
        std::fs::create_dir_all(&real).unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();

        let granted = as_granted(&link).unwrap();
        assert_eq!(granted, real.to_string_lossy());
        assert!(resolves_to_itself(&granted));
        assert!(!resolves_to_itself(&link.to_string_lossy()));
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[test]
    fn the_purpose_arrives_from_the_page_in_snake_case() {
        assert_eq!(
            serde_json::from_str::<PickPurpose>("\"allowed_folder\"").unwrap(),
            PickPurpose::AllowedFolder
        );
        assert_eq!(
            serde_json::from_str::<PickPurpose>("\"project_folder\"").unwrap(),
            PickPurpose::ProjectFolder
        );
        assert!(serde_json::from_str::<PickPurpose>("\"anything\"").is_err());
    }
}
