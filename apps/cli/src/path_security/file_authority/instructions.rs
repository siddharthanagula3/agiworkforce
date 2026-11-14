use super::*;

pub(crate) struct HeldFileLock {
    file: File,
}

impl Drop for HeldFileLock {
    fn drop(&mut self) {
        let _ = self.file.unlock();
    }
}

impl HeldFileLock {
    pub(super) fn new(file: File) -> Self {
        Self { file }
    }

    pub(super) fn file(&self) -> &File {
        &self.file
    }
}

impl DirectoryAuthority {
    pub(crate) fn coordination_lock(&self, name: &Path) -> Result<HeldFileLock> {
        self.identity()?;
        let relative = normal_relative(name)?;
        anyhow::ensure!(
            relative.components().count() == 1,
            "Choose one lock file name"
        );
        let mut options = OpenOptions::new();
        options
            .read(true)
            .write(true)
            .create(true)
            .follow(FollowSymlinks::No)
            .nonblock(true);
        #[cfg(unix)]
        {
            use confined::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = confined::open(&self.file, &relative, &options)?;
        validate_regular(&Metadata::from_file(&file)?, 0)?;
        file.try_lock()
            .context("Another settings operation is in progress; retry after it finishes")?;
        let lock = HeldFileLock::new(file);
        validate_named_file(&self.file, &relative, &Metadata::from_file(lock.file())?)?;
        Ok(lock)
    }
}

impl WorkspaceFileAuthority {
    pub(crate) fn instruction_directory(&self, create: bool) -> Result<Option<DirectoryAuthority>> {
        self.identity()?;
        let path = Path::new(crate::compaction::PROJECT_INSTRUCTIONS_FILE);
        let parent = path
            .parent()
            .context("The instruction path has no folder")?;
        let mut directory = self.root.clone();
        for component in parent.components() {
            let Component::Normal(name) = component else {
                anyhow::bail!("The instruction path is not relative");
            };
            directory = match directory.child(Path::new(name), create) {
                Ok(directory) => directory,
                Err(error) if !create && is_not_found(&error) => return Ok(None),
                Err(error) => return Err(error),
            };
        }
        self.identity()?;
        Ok(Some(directory))
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn a_released_coordination_lock_is_free_while_a_spawned_child_still_shares_its_description() {
        let base = tempfile::tempdir().unwrap();
        let directory = DirectoryAuthority::open(base.path()).unwrap();
        let held = directory.coordination_lock(Path::new("lock")).unwrap();
        let inherited = held.file().try_clone().unwrap();
        assert!(directory.coordination_lock(Path::new("lock")).is_err());
        drop(held);
        let reacquired = directory.coordination_lock(Path::new("lock")).unwrap();
        drop(inherited);
        drop(reacquired);
    }
}
