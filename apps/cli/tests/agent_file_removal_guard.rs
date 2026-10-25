//! An agent never destroys a user's file on its own: what it removes goes to
//! the Trash through `agiworkforce_cli::trash`. This fails when agent tool
//! code removes a file or folder directly.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

const SCANNED: [&str; 6] = [
    "src/features/exec/tools",
    "src/apply_patch.rs",
    "src/notebook_edit.rs",
    "src/agent",
    "src/powershell_tool.rs",
    "src/path_security/file_authority.rs",
];

const REMOVALS: [&str; 3] = ["remove_file(", "remove_dir(", "remove_dir_all("];

struct Allowed {
    file: &'static str,
    line_contains: &'static str,
    reason: &'static str,
}

const ALLOWED: [Allowed; 6] = [
    Allowed {
        file: "src/notebook_edit.rs",
        line_contains: "remove_file(&tmp_path)",
        reason: "removes the temporary file notebook_edit wrote beside the notebook, never a user file",
    },
    Allowed {
        file: "src/agent/checkpoints.rs",
        line_contains: "root.remove_file(&relative)",
        reason: "a checkpoint restore removes a file the agent created after the snapshot, by the user's request",
    },
    Allowed {
        file: "src/path_security/file_authority.rs",
        line_contains: "confined::remove_file(&stage_parent, stage_leaf)",
        reason: "removes the temporary file this authority staged for an atomic replace",
    },
    Allowed {
        file: "src/path_security/file_authority.rs",
        line_contains: "confined::remove_dir(&parent, &temporary)",
        reason: "removes the temporary folder this authority staged an atomic replace in",
    },
    Allowed {
        file: "src/path_security/file_authority.rs",
        line_contains: "confined::remove_file(&parent, &leaf)",
        reason: "the confined removal primitive; its callers are the checkpoint restore above and checkpoint blob cleanup",
    },
    Allowed {
        file: "src/path_security/file_authority.rs",
        line_contains: "self.remove_file(&name)",
        reason: "checkpoint blob cleanup removes the checkpoint store's own blobs, never a user file",
    },
];

#[derive(Default)]
struct Scan {
    removals: Vec<(usize, String)>,
    test_modules: Vec<String>,
}

fn is_cfg_test(attribute: &str) -> bool {
    let compact: String = attribute.chars().filter(|c| !c.is_whitespace()).collect();
    compact == "#[cfg(test)]" || compact.starts_with("#[cfg(all(test,")
}

fn declared_module(item: &str) -> Option<String> {
    let item = item.trim();
    let item = match item.strip_prefix("pub") {
        Some(rest) => rest
            .trim_start()
            .strip_prefix(|c| c == '(')
            .map_or(rest, |inside| {
                inside.split_once(')').map_or("", |(_, after)| after)
            }),
        None => item,
    };
    let name = item.trim().strip_prefix("mod ")?.trim();
    (!name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || c == '_'))
        .then(|| name.to_string())
}

