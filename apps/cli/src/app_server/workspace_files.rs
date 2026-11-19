use crate::path_security::WorkspaceFileAuthority;
use agiworkforce_app_server::DeveloperSessionHostError;
use agiworkforce_protocol::workspace_files::*;

pub(super) fn check_root(
    authority: &WorkspaceFileAuthority,
    root: &str,
) -> Result<(), DeveloperSessionHostError> {
    let current = authority
        .identity()
        .map_err(|error| DeveloperSessionHostError::conflict(error.to_string()))?;
    if current != root {
        return Err(DeveloperSessionHostError::conflict(
            "The selected coding folder changed. Reopen it before accessing files.",
        ));
    }
    Ok(())
}

fn invalid(error: impl std::fmt::Display) -> DeveloperSessionHostError {
    DeveloperSessionHostError::invalid_request(error.to_string())
}

pub(super) fn list(
    authority: &WorkspaceFileAuthority,
    params: WorkspaceDirectoryParams,
) -> Result<WorkspaceDirectoryResponse, DeveloperSessionHostError> {
    check_root(authority, &params.root_key)?;
    let root = params.root_key.clone();
    let response = authority.editor_directory(params).map_err(invalid)?;
    check_root(authority, &root)?;
    Ok(response)
}

pub(super) fn read(
    authority: &WorkspaceFileAuthority,
    params: WorkspaceFileParams,
) -> Result<WorkspaceFileResponse, DeveloperSessionHostError> {
    check_root(authority, &params.root_key)?;
    let (directory, path) = authority.editor_file(&params.path).map_err(invalid)?;
    let file = directory
        .read_file(&path, MAX_EDITOR_TEXT_BYTES as u64)
        .map_err(invalid)?
        .ok_or_else(|| DeveloperSessionHostError::not_found("The file is no longer available"))?;
    let revision = file.revision();
    let content = String::from_utf8(file.bytes)
        .map_err(|_| invalid("The editor opens UTF-8 text files only"))?;
    if content.contains('\0') {
        return Err(invalid("Binary files cannot be opened in the text editor"));
    }
    check_root(authority, &params.root_key)?;
    Ok(WorkspaceFileResponse {
        root_key: params.root_key,
        path: params.path,
        content,
        revision,
    })
}

pub(super) fn write(
    authority: &WorkspaceFileAuthority,
    params: WorkspaceFileWriteParams,
) -> Result<WorkspaceFileWriteResponse, DeveloperSessionHostError> {
    check_root(authority, &params.root_key)?;
    if params.content.len() > MAX_EDITOR_TEXT_BYTES
        || params.content.contains('\0')
        || params.revision.is_empty()
    {
        return Err(invalid(
            "The edited file exceeds the text limit or contains unsupported content",
        ));
    }
    let (directory, path) = authority.editor_file(&params.path).map_err(invalid)?;
    let changed = directory
        .replace_file_if_revision(
            &path,
            params.content.as_bytes(),
            MAX_EDITOR_TEXT_BYTES as u64,
            &params.revision,
        )
        .map_err(|error| DeveloperSessionHostError::conflict(error.to_string()))?;
    let saved = read(
        authority,
        WorkspaceFileParams {
            root_key: params.root_key.clone(),
            path: params.path.clone(),
        },
    )?;
    if saved.content != params.content {
        return Err(DeveloperSessionHostError::conflict("The file changed while saving. Your editor text is retained; check the file before retrying."));
    }
    Ok(WorkspaceFileWriteResponse {
        root_key: saved.root_key,
        path: saved.path,
        revision: saved.revision,
        changed,
    })
}
