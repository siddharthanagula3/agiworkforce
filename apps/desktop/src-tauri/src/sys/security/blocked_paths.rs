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

pub(crate) fn comparison_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    let windows_path = cfg!(windows)
        || value.starts_with("\\\\")
        || value.starts_with("//")
        || value.as_bytes().get(1) == Some(&b':');
    if !windows_path {
        return value.into_owned();
    }
    let normalized = value.replace('\\', "/").to_lowercase();
    if let Some(unc) = normalized.strip_prefix("//?/unc/") {
        format!("//{unc}")
    } else {
        normalized
            .strip_prefix("//?/")
            .unwrap_or(&normalized)
            .to_owned()
    }
}

pub(crate) fn path_is_within(path: &Path, root: &Path) -> bool {
    let path = comparison_path(path);
    let root = comparison_path(root);
    let root = if root == "/" {
        root.as_str()
    } else {
        root.trim_end_matches('/')
    };
    path == root
        || path
            .strip_prefix(root)
            .is_some_and(|tail| root.ends_with('/') || tail.starts_with('/'))
}

pub fn is_blocked(path: &Path) -> bool {
    let p = comparison_path(path);
    let windows_path = cfg!(windows) || p.starts_with("//") || p.as_bytes().get(1) == Some(&b':');
    BLOCKED_PATH_SUBSTRINGS.iter().any(|pattern| {
        if windows_path {
            p.contains(&pattern.to_lowercase())
        } else {
            p.contains(pattern)
        }
    })
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

#[cfg(test)]
mod windows_comparison_tests {
    use super::*;

    #[test]
    fn ordinary_and_verbatim_windows_paths_share_component_boundaries() {
        for path in [
            r"C:\Windows\System32\cmd.exe",
            r"\\?\c:\WINDOWS\system32\cmd.exe",
            "C:/WINDOWS/System32/cmd.exe",
        ] {
            assert!(
                path_is_within(Path::new(path), Path::new(r"C:\Windows\System32")),
                "{path}"
            );
        }
        assert!(!path_is_within(
            Path::new(r"\\?\C:\Windows\System32-backup\file"),
            Path::new(r"C:\Windows\System32")
        ));
        assert!(path_is_within(
            Path::new(r"\\?\UNC\server\share\folder\file"),
            Path::new(r"\\SERVER\SHARE\folder")
        ));
        assert!(!path_is_within(
            Path::new(r"\\?\UNC\server\share-other\folder"),
            Path::new(r"\\server\share")
        ));
    }

    #[test]
    fn windows_secret_paths_block_alternate_separators_and_case() {
        for path in [
            r"\\?\C:\Users\user\.SSH\id_rsa",
            "C:/Users/user/.Aws/CREDENTIALS",
            r"C:\Users\user\.docker\CONFIG.JSON",
        ] {
            assert!(is_blocked(Path::new(path)), "{path}");
        }
        assert!(!is_blocked(Path::new(r"C:\Users\user\.ssh-backup\readme")));
    }
}
