//! Tests for the intent detection and tool routing module.

use super::*;
use crate::core::mcp::McpClient;
use std::sync::Arc;

mod detector_tests {
    use super::*;

    #[test]
    fn test_detect_file_read() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("read the file at /home/user/document.txt")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::FileOperation);
        assert!(intent.confidence.score > 0.3);
        assert!(intent.entities.contains_key("file_path"));
    }

    #[test]
    fn test_detect_web_search() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("search the web for rust programming language")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::WebSearch);
        assert!(intent.required_tools.contains(&"search_web".to_string()));
    }

    #[test]
    fn test_detect_email_send() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("send an email to alice@example.com about the meeting")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::Email);
        assert!(intent.entities.contains_key("email"));
    }

    #[test]
    fn test_detect_calendar_event() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("schedule a meeting for tomorrow at 3pm")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::Calendar);
    }

    #[test]
    fn test_detect_code_task() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("write a python script to parse JSON files")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::CodeTask);
    }

    #[test]
    fn test_detect_automation() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("click on the submit button and fill the form")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::Automation);
    }

    #[test]
    fn test_detect_git_operations() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("commit the changes and push to origin")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::VersionControl);
    }

    #[test]
    fn test_detect_memory_operations() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("remember that my favorite color is blue")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::Memory);
    }

    #[test]
    fn test_detect_scheduling() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("remind me to call mom in 2 hours")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::Scheduling);
    }

    #[test]
    fn test_detect_database() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("run a SQL query to select all users from the database")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::Database);
    }

    #[test]
    fn test_detect_media_generation() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("generate an image of a sunset over the ocean")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::MediaGeneration);
    }

    #[test]
    fn test_complexity_estimation_quick() {
        let detector = IntentDetector::new();
        let intent = detector.detect_sync("what time is it").unwrap();

        assert_eq!(intent.complexity, Complexity::QuickWin);
    }

    #[test]
    fn test_complexity_estimation_complex() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("analyze all files in the project and then create a comprehensive report")
            .unwrap();

        assert!(intent.complexity >= Complexity::Moderate);
    }

    #[test]
    fn test_empty_prompt_error() {
        let detector = IntentDetector::new();
        let result = detector.detect_sync("");

        assert!(result.is_err());
    }

    #[test]
    fn test_conversation_fallback() {
        let detector = IntentDetector::new();
        let intent = detector.detect_sync("hello how are you").unwrap();

        assert_eq!(intent.primary_category, IntentCategory::Conversation);
    }
}

mod pattern_tests {
    use super::*;

    #[test]
    fn test_pattern_matcher_multiple_matches() {
        let matcher = PatternMatcher::new();
        let matches = matcher.match_prompt("search the web and save to file");

        assert!(matches.len() >= 2);
        // Should have both web search and file operation matches
        let categories: Vec<_> = matches.iter().map(|m| m.category).collect();
        assert!(categories.contains(&IntentCategory::WebSearch));
    }

    #[test]
    fn test_entity_extraction_multiple() {
        let matcher = PatternMatcher::new();
        let entities =
            matcher.extract_entities("send email to user@test.com and visit https://example.com");

        assert!(entities.contains_key("email"));
        assert!(entities.contains_key("url"));
    }

    #[test]
    fn test_entity_extraction_time() {
        let matcher = PatternMatcher::new();
        let entities = matcher.extract_entities("remind me at 3pm tomorrow");

        assert!(entities.contains_key("time"));
    }

    #[test]
    fn test_complexity_with_multiple_steps() {
        let matcher = PatternMatcher::new();
        let complexity = matcher.estimate_complexity(
            "first read the file, then analyze it, and finally create a report",
            IntentCategory::FileOperation,
        );

        assert!(complexity >= Complexity::Moderate);
    }
}

mod quick_win_tests {
    use super::*;

    #[test]
    fn test_memory_recall_is_quick_win() {
        let optimizer = QuickWinOptimizer::new();
        let intent = DetectedIntent::new(
            "recall my preference for theme".to_string(),
            IntentCategory::Memory,
        );

        let result = optimizer.optimize(&intent).unwrap();

        assert!(result.is_quick_win);
        assert!(result.skip_planning);
    }

    #[test]
    fn test_greeting_has_direct_answer() {
        let optimizer = QuickWinOptimizer::new();
        let intent = DetectedIntent::new("hello there!".to_string(), IntentCategory::Conversation);

        let result = optimizer.optimize(&intent).unwrap();

        assert!(result.is_quick_win);
        assert!(result.direct_answer.is_some());
    }

    #[test]
    fn test_complex_task_not_quick_win() {
        let optimizer = QuickWinOptimizer::new();
        let intent = DetectedIntent::new(
            "analyze the entire codebase".to_string(),
            IntentCategory::CodeTask,
        )
        .with_complexity(Complexity::Complex);

        let result = optimizer.optimize(&intent).unwrap();

        assert!(!result.is_quick_win);
    }

    #[test]
    fn test_tool_prioritization() {
        let optimizer = QuickWinOptimizer::new();
        let tools = vec![
            "search_web".to_string(),
            "file_read".to_string(),
            "memory_recall".to_string(),
        ];

        let prioritized = optimizer.prioritize_tools(&tools);

        // memory_recall has highest priority (lowest number)
        assert_eq!(prioritized[0].tool_id, "memory_recall");
        // file_read is next
        assert_eq!(prioritized[1].tool_id, "file_read");
        // search_web is last
        assert_eq!(prioritized[2].tool_id, "search_web");
    }
}

mod router_tests {
    use super::*;

