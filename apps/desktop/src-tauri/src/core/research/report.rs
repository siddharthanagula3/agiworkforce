//! Research report generation.
//!
//! This module generates comprehensive Markdown reports from research findings,
//! including inline citations and confidence indicators.

use super::citation::{Citation, CitationFormat, CitationTracker};
use super::types::{ConfidenceLevel, ResearchError, ResearchMode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A section of the research report.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportSection {
    /// Section ID
    pub id: String,

    /// Section heading
    pub heading: String,

    /// Section content (Markdown)
    pub content: String,

    /// Confidence level for this section
    pub confidence: ConfidenceLevel,

    /// Citation IDs referenced in this section
    pub citations: Vec<String>,

    /// Subsections
    pub subsections: Vec<ReportSection>,

    /// Order index for sorting
    pub order: usize,
}

impl ReportSection {
    /// Creates a new report section.
    pub fn new(id: &str, heading: &str, content: &str) -> Self {
        Self {
            id: id.to_string(),
            heading: heading.to_string(),
            content: content.to_string(),
            confidence: ConfidenceLevel::Medium,
            citations: Vec::new(),
            subsections: Vec::new(),
            order: 0,
        }
    }

    /// Builder method to set confidence level.
    pub fn with_confidence(mut self, confidence: ConfidenceLevel) -> Self {
        self.confidence = confidence;
        self
    }

    /// Builder method to set order.
    pub fn with_order(mut self, order: usize) -> Self {
        self.order = order;
        self
    }

    /// Builder method to add citations.
    pub fn with_citations(mut self, citations: Vec<String>) -> Self {
        self.citations = citations;
        self
    }

    /// Adds a subsection.
    pub fn add_subsection(&mut self, subsection: ReportSection) {
        self.subsections.push(subsection);
    }

    /// Renders this section to Markdown.
    pub fn render(&self, level: usize, show_confidence: bool) -> String {
        let heading_prefix = "#".repeat(level.min(6));
        let mut output = String::new();

        // Heading with optional confidence indicator
        if show_confidence {
            output.push_str(&format!(
                "{} {} {}\n\n",
                heading_prefix,
                self.heading,
                self.confidence.indicator()
            ));
        } else {
            output.push_str(&format!("{} {}\n\n", heading_prefix, self.heading));
        }

        // Content
        if !self.content.is_empty() {
            output.push_str(&self.content);
            output.push_str("\n\n");
        }

        // Subsections
        for subsection in &self.subsections {
            output.push_str(&subsection.render(level + 1, show_confidence));
        }

        output
    }
}

/// The complete research report.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchReport {
    /// Report title
    pub title: String,

    /// Executive summary
    pub summary: String,

    /// Key findings (bullet points)
    pub key_findings: Vec<String>,

    /// Report sections
    pub sections: Vec<ReportSection>,

    /// Overall confidence level
    pub overall_confidence: ConfidenceLevel,

    /// Citation format used
    pub citation_format: CitationFormat,

    /// All citations
    pub citations: Vec<Citation>,

    /// Metadata
    pub metadata: ReportMetadata,
}

/// Metadata about the report.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportMetadata {
    /// Query that generated this report
    pub query: String,

    /// Research mode used
    pub mode: ResearchMode,

    /// When the report was generated (Unix timestamp)
    pub generated_at: i64,

    /// Total research duration in seconds
    pub research_duration_secs: u64,

    /// Number of sources examined
    pub sources_examined: usize,

    /// Number of search iterations
    pub iterations: usize,

    /// Breakdown of sources by type
    pub sources_by_type: HashMap<String, usize>,
}