/// Reads Rust source for the removal calls outside `#[cfg(test)]` items and
/// for the files those items declare (`#[cfg(test)] mod name;`). Comments,
/// strings and character literals are skipped so a brace or a call named in
/// one is not read as code.
fn scan(source: &str) -> Scan {
    let bytes = source.as_bytes();
    let mut scan = Scan::default();
    let mut index = 0;
    let mut line = 1;
    let mut depth = 0usize;
    let mut skipping_from: Option<usize> = None;
    let mut test_item_pending = false;
    let mut item = String::new();
    let mut open_pairs = 0i32;
    let mut line_in_test = false;
    let mut code = String::new();
    let mut code_line = 1;

    let end_line = |code: &mut String, line: usize, skipping: bool, scan: &mut Scan| {
        let calls = code.replace("fn remove_file(", "");
        if !skipping && REMOVALS.iter().any(|call| calls.contains(call)) {
            scan.removals.push((line, code.trim().to_string()));
        }
        code.clear();
    };

    while index < bytes.len() {
        let rest = &source[index..];
        let current = rest.chars().next().expect("index is inside the source");
        if current == '\n' {
            end_line(&mut code, code_line, line_in_test, &mut scan);
            line_in_test = false;
            line += 1;
            code_line = line;
            index += 1;
            continue;
        }
        if rest.starts_with("//") {
            index += rest.find('\n').unwrap_or(rest.len());
            continue;
        }
        if rest.starts_with("/*") {
            let mut nesting = 0;
            let mut at = 0;
            while at < rest.len() {
                if rest[at..].starts_with("/*") {
                    nesting += 1;
                    at += 2;
                } else if rest[at..].starts_with("*/") {
                    nesting -= 1;
                    at += 2;
                    if nesting == 0 {
                        break;
                    }
                } else {
                    at += rest[at..].chars().next().map_or(1, char::len_utf8);
                }
            }
            line += rest[..at].matches('\n').count();
            index += at;
            continue;
        }
        if let Some((body, hashes)) = raw_string_start(source, index) {
            let closing = format!("\"{}", "#".repeat(hashes));
            let end = source[body..]
                .find(&closing)
                .map_or(source.len(), |at| body + at + closing.len());
            line += source[index..end].matches('\n').count();
            index = end;
            code.push_str("\"\"");
            continue;
        }
        if current == '"' {
            let mut at = 1;
            while at < rest.len() && !rest[at..].starts_with('"') {
                if rest[at..].starts_with('\\') {
                    at += 1;
                }
                at += rest[at..].chars().next().map_or(1, char::len_utf8);
            }
            let end = (at + 1).min(rest.len());
            line += rest[..end].matches('\n').count();
            index += end;
            code.push_str("\"\"");
            continue;
        }
        if current == '\'' {
            if let Some(length) = char_literal_length(&rest[1..]) {
                index += 1 + length;
                code.push_str("''");
                continue;
            }
        }
        if rest.starts_with("#[") {
            let end = rest.find(']').map_or(rest.len(), |at| at + 1);
            if is_cfg_test(&rest[..end]) {
                test_item_pending = true;
                item.clear();
                open_pairs = 0;
            }
            line += rest[..end].matches('\n').count();
            index += end;
            continue;
        }

        code.push(current);
        line_in_test |= skipping_from.is_some();
        match current {
            '{' => {
                if test_item_pending && skipping_from.is_none() {
                    skipping_from = Some(depth);
                    test_item_pending = false;
                    line_in_test = true;
                }
                depth += 1;
            }
            '}' => {
                depth = depth.saturating_sub(1);
                if skipping_from == Some(depth) {
                    skipping_from = None;
                }
            }
            ';' if test_item_pending && skipping_from.is_none() => {
                scan.test_modules.extend(declared_module(&item));
                test_item_pending = false;
            }
            ',' if test_item_pending && open_pairs <= 0 => test_item_pending = false,
            _ if test_item_pending => {
                match current {
                    '(' | '[' | '<' => open_pairs += 1,
                    ')' | ']' => open_pairs -= 1,
                    '>' if !matches!(item.chars().last(), Some('-' | '=')) => open_pairs -= 1,
                    _ => {}
                }
                item.push(current);
            }
            _ => {}
        }
        index += current.len_utf8();
    }
    end_line(&mut code, code_line, line_in_test, &mut scan);
    scan
}

fn raw_string_start(source: &str, index: usize) -> Option<(usize, usize)> {
    let bytes = source.as_bytes();
    if index > 0 && is_identifier_byte(bytes[index - 1]) {
        return None;
    }
    let prefix = match &source[index..] {
        rest if rest.starts_with("br") => 2,
        rest if rest.starts_with('r') => 1,
        _ => return None,
    };
    let hashes = bytes[index + prefix..]
        .iter()
        .take_while(|byte| **byte == b'#')
        .count();
    (bytes.get(index + prefix + hashes) == Some(&b'"'))
        .then_some((index + prefix + hashes + 1, hashes))
}

fn char_literal_length(after_quote: &str) -> Option<usize> {
    let mut chars = after_quote.chars();
    match chars.next()? {
        '\\' => after_quote.find('\'').map(|end| end + 1),
        first => (chars.next() == Some('\'')).then(|| first.len_utf8() + 1),
    }
}

fn is_identifier_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

fn rust_files(path: &Path, into: &mut Vec<PathBuf>) {
    if path.is_file() {
        into.push(path.to_path_buf());
        return;
    }
    let mut entries: Vec<_> = std::fs::read_dir(path)
        .unwrap_or_else(|error| panic!("cannot read {}: {error}", path.display()))
        .map(|entry| entry.expect("directory entry").path())
        .collect();
    entries.sort();
    for entry in entries {
        if entry.is_dir() || entry.extension().is_some_and(|ext| ext == "rs") {
            rust_files(&entry, into);
        }
    }
}

fn declared_test_files(file: &Path, modules: &[String]) -> Vec<PathBuf> {
    let folder = file.parent().expect("a file has a folder");
    let own = file
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("");
    let base = if own == "mod" || own == "lib" || own == "main" {
        folder.to_path_buf()
    } else {
        folder.join(own)
    };
    modules
        .iter()
        .flat_map(|name| {
            [
                base.join(format!("{name}.rs")),
                base.join(name).join("mod.rs"),
            ]
        })
        .collect()
}

