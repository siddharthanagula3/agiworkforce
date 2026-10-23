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

pub fn file_hunk_patches(patch: &str) -> Vec<Vec<String>> {
    let mut files: Vec<Vec<String>> = Vec::new();
    let mut header = String::new();
    let mut hunk: Option<String> = None;
    let mut current: Option<Vec<String>> = None;
    let finish_hunk =
        |header: &str, hunk: &mut Option<String>, current: &mut Option<Vec<String>>| {
            if let (Some(body), Some(patches)) = (hunk.take(), current.as_mut()) {
                patches.push(format!("{header}{body}"));
            }
        };
    for line in patch.split_inclusive('\n') {
        if line.starts_with("diff --git ") {
            finish_hunk(&header, &mut hunk, &mut current);
            if let Some(done) = current.take() {
                files.push(done);
            }
            current = Some(Vec::new());
            header = line.to_string();
        } else if line.starts_with("@@") {
            finish_hunk(&header, &mut hunk, &mut current);
            hunk = Some(line.to_string());
        } else if let Some(body) = hunk.as_mut() {
            body.push_str(line);
        } else if current.is_some() {
            header.push_str(line);
        }
    }
    finish_hunk(&header, &mut hunk, &mut current);
    if let Some(done) = current.take() {
        files.push(done);
    }
    for patches in &mut files {
        for patch in patches.iter_mut() {
            if !patch.ends_with('\n') {
                patch.push('\n');
            }
        }
    }
    files
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

/// What one successful edit changed in one file: the changed lines only, in
/// the order they appear, with the counts every surface quotes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EditResult {
    pub kind: FileChangeKind,
    pub path: String,
    pub lines: Vec<DiffLine>,
}

impl EditResult {
    pub fn additions(&self) -> usize {
        self.lines
            .iter()
            .filter(|line| matches!(line, DiffLine::Added(_)))
            .count()
    }

    pub fn deletions(&self) -> usize {
        self.lines
            .iter()
            .filter(|line| matches!(line, DiffLine::Removed(_)))
            .count()
    }

    /// `Update(src/x.rs)`, `Create(...)` or `Delete(...)`.
    pub fn header(&self) -> String {
        format!("{}({})", self.verb(), self.path)
    }

    /// `Updated src/x.rs with 17 additions and 22 removals`.
    pub fn summary(&self) -> String {
        let additions = count_noun(self.additions(), "addition");
        let removals = count_noun(self.deletions(), "removal");
        let tail = match self.kind {
            FileChangeKind::Added => additions,
            FileChangeKind::Deleted => removals,
            FileChangeKind::Modified | FileChangeKind::Renamed => {
                format!("{additions} and {removals}")
            }
        };
        format!("{} {} with {tail}", self.past_verb(), self.path)
    }

    fn verb(&self) -> &'static str {
        match self.kind {
            FileChangeKind::Added => "Create",
            FileChangeKind::Deleted => "Delete",
            FileChangeKind::Modified | FileChangeKind::Renamed => "Update",
        }
    }

    fn past_verb(&self) -> &'static str {
        match self.kind {
            FileChangeKind::Added => "Created",
            FileChangeKind::Deleted => "Deleted",
            FileChangeKind::Modified | FileChangeKind::Renamed => "Updated",
        }
    }
}

fn count_noun(count: usize, noun: &str) -> String {
    if count == 1 {
        format!("1 {noun}")
    } else {
        format!("{count} {noun}s")
    }
}

const LINE_DIFF_CELL_BUDGET: usize = 4_000_000;
const WRITE_DIFF_MAX_BYTES: u64 = 1_048_576;

