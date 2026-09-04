//! Artifact creation tool.
//!
//! Lets the model create a rich, renderable artifact (code, markdown, HTML,
//! Mermaid diagram, React component, spreadsheet/table, or presentation)
//! during a live chat turn. This is the LLM-facing trigger for the
//! Artifacts/Canvas feature: the model emits a normal tool call (exactly
//! like `document_create_word`/`document_create_pdf`), we persist it via the
//! existing `ArtifactState`/`SharedArtifactStore` (core/artifacts/store.rs),
//! and then emit a `chat:artifact` Tauri event so `TauriRuntime.ts` can push
//! a `{ type: 'artifact' }` stream chunk to the chat UI, reusing the exact
//! event -> StreamChunk -> StreamEvent -> message.artifacts pipeline that
//! already exists and works for tool calls / tool results.
//!
//! ## Type mapping
//!
//! The frontend's `ArtifactType` (packages/contracts/types/src/conversation.ts) is a
//! richer superset (`react`, `svg`, `table`, `markdown` as distinct from
//! `document`, etc.) than the backend's persistence-oriented `ArtifactType`
//! (core/artifacts/types.rs: Code/Document/Spreadsheet/Diagram/Web/Chart/
//! Presentation/Image). This tool accepts the frontend-shaped type string
//! directly and persists it as `Artifact::render_type`, while separately
//! mapping it to the closest coarse native `ArtifactType` + metadata for
//! native filtering/rendering. The exact `render_type` is also emitted on
//! the live event and reconstructed after a conversation reload, so rich
//! types such as `react` and `svg` round-trip without being downgraded.

use super::*;
use crate::core::artifacts::{
    ArtifactMetadata, ArtifactType as BackendArtifactType, CodeMetadata, CreateArtifactRequest,
    DiagramMetadata, DocumentMetadata, SpreadsheetMetadata, WebMetadata,
};
use crate::sys::commands::artifacts::ArtifactState;
use tauri::{Emitter, Manager};

/// Frontend-facing artifact types this tool accepts, in the exact casing the
/// `@agiworkforce/unified-chat` `ArtifactType` union and `ArtifactRenderer`/
/// `ArtifactPanel` dispatch on. Keep in sync with the allow-list in
/// `packages/ui/unified-chat/src/components/ArtifactRenderer.tsx` and
/// `ArtifactPanel.tsx`, types outside this list either aren't rendered at
/// all (e.g. `chart`) or have no backend persistence mapping yet.
const SUPPORTED_FRONTEND_TYPES: &[&str] = &[
    "code",
    "markdown",
    "document",
    "html",
    "mermaid",
    "react",
    "svg",
    "table",
    "csv",
    "spreadsheet",
    "presentation",
    "email",
];

/// Map a frontend artifact-type string to the closest backend `ArtifactType`
/// + default metadata for persistence. Returns `None` for unsupported types.
fn map_frontend_type(
    frontend_type: &str,
    language: Option<&str>,
) -> Option<(BackendArtifactType, ArtifactMetadata)> {
    match frontend_type {
        "code" => Some((
            BackendArtifactType::Code,
            ArtifactMetadata::Code(CodeMetadata {
                language: language.unwrap_or("text").to_string(),
                ..Default::default()
            }),
        )),
        // React has no coarse native category; use Code for native filtering
        // while `Artifact::render_type` remains `react` for lossless reload.
        "react" => Some((
            BackendArtifactType::Code,
            ArtifactMetadata::Code(CodeMetadata {
                language: language.unwrap_or("tsx").to_string(),
                ..Default::default()
            }),
        )),
        "markdown" | "document" => Some((
            BackendArtifactType::Document,
            ArtifactMetadata::Document(DocumentMetadata {
                format: "markdown".to_string(),
                ..Default::default()
            }),
        )),
        "html" => Some((
            BackendArtifactType::Web,
            ArtifactMetadata::Web(WebMetadata::default()),
        )),
        "mermaid" => Some((
            BackendArtifactType::Diagram,
            ArtifactMetadata::Diagram(DiagramMetadata {
                diagram_type: "mermaid".to_string(),
                theme: None,
            }),
        )),
        // SVG uses Image as its coarse native category while the exact
        // `Artifact::render_type` remains `svg` for the sanitized renderer.
        "svg" => Some((BackendArtifactType::Image, ArtifactMetadata::default())),
        // Tabular types (CSV/TSV or JSON array-of-objects content) all render
        // through the shared SpreadsheetArtifact and persist as Spreadsheet.
        "table" | "spreadsheet" | "csv" => Some((
            BackendArtifactType::Spreadsheet,
            ArtifactMetadata::Spreadsheet(SpreadsheetMetadata::default()),
        )),
        "presentation" => Some((
            BackendArtifactType::Presentation,
            ArtifactMetadata::default(),
        )),
        // Email drafts have no backend-native type; persist as Document (plain
        // text with optional RFC-822-style headers) while the wire event keeps
        // `type: "email"` so the frontend renders it with EmailArtifact.
        "email" => Some((
            BackendArtifactType::Document,
            ArtifactMetadata::Document(DocumentMetadata {
                format: "text".to_string(),
                ..Default::default()
            }),
        )),
        _ => None,
    }
}

