//! Guided merge-conflict resolution: conflict markers read as base/ours/theirs
//! hunks, a resolution applied through `apply_patch`, staged, and the repo's.

use std::fmt;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{anyhow, Context, Result};

use crate::platform::runtime::git::{ConflictedPath, GitApi};

const OURS_MARKER: &str = "<<<<<<<";
const BASE_MARKER: &str = "|||||||";
const SPLIT_MARKER: &str = "=======";
const THEIRS_MARKER: &str = ">>>>>>>";
const PATCH_CONTEXT_LINES: usize = 3;
const TEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(900);

/// Which of the three versions of a conflicted region a caller wants.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConflictSide {
    Base,
    Ours,
    Theirs,
}

impl ConflictSide {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "base" | "ancestor" | "common" => Some(Self::Base),
            "ours" | "mine" | "local" => Some(Self::Ours),
            "theirs" | "remote" => Some(Self::Theirs),
            _ => None,
        }
    }

    /// The index stage git records this side under in a conflicted merge.
    pub fn index_stage(self) -> u8 {
        match self {
            Self::Base => 1,
            Self::Ours => 2,
            Self::Theirs => 3,
        }
    }
}

impl fmt::Display for ConflictSide {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            Self::Base => "base",
            Self::Ours => "ours",
            Self::Theirs => "theirs",
        };
        f.write_str(name)
    }
}

/// One `<<<<<<< / ======= / >>>>>>>` region. `base` is present only when the
/// merge was run with `diff3`/`zdiff3` conflict style.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConflictHunk {
    pub index: usize,
    pub start_line: usize,
    pub end_line: usize,
    pub ours_label: String,
    pub base_label: Option<String>,
    pub theirs_label: String,
    pub ours: Vec<String>,
    pub base: Option<Vec<String>>,
    pub theirs: Vec<String>,
}

impl ConflictHunk {
    pub fn side(&self, side: ConflictSide) -> Option<&[String]> {
        match side {
            ConflictSide::Ours => Some(&self.ours),
            ConflictSide::Theirs => Some(&self.theirs),
            ConflictSide::Base => self.base.as_deref(),
        }
    }