struct Found {
    file: String,
    line: usize,
    text: String,
}

fn removals_in(root: &Path, scanned: &[&str]) -> (Vec<Found>, usize) {
    let mut files = Vec::new();
    for entry in scanned {
        rust_files(&root.join(entry), &mut files);
    }
    let scans: Vec<(PathBuf, Scan)> = files
        .iter()
        .map(|file| {
            let source = std::fs::read_to_string(file)
                .unwrap_or_else(|error| panic!("cannot read {}: {error}", file.display()));
            (file.clone(), scan(&source))
        })
        .collect();
    let test_files: BTreeSet<PathBuf> = scans
        .iter()
        .flat_map(|(file, scan)| declared_test_files(file, &scan.test_modules))
        .collect();
    let mut found = Vec::new();
    let mut read = 0;
    for (file, scan) in &scans {
        if test_files.contains(file) {
            continue;
        }
        read += 1;
        let relative = file
            .strip_prefix(root)
            .expect("under the crate")
            .to_string_lossy()
            .replace('\\', "/");
        for (line, text) in &scan.removals {
            found.push(Found {
                file: relative.clone(),
                line: *line,
                text: text.clone(),
            });
        }
    }
    (found, read)
}

fn allowed(found: &Found) -> bool {
    ALLOWED
        .iter()
        .any(|entry| entry.file == found.file && found.text.contains(entry.line_contains))
}

#[test]
fn agent_tool_code_removes_nothing_without_the_trash() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let (found, read) = removals_in(root, &SCANNED);
    assert!(
        read > 10,
        "the scan read only {read} files; is it looking in the right place?"
    );

    let offending: Vec<String> = found
        .iter()
        .filter(|found| !allowed(found))
        .map(|found| format!("  {}:{}: {}", found.file, found.line, found.text))
        .collect();
    assert!(
        offending.is_empty(),
        "agent tool code must not delete a user's file outright; move it to the Trash with \
         agiworkforce_cli::trash::move_to_trash (or TrashLocation::trash) instead. If the removal \
         is not a user's file, add it to ALLOWED in {} with the reason.\n{}",
        file!(),
        offending.join("\n")
    );
}

#[test]
fn every_allowed_removal_still_exists() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let (found, _) = removals_in(root, &SCANNED);
    for entry in &ALLOWED {
        assert!(
            found
                .iter()
                .any(|found| found.file == entry.file && found.text.contains(entry.line_contains)),
            "{} no longer removes `{}` ({}); drop the entry from ALLOWED",
            entry.file,
            entry.line_contains,
            entry.reason
        );
    }
}

#[test]
fn the_scan_reads_code_and_skips_what_is_not() {
    let source = r##"
use std::fs;
fn live() { fs::remove_file(path); }
// fs::remove_file(in_a_comment);
/* fs::remove_dir(in_a_block_comment); */
fn text() { let _ = "fs::remove_dir_all(in_a_string)"; let _ = r#"remove_file("raw")"#; let _ = '{'; }
#[cfg(test)]
mod tests {
    fn braces() { let _ = "}"; fs::remove_file(in_tests); }
    fn more() { fs::remove_dir(in_tests_too); }
}
#[cfg(test)]
mod elsewhere;
#[cfg(test)]
fn helper() { fs::remove_dir_all(in_a_test_helper); }
fn after() { tokio::fs::remove_dir_all(path).await; }
"##;

    let scanned = scan(source);

    let lines: Vec<usize> = scanned.removals.iter().map(|(line, _)| *line).collect();
    assert_eq!(lines, [3, 16], "{:?}", scanned.removals);
    assert_eq!(scanned.test_modules, ["elsewhere"]);
}

#[test]
fn a_file_declared_as_a_test_module_is_not_scanned() {
    let root = tempfile::tempdir().expect("crate");
    let src = root.path().join("src");
    std::fs::create_dir_all(src.join("tool")).expect("folders");
    std::fs::write(
        src.join("tool.rs"),
        "#[cfg(test)]\nmod boundary_tests;\nfn real() { std::fs::remove_file(p); }\n",
    )
    .expect("tool.rs");
    std::fs::write(
        src.join("tool").join("boundary_tests.rs"),
        "fn t() { std::fs::remove_file(p); }\n",
    )
    .expect("test module");

    let (found, read) = removals_in(root.path(), &["src"]);

    assert_eq!(read, 1);
    assert_eq!(found.len(), 1);
    assert_eq!((found[0].file.as_str(), found[0].line), ("src/tool.rs", 3));
}
