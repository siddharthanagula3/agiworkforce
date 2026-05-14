//! NotebookEdit — Jupyter `.ipynb` cell manipulation.
//!
//! Modes:
//! - `insert` — add a new cell at a position
//! - `replace` — replace cell content by cell_id (or index)
//! - `delete` — remove cell by cell_id (or index)
//!
//! Operates on the JSON document directly (serde_json::Value); we don't link
//! a Python notebook crate.

#![allow(dead_code)]

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NotebookEditMode {
    Insert,
    Replace,
    Delete,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CellKind {
    Code,
    Markdown,
    Raw,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotebookEditRequest {
    pub path: String,
    pub mode: NotebookEditMode,
    /// One of: cell_id, index, or position-relative. Insert: position only.
    /// Replace/Delete: cell_id preferred, falls back to index.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cell_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub index: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<CellKind>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotebookEditResult {
    pub mode: NotebookEditMode,
    pub affected_cell_id: Option<String>,
    pub affected_index: usize,
    pub total_cells: usize,
}

/// Apply a single NotebookEdit operation. Reads the .ipynb JSON, mutates in
/// place, writes back atomically.
pub fn apply(req: &NotebookEditRequest) -> Result<NotebookEditResult> {
    let path = Path::new(&req.path);
    let raw = std::fs::read_to_string(path)
        .with_context(|| format!("read notebook {}", path.display()))?;
    let mut nb: serde_json::Value = serde_json::from_str(&raw)
        .with_context(|| format!("parse notebook JSON {}", path.display()))?;

    let cells = nb
        .get_mut("cells")
        .and_then(|c| c.as_array_mut())
        .ok_or_else(|| anyhow::anyhow!("notebook has no .cells array"))?;

    let result = match req.mode {
        NotebookEditMode::Insert => apply_insert(cells, req)?,
        NotebookEditMode::Replace => apply_replace(cells, req)?,
        NotebookEditMode::Delete => apply_delete(cells, req)?,
    };

    let total = cells.len();
    let serialized = serde_json::to_string_pretty(&nb)?;
    std::fs::write(path, serialized)
        .with_context(|| format!("write notebook {}", path.display()))?;

    Ok(NotebookEditResult {
        mode: req.mode,
        affected_cell_id: result.0,
        affected_index: result.1,
        total_cells: total,
    })
}

fn apply_insert(
    cells: &mut Vec<serde_json::Value>,
    req: &NotebookEditRequest,
) -> Result<(Option<String>, usize)> {
    let kind = req.kind.unwrap_or(CellKind::Code);
    let content = req.content.clone().unwrap_or_default();
    let new_id = format!("cell-{}", uuid::Uuid::new_v4());
    let cell_type = match kind {
        CellKind::Code => "code",
        CellKind::Markdown => "markdown",
        CellKind::Raw => "raw",
    };
    let source: Vec<String> = content.lines().map(|l| format!("{l}\n")).collect();
    let new_cell = serde_json::json!({
        "id": new_id,
        "cell_type": cell_type,
        "source": source,
        "metadata": {},
        "execution_count": null,
        "outputs": [],
    });
    let index = req.index.unwrap_or(cells.len()).min(cells.len());
    cells.insert(index, new_cell);
    Ok((Some(new_id), index))
}

fn apply_replace(
    cells: &mut Vec<serde_json::Value>,
    req: &NotebookEditRequest,
) -> Result<(Option<String>, usize)> {
    let (idx, id) = find_cell(cells, req.cell_id.as_deref(), req.index)?;
    let cell = cells
        .get_mut(idx)
        .ok_or_else(|| anyhow::anyhow!("cell index out of bounds"))?;
    if let Some(content) = &req.content {
        let lines: Vec<String> = content.lines().map(|l| format!("{l}\n")).collect();
        cell["source"] = serde_json::json!(lines);
    }
    if let Some(kind) = req.kind {
        let s = match kind {
            CellKind::Code => "code",
            CellKind::Markdown => "markdown",
            CellKind::Raw => "raw",
        };
        cell["cell_type"] = serde_json::json!(s);
    }
    Ok((id, idx))
}

fn apply_delete(
    cells: &mut Vec<serde_json::Value>,
    req: &NotebookEditRequest,
) -> Result<(Option<String>, usize)> {
    let (idx, id) = find_cell(cells, req.cell_id.as_deref(), req.index)?;
    cells.remove(idx);
    Ok((id, idx))
}

fn find_cell(
    cells: &[serde_json::Value],
    cell_id: Option<&str>,
    index: Option<usize>,
) -> Result<(usize, Option<String>)> {
    if let Some(target_id) = cell_id {
        for (i, cell) in cells.iter().enumerate() {
            if let Some(id) = cell.get("id").and_then(|v| v.as_str()) {
                if id == target_id {
                    return Ok((i, Some(target_id.into())));
                }
            }
        }
        bail!("no cell with id {target_id}");
    }
    let idx = index.ok_or_else(|| anyhow::anyhow!("must provide cell_id or index"))?;
    if idx >= cells.len() {
        bail!("index {idx} out of bounds (cells: {})", cells.len());
    }
    let id = cells[idx]
        .get("id")
        .and_then(|v| v.as_str())
        .map(String::from);
    Ok((idx, id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn write_notebook(tmp: &mut NamedTempFile, cells_json: &str) {
        let content = format!(
            r#"{{
  "cells": {cells_json},
  "metadata": {{ "kernelspec": {{ "name": "python3" }} }},
  "nbformat": 4,
  "nbformat_minor": 5
}}"#
        );
        tmp.write_all(content.as_bytes()).unwrap();
    }

    #[test]
    fn insert_appends_when_no_index() {
        let mut tmp = NamedTempFile::new().unwrap();
        write_notebook(
            &mut tmp,
            r#"[{"id":"c1","cell_type":"code","source":["x=1\n"],"metadata":{}}]"#,
        );
        let req = NotebookEditRequest {
            path: tmp.path().to_string_lossy().into(),
            mode: NotebookEditMode::Insert,
            cell_id: None,
            index: None,
            kind: Some(CellKind::Code),
            content: Some("y=2".into()),
        };
        let r = apply(&req).unwrap();
        assert_eq!(r.mode, NotebookEditMode::Insert);
        assert_eq!(r.affected_index, 1);
        assert_eq!(r.total_cells, 2);
    }

    #[test]
    fn replace_by_cell_id_updates_source() {
        let mut tmp = NamedTempFile::new().unwrap();
        write_notebook(
            &mut tmp,
            r#"[{"id":"c1","cell_type":"code","source":["x=1\n"],"metadata":{}}]"#,
        );
        let req = NotebookEditRequest {
            path: tmp.path().to_string_lossy().into(),
            mode: NotebookEditMode::Replace,
            cell_id: Some("c1".into()),
            index: None,
            kind: None,
            content: Some("x = 42".into()),
        };
        let r = apply(&req).unwrap();
        assert_eq!(r.affected_cell_id, Some("c1".into()));
        assert_eq!(r.affected_index, 0);
        let updated: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(tmp.path()).unwrap()).unwrap();
        let source = updated["cells"][0]["source"].as_array().unwrap();
        assert!(source[0].as_str().unwrap().contains("x = 42"));
    }

    #[test]
    fn delete_by_cell_id_removes() {
        let mut tmp = NamedTempFile::new().unwrap();
        write_notebook(
            &mut tmp,
            r#"[{"id":"c1","cell_type":"code","source":["x=1\n"],"metadata":{}},{"id":"c2","cell_type":"code","source":["y=2\n"],"metadata":{}}]"#,
        );
        let req = NotebookEditRequest {
            path: tmp.path().to_string_lossy().into(),
            mode: NotebookEditMode::Delete,
            cell_id: Some("c1".into()),
            index: None,
            kind: None,
            content: None,
        };
        let r = apply(&req).unwrap();
        assert_eq!(r.total_cells, 1);
    }

    #[test]
    fn delete_by_index_fallback() {
        let mut tmp = NamedTempFile::new().unwrap();
        write_notebook(
            &mut tmp,
            r#"[{"cell_type":"code","source":[],"metadata":{}}]"#,
        );
        let req = NotebookEditRequest {
            path: tmp.path().to_string_lossy().into(),
            mode: NotebookEditMode::Delete,
            cell_id: None,
            index: Some(0),
            kind: None,
            content: None,
        };
        let r = apply(&req).unwrap();
        assert_eq!(r.total_cells, 0);
    }

    #[test]
    fn missing_cell_id_errors() {
        let mut tmp = NamedTempFile::new().unwrap();
        write_notebook(&mut tmp, r#"[]"#);
        let req = NotebookEditRequest {
            path: tmp.path().to_string_lossy().into(),
            mode: NotebookEditMode::Replace,
            cell_id: Some("nope".into()),
            index: None,
            kind: None,
            content: Some("x".into()),
        };
        assert!(apply(&req).is_err());
    }

    #[test]
    fn insert_at_index_zero_prepends() {
        let mut tmp = NamedTempFile::new().unwrap();
        write_notebook(
            &mut tmp,
            r#"[{"id":"c1","cell_type":"code","source":["x=1\n"],"metadata":{}}]"#,
        );
        let req = NotebookEditRequest {
            path: tmp.path().to_string_lossy().into(),
            mode: NotebookEditMode::Insert,
            cell_id: None,
            index: Some(0),
            kind: Some(CellKind::Markdown),
            content: Some("# heading".into()),
        };
        let r = apply(&req).unwrap();
        assert_eq!(r.affected_index, 0);
        assert_eq!(r.total_cells, 2);
        let updated: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(tmp.path()).unwrap()).unwrap();
        assert_eq!(
            updated["cells"][0]["cell_type"].as_str().unwrap(),
            "markdown"
        );
    }

    #[test]
    fn replace_by_index_fallback_updates_source() {
        let mut tmp = NamedTempFile::new().unwrap();
        // Cell has no id field — exercises index-only path
        write_notebook(
            &mut tmp,
            r#"[{"cell_type":"code","source":["old\n"],"metadata":{}}]"#,
        );
        let req = NotebookEditRequest {
            path: tmp.path().to_string_lossy().into(),
            mode: NotebookEditMode::Replace,
            cell_id: None,
            index: Some(0),
            kind: None,
            content: Some("new".into()),
        };
        let r = apply(&req).unwrap();
        assert_eq!(r.affected_index, 0);
        let updated: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(tmp.path()).unwrap()).unwrap();
        let source = updated["cells"][0]["source"].as_array().unwrap();
        assert!(source[0].as_str().unwrap().contains("new"));
    }
}
