#![allow(dead_code, unused_imports)]
use anyhow::{anyhow, Result};
use colored::Colorize;
use std::path::{Component, Path, PathBuf};

use crate::terminal_style as ts;

const GIT_APPLY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

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

/// One file a patch changes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PatchTarget {
    /// The file as git names it once it has read the patch: unquoted, its
    /// escapes decoded, and the `a/` or `b/` git strips gone.
    pub name: String,
    /// Where that name is in the folder the patch is applied in.
    pub file: PathBuf,
}

/// `git apply` as it is run here every time, to list what a patch changes
/// and to apply it: in `cwd`, told which repository it is in, and the patch
/// on its standard input.
///
/// Left to discover a repository above `cwd`, git reads every name through
/// that repository: it guesses how much of a name to strip from where `cwd`
/// sits in it, takes a `diff --git` name from the repository's top folder,
/// and skips a file outside `cwd` while reporting success. So git is never
/// left to look. When `cwd` holds a repository of its own, that repository
/// and `cwd` as its work tree are named outright; otherwise git is told
/// there is none, and applies the patch as `patch` would. Either way a name
/// means the same file whether it is being listed or written: the one below
/// `cwd`. Naming the repository, where a ceiling on the search would also
/// work, keeps a folder with a `:` in its path from being read as two
/// ceilings. No `-p` is passed: an explicit `-p1` refuses a patch whose
/// names have no folder in them, such as `--- x.rs`, which git otherwise
/// reads as they stand.
///
/// `cwd` arrives canonical, which on Windows is a `\\?\` path: Git for
/// Windows given a repository by that name cannot read its configuration and
/// stops. Git is handed the plain form of the same path whenever one exists.
fn git_apply(cwd: &Path) -> tokio::process::Command {
    let cwd = dunce::simplified(cwd);
    let mut command = agiworkforce_worktree::host_git_async();
    command.arg("apply").current_dir(cwd);
    let own = cwd.join(agiworkforce_sandbox_policy::GIT_METADATA_ENTRY);
    if std::fs::symlink_metadata(&own).is_ok() {
        command.env("GIT_DIR", own).env("GIT_WORK_TREE", cwd);
    } else {
        command
            .env("GIT_DIR", NO_REPOSITORY)
            .env_remove("GIT_WORK_TREE");
    }
    command
}

/// What `GIT_DIR` names when there is no repository: the null device, which
/// is never one.
#[cfg(windows)]
const NO_REPOSITORY: &str = "NUL";
#[cfg(not(windows))]
const NO_REPOSITORY: &str = "/dev/null";

/// The names in one `--numstat -z` listing: `added<TAB>deleted<TAB>name`
/// records ending in NUL, where a name may hold a tab itself.
fn numstat_names(listing: &[u8]) -> Option<Vec<String>> {
    listing
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
        .map(|record| {
            record
                .splitn(3, |byte| *byte == b'\t')
                .nth(2)
                .and_then(|name| std::str::from_utf8(name).ok())
                .filter(|name| !name.is_empty())
                .map(str::to_string)
        })
        .collect()
}

/// The files `patch` changes when applied in `cwd`, asked of git itself, and
/// the files it takes a rename or a copy from.
struct PatchNames {
    /// What `git apply` writes or removes, which is also what it reports
    /// once it has applied the patch.
    changed: Vec<String>,
    /// Where a rename or a copy comes from, which the patch removes or reads.
    sources: Vec<String>,
}

