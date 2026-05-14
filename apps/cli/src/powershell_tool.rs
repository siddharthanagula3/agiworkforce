//! PowerShell tool — Windows shell execution with safety checks.
//!
//! Distinct from generic `run_command` because PowerShell has its own
//! security model: ConstrainedLanguageMode (CLM) verbs, execution policies,
//! and registry-touching cmdlets we want to warn about.
//!
//! Detects `pwsh`, `powershell.exe`, `powershell` (in that order) on PATH.

#![allow(dead_code)]

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PowerShellRequest {
    pub command: String,
    #[serde(default)]
    pub working_dir: Option<String>,
    #[serde(default = "default_timeout")]
    pub timeout_sec: u64,
    /// If true, only run if no destructive verbs are detected.
    #[serde(default = "default_safe_mode")]
    pub safe_mode: bool,
}

fn default_timeout() -> u64 { 30 }
fn default_safe_mode() -> bool { true }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PowerShellResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub interpreter: String,
    pub warnings: Vec<String>,
}

/// Verbs that are destructive or registry-touching. Caller is warned (or
/// blocked in safe_mode).
pub const DESTRUCTIVE_VERBS: &[&str] = &[
    "Remove-", "Stop-", "Restart-", "Reset-", "Disable-", "Uninstall-",
    "Clear-", "Format-", "Stop-Process", "Restart-Service",
    "Remove-Item", "Remove-ItemProperty", "Set-Acl",
    "New-PSDrive", // can map external drives
];

/// Cmdlets that touch the Windows registry — warn even when not safe_mode.
pub const REGISTRY_CMDLETS: &[&str] = &[
    "Get-ItemProperty", "Set-ItemProperty", "New-ItemProperty",
    "Remove-ItemProperty", "Get-ChildItem", // when path starts with HKLM:/HKCU:
];

/// Inspect a PowerShell command for safety concerns. Returns the list of
/// warnings. An empty Vec means the command looks safe.
pub fn safety_check(command: &str) -> Vec<String> {
    let mut warnings = Vec::new();
    for verb in DESTRUCTIVE_VERBS {
        if command.contains(verb) {
            warnings.push(format!("Destructive verb detected: {verb}"));
        }
    }
    if command.contains("HKLM:") || command.contains("HKCU:") {
        warnings.push("Registry path detected (HKLM:/HKCU:)".into());
    }
    if command.contains("Invoke-Expression") || command.contains("iex ") {
        warnings.push("Invoke-Expression detected — dynamic code execution".into());
    }
    if command.contains("-ExecutionPolicy Bypass") {
        warnings.push("ExecutionPolicy Bypass — execution policy is being bypassed".into());
    }
    warnings
}

/// Locate a PowerShell interpreter on PATH. Returns the first match.
pub fn find_interpreter() -> Option<String> {
    for candidate in ["pwsh", "powershell.exe", "powershell"] {
        if let Ok(out) = std::process::Command::new("which").arg(candidate).output() {
            if out.status.success() {
                return Some(candidate.to_string());
            }
        }
        // Windows: try `where` instead.
        if let Ok(out) = std::process::Command::new("where").arg(candidate).output() {
            if out.status.success() {
                return Some(candidate.to_string());
            }
        }
    }
    None
}

/// Execute a PowerShell command and capture stdout/stderr/exit.
///
/// In `safe_mode`, the command is checked for destructive verbs first; if any
/// are found, returns an error WITHOUT executing.
pub fn execute(req: &PowerShellRequest) -> Result<PowerShellResult> {
    let warnings = safety_check(&req.command);
    if req.safe_mode && !warnings.is_empty() {
        anyhow::bail!(
            "PowerShell command blocked by safe_mode. Concerns: {}",
            warnings.join(", ")
        );
    }
    let interpreter = find_interpreter()
        .ok_or_else(|| anyhow::anyhow!("no PowerShell interpreter found on PATH (tried: pwsh, powershell.exe, powershell)"))?;
    let mut cmd = std::process::Command::new(&interpreter);
    cmd.arg("-NoProfile").arg("-NonInteractive").arg("-Command").arg(&req.command);
    if let Some(wd) = &req.working_dir {
        cmd.current_dir(wd);
    }
    let output = cmd.output()
        .with_context(|| format!("invoke {interpreter}"))?;
    Ok(PowerShellResult {
        exit_code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        interpreter,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safety_check_clean_returns_empty() {
        let warnings = safety_check("Get-Date");
        assert!(warnings.is_empty());
    }

    #[test]
    fn safety_check_remove_item_warns() {
        let warnings = safety_check("Remove-Item C:\\temp\\foo");
        assert!(!warnings.is_empty());
        assert!(warnings.iter().any(|w| w.contains("Remove-")));
    }

    #[test]
    fn safety_check_registry_path_warns() {
        let warnings = safety_check("Get-ItemProperty HKLM:\\Software\\Microsoft");
        assert!(warnings.iter().any(|w| w.contains("Registry")));
    }

    #[test]
    fn safety_check_invoke_expression_warns() {
        let warnings = safety_check("Invoke-Expression 'malicious code'");
        assert!(warnings.iter().any(|w| w.contains("Invoke-Expression")));
    }

    #[test]
    fn safety_check_execution_policy_bypass_warns() {
        let warnings = safety_check("powershell -ExecutionPolicy Bypass -File foo.ps1");
        assert!(warnings.iter().any(|w| w.contains("ExecutionPolicy Bypass")));
    }

    #[test]
    fn safe_mode_blocks_destructive_command() {
        let req = PowerShellRequest {
            command: "Remove-Item C:\\test".into(),
            working_dir: None,
            timeout_sec: 30,
            safe_mode: true,
        };
        let result = execute(&req);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("safe_mode") || err.contains("blocked"));
    }
}
