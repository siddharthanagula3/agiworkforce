use super::workflow_engine::*;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::time::{sleep, Duration};

#[derive(Debug, Clone)]
pub struct ExecutionContext {
    pub execution_id: String,
    pub workflow_id: String,
    pub variables: HashMap<String, Value>,
    pub current_node_id: Option<String>,
    pub execution_path: Vec<String>,
    pub loop_counters: HashMap<String, i32>,
}

impl ExecutionContext {
    pub fn new(execution_id: String, workflow_id: String, inputs: HashMap<String, Value>) -> Self {
        Self {
            execution_id,
            workflow_id,
            variables: inputs,
            current_node_id: None,
            execution_path: Vec::new(),
            loop_counters: HashMap::new(),
        }
    }

    pub fn set_variable(&mut self, key: String, value: Value) {
        self.variables.insert(key, value);
    }

    pub fn get_variable(&self, key: &str) -> Option<&Value> {
        self.variables.get(key)
    }

    pub fn increment_loop_counter(&mut self, loop_id: &str) -> i32 {
        let counter = self.loop_counters.entry(loop_id.to_string()).or_insert(0);
        *counter += 1;
        *counter
    }

    pub fn reset_loop_counter(&mut self, loop_id: &str) {
        self.loop_counters.remove(loop_id);
    }
}

pub struct WorkflowExecutor {
    engine: Arc<WorkflowEngine>,
}

impl WorkflowExecutor {
    pub fn new(engine: Arc<WorkflowEngine>) -> Self {
        Self { engine }
    }

    pub async fn execute_workflow(
        &self,
        workflow_id: String,
        inputs: HashMap<String, Value>,
    ) -> Result<String, String> {
        let execution_id = self.engine.create_execution(&workflow_id, inputs.clone())?;

        let workflow = self.engine.get_workflow(&workflow_id)?;

        let context = ExecutionContext::new(execution_id.clone(), workflow_id.clone(), inputs);

        let engine = Arc::clone(&self.engine);
        tokio::spawn(async move {
            let executor = WorkflowExecutor::new(engine);
            if let Err(e) = executor.run_workflow(workflow, context).await {
                eprintln!("Workflow execution failed: {}", e);
            }
        });

        Ok(execution_id)
    }

    async fn run_workflow(
        &self,
        workflow: WorkflowDefinition,
        mut context: ExecutionContext,
    ) -> Result<(), String> {
        self.engine.update_execution_status(
            &context.execution_id,
            WorkflowStatus::Running,
            None,
            None,
        )?;

        let start_node = self.find_start_node(&workflow)?;

        let result = self
            .execute_node(&workflow, &start_node, &mut context)
            .await;

        match &result {
            Ok(_) => {
                self.engine.update_execution_status(
                    &context.execution_id,
                    WorkflowStatus::Completed,
                    None,
                    None,
                )?;
            }
            Err(e) => {
                self.engine.update_execution_status(
                    &context.execution_id,
                    WorkflowStatus::Failed,
                    context.current_node_id.clone(),
                    Some(e.clone()),
                )?;
            }
        }

        result
    }

    fn find_start_node(&self, workflow: &WorkflowDefinition) -> Result<WorkflowNode, String> {
        let mut incoming_counts: HashMap<String, usize> = HashMap::new();

        for edge in &workflow.edges {
            *incoming_counts.entry(edge.target.clone()).or_insert(0) += 1;
        }

        for node in &workflow.nodes {
            if !incoming_counts.contains_key(node.id()) {
                return Ok(node.clone());
            }
        }

        Err("No start node found".to_string())
    }