/// Reading the names off the header lines is what this replaced. Git accepts
/// a C-quoted name, so `+++ "b/.husk\171/pre-commit"` applies to
/// `.husky/pre-commit`; it picks one of the two names of a plain diff by
/// rules of its own; and it reads a header line inside a hunk as content.
/// Each was a patch whose listed targets were not the files it wrote. Here
/// git parses the patch as [`git_apply`] runs it and prints what it would
/// touch: `--numstat` names the file each change lands in, and the same with
/// `-R` names the file each rename or copy comes from.
///
/// A patch git cannot parse, or one that names no file, is an error: nothing
/// may be approved or applied whose targets are not established.
async fn patch_file_names(patch: &str, cwd: &Path) -> std::result::Result<PatchNames, String> {
    let unreadable = |reason: String| {
        format!("Refusing patch, git cannot tell which files it changes: {reason}")
    };
    let mut listings = Vec::with_capacity(2);
    for direction in [None, Some("-R")] {
        let mut command = git_apply(cwd);
        command.args(direction).args(["--numstat", "-z", "-"]);
        let listed = crate::process_tree::output(
            command,
            Some(patch.as_bytes().to_vec()),
            Some(GIT_APPLY_TIMEOUT),
        )
        .await
        .map_err(|error| unreadable(error.to_string()))?;
        if !listed.status.success() {
            let stderr = String::from_utf8_lossy(&listed.stderr).trim().to_string();
            return Err(unreadable(if stderr.is_empty() {
                format!("git apply --numstat exited with {}", listed.status)
            } else {
                stderr
            }));
        }
        let names = numstat_names(&listed.stdout)
            .ok_or_else(|| unreadable("a file name in it is not readable text".to_string()))?;
        listings.push(names);
    }
    let sources = listings.pop().unwrap_or_default();
    let changed = listings.pop().unwrap_or_default();
    if changed.is_empty() {
        return Err(unreadable("it names no file".to_string()));
    }
    Ok(PatchNames { changed, sources })
}

/// Refuses a name that is absolute or climbs out of the folder it is taken
/// from. Git refuses these when it applies too; this does not wait for it.
/// A name with a root and no drive, `/etc/x` on Windows, lands at the root of
/// the current drive, so it is absolute here too.
fn refuse_escaping_name(name: &str) -> std::result::Result<(), String> {
    let path = Path::new(name);
    if path.is_absolute() || path.has_root() {
        return Err(format!(
            "Refusing patch, header references absolute path: {name}"
        ));
    }
    let mut depth: i32 = 0;
    for component in path.components() {
        match component {
            Component::ParentDir => depth -= 1,
            Component::Normal(_) => depth += 1,
            Component::CurDir => {}
            Component::RootDir | Component::Prefix(_) => {
                return Err(format!(
                    "Refusing patch, header has rooted path component: {name}"
                ));
            }
        }
        if depth < 0 {
            return Err(format!(
                "Refusing patch, header escapes project root via `..`: {name}"
            ));
        }
    }
    Ok(())
}

/// The mode git gives a gitlink, the entry that records which commit of a
/// submodule a repository uses.
const GITLINK_MODE: &str = "160000";

/// The lines of a file's header that carry a mode on their own.
const MODE_LINES: [&str; 4] = [
    "new file mode ",
    "deleted file mode ",
    "old mode ",
    "new mode ",
];

/// The header of the first file in `patch` that is a gitlink, by the mode
/// its header gives it, on a mode line or after the hashes of its `index`
/// line. Only a header is read, the lines from `diff --git` to the first
/// hunk: the same words inside a hunk are a file's content.
///
/// `git apply` does not move a submodule. Given a patch to its pointer it
/// prints the entry as changed, exits 0 and changes nothing, and for a new
/// gitlink it makes an empty folder, so such a patch is refused before
/// anything is applied and never reported as applied.
fn gitlink_in(patch: &str) -> Option<&str> {
    let mut header = None;
    for line in patch.lines() {
        let line = line.trim_end();
        if line.starts_with("diff --git ") {
            header = Some(line);
        } else if line.starts_with("@@ ") {
            header = None;
        } else if let Some(file) = header {
            let on_a_mode_line = MODE_LINES
                .iter()
                .any(|mode| line.strip_prefix(mode) == Some(GITLINK_MODE));
            let on_the_index_line =
                line.starts_with("index ") && line.split_whitespace().nth(2) == Some(GITLINK_MODE);
            if on_a_mode_line || on_the_index_line {
                return Some(file);
            }
        }
    }
    None
}

