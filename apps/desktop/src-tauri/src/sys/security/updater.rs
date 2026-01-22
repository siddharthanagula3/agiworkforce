use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMetadata {
    pub version: String,
    pub release_date: String,
    pub download_url: String,
    pub checksum_sha256: String,
    pub signature: String,
    pub changelog: String,
    pub min_version: Option<String>,
    pub forced: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationResult {
    pub valid: bool,
    pub checksum_match: bool,
    pub signature_valid: bool,
    pub error: Option<String>,
}

impl VerificationResult {
    pub fn success() -> Self {
        Self {
            valid: true,
            checksum_match: true,
            signature_valid: true,
            error: None,
        }
    }

    pub fn failure(error: String) -> Self {
        Self {
            valid: false,
            checksum_match: false,
            signature_valid: false,
            error: Some(error),
        }
    }
}

pub struct UpdateSecurityManager {
    public_key: Option<String>,
}

impl UpdateSecurityManager {
    pub fn new(public_key: Option<String>) -> Self {
        Self { public_key }
    }

    pub fn verify_update(
        &self,
        file_path: &str,
        metadata: &UpdateMetadata,
    ) -> Result<VerificationResult, String> {
        let actual_checksum = self.compute_file_checksum(file_path)?;
        if actual_checksum != metadata.checksum_sha256 {
            return Ok(VerificationResult {
                valid: false,
                checksum_match: false,
                signature_valid: false,
                error: Some(format!(
                    "Checksum mismatch: expected {}, got {}",
                    metadata.checksum_sha256, actual_checksum
                )),
            });
        }

        if let Some(ref public_key) = self.public_key {
            let signature_valid =
                self.verify_signature(&actual_checksum, &metadata.signature, public_key)?;

            if !signature_valid {
                return Ok(VerificationResult {
                    valid: false,
                    checksum_match: true,
                    signature_valid: false,
                    error: Some("Invalid signature".to_string()),
                });
            }
        }

        Ok(VerificationResult::success())
    }

    pub fn compute_file_checksum(&self, file_path: &str) -> Result<String, String> {
        let data = fs::read(file_path).map_err(|e| format!("Failed to read file: {}", e))?;

        let mut hasher = Sha256::new();
        hasher.update(&data);
        let result = hasher.finalize();

        Ok(hex::encode(result))
    }

    /// Verify Ed25519 signature of the message using the provided public key
    ///
    /// # Arguments
    /// * `message` - The message that was signed (typically the file checksum)
    /// * `signature` - Base64-encoded Ed25519 signature
    /// * `public_key` - Base64-encoded Ed25519 public key (32 bytes)
    ///
    /// # Returns
    /// * `Ok(true)` if signature is valid
    /// * `Ok(false)` if signature is invalid
    /// * `Err(_)` if there's an error parsing the key or signature
    fn verify_signature(
        &self,
        message: &str,
        signature: &str,
        public_key: &str,
    ) -> Result<bool, String> {
        use base64::{engine::general_purpose::STANDARD, Engine};
        use ed25519_dalek::{Signature, Verifier, VerifyingKey};

        if signature.is_empty() {
            tracing::warn!("Empty signature provided");
            return Ok(false);
        }

        if public_key.is_empty() {
            tracing::warn!("Empty public key provided");
            return Ok(false);
        }

        // Decode the public key from base64
        let public_key_bytes = STANDARD
            .decode(public_key)
            .map_err(|e| format!("Invalid public key encoding: {}", e))?;

        if public_key_bytes.len() != 32 {
            return Err(format!(
                "Invalid public key length: expected 32 bytes, got {}",
                public_key_bytes.len()
            ));
        }

        let public_key_array: [u8; 32] = public_key_bytes
            .try_into()
            .map_err(|_| "Failed to convert public key to array")?;

        let verifying_key = VerifyingKey::from_bytes(&public_key_array)
            .map_err(|e| format!("Invalid public key: {}", e))?;

        // Decode the signature from base64
        let signature_bytes = STANDARD
            .decode(signature)
            .map_err(|e| format!("Invalid signature encoding: {}", e))?;

        if signature_bytes.len() != 64 {
            return Err(format!(
                "Invalid signature length: expected 64 bytes, got {}",
                signature_bytes.len()
            ));
        }

        let signature_array: [u8; 64] = signature_bytes
            .try_into()
            .map_err(|_| "Failed to convert signature to array")?;

        let sig = Signature::from_bytes(&signature_array);

        // Verify the signature
        match verifying_key.verify(message.as_bytes(), &sig) {
            Ok(_) => {
                tracing::info!("Update signature verification successful");
                Ok(true)
            }
            Err(e) => {
                tracing::warn!("Update signature verification failed: {}", e);
                Ok(false)
            }
        }
    }

    pub fn should_update(&self, current_version: &str, new_version: &str) -> bool {
        current_version != new_version
    }

    pub fn validate_download_url(&self, url: &str) -> Result<(), String> {
        if !url.starts_with("https") {
            return Err("Update URL must use HTTPS".to_string());
        }

        let allowed_domains = vec!["releases.agiworkforce.com", "github.com"];

        let url_parsed = url::Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;

        let domain = url_parsed.host_str().ok_or("URL has no host")?;

        if !allowed_domains.iter().any(|d| domain.ends_with(d)) {
            return Err(format!(
                "Update domain '{}' is not in allowed list: {:?}",
                domain, allowed_domains
            ));
        }

        Ok(())
    }

    pub fn create_backup(&self, source_dir: &str, backup_dir: &str) -> Result<(), String> {
        use std::fs;

        let backup_path = Path::new(backup_dir);
        if !backup_path.exists() {
            fs::create_dir_all(backup_path)
                .map_err(|e| format!("Failed to create backup directory: {}", e))?;
        }

        let important_files = vec!["agiworkforce.db", "config.toml", "settings.json"];

        for file in important_files {
            let source = Path::new(source_dir).join(file);
            if source.exists() {
                let dest = backup_path.join(file);
                fs::copy(&source, &dest)
                    .map_err(|e| format!("Failed to backup {}: {}", file, e))?;
            }
        }

        tracing::info!("Backup created at {:?}", backup_path);
        Ok(())
    }

    pub fn restore_backup(&self, backup_dir: &str, target_dir: &str) -> Result<(), String> {
        use walkdir::WalkDir;

        let backup_path = Path::new(backup_dir);
        if !backup_path.exists() {
            return Err("Backup directory does not exist".to_string());
        }

        for entry in WalkDir::new(backup_path) {
            let entry = entry.map_err(|e| format!("Failed to read backup entry: {}", e))?;
            if entry.file_type().is_file() {
                let relative_path = entry
                    .path()
                    .strip_prefix(backup_path)
                    .map_err(|e| format!("Failed to get relative path: {}", e))?;

                let dest = Path::new(target_dir).join(relative_path);

                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create directory: {}", e))?;
                }

                fs::copy(entry.path(), &dest)
                    .map_err(|e| format!("Failed to restore {}: {}", relative_path.display(), e))?;
            }
        }

        tracing::info!("Backup restored from {:?}", backup_path);
        Ok(())
    }
}

