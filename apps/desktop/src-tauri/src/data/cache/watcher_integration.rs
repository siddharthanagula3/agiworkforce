use super::CodebaseCache;
use anyhow::Result;
use std::path::Path;
use std::sync::Arc;
use tracing::{debug, warn};

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

pub fn handle_file_delete(cache: Arc<CodebaseCache>, file_path: &Path) -> Result<()> {
    debug!("File deleted: {:?}, invalidating cache", file_path);

    match cache.invalidate_file(file_path) {
        Ok(deleted) => {
            if deleted > 0 {
                debug!(
                    "Invalidated {} cache entries for deleted file {:?}",
                    deleted, file_path
                );
            }
            Ok(())
        }
        Err(e) => {
            warn!(
                "Failed to invalidate cache for deleted file {:?}: {}",
                file_path, e
            );
            Err(e)
        }
    }
}

pub fn handle_directory_change(cache: Arc<CodebaseCache>, dir_path: &Path) -> Result<()> {
    debug!(
        "Directory changed: {:?}, invalidating project cache",
        dir_path
    );

    match cache.invalidate_project(dir_path) {
        Ok(deleted) => {
            if deleted > 0 {
                debug!(
                    "Invalidated {} cache entries for directory {:?}",
                    deleted, dir_path
                );
            }
            Ok(())
        }
        Err(e) => {
            warn!(
                "Failed to invalidate cache for directory {:?}: {}",
                dir_path, e
            );
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::cache::{CacheType, CodebaseCache, FileTree};
    use rusqlite::Connection;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};

    fn setup_test_cache() -> Result<Arc<CodebaseCache>> {
        let conn = Connection::open_in_memory()?;

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

        cache.set(
            CacheType::Symbols,
            &file_path,
            None,
            &crate::data::cache::SymbolTable {
                file_path: Some(file_path.clone()),
                symbols: vec![],
                imports: vec![],
                exports: vec![],
            },
        )?;

        handle_file_change(cache.clone(), &file_path)?;

        let result: Option<crate::data::cache::SymbolTable> =
            cache.get(CacheType::Symbols, &file_path, None)?;
        assert!(result.is_none());

        Ok(())
    }

    #[test]
    fn test_directory_change_invalidation() -> Result<()> {
        let cache = setup_test_cache()?;
        let dir_path = PathBuf::from("/test/project");

        cache.set(
            CacheType::FileTree,
            &dir_path,
            None,
            &FileTree {
                root: dir_path.clone(),
                entries: vec![],
                total_files: 2,
                total_dirs: 1,
                total_size_bytes: 1024,
            },
        )?;

        handle_directory_change(cache.clone(), &dir_path)?;

        let result: Option<FileTree> = cache.get(CacheType::FileTree, &dir_path, None)?;
        assert!(result.is_none());

        Ok(())
    }
}
