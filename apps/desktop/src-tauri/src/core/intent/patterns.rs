//! Intent pattern matching and keyword extraction.

use super::types::{Complexity, IntentCategory, RequiredServer};
use regex::Regex;
use std::collections::HashMap;

/// A pattern for matching user intents.
#[derive(Debug, Clone)]
pub struct IntentPattern {
    /// The intent category this pattern matches.
    pub category: IntentCategory,

    /// Keywords that trigger this pattern (case-insensitive).
    pub keywords: Vec<&'static str>,

    /// Regex patterns for more complex matching.
    pub regex_patterns: Vec<&'static str>,

    /// Default complexity for this pattern.
    pub default_complexity: Complexity,

    /// Required tools for this pattern.
    pub tools: Vec<&'static str>,

    /// Required MCP servers for this pattern.
    pub mcp_servers: Vec<&'static str>,

    /// Entity extraction patterns (name -> regex).
    pub entity_patterns: Vec<(&'static str, &'static str)>,

    /// Base confidence score for this pattern.
    pub base_confidence: f64,
}

impl IntentPattern {
    /// Creates a new intent pattern.
    #[must_use]
    pub const fn new(category: IntentCategory) -> Self {
        Self {
            category,
            keywords: Vec::new(),
            regex_patterns: Vec::new(),
            default_complexity: Complexity::Simple,
            tools: Vec::new(),
            mcp_servers: Vec::new(),
            entity_patterns: Vec::new(),
            base_confidence: 0.7,
        }
    }
}

/// Pattern matcher for intent detection.
pub struct PatternMatcher {
    patterns: Vec<IntentPattern>,
    compiled_regex: HashMap<IntentCategory, Vec<Regex>>,
    entity_extractors: HashMap<&'static str, Regex>,
}

impl PatternMatcher {
    /// Creates a new pattern matcher with built-in patterns.
    #[must_use]
    pub fn new() -> Self {
        let patterns = Self::build_default_patterns();
        let mut compiled_regex = HashMap::new();
        let mut entity_extractors = HashMap::new();

        // Compile regex patterns
        for pattern in &patterns {
            let regexes: Vec<Regex> = pattern
                .regex_patterns
                .iter()
                .filter_map(|p| Regex::new(p).ok())
                .collect();
            compiled_regex.insert(pattern.category, regexes);

            for (name, regex_str) in &pattern.entity_patterns {
                if let Ok(regex) = Regex::new(regex_str) {
                    entity_extractors.insert(*name, regex);
                }
            }
        }

        Self {
            patterns,
            compiled_regex,
            entity_extractors,
        }
    }

    /// Matches a prompt against all patterns and returns matches with scores.
    pub fn match_prompt(&self, prompt: &str) -> Vec<PatternMatch> {
        let prompt_lower = prompt.to_lowercase();
        let mut matches = Vec::new();

        for pattern in &self.patterns {
            let mut score = 0.0;
            let mut matched_keywords = Vec::new();

            // Keyword matching
            for keyword in &pattern.keywords {
                if prompt_lower.contains(&keyword.to_lowercase()) {
                    score += 0.2;
                    matched_keywords.push((*keyword).to_string());
                }
            }

            // Regex matching
            if let Some(regexes) = self.compiled_regex.get(&pattern.category) {
                for regex in regexes {
                    if regex.is_match(&prompt_lower) {
                        score += 0.3;
                    }
                }
            }

            // Normalize score
            // Instead of dividing by total possible (which punishes patterns with many keywords),
            // we saturate at a reasonable threshold (e.g., matching 2-3 keywords or 1 regex is "full match").
            // 1.0 represents "strong match" before base_confidence application.
            let saturation_threshold: f64 = 1.0;
            let normalized_score = (score / saturation_threshold).min(1.0);

            score = normalized_score * pattern.base_confidence;

            if score > 0.1 {
                matches.push(PatternMatch {
                    category: pattern.category,
                    score,
                    matched_keywords,
                    tools: pattern.tools.iter().map(|s| (*s).to_string()).collect(),
                    servers: pattern
                        .mcp_servers
                        .iter()
                        .map(|s| RequiredServer::new(*s))
                        .collect(),
                    complexity: pattern.default_complexity,
                });
            }
        }

        // Sort by score descending
        matches.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        matches
    }

