#![allow(dead_code, unused_imports)]
use anyhow::{anyhow, Result};
use colored::Colorize;
use std::path::{Component, Path, PathBuf};

use crate::terminal_style as ts;

const GIT_APPLY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

struct TempPatchFile(PathBuf);

impl TempPatchFile {
    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempPatchFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

#[derive(Debug)]
pub struct PatchResult {
    pub applied: Vec<String>,
    pub skipped: Vec<String>,
    pub conflicted: Vec<String>,
    pub exit_code: i32,
    /// The patch as a structure: which files, in which direction, with which
    /// hunks. `applied` is the display projection of this.
    pub diff: crate::diff_model::Diff,
}

/// CLI-NEW-007 fix (2026-05-04 audit): scan a unified diff for the file
/// targets it touches and verify each one is contained within `cwd`.
///
/// FIX (audit 2026-05-20, §3): the equivalent TS validator in
/// `packages/tools/apply-patch` takes a `workspaceOnly: boolean` flag. The Rust
/// CLI never had a way to opt out, workspace-only is the only mode.
/// To make that invariant explicit (and protect against a future refactor
/// re-introducing an `--unsafe-paths` knob): this function fails closed.
/// There is no `workspace_only: false` code path; any change here that
/// adds one MUST default to `true` and require an explicit caller opt-in
/// at the CLI command surface, never at this validator.
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
        //   --- /dev/null            (new file, fine, special-case)
        //   diff --git a/x b/y       (we read the a/b paths from --- / +++)
        let raw = if let Some(rest) = line.strip_prefix("--- ") {
            rest
        } else if let Some(rest) = line.strip_prefix("+++ ") {
            rest
        } else {
            continue;
        };

