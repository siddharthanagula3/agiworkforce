use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;

use crate::commands::AppDatabase;
use crate::onboarding::{
    OnboardingProgress, ProgressTracker, Reward, RewardSystem, SampleDataGenerator,
    SampleDataSummary, Tutorial, TutorialManager, TutorialStats, UserTutorialProgress,
};

// State wrapper for tutorial system
pub struct TutorialState {
    pub manager: Arc<Mutex<TutorialManager>>,
    pub progress: Arc<Mutex<ProgressTracker>>,
    pub rewards: Arc<Mutex<RewardSystem>>,
    pub sample_data: Arc<Mutex<SampleDataGenerator>>,
}

impl TutorialState {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self {
            manager: Arc::new(Mutex::new(TutorialManager::new(db.clone()))),
            progress: Arc::new(Mutex::new(ProgressTracker::new(db.clone()))),
            rewards: Arc::new(Mutex::new(RewardSystem::new(db.clone()))),
            sample_data: Arc::new(Mutex::new(SampleDataGenerator::new(db))),
        }
    }
}

/// Get all available tutorials
#[tauri::command]
pub async fn get_tutorials(db: State<'_, AppDatabase>) -> Result<Vec<Tutorial>, String> {
    let manager = TutorialManager::new(db.0.clone());
    Ok(manager.get_tutorials())
}

/// Get a specific tutorial by ID
#[tauri::command]
pub async fn get_tutorial(
    db: State<'_, AppDatabase>,
    tutorial_id: String,
) -> Result<Tutorial, String> {
    let manager = TutorialManager::new(db.0.clone());
    manager
        .get_tutorial(&tutorial_id)
        .map_err(|e| e.to_string())
}

/// Get recommended next tutorial for user
#[tauri::command]
pub async fn get_recommended_tutorial(
    db: State<'_, AppDatabase>,
    user_id: String,
) -> Result<Option<Tutorial>, String> {
    let manager = TutorialManager::new(db.0.clone());
    Ok(manager.get_recommended_tutorial(&user_id))
}

/// Start a tutorial
#[tauri::command]
pub async fn start_tutorial(
    db: State<'_, AppDatabase>,
    user_id: String,
    tutorial_id: String,
) -> Result<OnboardingProgress, String> {
    let tracker = ProgressTracker::new(db.0.clone());
    tracker
        .start_tutorial(&user_id, &tutorial_id)
        .map_err(|e| e.to_string())
}

/// Complete a tutorial step
#[tauri::command]
pub async fn complete_tutorial_step(
    db: State<'_, AppDatabase>,
    user_id: String,
    tutorial_id: String,
    step_id: String,
) -> Result<OnboardingProgress, String> {
    let tracker = ProgressTracker::new(db.0.clone());
    tracker
        .complete_step(&user_id, &tutorial_id, &step_id)
        .map_err(|e| e.to_string())
}

/// Skip a tutorial step
#[tauri::command]
pub async fn skip_tutorial_step(
    db: State<'_, AppDatabase>,
    user_id: String,
    tutorial_id: String,
    step_id: String,
) -> Result<OnboardingProgress, String> {
    let tracker = ProgressTracker::new(db.0.clone());
    tracker
        .skip_step(&user_id, &tutorial_id, &step_id)
        .map_err(|e| e.to_string())
}

/// Complete entire tutorial (triggers rewards)
#[tauri::command]
pub async fn complete_tutorial(
    db: State<'_, AppDatabase>,
    user_id: String,
    tutorial_id: String,
) -> Result<Vec<Reward>, String> {
    let tracker = ProgressTracker::new(db.0.clone());
    let rewards_system = RewardSystem::new(db.0.clone());

    tracker
        .complete_tutorial(&user_id, &tutorial_id)
        .map_err(|e| e.to_string())?;

    let rewards = rewards_system.grant_completion_reward(&user_id, &tutorial_id);
    Ok(rewards)
}

/// Reset tutorial progress
#[tauri::command]
pub async fn reset_tutorial(
    db: State<'_, AppDatabase>,
    user_id: String,
    tutorial_id: String,
) -> Result<(), String> {
    let tracker = ProgressTracker::new(db.0.clone());
    tracker
        .reset_tutorial(&user_id, &tutorial_id)
        .map_err(|e| e.to_string())
}

