//! Safe installation mechanics for verified Piper release bundles.
//!
//! The upstream executable depends on sibling libraries and data files. This
//! service preserves the complete archive layout in an immutable, versioned
//! directory and promotes it atomically only after extraction succeeds.

use super::artifact_registry::{safe_artifact_filename, validate_sha256};
use anyhow::{anyhow, Context, Result};
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::path::{Component, Path, PathBuf};

const MANAGED_BUNDLE_DIRECTORY: &str = "piper-bundles";

#[derive(Debug, Clone)]
pub(crate) struct PiperBundlePaths {
    pub(crate) parent: PathBuf,
    pub(crate) root: PathBuf,
    pub(crate) executable_relative: PathBuf,
}

pub(crate) fn versioned_bundle_paths(
    bin_dir: &Path,
    bundle_id: &str,
    archive_sha256: &str,
    executable_path: &str,
) -> Result<PiperBundlePaths> {
    safe_artifact_filename(bundle_id)?;
    validate_sha256(archive_sha256)?;
    let executable_relative = normalize_archive_path(Path::new(executable_path))?;
    let checksum_prefix = archive_sha256
        .get(..12)
        .ok_or_else(|| anyhow!("Piper bundle checksum is too short"))?;
    let bundle_name = format!("{bundle_id}-{checksum_prefix}");
    safe_artifact_filename(&bundle_name)?;
    let parent = bin_dir.join(MANAGED_BUNDLE_DIRECTORY);
    let root = parent.join(bundle_name);
    Ok(PiperBundlePaths {
        parent,
        root,
        executable_relative,
    })
}

pub(crate) fn validate_bundle_layout(
    root: &Path,
    executable_path: &str,
    required_files: &[String],
    required_directories: &[String],
) -> Result<PathBuf> {
    let executable_relative = normalize_archive_path(Path::new(executable_path))?;
    let executable = root.join(&executable_relative);
    if !executable.is_file() {
        return Err(anyhow!("Piper bundle is missing its executable"));
    }

    for required in required_files {
        let relative = normalize_archive_path(Path::new(required))?;
        if !root.join(relative).is_file() {
            return Err(anyhow!("Piper bundle is missing a required file"));
        }
    }
    for required in required_directories {
        let relative = normalize_archive_path(Path::new(required))?;
        if !root.join(relative).is_dir() {
            return Err(anyhow!("Piper bundle is missing a required directory"));
        }
    }

    Ok(executable)
}

pub(crate) fn extract_archive(
    archive_path: &Path,
    archive_format: &str,
    destination: &Path,
) -> Result<()> {
    if destination.exists() && fs::read_dir(destination)?.next().is_some() {
        return Err(anyhow!("Piper extraction destination must be empty"));
    }
    fs::create_dir_all(destination).context("Failed to create Piper extraction directory")?;
    match archive_format {
        "tar.gz" => extract_tar_gz(archive_path, destination),
        "zip" => extract_zip(archive_path, destination),
        _ => Err(anyhow!("Unsupported Piper archive format")),
    }
}

fn extract_tar_gz(archive_path: &Path, destination: &Path) -> Result<()> {
    let archive_file = File::open(archive_path).context("Failed to open Piper tar archive")?;
    let decoder = flate2::read::GzDecoder::new(archive_file);
    let mut archive = tar::Archive::new(decoder);
    let mut seen = HashSet::new();

    for entry in archive
        .entries()
        .context("Failed to read Piper tar archive")?
    {
        let mut entry = entry.context("Failed to read Piper tar entry")?;
        let relative = normalize_archive_path(
            &entry
                .path()
                .context("Failed to read Piper tar entry path")?,
        )?;
        if !seen.insert(relative.clone()) {
            return Err(anyhow!("Piper archive contains a duplicate path"));
        }
        let destination_path = destination.join(&relative);
        let entry_type = entry.header().entry_type();

        if entry_type.is_symlink() {
            let target = entry
                .link_name()
                .context("Failed to read Piper symlink target")?
                .ok_or_else(|| anyhow!("Piper symlink has no target"))?;
            validate_symlink_target(&relative, &target)?;
            let parent = destination_path
                .parent()
                .ok_or_else(|| anyhow!("Piper symlink has no parent directory"))?;
            fs::create_dir_all(parent).context("Failed to create Piper symlink parent")?;
            #[cfg(unix)]
            {
                std::os::unix::fs::symlink(&target, &destination_path)
                    .context("Failed to create Piper bundle symlink")?;
                continue;
            }
            #[cfg(not(unix))]
            {
                return Err(anyhow!(
                    "Piper tar symlinks are unsupported on this platform"
                ));
            }
        }

        if !entry_type.is_file() && !entry_type.is_dir() {
            return Err(anyhow!(
                "Piper tar archive contains an unsupported entry type"
            ));
        }
        if let Some(parent) = destination_path.parent() {
            fs::create_dir_all(parent).context("Failed to create Piper bundle directory")?;
        }
        entry
            .unpack(&destination_path)
            .context("Failed to extract Piper tar entry")?;
    }

    Ok(())
}

