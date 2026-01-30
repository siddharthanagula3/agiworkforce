//! OCR (Optical Character Recognition) executor.
//!
//! Handles text extraction from images using Tesseract OCR engine.
//! Supports multiple image formats and provides fallback behavior when
//! the OCR feature is not available.
//!
//! # Feature Flags
//!
//! The `ocr` feature must be enabled in Cargo.toml for actual OCR functionality.
//! When disabled, the executor returns a user-friendly error explaining that
//! OCR is not available in this build.
//!
//! # Supported Image Formats
//!
//! When OCR is enabled, the following formats are supported:
//! - PNG (.png)
//! - JPEG (.jpg, .jpeg)
//! - WebP (.webp)
//! - BMP (.bmp)
//! - TIFF (.tiff, .tif)
//! - GIF (.gif)
//!
//! # Example
//!
//! ```ignore
//! let executor = OcrExecutor::new();
//! let mut params = HashMap::new();
//! params.insert("image_path".to_string(), json!("/path/to/image.png"));
//!
//! let result = executor.execute("image_ocr", &params, &context, &exec_context).await?;
//! // result: { "success": true, "text": "Extracted text...", "confidence": 0.95 }
//! ```

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;

/// Supported image file extensions for OCR.
const SUPPORTED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp", "tiff", "tif", "gif"];

/// Executor for OCR operations.
///
/// Provides text extraction from images using Tesseract OCR. When the `ocr`
/// feature is disabled, returns a helpful error message explaining that
/// OCR functionality requires Tesseract to be installed.
///
/// # Security
///
/// - Validates image paths against allowed directories
/// - Verifies files exist before processing
/// - Validates file extensions against supported formats
pub struct OcrExecutor;

impl OcrExecutor {
    /// Create a new OCR executor.
    pub fn new() -> Self {
        Self
    }

    /// Check if OCR is available in this build.
    ///
    /// Returns `true` when compiled with the `ocr` feature flag.
    #[inline]
    pub fn is_available() -> bool {
        cfg!(feature = "ocr")
    }

    /// Validate that the image path exists and has a supported extension.
    ///
    /// # Arguments
    ///
    /// * `path` - The path to validate
    ///
    /// # Returns
    ///
    /// Ok(()) if the path is valid, or an error describing the issue.
    fn validate_image_path(path: &Path) -> Result<()> {
        // Check file exists
        if !path.exists() {
            return Err(anyhow!("Image file not found: '{}'", path.display()));
        }

        // Check it's a file, not a directory
        if path.is_dir() {
            return Err(anyhow!(
                "Path is a directory, not an image file: '{}'",
                path.display()
            ));
        }

        // Validate extension
        let extension = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_lowercase());

