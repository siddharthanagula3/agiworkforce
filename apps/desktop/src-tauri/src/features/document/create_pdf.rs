use crate::sys::error::{Error, Result};
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
    pub page_size: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PdfContent {
    Heading {
        level: u8,
        text: String,
    },
    Paragraph {
        text: String,
        bold: Option<bool>,
        italic: Option<bool>,
        font_size: Option<u8>,
        alignment: Option<String>,
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

/// A flattened, renderable line ready to be placed on the page.
struct RenderLine {
    text: String,
    font_size: f32,
    bold: bool,
    /// Vertical space consumed after rendering this line (mm).
    advance: f32,
    /// If true, force a new page before rendering this line.
    force_new_page: bool,
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

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| Error::Generic(format!("Failed to create directory: {}", e)))?;
        }

        let (page_width, page_height) = match config.page_size.as_deref() {
            Some("Letter") => (215.9_f32, 279.4_f32),
            Some("Legal") => (215.9_f32, 355.6_f32),
            _ => (210.0_f32, 297.0_f32),
        };

        let title = config.title.as_deref().unwrap_or("Document");
        let (doc, page1, layer1) =
            PdfDocument::new(title, Mm(page_width), Mm(page_height), "Layer 1");

        let font = doc
            .add_builtin_font(BuiltinFont::Helvetica)
            .map_err(|e| Error::Generic(format!("Failed to add font: {}", e)))?;
        let font_bold = doc
            .add_builtin_font(BuiltinFont::HelveticaBold)
            .map_err(|e| Error::Generic(format!("Failed to add bold font: {}", e)))?;

        const MARGIN_TOP: f32 = 20.0;
        const MARGIN_BOTTOM: f32 = 20.0;
        const MARGIN_LEFT: f32 = 20.0;
        // approximate characters per line at 12pt on an A4 page
        const CHARS_PER_LINE: usize = 100;

        // Flatten all content blocks into renderable lines
        let mut lines: Vec<RenderLine> = Vec::new();

        for content in contents {
            match content {
                PdfContent::Heading { level, text } => {
                    let font_size: f32 = match level {
                        1 => 20.0,
                        2 => 16.0,
                        3 => 14.0,
                        _ => 12.0,
                    };
                    lines.push(RenderLine {
                        text,
                        font_size,
                        bold: true,
                        advance: font_size * 0.5 + 3.0,
                        force_new_page: false,
                    });
                }

                PdfContent::Paragraph {
                    text,
                    bold,
                    italic: _,
                    font_size,
                    alignment: _,
                } => {
                    let size = font_size.unwrap_or(12) as f32;
                    let is_bold = bold.unwrap_or(false);
                    let line_advance = size * 0.5 + 2.0;

                    // Word-wrap long text into individual render lines
                    let words: Vec<&str> = text.split_whitespace().collect();
                    let mut current = String::new();
                    for word in &words {
                        if current.len() + word.len() + 1 > CHARS_PER_LINE && !current.is_empty() {
                            lines.push(RenderLine {
                                text: current.clone(),
                                font_size: size,
                                bold: is_bold,
                                advance: line_advance,
                                force_new_page: false,
                            });
                            current.clear();
                        }
                        if !current.is_empty() {
                            current.push(' ');
                        }
                        current.push_str(word);
                    }
                    if !current.is_empty() {
                        lines.push(RenderLine {
                            text: current,
                            font_size: size,
                            bold: is_bold,
                            advance: line_advance,
                            force_new_page: false,
                        });
                    }
                    // Blank spacing after paragraph
                    lines.push(RenderLine {
                        text: String::new(),
                        font_size: size,
                        bold: false,
                        advance: 3.0,
                        force_new_page: false,
                    });
                }

                PdfContent::BulletList { items } => {
                    for item in items {
                        lines.push(RenderLine {
                            text: format!("• {}", item),
                            font_size: 12.0,
                            bold: false,
                            advance: 6.0,
                            force_new_page: false,
                        });
                    }
                    lines.push(RenderLine {
                        text: String::new(),
                        font_size: 12.0,
                        bold: false,
                        advance: 3.0,
                        force_new_page: false,
                    });
                }

                PdfContent::NumberedList { items } => {
                    for (idx, item) in items.iter().enumerate() {
                        lines.push(RenderLine {
                            text: format!("{}. {}", idx + 1, item),
                            font_size: 12.0,
                            bold: false,
                            advance: 6.0,
                            force_new_page: false,
                        });
                    }
                    lines.push(RenderLine {
                        text: String::new(),
                        font_size: 12.0,
                        bold: false,
                        advance: 3.0,
                        force_new_page: false,
                    });
                }

                PdfContent::Table { headers, rows } => {
                    let header_text = headers.join(" | ");
                    let separator = "-".repeat(header_text.len().min(80));
                    lines.push(RenderLine {
                        text: header_text,
                        font_size: 12.0,
                        bold: true,
                        advance: 6.0,
                        force_new_page: false,
                    });
                    lines.push(RenderLine {
                        text: separator,
                        font_size: 12.0,
                        bold: false,
                        advance: 6.0,
                        force_new_page: false,
                    });
                    for row in rows {
                        lines.push(RenderLine {
                            text: row.join(" | "),
                            font_size: 12.0,
                            bold: false,
                            advance: 6.0,
                            force_new_page: false,
                        });
                    }
                    lines.push(RenderLine {
                        text: String::new(),
                        font_size: 12.0,
                        bold: false,
                        advance: 3.0,
                        force_new_page: false,
                    });
                }

                PdfContent::PageBreak => {
                    // Mark the next real line with force_new_page; add a
                    // sentinel here so we can mark the *following* push.
                    lines.push(RenderLine {
                        text: String::new(),
                        font_size: 12.0,
                        bold: false,
                        advance: 0.0,
                        force_new_page: true,
                    });
                }

                PdfContent::Image {
                    path,
                    width: _,
                    height: _,
                } => {
                    lines.push(RenderLine {
                        text: format!("[Image: {}]", path),
                        font_size: 12.0,
                        bold: false,
                        advance: 6.0,
                        force_new_page: false,
                    });
                }
            }
        }

        // Render lines onto pages, adding new pages as needed
        let mut current_layer = doc.get_page(page1).get_layer(layer1);
        let mut current_y: f32 = page_height - MARGIN_TOP;

        for line in &lines {
            // Handle explicit page break
            if line.force_new_page {
                let (new_page, new_layer) =
                    doc.add_page(Mm(page_width), Mm(page_height), "Layer 1");
                current_layer = doc.get_page(new_page).get_layer(new_layer);
                current_y = page_height - MARGIN_TOP;
                continue;
            }

            // Automatic page break when content reaches the bottom margin
            if current_y < MARGIN_BOTTOM && line.advance > 0.0 {
                let (new_page, new_layer) =
                    doc.add_page(Mm(page_width), Mm(page_height), "Layer 1");
                current_layer = doc.get_page(new_page).get_layer(new_layer);
                current_y = page_height - MARGIN_TOP;
            }

            if !line.text.is_empty() {
                let selected_font = if line.bold { &font_bold } else { &font };
                current_layer.use_text(
                    &line.text,
                    line.font_size,
                    Mm(MARGIN_LEFT),
                    Mm(current_y),
                    selected_font,
                );
            }
            current_y -= line.advance;
        }

        let file = File::create(output_path)
            .map_err(|e| Error::Generic(format!("Failed to create PDF file: {}", e)))?;
        let mut buf_writer = BufWriter::new(file);

        doc.save(&mut buf_writer)
            .map_err(|e| Error::Generic(format!("Failed to save PDF: {}", e)))?;

        Ok(())
    }

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

    #[test]
    fn test_pagination_many_lines() {
        let temp_dir = TempDir::new().unwrap();
        let output_path = temp_dir.path().join("paginated.pdf");
        let output_path_str = output_path.to_str().unwrap();

        let creator = PdfDocumentCreator::new();
        // Generate enough paragraphs to overflow a single page
        let paragraphs: Vec<String> = (0..60)
            .map(|i| {
                format!(
                    "Line {} of content to test pagination across multiple pages.",
                    i
                )
            })
            .collect();
        let result = creator.create_simple(
            output_path_str,
            Some("Pagination Test".to_string()),
            None,
            paragraphs,
        );
        assert!(result.is_ok());
        assert!(output_path.exists());
    }
}
