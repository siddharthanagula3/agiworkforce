//! Recognising the commands a session runs to check its own work, so a handoff
//! can say what has been proved and what has not.

use serde::{Deserialize, Serialize};

use crate::safety::command_shape::command_units;

/// What a check proves about the work.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum ValidationKind {
    Test,
    Build,
    Lint,
    Typecheck,
    Format,
}

impl ValidationKind {
    pub const ALL: &'static [ValidationKind] = &[
        Self::Test,
        Self::Build,
        Self::Lint,
        Self::Typecheck,
        Self::Format,
    ];

    pub const fn label(self) -> &'static str {
        match self {
            Self::Test => "tests",
            Self::Build => "build",
            Self::Lint => "lint",
            Self::Typecheck => "typecheck",
            Self::Format => "format check",
        }
    }
}

/// A program that is a check on its own, whatever arguments follow.
const VALIDATION_PROGRAMS: &[(&str, ValidationKind)] = &[
    ("vitest", ValidationKind::Test),
    ("jest", ValidationKind::Test),
    ("pytest", ValidationKind::Test),
    ("mocha", ValidationKind::Test),
    ("rspec", ValidationKind::Test),
    ("phpunit", ValidationKind::Test),
    ("playwright", ValidationKind::Test),
    ("tsc", ValidationKind::Typecheck),
    ("mypy", ValidationKind::Typecheck),
    ("pyright", ValidationKind::Typecheck),
    ("eslint", ValidationKind::Lint),
    ("ruff", ValidationKind::Lint),
    ("flake8", ValidationKind::Lint),
    ("shellcheck", ValidationKind::Lint),
    ("prettier", ValidationKind::Format),
    ("rustfmt", ValidationKind::Format),
    ("gofmt", ValidationKind::Format),
    ("black", ValidationKind::Format),
];

/// A program whose first non-option word decides what the run checks.
const VALIDATION_SUBCOMMANDS: &[(&str, &[(&str, ValidationKind)])] = &[
    (
        "cargo",
        &[
            ("test", ValidationKind::Test),
            ("nextest", ValidationKind::Test),
            ("build", ValidationKind::Build),
            ("check", ValidationKind::Typecheck),
            ("clippy", ValidationKind::Lint),
            ("fmt", ValidationKind::Format),
        ],
    ),
    (
        "go",
        &[
            ("test", ValidationKind::Test),
            ("build", ValidationKind::Build),
            ("vet", ValidationKind::Lint),
        ],
    ),
    (
        "dotnet",
        &[
            ("test", ValidationKind::Test),
            ("build", ValidationKind::Build),
        ],
    ),
    (
        "gradle",
        &[
            ("test", ValidationKind::Test),
            ("build", ValidationKind::Build),
        ],
    ),
    (
        "mvn",
        &[
            ("test", ValidationKind::Test),
            ("verify", ValidationKind::Test),
            ("package", ValidationKind::Build),
        ],
    ),
];

/// Script names a package manager runs. The manager is identified from the
/// package-manager table rather than a second list of binaries.
const VALIDATION_SCRIPTS: &[(&str, ValidationKind)] = &[
    ("test", ValidationKind::Test),
    ("test:unit", ValidationKind::Test),
    ("test:e2e", ValidationKind::Test),
    ("build", ValidationKind::Build),
    ("lint", ValidationKind::Lint),
    ("typecheck", ValidationKind::Typecheck),
    ("format:check", ValidationKind::Format),
];

fn operands(words: &[&str]) -> Vec<String> {
    words
        .iter()
        .filter(|word| !word.starts_with('-'))
        .map(|word| word.trim_matches(['\'', '"']).to_ascii_lowercase())
        .collect()
}

/// Front ends that run some other program, so what they check is decided by
/// what follows them rather than by their own name.
const RUNNERS: &[&str] = &["npx", "bunx", "pnpx"];
const MANAGER_EXEC_VERBS: &[&str] = &["exec", "dlx", "x"];

fn package_manager_of(program: &str) -> Option<crate::repo::setup::PackageManager> {
    crate::repo::setup::PackageManager::ALL
        .iter()
        .copied()
        .find(|manager| manager.run_prefix().is_some() && manager.binary() == program)
}

