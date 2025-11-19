/// Prompt Engineering System
///
/// Helps engineers craft effective prompts for AI code generation,
/// with templates, best practices, and prompt optimization.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Prompt template for common software engineering tasks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTemplate {
    pub id: String,
    pub name: String,
    pub category: PromptCategory,
    pub template: String,
    pub variables: Vec<String>, // Variables to fill in (e.g., {{feature_name}})
    pub examples: Vec<PromptExample>,
    pub best_practices: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PromptCategory {
    CodeGeneration,
    CodeRefactoring,
    BugFixing,
    TestGeneration,
    Documentation,
    CodeReview,
    Architecture,
    Performance,
    Security,
    Migration,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptExample {
    pub input: String,
    pub output: String,
    pub explanation: String,
}

/// Prompt Engineer for crafting effective prompts
pub struct PromptEngineer {
    templates: HashMap<String, PromptTemplate>,
}

impl PromptEngineer {
    pub fn new() -> Self {
        let mut engineer = Self {
            templates: HashMap::new(),
        };

        // Initialize with built-in templates
        engineer.initialize_templates();

        engineer
    }

    fn initialize_templates(&mut self) {
        // Code Generation Template
        self.templates.insert("code_generation".to_string(), PromptTemplate {
            id: "code_generation".to_string(),
            name: "Code Generation".to_string(),
            category: PromptCategory::CodeGeneration,
            template: r#"Create a {{feature_type}} for {{feature_name}} that:

**Requirements:**
- {{requirements}}

**Constraints:**
- Language: {{language}}
- Framework: {{framework}}
- Patterns: {{patterns}}
- Dependencies: {{dependencies}}

**Context:**
{{context}}

**Expected Output:**
- Main implementation file
- Unit tests
- Documentation
- Example usage

Follow best practices and maintain consistency with existing codebase."#.to_string(),
            variables: vec![
                "feature_type".to_string(),
                "feature_name".to_string(),
                "requirements".to_string(),
                "language".to_string(),
                "framework".to_string(),
                "patterns".to_string(),
                "dependencies".to_string(),
                "context".to_string(),
            ],
            examples: vec![
                PromptExample {
                    input: "Create a user authentication system".to_string(),
                    output: "Create a **authentication module** for **user login** that:\n\n**Requirements:**\n- JWT token generation\n- Password hashing\n- Session management\n\n**Constraints:**\n- Language: TypeScript\n- Framework: Express\n- Patterns: Middleware pattern\n- Dependencies: jsonwebtoken, bcrypt\n\n...".to_string(),
                    explanation: "This template structures the request with clear requirements and constraints".to_string(),
                },
            ],
            best_practices: vec![
                "Be specific about requirements".to_string(),
                "Include relevant context from codebase".to_string(),
                "Specify patterns and conventions to follow".to_string(),
                "Mention dependencies and constraints".to_string(),
            ],
        });

        // Code Refactoring Template
        self.templates.insert(
            "refactoring".to_string(),
            PromptTemplate {
                id: "refactoring".to_string(),
                name: "Code Refactoring".to_string(),
                category: PromptCategory::CodeRefactoring,
                template: r#"Refactor the following code to {{refactoring_goal}}:

**Current Code:**
```{{language}}
{{current_code}}
```

**Issues to Address:**
- {{issues}}

**Refactoring Goals:**
- {{goals}}

**Constraints:**
- Maintain backward compatibility: {{backward_compatible}}
- Performance requirements: {{performance}}
- Test coverage: {{test_coverage}}

**Expected Output:**
- Refactored code
- Updated tests
- Migration guide (if needed)"#
                    .to_string(),
                variables: vec![
                    "refactoring_goal".to_string(),
                    "language".to_string(),
                    "current_code".to_string(),
                    "issues".to_string(),
                    "goals".to_string(),
                    "backward_compatible".to_string(),
                    "performance".to_string(),
                    "test_coverage".to_string(),
                ],
                examples: vec![],
                best_practices: vec![
                    "Clearly identify what needs refactoring".to_string(),
                    "Specify goals and constraints".to_string(),
                    "Include existing code for context".to_string(),
                ],
            },
        );

        // Bug Fixing Template
        self.templates.insert(
            "bug_fixing".to_string(),
            PromptTemplate {
                id: "bug_fixing".to_string(),
                name: "Bug Fixing".to_string(),
                category: PromptCategory::BugFixing,
                template: r#"Fix the following bug:

**Bug Description:**
{{bug_description}}

**Error Message:**
```
{{error_message}}
```

**Affected Code:**
```{{language}}
{{code}}
```

**Steps to Reproduce:**
1. {{step1}}
2. {{step2}}
3. {{step3}}

**Expected Behavior:**
{{expected_behavior}}

**Actual Behavior:**
{{actual_behavior}}

**Environment:**
- Language: {{language}}
- Framework: {{framework}}
- Dependencies: {{dependencies}}

**Fix Requirements:**
- {{fix_requirements}}

Provide a fix that addresses the root cause and includes tests to prevent regression."#
                    .to_string(),
                variables: vec![
                    "bug_description".to_string(),
                    "error_message".to_string(),
                    "language".to_string(),
                    "code".to_string(),
                    "step1".to_string(),
                    "step2".to_string(),
                    "step3".to_string(),
                    "expected_behavior".to_string(),
                    "actual_behavior".to_string(),
                    "framework".to_string(),
                    "dependencies".to_string(),
                    "fix_requirements".to_string(),
                ],
                examples: vec![],
                best_practices: vec![
                    "Include error messages and stack traces".to_string(),
                    "Provide steps to reproduce".to_string(),
                    "Describe expected vs actual behavior".to_string(),
                    "Include relevant code context".to_string(),
                ],
            },
        );

        // Test Generation Template
        self.templates.insert(
            "test_generation".to_string(),
            PromptTemplate {
                id: "test_generation".to_string(),
                name: "Test Generation".to_string(),
                category: PromptCategory::TestGeneration,
                template: r#"Generate comprehensive tests for the following code:

**Code to Test:**
```{{language}}
{{code}}
```

**Test Requirements:**
- Coverage: {{coverage_percentage}}%
- Test framework: {{test_framework}}
- Test types: {{test_types}}

**Test Cases to Cover:**
- {{test_cases}}

**Constraints:**
- Mock external dependencies: {{mock_dependencies}}
- Test edge cases: {{test_edge_cases}}
- Performance tests: {{performance_tests}}

Generate unit tests, integration tests, and edge case tests."#
                    .to_string(),
                variables: vec![
                    "language".to_string(),
                    "code".to_string(),
                    "coverage_percentage".to_string(),
                    "test_framework".to_string(),
                    "test_types".to_string(),
                    "test_cases".to_string(),
                    "mock_dependencies".to_string(),
                    "test_edge_cases".to_string(),
                    "performance_tests".to_string(),
                ],
                examples: vec![],
                best_practices: vec![
                    "Specify test coverage requirements".to_string(),
                    "List test cases to cover".to_string(),
                    "Include edge cases and error scenarios".to_string(),
                ],
            },
        );
    }

    /// Get a template by ID
    pub fn get_template(&self, id: &str) -> Option<&PromptTemplate> {
        self.templates.get(id)
    }

    /// Get templates by category
    pub fn get_templates_by_category(&self, category: PromptCategory) -> Vec<&PromptTemplate> {
        self.templates
            .values()
            .filter(|t| t.category == category)
            .collect()
    }

    /// Fill a template with variables
    pub fn fill_template(
        &self,
        template_id: &str,
        variables: HashMap<String, String>,
    ) -> Result<String, String> {
        let template = self
            .templates
            .get(template_id)
            .ok_or_else(|| format!("Template not found: {}", template_id))?;

        let mut prompt = template.template.clone();

        // Replace all variables
        for (key, value) in variables {
            let placeholder = format!("{{{{{}}}}}", key);
            prompt = prompt.replace(&placeholder, &value);
        }

        // Remove any remaining unfilled variables
        // In production, would validate all variables are filled
        let re = regex::Regex::new(r"\{\{(\w+)\}\}").unwrap();
        prompt = re.replace_all(&prompt, "[MISSING: $1]").to_string();

        Ok(prompt)
    }

    /// Optimize a prompt using best practices
    pub fn optimize_prompt(&self, prompt: &str, category: PromptCategory) -> String {
        let mut optimized = prompt.to_string();

        // Add category-specific optimizations
        match category {
            PromptCategory::CodeGeneration => {
                if !optimized.contains("Requirements:") {
                    optimized = format!("**Requirements:**\n{}\n\n", optimized);
                }
                if !optimized.contains("Constraints:") {
                    optimized.push_str("\n**Constraints:**\n- Follow project conventions\n- Maintain code quality\n");
                }
            }
            PromptCategory::BugFixing => {
                if !optimized.contains("Error Message:") {
                    optimized.push_str("\n**Error Message:**\n[Include error message here]\n");
                }
                if !optimized.contains("Steps to Reproduce:") {
                    optimized.push_str("\n**Steps to Reproduce:**\n1. [Step 1]\n2. [Step 2]\n");
                }
            }
            _ => {}
        }

        // General optimizations
        if !optimized.contains("**") {
            // Add structure if missing
            optimized = format!(
                "**Task:**\n{}\n\n**Context:**\n[Add relevant context]",
                optimized
            );
        }

        optimized
    }

    /// Generate prompt from natural language description
    pub fn generate_prompt_from_description(
        &self,
        description: &str,
        category: Option<PromptCategory>,
    ) -> String {
        let category = category.unwrap_or_else(|| self.detect_category(description));
        let template_id = match category {
            PromptCategory::CodeGeneration => "code_generation",
            PromptCategory::CodeRefactoring => "refactoring",
            PromptCategory::BugFixing => "bug_fixing",
            PromptCategory::TestGeneration => "test_generation",
            _ => "code_generation", // Default
        };

        if self.get_template(template_id).is_some() {
            // Try to extract variables from description
            let mut variables = HashMap::new();
            variables.insert("requirements".to_string(), description.to_string());
            variables.insert(
                "feature_name".to_string(),
                self.extract_feature_name(description),
            );
            variables.insert("language".to_string(), "TypeScript".to_string()); // Default, would detect
            variables.insert("framework".to_string(), "React".to_string()); // Default, would detect
            variables.insert("patterns".to_string(), "Standard patterns".to_string());
            variables.insert(
                "dependencies".to_string(),
                "Standard dependencies".to_string(),
            );
            variables.insert("context".to_string(), "See codebase".to_string());

            self.fill_template(template_id, variables)
                .unwrap_or_else(|_| description.to_string())
        } else {
            self.optimize_prompt(description, category)
        }
    }

    /// Detect category from description
    pub fn detect_category(&self, description: &str) -> PromptCategory {
        let desc_lower = description.to_lowercase();

        if desc_lower.contains("refactor")
            || desc_lower.contains("improve")
            || desc_lower.contains("optimize")
        {
            PromptCategory::CodeRefactoring
        } else if desc_lower.contains("fix")
            || desc_lower.contains("bug")
            || desc_lower.contains("error")
        {
            PromptCategory::BugFixing
        } else if desc_lower.contains("test") || desc_lower.contains("spec") {
            PromptCategory::TestGeneration
        } else {
            PromptCategory::CodeGeneration
        }
    }

    /// Extract feature name from description
    fn extract_feature_name(&self, description: &str) -> String {
        // Simple extraction - in production, would use NLP
        let words: Vec<&str> = description.split_whitespace().collect();
        if words.len() >= 2 {
            format!("{} {}", words[0], words[1])
        } else {
            description.to_string()
        }
    }

    /// Get all templates
    pub fn get_all_templates(&self) -> Vec<&PromptTemplate> {
        self.templates.values().collect()
    }
}

impl Default for PromptEngineer {
    fn default() -> Self {
        Self::new()
    }
}
