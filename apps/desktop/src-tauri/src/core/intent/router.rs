//! Tool routing based on detected intents.
//!
//! This module handles the routing of detected intents to appropriate tools
//! and MCP servers, including automatic server startup and tool selection.

use super::error::{IntentError, IntentResult};
use super::quick_win::{OptimizationResult, QuickWinOptimizer};
#[cfg(test)]
use super::types::Complexity;
use super::types::{DetectedIntent, IntentCategory, RequiredServer, ToolSelection};
use crate::core::mcp::{McpClient, McpServerConfig, McpServerManager, McpToolRegistry};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

/// A routing plan for executing an intent.
#[derive(Debug, Clone)]
pub struct RoutingPlan {
    /// The original detected intent.
    pub intent: DetectedIntent,

    /// Selected tools in execution order.
    pub tools: Vec<ToolSelection>,

    /// MCP servers that need to be started.
    pub servers_to_start: Vec<RequiredServer>,

    /// MCP servers that are already running.
    pub servers_running: Vec<String>,

    /// Estimated total execution time.
    pub estimated_time: Duration,

    /// Whether this plan can skip the planning phase.
    pub skip_planning: bool,

    /// Whether this is a quick-win optimized plan.
    pub is_optimized: bool,

    /// Optimization strategies applied.
    pub optimization_strategies: Vec<String>,

    /// Parallel execution groups (tools that can run concurrently).
    pub parallel_groups: Vec<Vec<String>>,

    /// Sequential dependencies between tools.
    pub tool_dependencies: HashMap<String, Vec<String>>,

    /// Direct answer if available (for trivial queries).
    pub direct_answer: Option<String>,
}

impl RoutingPlan {
    /// Creates a new routing plan.
    #[must_use]
    pub fn new(intent: DetectedIntent) -> Self {
        Self {
            intent,
            tools: Vec::new(),
            servers_to_start: Vec::new(),
            servers_running: Vec::new(),
            estimated_time: Duration::from_secs(30),
            skip_planning: false,
            is_optimized: false,
            optimization_strategies: Vec::new(),
            parallel_groups: Vec::new(),
            tool_dependencies: HashMap::new(),
            direct_answer: None,
        }
    }

    /// Returns the number of steps in this plan.
    #[must_use]
    pub fn step_count(&self) -> usize {
        self.tools.len()
    }

    /// Returns true if any servers need to be started.
    #[must_use]
    pub fn needs_server_startup(&self) -> bool {
        !self.servers_to_start.is_empty()
    }

    /// Returns all required server names.
    pub fn required_server_names(&self) -> Vec<String> {
        let mut names: Vec<String> = self
            .servers_to_start
            .iter()
            .map(|s| s.name.clone())
            .collect();
        names.extend(self.servers_running.clone());
        names
    }

    /// Returns tool IDs that can be executed in parallel.
    pub fn get_parallel_tools(&self) -> Vec<Vec<String>> {
        if self.parallel_groups.is_empty() {
            // If no parallel groups defined, return all tools as sequential
            vec![self.tools.iter().map(|t| t.tool_id.clone()).collect()]
        } else {
            self.parallel_groups.clone()
        }
    }
}

/// Configuration for the tool router.
#[derive(Debug, Clone)]
pub struct ToolRouterConfig {
    /// Whether to auto-start required MCP servers.
    pub auto_start_servers: bool,

    /// Timeout for server startup.
    pub server_startup_timeout: Duration,

    /// Whether to use quick-win optimization.
    pub enable_quick_win_optimization: bool,

    /// Maximum number of parallel tool executions.
    pub max_parallel_tools: usize,

    /// Whether to prefer built-in tools over MCP tools.
    pub prefer_builtin_tools: bool,
}

impl Default for ToolRouterConfig {
    fn default() -> Self {
        Self {
            auto_start_servers: true,
            server_startup_timeout: Duration::from_secs(30),
            enable_quick_win_optimization: true,
            max_parallel_tools: 5,
            prefer_builtin_tools: true,
        }
    }
}

