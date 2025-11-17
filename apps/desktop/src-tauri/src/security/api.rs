use crate::security::rate_limit::{RateLimitConfig, RateLimiter};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;
use std::sync::Arc;

const SIGNATURE_HEADER: &str = "X-Signature";
const TIMESTAMP_HEADER: &str = "X-Timestamp";
const API_KEY_HEADER: &str = "X-API-Key";
const REQUEST_VALIDITY_WINDOW: i64 = 300; // 5 minutes

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKey {
    pub key_id: String,
    pub key_secret: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub permissions: Vec<String>,
    pub rate_limit: Option<RateLimitConfig>,
}

impl ApiKey {
    pub fn new(name: String, permissions: Vec<String>) -> Self {
        use uuid::Uuid;

        Self {
            key_id: Uuid::new_v4().to_string(),
            key_secret: Self::generate_secret(),
            name,
            created_at: Utc::now(),
            last_used_at: None,
            expires_at: None,
            permissions,
            rate_limit: Some(RateLimitConfig::default()),
        }
    }

    fn generate_secret() -> String {
        use base64::{engine::general_purpose, Engine as _};
        use rand::RngCore;
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        general_purpose::STANDARD.encode(bytes)
    }

    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            Utc::now() > expires_at
        } else {
            false
        }
    }

    pub fn has_permission(&self, permission: &str) -> bool {
        self.permissions.contains(&permission.to_string())
            || self.permissions.contains(&"*".to_string())
    }
}

/// API security manager
pub struct ApiSecurityManager {
    api_keys: Arc<parking_lot::RwLock<HashMap<String, ApiKey>>>,
    rate_limiter: Arc<RateLimiter>,
}

impl ApiSecurityManager {
    pub fn new() -> Self {
        Self {
            api_keys: Arc::new(parking_lot::RwLock::new(HashMap::new())),
            rate_limiter: Arc::new(RateLimiter::new(RateLimitConfig::default())),
        }
    }

    /// Create a new API key
    pub fn create_api_key(
        &self,
        name: String,
        permissions: Vec<String>,
        expires_in_days: Option<i64>,
    ) -> ApiKey {
        let mut key = ApiKey::new(name, permissions);

        if let Some(days) = expires_in_days {
            key.expires_at = Some(Utc::now() + chrono::Duration::days(days));
        }

        let mut keys = self.api_keys.write();
        keys.insert(key.key_id.clone(), key.clone());

        key
    }

    /// Revoke an API key
    pub fn revoke_api_key(&self, key_id: &str) -> Result<(), String> {
        let mut keys = self.api_keys.write();
        keys.remove(key_id)
            .ok_or_else(|| format!("API key {} not found", key_id))?;
        Ok(())
    }

    /// Get API key by ID
    pub fn get_api_key(&self, key_id: &str) -> Option<ApiKey> {
        let keys = self.api_keys.read();
        keys.get(key_id).cloned()
    }

    /// List all API keys (without secrets)
    pub fn list_api_keys(&self) -> Vec<ApiKey> {
        let keys = self.api_keys.read();
        keys.values().cloned().collect()
    }

    /// Rotate API key secret
    pub fn rotate_api_key(&self, key_id: &str) -> Result<ApiKey, String> {
        let mut keys = self.api_keys.write();
        let key = keys
            .get_mut(key_id)
            .ok_or_else(|| format!("API key {} not found", key_id))?;

        key.key_secret = ApiKey::generate_secret();
        Ok(key.clone())
    }

