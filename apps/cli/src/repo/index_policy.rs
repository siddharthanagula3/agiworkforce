use std::path::{Path, PathBuf};
use std::process::Command;

/// A file larger than this is a log or a dump, not source a reader would open.
pub const MAX_INDEXED_FILE_BYTES: u64 = 2 * 1024 * 1024;

/// Why a path stays out of the index. A class is a reason a user recognises,
/// so one answer explains a whole directory rather than a name at a time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum ExclusionClass {
    Credential,
    DependencyStore,
    VendorCache,
    BinaryArtifact,
    LargeLog,
    Ignored,
}

impl ExclusionClass {
    pub const ALL: &'static [ExclusionClass] = &[
        Self::Credential,
        Self::DependencyStore,
        Self::VendorCache,
        Self::BinaryArtifact,
        Self::LargeLog,
        Self::Ignored,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::Credential => "holds credentials",
            Self::DependencyStore => "dependency store",
            Self::VendorCache => "vendor cache",
            Self::BinaryArtifact => "binary artifact",
            Self::LargeLog => "large log",
            Self::Ignored => "ignored by .gitignore",
        }
    }

    /// Whether naming the file overrules the exclusion. Every other class is
    /// a judgement about usefulness that the user may overrule; this one is
    /// about what would leave the machine, and it is not theirs to waive by
    /// typing a path.
    pub fn survives_request(self) -> bool {
        matches!(self, Self::Credential)
    }

    /// Directory names that are this class wherever they appear.
    pub fn directories(self) -> Vec<&'static str> {
        EXCLUDED_DIRECTORIES
            .iter()
            .filter(|directory| directory.class == self)
            .map(|directory| directory.name)
            .collect()
    }

    /// File extensions that are this class whatever directory holds them.
    pub fn extensions(self) -> &'static [&'static str] {
        match self {
            Self::BinaryArtifact => &[
                "o", "a", "so", "dylib", "dll", "exe", "class", "pyc", "pyo", "wasm", "node",
                "bin", "obj", "lib", "pdb", "jar", "war", "zip", "gz", "bz2", "xz", "7z", "rar",
                "tar", "dmg", "iso", "png", "jpg", "jpeg", "gif", "webp", "ico", "mp4", "mov",
                "mp3", "wav", "woff", "woff2", "ttf", "otf", "pdf",
            ],
            Self::LargeLog => &["log"],
            _ => &[],
        }
    }
}

/// A directory the index does not take, and whether a checkout of its own can
/// legitimately live inside it. A vendored dependency is often its own
/// repository, so it is kept out of the index and still searched for one.
struct ExcludedDirectory {
    name: &'static str,
    class: ExclusionClass,
    may_hold_repository: bool,
}

const EXCLUDED_DIRECTORIES: &[ExcludedDirectory] = &[
    ExcludedDirectory {
        name: "node_modules",
        class: ExclusionClass::DependencyStore,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: "bower_components",
        class: ExclusionClass::DependencyStore,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: "site-packages",
        class: ExclusionClass::DependencyStore,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: ".venv",
        class: ExclusionClass::DependencyStore,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: "venv",
        class: ExclusionClass::DependencyStore,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: ".cargo",
        class: ExclusionClass::DependencyStore,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: ".gradle",
        class: ExclusionClass::DependencyStore,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: ".m2",
        class: ExclusionClass::DependencyStore,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: "vendor",
        class: ExclusionClass::DependencyStore,
        may_hold_repository: true,
    },
    ExcludedDirectory {
        name: "Pods",
        class: ExclusionClass::DependencyStore,
        may_hold_repository: true,
    },
    ExcludedDirectory {
        name: ".bundle",
        class: ExclusionClass::DependencyStore,
        may_hold_repository: true,
    },
    ExcludedDirectory {
        name: ".cache",
        class: ExclusionClass::VendorCache,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: ".turbo",
        class: ExclusionClass::VendorCache,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: ".parcel-cache",
        class: ExclusionClass::VendorCache,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: ".pytest_cache",
        class: ExclusionClass::VendorCache,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: ".mypy_cache",
        class: ExclusionClass::VendorCache,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: ".ruff_cache",
        class: ExclusionClass::VendorCache,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: ".pnpm-store",
        class: ExclusionClass::VendorCache,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: ".yarn",
        class: ExclusionClass::VendorCache,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: "__pycache__",
        class: ExclusionClass::VendorCache,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: "target",
        class: ExclusionClass::BinaryArtifact,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: "dist",
        class: ExclusionClass::BinaryArtifact,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: "build",
        class: ExclusionClass::BinaryArtifact,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: "out",
        class: ExclusionClass::BinaryArtifact,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: ".next",
        class: ExclusionClass::BinaryArtifact,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: ".output",
        class: ExclusionClass::BinaryArtifact,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: ".nuxt",
        class: ExclusionClass::BinaryArtifact,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: "coverage",
        class: ExclusionClass::BinaryArtifact,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: "obj",
        class: ExclusionClass::BinaryArtifact,
        may_hold_repository: false,
    },
    ExcludedDirectory {
        name: "logs",
        class: ExclusionClass::LargeLog,
        may_hold_repository: false,
    },
];

