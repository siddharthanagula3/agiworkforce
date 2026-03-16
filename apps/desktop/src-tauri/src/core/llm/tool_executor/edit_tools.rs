use super::*;

/// Maximum number of edits allowed in a single multi_edit call.
const MULTI_EDIT_MAX_EDITS: usize = 50;

/// Maximum file size for edit operations (10 MB).
const EDIT_MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;

impl ToolExecutor {
    /// Execute the `multi_edit` tool: atomic batch find-and-replace across one or more files.
    ///
    /// Each edit specifies `{path, old_text, new_text}`. All edits are validated upfront,
    /// file contents are snapshotted, and then edits are applied sequentially. If any edit
    /// fails (e.g. `old_text` not found), all previously applied edits are rolled back to
    /// their snapshotted state.
    pub(crate) async fn execute_multi_edit_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let edits = match args.get("edits").and_then(|v| v.as_array()) {
            Some(arr) => arr,
            None => {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": "Missing 'edits' array parameter", "success": false }),
                    error: Some("Missing 'edits' array parameter".to_string()),
                    metadata: HashMap::new(),
                });
            }
        };

        if edits.is_empty() {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": "edits array is empty", "success": false }),
                error: Some("edits array is empty".to_string()),
                metadata: HashMap::new(),
            });
        }

        if edits.len() > MULTI_EDIT_MAX_EDITS {
            let msg = format!(
                "Too many edits: {} (max {})",
                edits.len(),
                MULTI_EDIT_MAX_EDITS
            );
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": &msg, "success": false }),
                error: Some(msg),
                metadata: HashMap::new(),
            });
        }

        // Phase 1: Parse and validate all edit entries
        let mut validated: Vec<(String, String, String)> = Vec::with_capacity(edits.len());
        for (i, edit) in edits.iter().enumerate() {
            let raw_path = match edit.get("path").and_then(|v| v.as_str()) {
                Some(p) => p,
                None => {
                    let msg = format!("Edit #{} missing 'path'", i);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": &msg, "success": false }),
                        error: Some(msg),
                        metadata: HashMap::new(),
                    });
                }
            };
            let old_text = match edit.get("old_text").and_then(|v| v.as_str()) {
                Some(t) => t,
                None => {
                    let msg = format!("Edit #{} missing 'old_text'", i);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": &msg, "success": false }),
                        error: Some(msg),
                        metadata: HashMap::new(),
                    });
                }
            };
            let new_text = match edit.get("new_text").and_then(|v| v.as_str()) {
                Some(t) => t,
                None => {
                    let msg = format!("Edit #{} missing 'new_text'", i);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": &msg, "success": false }),
                        error: Some(msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            let resolved = self.resolve_path(raw_path);

            // Validate path access
            match self.canonicalize_validated_path(&resolved).await {
                Ok(canonical) => {
                    // Check file size
                    match fs::metadata(&canonical).await {
                        Ok(meta) if meta.len() > EDIT_MAX_FILE_BYTES => {
                            let msg = format!(
                                "Edit #{}: file '{}' too large ({} bytes, max {})",
                                i,
                                resolved,
                                meta.len(),
                                EDIT_MAX_FILE_BYTES
                            );
                            return Ok(ToolResult {
                                success: false,
                                data: json!({ "error": &msg, "success": false }),
                                error: Some(msg),
                                metadata: HashMap::new(),
                            });
                        }
                        Err(e) => {
                            let msg = format!("Edit #{}: cannot stat '{}': {}", i, resolved, e);
                            return Ok(ToolResult {
                                success: false,
                                data: json!({ "error": &msg, "success": false }),
                                error: Some(msg),
                                metadata: HashMap::new(),
                            });
                        }
                        _ => {}
                    }
                    validated.push((
                        canonical.to_string_lossy().to_string(),
                        old_text.to_string(),
                        new_text.to_string(),
                    ));
                }
                Err(e) => {
                    let msg = format!(
                        "Edit #{}: path validation failed for '{}': {}",
                        i, resolved, e
                    );
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": &msg, "success": false }),
                        error: Some(msg),
                        metadata: HashMap::new(),
                    });
                }
            }
        }

        // Phase 2: Snapshot all unique files for rollback
        let mut snapshots: HashMap<String, String> = HashMap::new();
        for (path, _, _) in &validated {
            if snapshots.contains_key(path) {
                continue;
            }
            match fs::read_to_string(path).await {
                Ok(content) => {
                    snapshots.insert(path.clone(), content);
                }
                Err(e) => {
                    let msg = format!("Failed to read '{}' for snapshot: {}", path, e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": &msg, "success": false }),
                        error: Some(msg),
                        metadata: HashMap::new(),
                    });
                }
            }
        }

        // Phase 3: Apply edits atomically
        // Track which files have been written so we know what to roll back.
        let mut written_files: HashMap<String, bool> = HashMap::new();
        let mut applied = 0usize;

        for (i, (path, old_text, new_text)) in validated.iter().enumerate() {
            let content = match fs::read_to_string(path).await {
                Ok(c) => c,
                Err(e) => {
                    // Rollback all previously written files
                    Self::rollback_files(&snapshots, &written_files).await;
                    let msg = format!("Edit #{}: failed to re-read '{}': {}", i, path, e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": &msg, "success": false, "rolled_back": applied }),
                        error: Some(msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            if !content.contains(old_text.as_str()) {
                // Rollback all previously written files
                Self::rollback_files(&snapshots, &written_files).await;
                let preview = if old_text.len() > 60 {
                    let truncate_at = old_text
                        .char_indices()
                        .map(|(i, _)| i)
                        .take_while(|&i| i <= 57)
                        .last()
                        .unwrap_or(0);
                    format!("{}...", &old_text[..truncate_at])
                } else {
                    old_text.clone()
                };
                let msg = format!(
                    "Edit #{}: old_text not found in '{}': '{}'",
                    i, path, preview
                );
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": &msg, "success": false, "rolled_back": applied }),
                    error: Some(msg),
                    metadata: HashMap::new(),
                });
            }

            let updated = content.replacen(old_text.as_str(), new_text.as_str(), 1);
            if let Err(e) = fs::write(path, &updated).await {
                // Rollback all previously written files
                Self::rollback_files(&snapshots, &written_files).await;
                let msg = format!("Edit #{}: failed to write '{}': {}", i, path, e);
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": &msg, "success": false, "rolled_back": applied }),
                    error: Some(msg),
                    metadata: HashMap::new(),
                });
            }

            written_files.insert(path.clone(), true);
            applied += 1;
        }

        // Collect unique paths for metadata
        let affected_files: Vec<String> = snapshots.keys().cloned().collect();

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "applied": applied,
                "files": affected_files,
                "message": format!("Successfully applied {} edit(s) across {} file(s)", applied, affected_files.len())
            }),
            error: None,
            metadata: HashMap::from([("applied".to_string(), json!(applied))]),
        })
    }

    /// Execute the `apply_patch` tool: apply a unified diff patch to a single file.
    ///
    /// Accepts a `path` and a `patch` string in unified diff format (`@@ -a,b +c,d @@`
    /// with context/removal/addition lines). Applies hunks sequentially, backing up the
    /// original file content. Partial application is allowed: if some hunks succeed and
    /// others fail, the successfully-applied hunks are kept and a summary is returned.
    pub(crate) async fn execute_apply_patch_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let patch = match args.get("patch").and_then(|v| v.as_str()) {
            Some(p) => p.to_string(),
            None => {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": "Missing 'patch' parameter", "success": false }),
                    error: Some("Missing 'patch' parameter".to_string()),
                    metadata: HashMap::new(),
                });
            }
        };

        let raw_path = match args.get("path").and_then(|v| v.as_str()) {
            Some(p) => p.to_string(),
            None => {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": "Missing 'path' parameter", "success": false }),
                    error: Some("Missing 'path' parameter".to_string()),
                    metadata: HashMap::new(),
                });
            }
        };

        let resolved = self.resolve_path(&raw_path);
        let validated_path = match self.canonicalize_validated_path(&resolved).await {
            Ok(p) => p,
            Err(e) => {
                let msg = format!("Path validation failed for '{}': {}", resolved, e);
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": &msg, "success": false }),
                    error: Some(msg),
                    metadata: HashMap::from([("path".to_string(), json!(&resolved))]),
                });
            }
        };
        let path_string = validated_path.to_string_lossy().to_string();

        // Read original content (empty string for new files)
        let original = fs::read_to_string(&validated_path)
            .await
            .unwrap_or_default();

        // Parse the unified diff into hunks
        let hunks = match parse_unified_diff(&patch) {
            Ok(h) => h,
            Err(e) => {
                let msg = format!("Failed to parse patch: {}", e);
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": &msg, "success": false }),
                    error: Some(msg),
                    metadata: HashMap::from([("path".to_string(), json!(&path_string))]),
                });
            }
        };

        if hunks.is_empty() {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": "No hunks found in patch", "success": false }),
                error: Some("No hunks found in patch".to_string()),
                metadata: HashMap::from([("path".to_string(), json!(&path_string))]),
            });
        }

        // Apply hunks sequentially
        let mut content = original.clone();
        let mut applied = 0usize;
        let mut failed = 0usize;
        let mut errors: Vec<String> = Vec::new();

        for (i, hunk) in hunks.iter().enumerate() {
            match apply_hunk(&content, hunk) {
                Ok(updated) => {
                    content = updated;
                    applied += 1;
                }
                Err(e) => {
                    failed += 1;
                    errors.push(format!("Hunk #{}: {}", i, e));
                }
            }
        }

        if failed > 0 && applied == 0 {
            let msg = format!(
                "All {} hunk(s) failed to apply: {}",
                failed,
                errors.join("; ")
            );
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": &msg, "success": false, "failed": failed }),
                error: Some(msg),
                metadata: HashMap::from([("path".to_string(), json!(&path_string))]),
            });
        }

        // Write the result
        if let Err(e) = fs::write(&validated_path, &content).await {
            let msg = format!("Failed to write patched file '{}': {}", path_string, e);
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": &msg, "success": false }),
                error: Some(msg),
                metadata: HashMap::from([("path".to_string(), json!(&path_string))]),
            });
        }

        let message = if failed > 0 {
            format!(
                "Partially applied: {}/{} hunks succeeded. Failures: {}",
                applied,
                applied + failed,
                errors.join("; ")
            )
        } else {
            format!("Successfully applied all {} hunk(s)", applied)
        };

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "applied": applied,
                "failed": failed,
                "total_hunks": applied + failed,
                "path": &path_string,
                "message": &message
            }),
            error: None,
            metadata: HashMap::from([
                ("path".to_string(), json!(&path_string)),
                ("applied".to_string(), json!(applied)),
                ("failed".to_string(), json!(failed)),
            ]),
        })
    }

    /// Execute the `edit_exact_replace` tool: find-and-replace with uniqueness validation.
    ///
    /// Parameters:
    /// - `path` (required) — file path to edit
    /// - `old_text` (required) — text to find and replace
    /// - `new_text` (required) — replacement text
    /// - `replace_all` (optional bool, default false) — replace all occurrences
    ///
    /// When `replace_all` is false (default), the `old_text` must appear exactly once in
    /// the file. If multiple occurrences are found, returns an error with occurrence count
    /// and line numbers so the caller can provide more context or opt into replace_all.
    pub(crate) async fn execute_edit_exact_replace_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        // Extract required parameters
        let raw_path = match args.get("path").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": "Missing 'path' parameter", "success": false }),
                    error: Some("Missing 'path' parameter".to_string()),
                    metadata: HashMap::new(),
                });
            }
        };

        let old_text = match args.get("old_text").and_then(|v| v.as_str()) {
            Some(t) => t.to_string(),
            None => {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": "Missing 'old_text' parameter", "success": false }),
                    error: Some("Missing 'old_text' parameter".to_string()),
                    metadata: HashMap::new(),
                });
            }
        };

        let new_text = match args.get("new_text").and_then(|v| v.as_str()) {
            Some(t) => t.to_string(),
            None => {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": "Missing 'new_text' parameter", "success": false }),
                    error: Some("Missing 'new_text' parameter".to_string()),
                    metadata: HashMap::new(),
                });
            }
        };

        let replace_all = args
            .get("replace_all")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        // Resolve and validate path
        let resolved = self.resolve_path(raw_path);
        let validated_path = match self.canonicalize_validated_path(&resolved).await {
            Ok(p) => p,
            Err(e) => {
                let msg = format!("Path validation failed for '{}': {}", resolved, e);
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": &msg, "success": false }),
                    error: Some(msg),
                    metadata: HashMap::new(),
                });
            }
        };
        let path_string = validated_path.to_string_lossy().to_string();

        // Check file size before reading
        match fs::metadata(&validated_path).await {
            Ok(meta) if meta.len() > EDIT_MAX_FILE_BYTES => {
                let msg = format!(
                    "File '{}' too large ({} bytes, max {})",
                    path_string,
                    meta.len(),
                    EDIT_MAX_FILE_BYTES
                );
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": &msg, "success": false }),
                    error: Some(msg),
                    metadata: HashMap::new(),
                });
            }
            Err(e) => {
                let msg = format!("Cannot stat '{}': {}", path_string, e);
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": &msg, "success": false }),
                    error: Some(msg),
                    metadata: HashMap::new(),
                });
            }
            _ => {}
        }

        // Read file content
        let content = match fs::read_to_string(&validated_path).await {
            Ok(c) => c,
            Err(e) => {
                let msg = format!("Failed to read '{}': {}", path_string, e);
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": &msg, "success": false }),
                    error: Some(msg),
                    metadata: HashMap::new(),
                });
            }
        };

        // Count occurrences
        let occurrence_count = content.matches(&old_text).count();

        if occurrence_count == 0 {
            return Ok(ToolResult {
                success: false,
                data: json!({
                    "error": "Text not found in file",
                    "success": false,
                    "path": &path_string
                }),
                error: Some("Text not found in file".to_string()),
                metadata: HashMap::from([("path".to_string(), json!(&path_string))]),
            });
        }

        if occurrence_count > 1 && !replace_all {
            // Find line numbers of each occurrence
            let mut line_numbers: Vec<usize> = Vec::new();
            let mut search_start = 0usize;
            while let Some(pos) = content[search_start..].find(&old_text) {
                let absolute_pos = search_start + pos;
                let line_number = content[..absolute_pos].lines().count() + 1;
                line_numbers.push(line_number);
                search_start = absolute_pos + old_text.len();
            }

            let lines_str = line_numbers
                .iter()
                .map(|n| n.to_string())
                .collect::<Vec<_>>()
                .join(", ");

            let msg = format!(
                "Found {} occurrences of old_text (at lines {}). Use replace_all=true to replace all, or provide more context to make old_text unique.",
                occurrence_count, lines_str
            );

            return Ok(ToolResult {
                success: false,
                data: json!({
                    "error": &msg,
                    "success": false,
                    "path": &path_string,
                    "occurrences": occurrence_count,
                    "line_numbers": line_numbers
                }),
                error: Some(msg),
                metadata: HashMap::from([
                    ("path".to_string(), json!(&path_string)),
                    ("occurrences".to_string(), json!(occurrence_count)),
                ]),
            });
        }

        // Apply replacement
        let before_content = content.clone();
        let after_content = if replace_all {
            content.replace(&old_text, &new_text)
        } else {
            content.replacen(&old_text, &new_text, 1)
        };

        // Write the updated file
        if let Err(e) = fs::write(&validated_path, &after_content).await {
            let msg = format!("Failed to write '{}': {}", path_string, e);
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": &msg, "success": false }),
                error: Some(msg),
                metadata: HashMap::new(),
            });
        }

        let replacements_made = if replace_all { occurrence_count } else { 1 };

        // Record change in undo tracker + create named checkpoint
        if let Some(app_handle) = &self.app_handle {
            if let Some(undo_state) = app_handle.try_state::<UndoState>() {
                let task_id = args
                    .get("session_id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| Uuid::new_v4().to_string());

                undo_state
                    .change_tracker
                    .record_file_modified(
                        validated_path.clone(),
                        before_content.clone(),
                        after_content.clone(),
                        task_id,
                    )
                    .await;

                // Create a named checkpoint for the modified file
                let checkpoint_name = format!("edit_exact_replace: {}", path_string);
                if let Err(e) = undo_state
                    .change_tracker
                    .create_named_checkpoint(checkpoint_name, vec![validated_path.clone()])
                    .await
                {
                    tracing::warn!(
                        "[edit_exact_replace] Failed to create undo checkpoint for '{}': {}",
                        path_string,
                        e
                    );
                }
            }
        }

        // Compute a minimal unified diff
        let diff = compute_unified_diff(&before_content, &after_content, 3);

        let message = format!(
            "Replaced {} occurrence(s) in {}",
            replacements_made, path_string
        );

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "path": &path_string,
                "diff": &diff,
                "replacements_made": replacements_made,
                "message": &message
            }),
            error: None,
            metadata: HashMap::from([
                ("path".to_string(), json!(&path_string)),
                ("replacements_made".to_string(), json!(replacements_made)),
            ]),
        })
    }

    /// Rollback files to their snapshotted state.
    async fn rollback_files(
        snapshots: &HashMap<String, String>,
        written_files: &HashMap<String, bool>,
    ) {
        for path in written_files.keys() {
            if let Some(original_content) = snapshots.get(path) {
                if let Err(e) = fs::write(path, original_content).await {
                    tracing::error!(
                        "[MultiEdit] Rollback failed for '{}': {}. Manual restore may be needed.",
                        path,
                        e
                    );
                }
            }
        }
    }
}

