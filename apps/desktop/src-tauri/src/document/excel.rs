use std::fs;
use std::path::Path;

use calamine::{open_workbook_auto, DataType, Reader};
use chrono::{Duration as ChronoDuration, NaiveDate, NaiveDateTime};

use super::{DocumentContent, DocumentMetadata, DocumentType, SearchResult};
use crate::error::{Error, Result};

struct ExcelExtraction {
    text: String,
    sheet_count: usize,
    non_empty_cells: usize,
}

pub struct ExcelHandler;

impl ExcelHandler {
    pub fn new() -> Self {
        Self
    }

    pub async fn read(&self, file_path: &str) -> Result<DocumentContent> {
        let extraction = self.parse_workbook(file_path)?;
        let mut metadata = self.build_metadata(file_path, Some(&extraction))?;

        if metadata.word_count.is_none() {
            metadata.word_count = Some(extraction.non_empty_cells);
        }
        if metadata.page_count.is_none() {
            metadata.page_count = Some(extraction.sheet_count);
        }

        Ok(DocumentContent {
            text: extraction.text,
            metadata,
        })
    }

    pub async fn extract_text(&self, file_path: &str) -> Result<String> {
        let extraction = self.parse_workbook(file_path)?;
        Ok(extraction.text)
    }

    pub async fn get_metadata(&self, file_path: &str) -> Result<DocumentMetadata> {
        match self.parse_workbook(file_path) {
            Ok(extraction) => self.build_metadata(file_path, Some(&extraction)),
            Err(_) => self.build_metadata(file_path, None),
        }
    }

    pub async fn search(&self, file_path: &str, query: &str) -> Result<Vec<SearchResult>> {
        let extraction = self.parse_workbook(file_path)?;
        let mut results = Vec::new();
        let query_lower = query.to_lowercase();

        for (line_num, line) in extraction.text.lines().enumerate() {
            if line.to_lowercase().contains(&query_lower) {
                results.push(SearchResult {
                    page: None,
                    line: Some(line_num + 1),
                    context: line.to_string(),
                    match_text: query.to_string(),
                });
            }
        }

        Ok(results)
    }

    fn parse_workbook(&self, file_path: &str) -> Result<ExcelExtraction> {
        let path = Path::new(file_path);
        if !path.exists() {
            return Err(Error::Generic(format!("File not found: {}", file_path)));
        }

        let mut workbook = open_workbook_auto(path)
            .map_err(|e| Error::Generic(format!("Failed to open spreadsheet: {}", e)))?;

        let sheet_names: Vec<String> = workbook.sheet_names().to_owned();
        let mut aggregated = String::new();
        let mut sheet_count = 0usize;
        let mut non_empty_cells = 0usize;

        for sheet_name in sheet_names {
            sheet_count += 1;
            if !aggregated.is_empty() {
                aggregated.push_str("\n\n");
            }
            aggregated.push_str(&format!("Sheet: {}\n", sheet_name));

            if let Some(Ok(range)) = workbook.worksheet_range(&sheet_name) {
                for row in range.rows() {
                    let mut row_values = Vec::with_capacity(row.len());
                    for cell in row {
                        let cell_text = data_type_to_string(cell);
                        if !cell_text.is_empty() {
                            non_empty_cells += 1;
                        }
                        row_values.push(cell_text);
                    }
                    let row_line = row_values
                        .into_iter()
                        .map(|value| value.trim().to_string())
                        .collect::<Vec<_>>()
                        .join("\t")
                        .trim()
                        .to_string();
                    if !row_line.is_empty() {
                        aggregated.push_str(&row_line);
                        aggregated.push('\n');
                    }
                }
            }
        }

        Ok(ExcelExtraction {
            text: aggregated.trim().to_string(),
            sheet_count,
            non_empty_cells,
        })
    }

    fn build_metadata(
        &self,
        file_path: &str,
        extraction: Option<&ExcelExtraction>,
    ) -> Result<DocumentMetadata> {
        let path = Path::new(file_path);
        if !path.exists() {
            return Err(Error::Generic(format!("File not found: {}", file_path)));
        }

        let file_metadata = fs::metadata(path)
            .map_err(|e| Error::Generic(format!("Failed to read file metadata: {}", e)))?;

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        let title = file_name.clone();

        let (sheet_count, non_empty_cells) = match extraction {
            Some(ext) => (Some(ext.sheet_count), Some(ext.non_empty_cells)),
            None => match self.parse_workbook(file_path) {
                Ok(ext) => (Some(ext.sheet_count), Some(ext.non_empty_cells)),
                Err(_) => (None, None),
            },
        };

        Ok(DocumentMetadata {
            file_path: file_path.to_string(),
            file_name,
            file_size: file_metadata.len(),
            document_type: DocumentType::Excel,
            created_at: file_metadata.created().ok().and_then(timestamp_to_string),
            modified_at: file_metadata.modified().ok().and_then(timestamp_to_string),
            author: None,
            title: Some(title),
            page_count: sheet_count,
            word_count: non_empty_cells,
        })
    }
}

impl Default for ExcelHandler {
    fn default() -> Self {
        Self::new()
    }
}

fn timestamp_to_string(time: std::time::SystemTime) -> Option<String> {
    time.duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs().to_string())
}

fn data_type_to_string(cell: &DataType) -> String {
    match cell {
        DataType::Empty => String::new(),
        DataType::String(s) => s.trim().to_string(),
        DataType::Float(f) => {
            if (f.fract() - 0.0).abs() < f64::EPSILON {
                format!("{}", *f as i64)
            } else {
                f.to_string()
            }
        }
        DataType::Int(i) => i.to_string(),
        DataType::Bool(b) => b.to_string(),
        DataType::DateTime(dt) => excel_serial_to_string(*dt),
        DataType::DateTimeIso(value) | DataType::DurationIso(value) => value.trim().to_string(),
        DataType::Duration(secs) => format!("{}s", secs),
        DataType::Error(err) => format!("{:?}", err),
    }
}

fn excel_serial_to_string(value: f64) -> String {
    excel_serial_to_datetime(value)
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| value.to_string())
}

fn excel_serial_to_datetime(value: f64) -> Option<NaiveDateTime> {
    if !value.is_finite() {
        return None;
    }

    // Excel stores datetimes as days since 1899-12-30 (accounting for the 1900 leap year bug).
    let epoch_date = NaiveDate::from_ymd_opt(1899, 12, 30)?;
    let seconds_total = (value * 86_400.0).round() as i64;
    let base = epoch_date.and_hms_opt(0, 0, 0)?;

    base.checked_add_signed(ChronoDuration::seconds(seconds_total))
}
