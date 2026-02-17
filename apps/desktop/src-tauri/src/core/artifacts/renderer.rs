//! Artifact Renderer
//!
//! Provides rendering utilities for artifacts, generating preview data
//! suitable for frontend display.

use super::types::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Rendered artifact data ready for frontend display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderedArtifact {
    /// Artifact ID
    pub id: String,
    /// Artifact title
    pub title: String,
    /// Artifact type
    pub artifact_type: ArtifactType,
    /// Rendered content (may be transformed from source)
    pub rendered_content: RenderedContent,
    /// Version information
    pub version_info: VersionInfo,
    /// Status
    pub status: ArtifactStatus,
    /// Actions available for this artifact
    pub available_actions: Vec<ArtifactAction>,
}

/// Rendered content varies by artifact type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum RenderedContent {
    /// Code with syntax highlighting hints
    Code(CodeRenderData),
    /// Document with parsed markdown
    Document(DocumentRenderData),
    /// Spreadsheet with parsed data
    Spreadsheet(SpreadsheetRenderData),
    /// Diagram with source and hints
    Diagram(DiagramRenderData),
    /// Web content (HTML) with sandbox config
    Web(WebRenderData),
    /// Chart with parsed configuration
    Chart(ChartRenderData),
    /// Presentation slides
    Presentation(PresentationRenderData),
    /// Image data
    Image(ImageRenderData),
}

/// Code render data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeRenderData {
    /// Source code content
    pub source: String,
    /// Programming language
    pub language: String,
    /// Lines to highlight
    pub highlight_lines: Vec<u32>,
    /// Whether this is executable
    pub executable: bool,
    /// Line count
    pub line_count: usize,
    /// Suggested file extension
    pub file_extension: String,
}

/// Document render data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentRenderData {
    /// Source content (markdown or plain text)
    pub source: String,
    /// Document format
    pub format: String,
    /// Table of contents
    pub toc: Vec<TocEntry>,
    /// Word count
    pub word_count: u32,
    /// Character count
    pub char_count: usize,
}

/// Spreadsheet render data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpreadsheetRenderData {
    /// Parsed rows as JSON array
    pub rows: Vec<HashMap<String, serde_json::Value>>,
    /// Column headers
    pub columns: Vec<ColumnInfo>,
    /// Total row count
    pub row_count: usize,
    /// Whether data is editable
    pub editable: bool,
}

/// Column information for spreadsheet
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub width: Option<u32>,
}

/// Diagram render data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagramRenderData {
    /// Source diagram code
    pub source: String,
    /// Diagram type (mermaid, plantuml, etc.)
    pub diagram_type: String,
    /// Theme for rendering
    pub theme: String,
}

/// Web render data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebRenderData {
    /// HTML content
    pub html: String,
    /// Whether scripts are enabled
    pub scripts_enabled: bool,
    /// Sandbox permissions
    pub sandbox_permissions: Vec<String>,
    /// Viewport dimensions
    pub viewport: Option<(u32, u32)>,
}

/// Chart render data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartRenderData {
    /// Chart type
    pub chart_type: String,
    /// Data points
    pub data: Vec<HashMap<String, serde_json::Value>>,
    /// X-axis configuration
    pub x_axis: Option<AxisConfig>,
    /// Y-axis configuration
    pub y_axis: Option<AxisConfig>,
    /// Series configuration
    pub series: Vec<SeriesConfig>,
    /// Show legend
    pub show_legend: bool,
    /// Colors
    pub colors: Vec<String>,
}

/// Axis configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AxisConfig {
    pub label: Option<String>,
    pub data_key: String,
}

/// Series configuration for charts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeriesConfig {
    pub data_key: String,
    pub name: Option<String>,
    pub color: Option<String>,
}

/// Presentation render data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresentationRenderData {
    /// Slides content
    pub slides: Vec<SlideData>,
    /// Total slide count
    pub slide_count: usize,
    /// Current slide (for preview)
    pub current_slide: usize,
}