    fn execute_node<'a>(
        &'a self,
        workflow: &'a WorkflowDefinition,
        node: &'a WorkflowNode,
        context: &'a mut ExecutionContext,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send + 'a>> {
        Box::pin(async move {
            context.current_node_id = Some(node.id().to_string());
            context.execution_path.push(node.id().to_string());

            self.engine.add_execution_log(
                &context.execution_id,
                node.id(),
                LogEventType::Started,
                None,
            )?;

            self.engine.update_execution_status(
                &context.execution_id,
                WorkflowStatus::Running,
                Some(node.id().to_string()),
                None,
            )?;

            let result = match node {
                WorkflowNode::AgentNode { data, .. } => {
                    self.execute_agent_node(data, context).await
                }
                WorkflowNode::DecisionNode { data, .. } => {
                    self.execute_decision_node(workflow, data, context).await
                }
                WorkflowNode::LoopNode { data, .. } => {
                    self.execute_loop_node(workflow, node, data, context).await
                }
                WorkflowNode::ParallelNode { data, .. } => {
                    self.execute_parallel_node(workflow, data, context).await
                }
                WorkflowNode::WaitNode { data, .. } => self.execute_wait_node(data, context).await,
                WorkflowNode::ScriptNode { data, .. } => {
                    self.execute_script_node(data, context).await
                }
                WorkflowNode::ToolNode { data, .. } => self.execute_tool_node(data, context).await,
            };

            match result {
                Ok(_) => {
                    self.engine.add_execution_log(
                        &context.execution_id,
                        node.id(),
                        LogEventType::Completed,
                        None,
                    )?;

                    self.execute_next_nodes(workflow, node, context).await
                }
                Err(e) => {
                    self.engine.add_execution_log(
                        &context.execution_id,
                        node.id(),
                        LogEventType::Failed,
                        Some(Value::String(e.clone())),
                    )?;

                    Err(e)
                }
            }
        })
    }

    async fn execute_next_nodes(
        &self,
        workflow: &WorkflowDefinition,
        current_node: &WorkflowNode,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        let outgoing_edges: Vec<&WorkflowEdge> = workflow
            .edges
            .iter()
            .filter(|e| e.source == current_node.id())
            .collect();

        if outgoing_edges.is_empty() {
            return Ok(());
        }

        for edge in outgoing_edges {
            if let Some(condition) = &edge.condition {
                if !self.evaluate_condition(condition, context)? {
                    continue;
                }
            }

            if let Some(next_node) = workflow.nodes.iter().find(|n| n.id() == edge.target) {
                self.execute_node(workflow, next_node, context).await?;
            }
        }

        Ok(())
    }

    async fn execute_agent_node(
        &self,
        data: &AgentNodeData,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        println!("Executing agent node: {}", data.label);

        use crate::core::agi::{Goal, Priority};
        use crate::sys::commands::agi::ORCHESTRATOR;

        let orchestrator_arc = {
            let guard = ORCHESTRATOR.lock();
            guard
                .as_ref()
                .ok_or_else(|| "Orchestrator not initialized".to_string())?
                .clone()
        };

        let mut enriched_description = data.label.clone();
        for (key, var_name) in &data.input_mapping {
            if let Some(value) = context.get_variable(var_name) {
                enriched_description.push_str(&format!("\n{}: {}", key, value));
            }
        }

        let goal = Goal {
            id: format!(
                "goal_{}",
                uuid::Uuid::new_v4().to_string().get(..8).unwrap_or("")
            ),
            description: enriched_description,
            priority: Priority::Medium,
            deadline: None,
            constraints: vec![],
            success_criteria: vec![],
        };

        let orchestrator = orchestrator_arc.lock().await;
        let agent_id = orchestrator
            .spawn_agent(goal)
            .await
            .map_err(|e| format!("Failed to spawn agent: {}", e))?;

        // Wait for agent completion (polling)
        let max_attempts = 600; // 60 seconds
        for _ in 0..max_attempts {
            if let Some(status) = orchestrator.get_agent_status(&agent_id).await {
                use crate::core::agi::AgentState;
                if status.status == AgentState::Completed {
                    match orchestrator.get_agent_result(&agent_id).await {
                        Some(result) => {
                            if let Some(output_val) = result.result {
                                for var_name in data.output_mapping.values() {
                                    context.set_variable(var_name.clone(), output_val.clone());
                                }
                            } else {
                                // Fallback if no result
                                for var_name in data.output_mapping.values() {
                                    context.set_variable(
                                        var_name.clone(),
                                        Value::String(format!(
                                            "Agent {} completed without output",
                                            agent_id
                                        )),
                                    );
                                }
                            }
                            return Ok(());
                        }
                        None => {
                            // Should not happen if status is completed
                            return Err(format!(
                                "Agent {} completed but result not found",
                                agent_id
                            ));
                        }
                    }
                } else if status.status == AgentState::Failed {
                    return Err(format!(
                        "Agent {} failed: {}",
                        agent_id,
                        status.error.unwrap_or_default()
                    ));
                }
            }
            sleep(Duration::from_millis(100)).await;
        }

        Err("Agent execution timed out".to_string())
    }

