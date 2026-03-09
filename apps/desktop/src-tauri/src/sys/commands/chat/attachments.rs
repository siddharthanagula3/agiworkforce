//! Attachment processing — text extraction, PDF handling, and multimodal content conversion.

use base64::Engine;
use tracing::{debug, info, warn};

use super::intent::should_attach_screen_context;
use super::state::MAX_FILE_EXTRACT_CHARS;
use super::types::ChatAttachment;
use crate::core::llm::{ContentPart, ImageDetail, ImageFormat, ImageInput};

/// Extract text content from document attachments (non-image files).
/// This enables full document support similar to ChatGPT, Claude, and Gemini.
/// Supported formats: .txt, .md, .json, .js, .ts, .py, .rs, .html, .css, .xml, .yaml, .toml, .csv, .log
/// PDF support requires the pdf-extract crate (text extraction only).
pub(crate) fn extract_text_from_attachments(
    attachments: &[ChatAttachment],
) -> Vec<(String, String)> {
    let mut extracted: Vec<(String, String)> = Vec::new();

    // Text file extensions that can be read directly
    let text_extensions = [
        ".txt",
        ".md",
        ".markdown",
        ".json",
        ".jsonl",
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".py",
        ".pyw",
        ".rs",
        ".go",
        ".java",
        ".kt",
        ".swift",
        ".c",
        ".cpp",
        ".h",
        ".hpp",
        ".cs",
        ".rb",
        ".php",
        ".html",
        ".htm",
        ".css",
        ".scss",
        ".sass",
        ".less",
        ".xml",
        ".yaml",
        ".yml",
        ".toml",
        ".ini",
        ".cfg",
        ".conf",
        ".env",
        ".csv",
        ".tsv",
        ".log",
        ".sh",
        ".bash",
        ".zsh",
        ".fish",
        ".ps1",
        ".sql",
        ".graphql",
        ".gql",
        ".vue",
        ".svelte",
        ".astro",
        ".dockerfile",
        ".gitignore",
        ".gitattributes",
        ".editorconfig",
        ".eslintrc",
        ".prettierrc",
        ".babelrc",
        ".npmrc",
        ".nvmrc",
    ];

    for attachment in attachments {
        // Skip images - they're handled separately as multimodal content
        if attachment.attachment_type == "image" {
            continue;
        }

        let content = match &attachment.content {
            Some(c) if !c.is_empty() => c,
            _ => {
                debug!(
                    "[Chat] Skipping attachment '{}' - no content provided",
                    attachment.name
                );
                continue;
            }
        };

        // Check if it's a text-based file
        let name_lower = attachment.name.to_lowercase();
        let is_text_file = text_extensions.iter().any(|ext| name_lower.ends_with(ext))
            || attachment.mime_type.as_deref().is_some_and(|mime| {
                mime.starts_with("text/")
                    || mime == "application/json"
                    || mime == "application/xml"
                    || mime == "application/javascript"
                    || mime == "application/typescript"
            });

        if is_text_file {
            // Decode base64 content to text
            let base64_data = if content.starts_with("data:") {
                content.split(',').nth(1).unwrap_or(content)
            } else {
                content
            };

            match base64::engine::general_purpose::STANDARD.decode(base64_data) {
                Ok(bytes) => {
                    match String::from_utf8(bytes) {
                        Ok(text) => {
                            // Truncate very large files to prevent context overflow
                            let truncated = if text.len() > MAX_FILE_EXTRACT_CHARS {
                                format!(
                                    "{}\n\n... [File truncated - showing first {} characters of {}]",
                                    &text[..MAX_FILE_EXTRACT_CHARS],
                                    MAX_FILE_EXTRACT_CHARS,
                                    text.len()
                                )
                            } else {
                                text
                            };
                            info!(
                                "[Chat] Extracted text from '{}' ({} chars)",
                                attachment.name,
                                truncated.len()
                            );
                            extracted.push((attachment.name.clone(), truncated));
                        }
                        Err(e) => {
                            warn!(
                                "[Chat] File '{}' is not valid UTF-8 text: {}",
                                attachment.name, e
                            );
                        }
                    }
                }
                Err(e) => {
                    warn!(
                        "[Chat] Failed to decode base64 content for '{}': {}",
                        attachment.name, e
                    );
                }
            }
        } else if name_lower.ends_with(".pdf") {
            // PDF extraction - attempt basic text extraction
            let base64_data = if content.starts_with("data:") {
                content.split(',').nth(1).unwrap_or(content)
            } else {
                content
            };

            match base64::engine::general_purpose::STANDARD.decode(base64_data) {
                Ok(bytes) => {
                    // Try to extract text from PDF using pdf-extract or similar
                    // For now, we'll use a basic approach or note that PDF support is limited
                    match extract_pdf_text(&bytes) {
                        Ok(text) if !text.trim().is_empty() => {
                            let truncated = if text.len() > MAX_FILE_EXTRACT_CHARS {
                                format!(
                                    "{}\n\n... [PDF truncated - showing first {} characters]",
                                    &text[..MAX_FILE_EXTRACT_CHARS],
                                    MAX_FILE_EXTRACT_CHARS
                                )
                            } else {
                                text
                            };
                            info!(
                                "[Chat] Extracted text from PDF '{}' ({} chars)",
                                attachment.name,
                                truncated.len()
                            );
                            extracted.push((attachment.name.clone(), truncated));
                        }
                        Ok(_) => {
                            warn!(
                                "[Chat] PDF '{}' appears to be empty or image-based (no extractable text)",
                                attachment.name
                            );
                            extracted.push((
                                attachment.name.clone(),
                                "[PDF attached but no text could be extracted - may be image-based or scanned]".to_string(),
                            ));
                        }
                        Err(e) => {
                            warn!(
                                "[Chat] Failed to extract text from PDF '{}': {}",
                                attachment.name, e
                            );
                            extracted.push((
                                attachment.name.clone(),
                                format!("[PDF attached but text extraction failed: {}]", e),
                            ));
                        }
                    }
                }
                Err(e) => {
                    warn!("[Chat] Failed to decode PDF '{}': {}", attachment.name, e);
                }
            }
        } else {
            // Unsupported file type - note it for the user
            debug!(
                "[Chat] Unsupported file type for text extraction: '{}' (type: {})",
                attachment.name, attachment.attachment_type
            );
            extracted.push((
                attachment.name.clone(),
                format!(
                    "[File '{}' attached but content extraction not supported for this file type]",
                    attachment.name
                ),
            ));
        }
    }

    extracted
}

