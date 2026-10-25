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

/// The file a `path:line:text` match came from, for a path that may itself
/// carry a Windows drive prefix.
fn matched_file(line: &str) -> Option<&str> {
    let mut from = 0;
    while let Some(offset) = line[from..].find(':') {
        let at = from + offset;
        let rest = &line[at + 1..];
        let digits = rest.chars().take_while(|c| c.is_ascii_digit()).count();
        if digits > 0 && rest[digits..].starts_with(':') {
            return Some(&line[..at]);
        }
        from = at + 1;
    }
    line.split_once(':').map(|(path, _)| path)
}

/// Matched lines that came out of a file the credential policy covers. A
/// search reads the tree a line at a time, so the refusal `read_file` makes
/// has to be made again on what a match would carry back.
fn withhold_credential_matches(output: &str) -> (String, usize) {
    let mut kept: Vec<&str> = Vec::new();
    let mut withheld = 0usize;
    let mut judged: HashMap<&str, bool> = HashMap::new();
    for line in output.lines() {
        let covered = matched_file(line).is_some_and(|path| {
            *judged.entry(path).or_insert_with(|| {
                crate::path_security::is_checkpoint_internal_path(std::path::Path::new(path))
                    || crate::path_security::reads_a_credential_file(path)
            })
        });
        if covered {
            withheld += 1;
        } else {
            kept.push(line);
        }
    }
    (kept.join("\n"), withheld)
}

