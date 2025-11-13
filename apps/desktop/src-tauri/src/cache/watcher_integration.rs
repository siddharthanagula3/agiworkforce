/**
 * File Watcher Integration for Codebase Cache
 *
 * Automatically invalidates cache entries when files change.
 * Integrates with the existing filesystem watcher to ensure
 * cache coherency without manual invalidation.
 */

use super::CodebaseCache;
use anyhow::Result;
use std::path::Path;
use std::sync::Arc;
use tracing::{debug, warn};

/// Handle file change events and invalidate cache accordingly
pub fn handle_file_change(cache: Arc<CodebaseCache>, file_path: &Path) -> Result<()> {
    debug!("File changed: {:?}, invalidating cache", file_path);

    match cache.invalidate_file(file_path) {
        Ok(deleted) => {
            if deleted > 0 {
                debug!("Invalidated {} cache entries for {:?}", deleted, file_path);
            }
            Ok(())
        }
        Err(e) => {
            warn!("Failed to invalidate cache for {:?}: {}", file_path, e);
            Err(e)
        }
    }
}

/// Handle file deletion events
pub fn handle_file_delete(cache: Arc<CodebaseCache>, file_path: &Path) -> Result<()> {
    debug!("File deleted: {:?}, invalidating cache", file_path);

    match cache.invalidate_file(file_path) {
        Ok(deleted) => {
            if deleted > 0 {
                debug!("Invalidated {} cache entries for deleted file {:?}", deleted, file_path);
            }
            Ok(())
        }
        Err(e) => {
            warn!("Failed to invalidate cache for deleted file {:?}: {}", file_path, e);
            Err(e)
        }
    }
}

/// Handle directory events - invalidate all files in directory
pub fn handle_directory_change(cache: Arc<CodebaseCache>, dir_path: &Path) -> Result<()> {
    debug!("Directory changed: {:?}, invalidating project cache", dir_path);

    match cache.invalidate_project(dir_path) {
        Ok(deleted) => {
            if deleted > 0 {
                debug!("Invalidated {} cache entries for directory {:?}", deleted, dir_path);
            }
            Ok(())
        }
        Err(e) => {
            warn!("Failed to invalidate cache for directory {:?}: {}", dir_path, e);
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::{CacheType, CodebaseCache, FileTree};
    use rusqlite::Connection;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};

    fn setup_test_cache() -> Result<Arc<CodebaseCache>> {
        let conn = Connection::open_in_memory()?;

        // Create schema
        conn.execute(
            "CREATE TABLE codebase_cache (
                id TEXT PRIMARY KEY,
                project_path TEXT NOT NULL,
                cache_type TEXT NOT NULL,
                file_hash TEXT,
                data TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX idx_project_path ON codebase_cache(project_path)",
            [],
        )?;

        let cache = CodebaseCache::new(Arc::new(Mutex::new(conn)))?;
        Ok(Arc::new(cache))
    }

    #[test]
    fn test_file_change_invalidation() -> Result<()> {
        let cache = setup_test_cache()?;
        let file_path = PathBuf::from("/test/project/file.rs");

        // Add cache entry
        cache.set(CacheType::Symbols, &file_path, None, &crate::cache::SymbolTable {
            file_path: Some(file_path.clone()),
            symbols: vec![],
            imports: vec![],
            exports: vec![],
        })?;

        // Trigger file change
        handle_file_change(cache.clone(), &file_path)?;

        // Entry should be gone
        let result: Option<crate::cache::SymbolTable> = cache.get(CacheType::Symbols, &file_path, None)?;
        assert!(result.is_none());

        Ok(())
    }

    #[test]
    fn test_directory_change_invalidation() -> Result<()> {
        let cache = setup_test_cache()?;
        let dir_path = PathBuf::from("/test/project");
        let file1 = dir_path.join("file1.rs");
        let file2 = dir_path.join("file2.rs");

        // Add cache entries
        cache.set(CacheType::FileTree, &dir_path, None, &FileTree {
            root: dir_path.clone(),
            entries: vec![],
            total_files: 2,
            total_dirs: 1,
            total_size_bytes: 1024,
        })?;

        // Trigger directory change
        handle_directory_change(cache.clone(), &dir_path)?;

        // Entry should be gone
        let result: Option<FileTree> = cache.get(CacheType::FileTree, &dir_path, None)?;
        assert!(result.is_none());

        Ok(())
    }
}
