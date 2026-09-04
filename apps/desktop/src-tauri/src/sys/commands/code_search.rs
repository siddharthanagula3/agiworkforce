
use glob::Pattern;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::{debug, info, warn};
use walkdir::WalkDir;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/// A single grep match result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrepMatch {
    /// Absolute path to the file.
    pub path: String,
    /// 1-indexed line number of the match.
    /// In `"count"` mode this field stores the per-file match count instead.
    pub line_number: usize,
    /// The raw line text that matched.
    pub line: String,
    /// Column offset of the first match (0-indexed).
    pub column: usize,
    /// Surrounding context lines (populated when `context_lines > 0` in `"content"` mode).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<Vec<String>>,
}

/// Response from `grep_search`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrepSearchResult {
    pub matches: Vec<GrepMatch>,
    pub total_files_searched: usize,
    pub total_matches: usize,
    pub returned: usize,
    pub limit: usize,
    pub offset: usize,
    pub truncated: bool,
}

/// A single glob match result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobMatch {
    pub path: String,
    pub relative_path: String,
    pub is_file: bool,
    pub size_bytes: u64,
    pub modified_secs: i64,
}

/// Response from `glob_search`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobSearchResult {
    pub matches: Vec<GlobMatch>,
    pub total_matches: usize,
    pub returned: usize,
    pub limit: usize,
    pub offset: usize,
    pub truncated: bool,
}

/// Language-formatter info.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatterInfo {
    pub language: String,
    pub formatter: String,
    pub command: Vec<String>,
    pub available: bool,
}

/// Result from `format_file`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatResult {
    pub formatted: bool,
    pub formatter: String,
    pub changed: bool,
    pub error: Option<String>,
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const DEFAULT_GREP_LIMIT: usize = 250;
const MAX_GREP_MATCHES: usize = 1000;
const MAX_SEARCH_OFFSET: usize = 100_000;
const MAX_GLOB_MATCHES: usize = 1000;
const MAX_FILE_SIZE_BYTES: u64 = 10 * 1024 * 1024;

/// Directories that are always excluded from search.
const EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    ".git",
    ".next",
    ".turbo",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
    ".mypy_cache",
    ".pytest_cache",
    "vendor",
    ".cargo",
    "out",
    ".output",
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

pub(super) fn is_excluded_dir(path: &Path) -> bool {
    path.components().any(|c| {
        c.as_os_str()
            .to_str()
            .map(|s| EXCLUDED_DIRS.contains(&s))
            .unwrap_or(false)
    })
}