/// Whether `patch` makes a symbolic link, by the summary git gives of it.
/// A link the agent writes would lead a later write wherever it points.
async fn makes_a_link(patch: &str, cwd: &Path) -> std::result::Result<bool, String> {
    let mut command = git_apply(cwd);
    command.args(["--summary", "-"]);
    let summary = crate::process_tree::output(
        command,
        Some(patch.as_bytes().to_vec()),
        Some(GIT_APPLY_TIMEOUT),
    )
    .await
    .map_err(|error| format!("Refusing patch, git cannot summarize it: {error}"))?;
    if !summary.status.success() {
        return Err(format!(
            "Refusing patch, git cannot summarize it: git apply --summary exited with {}",
            summary.status
        ));
    }
    Ok(String::from_utf8_lossy(&summary.stdout)
        .lines()
        .any(|line| {
            line.starts_with(" create mode 120000 ")
                || (line.starts_with(" mode change ") && line.contains(" => 120000 "))
        }))
}

/// [`patch_targets`], with the names git will report once it has applied
/// the patch, for [`apply_git_patch`] to hold it to.
async fn checked_patch(
    patch: &str,
    cwd: &Path,
) -> std::result::Result<(Vec<PatchTarget>, Vec<String>), String> {
    if let Some(file) = gitlink_in(patch) {
        return Err(format!(
            "Refusing patch, it changes which commit a submodule is at ({file}): git apply reports \
             that as applied and changes nothing. Move the submodule with git, and send a patch \
             for the files only."
        ));
    }
    let cwd = cwd
        .canonicalize()
        .map_err(|error| format!("Refusing patch, cannot resolve {}: {error}", cwd.display()))?;
    let names = patch_file_names(patch, &cwd).await?;
    if makes_a_link(patch, &cwd).await? {
        return Err("Refusing patch: symbolic link creation is not allowed".to_string());
    }
    let mut targets: Vec<PatchTarget> = Vec::with_capacity(names.changed.len());
    for name in names.changed.iter().chain(&names.sources) {
        if targets.iter().any(|target| target.name == *name) {
            continue;
        }
        refuse_escaping_name(name)?;
        let file = cwd.join(name);
        if std::fs::symlink_metadata(&file).is_ok_and(|found| found.is_dir()) {
            return Err(format!(
                "Refusing patch, {name} is a folder: a patch changes files, and git apply reports \
                 a change to a folder, such as a submodule's, as applied while changing nothing"
            ));
        }
        let landing = agiworkforce_sandbox_policy::landing_path(&file)
            .map_err(|_| format!("Refusing patch, {name} goes through a loop of symbolic links"))?;
        if !landing.starts_with(&cwd) {
            return Err(format!(
                "Refusing patch, header resolves outside project root: {name} -> {}",
                landing.display()
            ));
        }
        if std::fs::symlink_metadata(&file).is_ok_and(|found| found.file_type().is_symlink()) {
            return Err(format!("Refusing patch: symbolic link target: {name}"));
        }
        targets.push(PatchTarget {
            name: name.clone(),
            file,
        });
    }
    Ok((targets, names.changed))
}

/// The files `patch` changes when applied in `cwd`: the one parser every
/// check of a patch goes through, which is the approval gate, the saved
/// permissions and freshness check of the patch tool, and the containment
/// check before `git apply`. The names are git's ([`patch_file_names`]),
/// listed by the same command, in the same folder, that applies the patch.
///
/// There is no mode that lets a patch leave `cwd`. Each name is refused when
/// it is absolute or climbs out, and the file it names is followed through
/// every link on it, one whose target does not exist yet included
/// ([`agiworkforce_sandbox_policy::landing_path`]), and refused when it
/// lands outside `cwd` or its links never settle.
pub(crate) async fn patch_targets(
    patch: &str,
    cwd: &Path,
) -> std::result::Result<Vec<PatchTarget>, String> {
    checked_patch(patch, cwd).await.map(|(targets, _)| targets)
}