impl ResearchReport {
    /// Renders the complete report to Markdown.
    pub fn render(&self, show_confidence: bool) -> String {
        let mut output = String::new();

        // Title
        output.push_str(&format!("# {}\n\n", self.title));

        // Metadata header
        output.push_str(&format!(
            "*Research completed on {} | Mode: {:?} | {} sources cited*\n\n",
            chrono::DateTime::from_timestamp(self.metadata.generated_at, 0)
                .map(|dt| dt.format("%Y-%m-%d %H:%M UTC").to_string())
                .unwrap_or_else(|| "Unknown".into()),
            self.metadata.mode,
            self.citations.len()
        ));

        // Overall confidence indicator
        if show_confidence {
            output.push_str(&format!(
                "**Overall Confidence:** {} ({:?})\n\n",
                self.overall_confidence.indicator(),
                self.overall_confidence
            ));
        }

        // Summary
        output.push_str("## Summary\n\n");
        output.push_str(&self.summary);
        output.push_str("\n\n");

        // Key findings
        if !self.key_findings.is_empty() {
            output.push_str("## Key Findings\n\n");
            for finding in &self.key_findings {
                output.push_str(&format!("- {}\n", finding));
            }
            output.push('\n');
        }

        // Main sections
        for section in &self.sections {
            output.push_str(&section.render(2, show_confidence));
        }

        // Sources/References
        output.push_str("## Sources\n\n");
        if self.citations.is_empty() {
            output.push_str("*No sources cited*\n\n");
        } else {
            for citation in &self.citations {
                output.push_str(&citation.render_reference(self.citation_format));
                output.push('\n');
            }
            output.push('\n');
        }

        // Research methodology note
        output.push_str("---\n\n");
        output.push_str(&format!(
            "*This report was generated through automated research examining {} sources over {} seconds.*\n",
            self.metadata.sources_examined,
            self.metadata.research_duration_secs
        ));

        output
    }
}

/// Builder for creating research reports.
pub struct ResearchReportGenerator {
    /// Citation tracker
    citation_tracker: CitationTracker,

    /// Report title
    title: String,

    /// Summary text
    summary: String,

    /// Key findings
    key_findings: Vec<String>,

    /// Report sections
    sections: Vec<ReportSection>,

    /// Overall confidence
    overall_confidence: ConfidenceLevel,

    /// Show confidence indicators
    show_confidence: bool,

    /// Report metadata
    metadata: ReportMetadata,
}

impl ResearchReportGenerator {
    /// Creates a new report generator.
    pub fn new(query: &str, mode: ResearchMode) -> Self {
        Self {
            citation_tracker: CitationTracker::new(CitationFormat::Numbered),
            title: format!("Research: {}", truncate_title(query, 60)),
            summary: String::new(),
            key_findings: Vec::new(),
            sections: Vec::new(),
            overall_confidence: ConfidenceLevel::Medium,
            show_confidence: true,
            metadata: ReportMetadata {
                query: query.to_string(),
                mode,
                generated_at: chrono::Utc::now().timestamp(),
                research_duration_secs: 0,
                sources_examined: 0,
                iterations: 0,
                sources_by_type: HashMap::new(),
            },
        }
    }

    /// Sets the report title.
    pub fn with_title(mut self, title: &str) -> Self {
        self.title = title.to_string();
        self
    }

    /// Sets the summary.
    pub fn with_summary(mut self, summary: &str) -> Self {
        self.summary = summary.to_string();
        self
    }

    /// Adds a key finding.
    pub fn add_key_finding(&mut self, finding: &str) {
        self.key_findings.push(finding.to_string());
    }

    /// Sets all key findings.
    pub fn with_key_findings(mut self, findings: Vec<String>) -> Self {
        self.key_findings = findings;
        self
    }

    /// Adds a section to the report.
    pub fn add_section(&mut self, section: ReportSection) {
        self.sections.push(section);
    }

    /// Sets the overall confidence level.
    pub fn with_confidence(mut self, confidence: ConfidenceLevel) -> Self {
        self.overall_confidence = confidence;
        self
    }

    /// Sets whether to show confidence indicators.
    pub fn show_confidence_indicators(mut self, show: bool) -> Self {
        self.show_confidence = show;
        self
    }

    /// Sets the research duration.
    pub fn with_duration(mut self, duration_secs: u64) -> Self {
        self.metadata.research_duration_secs = duration_secs;
        self
    }

    /// Sets the number of sources examined.
    pub fn with_sources_examined(mut self, count: usize) -> Self {
        self.metadata.sources_examined = count;
        self
    }

    /// Sets the number of iterations.
    pub fn with_iterations(mut self, count: usize) -> Self {
        self.metadata.iterations = count;
        self
    }

    /// Sets the sources by type breakdown.
    pub fn with_sources_by_type(mut self, sources: HashMap<String, usize>) -> Self {
        self.metadata.sources_by_type = sources;
        self
    }

    /// Adds a citation and returns the citation marker.
    pub fn add_citation(&mut self, citation: Citation) -> String {
        self.citation_tracker.add_citation(citation)
    }

    /// Gets the citation tracker for direct manipulation.
    pub fn citation_tracker_mut(&mut self) -> &mut CitationTracker {
        &mut self.citation_tracker
    }

