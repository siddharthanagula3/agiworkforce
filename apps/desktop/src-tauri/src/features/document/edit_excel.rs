use calamine::{open_workbook_auto, Data, ExcelDateTime, ExcelDateTimeType, Reader};
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
                    if let Ok(range) = source_wb.worksheet_range(sheet_name) {
                        let worksheet = sheets.entry(sheet_name.clone()).or_default();
                        for (row_idx, row) in range.rows().enumerate() {
                            for (col_idx, cell) in row.iter().enumerate() {
                                match cell {
                                    Data::Int(n) => {
                                        let _ = worksheet.write_number(
                                            row_idx as u32,
                                            col_idx as u16,
                                            *n as f64,
                                        );
                                    }
                                    Data::Float(n) => {
                                        let _ = worksheet.write_number(
                                            row_idx as u32,
                                            col_idx as u16,
                                            *n,
                                        );
                                    }
                                    Data::String(s) => {
                                        let _ = worksheet.write_string(
                                            row_idx as u32,
                                            col_idx as u16,
                                            s,
                                        );
                                    }
                                    Data::Bool(b) => {
                                        let _ = worksheet.write_boolean(
                                            row_idx as u32,
                                            col_idx as u16,
                                            *b,
                                        );
                                    }
                                    Data::Empty => {}
                                    Data::DateTime(datetime) => {
                                        let _ = worksheet.write_string(
                                            row_idx as u32,
                                            col_idx as u16,
                                            excel_datetime_serial_for_copy(datetime),
                                        );
                                    }
                                    _ => {
                                        // ISO date/duration and error cells retain their string representation.
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
                return Err(Error::Generic(format!(
                    "ExcelEdit::DeleteRow is not supported (sheet='{}', row={}): rust_xlsxwriter is \
                     write-only and cannot delete or shift rows in an existing sheet.",
                    sheet, row
                )));
            }
            ExcelEdit::DeleteColumn { sheet, col } => {
                return Err(Error::Generic(format!(
                    "ExcelEdit::DeleteColumn is not supported (sheet='{}', col={}): rust_xlsxwriter is \
                     write-only and cannot delete or shift columns in an existing sheet.",
                    sheet, col
                )));
            }
            ExcelEdit::InsertColumn { sheet, col, values } => {
                return Err(Error::Generic(format!(
                    "ExcelEdit::InsertColumn is not supported (sheet='{}', col={}, {} values): column \
                     insertion requires shifting existing data, which rust_xlsxwriter cannot do.",
                    sheet,
                    col,
                    values.len()
                )));
            }
            ExcelEdit::UpdateStyle {
                sheet,
                row,
                col,
                bold,
                color,
            } => {
                return Err(Error::Generic(format!(
                    "ExcelEdit::UpdateStyle is not supported (sheet='{}', row={}, col={}, bold={:?}, \
                     color={:?}): restyling a cell requires re-reading its existing value, which this \
                     write-only path does not retain.",
                    sheet, row, col, bold, color
                )));
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

/// Preserve the serial value that calamine 0.21 exposed when copying existing
/// workbooks. Calamine 0.36 keeps the 1904 epoch flag inside `ExcelDateTime`, so
/// `as_f64()` alone is 1,462 days lower for those workbooks. Duration serials
/// remain day-based here because this path reconstructs workbook cell values;
/// converting them to seconds would change their Excel value.
fn excel_datetime_serial_for_copy(datetime: &ExcelDateTime) -> String {
    let value = datetime.as_f64();
    if datetime.is_duration() {
        return value.to_string();
    }

    let same_value_in_1900_epoch = ExcelDateTime::new(value, ExcelDateTimeType::DateTime, false);
    let adjusted_value =
        if datetime.to_ymd_hms_milli() == same_value_in_1900_epoch.to_ymd_hms_milli() {
            value
        } else {
            value + 1_462.0
        };

    adjusted_value.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_excel_editor_creation() {
        let _editor = ExcelEditor::new();
    }

    #[test]
    fn unsupported_edits_return_err_not_false_success() {
        let editor = ExcelEditor::new();
        let mut workbook = Workbook::new();
        let unsupported = [
            ExcelEdit::DeleteRow {
                sheet: "Sheet1".to_string(),
                row: 0,
            },
            ExcelEdit::DeleteColumn {
                sheet: "Sheet1".to_string(),
                col: 0,
            },
            ExcelEdit::InsertColumn {
                sheet: "Sheet1".to_string(),
                col: 0,
                values: vec![],
            },
            ExcelEdit::UpdateStyle {
                sheet: "Sheet1".to_string(),
                row: 0,
                col: 0,
                bold: Some(true),
                color: None,
            },
        ];
        for edit in unsupported {
            let mut sheets = std::collections::HashMap::new();
            assert!(
                editor.apply_edit(&mut sheets, &mut workbook, edit).is_err(),
                "unsupported edit must return Err, never a silent success"
            );
        }
    }

    #[test]
    fn preserves_1904_epoch_serial_when_copying_datetime() {
        let datetime = ExcelDateTime::new(24_107.0, ExcelDateTimeType::DateTime, true);

        assert_eq!(excel_datetime_serial_for_copy(&datetime), "25569");
    }

    #[test]
    fn preserves_1900_epoch_serial_when_copying_datetime() {
        let datetime = ExcelDateTime::new(25_569.0, ExcelDateTimeType::DateTime, false);

        assert_eq!(excel_datetime_serial_for_copy(&datetime), "25569");
    }

    #[test]
    fn preserves_day_based_duration_serial_when_copying() {
        let duration = ExcelDateTime::new(0.5, ExcelDateTimeType::TimeDelta, false);

        assert_eq!(excel_datetime_serial_for_copy(&duration), "0.5");
    }
}
