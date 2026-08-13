use super::*;
use crate::core::agi::knowledge::KnowledgeEntry;
use crate::core::agi::process_ontology::ProcessOntology;
use crate::core::agi::process_reasoning::ProcessReasoning;
use crate::core::llm::{
    ChatMessage, LLMRequest, LLMRouter, Provider, RouterPreferences, RoutingStrategy,
    ThinkingParameter,
};
use anyhow::Result;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

/// Plans are compact machine-readable control data, not user-facing prose. A
/// large completion allowance can leave small local models generating for
/// minutes before the first executable step exists.
const TASK_PLAN_MAX_TOKENS: u32 = 2_048;
const TASK_PLAN_TIMEOUT: Duration = Duration::from_secs(60);

fn task_plan_request(
    prompt: String,
    target_model: Option<&str>,
    temperature: Option<f32>,
) -> LLMRequest {
    LLMRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }],
        model: target_model.unwrap_or_default().to_string(),
        temperature,
        max_tokens: Some(TASK_PLAN_MAX_TOKENS),
        stream: false,
        tools: None,
        tool_choice: None,
        // Planning needs concise JSON. Explicitly disabling cross-provider
        // thinking also prevents reasoning-capable Ollama models from using
        // their provider-default thinking mode for this control request.
        thinking_mode: None,
        thinking: Some(ThinkingParameter::Enabled(false)),
        ..Default::default()
    }
}

fn reasoning_only_plan_json(goal: &Goal, tools: &[Tool]) -> Result<Option<String>> {
    let [reasoning_tool] = tools else {
        return Ok(None);
    };
    if reasoning_tool.id != "llm_reason" {
        return Ok(None);
    }

    // A single reasoning action does not need a second model call to invent a
    // plan. Building this control structure locally is both more reliable for
    // small on-device models and safer than accepting model-invented tool IDs.
    Ok(Some(serde_json::to_string(&vec![json!({
        "id": "step_1",
        "tool_id": "llm_reason",
        "description": "Reason through the requested task with the selected model",
        "parameters": {
            "prompt": goal.description.clone(),
            "temperature": 0.2,
            "max_tokens": 2_000,
            "stream": false,
        },
        "estimated_resources": reasoning_tool.estimated_resources.clone(),
        "dependencies": [],
    })])?))
}

pub struct AGIPlanner {
    router: Arc<RwLock<LLMRouter>>,
    tool_registry: Arc<ToolRegistry>,
    knowledge_base: Arc<KnowledgeBase>,
    process_reasoning: Option<Arc<ProcessReasoning>>,
    process_ontology: Option<Arc<ProcessOntology>>,
}

fn goal_routing_target(goal: &Goal) -> Result<(Option<Provider>, Option<String>)> {
    match goal.execution_target() {
        Some((model, provider)) => {
            let provider = Provider::from_string(provider)
                .ok_or_else(|| anyhow::anyhow!("Unsupported Task provider: {provider}"))?;
            Ok((Some(provider), Some(model.to_string())))
        }
        None => Ok((None, None)),
    }
}

#[derive(Debug, Clone)]
pub struct Plan {
    pub goal_id: String,
    pub steps: Vec<PlanStep>,
    pub estimated_duration: Duration,
    pub estimated_resources: ResourceUsage,
}

#[derive(Debug, Clone)]
pub struct PlanStep {
    pub id: String,
    pub tool_id: String,
    pub description: String,
    pub parameters: HashMap<String, serde_json::Value>,
    pub estimated_resources: ResourceUsage,
    pub dependencies: Vec<String>,
}

impl AGIPlanner {
    pub fn new(
        router: Arc<RwLock<LLMRouter>>,
        tool_registry: Arc<ToolRegistry>,
        knowledge_base: Arc<KnowledgeBase>,
    ) -> Result<Self> {
        Ok(Self {
            router,
            tool_registry,
            knowledge_base,
            process_reasoning: None,
            process_ontology: None,
        })
    }

