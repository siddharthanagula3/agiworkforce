use std::io::{Cursor, Read};
use std::ops::RangeInclusive;
use std::path::Path;

use anyhow::{anyhow, bail, Context, Result};
use calamine::Reader;
use roxmltree::Document as XmlDocument;
use zip::read::ZipArchive;

const WORD_NS: &str = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DRAWING_NS: &str = "http://schemas.openxmlformats.org/drawingml/2006/main";
pub const DEFAULT_PDF_PAGES: usize = 10;
pub const MAX_PDF_PAGES_PER_READ: usize = 20;
pub const MAX_ATTACHED_PDF_PAGES: usize = 100;
pub const MAX_DOCUMENT_BYTES: u64 = 32 * 1024 * 1024;
const MAX_UNPACKED_BYTES: u64 = 128 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 10_000;
const MAX_TEXT_CHARS: usize = 400_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocumentKind {
    Pdf,
    Word,
    Slides,
    Spreadsheet,
}

impl DocumentKind {
    pub fn for_path(path: &Path) -> Option<Self> {
        let extension = path.extension()?.to_str()?.to_ascii_lowercase();
        match extension.as_str() {
            "pdf" => Some(Self::Pdf),
            "docx" => Some(Self::Word),
            "pptx" => Some(Self::Slides),
            "xlsx" | "xlsm" | "xls" | "ods" => Some(Self::Spreadsheet),
            _ => None,
        }
    }

    pub fn mime(self, path: &Path) -> String {
        match self {
            Self::Pdf => "application/pdf".to_string(),
            _ => mime_guess::from_path(path)
                .first_or_octet_stream()
                .essence_str()
                .to_string(),
        }
    }
}

pub struct ExtractedDocument {
    pub text: String,
    pub note: Option<String>,
}

pub fn untrusted(name: &str, text: &str) -> String {
    let name = name.replace(['"', '<', '>', '\n'], "_");
    format!("<document_result untrusted=\"true\" path=\"{name}\">\n{text}\n</document_result>")
}

pub async fn extract(
    path: &Path,
    kind: DocumentKind,
    pages: Option<&str>,
) -> Result<ExtractedDocument> {
    let size = tokio::fs::metadata(path)
        .await
        .with_context(|| format!("could not read {}", path.display()))?
        .len();
    if size > MAX_DOCUMENT_BYTES {
        bail!(
            "the file is {} MB; documents up to {} MB can be read",
            size / (1024 * 1024),
            MAX_DOCUMENT_BYTES / (1024 * 1024)
        );
    }
    let bytes = tokio::fs::read(path)
        .await
        .with_context(|| format!("could not read {}", path.display()))?;
    let pages = pages.map(parse_page_range).transpose()?;
    tokio::task::spawn_blocking(move || {
        std::panic::catch_unwind(|| extract_bytes(&bytes, kind, pages))
            .unwrap_or_else(|_| Err(anyhow!("the file could not be parsed")))
    })
    .await?
}

pub fn extract_bytes(
    bytes: &[u8],
    kind: DocumentKind,
    pages: Option<RangeInclusive<usize>>,
) -> Result<ExtractedDocument> {
    if bytes.len() as u64 > MAX_DOCUMENT_BYTES {
        bail!(
            "the file is larger than {} MB",
            MAX_DOCUMENT_BYTES / (1024 * 1024)
        );
    }
    if bytes.starts_with(b"PK") {
        check_archive(bytes)?;
    }
    let mut document = match kind {
        DocumentKind::Pdf => pdf_text(bytes, pages)?,
        DocumentKind::Word => whole(docx_text(bytes)?),
        DocumentKind::Slides => whole(pptx_text(bytes)?),
        DocumentKind::Spreadsheet => whole(spreadsheet_text(bytes)?),
    };
    if let Some((cut, _)) = document.text.char_indices().nth(MAX_TEXT_CHARS) {
        document.text.truncate(cut);
        document.note = Some(format!(
            "[text cut at {MAX_TEXT_CHARS} characters]{}",
            document
                .note
                .map(|note| format!(" {note}"))
                .unwrap_or_default()
        ));
    }
    Ok(document)
}

fn whole(text: String) -> ExtractedDocument {
    ExtractedDocument { text, note: None }
}

fn check_archive(bytes: &[u8]) -> Result<()> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).context("the file is not a valid Office document")?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        bail!("the document holds too many parts to read");
    }
    let mut unpacked: u64 = 0;
    for index in 0..archive.len() {
        unpacked = unpacked.saturating_add(archive.by_index_raw(index)?.size());
        if unpacked > MAX_UNPACKED_BYTES {
            bail!(
                "the document unpacks to more than {} MB",
                MAX_UNPACKED_BYTES / (1024 * 1024)
            );
        }
    }
    Ok(())
}

fn parse_page_range(raw: &str) -> Result<RangeInclusive<usize>> {
    let raw = raw.trim();
    let (start, end) = raw.split_once('-').unwrap_or((raw, raw));
    let start: usize = start
        .trim()
        .parse()
        .context("pages must look like 3 or 1-5")?;
    let end: usize = end
        .trim()
        .parse()
        .context("pages must look like 3 or 1-5")?;
    if start == 0 || end < start {
        bail!("pages must look like 3 or 1-5, counting from 1");
    }
    if end - start + 1 > MAX_PDF_PAGES_PER_READ {
        bail!("read at most {MAX_PDF_PAGES_PER_READ} pages at a time");
    }
    Ok(start..=end)
}