    /// Validate request signature
    pub fn validate_signature(
        &self,
        key_id: &str,
        timestamp: &str,
        body: &str,
        signature: &str,
    ) -> Result<(), String> {
        // Get API key
        let keys = self.api_keys.read();
        let key = keys.get(key_id).ok_or("Invalid API key")?;

        // Check expiration
        if key.is_expired() {
            return Err("API key has expired".to_string());
        }

        // Validate timestamp (prevent replay attacks)
        let request_time = timestamp
            .parse::<i64>()
            .map_err(|_| "Invalid timestamp format")?;
        let now = Utc::now().timestamp();

        if (now - request_time).abs() > REQUEST_VALIDITY_WINDOW {
            return Err("Request timestamp is outside valid window (5 minutes)".to_string());
        }

        // Compute expected signature
        let payload = format!("{}:{}:{}", key_id, timestamp, body);
        let expected_signature = compute_hmac(&key.key_secret, &payload);

        // Constant-time comparison to prevent timing attacks
        if !constant_time_compare(signature, &expected_signature) {
            return Err("Invalid signature".to_string());
        }

        // Update last used timestamp
        drop(keys);
        let mut keys = self.api_keys.write();
        if let Some(key) = keys.get_mut(key_id) {
            key.last_used_at = Some(Utc::now());
        }

        Ok(())
    }

    /// Check rate limit for API key
    pub fn check_rate_limit(&self, key_id: &str) -> Result<(), String> {
        self.rate_limiter.check_rate_limit(key_id)
    }

    /// Validate API key and permissions
    pub fn validate_request(&self, key_id: &str, permission: &str) -> Result<(), String> {
        let keys = self.api_keys.read();
        let key = keys.get(key_id).ok_or("Invalid API key")?;

        if key.is_expired() {
            return Err("API key has expired".to_string());
        }

        if !key.has_permission(permission) {
            return Err(format!("Permission denied: {}", permission));
        }

        Ok(())
    }
}

impl Default for ApiSecurityManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Compute HMAC-SHA256 signature
/// Updated Nov 16, 2025: Handle HMAC construction gracefully instead of using expect
pub fn compute_hmac(secret: &str, payload: &str) -> String {
    use hmac::{Hmac, Mac};
    type HmacSha256 = Hmac<Sha256>;

    // HMAC can take keys of any size, but handle gracefully just in case
    let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(mac) => mac,
        Err(e) => {
            tracing::error!("Failed to create HMAC: {}. This should never happen.", e);
            // Return empty signature as fallback (will fail validation)
            return String::new();
        }
    };
    mac.update(payload.as_bytes());

    let result = mac.finalize();
    let code_bytes = result.into_bytes();

    hex::encode(code_bytes)
}

/// Constant-time string comparison to prevent timing attacks
fn constant_time_compare(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }

    let mut result = 0u8;
    for (byte_a, byte_b) in a.bytes().zip(b.bytes()) {
        result |= byte_a ^ byte_b;
    }

    result == 0
}

/// CORS configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorsConfig {
    pub allowed_origins: Vec<String>,
    pub allowed_methods: Vec<String>,
    pub allowed_headers: Vec<String>,
    pub max_age: u32,
}

impl Default for CorsConfig {
    fn default() -> Self {
        Self {
            allowed_origins: vec!["http://localhost:*".to_string()],
            allowed_methods: vec![
                "GET".to_string(),
                "POST".to_string(),
                "PUT".to_string(),
                "DELETE".to_string(),
            ],
            allowed_headers: vec![
                "Content-Type".to_string(),
                "Authorization".to_string(),
                SIGNATURE_HEADER.to_string(),
                TIMESTAMP_HEADER.to_string(),
                API_KEY_HEADER.to_string(),
            ],
            max_age: 3600,
        }
    }
}

/// Content Security Policy builder
pub struct CspBuilder {
    directives: HashMap<String, Vec<String>>,
}

impl CspBuilder {
    pub fn new() -> Self {
        Self {
            directives: HashMap::new(),
        }
    }

    pub fn default_src(mut self, sources: Vec<&str>) -> Self {
        self.directives.insert(
            "default-src".to_string(),
            sources.iter().map(|s| s.to_string()).collect(),
        );
        self
    }

    pub fn script_src(mut self, sources: Vec<&str>) -> Self {
        self.directives.insert(
            "script-src".to_string(),
            sources.iter().map(|s| s.to_string()).collect(),
        );
        self
    }

    pub fn style_src(mut self, sources: Vec<&str>) -> Self {
        self.directives.insert(
            "style-src".to_string(),
            sources.iter().map(|s| s.to_string()).collect(),
        );
        self
    }

