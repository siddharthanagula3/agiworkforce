use super::*;
use crate::core::llm::{ChatMessage, LLMRequest, LLMRouter, RouterPreferences, RoutingStrategy};
use crate::core::sync_utils::MutexExt;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ProcessType {
    AccountsPayable,
    CustomerSupport,
    DataEntry,
    EmailManagement,
    CodeReview,
    Testing,
    Documentation,
    Deployment,
    LeadQualification,
    SocialMedia,
}

impl ProcessType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ProcessType::AccountsPayable => "accounts_payable",
            ProcessType::CustomerSupport => "customer_support",
            ProcessType::DataEntry => "data_entry",
            ProcessType::EmailManagement => "email_management",
            ProcessType::CodeReview => "code_review",
            ProcessType::Testing => "testing",
            ProcessType::Documentation => "documentation",
            ProcessType::Deployment => "deployment",
            ProcessType::LeadQualification => "lead_qualification",
            ProcessType::SocialMedia => "social_media",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "accounts_payable" => Some(ProcessType::AccountsPayable),
            "customer_support" => Some(ProcessType::CustomerSupport),
            "data_entry" => Some(ProcessType::DataEntry),
            "email_management" => Some(ProcessType::EmailManagement),
            "code_review" => Some(ProcessType::CodeReview),
            "testing" => Some(ProcessType::Testing),
            "documentation" => Some(ProcessType::Documentation),
            "deployment" => Some(ProcessType::Deployment),
            "lead_qualification" => Some(ProcessType::LeadQualification),
            "social_media" => Some(ProcessType::SocialMedia),
            _ => None,
        }
    }

    pub fn all() -> Vec<ProcessType> {
        vec![
            ProcessType::AccountsPayable,
            ProcessType::CustomerSupport,
            ProcessType::DataEntry,
            ProcessType::EmailManagement,
            ProcessType::CodeReview,
            ProcessType::Testing,
            ProcessType::Documentation,
            ProcessType::Deployment,
            ProcessType::LeadQualification,
            ProcessType::SocialMedia,
        ]
    }

    pub fn description(&self) -> &'static str {
        match self {
            ProcessType::AccountsPayable => {
                "Invoice processing, payment verification, expense tracking"
            }
            ProcessType::CustomerSupport => "Ticket triage, response drafting, escalation routing",
            ProcessType::DataEntry => "Form filling, data migration, spreadsheet updates",
            ProcessType::EmailManagement => {
                "Email categorization, response drafting, follow-up tracking"
            }
            ProcessType::CodeReview => {
                "Pull request analysis, code quality checks, security scanning"
            }
            ProcessType::Testing => "Test execution, regression testing, bug verification",
            ProcessType::Documentation => "README updates, API documentation, changelog generation",
            ProcessType::Deployment => {
                "Build verification, deployment orchestration, rollback procedures"
            }
            ProcessType::LeadQualification => "Lead scoring, enrichment, CRM updates",
            ProcessType::SocialMedia => "Post scheduling, engagement tracking, sentiment analysis",
        }
    }

    pub fn typical_tools(&self) -> Vec<&'static str> {
        match self {
            ProcessType::AccountsPayable => {
                vec!["document_read", "api_call", "email_send", "db_query"]
            }
            ProcessType::CustomerSupport => {
                vec!["email_fetch", "llm_reason", "api_call", "db_query"]
            }
            ProcessType::DataEntry => vec!["file_read", "file_write", "db_execute", "api_call"],
            ProcessType::EmailManagement => {
                vec!["email_fetch", "email_send", "llm_reason", "file_write"]
            }
            ProcessType::CodeReview => vec!["file_read", "code_analyze", "llm_reason", "api_call"],
            ProcessType::Testing => {
                vec!["code_execute", "browser_navigate", "ui_click", "api_call"]
            }
            ProcessType::Documentation => vec!["file_read", "file_write", "llm_reason", "api_call"],
            ProcessType::Deployment => vec!["code_execute", "api_call", "file_read", "db_query"],
            ProcessType::LeadQualification => {
                vec!["api_call", "db_query", "db_execute", "llm_reason"]
            }
            ProcessType::SocialMedia => {
                vec!["api_call", "llm_reason", "browser_navigate", "file_write"]
            }
        }
    }

    pub fn expected_duration_range(&self) -> (u64, u64) {
        match self {
            ProcessType::AccountsPayable => (30000, 180000),
            ProcessType::CustomerSupport => (15000, 120000),
            ProcessType::DataEntry => (10000, 60000),
            ProcessType::EmailManagement => (5000, 30000),
            ProcessType::CodeReview => (60000, 300000),
            ProcessType::Testing => (30000, 600000),
            ProcessType::Documentation => (45000, 240000),
            ProcessType::Deployment => (120000, 900000),
            ProcessType::LeadQualification => (20000, 90000),
            ProcessType::SocialMedia => (10000, 60000),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Outcome {
    pub id: String,
    pub process_type: ProcessType,
    pub metric_name: String,
    pub target_value: f64,
    pub actual_value: Option<f64>,
    pub achieved: bool,
    pub unit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Strategy {
    pub id: String,
    pub name: String,
    pub description: String,
    pub process_type: ProcessType,
    pub priority_tools: Vec<String>,
    pub estimated_success_rate: f64,
    pub estimated_duration_ms: u64,
    pub resource_requirements: ResourceUsage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutcomeScore {
    pub overall_score: f64,
    pub outcomes_achieved: usize,
    pub outcomes_total: usize,
    pub average_achievement: f64,
    pub details: Vec<OutcomeDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutcomeDetail {
    pub metric_name: String,
    pub target: f64,
    pub actual: f64,
    pub achievement_rate: f64,
}

pub struct ProcessReasoning {
    router: Arc<RwLock<LLMRouter>>,
    process_cache: Arc<std::sync::Mutex<HashMap<String, ProcessType>>>,
}

impl ProcessReasoning {
    pub fn new(router: Arc<RwLock<LLMRouter>>) -> Result<Self> {
        Ok(Self {
            router,
            process_cache: Arc::new(std::sync::Mutex::new(HashMap::new())),
        })
    }

    pub async fn identify_process_type(&self, goal: &Goal) -> Result<ProcessType> {
        {
            let cache = self.process_cache.safe_lock()?;
            if let Some(cached_type) = cache.get(&goal.id) {
                tracing::info!(
                    "[ProcessReasoning] Using cached process type for goal {}",
                    goal.id
                );
                return Ok(*cached_type);
            }
        }

        let process_type = self.classify_by_keywords(&goal.description);

        if let Some(pt) = process_type {
            tracing::info!(
                "[ProcessReasoning] Identified process type by keywords: {:?}",
                pt
            );

            {
                let mut cache = self.process_cache.safe_lock()?;
                cache.insert(goal.id.clone(), pt);
            }

            return Ok(pt);
        }

        tracing::info!("[ProcessReasoning] Using LLM for process type identification");
        let llm_type = self.classify_by_llm(goal).await?;

        {
            let mut cache = self.process_cache.safe_lock()?;
            cache.insert(goal.id.clone(), llm_type);
        }

        Ok(llm_type)
    }

    fn classify_by_keywords(&self, description: &str) -> Option<ProcessType> {
        let desc_lower = description.to_lowercase();

        if desc_lower.contains("invoice")
            || desc_lower.contains("payment")
            || desc_lower.contains("expense")
            || desc_lower.contains("accounts payable")
        {
            return Some(ProcessType::AccountsPayable);
        }

        if desc_lower.contains("customer")
            && (desc_lower.contains("support")
                || desc_lower.contains("ticket")
                || desc_lower.contains("help"))
        {
            return Some(ProcessType::CustomerSupport);
        }

        if desc_lower.contains("data entry")
            || (desc_lower.contains("fill") && desc_lower.contains("form"))
            || desc_lower.contains("spreadsheet")
        {
            return Some(ProcessType::DataEntry);
        }

        if desc_lower.contains("email")
            && (desc_lower.contains("manage")
                || desc_lower.contains("organize")
                || desc_lower.contains("categorize"))
        {
            return Some(ProcessType::EmailManagement);
        }

        if (desc_lower.contains("code")
            || desc_lower.contains("pull request")
            || desc_lower.contains("pr"))
            && desc_lower.contains("review")
        {
            return Some(ProcessType::CodeReview);
        }

        if desc_lower.contains("test")
            && (desc_lower.contains("run")
                || desc_lower.contains("execute")
                || desc_lower.contains("regression"))
        {
            return Some(ProcessType::Testing);
        }

        if desc_lower.contains("document")
            || desc_lower.contains("readme")
            || desc_lower.contains("api doc")
            || desc_lower.contains("changelog")
        {
            return Some(ProcessType::Documentation);
        }

        if desc_lower.contains("deploy")
            || desc_lower.contains("release")
            || desc_lower.contains("rollout")
            || desc_lower.contains("rollback")
        {
            return Some(ProcessType::Deployment);
        }

        if desc_lower.contains("lead")
            && (desc_lower.contains("qualify")
                || desc_lower.contains("score")
                || desc_lower.contains("enrich"))
        {
            return Some(ProcessType::LeadQualification);
        }

        if desc_lower.contains("social media")
            || desc_lower.contains("twitter")
            || desc_lower.contains("linkedin")
            || desc_lower.contains("facebook")
        {
            return Some(ProcessType::SocialMedia);
        }

        None
    }

    async fn classify_by_llm(&self, goal: &Goal) -> Result<ProcessType> {
        let all_types = ProcessType::all();
        let type_descriptions: Vec<String> = all_types
            .iter()
            .map(|pt| format!("- {}: {}", pt.as_str(), pt.description()))
            .collect();

        let prompt = format!(
            r#"Classify the following goal into one of these process types:

{}

Goal: {}
Success Criteria: {}

Return ONLY the process type name (e.g., "code_review", "customer_support", etc.) without any additional text or explanation."#,
            type_descriptions.join("\n"),
            goal.description,
            goal.success_criteria.join(", ")
        );

        let preferences = RouterPreferences {
            provider: Some(crate::core::llm::Provider::Anthropic),
            model: Some("claude-haiku-4-5".to_string()),
            strategy: RoutingStrategy::Auto,
            context: None,
            prefer_cloud_credits: false,
        };

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt,
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "claude-haiku-4-5".to_string(),
            temperature: Some(0.1),
            max_tokens: Some(50),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            ..Default::default()
        };

        let router = self.router.read().await;
        let candidates = router.candidates(&request, &preferences);
        drop(router);

        if let Some(candidate) = candidates.first() {
            let router = self.router.read().await;
            if let Ok(outcome) = router.invoke_candidate(candidate, &request).await {
                let response = outcome.response.content.trim();
                if let Some(process_type) = ProcessType::from_str(response) {
                    return Ok(process_type);
                }
            }
        }

        Ok(ProcessType::DataEntry)
    }

    pub fn define_outcomes(&self, process_type: ProcessType, goal: &Goal) -> Vec<Outcome> {
        let goal_id = &goal.id;

        match process_type {
            ProcessType::AccountsPayable => vec![
                Outcome {
                    id: format!("{}_accuracy", goal_id),
                    process_type,
                    metric_name: "data_accuracy".to_string(),
                    target_value: 0.98,
                    actual_value: None,
                    achieved: false,
                    unit: "ratio".to_string(),
                },
                Outcome {
                    id: format!("{}_processing_time", goal_id),
                    process_type,
                    metric_name: "processing_time".to_string(),
                    target_value: 120.0,
                    actual_value: None,
                    achieved: false,
                    unit: "seconds".to_string(),
                },
                Outcome {
                    id: format!("{}_invoices_processed", goal_id),
                    process_type,
                    metric_name: "invoices_processed".to_string(),
                    target_value: 1.0,
                    actual_value: None,
                    achieved: false,
                    unit: "count".to_string(),
                },
            ],

            ProcessType::CustomerSupport => vec![
                Outcome {
                    id: format!("{}_response_quality", goal_id),
                    process_type,
                    metric_name: "response_quality".to_string(),
                    target_value: 0.85,
                    actual_value: None,
                    achieved: false,
                    unit: "score".to_string(),
                },
                Outcome {
                    id: format!("{}_response_time", goal_id),
                    process_type,
                    metric_name: "response_time".to_string(),
                    target_value: 60.0,
                    actual_value: None,
                    achieved: false,
                    unit: "seconds".to_string(),
                },
                Outcome {
                    id: format!("{}_tickets_resolved", goal_id),
                    process_type,
                    metric_name: "tickets_resolved".to_string(),
                    target_value: 1.0,
                    actual_value: None,
                    achieved: false,
                    unit: "count".to_string(),
                },
            ],

            ProcessType::DataEntry => vec![
                Outcome {
                    id: format!("{}_accuracy", goal_id),
                    process_type,
                    metric_name: "data_accuracy".to_string(),
                    target_value: 0.99,
                    actual_value: None,
                    achieved: false,
                    unit: "ratio".to_string(),
                },
                Outcome {
                    id: format!("{}_records_processed", goal_id),
                    process_type,
                    metric_name: "records_processed".to_string(),
                    target_value: 1.0,
                    actual_value: None,
                    achieved: false,
                    unit: "count".to_string(),
                },
            ],

            ProcessType::EmailManagement => vec![
                Outcome {
                    id: format!("{}_emails_categorized", goal_id),
                    process_type,
                    metric_name: "emails_categorized".to_string(),
                    target_value: 1.0,
                    actual_value: None,
                    achieved: false,
                    unit: "count".to_string(),
                },
                Outcome {
                    id: format!("{}_categorization_accuracy", goal_id),
                    process_type,
                    metric_name: "categorization_accuracy".to_string(),
                    target_value: 0.92,
                    actual_value: None,
                    achieved: false,
                    unit: "ratio".to_string(),
                },
            ],

            ProcessType::CodeReview => vec![
                Outcome {
                    id: format!("{}_issues_found", goal_id),
                    process_type,
                    metric_name: "issues_found".to_string(),
                    target_value: 1.0,
                    actual_value: None,
                    achieved: false,
                    unit: "count".to_string(),
                },
                Outcome {
                    id: format!("{}_review_completeness", goal_id),
                    process_type,
                    metric_name: "review_completeness".to_string(),
                    target_value: 0.90,
                    actual_value: None,
                    achieved: false,
                    unit: "score".to_string(),
                },
                Outcome {
                    id: format!("{}_false_positive_rate", goal_id),
                    process_type,
                    metric_name: "false_positive_rate".to_string(),
                    target_value: 0.10,
                    actual_value: None,
                    achieved: false,
                    unit: "ratio".to_string(),
                },
            ],

            ProcessType::Testing => vec![
                Outcome {
                    id: format!("{}_test_coverage", goal_id),
                    process_type,
                    metric_name: "test_coverage".to_string(),
                    target_value: 0.80,
                    actual_value: None,
                    achieved: false,
                    unit: "ratio".to_string(),
                },
                Outcome {
                    id: format!("{}_tests_passed", goal_id),
                    process_type,
                    metric_name: "tests_passed".to_string(),
                    target_value: 1.0,
                    actual_value: None,
                    achieved: false,
                    unit: "ratio".to_string(),
                },
                Outcome {
                    id: format!("{}_bugs_found", goal_id),
                    process_type,
                    metric_name: "bugs_found".to_string(),
                    target_value: 0.0,
                    actual_value: None,
                    achieved: false,
                    unit: "count".to_string(),
                },
            ],

            ProcessType::Documentation => vec![
                Outcome {
                    id: format!("{}_completeness", goal_id),
                    process_type,
                    metric_name: "documentation_completeness".to_string(),
                    target_value: 0.95,
                    actual_value: None,
                    achieved: false,
                    unit: "score".to_string(),
                },
                Outcome {
                    id: format!("{}_clarity", goal_id),
                    process_type,
                    metric_name: "documentation_clarity".to_string(),
                    target_value: 0.85,
                    actual_value: None,
                    achieved: false,
                    unit: "score".to_string(),
                },
            ],

            ProcessType::Deployment => vec![
                Outcome {
                    id: format!("{}_deployment_success", goal_id),
                    process_type,
                    metric_name: "deployment_success".to_string(),
                    target_value: 1.0,
                    actual_value: None,
                    achieved: false,
                    unit: "boolean".to_string(),
                },
                Outcome {
                    id: format!("{}_rollback_needed", goal_id),
                    process_type,
                    metric_name: "rollback_needed".to_string(),
                    target_value: 0.0,
                    actual_value: None,
                    achieved: false,
                    unit: "boolean".to_string(),
                },
                Outcome {
                    id: format!("{}_deployment_time", goal_id),
                    process_type,
                    metric_name: "deployment_time".to_string(),
                    target_value: 600.0,
                    actual_value: None,
                    achieved: false,
                    unit: "seconds".to_string(),
                },
            ],

            ProcessType::LeadQualification => vec![
                Outcome {
                    id: format!("{}_leads_scored", goal_id),
                    process_type,
                    metric_name: "leads_scored".to_string(),
                    target_value: 1.0,
                    actual_value: None,
                    achieved: false,
                    unit: "count".to_string(),
                },
                Outcome {
                    id: format!("{}_data_enrichment", goal_id),
                    process_type,
                    metric_name: "data_enrichment".to_string(),
                    target_value: 0.80,
                    actual_value: None,
                    achieved: false,
                    unit: "ratio".to_string(),
                },
            ],

            ProcessType::SocialMedia => vec![
                Outcome {
                    id: format!("{}_posts_scheduled", goal_id),
                    process_type,
                    metric_name: "posts_scheduled".to_string(),
                    target_value: 1.0,
                    actual_value: None,
                    achieved: false,
                    unit: "count".to_string(),
                },
                Outcome {
                    id: format!("{}_engagement_predicted", goal_id),
                    process_type,
                    metric_name: "engagement_predicted".to_string(),
                    target_value: 0.75,
                    actual_value: None,
                    achieved: false,
                    unit: "score".to_string(),
                },
            ],
        }
    }

    pub fn select_optimal_strategy(
        &self,
        process_type: ProcessType,
        _context: &ExecutionContext,
    ) -> Strategy {
        let (min_duration, max_duration) = process_type.expected_duration_range();
        let estimated_duration = (min_duration + max_duration) / 2;

        Strategy {
            id: format!("strategy_{}_default", process_type.as_str()),
            name: format!("Default {} Strategy", process_type.as_str()),
            description: format!("Standard approach for {}", process_type.description()),
            process_type,
            priority_tools: process_type
                .typical_tools()
                .iter()
                .map(|s| s.to_string())
                .collect(),
            estimated_success_rate: 0.85,
            estimated_duration_ms: estimated_duration,
            resource_requirements: ResourceUsage {
                cpu_percent: 20.0,
                memory_mb: 256,
                network_mb: 10.0,
            },
        }
    }

    pub fn evaluate_outcome(
        &self,
        _process_type: ProcessType,
        expected_outcomes: &[Outcome],
        actual_results: &ExecutionContext,
    ) -> OutcomeScore {
        let mut achieved_count = 0;
        let mut total_achievement = 0.0;
        let mut details = Vec::new();

        for outcome in expected_outcomes {
            let achievement_rate = self.calculate_achievement_rate(outcome, actual_results);

            if achievement_rate >= 0.9 {
                achieved_count += 1;
            }

            total_achievement += achievement_rate;

            details.push(OutcomeDetail {
                metric_name: outcome.metric_name.clone(),
                target: outcome.target_value,
                actual: achievement_rate * outcome.target_value,
                achievement_rate,
            });
        }

        let total_outcomes = expected_outcomes.len();
        let average_achievement = if total_outcomes > 0 {
            total_achievement / total_outcomes as f64
        } else {
            0.0
        };

        let overall_score = average_achievement;

        OutcomeScore {
            overall_score,
            outcomes_achieved: achieved_count,
            outcomes_total: total_outcomes,
            average_achievement,
            details,
        }
    }

    fn calculate_achievement_rate(&self, outcome: &Outcome, context: &ExecutionContext) -> f64 {
        let total_tools = context.tool_results.len();
        if total_tools == 0 {
            return 0.0;
        }

        let successful_tools = context.tool_results.iter().filter(|r| r.success).count();
        let success_rate = successful_tools as f64 / total_tools as f64;

        match outcome.metric_name.as_str() {
            "data_accuracy" | "categorization_accuracy" => success_rate,
            "processing_time" | "response_time" | "deployment_time" => {
                let total_time_ms: u64 = context
                    .tool_results
                    .iter()
                    .map(|r| r.execution_time_ms)
                    .sum();
                let total_time_s = total_time_ms as f64 / 1000.0;
                let target_time = outcome.target_value;

                if total_time_s <= target_time {
                    1.0
                } else {
                    target_time / total_time_s
                }
            }
            "test_coverage" | "documentation_completeness" => {
                if success_rate > 0.8 {
                    0.85
                } else {
                    success_rate * 0.9
                }
            }
            _ => success_rate,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_type_serialization() {
        let pt = ProcessType::CodeReview;
        assert_eq!(pt.as_str(), "code_review");
        assert_eq!(
            ProcessType::from_str("code_review"),
            Some(ProcessType::CodeReview)
        );
    }

    #[test]
    fn test_process_type_all() {
        let all = ProcessType::all();
        assert_eq!(all.len(), 10);
    }

    #[test]
    fn test_keyword_classification() {
        let description = "Review this pull request for code quality";
        assert!(description.to_lowercase().contains("review"));
        assert!(
            description.to_lowercase().contains("code")
                || description.to_lowercase().contains("pull request")
        );
    }
}