/// The words a manager puts between its own name and a script name, taken from
/// the package-manager table rather than a second list.
fn run_verb(manager: crate::repo::setup::PackageManager) -> Vec<String> {
    manager
        .run_prefix()
        .into_iter()
        .flat_map(|prefix| prefix.split_whitespace().skip(1))
        .map(str::to_ascii_lowercase)
        .collect()
}

fn classify_words(words: &[String], depth: usize) -> Option<ValidationKind> {
    if depth > 2 {
        return None;
    }
    let program = crate::safety::approval::strip_path(words.first()?.as_str());
    let rest = &words[1..];

    if RUNNERS.contains(&program) {
        return classify_words(rest, depth + 1);
    }

    if let Some((_, kind)) = VALIDATION_PROGRAMS
        .iter()
        .find(|(name, _)| *name == program)
    {
        return Some(*kind);
    }

    if let Some((_, table)) = VALIDATION_SUBCOMMANDS
        .iter()
        .find(|(name, _)| *name == program)
    {
        return rest.first().and_then(|first| {
            table
                .iter()
                .find(|(name, _)| name == first)
                .map(|(_, kind)| *kind)
        });
    }

    if let Some(manager) = package_manager_of(program) {
        let mut rest = rest;
        if rest
            .first()
            .is_some_and(|word| MANAGER_EXEC_VERBS.contains(&word.as_str()))
        {
            return classify_words(&rest[1..], depth + 1);
        }
        let verb = run_verb(manager);
        if rest.starts_with(&verb) {
            rest = &rest[verb.len()..];
        }
        let script = rest.first()?;
        return VALIDATION_SCRIPTS
            .iter()
            .find(|(name, _)| name == script)
            .map(|(_, kind)| *kind);
    }

    None
}

fn classify_spelling(spelling: &str) -> Option<ValidationKind> {
    let words: Vec<&str> = spelling.split_whitespace().collect();
    classify_words(&operands(&words), 0)
}

/// What a command string checks, if anything. The command is read through the
/// shape walk, so quoting and wrappers do not hide the program that runs.
pub fn classify_validation(command: &str) -> Option<ValidationKind> {
    command_units(command)
        .iter()
        .filter_map(|unit| {
            unit.spellings()
                .iter()
                .find_map(|spelling| classify_spelling(spelling))
        })
        .min()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_kind_of_check_is_recognised_from_a_real_command() {
        let recognised: Vec<ValidationKind> = [
            "cargo test -p agiworkforce-cli",
            "cargo build --release",
            "pnpm run lint",
            "npx tsc --noEmit",
            "prettier --check .",
        ]
        .iter()
        .filter_map(|command| classify_validation(command))
        .collect();

        for kind in ValidationKind::ALL {
            assert!(
                recognised.contains(kind),
                "{kind:?} is not recognised from any command: {recognised:?}"
            );
            assert!(!kind.label().is_empty());
        }
    }

    #[test]
    fn a_package_manager_script_is_read_through_the_manager_table() {
        for manager in crate::repo::setup::PackageManager::ALL {
            let Some(prefix) = manager.run_prefix() else {
                continue;
            };
            assert_eq!(
                classify_validation(&format!("{prefix} test")),
                Some(ValidationKind::Test),
                "{prefix} test is a test run"
            );
        }
        assert_eq!(
            classify_validation("pnpm typecheck"),
            Some(ValidationKind::Typecheck)
        );
        assert_eq!(classify_validation("pnpm run dev"), None);
    }

    #[test]
    fn a_check_is_recognised_through_quoting_and_wrappers() {
        for command in [
            "env CI=1 cargo test",
            "sh -c 'cargo test --lib'",
            "cd apps/cli && cargo test",
        ] {
            assert_eq!(
                classify_validation(command),
                Some(ValidationKind::Test),
                "{command}"
            );
        }
    }

    #[test]
    fn work_that_changes_the_tree_is_not_reported_as_a_check() {
        for command in [
            "git push origin main",
            "rm -rf build",
            "cargo run",
            "pnpm install",
            "echo test",
        ] {
            assert_eq!(classify_validation(command), None, "{command}");
        }
    }
}
