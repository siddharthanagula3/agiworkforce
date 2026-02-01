# Google Grounding Integration Guide

This document explains how to use Google Grounding capabilities with the Gemini provider.

## Overview

Google Grounding provides two main capabilities:

1. **Google Search Grounding** - Real-time web search to prevent hallucinations ($35/1000 queries)
2. **Google Maps Grounding** - Location-based contextual information (included in base pricing)

## Usage Examples

### 1. Basic Search Grounding

```rust
use crate::core::llm::{LLMRequest, ChatMessage};
use crate::core::llm::providers::google::{GoogleProvider, GroundingConfig};

async fn use_search_grounding() -> Result<(), Box<dyn std::error::Error>> {
    let provider = GoogleProvider::new("YOUR_API_KEY".to_string())?;

    // Create grounding config with search enabled
    let grounding_config = GroundingConfig::with_search(Some(0.5));

    let mut request = LLMRequest::new(
        vec![ChatMessage {
            role: "user".to_string(),
            content: "What are the latest developments in quantum computing?".to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }],
        "gemini-3-pro".to_string(),
    );

    // Add grounding config to metadata
    request.metadata = Some(serde_json::json!({
        "grounding_config": grounding_config
    }));

    let response = provider.send_message(&request).await?;

    // Response will include grounding metadata with sources
    println!("Response: {}", response.content);

    Ok(())
}
```

### 2. Google Maps Grounding with Coordinates

```rust
use crate::core::llm::providers::google::{GroundingConfig, GeoLocation};

async fn use_maps_grounding_location() -> Result<(), Box<dyn std::error::Error>> {
    // San Francisco coordinates
    let grounding_config = GroundingConfig::with_maps_location(37.7749, -122.4194)?;

    let mut request = LLMRequest::new(
        vec![ChatMessage {
            role: "user".to_string(),
            content: "What are the best coffee shops near here?".to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }],
        "gemini-3-pro".to_string(),
    );

    request.metadata = Some(serde_json::json!({
        "grounding_config": grounding_config
    }));

    let response = provider.send_message(&request).await?;
    Ok(())
}
```

### 3. Google Maps Grounding with Place ID

```rust
async fn use_maps_grounding_place() -> Result<(), Box<dyn std::error::Error>> {
    // Use a specific Google Maps Place ID
    let grounding_config = GroundingConfig::with_maps_place(
        "ChIJN1t_tDeuEmsRUsoyG83frY4".to_string() // Google Sydney office
    );

    let mut request = LLMRequest::new(
        vec![ChatMessage {
            role: "user".to_string(),
            content: "Tell me about this location and nearby amenities.".to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }],
        "gemini-3-pro".to_string(),
    );

    request.metadata = Some(serde_json::json!({
        "grounding_config": grounding_config
    }));

    let response = provider.send_message(&request).await?;
    Ok(())
}
```

### 4. Combined Search and Maps Grounding

```rust
use crate::core::llm::providers::google::{
    GroundingConfig, SearchGroundingConfig, MapsGroundingConfig, GeoLocation
};

async fn use_combined_grounding() -> Result<(), Box<dyn std::error::Error>> {
    let grounding_config = GroundingConfig {
        search: Some(SearchGroundingConfig {
            enabled: true,
            dynamic_retrieval_threshold: Some(0.6),
        }),
        maps: Some(MapsGroundingConfig {
            place_id: None,
            location: Some(GeoLocation::new(37.7749, -122.4194)?),
        }),
    };

    let mut request = LLMRequest::new(
        vec![ChatMessage {
            role: "user".to_string(),
            content: "What's the weather like here and what outdoor activities are recommended?".to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }],
        "gemini-3-pro".to_string(),
    );

    request.metadata = Some(serde_json::json!({
        "grounding_config": grounding_config
    }));

    let response = provider.send_message(&request).await?;
    Ok(())
}
```

### 5. Processing Grounding Metadata

