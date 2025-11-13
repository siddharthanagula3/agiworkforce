use serde::{Deserialize, Serialize};
use rusqlite::{Connection, params};
use std::sync::{Arc, Mutex};
use chrono::Utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reward {
    pub id: String,
    pub reward_type: RewardType,
    pub name: String,
    pub description: String,
    pub icon: String, // Icon name or emoji
    pub value: RewardValue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RewardType {
    Badge,
    UnlockedFeature,
    Credits,
    Achievement,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RewardValue {
    Badge { rarity: BadgeRarity },
    Feature { feature_id: String },
    Credits { amount: i32 },
    Points { amount: i32 },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BadgeRarity {
    Common,
    Uncommon,
    Rare,
    Epic,
    Legendary,
}

pub struct RewardSystem {
    db: Arc<Mutex<Connection>>,
    rewards: Vec<Reward>,
}

impl RewardSystem {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        let rewards = Self::create_all_rewards();
        Self { db, rewards }
    }

    /// Get reward by ID
    pub fn get_reward(&self, reward_id: &str) -> Option<&Reward> {
        self.rewards.iter().find(|r| r.id == reward_id)
    }

    /// Get all rewards
    pub fn get_all_rewards(&self) -> &[Reward] {
        &self.rewards
    }

    /// Grant reward to user
    pub fn grant_reward(&self, user_id: &str, reward_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.db.lock().unwrap();
        let now = Utc::now().timestamp();

        // Check if reward already granted
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM user_rewards WHERE user_id = ?1 AND reward_id = ?2",
                params![user_id, reward_id],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if !exists {
            conn.execute(
                "INSERT INTO user_rewards (user_id, reward_id, granted_at) VALUES (?1, ?2, ?3)",
                params![user_id, reward_id, now],
            )?;
        }

        Ok(())
    }

    /// Grant completion reward for tutorial
    pub fn grant_completion_reward(&self, user_id: &str, tutorial_id: &str) -> Vec<Reward> {
        let reward_ids = self.get_rewards_for_tutorial(tutorial_id);
        let mut granted_rewards = Vec::new();

        for reward_id in reward_ids {
            if self.grant_reward(user_id, &reward_id).is_ok() {
                if let Some(reward) = self.get_reward(&reward_id) {
                    granted_rewards.push(reward.clone());
                }
            }
        }

        granted_rewards
    }

    /// Get rewards earned by user
    pub fn get_user_rewards(&self, user_id: &str) -> Vec<Reward> {
        let conn = self.db.lock().unwrap();

        let mut stmt = conn
            .prepare("SELECT reward_id FROM user_rewards WHERE user_id = ?1")
            .ok();

        if let Some(mut stmt) = stmt {
            let reward_ids: Vec<String> = stmt
                .query_map([user_id], |row| row.get(0))
                .ok()
                .into_iter()
                .flatten()
                .filter_map(Result::ok)
                .collect();

            reward_ids
                .iter()
                .filter_map(|id| self.get_reward(id).cloned())
                .collect()
        } else {
            Vec::new()
        }
    }

    /// Check if user has earned a specific reward
    pub fn has_reward(&self, user_id: &str, reward_id: &str) -> bool {
        let conn = self.db.lock().unwrap();

        conn.query_row(
            "SELECT COUNT(*) > 0 FROM user_rewards WHERE user_id = ?1 AND reward_id = ?2",
            params![user_id, reward_id],
            |row| row.get(0),
        )
        .unwrap_or(false)
    }

    /// Check if user has unlocked a feature
    pub fn has_unlocked_feature(&self, user_id: &str, feature_id: &str) -> bool {
        let rewards = self.get_user_rewards(user_id);

        rewards.iter().any(|r| {
            matches!(&r.value, RewardValue::Feature { feature_id: fid } if fid == feature_id)
        })
    }

    /// Get total credits earned by user
    pub fn get_user_credits(&self, user_id: &str) -> i32 {
        let rewards = self.get_user_rewards(user_id);

        rewards.iter().fold(0, |acc, r| {
            if let RewardValue::Credits { amount } = r.value {
                acc + amount
            } else {
                acc
            }
        })
    }

    /// Get rewards for a specific tutorial
    fn get_rewards_for_tutorial(&self, tutorial_id: &str) -> Vec<String> {
        match tutorial_id {
            "basic_getting_started" => vec!["badge_first_automation".to_string()],
            "agent_templates" => vec!["badge_template_user".to_string(), "unlock_advanced_templates".to_string()],
            "workflow_orchestration" => vec!["badge_workflow_builder".to_string(), "unlock_parallel_execution".to_string()],
            "team_collaboration" => vec!["badge_team_leader".to_string()],
            "browser_automation" => vec!["badge_web_scraper".to_string(), "unlock_stealth_mode".to_string()],
            "database_integration" => vec!["badge_data_engineer".to_string(), "unlock_batch_queries".to_string()],
            _ => vec![],
        }
    }

    /// Create all available rewards
    fn create_all_rewards() -> Vec<Reward> {
        vec![
            // Badges
            Reward {
                id: "badge_first_automation".to_string(),
                reward_type: RewardType::Badge,
                name: "First Steps".to_string(),
                description: "Completed your first automation".to_string(),
                icon: "🎯".to_string(),
                value: RewardValue::Badge { rarity: BadgeRarity::Common },
            },
            Reward {
                id: "badge_template_user".to_string(),
                reward_type: RewardType::Badge,
                name: "Template Master".to_string(),
                description: "Installed and used an agent template".to_string(),
                icon: "📋".to_string(),
                value: RewardValue::Badge { rarity: BadgeRarity::Uncommon },
            },
            Reward {
                id: "badge_workflow_builder".to_string(),
                reward_type: RewardType::Badge,
                name: "Workflow Architect".to_string(),
                description: "Created a complex workflow with conditional logic".to_string(),
                icon: "🏗️".to_string(),
                value: RewardValue::Badge { rarity: BadgeRarity::Rare },
            },
            Reward {
                id: "badge_team_leader".to_string(),
                reward_type: RewardType::Badge,
                name: "Team Player".to_string(),
                description: "Created a team and shared workflows".to_string(),
                icon: "👥".to_string(),
                value: RewardValue::Badge { rarity: BadgeRarity::Rare },
            },
            Reward {
                id: "badge_web_scraper".to_string(),
                reward_type: RewardType::Badge,
                name: "Web Master".to_string(),
                description: "Automated browser interactions and data extraction".to_string(),
                icon: "🌐".to_string(),
                value: RewardValue::Badge { rarity: BadgeRarity::Epic },
            },
            Reward {
                id: "badge_data_engineer".to_string(),
                reward_type: RewardType::Badge,
                name: "Data Wizard".to_string(),
                description: "Integrated database operations into workflows".to_string(),
                icon: "🗄️".to_string(),
                value: RewardValue::Badge { rarity: BadgeRarity::Epic },
            },

            // Feature Unlocks
            Reward {
                id: "unlock_advanced_templates".to_string(),
                reward_type: RewardType::UnlockedFeature,
                name: "Advanced Templates".to_string(),
                description: "Unlocked access to advanced agent templates".to_string(),
                icon: "🔓".to_string(),
                value: RewardValue::Feature {
                    feature_id: "advanced_templates".to_string(),
                },
            },
            Reward {
                id: "unlock_parallel_execution".to_string(),
                reward_type: RewardType::UnlockedFeature,
                name: "Parallel Execution".to_string(),
                description: "Run multiple workflow branches simultaneously".to_string(),
                icon: "⚡".to_string(),
                value: RewardValue::Feature {
                    feature_id: "parallel_execution".to_string(),
                },
            },
            Reward {
                id: "unlock_stealth_mode".to_string(),
                reward_type: RewardType::UnlockedFeature,
                name: "Stealth Mode".to_string(),
                description: "Browser automation with anti-detection features".to_string(),
                icon: "🥷".to_string(),
                value: RewardValue::Feature {
                    feature_id: "stealth_mode".to_string(),
                },
            },
            Reward {
                id: "unlock_batch_queries".to_string(),
                reward_type: RewardType::UnlockedFeature,
                name: "Batch Queries".to_string(),
                description: "Execute multiple database queries efficiently".to_string(),
                icon: "💾".to_string(),
                value: RewardValue::Feature {
                    feature_id: "batch_queries".to_string(),
                },
            },

            // Credits
            Reward {
                id: "credits_100".to_string(),
                reward_type: RewardType::Credits,
                name: "100 Credits".to_string(),
                description: "Earned 100 credits for completing tutorials".to_string(),
                icon: "💰".to_string(),
                value: RewardValue::Credits { amount: 100 },
            },
            Reward {
                id: "credits_500".to_string(),
                reward_type: RewardType::Credits,
                name: "500 Credits".to_string(),
                description: "Earned 500 credits for advanced achievements".to_string(),
                icon: "💎".to_string(),
                value: RewardValue::Credits { amount: 500 },
            },

            // Achievements
            Reward {
                id: "achievement_speed_learner".to_string(),
                reward_type: RewardType::Achievement,
                name: "Speed Learner".to_string(),
                description: "Completed all basic tutorials in under 30 minutes".to_string(),
                icon: "⚡".to_string(),
                value: RewardValue::Points { amount: 100 },
            },
            Reward {
                id: "achievement_power_user".to_string(),
                reward_type: RewardType::Achievement,
                name: "Power User".to_string(),
                description: "Completed all available tutorials".to_string(),
                icon: "🌟".to_string(),
                value: RewardValue::Points { amount: 500 },
            },
            Reward {
                id: "achievement_early_adopter".to_string(),
                reward_type: RewardType::Achievement,
                name: "Early Adopter".to_string(),
                description: "One of the first users of AGI Workforce".to_string(),
                icon: "🚀".to_string(),
                value: RewardValue::Points { amount: 1000 },
            },
        ]
    }
}