/// The changed lines between two texts, removals before the additions that
/// replace them. Lines the texts share are left out; the pairing is the
/// longest common subsequence while the texts are small enough to afford it,
/// and the untouched head and tail otherwise.
fn changed_lines(old: &str, new: &str) -> Vec<DiffLine> {
    let old: Vec<&str> = old.lines().collect();
    let new: Vec<&str> = new.lines().collect();
    let head = old
        .iter()
        .zip(&new)
        .take_while(|(left, right)| left == right)
        .count();
    let tail = old[head..]
        .iter()
        .rev()
        .zip(new[head..].iter().rev())
        .take_while(|(left, right)| left == right)
        .count();
    let old = &old[head..old.len() - tail];
    let new = &new[head..new.len() - tail];

    let removed = |line: &&str| DiffLine::Removed((*line).to_string());
    let added = |line: &&str| DiffLine::Added((*line).to_string());
    if old.is_empty()
        || new.is_empty()
        || old.len().saturating_mul(new.len()) > LINE_DIFF_CELL_BUDGET
    {
        return old
            .iter()
            .map(removed)
            .chain(new.iter().map(added))
            .collect();
    }

    let width = new.len() + 1;
    let mut common = vec![0u32; (old.len() + 1) * width];
    for row in (0..old.len()).rev() {
        for col in (0..new.len()).rev() {
            common[row * width + col] = if old[row] == new[col] {
                common[(row + 1) * width + col + 1] + 1
            } else {
                common[(row + 1) * width + col].max(common[row * width + col + 1])
            };
        }
    }
    let (mut row, mut col) = (0, 0);
    let mut lines = Vec::new();
    while row < old.len() && col < new.len() {
        if old[row] == new[col] {
            row += 1;
            col += 1;
        } else if common[(row + 1) * width + col] >= common[row * width + col + 1] {
            lines.push(removed(&old[row]));
            row += 1;
        } else {
            lines.push(added(&new[col]));
            col += 1;
        }
    }
    lines.extend(old[row..].iter().map(removed));
    lines.extend(new[col..].iter().map(added));
    lines
}

impl From<&FileDiff> for EditResult {
    fn from(file: &FileDiff) -> Self {
        EditResult {
            kind: file.kind,
            path: file.path().display().to_string(),
            lines: file
                .hunks
                .iter()
                .flat_map(|hunk| hunk.lines.iter())
                .filter(|line| !matches!(line, DiffLine::Context(_)))
                .cloned()
                .collect(),
        }
    }
}

