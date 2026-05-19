//! AUDIT-FIX: CI-4 — centralized blocked-path denylist.
//! Every fs-touching tool (file_ops, listing, search) MUST call `is_blocked` before
//! reading/writing/listing. New entries go here, not in per-tool files.

use std::path::Path;

const BLOCKED_PATH_SUBSTRINGS: &[&str] = &[
    // Secrets / credentials
    ".ssh/",
    ".aws/credentials",
    ".aws/config",
    ".gnupg/",
    ".docker/config.json",
    ".npmrc",
    ".pypirc",
    ".kube/config",
    ".netrc",
    // Browser secrets
    "Cookies",
    "Login Data",
    "Web Data",
    // Shell histories
    ".bash_history",
    ".zsh_history",
    ".python_history",
    ".node_repl_history",
    // OS-level
    "/etc/shadow",
    "/etc/sudoers",
];

pub fn is_blocked(path: &Path) -> bool {
    let p = path.to_string_lossy();
    BLOCKED_PATH_SUBSTRINGS.iter().any(|s| p.contains(s))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn blocks_ssh_keys() {
        assert!(is_blocked(Path::new("/Users/x/.ssh/id_rsa")));
    }
    #[test]
    fn blocks_aws_creds() {
        assert!(is_blocked(Path::new("/Users/x/.aws/credentials")));
    }
    #[test]
    fn allows_workspace_files() {
        assert!(!is_blocked(Path::new("/Users/x/proj/src/main.rs")));
    }
}
