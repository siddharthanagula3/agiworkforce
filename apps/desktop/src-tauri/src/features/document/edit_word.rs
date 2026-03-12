use docx_rs::*;
use serde::{Deserialize, Serialize};
use std::fs::File;

use crate::sys::error::{Error, Result};

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
        // Note: docx_rs can only create new documents, not parse existing ones.
        // In-place editing of Word documents (reading + modifying) is not yet supported.
        // The source file is acknowledged but content is not preserved.
        tracing::warn!(
            "Word document editing creates a new document from edits only. \
             Source file '{}' content is not preserved — in-place editing not yet supported by docx_rs.",
            file_path
        );

        // Verify source file exists (validates user input)
        if !std::path::Path::new(file_path).exists() {
            return Err(Error::Generic(format!(
                "Source file not found: {}",
                file_path
            )));
        }

        let mut docx = Docx::new();

        for edit in edits {
            docx = self.apply_edit(docx, edit)?;
        }

        docx.build()
            .pack(
                File::create(output_path)
                    .map_err(|e| Error::Generic(format!("Failed to create output file: {}", e)))?,
            )
            .map_err(|e| Error::Generic(format!("Failed to save document: {}", e)))?;

        Ok(())
    }

    fn apply_edit(&self, mut docx: Docx, edit: WordEdit) -> Result<Docx> {
        match edit {
            WordEdit::AppendParagraph { text } => {
                docx = docx.add_paragraph(Paragraph::new().add_run(Run::new().add_text(&text)));
            }
            WordEdit::InsertParagraph { index: _, text } => {
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
            WordEdit::ReplaceText { old_text, new_text } => {
                tracing::warn!(
                    "WordEdit::ReplaceText not yet implemented (old='{}', new='{}'). \
                     docx_rs does not support reading/modifying existing document content.",
                    old_text,
                    new_text
                );
            }
            WordEdit::DeleteParagraph { index } => {
                tracing::warn!(
                    "WordEdit::DeleteParagraph not yet implemented (index={}). \
                     docx_rs does not support reading/modifying existing document structure.",
                    index
                );
            }
            WordEdit::InsertTableRow {
                table_index,
                row_index,
                cells,
            } => {
                tracing::warn!(
                    "WordEdit::InsertTableRow not yet implemented (table={}, row={}, {} cells). \
                     docx_rs does not support modifying existing tables.",
                    table_index,
                    row_index,
                    cells.len()
                );
            }
            WordEdit::DeleteTableRow {
                table_index,
                row_index,
            } => {
                tracing::warn!(
                    "WordEdit::DeleteTableRow not yet implemented (table={}, row={}). \
                     docx_rs does not support modifying existing tables.",
                    table_index,
                    row_index
                );
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
        let _editor = WordEditor::new();
    }
}