fn resolve_root(root_hint: Option<String>) -> PathBuf {
    if let Some(r) = root_hint {
        let p = PathBuf::from(&r);
        if p.exists() && p.is_dir() {
            return p;
        }
    }
    // Fall back to the env-set project folder, then cwd.
    if let Ok(proj) = std::env::var("AGI_PROJECT_FOLDER") {
        let p = PathBuf::from(&proj);
        if p.exists() && p.is_dir() {
            return p;
        }
    }
    std::env::current_dir()
        .unwrap_or_else(|_| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
}

fn resolve_existing_search_root(root_hint: Option<String>) -> Result<PathBuf, String> {
    if let Some(r) = root_hint {
        let p = PathBuf::from(&r);
        if !p.exists() {
            return Err(format!("Search root does not exist: {}", p.display()));
        }
        if !p.is_dir() {
            return Err(format!("Search root is not a directory: {}", p.display()));
        }
        return Ok(p);
    }

    if let Ok(proj) = std::env::var("AGI_PROJECT_FOLDER") {
        let p = PathBuf::from(&proj);
        if p.exists() && p.is_dir() {
            return Ok(p);
        }
    }

    std::env::current_dir()
        .or_else(|_| {
            dirs::home_dir().ok_or_else(|| std::io::Error::other("home directory unavailable"))
        })
        .map_err(|e| format!("Cannot resolve search root: {}", e))
}

fn normalize_search_window(
    limit: Option<usize>,
    offset: Option<usize>,
    default_limit: usize,
    max_limit: usize,
) -> Result<(usize, usize), String> {
    let limit = limit.unwrap_or(default_limit);
    if limit == 0 {
        return Err("Search limit must be greater than 0".to_string());
    }
    let offset = offset.unwrap_or(0);
    if offset > MAX_SEARCH_OFFSET {
        return Err(format!(
            "Search offset too large: {} (max {})",
            offset, MAX_SEARCH_OFFSET
        ));
    }
    Ok((limit.min(max_limit), offset))
}

/// Naively detect if a file looks binary (contains NUL bytes in the first 8 KB).
fn is_likely_binary(path: &Path) -> bool {
    use std::io::Read;
    if let Ok(mut f) = std::fs::File::open(path) {
        let mut buf = [0u8; 8192];
        if let Ok(n) = f.read(&mut buf) {
            return buf[..n].contains(&0u8);
        }
    }
    false
}


#[tauri::command]
pub async fn grep_search(
    pattern: String,
    root: Option<String>,
    include_pattern: Option<String>,
    case_insensitive: Option<bool>,
    output_mode: Option<String>,
    context_lines: Option<u32>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<GrepSearchResult, String> {
    let root = resolve_existing_search_root(root)?;
    let ci = case_insensitive.unwrap_or(false);
    let mode = output_mode.unwrap_or_else(|| "content".to_string());
    let ctx = context_lines.unwrap_or(0);
    let (limit, offset) =
        normalize_search_window(limit, offset, DEFAULT_GREP_LIMIT, MAX_GREP_MATCHES)?;

    // Validate output_mode upfront.
    if !matches!(mode.as_str(), "content" | "files_with_matches" | "count") {
        return Err(format!(
            "Invalid output_mode '{}'. Must be 'content', 'files_with_matches', or 'count'.",
            mode
        ));
    }

    let re = {
        let mut builder = regex::RegexBuilder::new(&pattern);
        builder.case_insensitive(ci);
        builder
            .build()
            .map_err(|e| format!("Invalid regex pattern '{}': {}", pattern, e))?
    };

    let file_glob: Option<Pattern> = if let Some(ref pat) = include_pattern {
        Some(Pattern::new(pat).map_err(|e| format!("Invalid include pattern '{}': {}", pat, e))?)
    } else {
        None
    };

    info!(
        "[grep_search] pattern={:?} root={:?} include={:?} ci={} mode={} ctx={} limit={} offset={}",
        pattern, root, include_pattern, ci, mode, ctx, limit, offset
    );

    let result = tokio::task::spawn_blocking(move || {
        grep_blocking(&root, &re, file_glob.as_ref(), &mode, ctx, limit, offset)
    })
    .await
    .map_err(|e| format!("grep_search task panicked: {}", e))?;

    result
}

fn grep_blocking(
    root: &Path,
    re: &Regex,
    file_glob: Option<&Pattern>,
    output_mode: &str,
    context_lines: u32,
    limit: usize,
    offset: usize,
) -> Result<GrepSearchResult, String> {
    let mut matches = Vec::new();
    let mut total_files_searched = 0usize;
    let mut total_matches = 0usize;
    let mut returned = 0usize;
    let mut truncated = false;

    // For "count" mode we accumulate per-file counts.
    // For "files_with_matches" we track which files had at least one match.
    let mut file_counts: Vec<(String, usize)> = Vec::new();
    let mut seen_files: Vec<String> = Vec::new();

    'outer: for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !is_excluded_dir(e.path()))
    {
        let entry = match entry {
            Ok(e) => e,
            Err(err) => {
                debug!("[grep_search] walk error: {}", err);
                continue;
            }
        };

        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();

        // Apply include-pattern filter on the filename/path.
        if let Some(pat) = file_glob {
            let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let rel = path.strip_prefix(root).unwrap_or(path).to_string_lossy();
            if !pat.matches(file_name) && !pat.matches(&rel) {
                continue;
            }
        }

        // Skip oversized files.
        // Do not turn a file symlink into searchable project content.
        let meta = match std::fs::symlink_metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.len() > MAX_FILE_SIZE_BYTES {
            continue;
        }

        // Skip binary files.
        if is_likely_binary(path) {
            continue;
        }

        total_files_searched += 1;

        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let path_str = path.to_string_lossy().to_string();

        match output_mode {
            "files_with_matches" => {
                // Only need to know if there is at least one match in the file.
                if re.is_match(&content) {
                    total_matches += 1;
                    if total_matches <= offset {
                        continue;
                    }
                    if returned >= limit {
                        truncated = true;
                        break 'outer;
                    }
                    returned += 1;
                    seen_files.push(path_str);
                }
            }
            "count" => {
                let count = content.lines().filter(|line| re.is_match(line)).count();
                if count > 0 {
                    total_matches += 1;
                    if total_matches <= offset {
                        continue;
                    }
                    if returned >= limit {
                        truncated = true;
                        break 'outer;
                    }
                    returned += 1;
                    file_counts.push((path_str, count));
                }
            }
            // "content" (default)
            _ => {
                let lines_vec: Vec<&str> = content.lines().collect();
                let total_lines = lines_vec.len();

                for (line_idx, line) in lines_vec.iter().enumerate() {
                    if let Some(m) = re.find(line) {
                        total_matches += 1;
                        if total_matches <= offset {
                            continue;
                        }
                        if returned >= limit {
                            truncated = true;
                            break 'outer;
                        }
                        returned += 1;

                        let context = if context_lines > 0 {
                            let ctx = context_lines as usize;
                            let start = line_idx.saturating_sub(ctx);
                            let end = (line_idx + ctx + 1).min(total_lines);
                            let mut ctx_lines = Vec::new();
                            for (i, item) in lines_vec.iter().enumerate().take(end).skip(start) {
                                if i == line_idx {
                                    continue; // skip the match line itself
                                }
                                ctx_lines.push(format!("{}:{}", i + 1, item));
                            }
                            Some(ctx_lines)
                        } else {
                            None
                        };

                        matches.push(GrepMatch {
                            path: path_str.clone(),
                            line_number: line_idx + 1,
                            line: line.to_string(),
                            column: m.start(),
                            context,
                        });
                    }
                }
            }
        }
    }

    // Convert mode-specific accumulators into GrepMatch entries.
    match output_mode {
        "files_with_matches" => {
            matches = seen_files
                .into_iter()
                .map(|path| GrepMatch {
                    path,
                    line_number: 0,
                    line: String::new(),
                    column: 0,
                    context: None,
                })
                .collect();
        }
        "count" => {
            matches = file_counts
                .into_iter()
                .map(|(path, count)| GrepMatch {
                    path,
                    line_number: count,
                    line: String::new(),
                    column: 0,
                    context: None,
                })
                .collect();
        }
        _ => {}
    }

    Ok(GrepSearchResult {
        returned: matches.len(),
        matches,
        total_files_searched,
        total_matches,
        limit,
        offset,
        truncated,
    })
}


#[tauri::command]
pub async fn glob_search(
    pattern: String,
    root: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<GlobSearchResult, String> {
    let root = resolve_existing_search_root(root)?;
    let (limit, offset) = normalize_search_window(limit, offset, 200, MAX_GLOB_MATCHES)?;

    // Validate glob pattern upfront.
    let _ =
        Pattern::new(&pattern).map_err(|e| format!("Invalid glob pattern '{}': {}", pattern, e))?;

    info!(
        "[glob_search] pattern={:?} root={:?} limit={} offset={}",
        pattern, root, limit, offset
    );

    let result = tokio::task::spawn_blocking(move || glob_blocking(&root, &pattern, limit, offset))
        .await
        .map_err(|e| format!("glob_search task panicked: {}", e))?;

    result
}

fn glob_blocking(
    root: &Path,
    pattern: &str,
    limit: usize,
    offset: usize,
) -> Result<GlobSearchResult, String> {
    let pat = Pattern::new(pattern).map_err(|e| format!("Pattern error: {}", e))?;
    let mut matches: Vec<(GlobMatch, std::time::SystemTime)> = Vec::new();

    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !is_excluded_dir(e.path()))
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();

        // Match against path relative to root, and also just the filename.
        let rel = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        let matched = pat.matches(&rel) || pat.matches(file_name) || {
            // Support `**` patterns by trying each path suffix.
            let parts: Vec<&str> = rel.split('/').collect();
            (0..parts.len()).any(|i| {
                let suffix = parts[i..].join("/");
                pat.matches(&suffix)
            })
        };

        if !matched {
            continue;
        }

        // `WalkDir::follow_links(false)` does not make `metadata` safe for a
        // file symlink: it would still advertise the target as a regular Cloud
        // handoff candidate. Keep links out of the listing entirely.
        let meta = match std::fs::symlink_metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.file_type().is_symlink() {
            continue;
        }

        let modified = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        let modified_secs = modified
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        matches.push((
            GlobMatch {
                path: path.to_string_lossy().to_string(),
                relative_path: rel,
                is_file: meta.is_file(),
                size_bytes: meta.len(),
                modified_secs,
            },
            modified,
        ));
    }

    // Sort by most-recently modified first.
    matches.sort_by(|a, b| b.1.cmp(&a.1));

    let total_matches = matches.len();
    let end = offset.saturating_add(limit).min(total_matches);
    let truncated = total_matches > end;

    Ok(GlobSearchResult {
        matches: matches
            .into_iter()
            .skip(offset)
            .take(limit)
            .map(|(m, _)| m)
            .collect::<Vec<_>>(),
        total_matches,
        returned: end.saturating_sub(offset.min(total_matches)),
        limit,
        offset,
        truncated,
    })
}


#[tauri::command]
pub async fn format_file(
    path: String,
    project_root: Option<String>,
) -> Result<FormatResult, String> {
    let file_path = PathBuf::from(&path);

    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }
    if !file_path.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }

    let root = resolve_root(project_root);
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    info!("[format_file] path={} ext={}", path, ext);

    let content_before = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Cannot read file for formatting: {}", e))?;

    let result = tokio::task::spawn_blocking(move || {
        run_formatter(&file_path, &ext, &root, &content_before)
    })
    .await
    .map_err(|e| format!("Formatter task panicked: {}", e))?;

    result
}

