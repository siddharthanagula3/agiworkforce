pub mod models {
    use serde::Deserialize;
    use serde::Serialize;
    use std::collections::HashMap;

    #[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
    pub struct ConfigFileResponse {
        #[serde(rename = "contents", skip_serializing_if = "Option::is_none")]
        pub contents: Option<String>,
        #[serde(rename = "sha256", skip_serializing_if = "Option::is_none")]
        pub sha256: Option<String>,
        #[serde(rename = "updated_at", skip_serializing_if = "Option::is_none")]
        pub updated_at: Option<String>,
        #[serde(rename = "updated_by_user_id", skip_serializing_if = "Option::is_none")]
        pub updated_by_user_id: Option<String>,
    }

    impl ConfigFileResponse {
        pub fn new(
            contents: Option<String>,
            sha256: Option<String>,
            updated_at: Option<String>,
            updated_by_user_id: Option<String>,
        ) -> ConfigFileResponse {
            ConfigFileResponse {
                contents,
                sha256,
                updated_at,
                updated_by_user_id,
            }
        }
    }

    #[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
    pub struct TaskListItem {
        #[serde(rename = "id")]
        pub id: String,
        #[serde(rename = "title")]
        pub title: String,
        #[serde(
            rename = "has_generated_title",
            skip_serializing_if = "Option::is_none"
        )]
        pub has_generated_title: Option<bool>,
        #[serde(rename = "updated_at", skip_serializing_if = "Option::is_none")]
        pub updated_at: Option<f64>,
        #[serde(rename = "created_at", skip_serializing_if = "Option::is_none")]
        pub created_at: Option<f64>,
        #[serde(
            rename = "task_status_display",
            skip_serializing_if = "Option::is_none"
        )]
        pub task_status_display: Option<HashMap<String, serde_json::Value>>,
        #[serde(rename = "archived")]
        pub archived: bool,
        #[serde(rename = "has_unread_turn")]
        pub has_unread_turn: bool,
        #[serde(rename = "pull_requests", skip_serializing_if = "Option::is_none")]
        pub pull_requests: Option<Vec<serde_json::Value>>,
    }

    impl TaskListItem {
        pub fn new(
            id: String,
            title: String,
            has_generated_title: Option<bool>,
            archived: bool,
            has_unread_turn: bool,
        ) -> TaskListItem {
            TaskListItem {
                id,
                title,
                has_generated_title,
                updated_at: None,
                created_at: None,
                task_status_display: None,
                archived,
                has_unread_turn,
                pull_requests: None,
            }
        }
    }

    #[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
    pub struct PaginatedListTaskListItem {
        #[serde(rename = "items")]
        pub items: Vec<TaskListItem>,
        #[serde(rename = "cursor", skip_serializing_if = "Option::is_none")]
        pub cursor: Option<String>,
    }

    impl PaginatedListTaskListItem {
        pub fn new(items: Vec<TaskListItem>) -> PaginatedListTaskListItem {
            PaginatedListTaskListItem {
                items,
                cursor: None,
            }
        }
    }

    #[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
    pub struct AdditionalRateLimitDetails {
        #[serde(rename = "limit_name")]
        pub limit_name: String,
        #[serde(rename = "metered_feature")]
        pub metered_feature: String,
        #[serde(
            rename = "rate_limit",
            default,
            skip_serializing_if = "Option::is_none"
        )]
        pub rate_limit: Option<Option<Box<RateLimitStatusDetails>>>,
    }

    impl AdditionalRateLimitDetails {
        pub fn new(limit_name: String, metered_feature: String) -> AdditionalRateLimitDetails {
            AdditionalRateLimitDetails {
                limit_name,
                metered_feature,
                rate_limit: None,
            }
        }
    }

    #[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
    pub struct CreditStatusDetails {
        #[serde(rename = "has_credits")]
        pub has_credits: bool,
        #[serde(rename = "unlimited")]
        pub unlimited: bool,
        #[serde(rename = "balance", default, skip_serializing_if = "Option::is_none")]
        pub balance: Option<Option<String>>,
        #[serde(
            rename = "approx_local_messages",
            default,
            skip_serializing_if = "Option::is_none"
        )]
        pub approx_local_messages: Option<Option<Vec<serde_json::Value>>>,
        #[serde(
            rename = "approx_cloud_messages",
            default,
            skip_serializing_if = "Option::is_none"
        )]
        pub approx_cloud_messages: Option<Option<Vec<serde_json::Value>>>,
    }

    impl CreditStatusDetails {
        pub fn new(has_credits: bool, unlimited: bool) -> CreditStatusDetails {
            CreditStatusDetails {
                has_credits,
                unlimited,
                balance: None,
                approx_local_messages: None,
                approx_cloud_messages: None,
            }
        }
    }

    #[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
    pub struct RateLimitWindowSnapshot {
        #[serde(rename = "used_percent")]
        pub used_percent: i32,
        #[serde(rename = "limit_window_seconds")]
        pub limit_window_seconds: i32,
        #[serde(rename = "reset_after_seconds")]
        pub reset_after_seconds: i32,
        #[serde(rename = "reset_at")]
        pub reset_at: i32,
    }

    impl RateLimitWindowSnapshot {
        pub fn new(
            used_percent: i32,
            limit_window_seconds: i32,
            reset_after_seconds: i32,
            reset_at: i32,
        ) -> RateLimitWindowSnapshot {
            RateLimitWindowSnapshot {
                used_percent,
                limit_window_seconds,
                reset_after_seconds,
                reset_at,
            }
        }
    }

    #[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
    pub struct RateLimitStatusDetails {
        #[serde(rename = "allowed")]
        pub allowed: bool,
        #[serde(rename = "limit_reached")]
        pub limit_reached: bool,
        #[serde(
            rename = "primary_window",
            default,
            skip_serializing_if = "Option::is_none"
        )]
        pub primary_window: Option<Option<Box<RateLimitWindowSnapshot>>>,
        #[serde(
            rename = "secondary_window",
            default,
            skip_serializing_if = "Option::is_none"
        )]
        pub secondary_window: Option<Option<Box<RateLimitWindowSnapshot>>>,
    }

    impl RateLimitStatusDetails {
        pub fn new(allowed: bool, limit_reached: bool) -> RateLimitStatusDetails {
            RateLimitStatusDetails {
                allowed,
                limit_reached,
                primary_window: None,
                secondary_window: None,
            }
        }
    }

    #[derive(
        Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Hash, Serialize, Deserialize, Default,
    )]
    pub enum PlanType {
        #[serde(rename = "guest")]
        #[default]
        Guest,
        #[serde(rename = "free")]
        Free,
        #[serde(rename = "go")]
        Go,
        #[serde(rename = "plus")]
        Plus,
        #[serde(rename = "pro")]
        Pro,
        #[serde(rename = "free_workspace")]
        FreeWorkspace,
        #[serde(rename = "team")]
        Team,
        #[serde(rename = "business")]
        Business,
        #[serde(rename = "education")]
        Education,
        #[serde(rename = "quorum")]
        Quorum,
        #[serde(rename = "k12")]
        K12,
        #[serde(rename = "enterprise")]
        Enterprise,
        #[serde(rename = "edu")]
        Edu,
    }

    #[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
    pub struct RateLimitStatusPayload {
        #[serde(rename = "plan_type")]
        pub plan_type: PlanType,
        #[serde(
            rename = "rate_limit",
            default,
            skip_serializing_if = "Option::is_none"
        )]
        pub rate_limit: Option<Option<Box<RateLimitStatusDetails>>>,
        #[serde(rename = "credits", default, skip_serializing_if = "Option::is_none")]
        pub credits: Option<Option<Box<CreditStatusDetails>>>,
        #[serde(
            rename = "additional_rate_limits",
            default,
            skip_serializing_if = "Option::is_none"
        )]
        pub additional_rate_limits: Option<Option<Vec<AdditionalRateLimitDetails>>>,
    }

    impl RateLimitStatusPayload {
        pub fn new(plan_type: PlanType) -> RateLimitStatusPayload {
            RateLimitStatusPayload {
                plan_type,
                rate_limit: None,
                credits: None,
                additional_rate_limits: None,
            }
        }
    }
}
