use crate::automation::screen::{perform_ocr, OcrResult as ScreenOcrResult};
use crate::core::agent::vision::VisionAutomation;
use crate::core::llm::LLMRouter;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisualAnalysis {
    pub detected_text: String,
    pub ui_elements: Vec<UIElement>,
    pub context: String,
    pub suggested_actions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIElement {
    pub element_type: String,
    pub text: Option<String>,
    pub position: Option<(i32, i32)>,
    pub confidence: f32,
}

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

    pub async fn access_file(
        &self,
        file_path: &Path,
        context: Option<&str>,
    ) -> Result<FileAccessResult> {
        match self.try_direct_access(file_path).await {
            Ok(content) => Ok(FileAccessResult {
                success: true,
                content: Some(content),
                method: AccessMethod::DirectFileRead,
                screenshot_path: None,
                ocr_text: None,
                analysis: None,
                solution: None,
                error: None,
            }),
            Err(e) => {
                tracing::warn!("Direct file access failed for {:?}: {}", file_path, e);
                return self
                    .fallback_to_vision(file_path, context, &e.to_string())
                    .await;
            }
        }
    }

    async fn try_direct_access(&self, file_path: &Path) -> Result<String> {
        if !file_path.exists() {
            return Err(anyhow!("File does not exist: {:?}", file_path));
        }

        tokio::fs::read_to_string(file_path)
            .await
            .map_err(|e| anyhow!("Failed to read file: {}", e))
    }

    async fn fallback_to_vision(
        &self,
        file_path: &Path,
        context: Option<&str>,
        error: &str,
    ) -> Result<FileAccessResult> {
        tracing::info!("Falling back to vision-based access for {:?}", file_path);

        let screenshot_path = self.capture_relevant_area(file_path, error).await?;
        let ocr_result = self.perform_ocr_on_screenshot(&screenshot_path).await?;
        let analysis = self
            .analyze_screenshot(&screenshot_path, &ocr_result, context, error)
            .await?;
        let solution = self.generate_solution(file_path, &analysis, error).await?;

        Ok(FileAccessResult {
            success: false,
            content: None,
            method: AccessMethod::VisionAnalysis,
            screenshot_path: Some(screenshot_path),
            ocr_text: Some(ocr_result.text.clone()),
            analysis: Some(analysis),
            solution: Some(solution),
            error: Some(error.to_string()),
        })
    }

    async fn capture_relevant_area(&self, _file_path: &Path, _error: &str) -> Result<String> {
        self.vision.capture_screenshot(None).await
    }

    async fn perform_ocr_on_screenshot(&self, screenshot_path: &str) -> Result<ScreenOcrResult> {
        perform_ocr(screenshot_path)
            .await
            .map_err(|e| anyhow!("OCR failed: {}", e))
    }

    async fn analyze_screenshot(
        &self,
        screenshot_path: &str,
        ocr_result: &ScreenOcrResult,
        context: Option<&str>,
        error: &str,
    ) -> Result<VisualAnalysis> {
        let mut prompt =
            "Analyze this screenshot to understand why file access failed.\n\n".to_string();

        prompt.push_str(&format!("**File Path:** {:?}\n", screenshot_path));
        prompt.push_str(&format!("**Error:** {}\n", error));

        if let Some(ctx) = context {
            prompt.push_str(&format!("**Context:** {}\n", ctx));
        }

        prompt.push_str(&format!("\n**OCR Text Extracted:**\n{}\n", ocr_result.text));
        prompt.push_str("\n**Analysis Request:**\n");
        prompt.push_str("1. What UI elements are visible?\n");
        prompt.push_str("2. What is the context of the error?\n");
        prompt.push_str("3. What actions could resolve this issue?\n");

        if let Some(ref router) = self.llm_router {
            match self
                .analyze_with_llm(router.as_ref(), &prompt, &ocr_result.text)
                .await
            {
                Ok(analysis_text) => {
                    return Ok(self.parse_analysis(&analysis_text, ocr_result));
                }
                Err(e) => {
                    tracing::warn!("Vision LLM analysis failed: {}", e);
                }
            }
        }

        Ok(self.heuristic_analysis(ocr_result, error))
    }

    async fn analyze_with_llm(
        &self,
        router: &LLMRouter,
        prompt: &str,
        ocr_text: &str,
    ) -> Result<String> {
        tracing::info!("[IntelligentFileAccess] Analyzing screenshot with LLM");

        let full_prompt = format!(
            r#"{prompt}

## OCR Extracted Tex
```
{ocr_text}
```

## Analysis Task
Provide a detailed analysis in a structured format."#
        );

        let llm_request = crate::core::llm::LLMRequest {
            messages: vec![crate::core::llm::ChatMessage {
                role: "user".to_string(),
                content: full_prompt,
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "".to_string(),
            temperature: Some(0.3),
            max_tokens: Some(1500),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
        };

        let preferences = crate::core::llm::RouterPreferences {
            provider: None,
            model: None,
            strategy: crate::core::llm::RoutingStrategy::Auto,
            context: None,
            prefer_cloud_credits: false,
        };

        let candidates = router.candidates(&llm_request, &preferences);

        if candidates.is_empty() {
            return Ok(format!("LLM unavailable. OCR text:\n\n{}", ocr_text));
        }

        let outcome = router
            .invoke_candidate(&candidates[0], &llm_request)
            .await?;
        Ok(outcome.response.content)
    }

    fn parse_analysis(&self, analysis_text: &str, ocr_result: &ScreenOcrResult) -> VisualAnalysis {
        let ui_elements = self.extract_ui_elements(analysis_text, ocr_result);
        let suggested_actions = self.extract_suggested_actions(analysis_text);

        VisualAnalysis {
            detected_text: ocr_result.text.clone(),
            ui_elements,
            context: analysis_text.to_string(),
            suggested_actions,
        }
    }

    fn heuristic_analysis(&self, ocr_result: &ScreenOcrResult, error: &str) -> VisualAnalysis {
        let mut ui_elements = Vec::new();
        let mut suggested_actions = Vec::new();
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
        }

        VisualAnalysis {
            detected_text: ocr_result.text.clone(),
            ui_elements,
            context: format!("Error: {}\nOCR Text: {}", error, ocr_result.text),
            suggested_actions,
        }
    }

    fn extract_ui_elements(
        &self,
        analysis_text: &str,
        _ocr_result: &ScreenOcrResult,
    ) -> Vec<UIElement> {
        let mut elements = Vec::new();

        if analysis_text.contains("button") {
            elements.push(UIElement {
                element_type: "button".to_string(),
                text: None,
                position: None,
                confidence: 0.7,
            });
        }

        elements
    }

    fn extract_suggested_actions(&self, analysis_text: &str) -> Vec<String> {
        let mut actions = Vec::new();
        let lines: Vec<&str> = analysis_text.lines().collect();
        for line in lines {
            if line.contains("action") || line.contains("suggest") {
                actions.push(line.trim().to_string());
            }
        }

        if actions.is_empty() {
            actions.push("Review screenshot".to_string());
        }

        actions
    }

    async fn generate_solution(
        &self,
        file_path: &Path,
        analysis: &VisualAnalysis,
        error: &str,
    ) -> Result<String> {
        let mut solution = String::new();
        solution.push_str("## Solution\n\n");
        solution.push_str(&format!("**File:** {:?}\n", file_path));
        solution.push_str(&format!("**Error:** {}\n\n", error));
        solution.push_str("### Context\n");
        solution.push_str(&analysis.context);
        solution.push_str("\n\n");

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

    async fn generate_code_solution(
        &self,
        file_path: &Path,
        _analysis: &VisualAnalysis,
        error: &str,
    ) -> Result<Option<String>> {
        let error_lower = error.to_lowercase();

        if error_lower.contains("permission") || error_lower.contains("denied") {
            return Ok(Some(format!(
                "if std::path::Path::new({:?}).exists() {{ match std::fs::read_to_string({:?}) {{ Ok(_) => {{}}, Err(_) => {{}} }} }}",
                file_path, file_path
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
