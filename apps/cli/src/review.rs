use crate::agent::AgentSession;
use crate::config::CliConfig;
use crate::context::SystemContext;
use crate::terminal_style as ts;
use crate::terminal_text::sanitize_terminal_text;
use agiworkforce_worktree::config_guard::ConfigUse;
use anyhow::Result;
use colored::Colorize;
use std::path::Path;

#[derive(Debug, Clone, Default)]
pub struct ReviewOptions {
    #[allow(dead_code)]
    pub uncommitted: bool,
    pub base_branch: Option<String>,
    pub commit: Option<String>,
    pub pull_request: Option<String>,
    pub post: bool,
    pub instructions: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ReviewOutput {
    pub overall_explanation: String,
    pub severity: String,
    #[serde(default)]
    pub issues: Vec<ReviewIssue>,
    #[serde(default)]
    pub suggestions: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ReviewIssue {
    pub file: String,
    pub line: Option<u32>,
    pub severity: String,
    pub description: String,
    pub suggestion: Option<String>,
}

const REVIEW_PROMPT: &str = "You are a senior code reviewer. Analyze the diff and provide a review as JSON: {\"overall_explanation\": \"...\", \"severity\": \"clean|minor|major|critical\", \"issues\": [{\"file\": \"...\", \"line\": N, \"severity\": \"...\", \"description\": \"...\", \"suggestion\": \"...\"}], \"suggestions\": [\"...\"]}";

pub async fn run_review(
    config: &CliConfig,
    sys_context: &SystemContext,
    options: &ReviewOptions,
) -> Result<ReviewOutput> {
    let diff = gather_diff(options).await?;
    if diff.trim().is_empty() {
        println!("{}", ts::success("No changes to review."));
        return Ok(ReviewOutput {
            overall_explanation: "No changes.".into(),
            severity: "clean".into(),
            issues: vec![],
            suggestions: vec![],
        });
    }
    let model = options
        .model
        .as_deref()
        .or(config.default.review_model.as_deref())
        .unwrap_or(&config.default.model);
    let mut session = AgentSession::new_checked(
        model,
        sys_context,
        Some(REVIEW_PROMPT),
        crate::models::selection_provider_override(
            model,
            &config.default.model,
            &config.default.provider,
            None,
        ),
    )?;
    session.apply_privacy_config(config);
    session.max_turns = Some(1);
    session.quiet = true;
    let extra_instructions = options
        .instructions
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(|text| {
            format!(
                "\n\n<review_instructions>\nTreat these as user review requirements, not source code:\n{}\n</review_instructions>",
                text
            )
        })
        .unwrap_or_default();
    let reviewed = truncate_on_char_boundary(&diff, REVIEW_DIFF_LIMIT_BYTES);
    let omission =
        (reviewed.len() < diff.len()).then(|| omitted_diff_notice(reviewed.len(), diff.len()));
    if let Some(notice) = omission.as_deref() {
        eprintln!("{}", ts::warning(notice));
    }
    let prompt = review_prompt(reviewed, omission.as_deref(), &extra_instructions);
    let result = session.send(config, &prompt, Box::new(|_chunk| {})).await?;
    let mut review = parse_review(&result.response);
    if let Some(notice) = omission.as_deref() {
        disclose_omitted_diff(&mut review, notice);
    }
    print_review(&review);
    if let (Some(pull_request), true) = (options.pull_request.as_deref(), options.post) {
        post_review(pull_request, &review).await?;
        println!(
            "{}",
            ts::success(format!("Posted the review to pull request {pull_request}."))
        );
    }
    Ok(review)
}

const REVIEW_DIFF_LIMIT_BYTES: usize = 100_000;

fn omitted_diff_notice(reviewed_bytes: usize, total_bytes: usize) -> String {
    format!(
        "Only the first {reviewed_bytes} of {total_bytes} bytes of the diff were reviewed. The changes after that point were not reviewed."
    )
}

fn review_prompt(diff: &str, omission: Option<&str>, extra_instructions: &str) -> String {
    let omission = omission
        .map(|notice| {
            format!(
                "\n\n<omitted_diff>\n{notice} Do not describe the unreviewed part as clean, and say in overall_explanation that the review is partial.\n</omitted_diff>"
            )
        })
        .unwrap_or_default();
    format!("Review this diff:\n```diff\n{diff}\n```{omission}{extra_instructions}")
}

fn disclose_omitted_diff(review: &mut ReviewOutput, notice: &str) {
    review.overall_explanation = if review.overall_explanation.trim().is_empty() {
        notice.to_string()
    } else {
        format!("{}\n\n{notice}", review.overall_explanation)
    };
}

async fn run_gh(args: &[&str], stdin: Option<&str>) -> Result<String> {
    let mut command = tokio::process::Command::new("gh");
    command
        .args(args)
        .stdin(if stdin.is_some() {
            std::process::Stdio::piped()
        } else {
            std::process::Stdio::null()
        })
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            anyhow::bail!(
                "Reviewing a pull request needs the GitHub CLI. Install gh, run `gh auth login`, then try again."
            )
        }
        Err(error) => return Err(error.into()),
    };
    if let (Some(input), Some(mut pipe)) = (stdin, child.stdin.take()) {
        tokio::io::AsyncWriteExt::write_all(&mut pipe, input.as_bytes()).await?;
    }
    let output = child.wait_with_output().await?;
    if !output.status.success() {
        anyhow::bail!(
            "gh {} failed: {}",
            args.iter().take(2).copied().collect::<Vec<_>>().join(" "),
            sanitize_terminal_text(String::from_utf8_lossy(&output.stderr).trim())
        );
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

async fn post_review(pull_request: &str, review: &ReviewOutput) -> Result<()> {
    run_gh(
        &[
            "pr",
            "review",
            pull_request,
            "--comment",
            "--body-file",
            "-",
        ],
        Some(&format_review_markdown(review)),
    )
    .await
    .map(|_| ())
}

fn format_review_markdown(review: &ReviewOutput) -> String {
    let mut out = format!(
        "**Code review: {}**\n\n{}\n",
        clean(&review.severity),
        clean(&review.overall_explanation)
    );
    for issue in &review.issues {
        let line = issue.line.map(|l| format!(":{l}")).unwrap_or_default();
        out.push_str(&format!(
            "\n- **{}** `{}{}`: {}",
            clean(&issue.severity).to_uppercase(),
            clean(&issue.file),
            line,
            clean(&issue.description)
        ));
        if let Some(suggestion) = issue
            .suggestion
            .as_deref()
            .filter(|text| !text.trim().is_empty())
        {
            out.push_str(&format!("\n  Suggestion: {}", clean(suggestion)));
        }
    }
    for suggestion in &review.suggestions {
        out.push_str(&format!("\n- {}", clean(suggestion)));
    }
    out
}

/// The diff to review, read with host git hardened and with no diff driver or
/// text conversion the repository's configuration names, since those run
/// programs outside the sandbox, and without looking inside submodules, whose
/// `.git` file a sandboxed command can point at a git directory it wrote. A
/// filter or signing program still could run, so the repository's settings
/// are checked first.
async fn gather_diff(opts: &ReviewOptions) -> Result<String> {
    if let Some(ref pull_request) = opts.pull_request {
        return run_gh(&["pr", "diff", pull_request], None).await;
    }
    const NO_DRIVERS: [&str; 3] = [
        "--no-ext-diff",
        "--no-textconv",
        "--ignore-submodules=dirty",
    ];
    let cwd = std::env::current_dir()?;
    let uses = if opts.commit.is_some() {
        ConfigUse::SHOW
    } else {
        ConfigUse::DIFF
    };
    for (flag, value) in [("--commit", &opts.commit), ("--base", &opts.base_branch)] {
        if value.as_deref().is_some_and(|value| value.starts_with('-')) {
            anyhow::bail!("{flag} names a revision, so it must not start with '-'");
        }
    }
    crate::platform::runtime::git::check_repository_config(&cwd, uses).await?;
    if let Some(ref c) = opts.commit {
        let mut command = agiworkforce_worktree::host_git_async();
        command
            .args(["show", "--patch"])
            .args(NO_DRIVERS)
            .arg("--end-of-options")
            .arg(c);
        let o = review_git(command).await?;
        return Ok(String::from_utf8_lossy(&o.stdout).to_string());
    }
    if let Some(ref b) = opts.base_branch {
        let mut command = agiworkforce_worktree::host_git_async();
        command
            .arg("diff")
            .args(NO_DRIVERS)
            .arg("--end-of-options")
            .arg(format!("{}...HEAD", b));
        let o = review_git(command).await?;
        return Ok(String::from_utf8_lossy(&o.stdout).to_string());
    }
    let mut staged = agiworkforce_worktree::host_git_async();
    staged.args(["diff", "--cached"]).args(NO_DRIVERS);
    let staged = review_git(staged).await?;
    let mut unstaged = agiworkforce_worktree::host_git_async();
    unstaged.arg("diff").args(NO_DRIVERS);
    let unstaged = review_git(unstaged).await?;
    let mut untracked = agiworkforce_worktree::host_git_async();
    untracked.args(["ls-files", "--others", "--exclude-standard", "-z"]);
    let untracked = review_git(untracked).await?;
    Ok(format!(
        "{}{}{}",
        String::from_utf8_lossy(&staged.stdout),
        String::from_utf8_lossy(&unstaged.stdout),
        untracked_as_additions(&cwd, &untracked.stdout)
    ))
}

/// Files git does not track yet, named NUL-separated in `listing` relative to
/// `root`, as the diff that would add them. A link is never followed, and a
/// file the credential policy covers is named without its contents.
fn untracked_as_additions(root: &Path, listing: &[u8]) -> String {
    let mut diff = String::new();
    for name in listing
        .split(|byte| *byte == 0)
        .filter(|name| !name.is_empty())
    {
        let name = String::from_utf8_lossy(name);
        diff.push_str(&format!(
            "diff --git a/{name} b/{name}\nnew file, not yet tracked by git\n"
        ));
        if crate::sensitive_files::is_sensitive_file(&name) {
            diff.push_str("[contents not sent: the credential-file policy covers this file]\n");
            continue;
        }
        let path = root.join(&*name);
        let text = std::fs::symlink_metadata(&path)
            .ok()
            .filter(|found| found.is_file() && found.len() <= REVIEW_DIFF_LIMIT_BYTES as u64)
            .and_then(|_| std::fs::read(&path).ok())
            .and_then(|bytes| String::from_utf8(bytes).ok());
        let Some(text) = text else {
            diff.push_str(&format!(
                "[contents not sent: a link, binary, unreadable or larger than \
                 {REVIEW_DIFF_LIMIT_BYTES} bytes]\n"
            ));
            continue;
        };
        diff.push_str(&format!(
            "--- /dev/null\n+++ b/{name}\n@@ -0,0 +1,{} @@\n",
            text.lines().count()
        ));
        for line in text.lines() {
            diff.push('+');
            diff.push_str(line);
            diff.push('\n');
        }
    }
    diff
}

async fn review_git(command: tokio::process::Command) -> Result<std::process::Output> {
    let output = crate::process_tree::output(
        command,
        None,
        Some(crate::platform::runtime::git::GIT_OPERATION_TIMEOUT),
    )
    .await
    .map_err(|error| anyhow::anyhow!(crate::platform::runtime::git::host_git_failure(&error)))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr);
        match sanitize_terminal_text(detail.trim()).trim() {
            "" => anyhow::bail!("git could not read the changes to review."),
            detail => anyhow::bail!("git could not read the changes to review: {detail}"),
        }
    }
    Ok(output)
}