/// Extract text from PDF bytes using pdf-extract crate
pub(crate) fn extract_pdf_text(pdf_bytes: &[u8]) -> Result<String, String> {
    pdf_extract::extract_text_from_mem(pdf_bytes).map_err(|e| e.to_string())
}

/// Convert ChatAttachments to ContentPart for multimodal messages.
/// Returns a Vec of ContentPart if any valid image attachments are found.
pub(crate) fn convert_attachments_to_content_parts(
    attachments: &[ChatAttachment],
) -> Vec<ContentPart> {
    let mut parts = Vec::new();

    for attachment in attachments {
        // Only process image attachments with content
        if attachment.attachment_type != "image" {
            debug!(
                "[Chat] Skipping non-image attachment: {} (type: {})",
                attachment.name, attachment.attachment_type
            );
            continue;
        }

        let content = match &attachment.content {
            Some(c) if !c.is_empty() => c,
            _ => {
                warn!(
                    "[Chat] Skipping image attachment '{}' - no content provided",
                    attachment.name
                );
                continue;
            }
        };

        // Determine the image format from mime_type
        let format = match attachment.mime_type.as_deref() {
            Some("image/png") => ImageFormat::Png,
            Some("image/jpeg") | Some("image/jpg") => ImageFormat::Jpeg,
            Some("image/webp") => ImageFormat::Webp,
            Some(other) => {
                warn!(
                    "[Chat] Unsupported image mime type '{}' for attachment '{}', defaulting to PNG",
                    other, attachment.name
                );
                ImageFormat::Png
            }
            None => {
                // Try to infer from file extension
                let name_lower = attachment.name.to_lowercase();
                if name_lower.ends_with(".png") {
                    ImageFormat::Png
                } else if name_lower.ends_with(".jpg") || name_lower.ends_with(".jpeg") {
                    ImageFormat::Jpeg
                } else if name_lower.ends_with(".webp") {
                    ImageFormat::Webp
                } else {
                    debug!(
                        "[Chat] Could not determine image format for '{}', defaulting to PNG",
                        attachment.name
                    );
                    ImageFormat::Png
                }
            }
        };

        // Decode base64 content
        // Handle both with and without data URL prefix
        let base64_data = if content.starts_with("data:") {
            // Extract base64 part after the comma
            content.split(',').nth(1).unwrap_or(content)
        } else {
            content
        };

        match base64::engine::general_purpose::STANDARD.decode(base64_data) {
            Ok(image_data) => {
                debug!(
                    "[Chat] Successfully decoded image attachment '{}' ({} bytes, format: {:?})",
                    attachment.name,
                    image_data.len(),
                    format
                );

                parts.push(ContentPart::Image {
                    image: ImageInput {
                        data: image_data,
                        format,
                        detail: ImageDetail::Auto,
                    },
                });
            }
            Err(e) => {
                warn!(
                    "[Chat] Failed to decode base64 content for attachment '{}': {}",
                    attachment.name, e
                );
            }
        }
    }

    if !parts.is_empty() {
        info!(
            "[Chat] Converted {} image attachment(s) to multimodal content",
            parts.len()
        );
    }

    parts
}

