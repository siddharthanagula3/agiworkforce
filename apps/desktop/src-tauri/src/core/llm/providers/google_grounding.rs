//! Google Grounding capabilities for Gemini models
//!
//! This module provides grounding functionality for Google's Gemini models:
//! - Google Search Grounding: Real-time web search to prevent hallucinations
//! - Google Maps Grounding: Location-based contextual grounding
//!
//! Grounding significantly improves accuracy and provides verifiable citations
//! for information retrieval tasks.

#![allow(dead_code)]

use serde::{Deserialize, Serialize};

/// Google Search grounding configuration
///
/// Enables real-time web search to ground responses in factual, up-to-date information.
/// Pricing: $35 per 1000 search queries (in addition to base model pricing).
///
/// # Example
/// ```rust
/// use crate::core::llm::providers::google_grounding::SearchGroundingConfig;
///
/// let config = SearchGroundingConfig {
///     enabled: true,
///     dynamic_retrieval_threshold: Some(0.5),
/// };
/// ```
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SearchGroundingConfig {
    /// Enable Google Search grounding
    #[serde(default)]
    pub enabled: bool,

    /// Dynamic retrieval threshold (0.0 - 1.0)
    /// Controls when to trigger search based on query complexity
    /// Lower values = more aggressive search usage
    /// Higher values = only search when highly confident it's needed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dynamic_retrieval_threshold: Option<f32>,
}

/// Google Maps grounding configuration
///
/// Enables location-based contextual grounding for queries about places,
/// businesses, and geographic information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapsGroundingConfig {
    /// Place ID from Google Maps Place API
    /// Example: "ChIJN1t_tDeuEmsRUsoyG83frY4" (Google Sydney office)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub place_id: Option<String>,

    /// Geographic location coordinates
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<GeoLocation>,
}

/// Geographic location with latitude and longitude
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoLocation {
    /// Latitude in decimal degrees (-90 to 90)
    pub latitude: f64,

    /// Longitude in decimal degrees (-180 to 180)
    pub longitude: f64,
}

impl GeoLocation {
    /// Create a new geographic location
    pub fn new(latitude: f64, longitude: f64) -> Result<Self, String> {
        if !(-90.0..=90.0).contains(&latitude) {
            return Err(format!(
                "Invalid latitude: {}. Must be between -90 and 90",
                latitude
            ));
        }
        if !(-180.0..=180.0).contains(&longitude) {
            return Err(format!(
                "Invalid longitude: {}. Must be between -180 and 180",
                longitude
            ));
        }
        Ok(Self {
            latitude,
            longitude,
        })
    }
}

/// Complete grounding configuration combining search and maps
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GroundingConfig {
    /// Google Search grounding settings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search: Option<SearchGroundingConfig>,

    /// Google Maps grounding settings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub maps: Option<MapsGroundingConfig>,
}

impl GroundingConfig {
    /// Create a new grounding config with search enabled
    pub fn with_search(dynamic_threshold: Option<f32>) -> Self {
        Self {
            search: Some(SearchGroundingConfig {
                enabled: true,
                dynamic_retrieval_threshold: dynamic_threshold,
            }),
            maps: None,
        }
    }

    /// Create a new grounding config with maps location
    pub fn with_maps_location(latitude: f64, longitude: f64) -> Result<Self, String> {
        Ok(Self {
            search: None,
            maps: Some(MapsGroundingConfig {
                place_id: None,
                location: Some(GeoLocation::new(latitude, longitude)?),
            }),
        })
    }

    /// Create a new grounding config with maps place ID
    pub fn with_maps_place(place_id: String) -> Self {
        Self {
            search: None,
            maps: Some(MapsGroundingConfig {
                place_id: Some(place_id),
                location: None,
            }),
        }
    }

    /// Check if any grounding is enabled
    pub fn is_enabled(&self) -> bool {
        self.search.as_ref().is_some_and(|s| s.enabled)
            || self
                .maps
                .as_ref()
                .is_some_and(|m| m.place_id.is_some() || m.location.is_some())
    }
}

/// Search result from Google Search grounding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    /// Page title
    pub title: String,

    /// URL of the source
    pub url: String,

    /// Text snippet from the page
    pub snippet: String,

    /// Relevance score (0.0 - 1.0) if available
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relevance_score: Option<f32>,
}