// ── Unified Diff Parser ──────────────────────────────────────────────────────

/// Represents a single hunk from a unified diff.
struct DiffHunk {
    /// Lines expected before the changes (context + removals)
    expected_lines: Vec<String>,
    /// Lines to produce after applying the hunk (context + additions)
    replacement_lines: Vec<String>,
}

/// Parse a unified diff string into a list of `DiffHunk` values.
///
/// Supports the standard unified diff format:
/// - Lines starting with `@@` mark hunk headers
/// - Lines starting with ` ` (space) are context lines
/// - Lines starting with `-` are removal lines
/// - Lines starting with `+` are addition lines
/// - Lines starting with `---` or `+++` (file headers) are skipped
fn parse_unified_diff(patch: &str) -> Result<Vec<DiffHunk>> {
    let mut hunks = Vec::new();
    let mut in_hunk = false;
    let mut expected_lines: Vec<String> = Vec::new();
    let mut replacement_lines: Vec<String> = Vec::new();

    for line in patch.lines() {
        // Skip file header lines
        if line.starts_with("---") || line.starts_with("+++") {
            continue;
        }

        // Detect hunk header
        if line.starts_with("@@") {
            // Flush any previous hunk
            if in_hunk && (!expected_lines.is_empty() || !replacement_lines.is_empty()) {
                hunks.push(DiffHunk {
                    expected_lines: std::mem::take(&mut expected_lines),
                    replacement_lines: std::mem::take(&mut replacement_lines),
                });
            }
            in_hunk = true;
            continue;
        }

        if !in_hunk {
            continue;
        }

        if let Some(ctx) = line.strip_prefix(' ') {
            // Context line: appears in both expected and replacement
            expected_lines.push(ctx.to_string());
            replacement_lines.push(ctx.to_string());
        } else if let Some(removed) = line.strip_prefix('-') {
            // Removal: only in expected
            expected_lines.push(removed.to_string());
        } else if let Some(added) = line.strip_prefix('+') {
            // Addition: only in replacement
            replacement_lines.push(added.to_string());
        } else {
            // Lines without a prefix in a hunk body — treat as context
            // (some tools emit diff lines without a leading space)
            expected_lines.push(line.to_string());
            replacement_lines.push(line.to_string());
        }
    }

    // Flush final hunk
    if in_hunk && (!expected_lines.is_empty() || !replacement_lines.is_empty()) {
        hunks.push(DiffHunk {
            expected_lines: std::mem::take(&mut expected_lines),
            replacement_lines: std::mem::take(&mut replacement_lines),
        });
    }

    Ok(hunks)
}

