use super::*;
use chrono::Utc;
use rusqlite::{params, Connection};
use std::sync::{Arc, Mutex};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProgressError {
    #[error("Progress not found")]
    NotFound,
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("Invalid step index: {0}")]
    InvalidStepIndex(usize),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

pub struct ProgressTracker {
    db: Arc<Mutex<Connection>>,
}

impl ProgressTracker {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    pub fn start_tutorial(
        &self,
        user_id: &str,
        tutorial_id: &str,
    ) -> Result<OnboardingProgress, ProgressError> {
        let conn = self.db.lock().unwrap();
        let now = Utc::now().timestamp();

        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM tutorial_progress
                 WHERE user_id = ?1 AND tutorial_id = ?2",
                params![user_id, tutorial_id],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if !exists {
            conn.execute(
                "INSERT INTO tutorial_progress (user_id, tutorial_id, current_step, completed_steps, started_at, last_updated)
                 VALUES (?1, ?2, 0, '[]', ?3, ?3)",
                params![user_id, tutorial_id, now],
            )?;
        }

        self.get_progress(user_id, tutorial_id)
    }

    pub fn complete_step(
        &self,
        user_id: &str,
        tutorial_id: &str,
        step_id: &str,
    ) -> Result<OnboardingProgress, ProgressError> {
        let conn = self.db.lock().unwrap();
        let now = Utc::now().timestamp();

        let (current_step, completed_steps_json): (usize, String) = conn.query_row(
            "SELECT current_step, completed_steps FROM tutorial_progress
                 WHERE user_id = ?1 AND tutorial_id = ?2",
            params![user_id, tutorial_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        let mut completed_steps: Vec<String> =
            serde_json::from_str(&completed_steps_json).unwrap_or_default();

        if !completed_steps.contains(&step_id.to_string()) {
            completed_steps.push(step_id.to_string());

            let completed_steps_json = serde_json::to_string(&completed_steps)?;
            conn.execute(
                "UPDATE tutorial_progress
                 SET current_step = ?1, completed_steps = ?2, last_updated = ?3
                 WHERE user_id = ?4 AND tutorial_id = ?5",
                params![
                    current_step + 1,
                    completed_steps_json,
                    now,
                    user_id,
                    tutorial_id
                ],
            )?;
        }

        drop(conn);
        self.get_progress(user_id, tutorial_id)
    }

    pub fn complete_tutorial(&self, user_id: &str, tutorial_id: &str) -> Result<(), ProgressError> {
        let conn = self.db.lock().unwrap();
        let now = Utc::now().timestamp();

        conn.execute(
            "UPDATE tutorial_progress
             SET completed_at = ?1, last_updated = ?1
             WHERE user_id = ?2 AND tutorial_id = ?3",
            params![now, user_id, tutorial_id],
        )?;

        Ok(())
    }

    pub fn skip_step(
        &self,
        user_id: &str,
        tutorial_id: &str,
        step_id: &str,
    ) -> Result<OnboardingProgress, ProgressError> {
        self.complete_step(user_id, tutorial_id, step_id)
    }

    pub fn reset_tutorial(&self, user_id: &str, tutorial_id: &str) -> Result<(), ProgressError> {
        let conn = self.db.lock().unwrap();

        conn.execute(
            "DELETE FROM tutorial_progress
             WHERE user_id = ?1 AND tutorial_id = ?2",
            params![user_id, tutorial_id],
        )?;

        Ok(())
    }

    pub fn get_progress(
        &self,
        user_id: &str,
        tutorial_id: &str,
    ) -> Result<OnboardingProgress, ProgressError> {
        let conn = self.db.lock().unwrap();

        let result = conn.query_row(
            "SELECT user_id, tutorial_id, current_step, completed_steps, started_at, completed_at, last_updated
             FROM tutorial_progress
             WHERE user_id = ?1 AND tutorial_id = ?2",
            params![user_id, tutorial_id],
            |row| {
                let completed_steps_json: String = row.get(3)?;
                let completed_steps: Vec<String> = serde_json::from_str(&completed_steps_json)
                    .unwrap_or_default();

                Ok(OnboardingProgress {
                    user_id: row.get(0)?,
                    tutorial_id: row.get(1)?,
                    current_step: row.get(2)?,
                    completed_steps,
                    started_at: row.get(4)?,
                    completed_at: row.get(5)?,
                    last_updated: row.get(6)?,
                })
            },
        );

        match result {
            Ok(progress) => Ok(progress),
            Err(rusqlite::Error::QueryReturnedNoRows) => Err(ProgressError::NotFound),
            Err(e) => Err(ProgressError::Database(e)),
        }
    }

    pub fn get_user_progress(&self, user_id: &str) -> Result<UserTutorialProgress, ProgressError> {
        let conn = self.db.lock().unwrap();

        let mut stmt = conn.prepare(
            "SELECT tutorial_id, completed_at FROM tutorial_progress
             WHERE user_id = ?1 AND completed_at IS NOT NULL",
        )?;

        let completed_tutorials: HashMap<String, i64> = stm
            .query_map([user_id], |row| Ok((row.get(0)?, row.get(1)?)))?
            .filter_map(Result::ok)
            .collect();

        let mut stmt = conn.prepare(
            "SELECT user_id, tutorial_id, current_step, completed_steps, started_at, completed_at, last_updated
             FROM tutorial_progress
             WHERE user_id = ?1 AND completed_at IS NULL"
        )?;

        let in_progress: Vec<OnboardingProgress> = stm
            .query_map([user_id], |row| {
                let completed_steps_json: String = row.get(3)?;
                let completed_steps: Vec<String> =
                    serde_json::from_str(&completed_steps_json).unwrap_or_default();

                Ok(OnboardingProgress {
                    user_id: row.get(0)?,
                    tutorial_id: row.get(1)?,
                    current_step: row.get(2)?,
                    completed_steps,
                    started_at: row.get(4)?,
                    completed_at: row.get(5)?,
                    last_updated: row.get(6)?,
                })
            })?
            .filter_map(Result::ok)
            .collect();

        let mut in_progress_tutorials = HashMap::new();
        for progress in in_progress {
            in_progress_tutorials.insert(progress.tutorial_id.clone(), progress);
        }

        let mut stmt = conn.prepare("SELECT reward_id FROM user_rewards WHERE user_id = ?1")?;

        let earned_rewards: Vec<String> = stm
            .query_map([user_id], |row| row.get(0))?
            .filter_map(Result::ok)
            .collect();

        let total_tutorials = 6;
        let completion_percentage = if total_tutorials > 0 {
            (completed_tutorials.len() as f64 / total_tutorials as f64) * 100.0
        } else {
            0.0
        };

        Ok(UserTutorialProgress {
            user_id: user_id.to_string(),
            completed_tutorials,
            in_progress_tutorials,
            total_tutorials,
            completion_percentage,
            earned_rewards,
        })
    }

    pub fn get_tutorial_stats(&self, tutorial_id: &str) -> Result<TutorialStats, ProgressError> {
        let conn = self.db.lock().unwrap();

        let total_starts: u32 = conn
            .query_row(
                "SELECT COUNT(*) FROM tutorial_progress WHERE tutorial_id = ?1",
                [tutorial_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let total_completions: u32 = conn
            .query_row(
                "SELECT COUNT(*) FROM tutorial_progress WHERE tutorial_id = ?1 AND completed_at IS NOT NULL",
                [tutorial_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let completion_rate = if total_starts > 0 {
            total_completions as f64 / total_starts as f64
        } else {
            0.0
        };

        let average_completion_time: f64 = conn
            .query_row(
                "SELECT AVG(completed_at - started_at) FROM tutorial_progress
                 WHERE tutorial_id = ?1 AND completed_at IS NOT NULL",
                [tutorial_id],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        let average_steps: f64 = conn
            .query_row(
                "SELECT AVG(current_step) FROM tutorial_progress WHERE tutorial_id = ?1",
                [tutorial_id],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        Ok(TutorialStats {
            tutorial_id: tutorial_id.to_string(),
            total_starts,
            total_completions,
            average_completion_time_seconds: average_completion_time,
            completion_rate,
            average_steps_completed: average_steps,
            most_common_drop_off_step: None,
        })
    }

    pub fn record_step_view(
        &self,
        user_id: &str,
        tutorial_id: &str,
        step_id: &str,
    ) -> Result<(), ProgressError> {
        let conn = self.db.lock().unwrap();
        let now = Utc::now().timestamp();

        conn.execute(
            "INSERT INTO tutorial_step_views (user_id, tutorial_id, step_id, viewed_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![user_id, tutorial_id, step_id, now],
        )
        .ok();

        Ok(())
    }
}
