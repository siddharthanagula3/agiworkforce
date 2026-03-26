#![allow(dead_code, unused_imports)]
pub use agiworkforce_sandbox_policy::SandboxPolicy;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SandboxType {
    None,
    MacosSeatbelt,
    LinuxBubblewrap,
    LinuxLandlock,
    WindowsRestrictedToken,
}

impl SandboxType {
    pub fn detect() -> Self {
        #[cfg(target_os = "macos")]
        {
            if which_exists("sandbox-exec") {
                return Self::MacosSeatbelt;
            }
        }
        #[cfg(target_os = "linux")]
        {
            if which_exists("bwrap") {
                return Self::LinuxBubblewrap;
            }
        }
        Self::None
    }
    pub fn name(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::MacosSeatbelt => "seatbelt",
            Self::LinuxBubblewrap => "bubblewrap",
            Self::LinuxLandlock => "landlock",
            Self::WindowsRestrictedToken => "windows_restricted_token",
        }
    }
}

pub struct SandboxManager {
    pub sandbox_type: SandboxType,
    pub policy: SandboxPolicy,
    pub workspace_dir: PathBuf,
}

impl SandboxManager {
    pub fn new(policy: SandboxPolicy, workspace_dir: PathBuf) -> Self {
        Self {
            sandbox_type: SandboxType::detect(),
            policy,
            workspace_dir,
        }
    }
    pub fn full_auto(workspace_dir: PathBuf) -> Self {
        Self {
            sandbox_type: SandboxType::detect(),
            policy: SandboxPolicy::default(),
            workspace_dir,
        }
    }
    pub fn disabled() -> Self {
        eprintln!(
            "{}",
            colored::Colorize::yellow("warning: running without OS-level sandboxing — system commands will have unrestricted access")
        );
        Self {
            sandbox_type: SandboxType::None,
            policy: SandboxPolicy::DangerFullAccess,
            workspace_dir: std::env::current_dir().unwrap_or_default(),
        }
    }
}

pub async fn execute_sandboxed(
    manager: &SandboxManager,
    command: &str,
    cwd: Option<&Path>,
) -> Result<std::process::Output> {
    let mut cmd = tokio::process::Command::new("sh");
    cmd.arg("-c").arg(command);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    match manager.sandbox_type {
        SandboxType::MacosSeatbelt => {
            let ws = manager.workspace_dir.to_string_lossy().to_string();
            // Restrictive Seatbelt profile: deny by default, allow only workspace I/O,
            // reading system libs/tools, and basic process/network operations.
            let profile = format!(
                r#"(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow signal (target self))
(allow sysctl-read)
(allow mach-lookup)
(allow system-socket)
(allow network-outbound)
(allow file-read* (subpath "/usr") (subpath "/bin") (subpath "/sbin")
                   (subpath "/Library") (subpath "/System")
                   (subpath "/private/var/db") (subpath "/dev")
                   (subpath "/etc") (subpath "/tmp") (subpath "/private/tmp")
                   (literal "/") (subpath "/opt"))
(allow file-read* (subpath "{ws}"))
(allow file-write* (subpath "{ws}") (subpath "/tmp") (subpath "/private/tmp") (subpath "/dev/null"))
"#,
                ws = ws
            );
            let mut scmd = tokio::process::Command::new("sandbox-exec");
            scmd.arg("-p").arg(&profile).arg("sh").arg("-c").arg(command);
            if let Some(dir) = cwd {
                scmd.current_dir(dir);
            }
            scmd.output()
                .await
                .map_err(|e| anyhow::anyhow!("Seatbelt exec failed: {}", e))
        }
        SandboxType::LinuxBubblewrap => {
            let ws = manager.workspace_dir.to_string_lossy().to_string();
            let mut bcmd = tokio::process::Command::new("bwrap");
            bcmd.args([
                "--die-with-parent",
                "--unshare-pid",   // isolate process namespace
                "--unshare-uts",   // isolate hostname
                "--ro-bind", "/", "/",
                "--bind", &ws, &ws,
                "--tmpfs", "/tmp",
                "--dev", "/dev",
                "--proc", "/proc",
                "--", "sh", "-c", command,
            ]);
            if let Some(dir) = cwd {
                bcmd.current_dir(dir);
            }
            bcmd.output()
                .await
                .map_err(|e| anyhow::anyhow!("Bubblewrap exec failed: {}", e))
        }
        _ => cmd
            .output()
            .await
            .map_err(|e| anyhow::anyhow!("Exec failed: {}", e)),
    }
}

fn which_exists(binary: &str) -> bool {
    std::process::Command::new("which")
        .arg(binary)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}
