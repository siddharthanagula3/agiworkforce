use super::*;
use std::os::unix::fs::PermissionsExt;

pub(crate) struct ReviewedFile {
    directory: DirectoryAuthority,
    relative: PathBuf,
    destination: Option<DownloadDestination>,
    bytes: Option<Vec<u8>>,
    executable: Option<bool>,
    limit: u64,
}

pub(crate) struct ReviewedFileError {
    pub error: anyhow::Error,
    pub uncertain: bool,
    pub recovery_paths: Vec<PathBuf>,
}

impl DirectoryAuthority {
    pub(crate) fn review_file(&self, relative: &Path, limit: u64) -> Result<ReviewedFile> {
        self.identity()?;
        let relative = normal_relative(relative)?;
        let destination = match self.parent(&relative, false) {
            Ok((parent, leaf)) => {
                let directory = DirectoryAuthority {
                    path: self
                        .path
                        .join(relative.parent().context("Choose a named file")?),
                    file: Arc::new(parent),
                    #[cfg(test)]
                    hooks: self.hooks.clone(),
                };
                let mut destination = directory.checked_destination(&leaf, limit, None)?;
                destination.reviewed = true;
                Some(destination)
            }
            Err(error) if is_not_found(&error) => None,
            Err(error) => return Err(error),
        };
        let mut reviewed = ReviewedFile {
            directory: self.clone(),
            relative,
            destination,
            bytes: None,
            executable: None,
            limit,
        };
        if let Some(original) = reviewed
            .destination
            .as_mut()
            .and_then(|destination| destination.original.as_mut())
        {
            original.file.seek(SeekFrom::Start(0))?;
            let mut bytes = Vec::new();
            Read::by_ref(&mut original.file)
                .take(limit.saturating_add(1))
                .read_to_end(&mut bytes)?;
            anyhow::ensure!(
                bytes.len() as u64 <= limit && revision_of(&bytes) == original.revision,
                "The file changed while its review was captured"
            );
            reviewed.executable = Some(original.file.metadata()?.permissions().mode() & 0o100 != 0);
            reviewed.bytes = Some(bytes);
        }
        reviewed.validate()?;
        Ok(reviewed)
    }
}

impl ReviewedFile {
    pub(crate) fn bytes(&self) -> Option<&[u8]> {
        self.bytes.as_deref()
    }
    pub(crate) fn executable(&self) -> Option<bool> {
        self.executable
    }
    pub(crate) fn validate(&mut self) -> Result<()> {
        self.directory.identity()?;
        if let Some(destination) = &mut self.destination {
            destination.validate_original()?;
        } else {
            match self.directory.parent(&self.relative, false) {
                Err(error) if is_not_found(&error) => {}
                Err(error) => return Err(error),
                Ok((parent, leaf)) => match confined::stat(&parent, &leaf, FollowSymlinks::No) {
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    _ => anyhow::bail!("A file appeared at the reviewed path"),
                },
            }
        }
        self.directory.identity()?;
        Ok(())
    }

    pub(crate) fn commit(
        mut self,
        after: Option<&[u8]>,
        executable: Option<bool>,
    ) -> std::result::Result<(), ReviewedFileError> {
        if let Err(error) = self.validate() {
            return Err(ReviewedFileError {
                error,
                uncertain: false,
                recovery_paths: Vec::new(),
            });
        }
        let Some(bytes) = after else {
            return self.remove();
        };
        let mut attempted = false;
        let mut recovery_paths = Vec::new();
        let result = (|| -> Result<()> {
            if self.destination.is_none() {
                let parent = self.relative.parent().context("Choose a named file")?;
                let mut directory = self.directory.clone();
                for component in parent.components() {
                    let Component::Normal(name) = component else {
                        anyhow::bail!("Use normal reviewed parent folders");
                    };
                    directory = directory.child(Path::new(name), true)?;
                }
                let leaf = self.relative.file_name().context("Choose a named file")?;
                let mut destination =
                    directory.checked_destination(Path::new(leaf), self.limit, None)?;
                anyhow::ensure!(
                    !destination.replaces(),
                    "A file appeared at the reviewed path"
                );
                destination.reviewed = true;
                self.destination = Some(destination);
            }
            self.directory.identity()?;
            self.destination
                .as_mut()
                .context("The reviewed file target was lost")?
                .save_inner(bytes, &mut attempted, executable, &mut recovery_paths)?;
            self.directory.identity()?;
            while let Some(path) = recovery_paths.last().cloned() {
                std::fs::remove_file(&path).with_context(|| {
                    format!(
                        "The original recovery copy could not be removed at {}",
                        path.display()
                    )
                })?;
                recovery_paths.pop();
            }
            Ok(())
        })();
        result.map_err(|error| ReviewedFileError {
            error,
            uncertain: attempted,
            recovery_paths,
        })
    }