/// Map result from Google Maps grounding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapResult {
    /// Place name
    pub name: String,

    /// Place ID
    pub place_id: String,

    /// Formatted address
    pub address: String,

    /// Location coordinates
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<GeoLocation>,

    /// Rating (1.0 - 5.0) if available
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rating: Option<f32>,

    /// Business types (e.g., "restaurant", "cafe")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub types: Option<Vec<String>>,
}

/// URL citation with grounding attribution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UrlCitation {
    /// URL being cited
    pub url: String,

    /// Title of the source page
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,

    /// Start index in the response text where this citation applies
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_index: Option<u32>,

    /// End index in the response text where this citation applies
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_index: Option<u32>,
}

/// Grounding metadata returned in the response
///
/// Contains all grounding attribution information including search results,
/// map results, and inline citations.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GroundingMetadata {
    /// Search results from Google Search grounding
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_results: Option<Vec<SearchResult>>,

    /// Map results from Google Maps grounding
    #[serde(skip_serializing_if = "Option::is_none")]
    pub map_results: Option<Vec<MapResult>>,

    /// URL citations with specific text attribution
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url_citations: Option<Vec<UrlCitation>>,

    /// Web search queries that were executed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_queries: Option<Vec<String>>,

    /// Total number of grounding sources used
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grounding_source_count: Option<u32>,
}

impl GroundingMetadata {
    /// Check if any grounding data is present
    pub fn has_grounding(&self) -> bool {
        self.search_results.as_ref().is_some_and(|r| !r.is_empty())
            || self.map_results.as_ref().is_some_and(|r| !r.is_empty())
            || self.url_citations.as_ref().is_some_and(|c| !c.is_empty())
    }

    /// Get total number of sources
    pub fn source_count(&self) -> usize {
        self.search_results.as_ref().map_or(0, |r| r.len())
            + self.map_results.as_ref().map_or(0, |r| r.len())
    }

    /// Get all unique URLs from all grounding sources
    pub fn all_urls(&self) -> Vec<String> {
        let mut urls = Vec::new();

        if let Some(search_results) = &self.search_results {
            urls.extend(search_results.iter().map(|r| r.url.clone()));
        }

        if let Some(citations) = &self.url_citations {
            urls.extend(citations.iter().map(|c| c.url.clone()));
        }

        // Remove duplicates while preserving order
        let mut seen = std::collections::HashSet::new();
        urls.retain(|url| seen.insert(url.clone()));

        urls
    }

    /// Format grounding attribution as markdown for display
    pub fn format_as_markdown(&self) -> String {
        if !self.has_grounding() {
            return String::new();
        }

        let mut output = String::from("\n\n---\n### Sources\n\n");

        if let Some(search_results) = &self.search_results {
            if !search_results.is_empty() {
                output.push_str("**Web Search Results:**\n");
                for (i, result) in search_results.iter().enumerate() {
                    output.push_str(&format!(
                        "{}. [{}]({})\n   > {}\n\n",
                        i + 1,
                        result.title,
                        result.url,
                        result.snippet
                    ));
                }
            }
        }

        if let Some(map_results) = &self.map_results {
            if !map_results.is_empty() {
                output.push_str("**Location Information:**\n");
                for (i, result) in map_results.iter().enumerate() {
                    output.push_str(&format!("{}. **{}**\n", i + 1, result.name));
                    output.push_str(&format!("   Address: {}\n", result.address));
                    if let Some(rating) = result.rating {
                        output.push_str(&format!("   Rating: {:.1}/5.0\n", rating));
                    }
                    output.push('\n');
                }
            }
        }

        output
    }
}

/// Request body structure for Google API with grounding
#[derive(Debug, Clone, Serialize)]
pub(crate) struct GoogleGroundingRequest {
    /// Base request fields (contents, config, tools, etc.)
    #[serde(flatten)]
    pub base: serde_json::Value,

    /// Grounding configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grounding_config: Option<GoogleApiGroundingConfig>,
}

