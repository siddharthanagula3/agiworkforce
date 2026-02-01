# Google Gemini RAG Integration Guide

This guide demonstrates how to use RAG (Retrieval-Augmented Generation) capabilities with Google Gemini models.

## Overview

The `google_rag` module provides three main RAG capabilities:

1. **File Search with Embeddings** - Semantic search over uploaded documents
2. **URL Context Grounding** - Web content retrieval and grounding
3. **Long Context Optimization** - Efficient handling of 1M+ token contexts

## Pricing

- **File Search**: $0.039 per 1000 queries
- **Context Caching**: 75% discount on cached tokens
- **Base Model**: Standard Gemini pricing applies

## 1. File Search with Embeddings

### Upload Files

```rust
use crate::core::llm::providers::google_rag::GoogleFilesAPI;

// Create Files API client
let api_key = std::env::var("GOOGLE_API_KEY")?;
let files_api = GoogleFilesAPI::new(api_key)?;

// Upload a file
let uploaded_file = files_api
    .upload_file(
        "/path/to/document.pdf",
        Some("Technical Documentation")
    )
    .await?;

println!("Uploaded file: {}", uploaded_file.file_id());

// Wait for file to be processed
while !uploaded_file.is_ready() {
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    let file = files_api.get_file(uploaded_file.file_id()).await?;
    if file.is_ready() {
        break;
    }
}
```

### Search Files

```rust
use crate::core::llm::providers::{
    google_rag::{FileSearchConfig, GoogleFilesAPI},
    google::GoogleProvider,
};
use crate::core::llm::{LLMRequest, ChatMessage};

// Configure file search
let file_search_config = FileSearchConfig {
    files: vec![uploaded_file.file_id().to_string()],
    semantic_threshold: Some(0.7),
    max_results: Some(10),
    include_full_content: false,
};

// Create request
let request = LLMRequest::new(
    vec![ChatMessage {
        role: "user".to_string(),
        content: "What are the main features described in the documentation?".to_string(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    }],
    "gemini-3-pro".to_string(),
);

// Send with file search
let provider = GoogleProvider::new(api_key)?;
let response = provider
    .send_message_with_file_search(&request, &file_search_config)
    .await?;

println!("Response: {}", response.content);
```

### File Management

```rust
// List all files
let files = files_api.list_files().await?;
for file in files {
    println!("File: {} ({})", file.display_name.unwrap_or_default(), file.file_id());
}

// Delete a file
files_api.delete_file(uploaded_file.file_id()).await?;
```

## 2. URL Context Grounding

### Fetch and Ground with URLs

```rust
use crate::core::llm::providers::google_rag::URLContextConfig;

// Configure URL context
let url_config = URLContextConfig {
    urls: vec![
        "https://example.com/article1".to_string(),
        "https://example.com/article2".to_string(),
    ],
    include_citations: true,
    max_content_length: Some(50000), // ~12.5K tokens per URL
    extract_main_content: true,
};

// Send with URL context
let response = provider
    .send_message_with_url_context(&request, &url_config)
    .await?;

println!("Response with grounded context: {}", response.content);
```

### Custom URL Fetching

```rust
use crate::core::llm::providers::google_rag::URLContentFetcher;

// Create URL fetcher
let fetcher = URLContentFetcher::new()?;

// Fetch URL content
let url_content = fetcher
    .fetch_url("https://example.com/article", &url_config)
    .await?;

println!("Title: {}", url_content.title.unwrap_or_default());
println!("Content length: {} chars", url_content.content.len());
println!("Word count: {}", url_content.word_count);
```

## 3. Long Context Optimization

### Handle 1M+ Token Contexts

```rust
use crate::core::llm::providers::google_rag::{LongContextConfig, TokenCounter};

// Check if context is long
let total_text = "...very long document...";
let is_long = TokenCounter::is_long_context(&total_text);

if is_long {
    // Configure long context optimization
    let long_context_config = LongContextConfig {
        enable_chunking: true,
        chunk_size_tokens: Some(100000),
        chunk_overlap_tokens: Some(1000),
        use_caching: true,
    };

    // Send with optimization
    let response = provider
        .send_message_with_long_context(&request, &long_context_config)
        .await?;

    println!("Processed long context: {}", response.content);
}
```

