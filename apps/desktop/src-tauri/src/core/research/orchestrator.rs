//! Research orchestrator for coordinating multi-source investigation.
//!
//! The orchestrator manages the entire research process:
//! 1. Query analysis and strategy generation
//! 2. Parallel search agent coordination
//! 3. Result synthesis and deduplication
//! 4. Report generation with citations

use super::agents::{
    CalendarSearchAgent, DocumentSearchAgent, EmailSearchAgent, MemorySearchAgent, SearchAgent,
    SearchAgentResult, SearchResult, WebSearchAgent,
};
use super::citation::{CitationFormat, CitationTracker};
use super::report::{ReportSection, ResearchReport, ResearchReportGenerator};
use super::types::{
    AgentType, ConfidenceLevel, ResearchConfig, ResearchError, ResearchMetadata, ResearchMode,
    ResearchPhase, ResearchProgress, ResearchQuery, ResearchResult, SearchStrategy, TimeConstraint,
};
use crate::core::llm::LLMRouter;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::Emitter;
use tokio::sync::RwLock;

/// A research session tracks the state of an ongoing research operation.
#[derive(Debug)]
pub struct ResearchSession {
    /// Unique session ID
    pub id: String,

    /// The research query
    pub query: ResearchQuery,

    /// Current progress
    pub progress: ResearchProgress,

    /// Collected search results
    pub results: Vec<SearchResult>,

    /// Citation tracker
    pub citation_tracker: CitationTracker,

    /// Start time
    pub started_at: Instant,

    /// Cancellation flag
    pub cancelled: Arc<AtomicBool>,
}

