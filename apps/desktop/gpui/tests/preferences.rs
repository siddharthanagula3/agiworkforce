use std::ffi::OsString;
use std::fs;
use std::path::PathBuf;

use agiworkforce_desktop_gpui::preferences::{
    data_directory, normalize_accelerator, Appearance, Platform, Preferences, FILE_NAME,
};

#[path = "support/host_path.rs"]
mod host_path;
use host_path::host_absolute;

fn env<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<OsString> + 'a {
    move |name| {
        pairs
            .iter()
            .find(|(key, _)| *key == name)
            .map(|(_, value)| OsString::from(value))
    }
}

fn changed() -> Preferences {
    Preferences {
        appearance: Appearance::Dark,
        notify_when_work_finishes: false,
        notify_when_approval_needed: false,
        keep_awake_while_working: false,
        launch_at_login: true,
        show_in_menu_bar: false,
        quick_ask_shortcut: Some("cmd+shift+space".into()),
        check_for_updates: false,
    }
}

#[test]
fn missing_file_loads_defaults() {
    let directory = tempfile::tempdir().unwrap();
    let loaded = Preferences::load_from(&directory.path().join(FILE_NAME)).unwrap();
    assert_eq!(loaded, Preferences::default());
}

#[test]
fn saved_preferences_round_trip_through_nested_folders() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("nested").join("app").join(FILE_NAME);
    changed().save_to(&path).unwrap();
    assert_eq!(Preferences::load_from(&path).unwrap(), changed());
    let names: Vec<_> = fs::read_dir(path.parent().unwrap())
        .unwrap()
        .map(|entry| entry.unwrap().file_name())
        .collect();
    assert_eq!(names, vec![OsString::from(FILE_NAME)]);
}

#[test]
fn saving_replaces_the_previous_file() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join(FILE_NAME);
    changed().save_to(&path).unwrap();
    Preferences::default().save_to(&path).unwrap();
    assert_eq!(
        Preferences::load_from(&path).unwrap(),
        Preferences::default()
    );
}

#[test]
fn partial_files_fill_missing_fields_with_defaults() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join(FILE_NAME);
    fs::write(&path, r#"{"appearance":"light","launchAtLogin":true}"#).unwrap();
    let loaded = Preferences::load_from(&path).unwrap();
    assert_eq!(loaded.appearance, Appearance::Light);
    assert!(loaded.launch_at_login);
    assert!(loaded.notify_when_work_finishes);
    assert!(loaded.show_in_menu_bar);
}

#[test]
fn corrupt_file_reports_an_error_and_is_kept() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join(FILE_NAME);
    fs::write(&path, "{not json").unwrap();
    let error = Preferences::load_from(&path).unwrap_err().to_string();
    assert!(error.contains("unreadable"), "{error}");
    assert!(error.contains("Defaults are in use"), "{error}");
    let kept = directory.path().join(format!("{FILE_NAME}.invalid"));
    assert!(error.contains(&kept.display().to_string()), "{error}");
    assert_eq!(fs::read_to_string(kept).unwrap(), "{not json");
    assert_eq!(fs::read_to_string(&path).unwrap(), "{not json");
}

#[test]
fn unknown_appearance_is_treated_as_corrupt() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join(FILE_NAME);
    fs::write(&path, r#"{"appearance":"sepia"}"#).unwrap();
    assert!(Preferences::load_from(&path).is_err());
}

#[test]
fn invalid_stored_shortcut_is_treated_as_corrupt() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join(FILE_NAME);
    fs::write(&path, r#"{"quickAskShortcut":"banana"}"#).unwrap();
    let error = Preferences::load_from(&path).unwrap_err().to_string();
    assert!(error.contains("quick-ask shortcut"), "{error}");
}

#[test]
fn blank_stored_shortcut_loads_as_turned_off() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join(FILE_NAME);
    fs::write(&path, r#"{"quickAskShortcut":"  "}"#).unwrap();
    assert_eq!(
        Preferences::load_from(&path).unwrap().quick_ask_shortcut,
        Some(String::new())
    );
}