    pub fn label(&self, side: ConflictSide) -> Option<&str> {
        match side {
            ConflictSide::Ours => Some(self.ours_label.as_str()),
            ConflictSide::Theirs => Some(self.theirs_label.as_str()),
            ConflictSide::Base => self.base_label.as_deref(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConflictedFile {
    pub path: PathBuf,
    pub lines: Vec<String>,
    pub hunks: Vec<ConflictHunk>,
    pub trailing_newline: bool,
}

impl ConflictedFile {
    pub fn is_conflicted(&self) -> bool {
        !self.hunks.is_empty()
    }

    /// The whole file as one side would have it, for a reader that wants to see
    /// `theirs` end to end rather than hunk by hunk.
    pub fn as_side(&self, side: ConflictSide) -> Option<String> {
        let mut resolutions = Vec::with_capacity(self.hunks.len());
        for hunk in &self.hunks {
            resolutions.push((hunk.index, Resolution::Take(side)));
        }
        render_resolution(self, &resolutions).ok()
    }

    /// A reader's view of every hunk: which lines, which labels, how many lines
    /// each side contributes.
    pub fn outline(&self) -> Vec<String> {
        self.hunks
            .iter()
            .map(|hunk| {
                let base = hunk.base.as_ref().map_or_else(
                    || "no base".to_string(),
                    |lines| format!("{} base", lines.len()),
                );
                format!(
                    "hunk {} lines {}-{}: {} ours ({}), {}, {} theirs ({})",
                    hunk.index,
                    hunk.start_line,
                    hunk.end_line,
                    hunk.ours.len(),
                    hunk.ours_label,
                    base,
                    hunk.theirs.len(),
                    hunk.theirs_label
                )
            })
            .collect()
    }
}

/// What to put in place of one conflicted region. There is no default: a hunk
/// with no resolution refuses the whole file rather than picking a side.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Resolution {
    Take(ConflictSide),
    /// Ours then theirs, in that order, with no separator.
    Union,
    Custom(Vec<String>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolveRefusal {
    Unresolved(Vec<usize>),
    UnknownHunk(usize),
    MissingBase(usize),
    MarkersInResolution(usize),
}

impl fmt::Display for ResolveRefusal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unresolved(indexes) => write!(
                f,
                "hunk(s) {} have no resolution; a conflict is never resolved by picking a side silently",
                indexes
                    .iter()
                    .map(usize::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            Self::UnknownHunk(index) => write!(f, "hunk {index} does not exist in this file"),
            Self::MissingBase(index) => write!(
                f,
                "hunk {index} has no base side; re-run the merge with conflictStyle=diff3 to get one"
            ),
            Self::MarkersInResolution(index) => {
                write!(f, "the resolution for hunk {index} still contains conflict markers")
            }
        }
    }
}

impl std::error::Error for ResolveRefusal {}

pub fn has_conflict_markers(text: &str) -> bool {
    text.lines().any(|line| {
        line.starts_with(OURS_MARKER)
            || line.starts_with(SPLIT_MARKER)
            || line.starts_with(THEIRS_MARKER)
    })
}

fn marker_label(line: &str, marker: &str) -> String {
    line.strip_prefix(marker)
        .unwrap_or_default()
        .trim()
        .to_string()
}

/// Parse conflict markers into addressable hunks. Line numbers are 1-based and
/// name the marker lines themselves, so a replacement covers the markers too.
pub fn parse_conflicts(path: &Path, text: &str) -> ConflictedFile {
    let trailing_newline = text.ends_with('\n');
    let lines: Vec<String> = text
        .strip_suffix('\n')
        .unwrap_or(text)
        .split('\n')
        .map(str::to_string)
        .collect();
    let lines = if text.is_empty() { Vec::new() } else { lines };

    let mut hunks = Vec::new();
    let mut cursor = 0usize;
    while cursor < lines.len() {
        if !lines[cursor].starts_with(OURS_MARKER) {
            cursor += 1;
            continue;
        }
        let start_line = cursor + 1;
        let ours_label = marker_label(&lines[cursor], OURS_MARKER);
        let mut ours = Vec::new();
        let mut base: Option<Vec<String>> = None;
        let mut base_label = None;
        let mut theirs = Vec::new();
        let mut section = ConflictSide::Ours;
        let mut closed = None;

        let mut scan = cursor + 1;
        while scan < lines.len() {
            let line = &lines[scan];
            if line.starts_with(BASE_MARKER) {
                base_label = Some(marker_label(line, BASE_MARKER));
                base = Some(Vec::new());
                section = ConflictSide::Base;
            } else if line.starts_with(SPLIT_MARKER) {
                section = ConflictSide::Theirs;
            } else if line.starts_with(THEIRS_MARKER) {
                closed = Some((scan, marker_label(line, THEIRS_MARKER)));
                break;
            } else {
                match section {
                    ConflictSide::Ours => ours.push(line.clone()),
                    ConflictSide::Base => {
                        if let Some(base) = base.as_mut() {
                            base.push(line.clone());
                        }
                    }
                    ConflictSide::Theirs => theirs.push(line.clone()),
                }
            }
            scan += 1;
        }

        let Some((end_index, theirs_label)) = closed else {
            // An unterminated marker is not a hunk; leave the rest as content.
            cursor += 1;
            continue;
        };
        hunks.push(ConflictHunk {
            index: hunks.len() + 1,
            start_line,
            end_line: end_index + 1,
            ours_label,
            base_label,
            theirs_label,
            ours,
            base,
            theirs,
        });
        cursor = end_index + 1;
    }

    ConflictedFile {
        path: path.to_path_buf(),
        lines,
        hunks,
        trailing_newline,
    }
}

fn resolved_lines(
    hunk: &ConflictHunk,
    resolution: &Resolution,
) -> Result<Vec<String>, ResolveRefusal> {
    let lines = match resolution {
        Resolution::Take(side) => hunk
            .side(*side)
            .ok_or(ResolveRefusal::MissingBase(hunk.index))?
            .to_vec(),
        Resolution::Union => {
            let mut merged = hunk.ours.clone();
            merged.extend(hunk.theirs.iter().cloned());
            merged
        }
        Resolution::Custom(lines) => lines.clone(),
    };
    if lines.iter().any(|line| {
        line.starts_with(OURS_MARKER)
            || line.starts_with(SPLIT_MARKER)
            || line.starts_with(THEIRS_MARKER)
    }) {
        return Err(ResolveRefusal::MarkersInResolution(hunk.index));
    }
    Ok(lines)
}

struct ResolvedRegion {
    old_start: usize,
    old_end: usize,
    new_lines: Vec<String>,
}

fn regions(
    file: &ConflictedFile,
    resolutions: &[(usize, Resolution)],
) -> Result<Vec<ResolvedRegion>, ResolveRefusal> {
    for (index, _) in resolutions {
        if !file.hunks.iter().any(|hunk| hunk.index == *index) {
            return Err(ResolveRefusal::UnknownHunk(*index));
        }
    }
    let unresolved: Vec<usize> = file
        .hunks
        .iter()
        .filter(|hunk| !resolutions.iter().any(|(index, _)| *index == hunk.index))
        .map(|hunk| hunk.index)
        .collect();
    if !unresolved.is_empty() {
        return Err(ResolveRefusal::Unresolved(unresolved));
    }

    let mut regions = Vec::with_capacity(file.hunks.len());
    for hunk in &file.hunks {
        let resolution = resolutions
            .iter()
            .rev()
            .find(|(index, _)| *index == hunk.index)
            .map(|(_, resolution)| resolution)
            .ok_or(ResolveRefusal::Unresolved(vec![hunk.index]))?;
        regions.push(ResolvedRegion {
            old_start: hunk.start_line,
            old_end: hunk.end_line,
            new_lines: resolved_lines(hunk, resolution)?,
        });
    }
    Ok(regions)
}

/// The file with every conflicted region replaced by its resolution. Refuses
/// unless every hunk has one.
pub fn render_resolution(
    file: &ConflictedFile,
    resolutions: &[(usize, Resolution)],
) -> Result<String, ResolveRefusal> {
    let regions = regions(file, resolutions)?;
    let mut out: Vec<String> = Vec::with_capacity(file.lines.len());
    let mut cursor = 1usize;
    for region in &regions {
        while cursor < region.old_start {
            out.push(file.lines[cursor - 1].clone());
            cursor += 1;
        }
        out.extend(region.new_lines.iter().cloned());
        cursor = region.old_end + 1;
    }
    while cursor <= file.lines.len() {
        out.push(file.lines[cursor - 1].clone());
        cursor += 1;
    }

    let mut text = out.join("\n");
    if file.trailing_newline && !text.is_empty() {
        text.push('\n');
    }
    Ok(text)
}

/// A unified diff turning the conflicted file into its resolution, so the
/// resolution lands through the same `apply_patch` path as any other edit.
pub fn resolution_patch(
    relative_path: &Path,
    file: &ConflictedFile,
    resolutions: &[(usize, Resolution)],
) -> Result<String, ResolveRefusal> {
    let regions = regions(file, resolutions)?;
    if regions.is_empty() {
        return Ok(String::new());
    }

    let display = relative_path.to_string_lossy().replace('\\', "/");
    let total = file.lines.len();
    let mut body = String::new();
    let mut offset: i64 = 0;
    let mut index = 0usize;

    while index < regions.len() {
        let mut group_end = index;
        while group_end + 1 < regions.len()
            && regions[group_end + 1]
                .old_start
                .saturating_sub(regions[group_end].old_end)
                <= 2 * PATCH_CONTEXT_LINES + 1
        {
            group_end += 1;
        }

        let context_start = regions[index]
            .old_start
            .saturating_sub(PATCH_CONTEXT_LINES)
            .max(1);
        let context_end = (regions[group_end].old_end + PATCH_CONTEXT_LINES).min(total);
        let mut hunk_body = String::new();
        let mut old_count = 0usize;
        let mut new_count = 0usize;
        let mut cursor = context_start;

        let emit = |prefix: char, line: &str, is_last_old_line: bool, body: &mut String| {
            body.push(prefix);
            body.push_str(line);
            body.push('\n');
            if is_last_old_line && !file.trailing_newline {
                body.push_str("\\ No newline at end of file\n");
            }
        };

        for region in &regions[index..=group_end] {
            while cursor < region.old_start {
                emit(
                    ' ',
                    &file.lines[cursor - 1],
                    cursor == total,
                    &mut hunk_body,
                );
                old_count += 1;
                new_count += 1;
                cursor += 1;
            }
            for line in region.old_start..=region.old_end {
                emit('-', &file.lines[line - 1], line == total, &mut hunk_body);
                old_count += 1;
            }
            let last_new = region.old_end == total;
            for (position, line) in region.new_lines.iter().enumerate() {
                emit(
                    '+',
                    line,
                    last_new && position + 1 == region.new_lines.len(),
                    &mut hunk_body,
                );
                new_count += 1;
            }
            cursor = region.old_end + 1;
        }
        while cursor <= context_end {
            emit(
                ' ',
                &file.lines[cursor - 1],
                cursor == total,
                &mut hunk_body,
            );
            old_count += 1;
            new_count += 1;
            cursor += 1;
        }

        let new_start = i64::try_from(context_start).unwrap_or(1) + offset;
        body.push_str(&format!(
            "@@ -{context_start},{old_count} +{new_start},{new_count} @@\n"
        ));
        body.push_str(&hunk_body);
        offset += i64::try_from(new_count).unwrap_or(0) - i64::try_from(old_count).unwrap_or(0);
        index = group_end + 1;
    }

    Ok(format!(
        "diff --git a/{display} b/{display}\n--- a/{display}\n+++ b/{display}\n{body}"
    ))
}

// ---------------------------------------------------------------------------
// Repository side: stages, staging, tests.

fn git_stdout(root: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Paths git reports as unmerged, with the kind of conflict on each, from the
/// typed git API rather than a second status parser.
pub async fn conflicted_paths(root: &Path) -> Result<Vec<ConflictedPath>> {
    GitApi::at(root.to_path_buf()).conflicts().await
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ConflictStages {
    pub base: Option<String>,
    pub ours: Option<String>,
    pub theirs: Option<String>,
}

impl ConflictStages {
    pub fn side(&self, side: ConflictSide) -> Option<&str> {
        match side {
            ConflictSide::Base => self.base.as_deref(),
            ConflictSide::Ours => self.ours.as_deref(),
            ConflictSide::Theirs => self.theirs.as_deref(),
        }
    }
}

/// The three versions git kept in the index for an unmerged path. This is the
/// authoritative reader: the markers in the working tree are a rendering of it.
pub fn read_conflict_stages(root: &Path, relative_path: &Path) -> ConflictStages {
    let display = relative_path.to_string_lossy().replace('\\', "/");
    let read = |stage: u8| git_stdout(root, &["show", &format!(":{stage}:{display}")]);
    ConflictStages {
        base: read(ConflictSide::Base.index_stage()),
        ours: read(ConflictSide::Ours.index_stage()),
        theirs: read(ConflictSide::Theirs.index_stage()),
    }
}

/// Stage a resolved file. Refuses while conflict markers remain, so a partial
/// resolution can never be recorded as a finished one.
pub async fn stage_resolution(root: &Path, relative_path: &Path) -> Result<()> {
    let absolute = root.join(relative_path);
    let text = std::fs::read_to_string(&absolute)
        .with_context(|| format!("reading {} to stage it", absolute.display()))?;
    if has_conflict_markers(&text) {
        return Err(anyhow!(
            "{} still contains conflict markers; resolve every hunk before staging",
            relative_path.display()
        ));
    }
    GitApi::at(root.to_path_buf())
        .stage(&[relative_path.to_path_buf()])
        .await?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TestCommand {
    pub program: String,
    pub args: Vec<String>,
}

impl fmt::Display for TestCommand {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} {}", self.program, self.args.join(" "))
    }
}

fn package_json_has_test_script(root: &Path) -> bool {
    let Ok(text) = std::fs::read_to_string(root.join("package.json")) else {
        return false;
    };
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|value| {
            value
                .get("scripts")
                .and_then(|scripts| scripts.get("test"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_string)
        })
        .is_some_and(|script| !script.trim().is_empty())
}

fn makefile_has_test_target(root: &Path) -> bool {
    ["Makefile", "makefile", "GNUmakefile"]
        .iter()
        .filter_map(|name| std::fs::read_to_string(root.join(name)).ok())
        .any(|text| text.lines().any(|line| line.starts_with("test:")))
}

/// The test command this repository already declares. Nothing is invented: a
/// repository with no declared test command gets none.
pub fn detect_test_command(root: &Path) -> Option<TestCommand> {
    let command = |program: &str, args: &[&str]| TestCommand {
        program: program.to_string(),
        args: args.iter().map(|arg| (*arg).to_string()).collect(),
    };
    if root.join("Cargo.toml").exists() {
        return Some(command("cargo", &["test"]));
    }
    if package_json_has_test_script(root) {
        let manager = crate::context::detect_package_manager(&root.to_string_lossy());
        let program = match manager.as_deref() {
            Some("pnpm") => "pnpm",
            Some("yarn") => "yarn",
            Some("bun") => "bun",
            _ => "npm",
        };
        let args: &[&str] = if program == "npm" {
            &["test", "--silent"]
        } else {
            &["test"]
        };
        return Some(command(program, args));
    }
    if root.join("go.mod").exists() {
        return Some(command("go", &["test", "./..."]));
    }
    if root.join("pytest.ini").exists() || root.join("pyproject.toml").exists() {
        return Some(command("pytest", &["-q"]));
    }
    if makefile_has_test_target(root) {
        return Some(command("make", &["test"]));
    }
    None
}

#[derive(Debug, Clone)]
pub struct TestRun {
    pub command: String,
    pub success: bool,
    pub output: String,
}

/// Run the detected test command from `root`, or report that none is declared.
pub async fn run_post_resolution_tests(root: &Path) -> Result<Option<TestRun>> {
    let Some(test) = detect_test_command(root) else {
        return Ok(None);
    };
    let mut command = tokio::process::Command::new(&test.program);
    command.args(&test.args).current_dir(root);
    let output = crate::process_tree::output(command, None, Some(TEST_TIMEOUT)).await?;
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    Ok(Some(TestRun {
        command: test.to_string(),
        success: output.status.success(),
        output: text,
    }))
}

#[derive(Debug, Clone)]
pub struct ResolutionOutcome {
    pub path: PathBuf,
    pub hunks: usize,
    pub patch: String,
    pub applied: bool,
    pub staged: bool,
    pub tests: Option<TestRun>,
}

impl ResolutionOutcome {
    pub fn summary(&self) -> String {
        let mut parts = vec![format!(
            "{}: {} hunk(s) resolved",
            self.path.display(),
            self.hunks
        )];
        parts.push(if self.staged {
            "staged".to_string()
        } else {
            "not staged".to_string()
        });
        if let Some(tests) = &self.tests {
            parts.push(format!(
                "{} {}",
                tests.command,
                if tests.success { "passed" } else { "failed" }
            ));
        }
        parts.join(", ")
    }
}

/// Resolve one conflicted file end to end: render the resolution, apply it as a
/// patch, stage it, and run the repository's test command.
pub async fn resolve_conflicted_file(
    root: &Path,
    relative_path: &Path,
    resolutions: &[(usize, Resolution)],
    run_tests: bool,
) -> Result<ResolutionOutcome> {
    let absolute = root.join(relative_path);
    let text = std::fs::read_to_string(&absolute)
        .with_context(|| format!("reading {}", absolute.display()))?;
    let file = parse_conflicts(relative_path, &text);
    if !file.is_conflicted() {
        return Err(anyhow!(
            "{} has no conflict markers to resolve",
            relative_path.display()
        ));
    }

    let patch = resolution_patch(relative_path, &file, resolutions)?;
    let result = crate::apply_patch::apply_git_patch(&patch, Some(root)).await?;
    if result.exit_code != 0 {
        return Err(anyhow!(
            "applying the resolution failed: {}",
            result.conflicted.join("; ")
        ));
    }

    stage_resolution(root, relative_path).await?;
    let tests = if run_tests {
        run_post_resolution_tests(root).await?
    } else {
        None
    };

    Ok(ResolutionOutcome {
        path: relative_path.to_path_buf(),
        hunks: file.hunks.len(),
        patch,
        applied: true,
        staged: true,
        tests,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const DIFF3: &str = "head\n<<<<<<< HEAD\nours one\nours two\n||||||| base\nbase one\n=======\ntheirs one\n>>>>>>> feature\ntail\n";

    fn run(dir: &Path, args: &[&str]) {
        let output = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .env("GIT_AUTHOR_NAME", "t")
            .env("GIT_AUTHOR_EMAIL", "t@example.test")
            .env("GIT_COMMITTER_NAME", "t")
            .env("GIT_COMMITTER_EMAIL", "t@example.test")
            .output()
            .expect("git runs");
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    /// A repository whose `main` and `feature` both edited the same line, left
    /// mid-merge so the working tree holds real conflict markers.
    fn conflicted_repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        run(root, &["init", "--initial-branch=main", "."]);
        run(root, &["config", "merge.conflictStyle", "diff3"]);
        std::fs::write(root.join("app.txt"), "first\nshared\nlast\n").unwrap();
        run(root, &["add", "app.txt"]);
        run(root, &["commit", "-m", "seed"]);
        run(root, &["checkout", "-b", "feature"]);
        std::fs::write(root.join("app.txt"), "first\ntheirs\nlast\n").unwrap();
        run(root, &["commit", "-am", "theirs"]);
        run(root, &["checkout", "main"]);
        std::fs::write(root.join("app.txt"), "first\nours\nlast\n").unwrap();
        run(root, &["commit", "-am", "ours"]);
        let merge = Command::new("git")
            .arg("-C")
            .arg(root)
            .args(["merge", "feature"])
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .env("GIT_AUTHOR_NAME", "t")
            .env("GIT_AUTHOR_EMAIL", "t@example.test")
            .env("GIT_COMMITTER_NAME", "t")
            .env("GIT_COMMITTER_EMAIL", "t@example.test")
            .output()
            .expect("git runs");
        assert!(!merge.status.success(), "the merge must conflict");
        assert!(
            String::from_utf8_lossy(&merge.stdout).contains("CONFLICT"),
            "the merge must stop on a content conflict: {}",
            String::from_utf8_lossy(&merge.stderr)
        );
        dir
    }

    #[test]
    fn markers_parse_into_three_addressable_sides() {
        let file = parse_conflicts(Path::new("app.txt"), DIFF3);

        assert_eq!(file.hunks.len(), 1);
        let hunk = &file.hunks[0];
        assert_eq!(hunk.start_line, 2);
        assert_eq!(hunk.end_line, 9);
        assert_eq!(hunk.ours, vec!["ours one", "ours two"]);
        assert_eq!(
            hunk.base.as_deref(),
            Some(["base one".to_string()].as_slice())
        );
        assert_eq!(hunk.theirs, vec!["theirs one"]);
        assert_eq!(hunk.ours_label, "HEAD");
        assert_eq!(hunk.theirs_label, "feature");
        assert_eq!(hunk.label(ConflictSide::Base), Some("base"));
        assert!(file.outline()[0].contains("hunk 1 lines 2-9"));
    }

    #[test]
    fn each_side_can_be_read_as_a_whole_file() {
        let file = parse_conflicts(Path::new("app.txt"), DIFF3);

        assert_eq!(
            file.as_side(ConflictSide::Ours).unwrap(),
            "head\nours one\nours two\ntail\n"
        );
        assert_eq!(
            file.as_side(ConflictSide::Theirs).unwrap(),
            "head\ntheirs one\ntail\n"
        );
        assert_eq!(
            file.as_side(ConflictSide::Base).unwrap(),
            "head\nbase one\ntail\n"
        );
    }

    #[test]
    fn a_hunk_without_a_resolution_refuses_the_whole_file() {
        let two =
            "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> f\nmid\n<<<<<<< HEAD\nc\n=======\nd\n>>>>>>> f\n";
        let file = parse_conflicts(Path::new("app.txt"), two);
        assert_eq!(file.hunks.len(), 2);

        let refusal = render_resolution(&file, &[(1, Resolution::Take(ConflictSide::Ours))])
            .expect_err("an unresolved hunk refuses");

        assert_eq!(refusal, ResolveRefusal::Unresolved(vec![2]));
        assert!(refusal
            .to_string()
            .contains("never resolved by picking a side"));
    }

    #[test]
    fn a_resolution_that_reintroduces_markers_is_refused() {
        let file = parse_conflicts(Path::new("app.txt"), DIFF3);

        let refusal = render_resolution(
            &file,
            &[(1, Resolution::Custom(vec!["<<<<<<< HEAD".to_string()]))],
        )
        .expect_err("markers are refused");

        assert_eq!(refusal, ResolveRefusal::MarkersInResolution(1));
    }

    #[test]
    fn a_base_side_is_refused_when_the_merge_recorded_none() {
        let two_way = "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> f\n";
        let file = parse_conflicts(Path::new("app.txt"), two_way);

        let refusal = render_resolution(&file, &[(1, Resolution::Take(ConflictSide::Base))])
            .expect_err("no base recorded");

        assert_eq!(refusal, ResolveRefusal::MissingBase(1));
        assert_eq!(
            render_resolution(&file, &[(1, Resolution::Union)]).unwrap(),
            "a\nb\n"
        );
    }

    #[test]
    fn an_unknown_hunk_index_is_refused() {
        let file = parse_conflicts(Path::new("app.txt"), DIFF3);

        assert_eq!(
            render_resolution(&file, &[(9, Resolution::Union)]).expect_err("no hunk 9"),
            ResolveRefusal::UnknownHunk(9)
        );
    }

    #[tokio::test]
    async fn the_index_keeps_all_three_sides_of_an_unmerged_path() {
        let dir = conflicted_repo();
        let root = dir.path();

        let unmerged = conflicted_paths(root).await.expect("status reads");
        assert_eq!(unmerged.len(), 1);
        assert_eq!(unmerged[0].path, PathBuf::from("app.txt"));
        let stages = read_conflict_stages(root, Path::new("app.txt"));

        assert_eq!(
            stages.side(ConflictSide::Base),
            Some("first\nshared\nlast\n")
        );
        assert_eq!(stages.side(ConflictSide::Ours), Some("first\nours\nlast\n"));
        assert_eq!(
            stages.side(ConflictSide::Theirs),
            Some("first\ntheirs\nlast\n")
        );
    }

    #[tokio::test]
    async fn the_workflow_resolves_applies_stages_and_leaves_the_file_clean() {
        let dir = conflicted_repo();
        let root = dir.path().canonicalize().unwrap();
        let relative = Path::new("app.txt");

        let outcome = resolve_conflicted_file(
            &root,
            relative,
            &[(1, Resolution::Custom(vec!["merged".to_string()]))],
            false,
        )
        .await
        .expect("the workflow resolves");

        assert_eq!(outcome.hunks, 1);
        assert!(outcome.applied && outcome.staged);
        assert!(outcome.patch.contains("--- a/app.txt"));
        let text = std::fs::read_to_string(root.join("app.txt")).unwrap();
        assert_eq!(text, "first\nmerged\nlast\n");
        assert!(!has_conflict_markers(&text));
        assert!(conflicted_paths(&root).await.unwrap().is_empty());
        assert!(outcome.summary().contains("staged"));
    }

    #[tokio::test]
    async fn staging_is_refused_while_a_marker_remains() {
        let dir = conflicted_repo();
        let root = dir.path().canonicalize().unwrap();

        let error = stage_resolution(&root, Path::new("app.txt"))
            .await
            .expect_err("markers block staging");

        assert!(error
            .to_string()
            .contains("still contains conflict markers"));
    }

    #[tokio::test]
    async fn a_multi_hunk_resolution_applies_as_one_patch() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        run(&root, &["init", "--initial-branch=main", "."]);
        let conflicted = "alpha\n<<<<<<< HEAD\none\n=======\n1\n>>>>>>> f\nbravo\ncharlie\ndelta\necho\nfoxtrot\n<<<<<<< HEAD\ntwo\n=======\n2\n>>>>>>> f\ngolf\n";
        std::fs::write(root.join("app.txt"), conflicted).unwrap();
        run(&root, &["add", "app.txt"]);
        run(&root, &["commit", "-m", "conflicted"]);

        let file = parse_conflicts(Path::new("app.txt"), conflicted);
        let resolutions = vec![
            (1, Resolution::Take(ConflictSide::Ours)),
            (2, Resolution::Take(ConflictSide::Theirs)),
        ];
        let expected = render_resolution(&file, &resolutions).unwrap();
        let patch = resolution_patch(Path::new("app.txt"), &file, &resolutions).unwrap();

        let result = crate::apply_patch::apply_git_patch(&patch, Some(&root))
            .await
            .expect("patch applies");

        assert_eq!(result.exit_code, 0, "{:?}", result.conflicted);
        assert_eq!(
            std::fs::read_to_string(root.join("app.txt")).unwrap(),
            expected
        );
        assert_eq!(
            expected,
            "alpha\none\nbravo\ncharlie\ndelta\necho\nfoxtrot\n2\ngolf\n"
        );
    }

    #[test]
    fn the_test_command_comes_from_what_the_repository_declares() {
        let dir = tempfile::tempdir().unwrap();
        assert!(detect_test_command(dir.path()).is_none());

        std::fs::write(
            dir.path().join("package.json"),
            r#"{"scripts":{"test":"vitest run"}}"#,
        )
        .unwrap();
        std::fs::write(dir.path().join("pnpm-lock.yaml"), "lockfileVersion: 9\n").unwrap();
        assert_eq!(
            detect_test_command(dir.path()).unwrap().to_string(),
            "pnpm test"
        );

        std::fs::write(dir.path().join("Cargo.toml"), "[package]\nname = \"x\"\n").unwrap();
        assert_eq!(
            detect_test_command(dir.path()).unwrap().to_string(),
            "cargo test"
        );
    }

    #[tokio::test]
    async fn a_repository_with_no_declared_tests_reports_none() {
        let dir = tempfile::tempdir().unwrap();

        assert!(run_post_resolution_tests(dir.path())
            .await
            .unwrap()
            .is_none());
    }
}
