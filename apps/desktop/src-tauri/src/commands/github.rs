/**
 * GitHub Repository Integration
 * Clone, browse, and understand GitHub repositories similar to Claude's GitHub integration
 */
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRepo {
    pub owner: String,
    pub name: String,
    pub url: String,
    pub branch: Option<String>,
    pub local_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoFile {
    pub path: String,
    pub content: Option<String>,
    pub file_type: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoContext {
    pub repo: GitHubRepo,
    pub files: Vec<RepoFile>,
    pub structure: String,
    pub readme: Option<String>,
    pub languages: HashMap<String, u64>,
}

pub struct GitHubState {
    pub repos: Arc<Mutex<HashMap<String, RepoContext>>>,
    pub workspace_dir: PathBuf,
}

impl GitHubState {
    pub fn new(workspace_dir: PathBuf) -> Self {
        Self {
            repos: Arc::new(Mutex::new(HashMap::new())),
            workspace_dir,
        }
    }
}

/// Clone a GitHub repository
#[tauri::command]
pub async fn github_clone_repo(
    repo_url: String,
    branch: Option<String>,
    state: State<'_, Arc<Mutex<GitHubState>>>,
) -> Result<RepoContext, String> {
    tracing::info!("Cloning GitHub repository: {}", repo_url);

    let github_state = state.lock().await;

    // Parse repository URL
    let (owner, name) = parse_github_url(&repo_url)?;

    // Create local path
    let repo_id = format!("{}/{}", owner, name);
    let local_path = github_state.workspace_dir.join(&owner).join(&name);
    let local_path_clone = local_path.clone();
    let repo_url_clone = repo_url.clone();
    let branch_clone = branch.clone();

    // Perform git operations in blocking thread
    tauri::async_runtime::spawn_blocking(move || {
        use git2::{Cred, FetchOptions, RemoteCallbacks, Repository, build::RepoBuilder};

        if local_path_clone.exists() {
            tracing::info!(
                "Repository already exists at {:?}, pulling latest",
                local_path_clone
            );

            let repo = Repository::open(&local_path_clone).map_err(|e| e.message().to_string())?;
            let remote_name = "origin";
            let mut remote = repo.find_remote(remote_name).map_err(|e| e.message().to_string())?;

            let branch_name = branch_clone.as_deref().unwrap_or("main");

            let mut callbacks = RemoteCallbacks::new();
            callbacks.credentials(|_url, username_from_url, _allowed_types| {
                Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
            });

            let mut fetch_opts = FetchOptions::new();
            fetch_opts.remote_callbacks(callbacks);

            remote.fetch(&[branch_name], Some(&mut fetch_opts), None)
                .map_err(|e| e.message().to_string())?;

            // Merge analysis
            let fetch_head = repo.find_reference("FETCH_HEAD").map_err(|e| e.message().to_string())?;
            let fetch_commit = repo.reference_to_annotated_commit(&fetch_head).map_err(|e| e.message().to_string())?;
            let analysis = repo.merge_analysis(&[&fetch_commit]).map_err(|e| e.message().to_string())?;

            if analysis.0.is_fast_forward() {
                let refname = format!("refs/heads/{}", branch_name);
                let mut reference = repo.find_reference(&refname).map_err(|e| e.message().to_string())?;
                reference.set_target(fetch_commit.id(), "Fast-Forward").map_err(|e| e.message().to_string())?;
                repo.set_head(&refname).map_err(|e| e.message().to_string())?;
                repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force())).map_err(|e| e.message().to_string())?;
            } else if analysis.0.is_normal() {
                let head_commit = repo.reference_to_annotated_commit(&repo.head().unwrap()).unwrap();
                repo.merge(&[&fetch_commit], None, None).map_err(|e| e.message().to_string())?;
                
                // Auto commit merge
                let sig = repo.signature().unwrap();
                let tree_id = repo.index().unwrap().write_tree().unwrap();
                let tree = repo.find_tree(tree_id).unwrap();
                
                let head_commit_obj = repo.find_commit(head_commit.id()).unwrap();
                let fetch_commit_obj = repo.find_commit(fetch_commit.id()).unwrap();
                
                repo.commit(Some("HEAD"), &sig, &sig, "Merge", &tree, &[&head_commit_obj, &fetch_commit_obj]).unwrap();
                
                repo.checkout_head(None).unwrap();
            }
        } else {
            // Clone repository
            std::fs::create_dir_all(local_path_clone.parent().unwrap())
                .map_err(|e| format!("Failed to create directory: {}", e))?;

            let mut callbacks = RemoteCallbacks::new();
            callbacks.credentials(|_url, username_from_url, _allowed_types| {
                Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
            });

            let mut fetch_opts = FetchOptions::new();
            fetch_opts.remote_callbacks(callbacks);

            let mut builder = RepoBuilder::new();
            builder.fetch_options(fetch_opts);
            
            if let Some(br) = branch_clone {
                builder.branch(&br);
            }

            builder.clone(&repo_url_clone, &local_path_clone)
                .map_err(|e| e.message().to_string())?;
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())??;

    // Build repository context
    let repo = GitHubRepo {
        owner: owner.clone(),
        name: name.clone(),
        url: repo_url,
        branch,
        local_path: Some(local_path.clone()),
    };

    let context = build_repo_context(&repo, &local_path).await?;

    // Store in state
    let mut repos = github_state.repos.lock().await;
    repos.insert(repo_id, context.clone());

    Ok(context)
}

/// Get repository context
#[tauri::command]
pub async fn github_get_repo_context(
    owner: String,
    name: String,
    state: State<'_, Arc<Mutex<GitHubState>>>,
) -> Result<RepoContext, String> {
    let github_state = state.lock().await;
    let repo_id = format!("{}/{}", owner, name);

    let repos = github_state.repos.lock().await;
    repos
        .get(&repo_id)
        .cloned()
        .ok_or_else(|| format!("Repository not found: {}", repo_id))
}

/// Search files in repository
#[tauri::command]
pub async fn github_search_files(
    owner: String,
    name: String,
    query: String,
    state: State<'_, Arc<Mutex<GitHubState>>>,
) -> Result<Vec<RepoFile>, String> {
    let context = github_get_repo_context(owner, name, state).await?;

    let matching_files: Vec<RepoFile> = context
        .files
        .into_iter()
        .filter(|f| {
            f.path.to_lowercase().contains(&query.to_lowercase())
                || f.content
                    .as_ref()
                    .map(|c| c.to_lowercase().contains(&query.to_lowercase()))
                    .unwrap_or(false)
        })
        .collect();

    Ok(matching_files)
}

/// Read file from repository
#[tauri::command]
pub async fn github_read_file(
    owner: String,
    name: String,
    file_path: String,
    state: State<'_, Arc<Mutex<GitHubState>>>,
) -> Result<String, String> {
    let github_state = state.lock().await;
    let repo_id = format!("{}/{}", owner, name);

    let repos = github_state.repos.lock().await;
    let context = repos
        .get(&repo_id)
        .ok_or_else(|| format!("Repository not found: {}", repo_id))?;

    let local_path = context
        .repo
        .local_path
        .as_ref()
        .ok_or("Repository not cloned locally")?;

    let full_path = local_path.join(&file_path);
    std::fs::read_to_string(full_path).map_err(|e| format!("Failed to read file: {}", e))
}

/// Get repository file tree
#[tauri::command]
pub async fn github_get_file_tree(
    owner: String,
    name: String,
    state: State<'_, Arc<Mutex<GitHubState>>>,
) -> Result<String, String> {
    let context = github_get_repo_context(owner, name, state).await?;
    Ok(context.structure)
}

/// List all cloned repositories
#[tauri::command]
pub async fn github_list_repos(
    state: State<'_, Arc<Mutex<GitHubState>>>,
) -> Result<Vec<GitHubRepo>, String> {
    let github_state = state.lock().await;
    let repos = github_state.repos.lock().await;
    Ok(repos.values().map(|ctx| ctx.repo.clone()).collect())
}

// Helper functions

fn parse_github_url(url: &str) -> Result<(String, String), String> {
    // Parse various GitHub URL formats
    // https://github.com/owner/repo
    // git@github.com:owner/repo.git
    // owner/repo

    let url = url.trim_end_matches('/').trim_end_matches(".git");

    if url.contains("github.com") {
        let parts: Vec<&str> = url.split('/').collect();
        if parts.len() >= 2 {
            let owner = parts[parts.len() - 2].to_string();
            let name = parts[parts.len() - 1].to_string();
            return Ok((owner, name));
        }
    } else if url.contains('/') {
        let parts: Vec<&str> = url.split('/').collect();
        if parts.len() == 2 {
            return Ok((parts[0].to_string(), parts[1].to_string()));
        }
    }

    Err(format!("Invalid GitHub URL format: {}", url))
}

async fn build_repo_context(
    repo: &GitHubRepo,
    local_path: &PathBuf,
) -> Result<RepoContext, String> {
    // Get repository structure
    let structure = generate_file_tree(local_path)?;

    // Read README
    let readme = read_readme(local_path);

    // Scan files
    let files = scan_repository_files(local_path)?;

    // Analyze languages
    let languages = analyze_languages(&files);

    Ok(RepoContext {
        repo: repo.clone(),
        files,
        structure,
        readme,
        languages,
    })
}

fn generate_file_tree(path: &PathBuf) -> Result<String, String> {
    let output = Command::new("tree")
        .current_dir(path)
        .args(["-L", "3", "-I", "node_modules|target|dist|.git"])
        .output();

    match output {
        Ok(output) if output.status.success() => {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        }
        _ => {
            // Fallback: use ls if tree is not available
            let output = Command::new("ls")
                .current_dir(path)
                .args(["-R"])
                .output()
                .map_err(|e| format!("Failed to list files: {}", e))?;

            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        }
    }
}

fn read_readme(path: &PathBuf) -> Option<String> {
    for name in &["README.md", "README.MD", "readme.md", "README", "Readme.md"] {
        let readme_path = path.join(name);
        if let Ok(content) = std::fs::read_to_string(&readme_path) {
            return Some(content);
        }
    }
    None
}

fn scan_repository_files(path: &PathBuf) -> Result<Vec<RepoFile>, String> {
    let mut files = Vec::new();

    fn scan_dir(
        dir: &PathBuf,
        base: &PathBuf,
        files: &mut Vec<RepoFile>,
        depth: usize,
    ) -> Result<(), String> {
        if depth > 10 {
            return Ok(()); // Prevent infinite recursion
        }

        let entries =
            std::fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();

            // Skip hidden and ignored directories
            if let Some(name) = path.file_name() {
                let name_str = name.to_string_lossy();
                if name_str.starts_with('.')
                    || name_str == "node_modules"
                    || name_str == "target"
                    || name_str == "dist"
                    || name_str == "build"
                {
                    continue;
                }
            }

            if path.is_file() {
                let relative_path = path
                    .strip_prefix(base)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();

                let metadata = std::fs::metadata(&path).ok();
                let size = metadata.map(|m| m.len()).unwrap_or(0);

                let file_type = path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .unwrap_or("unknown")
                    .to_string();

                // Only read content for small text files
                let content = if is_text_file(&file_type) && size < 100_000 {
                    std::fs::read_to_string(&path).ok()
                } else {
                    None
                };

                files.push(RepoFile {
                    path: relative_path,
                    content,
                    file_type,
                    size,
                });
            } else if path.is_dir() {
                scan_dir(&path, base, files, depth + 1)?;
            }
        }

        Ok(())
    }

    scan_dir(path, path, &mut files, 0)?;
    Ok(files)
}

fn is_text_file(ext: &str) -> bool {
    matches!(
        ext,
        "rs" | "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "py"
            | "java"
            | "c"
            | "cpp"
            | "h"
            | "hpp"
            | "go"
            | "rb"
            | "php"
            | "cs"
            | "swift"
            | "kt"
            | "scala"
            | "sh"
            | "bash"
            | "md"
            | "txt"
            | "json"
            | "yaml"
            | "yml"
            | "toml"
            | "xml"
            | "html"
            | "css"
            | "scss"
            | "sass"
            | "less"
            | "sql"
            | "proto"
            | "graphql"
            | "vue"
    )
}

fn analyze_languages(files: &[RepoFile]) -> HashMap<String, u64> {
    let mut languages = HashMap::new();

    for file in files {
        let lang = match file.file_type.as_str() {
            "rs" => "Rust",
            "ts" | "tsx" => "TypeScript",
            "js" | "jsx" => "JavaScript",
            "py" => "Python",
            "java" => "Java",
            "go" => "Go",
            "c" | "h" => "C",
            "cpp" | "hpp" | "cc" => "C++",
            "rb" => "Ruby",
            "php" => "PHP",
            "cs" => "C#",
            "swift" => "Swift",
            "kt" => "Kotlin",
            _ => continue,
        };

        *languages.entry(lang.to_string()).or_insert(0) += file.size;
    }

    languages
}
