use super::account_cloud::{changed, connect, failure};
use super::account_service::AccountService;
use crate::{
    cloud::{
        client::{CloudClient, CloudError},
        uploads as upload,
    },
    tier_cache::ManagedRequestContext,
};
use agiworkforce_app_server::DeveloperSessionHostError as HostError;
use agiworkforce_protocol::cloud_uploads::*;
use bytes::Bytes;
use std::future::Future;
use std::sync::Arc;
use tokio::sync::{watch, Mutex, OwnedSemaphorePermit, RwLock, Semaphore};

pub(super) struct AccountUploads {
    slot: Mutex<Option<Arc<Entry>>>,
    released: Mutex<Option<CloudUploadId>>,
    capacity: Arc<Semaphore>,
    lifecycle: RwLock<()>,
    stopped: watch::Sender<bool>,
    tasks: super::account_file_tasks::AccountFileTasks,
}
struct Entry {
    review: CloudUploadReview,
    bytes: Bytes,
    context: ManagedRequestContext,
    surface: &'static str,
    state: Mutex<UploadState>,
    cancelled: watch::Sender<bool>,
    _capacity: OwnedSemaphorePermit,
}
struct UploadState {
    snapshot: CloudUploadSnapshot,
    session: Option<upload::Session>,
    completing: bool,
}
impl Default for AccountUploads {
    fn default() -> Self {
        Self {
            slot: Mutex::new(None),
            released: Mutex::new(None),
            capacity: Arc::new(Semaphore::new(1)),
            lifecycle: RwLock::new(()),
            stopped: watch::channel(false).0,
            tasks: Default::default(),
        }
    }
}
impl AccountUploads {
    pub(super) async fn prepare(
        &self,
        params: CloudUploadPrepareParams,
        surface: &'static str,
    ) -> Result<CloudUploadSnapshot, HostError> {
        let _lifecycle = self.lifecycle.read().await;
        let mut stopped = self.stopped.subscribe();
        if *stopped.borrow() {
            return Err(HostError::unavailable("File uploads are shutting down"));
        }
        tokio::select! {
            biased;
            _ = stopped.wait_for(|value| *value) => Err(HostError::unavailable("File selection stopped during shutdown")),
            result = self.prepare_inner(params, surface) => result,
        }
    }
    async fn prepare_inner(
        &self,
        params: CloudUploadPrepareParams,
        surface: &'static str,
    ) -> Result<CloudUploadSnapshot, HostError> {
        let (client, context, _) = connect(Some(params.target.scope()))?;
        if !context.is_current() {
            return Err(changed());
        }
        let stale = {
            let mut slot = self.slot.lock().await;
            if slot
                .as_ref()
                .is_some_and(|entry| !entry.context.is_current())
            {
                slot.take()
            } else {
                None
            }
        };
        if let Some(stale) = stale {
            stale.cancelled.send_replace(true);
            self.drain().await;
        }
        let capacity = self.capacity.clone().try_acquire_owned().map_err(|_| {
            HostError::conflict(
                "Close the current file-upload review before selecting another file",
            )
        })?;
        let client = client
            .with_source_surface(surface)
            .with_workspace(Some(params.target.workspace()))
            .map_err(failure)?;
        let destination_name = super::upload_destination::writable(&client, &params.target)
            .await
            .map_err(failure)?;
        let selected_target = params.target.clone();
        let (capacity, file_name, mime_type, bytes) = tokio::task::spawn_blocking(move || {
            super::upload_destination::snapshot(
                &selected_target,
                &params.path,
                params.selected_at_ms,
            )
            .map(|(name, mime, bytes)| (capacity, name, mime, bytes))
        })
        .await
        .map_err(|error| HostError::unavailable(error.to_string()))?
        .map_err(failure)?;
        if !context.is_current() || *self.stopped.borrow() {
            return Err(changed());
        }
        if let CloudUploadTarget::Chat { chat } = &params.target {
            super::attachment_recovery::admit(&client, &context, chat, bytes.len() as u64)
                .await
                .map_err(failure)?;
        }
        let review = CloudUploadReview {
            upload: CloudUploadId {
                target: params.target,
                id: uuid::Uuid::new_v4().to_string(),
            },
            destination_name,
            file_name,
            mime_type,
            byte_count: bytes.len() as u64,
            checksum_sha256: upload::checksum(&bytes),
        };
        let snapshot = CloudUploadSnapshot {
            review: review.clone(),
            phase: CloudUploadPhase::Ready,
            uploaded_bytes: 0,
            file: None,
            error: None,
            uncertain: false,
            retryable: true,
            cancelable: true,
        };
        let entry = Arc::new(Entry {
            review,
            bytes,
            context,
            surface,
            cancelled: watch::channel(false).0,
            _capacity: capacity,
            state: Mutex::new(UploadState {
                snapshot: snapshot.clone(),
                session: None,
                completing: false,
            }),
        });
        *self.slot.lock().await = Some(entry);
        Ok(snapshot)
    }
    async fn entry(&self, params: &CloudUploadId, current: bool) -> Result<Arc<Entry>, HostError> {
        let entry = self
            .slot
            .lock()
            .await
            .as_ref()
            .filter(|entry| entry.review.upload == *params)
            .cloned()
            .ok_or_else(|| {
                HostError::not_found("This file-upload review is no longer available")
            })?;
        if current && !entry.context.is_current() {
            return Err(changed());
        }
        Ok(entry)
    }
    pub(super) async fn read(
        &self,
        params: CloudUploadId,
    ) -> Result<CloudUploadSnapshot, HostError> {
        let entry = self.entry(&params, true).await?;
        let snapshot = entry.state.lock().await.snapshot.clone();
        Ok(snapshot)
    }
    pub(super) async fn start(
        &self,
        params: CloudUploadId,
    ) -> Result<CloudUploadSnapshot, HostError> {
        let _lifecycle = self.lifecycle.read().await;
        if *self.stopped.borrow() {
            return Err(HostError::unavailable("File uploads are shutting down"));
        }
        let entry = self.entry(&params, true).await?;
        let mut state = entry.state.lock().await;
        if state.snapshot.phase.running() || state.snapshot.phase == CloudUploadPhase::Succeeded {
            return Ok(state.snapshot.clone());
        }
        if !state.snapshot.retryable {
            return Err(HostError::conflict("This upload cannot be replayed. Review its status and check uploaded files before selecting another file."));
        }
        state.snapshot.phase = if state.completing {
            CloudUploadPhase::Completing
        } else {
            CloudUploadPhase::Uploading
        };
        state.snapshot.error = None;
        self.track(entry.clone(), entry.clone().run()).await;
        Ok(state.snapshot.clone())
    }
    pub(super) async fn cancel(
        &self,
        params: CloudUploadId,
    ) -> Result<CloudUploadSnapshot, HostError> {
        let _lifecycle = self.lifecycle.read().await;
        let entry = self.entry(&params, true).await?;
        let mut state = entry.state.lock().await;
        if matches!(
            state.snapshot.phase,
            CloudUploadPhase::Cancelling | CloudUploadPhase::Cancelled
        ) {
            return Ok(state.snapshot.clone());
        }
        if !state.snapshot.cancelable {
            return Err(HostError::conflict("Completion may have reached Cloud. Check this upload's status before leaving its review."));
        }
        let cleanup = !state.snapshot.phase.running();
        entry.cancelled.send_replace(true);
        state.snapshot.phase = CloudUploadPhase::Cancelling;
        state.snapshot.cancelable = false;
        if cleanup {
            let worker = entry.clone();
            self.track(entry.clone(), async move {
                worker.finish_cancel().await;
            })
            .await;
        }
        Ok(state.snapshot.clone())
    }
    pub(super) async fn release(&self, params: CloudUploadId) -> Result<(), HostError> {
        let _lifecycle = self.lifecycle.read().await;
        if self.released.lock().await.as_ref() == Some(&params) {
            return Ok(());
        }
        let entry = self.entry(&params, false).await?;
        if entry.state.lock().await.snapshot.phase.running() {
            return Err(HostError::conflict(
                "Stop the file upload or wait for completion before closing its review",
            ));
        }
        let mut slot = self.slot.lock().await;
        if slot
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, &entry))
        {
            slot.take();
            *self.released.lock().await = Some(params);
        }
        Ok(())
    }
    async fn track(&self, entry: Arc<Entry>, work: impl Future<Output = ()> + Send + 'static) {
        self.tasks.spawn(work, async move {
            let mut state = entry.state.lock().await;
            state.snapshot.phase = CloudUploadPhase::Failed;
            state.snapshot.uncertain = true;
            state.snapshot.retryable = false;
            state.snapshot.cancelable = false;
            state.snapshot.error = Some("The upload worker stopped unexpectedly. Check uploaded files before selecting this source again.".into());
            tracing::error!("cloud upload worker panicked");
        }).await;
    }
    async fn drain(&self) {
        self.tasks.drain().await;
    }
    async fn clear(&self) {
        let entry = self.slot.lock().await.take();
        if let Some(entry) = entry {
            entry.cancelled.send_replace(true);
        }
        self.drain().await;
    }
    pub(super) async fn logout(&self, accounts: &AccountService) -> Result<(), HostError> {
        let _lifecycle = self.lifecycle.write().await;
        self.clear().await;
        accounts.account_logout().await
    }
    pub(super) async fn shutdown(&self) {
        self.stopped.send_replace(true);
        let _lifecycle = self.lifecycle.write().await;
        self.clear().await;
    }
}
impl Entry {
    fn client(&self) -> Result<CloudClient, CloudError> {
        if !self.context.is_current() {
            return Err(CloudError::Decode("The upload's account or deployment changed. Its reviewed bytes were not moved to another account.".into()));
        }
        CloudClient::from_managed_context(&self.context)?
            .with_source_surface(self.surface)
            .with_workspace(Some(self.review.upload.target.workspace()))
    }
    async fn transfer(&self) -> Result<CloudUploadedFile, CloudError> {
        super::upload_destination::writable(&self.client()?, &self.review.upload.target).await?;
        let existing = self.state.lock().await.session.clone();
        let session = if let Some(session) = existing {
            session
        } else {
            let result = super::upload_destination::create(&self.client()?, &self.review).await;
            let session = match result {
                Ok(session) => session,
                Err(error) => {
                    let mut state = self.state.lock().await;
                    state.snapshot.uncertain = !matches!(
                        &error,
                        CloudError::Api {
                            status: 400..=499,
                            ..
                        }
                    );
                    state.snapshot.retryable = !state.snapshot.uncertain;
                    return Err(error);
                }
            };
            if let Err(error) = session.validate(self.bytes.len()) {
                let mut state = self.state.lock().await;
                state.snapshot.uncertain = true;
                state.snapshot.retryable = false;
                return Err(error);
            }
            self.state.lock().await.session = Some(session.clone());
            session
        };
        if !self.state.lock().await.completing {
            let stored = upload::progress(&self.client()?, &session, self.bytes.len()).await?;
            let mut uploaded = stored
                .iter()
                .map(|number| upload::part_length(&session, self.bytes.len(), *number))
                .sum::<usize>();
            self.state.lock().await.snapshot.uploaded_bytes = uploaded as u64;
            for number in 1..=session.part_count {
                if stored.contains(&number) {
                    continue;
                }
                let start = (number - 1) * session.part_bytes;
                let end = (start + session.part_bytes).min(self.bytes.len());
                upload::send_part(
                    &self.client()?,
                    &session,
                    number,
                    self.bytes.slice(start..end),
                )
                .await?;
                uploaded += end - start;
                self.state.lock().await.snapshot.uploaded_bytes = uploaded as u64;
            }
        }
        super::upload_destination::writable(&self.client()?, &self.review.upload.target).await?;
        let client = self.client()?;
        {
            let mut state = self.state.lock().await;
            if *self.cancelled.borrow() {
                return Err(CloudError::Decode(
                    "The upload was stopped before completion".into(),
                ));
            }
            state.completing = true;
            state.snapshot.phase = CloudUploadPhase::Completing;
            state.snapshot.cancelable = false;
        }
        let file = super::upload_destination::complete(&client, &session, &self.review).await?;
        if let (CloudUploadTarget::Chat { chat }, CloudUploadedFile::Chat { attachment }) =
            (&self.review.upload.target, &file)
        {
            super::attachment_recovery::uploaded(&client, &self.context, chat, attachment.clone())
                .await?;
        }
        Ok(file)
    }
    async fn run(self: Arc<Self>) {
        let mut cancelled = self.cancelled.subscribe();
        let result = tokio::select! {
            biased;
            _ = cancelled.wait_for(|value| *value) => None,
            result = self.transfer() => Some(result),
        };
        if result.is_none() {
            self.finish_cancel().await;
            return;
        }
        let mut state = self.state.lock().await;
        if *self.cancelled.borrow() {
            drop(state);
            self.finish_cancel().await;
            return;
        }
        match result {
            Some(Ok(file)) if self.context.is_current() => {
                state.snapshot.phase = CloudUploadPhase::Succeeded;
                state.snapshot.file = Some(file);
                state.snapshot.uncertain = false;
                state.snapshot.retryable = false;
                state.snapshot.cancelable = false;
            }
            other => {
                state.snapshot.phase = CloudUploadPhase::Failed;
                state.snapshot.uncertain |= state.completing;
                state.snapshot.cancelable = !state.completing;
                state.snapshot.retryable = state.session.is_some() || !state.snapshot.uncertain;
                state.snapshot.error = Some(match other { Some(Err(error)) => error.to_string(), _ => "The account changed before upload completion could be confirmed. Review that destination's files before trying again.".into() });
            }
        }
    }
    async fn finish_cancel(&self) {
        let (session, completing) = {
            let state = self.state.lock().await;
            (state.session.clone(), state.completing)
        };
        let cleanup = if !completing {
            if let Some(session) = session {
                match self.client() {
                    Ok(client) => match upload::contract() {
                        Ok(contract) => tokio::time::timeout(
                            std::time::Duration::from_millis(contract.abort_timeout_ms),
                            upload::abort(&client, &session),
                        )
                        .await
                        .map_err(|_| "Partial-upload cleanup timed out".to_string())
                        .and_then(|result| result.map_err(|error| error.to_string()))
                        .err(),
                        Err(error) => Some(error.to_string()),
                    },
                    Err(error) => Some(error.to_string()),
                }
            } else {
                None
            }
        } else {
            None
        };
        let mut state = self.state.lock().await;
        state.snapshot.phase = if completing {
            CloudUploadPhase::Failed
        } else {
            CloudUploadPhase::Cancelled
        };
        state.snapshot.uncertain |= completing;
        state.snapshot.retryable = completing;
        state.snapshot.cancelable = false;
        state.snapshot.error = if completing {
            Some("Upload completion was interrupted. The file may already be in Cloud. Check its status or check uploaded files before selecting it again.".into())
        } else {
            cleanup.map(|error| format!("Upload stopped here. Partial Cloud bytes may remain because cleanup was not confirmed: {error}"))
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agiworkforce_protocol::account_cloud::{CloudConversationWorkspace, CloudProjectTarget};
    #[tokio::test]
    async fn project_upload_worker_panics_leave_an_explicit_uncertain_failure() {
        let uploads = AccountUploads::default();
        let review = CloudUploadReview {
            upload: CloudUploadId {
                target: CloudUploadTarget::Project {
                    project: CloudProjectTarget {
                        scope: "fixture".into(),
                        workspace: CloudConversationWorkspace::Personal,
                        project_id: uuid::Uuid::new_v4().to_string(),
                    },
                },
                id: uuid::Uuid::new_v4().to_string(),
            },
            destination_name: "Fixture".into(),
            file_name: "file.txt".into(),
            mime_type: "text/plain".into(),
            byte_count: 1,
            checksum_sha256: "a".repeat(64),
        };
        let entry = Arc::new(Entry {
            review: review.clone(),
            bytes: Bytes::from_static(b"x"),
            surface: "desktop",
            context: ManagedRequestContext {
                jwt: None,
                base: "https://fixture.invalid".into(),
                owner: None,
            },
            cancelled: watch::channel(false).0,
            _capacity: uploads.capacity.clone().try_acquire_owned().unwrap(),
            state: Mutex::new(UploadState {
                snapshot: CloudUploadSnapshot {
                    review,
                    phase: CloudUploadPhase::Uploading,
                    uploaded_bytes: 0,
                    file: None,
                    error: None,
                    uncertain: false,
                    retryable: true,
                    cancelable: true,
                },
                session: None,
                completing: false,
            }),
        });
        uploads
            .track(entry.clone(), async {
                panic!("synthetic upload worker failure");
            })
            .await;
        uploads.drain().await;
        let snapshot = entry.state.lock().await.snapshot.clone();
        assert_eq!(snapshot.phase, CloudUploadPhase::Failed);
        assert!(snapshot.uncertain && !snapshot.retryable && !snapshot.cancelable);
        assert!(snapshot.file.is_none() && snapshot.error.is_some());
    }
}
