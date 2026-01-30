//! Tests for the Research Mode module.

use super::*;

mod types_tests {
    use super::types::*;

    #[test]
    fn test_research_mode_duration_ranges() {
        let quick = ResearchMode::Quick;
        let (min, max) = quick.duration_range();
        assert!(min < max);
        assert_eq!(quick.max_iterations(), 1);

        let deep = ResearchMode::Deep;
        let (min_deep, max_deep) = deep.duration_range();
        assert!(min_deep > min);
        assert!(max_deep > max);
        assert!(deep.max_iterations() > quick.max_iterations());
    }

    #[test]
    fn test_research_mode_default() {
        let mode = ResearchMode::default();
        assert_eq!(mode, ResearchMode::Standard);
    }

    #[test]
    fn test_confidence_level_scores() {
        assert!(ConfidenceLevel::VeryHigh.score() > ConfidenceLevel::High.score());
        assert!(ConfidenceLevel::High.score() > ConfidenceLevel::Medium.score());
        assert!(ConfidenceLevel::Medium.score() > ConfidenceLevel::Low.score());
        assert!(ConfidenceLevel::Low.score() > ConfidenceLevel::VeryLow.score());
    }

    #[test]
    fn test_confidence_from_score() {
        assert_eq!(ConfidenceLevel::from_score(0.95), ConfidenceLevel::VeryHigh);
        assert_eq!(ConfidenceLevel::from_score(0.75), ConfidenceLevel::High);
        assert_eq!(ConfidenceLevel::from_score(0.55), ConfidenceLevel::Medium);
        assert_eq!(ConfidenceLevel::from_score(0.35), ConfidenceLevel::Low);
        assert_eq!(ConfidenceLevel::from_score(0.15), ConfidenceLevel::VeryLow);
    }

    #[test]
    fn test_research_config_default() {
        let config = ResearchConfig::default();
        assert!(config.enable_web_search);
        assert!(config.enable_document_search);
        assert!(config.enable_memory_search);
        assert!(config.min_confidence_threshold > 0.0);
    }

    #[test]
    fn test_research_query_new() {
        let query = ResearchQuery::new("What is Rust?", ResearchMode::Deep);
        assert_eq!(query.original_query, "What is Rust?");
        assert_eq!(query.mode, ResearchMode::Deep);
        assert!(query.strategies.is_empty());
    }

    #[test]
    fn test_research_progress_new() {
        let progress = ResearchProgress::new("test_session", 5);
        assert_eq!(progress.session_id, "test_session");
        assert_eq!(progress.total_iterations, 5);
        assert_eq!(progress.progress_percent, 0);
        assert!(!progress.cancelled);
    }

    #[test]
    fn test_agent_type_strings() {
        assert_eq!(AgentType::WebSearch.as_str(), "web_search");
        assert_eq!(AgentType::DocumentSearch.as_str(), "document_search");
        assert_eq!(AgentType::EmailSearch.as_str(), "email_search");
        assert_eq!(AgentType::CalendarSearch.as_str(), "calendar_search");
        assert_eq!(AgentType::MemorySearch.as_str(), "memory_search");
    }

    #[test]
    fn test_research_phase_strings() {
        assert_eq!(ResearchPhase::Initializing.as_str(), "initializing");
        assert_eq!(ResearchPhase::Searching.as_str(), "searching");
        assert_eq!(ResearchPhase::Complete.as_str(), "complete");
    }
}

mod citation_tests {
    use super::citation::*;

    #[test]
    fn test_source_type_strings() {
        assert_eq!(SourceType::WebPage.as_str(), "Web Page");
        assert_eq!(SourceType::Document.as_str(), "Document");
        assert_eq!(SourceType::Email.as_str(), "Email");
    }

    #[test]
    fn test_source_type_prefixes() {
        assert_eq!(SourceType::WebPage.prefix(), "web");
        assert_eq!(SourceType::Document.prefix(), "doc");
        assert_eq!(SourceType::Memory.prefix(), "mem");
    }

