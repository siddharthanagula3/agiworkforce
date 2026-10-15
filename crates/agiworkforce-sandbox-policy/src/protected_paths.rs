//! The project paths that choose what runs on this machine.
//!
//! Whatever rewrites one of these decides what the host runs later, outside
//! any sandbox: git reads hooks and configuration from its metadata, AGI
//! surfaces read policy, commands, the worktree setup script and MCP servers
//! from the project's configuration, and hook managers run what their folders
//! and files name on the next commit.
//!
//! This is the one definition. The sandbox profiles deny writes to every
//! entry through it, and an agent's file edit that targets one is never
//! pre-approved by a mode that accepts edits. `isProtectedWorkspacePath` in
//! the local-runtime contract mirrors the same entries for the desktop shell.
//!
//! `package.json` is not here: its `scripts` choose what runs too, but they
//! are one key in a file that is edited for many other reasons, and a path
//! cannot tell those edits apart.

use std::path::{Component, Path, PathBuf};

/// Git's own directory, or the file that names it in a linked worktree or a
/// submodule.
pub const GIT_METADATA_ENTRY: &str = ".git";

/// The project files AGI surfaces read hooks, policy, commands, the worktree
/// setup script and MCP servers from.
pub const PROJECT_CONFIG_PATHS: [&str; 4] =
    [".agiworkforce", ".mcp.json", "mcp.json", ".vscode/mcp.json"];

/// Where hook managers keep what they run on a commit, a push or a checkout.
/// A sandbox denies writes here as it does to `.git`: a hook manager's
/// install cannot finish under one anyway, since it has to write git's
/// metadata, so it is rerun with an approved escalation.
///
/// Each manager's names are the ones its own documentation lists, read on
/// 2026-10-11:
/// - husky: the `.husky` folder, and the files version 4 read its hooks
///   from.
/// - `.githooks`, the folder a repository points `core.hooksPath` at.
/// - lefthook: its main file as YAML, TOML, JSON or JSONC, under its plain
///   name, with a leading dot or inside `.config`, and the `lefthook-local`
///   file of each kind that it merges over the main one. The local file
///   inside `.config` is listed by the same rule; the documentation does not
///   say whether lefthook looks there.
/// - pre-commit: its one file.
/// - overcommit: its file, the local file it merges over it, and the folder
///   its repository-specific hooks load from.
///
/// Not here: `package.json`, where husky 4 and simple-git-hooks also read a
/// key, and simple-git-hooks' own files, which change nothing until its
/// installer is run again and writes git's metadata.
pub const HOOK_MANAGER_PATHS: [&str; 42] = [
    ".husky",
    ".huskyrc",
    ".huskyrc.json",
    ".huskyrc.yaml",
    ".huskyrc.yml",
    ".huskyrc.js",
    "husky.config.js",
    ".githooks",
    "lefthook.yml",
    "lefthook.yaml",
    "lefthook.toml",
    "lefthook.json",
    "lefthook.jsonc",
    ".lefthook.yml",
    ".lefthook.yaml",
    ".lefthook.toml",
    ".lefthook.json",
    ".lefthook.jsonc",
    ".config/lefthook.yml",
    ".config/lefthook.yaml",
    ".config/lefthook.toml",
    ".config/lefthook.json",
    ".config/lefthook.jsonc",
    "lefthook-local.yml",
    "lefthook-local.yaml",
    "lefthook-local.toml",
    "lefthook-local.json",
    "lefthook-local.jsonc",
    ".lefthook-local.yml",
    ".lefthook-local.yaml",
    ".lefthook-local.toml",
    ".lefthook-local.json",
    ".lefthook-local.jsonc",
    ".config/lefthook-local.yml",
    ".config/lefthook-local.yaml",
    ".config/lefthook-local.toml",
    ".config/lefthook-local.json",
    ".config/lefthook-local.jsonc",
    ".pre-commit-config.yaml",
    ".overcommit.yml",
    ".local-overcommit.yml",
    ".git-hooks",
];

