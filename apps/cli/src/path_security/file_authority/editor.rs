use super::*;
use agiworkforce_protocol::workspace_files::*;
use std::collections::BTreeMap;

fn relative(path: &str, root: bool) -> Result<()> {
    anyhow::ensure!(
        (root && path.is_empty())
            || path
                .split('/')
                .all(|part| !part.is_empty() && !matches!(part, "." | "..")),
        "Use an unambiguous relative file path"
    );
    anyhow::ensure!(
        (root && path.is_empty())
            || (!path.is_empty()
                && !path.contains(['\\', '\0'])
                && Path::new(path)
                    .components()
                    .all(|component| matches!(component, Component::Normal(_)))),
        "Use a relative path inside the selected coding folder"
    );
    Ok(())
}

fn regular_file_exists(directory: &DirectoryAuthority, relative: &Path) -> Result<bool> {
    let (parent, leaf) = match directory.parent(relative, false) {
        Ok(value) => value,
        Err(error) if is_not_found(&error) => return Ok(false),
        Err(error) => return Err(error),
    };
    match confined::stat(&parent, &leaf, FollowSymlinks::No) {
        Ok(metadata) => {
            validate_regular(&metadata, u64::MAX)?;
            Ok(true)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

impl WorkspaceFileAuthority {
    pub(crate) fn create_editor_file(&self, path: &str, bytes: &[u8]) -> Result<()> {
        let (directory, relative) = self.editor_file(path)?;
        anyhow::ensure!(
            !regular_file_exists(directory, &relative)?,
            "The file already exists"
        );
        let created =
            directory.replace_file(&relative, bytes, false, MAX_EDITOR_TEXT_BYTES as u64)?;
        anyhow::ensure!(created, "The file was not created");
        self.identity()?;
        Ok(())
    }

    pub(crate) fn rename_editor_file(&self, from: &str, to: &str, replace: bool) -> Result<bool> {
        anyhow::ensure!(from != to, "Choose a different relative path");
        let (from_directory, from_relative) = self.editor_file(from)?;
        let (to_directory, to_relative) = self.editor_file(to)?;
        anyhow::ensure!(
            from_directory.path() == to_directory.path(),
            "The file would leave its granted folder"
        );
        let (from_parent, from_leaf) = from_directory.parent(&from_relative, false)?;
        let from_metadata = confined::stat(&from_parent, &from_leaf, FollowSymlinks::No)?;
        validate_regular(&from_metadata, u64::MAX)?;
        let replaced = regular_file_exists(to_directory, &to_relative)?;
        anyhow::ensure!(!replaced || replace, "The destination already exists");
        let (to_parent, to_leaf) = to_directory.parent(&to_relative, true)?;
        if replaced {
            let metadata = confined::stat(&to_parent, &to_leaf, FollowSymlinks::No)?;
            validate_regular(&metadata, u64::MAX)?;
        }
        confined::rename(&from_parent, &from_leaf, &to_parent, &to_leaf)?;
        self.identity()?;
        Ok(replaced)
    }

    pub(crate) fn delete_editor_file(&self, path: &str) -> Result<()> {
        let (directory, relative) = self.editor_file(path)?;
        anyhow::ensure!(
            directory.remove_file(&relative)?,
            "The file is no longer available"
        );
        self.identity()?;
        Ok(())
    }

    pub(crate) fn read_scoped_file(&self, path: &str, limit: u64) -> Result<Option<ReadFile>> {
        self.identity()?;
        let (directory, relative) = self.editor_file(path)?;
        let file = match directory.read_file(&relative, limit) {
            Ok(file) => file,
            Err(error) if is_not_found(&error) => None,
            Err(error) => return Err(error),
        };
        self.identity()?;
        Ok(file)
    }
    pub(crate) fn editor_file(&self, path: &str) -> Result<(&DirectoryAuthority, PathBuf)> {
        relative(path, false)?;
        anyhow::ensure!(
            !super::super::is_protected_path_with_cwd(Path::new(path), self.root()),
            "This path is protected by the coding host's file policy"
        );
        let credential = super::super::scope_workspace_paths_sync(
            self.root().to_path_buf(),
            self.additional(),
            || super::super::reads_a_credential_file(path),
        );
        anyhow::ensure!(
            !credential,
            "Credential files cannot be opened through the coding host"
        );
        self.resolve(Path::new(path))
    }

    pub(crate) fn editor_directory(
        &self,
        params: WorkspaceDirectoryParams,
    ) -> Result<WorkspaceDirectoryResponse> {
        relative(&params.path, true)?;
        let directory = if params.path.is_empty() {
            self.root.clone()
        } else {
            let (authority, relative) = self.editor_file(&params.path)?;
            authority.child(&relative, false)?
        };
        if let Some(after) = &params.after {
            anyhow::ensure!(
                !after.is_empty() && !after.contains(['/', '\\', '\0']),
                "The directory cursor is invalid"
            );
        }
        let mut selected = BTreeMap::new();
        let mut omitted_names = 0u32;
        for (index, entry) in confined::read_base_dir(directory.file.as_ref())?.enumerate() {
            anyhow::ensure!(index < MAX_WORKSPACE_DIRECTORY_SCAN, "This directory exceeds the browser scan limit. Open a specific relative file path instead.");
            let entry = entry?;
            let name = match entry.file_name().into_string() {
                Ok(name) => name,
                Err(_) => {
                    omitted_names = omitted_names.saturating_add(1);
                    continue;
                }
            };
            if name.contains(['\\', '\0']) {
                omitted_names = omitted_names.saturating_add(1);
                continue;
            }
            if params.after.as_ref().is_some_and(|after| name <= *after) {
                continue;
            }
            let file_type = entry.file_type()?;
            let kind = if file_type.is_dir() {
                WorkspaceEntryKind::Directory
            } else if file_type.is_file() {
                WorkspaceEntryKind::File
            } else {
                WorkspaceEntryKind::Unsupported
            };
            let path = if params.path.is_empty() {
                name.clone()
            } else {
                format!("{}/{name}", params.path)
            };
            let blocked =
                kind == WorkspaceEntryKind::Unsupported || self.editor_file(&path).is_err();
            selected.insert(
                name.clone(),
                WorkspaceDirectoryEntry {
                    path,
                    name,
                    kind,
                    blocked,
                },
            );
            if selected.len() > WORKSPACE_DIRECTORY_PAGE_SIZE + 1 {
                selected.pop_last();
            }
        }
        let more = selected.len() > WORKSPACE_DIRECTORY_PAGE_SIZE;
        if more {
            selected.pop_last();
        }
        let next_after = more
            .then(|| selected.last_key_value().map(|(name, _)| name.clone()))
            .flatten();
        Ok(WorkspaceDirectoryResponse {
            root_key: params.root_key,
            path: params.path,
            entries: selected.into_values().collect(),
            omitted_names,
            next_after,
        })
    }
}