    /// Builds the final report.
    pub fn build(mut self) -> Result<ResearchReport, ResearchError> {
        // Sort sections by order
        self.sections.sort_by_key(|s| s.order);

        // Update metadata with citation stats
        let citation_summary = self.citation_tracker.source_summary();
        for (source_type, count) in citation_summary {
            self.metadata
                .sources_by_type
                .insert(source_type.as_str().to_string(), count);
        }

        // Calculate overall confidence from section confidences
        if !self.sections.is_empty() {
            let avg_confidence: f32 = self
                .sections
                .iter()
                .map(|s| s.confidence.score())
                .sum::<f32>()
                / self.sections.len() as f32;
            self.overall_confidence = ConfidenceLevel::from_score(avg_confidence);
        }

        let citations: Vec<Citation> = self
            .citation_tracker
            .all_citations()
            .into_iter()
            .cloned()
            .collect();

        Ok(ResearchReport {
            title: self.title,
            summary: self.summary,
            key_findings: self.key_findings,
            sections: self.sections,
            overall_confidence: self.overall_confidence,
            citation_format: CitationFormat::Numbered,
            citations,
            metadata: self.metadata,
        })
    }

    /// Builds and renders the report to Markdown.
    pub fn build_markdown(self) -> Result<String, ResearchError> {
        let show_confidence = self.show_confidence;
        let report = self.build()?;
        Ok(report.render(show_confidence))
    }
}

/// Synthesizes multiple search results into a coherent report section.
pub fn synthesize_findings(
    results: &[super::agents::SearchResult],
    section_title: &str,
    citation_tracker: &mut CitationTracker,
) -> ReportSection {
    let mut content = String::new();
    let mut citation_ids = Vec::new();

    // Group by relevance
    let mut sorted_results: Vec<_> = results.iter().collect();
    sorted_results.sort_by(|a, b| {
        b.relevance
            .partial_cmp(&a.relevance)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    for result in sorted_results.iter().take(5) {
        // Add citation
        let citation = result.to_citation(0);
        let citation_id = citation.id.clone();
        let marker = citation_tracker.add_citation(citation);
        citation_ids.push(citation_id);

        // Add to content
        if !result.content.is_empty() {
            content.push_str(&result.content);
            content.push_str(&format!(" {}\n\n", marker));
        }
    }

    // Calculate confidence based on number and relevance of sources
    let avg_relevance = if sorted_results.is_empty() {
        0.0
    } else {
        sorted_results.iter().map(|r| r.relevance).sum::<f32>() / sorted_results.len() as f32
    };
    let confidence = ConfidenceLevel::from_score(avg_relevance);

    ReportSection::new(
        &format!("section_{}", uuid::Uuid::new_v4()),
        section_title,
        &content,
    )
    .with_confidence(confidence)
    .with_citations(citation_ids)
}

/// Truncates a title to a maximum length, adding ellipsis if needed.
fn truncate_title(title: &str, max_len: usize) -> String {
    if title.len() <= max_len {
        title.to_string()
    } else {
        format!("{}...", &title[..max_len.saturating_sub(3)])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_report_section_render() {
        let section = ReportSection::new("test", "Test Section", "This is test content.")
            .with_confidence(ConfidenceLevel::High);

        let rendered = section.render(2, true);
        assert!(rendered.contains("## Test Section"));
        assert!(rendered.contains("[+]"));
        assert!(rendered.contains("This is test content."));
    }

    #[test]
    fn test_report_generator_basic() {
        let report = ResearchReportGenerator::new("What is Rust?", ResearchMode::Quick)
            .with_summary("Rust is a systems programming language.")
            .with_key_findings(vec!["Rust is memory safe".into(), "Rust is fast".into()])
            .with_confidence(ConfidenceLevel::High)
            .build()
            .unwrap();

        assert_eq!(report.key_findings.len(), 2);
        assert_eq!(report.overall_confidence, ConfidenceLevel::High);
    }

    #[test]
    fn test_report_render_to_markdown() {
        let mut generator = ResearchReportGenerator::new("Test Query", ResearchMode::Standard)
            .with_summary("Test summary");

        generator.add_section(
            ReportSection::new("sec1", "Introduction", "Intro content")
                .with_order(0)
                .with_confidence(ConfidenceLevel::High),
        );

        let markdown = generator.build_markdown().unwrap();
        assert!(markdown.contains("# Research: Test Query"));
        assert!(markdown.contains("## Summary"));
        assert!(markdown.contains("## Introduction"));
        assert!(markdown.contains("## Sources"));
    }

    #[test]
    fn test_truncate_title() {
        assert_eq!(truncate_title("Short", 10), "Short");
        assert_eq!(
            truncate_title("This is a very long title", 10),
            "This is..."
        );
    }
}
