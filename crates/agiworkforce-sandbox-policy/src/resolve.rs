//! Where a path lands once every symbolic link on it is followed.
//!
//! `canonicalize` answers that only for a path that exists. A link whose
//! target is not there yet is what an attacker commits: `notes.txt ->
//! .git/hooks/pre-commit` fails to canonicalize, so a resolver that falls back
//! to the nearest existing ancestor keeps the name `notes.txt`, while a write
//! opens it with `O_CREAT`, follows the link and creates the hook. This is the
//! one resolver every check in this crate and the CLI's path checks share, so
//! none of them judges a spelling the kernel would not write to.

use std::ffi::{OsStr, OsString};
use std::path::{Component, Path, PathBuf};

/// The most links followed for one path. Linux gives up after 40 and macOS
/// after 32, so a path that needs more is one the kernel refuses as well.
pub const MAX_LINK_HOPS: usize = 40;

/// A path whose links never settle within [`MAX_LINK_HOPS`]: a loop, or a
/// chain longer than any kernel follows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LinkLoop;

impl std::fmt::Display for LinkLoop {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("too many levels of symbolic links")
    }
}

impl std::error::Error for LinkLoop {}

/// Where a write to `path` would land. Every link is followed, whether its
/// target exists or not and whether it is the last component or one in the
/// middle, and every `..` is applied: through the kernel where the path
/// exists, and textually below the first component that does not. A relative
/// `path` is taken from the working directory.
pub fn landing_path(path: &Path) -> Result<PathBuf, LinkLoop> {
    let mut current = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().map_or_else(|_| path.to_path_buf(), |cwd| cwd.join(path))
    };
    for _ in 0..=MAX_LINK_HOPS {
        let Some((existing, missing)) = existing_prefix(&current) else {
            return Ok(current);
        };
        let Some((first, rest)) = missing.split_first() else {
            return Ok(existing);
        };
        let link = existing.join(first);
        let target = std::fs::symlink_metadata(&link)
            .ok()
            .filter(|found| found.file_type().is_symlink())
            .and_then(|_| std::fs::read_link(&link).ok());
        let Some(target) = target else {
            return Ok(appended(existing, &missing));
        };
        // A relative target is taken from the folder that holds the link, and
        // an absolute one replaces it.
        current = rest
            .iter()
            .fold(existing.join(target), |path, name| path.join(name));
    }
    Err(LinkLoop)
}

/// Why [`read_file_within`] read nothing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NotRead {
    /// Nothing is at the path, or the root itself is not there.
    Missing,
    /// The path leads out of the root once its links are followed, or its
    /// links never settle.
    Outside,
    /// The file is one that holds credentials, by the name it was asked for
    /// under or by the name of the file that name leads to.
    Credential,
    /// What is there is not a regular file: a folder, a FIFO, a device.
    NotRegular,
    /// The file holds more than the limit. None of it is returned.
    TooLarge,
    /// It could not be opened or read, or a link stood in its place by the
    /// time it was opened.
    Unreadable,
}

/// The bytes of the file `relative` names below `root`, for a file whoever
/// writes the folder controls: a project's instructions, a rule, a skill.
///
/// The file is read only when the place it really is, once every link on
/// the way is followed and every `..` applied, is a regular file inside
/// `root`, and only when it holds at most `limit` bytes; a larger one is
/// refused whole, since half of a file is not what its author wrote. A link
/// that stays inside `root` is followed, one that leaves it is not, and
/// `relative` written as an absolute path is held to the same rule.
///
/// Staying inside `root` is not enough: a rule file linked to the project's
/// own `.env` is inside it, and what a project supplies as instructions is
/// shown to clients and sent to a model. So `holds_credentials` is asked
/// about the file twice, each time as a path below `root`: under the name
/// it was asked for, and under the name it lands on. The caller passes the
/// test its own file reads use, so one policy decides both; this crate
/// keeps no list of such names.
///
/// The file is opened where it resolved without following a link and
/// without blocking, so a link or a FIFO put at that name after the check
/// is refused and cannot hang the caller, and no more than `limit` bytes
/// and one are ever read. A folder above it swapped for a link between the
/// check and the open is not caught.
pub fn read_file_within(
    root: &Path,
    relative: &Path,
    limit: u64,
    holds_credentials: &dyn Fn(&Path) -> bool,
) -> Result<Vec<u8>, NotRead> {
    use crate::wrap::NotOpened;
    use std::io::Read;

    let root = root.canonicalize().map_err(|_| NotRead::Missing)?;
    let named = root.join(relative);
    let landing = landing_path(&named).map_err(|_| NotRead::Outside)?;
    if !landing.starts_with(&root) {
        return Err(NotRead::Outside);
    }
    let asked_about = [named.as_path(), landing.as_path()];
    if asked_about
        .into_iter()
        .any(|path| holds_credentials(path.strip_prefix(&root).unwrap_or(path)))
    {
        return Err(NotRead::Credential);
    }
    let (file, found) = match crate::wrap::open_regular(&landing, false) {
        Ok(opened) => opened,
        Err(NotOpened::NotRegular { .. }) => return Err(NotRead::NotRegular),
        Err(NotOpened::Unopened) if std::fs::symlink_metadata(&landing).is_err() => {
            return Err(NotRead::Missing)
        }
        Err(NotOpened::Unopened) => return Err(NotRead::Unreadable),
    };
    if found.len() > limit {
        return Err(NotRead::TooLarge);
    }
    let mut content = Vec::new();
    file.take(limit.saturating_add(1))
        .read_to_end(&mut content)
        .map_err(|_| NotRead::Unreadable)?;
    if content.len() as u64 > limit {
        return Err(NotRead::TooLarge);
    }
    Ok(content)
}

