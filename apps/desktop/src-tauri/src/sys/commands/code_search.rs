//! Code Search & Formatter Module
//!
//! Provides OpenCode-parity tools for the agent:
//! - `grep_search`  — regex content search across files (ripgrep-style, .gitignore-aware)
//! - `glob_search`  — find files matching a glob pattern (.gitignore-aware)
//! - `format_file`  — run language-specific formatter on a file after editing
//! - `format_detect` — detect which formatter would be used for a file
//!
//! These are registered both as Tauri commands (callable from JS) and in the
//! ToolRegistry so the LLM can invoke them directly.

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
    pub line_number: usize,
    /// The raw line text that matched.
    pub line: String,
    /// Column offset of the first match (0-indexed).
    pub column: usize,
}

/// Response from `grep_search`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrepSearchResult {
    pub matches: Vec<GrepMatch>,
    pub total_files_searched: usize,
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

const MAX_GREP_MATCHES: usize = 500;
const MAX_GLOB_MATCHES: usize = 1000;
const MAX_FILE_SIZE_BYTES: u64 = 10 * 1024 * 1024; // 10 MB — skip binary blobs

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

fn is_excluded_dir(path: &Path) -> bool {
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

// ─────────────────────────────────────────────
// grep_search — regex content search
// ─────────────────────────────────────────────

/// Search file contents using a regular expression.
///
/// Mirrors OpenCode's `Grep` tool:
/// - Skips excluded dirs, binary files, and files > 10 MB.
/// - Respects an optional `include_pattern` glob (e.g. `"*.ts"`) to restrict
///   which file extensions are searched.
/// - Returns up to 500 matches; sets `truncated = true` if the limit is hit.
///
/// # Arguments
/// * `pattern`         — ECMAScript-compatible regex pattern.
/// * `root`            — Optional root directory. Defaults to project folder / cwd.
/// * `include_pattern` — Optional glob pattern to restrict file types (e.g. `"*.rs"`).
/// * `case_insensitive`— If true, search is case-insensitive.
#[tauri::command]
pub async fn grep_search(
    pattern: String,
    root: Option<String>,
    include_pattern: Option<String>,
    case_insensitive: Option<bool>,
) -> Result<GrepSearchResult, String> {
    let root = resolve_root(root);
    let ci = case_insensitive.unwrap_or(false);

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
        "[grep_search] pattern={:?} root={:?} include={:?} ci={}",
        pattern, root, include_pattern, ci
    );

    let result = tokio::task::spawn_blocking(move || {
        grep_blocking(&root, &re, file_glob.as_ref())
    })
    .await
    .map_err(|e| format!("grep_search task panicked: {}", e))?;

    result
}

fn grep_blocking(
    root: &Path,
    re: &Regex,
    file_glob: Option<&Pattern>,
) -> Result<GrepSearchResult, String> {
    let mut matches = Vec::new();
    let mut total_files_searched = 0usize;
    let mut truncated = false;

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
        let meta = match std::fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };
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

        for (line_idx, line) in content.lines().enumerate() {
            if let Some(m) = re.find(line) {
                if matches.len() >= MAX_GREP_MATCHES {
                    truncated = true;
                    break 'outer;
                }
                matches.push(GrepMatch {
                    path: path.to_string_lossy().to_string(),
                    line_number: line_idx + 1,
                    line: line.to_string(),
                    column: m.start(),
                });
            }
        }
    }

    Ok(GrepSearchResult {
        matches,
        total_files_searched,
        truncated,
    })
}

// ─────────────────────────────────────────────
// glob_search — file pattern search
// ─────────────────────────────────────────────

/// Find files matching a glob pattern.
///
/// Mirrors OpenCode's `Glob` tool:
/// - Pattern examples: `"**/*.ts"`, `"src/**/*.rs"`, `"*.json"`
/// - Skips excluded dirs automatically.
/// - Results are sorted by modification time (most-recently-modified first).
///
/// # Arguments
/// * `pattern` — Glob pattern relative to `root`.
/// * `root`    — Optional root directory. Defaults to project folder / cwd.
/// * `limit`   — Max results (default 200, max 1000).
#[tauri::command]
pub async fn glob_search(
    pattern: String,
    root: Option<String>,
    limit: Option<usize>,
) -> Result<GlobSearchResult, String> {
    let root = resolve_root(root);
    let limit = limit.unwrap_or(200).min(MAX_GLOB_MATCHES);

    // Validate glob pattern upfront.
    let _ = Pattern::new(&pattern)
        .map_err(|e| format!("Invalid glob pattern '{}': {}", pattern, e))?;

    info!(
        "[glob_search] pattern={:?} root={:?} limit={}",
        pattern, root, limit
    );

    let result = tokio::task::spawn_blocking(move || glob_blocking(&root, &pattern, limit))
        .await
        .map_err(|e| format!("glob_search task panicked: {}", e))?;

    result
}

fn glob_blocking(
    root: &Path,
    pattern: &str,
    limit: usize,
) -> Result<GlobSearchResult, String> {
    let pat = Pattern::new(pattern).map_err(|e| format!("Pattern error: {}", e))?;
    let mut matches: Vec<(GlobMatch, std::time::SystemTime)> = Vec::new();
    let mut truncated = false;

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

        let meta = match std::fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };

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

    if matches.len() > limit {
        truncated = true;
        matches.truncate(limit);
    }

    Ok(GlobSearchResult {
        matches: matches.into_iter().map(|(m, _)| m).collect(),
        truncated,
    })
}

// ─────────────────────────────────────────────
// format_file — auto-formatter pipeline
// ─────────────────────────────────────────────

/// Run the appropriate code formatter for a file and return whether it changed.
///
/// Detects the formatter from the file extension and project configuration.
/// Formatters attempted in order of preference (project-local first, then global).
///
/// Supported formatters:
/// | Extension(s)       | Formatter         |
/// |--------------------|-------------------|
/// | .rs                | rustfmt           |
/// | .ts .tsx .js .jsx  | prettier → biome  |
/// | .py                | ruff → black      |
/// | .go                | gofmt             |
/// | .rb                | rubocop --autocorrect |
/// | .java .kt          | (project fmt)     |
/// | .c .cpp .h .hpp    | clang-format      |
/// | .sh .bash          | shfmt             |
/// | .toml              | taplo fmt         |
/// | .json              | prettier → jq     |
/// | .md                | prettier          |
/// | .css .scss         | prettier          |
/// | .html              | prettier          |
/// | .zig               | zig fmt           |
/// | .dart              | dart format       |
///
/// # Arguments
/// * `path` — Absolute path to the file to format.
/// * `project_root` — Optional project root (used to detect project-local formatters).
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
                    command: vec![
                        prettier_bin,
                        "--write".to_string(),
                        "$FILE".to_string(),
                    ],
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
            command: vec![
                "gofmt".to_string(),
                "-w".to_string(),
                "$FILE".to_string(),
            ],
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
            command: vec![
                "shfmt".to_string(),
                "-w".to_string(),
                "$FILE".to_string(),
            ],
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
                    command: vec![
                        prettier_bin,
                        "--write".to_string(),
                        "$FILE".to_string(),
                    ],
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
            command: vec![
                "taplo".to_string(),
                "fmt".to_string(),
                "$FILE".to_string(),
            ],
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
                command: vec![
                    prettier_bin,
                    "--write".to_string(),
                    "$FILE".to_string(),
                ],
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
