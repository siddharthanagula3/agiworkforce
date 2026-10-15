use crate::sys::commands::settings::TerminalSandboxPreferences;
use agiworkforce_sandbox_policy::SandboxPolicy;
use serde::Serialize;
use serde_json::json;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TerminalSandboxBackend {
    None,
    Srt,
}

impl TerminalSandboxBackend {
    fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "" | "none" | "off" => Ok(Self::None),
            "srt" => Ok(Self::Srt),
            other => Err(format!("Unsupported terminal sandbox backend: {other}")),
        }
    }
}

#[derive(Debug)]
struct TempConfigFile {
    path: PathBuf,
}

/// Where srt settings are written: inside the app data directory, which
/// every sandbox keeps read-only, so a sandboxed command cannot rewrite the
/// settings the next srt run reads.
fn config_dir() -> Result<PathBuf, String> {
    crate::sys::utils::app_data_dir()
        .map(|dir| dir.join("sandbox-runtime"))
        .map_err(|error| format!("Failed to locate the sandbox config directory: {error}"))
}

impl TempConfigFile {
    fn create(contents: &serde_json::Value) -> Result<Self, String> {
        let dir = config_dir()?;
        std::fs::create_dir_all(&dir)
            .map_err(|error| format!("Failed to create sandbox config directory: {error}"))?;

        let path = dir.join(format!("{}.json", uuid::Uuid::new_v4()));
        let json = serde_json::to_vec_pretty(contents)
            .map_err(|error| format!("Failed to serialize sandbox config: {error}"))?;

        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&path)
            .map_err(|error| format!("Failed to write sandbox config: {error}"))?;
        std::io::Write::write_all(&mut file, &json)
            .map_err(|error| format!("Failed to write sandbox config: {error}"))?;

        Ok(Self { path })
    }
}

impl Drop for TempConfigFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

#[derive(Debug)]
pub struct SandboxedCommandSpec {
    pub program: String,
    pub args: Vec<String>,
    /// An allowed folder this launch leaves out, each naming why, for the
    /// caller to show beside the command's output.
    pub warnings: Vec<String>,
    _config_file: Option<TempConfigFile>,
    /// The command's private TMPDIR, removed with this spec.
    _scratch: Option<tempfile::TempDir>,
}

impl SandboxedCommandSpec {
    #[cfg(test)]
    fn config_path(&self) -> Option<&Path> {
        self._config_file
            .as_ref()
            .map(|config| config.path.as_path())
    }
}

pub fn build_sandboxed_command(
    program: &str,
    args: &[String],
    cwd: Option<&str>,
    allowed_directories: &[String],
    preferences: &TerminalSandboxPreferences,
) -> Result<Option<SandboxedCommandSpec>, String> {
    match sandbox_policy_in_force(preferences)? {
        None => Ok(None),
        Some(policy) => {
            build_srt_command(program, args, cwd, allowed_directories, preferences, policy)
                .map(Some)
        }
    }
}

/// The policy commands are held to under `preferences`, or `None` when they
/// run with no sandbox: it is switched off, set to full access, or has no
/// backend. Settings asks the person before a save takes this from `Some` to
/// `None`, so the launch and the question read one decision.
pub(crate) fn sandbox_policy_in_force(
    preferences: &TerminalSandboxPreferences,
) -> Result<Option<SandboxPolicy>, String> {
    if !preferences.enabled {
        return Ok(None);
    }

    let policy = SandboxPolicy::from_mode_str(&preferences.policy);
    if matches!(policy, SandboxPolicy::DangerFullAccess) {
        return Ok(None);
    }

    Ok(match TerminalSandboxBackend::parse(&preferences.backend)? {
        TerminalSandboxBackend::None => None,
        TerminalSandboxBackend::Srt => Some(policy),
    })
}

const SRT_UNSUPPORTED_ON_WINDOWS: &str = "The `srt` sandbox backend is not supported on Windows.";