/// Routes intents to appropriate tools and MCP servers.
pub struct ToolRouter {
    config: ToolRouterConfig,
    mcp_client: Arc<McpClient>,
    mcp_registry: Option<Arc<McpToolRegistry>>,
    mcp_manager: Option<Arc<McpServerManager>>,
    quick_win_optimizer: QuickWinOptimizer,
    server_configs: HashMap<String, McpServerConfig>,
}

impl ToolRouter {
    /// Creates a new tool router.
    #[must_use]
    pub fn new(mcp_client: Arc<McpClient>) -> Self {
        Self {
            config: ToolRouterConfig::default(),
            mcp_client,
            mcp_registry: None,
            mcp_manager: None,
            quick_win_optimizer: QuickWinOptimizer::new(),
            server_configs: Self::default_server_configs(),
        }
    }

    /// Creates a tool router with custom configuration.
    #[must_use]
    pub fn with_config(mut self, config: ToolRouterConfig) -> Self {
        self.config = config;
        self
    }

    /// Sets the MCP tool registry.
    #[must_use]
    pub fn with_registry(mut self, registry: Arc<McpToolRegistry>) -> Self {
        self.mcp_registry = Some(registry);
        self
    }

    /// Sets the MCP server manager.
    #[must_use]
    pub fn with_manager(mut self, manager: Arc<McpServerManager>) -> Self {
        self.mcp_manager = Some(manager);
        self
    }

    /// Registers an MCP server configuration.
    pub fn register_server_config(&mut self, name: impl Into<String>, config: McpServerConfig) {
        self.server_configs.insert(name.into(), config);
    }

    /// Routes an intent to a routing plan.
    pub async fn route(&self, intent: &DetectedIntent) -> IntentResult<RoutingPlan> {
        let mut plan = RoutingPlan::new(intent.clone());

        // Apply quick-win optimization if enabled
        if self.config.enable_quick_win_optimization {
            let optimization = self.quick_win_optimizer.optimize(intent)?;
            self.apply_optimization(&mut plan, &optimization);
        }

        // Select tools
        let tools = self.select_tools(intent).await?;
        plan.tools = tools;

        // Determine required servers
        let (to_start, running) = self.determine_server_status(intent).await;
        plan.servers_to_start = to_start;
        plan.servers_running = running;

        // Calculate parallel execution groups
        plan.parallel_groups = self.calculate_parallel_groups(&plan.tools);
        plan.tool_dependencies = self.calculate_dependencies(&plan.tools);

        // Estimate total time
        plan.estimated_time = self.estimate_total_time(&plan);

        Ok(plan)
    }

    /// Routes an intent synchronously (without server checks).
    pub fn route_sync(&self, intent: &DetectedIntent) -> IntentResult<RoutingPlan> {
        let mut plan = RoutingPlan::new(intent.clone());

        // Apply quick-win optimization if enabled
        if self.config.enable_quick_win_optimization {
            let optimization = self.quick_win_optimizer.optimize(intent)?;
            self.apply_optimization(&mut plan, &optimization);
        }

        // Select tools synchronously
        let tools = self.select_tools_sync(intent);
        plan.tools = tools;

        // Mark all required servers as needing startup
        plan.servers_to_start = intent.required_servers.clone();

        // Calculate parallel execution groups
        plan.parallel_groups = self.calculate_parallel_groups(&plan.tools);
        plan.tool_dependencies = self.calculate_dependencies(&plan.tools);

        // Estimate total time
        plan.estimated_time = self.estimate_total_time(&plan);

        Ok(plan)
    }

