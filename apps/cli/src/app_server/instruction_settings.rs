use crate::path_security::{DirectoryAuthority, WorkspaceFileAuthority};
use agiworkforce_app_server::DeveloperSessionHostError;
use agiworkforce_protocol::{developer_session::SettingsReadResponse, instruction_settings::*};
use anyhow::{ensure, Context, Result};
use std::path::{Path, PathBuf};

fn target(
    base: &Path,
    authority: &WorkspaceFileAuthority,
    scope: InstructionSettingsScope,
    create: bool,
) -> Result<(Option<DirectoryAuthority>, PathBuf, PathBuf)> {
    match scope {
        InstructionSettingsScope::User => {
            let path = base.join(crate::compaction::USER_INSTRUCTIONS_FILE);
            Ok((
                Some(DirectoryAuthority::open(base)?),
                PathBuf::from(crate::compaction::USER_INSTRUCTIONS_FILE),
                path,
            ))
        }
        InstructionSettingsScope::Project => {
            let path = authority
                .root()
                .join(crate::compaction::PROJECT_INSTRUCTIONS_FILE);
            let leaf = PathBuf::from(
                path.file_name()
                    .context("The instruction file name is unavailable")?,
            );
            Ok((authority.instruction_directory(create)?, leaf, path))
        }
    }
}

fn snapshot(
    base: &Path,
    authority: &WorkspaceFileAuthority,
    params: &InstructionSettingsReadParams,
    profile: SettingsReadResponse,
    limit: u64,
) -> Result<InstructionSettingsSnapshot> {
    super::workspace_files::check_root(authority, &params.root_key).map_err(anyhow::Error::new)?;
    let (directory, leaf, path) = target(base, authority, params.scope, false)?;
    let file = directory
        .as_ref()
        .map(|directory| directory.read_file(&leaf, limit))
        .transpose()?
        .flatten();
    let (revision, text) = if let Some(file) = file {
        let revision = file.revision();
        let text = String::from_utf8(file.bytes)
            .context("Instructions must be UTF-8 text; the file was retained")?;
        ensure!(
            !text.contains('\0'),
            "Instructions contain unsupported binary content; the file was retained"
        );
        (Some(revision), text)
    } else {
        (None, String::new())
    };
    if let Some(directory) = directory {
        directory.identity()?;
    }
    super::workspace_files::check_root(authority, &params.root_key).map_err(anyhow::Error::new)?;
    Ok(InstructionSettingsSnapshot {
        root_key: params.root_key.clone(),
        scope: params.scope,
        path: path.to_string_lossy().into_owned(),
        revision,
        text,
        profile,
    })
}

fn lock(base: &Path) -> Result<std::fs::File> {
    DirectoryAuthority::open(base)?
        .child(Path::new("instruction-settings"), true)?
        .coordination_lock(Path::new("lock"))
}

fn error(error: anyhow::Error) -> DeveloperSessionHostError {
    DeveloperSessionHostError::conflict(format!("Instruction settings could not be confirmed. Keep your text and reload before retrying. {error}"))
}

pub(super) fn read(
    base: &Path,
    authority: &WorkspaceFileAuthority,
    params: InstructionSettingsReadParams,
    profile: SettingsReadResponse,
) -> Result<InstructionSettingsSnapshot, DeveloperSessionHostError> {
    let work = || -> Result<_> {
        super::workspace_files::check_root(authority, &params.root_key)
            .map_err(anyhow::Error::new)?;
        let _lock = lock(base)?;
        snapshot(
            base,
            authority,
            &params,
            profile,
            MAX_INSTRUCTION_EDIT_BYTES as u64,
        )
    };
    work().map_err(error)
}

#[cfg(test)]
mod tests;

pub(super) fn write(
    base: &Path,
    authority: &WorkspaceFileAuthority,
    params: InstructionSettingsWriteParams,
    profile: SettingsReadResponse,
) -> Result<InstructionSettingsWriteResponse, DeveloperSessionHostError> {
    let work = || -> Result<_> {
        ensure!(
            params.text.len() <= MAX_INSTRUCTION_EDIT_BYTES && !params.text.contains('\0'),
            "The instructions exceed the editing limit or contain unsupported content"
        );
        super::workspace_files::check_root(authority, &params.root_key)
            .map_err(anyhow::Error::new)?;
        let _lock = lock(base)?;
        let requested = InstructionSettingsReadParams {
            root_key: params.root_key.clone(),
            scope: params.scope,
        };
        let current = snapshot(
            base,
            authority,
            &requested,
            profile.clone(),
            MAX_INSTRUCTION_EDIT_BYTES as u64,
        )?;
        if current.text == params.text {
            return Ok(InstructionSettingsWriteResponse {
                saved: true,
                current,
            });
        }
        if current.revision != params.revision {
            return Ok(InstructionSettingsWriteResponse {
                saved: false,
                current,
            });
        }
        let (directory, leaf, _) = target(base, authority, params.scope, true)?;
        let directory = directory.context("The instruction folder could not be opened")?;
        directory.identity()?;
        super::workspace_files::check_root(authority, &params.root_key)
            .map_err(anyhow::Error::new)?;
        if let Some(revision) = &current.revision {
            directory.replace_private_file_if_revision(
                &leaf,
                params.text.as_bytes(),
                MAX_INSTRUCTION_EDIT_BYTES as u64,
                revision,
            )?;
            directory.sync_directory()?;
        } else {
            directory
                .new_file_destination(&leaf, MAX_INSTRUCTION_EDIT_BYTES as u64)?
                .save(params.text.as_bytes())
                .map_err(|failed| failed.error)?;
        }
        directory.identity()?;
        let saved = snapshot(
            base,
            authority,
            &requested,
            profile,
            MAX_INSTRUCTION_EDIT_BYTES as u64,
        )?;
        ensure!(
            saved.text == params.text,
            "Instructions changed before their save could be confirmed"
        );
        Ok(InstructionSettingsWriteResponse {
            saved: true,
            current: saved,
        })
    };
    work().map_err(error)
}

pub(super) fn write_legacy(
    base: &Path,
    authority: &WorkspaceFileAuthority,
    scope: InstructionSettingsScope,
    text: &str,
) -> Result<(), DeveloperSessionHostError> {
    let work = || -> Result<_> {
        ensure!(
            text.len() as u64 <= crate::project_text::PROJECT_TEXT_MAX_BYTES
                && !text.contains('\0'),
            "Instructions exceed the host text limit or contain unsupported content"
        );
        let _lock = lock(base)?;
        authority.identity()?;
        let (directory, leaf, _) = target(base, authority, scope, !text.is_empty())?;
        let Some(directory) = directory else {
            return Ok(());
        };
        directory.identity()?;
        let current = directory.read_file(&leaf, crate::project_text::PROJECT_TEXT_MAX_BYTES)?;
        if text.is_empty() {
            directory.remove_file(&leaf)?;
        } else if let Some(current) = current {
            directory.replace_private_file_if_revision(
                &leaf,
                text.as_bytes(),
                crate::project_text::PROJECT_TEXT_MAX_BYTES,
                &current.revision(),
            )?;
        } else {
            directory
                .new_file_destination(&leaf, crate::project_text::PROJECT_TEXT_MAX_BYTES)?
                .save(text.as_bytes())
                .map_err(|failed| failed.error)?;
        }
        directory.sync_directory()?;
        directory.identity()?;
        authority.identity()?;
        Ok(())
    };
    work().map_err(error)
}