```rust
use crate::core::llm::providers::google::GroundingMetadata;

async fn process_grounding_metadata() -> Result<(), Box<dyn std::error::Error>> {
    // ... send request with grounding ...

    let response = provider.send_message(&request).await?;

    // Extract grounding metadata from response
    if let Some(metadata_value) = response.metadata {
        if let Ok(grounding_metadata) = serde_json::from_value::<GroundingMetadata>(
            metadata_value.get("grounding_metadata").cloned().unwrap_or_default()
        ) {
            // Check if grounding was used
            if grounding_metadata.has_grounding() {
                println!("Sources used: {}", grounding_metadata.source_count());

                // Display search results
                if let Some(search_results) = &grounding_metadata.search_results {
                    println!("\nSearch Results:");
                    for result in search_results {
                        println!("  - {}: {}", result.title, result.url);
                        println!("    {}", result.snippet);
                    }
                }

                // Display map results
                if let Some(map_results) = &grounding_metadata.map_results {
                    println!("\nLocation Results:");
                    for result in map_results {
                        println!("  - {}", result.name);
                        println!("    Address: {}", result.address);
                        if let Some(rating) = result.rating {
                            println!("    Rating: {:.1}/5.0", rating);
                        }
                    }
                }

                // Display all unique URLs
                println!("\nAll Sources:");
                for url in grounding_metadata.all_urls() {
                    println!("  - {}", url);
                }

                // Format as markdown for display
                let markdown = grounding_metadata.format_as_markdown();
                println!("{}", markdown);
            }
        }
    }

    Ok(())
}
```

## Cost Calculation

```rust
use crate::core::llm::providers::google_grounding::calculate_grounding_cost;

async fn calculate_costs() -> Result<(), Box<dyn std::error::Error>> {
    // ... get response with grounding metadata ...

    let grounding_metadata = /* extract from response */;

    // Calculate additional grounding cost
    let grounding_cost = calculate_grounding_cost(&grounding_metadata);

    // Total cost includes base model cost + grounding cost
    let total_cost = response.cost.unwrap_or(0.0) + grounding_cost;

    println!("Base model cost: ${:.4}", response.cost.unwrap_or(0.0));
    println!("Grounding cost: ${:.4}", grounding_cost);
    println!("Total cost: ${:.4}", total_cost);

    Ok(())
}
```

## Dynamic Retrieval Threshold

The `dynamic_retrieval_threshold` controls when Google Search is triggered:

- **0.0 - 0.3**: Very aggressive - search for most queries
- **0.4 - 0.6**: Balanced - search when beneficial
- **0.7 - 1.0**: Conservative - only search when highly confident it's needed
- **None**: Use Google's default threshold

```rust
// Aggressive search for fact-checking
let config = GroundingConfig::with_search(Some(0.2));

// Balanced approach (recommended)
let config = GroundingConfig::with_search(Some(0.5));

// Conservative for general chat
let config = GroundingConfig::with_search(Some(0.8));

// Let Google decide
let config = GroundingConfig::with_search(None);
```

## Integration with GoogleProvider

To fully integrate grounding into the GoogleProvider, the following changes are needed:

### 1. Add grounding to GoogleRequest

```rust
#[derive(Debug, Clone, Serialize)]
struct GoogleRequest {
    contents: Vec<GoogleContent>,
    generation_config: Option<GoogleGenerationConfig>,
    tools: Option<Vec<GoogleTool>>,
    system_instruction: Option<GoogleSystemInstruction>,
    cached_content: Option<String>,
    thought_signature: Option<String>,

    // Add grounding configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    grounding_config: Option<GoogleApiGroundingConfig>,
}
```

### 2. Extract grounding config from metadata

```rust
async fn send_message(&self, request: &LLMRequest) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
    // ... existing code ...

    // Extract grounding config from metadata
    let grounding_api_config = request.metadata.as_ref()
        .and_then(|m| m.get("grounding_config"))
        .and_then(|v| serde_json::from_value::<GroundingConfig>(v.clone()).ok())
        .and_then(|config| grounding::build_api_grounding_config(&config));

    let google_request = GoogleRequest {
        contents: /* ... */,
        generation_config: Some(generation_config),
        tools: google_tools,
        system_instruction,
        cached_content,
        thought_signature,
        grounding_config: grounding_api_config,
    };

    // ... rest of implementation ...
}
```

