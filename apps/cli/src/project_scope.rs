use std::path::{Path, PathBuf};

/// Resolve the path that should represent the current project scope for trust
/// decisions and project-scoped session filtering.
///
/// If the path is inside a Git repository, this returns the nearest ancestor
/// that contains a `.git` marker. Otherwise it returns the canonicalized input
/// path when possible, or the original path as a fallback.
pub(crate) fn resolve_project_scope(path: &Path) -> PathBuf {
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());

    for ancestor in canonical.ancestors() {
        if ancestor.join(".git").exists() {
            return ancestor.to_path_buf();
        }
    }

    canonical
}

#[cfg(test)]
mod tests {
    use super::resolve_project_scope;
    use std::fs;
    use std::path::Path;

    #[test]
    fn resolves_to_git_root_when_marker_exists() {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().join("repo");
        let nested = repo.join("apps").join("cli");
        fs::create_dir_all(&nested).unwrap();
        fs::create_dir_all(repo.join(".git")).unwrap();

        let resolved = resolve_project_scope(&nested);
        let expected = repo.canonicalize().unwrap();

        assert_eq!(resolved, expected);
    }

    #[test]
    fn falls_back_to_path_when_no_git_root_exists() {
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("plain").join("nested");
        fs::create_dir_all(&nested).unwrap();

        let resolved = resolve_project_scope(&nested);
        let expected = nested.canonicalize().unwrap();

        assert_eq!(resolved, expected);
    }

    #[test]
    fn preserves_nonexistent_path_when_canonicalize_fails() {
        let path = Path::new("/definitely/not/a/real/cli/project");

        let resolved = resolve_project_scope(path);

        assert_eq!(resolved, path);
    }
}
