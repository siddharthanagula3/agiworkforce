use super::*;
use crate::agi::knowledge::KnowledgeEntry;
use crate::router::{ChatMessage, LLMRequest, LLMRouter, RouterPreferences, RoutingStrategy};
use anyhow::Result;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

/// AGI Planner - creates execution plans to achieve goals
pub struct AGIPlanner {
    router: Arc<Mutex<LLMRouter>>,
    tool_registry: Arc<ToolRegistry>,
    knowledge_base: Arc<KnowledgeBase>,
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
    pub dependencies: Vec<String>, // Step IDs this depends on
}

impl AGIPlanner {
    pub fn new(
        router: Arc<Mutex<LLMRouter>>,
        tool_registry: Arc<ToolRegistry>,
        knowledge_base: Arc<KnowledgeBase>,
    ) -> Result<Self> {
        Ok(Self {
            router,
            tool_registry,
            knowledge_base,
        })
    }

    /// Create a plan to achieve a goal
    pub async fn create_plan(&self, goal: &Goal, context: &ExecutionContext) -> Result<Plan> {
        tracing::info!("[Planner] Creating plan for goal: {}", goal.description);

        // Get relevant knowledge
        let knowledge = self.knowledge_base.get_relevant_knowledge(goal, 10).await?;

        // Suggest tools
        let suggested_tools: Vec<_> = self.tool_registry.suggest_tools(&goal.description);

        // Use LLM to create plan
        let plan_json = self
            .plan_with_llm(goal, context, &knowledge, &suggested_tools)
            .await?;

        // Parse plan
        self.parse_plan(goal, &plan_json)
    }

    async fn plan_with_llm(
        &self,
        goal: &Goal,
        context: &ExecutionContext,
        knowledge: &[KnowledgeEntry],
        tools: &[Tool],
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

        let prompt = format!(
            r#"You are an AGI (Artificial General Intelligence) planning system. Create a detailed execution plan to achieve the following goal.

Goal: {}
Priority: {:?}
Success Criteria: {}

Available Tools:
{}

Relevant Knowledge:
{}

Current Context:
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
            context.available_resources.cpu_usage_percent,
            context.available_resources.memory_usage_mb,
            context.tool_results.len()
        );

        // Use LLM to generate plan
        let preferences = RouterPreferences {
            provider: None,
            model: None,
            strategy: RoutingStrategy::Auto,
        };

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt.clone(),
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(4000),
            stream: false,
            tools: None,
            tool_choice: None,
        };

        let router = self.router.lock().await;
        let candidates = router.candidates(&request, &preferences);
        drop(router);

        if !candidates.is_empty() {
            let router = self.router.lock().await;
            if let Ok(outcome) = router.invoke_candidate(&candidates[0], &request).await {
                return Ok(outcome.response.content);
            }
        }

        // Fallback to basic plan
        self.generate_basic_plan(goal, tools).await
    }

    async fn generate_basic_plan(&self, goal: &Goal, tools: &[Tool]) -> Result<String> {
        // Generate basic plan without LLM (fallback)
        let mut steps = Vec::new();

        // Always start with screenshot
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

        // Add steps based on goal description
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

        // Calculate estimated duration based on steps and tool complexity
        let mut total_duration_secs = 0u64;
        for step in &steps {
            // Estimate duration based on tool type
            let tool_duration = match step.tool_id.as_str() {
                "file_read" | "file_write" | "file_list" => 2,
                "ui_click" | "ui_type" | "ui_screenshot" => 3,
                "browser_navigate" | "browser_click" | "browser_extract" => 5,
                "code_execute" | "code_analyze" => 10,
                "db_query" | "db_execute" | "db_transaction_begin" | "db_transaction_commit"
                | "db_transaction_rollback" => 8,
                "api_call" | "api_upload" | "api_download" => 6,
                "document_read" | "document_search" | "image_ocr" => 7,
                "llm_reason" => 15, // LLM calls are typically slower
                _ => 5,             // default for unknown tools
            };
            total_duration_secs += tool_duration;
        }

        // Add overhead for planning, dependencies, and error handling
        let planning_overhead = 5; // Fixed planning overhead
        let dependency_overhead = steps.len() as u64 * 2; // 2s per step for dependency resolution
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

    /// Evaluate if a success criterion is met
    pub async fn evaluate_criterion(
        &self,
        criterion: &str,
        context: &ExecutionContext,
    ) -> Result<bool> {
        tracing::info!("[Planner] Evaluating criterion: {}", criterion);

        // Build context summary from execution results
        let context_summary = if context.tool_results.is_empty() {
            "No steps have been executed yet.".to_string()
        } else {
            let mut summary = String::from("Execution history:\n");
            for (i, result) in context.tool_results.iter().enumerate() {
                summary.push_str(&format!(
                    "{}. Tool '{}': {} ({}ms)\n",
                    i + 1,
                    result.tool_id,
                    if result.success {
                        "SUCCESS"
                    } else {
                        "FAILED"
                    },
                    result.execution_time_ms
                ));
                if let Some(error) = &result.error {
                    summary.push_str(&format!("   Error: {}\n", error));
                }
            }
            summary
        };

        // Create evaluation prompt
        let prompt = format!(
            r#"Evaluate if the following success criterion has been met based on the execution context.

Success Criterion: {}

Context:
{}

Current State:
{}

Respond with ONLY 'true' or 'false' (lowercase) based on whether the criterion is satisfied.
- Return 'true' only if the criterion is clearly and definitively met
- Return 'false' if uncertain, partially met, or not met
- Be strict in your evaluation

Your response:"#,
            criterion,
            context_summary,
            serde_json::to_string_pretty(&context.current_state).unwrap_or_else(|_| "{}".to_string())
        );

        // Use LLM to evaluate
        let preferences = RouterPreferences {
            provider: None,
            model: None,
            strategy: RoutingStrategy::Auto,
        };

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt,
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "".to_string(),
            temperature: Some(0.1), // Low temperature for consistent evaluation
            max_tokens: Some(10),   // Only need true/false
            stream: false,
            tools: None,
            tool_choice: None,
        };

        let router = self.router.lock().await;
        let candidates = router.candidates(&request, &preferences);
        drop(router);

        if !candidates.is_empty() {
            let router = self.router.lock().await;
            if let Ok(outcome) = router.invoke_candidate(&candidates[0], &request).await {
                let response = outcome.response.content.trim().to_lowercase();
                tracing::debug!("[Planner] LLM evaluation response: {}", response);

                // Parse boolean from response
                let result = if response.contains("true") {
                    true
                } else if response.contains("false") {
                    false
                } else {
                    // If LLM didn't follow instructions, be conservative and return false
                    tracing::warn!(
                        "[Planner] LLM response unclear: '{}', defaulting to false",
                        response
                    );
                    false
                };

                tracing::info!("[Planner] Criterion evaluation result: {}", result);
                return Ok(result);
            }
        }

        // Fallback: if LLM unavailable, use heuristic evaluation
        tracing::warn!("[Planner] LLM unavailable for criterion evaluation, using heuristic");

        // Simple heuristic: check if more than 75% of steps succeeded
        if context.tool_results.is_empty() {
            return Ok(false); // No steps executed = criterion not met
        }

        let success_count = context.tool_results.iter().filter(|r| r.success).count();
        let total_count = context.tool_results.len();
        let success_rate = success_count as f64 / total_count as f64;

        Ok(success_rate > 0.75)
    }
}
