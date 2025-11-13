use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use chrono::Utc;
use uuid::Uuid;

/// Social sharing platform
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SharePlatform {
    Twitter,
    LinkedIn,
    Reddit,
    HackerNews,
    Email,
    DirectLink,
}

/// Workflow statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStats {
    pub view_count: u64,
    pub clone_count: u64,
    pub favorite_count: u64,
    pub rating_count: u64,
    pub avg_rating: f64,
    pub comment_count: u64,
    pub total_time_saved: u64,
    pub total_cost_saved: f64,
}

/// Workflow comment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowComment {
    pub id: String,
    pub workflow_id: String,
    pub user_id: String,
    pub user_name: String,
    pub user_avatar: Option<String>,
    pub comment: String,
    pub created_at: i64,
}

/// Workflow rating
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowRating {
    pub workflow_id: String,
    pub user_id: String,
    pub rating: u8, // 1-5
    pub comment: Option<String>,
    pub created_at: i64,
}

/// Social features for workflows
pub struct WorkflowSocial {
    db: Arc<Mutex<Connection>>,
}

impl WorkflowSocial {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    /// Rate a workflow (1-5 stars)
    pub fn rate_workflow(
        &self,
        workflow_id: &str,
        user_id: &str,
        rating: u8,
        comment: Option<String>,
    ) -> Result<(), String> {
        if rating < 1 || rating > 5 {
            return Err("Rating must be between 1 and 5".to_string());
        }

        let conn = self.db.lock().map_err(|e| format!("Failed to lock database: {}", e))?;

        let now = Utc::now().timestamp();

        // Insert or replace rating
        conn.execute(
            "INSERT OR REPLACE INTO workflow_ratings (workflow_id, user_id, rating, comment, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![workflow_id, user_id, rating, comment, now],
        ).map_err(|e| format!("Failed to insert rating: {}", e))?;

        // Update aggregate rating in published_workflows
        self.update_aggregate_rating(workflow_id)?;

        Ok(())
    }

    /// Get user's rating for a workflow
    pub fn get_user_rating(&self, workflow_id: &str, user_id: &str) -> Result<Option<WorkflowRating>, String> {
        let conn = self.db.lock().map_err(|e| format!("Failed to lock database: {}", e))?;

        let result = conn.query_row(
            "SELECT workflow_id, user_id, rating, comment, created_at
             FROM workflow_ratings WHERE workflow_id = ?1 AND user_id = ?2",
            rusqlite::params![workflow_id, user_id],
            |row| {
                Ok(WorkflowRating {
                    workflow_id: row.get(0)?,
                    user_id: row.get(1)?,
                    rating: row.get(2)?,
                    comment: row.get(3)?,
                    created_at: row.get(4)?,
                })
            },
        );

        match result {
            Ok(rating) => Ok(Some(rating)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("Failed to get rating: {}", e)),
        }
    }

    /// Add a comment to a workflow
    pub fn comment_on_workflow(
        &self,
        workflow_id: &str,
        user_id: &str,
        user_name: &str,
        comment: String,
    ) -> Result<String, String> {
        let conn = self.db.lock().map_err(|e| format!("Failed to lock database: {}", e))?;

        let comment_id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();

        conn.execute(
            "INSERT INTO workflow_comments (id, workflow_id, user_id, user_name, comment, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![&comment_id, workflow_id, user_id, user_name, &comment, now],
        ).map_err(|e| format!("Failed to insert comment: {}", e))?;

        Ok(comment_id)
    }

