use crate::error::{Error, Result};
use rust_xlsxwriter::*;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcelDocumentConfig {
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub company: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcelSheet {
    pub name: String,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<ExcelCell>>,
    pub freeze_panes: Option<(u32, u32)>, // (row, col) - freeze at this position
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ExcelCell {
    Text { value: String },
    Number { value: f64 },
    Boolean { value: bool },
    Formula { formula: String },
    Date { value: String }, // ISO 8601 format
    Empty,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcelCellStyle {
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    pub font_size: Option<f64>,
    pub font_color: Option<String>, // Hex color like "#FF0000"
    pub bg_color: Option<String>,   // Hex color like "#FFFF00"
    pub alignment: Option<String>,  // "left", "center", "right"
}

pub struct ExcelDocumentCreator;

impl ExcelDocumentCreator {
    pub fn new() -> Self {
        Self
    }

    pub fn create(
        &self,
        output_path: &str,
        config: ExcelDocumentConfig,
        sheets: Vec<ExcelSheet>,
    ) -> Result<()> {
        let path = Path::new(output_path);

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| Error::Generic(format!("Failed to create directory: {}", e)))?;
        }

        // Create a new workbook
        let mut workbook = Workbook::new();

        // Set document properties
        let mut doc_props = DocProperties::new();
        if let Some(title) = config.title {
            doc_props = doc_props.set_title(&title);
        }
        if let Some(author) = config.author {
            doc_props = doc_props.set_author(&author);
        }
        if let Some(subject) = config.subject {
            doc_props = doc_props.set_subject(&subject);
        }
        if let Some(company) = config.company {
            doc_props = doc_props.set_company(&company);
        }
        workbook.set_properties(&doc_props);

        // Add sheets
        for sheet_data in sheets {
            let worksheet = workbook.add_worksheet();
            worksheet
                .set_name(&sheet_data.name)
                .map_err(|e| Error::Generic(format!("Failed to set sheet name: {}", e)))?;

            // Create header format (bold)
            let header_format = Format::new().set_bold();

            // Write headers
            for (col, header) in sheet_data.headers.iter().enumerate() {
                worksheet
                    .write_string_with_format(0, col as u16, header, &header_format)
                    .map_err(|e| Error::Generic(format!("Failed to write header: {}", e)))?;
            }

            // Write data rows
            for (row_idx, row) in sheet_data.rows.iter().enumerate() {
                let excel_row = (row_idx + 1) as u32; // +1 because row 0 is headers

                for (col_idx, cell) in row.iter().enumerate() {
                    let excel_col = col_idx as u16;

                    match cell {
                        ExcelCell::Text { value } => {
                            worksheet
                                .write_string(excel_row, excel_col, value)
                                .map_err(|e| {
                                    Error::Generic(format!("Failed to write text cell: {}", e))
                                })?;
                        }
                        ExcelCell::Number { value } => {
                            worksheet
                                .write_number(excel_row, excel_col, *value)
                                .map_err(|e| {
                                    Error::Generic(format!("Failed to write number cell: {}", e))
                                })?;
                        }
                        ExcelCell::Boolean { value } => {
                            worksheet
                                .write_boolean(excel_row, excel_col, *value)
                                .map_err(|e| {
                                    Error::Generic(format!("Failed to write boolean cell: {}", e))
                                })?;
                        }
                        ExcelCell::Formula { formula } => {
                            worksheet
                                .write_formula(excel_row, excel_col, formula.as_str())
                                .map_err(|e| {
                                    Error::Generic(format!("Failed to write formula: {}", e))
                                })?;
                        }
                        ExcelCell::Date { value } => {
                            // Parse ISO 8601 date and write as Excel date
                            let datetime_format =
                                Format::new().set_num_format("yyyy-mm-dd hh:mm:ss");
                            worksheet
                                .write_string_with_format(
                                    excel_row,
                                    excel_col,
                                    value,
                                    &datetime_format,
                                )
                                .map_err(|e| {
                                    Error::Generic(format!("Failed to write date cell: {}", e))
                                })?;
                        }
                        ExcelCell::Empty => {
                            // Do nothing for empty cells
                        }
                    }
                }
            }

            // Set freeze panes if specified
            if let Some((row, col)) = sheet_data.freeze_panes {
                worksheet
                    .set_freeze_panes(row, col as u16)
                    .map_err(|e| Error::Generic(format!("Failed to set freeze panes: {}", e)))?;
            }

            // Auto-fit columns based on header length
            for (col_idx, header) in sheet_data.headers.iter().enumerate() {
                let width = (header.len() as f64 * 1.2).max(10.0);
                worksheet
                    .set_column_width(col_idx as u16, width)
                    .map_err(|e| Error::Generic(format!("Failed to set column width: {}", e)))?;
            }
        }

        // Save the workbook
        workbook
            .save(output_path)
            .map_err(|e| Error::Generic(format!("Failed to save workbook: {}", e)))?;

        Ok(())
    }

    /// Simple helper to create a basic spreadsheet with one sheet
    pub fn create_simple(
        &self,
        output_path: &str,
        sheet_name: &str,
        headers: Vec<String>,
        rows: Vec<Vec<String>>,
    ) -> Result<()> {
        let config = ExcelDocumentConfig {
            title: Some(sheet_name.to_string()),
            author: None,
            subject: None,
            company: None,
        };

        let excel_rows: Vec<Vec<ExcelCell>> = rows
            .into_iter()
            .map(|row| {
                row.into_iter()
                    .map(|cell| ExcelCell::Text { value: cell })
                    .collect()
            })
            .collect();

        let sheet = ExcelSheet {
            name: sheet_name.to_string(),
            headers,
            rows: excel_rows,
            freeze_panes: Some((1, 0)), // Freeze header row
        };

        self.create(output_path, config, vec![sheet])
    }

    /// Create a spreadsheet with numeric data
    pub fn create_with_numbers(
        &self,
        output_path: &str,
        sheet_name: &str,
        headers: Vec<String>,
        rows: Vec<Vec<f64>>,
    ) -> Result<()> {
        let config = ExcelDocumentConfig {
            title: Some(sheet_name.to_string()),
            author: None,
            subject: None,
            company: None,
        };

        let excel_rows: Vec<Vec<ExcelCell>> = rows
            .into_iter()
            .map(|row| {
                row.into_iter()
                    .map(|cell| ExcelCell::Number { value: cell })
                    .collect()
            })
            .collect();

        let sheet = ExcelSheet {
            name: sheet_name.to_string(),
            headers,
            rows: excel_rows,
            freeze_panes: Some((1, 0)),
        };

        self.create(output_path, config, vec![sheet])
    }
}

impl Default for ExcelDocumentCreator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_create_simple_spreadsheet() {
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("test.xlsx");
        let output_path_str = output_path.to_str().unwrap();

        let creator = ExcelDocumentCreator::new();
        let result = creator.create_simple(
            output_path_str,
            "TestSheet",
            vec!["Name".to_string(), "Age".to_string()],
            vec![
                vec!["Alice".to_string(), "30".to_string()],
                vec!["Bob".to_string(), "25".to_string()],
            ],
        );

        assert!(result.is_ok());
        assert!(output_path.exists());
    }

    #[test]
    fn test_create_spreadsheet_with_numbers() {
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("numbers.xlsx");
        let output_path_str = output_path.to_str().unwrap();

        let creator = ExcelDocumentCreator::new();
        let result = creator.create_with_numbers(
            output_path_str,
            "Sales",
            vec!["Q1".to_string(), "Q2".to_string(), "Q3".to_string()],
            vec![vec![100.5, 200.75, 150.25], vec![300.0, 250.5, 400.0]],
        );

        assert!(result.is_ok());
        assert!(output_path.exists());
    }

    #[test]
    fn test_create_multi_sheet_workbook() {
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("multi_sheet.xlsx");
        let output_path_str = output_path.to_str().unwrap();

        let creator = ExcelDocumentCreator::new();
        let config = ExcelDocumentConfig {
            title: Some("Multi-Sheet Workbook".to_string()),
            author: Some("Test Author".to_string()),
            subject: None,
            company: None,
        };

        let sheets = vec![
            ExcelSheet {
                name: "Sheet1".to_string(),
                headers: vec!["Col1".to_string(), "Col2".to_string()],
                rows: vec![vec![
                    ExcelCell::Text {
                        value: "Data1".to_string(),
                    },
                    ExcelCell::Number { value: 42.0 },
                ]],
                freeze_panes: None,
            },
            ExcelSheet {
                name: "Sheet2".to_string(),
                headers: vec!["Item".to_string(), "Price".to_string()],
                rows: vec![vec![
                    ExcelCell::Text {
                        value: "Product".to_string(),
                    },
                    ExcelCell::Number { value: 99.99 },
                ]],
                freeze_panes: Some((1, 0)),
            },
        ];

        let result = creator.create(output_path_str, config, sheets);
        assert!(result.is_ok());
        assert!(output_path.exists());
    }
}
