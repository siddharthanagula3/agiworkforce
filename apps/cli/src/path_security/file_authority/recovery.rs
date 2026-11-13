use super::*;

impl DirectoryAuthority {
    pub(crate) fn identity(&self) -> Result<String> {
        let held = Metadata::from_file(&self.file)?;
        let named = confined::open_ambient_dir(self.path(), cap_primitives::ambient_authority())?;
        let current = Metadata::from_file(&named)?;
        anyhow::ensure!(
            same_identity(&held, &current),
            "the granted directory no longer owns its name"
        );
        Ok(format!("{}:{}", held.dev(), held.ino()))
    }

    pub(crate) fn private_child(&self, name: &Path) -> Result<Self> {
        #[cfg(not(unix))]
        let _ = name;
        #[cfg(not(unix))]
        anyhow::bail!("Private recovery storage is unavailable on this platform");
        #[cfg(unix)]
        {
            use confined::DirBuilderExt;
            use std::os::unix::fs::PermissionsExt;
            let name = normal_relative(name)?;
            anyhow::ensure!(
                name.components().count() == 1,
                "expected one recovery directory name"
            );
            let mut options = DirOptions::new();
            options.mode(0o700);
            match confined::create_dir(&self.file, &name, &options) {
                Ok(()) => self.sync_directory()?,
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error.into()),
            }
            let child = self.child(&name, false)?;
            anyhow::ensure!(
                child.file.metadata()?.permissions().mode() & 0o077 == 0,
                "The recovery directory is not private to this device user"
            );
            Ok(child)
        }
    }

    pub(crate) fn recovery_lock(&self) -> Result<File> {
        #[cfg(not(unix))]
        anyhow::bail!("Private recovery storage is unavailable on this platform");
        #[cfg(unix)]
        {
            use confined::OpenOptionsExt;
            use std::os::unix::fs::PermissionsExt;
            self.identity()?;
            let name = Path::new("lock");
            let mut options = OpenOptions::new();
            options
                .read(true)
                .write(true)
                .create(true)
                .follow(FollowSymlinks::No)
                .nonblock(true)
                .mode(0o600);
            let file = confined::open(&self.file, name, &options)?;
            validate_regular(&Metadata::from_file(&file)?, 0)?;
            anyhow::ensure!(
                file.metadata()?.permissions().mode() & 0o077 == 0,
                "The recovery lock is not private to this device user"
            );
            file.try_lock()
                .context("Recovery storage is busy in another window; retry after it finishes")?;
            validate_named_file(&self.file, name, &Metadata::from_file(&file)?)?;
            file.sync_all()?;
            self.sync_directory()?;
            Ok(file)
        }
    }
}
