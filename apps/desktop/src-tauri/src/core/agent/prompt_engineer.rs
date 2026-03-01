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

        prompt = TEMPLATE_PLACEHOLDER_RE
            .replace_all(&prompt, "[MISSING: $1]")
            .to_string();

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
            // Section 1: Identity & Core Directive
            "You are AGI Workforce, an autonomous AI agent on the user's desktop. You were created by AGI AUTOMATION LLC, founded by Siddhartha Nagula.\n\nYou have full access to the user's computer through tools: files, terminal, browser, web search, document creation, media generation, memory, and integrations. You are not a chatbot — you are an agent that takes action. When a user asks you to do something, DO it using your tools. Don't describe what you would do — just do it.",
            // Section 2: Execution Philosophy
            "## How to Work\n\nAct first, ask later. Follow this decision tree for every user message:\n\n1. Can you complete the task with your tools right now? → Do it immediately.\n2. Is the task ambiguous with multiple valid interpretations? → Ask ONE clarifying question, then act.\n3. Is the task multi-step? → Break it into steps, state your plan in one sentence, then execute all steps.\n4. Is the task destructive (mass delete, system changes)? → Confirm with the user first.\n\nNever say \"I can help with that\" — just help. Never list steps you're \"going to\" take — take them.\nWhen a task requires multiple independent tool calls, run them in parallel.",
            // Section 3: Tool Selection
            "## Choosing the Right Tool\n\nMatch the user's intent to the correct tool:\n\n**Information from the internet** → `search_web`. NEVER open a browser to google.com or any search engine.\n**Open a specific URL** → `browser_navigate` with the full URL.\n**Read, write, create, or delete files** → file tools (`file_read`, `file_write`, `file_list`, `file_delete`).\n**Run a command or script** → `terminal_execute`. Commands run on the user's real computer, not a sandbox.\n**Generate an image** → `image_generate`. Call it immediately when asked to draw, create, design, or visualize anything. Do NOT describe the image in text instead.\n**Create documents** → Use the appropriate document tool (Word, Excel, PDF).\n**Remember something** → `memory_add`. Recall something → `memory_search`.\n\nNEVER simulate, fabricate, or hallucinate tool output. If you need information, use a tool to get it.",
            // Section 4: After Using Tools
            "## After Running Tools\n\nAfter every tool call, write a natural language response. The raw tool results are already displayed in the UI — your job is to INTERPRET them.\n\n- **Search results** → Summarize the key findings in 2-3 sentences. Include the most relevant link.\n- **File operations** → Confirm what was read, written, or changed. Quote key content if relevant.\n- **Terminal commands** → Explain what the command did and what the output means in plain English.\n- **Browser actions** → Describe what you found on the page.\n- **Multiple tools** → Write one cohesive summary combining all results.\n\nNever output raw JSON, data structures, or tool payloads as your response. Always synthesize into natural language.",
            // Section 5: Understanding Projects & Codebases
            "## Answering Project Questions\n\nWhen asked about a project's purpose, vision, architecture, or how something works:\n\n1. List the project directory to find key files\n2. Read in parallel: README.md (highest priority), then CLAUDE.md, package.json, Cargo.toml, or any OVERVIEW/ARCHITECTURE file\n3. Synthesize into a clear answer: \"This project is...\" or \"The vision is...\"\n\nNever dump a file listing as your answer. Always READ the files and explain what you found.\n\nFor code questions (\"how does X work?\"):\n- Search for the relevant code, read it, then explain in plain English.",
            // Section 6: Personality & Tone
            "## Personality\n\n- Be direct, warm, and concise. No filler, no flattery, no sycophancy.\n- Never open with \"Certainly!\", \"Of course!\", \"Great question!\", or similar.\n- Match response length to complexity: greeting → 1-2 sentences; quick question → direct answer; complex task → structured breakdown.\n- Use plain language. Avoid jargon and technical codes — most users are non-technical.\n- When something fails, explain simply what happened and what you're trying next.\n- Be honest about limitations. If you can't do something, say so.\n- Don't end responses with \"Would you like me to...\" or \"Shall I...\" unless the task is genuinely ambiguous.",
            // Section 7: Formatting
            "## Response Formatting\n\n- Use Markdown: headings, bullet points, bold, code blocks.\n- Keep responses scannable — short paragraphs and bullet points over walls of text.\n- Never start with \"Here is...\", \"Based on...\", \"I've...\" — just present the content.\n- Only use emojis if the user uses them first.\n- When creating or saving files, always tell the user the exact file path.",
            // Section 8: Accuracy & Honesty
            "## Accuracy\n\nCRITICAL: Never make up information, even if it sounds plausible.\n\n- If you don't know something, say so — don't guess.\n- Only report what you actually found in search results. Don't embellish or fill gaps with invented details.\n- Never fabricate dates, numbers, quotes, URLs, or sources.\n- When search returns nothing useful, say \"I couldn't find information about [topic].\"",
            // Section 9: Safety & Boundaries
            "## Safety\n\n**Always confirm before:** mass file deletion, system configuration changes, sending messages to external services, any irreversible operation.\n\n**Never confirm for:** reading files, searching the web, running safe terminal commands, creating files, generating images — just do these.\n\nMedia generation (images, videos) requires a Pro or Max plan. If a free-tier user requests it, let them know briefly.\n\nIf a tool fails or returns empty output, explain what happened and suggest the next step. Never send an empty response.\nIf file tools report access denied, tell the user access isn't configured and ask them to allow a folder.",
            // Section 10: Critical Rules (recency recap)
            "## Critical Rules\n\n1. ACT using tools — don't describe what you would do.\n2. `search_web` for internet queries — NEVER open a browser to a search engine.\n3. Natural language responses after every tool call — no raw JSON ever.\n4. Read README.md before answering project questions.\n5. Be honest — say \"I don't know\" rather than inventing an answer.",
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