/// Apply a single diff hunk to the file content.
///
/// Finds the expected block of lines in the content and replaces it with the
/// replacement block. Uses line-by-line matching with a sliding-window search.
fn apply_hunk(content: &str, hunk: &DiffHunk) -> Result<String> {
    if hunk.expected_lines.is_empty() {
        // Pure addition at end of file
        let mut result = content.to_string();
        if !result.is_empty() && !result.ends_with('\n') {
            result.push('\n');
        }
        for line in &hunk.replacement_lines {
            result.push_str(line);
            result.push('\n');
        }
        return Ok(result);
    }

    let content_lines: Vec<&str> = content.lines().collect();
    let expected_count = hunk.expected_lines.len();

    // Sliding window search for the expected block
    if content_lines.len() < expected_count {
        return Err(anyhow!(
            "File has {} lines but hunk expects {} lines",
            content_lines.len(),
            expected_count
        ));
    }

    let search_end = content_lines.len().saturating_sub(expected_count) + 1;
    let mut match_pos: Option<usize> = None;

    for start in 0..search_end {
        let mut matched = true;
        for (j, expected) in hunk.expected_lines.iter().enumerate() {
            let content_line = content_lines[start + j];
            // Trim trailing whitespace for more lenient matching
            if content_line.trim_end() != expected.trim_end() {
                matched = false;
                break;
            }
        }
        if matched {
            match_pos = Some(start);
            break;
        }
    }

    let start = match match_pos {
        Some(pos) => pos,
        None => {
            let preview = if hunk.expected_lines.is_empty() {
                "(empty)".to_string()
            } else {
                let first = &hunk.expected_lines[0];
                if first.len() > 50 {
                    let truncate_at = first
                        .char_indices()
                        .map(|(i, _)| i)
                        .take_while(|&i| i <= 47)
                        .last()
                        .unwrap_or(0);
                    format!("{}...", &first[..truncate_at])
                } else {
                    first.clone()
                }
            };
            return Err(anyhow!(
                "Could not find expected block starting with: {}",
                preview
            ));
        }
    };

    // Build the result: lines before match + replacement + lines after match
    let mut result_lines: Vec<&str> = Vec::new();
    for line in &content_lines[..start] {
        result_lines.push(line);
    }
    // Replacement lines are owned, so we collect separately
    let mut result = String::new();
    for line in result_lines {
        result.push_str(line);
        result.push('\n');
    }
    for line in &hunk.replacement_lines {
        result.push_str(line);
        result.push('\n');
    }
    let after_start = start + expected_count;
    for line in &content_lines[after_start..] {
        result.push_str(line);
        result.push('\n');
    }

    // Preserve original trailing newline behavior
    if !content.ends_with('\n') && result.ends_with('\n') {
        result.pop();
    }

    Ok(result)
}

