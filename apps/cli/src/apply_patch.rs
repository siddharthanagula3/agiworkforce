#![allow(dead_code, unused_imports)]
use anyhow::{anyhow, Result};
use colored::Colorize;
use std::path::{Component, Path, PathBuf};

#[derive(Debug)]
pub struct PatchResult {
    pub applied: Vec<String>,
    pub skipped: Vec<String>,
    pub conflicted: Vec<String>,
    pub exit_code: i32,
}

/// CLI-NEW-007 fix (2026-05-04 audit): scan a unified diff for the file
/// targets it touches and verify each one is contained within `cwd`.
///
/// Without this check, a patch with `--- /etc/cron.d/backdoor` flowed straight
/// into `git apply`. Modern git refuses absolute paths by default, but:
///   - older gits (< 2.20) accept them,
///   - `core.worktree` redirection silently changes what "outside" means,
///   - and a future regression (e.g., adding `--unsafe-paths`) would re-open
///     the hole. A pre-check defense doesn't depend on git's behavior.
///
/// Strips standard `a/` and `b/` prefixes that git emits for headers, rejects
/// any remaining absolute path, and rejects any path whose components escape
/// `cwd` via parent traversal.
fn validate_patch_targets(patch: &str, cwd: &Path) -> Result<()> {
    let cwd_canonical = cwd.canonicalize().unwrap_or_else(|_| cwd.to_path_buf());

    for line in patch.lines() {
        // Headers we care about look like:
        //   --- a/src/foo.rs
        //   +++ b/src/foo.rs
        //   --- /dev/null            (new file — fine, special-case)
        //   diff --git a/x b/y       (we read the a/b paths from --- / +++)
        let raw = if let Some(rest) = line.strip_prefix("--- ") {
            rest
        } else if let Some(rest) = line.strip_prefix("+++ ") {
            rest
        } else {
            continue;
        };

        // git emits "/dev/null" for create / delete halves — that's fine.
        let trimmed = raw.split('\t').next().unwrap_or(raw).trim();
        if trimmed == "/dev/null" || trimmed.is_empty() {
            continue;
        }

        // Strip the `a/` or `b/` prefix git uses by default. Patches generated
        // with `--no-prefix` won't have it; that path is treated as project-
        // relative as-is.
        let target = trimmed
            .strip_prefix("a/")
            .or_else(|| trimmed.strip_prefix("b/"))
            .unwrap_or(trimmed);

        let target_path = Path::new(target);

        if target_path.is_absolute() {
            return Err(anyhow!(
                "Refusing patch — header references absolute path: {}",
                trimmed
            ));
        }

        // Walk components; reject anything that climbs above cwd.
        let mut depth: i32 = 0;
        for comp in target_path.components() {
            match comp {
                Component::ParentDir => depth -= 1,
                Component::Normal(_) => depth += 1,
                Component::CurDir => {}
                Component::RootDir | Component::Prefix(_) => {
                    return Err(anyhow!(
                        "Refusing patch — header has rooted path component: {}",
                        trimmed
                    ));
                }
            }
            if depth < 0 {
                return Err(anyhow!(
                    "Refusing patch — header escapes project root via `..`: {}",
                    trimmed
                ));
            }
        }

        // For paths that resolve under cwd, double-check the canonical form
        // doesn't slip out via symlink. We can only canonicalize when the
        // file already exists; for new files the depth check above is enough.
        let absolute = cwd_canonical.join(target_path);
        if absolute.exists() {
            let canonical = absolute
                .canonicalize()
                .map_err(|e| anyhow!("Cannot resolve patch target {}: {}", trimmed, e))?;
            if !canonical.starts_with(&cwd_canonical) {
                return Err(anyhow!(
                    "Refusing patch — header resolves outside project root: {} -> {}",
                    trimmed,
                    canonical.display()
                ));
            }
        }
    }

    Ok(())
}

pub async fn apply_git_patch(patch: &str, cwd: Option<&Path>) -> Result<PatchResult> {
    let cwd = cwd.unwrap_or_else(|| Path::new("."));

    // CLI-NEW-007 fix: validate every target path before invoking `git apply`.
    validate_patch_targets(patch, cwd)?;
    let tmp = std::env::temp_dir().join(format!("agi-patch-{}.patch", uuid::Uuid::new_v4()));
    // Write with restricted permissions (0o600) to prevent other users from reading
    {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
        }
        file.write_all(patch.as_bytes())?;
    }
    let stat = tokio::process::Command::new("git")
        .args(["apply", "--stat"])
        .arg(&tmp)
        .current_dir(cwd)
        .output()
        .await?;
    let apply = tokio::process::Command::new("git")
        .args(["apply", "--verbose"])
        .arg(&tmp)
        .current_dir(cwd)
        .output()
        .await?;
    let _ = std::fs::remove_file(&tmp);
    let mut applied = Vec::new();
    for line in String::from_utf8_lossy(&stat.stdout).lines() {
        if let Some(f) = line.split('|').next() {
            let t = f.trim();
            if !t.is_empty() {
                applied.push(t.to_string());
            }
        }
    }
    let code = apply.status.code().unwrap_or(1);
    let mut conflicted = Vec::new();
    let mut skipped = Vec::new();
    if code != 0 {
        for line in String::from_utf8_lossy(&apply.stderr).lines() {
            if line.contains("conflict") || line.contains("rejected") {
                conflicted.push(line.to_string());
            } else if line.contains("already exists") {
                skipped.push(line.to_string());
            }
        }
    }
    Ok(PatchResult {
        applied,
        skipped,
        conflicted,
        exit_code: code,
    })
}

