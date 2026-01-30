//! Citation tracking and generation for research reports.
//!
//! This module provides comprehensive citation management including:
//! - Source tracking with unique identifiers
//! - Multiple citation formats (inline, numbered, footnote)
//! - Deduplication of sources
//! - Citation linking to content

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};

/// Types of sources that can be cited.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceType {
    /// Web page or online article
    WebPage,
    /// PDF or other document
    Document,
    /// Email message
    Email,
    /// Calendar event
    CalendarEvent,
    /// Internal memory/knowledge
    Memory,
    /// Academic paper
    AcademicPaper,
    /// News article
    NewsArticle,
    /// Social media post
    SocialMedia,
    /// Code repository
    CodeRepository,
    /// Unknown or unclassified
    Unknown,
}

impl SourceType {
    pub fn as_str(&self) -> &'static str {
        match self {
            SourceType::WebPage => "Web Page",
            SourceType::Document => "Document",
            SourceType::Email => "Email",
            SourceType::CalendarEvent => "Calendar Event",
            SourceType::Memory => "Memory",
            SourceType::AcademicPaper => "Academic Paper",
            SourceType::NewsArticle => "News Article",
            SourceType::SocialMedia => "Social Media",
            SourceType::CodeRepository => "Code Repository",
            SourceType::Unknown => "Unknown",
        }
    }

    /// Returns a short prefix for inline citations.
    pub fn prefix(&self) -> &'static str {
        match self {
            SourceType::WebPage => "web",
            SourceType::Document => "doc",
            SourceType::Email => "email",
            SourceType::CalendarEvent => "cal",
            SourceType::Memory => "mem",
            SourceType::AcademicPaper => "paper",
            SourceType::NewsArticle => "news",
            SourceType::SocialMedia => "social",
            SourceType::CodeRepository => "repo",
            SourceType::Unknown => "src",
        }
    }
}

/// Format for rendering citations.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CitationFormat {
    /// Numbered citations: [1], [2], etc.
    #[default]
    Numbered,
    /// Author-date style: (Smith, 2024)
    AuthorDate,
    /// Footnote markers: ^1, ^2, etc.
    Footnote,
    /// Inline links: [title](url)
    InlineLink,
}

/// A citation representing a single source.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Citation {
    /// Unique citation ID within the research session
    pub id: String,

    /// Citation number for numbered format
    pub number: usize,

    /// Type of source
    pub source_type: SourceType,

    /// Title of the source
    pub title: String,

    /// URL if available
    pub url: Option<String>,

    /// Author or creator
    pub author: Option<String>,

    /// Date of the source (ISO format)
    pub date: Option<String>,

    /// Organization or publisher
    pub organization: Option<String>,

    /// Brief description or excerpt
    pub description: Option<String>,

    /// Relevance score (0.0 - 1.0)
    pub relevance_score: f32,

    /// Confidence in the source (0.0 - 1.0)
    pub confidence: f32,

    /// Sections of the report that cite this source
    pub cited_in_sections: Vec<String>,

    /// Raw content excerpt
    pub excerpt: Option<String>,

    /// Additional metadata
    pub metadata: HashMap<String, String>,
}

impl Citation {
    /// Creates a new citation with minimal information.
    pub fn new(
        id: &str,
        number: usize,
        source_type: SourceType,
        title: &str,
        relevance_score: f32,
    ) -> Self {
        Self {
            id: id.to_string(),
            number,
            source_type,
            title: title.to_string(),
            url: None,
            author: None,
            date: None,
            organization: None,
            description: None,
            relevance_score,
            confidence: 1.0,
            cited_in_sections: Vec::new(),
            excerpt: None,
            metadata: HashMap::new(),
        }
    }

    /// Builder-style method to set URL.
    pub fn with_url(mut self, url: &str) -> Self {
        self.url = Some(url.to_string());
        self
    }

    /// Builder-style method to set author.
    pub fn with_author(mut self, author: &str) -> Self {
        self.author = Some(author.to_string());
        self
    }

    /// Builder-style method to set date.
    pub fn with_date(mut self, date: &str) -> Self {
        self.date = Some(date.to_string());
        self
    }

    /// Builder-style method to set organization.
    pub fn with_organization(mut self, org: &str) -> Self {
        self.organization = Some(org.to_string());
        self
    }

    /// Builder-style method to set description.
    pub fn with_description(mut self, desc: &str) -> Self {
        self.description = Some(desc.to_string());
        self
    }

    /// Builder-style method to set excerpt.
    pub fn with_excerpt(mut self, excerpt: &str) -> Self {
        self.excerpt = Some(excerpt.to_string());
        self
    }

