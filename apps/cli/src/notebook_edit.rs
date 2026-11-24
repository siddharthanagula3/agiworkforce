//! NotebookEdit, Jupyter `.ipynb` cell manipulation.
//!
//! Modes:
//! - `insert`: add a new cell at a position
//! - `replace`: replace cell content by cell_id (or index)
//! - `delete`: remove cell by cell_id (or index)
//!
//! Operates on the JSON document directly (serde_json::Value); we don't link
//! a Python notebook crate.

#![allow(dead_code)]

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

const CHANGED_DURING_EDIT: &str =
    "Notebook changed while this edit was pending. Read it again before attempting to edit it.";

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

impl CellKind {
    fn cell_type(self) -> &'static str {
        match self {
            CellKind::Code => "code",
            CellKind::Markdown => "markdown",
            CellKind::Raw => "raw",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotebookEditRequest {
    pub path: String,
    pub mode: NotebookEditMode,
    /// A cell to replace, delete, or insert after. Takes precedence over index.
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
    apply_with_basis(req, None)
}

pub(crate) fn apply_with_basis(
    req: &NotebookEditRequest,
    basis: Option<&str>,
) -> Result<NotebookEditResult> {
    let path = Path::new(&req.path);
    let raw = std::fs::read_to_string(path)
        .with_context(|| format!("read notebook {}", path.display()))?;
    if basis.is_some_and(|basis| basis != raw) {
        bail!("{CHANGED_DURING_EDIT}");
    }
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
    let serialized = nbformat_json(&nb)?;
    write_atomic(path, &serialized, &raw)
        .with_context(|| format!("write notebook {}", path.display()))?;

    Ok(NotebookEditResult {
        mode: req.mode,
        affected_cell_id: result.0,
        affected_index: result.1,
        total_cells: total,
    })
}

/// The notebook laid out as nbformat writes it: one-space indent, keys in
/// sorted order, and a final newline. A notebook Jupyter saved then changes
/// only in the cells that were edited.
fn nbformat_json(nb: &serde_json::Value) -> Result<Vec<u8>> {
    let mut buf = Vec::new();
    {
        let mut serializer = serde_json::Serializer::with_formatter(
            &mut buf,
            serde_json::ser::PrettyFormatter::with_indent(b" "),
        );
        nb.serialize(&mut serializer)?;
    }
    buf.push(b'\n');
    Ok(buf)
}

/// Write `bytes` to `path` atomically: write to a temp file in the same
/// directory, fsync it, then `rename` it over `path`. The rename is atomic on
/// POSIX and Windows so a crash mid-write leaves the original notebook intact
/// rather than truncated. Keeping the temp file in the same directory ensures
/// the rename stays on one filesystem.
fn write_atomic(path: &Path, bytes: &[u8], basis: &str) -> std::io::Result<()> {
    use std::io::Write;

    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "notebook".to_string());
    let tmp_path = dir.join(format!(".{file_name}.{}.tmp", uuid::Uuid::new_v4()));
    let permissions = std::fs::metadata(path)?.permissions();
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&tmp_path)?;

    let write_result = (|| {
        file.set_permissions(permissions)?;
        file.write_all(bytes)?;
        file.flush()?;
        file.sync_all()?;
        if std::fs::read_to_string(path)? != basis {
            return Err(std::io::Error::other(CHANGED_DURING_EDIT));
        }
        Ok::<(), std::io::Error>(())
    })();
    drop(file);

    if let Err(e) = write_result {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(e);
    }

    if let Err(e) = std::fs::rename(&tmp_path, path) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(e);
    }

    Ok(())
}

fn apply_insert(
    cells: &mut Vec<serde_json::Value>,
    req: &NotebookEditRequest,
) -> Result<(Option<String>, usize)> {
    let kind = req.kind.unwrap_or(CellKind::Code);
    let content = req.content.clone().unwrap_or_default();
    let new_id = format!("cell-{}", uuid::Uuid::new_v4());
    let source: Vec<String> = content.lines().map(|l| format!("{l}\n")).collect();
    let mut new_cell = serde_json::json!({
        "id": new_id,
        "cell_type": kind.cell_type(),
        "source": source,
        "metadata": {},
    });
    conform_cell_to_kind(&mut new_cell, kind);
    let index = match req.cell_id.as_deref() {
        Some(id) => find_cell(cells, Some(id), None)?.0 + 1,
        None => req.index.unwrap_or(cells.len()).min(cells.len()),
    };
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
        cell["cell_type"] = serde_json::json!(kind.cell_type());
        conform_cell_to_kind(cell, kind);
    }
    if req.content.is_some()
        && cell.get("cell_type").and_then(serde_json::Value::as_str) == Some("code")
    {
        cell["execution_count"] = serde_json::Value::Null;
        cell["outputs"] = serde_json::json!([]);
    }
    Ok((id, idx))
}

