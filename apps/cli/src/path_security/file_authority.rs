use anyhow::{Context, Result};
use cap_fs_ext::{MetadataExt, OpenOptionsFollowExt, OpenOptionsSyncExt};
use cap_primitives::fs::{self as confined, DirOptions, FollowSymlinks, Metadata, OpenOptions};
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

#[derive(Clone, Debug)]
pub(crate) struct DirectoryAuthority {
    path: PathBuf,
    file: Arc<File>,
    #[cfg(test)]
    hooks: Arc<OperationHooks>,
}

#[derive(Clone, Debug)]
pub(crate) struct WorkspaceFileAuthority {
    root: DirectoryAuthority,
    additional: Vec<DirectoryAuthority>,
}

pub(crate) struct ReadFile {
    pub bytes: Vec<u8>,
}

pub(super) const STAGING_PREFIX: &str = ".checkpoint-";

#[cfg(test)]
#[derive(Default)]
struct OperationHooks {
    before_parent_open: std::sync::Mutex<Option<Box<dyn FnOnce() + Send>>>,
    before_leaf_open: std::sync::Mutex<Option<Box<dyn FnOnce() + Send>>>,
    after_staging_open: std::sync::Mutex<Option<Box<dyn FnOnce() + Send>>>,
    after_staging_write: std::sync::Mutex<Option<Box<dyn FnOnce() + Send>>>,
    before_write_open: std::sync::Mutex<Option<Box<dyn FnOnce() + Send>>>,
    after_write_open: std::sync::Mutex<Option<Box<dyn FnOnce() + Send>>>,
    fail_directory_sync: std::sync::atomic::AtomicBool,
}

#[cfg(test)]
impl std::fmt::Debug for OperationHooks {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("OperationHooks")
    }
}

impl DirectoryAuthority {
    pub(crate) fn open(path: &Path) -> Result<Self> {
        Self::open_validated(path, |path| {
            path.canonicalize().map_err(anyhow::Error::from)
        })
    }

    fn open_validated(
        path: &Path,
        validate: impl FnOnce(&Path) -> Result<PathBuf>,
    ) -> Result<Self> {
        let selected = confined::open_ambient_dir(path, cap_primitives::ambient_authority())
            .with_context(|| format!("opening granted directory {}", path.display()))?;
        let selected_metadata = Metadata::from_file(&selected)?;
        let canonical = validate(path)?;
        let resolved = confined::open_ambient_dir(&canonical, cap_primitives::ambient_authority())?;
        let resolved_metadata = Metadata::from_file(&resolved)?;
        anyhow::ensure!(
            selected_metadata.is_dir()
                && resolved_metadata.is_dir()
                && same_identity(&selected_metadata, &resolved_metadata),
            "the selected directory changed while its authority was established"
        );
        Ok(Self {
            path: canonical,
            file: Arc::new(selected),
            #[cfg(test)]
            hooks: Arc::new(OperationHooks::default()),
        })
    }

    fn open_workspace(path: &Path) -> Result<Self> {
        if let Some(refusal) =
            super::network_root_refusal(path, std::env::current_dir().ok().as_deref())
        {
            anyhow::bail!(refusal);
        }
        Self::open_validated(path, |path| {
            super::validate_additional_workspace_root_path(path).map_err(anyhow::Error::msg)
        })
    }

    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    #[cfg(test)]
    pub(crate) fn fail_next_directory_sync(&self) {
        self.hooks
            .fail_directory_sync
            .store(true, std::sync::atomic::Ordering::SeqCst);
    }

    pub(crate) fn sync_directory(&self) -> Result<()> {
        #[cfg(test)]
        if self
            .hooks
            .fail_directory_sync
            .swap(false, std::sync::atomic::Ordering::SeqCst)
        {
            anyhow::bail!("the injected directory flush failed");
        }
        #[cfg(unix)]
        nix::unistd::fsync(self.file.as_ref())?;
        #[cfg(not(unix))]
        self.file.sync_all()?;
        Ok(())
    }

    pub(crate) fn child(&self, name: &Path, create: bool) -> Result<Self> {
        let relative = normal_relative(name)?;
        anyhow::ensure!(
            relative.components().count() == 1,
            "expected one directory name"
        );
        let file = open_child(&self.file, &relative, create)?;
        Ok(Self {
            path: self.path.join(relative),
            file: Arc::new(file),
            #[cfg(test)]
            hooks: Arc::new(OperationHooks::default()),
        })
    }

