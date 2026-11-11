use super::*;

impl DirectoryAuthority {
    pub(crate) fn coordination_lock(&self, name: &Path) -> Result<File> {
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
        validate_named_file(&self.file, &relative, &Metadata::from_file(&file)?)?;
        Ok(file)
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