    /// Starts required MCP servers for a routing plan.
    pub async fn start_required_servers(&self, plan: &RoutingPlan) -> IntentResult<Vec<String>> {
        if !self.config.auto_start_servers {
            return Ok(Vec::new());
        }

        let manager = self.mcp_manager.as_ref().ok_or_else(|| {
            IntentError::McpServerUnavailable("MCP manager not configured".to_string())
        })?;

        let mut started = Vec::new();

        for server in &plan.servers_to_start {
            if !server.required {
                continue;
            }

            // Check if we have a config for this server
            if let Some(config) = self.server_configs.get(&server.name) {
                // Register and start the server
                manager.register_server(server.name.clone(), config.clone());

                match tokio::time::timeout(
                    self.config.server_startup_timeout,
                    manager.start_server(&server.name),
                )
                .await
                {
                    Ok(Ok(())) => {
                        tracing::info!("Started MCP server: {}", server.name);
                        started.push(server.name.clone());
                    }
                    Ok(Err(e)) => {
                        tracing::warn!("Failed to start MCP server {}: {}", server.name, e);
                        // Only error if the server is required
                        if server.required {
                            return Err(IntentError::McpServerUnavailable(format!(
                                "Failed to start required server {}: {}",
                                server.name, e
                            )));
                        }
                    }
                    Err(_) => {
                        tracing::warn!("Timeout starting MCP server: {}", server.name);
                        if server.required {
                            return Err(IntentError::McpServerUnavailable(format!(
                                "Timeout starting required server: {}",
                                server.name
                            )));
                        }
                    }
                }
            } else {
                tracing::debug!("No configuration for MCP server: {}", server.name);
            }
        }

        Ok(started)
    }

    /// Selects tools for an intent.
    async fn select_tools(&self, intent: &DetectedIntent) -> IntentResult<Vec<ToolSelection>> {
        let mut tools = Vec::new();

        // Add built-in tools from intent
        for tool_id in &intent.required_tools {
            let selection = ToolSelection::new(
                tool_id.clone(),
                format!(
                    "Required for {} task",
                    intent.primary_category.description()
                ),
            );
            tools.push(selection);
        }

        // Search MCP tools if registry is available
        if let Some(registry) = &self.mcp_registry {
            let mcp_tools = self.search_mcp_tools(registry, intent);
            tools.extend(mcp_tools);
        }

        // Prioritize tools
        tools = self
            .quick_win_optimizer
            .prioritize_tools(&tools.iter().map(|t| t.tool_id.clone()).collect::<Vec<_>>());

        // Limit tools if too many
        if tools.len() > 10 {
            tools.truncate(10);
        }

        Ok(tools)
    }

    /// Selects tools synchronously.
    fn select_tools_sync(&self, intent: &DetectedIntent) -> Vec<ToolSelection> {
        let mut tools = Vec::new();

        // Add built-in tools from intent
        for tool_id in &intent.required_tools {
            let selection = ToolSelection::new(
                tool_id.clone(),
                format!(
                    "Required for {} task",
                    intent.primary_category.description()
                ),
            );
            tools.push(selection);
        }

        // Add category-based default tools
        let default_tools = self.get_default_tools_for_category(intent.primary_category);
        for tool_id in default_tools {
            if !tools.iter().any(|t| t.tool_id == tool_id) {
                let selection = ToolSelection::new(
                    tool_id.clone(),
                    format!("Default for {}", intent.primary_category.description()),
                );
                tools.push(selection);
            }
        }

        // Prioritize tools
        self.quick_win_optimizer
            .prioritize_tools(&tools.iter().map(|t| t.tool_id.clone()).collect::<Vec<_>>())
    }