impl ToolExecutor {
    pub(crate) async fn execute_create_artifact_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        let app = match &self.app_handle {
            Some(app) => app.clone(),
            None => {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": "App handle not available for artifact creation", "success": false }),
                    error: Some("App handle not available for artifact creation".to_string()),
                    metadata: HashMap::new(),
                });
            }
        };

        let frontend_type = match args.get("artifact_type").and_then(|v| v.as_str()) {
            Some(t) if !t.trim().is_empty() => t.trim().to_lowercase(),
            _ => {
                let message = "Missing artifact_type parameter".to_string();
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": message, "success": false }),
                    error: Some(message),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                });
            }
        };

        let title = match args.get("title").and_then(|v| v.as_str()) {
            Some(t) if !t.trim().is_empty() => t.trim().to_string(),
            _ => {
                let message = "Missing title parameter".to_string();
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": message, "success": false }),
                    error: Some(message),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                });
            }
        };

        let content = match args.get("content").and_then(|v| v.as_str()) {
            Some(c) if !c.is_empty() => c.to_string(),
            _ => {
                let message = "Missing content parameter".to_string();
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": message, "success": false }),
                    error: Some(message),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                });
            }
        };

        let language = args
            .get("language")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let Some((backend_type, metadata)) = map_frontend_type(&frontend_type, language.as_deref())
        else {
            let message = format!(
                "Unsupported artifact_type '{}'. Supported types: {}.",
                frontend_type,
                SUPPORTED_FRONTEND_TYPES.join(", ")
            );
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": message, "success": false }),
                error: Some(message),
                metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
            });
        };

        let state = app.state::<ArtifactState>();
        let request = CreateArtifactRequest {
            title: title.clone(),
            artifact_type: backend_type,
            render_type: Some(frontend_type.clone()),
            content: content.clone(),
            metadata: Some(metadata),
            conversation_id: self.conversation_id,
            message_id: None,
            tags: None,
        };

        let create_result = if self.persist_internal_resources {
            state.0.create(request)
        } else {
            state.0.create_ephemeral(request)
        };
        let artifact = match create_result {
            Ok(artifact) => artifact,
            Err(e) => {
                let message = format!("Failed to create artifact: {}", e);
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": message, "success": false }),
                    error: Some(message),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                });
            }
        };

        // Emit the wire event the frontend listens for (TauriRuntime.ts
        // registers a `chat:artifact` listener mirroring `chat:stream-chunk`).
        // The `artifact.type` sent over the wire is the ORIGINAL frontend
        // type string (not the coarser backend enum) so the renderer picks
        // the right sub-component (ReactPreview, MermaidArtifact, etc.).
        let payload = json!({
            "conversation_id": self.conversation_id,
            "message_id": self.frontend_message_id,
            "artifact": {
                "id": artifact.id,
                "type": frontend_type,
                "title": title,
                "content": content,
                "language": language,
                "metadata": {},
                "version": artifact.current_version,
                "created_at": artifact.created_at,
                "updated_at": artifact.updated_at,
            }
        });
        let _ = app.emit("chat:artifact", payload);

        Ok(ToolResult {
            success: true,
            data: json!({
                "artifact_id": artifact.id,
                "artifact_type": frontend_type,
                "title": title,
                "status": "created",
                "success": true,
            }),
            error: None,
            metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_all_supported_frontend_types() {
        for &frontend_type in SUPPORTED_FRONTEND_TYPES {
            let mapped = map_frontend_type(frontend_type, None);
            assert!(
                mapped.is_some(),
                "expected a backend mapping for supported type '{frontend_type}'"
            );
        }
    }

    #[test]
    fn rejects_unsupported_frontend_type() {
        assert!(map_frontend_type("chart", None).is_none());
        assert!(map_frontend_type("video", None).is_none());
        assert!(map_frontend_type("", None).is_none());
    }

    #[test]
    fn code_type_uses_requested_language() {
        let (backend_type, metadata) = map_frontend_type("code", Some("python")).unwrap();
        assert_eq!(backend_type, BackendArtifactType::Code);
        match metadata {
            ArtifactMetadata::Code(meta) => assert_eq!(meta.language, "python"),
            other => panic!("expected Code metadata, got {other:?}"),
        }
    }

    #[test]
    fn csv_type_maps_to_spreadsheet() {
        let (backend_type, metadata) = map_frontend_type("csv", None).unwrap();
        assert_eq!(backend_type, BackendArtifactType::Spreadsheet);
        assert!(matches!(metadata, ArtifactMetadata::Spreadsheet(_)));
    }

    #[test]
    fn email_type_maps_to_document() {
        let (backend_type, metadata) = map_frontend_type("email", None).unwrap();
        assert_eq!(backend_type, BackendArtifactType::Document);
        match metadata {
            ArtifactMetadata::Document(meta) => assert_eq!(meta.format, "text"),
            other => panic!("expected Document metadata, got {other:?}"),
        }
    }

    #[test]
    fn mermaid_type_maps_to_diagram() {
        let (backend_type, metadata) = map_frontend_type("mermaid", None).unwrap();
        assert_eq!(backend_type, BackendArtifactType::Diagram);
        match metadata {
            ArtifactMetadata::Diagram(meta) => assert_eq!(meta.diagram_type, "mermaid"),
            other => panic!("expected Diagram metadata, got {other:?}"),
        }
    }
}
