use anyhow::Result;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, RwLock};
use tokio::time::interval;

use super::cloud::{CloudSyncClient, CloudSyncConfig, SyncBatch};
use super::conflict::{ConflictData, ConflictResolver};
use super::queue::{SyncQueue, SyncQueueItem};

pub struct SyncManager {
    cloud_client: Arc<CloudSyncClient>,
    sync_queue: Arc<SyncQueue>,
    conflict_resolver: Arc<ConflictResolver>,
    is_syncing: Arc<RwLock<bool>>,
    last_sync: Arc<Mutex<Option<String>>>,
    user_id: Arc<Mutex<Option<String>>>,
    config: CloudSyncConfig,
}

impl SyncManager {
    pub fn new(
        config: CloudSyncConfig,
        db_path: PathBuf,
        device_id: String,
        auto_resolve_conflicts: bool,
    ) -> Result<Self> {
        let cloud_client = Arc::new(CloudSyncClient::new(config.clone(), device_id)?);
        let sync_queue = Arc::new(SyncQueue::new(db_path)?);
        let conflict_resolver = Arc::new(ConflictResolver::new(auto_resolve_conflicts));

        Ok(Self {
            cloud_client,
            sync_queue,
            conflict_resolver,
            is_syncing: Arc::new(RwLock::new(false)),
            last_sync: Arc::new(Mutex::new(None)),
            user_id: Arc::new(Mutex::new(None)),
            config,
        })
    }

    pub async fn start_auto_sync(&self) -> Result<()> {
        let cloud_client = Arc::clone(&self.cloud_client);
        let sync_queue = Arc::clone(&self.sync_queue);
        let conflict_resolver = Arc::clone(&self.conflict_resolver);
        let is_syncing = Arc::clone(&self.is_syncing);
        let last_sync = Arc::clone(&self.last_sync);
        let user_id = Arc::clone(&self.user_id);
        let interval_seconds = self.config.sync_interval_seconds;
        let batch_size = self.config.batch_size;

        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(interval_seconds));

            loop {
                ticker.tick().await;

                // Check if already syncing
                if *is_syncing.read().await {
                    continue;
                }

                // Get user_id
                let user_id_value = {
                    let uid = user_id.lock().await;
                    match &*uid {
                        Some(id) => id.clone(),
                        None => continue, // Skip if no user logged in
                    }
                };

                // Set syncing flag
                *is_syncing.write().await = true;

                // Perform sync
                if let Err(e) = Self::perform_sync(
                    &cloud_client,
                    &sync_queue,
                    &conflict_resolver,
                    &last_sync,
                    &user_id_value,
                    batch_size,
                )
                .await
                {
                    eprintln!("Auto-sync error: {}", e);
                }

                // Clear syncing flag
                *is_syncing.write().await = false;
            }
        });

        Ok(())
    }

    async fn perform_sync(
        cloud_client: &Arc<CloudSyncClient>,
        sync_queue: &Arc<SyncQueue>,
        conflict_resolver: &Arc<ConflictResolver>,
        last_sync: &Arc<Mutex<Option<String>>>,
        user_id: &str,
        batch_size: usize,
    ) -> Result<()> {
        // Step 1: Push local changes
        let pending_items = sync_queue.get_pending(batch_size)?;

        if !pending_items.is_empty() {
            let batch = SyncBatch {
                items: pending_items.clone(),
                device_id: cloud_client.device_id.clone(),
                user_id: user_id.to_string(),
                timestamp: chrono::Utc::now().to_rfc3339(),
            };

            let response = cloud_client.sync_batch(batch).await?;

            // Mark synced items
            for id in response.synced_ids {
                sync_queue.mark_synced(&id)?;
            }

            // Mark failed items
            for id in response.failed_ids {
                sync_queue.mark_failed(&id, "Sync failed")?;
            }

            // Handle conflicts
            for conflict_info in response.conflicts {
                let local_item = pending_items
                    .iter()
                    .find(|item| item.entity_id == conflict_info.entity_id);

                if let Some(local) = local_item {
                    let conflict_data = ConflictData {
                        entity_id: conflict_info.entity_id.clone(),
                        entity_type: conflict_info.entity_type.clone(),
                        local_data: local.data.clone().unwrap_or_default(),
                        remote_data: conflict_info.remote_data,
                        local_timestamp: local.timestamp.clone(),
                        remote_timestamp: conflict_info.remote_timestamp,
                        local_hash: conflict_info.local_hash,
                        remote_hash: conflict_info.remote_hash,
                    };

                    // Auto-resolve conflict
                    let resolved = conflict_resolver.auto_resolve(&conflict_data)?;

                    if let Some(merged_data) = resolved.merged_data {
                        // Send resolution to cloud
                        cloud_client
                            .resolve_conflict(&conflict_info.entity_id, &merged_data, 0)
                            .await?;

                        // Mark as synced
                        sync_queue.mark_synced(&local.id)?;
                    }
                }
            }
        }

        // Step 2: Pull remote changes
        let since_timestamp = {
            let last = last_sync.lock().await;
            last.clone()
                .unwrap_or_else(|| "2020-01-01T00:00:00Z".to_string())
        };

        let updates = cloud_client.pull_updates(&since_timestamp, user_id).await?;

        // Process remote updates
        for _update in updates {
            // TODO: Apply remote updates to local database
            // This would involve updating conversations, messages, projects, etc.
        }

        // Update last sync timestamp
        *last_sync.lock().await = Some(chrono::Utc::now().to_rfc3339());

        Ok(())
    }

    pub async fn sync_now(&self) -> Result<()> {
        let user_id_value = {
            let uid = self.user_id.lock().await;
            match &*uid {
                Some(id) => id.clone(),
                None => return Err(anyhow::anyhow!("No user logged in")),
            }
        };

        *self.is_syncing.write().await = true;

        let result = Self::perform_sync(
            &self.cloud_client,
            &self.sync_queue,
            &self.conflict_resolver,
            &self.last_sync,
            &user_id_value,
            self.config.batch_size,
        )
        .await;

        *self.is_syncing.write().await = false;

        result
    }

    pub async fn set_user(&self, user_id: String) {
        *self.user_id.lock().await = Some(user_id);
    }

    pub async fn is_syncing(&self) -> bool {
        *self.is_syncing.read().await
    }

    pub async fn get_last_sync(&self) -> Option<String> {
        self.last_sync.lock().await.clone()
    }

    pub fn enqueue_sync(&self, item: SyncQueueItem) -> Result<()> {
        self.sync_queue.enqueue(item)
    }

    pub fn get_pending_count(&self) -> Result<usize> {
        self.sync_queue.get_count()
    }

    pub fn clear_old_synced(&self, days: u32) -> Result<usize> {
        self.sync_queue.clear_synced(days)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_sync_manager_creation() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("sync.db");
        let config = CloudSyncConfig::default();
        let device_id = uuid::Uuid::new_v4().to_string();

        let manager = SyncManager::new(config, db_path, device_id, true);
        assert!(manager.is_ok());
    }
}