/// Get tutorial progress for user
#[tauri::command]
pub async fn get_tutorial_progress(
    db: State<'_, AppDatabase>,
    user_id: String,
    tutorial_id: String,
) -> Result<OnboardingProgress, String> {
    let tracker = ProgressTracker::new(db.0.clone());
    tracker
        .get_progress(&user_id, &tutorial_id)
        .map_err(|e| e.to_string())
}

/// Get all tutorial progress for user
#[tauri::command]
pub async fn get_user_tutorial_progress(
    db: State<'_, AppDatabase>,
    user_id: String,
) -> Result<UserTutorialProgress, String> {
    let tracker = ProgressTracker::new(db.0.clone());
    tracker
        .get_user_progress(&user_id)
        .map_err(|e| e.to_string())
}

/// Get tutorial statistics (for analytics)
#[tauri::command]
pub async fn get_tutorial_stats(
    db: State<'_, AppDatabase>,
    tutorial_id: String,
) -> Result<TutorialStats, String> {
    let tracker = ProgressTracker::new(db.0.clone());
    tracker
        .get_tutorial_stats(&tutorial_id)
        .map_err(|e| e.to_string())
}

/// Record step view (for analytics)
#[tauri::command]
pub async fn record_step_view(
    db: State<'_, AppDatabase>,
    user_id: String,
    tutorial_id: String,
    step_id: String,
) -> Result<(), String> {
    let tracker = ProgressTracker::new(db.0.clone());
    tracker
        .record_step_view(&user_id, &tutorial_id, &step_id)
        .map_err(|e| e.to_string())
}

/// Get user rewards
#[tauri::command]
pub async fn get_user_rewards(
    db: State<'_, AppDatabase>,
    user_id: String,
) -> Result<Vec<Reward>, String> {
    let rewards_system = RewardSystem::new(db.0.clone());
    Ok(rewards_system.get_user_rewards(&user_id))
}

/// Check if user has a specific reward
#[tauri::command]
pub async fn has_reward(
    db: State<'_, AppDatabase>,
    user_id: String,
    reward_id: String,
) -> Result<bool, String> {
    let rewards_system = RewardSystem::new(db.0.clone());
    Ok(rewards_system.has_reward(&user_id, &reward_id))
}

/// Check if user has unlocked a feature
#[tauri::command]
pub async fn has_unlocked_feature(
    db: State<'_, AppDatabase>,
    user_id: String,
    feature_id: String,
) -> Result<bool, String> {
    let rewards_system = RewardSystem::new(db.0.clone());
    Ok(rewards_system.has_unlocked_feature(&user_id, &feature_id))
}

/// Get user's total credits
#[tauri::command]
pub async fn get_user_credits(db: State<'_, AppDatabase>, user_id: String) -> Result<i32, String> {
    let rewards_system = RewardSystem::new(db.0.clone());
    Ok(rewards_system.get_user_credits(&user_id))
}

/// Populate sample data for tutorials
#[tauri::command]
pub async fn populate_sample_data(
    db: State<'_, AppDatabase>,
    user_id: String,
) -> Result<SampleDataSummary, String> {
    let generator = SampleDataGenerator::new(db.0.clone());
    generator
        .populate_sample_data(&user_id)
        .map_err(|e| e.to_string())
}

/// Check if user has sample data
#[tauri::command]
pub async fn has_sample_data(db: State<'_, AppDatabase>, user_id: String) -> Result<bool, String> {
    let generator = SampleDataGenerator::new(db.0.clone());
    Ok(generator.has_sample_data(&user_id))
}

/// Clear sample data for user
#[tauri::command]
pub async fn clear_sample_data(db: State<'_, AppDatabase>, user_id: String) -> Result<(), String> {
    let generator = SampleDataGenerator::new(db.0.clone());
    generator
        .clear_sample_data(&user_id)
        .map_err(|e| e.to_string())
}

/// Submit tutorial feedback
#[tauri::command]
pub async fn submit_tutorial_feedback(
    db: State<'_, AppDatabase>,
    user_id: String,
    tutorial_id: String,
    rating: i32,
    feedback_text: Option<String>,
    helpful: bool,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp();
    let feedback_id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO tutorial_feedback (id, user_id, tutorial_id, rating, feedback_text, helpful, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            feedback_id,
            user_id,
            tutorial_id,
            rating,
            feedback_text,
            if helpful { 1 } else { 0 },
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