/// The longest leading part of `path` that exists, made canonical, and the
/// components after it. `None` when not even its first component exists.
fn existing_prefix(path: &Path) -> Option<(PathBuf, Vec<OsString>)> {
    let components: Vec<Component<'_>> = path.components().collect();
    (1..=components.len()).rev().find_map(|kept| {
        let prefix: PathBuf = components[..kept].iter().collect();
        let canonical = prefix.canonicalize().ok()?;
        let missing = components[kept..]
            .iter()
            .map(|component| component.as_os_str().to_os_string())
            .collect();
        Some((canonical, missing))
    })
}

/// `base`, which holds no link, with `names` appended and their `.` and `..`
/// applied textually: nothing below it exists to say otherwise.
fn appended(mut base: PathBuf, names: &[OsString]) -> PathBuf {
    for name in names {
        if name == OsStr::new("..") {
            base.pop();
        } else if name != OsStr::new(".") {
            base.push(name);
        }
    }
    base
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agi-landing-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("scratch folder");
        dir.canonicalize().expect("canonical scratch folder")
    }

    #[test]
    fn a_file_is_read_where_it_really_is_and_only_inside_the_root() {
        let root = scratch("read-inside");
        let outside = scratch("read-outside");
        std::fs::write(root.join("AGENTS.md"), "the rules").expect("file");
        std::fs::write(outside.join("id_rsa"), "a private key").expect("file");
        std::fs::create_dir_all(root.join("rules")).expect("folder");
        std::fs::write(root.join("rules/style.md"), "style").expect("file");
        let read = |named: &str| read_file_within(&root, Path::new(named), 64, &|_| false);

        assert_eq!(read("AGENTS.md"), Ok(b"the rules".to_vec()));
        assert_eq!(read("rules/../rules/./style.md"), Ok(b"style".to_vec()));
        assert_eq!(
            read_file_within(&root, &root.join("AGENTS.md"), 64, &|_| false),
            Ok(b"the rules".to_vec()),
            "a path already joined to the root reads the same file"
        );
        assert_eq!(read("missing.md"), Err(NotRead::Missing));
        assert_eq!(read("rules/missing.md"), Err(NotRead::Missing));
        assert_eq!(read("rules"), Err(NotRead::NotRegular));
        assert_eq!(read(""), Err(NotRead::NotRegular));
        assert_eq!(
            read_file_within(&root, &outside.join("id_rsa"), 64, &|_| false),
            Err(NotRead::Outside)
        );
        let escaping = format!(
            "../{}/id_rsa",
            outside.file_name().expect("name").to_string_lossy()
        );
        assert_eq!(read(&escaping), Err(NotRead::Outside));
        assert_eq!(
            read_file_within(&root.join("missing"), Path::new("AGENTS.md"), 64, &|_| {
                false
            }),
            Err(NotRead::Missing)
        );
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn a_link_is_followed_inside_the_root_and_never_out_of_it() {
        let root = scratch("read-links");
        let outside = scratch("read-links-outside");
        std::fs::write(root.join("AGENTS.md"), "the rules").expect("file");
        std::fs::write(outside.join("id_rsa"), "a private key").expect("file");
        symlink("AGENTS.md", root.join("CLAUDE.md")).expect("link");
        symlink("CLAUDE.md", root.join("GEMINI.md")).expect("link to a link");
        symlink(outside.join("id_rsa"), root.join("instructions.md")).expect("link");
        symlink(&outside, root.join("rules")).expect("folder link");
        symlink("/dev/zero", root.join("endless.md")).expect("device link");
        symlink("loop-b", root.join("loop-a")).expect("link");
        symlink("loop-a", root.join("loop-b")).expect("link");
        symlink("gone.md", root.join("dangling.md")).expect("link");
        let read = |named: &str| read_file_within(&root, Path::new(named), 64, &|_| false);

        assert_eq!(read("CLAUDE.md"), Ok(b"the rules".to_vec()));
        assert_eq!(read("GEMINI.md"), Ok(b"the rules".to_vec()));
        assert_eq!(read("instructions.md"), Err(NotRead::Outside));
        assert_eq!(read("rules/id_rsa"), Err(NotRead::Outside));
        assert_eq!(read("endless.md"), Err(NotRead::Outside));
        assert_eq!(read("loop-a"), Err(NotRead::Outside));
        assert_eq!(read("dangling.md"), Err(NotRead::Missing));
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn a_file_inside_the_root_that_holds_credentials_is_refused_by_either_name() {
        let root = scratch("read-credentials");
        std::fs::create_dir_all(root.join(".agiworkforce/rules")).expect("folder");
        std::fs::write(root.join(".env"), "KEY=EXAMPLE").expect("file");
        std::fs::write(root.join(".agiworkforce/rules/style.md"), "style").expect("file");
        symlink("../../.env", root.join(".agiworkforce/rules/a.md")).expect("link");
        symlink("rules/style.md", root.join(".agiworkforce/.env")).expect("link");
        let asked = std::cell::RefCell::new(Vec::new());
        let named_env = |path: &Path| {
            asked.borrow_mut().push(path.to_path_buf());
            path.file_name().is_some_and(|name| name == ".env")
        };
        let read = |named: &str| read_file_within(&root, Path::new(named), 64, &named_env);

        assert_eq!(
            read(".agiworkforce/rules/a.md"),
            Err(NotRead::Credential),
            "a rule linked to the project's own .env was read"
        );
        assert_eq!(
            asked.borrow().as_slice(),
            [
                PathBuf::from(".agiworkforce/rules/a.md"),
                PathBuf::from(".env")
            ],
            "the test is asked about each name as a path below the root"
        );
        assert_eq!(read(".env"), Err(NotRead::Credential));
        assert_eq!(
            read(".agiworkforce/.env"),
            Err(NotRead::Credential),
            "a credential name is refused whatever it leads to"
        );
        assert_eq!(read(".agiworkforce/rules/style.md"), Ok(b"style".to_vec()));
        assert_eq!(
            read_file_within(&root, &root.join(".env"), 64, &named_env),
            Err(NotRead::Credential),
            "a path already joined to the root is judged below the root as well"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_file_over_the_limit_or_not_a_file_is_refused_whole() {
        let root = scratch("read-limit");
        std::fs::write(root.join("full.md"), vec![b'x'; 64]).expect("file");
        std::fs::write(root.join("large.md"), vec![b'x'; 65]).expect("file");
        std::fs::write(root.join("empty.md"), "").expect("file");
        let made = std::process::Command::new("mkfifo")
            .arg(root.join("pipe.md"))
            .status()
            .expect("mkfifo");
        assert!(made.success());
        let read = |named: &str| read_file_within(&root, Path::new(named), 64, &|_| false);

        assert_eq!(read("full.md").map(|content| content.len()), Ok(64));
        assert_eq!(read("large.md"), Err(NotRead::TooLarge));
        assert_eq!(read("empty.md"), Ok(Vec::new()));
        let started = std::time::Instant::now();
        assert_eq!(read("pipe.md"), Err(NotRead::NotRegular));
        assert!(started.elapsed() < std::time::Duration::from_secs(5));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn an_existing_path_lands_where_it_canonicalizes() {
        let root = scratch("existing");
        std::fs::create_dir_all(root.join("real")).expect("folder");
        symlink(root.join("real"), root.join("alias")).expect("link");

        assert_eq!(landing_path(&root.join("alias")), Ok(root.join("real")));
        assert_eq!(
            landing_path(&root.join("alias/../real/./new.txt")),
            Ok(root.join("real/new.txt"))
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_dangling_leaf_link_lands_on_its_missing_target() {
        let root = scratch("dangling-leaf");
        std::fs::create_dir_all(root.join(".git")).expect("git folder");
        symlink(".git/hooks/pre-commit", root.join("notes.txt")).expect("dangling link");

        assert_eq!(
            landing_path(&root.join("notes.txt")),
            Ok(root.join(".git/hooks/pre-commit"))
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_dangling_link_in_the_middle_of_a_path_is_followed_too() {
        let root = scratch("dangling-parent");
        std::fs::create_dir_all(root.join(".git")).expect("git folder");
        symlink(root.join(".git/hooks"), root.join("scripts")).expect("dangling link");

        assert_eq!(
            landing_path(&root.join("scripts/sub/../pre-commit")),
            Ok(root.join(".git/hooks/pre-commit"))
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_chain_of_dangling_links_is_followed_to_its_end() {
        let root = scratch("chain");
        symlink("second", root.join("first")).expect("first link");
        symlink("third/file", root.join("second")).expect("second link");

        assert_eq!(
            landing_path(&root.join("first")),
            Ok(root.join("third/file"))
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_loop_of_links_is_an_error_rather_than_a_spelling() {
        let root = scratch("loop");
        symlink("b", root.join("a")).expect("a to b");
        symlink("a", root.join("b")).expect("b to a");

        assert_eq!(landing_path(&root.join("a")), Err(LinkLoop));
        assert_eq!(landing_path(&root.join("a/inner.txt")), Err(LinkLoop));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_missing_path_keeps_its_name_below_the_folder_that_exists() {
        let root = scratch("missing");

        assert_eq!(
            landing_path(&root.join("new/deeper/../file.txt")),
            Ok(root.join("new/file.txt"))
        );
        let _ = std::fs::remove_dir_all(&root);
    }
}
