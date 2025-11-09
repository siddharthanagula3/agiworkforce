/// ContextManager - Manages project context and constraints for AI-native software engineering
///
/// This enables engineers to provide high-level context and constraints,
/// while the AI handles all code generation and implementation details.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use chrono::{DateTime, Utc};

/// Constraint types for guiding AI behavior
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConstraintType {
    /// Code style constraints (e.g., "use TypeScript", "follow React best practices")
    CodeStyle { rules: Vec<String> },
    /// Performance constraints (e.g., "must complete in <100ms", "memory limit 50MB")
    Performance { requirements: Vec<String> },
    /// Security constraints (e.g., "no SQL injection", "validate all inputs")
    Security { requirements: Vec<String> },
    /// Architecture constraints (e.g., "use MVC pattern", "separate concerns")
    Architecture { patterns: Vec<String> },
    /// Dependency constraints (e.g., "use only these libraries", "avoid these patterns")
    Dependencies { allowed: Vec<String>, forbidden: Vec<String> },
    /// Testing constraints (e.g., "must have 80% coverage", "write unit tests")
    Testing { requirements: Vec<String> },
    /// Documentation constraints (e.g., "add JSDoc comments", "document public APIs")
    Documentation { requirements: Vec<String> },
}

/// Project context information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectContext {
    pub project_type: String, // "web", "desktop", "api", "library", etc.
    pub language: String,      // "typescript", "rust", "python", etc.
    pub framework: Option<String>, // "react", "tauri", "express", etc.
    pub dependencies: Vec<String>,
    pub patterns: Vec<String>, // Common patterns used in the project
    pub conventions: HashMap<String, String>, // Naming conventions, etc.
    pub project_structure: ProjectStructure,
    pub recent_changes: Vec<ChangeContext>,
}

/// Project file structure analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectStructure {
    pub root: PathBuf,
    pub entry_points: Vec<PathBuf>,
    pub source_dirs: Vec<PathBuf>,
    pub test_dirs: Vec<PathBuf>,
    pub config_files: Vec<PathBuf>,
    pub module_map: HashMap<String, Vec<PathBuf>>, // Module name -> file paths
}

/// Context for a specific change or task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeContext {
    pub task_id: String,
    pub description: String,
    pub affected_files: Vec<PathBuf>,
    pub related_files: Vec<PathBuf>, // Files that might be affected
    pub constraints: Vec<Constraint>,
    pub timestamp: DateTime<Utc>,
}

/// A constraint with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Constraint {
    pub id: String,
    pub constraint_type: ConstraintType,
    pub priority: u8, // 0-10, higher = more important
    pub description: String,
    pub enforced: bool, // Whether to enforce strictly or suggest
}

/// Context Manager for AI-native development
pub struct ContextManager {
    project_context: ProjectContext,
    active_constraints: Vec<Constraint>,
    context_history: Vec<ChangeContext>,
}

impl ContextManager {
    pub fn new(project_root: PathBuf) -> Self {
        Self {
            project_context: ProjectContext {
                project_type: "unknown".to_string(),
                language: "unknown".to_string(),
                framework: None,
                dependencies: Vec::new(),
                patterns: Vec::new(),
                conventions: HashMap::new(),
                project_structure: ProjectStructure {
                    root: project_root.clone(),
                    entry_points: Vec::new(),
                    source_dirs: Vec::new(),
                    test_dirs: Vec::new(),
                    config_files: Vec::new(),
                    module_map: HashMap::new(),
                },
                recent_changes: Vec::new(),
            },
            active_constraints: Vec::new(),
            context_history: Vec::new(),
        }
    }

    /// Set project root
    pub fn set_project_root(&mut self, root: PathBuf) {
        self.project_context.project_structure.root = root;
    }

    /// Analyze project structure and infer context
    pub async fn analyze_project(&mut self) -> Result<(), String> {
        // Analyze package.json / Cargo.toml / etc.
        self.detect_language_and_framework().await?;
        
        // Analyze directory structure
        self.analyze_structure().await?;
        
        // Detect patterns and conventions
        self.detect_patterns().await?;
        
        // Load dependencies
        self.load_dependencies().await?;
        
        Ok(())
    }