fn pdf_text(bytes: &[u8], pages: Option<RangeInclusive<usize>>) -> Result<ExtractedDocument> {
    let unreadable = |error: &dyn std::fmt::Display| anyhow!("the PDF could not be read: {error}");
    let mut doc = pdf_extract::Document::load_mem(bytes).map_err(|error| unreadable(&error))?;
    if doc.is_encrypted() {
        doc.decrypt("")
            .map_err(|_| anyhow!("the PDF is password protected"))?;
    }
    let total = doc.get_pages().len();
    let requested = pages.clone();
    let range = pages.unwrap_or(1..=DEFAULT_PDF_PAGES.min(total.max(1)));
    if *range.start() > total {
        bail!("the PDF has {total} pages");
    }
    let end = (*range.end()).min(total);
    let mut selected = Vec::with_capacity(end + 1 - range.start());
    for number in *range.start()..=end {
        let mut page = String::new();
        pdf_extract::output_doc_page(
            &doc,
            &mut pdf_extract::PlainTextOutput::new(&mut page),
            number as u32,
        )
        .map_err(|error| unreadable(&error))?;
        selected.push(page);
    }
    let mut text = String::new();
    for (offset, page) in selected.iter().enumerate() {
        text.push_str(&format!(
            "Page {}\n{}\n\n",
            range.start() + offset,
            page.trim()
        ));
    }
    let note = if requested.is_none() && total > end {
        Some(format!(
            "[pages 1-{end} of {total}; pass pages (for example {}-{}) to read more, at most {MAX_PDF_PAGES_PER_READ} at a time]",
            end + 1,
            (end + DEFAULT_PDF_PAGES).min(total)
        ))
    } else if total > end || *range.start() > 1 {
        Some(format!("[pages {}-{end} of {total}]", range.start()))
    } else {
        None
    };
    if selected.iter().all(|page| page.trim().is_empty()) {
        return Ok(ExtractedDocument {
            text: format!(
                "[no extractable text on pages {}-{end}; the PDF may be scanned images]",
                range.start()
            ),
            note,
        });
    }
    Ok(ExtractedDocument {
        text: text.trim_end().to_string(),
        note,
    })
}

fn docx_text(bytes: &[u8]) -> Result<String> {
    let xml = archive_entry(bytes, "word/document.xml")?;
    let document = XmlDocument::parse(&xml).context("the Word document is not valid")?;
    let mut output = String::new();
    for paragraph in document
        .descendants()
        .filter(|node| node.has_tag_name((WORD_NS, "p")))
    {
        for child in paragraph.descendants() {
            if child.has_tag_name((WORD_NS, "t")) {
                output.push_str(child.text().unwrap_or_default());
            } else if child.has_tag_name((WORD_NS, "br")) {
                output.push('\n');
            } else if child.has_tag_name((WORD_NS, "tab")) {
                output.push('\t');
            }
        }
        output.push('\n');
    }
    Ok(output.trim_end().to_string())
}

fn pptx_text(bytes: &[u8]) -> Result<String> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).context("the presentation is not valid")?;
    let mut slides: Vec<(usize, String)> = archive
        .file_names()
        .filter(|name| name.starts_with("ppt/slides/slide") && name.ends_with(".xml"))
        .map(|name| {
            let number = name
                .trim_start_matches("ppt/slides/slide")
                .trim_end_matches(".xml")
                .parse()
                .unwrap_or(usize::MAX);
            (number, name.to_string())
        })
        .collect();
    slides.sort();
    let mut output = String::new();
    for (number, name) in slides {
        let mut xml = String::new();
        archive
            .by_name(&name)?
            .take(MAX_UNPACKED_BYTES)
            .read_to_string(&mut xml)?;
        let document = XmlDocument::parse(&xml).context("the presentation is not valid")?;
        let lines: Vec<String> = document
            .descendants()
            .filter(|node| node.has_tag_name((DRAWING_NS, "p")))
            .map(|paragraph| {
                paragraph
                    .descendants()
                    .filter(|node| node.has_tag_name((DRAWING_NS, "t")))
                    .filter_map(|node| node.text())
                    .collect::<String>()
                    .trim()
                    .to_string()
            })
            .filter(|line| !line.is_empty())
            .collect();
        if !lines.is_empty() {
            output.push_str(&format!("Slide {number}\n{}\n\n", lines.join("\n")));
        }
    }
    Ok(output.trim_end().to_string())
}

fn spreadsheet_text(bytes: &[u8]) -> Result<String> {
    let mut workbook = calamine::open_workbook_auto_from_rs(Cursor::new(bytes))
        .map_err(|error| anyhow!("the spreadsheet could not be opened: {error}"))?;
    let mut output = String::new();
    for sheet in workbook.sheet_names().to_owned() {
        let Ok(range) = workbook.worksheet_range(&sheet) else {
            continue;
        };
        output.push_str(&format!("Sheet: {sheet}\n"));
        for row in range.rows() {
            let line = row
                .iter()
                .map(|cell| cell.to_string())
                .collect::<Vec<_>>()
                .join("\t");
            if !line.trim().is_empty() {
                output.push_str(line.trim_end());
                output.push('\n');
            }
        }
        output.push('\n');
    }
    Ok(output.trim_end().to_string())
}

fn archive_entry(bytes: &[u8], entry: &str) -> Result<String> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).context("the file is not a valid Office document")?;
    let mut contents = String::new();
    archive
        .by_name(entry)
        .with_context(|| format!("the file is missing {entry}"))?
        .take(MAX_UNPACKED_BYTES)
        .read_to_string(&mut contents)?;
    Ok(contents)
}