    /// Extracts entities from a prompt.
    pub fn extract_entities(&self, prompt: &str) -> HashMap<String, String> {
        let mut entities = HashMap::new();

        for (name, regex) in &self.entity_extractors {
            if let Some(captures) = regex.captures(prompt) {
                if let Some(matched) = captures.get(1) {
                    entities.insert((*name).to_string(), matched.as_str().to_string());
                }
            }
        }

        // Built-in entity extraction
        self.extract_builtin_entities(prompt, &mut entities);

        entities
    }

    /// Extracts common entities like file paths, URLs, and email addresses.
    fn extract_builtin_entities(&self, prompt: &str, entities: &mut HashMap<String, String>) {
        // File paths (Unix and Windows)
        let file_path_regex =
            Regex::new(r#"(?:["'])?([/~][\w./\-_]+|[A-Za-z]:\\[\w\\.\-_]+)(?:["'])?"#).ok();
        if let Some(regex) = file_path_regex {
            if let Some(captures) = regex.captures(prompt) {
                if let Some(matched) = captures.get(1) {
                    entities.insert("file_path".to_string(), matched.as_str().to_string());
                }
            }
        }

        // URLs
        let url_regex = Regex::new(r"(https?://[^\s<>\[\]{}|\\^`]+|www\.[^\s<>\[\]{}|\\^`]+)").ok();
        if let Some(regex) = url_regex {
            if let Some(captures) = regex.captures(prompt) {
                if let Some(matched) = captures.get(1) {
                    entities.insert("url".to_string(), matched.as_str().to_string());
                }
            }
        }

        // Email addresses
        let email_regex = Regex::new(r"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})").ok();
        if let Some(regex) = email_regex {
            if let Some(captures) = regex.captures(prompt) {
                if let Some(matched) = captures.get(1) {
                    entities.insert("email".to_string(), matched.as_str().to_string());
                }
            }
        }

        // Time expressions
        let time_regex = Regex::new(
            r"(?i)(in \d+ (?:hours?|minutes?|days?)|at \d{1,2}(?::\d{2})?\s*(?:am|pm)?|tomorrow|today|next \w+)",
        )
        .ok();
        if let Some(regex) = time_regex {
            if let Some(captures) = regex.captures(prompt) {
                if let Some(matched) = captures.get(1) {
                    entities.insert("time".to_string(), matched.as_str().to_string());
                }
            }
        }
    }

    /// Estimates complexity based on prompt characteristics.
    pub fn estimate_complexity(&self, prompt: &str, category: IntentCategory) -> Complexity {
        let prompt_lower = prompt.to_lowercase();
        let word_count = prompt.split_whitespace().count();

        // Quick win indicators
        let quick_win_indicators = [
            "what is", "what's", "show me", "tell me", "get", "read", "open", "check",
        ];
        if quick_win_indicators
            .iter()
            .any(|i| prompt_lower.starts_with(i))
            && word_count < 10
        {
            return Complexity::QuickWin;
        }

        // Long-running indicators
        let long_running_indicators = [
            "analyze all",
            "process every",
            "for each",
            "entire project",
            "full audit",
            "comprehensive",
            "complete",
            "all files",
        ];
        if long_running_indicators
            .iter()
            .any(|i| prompt_lower.contains(i))
        {
            return Complexity::LongRunning;
        }

        // Complex task indicators
        let complex_indicators = [
            "then",
            "after that",
            "and also",
            "multiple",
            "several",
            "create and",
            "build and",
            "and then",
        ];
        let complex_count = complex_indicators
            .iter()
            .filter(|i| prompt_lower.contains(*i))
            .count();

        if complex_count >= 2 {
            return Complexity::Complex;
        }

        // Moderate task indicators
        if complex_count == 1 || word_count > 20 {
            return Complexity::Moderate;
        }

        // Category-based defaults
        match category {
            IntentCategory::Conversation => Complexity::QuickWin,
            IntentCategory::FileOperation | IntentCategory::Memory => Complexity::Simple,
            IntentCategory::WebSearch | IntentCategory::Email => Complexity::Simple,
            IntentCategory::Document | IntentCategory::CodeTask => Complexity::Moderate,
            IntentCategory::Automation | IntentCategory::MediaGeneration => Complexity::Moderate,
            IntentCategory::Database | IntentCategory::ApiIntegration => Complexity::Moderate,
            IntentCategory::VersionControl => Complexity::Simple,
            _ => Complexity::Simple,
        }
    }

    /// Builds the default set of intent patterns.
    fn build_default_patterns() -> Vec<IntentPattern> {
        vec![
            // File operations
            IntentPattern {
                category: IntentCategory::FileOperation,
                keywords: vec![
                    "file",
                    "folder",
                    "directory",
                    "read",
                    "write",
                    "delete",
                    "move",
                    "copy",
                    "rename",
                    "create file",
                    "save",
                    "open file",
                    "find file",
                    "search file",
                    "list files",
                ],
                regex_patterns: vec![
                    r"(?i)read\s+(?:the\s+)?file",
                    r"(?i)write\s+to\s+(?:the\s+)?file",
                    r"(?i)delete\s+(?:the\s+)?file",
                    r"(?i)create\s+(?:a\s+)?(?:new\s+)?file",
                    r"(?i)find\s+files?\s+(?:named|called|matching)",
                ],
                default_complexity: Complexity::Simple,
                tools: vec!["file_read", "file_write", "file_delete"],
                mcp_servers: vec!["filesystem"],
                entity_patterns: vec![("file_path", r#"["']?([/~][\w./\-]+)["']?"#)],
                base_confidence: 0.85,
            },
            // Web search
            IntentPattern {
                category: IntentCategory::WebSearch,
                keywords: vec![
                    "search",
                    "google",
                    "look up",
                    "find online",
                    "research",
                    "browse",
                    "web",
                    "internet",
                    "what is",
                    "who is",
                    "where is",
                    "how to",
                ],
                regex_patterns: vec![
                    r"(?i)search\s+(?:for|the\s+web|online)",
                    r"(?i)look\s+up",
                    r"(?i)google\s+",
                    r"(?i)find\s+(?:information|info)\s+(?:about|on)",
                ],
                default_complexity: Complexity::QuickWin,
                tools: vec!["search_web", "browser_navigate", "browser_extract"],
                mcp_servers: vec!["brave-search", "web-search"],
                entity_patterns: vec![("query", r#"search\s+(?:for\s+)?['"]?([^'"]+)['"]?"#)],
                base_confidence: 0.9,
            },
            // Email operations
            IntentPattern {
                category: IntentCategory::Email,
                keywords: vec![
                    "email",
                    "mail",
                    "inbox",
                    "send email",
                    "check email",
                    "read email",
                    "compose",
                    "reply",
                    "forward",
                    "gmail",
                    "outlook",
                ],
                regex_patterns: vec![
                    r"(?i)send\s+(?:an?\s+)?email",
                    r"(?i)check\s+(?:my\s+)?(?:email|inbox|mail)",
                    r"(?i)read\s+(?:my\s+)?(?:email|mail)",
                    r"(?i)search\s+(?:my\s+)?(?:email|inbox)",
                ],
                default_complexity: Complexity::Simple,
                tools: vec!["email_send", "email_fetch"],
                mcp_servers: vec!["gmail", "google-workspace", "outlook"],
                entity_patterns: vec![
                    (
                        "recipient",
                        r"(?:to|email)\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+)",
                    ),
                    ("subject", r#"subject[:\s]+['"]?([^'"]+)['"]?"#),
                ],
                base_confidence: 0.85,
            },
            // Calendar operations
            IntentPattern {
                category: IntentCategory::Calendar,
                keywords: vec![
                    "calendar",
                    "schedule",
                    "meeting",
                    "appointment",
                    "event",
                    "remind",
                    "book",
                    "availability",
                    "free time",
                    "busy",
                ],
                regex_patterns: vec![
                    r"(?i)schedule\s+(?:a\s+)?(?:meeting|call|event)",
                    r"(?i)check\s+(?:my\s+)?(?:calendar|schedule)",
                    r"(?i)what.+(?:on\s+my\s+calendar|scheduled)",
                    r"(?i)create\s+(?:a\s+)?(?:calendar\s+)?event",
                ],
                default_complexity: Complexity::Simple,
                tools: vec!["calendar_create_event", "calendar_list_events"],
                mcp_servers: vec!["google-calendar", "google-workspace", "outlook-calendar"],
                entity_patterns: vec![
                    (
                        "event_title",
                        r#"(?:meeting|event|appointment)\s+(?:for|about|called)\s+['"]?([^'"]+)['"]?"#,
                    ),
                    (
                        "time",
                        r"(?:at|on)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s+(?:on\s+)?\w+)?)",
                    ),
                ],
                base_confidence: 0.85,
            },
            // Code tasks
            IntentPattern {
                category: IntentCategory::CodeTask,
                keywords: vec![
                    "code",
                    "program",
                    "script",
                    "function",
                    "debug",
                    "refactor",
                    "implement",
                    "fix bug",
                    "write code",
                    "python",
                    "javascript",
                    "rust",
                    "typescript",
                ],
                regex_patterns: vec![
                    r"(?i)write\s+(?:a\s+)?(?:code|function|script|program)",
                    r"(?i)fix\s+(?:the\s+)?(?:bug|error|issue)",
                    r"(?i)debug\s+",
                    r"(?i)implement\s+",
                    r"(?i)refactor\s+",
                ],
                default_complexity: Complexity::Moderate,
                tools: vec!["code_execute", "code_analyze", "file_read", "file_write"],
                mcp_servers: vec!["github", "codebase"],
                entity_patterns: vec![(
                    "language",
                    r"(?i)(?:in\s+)?(python|javascript|typescript|rust|go|java|c\+\+)",
                )],
                base_confidence: 0.8,
            },
            // Document operations
            IntentPattern {
                category: IntentCategory::Document,
                keywords: vec![
                    "document",
                    "word",
                    "pdf",
                    "excel",
                    "spreadsheet",
                    "powerpoint",
                    "presentation",
                    "docx",
                    "xlsx",
                    "report",
                    "create document",
                ],
                regex_patterns: vec![
                    r"(?i)create\s+(?:a\s+)?(?:word|pdf|excel|document)",
                    r"(?i)read\s+(?:the\s+)?(?:document|pdf|word|excel)",
                    r"(?i)open\s+(?:the\s+)?(?:document|pdf|word|excel)",
                    r"(?i)write\s+(?:a\s+)?(?:report|document)",
                ],
                default_complexity: Complexity::Moderate,
                tools: vec![
                    "document_read",
                    "document_search",
                    "document_create_word",
                    "document_create_excel",
                    "document_create_pdf",
                ],
                mcp_servers: vec!["google-docs", "google-drive"],
                entity_patterns: vec![(
                    "document_path",
                    r#"(?:document|file)\s+(?:at|called|named)\s+['"]?([^'"]+)['"]?"#,
                )],
                base_confidence: 0.85,
            },
            // Automation
            IntentPattern {
                category: IntentCategory::Automation,
                keywords: vec![
                    "automate",
                    "click",
                    "type",
                    "fill form",
                    "browser",
                    "navigate",
                    "scrape",
                    "extract",
                    "screenshot",
                    "ui",
                ],
                regex_patterns: vec![
                    r"(?i)click\s+(?:on\s+)?(?:the\s+)?",
                    r"(?i)type\s+(?:in|into)",
                    r"(?i)fill\s+(?:in\s+)?(?:the\s+)?form",
                    r"(?i)navigate\s+to",
                    r"(?i)take\s+(?:a\s+)?screenshot",
                    r"(?i)scrape\s+",
                ],
                default_complexity: Complexity::Moderate,
                tools: vec![
                    "ui_click",
                    "ui_type",
                    "ui_screenshot",
                    "browser_navigate",
                    "browser_click",
                    "browser_extract",
                    "physical_scrape",
                ],
                mcp_servers: vec!["puppeteer", "playwright"],
                entity_patterns: vec![("url", r"(https?://[^\s]+)")],
                base_confidence: 0.8,
            },
            // Database operations
            IntentPattern {
                category: IntentCategory::Database,
                keywords: vec![
                    "database", "sql", "query", "table", "select", "insert", "update", "delete",
                    "postgres", "mysql", "mongodb", "redis",
                ],
                regex_patterns: vec![
                    r"(?i)run\s+(?:a\s+)?(?:sql\s+)?query",
                    r"(?i)select\s+.*\s+from",
                    r"(?i)insert\s+into",
                    r"(?i)update\s+.*\s+set",
                    r"(?i)delete\s+from",
                ],
                default_complexity: Complexity::Moderate,
                tools: vec![
                    "db_query",
                    "db_execute",
                    "db_transaction_begin",
                    "db_transaction_commit",
                    "db_transaction_rollback",
                ],
                mcp_servers: vec!["postgres", "mysql", "mongodb", "sqlite"],
                entity_patterns: vec![(
                    "table_name",
                    r#"(?i)(?:from|into|update)\s+[`'"]?(\w+)[`'"]?"#,
                )],
                base_confidence: 0.85,
            },
            // API integration
            IntentPattern {
                category: IntentCategory::ApiIntegration,
                keywords: vec![
                    "api", "rest", "http", "request", "endpoint", "webhook", "post", "get", "put",
                    "fetch", "call api",
                ],
                regex_patterns: vec![
                    r"(?i)make\s+(?:a\s+)?(?:api|http)\s+(?:call|request)",
                    r"(?i)call\s+(?:the\s+)?api",
                    r"(?i)(?:get|post|put|delete)\s+(?:request\s+)?to",
                    r"(?i)fetch\s+(?:data\s+)?from",
                ],
                default_complexity: Complexity::Simple,
                tools: vec!["api_call", "api_upload", "api_download"],
                mcp_servers: vec![],
                entity_patterns: vec![("api_url", r"(https?://[^\s]+)")],
                base_confidence: 0.8,
            },
            // Image processing
            IntentPattern {
                category: IntentCategory::ImageProcessing,
                keywords: vec![
                    "image",
                    "photo",
                    "picture",
                    "ocr",
                    "analyze image",
                    "extract text",
                    "resize",
                    "crop",
                    "convert image",
                ],
                regex_patterns: vec![
                    r"(?i)analyze\s+(?:the\s+)?(?:image|photo|picture)",
                    r"(?i)extract\s+text\s+from\s+(?:the\s+)?(?:image|photo)",
                    r"(?i)ocr\s+",
                    r"(?i)what.+(?:in\s+)?(?:this\s+)?(?:image|photo|picture)",
                ],
                default_complexity: Complexity::Simple,
                tools: vec!["image_ocr", "image_analyze"],
                mcp_servers: vec![],
                entity_patterns: vec![(
                    "image_path",
                    r#"(?:image|photo|picture)\s+(?:at|called|named)\s+['"]?([^'"]+)['"]?"#,
                )],
                base_confidence: 0.8,
            },
            // Version control (Git)
            IntentPattern {
                category: IntentCategory::VersionControl,
                keywords: vec![
                    "git",
                    "commit",
                    "push",
                    "pull",
                    "branch",
                    "merge",
                    "clone",
                    "github",
                    "repository",
                    "repo",
                ],
                regex_patterns: vec![
                    r"(?i)git\s+(?:commit|push|pull|clone|branch)",
                    r"(?i)commit\s+(?:the\s+)?changes",
                    r"(?i)push\s+to\s+(?:the\s+)?(?:remote|origin|github)",
                    r"(?i)create\s+(?:a\s+)?(?:new\s+)?(?:branch|repo|repository)",
                ],
                default_complexity: Complexity::Simple,
                tools: vec![
                    "git_init",
                    "git_add",
                    "git_commit",
                    "git_push",
                    "git_status",
                    "git_clone",
                    "github_create_repo",
                ],
                mcp_servers: vec!["github", "gitlab"],
                entity_patterns: vec![
                    (
                        "branch_name",
                        r#"branch\s+(?:called|named)?\s*['"]?(\w+)['"]?"#,
                    ),
                    (
                        "commit_message",
                        r#"(?:message|msg)\s*[:\s]+['"]?([^'"]+)['"]?"#,
                    ),
                ],
                base_confidence: 0.9,
            },
            // System commands
            IntentPattern {
                category: IntentCategory::SystemCommand,
                keywords: vec![
                    "terminal",
                    "command",
                    "shell",
                    "run",
                    "execute",
                    "bash",
                    "powershell",
                    "cmd",
                    "npm",
                    "pip",
                    "install",
                ],
                regex_patterns: vec![
                    r"(?i)run\s+(?:the\s+)?command",
                    r"(?i)execute\s+(?:in\s+)?(?:terminal|shell|bash)",
                    r"(?i)(?:npm|pip|cargo|brew)\s+(?:install|run)",
                ],
                default_complexity: Complexity::Simple,
                tools: vec!["terminal_execute"],
                mcp_servers: vec![],
                entity_patterns: vec![("command", r#"(?:run|execute)\s+[`'"]([^`'"]+)[`'"]"#)],
                base_confidence: 0.85,
            },
            // Memory operations
            IntentPattern {
                category: IntentCategory::Memory,
                keywords: vec![
                    "remember",
                    "recall",
                    "forget",
                    "memory",
                    "note",
                    "save this",
                    "what did",
                    "my preference",
                ],
                regex_patterns: vec![
                    r"(?i)remember\s+(?:that\s+)?",
                    r"(?i)recall\s+",
                    r"(?i)forget\s+(?:about\s+)?",
                    r"(?i)what\s+(?:did\s+)?(?:i|we)\s+(?:say|talk|discuss)",
                ],
                default_complexity: Complexity::QuickWin,
                tools: vec![
                    "memory_remember",
                    "memory_recall",
                    "memory_search",
                    "memory_forget",
                ],
                mcp_servers: vec![],
                entity_patterns: vec![("topic", r"remember\s+(?:that\s+)?(?:my\s+)?(.+)")],
                base_confidence: 0.85,
            },
            // Scheduling and reminders
            IntentPattern {
                category: IntentCategory::Scheduling,
                keywords: vec![
                    "remind",
                    "reminder",
                    "schedule",
                    "alarm",
                    "notify",
                    "every day",
                    "recurring",
                    "repeat",
                    "timer",
                ],
                regex_patterns: vec![
                    r"(?i)remind\s+me\s+(?:to\s+)?",
                    r"(?i)set\s+(?:a\s+)?(?:reminder|alarm|timer)",
                    r"(?i)schedule\s+(?:a\s+)?(?:task|reminder)",
                    r"(?i)every\s+(?:day|week|month|morning|evening)",
                ],
                default_complexity: Complexity::QuickWin,
                tools: vec![
                    "schedule_reminder",
                    "schedule_recurring_task",
                    "cancel_scheduled_task",
                    "list_scheduled_tasks",
                ],
                mcp_servers: vec![],
                entity_patterns: vec![
                    (
                        "reminder_text",
                        r"remind\s+me\s+(?:to\s+)?(.+?)(?:\s+(?:at|in|on)\s+|$)",
                    ),
                    ("time", r"(?:at|in|on)\s+(.+)$"),
                ],
                base_confidence: 0.9,
            },
            // Media generation
            IntentPattern {
                category: IntentCategory::MediaGeneration,
                keywords: vec![
                    "generate image",
                    "create image",
                    "make image",
                    "draw",
                    "generate video",
                    "create video",
                    "dalle",
                    "midjourney",
                    "stable diffusion",
                ],
                regex_patterns: vec![
                    r"(?i)(?:generate|create|make|draw)\s+(?:an?\s+)?(?:image|picture|photo)",
                    r"(?i)(?:generate|create|make)\s+(?:a\s+)?video",
                    r"(?i)(?:image|picture)\s+of\s+",
                ],
                default_complexity: Complexity::Moderate,
                tools: vec![
                    "image_generate",
                    "video_generate",
                    "media_generate_image",
                    "media_generate_video",
                ],
                mcp_servers: vec![],
                entity_patterns: vec![("prompt", r"(?:of|showing|with)\s+(.+)$")],
                base_confidence: 0.85,
            },
            // Cloud storage
            IntentPattern {
                category: IntentCategory::CloudStorage,
                keywords: vec![
                    "cloud",
                    "drive",
                    "dropbox",
                    "google drive",
                    "onedrive",
                    "s3",
                    "upload",
                    "download",
                    "sync",
                ],
                regex_patterns: vec![
                    r"(?i)upload\s+(?:to\s+)?(?:the\s+)?(?:cloud|drive|dropbox|s3)",
                    r"(?i)download\s+from\s+(?:the\s+)?(?:cloud|drive|dropbox|s3)",
                    r"(?i)sync\s+(?:with\s+)?(?:the\s+)?(?:cloud|drive)",
                ],
                default_complexity: Complexity::Simple,
                tools: vec!["cloud_upload", "cloud_download"],
                mcp_servers: vec!["google-drive", "dropbox", "s3"],
                entity_patterns: vec![(
                    "cloud_path",
                    r#"(?:to|from)\s+(?:the\s+)?(?:cloud\s+)?['"]?([^'"]+)['"]?"#,
                )],
                base_confidence: 0.85,
            },
            // Productivity tools
            IntentPattern {
                category: IntentCategory::Productivity,
                keywords: vec![
                    "task",
                    "todo",
                    "to-do",
                    "notion",
                    "trello",
                    "asana",
                    "jira",
                    "create task",
                    "add task",
                    "project",
                ],
                regex_patterns: vec![
                    r"(?i)create\s+(?:a\s+)?(?:new\s+)?task",
                    r"(?i)add\s+(?:a\s+)?(?:task|todo)",
                    r"(?i)add\s+to\s+(?:my\s+)?(?:todo|task)\s+list",
                ],
                default_complexity: Complexity::Simple,
                tools: vec!["productivity_create_task"],
                mcp_servers: vec!["notion", "trello", "asana", "linear"],
                entity_patterns: vec![("task_title", r#"task[:\s]+['"]?([^'"]+)['"]?"#)],
                base_confidence: 0.8,
            },
            // Conversation (fallback)
            IntentPattern {
                category: IntentCategory::Conversation,
                keywords: vec![
                    "hello",
                    "hi",
                    "hey",
                    "thanks",
                    "thank you",
                    "help",
                    "what can you",
                    "how are you",
                ],
                regex_patterns: vec![
                    r"(?i)^(?:hello|hi|hey|good\s+(?:morning|afternoon|evening))",
                    r"(?i)^(?:thanks|thank\s+you)",
                    r"(?i)^what\s+can\s+you\s+do",
                ],
                default_complexity: Complexity::QuickWin,
                tools: vec![],
                mcp_servers: vec![],
                entity_patterns: vec![],
                base_confidence: 0.6,
            },
        ]
    }
}

impl Default for PatternMatcher {
    fn default() -> Self {
        Self::new()
    }
}

/// A match result from pattern matching.
#[derive(Debug, Clone)]
pub struct PatternMatch {
    /// The matched category.
    pub category: IntentCategory,

    /// Match score (0.0 to 1.0).
    pub score: f64,

    /// Keywords that matched.
    pub matched_keywords: Vec<String>,

    /// Suggested tools.
    pub tools: Vec<String>,

    /// Required MCP servers.
    pub servers: Vec<RequiredServer>,

    /// Suggested complexity.
    pub complexity: Complexity,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pattern_matcher_file_operations() {
        let matcher = PatternMatcher::new();
        let matches = matcher.match_prompt("read the file at /tmp/test.txt");

        assert!(!matches.is_empty());
        assert_eq!(matches[0].category, IntentCategory::FileOperation);
        assert!(matches[0].score > 0.3);
    }

    #[test]
    fn test_pattern_matcher_web_search() {
        let matcher = PatternMatcher::new();
        let matches = matcher.match_prompt("search the web for rust programming");

        assert!(!matches.is_empty());
        assert_eq!(matches[0].category, IntentCategory::WebSearch);
    }

    #[test]
    fn test_pattern_matcher_email() {
        let matcher = PatternMatcher::new();
        let matches = matcher.match_prompt("send an email to test@example.com");

        assert!(!matches.is_empty());
        assert_eq!(matches[0].category, IntentCategory::Email);
    }

    #[test]
    fn test_entity_extraction_file_path() {
        let matcher = PatternMatcher::new();
        let entities = matcher.extract_entities("read the file at /Users/test/document.txt");

        assert!(entities.contains_key("file_path"));
    }

    #[test]
    fn test_entity_extraction_url() {
        let matcher = PatternMatcher::new();
        let entities = matcher.extract_entities("navigate to https://example.com/page");

        assert!(entities.contains_key("url"));
        assert_eq!(entities.get("url").unwrap(), "https://example.com/page");
    }

    #[test]
    fn test_entity_extraction_email() {
        let matcher = PatternMatcher::new();
        let entities = matcher.extract_entities("send email to user@example.com");

        assert!(entities.contains_key("email"));
        assert_eq!(entities.get("email").unwrap(), "user@example.com");
    }

    #[test]
    fn test_complexity_estimation_quick_win() {
        let matcher = PatternMatcher::new();
        let complexity =
            matcher.estimate_complexity("what is the weather", IntentCategory::Conversation);

        assert_eq!(complexity, Complexity::QuickWin);
    }

    #[test]
    fn test_complexity_estimation_long_running() {
        let matcher = PatternMatcher::new();
        let complexity = matcher.estimate_complexity(
            "analyze all files in the project and create a comprehensive report",
            IntentCategory::CodeTask,
        );

        assert_eq!(complexity, Complexity::LongRunning);
    }
}