### Manual Chunking

```rust
// Chunk text manually
let chunks = TokenCounter::chunk_text(
    &total_text,
    100000, // chunk size in tokens
    1000,   // overlap in tokens
);

println!("Split into {} chunks", chunks.len());

// Process each chunk
for (i, chunk) in chunks.iter().enumerate() {
    let chunk_tokens = TokenCounter::estimate_tokens(chunk);
    println!("Chunk {}: {} tokens", i + 1, chunk_tokens);
}
```

## 4. Cost Calculation

### Track RAG Costs

```rust
use crate::core::llm::providers::google_rag::{RAGPricing, RAGTokenUsage};

// Track usage
let usage = RAGTokenUsage {
    input_tokens: 1_000_000,
    output_tokens: 50_000,
    cached_tokens: 500_000,
    file_search_queries: 100,
};

// Calculate costs for Gemini 3 Pro
let total_cost = RAGPricing::calculate_total_cost(
    &usage,
    1.5,  // input cost per 1M tokens
    6.0,  // output cost per 1M tokens
);

println!("Total cost: ${:.4}", total_cost);

// File search cost alone
let file_search_cost = RAGPricing::calculate_file_search_cost(usage.file_search_queries);
println!("File search cost: ${:.4}", file_search_cost);
```

## 5. Complete Example

```rust
use crate::core::llm::providers::{
    google::GoogleProvider,
    google_rag::{
        FileSearchConfig, GoogleFilesAPI, LongContextConfig,
        RAGPricing, RAGTokenUsage, URLContextConfig,
    },
};
use crate::core::llm::{ChatMessage, LLMRequest};

async fn complete_rag_example() -> Result<(), Box<dyn std::error::Error>> {
    let api_key = std::env::var("GOOGLE_API_KEY")?;

    // 1. Upload files
    let files_api = GoogleFilesAPI::new(api_key.clone())?;
    let file1 = files_api.upload_file("doc1.pdf", Some("Document 1")).await?;
    let file2 = files_api.upload_file("doc2.pdf", Some("Document 2")).await?;

    // 2. Configure file search
    let file_search_config = FileSearchConfig {
        files: vec![file1.file_id().to_string(), file2.file_id().to_string()],
        semantic_threshold: Some(0.7),
        max_results: Some(10),
        include_full_content: false,
    };

    // 3. Configure URL context
    let url_config = URLContextConfig {
        urls: vec!["https://example.com/reference".to_string()],
        include_citations: true,
        max_content_length: Some(50000),
        extract_main_content: true,
    };

    // 4. Create request
    let request = LLMRequest::new(
        vec![ChatMessage {
            role: "user".to_string(),
            content: "Summarize the key findings from the uploaded documents and the reference URL.".to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }],
        "gemini-3-pro".to_string(),
    );

    // 5. Send with RAG
    let provider = GoogleProvider::new(api_key)?;

    // First, use file search
    let file_response = provider
        .send_message_with_file_search(&request, &file_search_config)
        .await?;

    println!("File search response: {}", file_response.content);

    // Then, use URL context
    let url_response = provider
        .send_message_with_url_context(&request, &url_config)
        .await?;

    println!("URL context response: {}", url_response.content);

    // 6. Calculate costs
    let usage = RAGTokenUsage {
        input_tokens: file_response.prompt_tokens.unwrap_or(0)
            + url_response.prompt_tokens.unwrap_or(0),
        output_tokens: file_response.completion_tokens.unwrap_or(0)
            + url_response.completion_tokens.unwrap_or(0),
        cached_tokens: file_response.cache_read_input_tokens.unwrap_or(0)
            + url_response.cache_read_input_tokens.unwrap_or(0),
        file_search_queries: 2, // 2 queries
    };

    let total_cost = RAGPricing::calculate_total_cost(&usage, 1.5, 6.0);
    println!("Total RAG cost: ${:.4}", total_cost);

    // 7. Cleanup
    files_api.delete_file(file1.file_id()).await?;
    files_api.delete_file(file2.file_id()).await?;

    Ok(())
}
```

## Best Practices

### 1. File Search