/// Check if a model is likely to support vision based on its name.
/// This is a heuristic check - providers should also implement supports_vision().
pub(crate) fn model_likely_supports_vision(model: &str) -> bool {
    let model_lower = model.to_lowercase();

    // Models that typically support vision
    let vision_models = [
        // OpenAI GPT-4+ models support vision
        "gpt-4",
        "gpt-5",
        "o1",
        "o3",
        // Anthropic Claude 3+ models support vision
        "claude-3",
        "claude-sonnet",
        "claude-opus",
        "claude-haiku",
        // Google Gemini models support vision
        "gemini",
        // Other vision-capable models
        "llava",
        "bakllava",
        "cogvlm",
        "qwen-vl",
        "qwen2-vl",
        "vision",
    ];

    // Check if the model contains any vision-supporting pattern
    vision_models
        .iter()
        .any(|pattern| model_lower.contains(pattern))
}

/// Process image attachments into multimodal content parts.
/// If no explicit attachments contain images but the user message implies screen context,
/// attempts to capture the primary screen.
///
/// Returns `Some(Vec<ContentPart>)` if multimodal content is available, `None` otherwise.
pub(crate) fn process_multimodal_attachments(
    attachments: Option<&Vec<ChatAttachment>>,
    model: &str,
    content: &str,
) -> Option<Vec<ContentPart>> {
    let mut multimodal_parts: Option<Vec<ContentPart>> = if let Some(attachments) = attachments {
        if !attachments.is_empty() {
            // Check if the model supports vision
            if model_likely_supports_vision(model) {
                let parts = convert_attachments_to_content_parts(attachments);
                if parts.is_empty() {
                    debug!("[Chat] No valid image attachments found after conversion");
                    None
                } else {
                    info!(
                        "[Chat] Including {} image(s) in multimodal message for model '{}'",
                        parts.len(),
                        model
                    );
                    Some(parts)
                }
            } else {
                warn!(
                        "[Chat] Model '{}' may not support vision - image attachments will be skipped. \
                        Consider using a vision-capable model like GPT-4, Claude 3+, or Gemini.",
                        model
                    );
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    if multimodal_parts.is_none() && should_attach_screen_context(content) {
        if model_likely_supports_vision(model) {
            use crate::automation::screen::capture_primary_screen;
            use image::{DynamicImage, ImageFormat as ImageOutputFormat};
            use std::io::Cursor;

            match capture_primary_screen() {
                Ok(capture) => {
                    let mut png_bytes = Vec::new();
                    let dynamic = DynamicImage::ImageRgba8(capture.pixels);
                    if dynamic
                        .write_to(&mut Cursor::new(&mut png_bytes), ImageOutputFormat::Png)
                        .is_ok()
                    {
                        multimodal_parts = Some(vec![ContentPart::Image {
                            image: ImageInput {
                                data: png_bytes,
                                format: ImageFormat::Png,
                                detail: ImageDetail::Auto,
                            },
                        }]);
                        info!("[Chat] Attached screen context for vision request");
                    } else {
                        warn!("[Chat] Failed to encode screen capture");
                    }
                }
                Err(e) => {
                    warn!("[Chat] Failed to capture screen context: {}", e);
                }
            }
        } else {
            warn!(
                "[Chat] Screen context requested but model '{}' may not support vision",
                model
            );
        }
    }

    multimodal_parts
}

/// Extract text from document attachments (non-image files like PDFs, text files)
/// and build a system message with the document contents.
///
/// Returns `Some(document_context_string)` if documents were extracted, `None` otherwise.
pub(crate) fn process_document_attachments(
    attachments: Option<&Vec<ChatAttachment>>,
    llm_messages: &mut Vec<crate::core::llm::ChatMessage>,
) -> Option<String> {
    if let Some(attachments) = attachments {
        let extracted_text = extract_text_from_attachments(attachments);
        if !extracted_text.is_empty() {
            let mut document_context = String::from("## Attached Documents\n\nThe user has attached the following files. Their contents are provided below:\n\n");

            for (filename, content) in &extracted_text {
                document_context.push_str(&format!(
                    "### File: {}\n```\n{}\n```\n\n",
                    filename, content
                ));
            }

            document_context.push_str("Use the content above to help answer the user's question. You can reference specific parts of the files in your response.\n");

            llm_messages.push(crate::core::llm::ChatMessage {
                role: "system".to_string(),
                content: document_context.clone(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            });

            info!(
                "[Chat] Added {} document(s) to context ({} total chars)",
                extracted_text.len(),
                extracted_text.iter().map(|(_, c)| c.len()).sum::<usize>()
            );

            return Some(document_context);
        }
    }
    None
}
