use std::path::PathBuf;

/// One entry of `git worktree list --porcelain`, including the ones
/// [`crate::Worktree`] cannot express: a detached checkout, the bare main
/// worktree, and a worktree another process has locked or git has marked
/// prunable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorktreeEntry {
    pub path: PathBuf,
    pub head: Option<String>,
    pub branch: Option<String>,
    pub bare: bool,
    pub detached: bool,
    pub locked: Option<String>,
    pub prunable: Option<String>,
}

impl WorktreeEntry {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            head: None,
            branch: None,
            bare: false,
            detached: false,
            locked: None,
            prunable: None,
        }
    }

    pub fn is_usable(&self) -> bool {
        !self.bare && self.locked.is_none() && self.prunable.is_none()
    }
}

/// Parse `git worktree list --porcelain`. Records are separated by a blank
/// line, and every record but the first field is optional, so a missing branch
/// means detached rather than a worktree to drop from the list.
pub fn parse_worktree_porcelain(text: &str) -> Vec<WorktreeEntry> {
    let mut entries = Vec::new();
    let mut current: Option<WorktreeEntry> = None;
    for line in text.lines() {
        let line = line.trim_end();
        if line.is_empty() {
            if let Some(entry) = current.take() {
                entries.push(entry);
            }
            continue;
        }
        if let Some(path) = line.strip_prefix("worktree ") {
            if let Some(entry) = current.take() {
                entries.push(entry);
            }
            current = Some(WorktreeEntry::new(PathBuf::from(path)));
            continue;
        }
        let Some(entry) = current.as_mut() else {
            continue;
        };
        if let Some(head) = line.strip_prefix("HEAD ") {
            entry.head = Some(head.to_string());
        } else if let Some(branch) = line.strip_prefix("branch ") {
            entry.branch = Some(branch.trim_start_matches("refs/heads/").to_string());
        } else if line == "bare" {
            entry.bare = true;
        } else if line == "detached" {
            entry.detached = true;
        } else if let Some(reason) = line.strip_prefix("locked") {
            entry.locked = Some(reason.trim().to_string());
        } else if let Some(reason) = line.strip_prefix("prunable") {
            entry.prunable = Some(reason.trim().to_string());
        }
    }
    if let Some(entry) = current {
        entries.push(entry);
    }
    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn porcelain_keeps_the_worktrees_a_branch_filter_would_drop() {
        let entries = parse_worktree_porcelain(
            "worktree /work/repo\n\
             HEAD abc123\n\
             branch refs/heads/main\n\
             \n\
             worktree /work/wt-detached\n\
             HEAD def456\n\
             detached\n\
             \n\
             worktree /work/bare\n\
             bare\n\
             \n\
             worktree /work/wt-locked\n\
             HEAD 789abc\n\
             branch refs/heads/feature\n\
             locked under review\n",
        );

        assert_eq!(entries.len(), 4);
        assert_eq!(entries[0].branch.as_deref(), Some("main"));
        assert!(entries[0].is_usable());
        assert!(entries[1].detached);
        assert!(entries[1].branch.is_none());
        assert!(entries[2].bare);
        assert!(!entries[2].is_usable());
        assert_eq!(entries[3].locked.as_deref(), Some("under review"));
        assert!(!entries[3].is_usable());
    }
}
