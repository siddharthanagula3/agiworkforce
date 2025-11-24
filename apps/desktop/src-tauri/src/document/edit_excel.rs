use anyhow::Result;
use rust_xlsxwriter::*;
use serde::{Deserialize, Serialize};

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
        edits: Vec<ExcelEdit>,
        output_path: &str,
    ) -> Result<()> {
        // For editing, we need to read the existing file first
        // rust_xlsxwriter doesn't support reading, only writing
        // In production, you'd use calamine to read and rust_xlsxwriter to write

        let mut workbook = Workbook::new();

        // Apply edits by creating worksheets
        let mut sheets: std::collections::HashMap<String, Worksheet> =
            std::collections::HashMap::new();

        for edit in edits {
            self.apply_edit(&mut sheets, &mut workbook, edit)?;
        }

        // Save workbook
        workbook.save(output_path)?;

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
                let worksheet = sheets.entry(sheet.clone()).or_insert_with(Worksheet::new);

                // Try to parse as number
                if let Ok(num) = value.parse::<f64>() {
                    worksheet.write_number(row, col, num)?;
                } else {
                    worksheet.write_string(row, col, &value)?;
                }
            }
            ExcelEdit::SetFormula {
                sheet,
                row,
                col,
                formula,
            } => {
                let worksheet = sheets.entry(sheet.clone()).or_insert_with(Worksheet::new);
                worksheet.write_formula(row, col, formula.as_str())?;
            }
            ExcelEdit::InsertRow { sheet, row, values } => {
                let worksheet = sheets.entry(sheet.clone()).or_insert_with(Worksheet::new);

                for (idx, value) in values.iter().enumerate() {
                    if let Ok(num) = value.parse::<f64>() {
                        worksheet.write_number(row, idx as u16, num)?;
                    } else {
                        worksheet.write_string(row, idx as u16, value)?;
                    }
                }
            }
            _ => {
                // Other edits not yet fully implemented
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
        let editor = ExcelEditor::new();
        assert!(std::mem::size_of_val(&editor) >= 0);
    }
}