### 3. Parse grounding metadata from response

```rust
#[derive(Debug, Clone, Deserialize)]
struct GoogleResponse {
    candidates: Vec<GoogleCandidate>,
    usage_metadata: Option<GoogleUsageMetadata>,
    model_version: Option<String>,
    thought_signature: Option<String>,
    thought_summary: Option<String>,

    // Add grounding metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    grounding_metadata: Option<GoogleApiGroundingMetadata>,
}

// In send_message implementation:
let mut response_metadata = serde_json::Map::new();

// Parse grounding metadata if present
if let Some(api_grounding) = google_response.grounding_metadata {
    let grounding_metadata = grounding::parse_grounding_metadata(&api_grounding);

    // Calculate additional grounding cost
    let grounding_cost = grounding::calculate_grounding_cost(&grounding_metadata);

    // Add to response cost
    cost = cost.map(|c| c + grounding_cost).or(Some(grounding_cost));

    // Store in response metadata
    response_metadata.insert(
        "grounding_metadata".to_string(),
        serde_json::to_value(grounding_metadata).unwrap_or_default()
    );
}

// Return LLMResponse with metadata
Ok(LLMResponse {
    content: text_content,
    // ... other fields ...
    metadata: if response_metadata.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(response_metadata))
    },
    ..LLMResponse::default()
})
```

## Testing

Run the grounding module tests:

```bash
cd apps/desktop/src-tauri
cargo test --lib providers::google_grounding
```

Expected test output:
- ✓ test_geo_location_validation
- ✓ test_grounding_config_enabled
- ✓ test_grounding_metadata_source_count
- ✓ test_grounding_metadata_all_urls
- ✓ test_calculate_grounding_cost
- ✓ test_build_api_grounding_config
- ✓ test_markdown_formatting

## Pricing Summary

| Feature | Pricing | Notes |
|---------|---------|-------|
| Google Search Grounding | $35/1000 queries | Charged per search query executed |
| Google Maps Grounding | Free | Included in base model pricing |
| Dynamic Retrieval | Free | No charge for the feature itself |

## Best Practices

1. **Use dynamic retrieval thresholds** to control search usage and costs
2. **Cache location data** to avoid repeated Maps API calls
3. **Monitor grounding costs** separately from model costs
4. **Format grounding attribution** for user transparency
5. **Validate coordinates** before sending to prevent API errors
6. **Use Place IDs** for consistent location references
7. **Check grounding metadata** to verify sources were used

## Error Handling

```rust
// Validate coordinates
match GeoLocation::new(latitude, longitude) {
    Ok(location) => {
        // Use location
    }
    Err(e) => {
        return Err(format!("Invalid coordinates: {}", e).into());
    }
}

// Check if grounding was actually used
if !grounding_metadata.has_grounding() {
    tracing::warn!("Grounding was enabled but no sources were used");
}

// Handle missing search results
if let Some(search_results) = &grounding_metadata.search_results {
    if search_results.is_empty() {
        tracing::info!("Search was triggered but no results found");
    }
}
```

## Future Enhancements

Potential future additions to the grounding system:

1. **Grounding cache** - Cache search results to reduce costs
2. **Custom search domains** - Restrict searches to specific websites
3. **Grounding quality metrics** - Track relevance and accuracy
4. **Grounding preferences** - User-defined search preferences
5. **Batch grounding** - Ground multiple queries efficiently
6. **Grounding analytics** - Detailed usage and cost analytics

## Related Modules

- `google.rs` - Main Google provider implementation
- `google_multimodal.rs` - Multimodal content generation
- `google_code_execution.rs` - Code execution capabilities
- `google_rag.rs` - RAG (Retrieval-Augmented Generation) support
- `google_advanced.rs` - Advanced provider features
