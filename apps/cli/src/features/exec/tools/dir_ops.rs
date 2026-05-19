use std::collections::HashMap;

use anyhow::Result;
use tokio::process::Command;

use super::common::{
    format_size, print_tool_status, truncate_output_with_save, validate_file_path,
    COMMAND_TIMEOUT, MAX_OUTPUT_BYTES,
};
use super::ToolResult;

pub(super) async fn execute_search_files(args: &HashMap<String, String>) -> Result<ToolResult> {
    let pattern = match args.get("pattern") {
        Some(p) => p,
        None => {
            return Ok(ToolResult {
                tool_name: "search_files".to_string(),
                success: false,
                output: "Missing required argument: pattern".to_string(),
            });
        }
    };

    let path = args.get("path").map(|s| s.as_str()).unwrap_or(".");

    let validated_path = match validate_file_path(path) {
        Ok(p) => p,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: "search_files".to_string(),
                success: false,
                output: format!("Refusing to search outside project: {}", e),
            });
        }
    };

    print_tool_status("search_files", &format!("Search({}, {})", pattern, path));

    let result = tokio::time::timeout(
        COMMAND_TIMEOUT,
        Command::new("grep")
            .arg("-rn")
            .arg("--include=*")
            .arg("-m")
            .arg("200")
            .arg("--")
            .arg(pattern)
            .arg(&validated_path)
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();

            if stdout.is_empty() && output.status.code() == Some(1) {
                return Ok(ToolResult {
                    tool_name: "search_files".to_string(),
                    success: true,
                    output: format!("No matches found for pattern: {}", pattern),
                });
            }

            let mut result_text = stdout;
            if !stderr.is_empty() {
                result_text.push_str("\n[stderr]\n");
                result_text.push_str(&stderr);
            }

            let result_text = truncate_output_with_save("search_files", result_text);

            Ok(ToolResult {
                tool_name: "search_files".to_string(),
                success: true,
                output: result_text,
            })
        }
        Ok(Err(e)) => Ok(ToolResult {
            tool_name: "search_files".to_string(),
            success: false,
            output: format!("Failed to execute search: {}", e),
        }),
        Err(_) => Ok(ToolResult {
            tool_name: "search_files".to_string(),
            success: false,
            output: format!(
                "Search timed out after {} seconds",
                COMMAND_TIMEOUT.as_secs()
            ),
        }),
    }
}

pub(super) async fn execute_list_directory(args: &HashMap<String, String>) -> Result<ToolResult> {
    let path = args.get("path").map(|s| s.as_str()).unwrap_or(".");

    print_tool_status("list_directory", &format!("List({})", path));

    let dir_path = match validate_file_path(path) {
        Ok(p) => p,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: "list_directory".to_string(),
                success: false,
                output: format!("Refusing to list outside project: {}", e),
            });
        }
    };
    if !dir_path.exists() {
        return Ok(ToolResult {
            tool_name: "list_directory".to_string(),
            success: false,
            output: format!("Directory not found: {}", path),
        });
    }

    if !dir_path.is_dir() {
        return Ok(ToolResult {
            tool_name: "list_directory".to_string(),
            success: false,
            output: format!("Not a directory: {}", path),
        });
    }

    let mut entries = Vec::new();
    let mut read_dir = match tokio::fs::read_dir(&dir_path).await {
        Ok(rd) => rd,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: "list_directory".to_string(),
                success: false,
                output: format!("Failed to read directory: {}", e),
            });
        }
    };

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        let name = entry.file_name().to_string_lossy().to_string();
        let metadata = entry.metadata().await;

        let (file_type, size) = match metadata {
            Ok(meta) => {
                let ft = if meta.is_dir() {
                    "dir"
                } else if meta.is_symlink() {
                    "link"
                } else {
                    "file"
                };
                (ft, meta.len())
            }
            Err(_) => ("???", 0),
        };

        entries.push((name, file_type, size));
    }

    entries.sort_by(|a, b| {
        let dir_order = |ft: &str| -> u8 {
            if ft == "dir" {
                0
            } else {
                1
            }
        };
        dir_order(a.1)
            .cmp(&dir_order(b.1))
            .then_with(|| a.0.to_lowercase().cmp(&b.0.to_lowercase()))
    });

    let mut output = String::new();
    for (name, file_type, size) in &entries {
        let display_name = if *file_type == "dir" {
            format!("{}/", name)
        } else {
            name.clone()
        };
        output.push_str(&format!(
            "{:<6} {:>10}  {}\n",
            file_type,
            format_size(*size),
            display_name
        ));
    }

    if entries.is_empty() {
        output = "(empty directory)".to_string();
    } else {
        output.push_str(&format!("\n{} entries total", entries.len()));
    }

    Ok(ToolResult {
        tool_name: "list_directory".to_string(),
        success: true,
        output,
    })
}