- **Batch uploads**: Upload multiple files at once for better efficiency
- **Semantic threshold**: Start with 0.7 and adjust based on results
- **File limits**: Keep file count under 100 for optimal performance
- **File cleanup**: Delete unused files to avoid storage costs

### 2. URL Context

- **Content extraction**: Always use `extract_main_content: true` for better quality
- **Length limits**: Keep `max_content_length` under 50K to avoid token waste
- **Error handling**: URLs may fail to load, always handle errors gracefully
- **Rate limiting**: Implement delays between URL fetches if processing many URLs

### 3. Long Context

- **Chunking strategy**: Use 100K token chunks with 1K overlap for best results
- **Caching**: Always enable `use_caching` for repeated contexts
- **Memory management**: Process chunks incrementally to avoid memory issues
- **Token estimation**: Use `TokenCounter::estimate_tokens()` before processing

### 4. Cost Optimization

- **Cache aggressively**: Enable caching to get 75% discount on repeated content
- **Limit file searches**: Each query costs $0.039/1K, so batch when possible
- **URL selection**: Only fetch URLs that are highly relevant
- **Chunk wisely**: Larger chunks = fewer API calls but higher memory usage

## Troubleshooting

### File Upload Fails

```rust
// Check file state
let file = files_api.get_file(file_id).await?;
if !file.is_ready() {
    println!("File state: {}", file.state.unwrap_or_default());
    // Wait and retry
}
```

### URL Fetch Timeout

```rust
// Increase timeout or use smaller content length
let url_config = URLContextConfig {
    max_content_length: Some(25000), // Reduce to 25K
    ..Default::default()
};
```

### Long Context OOM

```rust
// Use smaller chunks
let long_context_config = LongContextConfig {
    chunk_size_tokens: Some(50000), // Reduce to 50K
    chunk_overlap_tokens: Some(500), // Reduce overlap
    ..Default::default()
};
```

## Advanced Features

### Custom File Processing

```rust
// Wait for file to be fully processed with retry
async fn wait_for_file_ready(
    files_api: &GoogleFilesAPI,
    file_id: &str,
    max_retries: u32,
) -> Result<(), Box<dyn std::error::Error>> {
    for i in 0..max_retries {
        let file = files_api.get_file(file_id).await?;
        if file.is_ready() {
            return Ok(());
        }
        tokio::time::sleep(std::time::Duration::from_secs(2_u64.pow(i))).await;
    }
    Err("File processing timeout".into())
}
```

### Parallel URL Fetching

```rust
use futures::future::join_all;

async fn fetch_urls_parallel(
    urls: &[String],
    config: &URLContextConfig,
) -> Vec<Result<URLContent, Box<dyn std::error::Error>>> {
    let fetcher = URLContentFetcher::new().unwrap();

    let futures = urls.iter().map(|url| {
        let url = url.clone();
        let config = config.clone();
        async move {
            fetcher.fetch_url(&url, &config).await
        }
    });

    join_all(futures).await
}
```

### Adaptive Chunking

```rust
// Chunk based on content structure (e.g., paragraphs)
fn smart_chunk_text(text: &str, target_tokens: u32) -> Vec<String> {
    let paragraphs: Vec<&str> = text.split("\n\n").collect();
    let mut chunks = Vec::new();
    let mut current_chunk = String::new();

    for paragraph in paragraphs {
        let tokens = TokenCounter::estimate_tokens(&current_chunk)
            + TokenCounter::estimate_tokens(paragraph);

        if tokens > target_tokens && !current_chunk.is_empty() {
            chunks.push(current_chunk.clone());
            current_chunk.clear();
        }

        current_chunk.push_str(paragraph);
        current_chunk.push_str("\n\n");
    }

    if !current_chunk.is_empty() {
        chunks.push(current_chunk);
    }

    chunks
}
```

## API Reference

See the full API documentation in:
- `google_rag.rs` - Core RAG types and implementations
- `google.rs` - GoogleProvider integration methods

## Support

For issues or questions about RAG capabilities:
1. Check Google's Gemini documentation for API limits
2. Review the test cases in `google_rag.rs`
3. Enable debug logging: `RUST_LOG=debug`