    /// Detect programming language and framework
    async fn detect_language_and_framework(&mut self) -> Result<(), String> {
        let root = &self.project_context.project_structure.root;
        
        // Check for package.json (Node.js/TypeScript)
        if root.join("package.json").exists() {
            self.project_context.language = "typescript".to_string();
            self.project_context.project_type = "web".to_string();
            
            // Try to read package.json to detect framework
            if let Ok(content) = tokio::fs::read_to_string(root.join("package.json")).await {
                if content.contains("\"react\"") {
                    self.project_context.framework = Some("react".to_string());
                } else if content.contains("\"vue\"") {
                    self.project_context.framework = Some("vue".to_string());
                } else if content.contains("\"express\"") {
                    self.project_context.framework = Some("express".to_string());
                }
            }
        }
        // Check for Cargo.toml (Rust)
        else if root.join("Cargo.toml").exists() {
            self.project_context.language = "rust".to_string();
            self.project_context.project_type = "library".to_string();
            
            // Check if it's a Tauri project
            if root.join("src-tauri").exists() {
                self.project_context.project_type = "desktop".to_string();
                self.project_context.framework = Some("tauri".to_string());
            }
        }
        // Check for requirements.txt (Python)
        else if root.join("requirements.txt").exists() || root.join("pyproject.toml").exists() {
            self.project_context.language = "python".to_string();
            self.project_context.project_type = "api".to_string();
        }
        
        Ok(())
    }

    /// Analyze project directory structure
    async fn analyze_structure(&mut self) -> Result<(), String> {
        let root = &self.project_context.project_structure.root;
        
        // Common source directories
        let source_patterns = vec!["src", "lib", "app", "apps", "packages"];
        for pattern in source_patterns {
            let path = root.join(pattern);
            if path.exists() && path.is_dir() {
                self.project_context.project_structure.source_dirs.push(path);
            }
        }
        
        // Common test directories
        let test_patterns = vec!["tests", "test", "__tests__", "spec"];
        for pattern in test_patterns {
            let path = root.join(pattern);
            if path.exists() && path.is_dir() {
                self.project_context.project_structure.test_dirs.push(path);
            }
        }
        
        // Config files
        let config_files = vec!["package.json", "tsconfig.json", "Cargo.toml", "pyproject.toml", ".gitignore"];
        for file in config_files {
            let path = root.join(file);
            if path.exists() {
                self.project_context.project_structure.config_files.push(path);
            }
        }
        
        Ok(())
    }

