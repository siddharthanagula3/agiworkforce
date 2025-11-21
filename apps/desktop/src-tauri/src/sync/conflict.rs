use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConflictResolution {
    UseLocal,
    UseRemote,
    Merge,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictData {
    pub entity_id: String,
    pub entity_type: String,
    pub local_data: String,
    pub remote_data: String,
    pub local_timestamp: String,
    pub remote_timestamp: String,
    pub local_hash: String,
    pub remote_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedConflict {
    pub entity_id: String,
    pub resolution: ConflictResolution,
    pub merged_data: Option<String>,
    pub timestamp: String,
}

pub struct ConflictResolver {
    #[allow(dead_code)]
    auto_resolve: bool,
}

impl ConflictResolver {
    pub fn new(auto_resolve: bool) -> Self {
        Self { auto_resolve }
    }

    pub fn detect_conflict(&self, conflict_data: &ConflictData) -> bool {
        // Conflict exists if both local and remote have been modified
        if conflict_data.local_hash != conflict_data.remote_hash {
            // Compare timestamps to see if they diverged
            let local_time = chrono::DateTime::parse_from_rfc3339(&conflict_data.local_timestamp);
            let remote_time = chrono::DateTime::parse_from_rfc3339(&conflict_data.remote_timestamp);

            if let (Ok(local), Ok(remote)) = (local_time, remote_time) {
                // If timestamps are very close (within 1 second), might be same update
                let diff = (local.timestamp() - remote.timestamp()).abs();
                if diff > 1 {
                    return true;
                }
            }
        }

        false
    }

    pub fn auto_resolve(&self, conflict_data: &ConflictData) -> Result<ResolvedConflict> {
        // Strategy: Last Write Wins (LWW)
        let local_time = chrono::DateTime::parse_from_rfc3339(&conflict_data.local_timestamp)?;
        let remote_time = chrono::DateTime::parse_from_rfc3339(&conflict_data.remote_timestamp)?;

        let resolution = if remote_time > local_time {
            ConflictResolution::UseRemote
        } else {
            ConflictResolution::UseLocal
        };

        let merged_data = match resolution {
            ConflictResolution::UseRemote => Some(conflict_data.remote_data.clone()),
            ConflictResolution::UseLocal => Some(conflict_data.local_data.clone()),
            _ => None,
        };

        Ok(ResolvedConflict {
            entity_id: conflict_data.entity_id.clone(),
            resolution,
            merged_data,
            timestamp: chrono::Utc::now().to_rfc3339(),
        })
    }

    pub fn merge_json_data(&self, local: &str, remote: &str) -> Result<String> {
        // Parse both JSON objects
        let local_json: serde_json::Value = serde_json::from_str(local)?;
        let remote_json: serde_json::Value = serde_json::from_str(remote)?;

        // Merge strategy: Take remote values for conflicts, keep local if not in remote
        let merged = self.merge_json_objects(&local_json, &remote_json);

        Ok(serde_json::to_string(&merged)?)
    }

    fn merge_json_objects(
        &self,
        local: &serde_json::Value,
        remote: &serde_json::Value,
    ) -> serde_json::Value {
        match (local, remote) {
            (serde_json::Value::Object(local_map), serde_json::Value::Object(remote_map)) => {
                let mut merged_map = local_map.clone();

                for (key, remote_value) in remote_map {
                    if let Some(local_value) = merged_map.get(key) {
                        // Recursively merge if both are objects
                        if local_value.is_object() && remote_value.is_object() {
                            merged_map.insert(
                                key.clone(),
                                self.merge_json_objects(local_value, remote_value),
                            );
                        } else {
                            // Remote wins for scalar conflicts
                            merged_map.insert(key.clone(), remote_value.clone());
                        }
                    } else {
                        // New key from remote
                        merged_map.insert(key.clone(), remote_value.clone());
                    }
                }

                serde_json::Value::Object(merged_map)
            }
            (_, remote) => remote.clone(), // Use remote for non-object types
        }
    }

    pub fn create_conflict_report(&self, conflicts: Vec<ConflictData>) -> String {
        let mut report = String::new();
        report.push_str("Sync Conflict Report\n");
        report.push_str("===================\n\n");

        for (idx, conflict) in conflicts.iter().enumerate() {
            report.push_str(&format!("Conflict #{}\n", idx + 1));
            report.push_str(&format!("Entity ID: {}\n", conflict.entity_id));
            report.push_str(&format!("Entity Type: {}\n", conflict.entity_type));
            report.push_str(&format!("Local Modified: {}\n", conflict.local_timestamp));
            report.push_str(&format!("Remote Modified: {}\n", conflict.remote_timestamp));
            report.push_str("\n");
        }

        report
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conflict_detection() {
        let resolver = ConflictResolver::new(true);

        let conflict_data = ConflictData {
            entity_id: "test".to_string(),
            entity_type: "Message".to_string(),
            local_data: "{\"content\": \"local\"}".to_string(),
            remote_data: "{\"content\": \"remote\"}".to_string(),
            local_timestamp: "2025-01-01T10:00:00Z".to_string(),
            remote_timestamp: "2025-01-01T10:00:05Z".to_string(),
            local_hash: "abc123".to_string(),
            remote_hash: "def456".to_string(),
        };

        assert!(resolver.detect_conflict(&conflict_data));
    }

    #[test]
    fn test_auto_resolve_lww() {
        let resolver = ConflictResolver::new(true);

        let conflict_data = ConflictData {
            entity_id: "test".to_string(),
            entity_type: "Message".to_string(),
            local_data: "{\"content\": \"local\"}".to_string(),
            remote_data: "{\"content\": \"remote\"}".to_string(),
            local_timestamp: "2025-01-01T10:00:00Z".to_string(),
            remote_timestamp: "2025-01-01T10:00:05Z".to_string(),
            local_hash: "abc123".to_string(),
            remote_hash: "def456".to_string(),
        };

        let resolved = resolver.auto_resolve(&conflict_data).unwrap();

        // Remote is newer, should use remote
        match resolved.resolution {
            ConflictResolution::UseRemote => assert!(true),
            _ => panic!("Expected UseRemote resolution"),
        }
    }

    #[test]
    fn test_merge_json() {
        let resolver = ConflictResolver::new(true);

        let local = r#"{"name": "John", "age": 30, "city": "NYC"}"#;
        let remote = r#"{"name": "John", "age": 31, "country": "USA"}"#;

        let merged = resolver.merge_json_data(local, remote).unwrap();
        let merged_json: serde_json::Value = serde_json::from_str(&merged).unwrap();

        assert_eq!(merged_json["name"], "John");
        assert_eq!(merged_json["age"], 31); // Remote wins
        assert_eq!(merged_json["city"], "NYC"); // Local kept
        assert_eq!(merged_json["country"], "USA"); // New from remote
    }
}
