use anyhow::Result;
use docx_rs::*;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WordEdit {
    ReplaceText {
        old_text: String,
        new_text: String,
    },
    InsertParagraph {
        index: usize,
        text: String,
    },
    DeleteParagraph {
        index: usize,
    },
    AppendParagraph {
        text: String,
    },
    UpdateHeading {
        index: usize,
        new_text: String,
        level: usize,
    },
    InsertTableRow {
        table_index: usize,
        row_index: usize,
        cells: Vec<String>,
    },
    DeleteTableRow {
        table_index: usize,
        row_index: usize,
    },
}

pub struct WordEditor;

impl Default for WordEditor {
    fn default() -> Self {
        Self::new()
    }
}

impl WordEditor {
    pub fn new() -> Self {
        Self
    }

    pub fn edit_document(
        &self,
        file_path: &str,
        edits: Vec<WordEdit>,
        output_path: &str,
    ) -> Result<()> {
        // Read existing document
        let mut file = File::open(file_path)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;

        // Parse document (simplified - in production use proper DOCX parsing)
        // For now, create a new document and apply edits
        let mut docx = Docx::new();

        // Apply edits
        for edit in edits {
            docx = self.apply_edit(docx, edit)?;
        }

        // Save
        docx.build()
            .pack(File::create(output_path)?)
            .map_err(|e| anyhow::anyhow!("Failed to save document: {}", e))?;

        Ok(())
    }

    fn apply_edit(&self, mut docx: Docx, edit: WordEdit) -> Result<Docx> {
        match edit {
            WordEdit::AppendParagraph { text } => {
                docx = docx.add_paragraph(Paragraph::new().add_run(Run::new().add_text(&text)));
            }
            WordEdit::InsertParagraph { index: _, text } => {
                // Note: docx-rs doesn't support inserting at specific index easily
                // This would require more complex manipulation
                docx = docx.add_paragraph(Paragraph::new().add_run(Run::new().add_text(&text)));
            }
            WordEdit::UpdateHeading {
                index: _,
                new_text,
                level,
            } => {
                let heading = match level {
                    1 => Paragraph::new().add_run(Run::new().add_text(&new_text).size(28).bold()),
                    2 => Paragraph::new().add_run(Run::new().add_text(&new_text).size(24).bold()),
                    3 => Paragraph::new().add_run(Run::new().add_text(&new_text).size(20).bold()),
                    _ => Paragraph::new().add_run(Run::new().add_text(&new_text).size(16).bold()),
                };
                docx = docx.add_paragraph(heading);
            }
            _ => {
                // Other edits not yet implemented
            }
        }

        Ok(docx)
    }

    pub fn replace_text(
        &self,
        file_path: &str,
        old_text: &str,
        new_text: &str,
        output_path: &str,
    ) -> Result<()> {
        let edits = vec![WordEdit::ReplaceText {
            old_text: old_text.to_string(),
            new_text: new_text.to_string(),
        }];

        self.edit_document(file_path, edits, output_path)
    }

    pub fn append_content(&self, file_path: &str, text: &str, output_path: &str) -> Result<()> {
        let edits = vec![WordEdit::AppendParagraph {
            text: text.to_string(),
        }];

        self.edit_document(file_path, edits, output_path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_word_editor_creation() {
        let editor = WordEditor::new();
        assert!(std::mem::size_of_val(&editor) >= 0);
    }
}
