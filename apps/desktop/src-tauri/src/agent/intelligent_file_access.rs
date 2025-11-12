/// Intelligent File Access System
///
/// When file access fails, automatically:
/// 1. Takes screenshots of the relevant area
/// 2. Performs OCR to extract text
/// 3. Uses vision/LLM to understand the context
/// 4. Generates solutions based on visual understanding
use crate::agent::vision::VisionAutomation;
use crate::automation::screen::{perform_ocr, OcrResult as ScreenOcrResult};
use crate::router::LLMRouter;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;

/// Result of intelligent file access attempt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileAccessResult {
    pub success: bool,
    pub content: Option<String>,
    pub method: AccessMethod,
    pub screenshot_path: Option<String>,
    pub ocr_text: Option<String>,
    pub analysis: Option<VisualAnalysis>,
    pub solution: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AccessMethod {
    DirectFileRead,
    ScreenshotOCR,
    VisionAnalysis,
}

/// Visual analysis of screenshot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisualAnalysis {
    pub detected_text: String,
    pub ui_elements: Vec<UIElement>,
    pub context: String,
    pub suggested_actions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIElement {
    pub element_type: String, // "button", "input", "text", "error", etc.
    pub text: Option<String>,
    pub position: Option<(i32, i32)>,
    pub confidence: f32,
}

/// Intelligent File Access System
pub struct IntelligentFileAccess {
    vision: VisionAutomation,
    llm_router: Option<Arc<LLMRouter>>,
}

impl IntelligentFileAccess {
    pub fn new() -> Result<Self> {
        Ok(Self {
            vision: VisionAutomation::new()?,
            llm_router: None,
        })
    }

    pub fn set_llm_router(&mut self, router: Arc<LLMRouter>) {
        self.llm_router = Some(router);
    }

    /// Intelligently access a file - tries direct access first, falls back to screenshot+OCR+vision
    pub async fn access_file(
        &self,
        file_path: &Path,
        context: Option<&str>,
    ) -> Result<FileAccessResult> {
        // Step 1: Try direct file access first
        match self.try_direct_access(file_path).await {
            Ok(content) => {
                return Ok(FileAccessResult {
                    success: true,
                    content: Some(content),
                    method: AccessMethod::DirectFileRead,
                    screenshot_path: None,
                    ocr_text: None,
                    analysis: None,
                    solution: None,
                    error: None,
                });
            }
            Err(e) => {
                tracing::warn!("Direct file access failed for {:?}: {}", file_path, e);

                // Step 2: File access failed - take screenshot and analyze
                return self
                    .fallback_to_vision(file_path, context, &e.to_string())
                    .await;
            }
        }
    }

    /// Try direct file access
    async fn try_direct_access(&self, file_path: &Path) -> Result<String> {
        // Check if file exists
        if !file_path.exists() {
            return Err(anyhow!("File does not exist: {:?}", file_path));
        }

        // Check permissions
        let metadata = std::fs::metadata(file_path)?;
        if metadata.permissions().readonly() && !metadata.is_dir() {
            // Try to read anyway (might still work)
        }

        // Try to read the file
        tokio::fs::read_to_string(file_path)
            .await
            .map_err(|e| anyhow!("Failed to read file: {}", e))
    }

    /// Fallback to vision-based access when file access fails
    async fn fallback_to_vision(
        &self,
        file_path: &Path,
        context: Option<&str>,
        error: &str,
    ) -> Result<FileAccessResult> {
        tracing::info!("Falling back to vision-based access for {:?}", file_path);

        // Step 1: Take screenshot of the relevant area
        // Try to focus on the file path/error area
        let screenshot_path = self.capture_relevant_area(file_path, error).await?;

        // Step 2: Perform OCR on screenshot
        let ocr_result = self.perform_ocr_on_screenshot(&screenshot_path).await?;

        // Step 3: Analyze screenshot with vision/LLM
        let analysis = self
            .analyze_screenshot(&screenshot_path, &ocr_result, context, error)
            .await?;

        // Step 4: Generate solution based on analysis
        let solution = self.generate_solution(file_path, &analysis, error).await?;

        Ok(FileAccessResult {
            success: false, // File access failed, but we have visual understanding
            content: None,
            method: AccessMethod::VisionAnalysis,
            screenshot_path: Some(screenshot_path),
            ocr_text: Some(ocr_result.text.clone()),
            analysis: Some(analysis),
            solution: Some(solution),
            error: Some(error.to_string()),
        })
    }