pub(super) async fn execute_grep_files(
    args: &HashMap<String, String>,
    quiet: bool,
) -> Result<ToolResult> {
    let pattern = match args.get("pattern") {
        Some(p) => p,
        None => {
            return Ok(ToolResult {
                tool_name: "grep_files".into(),
                success: false,
                output: "Missing: pattern".into(),
            });
        }
    };
    let path = args.get("path").map(|s| s.as_str()).unwrap_or(".");

    let validated_path = match validate_file_path(path) {
        Ok(p) => p,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: "grep_files".into(),
                success: false,
                output: format!("Refusing to grep outside project: {}", e),
            });
        }
    };

    let include = args.get("include");
    if !quiet {
        print_tool_status("grep_files", &format!("/{}/{}", pattern, path));
    }
    let mut cmd = Command::new("rg");
    cmd.arg("--line-number")
        .arg("--no-heading")
        .arg("--color=never")
        .arg("--max-count=100");
    if let Some(g) = include {
        cmd.arg("--glob").arg(g);
    }
    cmd.arg("--").arg(pattern).arg(&validated_path);
    match tokio::time::timeout(COMMAND_TIMEOUT, cmd.output()).await {
        Ok(Ok(o)) => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            let output = if stdout.is_empty() {
                format!("No matches for: {}", pattern)
            } else if stdout.len() > MAX_OUTPUT_BYTES {
                let mut end = MAX_OUTPUT_BYTES.min(stdout.len());
                while !stdout.is_char_boundary(end) {
                    end -= 1;
                }
                format!("{}\n...(truncated)", &stdout[..end])
            } else {
                stdout
            };
            Ok(ToolResult {
                tool_name: "grep_files".into(),
                success: true,
                output,
            })
        }
        Ok(Err(_)) => {
            let mut fb = Command::new("grep");
            fb.arg("-rn")
                .arg("--max-count=100")
                .arg("--")
                .arg(pattern)
                .arg(&validated_path);
            match fb.output().await {
                Ok(o) => Ok(ToolResult {
                    tool_name: "grep_files".into(),
                    success: true,
                    output: String::from_utf8_lossy(&o.stdout).to_string(),
                }),
                Err(e) => Ok(ToolResult {
                    tool_name: "grep_files".into(),
                    success: false,
                    output: format!("{}", e),
                }),
            }
        }
        Err(_) => Ok(ToolResult {
            tool_name: "grep_files".into(),
            success: false,
            output: format!(
                "Search timed out after {} seconds",
                COMMAND_TIMEOUT.as_secs()
            ),
        }),
    }
}

pub(super) async fn execute_glob(args: &HashMap<String, String>) -> Result<ToolResult> {
    let pattern = match args.get("pattern") {
        Some(p) => p,
        None => {
            return Ok(ToolResult {
                tool_name: "glob".into(),
                success: false,
                output: "Missing required argument: pattern".into(),
            });
        }
    };

    if std::path::Path::new(pattern).is_absolute() {
        return Ok(ToolResult {
            tool_name: "glob".into(),
            success: false,
            output: format!(
                "Refusing absolute glob pattern: {}. Use relative patterns within the project.",
                pattern
            ),
        });
    }

    let base = args.get("path").map(|s| s.as_str()).unwrap_or(".");
    let base_path = match validate_file_path(base) {
        Ok(p) => p,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: "glob".into(),
                success: false,
                output: format!("Refusing to glob outside project: {}", e),
            });
        }
    };

    let full_pattern = format!("{}/{}", base_path.display(), pattern);

    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let cwd_canonical = cwd.canonicalize().unwrap_or(cwd);

    let matches: Vec<String> = glob::glob(&full_pattern)
        .map(|paths| {
            paths
                .filter_map(|p| p.ok())
                .filter(|p| {
                    p.canonicalize()
                        .map(|c| c.starts_with(&cwd_canonical))
                        .unwrap_or(false)
                })
                .map(|p| p.display().to_string())
                .collect()
        })
        .unwrap_or_default();

    if matches.is_empty() {
        Ok(ToolResult {
            tool_name: "glob".into(),
            success: true,
            output: format!("No files matched pattern: {}", pattern),
        })
    } else {
        Ok(ToolResult {
            tool_name: "glob".into(),
            success: true,
            output: matches.join("\n"),
        })
    }
}
