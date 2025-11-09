/**
 * File System Search
 *
 * Provides fast file and folder search for autocomplete suggestions.
 */
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Search for files matching a query
#[tauri::command]
pub async fn fs_search_files(query: String, limit: usize) -> Result<Vec<String>, String> {
    // Get current working directory
    let cwd = std::env::current_dir().map_err(|e| format!("Failed to get cwd: {}", e))?;

    // Run search in background thread
    tokio::task::spawn_blocking(move || search_files_blocking(&cwd, &query, limit))
        .await
        .map_err(|e| format!("Search task failed: {}", e))?
}

/// Search for folders matching a query
#[tauri::command]
pub async fn fs_search_folders(query: String, limit: usize) -> Result<Vec<String>, String> {
    // Get current working directory
    let cwd = std::env::current_dir().map_err(|e| format!("Failed to get cwd: {}", e))?;

    // Run search in background thread
    tokio::task::spawn_blocking(move || search_folders_blocking(&cwd, &query, limit))
        .await
        .map_err(|e| format!("Search task failed: {}", e))?
}

/// Blocking file search implementation
fn search_files_blocking(root: &Path, query: &str, limit: usize) -> Result<Vec<String>, String> {
    let mut results = Vec::new();
    let query_lower = query.to_lowercase();

    for entry in WalkDir::new(root)
        .max_depth(5) // Limit depth for performance
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !is_hidden(e.path()) && !is_ignored(e.path()))
    {
        if results.len() >= limit {
            break;
        }

        let entry = entry.map_err(|e| format!("Walk error: {}", e))?;

        // Only match files
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let path_str = path.to_string_lossy();

        // Match query against filename or full path
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

    // Sort by relevance (filename matches first, then path matches)
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
            _ => a.len().cmp(&b.len()), // Shorter paths first
        }
    });

    Ok(results)
}

/// Blocking folder search implementation
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

        // Only match directories
        if !entry.file_type().is_dir() {
            continue;
        }

        let path = entry.path();
        let path_str = path.to_string_lossy();

        // Match query against folder name or full path
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

    // Sort by relevance
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

/// Check if path is hidden (starts with .)
fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.'))
        .unwrap_or(false)
}

/// Check if path should be ignored (node_modules, target, etc.)
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
