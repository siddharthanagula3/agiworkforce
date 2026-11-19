use std::collections::HashMap;

use anyhow::Result;
use tokio::process::Command;

use super::common::{
    format_size, print_tool_status, truncate_output_with_save, validate_file_path, COMMAND_TIMEOUT,
};
use super::ToolResult;

const MAX_GLOB_RESULTS: usize = 1_000;

/// A search program, started from where it is on the host and never from a
/// bare name. These tools run it outside any sandbox and without asking, and
/// a bare `rg` or `grep` is looked up on the whole `PATH`, where a project's
/// `node_modules/.bin` or `.venv/bin` can come first and hold a program a
/// sandboxed command put there.
fn search_program(name: &str) -> std::io::Result<Command> {
    crate::path_security::host_program(name)
        .map(Command::new)
        .ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("{name} was not found in a folder of PATH outside the project"),
            )
        })
}

const FILENAME_END: char = '\0';

/// The file a match came from. Every search runs with `--with-filename` and
/// `--null`, so the producer ends the name with a NUL byte that no path can
/// contain; a name that holds `:1:` or `\n` cannot be mistaken for another.
fn matched_file(line: &str) -> Option<&str> {
    line.split_once(FILENAME_END).map(|(path, _)| path)
}

/// Matched lines that came out of a file the credential policy covers. A
/// search reads the tree a line at a time, so the refusal `read_file` makes
/// has to be made again on what a match would carry back. A line whose file
/// cannot be named is withheld too.
fn withhold_credential_matches(output: &str) -> (String, usize) {
    let mut kept: Vec<String> = Vec::new();
    let mut withheld = 0usize;
    let mut judged: HashMap<&str, bool> = HashMap::new();
    for line in output.lines() {
        let covered = matched_file(line).is_none_or(|path| {
            *judged.entry(path).or_insert_with(|| {
                crate::path_security::is_checkpoint_internal_path(std::path::Path::new(path))
                    || crate::path_security::reads_a_credential_file(path)
            })
        });
        if covered {
            withheld += 1;
        } else {
            kept.push(line.replacen(FILENAME_END, ":", 1));
        }
    }
    (kept.join("\n"), withheld)
}

fn withholding_note(withheld: usize) -> String {
    format!(
        "\n[{withheld} match(es) withheld: they are in private checkpoint storage, in files the credential-file policy covers, \
         or the search could not name the file they came from, so their contents would reach the model and the session \
         transcript. Open those files yourself, or pass the one value the task needs.]"
    )
}

const SEARCH_FILES_PER_FILE_CAP: usize = 200;
const GREP_FILES_PER_FILE_CAP: usize = 100;

fn per_file_cap_note(output: &str, cap: usize) -> Option<String> {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for line in output.lines() {
        if let Some(file) = matched_file(line) {
            *counts.entry(file).or_default() += 1;
        }
    }
    let full = counts.values().filter(|count| **count >= cap).count();
    (full > 0).then(|| {
        format!(
            "\n[{full} file(s) reached the limit of {cap} matches per file, so later matches in \
             them are not listed; search those files with a narrower pattern]"
        )
    })
}

fn search_failed(tool_name: &str, stderr: &str) -> ToolResult {
    ToolResult {
        tool_name: tool_name.to_string(),
        success: false,
        output: format!(
            "The search failed, so this says nothing about whether the text exists: {}",
            stderr.trim()
        ),
    }
}

/// A search answer with the credential files taken out of it.
fn searched(tool_name: &str, output: String) -> ToolResult {
    let (kept, withheld) = withhold_credential_matches(&output);
    let mut text = truncate_output_with_save(tool_name, kept);
    if withheld > 0 {
        text.push_str(&withholding_note(withheld));
    }
    ToolResult {
        tool_name: tool_name.to_string(),
        success: true,
        output: text,
    }
}

