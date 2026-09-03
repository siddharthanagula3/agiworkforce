
#![cfg(target_os = "linux")]
#![allow(dead_code)]

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
        return vec![];
    }
    let mut allow: Vec<&'static str> = vec![
        "read",
        "write",
        "close",
        "fstat",
        "lseek",
        "mmap",
        "mprotect",
        "munmap",
        "brk",
        "rt_sigaction",
        "rt_sigprocmask",
        "rt_sigreturn",
        "ioctl",
        "sched_yield",
        "mremap",
        "msync",
        "mincore",
        "madvise",
        "shmget",
        "shmat",
        "shmctl",
        "dup",
        "nanosleep",
        "getpid",
        "exit",
        "exit_group",
        "wait4",
        "kill",
        "uname",
        "fcntl",
        "flock",
        "fsync",
        "fdatasync",
        "truncate",
        "ftruncate",
        "getdents64",
        "getcwd",
        "readlinkat",
        "fchdir",
        "chdir",
        "openat",
        "faccessat",
        "getuid",
        "getgid",
        "geteuid",
        "getegid",
        "setpgid",
        "getppid",
        "rt_sigpending",
        "rt_sigtimedwait",
        "sigaltstack",
        "futex",
        "set_tid_address",
        "epoll_create1",
        "epoll_pwait",
        "epoll_ctl",
        "tgkill",
        "clock_gettime",
        "clock_getres",
        "clock_nanosleep",
        "set_robust_list",
        "prlimit64",
        "newfstatat",
        "statx",
    ];
    // Legacy syscalls that exist on x86_64 but were removed on aarch64. Keeping
    // them satisfies x86_64 glibc/musl callers that still use the legacy forms;
    // aarch64 relies on the `*at`/`*2`/`*64` variants in the base set above.
    #[cfg(target_arch = "x86_64")]
    allow.extend([
        "access",
        "pipe",
        "select",
        "dup2",
        "pause",
        "sendfile",
        "getdents",
        "readlink",
        "stat",
        "lstat",
        "open",
        "getpgrp",
        "epoll_create",
        "epoll_wait",
    ]);
    if !matches!(preset, LinuxSandboxPreset::ReadOnly) {
        allow.extend(["execve", "clone", "rt_sigsuspend", "pipe2", "socketpair"]);
        // `fork`/`vfork` exist on x86_64 but not aarch64 (which uses `clone`).
        #[cfg(target_arch = "x86_64")]
        allow.extend(["fork", "vfork"]);
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
    if !cfg!(feature = "linux-seccomp") {
        return false;
    }
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
        if nr < 0 {
            // A syscall in the allow-list has no number mapping for the target
            // architecture. Fail loudly instead of silently dropping it from the
            // compiled filter (which would EACCES/kill sandboxed children on an
            // operation the allow-list claims to permit). If a future allow-list
            // entry is genuinely unavailable on this arch, it must be cfg-gated
            // out of `allowed_syscalls` rather than left unmapped here.
            anyhow::bail!(
                "seccomp allow-list syscall {name:?} has no number mapping for this architecture"
            );
        }
        rules.insert(nr, vec![]);
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
        anyhow::bail!(
            "prctl(PR_SET_NO_NEW_PRIVS) failed: {}",
            std::io::Error::last_os_error()
        );
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

/// Map every syscall name in `allowed_syscalls` to its libc number for the
/// target architecture. Returns `-1` only for a name that has no mapping here;
/// `compile_bpf` treats that as a hard error rather than silently dropping the
/// syscall from the filter. Architecture-divergent legacy syscalls are gated to
/// the architectures where libc actually defines them (matching the cfg-gated
/// entries in `allowed_syscalls`).
#[cfg(all(target_os = "linux", feature = "linux-seccomp"))]
fn syscall_number_for(name: &str) -> i64 {
    match name {
        // --- Portable across x86_64 + aarch64 ---
        "read" => libc::SYS_read,
        "write" => libc::SYS_write,
        "close" => libc::SYS_close,
        "fstat" => libc::SYS_fstat,
        "lseek" => libc::SYS_lseek,
        "mmap" => libc::SYS_mmap,
        "mprotect" => libc::SYS_mprotect,
        "munmap" => libc::SYS_munmap,
        "brk" => libc::SYS_brk,
        "rt_sigaction" => libc::SYS_rt_sigaction,
        "rt_sigprocmask" => libc::SYS_rt_sigprocmask,
        "rt_sigreturn" => libc::SYS_rt_sigreturn,
        "rt_sigpending" => libc::SYS_rt_sigpending,
        "rt_sigtimedwait" => libc::SYS_rt_sigtimedwait,
        "rt_sigsuspend" => libc::SYS_rt_sigsuspend,
        "sigaltstack" => libc::SYS_sigaltstack,
        "ioctl" => libc::SYS_ioctl,
        "sched_yield" => libc::SYS_sched_yield,
        "mremap" => libc::SYS_mremap,
        "msync" => libc::SYS_msync,
        "mincore" => libc::SYS_mincore,
        "madvise" => libc::SYS_madvise,
        "shmget" => libc::SYS_shmget,
        "shmat" => libc::SYS_shmat,
        "shmctl" => libc::SYS_shmctl,
        "dup" => libc::SYS_dup,
        "nanosleep" => libc::SYS_nanosleep,
        "getpid" => libc::SYS_getpid,
        "exit" => libc::SYS_exit,
        "exit_group" => libc::SYS_exit_group,
        "wait4" => libc::SYS_wait4,
        "kill" => libc::SYS_kill,
        "uname" => libc::SYS_uname,
        "fcntl" => libc::SYS_fcntl,
        "flock" => libc::SYS_flock,
        "fsync" => libc::SYS_fsync,
        "fdatasync" => libc::SYS_fdatasync,
        "truncate" => libc::SYS_truncate,
        "ftruncate" => libc::SYS_ftruncate,
        "getdents64" => libc::SYS_getdents64,
        "getcwd" => libc::SYS_getcwd,
        "readlinkat" => libc::SYS_readlinkat,
        "fchdir" => libc::SYS_fchdir,
        "chdir" => libc::SYS_chdir,
        "openat" => libc::SYS_openat,
        "faccessat" => libc::SYS_faccessat,
        "getuid" => libc::SYS_getuid,
        "getgid" => libc::SYS_getgid,
        "geteuid" => libc::SYS_geteuid,
        "getegid" => libc::SYS_getegid,
        "setpgid" => libc::SYS_setpgid,
        "getppid" => libc::SYS_getppid,
        "futex" => libc::SYS_futex,
        "set_tid_address" => libc::SYS_set_tid_address,
        "set_robust_list" => libc::SYS_set_robust_list,
        "epoll_create1" => libc::SYS_epoll_create1,
        "epoll_pwait" => libc::SYS_epoll_pwait,
        "epoll_ctl" => libc::SYS_epoll_ctl,
        "tgkill" => libc::SYS_tgkill,
        "clock_gettime" => libc::SYS_clock_gettime,
        "clock_getres" => libc::SYS_clock_getres,
        "clock_nanosleep" => libc::SYS_clock_nanosleep,
        "prlimit64" => libc::SYS_prlimit64,
        "newfstatat" => libc::SYS_newfstatat,
        "statx" => libc::SYS_statx,
        "execve" => libc::SYS_execve,
        "clone" => libc::SYS_clone,
        "pipe2" => libc::SYS_pipe2,
        "socketpair" => libc::SYS_socketpair,

        // --- x86_64-only legacy syscalls (removed on aarch64) ---
        #[cfg(target_arch = "x86_64")]
        "access" => libc::SYS_access,
        #[cfg(target_arch = "x86_64")]
        "pipe" => libc::SYS_pipe,
        #[cfg(target_arch = "x86_64")]
        "select" => libc::SYS_select,
        #[cfg(target_arch = "x86_64")]
        "dup2" => libc::SYS_dup2,
        #[cfg(target_arch = "x86_64")]
        "pause" => libc::SYS_pause,
        #[cfg(target_arch = "x86_64")]
        "sendfile" => libc::SYS_sendfile,
        #[cfg(target_arch = "x86_64")]
        "getdents" => libc::SYS_getdents,
        #[cfg(target_arch = "x86_64")]
        "readlink" => libc::SYS_readlink,
        #[cfg(target_arch = "x86_64")]
        "stat" => libc::SYS_stat,
        #[cfg(target_arch = "x86_64")]
        "lstat" => libc::SYS_lstat,
        #[cfg(target_arch = "x86_64")]
        "open" => libc::SYS_open,
        #[cfg(target_arch = "x86_64")]
        "getpgrp" => libc::SYS_getpgrp,
        #[cfg(target_arch = "x86_64")]
        "epoll_create" => libc::SYS_epoll_create,
        #[cfg(target_arch = "x86_64")]
        "epoll_wait" => libc::SYS_epoll_wait,
        #[cfg(target_arch = "x86_64")]
        "fork" => libc::SYS_fork,
        #[cfg(target_arch = "x86_64")]
        "vfork" => libc::SYS_vfork,

        _ => -1,
    }
}

// Fail closed when seccomp support is not compiled in.
#[cfg(all(target_os = "linux", not(feature = "linux-seccomp")))]
pub fn install_filter(_opts: &LinuxSandboxOptions) -> anyhow::Result<()> {
    anyhow::bail!(
        "Linux seccomp sandbox is not available in this build (missing linux-seccomp feature)"
    )
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
        // `newfstatat` is the architecture-portable stat syscall (the legacy
        // `stat` is only present on x86_64).
        assert!(allow.contains(&"newfstatat"));
        assert!(!allow.contains(&"execve"));
    }

    #[test]
    fn allowlist_has_no_duplicate_syscall_names() {
        for preset in [LinuxSandboxPreset::ReadOnly, LinuxSandboxPreset::Contained] {
            let allow = allowed_syscalls(preset);
            let mut seen = std::collections::BTreeSet::new();
            for name in &allow {
                assert!(
                    seen.insert(*name),
                    "duplicate syscall {name:?} in {preset:?} allow-list"
                );
            }
        }
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
        let opts = LinuxSandboxOptions {
            preset: LinuxSandboxPreset::Contained,
            allow_network: true,
        };
        let desc = describe_filter(&opts);
        assert!(desc.contains("Contained"));
        assert!(desc.contains("network=yes"));
    }

    #[test]
    fn is_available_does_not_panic() {
        let _ = is_available();
    }
}
