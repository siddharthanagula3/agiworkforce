/**
 * Git Operations Integration
 * Full Git functionality for repository management
 */
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

/// Git repository status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub ahead: usize,
    pub behind: usize,
    pub staged: Vec<String>,
    pub unstaged: Vec<String>,
    pub untracked: Vec<String>,
    pub conflicts: Vec<String>,
}

/// Git commit information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub message: String,
}

/// Git branch information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    pub last_commit: String,
}

/// Git diff information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiff {
    pub file_path: String,
    pub additions: usize,
    pub deletions: usize,
    pub diff_content: String,
}

/// Initialize a new Git repository
#[tauri::command]
pub async fn git_init(path: String) -> Result<String, String> {
    tracing::info!("Initializing Git repository at: {}", path);

    let output = Command::new("git")
        .current_dir(&path)
        .arg("init")
        .output()
        .map_err(|e| format!("Failed to execute git init: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Get repository status
#[tauri::command]
pub async fn git_status(path: String) -> Result<GitStatus, String> {
    tracing::info!("Getting Git status for: {}", path);

    // Get current branch
    let branch_output = Command::new("git")
        .current_dir(&path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| format!("Failed to get branch: {}", e))?;

    let branch = String::from_utf8_lossy(&branch_output.stdout)
        .trim()
        .to_string();

    // Get ahead/behind count
    let (ahead, behind) = get_ahead_behind_count(&path)?;

    // Get staged files
    let staged_output = Command::new("git")
        .current_dir(&path)
        .args(["diff", "--cached", "--name-only"])
        .output()
        .map_err(|e| format!("Failed to get staged files: {}", e))?;

    let staged: Vec<String> = String::from_utf8_lossy(&staged_output.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .map(|s| s.to_string())
        .collect();

    // Get unstaged files
    let unstaged_output = Command::new("git")
        .current_dir(&path)
        .args(["diff", "--name-only"])
        .output()
        .map_err(|e| format!("Failed to get unstaged files: {}", e))?;

    let unstaged: Vec<String> = String::from_utf8_lossy(&unstaged_output.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .map(|s| s.to_string())
        .collect();

    // Get untracked files
    let untracked_output = Command::new("git")
        .current_dir(&path)
        .args(["ls-files", "--others", "--exclude-standard"])
        .output()
        .map_err(|e| format!("Failed to get untracked files: {}", e))?;

    let untracked: Vec<String> = String::from_utf8_lossy(&untracked_output.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .map(|s| s.to_string())
        .collect();

    // Check for conflicts
    let conflicts_output = Command::new("git")
        .current_dir(&path)
        .args(["diff", "--name-only", "--diff-filter=U"])
        .output()
        .map_err(|e| format!("Failed to check conflicts: {}", e))?;

    let conflicts: Vec<String> = String::from_utf8_lossy(&conflicts_output.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .map(|s| s.to_string())
        .collect();

    Ok(GitStatus {
        branch,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
        conflicts,
    })
}

/// Add files to staging area
#[tauri::command]
pub async fn git_add(path: String, files: Vec<String>) -> Result<String, String> {
    tracing::info!("Adding {} files to staging", files.len());

    let mut args = vec!["add"];
    let file_refs: Vec<&str> = files.iter().map(|s| s.as_str()).collect();
    args.extend(&file_refs);

    let output = Command::new("git")
        .current_dir(&path)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to add files: {}", e))?;

    if output.status.success() {
        Ok(format!("Added {} files", files.len()))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Commit staged changes
#[tauri::command]
pub async fn git_commit(path: String, message: String) -> Result<String, String> {
    tracing::info!("Creating commit with message: {}", message);

    let output = Command::new("git")
        .current_dir(&path)
        .args(["commit", "-m", &message])
        .output()
        .map_err(|e| format!("Failed to commit: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Push to remote repository
#[tauri::command]
pub async fn git_push(
    path: String,
    remote: Option<String>,
    branch: Option<String>,
    force: bool,
) -> Result<String, String> {
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());

    tracing::info!("Pushing to {}", remote_name);

    let mut args = vec!["push"];
    if force {
        args.push("--force");
    }
    args.push(&remote_name);

    if let Some(ref branch_name) = branch {
        args.push(branch_name);
    }

    let output = Command::new("git")
        .current_dir(&path)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to push: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Pull from remote repository
#[tauri::command]
pub async fn git_pull(
    path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<String, String> {
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());

    tracing::info!("Pulling from {}", remote_name);

    let mut args = vec!["pull", &remote_name];

    let branch_str;
    if let Some(ref branch_name) = branch {
        branch_str = branch_name.clone();
        args.push(&branch_str);
    }

    let output = Command::new("git")
        .current_dir(&path)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to pull: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Create a new branch
#[tauri::command]
pub async fn git_create_branch(path: String, branch_name: String) -> Result<String, String> {
    tracing::info!("Creating branch: {}", branch_name);

    let output = Command::new("git")
        .current_dir(&path)
        .args(["branch", &branch_name])
        .output()
        .map_err(|e| format!("Failed to create branch: {}", e))?;

    if output.status.success() {
        Ok(format!("Branch '{}' created", branch_name))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Switch to a branch
#[tauri::command]
pub async fn git_checkout(path: String, branch_name: String) -> Result<String, String> {
    tracing::info!("Switching to branch: {}", branch_name);

    let output = Command::new("git")
        .current_dir(&path)
        .args(["checkout", &branch_name])
        .output()
        .map_err(|e| format!("Failed to checkout branch: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Create and switch to a new branch
#[tauri::command]
pub async fn git_checkout_new_branch(path: String, branch_name: String) -> Result<String, String> {
    tracing::info!("Creating and switching to branch: {}", branch_name);

    let output = Command::new("git")
        .current_dir(&path)
        .args(["checkout", "-b", &branch_name])
        .output()
        .map_err(|e| format!("Failed to checkout new branch: {}", e))?;

    if output.status.success() {
        Ok(format!("Switched to new branch '{}'", branch_name))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// List all branches
#[tauri::command]
pub async fn git_list_branches(path: String) -> Result<Vec<GitBranch>, String> {
    tracing::info!("Listing branches");

    let output = Command::new("git")
        .current_dir(&path)
        .args(["branch", "-v"])
        .output()
        .map_err(|e| format!("Failed to list branches: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let branches: Vec<GitBranch> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let is_current = line.starts_with('*');
            let line = line.trim_start_matches('*').trim();
            let parts: Vec<&str> = line.split_whitespace().collect();

            GitBranch {
                name: parts.first().unwrap_or(&"").to_string(),
                is_current,
                last_commit: parts.get(1).unwrap_or(&"").to_string(),
            }
        })
        .collect();

    Ok(branches)
}

/// Delete a branch
#[tauri::command]
pub async fn git_delete_branch(
    path: String,
    branch_name: String,
    force: bool,
) -> Result<String, String> {
    tracing::info!("Deleting branch: {}", branch_name);

    let flag = if force { "-D" } else { "-d" };

    let output = Command::new("git")
        .current_dir(&path)
        .args(["branch", flag, &branch_name])
        .output()
        .map_err(|e| format!("Failed to delete branch: {}", e))?;

    if output.status.success() {
        Ok(format!("Branch '{}' deleted", branch_name))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Merge a branch
#[tauri::command]
pub async fn git_merge(path: String, branch_name: String) -> Result<String, String> {
    tracing::info!("Merging branch: {}", branch_name);

    let output = Command::new("git")
        .current_dir(&path)
        .args(["merge", &branch_name])
        .output()
        .map_err(|e| format!("Failed to merge: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Get commit log
#[tauri::command]
pub async fn git_log(path: String, limit: Option<usize>) -> Result<Vec<GitCommit>, String> {
    let max_count = limit.unwrap_or(50);
    tracing::info!("Getting commit log (limit: {})", max_count);

    let output = Command::new("git")
        .current_dir(&path)
        .args([
            "log",
            "--pretty=format:%H|%an|%ae|%ad|%s",
            "--date=iso",
            &format!("-n{}", max_count),
        ])
        .output()
        .map_err(|e| format!("Failed to get log: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let commits: Vec<GitCommit> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.split('|').collect();
            GitCommit {
                hash: parts.first().unwrap_or(&"").to_string(),
                author: parts.get(1).unwrap_or(&"").to_string(),
                email: parts.get(2).unwrap_or(&"").to_string(),
                date: parts.get(3).unwrap_or(&"").to_string(),
                message: parts.get(4).unwrap_or(&"").to_string(),
            }
        })
        .collect();

    Ok(commits)
}

/// Get diff for a file or all changes
#[tauri::command]
pub async fn git_diff(
    path: String,
    file_path: Option<String>,
    staged: bool,
) -> Result<Vec<GitDiff>, String> {
    tracing::info!("Getting diff{}", if staged { " (staged)" } else { "" });

    let mut args = vec!["diff"];
    if staged {
        args.push("--cached");
    }
    args.push("--numstat");

    if let Some(ref file) = file_path {
        args.push(file);
    }

    let output = Command::new("git")
        .current_dir(&path)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to get diff: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let diffs: Vec<GitDiff> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                Some(GitDiff {
                    file_path: parts[2].to_string(),
                    additions: parts[0].parse().unwrap_or(0),
                    deletions: parts[1].parse().unwrap_or(0),
                    diff_content: String::new(), // Full diff content would require separate command
                })
            } else {
                None
            }
        })
        .collect();

    Ok(diffs)
}

/// Clone a repository
#[tauri::command]
pub async fn git_clone(url: String, destination: String) -> Result<String, String> {
    tracing::info!("Cloning repository from: {}", url);

    let output = Command::new("git")
        .args(["clone", &url, &destination])
        .output()
        .map_err(|e| format!("Failed to clone: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Fetch from remote
#[tauri::command]
pub async fn git_fetch(path: String, remote: Option<String>) -> Result<String, String> {
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    tracing::info!("Fetching from: {}", remote_name);

    let output = Command::new("git")
        .current_dir(&path)
        .args(["fetch", &remote_name])
        .output()
        .map_err(|e| format!("Failed to fetch: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Stash changes
#[tauri::command]
pub async fn git_stash(path: String, message: Option<String>) -> Result<String, String> {
    tracing::info!("Stashing changes");

    let mut args = vec!["stash", "push"];
    if let Some(msg) = message {
        args.push("-m");
        args.push(&msg);
    }

    let output = Command::new("git")
        .current_dir(&path)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to stash: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Pop stashed changes
#[tauri::command]
pub async fn git_stash_pop(path: String) -> Result<String, String> {
    tracing::info!("Popping stash");

    let output = Command::new("git")
        .current_dir(&path)
        .args(["stash", "pop"])
        .output()
        .map_err(|e| format!("Failed to pop stash: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Reset to a specific commit
#[tauri::command]
pub async fn git_reset(
    path: String,
    commit: String,
    mode: String, // soft, mixed, hard
) -> Result<String, String> {
    tracing::info!("Resetting to {} ({})", commit, mode);

    let flag = match mode.as_str() {
        "soft" => "--soft",
        "mixed" => "--mixed",
        "hard" => "--hard",
        _ => return Err(format!("Invalid reset mode: {}", mode)),
    };

    let output = Command::new("git")
        .current_dir(&path)
        .args(["reset", flag, &commit])
        .output()
        .map_err(|e| format!("Failed to reset: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Get remote repositories
#[tauri::command]
pub async fn git_list_remotes(path: String) -> Result<Vec<(String, String)>, String> {
    tracing::info!("Listing remotes");

    let output = Command::new("git")
        .current_dir(&path)
        .args(["remote", "-v"])
        .output()
        .map_err(|e| format!("Failed to list remotes: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let remotes: Vec<(String, String)> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|l| l.contains("(fetch)"))
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                Some((parts[0].to_string(), parts[1].to_string()))
            } else {
                None
            }
        })
        .collect();

    Ok(remotes)
}

/// Add a remote
#[tauri::command]
pub async fn git_add_remote(path: String, name: String, url: String) -> Result<String, String> {
    tracing::info!("Adding remote {} -> {}", name, url);

    let output = Command::new("git")
        .current_dir(&path)
        .args(["remote", "add", &name, &url])
        .output()
        .map_err(|e| format!("Failed to add remote: {}", e))?;

    if output.status.success() {
        Ok(format!("Remote '{}' added", name))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

// Helper functions

fn get_ahead_behind_count(path: &str) -> Result<(usize, usize), String> {
    let output = Command::new("git")
        .current_dir(path)
        .args(["rev-list", "--left-right", "--count", "HEAD...@{u}"])
        .output()
        .map_err(|e| format!("Failed to get ahead/behind count: {}", e))?;

    if !output.status.success() {
        // No upstream configured, return 0, 0
        return Ok((0, 0));
    }

    let counts = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = counts.trim().split_whitespace().collect();

    let ahead = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
    let behind = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);

    Ok((ahead, behind))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_git_status_struct() {
        let status = GitStatus {
            branch: "main".to_string(),
            ahead: 0,
            behind: 0,
            staged: vec![],
            unstaged: vec![],
            untracked: vec![],
            conflicts: vec![],
        };
        assert_eq!(status.branch, "main");
    }

    #[test]
    fn test_git_commit_struct() {
        let commit = GitCommit {
            hash: "abc123".to_string(),
            author: "John Doe".to_string(),
            email: "john@example.com".to_string(),
            date: "2025-01-01".to_string(),
            message: "Initial commit".to_string(),
        };
        assert_eq!(commit.author, "John Doe");
    }
}
