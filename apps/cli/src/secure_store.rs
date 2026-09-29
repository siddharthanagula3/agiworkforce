//! Where the CLI keeps secrets. macOS and Windows use the OS keychain. Linux
//! uses owner-only files under the config directory, as Claude Code does: the
//! kernel keyring forgets everything at reboot and the Secret Service needs a
//! desktop session a server does not have. `AGIWORKFORCE_NO_KEYRING` selects
//! the files on every platform.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use sha2::{Digest, Sha256};

pub fn keyring_disabled() -> bool {
    std::env::var("AGIWORKFORCE_NO_KEYRING")
        .map(|value| !value.is_empty() && value != "0")
        .unwrap_or(false)
}

pub fn uses_keychain() -> bool {
    !cfg!(target_os = "linux") && !keyring_disabled()
}

/// Write `data` to `path` readable by the owner alone. The file is created
/// with that mode beside the target and renamed over it, so no other account
/// ever sees the contents, even for the moment between write and chmod.
pub fn write_owner_only(path: &Path, data: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .with_context(|| format!("{} has no parent directory", path.display()))?;
    create_private_dir(parent)?;
    let temp = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("secret"),
        std::process::id()
    ));
    let _ = fs::remove_file(&temp);
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temp)
        .with_context(|| format!("create {}", temp.display()))?;
    file.write_all(data)
        .and_then(|()| file.sync_all())
        .with_context(|| format!("write {}", temp.display()))?;
    drop(file);
    fs::rename(&temp, path).with_context(|| format!("replace {}", path.display()))
}

/// Create `dir` and any missing parents readable by the owner alone.
fn create_private_dir(dir: &Path) -> Result<()> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder
        .create(dir)
        .with_context(|| format!("create {}", dir.display()))
}

fn secret_path(service: &str, account: &str) -> Result<PathBuf> {
    let digest = Sha256::digest(format!("{service}\n{account}").as_bytes());
    Ok(crate::config::CliConfig::config_dir()?
        .join("secrets")
        .join(format!("{}.secret", crate::hex::encode(&digest))))
}

pub fn get(service: &str, account: &str) -> Result<Option<String>> {
    if uses_keychain() {
        return match keyring::Entry::new(service, account)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error).context("read from the OS credential store"),
        };
    }
    let path = secret_path(service, account)?;
    match fs::read_to_string(&path) {
        Ok(secret) => Ok(Some(secret)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error).with_context(|| format!("read {}", path.display())),
    }
}

pub fn set(service: &str, account: &str, secret: &str) -> Result<()> {
    if uses_keychain() {
        return keyring::Entry::new(service, account)?
            .set_password(secret)
            .context("save to the OS credential store");
    }
    write_owner_only(&secret_path(service, account)?, secret.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_owner_only_file_is_written_whole_and_private() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("auth.json");
        write_owner_only(&path, b"first").unwrap();
        write_owner_only(&path, b"second").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "second");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
    }
}
