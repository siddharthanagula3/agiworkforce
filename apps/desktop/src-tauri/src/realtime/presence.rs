use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPresence {
    pub user_id: String,
    pub status: PresenceStatus,
    pub last_seen: i64,
    pub current_activity: Option<UserActivity>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PresenceStatus {
    Online,
    Away,
    Busy,
    Offline,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserActivity {
    pub activity_type: ActivityType,
    pub resource_id: String,
    pub started_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActivityType {
    EditingGoal,
    EditingWorkflow,
    ViewingAnalytics,
    RunningAutomation,
}

pub struct PresenceManager {
    db: Arc<Mutex<Connection>>,
    online_users: Arc<Mutex<HashMap<String, UserPresence>>>,
}

impl PresenceManager {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self {
            db,
            online_users: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn set_online(&self, user_id: &str) {
        let presence = UserPresence {
            user_id: user_id.to_string(),
            status: PresenceStatus::Online,
            last_seen: Utc::now().timestamp(),
            current_activity: None,
        };

        self.online_users
            .lock()
            .unwrap()
            .insert(user_id.to_string(), presence.clone());
        let _ = self.persist_presence(&presence);
    }

    pub fn set_offline(&self, user_id: &str) {
        if let Some(presence) = self.online_users.lock().unwrap().get_mut(user_id) {
            presence.status = PresenceStatus::Offline;
            presence.last_seen = Utc::now().timestamp();
            let _ = self.persist_presence(presence);
        }
        self.online_users.lock().unwrap().remove(user_id);
    }

    pub fn set_activity(&self, user_id: &str, activity: UserActivity) {
        if let Some(presence) = self.online_users.lock().unwrap().get_mut(user_id) {
            presence.current_activity = Some(activity);
            let _ = self.persist_presence(presence);
        }
    }

    pub fn get_team_presence(&self, _team_id: &str) -> Vec<UserPresence> {
        // For now, return all online users
        // In a real implementation, filter by team_id from database
        self.online_users
            .lock()
            .unwrap()
            .values()
            .cloned()
            .collect()
    }

    pub fn get_user_presence(&self, user_id: &str) -> Option<UserPresence> {
        self.online_users.lock().unwrap().get(user_id).cloned()
    }

    fn persist_presence(&self, presence: &UserPresence) -> Result<(), rusqlite::Error> {
        let db = self.db.lock().unwrap();
        let activity_json = presence
            .current_activity
            .as_ref()
            .map(|a| serde_json::to_string(a).unwrap_or_default());

        db.execute(
            "INSERT OR REPLACE INTO user_presence
             (user_id, status, last_seen, current_activity, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                &presence.user_id,
                serde_json::to_string(&presence.status).unwrap_or_default(),
                presence.last_seen,
                activity_json,
                Utc::now().timestamp(),
            ],
        )?;

        Ok(())
    }
}
