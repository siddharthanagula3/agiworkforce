use super::*;
#[cfg(unix)]
mod reviewed;
#[cfg(unix)]
pub(crate) use reviewed::{ReviewedFile, ReviewedFileError};

pub(crate) struct DownloadDestination {
    directory: DirectoryAuthority,
    leaf: PathBuf,
    parent: File,
    original: Option<OriginalFile>,
    limit: u64,
    reviewed: bool,
}
struct OriginalFile {
    file: File,
    metadata: Metadata,
    revision: String,
}
pub(crate) struct DownloadSaveError {
    pub error: anyhow::Error,
    pub uncertain: bool,
}
impl DirectoryAuthority {
    pub(crate) fn new_file_destination(
        &self,
        relative: &Path,
        limit: u64,
    ) -> Result<DownloadDestination> {
        let relative = normal_relative(relative)?;
        let (parent, leaf) = self.parent(&relative, false)?;
        let directory = DirectoryAuthority {
            path: self
                .path
                .join(relative.parent().context("Choose a named destination")?),
            file: Arc::new(parent),
            #[cfg(test)]
            hooks: self.hooks.clone(),
        };
        let destination =
            directory.download_destination(&leaf, limit, chrono::Utc::now().timestamp_millis())?;
        anyhow::ensure!(
            !destination.replaces(),
            "A file already exists at the selected path. Choose an unused file name."
        );
        Ok(destination)
    }
    pub(crate) fn selected_file(path: &Path) -> Result<(Self, PathBuf)> {
        anyhow::ensure!(
            path.is_absolute()
                && path.components().all(|part| matches!(
                    part,
                    Component::RootDir | Component::Prefix(_) | Component::Normal(_)
                )),
            "Choose an unambiguous absolute file path"
        );
        anyhow::ensure!(
            !super::super::is_protected_path(path)
                && !super::super::reads_a_credential_file(&path.to_string_lossy()),
            "Choose a file outside protected settings and credential locations"
        );
        let directory = Self::open(path.parent().context("Choose a named file")?)?;
        let leaf = PathBuf::from(path.file_name().context("Choose a named file")?);
        let resolved = directory.path().join(&leaf);
        anyhow::ensure!(
            !super::super::is_protected_path(&resolved)
                && !super::super::reads_a_credential_file(&resolved.to_string_lossy()),
            "The selected file resolves to a protected or credential location"
        );
        Ok((directory, leaf))
    }
    pub(crate) fn download_destination(
        self,
        relative: &Path,
        limit: u64,
        selected_at_ms: i64,
    ) -> Result<DownloadDestination> {
        anyhow::ensure!(selected_at_ms >= 0, "The file selection time is invalid");
        self.checked_destination(relative, limit, Some(selected_at_ms))
    }

