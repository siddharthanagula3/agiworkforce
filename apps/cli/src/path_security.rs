use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};

static ADDITIONAL_WORKSPACE_ROOTS: OnceLock<RwLock<Vec<PathBuf>>> = OnceLock::new();

fn additional_roots() -> &'static RwLock<Vec<PathBuf>> {
    ADDITIONAL_WORKSPACE_ROOTS.get_or_init(|| RwLock::new(Vec::new()))
}

pub fn register_additional_workspace_root(path_str: &str) -> std::result::Result<PathBuf, String> {
    let expanded = expand_home(path_str);
    let path = PathBuf::from(expanded);
    let absolute = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .map_err(|e| format!("Cannot determine current directory: {e}"))?
            .join(path)
    };
    register_additional_workspace_root_path(&absolute)
}

pub fn register_additional_workspace_root_path(
    path: &Path,
) -> std::result::Result<PathBuf, String> {
    if !path.exists() {
        return Err(format!(
            "Additional directory does not exist: {}",
            path.display()
        ));
    }
    if !path.is_dir() {
        return Err(format!(
            "Additional workspace root must be a directory: {}",
            path.display()
        ));
    }

    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Cannot resolve additional directory: {e}"))?;
    let mut roots = additional_roots()
        .write()
        .map_err(|_| "Additional workspace root registry is poisoned".to_string())?;
    if !roots.iter().any(|root| root == &canonical) {
        roots.push(canonical.clone());
    }
    Ok(canonical)
}

pub fn registered_additional_workspace_roots() -> Vec<PathBuf> {
    additional_roots()
        .read()
        .map(|roots| roots.clone())
        .unwrap_or_default()
}

/// Remove roots owned by a session that is crossing into a newly reviewed
/// privacy boundary. The caller supplies canonical paths previously returned
/// by `register_additional_workspace_root*`; no filesystem content is changed.
pub fn unregister_additional_workspace_roots(paths: &[PathBuf]) {
    if let Ok(mut roots) = additional_roots().write() {
        roots.retain(|root| !paths.iter().any(|path| path == root));
    }
}

#[cfg(test)]
pub fn clear_additional_workspace_roots_for_tests() {
    if let Ok(mut roots) = additional_roots().write() {
        roots.clear();
    }
}

pub fn validate_workspace_path(path_str: &str) -> std::result::Result<PathBuf, String> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    validate_workspace_path_with_cwd(path_str, &cwd)
}

pub fn validate_workspace_path_with_cwd(
    path_str: &str,
    cwd: &Path,
) -> std::result::Result<PathBuf, String> {
    let path = Path::new(path_str);

    if path_str.contains('\0') {
        return Err("Path contains null bytes".to_string());
    }

    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    };

    let allowed_roots = allowed_workspace_roots(cwd);

    if absolute.exists() {
        let canonical = absolute
            .canonicalize()
            .map_err(|e| format!("Cannot resolve path: {}", e))?;
        if !is_under_allowed_root(&canonical, &allowed_roots) {
            return Err(format!(
                "Path escapes project directory and additional roots: {} (resolved to {})",
                path_str,
                canonical.display()
            ));
        }
        return Ok(canonical);
    }

    let mut existing_parent = absolute.as_path();
    while !existing_parent.exists() {
        existing_parent = existing_parent
            .parent()
            .ok_or_else(|| format!("Cannot resolve existing parent for path: {}", path_str))?;
    }

    let canonical_parent = existing_parent
        .canonicalize()
        .map_err(|e| format!("Cannot resolve parent path: {}", e))?;
    if !is_under_allowed_root(&canonical_parent, &allowed_roots) {
        return Err(format!(
            "Path escapes project directory and additional roots: {} (parent resolved to {})",
            path_str,
            canonical_parent.display()
        ));
    }

    Ok(absolute)
}

