/// Validation tests for Google RAG implementation
///
/// This file contains integration tests to validate the RAG implementation.
/// Run with: cargo test --lib google_rag_test_validation

#[cfg(test)]
mod google_rag_validation {
    use crate::core::llm::providers::google_rag::*;

    #[test]
    fn test_complete_file_search_config() {
        let config = FileSearchConfig {
            files: vec!["file123".to_string(), "file456".to_string()],
            semantic_threshold: Some(0.8),
            max_results: Some(20),
            include_full_content: true,
        };

        assert_eq!(config.files.len(), 2);
        assert_eq!(config.semantic_threshold, Some(0.8));
        assert_eq!(config.max_results, Some(20));
        assert!(config.include_full_content);
    }

    #[test]
    fn test_url_context_config_validation() {
        let config = URLContextConfig {
            urls: vec![
                "https://example.com/page1".to_string(),
                "https://example.com/page2".to_string(),
                "https://example.com/page3".to_string(),
            ],
            include_citations: true,
            max_content_length: Some(100000),
            extract_main_content: true,
        };

        assert_eq!(config.urls.len(), 3);
        assert!(config.include_citations);
        assert_eq!(config.max_content_length, Some(100000));
        assert!(config.extract_main_content);
    }

    #[test]
    fn test_long_context_config_values() {
        let config = LongContextConfig {
            enable_chunking: true,
            chunk_size_tokens: Some(200000),
            chunk_overlap_tokens: Some(2000),
            use_caching: true,
        };

        assert!(config.enable_chunking);
        assert_eq!(config.chunk_size_tokens, Some(200000));
        assert_eq!(config.chunk_overlap_tokens, Some(2000));
        assert!(config.use_caching);
    }

    #[test]
    fn test_token_counter_accuracy() {
        // Test various text lengths
        let short_text = "Hello, world!";
        let tokens = TokenCounter::estimate_tokens(short_text);
        assert!(tokens >= 3 && tokens <= 5);

        let medium_text = "The quick brown fox jumps over the lazy dog. ".repeat(10);
        let medium_tokens = TokenCounter::estimate_tokens(&medium_text);
        assert!(medium_tokens > 50 && medium_tokens < 200);

        let long_text = "a".repeat(4000);
        let long_tokens = TokenCounter::estimate_tokens(&long_text);
        assert_eq!(long_tokens, 1000); // 4000 chars / 4 = 1000 tokens
    }

    #[test]
    fn test_chunking_preserves_content() {
        let text = "This is a test. ".repeat(1000);
        let original_len = text.len();

        let chunks = TokenCounter::chunk_text(&text, 1000, 100);

        // Verify we have multiple chunks
        assert!(chunks.len() > 1);

        // Verify total content (accounting for overlap)
        let total_chunked = chunks.iter().map(|c| c.len()).sum::<usize>();
        assert!(total_chunked >= original_len);
    }

    #[test]
    fn test_rag_pricing_accuracy() {
        // Test file search pricing
        let cost_1k = RAGPricing::calculate_file_search_cost(1000);
        assert_eq!(cost_1k, 0.039);

        let cost_500 = RAGPricing::calculate_file_search_cost(500);
        assert_eq!(cost_500, 0.0195);

        let cost_2k = RAGPricing::calculate_file_search_cost(2000);
        assert_eq!(cost_2k, 0.078);
    }

    #[test]
    fn test_rag_total_cost_with_caching() {
        let usage = RAGTokenUsage {
            input_tokens: 2_000_000,
            output_tokens: 500_000,
            cached_tokens: 1_000_000, // 50% of input is cached
            file_search_queries: 500,
        };

        // Gemini 3 Flash pricing: $0.075/1M input, $0.3/1M output
        let cost = RAGPricing::calculate_total_cost(&usage, 0.075, 0.3);

        // Expected breakdown:
        // - Uncached input: 1M × $0.075 = $0.075
        // - Cached input: 1M × $0.075 × 0.25 = $0.01875
        // - Output: 0.5M × $0.3 = $0.15
        // - File search: 500 × $0.039/1K = $0.0195
        // Total: $0.26325

        assert!((cost - 0.26325).abs() < 0.00001);
    }

    #[test]
    fn test_uploaded_file_utilities() {
        let file = UploadedFile {
            name: "files/test-file-123".to_string(),
            display_name: Some("Test Document.pdf".to_string()),
            mime_type: "application/pdf".to_string(),
            size_bytes: Some(1024 * 1024), // 1MB
            create_time: Some("2026-02-01T00:00:00Z".to_string()),
            update_time: Some("2026-02-01T00:01:00Z".to_string()),
            expiration_time: Some("2026-02-08T00:00:00Z".to_string()),
            sha256_hash: Some("abc123def456".to_string()),
            uri: "https://generativelanguage.googleapis.com/v1beta/files/test-file-123".to_string(),
            state: Some("ACTIVE".to_string()),
        };

        assert_eq!(file.file_id(), "test-file-123");
        assert!(file.is_ready());
        assert_eq!(file.mime_type, "application/pdf");
        assert_eq!(file.size_bytes, Some(1024 * 1024));
    }