    fn checked_destination(
        self,
        relative: &Path,
        limit: u64,
        selected_at_ms: Option<i64>,
    ) -> Result<DownloadDestination> {
        anyhow::ensure!(
            normal_relative(relative)?.components().count() == 1,
            "Choose one named destination file"
        );
        let (parent, leaf) = self.parent(relative, false)?;
        let existing = match confined::stat(&parent, &leaf, FollowSymlinks::No) {
            Ok(metadata) => Some(metadata),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error.into()),
        };
        let original = if let Some(metadata) = existing {
            validate_regular(&metadata, limit)?;
            anyhow::ensure!(
                !metadata.permissions().readonly(),
                "The selected destination is read-only"
            );
            let mut options = OpenOptions::new();
            options
                .read(true)
                .write(true)
                .follow(FollowSymlinks::No)
                .nonblock(true);
            let mut file = confined::open(&parent, &leaf, &options)?;
            let opened = Metadata::from_file(&file)?;
            validate_regular(&opened, limit)?;
            anyhow::ensure!(
                same_identity(&metadata, &opened),
                "The destination changed while its file grant was opened"
            );
            let old = opened
                .modified()?
                .into_std()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(true, |modified| {
                    selected_at_ms.is_none_or(|selected| modified.as_millis() <= selected as u128)
                });
            anyhow::ensure!(
                old,
                "The destination changed after the save picker closed. Select it again."
            );
            let revision = file_revision(&mut file, limit)?;
            validate_named_file(&parent, &leaf, &opened)?;
            Some(OriginalFile {
                file,
                metadata: opened,
                revision,
            })
        } else {
            None
        };
        let destination = DownloadDestination {
            directory: self,
            leaf,
            parent,
            original,
            limit,
            reviewed: false,
        };
        destination.validate_location()?;
        Ok(destination)
    }
}
fn file_revision(file: &mut File, limit: u64) -> Result<String> {
    file.seek(SeekFrom::Start(0))?;
    let mut hash = Sha256::new();
    let mut count = 0u64;
    let mut chunk = [0u8; 65536];
    loop {
        let read = file.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        count = count.saturating_add(read as u64);
        anyhow::ensure!(
            count <= limit,
            "The existing destination exceeds the local review size limit"
        );
        hash.update(&chunk[..read]);
    }
    Ok(crate::hex::encode(&hash.finalize()))
}
impl DownloadDestination {
    pub(crate) fn path(&self) -> PathBuf {
        self.directory.path().join(&self.leaf)
    }
    pub(crate) fn replaces(&self) -> bool {
        self.original.is_some()
    }
    fn validate_location(&self) -> Result<()> {
        let canonical = self.directory.path().canonicalize()?;
        anyhow::ensure!(
            canonical == self.directory.path(),
            "The selected save directory moved or became an alias"
        );
        let named = confined::open_ambient_dir(&canonical, cap_primitives::ambient_authority())?;
        anyhow::ensure!(
            same_identity(
                &Metadata::from_file(&named)?,
                &Metadata::from_file(&self.parent)?
            ),
            "The selected save directory changed identity"
        );
        Ok(())
    }
    fn validate_original(&mut self) -> Result<()> {
        self.validate_location()?;
        if let Some(original) = &mut self.original {
            if self.reviewed {
                let mut options = OpenOptions::new();
                options
                    .read(true)
                    .write(true)
                    .follow(FollowSymlinks::No)
                    .nonblock(true);
                let fresh = confined::open(&self.parent, &self.leaf, &options)?;
                let opened = Metadata::from_file(&fresh)?;
                validate_regular(&opened, self.limit)?;
                anyhow::ensure!(
                    same_identity(&original.metadata, &opened),
                    "The reviewed file changed identity before publication"
                );
                validate_named_file(&self.parent, &self.leaf, &opened)?;
                original.file = fresh;
            }
            let current = Metadata::from_file(&original.file)?;
            validate_regular(&current, self.limit)?;
            validate_named_file(&self.parent, &self.leaf, &original.metadata)?;
            anyhow::ensure!(
                !current.permissions().readonly()
                    && (!self.reviewed || current.permissions() == original.metadata.permissions())
                    && current.modified()? == original.metadata.modified()?
                    && file_revision(&mut original.file, self.limit)? == original.revision,
                "The destination changed after review. Choose it again before replacing it."
            );
        } else {
            match confined::stat(&self.parent, &self.leaf, FollowSymlinks::No) {
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                _ => anyhow::bail!(
                    "A file appeared at the selected save path. Select a destination again."
                ),
            }
        }
        Ok(())
    }
    pub(crate) fn save(mut self, bytes: &[u8]) -> std::result::Result<(), DownloadSaveError> {
        let mut attempted = false;
        let mut recovery_paths = Vec::new();
        let result = self.save_inner(bytes, &mut attempted, None, &mut recovery_paths);
        result.map_err(|error| DownloadSaveError {
            error,
            uncertain: attempted,
        })
    }
    fn save_inner(
        &mut self,
        bytes: &[u8],
        attempted: &mut bool,
        executable: Option<bool>,
        recovery_paths: &mut Vec<PathBuf>,
    ) -> Result<()> {
        anyhow::ensure!(
            bytes.len() as u64 <= self.limit,
            "The downloaded file exceeds the local save limit"
        );
        self.validate_original()?;
        let name = PathBuf::from(format!("{STAGING_PREFIX}{}", uuid::Uuid::new_v4()));
        #[cfg(unix)]
        let directory_options = {
            use confined::DirBuilderExt;
            let mut options = DirOptions::new();
            options.mode(0o700);
            options
        };
        #[cfg(not(unix))]
        let directory_options = DirOptions::new();
        confined::create_dir(&self.parent, &name, &directory_options)?;
        let stage = match confined::open_dir_nofollow(&self.parent, &name) {
            Ok(stage) => stage,
            Err(error) => {
                let _ = confined::remove_dir(&self.parent, &name);
                return Err(error.into());
            }
        };
        let leaf = Path::new("contents");
        let result: Result<()> = (|| {
            let mut options = OpenOptions::new();
            options
                .read(true)
                .write(true)
                .create_new(true)
                .follow(FollowSymlinks::No);
            #[cfg(unix)]
            {
                use confined::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = confined::open(&stage, leaf, &options)?;
            file.write_all(bytes)?;
            apply_executable(&file, executable)?;
            file.sync_all()?;
            let staged = Metadata::from_file(&file)?;
            validate_regular(&staged, self.limit)?;
            validate_named_file(&stage, leaf, &staged)?;
            #[cfg(test)]
            if let Some(action) = self
                .directory
                .hooks
                .after_staging_write
                .lock()
                .unwrap()
                .take()
            {
                action();
            }
            self.validate_original()?;
            validate_regular(&Metadata::from_file(&file)?, self.limit)?;
            validate_named_file(&stage, leaf, &staged)?;
            anyhow::ensure!(
                file_revision(&mut file, self.limit)? == revision_of(bytes),
                "The staged download changed before publication"
            );
            if let Some(original) = &mut self.original {
                let mut backup = tempfile::Builder::new()
                    .prefix("agi-download-original-")
                    .tempfile()?;
                original.file.seek(SeekFrom::Start(0))?;
                let copied = std::io::copy(
                    &mut Read::by_ref(&mut original.file).take(self.limit.saturating_add(1)),
                    backup.as_file_mut(),
                )?;
                anyhow::ensure!(
                    copied <= self.limit
                        && file_revision(backup.as_file_mut(), self.limit)? == original.revision,
                    "The destination changed while its recovery copy was prepared"
                );
                backup.as_file().sync_all()?;
                self.validate_original()?;
                let (backup, recovery) = backup
                    .keep()
                    .context("The original file's recovery copy could not be retained")?;
                recovery_paths.push(recovery.clone());
                let result: Result<()> = (|| {
                    let original = self
                        .original
                        .as_mut()
                        .context("The original file grant was lost")?;
                    validate_named_file(&self.parent, &self.leaf, &original.metadata)?;
                    *attempted = true;
                    original.file.seek(SeekFrom::Start(0))?;
                    original.file.set_len(0)?;
                    original.file.write_all(bytes)?;
                    apply_executable(&original.file, executable)?;
                    original.file.sync_all()?;
                    validate_named_file(&self.parent, &self.leaf, &original.metadata)?;
                    anyhow::ensure!(
                        file_revision(&mut original.file, self.limit)? == revision_of(bytes),
                        "The destination changed during publication"
                    );
                    self.directory.sync_directory()?;
                    self.validate_location()?;
                    Ok(())
                })();
                drop(backup);
                if result.is_ok() && self.reviewed {
                    return result;
                }
                if result.is_ok() || !*attempted {
                    std::fs::remove_file(&recovery).with_context(|| {
                        format!(
                            "The temporary original copy could not be removed at {}",
                            recovery.display()
                        )
                    })?;
                    recovery_paths.retain(|path| path != &recovery);
                    return result;
                }
                return result.with_context(|| {
                    format!("An original copy is retained at {}", recovery.display())
                });
            }
            *attempted = true;
            match confined::hard_link(&stage, leaf, &self.parent, &self.leaf) {
                Ok(()) => {}
                Err(error) => {
                    if error.kind() == std::io::ErrorKind::AlreadyExists {
                        *attempted = false;
                    }
                    return Err(error.into());
                }
            }
            confined::remove_file(&stage, leaf)?;
            validate_named_file(&self.parent, &self.leaf, &staged)?;
            self.directory.sync_directory()?;
            self.validate_location()?;
            Ok(())
        })();
        let _ = confined::remove_file(&stage, leaf);
        drop(stage);
        let _ = confined::remove_dir(&self.parent, &name);
        result
    }
}

fn apply_executable(file: &File, executable: Option<bool>) -> Result<()> {
    #[cfg(unix)]
    if let Some(executable) = executable {
        use std::os::unix::fs::PermissionsExt;
        let current = file.metadata()?.permissions();
        let mode = current.mode();
        let mode = if executable {
            mode | 0o100
        } else {
            mode & !0o100
        };
        if mode != current.mode() {
            file.set_permissions(std::fs::Permissions::from_mode(mode))?;
        }
    }
    #[cfg(not(unix))]
    let _ = (file, executable);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn destination(root: &Path, name: &str) -> DownloadDestination {
        let (directory, leaf) = DirectoryAuthority::selected_file(&root.join(name)).unwrap();
        directory
            .download_destination(&leaf, 1024, chrono::Utc::now().timestamp_millis())
            .unwrap()
    }
    #[test]
    fn a_new_workspace_destination_never_replaces_a_file_created_during_staging() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("nested")).unwrap();
        let directory = DirectoryAuthority::open(root.path()).unwrap();
        let selected = directory
            .new_file_destination(Path::new("nested/recovered.txt"), 1024)
            .unwrap();
        let path = root.path().join("nested/recovered.txt");
        let appeared = path.clone();
        *directory.hooks.after_staging_write.lock().unwrap() = Some(Box::new(move || {
            std::fs::write(appeared, "another writer").unwrap();
        }));
        assert!(selected.save(b"must not replace").is_err());
        assert_eq!(std::fs::read_to_string(path).unwrap(), "another writer");
    }
    #[test]
    fn project_download_new_files_and_reviewed_replacements_publish_verified_bytes() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("saved.txt");
        assert!(!destination(root.path(), "saved.txt").replaces());
        assert!(destination(root.path(), "saved.txt")
            .save(b"original\r\n")
            .is_ok());
        assert_eq!(std::fs::read(&path).unwrap(), b"original\r\n");
        let approved = destination(root.path(), "saved.txt");
        assert!(approved.replaces());
        assert!(approved.save("new 東京 🦀".as_bytes()).is_ok());
        assert_eq!(std::fs::read_to_string(path).unwrap(), "new 東京 🦀");
    }
    #[test]
    fn project_download_refuses_destinations_created_or_edited_after_review() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("saved.txt");
        let new_file = destination(root.path(), "saved.txt");
        std::fs::write(&path, "appeared").unwrap();
        let failed = new_file.save(b"must not overwrite").err().unwrap();
        assert!(!failed.uncertain);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "appeared");
        let selected = destination(root.path(), "saved.txt");
        std::fs::write(&path, "later edit").unwrap();
        let failed = selected.save(b"must not overwrite").err().unwrap();
        assert!(!failed.uncertain);
        assert_eq!(std::fs::read_to_string(path).unwrap(), "later edit");
    }
    #[test]
    fn project_download_conflict_after_staging_leaves_the_original_target_intact() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("saved.txt");
        std::fs::write(&path, "original").unwrap();
        let (directory, leaf) = DirectoryAuthority::selected_file(&path).unwrap();
        let selected = directory
            .clone()
            .download_destination(&leaf, 1024, chrono::Utc::now().timestamp_millis())
            .unwrap();
        let edited = path.clone();
        *directory.hooks.after_staging_write.lock().unwrap() = Some(Box::new(move || {
            std::fs::write(edited, "edited during staging").unwrap()
        }));
        let failed = selected.save(b"new content").err().unwrap();
        assert!(!failed.uncertain);
        assert_eq!(
            std::fs::read_to_string(path).unwrap(),
            "edited during staging"
        );
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
    }
    #[cfg(unix)]
    #[test]
    fn project_download_refuses_staging_swaps_links_special_files_and_protected_destinations() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("saved.txt");
        std::fs::write(&path, "original").unwrap();
        let secret = root.path().join("outside.txt");
        std::fs::write(&secret, "outside").unwrap();
        let (directory, leaf) = DirectoryAuthority::selected_file(&path).unwrap();
        let selected = directory
            .clone()
            .download_destination(&leaf, 1024, chrono::Utc::now().timestamp_millis())
            .unwrap();
        let folder = root.path().to_path_buf();
        let outside = secret.clone();
        *directory.hooks.after_staging_write.lock().unwrap() = Some(Box::new(move || {
            let stage = std::fs::read_dir(folder)
                .unwrap()
                .map(|entry| entry.unwrap().path())
                .find(|path| {
                    path.file_name()
                        .unwrap()
                        .to_string_lossy()
                        .starts_with(STAGING_PREFIX)
                })
                .unwrap();
            std::fs::remove_file(stage.join("contents")).unwrap();
            std::os::unix::fs::symlink(outside, stage.join("contents")).unwrap();
        }));
        let failed = selected.save(b"new").err().unwrap();
        assert!(!failed.uncertain);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "original");
        assert_eq!(std::fs::read_to_string(&secret).unwrap(), "outside");
        std::os::unix::fs::symlink(&secret, root.path().join("link.txt")).unwrap();
        std::fs::hard_link(&secret, root.path().join("hard.txt")).unwrap();
        nix::unistd::mkfifo(&root.path().join("pipe.txt"), nix::sys::stat::Mode::S_IRUSR).unwrap();
        for name in ["link.txt", "hard.txt", "pipe.txt"] {
            let (directory, leaf) =
                DirectoryAuthority::selected_file(&root.path().join(name)).unwrap();
            assert!(directory
                .download_destination(&leaf, 1024, chrono::Utc::now().timestamp_millis())
                .is_err());
        }
        assert!(DirectoryAuthority::selected_file(&root.path().join(".env")).is_err());
    }
    #[test]
    fn project_download_directory_flush_failure_reports_uncertain_publication() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("saved.txt");
        let (directory, leaf) = DirectoryAuthority::selected_file(&path).unwrap();
        let selected = directory
            .clone()
            .download_destination(&leaf, 1024, chrono::Utc::now().timestamp_millis())
            .unwrap();
        directory.fail_next_directory_sync();
        let failed = selected.save(b"saved despite flush failure").err().unwrap();
        assert!(failed.uncertain);
        assert_eq!(std::fs::read(path).unwrap(), b"saved despite flush failure");
    }
    #[test]
    fn project_download_refuses_a_save_directory_that_moved_after_review() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("chosen");
        std::fs::create_dir(&folder).unwrap();
        let selected = destination(&folder, "saved.txt");
        if let Err(error) = std::fs::rename(&folder, root.path().join("moved")) {
            const ERROR_SHARING_VIOLATION: i32 = 32;
            assert!(
                cfg!(windows) && error.raw_os_error() == Some(ERROR_SHARING_VIOLATION),
                "move chosen folder: {error}"
            );
            assert!(folder.is_dir());
            assert!(!root.path().join("moved").exists());
            drop(selected);
            return;
        }
        std::fs::create_dir(&folder).unwrap();
        let failed = selected.save(b"not published").err().unwrap();
        assert!(!failed.uncertain);
        assert!(!folder.join("saved.txt").exists());
        assert!(!root.path().join("moved/saved.txt").exists());
    }
}

