use super::*;

pub(super) const FILE_LIST_TIMEOUT_MS: u64 = 30_000; // Increased from 10s: large dirs and network filesystems
pub(super) const FILE_LIST_MAX_LIMIT: usize = 2_000;
pub(super) const FILE_LIST_DEFAULT_LIMIT: usize = 500;
pub(super) const FILE_LIST_MAX_OFFSET: usize = 100_000;
pub(super) const FILE_READ_MAX_CHARS: usize = 200_000;
pub(super) const FILE_READ_MAX_BYTES: u64 = 50 * 1024 * 1024;
pub(super) const FILE_WRITE_MAX_BYTES: usize = 10 * 1024 * 1024;
pub(super) const FILE_LIST_DEFAULT_EXCLUDES: &[&str] =
    &[".git", "node_modules", "dist", "build", ".next", "target"];

impl ToolExecutor {
    pub(super) fn parse_string_array_param(args: &HashMap<String, Value>, key: &str) -> Option<Vec<String>> {
        args.get(key).and_then(|v| {
            v.as_array().map(|arr| {
                arr.iter()
                    .filter_map(|item| item.as_str().map(|s| s.to_string()))
                    .collect()
            })
        })
    }

    pub(super) fn should_exclude_file_list_entry(entry_name: &str, excludes: &[String]) -> bool {
        excludes.iter().any(|pat| entry_name == pat)
    }

