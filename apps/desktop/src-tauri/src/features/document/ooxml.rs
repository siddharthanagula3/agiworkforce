use std::io::{Cursor, Read};

use calamine::Reader;
use roxmltree::Document as XmlDocument;
use zip::read::ZipArchive;

use crate::sys::error::{Error, Result};

const WORD_NS: &str = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DRAWING_NS: &str = "http://schemas.openxmlformats.org/drawingml/2006/main";

pub fn is_office_open_xml_extension(extension: &str) -> bool {
    matches!(
        extension
            .trim_start_matches('.')
            .to_ascii_lowercase()
            .as_str(),
        "docx" | "xlsx" | "xls" | "pptx"
    )
}

pub fn extract_office_text(bytes: &[u8], extension: &str) -> Result<String> {
    match extension
        .trim_start_matches('.')
        .to_ascii_lowercase()
        .as_str()
    {
        "docx" => extract_docx_text(bytes),
        "xlsx" | "xls" => extract_spreadsheet_text(bytes),
        "pptx" => extract_pptx_text(bytes),
        other => Err(Error::Generic(format!(
            "Unsupported Office file type: {}",
            other
        ))),
    }
}

pub fn extract_docx_text(bytes: &[u8]) -> Result<String> {
    let xml = read_archive_entry(bytes, "word/document.xml", "DOCX")?;
    let document =
        XmlDocument::parse(&xml).map_err(|e| Error::Generic(format!("Invalid DOCX XML: {}", e)))?;

    let mut output = String::new();
    let mut last_was_newline = true;

    for node in document.descendants() {
        if !node.has_tag_name((WORD_NS, "p")) {
            continue;
        }
        if !last_was_newline {
            output.push('\n');
            last_was_newline = true;
        }
        for child in node.descendants() {
            if child.has_tag_name((WORD_NS, "t")) {
                if let Some(text) = child.text() {
                    output.push_str(text);
                    last_was_newline = false;
                }
            } else if child.has_tag_name((WORD_NS, "br")) {
                output.push('\n');
                last_was_newline = true;
            } else if child.has_tag_name((WORD_NS, "tab")) {
                output.push('\t');
                last_was_newline = false;
            }
        }
    }

    Ok(output)
}

pub fn extract_pptx_text(bytes: &[u8]) -> Result<String> {
    let mut archive = open_archive(bytes, "PPTX")?;

    let mut slides: Vec<(usize, String)> = archive
        .file_names()
        .filter(|name: &&str| name.starts_with("ppt/slides/slide") && name.ends_with(".xml"))
        .map(|name| (slide_number(name), name.to_string()))
        .collect();
    slides.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

    if slides.is_empty() {
        return Err(Error::Generic(
            "Invalid PPTX: no slides found in ppt/slides".to_string(),
        ));
    }

    let mut output = String::new();
    for (number, name) in slides {
        let mut xml = String::new();
        archive
            .by_name(&name)
            .map_err(|e| Error::Generic(format!("Failed to read {}: {}", name, e)))?
            .read_to_string(&mut xml)
            .map_err(|e| Error::Generic(format!("Failed to load {}: {}", name, e)))?;

        let document = XmlDocument::parse(&xml)
            .map_err(|e| Error::Generic(format!("Invalid PPTX XML in {}: {}", name, e)))?;

        let mut slide_text = String::new();
        for paragraph in document
            .descendants()
            .filter(|node| node.has_tag_name((DRAWING_NS, "p")))
        {
            let line: String = paragraph
                .descendants()
                .filter(|node| node.has_tag_name((DRAWING_NS, "t")))
                .filter_map(|node| node.text())
                .collect();
            if !line.trim().is_empty() {
                slide_text.push_str(line.trim());
                slide_text.push('\n');
            }
        }

        if slide_text.is_empty() {
            continue;
        }

        output.push_str(&format!("Slide {}\n{}\n", number, slide_text));
    }

    Ok(output.trim_end().to_string())
}

pub fn extract_spreadsheet_text(bytes: &[u8]) -> Result<String> {
    let mut workbook = calamine::open_workbook_auto_from_rs(Cursor::new(bytes))
        .map_err(|e| Error::Generic(format!("Failed to open spreadsheet: {}", e)))?;

    let mut output = String::new();
    for sheet_name in workbook.sheet_names().to_owned() {
        let Ok(range) = workbook.worksheet_range(&sheet_name) else {
            continue;
        };

        if !output.is_empty() {
            output.push_str("\n\n");
        }
        output.push_str(&format!("Sheet: {}\n", sheet_name));

        for row in range.rows() {
            let line = row
                .iter()
                .map(|cell| cell.to_string())
                .collect::<Vec<_>>()
                .join("\t")
                .trim()
                .to_string();
            if !line.is_empty() {
                output.push_str(&line);
                output.push('\n');
            }
        }
    }

    Ok(output.trim().to_string())
}

fn open_archive<'a>(bytes: &'a [u8], label: &str) -> Result<ZipArchive<Cursor<&'a [u8]>>> {
    ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| Error::Generic(format!("Invalid {} archive: {}", label, e)))
}

fn read_archive_entry(bytes: &[u8], entry: &str, label: &str) -> Result<String> {
    let mut archive = open_archive(bytes, label)?;
    let mut contents = String::new();
    archive
        .by_name(entry)
        .map_err(|_| Error::Generic(format!("Invalid {}: missing {}", label, entry)))?
        .read_to_string(&mut contents)
        .map_err(|e| Error::Generic(format!("Failed to load {}: {}", entry, e)))?;
    Ok(contents)
}

fn slide_number(name: &str) -> usize {
    name.trim_start_matches("ppt/slides/slide")
        .trim_end_matches(".xml")
        .parse()
        .unwrap_or(usize::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn zip_with(entries: &[(&str, &str)]) -> Vec<u8> {
        let mut buffer = Vec::new();
        {
            let mut writer = zip::ZipWriter::new(Cursor::new(&mut buffer));
            let options =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
            for (name, contents) in entries {
                writer.start_file(*name, options).unwrap();
                writer.write_all(contents.as_bytes()).unwrap();
            }
            writer.finish().unwrap();
        }
        buffer
    }

    #[test]
    fn extracts_docx_paragraph_text() {
        let docx = zip_with(&[(
            "word/document.xml",
            r#"<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Quarterly plan</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second line</w:t></w:r></w:p>
  </w:body>
</w:document>"#,
        )]);

        let text = extract_docx_text(&docx).unwrap();
        assert!(text.contains("Quarterly plan"));
        assert!(text.contains("Second line"));
    }

    #[test]
    fn extracts_pptx_slides_in_order() {
        let pptx = zip_with(&[
            (
                "ppt/slides/slide10.xml",
                r#"<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>Last slide</a:t></a:r></a:p></p:sld>"#,
            ),
            (
                "ppt/slides/slide2.xml",
                r#"<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>Middle slide</a:t></a:r></a:p></p:sld>"#,
            ),
        ]);

        let text = extract_pptx_text(&pptx).unwrap();
        assert!(text.find("Middle slide").unwrap() < text.find("Last slide").unwrap());
        assert!(text.contains("Slide 2"));
        assert!(text.contains("Slide 10"));
    }

    #[test]
    fn rejects_non_office_bytes() {
        assert!(extract_docx_text(b"not a zip").is_err());
    }

    #[test]
    fn routes_by_extension() {
        assert!(is_office_open_xml_extension(".docx"));
        assert!(is_office_open_xml_extension("PPTX"));
        assert!(!is_office_open_xml_extension("pdf"));
        assert!(extract_office_text(b"", "rtf").is_err());
    }
}