    #[test]
    fn test_citation_builder() {
        let citation = Citation::new("test_1", 1, SourceType::WebPage, "Test Title", 0.9)
            .with_url("https://example.com")
            .with_author("John Doe")
            .with_date("2024-01-15")
            .with_organization("Example Corp")
            .with_description("A test citation")
            .with_excerpt("Some excerpt text");

        assert_eq!(citation.title, "Test Title");
        assert_eq!(citation.url, Some("https://example.com".to_string()));
        assert_eq!(citation.author, Some("John Doe".to_string()));
        assert_eq!(citation.date, Some("2024-01-15".to_string()));
        assert_eq!(citation.organization, Some("Example Corp".to_string()));
    }

    #[test]
    fn test_citation_render_marker() {
        let citation = Citation::new("test_1", 5, SourceType::WebPage, "Test", 0.8);

        assert_eq!(citation.render_marker(CitationFormat::Numbered), "[5]");
        assert_eq!(citation.render_marker(CitationFormat::Footnote), "^5");
    }

    #[test]
    fn test_citation_tracker_basic() {
        let mut tracker = CitationTracker::new(CitationFormat::Numbered);

        let c1 = Citation::new("", 0, SourceType::WebPage, "Article One", 0.9);
        let c2 = Citation::new("", 0, SourceType::Document, "Document Two", 0.8);

        let marker1 = tracker.add_citation(c1);
        let marker2 = tracker.add_citation(c2);

        assert_eq!(marker1, "[1]");
        assert_eq!(marker2, "[2]");
        assert_eq!(tracker.count(), 2);
    }

    #[test]
    fn test_citation_tracker_url_dedup() {
        let mut tracker = CitationTracker::new(CitationFormat::Numbered);

        let c1 = Citation::new("", 0, SourceType::WebPage, "Article", 0.8)
            .with_url("https://example.com/page");
        let c2 = Citation::new("", 0, SourceType::WebPage, "Same Article", 0.9)
            .with_url("https://example.com/page");

        let marker1 = tracker.add_citation(c1);
        let marker2 = tracker.add_citation(c2);

        // Should deduplicate based on URL
        assert_eq!(marker1, marker2);
        assert_eq!(tracker.count(), 1);
    }

    #[test]
    fn test_citation_tracker_title_dedup() {
        let mut tracker = CitationTracker::new(CitationFormat::Numbered);

        let c1 = Citation::new("", 0, SourceType::WebPage, "Test Article Title", 0.7);
        let c2 = Citation::new("", 0, SourceType::WebPage, "test article title", 0.8);

        let marker1 = tracker.add_citation(c1);
        let marker2 = tracker.add_citation(c2);

        // Should deduplicate based on normalized title
        assert_eq!(marker1, marker2);
        assert_eq!(tracker.count(), 1);
    }

    #[test]
    fn test_citation_tracker_by_source_type() {
        let mut tracker = CitationTracker::new(CitationFormat::Numbered);

        tracker.add_citation(Citation::new("", 0, SourceType::WebPage, "Web 1", 0.9));
        tracker.add_citation(Citation::new("", 0, SourceType::WebPage, "Web 2", 0.8));
        tracker.add_citation(Citation::new("", 0, SourceType::Document, "Doc 1", 0.7));

        let web_citations = tracker.by_source_type(SourceType::WebPage);
        let doc_citations = tracker.by_source_type(SourceType::Document);

        assert_eq!(web_citations.len(), 2);
        assert_eq!(doc_citations.len(), 1);
    }

    #[test]
    fn test_citation_tracker_reference_list() {
        let mut tracker = CitationTracker::new(CitationFormat::Numbered);

        tracker.add_citation(
            Citation::new("", 0, SourceType::WebPage, "Test Article", 0.9)
                .with_url("https://example.com")
                .with_author("John Doe"),
        );

        let ref_list = tracker.generate_reference_list();
        assert!(ref_list.contains("## Sources"));
        assert!(ref_list.contains("Test Article"));
        assert!(ref_list.contains("example.com"));
    }
}

