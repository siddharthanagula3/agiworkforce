//! What a command does to the filesystem, separately from how risky it is.
//!
//! [`super::CommandSafety`] answers "how hard should the user think before
//! saying yes". It cannot answer "what will this touch": `cat` and `tee` are
//! both `Unknown` to a rule table that only knows an allowlist, yet one reads
//! and the other overwrites. This taxonomy answers the second question, so an
//! approval prompt can name the effect instead of leaving the user to infer it
//! from the command line.
//!
//! The variants are ordered by how much caution they deserve and a compound
//! command takes the maximum, so one writing segment in a chain of reads is
//! reported as a write, and one segment nobody models is reported as unknown.

use super::approval::strip_path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum FilesystemEffect {
    /// Touches no path: `echo`, `pwd`, `sleep`.
    None,
    /// Opens paths for reading only.
    Read,
    /// Changes permissions, ownership or timestamps, not contents.
    Metadata,
    /// Creates or overwrites file contents.
    Write,
    /// Removes paths.
    Delete,
    /// Not modelled. Treated as the most cautious verdict, never as `None`.
    Unknown,
}

impl FilesystemEffect {
    /// One phrase for an approval prompt, in the same voice as the other
    /// details a user reads before deciding.
    pub(crate) fn describe(self) -> &'static str {
        match self {
            FilesystemEffect::None => "Filesystem: touches no files",
            FilesystemEffect::Read => "Filesystem: reads files",
            FilesystemEffect::Metadata => "Filesystem: changes file permissions or ownership",
            FilesystemEffect::Write => "Filesystem: creates or overwrites files",
            FilesystemEffect::Delete => "Filesystem: deletes files",
            FilesystemEffect::Unknown => "Filesystem: effect not known for this command",
        }
    }
}

const NO_EFFECT: &[&str] = &[
    "alias", "basename", "clear", "date", "dirname", "echo", "false", "hostname", "printenv",
    "printf", "pwd", "seq", "sleep", "true", "uname", "whoami", "yes",
];

const READS: &[&str] = &[
    "awk",
    "bat",
    "cat",
    "cksum",
    "cmp",
    "comm",
    "cut",
    "diff",
    "du",
    "egrep",
    "fgrep",
    "file",
    "find",
    "grep",
    "head",
    "hexdump",
    "jq",
    "less",
    "ls",
    "md5sum",
    "more",
    "nl",
    "od",
    "paste",
    "readlink",
    "realpath",
    "rg",
    "sha1sum",
    "sha256sum",
    "sort",
    "stat",
    "strings",
    "tail",
    "tr",
    "tree",
    "uniq",
    "wc",
    "which",
    "xxd",
];

const METADATA: &[&str] = &["chflags", "chgrp", "chmod", "chown", "touch", "xattr"];

const WRITES: &[&str] = &[
    "cp", "install", "ln", "mkdir", "mv", "patch", "rsync", "tee", "truncate", "unzip", "zip",
];

const DELETES: &[&str] = &["rm", "rmdir", "shred", "srm", "unlink"];

/// The strongest filesystem effect any segment of `command` can have.
pub(crate) fn classify_filesystem_effect(command: &str) -> FilesystemEffect {
    super::split_segments(command)
        .iter()
        .map(|segment| classify_segment(segment))
        .max()
        .unwrap_or(FilesystemEffect::None)
}

