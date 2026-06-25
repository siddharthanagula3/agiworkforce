use super::*;

const MAX_WORKTREE_SLUG_LENGTH: usize = 64;
const WORKTREE_PREFIX: &str = "agi-worktree-";
const WORKTREE_DIR: &str = ".agiworkforce/worktrees";

#[derive(Debug, Clone)]
struct WorktreeInfo {
    slug: String,
    name: String,
    branch: String,
    path: PathBuf,
    head: Option<String>,
    dirty: bool,
    existed: bool,
}

fn validate_worktree_slug(slug: &str) -> Result<String> {
    let trimmed = slug.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("worktree slug must not be empty"));
    }
    if trimmed.len() > MAX_WORKTREE_SLUG_LENGTH {
        return Err(anyhow!(
            "worktree slug must be {MAX_WORKTREE_SLUG_LENGTH} characters or fewer"
        ));
    }

    for segment in trimmed.split('/') {
        if segment == "." || segment == ".." {
            return Err(anyhow!("worktree slug must not contain . or .. segments"));
        }
        if segment.is_empty()
            || !segment
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
        {
            return Err(anyhow!(
                "worktree slug segments may contain only letters, digits, dots, underscores, and dashes"
            ));
        }
    }

    Ok(trimmed.replace('/', "+"))
}

fn branch_for_flattened_slug(flattened_slug: &str) -> String {
    format!("{WORKTREE_PREFIX}{flattened_slug}")
}

fn worktree_path_for(repo_root: &Path, flattened_slug: &str) -> PathBuf {
    repo_root.join(WORKTREE_DIR).join(flattened_slug)
}

fn open_repo_root(path: &Path) -> Result<PathBuf> {
    let repo = git2::Repository::discover(path).map_err(|e| {
        anyhow!(
            "Could not discover a git repository from {}: {e}",
            path.display()
        )
    })?;
    repo.workdir()
        .map(|path| path.to_path_buf())
        .ok_or_else(|| anyhow!("bare repositories are not supported for worktree tools"))
}

fn worktree_head_and_dirty(path: &Path) -> Result<(Option<String>, bool)> {
    let repo = git2::Repository::open(path)
        .map_err(|e| anyhow!("Failed to open worktree {}: {e}", path.display()))?;

    let head = repo
        .head()
        .ok()
        .and_then(|reference| reference.target())
        .map(|oid| oid.to_string());

    let mut options = git2::StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true);
    let statuses = repo
        .statuses(Some(&mut options))
        .map_err(|e| anyhow!("Failed to inspect worktree status: {e}"))?;

    Ok((head, !statuses.is_empty()))
}

fn create_or_resume_worktree(repo_root: &Path, slug: &str) -> Result<WorktreeInfo> {
    let flattened_slug = validate_worktree_slug(slug)?;
    let repo_root = open_repo_root(repo_root)?;
    let branch = branch_for_flattened_slug(&flattened_slug);
    let path = worktree_path_for(&repo_root, &flattened_slug);
    let name = branch.clone();

    if path.exists() {
        let (head, dirty) = worktree_head_and_dirty(&path)?;
        return Ok(WorktreeInfo {
            slug: slug.trim().to_string(),
            name,
            branch,
            path,
            head,
            dirty,
            existed: true,
        });
    }

    std::fs::create_dir_all(repo_root.join(WORKTREE_DIR))?;

    let repo = git2::Repository::open(&repo_root)
        .map_err(|e| anyhow!("Failed to open repository {}: {e}", repo_root.display()))?;
    let head_commit = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|e| anyhow!("Failed to resolve repository HEAD: {e}"))?;

    let reference = match repo.find_branch(&branch, git2::BranchType::Local) {
        Ok(branch) => branch.into_reference(),
        Err(error) if error.code() == git2::ErrorCode::NotFound => repo
            .branch(&branch, &head_commit, false)
            .map_err(|e| anyhow!("Failed to create branch {branch}: {e}"))?
            .into_reference(),
        Err(error) => return Err(anyhow!("Failed to inspect branch {branch}: {error}")),
    };

    let mut options = git2::WorktreeAddOptions::new();
    options.reference(Some(&reference));
    repo.worktree(&name, &path, Some(&options))
        .map_err(|e| anyhow!("Failed to create worktree {name}: {e}"))?;

    let (head, dirty) = worktree_head_and_dirty(&path)?;
    Ok(WorktreeInfo {
        slug: slug.trim().to_string(),
        name,
        branch,
        path,
        head,
        dirty,
        existed: false,
    })
}