/// Detect which formatter would be used for a given file extension.
#[tauri::command]
pub async fn format_detect(
    path: String,
    project_root: Option<String>,
) -> Result<FormatterInfo, String> {
    let file_path = PathBuf::from(&path);
    let root = resolve_root(project_root);
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let info = tokio::task::spawn_blocking(move || detect_formatter(&ext, &root))
        .await
        .map_err(|e| format!("Detect task panicked: {}", e))?;

    Ok(info)
}

fn run_formatter(
    path: &Path,
    ext: &str,
    root: &Path,
    content_before: &str,
) -> Result<FormatResult, String> {
    let info = detect_formatter(ext, root);

    if !info.available {
        return Ok(FormatResult {
            formatted: false,
            formatter: info.formatter.clone(),
            changed: false,
            error: Some(format!(
                "Formatter '{}' not found in PATH. Install it to enable auto-formatting.",
                info.formatter
            )),
        });
    }

    if info.formatter == "none" {
        return Ok(FormatResult {
            formatted: false,
            formatter: "none".to_string(),
            changed: false,
            error: None,
        });
    }

    // Build the actual command args, substituting $FILE where needed.
    let args: Vec<String> = info
        .command
        .iter()
        .map(|arg| {
            if arg == "$FILE" {
                path.to_string_lossy().to_string()
            } else {
                arg.clone()
            }
        })
        .collect();

    debug!(
        "[format_file] running formatter: {:?} args={:?}",
        info.formatter, args
    );

    let cmd_name = args[0].clone();
    let cmd_args = &args[1..];

    let output = std::process::Command::new(&cmd_name)
        .args(cmd_args)
        .current_dir(root)
        .output()
        .map_err(|e| format!("Failed to run formatter '{}': {}", cmd_name, e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        warn!(
            "[format_file] formatter '{}' failed: {}",
            info.formatter, stderr
        );
        return Ok(FormatResult {
            formatted: true,
            formatter: info.formatter,
            changed: false,
            error: Some(stderr),
        });
    }

    // Check if the file changed after formatting.
    let content_after = std::fs::read_to_string(path)
        .map_err(|e| format!("Cannot re-read file after formatting: {}", e))?;

    let changed = content_before != content_after;
    if changed {
        info!("[format_file] file changed after formatting: {:?}", path);
    }

    Ok(FormatResult {
        formatted: true,
        formatter: info.formatter,
        changed,
        error: None,
    })
}

/// Detect the appropriate formatter for a file extension.
/// Checks whether the binary is available in PATH.
fn detect_formatter(ext: &str, root: &Path) -> FormatterInfo {
    // Check for project-local prettier / biome config first.
    let has_prettier = root.join("node_modules/.bin/prettier").exists()
        || root.join(".prettierrc").exists()
        || root.join(".prettierrc.json").exists()
        || root.join("prettier.config.js").exists();

    let has_biome = root.join("node_modules/.bin/biome").exists()
        || root.join("biome.json").exists()
        || root.join("biome.jsonc").exists();

    let has_ruff = which_available("ruff");
    let has_black = which_available("black");

    match ext {
        // ── Rust ────────────────────────────────────────────────────────
        "rs" => FormatterInfo {
            language: "rust".to_string(),
            formatter: "rustfmt".to_string(),
            command: vec!["rustfmt".to_string(), "$FILE".to_string()],
            available: which_available("rustfmt"),
        },

        // ── TypeScript / JavaScript ────────────────────────────────────
        "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" => {
            if has_biome {
                let biome_bin = if root.join("node_modules/.bin/biome").exists() {
                    root.join("node_modules/.bin/biome")
                        .to_string_lossy()
                        .to_string()
                } else {
                    "biome".to_string()
                };
                FormatterInfo {
                    language: "typescript".to_string(),
                    formatter: "biome".to_string(),
                    command: vec![
                        biome_bin,
                        "format".to_string(),
                        "--write".to_string(),
                        "$FILE".to_string(),
                    ],
                    available: true,
                }
            } else if has_prettier {
                let prettier_bin = if root.join("node_modules/.bin/prettier").exists() {
                    root.join("node_modules/.bin/prettier")
                        .to_string_lossy()
                        .to_string()
                } else {
                    "prettier".to_string()
                };
                FormatterInfo {
                    language: "typescript".to_string(),
                    formatter: "prettier".to_string(),
                    command: vec![prettier_bin, "--write".to_string(), "$FILE".to_string()],
                    available: true,
                }
            } else {
                FormatterInfo {
                    language: "typescript".to_string(),
                    formatter: "prettier".to_string(),
                    command: vec![
                        "prettier".to_string(),
                        "--write".to_string(),
                        "$FILE".to_string(),
                    ],
                    available: which_available("prettier"),
                }
            }
        }

        // ── Python ──────────────────────────────────────────────────────
        "py" => {
            if has_ruff {
                FormatterInfo {
                    language: "python".to_string(),
                    formatter: "ruff".to_string(),
                    command: vec![
                        "ruff".to_string(),
                        "format".to_string(),
                        "$FILE".to_string(),
                    ],
                    available: true,
                }
            } else {
                FormatterInfo {
                    language: "python".to_string(),
                    formatter: "black".to_string(),
                    command: vec!["black".to_string(), "$FILE".to_string()],
                    available: has_black,
                }
            }
        }

        // ── Go ──────────────────────────────────────────────────────────
        "go" => FormatterInfo {
            language: "go".to_string(),
            formatter: "gofmt".to_string(),
            command: vec!["gofmt".to_string(), "-w".to_string(), "$FILE".to_string()],
            available: which_available("gofmt"),
        },

        // ── Ruby ────────────────────────────────────────────────────────
        "rb" => FormatterInfo {
            language: "ruby".to_string(),
            formatter: "rubocop".to_string(),
            command: vec![
                "rubocop".to_string(),
                "--autocorrect".to_string(),
                "$FILE".to_string(),
            ],
            available: which_available("rubocop"),
        },

        // ── C / C++ ─────────────────────────────────────────────────────
        "c" | "cpp" | "cc" | "cxx" | "h" | "hpp" | "hxx" => FormatterInfo {
            language: "c".to_string(),
            formatter: "clang-format".to_string(),
            command: vec![
                "clang-format".to_string(),
                "-i".to_string(),
                "$FILE".to_string(),
            ],
            available: which_available("clang-format"),
        },

        // ── Shell ───────────────────────────────────────────────────────
        "sh" | "bash" | "zsh" | "fish" => FormatterInfo {
            language: "shell".to_string(),
            formatter: "shfmt".to_string(),
            command: vec!["shfmt".to_string(), "-w".to_string(), "$FILE".to_string()],
            available: which_available("shfmt"),
        },

        // ── JSON ────────────────────────────────────────────────────────
        "json" | "jsonc" => {
            if has_prettier {
                let prettier_bin = if root.join("node_modules/.bin/prettier").exists() {
                    root.join("node_modules/.bin/prettier")
                        .to_string_lossy()
                        .to_string()
                } else {
                    "prettier".to_string()
                };
                FormatterInfo {
                    language: "json".to_string(),
                    formatter: "prettier".to_string(),
                    command: vec![prettier_bin, "--write".to_string(), "$FILE".to_string()],
                    available: true,
                }
            } else {
                FormatterInfo {
                    language: "json".to_string(),
                    formatter: "prettier".to_string(),
                    command: vec![
                        "prettier".to_string(),
                        "--write".to_string(),
                        "$FILE".to_string(),
                    ],
                    available: which_available("prettier"),
                }
            }
        }

        // ── TOML ────────────────────────────────────────────────────────
        "toml" => FormatterInfo {
            language: "toml".to_string(),
            formatter: "taplo".to_string(),
            command: vec!["taplo".to_string(), "fmt".to_string(), "$FILE".to_string()],
            available: which_available("taplo"),
        },

        // ── Markdown / CSS / HTML / SCSS ───────────────────────────────
        "md" | "mdx" | "css" | "scss" | "sass" | "less" | "html" | "vue" | "svelte" => {
            let prettier_bin = if root.join("node_modules/.bin/prettier").exists() {
                root.join("node_modules/.bin/prettier")
                    .to_string_lossy()
                    .to_string()
            } else {
                "prettier".to_string()
            };
            FormatterInfo {
                language: ext.to_string(),
                formatter: "prettier".to_string(),
                command: vec![prettier_bin, "--write".to_string(), "$FILE".to_string()],
                available: which_available("prettier") || has_prettier,
            }
        }

        // ── Zig ─────────────────────────────────────────────────────────
        "zig" => FormatterInfo {
            language: "zig".to_string(),
            formatter: "zig fmt".to_string(),
            command: vec!["zig".to_string(), "fmt".to_string(), "$FILE".to_string()],
            available: which_available("zig"),
        },

        // ── Dart ────────────────────────────────────────────────────────
        "dart" => FormatterInfo {
            language: "dart".to_string(),
            formatter: "dart format".to_string(),
            command: vec![
                "dart".to_string(),
                "format".to_string(),
                "$FILE".to_string(),
            ],
            available: which_available("dart"),
        },

        // ── Terraform ───────────────────────────────────────────────────
        "tf" | "tfvars" => FormatterInfo {
            language: "terraform".to_string(),
            formatter: "terraform fmt".to_string(),
            command: vec![
                "terraform".to_string(),
                "fmt".to_string(),
                "$FILE".to_string(),
            ],
            available: which_available("terraform"),
        },

        // ── Elixir ──────────────────────────────────────────────────────
        "ex" | "exs" => FormatterInfo {
            language: "elixir".to_string(),
            formatter: "mix format".to_string(),
            command: vec!["mix".to_string(), "format".to_string(), "$FILE".to_string()],
            available: which_available("mix"),
        },

        // ── Gleam ───────────────────────────────────────────────────────
        "gleam" => FormatterInfo {
            language: "gleam".to_string(),
            formatter: "gleam format".to_string(),
            command: vec![
                "gleam".to_string(),
                "format".to_string(),
                "$FILE".to_string(),
            ],
            available: which_available("gleam"),
        },

        // ── Java / Kotlin ───────────────────────────────────────────────
        "java" | "kt" | "kts" => FormatterInfo {
            language: if ext == "java" { "java" } else { "kotlin" }.to_string(),
            formatter: "google-java-format".to_string(),
            command: vec![
                "google-java-format".to_string(),
                "--replace".to_string(),
                "$FILE".to_string(),
            ],
            available: which_available("google-java-format"),
        },

        // ── Unknown ─────────────────────────────────────────────────────
        _ => FormatterInfo {
            language: ext.to_string(),
            formatter: "none".to_string(),
            command: vec![],
            available: false,
        },
    }
}

/// Check whether a binary exists anywhere in PATH.
fn which_available(name: &str) -> bool {
    which::which(name).is_ok()
}

#[cfg(test)]
mod code_search_tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn glob_listing_excludes_file_symlinks() {
        use std::os::unix::fs::symlink;

        let root = tempfile::tempdir().expect("temp root");
        let outside = tempfile::NamedTempFile::new().expect("outside file");
        std::fs::write(root.path().join("inside.txt"), b"inside").expect("inside file");
        symlink(outside.path(), root.path().join("linked.txt")).expect("file symlink");

        let result = glob_blocking(root.path(), "**/*", 100, 0).expect("glob result");
        assert!(result
            .matches
            .iter()
            .any(|entry| entry.relative_path == "inside.txt"));
        assert!(!result
            .matches
            .iter()
            .any(|entry| entry.relative_path == "linked.txt"));
    }
}
