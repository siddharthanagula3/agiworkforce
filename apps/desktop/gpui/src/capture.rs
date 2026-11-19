use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use anyhow::{ensure, Context, Result};

use crate::chat_upload::ChatUpload;

const CAPTURE_FOLDER: &str = "captures";
const SCREENSHOT_TOOL: &str = "/usr/sbin/screencapture";

pub const fn screenshot_supported() -> bool {
    cfg!(target_os = "macos")
}

pub fn capture_root(temp: &Path, desktop_name: &str) -> Result<PathBuf> {
    ensure!(
        temp.is_absolute(),
        "The temporary folder is not an absolute path"
    );
    ensure!(
        !desktop_name.trim().is_empty()
            && !desktop_name.contains(['/', '\\', '\0'])
            && desktop_name != "."
            && desktop_name != "..",
        "The desktop name cannot be used as a folder name"
    );
    Ok(temp.join(desktop_name).join(CAPTURE_FOLDER))
}

#[derive(Debug)]
pub struct CaptureDir {
    path: PathBuf,
}

impl CaptureDir {
    pub fn create(root: &Path) -> Result<Self> {
        private_dir(root, true)?;
        let path = root.join(uuid::Uuid::new_v4().to_string());
        private_dir(&path, false)?;
        Ok(Self { path })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn file(&self, name: &str) -> Result<PathBuf> {
        ensure!(
            !name.is_empty()
                && !name.contains(['/', '\\', '\0'])
                && !name.chars().any(char::is_control)
                && name != "."
                && name != "..",
            "The capture filename is invalid"
        );
        Ok(self.path.join(name))
    }
}

impl Drop for CaptureDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

fn private_dir(path: &Path, recursive: bool) -> Result<()> {
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(recursive);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder
        .create(path)
        .with_context(|| format!("The capture folder {} could not be created", path.display()))
}

pub fn sweep_stale(root: &Path, older_than: SystemTime) -> Result<usize> {
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(error.into()),
    };
    let mut removed = 0;
    for entry in entries {
        let entry = entry?;
        let metadata = std::fs::symlink_metadata(entry.path())?;
        if !metadata.is_dir()
            || uuid::Uuid::parse_str(&entry.file_name().to_string_lossy()).is_err()
            || metadata.modified()? > older_than
        {
            continue;
        }
        std::fs::remove_dir_all(entry.path())?;
        removed += 1;
    }
    Ok(removed)
}

pub fn screenshot_name(at: chrono::DateTime<chrono::Local>) -> String {
    at.format("Screenshot %Y-%m-%d at %H.%M.%S.png").to_string()
}

pub fn screenshot_command(output: &Path) -> (PathBuf, Vec<OsString>) {
    (
        PathBuf::from(SCREENSHOT_TOOL),
        vec![
            "-i".into(),
            "-x".into(),
            "-t".into(),
            "png".into(),
            output.as_os_str().to_owned(),
        ],
    )
}

#[derive(Debug, PartialEq, Eq)]
pub enum ScreenshotOutcome {
    Captured,
    Cancelled,
    Failed(String),
}

pub fn screenshot_outcome(exited_successfully: bool, output: &Path) -> ScreenshotOutcome {
    match std::fs::symlink_metadata(output) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => ScreenshotOutcome::Cancelled,
        Err(error) => {
            ScreenshotOutcome::Failed(format!("The screenshot could not be read: {error}"))
        }
        Ok(metadata) if !metadata.is_file() => {
            ScreenshotOutcome::Failed("The screenshot is not a regular file".into())
        }
        Ok(_) if !exited_successfully => {
            ScreenshotOutcome::Failed("The screenshot tool reported an error".into())
        }
        Ok(metadata) if metadata.len() == 0 => {
            ScreenshotOutcome::Failed("The screenshot is empty".into())
        }
        Ok(_) => ScreenshotOutcome::Captured,
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct DroppedFile {
    pub path: String,
    pub byte_count: u64,
}

pub fn dropped_file(paths: &[PathBuf], upload: &ChatUpload) -> Result<DroppedFile> {
    let mut distinct: Vec<&PathBuf> = Vec::new();
    for path in paths {
        if !distinct.contains(&path) {
            distinct.push(path);
        }
    }
    ensure!(!distinct.is_empty(), "Nothing was dropped");
    ensure!(
        distinct.len() == 1,
        "Drop one file at a time; each file is reviewed before upload"
    );
    let path = distinct[0];
    ensure!(path.is_absolute(), "The dropped file has no absolute path");
    let text = path
        .to_str()
        .context("Drop a file with a Unicode path")?
        .to_owned();
    let metadata = std::fs::symlink_metadata(path).context("The dropped file is unavailable")?;
    ensure!(
        !metadata.is_dir(),
        "Folders cannot be attached; drop a single file"
    );
    ensure!(
        metadata.is_file(),
        "Only regular files can be attached; links and devices are not uploaded"
    );
    upload.can_add(metadata.len())?;
    Ok(DroppedFile {
        path: text,
        byte_count: metadata.len(),
    })
}