    /// Searches MCP tools for relevant matches.
    fn search_mcp_tools(
        &self,
        registry: &McpToolRegistry,
        intent: &DetectedIntent,
    ) -> Vec<ToolSelection> {
        let mut tools = Vec::new();

        // Search based on keywords
        let search_terms: Vec<&str> = match intent.primary_category {
            IntentCategory::Email => vec!["email", "mail", "send", "inbox"],
            IntentCategory::Calendar => vec!["calendar", "event", "schedule"],
            IntentCategory::FileOperation => vec!["file", "read", "write", "directory"],
            IntentCategory::WebSearch => vec!["search", "web", "browse"],
            IntentCategory::Database => vec!["database", "sql", "query"],
            IntentCategory::VersionControl => vec!["git", "commit", "push", "branch"],
            IntentCategory::CloudStorage => vec!["cloud", "drive", "upload", "download"],
            IntentCategory::Productivity => vec!["task", "todo", "note"],
            _ => vec![],
        };

        for term in search_terms {
            let found_tools = registry.search_tools(term);
            for tool in found_tools {
                if !tools.iter().any(|t: &ToolSelection| t.tool_id == tool.id) {
                    let selection =
                        ToolSelection::new(tool.id.clone(), format!("MCP tool for '{}'", term))
                            .from_mcp(self.extract_server_name(&tool.id))
                            .with_confidence(0.7);
                    tools.push(selection);
                }
            }
        }

        tools
    }

    /// Extracts server name from an MCP tool ID.
    fn extract_server_name(&self, tool_id: &str) -> String {
        // MCP tool IDs are in format: mcp__<server_name>__<tool_name>
        let parts: Vec<&str> = tool_id.split("__").collect();
        if parts.len() >= 2 {
            parts[1].to_string()
        } else {
            "unknown".to_string()
        }
    }

    /// Determines which servers are running and which need to be started.
    async fn determine_server_status(
        &self,
        intent: &DetectedIntent,
    ) -> (Vec<RequiredServer>, Vec<String>) {
        let mut to_start = Vec::new();
        let mut running = Vec::new();

        let connected = self.mcp_client.list_servers();

        for server in &intent.required_servers {
            if connected.contains(&server.name) {
                running.push(server.name.clone());
            } else {
                to_start.push(server.clone());
            }
        }

        // Sort servers to start by priority
        to_start.sort_by_key(|s| s.priority);

        (to_start, running)
    }

    /// Applies optimization results to a routing plan.
    fn apply_optimization(&self, plan: &mut RoutingPlan, optimization: &OptimizationResult) {
        plan.is_optimized = optimization.is_quick_win;
        plan.skip_planning = optimization.skip_planning;
        plan.optimization_strategies = optimization.strategies_applied.clone();
        plan.direct_answer = optimization.direct_answer.clone();

        if optimization.is_quick_win && !optimization.optimized_tools.is_empty() {
            plan.tools = optimization.optimized_tools.clone();
            plan.estimated_time = optimization.estimated_time;
        }
    }

    /// Calculates which tools can be executed in parallel.
    fn calculate_parallel_groups(&self, tools: &[ToolSelection]) -> Vec<Vec<String>> {
        let mut groups = Vec::new();
        let mut current_group = Vec::new();
        let mut tools_with_deps: Vec<&ToolSelection> = tools
            .iter()
            .filter(|t| !t.dependencies.is_empty())
            .collect();

        // First group: tools without dependencies
        for tool in tools {
            if tool.dependencies.is_empty() {
                current_group.push(tool.tool_id.clone());
                if current_group.len() >= self.config.max_parallel_tools {
                    groups.push(current_group);
                    current_group = Vec::new();
                }
            }
        }

        if !current_group.is_empty() {
            groups.push(current_group);
        }

        // Subsequent groups: tools with dependencies (must run sequentially after deps)
        for tool in &tools_with_deps {
            groups.push(vec![tool.tool_id.clone()]);
        }

        // Clear the mutable borrow
        tools_with_deps.clear();

        groups
    }

    /// Calculates tool dependencies.
    fn calculate_dependencies(&self, tools: &[ToolSelection]) -> HashMap<String, Vec<String>> {
        let mut deps = HashMap::new();

        for tool in tools {
            if !tool.dependencies.is_empty() {
                deps.insert(tool.tool_id.clone(), tool.dependencies.clone());
            }
        }

        deps
    }