fn withholding_note(withheld: usize) -> String {
    format!(
        "\n[{withheld} match(es) withheld: they are in private checkpoint storage or files the credential-file policy covers, so \
         their contents would reach the model and the session transcript. Open those files \
         yourself, or pass the one value the task needs.]"
    )
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
            command.arg("-rnE").arg("--include=*").arg("-m").arg("200");
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
            if stdout.is_empty() && !output.status.success() {
                return Ok(search_failed("search_files", pattern, &stderr, GREP_SYNTAX));
            }

            let mut result = searched("search_files", stdout);
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
                .arg("--no-heading")
                .arg("--color=never")
                .arg("--max-count=100");
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
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            if stdout.is_empty() && !o.status.success() && o.status.code() != Some(1) {
                return Ok(search_failed(
                    "grep_files",
                    pattern,
                    &String::from_utf8_lossy(&o.stderr),
                    RIPGREP_SYNTAX,
                ));
            }
            if stdout.is_empty() {
                return Ok(ToolResult {
                    tool_name: "grep_files".into(),
                    success: true,
                    output: format!("No matches for: {}", pattern),
                });
            }
            Ok(searched("grep_files", stdout))
        }
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
            fb.arg("-rnE").arg("--max-count=100");
            if let Some(glob) = include {
                fb.arg(format!("--include={glob}"));
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
                Ok(o) => Ok(grep_fallback_answer(pattern, &o)),
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

/// A search that could not run, with the reason the search program gave,
/// rather than an empty answer the model reads as "nothing matched".
const GREP_SYNTAX: &str = "extended regular expressions (grep -E)";
const RIPGREP_SYNTAX: &str = "ripgrep's regular expression syntax";

fn search_failed(tool_name: &str, pattern: &str, stderr: &str, syntax: &str) -> ToolResult {
    ToolResult {
        tool_name: tool_name.to_string(),
        success: false,
        output: format!(
            "The search for {pattern} could not run: {}. Patterns use {syntax}.",
            stderr.trim()
        ),
    }
}

/// What `grep -rnE` answered when ripgrep was not available: its matches,
/// "no matches" for exit status 1, or the reason it refused the pattern.
fn grep_fallback_answer(pattern: &str, output: &std::process::Output) -> ToolResult {
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if !stdout.is_empty() {
        return searched("grep_files", stdout);
    }
    if output.status.code() == Some(1) || output.status.success() {
        return ToolResult {
            tool_name: "grep_files".into(),
            success: true,
            output: format!("No matches for: {}", pattern),
        };
    }
    search_failed(
        "grep_files",
        pattern,
        &String::from_utf8_lossy(&output.stderr),
        GREP_SYNTAX,
    )
}

const MAX_BRACE_EXPANSIONS: usize = 64;

/// Every path `pattern` matches, `{a,b}` alternatives included, which the
/// `glob` crate on its own reads as literal braces and so matches nothing.
fn glob_matches(pattern: &str) -> std::result::Result<Vec<std::path::PathBuf>, glob::PatternError> {
    let mut seen = std::collections::HashSet::new();
    let mut matches = Vec::new();
    for expanded in expand_braces(pattern) {
        for path in glob::glob(&expanded)?.filter_map(|entry| entry.ok()) {
            if seen.insert(path.clone()) {
                matches.push(path);
            }
        }
    }
    Ok(matches)
}

fn expand_braces(pattern: &str) -> Vec<String> {
    let mut pending = vec![pattern.to_string()];
    let mut expanded = Vec::new();
    while let Some(current) = pending.pop() {
        match brace_alternatives(&current) {
            Some(alternatives) => {
                if pending.len() + expanded.len() + alternatives.len() > MAX_BRACE_EXPANSIONS {
                    return vec![pattern.to_string()];
                }
                pending.extend(alternatives.into_iter().rev());
            }
            None => expanded.push(current),
        }
    }
    expanded
}

/// The pattern once per alternative of its first `{a,b}` group, or `None`
/// when no group offers a choice.
fn brace_alternatives(pattern: &str) -> Option<Vec<String>> {
    let bytes = pattern.as_bytes();
    let mut search_from = 0;
    while let Some(offset) = pattern[search_from..].find('{') {
        let open = search_from + offset;
        let mut depth = 0usize;
        let mut commas = Vec::new();
        let mut close = None;
        for (index, &byte) in bytes.iter().enumerate().skip(open) {
            match byte {
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        close = Some(index);
                        break;
                    }
                }
                b',' if depth == 1 => commas.push(index),
                _ => {}
            }
        }
        let close = close?;
        if commas.is_empty() {
            search_from = open + 1;
            continue;
        }
        let mut bounds = vec![open];
        bounds.extend(commas);
        bounds.push(close);
        let (head, tail) = (&pattern[..open], &pattern[close + 1..]);
        return Some(
            bounds
                .windows(2)
                .map(|edge| format!("{head}{}{tail}", &pattern[edge[0] + 1..edge[1]]))
                .collect(),
        );
    }
    None
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

    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let cwd_canonical = cwd.canonicalize().unwrap_or(cwd);

    let paths = match glob_matches(&full_pattern) {
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
    for path in paths {
        if crate::path_security::is_checkpoint_internal_path(&path) {
            continue;
        }
        let in_workspace = path
            .canonicalize()
            .map(|c| c.starts_with(&cwd_canonical))
            .unwrap_or(false);
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

    #[test]
    fn a_brace_pattern_matches_each_of_its_alternatives() {
        let root = tempfile::tempdir().expect("temp dir");
        for file in [
            "src/a.js",
            "src/b.json",
            "src/c.md",
            "test/d.js",
            "notes/e.js",
        ] {
            let path = root.path().join(file);
            std::fs::create_dir_all(path.parent().expect("parent")).expect("dir");
            std::fs::write(path, "").expect("file");
        }
        let names = |pattern: &str| {
            let mut names = glob_matches(&format!("{}/{pattern}", root.path().display()))
                .expect("valid pattern")
                .into_iter()
                .map(|path| {
                    path.strip_prefix(root.path())
                        .expect("under root")
                        .display()
                        .to_string()
                })
                .collect::<Vec<_>>();
            names.sort();
            names
        };

        assert_eq!(
            names("**/*.{js,json}"),
            ["notes/e.js", "src/a.js", "src/b.json", "test/d.js"]
        );
        assert_eq!(names("{src,test}/*.js"), ["src/a.js", "test/d.js"]);
        assert_eq!(
            names("{src,{test,notes}}/*.js"),
            ["notes/e.js", "src/a.js", "test/d.js"]
        );
        assert_eq!(names("src/*.{js,js}"), ["src/a.js"]);
    }

    const WITHHELD_VALUE: &str = "EXAMPLE-NOT-A-REAL-BILLING-KEY";

    #[test]
    fn a_match_inside_a_credential_file_never_reaches_the_answer() {
        let raw = format!(
            "src/billing.rs:12:const KEY_NAME: &str = \"STRIPE_KEY\";\n\
             .env:3:STRIPE_SECRET_KEY={WITHHELD_VALUE}\n\
             apps/web/.env.production:1:DATABASE_URL=postgres://user:pw@host/db\n\
             deploy/id_rsa:1:OPENSSH_KEY_BODY_PLACEHOLDER\n\
             certs/server.pem:1:PEM_KEY_BODY_PLACEHOLDER\n\
             docs/development/README.md:9:copy .env.example to .env\n"
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
        let raw = "src/a.rs:1:fn main() {}\nsrc/b.rs:2:let key = 1;\n".to_string();

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
            let line = format!("{path}:7:value");
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
            matched_file(r"C:\repo\apps\.env:4:TOKEN=x"),
            Some(r"C:\repo\apps\.env")
        );
        assert_eq!(matched_file("src/a.rs:12:let x = 1;"), Some("src/a.rs"));
        assert_eq!(matched_file("Binary file .env matches"), None);

        let (kept, withheld) = withhold_credential_matches(r"C:\repo\apps\.env:4:TOKEN=x");
        assert_eq!(withheld, 1, "a Windows path was not attributed: {kept}");
    }

    #[test]
    fn a_line_with_no_line_number_is_attributed_by_its_leading_path() {
        let (kept, withheld) = withhold_credential_matches(".env:TOKEN=x\nsrc/a.rs:fn main()");
        assert_eq!(withheld, 1);
        assert_eq!(kept, "src/a.rs:fn main()");
    }

    #[tokio::test]
    async fn a_search_finds_an_alternation_and_a_class_the_model_writes_in_regex_syntax() {
        let root = tempfile::tempdir().expect("temp dir");
        let root_path = root.path().canonicalize().expect("canonical root");
        std::fs::create_dir_all(root_path.join("src")).expect("src");
        std::fs::write(
            root_path.join("src/store.js"),
            "function run(argv) {\n  return save(tmp);\n}\nmodule.exports = { run };\n",
        )
        .expect("store");
        let src = root_path.join("src").display().to_string();
        let search = |pattern: &str| {
            HashMap::from([
                ("pattern".to_string(), pattern.to_string()),
                ("path".to_string(), src.clone()),
            ])
        };
        let (searched, grepped) = crate::path_security::scope_workspace_paths(
            Some(root_path.clone()),
            Vec::new(),
            async {
                let searched = execute_search_files(&search(r"run\s*\(|exports"))
                    .await
                    .expect("search_files");
                let mut grep_args = search("tmp|renameSync|writeFileSync");
                grep_args.insert("include".to_string(), "*.js".to_string());
                let grepped = execute_grep_files(&grep_args, true)
                    .await
                    .expect("grep_files");
                (searched, grepped)
            },
        )
        .await;
        assert!(searched.success, "{}", searched.output);
        assert!(
            searched.output.contains(":1:function run(argv)"),
            "{}",
            searched.output
        );
        assert!(
            searched.output.contains(":4:module.exports"),
            "{}",
            searched.output
        );
        assert!(grepped.success, "{}", grepped.output);
        assert!(
            grepped.output.contains(":2:  return save(tmp);"),
            "{}",
            grepped.output
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_pattern_grep_refuses_is_reported_rather_than_read_as_no_matches() {
        use std::os::unix::process::ExitStatusExt;
        let output = |code: i32, stdout: &str, stderr: &str| std::process::Output {
            status: std::process::ExitStatus::from_raw(code << 8),
            stdout: stdout.as_bytes().to_vec(),
            stderr: stderr.as_bytes().to_vec(),
        };
        let refused =
            grep_fallback_answer("run(", &output(2, "", "grep: parentheses not balanced"));
        assert!(!refused.success);
        assert!(
            refused.output.contains("parentheses not balanced"),
            "{}",
            refused.output
        );
        let none = grep_fallback_answer("absent", &output(1, "", ""));
        assert!(none.success);
        assert_eq!(none.output, "No matches for: absent");
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
}