    pub fn with_process_reasoning(
        router: Arc<RwLock<LLMRouter>>,
        tool_registry: Arc<ToolRegistry>,
        knowledge_base: Arc<KnowledgeBase>,
        process_reasoning: Arc<ProcessReasoning>,
        process_ontology: Arc<ProcessOntology>,
    ) -> Result<Self> {
        Ok(Self {
            router,
            tool_registry,
            knowledge_base,
            process_reasoning: Some(process_reasoning),
            process_ontology: Some(process_ontology),
        })
    }

    pub async fn create_plan(&self, goal: &Goal, context: &ExecutionContext) -> Result<Plan> {
        tracing::info!("[Planner] Creating plan for goal: {}", goal.description);

        let process_type = if let Some(ref pr) = self.process_reasoning {
            match pr.identify_process_type(goal).await {
                Ok(pt) => {
                    tracing::info!("[Planner] Identified process type: {:?}", pt);
                    Some(pt)
                }
                Err(e) => {
                    tracing::warn!("[Planner] Failed to identify process type: {}", e);
                    None
                }
            }
        } else {
            None
        };

        let best_practices =
            if let (Some(pt), Some(ref po)) = (process_type, &self.process_ontology) {
                po.get_best_practices(pt)
            } else {
                vec![]
            };

        let knowledge = self.knowledge_base.get_relevant_knowledge(goal, 10).await?;

        let suggested_tools: Vec<_> = self.tool_registry.suggest_tools(&goal.description);

        if let Some(plan_json) = reasoning_only_plan_json(goal, &suggested_tools)? {
            return self.parse_plan(goal, &plan_json);
        }

        let plan_json = self
            .plan_with_llm(goal, context, &knowledge, &suggested_tools, &best_practices)
            .await?;

        self.parse_plan(goal, &plan_json)
    }

    async fn invoke_plan_candidate(
        &self,
        request: &LLMRequest,
        preferences: &RouterPreferences,
        selected_target: bool,
        plan_kind: &str,
    ) -> Result<Option<String>> {
        let router = self.router.read().await;
        let candidates = router.candidates(request, preferences);
        drop(router);

        let Some(candidate) = candidates.first() else {
            if selected_target {
                return Err(anyhow::anyhow!(
                    "The selected Task model is unavailable inside this execution boundary"
                ));
            }
            return Ok(None);
        };

        let router = self.router.read().await;
        match tokio::time::timeout(
            TASK_PLAN_TIMEOUT,
            router.invoke_candidate(candidate, request),
        )
        .await
        {
            Ok(Ok(outcome)) => Ok(Some(outcome.response.content)),
            Ok(Err(error)) if selected_target => Err(anyhow::anyhow!(
                "The selected Task model could not create {plan_kind}: {error}"
            )),
            Ok(Err(_)) => Ok(None),
            Err(_) if selected_target => Err(anyhow::anyhow!(
                "The selected Task model did not create {plan_kind} within {} seconds",
                TASK_PLAN_TIMEOUT.as_secs()
            )),
            Err(_) => Err(anyhow::anyhow!(
                "No Task model created {plan_kind} within {} seconds",
                TASK_PLAN_TIMEOUT.as_secs()
            )),
        }
    }

