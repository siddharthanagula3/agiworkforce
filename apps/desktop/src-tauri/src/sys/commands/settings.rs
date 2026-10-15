use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{Manager, State};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LLMConfig {
    pub default_provider: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub default_models: DefaultModels,
    #[serde(default)]
    pub task_routing: Option<serde_json::Value>,
    #[serde(default = "default_provider_mode")]
    pub provider_mode: String,
    #[serde(default = "default_ollama_url")]
    pub ollama_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lmstudio_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub llamacpp_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vllm_url: Option<String>,
}

fn default_provider_mode() -> String {
    "auto".to_string()
}

fn default_ollama_url() -> String {
    "http://localhost:11434".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultModels {
    pub ollama: String,
    #[serde(default, rename = "managed_cloud", alias = "managedCloud")]
    pub managed_cloud: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPreferences {
    pub theme: String,
    #[serde(default = "default_language")]
    pub language: String,
    pub startup_position: String,
    pub dock_on_startup: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_theme: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dyslexic_font: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chat_font: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui_scale: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reduce_motion: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatPreferences {
    #[serde(default = "default_compact_mode")]
    pub compact_mode: bool,
    #[serde(default)]
    pub auto_approve_tools: bool,
    /// Master policy for both automatic memory retrieval and generation.
    /// Missing values from older settings files fail closed.
    #[serde(default)]
    pub memory_enabled: bool,
    /// Whether automatic generation may run on tool/web-assisted turns.
    #[serde(default)]
    pub allow_tool_assisted_memory_generation: bool,
    #[serde(default)]
    pub auto_save_memories: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub send_shortcut: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temporary_chat: Option<bool>,
}

impl Default for ChatPreferences {
    fn default() -> Self {
        Self {
            compact_mode: default_compact_mode(),
            auto_approve_tools: false,
            memory_enabled: false,
            allow_tool_assisted_memory_generation: false,
            auto_save_memories: false,
            send_shortcut: Some(default_send_shortcut()),
            temporary_chat: Some(false),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSandboxPreferences {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_terminal_sandbox_backend")]
    pub backend: String,
    #[serde(default = "default_terminal_sandbox_policy")]
    pub policy: String,
    #[serde(default = "default_terminal_sandbox_executable")]
    pub executable: String,
    #[serde(default)]
    pub allowed_domains: Vec<String>,
}

fn default_terminal_sandbox_backend() -> String {
    "srt".to_string()
}

fn default_terminal_sandbox_policy() -> String {
    agiworkforce_sandbox_policy::SandboxPolicy::default()
        .mode_name()
        .to_string()
}

fn default_terminal_sandbox_executable() -> String {
    "srt".to_string()
}

impl Default for TerminalSandboxPreferences {
    fn default() -> Self {
        Self {
            enabled: false,
            backend: default_terminal_sandbox_backend(),
            policy: default_terminal_sandbox_policy(),
            executable: default_terminal_sandbox_executable(),
            allowed_domains: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionPreferences {
    #[serde(default = "default_max_timeout_minutes")]
    pub max_timeout_minutes: u32,
    #[serde(default)]
    pub terminal_sandbox: TerminalSandboxPreferences,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_timeout_seconds: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_timeout_policy: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stream_inactivity_timeout_seconds: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalHotkeyPreferences {
    #[serde(default = "default_global_hotkey_enabled")]
    pub enabled: bool,
    #[serde(default = "default_global_hotkey_combo")]
    pub combo: String,
}

fn default_send_shortcut() -> String {
    "enter".to_string()
}

fn default_language() -> String {
    "en".to_string()
}

fn default_compact_mode() -> bool {
    true
}

fn default_max_timeout_minutes() -> u32 {
    1440
}

fn default_global_hotkey_enabled() -> bool {
    true
}

fn default_global_hotkey_combo() -> String {
    crate::sys::commands::shortcuts::platform_default_quick_query_combo().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_install_grants_no_folder() {
        let state = SettingsState::new();
        assert!(
            state.get_allowed_directories().is_empty(),
            "no folder is allowed until the user chooses one"
        );
    }

    #[cfg(unix)]
    #[test]
    fn an_added_allowed_directory_is_saved_as_its_real_folder_and_a_saved_one_is_kept() {
        let exe = std::env::current_exe().unwrap().canonicalize().unwrap();
        let tree = exe
            .parent()
            .unwrap()
            .join(format!("agi-allowed-folder-{}", uuid::Uuid::new_v4()));
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
        let link = link.to_string_lossy().into_owned();
        let saved = tree.join("saved-link").to_string_lossy().into_owned();
        std::os::unix::fs::symlink(&real, &saved).unwrap();

        assert_eq!(
            chosen_allowed_directories(
                std::slice::from_ref(&saved),
                vec![link, saved.clone(), "relative".to_string()],
            )
            .unwrap(),
            vec![
                real.to_string_lossy().into_owned(),
                saved,
                "relative".to_string()
            ],
            "a saved entry is never resolved again"
        );
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[test]
    fn only_the_folders_an_older_version_saved_unasked_are_removed() {
        let temp = tempfile::tempdir().expect("temporary folder");
        let legacy = temp.path().join("legacy");
        let chosen = temp.path().join("chosen");
        std::fs::create_dir_all(&legacy).expect("legacy folder");
        std::fs::create_dir_all(&chosen).expect("chosen folder");
        let root = std::env::current_dir()
            .expect("cwd")
            .ancestors()
            .last()
            .expect("a root")
            .to_string_lossy()
            .into_owned();
        let legacy_written = format!("{}/", legacy.display());
        let entries = vec![
            root.clone(),
            legacy_written.clone(),
            chosen.to_string_lossy().into_owned(),
            legacy.join("inside").to_string_lossy().into_owned(),
            "relative".to_string(),
        ];

        let (kept, removed) =
            without_legacy_default_folders(entries, &[legacy.canonicalize().expect("resolves")]);

        assert_eq!(removed, vec![root, legacy_written]);
        assert_eq!(
            kept,
            vec![
                chosen.to_string_lossy().into_owned(),
                legacy.join("inside").to_string_lossy().into_owned(),
                "relative".to_string(),
            ],
            "a folder inside one, or one the user chose, is kept"
        );
    }

    #[test]
    fn the_temporary_folder_is_one_an_older_version_saved_unasked() {
        let temp = std::env::temp_dir();
        let (kept, removed) = without_legacy_default_folders(
            vec![temp.to_string_lossy().into_owned()],
            &legacy_default_folders(),
        );
        assert!(kept.is_empty(), "{kept:?}");
        assert_eq!(removed.len(), 1);
    }

    #[test]
    fn an_older_settings_file_is_migrated_and_a_new_install_is_not() {
        let parsed: Settings = serde_json::from_value(serde_json::json!({
            "llmConfig": {
                "defaultProvider": "managed_cloud",
                "temperature": 0.7,
                "maxTokens": 4096,
                "defaultModels": { "ollama": "", "managed_cloud": "auto" }
            },
            "windowPreferences": {
                "theme": "system",
                "startupPosition": "center",
                "dockOnStartup": null
            },
            "allowedDirectories": ["/"]
        }))
        .expect("settings without the flag deserialize");
        assert!(
            !parsed.legacy_default_folders_removed,
            "a settings file from an older version is migrated"
        );
        assert!(
            SettingsState::new()
                .settings
                .blocking_lock()
                .legacy_default_folders_removed,
            "a new install has nothing to migrate"
        );
    }

    #[test]
    fn legacy_settings_keep_new_fields_unset_and_migrate_managed_cloud_key() {
        let legacy = serde_json::json!({
            "llmConfig": {
                "defaultProvider": "managed_cloud",
                "temperature": 0.7,
                "maxTokens": 4096,
                "defaultModels": { "ollama": "", "managedCloud": "auto" },
                "favoriteModels": [],
                "providerMode": "auto",
                "ollamaUrl": "http://localhost:11434"
            },
            "windowPreferences": {
                "theme": "system",
                "language": "en",
                "startupPosition": "center",
                "dockOnStartup": null
            },
            "globalHotkeyPreferences": {
                "enabled": true,
                "combo": "CommandOrControl+Shift+Space"
            }
        });

        let parsed: Settings = serde_json::from_value(legacy).expect("legacy settings deserialize");
        assert_eq!(parsed.llm_config.default_models.managed_cloud, "auto");
        assert_eq!(parsed.llm_config.lmstudio_url, None);
        assert_eq!(parsed.window_preferences.ui_scale, None);
        assert!(parsed.personalization.is_none());
        assert!(parsed.custom_keybindings.is_none());

        let migrated = serde_json::to_value(parsed).expect("migrated settings serialize");
        assert_eq!(
            migrated
                .pointer("/llmConfig/defaultModels/managed_cloud")
                .and_then(serde_json::Value::as_str),
            Some("auto")
        );
        assert!(migrated
            .pointer("/llmConfig/defaultModels/managedCloud")
            .is_none());
    }

    #[test]
    fn settings_saved_with_since_removed_fields_still_load() {
        let stored = serde_json::json!({
            "llmConfig": {
                "defaultProvider": "managed_cloud",
                "temperature": 0.7,
                "maxTokens": 4096,
                "defaultModels": { "ollama": "", "managed_cloud": "auto" },
                "favoriteModels": ["fixture-model"]
            },
            "windowPreferences": {
                "theme": "system",
                "startupPosition": "center",
                "dockOnStartup": null
            },
            "chatPreferences": { "showTimestamps": true, "compactMode": false },
            "executionPreferences": {
                "maxTimeoutMinutes": 90,
                "enableCheckpointing": false,
                "checkpointInterval": 9,
                "autoResumeOnRestart": false
            }
        });

        let parsed: Settings = serde_json::from_value(stored).expect("older settings deserialize");
        assert!(
            !parsed
                .chat_preferences
                .as_ref()
                .expect("chat preferences")
                .compact_mode
        );
        assert_eq!(
            parsed
                .execution_preferences
                .as_ref()
                .expect("execution preferences")
                .max_timeout_minutes,
            90
        );

        let saved = serde_json::to_value(parsed).expect("settings serialize");
        for removed in [
            "/llmConfig/favoriteModels",
            "/chatPreferences/showTimestamps",
            "/executionPreferences/enableCheckpointing",
            "/executionPreferences/checkpointInterval",
            "/executionPreferences/autoResumeOnRestart",
        ] {
            assert!(
                saved.pointer(removed).is_none(),
                "{removed} is written again"
            );
        }
    }

    #[tokio::test]
    async fn settings_snapshot_atomically_replaces_an_existing_file() {
        let directory = tempfile::tempdir().expect("temporary settings directory");
        let settings_path = directory.path().join("settings.json");

        let state = SettingsState::default();
        let mut settings = state.settings.lock().await.clone();
        persist_settings_snapshot_to_path(&settings_path, &settings)
            .await
            .expect("seed previous settings snapshot");
        settings.window_preferences.language = "fr".to_string();

        let kept = persist_settings_snapshot_to_path(&settings_path, &settings)
            .await
            .expect("replace settings snapshot");
        assert_eq!(kept, None, "a readable settings file is never moved aside");
        assert_eq!(
            std::fs::read_dir(directory.path())
                .expect("read settings directory")
                .count(),
            1,
            "only the settings file itself remains"
        );

        let persisted: Settings = serde_json::from_slice(
            &std::fs::read(&settings_path).expect("read committed settings snapshot"),
        )
        .expect("committed snapshot is complete JSON");
        assert_eq!(persisted.window_preferences.language, "fr");
        assert!(
            std::fs::read_dir(directory.path())
                .expect("read settings directory")
                .all(|entry| {
                    !entry
                        .expect("settings directory entry")
                        .file_name()
                        .to_string_lossy()
                        .starts_with(".settings.json.")
                }),
            "a successful commit must not leave a staged settings file behind"
        );
    }

    #[tokio::test]
    async fn an_unreadable_settings_file_is_kept_aside_before_the_first_write_only() {
        let directory = tempfile::tempdir().expect("temporary settings directory");
        let settings_path = directory.path().join("settings.json");
        let damaged = br#"{"llmConfig": {"defaultProvider": "ollama", "tempera"#;
        std::fs::write(&settings_path, damaged).expect("seed a damaged settings file");

        let settings = SettingsState::default().settings.lock().await.clone();
        let kept = persist_settings_snapshot_to_path(&settings_path, &settings)
            .await
            .expect("write over a damaged file")
            .expect("the damaged file is kept");

        assert_eq!(kept.parent(), settings_path.parent());
        assert!(kept
            .file_name()
            .expect("kept file name")
            .to_string_lossy()
            .starts_with("settings.json.unreadable-"));
        assert_eq!(
            std::fs::read(&kept).expect("read the kept file"),
            damaged,
            "the kept file holds the old bytes exactly"
        );
        serde_json::from_slice::<Settings>(&std::fs::read(&settings_path).expect("read settings"))
            .expect("the new settings file is valid");

        let kept_again = persist_settings_snapshot_to_path(&settings_path, &settings)
            .await
            .expect("second write");
        assert_eq!(kept_again, None, "one damaged file is kept once");
        assert_eq!(
            std::fs::read_dir(directory.path())
                .expect("read settings directory")
                .count(),
            2,
            "the settings file and the one kept file"
        );
    }

    #[test]
    fn a_settings_file_of_the_wrong_shape_is_kept_and_named_apart_from_an_earlier_one() {
        let directory = tempfile::tempdir().expect("temporary settings directory");
        let settings_path = directory.path().join("settings.json");
        let now = chrono::DateTime::parse_from_rfc3339("2026-10-11T09:30:00Z")
            .expect("timestamp")
            .with_timezone(&chrono::Utc);

        std::fs::write(&settings_path, br#"{"featureFlags":"all"}"#).expect("seed");
        let first = set_aside_unreadable_settings(&settings_path, now)
            .expect("set aside")
            .expect("kept");
        assert_eq!(
            first.file_name().expect("name").to_string_lossy(),
            "settings.json.unreadable-20261011T093000Z"
        );

        std::fs::write(&settings_path, b"not json at all").expect("seed again");
        let second = set_aside_unreadable_settings(&settings_path, now)
            .expect("set aside")
            .expect("kept");
        assert_eq!(
            second.file_name().expect("name").to_string_lossy(),
            "settings.json.unreadable-20261011T093000Z-2"
        );
        assert_eq!(
            std::fs::read(&first).expect("first kept file"),
            br#"{"featureFlags":"all"}"#
        );
        assert!(!settings_path.exists());
    }

    fn saved_document(edit: impl FnOnce(&mut Settings)) -> String {
        let mut settings = default_settings();
        edit(&mut settings);
        serde_json::to_string(&settings).expect("serialize settings")
    }

    #[test]
    fn startup_with_no_settings_file_is_defaults_with_every_switch_at_its_default() {
        use crate::sys::commands::capabilities::SavedSwitches;

        let directory = tempfile::tempdir().expect("temporary settings directory");
        let startup = read_startup_settings(directory.path());

        assert_eq!(startup.switches, SavedSwitches::Defaults);
        assert!(startup.settings.feature_flags.is_empty());
        assert!(startup.settings.allowed_directories.is_empty());
    }

    #[test]
    fn startup_holds_the_saved_settings_and_switches_before_any_renderer_load() {
        use crate::sys::commands::capabilities::SavedSwitches;

        let directory = tempfile::tempdir().expect("temporary settings directory");
        std::fs::write(
            directory.path().join("settings.json"),
            saved_document(|settings| {
                settings.window_preferences.language = "fr".to_string();
                settings
                    .feature_flags
                    .insert("terminalAccess".to_string(), false);
            }),
        )
        .expect("seed settings");

        let startup = read_startup_settings(directory.path());

        assert_eq!(startup.settings.window_preferences.language, "fr");
        assert_eq!(
            startup.switches,
            SavedSwitches::Saved(std::collections::HashMap::from([(
                "terminalAccess".to_string(),
                false
            )]))
        );
        assert_eq!(
            startup.settings.feature_flags.get("terminalAccess"),
            Some(&false),
            "a write that starts from this state keeps the switch off"
        );
    }

    #[test]
    fn a_document_that_fails_to_parse_still_keeps_the_switches_it_holds() {
        use crate::sys::commands::capabilities::SavedSwitches;

        let wrong_shape =
            r#"{"llmConfig":"not an object","featureFlags":{"terminalAccess":false}}"#;
        let startup = startup_settings_from_json(wrong_shape);

        let saved = std::collections::HashMap::from([("terminalAccess".to_string(), false)]);
        assert_eq!(startup.switches, SavedSwitches::Saved(saved.clone()));
        assert_eq!(
            startup.settings.feature_flags, saved,
            "the file written over the unreadable one keeps terminal off"
        );
    }

    #[tokio::test]
    async fn an_unreadable_file_records_every_acting_capability_off_in_the_file_that_replaces_it() {
        use crate::sys::commands::capabilities::{CapabilityState, SavedSwitches, CAPABILITIES};

        let directory = tempfile::tempdir().expect("temporary settings directory");
        let settings_path = directory.path().join("settings.json");
        std::fs::write(&settings_path, b"{ damaged").expect("seed a damaged file");

        let startup = read_startup_settings(directory.path());
        assert!(matches!(startup.switches, SavedSwitches::Unreadable(_)));
        for capability in CAPABILITIES.iter() {
            assert_eq!(
                startup.settings.feature_flags.get(capability.name),
                capability.acts.then_some(&false),
                "{}",
                capability.name
            );
        }

        persist_settings_snapshot_to_path(&settings_path, &startup.settings)
            .await
            .expect("write the replacing file")
            .expect("the damaged file is kept");

        let next_launch = read_startup_settings(directory.path());
        let enforced = CapabilityState::from_saved(next_launch.switches);
        assert!(!enforced.is_enabled("terminalAccess").await);
        assert!(!enforced.is_enabled("fileOperations").await);
        assert!(enforced.is_enabled("screenshotOcr").await);
    }

    #[test]
    fn startup_does_not_grant_a_folder_an_older_version_saved_unasked() {
        let temporary = std::env::temp_dir().to_string_lossy().into_owned();
        let chosen = "/a/folder/the/person/chose".to_string();
        let json = saved_document(|settings| {
            settings.legacy_default_folders_removed = false;
            settings.allowed_directories = vec![temporary.clone(), chosen.clone()];
        });

        let startup = startup_settings_from_json(&json);

        assert_eq!(startup.settings.allowed_directories, vec![chosen]);
        assert!(
            !startup.settings.legacy_default_folders_removed,
            "the renderer's load still removes them for good and says so"
        );
    }

    #[test]
    fn nothing_the_page_sends_changes_the_switches() {
        let source = include_str!("settings.rs");
        let definition = ["pub async fn ", "settings_save("].concat();
        let save = source
            .rsplit(definition.as_str())
            .next()
            .expect("settings_save");
        let save = save.split("#[tauri::command]").next().unwrap_or(save);
        assert!(
            save.contains("settings.feature_flags = previous_settings.feature_flags.clone();"),
            "settings_save must keep the switches the backend holds"
        );
    }

    fn sandbox(enabled: bool, policy: &str) -> TerminalSandboxPreferences {
        TerminalSandboxPreferences {
            enabled,
            policy: policy.to_string(),
            ..TerminalSandboxPreferences::default()
        }
    }

    const NOTHING: Vec<String> = Vec::new();

    #[test]
    fn a_save_that_loosens_the_sandbox_names_the_value_now_and_after() {
        let held = sandbox(true, "workspace-write");
        let off = sandbox(false, "workspace-write");

        assert_eq!(
            sandbox_loosened(&held, &off),
            vec![
                "Sandbox for commands the assistant runs: now on (workspace-write), after this save off."
                    .to_string()
            ]
        );
        assert_eq!(
            sandbox_loosened(&held, &sandbox(true, "danger-full-access")),
            vec![
                "Sandbox for commands the assistant runs: now on (workspace-write), after this save full access, which is no sandbox."
                    .to_string()
            ]
        );
        let no_backend = TerminalSandboxPreferences {
            backend: "none".to_string(),
            ..held.clone()
        };
        assert_eq!(
            sandbox_loosened(&held, &no_backend),
            vec![
                "Sandbox for commands the assistant runs: now on (workspace-write), after this save no sandbox program."
                    .to_string()
            ]
        );
        assert_eq!(
            sandbox_loosened(&sandbox(true, "read-only"), &held),
            vec![
                "Sandbox for commands the assistant runs: now on (read-only), after this save on (workspace-write)."
                    .to_string()
            ]
        );

        let other_program = TerminalSandboxPreferences {
            executable: "/tmp/srt".to_string(),
            ..held.clone()
        };
        assert_eq!(
            sandbox_loosened(&held, &other_program),
            vec![
                "Sandbox program, started for every sandboxed command: now srt, after this save /tmp/srt."
                    .to_string()
            ]
        );
        let other_program_while_off = TerminalSandboxPreferences {
            executable: "/tmp/srt".to_string(),
            ..off.clone()
        };
        assert_eq!(
            sandbox_loosened(&off, &other_program_while_off).len(),
            1,
            "the program is run once the sandbox is switched on, which is never asked about"
        );

        let one_domain = TerminalSandboxPreferences {
            allowed_domains: vec!["github.com".to_string()],
            ..held.clone()
        };
        let two_domains = TerminalSandboxPreferences {
            allowed_domains: vec!["GitHub.com ".to_string(), "example.org".to_string()],
            ..held.clone()
        };
        assert_eq!(
            sandbox_loosened(&one_domain, &two_domains),
            vec![
                "Network domains sandboxed commands may reach: now github.com, after this save also example.org."
                    .to_string()
            ]
        );
        assert_eq!(
            sandbox_loosened(&off, &TerminalSandboxPreferences {
                allowed_domains: vec!["example.org".to_string()],
                ..off.clone()
            }),
            vec![
                "Network domains sandboxed commands may reach: now none, after this save also example.org."
                    .to_string()
            ]
        );
    }

    #[test]
    fn tightening_the_sandbox_is_never_asked_about() {
        let held = sandbox(true, "workspace-write");
        let off = sandbox(false, "workspace-write");
        let other_program = TerminalSandboxPreferences {
            executable: "/tmp/srt".to_string(),
            ..held.clone()
        };
        let one_domain = TerminalSandboxPreferences {
            allowed_domains: vec!["github.com".to_string()],
            ..held.clone()
        };

        for (saved, next) in [
            (held.clone(), held.clone()),
            (off.clone(), held.clone()),
            (held.clone(), sandbox(true, "read-only")),
            (sandbox(true, "danger-full-access"), held.clone()),
            (off.clone(), sandbox(false, "danger-full-access")),
            (other_program, held.clone()),
            (one_domain, held.clone()),
        ] {
            assert_eq!(
                sandbox_loosened(&saved, &next),
                NOTHING,
                "{saved:?} -> {next:?}"
            );
        }
    }

    #[test]
    fn approving_unanswered_tool_calls_is_asked_about_and_stopping_is_not() {
        let waits = |policy: &str| ExecutionPreferences {
            approval_timeout_policy: Some(policy.to_string()),
            approval_timeout_seconds: Some(45),
            ..ExecutionPreferences::default()
        };

        assert_eq!(
            execution_loosened(&waits("auto-deny"), &waits("auto-approve")),
            vec![
                "Tool approvals you do not answer: now auto-deny, after this save approved for you after 45 seconds."
                    .to_string()
            ]
        );
        assert_eq!(
            execution_loosened(&ExecutionPreferences::default(), &waits("auto-approve")).len(),
            1
        );
        for (saved, next) in [
            (waits("auto-approve"), waits("auto-approve")),
            (waits("auto-approve"), waits("auto-deny")),
            (waits("auto-deny"), waits("pause")),
        ] {
            assert_eq!(execution_loosened(&saved, &next), NOTHING);
        }
    }

    #[test]
    fn the_question_lists_each_change_or_is_not_asked() {
        let question =
            loosening_question(&["first".to_string(), "second".to_string()]).expect("fits");
        assert!(question.body.contains("first\n\nsecond"));
        assert!(crate::sys::native_confirm::can_ask_with(
            &question.confirm_label
        ));

        let too_many: Vec<String> = (0..60).map(|n| format!("change {n}")).collect();
        assert!(loosening_question(&too_many).is_err());
    }

    #[test]
    fn a_save_asks_before_it_holds_the_settings_and_grants_only_picked_folders() {
        let source = include_str!("settings.rs");
        let definition = ["pub async fn ", "settings_save("].concat();
        let save = source
            .rsplit(definition.as_str())
            .next()
            .expect("settings_save");
        let save = save.split("#[tauri::command]").next().unwrap_or(save);
        let asked = save.find("LOOSENING_DECISIONS").expect("asked");
        let held = save
            .find("let mut current_settings = state.settings.lock().await;")
            .expect("held");
        assert!(
            asked < held,
            "a dialog must not be open while the lock is held"
        );
        assert!(
            save[held..].contains("saved_execution(&previous_settings) != execution_when_asked")
        );

        let picked = save
            .find("picked_folders::require_granted_or_picked(")
            .expect("a new folder must come from the native picker");
        let stored = save
            .find("settings.allowed_directories = chosen_allowed_directories(")
            .expect("stored");
        assert!(picked < stored);
    }

    #[test]
    fn a_settings_file_with_retired_keys_still_parses() {
        let mut document = serde_json::to_value(default_settings()).expect("settings");
        document["customModels"] = serde_json::json!([{ "id": "custom-1" }]);
        document["chatPreferences"]["alwaysUseAgentMode"] = serde_json::json!(true);

        let parsed: Settings = serde_json::from_value(document).expect("parses");
        let written = serde_json::to_string(&parsed).expect("written");
        assert!(!written.contains("customModels"));
        assert!(!written.contains("alwaysUseAgentMode"));
    }

    #[test]
    fn a_missing_or_empty_settings_file_is_not_kept() {
        let directory = tempfile::tempdir().expect("temporary settings directory");
        let settings_path = directory.path().join("settings.json");
        let now = chrono::Utc::now();

        assert_eq!(set_aside_unreadable_settings(&settings_path, now), Ok(None));

        std::fs::write(&settings_path, b" \n").expect("seed an empty file");
        assert_eq!(set_aside_unreadable_settings(&settings_path, now), Ok(None));
        assert!(settings_path.exists());
    }
}

/// Personalization preferences sent from the frontend on each save.
/// These are stored in settings.json alongside other preferences.
/// Defaults match defaultPersonalization in settingsStore.ts so that
/// a neutral profile round-trips without emitting any guidance.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Personalization {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub occupation: String,
    #[serde(default)]
    pub bio: String,
    #[serde(default = "default_slider_neutral")]
    pub formality: u8,
    #[serde(default = "default_slider_neutral")]
    pub warmth: u8,
    #[serde(default = "default_slider_neutral")]
    pub detail: u8,
    #[serde(default = "default_emoji_usage")]
    pub emoji_usage: String,
}

fn default_slider_neutral() -> u8 {
    3
}

fn default_emoji_usage() -> String {
    "sometimes".to_string()
}

impl Default for Personalization {
    fn default() -> Self {
        Self {
            name: String::new(),
            occupation: String::new(),
            bio: String::new(),
            formality: default_slider_neutral(),
            warmth: default_slider_neutral(),
            detail: default_slider_neutral(),
            emoji_usage: default_emoji_usage(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub llm_config: LLMConfig,
    pub window_preferences: WindowPreferences,
    #[serde(default)]
    pub chat_preferences: Option<ChatPreferences>,
    #[serde(default)]
    pub execution_preferences: Option<ExecutionPreferences>,
    #[serde(default = "default_global_hotkey_preferences")]
    pub global_hotkey_preferences: GlobalHotkeyPreferences,

    #[serde(default)]
    pub allowed_directories: Vec<String>,
    #[serde(default)]
    pub feature_flags: std::collections::HashMap<String, bool>,
    /// Optional during migration so an older settings.json does not replace a
    /// renderer-hydrated personalization profile with neutral defaults.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub personalization: Option<Personalization>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_keybindings: Option<std::collections::HashMap<String, String>>,
    /// Set once the folders older versions saved into `allowed_directories`
    /// without the user choosing them have been removed. Owned by this
    /// process: a save from the renderer never changes it.
    #[serde(default)]
    pub legacy_default_folders_removed: bool,
}

fn default_global_hotkey_preferences() -> GlobalHotkeyPreferences {
    GlobalHotkeyPreferences {
        enabled: default_global_hotkey_enabled(),
        combo: default_global_hotkey_combo(),
    }
}

pub struct SettingsState {
    pub settings: Arc<Mutex<Settings>>,
}

impl SettingsState {
    /// Get the current allowed directories from settings
    pub fn get_allowed_directories(&self) -> Vec<String> {
        // Use blocking lock since this is called from sync contexts
        let settings = self.settings.blocking_lock();
        settings.allowed_directories.clone()
    }
}

impl Default for SettingsState {
    fn default() -> Self {
        Self::new()
    }
}

impl SettingsState {
    pub fn new() -> Self {
        Self::with(default_settings())
    }

    pub fn with(settings: Settings) -> Self {
        Self {
            settings: Arc::new(Mutex::new(settings)),
        }
    }
}

fn default_settings() -> Settings {
    Settings {
        llm_config: LLMConfig {
            default_provider: "managed_cloud".to_string(),
            temperature: 0.7,
            max_tokens: 4096,
            default_models: DefaultModels {
                ollama: "".to_string(),
                managed_cloud: "auto".to_string(),
            },
            task_routing: None,
            provider_mode: default_provider_mode(),
            ollama_url: default_ollama_url(),
            lmstudio_url: Some("http://localhost:1234/v1".to_string()),
            llamacpp_url: Some("http://localhost:8080/v1".to_string()),
            vllm_url: Some("http://localhost:8000/v1".to_string()),
        },
        window_preferences: WindowPreferences {
            theme: "system".to_string(),
            language: default_language(),
            startup_position: "center".to_string(),
            dock_on_startup: None,
            selected_theme: None,
            dyslexic_font: Some(false),
            chat_font: Some("default".to_string()),
            ui_scale: Some(100),
            reduce_motion: Some(false),
        },
        chat_preferences: Some(ChatPreferences {
            compact_mode: true,
            auto_approve_tools: false,
            memory_enabled: false,
            allow_tool_assisted_memory_generation: false,
            auto_save_memories: false,
            send_shortcut: Some(default_send_shortcut()),
            temporary_chat: Some(false),
        }),
        execution_preferences: Some(ExecutionPreferences {
            max_timeout_minutes: default_max_timeout_minutes(),
            terminal_sandbox: TerminalSandboxPreferences::default(),
            approval_timeout_seconds: Some(300),
            approval_timeout_policy: Some("auto-deny".to_string()),
            stream_inactivity_timeout_seconds: Some(30),
        }),
        global_hotkey_preferences: default_global_hotkey_preferences(),
        allowed_directories: Vec::new(),
        feature_flags: std::collections::HashMap::new(),
        personalization: Some(Personalization::default()),
        custom_keybindings: Some(std::collections::HashMap::new()),
        legacy_default_folders_removed: true,
    }
}

/// What the settings file held when the app started.
pub struct StartupSettings {
    pub settings: Settings,
    pub switches: crate::sys::commands::capabilities::SavedSwitches,
}

const SETTINGS_FILE_NAME: &str = "settings.json";

/// Reads the settings file once, in setup, so the backend holds the person's
/// saved settings and switches before the renderer exists and before anything
/// can run a tool or write the file. A write therefore never starts from
/// defaults while a readable file is there.
pub fn read_startup_settings(app_data_dir: &Path) -> StartupSettings {
    use crate::sys::commands::capabilities::SavedSwitches;

    match std::fs::read_to_string(app_data_dir.join(SETTINGS_FILE_NAME)) {
        Ok(json) => startup_settings_from_json(&json),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => StartupSettings {
            settings: default_settings(),
            switches: SavedSwitches::Defaults,
        },
        Err(error) => startup_settings_without_a_file(SavedSwitches::Unreadable(format!(
            "the settings file: {error}"
        ))),
    }
}

/// A document that parses is used whole. One that does not still yields its
/// switches when those parse on their own, so a damaged setting elsewhere does
/// not turn a switch back on. When the switches cannot be read either, every
/// capability that acts is recorded off.
fn startup_settings_from_json(json: &str) -> StartupSettings {
    use crate::sys::commands::capabilities::{saved_switches_from_json, SavedSwitches};

    match serde_json::from_str::<Settings>(json) {
        Ok(settings) => {
            let settings = made_ready_at_startup(settings);
            StartupSettings {
                switches: SavedSwitches::Saved(settings.feature_flags.clone()),
                settings,
            }
        }
        Err(_) => startup_settings_without_a_file(saved_switches_from_json(json)),
    }
}

fn startup_settings_without_a_file(
    switches: crate::sys::commands::capabilities::SavedSwitches,
) -> StartupSettings {
    use crate::sys::commands::capabilities::{held_switch_values, SavedSwitches};

    let mut settings = default_settings();
    settings.feature_flags = match &switches {
        SavedSwitches::Saved(saved) => saved.clone(),
        SavedSwitches::Unreadable(_) => held_switch_values(),
        SavedSwitches::Defaults => std::collections::HashMap::new(),
    };
    StartupSettings { settings, switches }
}

/// The saved document as the backend may use it before the renderer has
/// loaded it: the shortcut normalised, and no folder an older version granted
/// unasked. The renderer's load removes those folders for good and says so.
fn made_ready_at_startup(mut settings: Settings) -> Settings {
    settings.global_hotkey_preferences.combo =
        crate::sys::commands::shortcuts::normalize_accelerator_for_platform(
            &settings.global_hotkey_preferences.combo,
        );
    if settings.global_hotkey_preferences.combo.is_empty() {
        settings.global_hotkey_preferences.combo = default_global_hotkey_combo();
    }
    if !settings.legacy_default_folders_removed {
        let entries = std::mem::take(&mut settings.allowed_directories);
        settings.allowed_directories =
            without_legacy_default_folders(entries, &legacy_default_folders()).0;
    }
    settings
}

#[tauri::command]
pub async fn settings_load(state: State<'_, SettingsState>) -> Result<Settings, String> {
    let settings = state.settings.lock().await;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn settings_save(
    settings: Settings,
    state: State<'_, SettingsState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let mut settings = settings;
    settings.global_hotkey_preferences.combo =
        crate::sys::commands::shortcuts::normalize_accelerator_for_platform(
            &settings.global_hotkey_preferences.combo,
        );
    if settings.global_hotkey_preferences.combo.is_empty() {
        settings.global_hotkey_preferences.combo = default_global_hotkey_combo();
    }

    // The sandbox and the approval timeout hold back what the assistant
    // runs, and the page that sends this document renders model output. A
    // save that loosens either is decided by the person in a native dialog,
    // asked before the settings lock is taken so nothing waits on a dialog.
    let execution_when_asked = saved_execution(&*state.settings.lock().await);
    let loosened = execution_loosened(&execution_when_asked, &saved_execution(&settings));
    if !loosened.is_empty() {
        let question = loosening_question(&loosened)?;
        let confirmed = LOOSENING_DECISIONS
            .confirm(&app_handle, &loosened.join("\n"), question)
            .await
            .map_err(|held| held.message())?;
        if !confirmed {
            return Err(
                "Nothing was saved. You declined the more permissive settings in the system dialog."
                    .to_string(),
            );
        }
    }

    // Hold the native settings lock for the complete commit. Concurrent save
    // commands must not interleave their shortcut, disk, and in-memory stages.
    let mut current_settings = state.settings.lock().await;
    let previous_settings = current_settings.clone();
    if saved_execution(&previous_settings) != execution_when_asked {
        return Err(
            "Nothing was saved. The sandbox or approval settings changed while this save was waiting; save again."
                .to_string(),
        );
    }
    settings.legacy_default_folders_removed = previous_settings.legacy_default_folders_removed;
    // The capability switches are a guard the person set, and the page that
    // sends this document renders model output. `set_capability` is their only
    // writer; whatever the page sent for them is dropped.
    settings.feature_flags = previous_settings.feature_flags.clone();
    // A folder grant stands until it is removed. One this save adds must be
    // the folder a native picker returned in this process; removing is free.
    crate::sys::picked_folders::require_granted_or_picked(
        &previous_settings.allowed_directories,
        &settings.allowed_directories,
    )?;
    settings.allowed_directories = chosen_allowed_directories(
        &previous_settings.allowed_directories,
        std::mem::take(&mut settings.allowed_directories),
    )?;

    let shortcuts_state =
        app_handle.try_state::<Arc<Mutex<crate::sys::commands::shortcuts::ShortcutsState>>>();
    if let Some(shortcuts_state) = shortcuts_state.as_ref() {
        crate::sys::commands::shortcuts::apply_quick_query_hotkey_preferences(
            &app_handle,
            shortcuts_state,
            crate::sys::commands::shortcuts::QuickQueryHotkeyPreferences {
                enabled: settings.global_hotkey_preferences.enabled,
                combo: settings.global_hotkey_preferences.combo.clone(),
            },
        )
        .await?;
    }

    if let Err(save_error) = persist_settings_snapshot(&app_handle, &settings).await {
        // The OS shortcut was the only live side effect staged before disk.
        // Restore it before reporting failure so the Settings panel can keep
        // the draft open without having silently applied part of it.
        let rollback_error = if let Some(shortcuts_state) = shortcuts_state.as_ref() {
            crate::sys::commands::shortcuts::apply_quick_query_hotkey_preferences(
                &app_handle,
                shortcuts_state,
                crate::sys::commands::shortcuts::QuickQueryHotkeyPreferences {
                    enabled: previous_settings.global_hotkey_preferences.enabled,
                    combo: previous_settings.global_hotkey_preferences.combo.clone(),
                },
            )
            .await
            .err()
        } else {
            None
        };

        return Err(match rollback_error {
            Some(rollback_error) => format!(
                "{save_error}. The previous global shortcut could not be restored: {rollback_error}"
            ),
            None => save_error,
        });
    }

    // A folder this save removed is no longer granted, so the picker's memory
    // of it must not let the page grant it again without the person choosing.
    for removed in previous_settings
        .allowed_directories
        .iter()
        .filter(|saved| !settings.allowed_directories.contains(saved))
    {
        crate::sys::picked_folders::forget(removed);
    }

    // Publish the new native state only after every fallible commit stage has
    // succeeded. A failed Save therefore leaves disk, shortcut, and memory on
    // the same previous snapshot.
    *current_settings = settings;

    tracing::info!("Settings persisted");
    Ok(())
}

/// One question about more permissive settings at a time, and a wait after
/// a no.
static LOOSENING_DECISIONS: crate::sys::native_confirm::ConfirmGate =
    crate::sys::native_confirm::ConfirmGate::new();

const AUTO_APPROVE_ON_TIMEOUT: &str = "auto-approve";

fn saved_execution(settings: &Settings) -> ExecutionPreferences {
    settings.execution_preferences.clone().unwrap_or_default()
}

/// The sandbox as a dialog names it.
fn sandbox_as_shown(sandbox: &TerminalSandboxPreferences) -> String {
    use crate::sys::security::sandbox_runtime::sandbox_policy_in_force;
    use agiworkforce_sandbox_policy::SandboxPolicy;

    match sandbox_policy_in_force(sandbox).ok().flatten() {
        Some(policy) => format!("on ({})", policy.mode_name()),
        None if !sandbox.enabled => "off".to_string(),
        None if matches!(
            SandboxPolicy::from_mode_str(&sandbox.policy),
            SandboxPolicy::DangerFullAccess
        ) =>
        {
            "full access, which is no sandbox".to_string()
        }
        None => "no sandbox program".to_string(),
    }
}

fn program_as_shown(program: &str) -> String {
    let program = program.trim();
    crate::sys::native_confirm::shown_value(if program.is_empty() { "srt" } else { program })
}

/// What a save would loosen in the terminal sandbox, one sentence each,
/// naming the value now and the value after. Empty when it loosens nothing:
/// switching the sandbox on, tightening its policy, removing a domain or
/// returning to the default program is never asked about.
fn sandbox_loosened(
    saved: &TerminalSandboxPreferences,
    next: &TerminalSandboxPreferences,
) -> Vec<String> {
    use crate::sys::security::sandbox_runtime::sandbox_policy_in_force;
    use agiworkforce_sandbox_policy::SandboxPolicy;

    let mut loosened = Vec::new();
    let less_held = matches!(
        (
            sandbox_policy_in_force(saved).ok().flatten(),
            sandbox_policy_in_force(next).ok().flatten(),
        ),
        (Some(_), None)
            | (
                Some(SandboxPolicy::ReadOnly),
                Some(SandboxPolicy::WorkspaceWrite { .. })
            )
    );
    if less_held {
        loosened.push(format!(
            "Sandbox for commands the assistant runs: now {}, after this save {}.",
            sandbox_as_shown(saved),
            sandbox_as_shown(next)
        ));
    }

    let program = next.executable.trim();
    if program != saved.executable.trim()
        && !program.is_empty()
        && program != default_terminal_sandbox_executable()
    {
        loosened.push(format!(
            "Sandbox program, started for every sandboxed command: now {}, after this save {}.",
            program_as_shown(&saved.executable),
            program_as_shown(program)
        ));
    }

    let known: Vec<String> = saved
        .allowed_domains
        .iter()
        .map(|domain| domain.trim().to_ascii_lowercase())
        .filter(|domain| !domain.is_empty())
        .collect();
    let mut added: Vec<String> = next
        .allowed_domains
        .iter()
        .map(|domain| domain.trim().to_ascii_lowercase())
        .filter(|domain| !domain.is_empty() && !known.contains(domain))
        .collect();
    added.sort();
    added.dedup();
    if !added.is_empty() {
        let now = if known.is_empty() {
            "none".to_string()
        } else {
            known.join(", ")
        };
        loosened.push(format!(
            "Network domains sandboxed commands may reach: now {}, after this save also {}.",
            crate::sys::native_confirm::shown_value(&now),
            crate::sys::native_confirm::shown_value(&added.join(", "))
        ));
    }

    loosened
}

/// What a save would loosen in how the assistant's commands and tool calls
/// are held back. The approval timeout counts: with `auto-approve`, a tool
/// call nobody answers is approved, which is a standing yes.
fn execution_loosened(saved: &ExecutionPreferences, next: &ExecutionPreferences) -> Vec<String> {
    let mut loosened = sandbox_loosened(&saved.terminal_sandbox, &next.terminal_sandbox);

    let approves_unanswered = |preferences: &ExecutionPreferences| {
        preferences.approval_timeout_policy.as_deref() == Some(AUTO_APPROVE_ON_TIMEOUT)
    };
    if approves_unanswered(next) && !approves_unanswered(saved) {
        let wait = match next.approval_timeout_seconds {
            Some(seconds) => format!("after {seconds} seconds"),
            None => "after the wait".to_string(),
        };
        loosened.push(format!(
            "Tool approvals you do not answer: now {}, after this save approved for you {wait}.",
            crate::sys::native_confirm::shown_value(
                saved
                    .approval_timeout_policy
                    .as_deref()
                    .unwrap_or("auto-deny")
            )
        ));
    }

    loosened
}

fn loosening_question(
    loosened: &[String],
) -> Result<crate::sys::native_confirm::NativeConfirm, String> {
    let body = format!(
        "Saving these settings makes the assistant less restricted:\n\n{}",
        loosened.join("\n\n")
    );
    crate::sys::native_confirm::check_it_fits(&body).map_err(|rows| {
        format!(
            "Nothing was saved. These changes take {rows} rows to show, more than the system dialog holds. Add fewer domains in one save."
        )
    })?;
    Ok(crate::sys::native_confirm::NativeConfirm {
        title: "Make these settings more permissive?".to_string(),
        body,
        confirm_label: "Allow And Save".to_string(),
    })
}

/// The allowed directories as the user saves them: each absolute entry the
/// user added is resolved once, now, and stored as its real folder, so no
/// link on its way is consulted again. An entry saved before is kept as it
/// was: resolving it again would follow a link a sandboxed command could
/// have put in its place since.
fn chosen_allowed_directories(
    saved: &[String],
    entries: Vec<String>,
) -> Result<Vec<String>, String> {
    entries
        .into_iter()
        .map(|entry| {
            if cfg!(windows) || saved.contains(&entry) || !Path::new(&entry).is_absolute() {
                return Ok(entry);
            }
            let resolved =
                agiworkforce_sandbox_policy::host_path::resolve_chosen_root(Path::new(&entry))?;
            Ok(resolved.into_os_string().into_string().unwrap_or(entry))
        })
        .collect()
}

pub(crate) async fn persist_settings_snapshot(
    app_handle: &tauri::AppHandle,
    settings: &Settings,
) -> Result<(), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let settings_path = app_data_dir.join(SETTINGS_FILE_NAME);
    let kept = persist_settings_snapshot_to_path(&settings_path, settings).await?;
    if let Some(kept) = kept {
        use tauri::Emitter;

        tracing::warn!(
            "The settings file could not be read, so it was kept as {:?} before a new one was written",
            kept
        );
        let kept = kept.to_string_lossy().into_owned();
        if let Ok(mut last_kept) = KEPT_UNREADABLE_SETTINGS.lock() {
            *last_kept = Some(kept.clone());
        }
        if let Err(error) = app_handle.emit(UNREADABLE_SETTINGS_KEPT_EVENT, &kept) {
            tracing::warn!("Failed to announce the kept settings file: {error}");
        }
    }

    tracing::info!("Settings persisted to {:?}", settings_path);
    Ok(())
}

const UNREADABLE_SETTINGS_KEPT_EVENT: &str = "settings:unreadable-file-kept";

/// The settings file this session moved aside because it could not be read.
static KEPT_UNREADABLE_SETTINGS: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// Where this session kept a settings file it could not read, for Settings to
/// name. `None` when every write found a readable file or none at all.
#[tauri::command]
pub async fn settings_kept_unreadable_file() -> Result<Option<String>, String> {
    Ok(KEPT_UNREADABLE_SETTINGS
        .lock()
        .map_err(|error| format!("Lock error: {error}"))?
        .clone())
}

const KEPT_UNREADABLE_SUFFIX: &str = "unreadable";

/// Moves a settings file that cannot be read as settings out of the way of the
/// write about to replace it, so whatever could be recovered from it is not
/// lost. A readable file, a missing one and an empty one are left where they
/// are. The file is renamed, never deleted, and a failed rename stops the
/// write. Once moved, the next write finds the new, readable file, so one
/// damaged file is kept once.
fn set_aside_unreadable_settings(
    settings_path: &Path,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<Option<PathBuf>, String> {
    match std::fs::read(settings_path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Ok(bytes)
            if bytes.iter().all(u8::is_ascii_whitespace)
                || serde_json::from_slice::<Settings>(&bytes).is_ok() =>
        {
            return Ok(None)
        }
        Ok(_) | Err(_) => {}
    }

    let file_name = settings_path
        .file_name()
        .ok_or_else(|| "Settings path has no file name".to_string())?
        .to_string_lossy();
    let stamp = now.format("%Y%m%dT%H%M%SZ");
    let kept = (1u32..)
        .map(|attempt| {
            let name = if attempt == 1 {
                format!("{file_name}.{KEPT_UNREADABLE_SUFFIX}-{stamp}")
            } else {
                format!("{file_name}.{KEPT_UNREADABLE_SUFFIX}-{stamp}-{attempt}")
            };
            settings_path.with_file_name(name)
        })
        .find(|candidate| !candidate.exists())
        .ok_or_else(|| "No free name to keep the unreadable settings file under".to_string())?;

    std::fs::rename(settings_path, &kept).map_err(|error| {
        format!(
            "The settings file could not be read and could not be moved aside, so it was left untouched: {error}"
        )
    })?;
    Ok(Some(kept))
}

/// Writes the snapshot through a staged file and a rename. Returns where an
/// unreadable previous file was kept, if there was one.
async fn persist_settings_snapshot_to_path(
    settings_path: &Path,
    settings: &Settings,
) -> Result<Option<PathBuf>, String> {
    let parent = settings_path
        .parent()
        .ok_or_else(|| "Settings path has no parent directory".to_string())?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;

    let json = serde_json::to_vec_pretty(settings)
        .map_err(|error| format!("Failed to serialize settings: {error}"))?;
    let parent = parent.to_path_buf();
    let settings_path = settings_path.to_path_buf();

    tokio::task::spawn_blocking(move || -> Result<Option<PathBuf>, String> {
        let kept = set_aside_unreadable_settings(&settings_path, chrono::Utc::now())?;
        let mut staged = tempfile::Builder::new()
            .prefix(".settings.json.")
            .suffix(".tmp")
            .tempfile_in(&parent)
            .map_err(|error| format!("Failed to stage settings file: {error}"))?;
        staged
            .write_all(&json)
            .map_err(|error| format!("Failed to write staged settings file: {error}"))?;
        staged
            .as_file_mut()
            .sync_all()
            .map_err(|error| format!("Failed to sync staged settings file: {error}"))?;
        staged
            .persist(&settings_path)
            .map_err(|error| format!("Failed to atomically replace settings file: {error}"))?;
        Ok(kept)
    })
    .await
    .map_err(|error| format!("Settings persistence task failed: {error}"))?
}

/// The folders older versions saved as allowed directories without the user
/// choosing them, as written and as each resolves: the temporary folder, and
/// the working directory of an app opened from its own install location,
/// which is the folder of this executable or its `.app` bundle. A whole
/// drive, the working directory of an app opened from Finder, is matched by
/// [`is_whole_drive`] instead.
fn legacy_default_folders() -> Vec<PathBuf> {
    let mut folders = vec![std::env::temp_dir()];
    if let Ok(exe) = std::env::current_exe() {
        folders.extend(exe.parent().map(Path::to_path_buf));
        folders.extend(
            exe.ancestors()
                .find(|ancestor| {
                    ancestor
                        .extension()
                        .is_some_and(|extension| extension.eq_ignore_ascii_case("app"))
                })
                .map(Path::to_path_buf),
        );
    }
    let resolved: Vec<PathBuf> = folders
        .iter()
        .filter_map(|folder| std::fs::canonicalize(folder).ok())
        .collect();
    folders.extend(resolved);
    folders
}

fn is_whole_drive(path: &Path) -> bool {
    path.parent().is_none() && path.components().next().is_some()
}

/// `entries` split into those kept and those an older version saved
/// unasked: a whole drive, or one of `legacy`, as written or as it resolves.
/// Every other entry is kept as it was.
fn without_legacy_default_folders(
    entries: Vec<String>,
    legacy: &[PathBuf],
) -> (Vec<String>, Vec<String>) {
    entries.into_iter().partition(|entry| {
        let path = Path::new(entry);
        let unasked =
            |path: &Path| is_whole_drive(path) || legacy.iter().any(|folder| folder == path);
        !(unasked(path)
            || std::fs::canonicalize(path).is_ok_and(|resolved| unasked(resolved.as_path())))
    })
}

/// Removes, once, the folders older versions saved as allowed directories
/// without the user choosing them, and tells the user which were removed.
async fn remove_legacy_default_folders(app_handle: &tauri::AppHandle, settings: &mut Settings) {
    use crate::sys::commands::notification_center::{
        deliver_notification, CreateNotificationInput, NotificationCenterState,
        NotificationPriority, NotificationRoute, NotificationType,
    };

    let entries = settings.allowed_directories.clone();
    let (kept, removed) = match tokio::task::spawn_blocking(move || {
        without_legacy_default_folders(entries, &legacy_default_folders())
    })
    .await
    {
        Ok(split) => split,
        Err(error) => {
            tracing::warn!("[Settings] Allowed directories were not checked: {error}");
            return;
        }
    };
    settings.allowed_directories = kept;
    settings.legacy_default_folders_removed = true;
    if let Err(error) = persist_settings_snapshot(app_handle, settings).await {
        tracing::warn!("[Settings] Removing unchosen allowed directories was not saved: {error}");
    }
    if removed.is_empty() {
        return;
    }
    tracing::warn!(
        "[Settings] Removed allowed directories an older version added without asking: {:?}",
        removed
    );

    let Some(state) = app_handle.try_state::<NotificationCenterState>() else {
        return;
    };
    let input = CreateNotificationInput {
        title: "Folder access was narrowed".to_string(),
        message: format!(
            "An earlier version allowed the agent into {} without asking, so {} removed from \
             Allowed Directories. The agent asks again before it uses a folder there.",
            removed.join(", "),
            if removed.len() == 1 {
                "it was"
            } else {
                "they were"
            }
        ),
        notification_type: NotificationType::System,
        priority: NotificationPriority::Normal,
        action_url: Some(NotificationRoute::Settings("privacy").action_url()),
        action_label: Some("Review allowed directories".to_string()),
        icon: None,
        metadata: Some(serde_json::json!({
            "source": "settings",
            "removedAllowedDirectories": removed,
        })),
        dismissible: true,
        expires_at: None,
    };
    if let Err(reason) = deliver_notification(app_handle, &state, input).await {
        tracing::info!("[Settings] Allowed directories notice held back: {reason}");
    }
}

/// Persist a native-authoritative extension of the Allowed Directories list.
///
/// Used by the just-in-time folder consent flow. The snapshot is written before
/// the in-memory state is widened, so a disk failure leaves both enforcement
/// and the settings UI on the previous, fail-closed value.
pub(crate) async fn add_allowed_directories_persisted(
    app_handle: &tauri::AppHandle,
    state: &SettingsState,
    paths: &[String],
) -> Result<Vec<String>, String> {
    let mut current = state.settings.lock().await;
    let mut updated = current.clone();

    for path in paths {
        let path = path.trim();
        if path.is_empty()
            || updated
                .allowed_directories
                .iter()
                .any(|entry| entry == path)
        {
            continue;
        }
        updated.allowed_directories.push(path.to_string());
    }

    updated.allowed_directories.sort();
    updated.allowed_directories.dedup();

    if updated.allowed_directories != current.allowed_directories {
        persist_settings_snapshot(app_handle, &updated).await?;
        *current = updated;
    }

    Ok(current.allowed_directories.clone())
}

#[tauri::command]
pub async fn settings_load_from_disk(
    state: State<'_, SettingsState>,
    app_handle: tauri::AppHandle,
) -> Result<Settings, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let settings_path = app_data_dir.join(SETTINGS_FILE_NAME);

    if settings_path.exists() {
        let json = tokio::fs::read_to_string(&settings_path)
            .await
            .map_err(|e| format!("Failed to read settings file: {}", e))?;

        let loaded_settings: Settings =
            serde_json::from_str(&json).map_err(|e| format!("Failed to parse settings: {}", e))?;
        let mut loaded_settings = loaded_settings;
        loaded_settings.global_hotkey_preferences.combo =
            crate::sys::commands::shortcuts::normalize_accelerator_for_platform(
                &loaded_settings.global_hotkey_preferences.combo,
            );
        if loaded_settings.global_hotkey_preferences.combo.is_empty() {
            loaded_settings.global_hotkey_preferences.combo = default_global_hotkey_combo();
        }

        if !loaded_settings.legacy_default_folders_removed {
            remove_legacy_default_folders(&app_handle, &mut loaded_settings).await;
        }

        // The switches were read and enforced when the app started. A
        // reload of the page does not change them, and does not release one
        // held off after an unreadable file.
        let mut current_settings = state.settings.lock().await;
        loaded_settings.feature_flags = current_settings.feature_flags.clone();
        *current_settings = loaded_settings.clone();

        tracing::info!("Settings loaded from {:?}", settings_path);
        Ok(loaded_settings)
    } else {
        // Return default settings
        let settings = state.settings.lock().await;
        Ok(settings.clone())
    }
}