/// Every directory the index leaves out.
pub fn excluded_directory_names() -> Vec<&'static str> {
    let mut names: Vec<&'static str> = EXCLUDED_DIRECTORIES
        .iter()
        .map(|directory| directory.name)
        .collect();
    names.push(".git");
    names.sort_unstable();
    names.dedup();
    names
}

/// Directories a search for nested repositories does not walk into. Narrower
/// than the index's list: a vendored checkout is a repository worth reporting
/// even though its contents are not worth indexing.
pub fn scan_skipped_directory_names() -> Vec<&'static str> {
    let mut names: Vec<&'static str> = EXCLUDED_DIRECTORIES
        .iter()
        .filter(|directory| !directory.may_hold_repository)
        .map(|directory| directory.name)
        .collect();
    names.push(".git");
    names.sort_unstable();
    names.dedup();
    names
}

/// The class a path falls into, or `None` when it belongs in the index.
/// `size` is the file's length when it is known; a path is judged on its name
/// alone when it is not.
pub fn classify(relative: &Path, size: Option<u64>) -> Option<ExclusionClass> {
    if crate::sensitive_files::is_sensitive_file(&relative.to_string_lossy()) {
        return Some(ExclusionClass::Credential);
    }
    for component in relative.components() {
        let name = component.as_os_str().to_string_lossy();
        for class in ExclusionClass::ALL.iter().copied() {
            if class.directories().contains(&name.as_ref()) {
                return Some(class);
            }
        }
    }
    let extension = relative
        .extension()
        .map(|extension| extension.to_string_lossy().to_ascii_lowercase());
    if let Some(extension) = extension.as_deref() {
        for class in ExclusionClass::ALL.iter().copied() {
            if class.extensions().contains(&extension) {
                return Some(class);
            }
        }
    }
    if size.is_some_and(|size| size > MAX_INDEXED_FILE_BYTES) {
        return Some(ExclusionClass::LargeLog);
    }
    None
}