    async fn plan_with_llm(
        &self,
        goal: &Goal,
        context: &ExecutionContext,
        knowledge: &[KnowledgeEntry],
        tools: &[Tool],
        best_practices: &[String],
    ) -> Result<String> {
        let knowledge_summary: Vec<String> = knowledge
            .iter()
            .map(|k| format!("- {}: {}", k.category, k.content))
            .take(5)
            .collect();

        let tools_summary: Vec<String> = tools
            .iter()
            .map(|t| format!("- {}: {}", t.id, t.description))
            .take(10)
            .collect();

        let best_practices_section = if !best_practices.is_empty() {
            format!(
                "\nBest Practices for this Process:\n{}\n",
                best_practices
                    .iter()
                    .map(|p| format!("- {}", p))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        } else {
            String::new()
        };

        let prompt = format!(
            r#"You are AGI Workforce's planning system - an autonomous AI that helps non-technical users automate tasks on their computer.

Your job is to create a detailed, step-by-step execution plan that AGI Workforce will follow to complete the user's request. Remember:
- Users are often non-technical, so plans should be robust and handle edge cases
- All actions should be reversible when possible (for undo functionality)
- Break complex tasks into clear, atomic steps

Goal: {}
Priority: {:?}
Success Criteria: {}

Available Tools:
{}

Relevant Knowledge:
{}
{}
Current Context:
- Operating System: {} ({})
- Architecture: {}
- CPU Usage: {}%
- Memory Usage: {}MB
- Previous Steps: {}

Create a step-by-step plan. For each step, specify:
1. Tool ID to use
2. Parameters for the tool
3. Description of what the step does
4. Estimated resource usage (CPU %, Memory MB, Network MB)
5. Dependencies on other steps

Return a JSON array of steps. Each step should have:
- id: unique step identifier
- tool_id: ID of tool to use
- description: what this step does
- parameters: object with tool parameters
- estimated_resources: {{ cpu_percent, memory_mb, network_mb }}
- dependencies: array of step IDs this depends on

Example:
[
  {{
    "id": "step_1",
    "tool_id": "ui_screenshot",
    "description": "Take screenshot to understand current state",
    "parameters": {{}},
    "estimated_resources": {{ "cpu_percent": 10.0, "memory_mb": 100, "network_mb": 0.0 }},
    "dependencies": []
  }},
  {{
    "id": "step_2",
    "tool_id": "ui_click",
    "description": "Click on the button",
    "parameters": {{ "target": {{ "type": "text", "text": "Open" }}}},
    "estimated_resources": {{ "cpu_percent": 5.0, "memory_mb": 50, "network_mb": 0.0 }},
    "dependencies": ["step_1"]
  }}
]

Return ONLY the JSON array."#,
            goal.description,
            goal.priority,
            goal.success_criteria.join(", "),
            tools_summary.join("\n"),
            knowledge_summary.join("\n"),
            best_practices_section,
            std::env::consts::OS,
            std::env::consts::FAMILY,
            std::env::consts::ARCH,
            context.available_resources.cpu_usage_percent,
            context.available_resources.memory_usage_mb,
            context.tool_results.len()
        );

        let (target_provider, target_model) = goal_routing_target(goal)?;
        let preferences = RouterPreferences {
            provider: target_provider,
            model: target_model.clone(),
            strategy: RoutingStrategy::Auto,
            context: None,
            prefer_cloud_credits: false,
            local_only: false,
            managed_cloud_only: false,
            // TRUST BOUNDARY (desktop-trust-boundary-01): the goal carries the
            // submitting session's boundary (threaded from `agi_submit_goal*`);
            // absent, `llm_router::effective_trust_mode` fails closed to Local.
            trust_mode: goal.trust_mode,
        };

        let request = task_plan_request(prompt, target_model.as_deref(), None);

        if let Some(plan) = self
            .invoke_plan_candidate(&request, &preferences, target_model.is_some(), "a plan")
            .await?
        {
            return Ok(plan);
        }

        self.generate_basic_plan(goal, tools, best_practices).await
    }

    async fn generate_basic_plan(
        &self,
        goal: &Goal,
        tools: &[Tool],
        _best_practices: &[String],
    ) -> Result<String> {
        let mut steps = Vec::new();

        if let Some(screenshot_tool) = tools.iter().find(|t| t.id == "ui_screenshot") {
            steps.push(json!({
                "id": "step_1",
                "tool_id": "ui_screenshot",
                "description": format!("Take screenshot to understand current state for: {}", goal.description),
                "parameters": {},
                "estimated_resources": screenshot_tool.estimated_resources,
                "dependencies": []
            }));
        }

        let description_lower = goal.description.to_lowercase();
        let mut step_num = 2;

        if description_lower.contains("click") || description_lower.contains("button") {
            if let Some(click_tool) = tools.iter().find(|t| t.id == "ui_click") {
                steps.push(json!({
                    "id": format!("step_{}", step_num),
                    "tool_id": "ui_click",
                    "description": "Click on UI element",
                    "parameters": { "target": { "type": "text", "text": "button" } },
                    "estimated_resources": click_tool.estimated_resources,
                    "dependencies": ["step_1"]
                }));
                step_num += 1;
            }
        }

        if description_lower.contains("type") || description_lower.contains("text") {
            if let Some(type_tool) = tools.iter().find(|t| t.id == "ui_type") {
                steps.push(json!({
                    "id": format!("step_{}", step_num),
                    "tool_id": "ui_type",
                    "description": "Type text",
                    "parameters": { "target": {}, "text": "text" },
                    "estimated_resources": type_tool.estimated_resources,
                    "dependencies": [format!("step_{}", step_num - 1)]
                }));
            }
        }

        Ok(serde_json::to_string(&steps)?)
    }

    fn parse_plan(&self, goal: &Goal, plan_json: &str) -> Result<Plan> {
        let steps_json: Vec<serde_json::Value> = serde_json::from_str(plan_json)?;

        let mut steps = Vec::new();
        let mut total_cpu = 0.0;
        let mut total_memory = 0u64;
        let mut total_network = 0.0;

        for step_json in steps_json {
            let step = self.parse_step(step_json)?;
            total_cpu += step.estimated_resources.cpu_percent;
            total_memory += step.estimated_resources.memory_mb;
            total_network += step.estimated_resources.network_mb;
            steps.push(step);
        }

        let heuristic_duration_secs = self.calculate_plan_duration(&steps).as_secs();
        let mut rule_based_duration_secs = 0u64;
        for step in &steps {
            let tool_duration = match step.tool_id.as_str() {
                "file_read" | "file_write" | "file_list" => 2,
                "ui_click" | "ui_type" | "ui_screenshot" => 3,
                "browser_navigate" | "browser_click" | "browser_extract" => 5,
                "code_execute" | "code_analyze" => 10,
                "db_query"
                | "db_execute"
                | "db_transaction_begin"
                | "db_transaction_commit"
                | "db_transaction_rollback" => 8,
                "api_call" | "api_upload" | "api_download" => 6,
                "document_read" | "document_search" | "image_ocr" => 7,
                "llm_reason" => 15,
                _ => 5,
            };
            rule_based_duration_secs += tool_duration;
        }

        let total_duration_secs = rule_based_duration_secs.max(heuristic_duration_secs);

        let planning_overhead = 5;
        let dependency_overhead = steps.len() as u64 * 2;
        let total_estimated = total_duration_secs + planning_overhead + dependency_overhead;

        Ok(Plan {
            goal_id: goal.id.clone(),
            steps,
            estimated_duration: Duration::from_secs(total_estimated),
            estimated_resources: ResourceUsage {
                cpu_percent: total_cpu,
                memory_mb: total_memory,
                network_mb: total_network,
            },
        })
    }

    fn parse_step(&self, step_json: serde_json::Value) -> Result<PlanStep> {
        let id = step_json["id"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing step id"))?
            .to_string();

        let tool_id = step_json["tool_id"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing tool_id"))?
            .to_string();

        let description = step_json["description"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing description"))?
            .to_string();

        let parameters = step_json["parameters"]
            .as_object()
            .map(|obj| obj.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
            .unwrap_or_default();

        let estimated_resources = if let Some(res) = step_json["estimated_resources"].as_object() {
            ResourceUsage {
                cpu_percent: res["cpu_percent"].as_f64().unwrap_or(5.0),
                memory_mb: res["memory_mb"].as_u64().unwrap_or(50),
                network_mb: res["network_mb"].as_f64().unwrap_or(0.0),
            }
        } else {
            ResourceUsage {
                cpu_percent: 5.0,
                memory_mb: 50,
                network_mb: 0.0,
            }
        };

        let dependencies = step_json["dependencies"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        Ok(PlanStep {
            id,
            tool_id,
            description,
            parameters,
            estimated_resources,
            dependencies,
        })
    }

    fn calculate_plan_duration(&self, steps: &[PlanStep]) -> Duration {
        if steps.is_empty() {
            return Duration::from_secs(5);
        }

        let mut total_seconds = 0u64;

        for step in steps {
            let base_duration = match step.tool_id.as_str() {
                "ui_screenshot" | "file_read" | "ui_click" => 1,

                "ui_type" | "file_write" | "image_ocr" => 3,

                "browser_navigate" | "db_query" | "api_call" => 8,

                "code_execute" | "llm_reason" => 20,

                _ => 5,
            };

            // Check >80 before >50 so the 2x multiplier is reachable
            let resource_multiplier = if step.estimated_resources.cpu_percent > 80.0 {
                2.0
            } else if step.estimated_resources.cpu_percent > 50.0 {
                1.5
            } else {
                1.0
            };

            let network_multiplier = if step.estimated_resources.network_mb > 0.0 {
                1.2
            } else {
                1.0
            };

            let step_duration =
                (base_duration as f64 * resource_multiplier * network_multiplier) as u64;
            total_seconds += step_duration;
        }

        total_seconds += (steps.len() as u64) / 2;

        total_seconds = total_seconds.min(600);

        Duration::from_secs(total_seconds)
    }

    pub async fn evaluate_criterion(
        &self,
        criterion: &str,
        context: &ExecutionContext,
    ) -> Result<bool> {
        let prompt = format!(
            r#"Evaluate if the following success criterion is met based on the execution context.

Success Criterion: {}

Execution Context:
- Completed Steps: {}
- Last Tool Results: {}
- Current Resources: CPU {}%, Memory {}MB
- Recent Errors: {}

Analyze the context and determine if the criterion is met.
Respond with ONLY "true" or "false"."#,
            criterion,
            context.tool_results.len(),
            context
                .tool_results
                .iter()
                .rev()
                .take(3)
                .map(|result| format!("{}: {}", result.tool_id, result.success))
                .collect::<Vec<_>>()
                .join(", "),
            context.available_resources.cpu_usage_percent,
            context.available_resources.memory_usage_mb,
            {
                let error_count = context
                    .tool_results
                    .iter()
                    .filter(|r| r.error.is_some())
                    .count();
                if error_count == 0 {
                    "None".to_string()
                } else {
                    error_count.to_string()
                }
            }
        );

        let router = self.router.read().await;
        match router.send_message(&prompt, None).await {
            Ok(response) => {
                let response_lower = response.trim().to_lowercase();
                // The prompt requires an exact boolean. Fail closed on prose,
                // negations (for example "not true"), or malformed output.
                let is_met = response_lower == "true";

                tracing::info!(
                    "[Planner] Criterion '{}' evaluation: {} (response: {})",
                    criterion,
                    is_met,
                    response.trim()
                );

                Ok(is_met)
            }
            Err(e) => {
                tracing::warn!(
                    "LLM criterion evaluation failed: {}, defaulting to false",
                    e
                );

                Ok(false)
            }
        }
    }

    pub async fn create_parallel_plans(
        &self,
        goal: &Goal,
        context: &ExecutionContext,
        num_plans: usize,
    ) -> Result<Vec<Plan>> {
        tracing::info!(
            "[Planner] Creating {} parallel plans for goal: {}",
            num_plans,
            goal.description
        );

        let knowledge = self.knowledge_base.get_relevant_knowledge(goal, 10).await?;
        let suggested_tools: Vec<_> = self.tool_registry.suggest_tools(&goal.description);

        let mut plans = Vec::new();

        for i in 0..num_plans {
            let strategy_hint = match i {
                0 => "Focus on speed and efficiency",
                1 => "Focus on thoroughness and accuracy",
                2 => "Use alternative tools and approaches",
                3 => "Optimize for minimal resource usage",
                4 => "Prioritize reliability and error handling",
                5 => "Experimental: try creative solutions",
                6 => "Conservative: use proven methods only",
                _ => "Balanced approach",
            };

            let plan_json = self
                .plan_with_strategy(goal, context, &knowledge, &suggested_tools, strategy_hint)
                .await?;

            let mut plan = self.parse_plan(goal, &plan_json)?;
            plan.goal_id = format!("{}_{}", goal.id, i);

            plans.push(plan);
        }

        tracing::info!(
            "[Planner] Generated {} parallel plans successfully",
            plans.len()
        );

        Ok(plans)
    }

    async fn plan_with_strategy(
        &self,
        goal: &Goal,
        context: &ExecutionContext,
        knowledge: &[KnowledgeEntry],
        tools: &[Tool],
        strategy_hint: &str,
    ) -> Result<String> {
        if let Some(plan_json) = reasoning_only_plan_json(goal, tools)? {
            return Ok(plan_json);
        }

        let knowledge_summary: Vec<String> = knowledge
            .iter()
            .map(|k| format!("- {}: {}", k.category, k.content))
            .take(5)
            .collect();

        let tools_summary: Vec<String> = tools
            .iter()
            .map(|t| format!("- {}: {}", t.id, t.description))
            .take(10)
            .collect();

        let prompt = format!(
            r#"You are AGI Workforce's planning system. Create a plan to achieve the user's goal using THIS STRATEGY: {}

Goal: {}
Priority: {:?}
Success Criteria: {}

Available Tools:
{}

Relevant Knowledge:
{}

Current Context:
- Operating System: {} ({})
- Architecture: {}
- CPU Usage: {}%
- Memory Usage: {}MB
- Previous Steps: {}

Return ONLY a JSON array of steps with this structure:
[
  {{
    "id": "step_1",
    "tool_id": "tool_name",
    "description": "what this step does",
    "parameters": {{ }},
    "estimated_resources": {{ "cpu_percent": 10.0, "memory_mb": 100, "network_mb": 0.0 }},
    "dependencies": []
  }}
]"#,
            strategy_hint,
            goal.description,
            goal.priority,
            goal.success_criteria.join(", "),
            tools_summary.join("\n"),
            knowledge_summary.join("\n"),
            std::env::consts::OS,
            std::env::consts::FAMILY,
            std::env::consts::ARCH,
            context.available_resources.cpu_usage_percent,
            context.available_resources.memory_usage_mb,
            context.tool_results.len()
        );

        let (target_provider, target_model) = goal_routing_target(goal)?;
        let preferences = RouterPreferences {
            provider: target_provider,
            model: target_model.clone(),
            strategy: RoutingStrategy::Auto,
            context: None,
            prefer_cloud_credits: false,
            local_only: false,
            managed_cloud_only: false,
            // TRUST BOUNDARY (desktop-trust-boundary-01): the goal carries the
            // submitting session's boundary (threaded from `agi_submit_goal*`);
            // absent, `llm_router::effective_trust_mode` fails closed to Local.
            trust_mode: goal.trust_mode,
        };

        let request = task_plan_request(prompt, target_model.as_deref(), Some(0.2));

        if let Some(plan) = self
            .invoke_plan_candidate(
                &request,
                &preferences,
                target_model.is_some(),
                "a parallel plan",
            )
            .await?
        {
            return Ok(plan);
        }

        self.generate_basic_plan(goal, tools, &[]).await
    }
}

#[cfg(test)]
mod task_plan_request_tests {
    use super::*;

    #[test]
    fn planner_requests_are_bounded_and_disable_thinking() {
        let request = task_plan_request(
            "Return a JSON plan".to_string(),
            Some("synthetic-local-model"),
            None,
        );

        assert_eq!(request.model, "synthetic-local-model");
        assert_eq!(request.max_tokens, Some(TASK_PLAN_MAX_TOKENS));
        assert!(!request.stream);
        assert!(matches!(
            request.thinking,
            Some(ThinkingParameter::Enabled(false))
        ));
        assert_eq!(request.thinking_mode, None);
    }

    #[test]
    fn reasoning_only_tasks_use_a_local_deterministic_plan() {
        let goal = Goal {
            id: "goal-fixture".to_string(),
            description: "Calculate 6 × 7".to_string(),
            priority: Priority::Medium,
            deadline: None,
            success_criteria: Vec::new(),
            constraints: Vec::new(),
            trust_mode: None,
        };
        let tool = Tool {
            id: "llm_reason".to_string(),
            name: "Reason".to_string(),
            description: "Reason with the selected model".to_string(),
            capabilities: Vec::new(),
            parameters: Vec::new(),
            estimated_resources: ResourceUsage {
                cpu_percent: 1.0,
                memory_mb: 2,
                network_mb: 0.0,
            },
            dependencies: Vec::new(),
        };

        let value: serde_json::Value = serde_json::from_str(
            &reasoning_only_plan_json(&goal, &[tool])
                .expect("plan should serialize")
                .expect("reasoning-only plan should exist"),
        )
        .expect("plan should be valid JSON");

        assert_eq!(value[0]["tool_id"], "llm_reason");
        assert_eq!(value[0]["parameters"]["prompt"], goal.description);
    }
}
