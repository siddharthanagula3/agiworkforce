use agiworkforce_protocol::workspace_files::{
    WorkspaceFileCreateParams, WorkspaceFileDeleteParams, WorkspaceFileRenameParams,
};
use anyhow::{ensure, Result};

fn relative(path: &str) -> Result<()> {
    ensure!(
        !path.is_empty()
            && !path.contains(['\\', '\0'])
            && path
                .split('/')
                .all(|part| !part.is_empty() && part != "." && part != ".."),
        "Use a relative path inside the coding folder"
    );
    Ok(())
}

pub fn create_params(
    root_key: &str,
    path: &str,
    content: &str,
    max_bytes: usize,
) -> Result<WorkspaceFileCreateParams> {
    ensure!(
        !root_key.is_empty(),
        "Open a coding folder before creating a file"
    );
    relative(path)?;
    ensure!(
        content.len() <= max_bytes && !content.contains('\0'),
        "The file exceeds the text limit or contains unsupported content"
    );
    Ok(WorkspaceFileCreateParams {
        root_key: root_key.to_owned(),
        path: path.to_owned(),
        content: content.to_owned(),
    })
}

pub fn delete_detail(path: &str) -> String {
    format!("This removes {path} from the coding folder. The removal cannot be undone.")
}

pub fn delete_params(
    root_key: &str,
    path: &str,
    detail: &str,
    confirmed: bool,
) -> Result<WorkspaceFileDeleteParams> {
    ensure!(
        !root_key.is_empty(),
        "Open a coding folder before deleting a file"
    );
    relative(path)?;
    ensure!(confirmed, "Confirm before deleting the file");
    ensure!(
        detail.contains(path),
        "The confirmation must name the file being removed"
    );
    Ok(WorkspaceFileDeleteParams {
        root_key: root_key.to_owned(),
        path: path.to_owned(),
    })
}

pub fn rename_detail(from: &str, to: &str, replaces: bool) -> String {
    if replaces {
        format!("This moves {from} onto {to} and replaces the file already at {to}.")
    } else {
        format!("This moves {from} to {to}.")
    }
}

pub fn rename_params(
    root_key: &str,
    from: &str,
    to: &str,
    detail: &str,
    confirmed: bool,
    replaces: bool,
) -> Result<WorkspaceFileRenameParams> {
    ensure!(
        !root_key.is_empty(),
        "Open a coding folder before renaming a file"
    );
    relative(from)?;
    relative(to)?;
    ensure!(from != to, "Choose a different relative path");
    if replaces {
        ensure!(confirmed, "Confirm before replacing the destination file");
        ensure!(
            detail.contains(from) && detail.contains(to),
            "The confirmation must name the file being replaced"
        );
    }
    Ok(WorkspaceFileRenameParams {
        root_key: root_key.to_owned(),
        from: from.to_owned(),
        to: to.to_owned(),
        replace: replaces,
    })
}