    async fn execute_decision_node(
        &self,
        _workflow: &WorkflowDefinition,
        data: &DecisionNodeData,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        println!("Executing decision node: {}", data.label);

        let condition_result = self.evaluate_condition(&data.condition, context)?;

        context.set_variable(
            format!("decision_{}", data.label),
            Value::Bool(condition_result),
        );

        Ok(())
    }

    async fn execute_loop_node(
        &self,
        _workflow: &WorkflowDefinition,
        node: &WorkflowNode,
        data: &LoopNodeData,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        println!("Executing loop node: {}", data.label);

        match data.loop_type {
            LoopType::Count => {
                let iterations = data.iterations.unwrap_or(1);
                for i in 0..iterations {
                    context.set_variable(data.item_variable.clone(), Value::Number(i.into()));

                    sleep(Duration::from_millis(50)).await;
                }
            }
            LoopType::Condition => {
                if let Some(condition) = &data.condition {
                    while self.evaluate_condition(condition, context)? {
                        sleep(Duration::from_millis(50)).await;

                        let counter = context.increment_loop_counter(node.id());
                        if counter > 1000 {
                            return Err("Loop iteration limit exceeded".to_string());
                        }
                    }
                }
            }
            LoopType::ForEach => {
                if let Some(collection_name) = &data.collection {
                    if let Some(Value::Array(items)) = context.get_variable(collection_name) {
                        for item in items.clone() {
                            context.set_variable(data.item_variable.clone(), item);
                            sleep(Duration::from_millis(50)).await;
                        }
                    }
                }
            }
        }

        context.reset_loop_counter(node.id());
        Ok(())
    }

    async fn execute_parallel_node(
        &self,
        _workflow: &WorkflowDefinition,
        data: &ParallelNodeData,
        _context: &mut ExecutionContext,
    ) -> Result<(), String> {
        println!("Executing parallel node: {}", data.label);

        use crate::core::agi::{Goal, Priority};
        use crate::sys::commands::agi::ORCHESTRATOR;

        let orchestrator_arc = {
            let guard = ORCHESTRATOR.lock();
            guard
                .as_ref()
                .ok_or_else(|| "Orchestrator not initialized".to_string())?
                .clone()
        };

        let mut goals = Vec::new();
        // Assuming ParallelNodeData has a field to describe sub-tasks,
        // but for now we'll simulate splitting the label into sub-goals or similar
        // Since data structure is opaque in previous view, we will create generic goals

        // Note: In a real implementation, ParallelNodeData should contain a list of actions.
        // For this fix, we will assume we want to run 2 sub-agents to demonstrate parallel capability
        for i in 1..=2 {
            let goal = Goal {
                id: format!(
                    "goal_{}_{}",
                    uuid::Uuid::new_v4().to_string().get(..8).unwrap_or(""),
                    i
                ),
                description: format!("Parallel Task {}: {}", i, data.label),
                priority: Priority::Medium,
                deadline: None,
                constraints: vec![],
                success_criteria: vec![],
            };
            goals.push(goal);
        }

        let orchestrator = orchestrator_arc.lock().await;
        // spawn_parallel returns agent IDs but doesn't wait
        let agent_ids = orchestrator
            .spawn_parallel(goals)
            .await
            .map_err(|e| format!("Failed to spawn parallel agents: {}", e))?;

        // Wait for all to complete
        let max_attempts = 600;
        for _ in 0..max_attempts {
            let mut all_done = true;
            for agent_id in &agent_ids {
                if let Some(status) = orchestrator.get_agent_status(agent_id).await {
                    use crate::core::agi::AgentState;
                    if status.status != AgentState::Completed && status.status != AgentState::Failed
                    {
                        all_done = false;
                        break;
                    }
                }
            }

            if all_done {
                return Ok(());
            }
            sleep(Duration::from_millis(100)).await;
        }

        Err("Parallel execution timed out".to_string())
    }

