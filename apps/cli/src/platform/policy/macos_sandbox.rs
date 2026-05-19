//! macOS Seatbelt sandbox profile builder + Command wrapper.
//!
//! Wraps a child process with `sandbox-exec -p <profile>` on macOS. The
//! profile string is built dynamically from a `SandboxProfile` struct so
//! callers can compose (allow read of workspace + allow network only when
//! requested).
//!
//! Ported clean-room from gemini-cli's MacOsSandboxManager (Apache 2.0).
//! Behind `cfg(target_os = "macos")`.

// cfg(target_os = "macos") declared at policy/mod.rs module gate
#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug)]
pub enum SandboxError {
    InvalidPath(String),
}

impl std::fmt::Display for SandboxError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SandboxError::InvalidPath(p) => write!(f, "Refusing unsafe SBPL path: {}", p),
        }
    }
}

impl std::error::Error for SandboxError {}

// AUDIT-FIX: C-8 — refuse paths whose characters would break out of the SBPL string literal.
fn sbpl_quote(p: &Path) -> Result<String, SandboxError> {
    let s = p
        .to_str()
        .ok_or_else(|| SandboxError::InvalidPath(p.display().to_string()))?;
    for c in s.chars() {
        if c == '"' || c == '\\' || (c as u32) < 0x20 {
            return Err(SandboxError::InvalidPath(p.display().to_string()));
        }
    }
    Ok(format!("\"{}\"", s))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SandboxPreset {
    /// Allow file read inside workspace + temp + home-config; deny all writes outside workspace; deny network.
    ReadOnly,
    /// ReadOnly + writes inside workspace; deny network unless requested.
    Contained,
    /// No restrictions. Equivalent to no sandbox.
    Unrestricted,
}

#[derive(Debug, Clone)]
pub struct SandboxOptions {
    pub preset: SandboxPreset,
    pub workspace: PathBuf,
    pub allow_network: bool,
    pub extra_allowed_paths: Vec<PathBuf>,
}

/// Build the Seatbelt profile string. The format is the `tinyscheme`-style
/// rules accepted by `sandbox-exec -p <profile>`.
pub fn build_profile(opts: &SandboxOptions) -> Result<String, SandboxError> {
    if matches!(opts.preset, SandboxPreset::Unrestricted) {
        return Ok("(version 1)(allow default)".into());
    }
    let ws_q = sbpl_quote(&opts.workspace)?; // AUDIT-FIX: C-8
    let mut p = String::new();
    p.push_str("(version 1)\n");
    p.push_str("(deny default)\n");
    p.push_str("(allow process-fork)\n");
    p.push_str("(allow process-exec)\n");
    p.push_str("(allow signal (target same-sandbox))\n");
    p.push_str("(allow sysctl-read)\n");
    p.push_str("(allow mach-lookup)\n");
    p.push_str("(allow ipc-posix-shm)\n");
    p.push_str("(allow file-read-metadata)\n");
    p.push_str(&format!("(allow file-read* (subpath {}))\n", ws_q)); // AUDIT-FIX: C-8
    for extra in &opts.extra_allowed_paths {
        let q = sbpl_quote(extra)?; // AUDIT-FIX: C-8
        p.push_str(&format!("(allow file-read* (subpath {}))\n", q));
    }
    p.push_str("(allow file-read* (subpath \"/usr\"))\n");
    p.push_str("(allow file-read* (subpath \"/System\"))\n");
    p.push_str("(allow file-read* (subpath \"/Library\"))\n");
    p.push_str("(allow file-read* (subpath \"/private/etc\"))\n");
    p.push_str("(allow file-read* (literal \"/dev/null\"))\n");
    p.push_str("(allow file-read* (literal \"/dev/urandom\"))\n");
    p.push_str("(allow file-read* file-write* (subpath \"/private/tmp\"))\n");
    p.push_str("(allow file-read* file-write* (subpath \"/private/var/folders\"))\n");

    if matches!(opts.preset, SandboxPreset::Contained) {
        p.push_str(&format!("(allow file-write* (subpath {}))\n", ws_q)); // AUDIT-FIX: C-8
    }

    if opts.allow_network {
        p.push_str("(allow network*)\n");
    }
    Ok(p)
}

/// Wrap a Command to run under `sandbox-exec -p <profile>`. The wrapped
/// command preserves args + env + cwd; the profile is passed inline via
/// `-p`. (The longer-form `-f <file>` path can be added later.)
pub fn wrap_command(opts: &SandboxOptions, inner: Command) -> Result<Command, SandboxError> {
    let profile = build_profile(opts)?; // AUDIT-FIX: C-8
    let mut cmd = Command::new("sandbox-exec");
    cmd.arg("-p").arg(profile);
    cmd.arg(inner.get_program());
    for a in inner.get_args() {
        cmd.arg(a);
    }
    for (k, v) in inner.get_envs() {
        match v {
            Some(val) => { cmd.env(k, val); }
            None => { cmd.env_remove(k); }
        }
    }
    if let Some(cwd) = inner.get_current_dir() {
        cmd.current_dir(cwd);
    }
    Ok(cmd)
}

/// Verify sandbox-exec is on PATH. Useful for /doctor.
pub fn is_available() -> bool {
    std::process::Command::new("which")
        .arg("sandbox-exec")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn opts(preset: SandboxPreset) -> SandboxOptions {
        SandboxOptions {
            preset,
            workspace: PathBuf::from("/Users/test/work"),
            allow_network: false,
            extra_allowed_paths: vec![],
        }
    }

    #[test]
    fn unrestricted_profile_is_allow_default() {
        let p = build_profile(&opts(SandboxPreset::Unrestricted)).unwrap();
        assert!(p.contains("(allow default)"));
    }

    #[test]
    fn readonly_denies_default_and_blocks_writes() {
        let p = build_profile(&opts(SandboxPreset::ReadOnly)).unwrap();
        assert!(p.contains("(deny default)"));
        assert!(p.contains("file-read*"));
        assert!(!p.contains(&format!("(allow file-write* (subpath \"/Users/test/work\"))")));
    }

    #[test]
    fn contained_allows_workspace_writes() {
        let p = build_profile(&opts(SandboxPreset::Contained)).unwrap();
        assert!(p.contains(&format!("(allow file-write* (subpath \"/Users/test/work\"))")));
    }

    #[test]
    fn network_gate_off_by_default() {
        let p = build_profile(&opts(SandboxPreset::Contained)).unwrap();
        assert!(!p.contains("(allow network*)"));
    }

    #[test]
    fn network_gate_on_when_requested() {
        let mut o = opts(SandboxPreset::Contained);
        o.allow_network = true;
        let p = build_profile(&o).unwrap();
        assert!(p.contains("(allow network*)"));
    }

    #[test]
    fn extra_allowed_paths_appear_in_profile() {
        let mut o = opts(SandboxPreset::ReadOnly);
        o.extra_allowed_paths.push(PathBuf::from("/Users/test/shared"));
        let p = build_profile(&o).unwrap();
        assert!(p.contains("/Users/test/shared"));
    }

    #[test]
    fn wrap_command_invokes_sandbox_exec() {
        let mut inner = std::process::Command::new("/bin/echo");
        inner.arg("hello");
        let wrapped = wrap_command(&opts(SandboxPreset::ReadOnly), inner).unwrap();
        assert_eq!(wrapped.get_program(), "sandbox-exec");
    }

    #[test]
    fn sbpl_injection_rejected() {
        let mut o = opts(SandboxPreset::ReadOnly);
        o.workspace = PathBuf::from("/tmp/\")(allow default)(deny");
        assert!(build_profile(&o).is_err());
    }
}