        match extension {
            Some(ext) if SUPPORTED_EXTENSIONS.contains(&ext.as_str()) => Ok(()),
            Some(ext) => Err(anyhow!(
                "Unsupported image format '.{}'. Supported formats: {}",
                ext,
                SUPPORTED_EXTENSIONS.join(", ")
            )),
            None => Err(anyhow!(
                "File has no extension. Cannot determine image format for: '{}'",
                path.display()
            )),
        }
    }

    /// Validate the image path is within allowed directories.
    ///
    /// # Security
    ///
    /// - Canonicalizes the path to resolve symlinks and `..` components
    /// - Validates the canonicalized path is within allowed directories
    /// - Logs security violations for audit trail
    fn validate_path_security(
        path: &Path,
        context: &ExecutorContext,
    ) -> Result<std::path::PathBuf> {
        // Canonicalize the path to resolve symlinks and prevent path traversal
        let canonical_path = std::fs::canonicalize(path)
            .map_err(|e| anyhow!("Invalid or inaccessible path '{}': {}", path.display(), e))?;

        // Validate the path is within allowed directories
        let allowed_directories = context.get_allowed_directories();
        let path_allowed = if allowed_directories.is_empty() {
            tracing::warn!(
                "[OcrExecutor] No allowed_directories configured - OCR access unrestricted. \
                Consider configuring allowed directories for security."
            );
            true
        } else {
            allowed_directories
                .iter()
                .any(|allowed_dir| canonical_path.starts_with(allowed_dir))
        };

        if !path_allowed {
            tracing::error!(
                "[OcrExecutor] Path access blocked: '{}' resolved to '{}' which is outside allowed directories",
                path.display(),
                canonical_path.display()
            );
            return Err(anyhow!(
                "Access denied: image path '{}' is outside allowed directories",
                path.display()
            ));
        }

        Ok(canonical_path)
    }

    /// Execute the image_ocr operation.
    ///
    /// Performs OCR on an image file and returns the extracted text along
    /// with a confidence score.
    ///
    /// # Parameters
    ///
    /// - `image_path`: Path to the image file (required)
    /// - `language`: OCR language code (optional, defaults to "eng")
    ///
    /// # Returns
    ///
    /// JSON object with:
    /// - `success`: Boolean indicating success
    /// - `image_path`: The canonicalized absolute path
    /// - `text`: Extracted text from the image
    /// - `confidence`: Confidence score between 0.0 and 1.0
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The `ocr` feature is not enabled
    /// - The image path is missing or invalid
    /// - The image format is not supported
    /// - The path is outside allowed directories
    /// - Tesseract fails to process the image
    async fn execute_image_ocr(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        // Extract image_path parameter
        let image_path = parameters
            .get("image_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'image_path' parameter"))?;

        let path = Path::new(image_path);

        // Validate image format
        Self::validate_image_path(path)?;

        // Security: validate path is within allowed directories
        let canonical_path = Self::validate_path_security(path, context)?;
        let canonical_path_str = canonical_path.to_string_lossy().to_string();

        // Emit progress event
        context.emit_progress("Starting OCR text extraction...", Some(0.1));

        // Perform OCR using the automation module
        // This handles the feature flag internally and returns a user-friendly error
        // when OCR is not available
        let ocr_result = crate::automation::screen::perform_ocr(&canonical_path_str)
            .await
            .map_err(|e| {
                // Translate technical errors to user-friendly messages
                let user_message = if e.to_string().contains("not available") {
                    "Text recognition is not available. This feature requires Tesseract OCR \
                    to be installed on your system."
                        .to_string()
                } else if e.to_string().contains("Failed to initialise") {
                    "Could not start text recognition. Please ensure Tesseract OCR is \
                    properly installed."
                        .to_string()
                } else if e.to_string().contains("Failed to load image") {
                    format!(
                        "Could not read the image file. Please ensure '{}' is a valid image.",
                        path.display()
                    )
                } else {
                    format!("Text recognition failed: {}", e)
                };
                anyhow!(user_message)
            })?;

        // Emit completion progress
        context.emit_progress("OCR extraction complete", Some(1.0));

        tracing::info!(
            "[OcrExecutor] image_ocr completed: path='{}' text_length={} confidence={:.2}",
            canonical_path.display(),
            ocr_result.text.len(),
            ocr_result.confidence
        );

        Ok(json!({
            "success": true,
            "image_path": canonical_path_str,
            "text": ocr_result.text,
            "confidence": ocr_result.confidence
        }))
    }
}