    fn parent(&self, relative: &Path, create: bool) -> Result<(File, PathBuf)> {
        let relative = normal_relative(relative)?;
        let leaf = relative
            .file_name()
            .ok_or_else(|| anyhow::anyhow!("a file name is required"))?;
        let mut parent = self.file.try_clone()?;
        #[cfg(test)]
        if let Some(action) = self.hooks.before_parent_open.lock().unwrap().take() {
            action();
        }
        if let Some(path) = relative.parent() {
            for component in path.components() {
                let Component::Normal(name) = component else {
                    anyhow::bail!("only confined normal path components are accepted");
                };
                parent = open_child(&parent, Path::new(name), create)?;
            }
        }
        Ok((parent, PathBuf::from(leaf)))
    }

    pub(crate) fn read_file(&self, relative: &Path, limit: u64) -> Result<Option<ReadFile>> {
        let (parent, leaf) = match self.parent(relative, false) {
            Ok(value) => value,
            Err(error) if is_not_found(&error) => return Ok(None),
            Err(error) => return Err(error),
        };
        let metadata = match confined::stat(&parent, &leaf, FollowSymlinks::No) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        validate_regular(&metadata, limit)?;
        let mut options = OpenOptions::new();
        options.read(true).follow(FollowSymlinks::No).nonblock(true);
        #[cfg(test)]
        if let Some(action) = self.hooks.before_leaf_open.lock().unwrap().take() {
            action();
        }
        let file = confined::open(&parent, &leaf, &options)?;
        let opened = Metadata::from_file(&file)?;
        validate_regular(&opened, limit)?;
        anyhow::ensure!(
            same_identity(&metadata, &opened),
            "the file changed while it was opened"
        );
        let mut bytes = Vec::new();
        file.take(limit.saturating_add(1)).read_to_end(&mut bytes)?;
        anyhow::ensure!(
            bytes.len() as u64 <= limit,
            "the file exceeds the allowed copy size"
        );
        Ok(Some(ReadFile { bytes }))
    }

