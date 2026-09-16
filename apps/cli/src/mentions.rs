//! `@file` mentions for the interactive composer.
//!
//! Three separable pieces, each testable without a terminal:
//!
//! * [`workspace_file_candidates`] enumerates the files a mention may name.
//!   Inside a git work tree it shells out to `git ls-files`, so `.gitignore`
//!   is honoured by git's own matcher rather than a second implementation of
//!   those semantics that would drift from it. Outside one it falls back to a
//!   depth- and count-bounded directory walk.
//! * [`rank_mention_candidates`] ranks that list against a typed query with the
//!   same [`crate::tui::fuzzy`] scorer the slash-command popup uses.
//! * [`expand_mentions`] turns the `@path` tokens in a submitted message into
//!   the `<file path="…">` context blocks `--file` already builds in
//!   [`crate::read_file_contexts`], so a mention reaches the model in the shape
//!   the launch flag established.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Upper bound on the candidate list. A monorepo checkout can hold hundreds of
/// thousands of files; the picker only ever shows a screenful, and an unbounded
/// list would stall the first `@` keystroke.
pub const MAX_CANDIDATES: usize = 20_000;

/// Largest text file a mention inlines. Past this the mention still names the
/// path so the model can open it with a tool, but the bytes stay out of the
/// prompt.
pub const MAX_MENTION_BYTES: u64 = 256 * 1024;

/// Depth limit for the non-git fallback walk.
const MAX_WALK_DEPTH: usize = 12;

/// Directories the fallback walk never descends into. A git work tree gets
/// `.gitignore` instead; this list only has to keep the fallback from walking
/// into build output in a directory that is not a repository.
const SKIPPED_DIRS: [&str; 8] = [
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".venv",
    "vendor",
];

/// One rankable mention candidate: the workspace-relative path, plus the file
/// name so a query can be scored against the name alone.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MentionCandidate {
    pub path: String,
    pub file_name: String,
}

impl MentionCandidate {
    pub fn new(path: impl Into<String>) -> Self {
        let path = path.into();
        let file_name = Path::new(&path)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.clone());
        Self { path, file_name }
    }
}

/// Every file a mention may name, as workspace-relative paths sorted shortest
/// first so top-level files lead an unfiltered popup.
pub fn workspace_file_candidates(root: &Path) -> Vec<MentionCandidate> {
    let mut paths = git_tracked_and_untracked(root).unwrap_or_else(|| bounded_walk(root));
    paths.sort_by(|a, b| a.len().cmp(&b.len()).then_with(|| a.cmp(b)));
    paths.truncate(MAX_CANDIDATES);
    paths.into_iter().map(MentionCandidate::new).collect()
}

/// `git ls-files` over the cached and untracked-but-not-ignored sets, which is
/// exactly "files a user could mean, minus what `.gitignore` excludes".
/// `None` when this is not a git work tree or git is unavailable.
fn git_tracked_and_untracked(root: &Path) -> Option<Vec<String>> {
    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(root)
        .args([
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let mut seen = HashSet::new();
    let mut paths = Vec::new();
    for raw in output.stdout.split(|b| *b == 0) {
        if raw.is_empty() {
            continue;
        }
        let path = String::from_utf8_lossy(raw).into_owned();
        if seen.insert(path.clone()) {
            paths.push(path);
        }
        if paths.len() >= MAX_CANDIDATES {
            break;
        }
    }
    Some(paths)
}

fn bounded_walk(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let mut queue: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];
    while let Some((dir, depth)) = queue.pop() {
        if out.len() >= MAX_CANDIDATES || depth > MAX_WALK_DEPTH {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || SKIPPED_DIRS.contains(&name.as_str()) {
                continue;
            }
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() {
                queue.push((entry.path(), depth + 1));
            } else if kind.is_file() {
                if let Ok(rel) = entry.path().strip_prefix(root) {
                    out.push(rel.to_string_lossy().replace('\\', "/"));
                }
                if out.len() >= MAX_CANDIDATES {
                    break;
                }
            }
        }
    }
    out
}

/// Rank candidates against a typed query, best first, capped at `limit`.
///
/// A file-name hit outranks a hit that only lands in the directory part, the
/// same shape the command popup uses for name-versus-description, so `chat`
/// puts `chat.rs` above `src/chat/history.rs`. An empty query keeps the
/// candidate order (shortest path first).
pub fn rank_mention_candidates<'a>(
    query: &str,
    candidates: &'a [MentionCandidate],
    limit: usize,
) -> Vec<&'a MentionCandidate> {
    if query.is_empty() {
        return candidates.iter().take(limit).collect();
    }
    let mut scored: Vec<(i32, &MentionCandidate)> = candidates
        .iter()
        .filter_map(|c| {
            let name = crate::tui::fuzzy::fuzzy_score(query, &c.file_name);
            let path = crate::tui::fuzzy::fuzzy_score(query, &c.path).map(|s| s - 50);
            match (name, path) {
                (Some(a), Some(b)) => Some((a.max(b), c)),
                (Some(a), None) => Some((a, c)),
                (None, Some(b)) => Some((b, c)),
                (None, None) => None,
            }
        })
        .collect();
    scored.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| a.1.path.len().cmp(&b.1.path.len()))
            .then_with(|| a.1.path.cmp(&b.1.path))
    });
    scored.into_iter().take(limit).map(|(_, c)| c).collect()
}