/// Internal Google API grounding configuration format
#[derive(Debug, Clone, Serialize)]
pub(crate) struct GoogleApiGroundingConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub google_search_grounding: Option<GoogleSearchGroundingApi>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub google_maps_grounding: Option<GoogleMapsGroundingApi>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct GoogleSearchGroundingApi {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dynamic_retrieval_config: Option<DynamicRetrievalConfig>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct DynamicRetrievalConfig {
    /// Threshold for dynamic retrieval (0.0 - 1.0)
    pub dynamic_threshold: f32,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct GoogleMapsGroundingApi {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub place_id: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<LatLng>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct LatLng {
    pub latitude: f64,
    pub longitude: f64,
}

/// Response structure from Google API with grounding metadata
#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GoogleGroundingResponse {
    #[serde(flatten)]
    pub base_response: serde_json::Value,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub grounding_metadata: Option<GoogleApiGroundingMetadata>,
}

/// Internal Google API grounding metadata format
#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GoogleApiGroundingMetadata {
    #[serde(rename = "searchEntryPoint")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_entry_point: Option<SearchEntryPoint>,

    #[serde(rename = "groundingChunks")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grounding_chunks: Option<Vec<GroundingChunk>>,

    #[serde(rename = "groundingSupports")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grounding_supports: Option<Vec<GroundingSupport>>,

