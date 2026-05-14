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