/// Truncate `s` to at most `max_bytes`, never splitting a multi-byte UTF-8
/// character. Byte-index slicing (`&s[..max_bytes]`) panics when the boundary
/// falls inside a multi-byte char; this walks back to the nearest char start.
fn truncate_on_char_boundary(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    // Walk down from max_bytes to the nearest valid char boundary (always
    // found at or before index 0, which is always a boundary).
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// Parse the model's reply into a `ReviewOutput`, stripping terminal escapes
/// from every field it carries.
///
/// The reviewed diff comes from a checkout the operator may not trust, the
/// model quotes it back, and `serde_json` decodes `\u001b` into a real ESC
/// byte. Sanitizing here, the single place a model reply becomes a
/// `ReviewOutput`, keeps the escape out of stdout and out of the value
/// returned to callers.
fn parse_review(text: &str) -> ReviewOutput {
    if let Ok(r) = serde_json::from_str::<ReviewOutput>(text) {
        return sanitize_review(r);
    }
    if let Some(s) = text.find('{') {
        if let Some(e) = text.rfind('}') {
            if let Ok(r) = serde_json::from_str::<ReviewOutput>(&text[s..=e]) {
                return sanitize_review(r);
            }
        }
    }
    sanitize_review(ReviewOutput {
        overall_explanation: text.to_string(),
        severity: "minor".into(),
        issues: vec![],
        suggestions: vec![],
    })
}

fn clean(text: &str) -> String {
    sanitize_terminal_text(text).into_owned()
}

fn sanitize_review(mut review: ReviewOutput) -> ReviewOutput {
    review.overall_explanation = clean(&review.overall_explanation);
    review.severity = clean(&review.severity);
    for issue in review.issues.iter_mut() {
        issue.file = clean(&issue.file);
        issue.severity = clean(&issue.severity);
        issue.description = clean(&issue.description);
        issue.suggestion = issue.suggestion.as_deref().map(clean);
    }
    for suggestion in review.suggestions.iter_mut() {
        *suggestion = clean(suggestion);
    }
    review
}

fn print_review(review: &ReviewOutput) {
    println!("{}", format_review(review));
}

/// Render the review block. Returns the text instead of printing it so the
/// escape-stripping this path depends on is testable without a terminal.
fn format_review(review: &ReviewOutput) -> String {
    let severity = match review.severity.as_str() {
        "clean" => ts::success_header("CLEAN"),
        "minor" => ts::warning_header("MINOR"),
        "major" => ts::danger_header("MAJOR"),
        "critical" => ts::danger_header("CRITICAL"),
        other => ts::header(clean(other)),
    };
    let mut out = format!(
        "\n{}\nSeverity: {}\n{}",
        "Code Review Results".bold(),
        severity,
        clean(&review.overall_explanation)
    );
    for (i, issue) in review.issues.iter().enumerate() {
        let line = issue.line.map(|l| format!(":{}", l)).unwrap_or_default();
        out.push_str(&format!(
            "\n  {}. [{}] {}{}: {}",
            i + 1,
            clean(&issue.severity).to_uppercase(),
            clean(&issue.file),
            line,
            clean(&issue.description)
        ));
        if let Some(suggestion) = issue
            .suggestion
            .as_deref()
            .filter(|text| !text.trim().is_empty())
        {
            out.push_str(&format!("\n     Suggestion: {}", clean(suggestion)));
        }
    }
    if !review.suggestions.is_empty() {
        out.push_str("\nSuggestions:");
        for suggestion in &review.suggestions {
            out.push_str(&format!("\n  - {}", clean(suggestion)));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLIPBOARD_WRITE: &str = "\u{1b}]52;c;cm0gLXJmIC8=\u{7}";

    fn issue_with(text: &str) -> ReviewIssue {
        ReviewIssue {
            file: format!("src/{text}lib.rs"),
            line: Some(7),
            severity: format!("maj{text}or"),
            description: format!("looks{text} fine"),
            suggestion: Some(format!("do{text} this")),
        }
    }

    #[test]
    fn parse_review_strips_escapes_from_model_json() {
        let reply = serde_json::json!({
            "overall_explanation": format!("all good{CLIPBOARD_WRITE}"),
            "severity": format!("cl{CLIPBOARD_WRITE}ean"),
            "issues": [{
                "file": format!("a{CLIPBOARD_WRITE}.rs"),
                "line": 3,
                "severity": "minor",
                "description": format!("d{CLIPBOARD_WRITE}esc"),
                "suggestion": format!("s{CLIPBOARD_WRITE}ug"),
            }],
            "suggestions": [format!("tip{CLIPBOARD_WRITE}")],
        })
        .to_string();

        let review = parse_review(&reply);

        assert_eq!(review.overall_explanation, "all good");
        assert_eq!(review.severity, "clean");
        assert_eq!(review.issues[0].file, "a.rs");
        assert_eq!(review.issues[0].description, "desc");
        assert_eq!(review.issues[0].suggestion.as_deref(), Some("sug"));
        assert_eq!(review.suggestions[0], "tip");
    }

    #[tokio::test]
    async fn a_revision_shaped_as_an_option_is_refused_before_git_runs() {
        for (commit, base) in [
            (Some("--output=/tmp/planted".to_string()), None),
            (None, Some("--upload-pack=./planted.sh".to_string())),
        ] {
            let opts = ReviewOptions {
                uncommitted: false,
                base_branch: base,
                commit,
                pull_request: None,
                post: false,
                instructions: None,
                model: None,
            };
            let refused = gather_diff(&opts)
                .await
                .expect_err("an option is not a revision");
            assert!(
                refused.to_string().contains("must not start with '-'"),
                "{refused}"
            );
        }
    }

    #[tokio::test]
    async fn a_failed_git_read_is_an_error_not_an_empty_diff() {
        let repository = tempfile::tempdir().expect("temp dir");
        let mut init = agiworkforce_worktree::host_git_async();
        init.current_dir(repository.path())
            .args(["init", "--quiet"]);
        review_git(init).await.expect("git init");

        let mut clean_diff = agiworkforce_worktree::host_git_async();
        clean_diff.current_dir(repository.path()).arg("diff");
        let clean = review_git(clean_diff)
            .await
            .expect("an empty diff is a result");
        assert!(clean.stdout.is_empty());

        let mut missing_revision = agiworkforce_worktree::host_git_async();
        missing_revision.current_dir(repository.path()).args([
            "show",
            "--patch",
            "--end-of-options",
            "no-such-revision",
        ]);
        let refused = review_git(missing_revision)
            .await
            .expect_err("an unknown revision must not read as no changes");
        assert!(
            refused
                .to_string()
                .starts_with("git could not read the changes to review"),
            "{refused}"
        );
    }

    #[test]
    fn a_diff_past_the_limit_is_reviewed_as_partial_and_says_so() {
        let diff = format!("{}é tail", "a".repeat(REVIEW_DIFF_LIMIT_BYTES - 1));
        let reviewed = truncate_on_char_boundary(&diff, REVIEW_DIFF_LIMIT_BYTES);
        assert_eq!(reviewed.len(), REVIEW_DIFF_LIMIT_BYTES - 1);
        let notice = omitted_diff_notice(reviewed.len(), diff.len());
        assert!(notice.contains(&format!("{} of {}", reviewed.len(), diff.len())));

        let prompt = review_prompt(reviewed, Some(&notice), "");
        assert!(!prompt.contains("tail"));
        assert!(prompt.contains("<omitted_diff>"));
        assert!(prompt.contains(&notice));

        let mut review =
            parse_review(r#"{"overall_explanation":"Looks fine.","severity":"clean"}"#);
        disclose_omitted_diff(&mut review, &notice);
        assert_eq!(
            review.overall_explanation,
            format!("Looks fine.\n\n{notice}")
        );
        assert!(format_review_markdown(&review).contains(&notice));
    }

    #[test]
    fn a_diff_within_the_limit_has_no_omission_notice() {
        let prompt = review_prompt("+one line", None, "");
        assert_eq!(prompt, "Review this diff:\n```diff\n+one line\n```");
    }

    #[test]
    fn parse_review_strips_escapes_from_an_unparseable_reply() {
        let review = parse_review(&format!("not json{CLIPBOARD_WRITE}at all"));
        assert_eq!(review.overall_explanation, "not jsonat all");
    }

    #[test]
    fn format_review_never_emits_a_model_supplied_escape() {
        let review = ReviewOutput {
            overall_explanation: format!("summary{CLIPBOARD_WRITE}"),
            severity: "weird\u{1b}[2J".to_string(),
            issues: vec![issue_with(CLIPBOARD_WRITE)],
            suggestions: vec![],
        };

        let out = format_review(&review);

        assert!(!out.contains("\u{1b}]"), "OSC survived: {out:?}");
        assert!(!out.contains("52;c"), "clipboard payload survived: {out:?}");
        assert!(!out.contains("\u{1b}[2J"), "screen clear survived: {out:?}");
        assert!(!out.contains('\u{7}'), "BEL survived: {out:?}");
        assert!(out.contains("summary"));
        assert!(out.contains("src/lib.rs"));
        assert!(out.contains("looks fine"));
    }

    #[test]
    fn the_terminal_review_shows_every_suggestion() {
        let review = ReviewOutput {
            overall_explanation: "One issue.".to_string(),
            severity: "minor".to_string(),
            issues: vec![issue_with("")],
            suggestions: vec!["add a test for the empty case".to_string()],
        };

        let out = format_review(&review);

        assert!(out.contains("Suggestion: do this"), "{out}");
        assert!(out.contains("add a test for the empty case"), "{out}");
    }

    #[tokio::test]
    async fn a_new_untracked_file_is_reviewed_as_an_addition() {
        let repository = tempfile::tempdir().expect("temp dir");
        let mut init = agiworkforce_worktree::host_git_async();
        init.current_dir(repository.path())
            .args(["init", "--quiet"]);
        review_git(init).await.expect("git init");
        std::fs::create_dir(repository.path().join("src")).expect("src");
        std::fs::write(
            repository.path().join("src").join("new_feature.rs"),
            "pub fn added() {}\n",
        )
        .expect("new file");
        std::fs::write(
            repository.path().join(".env"),
            "TOKEN=EXAMPLE-NOT-A-SECRET\n",
        )
        .expect("env file");

        let mut listing = agiworkforce_worktree::host_git_async();
        listing.current_dir(repository.path()).args([
            "ls-files",
            "--others",
            "--exclude-standard",
            "-z",
        ]);
        let listing = review_git(listing).await.expect("ls-files");
        let diff = untracked_as_additions(repository.path(), &listing.stdout);

        assert!(diff.contains("+++ b/src/new_feature.rs"), "{diff}");
        assert!(diff.contains("+pub fn added() {}"), "{diff}");
        assert!(!diff.contains("EXAMPLE-NOT-A-SECRET"), "{diff}");

        let credential = untracked_as_additions(repository.path(), b".env\0");
        assert!(
            credential.contains("diff --git a/.env b/.env"),
            "{credential}"
        );
        assert!(!credential.contains("EXAMPLE-NOT-A-SECRET"), "{credential}");
    }

    #[cfg(unix)]
    #[test]
    fn an_untracked_link_is_named_but_never_followed() {
        let repository = tempfile::tempdir().expect("temp dir");
        let outside = tempfile::tempdir().expect("outside");
        std::fs::write(outside.path().join("private.txt"), "OUTSIDE-THE-REPO\n").expect("target");
        std::os::unix::fs::symlink(
            outside.path().join("private.txt"),
            repository.path().join("linked.txt"),
        )
        .expect("link");

        let diff = untracked_as_additions(repository.path(), b"linked.txt\0");

        assert!(
            diff.contains("diff --git a/linked.txt b/linked.txt"),
            "{diff}"
        );
        assert!(!diff.contains("OUTSIDE-THE-REPO"), "{diff}");
    }
}