    /// Estimates total execution time for a plan.
    fn estimate_total_time(&self, plan: &RoutingPlan) -> Duration {
        // Sum up tool times (simplified - doesn't account for parallelism)
        let tool_time: Duration = plan
            .tools
            .iter()
            .map(|t| self.estimate_tool_time(&t.tool_id))
            .sum();

        // Add server startup time if needed
        let startup_time = if plan.needs_server_startup() {
            Duration::from_secs(5 * plan.servers_to_start.len() as u64)
        } else {
            Duration::ZERO
        };

        tool_time + startup_time
    }

    /// Estimates execution time for a single tool.
    fn estimate_tool_time(&self, tool_id: &str) -> Duration {
        match tool_id {
            // Instant operations
            "memory_recall" | "memory_search" | "list_scheduled_tasks" => {
                Duration::from_millis(100)
            }

            // Fast operations
            "file_read" | "git_status" => Duration::from_millis(500),

            // Simple operations
            "memory_remember" | "schedule_reminder" | "file_write" | "file_delete" => {
                Duration::from_secs(1)
            }

            // Network operations
            "search_web" | "api_call" => Duration::from_secs(3),
            "email_fetch" | "calendar_list_events" => Duration::from_secs(5),

            // UI operations
            "ui_screenshot" | "ui_click" | "ui_type" => Duration::from_secs(2),

            // Browser operations
            "browser_navigate" | "browser_extract" | "browser_click" => Duration::from_secs(5),

            // Complex operations
            "code_execute" | "code_analyze" => Duration::from_secs(10),
            "image_analyze" | "image_ocr" => Duration::from_secs(10),
            "document_read" | "document_search" => Duration::from_secs(5),

            // Generation operations
            "image_generate" | "media_generate_image" => Duration::from_secs(30),
            "video_generate" | "media_generate_video" => Duration::from_secs(60),

            // Database operations
            "db_query" | "db_execute" => Duration::from_secs(5),

            // Default for unknown tools
            _ => Duration::from_secs(5),
        }
    }

    /// Gets default tools for a category.
    fn get_default_tools_for_category(&self, category: IntentCategory) -> Vec<String> {
        match category {
            IntentCategory::FileOperation => {
                vec!["file_read".to_string(), "file_write".to_string()]
            }
            IntentCategory::WebSearch => vec!["search_web".to_string()],
            IntentCategory::Email => {
                vec!["email_fetch".to_string(), "email_send".to_string()]
            }
            IntentCategory::Calendar => vec![
                "calendar_list_events".to_string(),
                "calendar_create_event".to_string(),
            ],
            IntentCategory::Document => vec![
                "document_read".to_string(),
                "document_create_word".to_string(),
            ],
            IntentCategory::Automation => {
                vec!["ui_screenshot".to_string(), "browser_navigate".to_string()]
            }
            IntentCategory::Database => vec!["db_query".to_string()],
            IntentCategory::CodeTask => {
                vec!["code_execute".to_string(), "code_analyze".to_string()]
            }
            IntentCategory::VersionControl => {
                vec!["git_status".to_string(), "git_commit".to_string()]
            }
            IntentCategory::Memory => {
                vec!["memory_recall".to_string(), "memory_remember".to_string()]
            }
            IntentCategory::Scheduling => vec![
                "schedule_reminder".to_string(),
                "list_scheduled_tasks".to_string(),
            ],
            IntentCategory::MediaGeneration => {
                vec!["image_generate".to_string(), "video_generate".to_string()]
            }
            IntentCategory::ImageProcessing => {
                vec!["image_analyze".to_string(), "image_ocr".to_string()]
            }
            IntentCategory::ApiIntegration => vec!["api_call".to_string()],
            IntentCategory::CloudStorage => {
                vec!["cloud_upload".to_string(), "cloud_download".to_string()]
            }
            IntentCategory::Productivity => vec!["productivity_create_task".to_string()],
            IntentCategory::SystemCommand => vec!["terminal_execute".to_string()],
            IntentCategory::Conversation => Vec::new(),
        }
    }

