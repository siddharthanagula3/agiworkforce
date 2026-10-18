use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Thread-safe, single-write storage for the resolved app data directory.
/// Populated once by `set_app_data_dir()` during `setup()` in lib.rs,
/// then read by `app_data_dir()` and its downstream callers.
/// Replaces the previous `std::env::set_var` approach which is unsound
/// in multi-threaded programs (UB per POSIX, Rust 1.66+ warning).
static APP_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Called once during Tauri `setup()` to publish the resolved app data dir.
/// Subsequent calls are harmless no-ops (`OnceLock::set` returns `Err` if
/// already initialised, but we intentionally ignore that).
pub fn set_app_data_dir(path: PathBuf) {
    let _ = APP_DATA_DIR.set(path);
}

/// Held by every test that sets `AGIWORKFORCE_APP_DATA_DIR` or
/// `AGIWORKFORCE_PROJECT_FOLDER`, or reads a path derived from either: the
/// variables are process-wide, so a test changing one would otherwise move
/// another test's directory mid-test.
#[cfg(test)]
pub static APP_DATA_DIR_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub fn app_data_dir() -> anyhow::Result<PathBuf> {
    #[cfg(test)]
    if let Some(dir) = std::env::var_os("AGIWORKFORCE_APP_DATA_DIR") {
        let dir = PathBuf::from(dir);
        if !dir.exists() {
            std::fs::create_dir_all(&dir)?;
        }
        return Ok(dir);
    }

    // Primary: OnceLock set during setup().
    if let Some(dir) = APP_DATA_DIR.get() {
        if !dir.exists() {
            std::fs::create_dir_all(dir)?;
        }
        return Ok(dir.clone());
    }

    // Fallback for code that runs before setup() (e.g. telemetry init)
    // or in standalone/test contexts where Tauri setup hasn't executed.
    let dir = dirs::data_local_dir()
        .ok_or_else(|| anyhow::anyhow!("Failed to get local data directory"))?
        .join("agiworkforce");

    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }

    Ok(dir)
}

pub fn database_path() -> anyhow::Result<PathBuf> {
    Ok(app_data_dir()?.join("agiworkforce.db"))
}

/// Writes `content` to `path`, a path a grant check returned. With
/// `create_new` the file must not exist yet; otherwise an existing file is
/// replaced. The last component of `path` is never followed: on unix the
/// open fails with `O_NOFOLLOW` when it is a link; on Windows a symlink or
/// other reparse point there is refused, and one swapped in after that check
/// is opened as itself rather than followed. Links in earlier components are
/// followed, so `path` must already be resolved.
pub fn write_without_following(
    path: &Path,
    content: &[u8],
    create_new: bool,
) -> std::io::Result<()> {
    use std::io::Write;

    let mut options = std::fs::OpenOptions::new();
    options.write(true);
    if create_new {
        options.create_new(true);
    } else {
        options.truncate(true);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;

        options.custom_flags(libc::O_NOFOLLOW);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::{MetadataExt, OpenOptionsExt};

        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
        const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;

        if let Ok(metadata) = std::fs::symlink_metadata(path) {
            if metadata.file_type().is_symlink()
                || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
            {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!(
                        "'{}' is a link or reparse point, so it is not written through",
                        path.display()
                    ),
                ));
            }
        }
        options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    }
    options.open(path)?.write_all(content)
}

/// Opens `path`, a path a grant check returned, for reading. As with
/// [`write_without_following`] the last component is never followed, so a
/// link swapped in after the check is refused rather than read through, and
/// the caller reads from the returned handle instead of reopening by name.
pub fn open_file_without_following(path: &Path) -> std::io::Result<std::fs::File> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;

        options.custom_flags(libc::O_NOFOLLOW);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::{MetadataExt, OpenOptionsExt};

        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
        const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;

        if let Ok(metadata) = std::fs::symlink_metadata(path) {
            if metadata.file_type().is_symlink()
                || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
            {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!(
                        "'{}' is a link or reparse point, so it is not read through",
                        path.display()
                    ),
                ));
            }
        }
        options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    }
    options.open(path)
}

/// [`write_without_following`] as a new file when nothing is at `path`, or
/// else replacing the file there.
pub fn write_file_without_following(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let create_new = matches!(
        std::fs::symlink_metadata(path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound
    );
    write_without_following(path, bytes, create_new)
}

/// [`write_file_without_following`] off the async runtime.
pub async fn write_file_without_following_async<B>(path: PathBuf, bytes: B) -> std::io::Result<()>
where
    B: AsRef<[u8]> + Send + 'static,
{
    tokio::task::spawn_blocking(move || write_file_without_following(&path, bytes.as_ref()))
        .await
        .map_err(std::io::Error::other)?
}

pub fn format_bytes(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit_index = 0;

    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }

    format!("{:.2} {}", size, UNITS[unit_index])
}

pub fn format_duration(millis: u64) -> String {
    if millis < 1000 {
        format!("{}ms", millis)
    } else if millis < 60_000 {
        format!("{:.1}s", millis as f64 / 1000.0)
    } else if millis < 3_600_000 {
        format!("{:.1}m", millis as f64 / 60_000.0)
    } else {
        format!("{:.1}h", millis as f64 / 3_600_000.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_bytes() {
        assert_eq!(format_bytes(0), "0.00 B");
        assert_eq!(format_bytes(512), "512.00 B");
        assert_eq!(format_bytes(1024), "1.00 KB");
        assert_eq!(format_bytes(1536), "1.50 KB");
        assert_eq!(format_bytes(1_048_576), "1.00 MB");
    }

    #[cfg(unix)]
    #[test]
    fn a_link_in_place_of_the_target_is_never_written_through() {
        let dir = tempfile::tempdir().expect("temporary folder");
        let outside = dir.path().join("outside.txt");
        let target = dir.path().join("report.docx");

        write_file_without_following(&target, b"first").expect("a new file is created");
        write_file_without_following(&target, b"second").expect("an existing file is replaced");
        assert_eq!(std::fs::read(&target).expect("written"), b"second");

        std::fs::remove_file(&target).expect("removed");
        std::os::unix::fs::symlink(&outside, &target).expect("dangling link");
        assert!(write_file_without_following(&target, b"planted").is_err());
        std::fs::write(&outside, b"kept").expect("link target");
        assert!(write_file_without_following(&target, b"planted").is_err());
        assert_eq!(std::fs::read(&outside).expect("untouched"), b"kept");
    }

    #[test]
    fn test_format_duration() {
        assert_eq!(format_duration(500), "500ms");
        assert_eq!(format_duration(1500), "1.5s");
        assert_eq!(format_duration(90_000), "1.5m");
        assert_eq!(format_duration(7_200_000), "2.0h");
    }
}