fn list_agi_worktrees(repo_root: &Path) -> Result<Vec<WorktreeInfo>> {
    let repo_root = open_repo_root(repo_root)?;
    let repo = git2::Repository::open(&repo_root)
        .map_err(|e| anyhow!("Failed to open repository {}: {e}", repo_root.display()))?;
    let names = repo
        .worktrees()
        .map_err(|e| anyhow!("Failed to list worktrees: {e}"))?;

    let mut worktrees = Vec::new();
    for name in names.iter().filter_map(|r| r.ok().flatten()) {
        if !name.starts_with(WORKTREE_PREFIX) {
            continue;
        }

        let worktree = repo
            .find_worktree(name)
            .map_err(|e| anyhow!("Failed to open worktree {name}: {e}"))?;
        let path = worktree.path().to_path_buf();
        let (head, dirty) = if path.exists() {
            worktree_head_and_dirty(&path)?
        } else {
            (None, false)
        };

        worktrees.push(WorktreeInfo {
            slug: name.trim_start_matches(WORKTREE_PREFIX).replace('+', "/"),
            name: name.to_string(),
            branch: name.to_string(),
            path,
            head,
            dirty,
            existed: true,
        });
    }

    worktrees.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(worktrees)
}

fn remove_worktree(
    repo_root: &Path,
    slug: &str,
    force: bool,
    delete_branch: bool,
) -> Result<WorktreeInfo> {
    let flattened_slug = validate_worktree_slug(slug)?;
    let repo_root = open_repo_root(repo_root)?;
    let branch = branch_for_flattened_slug(&flattened_slug);
    let path = worktree_path_for(&repo_root, &flattened_slug);
    let name = branch.clone();

    if !path.exists() {
        return Err(anyhow!("worktree path does not exist: {}", path.display()));
    }

    let (head, dirty) = worktree_head_and_dirty(&path)?;
    if dirty && !force {
        return Err(anyhow!(
            "worktree has uncommitted or untracked changes; pass force=true only after user approval"
        ));
    }

    let mut command = std::process::Command::new("git");
    command
        .current_dir(&repo_root)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .arg("worktree")
        .arg("remove");

    if force {
        command.arg("--force");
    }

    let output = command
        .arg(&path)
        .output()
        .map_err(|e| anyhow!("Failed to run git worktree remove: {e}"))?;

    if !output.status.success() {
        return Err(anyhow!(
            "git worktree remove failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    if delete_branch {
        let repo = git2::Repository::open(&repo_root)
            .map_err(|e| anyhow!("Failed to open repository {}: {e}", repo_root.display()))?;
        if let Ok(mut branch_ref) = repo.find_branch(&branch, git2::BranchType::Local) {
            branch_ref
                .delete()
                .map_err(|e| anyhow!("Failed to delete branch {branch}: {e}"))?;
        };
    }

    Ok(WorktreeInfo {
        slug: slug.trim().to_string(),
        name,
        branch,
        path,
        head,
        dirty,
        existed: true,
    })
}

fn worktree_info_json(info: &WorktreeInfo) -> Value {
    json!({
        "slug": info.slug,
        "name": info.name,
        "branch": info.branch,
        "path": info.path,
        "head": info.head,
        "dirty": info.dirty,
        "existed": info.existed
    })
}

impl ToolExecutor {
    async fn resolve_worktree_repo_root(&self, args: &HashMap<String, Value>) -> Result<PathBuf> {
        let input = args
            .get("repo_path")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .or_else(|| self.project_folder.clone())
            .ok_or_else(|| anyhow!("Missing repo_path and no active project folder is set"))?;

        let resolved = self.resolve_path(&input);
        self.canonicalize_validated_path(&resolved).await
    }

    pub(crate) async fn execute_worktree_create_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let repo_root = self.resolve_worktree_repo_root(args).await?;
        let slug = args
            .get("slug")
            .and_then(|value| value.as_str())
            .ok_or_else(|| anyhow!("Missing slug parameter"))?
            .to_string();

        let info = tauri::async_runtime::spawn_blocking(move || {
            create_or_resume_worktree(&repo_root, &slug)
        })
        .await
        .map_err(|e| anyhow!("Worktree task join error: {e}"))??;

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "worktree": worktree_info_json(&info),
                "message": if info.existed { "worktree already existed" } else { "worktree created" },
                "note": "This creates an isolated git worktree directory, not an OS sandbox."
            }),
            error: None,
            metadata: HashMap::from([("tool".to_string(), json!("worktree_create"))]),
        })
    }

    pub(crate) async fn execute_worktree_list_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let repo_root = self.resolve_worktree_repo_root(args).await?;

        let worktrees =
            tauri::async_runtime::spawn_blocking(move || list_agi_worktrees(&repo_root))
                .await
                .map_err(|e| anyhow!("Worktree task join error: {e}"))??;

        let count = worktrees.len();
        let values: Vec<Value> = worktrees.iter().map(worktree_info_json).collect();

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "worktrees": values,
                "count": count
            }),
            error: None,
            metadata: HashMap::from([("tool".to_string(), json!("worktree_list"))]),
        })
    }

    pub(crate) async fn execute_worktree_remove_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let repo_root = self.resolve_worktree_repo_root(args).await?;
        let slug = args
            .get("slug")
            .and_then(|value| value.as_str())
            .ok_or_else(|| anyhow!("Missing slug parameter"))?
            .to_string();
        let force = args
            .get("force")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);
        let delete_branch = args
            .get("delete_branch")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);

        let info = tauri::async_runtime::spawn_blocking(move || {
            remove_worktree(&repo_root, &slug, force, delete_branch)
        })
        .await
        .map_err(|e| anyhow!("Worktree task join error: {e}"))??;

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "removed": true,
                "worktree": worktree_info_json(&info),
                "branch_deleted": delete_branch
            }),
            error: None,
            metadata: HashMap::from([("tool".to_string(), json!("worktree_remove"))]),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn init_repo_with_commit() -> Result<TempDir> {
        let dir = tempfile::tempdir()?;
        let repo = git2::Repository::init(dir.path())?;
        std::fs::write(dir.path().join("README.md"), "hello\n")?;

        let mut index = repo.index()?;
        index.add_path(Path::new("README.md"))?;
        index.write()?;
        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;
        let signature = git2::Signature::now("AGI Test", "agi@example.com")?;
        repo.commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])?;

        drop(tree);
        drop(repo);
        Ok(dir)
    }

    #[test]
    fn worktree_slug_validation_rejects_escape_segments() {
        assert!(validate_worktree_slug("../outside").is_err());
        assert!(validate_worktree_slug("nested/feature").is_ok());
        assert!(validate_worktree_slug("bad space").is_err());
    }

    #[test]
    fn worktree_create_list_and_remove_round_trip() {
        let repo_dir = init_repo_with_commit().expect("repo");

        let created =
            create_or_resume_worktree(repo_dir.path(), "demo/feature").expect("create worktree");
        assert!(!created.existed);
        assert!(created.path.exists());
        assert_eq!(created.branch, "agi-worktree-demo+feature");

        let resumed =
            create_or_resume_worktree(repo_dir.path(), "demo/feature").expect("resume worktree");
        assert!(resumed.existed);
        assert_eq!(resumed.path, created.path);

        let listed = list_agi_worktrees(repo_dir.path()).expect("list worktrees");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].slug, "demo/feature");

        let removed =
            remove_worktree(repo_dir.path(), "demo/feature", false, true).expect("remove worktree");
        assert_eq!(removed.branch, "agi-worktree-demo+feature");
        assert!(!created.path.exists());
    }

    #[test]
    fn worktree_remove_requires_force_for_dirty_tree() {
        let repo_dir = init_repo_with_commit().expect("repo");
        let created = create_or_resume_worktree(repo_dir.path(), "dirty").expect("create worktree");
        std::fs::write(created.path.join("untracked.txt"), "dirty\n").expect("write dirty file");

        let error = remove_worktree(repo_dir.path(), "dirty", false, false)
            .expect_err("dirty worktree should need force");
        assert!(error.to_string().contains("uncommitted or untracked"));

        remove_worktree(repo_dir.path(), "dirty", true, true).expect("force remove dirty worktree");
    }
}