#[test]
fn saving_an_invalid_shortcut_is_refused_without_touching_the_file() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join(FILE_NAME);
    changed().save_to(&path).unwrap();
    let invalid = Preferences {
        quick_ask_shortcut: Some("space".into()),
        ..Preferences::default()
    };
    assert!(invalid.save_to(&path).is_err());
    assert_eq!(Preferences::load_from(&path).unwrap(), changed());
}

#[test]
fn unwritable_location_reports_the_path() {
    let directory = tempfile::tempdir().unwrap();
    let blocker = directory.path().join("blocker");
    fs::write(&blocker, "file").unwrap();
    let error = changed()
        .save_to(&blocker.join(FILE_NAME))
        .unwrap_err()
        .to_string();
    assert!(error.contains("blocker"), "{error}");
}

#[test]
fn accelerators_are_normalized_and_validated() {
    assert_eq!(normalize_accelerator("").unwrap(), None);
    assert_eq!(normalize_accelerator("   ").unwrap(), None);
    assert_eq!(
        normalize_accelerator(" cmd + shift + space ").unwrap(),
        Some("cmd+shift+space".into())
    );
    assert_eq!(
        normalize_accelerator("ctrl+alt+k").unwrap(),
        Some("ctrl+alt+k".into())
    );
    for invalid in [
        "space",
        "cmd",
        "cmd+",
        "+space",
        "cmd+shift",
        "cmd+nonsense",
        "cmd+a+b",
        "cmd++a",
    ] {
        assert!(
            normalize_accelerator(invalid).is_err(),
            "{invalid:?} should be rejected"
        );
    }
}

#[test]
fn data_directory_follows_each_platform_convention() {
    let home = host_absolute("/Users/a");
    assert_eq!(
        data_directory(Platform::MacOs, "Desk", env(&[("HOME", &home)])).unwrap(),
        PathBuf::from(&home)
            .join("Library")
            .join("Application Support")
            .join("Desk")
    );
    let appdata = if cfg!(windows) {
        "C:\\Users\\a\\AppData\\Roaming"
    } else {
        "/appdata"
    };
    assert_eq!(
        data_directory(Platform::Windows, "Desk", env(&[("APPDATA", appdata)])).unwrap(),
        PathBuf::from(appdata).join("Desk")
    );
    let xdg = host_absolute("/xdg");
    let linux_home = host_absolute("/home/a");
    assert_eq!(
        data_directory(
            Platform::Linux,
            "Desk",
            env(&[("XDG_CONFIG_HOME", &xdg), ("HOME", &linux_home)])
        )
        .unwrap(),
        PathBuf::from(&xdg).join("Desk")
    );
    assert_eq!(
        data_directory(Platform::Linux, "Desk", env(&[("HOME", &linux_home)])).unwrap(),
        PathBuf::from(&linux_home).join(".config").join("Desk")
    );
}

#[test]
fn data_directory_rejects_missing_relative_and_unsafe_inputs() {
    assert!(data_directory(Platform::MacOs, "Desk", env(&[])).is_err());
    assert!(data_directory(Platform::MacOs, "Desk", env(&[("HOME", "relative")])).is_err());
    assert!(data_directory(
        Platform::Linux,
        "Desk",
        env(&[("XDG_CONFIG_HOME", "relative"), ("HOME", "also/relative")])
    )
    .is_err());
    let home = host_absolute("/Users/a");
    for name in ["", "  ", "..", "a/b", "a\\b"] {
        assert!(
            data_directory(Platform::MacOs, name, env(&[("HOME", &home)])).is_err(),
            "{name:?} should be rejected"
        );
    }
}

#[test]
fn default_location_uses_the_desktop_name() {
    if let Ok(path) = Preferences::path() {
        assert!(path.ends_with(FILE_NAME));
        let name = agiworkforce_desktop_gpui::config::NativeContracts::load()
            .unwrap()
            .desktop_name;
        assert_eq!(path.parent().unwrap().file_name().unwrap(), name.as_str());
    }
}