/// Individual slide data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlideData {
    pub index: usize,
    pub title: Option<String>,
    pub content: String,
    pub notes: Option<String>,
}

/// Image render data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageRenderData {
    /// Base64 encoded image or URL
    pub source: String,
    /// Image format (png, jpg, svg, etc.)
    pub format: String,
    /// Dimensions
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// Alt text
    pub alt_text: Option<String>,
}

/// Version information for display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionInfo {
    pub current: u32,
    pub total: usize,
    pub created_at: String,
    pub updated_at: String,
}

/// Available actions for an artifact
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactAction {
    Copy,
    Download,
    Edit,
    Delete,
    Pin,
    Share,
    ExportPdf,
    ExportWord,
    ExportExcel,
    ExportSvg,
    ExportPng,
    CopyMarkdown,
    Run,
    ApplyToFile,
}

/// Artifact renderer
pub struct ArtifactRenderer;

impl ArtifactRenderer {
    /// Render an artifact for frontend display
    pub fn render(artifact: &Artifact) -> RenderedArtifact {
        let rendered_content = Self::render_content(artifact);
        let available_actions = Self::get_available_actions(artifact);

        RenderedArtifact {
            id: artifact.id.clone(),
            title: artifact.title.clone(),
            artifact_type: artifact.artifact_type,
            rendered_content,
            version_info: VersionInfo {
                current: artifact.current_version,
                total: artifact.versions.len(),
                created_at: artifact.created_at.to_rfc3339(),
                updated_at: artifact.updated_at.to_rfc3339(),
            },
            status: artifact.status,
            available_actions,
        }
    }

    /// Render content based on artifact type
    fn render_content(artifact: &Artifact) -> RenderedContent {
        match artifact.artifact_type {
            ArtifactType::Code => RenderedContent::Code(Self::render_code(artifact)),
            ArtifactType::Document => RenderedContent::Document(Self::render_document(artifact)),
            ArtifactType::Spreadsheet => {
                RenderedContent::Spreadsheet(Self::render_spreadsheet(artifact))
            }
            ArtifactType::Diagram => RenderedContent::Diagram(Self::render_diagram(artifact)),
            ArtifactType::Web => RenderedContent::Web(Self::render_web(artifact)),
            ArtifactType::Chart => RenderedContent::Chart(Self::render_chart(artifact)),
            ArtifactType::Presentation => {
                RenderedContent::Presentation(Self::render_presentation(artifact))
            }
            ArtifactType::Image => RenderedContent::Image(Self::render_image(artifact)),
        }
    }

    fn render_code(artifact: &Artifact) -> CodeRenderData {
        let (language, highlight_lines, executable, file_path) = match &artifact.metadata {
            ArtifactMetadata::Code(meta) => (
                meta.language.clone(),
                meta.highlight_lines.clone().unwrap_or_default(),
                meta.executable,
                meta.file_path.clone(),
            ),
            _ => ("text".to_string(), vec![], false, None),
        };

        let file_extension = file_path
            .as_ref()
            .and_then(|p| p.rsplit('.').next().map(|s| s.to_string()))
            .unwrap_or_else(|| Self::language_to_extension(&language));

        CodeRenderData {
            source: artifact.content.clone(),
            language,
            highlight_lines,
            executable,
            line_count: artifact.content.lines().count(),
            file_extension,
        }
    }

    fn render_document(artifact: &Artifact) -> DocumentRenderData {
        let (format, toc) = match &artifact.metadata {
            ArtifactMetadata::Document(meta) => {
                (meta.format.clone(), meta.toc.clone().unwrap_or_default())
            }
            _ => ("markdown".to_string(), vec![]),
        };

        let word_count = artifact.content.split_whitespace().count() as u32;

        DocumentRenderData {
            source: artifact.content.clone(),
            format,
            toc,
            word_count,
            char_count: artifact.content.chars().count(),
        }
    }

