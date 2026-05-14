use std::path::PathBuf;

use thiserror::Error;

const BEGIN_PATCH_MARKER: &str = "*** Begin Patch";
const END_PATCH_MARKER: &str = "*** End Patch";
const ADD_FILE_MARKER: &str = "*** Add File: ";
const DELETE_FILE_MARKER: &str = "*** Delete File: ";
const UPDATE_FILE_MARKER: &str = "*** Update File: ";
const MOVE_TO_MARKER: &str = "*** Move to: ";
const EOF_MARKER: &str = "*** End of File";
const CHANGE_CONTEXT_MARKER: &str = "@@ ";
const EMPTY_CHANGE_CONTEXT_MARKER: &str = "@@";

#[derive(Debug, PartialEq, Error, Clone)]
pub enum ParseError {
    #[error("invalid patch: {0}")]
    InvalidPatchError(String),
    #[error("invalid hunk at line {line_number}: {message}")]
    InvalidHunkError { message: String, line_number: usize },
}

#[derive(Debug, PartialEq, Clone)]
pub struct UpdateFileChunk {
    pub change_context: Option<String>,
    pub old_lines: Vec<String>,
    pub new_lines: Vec<String>,
    pub is_end_of_file: bool,
}

#[derive(Debug, PartialEq, Clone)]
pub enum Hunk {
    AddFile {
        path: PathBuf,
        contents: String,
    },
    DeleteFile {
        path: PathBuf,
    },
    UpdateFile {
        path: PathBuf,
        move_path: Option<PathBuf>,
        chunks: Vec<UpdateFileChunk>,
    },
}

pub struct ParsedPatch {
    pub hunks: Vec<Hunk>,
}

pub fn parse_patch(patch: &str) -> Result<ParsedPatch, ParseError> {
    parse_patch_text(patch)
}

fn parse_patch_text(patch: &str) -> Result<ParsedPatch, ParseError> {
    let lines: Vec<&str> = patch.trim().lines().collect();
    let body_lines = check_patch_boundaries(&lines)?;

    let mut hunks: Vec<Hunk> = Vec::new();
    let mut remaining = body_lines;
    let mut line_number = 2usize;

    while !remaining.is_empty() {
        let (hunk, consumed) = parse_one_hunk(remaining, line_number)?;
        hunks.push(hunk);
        line_number += consumed;
        remaining = &remaining[consumed..];
    }

    Ok(ParsedPatch { hunks })
}

fn check_patch_boundaries<'a>(lines: &'a [&'a str]) -> Result<&'a [&'a str], ParseError> {
    let (first, last) = match lines {
        [] => (None, None),
        [only] => (Some(*only), Some(*only)),
        [first, .., last] => (Some(*first), Some(*last)),
    };

    let first_trimmed = first.map(str::trim);
    let last_trimmed = last.map(str::trim);

    match (first_trimmed, last_trimmed) {
        (Some(f), Some(l)) if f == BEGIN_PATCH_MARKER && l == END_PATCH_MARKER => {
            Ok(&lines[1..lines.len() - 1])
        }
        (Some(f), _) if f != BEGIN_PATCH_MARKER => Err(ParseError::InvalidPatchError(
            "The first line of the patch must be '*** Begin Patch'".to_string(),
        )),
        _ => Err(ParseError::InvalidPatchError(
            "The last line of the patch must be '*** End Patch'".to_string(),
        )),
    }
}

fn parse_one_hunk<'a>(
    lines: &'a [&'a str],
    line_number: usize,
) -> Result<(Hunk, usize), ParseError> {
    let first = lines[0].trim();

    if let Some(path) = first.strip_prefix(ADD_FILE_MARKER) {
        let mut contents = String::new();
        let mut consumed = 1;
        for &line in &lines[1..] {
            if let Some(text) = line.strip_prefix('+') {
                contents.push_str(text);
                contents.push('\n');
                consumed += 1;
            } else {
                break;
            }
        }
        return Ok((
            Hunk::AddFile {
                path: PathBuf::from(path),
                contents,
            },
            consumed,
        ));
    }

    if let Some(path) = first.strip_prefix(DELETE_FILE_MARKER) {
        return Ok((
            Hunk::DeleteFile {
                path: PathBuf::from(path),
            },
            1,
        ));
    }

    if let Some(path) = first.strip_prefix(UPDATE_FILE_MARKER) {
        let mut remaining = &lines[1..];
        let mut consumed = 1;

        let move_path = remaining
            .first()
            .and_then(|l| l.strip_prefix(MOVE_TO_MARKER));
        if move_path.is_some() {
            remaining = &remaining[1..];
            consumed += 1;
        }

        let mut chunks: Vec<UpdateFileChunk> = Vec::new();

        while !remaining.is_empty() {
            if remaining[0].trim().is_empty() {
                consumed += 1;
                remaining = &remaining[1..];
                continue;
            }
            if remaining[0].starts_with('*') {
                break;
            }
            let (chunk, chunk_lines) =
                parse_update_chunk(remaining, line_number + consumed, chunks.is_empty())?;
            chunks.push(chunk);
            consumed += chunk_lines;
            remaining = &remaining[chunk_lines..];
        }

        if chunks.is_empty() {
            return Err(ParseError::InvalidHunkError {
                message: format!("Update file hunk for path '{path}' is empty"),
                line_number,
            });
        }

        return Ok((
            Hunk::UpdateFile {
                path: PathBuf::from(path),
                move_path: move_path.map(PathBuf::from),
                chunks,
            },
            consumed,
        ));
    }

    Err(ParseError::InvalidHunkError {
        message: format!(
            "'{first}' is not a valid hunk header. \
             Valid hunk headers: '*** Add File: {{path}}', \
             '*** Delete File: {{path}}', '*** Update File: {{path}}'"
        ),
        line_number,
    })
}