/// Paths `.gitignore` excludes, decided by git's own matcher rather than a
/// second implementation of those semantics.
pub fn ignored_by_git(root: &Path, paths: &[PathBuf]) -> Vec<PathBuf> {
    if paths.is_empty() {
        return Vec::new();
    }
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(root)
        .args(["check-ignore", "--no-index", "--stdin", "-z"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    let Ok(mut child) = command.spawn() else {
        return Vec::new();
    };
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        for path in paths {
            if write!(stdin, "{}\0", path.display()).is_err() {
                break;
            }
        }
    }
    let Ok(output) = child.wait_with_output() else {
        return Vec::new();
    };
    String::from_utf8_lossy(&output.stdout)
        .split('\0')
        .filter(|entry| !entry.is_empty())
        .map(PathBuf::from)
        .collect()
}

/// Whether the index takes this path, and why not when it does not.
/// `requested` is a path the user named: naming a file is a decision that the
/// index's own exclusions do not overrule.
pub fn index_decision(
    root: &Path,
    relative: &Path,
    size: Option<u64>,
    requested: bool,
) -> Option<ExclusionClass> {
    let class = classify(relative, size);
    if requested {
        return class.filter(|class| class.survives_request());
    }
    if let Some(class) = class {
        return Some(class);
    }
    let absolute = root.join(relative);
    (!ignored_by_git(root, &[absolute]).is_empty()).then_some(ExclusionClass::Ignored)
}

/// When each layer of the index is built. A large checkout is usable long
/// before any of them finish, which is the point of separating them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IndexTiming {
    /// Built up front, because nothing works without it.
    Eager,
    /// Built when a file is first read.
    Lazy,
    /// Kept current by applying changes rather than rebuilding.
    Incremental,
    /// Built only for the part of the tree that earns it.
    Selective,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IndexLayer {
    Metadata,
    Content,
    Symbols,
    Embeddings,
}

impl IndexLayer {
    pub fn label(self) -> &'static str {
        match self {
            Self::Metadata => "metadata",
            Self::Content => "content",
            Self::Symbols => "symbols",
            Self::Embeddings => "embeddings",
        }
    }

    pub fn timing(self) -> IndexTiming {
        match self {
            Self::Metadata => IndexTiming::Eager,
            Self::Content => IndexTiming::Lazy,
            Self::Symbols => IndexTiming::Incremental,
            Self::Embeddings => IndexTiming::Selective,
        }
    }

    /// No layer holds the session: a checkout is worked in while it indexes.
    pub fn blocks_session(self) -> bool {
        false
    }

    /// Why this layer is built the way it is, for the surface that reports
    /// indexing progress.
    pub fn rationale(self) -> &'static str {
        match self {
            Self::Metadata => "paths and sizes are what every other layer is keyed by",
            Self::Content => "reading every file up front costs more than reading the few that get opened",
            Self::Symbols => "a symbol table follows edits, and rebuilding it per edit would never finish",
            Self::Embeddings => "an exact search already answers most queries, and embedding a whole checkout rarely pays for itself",
        }
    }
}

pub const INDEX_LAYERS: &[IndexLayer] = &[
    IndexLayer::Metadata,
    IndexLayer::Content,
    IndexLayer::Symbols,
    IndexLayer::Embeddings,
];

/// How soon a path is indexed relative to the rest of the checkout. Lower
/// sorts first: what the user has open, then the package they are in, then
/// everything else.
pub fn index_priority(relative: &Path, scope: Option<&Path>, open_files: &[PathBuf]) -> u8 {
    if open_files.iter().any(|open| open == relative) {
        return 0;
    }
    match scope {
        Some(scope) if relative.starts_with(scope) => 1,
        _ => 2,
    }
}