    pub(crate) fn replace_file(
        &self,
        relative: &Path,
        bytes: &[u8],
        private: bool,
        limit: u64,
    ) -> Result<bool> {
        anyhow::ensure!(
            bytes.len() as u64 <= limit,
            "the file exceeds the allowed copy size"
        );
        let (parent, leaf) = self.parent(relative, true)?;
        let existing = match confined::stat(&parent, &leaf, FollowSymlinks::No) {
            Ok(metadata) => Some(metadata),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error.into()),
        };
        let mut authorized_writer = None;
        if let Some(metadata) = &existing {
            validate_regular(metadata, u64::MAX)?;
            if file_matches(&parent, &leaf, metadata, bytes, limit) {
                return Ok(false);
            }
            anyhow::ensure!(
                !metadata.permissions().readonly(),
                "the existing file is read-only"
            );
            let mut options = OpenOptions::new();
            options
                .write(true)
                .follow(FollowSymlinks::No)
                .nonblock(true);
            #[cfg(test)]
            if let Some(action) = self.hooks.before_write_open.lock().unwrap().take() {
                action();
            }
            let file = confined::open(&parent, &leaf, &options)?;
            let opened = Metadata::from_file(&file)?;
            validate_regular(&opened, u64::MAX)?;
            anyhow::ensure!(
                same_identity(metadata, &opened),
                "the write target changed while it was opened"
            );
            #[cfg(test)]
            if let Some(action) = self.hooks.after_write_open.lock().unwrap().take() {
                action();
            }
            validate_named_file(&parent, &leaf, &opened)?;
            authorized_writer = Some(file);
        }
        if !private {
            if let Some(mut file) = authorized_writer {
                let opened = Metadata::from_file(&file)?;
                validate_regular(&opened, u64::MAX)?;
                validate_named_file(&parent, &leaf, &opened)?;
                file.set_len(0)?;
                file.write_all(bytes)?;
                file.sync_all()?;
                validate_regular(&Metadata::from_file(&file)?, u64::MAX)?;
                validate_named_file(&parent, &leaf, &opened)?;
                return Ok(true);
            }
        }
        let temporary = PathBuf::from(format!("{STAGING_PREFIX}{}", uuid::Uuid::new_v4()));
        let directory_options = {
            #[cfg(unix)]
            {
                use confined::DirBuilderExt;
                let mut options = DirOptions::new();
                options.mode(0o700);
                options
            }
            #[cfg(not(unix))]
            DirOptions::new()
        };
        confined::create_dir(&parent, &temporary, &directory_options)?;
        let stage_parent = match confined::open_dir_nofollow(&parent, &temporary) {
            Ok(directory) => directory,
            Err(error) => {
                let _ = confined::remove_dir(&parent, &temporary);
                return Err(error.into());
            }
        };
        let stage_leaf = Path::new("contents");
        let mut options = OpenOptions::new();
        options
            .write(true)
            .create_new(true)
            .follow(FollowSymlinks::No);
        #[cfg(unix)]
        {
            use confined::OpenOptionsExt;
            options.mode(if private { 0o600 } else { 0o666 });
        }
        let mut staged = match confined::open(&stage_parent, stage_leaf, &options) {
            Ok(file) => file,
            Err(error) => {
                let _ = confined::remove_dir(&parent, &temporary);
                return Err(error.into());
            }
        };
        #[cfg(test)]
        if let Some(action) = self.hooks.after_staging_open.lock().unwrap().take() {
            action();
        }
        let result: Result<bool> = (|| {
            let staged_metadata = Metadata::from_file(&staged)?;
            validate_regular(&staged_metadata, limit)?;
            validate_named_file(&stage_parent, stage_leaf, &staged_metadata)?;
            staged.write_all(bytes)?;
            staged.sync_all()?;
            #[cfg(test)]
            if let Some(action) = self.hooks.after_staging_write.lock().unwrap().take() {
                action();
            }
            let staged_metadata = Metadata::from_file(&staged)?;
            validate_regular(&staged_metadata, limit)?;
            validate_named_file(&stage_parent, stage_leaf, &staged_metadata)?;
            match &existing {
                Some(metadata) => validate_named_file(&parent, &leaf, metadata)?,
                None => match confined::stat(&parent, &leaf, FollowSymlinks::No) {
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    _ => anyhow::bail!("a new file appeared before publication"),
                },
            }
            confined::rename(&stage_parent, stage_leaf, &parent, &leaf)?;
            Ok(true)
        })();
        let _ = confined::remove_file(&stage_parent, stage_leaf);
        let _ = confined::remove_dir(&parent, &temporary);
        result
    }

    pub(crate) fn remove_file(&self, relative: &Path) -> Result<bool> {
        let (parent, leaf) = match self.parent(relative, false) {
            Ok(value) => value,
            Err(error) if is_not_found(&error) => return Ok(false),
            Err(error) => return Err(error),
        };
        let metadata = match confined::stat(&parent, &leaf, FollowSymlinks::No) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(error.into()),
        };
        validate_regular(&metadata, u64::MAX)?;
        confined::remove_file(&parent, &leaf)?;
        Ok(true)
    }

    pub(crate) fn remove_matching_regular_files(
        &self,
        matches: impl Fn(&Path) -> bool,
    ) -> Result<()> {
        for entry in confined::read_base_dir(&self.file)? {
            let entry = entry?;
            let name = PathBuf::from(entry.file_name());
            if entry.file_type()?.is_file() && matches(&name) {
                self.remove_file(&name)?;
            }
        }
        Ok(())
    }
}

impl WorkspaceFileAuthority {
    pub(crate) fn new(root: &Path) -> Result<Self> {
        Ok(Self {
            root: DirectoryAuthority::open_workspace(root)?,
            additional: Vec::new(),
        })
    }

    pub(crate) fn root(&self) -> &Path {
        self.root.path()
    }

    pub(crate) fn additional(&self) -> Vec<PathBuf> {
        self.additional
            .iter()
            .map(|root| root.path.clone())
            .collect()
    }

    pub(crate) fn add(&mut self, path: &Path) -> Result<PathBuf> {
        let root = DirectoryAuthority::open_workspace(path)?;
        if let Some(current) = self
            .additional
            .iter()
            .find(|current| current.path == root.path)
        {
            anyhow::ensure!(
                same_identity(
                    &Metadata::from_file(&current.file)?,
                    &Metadata::from_file(&root.file)?
                ),
                "the existing additional directory grant has been replaced"
            );
        } else {
            self.additional.push(root.clone());
        }
        Ok(root.path)
    }

