//! Where a file the agent removes goes: the user's Trash, never nowhere.

use std::ffi::{OsStr, OsString};
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    MacOs,
    Freedesktop,
    Fallback,
}

impl Platform {
    pub fn current() -> Self {
        if cfg!(target_os = "macos") {
            Self::MacOs
        } else if cfg!(all(
            unix,
            not(any(target_os = "ios", target_os = "android"))
        )) {
            Self::Freedesktop
        } else {
            Self::Fallback
        }
    }
}

/// The folders a file can be trashed into on this machine. `fallback` is
/// where a file goes when the platform's own Trash cannot take it.
#[derive(Debug, Clone)]
pub struct TrashLocation {
    platform: Platform,
    home: Option<PathBuf>,
    data_home: Option<PathBuf>,
    fallback: Option<PathBuf>,
}

impl TrashLocation {
    pub fn new(
        platform: Platform,
        home: Option<PathBuf>,
        data_home: Option<PathBuf>,
        fallback: Option<PathBuf>,
    ) -> Self {
        Self {
            platform,
            home,
            data_home,
            fallback,
        }
    }

    pub fn fallback_only(folder: PathBuf) -> Self {
        Self::new(Platform::Fallback, None, None, Some(folder))
    }

    #[cfg(not(test))]
    pub fn system() -> Self {
        let data_home = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .filter(|folder| folder.is_absolute());
        Self::new(
            Platform::current(),
            dirs::home_dir(),
            data_home,
            crate::config::CliConfig::config_dir()
                .ok()
                .map(|home| home.join("trash")),
        )
    }

    #[cfg(test)]
    pub fn system() -> Self {
        static FOLDER: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
        Self::fallback_only(
            FOLDER
                .get_or_init(|| {
                    tempfile::Builder::new()
                        .prefix("agi-test-trash-")
                        .tempdir()
                        .expect("a private Trash for this test run")
                        .keep()
                })
                .clone(),
        )
    }

    /// Moves `source` into the Trash under the name of `original`, which is
    /// also the path a freedesktop Trash records as the place to restore it
    /// to, and returns where it landed. A link is trashed as a link and a
    /// folder is refused.
    pub fn trash(&self, source: &Path, original: &Path) -> io::Result<PathBuf> {
        if fs::symlink_metadata(source)?.is_dir() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("{} is a folder; only files are trashed", source.display()),
            ));
        }
        let name = original.file_name().ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("{} has no file name", original.display()),
            )
        })?;
        let original = std::path::absolute(original)?;
        let own = match self.platform {
            Platform::MacOs => self
                .home
                .as_ref()
                .map(|home| place_flat(&home.join(".Trash"), source, name)),
            Platform::Freedesktop => self
                .freedesktop_root()
                .map(|root| place_freedesktop(&root, source, name, &original)),
            Platform::Fallback => None,
        };
        if let Some(Ok(landed)) = own {
            return Ok(landed);
        }
        let fallback = self.fallback.as_ref().ok_or_else(|| {
            io::Error::new(io::ErrorKind::NotFound, "no Trash folder is available")
        })?;
        place_flat(fallback, source, name)
    }

    /// Whether `landed` is in this machine's fallback folder rather than in
    /// the platform's own Trash, where a file manager would not show it.
    pub fn in_fallback(&self, landed: &Path) -> bool {
        self.fallback
            .as_ref()
            .is_some_and(|folder| landed.starts_with(folder))
    }

    fn freedesktop_root(&self) -> Option<PathBuf> {
        let data = self.data_home.clone().or_else(|| {
            self.home
                .as_ref()
                .map(|home| home.join(".local").join("share"))
        })?;
        Some(data.join("Trash"))
    }
}

/// Moves `path` into the user's Trash and returns where it landed.
pub fn move_to_trash(path: &Path) -> io::Result<PathBuf> {
    TrashLocation::system().trash(path, path)
}

