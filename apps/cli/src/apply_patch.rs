#![allow(dead_code, unused_imports)]
use std::path::Path;
use anyhow::Result;
use colored::Colorize;

#[derive(Debug)]
pub struct PatchResult {
    pub applied: Vec<String>,
    pub skipped: Vec<String>,
    pub conflicted: Vec<String>,
    pub exit_code: i32,
}

pub async fn apply_git_patch(patch: &str, cwd: Option<&Path>) -> Result<PatchResult> {
    let cwd = cwd.unwrap_or_else(|| Path::new("."));
    let tmp = std::env::temp_dir().join(format!("agi-patch-{}.patch", uuid::Uuid::new_v4()));
    std::fs::write(&tmp, patch)?;
    let stat = tokio::process::Command::new("git").args(["apply", "--stat"]).arg(&tmp).current_dir(cwd).output().await?;
    let apply = tokio::process::Command::new("git").args(["apply", "--verbose"]).arg(&tmp).current_dir(cwd).output().await?;
    let _ = std::fs::remove_file(&tmp);
    let mut applied = Vec::new();
    for line in String::from_utf8_lossy(&stat.stdout).lines() {
        if let Some(f) = line.split('|').next() { let t = f.trim(); if !t.is_empty() { applied.push(t.to_string()); } }
    }
    let code = apply.status.code().unwrap_or(1);
    let mut conflicted = Vec::new();
    let mut skipped = Vec::new();
    if code != 0 {
        for line in String::from_utf8_lossy(&apply.stderr).lines() {
            if line.contains("conflict") || line.contains("rejected") { conflicted.push(line.to_string()); }
            else if line.contains("already exists") { skipped.push(line.to_string()); }
        }
    }
    Ok(PatchResult { applied, skipped, conflicted, exit_code: code })
}

pub async fn apply_from_session(session_id: &str) -> Result<PatchResult> {
    let conn = crate::sessions::open_db()?;
    let messages = crate::sessions::load_session(&conn, session_id)?;
    let diff = messages.iter().rev().find_map(|m| {
        let t = m.text_content();
        if t.contains("diff --git") || t.contains("---") { Some(t) } else { None }
    });
    match diff {
        Some(patch) => apply_git_patch(&patch, None).await,
        None => anyhow::bail!("No diff found in session '{}'", session_id),
    }
}

pub async fn apply_from_file(path: &Path) -> Result<PatchResult> {
    let patch = std::fs::read_to_string(path)?;
    apply_git_patch(&patch, None).await
}

pub fn print_patch_result(result: &PatchResult) {
    for f in &result.applied { println!("  {} {}", "+".green(), f); }
    for f in &result.skipped { println!("  {} {}", "~".yellow(), f); }
    for f in &result.conflicted { println!("  {} {}", "!".red(), f); }
    if result.exit_code == 0 { println!("{}", "Patch applied.".green().bold()); }
    else if result.conflicted.is_empty() { println!("{}", "Patch applied with warnings.".yellow().bold()); }
    else { println!("{}", "Patch had conflicts.".red().bold()); }
}