    /// Renders the citation marker in the specified format.
    pub fn render_marker(&self, format: CitationFormat) -> String {
        match format {
            CitationFormat::Numbered => format!("[{}]", self.number),
            CitationFormat::AuthorDate => {
                let author = self.author.as_deref().unwrap_or("Unknown");
                let year = self
                    .date
                    .as_ref()
                    .and_then(|d| d.split('-').next())
                    .unwrap_or("n.d.");
                format!("({}, {})", author, year)
            }
            CitationFormat::Footnote => format!("^{}", self.number),
            CitationFormat::InlineLink => {
                if let Some(url) = &self.url {
                    format!("[{}]({})", self.title, url)
                } else {
                    format!("[{}]", self.title)
                }
            }
        }
    }

    /// Renders the full citation for a reference list.
    pub fn render_reference(&self, format: CitationFormat) -> String {
        let mut parts = Vec::new();

        // Number or marker
        match format {
            CitationFormat::Numbered => parts.push(format!("[{}]", self.number)),
            CitationFormat::Footnote => parts.push(format!("^{}", self.number)),
            _ => {}
        }

        // Author if available
        if let Some(author) = &self.author {
            parts.push(author.clone());
        }

        // Title (with link if URL available)
        if let Some(url) = &self.url {
            parts.push(format!("\"[{}]({})\"", self.title, url));
        } else {
            parts.push(format!("\"{}\"", self.title));
        }

        // Organization
        if let Some(org) = &self.organization {
            parts.push(org.clone());
        }

        // Date
        if let Some(date) = &self.date {
            parts.push(format!("({})", date));
        }

        // Source type indicator
        parts.push(format!("[{}]", self.source_type.as_str()));

        parts.join(" - ")
    }
}

/// Tracks and manages citations across a research session.
#[derive(Debug)]
pub struct CitationTracker {
    /// All citations indexed by their ID
    citations: HashMap<String, Citation>,

    /// URL to citation ID mapping for deduplication
    url_index: HashMap<String, String>,

    /// Title hash to citation ID for fuzzy deduplication
    title_index: HashMap<String, String>,

    /// Counter for assigning citation numbers
    next_number: AtomicUsize,

    /// Preferred citation format
    format: CitationFormat,
}

impl CitationTracker {
    /// Creates a new citation tracker.
    pub fn new(format: CitationFormat) -> Self {
        Self {
            citations: HashMap::new(),
            url_index: HashMap::new(),
            title_index: HashMap::new(),
            next_number: AtomicUsize::new(1),
            format,
        }
    }

    /// Adds a citation and returns its citation marker.
    /// If a duplicate is found, returns the existing citation's marker.
    pub fn add_citation(&mut self, mut citation: Citation) -> String {
        // Check for URL-based duplicate
        if let Some(url) = &citation.url {
            if let Some(existing_id) = self.url_index.get(url) {
                if let Some(existing) = self.citations.get(existing_id) {
                    return existing.render_marker(self.format);
                }
            }
        }

        // Check for title-based duplicate (fuzzy matching)
        let title_key = Self::normalize_title(&citation.title);
        if let Some(existing_id) = self.title_index.get(&title_key).cloned() {
            let should_update = self
                .citations
                .get(&existing_id)
                .map(|e| citation.relevance_score > e.relevance_score)
                .unwrap_or(false);

            if should_update {
                if let Some(c) = self.citations.get_mut(&existing_id) {
                    c.relevance_score = citation.relevance_score;
                }
            }

            if let Some(existing) = self.citations.get(&existing_id) {
                return existing.render_marker(self.format);
            }
        }

        // Assign citation number
        citation.number = self.next_number.fetch_add(1, Ordering::SeqCst);

        // Generate unique ID if not provided
        if citation.id.is_empty() {
            citation.id = format!(
                "{}_{}_{}",
                citation.source_type.prefix(),
                citation.number,
                uuid::Uuid::new_v4()
                    .to_string()
                    .split('-')
                    .next()
                    .unwrap_or("x")
            );
        }

        let id = citation.id.clone();
        let marker = citation.render_marker(self.format);

        // Index by URL
        if let Some(url) = &citation.url {
            self.url_index.insert(url.clone(), id.clone());
        }

        // Index by normalized title
        self.title_index.insert(title_key, id.clone());

        // Store the citation
        self.citations.insert(id, citation);

        marker
    }

    /// Retrieves a citation by ID.
    pub fn get_citation(&self, id: &str) -> Option<&Citation> {
        self.citations.get(id)
    }

