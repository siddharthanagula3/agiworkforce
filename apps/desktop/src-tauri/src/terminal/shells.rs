use crate::terminal::ShellType;
#[cfg(windows)]
use std::path::PathBuf;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ShellInfo {
    pub shell_type: ShellType,
    pub path: String,
    pub available: bool,
}

/// Detect all available shells on the system
pub fn detect_available_shells() -> Vec<ShellInfo> {
    let mut shells = Vec::new();

    // Unix shells (macOS/Linux)
    #[cfg(unix)]
    {
        // Zsh (common on macOS and many Linux distros)
        if let Ok(path) = which::which("zsh") {
            shells.push(ShellInfo {
                shell_type: ShellType::Zsh,
                path: path.to_string_lossy().to_string(),
                available: true,
            });
        }

        // Bash (nearly universal on Unix)
        if let Ok(path) = which::which("bash") {
            shells.push(ShellInfo {
                shell_type: ShellType::Bash,
                path: path.to_string_lossy().to_string(),
                available: true,
            });
        }

        // Fish shell
        if let Ok(path) = which::which("fish") {
            shells.push(ShellInfo {
                shell_type: ShellType::Fish,
                path: path.to_string_lossy().to_string(),
                available: true,
            });
        }

        // POSIX sh (fallback)
        if let Ok(path) = which::which("sh") {
            shells.push(ShellInfo {
                shell_type: ShellType::Sh,
                path: path.to_string_lossy().to_string(),
                available: true,
            });
        }
    }

    // Windows shells
    #[cfg(windows)]
    {
        // PowerShell (try both pwsh and powershell.exe)
        if let Ok(path) = which::which("pwsh") {
            shells.push(ShellInfo {
                shell_type: ShellType::PowerShell,
                path: path.to_string_lossy().to_string(),
                available: true,
            });
        } else if let Ok(path) = which::which("powershell.exe") {
            shells.push(ShellInfo {
                shell_type: ShellType::PowerShell,
                path: path.to_string_lossy().to_string(),
                available: true,
            });
        }

        // CMD (always available on Windows)
        if let Ok(path) = which::which("cmd.exe") {
            shells.push(ShellInfo {
                shell_type: ShellType::Cmd,
                path: path.to_string_lossy().to_string(),
                available: true,
            });
        }

        // WSL (check if installed)
        if let Ok(path) = which::which("wsl.exe") {
            shells.push(ShellInfo {
                shell_type: ShellType::Wsl,
                path: path.to_string_lossy().to_string(),
                available: true,
            });
        }

        // Git Bash (check common install locations)
        let git_bash_paths = vec![
            "C:\\Program Files\\Git\\bin\\bash.exe",
            "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
        ];

        for path in git_bash_paths {
            if PathBuf::from(path).exists() {
                shells.push(ShellInfo {
                    shell_type: ShellType::GitBash,
                    path: path.to_string(),
                    available: true,
                });
                break;
            }
        }
    }

    shells
}

/// Get the default shell for the system
pub fn get_default_shell() -> ShellType {
    #[cfg(unix)]
    {
        // Prefer zsh on macOS (it's the default), otherwise bash
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
        // Prefer PowerShell on Windows
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
        // At least one shell should be available on any platform
        assert!(!shells.is_empty(), "Expected at least one shell to be available");

        // Check that all detected shells have the available flag set
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
            // On Unix, should return zsh, bash, or sh
            assert!(matches!(default, ShellType::Zsh | ShellType::Bash | ShellType::Sh));
        }
        
        #[cfg(windows)]
        {
            // On Windows, should return PowerShell or Cmd
            assert!(matches!(default, ShellType::PowerShell | ShellType::Cmd));
        }
    }
}