    fn render_spreadsheet(artifact: &Artifact) -> SpreadsheetRenderData {
        // Try to parse as JSON array
        let (rows, columns) = match serde_json::from_str::<Vec<HashMap<String, serde_json::Value>>>(
            &artifact.content,
        ) {
            Ok(parsed) => {
                let cols = if let Some(first) = parsed.first() {
                    first
                        .keys()
                        .map(|k| ColumnInfo {
                            name: k.clone(),
                            data_type: "string".to_string(),
                            width: None,
                        })
                        .collect()
                } else {
                    vec![]
                };
                (parsed, cols)
            }
            Err(_) => {
                // Try to parse as CSV
                let lines: Vec<&str> = artifact.content.lines().collect();
                if lines.is_empty() {
                    return SpreadsheetRenderData {
                        rows: vec![],
                        columns: vec![],
                        row_count: 0,
                        editable: true,
                    };
                }

                let headers: Vec<&str> = lines[0].split(',').map(|s| s.trim()).collect();
                let cols: Vec<ColumnInfo> = headers
                    .iter()
                    .map(|h| ColumnInfo {
                        name: h.to_string(),
                        data_type: "string".to_string(),
                        width: None,
                    })
                    .collect();

                let rows: Vec<HashMap<String, serde_json::Value>> = lines
                    .iter()
                    .skip(1)
                    .map(|line| {
                        let values: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
                        headers
                            .iter()
                            .zip(values.iter())
                            .map(|(h, v)| (h.to_string(), serde_json::Value::String(v.to_string())))
                            .collect()
                    })
                    .collect();

                (rows, cols)
            }
        };

        let row_count = rows.len();

        SpreadsheetRenderData {
            rows,
            columns,
            row_count,
            editable: true,
        }
    }

    fn render_diagram(artifact: &Artifact) -> DiagramRenderData {
        let (diagram_type, theme) = match &artifact.metadata {
            ArtifactMetadata::Diagram(meta) => (
                meta.diagram_type.clone(),
                meta.theme.clone().unwrap_or_default(),
            ),
            _ => ("mermaid".to_string(), "dark".to_string()),
        };

        DiagramRenderData {
            source: artifact.content.clone(),
            diagram_type,
            theme: if theme.is_empty() {
                "dark".to_string()
            } else {
                theme
            },
        }
    }

    fn render_web(artifact: &Artifact) -> WebRenderData {
        let (scripts_enabled, viewport) = match &artifact.metadata {
            ArtifactMetadata::Web(meta) => (meta.enable_scripts, meta.viewport),
            _ => (true, None),
        };

        // Default sandbox permissions
        let sandbox_permissions = vec!["allow-scripts".to_string(), "allow-modals".to_string()];

        WebRenderData {
            html: artifact.content.clone(),
            scripts_enabled,
            sandbox_permissions,
            viewport,
        }
    }

    fn render_chart(artifact: &Artifact) -> ChartRenderData {
        // Try to parse chart configuration
        let default_colors = vec![
            "#8884d8".to_string(),
            "#82ca9d".to_string(),
            "#ffc658".to_string(),
            "#ff8042".to_string(),
            "#a4de6c".to_string(),
            "#d084d0".to_string(),
        ];

        match serde_json::from_str::<serde_json::Value>(&artifact.content) {
            Ok(parsed) => {
                let chart_type = parsed
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("bar")
                    .to_string();

                let data: Vec<HashMap<String, serde_json::Value>> = parsed
                    .get("data")
                    .and_then(|v| serde_json::from_value(v.clone()).ok())
                    .unwrap_or_default();

                let x_key = parsed
                    .get("xKey")
                    .and_then(|v| v.as_str())
                    .unwrap_or("name");

                let series: Vec<SeriesConfig> = parsed
                    .get("bars")
                    .or(parsed.get("lines"))
                    .and_then(|v| serde_json::from_value(v.clone()).ok())
                    .unwrap_or_else(|| {
                        vec![SeriesConfig {
                            data_key: "value".to_string(),
                            name: None,
                            color: None,
                        }]
                    });

                ChartRenderData {
                    chart_type,
                    data,
                    x_axis: Some(AxisConfig {
                        label: None,
                        data_key: x_key.to_string(),
                    }),
                    y_axis: None,
                    series,
                    show_legend: true,
                    colors: default_colors,
                }
            }
            Err(_) => ChartRenderData {
                chart_type: "bar".to_string(),
                data: vec![],
                x_axis: None,
                y_axis: None,
                series: vec![],
                show_legend: true,
                colors: default_colors,
            },
        }
    }

