mod parser;

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use thiserror::Error;

pub use parser::{Hunk, ParseError, ParsedPatch, UpdateFileChunk, parse_patch};

#[derive(Debug, Error)]
pub enum ApplyPatchError {
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error("I/O error for {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("{0}")]
    Apply(String),
}

impl ApplyPatchError {
    fn io(path: impl Into<PathBuf>, source: io::Error) -> Self {
        Self::Io {
            path: path.into(),
            source,
        }
    }
}

pub struct PatchApplyOutcome {
    pub added: Vec<PathBuf>,
    pub modified: Vec<PathBuf>,
    pub deleted: Vec<PathBuf>,
}

/// Apply a parsed patch rooted at `root`. On first failure, already-applied
/// changes are NOT rolled back (matches reference behavior in scenario 015).
pub fn apply_patch(patch: &ParsedPatch, root: &Path) -> Result<PatchApplyOutcome, ApplyPatchError> {
    if patch.hunks.is_empty() {
        return Err(ApplyPatchError::Apply("No files were modified.".to_string()));
    }

    let mut added: Vec<PathBuf> = Vec::new();
    let mut modified: Vec<PathBuf> = Vec::new();
    let mut deleted: Vec<PathBuf> = Vec::new();

    for hunk in &patch.hunks {
        match hunk {
            Hunk::AddFile { path, contents } => {
                let abs = resolve(root, path);
                write_with_parent_mkdir(&abs, contents.as_bytes())
                    .map_err(|e| ApplyPatchError::io(&abs, e))?;
                added.push(path.clone());
            }
            Hunk::DeleteFile { path } => {
                let abs = resolve(root, path);
                let meta = fs::metadata(&abs).map_err(|e| ApplyPatchError::io(&abs, e))?;
                if meta.is_dir() {
                    return Err(ApplyPatchError::Apply(format!(
                        "Cannot delete directory: {}",
                        abs.display()
                    )));
                }
                fs::remove_file(&abs).map_err(|e| ApplyPatchError::io(&abs, e))?;
                deleted.push(path.clone());
            }
            Hunk::UpdateFile {
                path,
                move_path,
                chunks,
            } => {
                let abs = resolve(root, path);
                let new_contents = apply_chunks_to_file(&abs, chunks)?;

                if let Some(dest) = move_path {
                    let dest_abs = resolve(root, dest);
                    write_with_parent_mkdir(&dest_abs, new_contents.as_bytes())
                        .map_err(|e| ApplyPatchError::io(&dest_abs, e))?;
                    let meta = fs::metadata(&abs).map_err(|e| ApplyPatchError::io(&abs, e))?;
                    if meta.is_dir() {
                        return Err(ApplyPatchError::Apply(format!(
                            "Cannot delete directory: {}",
                            abs.display()
                        )));
                    }
                    fs::remove_file(&abs).map_err(|e| ApplyPatchError::io(&abs, e))?;
                    modified.push(dest.clone());
                } else {
                    fs::write(&abs, new_contents.as_bytes())
                        .map_err(|e| ApplyPatchError::io(&abs, e))?;
                    modified.push(path.clone());
                }
            }
        }
    }

    Ok(PatchApplyOutcome {
        added,
        modified,
        deleted,
    })
}

/// Parse the patch text and apply it, returning an outcome.
pub fn parse_and_apply(patch_text: &str, root: &Path) -> Result<PatchApplyOutcome, ApplyPatchError> {
    let parsed = parse_patch(patch_text)?;
    apply_patch(&parsed, root)
}

fn resolve(root: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        root.join(path)
    }
}

fn write_with_parent_mkdir(path: &Path, contents: &[u8]) -> io::Result<()> {
    match fs::write(path, contents) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(path, contents)
        }
        Err(e) => Err(e),
    }
}

fn apply_chunks_to_file(
    path: &Path,
    chunks: &[UpdateFileChunk],
) -> Result<String, ApplyPatchError> {
    let raw = fs::read_to_string(path).map_err(|e| ApplyPatchError::io(path, e))?;

    let mut lines: Vec<String> = raw.split('\n').map(String::from).collect();
    // Drop the trailing empty string produced by a final newline.
    if lines.last().is_some_and(|l| l.is_empty()) {
        lines.pop();
    }

    let replacements = compute_replacements(&lines, path, chunks)?;
    let mut result = apply_replacements(lines, &replacements);

    // Ensure trailing newline.
    if !result.last().is_some_and(|l| l.is_empty()) {
        result.push(String::new());
    }

    Ok(result.join("\n"))
}

