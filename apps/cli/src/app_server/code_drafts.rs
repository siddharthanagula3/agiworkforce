use crate::path_security::{DirectoryAuthority, WorkspaceFileAuthority};
use agiworkforce_app_server::DeveloperSessionHostError;
use agiworkforce_protocol::code_drafts::{
    CodeDraftParams, CodeDraftSnapshot, CodeDraftWriteParams, CodeDraftWriteResponse,
    ComposerDraftStore,
};
use anyhow::{Context, Result};
use std::path::Path;

const STATE_FILE: &str = "drafts.json";
const DIRECTORY: &str = "code-drafts";

fn draft_limit() -> usize {
    crate::cloud::conversation_contract::contract().draft_max_length
}

fn save(directory: &DirectoryAuthority, store: &ComposerDraftStore) -> Result<()> {
    let bytes = store.to_bytes()?;
    directory.identity()?;
    directory.replace_file(Path::new(STATE_FILE), &bytes, true, bytes.len() as u64)?;
    directory.sync_directory()?;
    directory.identity()?;
    Ok(())
}

fn load(directory: &DirectoryAuthority) -> Result<ComposerDraftStore> {
    if let Some(file) = directory.read_file(Path::new(STATE_FILE), u64::MAX)? {
        return ComposerDraftStore::from_bytes(&file.bytes)
            .context("Coding drafts could not be read; the saved bytes were retained");
    }
    let store = ComposerDraftStore::new();
    save(directory, &store)?;
    Ok(store)
}

fn error(error: anyhow::Error) -> DeveloperSessionHostError {
    DeveloperSessionHostError::conflict(format!(
        "The coding draft could not be confirmed. Keep the composer text and reload it before retrying. {error:#}"
    ))
}

fn open_store(base: &Path) -> Result<DirectoryAuthority> {
    DirectoryAuthority::open(base)?.private_child(Path::new(DIRECTORY))
}

pub(super) fn read(
    base: &Path,
    authority: &WorkspaceFileAuthority,
    params: CodeDraftParams,
) -> Result<CodeDraftSnapshot, DeveloperSessionHostError> {
    let work = || -> Result<_> {
        super::workspace_files::check_root(authority, &params.root_key)
            .map_err(anyhow::Error::new)?;
        let directory = open_store(base)?;
        let _lock = directory.recovery_lock()?;
        let store = load(&directory)?;
        directory.sync_directory()?;
        let snapshot = store.read(&params)?;
        super::workspace_files::check_root(authority, &params.root_key)
            .map_err(anyhow::Error::new)?;
        directory.identity()?;
        Ok(snapshot)
    };
    work().map_err(error)
}

pub(super) fn write(
    base: &Path,
    authority: &WorkspaceFileAuthority,
    params: CodeDraftWriteParams,
) -> Result<CodeDraftWriteResponse, DeveloperSessionHostError> {
    let work = || -> Result<_> {
        super::workspace_files::check_root(authority, &params.root_key)
            .map_err(anyhow::Error::new)?;
        let directory = open_store(base)?;
        let _lock = directory.recovery_lock()?;
        let mut store = load(&directory)?;
        let response = store.write(params, draft_limit())?;
        if response.accepted {
            super::workspace_files::check_root(authority, &response.current.root_key)
                .map_err(anyhow::Error::new)?;
            save(&directory, &store)?;
        }
        directory.identity()?;
        Ok(response)
    };
    work().map_err(error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path_security::WorkspaceFileAuthority;
    use agiworkforce_protocol::code_drafts::CodeDraftChange;

    #[test]
    fn a_second_owner_restores_the_unsent_draft_and_a_newer_write_wins() {
        let workspace = tempfile::tempdir().expect("workspace");
        let store = tempfile::tempdir().expect("store");
        let authority = WorkspaceFileAuthority::new(workspace.path()).expect("authority");
        let root_key = authority.identity().expect("identity");
        let target = CodeDraftParams {
            root_key: root_key.clone(),
            thread_id: "thread-1".into(),
        };
        let first = read(store.path(), &authority, target.clone()).expect("read");
        assert!(first.text.is_none());
        let saved = write(
            store.path(),
            &authority,
            CodeDraftWriteParams {
                root_key: root_key.clone(),
                thread_id: target.thread_id.clone(),
                epoch: first.epoch.clone(),
                revision: first.revision.clone(),
                change: CodeDraftChange::Set {
                    text: "unsent".into(),
                },
            },
        )
        .expect("save");
        assert!(saved.accepted);
        let restored = read(store.path(), &authority, target.clone()).expect("second owner");
        assert_eq!(restored.text.as_deref(), Some("unsent"));
        let newer = write(
            store.path(),
            &authority,
            CodeDraftWriteParams {
                root_key: root_key.clone(),
                thread_id: target.thread_id.clone(),
                epoch: restored.epoch.clone(),
                revision: restored.revision.clone(),
                change: CodeDraftChange::Set {
                    text: "newer".into(),
                },
            },
        )
        .expect("newer");
        assert_eq!(newer.current.text.as_deref(), Some("newer"));
        let stale = write(
            store.path(),
            &authority,
            CodeDraftWriteParams {
                root_key: root_key.clone(),
                thread_id: target.thread_id.clone(),
                epoch: restored.epoch,
                revision: restored.revision,
                change: CodeDraftChange::Set {
                    text: "older".into(),
                },
            },
        )
        .expect("stale");
        assert!(!stale.accepted);
        assert_eq!(stale.current.text.as_deref(), Some("newer"));
        let cleared = write(
            store.path(),
            &authority,
            CodeDraftWriteParams {
                root_key,
                thread_id: target.thread_id,
                epoch: newer.current.epoch,
                revision: newer.current.revision,
                change: CodeDraftChange::Clear,
            },
        )
        .expect("clear");
        assert!(cleared.accepted);
        assert!(cleared.current.text.is_none());
        assert!(!store.path().join("editor-recovery").exists());
        assert!(store
            .path()
            .join("code-drafts")
            .join("drafts.json")
            .is_file());
        assert_eq!(
            std::fs::read_dir(workspace.path())
                .expect("workspace")
                .count(),
            0
        );
    }
}
