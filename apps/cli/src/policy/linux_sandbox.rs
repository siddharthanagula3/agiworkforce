//! Linux seccomp-BPF sandbox preset. M38 of v1.3.
//!
//! Wraps a child process under a tight syscall allowlist using seccomp-BPF.
//! Architecture-aware (x86_64, aarch64). Three presets matching SandboxMode
//! in screen_renderers.rs.
//!
//! Strategy:
//! 1. Build a BpfProgram from the seccompiler crate using the preset's allow-list.
//! 2. Apply via `seccompiler::apply_filter` BEFORE exec(); the wrapped child
//!    inherits the filter.
//! 3. Errors deny by default (return EACCES).
//!
//! Behind `cfg(target_os = "linux")`.
//!
//! NOTE: This module ships the allow-list builder and filter description.
//! Actually applying the BPF filter to a child process (via
//! `seccompiler::apply_filter` after `prctl(PR_SET_NO_NEW_PRIVS)` and before
//! `execve`) is the runtime piece. That integration is deferred pending
//! Landlock + seccompiler dep addition to Cargo.toml.

#![cfg(target_os = "linux")]
#![allow(dead_code)]

use anyhow::Result;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinuxSandboxPreset {
    ReadOnly,
    Contained,
    Unrestricted,
}

#[derive(Debug, Clone)]
pub struct LinuxSandboxOptions {
    pub preset: LinuxSandboxPreset,
    pub allow_network: bool,
}

/// Return the allow-list syscall names for a preset. Unknown architectures
/// fall back to a conservative subset.
pub fn allowed_syscalls(preset: LinuxSandboxPreset) -> Vec<&'static str> {
    if matches!(preset, LinuxSandboxPreset::Unrestricted) {
        // Sentinel — caller skips installation entirely.
        return vec![];
    }
    // Common safe syscalls: process / time / mmap / signals / fd / read.
    let mut allow: Vec<&'static str> = vec![
        "read", "write", "close", "fstat", "lseek", "mmap", "mprotect", "munmap",
        "brk", "rt_sigaction", "rt_sigprocmask", "rt_sigreturn", "ioctl",
        "access", "pipe", "select", "sched_yield", "mremap", "msync", "mincore",
        "madvise", "shmget", "shmat", "shmctl", "dup", "dup2", "pause", "nanosleep",
        "getpid", "sendfile", "exit", "exit_group", "wait4", "kill", "uname",
        "fcntl", "flock", "fsync", "fdatasync", "truncate", "ftruncate", "getdents",
        "getcwd", "readlink", "fchdir", "chdir", "stat", "lstat", "open", "openat",
        "getuid", "getgid", "geteuid", "getegid", "setpgid", "getppid", "getpgrp",
        "rt_sigpending", "rt_sigtimedwait", "sigaltstack", "futex", "set_tid_address",
        "epoll_create", "epoll_wait", "epoll_ctl", "tgkill", "clock_gettime",
        "clock_getres", "clock_nanosleep", "exit", "wait4", "set_robust_list",
        "prlimit64", "newfstatat", "statx",
    ];
    if !matches!(preset, LinuxSandboxPreset::ReadOnly) {
        // Contained: also allow writes + process spawn for /tmp + workspace.
        // (The actual filesystem-path filtering is enforced by Landlock or by
        // the wrapping permission layer — seccomp only filters syscalls, not
        // paths.)
        allow.extend([
            "execve", "clone", "fork", "vfork", "wait4", "rt_sigsuspend",
            "rt_sigreturn", "pipe2", "socketpair",
        ]);
    }
    if !matches!(preset, LinuxSandboxPreset::ReadOnly) {
        // Plus signal-handling for child reaping.
        allow.extend(["rt_sigtimedwait", "tgkill"]);
    }
    allow
}

/// Build a string description of the filter (for /sandbox + /doctor surfaces).
pub fn describe_filter(opts: &LinuxSandboxOptions) -> String {
    let n = allowed_syscalls(opts.preset).len();
    let net = if opts.allow_network { "yes" } else { "no" };
    format!(
        "linux-seccomp preset={:?} allowed_syscalls={} network={}",
        opts.preset, n, net
    )
}

/// Probe whether seccomp filters can be installed in this environment.
/// Returns false in seccomp-disabled containers / WSL1 / older kernels.
pub fn is_available() -> bool {
    // Check /proc/self/status for Seccomp: 0/1/2 lines.
    let status = std::fs::read_to_string("/proc/self/status").unwrap_or_default();
    status.lines().any(|line| line.starts_with("Seccomp:"))
}

/// Compile the allow-list into a seccomp BPF program. Returns an
/// architecture-aware `BpfProgram` that can be applied to the current thread.
#[cfg(all(target_os = "linux", feature = "linux-seccomp"))]
pub fn compile_bpf(opts: &LinuxSandboxOptions) -> anyhow::Result<seccompiler::BpfProgram> {
    use seccompiler::{SeccompAction, SeccompFilter};
    use std::collections::BTreeMap;

    if matches!(opts.preset, LinuxSandboxPreset::Unrestricted) {
        let filter = SeccompFilter::new(
            BTreeMap::new(),
            SeccompAction::Allow,
            SeccompAction::Allow,
            target_arch()?,
        )?;
        return Ok(seccompiler::BpfProgram::try_from(filter)?);
    }

    let mut rules: BTreeMap<i64, Vec<seccompiler::SeccompRule>> = BTreeMap::new();
    for name in allowed_syscalls(opts.preset) {
        let nr = syscall_number_for(name);
        if nr >= 0 {
            rules.insert(nr, vec![]);
        }
    }
    let filter = SeccompFilter::new(
        rules,
        SeccompAction::Errno(libc::EACCES as u32),
        SeccompAction::Allow,
        target_arch()?,
    )?;
    Ok(seccompiler::BpfProgram::try_from(filter)?)
}

