use chrono::{DateTime, Utc};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConstraintType {
    CodeStyle {
        rules: Vec<String>,
    },

    Performance {
        requirements: Vec<String>,
    },

    Security {
        requirements: Vec<String>,
    },

    Architecture {
        patterns: Vec<String>,
    },

    Dependencies {
        allowed: Vec<String>,
        forbidden: Vec<String>,
    },

    Testing {
        requirements: Vec<String>,
    },

    Documentation {
        requirements: Vec<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectContext {
    pub project_type: String,
    pub language: String,
    pub framework: Option<String>,
    pub dependencies: Vec<String>,
    pub patterns: Vec<String>,
    pub conventions: HashMap<String, String>,
    pub project_structure: ProjectStructure,
    pub recent_changes: Vec<ChangeContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectStructure {
    pub root: PathBuf,
    pub entry_points: Vec<PathBuf>,
    pub source_dirs: Vec<PathBuf>,
    pub test_dirs: Vec<PathBuf>,
    pub config_files: Vec<PathBuf>,
    pub module_map: HashMap<String, Vec<PathBuf>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeContext {
    pub task_id: String,
    pub description: String,
    pub affected_files: Vec<PathBuf>,
    pub related_files: Vec<PathBuf>,
    pub constraints: Vec<Constraint>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Constraint {
    pub id: String,
    pub constraint_type: ConstraintType,
    pub priority: u8,
    pub description: String,
    pub enforced: bool,
}

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

    pub fn set_project_root(&mut self, root: PathBuf) {
        self.project_context.project_structure.root = root;
    }

    pub async fn analyze_project(&mut self) -> Result<(), String> {
        self.detect_language_and_framework().await?;

        self.analyze_structure().await?;

        self.detect_patterns().await?;

        self.load_dependencies().await?;

        Ok(())
    }

    async fn detect_language_and_framework(&mut self) -> Result<(), String> {
        let root = &self.project_context.project_structure.root;

        if root.join("package.json").exists() {
            self.project_context.language = "typescript".to_string();
            self.project_context.project_type = "web".to_string();

            if let Ok(content) = tokio::fs::read_to_string(root.join("package.json")).await {
                if content.contains("\"react\"") {
                    self.project_context.framework = Some("react".to_string());
                } else if content.contains("\"vue\"") {
                    self.project_context.framework = Some("vue".to_string());
                } else if content.contains("\"express\"") {
                    self.project_context.framework = Some("express".to_string());
                }
            }
        } else if root.join("Cargo.toml").exists() {
            self.project_context.language = "rust".to_string();
            self.project_context.project_type = "library".to_string();

            if root.join("src-tauri").exists() {
                self.project_context.project_type = "desktop".to_string();
                self.project_context.framework = Some("tauri".to_string());
            }
        } else if root.join("requirements.txt").exists() || root.join("pyproject.toml").exists() {
            self.project_context.language = "python".to_string();
            self.project_context.project_type = "api".to_string();
        }

        Ok(())
    }

    async fn analyze_structure(&mut self) -> Result<(), String> {
        let root = &self.project_context.project_structure.root;

        let source_patterns = vec!["src", "lib", "app", "apps", "packages"];
        for pattern in source_patterns {
            let path = root.join(pattern);
            if path.exists() && path.is_dir() {
                self.project_context
                    .project_structure
                    .source_dirs
                    .push(path);
            }
        }

        let test_patterns = vec!["tests", "test", "__tests__", "spec"];
        for pattern in test_patterns {
            let path = root.join(pattern);
            if path.exists() && path.is_dir() {
                self.project_context.project_structure.test_dirs.push(path);
            }
        }

        let config_files = vec![
            "package.json",
            "tsconfig.json",
            "Cargo.toml",
            "pyproject.toml",
            ".gitignore",
        ];
        for file in config_files {
            let path = root.join(file);
            if path.exists() {
                self.project_context
                    .project_structure
                    .config_files
                    .push(path);
            }
        }

        Ok(())
    }

    async fn detect_patterns(&mut self) -> Result<(), String> {
        let source_dirs = &self.project_context.project_structure.source_dirs;
        for dir in source_dirs {
            if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let path = entry.path();
                    if path.is_file() {
                        if let Ok(content) = tokio::fs::read_to_string(&path).await {
                            if content.contains("export const")
                                || content.contains("export function")
                            {
                                self.project_context
                                    .patterns
                                    .push("ES6 modules".to_string());
                            }
                            if content.contains("class ") {
                                self.project_context.patterns.push("Classes".to_string());
                            }
                            if content.contains("async ") || content.contains(".then(") {
                                self.project_context
                                    .patterns
                                    .push("Async/await".to_string());
                            }
                        }
                    }
                }
            }
        }

        self.project_context.patterns.sort();
        self.project_context.patterns.dedup();

        Ok(())
    }

    async fn load_dependencies(&mut self) -> Result<(), String> {
        let root = &self.project_context.project_structure.root;

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

    pub fn add_constraint(&mut self, constraint: Constraint) {
        self.active_constraints.push(constraint);
    }

    pub fn get_constraints_for_task(&self, task_id: &str) -> Vec<&Constraint> {
        let mut constraints = Vec::new();

        for change in &self.context_history {
            if change.task_id == task_id {
                constraints.extend(change.constraints.iter());
            }
        }

        constraints.extend(self.active_constraints.iter());

        constraints
    }

    pub fn create_change_context(
        &mut self,
        task_id: String,
        description: String,
        affected_files: Vec<PathBuf>,
    ) -> ChangeContext {
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

        if self.context_history.len() > 100 {
            self.context_history.remove(0);
        }
        if self.project_context.recent_changes.len() > 100 {
            self.project_context.recent_changes.remove(0);
        }

        context
    }

    fn find_related_files(&self, files: &[PathBuf]) -> Vec<PathBuf> {
        let mut related = Vec::new();

        for file in files {
            if let Ok(content) = std::fs::read_to_string(file) {
                for line in content.lines() {
                    if line.contains("import") || line.contains("require") || line.contains("from")
                    {
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
                        break;
                    }
                }
            }
        }

        related
    }

    pub fn get_project_context(&self) -> &ProjectContext {
        &self.project_context
    }

    pub fn generate_context_prompt(&self, task_description: &str) -> String {
        let mut prompt = String::new();

        prompt.push_str("## Project Context\n\n");
        prompt.push_str(&format!(
            "**Language:** {}\n",
            self.project_context.language
        ));
        if let Some(ref framework) = self.project_context.framework {
            prompt.push_str(&format!("**Framework:** {}\n", framework));
        }
        prompt.push_str(&format!(
            "**Project Type:** {}\n",
            self.project_context.project_type
        ));

        if !self.project_context.patterns.is_empty() {
            prompt.push_str(&format!(
                "**Patterns:** {}\n",
                self.project_context.patterns.join(", ")
            ));
        }

        prompt.push_str("\n## Active Constraints\n\n");
        for constraint in &self.active_constraints {
            prompt.push_str(&format!(
                "- **{}** (Priority: {}): {}\n",
                constraint.description,
                constraint.priority,
                match &constraint.constraint_type {
                    ConstraintType::CodeStyle { rules } => format!("Rules: {}", rules.join(", ")),
                    ConstraintType::Performance { requirements } =>
                        format!("Requirements: {}", requirements.join(", ")),
                    ConstraintType::Security { requirements } =>
                        format!("Requirements: {}", requirements.join(", ")),
                    ConstraintType::Architecture { patterns } =>
                        format!("Patterns: {}", patterns.join(", ")),
                    ConstraintType::Dependencies { allowed, forbidden } => {
                        format!(
                            "Allowed: {}, Forbidden: {}",
                            allowed.join(", "),
                            forbidden.join(", ")
                        )
                    }
                    ConstraintType::Testing { requirements } =>
                        format!("Requirements: {}", requirements.join(", ")),
                    ConstraintType::Documentation { requirements } =>
                        format!("Requirements: {}", requirements.join(", ")),
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
