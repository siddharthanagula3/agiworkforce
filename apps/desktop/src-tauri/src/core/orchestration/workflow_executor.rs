use super::workflow_engine::*;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::{sleep, timeout};

/// Check if a program exists on the system PATH.
fn which_exists(program: &str) -> bool {
    let check = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };
    std::process::Command::new(check)
        .arg(program)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[derive(Debug, Clone)]
pub struct ExecutionContext {
    pub execution_id: String,
    pub workflow_id: String,
    pub variables: HashMap<String, Value>,
    pub current_node_id: Option<String>,
    pub execution_path: Vec<String>,
    pub loop_counters: HashMap<String, i32>,
    /// Tracks nodes already executed in this run to prevent infinite cycles
    /// from back-edges in the workflow graph.
    pub visited_nodes: HashSet<String>,
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
            visited_nodes: HashSet::new(),
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
    mcp_tool_executor: Option<Arc<crate::core::mcp::tool_executor::McpToolExecutor>>,
    default_agent_timeout_secs: u64,
}

impl WorkflowExecutor {
    pub fn new(engine: Arc<WorkflowEngine>) -> Self {
        Self {
            engine,
            mcp_tool_executor: None,
            default_agent_timeout_secs: 300,
        }
    }

    pub fn with_tool_executor(
        engine: Arc<WorkflowEngine>,
        executor: Arc<crate::core::mcp::tool_executor::McpToolExecutor>,
    ) -> Self {
        Self {
            engine,
            mcp_tool_executor: Some(executor),
            default_agent_timeout_secs: 300,
        }
    }