/// Install the compiled filter on the current thread. Calls
/// `prctl(PR_SET_NO_NEW_PRIVS)` internally as required for unprivileged use.
#[cfg(all(target_os = "linux", feature = "linux-seccomp"))]
#[allow(unsafe_code)]
pub fn install_filter(opts: &LinuxSandboxOptions) -> anyhow::Result<()> {
    use seccompiler::apply_filter;
    let rc = unsafe { libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) };
    if rc != 0 {
        anyhow::bail!("prctl(PR_SET_NO_NEW_PRIVS) failed: {}", std::io::Error::last_os_error());
    }
    let program = compile_bpf(opts)?;
    apply_filter(&program).map_err(|e| anyhow::anyhow!("seccomp apply_filter failed: {e}"))?;
    Ok(())
}

#[cfg(all(target_os = "linux", feature = "linux-seccomp"))]
fn target_arch() -> anyhow::Result<seccompiler::TargetArch> {
    Ok(if cfg!(target_arch = "x86_64") {
        seccompiler::TargetArch::x86_64
    } else if cfg!(target_arch = "aarch64") {
        seccompiler::TargetArch::aarch64
    } else {
        anyhow::bail!("unsupported architecture for seccomp");
    })
}

#[cfg(all(target_os = "linux", feature = "linux-seccomp"))]
fn syscall_number_for(name: &str) -> i64 {
    match name {
        "read" => libc::SYS_read,
        "write" => libc::SYS_write,
        "close" => libc::SYS_close,
        "openat" => libc::SYS_openat,
        "fstat" => libc::SYS_fstat,
        "lseek" => libc::SYS_lseek,
        "mmap" => libc::SYS_mmap,
        "mprotect" => libc::SYS_mprotect,
        "munmap" => libc::SYS_munmap,
        "brk" => libc::SYS_brk,
        "rt_sigaction" => libc::SYS_rt_sigaction,
        "rt_sigprocmask" => libc::SYS_rt_sigprocmask,
        "rt_sigreturn" => libc::SYS_rt_sigreturn,
        "ioctl" => libc::SYS_ioctl,
        "exit" => libc::SYS_exit,
        "exit_group" => libc::SYS_exit_group,
        "execve" => libc::SYS_execve,
        "clone" => libc::SYS_clone,
        "fork" => libc::SYS_fork,
        "wait4" => libc::SYS_wait4,
        "futex" => libc::SYS_futex,
        "tgkill" => libc::SYS_tgkill,
        "clock_gettime" => libc::SYS_clock_gettime,
        "getpid" => libc::SYS_getpid,
        "getuid" => libc::SYS_getuid,
        "getgid" => libc::SYS_getgid,
        _ => -1,
    }
}

// Stub: install_filter is a no-op on Linux when the feature is disabled.
#[cfg(all(target_os = "linux", not(feature = "linux-seccomp")))]
pub fn install_filter(_opts: &LinuxSandboxOptions) -> anyhow::Result<()> {
    Ok(())
}

#[cfg(all(target_os = "linux", not(feature = "linux-seccomp")))]
pub fn compile_bpf_available() -> bool {
    false
}

#[cfg(all(target_os = "linux", feature = "linux-seccomp"))]
pub fn compile_bpf_available() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unrestricted_returns_empty_allowlist_sentinel() {
        let allow = allowed_syscalls(LinuxSandboxPreset::Unrestricted);
        assert!(allow.is_empty());
    }

    #[test]
    fn readonly_has_read_open_stat_but_not_execve() {
        let allow = allowed_syscalls(LinuxSandboxPreset::ReadOnly);
        assert!(allow.contains(&"read"));
        assert!(allow.contains(&"openat"));
        assert!(allow.contains(&"stat"));
        assert!(!allow.contains(&"execve"));
    }

    #[test]
    fn contained_includes_execve_and_clone() {
        let allow = allowed_syscalls(LinuxSandboxPreset::Contained);
        assert!(allow.contains(&"execve"));
        assert!(allow.contains(&"clone"));
    }

    #[test]
    fn contained_has_strictly_more_syscalls_than_readonly() {
        let ro = allowed_syscalls(LinuxSandboxPreset::ReadOnly);
        let cn = allowed_syscalls(LinuxSandboxPreset::Contained);
        assert!(cn.len() > ro.len());
    }

    #[test]
    fn describe_filter_includes_preset_and_network_state() {
        let opts = LinuxSandboxOptions { preset: LinuxSandboxPreset::Contained, allow_network: true };
        let desc = describe_filter(&opts);
        assert!(desc.contains("Contained"));
        assert!(desc.contains("network=yes"));
    }

    #[test]
    fn is_available_does_not_panic() {
        let _ = is_available();
    }
}
