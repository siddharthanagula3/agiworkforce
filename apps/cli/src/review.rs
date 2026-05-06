use crate::agent::AgentSession;
use crate::config::CliConfig;
use crate::context::SystemContext;
use anyhow::Result;
use colored::Colorize;

#[derive(Debug, Clone, Default)]
pub struct ReviewOptions {
    // uncommitted and instructions are part of the public ReviewOptions API.
    // They are set by the caller but not yet consumed in all code paths.
    #[allow(dead_code)]
    pub uncommitted: bool,
    pub base_branch: Option<String>,
    pub commit: Option<String>,
    #[allow(dead_code)]
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
        println!("{}", "No changes to review.".green());
        return Ok(ReviewOutput {
            overall_explanation: "No changes.".into(),
            severity: "clean".into(),
            issues: vec![],
            suggestions: vec![],
        });
    }
    let model = options.model.as_deref().unwrap_or(&config.default.model);
    let mut session = AgentSession::new(model, sys_context, Some(REVIEW_PROMPT));
    session.max_turns = Some(1);
    session.quiet = true;
    let prompt = format!(
        "Review this diff:\n```diff\n{}\n```",
        if diff.len() > 100_000 {
            &diff[..100_000]
        } else {
            &diff
        }
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

fn parse_review(text: &str) -> ReviewOutput {
    if let Ok(r) = serde_json::from_str::<ReviewOutput>(text) {
        return r;
    }
    if let Some(s) = text.find('{') {
        if let Some(e) = text.rfind('}') {
            if let Ok(r) = serde_json::from_str::<ReviewOutput>(&text[s..=e]) {
                return r;
            }
        }
    }
    ReviewOutput {
        overall_explanation: text.to_string(),
        severity: "minor".into(),
        issues: vec![],
        suggestions: vec![],
    }
}

fn print_review(review: &ReviewOutput) {
    println!("\n{}", "Code Review Results".bold());
    println!(
        "Severity: {}",
        match review.severity.as_str() {
            "clean" => "CLEAN".green().bold(),
            "minor" => "MINOR".yellow().bold(),
            "major" | "critical" => "CRITICAL".red().bold(),
            _ => review.severity.white().bold(),
        }
    );
    println!("{}", review.overall_explanation);
    for (i, issue) in review.issues.iter().enumerate() {
        let line = issue.line.map(|l| format!(":{}", l)).unwrap_or_default();
        println!(
            "  {}. [{}] {}{}: {}",
            i + 1,
            issue.severity.to_uppercase(),
            issue.file,
            line,
            issue.description
        );
    }
}