fn find_sandbox_binary(executable: &str) -> Result<PathBuf, String> {
    let executable = if executable.trim().is_empty() {
        "srt"
    } else {
        executable.trim()
    };

    agiworkforce_sandbox_policy::host_path::find_program(
        &agiworkforce_sandbox_policy::host_path::host_path(),
        executable,
        &agiworkforce_sandbox_policy::host_path::untrusted_roots(&[]),
    )
    .ok_or_else(|| {
        format!(
            "Sandbox runtime executable not found outside the folders a sandboxed command can \
             write: {executable}"
        )
    })
}

/// Whether the terminal sandbox can be switched on here, and why not when it
/// cannot. `supported` is false where no backend exists for the platform.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSandboxAvailability {
    pub supported: bool,
    pub available: bool,
    pub reason: Option<String>,
}

fn sandbox_availability(
    on_windows: bool,
    find_binary: impl FnOnce() -> Result<PathBuf, String>,
) -> TerminalSandboxAvailability {
    if on_windows {
        return TerminalSandboxAvailability {
            supported: false,
            available: false,
            reason: Some(SRT_UNSUPPORTED_ON_WINDOWS.to_string()),
        };
    }
    match find_binary() {
        Ok(_) => TerminalSandboxAvailability {
            supported: true,
            available: true,
            reason: None,
        },
        Err(reason) => TerminalSandboxAvailability {
            supported: true,
            available: false,
            reason: Some(reason),
        },
    }
}

/// Answers with the same lookup a sandboxed launch uses, so the settings
/// switch cannot be turned on for a runtime the launch would not find.
#[tauri::command]
pub async fn terminal_sandbox_availability(
    executable: Option<String>,
) -> Result<TerminalSandboxAvailability, String> {
    let executable = executable.unwrap_or_default();
    tokio::task::spawn_blocking(move || {
        sandbox_availability(cfg!(target_os = "windows"), || {
            find_sandbox_binary(&executable)
        })
    })
    .await
    .map_err(|error| format!("Failed to check the sandbox runtime: {error}"))
}

fn build_srt_command(
    program: &str,
    args: &[String],
    cwd: Option<&str>,
    allowed_directories: &[String],
    preferences: &TerminalSandboxPreferences,
    policy: SandboxPolicy,
) -> Result<SandboxedCommandSpec, String> {
    if cfg!(target_os = "windows") {
        return Err(SRT_UNSUPPORTED_ON_WINDOWS.to_string());
    }

    let sandbox_binary = find_sandbox_binary(&preferences.executable)?;

    let scratch_dir = crate::core::mcp::sandbox::create_sandbox_scratch_dir()?;
    let scratch = crate::core::mcp::sandbox::scratch_path(&scratch_dir);
    let (config, warnings) =
        build_srt_config(cwd, allowed_directories, preferences, policy, &scratch)?;
    let config_file = TempConfigFile::create(&config)?;
    let (wrapped_program, wrapped_args) = normalize_shell_invocation(program, args);

    let mut sandbox_args = vec![
        "--settings".to_string(),
        config_file.path.to_string_lossy().to_string(),
        "/usr/bin/env".to_string(),
        format!("TMPDIR={}", scratch.to_string_lossy()),
        wrapped_program,
    ];
    sandbox_args.extend(wrapped_args);

    Ok(SandboxedCommandSpec {
        program: sandbox_binary.to_string_lossy().to_string(),
        args: sandbox_args,
        warnings,
        _config_file: Some(config_file),
        _scratch: Some(scratch_dir),
    })
}