fn extract_zip(archive_path: &Path, destination: &Path) -> Result<()> {
    let archive_file = File::open(archive_path).context("Failed to open Piper zip archive")?;
    let mut archive = zip::ZipArchive::new(archive_file).context("Failed to read Piper zip")?;
    let mut seen = HashSet::new();

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .context("Failed to read Piper zip entry")?;
        let relative = normalize_archive_path(Path::new(entry.name()))?;
        if !seen.insert(relative.clone()) {
            return Err(anyhow!("Piper archive contains a duplicate path"));
        }
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(anyhow!("Piper zip archive contains a symlink"));
        }
        let destination_path = destination.join(relative);

        if entry.is_dir() {
            fs::create_dir_all(&destination_path)
                .context("Failed to create Piper zip directory")?;
            continue;
        }
        let parent = destination_path
            .parent()
            .ok_or_else(|| anyhow!("Piper zip entry has no parent directory"))?;
        fs::create_dir_all(parent).context("Failed to create Piper zip entry parent")?;
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&destination_path)
            .context("Failed to create Piper zip output")?;
        std::io::copy(&mut entry, &mut output).context("Failed to extract Piper zip entry")?;
    }

    Ok(())
}

fn normalize_archive_path(path: &Path) -> Result<PathBuf> {
    let text = path
        .to_str()
        .ok_or_else(|| anyhow!("Piper archive path is not valid UTF-8"))?;
    if text.is_empty() || text.contains('\\') {
        return Err(anyhow!("Piper archive path is invalid"));
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => normalized.push(value),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(anyhow!("Piper archive path escapes its bundle"));
            }
        }
    }
    if normalized.as_os_str().is_empty() {
        return Err(anyhow!("Piper archive path is empty"));
    }
    Ok(normalized)
}

fn validate_symlink_target(link_path: &Path, target: &Path) -> Result<()> {
    let target_text = target
        .to_str()
        .ok_or_else(|| anyhow!("Piper symlink target is not valid UTF-8"))?;
    if target_text.is_empty() || target_text.contains('\\') || target.is_absolute() {
        return Err(anyhow!("Piper symlink target is invalid"));
    }

    let mut resolved = link_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();
    for component in target.components() {
        match component {
            Component::Normal(value) => resolved.push(value),
            Component::CurDir => {}
            Component::ParentDir => {
                if !resolved.pop() {
                    return Err(anyhow!("Piper symlink escapes its bundle"));
                }
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(anyhow!("Piper symlink escapes its bundle"));
            }
        }
    }
    if resolved.as_os_str().is_empty() {
        return Err(anyhow!("Piper symlink target is empty"));
    }
    Ok(())
}