pub(super) async fn execute_search_files(args: &HashMap<String, String>) -> Result<ToolResult> {
    let pattern = match args.get("pattern") {
        Some(p) => p,
        None => {
            return Ok(ToolResult {
                tool_name: "search_files".to_string(),
                success: false,
                output: "Missing required argument: pattern".to_string(),
            });
        }
    };

    let path = args.get("path").map(|s| s.as_str()).unwrap_or(".");

    let validated_path = match validate_file_path(path) {
        Ok(p) => p,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: "search_files".to_string(),
                success: false,
                output: format!("Refusing to search outside project: {}", e),
            });
        }
    };

    print_tool_status("search_files", &format!("Search({}, {})", pattern, path));

    let result = match search_program("grep") {
        Ok(mut command) => {
            command
                .arg("-rnE")
                .arg("--with-filename")
                .arg("--null")
                .arg("--include=*")
                .arg("-m")
                .arg(SEARCH_FILES_PER_FILE_CAP.to_string());
            for directory in crate::repo::index_policy::excluded_directory_names() {
                command.arg(format!("--exclude-dir={directory}"));
            }
            for pattern in crate::path_security::checkpoint_internal_globs() {
                command.arg(format!("--exclude-dir={pattern}"));
                command.arg(format!("--exclude={pattern}"));
            }
            command.arg("--").arg(pattern).arg(&validated_path);
            crate::process_tree::output(command, None, Some(COMMAND_TIMEOUT)).await
        }
        Err(missing) => Err(missing),
    };

    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();

            if stdout.is_empty() && output.status.code() == Some(1) {
                return Ok(ToolResult {
                    tool_name: "search_files".to_string(),
                    success: true,
                    output: format!("No matches found for pattern: {}", pattern),
                });
            }
            if stdout.is_empty() && output.status.code() == Some(2) {
                return Ok(search_failed("search_files", &stderr));
            }

            let cap_note = per_file_cap_note(&stdout, SEARCH_FILES_PER_FILE_CAP);
            let mut result = searched("search_files", stdout);
            if let Some(note) = cap_note {
                result.output.push_str(&note);
            }
            if !stderr.is_empty() {
                result.output.push_str("\n[stderr]\n");
                result.output.push_str(&stderr);
            }
            Ok(result)
        }
        Err(e) if e.kind() != std::io::ErrorKind::TimedOut => Ok(ToolResult {
            tool_name: "search_files".to_string(),
            success: false,
            output: format!("Failed to execute search: {}", e),
        }),
        Err(_) => Ok(ToolResult {
            tool_name: "search_files".to_string(),
            success: false,
            output: format!(
                "Search timed out after {} seconds",
                COMMAND_TIMEOUT.as_secs()
            ),
        }),
    }
}

pub(super) async fn execute_list_directory(args: &HashMap<String, String>) -> Result<ToolResult> {
    let path = args.get("path").map(|s| s.as_str()).unwrap_or(".");

    print_tool_status("list_directory", &format!("List({})", path));

    let dir_path = match validate_file_path(path) {
        Ok(p) => p,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: "list_directory".to_string(),
                success: false,
                output: format!("Refusing to list outside project: {}", e),
            });
        }
    };
    if !dir_path.exists() {
        return Ok(ToolResult {
            tool_name: "list_directory".to_string(),
            success: false,
            output: format!("Directory not found: {}", path),
        });
    }

    if !dir_path.is_dir() {
        return Ok(ToolResult {
            tool_name: "list_directory".to_string(),
            success: false,
            output: format!("Not a directory: {}", path),
        });
    }

    let mut entries = Vec::new();
    let mut read_dir = match tokio::fs::read_dir(&dir_path).await {
        Ok(rd) => rd,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: "list_directory".to_string(),
                success: false,
                output: format!("Failed to read directory: {}", e),
            });
        }
    };

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        if crate::path_security::is_checkpoint_internal_path(&entry.path()) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let metadata = entry.metadata().await;

        let (file_type, size) = match metadata {
            Ok(meta) => {
                let ft = if meta.is_dir() {
                    "dir"
                } else if meta.is_symlink() {
                    "link"
                } else {
                    "file"
                };
                (ft, meta.len())
            }
            Err(_) => ("???", 0),
        };

        entries.push((name, file_type, size));
    }

    entries.sort_by(|a, b| {
        let dir_order = |ft: &str| -> u8 {
            if ft == "dir" {
                0
            } else {
                1
            }
        };
        dir_order(a.1)
            .cmp(&dir_order(b.1))
            .then_with(|| a.0.to_lowercase().cmp(&b.0.to_lowercase()))
    });

    let mut output = String::new();
    for (name, file_type, size) in &entries {
        let display_name = if *file_type == "dir" {
            format!("{}/", name)
        } else {
            name.clone()
        };
        output.push_str(&format!(
            "{:<6} {:>10}  {}\n",
            file_type,
            format_size(*size),
            display_name
        ));
    }

    if entries.is_empty() {
        output = "(empty directory)".to_string();
    } else {
        output.push_str(&format!("\n{} entries total", entries.len()));
    }

    Ok(ToolResult {
        tool_name: "list_directory".to_string(),
        success: true,
        output,
    })
}

