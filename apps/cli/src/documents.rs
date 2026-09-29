use std::io::{Cursor, Read, Write};
use std::ops::RangeInclusive;
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use calamine::Reader;
use roxmltree::Document as XmlDocument;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use zip::read::ZipArchive;

const WORD_NS: &str = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DRAWING_NS: &str = "http://schemas.openxmlformats.org/drawingml/2006/main";
pub const EXTRACT_COMMAND: &str = "__extract-document";
pub const DEFAULT_PDF_PAGES: usize = 10;
pub const MAX_PDF_PAGES_PER_READ: usize = 20;
pub const MAX_ATTACHED_PDF_PAGES: usize = 100;
const MAX_UNPACKED_BYTES: u64 = 128 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 10_000;
const MAX_COMPRESSION_RATIO: u64 = 100;
const MAX_TEXT_CHARS: usize = 400_000;
const MAX_OUTPUT_BYTES: u64 = (MAX_TEXT_CHARS as u64) * 6 + 64 * 1024;
const CHILD_ENVIRONMENT: [&str; 5] = ["PATH", "HOME", "TMPDIR", "LANG", "SYSTEMROOT"];
const EXTRACT_TIMEOUT: Duration = Duration::from_secs(20);
#[cfg(target_os = "linux")]
const EXTRACT_MEMORY_BYTES: u64 = 1024 * 1024 * 1024;
const UNREADABLE: &str = "couldn't read this document";

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

    fn label(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Word => "word",
            Self::Slides => "slides",
            Self::Spreadsheet => "spreadsheet",
        }
    }

    fn from_label(label: &str) -> Option<Self> {
        [Self::Pdf, Self::Word, Self::Slides, Self::Spreadsheet]
            .into_iter()
            .find(|kind| kind.label() == label)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractedDocument {
    pub text: String,
    pub note: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ExtractReply {
    Document(ExtractedDocument),
    Error(String),
}

pub fn max_document_bytes() -> u64 {
    crate::cloud::attachments::max_attachment_bytes()
}

pub fn untrusted(name: &str, text: &str) -> String {
    let name = name.replace(['"', '<', '>', '\n'], "_");
    format!("<document_result untrusted=\"true\" path=\"{name}\">\n{text}\n</document_result>")
}

fn too_large(size: u64) -> anyhow::Error {
    anyhow!(
        "the file is {:.1} MB; documents up to {} MB can be read",
        size as f64 / (1024.0 * 1024.0),
        max_document_bytes() / (1024 * 1024)
    )
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
    if size > max_document_bytes() {
        return Err(too_large(size));
    }
    let pages = pages.map(parse_page_range).transpose()?;
    let bytes = tokio::fs::read(path)
        .await
        .with_context(|| format!("could not read {}", path.display()))?;
    extract_isolated(bytes, kind, pages).await
}

pub async fn extract_isolated(
    bytes: Vec<u8>,
    kind: DocumentKind,
    pages: Option<RangeInclusive<usize>>,
) -> Result<ExtractedDocument> {
    if bytes.len() as u64 > max_document_bytes() {
        return Err(too_large(bytes.len() as u64));
    }
    let program = std::env::current_exe().context(UNREADABLE)?;
    let mut command = tokio::process::Command::new(program);
    command.arg(EXTRACT_COMMAND).arg(kind.label());
    if let Some(pages) = pages {
        command.arg(format!("{}-{}", pages.start(), pages.end()));
    }
    run_extractor(command, bytes, EXTRACT_TIMEOUT).await
}

async fn run_extractor(
    mut command: tokio::process::Command,
    input: Vec<u8>,
    timeout: Duration,
) -> Result<ExtractedDocument> {
    command.env_clear();
    for name in CHILD_ENVIRONMENT {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    let mut child = command.spawn().context(UNREADABLE)?;
    let mut stdin = child.stdin.take().context(UNREADABLE)?;
    let mut stdout = child.stdout.take().context(UNREADABLE)?;
    let feed = async move {
        let _ = stdin.write_all(&input).await;
    };
    let read = async move {
        let mut reply = Vec::new();
        (&mut stdout)
            .take(MAX_OUTPUT_BYTES + 1)
            .read_to_end(&mut reply)
            .await
            .map(|_| reply)
    };
    let (_, reply) = match tokio::time::timeout(timeout, async { tokio::join!(feed, read) }).await {
        Ok(done) => done,
        Err(_) => bail!(
            "{UNREADABLE}: reading it took longer than {} seconds",
            timeout.as_secs()
        ),
    };
    let reply = reply.context(UNREADABLE)?;
    if reply.len() as u64 > MAX_OUTPUT_BYTES {
        let _ = child.kill().await;
        bail!("{UNREADABLE}: the reader returned more text than can be used");
    }
    let status = match tokio::time::timeout(timeout, child.wait()).await {
        Ok(status) => status.context(UNREADABLE)?,
        Err(_) => bail!(
            "{UNREADABLE}: reading it took longer than {} seconds",
            timeout.as_secs()
        ),
    };
    if !status.success() {
        bail!("{UNREADABLE}: the reader stopped on this file");
    }
    match serde_json::from_slice::<ExtractReply>(&reply) {
        Ok(ExtractReply::Document(document)) => Ok(document),
        Ok(ExtractReply::Error(message)) => bail!("{UNREADABLE}: {message}"),
        Err(_) => bail!("{UNREADABLE}: the reader returned nothing usable"),
    }
}

pub fn run_extract_command(args: &[String]) -> std::process::ExitCode {
    #[cfg(target_os = "linux")]
    if let Err(error) = nix::sys::resource::setrlimit(
        nix::sys::resource::Resource::RLIMIT_AS,
        EXTRACT_MEMORY_BYTES,
        EXTRACT_MEMORY_BYTES,
    ) {
        tracing::warn!("[documents] the reader's memory limit could not be set: {error}");
    }
    let reply = extract_from_stdin(args)
        .map(ExtractReply::Document)
        .unwrap_or_else(|error| ExtractReply::Error(format!("{error:#}")));
    let mut stdout = std::io::stdout().lock();
    match serde_json::to_writer(&mut stdout, &reply) {
        Ok(()) if stdout.flush().is_ok() => std::process::ExitCode::SUCCESS,
        _ => std::process::ExitCode::FAILURE,
    }
}

fn extract_from_stdin(args: &[String]) -> Result<ExtractedDocument> {
    let kind = args
        .first()
        .and_then(|label| DocumentKind::from_label(label))
        .context("unknown document type")?;
    let pages = args
        .get(1)
        .map(|raw| parse_range(raw, MAX_ATTACHED_PDF_PAGES))
        .transpose()?;
    let limit = max_document_bytes();
    let mut bytes = Vec::new();
    std::io::stdin()
        .lock()
        .take(limit + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return Err(too_large(bytes.len() as u64));
    }
    extract_bytes(&bytes, kind, pages)
}

fn extract_bytes(
    bytes: &[u8],
    kind: DocumentKind,
    pages: Option<RangeInclusive<usize>>,
) -> Result<ExtractedDocument> {
    if bytes.starts_with(b"PK") {
        check_archive(bytes)?;
    }
    let budget = Budget(std::cell::Cell::new(MAX_UNPACKED_BYTES));
    let mut document = match kind {
        DocumentKind::Pdf => pdf_text(bytes, pages)?,
        DocumentKind::Word => whole(docx_text(bytes, &budget)?),
        DocumentKind::Slides => whole(pptx_text(bytes, &budget)?),
        DocumentKind::Spreadsheet => whole(spreadsheet_text(bytes, &budget)?),
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

struct Budget(std::cell::Cell<u64>);

struct Bounded<'a, R> {
    inner: R,
    budget: &'a Budget,
}

impl<R: Read> Read for Bounded<'_, R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let read = self.inner.read(buf)?;
        let left = self.budget.0.get();
        if read as u64 > left {
            return Err(std::io::Error::other(format!(
                "the document unpacks to more than {} MB",
                MAX_UNPACKED_BYTES / (1024 * 1024)
            )));
        }
        self.budget.0.set(left - read as u64);
        Ok(read)
    }
}

fn bounded<'a, R: Read>(inner: R, budget: &'a Budget) -> Bounded<'a, R> {
    Bounded { inner, budget }
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
        let entry = archive.by_index_raw(index)?;
        if entry.size()
            > entry
                .compressed_size()
                .max(1)
                .saturating_mul(MAX_COMPRESSION_RATIO)
        {
            bail!("the document is compressed too far to read safely");
        }
        unpacked = unpacked.saturating_add(entry.size());
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
    parse_range(raw, MAX_PDF_PAGES_PER_READ)
}