    /// Capture screenshot of relevant area (file path, error message, etc.)
    async fn capture_relevant_area(&self, _file_path: &Path, _error: &str) -> Result<String> {
        // For now, capture full screen
        // In production, could try to focus on specific windows/regions
        // based on file path or error message

        // Try to find the file path or error in current windows
        // For now, capture primary screen
        self.vision.capture_screenshot(None).await
    }

    /// Perform OCR on screenshot
    async fn perform_ocr_on_screenshot(&self, screenshot_path: &str) -> Result<ScreenOcrResult> {
        perform_ocr(screenshot_path).map_err(|e| anyhow!("OCR failed: {}", e))
    }

    /// Analyze screenshot using vision/LLM
    async fn analyze_screenshot(
        &self,
        screenshot_path: &str,
        ocr_result: &ScreenOcrResult,
        context: Option<&str>,
        error: &str,
    ) -> Result<VisualAnalysis> {
        // Build analysis prompt
        let mut prompt =
            format!("Analyze this screenshot to understand why file access failed.\n\n");

        prompt.push_str(&format!("**File Path:** {:?}\n", screenshot_path));
        prompt.push_str(&format!("**Error:** {}\n", error));

        if let Some(ctx) = context {
            prompt.push_str(&format!("**Context:** {}\n", ctx));
        }

        prompt.push_str(&format!("\n**OCR Text Extracted:**\n{}\n", ocr_result.text));
        prompt.push_str("\n**Analysis Request:**\n");
        prompt
            .push_str("1. What UI elements are visible (buttons, inputs, error messages, etc.)?\n");
        prompt.push_str("2. What is the context of the error?\n");
        prompt.push_str("3. What actions could resolve this issue?\n");
        prompt.push_str("4. What information can be extracted from the screenshot?\n");

        // Use LLM to analyze (if available)
        if let Some(ref router) = self.llm_router {
            // Use LLM with OCR text for analysis
            // Note: Vision-capable models (GPT-4V, Claude 3+) can process images directly
            // Current implementation uses text-based analysis with OCR extraction
            match self
                .analyze_with_llm(router.as_ref(), &prompt, &ocr_result.text)
                .await
            {
                Ok(analysis_text) => {
                    return Ok(self.parse_analysis(&analysis_text, ocr_result));
                }
                Err(e) => {
                    tracing::warn!(
                        "Vision LLM analysis failed, using heuristic fallback: {}",
                        e
                    );
                    // Fall through to heuristic analysis
                }
            }
        }

        // Fallback: Simple heuristic-based analysis
        Ok(self.heuristic_analysis(ocr_result, error))
    }

