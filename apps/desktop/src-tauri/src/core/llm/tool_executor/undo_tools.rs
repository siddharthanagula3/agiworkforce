use super::*;

const DEFAULT_UNDO_CHANGE_LIMIT: usize = 20;
const MAX_UNDO_CHANGE_LIMIT: usize = 50;
const MAX_CHECKPOINT_PATHS: usize = 20;

fn parse_optional_task_id(args: &HashMap<String, Value>) -> Option<String> {
    args.get("task_id")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn parse_positive_limit(args: &HashMap<String, Value>) -> Result<usize> {
    let Some(value) = args.get("limit") else {
        return Ok(DEFAULT_UNDO_CHANGE_LIMIT);
    };
    let raw = value
        .as_u64()
        .ok_or_else(|| anyhow!("limit must be a positive integer"))?;
    if raw == 0 {
        return Err(anyhow!("limit must be greater than zero"));
    }
    let limit = usize::try_from(raw).map_err(|_| anyhow!("limit is too large"))?;
    Ok(limit.min(MAX_UNDO_CHANGE_LIMIT))
}

fn parse_required_string(args: &HashMap<String, Value>, key: &str) -> Result<String> {
    args.get(key)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| anyhow!("Missing or invalid {key} parameter"))
}

impl ToolExecutor {
    fn undo_state(&self) -> Result<tauri::State<'_, UndoState>> {
        let app_handle = self
            .app_handle
            .as_ref()
            .ok_or_else(|| anyhow!("Undo tools require the Desktop application state"))?;
        app_handle
            .try_state::<UndoState>()
            .ok_or_else(|| anyhow!("Undo state is not available"))
    }

    pub(crate) async fn execute_undo_get_summary_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let task_id = parse_optional_task_id(args);
        let undo_state = self.undo_state()?;
        let manager = undo_state.get_manager().await;
        let summary = manager.get_undo_summary(task_id.as_deref()).await;

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "summary": summary,
                "task_id": task_id
            }),
            error: None,
            metadata: HashMap::from([("tool".to_string(), json!("undo_get_summary"))]),
        })
    }

    pub(crate) async fn execute_undo_get_changes_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let task_id = parse_optional_task_id(args);
        let limit = parse_positive_limit(args)?;
        let undo_state = self.undo_state()?;
        let manager = undo_state.get_manager().await;
        let summary = manager.get_undo_summary(task_id.as_deref()).await;
        let changes: Vec<Value> = summary
            .recent_changes
            .into_iter()
            .take(limit)
            .map(|change| serde_json::to_value(change).unwrap_or_else(|_| json!({})))
            .collect();
        let count = changes.len();

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "changes": changes,
                "count": count,
                "limit": limit,
                "task_id": task_id
            }),
            error: None,
            metadata: HashMap::from([("tool".to_string(), json!("undo_get_changes"))]),
        })
    }

    pub(crate) async fn execute_undo_last_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let task_id = parse_optional_task_id(args);
        let undo_state = self.undo_state()?;
        let manager = undo_state.get_manager().await;
        let result = manager
            .undo_last(task_id.as_deref())
            .await
            .map_err(|error| anyhow!(error))?;

        Ok(ToolResult {
            success: result.success,
            data: json!({
                "success": result.success,
                "result": result,
                "task_id": task_id
            }),
            error: None,
            metadata: HashMap::from([("tool".to_string(), json!("undo_last"))]),
        })
    }

    pub(crate) async fn execute_undo_change_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let change_id = parse_required_string(args, "change_id")?;
        let undo_state = self.undo_state()?;
        let manager = undo_state.get_manager().await;
        let result = manager
            .undo_change(&change_id)
            .await
            .map_err(|error| anyhow!(error))?;

        Ok(ToolResult {
            success: result.success,
            data: json!({
                "success": result.success,
                "result": result
            }),
            error: None,
            metadata: HashMap::from([("tool".to_string(), json!("undo_change"))]),
        })
    }

    pub(crate) async fn execute_coding_checkpoint_create_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let name = parse_required_string(args, "name")?;
        let raw_paths = args
            .get("paths")
            .and_then(|value| value.as_array())
            .ok_or_else(|| anyhow!("Missing or invalid paths parameter"))?;
        if raw_paths.is_empty() {
            return Err(anyhow!("paths must contain at least one file path"));
        }
        if raw_paths.len() > MAX_CHECKPOINT_PATHS {
            return Err(anyhow!(
                "paths may contain at most {MAX_CHECKPOINT_PATHS} file paths"
            ));
        }

        let mut paths = Vec::with_capacity(raw_paths.len());
        for value in raw_paths {
            let raw_path = value
                .as_str()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .ok_or_else(|| anyhow!("paths must contain only non-empty strings"))?;
            let resolved_path = self.resolve_path(raw_path);
            let canonical_path = self.canonicalize_validated_path(&resolved_path).await?;
            let metadata = fs::metadata(&canonical_path).await.map_err(|error| {
                anyhow!(
                    "Failed to inspect checkpoint path '{}': {}",
                    canonical_path.display(),
                    error
                )
            })?;
            if !metadata.is_file() {
                return Err(anyhow!(
                    "Checkpoint path must be a file: {}",
                    canonical_path.display()
                ));
            }
            paths.push(canonical_path);
        }

        let undo_state = self.undo_state()?;
        let checkpoint_id = undo_state
            .change_tracker
            .create_named_checkpoint(name.clone(), paths.clone())
            .await
            .map_err(|error| anyhow!(error))?;
        let path_strings: Vec<String> = paths
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect();
        let file_count = path_strings.len();

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "checkpoint_id": checkpoint_id,
                "name": name,
                "paths": path_strings,
                "file_count": file_count
            }),
            error: None,
            metadata: HashMap::from([("tool".to_string(), json!("coding_checkpoint_create"))]),
        })
    }

    pub(crate) async fn execute_coding_checkpoint_list_tool(
        &self,
        _args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let undo_state = self.undo_state()?;
        let checkpoints = undo_state.change_tracker.list_named_checkpoints().await;
        let sanitized: Vec<Value> = checkpoints
            .iter()
            .map(|checkpoint| {
                let paths: Vec<String> = checkpoint
                    .file_snapshots
                    .keys()
                    .map(|path| path.to_string_lossy().to_string())
                    .collect();
                let file_count = paths.len();
                json!({
                    "id": checkpoint.id.clone(),
                    "name": checkpoint.name.clone(),
                    "timestamp": checkpoint.timestamp.to_rfc3339(),
                    "paths": paths,
                    "file_count": file_count,
                    "change_index": checkpoint.change_index
                })
            })
            .collect();
        let count = sanitized.len();

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "checkpoints": sanitized,
                "count": count,
                "snapshot_contents_included": false
            }),
            error: None,
            metadata: HashMap::from([("tool".to_string(), json!("coding_checkpoint_list"))]),
        })
    }

    pub(crate) async fn execute_coding_checkpoint_rewind_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let checkpoint_id = parse_required_string(args, "checkpoint_id")?;
        let undo_state = self.undo_state()?;
        let restored_paths = undo_state
            .change_tracker
            .rewind_to_checkpoint(&checkpoint_id)
            .await
            .map_err(|error| anyhow!(error))?;
        let path_strings: Vec<String> = restored_paths
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect();
        let restored_count = path_strings.len();

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "checkpoint_id": checkpoint_id,
                "restored_paths": path_strings,
                "restored_count": restored_count
            }),
            error: None,
            metadata: HashMap::from([("tool".to_string(), json!("coding_checkpoint_rewind"))]),
        })
    }
}