fn compute_replacements(
    original: &[String],
    path: &Path,
    chunks: &[UpdateFileChunk],
) -> Result<Vec<(usize, usize, Vec<String>)>, ApplyPatchError> {
    let mut replacements: Vec<(usize, usize, Vec<String>)> = Vec::new();
    let mut line_index = 0usize;

    for chunk in chunks {
        // Advance past the change context anchor if present.
        if let Some(ctx) = &chunk.change_context {
            match seek_sequence(original, std::slice::from_ref(ctx), line_index, false) {
                Some(idx) => line_index = idx + 1,
                None => {
                    return Err(ApplyPatchError::Apply(format!(
                        "Failed to find context '{}' in {}",
                        ctx,
                        path.display()
                    )));
                }
            }
        }

        if chunk.old_lines.is_empty() {
            // Pure insertion — add before the trailing empty line if present.
            let insert_at = if original.last().is_some_and(|l| l.is_empty()) {
                original.len() - 1
            } else {
                original.len()
            };
            replacements.push((insert_at, 0, chunk.new_lines.clone()));
            continue;
        }

        let mut pattern: &[String] = &chunk.old_lines;
        let mut new_slice: &[String] = &chunk.new_lines;

        let mut found =
            seek_sequence(original, pattern, line_index, chunk.is_end_of_file);

        // Retry without trailing empty line (represents final-newline in file).
        if found.is_none() && pattern.last().is_some_and(|l| l.is_empty()) {
            pattern = &pattern[..pattern.len() - 1];
            if new_slice.last().is_some_and(|l| l.is_empty()) {
                new_slice = &new_slice[..new_slice.len() - 1];
            }
            found = seek_sequence(original, pattern, line_index, chunk.is_end_of_file);
        }

        match found {
            Some(start) => {
                replacements.push((start, pattern.len(), new_slice.to_vec()));
                line_index = start + pattern.len();
            }
            None => {
                return Err(ApplyPatchError::Apply(format!(
                    "Failed to find expected lines in {}:\n{}",
                    path.display(),
                    chunk.old_lines.join("\n"),
                )));
            }
        }
    }

    replacements.sort_by_key(|(idx, _, _)| *idx);
    Ok(replacements)
}

fn apply_replacements(
    mut lines: Vec<String>,
    replacements: &[(usize, usize, Vec<String>)],
) -> Vec<String> {
    for (start, old_len, new_segment) in replacements.iter().rev() {
        let start = *start;
        for _ in 0..*old_len {
            if start < lines.len() {
                lines.remove(start);
            }
        }
        for (offset, new_line) in new_segment.iter().enumerate() {
            lines.insert(start + offset, new_line.clone());
        }
    }
    lines
}

/// Find the first occurrence of `pattern` in `haystack` at or after `from`.
/// If `is_end_of_file` is true, the match must start at `haystack.len() - pattern.len()`.
fn seek_sequence(
    haystack: &[String],
    pattern: &[String],
    from: usize,
    is_end_of_file: bool,
) -> Option<usize> {
    if pattern.is_empty() {
        return Some(from);
    }
    if is_end_of_file {
        if haystack.len() < pattern.len() {
            return None;
        }
        let start = haystack.len() - pattern.len();
        if start >= from && &haystack[start..] == pattern {
            return Some(start);
        }
        return None;
    }
    (from..=haystack.len().saturating_sub(pattern.len()))
        .find(|&i| &haystack[i..i + pattern.len()] == pattern)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seek_sequence_basic() {
        let hay: Vec<String> = vec!["a", "b", "c"].into_iter().map(String::from).collect();
        let pat: Vec<String> = vec!["b"].into_iter().map(String::from).collect();
        assert_eq!(seek_sequence(&hay, &pat, 0, false), Some(1));
    }

    #[test]
    fn test_seek_sequence_eof() {
        let hay: Vec<String> = vec!["a", "b", "c"].into_iter().map(String::from).collect();
        let pat: Vec<String> = vec!["b", "c"].into_iter().map(String::from).collect();
        assert_eq!(seek_sequence(&hay, &pat, 0, true), Some(1));
        let pat2: Vec<String> = vec!["a", "b"].into_iter().map(String::from).collect();
        assert_eq!(seek_sequence(&hay, &pat2, 0, true), None);
    }
}
