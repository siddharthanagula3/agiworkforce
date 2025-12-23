use crate::sys::error::{Error, Result};
use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ShellType {
    PowerShell,
    Cmd,
    Wsl,
    GitBash,

    Zsh,
    Bash,
    Fish,
    Sh,
}

pub struct PtySession {
    pub id: String,
    pub shell_type: ShellType,
    pub master: Box<dyn MasterPty + Send>,
    pub child: Box<dyn portable_pty::Child + Send + Sync>,
    pub cwd: String,
}

impl PtySession {
    pub fn new(shell_type: ShellType, cwd: Option<String>) -> Result<Self> {
        let pty_system = NativePtySystem::default();

        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| Error::Other(format!("Failed to create PTY: {}", e)))?;

        let mut cmd = get_shell_command(&shell_type)?;

        if let Some(dir) = cwd.as_ref() {
            cmd.cwd(dir);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| Error::Other(format!("Failed to spawn shell: {}", e)))?;

        let id = uuid::Uuid::new_v4().to_string();

        let current_dir = cwd.unwrap_or_else(|| {
            std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| ".".to_string())
        });

        let master = pair.master;

        Ok(Self {
            id,
            shell_type,
            master,
            child,
            cwd: current_dir,
        })
    }

    pub fn write(&mut self, data: &str) -> Result<()> {
        self.master
            .take_writer()
            .map_err(|e| Error::Other(format!("Failed to get writer: {}", e)))?
            .write_all(data.as_bytes())
            .map_err(Error::from)?;
        Ok(())
    }

    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<()> {
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| Error::Other(format!("Failed to resize PTY: {}", e)))?;
        Ok(())
    }

    pub fn read_output(&mut self, buffer: &mut [u8]) -> Result<usize> {
        let result = self
            .master
            .try_clone_reader()
            .map_err(|e| Error::Other(format!("Failed to clone reader: {}", e)))?
            .read(buffer);

        match result {
            Ok(n) => Ok(n),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(0),
            Err(e) => Err(Error::from(e)),
        }
    }

    pub fn is_alive(&mut self) -> bool {
        match self.child.try_wait() {
            Ok(Some(_)) => false,
            Ok(None) => true,
            Err(_) => false,
        }
    }

    pub fn kill(&mut self) -> Result<()> {
        self.child
            .kill()
            .map_err(|e| Error::Other(format!("Failed to kill process: {}", e)))?;
        Ok(())
    }
}

fn get_shell_command(shell_type: &ShellType) -> Result<CommandBuilder> {
    let shell_path = match shell_type {
        ShellType::PowerShell => {
            if which::which("pwsh").is_ok() {
                "pwsh"
            } else if which::which("powershell.exe").is_ok() {
                "powershell.exe"
            } else {
                return Err(Error::Generic("PowerShell not found".to_string()));
            }
        }
        ShellType::Cmd => {
            if which::which("cmd.exe").is_ok() {
                "cmd.exe"
            } else {
                return Err(Error::Generic("cmd.exe not found".to_string()));
            }
        }
        ShellType::Wsl => {
            if which::which("wsl.exe").is_ok() {
                "wsl.exe"
            } else {
                return Err(Error::Generic("WSL not found".to_string()));
            }
        }
        ShellType::GitBash => {
            let git_bash_paths = vec![
                "C:\\Program Files\\Git\\bin\\bash.exe",
                "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
            ];

            let mut found = None;
            for path in git_bash_paths {
                if std::path::Path::new(path).exists() {
                    found = Some(path);
                    break;
                }
            }

            found.ok_or_else(|| Error::Generic("Git Bash not found".to_string()))?
        }

        ShellType::Zsh => {
            if which::which("zsh").is_ok() {
                "zsh"
            } else {
                return Err(Error::Generic("zsh not found".to_string()));
            }
        }
        ShellType::Bash => {
            if which::which("bash").is_ok() {
                "bash"
            } else {
                return Err(Error::Generic("bash not found".to_string()));
            }
        }
        ShellType::Fish => {
            if which::which("fish").is_ok() {
                "fish"
            } else {
                return Err(Error::Generic("fish not found".to_string()));
            }
        }
        ShellType::Sh => {
            if which::which("sh").is_ok() {
                "sh"
            } else {
                return Err(Error::Generic("sh not found".to_string()));
            }
        }
    };

    let mut cmd = CommandBuilder::new(shell_path);

    if shell_type == &ShellType::PowerShell {
        cmd.arg("-NoLogo");
    }

    Ok(cmd)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shell_type_serialization() {
        let shell = ShellType::PowerShell;
        let json = serde_json::to_string(&shell).unwrap();
        assert_eq!(json, r#""powershell""#);

        let deserialized: ShellType = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, ShellType::PowerShell);
    }
}