pub async fn download_update(
    url: &str,
    output_path: &str,
    progress_callback: Option<Box<dyn Fn(u64, u64) + Send>>,
) -> Result<(), String> {
    use reqwest;
    use tokio::io::AsyncWriteExt;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download update: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let mut file = tokio::fs::File::create(output_path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Failed to read chunk: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write chunk: {}", e))?;

        downloaded += chunk.len() as u64;

        if let Some(ref callback) = progress_callback {
            callback(downloaded, total_size);
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush file: {}", e))?;

    tracing::info!("Update downloaded successfully to {}", output_path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_checksum_calculation() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");
        fs::write(&file_path, b"test content").unwrap();

        let manager = UpdateSecurityManager::new(None);
        let checksum = manager
            .compute_file_checksum(file_path.to_str().unwrap())
            .unwrap();

        let expected = "6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72";
        assert_eq!(checksum, expected);
    }

    #[test]
    fn test_version_comparison() {
        let manager = UpdateSecurityManager::new(None);

        assert!(manager.should_update("1.0.0", "1.1.0"));
        assert!(!manager.should_update("1.0.0", "1.0.0"));
    }

    #[test]
    fn test_url_validation() {
        let manager = UpdateSecurityManager::new(None);

        assert!(manager
            .validate_download_url("https://releases.agiworkforce.com/update")
            .is_ok());

        assert!(manager
            .validate_download_url("http://localhost:3000/update")
            .is_err());

        assert!(manager
            .validate_download_url("https://evil.com/update")
            .is_err());
    }

    #[test]
    fn test_backup_and_restore() {
        let temp_dir = tempdir().unwrap();
        let source_dir = temp_dir.path().join("source");
        let backup_dir = temp_dir.path().join("backup");
        let restore_dir = temp_dir.path().join("restore");

        fs::create_dir_all(&source_dir).unwrap();
        fs::write(source_dir.join("agiworkforce.db"), b"database content").unwrap();

        let manager = UpdateSecurityManager::new(None);

        manager
            .create_backup(source_dir.to_str().unwrap(), backup_dir.to_str().unwrap())
            .unwrap();

        assert!(backup_dir.join("agiworkforce.db").exists());

        manager
            .restore_backup(backup_dir.to_str().unwrap(), restore_dir.to_str().unwrap())
            .unwrap();

        assert!(restore_dir.join("agiworkforce.db").exists());
        let restored_content = fs::read_to_string(restore_dir.join("agiworkforce.db")).unwrap();
        assert_eq!(restored_content, "database content");
    }
}