/// Characters a mention may follow. Whitespace is the ordinary case; the
/// openers let a user write `(@src/lib.rs)` without the parenthesis swallowing
/// the mention. Anything else means the `@` sits inside a word (an email
/// address, a scoped package, a version pin) and is not a mention at all.
const MENTION_OPENERS: [char; 5] = ['(', '[', '{', '"', '\''];

fn may_start_mention(text_before: &str) -> bool {
    match text_before.chars().next_back() {
        None => true,
        Some(c) => c.is_whitespace() || MENTION_OPENERS.contains(&c),
    }
}

/// The `@query` token the cursor currently sits inside, if any.
///
/// A mention starts at an `@` that follows whitespace or the start of the
/// line, and runs to the cursor. Returns the byte offset of the `@` and the
/// query typed after it. An `@` in the middle of a word (an email address, a
/// scoped npm package) never opens the picker.
pub fn active_mention_query(input: &str, cursor: usize) -> Option<(usize, &str)> {
    let cursor = cursor.min(input.len());
    let before = input.get(..cursor)?;
    let at = before.rfind('@')?;
    if before[at..].contains(char::is_whitespace) {
        return None;
    }
    if !may_start_mention(&before[..at]) {
        return None;
    }
    Some((at, &before[at + 1..]))
}

/// Trailing characters stripped from a mention token when the path they are
/// attached to does not exist: sentence punctuation that a user types after a
/// path rather than as part of it.
const TRAILING_PUNCTUATION: [char; 8] = ['.', ',', ';', ':', '!', '?', ')', ']'];

/// Every `@path` token in a submitted message, in the order they appear, with
/// duplicates removed.
pub fn parse_mentions(text: &str, root: &Path) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for (index, _) in text.match_indices('@') {
        if !may_start_mention(&text[..index]) {
            continue;
        }
        let rest = &text[index + 1..];
        let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
        let mut token = &rest[..end];
        while !token.is_empty()
            && token.ends_with(TRAILING_PUNCTUATION)
            && !root.join(token).exists()
        {
            token = &token[..token.len() - 1];
        }
        if token.is_empty() {
            continue;
        }
        if seen.insert(token.to_string()) {
            out.push(token.to_string());
        }
    }
    out
}

/// What a mention turned into once the paths were resolved.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct MentionExpansion {
    /// The message to send, with any inlined file context prepended.
    pub prompt: String,
    /// Paths whose contents were inlined.
    pub inlined: Vec<String>,
    /// Image paths a mention named; the caller stages these the way `/attach`
    /// does rather than inlining bytes into the text.
    pub images: Vec<String>,
    /// Paths that resolved but were not inlined, each with the reason.
    pub skipped: Vec<(String, String)>,
}