    fn render_presentation(artifact: &Artifact) -> PresentationRenderData {
        // Parse markdown slides (separated by ---)
        let slides: Vec<SlideData> = artifact
            .content
            .split("\n---\n")
            .enumerate()
            .map(|(i, content)| {
                // Extract title from first heading
                let title = content
                    .lines()
                    .find(|l| l.starts_with('#'))
                    .map(|l| l.trim_start_matches('#').trim().to_string());

                SlideData {
                    index: i,
                    title,
                    content: content.to_string(),
                    notes: None,
                }
            })
            .collect();

        let slide_count = slides.len();

        PresentationRenderData {
            slides,
            slide_count,
            current_slide: 0,
        }
    }

    fn render_image(artifact: &Artifact) -> ImageRenderData {
        // Content could be base64 or URL
        let format = if artifact.content.starts_with("data:image/") {
            artifact
                .content
                .split(';')
                .next()
                .and_then(|s| s.strip_prefix("data:image/"))
                .unwrap_or("png")
                .to_string()
        } else if artifact.content.ends_with(".svg") || artifact.content.contains(".svg?") {
            "svg".to_string()
        } else if artifact.content.ends_with(".gif") || artifact.content.contains(".gif?") {
            "gif".to_string()
        } else if artifact.content.ends_with(".webp") || artifact.content.contains(".webp?") {
            "webp".to_string()
        } else {
            "png".to_string()
        };

        ImageRenderData {
            source: artifact.content.clone(),
            format,
            width: None,
            height: None,
            alt_text: Some(artifact.title.clone()),
        }
    }

    fn get_available_actions(artifact: &Artifact) -> Vec<ArtifactAction> {
        let mut actions = vec![
            ArtifactAction::Copy,
            ArtifactAction::Download,
            ArtifactAction::Pin,
        ];

        if artifact.status == ArtifactStatus::Complete {
            actions.push(ArtifactAction::Edit);
            actions.push(ArtifactAction::Delete);
        }

        // Type-specific actions
        match artifact.artifact_type {
            ArtifactType::Code => {
                actions.push(ArtifactAction::ApplyToFile);
                if let ArtifactMetadata::Code(meta) = &artifact.metadata {
                    if meta.executable {
                        actions.push(ArtifactAction::Run);
                    }
                }
            }
            ArtifactType::Document | ArtifactType::Presentation => {
                actions.push(ArtifactAction::ExportPdf);
                actions.push(ArtifactAction::ExportWord);
            }
            ArtifactType::Spreadsheet => {
                actions.push(ArtifactAction::ExportExcel);
                actions.push(ArtifactAction::CopyMarkdown);
            }
            ArtifactType::Chart | ArtifactType::Diagram => {
                actions.push(ArtifactAction::ExportSvg);
                actions.push(ArtifactAction::ExportPng);
            }
            _ => {}
        }

        actions
    }