pub async fn apply_from_session(session_id: &str) -> Result<PatchResult> {
    let conn = crate::sessions::open_db()?;
    let messages = crate::sessions::load_session(&conn, session_id)?;
    let diff = messages.iter().rev().find_map(|m| {
        let t = m.text_content();
        if t.contains("diff --git") || t.contains("---") {
            Some(t)
        } else {
            None
        }
    });
    match diff {
        Some(patch) => apply_git_patch(&patch, None).await,
        None => anyhow::bail!("No diff found in session '{}'", session_id),
    }
}

pub async fn apply_from_file(path: &Path) -> Result<PatchResult> {
    let patch = std::fs::read_to_string(path)?;
    apply_git_patch(&patch, None).await
}

pub fn print_patch_result(result: &PatchResult) {
    for f in &result.applied {
        println!("  {} {}", "+".green(), f);
    }
    for f in &result.skipped {
        println!("  {} {}", "~".yellow(), f);
    }
    for f in &result.conflicted {
        println!("  {} {}", "!".red(), f);
    }
    if result.exit_code == 0 {
        println!("{}", "Patch applied.".green().bold());
    } else if result.conflicted.is_empty() {
        println!("{}", "Patch applied with warnings.".yellow().bold());
    } else {
        println!("{}", "Patch had conflicts.".red().bold());
    }
}

// ---------------------------------------------------------------------------
// CLI-NEW-007 reproducer + regression tests (2026-05-04 audit)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod patch_validation_tests {
    use super::validate_patch_targets;
    use std::path::Path;

    /// Pre-fix: this patch flowed straight into `git apply`, which on older
    /// gits (or with `core.worktree` redirection) would write to /etc.
    /// Post-fix: rejected at header parse time.
    #[test]
    fn rejects_absolute_path_in_minus_header() {
        let patch = "--- /etc/cron.d/backdoor\n+++ /etc/cron.d/backdoor\n@@ -0,0 +1,1 @@\n+pwned\n";
        let err = validate_patch_targets(patch, Path::new(".")).unwrap_err();
        assert!(
            err.to_string().contains("absolute path"),
            "expected absolute-path rejection, got: {}",
            err
        );
    }

    #[test]
    fn rejects_absolute_path_in_plus_header() {
        let patch = "--- a/src/x.rs\n+++ /tmp/x.rs\n@@ -1,1 +1,1 @@\n-old\n+new\n";
        let err = validate_patch_targets(patch, Path::new(".")).unwrap_err();
        assert!(err.to_string().contains("absolute path"), "got: {}", err);
    }

    #[test]
    fn rejects_parent_traversal_beyond_root() {
        let patch =
            "--- a/../../etc/shadow\n+++ b/../../etc/shadow\n@@ -1,1 +1,1 @@\n-x\n+y\n";
        let err = validate_patch_targets(patch, Path::new(".")).unwrap_err();
        assert!(
            err.to_string().contains("escapes project root"),
            "got: {}",
            err
        );
    }

    /// `a/x/../y/foo` traverses up once but doesn't actually escape — the
    /// parent is consumed by the next normal segment. Allowed.
    #[test]
    fn allows_traversal_that_stays_within_root() {
        let patch = "--- a/src/../README.md\n+++ b/src/../README.md\n@@ -1,1 +1,1 @@\n-old\n+new\n";
        validate_patch_targets(patch, Path::new(".")).expect("balanced traversal must pass");
    }

    #[test]
    fn allows_normal_relative_paths() {
        let patch = "--- a/src/foo.rs\n+++ b/src/foo.rs\n@@ -1,1 +1,1 @@\n-old\n+new\n";
        validate_patch_targets(patch, Path::new(".")).expect("normal patch must pass");
    }

    #[test]
    fn allows_dev_null_for_create_or_delete() {
        let patch = "--- /dev/null\n+++ b/src/new_file.rs\n@@ -0,0 +1,1 @@\n+content\n";
        validate_patch_targets(patch, Path::new(".")).expect("/dev/null half must pass");
    }

    #[test]
    fn ignores_non_header_lines_that_start_with_dashes() {
        // Body lines beginning with `-` (deletion markers) must NOT be parsed
        // as path headers. Only `--- ` / `+++ ` (note the trailing space).
        let patch = "--- a/x.rs\n+++ b/x.rs\n@@ -1,3 +1,3 @@\n-old line\n+new line\n";
        validate_patch_targets(patch, Path::new(".")).expect("body lines must not trigger");
    }
}
