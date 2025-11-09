/// CodeGenerator - AI-native code generation system
///
/// Generates code based on context and constraints, handling:
/// - Multi-file code generation
/// - Code refactoring
/// - Test generation
/// - Documentation generation
/// - Pattern-aware code creation

use crate::agent::context_manager::{ContextManager, Constraint};
use crate::agent::intelligent_file_access::IntelligentFileAccess;
use crate::mcp::McpToolRegistry;
use crate::router::LLMRouter;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

/// Code generation request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeGenRequest {
    pub task_id: String,
    pub description: String,
    pub target_files: Vec<PathBuf>,
    pub constraints: Vec<Constraint>,
    pub context: String, // Additional context
}

/// Generated code file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedFile {
    pub path: PathBuf,
    pub content: String,
    pub file_type: FileType,
    pub dependencies: Vec<String>, // Files/modules this depends on
    pub exports: Vec<String>, // What this file exports
    pub tests: Option<String>, // Generated tests
    pub documentation: Option<String>, // Generated documentation
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

/// Code generation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeGenResult {
    pub task_id: String,
    pub files: Vec<GeneratedFile>,
    pub changes_summary: String,
    pub validation_errors: Vec<String>,
    pub suggestions: Vec<String>,
}

/// AI-native code generator
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
            file_access: IntelligentFileAccess::new().unwrap_or_else(|_| {
                // Fallback if initialization fails
                IntelligentFileAccess::default()
            }),
        }
    }

    pub fn set_mcp_registry(&mut self, registry: McpToolRegistry) {
        self.mcp_registry = Some(registry);
    }

    pub fn set_llm_router(&mut self, router: Arc<LLMRouter>) {
        self.file_access.set_llm_router(router.clone());
        self.llm_router = Some(router);
    }

    /// Generate code based on request
    pub async fn generate_code(&self, request: CodeGenRequest) -> Result<CodeGenResult> {
        // Build context prompt
        let context_prompt = self.context_manager.generate_context_prompt(&request.description);
        
        // Analyze existing code if target files exist
        let existing_code = self.analyze_existing_code(&request.target_files).await?;
        
        // Generate code using LLM (via MCP or direct)
        let generated_code = if let Some(ref router) = self.llm_router {
            self.generate_with_llm(router, &request, &context_prompt, &existing_code).await?
        } else {
            // Fallback: use MCP tools for code generation
            self.generate_with_mcp(&request, &context_prompt, &existing_code).await?
        };
        
        // Validate generated code against constraints
        let validation_errors = self.validate_code(&generated_code, &request.constraints).await?;
        
        // Generate suggestions for improvements
        let suggestions = self.generate_suggestions(&generated_code, &request).await?;
        
        // Create summary
        let changes_summary = self.create_changes_summary(&generated_code);
        
        Ok(CodeGenResult {
            task_id: request.task_id,
            files: generated_code,
            changes_summary,
            validation_errors,
            suggestions,
        })
    }

    /// Analyze existing code in target files (with intelligent fallback to screenshots)
    async fn analyze_existing_code(&self, files: &[PathBuf]) -> Result<HashMap<PathBuf, String>> {
        let mut code_map = HashMap::new();
        
        for file in files {
            // Use intelligent file access - tries direct access first, falls back to screenshot+OCR+vision
            match self.file_access.access_file(file, Some("Analyzing existing code for code generation")).await {
                Ok(result) => {
                    if result.success {
                        // Direct file access succeeded
                        if let Some(content) = result.content {
                            code_map.insert(file.clone(), content);
                        }
                    } else {
                        // File access failed, but we have visual understanding
                        // Use OCR text or solution as content
                        let content = if let Some(ref ocr_text) = result.ocr_text {
                            format!("// File access failed - extracted from screenshot via OCR:\n// {}\n\n", ocr_text)
                        } else if let Some(ref solution) = result.solution {
                            format!("// File access failed - solution based on visual analysis:\n{}\n", solution)
                        } else {
                            format!("// File access failed for: {:?}\n", file)
                        };
                        
                        code_map.insert(file.clone(), content);
                        
                        // Log that we used vision fallback
                        tracing::info!("Used vision fallback for file: {:?}", file);
                        if let Some(ref screenshot_path) = result.screenshot_path {
                            tracing::info!("Screenshot saved at: {}", screenshot_path);
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("Intelligent file access failed for {:?}: {}", file, e);
                    // Still try to add entry with error note
                    code_map.insert(file.clone(), format!("// Error accessing file: {}\n", e));
                }
            }
        }
        
        Ok(code_map)
    }

    /// Generate code using LLM router
    async fn generate_with_llm(
        &self,
        router: &Arc<LLMRouter>,
        request: &CodeGenRequest,
        context_prompt: &str,
        existing_code: &HashMap<PathBuf, String>,
    ) -> Result<Vec<GeneratedFile>> {
        // Build comprehensive prompt
        let mut _prompt = context_prompt.to_string();
        _prompt.push_str("\n\n## Existing Code\n\n");
        
        for (path, content) in existing_code {
            _prompt.push_str(&format!("### {}\n\n```\n{}\n```\n\n", path.display(), content));
        }
        
        _prompt.push_str("\n## Generation Instructions\n\n");
        _prompt.push_str("Generate code that:\n");
        _prompt.push_str("1. Implements the requested functionality\n");
        _prompt.push_str("2. Follows all constraints and patterns\n");
        _prompt.push_str("3. Integrates seamlessly with existing code\n");
        _prompt.push_str("4. Includes comprehensive tests\n");
        _prompt.push_str("5. Has proper documentation\n");
        
        // Use LLM to generate code
        // TODO: Implement actual LLM call via router
        // For now, return placeholder
        tracing::info!("[CodeGenerator] Generating code with LLM for task: {}", request.task_id);
        
        // This would call router.generate_code() or similar
        // For now, return empty result
        Ok(Vec::new())
    }

    /// Generate code using MCP tools
    async fn generate_with_mcp(
        &self,
        request: &CodeGenRequest,
        _context_prompt: &str,
        _existing_code: &HashMap<PathBuf, String>,
    ) -> Result<Vec<GeneratedFile>> {
        // Use MCP tools for code generation
        // This could use tools like:
        // - code-completion MCP server
        // - code-generation MCP server
        // - AI coding assistant MCP server
        
        tracing::info!("[CodeGenerator] Generating code with MCP for task: {}", request.task_id);
        
        // Placeholder - would use MCP tools here
        Ok(Vec::new())
    }

    /// Validate generated code against constraints
    async fn validate_code(
        &self,
        files: &[GeneratedFile],
        constraints: &[Constraint],
    ) -> Result<Vec<String>> {
        let mut errors = Vec::new();
        
        for file in files {
            for constraint in constraints {
                match &constraint.constraint_type {
                    crate::agent::context_manager::ConstraintType::CodeStyle { rules } => {
                        // Validate code style
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
                    crate::agent::context_manager::ConstraintType::Testing { requirements } => {
                        // Check if tests are present
                        if file.tests.is_none() && requirements.iter().any(|r| r.contains("test")) {
                            errors.push(format!(
                                "Missing tests in {} (required by constraint)",
                                file.path.display()
                            ));
                        }
                    }
                    crate::agent::context_manager::ConstraintType::Documentation { requirements } => {
                        // Check if documentation is present
                        if file.documentation.is_none() && requirements.iter().any(|r| r.contains("doc")) {
                            errors.push(format!(
                                "Missing documentation in {} (required by constraint)",
                                file.path.display()
                            ));
                        }
                    }
                    _ => {
                        // Other constraint types would be validated here
                    }
                }
            }
        }
        
        Ok(errors)
    }

    /// Check code style against a rule
    fn check_code_style(&self, code: &str, rule: &str) -> bool {
        // Simplified style checking
        // In production, would use proper linters/formatters
        
        match rule.to_lowercase().as_str() {
            r if r.contains("typescript") => code.contains(":") || code.contains("interface") || code.contains("type"),
            r if r.contains("async") => code.contains("async") || code.contains("await"),
            r if r.contains("error handling") => code.contains("try") || code.contains("catch") || code.contains("Result"),
            _ => true, // Default: pass
        }
    }

    /// Generate suggestions for code improvements
    async fn generate_suggestions(
        &self,
        files: &[GeneratedFile],
        _request: &CodeGenRequest,
    ) -> Result<Vec<String>> {
        let mut suggestions = Vec::new();
        
        // Analyze code and suggest improvements
        for file in files {
            // Check for common improvements
            if !file.content.contains("// TODO") && !file.content.contains("FIXME") {
                suggestions.push(format!(
                    "Consider adding TODO comments for future improvements in {}",
                    file.path.display()
                ));
            }
            
            // Check for error handling
            if !file.content.contains("try") && !file.content.contains("Result") {
                suggestions.push(format!(
                    "Consider adding error handling in {}",
                    file.path.display()
                ));
            }
            
            // Check for tests
            if file.tests.is_none() {
                suggestions.push(format!(
                    "Consider adding tests for {}",
                    file.path.display()
                ));
            }
        }
        
        Ok(suggestions)
    }

    /// Create summary of changes
    fn create_changes_summary(&self, files: &[GeneratedFile]) -> String {
        if files.is_empty() {
            return "No files generated".to_string();
        }
        
        let mut summary = format!("Generated {} file(s):\n", files.len());
        
        for file in files {
            summary.push_str(&format!("- {} ({:?})\n", file.path.display(), file.file_type));
            if file.tests.is_some() {
                summary.push_str(&format!("  - Includes tests\n"));
            }
            if file.documentation.is_some() {
                summary.push_str(&format!("  - Includes documentation\n"));
            }
        }
        
        summary
    }

    /// Refactor existing code
    pub async fn refactor_code(
        &self,
        files: Vec<PathBuf>,
        refactor_description: String,
        constraints: Vec<Constraint>,
    ) -> Result<CodeGenResult> {
        // Read existing files (for future use in refactoring)
        let _existing_code = self.analyze_existing_code(&files).await?;
        
        // Create refactoring request
        let request = CodeGenRequest {
            task_id: uuid::Uuid::new_v4().to_string(),
            description: format!("Refactor: {}", refactor_description),
            target_files: files,
            constraints,
            context: "Refactoring existing code while maintaining functionality".to_string(),
        };
        
        // Generate refactored code
        self.generate_code(request).await
    }

    /// Generate tests for existing code
    pub async fn generate_tests(
        &self,
        source_files: Vec<PathBuf>,
        _test_framework: Option<String>,
    ) -> Result<Vec<GeneratedFile>> {
        // Analyze source files
        let existing_code = self.analyze_existing_code(&source_files).await?;
        
        // Generate test files
        let mut test_files = Vec::new();
        
        for (source_path, _code) in existing_code {
            // Determine test file path
            let test_path = self.get_test_path(&source_path);
            
            // Generate test content (simplified - would use LLM in production)
            let test_content = format!(
                "// Generated tests for {}\n// TODO: Implement actual tests\n\ndescribe('{}', () => {{\n  it('should work', () => {{\n    // Test implementation\n  }});\n}});",
                source_path.display(),
                source_path.file_stem().and_then(|s| s.to_str()).unwrap_or("module")
            );
            
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

    /// Get test file path for a source file
    fn get_test_path(&self, source_path: &PathBuf) -> PathBuf {
        let mut test_path = source_path.clone();
        
        // Change extension to .test.ts or .test.rs etc.
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