    /// Set the default timeout (in seconds) for agent nodes that don't specify one.
    pub fn with_default_timeout(mut self, timeout_secs: u64) -> Self {
        self.default_agent_timeout_secs = timeout_secs;
        self
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
        let tool_executor = self.mcp_tool_executor.clone();
        let default_timeout = self.default_agent_timeout_secs;
        tokio::spawn(async move {
            let executor = WorkflowExecutor {
                engine,
                mcp_tool_executor: tool_executor,
                default_agent_timeout_secs: default_timeout,
            };
            if let Err(e) = executor.run_workflow(workflow, context).await {
                tracing::error!("Workflow execution failed: {}", e);
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
            // Cycle detection: if this node has already been executed in this
            // run, a back-edge is creating an infinite loop.  LoopNodes manage
            // their own iteration via loop_counters and are exempt.
            let node_id_str = node.id().to_string();
            if !matches!(node, WorkflowNode::LoopNode { .. })
                && !context.visited_nodes.insert(node_id_str.clone())
            {
                return Err(format!(
                    "Cycle detected: node '{}' has already been executed in this workflow run",
                    node_id_str
                ));
            }

            context.current_node_id = Some(node_id_str.clone());
            context.execution_path.push(node_id_str);

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
        tracing::info!("Executing agent node: {}", data.label);

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
        tracing::debug!("Executing decision node: {}", data.label);

        let condition_result = self.evaluate_condition(&data.condition, context)?;

        context.set_variable(
            format!("decision_{}", data.label),
            Value::Bool(condition_result),
        );

        Ok(())
    }

    async fn execute_loop_node(
        &self,
        workflow: &WorkflowDefinition,
        node: &WorkflowNode,
        data: &LoopNodeData,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        tracing::debug!("Executing loop node: {}", data.label);

        match data.loop_type {
            LoopType::Count => {
                let iterations = data.iterations.unwrap_or(1);
                for i in 0..iterations {
                    context.set_variable(data.item_variable.clone(), Value::Number(i.into()));

                    // Bug #236 fix: Execute child nodes on each iteration
                    self.execute_next_nodes(workflow, node, context).await?;

                    sleep(Duration::from_millis(50)).await;
                }
            }
            LoopType::Condition => {
                if let Some(condition) = &data.condition {
                    while self.evaluate_condition(condition, context)? {
                        // Bug #237 fix: Execute child nodes on each iteration
                        self.execute_next_nodes(workflow, node, context).await?;

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

                            // Bug #238 fix: Execute child nodes on each iteration
                            self.execute_next_nodes(workflow, node, context).await?;

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
        workflow: &WorkflowDefinition,
        data: &ParallelNodeData,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        tracing::info!(
            "Executing parallel node: {} with {} branches",
            data.label,
            data.branches.len()
        );

        if data.branches.is_empty() {
            tracing::warn!("Parallel node {} has no branches, skipping", data.label);
            return Ok(());
        }

        // Resolve branch node IDs to actual workflow nodes
        let branch_nodes: Vec<WorkflowNode> = data
            .branches
            .iter()
            .filter_map(|branch_id| workflow.nodes.iter().find(|n| n.id() == branch_id).cloned())
            .collect();

        if branch_nodes.is_empty() {
            return Err(format!(
                "Parallel node {}: none of the branch node IDs ({:?}) found in workflow",
                data.label, data.branches
            ));
        }

        // Each branch gets its own cloned context so they can run concurrently.
        // After all branches complete, we merge their variables back into the parent context.
        let timeout_secs = data
            .timeout_seconds
            .filter(|&t| t > 0)
            .map(|t| t as u64)
            .unwrap_or(self.default_agent_timeout_secs);

        let mut handles: Vec<
            tokio::task::JoinHandle<Result<(String, HashMap<String, Value>), String>>,
        > = Vec::with_capacity(branch_nodes.len());

        for branch_node in &branch_nodes {
            let mut branch_context = context.clone();
            let branch_workflow = workflow.clone();
            let branch_node = branch_node.clone();
            let branch_engine = Arc::clone(&self.engine);
            let branch_tool_executor = self.mcp_tool_executor.clone();
            let branch_timeout = timeout_secs;
            let branch_default_timeout = self.default_agent_timeout_secs;

            handles.push(tokio::spawn(async move {
                let executor = WorkflowExecutor {
                    engine: branch_engine,
                    mcp_tool_executor: branch_tool_executor,
                    default_agent_timeout_secs: branch_default_timeout,
                };
                let branch_id = branch_node.id().to_string();

                let result = timeout(
                    Duration::from_secs(branch_timeout),
                    executor.execute_node(&branch_workflow, &branch_node, &mut branch_context),
                )
                .await;

                match result {
                    Ok(Ok(())) => Ok((branch_id, branch_context.variables)),
                    Ok(Err(e)) => Err(format!("Branch {} failed: {}", branch_id, e)),
                    Err(_) => Err(format!(
                        "Branch {} timed out after {}s",
                        branch_id, branch_timeout
                    )),
                }
            }));
        }

        // Collect results from all branches
        let mut errors: Vec<String> = Vec::new();
        let mut merged_vars: HashMap<String, Value> = HashMap::new();

        for handle in handles {
            match handle.await {
                Ok(Ok((_branch_id, branch_vars))) => {
                    merged_vars.extend(branch_vars);
                }
                Ok(Err(e)) => {
                    tracing::error!("Parallel branch error: {}", e);
                    if data.wait_for_all {
                        errors.push(e);
                    } else {
                        return Err(e);
                    }
                }
                Err(join_err) => {
                    let msg = format!("Branch task panicked: {}", join_err);
                    tracing::error!("{}", msg);
                    if data.wait_for_all {
                        errors.push(msg);
                    } else {
                        return Err(msg);
                    }
                }
            }
        }

        // Merge all branch variables back into the parent context
        context.variables.extend(merged_vars);

        if !errors.is_empty() {
            return Err(format!(
                "Parallel node {} had {} branch failures: {}",
                data.label,
                errors.len(),
                errors.join("; ")
            ));
        }

        Ok(())
    }

    async fn execute_wait_node(
        &self,
        data: &WaitNodeData,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        tracing::info!(
            "Executing wait node: {} (type: {:?})",
            data.label,
            data.wait_type
        );

        match data.wait_type {
            WaitType::Duration => {
                if let Some(duration_secs) = data.duration_seconds {
                    if duration_secs <= 0 {
                        return Ok(());
                    }
                    let total = Duration::from_secs(duration_secs as u64);
                    self.interruptible_sleep(total, &context.execution_id)
                        .await?;
                }
            }
            WaitType::UntilTime => {
                if let Some(until_timestamp) = data.until_time {
                    let now = chrono::Utc::now().timestamp();
                    let delta_secs = until_timestamp - now;
                    if delta_secs <= 0 {
                        tracing::debug!(
                            "Wait node target time {} already passed (now={}), continuing",
                            until_timestamp,
                            now
                        );
                        return Ok(());
                    }
                    let wait_duration = Duration::from_secs(delta_secs as u64);
                    tracing::info!(
                        "Wait node sleeping until timestamp {} ({} seconds from now)",
                        until_timestamp,
                        delta_secs
                    );
                    self.interruptible_sleep(wait_duration, &context.execution_id)
                        .await?;
                }
            }
            WaitType::Condition => {
                if let Some(condition) = &data.condition {
                    let max_polls = 3600u32;
                    let poll_interval = Duration::from_secs(1);
                    for poll_count in 0..max_polls {
                        if let Ok(execution) =
                            self.engine.get_execution_status(&context.execution_id)
                        {
                            if execution.status == WorkflowStatus::Cancelled {
                                return Err("Wait cancelled".to_string());
                            }
                            if execution.status == WorkflowStatus::Paused {
                                sleep(poll_interval).await;
                                continue;
                            }
                        }

                        if self.evaluate_condition(condition, context)? {
                            tracing::info!(
                                "Wait node condition met after {} polls: {}",
                                poll_count,
                                condition
                            );
                            return Ok(());
                        }
                        sleep(poll_interval).await;
                    }
                    return Err(format!(
                        "Wait node condition timed out after {} seconds: {}",
                        max_polls, condition
                    ));
                }
            }
        }

        Ok(())
    }

    /// Sleep for a duration in 1-second chunks, checking each second whether the
    /// execution has been cancelled or paused. Returns `Err` if cancelled.
    async fn interruptible_sleep(&self, total: Duration, execution_id: &str) -> Result<(), String> {
        let chunk = Duration::from_secs(1);
        let mut remaining = total;

        while !remaining.is_zero() {
            let this_sleep = remaining.min(chunk);
            sleep(this_sleep).await;
            remaining = remaining.saturating_sub(this_sleep);

            if let Ok(execution) = self.engine.get_execution_status(execution_id) {
                match execution.status {
                    WorkflowStatus::Cancelled => {
                        return Err("Wait cancelled".to_string());
                    }
                    WorkflowStatus::Paused => {
                        // Freeze the timer while paused
                        remaining = remaining.saturating_add(this_sleep);
                    }
                    _ => {}
                }
            }
        }
        Ok(())
    }

    /// Validate script code for dangerous patterns before execution.
    /// Returns an error string if the script contains blocked operations.
    fn validate_script_safety(code: &str, language: &ScriptLanguage) -> Result<(), String> {
        // Patterns that indicate dangerous filesystem / system operations
        // across all languages
        let universal_blocked = [
            // Recursive deletion patterns
            ("rm -rf /", "recursive root deletion"),
            ("rm -rf ~", "recursive home deletion"),
            ("rmdir /s /q", "recursive Windows root deletion"),
            ("format c:", "disk format"),
            // Credential / key theft
            ("/.ssh/", "SSH key access"),
            ("/etc/shadow", "password file access"),
            ("/etc/passwd", "user account file access"),
            // Crypto-mining indicators
            ("stratum+tcp://", "crypto mining pool connection"),
            ("xmrig", "crypto miner binary"),
            // Reverse shells
            ("/dev/tcp/", "reverse shell via /dev/tcp"),
            ("mkfifo", "named pipe (potential reverse shell)"),
        ];

        let code_lower = code.to_lowercase();
        for (pattern, description) in &universal_blocked {
            if code_lower.contains(&pattern.to_lowercase()) {
                return Err(format!(
                    "Script blocked: contains dangerous pattern '{}' ({})",
                    pattern, description
                ));
            }
        }

        // Language-specific checks
        match language {
            ScriptLanguage::Bash => {
                let bash_blocked = [
                    (":(){ :|:& };:", "fork bomb"),
                    ("dd if=/dev/", "raw disk I/O"),
                    ("> /dev/sd", "raw disk write"),
                    ("chmod -R 777 /", "recursive permission change on root"),
                    ("chown -R", "recursive ownership change"),
                    ("curl | sh", "pipe-to-shell remote code execution"),
                    ("wget | sh", "pipe-to-shell remote code execution"),
                    ("curl | bash", "pipe-to-shell remote code execution"),
                    ("wget | bash", "pipe-to-shell remote code execution"),
                ];
                for (pattern, description) in &bash_blocked {
                    if code_lower.contains(&pattern.to_lowercase()) {
                        return Err(format!(
                            "Bash script blocked: contains dangerous pattern '{}' ({})",
                            pattern, description
                        ));
                    }
                }
            }
            ScriptLanguage::Python => {
                let python_blocked = [
                    ("subprocess.call", "subprocess execution"),
                    ("subprocess.popen", "subprocess execution"),
                    ("subprocess.run", "subprocess execution"),
                    ("os.system(", "shell command execution"),
                    ("os.popen(", "shell command execution"),
                    ("os.exec", "process replacement"),
                    ("shutil.rmtree('/'", "recursive root deletion"),
                    ("__import__('os')", "dynamic OS module import"),
                    ("__import__('subprocess')", "dynamic subprocess import"),
                ];
                for (pattern, description) in &python_blocked {
                    if code_lower.contains(&pattern.to_lowercase()) {
                        return Err(format!(
                            "Python script blocked: contains dangerous pattern '{}' ({})",
                            pattern, description
                        ));
                    }
                }
            }
            ScriptLanguage::JavaScript => {
                let js_blocked = [
                    ("child_process", "child process execution"),
                    ("require('fs').rmdir", "recursive directory deletion"),
                    ("require('fs').unlink", "file deletion"),
                    ("execsync(", "synchronous command execution"),
                    ("execfilesync(", "synchronous file execution"),
                    ("spawnsync(", "synchronous process spawn"),
                ];
                for (pattern, description) in &js_blocked {
                    if code_lower.contains(&pattern.to_lowercase()) {
                        return Err(format!(
                            "JavaScript script blocked: contains dangerous pattern '{}' ({})",
                            pattern, description
                        ));
                    }
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
        tracing::info!("Executing script node: {}", data.label);

        // --- Security validation ---
        // 1. Validate script content against blocked patterns
        Self::validate_script_safety(&data.code, &data.language)?;

        // 2. Log script execution for audit trail
        tracing::warn!(
            "SCRIPT_EXECUTION: workflow={} execution={} language={:?} label='{}' code_length={} code_hash={:x}",
            context.workflow_id,
            context.execution_id,
            data.language,
            data.label,
            data.code.len(),
            {
                use std::collections::hash_map::DefaultHasher;
                use std::hash::{Hash, Hasher};
                let mut hasher = DefaultHasher::new();
                data.code.hash(&mut hasher);
                hasher.finish()
            }
        );

        // 3. Enforce maximum script code size (64 KB) to prevent abuse
        const MAX_SCRIPT_SIZE: usize = 64 * 1024;
        if data.code.len() > MAX_SCRIPT_SIZE {
            return Err(format!(
                "Script code exceeds maximum allowed size ({} bytes > {} bytes)",
                data.code.len(),
                MAX_SCRIPT_SIZE
            ));
        }

        /// Maximum output size in bytes to prevent memory exhaustion (1 MB).
        const MAX_OUTPUT_BYTES: usize = 1_024 * 1_024;

        let timeout_secs = data
            .timeout_seconds
            .map(|t| if t > 0 { t as u64 } else { 30 })
            .unwrap_or(30);

        // Cap maximum timeout to 5 minutes to prevent indefinite execution
        let timeout_secs = timeout_secs.min(300);

        let (program, args, code) = match data.language {
            ScriptLanguage::JavaScript => {
                // Prefer deno (sandboxed by default), fall back to node
                let runtime = if which_exists("deno") {
                    "deno"
                } else if which_exists("node") {
                    "node"
                } else {
                    return Err("No JavaScript runtime found (install node or deno)".to_string());
                };
                if runtime == "deno" {
                    // Deno sandbox: only allow env reads (for WF_ vars), deny net/fs/run
                    (
                        "deno".to_string(),
                        vec![
                            "run".to_string(),
                            "--allow-env".to_string(),
                            "--deny-net".to_string(),
                            "--deny-read".to_string(),
                            "--deny-write".to_string(),
                            "--deny-run".to_string(),
                            "-".to_string(),
                        ],
                        data.code.clone(),
                    )
                } else {
                    (
                        "node".to_string(),
                        vec!["-e".to_string(), data.code.clone()],
                        String::new(),
                    )
                }
            }
            ScriptLanguage::Python => {
                let runtime = if which_exists("python3") {
                    "python3"
                } else if which_exists("python") {
                    "python"
                } else {
                    return Err("No Python runtime found (install python3)".to_string());
                };
                (
                    runtime.to_string(),
                    vec!["-c".to_string(), data.code.clone()],
                    String::new(),
                )
            }
            ScriptLanguage::Bash => {
                let shell = if cfg!(target_os = "windows") {
                    "cmd"
                } else {
                    "bash"
                };
                // Use restricted bash mode (-r) when available; disables some dangerous
                // operations like changing directories via cd, setting/unsetting PATH,
                // and redirecting output to files.
                let flag = if cfg!(target_os = "windows") {
                    "/C"
                } else {
                    "-rc"
                };
                (
                    shell.to_string(),
                    vec![flag.to_string(), data.code.clone()],
                    String::new(),
                )
            }
        };

        // Build the subprocess command
        let mut cmd = tokio::process::Command::new(&program);
        cmd.args(&args);

        // Clear inherited environment to prevent leaking secrets (API keys, tokens, etc.)
        // Only pass through safe system variables needed for runtime execution.
        cmd.env_clear();
        let safe_inherited_vars = [
            "PATH", "HOME", "USER", "LANG", "LC_ALL", "TERM", "TMPDIR", "TMP", "TEMP",
        ];
        for var in &safe_inherited_vars {
            if let Ok(val) = std::env::var(var) {
                cmd.env(var, val);
            }
        }

        // Pass workflow variables as environment variables (WF_ prefix)
        for (key, value) in &context.variables {
            // Sanitize key: only allow alphanumeric + underscore
            let sanitized_key: String = key
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
                .collect();
            if sanitized_key.is_empty() {
                continue;
            }
            let env_val = match value {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            cmd.env(format!("WF_{}", sanitized_key.to_uppercase()), env_val);
        }

        // For deno reading from stdin, pipe the code
        if data.language == ScriptLanguage::JavaScript && program == "deno" {
            cmd.stdin(std::process::Stdio::piped());
        } else {
            cmd.stdin(std::process::Stdio::null());
        }
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        // Spawn the child process
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn {} process: {}", program, e))?;

        // If deno stdin mode, write the code to stdin
        if data.language == ScriptLanguage::JavaScript && program == "deno" {
            if let Some(mut stdin) = child.stdin.take() {
                use tokio::io::AsyncWriteExt;
                let _ = stdin.write_all(code.as_bytes()).await;
                drop(stdin);
            }
        }

        // Wait with timeout
        let output = timeout(Duration::from_secs(timeout_secs), child.wait_with_output()).await;

        let output = match output {
            Ok(Ok(output)) => output,
            Ok(Err(e)) => {
                return Err(format!("Script process error: {}", e));
            }
            Err(_) => {
                // Timeout — attempt to kill the process (best effort, child already moved)
                return Err(format!(
                    "Script execution timed out after {} seconds",
                    timeout_secs
                ));
            }
        };

        let mut stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let mut stderr = String::from_utf8_lossy(&output.stderr).to_string();

        // Truncate oversized output
        if stdout.len() > MAX_OUTPUT_BYTES {
            stdout.truncate(MAX_OUTPUT_BYTES);
            stdout.push_str("\n... [output truncated]");
        }
        if stderr.len() > MAX_OUTPUT_BYTES {
            stderr.truncate(MAX_OUTPUT_BYTES);
            stderr.push_str("\n... [output truncated]");
        }

        if !output.status.success() {
            let exit_code = output.status.code().unwrap_or(-1);
            return Err(format!(
                "Script exited with code {}.\nstderr: {}",
                exit_code, stderr
            ));
        }

        // Store stdout as the script output variable
        context.set_variable(
            "script_output".to_string(),
            Value::String(stdout.trim().to_string()),
        );

        // Also store stderr if non-empty, for debugging
        if !stderr.trim().is_empty() {
            context.set_variable(
                "script_stderr".to_string(),
                Value::String(stderr.trim().to_string()),
            );
        }

        Ok(())
    }

    async fn execute_tool_node(
        &self,
        data: &ToolNodeData,
        context: &mut ExecutionContext,
    ) -> Result<(), String> {
        tracing::info!("Executing tool node: {}", data.label);

        let executor = self.mcp_tool_executor.as_ref().ok_or_else(|| {
            format!(
                "MCP tool executor not available — cannot execute tool '{}'",
                data.tool_name
            )
        })?;

        let timeout_secs = data
            .timeout_seconds
            .map(|t| if t > 0 { t as u64 } else { 60 })
            .unwrap_or(60);
        let timeout_dur = Duration::from_secs(timeout_secs);

        let result = executor
            .execute_tool_with_timeout(&data.tool_name, data.tool_input.clone(), timeout_dur)
            .await
            .map_err(|e| format!("Tool '{}' failed: {}", data.tool_name, e))?;

        // Build a Value from ToolExecutionResult fields (it does not implement Serialize)
        let result_value = serde_json::json!({
            "tool_id": result.tool_id,
            "server_name": result.server_name,
            "result": result.result,
            "duration_ms": result.duration_ms,
            "timestamp": result.timestamp,
            "success": result.success,
            "error": result.error,
        });

        context.set_variable(format!("{}_output", data.tool_name), result_value);

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
        // Get current execution to capture current state
        let execution = self.engine.get_execution_status(execution_id)?;

        // Only allow pausing from running state
        if execution.status != WorkflowStatus::Running
            && execution.status != WorkflowStatus::WaitingApproval
        {
            return Err(format!(
                "Cannot pause execution in {:?} state",
                execution.status
            ));
        }

        self.engine.update_execution_status(
            execution_id,
            WorkflowStatus::Paused,
            execution.current_node_id,
            None,
        )?;

        Ok(())
    }

    pub fn resume_execution(&self, execution_id: &str) -> Result<(), String> {
        let execution = self.engine.get_execution_status(execution_id)?;

        // Allow resuming from either Paused or WaitingApproval states
        if execution.status != WorkflowStatus::Paused
            && execution.status != WorkflowStatus::WaitingApproval
        {
            return Err(format!(
                "Execution is not paused or waiting for approval (current status: {:?})",
                execution.status
            ));
        }

        // Update status to Running before resuming
        self.engine.update_execution_status(
            execution_id,
            WorkflowStatus::Running,
            execution.current_node_id.clone(),
            None,
        )?;

        let workflow = self.engine.get_workflow(&execution.workflow_id)?;

        let mut context = ExecutionContext::new(
            execution.id.clone(),
            execution.workflow_id.clone(),
            execution.inputs,
        );

        if let Some(node_id) = execution.current_node_id {
            context.current_node_id = Some(node_id.clone());

            // Restore outputs from previous execution if available
            context.variables.extend(execution.outputs);

            if let Some(node) = workflow.nodes.iter().find(|n| n.id() == node_id) {
                let node = node.clone();
                let engine = Arc::clone(&self.engine);
                let tool_executor = self.mcp_tool_executor.clone();
                let default_timeout = self.default_agent_timeout_secs;
                let execution_id = execution_id.to_string();
                tokio::spawn(async move {
                    let executor = WorkflowExecutor {
                        engine,
                        mcp_tool_executor: tool_executor,
                        default_agent_timeout_secs: default_timeout,
                    };
                    // Update status to Running when actually resuming execution
                    let _ = executor.engine.update_execution_status(
                        &execution_id,
                        WorkflowStatus::Running,
                        Some(node.id().to_string()),
                        None,
                    );
                    if let Err(e) = executor.execute_node(&workflow, &node, &mut context).await {
                        tracing::error!("Failed to resume workflow: {}", e);
                        let _ = executor.engine.update_execution_status(
                            &execution_id,
                            WorkflowStatus::Failed,
                            Some(node.id().to_string()),
                            Some(e),
                        );
                    }
                });
            }
        } else {
            // No current node, start fresh from beginning
            let engine = Arc::clone(&self.engine);
            let tool_executor = self.mcp_tool_executor.clone();
            let default_timeout = self.default_agent_timeout_secs;
            let execution_id = execution_id.to_string();
            tokio::spawn(async move {
                let executor = WorkflowExecutor {
                    engine,
                    mcp_tool_executor: tool_executor,
                    default_agent_timeout_secs: default_timeout,
                };
                if let Err(e) = executor.run_workflow(workflow, context).await {
                    tracing::error!("Failed to resume workflow: {}", e);
                    let _ = executor.engine.update_execution_status(
                        &execution_id,
                        WorkflowStatus::Failed,
                        None,
                        Some(e),
                    );
                }
            });
        }

        Ok(())
    }

    pub fn cancel_execution(&self, execution_id: &str) -> Result<(), String> {
        // First get the current execution to check its status
        let execution = self.engine.get_execution_status(execution_id)?;

        // Only allow cancellation from non-terminal states
        if execution.status == WorkflowStatus::Completed
            || execution.status == WorkflowStatus::Failed
            || execution.status == WorkflowStatus::Cancelled
        {
            return Err(format!(
                "Cannot cancel execution in {:?} state",
                execution.status
            ));
        }

        self.engine.update_execution_status(
            execution_id,
            WorkflowStatus::Cancelled,
            execution.current_node_id,
            Some("Cancelled by user".to_string()),
        )?;

        Ok(())
    }

    /// Approve a workflow that is waiting for approval
    pub fn approve_execution(&self, execution_id: &str) -> Result<(), String> {
        let execution = self.engine.get_execution_status(execution_id)?;

        if execution.status != WorkflowStatus::WaitingApproval {
            return Err(format!(
                "Execution is not waiting for approval (current status: {:?})",
                execution.status
            ));
        }

        // Resume execution after approval
        self.resume_execution(execution_id)
    }

    /// Reject a workflow that is waiting for approval
    pub fn reject_execution(
        &self,
        execution_id: &str,
        reason: Option<String>,
    ) -> Result<(), String> {
        let execution = self.engine.get_execution_status(execution_id)?;

        if execution.status != WorkflowStatus::WaitingApproval {
            return Err(format!(
                "Execution is not waiting for approval (current status: {:?})",
                execution.status
            ));
        }

        self.engine.update_execution_status(
            execution_id,
            WorkflowStatus::Failed,
            execution.current_node_id,
            reason.or_else(|| Some("Rejected by user".to_string())),
        )?;

        Ok(())
    }

    /// Pause execution and wait for approval
    pub async fn pause_for_approval(&self, execution_id: &str, reason: &str) -> Result<(), String> {
        self.engine.update_execution_status(
            execution_id,
            WorkflowStatus::WaitingApproval,
            None,
            Some(reason.to_string()),
        )?;

        // Note: The actual waiting for approval resolution should be handled
        // by the caller which will use the approval system to get user decision
        // This method just sets the state and returns

        Ok(())
    }

    /// Execute workflow with timeout
    pub async fn execute_workflow_with_timeout(
        &self,
        workflow_id: String,
        inputs: HashMap<String, Value>,
        timeout_seconds: u64,
    ) -> Result<String, String> {
        let execution_id = self.engine.create_execution(&workflow_id, inputs.clone())?;
        let workflow = self.engine.get_workflow(&workflow_id)?;
        let context = ExecutionContext::new(execution_id.clone(), workflow_id.clone(), inputs);

        let engine = Arc::clone(&self.engine);
        let tool_executor = self.mcp_tool_executor.clone();
        let default_timeout = self.default_agent_timeout_secs;
        let execution_id_clone = execution_id.clone();

        tokio::spawn(async move {
            let executor = WorkflowExecutor {
                engine,
                mcp_tool_executor: tool_executor,
                default_agent_timeout_secs: default_timeout,
            };

            let timeout_duration = Duration::from_secs(timeout_seconds);
            let result = timeout(timeout_duration, executor.run_workflow(workflow, context)).await;

            match result {
                Ok(Ok(_)) => {
                    // Workflow completed successfully - status already updated in run_workflow
                    tracing::info!("Workflow {} completed within timeout", execution_id_clone);
                }
                Ok(Err(e)) => {
                    // Workflow failed with error - status already updated in run_workflow
                    tracing::error!("Workflow {} failed: {}", execution_id_clone, e);
                }
                Err(_) => {
                    // Timeout occurred - update status to failed
                    let _ = executor.engine.update_execution_status(
                        &execution_id_clone,
                        WorkflowStatus::Failed,
                        None,
                        Some(format!(
                            "Workflow execution timed out after {} seconds",
                            timeout_seconds
                        )),
                    );
                    tracing::error!(
                        "Workflow {} timed out after {} seconds",
                        execution_id_clone,
                        timeout_seconds
                    );
                }
            }
        });

        Ok(execution_id)
    }

    /// Clean up old executions
    pub fn cleanup_old_executions(&self, max_age_seconds: i64) -> Result<usize, String> {
        self.engine.cleanup_old_executions(max_age_seconds)
    }

    /// Get stuck executions that may need attention
    pub fn get_stuck_executions(
        &self,
        threshold_seconds: i64,
    ) -> Result<Vec<super::workflow_engine::WorkflowExecution>, String> {
        self.engine.get_stuck_executions(threshold_seconds)
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
