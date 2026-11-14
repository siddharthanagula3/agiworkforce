use super::account_cloud::{changed, connect, failure};
use crate::{
    cloud::{chat, CloudClient, CloudError},
    tier_cache::ManagedRequestContext,
};
use agiworkforce_app_server::DeveloperSessionHostError as HostError;
use agiworkforce_protocol::{
    account_cloud::{CloudHistoryAttachment, CloudHistoryReadParams, CloudHistoryReadResponse},
    attachment_recovery::*,
    cloud_uploads::CloudChatTarget,
};
use anyhow::{ensure, Context, Result};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
mod store;

pub(super) fn supported() -> bool {
    cfg!(unix)
}

pub(super) async fn admit(
    client: &CloudClient,
    context: &ManagedRequestContext,
    target: &CloudChatTarget,
    byte_count: u64,
) -> Result<(), CloudError> {
    if !supported() {
        return Ok(());
    }
    let current = page(client, target).await?;
    if current.conversation.temporary != Some(false) {
        return Ok(());
    }
    let binding = Binding::new(client, context).map_err(local)?;
    let target = target.clone();
    binding
        .run(move |state, account| state.admit(account, &target, byte_count))
        .await
        .map_err(local)
}

#[derive(Clone)]
struct Binding {
    base: PathBuf,
    account: String,
    context: ManagedRequestContext,
}
fn account_key(base: &str, auth_base: &str, subject: &str) -> Result<String> {
    Ok(crate::hex::encode(&Sha256::digest(serde_json::to_vec(&(
        "attachment-recovery-v1",
        base,
        auth_base,
        subject,
    ))?)))
}

impl Binding {
    fn new(client: &CloudClient, context: &ManagedRequestContext) -> Result<Self> {
        ensure!(context.is_current(), "The recovery account changed");
        let subject = context
            .jwt
            .as_deref()
            .and_then(crate::auth::jwt_subject)
            .context("Sign in before using attachment recovery")?;
        let account = account_key(client.base(), client.auth_base(), &subject)?;
        Ok(Self {
            base: crate::config::CliConfig::config_dir()?,
            account,
            context: context.clone(),
        })
    }
    async fn run<T: Send + 'static>(
        &self,
        work: impl FnOnce(&mut store::State, &str) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let binding = self.clone();
        tokio::task::spawn_blocking(move || {
            store::transact(
                &binding.base,
                |state| work(state, &binding.account),
                || binding.context.is_current(),
            )
        })
        .await
        .context("Attachment recovery storage stopped")?
    }
}
async fn page(
    client: &CloudClient,
    target: &CloudChatTarget,
) -> Result<CloudHistoryReadResponse, CloudError> {
    chat::read_history_page(
        client,
        CloudHistoryReadParams {
            scope: target.scope.clone(),
            workspace: Some(target.workspace.clone()),
            conversation_id: target.conversation_id.clone(),
            limit: 1,
            offset: 0,
            latest: false,
            before: None,
        },
    )
    .await
}
fn local(error: anyhow::Error) -> CloudError {
    CloudError::LocalFile(format!("Attachment recovery could not be confirmed. Keep the selection and reload recovery before retrying. {error:#}"))
}

pub(super) async fn uploaded(
    client: &CloudClient,
    context: &ManagedRequestContext,
    target: &CloudChatTarget,
    file: CloudHistoryAttachment,
) -> Result<(), CloudError> {
    if !supported() {
        return Ok(());
    }
    let current = page(client, target).await?;
    let binding = Binding::new(client, context).map_err(local)?;
    let target = target.clone();
    match current.conversation.temporary {
        Some(false) => binding
            .run(move |state, account| state.add(account, &target, file))
            .await
            .map_err(local),
        Some(true) => purge(client, context, &target)
            .await
            .map_err(|error| CloudError::LocalFile(error.to_string())),
        None => Ok(()),
    }
}