    /// Analyze with LLM (text-based, with future vision support)
    async fn analyze_with_llm(
        &self,
        router: &LLMRouter,
        prompt: &str,
        ocr_text: &str,
    ) -> Result<String> {
        // Use LLM to analyze the screenshot context with OCR text
        // Note: For true vision support, we would pass image data to vision-capable models
        // For now, we use text-based analysis with OCR text embedded in the prompt

        match router.send_message(prompt, None).await {
            Ok(analysis) => Ok(analysis),
            Err(e) => {
                tracing::warn!("LLM analysis failed: {}", e);
                Err(anyhow!("LLM analysis failed: {}", e))
            }
        }
        tracing::info!("[IntelligentFileAccess] Analyzing screenshot with LLM");

        // Build comprehensive prompt with OCR text
        let full_prompt = format!(
            r#"{prompt}

## OCR Extracted Text
The following text was extracted from the screenshot using OCR:

```
{ocr_text}
```

## Analysis Task
Based on the extracted text, provide a detailed analysis that answers:
1. What UI elements are present? (buttons, inputs, labels, error messages, etc.)
2. What is the current state or context?
3. If there's an error, what is the likely cause?
4. What specific actions would resolve the issue?
5. What key information should be extracted?

Provide your analysis in a clear, structured format."#
        );

        // Create LLM request
        let llm_request = crate::router::LLMRequest {
            messages: vec![crate::router::ChatMessage {
                role: "user".to_string(),
                content: full_prompt,
                tool_calls: None,
                tool_call_id: None,
            }],
            model: "".to_string(),
            temperature: Some(0.3), // Lower temperature for more factual analysis
            max_tokens: Some(1500), // Sufficient for detailed analysis
            stream: false,
            tools: None,
            tool_choice: None,
        };

        let preferences = crate::router::RouterPreferences {
            provider: None,
            model: None,
            strategy: crate::router::RoutingStrategy::Auto,
        };

        // Lock router and get candidates
        let candidates = router.candidates(&llm_request, &preferences);

        if candidates.is_empty() {
            tracing::warn!("[IntelligentFileAccess] No LLM providers available");
            return Ok(format!(
                "LLM unavailable. OCR text extracted:\n\n{}",
                ocr_text
            ));
        }

        // Invoke LLM
        let outcome = router
            .invoke_candidate(&candidates[0], &llm_request)
            .await?;
        let analysis = outcome.response.content;

        tracing::debug!(
            "[IntelligentFileAccess] LLM analysis received ({} chars)",
            analysis.len()
        );

        Ok(analysis)
    }

    /// Parse LLM analysis into structured format
    fn parse_analysis(&self, analysis_text: &str, ocr_result: &ScreenOcrResult) -> VisualAnalysis {
        // Parse LLM response (simplified - would use proper parsing in production)
        let ui_elements = self.extract_ui_elements(analysis_text, ocr_result);
        let suggested_actions = self.extract_suggested_actions(analysis_text);

        VisualAnalysis {
            detected_text: ocr_result.text.clone(),
            ui_elements,
            context: analysis_text.to_string(),
            suggested_actions,
        }
    }

    /// Heuristic-based analysis (fallback when LLM not available)
    fn heuristic_analysis(&self, ocr_result: &ScreenOcrResult, error: &str) -> VisualAnalysis {
        let mut ui_elements = Vec::new();
        let mut suggested_actions = Vec::new();

        // Detect common UI elements from OCR text
        let text_lower = ocr_result.text.to_lowercase();

        if text_lower.contains("error") || text_lower.contains("failed") {
            ui_elements.push(UIElement {
                element_type: "error".to_string(),
                text: Some(ocr_result.text.clone()),
                position: None,
                confidence: 0.8,
            });
        }

        if text_lower.contains("permission") || text_lower.contains("denied") {
            suggested_actions.push("Check file permissions".to_string());
            suggested_actions.push("Run with elevated privileges if needed".to_string());
        }

        if text_lower.contains("not found") || text_lower.contains("does not exist") {
            suggested_actions.push("Verify file path is correct".to_string());
            suggested_actions.push("Check if file exists in different location".to_string());
        }

        if text_lower.contains("button") || text_lower.contains("click") {
            ui_elements.push(UIElement {
                element_type: "button".to_string(),
                text: None,
                position: None,
                confidence: 0.6,
            });
            suggested_actions.push("Click the button to proceed".to_string());
        }

        VisualAnalysis {
            detected_text: ocr_result.text.clone(),
            ui_elements,
            context: format!("Error: {}\nOCR Text: {}", error, ocr_result.text),
            suggested_actions,
        }
    }

    /// Extract UI elements from analysis text
    fn extract_ui_elements(
        &self,
        analysis_text: &str,
        _ocr_result: &ScreenOcrResult,
    ) -> Vec<UIElement> {
        // Simple extraction - in production, would use structured LLM output
        let mut elements = Vec::new();

        // Look for common patterns
        if analysis_text.contains("button") {
            elements.push(UIElement {
                element_type: "button".to_string(),
                text: None,
                position: None,
                confidence: 0.7,
            });
        }

        if analysis_text.contains("input") || analysis_text.contains("field") {
            elements.push(UIElement {
                element_type: "input".to_string(),
                text: None,
                position: None,
                confidence: 0.7,
            });
        }

        elements
    }