    #[test]
    fn test_route_file_operation() {
        let client = Arc::new(McpClient::new());
        let router = ToolRouter::new(client);

        let intent = DetectedIntent::new(
            "read the config file".to_string(),
            IntentCategory::FileOperation,
        )
        .with_tools(vec!["file_read".to_string()]);

        let plan = router.route_sync(&intent).unwrap();

        assert!(!plan.tools.is_empty());
        assert!(plan.tools.iter().any(|t| t.tool_id == "file_read"));
    }

    #[test]
    fn test_route_adds_default_tools() {
        let client = Arc::new(McpClient::new());
        let router = ToolRouter::new(client);

        let intent = DetectedIntent::new(
            "search for something".to_string(),
            IntentCategory::WebSearch,
        );

        let plan = router.route_sync(&intent).unwrap();

        assert!(plan.tools.iter().any(|t| t.tool_id == "search_web"));
    }

    #[test]
    fn test_route_estimates_time() {
        let client = Arc::new(McpClient::new());
        let router = ToolRouter::new(client);

        let intent = DetectedIntent::new(
            "read file and search web".to_string(),
            IntentCategory::FileOperation,
        )
        .with_tools(vec!["file_read".to_string(), "search_web".to_string()]);

        let plan = router.route_sync(&intent).unwrap();

        assert!(plan.estimated_time > std::time::Duration::ZERO);
    }

    #[test]
    fn test_route_quick_win_optimization() {
        let client = Arc::new(McpClient::new());
        let router = ToolRouter::new(client);

        let intent = DetectedIntent::new("hello".to_string(), IntentCategory::Conversation)
            .with_complexity(Complexity::QuickWin);

        let plan = router.route_sync(&intent).unwrap();

        assert!(plan.is_optimized);
    }

    #[test]
    fn test_parallel_groups() {
        let client = Arc::new(McpClient::new());
        let router = ToolRouter::new(client);

        let intent = DetectedIntent::new(
            "read multiple files".to_string(),
            IntentCategory::FileOperation,
        )
        .with_tools(vec![
            "file_read".to_string(),
            "search_web".to_string(),
            "memory_recall".to_string(),
        ]);

        let plan = router.route_sync(&intent).unwrap();

        assert!(!plan.parallel_groups.is_empty());
    }

    #[test]
    fn test_server_startup_needed() {
        let client = Arc::new(McpClient::new());
        let router = ToolRouter::new(client);

        let intent = DetectedIntent::new("search my email".to_string(), IntentCategory::Email)
            .with_servers(vec![RequiredServer::new("gmail")]);

        let plan = router.route_sync(&intent).unwrap();

        assert!(plan.needs_server_startup());
        assert!(!plan.servers_to_start.is_empty());
    }
}

mod integration_tests {
    use super::*;

    #[test]
    fn test_full_pipeline_file_operation() {
        let detector = IntentDetector::new();
        let client = Arc::new(McpClient::new());
        let router = ToolRouter::new(client);

        // Detect intent
        let intent = detector.detect_sync("read the file /tmp/test.txt").unwrap();

        assert_eq!(intent.primary_category, IntentCategory::FileOperation);

        // Route to tools
        let plan = router.route_sync(&intent).unwrap();

        assert!(!plan.tools.is_empty());
    }

    #[test]
    fn test_full_pipeline_web_search() {
        let detector = IntentDetector::new();
        let client = Arc::new(McpClient::new());
        let router = ToolRouter::new(client);

        // Detect intent
        let intent = detector
            .detect_sync("search for rust async tutorial")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::WebSearch);

        // Route to tools
        let plan = router.route_sync(&intent).unwrap();

        assert!(plan.tools.iter().any(|t| t.tool_id == "search_web"));
    }

    #[test]
    fn test_full_pipeline_quick_win() {
        let detector = IntentDetector::new();
        let optimizer = QuickWinOptimizer::new();

        // Detect intent
        let intent = detector.detect_sync("hello there").unwrap();

        // Optimize
        let optimization = optimizer.optimize(&intent).unwrap();

        assert!(optimization.is_quick_win);
        assert!(optimization.direct_answer.is_some());
    }

    #[test]
    fn test_full_pipeline_complex_task() {
        let detector = IntentDetector::new();
        let optimizer = QuickWinOptimizer::new();

        // Detect intent
        let intent = detector
            .detect_sync(
                "analyze all python files in the project, create a report, and then send it via email",
            )
            .unwrap();

        // Should be complex
        assert!(intent.complexity >= Complexity::Moderate);

        // Should not be quick win
        let optimization = optimizer.optimize(&intent).unwrap();
        assert!(!optimization.is_quick_win);
    }
}

mod edge_case_tests {
    use super::*;

    #[test]
    fn test_whitespace_prompt() {
        let detector = IntentDetector::new();
        let result = detector.detect_sync("   ");

        assert!(result.is_err());
    }

    #[test]
    fn test_very_long_prompt() {
        let detector = IntentDetector::new();
        let long_prompt = "search ".repeat(100) + "for something";
        let intent = detector.detect_sync(&long_prompt).unwrap();

        // Should still detect web search
        assert_eq!(intent.primary_category, IntentCategory::WebSearch);
    }

    #[test]
    fn test_mixed_case_prompt() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("SEARCH THE WEB for RUST programming")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::WebSearch);
    }

    #[test]
    fn test_special_characters() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("read file @#$%^&*() /tmp/test.txt")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::FileOperation);
    }

    #[test]
    fn test_unicode_prompt() {
        let detector = IntentDetector::new();
        let intent = detector
            .detect_sync("search for rust programming in Japanese")
            .unwrap();

        assert_eq!(intent.primary_category, IntentCategory::WebSearch);
    }
}