/// Folders whose files a surface loads as trusted, always-on instructions
/// for every later session in a project: rules, and the commands offered as
/// slash commands. An agent's file tools refuse to write below one, and a
/// sandboxed command is denied the same folders, so the two cannot disagree.
/// Reading them is never refused.
pub const AGENT_INSTRUCTION_PATHS: [&str; 4] = [
    ".agiworkforce/rules",
    ".agiworkforce/commands",
    ".claude/commands",
    ".agiworkforce/prompts/claude",
];

/// Folders other tools keep files of their own in: `.config`, where lefthook
/// is one tenant among many, and `.claude`, which holds another agent's
/// settings beside the commands loaded as instructions. A protected entry
/// inside one has that parent held in place at a workspace's top folder
/// only, and never made read-only whole: held at any depth, no sandboxed
/// command could make a `.config` folder anywhere in a project.
pub(crate) const SHARED_PARENT_FOLDERS: [&str; 2] = [".config", ".claude"];

/// Every protected entry, as a path relative to a project folder.
pub fn protected_project_entries() -> impl Iterator<Item = &'static str> {
    std::iter::once(GIT_METADATA_ENTRY)
        .chain(PROJECT_CONFIG_PATHS)
        .chain(HOOK_MANAGER_PATHS)
}

/// Folder names that hold installed dependencies or build output. A sandbox
/// profile does not deny a protected name inside one: published packages
/// ship `.pre-commit-config.yaml`, `.githooks`, `.husky`, `lefthook.yml` and
/// even `mcp.json` in their archives, so denying them there fails ordinary
/// installs, and nothing reads them there. A hook manager's files run only
/// from the top of a git repository, and a project's MCP file loads only at
/// the top of a session's project, behind a consent pinned to its contents.
/// The approval gate does not use this list: an agent's own edit of such a
/// file asks wherever it is.
///
/// What each is: `node_modules`, `bower_components`, `.pnpm-store` and
/// `.yarn` for JavaScript; `site-packages`, `.venv` and `venv` for Python;
/// `vendor` for Go, PHP, Ruby and vendored crates; `target` and `.cargo` for
/// Rust, where packaging unpacks a crate under `target` and a project-local
/// `CARGO_HOME` holds the registry; `.gradle` for the JVM; `Pods` for
/// CocoaPods; `.terraform` and `.build`, where Terraform and SwiftPM check
/// out each dependency's whole repository.
pub const DEPENDENCY_TREE_NAMES: [&str; 14] = [
    "node_modules",
    "site-packages",
    ".venv",
    "venv",
    "vendor",
    "target",
    ".pnpm-store",
    ".yarn",
    ".cargo",
    ".gradle",
    "Pods",
    "bower_components",
    ".terraform",
    ".build",
];

/// The entries a sandbox profile denies by name below a workspace: all but
/// git's own, which [`crate::wrap::git_metadata_paths`] names instead, since
/// a test suite may create a repository of its own inside a project.
pub(crate) fn named_project_entries() -> impl Iterator<Item = &'static str> {
    PROJECT_CONFIG_PATHS.into_iter().chain(HOOK_MANAGER_PATHS)
}

/// The instruction folders a sandbox profile has to name itself: the ones
/// that are not already inside a protected entry, as `.agiworkforce/rules` is
/// inside `.agiworkforce`.
pub(crate) fn instruction_folders_outside_protected_entries() -> impl Iterator<Item = &'static str>
{
    AGENT_INSTRUCTION_PATHS.into_iter().filter(|folder| {
        !named_project_entries().any(|entry| {
            folder
                .strip_prefix(entry)
                .is_some_and(|rest| rest.starts_with('/'))
        })
    })
}

/// True when `relative`, a path inside a project, is a protected entry or
/// lies beneath one, at any depth: a nested repository or package reads the
/// same names from its own folder. Either separator is accepted, and a name
/// is compared as a filesystem that ignores case would compare it
/// ([`folded`]).
pub fn is_protected_relative_path(relative: &str) -> bool {
    let segments: Vec<String> = relative
        .split(['/', '\\'])
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .map(folded)
        .collect();
    names_a_protected_entry(&segments)
}