fn numbered(name: &OsStr, attempt: u32) -> OsString {
    if attempt <= 1 {
        return name.to_os_string();
    }
    let path = Path::new(name);
    let mut numbered = path.file_stem().unwrap_or(name).to_os_string();
    numbered.push(format!(" {attempt}"));
    if let Some(extension) = path.extension() {
        numbered.push(".");
        numbered.push(extension);
    }
    numbered
}

fn create_private_folder(folder: &Path) -> io::Result<()> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(folder)
}

fn reserve(path: &Path) -> io::Result<Option<fs::File>> {
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
    {
        Ok(file) => Ok(Some(file)),
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => Ok(None),
        Err(error) => Err(error),
    }
}

fn place_flat(folder: &Path, source: &Path, name: &OsStr) -> io::Result<PathBuf> {
    create_private_folder(folder)?;
    for attempt in 1.. {
        let landing = folder.join(numbered(name, attempt));
        if reserve(&landing)?.is_none() {
            continue;
        }
        return match relocate(source, &landing) {
            Ok(()) => Ok(landing),
            Err(error) => {
                let _ = fs::remove_file(&landing);
                Err(error)
            }
        };
    }
    unreachable!("a free name is found before the attempts run out")
}

fn place_freedesktop(
    root: &Path,
    source: &Path,
    name: &OsStr,
    original: &Path,
) -> io::Result<PathBuf> {
    let files = root.join("files");
    let info = root.join("info");
    create_private_folder(&files)?;
    create_private_folder(&info)?;
    for attempt in 1.. {
        let candidate = numbered(name, attempt);
        let mut record_name = candidate.clone();
        record_name.push(".trashinfo");
        let record = info.join(record_name);
        let Some(mut record_file) = reserve(&record)? else {
            continue;
        };
        let landing = files.join(&candidate);
        let written = record_file.write_all(trashinfo(original).as_bytes());
        drop(record_file);
        let placed = written.and_then(|()| match reserve(&landing)? {
            Some(_) => relocate(source, &landing).inspect_err(|_| {
                let _ = fs::remove_file(&landing);
            }),
            None => Err(io::ErrorKind::AlreadyExists.into()),
        });
        match placed {
            Ok(()) => return Ok(landing),
            Err(error) => {
                let _ = fs::remove_file(&record);
                if error.kind() != io::ErrorKind::AlreadyExists {
                    return Err(error);
                }
            }
        }
    }
    unreachable!("a free name is found before the attempts run out")
}

fn trashinfo(original: &Path) -> String {
    format!(
        "[Trash Info]\nPath={}\nDeletionDate={}\n",
        percent_encode(original),
        chrono::Local::now().format("%Y-%m-%dT%H:%M:%S")
    )
}

fn percent_encode(path: &Path) -> String {
    #[cfg(unix)]
    let bytes = std::os::unix::ffi::OsStrExt::as_bytes(path.as_os_str()).to_vec();
    #[cfg(not(unix))]
    let bytes = path.to_string_lossy().into_owned().into_bytes();
    let mut encoded = String::with_capacity(bytes.len());
    for byte in bytes {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                encoded.push(char::from(byte))
            }
            other => encoded.push_str(&format!("%{other:02X}")),
        }
    }
    encoded
}

/// Renames `source` over the name reserved at `landing`, and copies then
/// removes it when a rename cannot cross to that volume.
fn relocate(source: &Path, landing: &Path) -> io::Result<()> {
    if fs::rename(source, landing).is_ok() {
        return Ok(());
    }
    if fs::symlink_metadata(source)?.file_type().is_symlink() {
        copy_link(source, landing)?;
    } else {
        fs::copy(source, landing)?;
    }
    fs::remove_file(source)
}

#[cfg(unix)]
fn copy_link(source: &Path, landing: &Path) -> io::Result<()> {
    let target = fs::read_link(source)?;
    fs::remove_file(landing)?;
    std::os::unix::fs::symlink(target, landing)
}