    fn language_to_extension(language: &str) -> String {
        match language.to_lowercase().as_str() {
            "rust" => "rs",
            "javascript" | "js" => "js",
            "typescript" | "ts" => "ts",
            "python" | "py" => "py",
            "go" | "golang" => "go",
            "java" => "java",
            "c" => "c",
            "c++" | "cpp" => "cpp",
            "csharp" | "c#" => "cs",
            "ruby" | "rb" => "rb",
            "php" => "php",
            "swift" => "swift",
            "kotlin" | "kt" => "kt",
            "scala" => "scala",
            "haskell" | "hs" => "hs",
            "elixir" | "ex" => "ex",
            "erlang" | "erl" => "erl",
            "clojure" | "clj" => "clj",
            "lua" => "lua",
            "perl" | "pl" => "pl",
            "r" => "r",
            "julia" | "jl" => "jl",
            "matlab" | "m" => "m",
            "sql" => "sql",
            "bash" | "sh" | "shell" => "sh",
            "powershell" | "ps1" => "ps1",
            "html" => "html",
            "css" => "css",
            "scss" | "sass" => "scss",
            "json" => "json",
            "yaml" | "yml" => "yaml",
            "toml" => "toml",
            "xml" => "xml",
            "markdown" | "md" => "md",
            "graphql" | "gql" => "graphql",
            "protobuf" | "proto" => "proto",
            "dockerfile" => "dockerfile",
            _ => "txt",
        }
        .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_code_artifact() {
        let artifact = Artifact::new(
            "test-id".to_string(),
            "Test Code".to_string(),
            ArtifactType::Code,
            "fn main() {\n    println!(\"Hello\");\n}".to_string(),
            ArtifactMetadata::Code(CodeMetadata {
                language: "rust".to_string(),
                file_path: Some("src/main.rs".to_string()),
                highlight_lines: Some(vec![2]),
                executable: true,
            }),
        );

        let rendered = ArtifactRenderer::render(&artifact);

        assert_eq!(rendered.artifact_type, ArtifactType::Code);

        if let RenderedContent::Code(data) = rendered.rendered_content {
            assert_eq!(data.language, "rust");
            assert_eq!(data.line_count, 3);
            assert_eq!(data.file_extension, "rs");
            assert!(data.executable);
        } else {
            panic!("Expected Code render data");
        }

        assert!(rendered.available_actions.contains(&ArtifactAction::Run));
        assert!(rendered
            .available_actions
            .contains(&ArtifactAction::ApplyToFile));
    }

    #[test]
    fn test_render_spreadsheet_json() {
        let content = r#"[
            {"name": "Alice", "age": 30, "city": "NYC"},
            {"name": "Bob", "age": 25, "city": "LA"}
        ]"#;

        let artifact = Artifact::new(
            "test-id".to_string(),
            "Test Data".to_string(),
            ArtifactType::Spreadsheet,
            content.to_string(),
            ArtifactMetadata::Spreadsheet(SpreadsheetMetadata::default()),
        );

        let rendered = ArtifactRenderer::render(&artifact);

        if let RenderedContent::Spreadsheet(data) = rendered.rendered_content {
            assert_eq!(data.row_count, 2);
            assert_eq!(data.columns.len(), 3);
        } else {
            panic!("Expected Spreadsheet render data");
        }
    }

    #[test]
    fn test_render_chart() {
        let content = r#"{
            "type": "bar",
            "data": [
                {"name": "A", "value": 10},
                {"name": "B", "value": 20}
            ],
            "xKey": "name"
        }"#;

        let artifact = Artifact::new(
            "test-id".to_string(),
            "Test Chart".to_string(),
            ArtifactType::Chart,
            content.to_string(),
            ArtifactMetadata::Chart(ChartMetadata::default()),
        );

        let rendered = ArtifactRenderer::render(&artifact);

        if let RenderedContent::Chart(data) = rendered.rendered_content {
            assert_eq!(data.chart_type, "bar");
            assert_eq!(data.data.len(), 2);
        } else {
            panic!("Expected Chart render data");
        }
    }
}