    pub(crate) async fn execute_file_read_tool(&self, args: &HashMap<String, Value>) -> Result<ToolResult> {
        let raw_path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?
            .to_string();
        let path = self.resolve_path(&raw_path);
        let session_id = args
            .get("session_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let validated_path = match self.canonicalize_validated_path(&path).await {
            Ok(validated_path) => validated_path,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": e.to_string(), "success": false }),
                    error: Some(e.to_string()),
                    metadata: HashMap::from([("path".to_string(), json!(&path))]),
                });
            }
        };
        let validated_path_string = validated_path.to_string_lossy().to_string();

        let file_size = match fs::metadata(&validated_path).await {
            Ok(metadata) => metadata.len(),
            Err(_) => 0,
        };
        if file_size > FILE_READ_MAX_BYTES {
            let error = format!(
                "File too large to read: {} bytes (max {} bytes).",
                file_size, FILE_READ_MAX_BYTES
            );
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": error.clone(), "success": false }),
                error: Some(error),
                metadata: HashMap::from([("path".to_string(), json!(&validated_path_string))]),
            });
        }

        match fs::read_to_string(&validated_path).await {
            Ok(content) => {
                let content = if content.len() > FILE_READ_MAX_CHARS {
                    format!(
                        "{}\n\n... [truncated to first {} chars out of {}]",
                        &content[..FILE_READ_MAX_CHARS],
                        FILE_READ_MAX_CHARS,
                        content.len()
                    )
                } else {
                    content
                };

                if let Some(app_handle) = &self.app_handle {
                    let file_op = create_file_read_event(
                        &validated_path_string,
                        &content,
                        true,
                        None,
                        session_id.clone(),
                    );
                    emit_file_operation(app_handle, file_op);
                }

                Ok(ToolResult {
                    success: true,
                    data: json!({ "content": content, "path": &validated_path_string }),
                    error: None,
                    metadata: HashMap::from([("path".to_string(), json!(&validated_path_string))]),
                })
            }
            Err(e) if e.kind() == std::io::ErrorKind::InvalidData => {
                let is_pdf = validated_path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"));

                if is_pdf {
                    let path_clone = validated_path.clone();
                    let pdf_extract_result = tokio::task::spawn_blocking(move || {
                        pdf_extract::extract_text(Path::new(&path_clone))
                    })
                    .await
                    .map_err(|join_err| join_err.to_string())
                    .and_then(|result| result.map_err(|extract_err| extract_err.to_string()));

                    match pdf_extract_result {
                        Ok(extracted_text) => {
                            let content = if extracted_text.len() > FILE_READ_MAX_CHARS {
                                format!(
                                    "{}\n\n... [truncated to first {} chars out of {}]",
                                    &extracted_text[..FILE_READ_MAX_CHARS],
                                    FILE_READ_MAX_CHARS,
                                    extracted_text.len()
                                )
                            } else {
                                extracted_text
                            };

                            if let Some(app_handle) = &self.app_handle {
                                let file_op = create_file_read_event(
                                    &validated_path_string,
                                    &content,
                                    true,
                                    None,
                                    session_id.clone(),
                                );
                                emit_file_operation(app_handle, file_op);
                            }

                            Ok(ToolResult {
                                success: true,
                                data: json!({ "content": content, "path": &validated_path_string }),
                                error: None,
                                metadata: HashMap::from([
                                    ("path".to_string(), json!(&validated_path_string)),
                                    ("source".to_string(), json!("pdf_extract")),
                                ]),
                            })
                        }
                        Err(pdf_error) => {
                            let error = format!(
                                "Failed to read PDF '{}': {}. Try document_extract_text for structured extraction.",
                                validated_path_string, pdf_error
                            );
                            if let Some(app_handle) = &self.app_handle {
                                let file_op = create_file_read_event(
                                    &validated_path_string,
                                    "",
                                    false,
                                    Some(error.clone()),
                                    session_id.clone(),
                                );
                                emit_file_operation(app_handle, file_op);
                            }

                            Ok(ToolResult {
                                success: false,
                                data: json!({ "error": error.clone(), "success": false }),
                                error: Some(error),
                                metadata: HashMap::from([(
                                    "path".to_string(),
                                    json!(&validated_path_string),
                                )]),
                            })
                        }
                    }
                } else {
                    let error = format!(
                        "Failed to read file '{}': file is binary or not UTF-8 text. Use file_read_binary for binary files.",
                        validated_path_string
                    );
                    if let Some(app_handle) = &self.app_handle {
                        let file_op = create_file_read_event(
                            &validated_path_string,
                            "",
                            false,
                            Some(error.clone()),
                            session_id.clone(),
                        );
                        emit_file_operation(app_handle, file_op);
                    }

                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": error.clone(), "success": false }),
                        error: Some(error),
                        metadata: HashMap::from([(
                            "path".to_string(),
                            json!(&validated_path_string),
                        )]),
                    })
                }
            }
            Err(e) => {
                if let Some(app_handle) = &self.app_handle {
                    let file_op = create_file_read_event(
                        &validated_path_string,
                        "",
                        false,
                        Some(e.to_string()),
                        session_id.clone(),
                    );
                    emit_file_operation(app_handle, file_op);
                }

                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to read file: {}", e), "success": false }),
                    error: Some(format!("Failed to read file: {}", e)),
                    metadata: HashMap::from([("path".to_string(), json!(&validated_path_string))]),
                })
            }
        }
    }

    pub(crate) async fn execute_file_write_tool(&self, args: &HashMap<String, Value>) -> Result<ToolResult> {
        let raw_path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?
            .to_string();
        let path = self.resolve_path(&raw_path);
        let content = args
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing content parameter"))?
            .to_string();
        let session_id = args
            .get("session_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        if content.len() > FILE_WRITE_MAX_BYTES {
            let error = format!(
                "File content too large: {} bytes (max {} bytes).",
                content.len(),
                FILE_WRITE_MAX_BYTES
            );
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": error.clone(), "success": false }),
                error: Some(error),
                metadata: HashMap::from([("path".to_string(), json!(&path))]),
            });
        }

        let validated_path = match self.canonicalize_validated_path(&path).await {
            Ok(validated_path) => validated_path,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": e.to_string(), "success": false }),
                    error: Some(e.to_string()),
                    metadata: HashMap::from([("path".to_string(), json!(&path))]),
                });
            }
        };
        let validated_path_string = validated_path.to_string_lossy().to_string();

        let old_content = fs::read_to_string(&validated_path).await.ok();
        if let Some(parent) = validated_path.parent() {
            let _ = fs::create_dir_all(parent).await;
        }

        let write_result = fs::write(&validated_path, content.as_bytes()).await;

        if let Some(app_handle) = &self.app_handle {
            let file_op = create_file_write_event(
                &validated_path_string,
                old_content.as_deref(),
                &content,
                write_result.is_ok(),
                write_result.as_ref().err().map(|e| e.to_string()),
                session_id.clone(),
            );
            emit_file_operation(app_handle, file_op);
        }

        match write_result {
            Ok(_) => {
                if let Some(app_handle) = &self.app_handle {
                    if let Some(undo_state) = app_handle.try_state::<UndoState>() {
                        let task_id = session_id
                            .clone()
                            .unwrap_or_else(|| Uuid::new_v4().to_string());
                        let path_buf = std::path::PathBuf::from(&validated_path);
                        let _ = undo_state
                            .change_tracker
                            .record_tool_executed_with_path(
                                "file_write".to_string(),
                                path_buf,
                                old_content.clone(),
                                Some(content.clone()),
                                task_id,
                                true,
                                Some("Restore previous file contents".to_string()),
                            )
                            .await;
                    }
                }

                // Auto-format after write (best-effort, don't fail the write)
                if let Some(ext) = Path::new(&validated_path_string)
                    .extension()
                    .and_then(|e| e.to_str())
                {
                    let _ = try_auto_format(&validated_path_string, ext).await;
                }

                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "path": &validated_path_string }),
                    error: None,
                    metadata: HashMap::from([
                        ("path".to_string(), json!(&validated_path_string)),
                        ("content_length".to_string(), json!(content.len())),
                    ]),
                })
            }
            Err(e) => Ok(ToolResult {
                success: false,
                data: json!({ "error": format!("Failed to write file: {}", e), "success": false }),
                error: Some(format!("Failed to write file: {}", e)),
                metadata: HashMap::from([("path".to_string(), json!(&validated_path_string))]),
            }),
        }
    }

    pub(crate) async fn execute_file_delete_tool(&self, args: &HashMap<String, Value>) -> Result<ToolResult> {
        let raw_path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?
            .to_string();
        let path = self.resolve_path(&raw_path);
        let session_id = args
            .get("session_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let validated_path = match self.canonicalize_validated_path(&path).await {
            Ok(validated_path) => validated_path,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": e.to_string(), "success": false }),
                    error: Some(e.to_string()),
                    metadata: HashMap::from([("path".to_string(), json!(&path))]),
                });
            }
        };
        let validated_path_string = validated_path.to_string_lossy().to_string();

        let file_content_before = fs::read_to_string(&validated_path).await.ok();

        let size_bytes = fs::metadata(&validated_path)
            .await
            .ok()
            .map(|meta| meta.len() as usize);
        let delete_result = fs::remove_file(&validated_path).await;

        if let Some(app_handle) = &self.app_handle {
            let file_op = create_file_delete_event(
                &validated_path_string,
                size_bytes,
                delete_result.is_ok(),
                delete_result.as_ref().err().map(|e| e.to_string()),
                session_id.clone(),
            );
            emit_file_operation(app_handle, file_op);
        }

        match delete_result {
            Ok(_) => {
                if let Some(app_handle) = &self.app_handle {
                    if let Some(undo_state) = app_handle.try_state::<UndoState>() {
                        let task_id = session_id
                            .clone()
                            .unwrap_or_else(|| Uuid::new_v4().to_string());
                        let path_buf = std::path::PathBuf::from(&validated_path);
                        let _ = undo_state
                            .change_tracker
                            .record_tool_executed_with_path(
                                "file_delete".to_string(),
                                path_buf,
                                file_content_before,
                                None,
                                task_id,
                                true,
                                Some("Restore deleted file".to_string()),
                            )
                            .await;
                    }
                }

                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "path": &validated_path_string }),
                    error: None,
                    metadata: HashMap::from([("path".to_string(), json!(&validated_path_string))]),
                })
            }
            Err(e) => Ok(ToolResult {
                success: false,
                data: json!({ "error": format!("Failed to delete file: {}", e), "success": false }),
                error: Some(format!("Failed to delete file: {}", e)),
                metadata: HashMap::from([("path".to_string(), json!(&validated_path_string))]),
            }),
        }
    }

    pub(crate) async fn execute_file_list_tool(&self, args: &HashMap<String, Value>) -> Result<ToolResult> {
        let requested_path = args
            .get("path")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .or_else(|| self.project_folder.clone())
            .or_else(|| {
                std::env::current_dir()
                    .ok()
                    .map(|cwd| cwd.to_string_lossy().to_string())
            })
            .unwrap_or_else(|| ".".to_string());
        let path = self.resolve_path(&requested_path);
        let limit = args
            .get("limit")
            .and_then(|v| v.as_u64())
            .map(|v| v as usize)
            .unwrap_or(FILE_LIST_DEFAULT_LIMIT)
            .min(FILE_LIST_MAX_LIMIT);
        let offset = args
            .get("offset")
            .and_then(|v| v.as_u64())
            .map(|v| v as usize)
            .unwrap_or(0)
            .min(FILE_LIST_MAX_OFFSET);
        let timeout_ms = args
            .get("timeout_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(FILE_LIST_TIMEOUT_MS)
            .min(300_000);
        let mut excludes = Self::parse_string_array_param(args, "exclude").unwrap_or_else(|| {
            FILE_LIST_DEFAULT_EXCLUDES
                .iter()
                .map(|s| s.to_string())
                .collect()
        });
        excludes.sort();
        excludes.dedup();

        if let Err(e) = self.validate_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([
                    ("path".to_string(), json!(&path)),
                    ("requested_path".to_string(), json!(&requested_path)),
                ]),
            });
        }

        tracing::info!(
            "[ToolExecutor] file_list start path='{}' offset={} limit={} timeout_ms={} excludes={:?}",
            path,
            offset,
            limit,
            timeout_ms,
            excludes
        );

        let started = Instant::now();
        let list_result = timeout(TokioDuration::from_millis(timeout_ms), async {
            let mut entries = fs::read_dir(&path).await?;
            let mut matched = 0usize;
            let mut items = Vec::new();

            while let Some(entry) = entries.next_entry().await? {
                let name = entry.file_name().to_string_lossy().to_string();
                if Self::should_exclude_file_list_entry(&name, &excludes) {
                    continue;
                }

                matched += 1;
                if matched <= offset {
                    continue;
                }
                if items.len() > limit {
                    break;
                }

                let file_type = entry.file_type().await.ok();
                let type_str = match file_type {
                    Some(ft) if ft.is_dir() => "directory",
                    Some(ft) if ft.is_symlink() => "symlink",
                    _ => "file",
                };
                let metadata = entry.metadata().await.ok();
                let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

                items.push(json!({
                    "name": name,
                    "type": type_str,
                    "path": entry.path().to_string_lossy(),
                    "size": size
                }));
            }

            items.sort_by(|a, b| {
                let name_a = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let name_b = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                name_a.cmp(name_b)
            });

            let has_more = items.len() > limit;
            if has_more {
                items.truncate(limit);
            }
            let returned = items.len();
            let next_offset = if has_more {
                Some(offset + returned)
            } else {
                None
            };

            Ok::<Value, anyhow::Error>(json!({
                "entries": items,
                "count": offset + returned,
                "returned": returned,
                "offset": offset,
                "limit": limit,
                "has_more": has_more,
                "next_offset": next_offset,
                "path": &path,
                "excluded": excludes,
                "max_depth": 1
            }))
        })
        .await;

        match list_result {
            Ok(Ok(data)) => {
                tracing::info!(
                    "[ToolExecutor] file_list completed path='{}' elapsed_ms={} returned={} has_more={}",
                    path,
                    started.elapsed().as_millis(),
                    data.get("returned").and_then(|v| v.as_u64()).unwrap_or(0),
                    data.get("has_more").and_then(|v| v.as_bool()).unwrap_or(false)
                );
                Ok(ToolResult {
                    success: true,
                    data,
                    error: None,
                    metadata: HashMap::from([("path".to_string(), json!(&path))]),
                })
            }
            Ok(Err(e)) => {
                tracing::error!(
                    "[ToolExecutor] file_list failed path='{}' elapsed_ms={} error={}",
                    path,
                    started.elapsed().as_millis(),
                    e
                );
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to list directory: {}", e), "success": false }),
                    error: Some(format!("Failed to list directory: {}", e)),
                    metadata: HashMap::from([
                        ("path".to_string(), json!(&path)),
                        ("requested_path".to_string(), json!(&requested_path)),
                    ]),
                })
            }
            Err(_) => {
                let msg = format!(
                    "file_list timed out after {}ms. Try a narrower path, increase 'offset', or lower 'limit'.",
                    timeout_ms
                );
                tracing::error!(
                    "[ToolExecutor] file_list timeout path='{}' elapsed_ms={} timeout_ms={}",
                    path,
                    started.elapsed().as_millis(),
                    timeout_ms
                );
                Ok(ToolResult {
                    success: false,
                    data: json!({
                        "path": &path,
                        "requested_path": &requested_path,
                        "offset": offset,
                        "limit": limit,
                        "timeout_ms": timeout_ms
                    }),
                    error: Some(msg),
                    metadata: HashMap::from([
                        ("path".to_string(), json!(&path)),
                        ("requested_path".to_string(), json!(&requested_path)),
                    ]),
                })
            }
        }
    }
}