#[cfg(not(unix))]
fn copy_link(_source: &Path, _landing: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "a symbolic link cannot be moved across volumes here",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(folder: &Path, name: &str, text: &str) -> PathBuf {
        let path = folder.join(name);
        fs::write(&path, text).expect("seed file");
        path
    }

    fn read(path: &Path) -> String {
        fs::read_to_string(path).expect("read trashed file")
    }

    #[test]
    fn same_names_land_side_by_side_without_overwriting() {
        let work = tempfile::tempdir().unwrap();
        let home = tempfile::tempdir().unwrap();
        let location =
            TrashLocation::new(Platform::MacOs, Some(home.path().to_path_buf()), None, None);
        let trash = home.path().join(".Trash");

        let mut landed = Vec::new();
        for text in ["one", "two", "three"] {
            let path = file(work.path(), "notes.txt", text);
            landed.push(location.trash(&path, &path).unwrap());
            assert!(!path.exists(), "the file leaves its place");
        }

        assert_eq!(
            landed,
            [
                trash.join("notes.txt"),
                trash.join("notes 2.txt"),
                trash.join("notes 3.txt")
            ]
        );
        assert_eq!(
            landed.iter().map(|path| read(path)).collect::<Vec<_>>(),
            ["one", "two", "three"]
        );
    }

    #[test]
    fn a_name_without_an_extension_or_with_a_leading_dot_is_numbered_whole() {
        assert_eq!(numbered(OsStr::new("Makefile"), 2), "Makefile 2");
        assert_eq!(numbered(OsStr::new(".env"), 3), ".env 3");
        assert_eq!(numbered(OsStr::new("a.tar.gz"), 2), "a.tar 2.gz");
        assert_eq!(numbered(OsStr::new("a.txt"), 1), "a.txt");
    }

    #[test]
    fn the_copy_is_named_for_the_original_not_the_source() {
        let work = tempfile::tempdir().unwrap();
        let folder = tempfile::tempdir().unwrap();
        let staged = file(work.path(), "0", "kept");
        let location = TrashLocation::fallback_only(folder.path().join("trash"));

        let landed = location
            .trash(&staged, Path::new("/project/src/old.rs"))
            .unwrap();

        assert_eq!(landed, folder.path().join("trash").join("old.rs"));
        assert_eq!(read(&landed), "kept");
        assert!(!staged.exists());
    }

    #[test]
    fn freedesktop_records_where_the_file_came_from() {
        let work = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let location = TrashLocation::new(
            Platform::Freedesktop,
            None,
            Some(data.path().to_path_buf()),
            None,
        );
        let path = file(work.path(), "my file#1.txt", "body");

        let landed = location.trash(&path, &path).unwrap();

        let root = data.path().join("Trash");
        assert_eq!(landed, root.join("files").join("my file#1.txt"));
        assert_eq!(read(&landed), "body");
        let record = read(&root.join("info").join("my file#1.txt.trashinfo"));
        let lines: Vec<&str> = record.lines().collect();
        assert_eq!(lines[0], "[Trash Info]");
        let encoded = percent_encode(&std::path::absolute(&path).unwrap());
        assert_eq!(lines[1], format!("Path={encoded}"));
        assert!(encoded.ends_with("/my%20file%231.txt"), "{encoded}");
        let date = lines[2].strip_prefix("DeletionDate=").expect("a date");
        assert!(
            chrono::NaiveDateTime::parse_from_str(date, "%Y-%m-%dT%H:%M:%S").is_ok(),
            "{date}"
        );
        assert_eq!(lines.len(), 3);
    }

    #[test]
    fn freedesktop_keeps_each_collision_paired_with_its_record() {
        let work = tempfile::tempdir().unwrap();
        let home = tempfile::tempdir().unwrap();
        let location = TrashLocation::new(
            Platform::Freedesktop,
            Some(home.path().to_path_buf()),
            None,
            None,
        );
        let root = home.path().join(".local").join("share").join("Trash");

        for text in ["first", "second"] {
            let path = file(work.path(), "a.txt", text);
            location.trash(&path, &path).unwrap();
        }

        assert_eq!(read(&root.join("files").join("a.txt")), "first");
        assert_eq!(read(&root.join("files").join("a 2.txt")), "second");
        assert!(root.join("info").join("a.txt.trashinfo").is_file());
        assert!(root.join("info").join("a 2.txt.trashinfo").is_file());
    }

    #[test]
    fn a_trash_that_cannot_be_used_falls_back_to_the_agi_folder() {
        let work = tempfile::tempdir().unwrap();
        let home = tempfile::tempdir().unwrap();
        fs::write(home.path().join(".Trash"), "in the way").unwrap();
        let fallback = home.path().join("agi").join("trash");
        let location = TrashLocation::new(
            Platform::MacOs,
            Some(home.path().to_path_buf()),
            None,
            Some(fallback.clone()),
        );
        let path = file(work.path(), "gone.txt", "body");

        let landed = location.trash(&path, &path).unwrap();

        assert_eq!(landed, fallback.join("gone.txt"));
        assert_eq!(read(&landed), "body");
    }

    #[test]
    fn with_no_home_the_agi_folder_takes_the_file() {
        let work = tempfile::tempdir().unwrap();
        let fallback = work.path().join("trash");
        let location = TrashLocation::new(Platform::MacOs, None, None, Some(fallback.clone()));
        let path = file(work.path(), "x.txt", "body");

        assert_eq!(
            location.trash(&path, &path).unwrap(),
            fallback.join("x.txt")
        );
    }

    #[test]
    fn with_nowhere_to_put_it_the_file_stays_and_the_error_says_so() {
        let work = tempfile::tempdir().unwrap();
        let location = TrashLocation::new(Platform::Fallback, None, None, None);
        let path = file(work.path(), "x.txt", "body");

        let error = location.trash(&path, &path).unwrap_err();

        assert_eq!(error.kind(), io::ErrorKind::NotFound);
        assert!(path.exists());
    }

    #[test]
    fn a_folder_is_refused_and_left_alone() {
        let work = tempfile::tempdir().unwrap();
        let folder = work.path().join("dir");
        fs::create_dir(&folder).unwrap();
        let location = TrashLocation::fallback_only(work.path().join("trash"));

        let error = location.trash(&folder, &folder).unwrap_err();

        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
        assert!(folder.is_dir());
    }

    #[cfg(unix)]
    #[test]
    fn a_link_is_trashed_as_a_link_and_its_target_is_untouched() {
        let work = tempfile::tempdir().unwrap();
        let target = file(work.path(), "target.txt", "precious");
        let link = work.path().join("link.txt");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        let location = TrashLocation::fallback_only(work.path().join("trash"));

        let landed = location.trash(&link, &link).unwrap();

        assert!(fs::symlink_metadata(&landed)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(fs::read_link(&landed).unwrap(), target);
        assert!(fs::symlink_metadata(&link).is_err());
        assert_eq!(read(&target), "precious");
    }

    #[cfg(unix)]
    #[test]
    fn copying_a_link_across_volumes_keeps_it_a_link() {
        let work = tempfile::tempdir().unwrap();
        let target = file(work.path(), "target.txt", "precious");
        let link = work.path().join("link.txt");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        let landing = work.path().join("landing");
        fs::write(&landing, "").unwrap();

        copy_link(&link, &landing).unwrap();

        assert_eq!(fs::read_link(&landing).unwrap(), target);
    }

    #[test]
    fn a_missing_source_is_an_error() {
        let work = tempfile::tempdir().unwrap();
        let location = TrashLocation::fallback_only(work.path().join("trash"));
        let missing = work.path().join("missing.txt");

        assert_eq!(
            location.trash(&missing, &missing).unwrap_err().kind(),
            io::ErrorKind::NotFound
        );
    }
}
