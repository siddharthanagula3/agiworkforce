use crate::error::{Error, Result};
use printpdf::*;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfDocumentConfig {
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub page_size: Option<String>, // "A4", "Letter", "Legal"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PdfContent {
    Heading {
        level: u8, // 1-3
        text: String,
    },
    Paragraph {
        text: String,
        bold: Option<bool>,
        italic: Option<bool>,
        font_size: Option<u8>,
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
    Image {
        path: String,
        width: Option<u32>,
        height: Option<u32>,
    },
}

pub struct PdfDocumentCreator;

impl PdfDocumentCreator {
    pub fn new() -> Self {
        Self
    }

    pub fn create(
        &self,
        output_path: &str,
        config: PdfDocumentConfig,
        contents: Vec<PdfContent>,
    ) -> Result<()> {
        let path = Path::new(output_path);

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| Error::Generic(format!("Failed to create directory: {}", e)))?;
        }

        // Determine page size
        let (page_width, page_height) = match config.page_size.as_deref() {
            Some("Letter") => (Mm(215.9), Mm(279.4)), // 8.5" x 11"
            Some("Legal") => (Mm(215.9), Mm(355.6)),  // 8.5" x 14"
            _ => (Mm(210.0), Mm(297.0)),              // A4 (default)
        };

        // Create document
        let title = config.title.as_deref().unwrap_or("Document");
        let (doc, page1, layer1) = PdfDocument::new(title, page_width, page_height, "Layer 1");

        // Get the current layer and page
        let current_layer = doc.get_page(page1).get_layer(layer1);

        // Add built-in font
        let font = doc
            .add_builtin_font(BuiltinFont::Helvetica)
            .map_err(|e| Error::Generic(format!("Failed to add font: {}", e)))?;
        let font_bold = doc
            .add_builtin_font(BuiltinFont::HelveticaBold)
            .map_err(|e| Error::Generic(format!("Failed to add bold font: {}", e)))?;

        // Start position
        let mut current_y = page_height - Mm(20.0); // Start 20mm from top
        let margin_left = Mm(20.0);
        let _margin_right = Mm(20.0);

        // Add content
        for content in contents {
            match content {
                PdfContent::Heading { level, text } => {
                    let font_size = match level {
                        1 => 20,
                        2 => 16,
                        3 => 14,
                        _ => 12,
                    };

                    current_layer.use_text(
                        &text,
                        font_size as f32,
                        margin_left,
                        current_y,
                        &font_bold,
                    );
                    current_y -= Mm(font_size as f32 * 0.5); // Add spacing
                }

                PdfContent::Paragraph {
                    text,
                    bold,
                    italic: _,
                    font_size,
                    alignment: _,
                } => {
                    let size = font_size.unwrap_or(12);
                    let selected_font = if bold.unwrap_or(false) {
                        &font_bold
                    } else {
                        &font
                    };

                    current_layer.use_text(
                        &text,
                        size as f32,
                        margin_left,
                        current_y,
                        selected_font,
                    );
                    current_y -= Mm(size as f32 * 0.5);
                }

                PdfContent::BulletList { items } => {
                    for item in items {
                        let bullet_text = format!("• {}", item);
                        current_layer.use_text(&bullet_text, 12.0, margin_left, current_y, &font);
                        current_y -= Mm(6.0);
                    }
                }

                PdfContent::NumberedList { items } => {
                    for (idx, item) in items.iter().enumerate() {
                        let numbered_text = format!("{}. {}", idx + 1, item);
                        current_layer.use_text(&numbered_text, 12.0, margin_left, current_y, &font);
                        current_y -= Mm(6.0);
                    }
                }

                PdfContent::Table { headers, rows } => {
                    // Simple table rendering
                    let header_text = headers.join(" | ");
                    current_layer.use_text(&header_text, 12.0, margin_left, current_y, &font_bold);
                    current_y -= Mm(6.0);

                    let separator = "-".repeat(header_text.len().min(80));
                    current_layer.use_text(&separator, 12.0, margin_left, current_y, &font);
                    current_y -= Mm(6.0);

                    for row in rows {
                        let row_text = row.join(" | ");
                        current_layer.use_text(&row_text, 12.0, margin_left, current_y, &font);
                        current_y -= Mm(6.0);
                    }
                }

                PdfContent::PageBreak => {
                    // For simplicity, we'll skip actual page break implementation
                    // In a full implementation, you would create a new page here
                    current_y -= Mm(20.0);
                }

                PdfContent::Image {
                    path,
                    width: _,
                    height: _,
                } => {
                    // Image placeholder
                    let placeholder = format!("[Image: {}]", path);
                    current_layer.use_text(&placeholder, 12.0, margin_left, current_y, &font);
                    current_y -= Mm(6.0);
                }
            }

            // Check if we need a new page (simplified)
            if current_y < Mm(20.0) {
                current_y = page_height - Mm(20.0);
                // In a full implementation, create a new page here
            }
        }

        // Save to file
        let file = File::create(output_path)
            .map_err(|e| Error::Generic(format!("Failed to create PDF file: {}", e)))?;
        let mut buf_writer = BufWriter::new(file);

        doc.save(&mut buf_writer)
            .map_err(|e| Error::Generic(format!("Failed to save PDF: {}", e)))?;

        Ok(())
    }

    /// Simple helper to create a basic PDF with just paragraphs
    pub fn create_simple(
        &self,
        output_path: &str,
        title: Option<String>,
        author: Option<String>,
        paragraphs: Vec<String>,
    ) -> Result<()> {
        let config = PdfDocumentConfig {
            title,
            author,
            subject: None,
            page_size: Some("A4".to_string()),
        };

        let contents = paragraphs
            .into_iter()
            .map(|text| PdfContent::Paragraph {
                text,
                bold: None,
                italic: None,
                font_size: None,
                alignment: None,
            })
            .collect();

        self.create(output_path, config, contents)
    }
}

impl Default for PdfDocumentCreator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_create_simple_pdf() {
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("test.pdf");
        let output_path_str = output_path.to_str().unwrap();

        let creator = PdfDocumentCreator::new();
        let result = creator.create_simple(
            output_path_str,
            Some("Test PDF".to_string()),
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
    fn test_create_pdf_with_formatting() {
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("formatted.pdf");
        let output_path_str = output_path.to_str().unwrap();

        let creator = PdfDocumentCreator::new();
        let config = PdfDocumentConfig {
            title: Some("Formatted PDF".to_string()),
            author: Some("Test Author".to_string()),
            subject: None,
            page_size: Some("A4".to_string()),
        };

        let contents = vec![
            PdfContent::Heading {
                level: 1,
                text: "Main Heading".to_string(),
            },
            PdfContent::Paragraph {
                text: "Bold text".to_string(),
                bold: Some(true),
                italic: None,
                font_size: None,
                alignment: None,
            },
            PdfContent::BulletList {
                items: vec!["Item 1".to_string(), "Item 2".to_string()],
            },
        ];

        let result = creator.create(output_path_str, config, contents);
        assert!(result.is_ok());
        assert!(output_path.exists());
    }
}
