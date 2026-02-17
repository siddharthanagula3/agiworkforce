//! Artifact Types
//!
//! Defines the core artifact types and structures for the artifact system.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Artifact type enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactType {
    /// Source code with syntax highlighting
    Code,
    /// Markdown or rich text document
    Document,
    /// Table/spreadsheet data
    Spreadsheet,
    /// Mermaid diagrams or ASCII art
    Diagram,
    /// Interactive HTML preview
    Web,
    /// Chart/visualization data (JSON for recharts)
    Chart,
    /// Presentation slides
    Presentation,
    /// Image artifact
    Image,
}

impl std::fmt::Display for ArtifactType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ArtifactType::Code => write!(f, "code"),
            ArtifactType::Document => write!(f, "document"),
            ArtifactType::Spreadsheet => write!(f, "spreadsheet"),
            ArtifactType::Diagram => write!(f, "diagram"),
            ArtifactType::Web => write!(f, "web"),
            ArtifactType::Chart => write!(f, "chart"),
            ArtifactType::Presentation => write!(f, "presentation"),
            ArtifactType::Image => write!(f, "image"),
        }
    }
}

impl ArtifactType {
    /// Get the default file extension for this artifact type
    pub fn default_extension(&self) -> &'static str {
        match self {
            ArtifactType::Code => "txt",
            ArtifactType::Document => "md",
            ArtifactType::Spreadsheet => "csv",
            ArtifactType::Diagram => "mmd",
            ArtifactType::Web => "html",
            ArtifactType::Chart => "json",
            ArtifactType::Presentation => "md",
            ArtifactType::Image => "png",
        }
    }

    /// Get the MIME type for this artifact type
    pub fn mime_type(&self) -> &'static str {
        match self {
            ArtifactType::Code => "text/plain",
            ArtifactType::Document => "text/markdown",
            ArtifactType::Spreadsheet => "text/csv",
            ArtifactType::Diagram => "text/plain",
            ArtifactType::Web => "text/html",
            ArtifactType::Chart => "application/json",
            ArtifactType::Presentation => "text/markdown",
            ArtifactType::Image => "image/png",
        }
    }
}

/// Code artifact metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeMetadata {
    /// Programming language
    pub language: String,
    /// File path (if applicable)
    pub file_path: Option<String>,
    /// Line numbers for highlighting
    pub highlight_lines: Option<Vec<u32>>,
    /// Whether this is executable
    pub executable: bool,
}

impl Default for CodeMetadata {
    fn default() -> Self {
        Self {
            language: "text".to_string(),
            file_path: None,
            highlight_lines: None,
            executable: false,
        }
    }
}

/// Document artifact metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    /// Document format (markdown, html, plain)
    pub format: String,
    /// Table of contents entries
    pub toc: Option<Vec<TocEntry>>,
    /// Word count
    pub word_count: Option<u32>,
}

impl Default for DocumentMetadata {
    fn default() -> Self {
        Self {
            format: "markdown".to_string(),
            toc: None,
            word_count: None,
        }
    }
}

/// Table of contents entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TocEntry {
    pub level: u8,
    pub title: String,
    pub anchor: String,
}

/// Spreadsheet artifact metadata
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SpreadsheetMetadata {
    /// Column headers
    pub columns: Vec<String>,
    /// Number of rows
    pub row_count: u32,
    /// Column types (string, number, date, etc.)
    pub column_types: Option<HashMap<String, String>>,
    /// Formula cells
    pub formulas: Option<HashMap<String, String>>,
}

/// Diagram artifact metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagramMetadata {
    /// Diagram type (mermaid, plantuml, ascii)
    pub diagram_type: String,
    /// Theme for rendering
    pub theme: Option<String>,
}

impl Default for DiagramMetadata {
    fn default() -> Self {
        Self {
            diagram_type: "mermaid".to_string(),
            theme: None,
        }
    }
}

/// Web artifact metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebMetadata {
    /// Whether to enable JavaScript
    pub enable_scripts: bool,
    /// External resources (CSS/JS CDN links)
    pub external_resources: Vec<String>,
    /// Viewport dimensions
    pub viewport: Option<(u32, u32)>,
}

impl Default for WebMetadata {
    fn default() -> Self {
        Self {
            enable_scripts: true,
            external_resources: Vec::new(),
            viewport: None,
        }
    }
}

/// Chart artifact metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartMetadata {
    /// Chart type (bar, line, pie, scatter, etc.)
    pub chart_type: String,
    /// X-axis label
    pub x_label: Option<String>,
    /// Y-axis label
    pub y_label: Option<String>,
    /// Legend configuration
    pub show_legend: bool,
}