pub(super) async fn begin_send(
    client: &CloudClient,
    context: &ManagedRequestContext,
    target: &CloudChatTarget,
    files: &[CloudHistoryAttachment],
    request_id: &str,
    user_message_id: &str,
) -> Result<(), HostError> {
    if files.is_empty() || !supported() {
        return Ok(());
    }
    let current = page(client, target).await.map_err(failure)?;
    if current.conversation.temporary != Some(false) {
        if current.conversation.temporary == Some(true) {
            purge(client, context, target).await?;
        }
        return Ok(());
    }
    let binding = Binding::new(client, context).map_err(|error| failure(local(error)))?;
    let target = target.clone();
    let files = files.to_vec();
    let pending = AttachmentPendingSend {
        request_id: request_id.into(),
        user_message_id: user_message_id.into(),
        asset_ids: files.iter().map(|file| file.asset_id.clone()).collect(),
    };
    binding
        .run(move |state, account| state.begin_send(account, &target, &files, pending))
        .await
        .map_err(|error| failure(local(error)))
}

pub(super) async fn finish_send(
    client: &CloudClient,
    context: &ManagedRequestContext,
    target: &CloudChatTarget,
    request: &str,
    accepted: bool,
) -> Result<(), HostError> {
    if !supported() {
        return Ok(());
    }
    let binding = Binding::new(client, context).map_err(|error| failure(local(error)))?;
    if !binding
        .base
        .join(agiworkforce_sandbox_policy::CLOUD_ATTACHMENT_RECOVERY_DIRECTORY)
        .try_exists()
        .map_err(|error| failure(CloudError::LocalFile(error.to_string())))?
    {
        return Ok(());
    }
    let target = target.clone();
    let request = request.to_owned();
    binding
        .run(move |state, account| state.finish_send(account, &target, &request, accepted))
        .await
        .map_err(|error| failure(local(error)))
}

async fn purge(
    client: &CloudClient,
    context: &ManagedRequestContext,
    target: &CloudChatTarget,
) -> Result<(), HostError> {
    let binding = Binding::new(client, context).map_err(|error| failure(local(error)))?;
    if !binding
        .base
        .join(agiworkforce_sandbox_policy::CLOUD_ATTACHMENT_RECOVERY_DIRECTORY)
        .try_exists()
        .map_err(|error| failure(CloudError::LocalFile(error.to_string())))?
    {
        return Ok(());
    }
    let target = target.clone();
    binding
        .run(move |state, account| state.clear(account, &target))
        .await
        .map_err(|error| failure(local(error)))
}

pub(super) async fn read(
    target: CloudChatTarget,
) -> Result<AttachmentRecoveryReadResponse, HostError> {
    let (client, context, _) = connect(Some(&target.scope))?;
    let current = page(&client, &target).await.map_err(failure)?;
    if !context.is_current() {
        return Err(changed());
    }
    if current.conversation.temporary != Some(false) {
        if current.conversation.temporary == Some(true) {
            purge(&client, &context, &target).await?;
        }
        return Ok(AttachmentRecoveryReadResponse {
            target,
            available: false,
            snapshot: None,
        });
    }
    let binding = Binding::new(&client, &context).map_err(|error| failure(local(error)))?;
    let requested = target.clone();
    let snapshot = binding
        .run(move |state, account| state.snapshot(account, &requested))
        .await
        .map_err(|error| failure(local(error)))?;
    Ok(AttachmentRecoveryReadResponse {
        target,
        available: true,
        snapshot: Some(snapshot),
    })
}