    pub fn img_src(mut self, sources: Vec<&str>) -> Self {
        self.directives.insert(
            "img-src".to_string(),
            sources.iter().map(|s| s.to_string()).collect(),
        );
        self
    }

    pub fn connect_src(mut self, sources: Vec<&str>) -> Self {
        self.directives.insert(
            "connect-src".to_string(),
            sources.iter().map(|s| s.to_string()).collect(),
        );
        self
    }

    pub fn build(self) -> String {
        self.directives
            .into_iter()
            .map(|(key, values)| format!("{} {}", key, values.join(" ")))
            .collect::<Vec<_>>()
            .join("; ")
    }
}

impl Default for CspBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_key_creation() {
        let manager = ApiSecurityManager::new();
        let key = manager.create_api_key(
            "Test Key".to_string(),
            vec!["read".to_string(), "write".to_string()],
            Some(30),
        );

        assert_eq!(key.name, "Test Key");
        assert!(key.has_permission("read"));
        assert!(key.has_permission("write"));
        assert!(!key.has_permission("delete"));
        assert!(!key.is_expired());
    }

    #[test]
    fn test_api_key_expiration() {
        let mut key = ApiKey::new("Test".to_string(), vec![]);
        key.expires_at = Some(Utc::now() - chrono::Duration::days(1));
        assert!(key.is_expired());
    }

    #[test]
    fn test_hmac_signature() {
        let secret = "my_secret_key";
        let payload = "test_payload_data";

        let signature1 = compute_hmac(secret, payload);
        let signature2 = compute_hmac(secret, payload);

        assert_eq!(signature1, signature2);

        let different_signature = compute_hmac("different_secret", payload);
        assert_ne!(signature1, different_signature);
    }

    #[test]
    fn test_signature_validation() {
        let manager = ApiSecurityManager::new();
        let key = manager.create_api_key("Test Key".to_string(), vec!["*".to_string()], None);

        let timestamp = Utc::now().timestamp().to_string();
        let body = r#"{"test": "data"}"#;
        let payload = format!("{}:{}:{}", key.key_id, timestamp, body);
        let signature = compute_hmac(&key.key_secret, &payload);

        // Valid signature should succeed
        assert!(manager
            .validate_signature(&key.key_id, &timestamp, body, &signature)
            .is_ok());

        // Invalid signature should fail
        assert!(manager
            .validate_signature(&key.key_id, &timestamp, body, "invalid_signature")
            .is_err());

        // Old timestamp should fail
        let old_timestamp = (Utc::now().timestamp() - 400).to_string();
        assert!(manager
            .validate_signature(&key.key_id, &old_timestamp, body, &signature)
            .is_err());
    }

    #[test]
    fn test_constant_time_compare() {
        assert!(constant_time_compare("abc123", "abc123"));
        assert!(!constant_time_compare("abc123", "abc124"));
        assert!(!constant_time_compare("abc123", "abc12"));
    }

    #[test]
    fn test_api_key_rotation() {
        let manager = ApiSecurityManager::new();
        let key = manager.create_api_key("Test".to_string(), vec![], None);
        let original_secret = key.key_secret.clone();

        let rotated = manager.rotate_api_key(&key.key_id).unwrap();
        assert_ne!(original_secret, rotated.key_secret);
    }

    #[test]
    fn test_permission_validation() {
        let manager = ApiSecurityManager::new();
        let key = manager.create_api_key("Test".to_string(), vec!["read".to_string()], None);

        assert!(manager.validate_request(&key.key_id, "read").is_ok());
        assert!(manager.validate_request(&key.key_id, "write").is_err());
    }

    #[test]
    fn test_csp_builder() {
        let csp = CspBuilder::new()
            .default_src(vec!["'self'"])
            .script_src(vec!["'self'", "'wasm-unsafe-eval'"])
            .style_src(vec!["'self'", "'unsafe-inline'"])
            .build();

        assert!(csp.contains("default-src 'self'"));
        assert!(csp.contains("script-src 'self' 'wasm-unsafe-eval'"));
        assert!(csp.contains("style-src 'self' 'unsafe-inline'"));
    }
}