impl Default for ChartMetadata {
    fn default() -> Self {
        Self {
            chart_type: "bar".to_string(),
            x_label: None,
            y_label: None,
            show_legend: true,
        }
    }
}

/// Union type for artifact-specific metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ArtifactMetadata {
    Code(CodeMetadata),
    Document(DocumentMetadata),
    Spreadsheet(SpreadsheetMetadata),
    Diagram(DiagramMetadata),
    Web(WebMetadata),
    Chart(ChartMetadata),
    /// Generic metadata for other types
    Generic(HashMap<String, serde_json::Value>),
}

impl Default for ArtifactMetadata {
    fn default() -> Self {
        ArtifactMetadata::Generic(HashMap::new())
    }
}

/// A single version of an artifact
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactVersion {
    /// Version number (1-indexed)
    pub version: u32,
    /// Content at this version
    pub content: String,
    /// Timestamp when this version was created
    pub created_at: DateTime<Utc>,
    /// Optional description of changes
    pub change_description: Option<String>,
    /// Size in bytes
    pub size_bytes: usize,
    /// Hash of content for deduplication
    pub content_hash: String,
}

/// Status of an artifact
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactStatus {
    /// Currently being generated/streamed
    Streaming,
    /// Complete and ready to view
    Complete,
    /// Generation failed
    Failed,
    /// Archived (hidden from default view)
    Archived,
}

/// Core artifact structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    /// Unique identifier
    pub id: String,
    /// Human-readable title
    pub title: String,
    /// Artifact type
    pub artifact_type: ArtifactType,
    /// Current content
    pub content: String,
    /// Type-specific metadata
    pub metadata: ArtifactMetadata,
    /// Conversation ID this artifact belongs to
    pub conversation_id: Option<i64>,
    /// Message ID that created this artifact
    pub message_id: Option<i64>,
    /// Current status
    pub status: ArtifactStatus,
    /// Version history
    pub versions: Vec<ArtifactVersion>,
    /// Current version number
    pub current_version: u32,
    /// When this artifact was created
    pub created_at: DateTime<Utc>,
    /// When this artifact was last updated
    pub updated_at: DateTime<Utc>,
    /// Tags for organization
    pub tags: Vec<String>,
    /// Whether this artifact is pinned
    pub pinned: bool,
}

impl Artifact {
    /// Create a new artifact with initial content
    pub fn new(
        id: String,
        title: String,
        artifact_type: ArtifactType,
        content: String,
        metadata: ArtifactMetadata,
    ) -> Self {
        let now = Utc::now();
        let content_hash = Self::hash_content(&content);
        let size_bytes = content.len();

        let initial_version = ArtifactVersion {
            version: 1,
            content: content.clone(),
            created_at: now,
            change_description: Some("Initial version".to_string()),
            size_bytes,
            content_hash,
        };

        Self {
            id,
            title,
            artifact_type,
            content,
            metadata,
            conversation_id: None,
            message_id: None,
            status: ArtifactStatus::Complete,
            versions: vec![initial_version],
            current_version: 1,
            created_at: now,
            updated_at: now,
            tags: Vec::new(),
            pinned: false,
        }
    }

    /// Create a new artifact that is being streamed
    pub fn new_streaming(
        id: String,
        title: String,
        artifact_type: ArtifactType,
        metadata: ArtifactMetadata,
    ) -> Self {
        let now = Utc::now();

        Self {
            id,
            title,
            artifact_type,
            content: String::new(),
            metadata,
            conversation_id: None,
            message_id: None,
            status: ArtifactStatus::Streaming,
            versions: Vec::new(),
            current_version: 0,
            created_at: now,
            updated_at: now,
            tags: Vec::new(),
            pinned: false,
        }
    }

    /// Append content during streaming
    pub fn append_content(&mut self, delta: &str) {
        self.content.push_str(delta);
        self.updated_at = Utc::now();
    }

    /// Finalize streaming and create initial version
    pub fn finalize_streaming(&mut self, change_description: Option<String>) {
        let now = Utc::now();
        let content_hash = Self::hash_content(&self.content);

        let version = ArtifactVersion {
            version: 1,
            content: self.content.clone(),
            created_at: now,
            change_description: change_description.or(Some("Initial version".to_string())),
            size_bytes: self.content.len(),
            content_hash,
        };

        self.versions.push(version);
        self.current_version = 1;
        self.status = ArtifactStatus::Complete;
        self.updated_at = now;
    }

