use crate::features::terminal::ShellType;
#[cfg(windows)]
use std::path::PathBuf;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ShellInfo {
    pub shell_type: ShellType,
    pub name: String,
    pub path: String,
    pub available: bool,
}

impl ShellInfo {
    /// Create a new ShellInfo with the name derived from the shell type
    fn new(shell_type: ShellType, path: String) -> Self {
        Self {
            name: shell_type.to_string(),
            shell_type,
            path,
            available: true,
        }
    }
}

pub fn detect_available_shells() -> Vec<ShellInfo> {
    let mut shells = Vec::new();

    #[cfg(unix)]
    {
        if let Ok(path) = which::which("zsh") {
            shells.push(ShellInfo::new(
                ShellType::Zsh,
                path.to_string_lossy().to_string(),
            ));
        }

        if let Ok(path) = which::which("bash") {
            shells.push(ShellInfo::new(
                ShellType::Bash,
                path.to_string_lossy().to_string(),
            ));
        }

        if let Ok(path) = which::which("fish") {
            shells.push(ShellInfo::new(
                ShellType::Fish,
                path.to_string_lossy().to_string(),
            ));
        }

        if let Ok(path) = which::which("sh") {
            shells.push(ShellInfo::new(
                ShellType::Sh,
                path.to_string_lossy().to_string(),
            ));
        }
    }

    #[cfg(windows)]
    {
        if let Ok(path) = which::which("pwsh") {
            shells.push(ShellInfo::new(
                ShellType::PowerShell,
                path.to_string_lossy().to_string(),
            ));
        } else if let Ok(path) = which::which("powershell.exe") {
            shells.push(ShellInfo::new(
                ShellType::PowerShell,
                path.to_string_lossy().to_string(),
            ));
        }

        if let Ok(path) = which::which("cmd.exe") {
            shells.push(ShellInfo::new(
                ShellType::Cmd,
                path.to_string_lossy().to_string(),
            ));
        }

        if let Ok(path) = which::which("wsl.exe") {
            shells.push(ShellInfo::new(
                ShellType::Wsl,
                path.to_string_lossy().to_string(),
            ));
        }

        // Probe well-known Git Bash install paths first, then fall back to
        // whatever `bash` is on %PATH% (covers non-standard Git installs and
        // environments where bash is already on the path, e.g. Git for Windows
        // portable or Scoop/Winget installs).
        let git_bash_paths = vec![
            "C:\\Program Files\\Git\\bin\\bash.exe",
            "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
        ];

        let mut git_bash_found = false;
        for path in git_bash_paths {
            if PathBuf::from(path).exists() {
                shells.push(ShellInfo::new(ShellType::GitBash, path.to_string()));
                git_bash_found = true;
                break;
            }
        }

        if !git_bash_found {
            if let Ok(path) = which::which("bash") {
                shells.push(ShellInfo::new(
                    ShellType::GitBash,
                    path.to_string_lossy().to_string(),
                ));
            }
        }
    }

    shells
}

pub fn get_default_shell() -> ShellType {
    #[cfg(unix)]
    {
        if which::which("zsh").is_ok() {
            ShellType::Zsh
        } else if which::which("bash").is_ok() {
            ShellType::Bash
        } else {
            ShellType::Sh
        }
    }

    #[cfg(windows)]
    {
        if which::which("pwsh").is_ok() || which::which("powershell.exe").is_ok() {
            ShellType::PowerShell
        } else {
            ShellType::Cmd
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_available_shells() {
        let shells = detect_available_shells();

        assert!(
            !shells.is_empty(),
            "Expected at least one shell to be available"
        );

        for shell in &shells {
            assert!(shell.available);
            assert!(!shell.path.is_empty());
        }
    }

    #[test]
    fn test_get_default_shell() {
        let default = get_default_shell();

        #[cfg(unix)]
        {
            assert!(matches!(
                default,
                ShellType::Zsh | ShellType::Bash | ShellType::Sh
            ));
        }

        #[cfg(windows)]
        {
            assert!(matches!(default, ShellType::PowerShell | ShellType::Cmd));
        }
    }
}