    /// Retrieves a citation by number.
    pub fn get_by_number(&self, number: usize) -> Option<&Citation> {
        self.citations.values().find(|c| c.number == number)
    }

    /// Returns all citations sorted by number.
    pub fn all_citations(&self) -> Vec<&Citation> {
        let mut citations: Vec<_> = self.citations.values().collect();
        citations.sort_by_key(|c| c.number);
        citations
    }

    /// Returns citations sorted by relevance score.
    pub fn by_relevance(&self) -> Vec<&Citation> {
        let mut citations: Vec<_> = self.citations.values().collect();
        citations.sort_by(|a, b| {
            b.relevance_score
                .partial_cmp(&a.relevance_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        citations
    }

    /// Returns citations filtered by source type.
    pub fn by_source_type(&self, source_type: SourceType) -> Vec<&Citation> {
        self.citations
            .values()
            .filter(|c| c.source_type == source_type)
            .collect()
    }

    /// Marks that a citation was used in a specific section.
    pub fn cite_in_section(&mut self, citation_id: &str, section: &str) {
        if let Some(citation) = self.citations.get_mut(citation_id) {
            if !citation.cited_in_sections.contains(&section.to_string()) {
                citation.cited_in_sections.push(section.to_string());
            }
        }
    }

    /// Returns the total number of citations.
    pub fn count(&self) -> usize {
        self.citations.len()
    }

    /// Generates the reference list section for the report.
    pub fn generate_reference_list(&self) -> String {
        let mut output = String::from("## Sources\n\n");

        let citations = self.all_citations();
        if citations.is_empty() {
            output.push_str("*No sources cited*\n");
            return output;
        }

        for citation in citations {
            output.push_str(&citation.render_reference(self.format));
            output.push('\n');
        }

        output
    }

    /// Generates a summary of sources by type.
    pub fn source_summary(&self) -> HashMap<SourceType, usize> {
        let mut summary = HashMap::new();
        for citation in self.citations.values() {
            *summary.entry(citation.source_type).or_insert(0) += 1;
        }
        summary
    }

    /// Normalizes a title for fuzzy matching.
    fn normalize_title(title: &str) -> String {
        title
            .to_lowercase()
            .chars()
            .filter(|c| c.is_alphanumeric() || c.is_whitespace())
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    }
}

impl Default for CitationTracker {
    fn default() -> Self {
        Self::new(CitationFormat::Numbered)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_citation_creation() {
        let citation = Citation::new("test_1", 1, SourceType::WebPage, "Test Article", 0.85)
            .with_url("https://example.com")
            .with_author("John Doe")
            .with_date("2024-01-15");

        assert_eq!(citation.title, "Test Article");
        assert_eq!(citation.number, 1);
        assert!(citation.url.is_some());
    }

    #[test]
    fn test_citation_markers() {
        let citation = Citation::new("test_1", 1, SourceType::WebPage, "Test", 0.9);

        assert_eq!(citation.render_marker(CitationFormat::Numbered), "[1]");
        assert_eq!(citation.render_marker(CitationFormat::Footnote), "^1");
    }

    #[test]
    fn test_citation_tracker_deduplication() {
        let mut tracker = CitationTracker::new(CitationFormat::Numbered);

        let c1 = Citation::new("", 0, SourceType::WebPage, "Test Article", 0.8)
            .with_url("https://example.com/article");

        let c2 = Citation::new("", 0, SourceType::WebPage, "Test Article", 0.9)
            .with_url("https://example.com/article");

        let marker1 = tracker.add_citation(c1);
        let marker2 = tracker.add_citation(c2);

        // Should return the same marker due to URL deduplication
        assert_eq!(marker1, marker2);
        assert_eq!(tracker.count(), 1);
    }

    #[test]
    fn test_citation_tracker_multiple() {
        let mut tracker = CitationTracker::new(CitationFormat::Numbered);

        let c1 = Citation::new("", 0, SourceType::WebPage, "Article One", 0.8);
        let c2 = Citation::new("", 0, SourceType::Document, "Document Two", 0.7);

        tracker.add_citation(c1);
        tracker.add_citation(c2);

        assert_eq!(tracker.count(), 2);

        let by_type = tracker.by_source_type(SourceType::WebPage);
        assert_eq!(by_type.len(), 1);
    }

    #[test]
    fn test_title_normalization() {
        assert_eq!(
            CitationTracker::normalize_title("  The Quick   Brown Fox!  "),
            "the quick brown fox"
        );
    }
}
