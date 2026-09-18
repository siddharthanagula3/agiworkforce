//! Structural model of a unified diff shared by apply_patch, the TUI review and /copy diff.
//! Not used by `validate_patch_targets`: that gate over-matches on purpose and must stay strict.

use std::path::{Path, PathBuf};

/// What happened to one file, as the diff itself states it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
}

impl FileChangeKind {
    pub fn label(self) -> &'static str {
        match self {
            FileChangeKind::Added => "added",
            FileChangeKind::Modified => "modified",
            FileChangeKind::Deleted => "deleted",
            FileChangeKind::Renamed => "renamed",
        }
    }

    /// Single-character status, the same letters `git diff --name-status` uses.
    pub fn code(self) -> char {
        match self {
            FileChangeKind::Added => 'A',
            FileChangeKind::Modified => 'M',
            FileChangeKind::Deleted => 'D',
            FileChangeKind::Renamed => 'R',
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DiffLine {
    Context(String),
    Added(String),
    Removed(String),
}

impl DiffLine {
    pub fn text(&self) -> &str {
        match self {
            DiffLine::Context(t) | DiffLine::Added(t) | DiffLine::Removed(t) => t,
        }
    }

    pub fn render(&self) -> String {
        match self {
            DiffLine::Context(t) => format!(" {t}"),
            DiffLine::Added(t) => format!("+{t}"),
            DiffLine::Removed(t) => format!("-{t}"),
        }
    }
}

/// One `@@` block. Addressable: a reviewer can accept or reject this hunk
/// without re-splitting the file's diff text.
#[derive(Debug, Clone)]
pub struct DiffHunk {
    pub old_start: usize,
    pub old_lines: usize,
    pub new_start: usize,
    pub new_lines: usize,
    pub section: String,
    pub lines: Vec<DiffLine>,
}

impl DiffHunk {
    pub fn header(&self) -> String {
        let head = format!(
            "@@ -{},{} +{},{} @@",
            self.old_start, self.old_lines, self.new_start, self.new_lines
        );
        if self.section.is_empty() {
            head
        } else {
            format!("{head} {}", self.section)
        }
    }

    pub fn additions(&self) -> usize {
        self.lines
            .iter()
            .filter(|l| matches!(l, DiffLine::Added(_)))
            .count()
    }

    pub fn deletions(&self) -> usize {
        self.lines
            .iter()
            .filter(|l| matches!(l, DiffLine::Removed(_)))
            .count()
    }
}

#[derive(Debug, Clone)]
pub struct FileDiff {
    pub old_path: Option<PathBuf>,
    pub new_path: Option<PathBuf>,
    pub kind: FileChangeKind,
    pub binary: bool,
    pub hunks: Vec<DiffHunk>,
}

impl FileDiff {
    /// The path a reader should see: where the file ends up, or where it was
    /// for a deletion.
    pub fn path(&self) -> &Path {
        self.new_path
            .as_deref()
            .or(self.old_path.as_deref())
            .unwrap_or_else(|| Path::new(""))
    }

    pub fn additions(&self) -> usize {
        self.hunks.iter().map(DiffHunk::additions).sum()
    }

    pub fn deletions(&self) -> usize {
        self.hunks.iter().map(DiffHunk::deletions).sum()
    }

    /// `M  src/x.rs  +12 -3`, the one-line summary every surface shows.
    pub fn summary(&self) -> String {
        let suffix = if self.binary { "  (binary)" } else { "" };
        match (self.kind, &self.old_path) {
            (FileChangeKind::Renamed, Some(from)) => format!(
                "{}  {} (from {})  +{} -{}{suffix}",
                self.kind.code(),
                self.path().display(),
                from.display(),
                self.additions(),
                self.deletions()
            ),
            _ => format!(
                "{}  {}  +{} -{}{suffix}",
                self.kind.code(),
                self.path().display(),
                self.additions(),
                self.deletions()
            ),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Diff {
    pub files: Vec<FileDiff>,
}

impl Diff {
    pub fn is_empty(&self) -> bool {
        self.files.is_empty()
    }

    pub fn additions(&self) -> usize {
        self.files.iter().map(FileDiff::additions).sum()
    }

    pub fn deletions(&self) -> usize {
        self.files.iter().map(FileDiff::deletions).sum()
    }

    /// The `N files changed, +A -D` line.
    pub fn stat(&self) -> String {
        format!(
            "{} file{} changed, +{} -{}",
            self.files.len(),
            if self.files.len() == 1 { "" } else { "s" },
            self.additions(),
            self.deletions()
        )
    }

    pub fn file(&self, path: &Path) -> Option<&FileDiff> {
        self.files.iter().find(|file| file.path() == path)
    }

    /// Parse a unified diff, with or without `diff --git` headers. A header-like
    /// body line counts as a header only outside a hunk.
    pub fn parse(text: &str) -> Diff {
        let mut files: Vec<FileDiff> = Vec::new();
        let mut current: Option<FileDiff> = None;
        // The declared counts are what separates a hunk body from the next
        // file's `---` header, which is itself a valid removal line.
        let mut old_remaining = 0usize;
        let mut new_remaining = 0usize;

        for line in text.lines() {
            if old_remaining > 0 || new_remaining > 0 {
                if push_hunk_line(
                    current.as_mut(),
                    line,
                    &mut old_remaining,
                    &mut new_remaining,
                ) {
                    continue;
                }
                old_remaining = 0;
                new_remaining = 0;
            }

            if let Some(rest) = line.strip_prefix("diff --git ") {
                if let Some(file) = current.take() {
                    files.push(file);
                }
                current = Some(new_file_diff(git_header_paths(rest)));
                continue;
            }

            if line.starts_with("new file mode") {
                if let Some(file) = current.as_mut() {
                    file.kind = FileChangeKind::Added;
                }
                continue;
            }
            if line.starts_with("deleted file mode") {
                if let Some(file) = current.as_mut() {
                    file.kind = FileChangeKind::Deleted;
                }
                continue;
            }
            if let Some(from) = line.strip_prefix("rename from ") {
                if let Some(file) = current.as_mut() {
                    file.kind = FileChangeKind::Renamed;
                    file.old_path = Some(PathBuf::from(from.trim()));
                }
                continue;
            }
            if let Some(to) = line.strip_prefix("rename to ") {
                if let Some(file) = current.as_mut() {
                    file.kind = FileChangeKind::Renamed;
                    file.new_path = Some(PathBuf::from(to.trim()));
                }
                continue;
            }
            if line.starts_with("Binary files ") || line.starts_with("GIT binary patch") {
                if let Some(file) = current.as_mut() {
                    file.binary = true;
                }
                continue;
            }

            if let Some(rest) = line.strip_prefix("--- ") {
                let path = header_path(rest);
                match current.as_mut() {
                    // A `---` with no `diff --git` above it starts a new file.
                    Some(file) if !file.hunks.is_empty() => {
                        files.push(current.take().expect("checked"));
                        current = Some(new_file_diff((path, None)));
                    }
                    Some(file) => {
                        if path.is_none() {
                            file.kind = FileChangeKind::Added;
                        } else if file.old_path.is_none() {
                            file.old_path = path;
                        }
                    }
                    None => current = Some(new_file_diff((path, None))),
                }
                continue;
            }

            if let Some(rest) = line.strip_prefix("+++ ") {
                let path = header_path(rest);
                let file = current.get_or_insert_with(|| new_file_diff((None, None)));
                if path.is_none() {
                    file.kind = FileChangeKind::Deleted;
                } else if file.new_path.is_none() {
                    file.new_path = path;
                }
                continue;
            }

            if line.starts_with("@@") {
                let Some(hunk) = parse_hunk_header(line) else {
                    continue;
                };
                old_remaining = hunk.old_lines;
                new_remaining = hunk.new_lines;
                let file = current.get_or_insert_with(|| new_file_diff((None, None)));
                file.hunks.push(hunk);
                continue;
            }
        }

        if let Some(file) = current.take() {
            files.push(file);
        }
        files.retain(|file| {
            file.old_path.is_some() || file.new_path.is_some() || !file.hunks.is_empty()
        });
        for file in files.iter_mut() {
            if file.kind == FileChangeKind::Modified {
                if file.old_path.is_none() && file.new_path.is_some() {
                    file.kind = FileChangeKind::Added;
                } else if file.new_path.is_none() && file.old_path.is_some() {
                    file.kind = FileChangeKind::Deleted;
                }
            }
        }
        Diff { files }
    }

    /// Render the model back as text: per-file summaries then each hunk. Every
    /// surface renders from here, so structure and display cannot disagree.
    pub fn render(&self) -> String {
        if self.files.is_empty() {
            return "No changes.".to_string();
        }
        let mut out = String::with_capacity(self.files.len() * 256);
        for file in &self.files {
            out.push_str(&file.summary());
            out.push('\n');
            for hunk in &file.hunks {
                out.push_str(&hunk.header());
                out.push('\n');
                for line in &hunk.lines {
                    out.push_str(&line.render());
                    out.push('\n');
                }
            }
        }
        out.push_str(&self.stat());
        out
    }
}

fn new_file_diff(paths: (Option<PathBuf>, Option<PathBuf>)) -> FileDiff {
    FileDiff {
        old_path: paths.0,
        new_path: paths.1,
        kind: FileChangeKind::Modified,
        binary: false,
        hunks: Vec::new(),
    }
}

/// True when the line belonged to the open hunk and was recorded.
fn push_hunk_line(
    file: Option<&mut FileDiff>,
    line: &str,
    old_remaining: &mut usize,
    new_remaining: &mut usize,
) -> bool {
    let Some(file) = file else {
        return false;
    };
    let Some(hunk) = file.hunks.last_mut() else {
        return false;
    };
    // `\ No newline at end of file` annotates the previous line and is not
    // itself content, so it consumes no budget.
    if line.starts_with('\\') {
        return true;
    }
    match line.chars().next() {
        Some('+') if *new_remaining > 0 => {
            hunk.lines.push(DiffLine::Added(line[1..].to_string()));
            *new_remaining -= 1;
        }
        Some('-') if *old_remaining > 0 => {
            hunk.lines.push(DiffLine::Removed(line[1..].to_string()));
            *old_remaining -= 1;
        }
        Some(' ') if *old_remaining > 0 || *new_remaining > 0 => {
            hunk.lines.push(DiffLine::Context(line[1..].to_string()));
            *old_remaining = old_remaining.saturating_sub(1);
            *new_remaining = new_remaining.saturating_sub(1);
        }
        // git writes a fully empty line for an empty context line.
        None if *old_remaining > 0 || *new_remaining > 0 => {
            hunk.lines.push(DiffLine::Context(String::new()));
            *old_remaining = old_remaining.saturating_sub(1);
            *new_remaining = new_remaining.saturating_sub(1);
        }
        _ => return false,
    }
    true
}

/// `a/old b/new` off a `diff --git` line. Paths containing spaces are given
/// back as `None` here and recovered from the `---`/`+++` headers below.
fn git_header_paths(rest: &str) -> (Option<PathBuf>, Option<PathBuf>) {
    let parts: Vec<&str> = rest.split_whitespace().collect();
    if parts.len() != 2 {
        return (None, None);
    }
    (strip_prefix_path(parts[0]), strip_prefix_path(parts[1]))
}

fn header_path(rest: &str) -> Option<PathBuf> {
    let trimmed = rest.split('\t').next().unwrap_or(rest).trim();
    if trimmed.is_empty() || trimmed == "/dev/null" {
        return None;
    }
    strip_prefix_path(trimmed)
}

fn strip_prefix_path(raw: &str) -> Option<PathBuf> {
    if raw == "/dev/null" {
        return None;
    }
    let stripped = raw
        .strip_prefix("a/")
        .or_else(|| raw.strip_prefix("b/"))
        .unwrap_or(raw);
    if stripped.is_empty() {
        None
    } else {
        Some(PathBuf::from(stripped))
    }
}

fn parse_hunk_header(line: &str) -> Option<DiffHunk> {
    let body = line.strip_prefix("@@")?;
    let close = body.find("@@")?;
    let ranges = body[..close].trim();
    let section = body[close + 2..].trim().to_string();

    let mut old = None;
    let mut new = None;
    for token in ranges.split_whitespace() {
        if let Some(rest) = token.strip_prefix('-') {
            old = parse_range(rest);
        } else if let Some(rest) = token.strip_prefix('+') {
            new = parse_range(rest);
        }
    }
    let (old_start, old_lines) = old?;
    let (new_start, new_lines) = new?;
    Some(DiffHunk {
        old_start,
        old_lines,
        new_start,
        new_lines,
        section,
        lines: Vec::new(),
    })
}

fn parse_range(raw: &str) -> Option<(usize, usize)> {
    let mut parts = raw.split(',');
    let start = parts.next()?.parse().ok()?;
    let count = match parts.next() {
        Some(value) => value.parse().ok()?,
        None => 1,
    };
    Some((start, count))
}

#[cfg(test)]
mod tests {
    use super::*;

    // A backslash line continuation eats the next line's leading whitespace,
    // which is exactly the column a unified diff uses to mark a context line.
    const MODIFY: &str = concat!(
        "diff --git a/src/lib.rs b/src/lib.rs\n",
        "index 111..222 100644\n",
        "--- a/src/lib.rs\n",
        "+++ b/src/lib.rs\n",
        "@@ -10,4 +10,5 @@ fn main() {\n",
        " keep\n",
        "-old line\n",
        "+new line\n",
        "+extra line\n",
        " tail\n",
    );

    #[test]
    fn a_modification_carries_its_hunk_range_and_counts() {
        let diff = Diff::parse(MODIFY);
        assert_eq!(diff.files.len(), 1);
        let file = &diff.files[0];
        assert_eq!(file.kind, FileChangeKind::Modified);
        assert_eq!(file.path(), Path::new("src/lib.rs"));
        assert_eq!(file.additions(), 2);
        assert_eq!(file.deletions(), 1);
        assert_eq!(file.hunks.len(), 1);
        let hunk = &file.hunks[0];
        assert_eq!((hunk.old_start, hunk.old_lines), (10, 4));
        assert_eq!((hunk.new_start, hunk.new_lines), (10, 5));
        assert_eq!(hunk.section, "fn main() {");
        assert_eq!(hunk.header(), "@@ -10,4 +10,5 @@ fn main() {");
        assert_eq!(diff.stat(), "1 file changed, +2 -1");
    }

    #[test]
    fn a_deletion_is_not_reported_as_a_modification() {
        let diff = Diff::parse(
            "diff --git a/gone.txt b/gone.txt\n\
deleted file mode 100644\n\
--- a/gone.txt\n\
+++ /dev/null\n\
@@ -1,2 +0,0 @@\n\
-one\n\
-two\n",
        );
        assert_eq!(diff.files.len(), 1);
        assert_eq!(diff.files[0].kind, FileChangeKind::Deleted);
        assert_eq!(diff.files[0].path(), Path::new("gone.txt"));
        assert_eq!(diff.files[0].deletions(), 2);
        assert_eq!(diff.files[0].additions(), 0);
        assert!(diff.files[0].summary().starts_with("D  gone.txt"));
    }

    #[test]
    fn an_addition_without_a_git_header_is_still_an_addition() {
        let diff = Diff::parse("--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,1 @@\n+hello\n");
        assert_eq!(diff.files.len(), 1);
        assert_eq!(diff.files[0].kind, FileChangeKind::Added);
        assert_eq!(diff.files[0].path(), Path::new("new.txt"));
        assert_eq!(diff.files[0].additions(), 1);
    }

    #[test]
    fn a_rename_keeps_both_ends() {
        let diff = Diff::parse(
            "diff --git a/old/name.rs b/new/name.rs\n\
similarity index 96%\n\
rename from old/name.rs\n\
rename to new/name.rs\n",
        );
        assert_eq!(diff.files.len(), 1);
        assert_eq!(diff.files[0].kind, FileChangeKind::Renamed);
        assert_eq!(diff.files[0].path(), Path::new("new/name.rs"));
        assert!(diff.files[0].summary().contains("from old/name.rs"));
    }

    /// The trap that made the old per-line counter wrong: a removed line whose
    /// content itself begins with `---` is body, not a file header.
    #[test]
    fn a_body_line_that_looks_like_a_header_stays_in_the_hunk() {
        let diff = Diff::parse(
            "--- a/doc.md\n+++ b/doc.md\n@@ -1,2 +1,2 @@\n--- old rule\n+++ new rule\n",
        );
        assert_eq!(diff.files.len(), 1, "{:?}", diff.files);
        assert_eq!(diff.files[0].deletions(), 1);
        assert_eq!(diff.files[0].additions(), 1);
        assert_eq!(
            diff.files[0].hunks[0].lines[0],
            DiffLine::Removed("-- old rule".to_string())
        );
    }

    #[test]
    fn several_files_in_one_diff_are_separated() {
        let combined = format!(
            "{MODIFY}diff --git a/other.txt b/other.txt\n--- a/other.txt\n+++ b/other.txt\n@@ -1 +1 @@\n-a\n+b\n"
        );
        let diff = Diff::parse(&combined);
        assert_eq!(diff.files.len(), 2);
        assert_eq!(diff.files[1].path(), Path::new("other.txt"));
        assert_eq!(diff.stat(), "2 files changed, +3 -2");
        assert!(diff.file(Path::new("other.txt")).is_some());
    }

    #[test]
    fn a_binary_file_is_flagged_rather_than_counted() {
        let diff = Diff::parse(
            "diff --git a/logo.png b/logo.png\n\
index 1..2 100644\n\
Binary files a/logo.png and b/logo.png differ\n",
        );
        assert_eq!(diff.files.len(), 1);
        assert!(diff.files[0].binary);
        assert!(diff.files[0].summary().contains("(binary)"));
    }

    #[test]
    fn empty_input_is_an_empty_diff() {
        let diff = Diff::parse("");
        assert!(diff.is_empty());
        assert_eq!(diff.render(), "No changes.");
    }

    #[test]
    fn rendering_round_trips_the_hunk_body() {
        let rendered = Diff::parse(MODIFY).render();
        assert!(rendered.contains("M  src/lib.rs  +2 -1"), "{rendered}");
        assert!(
            rendered.contains("@@ -10,4 +10,5 @@ fn main() {"),
            "{rendered}"
        );
        assert!(rendered.contains("-old line"), "{rendered}");
        assert!(rendered.contains("+extra line"), "{rendered}");
        assert!(rendered.contains(" keep"), "{rendered}");
    }

    #[test]
    fn a_no_newline_marker_is_not_content() {
        let diff =
            Diff::parse("--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n");
        assert_eq!(diff.files[0].hunks[0].lines.len(), 2);
    }
}