// ── Unified Diff Generator ─────────────────────────────────────────────────

/// Compute a minimal unified diff between two strings.
///
/// Produces standard unified diff format with `context` lines of surrounding
/// context around each changed region. Consecutive changes within the context
/// window are merged into a single hunk.
fn compute_unified_diff(before: &str, after: &str, context: usize) -> String {
    let before_lines: Vec<&str> = before.lines().collect();
    let after_lines: Vec<&str> = after.lines().collect();

    // Find changed line regions using a simple LCS-free approach:
    // walk both line lists, marking ranges that differ.
    let max_len = before_lines.len().max(after_lines.len());
    let mut changed: Vec<bool> = vec![false; max_len + 1];

    // Mark lines where the two versions differ
    let common_len = before_lines.len().min(after_lines.len());
    for i in 0..common_len {
        if before_lines[i] != after_lines[i] {
            changed[i] = true;
        }
    }
    // Lines that only exist in one version are always changed
    for item in changed.iter_mut().take(max_len).skip(common_len) {
        *item = true;
    }

    // Collect change regions (start, end) in the before-file coordinate space
    let mut regions: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;
    while i < max_len {
        if changed[i] {
            let start = i;
            while i < max_len && changed[i] {
                i += 1;
            }
            regions.push((start, i));
        } else {
            i += 1;
        }
    }

    if regions.is_empty() {
        return String::new();
    }

    // Merge regions that are within `context` lines of each other
    let mut merged: Vec<(usize, usize)> = Vec::new();
    for (start, end) in &regions {
        if let Some(last) = merged.last_mut() {
            if *start <= last.1 + context * 2 {
                last.1 = *end;
                continue;
            }
        }
        merged.push((*start, *end));
    }

    // Generate diff output
    let mut output = String::new();

    for (change_start, change_end) in &merged {
        let ctx_start = change_start.saturating_sub(context);
        let ctx_end_before = (*change_end + context).min(before_lines.len());
        let ctx_end_after = (*change_end + context).min(after_lines.len());

        // Compute after-file offset: the change_start is the same in both
        // since we use a simple positional comparison
        let before_count = ctx_end_before - ctx_start;
        let after_count = ctx_end_after - ctx_start;

        output.push_str(&format!(
            "@@ -{},{} +{},{} @@\n",
            ctx_start + 1,
            before_count,
            ctx_start + 1,
            after_count
        ));

        // Leading context
        for idx in ctx_start..*change_start {
            if idx < before_lines.len() {
                output.push(' ');
                output.push_str(before_lines[idx]);
                output.push('\n');
            }
        }

        // Changed lines
        for idx in *change_start..*change_end {
            if idx < before_lines.len() {
                output.push('-');
                output.push_str(before_lines[idx]);
                output.push('\n');
            }
        }
        for idx in *change_start..*change_end {
            if idx < after_lines.len() {
                output.push('+');
                output.push_str(after_lines[idx]);
                output.push('\n');
            }
        }

        // Trailing context
        let trailing_start = *change_end;
        for idx in trailing_start..ctx_end_before {
            if idx < before_lines.len() {
                output.push(' ');
                output.push_str(before_lines[idx]);
                output.push('\n');
            }
        }
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── parse_unified_diff tests ─────────────────────────────────────────

    #[test]
    fn test_parse_empty_patch() {
        let hunks = parse_unified_diff("").expect("should parse");
        assert!(hunks.is_empty());
    }

    #[test]
    fn test_parse_single_hunk() {
        let patch = "\
--- a/file.rs
+++ b/file.rs
@@ -1,3 +1,3 @@
 line1
-old_line
+new_line
 line3";
        let hunks = parse_unified_diff(patch).expect("should parse");
        assert_eq!(hunks.len(), 1);
        assert_eq!(hunks[0].expected_lines, vec!["line1", "old_line", "line3"]);
        assert_eq!(
            hunks[0].replacement_lines,
            vec!["line1", "new_line", "line3"]
        );
    }

    #[test]
    fn test_parse_multiple_hunks() {
        let patch = "\
@@ -1,2 +1,2 @@
-old1
+new1
@@ -5,2 +5,2 @@
-old2
+new2";
        let hunks = parse_unified_diff(patch).expect("should parse");
        assert_eq!(hunks.len(), 2);
        assert_eq!(hunks[0].expected_lines, vec!["old1"]);
        assert_eq!(hunks[0].replacement_lines, vec!["new1"]);
        assert_eq!(hunks[1].expected_lines, vec!["old2"]);
        assert_eq!(hunks[1].replacement_lines, vec!["new2"]);
    }

    #[test]
    fn test_parse_addition_only_hunk() {
        let patch = "\
@@ -1,0 +1,2 @@
+added1
+added2";
        let hunks = parse_unified_diff(patch).expect("should parse");
        assert_eq!(hunks.len(), 1);
        assert!(hunks[0].expected_lines.is_empty());
        assert_eq!(hunks[0].replacement_lines, vec!["added1", "added2"]);
    }

    #[test]
    fn test_parse_removal_only_hunk() {
        let patch = "\
@@ -1,2 +1,0 @@
-removed1
-removed2";
        let hunks = parse_unified_diff(patch).expect("should parse");
        assert_eq!(hunks.len(), 1);
        assert_eq!(hunks[0].expected_lines, vec!["removed1", "removed2"]);
        assert!(hunks[0].replacement_lines.is_empty());
    }

    // ── apply_hunk tests ─────────────────────────────────────────────────

    #[test]
    fn test_apply_simple_replacement() {
        let content = "line1\nold_line\nline3";
        let hunk = DiffHunk {
            expected_lines: vec!["old_line".to_string()],
            replacement_lines: vec!["new_line".to_string()],
        };
        let result = apply_hunk(content, &hunk).expect("should apply");
        assert_eq!(result, "line1\nnew_line\nline3");
    }

    #[test]
    fn test_apply_with_context() {
        let content = "aaa\nbbb\nccc\nddd";
        let hunk = DiffHunk {
            expected_lines: vec!["bbb".to_string(), "ccc".to_string()],
            replacement_lines: vec!["BBB".to_string(), "CCC".to_string()],
        };
        let result = apply_hunk(content, &hunk).expect("should apply");
        assert_eq!(result, "aaa\nBBB\nCCC\nddd");
    }

    #[test]
    fn test_apply_deletion() {
        let content = "keep1\nremove_me\nkeep2";
        let hunk = DiffHunk {
            expected_lines: vec!["remove_me".to_string()],
            replacement_lines: vec![],
        };
        let result = apply_hunk(content, &hunk).expect("should apply");
        assert_eq!(result, "keep1\nkeep2");
    }

    #[test]
    fn test_apply_pure_addition() {
        let content = "existing";
        let hunk = DiffHunk {
            expected_lines: vec![],
            replacement_lines: vec!["added1".to_string(), "added2".to_string()],
        };
        let result = apply_hunk(content, &hunk).expect("should apply");
        assert!(result.contains("added1"));
        assert!(result.contains("added2"));
    }

    #[test]
    fn test_apply_hunk_not_found() {
        let content = "line1\nline2";
        let hunk = DiffHunk {
            expected_lines: vec!["nonexistent".to_string()],
            replacement_lines: vec!["replacement".to_string()],
        };
        let result = apply_hunk(content, &hunk);
        assert!(result.is_err());
    }
}
