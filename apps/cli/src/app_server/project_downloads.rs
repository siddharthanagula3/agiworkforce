use super::{
    account_cloud::{changed, connect, failure},
    account_file_tasks::AccountFileTasks,
};
use crate::{
    cloud::{
        client::{CloudClient, CloudError},
        project_files,
    },
    path_security::{DirectoryAuthority, DownloadDestination},
    tier_cache::ManagedRequestContext,
};
use agiworkforce_app_server::DeveloperSessionHostError as HostError;
use agiworkforce_protocol::project_files::*;
use std::{
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::{watch, Mutex, OwnedSemaphorePermit, RwLock, RwLockWriteGuard, Semaphore};

pub(super) struct ProjectDownloads {
    slot: Mutex<Option<Arc<Entry>>>,
    capacity: Arc<Semaphore>,
    lifecycle: RwLock<()>,
    stopped: watch::Sender<bool>,
    tasks: AccountFileTasks,
}
struct Entry {
    review: CloudProjectDownloadReview,
    context: ManagedRequestContext,
    state: Mutex<State>,
    received: AtomicU64,
    cancelled: watch::Sender<bool>,
    _capacity: OwnedSemaphorePermit,
}
struct State {
    snapshot: CloudProjectDownloadSnapshot,
    destination: Option<DownloadDestination>,
    saving: bool,
}
impl Default for ProjectDownloads {
    fn default() -> Self {
        Self {
            slot: Mutex::new(None),
            capacity: Arc::new(Semaphore::new(1)),
            lifecycle: RwLock::new(()),
            stopped: watch::channel(false).0,
            tasks: Default::default(),
        }
    }
}
impl ProjectDownloads {
    pub(super) async fn prepare(
        &self,
        params: CloudProjectDownloadPrepareParams,
    ) -> Result<CloudProjectDownloadSnapshot, HostError> {
        let _guard = self.lifecycle.read().await;
        let mut stopped = self.stopped.subscribe();
        if *stopped.borrow() {
            return Err(HostError::unavailable("File downloads are shutting down"));
        }
        tokio::select! { biased; _ = stopped.wait_for(|value| *value) => Err(HostError::unavailable("Download preparation stopped during shutdown")), result = self.prepare_inner(params) => result }
    }
    async fn prepare_inner(
        &self,
        params: CloudProjectDownloadPrepareParams,
    ) -> Result<CloudProjectDownloadSnapshot, HostError> {
        let (client, context, _) = connect(Some(&params.file.target.project.scope))?;
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
            self.tasks.drain().await;
        }
        let capacity = self.capacity.clone().try_acquire_owned().map_err(|_| {
            HostError::conflict(
                "Close the current file-download review before choosing another destination",
            )
        })?;
        let file = project_files::current_version(&client, &params.file)
            .await
            .map_err(failure)?;
        let limit = project_files::max_file_bytes().map_err(failure)?;
        if file.byte_count > limit {
            return Err(HostError::invalid_request(
                "This file exceeds the current native download limit",
            ));
        }
        let project = crate::cloud::projects::api::read(&client, &params.file.target.project)
            .await
            .map_err(failure)?
            .project;
        let selected = chrono::DateTime::from_timestamp_millis(params.selected_at_ms)
            .ok_or_else(|| HostError::invalid_request("The save selection time is invalid"))?;
        if params.selected_at_ms < 0 || selected > chrono::Utc::now() {
            return Err(HostError::invalid_request(
                "The save selection time is invalid",
            ));
        }
        let (capacity, destination) = tokio::task::spawn_blocking(move || {
            let (directory, leaf) =
                DirectoryAuthority::selected_file(Path::new(&params.destination))?;
            directory
                .download_destination(&leaf, limit, params.selected_at_ms)
                .map(|destination| (capacity, destination))
        })
        .await
        .map_err(|error| HostError::unavailable(error.to_string()))?
        .map_err(|error| HostError::invalid_request(error.to_string()))?;
        if !context.is_current() || *self.stopped.borrow() {
            return Err(changed());
        }
        let review = CloudProjectDownloadReview {
            download: CloudProjectDownloadId {
                file: params.file.target,
                id: uuid::Uuid::new_v4().to_string(),
            },
            project_name: project.name,
            file,
            destination: destination
                .path()
                .to_str()
                .ok_or_else(|| HostError::invalid_request("Choose a Unicode destination path"))?
                .into(),
            replaces: destination.replaces(),
        };
        let snapshot = CloudProjectDownloadSnapshot {
            review: review.clone(),
            phase: ProjectDownloadPhase::Ready,
            received_bytes: 0,
            error: None,
            uncertain: false,
            retryable: true,
            cancelable: true,
        };
        *self.slot.lock().await = Some(Arc::new(Entry {
            review,
            context,
            state: Mutex::new(State {
                snapshot: snapshot.clone(),
                destination: Some(destination),
                saving: false,
            }),
            received: AtomicU64::new(0),
            cancelled: watch::channel(false).0,
            _capacity: capacity,
        }));
        Ok(snapshot)
    }
    async fn entry(
        &self,
        id: &CloudProjectDownloadId,
        current: bool,
    ) -> Result<Arc<Entry>, HostError> {
        let entry = self
            .slot
            .lock()
            .await
            .as_ref()
            .filter(|entry| entry.review.download == *id)
            .cloned()
            .ok_or_else(|| {
                HostError::not_found("This file-download review is no longer available")
            })?;
        if current && !entry.context.is_current() {
            return Err(changed());
        }
        Ok(entry)
    }
    pub(super) async fn read(
        &self,
        id: CloudProjectDownloadId,
    ) -> Result<CloudProjectDownloadSnapshot, HostError> {
        let entry = self.entry(&id, true).await?;
        Ok(entry.snapshot().await)
    }
    pub(super) async fn start(
        &self,
        id: CloudProjectDownloadId,
    ) -> Result<CloudProjectDownloadSnapshot, HostError> {
        let _guard = self.lifecycle.read().await;
        if *self.stopped.borrow() {
            return Err(HostError::unavailable("File downloads are shutting down"));
        }
        let entry = self.entry(&id, true).await?;
        let mut state = entry.state.lock().await;
        if state.snapshot.phase.running() || state.snapshot.phase == ProjectDownloadPhase::Succeeded
        {
            let mut snapshot = state.snapshot.clone();
            snapshot.received_bytes = entry.received.load(Ordering::Relaxed);
            return Ok(snapshot);
        }
        if !state.snapshot.retryable || state.destination.is_none() {
            return Err(HostError::conflict(
                "Choose and review the save destination again before restarting this download",
            ));
        }
        state.snapshot.phase = ProjectDownloadPhase::Downloading;
        state.snapshot.error = None;
        state.snapshot.received_bytes = 0;
        entry.received.store(0, Ordering::Relaxed);
        let worker = entry.clone();
        let failed = entry.clone();
        self.tasks.spawn(async move { worker.run().await; }, async move { let mut state = failed.state.lock().await; state.snapshot.phase = ProjectDownloadPhase::Failed; state.snapshot.uncertain = state.saving; state.snapshot.retryable = false; state.snapshot.cancelable = false; state.snapshot.error = Some("The download worker stopped unexpectedly. Check the destination before selecting it again.".into()); tracing::error!("project download worker panicked"); }).await;
        Ok(state.snapshot.clone())
    }
    pub(super) async fn cancel(
        &self,
        id: CloudProjectDownloadId,
    ) -> Result<CloudProjectDownloadSnapshot, HostError> {
        let _guard = self.lifecycle.read().await;
        let entry = self.entry(&id, true).await?;
        let mut state = entry.state.lock().await;
        if matches!(
            state.snapshot.phase,
            ProjectDownloadPhase::Cancelled | ProjectDownloadPhase::Cancelling
        ) {
            return Ok(state.snapshot.clone());
        }
        if !state.snapshot.cancelable {
            return Err(HostError::conflict(
                "Local saving has started. Wait for its result before closing the review.",
            ));
        }
        entry.cancelled.send_replace(true);
        state.snapshot.phase = if state.snapshot.phase.running() {
            ProjectDownloadPhase::Cancelling
        } else {
            ProjectDownloadPhase::Cancelled
        };
        state.snapshot.cancelable = false;
        state.snapshot.retryable = false;
        Ok(state.snapshot.clone())
    }
    pub(super) async fn release(&self, id: CloudProjectDownloadId) -> Result<(), HostError> {
        let _guard = self.lifecycle.read().await;
        let entry = self.entry(&id, false).await?;
        if entry.state.lock().await.snapshot.phase.running() {
            return Err(HostError::conflict(
                "Wait for the download to stop or finish saving before closing its review",
            ));
        }
        let mut slot = self.slot.lock().await;
        if slot
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, &entry))
        {
            slot.take();
        }
        Ok(())
    }
    async fn clear(&self) {
        let entry = self.slot.lock().await.take();
        if let Some(entry) = entry {
            entry.cancelled.send_replace(true);
        }
        self.tasks.drain().await;
    }
    pub(super) async fn pause(&self) -> RwLockWriteGuard<'_, ()> {
        let guard = self.lifecycle.write().await;
        self.clear().await;
        guard
    }
    pub(super) async fn shutdown(&self) {
        self.stopped.send_replace(true);
        let _guard = self.lifecycle.write().await;
        self.clear().await;
    }
}
impl Entry {
    async fn snapshot(&self) -> CloudProjectDownloadSnapshot {
        let mut snapshot = self.state.lock().await.snapshot.clone();
        snapshot.received_bytes = self.received.load(Ordering::Relaxed);
        snapshot
    }
    fn client(&self) -> Result<CloudClient, CloudError> {
        if !self.context.is_current() {
            return Err(CloudError::Decode(
                "The download's account or deployment changed".into(),
            ));
        }
        CloudClient::admit(crate::account_privacy_mode())?;
        CloudClient::from_managed_context(&self.context)?
            .with_workspace(Some(&self.review.download.file.project.workspace))
    }
    async fn fetch(&self) -> Result<Vec<u8>, CloudError> {
        let client = self.client()?;
        project_files::current_version(
            &client,
            &CloudProjectFileVersion {
                target: self.review.download.file.clone(),
                checksum_sha256: self.review.file.checksum_sha256.clone(),
            },
        )
        .await?;
        let timeout = Duration::from_millis(project_files::upload::contract()?.transfer_timeout_ms);
        let bytes = client
            .download_bounded(
                &project_files::file_path(&self.review.download.file)?,
                self.review.file.byte_count as usize,
                timeout,
                |count| self.received.store(count as u64, Ordering::Relaxed),
            )
            .await?;
        if bytes.len() as u64 != self.review.file.byte_count
            || project_files::upload::checksum(&bytes) != self.review.file.checksum_sha256
        {
            return Err(CloudError::Decode("The downloaded bytes differ from the reviewed file. Refresh project files before trying again.".into()));
        }
        project_files::current_version(
            &self.client()?,
            &CloudProjectFileVersion {
                target: self.review.download.file.clone(),
                checksum_sha256: self.review.file.checksum_sha256.clone(),
            },
        )
        .await?;
        if !self.context.is_current() {
            return Err(CloudError::Decode(
                "The account changed before local saving began".into(),
            ));
        }
        Ok(bytes)
    }
    async fn run(self: Arc<Self>) {
        let mut cancel = self.cancelled.subscribe();
        let result = tokio::select! { biased; _ = cancel.wait_for(|value| *value) => None, result = self.fetch() => Some(result) };
        let bytes = match result {
            Some(Ok(bytes)) => bytes,
            other => {
                let mut state = self.state.lock().await;
                let cancelled = other.is_none() || *self.cancelled.borrow();
                state.snapshot.phase = if cancelled {
                    ProjectDownloadPhase::Cancelled
                } else {
                    ProjectDownloadPhase::Failed
                };
                state.snapshot.cancelable = !cancelled;
                state.snapshot.retryable = !cancelled && self.context.is_current();
                state.snapshot.error = other.and_then(Result::err).map(|error| error.to_string());
                return;
            }
        };
        let destination = {
            let mut state = self.state.lock().await;
            if !self.context.is_current() {
                state.snapshot.phase = ProjectDownloadPhase::Failed;
                state.snapshot.retryable = false;
                state.snapshot.error = Some("The account changed before local saving began".into());
                return;
            }
            if *self.cancelled.borrow() {
                state.snapshot.phase = ProjectDownloadPhase::Cancelled;
                state.snapshot.cancelable = false;
                state.snapshot.retryable = false;
                return;
            }
            let Some(destination) = state.destination.take() else {
                state.snapshot.phase = ProjectDownloadPhase::Failed;
                state.snapshot.error = Some(
                    "The selected destination grant was already used. Select it again.".into(),
                );
                state.snapshot.retryable = false;
                return;
            };
            state.saving = true;
            state.snapshot.phase = ProjectDownloadPhase::Saving;
            state.snapshot.cancelable = false;
            state.snapshot.retryable = false;
            destination
        };
        let saved = tokio::task::spawn_blocking(move || destination.save(&bytes)).await;
        let mut state = self.state.lock().await;
        match saved {
            Ok(Ok(())) => {
                state.snapshot.phase = ProjectDownloadPhase::Succeeded;
                state.snapshot.uncertain = false;
                state.snapshot.error = None;
            }
            Ok(Err(error)) => {
                state.snapshot.phase = ProjectDownloadPhase::Failed;
                state.snapshot.uncertain = error.uncertain;
                state.snapshot.error = Some(format!("The file could not be saved: {}. Check the destination before selecting it again.", error.error));
            }
            Err(error) => {
                state.snapshot.phase = ProjectDownloadPhase::Failed;
                state.snapshot.uncertain = true;
                state.snapshot.error = Some(format!("The save worker stopped: {error}. Check the destination before selecting it again."));
            }
        }
    }
}
