use crate::path_security::DirectoryAuthority;
use agiworkforce_protocol::{
    account_cloud::{CloudConversationWorkspace, CloudHistoryAttachment},
    attachment_recovery::*,
    cloud_uploads::CloudChatTarget,
};
use anyhow::{ensure, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    path::Path,
};

const VERSION: u32 = 1;
const FILE: &str = "selections.json";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Policy {
    max_selections: usize,
    max_storage_bytes: usize,
}
fn policy() -> Result<Policy> {
    Ok(serde_json::from_str(include_str!(
        "../../../../../packages/contracts/cloud-contracts/src/attachment-recovery-contract.json"
    ))?)
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Entry {
    pub account: String,
    pub workspace: CloudConversationWorkspace,
    pub conversation_id: String,
    pub revision: String,
    pub files: Vec<CloudHistoryAttachment>,
    pub pending_send: Option<AttachmentPendingSend>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct State {
    version: u32,
    pub epoch: String,
    pub entries: BTreeMap<String, Entry>,
}

fn key(account: &str, target: &CloudChatTarget) -> Result<String> {
    Ok(crate::hex::encode(&Sha256::digest(serde_json::to_vec(&(
        account,
        &target.workspace,
        &target.conversation_id,
    ))?)))
}
impl State {
    fn validate(&self) -> Result<()> {
        ensure!(
            self.version == VERSION,
            "The attachment recovery format is unsupported; its bytes were retained"
        );
        uuid::Uuid::parse_str(&self.epoch)?;
        let mut accounts = BTreeMap::new();
        for entry in self.entries.values() {
            *accounts.entry(&entry.account).or_insert(0usize) += 1;
        }
        let limit = policy()?.max_selections;
        ensure!(
            accounts.values().all(|count| *count <= limit),
            "Attachment recovery has too many retained selections"
        );
        for (stored_key, entry) in &self.entries {
            uuid::Uuid::parse_str(&entry.conversation_id)?;
            uuid::Uuid::parse_str(&entry.revision)?;
            if let CloudConversationWorkspace::Organization { id } = &entry.workspace {
                uuid::Uuid::parse_str(id)?;
            }
            ensure!(
                entry.account.len() == 64
                    && entry.account.bytes().all(|byte| byte.is_ascii_hexdigit()),
                "Attachment recovery has an invalid account identity"
            );
            let target = entry.target(String::new());
            ensure!(
                *stored_key == key(&entry.account, &target)? && !entry.files.is_empty(),
                "Attachment recovery contains a mismatched or empty selection"
            );
            crate::cloud::attachments::submitted(&entry.files)?;
            ensure!(
                entry.files.iter().all(|file| file.id == file.asset_id),
                "A recovered attachment has an invalid identity"
            );
            if let Some(pending) = &entry.pending_send {
                uuid::Uuid::parse_str(&pending.request_id)?;
                uuid::Uuid::parse_str(&pending.user_message_id)?;
                let ids = pending.asset_ids.iter().collect::<HashSet<_>>();
                ensure!(
                    !ids.is_empty()
                        && ids.len() == pending.asset_ids.len()
                        && ids
                            .iter()
                            .all(|id| entry.files.iter().any(|file| &file.asset_id == *id)),
                    "The pending attachment send has invalid file identities"
                );
            }
        }
        Ok(())
    }
    pub(super) fn snapshot(
        &self,
        account: &str,
        target: &CloudChatTarget,
    ) -> Result<AttachmentRecoverySnapshot> {
        let entry = self.entries.get(&key(account, target)?);
        Ok(AttachmentRecoverySnapshot {
            target: target.clone(),
            epoch: self.epoch.clone(),
            revision: entry.map(|entry| entry.revision.clone()),
            files: entry.map(|entry| entry.files.clone()).unwrap_or_default(),
            pending_send: entry.and_then(|entry| entry.pending_send.clone()),
        })
    }
    pub(super) fn add(
        &mut self,
        account: &str,
        target: &CloudChatTarget,
        mut file: CloudHistoryAttachment,
    ) -> Result<()> {
        file.id = file.asset_id.clone();
        let identity = key(account, target)?;
        let entry = self.entries.entry(identity).or_insert_with(|| Entry {
            account: account.into(),
            workspace: target.workspace.clone(),
            conversation_id: target.conversation_id.clone(),
            revision: uuid::Uuid::new_v4().to_string(),
            files: Vec::new(),
            pending_send: None,
        });
        if let Some(previous) = entry
            .files
            .iter()
            .find(|previous| previous.asset_id == file.asset_id)
        {
            ensure!(
                *previous == file,
                "A recovered attachment changed its metadata"
            );
            return Ok(());
        }
        entry.files.push(file);
        crate::cloud::attachments::submitted(&entry.files)?;
        entry.revision = uuid::Uuid::new_v4().to_string();
        self.validate()
    }
    pub(super) fn begin_send(
        &mut self,
        account: &str,
        target: &CloudChatTarget,
        files: &[CloudHistoryAttachment],
        pending: AttachmentPendingSend,
    ) -> Result<()> {
        for file in files {
            self.add(account, target, file.clone())?;
        }
        let entry = self.entries.get_mut(&key(account, target)?).context("The attachment selection is not retained on this device. Review recovered attachments or upload the files again before sending.")?;
        ensure!(
            files
                .iter()
                .all(|file| entry
                    .files
                    .iter()
                    .any(|stored| stored.asset_id == file.asset_id
                        && stored.name == file.name
                        && stored.mime_type == file.mime_type
                        && stored.kind == file.kind
                        && stored.size == file.size)),
            "The selected files changed; review recovered attachments before sending"
        );
        if let Some(previous) = &entry.pending_send {
            ensure!(*previous == pending, "An earlier attachment send is unconfirmed. Check its saved conversation before restoring the selection.");
            return Ok(());
        }
        entry.pending_send = Some(pending);
        entry.revision = uuid::Uuid::new_v4().to_string();
        self.validate()
    }
    pub(super) fn finish_send(
        &mut self,
        account: &str,
        target: &CloudChatTarget,
        request: &str,
        accepted: bool,
    ) -> Result<()> {
        let identity = key(account, target)?;
        let Some(entry) = self.entries.get_mut(&identity) else {
            return Ok(());
        };
        let Some(pending) = entry
            .pending_send
            .as_ref()
            .filter(|pending| pending.request_id == request)
            .cloned()
        else {
            return Ok(());
        };
        if accepted {
            entry
                .files
                .retain(|file| !pending.asset_ids.contains(&file.asset_id));
        }
        entry.pending_send = None;
        entry.revision = uuid::Uuid::new_v4().to_string();
        if entry.files.is_empty() {
            self.entries.remove(&identity);
        }
        self.validate()
    }
    pub(super) fn clear(&mut self, account: &str, target: &CloudChatTarget) -> Result<()> {
        self.entries.remove(&key(account, target)?);
        Ok(())
    }
    pub(super) fn admit(
        &self,
        account: &str,
        target: &CloudChatTarget,
        byte_count: u64,
    ) -> Result<()> {
        let current = self.snapshot(account, target)?;
        ensure!(
            current.pending_send.is_none(),
            "Check the unconfirmed attachment send before uploading another file"
        );
        ensure!(current.revision.is_some() || self.entries.values().filter(|entry| entry.account == account).count() < policy()?.max_selections, "Local attachment recovery is full. Send or discard recovered selections before uploading more files.");
        crate::cloud::attachments::admit_additional(&current.files, byte_count)?;
        Ok(())
    }
    pub(super) fn change(
        &mut self,
        account: &str,
        params: &AttachmentRecoveryChangeParams,
    ) -> Result<bool> {
        let current = self.snapshot(account, &params.target)?;
        if self.epoch != params.epoch {
            return Ok(false);
        }
        let same_value = match &params.change {
            AttachmentRecoveryChange::Restore => false,
            AttachmentRecoveryChange::Clear => current.files.is_empty(),
            AttachmentRecoveryChange::Remove { asset_id } => {
                !current.files.iter().any(|file| file.asset_id == *asset_id)
            }
        };
        if current.revision != params.revision && !same_value {
            return Ok(false);
        }
        if same_value {
            return Ok(true);
        }
        match &params.change {
            AttachmentRecoveryChange::Clear => self.clear(account, &params.target)?,
            change => {
                let Some(entry) = self.entries.get_mut(&key(account, &params.target)?) else {
                    return Ok(true);
                };
                match change {
                    AttachmentRecoveryChange::Restore => entry.pending_send = None,
                    AttachmentRecoveryChange::Remove { asset_id } => {
                        ensure!(
                            entry.pending_send.is_none(),
                            "Review the unconfirmed send before removing its recovered files"
                        );
                        entry.files.retain(|file| file.asset_id != *asset_id);
                    }
                    AttachmentRecoveryChange::Clear => unreachable!(),
                }
                entry.revision = uuid::Uuid::new_v4().to_string();
                if entry.files.is_empty() {
                    self.clear(account, &params.target)?;
                }
            }
        }
        self.validate()?;
        Ok(true)
    }
}
impl Entry {
    pub(super) fn target(&self, scope: String) -> CloudChatTarget {
        CloudChatTarget {
            scope,
            workspace: self.workspace.clone(),
            conversation_id: self.conversation_id.clone(),
        }
    }
}

pub(super) fn transact<T>(
    base: &Path,
    work: impl FnOnce(&mut State) -> Result<T>,
    current: impl Fn() -> bool,
) -> Result<T> {
    ensure!(current(), "The recovery account or deployment changed");
    let policy = policy()?;
    let directory = DirectoryAuthority::open(base)?.private_child(Path::new(
        agiworkforce_sandbox_policy::CLOUD_ATTACHMENT_RECOVERY_DIRECTORY,
    ))?;
    let _lock = directory.recovery_lock()?;
    let before = directory.read_file(Path::new(FILE), policy.max_storage_bytes as u64)?;
    let mut state = if let Some(file) = &before {
        serde_json::from_slice::<State>(&file.bytes)
            .context("Attachment recovery could not be read; its bytes were retained")?
    } else {
        State {
            version: VERSION,
            epoch: uuid::Uuid::new_v4().to_string(),
            entries: BTreeMap::new(),
        }
    };
    state.validate()?;
    let result = work(&mut state)?;
    state.validate()?;
    let bytes = serde_json::to_vec(&state)?;
    ensure!(bytes.len() <= policy.max_storage_bytes, "Local attachment recovery is full. Send or discard recovered selections before uploading more files.");
    ensure!(current(), "The recovery account or deployment changed");
    if before.as_ref().is_none_or(|file| file.bytes != bytes) {
        directory.replace_file(
            Path::new(FILE),
            &bytes,
            true,
            policy.max_storage_bytes as u64,
        )?;
    }
    directory.sync_directory()?;
    directory.identity()?;
    ensure!(current(), "The recovery account or deployment changed");
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use agiworkforce_protocol::account_cloud::CloudHistoryAttachmentKind;
    fn target() -> CloudChatTarget {
        CloudChatTarget {
            scope: "current-session".into(),
            workspace: CloudConversationWorkspace::Personal,
            conversation_id: uuid::Uuid::new_v4().to_string(),
        }
    }
    fn file(name: &str) -> CloudHistoryAttachment {
        let id = uuid::Uuid::new_v4().to_string();
        CloudHistoryAttachment {
            id: id.clone(),
            asset_id: id,
            kind: CloudHistoryAttachmentKind::File,
            name: name.into(),
            mime_type: Some("text/plain".into()),
            size: Some(3),
        }
    }
    fn account() -> String {
        "a".repeat(64)
    }

    #[cfg(not(unix))]
    #[test]
    fn recovery_storage_is_refused_where_private_permissions_are_unavailable() {
        let directory = tempfile::tempdir().unwrap();
        let target = target();
        let owner = account();
        let error = transact(
            directory.path(),
            |state| state.add(&owner, &target, file("refused.txt")),
            || true,
        )
        .unwrap_err();
        assert!(error.to_string().contains("unavailable on this platform"));
        assert!(!directory
            .path()
            .join(agiworkforce_sandbox_policy::CLOUD_ATTACHMENT_RECOVERY_DIRECTORY)
            .exists());
        assert!(!super::super::supported());
    }

    #[cfg(unix)]
    #[test]
    fn selections_survive_reopening_without_file_bytes_paths_or_upload_tokens() {
        let directory = tempfile::tempdir().unwrap();
        let target = target();
        let file = file("retained 東京.txt");
        let owner = account();
        transact(
            directory.path(),
            |state| state.add(&owner, &target, file.clone()),
            || true,
        )
        .unwrap();
        let recovered = transact(
            directory.path(),
            |state| state.snapshot(&owner, &target),
            || true,
        )
        .unwrap();
        assert_eq!(recovered.files, vec![file]);
        let path = directory
            .path()
            .join(agiworkforce_sandbox_policy::CLOUD_ATTACHMENT_RECOVERY_DIRECTORY)
            .join(FILE);
        let stored = std::fs::read_to_string(&path).unwrap();
        assert!(
            !stored.contains("upload_url")
                && !stored.contains("session")
                && !stored.contains("SOURCE_BYTES_MARKER")
                && !stored.contains(directory.path().to_str().unwrap())
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
            assert_eq!(
                std::fs::metadata(path.parent().unwrap())
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o700
            );
        }
        let mut next_session = target.clone();
        next_session.scope = "new-session-same-account".into();
        let fresh = transact(
            directory.path(),
            |state| state.snapshot(&owner, &next_session),
            || true,
        )
        .unwrap();
        assert_eq!(fresh.files, recovered.files);
        assert_eq!(fresh.target.scope, "new-session-same-account");
        let foreign = transact(
            directory.path(),
            |state| state.snapshot(&"b".repeat(64), &target),
            || true,
        )
        .unwrap();
        assert!(foreign.files.is_empty());
        let mut another_workspace = target.clone();
        another_workspace.workspace = CloudConversationWorkspace::Organization {
            id: uuid::Uuid::new_v4().to_string(),
        };
        assert!(transact(
            directory.path(),
            |state| state.snapshot(&owner, &another_workspace),
            || true
        )
        .unwrap()
        .files
        .is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn stale_discard_and_restore_cannot_overwrite_another_windows_selection() {
        let directory = tempfile::tempdir().unwrap();
        let target = target();
        let owner = account();
        transact(
            directory.path(),
            |state| state.add(&owner, &target, file("first.txt")),
            || true,
        )
        .unwrap();
        let before = transact(
            directory.path(),
            |state| state.snapshot(&owner, &target),
            || true,
        )
        .unwrap();
        transact(
            directory.path(),
            |state| state.add(&owner, &target, file("second.txt")),
            || true,
        )
        .unwrap();
        for change in [
            AttachmentRecoveryChange::Clear,
            AttachmentRecoveryChange::Restore,
        ] {
            let params = AttachmentRecoveryChangeParams {
                target: target.clone(),
                epoch: before.epoch.clone(),
                revision: before.revision.clone(),
                change,
            };
            assert!(!transact(
                directory.path(),
                |state| state.change(&owner, &params),
                || true
            )
            .unwrap());
        }
        assert_eq!(
            transact(
                directory.path(),
                |state| state.snapshot(&owner, &target),
                || true
            )
            .unwrap()
            .files
            .len(),
            2
        );
    }

    #[cfg(unix)]
    #[test]
    fn interrupted_sends_require_review_and_consumption_preserves_later_uploads() {
        let directory = tempfile::tempdir().unwrap();
        let target = target();
        let owner = account();
        let first = file("first.txt");
        let second = file("second.txt");
        let pending = AttachmentPendingSend {
            request_id: uuid::Uuid::new_v4().to_string(),
            user_message_id: uuid::Uuid::new_v4().to_string(),
            asset_ids: vec![first.asset_id.clone()],
        };
        transact(
            directory.path(),
            |state| {
                state.add(&owner, &target, first.clone())?;
                state.begin_send(
                    &owner,
                    &target,
                    std::slice::from_ref(&first),
                    pending.clone(),
                )
            },
            || true,
        )
        .unwrap();
        let interrupted = transact(
            directory.path(),
            |state| state.snapshot(&owner, &target),
            || true,
        )
        .unwrap();
        assert_eq!(interrupted.pending_send, Some(pending.clone()));
        let different = AttachmentPendingSend {
            request_id: uuid::Uuid::new_v4().to_string(),
            ..pending.clone()
        };
        assert!(transact(
            directory.path(),
            |state| state.begin_send(&owner, &target, std::slice::from_ref(&first), different),
            || true
        )
        .is_err());
        transact(
            directory.path(),
            |state| state.add(&owner, &target, second.clone()),
            || true,
        )
        .unwrap();
        transact(
            directory.path(),
            |state| state.finish_send(&owner, &target, &pending.request_id, true),
            || true,
        )
        .unwrap();
        let current = transact(
            directory.path(),
            |state| state.snapshot(&owner, &target),
            || true,
        )
        .unwrap();
        assert_eq!(current.files, vec![second]);
        assert!(current.pending_send.is_none());
    }

    #[cfg(unix)]
    #[test]
    fn known_refusal_and_explicit_restore_retain_files_without_replaying_a_send() {
        let directory = tempfile::tempdir().unwrap();
        let target = target();
        let owner = account();
        let file = file("retained.txt");
        let pending = AttachmentPendingSend {
            request_id: uuid::Uuid::new_v4().to_string(),
            user_message_id: uuid::Uuid::new_v4().to_string(),
            asset_ids: vec![file.asset_id.clone()],
        };
        transact(
            directory.path(),
            |state| {
                state.begin_send(
                    &owner,
                    &target,
                    std::slice::from_ref(&file),
                    pending.clone(),
                )
            },
            || true,
        )
        .unwrap();
        let snapshot = transact(
            directory.path(),
            |state| state.snapshot(&owner, &target),
            || true,
        )
        .unwrap();
        let params = AttachmentRecoveryChangeParams {
            target: target.clone(),
            epoch: snapshot.epoch,
            revision: snapshot.revision,
            change: AttachmentRecoveryChange::Restore,
        };
        assert!(transact(
            directory.path(),
            |state| state.change(&owner, &params),
            || true
        )
        .unwrap());
        let restored = transact(
            directory.path(),
            |state| state.snapshot(&owner, &target),
            || true,
        )
        .unwrap();
        assert_eq!(restored.files, vec![file.clone()]);
        assert!(restored.pending_send.is_none());
        transact(
            directory.path(),
            |state| {
                state.begin_send(
                    &owner,
                    &target,
                    std::slice::from_ref(&file),
                    pending.clone(),
                )?;
                state.finish_send(&owner, &target, &pending.request_id, false)
            },
            || true,
        )
        .unwrap();
        assert_eq!(
            transact(
                directory.path(),
                |state| state.snapshot(&owner, &target),
                || true
            )
            .unwrap()
            .files,
            vec![file]
        );
    }

    #[cfg(unix)]
    #[test]
    fn corrupt_unknown_and_busy_storage_never_get_replaced_with_empty_state() {
        let base = tempfile::tempdir().unwrap();
        let directory = DirectoryAuthority::open(base.path())
            .unwrap()
            .private_child(Path::new(
                agiworkforce_sandbox_policy::CLOUD_ATTACHMENT_RECOVERY_DIRECTORY,
            ))
            .unwrap();
        directory
            .replace_file(Path::new(FILE), b"unknown bytes", true, 1024)
            .unwrap();
        assert!(transact(base.path(), |_| Ok(()), || true).is_err());
        assert_eq!(
            directory
                .read_file(Path::new(FILE), 1024)
                .unwrap()
                .unwrap()
                .bytes,
            b"unknown bytes"
        );
        let _lock = directory.recovery_lock().unwrap();
        assert!(transact(base.path(), |_| Ok(()), || true).is_err());
    }

    #[test]
    fn recovery_namespace_is_unreadable_to_tools_even_when_it_is_the_granted_root() {
        let base = tempfile::tempdir().unwrap();
        let root = base
            .path()
            .join(agiworkforce_sandbox_policy::CLOUD_ATTACHMENT_RECOVERY_DIRECTORY);
        std::fs::create_dir(&root).unwrap();
        let path = root.join(FILE);
        std::fs::write(&path, b"private recovered references").unwrap();
        assert!(crate::path_security::is_protected_path_with_cwd(
            &path, &root
        ));
        assert!(DirectoryAuthority::selected_file(&path).is_err());
        assert!(
            agiworkforce_sandbox_policy::agiworkforce_home_secret_entries(base.path())
                .contains(&root)
        );
    }
}
