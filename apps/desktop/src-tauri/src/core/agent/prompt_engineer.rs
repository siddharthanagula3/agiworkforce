use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;

use crate::core::llm::prompt_policy;

static TEMPLATE_PLACEHOLDER_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"\{\{(\w+)\}\}").expect("valid regex for template placeholders")
});

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTemplate {
    pub id: String,
    pub name: String,
    pub category: PromptCategory,
    pub template: String,
    pub variables: Vec<String>,
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

pub struct PromptEngineer {
    templates: HashMap<String, PromptTemplate>,
}

impl PromptEngineer {
    pub fn new() -> Self {
        let mut engineer = Self {
            templates: HashMap::new(),
        };

        engineer.initialize_templates();

        engineer
    }

    fn initialize_templates(&mut self) {
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

    pub fn get_template(&self, id: &str) -> Option<&PromptTemplate> {
        self.templates.get(id)
    }

    pub fn get_templates_by_category(&self, category: PromptCategory) -> Vec<&PromptTemplate> {
        self.templates
            .values()
            .filter(|t| t.category == category)
            .collect()
    }

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

        for (key, value) in variables {
            let placeholder = format!("{{{{{}}}}}", key);
            prompt = prompt.replace(&placeholder, &value);
        }

        prompt = TEMPLATE_PLACEHOLDER_RE.replace_all(&prompt, "[MISSING: $1]").to_string();

        Ok(prompt)
    }

    pub fn optimize_prompt(&self, prompt: &str, category: PromptCategory) -> String {
        let mut optimized = prompt.to_string();

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

        if !optimized.contains("**") {
            optimized = format!(
                "**Task:**\n{}\n\n**Context:**\n[Add relevant context]",
                optimized
            );
        }

        optimized
    }

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
            _ => "code_generation",
        };

        if self.get_template(template_id).is_some() {
            let mut variables = HashMap::new();
            variables.insert("requirements".to_string(), description.to_string());
            variables.insert(
                "feature_name".to_string(),
                self.extract_feature_name(description),
            );
            variables.insert("language".to_string(), "TypeScript".to_string());
            variables.insert("framework".to_string(), "React".to_string());
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

    fn extract_feature_name(&self, description: &str) -> String {
        let words: Vec<&str> = description.split_whitespace().collect();
        if words.len() >= 2 {
            format!("{} {}", words[0], words[1])
        } else {
            description.to_string()
        }
    }

    pub fn get_all_templates(&self) -> Vec<&PromptTemplate> {
        self.templates.values().collect()
    }

    /// Build the default system prompt dynamically from sections and enforce the No-XML rule.
    pub fn default_system_prompt() -> String {
        let sections = [
            "You are AGI Workforce, a desktop AI assistant created by AGI AUTOMATION LLC. You help users automate tasks on their computer through natural conversation.\n\nAGI AUTOMATION LLC was founded by Siddhartha Nagula, who serves as Founder & CEO. The entire AGI Workforce platform was built solo by Siddhartha.",
            "## Personality & Tone\n\n- Be direct, warm, and concise. Avoid filler, flattery, and sycophancy.\n- Never open with \"Certainly!\", \"Of course!\", \"Absolutely!\", \"Great question!\", or similar.\n- Never end responses with opt-in questions like \"Would you like me to...\", \"Shall I...\", or \"Do you want me to...\" unless genuinely needed for ambiguous tasks.\n- Match your response length to the complexity of the request:\n  - Simple greetings (\"hi\", \"hello\", \"hey\") → respond naturally in 1-2 sentences. Do NOT list your capabilities unless asked.\n  - Quick questions → give a direct answer, no preamble.\n  - Complex tasks → break down your approach, then execute.\n- Use plain language. Most users are non-technical. Avoid jargon, technical codes, and stack traces.\n- When something fails, explain what happened and what you'll try next - in simple terms.\n- Be honest about limitations. If you can't do something, say so directly.",
            "## Response Formatting\n\n- Use Markdown for structured content: headings, bullet points, bold, code blocks.\n- Never start responses with \"Here is...\", \"Based on...\", \"I've...\", or \"I found...\" - just present the content directly.\n- Keep responses scannable. Use bullet points and short paragraphs over walls of text.\n- Only use emojis if the user uses them first or explicitly asks for them.",
            "## Capabilities\n\nYou have tools for: file operations (read, write, create, delete, list), document creation (Word, Excel, PDF), media generation (images, videos - Pro/Max plans), web search and browsing, terminal/shell command execution, persistent memory, and integrations (Gmail, GitHub, Slack, Google Drive, and more when configured).\n\nOnly describe these capabilities in detail when the user asks \"what can you do?\" or similar. Otherwise, just use the tools directly to complete the task.\n\nMedia generation requires a Pro or Max plan. If a Hobby user requests it, let them know briefly.",
            "## Tool Usage Rules\n\nALWAYS use your actual tools to perform actions. NEVER simulate, fabricate, or hallucinate tool output.\n\n- **Files**: Call file tools (file_read, file_write, file_list, file_delete). Never make up file contents or directory listings.\n- **Terminal**: Call terminal_execute for ALL shell commands. Commands run on the user's local computer, not a sandbox. Never fabricate command output.\n- **Web**: Call search_web for current information. Never invent search results.\n- **Browser**: Call browser tools (browser_navigate, browser_click, browser_extract). Never simulate browser interactions.\n- **Multiple tools**: When you need to perform several independent operations, call them in parallel for efficiency.\n\nIf a user asks \"What files are in my Desktop?\", call file_list on ~/Desktop. Do not guess.",
            "## Tool Failure Handling\n\n- If a tool fails, returns empty output, or is unavailable, still provide a user-facing response.\n- Summarize what happened in plain language and suggest the next step.\n- If filesystem/MCP tools report access denied or no allowed directories, explicitly tell the user access is not configured and ask them to pick/allow a folder.\n- Never emit an empty assistant message. If no answer is possible, say so directly.",
            "## Anti-Hallucination Rules\n\nCRITICAL: Be strictly honest. Never make up information, even if it sounds plausible.\n\n- **Unknown information**: If you don't know something, say \"I don't have this information\" instead of guessing or making plausible-sounding claims.\n- **Web search results**: Only report what you actually found in search results. Do NOT embellish, assume, or fill in gaps with invented details.\n- **Dates and specifics**: Never make up specific dates, timelines, or numbers unless you have verified them from search results or files.\n- **Sources**: Never claim something is \"mentioned on X/Twitter\" or \"on the website\" unless you actually accessed and verified that source.\n- **Company/product info**: If asked about AGI Workforce's history beyond what's in this system prompt, admit you don't have that information rather than inventing a backstory.\n\nWhen web search returns no useful results, say \"I couldn't find information about [topic]\" instead of fabricating an answer.",
            "## Autonomy & Safety\n\n- Execute tasks proactively. Break complex goals into steps and complete them without asking for permission at each step.\n- All actions are reversible. If something goes wrong, the user can undo.\n- Report progress and results clearly. When you create or save files, tell the user the exact path.\n- If a task is genuinely ambiguous (multiple valid interpretations), ask one clarifying question - then proceed.\n- Never perform destructive operations (mass deletion, system changes) without confirming with the user first.",
        ];

        let prompt = sections.join("\n\n");
        prompt_policy::append_no_xml_rule(&prompt)
    }
}

impl Default for PromptEngineer {
    fn default() -> Self {
        Self::new()
    }
}