pub(crate) fn promote_bundle(
    staging_root: &Path,
    final_root: &Path,
    executable_relative: &Path,
) -> Result<PathBuf> {
    let executable_relative = normalize_archive_path(executable_relative)?;
    let staging_executable = staging_root.join(&executable_relative);
    let metadata = fs::symlink_metadata(&staging_executable)
        .context("Extracted Piper bundle has no executable")?;
    if !metadata.file_type().is_file() {
        return Err(anyhow!("Extracted Piper executable is not a regular file"));
    }
    if final_root.exists() {
        return Err(anyhow!("Piper bundle destination already exists"));
    }
    let final_parent = final_root
        .parent()
        .ok_or_else(|| anyhow!("Piper bundle destination has no parent"))?;
    fs::create_dir_all(final_parent).context("Failed to create Piper bundle parent")?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = metadata.permissions();
        permissions.set_mode(permissions.mode() | 0o700);
        fs::set_permissions(&staging_executable, permissions)
            .context("Failed to make Piper executable runnable")?;
    }

    fs::rename(staging_root, final_root).context("Failed to promote Piper bundle atomically")?;
    let installed_executable = final_root.join(executable_relative);
    if !installed_executable.is_file() {
        return Err(anyhow!("Promoted Piper bundle is incomplete"));
    }
    Ok(installed_executable)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::Write;
    use tar::{Builder as TarBuilder, EntryType, Header};
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn append_tar_file(builder: &mut TarBuilder<GzEncoder<File>>, path: &str, contents: &[u8]) {
        let mut header = Header::new_gnu();
        header.set_size(contents.len() as u64);
        header.set_mode(0o755);
        header.set_cksum();
        builder.append_data(&mut header, path, contents).unwrap();
    }

    fn finish_tar(builder: TarBuilder<GzEncoder<File>>) {
        let encoder = builder.into_inner().unwrap();
        encoder.finish().unwrap();
    }

    #[test]
    fn tar_extraction_preserves_complete_relative_layout_and_safe_symlinks() {
        let temp_dir = tempfile::tempdir().unwrap();
        let archive_path = temp_dir.path().join("fixture.tar.gz");
        let encoder = GzEncoder::new(File::create(&archive_path).unwrap(), Compression::default());
        let mut builder = TarBuilder::new(encoder);
        append_tar_file(
            &mut builder,
            "fixture-bundle/fixture-executable",
            b"executable",
        );
        append_tar_file(&mut builder, "fixture-bundle/libfixture.so.1", b"library");
        append_tar_file(&mut builder, "fixture-bundle/data/fixture-data", b"data");
        let mut symlink = Header::new_gnu();
        symlink.set_entry_type(EntryType::Symlink);
        symlink.set_size(0);
        symlink.set_mode(0o777);
        symlink.set_link_name("libfixture.so.1").unwrap();
        symlink.set_cksum();
        builder
            .append_data(
                &mut symlink,
                "fixture-bundle/libfixture.so",
                std::io::empty(),
            )
            .unwrap();
        finish_tar(builder);

        let destination = temp_dir.path().join("extracted");
        extract_archive(&archive_path, "tar.gz", &destination).unwrap();
        assert!(destination
            .join("fixture-bundle/fixture-executable")
            .is_file());
        assert!(destination.join("fixture-bundle/libfixture.so.1").is_file());
        assert!(destination
            .join("fixture-bundle/data/fixture-data")
            .is_file());
        #[cfg(unix)]
        assert!(
            fs::symlink_metadata(destination.join("fixture-bundle/libfixture.so"))
                .unwrap()
                .file_type()
                .is_symlink()
        );
    }

    #[test]
    fn tar_extraction_rejects_symlink_escape() {
        let temp_dir = tempfile::tempdir().unwrap();
        let archive_path = temp_dir.path().join("fixture.tar.gz");
        let encoder = GzEncoder::new(File::create(&archive_path).unwrap(), Compression::default());
        let mut builder = TarBuilder::new(encoder);
        let mut symlink = Header::new_gnu();
        symlink.set_entry_type(EntryType::Symlink);
        symlink.set_size(0);
        symlink.set_mode(0o777);
        symlink.set_link_name("../../escape").unwrap();
        symlink.set_cksum();
        builder
            .append_data(&mut symlink, "fixture-bundle/escape-link", std::io::empty())
            .unwrap();
        finish_tar(builder);

        assert!(
            extract_archive(&archive_path, "tar.gz", &temp_dir.path().join("extracted")).is_err()
        );
        assert!(!temp_dir.path().join("escape").exists());
    }

    #[test]
    fn zip_extraction_preserves_complete_relative_layout() {
        let temp_dir = tempfile::tempdir().unwrap();
        let archive_path = temp_dir.path().join("fixture.zip");
        let mut archive = ZipWriter::new(File::create(&archive_path).unwrap());
        let options = SimpleFileOptions::default();
        archive
            .start_file("fixture-bundle/fixture-executable.exe", options)
            .unwrap();
        archive.write_all(b"executable").unwrap();
        archive
            .start_file("fixture-bundle/fixture-runtime.dll", options)
            .unwrap();
        archive.write_all(b"library").unwrap();
        archive
            .start_file("fixture-bundle/data/fixture-data", options)
            .unwrap();
        archive.write_all(b"data").unwrap();
        archive.finish().unwrap();

        let destination = temp_dir.path().join("extracted");
        extract_archive(&archive_path, "zip", &destination).unwrap();
        assert!(destination
            .join("fixture-bundle/fixture-executable.exe")
            .is_file());
        assert!(destination
            .join("fixture-bundle/fixture-runtime.dll")
            .is_file());
        assert!(destination
            .join("fixture-bundle/data/fixture-data")
            .is_file());
    }

    #[test]
    fn zip_extraction_rejects_parent_traversal() {
        let temp_dir = tempfile::tempdir().unwrap();
        let archive_path = temp_dir.path().join("fixture.zip");
        let mut archive = ZipWriter::new(File::create(&archive_path).unwrap());
        archive
            .start_file("../escape", SimpleFileOptions::default())
            .unwrap();
        archive.write_all(b"escape").unwrap();
        archive.finish().unwrap();

        assert!(extract_archive(&archive_path, "zip", &temp_dir.path().join("extracted")).is_err());
        assert!(!temp_dir.path().join("escape").exists());
    }

    #[test]
    fn bundle_layout_requires_every_declared_runtime_dependency() {
        let temp_dir = tempfile::tempdir().unwrap();
        let root = temp_dir.path().join("fixture-bundle");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("fixture-executable"), b"executable").unwrap();
        let required_files = vec!["fixture-runtime.dll".to_string()];
        let required_directories = vec!["runtime-data".to_string()];

        assert!(validate_bundle_layout(
            &root,
            "fixture-executable",
            &required_files,
            &required_directories,
        )
        .is_err());

        fs::write(root.join("fixture-runtime.dll"), b"library").unwrap();
        assert!(validate_bundle_layout(
            &root,
            "fixture-executable",
            &required_files,
            &required_directories,
        )
        .is_err());

        fs::create_dir(root.join("runtime-data")).unwrap();
        assert_eq!(
            validate_bundle_layout(
                &root,
                "fixture-executable",
                &required_files,
                &required_directories,
            )
            .unwrap(),
            root.join("fixture-executable")
        );
    }

    #[test]
    fn promotion_is_atomic_and_never_overwrites_an_existing_bundle() {
        let temp_dir = tempfile::tempdir().unwrap();
        let staging = temp_dir.path().join("staging");
        let executable_relative = Path::new("fixture-bundle/fixture-executable");
        fs::create_dir_all(staging.join("fixture-bundle/data")).unwrap();
        fs::write(staging.join(executable_relative), b"executable").unwrap();
        fs::write(staging.join("fixture-bundle/data/fixture-data"), b"data").unwrap();
        let final_root = temp_dir.path().join("final-bundle");

        let executable = promote_bundle(&staging, &final_root, executable_relative).unwrap();
        assert_eq!(executable, final_root.join(executable_relative));
        assert!(!staging.exists());
        assert!(final_root
            .join("fixture-bundle/data/fixture-data")
            .is_file());

        let second_staging = temp_dir.path().join("second-staging");
        fs::create_dir_all(second_staging.join("fixture-bundle")).unwrap();
        fs::write(second_staging.join(executable_relative), b"replacement").unwrap();
        assert!(promote_bundle(&second_staging, &final_root, executable_relative).is_err());
        assert_eq!(fs::read(executable).unwrap(), b"executable");
    }

    #[test]
    fn incomplete_staging_is_never_promoted() {
        let temp_dir = tempfile::tempdir().unwrap();
        let staging = temp_dir.path().join("staging");
        fs::create_dir_all(&staging).unwrap();
        let final_root = temp_dir.path().join("final-bundle");
        assert!(promote_bundle(
            &staging,
            &final_root,
            Path::new("fixture-bundle/fixture-executable")
        )
        .is_err());
        assert!(!final_root.exists());
        assert!(staging.exists());
    }
}
