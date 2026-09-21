//! What a session establishes about the repository it works in.
//!
//! Every field is read from the workspace by the detectors the CLI already
//! uses for its own context, so the record a session carries and the context
//! the model is given cannot describe two different repositories.

use agiworkforce_protocol::developer_session::HandoffArchitecture;
use std::path::Path;

/// How many declared commands travel. A receiving surface needs the way in,
/// not the whole task runner.
const MAX_COMMANDS: usize = 12;

/// The commands a receiving surface needs first, in the order it needs them.
const CARRIED_COMMANDS: &[&str] = &[
    "install",
    "setup",
    "bootstrap",
    "dev",
    "start",
    "build",
    "test",
    "lint",
    "typecheck",
    "check",
];

fn declared_commands(root: &Path) -> Vec<String> {
    let setup = crate::repo::setup::discover_environment_setup(root);
    let mut carried: Vec<String> = Vec::new();
    if let Some(install) = setup.install.as_ref() {
        carried.push(install.command.clone());
    }
    for name in CARRIED_COMMANDS {
        for source in &setup.sources {
            let Some(command) = source.command(name) else {
                continue;
            };
            if !carried.iter().any(|held| held == &command.run) {
                carried.push(command.run.clone());
            }
        }
        if carried.len() >= MAX_COMMANDS {
            break;
        }
    }
    carried.truncate(MAX_COMMANDS);
    carried
}

fn instruction_files(root: &Path) -> Vec<String> {
    let (sources, _) = crate::compaction::instruction_sources(root);
    sources
        .into_iter()
        .map(|source| source.path.display().to_string())
        .collect()
}

/// Read what this workspace is. An empty answer means nothing was found, and
/// is returned as `None` so a receiver can tell it from "not looked at".
pub fn discover(root: &Path) -> Option<HandoffArchitecture> {
    let cwd = root.to_string_lossy();
    let architecture = HandoffArchitecture {
        project_type: crate::context::detect_project_type(&cwd),
        language: crate::context::detect_project_language(&cwd),
        package_manager: crate::context::detect_package_manager(&cwd),
        monorepo: crate::context::detect_monorepo_type(&cwd),
        ci_providers: crate::context::detect_ci_providers(&cwd),
        containers: crate::context::detect_containerization(&cwd),
        instruction_files: instruction_files(root),
        commands: declared_commands(root),
    };
    (!architecture.is_empty()).then_some(architecture)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn workspace() -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("temp dir");
        let root = dir.path();
        fs::write(
            root.join("package.json"),
            r#"{"name":"widgets","scripts":{"dev":"next dev","test":"vitest run","build":"next build"},"dependencies":{"next":"15.0.0"}}"#,
        )
        .expect("manifest");
        fs::write(root.join("pnpm-lock.yaml"), "lockfileVersion: '9.0'\n").expect("lockfile");
        fs::write(root.join("AGENTS.md"), "# Conventions\nUse pnpm.\n").expect("instructions");
        fs::create_dir_all(root.join(".github/workflows")).expect("ci dir");
        fs::write(root.join(".github/workflows/ci.yml"), "name: ci\n").expect("workflow");
        dir
    }

    #[test]
    fn a_workspace_reports_how_it_is_built_and_how_it_is_run() {
        let dir = workspace();
        let architecture = discover(dir.path()).expect("a repository was found");

        assert_eq!(architecture.package_manager.as_deref(), Some("pnpm"));
        assert!(
            architecture
                .ci_providers
                .iter()
                .any(|ci| ci.contains("GitHub")),
            "CI was not discovered: {:?}",
            architecture.ci_providers
        );
        assert!(
            architecture
                .instruction_files
                .iter()
                .any(|path| path.ends_with("AGENTS.md")),
            "the instruction file a turn loads did not travel: {:?}",
            architecture.instruction_files
        );
        assert!(
            architecture
                .commands
                .iter()
                .any(|run| run.ends_with("test")),
            "the way this repository runs its tests did not travel: {:?}",
            architecture.commands
        );
        assert!(!architecture.is_empty());
    }

    #[test]
    fn a_directory_that_is_not_a_project_reports_nothing_rather_than_guessing() {
        let dir = tempfile::tempdir().expect("temp dir");
        assert!(discover(dir.path()).is_none());
    }

    #[test]
    fn what_travels_is_bounded_however_many_commands_the_repository_declares() {
        let dir = tempfile::tempdir().expect("temp dir");
        let scripts: Vec<String> = (0..80)
            .map(|index| format!("\"task{index}\":\"echo {index}\""))
            .collect();
        fs::write(
            dir.path().join("package.json"),
            format!(
                "{{\"name\":\"many\",\"scripts\":{{{},\"test\":\"vitest run\"}}}}",
                scripts.join(",")
            ),
        )
        .expect("manifest");
        let architecture = discover(dir.path()).expect("a repository was found");
        assert!(architecture.commands.len() <= MAX_COMMANDS);
    }
}