/// Best-effort auto-format: run the appropriate formatter for a file extension.
///
/// This is intentionally fire-and-forget. If the formatter is not installed or
/// fails for any reason, we silently skip — the file write has already succeeded.
/// We delegate to the existing `format_file` Tauri command module which handles
/// formatter detection, project-local binary resolution, and fallback chains.
async fn try_auto_format(path: &str, ext: &str) -> Result<()> {
    use crate::sys::commands::code_search::format_file;

    // Only attempt formatting for known source file extensions to avoid
    // running formatters on binary, config, or data files unnecessarily.
    let should_format = matches!(
        ext,
        "rs" | "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "mjs"
            | "cjs"
            | "py"
            | "go"
            | "rb"
            | "c"
            | "cpp"
            | "cc"
            | "h"
            | "hpp"
            | "java"
            | "kt"
            | "kts"
            | "json"
            | "jsonc"
            | "toml"
            | "md"
            | "css"
            | "scss"
            | "html"
            | "vue"
            | "svelte"
            | "sh"
            | "bash"
            | "zig"
            | "dart"
            | "ex"
            | "exs"
            | "gleam"
            | "tf"
    );

    if !should_format {
        return Ok(());
    }

    // Detect project root from the file path (walk up to find common project markers)
    let project_root = detect_project_root(path);

    match format_file(path.to_string(), project_root).await {
        Ok(result) => {
            if result.formatted && result.changed {
                tracing::debug!(
                    "[auto-format] Formatted {} with {}",
                    path,
                    result.formatter
                );
            }
        }
        Err(e) => {
            tracing::debug!("[auto-format] Skipped {}: {}", path, e);
        }
    }

    Ok(())
}

/// Walk up from a file path to find a project root directory.
///
/// Looks for common project markers: `Cargo.toml`, `package.json`, `.git`, `go.mod`, etc.
/// Returns `None` if no marker is found within 10 parent levels.
fn detect_project_root(file_path: &str) -> Option<String> {
    let markers = [
        "Cargo.toml",
        "package.json",
        ".git",
        "go.mod",
        "pyproject.toml",
        "setup.py",
        "Gemfile",
        "pom.xml",
        "build.gradle",
        "CMakeLists.txt",
        "pubspec.yaml",
        "mix.exs",
    ];

    let path = std::path::Path::new(file_path);
    let mut current = path.parent();
    let mut depth = 0;

    while let Some(dir) = current {
        if depth > 10 {
            break;
        }
        for marker in &markers {
            if dir.join(marker).exists() {
                return Some(dir.to_string_lossy().to_string());
            }
        }
        current = dir.parent();
        depth += 1;
    }

    None
}