    #[test]
    fn test_uploaded_file_not_ready() {
        let file = UploadedFile {
            name: "files/processing-file".to_string(),
            display_name: Some("Processing.pdf".to_string()),
            mime_type: "application/pdf".to_string(),
            size_bytes: Some(2048),
            create_time: None,
            update_time: None,
            expiration_time: None,
            sha256_hash: None,
            uri: "https://example.com/files/processing-file".to_string(),
            state: Some("PROCESSING".to_string()),
        };

        assert_eq!(file.file_id(), "processing-file");
        assert!(!file.is_ready());
    }

    #[test]
    fn test_token_estimation_edge_cases() {
        // Empty string
        assert_eq!(TokenCounter::estimate_tokens(""), 0);

        // Single character
        assert_eq!(TokenCounter::estimate_tokens("a"), 0);

        // Exactly 4 characters (1 token)
        assert_eq!(TokenCounter::estimate_tokens("test"), 1);

        // Unicode characters
        let emoji_text = "🚀".repeat(100);
        let tokens = TokenCounter::estimate_tokens(&emoji_text);
        assert!(tokens > 0);
    }

    #[test]
    fn test_long_context_threshold() {
        // Not long context
        let small_text = "a".repeat(100_000); // 25K tokens
        assert!(!TokenCounter::is_long_context(&small_text));

        // Definitely long context
        let huge_text = "a".repeat(5_000_000); // 1.25M tokens
        assert!(TokenCounter::is_long_context(&huge_text));

        // Right at threshold
        let threshold_text = "a".repeat(4_000_000); // 1M tokens
        assert!(TokenCounter::is_long_context(&threshold_text));
    }

    #[test]
    fn test_chunking_with_zero_overlap() {
        let text = "a".repeat(1000);
        let chunks = TokenCounter::chunk_text(&text, 100, 0);

        // With 100 token chunks (400 chars) and 1000 chars, we should get 3 chunks
        // Chunk 1: 0-400
        // Chunk 2: 400-800
        // Chunk 3: 800-1000
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].len(), 400);
        assert_eq!(chunks[1].len(), 400);
        assert_eq!(chunks[2].len(), 200);
    }

    #[test]
    fn test_chunking_with_large_overlap() {
        let text = "a".repeat(1000);
        let chunks = TokenCounter::chunk_text(&text, 100, 50);

        // With 100 token chunks (400 chars) and 50 token overlap (200 chars)
        // We should get more chunks due to overlap
        assert!(chunks.len() > 3);

        // Each chunk (except last) should be 400 chars
        for chunk in &chunks[..chunks.len() - 1] {
            assert_eq!(chunk.len(), 400);
        }
    }

    #[test]
    fn test_citation_structure() {
        let citation = Citation {
            url: "https://example.com/article".to_string(),
            title: Some("Example Article".to_string()),
            excerpt: "This is an important excerpt from the article.".to_string(),
            start_index: Some(100),
            end_index: Some(150),
        };

        assert_eq!(citation.url, "https://example.com/article");
        assert_eq!(citation.title, Some("Example Article".to_string()));
        assert_eq!(citation.start_index, Some(100));
        assert_eq!(citation.end_index, Some(150));
    }

    #[test]
    fn test_rag_response_structure() {
        let usage = RAGTokenUsage {
            input_tokens: 10000,
            output_tokens: 1000,
            cached_tokens: 5000,
            file_search_queries: 2,
        };

        let response = RAGResponse {
            content: "Generated content with RAG".to_string(),
            file_search_results: None,
            grounding_metadata: None,
            citations: vec![],
            context_chunks_used: Some(5),
            token_usage: usage.clone(),
        };

        assert_eq!(response.content, "Generated content with RAG");
        assert_eq!(response.context_chunks_used, Some(5));
        assert_eq!(response.token_usage.input_tokens, 10000);
        assert_eq!(response.token_usage.file_search_queries, 2);
    }

    #[test]
    fn test_rag_token_usage_defaults() {
        let usage = RAGTokenUsage::default();

        assert_eq!(usage.input_tokens, 0);
        assert_eq!(usage.output_tokens, 0);
        assert_eq!(usage.cached_tokens, 0);
        assert_eq!(usage.file_search_queries, 0);
    }

    #[test]
    fn test_cost_calculation_zero_usage() {
        let usage = RAGTokenUsage::default();
        let cost = RAGPricing::calculate_total_cost(&usage, 1.5, 6.0);

        assert_eq!(cost, 0.0);
    }

    #[test]
    fn test_cost_calculation_only_file_search() {
        let usage = RAGTokenUsage {
            input_tokens: 0,
            output_tokens: 0,
            cached_tokens: 0,
            file_search_queries: 1000,
        };

        let cost = RAGPricing::calculate_total_cost(&usage, 1.5, 6.0);
        assert_eq!(cost, 0.039);
    }

    #[test]
    fn test_cost_calculation_100_percent_cached() {
        let usage = RAGTokenUsage {
            input_tokens: 1_000_000,
            output_tokens: 100_000,
            cached_tokens: 1_000_000, // All input is cached
            file_search_queries: 0,
        };

        // 100% cached input: 1M × $1.5 × 0.25 = $0.375
        // Output: 100K × $6.0/1M = $0.6
        // Total: $0.975
        let cost = RAGPricing::calculate_total_cost(&usage, 1.5, 6.0);
        assert!((cost - 0.975).abs() < 0.001);
    }
}