    /// Detect coding patterns and conventions
    async fn detect_patterns(&mut self) -> Result<(), String> {
        // Analyze existing code to detect patterns
        // This is a simplified version - in production, would use AST parsing
        
        let source_dirs = &self.project_context.project_structure.source_dirs;
        for dir in source_dirs {
            if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let path = entry.path();
                    if path.is_file() {
                        // Simple pattern detection based on file structure
                        // In production, would use proper AST analysis
                        if let Ok(content) = tokio::fs::read_to_string(&path).await {
                            // Detect common patterns
                            if content.contains("export const") || content.contains("export function") {
                                self.project_context.patterns.push("ES6 modules".to_string());
                            }
                            if content.contains("class ") {
                                self.project_context.patterns.push("Classes".to_string());
                            }
                            if content.contains("async ") || content.contains(".then(") {
                                self.project_context.patterns.push("Async/await".to_string());
                            }
                        }
                    }
                }
            }
        }
        
        // Remove duplicates
        self.project_context.patterns.sort();
        self.project_context.patterns.dedup();
        
        Ok(())
    }

    /// Load project dependencies
    async fn load_dependencies(&mut self) -> Result<(), String> {
        let root = &self.project_context.project_structure.root;
        
        // Load from package.json
        if let Ok(content) = tokio::fs::read_to_string(root.join("package.json")).await {
            if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(deps) = pkg["dependencies"].as_object() {
                    for (name, _) in deps {
                        self.project_context.dependencies.push(name.clone());
                    }
                }
            }
        }
        
        Ok(())
    }

    /// Add a constraint
    pub fn add_constraint(&mut self, constraint: Constraint) {
        self.active_constraints.push(constraint);
    }

    /// Get constraints for a specific task
    pub fn get_constraints_for_task(&self, task_id: &str) -> Vec<&Constraint> {
        // Find constraints from recent changes related to this task
        let mut constraints = Vec::new();
        
        for change in &self.context_history {
            if change.task_id == task_id {
                constraints.extend(change.constraints.iter());
            }
        }
        
        // Add active global constraints
        constraints.extend(self.active_constraints.iter());
        
        constraints
    }

    /// Create context for a new change/task
    pub fn create_change_context(
        &mut self,
        task_id: String,
        description: String,
        affected_files: Vec<PathBuf>,
    ) -> ChangeContext {
        // Find related files (files that import/use affected files)
        let related_files = self.find_related_files(&affected_files);
        
        let context = ChangeContext {
            task_id: task_id.clone(),
            description,
            affected_files: affected_files.clone(),
            related_files,
            constraints: self.active_constraints.clone(),
            timestamp: Utc::now(),
        };
        
        self.context_history.push(context.clone());
        self.project_context.recent_changes.push(context.clone());
        
        // Keep only last 100 changes
        if self.context_history.len() > 100 {
            self.context_history.remove(0);
        }
        if self.project_context.recent_changes.len() > 100 {
            self.project_context.recent_changes.remove(0);
        }
        
        context
    }

    /// Find files related to the given files (imports, exports, etc.)
    fn find_related_files(&self, files: &[PathBuf]) -> Vec<PathBuf> {
        // Simplified version - in production, would use AST to find imports/exports
        let mut related = Vec::new();
        
        for file in files {
            // Check if file exists and read it
            if let Ok(content) = std::fs::read_to_string(file) {
                // Find import/require statements (simplified regex)
                for line in content.lines() {
                    if line.contains("import") || line.contains("require") || line.contains("from") {
                        // Extract module path (simplified)
                        // In production, would use proper AST parsing
                        // For now, just add files from source dirs that might be related
                        for source_dir in &self.project_context.project_structure.source_dirs {
                            if let Ok(entries) = std::fs::read_dir(source_dir) {
                                for entry in entries.flatten() {
                                    let path = entry.path();
                                    if path.is_file() && !related.contains(&path) {
                                        related.push(path);
                                    }
                                }
                            }
                        }
                        break; // Only check first few imports
                    }
                }
            }
        }
        
        related
    }

    /// Get project context
    pub fn get_project_context(&self) -> &ProjectContext {
        &self.project_context
    }

    /// Generate context prompt for LLM
    pub fn generate_context_prompt(&self, task_description: &str) -> String {
        let mut prompt = String::new();
        
        prompt.push_str("## Project Context\n\n");
        prompt.push_str(&format!("**Language:** {}\n", self.project_context.language));
        if let Some(ref framework) = self.project_context.framework {
            prompt.push_str(&format!("**Framework:** {}\n", framework));
        }
        prompt.push_str(&format!("**Project Type:** {}\n", self.project_context.project_type));
        
        if !self.project_context.patterns.is_empty() {
            prompt.push_str(&format!("**Patterns:** {}\n", self.project_context.patterns.join(", ")));
        }
        
        prompt.push_str("\n## Active Constraints\n\n");
        for constraint in &self.active_constraints {
            prompt.push_str(&format!("- **{}** (Priority: {}): {}\n", 
                constraint.description, 
                constraint.priority,
                match &constraint.constraint_type {
                    ConstraintType::CodeStyle { rules } => format!("Rules: {}", rules.join(", ")),
                    ConstraintType::Performance { requirements } => format!("Requirements: {}", requirements.join(", ")),
                    ConstraintType::Security { requirements } => format!("Requirements: {}", requirements.join(", ")),
                    ConstraintType::Architecture { patterns } => format!("Patterns: {}", patterns.join(", ")),
                    ConstraintType::Dependencies { allowed, forbidden } => {
                        format!("Allowed: {}, Forbidden: {}", allowed.join(", "), forbidden.join(", "))
                    },
                    ConstraintType::Testing { requirements } => format!("Requirements: {}", requirements.join(", ")),
                    ConstraintType::Documentation { requirements } => format!("Requirements: {}", requirements.join(", ")),
                }
            ));
        }
        
        prompt.push_str("\n## Task\n\n");
        prompt.push_str(task_description);
        prompt.push_str("\n\n## Instructions\n\n");
        prompt.push_str("Generate code that:\n");
        prompt.push_str("1. Follows the project's patterns and conventions\n");
        prompt.push_str("2. Adheres to all active constraints\n");
        prompt.push_str("3. Maintains consistency with existing codebase\n");
        prompt.push_str("4. Includes appropriate tests and documentation\n");
        
        prompt
    }
}

