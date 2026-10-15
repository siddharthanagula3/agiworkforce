//! Reading the text files a project supplies: its instructions, rules and
//! skills.
//!
//! Such a file is repository content, so whoever writes the repository
//! chooses what it is. A link named `instructions.md` that points at a key in
//! the home folder would be read like any other and its contents shown to a
//! client or handed to the model, and one that points at `/dev/zero` never
//! ends. So a project file is read only when the place it really is, once
//! every link on the way is followed, is a regular file inside the project,
//! and only up to a size no instruction file comes near.
//!
//! A link that stays inside the project is followed: `CLAUDE.md` linked to
//! `AGENTS.md` is how many repositories keep one set of instructions.

use agiworkforce_sandbox_policy::NotRead;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// The most a project's instruction, rule or skill file may hold. A larger
/// one is not read at all, since half of a file is not what its author wrote.
pub const PROJECT_TEXT_MAX_BYTES: u64 = 1024 * 1024;

/// Files already reported as not read, so a file that is refused at every
/// turn is said so once.
static REPORTED: Mutex<Option<HashSet<PathBuf>>> = Mutex::new(None);

fn report_once(path: &Path, why: &str) {
    let mut reported = REPORTED
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if reported
        .get_or_insert_with(HashSet::new)
        .insert(path.to_path_buf())
    {
        tracing::warn!(path = %path.display(), "a project file was not read: {why}");
    }
}

/// Why a file that leads to a credential file, or is named like one, was
/// not loaded. Each reason here reads after "`<file>` was not loaded:".
pub const UNREADABLE_FILE_NOTICE: &str = "it is a credential file, or leads to one";
const OUTSIDE_THE_PROJECT: &str = "it leads outside its project";
const NOT_A_REGULAR_FILE: &str = "it is not a regular file";
const TOO_LARGE: &str = "it is larger than 1 MiB";
const NOT_READABLE: &str = "it could not be opened or read";
const NOT_TEXT: &str = "it is not UTF-8 text";

/// The bytes of `path`, a file the project at `root` supplies: `Ok(None)`
/// when nothing is there, and the reason in plain words when it is there and
/// was not read, for a caller that tells its user why a rule, a skill or an
/// instruction file was not loaded. The sandbox-policy crate does the
/// reading and holds the file to the project, and to the credential-file
/// policy the file tools apply, so an instruction file linked to `.env` is
/// refused as `read_file` refuses `.env`.
pub fn try_read_bytes_within(root: &Path, path: &Path) -> Result<Option<Vec<u8>>, &'static str> {
    match agiworkforce_sandbox_policy::read_file_within(
        root,
        path,
        PROJECT_TEXT_MAX_BYTES,
        &crate::path_security::names_a_credential_file,
    ) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(NotRead::Missing) => Ok(None),
        Err(NotRead::Outside) => Err(OUTSIDE_THE_PROJECT),
        Err(NotRead::Credential) => Err(UNREADABLE_FILE_NOTICE),
        Err(NotRead::NotRegular) => Err(NOT_A_REGULAR_FILE),
        Err(NotRead::TooLarge) => Err(TOO_LARGE),
        Err(NotRead::Unreadable) => Err(NOT_READABLE),
    }
}

/// [`try_read_bytes_within`] as text. A file that is not UTF-8 is refused.
pub fn try_read_within(root: &Path, path: &Path) -> Result<Option<String>, &'static str> {
    try_read_bytes_within(root, path)?
        .map(|bytes| String::from_utf8(bytes).map_err(|_| NOT_TEXT))
        .transpose()
}

/// The bytes of `path`, a file the project at `root` supplies, or `None`
/// when it is not there or was not read ([`try_read_bytes_within`]). A file
/// that is simply absent is nothing to report, and every refusal is logged
/// once for that file.
pub fn read_bytes_within(root: &Path, path: &Path) -> Option<Vec<u8>> {
    match try_read_bytes_within(root, path) {
        Ok(bytes) => bytes,
        Err(why) => {
            report_once(path, why);
            None
        }
    }
}