    pub(crate) fn remove(&mut self, path: &Path) -> Result<PathBuf> {
        let absolute = if path.is_absolute() {
            path.to_path_buf()
        } else {
            self.root.path.join(path)
        };
        let lexical = super::lexically_normalized(&absolute);
        let resolved = absolute.canonicalize().ok();
        let index = self
            .additional
            .iter()
            .position(|root| {
                root.path == lexical || resolved.as_ref().is_some_and(|path| root.path == *path)
            })
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "{} was not added with /add-dir or --add-dir",
                    absolute.display()
                )
            })?;
        Ok(self.additional.remove(index).path)
    }

    pub(crate) fn clear_additional(&mut self) {
        self.additional.clear();
    }

    pub(crate) fn resolve(&self, path: &Path) -> Result<(&DirectoryAuthority, PathBuf)> {
        let text = path
            .to_str()
            .ok_or_else(|| anyhow::anyhow!("checkpoint path is not valid UTF-8"))?;
        super::scope_workspace_paths_sync(self.root.path.clone(), self.additional(), || {
            super::validate_workspace_write_path_with_cwd(text, &self.root.path)
        })
        .map_err(anyhow::Error::msg)?;
        let absolute = if path.is_absolute() {
            path.to_path_buf()
        } else {
            self.root.path.join(path)
        };
        let lexical = super::lexically_normalized(&absolute);
        self.additional
            .iter()
            .chain(std::iter::once(&self.root))
            .filter_map(|root| {
                lexical
                    .strip_prefix(&root.path)
                    .ok()
                    .map(|relative| (root, relative))
            })
            .max_by_key(|(root, _)| root.path.components().count())
            .map(|(root, relative)| Ok((root, normal_relative(relative)?)))
            .unwrap_or_else(|| {
                Err(anyhow::anyhow!(
                    "the checkpoint path has no current session directory grant"
                ))
            })
    }
}

fn normal_relative(path: &Path) -> Result<PathBuf> {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(name) => result.push(name),
            Component::CurDir => {}
            Component::ParentDir => {
                anyhow::ensure!(result.pop(), "the path escapes its directory grant");
            }
            Component::RootDir | Component::Prefix(_) => {
                anyhow::bail!("an absolute path cannot be relative to a directory grant")
            }
        }
    }
    anyhow::ensure!(
        !result.as_os_str().is_empty(),
        "a file or directory name is required"
    );
    Ok(result)
}

fn open_child(parent: &File, name: &Path, create: bool) -> Result<File> {
    match confined::open_dir_nofollow(parent, name) {
        Ok(file) => Ok(file),
        Err(error) if create && error.kind() == std::io::ErrorKind::NotFound => {
            match confined::create_dir(parent, name, &DirOptions::new()) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error.into()),
            }
            confined::open_dir_nofollow(parent, name).map_err(anyhow::Error::from)
        }
        Err(error) => Err(error.into()),
    }
}

fn same_identity(first: &Metadata, second: &Metadata) -> bool {
    first.dev() == second.dev() && first.ino() == second.ino()
}

fn validate_named_file(parent: &File, leaf: &Path, opened: &Metadata) -> Result<()> {
    let named = confined::stat(parent, leaf, FollowSymlinks::No)?;
    validate_regular(&named, u64::MAX)?;
    anyhow::ensure!(
        same_identity(opened, &named),
        "the held file no longer owns its name"
    );
    Ok(())
}

fn file_matches(parent: &File, leaf: &Path, expected: &Metadata, bytes: &[u8], limit: u64) -> bool {
    let read = (|| -> Result<Vec<u8>> {
        let mut options = OpenOptions::new();
        options.read(true).follow(FollowSymlinks::No).nonblock(true);
        let file = confined::open(parent, leaf, &options)?;
        let opened = Metadata::from_file(&file)?;
        validate_regular(&opened, limit)?;
        anyhow::ensure!(
            same_identity(expected, &opened),
            "the comparison file changed"
        );
        let mut current = Vec::new();
        file.take(limit.saturating_add(1))
            .read_to_end(&mut current)?;
        anyhow::ensure!(
            current.len() as u64 <= limit,
            "the comparison exceeds its bound"
        );
        Ok(current)
    })();
    read.is_ok_and(|current| current == bytes)
}

fn validate_regular(metadata: &Metadata, limit: u64) -> Result<()> {
    anyhow::ensure!(
        metadata.is_file(),
        "the path is not a regular unlinked file"
    );
    anyhow::ensure!(
        metadata.nlink() == 1,
        "the file is hard-linked to another file"
    );
    anyhow::ensure!(
        metadata.len() <= limit,
        "the file exceeds the allowed copy size"
    );
    Ok(())
}

fn is_not_found(error: &anyhow::Error) -> bool {
    error
        .downcast_ref::<std::io::Error>()
        .is_some_and(|error| error.kind() == std::io::ErrorKind::NotFound)
}

#[cfg(test)]
mod boundary_tests;