pub(super) async fn execute_grep_files(
    args: &HashMap<String, String>,
    quiet: bool,
) -> Result<ToolResult> {
    let pattern = match args.get("pattern") {
        Some(p) => p,
        None => {
            return Ok(ToolResult {
                tool_name: "grep_files".into(),
                success: false,
                output: "Missing: pattern".into(),
            });
        }
    };
    let path = args.get("path").map(|s| s.as_str()).unwrap_or(".");

    let validated_path = match validate_file_path(path) {
        Ok(p) => p,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: "grep_files".into(),
                success: false,
                output: format!("Refusing to grep outside project: {}", e),
            });
        }
    };

    let include = args.get("include");
    if !quiet {
        print_tool_status("grep_files", &format!("/{}/{}", pattern, path));
    }
    let found = match search_program("rg") {
        Ok(mut cmd) => {
            cmd.arg("--line-number")
                .arg("--with-filename")
                .arg("--null")
                .arg("--no-heading")
                .arg("--color=never")
                .arg(format!("--max-count={GREP_FILES_PER_FILE_CAP}"));
            if let Some(g) = include {
                cmd.arg("--glob").arg(g);
            }
            for pattern in crate::path_security::checkpoint_internal_globs() {
                cmd.arg("--glob").arg(format!("!**/{pattern}"));
                cmd.arg("--glob").arg(format!("!**/{pattern}/**"));
            }
            cmd.arg("--").arg(pattern).arg(&validated_path);
            crate::process_tree::output(cmd, None, Some(COMMAND_TIMEOUT)).await
        }
        Err(missing) => Err(missing),
    };
    match found {
        Ok(o) => Ok(grep_answer(pattern, &o)),
        Err(error) if error.kind() != std::io::ErrorKind::TimedOut => {
            let mut fb = match search_program("grep") {
                Ok(fb) => fb,
                Err(missing) => {
                    return Ok(ToolResult {
                        tool_name: "grep_files".into(),
                        success: false,
                        output: missing.to_string(),
                    })
                }
            };
            let include = include.map(|filter| filter.trim_start_matches("**/"));
            if let Some(filter) = include.filter(|filter| filter.contains('/')) {
                return Ok(ToolResult {
                    tool_name: "grep_files".into(),
                    success: false,
                    output: format!(
                        "rg is not installed, and grep filters by file name only, so include \
                         must be a file name pattern such as *.rs, not {filter}"
                    ),
                });
            }
            fb.arg("-rnE")
                .arg("--with-filename")
                .arg("--null")
                .arg(format!("--max-count={GREP_FILES_PER_FILE_CAP}"));
            if let Some(filter) = include {
                fb.arg(format!("--include={filter}"));
            }
            for directory in crate::repo::index_policy::excluded_directory_names() {
                fb.arg(format!("--exclude-dir={directory}"));
            }
            for pattern in crate::path_security::checkpoint_internal_globs() {
                fb.arg(format!("--exclude-dir={pattern}"));
                fb.arg(format!("--exclude={pattern}"));
            }
            fb.arg("--").arg(pattern).arg(&validated_path);
            match crate::process_tree::output(fb, None, Some(COMMAND_TIMEOUT)).await {
                Ok(o) => Ok(grep_answer(pattern, &o)),
                Err(e) if e.kind() != std::io::ErrorKind::TimedOut => Ok(ToolResult {
                    tool_name: "grep_files".into(),
                    success: false,
                    output: format!("{}", e),
                }),
                Err(_) => Ok(ToolResult {
                    tool_name: "grep_files".into(),
                    success: false,
                    output: format!(
                        "Search timed out after {} seconds",
                        COMMAND_TIMEOUT.as_secs()
                    ),
                }),
            }
        }
        Err(_) => Ok(ToolResult {
            tool_name: "grep_files".into(),
            success: false,
            output: format!(
                "Search timed out after {} seconds",
                COMMAND_TIMEOUT.as_secs()
            ),
        }),
    }
}