    /// Extract suggested actions from analysis text
    fn extract_suggested_actions(&self, analysis_text: &str) -> Vec<String> {
        // Simple extraction - in production, would parse structured LLM output
        let mut actions = Vec::new();

        let lines: Vec<&str> = analysis_text.lines().collect();
        for line in lines {
            if line.contains("action") || line.contains("suggest") || line.contains("should") {
                actions.push(line.trim().to_string());
            }
        }

        if actions.is_empty() {
            actions.push("Review the screenshot and error message".to_string());
            actions.push("Take appropriate action based on visual context".to_string());
        }

        actions
    }

    /// Generate solution based on visual analysis
    async fn generate_solution(
        &self,
        file_path: &Path,
        analysis: &VisualAnalysis,
        error: &str,
    ) -> Result<String> {
        let mut solution = String::new();

        solution.push_str("## Solution Based on Visual Analysis\n\n");
        solution.push_str(&format!("**File:** {:?}\n", file_path));
        solution.push_str(&format!("**Error:** {}\n\n", error));

        solution.push_str("### Detected Context\n");
        solution.push_str(&analysis.context);
        solution.push_str("\n\n");

        if !analysis.ui_elements.is_empty() {
            solution.push_str("### UI Elements Detected\n");
            for element in &analysis.ui_elements {
                solution.push_str(&format!("- **{}**", element.element_type));
                if let Some(ref text) = element.text {
                    solution.push_str(&format!(": {}", text));
                }
                solution.push_str("\n");
            }
            solution.push_str("\n");
        }

        if !analysis.suggested_actions.is_empty() {
            solution.push_str("### Suggested Actions\n");
            for (i, action) in analysis.suggested_actions.iter().enumerate() {
                solution.push_str(&format!("{}. {}\n", i + 1, action));
            }
            solution.push_str("\n");
        }

        // Generate code solution if applicable
        if let Some(code_solution) = self
            .generate_code_solution(file_path, analysis, error)
            .await?
        {
            solution.push_str("### Code Solution\n");
            solution.push_str("```\n");
            solution.push_str(&code_solution);
            solution.push_str("\n```\n");
        }

        Ok(solution)
    }

    /// Generate code solution based on analysis
    async fn generate_code_solution(
        &self,
        file_path: &Path,
        _analysis: &VisualAnalysis,
        error: &str,
    ) -> Result<Option<String>> {
        // Analyze error and generate appropriate code solution
        let error_lower = error.to_lowercase();

        if error_lower.contains("permission") || error_lower.contains("denied") {
            return Ok(Some(format!(
                "// Solution: Handle permission error\n\
                // 1. Check if file exists and is readable\n\
                if !std::path::Path::new({:?}).exists() {{\n\
                    // File doesn't exist\n\
                }} else {{\n\
                    // Try to read with proper error handling\n\
                    match std::fs::read_to_string({:?}) {{\n\
                        Ok(content) => {{ /* use content */ }}\n\
                        Err(e) => {{ /* handle error: {{}} */ }}\n\
                    }}\n\
                }}",
                file_path, file_path
            )));
        }

        if error_lower.contains("not found") || error_lower.contains("does not exist") {
            return Ok(Some(format!(
                "// Solution: File not found\n\
                // 1. Verify the path is correct\n\
                // 2. Check if file exists in alternative locations\n\
                // 3. Create file if it should exist\n\
                let file_path = {:?};\n\
                if !file_path.exists() {{\n\
                    // Create parent directory if needed\n\
                    if let Some(parent) = file_path.parent() {{\n\
                        std::fs::create_dir_all(parent)?;\n\
                    }}\n\
                    // Create file\n\
                    std::fs::File::create(&file_path)?;\n\
                }}",
                file_path
            )));
        }

        Ok(None)
    }
}

impl Default for IntelligentFileAccess {
    fn default() -> Self {
        Self::new().expect("Failed to create IntelligentFileAccess")
    }
}