    fn remove(mut self) -> std::result::Result<(), ReviewedFileError> {
        let mut attempted = false;
        let mut recovery_paths = Vec::new();
        let result = (|| -> Result<()> {
            let Some(destination) = self.destination.as_mut() else {
                return Ok(());
            };
            if destination.original.is_none() {
                return Ok(());
            }
            destination.validate_original()?;
            let mut backup = tempfile::Builder::new()
                .prefix("agi-worktree-original-")
                .tempfile()?;
            backup.write_all(
                self.bytes
                    .as_deref()
                    .context("The reviewed original content was lost")?,
            )?;
            backup.as_file().sync_all()?;
            destination.validate_original()?;
            let (_backup, recovery) = backup
                .keep()
                .context("The original recovery copy could not be retained")?;
            recovery_paths.push(recovery.clone());
            let name = PathBuf::from(format!("{STAGING_PREFIX}{}", uuid::Uuid::new_v4()));
            let mut options = DirOptions::new();
            use confined::DirBuilderExt;
            options.mode(0o700);
            let work = (|| -> Result<()> {
                confined::create_dir(&destination.parent, &name, &options)?;
                let stage = confined::open_dir_nofollow(&destination.parent, &name)?;
                destination.validate_original()?;
                #[cfg(test)]
                if let Some(action) = self
                    .directory
                    .hooks
                    .before_write_open
                    .lock()
                    .unwrap()
                    .take()
                {
                    action();
                }
                attempted = true;
                confined::rename(
                    &destination.parent,
                    &destination.leaf,
                    &stage,
                    Path::new("removed"),
                )?;
                let original = destination
                    .original
                    .as_mut()
                    .context("The reviewed original file grant was lost")?;
                let moved = Metadata::from_file(&original.file)?;
                validate_regular(&moved, self.limit)?;
                validate_named_file(&stage, Path::new("removed"), &original.metadata)?;
                anyhow::ensure!(
                    file_revision(&mut original.file, self.limit)? == original.revision,
                    "The file changed during reviewed removal"
                );
                self.directory.identity()?;
                destination.validate_location()?;
                destination.directory.sync_directory()?;
                confined::remove_file(&stage, Path::new("removed"))?;
                confined::remove_dir(&destination.parent, &name)?;
                destination.directory.sync_directory()?;
                self.directory.identity()?;
                destination.validate_location()?;
                Ok(())
            })();
            if work.is_ok() || !attempted {
                std::fs::remove_file(&recovery)?;
                recovery_paths.retain(|path| path != &recovery);
                let _ = confined::remove_dir(&destination.parent, &name);
            } else {
                let quarantined = destination.directory.path().join(&name).join("removed");
                if quarantined.symlink_metadata().is_ok() {
                    recovery_paths.push(quarantined);
                }
            }
            work
        })();
        result.map_err(|error| ReviewedFileError {
            error,
            uncertain: attempted,
            recovery_paths,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reviewed_files_bind_bytes_modes_and_names_before_replace_or_remove() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("file.bin");
        std::fs::write(&path, b"\0old\xff").unwrap();
        let directory = DirectoryAuthority::open(root.path()).unwrap();
        let mut reviewed = directory.review_file(Path::new("file.bin"), 1024).unwrap();
        assert_eq!(reviewed.bytes(), Some(b"\0old\xff".as_slice()));
        std::fs::write(&path, b"later").unwrap();
        assert!(reviewed.validate().is_err());
        assert!(!reviewed.commit(Some(b"new"), None).err().unwrap().uncertain);
        assert_eq!(std::fs::read(&path).unwrap(), b"later");
        let reviewed = directory.review_file(Path::new("file.bin"), 1024).unwrap();
        let inode = std::os::unix::fs::MetadataExt::ino(&std::fs::metadata(&path).unwrap());
        assert!(reviewed.commit(Some(b"\0saved"), Some(true)).is_ok());
        assert_eq!(
            std::os::unix::fs::MetadataExt::ino(&std::fs::metadata(&path).unwrap()),
            inode
        );
        assert!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o100 != 0);
        let reviewed = directory.review_file(Path::new("file.bin"), 1024).unwrap();
        assert!(reviewed.commit(None, None).is_ok());
        assert!(!path.exists());
    }

    #[test]
    fn review_does_not_create_parents_and_exclusive_creation_refuses_late_files() {
        let root = tempfile::tempdir().unwrap();
        let directory = DirectoryAuthority::open(root.path()).unwrap();
        let reviewed = directory
            .review_file(Path::new("new/nested/file.txt"), 1024)
            .unwrap();
        assert!(!root.path().join("new").exists());
        reviewed
            .commit(Some(b"created"), Some(false))
            .map_err(|failed| failed.error)
            .unwrap();
        assert_eq!(
            std::fs::read(root.path().join("new/nested/file.txt")).unwrap(),
            b"created"
        );
        let reviewed = directory
            .review_file(Path::new("new/late.txt"), 1024)
            .unwrap();
        std::fs::write(root.path().join("new/late.txt"), "external").unwrap();
        assert!(
            !reviewed
                .commit(Some(b"do not replace"), None)
                .err()
                .unwrap()
                .uncertain
        );
        assert_eq!(
            std::fs::read(root.path().join("new/late.txt")).unwrap(),
            b"external"
        );
    }

    #[test]
    fn reviewed_replacement_rejects_later_permissions_and_retains_originals_on_uncertain_flush() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("file.txt");
        std::fs::write(&path, "original").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        let directory = DirectoryAuthority::open(root.path()).unwrap();
        let reviewed = directory.review_file(Path::new("file.txt"), 1024).unwrap();
        let target = path.clone();
        *directory.hooks.after_staging_write.lock().unwrap() = Some(Box::new(move || {
            std::fs::set_permissions(target, std::fs::Permissions::from_mode(0o600)).unwrap()
        }));
        let failure = reviewed.commit(Some(b"incoming"), None).err().unwrap();
        assert!(!failure.uncertain);
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        let reviewed = directory.review_file(Path::new("file.txt"), 1024).unwrap();
        directory.fail_next_directory_sync();
        let failure = reviewed.commit(Some(b"incoming"), None).err().unwrap();
        assert!(failure.uncertain);
        assert_eq!(failure.recovery_paths.len(), 1);
        assert_eq!(
            std::fs::read(&failure.recovery_paths[0]).unwrap(),
            b"original"
        );
        assert_eq!(std::fs::read(&path).unwrap(), b"incoming");
        std::fs::remove_file(&failure.recovery_paths[0]).unwrap();
    }