    /// Returns default MCP server configurations.
    fn default_server_configs() -> HashMap<String, McpServerConfig> {
        let mut configs = HashMap::new();

        // Filesystem server
        configs.insert(
            "filesystem".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-filesystem".to_string(),
                    "/".to_string(),
                ],
                env: HashMap::new(),
                enabled: true,
                transport: None,
            },
        );

        // Brave search server
        configs.insert(
            "brave-search".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-brave-search".to_string(),
                ],
                env: HashMap::new(),
                enabled: true,
                transport: None,
            },
        );

        // GitHub server
        configs.insert(
            "github".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-github".to_string(),
                ],
                env: HashMap::new(),
                enabled: true,
                transport: None,
            },
        );

        // Postgres server
        configs.insert(
            "postgres".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-postgres".to_string(),
                ],
                env: HashMap::new(),
                enabled: true,
                transport: None,
            },
        );

        // Puppeteer server
        configs.insert(
            "puppeteer".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-puppeteer".to_string(),
                ],
                env: HashMap::new(),
                enabled: true,
                transport: None,
            },
        );

        configs
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::intent::types::IntentConfidence;

    fn create_test_intent(category: IntentCategory, tools: Vec<String>) -> DetectedIntent {
        DetectedIntent {
            prompt: "test prompt".to_string(),
            primary_category: category,
            secondary_categories: Vec::new(),
            complexity: Complexity::Simple,
            confidence: IntentConfidence::default(),
            required_tools: tools,
            required_servers: Vec::new(),
            entities: HashMap::new(),
            is_quick_win: false,
            suggested_action: "Test action".to_string(),
            matched_keywords: Vec::new(),
        }
    }

    #[test]
    fn test_route_sync_file_operation() {
        let client = Arc::new(McpClient::new());
        let router = ToolRouter::new(client);

        let intent =
            create_test_intent(IntentCategory::FileOperation, vec!["file_read".to_string()]);

        let plan = router.route_sync(&intent).unwrap();

        assert!(!plan.tools.is_empty());
        assert!(plan.tools.iter().any(|t| t.tool_id == "file_read"));
    }

    #[test]
    fn test_route_sync_adds_default_tools() {
        let client = Arc::new(McpClient::new());
        let router = ToolRouter::new(client);

        let intent = create_test_intent(IntentCategory::WebSearch, Vec::new());

        let plan = router.route_sync(&intent).unwrap();

        assert!(plan.tools.iter().any(|t| t.tool_id == "search_web"));
    }

    #[test]
    fn test_parallel_groups_calculation() {
        let client = Arc::new(McpClient::new());
        let router = ToolRouter::new(client);

        let tools = vec![
            ToolSelection::new("tool1", "reason1"),
            ToolSelection::new("tool2", "reason2"),
            ToolSelection::new("tool3", "reason3").with_dependencies(vec!["tool1".to_string()]),
        ];

        let groups = router.calculate_parallel_groups(&tools);

        // First group should have tools without dependencies
        assert!(groups[0].contains(&"tool1".to_string()));
        assert!(groups[0].contains(&"tool2".to_string()));
        // tool3 should be in a separate group
        assert!(groups.iter().any(|g| g.contains(&"tool3".to_string())));
    }

    #[test]
    fn test_estimate_total_time() {
        let client = Arc::new(McpClient::new());
        let router = ToolRouter::new(client);

        let intent =
            create_test_intent(IntentCategory::FileOperation, vec!["file_read".to_string()]);

        let plan = router.route_sync(&intent).unwrap();

        assert!(plan.estimated_time > Duration::ZERO);
    }

    #[test]
    fn test_quick_win_optimization() {
        let client = Arc::new(McpClient::new());
        let router = ToolRouter::new(client);

        let mut intent = create_test_intent(IntentCategory::Conversation, Vec::new());
        intent.prompt = "hello there".to_string();
        intent.complexity = Complexity::QuickWin;
        intent.is_quick_win = true;

        let plan = router.route_sync(&intent).unwrap();

        assert!(plan.is_optimized);
    }
}