fn conform_cell_to_kind(cell: &mut serde_json::Value, kind: CellKind) {
    let Some(fields) = cell.as_object_mut() else {
        return;
    };
    fields
        .entry("metadata")
        .or_insert_with(|| serde_json::json!({}));
    match kind {
        CellKind::Code => {
            fields
                .entry("execution_count")
                .or_insert(serde_json::Value::Null);
            fields
                .entry("outputs")
                .or_insert_with(|| serde_json::json!([]));
            fields.remove("attachments");
        }
        CellKind::Markdown | CellKind::Raw => {
            fields.remove("execution_count");
            fields.remove("outputs");
        }
    }
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
    fn insert_after_cell_id_keeps_surrounding_cells_in_order() {
        let mut tmp = NamedTempFile::new().unwrap();
        tmp.write_all(JUPYTER_SAVED.as_bytes()).unwrap();
        let req = NotebookEditRequest {
            path: tmp.path().to_string_lossy().into(),
            mode: NotebookEditMode::Insert,
            cell_id: Some("a".into()),
            index: None,
            kind: Some(CellKind::Markdown),
            content: Some("# Between".into()),
        };
        let cells = edited_cells(&tmp, &req);
        assert_eq!(cells[0]["id"], "a");
        assert_eq!(cells[0]["execution_count"], 1);
        assert_eq!(cells[1]["source"], serde_json::json!(["# Between\n"]));
        assert_eq!(cells[2]["id"], "b");
    }

    #[test]
    fn replace_by_index_fallback_updates_source() {
        let mut tmp = NamedTempFile::new().unwrap();
        // Cell has no id field, exercises index-only path
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

    const JUPYTER_SAVED: &str = r##"{
 "cells": [
  {
   "cell_type": "code",
   "execution_count": 1,
   "id": "a",
   "metadata": {},
   "outputs": [
    {
     "name": "stdout",
     "output_type": "stream",
     "text": [
      "1\n"
     ]
    }
   ],
   "source": [
    "x = 1\n",
    "print(x)\n"
   ]
  },
  {
   "cell_type": "markdown",
   "id": "b",
   "metadata": {},
   "source": [
    "# Résumé\n"
   ]
  }
 ],
 "metadata": {
  "kernelspec": {
   "display_name": "Python 3",
   "language": "python",
   "name": "python3"
  }
 },
 "nbformat": 4,
 "nbformat_minor": 5
}
"##;

    #[test]
    fn a_one_cell_edit_of_a_notebook_jupyter_saved_changes_only_that_cell() {
        let mut tmp = NamedTempFile::new().unwrap();
        tmp.write_all(JUPYTER_SAVED.as_bytes()).unwrap();
        let req = NotebookEditRequest {
            path: tmp.path().to_string_lossy().into(),
            mode: NotebookEditMode::Replace,
            cell_id: Some("b".into()),
            index: None,
            kind: None,
            content: Some("# Summary".into()),
        };

        apply(&req).unwrap();

        assert_eq!(
            std::fs::read_to_string(tmp.path()).unwrap(),
            JUPYTER_SAVED.replace("# Résumé", "# Summary")
        );
    }

    fn edited_cells(tmp: &NamedTempFile, req: &NotebookEditRequest) -> serde_json::Value {
        apply(req).unwrap();
        let updated: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(tmp.path()).unwrap()).unwrap();
        updated["cells"].clone()
    }

    fn kind_request(
        tmp: &NamedTempFile,
        mode: NotebookEditMode,
        cell_id: Option<&str>,
        kind: CellKind,
    ) -> NotebookEditRequest {
        NotebookEditRequest {
            path: tmp.path().to_string_lossy().into(),
            mode,
            cell_id: cell_id.map(String::from),
            index: None,
            kind: Some(kind),
            content: Some("print(1)".into()),
        }
    }

    #[test]
    fn replacing_a_markdown_cell_with_code_adds_the_code_only_fields() {
        let mut tmp = NamedTempFile::new().unwrap();
        write_notebook(
            &mut tmp,
            r##"[{"id":"m1","cell_type":"markdown","source":["# t\n"],"metadata":{}}]"##,
        );
        let cells = edited_cells(
            &tmp,
            &kind_request(&tmp, NotebookEditMode::Replace, Some("m1"), CellKind::Code),
        );
        assert_eq!(cells[0]["cell_type"], "code");
        assert!(cells[0]["execution_count"].is_null());
        assert_eq!(cells[0]["outputs"], serde_json::json!([]));
    }

    #[test]
    fn replacing_a_code_cell_with_markdown_or_raw_drops_the_code_only_fields() {
        for kind in [CellKind::Markdown, CellKind::Raw] {
            let mut tmp = NamedTempFile::new().unwrap();
            write_notebook(
                &mut tmp,
                r#"[{"id":"c1","cell_type":"code","source":["x=1\n"],"metadata":{},"execution_count":3,"outputs":[{"output_type":"stream","name":"stdout","text":["1\n"]}]}]"#,
            );
            let cells = edited_cells(
                &tmp,
                &kind_request(&tmp, NotebookEditMode::Replace, Some("c1"), kind),
            );
            let cell = cells[0].as_object().unwrap();
            assert_eq!(cell["cell_type"], kind.cell_type());
            assert!(!cell.contains_key("execution_count"));
            assert!(!cell.contains_key("outputs"));
            assert!(cell.contains_key("metadata"));
        }
    }

    #[test]
    fn replacing_a_markdown_cell_with_code_drops_attachments() {
        let mut tmp = NamedTempFile::new().unwrap();
        write_notebook(
            &mut tmp,
            r#"[{"id":"m1","cell_type":"markdown","source":["x\n"],"metadata":{},"attachments":{"a.png":{"image/png":"AA=="}}}]"#,
        );
        let cells = edited_cells(
            &tmp,
            &kind_request(&tmp, NotebookEditMode::Replace, Some("m1"), CellKind::Code),
        );
        assert!(!cells[0].as_object().unwrap().contains_key("attachments"));
    }

    #[test]
    fn replacing_code_clears_its_cached_outputs() {
        let mut tmp = NamedTempFile::new().unwrap();
        write_notebook(
            &mut tmp,
            r#"[{"id":"c1","cell_type":"code","source":["x=1\n"],"metadata":{},"execution_count":3,"outputs":[{"output_type":"stream","name":"stdout","text":["1\n"]}]}]"#,
        );
        let mut request = kind_request(&tmp, NotebookEditMode::Replace, Some("c1"), CellKind::Code);
        request.kind = None;
        let cells = edited_cells(&tmp, &request);
        assert_eq!(cells[0]["execution_count"], serde_json::Value::Null);
        assert_eq!(cells[0]["outputs"], serde_json::json!([]));
    }

    #[test]
    fn an_edit_loses_to_a_newer_notebook_save() {
        let mut tmp = NamedTempFile::new().unwrap();
        tmp.write_all(JUPYTER_SAVED.as_bytes()).unwrap();
        let newer = JUPYTER_SAVED.replace("# Résumé", "# Edited by the user");
        std::fs::write(tmp.path(), &newer).unwrap();
        let req = kind_request(&tmp, NotebookEditMode::Replace, Some("a"), CellKind::Code);
        let error = apply_with_basis(&req, Some(JUPYTER_SAVED)).unwrap_err();
        assert_eq!(error.to_string(), CHANGED_DURING_EDIT);
        assert_eq!(std::fs::read_to_string(tmp.path()).unwrap(), newer);
    }

    #[test]
    fn inserted_cells_carry_only_the_fields_their_kind_allows() {
        for (kind, is_code) in [
            (CellKind::Code, true),
            (CellKind::Markdown, false),
            (CellKind::Raw, false),
        ] {
            let mut tmp = NamedTempFile::new().unwrap();
            write_notebook(&mut tmp, r#"[]"#);
            let cells = edited_cells(
                &tmp,
                &kind_request(&tmp, NotebookEditMode::Insert, None, kind),
            );
            let cell = cells[0].as_object().unwrap();
            assert_eq!(cell.contains_key("execution_count"), is_code);
            assert_eq!(cell.contains_key("outputs"), is_code);
            assert!(cell.contains_key("metadata"));
        }
    }
}
