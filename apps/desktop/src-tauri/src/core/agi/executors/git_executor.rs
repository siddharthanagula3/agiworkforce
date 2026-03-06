//! Git operations executor.
//!
//! Handles Git version control operations including status, init, add, commit,
//! push, and clone operations. All operations include security validations
//! to prevent path traversal attacks.
//!
//! # Tools
//!
//! - `git_status` - Get repository status (branch, staged, modified, untracked files)
//! - `git_init` - Initialize a new git repository
//! - `git_add` - Stage files for commit
//! - `git_commit` - Create a commit with staged changes
//! - `git_push` - Push commits to a remote repository
//! - `git_clone` - Clone a remote repository
//!
//! # Conflict Resolution
//!
//! This module also provides merge conflict detection and resolution capabilities:
//! - Detect files with merge conflicts after merge/rebase operations
//! - Parse conflict markers (<<<<<<, =======, >>>>>>) to extract "ours" vs "theirs"
//! - Suggest resolutions using LLM assistance
//! - Apply resolutions (keep ours, keep theirs, manual merge)
//!
//! # Security
//!
//! All path operations are validated against allowed directories to prevent
//! path traversal attacks. SSH and HTTPS authentication is supported for
//! remote operations.

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use crate::core::llm::{ChatMessage, LLMRequest, LLMRouter, RouterPreferences};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;

// ============================================================================
// Conflict Resolution Types
// ============================================================================

/// Represents a single conflict hunk within a file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictHunk {
    /// Line number where the conflict starts (1-indexed).
    pub start_line: usize,
    /// Line number where the conflict ends (1-indexed).
    pub end_line: usize,
    /// The "ours" (HEAD/current branch) version of the conflicted content.
    pub ours: String,
    /// The "theirs" (incoming/merged branch) version of the conflicted content.
    pub theirs: String,
    /// Optional: the common ancestor content (for diff3 style markers).
    pub base: Option<String>,
    /// The branch/commit name for "ours" (extracted from marker).
    pub ours_label: Option<String>,
    /// The branch/commit name for "theirs" (extracted from marker).
    pub theirs_label: Option<String>,
}

/// Represents all conflicts within a single file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileConflict {
    /// Relative path to the file within the repository.
    pub file_path: String,
    /// The full content of the file with conflict markers.
    pub full_content: String,
    /// Individual conflict hunks within this file.
    pub hunks: Vec<ConflictHunk>,
    /// Total number of conflicts in this file.
    pub conflict_count: usize,
}

/// Resolution strategy for a conflict.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ResolutionStrategy {
    /// Keep the "ours" (HEAD/current branch) version.
    KeepOurs,
    /// Keep the "theirs" (incoming/merged branch) version.
    KeepTheirs,
    /// Keep both versions concatenated.
    KeepBoth,
    /// Use a manually provided merged content.
    Manual,
    /// Use LLM-suggested merged content.
    LlmSuggested,
}

/// A resolution applied to a specific hunk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HunkResolution {
    /// Index of the hunk within the file (0-indexed).
    pub hunk_index: usize,
    /// The resolution strategy used.
    pub strategy: ResolutionStrategy,
    /// The resolved content (used for Manual/LlmSuggested strategies).
    pub resolved_content: Option<String>,
}

/// Result of applying a resolution to a file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolutionResult {
    /// The file path that was resolved.
    pub file_path: String,
    /// Whether the resolution was successful.
    pub success: bool,
    /// The new content after resolution.
    pub resolved_content: Option<String>,
    /// Any error message if resolution failed.
    pub error: Option<String>,
    /// Number of conflicts that were resolved.
    pub conflicts_resolved: usize,
    /// Number of conflicts remaining (if any).
    pub conflicts_remaining: usize,
}

/// LLM-generated suggestion for resolving a conflict.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictSuggestion {
    /// The suggested merged content.
    pub suggested_content: String,
    /// Explanation of why this merge makes sense.
    pub explanation: String,
    /// Confidence score (0.0 to 1.0).
    pub confidence: f32,
    /// Whether the suggestion preserves functionality from both sides.
    pub preserves_both: bool,
}

// ============================================================================
// PR Creation Types
// ============================================================================

/// Configuration for creating a pull request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrCreationConfig {
    /// The base branch to merge into (e.g., "main", "develop").
    pub base_branch: String,
    /// The head branch containing changes (e.g., "feature/my-feature").
    pub head_branch: String,
    /// Whether to auto-generate the PR title using LLM.
    #[serde(default = "default_true")]
    pub auto_generate_title: bool,
    /// Whether to auto-generate the PR description using LLM.
    #[serde(default = "default_true")]
    pub auto_generate_description: bool,
    /// Whether to include a diff summary in the description.
    #[serde(default = "default_true")]
    pub include_diff_summary: bool,
    /// Optional custom title (overrides auto-generation if provided).
    pub custom_title: Option<String>,
    /// Optional custom description (overrides auto-generation if provided).
    pub custom_description: Option<String>,
    /// Whether to create as draft PR.
    #[serde(default)]
    pub draft: bool,
    /// Labels to add to the PR.
    #[serde(default)]
    pub labels: Vec<String>,
    /// Reviewers to request.
    #[serde(default)]
    pub reviewers: Vec<String>,
}

fn default_true() -> bool {
    true
}

impl Default for PrCreationConfig {
    fn default() -> Self {
        Self {
            base_branch: "main".to_string(),
            head_branch: String::new(),
            auto_generate_title: true,
            auto_generate_description: true,
            include_diff_summary: true,
            custom_title: None,
            custom_description: None,
            draft: false,
            labels: Vec::new(),
            reviewers: Vec::new(),
        }
    }
}

/// Result of creating a pull request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrCreationResult {
    /// The PR number assigned by GitHub.
    pub pr_number: u64,
    /// The URL of the created PR.
    pub pr_url: String,
    /// The generated or provided title.
    pub title: String,
    /// The generated or provided description.
    pub description: String,
    /// Whether the PR was created as a draft.
    pub draft: bool,
    /// Summary of files changed.
    pub files_changed: usize,
    /// Total additions.
    pub additions: usize,
    /// Total deletions.
    pub deletions: usize,
}

/// Summary of changes between two branches.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchDiffSummary {
    /// Base branch name.
    pub base_branch: String,
    /// Head branch name.
    pub head_branch: String,
    /// Number of commits ahead of base.
    pub commits_ahead: usize,
    /// List of commit summaries.
    pub commits: Vec<CommitSummary>,
    /// Files changed with their stats.
    pub files_changed: Vec<FileDiffStat>,
    /// Total lines added.
    pub total_additions: usize,
    /// Total lines deleted.
    pub total_deletions: usize,
    /// Overall diff content (truncated if too large).
    pub diff_content: String,
}

/// Summary of a single commit.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitSummary {
    /// Short commit hash (7 chars).
    pub hash_short: String,
    /// Full commit hash.
    pub hash_full: String,
    /// Commit message (first line).
    pub message: String,
    /// Full commit message.
    pub message_full: String,
    /// Author name.
    pub author: String,
    /// Author email.
    pub email: String,
    /// Commit timestamp (Unix epoch).
    pub timestamp: i64,
}

/// Statistics for a single file in a diff.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiffStat {
    /// File path.
    pub path: String,
    /// Number of lines added.
    pub additions: usize,
    /// Number of lines deleted.
    pub deletions: usize,
    /// Status: "added", "modified", "deleted", "renamed".
    pub status: String,
    /// Old path (for renames).
    pub old_path: Option<String>,
}

/// Generated PR content from LLM.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedPrContent {
    /// Generated title (max 72 chars, conventional commit style).
    pub title: String,
    /// Generated description with summary, changes, and testing notes.
    pub description: String,
    /// Suggested labels based on changes.
    pub suggested_labels: Vec<String>,
    /// Confidence score (0.0 to 1.0).
    pub confidence: f32,
}

/// Error types specific to PR creation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "details")]
pub enum PrCreationError {
    /// No commits to merge between branches.
    NoCommitsToMerge {
        base_branch: String,
        head_branch: String,
    },
    /// Branch already has an open PR.
    ExistingPrOpen { pr_number: u64, pr_url: String },
    /// Missing permissions to create PR.
    PermissionDenied { reason: String },
    /// Remote not configured or unreachable.
    RemoteNotConfigured { remote_name: String },
    /// Branch not pushed to remote.
    BranchNotPushed { branch_name: String },
    /// GitHub API error.
    GitHubApiError { status_code: u16, message: String },
    /// LLM generation failed.
    LlmGenerationFailed { reason: String },
    /// Generic error.
    Other { message: String },
}

// ============================================================================
// Conflict Parser
// ============================================================================

/// Parser for git merge conflict markers.
pub struct ConflictParser;

impl ConflictParser {
    /// Standard conflict marker strings.
    const MARKER_OURS_START: &'static str = "<<<<<<<";
    const MARKER_BASE_START: &'static str = "|||||||";
    const MARKER_SEPARATOR: &'static str = "=======";
    const MARKER_THEIRS_END: &'static str = ">>>>>>>";

    /// Parse a file's content and extract all conflict hunks.
    pub fn parse_conflicts(content: &str) -> Vec<ConflictHunk> {
        let mut hunks = Vec::new();
        let lines: Vec<&str> = content.lines().collect();
        let mut i = 0;

        while i < lines.len() {
            if lines[i].starts_with(Self::MARKER_OURS_START) {
                if let Some((hunk, end_line)) = Self::parse_single_conflict(&lines, i) {
                    hunks.push(hunk);
                    i = end_line + 1;
                    continue;
                }
            }
            i += 1;
        }

        hunks
    }