pub(super) async fn change(
    params: AttachmentRecoveryChangeParams,
) -> Result<AttachmentRecoveryChangeResponse, HostError> {
    let (client, context, _) = connect(Some(&params.target.scope))?;
    let binding = Binding::new(&client, &context).map_err(|error| failure(local(error)))?;
    let clear = matches!(params.change, AttachmentRecoveryChange::Clear);
    if !clear {
        let current = page(&client, &params.target).await.map_err(failure)?;
        if current.conversation.archived
            && matches!(params.change, AttachmentRecoveryChange::Restore)
        {
            return Err(HostError::conflict(
                "Restore the conversation before recovering its attachments",
            ));
        }
        if current.conversation.temporary != Some(false) {
            return Err(HostError::conflict(
                "Attachment recovery is unavailable for this conversation",
            ));
        }
    }
    uuid::Uuid::parse_str(&params.epoch)
        .map_err(|_| HostError::invalid_request("The recovery epoch is invalid"))?;
    if let Some(revision) = &params.revision {
        uuid::Uuid::parse_str(revision)
            .map_err(|_| HostError::invalid_request("The recovery revision is invalid"))?;
    }
    if let AttachmentRecoveryChange::Remove { asset_id } = &params.change {
        uuid::Uuid::parse_str(asset_id)
            .map_err(|_| HostError::invalid_request("The attachment identity is invalid"))?;
    }
    binding
        .run(move |state, account| {
            let accepted = state.change(account, &params)?;
            Ok(AttachmentRecoveryChangeResponse {
                accepted,
                target: params.target.clone(),
                snapshot: if clear {
                    None
                } else {
                    Some(state.snapshot(account, &params.target)?)
                },
            })
        })
        .await
        .map_err(|error| failure(local(error)))
}

pub(super) async fn list(
    params: AttachmentRecoveryListParams,
) -> Result<AttachmentRecoveryListResponse, HostError> {
    let (client, context, _) = connect(Some(&params.scope))?;
    let binding = Binding::new(&client, &context).map_err(|error| failure(local(error)))?;
    let workspace = params.workspace.clone();
    let (epoch, entries) = binding
        .run(move |state, account| {
            Ok((
                state.epoch.clone(),
                state
                    .entries
                    .values()
                    .filter(|entry| {
                        entry.account == account
                            && workspace
                                .as_ref()
                                .is_none_or(|workspace| entry.workspace == *workspace)
                    })
                    .cloned()
                    .collect::<Vec<_>>(),
            ))
        })
        .await
        .map_err(|error| failure(local(error)))?;
    let mut selections = Vec::with_capacity(entries.len());
    for entry in entries {
        let target = entry.target(params.scope.clone());
        let current = page(&client, &target).await;
        if !context.is_current() {
            return Err(changed());
        }
        match current {
            Ok(current) if current.conversation.temporary == Some(true) => {
                purge(&client, &context, &target).await?;
            }
            current => {
                let title = current
                    .as_ref()
                    .ok()
                    .filter(|page| page.conversation.temporary == Some(false))
                    .and_then(|page| page.conversation.title.clone());
                let readable = current
                    .as_ref()
                    .is_ok_and(|page| page.conversation.temporary == Some(false));
                selections.push(AttachmentRecoverySummary {
                    target,
                    revision: entry.revision,
                    title,
                    file_count: entry
                        .files
                        .len()
                        .try_into()
                        .context("Too many recovered attachments")
                        .map_err(|error| failure(local(error)))?,
                    pending_send: entry.pending_send.is_some(),
                    readable,
                });
            }
        }
    }
    Ok(AttachmentRecoveryListResponse {
        scope: params.scope,
        workspace: params.workspace,
        epoch,
        selections,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recovery_identity_is_bound_to_the_account_and_both_deployment_endpoints() {
        let account =
            account_key("https://cloud.example", "https://auth.example", "account-a").unwrap();
        assert_eq!(
            account,
            account_key("https://cloud.example", "https://auth.example", "account-a").unwrap()
        );
        for (base, auth, subject) in [
            ("https://other.example", "https://auth.example", "account-a"),
            (
                "https://cloud.example",
                "https://other-auth.example",
                "account-a",
            ),
            ("https://cloud.example", "https://auth.example", "account-b"),
        ] {
            assert_ne!(account, account_key(base, auth, subject).unwrap());
        }
    }
}