impl Default for OcrExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for OcrExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec!["image_ocr"]
    }

    fn description(&self) -> &'static str {
        "Performs OCR (Optical Character Recognition) on images to extract text. \
        Supports PNG, JPEG, WebP, BMP, TIFF, and GIF formats."
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "image_ocr" => self.execute_image_ocr(parameters, context).await,
            _ => Err(anyhow!("Unknown OCR tool: {}", tool_name)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Create a minimal test context for unit tests.
    fn create_test_context() -> ExecutorContext {
        use std::sync::Arc;

        ExecutorContext {
            app_handle: None,
            automation: Arc::new(
                crate::automation::AutomationService::new()
                    .expect("Failed to create AutomationService for tests"),
            ),
            router: Arc::new(tokio::sync::RwLock::new(crate::core::llm::LLMRouter::new())),
            tool_cache: Arc::new(crate::data::cache::ToolResultCache::new()),
            security_guard: Arc::new(crate::sys::security::ToolExecutionGuard::new()),
            change_tracker: None,
            session_id: "test_session".to_string(),
            tool_id: "test_tool".to_string(),
        }
    }

    fn create_test_execution_context() -> ExecutionContext {
        ExecutionContext {
            goal: crate::core::agi::Goal {
                id: "test".to_string(),
                description: "test".to_string(),
                priority: crate::core::agi::Priority::Medium,
                deadline: None,
                constraints: vec![],
                success_criteria: vec![],
            },
            current_state: HashMap::new(),
            available_resources: crate::core::agi::ResourceState {
                cpu_usage_percent: 0.0,
                memory_usage_mb: 0,
                network_usage_mbps: 0.0,
                storage_usage_mb: 0,
                available_tools: vec![],
            },
            tool_results: vec![],
            context_memory: vec![],
        }
    }

    #[test]
    fn test_tool_names() {
        let executor = OcrExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"image_ocr"));
        assert_eq!(names.len(), 1);
    }

    #[test]
    fn test_description() {
        let executor = OcrExecutor::new();
        let desc = executor.description();

        assert!(!desc.is_empty());
        assert!(desc.contains("OCR"));
    }

    #[test]
    fn test_default_impl() {
        let executor = OcrExecutor::default();
        assert_eq!(executor.tool_names().len(), 1);
    }

    #[test]
    fn test_is_available() {
        // This test verifies the is_available function compiles and runs
        // The actual result depends on whether the ocr feature is enabled
        let _available = OcrExecutor::is_available();
    }

    #[test]
    fn test_validate_image_path_nonexistent() {
        let path = Path::new("/nonexistent/image.png");
        let result = OcrExecutor::validate_image_path(path);

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn test_validate_image_path_directory() {
        let temp_dir = TempDir::new().unwrap();
        let result = OcrExecutor::validate_image_path(temp_dir.path());

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("directory"));
    }

    #[test]
    fn test_validate_image_path_unsupported_extension() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.xyz");
        fs::write(&test_file, "dummy").unwrap();

        let result = OcrExecutor::validate_image_path(&test_file);

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Unsupported"));
    }

    #[test]
    fn test_validate_image_path_no_extension() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test_no_ext");
        fs::write(&test_file, "dummy").unwrap();

        let result = OcrExecutor::validate_image_path(&test_file);

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("no extension"));
    }

    #[test]
    fn test_validate_image_path_valid_png() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.png");
        fs::write(&test_file, "dummy").unwrap();

        let result = OcrExecutor::validate_image_path(&test_file);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_image_path_valid_jpeg() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.jpeg");
        fs::write(&test_file, "dummy").unwrap();

        let result = OcrExecutor::validate_image_path(&test_file);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_image_path_case_insensitive() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.PNG");
        fs::write(&test_file, "dummy").unwrap();

        let result = OcrExecutor::validate_image_path(&test_file);
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_missing_image_path_parameter() {
        let context = create_test_context();
        let executor = OcrExecutor::new();
        let params = HashMap::new(); // No image_path parameter

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("image_ocr", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Missing required 'image_path' parameter"));
    }

    #[tokio::test]
    async fn test_unknown_tool() {
        let context = create_test_context();
        let executor = OcrExecutor::new();
        let params = HashMap::new();

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("ocr_unknown", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Unknown OCR tool"));
    }

    #[tokio::test]
    async fn test_nonexistent_image() {
        let context = create_test_context();
        let executor = OcrExecutor::new();
        let mut params = HashMap::new();
        params.insert(
            "image_path".to_string(),
            Value::String("/nonexistent/image.png".to_string()),
        );

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("image_ocr", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[tokio::test]
    async fn test_unsupported_format() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.txt");
        fs::write(&test_file, "This is text, not an image").unwrap();

        let context = create_test_context();
        let executor = OcrExecutor::new();
        let mut params = HashMap::new();
        params.insert(
            "image_path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("image_ocr", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Unsupported"));
    }

    // Note: Testing actual OCR functionality requires:
    // 1. The `ocr` feature to be enabled
    // 2. Tesseract to be installed on the system
    // 3. A valid test image
    // These tests are marked as integration tests and should be run separately
    #[cfg(feature = "ocr")]
    mod ocr_integration_tests {
        use super::*;

        #[tokio::test]
        async fn test_ocr_with_valid_image() {
            // This test requires an actual image and Tesseract installed
            // Skip in CI unless explicitly enabled
            if std::env::var("RUN_OCR_TESTS").is_err() {
                return;
            }

            // Create a simple test image with text
            // This would require generating an actual image with text
            // which is beyond the scope of this unit test
        }
    }
}