    #[serde(rename = "webSearchQueries")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub web_search_queries: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SearchEntryPoint {
    #[serde(rename = "renderedContent")]
    pub rendered_content: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GroundingChunk {
    pub web: Option<WebGroundingChunk>,
    pub maps: Option<MapsGroundingChunk>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct WebGroundingChunk {
    pub uri: String,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct MapsGroundingChunk {
    #[serde(rename = "placeId")]
    pub place_id: String,
    pub name: Option<String>,
    pub address: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GroundingSupport {
    #[serde(rename = "groundingChunkIndices")]
    pub grounding_chunk_indices: Option<Vec<u32>>,
    pub segment: Option<Segment>,
    #[serde(rename = "confidenceScores")]
    pub confidence_scores: Option<Vec<f32>>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct Segment {
    #[serde(rename = "startIndex")]
    pub start_index: Option<u32>,
    #[serde(rename = "endIndex")]
    pub end_index: Option<u32>,
    pub text: Option<String>,
}

/// Convert our public GroundingConfig to Google API format
pub(crate) fn build_api_grounding_config(
    config: &GroundingConfig,
) -> Option<GoogleApiGroundingConfig> {
    if !config.is_enabled() {
        return None;
    }

    let google_search_grounding = config.search.as_ref().and_then(|search| {
        if search.enabled {
            Some(GoogleSearchGroundingApi {
                dynamic_retrieval_config: search.dynamic_retrieval_threshold.map(|threshold| {
                    DynamicRetrievalConfig {
                        dynamic_threshold: threshold,
                    }
                }),
            })
        } else {
            None
        }
    });

    let google_maps_grounding = config.maps.as_ref().and_then(|maps| {
        let place_id = maps.place_id.clone();
        let location = maps.location.as_ref().map(|loc| LatLng {
            latitude: loc.latitude,
            longitude: loc.longitude,
        });

        if place_id.is_some() || location.is_some() {
            Some(GoogleMapsGroundingApi { place_id, location })
        } else {
            None
        }
    });

    if google_search_grounding.is_some() || google_maps_grounding.is_some() {
        Some(GoogleApiGroundingConfig {
            google_search_grounding,
            google_maps_grounding,
        })
    } else {
        None
    }
}

/// Parse grounding metadata from Google API response
pub(crate) fn parse_grounding_metadata(
    api_metadata: &GoogleApiGroundingMetadata,
) -> GroundingMetadata {
    let mut metadata = GroundingMetadata::default();

    // Parse grounding chunks into search results and map results
    if let Some(chunks) = &api_metadata.grounding_chunks {
        let mut search_results = Vec::new();
        let mut map_results = Vec::new();

        for chunk in chunks {
            if let Some(web) = &chunk.web {
                search_results.push(SearchResult {
                    title: web.title.clone().unwrap_or_else(|| "Untitled".to_string()),
                    url: web.uri.clone(),
                    snippet: String::new(), // Snippet comes from supports
                    relevance_score: None,
                });
            }

            if let Some(maps) = &chunk.maps {
                map_results.push(MapResult {
                    name: maps
                        .name
                        .clone()
                        .unwrap_or_else(|| "Unknown Place".to_string()),
                    place_id: maps.place_id.clone(),
                    address: maps.address.clone().unwrap_or_default(),
                    location: None,
                    rating: None,
                    types: None,
                });
            }
        }

        if !search_results.is_empty() {
            metadata.search_results = Some(search_results);
        }
        if !map_results.is_empty() {
            metadata.map_results = Some(map_results);
        }
    }

    // Parse grounding supports into citations
    if let Some(supports) = &api_metadata.grounding_supports {
        let mut citations = Vec::new();

        for support in supports {
            if let Some(segment) = &support.segment {
                if let Some(indices) = &support.grounding_chunk_indices {
                    for &chunk_idx in indices {
                        if let Some(chunks) = &api_metadata.grounding_chunks {
                            if let Some(chunk) = chunks.get(chunk_idx as usize) {
                                if let Some(web) = &chunk.web {
                                    citations.push(UrlCitation {
                                        url: web.uri.clone(),
                                        title: web.title.clone(),
                                        start_index: segment.start_index,
                                        end_index: segment.end_index,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        if !citations.is_empty() {
            metadata.url_citations = Some(citations);
        }
    }

    // Store search queries
    if let Some(queries) = &api_metadata.web_search_queries {
        metadata.search_queries = Some(queries.clone());
    }

    // Calculate total source count
    metadata.grounding_source_count = Some(metadata.source_count() as u32);

    metadata
}

/// Calculate additional cost for grounding
///
/// Google Search Grounding: $35 per 1000 queries
/// Google Maps Grounding: No additional cost (included in base model pricing)
pub fn calculate_grounding_cost(metadata: &GroundingMetadata) -> f64 {
    let mut cost = 0.0;

    // Search grounding cost: $35 per 1000 queries = $0.035 per query
    if let Some(queries) = &metadata.search_queries {
        let query_count = queries.len() as f64;
        cost += query_count * 0.035;
    }

    // Maps grounding is free (no additional cost)

    cost
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_geo_location_validation() {
        // Valid locations
        assert!(GeoLocation::new(37.7749, -122.4194).is_ok()); // San Francisco
        assert!(GeoLocation::new(0.0, 0.0).is_ok()); // Null Island
        assert!(GeoLocation::new(90.0, 180.0).is_ok()); // Max values
        assert!(GeoLocation::new(-90.0, -180.0).is_ok()); // Min values

        // Invalid locations
        assert!(GeoLocation::new(91.0, 0.0).is_err()); // Latitude too high
        assert!(GeoLocation::new(-91.0, 0.0).is_err()); // Latitude too low
        assert!(GeoLocation::new(0.0, 181.0).is_err()); // Longitude too high
        assert!(GeoLocation::new(0.0, -181.0).is_err()); // Longitude too low
    }

    #[test]
    fn test_grounding_config_enabled() {
        let config = GroundingConfig::default();
        assert!(!config.is_enabled());

        let config_search = GroundingConfig::with_search(Some(0.5));
        assert!(config_search.is_enabled());

        let config_maps = GroundingConfig::with_maps_location(37.7749, -122.4194).unwrap();
        assert!(config_maps.is_enabled());
    }

    #[test]
    fn test_grounding_metadata_source_count() {
        let mut metadata = GroundingMetadata::default();
        assert_eq!(metadata.source_count(), 0);
        assert!(!metadata.has_grounding());

        metadata.search_results = Some(vec![SearchResult {
            title: "Test".to_string(),
            url: "https://example.com".to_string(),
            snippet: "Test snippet".to_string(),
            relevance_score: None,
        }]);
        assert_eq!(metadata.source_count(), 1);
        assert!(metadata.has_grounding());

        metadata.map_results = Some(vec![MapResult {
            name: "Test Place".to_string(),
            place_id: "test_id".to_string(),
            address: "123 Test St".to_string(),
            location: None,
            rating: None,
            types: None,
        }]);
        assert_eq!(metadata.source_count(), 2);
    }

    #[test]
    fn test_grounding_metadata_all_urls() {
        let mut metadata = GroundingMetadata::default();

        metadata.search_results = Some(vec![
            SearchResult {
                title: "Test 1".to_string(),
                url: "https://example1.com".to_string(),
                snippet: "Snippet 1".to_string(),
                relevance_score: None,
            },
            SearchResult {
                title: "Test 2".to_string(),
                url: "https://example2.com".to_string(),
                snippet: "Snippet 2".to_string(),
                relevance_score: None,
            },
        ]);

        metadata.url_citations = Some(vec![
            UrlCitation {
                url: "https://example1.com".to_string(), // Duplicate
                title: Some("Test 1".to_string()),
                start_index: Some(0),
                end_index: Some(10),
            },
            UrlCitation {
                url: "https://example3.com".to_string(),
                title: Some("Test 3".to_string()),
                start_index: Some(20),
                end_index: Some(30),
            },
        ]);

        let urls = metadata.all_urls();
        assert_eq!(urls.len(), 3); // Duplicates removed
        assert!(urls.contains(&"https://example1.com".to_string()));
        assert!(urls.contains(&"https://example2.com".to_string()));
        assert!(urls.contains(&"https://example3.com".to_string()));
    }

    #[test]
    fn test_calculate_grounding_cost() {
        let mut metadata = GroundingMetadata::default();
        assert_eq!(calculate_grounding_cost(&metadata), 0.0);

        // Single search query: $0.035
        metadata.search_queries = Some(vec!["test query".to_string()]);
        assert!((calculate_grounding_cost(&metadata) - 0.035).abs() < 0.001);

        // Three search queries: $0.105
        metadata.search_queries = Some(vec![
            "query 1".to_string(),
            "query 2".to_string(),
            "query 3".to_string(),
        ]);
        assert!((calculate_grounding_cost(&metadata) - 0.105).abs() < 0.001);

        // Maps results don't add cost
        metadata.map_results = Some(vec![MapResult {
            name: "Test".to_string(),
            place_id: "test".to_string(),
            address: "123 Test".to_string(),
            location: None,
            rating: None,
            types: None,
        }]);
        assert!((calculate_grounding_cost(&metadata) - 0.105).abs() < 0.001);
    }

    #[test]
    fn test_build_api_grounding_config() {
        // Empty config
        let config = GroundingConfig::default();
        assert!(build_api_grounding_config(&config).is_none());

        // Search only
        let config = GroundingConfig::with_search(Some(0.7));
        let api_config = build_api_grounding_config(&config).unwrap();
        assert!(api_config.google_search_grounding.is_some());
        assert!(api_config.google_maps_grounding.is_none());

        // Maps only
        let config = GroundingConfig::with_maps_place("test_place_id".to_string());
        let api_config = build_api_grounding_config(&config).unwrap();
        assert!(api_config.google_search_grounding.is_none());
        assert!(api_config.google_maps_grounding.is_some());

        // Both
        let config = GroundingConfig {
            search: Some(SearchGroundingConfig {
                enabled: true,
                dynamic_retrieval_threshold: Some(0.5),
            }),
            maps: Some(MapsGroundingConfig {
                place_id: Some("test_id".to_string()),
                location: None,
            }),
        };
        let api_config = build_api_grounding_config(&config).unwrap();
        assert!(api_config.google_search_grounding.is_some());
        assert!(api_config.google_maps_grounding.is_some());
    }

    #[test]
    fn test_markdown_formatting() {
        let mut metadata = GroundingMetadata::default();

        // Empty metadata
        assert_eq!(metadata.format_as_markdown(), "");

        // With search results
        metadata.search_results = Some(vec![SearchResult {
            title: "Example Article".to_string(),
            url: "https://example.com/article".to_string(),
            snippet: "This is a test snippet from the article.".to_string(),
            relevance_score: Some(0.95),
        }]);

        let markdown = metadata.format_as_markdown();
        assert!(markdown.contains("### Sources"));
        assert!(markdown.contains("**Web Search Results:**"));
        assert!(markdown.contains("Example Article"));
        assert!(markdown.contains("https://example.com/article"));
        assert!(markdown.contains("This is a test snippet"));

        // Add map results
        metadata.map_results = Some(vec![MapResult {
            name: "Test Restaurant".to_string(),
            place_id: "test_place_123".to_string(),
            address: "123 Main St, San Francisco, CA".to_string(),
            location: None,
            rating: Some(4.5),
            types: Some(vec!["restaurant".to_string()]),
        }]);

        let markdown = metadata.format_as_markdown();
        assert!(markdown.contains("**Location Information:**"));
        assert!(markdown.contains("Test Restaurant"));
        assert!(markdown.contains("123 Main St"));
        assert!(markdown.contains("Rating: 4.5/5.0"));
    }
}
