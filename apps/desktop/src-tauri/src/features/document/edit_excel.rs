use serde::{Deserialize, Serialize};

use crate::sys::error::{Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExcelEdit {
    UpdateCell {
        sheet: String,
        row: u32,
        col: u16,
        value: String,
    },
    InsertRow {
        sheet: String,
        row: u32,
        values: Vec<String>,
    },
    DeleteRow {
        sheet: String,
        row: u32,
    },
    InsertColumn {
        sheet: String,
        col: u16,
        values: Vec<String>,
    },
    DeleteColumn {
        sheet: String,
        col: u16,
    },
    SetFormula {
        sheet: String,
        row: u32,
        col: u16,
        formula: String,
    },
    UpdateStyle {
        sheet: String,
        row: u32,
        col: u16,
        bold: Option<bool>,
        color: Option<String>,
    },
}

pub struct ExcelEditor;

impl Default for ExcelEditor {
    fn default() -> Self {
        Self::new()
    }
}

impl ExcelEditor {
    pub fn new() -> Self {
        Self
    }

    pub fn edit_spreadsheet(
        &self,
        _file_path: &str,
        _edits: Vec<ExcelEdit>,
        _output_path: &str,
    ) -> Result<()> {
        Err(Error::Generic(
            "Editing existing Excel workbooks is unsupported because this backend cannot preserve \
             their contents. No source or output file was opened or changed."
                .to_string(),
        ))
    }

    pub fn add_row(
        &self,
        file_path: &str,
        sheet: &str,
        row: u32,
        values: Vec<String>,
        output_path: &str,
    ) -> Result<()> {
        let edits = vec![ExcelEdit::InsertRow {
            sheet: sheet.to_string(),
            row,
            values,
        }];

        self.edit_spreadsheet(file_path, edits, output_path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_unsupported(result: Result<()>) {
        let error = result.expect_err("existing workbook edits must be refused");
        let message = error.to_string();
        assert!(message.contains("unsupported"));
        assert!(message.contains("No source or output file was opened or changed"));
    }

    #[test]
    fn every_edit_variant_is_unsupported() {
        let editor = ExcelEditor::new();
        let edits = [
            ExcelEdit::UpdateCell {
                sheet: "Sheet1".to_string(),
                row: 0,
                col: 0,
                value: "value".to_string(),
            },
            ExcelEdit::InsertRow {
                sheet: "Sheet1".to_string(),
                row: 0,
                values: vec!["value".to_string()],
            },
            ExcelEdit::DeleteRow {
                sheet: "Sheet1".to_string(),
                row: 0,
            },
            ExcelEdit::InsertColumn {
                sheet: "Sheet1".to_string(),
                col: 0,
                values: vec!["value".to_string()],
            },
            ExcelEdit::DeleteColumn {
                sheet: "Sheet1".to_string(),
                col: 0,
            },
            ExcelEdit::SetFormula {
                sheet: "Sheet1".to_string(),
                row: 0,
                col: 0,
                formula: "=1+1".to_string(),
            },
            ExcelEdit::UpdateStyle {
                sheet: "Sheet1".to_string(),
                row: 0,
                col: 0,
                bold: Some(true),
                color: None,
            },
        ];
        for edit in edits {
            assert_unsupported(editor.edit_spreadsheet("source.xlsx", vec![edit], "copy.xlsx"));
        }
    }

    #[test]
    fn empty_edits_refuse_before_resolving_any_path() {
        let editor = ExcelEditor::new();
        for (source, output) in [
            ("source.xlsx", "source.xlsx"),
            ("source.xlsx", "copy.xlsx"),
            ("", ""),
            ("\0", "\0"),
            ("~/source.xlsx", "~/copy.xlsx"),
            ("../source.xlsx", "../copy.xlsx"),
        ] {
            assert_unsupported(editor.edit_spreadsheet(source, vec![], output));
        }
    }

    #[test]
    fn add_row_uses_the_same_unsupported_refusal() {
        let editor = ExcelEditor::new();
        for output in ["source.xlsx", "copy.xlsx"] {
            assert_unsupported(editor.add_row(
                "source.xlsx",
                "Sheet1",
                0,
                vec!["value".to_string()],
                output,
            ));
        }
    }
}