fn parse_range(raw: &str, most: usize) -> Result<RangeInclusive<usize>> {
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
    if end - start + 1 > most {
        bail!("read at most {most} pages at a time");
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

fn docx_text(bytes: &[u8], budget: &Budget) -> Result<String> {
    let xml = archive_entry(bytes, "word/document.xml", budget)?;
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

fn pptx_text(bytes: &[u8], budget: &Budget) -> Result<String> {
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
        bounded(archive.by_name(&name)?, budget).read_to_string(&mut xml)?;
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

fn unpacked_copy(bytes: &[u8], budget: &Budget) -> Result<Vec<u8>> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).context("the spreadsheet is not valid")?;
    let mut copy = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let stored =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        let mut contents = Vec::new();
        bounded(&mut entry, budget).read_to_end(&mut contents)?;
        copy.start_file(name, stored)?;
        copy.write_all(&contents)?;
    }
    Ok(copy.finish()?.into_inner())
}

fn spreadsheet_text(bytes: &[u8], budget: &Budget) -> Result<String> {
    let unpacked;
    let bytes = if bytes.starts_with(b"PK") {
        unpacked = unpacked_copy(bytes, budget)?;
        unpacked.as_slice()
    } else {
        bytes
    };
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

fn archive_entry(bytes: &[u8], entry: &str, budget: &Budget) -> Result<String> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).context("the file is not a valid Office document")?;
    let mut contents = String::new();
    let reader = archive
        .by_name(entry)
        .with_context(|| format!("the file is missing {entry}"))?;
    bounded(reader, budget).read_to_string(&mut contents)?;
    Ok(contents)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    fn shell(script: &str) -> tokio::process::Command {
        let mut command = tokio::process::Command::new("/bin/sh");
        command.arg("-c").arg(script);
        command
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_reader_that_crashes_becomes_a_curated_error() {
        let error = run_extractor(
            shell("cat >/dev/null; kill -ABRT $$"),
            b"%PDF".to_vec(),
            EXTRACT_TIMEOUT,
        )
        .await
        .expect_err("a crashed reader is an error");
        assert!(format!("{error:#}").starts_with(UNREADABLE));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_reader_that_hangs_is_stopped_at_the_timeout() {
        let started = std::time::Instant::now();
        let error = run_extractor(shell("sleep 30"), Vec::new(), Duration::from_millis(500))
            .await
            .expect_err("a hung reader is an error");
        assert!(format!("{error:#}").contains("took longer"));
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_reader_reply_carries_the_text() {
        let reply = serde_json::to_string(&ExtractReply::Document(ExtractedDocument {
            text: "hello".to_string(),
            note: None,
        }))
        .expect("reply");
        let document = run_extractor(
            shell(&format!("cat >/dev/null; printf '%s' '{reply}'")),
            b"bytes".to_vec(),
            EXTRACT_TIMEOUT,
        )
        .await
        .expect("document");
        assert_eq!(document.text, "hello");
    }

    #[test]
    fn a_zip_bomb_is_refused_before_it_is_unpacked() {
        use std::io::Write as _;
        let mut packed = Vec::new();
        {
            let mut writer = zip::ZipWriter::new(Cursor::new(&mut packed));
            writer
                .start_file(
                    "word/document.xml",
                    zip::write::SimpleFileOptions::default()
                        .compression_method(zip::CompressionMethod::Deflated),
                )
                .expect("entry");
            writer
                .write_all(&vec![b'a'; 8 * 1024 * 1024])
                .expect("write");
            writer.finish().expect("finish");
        }
        let error = extract_bytes(&packed, DocumentKind::Word, None).expect_err("refused");
        assert!(error.to_string().contains("compressed too far"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_reader_that_floods_its_output_is_stopped() {
        let error = run_extractor(
            shell("cat >/dev/null; head -c 5000000 /dev/zero"),
            Vec::new(),
            EXTRACT_TIMEOUT,
        )
        .await
        .expect_err("an oversized reply is an error");
        assert!(format!("{error:#}").contains("more text than can be used"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn the_reader_does_not_inherit_secrets() {
        let mut command = shell(
            "cat >/dev/null; printf '{\"document\":{\"text\":\"%s\",\"note\":null}}' \"$AGI_TEST_SECRET\"",
        );
        command.env("AGI_TEST_SECRET", "token-value");
        let document = run_extractor(command, Vec::new(), EXTRACT_TIMEOUT)
            .await
            .expect("document");
        assert_eq!(document.text, "");
    }

    #[test]
    fn decompressed_bytes_are_counted_whatever_the_archive_claims() {
        let budget = Budget(std::cell::Cell::new(10));
        let mut text = String::new();
        let error = bounded(Cursor::new(vec![b'a'; 11]), &budget)
            .read_to_string(&mut text)
            .expect_err("over budget");
        assert!(error.to_string().contains("unpacks to more than"));
    }

    #[test]
    fn page_ranges_are_bounded() {
        assert!(parse_page_range("1-20").is_ok());
        assert!(parse_page_range("1-21").is_err());
        assert!(parse_page_range("0").is_err());
    }
}
