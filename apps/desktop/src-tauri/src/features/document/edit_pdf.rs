use anyhow::Result;
use lopdf::{Document, Object, ObjectId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PdfEdit {
    AppendText {
        text: String,
        page: Option<u32>,
    },
    InsertText {
        text: String,
        page: u32,
        x: f32,
        y: f32,
    },
    DeletePage {
        page: u32,
    },
    MergePages {
        source_path: String,
    },
    AddWatermark {
        text: String,
    },
}

pub struct PdfEditor;

impl Default for PdfEditor {
    fn default() -> Self {
        Self::new()
    }
}

impl PdfEditor {
    pub fn new() -> Self {
        Self
    }

    /// Apply multiple edits to a PDF file
    pub fn edit_pdf(&self, file_path: &str, edits: Vec<PdfEdit>, output_path: &str) -> Result<()> {
        let mut doc = Document::load(file_path)?;

        for edit in edits {
            match edit {
                PdfEdit::AppendText { text, page } => {
                    let page_num = page.unwrap_or(1);
                    self.add_text_to_page(&mut doc, page_num, &text, 72.0, 72.0)?;
                }
                PdfEdit::InsertText { text, page, x, y } => {
                    self.add_text_to_page(&mut doc, page, &text, x, y)?;
                }
                PdfEdit::DeletePage { page } => {
                    self.delete_page_internal(&mut doc, page)?;
                }
                PdfEdit::MergePages { source_path } => {
                    let source_doc = Document::load(&source_path)?;
                    self.merge_documents(&mut doc, source_doc)?;
                }
                PdfEdit::AddWatermark { text } => {
                    self.add_watermark_to_all_pages(&mut doc, &text)?;
                }
            }
        }

        doc.save(output_path)?;
        tracing::info!("PDF saved to: {}", output_path);
        Ok(())
    }

    /// Add text to a specific page at given coordinates
    fn add_text_to_page(
        &self,
        doc: &mut Document,
        page_num: u32,
        text: &str,
        x: f32,
        y: f32,
    ) -> Result<()> {
        let pages = doc.get_pages();
        let page_id = pages
            .get(&page_num)
            .ok_or_else(|| anyhow::anyhow!("Page {} not found", page_num))?;

        // Create text content stream
        let content = format!(
            "BT /F1 12 Tf {} {} Td ({}) Tj ET",
            x,
            y,
            Self::escape_pdf_string(text)
        );

        // Get page object
        let page_dict = doc
            .get_object(*page_id)?
            .as_dict()
            .map_err(|_| anyhow::anyhow!("Invalid page object"))?
            .clone();

        // Ensure Font resource exists
        self.ensure_font_resource(doc, *page_id)?;

        // Add content stream to page
        let content_id = doc.add_object(Object::Stream(lopdf::Stream::new(
            lopdf::Dictionary::new(),
            content.as_bytes().to_vec(),
        )));

        // Append to existing contents
        if let Ok(existing_contents) = page_dict.get(b"Contents") {
            let mut contents_array = match existing_contents {
                Object::Reference(ref_id) => vec![Object::Reference(*ref_id)],
                Object::Array(arr) => arr.clone(),
                _ => vec![],
            };
            contents_array.push(Object::Reference(content_id));

            if let Ok(page_obj) = doc.get_object_mut(*page_id) {
                if let Ok(dict) = page_obj.as_dict_mut() {
                    dict.set("Contents", Object::Array(contents_array));
                }
            }
        } else if let Ok(page_obj) = doc.get_object_mut(*page_id) {
            if let Ok(dict) = page_obj.as_dict_mut() {
                dict.set("Contents", Object::Reference(content_id));
            }
        }

        tracing::debug!("Added text to page {}", page_num);
        Ok(())
    }

    /// Ensure the page has a font resource
    fn ensure_font_resource(&self, doc: &mut Document, page_id: ObjectId) -> Result<()> {
        // Create a basic font dictionary
        let mut font_dict = lopdf::Dictionary::new();
        font_dict.set("Type", Object::Name(b"Font".to_vec()));
        font_dict.set("Subtype", Object::Name(b"Type1".to_vec()));
        font_dict.set("BaseFont", Object::Name(b"Helvetica".to_vec()));

        let font_id = doc.add_object(Object::Dictionary(font_dict));

        // Add to page resources
        if let Ok(page_obj) = doc.get_object_mut(page_id) {
            if let Ok(page_dict) = page_obj.as_dict_mut() {
                let mut resources = page_dict
                    .get(b"Resources")
                    .ok()
                    .and_then(|r| r.as_dict().ok())
                    .cloned()
                    .unwrap_or_else(lopdf::Dictionary::new);

                let mut font_resources = resources
                    .get(b"Font")
                    .ok()
                    .and_then(|f| f.as_dict().ok())
                    .cloned()
                    .unwrap_or_else(lopdf::Dictionary::new);

                font_resources.set("F1", Object::Reference(font_id));
                resources.set("Font", Object::Dictionary(font_resources));
                page_dict.set("Resources", Object::Dictionary(resources));
            }
        }

        Ok(())
    }

    /// Delete a page from the document
    fn delete_page_internal(&self, doc: &mut Document, page_num: u32) -> Result<()> {
        let pages = doc.get_pages();
        if !pages.contains_key(&page_num) {
            return Err(anyhow::anyhow!("Page {} not found", page_num));
        }

        doc.delete_pages(&[page_num]);
        tracing::debug!("Deleted page {}", page_num);
        Ok(())
    }

    /// Add watermark text to all pages
    fn add_watermark_to_all_pages(&self, doc: &mut Document, text: &str) -> Result<()> {
        let pages: Vec<u32> = doc.get_pages().keys().cloned().collect();

        for page_num in pages {
            // Add watermark as diagonal text
            let watermark_content = format!(
                "q 0.5 g BT /F1 48 Tf 0.3 0 0 0.3 200 400 Tm ({}) Tj ET Q",
                Self::escape_pdf_string(text)
            );

            // Get page_id in a separate scope to avoid borrow issues
            let page_id = {
                let pages_map = doc.get_pages();
                *pages_map
                    .get(&page_num)
                    .ok_or_else(|| anyhow::anyhow!("Page {} not found", page_num))?
            };

            self.ensure_font_resource(doc, page_id)?;

            let content_id = doc.add_object(Object::Stream(lopdf::Stream::new(
                lopdf::Dictionary::new(),
                watermark_content.as_bytes().to_vec(),
            )));

            // Prepend watermark content (so it appears behind existing content)
            let page_dict = doc
                .get_object(page_id)?
                .as_dict()
                .map_err(|_| anyhow::anyhow!("Invalid page object"))?
                .clone();

            if let Ok(existing_contents) = page_dict.get(b"Contents") {
                let mut contents_array = vec![Object::Reference(content_id)];
                match existing_contents {
                    Object::Reference(ref_id) => contents_array.push(Object::Reference(*ref_id)),
                    Object::Array(arr) => contents_array.extend(arr.clone()),
                    _ => {}
                };

                if let Ok(page_obj) = doc.get_object_mut(page_id) {
                    if let Ok(dict) = page_obj.as_dict_mut() {
                        dict.set("Contents", Object::Array(contents_array));
                    }
                }
            }
        }

        tracing::debug!("Added watermark to all pages");
        Ok(())
    }

    /// Merge another document's pages into this document
    fn merge_documents(&self, target: &mut Document, source: Document) -> Result<()> {
        // Get source pages
        let source_pages = source.get_pages();

        // Map old object IDs to new ones
        let mut id_map: BTreeMap<ObjectId, ObjectId> = BTreeMap::new();

        // Copy all objects from source
        for (id, object) in source.objects.iter() {
            let new_id = target.add_object(object.clone());
            id_map.insert(*id, new_id);
        }

        // Update references in copied objects
        for (_old_id, new_id) in id_map.iter() {
            if let Ok(obj) = target.get_object_mut(*new_id) {
                Self::update_object_references(obj, &id_map);
            }
        }

        // Add source pages to target's page tree
        for (_page_num, page_id) in source_pages.iter() {
            if let Some(new_page_id) = id_map.get(page_id) {
                // Get target's pages object
                if let Ok(catalog) = target.catalog() {
                    if let Ok(pages_ref) = catalog.get(b"Pages") {
                        if let Object::Reference(pages_id) = pages_ref {
                            if let Ok(pages_obj) = target.get_object_mut(*pages_id) {
                                if let Ok(pages_dict) = pages_obj.as_dict_mut() {
                                    if let Ok(kids) = pages_dict.get_mut(b"Kids") {
                                        if let Object::Array(ref mut kids_array) = kids {
                                            kids_array.push(Object::Reference(*new_page_id));
                                        }
                                    }
                                    // Update count
                                    if let Ok(count) = pages_dict.get(b"Count") {
                                        if let Ok(c) = count.as_i64() {
                                            pages_dict.set("Count", Object::Integer(c + 1));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        tracing::debug!("Merged {} pages from source document", source_pages.len());
        Ok(())
    }

    /// Recursively update object references using the ID map
    fn update_object_references(obj: &mut Object, id_map: &BTreeMap<ObjectId, ObjectId>) {
        match obj {
            Object::Reference(ref mut id) => {
                if let Some(new_id) = id_map.get(id) {
                    *id = *new_id;
                }
            }
            Object::Array(arr) => {
                for item in arr.iter_mut() {
                    Self::update_object_references(item, id_map);
                }
            }
            Object::Dictionary(dict) => {
                for (_, value) in dict.iter_mut() {
                    Self::update_object_references(value, id_map);
                }
            }
            Object::Stream(stream) => {
                for (_, value) in stream.dict.iter_mut() {
                    Self::update_object_references(value, id_map);
                }
            }
            _ => {}
        }
    }

    /// Escape special characters in PDF strings
    fn escape_pdf_string(text: &str) -> String {
        text.replace('\\', "\\\\")
            .replace('(', "\\(")
            .replace(')', "\\)")
    }

    /// Append text to the last page of a PDF
    pub fn append_text(&self, file_path: &str, text: &str, output_path: &str) -> Result<()> {
        let mut doc = Document::load(file_path)?;
        let pages = doc.get_pages();
        let last_page = *pages
            .keys()
            .max()
            .ok_or_else(|| anyhow::anyhow!("No pages found"))?;

        self.add_text_to_page(&mut doc, last_page, text, 72.0, 72.0)?;
        doc.save(output_path)?;

        tracing::info!("Appended text to PDF, saved to: {}", output_path);
        Ok(())
    }

    /// Merge multiple PDF files into one
    pub fn merge_pdfs(&self, pdf_paths: Vec<String>, output_path: &str) -> Result<()> {
        if pdf_paths.is_empty() {
            return Err(anyhow::anyhow!("No PDF files to merge"));
        }

        let mut target = Document::load(&pdf_paths[0])?;

        for path in pdf_paths.iter().skip(1) {
            let source = Document::load(path)?;
            self.merge_documents(&mut target, source)?;
        }

        target.save(output_path)?;
        tracing::info!("Merged {} PDFs into: {}", pdf_paths.len(), output_path);
        Ok(())
    }

    /// Add a watermark to all pages of a PDF
    pub fn add_watermark(
        &self,
        file_path: &str,
        watermark_text: &str,
        output_path: &str,
    ) -> Result<()> {
        let mut doc = Document::load(file_path)?;
        self.add_watermark_to_all_pages(&mut doc, watermark_text)?;
        doc.save(output_path)?;

        tracing::info!("Added watermark to PDF, saved to: {}", output_path);
        Ok(())
    }

    /// Extract a range of pages from a PDF
    pub fn extract_pages(
        &self,
        file_path: &str,
        start_page: u32,
        end_page: u32,
        output_path: &str,
    ) -> Result<()> {
        let doc = Document::load(file_path)?;
        let pages = doc.get_pages();

        // Validate page range
        let max_page = *pages
            .keys()
            .max()
            .ok_or_else(|| anyhow::anyhow!("No pages found"))?;
        if start_page < 1 || end_page > max_page || start_page > end_page {
            return Err(anyhow::anyhow!(
                "Invalid page range: {}-{} (document has {} pages)",
                start_page,
                end_page,
                max_page
            ));
        }

        // Collect page numbers to delete (everything outside the range)
        let pages_to_delete: Vec<u32> = pages
            .keys()
            .filter(|page_num| **page_num < start_page || **page_num > end_page)
            .cloned()
            .collect();

        let mut output_doc = doc.clone();
        output_doc.delete_pages(&pages_to_delete);
        output_doc.save(output_path)?;

        tracing::info!(
            "Extracted pages {}-{} from PDF, saved to: {}",
            start_page,
            end_page,
            output_path
        );
        Ok(())
    }

    /// Get the number of pages in a PDF
    pub fn get_page_count(&self, file_path: &str) -> Result<u32> {
        let doc = Document::load(file_path)?;
        let count = doc.get_pages().len() as u32;
        Ok(count)
    }

    /// Delete specific pages from a PDF
    pub fn delete_pages(&self, file_path: &str, pages: &[u32], output_path: &str) -> Result<()> {
        let mut doc = Document::load(file_path)?;
        let all_pages = doc.get_pages();

        // Validate page numbers
        for page in pages {
            if !all_pages.contains_key(page) {
                return Err(anyhow::anyhow!("Page {} not found", page));
            }
        }

        doc.delete_pages(pages);
        doc.save(output_path)?;

        tracing::info!(
            "Deleted {} pages from PDF, saved to: {}",
            pages.len(),
            output_path
        );
        Ok(())
    }

    /// Rotate pages in a PDF
    pub fn rotate_pages(
        &self,
        file_path: &str,
        pages: &[u32],
        rotation: i32,
        output_path: &str,
    ) -> Result<()> {
        let mut doc = Document::load(file_path)?;
        let all_pages = doc.get_pages();

        // Normalize rotation to 0, 90, 180, or 270
        let normalized_rotation = ((rotation % 360) + 360) % 360;
        if normalized_rotation != 0
            && normalized_rotation != 90
            && normalized_rotation != 180
            && normalized_rotation != 270
        {
            return Err(anyhow::anyhow!("Rotation must be a multiple of 90 degrees"));
        }

        for page_num in pages {
            if let Some(page_id) = all_pages.get(page_num) {
                if let Ok(page_obj) = doc.get_object_mut(*page_id) {
                    if let Ok(page_dict) = page_obj.as_dict_mut() {
                        page_dict.set("Rotate", Object::Integer(normalized_rotation as i64));
                    }
                }
            }
        }

        doc.save(output_path)?;
        tracing::info!(
            "Rotated {} pages by {} degrees, saved to: {}",
            pages.len(),
            normalized_rotation,
            output_path
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pdf_editor_creation() {
        let _editor = PdfEditor::new();
    }

    #[test]
    fn test_escape_pdf_string() {
        assert_eq!(PdfEditor::escape_pdf_string("hello"), "hello");
        assert_eq!(PdfEditor::escape_pdf_string("(test)"), "\\(test\\)");
        assert_eq!(PdfEditor::escape_pdf_string("back\\slash"), "back\\\\slash");
    }
}