    /// Update content and create a new version
    pub fn update_content(&mut self, content: String, change_description: Option<String>) {
        let now = Utc::now();
        let content_hash = Self::hash_content(&content);

        // Check if content actually changed
        if let Some(last_version) = self.versions.last() {
            if last_version.content_hash == content_hash {
                // Content unchanged, skip version
                return;
            }
        }

        let new_version = self.current_version + 1;

        let version = ArtifactVersion {
            version: new_version,
            content: content.clone(),
            created_at: now,
            change_description,
            size_bytes: content.len(),
            content_hash,
        };

        self.versions.push(version);
        self.content = content;
        self.current_version = new_version;
        self.updated_at = now;
    }

    /// Rollback to a specific version
    pub fn rollback_to_version(&mut self, version: u32) -> Result<(), String> {
        let version_data = self
            .versions
            .iter()
            .find(|v| v.version == version)
            .ok_or_else(|| format!("Version {} not found", version))?
            .clone();

        // Create a new version that restores the old content
        self.update_content(
            version_data.content,
            Some(format!("Rolled back to version {}", version)),
        );

        Ok(())
    }

    /// Get a specific version
    pub fn get_version(&self, version: u32) -> Option<&ArtifactVersion> {
        self.versions.iter().find(|v| v.version == version)
    }

    /// Get the diff between two versions
    pub fn get_version_diff(&self, from_version: u32, to_version: u32) -> Option<VersionDiff> {
        let from = self.get_version(from_version)?;
        let to = self.get_version(to_version)?;

        Some(VersionDiff {
            from_version,
            to_version,
            from_content: from.content.clone(),
            to_content: to.content.clone(),
            from_timestamp: from.created_at,
            to_timestamp: to.created_at,
        })
    }

    /// Mark the artifact as failed
    pub fn mark_failed(&mut self, reason: Option<String>) {
        self.status = ArtifactStatus::Failed;
        self.updated_at = Utc::now();
        if let Some(r) = reason {
            self.tags.push(format!("error:{}", r));
        }
    }

    /// Archive the artifact
    pub fn archive(&mut self) {
        self.status = ArtifactStatus::Archived;
        self.updated_at = Utc::now();
    }

    /// Unarchive the artifact
    pub fn unarchive(&mut self) {
        self.status = ArtifactStatus::Complete;
        self.updated_at = Utc::now();
    }

    /// Hash content for deduplication
    fn hash_content(content: &str) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        content.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }
}

/// Diff between two artifact versions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionDiff {
    pub from_version: u32,
    pub to_version: u32,
    pub from_content: String,
    pub to_content: String,
    pub from_timestamp: DateTime<Utc>,
    pub to_timestamp: DateTime<Utc>,
}

/// Request to create a new artifact
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateArtifactRequest {
    pub title: String,
    pub artifact_type: ArtifactType,
    pub content: String,
    pub metadata: Option<ArtifactMetadata>,
    pub conversation_id: Option<i64>,
    pub message_id: Option<i64>,
    pub tags: Option<Vec<String>>,
}

/// Request to update an artifact
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateArtifactRequest {
    pub id: String,
    pub content: String,
    pub change_description: Option<String>,
    pub title: Option<String>,
    pub metadata: Option<ArtifactMetadata>,
    pub tags: Option<Vec<String>>,
}

/// Summary of an artifact (for list views)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactSummary {
    pub id: String,
    pub title: String,
    pub artifact_type: ArtifactType,
    pub status: ArtifactStatus,
    pub current_version: u32,
    pub version_count: usize,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub size_bytes: usize,
    pub tags: Vec<String>,
    pub pinned: bool,
    pub conversation_id: Option<i64>,
}

impl From<&Artifact> for ArtifactSummary {
    fn from(artifact: &Artifact) -> Self {
        Self {
            id: artifact.id.clone(),
            title: artifact.title.clone(),
            artifact_type: artifact.artifact_type,
            status: artifact.status,
            current_version: artifact.current_version,
            version_count: artifact.versions.len(),
            created_at: artifact.created_at,
            updated_at: artifact.updated_at,
            size_bytes: artifact.content.len(),
            tags: artifact.tags.clone(),
            pinned: artifact.pinned,
            conversation_id: artifact.conversation_id,
        }
    }
}

/// Filter options for querying artifacts
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ArtifactFilter {
    pub artifact_types: Option<Vec<ArtifactType>>,
    pub statuses: Option<Vec<ArtifactStatus>>,
    pub tags: Option<Vec<String>>,
    pub conversation_id: Option<i64>,
    pub search_query: Option<String>,
    pub pinned_only: bool,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}