mod agents_tests {
    use super::agents::*;
    use super::types::*;

    #[test]
    fn test_search_agent_result_empty() {
        let result = SearchAgentResult::empty(AgentType::WebSearch);
        assert!(result.results.is_empty());
        assert!(result.complete);
        assert!(result.error.is_none());
    }

    #[test]
    fn test_search_agent_result_failed() {
        let result = SearchAgentResult::failed(AgentType::EmailSearch, "Connection failed");
        assert!(result.results.is_empty());
        assert!(!result.complete);
        assert_eq!(result.error, Some("Connection failed".to_string()));
    }

    #[test]
    fn test_search_result_to_citation() {
        use std::collections::HashMap;

        let result = SearchResult {
            id: "test_1".into(),
            title: "Test Article".into(),
            content: "This is a test article about Rust programming.".into(),
            full_content: None,
            url: Some("https://rust-lang.org".into()),
            source_type: super::citation::SourceType::WebPage,
            relevance: 0.85,
            timestamp: Some(1704067200),
            author: Some("Mozilla".into()),
            metadata: HashMap::new(),
        };

        let citation = result.to_citation(1);

        assert_eq!(citation.title, "Test Article");
        assert_eq!(citation.number, 1);
        assert_eq!(citation.relevance_score, 0.85);
        assert_eq!(citation.url, Some("https://rust-lang.org".into()));
        assert_eq!(citation.author, Some("Mozilla".into()));
    }

    #[test]
    fn test_web_search_agent_availability() {
        let agent = WebSearchAgent::new();
        assert!(agent.is_available()); // Always available, even if not configured
        assert_eq!(agent.name(), "Web Search");
        assert_eq!(agent.agent_type(), AgentType::WebSearch);
    }

    #[test]
    fn test_document_search_agent() {
        let agent = DocumentSearchAgent::new();
        assert!(!agent.is_available()); // No paths configured

        let agent_with_path = DocumentSearchAgent::new().add_path(std::path::PathBuf::from("/tmp"));
        assert!(agent_with_path.is_available());
        assert_eq!(agent_with_path.name(), "Document Search");
    }

    #[test]
    fn test_email_search_agent() {
        let agent = EmailSearchAgent::new();
        assert!(!agent.is_available()); // Not connected by default

        let connected_agent = EmailSearchAgent::new().set_connected(true);
        assert!(connected_agent.is_available());
    }

    #[test]
    fn test_calendar_search_agent() {
        let agent = CalendarSearchAgent::new();
        assert!(!agent.is_available()); // Not connected by default

        let connected_agent = CalendarSearchAgent::new().set_connected(true);
        assert!(connected_agent.is_available());
    }

    #[test]
    fn test_memory_search_agent() {
        let agent = MemorySearchAgent::new();
        assert!(agent.is_available()); // Available by default
        assert_eq!(agent.name(), "Memory Search");
    }
}

mod report_tests {
    use super::report::*;
    use super::types::*;

    #[test]
    fn test_report_section_basic() {
        let section = ReportSection::new("sec1", "Introduction", "This is the intro.")
            .with_confidence(ConfidenceLevel::High)
            .with_order(0);

        assert_eq!(section.heading, "Introduction");
        assert_eq!(section.confidence, ConfidenceLevel::High);
        assert_eq!(section.order, 0);
    }

    #[test]
    fn test_report_section_render() {
        let section = ReportSection::new("sec1", "Test Section", "Test content here.")
            .with_confidence(ConfidenceLevel::Medium);

        let rendered = section.render(2, true);
        assert!(rendered.contains("## Test Section"));
        assert!(rendered.contains("[=]")); // Medium confidence indicator
        assert!(rendered.contains("Test content here."));
    }