fn classify_segment(segment: &str) -> FilesystemEffect {
    let words: Vec<&str> = segment.split_whitespace().collect();
    let Some(first) = words.first() else {
        return FilesystemEffect::None;
    };
    let base = strip_path(first);
    let rest = &words[1..];

    let redirects = super::contains_unquoted_shell_redirection(segment) && segment.contains('>');

    let effect = match base {
        "find" => {
            if rest.contains(&"-delete") {
                FilesystemEffect::Delete
            } else if rest
                .iter()
                .any(|arg| matches!(*arg, "-exec" | "-execdir" | "-ok" | "-okdir"))
            {
                FilesystemEffect::Unknown
            } else {
                FilesystemEffect::Read
            }
        }
        "git" => match rest.first().copied() {
            Some("clean") => FilesystemEffect::Delete,
            Some("checkout") | Some("restore") | Some("apply") | Some("pull") | Some("merge")
            | Some("stash") | Some("reset") | Some("clone") => FilesystemEffect::Write,
            Some(_) => FilesystemEffect::Read,
            None => FilesystemEffect::Read,
        },
        "sed" => {
            if rest
                .iter()
                .any(|arg| *arg == "-i" || arg.starts_with("--in-place"))
            {
                FilesystemEffect::Write
            } else {
                FilesystemEffect::Read
            }
        }
        "dd" => {
            if rest.iter().any(|arg| arg.starts_with("of=")) {
                FilesystemEffect::Write
            } else {
                FilesystemEffect::Read
            }
        }
        "tar" => {
            if rest
                .iter()
                .any(|arg| *arg == "--extract" || (!arg.starts_with("--") && arg.contains('x')))
            {
                FilesystemEffect::Write
            } else {
                FilesystemEffect::Read
            }
        }
        "sort" => {
            if rest
                .iter()
                .any(|arg| *arg == "-o" || arg.starts_with("--output"))
            {
                FilesystemEffect::Write
            } else {
                FilesystemEffect::Read
            }
        }
        "xargs" => match super::xargs_payload(segment) {
            Some(payload) => classify_segment(&payload),
            None => FilesystemEffect::None,
        },
        _ if DELETES.contains(&base) => FilesystemEffect::Delete,
        _ if WRITES.contains(&base) => FilesystemEffect::Write,
        _ if METADATA.contains(&base) => FilesystemEffect::Metadata,
        _ if READS.contains(&base) => FilesystemEffect::Read,
        _ if NO_EFFECT.contains(&base) => FilesystemEffect::None,
        _ => FilesystemEffect::Unknown,
    };

    if redirects && effect < FilesystemEffect::Write {
        return FilesystemEffect::Write;
    }
    effect
}

#[cfg(test)]
mod tests {
    use super::{classify_filesystem_effect, FilesystemEffect};

    #[test]
    fn reads_writes_deletes_and_metadata_are_distinguished() {
        for (command, expected) in [
            ("echo hello", FilesystemEffect::None),
            ("cat src/main.rs", FilesystemEffect::Read),
            ("chmod 600 auth.json", FilesystemEffect::Metadata),
            ("cp a b", FilesystemEffect::Write),
            ("rm -rf build", FilesystemEffect::Delete),
        ] {
            assert_eq!(classify_filesystem_effect(command), expected, "{command}");
        }
    }

    #[test]
    fn a_compound_command_takes_the_strongest_effect_of_its_segments() {
        assert_eq!(
            classify_filesystem_effect("ls -la && cat README.md"),
            FilesystemEffect::Read
        );
        assert_eq!(
            classify_filesystem_effect("cat README.md && rm README.md"),
            FilesystemEffect::Delete
        );
        assert_eq!(
            classify_filesystem_effect("ls | wc -l"),
            FilesystemEffect::Read
        );
    }

    #[test]
    fn redirection_turns_a_read_into_a_write() {
        assert_eq!(
            classify_filesystem_effect("cat secrets.env > /tmp/copy"),
            FilesystemEffect::Write
        );
        assert_eq!(
            classify_filesystem_effect("echo done >> log.txt"),
            FilesystemEffect::Write
        );
        assert_eq!(
            classify_filesystem_effect("grep -r 'x' ."),
            FilesystemEffect::Read
        );
    }

    #[test]
    fn same_program_different_flags_lands_in_different_tiers() {
        assert_eq!(
            classify_filesystem_effect("sed -n 1,20p file"),
            FilesystemEffect::Read
        );
        assert_eq!(
            classify_filesystem_effect("sed -i s/a/b/ file"),
            FilesystemEffect::Write
        );
        assert_eq!(
            classify_filesystem_effect("find . -name '*.rs'"),
            FilesystemEffect::Read
        );
        assert_eq!(
            classify_filesystem_effect("find . -name '*.tmp' -delete"),
            FilesystemEffect::Delete
        );
        assert_eq!(
            classify_filesystem_effect("git log --oneline"),
            FilesystemEffect::Read
        );
        assert_eq!(
            classify_filesystem_effect("git clean -fd"),
            FilesystemEffect::Delete
        );
    }

    #[test]
    fn an_unmodelled_program_is_unknown_not_harmless() {
        assert_eq!(
            classify_filesystem_effect("some-vendor-tool --apply"),
            FilesystemEffect::Unknown
        );
        assert_eq!(
            classify_filesystem_effect("echo ok && some-vendor-tool"),
            FilesystemEffect::Unknown
        );
    }

    #[test]
    fn an_xargs_payload_carries_its_own_effect() {
        assert_eq!(
            classify_filesystem_effect("find . -name '*.log' | xargs rm"),
            FilesystemEffect::Delete
        );
        assert_eq!(
            classify_filesystem_effect("ls | xargs cat"),
            FilesystemEffect::Read
        );
    }
}
