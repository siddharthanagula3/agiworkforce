use crate::sys::commands::settings::TerminalSandboxPreferences;
use agiworkforce_sandbox_policy::SandboxPolicy;
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

impl TempConfigFile {
    fn create(contents: &serde_json::Value) -> Result<Self, String> {
        let dir = std::env::temp_dir()
            .join("agiworkforce")
            .join("sandbox-runtime");
        std::fs::create_dir_all(&dir)
            .map_err(|error| format!("Failed to create sandbox config directory: {error}"))?;

        let path = dir.join(format!("{}.json", uuid::Uuid::new_v4()));
        let json = serde_json::to_vec_pretty(contents)
            .map_err(|error| format!("Failed to serialize sandbox config: {error}"))?;

        std::fs::write(&path, json)
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
    _config_file: Option<TempConfigFile>,
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
    if !preferences.enabled {
        return Ok(None);
    }

    let policy = SandboxPolicy::from_mode_str(&preferences.policy);
    if matches!(policy, SandboxPolicy::DangerFullAccess) {
        return Ok(None);
    }

    match TerminalSandboxBackend::parse(&preferences.backend)? {
        TerminalSandboxBackend::None => Ok(None),
        TerminalSandboxBackend::Srt => {
            build_srt_command(program, args, cwd, allowed_directories, preferences, policy)
                .map(Some)
        }
    }
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
        return Err("The `srt` sandbox backend is not supported on Windows.".to_string());
    }

    let executable = if preferences.executable.trim().is_empty() {
        "srt"
    } else {
        preferences.executable.trim()
    };

    let sandbox_binary = which::which(executable)
        .map_err(|_| format!("Sandbox runtime executable not found: {executable}"))?;

    let config = build_srt_config(cwd, allowed_directories, preferences, policy)?;
    let config_file = TempConfigFile::create(&config)?;
    let (wrapped_program, wrapped_args) = normalize_shell_invocation(program, args);

    let mut sandbox_args = vec![
        "--settings".to_string(),
        config_file.path.to_string_lossy().to_string(),
        wrapped_program,
    ];
    sandbox_args.extend(wrapped_args);

    Ok(SandboxedCommandSpec {
        program: sandbox_binary.to_string_lossy().to_string(),
        args: sandbox_args,
        _config_file: Some(config_file),
    })
}

fn build_srt_config(
    cwd: Option<&str>,
    allowed_directories: &[String],
    preferences: &TerminalSandboxPreferences,
    policy: SandboxPolicy,
) -> Result<serde_json::Value, String> {
    let workspace_roots = collect_workspace_roots(cwd, allowed_directories)?;
    let allow_read = workspace_roots
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>();

    let mut allow_write = vec![std::env::temp_dir().to_string_lossy().to_string()];
    if matches!(policy, SandboxPolicy::WorkspaceWrite { .. }) {
        allow_write.extend(allow_read.iter().cloned());
    }
    allow_write = dedupe_strings(allow_write);

    let deny_read = dirs::home_dir()
        .map(|path| vec![path.to_string_lossy().to_string()])
        .unwrap_or_default();

    let allowed_domains = dedupe_strings(preferences.allowed_domains.clone());

    Ok(json!({
        "filesystem": {
            "denyRead": deny_read,
            "allowRead": allow_read,
            "allowWrite": allow_write,
            "denyWrite": []
        },
        "network": {
            "allowedDomains": allowed_domains,
            "deniedDomains": []
        }
    }))
}

fn collect_workspace_roots(
    cwd: Option<&str>,
    allowed_directories: &[String],
) -> Result<Vec<PathBuf>, String> {
    let mut paths = BTreeSet::new();

    let cwd_path = match cwd {
        Some(path) => Some(canonicalize_or_preserve(Path::new(path))),
        None => std::env::current_dir().ok(),
    };

    if let Some(path) = cwd_path {
        paths.insert(path);
    }

    for directory in allowed_directories {
        if directory.trim().is_empty() {
            continue;
        }
        paths.insert(canonicalize_or_preserve(Path::new(directory)));
    }

    if paths.is_empty() {
        return Err("Unable to resolve a workspace root for terminal sandboxing.".to_string());
    }

    Ok(paths.into_iter().collect())
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
        let preferences = test_preferences();
        let cwd = std::env::current_dir().unwrap();
        let spec = build_sandboxed_command(
            "bash",
            &["-lc".to_string(), "pwd".to_string()],
            Some(cwd.to_string_lossy().as_ref()),
            &[],
            &preferences,
        )
        .unwrap()
        .unwrap();

        assert!(spec.args.iter().any(|arg| arg == "bash"));
        assert!(spec.args.iter().any(|arg| arg == "-c"));

        let config_path = spec.config_path().unwrap().to_path_buf();
        let config = std::fs::read_to_string(&config_path).unwrap();
        assert!(config.contains("\"allowedDomains\""));
        assert!(config.contains("github.com"));
        assert!(config.contains("\"allowRead\""));
    }
}