fn grep_answer(pattern: &str, output: &std::process::Output) -> ToolResult {
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if stdout.is_empty() {
        if output.status.code() == Some(2) {
            return search_failed("grep_files", &String::from_utf8_lossy(&output.stderr));
        }
        return ToolResult {
            tool_name: "grep_files".into(),
            success: true,
            output: format!("No matches for: {}", pattern),
        };
    }
    let cap_note = per_file_cap_note(&stdout, GREP_FILES_PER_FILE_CAP);
    let mut answer = searched("grep_files", stdout);
    if let Some(note) = cap_note {
        answer.output.push_str(&note);
    }
    answer
}

pub(super) async fn execute_glob(args: &HashMap<String, String>) -> Result<ToolResult> {
    let pattern = match args.get("pattern") {
        Some(p) => p,
        None => {
            return Ok(ToolResult {
                tool_name: "glob".into(),
                success: false,
                output: "Missing required argument: pattern".into(),
            });
        }
    };

    if std::path::Path::new(pattern).components().any(|component| {
        matches!(
            component,
            std::path::Component::RootDir | std::path::Component::Prefix(_)
        )
    }) {
        return Ok(ToolResult {
            tool_name: "glob".into(),
            success: false,
            output: format!(
                "Refusing absolute glob pattern: {}. Use relative patterns within the project.",
                pattern
            ),
        });
    }

    let base = args.get("path").map(|s| s.as_str()).unwrap_or(".");
    let base_path = match validate_file_path(base) {
        Ok(p) => p,
        Err(e) => {
            return Ok(ToolResult {
                tool_name: "glob".into(),
                success: false,
                output: format!("Refusing to glob outside project: {}", e),
            });
        }
    };

    let full_pattern = format!("{}/{}", base_path.display(), pattern);

    let paths = match glob::glob(&full_pattern) {
        Ok(paths) => paths,
        Err(err) => {
            return Ok(ToolResult {
                tool_name: "glob".into(),
                success: false,
                output: format!("Invalid glob pattern: {err}"),
            });
        }
    };

    let mut matches = Vec::new();
    let mut truncated = false;
    for path in paths.filter_map(|p| p.ok()) {
        if crate::path_security::is_checkpoint_internal_path(&path) {
            continue;
        }
        let in_workspace = path
            .to_str()
            .is_some_and(|shown| validate_file_path(shown).is_ok());
        if !in_workspace {
            continue;
        }
        if matches.len() >= MAX_GLOB_RESULTS {
            truncated = true;
            break;
        }
        matches.push(path.display().to_string());
    }

    if matches.is_empty() {
        Ok(ToolResult {
            tool_name: "glob".into(),
            success: true,
            output: format!("No files matched pattern: {}", pattern),
        })
    } else {
        Ok(ToolResult {
            tool_name: "glob".into(),
            success: true,
            output: {
                let mut output = matches.join("\n");
                if truncated {
                    output.push_str(&format!(
                        "\n[truncated after {MAX_GLOB_RESULTS} matches; narrow the pattern or path]"
                    ));
                }
                output
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WITHHELD_VALUE: &str = "EXAMPLE-NOT-A-REAL-BILLING-KEY";

    #[test]
    fn a_match_inside_a_credential_file_never_reaches_the_answer() {
        let raw = format!(
            "src/billing.rs\x0012:const KEY_NAME: &str = \"STRIPE_KEY\";\n\
             .env\x003:STRIPE_SECRET_KEY={WITHHELD_VALUE}\n\
             apps/web/.env.production\x001:DATABASE_URL=postgres://user:pw@host/db\n\
             deploy/id_rsa\x001:OPENSSH_KEY_BODY_PLACEHOLDER\n\
             certs/server.pem\x001:PEM_KEY_BODY_PLACEHOLDER\n\
             docs/development/README.md\x009:copy .env.example to .env\n"
        );

        let answer = searched("search_files", raw).output;

        assert!(
            !answer.contains(WITHHELD_VALUE),
            "a credential value reached the model: {answer}"
        );
        assert!(!answer.contains("postgres://user:pw@host/db"), "{answer}");
        assert!(!answer.contains("OPENSSH_KEY_BODY_PLACEHOLDER"), "{answer}");
        assert!(!answer.contains("PEM_KEY_BODY_PLACEHOLDER"), "{answer}");
        assert!(answer.contains("src/billing.rs:12:"), "{answer}");
        assert!(answer.contains("docs/development/README.md:9:"), "{answer}");
        assert!(
            answer.contains("4 match(es) withheld"),
            "the answer does not say what it held back: {answer}"
        );
    }

    #[test]
    fn nothing_is_withheld_and_nothing_is_said_when_no_credential_file_matched() {
        let raw = "src/a.rs\x001:fn main() {}\nsrc/b.rs\x002:let key = 1;\n".to_string();

        let answer = searched("grep_files", raw).output;

        assert_eq!(answer, "src/a.rs:1:fn main() {}\nsrc/b.rs:2:let key = 1;");
        assert!(!answer.contains("withheld"), "{answer}");
    }

    /// The filter keeps no list of its own: for any path, it withholds exactly
    /// when `sensitive_files` says the file holds credentials, so a pattern
    /// added there is covered here the moment it exists.
    #[test]
    fn the_credential_policy_is_the_only_thing_that_decides_what_is_withheld() {
        for path in [
            ".env",
            ".env.local",
            "apps/web/.env.production",
            ".envrc",
            "config/secrets.json",
            "aws_credentials",
            ".netrc",
            ".npmrc",
            "home/.ssh/id_ed25519",
            "certs/client.p12",
            "private.key",
            ".aws/credentials",
            ".kube/config",
            "infra/terraform.tfstate",
            "infra/terraform.tfvars",
            "src/main.rs",
            "README.md",
            "environment.ts",
            "docs/security/security.md",
            "package.json",
        ] {
            let line = format!("{path}\x007:value");
            let (kept, withheld) = withhold_credential_matches(&line);
            let sensitive = crate::sensitive_files::is_sensitive_file(path);
            assert_eq!(
                withheld == 1,
                sensitive,
                "{path}: the filter and the credential policy disagree"
            );
            assert_eq!(kept.is_empty(), sensitive, "{path}");
        }
    }

    #[test]
    fn a_path_that_carries_a_colon_is_still_attributed_to_its_file() {
        assert_eq!(
            matched_file("C:\\repo\\apps\\.env\x004:TOKEN=x"),
            Some(r"C:\repo\apps\.env")
        );
        assert_eq!(matched_file("src/a.rs\x0012:let x = 1;"), Some("src/a.rs"));
        assert_eq!(
            matched_file("/project/demo:1:copy/.env\x001:DEPLOY_PASS=sample-only-4837"),
            Some("/project/demo:1:copy/.env")
        );
        assert_eq!(matched_file("Binary file .env matches"), None);

        let (kept, withheld) = withhold_credential_matches("C:\\repo\\apps\\.env\x004:TOKEN=x");
        assert_eq!(withheld, 1, "a Windows path was not attributed: {kept}");

        let (kept, withheld) = withhold_credential_matches(
            "/project/demo:1:copy/.env\x001:DEPLOY_PASS=sample-only-4837",
        );
        assert_eq!(withheld, 1, "a name holding :1: was misattributed: {kept}");
        assert!(!kept.contains("sample-only-4837"), "{kept}");
    }

    #[test]
    fn a_line_whose_file_cannot_be_named_is_withheld() {
        let (kept, withheld) = withhold_credential_matches(
            "1:DEPLOY_PASS=sample-only-4837\nsrc/a.rs\x003:fn main()\nBinary file .env matches",
        );
        assert_eq!(withheld, 2, "{kept}");
        assert_eq!(kept, "src/a.rs:3:fn main()");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_credential_file_under_a_folder_named_like_a_match_stays_out_of_every_search() {
        let workspace = tempfile::tempdir().unwrap();
        let root = workspace.path().canonicalize().unwrap();
        std::fs::create_dir(root.join("demo")).unwrap();
        std::fs::create_dir(root.join("demo:1:copy")).unwrap();
        let protected = root.join("demo:1:copy").join(".env");
        std::fs::write(&protected, "DEPLOY_PASS=sample-only-4837\n").unwrap();
        std::fs::write(root.join("demo").join("notes.txt"), "DEPLOY_PASS is set\n").unwrap();

        let search = |tool: &'static str, path: String| {
            let root = root.clone();
            async move {
                let args: HashMap<String, String> = [
                    ("pattern".to_string(), "DEPLOY_PASS".to_string()),
                    ("path".to_string(), path),
                ]
                .into_iter()
                .collect();
                crate::path_security::scope_workspace_paths(Some(root), Vec::new(), async {
                    match tool {
                        "search_files" => execute_search_files(&args).await,
                        _ => execute_grep_files(&args, true).await,
                    }
                })
                .await
                .unwrap()
            }
        };

        let whole_tree = search("search_files", root.to_string_lossy().into_owned()).await;
        assert!(
            !whole_tree.output.contains("sample-only-4837"),
            "{}",
            whole_tree.output
        );
        assert!(
            whole_tree.output.contains("notes.txt:1:DEPLOY_PASS is set"),
            "{}",
            whole_tree.output
        );
        assert!(
            whole_tree.output.contains("1 match(es) withheld"),
            "{}",
            whole_tree.output
        );

        for tool in ["search_files", "grep_files"] {
            let one_file = search(tool, protected.to_string_lossy().into_owned()).await;
            assert!(
                !one_file.output.contains("sample-only-4837"),
                "{tool}: {}",
                one_file.output
            );
        }
    }

    #[test]
    fn the_directories_the_index_leaves_out_are_the_ones_a_search_skips() {
        let skipped = crate::repo::index_policy::excluded_directory_names();
        for directory in ["node_modules", "target", ".git", ".venv", "dist"] {
            assert!(
                skipped.contains(&directory),
                "{directory} is searched on every query"
            );
        }
    }

    fn scoped_args(pairs: &[(&str, String)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.clone()))
            .collect()
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_search_reads_its_pattern_as_a_regular_expression_and_reports_a_bad_one() {
        let workspace = tempfile::tempdir().unwrap();
        let root = workspace.path().canonicalize().unwrap();
        std::fs::write(root.join("notes.txt"), "the beta release\n").unwrap();
        let path = root.to_string_lossy().into_owned();

        let alternation = scoped_args(&[
            ("pattern", "alpha|beta".to_string()),
            ("path", path.clone()),
        ]);
        let found =
            crate::path_security::scope_workspace_paths(Some(root.clone()), Vec::new(), async {
                execute_search_files(&alternation).await
            })
            .await
            .unwrap();
        assert!(
            found.output.contains("the beta release"),
            "{}",
            found.output
        );

        let broken = scoped_args(&[("pattern", "(".to_string()), ("path", path)]);
        for tool in ["search_files", "grep_files"] {
            let answer = crate::path_security::scope_workspace_paths(
                Some(root.clone()),
                Vec::new(),
                async {
                    match tool {
                        "search_files" => execute_search_files(&broken).await,
                        _ => execute_grep_files(&broken, true).await,
                    }
                },
            )
            .await
            .unwrap();
            assert!(!answer.success, "{tool}: {}", answer.output);
            assert!(
                answer.output.contains("The search failed"),
                "{tool}: {}",
                answer.output
            );
        }
    }

    #[test]
    fn a_file_that_reached_the_per_file_limit_is_named_in_a_note() {
        let full: String = (1..=3)
            .map(|line| format!("src/a.rs\x00{line}:x\n"))
            .collect();
        let note = per_file_cap_note(&format!("{full}src/b.rs\x001:x\n"), 3).expect("a note");
        assert!(note.contains("1 file(s) reached the limit of 3"), "{note}");
        assert!(per_file_cap_note("src/b.rs\x001:x\n", 3).is_none());
    }

    #[tokio::test]
    async fn glob_lists_files_in_a_folder_added_to_the_workspace() {
        let workspace = tempfile::tempdir().unwrap();
        let added = tempfile::tempdir().unwrap();
        let root = workspace.path().canonicalize().unwrap();
        let extra = added.path().canonicalize().unwrap();
        std::fs::write(extra.join("shared.ts"), "export {}\n").unwrap();
        let args = scoped_args(&[
            ("pattern", "**/*.ts".to_string()),
            ("path", extra.to_string_lossy().into_owned()),
        ]);

        let result = crate::path_security::scope_workspace_paths(Some(root), vec![extra], async {
            execute_glob(&args).await
        })
        .await
        .unwrap();

        assert!(result.success, "{}", result.output);
        assert!(result.output.contains("shared.ts"), "{}", result.output);
    }
}