impl ResearchSession {
    /// Creates a new research session.
    pub fn new(query: ResearchQuery) -> Self {
        let session_id = format!(
            "research_{}",
            uuid::Uuid::new_v4()
                .to_string()
                .split('-')
                .next()
                .unwrap_or("x")
        );
        let total_iterations = query.mode.max_iterations();

        Self {
            id: session_id.clone(),
            query,
            progress: ResearchProgress::new(&session_id, total_iterations),
            results: Vec::new(),
            citation_tracker: CitationTracker::new(CitationFormat::Numbered),
            started_at: Instant::now(),
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Checks if the session has been cancelled.
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    /// Cancels the session.
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    /// Updates the progress phase.
    pub fn set_phase(&mut self, phase: ResearchPhase) {
        self.progress.phase = phase;
        self.progress.elapsed_secs = self.started_at.elapsed().as_secs();
    }

    /// Updates the progress message.
    pub fn set_status(&mut self, message: &str) {
        self.progress.status_message = message.to_string();
        self.progress.elapsed_secs = self.started_at.elapsed().as_secs();
    }

    /// Updates progress percentage.
    pub fn set_progress(&mut self, percent: u8) {
        self.progress.progress_percent = percent.min(100);
    }
}

/// The research orchestrator coordinates the entire research process.
pub struct ResearchOrchestrator {
    /// LLM router for AI-powered analysis and synthesis
    router: Arc<RwLock<LLMRouter>>,

    /// Research configuration
    config: ResearchConfig,

    /// Available search agents
    agents: HashMap<AgentType, Box<dyn SearchAgent>>,

    /// Optional app handle for emitting progress events
    app_handle: Option<tauri::AppHandle>,
}

impl ResearchOrchestrator {
    /// Creates a new research orchestrator.
    pub fn new(
        router: Arc<RwLock<LLMRouter>>,
        config: ResearchConfig,
    ) -> Result<Self, ResearchError> {
        let mut agents: HashMap<AgentType, Box<dyn SearchAgent>> = HashMap::new();

        // Initialize available agents based on config
        if config.enable_web_search {
            agents.insert(AgentType::WebSearch, Box::new(WebSearchAgent::new()));
        }

        if config.enable_document_search {
            agents.insert(
                AgentType::DocumentSearch,
                Box::new(DocumentSearchAgent::new()),
            );
        }

        if config.enable_email_search {
            agents.insert(AgentType::EmailSearch, Box::new(EmailSearchAgent::new()));
        }

        if config.enable_calendar_search {
            agents.insert(
                AgentType::CalendarSearch,
                Box::new(CalendarSearchAgent::new()),
            );
        }

        if config.enable_memory_search {
            agents.insert(AgentType::MemorySearch, Box::new(MemorySearchAgent::new()));
        }

        Ok(Self {
            router,
            config,
            agents,
            app_handle: None,
        })
    }

    /// Sets the Tauri app handle for emitting progress events.
    pub fn with_app_handle(mut self, handle: tauri::AppHandle) -> Self {
        self.app_handle = Some(handle);
        self
    }

    /// Adds or replaces a search agent.
    pub fn add_agent(&mut self, agent_type: AgentType, agent: Box<dyn SearchAgent>) {
        self.agents.insert(agent_type, agent);
    }

    /// Performs research on the given query.
    pub async fn research(
        &self,
        query: &str,
        mode: ResearchMode,
    ) -> Result<ResearchResult, ResearchError> {
        if query.trim().is_empty() {
            return Err(ResearchError::InvalidQuery);
        }

        // Create research session
        let research_query = ResearchQuery::new(query, mode);
        let mut session = ResearchSession::new(research_query);

        // Emit initial progress
        self.emit_progress(&session.progress);

        // Phase 1: Analyze query and generate strategies
        session.set_phase(ResearchPhase::AnalyzingQuery);
        session.set_status("Analyzing research query...");
        session.set_progress(5);
        self.emit_progress(&session.progress);

        let analyzed_query = self.analyze_query(&session.query).await?;
        session.query = analyzed_query;

        if session.is_cancelled() {
            return self.handle_cancellation(&mut session);
        }

        // Phase 2: Execute search strategies
        session.set_phase(ResearchPhase::Searching);
        session.set_progress(10);

        let max_iterations = session.query.mode.max_iterations();
        let mut all_results: Vec<SearchResult> = Vec::new();

        for iteration in 0..max_iterations {
            if session.is_cancelled() {
                return self.handle_cancellation(&mut session);
            }

            // Check timeout
            if session.started_at.elapsed() > session.query.mode.timeout() {
                session.set_phase(ResearchPhase::CollectingResults);
                tracing::warn!(
                    "Research timeout reached at iteration {}/{}",
                    iteration + 1,
                    max_iterations
                );
                break;
            }

            session.set_status(&format!(
                "Searching iteration {}/{}...",
                iteration + 1,
                max_iterations
            ));
            session.progress.iterations_completed = iteration;
            let progress_base = 10 + (iteration * 60 / max_iterations) as u8;
            session.set_progress(progress_base);
            self.emit_progress(&session.progress);

            // Execute strategies for this iteration
            let iteration_results = self
                .execute_iteration(&session.query, iteration, session.query.mode)
                .await?;

            // Track active agents
            session.progress.active_agents = iteration_results
                .iter()
                .filter(|r| !r.results.is_empty())
                .map(|r| r.agent_type.as_str().to_string())
                .collect();

            // Collect results
            for agent_result in iteration_results {
                all_results.extend(agent_result.results);
            }

            session.progress.sources_found = all_results.len();
            self.emit_progress(&session.progress);

            // If we have enough results for quick mode, stop early
            if mode == ResearchMode::Quick && all_results.len() >= 10 {
                break;
            }
        }

        if session.is_cancelled() {
            return self.handle_cancellation(&mut session);
        }

        // Phase 3: Collect and deduplicate results
        session.set_phase(ResearchPhase::CollectingResults);
        session.set_status("Collecting and organizing results...");
        session.set_progress(70);
        self.emit_progress(&session.progress);

        let deduplicated = self.deduplicate_results(all_results);
        session.results = deduplicated;

        // Phase 4: Synthesize findings
        session.set_phase(ResearchPhase::Synthesizing);
        session.set_status("Synthesizing research findings...");
        session.set_progress(80);
        self.emit_progress(&session.progress);

        let synthesis = self
            .synthesize_findings(&session.query, &session.results)
            .await?;

        if session.is_cancelled() {
            return self.handle_cancellation(&mut session);
        }

        // Phase 5: Generate report
        session.set_phase(ResearchPhase::GeneratingReport);
        session.set_status("Generating research report...");
        session.set_progress(90);
        self.emit_progress(&session.progress);

        let report = self.generate_report(&session, synthesis).await?;

        // Complete
        session.set_phase(ResearchPhase::Complete);
        session.set_status("Research complete");
        session.set_progress(100);
        self.emit_progress(&session.progress);

        // Build result
        let result = ResearchResult {
            session_id: session.id.clone(),
            query: session.query.original_query.clone(),
            mode: session.query.mode,
            report: report.render(self.config.show_confidence_indicators),
            summary: report.summary.clone(),
            key_findings: report.key_findings.clone(),
            citations: report.citations.clone(),
            confidence: report.overall_confidence,
            metadata: ResearchMetadata {
                duration_secs: report.metadata.research_duration_secs,
                iterations: report.metadata.iterations,
                sources_examined: report.metadata.sources_examined,
                sources_cited: report.citations.len(),
                sources_by_type: report.metadata.sources_by_type.clone(),
                agents_used: session.progress.active_agents.clone(),
                tokens_used: None,
                warnings: Vec::new(),
            },
            completed_at: chrono::Utc::now().timestamp(),
        };

        // Emit completion event
        self.emit_research_complete(&result);

        Ok(result)
    }

    /// Analyzes the query using LLM to extract topics, constraints, and strategies.
    async fn analyze_query(&self, query: &ResearchQuery) -> Result<ResearchQuery, ResearchError> {
        let prompt = format!(
            r#"Analyze this research query and extract key information for search strategies.

Query: "{}"

Respond in JSON format:
{{
    "refined_query": "A clearer, more searchable version of the query",
    "topics": ["topic1", "topic2", ...],
    "related_terms": ["term1", "term2", ...],
    "constraints": ["any mentioned constraints or requirements"],
    "time_constraint": null or {{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "description": "..." }},
    "strategies": [
        {{
            "description": "What this strategy searches for",
            "agent_type": "web_search" | "document_search" | "email_search" | "calendar_search" | "memory_search",
            "search_terms": ["term1", "term2"],
            "priority": 1-10,
            "expected_relevance": 0.0-1.0
        }}
    ]
}}

Generate 3-5 diverse search strategies covering different angles of the query."#,
            query.original_query
        );

        let router = self.router.read().await;
        let response = router
            .send_message(&prompt, None)
            .await
            .map_err(|e| ResearchError::LlmError(e.to_string()))?;

        // Parse the response
        let json_str = extract_json_from_response(&response);
        let parsed: serde_json::Value =
            serde_json::from_str(&json_str).map_err(|e| ResearchError::LlmError(e.to_string()))?;

        let mut analyzed = query.clone();

        if let Some(refined) = parsed["refined_query"].as_str() {
            analyzed.refined_query = refined.to_string();
        }

        if let Some(topics) = parsed["topics"].as_array() {
            analyzed.topics = topics
                .iter()
                .filter_map(|t| t.as_str().map(|s| s.to_string()))
                .collect();
        }

        if let Some(terms) = parsed["related_terms"].as_array() {
            analyzed.related_terms = terms
                .iter()
                .filter_map(|t| t.as_str().map(|s| s.to_string()))
                .collect();
        }

        if let Some(constraints) = parsed["constraints"].as_array() {
            analyzed.constraints = constraints
                .iter()
                .filter_map(|c| c.as_str().map(|s| s.to_string()))
                .collect();
        }

        // Parse time constraint
        if let Some(tc) = parsed.get("time_constraint") {
            if !tc.is_null() {
                analyzed.time_constraints = Some(TimeConstraint {
                    from: tc["from"]
                        .as_str()
                        .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
                        .map(|d| {
                            d.and_hms_opt(0, 0, 0)
                                .map(|dt| dt.and_utc().timestamp())
                                .unwrap_or(0)
                        }),
                    to: tc["to"]
                        .as_str()
                        .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
                        .map(|d| {
                            d.and_hms_opt(23, 59, 59)
                                .map(|dt| dt.and_utc().timestamp())
                                .unwrap_or(0)
                        }),
                    description: tc["description"].as_str().unwrap_or("").to_string(),
                });
            }
        }

        // Parse strategies
        if let Some(strategies) = parsed["strategies"].as_array() {
            for (idx, s) in strategies.iter().enumerate() {
                let agent_type = match s["agent_type"].as_str().unwrap_or("web_search") {
                    "web_search" => AgentType::WebSearch,
                    "document_search" => AgentType::DocumentSearch,
                    "email_search" => AgentType::EmailSearch,
                    "calendar_search" => AgentType::CalendarSearch,
                    "memory_search" => AgentType::MemorySearch,
                    _ => AgentType::WebSearch,
                };

                let search_terms: Vec<String> = s["search_terms"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|t| t.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_else(|| vec![query.original_query.clone()]);

                analyzed.strategies.push(SearchStrategy {
                    id: format!("strategy_{}", idx),
                    description: s["description"].as_str().unwrap_or("Search").to_string(),
                    agent_type,
                    search_terms,
                    priority: s["priority"].as_u64().unwrap_or(5) as u8,
                    expected_relevance: s["expected_relevance"].as_f64().unwrap_or(0.5) as f32,
                });
            }
        }

        // Ensure we have at least one strategy
        if analyzed.strategies.is_empty() {
            analyzed.strategies.push(SearchStrategy {
                id: "fallback_strategy".to_string(),
                description: "General web search".to_string(),
                agent_type: AgentType::WebSearch,
                search_terms: vec![query.original_query.clone()],
                priority: 5,
                expected_relevance: 0.5,
            });
        }

        Ok(analyzed)
    }

    /// Executes one iteration of search across all relevant agents.
    async fn execute_iteration(
        &self,
        query: &ResearchQuery,
        iteration: usize,
        mode: ResearchMode,
    ) -> Result<Vec<SearchAgentResult>, ResearchError> {
        let mut results = Vec::new();
        let max_results_per_agent = mode.max_sources_per_agent();

        // Get strategies for this iteration
        // Later iterations may use different or refined strategies
        let strategies = if iteration == 0 {
            query.strategies.clone()
        } else {
            // For subsequent iterations, we could generate follow-up strategies
            // For now, reuse with slight modifications
            query
                .strategies
                .iter()
                .map(|s| {
                    let mut modified = s.clone();
                    modified.id = format!("{}_{}", s.id, iteration);
                    // Add iteration-specific terms from related_terms
                    if iteration < query.related_terms.len() {
                        modified
                            .search_terms
                            .push(query.related_terms[iteration].clone());
                    }
                    modified
                })
                .collect()
        };

        // Execute strategies in parallel using agent type
        let mut agent_futures = Vec::new();

        for strategy in &strategies {
            if let Some(agent) = self.agents.get(&strategy.agent_type) {
                if agent.is_available() {
                    let strategy_clone = strategy.clone();
                    let time_constraint = query.time_constraints.clone();
                    let max_results = max_results_per_agent;

                    // We need to call the agent - this requires careful handling
                    // For now, execute sequentially to avoid lifetime issues
                    agent_futures.push((agent, strategy_clone, time_constraint, max_results));
                }
            }
        }

        // Execute each agent
        for (agent, strategy, time_constraint, max_results) in agent_futures {
            match agent
                .search(&strategy, time_constraint.as_ref(), max_results)
                .await
            {
                Ok(result) => results.push(result),
                Err(e) => {
                    tracing::warn!("Agent {} failed: {}", strategy.agent_type.as_str(), e);
                    results.push(SearchAgentResult::failed(
                        strategy.agent_type,
                        &e.to_string(),
                    ));
                }
            }
        }

        if results.iter().all(|r| r.error.is_some()) && !results.is_empty() {
            return Err(ResearchError::AllAgentsFailed(
                "All search agents failed".into(),
            ));
        }

        Ok(results)
    }

    /// Deduplicates search results based on URL and content similarity.
    fn deduplicate_results(&self, results: Vec<SearchResult>) -> Vec<SearchResult> {
        let mut seen_urls: HashMap<String, usize> = HashMap::new();
        let mut seen_titles: HashMap<String, usize> = HashMap::new();
        let mut deduplicated: Vec<SearchResult> = Vec::new();

        for result in results {
            // Check URL-based duplicate
            if let Some(url) = &result.url {
                if let Some(&existing_idx) = seen_urls.get(url) {
                    // Update relevance if higher
                    if result.relevance > deduplicated[existing_idx].relevance {
                        deduplicated[existing_idx].relevance = result.relevance;
                    }
                    continue;
                }
                seen_urls.insert(url.clone(), deduplicated.len());
            }

            // Check title-based duplicate (fuzzy)
            let normalized_title = result.title.to_lowercase();
            if let Some(&existing_idx) = seen_titles.get(&normalized_title) {
                if result.relevance > deduplicated[existing_idx].relevance {
                    deduplicated[existing_idx].relevance = result.relevance;
                }
                continue;
            }
            seen_titles.insert(normalized_title, deduplicated.len());

            deduplicated.push(result);
        }

        // Sort by relevance
        deduplicated.sort_by(|a, b| {
            b.relevance
                .partial_cmp(&a.relevance)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        deduplicated
    }

    /// Synthesizes findings using LLM to create a coherent narrative.
    async fn synthesize_findings(
        &self,
        query: &ResearchQuery,
        results: &[SearchResult],
    ) -> Result<SynthesisResult, ResearchError> {
        if results.is_empty() {
            return Ok(SynthesisResult {
                summary: "No relevant sources were found for this query.".to_string(),
                key_findings: vec!["Unable to find relevant information".to_string()],
                sections: vec![],
                overall_confidence: ConfidenceLevel::VeryLow,
            });
        }

        // Prepare context for LLM
        let sources_context: String = results
            .iter()
            .take(20) // Limit context size
            .enumerate()
            .map(|(idx, r)| {
                format!(
                    "[Source {}] Title: {}\nContent: {}\nRelevance: {:.2}\n",
                    idx + 1,
                    r.title,
                    truncate_content(&r.content, 500),
                    r.relevance
                )
            })
            .collect::<Vec<_>>()
            .join("\n---\n");

        let prompt = format!(
            r#"You are AGI Workforce's research synthesizer. Compile the research findings into a clear, comprehensive report for the user.

Original Query: "{}"
Refined Query: "{}"
Topics: {:?}

SOURCES:
{}

Create a research synthesis with the following JSON structure:
{{
    "summary": "A 2-3 sentence executive summary of the findings",
    "key_findings": ["finding 1", "finding 2", "finding 3", "finding 4", "finding 5"],
    "sections": [
        {{
            "heading": "Section Title",
            "content": "Section content with inline citations like [Source 1], [Source 2]",
            "confidence": "very_low" | "low" | "medium" | "high" | "very_high"
        }}
    ],
    "overall_confidence": "medium"
}}

Create 3-5 well-structured sections covering different aspects of the query.
Use [Source N] citations to reference the provided sources.
Be objective and note any conflicting information or gaps in the research."#,
            query.original_query, query.refined_query, query.topics, sources_context
        );

        let router = self.router.read().await;
        let response = router
            .send_message(&prompt, None)
            .await
            .map_err(|e| ResearchError::LlmError(e.to_string()))?;

        // Parse response
        let json_str = extract_json_from_response(&response);
        let parsed: serde_json::Value = serde_json::from_str(&json_str).map_err(|e| {
            tracing::warn!("Failed to parse synthesis response: {}", e);
            ResearchError::LlmError(format!("Failed to parse synthesis: {}", e))
        })?;

        let summary = parsed["summary"]
            .as_str()
            .unwrap_or("Research synthesis completed.")
            .to_string();

        let key_findings: Vec<String> = parsed["key_findings"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|f| f.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        let sections: Vec<SynthesisSection> = parsed["sections"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|s| {
                        Some(SynthesisSection {
                            heading: s["heading"].as_str()?.to_string(),
                            content: s["content"].as_str()?.to_string(),
                            confidence: parse_confidence(s["confidence"].as_str()),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let overall_confidence = parse_confidence(parsed["overall_confidence"].as_str());

        Ok(SynthesisResult {
            summary,
            key_findings,
            sections,
            overall_confidence,
        })
    }

    /// Generates the final research report.
    async fn generate_report(
        &self,
        session: &ResearchSession,
        synthesis: SynthesisResult,
    ) -> Result<ResearchReport, ResearchError> {
        let mut generator =
            ResearchReportGenerator::new(&session.query.original_query, session.query.mode)
                .with_summary(&synthesis.summary)
                .with_key_findings(synthesis.key_findings)
                .with_confidence(synthesis.overall_confidence)
                .show_confidence_indicators(self.config.show_confidence_indicators)
                .with_duration(session.started_at.elapsed().as_secs())
                .with_sources_examined(session.results.len())
                .with_iterations(session.progress.iterations_completed);

        // Add citations from search results
        for (idx, result) in session.results.iter().enumerate() {
            let citation = result.to_citation(idx + 1);
            generator.add_citation(citation);
        }

        // Convert synthesis sections to report sections
        for (idx, section) in synthesis.sections.into_iter().enumerate() {
            let report_section = ReportSection::new(
                &format!("section_{}", idx),
                &section.heading,
                &section.content,
            )
            .with_confidence(section.confidence)
            .with_order(idx);

            generator.add_section(report_section);
        }

        // Calculate sources by type
        let mut sources_by_type: HashMap<String, usize> = HashMap::new();
        for result in &session.results {
            *sources_by_type
                .entry(result.source_type.as_str().to_string())
                .or_insert(0) += 1;
        }
        let generator = generator.with_sources_by_type(sources_by_type);

        generator.build()
    }

    /// Handles cancellation of a research session.
    fn handle_cancellation(
        &self,
        session: &mut ResearchSession,
    ) -> Result<ResearchResult, ResearchError> {
        session.set_phase(ResearchPhase::Cancelled);
        session.set_status("Research cancelled");
        session.progress.cancelled = true;
        self.emit_progress(&session.progress);

        // Return partial results if any
        Ok(ResearchResult {
            session_id: session.id.clone(),
            query: session.query.original_query.clone(),
            mode: session.query.mode,
            report: "Research was cancelled before completion.".to_string(),
            summary: "Research cancelled".to_string(),
            key_findings: Vec::new(),
            citations: Vec::new(),
            confidence: ConfidenceLevel::VeryLow,
            metadata: ResearchMetadata {
                duration_secs: session.started_at.elapsed().as_secs(),
                iterations: session.progress.iterations_completed,
                sources_examined: session.results.len(),
                sources_cited: 0,
                sources_by_type: HashMap::new(),
                agents_used: session.progress.active_agents.clone(),
                tokens_used: None,
                warnings: vec!["Research was cancelled".to_string()],
            },
            completed_at: chrono::Utc::now().timestamp(),
        })
    }

    /// Emits a progress event to the frontend.
    fn emit_progress(&self, progress: &ResearchProgress) {
        if let Some(ref app) = self.app_handle {
            let _ = app.emit(
                "research:progress",
                serde_json::to_value(progress).unwrap_or_default(),
            );
        }
    }

    /// Emits a research completion event.
    fn emit_research_complete(&self, result: &ResearchResult) {
        if let Some(ref app) = self.app_handle {
            let _ = app.emit(
                "research:complete",
                serde_json::json!({
                    "session_id": result.session_id,
                    "query": result.query,
                    "confidence": format!("{:?}", result.confidence),
                    "sources_count": result.citations.len(),
                    "duration_secs": result.metadata.duration_secs,
                }),
            );
        }
    }

    /// Cancels an ongoing research session by ID.
    pub fn cancel_session(&self, _session_id: &str) -> bool {
        // In a full implementation, we would track active sessions
        // and signal cancellation
        true
    }
}

/// Internal synthesis result.
struct SynthesisResult {
    summary: String,
    key_findings: Vec<String>,
    sections: Vec<SynthesisSection>,
    overall_confidence: ConfidenceLevel,
}

/// A section from the synthesis.
struct SynthesisSection {
    heading: String,
    content: String,
    confidence: ConfidenceLevel,
}

/// Extracts JSON from a potentially markdown-wrapped response.
fn extract_json_from_response(content: &str) -> String {
    // Try to find JSON in code blocks
    if let Some(start) = content.find("```json") {
        if let Some(end) = content[start + 7..].find("```") {
            return content[start + 7..start + 7 + end].trim().to_string();
        }
    }

    // Try to find JSON in generic code blocks
    if let Some(start) = content.find("```") {
        if let Some(end) = content[start + 3..].find("```") {
            let block = content[start + 3..start + 3 + end].trim();
            if block.starts_with('{') {
                return block.to_string();
            }
        }
    }

    // Try to find raw JSON
    if let Some(start) = content.find('{') {
        if let Some(end) = content.rfind('}') {
            return content[start..=end].to_string();
        }
    }

    content.to_string()
}

/// Parses a confidence level from a string.
fn parse_confidence(s: Option<&str>) -> ConfidenceLevel {
    match s {
        Some("very_low") => ConfidenceLevel::VeryLow,
        Some("low") => ConfidenceLevel::Low,
        Some("medium") => ConfidenceLevel::Medium,
        Some("high") => ConfidenceLevel::High,
        Some("very_high") => ConfidenceLevel::VeryHigh,
        _ => ConfidenceLevel::Medium,
    }
}

/// Truncates content to a maximum length.
fn truncate_content(content: &str, max_len: usize) -> String {
    if content.len() <= max_len {
        content.to_string()
    } else {
        format!("{}...", &content[..max_len.saturating_sub(3)])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_json_from_response() {
        let response = r#"Here is the analysis:

```json
{"key": "value"}
```

That's the result."#;

        let json = extract_json_from_response(response);
        assert_eq!(json, r#"{"key": "value"}"#);
    }

    #[test]
    fn test_parse_confidence() {
        assert_eq!(parse_confidence(Some("high")), ConfidenceLevel::High);
        assert_eq!(parse_confidence(Some("low")), ConfidenceLevel::Low);
        assert_eq!(parse_confidence(None), ConfidenceLevel::Medium);
    }

    #[test]
    fn test_truncate_content() {
        assert_eq!(truncate_content("short", 10), "short");
        assert_eq!(truncate_content("this is a long string", 10), "this is...");
    }

    #[test]
    fn test_research_session_creation() {
        let query = ResearchQuery::new("test query", ResearchMode::Quick);
        let session = ResearchSession::new(query);

        assert!(!session.is_cancelled());
        assert_eq!(session.progress.phase, ResearchPhase::Initializing);
    }

    #[test]
    fn test_session_cancellation() {
        let query = ResearchQuery::new("test query", ResearchMode::Quick);
        let session = ResearchSession::new(query);

        session.cancel();
        assert!(session.is_cancelled());
    }
}