/// [`read_bytes_within`] as text. A file that is not UTF-8 is not read.
pub fn read_within(root: &Path, path: &Path) -> Option<String> {
    String::from_utf8(read_bytes_within(root, path)?).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_project_file_is_read_where_it_really_is_and_only_inside_the_project() {
        let project = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(project.path().join("AGENTS.md"), "the rules").unwrap();
        std::fs::write(outside.path().join("id_rsa"), "a private key").unwrap();

        assert_eq!(
            read_within(project.path(), &project.path().join("AGENTS.md")).as_deref(),
            Some("the rules")
        );
        assert_eq!(
            read_within(project.path(), &project.path().join("missing.md")),
            None
        );
        assert_eq!(
            read_within(project.path(), &outside.path().join("id_rsa")),
            None,
            "a path outside the project was read as the project's"
        );
        assert_eq!(
            read_within(project.path(), project.path()),
            None,
            "a folder was read as a file"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_link_is_followed_inside_the_project_and_never_out_of_it() {
        use std::os::unix::fs::symlink;

        let project = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(project.path().join("AGENTS.md"), "the rules").unwrap();
        std::fs::write(outside.path().join("id_rsa"), "a private key").unwrap();
        std::fs::create_dir(project.path().join(".agiworkforce")).unwrap();

        symlink("AGENTS.md", project.path().join("CLAUDE.md")).unwrap();
        assert_eq!(
            read_within(project.path(), &project.path().join("CLAUDE.md")).as_deref(),
            Some("the rules"),
            "one set of instructions under two names stopped working"
        );

        let planted = project.path().join(".agiworkforce").join("instructions.md");
        symlink(outside.path().join("id_rsa"), &planted).unwrap();
        assert_eq!(
            read_within(project.path(), &planted),
            None,
            "a committed link handed out a file from outside the project"
        );

        let folder = project.path().join("rules");
        symlink(outside.path(), &folder).unwrap();
        assert_eq!(
            read_within(project.path(), &folder.join("id_rsa")),
            None,
            "a linked folder handed out a file from outside the project"
        );

        let endless = project.path().join("endless.md");
        symlink("/dev/zero", &endless).unwrap();
        assert_eq!(read_within(project.path(), &endless), None);
    }

    #[cfg(unix)]
    #[test]
    fn a_file_that_is_or_leads_to_a_credential_file_is_refused_and_says_why() {
        use std::os::unix::fs::symlink;

        let project = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let root = project.path();
        std::fs::create_dir_all(root.join(".agiworkforce/rules")).unwrap();
        std::fs::write(root.join(".env"), "TOKEN=EXAMPLE").unwrap();
        std::fs::write(root.join("AGENTS.md"), "the rules").unwrap();
        std::fs::write(outside.path().join("id_rsa"), "a private key").unwrap();
        let rule = root.join(".agiworkforce/rules/a.md");
        symlink("../../.env", &rule).unwrap();

        assert_eq!(
            try_read_within(root, &rule),
            Err(UNREADABLE_FILE_NOTICE),
            "a rule linked to the project's own .env was loaded"
        );
        assert_eq!(read_within(root, &rule), None);
        assert_eq!(
            try_read_within(root, &root.join(".env")),
            Err(UNREADABLE_FILE_NOTICE)
        );
        assert_eq!(
            try_read_within(root, &root.join("AGENTS.md")),
            Ok(Some("the rules".to_string()))
        );
        assert_eq!(try_read_within(root, &root.join("missing.md")), Ok(None));
        assert_eq!(
            try_read_within(root, &outside.path().join("id_rsa")),
            Err(OUTSIDE_THE_PROJECT)
        );
        assert_eq!(try_read_within(root, root), Err(NOT_A_REGULAR_FILE));
    }

    #[test]
    fn a_file_larger_than_any_instruction_file_is_not_read() {
        let project = tempfile::tempdir().unwrap();
        let large = project.path().join("large.md");
        std::fs::write(&large, vec![b'x'; PROJECT_TEXT_MAX_BYTES as usize + 1]).unwrap();
        assert_eq!(read_within(project.path(), &large), None);

        let full = project.path().join("full.md");
        std::fs::write(&full, vec![b'x'; PROJECT_TEXT_MAX_BYTES as usize]).unwrap();
        assert_eq!(
            read_within(project.path(), &full).map(|text| text.len()),
            Some(PROJECT_TEXT_MAX_BYTES as usize)
        );
    }
}