        // git emits "/dev/null" for create / delete halves, that's fine.
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
                "Refusing patch, header references absolute path: {}",
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
                        "Refusing patch, header has rooted path component: {}",
                        trimmed
                    ));
                }
            }
            if depth < 0 {
                return Err(anyhow!(
                    "Refusing patch, header escapes project root via `..`: {}",
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
                    "Refusing patch, header resolves outside project root: {} -> {}",
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
    let parsed = crate::diff_model::Diff::parse(patch);
    let tmp_path = std::env::temp_dir().join(format!("agi-patch-{}.patch", uuid::Uuid::new_v4()));
    // Write with restricted permissions (0o600) to prevent other users from reading
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&tmp_path)?;
    // Arm cleanup only after this invocation successfully created the file.
    let tmp = TempPatchFile(tmp_path);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
    }
    file.write_all(patch.as_bytes())?;
    drop(file);
    let mut apply_command = tokio::process::Command::new("git");
    apply_command
        .args(["apply", "--verbose"])
        .arg(tmp.path())
        .current_dir(cwd);
    let apply = crate::process_tree::output(apply_command, None, Some(GIT_APPLY_TIMEOUT)).await?;
    let code = apply.status.code().unwrap_or(1);
    let mut applied = Vec::new();
    let mut conflicted = Vec::new();
    let mut skipped = Vec::new();
    if code == 0 {
        // The parse describes what the patch WOULD do; it is only reported as
        // applied once the real `git apply` above has actually succeeded.
        applied.extend(parsed.files.iter().map(|file| file.summary()));
    } else {
        for line in String::from_utf8_lossy(&apply.stderr).lines() {
            if line.contains("conflict") || line.contains("rejected") {
                conflicted.push(line.to_string());
            } else if line.contains("already exists") {
                skipped.push(line.to_string());
            }
        }
        // Neither category matched a known pattern, surface the raw error
        // rather than silently dropping it, so a failed apply is never
        // reported as clean with an empty everything.
        if conflicted.is_empty() && skipped.is_empty() {
            let stderr = String::from_utf8_lossy(&apply.stderr).trim().to_string();
            conflicted.push(if stderr.is_empty() {
                format!("git apply failed with exit code {code}")
            } else {
                stderr
            });
        }
    }
    Ok(PatchResult {
        applied,
        skipped,
        conflicted,
        exit_code: code,
        diff: parsed,
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
        println!("  {} {}", ts::addition("+"), f);
    }
    for f in &result.skipped {
        println!("  {} {}", ts::warning("~"), f);
    }
    for f in &result.conflicted {
        println!("  {} {}", ts::danger("!"), f);
    }
    if result.exit_code == 0 {
        // `applied`/`skipped`/`conflicted` are only ever populated from a
        // real successful `git apply` on this path (see `apply_git_patch`),
        // so exit_code == 0 always means the patch genuinely applied.
        println!("{}", ts::success_header("Patch applied."));
    } else if !result.conflicted.is_empty() {
        println!("{}", ts::danger_header("Patch had conflicts."));
    } else {
        println!("{}", ts::danger_header("Patch failed to apply."));
    }
}

// ---------------------------------------------------------------------------
// CLI-NEW-007 reproducer + regression tests (2026-05-04 audit)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod patch_validation_tests {
    use super::{apply_git_patch, validate_patch_targets};
    use std::path::Path;

    /// Pre-fix: this patch flowed straight into `git apply`, which on older
    /// gits (or with `core.worktree` redirection) would write to /etc.
    /// Post-fix: rejected at header parse time.
    #[test]
    fn rejects_absolute_path_in_minus_header() {
        let target = std::env::temp_dir().join("outside-project");
        let patch = format!(
            "--- {}\n+++ {}\n@@ -0,0 +1,1 @@\n+pwned\n",
            target.display(),
            target.display()
        );
        let err = validate_patch_targets(&patch, Path::new(".")).unwrap_err();
        assert!(
            err.to_string().contains("absolute path"),
            "expected absolute-path rejection, got: {}",
            err
        );
    }

    #[test]
    fn rejects_absolute_path_in_plus_header() {
        let target = std::env::temp_dir().join("outside-project");
        let patch = format!(
            "--- a/src/x.rs\n+++ {}\n@@ -1,1 +1,1 @@\n-old\n+new\n",
            target.display()
        );
        let err = validate_patch_targets(&patch, Path::new(".")).unwrap_err();
        assert!(err.to_string().contains("absolute path"), "got: {}", err);
    }

    #[test]
    fn rejects_parent_traversal_beyond_root() {
        let patch = "--- a/../../etc/shadow\n+++ b/../../etc/shadow\n@@ -1,1 +1,1 @@\n-x\n+y\n";
        let err = validate_patch_targets(patch, Path::new(".")).unwrap_err();
        assert!(
            err.to_string().contains("escapes project root"),
            "got: {}",
            err
        );
    }

    /// `a/x/../y/foo` traverses up once but doesn't actually escape, the
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

    fn seeded_repo() -> tempfile::TempDir {
        let workspace = tempfile::tempdir().expect("workspace");
        std::process::Command::new("git")
            .args(["init", "-q"])
            .current_dir(workspace.path())
            .status()
            .expect("git init");
        assert!(std::process::Command::new("git")
            .args(["config", "core.autocrlf", "false"])
            .current_dir(workspace.path())
            .status()
            .expect("set fixture line endings")
            .success());
        workspace
    }

    #[tokio::test]
    async fn applies_a_valid_patch_through_the_supervised_git_process() {
        let workspace = seeded_repo();
        std::fs::write(workspace.path().join("example.txt"), "old\n").expect("seed file");
        let patch = "--- a/example.txt\n+++ b/example.txt\n@@ -1 +1 @@\n-old\n+new\n";

        let result = apply_git_patch(patch, Some(workspace.path()))
            .await
            .expect("apply patch");

        assert_eq!(result.exit_code, 0);
        assert_eq!(
            std::fs::read_to_string(workspace.path().join("example.txt")).expect("read result"),
            "new\n"
        );
        assert_eq!(result.diff.files.len(), 1);
        assert_eq!(
            result.diff.files[0].kind,
            crate::diff_model::FileChangeKind::Modified
        );
    }

    /// A `+++ /dev/null` hunk must remove the file from disk AND be reported
    /// as deleted, not as a modification.
    #[tokio::test]
    async fn a_deletion_hunk_removes_the_file_and_reports_it_as_deleted() {
        let workspace = seeded_repo();
        let target = workspace.path().join("doomed.txt");
        std::fs::write(&target, "one\ntwo\n").expect("seed file");
        let patch = "diff --git a/doomed.txt b/doomed.txt\n\
deleted file mode 100644\n\
--- a/doomed.txt\n\
+++ /dev/null\n\
@@ -1,2 +0,0 @@\n\
-one\n\
-two\n";

        let result = apply_git_patch(patch, Some(workspace.path()))
            .await
            .expect("apply deletion patch");

        assert_eq!(result.exit_code, 0, "conflicted: {:?}", result.conflicted);
        assert!(!target.exists(), "deletion hunk must remove the file");
        assert_eq!(result.diff.files.len(), 1);
        assert_eq!(
            result.diff.files[0].kind,
            crate::diff_model::FileChangeKind::Deleted
        );
        assert!(
            result
                .applied
                .iter()
                .any(|line| line.starts_with("D  doomed.txt")),
            "expected a deletion row, got {:?}",
            result.applied
        );
    }

    #[tokio::test]
    async fn a_creation_hunk_writes_the_file_and_reports_it_as_added() {
        let workspace = seeded_repo();
        let patch = "diff --git a/fresh.txt b/fresh.txt\n\
new file mode 100644\n\
--- /dev/null\n\
+++ b/fresh.txt\n\
@@ -0,0 +1,1 @@\n\
+hello\n";

        let result = apply_git_patch(patch, Some(workspace.path()))
            .await
            .expect("apply creation patch");

        assert_eq!(result.exit_code, 0, "conflicted: {:?}", result.conflicted);
        assert_eq!(
            std::fs::read_to_string(workspace.path().join("fresh.txt")).expect("read new file"),
            "hello\n"
        );
        assert_eq!(
            result.diff.files[0].kind,
            crate::diff_model::FileChangeKind::Added
        );
    }

    /// A failed apply must never list files as applied.
    #[tokio::test]
    async fn a_patch_that_does_not_apply_reports_nothing_as_applied() {
        let workspace = seeded_repo();
        std::fs::write(workspace.path().join("example.txt"), "actual\n").expect("seed file");
        let patch = "--- a/example.txt\n+++ b/example.txt\n@@ -1 +1 @@\n-expected\n+new\n";

        let result = apply_git_patch(patch, Some(workspace.path()))
            .await
            .expect("apply runs");

        assert_ne!(result.exit_code, 0);
        assert!(result.applied.is_empty(), "{:?}", result.applied);
        assert!(!result.conflicted.is_empty());
    }

    /// A rename is one patch, not a delete and a create. The file has to land
    /// at its new path with its content, and the old path has to be gone.
    #[tokio::test]
    async fn a_rename_hunk_moves_the_file_and_leaves_nothing_at_the_old_path() {
        let workspace = seeded_repo();
        let before = workspace.path().join("before.txt");
        std::fs::write(&before, "kept\n").expect("seed file");
        let patch = "diff --git a/before.txt b/after.txt\n\
similarity index 100%\n\
rename from before.txt\n\
rename to after.txt\n";

        let result = apply_git_patch(patch, Some(workspace.path()))
            .await
            .expect("apply rename patch");

        assert_eq!(result.exit_code, 0, "conflicted: {:?}", result.conflicted);
        assert!(!before.exists(), "the old path must be gone");
        assert_eq!(
            std::fs::read_to_string(workspace.path().join("after.txt")).expect("renamed file"),
            "kept\n",
            "a rename keeps the content"
        );
    }

    /// The executable bit is part of what a file is. A patch that sets it has
    /// to leave a file the shell will run, not one that needs chmod afterwards.
    #[cfg(unix)]
    #[tokio::test]
    async fn a_mode_change_hunk_leaves_the_file_executable() {
        use std::os::unix::fs::PermissionsExt;
        let workspace = seeded_repo();
        let script = workspace.path().join("run.sh");
        std::fs::write(&script, "#!/bin/sh\necho hi\n").expect("seed script");
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o644))
            .expect("start non-executable");
        let patch = "diff --git a/run.sh b/run.sh\n\
old mode 100644\n\
new mode 100755\n";

        let result = apply_git_patch(patch, Some(workspace.path()))
            .await
            .expect("apply mode patch");

        assert_eq!(result.exit_code, 0, "conflicted: {:?}", result.conflicted);
        let mode = std::fs::metadata(&script)
            .expect("script metadata")
            .permissions()
            .mode();
        assert_eq!(mode & 0o111, 0o111, "mode is {mode:o}");
    }

    /// A file written with CRLF stays CRLF. Rewriting one line must not
    /// normalise the rest of the file, which would turn a one-line change into
    /// a diff against every line for whoever reviews it next.
    #[tokio::test]
    async fn editing_one_line_of_a_crlf_file_leaves_the_other_line_endings_alone() {
        let workspace = seeded_repo();
        let target = workspace.path().join("windows.txt");
        std::fs::write(&target, "one\r\ntwo\r\nthree\r\n").expect("seed file");
        let patch = concat!(
            "--- a/windows.txt\n",
            "+++ b/windows.txt\n",
            "@@ -1,3 +1,3 @@\n",
            " one\r\n",
            "-two\r\n",
            "+TWO\r\n",
            " three\r\n",
        );

        let result = apply_git_patch(patch, Some(workspace.path()))
            .await
            .expect("apply crlf patch");

        assert_eq!(result.exit_code, 0, "conflicted: {:?}", result.conflicted);
        assert_eq!(
            std::fs::read(&target).expect("read result"),
            b"one\r\nTWO\r\nthree\r\n",
            "the untouched lines keep their carriage returns"
        );
    }

    /// A binary file is not text and has no hunks. The patch path has to carry
    /// the bytes through byte for byte rather than mangling them as lines.
    #[tokio::test]
    async fn a_binary_patch_restores_the_bytes_it_carries() {
        let workspace = seeded_repo();
        let run = |args: &[&str]| {
            std::process::Command::new("git")
                .args(args)
                .current_dir(workspace.path())
                .output()
                .expect("git available")
        };
        run(&["config", "user.email", "test@example.invalid"]);
        run(&["config", "user.name", "Test"]);
        std::fs::write(workspace.path().join("seed.txt"), "seed\n").expect("seed file");
        run(&["add", "seed.txt"]);
        run(&["commit", "-qm", "seed"]);

        let bytes: Vec<u8> = (0u8..=255).collect();
        let blob = workspace.path().join("blob.bin");
        std::fs::write(&blob, &bytes).expect("seed binary");
        run(&["add", "blob.bin"]);
        let patch =
            String::from_utf8_lossy(&run(&["diff", "--cached", "--binary"]).stdout).into_owned();
        assert!(
            patch.contains("GIT binary patch"),
            "fixture must be a binary patch: {patch}"
        );
        run(&["reset", "-q"]);
        std::fs::remove_file(&blob).expect("remove before re-applying");

        let result = apply_git_patch(&patch, Some(workspace.path()))
            .await
            .expect("apply binary patch");

        assert_eq!(result.exit_code, 0, "conflicted: {:?}", result.conflicted);
        assert_eq!(
            std::fs::read(&blob).expect("read restored binary"),
            bytes,
            "every byte has to come back, including the zero byte"
        );
    }
}
