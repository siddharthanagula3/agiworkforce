use calamine::{open_workbook_auto, DataType, Reader};
use rust_xlsxwriter::*;
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
        file_path: &str,
        edits: Vec<ExcelEdit>,
        output_path: &str,
    ) -> Result<()> {
        let mut workbook = Workbook::new();

        let mut sheets: std::collections::HashMap<String, Worksheet> =
            std::collections::HashMap::new();

        // Read existing data from source file using calamine
        match open_workbook_auto(file_path) {
            Ok(mut source_wb) => {
                let sheet_names: Vec<String> = source_wb.sheet_names().to_vec();
                for sheet_name in &sheet_names {
                    if let Some(Ok(range)) = source_wb.worksheet_range(sheet_name) {
                        let worksheet = sheets.entry(sheet_name.clone()).or_default();
                        for (row_idx, row) in range.rows().enumerate() {
                            for (col_idx, cell) in row.iter().enumerate() {
                                match cell {
                                    DataType::Int(n) => {
                                        let _ = worksheet.write_number(
                                            row_idx as u32,
                                            col_idx as u16,
                                            *n as f64,
                                        );
                                    }
                                    DataType::Float(n) => {
                                        let _ = worksheet.write_number(
                                            row_idx as u32,
                                            col_idx as u16,
                                            *n,
                                        );
                                    }
                                    DataType::String(s) => {
                                        let _ = worksheet.write_string(
                                            row_idx as u32,
                                            col_idx as u16,
                                            s,
                                        );
                                    }
                                    DataType::Bool(b) => {
                                        let _ = worksheet.write_boolean(
                                            row_idx as u32,
                                            col_idx as u16,
                                            *b,
                                        );
                                    }
                                    DataType::Empty => {}
                                    _ => {
                                        // DateTime, Duration, Error — write as string representation
                                        let _ = worksheet.write_string(
                                            row_idx as u32,
                                            col_idx as u16,
                                            cell.to_string(),
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
                tracing::debug!(
                    "Loaded {} sheets from source file: {}",
                    sheet_names.len(),
                    file_path
                );
            }
            Err(e) => {
                tracing::warn!(
                    "Could not read source file '{}': {}. Starting with empty workbook.",
                    file_path,
                    e
                );
            }
        }

        for edit in edits {
            self.apply_edit(&mut sheets, &mut workbook, edit)?;
        }

        workbook
            .save(output_path)
            .map_err(|e| Error::Generic(format!("Failed to save workbook: {}", e)))?;

        Ok(())
    }

    fn apply_edit(
        &self,
        sheets: &mut std::collections::HashMap<String, Worksheet>,
        _workbook: &mut Workbook,
        edit: ExcelEdit,
    ) -> Result<()> {
        match edit {
            ExcelEdit::UpdateCell {
                sheet,
                row,
                col,
                value,
            } => {
                let worksheet = sheets.entry(sheet.clone()).or_default();

                if let Ok(num) = value.parse::<f64>() {
                    worksheet
                        .write_number(row, col, num)
                        .map_err(|e| Error::Generic(format!("Failed to write number: {}", e)))?;
                } else {
                    worksheet
                        .write_string(row, col, &value)
                        .map_err(|e| Error::Generic(format!("Failed to write string: {}", e)))?;
                }
            }
            ExcelEdit::SetFormula {
                sheet,
                row,
                col,
                formula,
            } => {
                let worksheet = sheets.entry(sheet.clone()).or_default();
                worksheet
                    .write_formula(row, col, formula.as_str())
                    .map_err(|e| Error::Generic(format!("Failed to write formula: {}", e)))?;
            }
            ExcelEdit::InsertRow { sheet, row, values } => {
                let worksheet = sheets.entry(sheet.clone()).or_default();

                for (idx, value) in values.iter().enumerate() {
                    if let Ok(num) = value.parse::<f64>() {
                        worksheet.write_number(row, idx as u16, num).map_err(|e| {
                            Error::Generic(format!("Failed to write number: {}", e))
                        })?;
                    } else {
                        worksheet
                            .write_string(row, idx as u16, value)
                            .map_err(|e| {
                                Error::Generic(format!("Failed to write string: {}", e))
                            })?;
                    }
                }
            }
            ExcelEdit::DeleteRow { sheet, row } => {
                tracing::warn!(
                    "ExcelEdit::DeleteRow not yet implemented (sheet='{}', row={}). \
                     xlsxwriter does not support row deletion — would require full sheet rebuild.",
                    sheet,
                    row
                );
            }
            ExcelEdit::DeleteColumn { sheet, col } => {
                tracing::warn!(
                    "ExcelEdit::DeleteColumn not yet implemented (sheet='{}', col={}). \
                     xlsxwriter does not support column deletion — would require full sheet rebuild.",
                    sheet,
                    col
                );
            }
            ExcelEdit::InsertColumn { sheet, col, values } => {
                tracing::warn!(
                    "ExcelEdit::InsertColumn not yet fully implemented (sheet='{}', col={}, {} values). \
                     Column insertion requires shifting existing data.",
                    sheet,
                    col,
                    values.len()
                );
            }
            ExcelEdit::UpdateStyle {
                sheet,
                row,
                col,
                bold,
                color,
            } => {
                tracing::warn!(
                    "ExcelEdit::UpdateStyle not yet implemented (sheet='{}', row={}, col={}, bold={:?}, color={:?}). \
                     Style updates require re-writing the cell with format.",
                    sheet,
                    row,
                    col,
                    bold,
                    color
                );
            }
        }

        Ok(())
    }

    pub fn update_cell(
        &self,
        file_path: &str,
        sheet: &str,
        row: u32,
        col: u16,
        value: &str,
        output_path: &str,
    ) -> Result<()> {
        let edits = vec![ExcelEdit::UpdateCell {
            sheet: sheet.to_string(),
            row,
            col,
            value: value.to_string(),
        }];

        self.edit_spreadsheet(file_path, edits, output_path)
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

    pub fn set_formula(
        &self,
        file_path: &str,
        sheet: &str,
        row: u32,
        col: u16,
        formula: &str,
        output_path: &str,
    ) -> Result<()> {
        let edits = vec![ExcelEdit::SetFormula {
            sheet: sheet.to_string(),
            row,
            col,
            formula: formula.to_string(),
        }];

        self.edit_spreadsheet(file_path, edits, output_path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_excel_editor_creation() {
        let _editor = ExcelEditor::new();
    }
}