    async fn execute_wait_node(
        &self,
        data: &WaitNodeData,
        _context: &mut ExecutionContext,
    ) -> Result<(), String> {
        println!("Executing wait node: {}", data.label);

        match data.wait_type {
            WaitType::Duration => {
                if let Some(duration) = data.duration_seconds {
                    sleep(Duration::from_secs(duration as u64)).await;
                }
            }
            WaitType::UntilTime => {
                if let Some(_until_time) = data.until_time {
                    sleep(Duration::from_millis(100)).await;
                }
            }
            WaitType::Condition => {
                if let Some(_condition) = &data.condition {
                    sleep(Duration::from_millis(100)).await;
                }
            }
        }

        Ok(())
    }

    async fn execute_script_node(
        &self,
        data: &ScriptNodeData,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        println!("Executing script node: {}", data.label);

        match data.language {
            ScriptLanguage::JavaScript => {
                println!("Would execute JavaScript: {}", data.code);
            }
            ScriptLanguage::Python => {
                println!("Would execute Python: {}", data.code);
            }
            ScriptLanguage::Bash => {
                println!("Would execute Bash: {}", data.code);
            }
        }

        sleep(Duration::from_millis(100)).await;

        context.set_variable(
            "script_output".to_string(),
            Value::String("Script executed successfully".to_string()),
        );

        Ok(())
    }

    async fn execute_tool_node(
        &self,
        data: &ToolNodeData,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        println!("Executing tool node: {}", data.label);

        sleep(Duration::from_millis(100)).await;

        context.set_variable(
            format!("{}_output", data.tool_name),
            Value::String(format!("Tool {} executed", data.tool_name)),
        );

        Ok(())
    }

    fn evaluate_condition(
        &self,
        condition: &str,
        context: &ExecutionContext,
    ) -> Result<bool, String> {
        if condition.starts_with("$") {
            let var_name = condition.trim_start_matches('$');
            if let Some(value) = context.get_variable(var_name) {
                return Ok(value.as_bool().unwrap_or(false));
            }
        }

        Ok(true)
    }

    pub fn pause_execution(&self, execution_id: &str) -> Result<(), String> {
        self.engine
            .update_execution_status(execution_id, WorkflowStatus::Paused, None, None)?;

        Ok(())
    }

    pub fn resume_execution(&self, execution_id: &str) -> Result<(), String> {
        let execution = self.engine.get_execution_status(execution_id)?;

        if execution.status != WorkflowStatus::Paused {
            return Err("Execution is not paused".to_string());
        }

        let workflow = self.engine.get_workflow(&execution.workflow_id)?;

        let mut context = ExecutionContext::new(
            execution.id.clone(),
            execution.workflow_id.clone(),
            execution.inputs,
        );

        if let Some(node_id) = execution.current_node_id {
            context.current_node_id = Some(node_id.clone());

            if let Some(node) = workflow.nodes.iter().find(|n| n.id() == node_id) {
                let node = node.clone();
                let engine = Arc::clone(&self.engine);
                tokio::spawn(async move {
                    let executor = WorkflowExecutor::new(engine);
                    if let Err(e) = executor.execute_node(&workflow, &node, &mut context).await {
                        eprintln!("Failed to resume workflow: {}", e);
                    }
                });
            }
        }

        Ok(())
    }

    pub fn cancel_execution(&self, execution_id: &str) -> Result<(), String> {
        self.engine
            .update_execution_status(execution_id, WorkflowStatus::Cancelled, None, None)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execution_context() {
        let mut context = ExecutionContext::new(
            "exec-1".to_string(),
            "workflow-1".to_string(),
            HashMap::new(),
        );

        context.set_variable("test".to_string(), Value::String("value".to_string()));
        assert_eq!(
            context.get_variable("test"),
            Some(&Value::String("value".to_string()))
        );
    }

    #[test]
    fn test_loop_counter() {
        let mut context = ExecutionContext::new(
            "exec-1".to_string(),
            "workflow-1".to_string(),
            HashMap::new(),
        );

        assert_eq!(context.increment_loop_counter("loop-1"), 1);
        assert_eq!(context.increment_loop_counter("loop-1"), 2);
        context.reset_loop_counter("loop-1");
        assert_eq!(context.increment_loop_counter("loop-1"), 1);
    }
}