    /// Parse a single conflict starting at the given line index.
    fn parse_single_conflict(lines: &[&str], start_idx: usize) -> Option<(ConflictHunk, usize)> {
        let mut ours_lines = Vec::new();
        let mut base_lines = Vec::new();
        let mut theirs_lines = Vec::new();
        let mut ours_label = None;
        let mut theirs_label = None;

        // Extract label from the opening marker
        let first_line = lines[start_idx];
        if first_line.len() > Self::MARKER_OURS_START.len() {
            let label = first_line[Self::MARKER_OURS_START.len()..].trim();
            if !label.is_empty() {
                ours_label = Some(label.to_string());
            }
        }

        let mut idx = start_idx + 1;
        let mut in_base = false;
        let mut found_separator = false;

        // Collect "ours" content and optionally "base" content
        while idx < lines.len() {
            let line = lines[idx];

            if line.starts_with(Self::MARKER_BASE_START) {
                // diff3 style - base content follows
                in_base = true;
                idx += 1;
                continue;
            }

            if line.starts_with(Self::MARKER_SEPARATOR) {
                found_separator = true;
                idx += 1;
                break;
            }

            if in_base {
                base_lines.push(line);
            } else {
                ours_lines.push(line);
            }
            idx += 1;
        }

        if !found_separator {
            return None;
        }

        // Collect "theirs" content
        while idx < lines.len() {
            let line = lines[idx];

            if let Some(stripped) = line.strip_prefix(Self::MARKER_THEIRS_END) {
                // Extract label from the closing marker
                let label = stripped.trim();
                if !label.is_empty() {
                    theirs_label = Some(label.to_string());
                }

                let hunk = ConflictHunk {
                    start_line: start_idx + 1, // Convert to 1-indexed
                    end_line: idx + 1,         // Convert to 1-indexed
                    ours: ours_lines.join("\n"),
                    theirs: theirs_lines.join("\n"),
                    base: if base_lines.is_empty() {
                        None
                    } else {
                        Some(base_lines.join("\n"))
                    },
                    ours_label,
                    theirs_label,
                };

                return Some((hunk, idx));
            }

            theirs_lines.push(line);
            idx += 1;
        }

        None
    }

    /// Check if a file contains conflict markers.
    pub fn has_conflicts(content: &str) -> bool {
        content.contains(Self::MARKER_OURS_START)
            && content.contains(Self::MARKER_SEPARATOR)
            && content.contains(Self::MARKER_THEIRS_END)
    }

    /// Count the number of conflicts in a file.
    pub fn count_conflicts(content: &str) -> usize {
        Self::parse_conflicts(content).len()
    }
}

// ============================================================================
// Conflict Resolver
// ============================================================================

/// Resolves git merge conflicts using various strategies.
pub struct ConflictResolver;

impl ConflictResolver {
    /// Apply a resolution to a single hunk within file content.
    pub fn resolve_hunk(
        content: &str,
        hunk: &ConflictHunk,
        strategy: &ResolutionStrategy,
        manual_content: Option<&str>,
    ) -> Result<String> {
        let lines: Vec<&str> = content.lines().collect();

        // Validate hunk indices
        if hunk.start_line == 0 || hunk.end_line == 0 {
            return Err(anyhow!("Invalid hunk line numbers (must be 1-indexed)"));
        }

        let start_idx = hunk.start_line - 1;
        let end_idx = hunk.end_line - 1;

        if end_idx >= lines.len() {
            return Err(anyhow!(
                "Hunk end line {} exceeds file length {}",
                hunk.end_line,
                lines.len()
            ));
        }

        // Determine the replacement content
        let replacement = match strategy {
            ResolutionStrategy::KeepOurs => hunk.ours.clone(),
            ResolutionStrategy::KeepTheirs => hunk.theirs.clone(),
            ResolutionStrategy::KeepBoth => {
                if hunk.ours.is_empty() {
                    hunk.theirs.clone()
                } else if hunk.theirs.is_empty() {
                    hunk.ours.clone()
                } else {
                    format!("{}\n{}", hunk.ours, hunk.theirs)
                }
            }
            ResolutionStrategy::Manual | ResolutionStrategy::LlmSuggested => manual_content
                .ok_or_else(|| anyhow!("Manual/LLM resolution requires content"))?
                .to_string(),
        };

        // Build the resolved content
        let mut result_lines = Vec::new();

        // Add lines before the conflict
        for line in lines.iter().take(start_idx) {
            result_lines.push(line.to_string());
        }

        // Add the resolved content
        if !replacement.is_empty() {
            for line in replacement.lines() {
                result_lines.push(line.to_string());
            }
        }

        // Add lines after the conflict
        for line in lines.iter().skip(end_idx + 1) {
            result_lines.push(line.to_string());
        }

        Ok(result_lines.join("\n"))
    }

    /// Apply multiple resolutions to a file.
    /// Resolutions must be applied in reverse order (from bottom to top)
    /// to maintain correct line numbers.
    pub fn resolve_all_hunks(
        content: &str,
        hunks: &[ConflictHunk],
        resolutions: &[HunkResolution],
    ) -> Result<String> {
        // Create a map of hunk_index -> resolution
        let resolution_map: HashMap<usize, &HunkResolution> =
            resolutions.iter().map(|r| (r.hunk_index, r)).collect();

        // Sort hunks by start_line in descending order to resolve from bottom to top
        let mut sorted_indices: Vec<usize> = (0..hunks.len()).collect();
        sorted_indices.sort_by(|a, b| hunks[*b].start_line.cmp(&hunks[*a].start_line));

        let mut result = content.to_string();

        for idx in sorted_indices {
            let hunk = &hunks[idx];

            // Get the resolution for this hunk, or default to KeepOurs
            let resolution = resolution_map.get(&idx);

            let (strategy, manual_content) = if let Some(res) = resolution {
                (&res.strategy, res.resolved_content.as_deref())
            } else {
                (&ResolutionStrategy::KeepOurs, None)
            };

            result = Self::resolve_hunk(&result, hunk, strategy, manual_content)?;
        }

        Ok(result)
    }

    /// Generate an LLM prompt for suggesting a conflict resolution.
    pub fn generate_llm_prompt(hunk: &ConflictHunk, file_path: &str) -> String {
        let mut prompt = format!(
            "You are AGI Workforce's git assistant helping resolve a merge conflict in the file '{}'.\n\n",
            file_path
        );

        prompt.push_str("The conflict is between two versions:\n\n");

        if let Some(label) = &hunk.ours_label {
            prompt.push_str(&format!("OURS ({}):\n", label));
        } else {
            prompt.push_str("OURS (current branch):\n");
        }
        prompt.push_str("```\n");
        prompt.push_str(&hunk.ours);
        prompt.push_str("\n```\n\n");

        if let Some(label) = &hunk.theirs_label {
            prompt.push_str(&format!("THEIRS ({}):\n", label));
        } else {
            prompt.push_str("THEIRS (incoming branch):\n");
        }
        prompt.push_str("```\n");
        prompt.push_str(&hunk.theirs);
        prompt.push_str("\n```\n\n");

        if let Some(base) = &hunk.base {
            prompt.push_str("COMMON ANCESTOR:\n");
            prompt.push_str("```\n");
            prompt.push_str(base);
            prompt.push_str("\n```\n\n");
        }

        prompt.push_str(
            "Please provide:\n\
            1. A merged version that preserves the intent of both changes where possible\n\
            2. A brief explanation of your merge decision\n\n\
            Format your response as JSON:\n\
            {\n\
              \"merged_content\": \"the merged code here\",\n\
              \"explanation\": \"why this merge makes sense\",\n\
              \"confidence\": 0.0-1.0,\n\
              \"preserves_both\": true/false\n\
            }",
        );

        prompt
    }
}

// ============================================================================
// PR Creation Workflow
// ============================================================================

/// Workflow for creating pull requests with AI assistance.
pub struct PrCreationWorkflow;

impl PrCreationWorkflow {
    /// Maximum title length for conventional commit style.
    const MAX_TITLE_LENGTH: usize = 72;

    /// Maximum diff content to send to LLM (to avoid token limits).
    const MAX_DIFF_FOR_LLM: usize = 50_000;