/// The checkout's paths in the order the index should take them.
pub fn prioritized(
    paths: &[PathBuf],
    scope: Option<&Path>,
    open_files: &[PathBuf],
) -> Vec<PathBuf> {
    let mut ordered: Vec<PathBuf> = paths.to_vec();
    ordered.sort_by_key(|path| {
        (
            index_priority(path, scope, open_files),
            path.components().count(),
            path.clone(),
        )
    });
    ordered
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_exclusion_class_names_itself_and_keeps_something_out() {
        for class in ExclusionClass::ALL.iter().copied() {
            assert!(!class.label().is_empty(), "{class:?} has no label");
            match class {
                ExclusionClass::Ignored => {}
                ExclusionClass::Credential => assert_eq!(
                    classify(Path::new(".env"), Some(64)),
                    Some(ExclusionClass::Credential)
                ),
                _ => assert!(
                    !class.directories().is_empty() || !class.extensions().is_empty(),
                    "{class:?} excludes nothing"
                ),
            }
        }
    }

    /// The index keeps no credential list of its own: it asks the same policy
    /// `read_file` and the mention expander ask, so a pattern added there is
    /// kept out of the index the moment it exists.
    #[test]
    fn a_file_the_credential_policy_covers_is_never_indexed_however_it_is_reached() {
        for path in [
            ".env",
            ".env.local",
            "apps/web/.env.production",
            ".envrc",
            "config/secrets.json",
            "infra/id_rsa",
            "keys/id_ed25519",
            "certs/server.pem",
            "certs/client.p12",
            "private.key",
            ".aws/credentials",
            ".npmrc",
            ".netrc",
            "infra/terraform.tfstate",
        ] {
            assert!(
                crate::sensitive_files::is_sensitive_file(path),
                "{path} is not covered by the credential policy at all"
            );
            assert_eq!(
                classify(Path::new(path), Some(64)),
                Some(ExclusionClass::Credential),
                "{path} reached the index"
            );
        }
        for path in ["src/main.rs", "README.md", "environment.ts", "package.json"] {
            assert_eq!(
                classify(Path::new(path), Some(64)),
                None,
                "{path} was excluded as a credential file"
            );
        }
    }

    #[test]
    fn naming_a_credential_file_does_not_index_it_and_naming_any_other_exclusion_does() {
        let dir = tempfile::tempdir().expect("temp dir");
        let root = dir.path();
        for (path, requested_class) in [
            (".env", Some(ExclusionClass::Credential)),
            ("apps/web/.env.local", Some(ExclusionClass::Credential)),
            ("deploy/id_rsa", Some(ExclusionClass::Credential)),
            ("node_modules/react/index.js", None),
            ("target/debug/agi", None),
            ("assets/logo.png", None),
        ] {
            assert_eq!(
                index_decision(root, Path::new(path), Some(64), true),
                requested_class,
                "{path} was decided wrongly for a path the user named"
            );
            assert!(
                index_decision(root, Path::new(path), Some(64), false).is_some(),
                "{path} reached the index unasked"
            );
        }
        assert!(
            ExclusionClass::ALL
                .iter()
                .filter(|class| class.survives_request())
                .eq([ExclusionClass::Credential].iter()),
            "a class other than a credential file now overrules the user"
        );
    }

    #[test]
    fn a_dependency_store_a_vendor_cache_a_binary_and_a_large_log_are_all_kept_out() {
        let cases: &[(&str, Option<u64>, ExclusionClass)] = &[
            (
                "node_modules/react/index.js",
                None,
                ExclusionClass::DependencyStore,
            ),
            (
                "apps/web/node_modules/.bin/next",
                None,
                ExclusionClass::DependencyStore,
            ),
            (
                ".venv/lib/python3.12/os.py",
                None,
                ExclusionClass::DependencyStore,
            ),
            (".turbo/cache/abc.tar", None, ExclusionClass::VendorCache),
            ("src/__pycache__/mod.pyc", None, ExclusionClass::VendorCache),
            ("target/debug/agi", None, ExclusionClass::BinaryArtifact),
            ("assets/logo.png", None, ExclusionClass::BinaryArtifact),
            (
                "src/native/parser.wasm",
                None,
                ExclusionClass::BinaryArtifact,
            ),
            ("logs/server.txt", None, ExclusionClass::LargeLog),
            ("tmp/run.log", None, ExclusionClass::LargeLog),
            (
                "src/generated.ts",
                Some(MAX_INDEXED_FILE_BYTES + 1),
                ExclusionClass::LargeLog,
            ),
        ];
        for (path, size, expected) in cases {
            assert_eq!(
                classify(Path::new(path), *size),
                Some(*expected),
                "{path} was not classified as a {}",
                expected.label()
            );
        }
    }

    #[test]
    fn source_a_reader_would_open_stays_in_the_index() {
        for path in [
            "src/main.rs",
            "apps/web/app/page.tsx",
            "README.md",
            "docs/architecture.md",
            "Cargo.toml",
        ] {
            assert_eq!(
                classify(Path::new(path), Some(1024)),
                None,
                "{path} was excluded from the index"
            );
        }
    }

    #[test]
    fn one_classification_supplies_every_directory_a_walk_skips() {
        let names = excluded_directory_names();
        assert!(names.contains(&".git"));
        for class in ExclusionClass::ALL.iter().copied() {
            for directory in class.directories() {
                assert!(
                    names.contains(&directory),
                    "{directory} is excluded as a {} and missing from the list",
                    class.label()
                );
            }
        }
        let mut sorted = names.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted, names, "the exclusion list repeats or is unsorted");
    }

    #[test]
    fn a_vendored_checkout_is_kept_out_of_the_index_and_still_found_as_a_repository() {
        let indexed = excluded_directory_names();
        let walked = scan_skipped_directory_names();
        for name in ["vendor", "Pods", ".bundle"] {
            assert!(indexed.contains(&name), "{name} should not be indexed");
            assert!(
                !walked.contains(&name),
                "{name} can hold its own checkout and must still be searched"
            );
        }
        for name in ["node_modules", "target", ".turbo"] {
            assert!(indexed.contains(&name));
            assert!(walked.contains(&name), "{name} is never worth walking");
        }
        assert!(walked.len() < indexed.len());
    }

    #[test]
    fn an_ignored_file_is_excluded_until_the_user_names_it() {
        let dir = tempfile::tempdir().expect("temp dir");
        let root = dir.path();
        let run = |args: &[&str]| {
            Command::new("git")
                .arg("-C")
                .arg(root)
                .args(args)
                .output()
                .expect("git runs");
        };
        run(&["init", "-q", "-b", "main"]);
        std::fs::write(root.join(".gitignore"), "scratch.txt\n.env\n").unwrap();
        std::fs::write(root.join("scratch.txt"), "notes\n").unwrap();
        std::fs::write(root.join(".env"), "TOKEN=x\n").unwrap();
        std::fs::write(root.join("src.rs"), "fn main() {}\n").unwrap();

        let ignored = Path::new("scratch.txt");
        assert_eq!(
            index_decision(root, ignored, Some(8), false),
            Some(ExclusionClass::Ignored),
            "an ignored file reached the index"
        );
        assert_eq!(
            index_decision(root, ignored, Some(8), true),
            None,
            "the user named the file and was still refused it"
        );
        assert_eq!(
            index_decision(root, Path::new("src.rs"), Some(16), false),
            None
        );

        let credential = Path::new(".env");
        assert_eq!(
            index_decision(root, credential, Some(8), true),
            Some(ExclusionClass::Credential),
            "naming a credential file indexed it"
        );
    }

    #[test]
    fn every_index_layer_has_its_own_timing_and_none_of_them_holds_the_session() {
        let mut timings = Vec::new();
        for layer in INDEX_LAYERS.iter().copied() {
            assert!(!layer.label().is_empty());
            assert!(layer.rationale().len() > 20, "{layer:?} has no rationale");
            assert!(
                !layer.blocks_session(),
                "{} indexing holds the session open",
                layer.label()
            );
            timings.push(layer.timing());
        }
        assert_eq!(
            timings,
            vec![
                IndexTiming::Eager,
                IndexTiming::Lazy,
                IndexTiming::Incremental,
                IndexTiming::Selective,
            ]
        );
    }

    #[test]
    fn the_open_file_and_the_current_package_are_indexed_before_the_rest_of_the_tree() {
        let paths: Vec<PathBuf> = [
            "packages/other/src/lib.ts",
            "apps/web/app/page.tsx",
            "apps/web/app/layout.tsx",
            "docs/notes.md",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
        let scope = PathBuf::from("apps/web");
        let open = vec![PathBuf::from("docs/notes.md")];

        let ordered = prioritized(&paths, Some(&scope), &open);

        assert_eq!(ordered[0], PathBuf::from("docs/notes.md"));
        assert!(ordered[1].starts_with("apps/web"), "{ordered:?}");
        assert!(ordered[2].starts_with("apps/web"), "{ordered:?}");
        assert_eq!(ordered[3], PathBuf::from("packages/other/src/lib.ts"));

        assert_eq!(
            index_priority(Path::new("docs/notes.md"), Some(&scope), &open),
            0
        );
        assert_eq!(
            index_priority(Path::new("apps/web/app/page.tsx"), Some(&scope), &open),
            1
        );
        assert_eq!(
            index_priority(Path::new("docs/other.md"), Some(&scope), &open),
            2
        );
    }
}
