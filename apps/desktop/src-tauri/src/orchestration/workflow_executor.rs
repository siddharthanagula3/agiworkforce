use super::workflow_engine::*;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::time::{sleep, Duration};

/// Context for workflow execution
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

/// Workflow executor for running workflow definitions
pub struct WorkflowExecutor {
    engine: Arc<WorkflowEngine>,
    paused_executions: Arc<Mutex<HashMap<String, ExecutionContext>>>,
}

impl WorkflowExecutor {
    pub fn new(engine: Arc<WorkflowEngine>) -> Self {
        Self {
            engine,
            paused_executions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Execute a workflow
    pub async fn execute_workflow(
        &self,
        workflow_id: String,
        inputs: HashMap<String, Value>,
    ) -> Result<String, String> {
        // Create execution record
        let execution_id = self.engine.create_execution(&workflow_id, inputs.clone())?;

        // Get workflow definition
        let workflow = self.engine.get_workflow(&workflow_id)?;

        // Create execution context
        let context = ExecutionContext::new(execution_id.clone(), workflow_id.clone(), inputs);

        // Start execution in background
        let engine = Arc::clone(&self.engine);
        let exec_id = execution_id.clone();
        tokio::spawn(async move {
            let executor = WorkflowExecutor::new(engine);
            if let Err(e) = executor.run_workflow(workflow, context).await {
                eprintln!("Workflow execution failed: {}", e);
            }
        });

        Ok(execution_id)
    }

    /// Run the workflow execution
    async fn run_workflow(
        &self,
        workflow: WorkflowDefinition,
        mut context: ExecutionContext,
    ) -> Result<(), String> {
        // Update status to running
        self.engine.update_execution_status(
            &context.execution_id,
            WorkflowStatus::Running,
            None,
            None,
        )?;

        // Find start node (node with no incoming edges)
        let start_node = self.find_start_node(&workflow)?;

        // Execute from start node
        let result = self
            .execute_node(&workflow, &start_node, &mut context)
            .await;

        // Update final status
        match result {
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

    /// Find the start node of a workflow
    fn find_start_node(&self, workflow: &WorkflowDefinition) -> Result<WorkflowNode, String> {
        // Find nodes with no incoming edges
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

    /// Execute a single node
    async fn execute_node(
        &self,
        workflow: &WorkflowDefinition,
        node: &WorkflowNode,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        context.current_node_id = Some(node.id().to_string());
        context.execution_path.push(node.id().to_string());

        // Log node started
        self.engine.add_execution_log(
            &context.execution_id,
            node.id(),
            LogEventType::Started,
            None,
        )?;

        // Update execution status with current node
        self.engine.update_execution_status(
            &context.execution_id,
            WorkflowStatus::Running,
            Some(node.id().to_string()),
            None,
        )?;

        // Execute node based on type
        let result = match node {
            WorkflowNode::AgentNode { data, .. } => self.execute_agent_node(data, context).await,
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
            WorkflowNode::ScriptNode { data, .. } => self.execute_script_node(data, context).await,
            WorkflowNode::ToolNode { data, .. } => self.execute_tool_node(data, context).await,
        };

        match result {
            Ok(_) => {
                // Log node completed
                self.engine.add_execution_log(
                    &context.execution_id,
                    node.id(),
                    LogEventType::Completed,
                    None,
                )?;

                // Execute next nodes
                self.execute_next_nodes(workflow, node, context).await
            }
            Err(e) => {
                // Log node failed
                self.engine.add_execution_log(
                    &context.execution_id,
                    node.id(),
                    LogEventType::Failed,
                    Some(Value::String(e.clone())),
                )?;

                Err(e)
            }
        }
    }

    /// Execute next nodes based on edges
    async fn execute_next_nodes(
        &self,
        workflow: &WorkflowDefinition,
        current_node: &WorkflowNode,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        // Find outgoing edges from current node
        let outgoing_edges: Vec<&WorkflowEdge> = workflow
            .edges
            .iter()
            .filter(|e| e.source == current_node.id())
            .collect();

        if outgoing_edges.is_empty() {
            // No more nodes, workflow complete
            return Ok(());
        }

        // Execute next nodes
        for edge in outgoing_edges {
            // Check edge condition if present
            if let Some(condition) = &edge.condition {
                if !self.evaluate_condition(condition, context)? {
                    continue;
                }
            }

            // Find target node
            if let Some(next_node) = workflow.nodes.iter().find(|n| n.id() == edge.target) {
                self.execute_node(workflow, next_node, context).await?;
            }
        }

        Ok(())
    }

    /// Execute agent node
    async fn execute_agent_node(
        &self,
        data: &AgentNodeData,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        // Placeholder: In real implementation, this would call the agent system
        println!("Executing agent node: {}", data.label);

        // Map inputs from context
        let mut agent_inputs = HashMap::new();
        for (key, var_name) in &data.input_mapping {
            if let Some(value) = context.get_variable(var_name) {
                agent_inputs.insert(key.clone(), value.clone());
            }
        }

        // Simulate agent execution
        sleep(Duration::from_millis(100)).await;

        // Set outputs in context
        for (key, var_name) in &data.output_mapping {
            context.set_variable(
                var_name.clone(),
                Value::String(format!("Output from {}", data.label)),
            );
        }

        Ok(())
    }

    /// Execute decision node
    async fn execute_decision_node(
        &self,
        _workflow: &WorkflowDefinition,
        data: &DecisionNodeData,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        println!("Executing decision node: {}", data.label);

        let condition_result = self.evaluate_condition(&data.condition, context)?;

        // Store decision result in context
        context.set_variable(
            format!("decision_{}", data.label),
            Value::Bool(condition_result),
        );

        Ok(())
    }

    /// Execute loop node
    async fn execute_loop_node(
        &self,
        workflow: &WorkflowDefinition,
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

                    // Execute loop body (nodes connected to this loop node)
                    // This is simplified - in reality would need to handle loop body separately
                    sleep(Duration::from_millis(50)).await;
                }
            }
            LoopType::Condition => {
                if let Some(condition) = &data.condition {
                    while self.evaluate_condition(condition, context)? {
                        sleep(Duration::from_millis(50)).await;

                        // Prevent infinite loops
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

    /// Execute parallel node
    async fn execute_parallel_node(
        &self,
        _workflow: &WorkflowDefinition,
        data: &ParallelNodeData,
        _context: &mut ExecutionContext,
    ) -> Result<(), String> {
        println!("Executing parallel node: {}", data.label);

        // Placeholder: In real implementation, would execute branches in parallel
        sleep(Duration::from_millis(100)).await;

        Ok(())
    }

    /// Execute wait node
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
                    // Placeholder: Would wait until specific time
                    sleep(Duration::from_millis(100)).await;
                }
            }
            WaitType::Condition => {
                if let Some(_condition) = &data.condition {
                    // Placeholder: Would wait until condition is true
                    sleep(Duration::from_millis(100)).await;
                }
            }
        }

        Ok(())
    }

    /// Execute script node
    async fn execute_script_node(
        &self,
        data: &ScriptNodeData,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        println!("Executing script node: {}", data.label);

        // Placeholder: In real implementation, would execute script in sandbox
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

        // Set output in context
        context.set_variable(
            "script_output".to_string(),
            Value::String("Script executed successfully".to_string()),
        );

        Ok(())
    }

    /// Execute tool node
    async fn execute_tool_node(
        &self,
        data: &ToolNodeData,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        println!("Executing tool node: {}", data.label);

        // Placeholder: In real implementation, would call the tool from AGI system
        sleep(Duration::from_millis(100)).await;

        // Set output in context
        context.set_variable(
            format!("{}_output", data.tool_name),
            Value::String(format!("Tool {} executed", data.tool_name)),
        );

        Ok(())
    }

    /// Evaluate a condition
    fn evaluate_condition(
        &self,
        condition: &str,
        context: &ExecutionContext,
    ) -> Result<bool, String> {
        // Placeholder: Simple condition evaluation
        // In real implementation, would use a proper expression evaluator

        // Check for simple variable checks
        if condition.starts_with("$") {
            let var_name = condition.trim_start_matches('$');
            if let Some(value) = context.get_variable(var_name) {
                return Ok(value.as_bool().unwrap_or(false));
            }
        }

        // Default to true for now
        Ok(true)
    }

    /// Pause a workflow execution
    pub fn pause_execution(&self, execution_id: &str) -> Result<(), String> {
        self.engine
            .update_execution_status(execution_id, WorkflowStatus::Paused, None, None)?;

        Ok(())
    }

    /// Resume a paused workflow execution
    pub fn resume_execution(&self, execution_id: &str) -> Result<(), String> {
        // Get execution
        let execution = self.engine.get_execution_status(execution_id)?;

        if execution.status != WorkflowStatus::Paused {
            return Err("Execution is not paused".to_string());
        }

        // Get workflow
        let workflow = self.engine.get_workflow(&execution.workflow_id)?;

        // Create context from execution state
        let mut context = ExecutionContext::new(
            execution.id.clone(),
            execution.workflow_id.clone(),
            execution.inputs,
        );

        if let Some(node_id) = execution.current_node_id {
            context.current_node_id = Some(node_id.clone());

            // Find node and continue execution
            if let Some(node) = workflow.nodes.iter().find(|n| n.id() == node_id) {
                let engine = Arc::clone(&self.engine);
                tokio::spawn(async move {
                    let executor = WorkflowExecutor::new(engine);
                    if let Err(e) = executor.execute_node(&workflow, node, &mut context).await {
                        eprintln!("Failed to resume workflow: {}", e);
                    }
                });
            }
        }

        Ok(())
    }

    /// Cancel a workflow execution
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
