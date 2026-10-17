use std::path::{Path, PathBuf};

pub struct LocalRelay {
    directory: PathBuf,
    socket: PathBuf,
    executable: PathBuf,
}

impl LocalRelay {
    pub fn new(directory: &Path, socket: &Path, executable: &Path) -> Result<Self, String> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::{FileTypeExt, MetadataExt};
            let metadata =
                std::fs::symlink_metadata(directory).map_err(|error| error.to_string())?;
            if !metadata.is_dir()
                || metadata.mode() & 0o077 != 0
                || directory.canonicalize().ok().as_deref() != Some(directory)
            {
                return Err("the browser relay directory is not private and canonical".into());
            }
            let endpoint = std::fs::symlink_metadata(socket).map_err(|error| error.to_string())?;
            if socket.parent() != Some(directory)
                || !endpoint.file_type().is_socket()
                || endpoint.uid() != metadata.uid()
                || endpoint.mode() & 0o077 != 0
            {
                return Err("the browser relay endpoint is not privately owned".into());
            }
            for path in [directory.join("open"), executable.to_path_buf()] {
                let file = std::fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
                if !file.is_file() || path.canonicalize().ok().as_deref() != Some(path.as_path()) {
                    return Err("the browser helper is not a regular canonical executable".into());
                }
            }
            Ok(Self {
                directory: directory.into(),
                socket: socket.into(),
                executable: executable.into(),
            })
        }
        #[cfg(not(unix))]
        {
            let _ = (directory, socket, executable);
            Err("local browser relay is unsupported".into())
        }
    }

    pub fn seatbelt_rules(&self) -> Result<String, String> {
        let escaped = crate::wrap::validate_and_escape_seatbelt_path;
        Ok(format!("\n(allow file-read* (subpath \"{}\") (literal \"{}\"))\n(allow network-outbound (literal \"{}\"))\n",
            escaped(&self.directory)?, escaped(&self.executable)?, escaped(&self.socket)?))
    }

    pub fn bubblewrap_bindings(&self) -> Result<Vec<String>, String> {
        let mut result = Vec::new();
        for path in [&self.directory, &self.executable] {
            let path = path
                .to_str()
                .ok_or("browser relay path is not UTF-8")?
                .to_string();
            result.extend(["--ro-bind".into(), path.clone(), path]);
        }
        Ok(result)
    }
}
