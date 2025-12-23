use crate::core::agent::context_manager::{Constraint, ContextManager};
use crate::core::agent::intelligent_file_access::IntelligentFileAccess;
use crate::core::mcp::McpToolRegistry;
use crate::core::router::LLMRouter;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeGenRequest {
    pub task_id: String,
    pub description: String,
    pub target_files: Vec<PathBuf>,
    pub constraints: Vec<Constraint>,
    pub context: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedFile {
    pub path: PathBuf,
    pub content: String,
    pub file_type: FileType,
    pub dependencies: Vec<String>,
    pub exports: Vec<String>,
    pub tests: Option<String>,
    pub documentation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FileType {
    Source,
    Test,
    Config,
    Documentation,
    TypeDefinition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeGenResult {
    pub task_id: String,
    pub files: Vec<GeneratedFile>,
    pub changes_summary: String,
    pub validation_errors: Vec<String>,
    pub suggestions: Vec<String>,
}

pub struct CodeGenerator {
    context_manager: ContextManager,
    mcp_registry: Option<McpToolRegistry>,
    llm_router: Option<Arc<LLMRouter>>,
    file_access: IntelligentFileAccess,
}

impl CodeGenerator {
    pub fn new(context_manager: ContextManager) -> Self {
        Self {
            context_manager,
            mcp_registry: None,
            llm_router: None,
            file_access: IntelligentFileAccess::new()
                .unwrap_or_else(|_| IntelligentFileAccess::default()),
        }
    }

    pub fn set_mcp_registry(&mut self, registry: McpToolRegistry) {
        self.mcp_registry = Some(registry);
    }

    pub fn set_llm_router(&mut self, router: Arc<LLMRouter>) {
        self.file_access.set_llm_router(router.clone());
        self.llm_router = Some(router);
    }

    pub async fn generate_code(&self, request: CodeGenRequest) -> Result<CodeGenResult> {
        let context_prompt = self
            .context_manager
            .generate_context_prompt(&request.description);

        let existing_code = self.analyze_existing_code(&request.target_files).await?;

        let generated_code = if let Some(ref router) = self.llm_router {
            self.generate_with_llm(router, &request, &context_prompt, &existing_code)
                .await?
        } else {
            self.generate_with_mcp(&request, &context_prompt, &existing_code)
                .await?
        };

        let validation_errors = self
            .validate_code(&generated_code, &request.constraints)
            .await?;

        let suggestions = self.generate_suggestions(&generated_code, &request).await?;

        let changes_summary = self.create_changes_summary(&generated_code);

        Ok(CodeGenResult {
            task_id: request.task_id,
            files: generated_code,
            changes_summary,
            validation_errors,
            suggestions,
        })
    }

    async fn analyze_existing_code(&self, files: &[PathBuf]) -> Result<HashMap<PathBuf, String>> {
        let mut code_map = HashMap::new();

        for file in files {
            match self
                .file_access
                .access_file(file, Some("Analyzing existing code for code generation"))
                .awai
            {
                Ok(result) => {
                    if result.success {
                        if let Some(content) = result.content {
                            code_map.insert(file.clone(), content);
                        }
                    } else {
                        let content = if let Some(ref ocr_text) = result.ocr_text {
                            format!("OCR Result: {}", ocr_text)
                        } else if let Some(ref solution) = result.solution {
                            format!("Proposed Solution: {}", solution)
                        } else {
                            "Could not access file content".to_string()
                        };

                        code_map.insert(file.clone(), content);

                        tracing::info!("Used vision fallback for file: {:?}", file);
                        if let Some(ref screenshot_path) = result.screenshot_path {
                            tracing::info!("Screenshot saved at: {}", screenshot_path);
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("Intelligent file access failed for {:?}: {}", file, e);
                    code_map.insert(file.clone(), format!("Error accessing file: {}", e));
                }
            }
        }

        Ok(code_map)
    }

    async fn generate_with_llm(
        &self,
        router: &Arc<LLMRouter>,
        request: &CodeGenRequest,
        context_prompt: &str,
        existing_code: &HashMap<PathBuf, String>,
    ) -> Result<Vec<GeneratedFile>> {
        tracing::info!(
            "[CodeGenerator] Generating code with LLM for task: {}",
            request.task_id
        );

        let mut prompt = context_prompt.to_string();
        prompt.push_str("\n\n## Task Description\n\n");
        prompt.push_str(&request.description);
        prompt.push_str("\n\n## Target Files\n\n");
        for file in &request.target_files {
            prompt.push_str(&format!("- {}\n", file.display()));
        }

        if !request.constraints.is_empty() {
            prompt.push_str("\n## Constraints\n\n");
            for constraint in &request.constraints {
                prompt.push_str(&format!("- {}\n", constraint.description));
            }
        }

        prompt.push_str("\n\n## Existing Code Context\n\n");
        for (i, (path, content)) in existing_code.iter().enumerate() {
            if i >= 5 {
                prompt.push_str(&format!("... and {} more files\n", existing_code.len() - 5));
                break;
            }

            let truncated_content = if content.len() > 2000 {
                format!(
                    "{}...\n[truncated {} chars]",
                    &content[..2000],
                    content.len() - 2000
                )
            } else {
                content.clone()
            };
            prompt.push_str(&format!(
                "### {}\n\n```\n{}\n```\n\n",
                path.display(),
                truncated_content
            ));
        }

        prompt.push_str("\n## Generation Instructions\n\n");
        prompt.push_str("Generate code that:\n");
        prompt.push_str("1. Implements the requested functionality\n");
        prompt.push_str("2. Follows all constraints and patterns\n");
        prompt.push_str("3. Integrates seamlessly with existing code\n");
        prompt.push_str("4. Includes comprehensive tests\n");
        prompt.push_str("5. Has proper documentation\n");
        prompt.push_str("\n## Output Format\n\n");
        prompt.push_str("Return JSON array with this structure:\n");
        prompt.push_str("[\n  {\n    \"path\": \"file/path\",\n    \"content\": \"file content\",\n    \"file_type\": \"source|test|config|documentation|type_definition\",\n    \"dependencies\": [\"dep1\"],\n    \"exports\": [\"export1\"]\n  }\n]\n");

        let response = router
            .send_message(&prompt, None)
            .awai
            .map_err(|e| anyhow::anyhow!("LLM generation failed: {}", e))?;

        let files: Vec<GeneratedFile> = if let Ok(parsed) = serde_json::from_str(&response) {
            parsed
        } else {
            let json_start = response.find('[');
            let json_end = response.rfind(']');

            if let (Some(start), Some(end)) = (json_start, json_end) {
                if start < end {
                    let json_str = &response[start..=end];
                    serde_json::from_str(json_str).unwrap_or_else(|e| {
                        tracing::warn!("Failed to parse LLM response as JSON: {}", e);
                        Vec::new()
                    })
                } else {
                    tracing::warn!("Invalid JSON markers in LLM response");
                    Vec::new()
                }
            } else {
                tracing::warn!("No JSON array found in LLM response");
                Vec::new()
            }
        };

        Ok(files)
    }

    async fn generate_with_mcp(
        &self,
        request: &CodeGenRequest,
        _context_prompt: &str,
        _existing_code: &HashMap<PathBuf, String>,
    ) -> Result<Vec<GeneratedFile>> {
        tracing::info!(
            "[CodeGenerator] Generating code with MCP for task: {}",
            request.task_id
        );
        Ok(Vec::new())
    }

    async fn validate_code(
        &self,
        files: &[GeneratedFile],
        constraints: &[Constraint],
    ) -> Result<Vec<String>> {
        let mut errors = Vec::new();

        for file in files {
            for constraint in constraints {
                match &constraint.constraint_type {
                    crate::core::agent::context_manager::ConstraintType::CodeStyle { rules } => {
                        for rule in rules {
                            if !self.check_code_style(&file.content, rule) {
                                errors.push(format!(
                                    "Code style violation in {}: {}",
                                    file.path.display(),
                                    rule
                                ));
                            }
                        }
                    }
                    crate::core::agent::context_manager::ConstraintType::Testing {
                        requirements,
                    } => {
                        if file.tests.is_none() && requirements.iter().any(|r| r.contains("test")) {
                            errors.push(format!(
                                "Missing tests in {} (required by constraint)",
                                file.path.display()
                            ));
                        }
                    }
                    crate::core::agent::context_manager::ConstraintType::Documentation {
                        requirements,
                    } => {
                        if file.documentation.is_none()
                            && requirements.iter().any(|r| r.contains("doc"))
                        {
                            errors.push(format!(
                                "Missing documentation in {} (required by constraint)",
                                file.path.display()
                            ));
                        }
                    }
                    _ => {}
                }
            }
        }

        Ok(errors)
    }

    fn check_code_style(&self, code: &str, rule: &str) -> bool {
        match rule.to_lowercase().as_str() {
            r if r.contains("typescript") => {
                code.contains(":") || code.contains("interface") || code.contains("type")
            }
            r if r.contains("async") => code.contains("async") || code.contains("await"),
            r if r.contains("error handling") => {
                code.contains("try") || code.contains("catch") || code.contains("Result")
            }
            _ => true,
        }
    }

    async fn generate_suggestions(
        &self,
        files: &[GeneratedFile],
        _request: &CodeGenRequest,
    ) -> Result<Vec<String>> {
        let mut suggestions = Vec::new();

        for file in files {
            if !file.content.contains("TODO") {
                suggestions.push(format!(
                    "Consider adding TODO comments for future improvements in {}",
                    file.path.display()
                ));
            }

            if !file.content.contains("try") && !file.content.contains("Result") {
                suggestions.push(format!(
                    "Consider adding error handling in {}",
                    file.path.display()
                ));
            }

            if file.tests.is_none() {
                suggestions.push(format!("Consider adding tests for {}", file.path.display()));
            }
        }

        Ok(suggestions)
    }

    fn create_changes_summary(&self, files: &[GeneratedFile]) -> String {
        if files.is_empty() {
            return "No files generated".to_string();
        }

        let mut summary = format!("Generated {} file(s):\n", files.len());

        for file in files {
            summary.push_str(&format!(
                "- {} ({:?})\n",
                file.path.display(),
                file.file_type
            ));
            if file.tests.is_some() {
                summary.push_str("  - Includes tests\n");
            }
            if file.documentation.is_some() {
                summary.push_str("  - Includes documentation\n");
            }
        }

        summary
    }

    pub async fn refactor_code(
        &self,
        files: Vec<PathBuf>,
        refactor_description: String,
        constraints: Vec<Constraint>,
    ) -> Result<CodeGenResult> {
        self.analyze_existing_code(&files).await?;

        let request = CodeGenRequest {
            task_id: uuid::Uuid::new_v4().to_string(),
            description: format!("Refactor: {}", refactor_description),
            target_files: files,
            constraints,
            context: "Refactoring existing code while maintaining functionality".to_string(),
        };

        self.generate_code(request).awai
    }

    pub async fn generate_tests(
        &self,
        source_files: Vec<PathBuf>,
        test_framework: Option<String>,
    ) -> Result<Vec<GeneratedFile>> {
        let existing_code = self.analyze_existing_code(&source_files).await?;
        let mut test_files = Vec::new();

        for (source_path, code) in existing_code {
            let test_path = self.get_test_path(&source_path);

            let test_content = if let Some(ref router) = self.llm_router {
                let framework = test_framework.as_deref().unwrap_or("auto-detect");
                let prompt = format!(
                    "Generate comprehensive tests for the following code using {} framework.\n\n
                    File: {}\n\n
                    Code:\n```\n{}\n```\n\n
                    Generate test code that:\n
                    1. Tests all public functions/methods\n
                    2. Includes edge cases and error handling\n
                    3. Uses appropriate assertions\n
                    4. Has descriptive test names\n\n
                    Return ONLY the test code, no explanations.",
                    framework,
                    source_path.display(),
                    code
                );

                match router.send_message(&prompt, None).await {
                    Ok(content) => content,
                    Err(e) => {
                        tracing::warn!("LLM test generation failed for {:?}: {}", source_path, e);
                        format!(
                            "// Error generating tests for {}: {}",
                            source_path.display(),
                            e
                        )
                    }
                }
            } else {
                format!(
                    "// Test generation requires LLM router for {}",
                    source_path.display()
                )
            };

            test_files.push(GeneratedFile {
                path: test_path,
                content: test_content,
                file_type: FileType::Test,
                dependencies: vec![source_path.to_string_lossy().to_string()],
                exports: Vec::new(),
                tests: None,
                documentation: Some("Generated test file".to_string()),
            });
        }

        Ok(test_files)
    }

    fn get_test_path(&self, source_path: &std::path::Path) -> PathBuf {
        let mut test_path = source_path.to_path_buf();

        if let Some(ext) = source_path.extension() {
            let ext_str = ext.to_string_lossy();
            if ext_str == "ts" || ext_str == "tsx" {
                test_path.set_extension("test.ts");
            } else if ext_str == "rs" {
                test_path.set_extension("test.rs");
            } else {
                test_path.set_extension(format!("test.{}", ext_str));
            }
        }

        test_path
    }
}
