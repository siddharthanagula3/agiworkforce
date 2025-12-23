use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[tauri::command]
pub async fn fs_search_files(query: String, limit: usize) -> Result<Vec<String>, String> {
    let cwd = std::env::current_dir().map_err(|e| format!("Failed to get cwd: {}", e))?;

    tokio::task::spawn_blocking(move || search_files_blocking(&cwd, &query, limit))
        .await
        .map_err(|e| format!("Search task failed: {}", e))?
}

#[tauri::command]
pub async fn fs_search_folders(query: String, limit: usize) -> Result<Vec<String>, String> {
    let cwd = std::env::current_dir().map_err(|e| format!("Failed to get cwd: {}", e))?;

    tokio::task::spawn_blocking(move || search_folders_blocking(&cwd, &query, limit))
        .await
        .map_err(|e| format!("Search task failed: {}", e))?
}

fn search_files_blocking(root: &Path, query: &str, limit: usize) -> Result<Vec<String>, String> {
    let mut results = Vec::new();
    let query_lower = query.to_lowercase();

    for entry in WalkDir::new(root)
        .max_depth(5)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !is_hidden(e.path()) && !is_ignored(e.path()))
    {
        if results.len() >= limit {
            break;
        }

        let entry = entry.map_err(|e| format!("Walk error: {}", e))?;

        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let path_str = path.to_string_lossy();

        if query_lower.is_empty() {
            results.push(path_str.to_string());
        } else {
            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_lowercase();

            if file_name.contains(&query_lower) || path_str.to_lowercase().contains(&query_lower) {
                results.push(path_str.to_string());
            }
        }
    }

    results.sort_by(|a, b| {
        let a_name = Path::new(a)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();
        let b_name = Path::new(b)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();

        let a_starts = a_name.starts_with(&query_lower);
        let b_starts = b_name.starts_with(&query_lower);

        match (a_starts, b_starts) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.len().cmp(&b.len()),
        }
    });

    Ok(results)
}

fn search_folders_blocking(root: &Path, query: &str, limit: usize) -> Result<Vec<String>, String> {
    let mut results = Vec::new();
    let query_lower = query.to_lowercase();

    for entry in WalkDir::new(root)
        .max_depth(5)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !is_hidden(e.path()) && !is_ignored(e.path()))
    {
        if results.len() >= limit {
            break;
        }

        let entry = entry.map_err(|e| format!("Walk error: {}", e))?;

        if !entry.file_type().is_dir() {
            continue;
        }

        let path = entry.path();
        let path_str = path.to_string_lossy();

        if query_lower.is_empty() {
            results.push(path_str.to_string());
        } else {
            let folder_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_lowercase();

            if folder_name.contains(&query_lower) || path_str.to_lowercase().contains(&query_lower)
            {
                results.push(path_str.to_string());
            }
        }
    }

    results.sort_by(|a, b| {
        let a_name = Path::new(a)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();
        let b_name = Path::new(b)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();

        let a_starts = a_name.starts_with(&query_lower);
        let b_starts = b_name.starts_with(&query_lower);

        match (a_starts, b_starts) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.len().cmp(&b.len()),
        }
    });

    Ok(results)
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.'))
        .unwrap_or(false)
}

fn is_ignored(path: &Path) -> bool {
    let ignore_patterns = [
        "node_modules",
        "target",
        "dist",
        "build",
        ".git",
        ".next",
        ".turbo",
        "coverage",
        "__pycache__",
        ".venv",
        "venv",
    ];

    path.components().any(|comp| {
        comp.as_os_str()
            .to_str()
            .map(|s| ignore_patterns.contains(&s))
            .unwrap_or(false)
    })
}

async fn _deprecated_fs_read_file_content(
    file_path: String,
) -> Result<FileContentResponse, String> {
    let path = PathBuf::from(&file_path);

    tokio::task::spawn_blocking(move || {
        if !path.exists() {
            return Err(format!("File not found: {}", file_path));
        }

        if !path.is_file() {
            return Err(format!("Path is not a file: {}", file_path));
        }

        let metadata =
            fs::metadata(&path).map_err(|e| format!("Failed to read metadata: {}", e))?;
        let size = metadata.len();

        const MAX_SIZE: u64 = 100 * 1024;
        let content = if size > MAX_SIZE {
            let file_content =
                fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
            let truncated: Vec<u8> = file_content.into_iter().take(MAX_SIZE as usize).collect();

            String::from_utf8_lossy(&truncated).to_string()
                + "\n\n[... content truncated, file too large]"
        } else {
            fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?
        };

        let line_count = content.lines().count();

        let language = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_string());

        let excerpt = content.lines().take(5).collect::<Vec<_>>().join("\n");

        Ok(FileContentResponse {
            content,
            size,
            line_count,
            language,
            excerpt,
        })
    })
    .await
    .map_err(|e| format!("File read task failed: {}", e))?
}

#[derive(serde::Serialize)]
pub struct FileContentResponse {
    pub content: String,
    pub size: u64,
    pub line_count: usize,
    pub language: Option<String>,
    pub excerpt: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_hidden() {
        assert!(is_hidden(Path::new(".hidden")));
        assert!(is_hidden(Path::new("path/to/.hidden")));
        assert!(!is_hidden(Path::new("visible")));
    }

    #[test]
    fn test_is_ignored() {
        assert!(is_ignored(Path::new("project/node_modules/package")));
        assert!(is_ignored(Path::new("project/target/debug")));
        assert!(!is_ignored(Path::new("project/src/main.rs")));
    }
}
