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
    // read-only. They aren't — both dump every environment variable in the
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
    "tee",
    // Data inspection
    "jq",
    "awk",
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

/// Multi-word command prefixes that are safe (e.g. "cargo check").
pub(super) const SAFE_PREFIXES: &[&str] = &[
    "cargo check",
    "cargo test",
    "npm test",
    "python -c",
    "node -e",
];

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

/// `mv` targeting these is dangerous.
pub(super) const SYSTEM_PATHS: &[&str] = &[
    "/bin", "/sbin", "/usr", "/etc", "/var", "/System", "/Library", "/boot", "/dev", "/proc",
    "/sys", "/opt",
];