#[cfg(all(test, unix))]
#[test]
fn project_download_replacement_preserves_inode_and_later_tightened_permissions() {
    use std::os::unix::fs::PermissionsExt;
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("saved.txt");
    std::fs::write(&path, "original").unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
    let before = std::os::unix::fs::MetadataExt::ino(&std::fs::metadata(&path).unwrap());
    let (directory, leaf) = DirectoryAuthority::selected_file(&path).unwrap();
    let destination = directory
        .clone()
        .download_destination(&leaf, 1024, chrono::Utc::now().timestamp_millis())
        .unwrap();
    let changed = path.clone();
    *directory.hooks.after_staging_write.lock().unwrap() = Some(Box::new(move || {
        std::fs::set_permissions(changed, std::fs::Permissions::from_mode(0o600)).unwrap()
    }));
    assert!(destination.save(b"downloaded").is_ok());
    let after = std::fs::metadata(&path).unwrap();
    assert_eq!(std::os::unix::fs::MetadataExt::ino(&after), before);
    assert_eq!(after.permissions().mode() & 0o777, 0o600);
    assert_eq!(std::fs::read_to_string(path).unwrap(), "downloaded");
}

#[cfg(test)]
#[test]
fn project_download_keeps_an_original_copy_when_replacement_confirmation_fails() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("saved.txt");
    std::fs::write(&path, "original bytes").unwrap();
    let (directory, leaf) = DirectoryAuthority::selected_file(&path).unwrap();
    let destination = directory
        .clone()
        .download_destination(&leaf, 1024, chrono::Utc::now().timestamp_millis())
        .unwrap();
    directory.fail_next_directory_sync();
    let failed = destination.save(b"downloaded bytes").err().unwrap();
    assert!(failed.uncertain);
    let message = failed.error.to_string();
    let copy = message
        .strip_prefix("An original copy is retained at ")
        .unwrap();
    assert_eq!(std::fs::read(copy).unwrap(), b"original bytes");
    assert_eq!(std::fs::read(path).unwrap(), b"downloaded bytes");
    std::fs::remove_file(copy).unwrap();
}
