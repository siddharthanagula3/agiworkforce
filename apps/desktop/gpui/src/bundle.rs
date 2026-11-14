use std::path::{Component, Path, PathBuf};

use anyhow::{Context, Result};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RuntimeManifest {
    executable: String,
    version: String,
}

pub fn resolve_runtime(override_path: Option<PathBuf>) -> Result<PathBuf> {
    match override_path {
        Some(path) => existing_runtime(&path),
        None => resolve_bundled_runtime(&std::env::current_exe()?),
    }
}

fn existing_runtime(path: &Path) -> Result<PathBuf> {
    let path = path
        .canonicalize()
        .context("The CLI executable is unavailable")?;
    anyhow::ensure!(path.is_file(), "The CLI runtime must be a file");
    Ok(path)
}

fn resolve_bundled_runtime(executable: &Path) -> Result<PathBuf> {
    let binaries = executable
        .parent()
        .context("The desktop executable has no parent directory")?;
    let contents = binaries
        .parent()
        .context("The desktop bundle has no contents directory")?;
    let manifest = std::fs::read_to_string(contents.join("Resources/native-runtime.json"))
        .context("The bundled runtime manifest is unavailable. Use dev:gpui or pass --runtime with the CLI executable")?;
    let manifest: RuntimeManifest =
        serde_json::from_str(&manifest).context("The bundled runtime manifest is invalid")?;
    let path = Path::new(&manifest.executable);
    let mut components = path.components();
    anyhow::ensure!(
        matches!(components.next(), Some(Component::Normal(_)))
            && components.next().is_none()
            && path.file_name() == Some(path.as_os_str()),
        "The bundled runtime must name one executable inside the bundle"
    );
    anyhow::ensure!(
        !manifest.version.trim().is_empty(),
        "The bundled runtime version is missing"
    );
    let runtime = existing_runtime(&binaries.join(path))?;
    anyhow::ensure!(
        runtime.parent() == Some(binaries.canonicalize()?.as_path()),
        "The bundled runtime points outside its bundle"
    );
    Ok(runtime)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bundle(name: &str) -> tempfile::TempDir {
        let directory = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(directory.path().join("Contents/MacOS")).unwrap();
        std::fs::create_dir_all(directory.path().join("Contents/Resources")).unwrap();
        std::fs::write(directory.path().join("Contents/MacOS/runtime"), []).unwrap();
        std::fs::write(
            directory
                .path()
                .join("Contents/Resources/native-runtime.json"),
            serde_json::to_vec(&serde_json::json!({"executable":name,"version":"0.0.1"})).unwrap(),
        )
        .unwrap();
        directory
    }

    #[test]
    fn finds_the_manifest_selected_runtime_without_a_command_line_override() {
        let bundle = bundle("runtime");
        let path = resolve_bundled_runtime(&bundle.path().join("Contents/MacOS/desktop")).unwrap();
        assert_eq!(
            path,
            bundle
                .path()
                .join("Contents/MacOS/runtime")
                .canonicalize()
                .unwrap()
        );
    }

    #[test]
    fn refuses_missing_and_path_traversing_bundle_executables() {
        for name in [
            "",
            "../runtime",
            "/tmp/runtime",
            "./runtime",
            "nested/runtime",
            ".",
            "..",
            "missing",
        ] {
            let bundle = bundle(name);
            assert!(
                resolve_bundled_runtime(&bundle.path().join("Contents/MacOS/desktop")).is_err(),
                "accepted {name}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlink_to_a_runtime_outside_the_bundle() {
        let bundle = bundle("runtime");
        let outside = tempfile::NamedTempFile::new().unwrap();
        let runtime = bundle.path().join("Contents/MacOS/runtime");
        std::fs::remove_file(&runtime).unwrap();
        std::os::unix::fs::symlink(outside.path(), runtime).unwrap();
        assert!(resolve_bundled_runtime(&bundle.path().join("Contents/MacOS/desktop")).is_err());
    }

    #[test]
    fn explicit_development_override_requires_a_file() {
        let directory = tempfile::tempdir().unwrap();
        assert!(resolve_runtime(Some(directory.path().to_owned())).is_err());
    }

    #[test]
    #[ignore = "requires a built native app bundle"]
    fn packaged_runtime_discovery_matches_the_actual_cli_version() {
        let executable = PathBuf::from(
            std::env::var_os("AGI_GPUI_TEST_BUNDLE_EXECUTABLE").expect("native bundle executable"),
        );
        let runtime = resolve_bundled_runtime(&executable).unwrap();
        let resources = executable
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("Resources");
        let manifest: RuntimeManifest = serde_json::from_str(
            &std::fs::read_to_string(resources.join("native-runtime.json")).unwrap(),
        )
        .unwrap();
        let config = tempfile::tempdir().unwrap();
        let output = std::process::Command::new(runtime)
            .arg("--version")
            .env("AGIWORKFORCE_HOME", config.path())
            .output()
            .unwrap();
        assert!(output.status.success());
        assert!(String::from_utf8(output.stdout)
            .unwrap()
            .trim_end()
            .ends_with(&format!(" {}", manifest.version)));
    }
}
