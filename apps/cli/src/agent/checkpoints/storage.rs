use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::path_security::DirectoryAuthority;

use super::{BLOB_DIR, MAX_SNAPSHOT_BYTES};

#[derive(Debug)]
pub(super) struct CheckpointStorage {
    parent: DirectoryAuthority,
    name: PathBuf,
    directory: Mutex<Option<DirectoryAuthority>>,
    blobs: Mutex<Option<DirectoryAuthority>>,
}

impl CheckpointStorage {
    pub(super) fn open(session_path: &Path) -> Result<Self> {
        anyhow::ensure!(
            session_path.is_absolute(),
            "the checkpoint backing path must be absolute"
        );
        let checkpoint_path = crate::runtime::session_control::checkpoint_dir(session_path);
        let parent = checkpoint_path
            .parent()
            .context("the checkpoint backing path has no parent")?;
        let name = checkpoint_path
            .file_name()
            .context("the checkpoint directory has no name")?;
        Ok(Self {
            parent: DirectoryAuthority::open(parent)?,
            name: PathBuf::from(name),
            directory: Mutex::new(None),
            blobs: Mutex::new(None),
        })
    }

    pub(super) fn directory(&self, create: bool) -> Result<Option<DirectoryAuthority>> {
        let mut held = self
            .directory
            .lock()
            .map_err(|_| anyhow::anyhow!("the checkpoint directory owner is unavailable"))?;
        if let Some(directory) = held.as_ref() {
            return Ok(Some(directory.clone()));
        }
        match self.parent.child(&self.name, create) {
            Ok(directory) => {
                *held = Some(directory.clone());
                Ok(Some(directory))
            }
            Err(error) if !create && is_not_found(&error) => Ok(None),
            Err(error) => Err(error),
        }
    }

    fn blobs(&self, create: bool) -> Result<Option<DirectoryAuthority>> {
        let mut held = self
            .blobs
            .lock()
            .map_err(|_| anyhow::anyhow!("the checkpoint blob owner is unavailable"))?;
        if let Some(directory) = held.as_ref() {
            return Ok(Some(directory.clone()));
        }
        let Some(directory) = self.directory(create)? else {
            return Ok(None);
        };
        match directory.child(Path::new(BLOB_DIR), create) {
            Ok(blobs) => {
                *held = Some(blobs.clone());
                Ok(Some(blobs))
            }
            Err(error) if !create && is_not_found(&error) => Ok(None),
            Err(error) => Err(error),
        }
    }

    pub(super) fn read_blob(&self, digest: &str) -> Result<Vec<u8>> {
        super::validate_digest(digest)?;
        let blobs = self
            .blobs(false)?
            .context("no saved blob directory is held")?;
        let file = blobs
            .read_file(Path::new(digest), MAX_SNAPSHOT_BYTES)?
            .context("no saved copy is held")?;
        super::validate_blob(digest, &file.bytes)?;
        Ok(file.bytes)
    }

    pub(super) fn store_blob(&self, digest: &str, bytes: &[u8]) -> Result<()> {
        super::validate_blob(digest, bytes)?;
        let blobs = self
            .blobs(true)?
            .context("no saved blob directory is held")?;
        if let Some(existing) = blobs.read_file(Path::new(digest), MAX_SNAPSHOT_BYTES)? {
            super::validate_blob(digest, &existing.bytes)?;
            return Ok(());
        }
        blobs.replace_file(Path::new(digest), bytes, true, MAX_SNAPSHOT_BYTES)?;
        Ok(())
    }

    pub(super) fn collect_garbage(
        &self,
        referenced: &std::collections::HashSet<String>,
    ) -> Result<()> {
        let Some(blobs) = self.blobs(false)? else {
            return Ok(());
        };
        blobs.sync_directory()?;
        self.directory(false)?
            .context("no checkpoint index directory is held")?
            .sync_directory()?;
        self.parent.sync_directory()?;
        blobs.remove_matching_regular_files(|name| {
            name.to_str().is_some_and(|digest| {
                super::validate_digest(digest).is_ok() && !referenced.contains(digest)
            })
        })
    }
}

fn is_not_found(error: &anyhow::Error) -> bool {
    error
        .downcast_ref::<std::io::Error>()
        .is_some_and(|error| error.kind() == std::io::ErrorKind::NotFound)
}