/// What an edit tool call is about to change, read from the arguments the
/// model sent. Empty for a tool that does not edit a file and for a call whose
/// arguments cannot say what it changes (a redacted or malformed payload, a
/// file too large to compare): a count the arguments cannot back is not shown.
pub fn proposed_edits(tool: &str, input: &serde_json::Value) -> Vec<EditResult> {
    let text = |key: &str| input.get(key).and_then(serde_json::Value::as_str);
    let modified = |path: &str, lines| EditResult {
        kind: FileChangeKind::Modified,
        path: path.to_string(),
        lines,
    };
    match tool {
        "edit_file" => match (text("path"), text("old_string"), text("new_string")) {
            (Some(path), Some(old), Some(new)) => vec![modified(path, changed_lines(old, new))],
            _ => Vec::new(),
        },
        "multiedit" => {
            let Some(path) = text("path") else {
                return Vec::new();
            };
            let edits = match input.get("edits") {
                Some(serde_json::Value::Array(edits)) => edits.clone(),
                Some(serde_json::Value::String(raw)) => {
                    match serde_json::from_str::<Vec<serde_json::Value>>(raw) {
                        Ok(edits) => edits,
                        Err(_) => return Vec::new(),
                    }
                }
                _ => return Vec::new(),
            };
            let mut lines = Vec::new();
            for edit in &edits {
                let field = |key: &str| edit.get(key).and_then(serde_json::Value::as_str);
                let replaces_all = edit
                    .get("replace_all")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false);
                match (field("old_string"), field("new_string")) {
                    (Some(old), Some(new)) if !replaces_all => {
                        lines.extend(changed_lines(old, new));
                    }
                    _ => return Vec::new(),
                }
            }
            vec![modified(path, lines)]
        }
        "write_file" => {
            let (Some(path), Some(content)) = (text("path"), text("content")) else {
                return Vec::new();
            };
            match std::fs::metadata(path) {
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => vec![EditResult {
                    kind: FileChangeKind::Added,
                    path: path.to_string(),
                    lines: content
                        .lines()
                        .map(|line| DiffLine::Added(line.to_string()))
                        .collect(),
                }],
                Ok(meta) if meta.is_file() && meta.len() <= WRITE_DIFF_MAX_BYTES => {
                    match std::fs::read_to_string(path) {
                        Ok(existing) => vec![modified(path, changed_lines(&existing, content))],
                        Err(_) => Vec::new(),
                    }
                }
                _ => Vec::new(),
            }
        }
        "apply_patch" => text("patch")
            .map(|patch| {
                Diff::parse(patch)
                    .files
                    .iter()
                    .map(EditResult::from)
                    .collect()
            })
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

/// True when a successful edit result says the user changed the proposal
/// before approving it, so the proposal's own line counts no longer describe
/// the file.
pub fn replaced_by_user_edit(output: &str) -> bool {
    output.starts_with("The user edited the change before approving it")
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
    fn edit_input(old: &str, new: &str) -> serde_json::Value {
        serde_json::json!({"path": "src/x.rs", "old_string": old, "new_string": new})
    }

    #[test]
    fn an_edit_reports_only_the_lines_it_changed() {
        let edits = proposed_edits("edit_file", &edit_input("a\nb\nc\nd", "a\nx\nc\nd\ne"));
        assert_eq!(edits.len(), 1);
        assert_eq!(
            edits[0].lines,
            vec![
                DiffLine::Removed("b".to_string()),
                DiffLine::Added("x".to_string()),
                DiffLine::Added("e".to_string()),
            ]
        );
        assert_eq!(edits[0].header(), "Update(src/x.rs)");
        assert_eq!(
            edits[0].summary(),
            "Updated src/x.rs with 2 additions and 1 removal"
        );
    }

    #[test]
    fn lines_the_old_and_new_text_share_in_the_middle_are_not_counted() {
        let edits = proposed_edits("edit_file", &edit_input("a\nb\nc\nd", "a\nc\nd\ne"));
        assert_eq!((edits[0].additions(), edits[0].deletions()), (1, 1));
    }

    #[test]
    fn a_multiedit_adds_up_every_edit_in_the_call() {
        let input = serde_json::json!({
            "path": "src/x.rs",
            "edits": [
                {"old_string": "one", "new_string": "uno"},
                {"old_string": "two\nthree", "new_string": "two"},
            ],
        });
        let edits = proposed_edits("multiedit", &input);
        assert_eq!((edits[0].additions(), edits[0].deletions()), (1, 2));

        let encoded = serde_json::json!({"path": "src/x.rs", "edits": input["edits"].to_string()});
        assert_eq!(proposed_edits("multiedit", &encoded), edits);
    }

    #[test]
    fn a_multiedit_that_replaces_every_match_has_no_count_to_show() {
        let input = serde_json::json!({
            "path": "src/x.rs",
            "edits": [{"old_string": "a", "new_string": "b", "replace_all": true}],
        });
        assert!(proposed_edits("multiedit", &input).is_empty());
    }

    #[test]
    fn a_write_to_a_new_file_is_all_additions_and_to_an_old_file_a_diff() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.txt");
        let target = path.to_str().unwrap();

        let created = proposed_edits(
            "write_file",
            &serde_json::json!({"path": target, "content": "a\nb\n"}),
        );
        assert_eq!(created[0].kind, FileChangeKind::Added);
        assert_eq!(created[0].header(), format!("Create({target})"));
        assert_eq!(
            created[0].summary(),
            format!("Created {target} with 2 additions")
        );

        std::fs::write(&path, "a\nb\n").unwrap();
        let rewritten = proposed_edits(
            "write_file",
            &serde_json::json!({"path": target, "content": "a\nc\n"}),
        );
        assert_eq!(rewritten[0].kind, FileChangeKind::Modified);
        assert_eq!((rewritten[0].additions(), rewritten[0].deletions()), (1, 1));
    }

    #[test]
    fn a_patch_gives_one_result_per_file_without_its_context_lines() {
        let edits = proposed_edits("apply_patch", &serde_json::json!({"patch": MODIFY}));
        assert_eq!(edits.len(), 1);
        assert_eq!(edits[0].path, "src/lib.rs");
        assert_eq!((edits[0].additions(), edits[0].deletions()), (2, 1));
        assert!(edits[0]
            .lines
            .iter()
            .all(|line| !matches!(line, DiffLine::Context(_))));
    }

    #[test]
    fn a_deletion_names_only_its_removals() {
        let result = EditResult {
            kind: FileChangeKind::Deleted,
            path: "old.rs".to_string(),
            lines: vec![DiffLine::Removed("x".to_string())],
        };
        assert_eq!(result.header(), "Delete(old.rs)");
        assert_eq!(result.summary(), "Deleted old.rs with 1 removal");
    }

    #[test]
    fn other_tools_and_unreadable_arguments_have_nothing_to_show() {
        assert!(proposed_edits("read_file", &edit_input("a", "b")).is_empty());
        assert!(proposed_edits("edit_file", &serde_json::json!("[redacted]")).is_empty());
        assert!(proposed_edits("edit_file", &serde_json::json!({"path": "x"})).is_empty());
    }

    #[test]
    fn a_proposal_the_user_rewrote_is_recognised_from_the_tool_result() {
        assert!(replaced_by_user_edit(&crate::tools::edited_by_user_note(
            "src/x.rs", "a\nb"
        )));
        assert!(!replaced_by_user_edit("Successfully edited src/x.rs"));
    }
}
