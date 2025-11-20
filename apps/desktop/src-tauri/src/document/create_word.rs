use crate::error::{Error, Result};
use docx_rs::*;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordDocumentConfig {
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub keywords: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WordContent {
    Heading {
        level: u8, // 1-6
        text: String,
    },
    Paragraph {
        text: String,
        bold: Option<bool>,
        italic: Option<bool>,
        underline: Option<bool>,
        font_size: Option<u32>, // in half-points (e.g., 24 = 12pt)
        alignment: Option<String>, // "left", "center", "right", "justify"
    },
    BulletList {
        items: Vec<String>,
    },
    NumberedList {
        items: Vec<String>,
    },
    Table {
        headers: Vec<String>,
        rows: Vec<Vec<String>>,
    },
    PageBreak,
}

pub struct WordDocumentCreator;

impl WordDocumentCreator {
    pub fn new() -> Self {
        Self
    }

    pub fn create(
        &self,
        output_path: &str,
        _config: WordDocumentConfig,
        contents: Vec<WordContent>,
    ) -> Result<()> {
        let path = Path::new(output_path);

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| Error::Generic(format!("Failed to create directory: {}", e)))?;
        }

        // Create a new document
        let mut docx = Docx::new();

        // Note: Document properties (title, author, subject) would be set here
        // but the current version of docx-rs (0.4.x) has a different API than expected.
        // These properties are stored in config but not yet applied to the document.
        // Future improvement: Investigate the correct API for setting document properties.

        // Add content
        for content in contents {
            docx = self.add_content(docx, content)?;
        }

        // Build and write to file directly
        docx.build()
            .pack(File::create(output_path).map_err(|e| Error::Generic(format!("Failed to create file: {}", e)))?)
            .map_err(|e| Error::Generic(format!("Failed to pack DOCX: {}", e)))?;

        Ok(())
    }

    fn add_content(&self, mut docx: Docx, content: WordContent) -> Result<Docx> {
        match content {
            WordContent::Heading { level, text } => {
                let heading_level = match level {
                    1 => "Heading1",
                    2 => "Heading2",
                    3 => "Heading3",
                    4 => "Heading4",
                    5 => "Heading5",
                    6 => "Heading6",
                    _ => "Heading1",
                };

                docx = docx.add_paragraph(
                    Paragraph::new()
                        .add_run(Run::new().add_text(&text))
                        .style(heading_level),
                );
            }

            WordContent::Paragraph {
                text,
                bold,
                italic,
                underline,
                font_size,
                alignment,
            } => {
                let mut run = Run::new().add_text(&text);

                if bold.unwrap_or(false) {
                    run = run.bold();
                }
                if italic.unwrap_or(false) {
                    run = run.italic();
                }
                if underline.unwrap_or(false) {
                    run = run.underline("single");
                }
                if let Some(size) = font_size {
                    run = run.size(size as usize);
                }

                let mut para = Paragraph::new().add_run(run);

                if let Some(align) = alignment {
                    para = match align.as_str() {
                        "center" => para.align(AlignmentType::Center),
                        "right" => para.align(AlignmentType::Right),
                        "justify" => para.align(AlignmentType::Both),
                        _ => para.align(AlignmentType::Left),
                    };
                }

                docx = docx.add_paragraph(para);
            }

            WordContent::BulletList { items } => {
                for item in items {
                    docx = docx.add_paragraph(
                        Paragraph::new()
                            .add_run(Run::new().add_text(&item))
                            .numbering(NumberingId::new(0), IndentLevel::new(0)),
                    );
                }
            }

            WordContent::NumberedList { items } => {
                for item in items {
                    docx = docx.add_paragraph(
                        Paragraph::new()
                            .add_run(Run::new().add_text(&item))
                            .numbering(NumberingId::new(1), IndentLevel::new(0)),
                    );
                }
            }

            WordContent::Table { headers, rows } => {
                // Create table cells for header
                let header_cells: Vec<TableCell> = headers
                    .iter()
                    .map(|header| {
                        TableCell::new()
                            .add_paragraph(Paragraph::new().add_run(Run::new().add_text(header).bold()))
                    })
                    .collect();

                let mut table = Table::new(vec![TableRow::new(header_cells)]);

                // Add data rows
                for row_data in rows {
                    let row_cells: Vec<TableCell> = row_data
                        .iter()
                        .map(|cell_text| {
                            TableCell::new()
                                .add_paragraph(Paragraph::new().add_run(Run::new().add_text(cell_text)))
                        })
                        .collect();
                    table = table.add_row(TableRow::new(row_cells));
                }

                docx = docx.add_table(table);
            }

            WordContent::PageBreak => {
                docx = docx.add_paragraph(Paragraph::new().page_break_before(true));
            }
        }

        Ok(docx)
    }

    /// Simple helper to create a basic document with just paragraphs
    pub fn create_simple(
        &self,
        output_path: &str,
        title: Option<String>,
        author: Option<String>,
        paragraphs: Vec<String>,
    ) -> Result<()> {
        let config = WordDocumentConfig {
            title,
            author,
            subject: None,
            keywords: None,
        };

        let contents = paragraphs
            .into_iter()
            .map(|text| WordContent::Paragraph {
                text,
                bold: None,
                italic: None,
                underline: None,
                font_size: None,
                alignment: None,
            })
            .collect();

        self.create(output_path, config, contents)
    }
}

impl Default for WordDocumentCreator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_create_simple_document() {
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("test.docx");
        let output_path_str = output_path.to_str().unwrap();

        let creator = WordDocumentCreator::new();
        let result = creator.create_simple(
            output_path_str,
            Some("Test Document".to_string()),
            Some("Test Author".to_string()),
            vec![
                "This is the first paragraph.".to_string(),
                "This is the second paragraph.".to_string(),
            ],
        );

        assert!(result.is_ok());
        assert!(output_path.exists());
    }

    #[test]
    fn test_create_document_with_formatting() {
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("formatted.docx");
        let output_path_str = output_path.to_str().unwrap();

        let creator = WordDocumentCreator::new();
        let config = WordDocumentConfig {
            title: Some("Formatted Document".to_string()),
            author: Some("Test Author".to_string()),
            subject: None,
            keywords: None,
        };

        let contents = vec![
            WordContent::Heading {
                level: 1,
                text: "Main Heading".to_string(),
            },
            WordContent::Paragraph {
                text: "Bold text".to_string(),
                bold: Some(true),
                italic: None,
                underline: None,
                font_size: None,
                alignment: None,
            },
            WordContent::BulletList {
                items: vec!["Item 1".to_string(), "Item 2".to_string()],
            },
        ];

        let result = creator.create(output_path_str, config, contents);
        assert!(result.is_ok());
        assert!(output_path.exists());
    }
}