/// Writes reach only this run's private scratch directory, which becomes its
/// TMPDIR, and the workspace roots that are not the filesystem root, the
/// home folder or above it. Even there, each root's git metadata, the srt
/// settings and the configuration that decides what runs next stay
/// read-only, and host git treats every writable root as untrusted.
///
/// srt turns every `denyWrite` entry into a subpath rule, so it cannot deny a
/// root itself while allowing what is inside, and a command can replace its
/// own root with a link. Each root, read or written, is therefore checked
/// again on every launch. Only one of the system's own links, such as `/tmp`
/// on macOS, is followed on the way to a root. A working directory that no
/// longer verifies stops the launch, with the real folder to choose in its
/// place; an allowed folder that does not is left out of this launch, read
/// and written, and returned as a warning naming why. The scratch directory
/// is new for this launch, so it is checked but never recorded.
fn build_srt_config(
    cwd: Option<&str>,
    allowed_directories: &[String],
    preferences: &TerminalSandboxPreferences,
    policy: SandboxPolicy,
    scratch: &Path,
) -> Result<(serde_json::Value, Vec<String>), String> {
    let (workspace, given_roots) = collect_workspace_roots(cwd, allowed_directories)?;
    let mut usable_roots = Vec::new();
    let mut read_roots = BTreeSet::new();
    let mut warnings = Vec::new();
    for root in given_roots {
        match agiworkforce_sandbox_policy::host_path::verify_read_root(&root) {
            Ok(resolved) if resolved.canonical.parent().is_none() => {
                let warning = format!(
                    "The allowed folder {} is left out of this sandbox: {}",
                    root.display(),
                    crate::core::agi::executors::WHOLE_DRIVE_REFUSED
                );
                tracing::warn!("[sandbox_runtime] {warning}");
                warnings.push(warning);
            }
            Ok(resolved) => {
                read_roots.insert(resolved.canonical);
                usable_roots.push(root);
            }
            Err(reason) if workspace.as_ref() == Some(&root) => return Err(reason),
            Err(reason) => {
                let warning = format!(
                    "The allowed folder {} is left out of this sandbox: {reason}",
                    root.display()
                );
                tracing::warn!("[sandbox_runtime] {warning}");
                warnings.push(warning);
            }
        }
    }
    let allow_read = read_roots
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>();

    let mut candidates = Vec::new();
    if matches!(policy, SandboxPolicy::WorkspaceWrite { .. }) {
        candidates.extend(
            usable_roots
                .iter()
                .filter(|root| {
                    agiworkforce_sandbox_policy::is_safe_write_root(&canonicalize_or_preserve(root))
                })
                .cloned(),
        );
    }
    agiworkforce_worktree::add_sandbox_writable_roots(candidates.iter().cloned());
    let mut writable_roots = vec![agiworkforce_sandbox_policy::host_path::verify_scratch_root(
        scratch,
    )?];
    writable_roots.extend(
        candidates
            .iter()
            .map(|root| agiworkforce_sandbox_policy::host_path::verify_writable_root(root))
            .collect::<Result<Vec<PathBuf>, String>>()?,
    );
    if let Some(root) = writable_roots
        .iter()
        .find(|root| !agiworkforce_sandbox_policy::is_safe_write_root(root))
    {
        return Err(format!(
            "{} is the filesystem root, the home folder or above it, so the sandbox does not \
             write it",
            root.display()
        ));
    }
    let allow_write = dedupe_strings(
        writable_roots
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
    );

    let mut protected: Vec<PathBuf> = writable_roots
        .iter()
        .flat_map(|root| agiworkforce_sandbox_policy::wrap::git_metadata_paths(root))
        .collect();
    protected.extend(agiworkforce_sandbox_policy::wrap::host_user_git_config_paths());
    protected.extend(crate::core::mcp::sandbox::protected_config_paths());
    protected.push(config_dir()?);
    let deny_write = dedupe_strings(
        protected
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
    );

    let deny_read = dirs::home_dir()
        .map(|path| vec![path.to_string_lossy().to_string()])
        .unwrap_or_default();

    let allowed_domains = dedupe_strings(preferences.allowed_domains.clone());

    Ok((
        json!({
            "filesystem": {
                "denyRead": deny_read,
                "allowRead": allow_read,
                "allowWrite": allow_write,
                "denyWrite": deny_write
            },
            "network": {
                "allowedDomains": allowed_domains,
                "deniedDomains": []
            }
        }),
        warnings,
    ))
}