/// Replace the `@path` tokens in `text` with `<file …>` context blocks.
///
/// `include_contents` is the workspace trust decision: an untrusted workspace
/// still carries the mentioned *path* to the model, because the user typed it,
/// but its repository-controlled bytes stay out of the prompt until the user
/// trusts the directory.
pub fn expand_mentions(text: &str, root: &Path, include_contents: bool) -> MentionExpansion {
    let mut expansion = MentionExpansion {
        prompt: text.to_string(),
        ..MentionExpansion::default()
    };
    let mentions = parse_mentions(text, root);
    if mentions.is_empty() {
        return expansion;
    }

    let mut context = String::new();
    for mention in mentions {
        let resolved = match crate::path_security::validate_workspace_path_with_cwd(&mention, root)
        {
            Ok(path) => path,
            Err(reason) => {
                expansion.skipped.push((mention, reason));
                continue;
            }
        };
        if !resolved.is_file() {
            expansion
                .skipped
                .push((mention, "not a file in this workspace".to_string()));
            continue;
        }
        if crate::sensitive_files::is_sensitive_file(&mention) {
            expansion.skipped.push((
                mention,
                "holds credentials, only the path was sent".to_string(),
            ));
            continue;
        }
        if crate::is_image_extension(&mention) {
            expansion.images.push(mention);
            continue;
        }
        if !include_contents {
            expansion.skipped.push((
                mention,
                "workspace is not trusted, only the path was sent".to_string(),
            ));
            continue;
        }
        match std::fs::metadata(&resolved) {
            Ok(meta) if meta.len() > MAX_MENTION_BYTES => {
                expansion.skipped.push((
                    mention,
                    format!("larger than {} KB", MAX_MENTION_BYTES / 1024),
                ));
                continue;
            }
            Ok(_) => {}
            Err(error) => {
                expansion.skipped.push((mention, error.to_string()));
                continue;
            }
        }
        match std::fs::read_to_string(&resolved) {
            Ok(contents) => {
                context.push_str(&format!(
                    "<file path=\"{}\">\n{}\n</file>\n\n",
                    mention, contents
                ));
                expansion.inlined.push(mention);
            }
            Err(error) => expansion.skipped.push((mention, error.to_string())),
        }
    }

    if !context.is_empty() {
        expansion.prompt = format!("{context}{text}");
    }
    expansion
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidates(paths: &[&str]) -> Vec<MentionCandidate> {
        paths.iter().map(|p| MentionCandidate::new(*p)).collect()
    }

    #[test]
    fn a_file_name_hit_outranks_a_directory_only_hit() {
        let all = candidates(&[
            "src/chat/history.rs",
            "src/agent/chat.rs",
            "docs/chatter.md",
        ]);
        let ranked = rank_mention_candidates("chat.rs", &all, 10);
        assert_eq!(ranked[0].path, "src/agent/chat.rs");
    }

    #[test]
    fn ranking_matches_a_subsequence_not_just_a_substring() {
        let all = candidates(&["apps/cli/src/tui/tui_app.rs", "README.md"]);
        let ranked = rank_mention_candidates("tuiapp", &all, 10);
        assert_eq!(ranked.len(), 1);
        assert_eq!(ranked[0].path, "apps/cli/src/tui/tui_app.rs");
    }

    #[test]
    fn a_non_matching_query_ranks_nothing() {
        let all = candidates(&["src/lib.rs", "Cargo.toml"]);
        assert!(rank_mention_candidates("zzzq", &all, 10).is_empty());
    }

    #[test]
    fn an_empty_query_keeps_the_shortest_paths_first() {
        let all = workspace_candidates_sorted(&["deep/nested/dir/file.rs", "a.rs"]);
        let ranked = rank_mention_candidates("", &all, 10);
        assert_eq!(ranked[0].path, "a.rs");
    }

    fn workspace_candidates_sorted(paths: &[&str]) -> Vec<MentionCandidate> {
        let mut owned: Vec<String> = paths.iter().map(|p| p.to_string()).collect();
        owned.sort_by(|a, b| a.len().cmp(&b.len()).then_with(|| a.cmp(b)));
        owned.into_iter().map(MentionCandidate::new).collect()
    }

    #[test]
    fn the_limit_is_honoured() {
        let all = candidates(&["a.rs", "ab.rs", "abc.rs", "abcd.rs"]);
        assert_eq!(rank_mention_candidates("a", &all, 2).len(), 2);
    }

    #[test]
    fn the_cursor_finds_the_query_it_sits_inside() {
        assert_eq!(
            active_mention_query("look at @src/li", 15),
            Some((8, "src/li"))
        );
        assert_eq!(active_mention_query("@a", 2), Some((0, "a")));
        assert_eq!(active_mention_query("@", 1), Some((0, "")));
    }

    #[test]
    fn an_at_inside_a_word_is_not_a_mention() {
        // An email address or a scoped package must not open the picker.
        assert_eq!(active_mention_query("me@example.com", 14), None);
        assert_eq!(active_mention_query("npm i pkg@1.2.3", 15), None);
    }

    #[test]
    fn the_query_ends_at_whitespace() {
        assert_eq!(active_mention_query("@src/lib.rs and more", 20), None);
    }

    #[test]
    fn mentions_are_parsed_in_order_without_duplicates() {
        let root = std::env::temp_dir();
        let found = parse_mentions("compare @a.rs with @b.rs and @a.rs", &root);
        assert_eq!(found, vec!["a.rs".to_string(), "b.rs".to_string()]);
    }

    #[test]
    fn sentence_punctuation_is_not_part_of_a_path() {
        let root = std::env::temp_dir();
        assert_eq!(
            parse_mentions("read @src/lib.rs.", &root),
            vec!["src/lib.rs"]
        );
        assert_eq!(parse_mentions("see (@a.rs)", &root), vec!["a.rs"]);
    }

    #[test]
    fn expansion_inlines_a_text_file_the_way_the_file_flag_does() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("note.txt"), "hello mention").expect("write");
        let expanded = expand_mentions("summarise @note.txt", dir.path(), true);
        assert!(expanded
            .prompt
            .starts_with("<file path=\"note.txt\">\nhello mention\n</file>"));
        assert!(expanded.prompt.ends_with("summarise @note.txt"));
        assert_eq!(expanded.inlined, vec!["note.txt".to_string()]);
        assert!(expanded.skipped.is_empty());
    }

    #[test]
    fn an_untrusted_workspace_sends_the_path_without_the_bytes() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("secret.txt"), "do not inline").expect("write");
        let expanded = expand_mentions("read @secret.txt", dir.path(), false);
        assert!(!expanded.prompt.contains("do not inline"));
        assert_eq!(expanded.prompt, "read @secret.txt");
        assert_eq!(expanded.skipped.len(), 1);
    }

    #[test]
    fn a_mention_cannot_escape_the_workspace() {
        let dir = tempfile::tempdir().expect("tempdir");
        let expanded = expand_mentions("read @../../etc/hosts", dir.path(), true);
        assert!(expanded.inlined.is_empty());
        assert_eq!(expanded.skipped.len(), 1);
        assert_eq!(expanded.prompt, "read @../../etc/hosts");
    }

    #[test]
    fn an_oversize_file_is_named_but_not_inlined() {
        let dir = tempfile::tempdir().expect("tempdir");
        let big = "x".repeat(MAX_MENTION_BYTES as usize + 1);
        std::fs::write(dir.path().join("big.txt"), &big).expect("write");
        let expanded = expand_mentions("@big.txt", dir.path(), true);
        assert!(expanded.inlined.is_empty());
        assert_eq!(expanded.skipped[0].0, "big.txt");
        assert!(expanded.skipped[0].1.contains("larger than"));
    }

    #[test]
    fn an_image_mention_is_routed_to_the_attachment_path() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("shot.png"), [0u8; 8]).expect("write");
        let expanded = expand_mentions("what is in @shot.png", dir.path(), true);
        assert_eq!(expanded.images, vec!["shot.png".to_string()]);
        assert!(expanded.inlined.is_empty());
    }

    #[test]
    fn the_walk_skips_build_output_and_dot_directories() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::create_dir_all(dir.path().join("node_modules/pkg")).expect("mkdir");
        std::fs::create_dir_all(dir.path().join(".hidden")).expect("mkdir");
        std::fs::write(dir.path().join("node_modules/pkg/index.js"), "x").expect("write");
        std::fs::write(dir.path().join(".hidden/secret"), "x").expect("write");
        std::fs::write(dir.path().join("main.rs"), "x").expect("write");
        let found = bounded_walk(dir.path());
        assert_eq!(found, vec!["main.rs".to_string()]);
    }

    #[test]
    fn candidates_carry_the_file_name_for_ranking() {
        let candidate = MentionCandidate::new("a/b/c.rs");
        assert_eq!(candidate.file_name, "c.rs");
    }
}