fn allowed_workspace_roots(cwd: &Path) -> Vec<PathBuf> {
    let mut roots = vec![cwd.canonicalize().unwrap_or_else(|_| cwd.to_path_buf())];
    roots.extend(registered_additional_workspace_roots());
    roots
}

fn is_under_allowed_root(path: &Path, allowed_roots: &[PathBuf]) -> bool {
    allowed_roots.iter().any(|root| path.starts_with(root))
}

fn expand_home(path: &str) -> String {
    if path == "~" {
        return dirs::home_dir()
            .map(|home| home.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string());
    }
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest).to_string_lossy().into_owned();
        }
    }
    path.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, MutexGuard};

    /// `ADDITIONAL_WORKSPACE_ROOTS` is process-global, and cargo runs tests in
    /// parallel threads. Without this, one test's
    /// `clear_additional_workspace_roots_for_tests()` races another's
    /// `register_additional_workspace_root_path`, and the registered-root test
    /// fails intermittently — roughly one run in three.
    static ROOTS_GUARD: Mutex<()> = Mutex::new(());

    /// Serialize access to the global. Recovers from a poisoned lock so one
    /// failing test does not cascade into every sibling.
    fn lock_roots() -> MutexGuard<'static, ()> {
        ROOTS_GUARD.lock().unwrap_or_else(|e| e.into_inner())
    }

    #[cfg(unix)]
    #[test]
    fn validate_workspace_path_rejects_new_file_under_symlinked_parent_outside_workspace() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let outside = tempfile::tempdir().expect("outside tempdir");
        std::os::unix::fs::symlink(outside.path(), workspace.path().join("linked"))
            .expect("create symlink");

        let result = validate_workspace_path_with_cwd("linked/new.txt", workspace.path());

        assert!(
            result.is_err(),
            "new file through symlinked parent outside workspace should be rejected"
        );
    }

    #[test]
    fn validate_workspace_path_allows_new_file_under_real_workspace_dir() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        std::fs::create_dir(workspace.path().join("real")).expect("create real dir");

        let result = validate_workspace_path_with_cwd("real/new.txt", workspace.path())
            .expect("path should be allowed");

        assert_eq!(result, workspace.path().join("real/new.txt"));
    }

    #[test]
    fn validate_workspace_path_allows_existing_file_under_workspace() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let file = workspace.path().join("existing.txt");
        std::fs::write(&file, "ok").expect("write existing file");

        let result = validate_workspace_path_with_cwd("existing.txt", workspace.path())
            .expect("path should be allowed");

        assert_eq!(
            result,
            file.canonicalize().expect("canonical existing file")
        );
    }

    #[test]
    fn validate_workspace_path_rejects_parent_traversal_outside_workspace() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let root = tempfile::tempdir().expect("root tempdir");
        let workspace = root.path().join("workspace");
        let outside = root.path().join("outside");
        std::fs::create_dir(&workspace).expect("create workspace");
        std::fs::create_dir(&outside).expect("create outside");
        let outside_file = outside.join("escape.txt");
        std::fs::write(&outside_file, "outside").expect("write outside file");

        let mut path = PathBuf::from("..");
        path.push("outside");
        path.push("escape.txt");
        let relative_escape = path.to_string_lossy().into_owned();

        let result = validate_workspace_path_with_cwd(&relative_escape, &workspace);

        assert!(
            result.is_err(),
            "parent traversal outside workspace should be rejected"
        );
    }

    #[test]
    fn validate_workspace_path_allows_registered_additional_root() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let outside = tempfile::tempdir().expect("outside tempdir");
        let file = outside.path().join("shared.txt");
        std::fs::write(&file, "shared").expect("write outside file");

        register_additional_workspace_root_path(outside.path()).expect("register extra root");

        let result = validate_workspace_path_with_cwd(&file.to_string_lossy(), workspace.path())
            .expect("registered additional root should be allowed");

        assert_eq!(result, file.canonicalize().expect("canonical extra file"));
        clear_additional_workspace_roots_for_tests();
    }
}