/// `name` as a filesystem that ignores case reads it, so that two spellings
/// of one file compare equal here as they do on disk.
///
/// Lower-casing alone is not what such a filesystem does. APFS folds case
/// the full Unicode way: `.mcp.json` spelled with a long s (U+017F) opens
/// `.mcp.json`, a Kelvin sign (U+212A) is a `k`, and the `fi` ligature
/// (U+FB01) in `.pre-commit-config.yaml` is `fi`, each checked on an APFS
/// volume. Upper-casing and then lower-casing gives those answers, repeated
/// until the name stops changing: a capital sharp s (U+1E9E) is a sharp s
/// after one round and `ss` after two, and APFS opens `.ssh` for it. That
/// covers every character an APFS volume reads as ASCII letters, which are
/// the long s, the Kelvin sign, the sharp s in either case and the seven
/// Latin ligatures U+FB00 to U+FB06. Two more
/// things are folded that APFS keeps apart, so that a name is asked about
/// rather than missed on another filesystem: fullwidth letters and
/// punctuation become their ASCII forms, and the characters HFS+ leaves out
/// of a comparison, such as a zero-width joiner, are dropped. A dotless i
/// (U+0131) becomes `i` as a side effect.
///
/// Not covered, because no filesystem this runs on folds them: Windows short
/// names such as `MCP~1.JSO`, a trailing dot or space, an alternate data
/// stream after a colon, and compatibility forms other than fullwidth, such
/// as mathematical or circled letters.
pub fn folded(name: &str) -> String {
    let mut unfolded: String = name
        .chars()
        .filter(|character| !ignored_by_hfs(*character))
        .map(|character| match character {
            '\u{ff01}'..='\u{ff5e}' => {
                char::from_u32(u32::from(character) - FULLWIDTH_OFFSET).unwrap_or(character)
            }
            other => other,
        })
        .collect();
    for _ in 0..FOLD_ROUNDS {
        let next = unfolded.to_uppercase().to_lowercase();
        if next == unfolded {
            break;
        }
        unfolded = next;
    }
    unfolded
}

/// The most rounds of case mapping a name is given. Two settle every
/// character known to need more than one.
const FOLD_ROUNDS: usize = 4;

/// How far a fullwidth form sits above the ASCII character it stands for.
const FULLWIDTH_OFFSET: u32 = 0xfee0;

/// The characters HFS+ skips when it compares two names: zero-width joiners
/// and marks, the bidirectional controls, the deprecated format characters
/// and the byte-order mark.
fn ignored_by_hfs(character: char) -> bool {
    matches!(
        character,
        '\u{200c}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{206a}'..='\u{206f}' | '\u{feff}'
    )
}

fn names_a_protected_entry(segments: &[String]) -> bool {
    protected_project_entries().any(|entry| {
        let entry: Vec<&str> = entry.split('/').collect();
        segments
            .windows(entry.len())
            .any(|window| window.iter().zip(&entry).all(|(have, want)| have == want))
    })
}

/// True when writing `target` would change a protected path of the project
/// at `root`. A relative `target` is taken from `root`. The path is checked
/// as written and again where a write to it would land
/// ([`crate::resolve::landing_path`]), so neither a link to a hook, a hook
/// reached through a link, nor a link whose target does not exist yet gets
/// past, and the git directories a linked worktree or a submodule keeps
/// outside its checkout count as well. A path whose links never settle is
/// protected: nothing can say where a write to it lands.
///
/// Where a write lands is worked out from the path exactly as it was
/// written. Taking the `..` out of it first, as text, reads `lnk/../config`
/// as `config` when `lnk` is a link to `.git/info` and the kernel writes
/// `.git/config`. The spelling with its dots taken out is judged too, and can
/// only add a path to what is protected.
pub fn is_protected_project_path(root: &Path, target: &Path) -> bool {
    let as_written = if target.is_absolute() {
        target.to_path_buf()
    } else {
        root.join(target)
    };
    let Ok(resolved) = crate::resolve::landing_path(&as_written) else {
        return true;
    };
    let written = without_dots(&as_written);
    let roots = [
        without_dots(root),
        crate::resolve::landing_path(root).unwrap_or_else(|_| without_dots(root)),
    ];
    let git_metadata = crate::wrap::git_metadata_paths(root);
    [written, resolved].iter().any(|path| {
        let segments = roots
            .iter()
            .find_map(|root| segments_below(root, path))
            .unwrap_or_else(|| lowered_segments(path));
        names_a_protected_entry(&segments)
            || git_metadata
                .iter()
                .any(|metadata| segments_below(metadata, path).is_some())
    })
}