    #[test]
    fn removal_races_keep_both_the_reviewed_original_and_the_later_file() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("file.txt");
        std::fs::write(&path, "reviewed").unwrap();
        let directory = DirectoryAuthority::open(root.path()).unwrap();
        let reviewed = directory.review_file(Path::new("file.txt"), 1024).unwrap();
        let target = path.clone();
        *directory.hooks.before_write_open.lock().unwrap() = Some(Box::new(move || {
            std::fs::write(target, "late edits").unwrap()
        }));
        let failure = reviewed.commit(None, None).err().unwrap();
        assert!(failure.uncertain);
        assert_eq!(failure.recovery_paths.len(), 2);
        let recovered = failure
            .recovery_paths
            .iter()
            .map(|path| std::fs::read(path).unwrap())
            .collect::<Vec<_>>();
        assert!(
            recovered.contains(&b"reviewed".to_vec())
                && recovered.contains(&b"late edits".to_vec())
        );
        for path in failure.recovery_paths {
            std::fs::remove_file(path).unwrap();
        }
    }

    #[test]
    fn reviewed_files_refuse_parent_links_leaf_links_hard_links_and_replaced_grants() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret.txt"), "outside").unwrap();
        let directory = DirectoryAuthority::open(root.path()).unwrap();
        std::os::unix::fs::symlink(outside.path(), root.path().join("linked")).unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("secret.txt"),
            root.path().join("leaf.txt"),
        )
        .unwrap();
        std::fs::hard_link(
            outside.path().join("secret.txt"),
            root.path().join("hard.txt"),
        )
        .unwrap();
        for path in ["linked/secret.txt", "leaf.txt", "hard.txt"] {
            assert!(
                directory.review_file(Path::new(path), 1024).is_err(),
                "{path}"
            );
        }
        assert_eq!(
            std::fs::read(outside.path().join("secret.txt")).unwrap(),
            b"outside"
        );
        let target = root.path().join("folder");
        std::fs::create_dir(&target).unwrap();
        let granted = DirectoryAuthority::open(&target).unwrap();
        let reviewed = granted.review_file(Path::new("new.txt"), 1024).unwrap();
        std::fs::rename(&target, root.path().join("moved")).unwrap();
        std::fs::create_dir(&target).unwrap();
        assert!(
            !reviewed
                .commit(Some(b"not written"), None)
                .err()
                .unwrap()
                .uncertain
        );
        assert!(!target.join("new.txt").exists() && !root.path().join("moved/new.txt").exists());
    }

    #[test]
    fn a_parent_moved_during_flush_keeps_the_original_and_cannot_report_a_confirmed_save() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("folder");
        std::fs::create_dir(&folder).unwrap();
        std::fs::write(folder.join("file.txt"), "original").unwrap();
        let directory = DirectoryAuthority::open(root.path()).unwrap();
        let reviewed = directory
            .review_file(Path::new("folder/file.txt"), 1024)
            .unwrap();
        let moved = root.path().join("moved");
        let target = folder.clone();
        let new_location = moved.clone();
        *directory.hooks.before_directory_sync.lock().unwrap() = Some(Box::new(move |_| {
            std::fs::rename(target, new_location).unwrap()
        }));
        let failure = reviewed.commit(Some(b"incoming"), None).err().unwrap();
        assert!(failure.uncertain);
        assert!(!folder.exists());
        assert_eq!(std::fs::read(moved.join("file.txt")).unwrap(), b"incoming");
        assert_eq!(failure.recovery_paths.len(), 1);
        assert_eq!(
            std::fs::read(&failure.recovery_paths[0]).unwrap(),
            b"original"
        );
        std::fs::remove_file(&failure.recovery_paths[0]).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn reviewed_writes_reopen_the_file_to_respect_acl_revocation_after_review() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("file.txt");
        std::fs::write(&path, "original").unwrap();
        let directory = DirectoryAuthority::open(root.path()).unwrap();
        let reviewed = directory.review_file(Path::new("file.txt"), 1024).unwrap();
        let before = std::fs::metadata(&path).unwrap().permissions().mode();
        assert!(std::process::Command::new("/bin/chmod")
            .args(["+a", "everyone deny write"])
            .arg(&path)
            .status()
            .unwrap()
            .success());
        let denied = std::fs::OpenOptions::new().write(true).open(&path).is_err();
        let result = reviewed.commit(Some(b"not written"), None);
        assert!(std::process::Command::new("/bin/chmod")
            .args(["-a#", "0"])
            .arg(&path)
            .status()
            .unwrap()
            .success());
        assert!(
            denied,
            "the ACL probe must actually deny a newly opened writer"
        );
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode(),
            before
        );
        assert!(!result.err().unwrap().uncertain);
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
    }
}
