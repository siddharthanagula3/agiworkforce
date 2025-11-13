use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use chrono::Utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Participant {
    pub user_id: String,
    pub color: String,
    pub joined_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorPosition {
    pub x: i32,
    pub y: i32,
    pub element_id: Option<String>,
}

pub struct CollaborationSession {
    resource_id: String,
    participants: Arc<Mutex<Vec<Participant>>>,
    cursor_positions: Arc<Mutex<HashMap<String, CursorPosition>>>,
}

impl CollaborationSession {
    pub fn new(resource_id: String) -> Self {
        Self {
            resource_id,
            participants: Arc::new(Mutex::new(Vec::new())),
            cursor_positions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn add_participant(&self, user_id: String) {
        let participant = Participant {
            user_id: user_id.clone(),
            color: Self::assign_color(&user_id),
            joined_at: Utc::now().timestamp(),
        };
        self.participants.lock().unwrap().push(participant);
    }

    pub fn remove_participant(&self, user_id: &str) {
        let mut participants = self.participants.lock().unwrap();
        participants.retain(|p| p.user_id != user_id);
        self.cursor_positions.lock().unwrap().remove(user_id);
    }

    pub fn update_cursor(&self, user_id: &str, position: CursorPosition) {
        self.cursor_positions.lock().unwrap().insert(user_id.to_string(), position);
    }

    pub fn get_active_editors(&self) -> Vec<Participant> {
        self.participants.lock().unwrap().clone()
    }

    pub fn get_cursor_positions(&self) -> HashMap<String, CursorPosition> {
        self.cursor_positions.lock().unwrap().clone()
    }

    pub fn get_resource_id(&self) -> &str {
        &self.resource_id
    }

    fn assign_color(user_id: &str) -> String {
        let colors = vec!["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6"];
        let index = user_id.as_bytes().first().copied().unwrap_or(0) as usize % colors.len();
        colors[index].to_string()
    }
}