fn lowered_segments(path: &Path) -> Vec<String> {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(name) => Some(folded(&name.to_string_lossy())),
            _ => None,
        })
        .collect()
}

/// The segments of `path` below `base`, compared without regard to case, or
/// `None` when `path` is not inside it.
fn segments_below(base: &Path, path: &Path) -> Option<Vec<String>> {
    let base = lowered_segments(base);
    let path = lowered_segments(path);
    path.starts_with(&base).then(|| path[base.len()..].to_vec())
}

/// `path` with every `.` dropped and every `..` applied, without touching the
/// filesystem.
fn without_dots(path: &Path) -> PathBuf {
    let mut cleaned = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                cleaned.pop();
            }
            other => cleaned.push(other),
        }
    }
    cleaned
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agi-protected-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("scratch folder");
        dir
    }

    #[test]
    fn every_entry_is_protected_at_any_depth_and_in_any_case() {
        for entry in protected_project_entries() {
            assert!(is_protected_relative_path(entry), "{entry}");
            assert!(
                is_protected_relative_path(&format!("packages/web/{entry}/inner")),
                "{entry} below a package"
            );
            assert!(
                is_protected_relative_path(&entry.to_uppercase()),
                "{entry} in capitals"
            );
        }
        assert!(is_protected_relative_path(".git\\hooks\\pre-commit"));
        assert!(is_protected_relative_path("./.husky/pre-push"));
    }

    #[test]
    fn a_name_the_filesystem_reads_as_a_protected_one_is_protected() {
        for spelling in [
            ".mcp.j\u{17f}on",
            ".hu\u{17f}ky/pre-commit",
            ".v\u{17f}code/mcp.json",
            ".hus\u{212a}y",
            ".pre-commit-con\u{fb01}g.yaml",
            ".g\u{131}thooks/pre-push",
            ".\u{ff4d}cp.json",
            "\u{ff0e}git/config",
            ".hu\u{200c}sky/pre-commit",
            ".g\u{feff}it/hooks/pre-commit",
            "packages/app/.MCP.J\u{17f}ON",
        ] {
            assert!(is_protected_relative_path(spelling), "{spelling:?}");
            assert!(
                is_protected_project_path(Path::new("/project"), Path::new(spelling)),
                "{spelling:?} below a project"
            );
        }
        for spelling in [
            "src/ma\u{17f}on.rs",
            "docs/\u{ff4d}cp.md",
            ".gi\u{200c}tignore",
        ] {
            assert!(!is_protected_relative_path(spelling), "{spelling:?}");
        }
    }

    #[test]
    fn every_file_a_hook_manager_reads_is_protected() {
        for path in [
            "lefthook.toml",
            "lefthook.json",
            "lefthook.jsonc",
            ".lefthook.toml",
            ".config/lefthook.yml",
            ".config/lefthook.jsonc",
            "lefthook-local.yml",
            "lefthook-local.toml",
            ".lefthook-local.json",
            ".config/lefthook-local.yaml",
            "packages/app/lefthook-local.yml",
            "LEFTHOOK-LOCAL.YML",
            ".huskyrc",
            ".huskyrc.json",
            ".huskyrc.js",
            "husky.config.js",
            ".overcommit.yml",
            ".local-overcommit.yml",
            ".git-hooks/pre_commit/check.rb",
        ] {
            assert!(is_protected_relative_path(path), "{path}");
            assert!(
                is_protected_project_path(Path::new("/project"), Path::new(path)),
                "{path} below a project"
            );
        }
        for path in [
            ".config/nextest.toml",
            ".config/dotnet-tools.json",
            "lefthook.md",
            "docs/lefthook-local.yml.txt",
            "husky.config.ts.bak",
            ".simple-git-hooks.json",
        ] {
            assert!(!is_protected_relative_path(path), "{path}");
        }
        let distinct: std::collections::BTreeSet<&str> = HOOK_MANAGER_PATHS.into_iter().collect();
        assert_eq!(distinct.len(), HOOK_MANAGER_PATHS.len());
    }

    #[test]
    fn a_sandbox_names_only_the_instruction_folders_no_protected_entry_holds() {
        assert_eq!(
            instruction_folders_outside_protected_entries().collect::<Vec<_>>(),
            vec![".claude/commands"]
        );
        for folder in AGENT_INSTRUCTION_PATHS {
            assert!(
                !folder.starts_with('/') && !folder.ends_with('/'),
                "{folder}"
            );
        }
    }

    #[test]
    fn ordinary_project_files_are_not_protected() {
        for path in [
            "src/a.rs",
            "package.json",
            "docs/git/notes.md",
            ".gitignore",
            ".github/workflows/ci.yml",
            ".vscode/settings.json",
            "src/mcp.json.bak",
        ] {
            assert!(!is_protected_relative_path(path), "{path}");
        }
    }

    #[test]
    fn a_path_is_judged_inside_its_project_not_by_where_the_project_sits() {
        let home = scratch("placement");
        let project = home
            .join(".agiworkforce")
            .join("worktrees")
            .join("0a1b2c3d");
        std::fs::create_dir_all(project.join("src")).expect("project");

        assert!(!is_protected_project_path(&project, Path::new("src/a.rs")));
        assert!(is_protected_project_path(
            &project,
            Path::new(".GIT/hooks/pre-commit")
        ));
        assert!(is_protected_project_path(
            &project,
            Path::new("src/../.mcp.json")
        ));
        assert!(is_protected_project_path(
            &project,
            &project.join(".husky").join("pre-commit")
        ));
        let _ = std::fs::remove_dir_all(home);
    }

    #[cfg(unix)]
    #[test]
    fn a_link_into_a_protected_path_and_a_protected_name_that_is_a_link_both_count() {
        let project = scratch("links");
        let root = project.as_path();
        std::fs::create_dir_all(root.join(".git").join("hooks")).expect("hooks");
        std::os::unix::fs::symlink(root.join(".git").join("hooks"), root.join("scripts"))
            .expect("link to the hooks");
        std::fs::write(root.join("servers.json"), "{}").expect("servers");
        std::os::unix::fs::symlink(root.join("servers.json"), root.join(".mcp.json"))
            .expect("protected name as a link");

        assert!(
            is_protected_project_path(root, Path::new("scripts/pre-commit")),
            "a hook reached through an ordinary-looking link was not protected"
        );
        assert!(is_protected_project_path(root, Path::new(".mcp.json")));
        assert!(!is_protected_project_path(root, Path::new("src/a.rs")));
        let _ = std::fs::remove_dir_all(&project);
    }

    #[cfg(unix)]
    #[test]
    fn a_link_whose_target_does_not_exist_yet_is_judged_by_that_target() {
        let project = scratch("dangling");
        let root = project.as_path();
        std::fs::create_dir_all(root.join(".git")).expect("git folder");
        std::os::unix::fs::symlink(".git/hooks/pre-commit", root.join("notes.txt"))
            .expect("dangling leaf");
        std::os::unix::fs::symlink(root.join(".git/hooks"), root.join("scripts"))
            .expect("dangling folder");
        std::os::unix::fs::symlink("docs/missing.md", root.join("readme.txt"))
            .expect("dangling link to an ordinary file");

        assert!(
            is_protected_project_path(root, Path::new("notes.txt")),
            "a write through the link would create the hook"
        );
        assert!(
            is_protected_project_path(root, Path::new("scripts/pre-push")),
            "a link in the middle of the path was read as an ordinary folder"
        );
        assert!(!is_protected_project_path(root, Path::new("readme.txt")));
        let _ = std::fs::remove_dir_all(&project);
    }

    /// The kernel follows a link and then goes up from where the link led.
    /// Taking the `..` out as text first goes up from where the link sits.
    #[cfg(unix)]
    #[test]
    fn dots_after_a_link_are_followed_from_where_the_link_leads() {
        let project = scratch("dots-after-links");
        let root = project.as_path();
        std::fs::create_dir_all(root.join(".git/info")).expect("git info");
        std::fs::create_dir_all(root.join(".git/hooks/deep")).expect("hooks");
        std::fs::create_dir_all(root.join(".husky/_")).expect("husky");
        std::fs::create_dir_all(root.join("src")).expect("src");
        std::os::unix::fs::symlink(".git/info", root.join("lnk")).expect("link into git");
        std::os::unix::fs::symlink(".git/hooks/deep", root.join("a")).expect("deep link");
        std::os::unix::fs::symlink(".husky/_", root.join("h")).expect("link into husky");
        std::os::unix::fs::symlink("second", root.join("first")).expect("link to a link");
        std::os::unix::fs::symlink(".git", root.join("second")).expect("link to git");
        std::os::unix::fs::symlink("later/inner", root.join("soon")).expect("dangling link");

        for target in [
            "lnk/../config",
            "a/../../config",
            "h/../pre-commit",
            "first/config",
            "first/hooks/../config",
            "src/../lnk/../config",
        ] {
            assert!(
                is_protected_project_path(root, Path::new(target)),
                "{target} is written inside a protected folder"
            );
        }
        for target in [
            "src/../notes.txt",
            "soon/../notes.txt",
            "lnk/../../notes.txt",
        ] {
            assert!(
                !is_protected_project_path(root, Path::new(target)),
                "{target} is an ordinary file"
            );
        }
        let _ = std::fs::remove_dir_all(&project);
    }

    #[cfg(unix)]
    #[test]
    fn a_loop_of_links_is_protected_because_nothing_says_where_it_lands() {
        let project = scratch("loop");
        let root = project.as_path();
        std::os::unix::fs::symlink("b", root.join("a")).expect("a to b");
        std::os::unix::fs::symlink("a", root.join("b")).expect("b to a");

        assert!(is_protected_project_path(root, Path::new("a")));
        assert!(is_protected_project_path(root, Path::new("a/inner.txt")));
        let _ = std::fs::remove_dir_all(&project);
    }

    /// Every character an APFS volume that ignores case reads as ASCII
    /// letters. The capital sharp s is the one that one round of case mapping
    /// leaves short: it is a sharp s after the first and `ss` after the
    /// second.
    #[test]
    fn the_fold_settles_on_what_the_volume_opens() {
        for (spelled, opens) in [
            ("\u{17f}", "s"),
            ("\u{212a}", "k"),
            ("\u{df}", "ss"),
            ("\u{1e9e}", "ss"),
            ("\u{fb00}", "ff"),
            ("\u{fb01}", "fi"),
            ("\u{fb02}", "fl"),
            ("\u{fb03}", "ffi"),
            ("\u{fb04}", "ffl"),
            ("\u{fb05}", "st"),
            ("\u{fb06}", "st"),
        ] {
            let folded_name = folded(&format!(".P{spelled}Q"));
            assert_eq!(folded_name, format!(".p{opens}q"), "{spelled:?}");
            assert_eq!(folded(&folded_name), folded_name, "{spelled:?} settles");
        }
        assert_eq!(
            "\u{1e9e}".to_uppercase().to_lowercase(),
            "\u{df}",
            "one round leaves the capital sharp s a sharp s"
        );
        assert_eq!(
            folded(".\u{1e9e}h"),
            ".ssh",
            "which the volume opens for it"
        );
    }

    #[test]
    fn no_dependency_tree_name_is_a_protected_entry() {
        for name in DEPENDENCY_TREE_NAMES {
            assert!(
                !is_protected_relative_path(name),
                "{name} cannot be both skipped and protected"
            );
            assert!(!name.contains('/'), "{name} is matched as one folder name");
            assert!(
                is_protected_relative_path(&format!("{name}/pkg/.husky/pre-commit")),
                "the approval gate still asks inside {name}"
            );
        }
    }

    #[test]
    fn the_entries_a_sandbox_names_are_all_but_gits_own() {
        let named: Vec<&str> = named_project_entries().collect();
        let every: Vec<&str> = protected_project_entries().collect();
        assert_eq!(named, every[1..]);
        assert_eq!(every[0], GIT_METADATA_ENTRY);
    }
}