    #[test]
    fn test_report_section_nested() {
        let mut parent = ReportSection::new("parent", "Parent Section", "Parent content");
        parent.add_subsection(ReportSection::new(
            "child",
            "Child Section",
            "Child content",
        ));

        let rendered = parent.render(2, false);
        assert!(rendered.contains("## Parent Section"));
        assert!(rendered.contains("### Child Section"));
    }

    #[test]
    fn test_report_generator_basic() {
        let report = ResearchReportGenerator::new("Test query", ResearchMode::Quick)
            .with_title("Test Report")
            .with_summary("This is a test summary.")
            .with_key_findings(vec!["Finding 1".into(), "Finding 2".into()])
            .with_confidence(ConfidenceLevel::High)
            .with_duration(120)
            .with_sources_examined(10)
            .build()
            .unwrap();

        assert_eq!(report.title, "Test Report");
        assert_eq!(report.key_findings.len(), 2);
        assert_eq!(report.overall_confidence, ConfidenceLevel::High);
        assert_eq!(report.metadata.research_duration_secs, 120);
    }

    #[test]
    fn test_report_generator_with_sections() {
        let mut generator = ResearchReportGenerator::new("Query", ResearchMode::Standard)
            .with_summary("Summary text");

        generator.add_section(ReportSection::new("sec1", "Section 1", "Content 1").with_order(0));
        generator.add_section(ReportSection::new("sec2", "Section 2", "Content 2").with_order(1));

        let report = generator.build().unwrap();
        assert_eq!(report.sections.len(), 2);
        assert_eq!(report.sections[0].heading, "Section 1");
        assert_eq!(report.sections[1].heading, "Section 2");
    }

    #[test]
    fn test_report_render_markdown() {
        let markdown = ResearchReportGenerator::new("What is Rust?", ResearchMode::Quick)
            .with_summary("Rust is a systems programming language.")
            .with_key_findings(vec!["Memory safe".into()])
            .build_markdown()
            .unwrap();

        assert!(markdown.contains("# Research: What is Rust?"));
        assert!(markdown.contains("## Summary"));
        assert!(markdown.contains("Rust is a systems programming language."));
        assert!(markdown.contains("## Key Findings"));
        assert!(markdown.contains("- Memory safe"));
        assert!(markdown.contains("## Sources"));
    }
}

mod orchestrator_tests {
    use super::orchestrator::*;
    use super::types::*;

    #[test]
    fn test_research_session_creation() {
        let query = ResearchQuery::new("Test query", ResearchMode::Standard);
        let session = ResearchSession::new(query);

        assert!(session.id.starts_with("research_"));
        assert!(!session.is_cancelled());
        assert_eq!(session.progress.phase, ResearchPhase::Initializing);
        assert!(session.results.is_empty());
    }

    #[test]
    fn test_research_session_cancellation() {
        let query = ResearchQuery::new("Test query", ResearchMode::Quick);
        let session = ResearchSession::new(query);

        assert!(!session.is_cancelled());
        session.cancel();
        assert!(session.is_cancelled());
    }

    #[test]
    fn test_research_session_progress_update() {
        let query = ResearchQuery::new("Test query", ResearchMode::Deep);
        let mut session = ResearchSession::new(query);

        session.set_phase(ResearchPhase::Searching);
        session.set_status("Searching for results...");
        session.set_progress(50);

        assert_eq!(session.progress.phase, ResearchPhase::Searching);
        assert_eq!(session.progress.status_message, "Searching for results...");
        assert_eq!(session.progress.progress_percent, 50);
    }

    #[test]
    fn test_research_session_progress_clamping() {
        let query = ResearchQuery::new("Test", ResearchMode::Quick);
        let mut session = ResearchSession::new(query);

        session.set_progress(150); // Should be clamped to 100
        assert_eq!(session.progress.progress_percent, 100);
    }
}
