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

fn text_bytes(content: &str) -> Result<&[u8], DeveloperSessionHostError> {
    if content.len() > MAX_EDITOR_TEXT_BYTES || content.contains('\0') {
        return Err(invalid(
            "The file exceeds the text limit or contains unsupported content",
        ));
    }
    Ok(content.as_bytes())
}

pub(super) fn create(
    authority: &WorkspaceFileAuthority,
    params: WorkspaceFileCreateParams,
) -> Result<WorkspaceFileResponse, DeveloperSessionHostError> {
    check_root(authority, &params.root_key)?;
    let bytes = text_bytes(&params.content)?;
    authority
        .create_editor_file(&params.path, bytes)
        .map_err(invalid)?;
    read(
        authority,
        WorkspaceFileParams {
            root_key: params.root_key,
            path: params.path,
        },
    )
}

pub(super) fn rename(
    authority: &WorkspaceFileAuthority,
    params: WorkspaceFileRenameParams,
) -> Result<WorkspaceFileRenameResponse, DeveloperSessionHostError> {
    check_root(authority, &params.root_key)?;
    let replaced = authority
        .rename_editor_file(&params.from, &params.to, params.replace)
        .map_err(invalid)?;
    check_root(authority, &params.root_key)?;
    Ok(WorkspaceFileRenameResponse {
        root_key: params.root_key,
        from: params.from,
        to: params.to,
        replaced,
    })
}

pub(super) fn delete(
    authority: &WorkspaceFileAuthority,
    params: WorkspaceFileDeleteParams,
) -> Result<WorkspaceFileDeleteResponse, DeveloperSessionHostError> {
    check_root(authority, &params.root_key)?;
    authority
        .delete_editor_file(&params.path)
        .map_err(invalid)?;
    check_root(authority, &params.root_key)?;
    Ok(WorkspaceFileDeleteResponse {
        root_key: params.root_key,
        path: params.path,
        removed: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path_security::WorkspaceFileAuthority;

    fn grant() -> (tempfile::TempDir, WorkspaceFileAuthority, String) {
        let parent = tempfile::tempdir().expect("parent");
        let root = parent.path().join("grant");
        std::fs::create_dir(&root).expect("grant");
        let authority = WorkspaceFileAuthority::new(&root).expect("authority");
        let key = authority.identity().expect("identity");
        (parent, authority, key)
    }

    #[test]
    fn create_rename_and_delete_stay_inside_the_granted_folder() {
        let (parent, authority, key) = grant();
        let root = parent.path().join("grant");
        let outside = parent.path().join("outside.txt");
        std::fs::write(&outside, "stay").expect("outside");
        std::fs::write(root.join(".mcp.json"), "secret").expect("protected");

        let created = create(
            &authority,
            WorkspaceFileCreateParams {
                root_key: key.clone(),
                path: "notes/hello.txt".into(),
                content: "hello".into(),
            },
        )
        .expect("create");
        assert_eq!(created.content, "hello");
        assert_eq!(
            std::fs::read_to_string(root.join("notes/hello.txt")).expect("created file"),
            "hello"
        );

        assert!(create(
            &authority,
            WorkspaceFileCreateParams {
                root_key: key.clone(),
                path: "../outside.txt".into(),
                content: "changed".into(),
            },
        )
        .is_err());
        assert_eq!(std::fs::read_to_string(&outside).expect("outside"), "stay");
        assert!(delete(
            &authority,
            WorkspaceFileDeleteParams {
                root_key: key.clone(),
                path: ".mcp.json".into(),
            },
        )
        .is_err());
        assert_eq!(
            std::fs::read_to_string(root.join(".mcp.json")).expect("protected"),
            "secret"
        );

        create(
            &authority,
            WorkspaceFileCreateParams {
                root_key: key.clone(),
                path: "notes/other.txt".into(),
                content: "other".into(),
            },
        )
        .expect("other");
        assert!(rename(
            &authority,
            WorkspaceFileRenameParams {
                root_key: key.clone(),
                from: "notes/hello.txt".into(),
                to: "notes/other.txt".into(),
                replace: false,
            },
        )
        .is_err());
        assert_eq!(
            std::fs::read_to_string(root.join("notes/hello.txt")).expect("source"),
            "hello"
        );
        assert_eq!(
            std::fs::read_to_string(root.join("notes/other.txt")).expect("destination"),
            "other"
        );

        let moved = rename(
            &authority,
            WorkspaceFileRenameParams {
                root_key: key.clone(),
                from: "notes/hello.txt".into(),
                to: "notes/other.txt".into(),
                replace: true,
            },
        )
        .expect("replace");
        assert!(moved.replaced);
        assert!(!root.join("notes/hello.txt").exists());
        assert_eq!(
            std::fs::read_to_string(root.join("notes/other.txt")).expect("replaced"),
            "hello"
        );

        create(
            &authority,
            WorkspaceFileCreateParams {
                root_key: key.clone(),
                path: "notes/keep.txt".into(),
                content: "keep".into(),
            },
        )
        .expect("keep");
        delete(
            &authority,
            WorkspaceFileDeleteParams {
                root_key: key,
                path: "notes/other.txt".into(),
            },
        )
        .expect("delete");
        assert!(!root.join("notes/other.txt").exists());
        assert_eq!(
            std::fs::read_to_string(root.join("notes/keep.txt")).expect("kept"),
            "keep"
        );
        assert_eq!(std::fs::read_to_string(&outside).expect("outside"), "stay");
    }
}