/// Apply `patch` in `cwd`, or the working directory, through `git apply`.
///
/// CLI-NEW-007 (2026-05-04 audit): every target is established and checked
/// first ([`patch_targets`]), with no opt-out. Git then applies the patch
/// with the command that listed it and prints what it changed, and that list
/// has to be the one that was checked: a patch that applied to other files,
/// or to none, is an error and never a success with the wrong names on it.
pub async fn apply_git_patch(patch: &str, cwd: Option<&Path>) -> Result<PatchResult> {
    let cwd = cwd.unwrap_or_else(|| Path::new("."));

    crate::platform::runtime::git::check_repository_config(
        cwd,
        agiworkforce_worktree::config_guard::ConfigUse::CONTENT,
    )
    .await?;
    let (targets, mut expected) = checked_patch(patch, cwd)
        .await
        .map_err(|message| anyhow!(message))?;
    let cwd = cwd.canonicalize()?;
    for target in &targets {
        crate::path_security::validate_workspace_write_path_with_cwd(&target.name, &cwd)
            .map_err(|reason| anyhow!(reason))?;
    }
    let parsed = crate::diff_model::Diff::parse(patch);
    let mut apply_command = git_apply(&cwd);
    apply_command.args(["--apply", "--numstat", "-z", "--verbose", "-"]);
    let apply = crate::process_tree::output(
        apply_command,
        Some(patch.as_bytes().to_vec()),
        Some(GIT_APPLY_TIMEOUT),
    )
    .await?;
    let code = apply.status.code().unwrap_or(1);
    let mut applied = Vec::new();
    let mut conflicted = Vec::new();
    let mut skipped = Vec::new();
    if code == 0 {
        let mut changed = numstat_names(&apply.stdout).unwrap_or_default();
        changed.sort();
        expected.sort();
        if changed != expected {
            return Err(anyhow!(
                "git apply changed {changed:?}, and the files checked beforehand were {expected:?}; \
                 look at these files before going on"
            ));
        }
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
    use super::{apply_git_patch, patch_targets};
    use std::path::Path;

    /// The names git gives the files of `patch`, in a folder of its own.
    async fn names(patch: &str) -> Result<Vec<String>, String> {
        let folder = tempfile::tempdir().expect("folder");
        let targets = patch_targets(patch, folder.path()).await?;
        Ok(targets.into_iter().map(|target| target.name).collect())
    }

    /// Git strips the `a/` it is given and keeps the rest, so a name that is
    /// absolute after that is one it would write outside the project.
    #[tokio::test]
    async fn rejects_absolute_path_in_minus_header() {
        let target = std::env::temp_dir().join("outside-project");
        let patch = format!(
            "--- a/{0}\n+++ b/{0}\n@@ -0,0 +1,1 @@\n+pwned\n",
            target.display()
        );
        let err = patch_targets(&patch, Path::new(".")).await.unwrap_err();
        assert!(
            err.to_string().contains("absolute path"),
            "expected absolute-path rejection, got: {}",
            err
        );
    }

    #[tokio::test]
    async fn rejects_absolute_path_in_a_quoted_plus_header() {
        let patch = "--- /dev/null\n+++ \"b//etc/cron.d/backdoor\"\n@@ -0,0 +1 @@\n+pwned\n";
        let err = patch_targets(patch, Path::new(".")).await.unwrap_err();
        assert!(err.to_string().contains("absolute path"), "got: {}", err);
    }

    /// A header that spells an absolute path with no `a/` in front is not one
    /// to git: it strips the leading slash as the prefix and writes below the
    /// folder it runs in. The target is judged as git reads it.
    #[tokio::test]
    async fn a_bare_absolute_header_is_the_relative_path_git_reads_it_as() {
        let read = names("--- /opt/tool/notes.txt\n+++ /opt/tool/notes.txt\n@@ -0,0 +1 @@\n+x\n")
            .await
            .expect("names");
        assert_eq!(read, ["opt/tool/notes.txt"]);
    }

    #[tokio::test]
    async fn rejects_parent_traversal_beyond_root() {
        let patch = "--- a/../../etc/shadow\n+++ b/../../etc/shadow\n@@ -1,1 +1,1 @@\n-x\n+y\n";
        let err = patch_targets(patch, Path::new(".")).await.unwrap_err();
        assert!(
            err.to_string().contains("escapes project root"),
            "got: {}",
            err
        );
    }

    /// `a/x/../y/foo` traverses up once but doesn't actually escape, the
    /// parent is consumed by the next normal segment. Allowed.
    #[tokio::test]
    async fn allows_traversal_that_stays_within_root() {
        let patch = "--- a/src/../README.md\n+++ b/src/../README.md\n@@ -1,1 +1,1 @@\n-old\n+new\n";
        patch_targets(patch, Path::new("."))
            .await
            .expect("balanced traversal must pass");
    }

    #[tokio::test]
    async fn allows_normal_relative_paths() {
        let patch = "--- a/src/foo.rs\n+++ b/src/foo.rs\n@@ -1,1 +1,1 @@\n-old\n+new\n";
        patch_targets(patch, Path::new("."))
            .await
            .expect("normal patch must pass");
    }

    #[tokio::test]
    async fn allows_dev_null_for_create_or_delete() {
        let patch = "--- /dev/null\n+++ b/src/new_file.rs\n@@ -0,0 +1,1 @@\n+content\n";
        patch_targets(patch, Path::new("."))
            .await
            .expect("/dev/null half must pass");
        assert_eq!(
            names(patch).await.expect("names"),
            ["src/new_file.rs"],
            "the null device is never a target"
        );
    }

    /// A removed line that reads `-- /etc/passwd` is `--- /etc/passwd` in the
    /// hunk, and an added `++ ...` line is `+++ ...`. Git reads a hunk by its
    /// line counts, so neither is a header and neither names a file.
    #[tokio::test]
    async fn ignores_hunk_lines_that_look_like_headers() {
        let patch = concat!(
            "--- a/x.sql\n",
            "+++ b/x.sql\n",
            "@@ -1,2 +1,2 @@\n",
            "--- /etc/passwd\n",
            "+++ /etc/shadow\n",
            " keep\n",
        );
        assert_eq!(names(patch).await.expect("names"), ["x.sql"]);
        patch_targets(patch, Path::new("."))
            .await
            .expect("body lines must not trigger");
    }

    /// Git accepts a C-quoted name. Read off the header as text, the quotes
    /// stayed on and the name matched nothing.
    #[tokio::test]
    async fn a_quoted_name_is_the_file_git_writes() {
        let patch = "--- /dev/null\n+++ \"b/.mcp.json\"\n@@ -0,0 +1 @@\n+{}\n";
        assert_eq!(names(patch).await.expect("names"), [".mcp.json"]);
    }

    #[tokio::test]
    async fn an_octal_escape_in_a_quoted_name_is_decoded() {
        let patch = "--- /dev/null\n+++ \"b/.husk\\171/pre-commit\"\n@@ -0,0 +1 @@\n+exit 0\n";
        assert_eq!(names(patch).await.expect("names"), [".husky/pre-commit"]);
    }

    #[tokio::test]
    async fn a_rename_names_where_the_file_comes_from_and_where_it_goes() {
        let patch = "diff --git a/notes.json b/.vscode/mcp.json\n\
similarity index 100%\n\
rename from notes.json\n\
rename to .vscode/mcp.json\n";
        let mut read = names(patch).await.expect("names");
        read.sort();
        assert_eq!(read, [".vscode/mcp.json", "notes.json"]);
    }

    #[tokio::test]
    async fn a_name_with_spaces_is_kept_whole() {
        let patch = "--- \"a/docs/release notes.md\"\n+++ \"b/docs/release notes.md\"\n@@ -1 +1 @@\n-old\n+new\n";
        assert_eq!(
            names(patch).await.expect("names"),
            ["docs/release notes.md"]
        );
        let plain = "diff --git a/docs/release notes.md b/docs/release notes.md\n\
--- a/docs/release notes.md\n\
+++ b/docs/release notes.md\n\
@@ -1 +1 @@\n\
-old\n\
+new\n";
        assert_eq!(
            names(plain).await.expect("names"),
            ["docs/release notes.md"]
        );
    }

    #[test]
    fn a_gitlink_is_found_by_the_mode_in_its_header_and_nowhere_else() {
        use super::gitlink_in;

        let pointer = "diff --git a/libs/sm b/libs/sm\nindex 2540c75..ca9fde8 160000\n--- a/libs/sm\n+++ b/libs/sm\n@@ -1 +1 @@\n-Subproject commit 2540c75\n+Subproject commit ca9fde8\n";
        assert_eq!(gitlink_in(pointer), Some("diff --git a/libs/sm b/libs/sm"));
        for mode_line in [
            "new file mode 160000",
            "deleted file mode 160000",
            "old mode 160000",
            "new mode 160000\r",
        ] {
            let patch = format!(
                "diff --git a/src/a.rs b/src/a.rs\n--- a/src/a.rs\n+++ b/src/a.rs\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/vendor/x b/vendor/x\n{mode_line}\nindex 0000000..ca9fde8\n"
            );
            assert_eq!(
                gitlink_in(&patch),
                Some("diff --git a/vendor/x b/vendor/x"),
                "{mode_line:?}"
            );
        }
        for ordinary in [
            "diff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755\n",
            "diff --git a/a.txt b/a.txt\nindex 2540c75..ca9fde8 100644\n--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,2 @@\n new file mode 160000\n-index 1..2 160000\n+index 1..2 160000\n",
            "--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-new file mode 160000\n+x\n",
            "new file mode 160000\n",
        ] {
            assert_eq!(gitlink_in(ordinary), None, "{ordinary:?}");
        }
    }

    #[tokio::test]
    async fn a_patch_that_moves_a_submodule_is_refused_before_anything_is_applied() {
        let workspace = seeded_repo();
        std::fs::create_dir_all(workspace.path().join("libs/sm")).expect("submodule folder");
        std::fs::write(workspace.path().join("libs/sm/kept.txt"), "kept\n").expect("content");
        std::fs::write(workspace.path().join("example.txt"), "old\n").expect("seed file");
        let pointer = "diff --git a/example.txt b/example.txt\n--- a/example.txt\n+++ b/example.txt\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/libs/sm b/libs/sm\nindex 2540c75..ca9fde8 160000\n--- a/libs/sm\n+++ b/libs/sm\n@@ -1 +1 @@\n-Subproject commit 2540c75b5b7d3666938034759c9e7fcb59af8aac\n+Subproject commit ca9fde8200ee97c11a104cc015b216e668a2e656\n";

        let refusal = patch_targets(pointer, workspace.path())
            .await
            .expect_err("a submodule pointer is not a file to patch");
        assert!(refusal.contains("submodule"), "{refusal}");
        let error = apply_git_patch(pointer, Some(workspace.path()))
            .await
            .expect_err("nothing is reported as applied");
        assert!(error.to_string().contains("submodule"), "{error}");
        assert_eq!(
            std::fs::read_to_string(workspace.path().join("example.txt")).expect("read"),
            "old\n",
            "the ordinary file of the same patch was changed"
        );

        let folder = "--- a/libs/sm\n+++ b/libs/sm\n@@ -1 +1 @@\n-Subproject commit 2540c75\n+Subproject commit ca9fde8\n";
        let refusal = patch_targets(folder, workspace.path())
            .await
            .expect_err("a folder is not a file to patch");
        assert!(refusal.contains("is a folder"), "{refusal}");
    }

    #[tokio::test]
    async fn a_patch_whose_targets_cannot_be_established_is_refused() {
        for patch in ["", "not a patch\n", "--- a/x.rs\n+++ b/x.rs\n"] {
            let refusal = names(patch)
                .await
                .expect_err("nothing names what this would change");
            assert!(refusal.contains("cannot tell which files"), "{refusal}");
        }
        let corrupt = "--- a/x.rs\n+++ b/x.rs\n@@ -1,3 +1,3 @@\n-old line\n+new line\n";
        assert!(patch_targets(corrupt, Path::new(".")).await.is_err());
    }

    /// The link is committed with nothing at its target, so the file looks
    /// new. Following it is what shows where the write would land.
    #[cfg(unix)]
    #[tokio::test]
    async fn a_target_that_is_a_dangling_link_out_of_the_folder_is_refused() {
        let root = tempfile::tempdir().expect("root");
        let workspace = root.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace");
        std::os::unix::fs::symlink(root.path().join("outside.txt"), workspace.join("notes.txt"))
            .expect("dangling link");
        std::os::unix::fs::symlink("b", workspace.join("a")).expect("a to b");
        std::os::unix::fs::symlink("a", workspace.join("b")).expect("b to a");

        let leaving = "--- /dev/null\n+++ b/notes.txt\n@@ -0,0 +1 @@\n+x\n";
        let refusal = patch_targets(leaving, &workspace)
            .await
            .expect_err("the write would land outside the workspace");
        assert!(refusal.contains("outside project root"), "{refusal}");

        let looping = "--- /dev/null\n+++ b/a\n@@ -0,0 +1 @@\n+x\n";
        let refusal = patch_targets(looping, &workspace)
            .await
            .expect_err("nothing says where a loop lands");
        assert!(refusal.contains("loop of symbolic links"), "{refusal}");
    }

    /// Left to find the repository above it, git read these names through
    /// where the folder sits in that repository: the listing named one file
    /// and the apply wrote another, or skipped the file and exited 0.
    #[tokio::test]
    async fn below_a_repository_top_the_file_listed_is_the_file_written() {
        let repo = seeded_repo();
        let top = repo.path().canonicalize().expect("canonical repo");
        let below = top.join("a").join("b");
        std::fs::create_dir_all(&below).expect("nested folder");

        let plain = "--- /dev/null\n+++ b/b/secrets/x\n@@ -0,0 +1 @@\n+s\n";
        let targets = patch_targets(plain, &below).await.expect("targets");
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].name, "b/secrets/x");
        assert_eq!(targets[0].file, below.join("b/secrets/x"));
        let result = apply_git_patch(plain, Some(&below)).await.expect("apply");
        assert_eq!(result.exit_code, 0, "conflicted: {:?}", result.conflicted);
        assert!(below.join("b/secrets/x").is_file());
        assert!(!below.join("secrets").exists() && !top.join("b").exists());

        let git_style = "diff --git a/foo b/foo\n\
new file mode 100644\n\
--- /dev/null\n\
+++ b/foo\n\
@@ -0,0 +1 @@\n\
+x\n";
        let targets = patch_targets(git_style, &below).await.expect("targets");
        assert_eq!(targets[0].file, below.join("foo"));
        let result = apply_git_patch(git_style, Some(&below))
            .await
            .expect("apply");
        assert_eq!(result.exit_code, 0, "conflicted: {:?}", result.conflicted);
        assert!(
            below.join("foo").is_file(),
            "git skipped the file and the patch was reported as applied"
        );
        assert!(!top.join("foo").exists());
    }

    /// A `:` separates the entries of a ceiling on git's search, so a folder
    /// with one in its path was two ceilings, neither of them the folder.
    #[cfg(unix)]
    #[tokio::test]
    async fn a_colon_in_the_folder_does_not_let_git_find_the_repository_above() {
        let repo = seeded_repo();
        let top = repo.path().canonicalize().expect("canonical repo");
        let below = top.join("a:b").join("c");
        std::fs::create_dir_all(&below).expect("nested folder");
        let patch = "--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+x\n";

        let targets = patch_targets(patch, &below).await.expect("targets");
        assert_eq!(targets[0].name, "new.txt");
        assert_eq!(targets[0].file, below.join("new.txt"));
        let result = apply_git_patch(patch, Some(&below)).await.expect("apply");
        assert_eq!(result.exit_code, 0, "conflicted: {:?}", result.conflicted);
        assert!(below.join("new.txt").is_file());
    }

    /// A folder with a `.git` that is no repository is not one, and git is
    /// not left to go looking above it.
    #[tokio::test]
    async fn an_empty_git_folder_is_not_read_as_the_repository_above() {
        let repo = seeded_repo();
        let top = repo.path().canonicalize().expect("canonical repo");
        let below = top.join("vendored");
        std::fs::create_dir_all(below.join(".git")).expect("empty git folder");
        let patch = "--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+x\n";

        let targets = patch_targets(patch, &below).await.expect("targets");
        assert_eq!(targets[0].name, "new.txt");
    }

    #[tokio::test]
    async fn a_rename_is_held_to_the_file_it_was_checked_for() {
        let repo = seeded_repo();
        let top = repo.path().canonicalize().expect("canonical repo");
        std::fs::write(top.join("before.txt"), "kept\n").expect("seed file");
        let patch = "diff --git a/before.txt b/after.txt\n\
similarity index 100%\n\
rename from before.txt\n\
rename to after.txt\n";

        let targets = patch_targets(patch, &top).await.expect("targets");
        let named: Vec<&str> = targets.iter().map(|target| target.name.as_str()).collect();
        assert_eq!(named, ["after.txt", "before.txt"]);
        let result = apply_git_patch(patch, Some(&top)).await.expect("apply");
        assert_eq!(result.exit_code, 0, "conflicted: {:?}", result.conflicted);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_a_new_file_under_a_symlinked_parent() {
        let workspace = tempfile::tempdir().expect("workspace");
        let outside = tempfile::tempdir().expect("outside");
        std::os::unix::fs::symlink(outside.path(), workspace.path().join("linked"))
            .expect("create symlink");
        let patch = "--- /dev/null\n+++ b/linked/planted.sh\n@@ -0,0 +1 @@\n+echo planted\n";

        let err = patch_targets(patch, workspace.path()).await.unwrap_err();

        assert!(err.contains("outside project root"), "got: {err}");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_a_rename_into_a_symlinked_parent() {
        let workspace = tempfile::tempdir().expect("workspace");
        let outside = tempfile::tempdir().expect("outside");
        std::fs::write(workspace.path().join("notes.txt"), "kept\n").expect("seed file");
        std::os::unix::fs::symlink(outside.path(), workspace.path().join("linked"))
            .expect("create symlink");
        let patch = "diff --git a/notes.txt b/linked/notes.txt\n\
similarity index 100%\n\
rename from notes.txt\n\
rename to linked/notes.txt\n";

        let err = patch_targets(patch, workspace.path()).await.unwrap_err();

        assert!(err.contains("outside project root"), "got: {err}");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_an_empty_new_file_under_a_symlinked_parent() {
        let workspace = tempfile::tempdir().expect("workspace");
        let outside = tempfile::tempdir().expect("outside");
        std::os::unix::fs::symlink(outside.path(), workspace.path().join("linked"))
            .expect("create symlink");
        let patch = "diff --git a/linked/planted b/linked/planted\n\
new file mode 100644\n\
index 0000000..e69de29\n";

        assert!(patch_targets(patch, workspace.path()).await.is_err());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_a_target_that_is_a_link_inside_the_workspace() {
        let workspace = tempfile::tempdir().expect("workspace");
        std::fs::write(workspace.path().join("notes.txt"), "kept\n").expect("seed file");
        std::os::unix::fs::symlink("notes.txt", workspace.path().join("alias.txt"))
            .expect("create symlink");
        let patch = "--- a/alias.txt\n+++ b/alias.txt\n@@ -1 +1 @@\n-kept\n+changed\n";

        let err = patch_targets(patch, workspace.path()).await.unwrap_err();

        assert!(err.contains("symbolic link target"), "got: {err}");
    }

    #[tokio::test]
    async fn rejects_a_patch_that_makes_a_symbolic_link() {
        let workspace = tempfile::tempdir().expect("workspace");
        let patch = "diff --git a/alias b/alias\nnew file mode 120000\n--- /dev/null\n+++ b/alias\n@@ -0,0 +1 @@\n+docs\n";

        let err = patch_targets(patch, workspace.path()).await.unwrap_err();

        assert!(err.contains("symbolic link creation"), "got: {err}");
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
