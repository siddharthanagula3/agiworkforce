use crate::agent::AgentSession;
use crate::config::CliConfig;
use crate::context::SystemContext;
use crate::terminal_style as ts;
use crate::terminal_text::sanitize_terminal_text;
use anyhow::Result;
use colored::Colorize;

#[derive(Debug, Clone, Default)]
pub struct ReviewOptions {
    #[allow(dead_code)]
    pub uncommitted: bool,
    pub base_branch: Option<String>,
    pub commit: Option<String>,
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
    let model = options.model.as_deref().unwrap_or(&config.default.model);
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
    let prompt = format!(
        "Review this diff:\n```diff\n{}\n```{}",
        truncate_on_char_boundary(&diff, 100_000),
        extra_instructions
    );
    let result = session.send(config, &prompt, Box::new(|_chunk| {})).await?;
    let review = parse_review(&result.response);
    print_review(&review);
    Ok(review)
}

async fn gather_diff(opts: &ReviewOptions) -> Result<String> {
    if let Some(ref c) = opts.commit {
        let o = tokio::process::Command::new("git")
            .args(["show", "--patch", c])
            .output()
            .await?;
        return Ok(String::from_utf8_lossy(&o.stdout).to_string());
    }
    if let Some(ref b) = opts.base_branch {
        let o = tokio::process::Command::new("git")
            .args(["diff", &format!("{}...HEAD", b)])
            .output()
            .await?;
        return Ok(String::from_utf8_lossy(&o.stdout).to_string());
    }
    let staged = tokio::process::Command::new("git")
        .args(["diff", "--cached"])
        .output()
        .await?;
    let unstaged = tokio::process::Command::new("git")
        .args(["diff"])
        .output()
        .await?;
    Ok(format!(
        "{}{}",
        String::from_utf8_lossy(&staged.stdout),
        String::from_utf8_lossy(&unstaged.stdout)
    ))
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

    #[test]
    fn parse_review_strips_escapes_from_an_unparseable_reply() {
        let review = parse_review(&format!("not json{CLIPBOARD_WRITE}at all"));
        assert_eq!(review.overall_explanation, "not jsonat all");
    }

    #[test]
    fn format_review_never_emits_a_model_supplied_escape() {
        let review = ReviewOutput {
            overall_explanation: format!("summary{CLIPBOARD_WRITE}"),
            severity: format!("weird\u{1b}[2J"),
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
}
