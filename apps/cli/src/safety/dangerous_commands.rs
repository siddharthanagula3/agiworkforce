/// Standalone commands that are always safe (read-only, no side effects).
pub(super) const SAFE_COMMANDS: &[&str] = &[
    "cat",
    "ls",
    "pwd",
    "head",
    "tail",
    "grep",
    "wc",
    "stat",
    "which",
    "echo",
    "file",
    // SEV-CLI-LOW-1 fix: `env` and `printenv` previously auto-approved as
    // read-only. They aren't, both dump every environment variable in the
    // process, including ANTHROPIC_API_KEY / OPENAI_API_KEY etc., into the
    // tool output that is then fed back to the model and may be persisted in
    // logs. Downgraded to Unknown so the user is prompted before running.
    "whoami",
    "uname",
    "date",
    "tree",
    "less",
    "more",
    "diff",
    "sort",
    "uniq",
    "cut",
    "tr",
    // Data inspection
    "jq",
    "od",
    "hexdump",
    "strings",
    // Binary inspection
    "ldd",
    "nm",
    "readelf",
    // System info
    "ps",
    "top",
    "df",
    "du",
    "free",
    "uptime",
    // Network info (read-only)
    "ifconfig",
    "ip",
    "hostname",
    "dig",
    "nslookup",
    "traceroute",
    "ss",
    "lsof",
    "netstat",
];

/// Multi-word command prefixes that are safe.
///
/// Build/test runners and inline interpreters intentionally stay out of this
/// list: they execute project or user-supplied code and may write artifacts.
pub(super) const SAFE_PREFIXES: &[&str] = &[];

/// Standalone commands that are dangerous (destructive, privileged).
pub const DANGEROUS_COMMANDS: &[&str] = &[
    "sudo",
    "chown",
    "chgrp",
    "kill",
    "killall",
    "pkill",
    "mkfs",
    "dd",
    "fdisk",
    "mount",
    "umount",
    "reboot",
    "shutdown",
    "rmdir",
    "eval",
    "exec",
    "mv",
    // Firewall / system services / kernel modules
    "iptables",
    "ufw",
    "systemctl",
    "service",
    "insmod",
    "modprobe",
    "rmmod",
];

/// Multi-word command prefixes that are dangerous.
pub(super) const DANGEROUS_PREFIXES: &[&str] = &[
    "chmod 777",
    "launchctl unload",
    "git push --force",
    "git reset --hard",
    // Package manager installs (system-level side effects)
    "apt install",
    "apt remove",
    "dnf install",
    "brew install",
    "pip install",
    "npm install -g",
    "cargo install",
];

/// Commands that, when piped to a shell, make the pipeline dangerous.
pub(super) const DANGEROUS_PIPE_SOURCES: &[&str] = &["curl", "wget", "nc", "ncat", "socat"];
/// Shell commands that are dangerous when receiving piped input.
pub(super) const DANGEROUS_PIPE_SINKS: &[&str] = &[
    "sh", "bash", "zsh", "dash", "fish", "csh", "tcsh", "ksh", "python", "python3", "perl", "ruby",
    "node", "eval", "source",
];

/// `find` options that execute or delete (not read-only).
pub(super) const FIND_DANGEROUS_OPTIONS: &[&str] = &[
    "-exec", "-execdir", "-ok", "-okdir", "-delete", "-fls", "-fprint", "-fprint0", "-fprintf",
];

/// `rg` (ripgrep) options that execute external programs or access compressed data.
pub(super) const RG_DANGEROUS_OPTIONS: &[&str] = &["--pre", "--hostname-bin", "--search-zip", "-z"];

/// `base64` options that write to files.
pub(super) const BASE64_DANGEROUS_OPTIONS: &[&str] = &["-o", "--output"];

/// Read-only git subcommands.
pub(super) const GIT_SAFE_SUBCOMMANDS: &[&str] = &["status", "log", "diff", "show"];

/// Read-only git branch flags.
pub(super) const GIT_BRANCH_READONLY_FLAGS: &[&str] = &[
    "--list",
    "-l",
    "--show-current",
    "-a",
    "-r",
    "-v",
    "--verbose",
];

/// Git global options that take a value and should be skipped to find the subcommand.
pub(super) const GIT_GLOBAL_OPTIONS_WITH_VALUE: &[&str] =
    &["-C", "--git-dir", "--work-tree", "--namespace"];

/// Flags that turn a repository's own git hooks off.
///
/// Bypassing them is its own approval category. The hooks are the checks the
/// repository runs on every commit, push or rewrite, and a command that skips
/// them is not the command a user allowed when they allowed the command it
/// rides on: `git commit` and `git commit --no-verify` differ by every check
/// the repository owns.
pub const GIT_HOOK_BYPASS_FLAGS: &[&str] = &["--no-verify", "--no-post-rewrite"];

/// The config key that relocates the hook directory. Pointing it at an empty
/// path is a hook bypass with no flag in sight.
const GIT_HOOKS_PATH_CONFIG_PREFIX: &str = "core.hookspath=";

/// True when the command turns the repository's hooks off, by flag or by
/// config override.
pub fn bypasses_git_hooks(command: &str) -> bool {
    command.split_whitespace().any(|token| {
        GIT_HOOK_BYPASS_FLAGS.contains(&token)
            || token
                .trim_start_matches("--config=")
                .to_ascii_lowercase()
                .starts_with(GIT_HOOKS_PATH_CONFIG_PREFIX)
    })
}

/// What a person is being asked to allow when a command bypasses the hooks.
pub fn git_hook_bypass_reason() -> &'static str {
    "This runs git with the repository's hooks turned off, so the checks it runs on every commit, \
     push or rewrite are skipped."
}

/// `mv` targeting these is dangerous.
pub(super) const SYSTEM_PATHS: &[&str] = &[
    "/bin", "/sbin", "/usr", "/etc", "/var", "/System", "/Library", "/boot", "/dev", "/proc",
    "/sys", "/opt",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hook_bypass_is_recognised_by_flag_and_by_config() {
        assert!(bypasses_git_hooks("git commit --no-verify -m wip"));
        assert!(bypasses_git_hooks("git push --no-verify origin main"));
        assert!(bypasses_git_hooks("git rebase --no-verify main"));
        assert!(bypasses_git_hooks("git commit --amend --no-post-rewrite"));
        assert!(bypasses_git_hooks(
            "git -c core.hooksPath=/dev/null commit -m wip"
        ));
        assert!(bypasses_git_hooks(
            "git --config=core.hookspath= commit -m wip"
        ));
    }

    #[test]
    fn an_ordinary_git_command_does_not_read_as_a_hook_bypass() {
        assert!(!bypasses_git_hooks("git commit -m 'no verify needed'"));
        assert!(!bypasses_git_hooks("git status --short"));
        assert!(!bypasses_git_hooks("git -c core.pager=cat log"));
    }

    #[test]
    fn the_bypass_reason_names_what_is_skipped() {
        assert!(git_hook_bypass_reason().contains("hooks turned off"));
    }
}