/// The working directory, and it with the allowed directories, as given,
/// made absolute but not resolved, so a root a command replaced with a link
/// is still seen as one when it is verified.
fn collect_workspace_roots(
    cwd: Option<&str>,
    allowed_directories: &[String],
) -> Result<(Option<PathBuf>, Vec<PathBuf>), String> {
    let mut paths = BTreeSet::new();

    let cwd_path = match cwd {
        Some(path) => std::path::absolute(path).ok(),
        None => std::env::current_dir().ok(),
    };

    if let Some(path) = cwd_path.clone() {
        paths.insert(path);
    }

    for directory in allowed_directories {
        if directory.trim().is_empty() {
            continue;
        }
        if let Ok(path) = std::path::absolute(directory) {
            paths.insert(path);
        }
    }

    if paths.is_empty() {
        return Err("Unable to resolve a workspace root for terminal sandboxing.".to_string());
    }

    Ok((cwd_path, paths.into_iter().collect()))
}

fn canonicalize_or_preserve(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn dedupe_strings(values: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .filter(|value| seen.insert(value.clone()))
        .collect()
}

fn normalize_shell_invocation(program: &str, args: &[String]) -> (String, Vec<String>) {
    let program_name = Path::new(program)
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_else(|| program.to_ascii_lowercase());

    match program_name.as_str() {
        "bash" | "zsh" if args.first().is_some_and(|arg| arg == "-lc") && args.len() >= 2 => {
            (program.to_string(), vec!["-c".to_string(), args[1].clone()])
        }
        "wsl.exe"
            if args.first().is_some_and(|arg| arg == "bash")
                && args.get(1).is_some_and(|arg| arg == "-lc")
                && args.len() >= 3 =>
        {
            (
                program.to_string(),
                vec!["bash".to_string(), "-c".to_string(), args[2].clone()],
            )
        }
        _ => (program.to_string(), args.to_vec()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_has_no_sandbox_backend_whatever_is_installed() {
        let availability = sandbox_availability(true, || Ok(PathBuf::from("/usr/local/bin/srt")));
        assert_eq!(
            availability,
            TerminalSandboxAvailability {
                supported: false,
                available: false,
                reason: Some(SRT_UNSUPPORTED_ON_WINDOWS.to_string()),
            }
        );
    }

    #[test]
    fn a_missing_runtime_is_reported_with_the_reason_the_launch_would_give() {
        let availability = sandbox_availability(false, || {
            find_sandbox_binary("agi-no-such-sandbox-runtime-binary")
        });
        assert!(availability.supported);
        assert!(!availability.available);
        assert!(availability
            .reason
            .is_some_and(|reason| reason.contains("agi-no-such-sandbox-runtime-binary")));
    }

    #[test]
    fn a_runtime_the_launch_can_find_is_available() {
        let availability = sandbox_availability(false, || Ok(PathBuf::from("/usr/local/bin/srt")));
        assert_eq!(
            availability,
            TerminalSandboxAvailability {
                supported: true,
                available: true,
                reason: None,
            }
        );
    }

    fn test_preferences() -> TerminalSandboxPreferences {
        TerminalSandboxPreferences {
            enabled: true,
            backend: "srt".to_string(),
            policy: "workspace-write".to_string(),
            executable: std::env::current_exe()
                .unwrap()
                .to_string_lossy()
                .to_string(),
            allowed_domains: vec!["github.com".to_string(), "api.github.com".to_string()],
        }
    }

    #[test]
    fn skips_sandbox_when_disabled() {
        let preferences = TerminalSandboxPreferences {
            enabled: false,
            ..test_preferences()
        };

        let result = build_sandboxed_command(
            "bash",
            &["-lc".to_string(), "pwd".to_string()],
            None,
            &[],
            &preferences,
        )
        .unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn rewrites_login_shell_for_sandbox() {
        let (program, args) =
            normalize_shell_invocation("bash", &["-lc".to_string(), "pwd".to_string()]);
        assert_eq!(program, "bash");
        assert_eq!(args, vec!["-c".to_string(), "pwd".to_string()]);
    }

    #[test]
    fn builds_srt_wrapper_and_config() {
        let _env = crate::sys::utils::APP_DATA_DIR_ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let preferences = test_preferences();
        let cwd = std::env::current_dir().unwrap();
        let spec = build_sandboxed_command(
            "bash",
            &["-lc".to_string(), "pwd".to_string()],
            Some(cwd.to_string_lossy().as_ref()),
            &[],
            &preferences,
        );
        if cfg!(windows) {
            assert!(spec.unwrap_err().contains("not supported on Windows"));
            return;
        }
        let spec = spec.unwrap().unwrap();

        assert!(spec.args.iter().any(|arg| arg == "bash"));
        assert!(spec.args.iter().any(|arg| arg == "-c"));

        let config_path = spec.config_path().unwrap().to_path_buf();
        let config = std::fs::read_to_string(&config_path).unwrap();
        assert!(config.contains("\"allowedDomains\""));
        assert!(config.contains("github.com"));
        assert!(config.contains("\"allowRead\""));
    }

    fn srt_filesystem(cwd: &Path, allowed: &[String]) -> serde_json::Value {
        let scratch = tempfile::tempdir().unwrap();
        let scratch_path = scratch.path().canonicalize().unwrap();
        build_srt_config(
            Some(cwd.to_string_lossy().as_ref()),
            allowed,
            &test_preferences(),
            SandboxPolicy::WorkspaceWrite {
                writable_roots: Vec::new(),
            },
            &scratch_path,
        )
        .unwrap()
        .0["filesystem"]
            .clone()
    }

    fn strings(value: &serde_json::Value) -> Vec<String> {
        value
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| entry.as_str().unwrap().to_string())
            .collect()
    }

    #[test]
    fn home_and_its_ancestors_are_never_writable() {
        let _env = crate::sys::utils::APP_DATA_DIR_ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(home) = dirs::home_dir() else {
            return;
        };
        let home = home.canonicalize().unwrap_or(home);
        let project = tempfile::tempdir().unwrap();
        let project = project.path().canonicalize().unwrap();
        let filesystem = srt_filesystem(
            &home,
            &["/".to_string(), project.to_string_lossy().to_string()],
        );
        let allow_write = strings(&filesystem["allowWrite"]);
        assert!(!allow_write.contains(&home.to_string_lossy().to_string()));
        assert!(!allow_write.contains(&"/".to_string()));
        assert!(allow_write.contains(&project.to_string_lossy().to_string()));
    }

    #[cfg(unix)]
    #[test]
    fn a_whole_drive_saved_as_an_allowed_folder_is_never_readable() {
        let _env = crate::sys::utils::APP_DATA_DIR_ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let project = tempfile::tempdir().unwrap();
        let project = project.path().canonicalize().unwrap();
        let scratch = tempfile::tempdir().unwrap();
        let scratch = scratch.path().canonicalize().unwrap();
        let (config, warnings) = build_srt_config(
            Some(project.to_string_lossy().as_ref()),
            &["/".to_string()],
            &test_preferences(),
            SandboxPolicy::ReadOnly,
            &scratch,
        )
        .expect("a refused whole drive is left out, not fatal");
        let allow_read = strings(&config["filesystem"]["allowRead"]);
        assert!(!allow_read.contains(&"/".to_string()), "{allow_read:?}");
        assert!(allow_read.contains(&project.to_string_lossy().to_string()));
        assert!(
            warnings
                .iter()
                .any(|warning| warning.contains("The allowed folder / is left out")),
            "{warnings:?}"
        );
    }

    #[test]
    fn a_writable_project_keeps_its_git_metadata_and_configuration_read_only() {
        let _app_data = crate::sys::utils::APP_DATA_DIR_ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let project = tempfile::tempdir().unwrap();
        let project = project.path().canonicalize().unwrap();
        std::fs::create_dir_all(project.join(".git").join("hooks")).unwrap();
        let deny_write = strings(&srt_filesystem(&project, &[])["denyWrite"]);
        for path in agiworkforce_sandbox_policy::wrap::git_metadata_paths(&project) {
            assert!(
                deny_write.contains(&path.to_string_lossy().to_string()),
                "{} is writable",
                path.display()
            );
        }
        for path in crate::core::mcp::sandbox::protected_config_paths() {
            assert!(deny_write.contains(&path.to_string_lossy().to_string()));
        }
        assert!(!deny_write.is_empty());
    }

    #[test]
    fn the_srt_settings_are_read_only_and_the_temp_folder_is_not_writable() {
        let _app_data = crate::sys::utils::APP_DATA_DIR_ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let project = tempfile::tempdir().unwrap();
        let project = project.path().canonicalize().unwrap();
        let defaults =
            crate::sys::commands::settings::SettingsState::new().get_allowed_directories();
        let filesystem = srt_filesystem(&project, &defaults);
        let config_dir = config_dir().unwrap();
        assert!(
            strings(&filesystem["denyWrite"]).contains(&config_dir.to_string_lossy().to_string())
        );
        let temp = std::env::temp_dir().canonicalize().unwrap();
        let allow_write = strings(&filesystem["allowWrite"]);
        assert!(allow_write.contains(&project.to_string_lossy().to_string()));
        assert!(
            allow_write
                .iter()
                .all(|root| !temp.starts_with(Path::new(root))),
            "{} or a folder above it is writable: {allow_write:?}",
            temp.display()
        );
    }

    #[cfg(unix)]
    #[test]
    fn an_allowed_folder_behind_a_link_is_left_out_with_a_warning_naming_its_real_folder() {
        let _app_data = crate::sys::utils::APP_DATA_DIR_ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let parent = tempfile::tempdir().unwrap();
        let parent = parent.path().canonicalize().unwrap();
        let project = parent.join("project");
        let real = parent.join("real");
        let link = parent.join("link");
        std::fs::create_dir(&project).unwrap();
        std::fs::create_dir(&real).unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();

        let scratch = tempfile::tempdir().unwrap();
        let scratch = scratch.path().canonicalize().unwrap();
        for policy in [
            SandboxPolicy::ReadOnly,
            SandboxPolicy::WorkspaceWrite {
                writable_roots: Vec::new(),
            },
        ] {
            let (config, warnings) = build_srt_config(
                Some(project.to_string_lossy().as_ref()),
                &[format!("{}/", link.display())],
                &test_preferences(),
                policy,
                &scratch,
            )
            .expect("one refused allowed folder does not stop the launch");
            let filesystem = &config["filesystem"];
            for granted in [
                strings(&filesystem["allowRead"]),
                strings(&filesystem["allowWrite"]),
            ] {
                assert!(
                    granted
                        .iter()
                        .all(|root| !Path::new(root).starts_with(&link)
                            && !Path::new(root).starts_with(&real)),
                    "a link a sandbox could retarget is neither read nor written: {granted:?}"
                );
            }
            assert!(
                strings(&filesystem["allowRead"]).contains(&project.to_string_lossy().to_string())
            );
            assert_eq!(warnings.len(), 1, "{warnings:?}");
            assert!(
                warnings[0].contains(&real.to_string_lossy().to_string()),
                "the warning names the real folder to choose: {warnings:?}"
            );
        }

        let error = build_srt_config(
            Some(link.to_string_lossy().as_ref()),
            &[],
            &test_preferences(),
            SandboxPolicy::ReadOnly,
            &scratch,
        )
        .expect_err("a working directory behind a link stops the launch");
        assert!(
            error.contains(&real.to_string_lossy().to_string()),
            "{error}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_writable_root_a_command_replaced_with_a_link_stops_the_next_launch() {
        let _env = crate::sys::utils::APP_DATA_DIR_ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let parent = tempfile::tempdir().unwrap();
        let parent = parent.path().canonicalize().unwrap();
        let project = parent.join("project");
        let elsewhere = parent.join("elsewhere");
        std::fs::create_dir(&project).unwrap();
        std::fs::create_dir(&elsewhere).unwrap();
        let scratch = tempfile::tempdir().unwrap();
        let scratch = scratch.path().canonicalize().unwrap();
        let build = || {
            build_srt_config(
                Some(project.to_string_lossy().as_ref()),
                &[],
                &test_preferences(),
                SandboxPolicy::WorkspaceWrite {
                    writable_roots: Vec::new(),
                },
                &scratch,
            )
        };
        let allow_write = strings(&build().unwrap().0["filesystem"]["allowWrite"]);
        assert!(allow_write.contains(&project.to_string_lossy().to_string()));

        std::fs::remove_dir(&project).unwrap();
        std::os::unix::fs::symlink(&elsewhere, &project).unwrap();
        assert!(build().is_err(), "a linked root must not be granted");
    }

    /// A folder outside the temporary folders, as a project in the user's own
    /// folders is: next to the test binary, in the build output.
    #[cfg(unix)]
    fn tree_outside_temp(name: &str) -> PathBuf {
        let exe = std::env::current_exe().unwrap().canonicalize().unwrap();
        let dir = exe
            .parent()
            .unwrap()
            .join(format!("agi-srt-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[cfg(unix)]
    #[test]
    fn outside_the_temporary_folders_a_root_behind_a_users_link_stops_the_launch() {
        let _app_data = crate::sys::utils::APP_DATA_DIR_ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let parent = tree_outside_temp("user-link");
        let project = parent.join("project");
        let elsewhere = parent.join("elsewhere");
        let real = parent.join("real");
        let link = parent.join("link");
        for dir in [&project, &elsewhere, &real] {
            std::fs::create_dir(dir).unwrap();
        }
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let scratch = tempfile::tempdir().unwrap();
        let scratch = scratch.path().canonicalize().unwrap();
        let build = |allowed: &[String]| {
            build_srt_config(
                Some(project.to_string_lossy().as_ref()),
                allowed,
                &test_preferences(),
                SandboxPolicy::WorkspaceWrite {
                    writable_roots: Vec::new(),
                },
                &scratch,
            )
        };
        let allow_write = strings(&build(&[]).unwrap().0["filesystem"]["allowWrite"]);
        assert!(allow_write.contains(&project.to_string_lossy().to_string()));

        let (config, warnings) = build(&[link.to_string_lossy().into_owned()])
            .expect("a refused allowed folder is left out, not fatal");
        assert!(!strings(&config["filesystem"]["allowRead"])
            .contains(&real.to_string_lossy().to_string()));
        assert!(
            warnings
                .iter()
                .any(|warning| warning.contains("goes through a link")
                    && warning.contains(&real.to_string_lossy().to_string())),
            "a link the user's own commands could have made is never followed: {warnings:?}"
        );

        std::fs::rename(&project, parent.join("moved")).unwrap();
        std::os::unix::fs::symlink(&elsewhere, &project).unwrap();
        let error = build(&[]).expect_err("the project its sandbox swapped is not granted");
        assert!(error.contains("changed since it was opened"), "{error}");
        let _ = std::fs::remove_dir_all(&parent);
    }

    #[cfg(unix)]
    #[test]
    fn an_srt_settings_file_is_private() {
        use std::os::unix::fs::PermissionsExt;
        let _app_data = crate::sys::utils::APP_DATA_DIR_ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let file = TempConfigFile::create(&json!({"filesystem": {}})).unwrap();
        let mode = std::fs::metadata(&file.path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        assert!(file.path.starts_with(config_dir().unwrap()));
    }
}