    /// Get the diff summary between two branches.
    ///
    /// This gathers all the information needed to generate a PR description.
    pub fn get_branch_diff_summary(
        repo_path: &Path,
        base_branch: &str,
        head_branch: &str,
    ) -> Result<BranchDiffSummary> {
        let repo = git2::Repository::open(repo_path)
            .map_err(|e| anyhow!("Failed to open repository: {}", e))?;

        // Find the base and head references
        let base_ref = repo
            .find_branch(base_branch, git2::BranchType::Local)
            .or_else(|_| repo.find_branch(base_branch, git2::BranchType::Remote))
            .map_err(|e| anyhow!("Base branch '{}' not found: {}", base_branch, e))?;

        let head_ref = repo
            .find_branch(head_branch, git2::BranchType::Local)
            .or_else(|_| repo.find_branch(head_branch, git2::BranchType::Remote))
            .map_err(|e| anyhow!("Head branch '{}' not found: {}", head_branch, e))?;

        let base_commit = base_ref
            .get()
            .peel_to_commit()
            .map_err(|e| anyhow!("Failed to get base commit: {}", e))?;

        let head_commit = head_ref
            .get()
            .peel_to_commit()
            .map_err(|e| anyhow!("Failed to get head commit: {}", e))?;

        // Find merge base to determine commits unique to head
        let merge_base = repo
            .merge_base(base_commit.id(), head_commit.id())
            .map_err(|e| anyhow!("Failed to find merge base: {}", e))?;

        // Collect commits from head back to merge base
        let mut revwalk = repo
            .revwalk()
            .map_err(|e| anyhow!("Failed to create revwalk: {}", e))?;
        revwalk
            .push(head_commit.id())
            .map_err(|e| anyhow!("Failed to push head to revwalk: {}", e))?;
        revwalk
            .hide(merge_base)
            .map_err(|e| anyhow!("Failed to hide merge base: {}", e))?;

        let mut commits = Vec::new();
        for oid_result in revwalk {
            let oid = oid_result.map_err(|e| anyhow!("Revwalk error: {}", e))?;
            let commit = repo
                .find_commit(oid)
                .map_err(|e| anyhow!("Failed to find commit: {}", e))?;

            let message_full = commit.message().unwrap_or("").to_string();
            let message = message_full.lines().next().unwrap_or("").to_string();
            let author = commit.author();

            commits.push(CommitSummary {
                hash_short: oid.to_string()[..7.min(oid.to_string().len())].to_string(),
                hash_full: oid.to_string(),
                message,
                message_full,
                author: author.name().unwrap_or("Unknown").to_string(),
                email: author.email().unwrap_or("unknown@example.com").to_string(),
                timestamp: commit.time().seconds(),
            });
        }

        // Get diff between base and head
        let base_tree = base_commit
            .tree()
            .map_err(|e| anyhow!("Failed to get base tree: {}", e))?;
        let head_tree = head_commit
            .tree()
            .map_err(|e| anyhow!("Failed to get head tree: {}", e))?;

        let diff = repo
            .diff_tree_to_tree(Some(&base_tree), Some(&head_tree), None)
            .map_err(|e| anyhow!("Failed to compute diff: {}", e))?;

        // Collect file stats
        let mut files_changed = Vec::new();

        let stats = diff
            .stats()
            .map_err(|e| anyhow!("Failed to get diff stats: {}", e))?;

        for delta in diff.deltas() {
            let status = match delta.status() {
                git2::Delta::Added => "added",
                git2::Delta::Deleted => "deleted",
                git2::Delta::Modified => "modified",
                git2::Delta::Renamed => "renamed",
                git2::Delta::Copied => "copied",
                _ => "unknown",
            };

            let new_path = delta
                .new_file()
                .path()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();

            let old_path = if delta.status() == git2::Delta::Renamed {
                delta
                    .old_file()
                    .path()
                    .map(|p| p.to_string_lossy().to_string())
            } else {
                None
            };

            files_changed.push(FileDiffStat {
                path: new_path,
                additions: 0, // Will be filled from patch stats
                deletions: 0,
                status: status.to_string(),
                old_path,
            });
        }

        let total_additions = stats.insertions();
        let total_deletions = stats.deletions();

        // Generate diff content (truncated for LLM)
        let mut diff_content = String::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            if diff_content.len() < Self::MAX_DIFF_FOR_LLM {
                let content = std::str::from_utf8(line.content()).unwrap_or("");
                let prefix = match line.origin() {
                    '+' => "+",
                    '-' => "-",
                    ' ' => " ",
                    _ => "",
                };
                diff_content.push_str(prefix);
                diff_content.push_str(content);
            }
            true
        })
        .map_err(|e| anyhow!("Failed to print diff: {}", e))?;

        if diff_content.len() >= Self::MAX_DIFF_FOR_LLM {
            diff_content.push_str("\n\n... (diff truncated for brevity) ...\n");
        }

        Ok(BranchDiffSummary {
            base_branch: base_branch.to_string(),
            head_branch: head_branch.to_string(),
            commits_ahead: commits.len(),
            commits,
            files_changed,
            total_additions,
            total_deletions,
            diff_content,
        })
    }

    /// Generate PR title and description using LLM.
    pub async fn generate_pr_content(
        router: &Arc<RwLock<LLMRouter>>,
        diff_summary: &BranchDiffSummary,
    ) -> Result<GeneratedPrContent> {
        let prompt = Self::build_generation_prompt(diff_summary);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt,
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: String::new(),   // Let router decide
            temperature: Some(0.3), // Low temperature for consistent output
            max_tokens: Some(2000),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            ..Default::default()
        };

        let preferences = RouterPreferences::default();

        let router_guard = router.read().await;
        let candidates = router_guard.candidates(&request, &preferences);

        if candidates.is_empty() {
            return Err(anyhow!("No LLM providers configured"));
        }

        let outcome = router_guard
            .invoke_candidate(&candidates[0], &request)
            .await
            .map_err(|e| anyhow!("LLM request failed: {}", e))?;

        drop(router_guard);

        Self::parse_llm_response(&outcome.response.content)
    }

    /// Build the prompt for PR content generation.
    fn build_generation_prompt(diff_summary: &BranchDiffSummary) -> String {
        let mut prompt = String::new();

        prompt.push_str("You are helping generate a pull request title and description.\n\n");

        prompt.push_str("## Branch Information\n");
        prompt.push_str(&format!("- Base branch: {}\n", diff_summary.base_branch));
        prompt.push_str(&format!("- Head branch: {}\n", diff_summary.head_branch));
        prompt.push_str(&format!("- Commits: {}\n", diff_summary.commits_ahead));
        prompt.push_str(&format!(
            "- Files changed: {}\n",
            diff_summary.files_changed.len()
        ));
        prompt.push_str(&format!(
            "- Additions: +{}, Deletions: -{}\n\n",
            diff_summary.total_additions, diff_summary.total_deletions
        ));

        prompt.push_str("## Commits\n");
        for commit in &diff_summary.commits {
            prompt.push_str(&format!("- {} {}\n", commit.hash_short, commit.message));
        }
        prompt.push('\n');

        prompt.push_str("## Changed Files\n");
        for file in &diff_summary.files_changed {
            prompt.push_str(&format!("- {} ({})\n", file.path, file.status));
        }
        prompt.push('\n');

        prompt.push_str("## Diff Content (truncated)\n```diff\n");
        // Limit diff to avoid token limits
        let diff_preview = if diff_summary.diff_content.len() > 10000 {
            &diff_summary.diff_content[..10000]
        } else {
            &diff_summary.diff_content
        };
        prompt.push_str(diff_preview);
        prompt.push_str("\n```\n\n");

        prompt.push_str("## Task\n");
        prompt.push_str("Generate a pull request title and description.\n\n");

        prompt.push_str("## Requirements\n");
        prompt.push_str("1. **Title**: Use conventional commit format (feat:, fix:, docs:, refactor:, test:, chore:). Max 72 characters.\n");
        prompt.push_str("2. **Description**: Include:\n");
        prompt.push_str("   - Summary of changes (2-3 sentences)\n");
        prompt.push_str("   - List of key changes\n");
        prompt.push_str("   - Testing notes or considerations\n");
        prompt.push_str("3. **Labels**: Suggest appropriate labels (e.g., 'bug', 'enhancement', 'documentation')\n\n");

        prompt.push_str("## Output Format\n");
        prompt.push_str("Respond with JSON only:\n");
        prompt.push_str("```json\n");
        prompt.push_str("{\n");
        prompt.push_str("  \"title\": \"feat: brief description of changes\",\n");
        prompt.push_str("  \"description\": \"## Summary\\n...\\n\\n## Changes\\n- ...\\n\\n## Testing\\n- ...\",\n");
        prompt.push_str("  \"suggested_labels\": [\"enhancement\"],\n");
        prompt.push_str("  \"confidence\": 0.85\n");
        prompt.push_str("}\n");
        prompt.push_str("```\n");

        prompt
    }

    /// Parse the LLM response into structured PR content.
    fn parse_llm_response(response: &str) -> Result<GeneratedPrContent> {
        // Try to extract JSON from the response
        let json_str = Self::extract_json(response)?;

        let parsed: serde_json::Value =
            serde_json::from_str(&json_str).map_err(|e| anyhow!("Failed to parse JSON: {}", e))?;

        let title = parsed["title"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'title' field"))?
            .to_string();

        // Enforce title length limit
        let title = if title.len() > Self::MAX_TITLE_LENGTH {
            let truncated = &title[..Self::MAX_TITLE_LENGTH - 3];
            format!("{}...", truncated)
        } else {
            title
        };

        let description = parsed["description"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'description' field"))?
            .to_string();

        let suggested_labels = parsed["suggested_labels"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        let confidence = parsed["confidence"].as_f64().unwrap_or(0.5) as f32;

        Ok(GeneratedPrContent {
            title,
            description,
            suggested_labels,
            confidence,
        })
    }

    /// Extract JSON from a potentially markdown-wrapped response.
    fn extract_json(response: &str) -> Result<String> {
        // First, try to find JSON in code blocks
        if let Some(start) = response.find("```json") {
            let json_start = start + 7;
            if let Some(end) = response[json_start..].find("```") {
                return Ok(response[json_start..json_start + end].trim().to_string());
            }
        }

        // Try plain code blocks
        if let Some(start) = response.find("```") {
            let content_start = start + 3;
            // Skip language identifier if present
            let json_start = response[content_start..]
                .find('\n')
                .map(|i| content_start + i + 1)
                .unwrap_or(content_start);

            if let Some(end) = response[json_start..].find("```") {
                return Ok(response[json_start..json_start + end].trim().to_string());
            }
        }

        // Try to find raw JSON object
        if let Some(start) = response.find('{') {
            if let Some(end) = response.rfind('}') {
                if end > start {
                    return Ok(response[start..=end].to_string());
                }
            }
        }

        Err(anyhow!("Could not extract JSON from LLM response"))
    }

    /// Check if a branch has an existing open PR.
    ///
    /// Uses the GitHub CLI (`gh`) to check for existing PRs.
    pub async fn check_existing_pr(
        owner: &str,
        repo: &str,
        head_branch: &str,
    ) -> Result<Option<(u64, String)>> {
        // Use gh CLI to check for existing PRs
        let output = tokio::process::Command::new("gh")
            .args([
                "pr",
                "view",
                "--json",
                "number,title,state",
                "--repo",
                &format!("{}/{}", owner, repo),
                head_branch,
            ])
            .output()
            .await
            .map_err(|e| anyhow!("Failed to run gh CLI: {}", e))?;

        if !output.status.success() {
            // No PR found or gh not available - return None
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("no open pull request") || stderr.is_empty() {
                return Ok(None);
            }
            tracing::warn!("gh pr view failed: {}", stderr);
            return Ok(None);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        // Parse JSON response for PR info
        if let Ok(pr_json) = serde_json::from_str::<serde_json::Value>(&stdout) {
            if let (Some(number), Some(title), Some(state)) = (
                pr_json.get("number").and_then(|v| v.as_u64()),
                pr_json.get("title").and_then(|v| v.as_str()),
                pr_json.get("state").and_then(|v| v.as_str()),
            ) {
                if state == "OPEN" {
                    return Ok(Some((number, title.to_string())));
                }
            }
        }

        Ok(None)
    }

    /// Create a PR via GitHub CLI.
    ///
    /// Uses the GitHub CLI (`gh`) to create a pull request.
    pub async fn create_github_pr(
        owner: &str,
        repo: &str,
        config: &PrCreationConfig,
        title: &str,
        description: &str,
    ) -> Result<PrCreationResult> {
        // Use gh CLI to create PR
        let repo_full = format!("{}/{}", owner, repo);
        let mut cmd_args = vec![
            "pr",
            "create",
            "--repo",
            &repo_full,
            "--base",
            &config.base_branch,
            "--head",
            &config.head_branch,
            "--title",
            title,
            "--body",
            description,
        ];

        if config.draft {
            cmd_args.push("--draft");
        }

        let output = tokio::process::Command::new("gh")
            .args(&cmd_args)
            .output()
            .await
            .map_err(|e| anyhow!("Failed to run gh CLI: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow!("Failed to create PR: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let pr_url = stdout.trim().to_string();

        // Extract PR number from URL
        let pr_number = pr_url
            .split('/')
            .next_back()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);

        tracing::info!("Created PR #{}: {}", pr_number, pr_url);

        Ok(PrCreationResult {
            pr_number,
            pr_url: pr_url.clone(),
            title: title.to_string(),
            description: description.to_string(),
            draft: config.draft,
            files_changed: 0,
            additions: 0,
            deletions: 0,
        })
    }

    /// Full PR creation workflow with AI assistance.
    pub async fn create_pull_request_workflow(
        repo_path: &Path,
        config: &PrCreationConfig,
        router: &Arc<RwLock<LLMRouter>>,
    ) -> Result<PrCreationResult> {
        tracing::info!(
            "[PrCreationWorkflow] Starting PR creation: {} -> {}",
            config.head_branch,
            config.base_branch
        );

        // Step 1: Get diff summary
        let diff_summary =
            Self::get_branch_diff_summary(repo_path, &config.base_branch, &config.head_branch)?;

        if diff_summary.commits_ahead == 0 {
            return Err(anyhow!(
                "No commits to merge from '{}' into '{}'",
                config.head_branch,
                config.base_branch
            ));
        }

        tracing::info!(
            "[PrCreationWorkflow] Found {} commits, {} files changed",
            diff_summary.commits_ahead,
            diff_summary.files_changed.len()
        );

        // Step 2: Generate or use provided title and description
        let (title, description) = if let (Some(custom_title), Some(custom_desc)) =
            (&config.custom_title, &config.custom_description)
        {
            (custom_title.clone(), custom_desc.clone())
        } else if config.auto_generate_title || config.auto_generate_description {
            let generated = Self::generate_pr_content(router, &diff_summary).await?;

            let title = config.custom_title.clone().unwrap_or(generated.title);
            let description = config
                .custom_description
                .clone()
                .unwrap_or(generated.description);

            (title, description)
        } else {
            // Use branch name as fallback title
            let title = config.custom_title.clone().unwrap_or_else(|| {
                format!("Merge {} into {}", config.head_branch, config.base_branch)
            });

            let description = config.custom_description.clone().unwrap_or_else(|| {
                format!(
                    "## Changes\n\n{} commits with {} additions and {} deletions.",
                    diff_summary.commits_ahead,
                    diff_summary.total_additions,
                    diff_summary.total_deletions
                )
            });

            (title, description)
        };

        tracing::info!("[PrCreationWorkflow] Generated title: {}", title);

        // Step 3: Create the PR using gh CLI
        // Try to create the PR via gh CLI, fall back to returning prepared content if unavailable
        let pr_result = Self::create_pr_via_gh_cli(
            repo_path,
            &config.base_branch,
            &config.head_branch,
            &title,
            &description,
            config.draft,
        )
        .await;

        match pr_result {
            Ok((pr_number, pr_url)) => {
                tracing::info!(
                    "[PrCreationWorkflow] Successfully created PR #{}: {}",
                    pr_number,
                    pr_url
                );
                Ok(PrCreationResult {
                    pr_number,
                    pr_url,
                    title,
                    description,
                    draft: config.draft,
                    files_changed: diff_summary.files_changed.len(),
                    additions: diff_summary.total_additions,
                    deletions: diff_summary.total_deletions,
                })
            }
            Err(e) => {
                // Return the prepared content but note that actual creation failed
                tracing::warn!("[PrCreationWorkflow] Failed to create PR via gh CLI: {}", e);
                tracing::info!(
                    "[PrCreationWorkflow] Returning prepared PR content for manual creation"
                );
                Ok(PrCreationResult {
                    pr_number: 0,
                    pr_url: String::new(),
                    title,
                    description,
                    draft: config.draft,
                    files_changed: diff_summary.files_changed.len(),
                    additions: diff_summary.total_additions,
                    deletions: diff_summary.total_deletions,
                })
            }
        }
    }

    /// Create a PR using the gh CLI tool.
    async fn create_pr_via_gh_cli(
        repo_path: &Path,
        base_branch: &str,
        head_branch: &str,
        title: &str,
        description: &str,
        draft: bool,
    ) -> Result<(u64, String)> {
        use std::process::Command;

        // Check if gh CLI is available
        let gh_check = Command::new("gh")
            .arg("--version")
            .output()
            .map_err(|e| anyhow!("gh CLI not found: {}", e))?;

        if !gh_check.status.success() {
            return Err(anyhow!("gh CLI not available"));
        }

        // Get the repo owner/name from git remote
        let remote_output = Command::new("git")
            .args(["remote", "get-url", "origin"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| anyhow!("Failed to get git remote: {}", e))?;

        if !remote_output.status.success() {
            return Err(anyhow!("No git remote configured"));
        }

        let remote_url = String::from_utf8_lossy(&remote_output.stdout)
            .trim()
            .to_string();

        // Extract owner and repo from URL (supports both HTTPS and SSH)
        let _repo_identifier = if remote_url.starts_with("git@github.com:") {
            remote_url
                .trim_start_matches("git@github.com:")
                .trim_end_matches(".git")
                .to_string()
        } else if remote_url.contains("github.com") {
            remote_url
                .split('/')
                .skip_while(|s| !s.contains("github.com"))
                .skip(1)
                .take(2)
                .collect::<Vec<_>>()
                .join("/")
        } else {
            return Err(anyhow!("Not a GitHub remote"));
        };

        // Build the gh pr create command
        let mut cmd = Command::new("gh");
        cmd.arg("pr")
            .arg("create")
            .arg("--base")
            .arg(base_branch)
            .arg("--head")
            .arg(head_branch)
            .arg("--title")
            .arg(title)
            .arg("--body")
            .arg(description);

        if draft {
            cmd.arg("--draft");
        }

        let output = cmd
            .current_dir(repo_path)
            .output()
            .map_err(|e| anyhow!("Failed to execute gh pr create: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow!("gh pr create failed: {}", stderr));
        }

        // Parse the PR URL from output
        let pr_url = String::from_utf8_lossy(&output.stdout).trim().to_string();

        // Extract PR number from URL
        let pr_number = pr_url
            .split('/')
            .next_back()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);

        Ok((pr_number, pr_url))
    }
}

/// Executor for Git version control operations.
///
/// Provides a safe interface to common Git operations with path validation
/// and authentication support.
pub struct GitExecutor;

impl GitExecutor {
    /// Create a new Git executor.
    pub fn new() -> Self {
        Self
    }

    /// Validate a path is within allowed directories.
    ///
    /// Returns the canonical path if valid.
    pub(crate) fn validate_path(
        path: &Path,
        context: &ExecutorContext,
        operation: &str,
    ) -> Result<PathBuf> {
        let canonical_path = std::fs::canonicalize(path)
            .map_err(|e| anyhow!("Invalid or inaccessible path '{}': {}", path.display(), e))?;

        let allowed_directories = context.get_allowed_directories();
        let path_allowed = if allowed_directories.is_empty() {
            tracing::warn!(
                "[GitExecutor] No allowed_directories configured - {} access unrestricted. \
                Consider configuring allowed directories for security.",
                operation
            );
            true
        } else {
            allowed_directories
                .iter()
                .any(|allowed_dir| canonical_path.starts_with(allowed_dir))
        };

        if !path_allowed {
            tracing::error!(
                "[GitExecutor] Path traversal attempt blocked for {}: '{}' is outside allowed directories",
                operation,
                canonical_path.display()
            );
            return Err(anyhow!(
                "Access denied: path '{}' is outside allowed directories",
                path.display()
            ));
        }

        Ok(canonical_path)
    }

    /// Validate a path that may not exist yet (for git_init).
    ///
    /// If the path exists, validates it directly. If not, validates the parent.
    fn validate_new_path(
        path: &Path,
        context: &ExecutorContext,
        operation: &str,
    ) -> Result<PathBuf> {
        if path.exists() {
            return Self::validate_path(path, context, operation);
        }

        // Directory doesn't exist - validate parent directory
        let parent = path
            .parent()
            .ok_or_else(|| anyhow!("Invalid path: no parent directory"))?;

        if !parent.exists() {
            return Err(anyhow!(
                "Parent directory does not exist: {}",
                parent.display()
            ));
        }

        let canonical_parent = std::fs::canonicalize(parent)
            .map_err(|e| anyhow!("Invalid parent directory '{}': {}", parent.display(), e))?;

        let allowed_directories = context.get_allowed_directories();
        let path_allowed = if allowed_directories.is_empty() {
            tracing::warn!(
                "[GitExecutor] No allowed_directories configured - {} access unrestricted.",
                operation
            );
            true
        } else {
            allowed_directories
                .iter()
                .any(|allowed_dir| canonical_parent.starts_with(allowed_dir))
        };

        if !path_allowed {
            tracing::error!(
                "[GitExecutor] Path traversal attempt blocked for {}: parent '{}' is outside allowed directories",
                operation,
                canonical_parent.display()
            );
            return Err(anyhow!(
                "Access denied: path '{}' is outside allowed directories",
                path.display()
            ));
        }

        Ok(canonical_parent.join(
            path.file_name()
                .ok_or_else(|| anyhow!("Invalid directory name"))?,
        ))
    }

    /// Get credentials for git authentication.
    ///
    /// Tries multiple authentication methods in order:
    /// 1. SSH agent
    /// 2. SSH key files (ed25519, then RSA)
    /// 3. Git credential helper
    fn get_credentials(
        url: &str,
        username_from_url: Option<&str>,
        allowed_types: git2::CredentialType,
    ) -> Result<git2::Cred, git2::Error> {
        // Try SSH agent authentication first
        if allowed_types.contains(git2::CredentialType::SSH_KEY) {
            if let Some(username) = username_from_url {
                // Try SSH agent
                if let Ok(cred) = git2::Cred::ssh_key_from_agent(username) {
                    return Ok(cred);
                }

                // Try default SSH key locations
                if let Some(home) = dirs::home_dir() {
                    let id_ed25519 = home.join(".ssh").join("id_ed25519");
                    let id_rsa = home.join(".ssh").join("id_rsa");

                    // Try ed25519 first (more modern)
                    if id_ed25519.exists() {
                        if let Ok(cred) = git2::Cred::ssh_key(username, None, &id_ed25519, None) {
                            return Ok(cred);
                        }
                    }

                    // Fall back to RSA
                    if id_rsa.exists() {
                        if let Ok(cred) = git2::Cred::ssh_key(username, None, &id_rsa, None) {
                            return Ok(cred);
                        }
                    }
                }
            }
        }

        // Try default credentials (git credential helper)
        if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            if let Ok(cred) = git2::Cred::default() {
                return Ok(cred);
            }
        }

        // Try credential helper via git config
        if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            return git2::Cred::credential_helper(
                &git2::Config::open_default().or_else(|_| git2::Config::new())?,
                url,
                username_from_url,
            );
        }

        Err(git2::Error::from_str(
            "No valid credentials found. Ensure SSH agent is running or git credentials are configured.",
        ))
    }

    /// Execute git_status operation.
    ///
    /// Returns the status of a git repository including:
    /// - Current branch name (or detached HEAD info)
    /// - List of staged files
    /// - List of modified files (unstaged)
    /// - List of untracked files
    /// - Whether the working directory is clean
    async fn execute_status(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'path' parameter"))?;

        let canonical_path = Self::validate_path(Path::new(path), context, "git_status")?;

        // Open the git repository
        let repo = git2::Repository::open(&canonical_path).map_err(|e| {
            anyhow!(
                "Failed to open git repository at '{}': {}",
                canonical_path.display(),
                e
            )
        })?;

        // Get current branch name
        let branch = match repo.head() {
            Ok(head) => {
                if head.is_branch() {
                    head.shorthand().map(|s| s.to_string())
                } else {
                    // Detached HEAD - show commit hash
                    head.target()
                        .map(|oid| format!("HEAD detached at {}", &oid.to_string()[..7]))
                }
            }
            Err(_) => None,
        }
        .unwrap_or_else(|| "unknown".to_string());

        // Get repository status
        let statuses = repo
            .statuses(None)
            .map_err(|e| anyhow!("Failed to get repository status: {}", e))?;

        let mut staged: Vec<String> = Vec::new();
        let mut modified: Vec<String> = Vec::new();
        let mut untracked: Vec<String> = Vec::new();

        for entry in statuses.iter() {
            let path_str = entry.path().unwrap_or("unknown").to_string();
            let status = entry.status();

            // Check for staged changes (index changes)
            if status.is_index_new()
                || status.is_index_modified()
                || status.is_index_deleted()
                || status.is_index_renamed()
                || status.is_index_typechange()
            {
                staged.push(path_str.clone());
            }

            // Check for working directory modifications (unstaged)
            if status.is_wt_modified()
                || status.is_wt_deleted()
                || status.is_wt_renamed()
                || status.is_wt_typechange()
            {
                modified.push(path_str.clone());
            }

            // Check for untracked files
            if status.is_wt_new() {
                untracked.push(path_str);
            }
        }

        let clean = staged.is_empty() && modified.is_empty() && untracked.is_empty();

        tracing::info!(
            "[GitExecutor] git_status completed for '{}': branch={}, staged={}, modified={}, untracked={}, clean={}",
            canonical_path.display(),
            branch,
            staged.len(),
            modified.len(),
            untracked.len(),
            clean
        );

        Ok(json!({
            "success": true,
            "path": canonical_path.to_string_lossy(),
            "branch": branch,
            "staged": staged,
            "modified": modified,
            "untracked": untracked,
            "clean": clean
        }))
    }

    /// Execute git_init operation.
    ///
    /// Initializes a new git repository at the specified path.
    /// Creates the directory if it doesn't exist.
    async fn execute_init(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'path' parameter"))?;

        let canonical_path = Self::validate_new_path(Path::new(path), context, "git_init")?;

        // Create the directory if it doesn't exist
        if !canonical_path.exists() {
            std::fs::create_dir_all(&canonical_path).map_err(|e| {
                anyhow!(
                    "Failed to create directory '{}': {}",
                    canonical_path.display(),
                    e
                )
            })?;
        }

        // Initialize the git repository
        let repo = git2::Repository::init(&canonical_path).map_err(|e| {
            anyhow!(
                "Failed to initialize git repository at '{}': {}",
                canonical_path.display(),
                e
            )
        })?;

        let git_dir = repo.path().to_string_lossy().to_string();

        tracing::info!(
            "[GitExecutor] git_init completed: initialized repository at '{}'",
            canonical_path.display()
        );

        Ok(json!({
            "success": true,
            "path": canonical_path.to_string_lossy(),
            "git_dir": git_dir,
            "message": format!("Initialized empty Git repository in {}", canonical_path.display())
        }))
    }

    /// Execute git_add operation.
    ///
    /// Adds files to the git staging area. Supports:
    /// - Specific file paths
    /// - "." or "*" to add all files
    async fn execute_add(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'path' parameter"))?;
        let files = parameters
            .get("files")
            .and_then(|v| v.as_array())
            .ok_or_else(|| anyhow!("Missing 'files' parameter"))?;

        let canonical_path = Self::validate_path(Path::new(path), context, "git_add")?;

        let repo = git2::Repository::open(&canonical_path).map_err(|e| {
            anyhow!(
                "Failed to open git repository at '{}': {}",
                canonical_path.display(),
                e
            )
        })?;

        let mut index = repo
            .index()
            .map_err(|e| anyhow!("Failed to get repository index: {}", e))?;

        // Collect file paths to add
        let file_paths: Vec<String> = files
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();

        if file_paths.is_empty() {
            return Err(anyhow!("No valid file paths provided in 'files' array"));
        }

        let mut files_added: Vec<String> = Vec::new();

        // Check if adding all files (e.g., ["."] or ["*"])
        let add_all = file_paths.len() == 1 && (file_paths[0] == "." || file_paths[0] == "*");

        if add_all {
            // Add all files using glob pattern
            index
                .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
                .map_err(|e| anyhow!("Failed to add all files to index: {}", e))?;

            // Get list of files that were staged
            for entry in index.iter() {
                if let Ok(path_str) = std::str::from_utf8(&entry.path) {
                    files_added.push(path_str.to_string());
                }
            }

            tracing::info!(
                "[GitExecutor] git_add: Added all files ({} total) to staging area in '{}'",
                files_added.len(),
                canonical_path.display()
            );
        } else {
            // Add specific files
            for file_path in &file_paths {
                // SECURITY: Ensure the file path doesn't escape the repository
                let full_path = canonical_path.join(file_path);
                let canonical_file_path = match std::fs::canonicalize(&full_path) {
                    Ok(p) => p,
                    Err(_) => {
                        // File might not exist yet (new file), check parent
                        let parent = full_path.parent();
                        if let Some(p) = parent {
                            if let Ok(canonical_parent) = std::fs::canonicalize(p) {
                                if !canonical_parent.starts_with(&canonical_path) {
                                    tracing::error!(
                                        "[GitExecutor] git_add: File path '{}' escapes repository",
                                        file_path
                                    );
                                    return Err(anyhow!(
                                        "File path '{}' is outside the repository",
                                        file_path
                                    ));
                                }
                            }
                        }
                        full_path.clone()
                    }
                };

                // Ensure file is within repository
                if canonical_file_path != full_path
                    && !canonical_file_path.starts_with(&canonical_path)
                {
                    tracing::error!(
                        "[GitExecutor] git_add: File path '{}' escapes repository",
                        file_path
                    );
                    return Err(anyhow!(
                        "File path '{}' is outside the repository",
                        file_path
                    ));
                }

                // Add the file to the index
                index
                    .add_path(Path::new(file_path))
                    .map_err(|e| anyhow!("Failed to add '{}' to index: {}", file_path, e))?;

                files_added.push(file_path.clone());
            }

            tracing::info!(
                "[GitExecutor] git_add: Added {} files to staging area in '{}'",
                files_added.len(),
                canonical_path.display()
            );
        }

        // Write the index to disk
        index
            .write()
            .map_err(|e| anyhow!("Failed to write index: {}", e))?;

        Ok(json!({
            "success": true,
            "repository_path": canonical_path.to_string_lossy(),
            "files_added": files_added,
            "files_count": files_added.len()
        }))
    }

    /// Execute git_commit operation.
    ///
    /// Creates a new commit with the staged changes. Uses the configured
    /// git user or falls back to "AGI Workforce" as author/committer.
    async fn execute_commit(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        session_id: &str,
    ) -> Result<Value> {
        let path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'path' parameter"))?;
        let message = parameters
            .get("message")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'message' parameter"))?;

        let canonical_path = Self::validate_path(Path::new(path), context, "git_commit")?;

        // Perform all git operations in a synchronous closure to avoid Send issues
        // git2 types are not Send, so we extract simple Send-able results
        // Returns Option<(commit_hash, author_string)> - None means no changes to commit
        let git_result: Result<Option<(String, String)>, anyhow::Error> = (|| {
            let repo = git2::Repository::open(&canonical_path).map_err(|e| {
                anyhow!(
                    "Failed to open git repository at '{}': {}",
                    canonical_path.display(),
                    e
                )
            })?;

            // Get the index
            let mut index = repo
                .index()
                .map_err(|e| anyhow!("Failed to get repository index: {}", e))?;

            // Check if there are staged changes
            let tree_id = index
                .write_tree()
                .map_err(|e| anyhow!("Failed to write tree from index: {}", e))?;

            let tree = repo
                .find_tree(tree_id)
                .map_err(|e| anyhow!("Failed to find tree: {}", e))?;

            // Get the signature (author/committer)
            let signature = repo
                .signature()
                .or_else(|_| {
                    // Fallback to a default signature if git config is not set
                    git2::Signature::now("AGI Workforce", "agi@agiworkforce.com")
                })
                .map_err(|e| anyhow!("Failed to create signature: {}", e))?;

            // Get the parent commit (HEAD), if it exists
            let parent_commit = match repo.head() {
                Ok(head) => {
                    let oid = head
                        .target()
                        .ok_or_else(|| anyhow!("HEAD reference has no target"))?;
                    Some(
                        repo.find_commit(oid)
                            .map_err(|e| anyhow!("Failed to find HEAD commit: {}", e))?,
                    )
                }
                Err(e) => {
                    // No HEAD means this is the first commit
                    if e.code() == git2::ErrorCode::UnbornBranch
                        || e.code() == git2::ErrorCode::NotFound
                    {
                        None
                    } else {
                        return Err(anyhow!("Failed to get HEAD: {}", e));
                    }
                }
            };

            // Check if there are actual changes to commit
            if let Some(ref parent) = parent_commit {
                let parent_tree = parent
                    .tree()
                    .map_err(|e| anyhow!("Failed to get parent tree: {}", e))?;

                let diff = repo
                    .diff_tree_to_tree(Some(&parent_tree), Some(&tree), None)
                    .map_err(|e| anyhow!("Failed to compute diff: {}", e))?;

                if diff.deltas().count() == 0 {
                    tracing::info!(
                        "[GitExecutor] git_commit: No changes to commit in '{}'",
                        canonical_path.display()
                    );
                    // Return None to signal no changes
                    return Ok(None);
                }
            }

            // Create the commit
            let parents: Vec<&git2::Commit> = parent_commit.iter().collect();
            let commit_oid = repo
                .commit(
                    Some("HEAD"),
                    &signature,
                    &signature,
                    message,
                    &tree,
                    &parents,
                )
                .map_err(|e| anyhow!("Failed to create commit: {}", e))?;

            let commit_hash = commit_oid.to_string();

            // Extract author string before signature goes out of scope
            let author_string = format!(
                "{} <{}>",
                signature.name().unwrap_or("Unknown"),
                signature.email().unwrap_or("unknown@example.com")
            );

            Ok(Some((commit_hash, author_string)))
        })();

        // Handle the result outside the git2 scope
        let Some((commit_hash, author_string)) = git_result? else {
            // No changes to commit
            return Ok(json!({
                "success": false,
                "repository_path": canonical_path.to_string_lossy(),
                "message": "Nothing to commit - no changes staged",
                "commit_hash": null
            }));
        };

        tracing::info!(
            "[GitExecutor] git_commit: Created commit {} with message '{}' in '{}'",
            &commit_hash[..8],
            message,
            canonical_path.display()
        );

        // Track git commit for audit trail (note: commits are not auto-revertible)
        if let Some(ref tracker) = context.change_tracker {
            tracker
                .record_git_commit(
                    PathBuf::from(&canonical_path),
                    commit_hash.clone(),
                    message.to_string(),
                    session_id.to_string(),
                )
                .await;
            tracing::debug!(
                "[GitExecutor] Tracked git commit {} for audit: {}",
                &commit_hash[..8],
                canonical_path.display()
            );
        }

        Ok(json!({
            "success": true,
            "repository_path": canonical_path.to_string_lossy(),
            "commit_hash": commit_hash,
            "commit_hash_short": &commit_hash[..8.min(commit_hash.len())],
            "message": message,
            "author": author_string
        }))
    }

    /// Execute git_push operation.
    ///
    /// Pushes commits to a remote repository. Supports:
    /// - SSH authentication (agent or key files)
    /// - HTTPS with credential helper
    /// - Progress reporting via tool events
    /// - Undo tracking for rollback capability
    ///
    /// # Undo Support
    ///
    /// This operation tracks the commit SHA before and after push to enable
    /// rollback. Protected branches (main/master) are flagged and cannot be
    /// automatically rolled back without explicit user confirmation.
    async fn execute_push(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        session_id: &str,
    ) -> Result<Value> {
        let path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'path' parameter"))?;
        let remote_name = parameters
            .get("remote")
            .and_then(|v| v.as_str())
            .unwrap_or("origin");
        let branch = parameters.get("branch").and_then(|v| v.as_str());

        let canonical_path = Self::validate_path(Path::new(path), context, "git_push")?;

        // Perform all git2 operations synchronously to avoid Send issues
        // git2 types are not Send-safe, so we must complete them before any awaits
        let push_result: Result<(String, String, Option<String>), anyhow::Error> = (|| {
            // Open the repository
            let repo = git2::Repository::open(&canonical_path)
                .map_err(|e| anyhow!("Failed to open git repository at '{}': {}", path, e))?;

            // Get the branch to push (current branch if not specified)
            let branch_name = if let Some(b) = branch {
                b.to_string()
            } else {
                let head = repo
                    .head()
                    .map_err(|e| anyhow!("Failed to get HEAD reference: {}", e))?;
                if !head.is_branch() {
                    return Err(anyhow!(
                        "HEAD is detached. Please specify a branch to push."
                    ));
                }
                head.shorthand()
                    .ok_or_else(|| anyhow!("Failed to get current branch name"))?
                    .to_string()
            };

            // Get the current HEAD commit SHA (what we're pushing)
            let head_commit_sha = repo
                .head()
                .ok()
                .and_then(|h| h.target())
                .map(|oid| oid.to_string())
                .ok_or_else(|| anyhow!("Cannot determine HEAD commit SHA"))?;

            // Try to get the remote tracking branch SHA (what the remote currently has)
            // This is used for undo - to know what state to revert to
            let remote_ref_name = format!("refs/remotes/{}/{}", remote_name, branch_name);
            let remote_sha_before_push = repo
                .find_reference(&remote_ref_name)
                .ok()
                .and_then(|r| r.target())
                .map(|oid| oid.to_string());

            // Get the remote
            let mut remote_obj = repo
                .find_remote(remote_name)
                .map_err(|e| anyhow!("Failed to find remote '{}': {}", remote_name, e))?;

            // Set up callbacks for authentication
            let mut callbacks = git2::RemoteCallbacks::new();

            // Credential callback - tries SSH agent first, then username from URL
            callbacks.credentials(|url, username_from_url, allowed_types| {
                Self::get_credentials(url, username_from_url, allowed_types)
            });

            // Progress callback for UI feedback
            let tool_id = context.tool_id.clone();
            let app_handle = context.app_handle.clone();
            callbacks.push_transfer_progress(move |current, total, _bytes| {
                if let Some(ref app) = app_handle {
                    let progress = if total > 0 {
                        current as f32 / total as f32
                    } else {
                        0.0
                    };
                    crate::ui::events::tool_stream::emit_tool_progress(
                        app,
                        &tool_id,
                        progress,
                        Some(&format!("Pushing objects: {}/{}", current, total)),
                    );
                }
            });

            // Create push options with callbacks
            let mut push_options = git2::PushOptions::new();
            push_options.remote_callbacks(callbacks);

            // Build the refspec for pushing
            let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);

            // Perform the push
            remote_obj
                .push(&[&refspec], Some(&mut push_options))
                .map_err(|e| {
                    anyhow!(
                        "Failed to push branch '{}' to remote '{}': {}",
                        branch_name,
                        remote_name,
                        e
                    )
                })?;

            Ok((branch_name, head_commit_sha, remote_sha_before_push))
        })();

        // Extract the results - all git2 operations are complete
        let (branch_name, head_commit_sha, remote_sha_before_push) = push_result?;

        tracing::info!(
            "[GitExecutor] Git push successful: branch={} remote={} path={}",
            branch_name,
            remote_name,
            canonical_path.display()
        );

        // Track git push for undo capability
        if let Some(ref tracker) = context.change_tracker {
            tracker
                .record_git_push(
                    PathBuf::from(&canonical_path),
                    remote_name.to_string(),
                    branch_name.clone(),
                    remote_sha_before_push.clone(),
                    head_commit_sha.clone(),
                    session_id.to_string(),
                )
                .await;

            let before_display = remote_sha_before_push
                .as_ref()
                .map(|s| &s[..8.min(s.len())])
                .unwrap_or("(new branch)");

            tracing::debug!(
                "[GitExecutor] Tracked git push for undo: {}/{} {} -> {}",
                remote_name,
                branch_name,
                before_display,
                &head_commit_sha[..8.min(head_commit_sha.len())]
            );
        }

        // Check if this is a protected branch and warn the user
        let is_protected = Self::is_protected_branch(&branch_name);
        let warning = if is_protected {
            Some(format!(
                "Warning: Pushed to protected branch '{}'. Automatic undo is disabled for safety. \
                 To undo, manually create a revert commit or coordinate with your team.",
                branch_name
            ))
        } else {
            None
        };

        Ok(json!({
            "success": true,
            "branch": branch_name,
            "remote": remote_name,
            "path": canonical_path.to_string_lossy(),
            "commit_sha": head_commit_sha,
            "previous_sha": remote_sha_before_push,
            "is_protected_branch": is_protected,
            "can_undo": !is_protected,
            "warning": warning
        }))
    }

    /// Check if a branch name is considered protected (main/master).
    ///
    /// Protected branches require explicit user confirmation for force push operations.
    fn is_protected_branch(branch: &str) -> bool {
        let protected_names = ["main", "master", "develop", "release", "production", "prod"];
        let branch_lower = branch.to_lowercase();
        protected_names
            .iter()
            .any(|&name| branch_lower == name || branch_lower.starts_with(&format!("{}/", name)))
    }

    /// Execute git_clone operation.
    ///
    /// Clones a remote repository to a local path. Supports:
    /// - HTTPS URLs
    /// - SSH URLs (git@host:user/repo format)
    /// - Progress reporting via tool events
    async fn execute_clone(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let url = parameters
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'url' parameter"))?;
        let destination = parameters
            .get("destination")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'destination' parameter"))?;

        // Validate the URL format - accept both HTTPS and SSH URLs
        let is_valid_url = if url.starts_with("git@") || (url.contains(':') && !url.contains("://"))
        {
            // SSH URL format (git@github.com:user/repo.git)
            true
        } else {
            // Try parsing as standard URL
            url::Url::parse(url).is_ok()
        };

        if !is_valid_url {
            return Err(anyhow!("Invalid repository URL format: {}", url));
        }

        // Validate destination path
        let dest_path = Path::new(destination);

        // If destination exists, it must be empty
        if dest_path.exists() {
            let is_empty = dest_path
                .read_dir()
                .map(|mut d| d.next().is_none())
                .unwrap_or(false);
            if !is_empty {
                return Err(anyhow!(
                    "Destination directory '{}' already exists and is not empty",
                    destination
                ));
            }
        }

        // Validate parent directory exists and is allowed
        let parent = dest_path
            .parent()
            .ok_or_else(|| anyhow!("Invalid destination path: no parent directory"))?;

        if !parent.exists() {
            return Err(anyhow!(
                "Parent directory does not exist: {}",
                parent.display()
            ));
        }

        let canonical_parent = std::fs::canonicalize(parent)
            .map_err(|e| anyhow!("Invalid parent directory '{}': {}", parent.display(), e))?;

        // SECURITY: Validate destination is within allowed directories
        let allowed_directories = context.get_allowed_directories();
        let path_allowed = if allowed_directories.is_empty() {
            tracing::warn!(
                "[GitExecutor] No allowed_directories configured - git clone unrestricted. \
                Consider configuring allowed directories for security."
            );
            true
        } else {
            allowed_directories
                .iter()
                .any(|allowed_dir| canonical_parent.starts_with(allowed_dir))
        };

        if !path_allowed {
            tracing::error!(
                "[GitExecutor] Path traversal attempt blocked: destination parent '{}' is outside allowed directories",
                canonical_parent.display()
            );
            return Err(anyhow!(
                "Access denied: destination '{}' is outside allowed directories",
                destination
            ));
        }

        // Compute final destination path
        let final_dest = canonical_parent.join(
            dest_path
                .file_name()
                .ok_or_else(|| anyhow!("Invalid destination path"))?,
        );

        // Set up fetch options with callbacks for authentication
        let mut callbacks = git2::RemoteCallbacks::new();

        // Credential callback - same as git_push
        callbacks.credentials(|url, username_from_url, allowed_types| {
            Self::get_credentials(url, username_from_url, allowed_types)
        });

        // Progress callback for fetch/clone progress
        let tool_id = context.tool_id.clone();
        let app_handle = context.app_handle.clone();
        callbacks.transfer_progress(move |stats| {
            if let Some(ref app) = app_handle {
                let received = stats.received_objects();
                let total = stats.total_objects();
                let progress = if total > 0 {
                    received as f32 / total as f32
                } else {
                    0.0
                };
                crate::ui::events::tool_stream::emit_tool_progress(
                    app,
                    &tool_id,
                    progress,
                    Some(&format!(
                        "Cloning: {}/{} objects ({} bytes)",
                        received,
                        total,
                        stats.received_bytes()
                    )),
                );
            }
            true
        });

        // Build fetch options
        let mut fetch_options = git2::FetchOptions::new();
        fetch_options.remote_callbacks(callbacks);

        // Build clone options
        let mut builder = git2::build::RepoBuilder::new();
        builder.fetch_options(fetch_options);

        // Perform the clone
        let repo = builder.clone(url, &final_dest).map_err(|e| {
            anyhow!(
                "Failed to clone repository '{}' to '{}': {}",
                url,
                final_dest.display(),
                e
            )
        })?;

        // Get the default branch name
        let head = repo.head().ok();
        let branch_name = head
            .as_ref()
            .and_then(|h| h.shorthand())
            .unwrap_or("unknown");

        tracing::info!(
            "[GitExecutor] Git clone successful: url={} destination={} branch={}",
            url,
            final_dest.display(),
            branch_name
        );

        Ok(json!({
            "success": true,
            "url": url,
            "path": final_dest.to_string_lossy(),
            "branch": branch_name
        }))
    }
}

impl Default for GitExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for GitExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec![
            "git_status",
            "git_init",
            "git_add",
            "git_commit",
            "git_push",
            "git_clone",
        ]
    }

    fn description(&self) -> &'static str {
        "Git version control operations executor"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        execution_context: &ExecutionContext,
    ) -> Result<Value> {
        // Extract session_id from execution context for audit tracking
        let session_id = &execution_context.goal.id;

        match tool_name {
            "git_status" => self.execute_status(parameters, context).await,
            "git_init" => self.execute_init(parameters, context).await,
            "git_add" => self.execute_add(parameters, context).await,
            "git_commit" => self.execute_commit(parameters, context, session_id).await,
            "git_push" => self.execute_push(parameters, context, session_id).await,
            "git_clone" => self.execute_clone(parameters, context).await,
            _ => Err(anyhow!("Unknown git tool: {}", tool_name)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tempfile::TempDir;

    fn create_test_context() -> ExecutorContext {
        ExecutorContext {
            app_handle: None,
            automation: Arc::new(
                crate::automation::AutomationService::new()
                    .expect("Failed to create AutomationService for tests"),
            ),
            router: Arc::new(tokio::sync::RwLock::new(crate::core::llm::LLMRouter::new())),
            tool_cache: Arc::new(crate::data::cache::ToolResultCache::new()),
            security_guard: Arc::new(crate::sys::security::ToolExecutionGuard::new()),
            change_tracker: None,
            session_id: "test_session".to_string(),
            tool_id: "test_tool".to_string(),
        }
    }

    fn create_test_execution_context() -> ExecutionContext {
        ExecutionContext {
            goal: crate::core::agi::Goal {
                id: "test_goal".to_string(),
                description: "Test goal".to_string(),
                priority: crate::core::agi::Priority::Medium,
                deadline: None,
                constraints: vec![],
                success_criteria: vec![],
            },
            current_state: HashMap::new(),
            available_resources: crate::core::agi::ResourceState {
                cpu_usage_percent: 0.0,
                memory_usage_mb: 0,
                network_usage_mbps: 0.0,
                storage_usage_mb: 0,
                available_tools: vec![],
            },
            tool_results: vec![],
            context_memory: vec![],
        }
    }

    #[test]
    fn test_git_executor_tool_names() {
        let executor = GitExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"git_status"));
        assert!(names.contains(&"git_init"));
        assert!(names.contains(&"git_add"));
        assert!(names.contains(&"git_commit"));
        assert!(names.contains(&"git_push"));
        assert!(names.contains(&"git_clone"));
        assert_eq!(names.len(), 6);
    }

    #[test]
    fn test_git_executor_description() {
        let executor = GitExecutor::new();
        assert_eq!(
            executor.description(),
            "Git version control operations executor"
        );
    }

    #[tokio::test]
    async fn test_git_init_and_status() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().join("test_repo");

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        // Test git_init
        let mut init_params = HashMap::new();
        init_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_init", &init_params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert!(repo_path.join(".git").exists());

        // Test git_status on new repo
        let mut status_params = HashMap::new();
        status_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_status", &status_params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert_eq!(result["clean"], true);
    }

    #[tokio::test]
    async fn test_git_add_and_commit() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().join("test_repo");

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        // Initialize repo
        let mut init_params = HashMap::new();
        init_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        executor
            .execute("git_init", &init_params, &context, &exec_context)
            .await
            .unwrap();

        // Create a test file
        std::fs::write(repo_path.join("test.txt"), "Hello, World!").unwrap();

        // Test git_add
        let mut add_params = HashMap::new();
        add_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        add_params.insert(
            "files".to_string(),
            Value::Array(vec![Value::String("test.txt".to_string())]),
        );

        let result = executor
            .execute("git_add", &add_params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert_eq!(result["files_count"], 1);

        // Test git_commit
        let mut commit_params = HashMap::new();
        commit_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        commit_params.insert(
            "message".to_string(),
            Value::String("Initial commit".to_string()),
        );

        let result = executor
            .execute("git_commit", &commit_params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert!(result["commit_hash"].as_str().is_some());
    }

    #[tokio::test]
    async fn test_git_add_all() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().join("test_repo");

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        // Initialize repo
        let mut init_params = HashMap::new();
        init_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        executor
            .execute("git_init", &init_params, &context, &exec_context)
            .await
            .unwrap();

        // Create multiple test files
        std::fs::write(repo_path.join("file1.txt"), "Content 1").unwrap();
        std::fs::write(repo_path.join("file2.txt"), "Content 2").unwrap();

        // Test git_add with "."
        let mut add_params = HashMap::new();
        add_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        add_params.insert(
            "files".to_string(),
            Value::Array(vec![Value::String(".".to_string())]),
        );

        let result = executor
            .execute("git_add", &add_params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert!(result["files_count"].as_i64().unwrap() >= 2);
    }

    #[tokio::test]
    async fn test_commit_no_changes() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().join("test_repo");

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        // Initialize repo and make initial commit
        let mut init_params = HashMap::new();
        init_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        executor
            .execute("git_init", &init_params, &context, &exec_context)
            .await
            .unwrap();

        std::fs::write(repo_path.join("test.txt"), "Hello").unwrap();

        let mut add_params = HashMap::new();
        add_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        add_params.insert(
            "files".to_string(),
            Value::Array(vec![Value::String(".".to_string())]),
        );
        executor
            .execute("git_add", &add_params, &context, &exec_context)
            .await
            .unwrap();

        let mut commit_params = HashMap::new();
        commit_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        commit_params.insert(
            "message".to_string(),
            Value::String("Initial commit".to_string()),
        );
        executor
            .execute("git_commit", &commit_params, &context, &exec_context)
            .await
            .unwrap();

        // Try to commit again with no changes
        let result = executor
            .execute("git_commit", &commit_params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], false);
        assert!(result["message"]
            .as_str()
            .unwrap()
            .contains("Nothing to commit"));
    }

    #[test]
    fn test_path_validation() {
        let temp_dir = TempDir::new().unwrap();
        let context = create_test_context();

        // Valid path within allowed directories should succeed
        let result = GitExecutor::validate_path(temp_dir.path(), &context, "test");
        assert!(result.is_ok());

        // Note: More comprehensive path traversal tests would require mocking
        // the allowed directories, which depends on app state
    }

    // ========================================================================
    // Conflict Parser Tests
    // ========================================================================

    #[test]
    fn test_parse_simple_conflict() {
        let content = r#"some code before
<<<<<<< HEAD
our changes
=======
their changes
>>>>>>> feature-branch
some code after"#;

        let hunks = ConflictParser::parse_conflicts(content);
        assert_eq!(hunks.len(), 1);

        let hunk = &hunks[0];
        assert_eq!(hunk.ours, "our changes");
        assert_eq!(hunk.theirs, "their changes");
        assert_eq!(hunk.ours_label, Some("HEAD".to_string()));
        assert_eq!(hunk.theirs_label, Some("feature-branch".to_string()));
        assert_eq!(hunk.start_line, 2);
        assert_eq!(hunk.end_line, 6);
    }

    #[test]
    fn test_parse_multiple_conflicts() {
        let content = r#"line 1
<<<<<<< HEAD
ours 1
=======
theirs 1
>>>>>>> branch1
line 7
<<<<<<< HEAD
ours 2
=======
theirs 2
>>>>>>> branch2
line 13"#;

        let hunks = ConflictParser::parse_conflicts(content);
        assert_eq!(hunks.len(), 2);

        assert_eq!(hunks[0].ours, "ours 1");
        assert_eq!(hunks[0].theirs, "theirs 1");
        assert_eq!(hunks[1].ours, "ours 2");
        assert_eq!(hunks[1].theirs, "theirs 2");
    }

    #[test]
    fn test_parse_multiline_conflict() {
        let content = r#"<<<<<<< HEAD
line 1 ours
line 2 ours
line 3 ours
=======
line 1 theirs
line 2 theirs
>>>>>>> other"#;

        let hunks = ConflictParser::parse_conflicts(content);
        assert_eq!(hunks.len(), 1);

        let hunk = &hunks[0];
        assert_eq!(hunk.ours, "line 1 ours\nline 2 ours\nline 3 ours");
        assert_eq!(hunk.theirs, "line 1 theirs\nline 2 theirs");
    }

    #[test]
    fn test_parse_diff3_conflict() {
        let content = r#"<<<<<<< HEAD
our version
||||||| merged common ancestors
original version
=======
their version
>>>>>>> feature"#;

        let hunks = ConflictParser::parse_conflicts(content);
        assert_eq!(hunks.len(), 1);

        let hunk = &hunks[0];
        assert_eq!(hunk.ours, "our version");
        assert_eq!(hunk.theirs, "their version");
        assert_eq!(hunk.base, Some("original version".to_string()));
    }

    #[test]
    fn test_has_conflicts() {
        let with_conflict = "<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch";
        let without_conflict = "normal code\nno conflicts here";

        assert!(ConflictParser::has_conflicts(with_conflict));
        assert!(!ConflictParser::has_conflicts(without_conflict));
    }

    #[test]
    fn test_count_conflicts() {
        let content = r#"<<<<<<< HEAD
a
=======
b
>>>>>>> x
normal
<<<<<<< HEAD
c
=======
d
>>>>>>> y"#;

        assert_eq!(ConflictParser::count_conflicts(content), 2);
    }

    // ========================================================================
    // Conflict Resolver Tests
    // ========================================================================

    #[test]
    fn test_resolve_keep_ours() {
        let content = r#"before
<<<<<<< HEAD
our code
=======
their code
>>>>>>> branch
after"#;

        let hunks = ConflictParser::parse_conflicts(content);
        let result =
            ConflictResolver::resolve_hunk(content, &hunks[0], &ResolutionStrategy::KeepOurs, None)
                .unwrap();

        assert!(result.contains("our code"));
        assert!(!result.contains("their code"));
        assert!(!result.contains("<<<<<<<"));
        assert!(!result.contains("======="));
        assert!(!result.contains(">>>>>>>"));
    }

    #[test]
    fn test_resolve_keep_theirs() {
        let content = r#"before
<<<<<<< HEAD
our code
=======
their code
>>>>>>> branch
after"#;

        let hunks = ConflictParser::parse_conflicts(content);
        let result = ConflictResolver::resolve_hunk(
            content,
            &hunks[0],
            &ResolutionStrategy::KeepTheirs,
            None,
        )
        .unwrap();

        assert!(!result.contains("our code"));
        assert!(result.contains("their code"));
    }

    #[test]
    fn test_resolve_keep_both() {
        let content = r#"<<<<<<< HEAD
our code
=======
their code
>>>>>>> branch"#;

        let hunks = ConflictParser::parse_conflicts(content);
        let result =
            ConflictResolver::resolve_hunk(content, &hunks[0], &ResolutionStrategy::KeepBoth, None)
                .unwrap();

        assert!(result.contains("our code"));
        assert!(result.contains("their code"));
    }

    #[test]
    fn test_resolve_manual() {
        let content = r#"<<<<<<< HEAD
our code
=======
their code
>>>>>>> branch"#;

        let hunks = ConflictParser::parse_conflicts(content);
        let manual = "completely custom merged code";
        let result = ConflictResolver::resolve_hunk(
            content,
            &hunks[0],
            &ResolutionStrategy::Manual,
            Some(manual),
        )
        .unwrap();

        assert!(result.contains("completely custom merged code"));
        assert!(!result.contains("our code"));
        assert!(!result.contains("their code"));
    }

    #[test]
    fn test_resolve_all_hunks() {
        let content = r#"start
<<<<<<< HEAD
ours 1
=======
theirs 1
>>>>>>> b1
middle
<<<<<<< HEAD
ours 2
=======
theirs 2
>>>>>>> b2
end"#;

        let hunks = ConflictParser::parse_conflicts(content);
        let resolutions = vec![
            HunkResolution {
                hunk_index: 0,
                strategy: ResolutionStrategy::KeepOurs,
                resolved_content: None,
            },
            HunkResolution {
                hunk_index: 1,
                strategy: ResolutionStrategy::KeepTheirs,
                resolved_content: None,
            },
        ];

        let result = ConflictResolver::resolve_all_hunks(content, &hunks, &resolutions).unwrap();

        assert!(result.contains("ours 1"));
        assert!(!result.contains("theirs 1"));
        assert!(!result.contains("ours 2"));
        assert!(result.contains("theirs 2"));
        assert!(!ConflictParser::has_conflicts(&result));
    }

    #[test]
    fn test_generate_llm_prompt() {
        let hunk = ConflictHunk {
            start_line: 1,
            end_line: 5,
            ours: "function foo() { return 1; }".to_string(),
            theirs: "function foo() { return 2; }".to_string(),
            base: None,
            ours_label: Some("main".to_string()),
            theirs_label: Some("feature".to_string()),
        };

        let prompt = ConflictResolver::generate_llm_prompt(&hunk, "src/main.rs");

        assert!(prompt.contains("src/main.rs"));
        assert!(prompt.contains("function foo()"));
        assert!(prompt.contains("OURS (main)"));
        assert!(prompt.contains("THEIRS (feature)"));
        assert!(prompt.contains("merged_content"));
    }
}
