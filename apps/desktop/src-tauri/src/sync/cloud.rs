use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use super::queue::{SyncAction, SyncEntity, SyncQueueItem};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudSyncConfig {
    pub api_endpoint: String,
    pub api_key: String,
    pub sync_interval_seconds: u64,
    pub batch_size: usize,
    pub timeout_seconds: u64,
    pub retry_attempts: u32,
}

impl Default for CloudSyncConfig {
    fn default() -> Self {
        Self {
            api_endpoint: "https://api.anthropic.com/v1/sync".to_string(),
            api_key: String::new(),
            sync_interval_seconds: 30,
            batch_size: 50,
            timeout_seconds: 30,
            retry_attempts: 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncBatch {
    pub items: Vec<SyncQueueItem>,
    pub device_id: String,
    pub user_id: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResponse {
    pub success: bool,
    pub synced_ids: Vec<String>,
    pub failed_ids: Vec<String>,
    pub conflicts: Vec<ConflictInfo>,
    pub updates: Vec<RemoteUpdate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictInfo {
    pub entity_id: String,
    pub entity_type: String,
    pub local_hash: String,
    pub remote_hash: String,
    pub remote_data: String,
    pub remote_timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteUpdate {
    pub entity_type: SyncEntity,
    pub entity_id: String,
    pub action: SyncAction,
    pub data: String,
    pub timestamp: String,
    pub version: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub is_syncing: bool,
    pub last_sync: Option<String>,
    pub pending_count: usize,
    pub failed_count: usize,
    pub next_sync: Option<String>,
}

pub struct CloudSyncClient {
    config: CloudSyncConfig,
    client: Client,
    pub device_id: String,
}

impl CloudSyncClient {
    pub fn new(config: CloudSyncConfig, device_id: String) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds))
            .build()?;

        Ok(Self {
            config,
            client,
            device_id,
        })
    }

    pub async fn sync_batch(&self, batch: SyncBatch) -> Result<SyncResponse> {
        let response = self
            .client
            .post(&format!("{}/batch", self.config.api_endpoint))
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("X-Device-ID", &self.device_id)
            .json(&batch)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Sync batch failed with status: {}",
                response.status()
            ));
        }

        let sync_response: SyncResponse = response.json().await?;
        Ok(sync_response)
    }

    pub async fn pull_updates(
        &self,
        since_timestamp: &str,
        user_id: &str,
    ) -> Result<Vec<RemoteUpdate>> {
        let response = self
            .client
            .get(&format!("{}/updates", self.config.api_endpoint))
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("X-Device-ID", &self.device_id)
            .query(&[("since", since_timestamp), ("user_id", user_id)])
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Pull updates failed with status: {}",
                response.status()
            ));
        }

        let updates: Vec<RemoteUpdate> = response.json().await?;
        Ok(updates)
    }

    pub async fn resolve_conflict(
        &self,
        entity_id: &str,
        resolution_data: &str,
        version: u64,
    ) -> Result<()> {
        let payload = serde_json::json!({
            "entity_id": entity_id,
            "resolution_data": resolution_data,
            "version": version,
            "device_id": self.device_id,
        });

        let response = self
            .client
            .post(&format!("{}/resolve-conflict", self.config.api_endpoint))
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("X-Device-ID", &self.device_id)
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Conflict resolution failed with status: {}",
                response.status()
            ));
        }

        Ok(())
    }

    pub async fn get_sync_status(&self, user_id: &str) -> Result<SyncStatus> {
        let response = self
            .client
            .get(&format!("{}/status", self.config.api_endpoint))
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("X-Device-ID", &self.device_id)
            .query(&[("user_id", user_id)])
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Get sync status failed with status: {}",
                response.status()
            ));
        }

        let status: SyncStatus = response.json().await?;
        Ok(status)
    }

    pub async fn register_device(&self, device_name: &str, user_id: &str) -> Result<()> {
        let payload = serde_json::json!({
            "device_id": self.device_id,
            "device_name": device_name,
            "user_id": user_id,
            "platform": std::env::consts::OS,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        });

        let response = self
            .client
            .post(&format!("{}/devices/register", self.config.api_endpoint))
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Device registration failed with status: {}",
                response.status()
            ));
        }

        Ok(())
    }

    pub async fn unregister_device(&self, user_id: &str) -> Result<()> {
        let response = self
            .client
            .delete(&format!(
                "{}/devices/{}",
                self.config.api_endpoint, self.device_id
            ))
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .query(&[("user_id", user_id)])
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Device unregistration failed with status: {}",
                response.status()
            ));
        }

        Ok(())
    }

    pub async fn upload_file(&self, file_path: &str, file_data: Vec<u8>) -> Result<String> {
        let form = reqwest::multipart::Form::new().part(
            "file",
            reqwest::multipart::Part::bytes(file_data).file_name(file_path.to_string()),
        );

        let response = self
            .client
            .post(&format!("{}/files/upload", self.config.api_endpoint))
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("X-Device-ID", &self.device_id)
            .multipart(form)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "File upload failed with status: {}",
                response.status()
            ));
        }

        #[derive(Deserialize)]
        struct UploadResponse {
            file_id: String,
        }

        let upload_response: UploadResponse = response.json().await?;
        Ok(upload_response.file_id)
    }

    pub async fn download_file(&self, file_id: &str) -> Result<Vec<u8>> {
        let response = self
            .client
            .get(&format!("{}/files/{}", self.config.api_endpoint, file_id))
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("X-Device-ID", &self.device_id)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "File download failed with status: {}",
                response.status()
            ));
        }

        let bytes = response.bytes().await?;
        Ok(bytes.to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cloud_sync_client_creation() {
        let config = CloudSyncConfig::default();
        let device_id = uuid::Uuid::new_v4().to_string();
        let client = CloudSyncClient::new(config, device_id);
        assert!(client.is_ok());
    }
}