fn parse_update_chunk(
    lines: &[&str],
    line_number: usize,
    allow_missing_context: bool,
) -> Result<(UpdateFileChunk, usize), ParseError> {
    if lines.is_empty() {
        return Err(ParseError::InvalidHunkError {
            message: "Update hunk does not contain any lines".to_string(),
            line_number,
        });
    }

    let (change_context, start_index) = if lines[0] == EMPTY_CHANGE_CONTEXT_MARKER {
        (None, 1)
    } else if let Some(ctx) = lines[0].strip_prefix(CHANGE_CONTEXT_MARKER) {
        (Some(ctx.to_string()), 1)
    } else {
        if !allow_missing_context {
            return Err(ParseError::InvalidHunkError {
                message: format!(
                    "Expected update hunk to start with a @@ context marker, got: '{}'",
                    lines[0]
                ),
                line_number,
            });
        }
        (None, 0)
    };

    if start_index >= lines.len() {
        return Err(ParseError::InvalidHunkError {
            message: "Update hunk does not contain any lines".to_string(),
            line_number: line_number + 1,
        });
    }

    let mut chunk = UpdateFileChunk {
        change_context,
        old_lines: Vec::new(),
        new_lines: Vec::new(),
        is_end_of_file: false,
    };
    let mut parsed_lines = 0;

    for &line in &lines[start_index..] {
        match line {
            EOF_MARKER => {
                if parsed_lines == 0 {
                    return Err(ParseError::InvalidHunkError {
                        message: "Update hunk does not contain any lines".to_string(),
                        line_number: line_number + 1,
                    });
                }
                chunk.is_end_of_file = true;
                parsed_lines += 1;
                break;
            }
            other => match other.chars().next() {
                None => {
                    chunk.old_lines.push(String::new());
                    chunk.new_lines.push(String::new());
                    parsed_lines += 1;
                }
                Some(' ') => {
                    chunk.old_lines.push(other[1..].to_string());
                    chunk.new_lines.push(other[1..].to_string());
                    parsed_lines += 1;
                }
                Some('+') => {
                    chunk.new_lines.push(other[1..].to_string());
                    parsed_lines += 1;
                }
                Some('-') => {
                    chunk.old_lines.push(other[1..].to_string());
                    parsed_lines += 1;
                }
                _ => {
                    if parsed_lines == 0 {
                        return Err(ParseError::InvalidHunkError {
                            message: format!(
                                "Unexpected line found in update hunk: '{other}'. \
                                 Every line should start with ' ' (context line), \
                                 '+' (added line), or '-' (removed line)"
                            ),
                            line_number: line_number + 1,
                        });
                    }
                    break;
                }
            },
        }
    }

    Ok((chunk, parsed_lines + start_index))
}
