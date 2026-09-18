use std::path::{Path, PathBuf};

/// What a trust grant is keyed by. A remote-derived identity survives the
/// checkout moving or being cloned again; a path identity is the fallback for a
/// repository with no remote and for a plain directory.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdentityKind {
    Remote,
    Path,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceIdentity {
    pub key: String,
    pub kind: IdentityKind,
    pub root: PathBuf,
}

impl WorkspaceIdentity {
    pub fn describe(&self) -> String {
        match self.kind {
            IdentityKind::Remote => format!("repository {}", self.key),
            IdentityKind::Path => format!("directory {}", self.root.display()),
        }
    }
}

/// Reduce a git remote URL to a transport- and credential-independent key, so
/// `git@host:o/r.git`, `https://user@host/o/r` and `ssh://host/o/r/` agree.
pub fn normalize_remote_url(url: &str) -> Option<String> {
    let url = url.trim();
    if url.is_empty() {
        return None;
    }
    let rest = match url.split_once("://") {
        Some((scheme, rest)) => {
            let scheme = scheme.to_ascii_lowercase();
            if scheme == "file" || !rest.contains('/') {
                return None;
            }
            rest
        }
        None => match scp_like_remote(url) {
            Some(rest) => return normalize_host_and_path(&rest),
            None => return None,
        },
    };
    normalize_host_and_path(rest)
}

/// `git@github.com:owner/repo.git`. A Windows drive letter (`C:\src\repo`) has
/// a colon too, so the host part must not be a single character.
fn scp_like_remote(url: &str) -> Option<String> {
    let (host_part, path) = url.split_once(':')?;
    let host = host_part.rsplit('@').next().unwrap_or(host_part);
    if host.len() < 2 || host.contains('/') || host.contains('\\') || path.is_empty() {
        return None;
    }
    if !host.contains('.') {
        return None;
    }
    Some(format!("{host}/{}", path.trim_start_matches('/')))
}

fn normalize_host_and_path(rest: &str) -> Option<String> {
    let rest = rest.trim_start_matches('/');
    let (authority, path) = match rest.split_once('/') {
        Some((authority, path)) => (authority, path),
        None => return None,
    };
    let host = authority.rsplit('@').next().unwrap_or(authority);
    let host = host.split(':').next().unwrap_or(host).to_ascii_lowercase();
    if host.is_empty() {
        return None;
    }
    let path = path
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .trim_matches('/')
        .to_ascii_lowercase();
    if path.is_empty() {
        return None;
    }
    Some(format!("{host}/{path}"))
}

/// The identity a trust grant for `root` is stored under.
pub fn workspace_identity(root: &Path) -> WorkspaceIdentity {
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let remote = crate::repo::detect_repository_layout(&root)
        .as_ref()
        .and_then(|layout| layout.default_remote_url().map(str::to_string))
        .and_then(|url| normalize_remote_url(&url));
    match remote {
        Some(key) => WorkspaceIdentity {
            key: format!("git:{key}"),
            kind: IdentityKind::Remote,
            root,
        },
        None => {
            let key = format!("path:{}", root.to_string_lossy());
            WorkspaceIdentity {
                key,
                kind: IdentityKind::Path,
                root,
            }
        }
    }
}

/// Who is granting trust. A grant recorded by another account is not this
/// account's grant, even when both read the same registry file.
pub fn current_actor() -> String {
    for name in ["AGIWORKFORCE_TRUST_ACTOR", "USER", "LOGNAME", "USERNAME"] {
        if let Ok(value) = std::env::var(name) {
            let value = value.trim().to_string();
            if !value.is_empty() {
                return value;
            }
        }
    }
    "unknown".to_string()
}

/// The machine a grant is bound to. The device id file is read, never created:
/// a trust check must not mint identity as a side effect.
pub fn current_machine() -> String {
    if let Some(id) = device_id_file().and_then(|path| std::fs::read_to_string(path).ok()) {
        let id = id.trim().to_string();
        if crate::device_registry::is_valid_install_id(&id) {
            return id;
        }
    }
    hostname().unwrap_or_else(|| "unknown-host".to_string())
}

fn device_id_file() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".agiworkforce").join("device-id"))
}

fn hostname() -> Option<String> {
    for name in ["AGIWORKFORCE_TRUST_MACHINE", "HOSTNAME", "COMPUTERNAME"] {
        if let Ok(value) = std::env::var(name) {
            let value = value.trim().to_string();
            if !value.is_empty() {
                return Some(value);
            }
        }
    }
    std::process::Command::new("hostname")
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_transport_for_one_repository_normalizes_to_one_key() {
        let expected = Some("github.com/owner/repo".to_string());
        for url in [
            "https://github.com/owner/repo.git",
            "https://user@github.com/owner/Repo.git",
            "git@github.com:owner/repo.git",
            "ssh://git@github.com/owner/repo",
            "git://github.com/owner/repo.git/",
            "https://github.com:443/owner/repo",
        ] {
            assert_eq!(normalize_remote_url(url), expected, "{url}");
        }
    }

    #[test]
    fn a_different_host_or_repository_is_a_different_identity() {
        assert_ne!(
            normalize_remote_url("https://github.com/owner/repo"),
            normalize_remote_url("https://gitlab.com/owner/repo")
        );
        assert_ne!(
            normalize_remote_url("https://github.com/owner/repo"),
            normalize_remote_url("https://github.com/attacker/repo")
        );
    }

    #[test]
    fn local_and_malformed_remotes_have_no_remote_identity() {
        for url in [
            "",
            "   ",
            "file:///srv/git/repo.git",
            "/srv/git/repo.git",
            "C:\\src\\repo",
            "https://github.com",
        ] {
            assert_eq!(normalize_remote_url(url), None, "{url}");
        }
    }

    #[test]
    fn a_directory_without_a_remote_falls_back_to_a_path_identity() {
        let dir = tempfile::tempdir().unwrap();
        let identity = workspace_identity(dir.path());
        assert_eq!(identity.kind, IdentityKind::Path);
        assert!(identity.key.starts_with("path:"));
    }
}