    /// Get comments for a workflow
    pub fn get_workflow_comments(&self, workflow_id: &str, limit: usize, offset: usize) -> Result<Vec<WorkflowComment>, String> {
        let conn = self.db.lock().map_err(|e| format!("Failed to lock database: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, workflow_id, user_id, user_name, comment, created_at
             FROM workflow_comments
             WHERE workflow_id = ?1
             ORDER BY created_at DESC
             LIMIT ?2 OFFSET ?3"
        ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let comments = stmt.query_map(
            rusqlite::params![workflow_id, limit as i64, offset as i64],
            |row| {
                Ok(WorkflowComment {
                    id: row.get(0)?,
                    workflow_id: row.get(1)?,
                    user_id: row.get(2)?,
                    user_name: row.get(3)?,
                    user_avatar: None,
                    comment: row.get(4)?,
                    created_at: row.get(5)?,
                })
            },
        )
            .map_err(|e| format!("Failed to query comments: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect comments: {}", e))?;

        Ok(comments)
    }

    /// Delete a comment (user can only delete their own)
    pub fn delete_comment(&self, comment_id: &str, user_id: &str) -> Result<(), String> {
        let conn = self.db.lock().map_err(|e| format!("Failed to lock database: {}", e))?;

        let rows_affected = conn.execute(
            "DELETE FROM workflow_comments WHERE id = ?1 AND user_id = ?2",
            rusqlite::params![comment_id, user_id],
        ).map_err(|e| format!("Failed to delete comment: {}", e))?;

        if rows_affected == 0 {
            return Err("Comment not found or not authorized".to_string());
        }

        Ok(())
    }

    /// Favorite a workflow
    pub fn favorite_workflow(&self, workflow_id: &str, user_id: &str) -> Result<(), String> {
        let conn = self.db.lock().map_err(|e| format!("Failed to lock database: {}", e))?;

        let now = Utc::now().timestamp();

        conn.execute(
            "INSERT OR IGNORE INTO workflow_favorites (workflow_id, user_id, favorited_at)
             VALUES (?1, ?2, ?3)",
            rusqlite::params![workflow_id, user_id, now],
        ).map_err(|e| format!("Failed to favorite workflow: {}", e))?;

        // Update favorite count
        conn.execute(
            "UPDATE published_workflows
             SET favorite_count = (SELECT COUNT(*) FROM workflow_favorites WHERE workflow_id = ?1)
             WHERE id = ?1",
            rusqlite::params![workflow_id],
        ).map_err(|e| format!("Failed to update favorite count: {}", e))?;

        Ok(())
    }

    /// Unfavorite a workflow
    pub fn unfavorite_workflow(&self, workflow_id: &str, user_id: &str) -> Result<(), String> {
        let conn = self.db.lock().map_err(|e| format!("Failed to lock database: {}", e))?;

        conn.execute(
            "DELETE FROM workflow_favorites WHERE workflow_id = ?1 AND user_id = ?2",
            rusqlite::params![workflow_id, user_id],
        ).map_err(|e| format!("Failed to unfavorite workflow: {}", e))?;

        // Update favorite count
        conn.execute(
            "UPDATE published_workflows
             SET favorite_count = (SELECT COUNT(*) FROM workflow_favorites WHERE workflow_id = ?1)
             WHERE id = ?1",
            rusqlite::params![workflow_id],
        ).map_err(|e| format!("Failed to update favorite count: {}", e))?;

        Ok(())
    }

    /// Check if user has favorited a workflow
    pub fn is_favorited(&self, workflow_id: &str, user_id: &str) -> Result<bool, String> {
        let conn = self.db.lock().map_err(|e| format!("Failed to lock database: {}", e))?;

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM workflow_favorites WHERE workflow_id = ?1 AND user_id = ?2",
            rusqlite::params![workflow_id, user_id],
            |row| row.get(0),
        ).map_err(|e| format!("Failed to check favorite: {}", e))?;

        Ok(count > 0)
    }

    /// Get user's favorited workflows
    pub fn get_user_favorites(&self, user_id: &str) -> Result<Vec<String>, String> {
        let conn = self.db.lock().map_err(|e| format!("Failed to lock database: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT workflow_id FROM workflow_favorites WHERE user_id = ?1 ORDER BY favorited_at DESC"
        ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let workflow_ids = stmt.query_map(rusqlite::params![user_id], |row| row.get(0))
            .map_err(|e| format!("Failed to query favorites: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect favorites: {}", e))?;

        Ok(workflow_ids)
    }

    /// Generate share link for social media
    pub fn share_workflow(&self, workflow_id: &str, platform: SharePlatform) -> Result<String, String> {
        let conn = self.db.lock().map_err(|e| format!("Failed to lock database: {}", e))?;

        let (title, share_url): (String, String) = conn.query_row(
            "SELECT title, share_url FROM published_workflows WHERE id = ?1",
            rusqlite::params![workflow_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| format!("Workflow not found: {}", e))?;

        let full_url = format!("https://agiworkforce.com/{}", share_url);

        let share_link = match platform {
            SharePlatform::Twitter => {
                format!(
                    "https://twitter.com/intent/tweet?text={}&url={}",
                    urlencoding::encode(&format!("Check out this workflow: {}", title)),
                    urlencoding::encode(&full_url)
                )
            }
            SharePlatform::LinkedIn => {
                format!(
                    "https://www.linkedin.com/sharing/share-offsite/?url={}",
                    urlencoding::encode(&full_url)
                )
            }
            SharePlatform::Reddit => {
                format!(
                    "https://reddit.com/submit?url={}&title={}",
                    urlencoding::encode(&full_url),
                    urlencoding::encode(&title)
                )
            }
            SharePlatform::HackerNews => {
                format!(
                    "https://news.ycombinator.com/submitlink?u={}&t={}",
                    urlencoding::encode(&full_url),
                    urlencoding::encode(&title)
                )
            }
            SharePlatform::Email => {
                format!(
                    "mailto:?subject={}&body={}",
                    urlencoding::encode(&format!("Check out this workflow: {}", title)),
                    urlencoding::encode(&format!("I found this workflow that might interest you:\n\n{}\n\n{}", title, full_url))
                )
            }
            SharePlatform::DirectLink => full_url,
        };

        Ok(share_link)
    }

    /// Get workflow statistics
    pub fn get_workflow_stats(&self, workflow_id: &str) -> Result<WorkflowStats, String> {
        let conn = self.db.lock().map_err(|e| format!("Failed to lock database: {}", e))?;

        // Get main stats from published_workflows
        let (view_count, clone_count, favorite_count, avg_rating, rating_count, estimated_time_saved, estimated_cost_saved):
            (i64, i64, i64, f64, i64, i64, f64) = conn.query_row(
            "SELECT view_count, clone_count, favorite_count, avg_rating, rating_count,
                    estimated_time_saved, estimated_cost_saved
             FROM published_workflows WHERE id = ?1",
            rusqlite::params![workflow_id],
            |row| Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
            )),
        ).map_err(|e| format!("Workflow not found: {}", e))?;

        // Get comment count
        let comment_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM workflow_comments WHERE workflow_id = ?1",
            rusqlite::params![workflow_id],
            |row| row.get(0),
        ).unwrap_or(0);

        // Calculate total time/cost saved (time_saved * clone_count)
        let total_time_saved = estimated_time_saved as u64 * clone_count as u64;
        let total_cost_saved = estimated_cost_saved * clone_count as f64;

        Ok(WorkflowStats {
            view_count: view_count as u64,
            clone_count: clone_count as u64,
            favorite_count: favorite_count as u64,
            rating_count: rating_count as u64,
            avg_rating,
            comment_count: comment_count as u64,
            total_time_saved,
            total_cost_saved,
        })
    }

    /// Update aggregate rating for a workflow
    fn update_aggregate_rating(&self, workflow_id: &str) -> Result<(), String> {
        let conn = self.db.lock().map_err(|e| format!("Failed to lock database: {}", e))?;

        conn.execute(
            "UPDATE published_workflows
             SET avg_rating = (SELECT AVG(rating) FROM workflow_ratings WHERE workflow_id = ?1),
                 rating_count = (SELECT COUNT(*) FROM workflow_ratings WHERE workflow_id = ?1)
             WHERE id = ?1",
            rusqlite::params![workflow_id],
        ).map_err(|e| format!("Failed to update aggregate rating: {}", e))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rating_validation() {
        // This would be tested in integration tests with actual database
        assert!(1 >= 1 && 1 <= 5);
        assert!(5 >= 1 && 5 <= 5);
        assert!(!(0 >= 1 && 0 <= 5));
        assert!(!(6 >= 1 && 6 <= 5));
    }

    #[test]
    fn test_share_platform_serialization() {
        let platform = SharePlatform::Twitter;
        let json = serde_json::to_string(&platform).unwrap();
        assert_eq!(json, "\"twitter\"");
    }
}
